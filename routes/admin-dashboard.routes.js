import express from 'express';
import { getAdminDashboardData, getAdminDashboardCounts } from '../controllers/admin-dashboard.controller.js';
import { authenticate, authorizeAdmin } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);

router.get('/', checkPermission('view.admin_dashboard'), getAdminDashboardData);

router.get('/counts', checkPermission('view.admin_dashboard'), getAdminDashboardCounts);

export default router;
