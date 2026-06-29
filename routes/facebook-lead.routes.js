import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import {
  getInstantForms,
  connectLeadForm,
  getConnectedForms,
  getFormById,
  updateFormMapping,
  disconnectForm,
  getLeadsForForm,
  subscribePageToApp,
  verifyLeadgenWebhook,
  handleLeadgenWebhook,
  createInstantForm,
} from '../controllers/facebook-lead.controller.js';
import { checkPermission } from '../middlewares/permission.js';
import { requireSubscription, checkPlanLimit } from '../middlewares/plan-permission.js';

const router = express.Router();

router.get('/receive', verifyLeadgenWebhook);
router.post('/receive', express.json(), handleLeadgenWebhook);

router.use(authenticate);
router.use(requireSubscription);

router.get('/forms', checkPermission('view.facebook_leads'), getInstantForms);
router.post('/forms/create', checkPermission('create.facebook_leads'), checkPlanLimit('facebook_lead'), createInstantForm);
router.post('/forms/connect', checkPermission('create.facebook_leads'), connectLeadForm);
router.get('/forms/connected', checkPermission('view.facebook_leads'), getConnectedForms);
router.get('/forms/:id', checkPermission('view.facebook_leads'), getFormById);
router.put('/forms/:id/mapping', checkPermission('update.facebook_leads'), updateFormMapping);
router.get('/forms/:id/leads', checkPermission('view.facebook_leads'), getLeadsForForm);
router.delete('/forms/:id', checkPermission('delete.facebook_leads'), disconnectForm);
router.post('/pages/:page_id/subscribe', checkPermission('create.facebook_leads'), subscribePageToApp);

export default router;
