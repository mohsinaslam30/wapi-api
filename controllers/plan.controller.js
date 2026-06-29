import { Plan, Setting } from '../models/index.js';
import mongoose from 'mongoose';
import { StripeService, RazorpayService, getRazorpay, PayPalService } from '../utils/payment-gateway.service.js';


const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const DEFAULT_SORT_FIELD = 'sort_order';
const DEFAULT_SORT_ORDER = 1;
const MAX_LIMIT = 100;

const ALLOWED_SORT_FIELDS = [
    '_id',
    'name',
    'slug',
    'price',
    'billing_cycle',
    'sort_order',
    'is_featured',
    'is_active',
    'created_at',
    'updated_at'
];

const _syncPlanInternal = async (plan, force = false) => {
    if (plan.price <= 0) {
        console.log(`[SyncPlans] Skipping gateway sync for free plan: ${plan.slug}`);
        return false;
    }

    if (!plan.populated('currency') || !plan.populated('taxes')) {
        await plan.populate(['currency', 'taxes']);
    }

    const calculateTotalPrice = (p) => {
        let total = p.price;
        if (p.taxes && p.taxes.length > 0) {
            const totalTaxRate = p.taxes.reduce((sum, tax) => sum + (tax.rate || 0), 0);
            total = total * (1 + totalTaxRate / 100);
        }
        return total;
    };

    const planWithTotal = {
        ...plan.toObject(),
        price: calculateTotalPrice(plan)
    };

    const setting = await Setting.findOne().lean();
    let updated = false;

    if (setting?.is_stripe_active && (force || !plan.stripe_product_id || !plan.stripe_payment_link_url)) {
        try {
            console.log(`[SyncPlans] Syncing ${plan.slug} with Stripe...`);
            let stripeData;
            if (force || !plan.stripe_product_id) {
                stripeData = await StripeService.createProductPriceAndPaymentLink(planWithTotal);
            } else if (!plan.stripe_payment_link_url) {
                stripeData = await StripeService.createPriceAndPaymentLinkForExistingProduct(planWithTotal, plan.stripe_product_id);
            }

            if (stripeData) {
                if (stripeData.productId) plan.stripe_product_id = stripeData.productId;
                if (stripeData.priceId) plan.stripe_price_id = stripeData.priceId;
                if (stripeData.paymentLinkId) plan.stripe_payment_link_id = stripeData.paymentLinkId;
                if (stripeData.paymentLinkUrl) plan.stripe_payment_link_url = stripeData.paymentLinkUrl;
                updated = true;
                console.log(`[SyncPlans] Stripe sync successful for ${plan.slug}`);
            }
        } catch (err) {
            console.warn(`[SyncPlans] Stripe sync error for plan ${plan.slug}:`, err.message);
        }
    }

    if (setting?.is_razorpay_active && (force || !plan.razorpay_plan_id)) {
        try {
            console.log(`[SyncPlans] Syncing ${plan.slug} with Razorpay...`);
            const razorpayData = await RazorpayService.createPlan(planWithTotal);
            if (razorpayData && razorpayData.id) {
                plan.razorpay_plan_id = razorpayData.id;
                updated = true;
                console.log(`[SyncPlans] Razorpay sync successful for ${plan.slug}`);
            }
        } catch (err) {
            console.warn(`[SyncPlans] Razorpay sync error for plan ${plan.slug}:`, err.message);
        }
    }

    if (setting?.is_paypal_active && (force || !plan.paypal_plan_id)) {
        try {
            console.log(`[SyncPlans] Syncing ${plan.slug} with PayPal...`);
            const productData = await PayPalService.createProduct(planWithTotal);
            if (productData && productData.id) {
                const paypalPlanData = await PayPalService.createPlan(planWithTotal, productData.id);
                if (paypalPlanData && paypalPlanData.id) {
                    plan.paypal_plan_id = paypalPlanData.id;
                    updated = true;
                    console.log(`[SyncPlans] PayPal sync successful for ${plan.slug}`);
                }
            }
        } catch (err) {
            console.warn(`[SyncPlans] PayPal sync error for plan ${plan.slug}:`, err.message);
        }
    }

    if (updated) {
        await plan.save();
    }
    return updated;
};

const SORT_ORDER = {
    ASC: 1,
    DESC: -1
};

const BILLING_CYCLES = ['free Trial', 'monthly', 'yearly', 'lifetime'];

const parsePaginationParams = (query) => {
    const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
    const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(query.limit) || DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    return { page, limit, skip };
};


const parseSortParams = (query) => {
    const sortField = ALLOWED_SORT_FIELDS.includes(query.sort_by)
        ? query.sort_by
        : DEFAULT_SORT_FIELD;

    const sortOrder = query.sort_order?.toUpperCase() === 'DESC'
        ? SORT_ORDER.DESC
        : SORT_ORDER.ASC;

    return { sortField, sortOrder };
};


const buildSearchQuery = (searchTerm) => {
    if (!searchTerm || searchTerm.trim() === '') {
        return {};
    }

    const sanitizedSearch = searchTerm.trim();

    return {
        $or: [
            { name: { $regex: sanitizedSearch, $options: 'i' } },
            { slug: { $regex: sanitizedSearch, $options: 'i' } },
            { description: { $regex: sanitizedSearch, $options: 'i' } }
        ]
    };
};


const createCaseInsensitivePattern = (text) => {
    const escapedText = text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escapedText}$`, 'i');
};


const generateSlug = (name) => {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '');
};


const validatePlanData = (data) => {
    const { name, price, billing_cycle, features } = data || {};
    const errors = [];

    if (!name || name.trim() === '') {
        errors.push('Plan name is required and cannot be empty');
    }

    if (price === undefined || price === null) {
        errors.push('Price is required');
    } else if (typeof price !== 'number' || price < 0) {
        errors.push('Price must be a non-negative number');
    }

    if (!billing_cycle || !BILLING_CYCLES.includes(billing_cycle)) {
        errors.push(`Billing cycle must be one of: ${BILLING_CYCLES.join(', ')}`);
    }

    if (features) {
        const numericFeatures = [
            'contacts', 'template_bots', 'message_bots', 'campaigns',
            'ai_prompts', 'staff', 'conversations',
            'bot_flow', 'broadcast_messages', 'custom_fields', 'tags',
            'forms', 'whatsapp_calling', 'teams', 'appointment_bookings',
            'facebookAds_campaign', 'kanban_funnels', 'segments', 'workspaces', 'facebook_lead',
            'document_file_limit', 'audio_file_limit', 'video_file_limit',
            'image_file_limit', 'multiple_file_share_limit',
            'google_accounts', 'quick_replies', 'facebook_leads'
        ];

        numericFeatures.forEach(feature => {
            if (features[feature] !== undefined &&
                (typeof features[feature] !== 'number' || features[feature] < 0)) {
                errors.push(`${feature} must be a non-negative number`);
            }
        });

        const booleanFeatures = [
            'rest_api', 'whatsapp_webhook', 'auto_replies',
            'analytics', 'priority_support',
            'omnichannel_facebook',
            'fb_chat', 'fb_automation', 'fb_campaign', 'fb_template', 'fb_keyword', 'fb_comment_dm', 'fb_retrigger',
            'omnichannel_instagram',
            'ig_chat', 'ig_automation', 'ig_campaign', 'ig_template', 'ig_keyword', 'ig_comment_dm', 'ig_retrigger',
            'omnichannel_telegram',
            'tg_chat', 'tg_automation', 'tg_campaign', 'tg_template', 'tg_keyword',
            'omnichannel_twitter',
            'tw_chat', 'tw_automation', 'tw_campaign', 'tw_template', 'tw_keyword'
        ];

        booleanFeatures.forEach(feature => {
            if (features[feature] !== undefined && typeof features[feature] !== 'boolean') {
                errors.push(`${feature} must be a boolean value`);
            }
        });
    }

    if (data.enabled_features) {
        Object.keys(data.enabled_features).forEach(feature => {
            if (typeof data.enabled_features[feature] !== 'boolean') {
                errors.push(`Enabled feature ${feature} must be a boolean value`);
            }
        });
    }

    if (data.taxes && !Array.isArray(data.taxes)) {
        errors.push('Taxes must be an array of IDs');
    }

    return {
        isValid: errors.length === 0,
        errors,
        message: errors.join(', ')
    };
};


const validateAndFilterIds = (ids) => {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return {
            isValid: false,
            message: 'Plan IDs array is required and must not be empty',
            validIds: []
        };
    }

    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

    if (validIds.length === 0) {
        return {
            isValid: false,
            message: 'No valid plan IDs provided',
            validIds: []
        };
    }

    return {
        isValid: true,
        validIds
    };
};

const appendPaymentGatewaysToPlan = (plan, setting) => {
    const allowed = [];
    if (plan.stripe_product_id && plan.stripe_price_id) {
        allowed.push('stripe');
    }
    if (plan.razorpay_plan_id) {
        allowed.push('razorpay');
    }
    if (plan.paypal_plan_id) {
        allowed.push('paypal');
    }
    if (setting?.enable_cash) {
        allowed.push('cash');
    }
    return { ...plan, allowed_payment_gateways: allowed };
};

export const getAllPlans = async (req, res) => {
    try {
        const { page, limit, skip } = parsePaginationParams(req.query);
        const { sortField, sortOrder } = parseSortParams(req.query);
        const searchTerm = req.query.search || '';
        const { billing_cycle, is_active, is_featured } = req.query;

        let searchQuery = buildSearchQuery(searchTerm);

        if (billing_cycle && BILLING_CYCLES.includes(billing_cycle)) {
            searchQuery.billing_cycle = billing_cycle;
        }

        if (is_active !== undefined) {
            searchQuery.is_active = is_active === 'true';
        }

        if (is_featured !== undefined) {
            searchQuery.is_featured = is_featured === 'true';
        }

        searchQuery.deleted_at = null;

        const totalCount = await Plan.countDocuments(searchQuery);

        const plans = await Plan.find(searchQuery)
            .populate('currency')
            .sort({ [sortField]: sortOrder })
            .populate('currency')
            .skip(skip)
            .limit(limit)
            .lean();

        const setting = await Setting.findOne().lean();
        const enhancedPlans = plans.map(p => appendPaymentGatewaysToPlan(p, setting));

        return res.status(200).json({
            success: true,
            data: {
                plans: enhancedPlans,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    totalItems: totalCount,
                    itemsPerPage: limit
                }
            }
        });
    } catch (error) {
        console.error('Error retrieving plans:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve plans',
            error: error.message
        });
    }
};


export const getPlanById = async (req, res) => {
    try {
        const { id } = req.params;

        let plan;

        if (mongoose.Types.ObjectId.isValid(id)) {
            plan = await Plan.findOne({ _id: id, deleted_at: null }).populate('currency').lean();
        } else {
            plan = await Plan.findOne({ slug: id, deleted_at: null }).populate('currency').lean();
        }

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Plan not found'
            });
        }

        const setting = await Setting.findOne().lean();
        const enhancedPlan = appendPaymentGatewaysToPlan(plan, setting);

        return res.status(200).json({
            success: true,
            data: enhancedPlan
        });
    } catch (error) {
        console.error('Error retrieving plan:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve plan',
            error: error.message
        });
    }
};

export const createPlan = async (req, res) => {
    try {
        const planData = req.body || {};

        const validation = validatePlanData(planData);

        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.message,
                errors: validation.errors
            });
        }

        const slug = planData.slug || generateSlug(planData.name);

        const existingPlan = await Plan.findOne({
            slug: createCaseInsensitivePattern(slug),
            deleted_at: null
        });

        if (existingPlan) {
            return res.status(409).json({
                success: false,
                message: 'Plan with this slug already exists'
            });
        }

        const newPlan = await Plan.create({
            name: planData.name.trim(),
            slug: slug,
            description: planData.description?.trim() || null,
            price: planData.price,
            currency: planData.currency || null,
            billing_cycle: planData.billing_cycle,
            trial_days: planData.trial_days || 0,
            is_featured: planData.is_featured || false,
            is_active: planData.is_active !== undefined ? planData.is_active : true,
            sort_order: planData.sort_order || 0,
            features: planData.features || {},
            enabled_features: planData.enabled_features || {},
            taxes: planData.taxes || [],
            razorpay_plan_id: planData.razorpay_plan_id?.trim() || null
        });

        await newPlan.populate(['currency', 'taxes']);

        await newPlan.save();

        await _syncPlanInternal(newPlan, true);

        return res.status(201).json({
            success: true,
            message: 'Plan created successfully',
            data: newPlan
        });
    } catch (error) {
        console.error('Error creating plan:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create plan',
            error: error.message
        });
    }
};


export const updatePlan = async (req, res) => {
    try {
        const { id } = req.params;
        const planData = req.body || {};

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid plan ID is required'
            });
        }

        const existingPlan = await Plan.findOne({ _id: id, deleted_at: null });
        if (!existingPlan) {
            return res.status(404).json({
                success: false,
                message: 'Plan not found'
            });
        }

        const validation = validatePlanData(planData);

        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.message,
                errors: validation.errors
            });
        }

        const slug = planData.slug || (planData.name !== existingPlan.name
            ? generateSlug(planData.name)
            : existingPlan.slug);

        const duplicatePlan = await Plan.findOne({
            slug: createCaseInsensitivePattern(slug),
            _id: { $ne: id },
            deleted_at: null
        });

        if (duplicatePlan) {
            return res.status(409).json({
                success: false,
                message: 'Plan with this slug already exists'
            });
        }

        const priceChanged = planData.price !== existingPlan.price;
        const currencyChanged = planData.currency && existingPlan.currency &&
            planData.currency.toString() !== existingPlan.currency.toString();
        const billingCycleChanged = planData.billing_cycle !== existingPlan.billing_cycle;
        let stripePricingChanged = priceChanged || currencyChanged || billingCycleChanged;
        let razorpayPricingChanged = priceChanged || currencyChanged || billingCycleChanged;
        let paypalPricingChanged = priceChanged || currencyChanged || billingCycleChanged;

        existingPlan.name = planData.name.trim();
        existingPlan.slug = slug;
        existingPlan.description = planData.description?.trim() || null;
        existingPlan.price = planData.price;
        if (planData.currency) {
            existingPlan.currency = planData.currency;
        }
        existingPlan.billing_cycle = planData.billing_cycle;
        existingPlan.trial_days = planData.trial_days || 0;
        existingPlan.is_featured = planData.is_featured || false;
        existingPlan.sort_order = planData.sort_order || 0;

        if (planData.is_active !== undefined) {
            existingPlan.is_active = planData.is_active;
        }

        if (planData.features) {
            existingPlan.features = { ...existingPlan.features, ...planData.features };
        }

        if (planData.enabled_features) {
            existingPlan.enabled_features = { ...existingPlan.enabled_features, ...planData.enabled_features };
        }

        if (planData.stripe_price_id !== undefined) {
            existingPlan.stripe_price_id = planData.stripe_price_id?.trim() || null;
        }
        if (planData.stripe_product_id !== undefined) {
            existingPlan.stripe_product_id = planData.stripe_product_id?.trim() || null;
        }
        if (planData.razorpay_plan_id !== undefined) {
            existingPlan.razorpay_plan_id = planData.razorpay_plan_id?.trim() || null;
        }
        if (planData.paypal_plan_id !== undefined) {
            existingPlan.paypal_plan_id = planData.paypal_plan_id?.trim() || null;
        }

        if (planData.taxes !== undefined) {
            existingPlan.taxes = planData.taxes;
        }

        await existingPlan.save();

        if (stripePricingChanged || razorpayPricingChanged || paypalPricingChanged) {
            await _syncPlanInternal(existingPlan, true);
        }

        return res.status(200).json({
            success: true,
            message: 'Plan updated successfully',
            data: existingPlan
        });
    } catch (error) {
        console.error('Error updating plan:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update plan',
            error: error.message
        });
    }
};


export const updatePlanStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body || {};

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid plan ID is required'
            });
        }

        if (is_active === undefined || typeof is_active !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'is_active must be a boolean value'
            });
        }

        const plan = await Plan.findOne({ _id: id, deleted_at: null });
        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Plan not found'
            });
        }

        plan.is_active = is_active;
        await plan.save();

        return res.status(200).json({
            success: true,
            message: `Plan ${is_active ? 'activated' : 'deactivated'} successfully`,
            data: {
                id: plan._id,
                is_active: plan.is_active
            }
        });
    } catch (error) {
        console.error('Error updating plan status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update plan status',
            error: error.message
        });
    }
};


export const deletePlan = async (req, res) => {
    try {
        const { ids } = req.body || {};

        const validation = validateAndFilterIds(ids);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        const { validIds } = validation;

        const existingPlans = await Plan.find({
            _id: { $in: validIds },
            deleted_at: null
        });

        if (existingPlans.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No plans found with the provided IDs'
            });
        }

        const foundIds = existingPlans.map(plan => plan._id.toString());
        const notFoundIds = validIds.filter(id => !foundIds.includes(id.toString()));

        const deleteResult = await Plan.updateMany(
            { _id: { $in: foundIds } },
            { $set: { deleted_at: new Date() } }
        );

        const response = {
            success: true,
            message: `${deleteResult.modifiedCount} plan(s) deleted successfully`,
            data: {
                deletedCount: deleteResult.modifiedCount,
                deletedIds: foundIds
            }
        };

        if (notFoundIds.length > 0) {
            response.data.notFoundIds = notFoundIds;
            response.message += `, ${notFoundIds.length} plan(s) not found`;
        }

        return res.status(200).json(response);
    } catch (error) {
        console.error('Error deleting plans:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete plans',
            error: error.message
        });
    }
};


export const getActivePlans = async (req, res) => {
    try {
        const { billing_cycle } = req.query;

        const query = {
            is_active: true,
            deleted_at: null
        };

        if (billing_cycle && BILLING_CYCLES.includes(billing_cycle)) {
            query.billing_cycle = billing_cycle;
        }

        const plans = await Plan.find(query)
            .sort({ sort_order: 1, price: 1 })
            .populate('currency')
            .lean();

        const setting = await Setting.findOne().lean();
        const enhancedPlans = plans.map(p => appendPaymentGatewaysToPlan(p, setting));

        return res.status(200).json({
            success: true,
            data: {
                plans: enhancedPlans,
                total: enhancedPlans.length
            }
        });
    } catch (error) {
        console.error('Error retrieving active plans:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve plans',
            error: error.message
        });
    }
};

export const getFeaturedPlans = async (req, res) => {
    try {
        const plans = await Plan.find({
            is_featured: true,
            is_active: true,
            deleted_at: null
        })
            .sort({ sort_order: 1 })
            .populate('currency')
            .lean();

        const setting = await Setting.findOne().lean();
        const enhancedPlans = plans.map(p => appendPaymentGatewaysToPlan(p, setting));

        return res.status(200).json({
            success: true,
            data: {
                plans: enhancedPlans,
                total: enhancedPlans.length
            }
        });
    } catch (error) {
        console.error('Error retrieving featured plans:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve featured plans',
            error: error.message
        });
    }
};

export const syncPlansToGateways = async (req, res) => {
    try {
        const { id, force } = req.body || {};
        let plans = [];

        if (id) {
            const plan = await Plan.findById(id).populate(['currency', 'taxes']);
            if (!plan) {
                return res.status(404).json({ success: false, message: 'Plan not found' });
            }
            plans = [plan];
        } else {
            plans = await Plan.find({ deleted_at: null, is_active: true }).populate(['currency', 'taxes']);
        }

        let syncCount = 0;
        for (const plan of plans) {
            const updated = await _syncPlanInternal(plan, force);
            if (updated) syncCount++;
        }

        return res.status(200).json({
            success: true,
            message: id ? 'Plan sync completed.' : `Sync completed for ${syncCount} plans.`,
            syncCount,
            data: id ? plans[0] : plans
        });
    } catch (error) {
        console.error('Error syncing plans to gateways:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to synchronize plans',
            error: error.message
        });
    }
};

export default {
    getAllPlans,
    getPlanById,
    createPlan,
    updatePlan,
    updatePlanStatus,
    deletePlan,
    getActivePlans,
    getFeaturedPlans,
    syncPlansToGateways
};
