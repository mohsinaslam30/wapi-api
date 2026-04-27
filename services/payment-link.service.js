

import { PaymentGatewayConfig, PaymentTransaction, Contact, UserSetting } from '../models/index.js';
import paymentGatewayService from './payment-gateway.service.js';
import { getPaymentReminderQueue } from '../queues/payment-reminder-queue.js';

class PaymentLinkService {


  async sendPaymentLink(opts) {
    const {
      context,
      context_id,
      user_id,
      contact_id,
      gateway_config_id,
      amount,
      currency = 'INR',
      payment_type = 'full',
      description = 'Payment',
      whatsapp_phone_number_id,
      templateConfig = null,
      metadata = {}
    } = opts;

    if (!context || !context_id || !user_id || !contact_id) {
      throw new Error('context, context_id, user_id, and contact_id are required');
    }

    if (!amount || amount <= 0) {
      throw new Error('amount must be a positive number');
    }

    const gatewayQuery = {
      user_id,
      is_active: true,
      deleted_at: null
    };
    if (gateway_config_id) gatewayQuery._id = gateway_config_id;

    const gatewayConfig = await PaymentGatewayConfig.findOne(gatewayQuery).lean();
    if (!gatewayConfig) {
      throw new Error('No active payment gateway found. Please configure a payment gateway first.');
    }

    const contact = await Contact.findById(contact_id).lean();
    if (!contact) throw new Error('Contact not found');

    const baseUrl = process.env.APP_URL || 'https://yourdomain.com';
    const linkResult = await paymentGatewayService.createPaymentLink(gatewayConfig, {
      amount,
      currency,
      description,
      reference: context_id.toString(),
      context,
      returnUrl: `${baseUrl}/payment/success?ref=${context_id}`,
      cancelUrl: `${baseUrl}/payment/cancel?ref=${context_id}`
    });

    let finalPhId = whatsapp_phone_number_id;
    if (!finalPhId) {
      const { WhatsappPhoneNumber } = await import('../models/index.js');
      const phone = await WhatsappPhoneNumber.findOne({ user_id: user_id });
      finalPhId = phone?._id;
    }

    const transaction = await PaymentTransaction.create({
      user_id,
      context,
      context_id,
      gateway_config_id: gatewayConfig._id,
      gateway: gatewayConfig.gateway,
      gateway_order_id: linkResult.gateway_order_id,
      payment_link: linkResult.payment_link,
      payment_type,
      amount,
      currency,
      status: 'pending',
      metadata: { ...linkResult.raw, ...metadata },
      whatsapp_phone_number_id: finalPhId
    });

    await this._sendWhatsAppPaymentMessage({
      userId: user_id,
      contact,
      paymentLink: linkResult.payment_link,
      amount,
      currency,
      description,
      whatsappPhoneNumberId: finalPhId,
      templateConfig,
      transaction
    });

    try {
      const settings = await UserSetting.findOne({ user_id }).lean();
      if (settings?.payment_reminder_enabled && settings?.payment_reminder_delay > 0) {
        const reminderQueue = getPaymentReminderQueue();

        let delayMs = settings.payment_reminder_delay * 60000;
        if (settings.payment_reminder_unit === 'hours') delayMs *= 60;
        if (settings.payment_reminder_unit === 'days') delayMs *= 60 * 24;

        await reminderQueue.add(
          'send-reminder',
          { transactionId: transaction._id },
          { delay: delayMs, jobId: `reminder-${transaction._id}` }
        );
        console.log(`[PaymentLinkService] Scheduled reminder for transaction ${transaction._id} with delay ${settings.payment_reminder_delay}${settings.payment_reminder_unit}`);
      }
    } catch (err) {
      console.error('[PaymentLinkService] Failed to schedule reminder:', err.message);
    }

    return { transaction, payment_link: linkResult.payment_link };
  }


  async _sendWhatsAppPaymentMessage({ userId, contact, paymentLink, amount, currency, description, whatsappPhoneNumberId, templateConfig, transaction }) {
    try {
      const { default: unifiedWhatsAppService } = await import('./whatsapp/unified-whatsapp.service.js');

      let finalPhId = whatsappPhoneNumberId;
      if (!finalPhId) {
        const { WhatsappPhoneNumber } = await import('../models/index.js');
        const phone = await WhatsappPhoneNumber.findOne({ user_id: userId });
        finalPhId = phone?._id;
      }

      if (templateConfig && templateConfig.templateId) {
        await this._sendTemplatePaymentMessage({
          userId,
          contact,
          paymentLink,
          amount,
          currency,
          templateConfig,
          finalPhId,
          unifiedWhatsAppService
        });
      } else {
        const amountDisplay = (amount / 100).toFixed(2);
        const messageText =
          `💳 *Payment Required*\n\n` +
          `*Description:* ${description}\n` +
          `*Amount:* ${currency} ${amountDisplay}\n\n` +
          `Please complete your payment using the link below:\n` +
          `${paymentLink}\n\n` +
          `_This link is secure and unique to you._`;

        await unifiedWhatsAppService.sendMessage(userId, {
          recipientNumber: contact.phone_number,
          messageType: 'text',
          messageText,
          whatsappPhoneNumberId: finalPhId
        });
      }
    } catch (err) {
      console.error('[PaymentLinkService] Failed to send WhatsApp message:', err.message);
    }
  }

  async _sendTemplatePaymentMessage({ userId, contact, paymentLink, amount, currency, templateConfig, finalPhId, unifiedWhatsAppService }) {
    try {
      const { Template } = await import('../models/index.js');
      const templateDoc = await Template.findById(templateConfig.templateId).lean();
      if (!templateDoc) {
        console.error('[PaymentLinkService] Template not found:', templateConfig.templateId);
        return;
      }

      const mappings = templateConfig.variableMappings || {};
      const booking = templateConfig.booking || {};
      const amountDisplay = (amount / 100).toFixed(2);

      const variables = {};
      for (const [key, source] of Object.entries(mappings)) {
        let value = 'N/A';
        if (source === 'contact_name') value = contact.name || 'Guest';
        else if (source === 'payment_link') value = paymentLink;
        else if (source === 'amount') value = `${currency} ${amountDisplay}`;
        else if (source === 'appointment_time' && booking.start_time) {
          const { default: moment } = await import('moment');
          value = moment(booking.start_time).format('MMM D, YYYY [at] h:mm A');
        }
        variables[key] = value;
      }

      if (Object.keys(variables).length === 0) {
        variables['1'] = contact.name || 'Guest';
        variables['2'] = `${currency} ${amountDisplay}`;
        variables['3'] = paymentLink;
      }

      const templateComponents = [{
        type: 'body',
        parameters: Object.entries(variables)
          .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
          .map(([_, val]) => ({ type: 'text', text: val.toString() }))
      }];

      await unifiedWhatsAppService.sendMessage(userId, {
        recipientNumber: contact.phone_number,
        messageType: 'template',
        whatsappPhoneNumberId: finalPhId,
        templateName: templateDoc.template_name,
        languageCode: templateDoc.language || 'en_US',
        templateComponents
      });
    } catch (err) {
      console.error('[PaymentLinkService] Template send error:', err.message);
    }
  }


  async processWebhookPayment({ gateway, gateway_order_id, gateway_payment_id, status, amount_paid }) {
    const transaction = await PaymentTransaction.findOne({ gateway, gateway_order_id });
    if (!transaction) {
      console.warn(`[PaymentLinkService] No transaction found for ${gateway} order: ${gateway_order_id}`);
      return null;
    }

    if (transaction.status === 'paid' && status === 'paid') {
      console.log(`[PaymentLinkService] Transaction ${transaction._id} already marked as paid. Skipping duplicate processing.`);
      return transaction;
    }

    transaction.status = status;
    transaction.gateway_payment_id = gateway_payment_id;
    if (status === 'paid') transaction.paid_at = new Date();
    await transaction.save();

    if (transaction.context === 'appointment') {
      await this._handleAppointmentPayment(transaction, amount_paid, status);
    } else if (transaction.context === 'catalog') {
      await this._handleCatalogPayment(transaction, amount_paid, status);
    } else if (transaction.context === 'custom') {
      await this._handleCustomPayment(transaction, amount_paid, status);
    }

    return transaction;
  }


  async _handleAppointmentPayment(transaction, amount_paid, status) {
    try {
      const { AppointmentBooking, AppointmentConfig, Contact } = await import('../models/index.js');
      const booking = await AppointmentBooking.findById(transaction.context_id);
      if (!booking) return;

      const config = await AppointmentConfig.findById(booking.config_id).lean();
      const contact = await Contact.findById(booking.contact_id).lean();

      if (status === 'paid') {
        booking.payment_status = 'paid';
        booking.amount_paid = amount_paid || transaction.amount;

        booking.status = 'confirmed';

        await this._sendPaymentSuccessWhatsApp(booking, contact, transaction);

        if (config && config.success_template_id) {
          const { default: appointmentService } = await import('./appointment.service.js');
          await appointmentService.sendAppointmentTemplate(
            booking.user_id,
            booking.contact_id,
            config.confirm_template_id || config.success_template_id,
            booking,
            'confirm',
            transaction.whatsapp_phone_number_id || config.waba_id
          );
        }
      } else if (status === 'failed') {
        booking.payment_status = 'unpaid';
      } else if (status === 'refunded') {
        booking.payment_status = 'unpaid';
        booking.amount_paid = 0;
      }

      booking.payment_transaction_id = transaction._id;
      await booking.save();
      console.log(`[PaymentLinkService] Appointment booking ${booking._id} updated: status=${booking.status}, payment_status=${booking.payment_status}`);
    } catch (err) {
      console.error('[PaymentLinkService] _handleAppointmentPayment error:', err.message);
    }
  }


  async _sendPaymentSuccessWhatsApp(booking, contact, transaction) {
    try {
      const { default: unifiedWhatsAppService } = await import('./whatsapp/unified-whatsapp.service.js');
      const amountDisplay = (transaction.amount / 100).toFixed(2);
      const currency = transaction.currency || 'INR';

      const messageText =
          `✅ *Payment Successful!*\n\n` +
          `Thank you! We have received your payment of *${currency} ${amountDisplay}*.\n\n` +
          `*Booking ID:* ${booking._id.toString().slice(-6).toUpperCase()}\n` +
          `*Status:* Confirmed 🗓️\n\n` +
          `We look forward to seeing you!`;

      await unifiedWhatsAppService.sendMessage(booking.user_id, {
        recipientNumber: contact.phone_number,
        messageType: 'text',
        messageText,
        whatsappPhoneNumberId: transaction.whatsapp_phone_number_id
      });
    } catch (err) {
      console.error('[PaymentLinkService] Payment success notification failed:', err.message);
    }
  }


  async _handleCatalogPayment(transaction, amount_paid, status) {
    try {
      const { EcommerceOrder } = await import('../models/index.js');
      const order = await EcommerceOrder.findById(transaction.context_id);
      if (!order) return;

      if (status === 'paid') {
        order.payment_status = 'paid';
      } else if (status === 'failed') {
        order.payment_status = 'unpaid';
      }

      await order.save();
      console.log(`[PaymentLinkService] Catalog order ${order._id} payment_status → ${order.payment_status}`);
    } catch (err) {
      console.error('[PaymentLinkService] _handleCatalogPayment error:', err.message);
    }
  }


  async _handleCustomPayment(transaction, amount_paid, status) {
    try {
      if (!['paid', 'failed'].includes(status)) return;

      const { UserSetting, Contact } = await import('../models/index.js');
      const { default: unifiedWhatsAppService } = await import('./whatsapp/unified-whatsapp.service.js');

      const contactId = transaction.metadata.contact_id;
      const targetContact = await Contact.findById(contactId).lean();
      if (!targetContact) {
        console.error('[PaymentLinkService] Contact not found for custom payment:', contactId);
        return;
      }

      const settings = await UserSetting.findOne({ user_id: transaction.user_id }).lean();

      let messageText;
      if (status === 'paid') {
        messageText = settings?.payment_success_message ||
          '✅ *Payment Successful!*\n\nThank you! We have received your payment of *{currency} {amount}* for *{description}*.';
      } else {
        messageText = settings?.payment_failed_message ||
          '❌ *Payment Failed*\n\nWe were unable to process your payment of *{currency} {amount}* for *{description}*. Please try again.';
      }

      const amountDisplay = (transaction.amount / 100).toFixed(2);
      const currency = transaction.currency || 'INR';
      const description = transaction.metadata.description || 'Service';

      messageText = messageText
        .replace(/{amount}/g, amountDisplay)
        .replace(/{currency}/g, currency)
        .replace(/{description}/g, description)
        .replace(/{transaction_id}/g, transaction.gateway_payment_id || transaction._id.toString());

      await unifiedWhatsAppService.sendMessage(transaction.user_id, {
        recipientNumber: targetContact.phone_number,
        messageType: 'text',
        messageText,
        whatsappPhoneNumberId: transaction.whatsapp_phone_number_id
      });

      console.log(`[PaymentLinkService] Custom payment ${status} message sent to ${targetContact.phone_number}`);
    } catch (err) {
      console.error('[PaymentLinkService] _handleCustomPayment error:', err.message);
    }
  }
}

export default new PaymentLinkService();
