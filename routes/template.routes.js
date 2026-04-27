import express from 'express';
import { authenticate, authorizeRoles } from '../middlewares/auth.js';
import { requireSubscription, checkPlanLimit } from '../middlewares/plan-permission.js';
import templateController from '../controllers/template.controller.js';
const router = express.Router();
import { checkPermission } from '../middlewares/permission.js';
import multer from "multer";

import { uploader } from "../utils/upload.js";

router.use(authenticate);
router.use(requireSubscription);
router.post('/create', checkPlanLimit('template_bots'), uploader('attachments').fields([{ name: 'file', maxCount: 1 }, { name: 'card_media', maxCount: 10 }]), checkPermission('create.template'), templateController.createTemplate);
router.get('/', checkPermission('view.template'), templateController.getAllTemplates);
router.get('/meta-list', checkPermission('view.template'), templateController.getTemplatesFromMeta);
router.get('/:id', checkPermission('view.template'), templateController.getTemplateById);
router.post('/sync', checkPermission('update.template'), templateController.syncTemplatesFromMeta);
router.post('/sync-status', checkPermission('update.template'), templateController.syncTemplatesStatusFromMeta);

router.post('/suggest', checkPlanLimit('ai_prompts'), checkPermission('create.ai_prompts'), checkPermission('create.template'), templateController.suggestTemplate);
router.put('/:id', uploader('attachments').fields([{ name: 'file', maxCount: 1 }, { name: 'card_media', maxCount: 10 }]), checkPermission('update.template'), templateController.updateTemplate);
router.delete('/:id', checkPermission('delete.template'), templateController.deleteTemplate);
router.post('/migrate', checkPermission('update.template'), templateController.migrateTemplate);
router.get('/admin-templates/list', checkPermission('view.template'), templateController.getAdminTemplatesForUsers);

export default router;

