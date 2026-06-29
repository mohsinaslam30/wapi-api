import { QuickReply, QuickReplyFavorite, UserSetting } from '../models/index.js';
import mongoose from 'mongoose';

export const getQuickReplies = async (req, res) => {
    try {
        const userId = req.user.id;
        const { page = 1, limit = 50, search = '', sort = 'createdAt', order = 'desc' } = req.query;
        
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);
        const userSetting = await UserSetting.findOne({ user_id: userId }).lean();
        const disableAdminQuickReply = userSetting?.disable_admin_quick_reply || false;

        const orConditions = [{ user_id: new mongoose.Types.ObjectId(userId) }];
        if (!disableAdminQuickReply) {
            orConditions.push({ is_admin_reply: true });
        }

        const matchStage = {
            $or: orConditions
        };

        if (search) {
            matchStage.content = { $regex: search, $options: 'i' };
        }

        const sortStage = {};
        if (sort === 'is_favorite') {
            sortStage.is_favorite = order === 'desc' ? -1 : 1;
            sortStage.createdAt = -1;
        } else {
            sortStage[sort] = order === 'desc' ? -1 : 1;
        }

        const quickReplies = await QuickReply.aggregate([
            { $match: matchStage },
            {
                $lookup: {
                    from: 'quick_reply_favorites',
                    let: { qrId: '$_id' },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ['$quick_reply_id', '$$qrId'] },
                                        { $eq: ['$user_id', new mongoose.Types.ObjectId(userId)] }
                                    ]
                                }
                            }
                        }
                    ],
                    as: 'favorites'
                }
            },
            { $addFields: { is_favorite: { $gt: [{ $size: '$favorites' }, 0] }}},
            { $sort: { is_favorite: -1, ...sortStage } },
            { $facet: { metadata: [{ $count: 'total' }], data: [{ $skip: skip }, { $limit: limitNum }]}},
            { $project: { total: { $arrayElemAt: ['$metadata.total', 0] }, data: 1 }}
        ]);

        const result = quickReplies[0];
        const total = result.total || 0;

        return res.status(200).json({
            success: true,
            count: total,
            page: parseInt(page),
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            data: result.data
        });
    } catch (error) {
        console.error('Error fetching quick replies:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error.', });
    }
};

export const getAdminQuickReplies = async (req, res) => {
    try {
        const { page = 1, limit = 50, search = '', sort = 'createdAt', order = 'desc' } = req.query;
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = parseInt(limit);

        const filter = { is_admin_reply: true };
        if (search) {
            filter.content = { $regex: search, $options: 'i' };
        }

        const total = await QuickReply.countDocuments(filter);
        const quickReplies = await QuickReply.find(filter)
            .sort({ [sort]: order === 'desc' ? -1 : 1 })
            .skip(skip)
            .limit(limitNum)
            .lean();

        return res.status(200).json({
            success: true,
            count: total,
            page: parseInt(page),
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
            data: quickReplies
        });
    } catch (error) {
        console.error('Error fetching admin quick replies:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error.', });
    }
};

export const createQuickReply = async (req, res) => {
    try {
        const { content, is_admin_reply } = req.body;
        const userId = req.user.id;
        const roleKey = req.user.role;

        if (!content) {
            return res.status(400).json({ success: false, message: 'Content is required' });
        }

        const data = {
            content,
            user_id: userId
        };

        if (is_admin_reply && (roleKey === 'super_admin' || roleKey === 'admin')) {
            data.is_admin_reply = true;
            data.user_id = null;
        }

        const quickReply = await QuickReply.create(data);

        return res.status(201).json({
            success: true,
            message: 'Quick reply created successfully',
            data: quickReply
        });
    } catch (error) {
        console.error('Error creating quick reply:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error.', });
    }
};

export const updateQuickReply = async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        const userId = req.user.id;
        const roleKey = req.user.role;

        if (!content) {
            return res.status(400).json({ success: false, message: 'Content is required' });
        }

        const quickReply = await QuickReply.findById(id);

        if (!quickReply) {
            return res.status(404).json({ success: false, message: 'Quick reply not found' });
        }

        if (quickReply.is_admin_reply) {
            if (roleKey !== 'super_admin' && roleKey !== 'admin') {
                return res.status(403).json({ success: false, message: 'You are not authorized to update admin quick replies.' });
            }
        } else if (quickReply.user_id.toString() !== userId.toString()) {
            return res.status(403).json({ success: false, message: 'You can only update your own quick replies.'});
        }

        quickReply.content = content;
        await quickReply.save();

        return res.status(200).json({
            success: true,
            message: 'Quick reply updated successfully',
            data: quickReply
        });
    } catch (error) {
        console.error('Error updating quick reply:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error.', });
    }
};

export const bulkDeleteQuickReplies = async (req, res) => {
    try {
        const { ids } = req.body;
        const userId = req.user.id;
        const roleKey = req.user.role;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({  success: false,  message: 'Please provide at least one quick reply ID to delete.'  });
        }

        const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
        if (validIds.length !== ids.length) {
            return res.status(400).json({ success: false, message: 'One or more provided IDs are invalid.' });
        }

        const quickReplies = await QuickReply.find({ _id: { $in: validIds } });
        if (quickReplies.length !== validIds.length) {
            return res.status(404).json({ success: false, message: 'Some quick replies were not found.' });
        }

        for (const qr of quickReplies) {
            if (qr.is_admin_reply) {
                if (roleKey !== 'super_admin' && roleKey !== 'admin') {
                    return res.status(403).json({ success: false, message: 'You are not authorized to delete admin quick replies.' });
                }
            } else if (qr.user_id.toString() !== userId.toString()) {
                return res.status(403).json({ success: false, message: 'You can only delete your own quick replies.' });
            }
        }

        await QuickReply.deleteMany({ _id: { $in: validIds } });
        await QuickReplyFavorite.deleteMany({ quick_reply_id: { $in: validIds } });

        return res.status(200).json({ success: true, message: `${validIds.length} quick repl${validIds.length > 1 ? 'ies' : 'y'} deleted successfully` });
    } catch (error) {
        console.error('Error in bulk delete quick replies:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error.' });
    }
};

export const toggleFavorite = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const quickReply = await QuickReply.findById(id);
        if (!quickReply) {
            return res.status(404).json({ success: false, message: 'Quick reply not found' });
        }

        const favorite = await QuickReplyFavorite.findOne({
            user_id: userId,
            quick_reply_id: id
        });

        if (favorite) {
            await QuickReplyFavorite.findByIdAndDelete(favorite._id);
            return res.status(200).json({
                success: true,
                message: 'Removed from favorites',
                is_favorite: false
            });
        } else {
            await QuickReplyFavorite.create({
                user_id: userId,
                quick_reply_id: id
            });
            return res.status(200).json({
                success: true,
                message: 'Added to favorites',
                is_favorite: true
            });
        }
    } catch (error) {
        console.error('Error toggling favorite:', error);
        return res.status(500).json({ success: false, message: 'Internal Server Error', });
    }
};

export default {
    getQuickReplies,
    getAdminQuickReplies,
    createQuickReply,
    updateQuickReply,
    bulkDeleteQuickReplies,
    toggleFavorite
};