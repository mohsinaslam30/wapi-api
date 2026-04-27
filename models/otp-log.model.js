import mongoose from 'mongoose';

const otpLogSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  channel: {
    type: String,
    enum: ['email', 'whatsapp'],
    required: true
  },
  whatsapp_count: {
    type: Number,
    default: 0
  },
  email_count: {
    type: Number,
    default: 0
  },
  email: {
    type: String,
    required: true
  },
  otp: {
    type: String,
    required: true
  },
  expires_at: {
    type: Date,
    required: true
  },
  verified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'otp_logs'
});

otpLogSchema.index({ email: 1 });
otpLogSchema.index({ expires_at: 1 });
otpLogSchema.index({ verified: 1 });
otpLogSchema.index({ email: 1, verified: 1 });

export default mongoose.model('OTPLog', otpLogSchema);
