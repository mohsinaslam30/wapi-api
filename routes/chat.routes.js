import express from 'express';
import * as chatController from '../controllers/chat.controller.js';
import { authenticate, authorizeRoles } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();


router.get('/all', authenticate, checkPermission('manage.conversations'), chatController.getRecentChats);
router.post('/add-tag', authenticate, checkPermission('manage.conversations'), chatController.addTag);
router.delete('/delete-tag', authenticate, checkPermission('manage.conversations'), chatController.deleteTag);
router.post('/add-note', authenticate, checkPermission('manage.conversations'), chatController.addNote);
router.delete('/delete-note', authenticate, checkPermission('manage.conversations'), chatController.deleteNote);
router.post('/assign', authenticate, checkPermission('manage.conversations'), chatController.assignChatToAgent);
router.post('/unassign', authenticate, checkPermission('manage.conversations'), chatController.unassignChatFromAgent);
router.post('/status', authenticate, checkPermission('manage.conversations'), chatController.updateChatStatus);

export default router;

