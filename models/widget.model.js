import mongoose from 'mongoose';

const widgetSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    whatsapp_phone_number: {
      type: String,
      required: true
    },

    widget_image_url: {
      type: String,
      default: null,
      trim: true,
    },

    body_background_image: {
      type: String,
      default: null,
      trim: true,
    },

    header_text: {
      type: String,
      default: 'Live Chat',
      trim: true,
    },

    header_text_color: {
      type: String,
      default: '#ffffff',
      trim: true,
    },

    header_background_color: {
      type: String,
      default: '#0f6a5b',
      trim: true,
    },

    body_background_color: {
      type: String,
      default: '#f6f1ea',
      trim: true,
    },

    welcome_text: {
      type: String,
      default: '',
      trim: true,
    },

    welcome_text_color: {
      type: String,
      default: '#1f2937',
      trim: true,
    },

    welcome_text_background: {
      type: String,
      default: '#ffffff',
      trim: true,
    },

    start_chat_button_text: {
      type: String,
      default: 'Start Chat',
      trim: true,
    },

    start_chat_button_background: {
      type: String,
      default: '#25D366',
      trim: true,
    },

    start_chat_button_text_color: {
      type: String,
      default: '#ffffff',
      trim: true,
    },

    default_open_popup: {
      type: Boolean,
      default: false,
    },

    default_user_message: {
      type: String,
      default: '',
      trim: true,
    },

    widget_position: {
      type: String,
      default: 'bottom-right',
      trim: true,
      enum: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    },

    widget_color: {
      type: String,
      default: null,
      trim: true,
    },

    deleted_at: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'widgets',
  }
);

export default mongoose.model('Widget', widgetSchema);
