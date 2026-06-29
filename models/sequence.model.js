import mongoose from 'mongoose';

const sequenceSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    waba_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WhatsappWaba',
        default: null
    },
    telegram_connection_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TelegramConnection',
        default: null
    },
    facebook_connection_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FacebookConnection',
        default: null
    },
    instagram_connection_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InstagramConnection',
        default: null
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    platform: {
        type: String,
        enum: ['whatsapp', 'telegram', 'facebook', 'instagram'],
        default: 'whatsapp'
    },
    is_active: {
        type: Boolean,
        default: true
    },
    deleted_at: {
        type: Date,
        default: null
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'sequences'
});

sequenceSchema.index({ user_id: 1 });
sequenceSchema.index({ waba_id: 1 });
sequenceSchema.index({ telegram_connection_id: 1 });
sequenceSchema.index({ facebook_connection_id: 1 });
sequenceSchema.index({ instagram_connection_id: 1 });
sequenceSchema.index({ deleted_at: 1 });

export default mongoose.model('Sequence', sequenceSchema);
