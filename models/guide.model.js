import mongoose from 'mongoose';

const sectionSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },

    content: {
        type: String,
        required: true
    },

    images: [
        {
            url: {
                type: String,
                required: true
            },
            caption: {
                type: String,
                default: ''
            }
        }
    ]
}, { _id: true });


const guideSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },

    category: {
        type: String,
        required: true,
        trim: true
    },

    sub_title: {
        type: String,
        default: ''
    },

    slug: {
        type: String,
        required: true,
        lowercase: true,
        trim: true
    },

    description: {
        type: String,
        default: ''
    },

    order: {
        type: Number,
        default: 0
    },

    position: {
        type: Number,
        default: 0
    },

    sections: [sectionSchema],

    status: {
        type: Boolean,
        default: true
    },

    created_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },

    updated_by: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }

}, {
    timestamps: true
});

export default mongoose.model('Guide', guideSchema);
