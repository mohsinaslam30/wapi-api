import mongoose from 'mongoose';

const whatsappCallAgentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    welcome_message: {
        type: String,
        default: 'Hello, how can I help you today?'
    },
    ai_config: {
        model_id: { type: String, required: true },
        api_key: { type: String, required: true },
        prompt: { type: String, default: '' },
        training_url: { type: String, default: '' },
        include_concise_instruction: { type: Boolean, default: true }
    },
    voice_config: {
        stt_provider: { type: String, enum: ['openai', 'google', 'elevenlabs'], default: 'openai' },
        tts_provider: { type: String, enum: ['openai', 'google', 'elevenlabs'], default: 'elevenlabs' },
        api_key: { type: String, default: null },
        voice_id: { type: String, default: null }
    },
    recording_config: {
        enable_agent_recording: { type: Boolean, default: true },
        enable_user_recording: { type: Boolean, default: true },
        enable_transcription: { type: Boolean, default: true }
    },
    nodes: [
        {
            id: { type: String, required: true },
            type: {
                type: String,
                required: true,
                enum: ['welcome', 'ai_info', 'function', 'hang_up']
            },
            name: { type: String, default: '' },
            parameters: {
                type: mongoose.Schema.Types.Mixed,
                default: {}
            },
            next_node_id: { type: String, default: null }
        }
    ],
    available_functions: [
        {
            id: { type: String, required: true },
            name: { type: String, required: true },
            description: { type: String, default: '' },
            is_active: { type: Boolean, default: true },
            trigger_keywords: [{ type: String }],
            parameters: [
                {
                    id: { type: String, required: true },
                    name: { type: String, required: true },
                    type: {
                        type: String,
                        enum: ['string', 'number', 'boolean', 'email', 'phone'],
                        default: 'string'
                    },
                    description: { type: String, default: '' },
                    required: { type: Boolean, default: false },
                    example: { type: String, default: '' }
                }
            ],
            api_config: {
                url: { type: String, default: '' },
                method: {
                    type: String,
                    enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
                    default: 'POST'
                },
                headers: [{
                    key: { type: String },
                    value: { type: String }
                }],
                body_template: { type: String, default: '' }
            }
        }
    ],
    hangup_config: {
        enabled: { type: Boolean, default: false },
        trigger_keywords: [{ type: String }],
        farewell_message: { type: String, default: 'Thank you for calling. Goodbye!' }
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
    collection: 'whatsapp_call_agents'
});

whatsappCallAgentSchema.index({ user_id: 1, is_active: 1 });
whatsappCallAgentSchema.index({ deleted_at: 1 });

export default mongoose.model('WhatsappCallAgent', whatsappCallAgentSchema);
