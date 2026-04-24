import mongoose from 'mongoose';

const taxSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    rate: {
        type: Number,
        required: true,
        min: 0
    },
    type: {
        type: String,
        enum: ['percentage' , 'fixed'],
        default: 'percentage'
    },
    description: {
        type: String,
        default: null
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
    collection: 'taxes'
});

taxSchema.index({ is_active: 1 });
taxSchema.index({ deleted_at: 1 });

taxSchema.query.active = function () {
    return this.where({ deleted_at: null, is_active: true });
};

export default mongoose.model('Tax', taxSchema);
