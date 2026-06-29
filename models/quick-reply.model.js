import mongoose from 'mongoose';

const quickReplySchema = new mongoose.Schema({
    content: {
        type: String,
        required: true,
        trim: true
    },
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    is_admin_reply: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true,
    collection: 'quick_replies'
});

quickReplySchema.index({ user_id: 1 });
quickReplySchema.index({ is_admin_reply: 1 });

export default mongoose.model('QuickReply', quickReplySchema);