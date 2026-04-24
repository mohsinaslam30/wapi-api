import Webhook from "../models/webhook.model.js";
import Template from "../models/template.model.js";
import Contact from "../models/contact.model.js";
import { WhatsappWaba, WhatsappPhoneNumber } from "../models/index.js";
import unifiedWhatsAppService from "../services/whatsapp/unified-whatsapp.service.js";
import axios from "axios";
import crypto from "crypto";

const API_VERSION = "v23.0";

const SORT_ORDER = {
  ASC: 1,
  DESC: -1
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_SORT_FIELD = "created_at";
const ALLOWED_SORT_FIELDS = ["webhook_name", "platform", "webhook_url", "event_type", "created_at", "updated_at"];

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

  const sortOrder = query.sort_order?.toUpperCase() === "DESC"
    ? SORT_ORDER.DESC
    : SORT_ORDER.ASC;

  return { sortField, sortOrder };
};

const buildSearchQuery = (searchTerm) => {
  if (!searchTerm || searchTerm.trim() === "") {
    return {};
  }

  const sanitizedSearch = searchTerm.trim();

  return {
    $or: [
      { webhook_name: { $regex: sanitizedSearch, $options: "i" } },
      { description: { $regex: sanitizedSearch, $options: "i" } },
      { platform: { $regex: sanitizedSearch, $options: "i" } },
      { event_type: { $regex: sanitizedSearch, $options: "i" } }
    ]
  };
};


export const createWebhook = async (req, res) => {
  try {
    const {
      webhook_name,
      require_auth
    } = req.body;

    const userId = req.user?.owner_id;

    if (!webhook_name) {
      return res.status(400).json({ error: "webhook_name is required" });
    }

    let webhookToken;
    let isUnique = false;
    while (!isUnique) {
      webhookToken = Webhook.generateWebhookToken();
      const existing = await Webhook.findOne({ webhook_token: webhookToken });
      if (!existing) isUnique = true;
    }

    const webhook = await Webhook.create({
      user_id: userId,
      webhook_name,
      webhook_token: webhookToken,
      is_template_mapped: false,
      config: {
        is_active: true,
        require_auth: require_auth || false,
        secret_key: crypto.randomBytes(32).toString("hex"),
        verified_numbers_only: false
      }
    });

    const webhookUrl = `${process.env.APP_URL || "http://localhost:5000"}/api/ecommerce-webhook/trigger/${webhookToken}`;

    return res.status(201).json({
      message: "Webhook created successfully",
      webhook: {
        id: webhook._id,
        webhook_name: webhook.webhook_name,
        webhook_url: webhookUrl,
        webhook_token: webhookToken,
        secret_key: webhook.config.secret_key,
        is_active: webhook.config.is_active,
        is_template_mapped: false
      }
    });
  } catch (error) {
    console.error("Error creating webhook:", error);
    return res.status(500).json({
      error: "Failed to create webhook",
      details: error.message
    });
  }
};

export const mapTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      template_id,
      phone_number_field,
      variables
    } = req.body;

    const userId = req.user?.owner_id;

    const webhook = await Webhook.findOne({
      _id: id,
      user_id: userId
    });

    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    const template = await Template.findOne({
      _id: template_id,
      user_id: userId
    });

    if (!template) {
      return res.status(404).json({
        error: "Template not found or doesn't belong to this user"
      });
    }

    if (template.status !== "approved") {
      return res.status(400).json({
        error: "Template must be approved before mapping to webhook"
      });
    }

    webhook.template_id = template_id;
    webhook.field_mapping = {
      phone_number_field: phone_number_field || "customer.phone",
      variables: variables || {}
    };
    webhook.is_template_mapped = true;

    await webhook.save();

    return res.status(200).json({
      message: "Template mapped successfully",
      webhook: {
        id: webhook._id,
        webhook_name: webhook.webhook_name,
        template_name: template.template_name,
        phone_number_field: webhook.field_mapping.phone_number_field,
        variables: Object.fromEntries(webhook.field_mapping.variables),
        is_template_mapped: true,
        first_payload: webhook.first_payload
      }
    });
  } catch (error) {
    console.error("Error mapping template:", error);
    return res.status(500).json({
      error: "Failed to map template",
      details: error.message
    });
  }
};

export const listWebhooks = async (req, res) => {
  try {
    const userId = req.user?.owner_id;
    const { platform, is_active } = req.query;

    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const searchQuery = buildSearchQuery(req.query.search);

    const filter = {
      ...searchQuery,
      user_id: userId
    };

    if (platform) filter.platform = platform;
    if (is_active !== undefined) filter["config.is_active"] = is_active === "true";

    const webhooks = await Webhook.find(filter)
      .populate("template_id", "template_name category language status")
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit);

    const total = await Webhook.countDocuments(filter);

    const webhooksWithUrl = webhooks.map((webhook) => ({
      id: webhook._id,
      webhook_name: webhook.webhook_name,
      description: webhook.description,
      webhook_url: `${process.env.APP_URL || "http://localhost:5000"}/api/ecommerce-webhook/trigger/${webhook.webhook_token}`,
      platform: webhook.platform,
      event_type: webhook.event_type,
      template: webhook.template_id ? {
        id: webhook.template_id._id,
        name: webhook.template_id.template_name,
        category: webhook.template_id.category,
        status: webhook.template_id.status
      } : null,
      is_template_mapped: webhook.is_template_mapped || false,
      is_active: webhook.config.is_active,
      stats: webhook.stats,
      first_payload: webhook.first_payload ? true : false,
      created_at: webhook.created_at
    }));

    return res.status(200).json({
      success: true,
      data: {
        webhooks: webhooksWithUrl,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit
        }
      }
    });
  } catch (error) {
    console.error("Error listing webhooks:", error);
    return res.status(500).json({
      error: "Failed to list webhooks",
      details: error.message
    });
  }
};


export const getWebhook = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.owner_id;

    const webhook = await Webhook.findOne({
      _id: id,
      user_id: userId
    }).populate("template_id");

    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    const webhookUrl = `${process.env.APP_URL || "http://localhost:5000"}/api/ecommerce-webhook/trigger/${webhook.webhook_token}`;

    return res.status(200).json({
      webhook: {
        id: webhook._id,
        webhook_name: webhook.webhook_name,
        description: webhook.description,
        webhook_url: webhookUrl,
        webhook_token: webhook.webhook_token,
        platform: webhook.platform,
        event_type: webhook.event_type,
        template: webhook.template_id,
        field_mapping: webhook.field_mapping,
        config: webhook.config,
        stats: webhook.stats,
        recent_logs: webhook.recent_logs,
        is_template_mapped: webhook.is_template_mapped || false,
        first_payload: webhook.first_payload,
        created_at: webhook.created_at,
        updated_at: webhook.updated_at
      }
    });
  } catch (error) {
    console.error("Error getting webhook:", error);
    return res.status(500).json({
      error: "Failed to get webhook details",
      details: error.message
    });
  }
};


export const updateWebhook = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.owner_id;
    const {
      webhook_name,
      description,
      event_type,
      template_id,
      phone_number_field,
      variables,
      config
    } = req.body;

    const webhook = await Webhook.findOne({
      _id: id,
      user_id: userId
    });

    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    if (template_id && template_id !== webhook.template_id.toString()) {
      const template = await Template.findOne({
        _id: template_id,
        user_id: userId,
        status: "approved"
      });

      if (!template) {
        return res.status(404).json({
          error: "Template not found, doesn't belong to user, or not approved"
        });
      }
      webhook.template_id = template_id;
    }

    if (webhook_name) webhook.webhook_name = webhook_name;
    if (description !== undefined) webhook.description = description;
    if (event_type) webhook.event_type = event_type;
    if (phone_number_field) webhook.field_mapping.phone_number_field = phone_number_field;
    if (variables) webhook.field_mapping.variables = variables;

    if (config) {
      if (config.is_active !== undefined) webhook.config.is_active = config.is_active;
      if (config.require_auth !== undefined) webhook.config.require_auth = config.require_auth;
      if (config.verified_numbers_only !== undefined)
        webhook.config.verified_numbers_only = config.verified_numbers_only;
    }

    await webhook.save();

    return res.status(200).json({
      message: "Webhook updated successfully",
      webhook: {
        id: webhook._id,
        webhook_name: webhook.webhook_name,
        is_active: webhook.config.is_active
      }
    });
  } catch (error) {
    console.error("Error updating webhook:", error);
    return res.status(500).json({
      error: "Failed to update webhook",
      details: error.message
    });
  }
};

export const deleteWebhook = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.owner_id;

    const webhook = await Webhook.findOneAndDelete({
      _id: id,
      user_id: userId
    });

    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    return res.status(200).json({
      message: "Webhook deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting webhook:", error);
    return res.status(500).json({
      error: "Failed to delete webhook",
      details: error.message
    });
  }
};

export const toggleWebhook = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.owner_id;

    const webhook = await Webhook.findOne({
      _id: id,
      user_id: userId
    });

    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    webhook.config.is_active = !webhook.config.is_active;
    await webhook.save();

    return res.status(200).json({
      message: `Webhook ${webhook.config.is_active ? "activated" : "deactivated"} successfully`,
      is_active: webhook.config.is_active
    });
  } catch (error) {
    console.error("Error toggling webhook:", error);
    return res.status(500).json({
      error: "Failed to toggle webhook status",
      details: error.message
    });
  }
};

export const triggerWebhook = async (req, res) => {
  try {
    console.log("calledd");
    const { token } = req.params;
    const payload = req.body;

    console.log(`🔔 Webhook triggered with token: ${token}`);
    console.log("Payload:", JSON.stringify(payload, null, 2));

    const webhook = await Webhook.findOne({
      webhook_token: token
    }).populate("template_id user_id");

    if (!webhook) {
      console.log("❌ Webhook not found");
      return res.status(404).json({ error: "Webhook not found" });
    }

    if (!webhook.config.is_active) {
      console.log("❌ Webhook is inactive");
      return res.status(403).json({ error: "Webhook is inactive" });
    }

    if (!webhook.first_payload) {
      webhook.first_payload = payload;
      await webhook.save();
      console.log("💾 First payload saved");
    }

    if (!webhook.is_template_mapped || !webhook.template_id) {
      console.log("⚠️  Template not mapped yet");
      webhook.stats.total_triggers += 1;
      webhook.stats.last_triggered_at = new Date();
      await webhook.save();

      return res.status(200).json({
        success: true,
        message: "Webhook received. Template not mapped yet. Please map a template to start sending notifications.",
        first_payload_saved: !webhook.first_payload ? false : true,
        webhook_id: webhook._id
      });
    }

    if (webhook.config.require_auth) {
      const isValid = verifyWebhookSignature(
        webhook.platform,
        req,
        webhook.config.secret_key
      );
      if (!isValid) {
        console.log("❌ Webhook signature verification failed");
        return res.status(401).json({ error: "Invalid webhook signature" });
      }
    }

    const phoneNumber = Webhook.getNestedValue(
      payload,
      webhook.field_mapping.phone_number_field
    );

    if (!phoneNumber) {
      console.log(`❌ Phone number not found at path: ${webhook.field_mapping.phone_number_field}`);

      webhook.stats.total_triggers += 1;
      webhook.stats.failed_sends += 1;
      webhook.stats.last_triggered_at = new Date();
      webhook.addLog({
        status: "failed",
        error_message: "Phone number not found in payload",
        payload_preview: JSON.stringify(payload).substring(0, 500)
      });
      await webhook.save();

      return res.status(400).json({
        error: "Phone number not found in webhook payload",
        expected_field: webhook.field_mapping.phone_number_field
      });
    }

    const templateVariables = {};
    if (webhook.field_mapping.variables) {
      const variablesMap = webhook.field_mapping.variables instanceof Map
        ? webhook.field_mapping.variables
        : new Map(Object.entries(webhook.field_mapping.variables));

      for (const [varName, payloadPath] of variablesMap) {
        const value = Webhook.getNestedValue(payload, payloadPath);
        if (value !== undefined) {
          templateVariables[varName] = value;
        }
      }
    }

    const formattedPhone = phoneNumber.replace(/[^0-9]/g, "");
    const userId = webhook.user_id._id;
    const template = webhook.template_id;

    let contact = await Contact.findOne({
      phone_number: formattedPhone,
      created_by: userId,
      deleted_at: null
    });

    if (!contact) {
      const contactName =
        Webhook.getNestedValue(payload, "customer.name") ||
        Webhook.getNestedValue(payload, "customer.first_name") ||
        Webhook.getNestedValue(payload, "name") ||
        "Webhook Contact";
      contact = await Contact.create({
        phone_number: formattedPhone,
        name: String(contactName || "Webhook Contact"),
        source: "whatsapp",
        user_id: userId,
        created_by: userId,
        status: "lead"
      });
    }

    const wabaId = template.waba_id;
    if (!wabaId) {
      webhook.stats.total_triggers += 1;
      webhook.stats.failed_sends += 1;
      webhook.stats.last_triggered_at = new Date();
      webhook.addLog({
        status: "failed",
        phone_number: phoneNumber,
        error_message: "Template has no WABA assigned",
        payload_preview: JSON.stringify(payload).substring(0, 500)
      });
      await webhook.save();
      return res.status(400).json({
        error: "Template has no WABA assigned. Please use a template linked to a WhatsApp Business Account."
      });
    }

    const whatsappPhoneNumber = await WhatsappPhoneNumber.findOne({
      waba_id: wabaId,
      is_active: true,
      deleted_at: null
    })
      .populate("waba_id")
      .sort({ last_used_at: 1 })
      .lean();

    if (!whatsappPhoneNumber || !whatsappPhoneNumber.waba_id) {
      webhook.stats.total_triggers += 1;
      webhook.stats.failed_sends += 1;
      webhook.stats.last_triggered_at = new Date();
      webhook.addLog({
        status: "failed",
        phone_number: phoneNumber,
        error_message: "No active phone number found for template WABA",
        payload_preview: JSON.stringify(payload).substring(0, 500)
      });
      await webhook.save();
      return res.status(400).json({
        error: "No active WhatsApp phone number found for the template's WABA."
      });
    }

    await WhatsappPhoneNumber.findByIdAndUpdate(whatsappPhoneNumber._id, {
      last_used_at: new Date()
    });

    const templateComponents = [];
    const bodyVars = template.body_variables || [];

    if (bodyVars.length > 0 && Object.keys(templateVariables).length > 0) {

      const bodyParams = bodyVars.map((v, index) => {

        const value = String(templateVariables[v.key] ?? "");

        const isNamed = isNaN(Number(v.key));


        const param = {
          type: "text",
          text: value
        };

        if (isNamed) {
          param.parameter_name = v.key;
        }

        return param;
      });

      templateComponents.push({
        type: "body",
        parameters: bodyParams
      });
    }

    console.log("📱 Phone number:", phoneNumber);
    console.log("📝 Template variables:", templateVariables);
    console.log("📎 Contact ID:", contact._id);

    try {
      await unifiedWhatsAppService.sendMessage(userId, {
        recipientNumber: formattedPhone,
        messageText: "",
        messageType: "template",
        templateName: template.template_name,
        languageCode: template.language || "en_US",
        templateComponents,
        userId,
        whatsappPhoneNumber
      });

      webhook.stats.total_triggers += 1;
      webhook.stats.successful_sends += 1;
      webhook.stats.last_triggered_at = new Date();
      webhook.addLog({
        status: "success",
        phone_number: phoneNumber,
        payload_preview: JSON.stringify(payload).substring(0, 500)
      });
      await webhook.save();

      console.log("✅ WhatsApp message sent successfully");

      return res.status(200).json({
        success: true,
        message: "Webhook processed and notification sent successfully",
        phone_number: phoneNumber
      });
    } catch (sendError) {
      console.error("❌ Error sending WhatsApp message:", sendError);

      webhook.stats.total_triggers += 1;
      webhook.stats.failed_sends += 1;
      webhook.stats.last_triggered_at = new Date();
      webhook.addLog({
        status: "failed",
        phone_number: phoneNumber,
        error_message: sendError.message,
        payload_preview: JSON.stringify(payload).substring(0, 500)
      });
      await webhook.save();

      return res.status(500).json({
        error: "Failed to send WhatsApp notification",
        details: sendError.message
      });
    }
  } catch (error) {
    console.error("❌ Error processing webhook:", error);
    return res.status(500).json({
      error: "Failed to process webhook",
      details: error.message
    });
  }
};

const verifyWebhookSignature = (platform, req, secretKey) => {
  try {
    switch (platform) {
      case "shopify":
        const shopifyHmac = req.headers["x-shopify-hmac-sha256"];
        if (!shopifyHmac) return false;

        const shopifyHash = crypto
          .createHmac("sha256", secretKey)
          .update(req.rawBody || JSON.stringify(req.body))
          .digest("base64");

        return shopifyHmac === shopifyHash;

      case "woocommerce":
        const wooSignature = req.headers["x-wc-webhook-signature"];
        if (!wooSignature) return false;

        const wooHash = crypto
          .createHmac("sha256", secretKey)
          .update(req.rawBody || JSON.stringify(req.body))
          .digest("base64");

        return wooSignature === wooHash;

      default:
        const customSecret = req.headers["x-webhook-secret"];
        return customSecret === secretKey;
    }
  } catch (error) {
    console.error("Error verifying webhook signature:", error);
    return false;
  }
};

export const getWebhookStats = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?.owner_id;

    const webhook = await Webhook.findOne({
      _id: id,
      user_id: userId
    });

    if (!webhook) {
      return res.status(404).json({ error: "Webhook not found" });
    }

    return res.status(200).json({
      stats: webhook.stats,
      recent_logs: webhook.recent_logs
    });
  } catch (error) {
    console.error("Error getting webhook stats:", error);
    return res.status(500).json({
      error: "Failed to get webhook statistics",
      details: error.message
    });
  }
};

export default {
  createWebhook,
  mapTemplate,
  listWebhooks,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  toggleWebhook,
  triggerWebhook,
  getWebhookStats
};
