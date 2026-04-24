import mongoose from 'mongoose';

const otpLogSchema = new mongoose.Schema({
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
