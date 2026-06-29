import express from 'express';
import { authenticate, authorizeRoles } from '../middlewares/auth.js';
import faqController from '../controllers/faq.controller.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.get('/all', authenticate, checkPermission('view.faqs'), faqController.getAllFaqs);
router.post('/create', authenticate, checkPermission('create.faqs'), faqController.createFaq);
router.put('/:id/update', authenticate, checkPermission('update.faqs'), faqController.updateFaq);
router.put('/:id/update/status', authenticate, checkPermission('update.faqs'), faqController.updateFaqStatus);
router.delete('/delete', authenticate, checkPermission('delete.faqs'), faqController.deleteFaq);
router.get('/:id', authenticate, checkPermission('view.faqs'), faqController.getFaqById);

export default router;
