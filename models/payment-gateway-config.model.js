import mongoose from 'mongoose';

const credentialsSchema = new mongoose.Schema({
  key_id: { type: String },
  key_secret: { type: String },

  publishable_key: { type: String },
  secret_key: { type: String },

  client_id: { type: String },
  client_secret: { type: String },
  mode: { type: String, enum: ['sandbox', 'live'], default: 'live' }
}, { _id: false });

const paymentGatewayConfigSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  gateway: {
    type: String,
    enum: ['razorpay', 'stripe', 'paypal'],
    required: true
  },

  display_name: { type: String, trim: true, required: true },

  is_active: { type: Boolean, default: true },

  credentials: { type: credentialsSchema, required: true },

  webhook_id: { type: String },
  webhook_secret: { type: String },

  deleted_at: { type: Date, default: null }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'payment_gateway_configs'
});

paymentGatewayConfigSchema.index({ user_id: 1, gateway: 1, deleted_at: 1 });

export default mongoose.model('PaymentGatewayConfig', paymentGatewayConfigSchema);
