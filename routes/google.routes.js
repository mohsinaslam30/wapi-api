import express from 'express';
import googleController from '../controllers/google.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

router.get('/connect', authenticate, googleController.connect);
router.get('/callback', googleController.callback); 

router.get('/accounts', authenticate, googleController.listAccounts);
router.delete('/accounts/:id', authenticate, googleController.disconnectAccount);

router.get('/accounts/:google_account_id/calendars', authenticate, googleController.fetchCalendars);
router.post('/accounts/:google_account_id/calendars', authenticate, googleController.createCalendar);
router.put('/calendars/:id/link', authenticate, googleController.linkCalendar);
router.delete('/calendars/:id', authenticate, googleController.deleteCalendar);

router.get('/calendars/:calendar_id/events', authenticate, googleController.listEvents);
router.post('/calendars/:calendar_id/events', authenticate, googleController.createEvent);
router.put('/calendars/:calendar_id/events/:event_id', authenticate, googleController.updateEvent);
router.delete('/calendars/:calendar_id/events/:event_id', authenticate, googleController.deleteEvent);

router.get('/accounts/:google_account_id/sheets', authenticate, googleController.listSheets);
router.post('/accounts/:google_account_id/sheets', authenticate, googleController.createSheet);
router.get('/sheets/:sheet_id', authenticate, googleController.readSheet);
router.post('/sheets/:sheet_id/values', authenticate, googleController.writeSheet);

export default router;
