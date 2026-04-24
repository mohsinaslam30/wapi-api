import express from 'express';
import impersonationController from '../controllers/impersonation.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkImpersonationStatus } from '../middlewares/impersonation.js';

const router = express.Router();

router.use(authenticate);
router.use(checkImpersonationStatus);

router.post('/start', impersonationController.startImpersonation);
router.post('/stop', impersonationController.stopImpersonation);
router.get('/status', impersonationController.getImpersonationStatus);

export default router;