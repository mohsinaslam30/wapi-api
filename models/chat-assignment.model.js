import mongoose from 'mongoose';

const chatAssignmentSchema = new mongoose.Schema({
  sender_number: {
    type: String,
    required: true,
    index: true
  },
  receiver_number: {
    type: String,
    required: true,
    index: true
  },
  agent_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },

  assigned_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  whatsapp_phone_number_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WhatsappPhoneNumber',
    required: true,
    index: true
  },
  chatbot_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Chatbot',
    default: null,
    index: true
  },
  status: {

    type: String,
    enum: ['assigned', 'unassigned'],
    default: 'assigned',
    index: true
  },
  is_solved: {
    type: Boolean,
    default: false,
    index: true
  },
  chatbot_expires_at: {
    type: Date,
    default: null,
    index: true
  }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'chat_assignments'
});


chatAssignmentSchema.index(
  { unique: true }
);

export default mongoose.model('ChatAssignment', chatAssignmentSchema);
