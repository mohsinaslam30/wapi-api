import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  session_token: {
    type: String,
    required: true,
    unique: true
  },
  device_info: {
    type: String,
    default: null
  },
  ip_address: {
    type: String,
    default: null
  },
  agenda: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  expires_at: {
    type: Date,
    required: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'sessions'
});

sessionSchema.index({ user_id: 1, status: 1 });
sessionSchema.index({ expires_at: 1 });
// sessionSchema.index({ session_token: 1 });
sessionSchema.index({ agenda: 1 });
sessionSchema.index({ created_at: 1 });

export default mongoose.model('Session', sessionSchema);
