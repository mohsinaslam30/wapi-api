import mongoose from 'mongoose';

const chatNoteSchema = new mongoose.Schema({
  sender_number: {
    type: String,
    default: null
  },
  recipient_number: {
    type: String,
    default: null
  },
  contact_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Contact',
    default: null
  },
  whatsapp_phone_number_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WhatsappPhoneNumber',
    default: null
  },
  note: {
    type: String,
    default: null
  },
  deleted_at: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'chat_notes'
});

chatNoteSchema.query.active = function() {
  return this.where({ deleted_at: null });
};

export default mongoose.model('chatNote', chatNoteSchema);
