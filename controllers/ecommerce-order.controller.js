import { EcommerceOrder, EcommerceOrderStatusTemplate, EcommerceProduct, WhatsappPhoneNumber, PaymentTransaction } from '../models/index.js';
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
  }).populate('approved_template_id').lean();
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

    const orderIds = orders.map(order => order._id);
    const transactions = await PaymentTransaction.find({
      context: 'catalog',
      context_id: { $in: orderIds }
    }).select('context_id status payment_link').lean();

    const transactionMap = {};
    transactions.forEach(t => {
      transactionMap[String(t.context_id)] = t;
    });


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
      const transaction = transactionMap[String(order._id)];
      let paa = {
        ...order,
        items,
        payment_link_sent: !!transaction,
        payment_link: transaction?.payment_link || null
      };
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

    const transaction = await PaymentTransaction.findOne({
      context: 'catalog',
      context_id: order._id
    }).select('status payment_link').lean();

    const orderWithProductDetails = {
      ...order.toObject(),
      items: itemsWithProductDetails,
      payment_link_sent: !!transaction,
      payment_link: transaction?.payment_link || null
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


export const sendOrderStatusNotification = async (order, status) => {
  try {
    const userId = order.user_id;
    const contactPhone = order.contact_id?.phone_number;
    if (!contactPhone) return null;

    const tmplDoc = await getStatusTemplateForUser(userId, status);
    const itemsSummary = formatItemsSummary(order.items);

    const placeholderValues = {
      status: status,
      wa_order_id: order.wa_order_id || 'N/A',
      order_id: order._id?.toString(),
      total_price: (order.total_price || 0).toFixed(2),
      currency: order.currency || 'INR',
      customer_name: order?.contact_id?.name || 'Guest',
      customer_phone: contactPhone || 'N/A',
      items_count: Array.isArray(order.items) ? order.items.length : 0,
      items_summary: itemsSummary || 'N/A'
    };

    let whatsappPhoneNumber = await WhatsappPhoneNumber.findById(order.phone_no_id)
      .populate('waba_id')
      .lean();

    let sendRes;
    if (tmplDoc?.use_approved_template && tmplDoc?.approved_template_id) {
      const templateDoc = tmplDoc.approved_template_id;
      const templateVariables = {};
      if (tmplDoc.variable_mappings) {
        for (const [key, placeholderKey] of Object.entries(tmplDoc.variable_mappings)) {
          templateVariables[key] = placeholderValues[placeholderKey] !== undefined ? placeholderValues[placeholderKey] : placeholderKey;
        }
      }

      sendRes = await UnifiedWhatsAppService.sendMessage(userId, {
        whatsappPhoneNumber: whatsappPhoneNumber,
        recipientNumber: contactPhone,
        messageType: 'template',
        templateName: templateDoc.template_name,
        languageCode: templateDoc.language || 'en_US',
        templateVariables
      });
    } else {
      const messageText = tmplDoc?.message_template
        ? renderTemplate(tmplDoc.message_template, placeholderValues)
        : `Your order ${order.wa_order_id || order._id.toString()} status is now: ${status}`;

      sendRes = await UnifiedWhatsAppService.sendMessage(userId, {
        whatsappPhoneNumber: whatsappPhoneNumber,
        recipientNumber: contactPhone,
        messageText,
        messageType: 'text'
      });
    }
    return sendRes;
  } catch (err) {
    console.error('Error sending order status notification:', err);
    throw err;
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

    if (status === 'confirmed') {
      try {
        const { default: UserSetting } = await import('../models/user-setting.model.js');
        const settings = await UserSetting.findOne({ user_id: userId }).lean();
        if (settings?.catalog_payment_link_enabled && settings?.catalog_payment_link_automatic) {
          console.log("calleeddd paymentlink")
          const { default: paymentLinkService } = await import('../services/payment-link.service.js');
          const itemsSummary = formatItemsSummary(order.items);
          const description = itemsSummary ? `Order items: ${itemsSummary}` : `Order ${order.wa_order_id || order._id}`;
          await paymentLinkService.sendPaymentLink({
            context: 'catalog',
            context_id: order._id,
            user_id: userId,
            contact_id: order.contact_id._id || order.contact_id,
            gateway_config_id: settings.catalog_payment_link_gateway || undefined,
            amount: Math.round((order.total_price || 0) * 100),
            currency: order.currency || 'INR',
            description,
            whatsapp_phone_number_id: order.phone_no_id
          });
          console.log(`[Order Status Update] Automatically sent payment link for confirmed order: ${order._id}`);
        }
      } catch (paymentLinkErr) {
        console.error('Error automatically sending payment link on order status confirm:', paymentLinkErr);
      }
    }

    let notification = {
      attempted: false,
      sent: false,
      wa_message_id: null,
      error: null
    };

    const contactPhone = order?.contact_id?.phone_number;
    if (contactPhone) {
      notification.attempted = true;
      try {
        const sendRes = await sendOrderStatusNotification(order, status);
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
    const {
      message_template,
      is_active,
      use_approved_template,
      approved_template_id,
      variable_mappings
    } = req.body || {};

    if (!status || !ECOMMERCE_ORDER_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Allowed: ${ECOMMERCE_ORDER_STATUSES.join(', ')}`
      });
    }

    if (use_approved_template) {
      if (!approved_template_id) {
        return res.status(400).json({
          success: false,
          error: 'approved_template_id is required when using an approved template'
        });
      }
    } else {
      if (!message_template || typeof message_template !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'message_template is required'
        });
      }
    }

    const doc = await EcommerceOrderStatusTemplate.findOneAndUpdate(
      { user_id: userId, status, deleted_at: null },
      {
        $set: {
          message_template: message_template || '',
          use_approved_template: !!use_approved_template,
          approved_template_id: approved_template_id || null,
          variable_mappings: variable_mappings || {},
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
      .populate('approved_template_id')
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

export const sendOrderPaymentLink = async (req, res) => {
  try {
    const userId = req.user.id;
    const { order_id } = req.params;

    const order = await EcommerceOrder.findOne({
      _id: order_id,
      user_id: userId,
      deleted_at: null
    }).populate('contact_id');

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }

    const { default: UserSetting } = await import('../models/user-setting.model.js');
    const settings = await UserSetting.findOne({ user_id: userId }).lean();

    if (!settings?.catalog_payment_link_enabled) {
      return res.status(400).json({
        success: false,
        error: 'Payment link feature is not enabled for catalogs. Please enable it in Settings.'
      });
    }

    const { default: paymentLinkService } = await import('../services/payment-link.service.js');

    const itemsSummary = formatItemsSummary(order.items);
    const description = itemsSummary ? `Order items: ${itemsSummary}` : `Order ${order.wa_order_id || order._id}`;

    const result = await paymentLinkService.sendPaymentLink({
      context: 'catalog',
      context_id: order._id,
      user_id: userId,
      contact_id: order.contact_id._id || order.contact_id,
      gateway_config_id: settings.catalog_payment_link_gateway || undefined,
      amount: Math.round((order.total_price || 0) * 100),
      currency: order.currency || 'INR',
      description,
      whatsapp_phone_number_id: order.phone_no_id
    });

    return res.json({
      success: true,
      message: 'Payment link sent successfully',
      data: result
    });
  } catch (error) {
    console.error('Error sending order payment link:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send payment link',
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
  bulkDeleteOrders,
  sendOrderPaymentLink
};
