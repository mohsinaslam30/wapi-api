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
} from '../controllers/facebook-lead.controller.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();


router.get('/receive', verifyLeadgenWebhook);
router.post('/receive', express.json(), handleLeadgenWebhook);




router.get('/forms', authenticate, checkPermission('view.facebook_leads'), getInstantForms);


router.post('/forms/connect', authenticate, checkPermission('create.facebook_leads'), connectLeadForm);

router.get('/forms/connected', authenticate, checkPermission('view.facebook_leads'), getConnectedForms);

router.get('/forms/:id', authenticate, checkPermission('view.facebook_leads'), getFormById);

router.put('/forms/:id/mapping', authenticate, checkPermission('update.facebook_leads'), updateFormMapping);

router.get('/forms/:id/leads', authenticate, checkPermission('view.facebook_leads'), getLeadsForForm);

router.delete('/forms/:id', authenticate, checkPermission('delete.facebook_leads'), disconnectForm);

router.post('/pages/:page_id/subscribe', authenticate, checkPermission('create.facebook_leads'), subscribePageToApp);

export default router;
