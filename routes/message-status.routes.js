import express from 'express';
import {
  updateMessageDeliveryStatus,
  updateMessageReadStatus,
  updateWhatsAppMessageStatus,
  bulkUpdateDeliveryStatus,
  bulkUpdateReadStatus,
  getMessageStatus,
  getMessagesStatus
} from '../controllers/message-status.controller.js';
import { checkPermission } from '../middlewares/permission.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

router.use(authenticate);

router.patch('/:messageId/delivery', checkPermission('manage.conversations'), updateMessageDeliveryStatus);
router.patch('/:messageId/read', checkPermission('manage.conversations'), updateMessageReadStatus);

router.post('/whatsapp/status', checkPermission('manage.conversations'), updateWhatsAppMessageStatus);

router.patch('/bulk/delivery', checkPermission('manage.conversations'), bulkUpdateDeliveryStatus);
router.patch('/bulk/read', checkPermission('manage.conversations'), bulkUpdateReadStatus);

router.get('/user/:userId/status', checkPermission('manage.conversations'), getMessageStatus);
router.post('/status', checkPermission('manage.conversations'), getMessagesStatus);

export default router;
