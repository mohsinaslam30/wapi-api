import express from 'express';
import {
  createConfig,
  getConfigs,
  getConfigById,
  getAvailableDates,
  getAvailableSlots,
  createBooking,
  updateConfig,
  deleteConfig,
  linkTemplates,
  updateBookingStatus,
  getBookings,
  getBookingById,
  bulkDeleteBookings,
  sendPaymentLink
} from '../controllers/appointment.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPlanLimit, requireSubscription } from '../middlewares/plan-permission.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();
router.use(authenticate);
router.use(requireSubscription);

router.post('/configs', checkPlanLimit('appointment_bookings'), checkPermission('create.appointment_booking'), createConfig);
router.get('/configs', checkPermission('view.appointment_booking'), getConfigs);
router.get('/configs/:id', checkPermission('view.appointment_booking'), getConfigById);
router.get('/configs/:id/bookings', checkPermission('view.appointment_booking'), getBookings);
router.patch('/configs/:id', checkPermission('update.appointment_bookings'), updateConfig);
router.patch('/configs/:id/templates', checkPermission('update.appointment_booking'), linkTemplates);
router.delete('/configs/:id', checkPermission('delete.appointment_booking'), deleteConfig);

router.get('/dates/:configId', checkPermission('view.appointment_booking'), getAvailableDates);
router.get('/slots/:configId', checkPermission('view.appointment_booking'), getAvailableSlots);

router.post('/bookings', checkPlanLimit('appointment_bookings'), checkPermission('create.appointment_booking'), createBooking);
router.get('/bookings', checkPermission('view.appointment_booking'), getBookings);

router.delete('/bookings/bulk-delete', checkPermission('delete.appointment_booking'), bulkDeleteBookings);

router.get('/bookings/:id', checkPermission('view.appointment_booking'), getBookingById);
router.put('/bookings/:id/status', checkPermission('update.appointment_booking'), updateBookingStatus);
router.post('/bookings/:id/send-payment-link', checkPermission('update.appointment_booking'), sendPaymentLink);

export default router;
