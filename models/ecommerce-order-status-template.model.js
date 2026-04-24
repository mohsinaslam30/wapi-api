import mongoose from 'mongoose';
import { ECOMMERCE_ORDER_STATUSES } from './ecommerce-order.model.js';

const ecommerceOrderStatusTemplateSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  status: {
    type: String,
    enum: ECOMMERCE_ORDER_STATUSES,
    required: true,
    index: true
  },

  message_template: {
    type: String,
    required: true,
    trim: true
  },

  is_active: {
    type: Boolean,
    default: true,
    index: true
  },

  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'ecommerce_order_status_templates'
});

ecommerceOrderStatusTemplateSchema.index(
  { user_id: 1, status: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);

export default mongoose.model('EcommerceOrderStatusTemplate', ecommerceOrderStatusTemplateSchema);

