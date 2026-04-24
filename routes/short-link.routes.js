import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import * as shortLinkController from '../controllers/short-link.controller.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.post('/', authenticate, checkPermission('create.short_links'), shortLinkController.createShortLink);
router.get('/', authenticate, checkPermission('view.short_links'), shortLinkController.getShortLinks);
router.get('/:id', authenticate, checkPermission('view.short_links'), shortLinkController.getShortLinkById);
router.put('/:id', authenticate, checkPermission('update.short_links'), shortLinkController.updateShortLink);
router.post('/bulk-delete', authenticate, checkPermission('delete.short_links'), shortLinkController.bulkDeleteShortLinks);

export default router;
