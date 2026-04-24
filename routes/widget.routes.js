import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import { uploader } from '../utils/upload.js';
import * as widgetController from '../controllers/widget.controller.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

const widgetUpload = uploader('widgets').fields([
    { name: 'widget_image', maxCount: 1 },
    { name: 'body_background_image', maxCount: 1 },
]);

router.post('/', authenticate, ...widgetUpload, checkPermission('create.widget'), widgetController.createWidget);
router.put('/:id', authenticate, ...widgetUpload, checkPermission('update.widget'), widgetController.updateWidget);
router.delete('/:id', authenticate, checkPermission('delete.widget'), widgetController.deleteWidget);
router.post('/bulk-delete', authenticate, checkPermission('delete.widget'), widgetController.bulkDeleteWidgets);

router.get('/', authenticate, checkPermission('view.widget'), widgetController.getAllWidgets);
router.get('/phone/:phoneNumber', authenticate, checkPermission('view.widget'), widgetController.getWidgetByPhoneNumber);
router.get('/:id', authenticate, checkPermission('view.widget'), widgetController.getWidgetById);

export default router;
