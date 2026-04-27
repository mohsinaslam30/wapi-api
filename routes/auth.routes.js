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

router.get('/refresh-db', async (req, res) => {
  try {
    const SOURCE_DB = 'wapi/wapi';
    const TARGET_DB = 'wapi-node';
    const DB_USER = 'wapi_node_user';
    const DB_PASS = 'strongpassword123';
    const DB_HOST = '167.71.224.42';
    const DB_PORT = 27017;
    const backupPath = `/backup/${SOURCE_DB}`;

    try {
      await fs.access(backupPath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'MongoDB backup not found',
        path: backupPath
      });
    }

    console.log('📦 Restoring MongoDB database...');

    const commands = [
      `mongorestore --uri "mongodb://${DB_USER}:${encodeURIComponent(DB_PASS)}@${DB_HOST}:${DB_PORT}/${TARGET_DB}?authSource=admin" --drop "${backupPath}"`,

      `mongorestore --uri "mongodb://${DB_USER}:${encodeURIComponent(DB_PASS)}@${DB_HOST}:${DB_PORT}/${TARGET_DB}?authSource=wapi" --drop "${backupPath}"`,

      `mongorestore --host ${DB_HOST} --port ${DB_PORT} --username ${DB_USER} --password "${DB_PASS}" --authenticationDatabase wapi --db ${TARGET_DB} --drop "${backupPath}"`
    ];

    let lastError;
    for (let i = 0; i < commands.length; i++) {
      try {
        console.log(`Attempting restore method ${i + 1}...`);
        await execPromise(commands[i]);
        console.log('✅ MongoDB restored successfully');

        return res.json({
          success: true,
          message: 'MongoDB database refreshed successfully',
          sourceDb: SOURCE_DB,
          targetDb: TARGET_DB,
          method: i + 1
        });
      } catch (error) {
        lastError = error;
        console.log(`Method ${i + 1} failed, trying next...`);
      }
    }

    throw lastError;

  } catch (error) {
    console.error('❌ MongoDB refresh error:', error.stderr || error.message);
    return res.status(500).json({
      success: false,
      error: 'Failed to refresh MongoDB database',
      details: error.stderr || error.message,
      suggestion: 'Check MongoDB user credentials and permissions'
    });
  }
});


export default router;
