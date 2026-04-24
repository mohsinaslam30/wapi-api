import mongoose from 'mongoose';

const chatbotSchema = new mongoose.Schema(
    {
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true
        },
        created_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        waba_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'WhatsappWaba',
            required: true,
            index: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        ai_model: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AIModel',
            required: true
        },
        api_key: {
            type: String,
            required: true,
            trim: true
        },
        business_name: {
            type: String,
            trim: true,
            default: ''
        },
        business_description: {
            type: String,
            trim: true,
            default: ''
        },
        training_data: [
            {
                question: { type: String, trim: true },
                answer: { type: String, trim: true },
                context: { type: String, trim: true }
            }
        ],
        raw_training_text: {
            type: String,
            trim: true,
            default: ''
        },
        system_prompt: {
            type: String,
            trim: true,
            default: ''
        },
        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active'
        },
        knowledge_type: {
            type: String,
            enum: ['text', 'q&a', 'website_url', 'document'],
            default: 'text'
        },
        deleted_at: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'chatbots'
    }
);

chatbotSchema.index({ user_id: 1, status: 1 });

export default mongoose.model('Chatbot', chatbotSchema);
