import mongoose from 'mongoose';

const socialAutomationSchema = new mongoose.Schema({
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
    platform: {
        type: String,
        enum: ['instagram', 'facebook'],
        required: true
    },
    connection_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },
    automation_type: {
        type: String,
        enum: ['post_comment', 'reel_comment', 'story_mention', 'story_reply'],
        required: true
    },
    target_media_id: {
        type: String,
        default: 'all'
    },
    keywords: [{
        type: String,
        trim: true
    }],
    matching_method: {
        type: String,
        enum: ['exact', 'contains', 'partial', 'starts_with', 'ends_with'],
        default: 'exact'
    },
    partial_percentage: {
        type: Number,
        default: 100,
        min: 1,
        max: 100
    },
    reply_type: {
        type: String,
        enum: ['text', 'media', 'template', 'chatbot'],
        required: true
    },
    reply_id: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
        refPath: 'reply_type_ref'
    },
    reply_type_ref: {
        type: String,
        enum: ['ReplyMaterial', 'Template', 'Chatbot'],
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
    coupon_code: {
        type: String,
        default: null
    },
    carousel_cards_data: {
        type: [mongoose.Schema.Types.Mixed],
        default: []
    },
    carousel_products: {
        type: [mongoose.Schema.Types.Mixed],
        default: []
    },
    location_data: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    auto_like_comment: {
        type: Boolean,
        default: false
    },
    auto_hide_comment: {
        type: Boolean,
        default: false
    },
    auto_reply_text: {
        type: String,
        trim: true
    },
    hide_condition_type: {
        type: String,
        enum: ['keywords', 'chatbot'],
        default: 'keywords'
    },
    hide_keywords: [{
        type: String,
        trim: true
    }],
    hide_chatbot_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chatbot',
        default: null
    },
    requires_following: {
        type: Boolean,
        default: false 
    },
    follow_gate_message: {
        type: String,
        default: 'Please make sure you are following our page to receive the details.'
    },
    follow_gate_button_yes: {
        type: String,
        default: 'I Follow'
    },
    follow_gate_button_no: {
        type: String,
        default: 'Not Now'
    },
    follow_gate_rejection_message: {
        type: String,
        default: "No worries! Whenever you're ready, just follow our page to get the exclusive details."
    },
    delay_seconds: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['active', 'inactive'],
        default: 'active'
    },
    deleted_at: {
        type: Date,
        default: null
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

const SocialAutomation = mongoose.model('SocialAutomation', socialAutomationSchema);

export default SocialAutomation;
