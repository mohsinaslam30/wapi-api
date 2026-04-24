import express from 'express';
import {
  getUserOrders,
  getOrderById,
  getOrdersByMessageId,
  getOrderStats,
  updateOrderStatus,
  upsertOrderStatusTemplate,
  getOrderStatusTemplates,
  bulkDeleteOrders
} from '../controllers/ecommerce-order.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.get('/user/orders', authenticate, checkPermission('view.ecommerce_orders'), getUserOrders);

router.get('/user/orders/stats', authenticate, checkPermission('view.ecommerce_orders'), getOrderStats);

router.get('/message/:message_id/orders', authenticate, checkPermission('view.ecommerce_orders'), getOrdersByMessageId);

router.get('/orders/:order_id', authenticate, checkPermission('view.ecommerce_orders'), getOrderById);

router.put('/orders/:order_id/status', authenticate, checkPermission('update.ecommerce_orders'), updateOrderStatus);

router.get('/status-templates', authenticate, checkPermission('view.ecommerce_orders'), getOrderStatusTemplates);

router.put('/status-templates/:status', authenticate, checkPermission('update.ecommerce_orders'), upsertOrderStatusTemplate);

router.post('/orders/bulk-delete', authenticate, checkPermission('delete.ecommerce_orders'), bulkDeleteOrders);

export default router;
