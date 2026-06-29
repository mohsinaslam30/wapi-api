import mongoose from 'mongoose';
import { ImportJob } from '../models/index.js';

export const getImportJobs = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
   

        const {
            page = 1,
            limit = 10,
            sort_by = 'created_at',
            sort_order = 'desc',
            status,
            search
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOrder = sort_order === 'asc' ? 1 : -1;

        const query = {
            user_id: userId,
            deleted_at: null,
        };

        if (status) {
            query.status = status;
        }

        if (search) {
            query.original_filename = { $regex: search, $options: 'i' };
        }

        const importJobs = await ImportJob.find(query)
            .sort({ [sort_by]: sortOrder })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await ImportJob.countDocuments(query);

        return res.status(200).json({
            success: true,
            data: {
                import_jobs: importJobs,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalItems: total,
                    itemsPerPage: parseInt(limit),
                },
            },
        });
    } catch (error) {
        console.error('Error fetching import jobs:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch import jobs',
            error: error.message,
        });
    }
};

export const getImportJobById = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
    

        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid import job ID' });
        }

        const importJob = await ImportJob.findOne({ _id: id, user_id: userId, deleted_at: null }).lean();
        if (!importJob) {
            return res.status(404).json({ success: false, message: 'Import job not found' });
        }

        return res.status(200).json({
            success: true,
            data: importJob,
        });
    } catch (error) {
        console.error('Error fetching import job:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch import job',
            error: error.message,
        });
    }
};

function validateAndFilterIds(ids) {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return { isValid: false, message: 'ids must be a non-empty array' };
    }
    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
        return { isValid: false, message: 'No valid IDs provided' };
    }
    return { isValid: true, validIds };
}

export const bulkDeleteImportJobs = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
    
        const { ids } = req.body;
        const validation = validateAndFilterIds(ids);
        if (!validation.isValid) {
            return res.status(400).json({ success: false, message: validation.message });
        }

        const { validIds } = validation;

        const existing = await ImportJob.find({
            _id: { $in: validIds },
            user_id: userId,
            deleted_at: null,
        }).select('_id');

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No import jobs found with the provided IDs',
            });
        }

        const foundIds = existing.map((s) => s._id.toString());
        const notFoundIds = validIds.filter((id) => !foundIds.includes(id.toString()));

        const result = await ImportJob.updateMany(
            { _id: { $in: foundIds } },
            { $set: { deleted_at: new Date() } }
        );

        const response = {
            success: true,
            message: `${result.modifiedCount} import job(s) deleted successfully`,
            data: {
                deletedCount: result.modifiedCount,
                deletedIds: foundIds,
            },
        };

        if (notFoundIds.length > 0) {
            response.data.notFoundIds = notFoundIds;
            response.message += `, ${notFoundIds.length} import job(s) not found`;
        }

        return res.status(200).json(response);
    } catch (error) {
        console.error('Error bulk deleting import jobs:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete import jobs',
            error: error.message,
        });
    }
};

export default {
    getImportJobs,
    getImportJobById,
    bulkDeleteImportJobs,
};
