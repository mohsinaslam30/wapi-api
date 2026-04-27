import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    plan_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plan',
        required: true
    },
    status: {
        type: String,
        enum: ['active', 'trial', 'expired', 'cancelled', 'suspended', 'pending'],
        default: 'trial'
    },
    started_at: {
        type: Date,
        required: true,
        default: Date.now
    },
    trial_ends_at: {
        type: Date,
        default: null
    },
    current_period_start: {
        type: Date,
        required: true,
        default: Date.now
    },
    current_period_end: {
        type: Date
    },
    expires_at: {
        type: Date,
        default: null
    },
    cancelled_at: {
        type: Date,
        default: null
    },
    cancels_at: {
        type: Date,
        default: null
    },
    payment_gateway: {
        type: String,
        enum: ['stripe', 'razorpay', 'paypal', 'manual', 'free', 'admin generated'],
        default: null
    },
    payment_method: {
        type: String,
        enum: ['card', 'upi', 'netbanking', 'wallet', 'manual', 'free', 'cash', 'bank_transfer', 'paypal'],
        default: null
    },
    payment_status: {
        type: String,
        enum: ['pending', 'paid', 'failed', 'refunded'],
        default: 'pending'
    },
    transaction_id: {
        type: String,
        default: null
    },
    payment_reference: {
        type: String,
        default: null
    },
    transaction_receipt: {
        type: String,
        default: null
    },
    manual_payment_type: {
        type: String,
        enum: ['cash', 'bank_transfer'],
        default: null
    },
    bank_account_no: { type: String, default: null },
    bank_name: { type: String, default: null },
    bank_holder_name: { type: String, default: null },
    bank_swift_code: { type: String, default: null },
    bank_routing_number: { type: String, default: null },
    bank_ifsc_no: { type: String, default: null },
    approved_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    approved_at: {
        type: Date,
        default: null
    },
    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    amount_paid: {
        type: Number,
        default: 0
    },
    currency: {
        type: String,
        default: 'INR'
    },
    usage: {
        contacts_used: {
            type: Number,
            default: 0
        },
        template_bots_used: {
            type: Number,
            default: 0
        },
        message_bots_used: {
            type: Number,
            default: 0
        },
        campaigns_used: {
            type: Number,
            default: 0
        },
        ai_prompts_used: {
            type: Number,
            default: 0
        },
        canned_replies_used: {
            type: Number,
            default: 0
        },
        staff_used: {
            type: Number,
            default: 0
        },
        conversations_used: {
            type: Number,
            default: 0
        },
        bot_flow_used: {
            type: Number,
            default: 0
        },
        broadcast_messages_used: {
            type: Number,
            default: 0
        },
        facebookAds_campaign_used: {
            type: Number,
            default: 0
        },
        kanban_funnels_used: {
            type: Number,
            default: 0
        },
        segments_used: {
            type: Number,
            default: 0
        }
    },
    auto_renew: {
        type: Boolean,
        default: true
    },
    notes: {
        type: String,
        default: null
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    stripe_subscription_id: {
        type: String,
        default: null
    },
    stripe_customer_id: {
        type: String,
        default: null
    },
    razorpay_subscription_id: {
        type: String,
        default: null
    },
    razorpay_customer_id: {
        type: String,
        default: null
    },
    paypal_subscription_id: {
        type: String,
        default: null
    },
    paypal_customer_id: {
        type: String,
        default: null
    },
    taxes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Tax'
    }],
    deleted_at: {
        type: Date,
        default: null
    },
    features: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    is_custom: {
        type: Boolean,
        default: false
    },
    overridden_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    duration: {
        type: Number,
        default: 1,
        min: 1
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'subscriptions'
});

subscriptionSchema.index({ user_id: 1, status: 1 });
subscriptionSchema.index({ plan_id: 1 });
subscriptionSchema.index({ status: 1 });
subscriptionSchema.index({ current_period_end: 1 });
subscriptionSchema.index({ deleted_at: 1 });

subscriptionSchema.query.active = function () {
    return this.where({
        deleted_at: null,
        status: { $in: ['active', 'trial'] }
    });
};

subscriptionSchema.methods.isActive = function () {
    return ['active', 'trial'].includes(this.status) &&
        new Date() <= this.current_period_end;
};

subscriptionSchema.methods.isExpired = function () {
    return new Date() > this.current_period_end;
};

subscriptionSchema.methods.getFeatureLimit = function (feature, planFeatures) {
    if (this.features && this.features[feature] !== undefined) {
        return this.features[feature];
    }
    return planFeatures[feature];
};

subscriptionSchema.methods.canUseFeature = function (feature, planFeatures) {
    const limit = this.getFeatureLimit(feature, planFeatures);
    const used = this.usage[`${feature}_used`] || 0;

    if (limit === 0 || limit === true) return true;
    if (limit === false) return false;

    return used < limit;
};

subscriptionSchema.methods.incrementUsage = function (feature) {
    const key = `usage.${feature}_used`;
    this.set(key, (this.usage[`${feature}_used`] || 0) + 1);
    return this.save();
};

export default mongoose.model('Subscription', subscriptionSchema);
