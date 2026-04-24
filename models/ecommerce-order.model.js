import mongoose from 'mongoose';

export const ECOMMERCE_ORDER_STATUSES = [
  'pending',
  'confirmed',
  'ready_to_ship',
  'first_message',
  'on_the_way',
  'shipped'
];

const ecommerceOrderSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  contact_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    default: null
  },

  wa_message_id: {
    type: String,
    required: true,
    index: true
  },

  wa_order_id: {
    type: String,
    default: null
  },

  currency: {
    type: String,
    default: null
  },

  total_price: {
    type: Number,
    default: null
  },

  status: {
    type: String,
    enum: ECOMMERCE_ORDER_STATUSES,
    default: 'pending',
    index: true
  },

  items: [{
    product_retailer_id: String,
    quantity: Number,
    price: Number,
    name: String,
    raw: mongoose.Schema.Types.Mixed
  }],

  raw_payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  phone_no_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WhatsappPhoneNumber',
    required: true
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'ecommerce_orders'
});

ecommerceOrderSchema.index({ user_id: 1, created_at: -1 });

export default mongoose.model('EcommerceOrder', ecommerceOrderSchema);

