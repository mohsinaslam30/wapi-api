import mongoose from 'mongoose';

const cookieConsentLogSchema = new mongoose.Schema({
  consent_id: {
    type: String,
    required: true,
    index: true
  },
  consent_type: {
    type: String,
    enum: ['accept', 'decline', 'preferences'],
    required: true
  },
  preferences: {
    type: mongoose.Schema.Types.Mixed,
    default: {
      essential: true
    }
  },
  ip_address: {
    type: String,
    default: ''
  },
  user_agent: {
    type: String,
    default: ''
  },
  logged_at: {
    type: Date,
    default: Date.now,
    required: true
  }
}, {
  timestamps: true,
  collection: 'cookie_consent_logs'
});

cookieConsentLogSchema.index({ consent_id: 1, logged_at: -1 });

export default mongoose.model('CookieConsentLog', cookieConsentLogSchema);
