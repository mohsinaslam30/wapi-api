import axios from 'axios';
import { EcommerceCatalog, EcommerceProduct, WhatsappWaba } from '../models/index.js';
import {
  getWABACatalogsFromAPI,
  linkCatalogToWABAFromAPI,
  unlinkCatalogFromWABAFromAPI,
  getProductsFromCatalogFromAPI,
  createProductInCatalogFromAPI,
  updateProductInCatalogFromAPI,
  deleteProductFromCatalogFromAPI,
  syncCatalogWithDatabase,
  syncProductWithDatabase,
  getCatalogProductCount
} from '../utils/ecommerce-catalog-service.js';
import mongoose  from 'mongoose';
const API_VERSION = 'v20.0';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_SORT_FIELD = 'created_at';
const DEFAULT_SORT_ORDER = -1;

const ALLOWED_SORT_FIELDS = [
  '_id',
  'name',
  'price',
  'created_at',
  'updated_at'
];

const SORT_ORDER = {
  ASC: 1,
  DESC: -1
};

const parsePaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
  const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(query.limit) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const parseSortParams = (query) => {
  const sortField = ALLOWED_SORT_FIELDS.includes(query.sort_by)
    ? query.sort_by
    : DEFAULT_SORT_FIELD;

  const sortOrder = query.sort_order?.toUpperCase() === 'ASC'
    ? SORT_ORDER.ASC
    : SORT_ORDER.DESC;

  return { sortField, sortOrder };
};

const buildSearchQuery = (searchTerm) => {
  if (!searchTerm || searchTerm.trim() === '') {
    return {};
  }

  const sanitizedSearch = searchTerm.trim();

  return {
    $or: [
      { name: { $regex: sanitizedSearch, $options: 'i' } },
      { description: { $regex: sanitizedSearch, $options: 'i' } },
      { retailer_id: { $regex: sanitizedSearch, $options: 'i' } }
    ]
  };
};


export const syncWABACatalogs = async (req, res) => {
  try {
    const userId = req.user.id;
    const { waba_id } = req.params;

    const waba = await WhatsappWaba.findOne({
      _id: waba_id,
      user_id: userId,
      deleted_at: null
    });

    if (!waba) {
      return res.status(404).json({
        success: false,
        error: 'WABA not found or does not belong to user'
      });
    }

    const response = await getWABACatalogsFromAPI(waba.business_id, waba.access_token);
    const catalogs = response.data || [];

    for (const catalogData of catalogs) {
      const productCount = await getCatalogProductCount(catalogData.id, waba.access_token);

      await syncCatalogWithDatabase(catalogData.id, waba_id, userId, {
        ...catalogData,
        product_count: productCount
      });
    }

    return res.json({
      success: true,
      message: `Successfully synced ${catalogs.length} catalogs`,
      data: {
        synced_count: catalogs.length,
        catalogs: catalogs
      }
    });
  } catch (error) {
    console.error('Error syncing WABA catalogs:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to sync catalogs',
      details: error.response?.data || error.message
    });
  }
};

export const getWABACatalogs = async (req, res) => {
  try {
    const userId = req.user.id;
    const { waba_id } = req.params;

    const waba = await WhatsappWaba.findOne({
      _id: waba_id,
      user_id: userId,
      deleted_at: null
    });

    if (!waba) {
      return res.status(404).json({
        success: false,
        error: 'WABA not found or does not belong to user'
      });
    }

    const catalogs = await EcommerceCatalog.find({
      user_id: userId,
      waba_id: waba_id,
      deleted_at: null
    }).lean();

    const catalogsPopulatedWithCounts = await Promise.all(
      catalogs.map(async (catalog) => {
        const productCount = await EcommerceProduct.countDocuments({
          catalog_id: catalog._id,
          deleted_at: null
        });

        return {
          ...catalog,
          product_count: productCount
        };
      })
    );

    return res.json({
      success: true,
      data: {
        data: catalogsPopulatedWithCounts
      }
    });
  } catch (error) {
    console.error('Error getting WABA catalogs from database:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get catalogs',
      details: error.message
    });
  }
};


export const linkCatalogToWABA = async (req, res) => {
  try {
    const userId = req.user.id;
    const { waba_id, catalog_id } = req.body;

    if (!waba_id || !catalog_id) {
      return res.status(400).json({
        success: false,
        error: 'WABA ID and Catalog ID are required'
      });
    }

    const waba = await WhatsappWaba.findOne({
      _id: waba_id,
      user_id: userId,
      deleted_at: null
    });

    if (!waba) {
      return res.status(404).json({
        success: false,
        error: 'WABA not found or does not belong to user'
      });
    }

    const existingLinkedCatalogs = await EcommerceCatalog.find({
      user_id: userId,
      waba_id: waba_id,
      is_linked: true,
      deleted_at: null
    });

    for (const existing of existingLinkedCatalogs) {
      try {
        await unlinkCatalogFromWABAFromAPI(
          waba.whatsapp_business_account_id,
          existing.catalog_id,
          waba.access_token
        );
      } catch (unlinkError) {
        console.error('Error unlinking existing catalog from WABA:', unlinkError.response?.data || unlinkError.message);
      }

      existing.is_linked = false;
      await existing.save();
    }
    const linkedCatalog = await EcommerceCatalog.findById(catalog_id);

  console.log("linkedCatalog", linkedCatalog.catalog_id);
    const response = await linkCatalogToWABAFromAPI(
      waba.whatsapp_business_account_id,
      linkedCatalog.catalog_id,
      waba.access_token
    );

    const catalogDetailsUrl = `https://graph.facebook.com/${API_VERSION}/${linkedCatalog.catalog_id}`;
    const catalogDetailsResponse = await axios.get(catalogDetailsUrl, {
      headers: {
        'Authorization': `Bearer ${waba.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    const catalog = await syncCatalogWithDatabase(linkedCatalog.catalog_id, waba_id, userId, catalogDetailsResponse.data);

    catalog.is_linked = true;
    await catalog.save();

    return res.json({
      success: true,
      message: 'Catalog linked to WABA successfully',
      data: {
        catalog_id: catalog_id,
        catalog_db_id: catalog._id,
        response: response
      }
    });
  } catch (error) {
    console.error('Error linking catalog to WABA:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to link catalog to WABA',
      message: error.response?.data.error.error_user_msg || error.message,
      details: error.response?.data.error  || error.message
    });
  }
};


export const getLinkedCatalogs = async (req, res) => {
  try {
    const userId = req.user.id;
    const { waba_id } = req.params;

    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const searchTerm = req.query.search || '';
    const searchQuery = buildSearchQuery(searchTerm);

    const waba = await WhatsappWaba.findOne({
      _id: waba_id,
      user_id: userId,
      deleted_at: null
    });

    if (!waba) {
      return res.status(404).json({
        success: false,
        error: 'WABA not found or does not belong to user'
      });
    }

    const baseFilter = {
      user_id: userId,
      waba_id: waba_id,
      is_linked: true,
      deleted_at: null
    };

    const combinedFilter = { ...baseFilter, ...searchQuery };

    const totalCount = await EcommerceCatalog.countDocuments(combinedFilter);

    const catalogs = await EcommerceCatalog.find(combinedFilter)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    const catalogsPopulatedWithCounts = await Promise.all(
      catalogs.map(async (catalog) => {
        const productCount = await EcommerceProduct.countDocuments({
          catalog_id: catalog._id,
          deleted_at: null
        });

        return {
          ...catalog,
          product_count: productCount
        };
      })
    );

    return res.json({
      success: true,
      data: {
        catalogs: catalogsPopulatedWithCounts,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit
        }
      }
    });
  } catch (error) {
    console.error('Error getting linked catalogs:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get linked catalogs',
      details: error.message
    });
  }
};


export const getProductsFromCatalog = async (req, res) => {
  try {
    const userId = req.user.id;
    const { catalog_id } = req.params;

    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const searchTerm = req.query.search || '';
    const searchQuery = buildSearchQuery(searchTerm);

    const catalog = await EcommerceCatalog.findOne({
      _id: catalog_id,
      user_id: userId,
      deleted_at: null
    });

    if (!catalog) {
      return res.status(404).json({
        success: false,
        error: 'Catalog not found or does not belong to user'
      });
    }

    const waba = await WhatsappWaba.findById(catalog.waba_id);

    if (!waba) {
      return res.status(404).json({
        success: false,
        error: 'WABA not found'
      });
    }

    let url = `https://graph.facebook.com/${API_VERSION}/${catalog.catalog_id}/products?fields=id,name,fb_product_category,retailer_product_group_id,description,price,sale_price,currency,availability,condition,image_url,url,brand,category,retailer_id,additional_variant_attributes,product_variants_group_id,visibility,video_url,main_image_url,images,prices,variants,product_type&limit=${limit}&offset=${skip}`;

    if (searchTerm) {
      url += `&q=${encodeURIComponent(searchTerm)}`;
    }

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${waba.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data && Array.isArray(response.data.data)) {

      for (const product of response.data.data) {

        if (product.deleted_at) continue;


        if (product.product_variants_group_id) continue;

        await syncProductWithDatabase(product, catalog._id, userId);
      }
    }

    const dbFilter = {
      user_id: userId,
      catalog_id: catalog._id,
      deleted_at: null,
      product_variants_group_id: { $exists: false }
    };

    const combinedFilter = { ...dbFilter, ...searchQuery };

    const products = await EcommerceProduct.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          catalog_id: new mongoose.Types.ObjectId(catalog._id),
          deleted_at: null
        }
      },
      {
        $group: {
          _id: "$retailer_product_group_id",
          products: { $push: "$$ROOT" }
        }
      },
      {
        $project: {
          _id: 0,
          product: { $arrayElemAt: ["$products", 0] },
          variants: {
            $cond: [
              { $gt: [{ $size: "$products" }, 1] },
              {
                $slice: [
                  "$products",
                  1,
                  { $subtract: [{ $size: "$products" }, 1] }
                ]
              },
              []
            ]
          }
        }
      },
      {
        $addFields: {
          "product.variants": "$variants"
        }
      },
      {
        $replaceRoot: { newRoot: "$product" }
      },

      {
        $project: {
          meta_data: 0,
          "variants.meta_data": 0
        }
      },

      { $skip: skip },
      { $limit: limit }
    ]);

    const totalDbCount = await EcommerceProduct.countDocuments(combinedFilter);

    return res.json({
      success: true,
      data: {
        products,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalDbCount / limit),
          totalItems: totalDbCount,
          itemsPerPage: limit
        }
      }
    });

  } catch (error) {
    console.error('Error getting products from catalog:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get products from catalog',
      message: error.response?.data.error.error_user_msg || error.message,
      details: error.response?.data || error.message
    });
  }
};


export const createProductInCatalog = async (req, res) => {
  try {
    const userId = req.user.id;
    const { catalog_id } = req.params;
    const productData = req.body;

    const catalog = await EcommerceCatalog.findOne({
      _id: catalog_id,
      user_id: userId,
      deleted_at: null
    });

    if (!catalog) {
      return res.status(404).json({
        success: false,
        error: 'Catalog not found or does not belong to user'
      });
    }

    const waba = await WhatsappWaba.findById(catalog.waba_id);

    if (!waba) {
      return res.status(404).json({
        success: false,
        error: 'WABA not found'
      });
    }

    if (!productData.retailer_id) {
      return res.status(400).json({
        success: false,
        error: 'retailer_id is required for the product'
      });
    }

    const response = await createProductInCatalogFromAPI(catalog.catalog_id, productData, waba.access_token);

    const newProduct = await EcommerceProduct.create({
      user_id: userId,
      catalog_id: catalog._id,
      product_external_id: response.id,
      name: productData.name || '',
      description: productData.description || '',
      price: parseFloat(productData.price) || 0,
      sale_price: productData.sale_price || 0,
      currency: productData.currency || 'USD',
      availability: productData.availability || 'in stock',
      condition: productData.condition || 'new',
      image_urls: Array.isArray(productData.image_urls) ? productData.image_urls : [productData.image_urls].filter(Boolean),
      url: productData.url || '',
      category: productData.category || '',
      brand: productData.brand || '',
      retailer_id: productData.retailer_id,
      additional_variant_attributes: productData.additional_variant_attributes || {},
      meta_data: productData
    });

    return res.json({
      success: true,
      message: 'Product created successfully',
      data: {
        product_id: response.id,
        product_db_id: newProduct._id,
        response: response
      }
    });
  } catch (error) {
    console.error('Error creating product in catalog:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create product in catalog',
      message: error.response?.data.error.error_user_msg || error.message,
      details: error.response?.data || error.message
    });
  }
};


export const getUserCatalogs = async (req, res) => {
  try {
    const userId = req.user.id;

    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const searchTerm = req.query.search || '';
    const searchQuery = buildSearchQuery(searchTerm);

    const baseFilter = {
      user_id: userId,
      deleted_at: null
    };

    const combinedFilter = { ...baseFilter, ...searchQuery };

    const totalCount = await EcommerceCatalog.countDocuments(combinedFilter);

    const catalogs = await EcommerceCatalog.find(combinedFilter)
      .populate('waba_id', 'name whatsapp_business_account_id')
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    const catalogsPopulatedWithCounts = await Promise.all(
      catalogs.map(async (catalog) => {
        const productCount = await EcommerceProduct.countDocuments({
          catalog_id: catalog._id,
          deleted_at: null
        });

        return {
          ...catalog,
          product_count: productCount
        };
      })
    );

    return res.json({
      success: true,
      data: {
        catalogs: catalogsPopulatedWithCounts,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit
        }
      }
    });
  } catch (error) {
    console.error('Error getting user catalogs:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user catalogs',
      details: error.message
    });
  }
};


export const getUserProducts = async (req, res) => {
  try {
    const userId = req.user.id;
    const { catalog_id } = req.query;

    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const searchTerm = req.query.search || '';
    const searchQuery = buildSearchQuery(searchTerm);

    const baseFilter = {
      user_id: userId,
      deleted_at: null
    };

    if (catalog_id) {
      baseFilter.catalog_id = catalog_id;
    }

    const combinedFilter = { ...baseFilter, ...searchQuery };

    const totalCount = await EcommerceProduct.countDocuments(combinedFilter);

    const products = await EcommerceProduct.find(combinedFilter)
      .populate('catalog_id', 'name catalog_id')
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.json({
      success: true,
      data: {
        products,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit
        }
      }
    });
  } catch (error) {
    console.error('Error getting user products:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user products',
      details: error.message
    });
  }
};


export const deleteProductFromCatalog = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id, catalog_id } = req.params;

    const catalog = await EcommerceCatalog.findOne({
      _id: catalog_id,
      user_id: userId,
      deleted_at: null
    });

    if (!catalog) {
      return res.status(404).json({
        success: false,
        error: 'Catalog not found or does not belong to user'
      });
    }

    const waba = await WhatsappWaba.findById(catalog.waba_id);

    if (!waba) {
      return res.status(404).json({
        success: false,
        error: 'WABA not found'
      });
    }

    const response = await deleteProductFromCatalogFromAPI(product_id, waba.access_token);

    const product = await EcommerceProduct.findOne({
      product_external_id: product_id,
      user_id: userId,
      catalog_id: catalog._id,
      deleted_at: null
    });

    if (product) {
      product.deleted_at = new Date();
      await product.save();
    }

    return res.json({
      success: true,
      message: 'Product deleted successfully',
      data: response
    });
  } catch (error) {
    console.error('Error deleting product from catalog:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete product from catalog',
      message: error.response?.data.error.error_user_msg || error.message,
      details: error.response?.data || error.message
    });
  }
};


export const updateProductInCatalog = async (req, res) => {
  try {
    const userId = req.user.id;
    const { product_id, catalog_id } = req.params;
    const productData = req.body;

    const catalog = await EcommerceCatalog.findOne({
      _id: catalog_id,
      user_id: userId,
      deleted_at: null
    });

    if (!catalog) {
      return res.status(404).json({
        success: false,
        error: 'Catalog not found or does not belong to user'
      });
    }

    const waba = await WhatsappWaba.findById(catalog.waba_id);

    if (!waba) {
      return res.status(404).json({
        success: false,
        error: 'WABA not found'
      });
    }

    const response = await updateProductInCatalogFromAPI(product_id, productData, waba.access_token);

    const product = await EcommerceProduct.findOne({
      product_external_id: product_id,
      user_id: userId,
      catalog_id: catalog._id,
      deleted_at: null
    });

    if (product) {
      if (productData.name) product.name = productData.name;
      if (productData.description) product.description = productData.description;
      if (productData.price) product.price = parseFloat(productData.price);
      if (productData.currency) product.currency = productData.currency;
      if (productData.availability) product.availability = productData.availability;
      if (productData.condition) product.condition = productData.condition;
      if (productData.image_urls) product.image_urls = Array.isArray(productData.image_urls) ? productData.image_urls : [productData.image_urls].filter(Boolean);
      if (productData.url) product.url = productData.url;
      if (productData.category) product.category = productData.category;
      if (productData.brand) product.brand = productData.brand;
      if (productData.retailer_id) product.retailer_id = productData.retailer_id;
      if (productData.additional_variant_attributes) product.additional_variant_attributes = productData.additional_variant_attributes;

      await product.save();
    }

    return res.json({
      success: true,
      message: 'Product updated successfully',
      data: response
    });
  } catch (error) {
    console.error('Error updating product in catalog:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update product in catalog',
      message: error.response?.data.error.error_user_msg || error.message,
      details: error.response?.data || error.message
    });
  }
};

export default {
  getWABACatalogs,
  syncWABACatalogs,
  linkCatalogToWABA,
  getLinkedCatalogs,
  getProductsFromCatalog,
  createProductInCatalog,
  getUserCatalogs,
  getUserProducts,
  deleteProductFromCatalog,
  updateProductInCatalog
};
