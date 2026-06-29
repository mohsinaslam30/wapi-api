import express from 'express';
import * as teamController from '../controllers/team.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { requireSubscription, checkPlanLimit } from '../middlewares/plan-permission.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);
router.use(requireSubscription);

router.post('/create', checkPlanLimit('teams'), checkPermission('create.teams'), teamController.createTeam);
router.get('/', checkPermission('view.teams'), teamController.getAllTeams);
router.get('/permissions', checkPermission('view.teams'), teamController.getPermissions);
router.get('/:id', checkPermission('view.teams'), teamController.getTeamById);
router.put('/:id', checkPermission('update.teams'), teamController.updateTeam);
router.delete('/delete', checkPermission('delete.teams'), teamController.deleteTeam);
router.patch('/:id/toggle-status', checkPermission('update.teams'), teamController.toggleTeamStatus);


export default router;
