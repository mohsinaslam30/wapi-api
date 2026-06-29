import express from 'express';
import { connectChannel, getConnectedChannels, disconnectChannel /*, getTwitterConfig, twitterCallback */ } from '../controllers/omnichannel-connection.controller.js'; // DISABLED: Twitter not working
import { authenticate } from '../middlewares/auth.js';
import { requireSubscription, requirePlatformFeature } from '../middlewares/plan-permission.js';

const router = express.Router();

// DISABLED: Twitter not working
// router.get('/twitter/config', getTwitterConfig);
// router.get('/twitter/callback', twitterCallback);

router.use(authenticate);
router.use(requireSubscription);

router.post('/connect', requirePlatformFeature('connection'), connectChannel);
router.get('/', getConnectedChannels);
router.delete('/:id', disconnectChannel);

export default router;
