import mongoose from 'mongoose';

const processedSocialCommentSchema = new mongoose.Schema({
    workspace_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Workspace',
        required: true
    },
    automation_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SocialAutomation',
        required: true
    },
    platform: {
        type: String,
        enum: ['instagram', 'facebook'],
        required: true
    },
    comment_id: {
        type: String,
        required: true
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

processedSocialCommentSchema.index({ automation_id: 1, comment_id: 1 }, { unique: true });

const ProcessedSocialComment = mongoose.model('Processed_Social_Comment', processedSocialCommentSchema);

export default ProcessedSocialComment;
