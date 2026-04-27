import mongoose from 'mongoose';
import User from '../models/user.model.js';
import Subscription from '../models/subscription.model.js';
import Plan from '../models/plan.model.js';
import { PaymentHistory } from '../models/payment-history.model.js';
import AIModel from '../models/ai-model.model.js';
import ContactInquiry from '../models/contact-inquiries.model.js';
import { Setting, Role } from '../models/index.js';
import { getExchangeRate, formatAmount } from '../utils/currency.service.js';

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

export const getAdminDashboardData = async (req, res) => {
  try {
    const { dateRange, startDate, endDate } = req.query;
    const range = buildDateRange(dateRange, startDate, endDate);

    const role = await Role.findOne({ name: 'user' });

    const [
      totalUsers,
      activeSubscriptions,
      totalPlans,
      activeAIModels,
      totalContactInquiries
    ] = await Promise.all([
      User.countDocuments({
        deleted_at: null,
        role_id: { $eq: role._id },
        ...(range
          ? { created_at: { $gte: range.start, $lte: range.end } }
          : {})
      }),

      Subscription.countDocuments({
        deleted_at: null,
        status: { $in: ['active', 'trial'] },
        ...(range
          ? { created_at: { $gte: range.start, $lte: range.end } }
          : {})
      }),

      Plan.countDocuments({
        deleted_at: null,
        is_active: true,
        ...(range
          ? { created_at: { $gte: range.start, $lte: range.end } }
          : {})
      }),

      AIModel.countDocuments({
        deleted_at: null,
        status: 'active',
        ...(range
          ? { created_at: { $gte: range.start, $lte: range.end } }
          : {})
      }),

      ContactInquiry.countDocuments(
        range
          ? { created_at: { $gte: range.start, $lte: range.end } }
          : {}
      )
    ]);

    const setting = await Setting.findOne().populate('default_currency').lean();
    const defaultCurrencyCode = setting?.default_currency?.code || 'INR';

    const revenueData = await getRevenueData(defaultCurrencyCode);

    const chartsData = await getChartsData(range, defaultCurrencyCode);

    const tablesData = await getTablesData(range, defaultCurrencyCode);

    const dashboardData = {
      counts: {
        totalUsers,
        activeSubscriptions,
        totalPlans,
        revenue: revenueData,
        activeAIModels,
        totalContactInquiries
      },
      charts: chartsData,
      tables: tablesData
    };

    return res.status(200).json({
      success: true,
      data: dashboardData
    });

  } catch (error) {
    console.error('Error fetching admin dashboard data:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch admin dashboard data',
      error: error.message
    });
  }
};

const getRevenueData = async (defaultCurrencyCode = 'INR') => {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);

  const [
    todayRevenue,
    monthRevenue,
    totalRevenue
  ] = await Promise.all([
    PaymentHistory.aggregate([
      {
        $match: {
          deleted_at: null,
          payment_status: 'success',
          paid_at: { $gte: startOfDay, $lte: endOfDay }
        }
      },
      {
        $group: {
          _id: '$currency',
          total: { $sum: '$amount' }
        }
      }
    ]),

    PaymentHistory.aggregate([
      {
        $match: {
          deleted_at: null,
          payment_status: 'success',
          paid_at: { $gte: startOfMonth, $lte: endOfMonth }
        }
      },
      {
        $group: {
          _id: '$currency',
          total: { $sum: '$amount' }
        }
      }
    ]),

    PaymentHistory.aggregate([
      {
        $match: {
          deleted_at: null,
          payment_status: 'success'
        }
      },
      {
        $group: {
          _id: '$currency',
          total: { $sum: '$amount' }
        }
      }
    ])
  ]);

  const calculateTotal = async (results) => {
    let total = 0;
    for (const row of results) {
      const curr = row._id || 'INR';
      const rate = await getExchangeRate(curr, defaultCurrencyCode);
      total += row.total * rate;
    }
    return formatAmount(total);
  };

  return {
    today: await calculateTotal(todayRevenue),
    month: await calculateTotal(monthRevenue),
    total: await calculateTotal(totalRevenue)
  };
};

const getChartsData = async (range, defaultCurrencyCode = 'INR') => {
  const planMatch = {
    deleted_at: null,
    payment_status: 'success',
    ...(range
      ? { paid_at: { $gte: range.start, $lte: range.end } }
      : {})
  };

  const planRevenueBreakdownRaw = await PaymentHistory.aggregate([
    {
      $match: planMatch
    },
    {
      $lookup: {
        from: 'plans',
        localField: 'plan_id',
        foreignField: '_id',
        as: 'plan'
      }
    },
    {
      $unwind: '$plan'
    },
    {
      $group: {
        _id: { planName: '$plan.name', currency: '$currency' },
        totalRevenue: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    }
  ]);

  const planMap = {};
  for (const row of planRevenueBreakdownRaw) {
    const planName = row._id.planName;
    const curr = row._id.currency || 'INR';
    const rate = await getExchangeRate(curr, defaultCurrencyCode);

    if (!planMap[planName]) {
      planMap[planName] = { _id: planName, totalRevenue: 0, count: 0 };
    }
    planMap[planName].totalRevenue = formatAmount(planMap[planName].totalRevenue + (row.totalRevenue * rate));
    planMap[planName].count += row.count;
  }

  const planRevenueBreakdown = Object.values(planMap).sort((a, b) => b.totalRevenue - a.totalRevenue);

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 11);
  twelveMonthsAgo.setHours(0, 0, 0, 0);

  let revenueGraphPaidAtFilter;

  if (range) {
    const start = new Date(
      Math.max(twelveMonthsAgo.getTime(), range.start.getTime())
    );
    revenueGraphPaidAtFilter = {
      $gte: start,
      $lte: range.end
    };
  } else {
    revenueGraphPaidAtFilter = {
      $gte: twelveMonthsAgo
    };
  }

  const revenueGraphDataRaw = await PaymentHistory.aggregate([
    {
      $match: {
        deleted_at: null,
        payment_status: 'success',
        paid_at: revenueGraphPaidAtFilter
      }
    },
    {
      $group: {
        _id: {
          month: { $dateToString: { format: "%Y-%m", date: "$paid_at" } },
          currency: "$currency"
        },
        totalRevenue: { $sum: "$amount" },
        transactionCount: { $sum: 1 }
      }
    }
  ]);

  const graphMap = {};
  for (const row of revenueGraphDataRaw) {
    const month = row._id.month;
    const curr = row._id.currency || 'INR';
    const rate = await getExchangeRate(curr, defaultCurrencyCode);

    if (!graphMap[month]) {
      graphMap[month] = { _id: month, totalRevenue: 0, transactionCount: 0 };
    }
    graphMap[month].totalRevenue = formatAmount(graphMap[month].totalRevenue + (row.totalRevenue * rate));
    graphMap[month].transactionCount += row.transactionCount;
  }

  const revenueGraphData = Object.values(graphMap).sort((a, b) => a._id.localeCompare(b._id));

  return {
    planRevenueBreakdown,
    revenueGraph: revenueGraphData
  };
};

const getTablesData = async (range, defaultCurrencyCode = 'INR') => {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const adminRole = await Role.findOne({ name: 'super_admin' });
  const newUsersMatch = {
    deleted_at: null,
    role_id: { $ne: adminRole?._id },
    created_at: range
      ? { $gte: range.start, $lte: range.end }
      : { $gte: thirtyDaysAgo }
  };

  const newUsers = await User.aggregate([
    {
      $match: newUsersMatch
    },
    {
      $lookup: {
        from: 'subscriptions',
        localField: '_id',
        foreignField: 'user_id',
        as: 'subscription'
      }
    },
    {
      $unwind: {
        path: '$subscription',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $lookup: {
        from: 'plans',
        localField: 'subscription.plan_id',
        foreignField: '_id',
        as: 'plan'
      }
    },
    {
      $unwind: {
        path: '$plan',
        preserveNullAndEmptyArrays: true
      }
    },
    {
      $project: {
        _id: 1,
        name: 1,
        email: 1,
        phone: 1,
        country: 1,
        created_at: 1,
        planName: { $ifNull: ['$plan.name', 'No Plan'] },
        subscriptionStatus: { $ifNull: ['$subscription.status', 'No Subscription'] }
      }
    },
    {
      $sort: { created_at: -1 }
    },
    {
      $limit: 50
    }
  ]);

  const newSubscriptionsMatch = {
    deleted_at: null,
    created_at: range
      ? { $gte: range.start, $lte: range.end }
      : { $gte: thirtyDaysAgo }
  };

  const newSubscriptions = await Subscription.aggregate([
    {
      $match: newSubscriptionsMatch
    },
    {
      $lookup: {
        from: 'users',
        localField: 'user_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: '$user'
    },
    {
      $lookup: {
        from: 'plans',
        localField: 'plan_id',
        foreignField: '_id',
        as: 'plan'
      }
    },
    {
      $unwind: '$plan'
    },
    {
      $project: {
        _id: 1,
        userId: '$user_id',
        userName: '$user.name',
        userEmail: '$user.email',
        planName: '$plan.name',
        planPrice: '$plan.price',
        status: 1,
        amount_paid: 1,
        payment_status: 1,
        created_at: 1,
        current_period_end: 1,
        subscriptionCurrency: '$currency'
      }
    },
    {
      $sort: { created_at: -1 }
    },
    {
      $limit: 50
    }
  ]);

  for (let sub of newSubscriptions) {
    const rate = await getExchangeRate(sub.subscriptionCurrency || 'INR', defaultCurrencyCode);
    if (sub.amount_paid) sub.amount_paid = formatAmount(sub.amount_paid * rate);
    if (sub.planPrice) sub.planPrice = formatAmount(sub.planPrice * rate);
    sub.currency = defaultCurrencyCode;
  }

  const cancelledSubscriptionsMatch = {
    deleted_at: null,
    status: 'cancelled',
    cancelled_at: range
      ? { $gte: range.start, $lte: range.end }
      : { $gte: thirtyDaysAgo }
  };

  const cancelledSubscriptions = await Subscription.aggregate([
    {
      $match: cancelledSubscriptionsMatch
    },
    {
      $lookup: {
        from: 'users',
        localField: 'user_id',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $unwind: '$user'
    },
    {
      $lookup: {
        from: 'plans',
        localField: 'plan_id',
        foreignField: '_id',
        as: 'plan'
      }
    },
    {
      $unwind: '$plan'
    },
    {
      $project: {
        _id: 1,
        userId: '$user_id',
        userName: '$user.name',
        userEmail: '$user.email',
        planName: '$plan.name',
        cancelled_at: 1,
        notes: 1,
        subscriptionCurrency: '$currency',
        amount_paid: 1,
        planPrice: '$plan.price'
      }
    },
    {
      $sort: { cancelled_at: -1 }
    },
    {
      $limit: 50
    }
  ]);

  for (let sub of cancelledSubscriptions) {
    const rate = await getExchangeRate(sub.subscriptionCurrency || 'INR', defaultCurrencyCode);
    if (sub.amount_paid) sub.amount_paid = formatAmount(sub.amount_paid * rate);
    if (sub.planPrice) sub.planPrice = formatAmount(sub.planPrice * rate);
    sub.currency = defaultCurrencyCode;
  }

  const recentInquiriesMatch = range
    ? { created_at: { $gte: range.start, $lte: range.end } }
    : { created_at: { $gte: thirtyDaysAgo } };

  const recentInquiries = await ContactInquiry.aggregate([
    {
      $match: recentInquiriesMatch
    },
    {
      $project: {
        _id: 1,
        name: 1,
        email: 1,
        subject: 1,
        message: 1,
        created_at: 1
      }
    },
    {
      $sort: { created_at: -1 }
    },
    {
      $limit: 50
    }
  ]);

  return {
    newUsers,
    newSubscriptions,
    cancelledSubscriptions,
    recentInquiries
  };
};

export const getAdminDashboardCounts = async (req, res) => {
  try {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Admin access required'
      });
    }

    const adminRole = await Role.findOne({ name: 'super_admin' });

    const [
      totalUsers,
      activeSubscriptions,
      totalPlans,
      activeAIModels,
      totalContactInquiries
    ] = await Promise.all([
      User.countDocuments({
        deleted_at: null,
        role_id: { $ne: adminRole?._id }
      }),
      Subscription.countDocuments({
        deleted_at: null,
        status: { $in: ['active', 'trial'] }
      }),
      Plan.countDocuments({
        deleted_at: null,
        is_active: true
      }),
      AIModel.countDocuments({
        deleted_at: null,
        status: 'active'
      }),
      ContactInquiry.countDocuments({})
    ]);

    const setting = await Setting.findOne().populate('default_currency').lean();
    const defaultCurrencyCode = setting?.default_currency?.code || 'INR';

    const revenueData = await getRevenueData(defaultCurrencyCode);

    const counts = {
      totalUsers,
      activeSubscriptions,
      totalPlans,
      revenue: revenueData,
      activeAIModels,
      totalContactInquiries
    };

    return res.status(200).json({
      success: true,
      data: counts
    });

  } catch (error) {
    console.error('Error fetching admin dashboard counts:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch admin dashboard counts',
      error: error.message
    });
  }
};
