import express from 'express';
import * as segmentController from '../controllers/segment.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { requireSubscription, checkPlanLimit } from '../middlewares/plan-permission.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);

router.get('/', checkPermission('view.segments'), segmentController.getSegments);
router.post('/', checkPermission('create.segments'), checkPlanLimit('segments'), segmentController.createSegment);
router.delete('/delete', checkPermission('delete.segments'), segmentController.bulkDeleteSegments);
router.delete('/:segmentId', checkPermission('delete.segments'), segmentController.deleteSegment);
router.get('/:segmentId', checkPermission('view.segments'), segmentController.getSegmentById);
router.put('/:segmentId', checkPermission('update.segments'), segmentController.updateSegment);

router.post('/:segmentId/contacts', checkPermission('update.segments'), segmentController.addContactsToSegment);
router.delete('/:segmentId/contacts', checkPermission('delete.segments'), segmentController.removeContactsFromSegment);
router.get('/:segmentId/contacts', checkPermission('view.segments'), segmentController.getSegmentContacts);

export default router;
