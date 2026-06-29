import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        description: {
            type: String,
            trim: true
        },

        status: {
            type: String,
            enum: ['active', 'inactive'],
            default: 'active'
        },

        system_reserved: {
            type: Boolean,
            default: false
        },
        
        sort_order: {
            type: Number,
            default: 0,
        },

        deleted_at: {
            type: Date,
            default: null,
            index: true
        }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'roles'
    }
);


export default mongoose.model('Role', roleSchema);