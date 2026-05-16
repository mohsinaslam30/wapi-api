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

const router = express.Router();


router.post("/create", authenticate, checkPermission('create.ecommerce_webhooks'), createWebhook);

router.post("/:id/map-template", authenticate, checkPermission('update.ecommerce_webhooks'), mapTemplate);

router.get("/list", authenticate, checkPermission('view.ecommerce_webhooks'), listWebhooks);


router.get("/:id", authenticate, checkPermission('view.ecommerce_webhooks'), getWebhook);


router.put("/:id", authenticate, checkPermission('update.ecommerce_webhooks'), updateWebhook);


router.delete("/:id", authenticate, checkPermission('delete.ecommerce_webhooks'), deleteWebhook);


router.patch("/:id/toggle", authenticate, checkPermission('update.ecommerce_webhooks'), toggleWebhook);


router.get("/:id/stats", authenticate, checkPermission('view.ecommerce_webhooks'), getWebhookStats);

router.get("/:id/trigger-logs", authenticate, checkPermission('view.ecommerce_webhooks'), getTriggerLogs);

router.get("/:id/message-logs", authenticate, checkPermission('view.ecommerce_webhooks'), getMessageLogs);
router.put("/:id/merchant-notifications", authenticate, checkPermission('update.ecommerce_webhooks'), updateMerchantNotification);


router.all("/trigger/:token", triggerWebhook);

export default router;
