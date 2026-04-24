import { Tax } from '../models/index.js';
import mongoose from 'mongoose';

const validateTaxData = (taxData) => {
    const errors = [];

    if (!taxData.name || !taxData.name.trim()) {
        errors.push('Tax name is required');
    }

    if (taxData.rate === undefined || taxData.rate === null) {
        errors.push('Tax rate is required');
    } else if (isNaN(taxData.rate) || taxData.rate < 0) {
        errors.push('Tax rate must be a non-negative number');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

export const createTax = async (req, res) => {
    try {
        const taxData = req.body;
        const validation = validateTaxData(taxData);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Tax validation failed',
                errors: validation.errors
            });
        }

        const tax = await Tax.create({
            name: taxData.name.trim(),
            rate: taxData.rate,
            type: taxData.type || 'percentage',
            description: taxData.description || null,
            is_active: taxData.is_active !== undefined ? taxData.is_active : true
        });

        return res.status(201).json({
            success: true,
            message: 'Tax created successfully',
            data: tax
        });
    } catch (error) {
        console.error('Error creating tax:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create tax',
            error: error.message
        });
    }
};

export const getTaxes = async (req, res) => {
    try {
        const { search, is_active } = req.query;
        const query = { deleted_at: null };

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        if (is_active !== undefined) {
            query.is_active = is_active === 'true';
        }

        const taxes = await Tax.find(query).sort({ created_at: -1 }).lean();
        const total = await Tax.countDocuments(query);

        return res.status(200).json({
            success: true,
            data: {
                taxes,
                total
            }
        });
    } catch (error) {
        console.error('Error fetching taxes:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch taxes',
            error: error.message
        });
    }
};

export const getTaxById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid tax ID' });
        }

        const tax = await Tax.findOne({ _id: id, deleted_at: null });
        if (!tax) {
            return res.status(404).json({ success: false, message: 'Tax not found' });
        }

        return res.status(200).json({ success: true, data: tax });
    } catch (error) {
        console.error('Error fetching tax:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch tax', error: error.message });
    }
};

export const updateTax = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid tax ID' });
        }

        const tax = await Tax.findOne({ _id: id, deleted_at: null });
        if (!tax) {
            return res.status(404).json({ success: false, message: 'Tax not found' });
        }

        if (updateData.name !== undefined) tax.name = updateData.name.trim();
        if (updateData.rate !== undefined) tax.rate = updateData.rate;
        if (updateData.type !== undefined) tax.type = updateData.type;
        if (updateData.description !== undefined) tax.description = updateData.description;
        if (updateData.is_active !== undefined) tax.is_active = updateData.is_active;

        await tax.save();

        return res.status(200).json({
            success: true,
            message: 'Tax updated successfully',
            data: tax
        });
    } catch (error) {
        console.error('Error updating tax:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update tax',
            error: error.message
        });
    }
};

export const deleteTax = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid tax ID' });
        }

        const tax = await Tax.findOne({ _id: id, deleted_at: null });
        if (!tax) {
            return res.status(404).json({ success: false, message: 'Tax not found' });
        }

        tax.deleted_at = new Date();
        await tax.save();

        return res.status(200).json({
            success: true,
            message: 'Tax deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting tax:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete tax',
            error: error.message
        });
    }
};

export const bulkDeleteTaxes = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Tax IDs array is required and must not be empty'
            });
        }

        const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid tax IDs provided'
            });
        }

        const result = await Tax.updateMany(
            { _id: { $in: validIds }, deleted_at: null },
            { $set: { deleted_at: new Date() } }
        );

        return res.status(200).json({
            success: true,
            message: `${result.modifiedCount} tax(s) deleted successfully`,
            data: {
                deletedCount: result.modifiedCount,
                deletedIds: validIds
            }
        });
    } catch (error) {
        console.error('Bulk delete taxes error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete taxes',
            error: error.message
        });
    }
};

export default {
    createTax,
    getTaxes,
    getTaxById,
    updateTax,
    deleteTax,
    bulkDeleteTaxes
};
