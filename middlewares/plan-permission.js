import mongoose from 'mongoose';
import {
  Subscription,
  Contact,
  Template,
  Campaign,
  User,
  AutomationFlow,
  CustomField,
  Tag,
  AIModel,
  Setting,
  AiPromptLog,
  Team,
  Role,
  Form,
  WhatsappCallAgent,
  Message,
  MessageBot,
  AppointmentBooking,
  FacebookAdCampaign,
  KanbanFunnel,
  Segment,
  Workspace,
  FacebookLead,
  GoogleAccount,
  QuickReply
} from '../models/index.js';


const COUNT_FEATURES = [
  'contacts',
  'template_bots',
  'message_bots',
  'campaigns',
  'ai_prompts',
  'canned_replies',
  'staff',
  'conversations',
  'bot_flow',
  'broadcast_messages',
  'custom_fields',
  'tags',
  'teams',
  'forms',
  'whatsapp_calling',
  'message_bots',
  'appointment_bookings',
  'facebookAds_campaign',
  'kanban_funnels',
  'segments',
  'workspaces',
  'facebook_lead',
  'google_account',
  'quick_replies'
];

const BOOLEAN_FEATURES = [
  'rest_api',
  'whatsapp_webhook',
  'auto_replies',
  'analytics',
  'priority_support'
];


function getUserId(user) {
  if (!user) return null;
  const id = user._id ?? user.id;
  if (!id) return null;
  return mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : null;
}


export const requireSubscription = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const userId = req.user.owner_id;

  if (req.user.role === 'super_admin') {
    const subscription = await Subscription.findOne({
      user_id: userId,
      deleted_at: null,
      status: { $in: ['active', 'trial'] },
      current_period_end: { $gte: new Date() },
    })
      .populate('plan_id')
      .lean();

    if (subscription && subscription.plan_id) {
      req.subscription = subscription;
      req.plan = subscription.plan_id;
      if (subscription.is_custom && subscription.features) {
        req.plan.features = subscription.features;
      } else if (!subscription.is_custom && subscription.plan_id.features) {
        req.plan.features = subscription.plan_id.features;
      } else if (subscription.features) {
        req.plan.features = subscription.features;
      }
    } else {
      const virtualFeatures = {};
      COUNT_FEATURES.forEach(f => virtualFeatures[f] = Infinity);
      BOOLEAN_FEATURES.forEach(f => virtualFeatures[f] = true);

      req.subscription = null;
      req.plan = {
        name: 'System Administrator',
        is_system: true,
        features: virtualFeatures
      };
    }
    return next();
  }

  const subscription = await Subscription.findOne({
    user_id: userId,
    deleted_at: null,
    status: { $in: ['active', 'trial'] }
  })
    .populate('plan_id')
    .lean();

  if (!subscription || !subscription.plan_id) {
    const adminSettings = await Setting.findOne().select('free_trial_enabled free_trial_days').lean();
    if (adminSettings?.free_trial_enabled && adminSettings?.free_trial_days > 0) {
      const user = await User.findById(userId).select('created_at').lean();
      if (user?.created_at) {
        const daysSinceRegistration = Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24));
        console.log("daysSinceRegistration", daysSinceRegistration)
        if (daysSinceRegistration <= adminSettings.free_trial_days) {
          req.subscription = null;
          req.plan = null;
          req.isFreeTrial = true;
          req.freeTrialDaysRemaining = Math.max(0, adminSettings.free_trial_days - daysSinceRegistration);
          return next();
        }
      }
    }

    return res.status(403).json({
      success: false,
      message: 'Active subscription required. Please subscribe to a plan to access this feature.',
    });
  }

  req.subscription = subscription;
  req.plan = subscription.plan_id;
  if (subscription.is_custom && subscription.features) {
    req.plan.features = subscription.features;
  } else if (!subscription.is_custom && subscription.plan_id.features) {
    req.plan.features = subscription.plan_id.features;
  } else if (subscription.features) {
    req.plan.features = subscription.features;
  }
  next();
};


export const requirePlanFeature = (feature) => {
  if (!BOOLEAN_FEATURES.includes(feature) && !COUNT_FEATURES.includes(feature)) {
    throw new Error(`requirePlanFeature: unknown feature "${feature}"`);
  }

  return (req, res, next) => {
    if (req.user?.role === 'super_admin') return next();
    if (req.isFreeTrial) return next();

    const isEnabledInToggles = req.plan?.enabled_features?.[feature] === true || req.plan?.enabled_features?.[feature] === "true";
    const isEnabledInBooleans = req.plan?.features?.[feature] === true || req.plan?.features?.[feature] === "true";

    if (!isEnabledInToggles && !isEnabledInBooleans) {
      return res.status(403).json({
        success: false,
        message: `Your plan does not include this feature: ${feature.replace(/_/g, ' ')}`,
      });
    }
    next();
  };
};


async function getUsageCount(userId, feature, subscription) {
  const uid = userId instanceof mongoose.Types.ObjectId ? userId : new mongoose.Types.ObjectId(userId);
  const baseQuery = { deleted_at: null };
  const agentRole = await Role.findOne({ name: 'agent' });

  switch (feature) {
    case 'contacts':
      return Contact.countDocuments({ ...baseQuery, created_by: uid });
    case 'template_bots':
      return Template.countDocuments({ user_id: uid });
    case 'bot_flow':
      return AutomationFlow.countDocuments({ ...baseQuery, user_id: uid });
    case 'campaigns':
      return Campaign.countDocuments({ ...baseQuery, user_id: uid });
    case 'ai_prompts':
      return AiPromptLog.countDocuments({ ...baseQuery, user_id: uid });
    case 'staff':
      return User.countDocuments({ created_by: uid, role_id: agentRole?._id, deleted_at: null });
    case 'teams':
      return Team.countDocuments({ ...baseQuery, user_id: uid });
    case 'custom_fields':
      return CustomField.countDocuments({ ...baseQuery, created_by: uid });
    case 'tags':
      return Tag.countDocuments({ ...baseQuery, created_by: uid });
    case 'conversations':
      return Message.countDocuments({ ...baseQuery, user_id: uid });
    case 'forms':
      return Form.countDocuments({ ...baseQuery, user_id: uid });
    case 'whatsapp_calling':
      return WhatsappCallAgent.countDocuments({ ...baseQuery, user_id: uid });
    case 'message_bots':
      return MessageBot.countDocuments({ ...baseQuery, user_id: uid });
    case 'appointment_bookings':
      return AppointmentBooking.countDocuments({ ...baseQuery, user_id: uid });
    case 'facebookAds_campaign':
      return FacebookAdCampaign.countDocuments({ ...baseQuery, user_id: uid });
    case 'kanban_funnels':
      return KanbanFunnel.countDocuments({ deletedAt: null, userId: uid });
    case 'segments':
      return Segment.countDocuments({ ...baseQuery, user_id: uid });
    case 'workspaces':
      return Workspace.countDocuments({ ...baseQuery, user_id: uid });
    case 'facebook_lead':
      return FacebookLead.countDocuments({ ...baseQuery, user_id: uid });
    case 'google_account':
      return GoogleAccount.countDocuments({ ...baseQuery, user_id: uid });
    case 'quick_replies':
      return QuickReply.countDocuments({ ...baseQuery, user_id: uid });
    default:
      return 0;
  }
}


export const checkPlanLimit = (feature) => {
  if (!COUNT_FEATURES.includes(feature)) {
    throw new Error(`checkPlanLimit: unknown count feature "${feature}"`);
  }

  return async (req, res, next) => {

    if (req.user?.role === 'super_admin') return next();
    if (req.isFreeTrial) return next();

    const plan = req.plan;

    if (!plan?.features) {
      return res.status(403).json({
        success: false,
        message: 'Plan information not available',
      });
    }

    const limit = plan.features[feature];
    if (typeof limit !== 'number') {
      return res.status(403).json({
        success: false,
        message: `Plan does not define a limit for: ${feature}`,
      });
    }

    if (limit <= 0) return next();

    const userId = getUserId(req.user);
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const currentCount = await getUsageCount(userId, feature, req.subscription);
    if (currentCount >= limit) {
      const label = feature.replace(/_/g, ' ');
      return res.status(403).json({
        success: false,
        message: `Plan limit reached for ${label}. Your plan allows ${limit}. Upgrade to add more.`,
      });
    }

    next();
  };
};


export const attachSubscriptionIfAny = async (req, res, next) => {
  const userId = getUserId(req.user);
  if (!userId) return next();

  const subscription = await Subscription.findOne({
    user_id: userId,
    deleted_at: null,
    status: { $in: ['active', 'trial'] },
    current_period_end: { $gte: new Date() },
  })
    .populate('plan_id')
    .lean();

  req.subscription = subscription || null;
  req.plan = subscription?.plan_id || null;

  if (subscription && req.plan) {
    if (subscription.is_custom && subscription.features) {
      req.plan.features = subscription.features;
    } else if (!subscription.is_custom && subscription.plan_id.features) {
      req.plan.features = subscription.plan_id.features;
    } else if (subscription.features) {
      req.plan.features = subscription.features;
    }
  }


  if (!subscription && req.user?.role !== 'super_admin') {
    const adminSettings = await Setting.findOne().select('free_trial_enabled free_trial_days').lean();
    if (adminSettings?.free_trial_enabled && adminSettings?.free_trial_days > 0) {
      const user = await User.findById(userId).select('created_at').lean();
      if (user?.created_at) {
        const daysSinceRegistration = Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceRegistration <= adminSettings.free_trial_days) {
          req.isFreeTrial = true;
          req.freeTrialDaysRemaining = Math.max(0, adminSettings.free_trial_days - daysSinceRegistration);
        }
      }
    }
  }
  next();
};
