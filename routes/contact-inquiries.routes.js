import express from 'express';
import { authenticate, authorizeRoles } from '../middlewares/auth.js';
import contactInquiryController from '../controllers/contact-inquiries.controller.js';
import { checkPermission } from '../middlewares/permission.js';
const router = express.Router();

router.get('/all', contactInquiryController.getAllInquiries);
router.post('/create', contactInquiryController.createInquiry);
router.delete('/delete', contactInquiryController.deleteInquiry);

export default router;