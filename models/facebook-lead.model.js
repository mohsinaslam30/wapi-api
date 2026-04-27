import mongoose from 'mongoose';


const facebookLeadSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  lead_form_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'FacebookLeadForm',
    required: true,
    index: true
  },

  lead_gen_id: {
    type: String,
    required: true,
    unique: true
  },

  form_id: {
    type: String,
    required: true
  },

  raw_payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  contact_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    default: null
  },

  status: {
    type: String,
    enum: ['pending', 'mapped', 'created', 'failed'],
    default: 'pending'
  },

  error_message: {
    type: String,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'facebook_leads'
});

facebookLeadSchema.index({ lead_form_id: 1, created_at: -1 });

export default mongoose.model('FacebookLead', facebookLeadSchema);
