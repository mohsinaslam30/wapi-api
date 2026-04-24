import mongoose from 'mongoose';

const hourRangeSchema = new mongoose.Schema({
    from: { type: String, required: true },
    to: { type: String, required: true }
}, { _id: false });

const daySchema = new mongoose.Schema({
    status: {
        type: String,
        enum: ['opened', 'closed'],
        default: 'closed'
    },
    hours: {
        type: [hourRangeSchema],
        validate: [
            (val) => val.length <= 2,
            '{PATH} exceeds the limit of 2'
        ]
    }
}, { _id: false });

const workingHoursSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    waba_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WhatsappWaba',
        required: true,
        unique: true
    },
    is_holiday_mode: {
        type: Boolean,
        default: false
    },
    monday: { type: daySchema, default: () => ({}) },
    tuesday: { type: daySchema, default: () => ({}) },
    wednesday: { type: daySchema, default: () => ({}) },
    thursday: { type: daySchema, default: () => ({}) },
    friday: { type: daySchema, default: () => ({}) },
    saturday: { type: daySchema, default: () => ({}) },
    sunday: { type: daySchema, default: () => ({}) }
}, {
    timestamps: true,
    collection: 'working_hours'
});

export default mongoose.model('WorkingHours', workingHoursSchema);
