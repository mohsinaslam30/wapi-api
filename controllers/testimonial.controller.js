import { Testimonial } from '../models/index.js';
import mongoose from 'mongoose';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const DEFAULT_SORT_FIELD = 'created_at';
const DEFAULT_SORT_ORDER = -1;
const MAX_LIMIT = 100;

const ALLOWED_SORT_FIELDS = [
    '_id',
    'title',
    'description',
    'status',
    'user_name',
    'user_post',
    'created_at',
    'updated_at'
];

const SORT_ORDER = {
    ASC: 1,
    DESC: -1
};


const parsePaginationParams = (query) => {
    const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
    const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(query.limit) || DEFAULT_LIMIT));
    const skip = (page - 1) * limit;

    return { page, limit, skip };
};


const parseSortParams = (query) => {
    const sortField = ALLOWED_SORT_FIELDS.includes(query.sort_by)
        ? query.sort_by
        : DEFAULT_SORT_FIELD;

    const sortOrder = query.sort_order?.toUpperCase() === 'ASC'
        ? SORT_ORDER.ASC
        : SORT_ORDER.DESC;

    return { sortField, sortOrder };
};


const buildSearchQuery = (searchTerm) => {
    if (!searchTerm || searchTerm.trim() === '') {
        return {};
    }

    const sanitizedSearch = searchTerm.trim();

    return {
        $or: [
            { title: { $regex: sanitizedSearch, $options: 'i' } },
            { description: { $regex: sanitizedSearch, $options: 'i' } },
            { user_name: { $regex: sanitizedSearch, $options: 'i' } },
            { user_post: { $regex: sanitizedSearch, $options: 'i' } }
        ]
    };
};


const createCaseInsensitivePattern = (text) => {
    const escapedText = text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escapedText}$`, 'i');
};


const validateTestimonialData = (data) => {
    const { title, description, userName, userPost } = data;
    const errors = [];

    if (!title || title.trim() === '') {
        errors.push('Title is required and cannot be empty');
    }

    if (!description || description.trim() === '') {
        errors.push('Description is required and cannot be empty');
    }

    if (!userName || userName.trim() === '') {
        errors.push('User name is required and cannot be empty');
    }

    if (!userPost || userPost.trim() === '') {
        errors.push('User post/position is required and cannot be empty');
    }

    return {
        isValid: errors.length === 0,
        errors,
        message: errors.join(', ')
    };
};


const validateAndFilterIds = (ids) => {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return {
            isValid: false,
            message: 'Testimonial IDs array is required and must not be empty',
            validIds: []
        };
    }

    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

    if (validIds.length === 0) {
        return {
            isValid: false,
            message: 'No valid testimonial IDs provided',
            validIds: []
        };
    }

    return {
        isValid: true,
        validIds
    };
};


export const getAllTestimonials = async (req, res) => {
    try {
        const { page, limit, skip } = parsePaginationParams(req.query);
        const { sortField, sortOrder } = parseSortParams(req.query);
        const searchTerm = req.query.search || '';

        const searchQuery = buildSearchQuery(searchTerm);

        const totalCount = await Testimonial.countDocuments(searchQuery);

        const testimonials = await Testimonial.find(searchQuery)
            .sort({ [sortField]: sortOrder })
            .skip(skip)
            .limit(limit)
            .lean();

        return res.status(200).json({
            success: true,
            data: {
                testimonials,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    totalItems: totalCount,
                    itemsPerPage: limit
                }
            }
        });
    } catch (error) {
        console.error('Error retrieving testimonials:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve testimonials',
            error: error.message
        });
    }
};


export const getTestimonialById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid testimonial ID is required'
            });
        }

        const testimonial = await Testimonial.findById(id).lean();

        if (!testimonial) {
            return res.status(404).json({
                success: false,
                message: 'Testimonial not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: testimonial
        });
    } catch (error) {
        console.error('Error retrieving testimonial:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve testimonial',
            error: error.message
        });
    }
};


export const createTestimonial = async (req, res) => {
    try {
        const {
            title,
            description,
            status,
            rating,
            user_name: userName,
            user_post: userPost
        } = req.body;

        const validation = validateTestimonialData({
            title,
            description,
            userName,
            userPost
        });

        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.message,
                errors: validation.errors
            });
        }

        const existingTestimonial = await Testimonial.findOne({
            title: createCaseInsensitivePattern(title)
        });

        if (existingTestimonial) {
            return res.status(409).json({
                success: false,
                message: 'Testimonial with this title already exists'
            });
        }

        const newTestimonial = await Testimonial.create({
            title: title.trim(),
            description: description.trim(),
            status: status !== undefined ? status : true,
            user_name: userName.trim(),
            user_post: userPost.trim(),
            rating: rating,
            user_image: req.file?.filename || null
        });

        return res.status(201).json({
            success: true,
            message: 'Testimonial created successfully',
            data: newTestimonial
        });
    } catch (error) {
        console.error('Error creating testimonial:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create testimonial',
            error: error.message
        });
    }
};


export const updateTestimonial = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            description,
            status,
            user_name: userName,
            rating,
            user_post: userPost
        } = req.body;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid testimonial ID is required'
            });
        }

        const existingTestimonial = await Testimonial.findById(id);
        if (!existingTestimonial) {
            return res.status(404).json({
                success: false,
                message: 'Testimonial not found'
            });
        }

        const validation = validateTestimonialData({
            title,
            description,
            userName,
            userPost
        });

        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.message,
                errors: validation.errors
            });
        }

        const duplicateTestimonial = await Testimonial.findOne({
            title: createCaseInsensitivePattern(title),
            _id: { $ne: id }
        });

        if (duplicateTestimonial) {
            return res.status(409).json({
                success: false,
                message: 'Testimonial with this title already exists'
            });
        }

        existingTestimonial.title = title.trim();
        existingTestimonial.description = description.trim();
        existingTestimonial.user_name = userName.trim();
        existingTestimonial.user_post = userPost.trim();
        existingTestimonial.rating = rating;

        if (status !== undefined) {
            existingTestimonial.status = status;
        }

        if (req.file?.filename) {
            existingTestimonial.user_image = req.file.filename;
        }

        await existingTestimonial.save();

        return res.status(200).json({
            success: true,
            message: 'Testimonial updated successfully',
            data: existingTestimonial
        });
    } catch (error) {
        console.error('Error updating testimonial:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update testimonial',
            error: error.message
        });
    }
};


export const updateTestimonialStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid testimonial ID is required'
            });
        }

        if (status === undefined || typeof status !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'Status must be a boolean value'
            });
        }

        const testimonial = await Testimonial.findById(id);
        if (!testimonial) {
            return res.status(404).json({
                success: false,
                message: 'Testimonial not found'
            });
        }

        testimonial.status = status;
        await testimonial.save();

        return res.status(200).json({
            success: true,
            message: `Testimonial ${status ? 'activated' : 'deactivated'} successfully`,
            data: {
                id: testimonial._id,
                status: testimonial.status
            }
        });
    } catch (error) {
        console.error('Error updating testimonial status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update testimonial status',
            error: error.message
        });
    }
};


export const deleteTestimonial = async (req, res) => {
    try {
        const { ids } = req.body;

        const validation = validateAndFilterIds(ids);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        const { validIds } = validation;

        const existingTestimonials = await Testimonial.find({ _id: { $in: validIds } });

        if (existingTestimonials.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No testimonials found with the provided IDs'
            });
        }

        const foundIds = existingTestimonials.map(testimonial => testimonial._id.toString());
        const notFoundIds = validIds.filter(id => !foundIds.includes(id.toString()));

        const deleteResult = await Testimonial.deleteMany({ _id: { $in: foundIds } });

        const response = {
            success: true,
            message: `${deleteResult.deletedCount} testimonial(s) deleted successfully`,
            data: {
                deletedCount: deleteResult.deletedCount,
                deletedIds: foundIds
            }
        };

        if (notFoundIds.length > 0) {
            response.data.notFoundIds = notFoundIds;
            response.message += `, ${notFoundIds.length} testimonial(s) not found`;
        }

        return res.status(200).json(response);
    } catch (error) {
        console.error('Error deleting testimonials:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete testimonials',
            error: error.message
        });
    }
};


export const getActiveTestimonials = async (req, res) => {
    try {
        const { page, limit, skip } = parsePaginationParams(req.query);

        const query = { status: true };

        const totalCount = await Testimonial.countDocuments(query);

        const testimonials = await Testimonial.find(query)
            .select('-status -created_at -updated_at')
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        return res.status(200).json({
            success: true,
            data: {
                testimonials,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    totalItems: totalCount,
                    itemsPerPage: limit
                }
            }
        });
    } catch (error) {
        console.error('Error retrieving active testimonials:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve testimonials',
            error: error.message
        });
    }
};

export default {
    getAllTestimonials,
    getTestimonialById,
    createTestimonial,
    updateTestimonial,
    updateTestimonialStatus,
    deleteTestimonial,
    getActiveTestimonials
};
