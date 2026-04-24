import express from 'express';
import whatsappConnectionController from '../controllers/whatsapp-connection.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPlanLimit, requireSubscription } from '../middlewares/plan-permission.js';
import multer from "multer";
const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 16 * 1024 * 1024
  }
});

router.use(authenticate);
router.use(requireSubscription);

router.post('/create', whatsappConnectionController.createWhatsappConnection);
router.get('/show', whatsappConnectionController.getWhatsappConnection);
router.put('/update', whatsappConnectionController.updateWhatsappConnection);
router.post('/send-message', checkPlanLimit('conversations'), upload.single('file'), whatsappConnectionController.sendMessage);

export default router;

