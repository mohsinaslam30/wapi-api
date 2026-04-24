import pkg from 'bullmq';
const { Queue, Worker } = pkg;
import IORedis from 'ioredis';
import { PaymentTransaction, UserSetting, Contact } from '../models/index.js';
import unifiedWhatsAppService from '../services/whatsapp/unified-whatsapp.service.js';

let _redisConnection = null;
let _paymentReminderQueue = null;
let _paymentReminderWorker = null;
let _isInitialized = false;

const initializeQueueSystem = () => {
  if (_isInitialized) {
    return { queue: _paymentReminderQueue, worker: _paymentReminderWorker, redisConnection: _redisConnection };
  }

  _isInitialized = true;

  try {
    _redisConnection = new IORedis(process.env.REDIS_URL || {
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    _paymentReminderQueue = new Queue('payment-reminder', {
      connection: _redisConnection,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true,
        removeOnFail: true
      },
    });

    _paymentReminderWorker = new Worker(
      'payment-reminder',
      async (job) => {
        const { transactionId } = job.data;
        console.log(`[PaymentReminderWorker] Checking reminder for transaction: ${transactionId}`);

        const transaction = await PaymentTransaction.findById(transactionId);
        if (!transaction) {
          console.warn(`[PaymentReminderWorker] Transaction not found: ${transactionId}`);
          return;
        }

        // Only send reminder if still pending
        if (transaction.status !== 'pending') {
          console.log(`[PaymentReminderWorker] Transaction ${transactionId} is ${transaction.status}. Skipping reminder.`);
          return;
        }

        const settings = await UserSetting.findOne({ user_id: transaction.user_id }).lean();
        if (!settings || !settings.payment_reminder_enabled) {
          console.log(`[PaymentReminderWorker] Reminders disabled for user: ${transaction.user_id}`);
          return;
        }

        const contactId = transaction.metadata.contact_id;
        const targetContact = await Contact.findById(contactId).lean();
        if (!targetContact) {
            console.error('[PaymentReminderWorker] Contact not found:', contactId);
            return;
        }

        let messageText = settings.payment_reminder_message || 
          '🔔 *Payment Reminder*\n\nYou have a pending payment of *{currency} {amount}* for *{description}*.\n\nPlease complete it using the link: {payment_link}';

        // Variable replacement
        const amountDisplay = (transaction.amount / 100).toFixed(2);
        const currency = transaction.currency || 'INR';
        const description = transaction.metadata.description || 'Service';
        const paymentLink = transaction.payment_link;

        messageText = messageText
          .replace(/{amount}/g, amountDisplay)
          .replace(/{currency}/g, currency)
          .replace(/{description}/g, description)
          .replace(/{payment_link}/g, paymentLink)
          .replace(/{transaction_id}/g, transaction.gateway_payment_id || transaction._id.toString());

        await unifiedWhatsAppService.sendMessage(transaction.user_id, {
          recipientNumber: targetContact.phone_number,
          messageType: 'text',
          messageText,
          whatsappPhoneNumberId: transaction.whatsapp_phone_number_id
        });

        console.log(`[PaymentReminderWorker] Reminder sent to ${targetContact.phone_number} for transaction ${transactionId}`);
      },
      {
        connection: _redisConnection,
        concurrency: 5
      }
    );

    _paymentReminderWorker.on('failed', (job, err) => {
      console.error(`[PaymentReminderWorker] Job ${job.id} failed:`, err.message);
    });

  } catch (error) {
    console.error('[PaymentReminderWorker] Failed to initialize queue:', error.message);
    _paymentReminderQueue = {
      add: async () => { console.warn('PaymentReminderQueue: Redis unavailable'); return { id: 'dummy' }; }
    };
  }

  return { queue: _paymentReminderQueue, worker: _paymentReminderWorker, redisConnection: _redisConnection };
};

export const getPaymentReminderQueue = () => {
  const { queue } = initializeQueueSystem();
  return queue;
};

export default {
    getPaymentReminderQueue
};
