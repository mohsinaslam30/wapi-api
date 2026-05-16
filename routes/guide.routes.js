import express from 'express';
import guideController from '../controllers/guide.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';
import { uploadSingle } from '../utils/upload.js';

const router = express.Router();

// Public/Tenant Routes
router.get('/public', authenticate, checkPermission('view.guide'), guideController.getGuides);

// Admin Routes
router.get('/', authenticate, checkPermission('view.guide'), guideController.getAllGuides);
router.get('/categories', authenticate, checkPermission('view.guide'), guideController.getUniqueCategories);
router.get('/:id', authenticate, checkPermission('view.guide'), guideController.getGuideById);
router.post('/upload', authenticate, checkPermission('create.guide'), uploadSingle('guides', 'image'), guideController.uploadImage);
router.post('/', authenticate, checkPermission('create.guide'), guideController.createGuide);
router.put('/reorder', authenticate, checkPermission('update.guide'), guideController.reorderGuides);
router.put('/category/:slug', authenticate, checkPermission('update.guide'), guideController.updateCategory);
router.put('/:id', authenticate, checkPermission('update.guide'), guideController.updateGuide);
router.delete('/delete', authenticate, checkPermission('delete.guide'), guideController.deleteGuide);



export default router;
