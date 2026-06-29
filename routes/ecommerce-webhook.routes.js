import express from "express";
import {
  createWebhook,
  listWebhooks,
  getWebhook,
  updateWebhook,
  deleteWebhook,
  toggleWebhook,
  triggerWebhook,
  getWebhookStats,
  mapTemplate,
  getTriggerLogs,
  getMessageLogs,
  updateMerchantNotification
} from "../controllers/ecommerce-webhook.controller.js";
import { authenticate } from "../middlewares/auth.js";
import { checkPermission } from "../middlewares/permission.js";
import { requireSubscription, requirePlanFeature } from "../middlewares/plan-permission.js";

const router = express.Router();

const checkWebhookFeature = [authenticate, requireSubscription, requirePlanFeature('whatsapp_webhook')];

router.post("/create", checkWebhookFeature, checkPermission('create.ecommerce_webhooks'), createWebhook);

router.post("/:id/map-template", checkWebhookFeature, checkPermission('update.ecommerce_webhooks'), mapTemplate);

router.get("/list", checkWebhookFeature, checkPermission('view.ecommerce_webhooks'), listWebhooks);

router.get("/:id", checkWebhookFeature, checkPermission('view.ecommerce_webhooks'), getWebhook);


router.put("/:id", checkWebhookFeature, checkPermission('update.ecommerce_webhooks'), updateWebhook);


router.delete("/:id", checkWebhookFeature, checkPermission('delete.ecommerce_webhooks'), deleteWebhook);


router.patch("/:id/toggle", checkWebhookFeature, checkPermission('update.ecommerce_webhooks'), toggleWebhook);


router.get("/:id/stats", checkWebhookFeature, checkPermission('view.ecommerce_webhooks'), getWebhookStats);

router.get("/:id/trigger-logs", checkWebhookFeature, checkPermission('view.ecommerce_webhooks'), getTriggerLogs);

router.get("/:id/message-logs", checkWebhookFeature, checkPermission('view.ecommerce_webhooks'), getMessageLogs);
router.put("/:id/merchant-notifications", checkWebhookFeature, checkPermission('update.ecommerce_webhooks'), updateMerchantNotification);


router.all("/trigger/:token", triggerWebhook);

export default router;
