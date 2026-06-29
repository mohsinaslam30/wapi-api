import mongoose from 'mongoose';

const emailTemplateSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true
  },
  shortcodes: [{
    type: {
      type: String,
      default: 'variable'
    },
    text: String,
    action: String
  }],
  is_system: {
    type: Boolean,
    default: true
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'email_templates'
});

emailTemplateSchema.index({ deleted_at: 1 });

export default mongoose.model('EmailTemplate', emailTemplateSchema);
