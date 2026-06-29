import mongoose from 'mongoose';

const whatsappCallSettingSchema = new mongoose.Schema({
    user_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    phone_number_id: {
        type: String,
        required: true,
        unique: true
    },
    calling_status: {
        type: String,
        enum: ['ENABLED', 'DISABLED'],
        default: 'ENABLED'
    },
    call_icon_visibility: {
        type: String,
        enum: ['DEFAULT', 'DISABLE_ALL'],
        default: 'DEFAULT'
    },
    call_icons: {
        restrict_to_user_countries: [String]
    },
    call_hours: {
        status: { type: String, enum: ['ENABLED', 'DISABLED'], default: 'DISABLED' },
        timezone_id: { type: String, default: 'UTC' },
        weekly_operating_hours: [
            {
                day_of_week: { type: String, enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'] },
                open_time: String,
                close_time: String
            }
        ],
        holiday_schedule: [
            {
                date: String,
                start_time: String,
                end_time: String
            }
        ]
    },
    sip_config: {
        status: { type: String, enum: ['ENABLED', 'DISABLED'], default: 'DISABLED' },
        servers: [
            {
                hostname: String,
                port: Number,
                request_uri_user_params: {
                    type: Map,
                    of: String
                }
            }
        ]
    },
    fallback_agent_id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'WhatsappCallAgent',
        default: null
    },
    deleted_at: {
        type: Date,
        default: null
    }
}, {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'whatsapp_call_settings'
});

whatsappCallSettingSchema.index({ phone_number_id: 1, deleted_at: 1 });
whatsappCallSettingSchema.index({ user_id: 1 });

export default mongoose.model('WhatsappCallSetting', whatsappCallSettingSchema);
