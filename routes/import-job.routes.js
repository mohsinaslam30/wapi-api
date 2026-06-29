import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import * as importJobController from '../controllers/import-job.controller.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.get('/', authenticate, checkPermission('view.import_jobs'), importJobController.getImportJobs);
router.get('/:id', authenticate, checkPermission('view.import_jobs'), importJobController.getImportJobById);
router.post('/bulk-delete', authenticate, checkPermission('delete.import_jobs'), importJobController.bulkDeleteImportJobs);

export default router;
