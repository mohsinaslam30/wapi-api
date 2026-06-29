import express from 'express';
import {
  getCampaignStatistics,
  updateCampaignStatsFromMessageEndpoint,
  bulkUpdateCampaignStatsEndpoint,
  getCampaignStatsWithMessages
} from '../controllers/campaign-stats.controller.js';
import { checkPermission } from '../middlewares/permission.js';
import { authenticate } from '../middlewares/auth.js';
import { requireSubscription, requirePlanFeature } from '../middlewares/plan-permission.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);
router.use(requirePlanFeature('analytics'));

router.get('/:campaignId/stats', checkPermission('view.campaign_stats'), getCampaignStatistics);

router.get('/:campaignId/stats/messages', checkPermission('view.campaign_stats'), getCampaignStatsWithMessages);

router.post('/update-from-message', checkPermission('update.campaign_stats'), updateCampaignStatsFromMessageEndpoint);
router.post('/bulk-update', checkPermission('update.campaign_stats'), bulkUpdateCampaignStatsEndpoint);

export default router;
