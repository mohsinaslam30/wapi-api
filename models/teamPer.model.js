import mongoose from 'mongoose';

const teamPerSchema = new mongoose.Schema({
    team_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
        required: true,
        index: true
    },
    permission_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Permission',
        required: true,
        index: true
    }
}, {
    timestamps: true,
    collection: 'team_permissions'
});


export default mongoose.model('TeamPermission', teamPerSchema);
