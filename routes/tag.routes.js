import express from 'express';
import * as tagController from '../controllers/tag.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { requireSubscription, checkPlanLimit } from '../middlewares/plan-permission.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);

router.post('/', checkPlanLimit('tags'), checkPermission('create.tags'), tagController.createTag);
router.get('/', checkPermission('view.tags'), tagController.getTags);
router.get('/:id', checkPermission('view.tags'), tagController.getTagById);
router.put('/:id', checkPermission('update.tags'), tagController.updateTag);
router.delete('/delete', checkPermission('delete.tags'), tagController.deleteTags);

router.get('/stats/popular', checkPermission('view.tags'), tagController.getPopularTags);
router.get('/stats/usage', checkPermission('view.tags'), tagController.getTagsWithStats);

export default router;
