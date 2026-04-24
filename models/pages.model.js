import mongoose from 'mongoose';

const pageSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    slug: {
        type: String,
        required: true,
        trim: true
    },
    content: {
        type: String,
        required: true
    },
    meta_title: {
        type: String,
        trim: true,
        default: null
    },
    meta_description: {
        type: String,
        trim: true,
        default: null
    },
    meta_image: {
        type: String,
        default: null
    },
    status: {
        type: Boolean,
        default: true
    },
    sort_order: {
        type: Number,
        default: 0
    },
    deleted_at: {
        type: Date,
        default: null
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'pages'
});

pageSchema.index({ slug: 1 }, { unique: true });

const Page = mongoose.model('Page', pageSchema);

export default Page;
