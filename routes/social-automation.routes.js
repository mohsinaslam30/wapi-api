import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';
import { requireSubscription, requirePlatformFeature } from '../middlewares/plan-permission.js';
import * as socialAutomationController from '../controllers/social-automation.controller.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);

router.post('/', requirePlatformFeature('comment_dm'), checkPermission('create.automations'), socialAutomationController.createAutomation);
router.get('/', checkPermission('view.automations'), socialAutomationController.getAutomations);
router.post('/media', requirePlatformFeature('comment_dm'), checkPermission('view.automations'), socialAutomationController.fetchMedia);
router.get('/:id', checkPermission('view.automations'), socialAutomationController.getAutomationById);
router.put('/:id', requirePlatformFeature('comment_dm'), checkPermission('update.automations'), socialAutomationController.updateAutomation);
router.delete('/:id', checkPermission('delete.automations'), socialAutomationController.deleteAutomation);
router.post('/retrigger', requirePlatformFeature('retrigger'), checkPermission('update.automations'), socialAutomationController.retriggerComments);

export default router;
