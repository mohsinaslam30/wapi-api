import express from 'express';
const router = express.Router();
import { getAuthPageSetup, updateAuthPageSetup } from '../controllers/authPageSetup.controller.js';
import { authenticateUser } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

router.get('/', getAuthPageSetup);

router.put('/', authenticateUser, checkPermission('update.auth_page_setup'), updateAuthPageSetup);

export default router;
