import mongoose from 'mongoose';

const rolePerSchema = new mongoose.Schema({
    role_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Role',
        required: true,
        index: true
    },
    permission_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Permission',
        required: true,
        index: true
    },
}, {
    timestamps: true,
    collection: 'role_permissions'
});


export default mongoose.model('RolePermission', rolePerSchema);
