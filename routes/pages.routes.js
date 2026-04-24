import express from 'express';
import * as pageController from '../controllers/pages.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';
import { uploadSingle } from '../utils/upload.js';

const router = express.Router();

router.get('/', pageController.getPages);

router.use(authenticate);
router.get('/:id', checkPermission('view.pages'), pageController.getPageById);
router.post('/create', uploadSingle('pages', 'meta_image'), checkPermission('create.pages'), pageController.createPage);
router.put('/:id', uploadSingle('pages', 'meta_image'), checkPermission('update.pages'), pageController.updatePage);
router.delete('/delete', checkPermission('delete.pages'), pageController.deletePages);
router.patch('/:id/toggle-status', checkPermission('update.pages'), pageController.togglePageStatus);

export default router;
