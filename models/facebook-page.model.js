import mongoose from 'mongoose';

const facebookPageSchema = new mongoose.Schema({
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
  page_id: {
    type: String,
    required: true
  },
  page_name: {
    type: String,
    required: true
  },
  page_access_token: {
    type: String,
    required: true
  },
  category: {
    type: String
  },
  picture_url: {
    type: String
  },
  waba_number_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WhatsappPhoneNumber'
  },
  is_whatsapp_connected: {
    type: Boolean,
    default: false
  },
  is_instagram_connected: {
    type: Boolean,
    default: false
  },
  instagram_username: {
    type: String,
    default: null
  },
  business_id: {
    type: String,
    default: null
  },
  is_active: {
    type: Boolean,
    default: true
  },
  is_meta_verified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'facebook_pages'
});

export default mongoose.model('FacebookPage', facebookPageSchema);
