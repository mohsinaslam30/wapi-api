import mongoose from 'mongoose';

const replyMaterialSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    waba_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WhatsappWaba',
        required: true
    },
    type: {
        type: String,
        enum: ['text', 'audio', 'video', 'document', 'image', 'sticker', 'flow', 'appointment_flow'],
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        trim: true
    },
    file_path: {
        type: String,
        trim: true
    },
    flow_id: {
        type: String,
        trim: true
    },
    button_text: {
        type: String,
        trim: true
    },
    appointment_config_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AppointmentConfig'
    },
    deleted_at: {
        type: Date,
        default: null
    }
}, {
    timestamps: true,
    collection: 'reply_materials'
});

replyMaterialSchema.index({ waba_id: 1, type: 1, deleted_at: 1 });

export default mongoose.model('ReplyMaterial', replyMaterialSchema);
