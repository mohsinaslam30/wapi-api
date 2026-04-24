import mongoose from 'mongoose';

const paymentHistorySchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    subscription_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
        required: true
    },
    plan_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plan',
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    currency: {
        type: String,
        default: 'INR'
    },
    payment_method: {
        type: String,
        enum: ['card', 'upi', 'netbanking', 'wallet', 'manual', 'free', 'paypal'],
        required: true
    },
    payment_status: {
        type: String,
        enum: ['pending', 'success', 'failed', 'refunded'],
        default: 'pending'
    },
    transaction_id: {
        type: String,
        default: null
    },
    payment_gateway: {
        type: String,
        enum: ['stripe', 'razorpay', 'paypal', 'manual', 'free', 'admin generated'],
        default: null
    },
    payment_response: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    invoice_number: {
        type: String,
        default: null
    },
    invoice_url: {
        type: String,
        default: null
    },
    paid_at: {
        type: Date,
        default: null
    },
    refunded_at: {
        type: Date,
        default: null
    },
    notes: {
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
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'payment_history'
});

paymentHistorySchema.index({ user_id: 1, created_at: -1 });
paymentHistorySchema.index({ subscription_id: 1 });
paymentHistorySchema.index({ payment_status: 1 });
paymentHistorySchema.index({ deleted_at: 1 });

export const PaymentHistory = mongoose.model('PaymentHistory', paymentHistorySchema);
