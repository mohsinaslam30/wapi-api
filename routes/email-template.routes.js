import express from 'express';
import { listEmailTemplates, getEmailTemplateById, updateEmailTemplate } from '../controllers/email-template.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);

router.get('/', checkPermission('view.email_template'), listEmailTemplates);
router.get('/:id', checkPermission('view.email_template'), getEmailTemplateById);
router.put('/:id', checkPermission('update.email_template'), updateEmailTemplate);

export default router;
