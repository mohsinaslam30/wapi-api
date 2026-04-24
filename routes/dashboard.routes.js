import express from 'express';
import { getDashboardData, getDashboardCounts } from '../controllers/dashboard.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { requireSubscription } from '../middlewares/plan-permission.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);


router.get('/', checkPermission('view.dashboard'), getDashboardData);


router.get('/counts', checkPermission('view.dashboard'), getDashboardCounts);

export default router;
