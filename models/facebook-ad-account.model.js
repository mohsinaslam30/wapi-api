import mongoose from 'mongoose';

const facebookAdAccountSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  connection_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FacebookConnection',
    required: true
  },
  ad_account_id: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  currency: {
    type: String
  },
  account_status: {
    type: Number
  },
  status_label: {
    type: String
  },
  has_payment_method: {
    type: Boolean,
    default: false
  },
  can_create_ads: {
    type: Boolean,
    default: false
  },
  balance: {
    type: String
  },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'facebook_ad_accounts'
});

export default mongoose.model('FacebookAdAccount', facebookAdAccountSchema);
