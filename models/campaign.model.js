import mongoose from 'mongoose';

const CampaignStatsSchema = new mongoose.Schema({
  total_recipients: {
    type: Number,
    default: 0
  },
  sent_count: {
    type: Number,
    default: 0
  },
  delivered_count: {
    type: Number,
    default: 0
  },
  read_count: {
    type: Number,
    default: 0
  },
  failed_count: {
    type: Number,
    default: 0
  },
  pending_count: {
    type: Number,
    default: 0
  }
}, { _id: false });

const RecipientSchema = new mongoose.Schema({
  contact_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    required: true
  },
  phone_number: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'read', 'failed'],
    default: 'pending'
  },
  sent_at: {
    type: Date,
    default: null
  },
  delivered_at: {
    type: Date,
    default: null
  },
  read_at: {
    type: Date,
    default: null
  },
  failed_at: {
    type: Date,
    default: null
  },
  failure_reason: {
    type: String,
    default: null
  },
  message_id: {
    type: String,
    default: null
  }
}, { _id: false });

const CampaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: ''
  },

  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  waba_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WhatsappWaba',
    required: true
  },

  template_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Template',
    required: true
  },
  template_name: {
    type: String,
    required: true
  },
  language_code: {
    type: String,
    default: 'en_US'
  },

  recipient_type: {
    type: String,
    enum: ['specific_contacts', 'all_contacts', 'tags'],
    required: true
  },
  specific_contacts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact'
  }],
  tag_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tag'
  }],

  variables_mapping: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },

  media_url: {
    type: String,
    default: null
  },

  coupon_code: {
    type: String,
    default: null
  },

  carousel_products: [{
    product_retailer_id: { type: String, required: true },
    catalog_id: { type: String, required: true }
  }],

  carousel_cards_data: [{
    header: {
      type: { type: String, enum: ['image', 'video', 'document'] },
      id: { type: String },
      link: { type: String }
    },
    buttons: [{
      type: { type: String, enum: ['quick_reply', 'url'] },
      payload: { type: String },
      url_value: { type: String }
    }]
  }],

  offer_expiration_minutes: {
    type: Number,
    default: null
  },

  is_scheduled: {
    type: Boolean,
    default: false
  },
  scheduled_at: {
    type: Date,
    default: null
  },
  sent_at: {
    type: Date,
    default: null
  },
  completed_at: {
    type: Date,
    default: null
  },
  completion_duration_seconds: {
    type: Number,
    default: null
  },

  status: {
    type: String,
    enum: ['draft', 'scheduled', 'sending', 'completed', 'failed', 'cancelled'],
    default: 'draft'
  },

  stats: {
    type: CampaignStatsSchema,
    default: () => ({})
  },

  recipients: [RecipientSchema],

  error_log: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    contact_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contact'
    },
    phone_number: String,
    error: String
  }],

  created_at: {
    type: Date,
    default: Date.now
  },
  updated_at: {
    type: Date,
    default: Date.now
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'campaigns'
});


CampaignSchema.index({ template_id: 1 });
CampaignSchema.index({ status: 1 });
CampaignSchema.index({ scheduled_at: 1 });
CampaignSchema.index({ deleted_at: 1 });

CampaignSchema.virtual('is_active').get(function() {
  return this.deleted_at === null;
});

CampaignSchema.methods.softDelete = function() {
  this.deleted_at = new Date();
  return this.save();
};

CampaignSchema.methods.restore = function() {
  this.deleted_at = null;
  return this.save();
};

CampaignSchema.query.active = function() {
  return this.where({ deleted_at: null });
};

CampaignSchema.query.forUser = function(userId) {
  return this.where({ user_id: userId, deleted_at: null });
};

CampaignSchema.query.scheduledToSend = function() {
  return this.where({
    is_scheduled: true,
    status: 'scheduled',
    scheduled_at: { $lte: new Date() },
    deleted_at: null
  });
};

CampaignSchema.statics.forUser = function(userId) {
  return this.find({ user_id: userId, deleted_at: null });
};

CampaignSchema.statics.getScheduledCampaigns = function() {
  return this.find({
    is_scheduled: true,
    status: 'scheduled',
    scheduled_at: { $lte: new Date() },
    deleted_at: null
  });
};

export default mongoose.model('Campaign', CampaignSchema);
