import express from 'express';
import impersonationController from '../controllers/impersonation.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkImpersonationStatus } from '../middlewares/impersonation.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);
router.use(checkImpersonationStatus);

router.post('/start', checkPermission('view.impersonation'), impersonationController.startImpersonation);
router.post('/stop', checkPermission('view.impersonation'), impersonationController.stopImpersonation);
router.get('/status', checkPermission('view.impersonation'), impersonationController.getImpersonationStatus);

export default router;