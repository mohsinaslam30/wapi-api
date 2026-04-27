import mongoose from 'mongoose';

const facebookConnectionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  fb_user_id: {
    type: String,
    required: true
  },
  name: {
    type: String
  },
  email: {
    type: String
  },
  long_lived_access_token: {
    type: String,
    required: true
  },
  is_active: {
    type: Boolean,
    default: true
  },
  default_page_id: {
    type: String,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'facebook_connections'
});

export default mongoose.model('FacebookConnection', facebookConnectionSchema);
