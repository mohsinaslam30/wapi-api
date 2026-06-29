import mongoose from 'mongoose';

const workspaceSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
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
    timestamps: true,
    collection: 'workspaces'
});

workspaceSchema.index({ user_id: 1 });
workspaceSchema.index({ deleted_at: 1 });

export default mongoose.model('Workspace', workspaceSchema);
