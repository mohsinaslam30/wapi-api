import express from 'express';
import whatsappCallingController from '../controllers/whatsapp-calling.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';
import { checkPlanLimit, requireSubscription } from '../middlewares/plan-permission.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);

router.get('/settings', checkPermission('view.whatsapp_calling'), whatsappCallingController.getCallSettings);
router.post('/settings', checkPermission('update.whatsapp_calling'), whatsappCallingController.updateCallSettings);

router.get('/agents', checkPermission('view.whatsapp_calling'), whatsappCallingController.getCallAgents);
router.get('/agents/:id', checkPermission('view.whatsapp_calling'), whatsappCallingController.getCallAgentById);
router.post('/agents', checkPlanLimit('whatsapp_calling'), checkPermission('create.whatsapp_calling'), whatsappCallingController.createCallAgent);
router.put('/agents/:id', checkPermission('update.whatsapp_calling'), whatsappCallingController.updateCallAgent);
router.delete('/agents', checkPermission('delete.whatsapp_calling'), whatsappCallingController.deleteCallAgent);

router.post('/assign-agent', checkPermission('create.whatsapp_calling'), whatsappCallingController.assignAgentToContact);
router.post('/assign-agent-bulk', checkPermission('create.whatsapp_calling'), whatsappCallingController.assignAgentBulk);
router.delete('/remove-agent/:contact_id', checkPermission('delete.whatsapp_calling'), whatsappCallingController.removeAgentFromContact);
router.post('/remove-agent-bulk', checkPermission('delete.whatsapp_calling'), whatsappCallingController.removeAgentBulk);

router.get('/logs', checkPermission('view.whatsapp_calling'), whatsappCallingController.getCallLogs);
router.get('/logs/:id', checkPermission('view.whatsapp_calling'), whatsappCallingController.getCallLogById);
router.get('/logs/:id/transcription', checkPermission('view.whatsapp_calling'), whatsappCallingController.getCallTranscription);
router.delete('/logs/bulk-delete', checkPermission('delete.whatsapp_calling'), whatsappCallingController.bulkDeleteCallLogs);

export default router;
