import mongoose from 'mongoose';

const sequenceSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    waba_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WhatsappWaba',
        required: true
    },
    name: {
        type: String,
        required: true,
        trim: true
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
    collection: 'sequences'
});

sequenceSchema.index({ user_id: 1 });
sequenceSchema.index({ waba_id: 1 });
sequenceSchema.index({ deleted_at: 1 });

export default mongoose.model('Sequence', sequenceSchema);
