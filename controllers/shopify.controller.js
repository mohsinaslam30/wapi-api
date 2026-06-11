import { ShopifyConfiguration, EcommerceProduct, EcommerceCatalog, WhatsappWaba } from '../models/index.js';
import shopifyService from '../services/shopify.service.js';
import { createProductInCatalogFromAPI } from '../utils/ecommerce-catalog-service.js';
import mongoose from 'mongoose';

const maskSecret = (secret) => {
  if (!secret) return '';
  if (secret.length <= 8) return '*'.repeat(secret.length);
  return secret.slice(0, 6) + '*'.repeat(secret.length - 10) + secret.slice(-4);
};

const sanitizeConfig = (config) => {
  const sanitized = config.toObject ? config.toObject() : { ...config };
  sanitized.admin_api_access_token = maskSecret(sanitized.admin_api_access_token);
  if (sanitized.client_secret) {
    sanitized.client_secret = maskSecret(sanitized.client_secret);
  }
  return sanitized;
};


export const getShopifyConfig = async (req, res) => {
  try {
    const userId = req.user.owner_id;

    const config = await ShopifyConfiguration.findOne({
      user_id: new mongoose.Types.ObjectId(userId),
      deleted_at: null
    });

    if (!config) {
      return res.status(200).json({
        success: true,
        config: null
      });
    }

    return res.status(200).json({
      success: true,
      config: sanitizeConfig(config)
    });
  } catch (error) {
    console.error('Error fetching Shopify configuration:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve Shopify configuration',
      error: error.message
    });
  }
};

/**
 * Create or update Shopify configuration
 */
export const saveShopifyConfig = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { shop_domain, admin_api_access_token, client_id, client_secret, is_active } = req.body;

    if (!shop_domain) {
      return res.status(400).json({
        success: false,
        message: 'Shop domain is required'
      });
    }

    const normalizedDomain = shopifyService.normalizeDomain(shop_domain);

    let config = await ShopifyConfiguration.findOne({
      user_id: new mongoose.Types.ObjectId(userId),
      deleted_at: null
    });

    let token = admin_api_access_token;
    let secret = client_secret || '';

    if (config) {
      if (token && token.includes('*')) {
        token = config.admin_api_access_token;
      }
      if (secret && secret.includes('*')) {
        secret = config.client_secret;
      }
    }

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Admin API Access Token is required'
      });
    }

    console.log(`[Shopify Controller] Validating connection to ${normalizedDomain}`);
    try {
      await shopifyService.validateConfig(normalizedDomain, token);
    } catch (valError) {
      return res.status(400).json({
        success: false,
        message: 'Failed to connect to Shopify store. Please verify your shop domain and access token.',
        details: valError.message
      });
    }

    console.log(`[Shopify Controller] Hard-deleting existing Shopify products for user: ${userId}`);
    await EcommerceProduct.deleteMany({
      user_id: new mongoose.Types.ObjectId(userId),
      type: 'shopify'
    });

    if (config) {
      config.shop_domain = normalizedDomain;
      config.admin_api_access_token = token;
      config.client_id = client_id || '';
      config.client_secret = secret;
      if (is_active !== undefined) {
        config.is_active = is_active;
      }
      await config.save();
    } else {
      config = await ShopifyConfiguration.create({
        user_id: new mongoose.Types.ObjectId(userId),
        shop_domain: normalizedDomain,
        admin_api_access_token: token,
        client_id: client_id || '',
        client_secret: secret,
        is_active: is_active !== false,
        sync_status: 'idle'
      });
    }

    shopifyService.syncProducts(userId).catch(err => {
      console.error(`[Shopify Sync Background Error] Sync failed for user ${userId}:`, err);
    });

    return res.status(200).json({
      success: true,
      message: 'Shopify configuration saved and product synchronization started.',
      config: sanitizeConfig(config)
    });

  } catch (error) {
    console.error('Error saving Shopify configuration:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to save Shopify configuration',
      error: error.message
    });
  }
};

/**
 * Manually trigger product synchronization
 */
export const syncShopifyProducts = async (req, res) => {
  try {
    const userId = req.user.owner_id;

    const config = await ShopifyConfiguration.findOne({
      user_id: new mongoose.Types.ObjectId(userId),
      deleted_at: null
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Shopify store not connected. Please configure your shop connection first.'
      });
    }

    if (!config.is_active) {
      return res.status(400).json({
        success: false,
        message: 'Shopify integration is currently disabled.'
      });
    }

    if (config.sync_status === 'syncing') {
      return res.status(400).json({
        success: false,
        message: 'Synchronization is already in progress.'
      });
    }

    shopifyService.syncProducts(userId).catch(err => {
      console.error(`[Shopify Sync Background Error] Sync failed for user ${userId}:`, err);
    });

    return res.status(200).json({
      success: true,
      message: 'Product synchronization started.'
    });

  } catch (error) {
    console.error('Error triggering Shopify product sync:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to start product synchronization',
      error: error.message
    });
  }
};

/**
 * Disconnect Shopify configuration and delete imported products
 */
export const disconnectShopify = async (req, res) => {
  try {
    const userId = req.user.owner_id;

    const config = await ShopifyConfiguration.findOne({
      user_id: new mongoose.Types.ObjectId(userId),
      deleted_at: null
    });

    if (!config) {
      return res.status(404).json({
        success: false,
        message: 'Shopify configuration not found'
      });
    }

    config.deleted_at = new Date();
    config.is_active = false;
    await config.save();

    console.log(`[Shopify Controller] Hard-deleting Shopify products for user: ${userId}`);
    await EcommerceProduct.deleteMany({
      user_id: new mongoose.Types.ObjectId(userId),
      type: 'shopify'
    });

    return res.status(200).json({
      success: true,
      message: 'Shopify store disconnected and products removed successfully.'
    });

  } catch (error) {
    console.error('Error disconnecting Shopify store:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to disconnect Shopify store',
      error: error.message
    });
  }
};

/**
 * Fetch imported Shopify products
 */
export const getShopifyProducts = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { page = 1, limit = 10, search = '' } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const filter = {
      user_id: new mongoose.Types.ObjectId(userId),
      type: 'shopify',
      deleted_at: null,
      parent_product_external_id: null
    };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { retailer_id: { $regex: search, $options: 'i' } }
      ];
    }

    const totalCount = await EcommerceProduct.countDocuments(filter);
    const products = await EcommerceProduct.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const productsWithVariants = await Promise.all(
      products.map(async (product) => {
        const variants = await EcommerceProduct.find({
          user_id: new mongoose.Types.ObjectId(userId),
          type: 'shopify',
          parent_product_external_id: product.product_external_id,
          deleted_at: null
        }).lean();

        return {
          ...product,
          variants
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: {
        products: productsWithVariants,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalItems: totalCount,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching Shopify products:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve Shopify products',
      error: error.message
    });
  }
};

/**
 * Push selected Shopify products to a WhatsApp/WABA catalog
 */
export const pushProductsToWhatsapp = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { waba_id, product_ids } = req.body;

    if (!waba_id || !product_ids || !Array.isArray(product_ids) || product_ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'waba_id and product_ids (non-empty array) are required'
      });
    }

    const waba = await WhatsappWaba.findOne({
      _id: new mongoose.Types.ObjectId(waba_id),
      user_id: new mongoose.Types.ObjectId(userId),
      deleted_at: null
    });

    if (!waba) {
      return res.status(404).json({
        success: false,
        message: 'WhatsApp Business Account not found or does not belong to user'
      });
    }

    const catalog = await EcommerceCatalog.findOne({
      waba_id: waba._id,
      user_id: new mongoose.Types.ObjectId(userId),
      deleted_at: null
    });

    if (!catalog) {
      return res.status(404).json({
        success: false,
        message: 'No active WhatsApp Catalog found linked to the provided WhatsApp Business Account'
      });
    }

    const objectIds = product_ids.map(id => new mongoose.Types.ObjectId(id));

    const shopifyProducts = await EcommerceProduct.find({
      _id: { $in: objectIds },
      user_id: new mongoose.Types.ObjectId(userId),
      type: 'shopify',
      deleted_at: null
    });

    if (shopifyProducts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No matching Shopify products found for the provided IDs'
      });
    }

    const pushedProducts = [];
    const errors = [];

    for (const product of shopifyProducts) {
      try {
        const payload = {
          name: product.name,
          description: product.description || product.name,
          retailer_id: product.retailer_id,
          price: parseFloat(product.price) || 0.00,
          currency: product.currency || 'USD',
          image_url: product.image_urls?.[0] || '',
          url: product.url || '',
          availability: product.availability || 'in stock',
          condition: product.condition || 'new',
          brand: product.brand || 'Shopify',
          category: product.category || ''
        };

        if (product.retailer_product_group_id) {
          payload.retailer_product_group_id = product.retailer_product_group_id;
        }

        const response = await createProductInCatalogFromAPI(catalog.catalog_id, payload, waba.access_token);

        const wabaProduct = await EcommerceProduct.create({
          user_id: new mongoose.Types.ObjectId(userId),
          catalog_id: catalog._id,
          product_external_id: response.id || product.product_external_id,
          name: product.name,
          description: product.description || '',
          price: product.price,
          sale_price: product.sale_price,
          currency: product.currency || 'USD',
          availability: product.availability || 'in stock',
          condition: product.condition || 'new',
          image_urls: product.image_urls || [],
          url: product.url || '',
          category: product.category || '',
          brand: product.brand || 'Shopify',
          retailer_id: product.retailer_id,
          is_active: product.is_active,
          is_variant: product.is_variant,
          retailer_product_group_id: product.retailer_product_group_id,
          parent_product_external_id: product.parent_product_external_id,
          type: 'whatsapp',
          meta_data: response
        });

        pushedProducts.push({
          shopify_product_id: product._id,
          waba_product_db_id: wabaProduct._id,
          facebook_product_id: response.id
        });
      } catch (err) {
        console.error(`Error pushing product ${product._id} to Facebook:`, err.response?.data || err.message);
        errors.push({
          product_id: product._id,
          name: product.name,
          error: err.response?.data?.error?.message || err.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Successfully pushed ${pushedProducts.length} products to WhatsApp catalog.`,
      pushed: pushedProducts,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error pushing products to WhatsApp catalog:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to push products to WhatsApp catalog',
      error: error.message
    });
  }
};

export default {
  getShopifyConfig,
  saveShopifyConfig,
  syncShopifyProducts,
  disconnectShopify,
  getShopifyProducts,
  pushProductsToWhatsapp
};
