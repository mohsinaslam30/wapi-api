import mongoose from 'mongoose';

const planSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    description: {
        type: String,
        default: null
    },
    price: {
        type: Number,
        required: true,
        default: 0
    },
    currency: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Currency',
        required: true
    },
    billing_cycle: {
        type: String,
        enum: ['free Trial', 'monthly', 'yearly', 'lifetime'],
        required: true
    },
    trial_days: {
        type: Number,
        default: 0
    },
    is_featured: {
        type: Boolean,
        default: false
    },
    is_active: {
        type: Boolean,
        default: true
    },
    sort_order: {
        type: Number,
        default: 0
    },
    stripe_price_id: {
        type: String,
        default: null
    },
    stripe_product_id: {
        type: String,
        default: null
    },
    stripe_payment_link_id: {
        type: String,
        default: null
    },
    stripe_payment_link_url: {
        type: String,
        default: null
    },
    razorpay_plan_id: {
        type: String,
        default: null
    },
    paypal_plan_id: {
        type: String,
        default: null
    },
    features: {
        contacts: {
            type: Number,
            default: 0
        },
        template_bots: {
            type: Number,
            default: 0
        },
        message_bots: {
            type: Number,
            default: 0
        },
        campaigns: {
            type: Number,
            default: 0
        },
        ai_prompts: {
            type: Number,
            default: 0
        },
        staff: {
            type: Number,
            default: 1
        },
        conversations: {
            type: Number,
            default: 0
        },
        bot_flow: {
            type: Number,
            default: 0
        },
        rest_api: {
            type: Boolean,
            default: true
        },
        whatsapp_webhook: {
            type: Boolean,
            default: true
        },
        auto_replies: {
            type: Boolean,
            default: false
        },
        analytics: {
            type: Boolean,
            default: false
        },
        priority_support: {
            type: Boolean,
            default: false
        },
        custom_fields: {
            type: Number,
            default: 0
        },
        tags: {
            type: Number,
            default: 0
        },
        teams: {
            type: Number,
            default: 0
        },
        forms: {
            type: Number,
            default: 0
        },
        whatsapp_calling: {
            type: Number,
            default: 0
        },
        appointment_bookings: {
            type: Number,
            default: 0
        },
        facebookAds_campaign: {
            type: Number,
            default: 0
        },
        kanban_funnels: {
            type: Number,
            default: 0
        },
        segments: {
            type: Number,
            default: 0
        }
    },
    taxes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tax'
    }],
    deleted_at: {
        type: Date,
        default: null
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'plans'
});

// planSchema.index({ slug: 1 });
planSchema.index({ is_active: 1 });
planSchema.index({ deleted_at: 1 });

planSchema.query.active = function () {
    return this.where({ deleted_at: null, is_active: true });
};

export default mongoose.model('Plan', planSchema);
