import mongoose from 'mongoose';

const permissionSchema =
    new mongoose.Schema({
        name: {
            type: String,
            required: true,
            trim: true
        },
        slug: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        description: {
            type: String,
            trim: true
        }
    }, { timestamps: true, collection: 'permissions' });


export default mongoose.model('Permission', permissionSchema);
