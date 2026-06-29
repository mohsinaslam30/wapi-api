import express from 'express';
import { handlePaymentWebhook } from '../controllers/payment-webhook.controller.js';

const router = express.Router();


router.post('/webhook/:gateway', handlePaymentWebhook);

export default router;
