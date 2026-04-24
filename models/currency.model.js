import mongoose from 'mongoose';

const currencySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  code: {
    type: String,
    required: true,
    uppercase: true,
    trim: true
  },
  symbol: {
    type: String,
    required: true,
    trim: true
  },
  exchange_rate: {
    type: Number,
    required: true,
    default: 1
  },
  decimal_number: {
    type: Number,
    default: 2
  },
  sort_order: {
    type: Number,
    default: 0
  },
  is_active: {
    type: Boolean,
    default: true
  },
  is_default: {
    type: Boolean,
    default: false
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'currencies'
});

currencySchema.index(
  { code: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);

currencySchema.index(
  { name: 1 },
  { unique: true, partialFilterExpression: { deleted_at: null } }
);

const Currency = mongoose.model('Currency', currencySchema);

export default Currency;