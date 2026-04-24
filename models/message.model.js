import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  sender_number: {
    type: String,
    default: null
  },
  recipient_number: {
    type: String,
    default: null
  },
  parent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  contact_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    default: null
  },
  content: {
    type: String,
    default: null
  },
  message_type: {
    type: String,
    enum: ['text', 'link', 'image', 'sticker', 'file', 'video', 'poll', 'form', 'system', 'call', 'document', 'audio', 'location', 'interactive', 'template', 'order', 'system_messages' , 'reaction'],
    default: 'text'
  },
  file_url: {
    type: String,
    default: null
  },
  file_type: {
    type: String,
    default: null
  },
  wa_jid: {
    type: String,
    default: null
  },
  from_me: {
    type: Boolean,
    default: false
  },
  wa_message_id: {
    type: String,
    default: null
  },
  direction: {
    type: String,
    enum: ['inbound', 'outbound'],
    default: null
  },
  wa_timestamp: {
    type: Date,
    default: null
  },
  is_delivered: {
    type: Boolean,
    default: false
  },
  delivered_at: {
    type: Date,
    default: null
  },
  delivery_status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed'],
    default: 'pending'
  },

  is_seen: {
    type: Boolean,
    default: false
  },
  seen_at: {
    type: Date,
    default: null
  },
  read_status: {
    type: String,
    enum: ['unread', 'read', 'read_by_multiple'],
    default: 'unread'
  },

  wa_status: {
    type: String,
    enum: ['sent', 'delivered', 'read', 'failed', 'deleted', 'RINGING', 'ACCEPTED', 'REJECTED', 'MISSED', 'COMPLETED', 'ringing', 'accepted', 'rejected', 'missed', 'completed'],
    default: null
  },
  wa_status_timestamp: {
    type: Date,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  interactive_data: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  whatsapp_connection_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WhatsappConnection',
    default: null
  },
  provider: {
    type: String,
    enum: ['business_api', 'baileys'],
    default: null
  },
  reply_message_id: {
    type: String,
    default: null
  },
  reaction_message_id: {
    type: String,
    default: null
  },
  template_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Template',
    default: null
  },
  submission_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Submission',
    default: null
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'messages'
});

messageSchema.index({ recipient_number: 1, created_at: 1 });
messageSchema.index({ parent_id: 1 });
messageSchema.index({ sender_number: 1 });
messageSchema.index({ message_type: 1 });
messageSchema.index({ sender_number: 1, recipient_number: 1 });
messageSchema.index({ deleted_at: 1 });
messageSchema.index({ created_at: -1 });
messageSchema.index({ contact_id: 1 });
messageSchema.index({ user_id: 1, contact_id: 1 });

messageSchema.index({ user_id: 1, direction: 1 });
messageSchema.index({ user_id: 1, created_at: -1 });
messageSchema.index({ direction: 1, created_at: -1 });
messageSchema.index({ user_id: 1, sender_number: 1 });
messageSchema.index({ user_id: 1, recipient_number: 1 });
messageSchema.index({ content: 'text' });
messageSchema.index({ wa_timestamp: -1 });
messageSchema.index({ user_id: 1, direction: 1, created_at: -1 });
messageSchema.index({ delivery_status: 1 });
messageSchema.index({ read_status: 1 });
messageSchema.index({ is_delivered: 1, delivered_at: -1 });
messageSchema.index({ is_seen: 1, seen_at: -1 });
messageSchema.index({ wa_status: 1 });

messageSchema.query.active = function () {
  return this.where({ deleted_at: null });
};

export default mongoose.model('Message', messageSchema);
