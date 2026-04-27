import express from 'express';
import {
  getFunnels,
  createFunnel,
  updateFunnel,
  deleteFunnel,
  getAvailableData,
  getFunnelById,
  syncStages,
  getFunnelItems,
  moveItem,
  updateFunnelItem,
  deleteFunnelItem,
  getFunnelStages
} from '../controllers/kanban-funnel.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';
import { checkPlanLimit, requireSubscription } from '../middlewares/plan-permission.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);

router.get('/', checkPermission('view.kanban_funnel'), getFunnels);
router.post('/', checkPlanLimit('kanban_funnels'), checkPermission('create.kanban_funnel'), createFunnel);

router.get('/:id', checkPermission('view.kanban_funnel'), getFunnelById);
router.patch('/:id', checkPermission('update.kanban_funnel'), updateFunnel);
router.delete('/:id', checkPermission('delete.kanban_funnel'), deleteFunnel);
router.get('/:id/available-data', checkPermission('view.kanban_funnel'), getAvailableData);

router.get('/:id/items', checkPermission('view.kanban_funnel'), getFunnelItems);

router.post('/:id/items/move', checkPermission('update.kanban_funnel'), moveItem);
router.patch('/:id/items/:itemId', checkPermission('update.kanban_funnel'), updateFunnelItem);
router.delete('/:id/items/:itemId', checkPermission('delete.kanban_funnel'), deleteFunnelItem);

router.get('/:id/stages', checkPermission('view.kanban_funnel'), getFunnelStages);
router.put('/:id/stages', checkPermission('update.kanban_funnel'), syncStages);

export default router;
