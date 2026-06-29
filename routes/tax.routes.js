import express from 'express';
import { createTax, getTaxes, getTaxById, updateTax, deleteTax, bulkDeleteTaxes } from '../controllers/tax.controller.js';
import { authenticate, authorizeAdmin } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.use(authenticate);

router.post('/', checkPermission('create.taxes'), createTax);
router.get('/', checkPermission('view.taxes'), getTaxes);
router.get('/:id', checkPermission('view.taxes'), getTaxById);
router.patch('/:id', checkPermission('update.taxes'), updateTax);
router.delete('/:id', checkPermission('delete.taxes'), deleteTax);
router.post('/bulk-delete', checkPermission('delete.taxes'), bulkDeleteTaxes);

export default router;
