import mongoose from 'mongoose';

const contactInquirySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  subject: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'contact_inquiries'
});

export default mongoose.model('ContactInquiry', contactInquirySchema);
