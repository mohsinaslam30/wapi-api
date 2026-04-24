import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import quickReplyController from '../controllers/quick-reply.controller.js';

const router = express.Router();

router.use(authenticate);

router.get('/', quickReplyController.getQuickReplies);
router.get('/admin', quickReplyController.getAdminQuickReplies);
router.post('/', quickReplyController.createQuickReply);
router.put('/:id', quickReplyController.updateQuickReply);
router.delete('/delete', quickReplyController.bulkDeleteQuickReplies);
router.post('/:id/favorite', quickReplyController.toggleFavorite);

export default router;
