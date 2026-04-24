import express from 'express';
import {
  createGateway,
  getGateways,
  updateGateway,
  deleteGateway,
  testGateway,
  reregisterWebhook
} from '../controllers/payment-gateway-config.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

// All routes require tenant auth
router.post('/', authenticate, createGateway);
router.get('/', authenticate, getGateways);
router.patch('/:id', authenticate, updateGateway);
router.delete('/:id', authenticate, deleteGateway);
router.post('/:id/test', authenticate, testGateway);
router.post('/:id/reregister-webhook', authenticate, reregisterWebhook);

export default router;
