import mongoose from 'mongoose';

const aiPromptLogSchema = new mongoose.Schema(
    {
        user_id: {
            type: mongoose.Types.ObjectId,
            required: true,
            index: true
        },
        feature: {
            type: String,
            default: 'ai_prompts',
            index: true
        },
        created_at: {
            type: Date,
            default: Date.now,
            index: true
        },
        deleted_at: {
            type: Date,
            default: null
        }
    }
)

aiPromptLogSchema.index({ user_id: 1, feature: 1, created_at: 1 });

export default mongoose.model('AiPromptLog', aiPromptLogSchema);