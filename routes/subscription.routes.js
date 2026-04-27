import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
    getAllSubscriptions,
    getSubscriptionPayments,
    getUserSubscription,
    createStripeSubscription,
    createRazorpaySubscription,
    createPayPalSubscription,
    createManualSubscription,
    getPendingManualSubscriptions,
    approveManualSubscription,
    rejectManualSubscription,
    cancelSubscription,
    resumeSubscription,
    changeSubscriptionPlan,
    getManagePortalUrl,
    getSubscriptionUsage,
    getSubscriptionCheckoutUrl,
    getSubscriptionStats,
    assignPlanToUser,
    downloadInvoice,
    overrideSubscriptionLimits,
    resetSubscriptionLimits
} from '../controllers/subscription.controller.js';
import { authenticateUser, authorizeAdmin, authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

import { uploader } from '../utils/upload.js';

router.get('/my-subscription', authenticate, checkPermission('view.subscriptions'), getUserSubscription);
router.get('/usage', authenticate, checkPermission('view.subscriptions'), getSubscriptionUsage);
router.get('/checkout-url', authenticate, checkPermission('view.subscriptions'), getSubscriptionCheckoutUrl);
router.post('/create-stripe', authenticate, checkPermission('create.subscriptions'), createStripeSubscription);
router.post('/create-razorpay', authenticate, checkPermission('create.subscriptions'), createRazorpaySubscription);
router.post('/create-paypal', authenticate, checkPermission('create.subscriptions'), createPayPalSubscription);
router.post('/create-manual', authenticate, checkPermission('create.subscriptions'), uploader('receipts').single('transaction_receipt'), createManualSubscription);
router.get('/:id/manage-portal', authenticate, checkPermission('view.subscriptions'), getManagePortalUrl);
router.post('/:id/cancel', authenticate, checkPermission('update.subscriptions'), cancelSubscription);
router.post('/:id/resume', authenticate, checkPermission('update.subscriptions'), resumeSubscription);
router.post('/:id/change-plan', authenticate, checkPermission('update.subscriptions'), changeSubscriptionPlan);
router.get('/payment/:id/invoice', authenticate, checkPermission('view.subscriptions'), downloadInvoice);

router.get('/', authenticate, checkPermission('view.subscriptions'), getAllSubscriptions);
router.get('/stats', authenticate, checkPermission('view.subscriptions'), getSubscriptionStats);
router.get('/payments', authenticate, checkPermission('view.subscriptions'), getSubscriptionPayments);
router.get('/pending-manual', authenticate, checkPermission('view.subscriptions'), getPendingManualSubscriptions);
router.post('/:id/approve-manual', authenticate, checkPermission('update.subscriptions'), approveManualSubscription);
router.post('/:id/reject-manual', authenticate, checkPermission('update.subscriptions'), rejectManualSubscription);
router.post('/assign', authenticate, checkPermission('update.subscriptions'), assignPlanToUser);
router.patch('/:userId/override-limits', authenticate, checkPermission('update.subscriptions'), overrideSubscriptionLimits);
router.delete('/:userId/reset-limits', authenticate, checkPermission('update.subscriptions'), resetSubscriptionLimits);

export default router;
