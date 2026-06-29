import express from 'express';
import * as customFieldController from '../controllers/custom-field.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { requireSubscription, checkPlanLimit } from '../middlewares/plan-permission.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);

router.post('/', checkPlanLimit('custom_fields'), checkPermission('create.custom_fields'), customFieldController.createCustomField);
router.get('/', checkPermission('view.custom_fields'), customFieldController.getCustomFields);
router.get('/:id', checkPermission('view.custom_fields'), customFieldController.getCustomFieldById);
router.put('/:id', checkPermission('update.custom_fields'), customFieldController.updateCustomField);
router.post('/delete', checkPermission('delete.custom_fields'), customFieldController.deleteCustomFields);
router.post('/status', checkPermission('update.custom_fields'), customFieldController.updateCustomFieldsStatus);

export default router;
