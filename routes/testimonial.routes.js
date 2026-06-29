import express from 'express';
import { authenticate, authorizeRoles } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';
import testimonialController from '../controllers/testimonial.controller.js';
import { uploadSingle } from '../utils/upload.js';
const router = express.Router();

router.get('/all', authenticate, checkPermission('view.testimonials'), testimonialController.getAllTestimonials);
router.post('/create', authenticate, checkPermission('create.testimonials'), uploadSingle('user_profiles', 'user_image'), testimonialController.createTestimonial);
router.put('/:id/update', authenticate, checkPermission('update.testimonials'), uploadSingle('user_profiles', 'user_image'), testimonialController.updateTestimonial);
router.put('/:id/update/status', authenticate, checkPermission('update.testimonials'), testimonialController.updateTestimonialStatus);
router.delete('/delete', authenticate, checkPermission('delete.testimonials'), testimonialController.deleteTestimonial);
router.get('/:id', authenticate, checkPermission('view.testimonials'), testimonialController.getTestimonialById);

export default router;
