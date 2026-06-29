import express from 'express';
const router = express.Router();
import { getLandingPage, updateLandingPage, uploadLandingImage } from '../controllers/landing-page.controller.js';
import { uploader } from '../utils/upload.js';
import { authenticateUser } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

router.get('/', getLandingPage);

router.put('/', authenticateUser, checkPermission('update.landing_page'), updateLandingPage);
router.post('/upload-image', authenticateUser, checkPermission('update.landing_page'), uploader('landing').single('image'), uploadLandingImage);

export default router;   