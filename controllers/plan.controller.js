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
    const { name, price, billing_cycle, features } = data;
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
            'facebookAds_campaign', 'kanban_funnels', 'segments'
        ];

        numericFeatures.forEach(feature => {
            if (features[feature] !== undefined &&
                (typeof features[feature] !== 'number' || features[feature] < 0)) {
                errors.push(`${feature} must be a non-negative number`);
            }
        });

        const booleanFeatures = [
            'rest_api', 'whatsapp_webhook', 'auto_replies',
            'analytics', 'priority_support'
        ];

        booleanFeatures.forEach(feature => {
            if (features[feature] !== undefined && typeof features[feature] !== 'boolean') {
                errors.push(`${feature} must be a boolean value`);
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
        const planData = req.body;

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
            taxes: planData.taxes || [],
            razorpay_plan_id: planData.razorpay_plan_id?.trim() || null
        });

        await newPlan.populate(['currency', 'taxes']);

        const calculateTotalPrice = (plan) => {
            let total = plan.price;
            if (plan.taxes && plan.taxes.length > 0) {
                const totalTaxRate = plan.taxes.reduce((sum, tax) => sum + (tax.rate || 0), 0);
                total = total * (1 + totalTaxRate / 100);
            }
            return total;
        };

        const planWithTotal = {
            ...newPlan.toObject(),
            price: calculateTotalPrice(newPlan)
        };

        let warnings = [];

        try {
            const stripeResult = await StripeService.createProductPriceAndPaymentLink(planWithTotal);
            if (stripeResult) {
                newPlan.stripe_product_id = stripeResult.productId;
                newPlan.stripe_price_id = stripeResult.priceId;
                newPlan.stripe_payment_link_id = stripeResult.paymentLinkId;
                newPlan.stripe_payment_link_url = stripeResult.paymentLinkUrl;
            } else if (process.env.STRIPE_SECRET_KEY) {
                warnings.push('Stripe plan creation failed');
            }
        } catch (stripeErr) {
            console.error('Error creating Stripe plan (plan created without Stripe):', stripeErr);
            warnings.push(`Stripe plan creation failed: ${stripeErr.message}`);
        }

        if (getRazorpay()) {
            try {
                const razorpayPlan = await RazorpayService.createPlan(planWithTotal);
                if (razorpayPlan && razorpayPlan.id) {
                    newPlan.razorpay_plan_id = razorpayPlan.id;
                }
            } catch (razorpayErr) {
                console.error('Error creating Razorpay plan (plan created without Razorpay):', razorpayErr);
                warnings.push(`Razorpay plan creation failed: ${razorpayErr.message}`);
            }
        }

        try {
            const paypalProduct = await PayPalService.createProduct(planWithTotal);
            if (paypalProduct && paypalProduct.id) {
                const paypalPlan = await PayPalService.createPlan(planWithTotal, paypalProduct.id);
                if (paypalPlan && paypalPlan.id) {
                    newPlan.paypal_plan_id = paypalPlan.id;
                }
            }
        } catch (paypalErr) {
            console.error('Error creating PayPal plan (plan created without PayPal):', paypalErr);
            warnings.push(`PayPal plan creation failed: ${paypalErr.message}`);
        }

        await newPlan.save();

        let responseMessage = 'Plan created successfully';
        if (warnings.length > 0) {
            responseMessage += `. Warnings: ${warnings.join(', ')}`;
        }

        return res.status(201).json({
            success: true,
            message: responseMessage,
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
        const planData = req.body;

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

        let warnings = [];

        const taxesChanged = planData.taxes !== undefined;
        stripePricingChanged = priceChanged || currencyChanged || billingCycleChanged || taxesChanged;
        razorpayPricingChanged = priceChanged || currencyChanged || billingCycleChanged || taxesChanged;

        if (stripePricingChanged && existingPlan.stripe_product_id && process.env.STRIPE_SECRET_KEY) {
            await existingPlan.populate(['currency', 'taxes']);

            const calculateTotalPrice = (plan) => {
                let total = plan.price;
                if (plan.taxes && plan.taxes.length > 0) {
                    const totalTaxRate = plan.taxes.reduce((sum, tax) => sum + (tax.rate || 0), 0);
                    total = total * (1 + totalTaxRate / 100);
                }
                return total;
            };

            const planWithTotal = {
                ...existingPlan.toObject(),
                price: calculateTotalPrice(existingPlan)
            };

            try {
                const stripeResult = await StripeService.createPriceAndPaymentLinkForExistingProduct(
                    planWithTotal,
                    existingPlan.stripe_product_id
                );
                if (stripeResult) {
                    existingPlan.stripe_price_id = stripeResult.priceId;
                    existingPlan.stripe_payment_link_id = stripeResult.paymentLinkId;
                    existingPlan.stripe_payment_link_url = stripeResult.paymentLinkUrl;
                } else {
                    warnings.push('Stripe plan update failed');
                }
            } catch (stripeErr) {
                console.error('Error updating Stripe plan (plan updated without Stripe):', stripeErr);
                warnings.push(`Stripe plan update failed: ${stripeErr.message}`);
            }
        }

        if (razorpayPricingChanged && getRazorpay()) {
            await existingPlan.populate(['currency', 'taxes']);

            const calculateTotalPrice = (plan) => {
                let total = plan.price;
                if (plan.taxes && plan.taxes.length > 0) {
                    const totalTaxRate = plan.taxes.reduce((sum, tax) => sum + (tax.rate || 0), 0);
                    total = total * (1 + totalTaxRate / 100);
                }
                return total;
            };

            const planWithTotal = {
                ...existingPlan.toObject(),
                price: calculateTotalPrice(existingPlan)
            };

            try {
                const razorpayPlan = await RazorpayService.createPlan(planWithTotal);
                if (razorpayPlan && razorpayPlan.id) {
                    existingPlan.razorpay_plan_id = razorpayPlan.id;
                }
            } catch (razorpayErr) {
                console.error('Error creating new Razorpay plan on update:', razorpayErr);
                warnings.push(`Razorpay plan update failed: ${razorpayErr.message}`);
            }
        }

        const paypalPricingChanged = priceChanged || currencyChanged || billingCycleChanged || taxesChanged;
        if (paypalPricingChanged) {
            try {
                const paypalProduct = await PayPalService.createProduct(planWithTotal);
                if (paypalProduct && paypalProduct.id) {
                    const paypalPlan = await PayPalService.createPlan(planWithTotal, paypalProduct.id);
                    if (paypalPlan && paypalPlan.id) {
                        existingPlan.paypal_plan_id = paypalPlan.id;
                    }
                }
            } catch (paypalErr) {
                console.error('Error updating PayPal plan:', paypalErr);
                warnings.push(`PayPal plan update failed: ${paypalErr.message}`);
            }
        }

        await existingPlan.save();

        let responseMessage = 'Plan updated successfully';
        if (warnings.length > 0) {
            responseMessage += `. Warnings: ${warnings.join(', ')}`;
        }

        return res.status(200).json({
            success: true,
            message: responseMessage,
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
        const { is_active } = req.body;

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
        const { ids } = req.body;

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
        const plans = await Plan.find({ deleted_at: null, is_active: true }).populate(['currency', 'taxes']);
        const setting = await Setting.findOne().lean();

        const results = {
            processed: 0,
            stripe: { synced: 0, failed: 0 },
            razorpay: { synced: 0, failed: 0 },
            paypal: { synced: 0, failed: 0 }
        };

        const calculateTotalPrice = (plan) => {
            let total = plan.price;
            if (plan.taxes && plan.taxes.length > 0) {
                const totalTaxRate = plan.taxes.reduce((sum, tax) => sum + (tax.rate || 0), 0);
                total = total * (1 + totalTaxRate / 100);
            }
            return total;
        };

        for (const plan of plans) {
            results.processed++;
            const planWithTotal = {
                ...plan.toObject(),
                price: calculateTotalPrice(plan)
            };

            if (setting?.is_stripe_active && (!plan.stripe_product_id || !plan.stripe_price_id)) {
                try {
                    const stripeResult = await StripeService.createProductPriceAndPaymentLink(planWithTotal);
                    if (stripeResult) {
                        plan.stripe_product_id = stripeResult.productId;
                        plan.stripe_price_id = stripeResult.priceId;
                        plan.stripe_payment_link_id = stripeResult.paymentLinkId;
                        plan.stripe_payment_link_url = stripeResult.paymentLinkUrl;
                        results.stripe.synced++;
                    } else {
                        results.stripe.failed++;
                    }
                } catch (err) {
                    console.error(`Stripe sync failed for plan ${plan.name}:`, err.message);
                    results.stripe.failed++;
                }
            }

            if (setting?.is_razorpay_active && !plan.razorpay_plan_id) {
                try {
                    const razorpayPlan = await RazorpayService.createPlan(planWithTotal);
                    if (razorpayPlan && razorpayPlan.id) {
                        plan.razorpay_plan_id = razorpayPlan.id;
                        results.razorpay.synced++;
                    } else {
                        results.razorpay.failed++;
                    }
                } catch (err) {
                    console.error(`Razorpay sync failed for plan ${plan.name}:`, err.message);
                    results.razorpay.failed++;
                }
            }

            if (setting?.is_paypal_active && !plan.paypal_plan_id) {
                try {
                    const paypalProduct = await PayPalService.createProduct(planWithTotal);
                    if (paypalProduct && paypalProduct.id) {
                        const paypalPlan = await PayPalService.createPlan(planWithTotal, paypalProduct.id);
                        if (paypalPlan && paypalPlan.id) {
                            plan.paypal_plan_id = paypalPlan.id;
                            results.paypal.synced++;
                        } else {
                            results.paypal.failed++;
                        }
                    } else {
                        results.paypal.failed++;
                    }
                } catch (err) {
                    console.error(`PayPal sync failed for plan ${plan.name}:`, err.message);
                    results.paypal.failed++;
                }
            }

            if (plan.isModified()) {
                await plan.save();
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Plan synchronization complete',
            data: results
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
