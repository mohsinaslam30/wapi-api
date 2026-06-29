import express from 'express';
import { authenticate, authorizeRoles } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';
import agentTaskController from '../controllers/agent-task.controller.js';
const router = express.Router();

router.get('/all', authenticate, checkPermission('view.agent-task'), agentTaskController.getAllAgentTasks);
router.post('/create', authenticate, checkPermission('create.agent-task'), agentTaskController.createAgentTask);
router.put('/:id/update', authenticate, checkPermission('update.agent-task'), agentTaskController.updateAgentTask);
router.put('/:id/update/status', authenticate, checkPermission('update.agent-task'), agentTaskController.updateAgentTaskStatus);
router.delete('/delete', authenticate, checkPermission('delete.agent-task'), agentTaskController.deleteAgentTask);
router.post('/:id/comment', authenticate, checkPermission('create.agent-task'), agentTaskController.addAgentTaskComment );
router.put('/:id/comment/:commentId', authenticate, checkPermission('update.agent-task'), agentTaskController.editAgentTaskComment );
router.delete('/:id/comment/:commentId', authenticate, checkPermission('delete.agent-task'), agentTaskController.deleteAgentTaskComment );
router.get('/:id', authenticate, checkPermission('view.agent-task'), agentTaskController.getAgentTaskById);

export default router;  
