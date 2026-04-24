import mongoose from 'mongoose';

const settingSchema = new mongoose.Schema({
  app_name: {
    type: String,
    default: 'Wapi'
  },
  app_description: {
    type: String,
    default: 'Whatsapp Marketing Platform'
  },
  app_email: {
    type: String,
    required: true,
    validate: {
      validator: function (v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Please enter a valid email address'
    },
    default: 'support@example.com'
  },
  support_email: {
    type: String,
    required: true,
    validate: {
      validator: function (v) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Please enter a valid email address'
    },
    default: 'support@example.com'
  },
  favicon_url: {
    type: String,
    default: '/uploads\attachments\favicon.png'
  },
  logo_light_url: {
    type: String,
    default: '/uploads\attachments\logo_light.png'
  },
  logo_dark_url: {
    type: String,
    default: '/uploads\attachments\logo_dark.png'
  },
  sidebar_light_logo_url: {
    type: String,
    default: '/uploads\attachments\sidebar_light_logo.png'
  },
  sidebar_dark_logo_url: {
    type: String,
    default: '/uploads\attachments\sidebar_dark_logo.png'
  },
  maintenance_mode: {
    type: Boolean,
    default: false
  },
  maintenance_title: {
    type: String,
    default: 'Under Maintenance'
  },
  maintenance_message: {
    type: String,
    default: 'We are performing some maintenance. Please check back later.'
  },
  maintenance_image_url: {
    type: String,
    default: ''
  },
  maintenance_allowed_ips: {
    type: [String],
    default: []
  },
  page_404_title: {
    type: String,
    default: 'Page Not Found'
  },
  page_404_content: {
    type: String,
    default: 'The page you are looking for does not exist.'
  },
  page_404_image_url: {
    type: String,
    default: ''
  },
  no_internet_title: {
    type: String,
    default: 'No Internet Connection'
  },
  no_internet_content: {
    type: String,
    default: 'Please check your internet connection and try again.'
  },
  no_internet_image_url: {
    type: String,
    default: ''
  },
  smtp_host: {
    type: String,
    default: ''
  },
  smtp_port: {
    type: Number,
    min: 1,
    max: 65535,
    default: 587
  },
  smtp_user: {
    type: String,
    default: ''
  },
  smtp_pass: {
    type: String,
    default: ''
  },
  mail_from_name: {
    type: String,
    default: 'Wapi'
  },
  mail_from_email: {
    type: String,
    validate: {
      validator: function (v) {
        return !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
      },
      message: 'Please enter a valid email address'
    },
    default: 'noreply@myapplication.com'
  },
  default_theme_mode: {
    type: String,
    enum: ['dark', 'light', 'system'],
    default: 'light'
  },
  display_customizer: {
    type: Boolean,
    default: true
  },
  audio_calls_enabled: {
    type: Boolean,
    default: true
  },
  video_calls_enabled: {
    type: Boolean,
    default: true
  },
  allow_voice_message: {
    type: Boolean,
    default: true
  },
  allow_archive_chat: {
    type: Boolean,
    default: true
  },
  allow_media_send: {
    type: Boolean,
    default: true
  },
  allow_user_block: {
    type: Boolean,
    default: true
  },
  allow_user_signup: {
    type: Boolean,
    default: true
  },
  call_timeout_seconds: {
    type: Number,
    min: 1,
    max: 50,
    default: 25
  },
  session_expiration_days: {
    type: Number,
    default: 7
  },
  document_file_limit: {
    type: Number,
    default: 15
  },
  audio_file_limit: {
    type: Number,
    default: 15
  },
  video_file_limit: {
    type: Number,
    default: 20
  },
  image_file_limit: {
    type: Number,
    default: 10
  },
  multiple_file_share_limit: {
    type: Number,
    default: 10
  },
  maximum_message_length: {
    type: Number,
    min: 1,
    max: 50000,
    default: 40000
  },
  allowed_file_upload_types: {
    type: [String],
    default: [
      'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg',
      'mp4', 'mpeg', 'mov', 'webm',
      'mp3', 'wav', 'ogg',
      'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt'
    ]
  },
  app_id: {
    type: String,
    default: null
  },
  app_secret: {
    type: String,
    default: null
  },
  configuration_id: {
    type: String,
    default: null
  },
  max_groups_per_user: {
    type: Number,
    default: 500
  },
  max_group_members: {
    type: Number,
    default: 1024
  },
  whatsapp_webhook_url: {
    type: String,
    default: null
  },
  webhook_verification_token: {
    type: String,
    default: null
  },
  free_trial_enabled: {
    type: Boolean,
    default: false
  },
  free_trial_days: {
    type: Number,
    min: 1,
    max: 365,
    default: 7
  },
  trial_expired_delete_days: {
    type: Number,
    min: 0,
    max: 365,
    default: 0
  },
  stripe_publishable_key: {
    type: String,
    default: null
  },
  stripe_secret_key: {
    type: String,
    default: null
  },
  stripe_webhook_secret: {
    type: String,
    default: null
  },
  razorpay_key_id: {
    type: String,
    default: null
  },
  razorpay_key_secret: {
    type: String,
    default: null
  },
  is_razorpay_active: {
    type: Boolean,
    default: false
  },
  is_demo_mode: {
    type: Boolean,
    default: false
  },
  show_whatsapp_config: {
    type: Boolean,
    default: true
  },
  show_email_config: {
    type: Boolean,
    default: true
  },
  connection_method: {
    type: String,
    enum: ['manual', 'qr_scan', 'embedded_signup'],
    default: 'manual'
  },
  is_stripe_active: {
    type: Boolean,
    default: false
  },
  razorpay_webhook_secret: {
    type: String,
    default: null
  },
  demo_user_email: {
    type: String,
    default: 'john@example.com'
  },
  demo_user_password: {
    type: String,
    default: '123456789'
  },
  demo_agent_email: {
    type: String,
    default: 'jack@example.com'
  },
  demo_agent_password: {
    type: String,
    default: '123456789'
  },
  default_currency: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Currency',
    default: null
  },
  default_language: {
    type: String,
    default: 'en'
  },
  enable_cash: {
    type: Boolean,
    default: false
  },
  paypal_client_id: {
    type: String,
    default: null
  },
  paypal_client_secret: {
    type: String,
    default: null
  },
  paypal_mode: {
    type: String,
    enum: ['sandbox', 'live'],
    default: 'sandbox'
  },
  is_paypal_active: {
    type: Boolean,
    default: false
  },
  paypal_webhook_id: {
    type: String,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'settings'
});

settingSchema.methods.canAccessDuringMaintenance = function (ip) {
  if (!this.maintenance_mode) return true;
  return this.maintenance_allowed_ips.includes(ip);
};

export default mongoose.model('Setting', settingSchema);
