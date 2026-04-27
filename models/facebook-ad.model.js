import mongoose from 'mongoose';

const facebookAdSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    ad_set_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FacebookAdSet', 
      required: true
    },
    fb_ad_id: {
      type: String,
      unique: true,
      required: true
    },
    fb_creative_id: {
      type: String,
      default: null
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
    creative_type: {
      type: String,
      enum: ['IMAGE', 'VIDEO', 'CAROUSEL'],
      default: 'IMAGE'
    },
    local_media: {
      image: { type: String, default: null },
      video: { type: String, default: null },
      carousel: { type: [mongoose.Schema.Types.Mixed], default: [] }
    },
    headline: {
      type: String,
      default: ''
    },
    ad_message: {
      type: String,
      required: false
    },
    whatsapp_phone_number_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WhatsappPhoneNumber',
      default: null
    },
    automation_trigger: {
      type_name: {
        type: String,
        enum: ['workflow', 'reply_material', 'none'],
        default: 'none'
      },
      id: {
        type: mongoose.Schema.Types.ObjectId,
        default: null
      }
    },
    welcome_experience: {
      text: { type: String, default: '' },
      type: { type: String, enum: ['prefilled', 'faq', 'none'], default: 'none' },
      prefilled_text: { type: String, default: '' },
      questions: [{
        question: { type: String },
        automated_response: { type: String }
      }]
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
    collection: 'facebook_ads'
  }
);

facebookAdSchema.index({ user_id: 1, deleted_at: 1 });
facebookAdSchema.index({ fb_ad_id: 1 });

export default mongoose.model('FacebookAd', facebookAdSchema);
