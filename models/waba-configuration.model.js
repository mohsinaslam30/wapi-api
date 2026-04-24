import mongoose from 'mongoose';

const replyMaterialRefSchema = new mongoose.Schema({
    id: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'type',
        default: null
    },
    type: {
        type: String,
        enum: ['ReplyMaterial', 'Template', 'EcommerceCatalog', 'Sequence', 'chatbot'],
        default: 'ReplyMaterial'
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
    product_retailer_id: String
}, { _id: false });


const wabaConfigurationSchema = new mongoose.Schema({
    waba_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WhatsappWaba',
        required: true,
        unique: true
    },
    out_of_working_hours: {
        type: replyMaterialRefSchema,
        default: () => ({})
    },
    welcome_message: {
        type: replyMaterialRefSchema,
        default: () => ({})
    },
    delayed_reply: {
        delay_minutes: { type: Number, default: 30 },
        id: { type: mongoose.Schema.Types.ObjectId, refPath: 'delayed_reply.type', default: null },
        type: { type: String, enum: ['ReplyMaterial', 'Template', 'EcommerceCatalog', 'Sequence', 'chatbot'], default: 'ReplyMaterial' },
        variables_mapping: {
            type: Map,
            of: mongoose.Schema.Types.Mixed,
            default: {}
        },
        media_url: String,
        carousel_cards_data: [mongoose.Schema.Types.Mixed],
        coupon_code: String,
        catalog_id: String,
        product_retailer_id: String
    },
    fallback_message: {
        type: replyMaterialRefSchema,
        default: () => ({})
    },
    reengagement_message: {
        type: replyMaterialRefSchema,
        default: () => ({})
    },
    round_robin_assignment: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'waba_configurations'
});



export default mongoose.model('WabaConfiguration', wabaConfigurationSchema);
