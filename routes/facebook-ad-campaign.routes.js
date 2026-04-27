import express from 'express';
import multer from 'multer';
import { authenticate } from '../middlewares/auth.js';
import {
  getAdAccounts,
  createFbAdCampaign,
  getFbAdCampaigns,
  getFbAdCampaignById,
  syncFbAdCampaignStatus,
  deleteFbAdCampaign,
  updateFbAdCampaignStatus,
  syncFacebookAdAccounts,
  updateFbAdCampaign,
  syncRemoteCampaigns,
  getFbAdInsights,
  getFbAdHierarchy,
  createFbAdSet,
  updateFbAdSet,
  deleteFbAdSet,
  createFbAd,
  updateFbAd,
  deleteFbAd,
  getAdSetsByCampaign,
  getAdSetById,
  getAdsByAdSet,
  getAdById,
  updateFbAdBudget
} from '../controllers/facebook-ad-campaign.controller.js';
import { checkPermission } from '../middlewares/permission.js';
import { requireSubscription, checkPlanLimit } from '../middlewares/plan-permission.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }
});

router.get('/hierarchy', checkPermission('view.facebook_ads'), getFbAdHierarchy);

router.get('/ad-accounts', checkPermission('view.facebook_ads'), getAdAccounts);
router.post('/ad-accounts/sync', checkPermission('create.facebook_ads'), syncFacebookAdAccounts);

router.get('/insights/:level/:id', checkPermission('view.facebook_ads'), getFbAdInsights);

router.patch('/budget/:level/:id', checkPermission('update.facebook_ads'), updateFbAdBudget);

router.post('/', upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'carousel_images', maxCount: 10 }
]), checkPlanLimit('facebookAds_campaign'), checkPermission('create.facebook_ads'), createFbAdCampaign);
router.post('/sync-external', checkPermission('create.facebook_ads'), syncRemoteCampaigns);
router.get('/', checkPermission('view.facebook_ads'), getFbAdCampaigns);
router.get('/:id', checkPermission('view.facebook_ads'), getFbAdCampaignById);
router.patch('/:id', checkPermission('update.facebook_ads'), updateFbAdCampaign);
router.post('/:id/sync', checkPermission('update.facebook_ads'), syncFbAdCampaignStatus);
router.post('/:id/status', checkPermission('update.facebook_ads'), updateFbAdCampaignStatus);
router.delete('/:id', checkPermission('delete.facebook_ads'), deleteFbAdCampaign);

router.get('/campaigns/:id/ad-sets', checkPermission('view.facebook_ads'), getAdSetsByCampaign);
router.get('/ad-sets/:id', checkPermission('view.facebook_ads'), getAdSetById);
router.get('/ad-sets/:id/ads', checkPermission('view.facebook_ads'), getAdsByAdSet);
router.post('/ad-sets', checkPermission('create.facebook_ads'), createFbAdSet);
router.patch('/ad-sets/:id', checkPermission('update.facebook_ads'), updateFbAdSet);
router.delete('/ad-sets/:id', checkPermission('delete.facebook_ads'), deleteFbAdSet);

router.get('/ads/:id', checkPermission('view.facebook_ads'), getAdById);
router.post('/ads', checkPermission('create.facebook_ads'), upload.fields([
  { name: 'image', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'carousel_images', maxCount: 10 }
]), createFbAd);
router.patch('/ads/:id', updateFbAd);
router.delete('/ads/:id', deleteFbAd);

export default router;
