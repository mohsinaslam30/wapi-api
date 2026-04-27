import mongoose from 'mongoose';
import { Subscription, PaymentHistory, User, Plan } from '../models/index.js';
import { stripe, getStripe, PayPalService } from '../utils/payment-gateway.service.js';
import { RazorpayService, calculatePeriodEnd } from '../utils/payment-gateway.service.js';
import { generateInvoiceNumber } from '../utils/invoice-helper.js';
import { formatAmount } from '../utils/currency.service.js';

function getStripeWebhookSecret() {
    return process.env.STRIPE_WEBHOOK_SECRET || null;
}

const cancelOtherActiveSubscriptions = async (userId, activeSubscriptionId) => {
    try {
        const otherActiveSubs = await Subscription.find({
            user_id: userId,
            status: { $in: ['active', 'trial'] },
            _id: { $ne: activeSubscriptionId },
            deleted_at: null
        });

        for (const oldSub of otherActiveSubs) {
            if (oldSub.payment_gateway === 'razorpay' && oldSub.razorpay_subscription_id) {
                try {
                    await RazorpayService.cancelSubscription(oldSub.razorpay_subscription_id, true);
                } catch (cancelErr) {
                    console.error('[webhook] Failed to cancel old Razorpay subscription:', oldSub.razorpay_subscription_id, cancelErr);
                }
            } else if (oldSub.payment_gateway === 'stripe' && oldSub.stripe_subscription_id) {
                try {
                    await stripe.subscriptions.cancel(oldSub.stripe_subscription_id);
                } catch (cancelErr) {
                    console.error('[webhook] Failed to cancel old Stripe subscription:', oldSub.stripe_subscription_id, cancelErr);
                }
            } else if (oldSub.payment_gateway === 'paypal' && oldSub.paypal_subscription_id) {
                try {
                    await PayPalService.cancelSubscription(oldSub.paypal_subscription_id, 'Plan changed');
                } catch (cancelErr) {
                    console.error('[webhook] Failed to cancel old PayPal subscription:', oldSub.paypal_subscription_id, cancelErr);
                }
            }

            oldSub.status = 'cancelled';
            oldSub.cancelled_at = new Date();
            oldSub.auto_renew = false;
            await oldSub.save();
            console.log('[webhook] Plan change: cancelled old subscription', oldSub._id);
        }
    } catch (error) {
        console.error('[webhook] Error in cancelOtherActiveSubscriptions:', error);
    }
};

export const handleStripeWebhook = async (req, res) => {
    console.log("calleddd");
    if (!getStripe()) {
        console.error('⚠️  Stripe is not configured. Set Stripe keys in Admin > Settings > Stripe or .env');
        return res.status(500).send('Stripe not configured');
    }
    const sig = req.headers['stripe-signature'];
    const webhookSecret = getStripeWebhookSecret();
    console.log("webhookSecret" , webhookSecret);

    if (!webhookSecret) {
        console.error('⚠️  STRIPE_WEBHOOK_SECRET is not set. Configure Stripe in Admin > Settings > Stripe or set in .env');
        return res.status(500).send('Webhook secret not configured');
    }

    const rawBody = req.rawBody !== undefined ? req.rawBody : (Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body);
    if (typeof rawBody !== 'string') {
        console.error('⚠️  Stripe webhook received non-string body. Ensure the webhook route gets raw body (no express.json() before it).');
        return res.status(400).send('Invalid webhook body');
    }

    let event;
    try {
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
        console.error('⚠️  Stripe webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log('✅ Stripe webhook event received:', event.type);

    try {
        switch (event.type) {
            case 'customer.subscription.created':
                await handleSubscriptionCreated(event.data.object);
                break;

            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;

            case 'invoice.payment_succeeded':
                await handleInvoicePaymentSucceeded(event.data.object);
                break;

            case 'invoice.payment_failed':
                await handleInvoicePaymentFailed(event.data.object);
                break;

            case 'customer.subscription.trial_will_end':
                await handleTrialWillEnd(event.data.object);
                break;

            case 'checkout.session.completed':
                await handleCheckoutSessionCompleted(event.data.object);
                break;

            default:
                console.log(`Unhandled Stripe event type: ${event.type}`);
        }

        res.status(200).json({ received: true });
    } catch (error) {
        console.error('Error processing Stripe webhook:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
};

const handleSubscriptionCreated = async (stripeSubscription) => {
    try {
        console.log('Processing subscription.created:', stripeSubscription.id);

        const subscription = await Subscription.findOne({
            stripe_subscription_id: stripeSubscription.id
        });

        if (subscription) {
            subscription.status = stripeSubscription.status === 'trialing' ? 'trial' : 'active';
            if (stripeSubscription.current_period_start && stripeSubscription.current_period_end) {
                subscription.current_period_start = new Date(stripeSubscription.current_period_start * 1000);
                subscription.current_period_end = new Date(stripeSubscription.current_period_end * 1000);
            }
            await subscription.save();
            console.log('Subscription status updated:', subscription._id);
        }
    } catch (error) {
        console.error('Error handling subscription.created:', error);
    }
};

const handleSubscriptionUpdated = async (stripeSubscription) => {
    try {
        console.log('Processing subscription.updated:', stripeSubscription.id);
        console.log('Processing subscription.updated data:', stripeSubscription);

        const subscription = await Subscription.findOne({
            stripe_subscription_id: stripeSubscription.id
        }).populate('plan_id');

        if (!subscription) {
            console.log('Subscription not found for:', stripeSubscription.id);
            return;
        }

        const firstItem = stripeSubscription.items?.data?.[0];
        const priceObj = firstItem?.price;
        const priceId = typeof priceObj === 'string' ? priceObj : priceObj?.id;
        if (priceId) {
            const newPlan = await Plan.findOne({ stripe_price_id: priceId, deleted_at: null });
            if (newPlan && subscription.plan_id?._id?.toString() !== newPlan._id.toString()) {
                subscription.plan_id = newPlan._id;
                subscription.taxes = newPlan.taxes || [];
                subscription.usage = {};
                subscription.features = newPlan.features;
                console.log('[Stripe webhook] Plan updated via portal:', subscription._id, '->', newPlan.name);
            }
        }

        if (stripeSubscription.status === 'active') {
            subscription.status = 'active';
        } else if (stripeSubscription.status === 'trialing') {
            subscription.status = 'trial';
        } else if (stripeSubscription.status === 'canceled') {
            subscription.status = 'cancelled';
        } else if (stripeSubscription.status === 'past_due' || stripeSubscription.status === 'unpaid') {
            subscription.status = 'suspended';
        }

        if (stripeSubscription.current_period_start) {
            subscription.current_period_start =
                new Date(stripeSubscription.current_period_start * 1000);
        }

        if (stripeSubscription.current_period_end) {
            subscription.current_period_end =
                new Date(stripeSubscription.current_period_end * 1000);
        }


            console.log("called yayyy" , stripeSubscription.cancel_at);




        if (stripeSubscription.cancel_at_period_end) {
            subscription.auto_renew = false;
            subscription.cancelled_at = new Date();
        } else {
            subscription.auto_renew = true;
            subscription.cancelled_at = null;
        }

        if (stripeSubscription.cancel_at) {
            console.log("called yayyy");
            subscription.cancels_at = new Date(stripeSubscription.cancel_at * 1000);
            subscription.auto_renew = false;
        } else {
            subscription.auto_renew = true;
            subscription.cancels_at = null;
        }

        await subscription.save();
        console.log('Subscription updated successfully:', subscription._id);
    } catch (error) {
        console.error('Error handling subscription.updated:', error);
    }
};

const handleSubscriptionDeleted = async (stripeSubscription) => {
    try {
        console.log('Processing subscription.deleted:', stripeSubscription.id);

        const subscription = await Subscription.findOne({
            stripe_subscription_id: stripeSubscription.id
        });

        if (subscription) {
            subscription.status = 'cancelled';
            subscription.cancelled_at = new Date();
            subscription.auto_renew = false;
            await subscription.save();
            console.log('Subscription cancelled:', subscription._id);
        }
    } catch (error) {
        console.error('Error handling subscription.deleted:', error);
    }
};

const handleInvoicePaymentSucceeded = async (invoice) => {
    try {
        console.log('Processing invoice.payment_succeeded:', invoice.id);

        if (!invoice.subscription) {
            console.log('Invoice has no subscription');
            return;
        }

        const subscription = await Subscription.findOne({
            stripe_subscription_id: invoice.subscription
        }).populate('plan_id');

        if (!subscription) {
            console.log('Subscription not found for invoice:', invoice.id);
            return;
        }

        subscription.payment_status = 'paid';
        subscription.amount_paid = formatAmount(invoice.amount_paid / 100);
        subscription.transaction_id = invoice.payment_intent;

        if (subscription.status === 'trial' && invoice.billing_reason === 'subscription_create') {
            subscription.status = 'active';
        }

        if (invoice.billing_reason === 'subscription_cycle') {
            const plan = subscription.plan_id;
            subscription.current_period_start = new Date();
            subscription.current_period_end = calculatePeriodEnd(new Date(), plan.billing_cycle);

            subscription.usage = {};
        }

        await subscription.save();

        await PaymentHistory.create({
            user_id: subscription.user_id,
            subscription_id: subscription._id,
            plan_id: subscription.plan_id,
            amount: formatAmount(invoice.amount_paid / 100),
            currency: invoice.currency.toUpperCase(),
            payment_method: 'card',
            payment_status: 'success',
            transaction_id: invoice.payment_intent,
            payment_gateway: 'stripe',
            payment_response: invoice,
            invoice_number: generateInvoiceNumber(),
            taxes: subscription.taxes || [],
            paid_at: new Date()
        });

        console.log('Payment processed successfully for subscription:', subscription._id);
    } catch (error) {
        console.error('Error handling invoice.payment_succeeded:', error);
    }
};

const handleInvoicePaymentFailed = async (invoice) => {
    try {
        console.log('Processing invoice.payment_failed:', invoice.id);

        if (!invoice.subscription) {
            return;
        }

        const subscription = await Subscription.findOne({
            stripe_subscription_id: invoice.subscription
        });

        if (!subscription) {
            console.log('Subscription not found for failed invoice:', invoice.id);
            return;
        }

        subscription.payment_status = 'failed';
        subscription.status = 'suspended';
        await subscription.save();

        await PaymentHistory.create({
            user_id: subscription.user_id,
            subscription_id: subscription._id,
            plan_id: subscription.plan_id,
            amount: formatAmount(invoice.amount_due / 100),
            currency: invoice.currency.toUpperCase(),
            payment_method: 'card',
            payment_status: 'failed',
            transaction_id: invoice.payment_intent,
            payment_gateway: 'stripe',
            payment_response: invoice,
            invoice_number: generateInvoiceNumber(),
            notes: 'Payment failed'
        });

        console.log('Payment failed for subscription:', subscription._id);
    } catch (error) {
        console.error('Error handling invoice.payment_failed:', error);
    }
};

const handleCheckoutSessionCompleted = async (session) => {
    const sessionId = session.id;
    try {
        const userId = session.client_reference_id;
        if (!userId) {
            console.log('[Stripe webhook] checkout.session.completed: missing client_reference_id. Add ?client_reference_id=USER_ID to the payment link URL. Session:', sessionId);
            return;
        }

        if (!mongoose.Types.ObjectId.isValid(userId)) {
            console.log('[Stripe webhook] checkout.session.completed: invalid client_reference_id (must be MongoDB user _id). Session:', sessionId);
            return;
        }

        const stripeSubscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : (session.subscription && session.subscription.id);

        const isSubscriptionMode = !!stripeSubscriptionId;

        if (isSubscriptionMode) {
            const existingSubscription = await Subscription.findOne({
                stripe_subscription_id: stripeSubscriptionId,
                deleted_at: null
            });
            if (existingSubscription) {
                const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
                const periodStart = stripeSubscription.current_period_start
                    ? new Date(stripeSubscription.current_period_start * 1000)
                    : existingSubscription.current_period_start;
                const periodEnd = stripeSubscription.current_period_end
                    ? new Date(stripeSubscription.current_period_end * 1000)
                    : existingSubscription.current_period_end;
                existingSubscription.status = stripeSubscription.status === 'trialing' ? 'trial' : 'active';
                existingSubscription.payment_status = 'paid';
                if (session.payment_status === 'paid' && session.amount_total) {
                    existingSubscription.amount_paid = formatAmount(session.amount_total / 100);
                }
                if (session.payment_intent) {
                    existingSubscription.transaction_id = session.payment_intent;
                }
                if (periodStart && periodEnd && periodEnd.getTime() > 0) {
                    existingSubscription.current_period_start = periodStart;
                    existingSubscription.current_period_end = periodEnd;
                }
                await existingSubscription.save();
                console.log('[Stripe webhook] Subscription updated from checkout:', existingSubscription._id);
                return;
            }
        }

        let priceId = null;
        let plan = null;

        if (isSubscriptionMode) {
            const fullSession = await stripe.checkout.sessions.retrieve(sessionId, {
                expand: ['line_items.data.price', 'subscription']
            });
            priceId = fullSession.line_items?.data?.[0]?.price?.id;
            if (!priceId) {
                const lineItems = await stripe.checkout.sessions.listLineItems(sessionId, { expand: ['data.price'] });
                priceId = lineItems?.data?.[0]?.price?.id;
            }
        }

        if (priceId) {
            plan = await Plan.findOne({
                stripe_price_id: priceId,
                deleted_at: null,
                is_active: true
            }).populate('currency');
        }
        if (!plan && session.metadata?.plan_id) {
            plan = await Plan.findOne({
                _id: session.metadata.plan_id,
                deleted_at: null,
                is_active: true
            }).populate('currency');
        }
        if (!plan) {
            console.log('[Stripe webhook] checkout.session.completed: plan not found. priceId:', priceId, 'metadata.plan_id:', session.metadata?.plan_id, 'Session:', sessionId);
            return;
        }

        const now = new Date();
        let periodStart = now;
        let periodEnd = now;
        let status = 'active';
        let trialEndsAt = null;

        if (isSubscriptionMode) {
            const stripeSubscription = await stripe.subscriptions.retrieve(stripeSubscriptionId);
            const startTs = stripeSubscription.current_period_start;
            const endTs = stripeSubscription.current_period_end;
            if (startTs && endTs) {
                periodStart = new Date(startTs * 1000);
                periodEnd = new Date(endTs * 1000);
            } else {
                periodEnd = calculatePeriodEnd(now, plan.billing_cycle || 'monthly');
            }
            status = stripeSubscription.status === 'trialing' ? 'trial' : 'active';
            trialEndsAt = stripeSubscription.trial_end
                ? new Date(stripeSubscription.trial_end * 1000)
                : null;
        } else {
            periodEnd = calculatePeriodEnd(now, plan.billing_cycle || 'monthly');
        }

        const stripeCustomerId = session.customer
            ? (typeof session.customer === 'string' ? session.customer : session.customer.id)
            : null;

        const userIdObj = new mongoose.Types.ObjectId(userId);
        const amountPaid = session.amount_total ? formatAmount(session.amount_total / 100) : plan.price;

        let subscription = await Subscription.findOne({
            user_id: userIdObj,
            plan_id: plan._id,
            status: 'pending',
            payment_gateway: 'stripe',
            stripe_subscription_id: null,
            deleted_at: null
        });

        if (subscription) {
            subscription.stripe_subscription_id = stripeSubscriptionId || null;
            subscription.stripe_customer_id = stripeCustomerId;
            subscription.status = status;
            subscription.payment_status = 'paid';
            subscription.transaction_id = session.payment_intent || null;
            subscription.amount_paid = amountPaid;
            subscription.current_period_start = periodStart;
            subscription.current_period_end = periodEnd;
            subscription.trial_ends_at = trialEndsAt;
            subscription.auto_renew = !!stripeSubscriptionId;
            await subscription.save();

            await PaymentHistory.create({
                user_id: userIdObj,
                subscription_id: subscription._id,
                plan_id: plan._id,
                amount: amountPaid,
                currency: (plan.currency?.code || (typeof plan.currency === 'string' ? plan.currency : 'INR')).toUpperCase(),
                payment_method: 'card',
                payment_status: 'success',
                transaction_id: session.payment_intent || null,
                payment_gateway: 'stripe',
                payment_response: { session_id: sessionId, subscription_id: stripeSubscriptionId },
                invoice_number: generateInvoiceNumber(),
                taxes: plan.taxes || [],
                paid_at: now
            });

            if (stripeCustomerId) {
                await User.findByIdAndUpdate(userId, { stripe_customer_id: stripeCustomerId });
            }

            console.log('[Stripe webhook] Pending subscription updated. subscriptionId:', subscription._id, 'userId:', userId, 'plan:', plan.name, 'session:', sessionId);
        } else {
            const newSubscription = await Subscription.create({
                user_id: userIdObj,
                plan_id: plan._id,
                status,
                started_at: now,
                trial_ends_at: trialEndsAt,
                current_period_start: periodStart,
                current_period_end: periodEnd,
                payment_gateway: 'stripe',
                payment_method: 'card',
                payment_status: 'paid',
                transaction_id: session.payment_intent || null,
                amount_paid: amountPaid,
                currency: (plan.currency?.code || (typeof plan.currency === 'string' ? plan.currency : 'INR')).toUpperCase(),
                stripe_subscription_id: stripeSubscriptionId || null,
                stripe_customer_id: stripeCustomerId,
                taxes: plan.taxes || [],
                features: plan.features,
                auto_renew: !!stripeSubscriptionId
            });

            if (stripeCustomerId) {
                await User.findByIdAndUpdate(userId, { stripe_customer_id: stripeCustomerId });
            }

            await PaymentHistory.create({
                user_id: userIdObj,
                subscription_id: newSubscription._id,
                plan_id: plan._id,
                amount: amountPaid,
                currency: (plan.currency?.code || (typeof plan.currency === 'string' ? plan.currency : 'INR')).toUpperCase(),
                payment_method: 'card',
                payment_status: 'success',
                transaction_id: session.payment_intent || null,
                payment_gateway: 'stripe',
                payment_response: { session_id: sessionId, subscription_id: stripeSubscriptionId },
                invoice_number: generateInvoiceNumber(),
                taxes: plan.taxes || [],
                paid_at: now
            });

            console.log('[Stripe webhook] Subscription created from payment link. subscriptionId:', newSubscription._id, 'userId:', userId, 'plan:', plan.name, 'session:', sessionId);
        }

        if (session.payment_status === 'paid' || isSubscriptionMode) {
            await cancelOtherActiveSubscriptions(userIdObj, subscription ? subscription._id : (newSubscription ? newSubscription._id : null));
        }
    } catch (error) {
        console.error('[Stripe webhook] Error in checkout.session.completed. Session:', sessionId, error);
    }
};

const handleTrialWillEnd = async (stripeSubscription) => {
    try {
        console.log('Processing subscription.trial_will_end:', stripeSubscription.id);

        const subscription = await Subscription.findOne({
            stripe_subscription_id: stripeSubscription.id
        }).populate('user_id');

        if (subscription) {
            console.log('Trial ending soon for user:', subscription.user_id.email);
        }
    } catch (error) {
        console.error('Error handling trial_will_end:', error);
    }
};

export const handleRazorpayWebhook = async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.rawBody !== undefined ? req.rawBody : (typeof req.body === 'string' ? req.body : null);
    const webhookBody = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return req.body; } })() : req.body;

    try {
        if (!rawBody && !webhookBody) {
            return res.status(400).json({ error: 'Invalid webhook body' });
        }
        const isValid = RazorpayService.verifyWebhookSignature(rawBody || JSON.stringify(webhookBody), signature);

        if (!isValid) {
            console.error('⚠️  Razorpay webhook signature verification failed');
            return res.status(400).json({ error: 'Invalid signature' });
        }

        console.log('✅ Razorpay webhook event received:', webhookBody.event);

        const event = webhookBody.event;
        const payload = webhookBody.payload;

        switch (event) {
            case 'subscription.authenticated':
                await handleRazorpaySubscriptionActivated(payload.subscription.entity);
                break;
            case 'subscription.activated':
                await handleRazorpaySubscriptionActivated(payload.subscription.entity);
                break;

            case 'subscription.charged':
                await handleRazorpaySubscriptionCharged(payload.subscription.entity, payload.payment.entity);
                break;

            case 'subscription.completed':
                await handleRazorpaySubscriptionCompleted(payload.subscription.entity);
                break;

            case 'subscription.cancelled':
                await handleRazorpaySubscriptionCancelled(payload.subscription.entity);
                break;

            case 'subscription.paused':
                await handleRazorpaySubscriptionPaused(payload.subscription.entity);
                break;

            case 'subscription.resumed':
                await handleRazorpaySubscriptionResumed(payload.subscription.entity);
                break;

            case 'payment.failed':
                await handleRazorpayPaymentFailed(payload.payment.entity);
                break;

            default:
                console.log(`Unhandled Razorpay event type: ${event}`);
        }

        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('Error processing Razorpay webhook:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
};

const handleRazorpaySubscriptionActivated = async (razorpaySubscription) => {
    try {
        console.log('Processing subscription.activated:', razorpaySubscription.id);

        const subscription = await Subscription.findOne({
            razorpay_subscription_id: razorpaySubscription.id
        }).populate('plan_id');

        if (subscription) {
            subscription.status = 'active';
            subscription.payment_status = 'paid';
            if (razorpaySubscription.current_start && razorpaySubscription.current_end) {
                subscription.current_period_start = new Date(razorpaySubscription.current_start * 1000);
                subscription.current_period_end = new Date(razorpaySubscription.current_end * 1000);
            } else if (subscription.plan_id) {
                subscription.current_period_end = calculatePeriodEnd(
                    subscription.current_period_start || new Date(),
                    subscription.plan_id.billing_cycle
                );
            }
            await subscription.save();
            console.log('Subscription activated:', subscription._id);

            await cancelOtherActiveSubscriptions(subscription.user_id, subscription._id);
        }
    } catch (error) {
        console.error('Error handling subscription.activated:', error);
    }
};

const handleRazorpaySubscriptionCharged = async (razorpaySubscription, payment) => {
    try {
        console.log('Processing subscription.charged:', razorpaySubscription.id);

        const subscription = await Subscription.findOne({
            razorpay_subscription_id: razorpaySubscription.id
        }).populate('plan_id');

        if (!subscription) {
            console.log('Subscription not found:', razorpaySubscription.id);
            return;
        }

        subscription.payment_status = 'paid';
        subscription.amount_paid = formatAmount(payment.amount / 100);
        subscription.transaction_id = payment.id;
        subscription.status = 'active';

        const plan = subscription.plan_id;
        subscription.current_period_start = new Date();
        subscription.current_period_end = calculatePeriodEnd(new Date(), plan.billing_cycle);

        subscription.usage = {};

        await subscription.save();

        await cancelOtherActiveSubscriptions(subscription.user_id, subscription._id);

        await PaymentHistory.create({
            user_id: subscription.user_id,
            subscription_id: subscription._id,
            plan_id: subscription.plan_id,
            amount: formatAmount(payment.amount / 100),
            currency: payment.currency.toUpperCase(),
            payment_method: payment.method,
            payment_status: 'success',
            transaction_id: payment.id,
            payment_gateway: 'razorpay',
            payment_response: { subscription: razorpaySubscription, payment },
            invoice_number: generateInvoiceNumber(),
            taxes: subscription.taxes || [],
            paid_at: new Date()
        });

        console.log('Payment processed successfully for subscription:', subscription._id);
    } catch (error) {
        console.error('Error handling subscription.charged:', error);
    }
};

const handleRazorpaySubscriptionCompleted = async (razorpaySubscription) => {
    try {
        console.log('Processing subscription.completed:', razorpaySubscription.id);

        const subscription = await Subscription.findOne({
            razorpay_subscription_id: razorpaySubscription.id
        });

        if (subscription) {
            subscription.status = 'expired';
            subscription.auto_renew = false;
            await subscription.save();
            console.log('Subscription completed:', subscription._id);
        }
    } catch (error) {
        console.error('Error handling subscription.completed:', error);
    }
};

const handleRazorpaySubscriptionCancelled = async (razorpaySubscription) => {
    try {
        console.log('Processing subscription.cancelled:', razorpaySubscription.id);

        const subscription = await Subscription.findOne({
            razorpay_subscription_id: razorpaySubscription.id
        });

        if (subscription) {
            subscription.status = 'cancelled';
            subscription.cancelled_at = new Date();
            subscription.auto_renew = false;
            await subscription.save();
            console.log('Subscription cancelled:', subscription._id);
        }
    } catch (error) {
        console.error('Error handling subscription.cancelled:', error);
    }
};

const handleRazorpaySubscriptionPaused = async (razorpaySubscription) => {
    try {
        console.log('Processing subscription.paused:', razorpaySubscription.id);

        const subscription = await Subscription.findOne({
            razorpay_subscription_id: razorpaySubscription.id
        });

        if (subscription) {
            subscription.status = 'suspended';
            await subscription.save();
            console.log('Subscription paused:', subscription._id);
        }
    } catch (error) {
        console.error('Error handling subscription.paused:', error);
    }
};

const handleRazorpaySubscriptionResumed = async (razorpaySubscription) => {
    try {
        console.log('Processing subscription.resumed:', razorpaySubscription.id);

        const subscription = await Subscription.findOne({
            razorpay_subscription_id: razorpaySubscription.id
        });

        if (subscription) {
            subscription.status = 'active';
            await subscription.save();
            console.log('Subscription resumed:', subscription._id);
        }
    } catch (error) {
        console.error('Error handling subscription.resumed:', error);
    }
};

const handleRazorpayPaymentFailed = async (payment) => {
    try {
        console.log('Processing payment.failed:', payment.id);

        const subscription = await Subscription.findOne({
            transaction_id: payment.order_id,
            payment_gateway: 'razorpay'
        });

        if (subscription) {
            subscription.payment_status = 'failed';
            subscription.status = 'suspended';
            await subscription.save();

            await PaymentHistory.create({
                user_id: subscription.user_id,
                subscription_id: subscription._id,
                plan_id: subscription.plan_id,
                amount: formatAmount(payment.amount / 100),
                currency: payment.currency.toUpperCase(),
                payment_method: payment.method,
                payment_status: 'failed',
                transaction_id: payment.id,
                payment_gateway: 'razorpay',
                payment_response: payment,
                invoice_number: generateInvoiceNumber(),
                notes: 'Payment failed'
            });
        }
    } catch (error) {
        console.error('Error handling payment.failed:', error);
    }
};

export const handlePayPalWebhook = async (req, res) => {
    try {
        const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        console.log('PayPal Webhook received:', event.event_type);



        const resource = event.resource;
        const subscriptionId = resource.billing_agreement_id || resource.id;
        const userId = resource.custom_id || resource.custom;

        if (!subscriptionId) {
            return res.status(200).send('Webhook received but no subscription ID found');
        }

        let subscription = await Subscription.findOne({
            $or: [
                { paypal_subscription_id: subscriptionId },
                { transaction_id: subscriptionId }
            ],
            deleted_at: null
        }).populate('plan_id');

        if (!subscription && userId) {
            subscription = await Subscription.findOne({
                user_id: userId,
                payment_gateway: 'paypal',
                status: 'pending',
                deleted_at: null
            }).populate('plan_id');
        }

        if (!subscription) {
            console.error('Subscription not found for PayPal ID:', subscriptionId);
            return res.status(200).send('Subscription not found');
        }

        switch (event.event_type) {
            case 'BILLING.SUBSCRIPTION.ACTIVATED':
                subscription.status = 'active';
                subscription.payment_status = 'paid';
                subscription.started_at = new Date(resource.start_time || Date.now());
                if (resource.billing_info?.next_billing_time) {
                    subscription.current_period_end = new Date(resource.billing_info.next_billing_time);
                }
                await subscription.save();
                console.log(`Subscription ${subscription._id} activated via PayPal`);

                await cancelOtherActiveSubscriptions(subscription.user_id, subscription._id);
                break;

            case 'PAYMENT.SALE.COMPLETED':
                const amount = parseFloat(resource.amount?.total || 0);
                const currency = (resource.amount?.currency || subscription.currency || 'USD').toUpperCase();

                subscription.payment_status = 'paid';
                subscription.status = 'active';
                subscription.payment_method = 'paypal';
                await subscription.save();

                await PaymentHistory.create({
                    user_id: subscription.user_id,
                    subscription_id: subscription._id,
                    plan_id: subscription.plan_id._id,
                    amount: amount,
                    currency: currency,
                    payment_method: 'paypal',
                    payment_status: 'success',
                    transaction_id: resource.id,
                    payment_gateway: 'paypal',
                    payment_response: event,
                    invoice_number: generateInvoiceNumber(),
                    taxes: subscription.taxes || [],
                    paid_at: new Date()
                });
                console.log(`Payment recorded for subscription ${subscription._id} via PayPal`);

                await cancelOtherActiveSubscriptions(subscription.user_id, subscription._id);
                break;

            case 'BILLING.SUBSCRIPTION.CANCELLED':
            case 'BILLING.SUBSCRIPTION.EXPIRED':
            case 'BILLING.SUBSCRIPTION.SUSPENDED':
                subscription.status = event.event_type === 'BILLING.SUBSCRIPTION.CANCELLED' ? 'cancelled' :
                                   event.event_type === 'BILLING.SUBSCRIPTION.EXPIRED' ? 'expired' : 'suspended';
                subscription.cancelled_at = new Date();
                subscription.auto_renew = false;
                await subscription.save();
                console.log(`Subscription ${subscription._id} status updated to ${subscription.status} via PayPal`);
                break;

            default:
                console.log('Unhandled PayPal event type:', event.event_type);
        }

        return res.status(200).send('Webhook processed');
    } catch (error) {
        console.error('Error handling PayPal webhook:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error processing webhook',
            error: error.message
        });
    }
};

export default {
    handleStripeWebhook,
    handleRazorpayWebhook,
    handlePayPalWebhook
};
