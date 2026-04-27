import Stripe from 'stripe';
import Razorpay from 'razorpay';
import path from 'path';
import nodemailer from 'nodemailer';
import { Setting, Currency } from '../models/index.js';
import { updateEnvFile } from '../utils/env-file.js';
import mongoose from 'mongoose';
import { PayPalService } from '../utils/payment-gateway.service.js';

const STRIPE_WEBHOOK_EVENTS = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'customer.subscription.trial_will_end',
  'checkout.session.completed'
];

const getAllSettings = async (req, res) => {
  const settings = await Setting.findOne().populate('default_currency');
  if (!settings) {
    return res.status(200).json({});
  }
  const out = settings.toObject ? settings.toObject() : { ...settings };

  const logoFields = ['favicon_url', 'logo_light_url', 'logo_dark_url', 'sidebar_light_logo_url', 'sidebar_dark_logo_url'];
  const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

  for (const field of logoFields) {
    if (out[field] && out[field].startsWith('/uploads/') && !isValidUrl(out[field])) {
      out[field] = `${baseUrl}${out[field]}`;
    }
  }

  if (settings.whatsapp_webhook_url) {
    out.whatsapp_webhook_url = settings.whatsapp_webhook_url;
  }

  out.whatsapp_verify_token = process.env.WHATSAPP_VERIFY_TOKEN || '';
  out.smtp_host = process.env.SMTP_HOST || '';
  out.smtp_port = process.env.SMTP_PORT || '';
  out.smtp_user = process.env.SMTP_USER || '';
  out.smtp_pass_set = !!process.env.SMTP_PASS;
  delete out.smtp_pass;
  out.mail_from_name = process.env.MAIL_FROM_NAME || '';
  out.mail_from_email = process.env.MAIL_FROM_EMAIL || '';
  out.support_email = process.env.SUPPORT_EMAIL || '';
  out.maintenance_mode = process.env.MAINTENANCE_MODE === 'true';
  out.google_redirect_uri = process.env.GOOGLE_REDIRECT_URI || '';

  out.google_redirect_uri = `${baseUrl.replace(/\/$/, '')}/api/google/callback`;

  delete out.stripe_secret_key;
  delete out.stripe_webhook_secret;
  delete out.razorpay_key_secret;
  delete out.razorpay_webhook_secret;
  delete out.paypal_client_secret;
  delete out.google_client_secret;

  if (out.stripe_publishable_key && out.stripe_publishable_key.length > 8) {
    out.stripe_publishable_key = out.stripe_publishable_key.substring(0, 8) + '****';
  }

  if (out.aws_access_key_id && out.aws_access_key_id.length > 8) {
    out.aws_access_key_id = out.aws_access_key_id.substring(0, 8) + '****';
  }
  
  if (out.aws_secret_access_key) {
    out.aws_secret_access_key_set = true;
    delete out.aws_secret_access_key;
  }

  if (out.razorpay_key_id && out.razorpay_key_id.length > 8) {
    out.razorpay_key_id = out.razorpay_key_id.substring(0, 8) + '****';
  }

  if (out.paypal_client_id && out.paypal_client_id.length > 8) {
    out.paypal_client_id = out.paypal_client_id.substring(0, 8) + '****';
  }

  if (out.google_client_id && out.google_client_id.length > 8) {
    out.google_client_id = out.google_client_id.substring(0, 8) + '****';
  }

  const client_ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  out.client_ip = client_ip?.replace('::ffff:', '') || '';
  out.maintenance_allowed_ips = settings.maintenance_allowed_ips || [];
  out.whatsapp_phoneno_id = settings.whatsapp_phoneno_id || process.env.PHONENO_ID || '';

  res.status(200).json(out);
};

const updateSetting = async (req, res) => {
  try {
    let setting = await Setting.findOne();
    console.log("req.body" , req.body);
    const processedBody = { ...req.body };

    const logoFields = ['favicon_url', 'logo_light_url', 'logo_dark_url', 'sidebar_light_logo_url', 'sidebar_dark_logo_url'];

    for (const field of logoFields) {
      const uploadedFile = req.files && req.files[field] ? req.files[field] : null;

      if (uploadedFile) {
        const file = Array.isArray(uploadedFile) ? uploadedFile[0] : uploadedFile;
        if (file) {
          processedBody[field] = file.path;
        }
      }
      else if (req.body[field] && isValidUrl(req.body[field])) {
        processedBody[field] = req.body[field];
      }
      else if (req.body[field] === '' || req.body[field] === null) {
        processedBody[field] = '';
      }
    }

    const envVars = {};

    if (req.body.whatsapp_verify_token !== undefined) {
      envVars.WHATSAPP_VERIFY_TOKEN = req.body.whatsapp_verify_token;
    }

    if (req.body.smtp_host !== undefined) {
      envVars.SMTP_HOST = req.body.smtp_host;
    }
    if (req.body.smtp_port !== undefined) {
      envVars.SMTP_PORT = req.body.smtp_port;
    }
    if (req.body.smtp_user !== undefined) {
      envVars.SMTP_USER = req.body.smtp_user;
    }
    if (req.body.smtp_pass !== undefined) {
      envVars.SMTP_PASS = req.body.smtp_pass;
    }
    if (req.body.mail_from_name !== undefined) {
      envVars.MAIL_FROM_NAME = req.body.mail_from_name;
    }
    if (req.body.mail_from_email !== undefined) {
      envVars.MAIL_FROM_EMAIL = req.body.mail_from_email;
    }
    if (req.body.support_email !== undefined) {
      envVars.SUPPORT_EMAIL = req.body.support_email;
    }

    if (req.body.whatsapp_phoneno_id !== undefined) {
      envVars.PHONENO_ID = req.body.whatsapp_phoneno_id;
      processedBody.whatsapp_phoneno_id = req.body.whatsapp_phoneno_id;
    }

    if (req.body.maintenance_mode !== undefined) {
      envVars.MAINTENANCE_MODE = String(req.body.maintenance_mode);
      processedBody.maintenance_mode = req.body.maintenance_mode === true || req.body.maintenance_mode === 'true';
    }

    if (req.body.google_client_id !== undefined) {
      envVars.GOOGLE_CLIENT_ID = req.body.google_client_id;
      processedBody.google_client_id = req.body.google_client_id;
    }
    if (req.body.google_client_secret !== undefined) {
      envVars.GOOGLE_CLIENT_SECRET = req.body.google_client_secret;
      processedBody.google_client_secret = req.body.google_client_secret;
    }

    if (req.body.aws_access_key_id !== undefined) {
      envVars.AWS_ACCESS_KEY_ID = req.body.aws_access_key_id;
    }
    if (req.body.aws_secret_access_key !== undefined) {
      envVars.AWS_SECRET_ACCESS_KEY = req.body.aws_secret_access_key;
    }
    if (req.body.aws_region !== undefined) {
      envVars.AWS_REGION = req.body.aws_region;
    }
    if (req.body.aws_s3_bucket !== undefined) {
      envVars.AWS_S3_BUCKET = req.body.aws_s3_bucket;
    }

    if (req.body.is_aws_s3_enabled !== undefined) {
      processedBody.is_aws_s3_enabled = req.body.is_aws_s3_enabled === true || req.body.is_aws_s3_enabled === 'true';
      envVars.IS_AWS_S3_ENABLED = String(processedBody.is_aws_s3_enabled);
    }

    if (req.body.maintenance_allowed_ips !== undefined) {
      if (typeof req.body.maintenance_allowed_ips === 'string') {
        try {
          processedBody.maintenance_allowed_ips = JSON.parse(req.body.maintenance_allowed_ips);
        } catch {
          processedBody.maintenance_allowed_ips = req.body.maintenance_allowed_ips
            .split(',')
            .map(item => item.trim())
            .filter(item => item);
        }
      } else {
        processedBody.maintenance_allowed_ips = req.body.maintenance_allowed_ips;
      }
    }

    if (req.body.allowed_file_upload_types !== undefined) {
      if (typeof req.body.allowed_file_upload_types === 'string') {
        try {
          processedBody.allowed_file_upload_types = JSON.parse(req.body.allowed_file_upload_types);
        } catch {
          processedBody.allowed_file_upload_types = req.body.allowed_file_upload_types
            .split(',')
            .map(item => item.trim())
            .filter(item => item);
        }
      } else {
        processedBody.allowed_file_upload_types = req.body.allowed_file_upload_types;
      }
    }
    
    if (req.body.storage_limit !== undefined) {
      processedBody.storage_limit = parseInt(req.body.storage_limit) || 100;
    }

    if (req.body.restore_storage_on_delete !== undefined) {
      processedBody.restore_storage_on_delete = req.body.restore_storage_on_delete === true || req.body.restore_storage_on_delete === 'true';
    }

    if (req.body.landing_page_enabled !== undefined) {
      processedBody.landing_page_enabled = Boolean(req.body.landing_page_enabled);
    }

    if (req.body.default_currency !== undefined) {
      if (req.body.default_currency !== null) {
        if (!mongoose.Types.ObjectId.isValid(req.body.default_currency._id)) {
          return res.status(400).json({ error: 'Invalid currency ID' });
        }

        const currencyExists = await Currency.findById(req.body.default_currency._id);
        if (!currencyExists) {
          return res.status(404).json({ error: 'Currency not found' });
        }
      }

      processedBody.default_currency = req.body.default_currency;
    }

    if (setting) {
      const updatedSetting = await Setting.findByIdAndUpdate(setting._id, processedBody, {
        returnDocument: 'after',
        runValidators: true,
      });
      setting = updatedSetting;
    } else {
      setting = await Setting.create(processedBody);
    }

    if (Object.keys(envVars).length > 0) {
      for (const [key, value] of Object.entries(envVars)) {
        process.env[key] = value;
      }

      await updateEnvFile(envVars);
    }

    res.status(200).json(setting);
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};

function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}


const testMail = async (req, res) => {
  try {
    const {
      to,
      smtp_host,
      smtp_port,
      smtp_user,
      smtp_pass,
      mail_from_name,
      mail_from_email
    } = req.body;

    if (!to || typeof to !== 'string' || !to.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Recipient email (to) is required'
      });
    }

    const toEmail = to.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid recipient email address'
      });
    }

    const host = (smtp_host != null && String(smtp_host).trim()) ? String(smtp_host).trim() : (process.env.SMTP_HOST || '');
    const port = (smtp_port != null && smtp_port !== '') ? parseInt(smtp_port, 10) : (parseInt(process.env.SMTP_PORT, 10) || 587);
    const user = (smtp_user != null && String(smtp_user).trim()) ? String(smtp_user).trim() : (process.env.SMTP_USER || '');
    const pass = (smtp_pass != null) ? String(smtp_pass) : (process.env.SMTP_PASS || '');
    const fromName = (mail_from_name != null && String(mail_from_name).trim()) ? String(mail_from_name).trim() : (process.env.MAIL_FROM_NAME || 'WhatsDesk');
    const fromEmail = (mail_from_email != null && String(mail_from_email).trim()) ? String(mail_from_email).trim() : (process.env.MAIL_FROM_EMAIL || user);

    if (!host || !user || !pass) {
      return res.status(400).json({
        success: false,
        message: 'SMTP host, user, and password are required (from request body or existing settings)'
      });
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number.isNaN(port) ? 587 : port,
      secure: port === 465,
      auth: { user, pass }
    });

    const from = `${fromName} <${fromEmail}>`;
    await transporter.sendMail({
      from,
      to: toEmail,
      subject: 'WhatsDesk – Test email',
      html: '<p>This is a test email from your WhatsDesk mail settings. If you received this, your SMTP configuration is working.</p>'
    });

    return res.status(200).json({
      success: true,
      message: 'Test email sent successfully',
      data: { to: toEmail }
    });
  } catch (err) {
    console.error('Error sending test mail:', err);
    const message = err.code === 'EAUTH' ? 'SMTP authentication failed. Check host, port, user and password.' : (err.message || 'Failed to send test email');
    return res.status(400).json({
      success: false,
      message
    });
  }
};


const updateStripeSettings = async (req, res) => {
  try {
    const { stripe_publishable_key, stripe_secret_key } = req.body;

    if (!stripe_secret_key || typeof stripe_secret_key !== 'string' || !stripe_secret_key.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Stripe secret key is required'
      });
    }

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/webhook/stripe`;
    console.log("webhookUrl" , webhookUrl);

    const stripe = new Stripe(stripe_secret_key.trim());

    const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
    for (const ep of endpoints.data) {
      if (ep.url === webhookUrl) {
        await stripe.webhookEndpoints.del(ep.id);
      }
    }

    const endpoint = await stripe.webhookEndpoints.create({
      url: webhookUrl,
      enabled_events: STRIPE_WEBHOOK_EVENTS,
      description: 'WhatsDesk subscription and checkout events'
    });

    const webhookSecret = endpoint.secret;
    if (!webhookSecret) {
      return res.status(500).json({
        success: false,
        message: 'Stripe did not return a webhook signing secret'
      });
    }

    let setting = await Setting.findOne();
    if (!setting) {
      setting = await Setting.create({});
    }

    const update = {
      stripe_secret_key: stripe_secret_key.trim(),
      stripe_webhook_secret: webhookSecret,
      is_stripe_active: req.body.is_stripe_active,
      ...(stripe_publishable_key != null && stripe_publishable_key !== ''
        ? { stripe_publishable_key: stripe_publishable_key.trim() }
        : {})
    };

    const updatedSetting = await Setting.findByIdAndUpdate(
      setting._id,
      update,
      { returnDocument: 'after', runValidators: true }
    );

    process.env.STRIPE_SECRET_KEY = updatedSetting.stripe_secret_key;
    process.env.STRIPE_PUBLISHABLE_KEY = updatedSetting.stripe_publishable_key || '';
    process.env.STRIPE_WEBHOOK_SECRET = updatedSetting.stripe_webhook_secret;

    const envVars = {
      STRIPE_SECRET_KEY: updatedSetting.stripe_secret_key,
      STRIPE_PUBLISHABLE_KEY: updatedSetting.stripe_publishable_key || '',
      STRIPE_WEBHOOK_SECRET: updatedSetting.stripe_webhook_secret
    };
    await updateEnvFile(envVars);

    const response = updatedSetting.toObject();

    response.stripe_secret_key = stripe_secret_key.trim();

    response.stripe_webhook_secret = webhookSecret;
    response.webhook_url = webhookUrl;
    response.is_stripe_active = updatedSetting.is_stripe_active;
    return res.status(200).json({
      success: true,
      message: 'Stripe keys and webhook configured successfully',
      data: response
    });
  } catch (err) {
    console.error('Error updating Stripe settings:', err);
    const message = err.type === 'StripeInvalidRequestError'
      ? (err.message || 'Invalid Stripe key or request')
      : 'Failed to configure Stripe';
    return res.status(400).json({
      success: false,
      message
    });
  }
};


const getStripeSettings = async (req, res) => {
  try {
    const setting = await Setting.findOne().select('stripe_publishable_key stripe_secret_key stripe_webhook_secret').lean();
    if (!setting) {
      return res.status(200).json({ data: null });
    }
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/webhook/stripe`;

    let maskedSecretKey = null;
    if (setting.stripe_secret_key && setting.stripe_secret_key.length > 8) {
      maskedSecretKey = setting.stripe_secret_key.substring(0, 8) + '****';
    }

    let maskedPublishableKey = null;
    if (setting.stripe_publishable_key && setting.stripe_publishable_key.length > 8) {
      maskedPublishableKey = setting.stripe_publishable_key.substring(0, 8) + '****';
    }

    return res.status(200).json({
      data: {
        stripe_publishable_key: maskedPublishableKey,
        stripe_secret_key: maskedSecretKey,
        stripe_webhook_secret: setting.stripe_webhook_secret ? (setting.stripe_webhook_secret.substring(0, 8) + '****') : null,
        is_stripe_active: (setting.is_stripe_active || false),
        webhook_url: webhookUrl
      }
    });
  } catch (err) {
    console.error('Error getting Stripe settings:', err);
    return res.status(500).json({ success: false, message: 'Failed to get Stripe settings' });
  }
};


const RAZORPAY_WEBHOOK_EVENTS = [
  'payment.authorized',
  'payment.failed',
  'payment.captured',
  'order.paid',
  'invoice.paid',
  'invoice.expired',
  'subscription.authenticated',
  'subscription.activated',
  'subscription.charged',
  'subscription.completed',
  'subscription.updated',
  'subscription.cancelled',
  'subscription.paused',
  'subscription.resumed',
  'subscription.pending',
  'subscription.halted'
];

const updateRazorpaySettings = async (req, res) => {
  try {
    const { razorpay_key_id, razorpay_key_secret, razorpay_webhook_secret } = req.body;

    if (!razorpay_key_id || typeof razorpay_key_id !== 'string' || !razorpay_key_id.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Razorpay key ID is required'
      });
    }
    if (!razorpay_key_secret || typeof razorpay_key_secret !== 'string' || !razorpay_key_secret.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Razorpay key secret is required'
      });
    }

    const rp = new Razorpay({
      key_id: razorpay_key_id.trim(),
      key_secret: razorpay_key_secret.trim()
    });
    try {
      await rp.plans.all({ count: 1 });
    } catch (apiErr) {
      const msg = apiErr.error?.description || apiErr.description || apiErr.message || 'Invalid Razorpay keys';
      return res.status(400).json({
        success: false,
        message: msg
      });
    }

    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/webhook/razorpay`;

    let webhookSecret = razorpay_webhook_secret;
    if (!webhookSecret || webhookSecret.trim() === '') {
      webhookSecret = require('crypto').randomBytes(16).toString('hex');
    } else {
      webhookSecret = webhookSecret.trim();
    }

    try {
      const endpoints = await rp.webhooks.all();
      if (endpoints && endpoints.items) {
        for (const ep of endpoints.items) {
          if (ep.url === webhookUrl) {
            await rp.webhooks.delete(ep.id);
          }
        }
      }

      const payload = {
        url: webhookUrl,
        active: true,
        events: RAZORPAY_WEBHOOK_EVENTS,
        secret: webhookSecret
      };

      try {
        await rp.webhooks.create(payload);
      } catch (createErr) {
        console.log("Array format failed or something else, trying object format...");
        const eventsObj = {};
        RAZORPAY_WEBHOOK_EVENTS.forEach(e => eventsObj[e] = true);
        payload.events = eventsObj;
        await rp.webhooks.create(payload);
      }
    } catch (e) {
      console.log('Ignore Razorpay webhook configuration error (might be restricted by Razorpay keys):', e.message);
    }

    let setting = await Setting.findOne();
    if (!setting) {
      setting = await Setting.create({});
    }

    const update = {
      razorpay_key_id: razorpay_key_id.trim(),
      razorpay_key_secret: razorpay_key_secret.trim(),
      is_razorpay_active: req.body.is_razorpay_active,
      razorpay_webhook_secret: webhookSecret
    };

    const updatedSetting = await Setting.findByIdAndUpdate(
      setting._id,
      update,
      { returnDocument: 'after', runValidators: true }
    );

    process.env.RAZORPAY_KEY_ID = updatedSetting.razorpay_key_id;
    process.env.RAZORPAY_KEY_SECRET = updatedSetting.razorpay_key_secret;
    process.env.RAZORPAY_WEBHOOK_SECRET = updatedSetting.razorpay_webhook_secret || '';

    const envVars = {
      RAZORPAY_KEY_ID: updatedSetting.razorpay_key_id,
      RAZORPAY_KEY_SECRET: updatedSetting.razorpay_key_secret,
      RAZORPAY_WEBHOOK_SECRET: updatedSetting.razorpay_webhook_secret || ''
    };
    await updateEnvFile(envVars);

    const response = updatedSetting.toObject();
    delete response.razorpay_key_secret;
    delete response.razorpay_webhook_secret;
    response.razorpay_key_secret_set = true;
    response.razorpay_webhook_secret_set = !!(updatedSetting.razorpay_webhook_secret);
    response.webhook_url = webhookUrl;
    response.is_razorpay_active = updatedSetting.is_razorpay_active;

    return res.status(200).json({
      success: true,
      message: 'Razorpay keys and webhook configured successfully.',
      data: response
    });
  } catch (err) {
    console.error('Error updating Razorpay settings:', err);
    return res.status(400).json({
      success: false,
      message: err.message || 'Failed to configure Razorpay'
    });
  }
};

const getRazorpaySettings = async (req, res) => {
  try {
    const setting = await Setting.findOne().select('razorpay_key_id razorpay_key_secret razorpay_webhook_secret').lean();
    if (!setting) {
      return res.status(200).json({ data: null });
    }
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/webhook/razorpay`;

    let maskedKeyId = null;
    if (setting.razorpay_key_id && setting.razorpay_key_id.length > 8) {
      maskedKeyId = setting.razorpay_key_id.substring(0, 8) + '****';
    }

    return res.status(200).json({
      data: {
        razorpay_key_id: maskedKeyId,
        razorpay_key_secret_set: setting.razorpay_key_secret,
        razorpay_webhook_secret_set: setting.razorpay_webhook_secret,
        is_razorpay_active: (setting.is_razorpay_active || false),
        webhook_url: webhookUrl
      }
    });
  } catch (err) {
    console.error('Error getting Razorpay settings:', err);
    return res.status(500).json({ success: false, message: 'Failed to get Razorpay settings' });
  }
};

const getPayPalSettings = async (req, res) => {
  try {
    const setting = await Setting.findOne().select('paypal_client_id paypal_client_secret paypal_mode is_paypal_active paypal_webhook_id').lean();
    if (!setting) {
      return res.status(200).json({ data: null });
    }
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/webhook/paypal`;

    let maskedClientId = null;
    if (setting.paypal_client_id && setting.paypal_client_id.length > 8) {
      maskedClientId = setting.paypal_client_id.substring(0, 8) + '****';
    }

    return res.status(200).json({
      data: {
        paypal_client_id: maskedClientId,
        paypal_client_secret_set: !!setting.paypal_client_secret,
        paypal_mode: setting.paypal_mode || 'sandbox',
        is_paypal_active: setting.is_paypal_active || false,
        paypal_webhook_id: setting.paypal_webhook_id ? (setting.paypal_webhook_id.substring(0, 8) + '****') : null,
        webhook_url: webhookUrl
      }
    });
  } catch (err) {
    console.error('Error getting PayPal settings:', err);
    return res.status(500).json({ success: false, message: 'Failed to get PayPal settings' });
  }
};

const updatePayPalSettings = async (req, res) => {
  try {
    const { paypal_client_id, paypal_client_secret, paypal_mode, is_paypal_active } = req.body;

    if (!paypal_client_id || !paypal_client_id.trim()) {
      return res.status(400).json({ success: false, message: 'PayPal client ID is required' });
    }
    if (!paypal_client_secret || !paypal_client_secret.trim()) {
      return res.status(400).json({ success: false, message: 'PayPal client secret is required' });
    }
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const webhookUrl = `${baseUrl.replace(/\/$/, '')}/api/webhook/paypal`;

    let webhookId = null;
    try {
      const webhook = await PayPalService.registerWebhook(webhookUrl, {
        clientId: paypal_client_id.trim(),
        clientSecret: paypal_client_secret.trim(),
        mode: paypal_mode || 'sandbox'
      });
      webhookId = webhook.id;
    } catch (e) {
      console.error('Error registering PayPal webhook during settings update:', e.message);
    }

    let setting = await Setting.findOne();
    if (!setting) {
      setting = await Setting.create({});
    }

    setting.paypal_client_id = paypal_client_id.trim();
    setting.paypal_client_secret = paypal_client_secret.trim();
    setting.paypal_mode = paypal_mode || 'sandbox';
    setting.is_paypal_active = is_paypal_active;
    setting.paypal_webhook_id = webhookId;
    await setting.save();

    const envVars = {
      PAYPAL_CLIENT_ID: setting.paypal_client_id,
      PAYPAL_CLIENT_SECRET: setting.paypal_client_secret,
      PAYPAL_MODE: setting.paypal_mode,
      PAYPAL_WEBHOOK_ID: webhookId || ''
    };
    await updateEnvFile(envVars);

    Object.assign(process.env, envVars);

    const response = setting.toObject();
    delete response.paypal_client_secret;
    response.paypal_client_secret_set = true;
    response.webhook_url = webhookUrl;

    return res.status(200).json({
      success: true,
      message: 'PayPal settings and webhook configured successfully',
      data: response
    });
  } catch (err) {
    console.error('Error updating PayPal settings:', err);
    return res.status(400).json({
      success: false,
      message: err.message || 'Failed to configure PayPal'
    });
  }
};

const getGoogleSettings = async (req, res) => {
  try {
    const setting = await Setting.findOne().select('google_client_id google_client_secret google_redirect_uri').lean();
    if (!setting) {
      return res.status(200).json({ data: null });
    }

    let maskedClientId = null;
    if (setting.google_client_id && setting.google_client_id.length > 8) {
      maskedClientId = setting.google_client_id.substring(0, 8) + '****';
    }

    return res.status(200).json({
      data: {
        google_client_id: maskedClientId,
        google_client_secret_set: !!setting.google_client_secret,
        google_redirect_uri: setting.google_redirect_uri || null
      }
    });
  } catch (err) {
    console.error('Error getting Google settings:', err);
    return res.status(500).json({ success: false, message: 'Failed to get Google settings' });
  }
};

const updateGoogleSettings = async (req, res) => {
  try {
    const { google_client_id, google_client_secret, google_redirect_uri } = req.body;

    if (!google_client_id || typeof google_client_id !== 'string' || !google_client_id.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Google client ID is required'
      });
    }
    if (!google_client_secret || typeof google_client_secret !== 'string' || !google_client_secret.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Google client secret is required'
      });
    }
    if (!google_redirect_uri || typeof google_redirect_uri !== 'string' || !google_redirect_uri.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Google redirect URI is required'
      });
    }

    let setting = await Setting.findOne();
    if (!setting) {
      setting = await Setting.create({});
    }

    const update = {
      google_client_id: google_client_id.trim(),
      google_client_secret: google_client_secret.trim(),
      google_redirect_uri: google_redirect_uri.trim()
    };

    const updatedSetting = await Setting.findByIdAndUpdate(
      setting._id,
      update,
      { returnDocument: 'after', runValidators: true }
    );

    process.env.GOOGLE_CLIENT_ID = updatedSetting.google_client_id;
    process.env.GOOGLE_CLIENT_SECRET = updatedSetting.google_client_secret;
    process.env.GOOGLE_REDIRECT_URI = updatedSetting.google_redirect_uri;

    const envVars = {
      GOOGLE_CLIENT_ID: updatedSetting.google_client_id,
      GOOGLE_CLIENT_SECRET: updatedSetting.google_client_secret,
      GOOGLE_REDIRECT_URI: updatedSetting.google_redirect_uri
    };
    await updateEnvFile(envVars);

    const response = updatedSetting.toObject();
    delete response.google_client_secret;
    response.google_client_secret_set = true;

    return res.status(200).json({
      success: true,
      message: 'Google OAuth settings configured successfully',
      data: response
    });
  } catch (err) {
    console.error('Error updating Google settings:', err);
    return res.status(400).json({
      success: false,
      message: err.message || 'Failed to configure Google OAuth'
    });
  }
};

export { getAllSettings, updateSetting, testMail, updateStripeSettings, getStripeSettings, updateRazorpaySettings, getRazorpaySettings, updatePayPalSettings, getPayPalSettings, updateGoogleSettings, getGoogleSettings };
