import express from 'express';
import messageBotController from '../controllers/message-bot.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';
import { checkPlanLimit, requireSubscription } from '../middlewares/plan-permission.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);

router.post('/', checkPermission('create.message_bots'), checkPlanLimit('message_bots'), messageBotController.createMessageBot);
router.get('/', checkPermission('view.message_bots'), messageBotController.getAllMessageBots);
router.get('/:id', checkPermission('view.message_bots'), messageBotController.getMessageBotById);
router.put('/:id', checkPermission('update.message_bots'), messageBotController.updateMessageBot);
router.delete('/:id', checkPermission('delete.message_bots'), messageBotController.deleteMessageBot);
router.post('/bulk-delete', checkPermission('delete.message_bots'), messageBotController.bulkDeleteMessageBots);

export default router;