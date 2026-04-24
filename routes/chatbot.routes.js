import express from 'express';
import chatbotController from '../controllers/chatbot.controller.js';
import { authenticate , authorizeRoles } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);

router.get('/', checkPermission('view.chatbots'), chatbotController.getAllChatbots);
router.get('/:id', checkPermission('view.chatbots'), chatbotController.getChatbotById);
router.post('/', checkPermission('create.chatbots'), chatbotController.createChatbot);
router.put('/:id', checkPermission('update.chatbots'), chatbotController.updateChatbot);
router.delete('/:id', checkPermission('delete.chatbots'), chatbotController.deleteChatbot);
router.post('/:id/train', checkPermission('update.chatbots'), chatbotController.trainChatbot);

export default router;
