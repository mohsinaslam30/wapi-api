import express from 'express';
import { authenticate } from '../middlewares/auth.js';
import roleController from '../controllers/role.controller.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.get('/', roleController.getRoles);

router.use(authenticate);
router.post('/create', checkPermission('create.roles'), roleController.createRole);
router.get('/permissions', checkPermission('view.roles'), roleController.getAllPermission);
router.get('/:id', checkPermission('view.roles'), roleController.getRoleById);
router.put('/:id', checkPermission('update.roles'), roleController.updateRole);
router.delete('/delete', checkPermission('delete.roles'), roleController.deleteRoles);
router.patch('/:id/status', checkPermission('update.roles'), roleController.toggleRoleStatus);

export default router;
