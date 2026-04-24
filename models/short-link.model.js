import mongoose from 'mongoose';
import crypto from 'crypto';

const shortLinkSchema = new mongoose.Schema(
    {
        user_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },

        short_code: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        mobile: {
            type: String,
            required: true,
            trim: true
        },

        first_message: {
            type: String,
            default: '',
            trim: true
        },

        click_count: {
            type: Number,
            default: 0
        },

        deleted_at: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
        collection: 'short_links'
    }
);

shortLinkSchema.statics.generateUniqueCode = async function (length = 12) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code;
    let exists = true;
    while (exists) {
        code = '';
        const bytes = crypto.randomBytes(length);
        for (let i = 0; i < length; i++) {
            code += chars[bytes[i] % chars.length];
        }
        exists = await this.findOne({ short_code: code }).lean();
    }
    return code;
};

export default mongoose.model('ShortLink', shortLinkSchema);
