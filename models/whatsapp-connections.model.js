import mongoose from 'mongoose';

const whatsappConnectionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: false,
    trim: true
  },
  access_token: {
    type: String,
    required: true
  },
  registred_phone_number: {
    type: String,
    required: true
  },
  phone_number_id: {
    type: String,
    required: true
  },
  whatsapp_business_account_id: {
    type: String,
    required: true
  },
  app_id: {
    type: String,
    required: true
  },
  is_active: {
    type: Boolean,
    default: true
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'whatsapp_connections'
});

export default mongoose.model('WhatsappConnection', whatsappConnectionSchema);
