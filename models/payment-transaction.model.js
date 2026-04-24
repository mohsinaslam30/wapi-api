import mongoose from 'mongoose';

const paymentTransactionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // Generic context — which module/feature created this payment
  context: {
    type: String,
    enum: ['appointment', 'catalog', 'custom'],
    required: true,
    index: true
  },

  // The ID of the entity in that context (booking._id, order._id, etc.)
  context_id: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true
  },

  gateway_config_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'PaymentGatewayConfig',
    required: true
  },

  // Denormalized for fast webhook lookup
  gateway: {
    type: String,
    enum: ['razorpay', 'stripe', 'paypal'],
    required: true
  },

  // IDs returned by the gateway
  gateway_order_id: { type: String, index: true },   // Razorpay order / Stripe session / PayPal order
  gateway_payment_id: { type: String },              // Filled on successful webhook

  payment_link: { type: String },                    // URL sent to user
  payment_type: { type: String, enum: ['full', 'partial'], default: 'full' },

  amount: { type: Number, required: true },          // In smallest currency unit (paise / cents)
  currency: { type: String, default: 'INR' },

  status: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending',
    index: true
  },

  paid_at: { type: Date },

  metadata: { type: mongoose.Schema.Types.Mixed },   // Extra gateway data
  
  whatsapp_phone_number_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WhatsappPhoneNumber'
  }

}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'payment_transactions'
});

paymentTransactionSchema.index({ context: 1, context_id: 1 });
paymentTransactionSchema.index({ gateway: 1, gateway_order_id: 1 });

export default mongoose.model('PaymentTransaction', paymentTransactionSchema);
