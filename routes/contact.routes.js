import express from 'express';
import * as contactController from '../controllers/contact.controller.js';
import { authenticate } from '../middlewares/auth.js';
import * as segmentController from '../controllers/segment.controller.js';

import { requireSubscription, checkPlanLimit } from '../middlewares/plan-permission.js';
import { uploadSingle } from '../utils/upload.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);

router.post('/', checkPlanLimit('contacts'), checkPermission('create.contacts'), contactController.createContact);
router.get('/', checkPermission('view.contacts'), contactController.getContacts);
router.get('/funnels', checkPermission('view.kanban_funnel'), contactController.getContactFunnels);
router.post('/funnel/action', checkPermission('update.kanban_funnel'), contactController.handleContactKanbanAction);

router.get('/:id', checkPermission('view.contacts'), contactController.getContactById);
router.put('/:id', checkPermission('update.contacts'), contactController.updateContact);
// router.delete('/:id', contactController.bulkDeleteContacts);
router.post('/add-to-segments', checkPermission('create.segments'), segmentController.bulkAddContactsToSegments);
router.delete('/delete', checkPermission('delete.contacts'), contactController.bulkDeleteContacts);

router.get('/stats/summary', checkPermission('view.contacts'), contactController.getContactStats);

router.post('/import', checkPlanLimit('contacts'), uploadSingle('imports', 'file'), checkPermission('import.contacts'), contactController.importContactsFromCSV);
router.post('/export', checkPermission('export.contacts'), contactController.exportContacts);
router.get('/export/status/:jobId', checkPermission('export.contacts'), contactController.getExportStatus);
router.get('/export/download/:filename', checkPermission('export.contacts'), contactController.downloadExport);

router.get('/:id/funnel-status', checkPermission('view.kanban_funnel'), contactController.getContactKanbanStatus);


export default router;
