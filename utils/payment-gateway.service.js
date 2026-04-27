import Stripe from 'stripe';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import axios from 'axios';
import { Setting } from '../models/index.js';

let cachedStripe = null;
let cachedStripeKey = null;

function getStripeInstance() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (cachedStripe && cachedStripeKey === key) return cachedStripe;
  cachedStripeKey = key;
  cachedStripe = new Stripe(key);
  return cachedStripe;
}

const stripe = new Proxy({}, {
  get(_, prop) {
    const s = getStripeInstance();
    if (!s) return undefined;
    return s[prop];
  }
});

export function getStripe() {
  return getStripeInstance();
}

let cachedRazorpay = null;
let cachedRazorpayKey = null;

function getRazorpayInstance() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) return null;
  const key = `${keyId}:${keySecret}`;
  if (cachedRazorpay && cachedRazorpayKey === key) return cachedRazorpay;
  cachedRazorpayKey = key;
  cachedRazorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
  console.log("cachedRazorpay" , cachedRazorpay)
  return cachedRazorpay;
}

const razorpay = new Proxy({}, {
  get(_, prop) {
    const r = getRazorpayInstance();
    if (!r) return undefined;
    return r[prop];
  }
});

export function getRazorpay() {
  return getRazorpayInstance();
}

const getStripeErrorMessage = (error, fallback) =>
    (error && typeof error.message === 'string') ? error.message : fallback;

const getRazorpayErrorMessage = (error, fallback) => {
    if (!error) return fallback;
    const msg = error.error?.description || error.description || error.message;
    return (typeof msg === 'string') ? msg : fallback;
};

export const calculatePeriodEnd = (startDate, billingCycle, duration = 1) => {
    const start = new Date(startDate);
    const end = new Date(start);
    const d = parseInt(duration) || 1;

    switch (billingCycle) {
        case 'monthly':
            end.setMonth(end.getMonth() + d);
            break;
        case 'yearly':
            end.setFullYear(end.getFullYear() + d);
            break;
        case 'free Trial':
            end.setDate(end.getDate() + d);
            break;
        case 'lifetime':
            return null;
        default:
            end.setMonth(end.getMonth() + d);
    }

    return end;
};


export const StripeService = {

    async createOrGetCustomer(user) {
        try {
            if (user.stripe_customer_id) {
                const customer = await stripe.customers.retrieve(user.stripe_customer_id);
                if (!customer.deleted) {
                    return customer;
                }
            }

            const customer = await stripe.customers.create({
                email: user.email,
                name: user.name,
                phone: user.phone,
                metadata: {
                    user_id: user._id.toString()
                }
            });

            return customer;
        } catch (error) {
            console.error('Error creating Stripe customer:', error);
            throw new Error(getStripeErrorMessage(error, 'Failed to create Stripe customer'));
        }
    },


    async createSubscription(customerId, priceId, trialDays = 0) {
        try {
            const subscriptionData = {
                customer: customerId,
                items: [{ price: priceId }],
                payment_behavior: 'default_incomplete',
                payment_settings: {
                    save_default_payment_method: 'on_subscription',
                    payment_method_types: ['card']
                },
                expand: ['latest_invoice.payment_intent']
            };

            if (trialDays > 0) {
                subscriptionData.trial_period_days = trialDays;
            }

            const subscription = await stripe.subscriptions.create(subscriptionData);
            return subscription;
        } catch (error) {
            console.error('Error creating Stripe subscription:', error);
            throw new Error(getStripeErrorMessage(error, 'Failed to create Stripe subscription'));
        }
    },

    async attachPaymentMethod(paymentMethodId, customerId) {
        try {
            await stripe.paymentMethods.attach(paymentMethodId, {
                customer: customerId
            });

            await stripe.customers.update(customerId, {
                invoice_settings: {
                    default_payment_method: paymentMethodId
                }
            });

            return true;
        } catch (error) {
            console.error('Error attaching payment method:', error);
            throw new Error(getStripeErrorMessage(error, 'Failed to attach payment method'));
        }
    },


    async cancelSubscription(subscriptionId, cancelAtPeriodEnd = true) {
        try {
            if (cancelAtPeriodEnd) {
                return await stripe.subscriptions.update(subscriptionId, {
                    cancel_at_period_end: true
                });
            } else {
                return await stripe.subscriptions.cancel(subscriptionId);
            }
        } catch (error) {
            console.error('Error canceling Stripe subscription:', error);
            throw new Error(getStripeErrorMessage(error, 'Failed to cancel Stripe subscription'));
        }
    },


    async resumeSubscription(subscriptionId) {
        try {
            return await stripe.subscriptions.update(subscriptionId, {
                cancel_at_period_end: false
            });
        } catch (error) {
            console.error('Error resuming Stripe subscription:', error);
            throw new Error(getStripeErrorMessage(error, 'Failed to resume Stripe subscription'));
        }
    },


    async updateSubscription(subscriptionId, newPriceId) {
        try {
            const subscription = await stripe.subscriptions.retrieve(subscriptionId);

            return await stripe.subscriptions.update(subscriptionId, {
                items: [{
                    id: subscription.items.data[0].id,
                    price: newPriceId
                }],
                proration_behavior: 'create_prorations'
            });
        } catch (error) {
            console.error('Error updating Stripe subscription:', error);
            throw new Error(getStripeErrorMessage(error, 'Failed to update Stripe subscription'));
        }
    },

    async getSubscription(subscriptionId) {
        try {
            return await stripe.subscriptions.retrieve(subscriptionId);
        } catch (error) {
            console.error('Error retrieving Stripe subscription:', error);
            throw new Error(getStripeErrorMessage(error, 'Failed to retrieve Stripe subscription'));
        }
    },


    async createBillingPortalSession(customerId, returnUrl) {
        try {
            const session = await stripe.billingPortal.sessions.create({
                customer: customerId,
                return_url: returnUrl
            });
            return { url: session.url };
        } catch (error) {
            console.error('Error creating Stripe billing portal session:', error);
            throw new Error(getStripeErrorMessage(error, 'Failed to create billing portal session'));
        }
    },


    async createProduct(name, description = null, metadata = {}) {
        try {
            const product = await stripe.products.create({
                name,
                description: description || undefined,
                metadata
            });
            return product;
        } catch (error) {
            console.error('Error creating Stripe product:', error);
            throw new Error(getStripeErrorMessage(error, 'Failed to create Stripe product'));
        }
    },


    async createPrice(productId, plan) {
        try {
            const currencyValue = plan.currency?.code || plan.currency || 'usd';
            const currency = currencyValue.toString().toLowerCase();
            const amount = plan.price;
            const unitAmount = Math.round(amount * 100);

            const isRecurring = plan.billing_cycle === 'monthly' || plan.billing_cycle === 'yearly';
            const priceParams = {
                product: productId,
                currency,
                unit_amount: unitAmount,
                metadata: { plan_slug: plan.slug || '' }
            };

            if (isRecurring) {
                priceParams.recurring = {
                    interval: plan.billing_cycle === 'yearly' ? 'year' : 'month'
                };
            }

            const price = await stripe.prices.create(priceParams);
            return price;
        } catch (error) {
            console.error('Error creating Stripe price:', error);
            throw new Error(getStripeErrorMessage(error, 'Failed to create Stripe price'));
        }
    },


    async createPaymentLink(priceId, options = {}) {
        try {
            const params = {
                line_items: [{ price: priceId, quantity: 1 }],
                metadata: options.metadata || {}
            };
            if (options.afterCompletionUrl) {
                params.after_completion = {
                    type: 'redirect',
                    redirect: { url: options.afterCompletionUrl }
                };
            }
            const paymentLink = await stripe.paymentLinks.create(params);
            return { id: paymentLink.id, url: paymentLink.url };
        } catch (error) {
            console.error('Error creating Stripe payment link:', error);
            throw new Error(getStripeErrorMessage(error, 'Failed to create Stripe payment link'));
        }
    },


    async createPriceAndPaymentLinkForExistingProduct(plan, productId) {
        try {
            if (!process.env.STRIPE_SECRET_KEY || !productId) return null;
            const price = await this.createPrice(productId, plan);
            const paymentLink = await this.createPaymentLink(price.id, {
                metadata: { plan_id: plan._id.toString() }
            });
            return {
                priceId: price.id,
                paymentLinkId: paymentLink.id,
                paymentLinkUrl: paymentLink.url
            };
        } catch (error) {
            console.error('Error creating Stripe price/payment link for plan update:', error);
            throw error;
        }
    },


    async createProductPriceAndPaymentLink(plan) {
        try {
            if (!process.env.STRIPE_SECRET_KEY) return null;

            const product = await this.createProduct(
                plan.name,
                plan.description || undefined,
                { plan_id: plan._id.toString() }
            );

            const price = await this.createPrice(product.id, plan);

            const paymentLink = await this.createPaymentLink(price.id, {
                metadata: { plan_id: plan._id.toString() }
            });

            return {
                productId: product.id,
                priceId: price.id,
                paymentLinkId: paymentLink.id,
                paymentLinkUrl: paymentLink.url
            };
        } catch (error) {
            console.error('Error creating Stripe product/price/payment link for plan:', error);
            return null;
        }
    }
};


export const RazorpayService = {

    async createOrGetCustomer(user) {
        try {
            if (user.razorpay_customer_id) {
                try {
                    const customer = await razorpay.customers.fetch(user.razorpay_customer_id);
                    return customer;
                } catch (error) {
                }
            }

            const customer = await razorpay.customers.create({
                name: user.name,
                email: user.email,
                contact: user.phone,
                fail_existing: 0,
                notes: {
                    user_id: user._id.toString()
                }
            });

            return customer;
        } catch (error) {
            console.error('Error creating Razorpay customer:', error);
            throw new Error(getRazorpayErrorMessage(error, 'Failed to create Razorpay customer'));
        }
    },


    async createSubscription(customerId, planId, totalCount = 0, startAt = null) {
        try {
            const subscriptionData = {
                plan_id: planId,
                customer_id: customerId,
                total_count: totalCount,
                quantity: 1,
                notify: 1,
                notes: {
                    created_by: 'wapi_app'
                }
            };

            if (startAt) {
                subscriptionData.start_at = Math.floor(new Date(startAt).getTime() / 1000);
            }

            const subscription = await razorpay.subscriptions.create(subscriptionData);
            return subscription;
        } catch (error) {
            console.error('Error creating Razorpay subscription:', error);
            throw new Error(getRazorpayErrorMessage(error, 'Failed to create Razorpay subscription'));
        }
    },

    async cancelSubscription(subscriptionId, atCycleEnd = true) {
        try {
            const cancelType = atCycleEnd ? 1 : 0;

            const response = await razorpay.subscriptions.cancel(
                subscriptionId,
                cancelType
            );

            console.log('Razorpay cancel response:', response);
            return response;
        } catch (error) {
            console.error('Error canceling Razorpay subscription:', error?.error || error);
            throw new Error(getRazorpayErrorMessage(error, 'Failed to cancel Razorpay subscription'));
        }
    },

    async pauseSubscription(subscriptionId) {
        try {
            return await razorpay.subscriptions.pause(subscriptionId);
        } catch (error) {
            console.error('Error pausing Razorpay subscription:', error);
            throw new Error(getRazorpayErrorMessage(error, 'Failed to pause Razorpay subscription'));
        }
    },


    async resumeSubscription(subscriptionId) {
        try {
            return await razorpay.subscriptions.resume(subscriptionId);
        } catch (error) {
            console.error('Error resuming Razorpay subscription:', error);
            throw new Error(getRazorpayErrorMessage(error, 'Failed to resume Razorpay subscription'));
        }
    },


    async updateSubscription(subscriptionId, updateData) {
        try {
            return await razorpay.subscriptions.update(subscriptionId, updateData);
        } catch (error) {
            console.error('Error updating Razorpay subscription:', error);
            throw new Error(getRazorpayErrorMessage(error, 'Failed to update Razorpay subscription'));
        }
    },


    async getSubscription(subscriptionId) {
        try {
            return await razorpay.subscriptions.fetch(subscriptionId);
        } catch (error) {
            console.error('Error retrieving Razorpay subscription:', error);
            throw new Error(getRazorpayErrorMessage(error, 'Failed to retrieve Razorpay subscription'));
        }
    },


    verifyPaymentSignature(razorpayPaymentId, razorpaySubscriptionId, razorpaySignature) {
        try {
            const generatedSignature = crypto
                .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
                .update(`${razorpayPaymentId}|${razorpaySubscriptionId}`)
                .digest('hex');

            return generatedSignature === razorpaySignature;
        } catch (error) {
            console.error('Error verifying payment signature:', error);
            return false;
        }
    },

    verifyWebhookSignature(body, signature) {
        try {
            const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
            if (!secret) return false;

            const bodyString = typeof body === 'string'
                ? body
                : JSON.stringify(body);

            const expectedSignature = crypto
                .createHmac('sha256', secret)
                .update(bodyString)
                .digest('hex');

            return expectedSignature === signature;
        } catch (error) {
            console.error('Error verifying webhook signature:', error);
            return false;
        }
    },

    async createPlan(plan) {
        try {
            const currencyValue = plan.currency?.code || plan.currency || 'INR';
            const currency = currencyValue.toString().toUpperCase();
            console.log("currency" , currency)
            const amount = Math.max(100, Math.round((plan.price || 0) * 100));
            const period = (plan.billing_cycle === 'yearly' || plan.billing_cycle === 'lifetime') ? 'yearly' : 'monthly';
            const interval = 1;

            const item = {
                name: plan.name || 'Plan',
                amount,
                currency,
                description: (plan.description || '').substring(0, 500)
            };

            const notes = { plan_id: plan._id?.toString() || '' };

            const created = await razorpay.plans.create({
                period,
                interval,
                item,
                notes
            });

            return created;
        } catch (error) {
            console.error('Error creating Razorpay plan:', error);
            throw new Error(getRazorpayErrorMessage(error, 'Failed to create Razorpay plan'));
        }
    },


    async createSubscriptionLink(planId, userId, options = {}) {
        try {
            const billingCycle = options.billingCycle || 'monthly';
            const totalCount = options.totalCount != null
                ? options.totalCount
                : 10;

            const payload = {
                plan_id: planId,
                total_count: totalCount,
                quantity: 1,
                customer_notify: options.customerNotify !== false,
                notes: {
                    user_id: userId.toString(),
                    ...(options.planIdDb && { plan_id_db: options.planIdDb.toString() })
                }
            };

            if (options.expireBy) {
                payload.expire_by = Math.floor(new Date(options.expireBy).getTime() / 1000);
            }

            if (options.notifyEmail || options.notifyPhone) {
                payload.notify_info = {};
                if (options.notifyEmail) payload.notify_info.notify_email = options.notifyEmail;
                if (options.notifyPhone) payload.notify_info.notify_phone = options.notifyPhone;
            }

            const subscription = await razorpay.subscriptions.create(payload);
            return {
                id: subscription.id,
                short_url: subscription.short_url
            };
        } catch (error) {
            console.error('Error creating Razorpay subscription link:', error);
            throw new Error(getRazorpayErrorMessage(error, 'Failed to create Razorpay subscription link'));
        }
    }
};

const PAYPAL_WEBHOOK_EVENTS = [
    { name: 'BILLING.SUBSCRIPTION.ACTIVATED' },
    { name: 'BILLING.SUBSCRIPTION.CANCELLED' },
    { name: 'BILLING.SUBSCRIPTION.EXPIRED' },
    { name: 'BILLING.SUBSCRIPTION.SUSPENDED' },
    { name: 'BILLING.SUBSCRIPTION.CREATED' },
    { name: 'BILLING.SUBSCRIPTION.UPDATED' },
    { name: 'PAYMENT.SALE.COMPLETED' },
    { name: 'PAYMENT.SALE.DENIED' },
    { name: 'PAYMENT.SALE.PENDING' },
    { name: 'PAYMENT.SALE.REFUNDED' }
];

export const PayPalService = {
    async getPayPalConfig() {
        const setting = await Setting.findOne().lean();
        const clientId = setting?.paypal_client_id || process.env.PAYPAL_CLIENT_ID;
        const clientSecret = setting?.paypal_client_secret || process.env.PAYPAL_CLIENT_SECRET;
        const mode = setting?.paypal_mode || process.env.PAYPAL_MODE || 'sandbox';

        if (!clientId || !clientSecret) return null;

        return {
            clientId,
            clientSecret,
            apiUrl: mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com'
        };
    },

    async getAccessToken() {
        try {
            const config = await this.getPayPalConfig();
            if (!config) throw new Error('PayPal credentials not configured');

            const auth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
            const response = await axios({
                url: `${config.apiUrl}/v1/oauth2/token`,
                method: 'post',
                data: 'grant_type=client_credentials',
                headers: {
                    'Accept': 'application/json',
                    'Accept-Language': 'en_US',
                    'Authorization': `Basic ${auth}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            return { token: response.data.access_token, apiUrl: config.apiUrl };
        } catch (error) {
            console.error('Error getting PayPal access token:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with PayPal');
        }
    },

    async createProduct(plan) {
        try {
            const { token, apiUrl } = await this.getAccessToken();
            const response = await axios({
                url: `${apiUrl}/v1/catalogs/products`,
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                data: {
                    name: plan.name,
                    description: plan.description || 'Subscription Plan',
                    type: 'SERVICE',
                    category: 'SOFTWARE'
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error creating PayPal product:', error.response?.data || error.message);
            throw new Error('Failed to create PayPal product');
        }
    },

    async createPlan(plan, productId) {
        try {
            const { token, apiUrl } = await this.getAccessToken();
            const currency = (plan.currency?.code || plan.currency || 'USD').toString().toUpperCase();

            let intervalUnit = 'MONTH';
            if (plan.billing_cycle === 'yearly') intervalUnit = 'YEAR';

            const response = await axios({
                url: `${apiUrl}/v1/billing/plans`,
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                data: {
                    product_id: productId,
                    name: plan.name,
                    description: plan.description || 'Subscription Plan',
                    status: 'ACTIVE',
                    billing_cycles: [
                        {
                            frequency: {
                                interval_unit: intervalUnit,
                                interval_count: 1
                            },
                            tenure_type: 'REGULAR',
                            sequence: 1,
                            total_cycles: 0, 
                            pricing_scheme: {
                                fixed_price: {
                                    value: plan.price.toFixed(2),
                                    currency_code: currency
                                }
                            }
                        }
                    ],
                    payment_preferences: {
                        auto_bill_outstanding: true,
                        setup_fee_failure_action: 'CONTINUE',
                        payment_failure_threshold: 3
                    }
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error creating PayPal plan:', error.response?.data || error.message);
            throw new Error('Failed to create PayPal plan');
        }
    },

    async createSubscription(paypalPlanId, userId, returnUrl, cancelUrl) {
        try {
            const { token, apiUrl } = await this.getAccessToken();
            const response = await axios({
                url: `${apiUrl}/v1/billing/subscriptions`,
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                    'PayPal-Request-Id': `sub-${userId}-${Date.now()}`
                },
                data: {
                    plan_id: paypalPlanId,
                    custom_id: userId.toString(),
                    application_context: {
                        brand_name: 'Wapi',
                        locale: 'en-US',
                        shipping_preference: 'NO_SHIPPING',
                        user_action: 'SUBSCRIBE_NOW',
                        return_url: returnUrl,
                        cancel_url: cancelUrl
                    }
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error creating PayPal subscription:', error.response?.data || error.message);
            throw new Error('Failed to create PayPal subscription');
        }
    },

    async cancelSubscription(subscriptionId, reason = 'Not needed anymore') {
        try {
            const { token, apiUrl } = await this.getAccessToken();
            await axios({
                url: `${apiUrl}/v1/billing/subscriptions/${subscriptionId}/cancel`,
                method: 'post',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                data: { reason }
            });
            return true;
        } catch (error) {
            console.error('Error cancelling PayPal subscription:', error.response?.data || error.message);
            throw new Error('Failed to cancel PayPal subscription');
        }
    },

    async getSubscription(subscriptionId) {
        try {
            const { token, apiUrl } = await this.getAccessToken();
            const response = await axios({
                url: `${apiUrl}/v1/billing/subscriptions/${subscriptionId}`,
                method: 'get',
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error getting PayPal subscription:', error.response?.data || error.message);
            throw new Error('Failed to retrieve PayPal subscription');
        }
    },

    async registerWebhook(webhookUrl, credentials = null) {
        try {
            let token, apiUrl;

            if (credentials && credentials.clientId && credentials.clientSecret) {
                const auth = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64');
                apiUrl = credentials.mode === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';
                const response = await axios({
                    url: `${apiUrl}/v1/oauth2/token`,
                    method: 'post',
                    data: 'grant_type=client_credentials',
                    headers: {
                        'Accept': 'application/json',
                        'Accept-Language': 'en_US',
                        'Authorization': `Basic ${auth}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                });
                token = response.data.access_token;
            } else {
                const config = await this.getAccessToken();
                token = config.token;
                apiUrl = config.apiUrl;
            }

            const listResponse = await axios({
                url: `${apiUrl}/v1/notifications/webhooks`,
                method: 'get',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            const existingWebhook = listResponse.data.webhooks.find(w => w.url === webhookUrl);
            if (existingWebhook) {
                await axios({
                    url: `${apiUrl}/v1/notifications/webhooks/${existingWebhook.id}`,
                    method: 'delete',
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
            }

            const createResponse = await axios({
                url: `${apiUrl}/v1/notifications/webhooks`,
                method: 'post',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                data: {
                    url: webhookUrl,
                    event_types: PAYPAL_WEBHOOK_EVENTS
                }
            });

            return createResponse.data;
        } catch (error) {
            console.error('Error registering PayPal webhook:', error.response?.data || error.message);
            throw new Error('Failed to register PayPal webhook');
        }
    }
};

export { stripe, razorpay };
