import express from 'express';
import {
    getAllPlans,
    getPlanById,
    createPlan,
    updatePlan,
    updatePlanStatus,
    deletePlan,
    getActivePlans,
    getFeaturedPlans
} from '../controllers/plan.controller.js';
import { authenticate, authenticateUser, authorizeAdmin } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);

router.get('/active', checkPermission('view.plans'), getActivePlans);
router.get('/featured', checkPermission('view.plans'), getFeaturedPlans);
router.get('/:id', checkPermission('view.plans'), getPlanById);

router.get('/', getAllPlans);

router.post('/create', createPlan);
router.put('/:id', checkPermission('update.plans'), updatePlan);
router.put('/:id/status', checkPermission('update.plans'), updatePlanStatus);
router.delete('/', checkPermission('delete.plans'), deletePlan);

export default router;
