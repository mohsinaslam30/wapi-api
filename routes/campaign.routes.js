import express from 'express';
import { authenticate, authorizeRoles } from '../middlewares/auth.js';
import { requireSubscription, checkPlanLimit } from '../middlewares/plan-permission.js';
import campaignController from '../controllers/campaign.controller.js';
import { checkPermission } from '../middlewares/permission.js';
import multer from 'multer';

import { uploader } from '../utils/upload.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);

router.post('/', checkPlanLimit('campaigns'), uploader('campaigns').fields([{ name: 'file_url', maxCount: 1 }, { name: 'carousel_files' }]), checkPermission('create.campaigns'), campaignController.createCampaign);
router.get('/', checkPermission('view.campaigns'), campaignController.getAllCampaigns);
router.get('/:id', checkPermission('view.campaigns'), campaignController.getCampaignById);
router.put('/:id', checkPermission('update.campaigns'), campaignController.updateCampaign);
router.delete('/:id', checkPermission('delete.campaigns'), campaignController.deleteCampaign);
router.post('/:id/send', checkPermission('create.campaigns'), campaignController.sendCampaign);

export default router;
