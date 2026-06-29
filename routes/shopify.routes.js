import express from 'express';
import {
  getShopifyConfig,
  saveShopifyConfig,
  syncShopifyProducts,
  disconnectShopify,
  getShopifyProducts,
  pushProductsToWhatsapp
} from '../controllers/shopify.controller.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

router.get('/config', authenticate, getShopifyConfig);

router.post('/config', authenticate, saveShopifyConfig);

router.post('/sync', authenticate, syncShopifyProducts);

router.delete('/config', authenticate, disconnectShopify);

router.get('/products', authenticate, getShopifyProducts);

router.post('/push-to-whatsapp', authenticate, pushProductsToWhatsapp);

export default router;
