import express from 'express';
import * as workspaceController from '../controllers/workspace.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);

router.get('/connected', checkPermission('view.workspace'), workspaceController.getConnectedWorkspaces);
router.post('/', checkPermission('create.workspace'), workspaceController.createWorkspace);
router.get('/', checkPermission('view.workspace'), workspaceController.getWorkspaces);
router.get('/:id', checkPermission('view.workspace'), workspaceController.getWorkspaceById);
router.patch('/:id', checkPermission('update.workspace'), workspaceController.updateWorkspace);
router.delete('/:id', checkPermission('delete.workspace'), workspaceController.deleteWorkspace);

export default router;
