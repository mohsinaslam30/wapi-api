import express from 'express';
import unifiedWhatsAppController from '../controllers/unified-whatsapp.controller.js';
import { authenticate, authorizeRoles } from '../middlewares/auth.js';
import { uploadSingle } from '../utils/upload.js';
import multer from "multer";
import { checkPermission } from '../middlewares/permission.js';
import { checkPlanLimit, requireSubscription } from '../middlewares/plan-permission.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 16 * 1024 * 1024
  }
});

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);

router.post('/send', checkPlanLimit('conversations'), upload.single('file_url'), checkPermission('create.unified_whatsapp'), unifiedWhatsAppController.sendMessage);
router.get('/messages', checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getMessages);
router.get('/chats', checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getRecentChats);
router.post('/pin-chat', checkPermission('update.unified_whatsapp'), unifiedWhatsAppController.togglePinChat);
router.post('/assign-chat', checkPermission('create.agents'), unifiedWhatsAppController.assignChatToAgent);
router.get('/status', checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getConnectionStatus);
router.post('/connect', checkPermission('create.unified_whatsapp'), unifiedWhatsAppController.connectWhatsApp);
router.get('/baileys/qrcode/:wabaId', checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getBaileysQRCode);
router.put('/connect/:id', checkPermission('update.unified_whatsapp'), unifiedWhatsAppController.updateConnection);
router.post('/delete', checkPermission('delete.unified_whatsapp'), unifiedWhatsAppController.deleteConnections);
router.post('/disconnect', checkPermission('update.unified_whatsapp'), unifiedWhatsAppController.disconnectWhatsApp);
router.get('/connections', checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getUserConnections);
router.get('/waba-list', checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getWabaList);
router.get('/phone-numbers', checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getMyPhoneNumbers);
router.put('/phone-numbers/:phoneNumberId/set-primary', checkPermission('update.unified_whatsapp'), unifiedWhatsAppController.setPrimaryPhoneNumber);
router.get('/:wabaId/phone-numbers', checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getWabaPhoneNumbers);
router.post('/embedded-signup/connection', checkPermission('create.unified_whatsapp'), unifiedWhatsAppController.getEmbbededSignupConnection);
router.get('/contact-profile', checkPermission('view.unified_whatsapp'), unifiedWhatsAppController.getContactProfile);
export default router;
