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
        required: function() {
            return !['instagram', 'whatsapp', 'telegram', 'facebook', 'ai_calling', 'appointment_booking', 'broadcast_bulk_messages', 'catalog', 'product-catalog', 'whatsapp_forms', 'automation_builder', 'ctwa', 'shared_team_inbox'].includes(this.slug);
        }
    },
    dynamic_content: {
        type: mongoose.Schema.Types.Mixed,
        default: null
    },
    system_reserved: {
        type: Boolean,
        default: false
    },
    color_config: {
        type: mongoose.Schema.Types.Mixed,
        default: null
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
