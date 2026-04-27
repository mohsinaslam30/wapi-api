import mongoose from 'mongoose';

const facebookAdCampaignSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    ad_account_id: {
      type: String,
      required: true
    },
    fb_campaign_id: {
      type: String,
      unique: true,
      required: true
    },
    fb_page_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FacebookPage',
      required: false
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    objective: {
      type: String,
      default: 'OUTREACH'
    },
    daily_budget: {
      type: Number,
      default: 0
    },
    lifetime_budget: {
      type: Number,
      default: null
    },
    status: {
      type: String,
      enum: ['active', 'paused', 'archived', 'deleted', 'error'],
      default: 'paused'
    },
    last_synced_at: {
      type: Date,
      default: null
    },
    is_cbo: {
      type: Boolean,
      default: false
    },
    deleted_at: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'facebook_ad_campaigns'
  }
);

facebookAdCampaignSchema.index({ user_id: 1, deleted_at: 1 });
facebookAdCampaignSchema.index({ fb_campaign_id: 1 });

facebookAdCampaignSchema.methods.softDelete = function () {
  this.deleted_at = new Date();
  return this.save();
};

export default mongoose.model('FacebookAdCampaign', facebookAdCampaignSchema);
