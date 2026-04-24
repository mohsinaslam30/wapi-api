import express from 'express';
import { getUserSettings, updateUserSettings } from '../controllers/user-setting.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

import { uploader } from '../utils/upload.js';

const router = express.Router();

router.get('/', authenticate, checkPermission('view.user_settings'), getUserSettings);

router.put('/', authenticate, checkPermission('update.user_settings'), uploader('attachments').fields([{ name: 'bg_image', maxCount: 1 }]), updateUserSettings);

export default router;
