import mongoose from 'mongoose';

const messageBotSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    waba_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WhatsappWaba',
        required: true,
        index: true
    },
    keywords: [{
        type: String,
        trim: true,
        required: true
    }],
    matching_method: {
        type: String,
        enum: ['exact', 'contains', 'partial', 'starts_with', 'ends_with'],
        default: 'exact'
    },
    partial_percentage: {
        type: Number,
        default: 80,
        min: 0,
        max: 100
    },
    reply_type: {
        type: String,
        enum: ['text', 'media', 'template', 'catalog', 'chatbot', 'agent', 'sequence', 'flow', 'appointment_flow'],
        required: true
    },
    reply_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'reply_type_ref'
    },
    reply_type_ref: {
        type: String,
        enum: ['ReplyMaterial', 'Template', 'EcommerceCatalog', 'Chatbot', 'User', 'AppointmentConfig'],
        required: true
    },
    variables_mapping: {
        type: Map,
        of: mongoose.Schema.Types.Mixed,
        default: {}
    },
    media_url: {
        type: String,
        default: null
    },
    carousel_cards_data: [mongoose.Schema.Types.Mixed],
    coupon_code: String,
    catalog_id: String,
    product_retailer_id: String,
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active',
        index: true
    },
    deleted_at: {
        type: Date,
        default: null,
        index: true
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'message_bots'
});

messageBotSchema.index({ waba_id: 1, status: 1, deleted_at: 1 });

export default mongoose.model('MessageBot', messageBotSchema);
