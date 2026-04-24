import mongoose from 'mongoose';

const whatsappWabaSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },

  whatsapp_business_account_id: {
    type: String,
    required: false,
    index: true
  },
  business_id: {
    type: String
  },
  app_id: {
    type: String,
    required: false
  },

  access_token: {
    type: String,
    required: false
  },

  name: {
    type: String,
    trim: true
  },

  provider: {
    type: String,
    enum: ['business_api', 'baileys'],
    default: 'business_api'
  },

  instance_name: {
    type: String,
    trim: true
  },

  connection_status: {
    type: String,
    enum: ['initial', 'qrcode', 'connecting', 'connected', 'disconnected', 'qr_timeout'],
    default: 'initial'
  },

  qr_code: {
    type: String
  },

  is_active: {
    type: Boolean,
    default: true
  },

  workspace_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    unique: true,
    sparse: true
  },

  fb_page_id: {
    type: String,
    required: false
  },

  fb_ad_account_id: {
    type: String,
    required: false
  },

  fb_pixel_id: {
    type: String,
    required: false
  },

  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: true,
  collection: 'whatsapp_wabas'
});

export default mongoose.model('WhatsappWaba', whatsappWabaSchema);
