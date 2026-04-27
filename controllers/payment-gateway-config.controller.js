

import { PaymentGatewayConfig, PaymentTransaction } from '../models/index.js';
import paymentGatewayService from '../services/payment-gateway.service.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const parsePaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
  const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(query.limit) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const getWebhookBaseUrl = () => process.env.APP_URL || 'https://yourdomain.com';


export const createGateway = async (req, res) => {
  try {
    const { gateway, display_name, credentials } = req.body;
    if (!gateway || !display_name || !credentials) {
      return res.status(400).json({ success: false, message: 'gateway, display_name, and credentials are required' });
    }

    const tempConfig = { gateway, credentials };

    let webhookInfo = { webhook_id: null, webhook_secret: null };
    try {
      webhookInfo = await paymentGatewayService.registerWebhook(tempConfig, getWebhookBaseUrl());
      console.log(`[PaymentGW] Webhook registered for ${gateway}: ${webhookInfo.webhook_id}`);
    } catch (err) {
      console.warn(`[PaymentGW] Webhook registration failed (non-blocking): ${err.message}`);
    }

    const config = await PaymentGatewayConfig.create({
      user_id: req.user.owner_id,
      gateway,
      display_name,
      credentials,
      is_active: req.body.is_active !== false,
      webhook_id: webhookInfo.webhook_id,
      webhook_secret: webhookInfo.webhook_secret
    });

    const safeConfig = _sanitizeConfig(config.toObject());
    res.status(201).json({ success: true, config: safeConfig, webhook_registered: !!webhookInfo.webhook_id });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getGateways = async (req, res) => {
  try {
    const configs = await PaymentGatewayConfig.find({
      user_id: req.user.owner_id,
      deleted_at: null
    }).lean();

    const safeConfigs = configs.map(_sanitizeConfig);
    res.json({ success: true, configs: safeConfigs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const updateGateway = async (req, res) => {
  try {
    const config = await PaymentGatewayConfig.findOne({
      _id: req.params.id,
      user_id: req.user.owner_id,
      deleted_at: null
    });
    if (!config) return res.status(404).json({ success: false, message: 'Gateway config not found' });

    const { display_name, credentials, is_active } = req.body;

    if (credentials && typeof credentials === 'object') {
      const existingCreds = config.credentials ? config.credentials.toObject() : {};
      const mergedCreds = { ...existingCreds };

      for (const [key, value] of Object.entries(credentials)) {
        if (value && typeof value === 'string' && /^\*+$/.test(value)) {
          continue;
        }
        mergedCreds[key] = value;
      }

      const isChanged = JSON.stringify(existingCreds) !== JSON.stringify(mergedCreds);

      if (isChanged) {
        if (config.webhook_id) {
          try {
            await paymentGatewayService.unregisterWebhook(config.toObject());
          } catch (err) {
            console.warn(`[PaymentGW] Failed to unregister old webhook: ${err.message}`);
          }
        }

        const tempConfig = { gateway: config.gateway, credentials: mergedCreds };
        try {
          const webhookInfo = await paymentGatewayService.registerWebhook(tempConfig, getWebhookBaseUrl());
          config.webhook_id = webhookInfo.webhook_id;
          config.webhook_secret = webhookInfo.webhook_secret;
        } catch (err) {
          console.warn(`[PaymentGW] Webhook re-registration failed: ${err.message}`);
        }

        config.credentials = mergedCreds;
      }
    }

    if (display_name !== undefined) config.display_name = display_name;
    if (is_active !== undefined) config.is_active = is_active;

    await config.save();
    res.json({ success: true, config: _sanitizeConfig(config.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const deleteGateway = async (req, res) => {
  try {
    const config = await PaymentGatewayConfig.findOne({
      _id: req.params.id,
      user_id: req.user.owner_id,
      deleted_at: null
    });
    if (!config) return res.status(404).json({ success: false, message: 'Gateway config not found' });

    try {
      await paymentGatewayService.unregisterWebhook(config.toObject());
    } catch (err) {
      console.warn(`[PaymentGW] Webhook unregister failed on delete: ${err.message}`);
    }

    config.deleted_at = new Date();
    config.is_active = false;
    await config.save();

    res.json({ success: true, message: 'Payment gateway deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const testGateway = async (req, res) => {
  try {
    const config = await PaymentGatewayConfig.findOne({
      _id: req.params.id,
      user_id: req.user.owner_id,
      deleted_at: null
    }).lean();
    if (!config) return res.status(404).json({ success: false, message: 'Gateway config not found' });

    const result = await paymentGatewayService.testConnection(config);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const reregisterWebhook = async (req, res) => {
  try {
    const config = await PaymentGatewayConfig.findOne({
      _id: req.params.id,
      user_id: req.user.owner_id,
      deleted_at: null
    });
    if (!config) return res.status(404).json({ success: false, message: 'Gateway config not found' });

    if (config.webhook_id) {
      try {
        await paymentGatewayService.unregisterWebhook(config.toObject());
      } catch (_) {}
    }

    const webhookInfo = await paymentGatewayService.registerWebhook(config.toObject(), getWebhookBaseUrl());
    config.webhook_id = webhookInfo.webhook_id;
    config.webhook_secret = webhookInfo.webhook_secret;
    await config.save();

    res.json({
      success: true,
      message: 'Webhook re-registered successfully',
      webhook_id: webhookInfo.webhook_id,
      webhook_url: `${getWebhookBaseUrl()}/api/payments/webhook/${config.gateway}`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


export const getTransactions = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { page, limit, skip } = parsePaginationParams(req.query);
    const { status, gateway, search } = req.query;

    const matchFilter = { user_id: userId };

    if (status) {
      matchFilter.status = status;
    }

    if (gateway) {
      matchFilter.gateway = gateway;
    }

    if (search) {
      matchFilter.$or = [
        { transaction_id: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const [totalCount, transactions] = await Promise.all([
      PaymentTransaction.countDocuments(matchFilter),
      PaymentTransaction.find(matchFilter)
        .select('-metadata')
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: 'gateway_config_id', select: 'display_name gateway' })
        .lean()
    ]);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


function _sanitizeConfig(config) {
  if (config.credentials) {
    const safe = { ...config.credentials };
    delete safe.key_secret;
    delete safe.secret_key;
    delete safe.client_secret;
    config.credentials = safe;
  }
  delete config.webhook_secret;
  return config;
}

export default {
  createGateway,
  getGateways,
  updateGateway,
  deleteGateway,
  testGateway,
  reregisterWebhook,
  getTransactions
};
