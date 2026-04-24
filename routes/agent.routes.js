import express from 'express';
import { authenticate, authorizeRoles } from '../middlewares/auth.js';
import { requireSubscription, checkPlanLimit } from '../middlewares/plan-permission.js';
import agentController from '../controllers/agent.controller.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);

router.get('/all', checkPermission('view.agents'), agentController.getAllAgents);
router.post('/create', checkPlanLimit('staff'), checkPermission('create.agents'), agentController.createAgent);
router.put('/:id/update', checkPermission('update.agents'), agentController.updateAgent);
router.put('/:id/update/status', checkPermission('update.agents'), agentController.updateAgentStatus);
router.delete('/delete', checkPermission('delete.agents'), agentController.deleteAgent);
router.get('/:id', checkPermission('view.agents'), agentController.getAgentById);
router.put('/:id/phone-no', checkPermission('update.agents'), agentController.updatePhonenoStatus);

export default router;
