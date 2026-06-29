import mongoose from 'mongoose';

const shopifyConfigurationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  shop_domain: {
    type: String,
    required: true,
    trim: true
  },

  admin_api_access_token: {
    type: String,
    required: true,
    trim: true
  },

  client_id: {
    type: String,
    default: '',
    trim: true
  },

  client_secret: {
    type: String,
    default: '',
    trim: true
  },

  is_active: {
    type: Boolean,
    default: true
  },

  sync_status: {
    type: String,
    enum: ['idle', 'syncing', 'completed', 'failed'],
    default: 'idle'
  },

  last_sync_at: {
    type: Date,
    default: null
  },

  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'shopify_configurations'
});

shopifyConfigurationSchema.index({ user_id: 1, deleted_at: 1 });

export default mongoose.model('ShopifyConfiguration', shopifyConfigurationSchema);
