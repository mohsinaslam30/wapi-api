import express from 'express';
import {
    getWabaConfiguration,
    updateWabaConfiguration
} from '../controllers/waba-configuration.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);

router.get('/:waba_id', checkPermission('view.waba_configuration'), getWabaConfiguration);
router.put('/:waba_id', checkPermission('update.waba_configuration'), updateWabaConfiguration);

export default router;
