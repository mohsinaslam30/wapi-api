import express from 'express';
import { handleFacebookCallback, getFacebookPages, syncFacebookPages, syncLinkedSocialAccounts, updateFacebookDefaults, disconnectFacebookPage } from '../controllers/facebook.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js'

const router = express.Router();

router.post('/callback', authenticate, checkPermission('manage.facebook'), handleFacebookCallback);
router.post('/connect', authenticate, checkPermission('manage.facebook'), handleFacebookCallback);
router.get('/pages', authenticate, checkPermission('manage.facebook'), getFacebookPages);
router.post('/sync', authenticate, checkPermission('manage.facebook'), syncFacebookPages);
router.get('/linked-accounts/sync', authenticate, checkPermission('manage.facebook'), syncLinkedSocialAccounts);
router.post('/linked-accounts/sync', authenticate, checkPermission('manage.facebook'), syncLinkedSocialAccounts);
router.post('/defaults', authenticate, checkPermission('manage.facebook'), updateFacebookDefaults);
router.delete('/pages/:id', authenticate, checkPermission('manage.facebook'), disconnectFacebookPage);

export default router;
