import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import quickReplyController from '../controllers/quick-reply.controller.js';
import { checkPermission } from '../middlewares/permission.js';
import { requireSubscription, checkPlanLimit } from '../middlewares/plan-permission.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);

router.get('/', checkPermission('view.quick_replies'), quickReplyController.getQuickReplies);
router.get('/admin', checkPermission('view.quick_replies'), quickReplyController.getAdminQuickReplies);
router.post('/', checkPermission('create.quick_replies'), checkPlanLimit('quick_replies'), quickReplyController.createQuickReply);
router.put('/:id', checkPermission('update.quick_replies'), quickReplyController.updateQuickReply);
router.delete('/delete', checkPermission('delete.quick_replies'), quickReplyController.bulkDeleteQuickReplies);
router.post('/:id/favorite', checkPermission('update.quick_replies'), quickReplyController.toggleFavorite);

export default router;
