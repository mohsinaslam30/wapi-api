import mongoose from 'mongoose';

const telegramConnectionSchema = new mongoose.Schema({
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
  bot_token: { type: String, required: true },
  bot_id: { type: String },
  bot_username: { type: String },
  bot_name: { type: String },
  webhook_url: { type: String },
  is_active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'telegram_connections'
});

export default mongoose.model('TelegramConnection', telegramConnectionSchema);
