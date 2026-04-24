import { EcommerceOrder, EcommerceOrderStatusTemplate, EcommerceProduct, WhatsappPhoneNumber } from '../models/index.js';
import UnifiedWhatsAppService from '../services/whatsapp/unified-whatsapp.service.js';
import { ECOMMERCE_ORDER_STATUSES } from '../models/ecommerce-order.model.js';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_SORT_FIELD = 'created_at';
const DEFAULT_SORT_ORDER = -1;

const ALLOWED_SORT_FIELDS = [
  '_id',
  'wa_order_id',
  'total_price',
  'status',
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

const formatItemsSummary = (items = []) => {
  if (!Array.isArray(items) || items.length === 0) return '';
  return items
    .map((it) => {
      const label = it?.name || it?.product_retailer_id || 'Item';
      const qty = Number(it?.quantity) || 1;
      return `${label} x${qty}`;
    })
    .join(', ');
};

const renderTemplate = (template, data) => {
  if (!template || typeof template !== 'string') return '';
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    const val = data?.[key];
    if (val === null || val === undefined) return '';
    return String(val);
  });
};

const getStatusTemplateForUser = async (userId, status) => {
  return await EcommerceOrderStatusTemplate.findOne({
    user_id: userId,
    status,
    is_active: true,
    deleted_at: null
  }).lean();
};


export const getUserOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);

    const searchQuery = {};

    if (req.query.contact_id) searchQuery.contact_id = req.query.contact_id;
    if (req.query.wa_order_id) searchQuery.wa_order_id = req.query.wa_order_id;
    if (req.query.currency) searchQuery.currency = req.query.currency;
    if (req.query.status) searchQuery.status = req.query.status;

    if (req.query.start_date || req.query.end_date) {
      searchQuery.created_at = {};
      if (req.query.start_date) searchQuery.created_at.$gte = new Date(req.query.start_date);
      if (req.query.end_date) searchQuery.created_at.$lte = new Date(req.query.end_date);
    }

    const combinedFilter = {
      user_id: userId,
      deleted_at: null,
      ...searchQuery
    };

    const totalCount = await EcommerceOrder.countDocuments(combinedFilter);

    const orders = await EcommerceOrder.find(combinedFilter)
      .select('-raw_payload')
      .populate('contact_id', 'name phone_number email')
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();


    const allRetailerIds = [
      ...new Set(
        orders.flatMap(order =>
          order.items.map(item => String(item.product_retailer_id))
        )
      )
    ];
    const products = await EcommerceProduct.find({
      user_id: userId,
      retailer_id: { $in: allRetailerIds },
      deleted_at: null
    })
    .select('name image_urls price currency retailer_id')
    .lean();
    console.log("allRetailerIds" , allRetailerIds);


    const productMap = {};
    products.forEach(p => {
      productMap[String(p.retailer_id)] = p;
    });


    const ordersWithProductDetails = orders.map(order => {
      const items = order.items.map(item => {
        const product = productMap[String(item.product_retailer_id)];

        let pa = {
          ...item,
          product_details: product
          ? {
            name: product.name,
            image_urls: product.image_urls || []
          }
          : null
        };
        return pa;
      });
      let paa = { ...order, items };
      console.log("products" , paa);
      return paa;
    });

    return res.json({
      success: true,
      data: {
        orders: ordersWithProductDetails,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit
        }
      }
    });

  } catch (error) {
    console.error('Error getting user orders:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user orders',
      details: error.message
    });
  }
};


export const getOrderById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { order_id } = req.params;

    const order = await EcommerceOrder.findOne({
      _id: order_id,
      user_id: userId,
      deleted_at: null
    })
    .select('-raw_payload')
    .populate('contact_id', 'name phone_number email');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    const retailerIds = [...new Set(order.items.map(item => item.product_retailer_id))];

    let itemsWithProductDetails = order.items;

    if (retailerIds.length > 0) {
      const products = await EcommerceProduct.find({
        user_id: userId,
        retailer_id: { $in: retailerIds },
        deleted_at: null
      }).select('name image_urls price currency').lean();

      const productMap = {};
      products.forEach(product => {
        productMap[product.retailer_id] = product;
      });

      itemsWithProductDetails = order.items.map(item => {
        const product = productMap[item.product_retailer_id];
        return {
          ...item,
          product_details: product ? {
            name: product.name,
            image_urls: product.image_urls || [],
            price: product.price,
            currency: product.currency || 'USD'
          } : null
        };
      });
    }

    const orderWithProductDetails = {
      ...order.toObject(),
      items: itemsWithProductDetails
    };

    return res.json({
      success: true,
      data: orderWithProductDetails
    });
  } catch (error) {
    console.error('Error getting order by ID:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get order',
      details: error.message
    });
  }
};


export const getOrdersByMessageId = async (req, res) => {
  try {
    const userId = req.user.id;
    const { message_id } = req.params;

    const orders = await EcommerceOrder.find({
      wa_message_id: message_id,
      user_id: userId,
      deleted_at: null
    })
    .select('-raw_payload')
    .populate('contact_id', 'name phone_number email');

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No orders found for this message'
      });
    }

    const ordersWithProductDetails = await Promise.all(
      orders.map(async (order) => {
        const retailerIds = [...new Set(order.items.map(item => item.product_retailer_id))];

        let itemsWithProductDetails = order.items;

        if (retailerIds.length > 0) {
          const products = await EcommerceProduct.find({
            user_id: userId,
            retailer_id: { $in: retailerIds },
            deleted_at: null
          }).select('name image_urls price currency').lean();

          const productMap = {};
          products.forEach(product => {
            productMap[product.retailer_id] = product;
          });

          itemsWithProductDetails = order.items.map(item => {
            const product = productMap[item.product_retailer_id];
            return {
              ...item,
              product_details: product ? {
                name: product.name,
                image_urls: product.image_urls || [],
                price: product.price,
                currency: product.currency || 'USD'
              } : null
            };
          });
        }

        return {
          ...order.toObject(),
          items: itemsWithProductDetails
        };
      })
    );

    return res.json({
      success: true,
      data: ordersWithProductDetails
    });
  } catch (error) {
    console.error('Error getting orders by message ID:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get orders by message ID',
      details: error.message
    });
  }
};


export const getOrderStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const matchFilter = {
      user_id: userId,
      deleted_at: null
    };

    if (req.query.start_date || req.query.end_date) {
      matchFilter.created_at = {};
      if (req.query.start_date) {
        matchFilter.created_at.$gte = new Date(req.query.start_date);
      }
      if (req.query.end_date) {
        matchFilter.created_at.$lte = new Date(req.query.end_date);
      }
    }

    const stats = await EcommerceOrder.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          total_orders: { $sum: 1 },
          total_revenue: { $sum: "$total_price" },
          avg_order_value: { $avg: "$total_price" },
          orders_with_contact: {
            $sum: { $cond: [{ $ne: ["$contact_id", null] }, 1, 0] }
          }
        }
      },
      {
        $project: {
          _id: 0,
          total_orders: 1,
          total_revenue: 1,
          avg_order_value: 1,
          orders_with_contact: 1
        }
      }
    ]);

    const result = stats[0] || {
      total_orders: 0,
      total_revenue: 0,
      avg_order_value: 0,
      orders_with_contact: 0
    };

    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting order stats:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get order statistics',
      details: error.message
    });
  }
};


export const updateOrderStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const { order_id } = req.params;
    const { status } = req.body || {};

    if (!status || !ECOMMERCE_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Allowed: ${ECOMMERCE_ORDER_STATUSES.join(', ')}`
      });
    }

    const order = await EcommerceOrder.findOne({
      _id: order_id,
      user_id: userId,
      deleted_at: null
    }).populate('contact_id', 'name phone_number email');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    order.status = status;
    await order.save();

    let notification = {
      attempted: false,
      sent: false,
      wa_message_id: null,
      error: null
    };

    const contactPhone = order?.contact_id?.phone_number;
    if (contactPhone) {
      notification.attempted = true;

      const tmplDoc = await getStatusTemplateForUser(userId, status);
      const itemsSummary = formatItemsSummary(order.items);

      const messageText = tmplDoc?.message_template
        ? renderTemplate(tmplDoc.message_template, {
            status: order.status,
            wa_order_id: order.wa_order_id,
            order_id: order._id?.toString(),
            total_price: order.total_price,
            currency: order.currency,
            customer_name: order?.contact_id?.name,
            customer_phone: contactPhone,
            items_count: Array.isArray(order.items) ? order.items.length : 0,
            items_summary: itemsSummary
          })
        : `Your order ${order.wa_order_id || order._id.toString()} status is now: ${order.status}`;

      try {
        let whatsappPhoneNumber = await WhatsappPhoneNumber.findById(order.phone_no_id)
          .populate('waba_id')
          .lean();

        const sendRes = await UnifiedWhatsAppService.sendMessage(userId, {
          whatsappPhoneNumber: whatsappPhoneNumber,
          recipientNumber: contactPhone,
          messageText,
          messageType: 'text'
        });
        notification.sent = true;
        notification.wa_message_id = sendRes?.waMessageId || null;
      } catch (sendErr) {
        notification.error = sendErr?.message || 'Failed to send WhatsApp notification';
      }
    }

    return res.json({
      success: true,
      data: {
        order: order.toObject(),
        notification
      }
    });
  } catch (error) {
    console.error('Error updating order status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update order status',
      details: error.message
    });
  }
};


export const upsertOrderStatusTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status } = req.params;
    const { message_template, is_active } = req.body || {};

    if (!status || !ECOMMERCE_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Allowed: ${ECOMMERCE_ORDER_STATUSES.join(', ')}`
      });
    }

    if (!message_template || typeof message_template !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'message_template is required'
      });
    }

    const doc = await EcommerceOrderStatusTemplate.findOneAndUpdate(
      { user_id: userId, status, deleted_at: null },
      {
        $set: {
          message_template,
          ...(is_active !== undefined ? { is_active: !!is_active } : {})
        }
      },
      { returnDocument: 'after', upsert: true }
    ).lean();

    return res.json({
      success: true,
      data: {
        template: doc,
        placeholders: [
          'status',
          'wa_order_id',
          'order_id',
          'total_price',
          'currency',
          'customer_name',
          'customer_phone',
          'items_count',
          'items_summary'
        ]
      }
    });
  } catch (error) {
    console.error('Error upserting order status template:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to save status template',
      details: error.message
    });
  }
};


export const getOrderStatusTemplates = async (req, res) => {
  try {
    const userId = req.user.id;

    const filter = {
      user_id: userId,
      deleted_at: null
    };

    if (req.query.status) {
      filter.status = req.query.status;
    }

    const templates = await EcommerceOrderStatusTemplate.find(filter)
      .sort({ updated_at: -1 })
      .lean();

    return res.json({
      success: true,
      data: templates
    });
  } catch (error) {
    console.error('Error getting order status templates:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get status templates',
      details: error.message
    });
  }
};

export const bulkDeleteOrders = async (req, res) => {
  try {
    const userId = req.user.id;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please provide an array of order IDs'
      });
    }

    const orders = await EcommerceOrder.find({
      _id: { $in: ids },
      user_id: userId
    }).select('_id');

    const foundIds = orders.map(o => o._id.toString());
    const notFoundIds = ids.filter(
      id => !foundIds.includes(id.toString())
    );

    const result = await EcommerceOrder.updateMany({
      _id: { $in: foundIds }
    }, {
      $set: { deleted_at: new Date() }
    });

    const response = {
      success: true,
      data: {
        deletedCount: result.modifiedCount,
        deletedIds: foundIds
      }
    };

    if (notFoundIds.length > 0) {
      response.data.notFoundIds = notFoundIds;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error bulk deleting orders:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to bulk delete orders',
      details: error.message
    });
  }
};

export default {
  getUserOrders,
  getOrderById,
  getOrdersByMessageId,
  getOrderStats,
  updateOrderStatus,
  upsertOrderStatusTemplate,
  getOrderStatusTemplates,
  bulkDeleteOrders
};
