import mongoose from 'mongoose';


const facebookLeadFormSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  facebook_page_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FacebookPage',
    required: true
  },

  page_id: {
    type: String,
    required: true,
    index: true
  },

  form_id: {
    type: String,
    required: true,
    index: true
  },

  form_name: {
    type: String,
    default: null
  },

  tag_ids: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tag'
  }],


  field_mapping: [{
    fb_field_name: { type: String, required: true },
    contact_field: {
      type: String,
      enum: ['name', 'email', 'phone_number', 'custom_field'],
      required: true
    },
    custom_field_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CustomField',
      default: null
    }
  }],


  sample_payload: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },

  webhook_subscribed: {
    type: Boolean,
    default: false
  },

  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'facebook_lead_forms'
});

facebookLeadFormSchema.index({ user_id: 1, form_id: 1 }, { unique: true });

export default mongoose.model('FacebookLeadForm', facebookLeadFormSchema);
