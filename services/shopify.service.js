import axios from 'axios';
import { ShopifyConfiguration, EcommerceProduct } from '../models/index.js';
import mongoose from 'mongoose';


export const normalizeDomain = (domain) => {
  if (!domain) return '';
  let normalized = domain.toLowerCase().trim();
  normalized = normalized.replace(/^(https?:\/\/)?(www\.)?/, '');
  normalized = normalized.replace(/\/+$/, '');
  return normalized;
};


export const parseLinkHeader = (header) => {
  if (!header) return {};
  const links = {};
  const parts = header.split(',');
  for (const part of parts) {
    const match = part.trim().match(/<([^>]+)>;\s*rel="([^"]+)"/);
    if (match) {
      links[match[2]] = match[1];
    }
  }
  return links;
};


export const stripHtml = (html) => {
  if (!html) return '';
  let text = html.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/g, ' ')
             .replace(/&amp;/g, '&')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&quot;/g, '"')
             .replace(/&#39;/g, "'");
  return text.replace(/\n\s*\n/g, '\n').trim();
};


export const validateConfig = async (shopDomain, adminApiAccessToken) => {
  const normalizedDomain = normalizeDomain(shopDomain);
  const url = `https://${normalizedDomain}/admin/api/2024-10/shop.json`;

  try {
    const response = await axios.get(url, {
      headers: {
        'X-Shopify-Access-Token': adminApiAccessToken,
        'Content-Type': 'application/json'
      },
      timeout: 15000
    });

    return {
      success: true,
      shop: response.data.shop
    };
  } catch (error) {
    console.error('Shopify configuration validation failed:', error.response?.data || error.message);
    throw new Error(error.response?.data?.errors || error.message || 'Failed to connect to Shopify store');
  }
};

export const syncProducts = async (userId) => {
  console.log(`[Shopify Sync] Starting product sync for user: ${userId}`);

  const config = await ShopifyConfiguration.findOne({
    user_id: new mongoose.Types.ObjectId(userId),
    deleted_at: null
  });

  if (!config || !config.is_active) {
    console.warn(`[Shopify Sync] No active Shopify configuration found for user: ${userId}`);
    return;
  }

  try {
    config.sync_status = 'syncing';
    await config.save();

    const shopDomain = normalizeDomain(config.shop_domain);
    const token = config.admin_api_access_token;

    let storeCurrency = 'USD';
    try {
      const shopRes = await axios.get(`https://${shopDomain}/admin/api/2024-10/shop.json`, {
        headers: { 'X-Shopify-Access-Token': token }
      });
      storeCurrency = shopRes.data.shop?.currency || 'USD';
    } catch (err) {
      console.warn(`[Shopify Sync] Failed to fetch shop details for currency, defaulting to USD:`, err.message);
    }

    let url = `https://${shopDomain}/admin/api/2024-10/products.json?limit=250`;
    const syncedExternalIds = [];

    while (url) {
      console.log(`[Shopify Sync] Fetching page: ${url}`);
      const response = await axios.get(url, {
        headers: {
          'X-Shopify-Access-Token': token,
          'Content-Type': 'application/json'
        }
      });

      const products = response.data?.products || [];
      console.log(`[Shopify Sync] Synced ${products.length} products on this page.`);

      for (const product of products) {
        const imageUrls = product.images?.map(img => img.src) || [];
        const mainImageUrl = product.image?.src || imageUrls[0] || '';

        const parentId = `shopify_prod_${product.id}`;

        const parentPayload = {
          user_id: new mongoose.Types.ObjectId(userId),
          catalog_id: undefined,
          product_external_id: parentId,
          name: product.title || '',
          description: stripHtml(product.body_html || ''),
          price: product.variants?.[0]?.price || '0.00',
          sale_price: product.variants?.[0]?.compare_at_price || product.variants?.[0]?.price || '0.00',
          currency: storeCurrency,
          availability: product.variants?.some(v => {
            const isAvailable = v.inventory_management === null || v.inventory_policy === 'continue' || (v.inventory_quantity !== undefined && v.inventory_quantity > 0);
            return isAvailable;
          }) ? 'in stock' : 'out of stock',
          condition: 'new',
          image_urls: imageUrls,
          url: `https://${shopDomain}/products/${product.handle}`,
          category: product.product_type || '',
          brand: product.vendor || '',
          retailer_id: parentId,
          is_active: product.status === 'active',
          is_variant: false,
          retailer_product_group_id: parentId,
          parent_product_external_id: null,
          type: 'shopify',
          meta_data: {
            shopify_id: product.id,
            handle: product.handle,
            tags: product.tags
          },
          deleted_at: null
        };

        await EcommerceProduct.findOneAndUpdate(
          { product_external_id: parentId, user_id: new mongoose.Types.ObjectId(userId), type: 'shopify' },
          { $set: parentPayload },
          { upsert: true, new: true }
        );
        syncedExternalIds.push(parentId);

        if (product.variants && product.variants.length > 0) {
          for (const variant of product.variants) {
            let variantImageUrl = mainImageUrl;
            if (variant.image_id && product.images) {
              const matchedImg = product.images.find(img => img.id === variant.image_id);
              if (matchedImg) {
                variantImageUrl = matchedImg.src;
              }
            }

            const variantId = `shopify_var_${variant.id}`;
            const isAvailable = variant.inventory_management === null || variant.inventory_policy === 'continue' || (variant.inventory_quantity !== undefined && variant.inventory_quantity > 0);

            const variantPayload = {
              user_id: new mongoose.Types.ObjectId(userId),
              catalog_id: undefined,
              product_external_id: variantId,
              name: `${product.title} - ${variant.title}`,
              description: stripHtml(product.body_html || ''),
              price: variant.price || '0.00',
              sale_price: variant.compare_at_price || variant.price || '0.00',
              currency: storeCurrency,
              availability: isAvailable ? 'in stock' : 'out of stock',
              condition: 'new',
              image_urls: [variantImageUrl],
              url: `https://${shopDomain}/products/${product.handle}?variant=${variant.id}`,
              category: product.product_type || '',
              brand: product.vendor || '',
              retailer_id: variant.sku || variantId,
              is_active: product.status === 'active',
              is_variant: true,
              retailer_product_group_id: parentId,
              parent_product_external_id: parentId,
              type: 'shopify',
              meta_data: {
                shopify_id: product.id,
                variant_id: variant.id,
                option_values: [variant.option1, variant.option2, variant.option3].filter(Boolean)
              },
              deleted_at: null
            };

            await EcommerceProduct.findOneAndUpdate(
              { product_external_id: variantId, user_id: new mongoose.Types.ObjectId(userId), type: 'shopify' },
              { $set: variantPayload },
              { upsert: true, new: true }
            );
            syncedExternalIds.push(variantId);
          }
        }
      }

      const links = parseLinkHeader(response.headers.link);
      url = links.next || null;
    }

    console.log(`[Shopify Sync] Clean up deleted products. Synced IDs count: ${syncedExternalIds.length}`);
    await EcommerceProduct.deleteMany({
      user_id: new mongoose.Types.ObjectId(userId),
      type: 'shopify',
      product_external_id: { $nin: syncedExternalIds }
    });

    config.sync_status = 'completed';
    config.last_sync_at = new Date();
    await config.save();
    console.log(`[Shopify Sync] Product sync completed successfully for user: ${userId}`);

  } catch (error) {
    console.error(`[Shopify Sync] Error during product sync for user: ${userId}:`, error.message);
    config.sync_status = 'failed';
    await config.save();
  }
};

export default {
  normalizeDomain,
  parseLinkHeader,
  validateConfig,
  syncProducts
};
