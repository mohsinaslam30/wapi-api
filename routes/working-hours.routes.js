import express from 'express';
import {
    upsertWorkingHours,
    getWorkingHoursByWaba,
    deleteWorkingHours
} from '../controllers/working-hours.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);

router.post('/', checkPermission('create.working_hours'), upsertWorkingHours);
router.get('/:waba_id', checkPermission('view.working_hours'), getWorkingHoursByWaba);
router.delete('/:waba_id', checkPermission('delete.working_hours'), deleteWorkingHours);

export default router;
