import { MessageBot, ReplyMaterial, Template, EcommerceCatalog, Chatbot, User } from '../models/index.js';
import mongoose from 'mongoose';

const SORT_ORDER = {
    ASC: 1,
    DESC: -1
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_SORT_FIELD = 'created_at';
const ALLOWED_SORT_FIELDS = ['keywords', 'matching_method', 'reply_type', 'status', 'created_at', 'updated_at'];

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

    const sortOrder = query.sort_order?.toUpperCase() === 'DESC'
        ? SORT_ORDER.DESC
        : SORT_ORDER.ASC;

    return { sortField, sortOrder };
};

const buildSearchQuery = (searchTerm) => {
    if (!searchTerm || searchTerm.trim() === '') {
        return {};
    }

    const sanitizedSearch = searchTerm.trim();

    return {
        $or: [
            { keywords: { $elemMatch: { $regex: sanitizedSearch, $options: 'i' } } },
            { reply_type: { $regex: sanitizedSearch, $options: 'i' } },
            { matching_method: { $regex: sanitizedSearch, $options: 'i' } }
        ]
    };
};

export const createMessageBot = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { waba_id, keywords, matching_method, partial_percentage, reply_type, reply_id, variables_mapping, media_url, carousel_cards_data, coupon_code, catalog_id, product_retailer_id } = req.body;

        if (!waba_id || !keywords || !reply_type || !reply_id) {
            return res.status(400).json({ success: false, message: 'waba_id, keywords, reply_type, and reply_id are required' });
        }

        const validReplyTypes = ['text', 'media', 'template', 'catalog', 'chatbot', 'agent', 'sequence', 'flow', 'appointment_flow'];
        if (!validReplyTypes.includes(reply_type)) {
            return res.status(400).json({ success: false, message: 'Invalid reply_type' });
        }

        let reply_type_ref;
        switch (reply_type) {
            case 'template': reply_type_ref = 'Template'; break;
            case 'catalog': reply_type_ref = 'EcommerceCatalog'; break;
            case 'chatbot': reply_type_ref = 'Chatbot'; break;
            case 'agent': reply_type_ref = 'User'; break;
            case 'appointment_flow': reply_type_ref = 'AppointmentConfig'; break;
            default: reply_type_ref = 'ReplyMaterial'; break;
        }

        const messageBot = await MessageBot.create({
            user_id: userId,
            waba_id,
            keywords: Array.isArray(keywords) ? keywords : [keywords],
            matching_method,
            partial_percentage,
            reply_type,
            reply_id,
            reply_type_ref,
            variables_mapping,
            media_url,
            carousel_cards_data,
            coupon_code,
            catalog_id,
            product_retailer_id
        });

        return res.status(201).json({ success: true, message: 'Message bot created successfully', data: messageBot });
    } catch (error) {
        console.error('Error creating message bot:', error);
        return res.status(500).json({ success: false, message: 'Failed to create message bot', error: error.message });
    }
};

export const getAllMessageBots = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { waba_id, status } = req.query;

        if (!waba_id) {
            return res.status(400).json({ success: false, message: 'waba_id is required' });
        }

        const { page, limit, skip } = parsePaginationParams(req.query);
        const { sortField, sortOrder } = parseSortParams(req.query);
        const searchQuery = buildSearchQuery(req.query.search);

        const query = {
            ...searchQuery,
            user_id: userId,
            waba_id,
            deleted_at: null
        };

        if (status) query.status = status;

        const bots = await MessageBot.find(query)
            .select('_id keywords matching_method reply_type reply_id status created_at')
            .sort({ [sortField]: sortOrder })
            .skip(skip)
            .limit(limit)
            .populate('reply_id')
            .lean();

        const total = await MessageBot.countDocuments(query);

        return res.status(200).json({
            success: true,

            data: bots,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: limit
            }

        });

    } catch (error) {
        console.error('Error fetching message bots:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch message bots', error: error.message });
    }
};

export const getMessageBotById = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { id } = req.params;

        const bot = await MessageBot.findOne({ _id: id, user_id: userId, deleted_at: null }).populate('reply_id');
        if (!bot) {
            return res.status(404).json({ success: false, message: 'Message bot not found' });
        }

        return res.status(200).json({ success: true, data: bot });
    } catch (error) {
        console.error('Error fetching message bot:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch message bot', error: error.message });
    }
};

export const updateMessageBot = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { id } = req.params;
        const updateData = req.body;

        const bot = await MessageBot.findOne({ _id: id, user_id: userId, deleted_at: null });
        if (!bot) {
            return res.status(404).json({ success: false, message: 'Message bot not found' });
        }

        if (updateData.reply_type) {
            let reply_type_ref;
            switch (updateData.reply_type) {
                case 'template': reply_type_ref = 'Template'; break;
                case 'catalog': reply_type_ref = 'EcommerceCatalog'; break;
                case 'chatbot': reply_type_ref = 'Chatbot'; break;
                case 'agent': reply_type_ref = 'User'; break;
                case 'appointment_flow': reply_type_ref = 'AppointmentConfig'; break;
                default: reply_type_ref = 'ReplyMaterial'; break;
            }
            bot.reply_type_ref = reply_type_ref;
        }

        const allowedFields = ['keywords', 'matching_method', 'partial_percentage', 'reply_type', 'reply_id', 'status', 'variables_mapping', 'media_url', 'carousel_cards_data', 'coupon_code', 'catalog_id', 'product_retailer_id'];
        allowedFields.forEach(field => {
            if (updateData[field] !== undefined) {
                bot[field] = updateData[field];
            }
        });

        await bot.save();

        return res.status(200).json({ success: true, message: 'Message bot updated successfully', data: bot });
    } catch (error) {
        console.error('Error updating message bot:', error);
        return res.status(500).json({ success: false, message: 'Failed to update message bot', error: error.message });
    }
};

export const deleteMessageBot = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { id } = req.params;

        const result = await MessageBot.deleteOne({ _id: id, user_id: userId });
        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'Message bot not found' });
        }

        return res.status(200).json({ success: true, message: 'Message bot deleted successfully' });
    } catch (error) {
        console.error('Error deleting message bot:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete message bot', error: error.message });
    }
};

export const bulkDeleteMessageBots = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'IDs array is required' });
        }

        const result = await MessageBot.deleteMany({
            _id: { $in: ids },
            user_id: userId
        });

        return res.status(200).json({
            success: true,
            message: `${result.deletedCount} message bot(s) deleted successfully`,
            data: { deletedCount: result.deletedCount }
        });
    } catch (error) {
        console.error('Error bulk deleting message bots:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete message bots', error: error.message });
    }
};

export default {
    createMessageBot,
    getAllMessageBots,
    getMessageBotById,
    updateMessageBot,
    deleteMessageBot,
    bulkDeleteMessageBots
};
