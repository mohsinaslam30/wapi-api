import mongoose from 'mongoose';

const instagramConnectionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  workspace_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Workspace',
    index: true,
    sparse: true
  },
  ig_user_id: { type: String },
  global_instagram_account_id: { type: String },
  username: { type: String },
  name: { type: String },
  access_token: { type: String },
  is_active: {
    type: Boolean,
    default: true
  },
  pages: [{
    page_id: { type: String },
    page_name: { type: String },
    page_access_token: { type: String },
    instagram_account_id: { type: String },
    instagram_username: { type: String },
    is_active: { type: Boolean, default: true }
  }]
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'instagram_connections'
});

export default mongoose.model('InstagramConnection', instagramConnectionSchema);
