import express from 'express';
import { authenticate, authorizeRoles } from '../middlewares/auth.js';
import contactInquiryController from '../controllers/contact-inquiries.controller.js';
import { checkPermission } from '../middlewares/permission.js';
const router = express.Router();

router.get('/all', authenticate, checkPermission('view.contact_inquiries'), contactInquiryController.getAllInquiries);
router.post('/create', authenticate, checkPermission('create.contact_inquiries'), contactInquiryController.createInquiry);
router.delete('/delete', authenticate, checkPermission('delete.contact_inquiries'), contactInquiryController.deleteInquiry);

export default router;