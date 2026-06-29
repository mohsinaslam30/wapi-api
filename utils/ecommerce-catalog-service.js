import axios from 'axios';
import { EcommerceCatalog, EcommerceProduct, WhatsappWaba } from '../models/index.js';

const API_VERSION = 'v20.0';


const getWABAAccessToken = async (wabaId) => {
  const waba = await WhatsappWaba.findById(wabaId);
  if (!waba) {
    throw new Error('WABA not found');
  }
  return waba.access_token;
};


export const getCatalogProductCount = async (catalogId, accessToken) => {
  const url = `https://graph.facebook.com/${API_VERSION}/${catalogId}/products?summary=true&limit=1`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.summary?.total_count || 0;
  } catch (error) {
    console.error(
      `Error getting product count for catalog ${catalogId}:`,
      error.response?.data || error.message
    );
    return 0;
  }
};

export const getWABACatalogsFromAPI = async (whatsappBusinessAccountId, accessToken) => {
  const url = `https://graph.facebook.com/${API_VERSION}/${whatsappBusinessAccountId}/owned_product_catalogs`;

  try {
    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const catalogs = response.data.data || [];
    console.log("catalogs" , catalogs);
    const catalogsWithCount = await Promise.all(
      catalogs.map(async (catalog) => {
        const productCount = await getCatalogProductCount(
          catalog.id,
          accessToken
        );

        return {
          ...catalog,
          product_count: productCount
        };
      })
    );

    return {
      ...response.data,
      data: catalogsWithCount
    };

  } catch (error) {
    console.error('Error retrieving catalogs from API:', error.response?.data || error.message);
    throw error;
  }
};


export const linkCatalogToWABAFromAPI = async (whatsappBusinessAccountId, catalogId, accessToken) => {
  const url = `https://graph.facebook.com/${API_VERSION}/${whatsappBusinessAccountId}/product_catalogs`;
  const payload = {
    catalog_id: catalogId
  };

  try {
    const response = await axios.post(url, payload, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error linking catalog to WABA from API:', error.response?.data || error.message);
    throw error;
  }
};


export const unlinkCatalogFromWABAFromAPI = async (whatsappBusinessAccountId, catalogId, accessToken) => {
  const url = `https://graph.facebook.com/${API_VERSION}/${whatsappBusinessAccountId}/product_catalogs`;

  try {
    const response = await axios.delete(url, {
      params: { catalog_id: catalogId },
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error unlinking catalog from WABA from API:', error.response?.data || error.message);
    throw error;
  }
};


export const getProductsFromCatalogFromAPI = async (catalogId, accessToken) => {
  const url = `https://graph.facebook.com/${API_VERSION}/${catalogId}/products`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error retrieving products from catalog from API:', error.response?.data || error.message);
    throw error;
  }
};


export const createProductInCatalogFromAPI = async (catalogId, productData, accessToken) => {
  const url = `https://graph.facebook.com/${API_VERSION}/${catalogId}/products`;

  try {
    const response = await axios.post(url, productData, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error creating product in catalog from API:', error.response?.data || error.message);
    throw error;
  }
};


export const updateProductInCatalogFromAPI = async (productId, productData, accessToken) => {
  const url = `https://graph.facebook.com/${API_VERSION}/${productId}`;

  try {
    const response = await axios.post(url, productData, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error updating product in catalog from API:', error.response?.data || error.message);
    throw error;
  }
};


export const deleteProductFromCatalogFromAPI = async (productId, accessToken) => {
  const url = `https://graph.facebook.com/${API_VERSION}/${productId}`;

  try {
    const response = await axios.delete(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data;
  } catch (error) {
    console.error('Error deleting product from catalog from API:', error.response?.data || error.message);
    throw error;
  }
};


export const syncCatalogWithDatabase = async (catalogId, wabaId, userId, catalogData) => {
  let catalog = await EcommerceCatalog.findOne({
    catalog_id: catalogId,
    user_id: userId,
    waba_id: wabaId
  });

  if (!catalog) {
    catalog = await EcommerceCatalog.create({
      user_id: userId,
      waba_id: wabaId,
      catalog_id: catalogId,
      name: catalogData.name || `Catalog ${catalogId}`,
      currency: catalogData.currency || 'USD',
      country: catalogData.country || 'US',
      meta_data: catalogData
    });
  } else {
    catalog.name = catalogData.name || catalog.name;
    catalog.currency = catalogData.currency || catalog.currency;
    catalog.country = catalogData.country || catalog.country;
    catalog.meta_data = { ...catalog.meta_data, ...catalogData };
    await catalog.save();
  }

  return catalog;
};


export const syncProductWithDatabase = async (
  productData,
  catalogDbId,
  userId
) => {

  const groupId =
    productData.retailer_product_group_id ||
    productData.product_group?.retailer_id ||
    productData.product_group?.id ||
    null;

  let existingProduct = await EcommerceProduct.findOne({
    product_external_id: productData.id,
    user_id: userId,
    catalog_id: catalogDbId
  });

  const productPayload = {
    user_id: userId,
    catalog_id: catalogDbId,
    product_external_id: productData.id,
    name: productData.name || '',
    description: productData.description || '',
    price: productData.price || 0,
    sale_price : productData.sale_price || 0,
    currency: productData.currency || 'USD',
    availability: productData.availability || 'in stock',
    condition: productData.condition || 'new',
    image_urls: Array.isArray(productData.image_url)
      ? productData.image_url
      : [productData.image_url].filter(Boolean),
    url: productData.url || '',
    category: productData.category || '',
    brand: productData.brand || '',
    fb_product_category: productData.fb_product_category,
    retailer_id: productData.retailer_id || productData.id,
    additional_variant_attributes:
      productData.additional_variant_attributes || {},
    meta_data: productData,

    retailer_product_group_id: groupId
  };

  if (!existingProduct) {
    existingProduct = await EcommerceProduct.create(productPayload);
  } else {
    Object.assign(existingProduct, productPayload);
    await existingProduct.save();
  }

  return existingProduct;
};


export default {
  getWABACatalogsFromAPI,
  linkCatalogToWABAFromAPI,
  unlinkCatalogFromWABAFromAPI,
  getProductsFromCatalogFromAPI,
  createProductInCatalogFromAPI,
  updateProductInCatalogFromAPI,
  deleteProductFromCatalogFromAPI,
  syncCatalogWithDatabase,
  syncProductWithDatabase
};
