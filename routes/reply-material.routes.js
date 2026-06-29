import express from 'express';
import {
    createReplyMaterial,
    getReplyMaterials,
    getReplyMaterialById,
    updateReplyMaterial,
    deleteReplyMaterial,
    bulkDeleteReplyMaterials
} from '../controllers/reply-material.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { uploader } from '../utils/upload.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);

const upload = uploader('reply-materials');

router.post('/', checkPermission('create.reply_materials'), upload.single('file'), createReplyMaterial);
router.get('/', checkPermission('view.reply_materials'), getReplyMaterials);
router.post('/bulk-delete', checkPermission('delete.reply_materials'), bulkDeleteReplyMaterials);
router.get('/:id', checkPermission('view.reply_materials'), getReplyMaterialById);
router.put('/:id', checkPermission('update.reply_materials'), upload.single('file'), updateReplyMaterial);
router.delete('/:id', checkPermission('delete.reply_materials'), deleteReplyMaterial);

export default router;
