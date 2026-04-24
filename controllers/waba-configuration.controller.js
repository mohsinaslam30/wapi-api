import { WabaConfiguration, ReplyMaterial, Template, EcommerceCatalog, Chatbot, Sequence } from '../models/index.js';


export const getWabaConfiguration = async (req, res) => {
    try {
        const { waba_id } = req.params;

        if (!waba_id) {
            return res.status(400).json({ success: false, message: 'waba_id is required' });
        }

        let config = await WabaConfiguration.findOne({ waba_id });

        if (!config) {
            config = await WabaConfiguration.create({ waba_id });
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
                const materialQuery = { _id: materialId, waba_id, deleted_at: null };

                if (materialType === 'ReplyMaterial') {
                    material = await ReplyMaterial.findOne(materialQuery);
                } else if (materialType === 'Template') {
                    material = await Template.findOne({ _id: materialId, waba_id, status: 'approved' });
                } else if (materialType === 'EcommerceCatalog') {
                    material = await EcommerceCatalog.findOne(materialQuery);
                } else if (materialType === 'chatbot') {
                    material = await Chatbot.findOne(materialQuery);
                } else if (materialType === 'Sequence') {
                    material = await Sequence.findOne(materialQuery);
                } else {
                    return res.status(400).json({ success: false, message: `Invalid material type for ${field}` });
                }

                if (!material) {
                    return res.status(400).json({
                        success: false,
                        message: `Invalid ${materialType} ID for ${field} or it doesn't belong to this WABA account`
                    });
                }
            }
        }

        fieldsToValidate.forEach(field => {
            if (updateData[field] !== undefined) {
                config[field] = { ...config[field], ...updateData[field] };
            }
        });

        if (updateData.round_robin_assignment !== undefined) {
            config.round_robin_assignment = updateData.round_robin_assignment;
        }

        await config.save();

        return res.status(200).json({
            success: true,
            message: 'WABA configuration updated successfully',
            data: config
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
