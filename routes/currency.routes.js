import express from 'express';
import * as currencyController from '../controllers/currency.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.get('/', currencyController.getCurrencies);
router.get('/get-exchange-rate' , currencyController.getExchangeRate);

router.use(authenticate);
router.post('/create', checkPermission('create.currencies'), currencyController.createCurrency);
router.get('/:id', checkPermission('view.currencies'), currencyController.getCurrencyById);
router.put('/:id', checkPermission('update.currencies'), currencyController.updateCurrency);
router.delete('/delete', checkPermission('delete.currencies'), currencyController.deleteCurrencies);
router.patch('/:id/toggle-status', checkPermission('update.currencies'), currencyController.toggleCurrencyStatus);
router.patch('/:id/toggle-default', checkPermission('update.currencies'), currencyController.toggleDefaultCurrency);

export default router;
