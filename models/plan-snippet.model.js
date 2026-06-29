import mongoose from 'mongoose';

const planSnippetSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    token: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    plan_ids: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Plan'
    }],
    theme_color: {
        type: String,
        default: '#16a34a',
        trim: true
    },
    title: {
        type: String,
        trim: true,
        default: 'Choose Your Plan'
    },
    description: {
        type: String,
        trim: true,
        default: 'Select a plan that fits your business needs. Simple setup, upgrade anytime.'
    },
    deleted_at: {
        type: Date,
        default: null
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

const PlanSnippet = mongoose.model('PlanSnippet', planSnippetSchema);

export default PlanSnippet;
