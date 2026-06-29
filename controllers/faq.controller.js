import { Faq } from '../models/index.js';
import mongoose from 'mongoose';


const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const DEFAULT_SORT_FIELD = 'created_at';
const DEFAULT_SORT_ORDER = -1;

const ALLOWED_SORT_FIELDS = [
    '_id',
    'title',
    'description',
    'status',
    'created_at',
    'updated_at'
];

const SORT_ORDER = {
    ASC: 1,
    DESC: -1
};

const parsePaginationParams = (query) => {
    const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
    const limit = Math.max(1, Math.min(100, parseInt(query.limit) || DEFAULT_LIMIT));
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
    const conditions = [
        { title: { $regex: sanitizedSearch, $options: 'i' } },
        { description: { $regex: sanitizedSearch, $options: 'i' } }
    ];

    if (sanitizedSearch.toLowerCase() === 'active' || sanitizedSearch.toLowerCase() === 'published') {
        conditions.push({ status: true });
    } else if (sanitizedSearch.toLowerCase() === 'inactive' || sanitizedSearch.toLowerCase() === 'draft') {
        conditions.push({ status: false });
    }

    return { $or: conditions };
};

const createCaseInsensitivePattern = (text) => {
    const escapedText = text.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`^${escapedText}$`, 'i');
};

const validateFaqData = (data) => {
    const { title, description } = data;

    if (!title || title.trim() === '') {
        return {
            isValid: false,
            message: 'Title is required and cannot be empty'
        };
    }

    if (!description || description.trim() === '') {
        return {
            isValid: false,
            message: 'Description is required and cannot be empty'
        };
    }

    return { isValid: true };
};

const validateAndFilterIds = (ids) => {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return {
            isValid: false,
            message: 'FAQ IDs array is required and must not be empty',
            validIds: []
        };
    }

    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

    if (validIds.length === 0) {
        return {
            isValid: false,
            message: 'No valid FAQ IDs provided',
            validIds: []
        };
    }

    return {
        isValid: true,
        validIds
    };
};

export const getAllFaqs = async (req, res) => {
    try {
        const { page, limit, skip } = parsePaginationParams(req.query);
        const { sortField, sortOrder } = parseSortParams(req.query);
        const searchTerm = req.query.search || '';

        const searchQuery = buildSearchQuery(searchTerm);

        const totalCount = await Faq.countDocuments(searchQuery);

        const faqs = await Faq.find(searchQuery)
            .sort({ [sortField]: sortOrder })
            .skip(skip)
            .limit(limit)
            .lean();

        return res.status(200).json({
            success: true,
            data: {
                faqs,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    totalItems: totalCount,
                    itemsPerPage: limit
                }
            }
        });
    } catch (error) {
        console.error('Error retrieving FAQs:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve FAQs',
            error: error.message
        });
    }
};



export const createFaq = async (req, res) => {
    try {
        const { title, description, status } = req.body;

        const validation = validateFaqData({ title, description });
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        const existingFaq = await Faq.findOne({
            title: createCaseInsensitivePattern(title)
        });

        if (existingFaq) {
            return res.status(409).json({
                success: false,
                message: 'FAQ with this title already exists'
            });
        }

        const newFaq = await Faq.create({
            title: title.trim(),
            description: description.trim(),
            status: status !== undefined ? status : true
        });

        return res.status(201).json({
            success: true,
            message: 'FAQ created successfully',
            data: newFaq
        });
    } catch (error) {
        console.error('Error creating FAQ:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create FAQ',
            error: error.message
        });
    }
};

export const updateFaq = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, status } = req.body;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid FAQ ID is required'
            });
        }

        const existingFaq = await Faq.findById(id);
        if (!existingFaq) {
            return res.status(404).json({
                success: false,
                message: 'FAQ not found'
            });
        }

        const validation = validateFaqData({ title, description });
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        const duplicateFaq = await Faq.findOne({
            title: createCaseInsensitivePattern(title),
            _id: { $ne: id }
        });

        if (duplicateFaq) {
            return res.status(409).json({
                success: false,
                message: 'FAQ with this title already exists'
            });
        }

        existingFaq.title = title.trim();
        existingFaq.description = description.trim();

        if (status !== undefined) {
            existingFaq.status = status;
        }

        await existingFaq.save();

        return res.status(200).json({
            success: true,
            message: 'FAQ updated successfully',
            data: existingFaq
        });
    } catch (error) {
        console.error('Error updating FAQ:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update FAQ',
            error: error.message
        });
    }
};


export const updateFaqStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid FAQ ID is required'
            });
        }

        if (status === undefined || typeof status !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'Status must be a boolean value'
            });
        }

        const faq = await Faq.findById(id);
        if (!faq) {
            return res.status(404).json({
                success: false,
                message: 'FAQ not found'
            });
        }

        faq.status = status;
        await faq.save();

        if (status !== undefined) {
            existingFaq.status = status;
        }

        await existingFaq.save();

        return res.status(200).json({
            success: true,
            message: 'FAQ updated successfully',
            data: existingFaq
        });
    } catch (error) {
        console.error('Error updating FAQ:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update FAQ',
            error: error.message
        });
    }
};


export const deleteFaq = async (req, res) => {
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

        const existingFaqs = await Faq.find({ _id: { $in: validIds } });

        if (existingFaqs.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No FAQs found with the provided IDs'
            });
        }

        const foundIds = existingFaqs.map(faq => faq._id.toString());
        const notFoundIds = validIds.filter(id => !foundIds.includes(id.toString()));

        const deleteResult = await Faq.deleteMany({ _id: { $in: foundIds } });

        const response = {
            success: true,
            message: `${deleteResult.deletedCount} FAQ(s) deleted successfully`,
            data: {
                deletedCount: deleteResult.deletedCount,
                deletedIds: foundIds
            }
        };

        if (notFoundIds.length > 0) {
            response.data.notFoundIds = notFoundIds;
            response.message += `, ${notFoundIds.length} FAQ(s) not found`;
        }

        return res.status(200).json(response);
    } catch (error) {
        console.error('Error deleting FAQs:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete FAQs',
            error: error.message
        });
    }
};

export const getFaqById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid FAQ ID is required'
            });
        }

        const faq = await Faq.findById(id).lean();

        if (!faq) {
            return res.status(404).json({
                success: false,
                message: 'FAQ not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: faq
        });
    } catch (error) {
        console.error('Error retrieving FAQ:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve FAQ',
            error: error.message
        });
    }
};

export default {
    getAllFaqs,
    createFaq,
    updateFaq,
    updateFaqStatus,
    deleteFaq,
    getFaqById
};
