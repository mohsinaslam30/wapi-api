import mongoose from 'mongoose';

const socialMediaPostSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    workspace_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true
    },
    connection_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    platform: {
        type: String,
        enum: ['instagram', 'facebook'],
        required: true
    },
    media_id: {
        type: String,
        required: true
    },
    media_type: {
        type: String
    },
    caption: {
        type: String
    },
    media_url: {
        type: String
    },
    thumbnail_url: {
        type: String
    },
    permalink: {
        type: String
    },
    timestamp: {
        type: Date
    },
    suggested_keywords: [{
        type: String
    }],
    children: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

socialMediaPostSchema.index({ connection_id: 1, media_id: 1 }, { unique: true });

const SocialMediaPost = mongoose.model('SocialMediaPost', socialMediaPostSchema);

export default SocialMediaPost;
