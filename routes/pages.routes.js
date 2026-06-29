import express from 'express';
import * as pageController from '../controllers/pages.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';
import { uploadSingle } from '../utils/upload.js';

const router = express.Router();

router.get('/', pageController.getPages);
router.get('/sitemap-list', pageController.getPagesForSitemap);
router.get('/:id', pageController.getPageById);

router.use(authenticate);
router.post('/create', uploadSingle('pages', 'meta_image'), checkPermission('create.pages'), pageController.createPage);
router.post('/upload-media', uploadSingle('pages', 'file'), checkPermission('update.pages'), pageController.uploadPageMedia);
router.put('/:id', uploadSingle('pages', 'meta_image'), checkPermission('update.pages'), pageController.updatePage);
router.delete('/delete', checkPermission('delete.pages'), pageController.deletePages);
router.patch('/:id/toggle-status', checkPermission('update.pages'), pageController.togglePageStatus);

export default router;
