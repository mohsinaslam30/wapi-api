import mongoose from 'mongoose';

const userSettingSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  ai_model: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "AIModel",
    default: null
  },
  is_show_phone_no: {
    type: Boolean,
    default: false
  },
  api_key: {
    type: String,
    default: null
  },
  notification_tone: {
    type: String,
    default: 'default'
  },
  notifications_enabled: {
    type: Boolean,
    default: true
  },
  theme_color: {
    type: String,
    default: '#128C7E'
  },
  user_bubble_color: {
    type: String,
    default: '#DCF8C6'
  },
  contact_bubble_color: {
    type: String,
    default: '#FFFFFF'
  },
  bg_color: {
    type: String,
    default: '#E5DDD5'
  },
  bg_image: {
    type: String,
    default: null
  },
  user_text_color: {
    type: String,
    default: '#000000'
  },
  contact_text_color: {
    type: String,
    default: '#000000'
  },
  call_automation_settings: {
    auto_call_on_permission_grant: { type: Boolean, default: true },
    call_delay_seconds: { type: Number, default: 30 },
    max_retry_attempts: { type: Number, default: 3 }
  },
  payment_success_message: {
    type: String,
    default: '✅ *Payment Successful!*\n\nThank you! We have received your payment of *{currency} {amount}* for *{description}*.'
  },
  payment_failed_message: {
    type: String,
    default: '❌ *Payment Failed*\n\nWe were unable to process your payment of *{currency} {amount}* for *{description}*. Please try again.'
  },
  payment_reminder_enabled: {
    type: Boolean,
    default: false
  },
  payment_reminder_delay: {
    type: Number,
    default: 60 // minutes
  },
  payment_reminder_unit: {
    type: String,
    enum: ['minutes', 'hours', 'days'],
    default: 'minutes'
  },
  payment_reminder_message: {
    type: String,
    default: '🔔 *Payment Reminder*\n\nYou have a pending payment of *{currency} {amount}* for *{description}*.\n\nPlease complete it using the link: {payment_link}'
  },
  disable_admin_quick_reply: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'user_settings'
});

// userSettingSchema.index({ user_id: 1 });

export default mongoose.model('UserSetting', userSettingSchema);
