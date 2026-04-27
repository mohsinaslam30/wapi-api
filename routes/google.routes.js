import express from 'express';
import googleController from '../controllers/google.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.get('/connect', authenticate, googleController.connect);
router.get('/callback', googleController.callback);

router.get('/accounts', authenticate, checkPermission('view.google_account'), googleController.listAccounts);
router.delete('/accounts/:id', authenticate, checkPermission('delete.google_account'), googleController.disconnectAccount);

router.get('/accounts/:google_account_id/calendars', authenticate, checkPermission('view.google_account'), googleController.fetchCalendars);
router.post('/accounts/:google_account_id/calendars', authenticate, checkPermission('create.google_account'), googleController.createCalendar);
router.put('/calendars/:id/link', authenticate, checkPermission('update.google_account'), googleController.linkCalendar);
router.delete('/calendars/:id', authenticate, checkPermission('delete.google_account'), googleController.deleteCalendar);

router.get('/calendars/:calendar_id/events', authenticate, checkPermission('view.google_account'), googleController.listEvents);
router.post('/calendars/:calendar_id/events', authenticate, checkPermission('create.google_account'), googleController.createEvent);
router.put('/calendars/:calendar_id/events/:event_id', authenticate, checkPermission('update.google_account'), googleController.updateEvent);
router.delete('/calendars/:calendar_id/events/:event_id', authenticate, checkPermission('delete.google_account'), googleController.deleteEvent);

router.get('/accounts/:google_account_id/sheets', authenticate, checkPermission('view.google_account'), googleController.listSheets);
router.post('/accounts/:google_account_id/sheets', authenticate, checkPermission('create.google_account'), googleController.createSheet);
router.get('/sheets/:sheet_id', authenticate, checkPermission('view.google_account'), googleController.readSheet);
router.post('/sheets/:sheet_id/values', authenticate, checkPermission('update.google_account'), googleController.writeSheet);

export default router;
