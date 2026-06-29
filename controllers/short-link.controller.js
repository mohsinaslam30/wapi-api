import mongoose from 'mongoose';
import { ShortLink, User } from '../models/index.js';
import QRCode from 'qrcode';

export const createShortLink = async (req, res) => {
    try {
        const userId = req.user?.id;

        const { mobile, first_message } = req.body;

        if (!mobile) {
            return res.status(400).json({ success: false, message: 'mobile is required' });
        }

        const short_code = await ShortLink.generateUniqueCode();

        const shortLink = await ShortLink.create({
            user_id: userId,
            short_code,
            mobile: String(mobile).trim(),
            first_message: (first_message ?? '').toString(),
        });

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const shortLinkUrl = `${baseUrl}/short_link/wp/${shortLink.short_code}`;

        const qrCodeDataUrl = await QRCode.toDataURL(shortLinkUrl);

        const user = { name: req.user.name, email: req.user.email };

        return res.status(201).json({
            success: true,
            message: 'Short link created successfully',
            data: {
                ...shortLink.toObject(),
                user,
                short_link: shortLinkUrl,
                qr_code: qrCodeDataUrl,
            },
        });
    } catch (error) {
        console.error('Error creating short link:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create short link',
            error: error.message,
        });
    }
};

export const updateShortLink = async (req, res) => {
    try {
        const userId = req.user?.id;


        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid short link ID' });
        }

        const shortLink = await ShortLink.findOne({ _id: id, user_id: userId, deleted_at: null });
        if (!shortLink) {
            return res.status(404).json({ success: false, message: 'Short link not found' });
        }

        const { mobile, first_message } = req.body;

        if (mobile !== undefined) shortLink.mobile = String(mobile).trim();
        if (first_message !== undefined) shortLink.first_message = (first_message ?? '').toString();

        await shortLink.save();

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const shortLinkUrl = `${baseUrl}/short_link/wp/${shortLink.short_code}`;

        const qrCodeDataUrl = await QRCode.toDataURL(shortLinkUrl);

        const user = { name: req.user.name, email: req.user.email };

        return res.status(200).json({
            success: true,
            message: 'Short link updated successfully',
            data: {
                ...shortLink.toObject(),
                user,
                short_link: shortLinkUrl,
                qr_code: qrCodeDataUrl,
            },
        });
    } catch (error) {
        console.error('Error updating short link:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update short link',
            error: error.message,
        });
    }
};

export const getShortLinks = async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;



        const {
            page = 1,
            limit = 10,
            search = '',
            sort_by = 'created_at',
            sort_order = 'desc',
        } = req.query;

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOrder = sort_order === 'asc' ? 1 : -1;

        const query = {
            deleted_at: null,
        };

        if (userRole !== 'super_admin') {
            query.user_id = userId;
        }

        if (search) {
            const regex = { $regex: search, $options: 'i' };
            const matchingUsers = await User.find({
                $or: [{ name: regex }, { email: regex }],
                deleted_at: null
            }).select('_id');
            const userIds = matchingUsers.map(u => u._id);

            query.$or = [
                { mobile: regex },
                { first_message: regex },
                { short_code: regex },
                { user_id: { $in: userIds } }
            ];
        }

        const shortLinks = await ShortLink.find(query)
            .populate('user_id', 'name email')
            .sort({ [sort_by]: sortOrder })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await ShortLink.countDocuments(query);

        const baseUrl = `${req.protocol}://${req.get('host')}`;

        const data = await Promise.all(shortLinks.map(async (sl) => {
            const shortLinkUrl = `${baseUrl}/short_link/wp/${sl.short_code}`;
            const qrCodeDataUrl = await QRCode.toDataURL(shortLinkUrl);

            const { user_id, ...rest } = sl;
            return {
                ...rest,
                user: user_id,
                short_link: shortLinkUrl,
                qr_code: qrCodeDataUrl,
            };
        }));

        return res.status(200).json({
            success: true,
            data: {
                short_links: data,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalItems: total,
                    itemsPerPage: parseInt(limit),
                },
            },
        });

    } catch (error) {
        console.error('Error fetching short links:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch short links',
            error: error.message,
        });
    }
};

export const getShortLinkById = async (req, res) => {
    try {
        const userId = req.user?.id;
        const userRole = req.user?.role;


        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid short link ID' });
        }

        const query = {
            _id: id,
            deleted_at: null,
        };

        if (userRole !== 'super_admin') {
            query.user_id = userId;
        }

        const shortLink = await ShortLink.findOne(query)
            .populate('user_id', 'name email')
            .lean();

        if (!shortLink) {
            return res.status(404).json({ success: false, message: 'Short link not found' });
        }

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const shortLinkUrl = `${baseUrl}/short_link/wp/${shortLink.short_code}`;
        const qrCodeDataUrl = await QRCode.toDataURL(shortLinkUrl);

        const { user_id, ...rest } = shortLink;

        return res.status(200).json({
            success: true,
            data: {
                ...rest,
                user: user_id,
                short_link: shortLinkUrl,
                qr_code: qrCodeDataUrl,
            },
        });

    } catch (error) {
        console.error('Error fetching short link:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch short link',
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

export const bulkDeleteShortLinks = async (req, res) => {
    try {
        const userId = req.user?.id;


        const { ids } = req.body;
        const validation = validateAndFilterIds(ids);
        if (!validation.isValid) {
            return res.status(400).json({ success: false, message: validation.message });
        }

        const { validIds } = validation;

        const existing = await ShortLink.find({
            _id: { $in: validIds },
            user_id: userId,
            deleted_at: null,
        }).select('_id');

        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No short links found with the provided IDs',
            });
        }

        const foundIds = existing.map((s) => s._id.toString());
        const notFoundIds = validIds.filter((id) => !foundIds.includes(id.toString()));

        const result = await ShortLink.updateMany(
            { _id: { $in: foundIds } },
            { $set: { deleted_at: new Date() } }
        );

        const response = {
            success: true,
            message: `${result.modifiedCount} short link(s) deleted successfully`,
            data: {
                deletedCount: result.modifiedCount,
                deletedIds: foundIds,
            },
        };

        if (notFoundIds.length > 0) {
            response.data.notFoundIds = notFoundIds;
            response.message += `, ${notFoundIds.length} short link(s) not found`;
        }

        return res.status(200).json(response);
    } catch (error) {
        console.error('Error bulk deleting short links:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete short links',
            error: error.message,
        });
    }
};

export const redirectShortLink = async (req, res) => {
    try {
        const { code } = req.params;
        if (!code) {
            return res.status(400).send('Invalid short link');
        }

        const shortLink = await ShortLink.findOneAndUpdate(
            { short_code: code.trim(), deleted_at: null },
            { $inc: { click_count: 1 } },
            { returnDocument: 'after' }
        ).lean();

        if (!shortLink) {
            return res.status(404).send('Short link not found');
        }

        const whatsappUrl = `https://api.whatsapp.com/send?phone=${encodeURIComponent(shortLink.mobile)}&text=${encodeURIComponent(shortLink.first_message)}`;

        return res.redirect(302, whatsappUrl);
    } catch (error) {
        console.error('Error redirecting short link:', error);
        return res.status(500).send('Internal server error');
    }
};

export default {
    createShortLink,
    updateShortLink,
    getShortLinks,
    getShortLinkById,
    bulkDeleteShortLinks,
    redirectShortLink,
};
