import { Subscription, AiPromptLog, Plan, PaymentHistory, User, Tag, Contact, Template, Campaign, CustomField, AutomationFlow, Team, Setting, Message, Form, WhatsappCallAgent, MessageBot, AppointmentBooking, KanbanFunnel, FacebookAdCampaign, Segment } from '../models/index.js';
import mongoose from 'mongoose';
import {
    StripeService,
    RazorpayService,
    PayPalService,
    calculatePeriodEnd
} from '../utils/payment-gateway.service.js';
import { generateInvoiceNumber } from '../utils/invoice-helper.js';
import { getExchangeRate, formatAmount } from '../utils/currency.service.js';
import { generateInvoicePDF } from '../utils/invoice-generator.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const SUBSCRIPTION_STATUS = ['active', 'trial', 'expired', 'cancelled', 'suspended', 'pending'];
const PAYMENT_STATUS = ['pending', 'paid', 'failed', 'refunded'];

const DEFAULT_SORT_FIELD = 'created_at';
const ALLOWED_SORT_FIELDS = ['status', 'started_at', 'current_period_end', 'amount_paid', 'created_at', 'updated_at'];

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

    const sortOrder = query.sort_order?.toLowerCase() === 'asc'
        ? 1
        : -1;

    return { sortField, sortOrder };
};


const buildPaymentHistoryAggregation = (matchQuery, skip, limit, sortField, sortOrder, searchParams = null) => {
    const pipeline = [
        { $match: matchQuery },
        {
            $lookup: {
                from: 'users',
                localField: 'user_id',
                foreignField: '_id',
                as: 'user'
            }
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'plans',
                localField: 'plan_id',
                foreignField: '_id',
                as: 'plan'
            }
        },
        { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'subscriptions',
                localField: 'subscription_id',
                foreignField: '_id',
                as: 'subscription'
            }
        },
        { $unwind: { path: '$subscription', preserveNullAndEmptyArrays: true } }
    ];

    if (searchParams && searchParams.active) {
        pipeline.push({
            $match: {
                $or: [
                    { transaction_id: searchParams.regex },
                    { invoice_number: searchParams.regex },
                    { notes: searchParams.regex },
                    { 'user.name': searchParams.regex },
                    { 'user.email': searchParams.regex },
                    { 'plan.name': searchParams.regex },
                    { payment_gateway: searchParams.regex }
                ]
            }
        });
    }

    pipeline.push(
        {
            $project: {
                _id: 1,
                user_id: 1,
                subscription_id: 1,
                plan_id: 1,
                amount: 1,
                currency: 1,
                payment_method: 1,
                payment_status: 1,
                transaction_id: 1,
                payment_gateway: 1,
                payment_response: 1,
                invoice_number: 1,
                invoice_url: 1,
                paid_at: 1,
                refunded_at: 1,
                notes: 1,
                created_at: 1,
                updated_at: 1,
                user: {
                    _id: '$user._id',
                    name: '$user.name',
                    email: '$user.email',
                    phone: '$user.phone'
                },
                plan: {
                    _id: '$plan._id',
                    name: '$plan.name',
                    slug: '$plan.slug',
                    price: '$plan.price',
                    billing_cycle: '$plan.billing_cycle'
                },
                subscription: {
                    _id: '$subscription._id',
                    status: '$subscription.status',
                    payment_gateway: '$subscription.payment_gateway',
                    payment_status: '$subscription.payment_status',
                    started_at: '$subscription.started_at',
                    current_period_start: '$subscription.current_period_start',
                    current_period_end: '$subscription.current_period_end'
                }
            }
        },
        { $sort: { [sortField]: sortOrder } },
        { $skip: skip },
        { $limit: limit }
    );

    return pipeline;
};


export const getSubscriptionPayments = async (req, res) => {
    try {
        const { page, limit, skip } = parsePaginationParams(req.query);
        const { sortField, sortOrder } = parseSortParams(req.query);

        const {
            user_id,
            subscription_id,
            plan_id,
            payment_status,
            payment_gateway,
            payment_method,
            start_date,
            end_date,
            search
        } = req.query;

        const matchQuery = { deleted_at: null };

        if (user_id && mongoose.Types.ObjectId.isValid(user_id)) {
            matchQuery.user_id = new mongoose.Types.ObjectId(user_id);
        }

        if (subscription_id && mongoose.Types.ObjectId.isValid(subscription_id)) {
            matchQuery.subscription_id = new mongoose.Types.ObjectId(subscription_id);
        }

        if (plan_id && mongoose.Types.ObjectId.isValid(plan_id)) {
            matchQuery.plan_id = new mongoose.Types.ObjectId(plan_id);
        }

        if (payment_status && PAYMENT_STATUS.includes(payment_status)) {
            matchQuery.payment_status = payment_status;
        }

        if (payment_gateway) {
            matchQuery.payment_gateway = payment_gateway;
        }

        if (payment_method) {
            matchQuery.payment_method = payment_method;
        }

        if (start_date || end_date) {
            const dateFilter = {};
            if (start_date) {
                const from = new Date(start_date);
                if (!Number.isNaN(from.getTime())) {
                    dateFilter.$gte = from;
                }
            }
            if (end_date) {
                const to = new Date(end_date);
                if (!Number.isNaN(to.getTime())) {
                    dateFilter.$lte = to;
                }
            }

            if (Object.keys(dateFilter).length > 0) {
                matchQuery.paid_at = dateFilter;
            }
        }

        const searchParams = { active: false };
        if (search && String(search).trim()) {
            searchParams.active = true;
            searchParams.regex = new RegExp(String(search).trim(), 'i');
        }

        const pipeline = buildPaymentHistoryAggregation(matchQuery, skip, limit, sortField, sortOrder, searchParams);

        let totalCount = 0;
        if (searchParams.active) {
            const countPipeline = [...pipeline];
            const countStages = pipeline.filter(s => !s.$skip && !s.$limit && !s.$sort && !s.$project);
            countStages.push({ $count: 'total' });
            const countResult = await PaymentHistory.aggregate(countStages);
            totalCount = countResult[0]?.total || 0;
        } else {
            totalCount = await PaymentHistory.countDocuments(matchQuery);
        }

        const payments = await PaymentHistory.aggregate(pipeline);

        const setting = await Setting.findOne().populate('default_currency').lean();
        const defaultCurrencyCode = setting?.default_currency?.code || 'INR';

        for (let payment of payments) {
            const rate = await getExchangeRate(payment.currency || 'INR', defaultCurrencyCode);
            if (payment.amount != null) payment.amount = formatAmount(payment.amount * rate);
            if (payment.plan && payment.plan.price != null) payment.plan.price = formatAmount(payment.plan.price * rate);
            payment.currency = defaultCurrencyCode;
        }

        return res.status(200).json({
            success: true,
            data: {
                payments,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    totalItems: totalCount,
                    itemsPerPage: limit
                }
            }
        });
    } catch (error) {
        console.error('Error retrieving subscription payments:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve subscription payments',
            error: error.message
        });
    }
};


const buildSubscriptionAggregation = (matchQuery, skip, limit, sortField, sortOrder, searchParams = null) => {
    const pipeline = [
        { $match: matchQuery },
        {
            $lookup: {
                from: 'users',
                localField: 'user_id',
                foreignField: '_id',
                as: 'user'
            }
        },
        { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
        {
            $lookup: {
                from: 'plans',
                localField: 'plan_id',
                foreignField: '_id',
                as: 'plan'
            }
        },
        { $unwind: { path: '$plan', preserveNullAndEmptyArrays: true } }
    ];

    if (searchParams && searchParams.active) {
        pipeline.push({
            $match: {
                $or: [
                    { transaction_id: searchParams.regex },
                    { payment_reference: searchParams.regex },
                    { 'user.name': searchParams.regex },
                    { 'user.email': searchParams.regex },
                    { 'plan.name': searchParams.regex }
                ]
            }
        });
    }

    pipeline.push(
        {
            $project: {
                _id: 1,
                status: 1,
                started_at: 1,
                trial_ends_at: 1,
                current_period_start: 1,
                current_period_end: 1,
                expires_at: 1,
                cancelled_at: 1,
                payment_gateway: 1,
                payment_method: 1,
                payment_status: 1,
                transaction_id: 1,
                payment_reference: 1,
                approved_by: 1,
                approved_at: 1,
                amount_paid: 1,
                currency: 1,
                usage: 1,
                auto_renew: 1,
                created_at: 1,
                updated_at: 1,
                duration: 1,
                user: {
                    _id: '$user._id',
                    name: '$user.name',
                    email: '$user.email',
                    phone: '$user.phone'
                },
                plan: {
                    _id: '$plan._id',
                    name: '$plan.name',
                    slug: '$plan.slug',
                    price: '$plan.price',
                    billing_cycle: '$plan.billing_cycle',
                    features: '$plan.features'
                }
            }
        },
        { $sort: { [sortField]: sortOrder } },
        { $skip: skip },
        { $limit: limit }
    );

    return pipeline;
};

export const getAllSubscriptions = async (req, res) => {
    try {
        const { page, limit, skip } = parsePaginationParams(req.query);
        const { sortField, sortOrder } = parseSortParams(req.query);
        const { status, user_id, is_expiring_soon, search } = req.query;

        let matchQuery = { deleted_at: null };

        if (status && SUBSCRIPTION_STATUS.includes(status)) {
            matchQuery.status = status;
        }

        if (user_id && mongoose.Types.ObjectId.isValid(user_id)) {
            matchQuery.user_id = new mongoose.Types.ObjectId(user_id);
        }

        if (is_expiring_soon === 'true') {
            const now = new Date();
            const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            matchQuery.current_period_end = { $lte: next7Days, $gte: now };
            matchQuery.status = { $in: ['active', 'trial'] };
        }

        const searchParams = { active: false };
        if (search && String(search).trim()) {
            searchParams.active = true;
            searchParams.regex = new RegExp(String(search).trim(), 'i');
        }

        const pipeline = buildSubscriptionAggregation(matchQuery, skip, limit, sortField, sortOrder, searchParams);

        let totalCount = 0;
        if (searchParams.active) {
            const countStages = pipeline.filter(s => !s.$skip && !s.$limit && !s.$sort && !s.$project);
            countStages.push({ $count: 'total' });
            const countResult = await Subscription.aggregate(countStages);
            totalCount = countResult[0]?.total || 0;
        } else {
            totalCount = await Subscription.countDocuments(matchQuery);
        }

        const subscriptions = await Subscription.aggregate(pipeline);

        const setting = await Setting.findOne().populate('default_currency').lean();
        const defaultCurrencyCode = setting?.default_currency?.code || 'INR';

        for (let sub of subscriptions) {
            const rate = await getExchangeRate(sub.currency || 'INR', defaultCurrencyCode);
            if (sub.amount_paid != null) sub.amount_paid = formatAmount(sub.amount_paid * rate);
            if (sub.plan && sub.plan.price != null) sub.plan.price = formatAmount(sub.plan.price * rate);
            sub.currency = defaultCurrencyCode;
        }

        return res.status(200).json({
            success: true,
            data: {
                subscriptions,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    totalItems: totalCount,
                    itemsPerPage: limit
                }
            }
        });
    } catch (error) {
        console.error('Error retrieving subscriptions:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve subscriptions',
            error: error.message
        });
    }
};


export const getPendingManualSubscriptions = async (req, res) => {
    try {
        const { page, limit, skip } = parsePaginationParams(req.query);

        const matchQuery = {
            deleted_at: null,
            payment_gateway: 'manual',
            status: 'pending'
        };

        const totalCount = await Subscription.countDocuments(matchQuery);
        const { sortField, sortOrder } = parseSortParams(req.query);
        const pipeline = buildSubscriptionAggregation(matchQuery, skip, limit, sortField, sortOrder);
        const subscriptions = await Subscription.aggregate(pipeline);

        return res.status(200).json({
            success: true,
            data: {
                subscriptions,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    totalItems: totalCount,
                    itemsPerPage: limit
                }
            }
        });
    } catch (error) {
        console.error('Error retrieving pending manual subscriptions:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve pending manual subscriptions',
            error: error.message
        });
    }
};


export const approveManualSubscription = async (req, res) => {
    try {
        const { id } = req.params;
        const adminUserId = req.user._id;

        const subscription = await Subscription.findOne({
            _id: id,
            payment_gateway: 'manual',
            status: 'pending',
            deleted_at: null
        }).populate('plan_id');

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'Pending manual subscription not found'
            });
        }

        subscription.status = 'active';
        subscription.payment_status = 'paid';

        let totalAmount = subscription.plan_id?.price ?? 0;
        if (subscription.plan_id?.taxes && subscription.plan_id.taxes.length > 0) {
            const planWithTaxes = await Plan.findById(subscription.plan_id._id).populate('taxes');
            const totalTaxRate = planWithTaxes.taxes.reduce((sum, tax) => sum + (tax.rate || 0), 0);
            totalAmount = totalAmount * (1 + totalTaxRate / 100);
        }

        subscription.amount_paid = formatAmount(totalAmount);
        subscription.approved_by = adminUserId;
        subscription.approved_at = new Date();
        subscription.auto_renew = false;
        await subscription.save();

        await PaymentHistory.create({
            user_id: subscription.user_id,
            subscription_id: subscription._id,
            plan_id: subscription.plan_id._id,
            amount: subscription.amount_paid || 0,
            currency: subscription.currency,
            payment_method: subscription.payment_method,
            payment_status: 'success',
            invoice_number: generateInvoiceNumber(),
            paid_at: subscription.approved_at
        });

        return res.status(200).json({
            success: true,
            message: 'Subscription approved successfully',
            data: subscription
        });
    } catch (error) {
        console.error('Error approving manual subscription:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to approve subscription',
            error: error.message
        });
    }
};

export const rejectManualSubscription = async (req, res) => {
    try {
        const { id } = req.params;

        const subscription = await Subscription.findOne({
            _id: id,
            payment_gateway: 'manual',
            status: 'pending',
            deleted_at: null
        });

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'Pending manual subscription not found'
            });
        }

        subscription.status = 'cancelled';
        subscription.payment_status = 'failed';
        subscription.cancelled_at = new Date();
        await subscription.save();

        return res.status(200).json({
            success: true,
            message: 'Subscription request rejected',
            data: subscription
        });
    } catch (error) {
        console.error('Error rejecting manual subscription:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to reject subscription',
            error: error.message
        });
    }
};

const PLAN_SENSITIVE_FIELDS = '-stripe_price_id -stripe_product_id -stripe_payment_link_id -stripe_payment_link_url -razorpay_plan_id';

const fetchDynamicUsage = async (userId) => {
    const [tagsCount, contactsCount, templatesCount, campaignsCount, customFieldsCount, staffCount, botFlowsCount, aiPromptCount, messagesCount, teamsCount, formsCount, whatsapp_callingCount, messageBotsCount, appointmentBookingsCount, userResult, kanbanFunnelCount, facebookAdCampaignCount, segmentCount] = await Promise.all([
        Tag.countDocuments({ created_by: userId, deleted_at: null }),
        Contact.countDocuments({ created_by: userId, deleted_at: null }),
        Template.countDocuments({ user_id: userId }),
        Campaign.countDocuments({ user_id: userId, deleted_at: null }),
        CustomField.countDocuments({ created_by: userId, deleted_at: null }),
        User.countDocuments({ created_by: userId }),
        AutomationFlow.countDocuments({ user_id: userId, deleted_at: null }),
        AiPromptLog.countDocuments({ user_id: userId, deleted_at: null }),
        Message.countDocuments({ user_id: userId, deleted_at: null }),
        Team.countDocuments({ user_id: userId, deleted_at: null }),
        Form.countDocuments({ user_id: userId, deleted_at: null }),
        WhatsappCallAgent.countDocuments({ user_id: userId, deleted_at: null }),
        MessageBot.countDocuments({ user_id: userId, deleted_at: null }),
        AppointmentBooking.countDocuments({ user_id: userId, deleted_at: null }),
        User.findById(userId).select('storage_used').lean(),
        KanbanFunnel.countDocuments({ userId: userId, deleted_at: null }),
        FacebookAdCampaign.countDocuments({ user_id: userId, deleted_at: null }),
        Segment.countDocuments({ user_id: userId, deleted_at: null }),
    ]);

    const storageUsedMB = parseFloat(((userResult?.storage_used || 0) / (1024 * 1024)).toFixed(2));

    return {
        tags_used: tagsCount,
        contacts_used: contactsCount,
        template_bots_used: templatesCount,
        campaigns_used: campaignsCount,
        custom_fields_used: customFieldsCount,
        staff_used: staffCount,
        bot_flow_used: botFlowsCount,
        message_bots_used: botFlowsCount,
        ai_prompts_used: aiPromptCount,
        conversations_used: messagesCount,
        teams_used: teamsCount,
        forms_used: formsCount,
        whatsapp_calling_used: whatsapp_callingCount,
        message_bots_used: messageBotsCount,
        appointment_bookings_used: appointmentBookingsCount,
        storage_used: storageUsedMB,
        kanban_funnel_used: kanbanFunnelCount,
        facebook_ad_campaign_used: facebookAdCampaignCount,
        segments_used: segmentCount,
    };
};

export const getUserSubscription = async (req, res) => {
    try {
        const userId = req.user._id;

        const subscription = await Subscription.findOne({
            user_id: userId,
            deleted_at: null,
            $or: [
                { status: { $in: ['active', 'trial'] } },
                { payment_gateway: 'manual', status: 'pending' }
            ]
        })
            .populate({
                path: 'plan_id',
                select: '_id name price features is_featured',
                ...PLAN_SENSITIVE_FIELDS,
                populate: {
                    path: 'currency taxes',
                }
            }).sort({ created_at: -1 }).lean();

        if (!subscription) {
            return res.status(200).json({
                success: true,
                data: [],
                message: 'No subscription found'
            });
        }

        const usage = await fetchDynamicUsage(userId);

        const setting = await Setting.findOne().select('storage_limit').lean();
        const storageLimit = setting?.storage_limit || 0;

        if (subscription.plan_id && subscription.plan_id.features) {
            subscription.plan_id.features.storage = storageLimit;
        } else if (subscription.features) {
            subscription.features.storage = storageLimit;
        }

        const data = { ...subscription, usage };

        return res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        console.log('Error retrieving user subscription:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve subscription',
            error: error.message
        });
    }
};

export const createStripeSubscription = async (req, res) => {
    try {
        const { plan_id } = req.body;
        const userId = req.user._id;

        if (!plan_id || !mongoose.Types.ObjectId.isValid(plan_id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid plan ID is required'
            });
        }

        const plan = await Plan.findOne({ _id: plan_id, is_active: true, deleted_at: null }).populate('currency');
        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Plan not found or inactive'
            });
        }

        if (!plan.stripe_payment_link_url) {
            return res.status(400).json({
                success: false,
                message: 'Plan does not have a Stripe payment link configured'
            });
        }

        const existingActive = await Subscription.findOne({
            user_id: userId,
            status: { $in: ['active', 'trial'] },
            deleted_at: null
        });
        if (existingActive) {
            return res.status(409).json({
                success: false,
                message: 'User already has an active subscription'
            });
        }

        let subscription = await Subscription.findOne({
            user_id: userId,
            plan_id: plan._id,
            status: 'pending',
            payment_gateway: 'stripe',
            stripe_subscription_id: null,
            deleted_at: null
        });

        if (!subscription) {
            const now = new Date();
            const periodEnd = calculatePeriodEnd(now, plan.billing_cycle || 'monthly');
            subscription = await Subscription.create({
                user_id: userId,
                plan_id: plan._id,
                status: 'pending',
                started_at: now,
                current_period_start: now,
                current_period_end: periodEnd,
                payment_gateway: 'stripe',
                payment_method: 'card',
                payment_status: 'pending',
                currency: (plan.currency?.code || plan.currency || 'INR').toString().toUpperCase(),
                stripe_subscription_id: null,
                taxes: plan.taxes || [],
                features: plan.features,
                auto_rereturnDocument: 'after'
            });
        }

        const separator = plan.stripe_payment_link_url.includes('?') ? '&' : '?';
        const params = new URLSearchParams();
        params.set('client_reference_id', userId.toString());
        if (req.user?.email) {
            params.set('prefilled_email', req.user.email);
        }
        const paymentLink = `${plan.stripe_payment_link_url}${separator}${params.toString()}`;

        return res.status(200).json({
            success: true,
            message: 'Redirect user to the payment link to complete subscription',
            data: {
                subscription,
                payment_link: paymentLink,
                plan_id: plan._id,
                plan_name: plan.name
            }
        });
    } catch (error) {
        console.error('Error creating Stripe subscription:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create subscription',
            error: error.message
        });
    }
};

export const createManualSubscription = async (req, res) => {
    try {
        const {
            plan_id,
            payment_reference,
            manual_payment_type,
            bank_account_no,
            bank_name,
            bank_holder_name,
            bank_swift_code,
            bank_routing_number,
            bank_ifsc_no
        } = req.body;
        const userId = req.user._id;

        const transaction_receipt = req.file ? req.file.path : null;

        if (!plan_id || !mongoose.Types.ObjectId.isValid(plan_id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid plan ID is required'
            });
        }

        const plan = await Plan.findOne({ _id: plan_id, is_active: true, deleted_at: null }).populate('currency');
        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Plan not found or inactive'
            });
        }

        const existingActive = await Subscription.findOne({
            user_id: userId,
            status: { $in: ['active', 'trial'] },
            deleted_at: null
        });
        if (existingActive) {
            return res.status(409).json({
                success: false,
                message: 'User already has an active subscription'
            });
        }

        const existingPending = await Subscription.findOne({
            user_id: userId,
            plan_id: plan._id,
            payment_gateway: 'manual',
            status: 'pending',
            deleted_at: null
        });
        if (existingPending) {
            return res.status(200).json({
                success: true,
                message: 'Manual payment subscription request already submitted. Awaiting admin approval.',
                data: existingPending
            });
        }

        const now = new Date();
        const periodEnd = calculatePeriodEnd(now, plan.billing_cycle || 'monthly');

        const subscription = await Subscription.create({
            user_id: userId,
            plan_id: plan._id,
            status: 'pending',
            started_at: now,
            current_period_start: now,
            current_period_end: periodEnd,
            payment_gateway: 'manual',
            payment_method: manual_payment_type === 'bank_transfer' ? 'bank_transfer' : 'cash',
            payment_status: 'pending',
            payment_reference: payment_reference?.trim() || null,
            transaction_receipt: transaction_receipt,
            manual_payment_type: manual_payment_type || 'cash',
            bank_account_no: manual_payment_type === 'bank_transfer' ? bank_account_no : null,
            bank_name: manual_payment_type === 'bank_transfer' ? bank_name : null,
            bank_holder_name: manual_payment_type === 'bank_transfer' ? bank_holder_name : null,
            bank_swift_code: manual_payment_type === 'bank_transfer' ? bank_swift_code : null,
            bank_routing_number: manual_payment_type === 'bank_transfer' ? bank_routing_number : null,
            bank_ifsc_no: manual_payment_type === 'bank_transfer' ? bank_ifsc_no : null,
            currency: (plan.currency?.code || plan.currency || 'INR').toString().toUpperCase(),
            amount_paid: 0,
            taxes: plan.taxes || [],
            features: plan.features,
            auto_renew: false
        });

        return res.status(201).json({
            success: true,
            message: 'Manual payment subscription requested. Your subscription will be active after admin approval.',
            data: subscription
        });
    } catch (error) {
        console.error('Error creating manual subscription:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create manual subscription request',
            error: error.message
        });
    }
};

export const createRazorpaySubscription = async (req, res) => {
    try {
        const { plan_id } = req.body;
        const userId = req.user._id;

        if (!plan_id || !mongoose.Types.ObjectId.isValid(plan_id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid plan ID is required'
            });
        }

        const plan = await Plan.findOne({ _id: plan_id, is_active: true, deleted_at: null }).populate('currency');
        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Plan not found or inactive'
            });
        }

        if (!plan.razorpay_plan_id) {
            return res.status(400).json({
                success: false,
                message: 'Plan does not have Razorpay plan ID configured'
            });
        }

        const existingActive = await Subscription.findOne({
            user_id: userId,
            status: { $in: ['active', 'trial'] },
            deleted_at: null
        });
        if (existingActive) {
            return res.status(409).json({
                success: false,
                message: 'User already has an active subscription'
            });
        }

        const linkResult = await RazorpayService.createSubscriptionLink(
            plan.razorpay_plan_id,
            userId.toString(),
            {
                billingCycle: plan.billing_cycle,
                planIdDb: plan._id,
                notifyEmail: req.user?.email || undefined,
                notifyPhone: req.user?.phone || undefined
            }
        );

        const now = new Date();
        const periodEnd = calculatePeriodEnd(now, plan.billing_cycle);

        let subscription = await Subscription.findOne({
            user_id: userId,
            plan_id: plan._id,
            status: 'pending',
            payment_gateway: 'razorpay',
            deleted_at: null
        });

        if (subscription) {
            subscription.razorpay_subscription_id = linkResult.id;
            subscription.current_period_end = periodEnd;
            await subscription.save();
        } else {
            subscription = await Subscription.create({
                user_id: userId,
                plan_id: plan._id,
                status: 'pending',
                started_at: now,
                current_period_start: now,
                current_period_end: periodEnd,
                payment_gateway: 'razorpay',
                payment_method: 'card',
                payment_status: 'pending',
                currency: (plan.currency?.code || plan.currency || 'INR').toString().toUpperCase(),
                razorpay_subscription_id: linkResult.id,
                taxes: plan.taxes || [],
                features: plan.features,
                auto_rereturnDocument: 'after'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Redirect user to the subscription link to complete payment',
            data: {
                subscription,
                subscription_link: linkResult.short_url,
                payment_link: linkResult.short_url,
                plan_id: plan._id,
                plan_name: plan.name,
                razorpay_key_id: process.env.RAZORPAY_KEY_ID
            }
        });
    } catch (error) {
        console.error('Error creating Razorpay subscription:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create subscription',
            error: error.message
        });
    }
};

export const createPayPalSubscription = async (req, res) => {
    try {
        const { plan_id } = req.body;
        const userId = req.user._id;

        if (!plan_id || !mongoose.Types.ObjectId.isValid(plan_id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid plan ID is required'
            });
        }

        const plan = await Plan.findOne({ _id: plan_id, is_active: true, deleted_at: null }).populate('currency');
        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Plan not found or inactive'
            });
        }

        if (!plan.paypal_plan_id) {
            return res.status(400).json({
                success: false,
                message: 'Plan does not have PayPal plan ID configured'
            });
        }

        const existingActive = await Subscription.findOne({
            user_id: userId,
            status: { $in: ['active', 'trial'] },
            deleted_at: null
        });
        if (existingActive) {
            return res.status(409).json({
                success: false,
                message: 'User already has an active subscription'
            });
        }

        const returnUrl = `${process.env.APP_FRONTEND_URL || req.protocol + '://' + req.get('host')}/subscription/success`;
        const cancelUrl = `${process.env.APP_FRONTEND_URL || req.protocol + '://' + req.get('host')}/subscription/cancel`;

        const paypalSubscription = await PayPalService.createSubscription(
            plan.paypal_plan_id,
            userId,
            returnUrl,
            cancelUrl
        );

        const approvalUrl = paypalSubscription.links.find(link => link.rel === 'approve')?.href;

        const now = new Date();
        const periodEnd = calculatePeriodEnd(now, plan.billing_cycle);

        let subscription = await Subscription.findOne({
            user_id: userId,
            plan_id: plan._id,
            status: 'pending',
            payment_gateway: 'paypal',
            deleted_at: null
        });

        if (subscription) {
            subscription.paypal_subscription_id = paypalSubscription.id;
            subscription.current_period_end = periodEnd;
            await subscription.save();
        } else {
            subscription = await Subscription.create({
                user_id: userId,
                plan_id: plan._id,
                status: 'pending',
                started_at: now,
                current_period_start: now,
                current_period_end: periodEnd,
                payment_gateway: 'paypal',
                payment_method: 'card',
                payment_status: 'pending',
                currency: (plan.currency?.code || plan.currency || 'USD').toString().toUpperCase(),
                paypal_subscription_id: paypalSubscription.id,
                taxes: plan.taxes || [],
                features: plan.features,
                auto_rereturnDocument: 'after'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'PayPal subscription initiated. Use the ID for SDK or redirect to the approval URL.',
            data: {
                subscription,
                paypal_subscription_id: paypalSubscription.id,
                approval_url: approvalUrl,
                payment_link: approvalUrl,
                plan_id: plan._id,
                plan_name: plan.name
            }
        });
    } catch (error) {
        console.error('Error creating PayPal subscription:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create subscription',
            error: error.message
        });
    }
};

export const assignPlanToUser = async (req, res) => {
    try {
        const { user_id, plan_id, amount, duration: reqDuration } = req.body;
        const adminId = req.user._id;

        const duration = Math.max(1, parseInt(reqDuration) || 1);
        if (duration > 24) {
            return res.status(400).json({ success: false, message: 'Maximum duration allowed is 24 cycles' });
        }

        if (!user_id || !mongoose.Types.ObjectId.isValid(user_id)) {
            return res.status(400).json({ success: false, message: 'Valid user ID is required' });
        }
        if (!plan_id || !mongoose.Types.ObjectId.isValid(plan_id)) {
            return res.status(400).json({ success: false, message: 'Valid plan ID is required' });
        }

        const user = await User.findById(user_id);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const plan = await Plan.findOne({ _id: plan_id, is_active: true, deleted_at: null }).populate('currency');
        if (!plan) {
            return res.status(404).json({ success: false, message: 'Plan not found or inactive' });
        }

        const existingSubscriptions = await Subscription.find({
            user_id: user._id,
            status: { $in: ['active', 'trial', 'pending'] },
            deleted_at: null
        });

        for (const sub of existingSubscriptions) {
            if (sub.stripe_subscription_id) {
                try {
                    await StripeService.cancelSubscription(sub.stripe_subscription_id, false);
                } catch (err) {
                    console.error('Error canceling Stripe subscription during admin reassignment:', err);
                }
            }
            if (sub.razorpay_subscription_id) {
                try {
                    await RazorpayService.cancelSubscription(sub.razorpay_subscription_id, true);
                } catch (err) {
                    console.error('Error canceling Razorpay subscription during admin reassignment:', err);
                }
            }
            if (sub.paypal_subscription_id) {
                try {
                    await PayPalService.cancelSubscription(sub.paypal_subscription_id, 'Admin reassigned plan');
                } catch (err) {
                    console.error('Error canceling PayPal subscription during admin reassignment:', err);
                }
            }

            sub.status = 'cancelled';
            sub.cancelled_at = new Date();
            sub.auto_renew = false;
            await sub.save();
        }

        const now = new Date();
        const billingCycle = plan.billing_cycle || 'monthly';
        const finalDuration = billingCycle === 'lifetime' ? 1 : duration;

        const periodEnd = calculatePeriodEnd(now, billingCycle, finalDuration);
        const amountPaid = amount !== undefined ? Number(amount) : (plan.price * finalDuration);

        const subscription = await Subscription.create({
            user_id: user._id,
            plan_id: plan._id,
            status: 'active',
            started_at: now,
            current_period_start: now,
            current_period_end: periodEnd,
            duration: finalDuration,
            payment_gateway: 'admin generated',
            payment_method: 'manual',
            payment_status: 'paid',
            approved_by: adminId,
            approved_at: now,
            created_by: adminId,
            currency: (plan.currency?.code || plan.currency || 'INR').toString().toUpperCase(),
            amount_paid: amountPaid,
            taxes: plan.taxes || [],
            features: plan.features,
            auto_renew: false,
            notes: 'Admin assigned plan'
        });

        await PaymentHistory.create({
            user_id: user._id,
            subscription_id: subscription._id,
            plan_id: plan._id,
            amount: amountPaid,
            currency: subscription.currency,
            payment_method: 'manual',
            payment_status: 'success',
            transaction_id: `ADMIN-${Date.now()}`,
            payment_gateway: 'admin generated',
            payment_response: { assigned_by: adminId },
            invoice_number: generateInvoiceNumber(),
            taxes: plan.taxes || [],
            paid_at: now,
            notes: 'Admin assigned plan'
        });

        return res.status(201).json({
            success: true,
            message: 'Plan assigned to user successfully',
            data: subscription
        });
    } catch (error) {
        console.error('Error assigning plan to user:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to assign plan to user',
            error: error.message
        });
    }
};

export const cancelSubscription = async (req, res) => {
    try {
        const { id } = req.params;
        const { user_id, cancel_at_period_end = true } = req.body;
        const userId = req.user._id;

        const query = {
            _id: id,
            deleted_at: null
        };


        if (req.user.role !== 'super_admin') {
            query.user_id = userId;
        } else if (user_id) {
            query.user_id = user_id;
        }

        const subscription = await Subscription.findOne(query);

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'Subscription not found'
            });
        }

        if (subscription.payment_gateway === 'stripe' && subscription.stripe_subscription_id) {
            await StripeService.cancelSubscription(
                subscription.stripe_subscription_id,
                cancel_at_period_end
            );
        } else if (subscription.payment_gateway === 'razorpay' && subscription.razorpay_subscription_id) {
            await RazorpayService.cancelSubscription(
                subscription.razorpay_subscription_id,
                cancel_at_period_end
            );
        } else if (subscription.payment_gateway === 'paypal' && subscription.paypal_subscription_id) {
            await PayPalService.cancelSubscription(
                subscription.paypal_subscription_id,
                'User cancelled'
            );
        }

        if (cancel_at_period_end) {
            subscription.auto_renew = false;
            subscription.cancelled_at = new Date();
        } else {
            subscription.status = 'cancelled';
            subscription.cancelled_at = new Date();
            subscription.auto_renew = false;
        }

        await subscription.save();

        return res.status(200).json({
            success: true,
            message: cancel_at_period_end
                ? 'Subscription will be cancelled at period end'
                : 'Subscription cancelled immediately',
            data: subscription
        });
    } catch (error) {
        console.error('Error cancelling subscription:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to cancel subscription',
            error: error.message
        });
    }
};

export const resumeSubscription = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const subscription = await Subscription.findOne({
            _id: id,
            user_id: userId,
            deleted_at: null
        });

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'Subscription not found'
            });
        }

        if (subscription.status !== 'cancelled' && !subscription.cancelled_at) {
            return res.status(400).json({
                success: false,
                message: 'Subscription is not cancelled'
            });
        }

        if (subscription.payment_gateway === 'stripe' && subscription.stripe_subscription_id) {
            await StripeService.resumeSubscription(subscription.stripe_subscription_id);
        } else if (subscription.payment_gateway === 'razorpay' && subscription.razorpay_subscription_id) {
            await RazorpayService.resumeSubscription(subscription.razorpay_subscription_id);
        }

        subscription.auto_renew = true;
        subscription.cancelled_at = null;
        if (subscription.status === 'cancelled' && new Date() <= subscription.current_period_end) {
            subscription.status = 'active';
        }

        await subscription.save();

        return res.status(200).json({
            success: true,
            message: 'Subscription resumed successfully',
            data: subscription
        });
    } catch (error) {
        console.error('Error resuming subscription:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to resume subscription',
            error: error.message
        });
    }
};

export const changeSubscriptionPlan = async (req, res) => {
    try {
        const { id } = req.params;
        const { new_plan_id } = req.body;
        const userId = req.user._id;

        if (!new_plan_id || !mongoose.Types.ObjectId.isValid(new_plan_id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid new plan ID is required'
            });
        }

        const query = {
            _id: id,
            status: { $in: ['active', 'trial'] },
            deleted_at: null
        };

        if (req.user.role !== 'super_admin') {
            query.user_id = userId;
        }

        const subscription = await Subscription.findOne(query);

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'Active subscription not found'
            });
        }

        const newPlan = await Plan.findOne({
            _id: new_plan_id,
            is_active: true,
            deleted_at: null
        }).populate('currency');

        if (!newPlan) {
            return res.status(404).json({
                success: false,
                message: 'New plan not found or inactive'
            });
        }

        if (subscription.plan_id?.toString() === new_plan_id) {
            return res.status(400).json({
                success: false,
                message: 'Already subscribed to this plan'
            });
        }

        if (subscription.payment_gateway === 'paypal' && newPlan.paypal_plan_id) {
            const returnUrl = `${process.env.APP_FRONTEND_URL || req.protocol + '://' + req.get('host')}/subscription/success`;
            const cancelUrl = `${process.env.APP_FRONTEND_URL || req.protocol + '://' + req.get('host')}/subscription/cancel`;

            const paypalSubscription = await PayPalService.createSubscription(
                newPlan.paypal_plan_id,
                subscription.user_id,
                returnUrl,
                cancelUrl
            );

            const approvalUrl = paypalSubscription.links.find(link => link.rel === 'approve')?.href;

            const now = new Date();
            const periodEnd = calculatePeriodEnd(now, newPlan.billing_cycle);

            const newSubscription = await Subscription.create({
                user_id: subscription.user_id,
                plan_id: newPlan._id,
                status: 'pending',
                started_at: now,
                current_period_start: now,
                current_period_end: periodEnd,
                payment_gateway: 'paypal',
                payment_method: 'paypal',
                payment_status: 'pending',
                currency: (newPlan.currency?.code || newPlan.currency || 'USD').toString().toUpperCase(),
                paypal_subscription_id: paypalSubscription.id,
                taxes: newPlan.taxes || [],
                auto_rereturnDocument: 'after'
            });

            return res.status(200).json({
                success: true,
                message: 'New PayPal plan request created. Current subscription remains active until payment is completed. Redirect user to finalize.',
                data: {
                    subscription: newSubscription,
                    paypal_subscription_id: paypalSubscription.id,
                    approval_url: approvalUrl,
                    payment_link: approvalUrl,
                    new_plan_id: newPlan._id,
                    new_plan_name: newPlan.name
                }
            });
        }

        if (subscription.payment_gateway === 'stripe') {
            if (!newPlan.stripe_payment_link_url) {
                return res.status(400).json({
                    success: false,
                    message: 'New plan does not have a Stripe payment link configured'
                });
            }

            const now = new Date();
            const periodEnd = calculatePeriodEnd(now, newPlan.billing_cycle || 'monthly');
            const newSubscription = await Subscription.create({
                user_id: userId,
                plan_id: newPlan._id,
                status: 'pending',
                started_at: now,
                current_period_start: now,
                current_period_end: periodEnd,
                payment_gateway: 'stripe',
                payment_method: 'card',
                payment_status: 'pending',
                currency: (newPlan.currency?.code || newPlan.currency || 'INR').toString().toUpperCase(),
                stripe_subscription_id: null,
                taxes: newPlan.taxes || [],
                auto_rereturnDocument: 'after'
            });

            const separator = newPlan.stripe_payment_link_url.includes('?') ? '&' : '?';
            const params = new URLSearchParams();
            params.set('client_reference_id', userId.toString());
            if (req.user?.email) {
                params.set('prefilled_email', req.user.email);
            }
            const paymentLink = `${newPlan.stripe_payment_link_url}${separator}${params.toString()}`;

            return res.status(200).json({
                success: true,
                message: 'New plan request created. Redirect user to the payment link to complete the change.',
                data: {
                    subscription: newSubscription,
                    payment_link: paymentLink,
                    new_plan_id: newPlan._id,
                    new_plan_name: newPlan.name
                }
            });
        }

        if (subscription.payment_gateway === 'razorpay' && newPlan.razorpay_plan_id) {


            const linkResult = await RazorpayService.createSubscriptionLink(
                newPlan.razorpay_plan_id,
                userId.toString(),
                {
                    billingCycle: newPlan.billing_cycle,
                    planIdDb: newPlan._id,
                    notifyEmail: req.user?.email || undefined,
                    notifyPhone: req.user?.phone || undefined
                }
            );

            const now = new Date();
            const periodEnd = calculatePeriodEnd(now, newPlan.billing_cycle);

            const newSubscription = await Subscription.create({
                user_id: userId,
                plan_id: newPlan._id,
                status: 'pending',
                started_at: now,
                current_period_start: now,
                current_period_end: periodEnd,
                payment_gateway: 'razorpay',
                payment_method: 'card',
                payment_status: 'pending',
                currency: (newPlan.currency?.code || newPlan.currency || 'INR').toString().toUpperCase(),
                razorpay_subscription_id: linkResult.id,
                taxes: newPlan.taxes || [],
                auto_rereturnDocument: 'after'
            });

            return res.status(200).json({
                success: true,
                message: 'New plan request created. Current subscription remains active until payment is completed. Redirect user to the subscription link.',
                data: {
                    subscription: newSubscription,
                    subscription_link: linkResult.short_url,
                    payment_link: linkResult.short_url,
                    new_plan_id: newPlan._id,
                    new_plan_name: newPlan.name
                }
            });
        }

        return res.status(400).json({
            success: false,
            message: 'Plan change not supported for this subscription'
        });
    } catch (error) {
        console.error('Error changing subscription plan:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to change subscription plan',
            error: error.message
        });
    }
};

export const getManagePortalUrl = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        const subscription = await Subscription.findOne({
            _id: id,
            user_id: userId,
            status: { $in: ['active', 'trial'] },
            deleted_at: null
        });

        if (!subscription) {
            return res.status(200).json({
                success: true,
                data: [],
                message: 'Active subscription not found'
            });
        }

        if (subscription.payment_gateway !== 'stripe') {
            return res.status(400).json({
                success: false,
                message: 'Manage portal is only available for Stripe subscriptions'
            });
        }

        let stripeCustomerId = subscription.stripe_customer_id;
        if (!stripeCustomerId) {
            const user = await User.findById(userId).select('stripe_customer_id').lean();
            stripeCustomerId = user?.stripe_customer_id;
        }
        if (!stripeCustomerId) {
            const stripeSub = await StripeService.getSubscription(subscription.stripe_subscription_id);
            stripeCustomerId = typeof stripeSub.customer === 'string' ? stripeSub.customer : stripeSub.customer?.id;
        }
        if (!stripeCustomerId) {
            return res.status(400).json({
                success: false,
                message: 'Stripe customer ID not found. Unable to open subscription management.'
            });
        }

        const returnUrl = req.body.return_url || req.query.return_url ||
            process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
        const { url } = await StripeService.createBillingPortalSession(stripeCustomerId, returnUrl);

        return res.status(200).json({
            success: true,
            message: 'Redirect user to manage subscription (cancel, update payment, etc.)',
            data: { portal_url: url }
        });
    } catch (error) {
        console.error('Error getting manage portal URL:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get manage portal URL',
            error: error.message
        });
    }
};

export const getSubscriptionUsage = async (req, res) => {
    try {
        const userId = req.user._id;

        const subscription = await Subscription.findOne({
            user_id: userId,
            deleted_at: null,
            $or: [
                { status: { $in: ['active', 'trial'] } },
                { payment_gateway: 'manual', status: 'pending' }
            ]
        }).populate('plan_id');

        if (!subscription) {
            return res.status(200).json({
                success: true,
                data: [],
                message: 'No subscription found'
            });
        }

        const plan = subscription.plan_id;
        const features = plan?.features || {};

        const [tagsCount, contactsCount, templatesCount, campaignsCount] = await Promise.all([
            Tag.countDocuments({ created_by: userId, deleted_at: null }),
            Contact.countDocuments({ created_by: userId, deleted_at: null }),
            Template.countDocuments({ user_id: userId }),
            Campaign.countDocuments({ user_id: userId, deleted_at: null })
        ]);

        const limitOrUnlimited = (limit) => (limit > 0 ? limit : Infinity);
        const percentage = (used, limit) =>
            limit > 0 ? ((used / limit) * 100).toFixed(2) : 0;

        const usageDetails = {
            tags: {
                used: tagsCount,
                limit: features.tags ?? 0,
                percentage: percentage(tagsCount, features.tags ?? 0)
            },
            contacts: {
                used: contactsCount,
                limit: features.contacts ?? 0,
                percentage: percentage(contactsCount, features.contacts ?? 0)
            },
            template_bots: {
                used: templatesCount,
                limit: features.template_bots ?? 0,
                percentage: percentage(templatesCount, features.template_bots ?? 0)
            },
            campaigns: {
                used: campaignsCount,
                limit: features.campaigns ?? 0,
                percentage: percentage(campaignsCount, features.campaigns ?? 0)
            }
        };

        return res.status(200).json({
            success: true,
            data: {
                subscription_id: subscription._id,
                plan_name: plan.name,
                subscription_status: subscription.status,
                usage: usageDetails,
                period: {
                    start: subscription.current_period_start,
                    end: subscription.current_period_end
                }
            }
        });
    } catch (error) {
        console.error('Error retrieving subscription usage:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve subscription usage',
            error: error.message
        });
    }
};

export const getSubscriptionStats = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const [
            totalSubscriptions,
            activeSubscriptions,
            expiredSubscriptions,
            expiringSoonSubscriptions,
            revenueData
        ] = await Promise.all([
            Subscription.countDocuments({ deleted_at: null }),
            Subscription.countDocuments({ deleted_at: null, status: { $in: ['active', 'trial'] } }),
            Subscription.countDocuments({ deleted_at: null, status: 'expired' }),
            Subscription.countDocuments({
                deleted_at: null,
                status: { $in: ['active', 'trial'] },
                current_period_end: { $lte: next7Days, $gte: now }
            }),
            PaymentHistory.aggregate([
                {
                    $match: {
                        payment_status: 'success',
                        paid_at: { $gte: startOfMonth },
                        deleted_at: null
                    }
                },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ])
        ]);

        return res.status(200).json({
            success: true,
            data: {
                totalSubscriptions,
                activeSubscriptions,
                expiredSubscriptions,
                expiringSoonSubscriptions,
                monthlyRevenue: revenueData[0]?.total || 0
            }
        });
    } catch (error) {
        console.error('Error getting subscription stats:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get subscription statistics',
            error: error.message
        });
    }
};

export const getSubscriptionCheckoutUrl = async (req, res) => {
    try {
        const planId = req.query.plan_id || req.body?.plan_id;
        const userId = req.user._id;

        if (!planId || !mongoose.Types.ObjectId.isValid(planId)) {
            return res.status(400).json({
                success: false,
                message: 'Valid plan_id is required'
            });
        }

        const plan = await Plan.findOne({
            _id: planId,
            is_active: true,
            deleted_at: null
        });

        if (!plan) {
            return res.status(404).json({
                success: false,
                message: 'Plan not found or inactive'
            });
        }

        if (!plan.stripe_payment_link_url) {
            return res.status(400).json({
                success: false,
                message: 'Plan does not have a Stripe payment link configured'
            });
        }

        const separator = plan.stripe_payment_link_url.includes('?') ? '&' : '?';
        const params = new URLSearchParams();
        params.set('client_reference_id', userId.toString());
        if (req.user?.email) {
            params.set('prefilled_email', req.user.email);
        }
        const checkoutUrl = `${plan.stripe_payment_link_url}${separator}${params.toString()}`;

        return res.status(200).json({
            success: true,
            data: {
                checkout_url: checkoutUrl,
                plan_id: plan._id,
                plan_name: plan.name
            }
        });
    } catch (error) {
        console.error('Error getting subscription checkout URL:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get checkout URL',
            error: error.message
        });
    }
};

export const downloadInvoice = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user._id;

        let query = { invoice_number: id };
        if (mongoose.Types.ObjectId.isValid(id)) {
            query = { $or: [{ _id: id }, { invoice_number: id }] };
        }

        const payment = await PaymentHistory.findOne(query)
            .populate('user_id')
            .populate('plan_id')
            .populate('taxes');

        if (!payment) {
            return res.status(404).json({
                success: false,
                message: 'Payment record not found'
            });
        }

        if (payment.user_id._id.toString() !== userId.toString() && req.user.role !== 'super_admin') {
            return res.status(403).json({
                success: false,
                message: 'Forbidden: You do not have permission to download this invoice'
            });
        }

        const pdfBuffer = await generateInvoicePDF(payment, payment.user_id, payment.plan_id);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${payment.invoice_number || 'download'}.pdf`);
        return res.send(pdfBuffer);
    } catch (error) {
        console.error('Error generating invoice:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to generate invoice',
            error: error.message
        });
    }
};

export const overrideSubscriptionLimits = async (req, res) => {
    try {
        const { userId } = req.params;
        const { features } = req.body;
        const adminId = req.user._id;

        const subscription = await Subscription.findOne({
            user_id: userId,
            status: { $in: ['active', 'trial'] },
            deleted_at: null
        });

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'Active subscription not found for this user'
            });
        }

        subscription.features = { ...(subscription.features || {}), ...features };
        subscription.is_custom = true;
        subscription.overridden_by = adminId;
        await subscription.save();

        return res.status(200).json({
            success: true,
            message: 'Subscription limits overridden successfully',
            data: subscription
        });
    } catch (error) {
        console.error('Error overriding subscription limits:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to override subscription limits',
            error: error.message
        });
    }
};

export const resetSubscriptionLimits = async (req, res) => {
    try {
        const { userId } = req.params;

        const subscription = await Subscription.findOne({
            user_id: userId,
            status: { $in: ['active', 'trial'] },
            deleted_at: null
        }).populate('plan_id');

        if (!subscription) {
            return res.status(404).json({
                success: false,
                message: 'Active subscription not found for this user'
            });
        }

        subscription.features = subscription.plan_id.features;
        subscription.is_custom = false;
        subscription.overridden_by = null;
        await subscription.save();

        return res.status(200).json({
            success: true,
            message: 'Subscription limits reset to plan defaults',
            data: subscription
        });
    } catch (error) {
        console.error('Error resetting subscription limits:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to reset subscription limits',
            error: error.message
        });
    }
};

export default {
    getAllSubscriptions,
    getSubscriptionStats,
    getSubscriptionPayments,
    getUserSubscription,
    createStripeSubscription,
    createRazorpaySubscription,
    createPayPalSubscription,
    createManualSubscription,
    getPendingManualSubscriptions,
    approveManualSubscription,
    rejectManualSubscription,
    cancelSubscription,
    resumeSubscription,
    changeSubscriptionPlan,
    getManagePortalUrl,
    getSubscriptionUsage,
    getSubscriptionCheckoutUrl,
    assignPlanToUser,
    downloadInvoice,
    overrideSubscriptionLimits,
    resetSubscriptionLimits
};
