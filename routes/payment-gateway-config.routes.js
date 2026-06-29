import express from 'express';
import {
  createGateway,
  getGateways,
  updateGateway,
  deleteGateway,
  testGateway,
  reregisterWebhook,
  getTransactions
} from '../controllers/payment-gateway-config.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();


router.post('/', authenticate, checkPermission('create.payment_gateways'), createGateway);
router.get('/', authenticate, checkPermission('view.payment_gateways'), getGateways);
router.get('/transactions', authenticate, checkPermission('view.payment_gateways'), getTransactions);
router.patch('/:id', authenticate, checkPermission('update.payment_gateways'), updateGateway);
router.delete('/:id', authenticate, checkPermission('delete.payment_gateways'), deleteGateway);
router.post('/:id/test', authenticate, checkPermission('update.payment_gateways'), testGateway);
router.post('/:id/reregister-webhook', authenticate, checkPermission('update.payment_gateways'), reregisterWebhook);

export default router;
