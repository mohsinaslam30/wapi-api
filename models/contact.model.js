import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
  phone_number: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  source: {
    type: String,
    enum: ['whatsapp', 'baileys'],
    default: 'whatsapp'
  },
  assigned_to: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  tags: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tag',
    trim: true
  }],

  email: {
    type: String,
    trim: true,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'lead', 'customer', 'prospect'],
    default: 'lead'
  },
  type: {
    type: String,
    enum: ['lead', 'customer', 'prospect'],
    default: 'lead'
  },
  is_pinned: {
    type: Boolean,
    default: false
  },

  custom_fields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  },

  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },

  last_incoming_message_at: {
    type: Date,
    default: null
  },
  last_outgoing_message_at: {
    type: Date,
    default: null
  },
  assigned_call_agent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WhatsappCallAgent',
    default: null
  },
  call_permission_status: {
    type: String,
    enum: ['unknown', 'granted', 'denied', 'pending'],
    default: 'unknown'
  },
  call_permission_type: {
    type: String,
    enum: ['permanent', 'temporary', null],
    default: null
  },
  call_permission_updated_at: {
    type: Date,
    default: null
  },
  last_outbound_call_at: {
    type: Date,
    default: null
  },
  outbound_call_count: {
    type: Number,
    default: 0
  },
  chat_status: {
    type: String,
    enum: ['open', 'resolved'],
    default: 'open',
    index: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'contacts'
});

contactSchema.index({ phone_number: 1, user_id: 1 }, { unique: true });
contactSchema.index({ user_id: 1 });
contactSchema.index({ created_by: 1 });
contactSchema.index({ assigned_to: 1 });
contactSchema.index({ tags: 1 });
contactSchema.index({ status: 1 });
contactSchema.index({ type: 1 });
contactSchema.index({ deleted_at: 1 });
contactSchema.index({ is_pinned: 1 });

contactSchema.methods.softDelete = function () {
  this.deleted_at = new Date();
  return this.save();
};

contactSchema.methods.restore = function () {
  this.deleted_at = null;
  return this.save();
};

contactSchema.virtual('is_deleted').get(function () {
  return this.deleted_at !== null;
});

contactSchema.query.active = function () {
  return this.where({ deleted_at: null });
};

contactSchema.query.forUser = function (userId) {
  return this.where({ user_id: userId, deleted_at: null });
};

contactSchema.statics.forUser = function (userId) {
  return this.find({ user_id: userId, deleted_at: null });
};

export default mongoose.model('Contact', contactSchema);
