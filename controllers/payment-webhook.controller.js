

import mongoose from 'mongoose';
import { PaymentGatewayConfig, PaymentTransaction } from '../models/index.js';
import paymentGatewayService from '../services/payment-gateway.service.js';
import paymentLinkService from '../services/payment-link.service.js';

export const handlePaymentWebhook = async (req, res) => {
  const { gateway } = req.params;

  try {
    let payload = req.body;
    if (Buffer.isBuffer(payload)) {
      payload = JSON.parse(payload.toString('utf8'));
    } else if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch (e) {
      }
    }

    const rawBody = req.rawBody || (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));

    let gateway_order_id, gateway_payment_id, status, amount_paid, signatureHeader, reference_id;

    if (gateway === 'razorpay') {
      const event = payload?.event;
      console.log(`[PaymentWebhook] Razorpay event received: ${event}`);
      if (!event) {
        console.warn('[PaymentWebhook] Missing event in Razorpay payload:', typeof req.body, req.body);
      }
      signatureHeader = req.headers['x-razorpay-signature'];

      const payment = payload.payload?.payment?.entity;
      const paymentLink = payload.payload?.payment_link?.entity;
      const entity = payment || paymentLink;

      if (event === 'payment_link.paid' || event === 'payment.captured' || event === 'payment.authorized') {
        gateway_order_id = payment?.payment_link_id || paymentLink?.id || payment?.order_id || payment?.id;
        gateway_payment_id = payment?.id;
        status = 'paid';
        amount_paid = payment?.amount || paymentLink?.amount_paid;
        reference_id = payment?.notes?.reference_id || paymentLink?.reference_id;
      } else if (event === 'payment.failed') {
        gateway_order_id = payment?.payment_link_id || payment?.order_id;
        gateway_payment_id = payment?.id;
        status = 'failed';
        reference_id = payment?.notes?.reference_id;
      } else if (event === 'refund.created') {
        const refund = payload.payload?.refund?.entity;
        gateway_order_id = refund?.payment_id;
        status = 'refunded';
        reference_id = refund?.notes?.reference_id;
      } else {
        return res.json({ success: true, message: `Event ${event} acknowledged (not handled)` });
      }

    } else if (gateway === 'stripe') {
      console.log(`[PaymentWebhook] Stripe event received: ${payload.type}`);
      signatureHeader = req.headers['stripe-signature'];
      const event = payload;

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        gateway_order_id = session.id;
        gateway_payment_id = session.payment_intent;
        status = 'paid';
        amount_paid = session.amount_total;
        reference_id = session.metadata?.reference;
      } else if (event.type === 'checkout.session.expired') {
        gateway_order_id = event.data.object.id;
        status = 'failed';
      } else if (event.type === 'charge.refunded') {
        gateway_order_id = event.data.object.payment_intent;
        status = 'refunded';
      } else {
        return res.json({ success: true, message: 'Event acknowledged (not handled)' });
      }

    } else if (gateway === 'paypal') {
      console.log(`[PaymentWebhook] PayPal event received: ${payload.event_type}`);
      const event = payload;

      if (event.event_type === 'PAYMENT.CAPTURE.COMPLETED') {
        gateway_payment_id = event.resource?.id;
        gateway_order_id = event.resource?.supplementary_data?.related_ids?.order_id || gateway_payment_id;
        status = 'paid';
        amount_paid = parseFloat(event.resource?.amount?.value) * 100;
        reference_id = event.resource?.custom_id || event.resource?.reference_id || event.resource?.purchase_units?.[0]?.reference_id || event.resource?.purchase_units?.[0]?.custom_id;
      } else if (event.event_type === 'CHECKOUT.ORDER.APPROVED') {
        gateway_order_id = event.resource?.id;
        status = 'approved';
        reference_id = event.resource?.purchase_units?.[0]?.custom_id || event.resource?.purchase_units?.[0]?.reference_id;
      } else if (event.event_type === 'PAYMENT.CAPTURE.DENIED') {
        gateway_order_id = event.resource?.supplementary_data?.related_ids?.order_id;
        status = 'failed';
      } else {
        return res.json({ success: true, message: 'Event acknowledged (not handled)' });
      }
    }

    console.log(`[PaymentWebhook] Resolved: order_id=${gateway_order_id}, status=${status}, ref=${reference_id}`);

    let transaction = await PaymentTransaction.findOne({ gateway, gateway_order_id });

    if (!transaction && reference_id && mongoose.Types.ObjectId.isValid(reference_id)) {
      console.log(`[PaymentWebhook] Falling back to reference_id lookup: ${reference_id}`);
      transaction = await PaymentTransaction.findOne({
        gateway,
        context_id: reference_id,
        status: 'pending'
      }).sort({ created_at: -1 });
    }

    if (transaction && signatureHeader) {
      const gatewayConfig = await PaymentGatewayConfig.findById(transaction.gateway_config_id).lean();
      if (gatewayConfig?.webhook_secret) {
        const isValid = paymentGatewayService.verifyWebhookSignature(
          gateway,
          rawBody,
          signatureHeader,
          gatewayConfig.webhook_secret
        );

        if (!isValid) {
          console.warn(`[PaymentWebhook] Invalid signature for ${gateway} order: ${gateway_order_id}`);
          return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
        }
      }
    }

    if (!transaction) {
      console.warn(`[PaymentWebhook] No transaction matched for ${gateway} order: ${gateway_order_id}`);
      return res.json({ success: true, message: 'No matching transaction' });
    }

    res.json({ success: true, received: true });

    console.log(`[PaymentWebhook] Dispatching processWebhookPayment for transaction: ${transaction._id}`);

    if (gateway === 'paypal' && status === 'approved') {
      try {
        const gatewayConfig = await PaymentGatewayConfig.findById(transaction.gateway_config_id).lean();
        const captureResult = await paymentGatewayService._capturePaypalOrder(gatewayConfig.credentials, transaction.gateway_order_id);
        console.log(`[PaymentWebhook] PayPal capture successful for order: ${transaction.gateway_order_id}`);

        status = 'paid';
        gateway_payment_id = captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.id;
        amount_paid = parseFloat(captureResult.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value) * 100;
      } catch (err) {
        console.error(`[PaymentWebhook] PayPal capture failed:`, err.message);
        return res.json({ success: true, message: 'Capture failed' });
      }
    }

    paymentLinkService.processWebhookPayment({
      gateway,
      gateway_order_id: transaction.gateway_order_id,
      gateway_payment_id,
      status,
      amount_paid
    }).catch(err => {
      console.error(`[PaymentWebhook] processWebhookPayment error:`, err.message);
    });

  } catch (error) {
    console.error(`[PaymentWebhook] Error processing ${gateway} webhook:`, error.message);
    res.json({ success: false, message: error.message });
  }
};

export default { handlePaymentWebhook };
