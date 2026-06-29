import mongoose from 'mongoose';
import { WabaConfiguration, ReplyMaterial, Template, EcommerceCatalog, Chatbot, Sequence, AppointmentConfig } from '../models/index.js';


export const getWabaConfiguration = async (req, res) => {
    try {
        const { waba_id } = req.params;

        if (!waba_id) {
            return res.status(400).json({ success: false, message: 'waba_id is required' });
        }

        let config = await WabaConfiguration.findOne({ waba_id }).lean();

        if (!config) {
            const newConfig = await WabaConfiguration.create({ waba_id });
            return res.status(200).json({
                success: true,
                data: newConfig
            });
        }

        const fieldsToPopulate = [
            'out_of_working_hours',
            'welcome_message',
            'delayed_reply',
            'fallback_message',
            'reengagement_message'
        ];

        for (const field of fieldsToPopulate) {
            if (config[field] && config[field].id && config[field].type) {
                let modelName = config[field].type;
                if (modelName === 'chatbot') modelName = 'Chatbot';
                if (modelName === 'appointment_config' || modelName === 'AppointmentConfig' || modelName === 'appointment') modelName = 'AppointmentConfig';
                const model = mongoose.models[modelName];
                if (model) {
                    const materialData = await model.findOne({ _id: config[field].id, deleted_at: null }).lean();
                    if (materialData) {
                        const idString = config[field].id.toString();
                        config[field].id = idString;
                        config[field].resource = materialData;
                    }
                }
            }
        }

        return res.status(200).json({
            success: true,
            data: config
        });
    } catch (error) {
        console.error('Error fetching WABA configuration:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch WABA configuration', error: error.message });
    }
};

export const updateWabaConfiguration = async (req, res) => {
    try {
        const { waba_id } = req.params;
        const updateData = req.body;

        if (!waba_id) {
            return res.status(400).json({ success: false, message: 'waba_id is required' });
        }

        let config = await WabaConfiguration.findOne({ waba_id });
        if (!config) {
            config = new WabaConfiguration({ waba_id });
        }

        const fieldsToValidate = [
            'out_of_working_hours',
            'welcome_message',
            'delayed_reply',
            'fallback_message',
            'reengagement_message'
        ];

        for (const field of fieldsToValidate) {
            if (updateData[field] && updateData[field].id) {
                const materialId = updateData[field].id;
                const materialType = updateData[field].type;


                let material;
                const materialQuery = { _id: materialId, deleted_at: null };
                const userId = req.user ? req.user.owner_id : null;

                const baseQuery = userId ? { _id: materialId, user_id: userId, deleted_at: null } : { _id: materialId, deleted_at: null };

                if (materialType === 'ReplyMaterial') {
                    material = await ReplyMaterial.findOne({ ...baseQuery, $or: [{ waba_id }, { waba_id: null }] });
                } else if (materialType === 'Template') {
                    material = await Template.findOne({ 
                        _id: materialId, 
                        $or: [
                            { waba_id, status: 'approved' }, 
                            { waba_id: null },
                            { is_admin_template: true },
                            { platform: { $ne: 'whatsapp' } }
                        ] 
                    });
                } else if (materialType === 'EcommerceCatalog') {
                    material = await EcommerceCatalog.findOne({ ...baseQuery, $or: [{ waba_id }, { waba_id: null }] });
                } else if (materialType === 'chatbot') {
                    material = await Chatbot.findOne(baseQuery);
                } else if (materialType === 'Sequence') {
                    material = await Sequence.findOne({ ...baseQuery, $or: [{ waba_id }, { waba_id: null }, { platform: { $ne: 'whatsapp' } }] });
                } else if (materialType === 'AppointmentConfig' || materialType === 'appointment_config' || materialType === 'appointment') {
                    material = await AppointmentConfig.findOne({ 
                        ...baseQuery,
                        $or: [{ waba_id: waba_id }, { waba_id: config._id }, { waba_id: null }]
                    });
                } else {
                    return res.status(400).json({ success: false, message: `Invalid material type for ${field}` });
                }

                if (!material) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid ${materialType} ID for ${field} or it doesn't belong to this account/channel`
                    });
                }
            }
        }

        fieldsToValidate.forEach(field => {
            if (updateData[field] !== undefined) {
                if (updateData[field] === null || (updateData[field] && updateData[field].id === null)) {
                    config[field] = updateData[field];
                } else {
                    const existing = config[field] && typeof config[field].toObject === 'function'
                        ? config[field].toObject()
                        : (config[field] || {});
                    config[field] = { ...existing, ...updateData[field] };
                }
            }
        });

        if (updateData.round_robin_assignment !== undefined) {
            config.round_robin_assignment = updateData.round_robin_assignment;
        }

        await config.save();

        let populatedConfig = config.toObject();
        const fieldsToPopulate = [
            'out_of_working_hours',
            'welcome_message',
            'delayed_reply',
            'fallback_message',
            'reengagement_message'
        ];

        for (const field of fieldsToPopulate) {
            if (populatedConfig[field] && populatedConfig[field].id && populatedConfig[field].type) {
                let modelName = populatedConfig[field].type;
                if (modelName === 'chatbot') modelName = 'Chatbot';
                if (modelName === 'appointment_config' || modelName === 'AppointmentConfig' || modelName === 'appointment') modelName = 'AppointmentConfig';
                const model = mongoose.models[modelName];
                if (model) {
                    const materialData = await model.findOne({ _id: populatedConfig[field].id, deleted_at: null }).lean();
                    if (materialData) {
                        const idString = populatedConfig[field].id.toString();
                        populatedConfig[field].id = idString;
                        populatedConfig[field].resource = materialData;
                    }
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: 'WABA configuration updated successfully',
            data: populatedConfig
        });
    } catch (error) {
        console.error('Error updating WABA configuration:', error);
        return res.status(500).json({ success: false, message: 'Failed to update WABA configuration', error: error.message });
    }
};

export default {
    getWabaConfiguration,
    updateWabaConfiguration
};
