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

const router = express.Router();

// ── Config routes
router.post('/configs', authenticate, createConfig);
router.get('/configs', authenticate, getConfigs);
router.get('/configs/:id', authenticate, getConfigById);
router.get('/configs/:id/bookings', authenticate, getBookings);
router.patch('/configs/:id', authenticate, updateConfig);
router.patch('/configs/:id/templates', authenticate, linkTemplates);
router.delete('/configs/:id', authenticate, deleteConfig);

// ── Availability
router.get('/dates/:configId', authenticate, getAvailableDates);
router.get('/slots/:configId', authenticate, getAvailableSlots);

// ── Booking routes
router.post('/bookings', authenticate, createBooking);
router.get('/bookings', authenticate, getBookings);

// NOTE: bulk-delete must come before /:id to avoid route collision
router.delete('/bookings/bulk-delete', authenticate, bulkDeleteBookings);

router.get('/bookings/:id', authenticate, getBookingById);
router.put('/bookings/:id/status', authenticate, updateBookingStatus);
router.post('/bookings/:id/send-payment-link', authenticate, sendPaymentLink);

export default router;
