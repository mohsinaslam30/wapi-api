import express from 'express';
import * as languageController from '../controllers/language.controller.js';
import { authenticate, authorizeAdmin } from '../middlewares/auth.js';
import { uploader } from '../utils/upload.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.get('/', languageController.getLanguages);
router.get('/translations/:locale', languageController.getTranslations);

router.use(authenticate);

const languageUploadFields = [
    { name: 'front_translation_file', maxCount: 1 },
    { name: 'admin_translation_file', maxCount: 1 },
    { name: 'app_translation_file', maxCount: 1 },
    { name: 'flag', maxCount: 1 }
];

router.post('/create', uploader('languages').fields(languageUploadFields), checkPermission('create.languages'), languageController.createLanguage);
router.get('/:id', checkPermission('view.languages'), languageController.getLanguageById);
router.put('/:id', uploader('languages').fields(languageUploadFields), checkPermission('update.languages'), languageController.updateLanguage);
router.delete('/delete', checkPermission('delete.languages'), languageController.deleteLanguages);
router.patch('/:id/toggle-status', checkPermission('update.languages'), languageController.toggleLanguageStatus);

router.put('/translations/:locale', checkPermission('update.languages'), languageController.updateTranslations);
router.patch('/:id/toggle-default', checkPermission('update.languages'), languageController.toggleDefaultLanguage);

export default router;
