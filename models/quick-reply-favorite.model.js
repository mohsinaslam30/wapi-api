import mongoose from 'mongoose';

const quickReplyFavoriteSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    quick_reply_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'QuickReply',
        required: true
    }
}, {
    timestamps: true,
    collection: 'quick_reply_favorites'
});

quickReplyFavoriteSchema.index({ user_id: 1, quick_reply_id: 1 }, { unique: true });

export default mongoose.model('QuickReplyFavorite', quickReplyFavoriteSchema);
