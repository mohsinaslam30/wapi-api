import mongoose from 'mongoose';

const googleAccountSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  access_token: {
    type: String,
    required: true
  },
  refresh_token: {
    type: String,
    required: true
  },
  expires_at: {
    type: Date,
    required: true
  },
  scopes: {
    type: [String],
    default: []
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'expired'],
    default: 'active'
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'google_accounts'
});

googleAccountSchema.index({ user_id: 1, email: 1 }, { unique: true });
googleAccountSchema.index({ deleted_at: 1 });

export default mongoose.model('GoogleAccount', googleAccountSchema);
