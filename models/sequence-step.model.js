import mongoose from 'mongoose';

const sequenceStepSchema = new mongoose.Schema({
    sequence_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Sequence',
        required: true
    },
    reply_material_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'reply_material_type'
    },
    reply_material_type: {
        type: String,
        required: true,
        enum: ['ReplyMaterial', 'Template', 'EcommerceCatalog' , 'chatbot']
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
    carousel_products: [{
        product_retailer_id: { type: String, required: true },
        catalog_id: { type: String, required: true }
    }],
    coupon_code: String,
    offer_expiration_minutes: {
        type: Number,
        default: null
    },
    catalog_id: String,
    product_retailer_id: String,
    is_active: {
        type: Boolean,
        default: true
    },
    delay_value: {
        type: Number,
        default: 0
    },
    delay_unit: {
        type: String,
        enum: ['minutes', 'hours', 'days'],
        default: 'minutes'
    },
    send_anytime: {
        type: Boolean,
        default: true
    },
    from_time: {
        type: String,
        default: '00:00'
    },
    to_time: {
        type: String,
        default: '23:59'
    },
    send_days: {
        type: [String],
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
        default: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
    },
    sort: {
        type: Number,
        default: 0
    },
    deleted_at: {
        type: Date,
        default: null
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'sequence_steps'
});

sequenceStepSchema.index({ sequence_id: 1 });
sequenceStepSchema.index({ sort: 1 });
sequenceStepSchema.index({ deleted_at: 1 });

export default mongoose.model('SequenceStep', sequenceStepSchema);
