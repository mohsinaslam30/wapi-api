import express from 'express';
import authController from '../controllers/auth.controller.js';
import { authenticate } from '../middlewares/auth.js';
import path from 'path';
import fs from 'fs/promises';
import { exec } from 'child_process';
import util from 'util';

const execPromise = util.promisify(exec);

const router = express.Router();

router.post('/register', authController.register);
router.post('/login', authController.login);

router.post('/verify-otp', authController.verifyOTP);
router.post('/resend-otp', authController.resendOTP);

router.post('/resend-signup-otp', authController.resendSignUpOTP);
router.post('/verify-signup-otp', authController.verifySignUpOTP);

router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.post('/reset-password-via-token', authController.resetPasswordViaToken);

router.post('/logout', authenticate, authController.logout);
router.get('/profile', authenticate, authController.getProfile);
router.put('/profile', authenticate, authController.updateProfile);
router.get('/roles', authController.getPublicRoles);
router.get('/my-permissions', authenticate, authController.getMyPermissions);
router.post('/change-password', authenticate, authController.changePassword);
router.delete('/delete-account', authenticate, authController.deleteAccount);
export default router;
