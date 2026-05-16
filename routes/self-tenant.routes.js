import express from 'express';
import { switchToTenant, backToAdmin } from '../controllers/selfTenant.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();


router.post('/switch-to-tenant', authenticate, checkPermission('manage.self_tenant'), switchToTenant);

router.post('/back-to-admin', authenticate, backToAdmin);

export default router;
