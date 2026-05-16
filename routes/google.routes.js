import express from 'express';
import googleController from '../controllers/google.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';
import { requireSubscription, checkPlanLimit } from '../middlewares/plan-permission.js';

const router = express.Router();

router.get('/callback', googleController.callback);


router.use(authenticate);
router.use(requireSubscription);

router.get('/connect', checkPlanLimit('google_account'), googleController.connect);
router.get('/accounts', checkPermission('view.google_account'), googleController.listAccounts);
router.delete('/accounts/:id', checkPermission('delete.google_account'), googleController.disconnectAccount);

router.get('/accounts/:google_account_id/calendars', checkPermission('view.google_account'), googleController.fetchCalendars);
router.post('/accounts/:google_account_id/calendars', checkPermission('create.google_account'), googleController.createCalendar);
router.put('/calendars/:id/link', checkPermission('update.google_account'), googleController.linkCalendar);
router.delete('/calendars/:id', checkPermission('delete.google_account'), googleController.deleteCalendar);

router.get('/calendars/:calendar_id/events', checkPermission('view.google_account'), googleController.listEvents);
router.post('/calendars/:calendar_id/events', checkPermission('create.google_account'), googleController.createEvent);
router.put('/calendars/:calendar_id/events/:event_id', checkPermission('update.google_account'), googleController.updateEvent);
router.delete('/calendars/:calendar_id/events/:event_id', checkPermission('delete.google_account'), googleController.deleteEvent);

router.get('/accounts/:google_account_id/sheets', checkPermission('view.google_account'), googleController.listSheets);
router.post('/sync', checkPermission('view.google_account'), googleController.syncSheets);
router.post('/accounts/:google_account_id/sheets', checkPermission('create.google_account'), googleController.createSheet);
router.get('/sheets/:sheet_id', checkPermission('view.google_account'), googleController.readSheet);
router.post('/sheets/:sheet_id/values', checkPermission('update.google_account'), googleController.writeSheet);
router.delete('/sheets/:id', checkPermission('delete.google_account'), googleController.deleteSheet);
router.post('/sheets/bulk-delete', checkPermission('delete.google_account'), googleController.bulkDeleteSheets);

export default router;
