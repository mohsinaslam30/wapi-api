
import mongoose from 'mongoose';

const twitterConnectionSchema = new mongoose.Schema({
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  workspace_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Workspace' },
  twitter_user_id: { type: String },
  username: { type: String },
  name: { type: String },
  profile_image_url: { type: String },
  access_token: { type: String },
  refresh_token: { type: String },
  token_type: { type: String },
  expires_at: { type: Date },
  scope: { type: String },
  access_token_secret: { type: String },
  client_id: { type: String },
  client_secret: { type: String },
  is_active: { type: Boolean, default: true }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'twitter_connections'
});

export default mongoose.model('TwitterConnection', twitterConnectionSchema);
