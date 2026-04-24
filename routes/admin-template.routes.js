import express from 'express';
import { authenticate, authorizeAdmin, authorizeRoles } from "../middlewares/auth.js";
import adminTemplateController from '../controllers/admin-template.controller.js';
import { uploader } from '../utils/upload.js';
import { checkPermission } from '../middlewares/permission.js';
const upload = uploader();

const router = express.Router();

router.use(authenticate);

router.post('/', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'card_media', maxCount: 10 }]), checkPermission('create.admin-template'), adminTemplateController.createAdminTemplate);
router.get("/", checkPermission('view.admin-template'), adminTemplateController.getAllAdminTemplates);
router.get('/:id', checkPermission('view.admin-template'), adminTemplateController.getAdminTemplateById);
router.put('/:id', upload.fields([{ name: 'file', maxCount: 1 }, { name: 'card_media', maxCount: 10 }]), checkPermission('update.admin-template'), adminTemplateController.updateAdminTemplate);
router.delete("/:id", checkPermission('delete.admin-template'), adminTemplateController.deleteAdminTemplate);
router.delete("/", checkPermission('delete.admin-template'), adminTemplateController.bulkDeleteAdminTemplates);

export default router;
