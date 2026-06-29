import express from 'express';
import {
  getWABACatalogs,
  syncWABACatalogs,
  linkCatalogToWABA,
  getLinkedCatalogs,
  getProductsFromCatalog,
  createProductInCatalog,
  getUserCatalogs,
  getUserProducts,
  deleteProductFromCatalog,
  updateProductInCatalog,
  getProductFunnels,
  getProductKanbanStatus,
  handleProductKanbanAction
} from '../controllers/ecommerce-catalog.controller.js';
import { authenticate } from '../middlewares/auth.js';
import { checkPermission } from '../middlewares/permission.js';

const router = express.Router();

router.get('/waba/:waba_id/catalogs', authenticate, checkPermission('view.ecommerce_catalogs'), getWABACatalogs);

router.post('/waba/:waba_id/sync-catalogs', authenticate, checkPermission('update.ecommerce_catalogs'), syncWABACatalogs);

router.post('/link-catalog', authenticate, checkPermission('update.ecommerce_catalogs'), linkCatalogToWABA);

router.get('/waba/:waba_id/linked-catalogs', authenticate, checkPermission('view.ecommerce_catalogs'), getLinkedCatalogs);

router.get('/catalog/:catalog_id/products', authenticate, checkPermission('view.products'), getProductsFromCatalog);

router.post('/catalog/:catalog_id/products', authenticate, checkPermission('create.products'), createProductInCatalog);

router.get('/user/catalogs', authenticate, checkPermission('view.ecommerce_catalogs'), getUserCatalogs);

router.get('/user/products', authenticate, checkPermission('view.products'), getUserProducts);

router.put('/catalog/:catalog_id/products/:product_id', authenticate, checkPermission('update.products'), updateProductInCatalog);

router.delete('/catalog/:catalog_id/products/:product_id', authenticate, checkPermission('delete.products'), deleteProductFromCatalog);

router.get('/funnels', authenticate, checkPermission('view.kanban_funnel'), getProductFunnels);
router.get('/:id/funnel-status', authenticate, checkPermission('view.kanban_funnel'), getProductKanbanStatus);
router.post('/funnel/action', authenticate, checkPermission('update.kanban_funnel'), handleProductKanbanAction);

export default router;
