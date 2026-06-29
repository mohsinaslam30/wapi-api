import mongoose from 'mongoose';

const apiKeySchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    default: null,
    trim: true
  },
  key_hash: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  prefix: {
    type: String,
    required: true,
    index: true
  },
  last_used_at: {
    type: Date,
    default: null
  },
  last_used_ip: {
    type: String,
    default: null
  },
  last_used_user_agent: {
    type: String,
    default: null
  },
  deleted_at: {
    type: Date,
    default: null,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'api_keys'
});

apiKeySchema.index({ user_id: 1, deleted_at: 1, created_at: -1 });

export default mongoose.model('ApiKey', apiKeySchema);

