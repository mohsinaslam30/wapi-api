import { Sequence, SequenceStep, ReplyMaterial, Template, EcommerceCatalog } from '../models/index.js';


export const createSequence = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { waba_id, name } = req.body;

        if (!waba_id || !name) {
            return res.status(400).json({ success: false, message: 'waba_id and name are required' });
        }

        const sequence = await Sequence.create({
            user_id: userId,
            waba_id,
            name
        });

        return res.status(201).json({
            success: true,
            message: 'Sequence created successfully',
            data: sequence
        });
    } catch (error) {
        console.error('Error creating sequence:', error);
        return res.status(500).json({ success: false, message: 'Failed to create sequence', error: error.message });
    }
};

export const getSequences = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { waba_id } = req.query;

        if (!waba_id) {
            return res.status(400).json({ success: false, message: 'waba_id is required' });
        }

        const sequences = await Sequence.find({
            user_id: userId,
            waba_id,
            deleted_at: null
        }).sort({ created_at: -1 });

        return res.status(200).json({ success: true, data: sequences });
    } catch (error) {
        console.error('Error fetching sequences:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch sequences', error: error.message });
    }
};

export const getSequenceById = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { id } = req.params;

        const sequence = await Sequence.findOne({
            _id: id,
            user_id: userId,
            deleted_at: null
        });

        if (!sequence) {
            return res.status(404).json({ success: false, message: 'Sequence not found' });
        }

        const steps = await SequenceStep.find({
            sequence_id: id,
            deleted_at: null
        }).sort({ sort: 1 }).populate('reply_material_id');

        return res.status(200).json({
            success: true,
            data: {
                ...sequence.toObject(),
                steps
            }
        });
    } catch (error) {
        console.error('Error fetching sequence details:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch sequence details', error: error.message });
    }
};

export const updateSequence = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { id } = req.params;
        const { name, is_active } = req.body;

        const sequence = await Sequence.findOne({
            _id: id,
            user_id: userId,
            deleted_at: null
        });

        if (!sequence) {
            return res.status(404).json({ success: false, message: 'Sequence not found' });
        }

        if (name !== undefined) sequence.name = name;
        if (is_active !== undefined) sequence.is_active = is_active;

        await sequence.save();

        return res.status(200).json({
            success: true,
            message: 'Sequence updated successfully',
            data: sequence
        });
    } catch (error) {
        console.error('Error updating sequence:', error);
        return res.status(500).json({ success: false, message: 'Failed to update sequence', error: error.message });
    }
};

export const deleteSequence = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { id } = req.params;

        const sequence = await Sequence.findOne({
            _id: id,
            user_id: userId,
            deleted_at: null
        });

        if (!sequence) {
            return res.status(404).json({ success: false, message: 'Sequence not found' });
        }

        sequence.deleted_at = new Date();
        await sequence.save();

        await SequenceStep.updateMany(
            { sequence_id: id },
            { $set: { deleted_at: new Date() } }
        );

        return res.status(200).json({ success: true, message: 'Sequence deleted successfully' });
    } catch (error) {
        console.error('Error deleting sequence:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete sequence', error: error.message });
    }
};


export const createSequenceStep = async (req, res) => {
    try {
        const {
            sequence_id,
            reply_material_id,
            reply_material_type,
            delay_value,
            delay_unit,
            send_anytime,
            from_time,
            to_time,
            send_days,
            sort,
            variables_mapping,
            media_url,
            carousel_cards_data,
            coupon_code,
            catalog_id,
            product_retailer_id
        } = req.body;

        if (!sequence_id || !reply_material_id || !reply_material_type) {
            return res.status(400).json({
                success: false,
                message: 'sequence_id, reply_material_id, and reply_material_type are required'
            });
        }

        const sequence = await Sequence.findOne({ _id: sequence_id, deleted_at: null });
        if (!sequence) {
            return res.status(404).json({ success: false, message: 'Sequence not found' });
        }

        let material;
        const materialQuery = { _id: reply_material_id, waba_id: sequence.waba_id, deleted_at: null };

        if (reply_material_type === 'ReplyMaterial') {
            material = await ReplyMaterial.findOne(materialQuery);
        } else if (reply_material_type === 'Template') {
            material = await Template.findOne({ _id: reply_material_id, waba_id: sequence.waba_id, status: 'approved' });
        } else if (reply_material_type === 'EcommerceCatalog') {
            material = await EcommerceCatalog.findOne(materialQuery);
        } else {
            return res.status(400).json({ success: false, message: 'Invalid reply_material_type' });
        }

        if (!material) {
            return res.status(400).json({
                success: false,
                message: `Invalid ${reply_material_type} ID or it doesn't belong to this WABA account`
            });
        }

        const step = await SequenceStep.create({
            sequence_id,
            reply_material_id,
            reply_material_type,
            delay_value,
            delay_unit,
            send_anytime,
            from_time,
            to_time,
            send_days,
            sort,
            variables_mapping,
            media_url,
            carousel_cards_data,
            coupon_code,
            catalog_id,
            product_retailer_id
        });

        return res.status(201).json({
            success: true,
            message: 'Sequence step created successfully',
            data: step
        });
    } catch (error) {
        console.error('Error creating sequence step:', error);
        return res.status(500).json({ success: false, message: 'Failed to create sequence step', error: error.message });
    }
};

export const updateSequenceStep = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        const step = await SequenceStep.findOne({ _id: id, deleted_at: null });
        if (!step) {
            return res.status(404).json({ success: false, message: 'Sequence step not found' });
        }

        if (updateData.reply_material_id || updateData.reply_material_type) {
            const sequence_id = updateData.sequence_id || step.sequence_id;
            const sequence = await Sequence.findOne({ _id: sequence_id, deleted_at: null });
            if (!sequence) {
                return res.status(404).json({ success: false, message: 'Sequence not found' });
            }

            const materialId = updateData.reply_material_id || step.reply_material_id;
            const materialType = updateData.reply_material_type || step.reply_material_type;

            let material;
            const materialQuery = { _id: materialId, waba_id: sequence.waba_id, deleted_at: null };

            if (materialType === 'ReplyMaterial') {
                material = await ReplyMaterial.findOne(materialQuery);
            } else if (materialType === 'Template') {
                material = await Template.findOne({ _id: materialId, waba_id: sequence.waba_id, status: 'approved' });
            } else if (materialType === 'EcommerceCatalog') {
                material = await EcommerceCatalog.findOne(materialQuery);
            } else {
                return res.status(400).json({ success: false, message: 'Invalid reply_material_type' });
            }

            if (!material) {
                return res.status(400).json({
                    success: false,
                    message: `Invalid ${materialType} ID or it doesn't belong to this WABA account`
                });
            }
        }

        const allowedUpdates = [
            'reply_material_id', 'reply_material_type', 'is_active',
            'delay_value', 'delay_unit', 'send_anytime',
            'from_time', 'to_time', 'send_days', 'sort',
            'variables_mapping', 'media_url', 'carousel_cards_data',
            'coupon_code', 'catalog_id', 'product_retailer_id'
        ];

        allowedUpdates.forEach(key => {
            if (updateData[key] !== undefined) {
                step[key] = updateData[key];
            }
        });

        await step.save();

        return res.status(200).json({
            success: true,
            message: 'Sequence step updated successfully',
            data: step
        });
    } catch (error) {
        console.error('Error updating sequence step:', error);
        return res.status(500).json({ success: false, message: 'Failed to update sequence step', error: error.message });
    }
};

export const deleteSequenceStep = async (req, res) => {
    try {
        const { id } = req.params;

        const step = await SequenceStep.findOne({ _id: id, deleted_at: null });
        if (!step) {
            return res.status(404).json({ success: false, message: 'Sequence step not found' });
        }

        step.deleted_at = new Date();
        await step.save();

        return res.status(200).json({ success: true, message: 'Sequence step deleted successfully' });
    } catch (error) {
        console.error('Error deleting sequence step:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete sequence step', error: error.message });
    }
};

export const reorderSequenceSteps = async (req, res) => {
    try {
        const { steps } = req.body;

        if (!steps || !Array.isArray(steps)) {
            return res.status(400).json({ success: false, message: 'steps array is required' });
        }

        const bulkOps = steps.map(step => ({
            updateOne: {
                filter: { _id: step.id },
                update: { $set: { sort: step.sort } }
            }
        }));

        await SequenceStep.bulkWrite(bulkOps);

        return res.status(200).json({ success: true, message: 'Steps reordered successfully' });
    } catch (error) {
        console.error('Error reordering sequence steps:', error);
        return res.status(500).json({ success: false, message: 'Failed to reorder sequence steps', error: error.message });
    }
};

export default {
    createSequence,
    getSequences,
    getSequenceById,
    updateSequence,
    deleteSequence,
    createSequenceStep,
    updateSequenceStep,
    deleteSequenceStep,
    reorderSequenceSteps
};
