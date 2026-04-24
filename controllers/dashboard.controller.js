import mongoose from 'mongoose';
import User from '../models/user.model.js';
import Message from '../models/message.model.js';
import Contact from '../models/contact.model.js';
import AutomationFlow from '../models/automation-flow.model.js';
import Template from '../models/template.model.js';
import Campaign from '../models/campaign.model.js';
import Tag from '../models/tag.model.js';
import EcommerceOrder from '../models/ecommerce-order.model.js';
import EcommerceProduct from '../models/ecommerce-product.model.js';
import Role from '../models/role.model.js';

const buildDateRange = (dateRange, startDate, endDate) => {
  if (!dateRange) {
    return null;
  }

  const now = new Date();
  let start;
  let end;

  switch (dateRange) {
    case 'today': {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      break;
    }
    case 'this_week': {
      const day = now.getDay();
      const diffToMonday = (day + 6) % 7;
      start = new Date(now);
      start.setDate(now.getDate() - diffToMonday);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      break;
    }
    case 'this_month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    }
    case 'this_year': {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
      break;
    }
    case 'custom': {
      if (!startDate || !endDate) {
        return null;
      }

      start = new Date(startDate);
      end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return null;
      }

      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    }
    default:
      return null;
  }

  return { start, end };
};

export const getDashboardData = async (req, res) => {
  try {
    const userId = req.user?.owner_id;
    const { dateRange, startDate, endDate } = req.query;
    const range = buildDateRange(dateRange, startDate, endDate);

    const createdAtFilter = range
      ? { created_at: { $gte: range.start, $lte: range.end } }
      : {};

    const [
      totalAgents,
      totalMessagesSent,
      totalMessagesReceived,
      totalConversations,
      totalContacts,
      totalAutomationFlows,
      totalTemplates,
      totalCampaigns,
      totalTags
    ] = await Promise.all([
      Role.findOne({ name: 'agent' }).then(role =>
        User.countDocuments({
          created_by: new mongoose.Types.ObjectId(userId),
          role_id: role?._id,
          deleted_at: null,
          ...createdAtFilter
        })
      ),

      Message.countDocuments({
        user_id: new mongoose.Types.ObjectId(userId),
        direction: 'outbound',
        deleted_at: null,
        ...createdAtFilter
      }),

      Message.countDocuments({
        user_id: new mongoose.Types.ObjectId(userId),
        direction: 'inbound',
        deleted_at: null,
        ...createdAtFilter
      }),

      Message.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(userId),
            contact_id: { $exists: true, $ne: null },
            deleted_at: null,
            ...(range
              ? { created_at: { $gte: range.start, $lte: range.end } }
              : {})
          }
        },
        {
          $group: {
            _id: {
              contact_id: '$contact_id',
              user_id: '$user_id'
            }
          }
        },
        {
          $count: 'conversations'
        }
      ]).then(result => result[0]?.conversations || 0),

      Contact.countDocuments({
        created_by: new mongoose.Types.ObjectId(userId),
        deleted_at: null,
        ...createdAtFilter
      }),

      AutomationFlow.countDocuments({
        user_id: new mongoose.Types.ObjectId(userId),
        deleted_at: null,
        ...createdAtFilter
      }),

      Template.countDocuments({
        user_id: new mongoose.Types.ObjectId(userId),
        ...createdAtFilter
      }),

      Campaign.countDocuments({
        user_id: new mongoose.Types.ObjectId(userId),
        deleted_at: null,
        ...createdAtFilter
      }),

      Tag.countDocuments({
        created_by: new mongoose.Types.ObjectId(userId),
        deleted_at: null,
        ...createdAtFilter
      })
    ]);

    const yearlyContactData = await Contact.aggregate([
      {
        $match: {
          created_by: new mongoose.Types.ObjectId(userId),
          deleted_at: null,
          ...(range
            ? { created_at: { $gte: range.start, $lte: range.end } }
            : {})
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m", date: "$created_at" }
          },
          active: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] }
          },
          inactive: {
            $sum: { $cond: [{ $eq: ["$status", "inactive"] }, 1, 0] }
          },
          lead: {
            $sum: { $cond: [{ $or: [{ $eq: ["$status", "lead"] }] }, 1, 0] }
          },
          customer: {
            $sum: { $cond: [{ $or: [{ $eq: ["$status", "customer"] }, { $eq: ["$type", "customer"] }] }, 1, 0] }
          },
          prospect: {
            $sum: { $cond: [{ $or: [{ $eq: ["$status", "prospect"] }, { $eq: ["$type", "prospect"] }] }, 1, 0] }
          },
          total: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const weeklyMessagesData = await Message.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          deleted_at: null,
          created_at: range
            ? { $gte: range.start, $lte: range.end }
            : {
                $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
              }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$created_at" }
          },
          incoming: {
            $sum: { $cond: [{ $eq: ["$direction", "inbound"] }, 1, 0] }
          },
          outgoing: {
            $sum: { $cond: [{ $eq: ["$direction", "outbound"] }, 1, 0] }
          },
          total: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const campaignStats = await Campaign.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          deleted_at: null,
          ...(range
            ? { created_at: { $gte: range.start, $lte: range.end } }
            : {})
        }
      },
      {
        $group: {
          _id: null,
          total_campaigns: { $sum: 1 },
          total_sent: { $sum: "$stats.sent_count" },
          total_delivered: { $sum: "$stats.delivered_count" },
          total_read: { $sum: "$stats.read_count" }
        }
      }
    ]);

    const campaignData = campaignStats[0] || {
      total_campaigns: 0,
      total_sent: 0,
      total_delivered: 0,
      total_read: 0
    };

    const [
      ordersFromWhatsApp,
      revenueFromWhatsApp,
      topSellingProducts,
      totalProducts
    ] = await Promise.all([
      EcommerceOrder.countDocuments({
        user_id: new mongoose.Types.ObjectId(userId),
        ...(range
          ? { created_at: { $gte: range.start, $lte: range.end } }
          : {})
      }),

      EcommerceOrder.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(userId),
            ...(range
              ? { created_at: { $gte: range.start, $lte: range.end } }
              : {})
          }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$total_price" }
          }
        }
      ]).then(result => result[0]?.totalRevenue || 0),

      EcommerceOrder.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(userId),
            ...(range
              ? { created_at: { $gte: range.start, $lte: range.end } }
              : {})
          }
        },
        {
          $unwind: "$items"
        },
        {
          $group: {
            _id: "$items.name",
            totalQuantity: { $sum: "$items.quantity" },
            totalPrice: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
          }
        },
        {
          $sort: { totalQuantity: -1 }
        },
        {
          $limit: 5
        }
      ]),

      EcommerceProduct.countDocuments({
        user_id: new mongoose.Types.ObjectId(userId),
        deleted_at: null
      })
    ]);

    const [
      totalTemplatesApproved,
      rejectedTemplates,
      mostUsedTemplates
    ] = await Promise.all([
      Template.countDocuments({
        user_id: new mongoose.Types.ObjectId(userId),
        status: 'approved',
        ...createdAtFilter
      }),

      Template.countDocuments({
        user_id: new mongoose.Types.ObjectId(userId),
        status: 'rejected',
        ...createdAtFilter
      }),

      Template.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(userId),
            ...(range
              ? { created_at: { $gte: range.start, $lte: range.end } }
              : {})
          }
        },
        {
          $lookup: {
            from: "campaigns",
            localField: "_id",
            foreignField: "template_id",
            as: "campaignsUsingTemplate"
          }
        },
        {
          $addFields: {
            usageCount: { $size: "$campaignsUsingTemplate" },
            sent: { $sum: "$campaignsUsingTemplate.stats.sent_count" },
            delivered: { $sum: "$campaignsUsingTemplate.stats.delivered_count" },
            read: { $sum: "$campaignsUsingTemplate.stats.read_count" }
          }
        },
        {
          $sort: { usageCount: -1 }
        },
        {
          $limit: 5
        },
        {
          $project: {
            template_name: 1,
            status: 1,
            category: 1,
            usageCount: 1,
            sent: 1,
            delivered: 1,
            read: 1
          }
        }
      ])
    ]);

    const dashboardData = {
      counts: {
        totalAgents,
        totalMessagesSent,
        totalMessagesReceived,
        totalConversations,
        totalContacts,
        totalAutomationFlows,
        totalTemplates,
        totalCampaigns,
        totalTags
      },
      contactYearlyChart: yearlyContactData,
      weeklyMessagesChart: weeklyMessagesData,
      campaignStatistics: {
        totalCampaignsCreated: campaignData.total_campaigns,
        totalSent: campaignData.total_sent,
        messagesDelivered: campaignData.total_delivered,
        messagesRead: campaignData.total_read
      },
      catalogData: {
        ordersFromWhatsApp,
        revenueFromWhatsApp,
        topSellingProducts,
        totalProducts
      },
      templateInsights: {
        totalTemplatesApproved,
        rejectedTemplates,
        mostUsedTemplates
      }
    };

    return res.status(200).json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message
    });
  }
};

export const getDashboardCounts = async (req, res) => {
  try {
    const userId = req.user?.owner_id;
    const { dateRange, startDate, endDate } = req.query;
    const range = buildDateRange(dateRange, startDate, endDate);

    const createdAtFilter = range
      ? { created_at: { $gte: range.start, $lte: range.end } }
      : {};

    const [
      totalAgents,
      totalMessagesSent,
      totalMessagesReceived,
      totalConversations,
      totalContacts,
      totalAutomationFlows,
      totalTemplates,
      totalCampaigns,
      totalTags
    ] = await Promise.all([
      Role.findOne({ name: 'agent' }).then(role =>
        User.countDocuments({
          created_by: new mongoose.Types.ObjectId(userId),
          role_id: role?._id,
          deleted_at: null,
          ...createdAtFilter
        })
      ),
      Message.countDocuments({
        user_id: new mongoose.Types.ObjectId(userId),
        direction: 'outbound',
        deleted_at: null,
        ...createdAtFilter
      }),
      Message.countDocuments({
        user_id: new mongoose.Types.ObjectId(userId),
        direction: 'inbound',
        deleted_at: null,
        ...createdAtFilter
      }),
      Message.aggregate([
        {
          $match: {
            user_id: new mongoose.Types.ObjectId(userId),
            contact_id: { $exists: true, $ne: null },
            deleted_at: null,
            ...(range
              ? { created_at: { $gte: range.start, $lte: range.end } }
              : {})
          }
        },
        {
          $group: {
            _id: {
              contact_id: '$contact_id',
              user_id: '$user_id'
            }
          }
        },
        {
          $count: 'conversations'
        }
      ]).then(result => result[0]?.conversations || 0),
      Contact.countDocuments({
        created_by: new mongoose.Types.ObjectId(userId),
        deleted_at: null,
        ...createdAtFilter
      }),
      AutomationFlow.countDocuments({
        user_id: new mongoose.Types.ObjectId(userId),
        deleted_at: null,
        ...createdAtFilter
      }),
      Template.countDocuments({
        user_id: new mongoose.Types.ObjectId(userId),
        ...createdAtFilter
      }),
      Campaign.countDocuments({
        user_id: new mongoose.Types.ObjectId(userId),
        deleted_at: null,
        ...createdAtFilter
      }),
      Tag.countDocuments({
        created_by: new mongoose.Types.ObjectId(userId),
        deleted_at: null,
        ...createdAtFilter
      })
    ]);

    const counts = {
      totalAgents,
      totalMessagesSent,
      totalMessagesReceived,
      totalConversations,
      totalContacts,
      totalAutomationFlows,
      totalTemplates,
      totalCampaigns,
      totalTags
    };

    return res.status(200).json({
      success: true,
      data: counts
    });

  } catch (error) {
    console.error('Error fetching dashboard counts:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard counts',
      error: error.message
    });
  }
};
