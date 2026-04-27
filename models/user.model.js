import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    default: null
  },
  note: {
    type: String,
    default: null
  },
  country: {
    type: String,
    default: null
  },
  country_code: {
    type: String,
    default: null
  },
  phone: {
    type: String,
    default: null
  },
  role_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    default: null,
  },
  role_key: {
    type: String,
    default: null,
    trim: true
  },
  team_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Team',
    default: null,
  },
  email_verified: {
    type: Boolean,
    default: false
  },
  is_verified: {
    type: Boolean,
    default: false
  },
  phone_verified: {
    type: Boolean,
    default: false
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  last_login: {
    type: Date,
    default: null
  },
  is_online: {
    type: Boolean,
    default: false
  },
  last_seen: {
    type: Date,
    default: null
  },
  status: {
    type: Boolean,
    default: true
  },
  stripe_customer_id: {
    type: String,
    default: null
  },
  razorpay_customer_id: {
    type: String,
    default: null
  },
  is_phoneno_hide: {
    type: Boolean,
    default: false
  },
  player_id: {
    type: String
  },
  deleted_at: {
    type: Date,
    default: null
  },
  reset_password_token: {
    type: String,
    default: null
  },
  reset_password_expires: {
    type: Date,
    default: null
  },
  storage_limit: {
    type: Number,
    default: 100
  },
  storage_used: {
    type: Number,
    default: 0
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'users'
});

// userSchema.index({ email: 1 });
userSchema.index({ deleted_at: 1 });
userSchema.index({ created_at: 1 });

userSchema.methods.softDelete = function () {
  this.deleted_at = new Date();
  return this.save();
};

userSchema.query.active = function () {
  return this.where({ deleted_at: null });
};

export default mongoose.model('User', userSchema);
