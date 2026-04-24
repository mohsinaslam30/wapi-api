import express from 'express';
import { createAttachment, getAttachments, getAttachmentById, deleteAttachment, bulkDeleteAttachments, updateAttachment } from '../controllers/attachment.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { uploadFiles } from '../utils/upload.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);

router.post('/', uploadFiles('attachments', 'attachments'), checkPermission('create.attachment'), createAttachment);

router.get('/', checkPermission('view.attachment'), getAttachments);

router.get('/:id', checkPermission('view.attachment'), getAttachmentById);

router.delete('/:id', checkPermission('delete.attachment'), deleteAttachment);

router.put('/:id', checkPermission('create.attachment'), updateAttachment);

router.post('/delete', checkPermission('delete.attachment'), bulkDeleteAttachments);

export default router;
