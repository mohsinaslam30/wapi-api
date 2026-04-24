import express from 'express';
import automationController from '../controllers/automation.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { requireSubscription, checkPlanLimit } from '../middlewares/plan-permission.js';
import { checkPermission } from '../middlewares/permission.js';


const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);

router.get('/', checkPermission('view.automation_flows'), automationController.getAutomationFlows);
router.get('/:flowId', checkPermission('view.automation_flows'), automationController.getAutomationFlow);
router.post('/', checkPlanLimit('bot_flow'), checkPermission('create.automation_flows'), automationController.createAutomationFlow);
router.put('/:flowId', checkPermission('update.automation_flows'), automationController.updateAutomationFlow);
router.delete('/:flowId', checkPermission('delete.automation_flows'), automationController.deleteAutomationFlow);
router.patch('/:flowId/toggle', checkPermission('update.automation_flows'), automationController.toggleAutomationFlow);
router.post('/:flowId/test', checkPermission('update.automation_flows'), automationController.testAutomationFlow);
router.get('/:flowId/executions', checkPermission('view.automation_flows'), automationController.getAutomationExecutions);
router.get('/executions/:executionId', checkPermission('view.automation_flows'), automationController.getAutomationExecution);
router.get('/statistics', checkPermission('view.automation_flows'), automationController.getAutomationStatistics);
router.get('/node-types', checkPermission('view.automation_flows'), automationController.getAvailableNodeTypes);

export default router;