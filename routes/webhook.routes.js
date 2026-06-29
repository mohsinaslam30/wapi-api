import express from 'express';
import { handleTelegramWebhook } from '../controllers/telegram-webhook.controller.js';
import { handleWebhookVerification, handleIncomingMessage } from '../controllers/whatsapp-webhook.controller.js';
// import { handleTwitterCRC, handleTwitterWebhook } from '../controllers/twitter-webhook.controller.js'; // DISABLED: Twitter not working

const router = express.Router();

router.post('/telegram/:workspace_id', handleTelegramWebhook);

// DISABLED: Twitter not working
// router.get('/twitter/:workspace_id', handleTwitterCRC);
// router.post('/twitter/:workspace_id', handleTwitterWebhook);

router.get('/facebook', handleWebhookVerification);
router.post('/facebook', handleIncomingMessage);

router.get('/instagram', handleWebhookVerification);
router.post('/instagram', handleIncomingMessage);

export default router;
