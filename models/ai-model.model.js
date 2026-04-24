import mongoose from 'mongoose';

const aiModelSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            unique: true,
            trim: true
        },
        display_name: {
            type: String,
            required: true,
            trim: true
        },
        provider: {
            type: String,
            required: true,
            enum: ['openai', 'anthropic', 'google', 'cohere', 'mistral', 'groq', 'deepseek', 'xai', 'custom'],
            lowercase: true
        },
        model_id: {
            type: String,
            required: true,
            trim: true
        },
        api_endpoint: {
            type: String,
            required: true,
            trim: true
        },
        api_version: {
            type: String,
            default: null
        },
        capabilities: {
            translate: { type: Boolean, default: true },
            summarize: { type: Boolean, default: true },
            improve: { type: Boolean, default: true },
            formalize: { type: Boolean, default: true },
            casualize: { type: Boolean, default: true },
            reply_suggestion: { type: Boolean, default: true }
        },
        config: {
            max_tokens: { type: Number, default: 1000 },
            temperature: { type: Number, default: 0.7 },
            top_p: { type: Number, default: 1 },
            frequency_penalty: { type: Number, default: 0 },
            presence_penalty: { type: Number, default: 0 },
            api_key: { type: String, default: null }
        },
        encrypted_config: {
            type: Map,
            of: String,
            default: {}
        },
        headers_template: {
            type: Map,
            of: String,
            default: {}
        },
        request_format: {
            type: String,
            enum: ['openai', 'anthropic', 'google', 'custom'],
            default: 'openai'
        },
        response_path: {
            type: String,
            default: 'choices.0.message.content'
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active'
        },
        is_default: {
            type: Boolean,
            default: false
        },
        description: {
            type: String,
            default: ''
        },
        created_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        deleted_at: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
    }
);

aiModelSchema.index({ provider: 1, status: 1 });
aiModelSchema.index({ name: 1, deleted_at: 1 });
aiModelSchema.index({ status: 1, deleted_at: 1 });

export default mongoose.model('AIModel', aiModelSchema);
