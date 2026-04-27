import mongoose from 'mongoose';

const facebookAdSetSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    campaign_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FacebookAdCampaign', 
      required: true
    },
    fb_adset_id: {
      type: String,
      unique: true,
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'archived', 'deleted', 'error'],
      default: 'paused'
    },
    daily_budget: {
      type: Number,
      default: 0
    },
    lifetime_budget: {
      type: Number,
      default: null
    },
    targeting: {
      type: Object,
      default: {}
    },
    start_time: {
      type: Date,
      default: null
    },
    end_time: {
      type: Date,
      default: null
    },
    last_synced_at: {
      type: Date,
      default: null
    },
    deleted_at: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'facebook_ad_sets'
  }
);

facebookAdSetSchema.index({ user_id: 1, deleted_at: 1 });
facebookAdSetSchema.index({ fb_adset_id: 1 });

export default mongoose.model('FacebookAdSet', facebookAdSetSchema);
