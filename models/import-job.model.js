import mongoose from 'mongoose';

const importJobSchema = new mongoose.Schema(
    {
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        original_filename: {
            type: String,
            required: true,
            trim: true
        },
        total_records: {
            type: Number,
            default: 0
        },
        processed_count: {
            type: Number,
            default: 0
        },
        error_count: {
            type: Number,
            default: 0
        },
        error_logs: {
            type: Array,
            default: []
        },
        status: {
            type: String,
            enum: ['pending', 'processing', 'completed', 'failed'],
            default: 'pending'
        },
        deleted_at: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'import_jobs'
    }
);

importJobSchema.index({ user_id: 1, created_at: -1 });
importJobSchema.index({ status: 1 });
importJobSchema.index({ deleted_at: 1 });

export default mongoose.model('ImportJob', importJobSchema);
