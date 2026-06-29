import express from 'express';
import { transformMessage, suggestReply, getSupportedLanguages } from '../controllers/ai-assistance.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPlanLimit } from '../middlewares/plan-permission.js'
import { checkPermission } from '../middlewares/permission.js';
import { requireSubscription } from '../middlewares/plan-permission.js';
const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);
router.use(checkPlanLimit('ai_prompts'));


router.post('/transform', checkPermission('create.ai_prompts'), transformMessage);
router.post('/suggest-reply', checkPermission('create.ai_prompts'), suggestReply);

router.get('/languages', checkPermission('view.languages'), getSupportedLanguages);

export default router;
