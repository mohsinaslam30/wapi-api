import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { ReplyMaterial, Template, EcommerceCatalog, Sequence, Role, Form, AppointmentConfig, User, Setting } from '../models/index.js';
import { deleteFile } from '../utils/aws-storage.js';

const buildAbsoluteUrl = (req, maybeRelativeUrl) => {
    if (!maybeRelativeUrl) return null;
    if (maybeRelativeUrl.startsWith('http://') || maybeRelativeUrl.startsWith('https://')) return maybeRelativeUrl;
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    return `${baseUrl}${maybeRelativeUrl.startsWith('/') ? '' : '/'}${maybeRelativeUrl}`;
};


export const createReplyMaterial = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { waba_id, type, name, content } = req.body;

        if (!waba_id || !type || !name) {
            return res.status(400).json({ success: false, message: 'waba_id, type, and name are required' });
        }

        let filePath = null;
        if (type !== 'text' && type !== 'flow') {
            if (!req.file) {
                return res.status(400).json({ success: false, message: `File is required for type ${type}` });
            }
            filePath = req.file.path.startsWith('http') ? req.file.path : `/${req.file.destination}/${req.file.filename}`.replace(/\\/g, '/');
        }

        const replyMaterial = await ReplyMaterial.create({
            user_id: userId,
            waba_id,
            type,
            name,
            content: (type === 'text' || type === 'flow') ? content : null,
            file_path: filePath,
            file_size: req.file ? req.file.size : 0,
            flow_id: type === 'flow' ? req.body.flow_id : null,
            button_text: type === 'flow' ? req.body.button_text : null
        });

        if (req.file) {
            await User.findByIdAndUpdate(userId, { $inc: { storage_used: req.file.size } });
        }

        return res.status(201).json({
            success: true,
            message: 'Reply material created successfully',
            data: {
                ...replyMaterial.toObject(),
                file_url: buildAbsoluteUrl(req, replyMaterial.file_path)
            }
        });
    } catch (error) {
        if (req.file) {
            const filePath = `/${req.file.destination}/${req.file.filename}`.replace(/\\/g, '/');
            await deleteFile(filePath);
        }
        console.error('Error creating reply material:', error);
        return res.status(500).json({ success: false, message: 'Failed to create reply material', error: error.message });
    }
};

export const getReplyMaterials = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { waba_id, page = 1, limit = 10, search = '' } = req.query;

        if (!waba_id) {
            return res.status(400).json({ success: false, message: 'waba_id is required' });
        }

        const types = ['text', 'audio', 'video', 'document', 'image', 'sticker', 'flow'];
        const result = {};

        for (const type of types) {
            const query = {
                user_id: userId,
                waba_id,
                type,
                deleted_at: null
            };

            if (search) {
                query.name = { $regex: search, $options: 'i' };
            }

            const skip = (parseInt(page) - 1) * parseInt(limit);
            const items = await ReplyMaterial.find(query)
                .select('_id name type content file_path flow_id button_text')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean();


            const total = await ReplyMaterial.countDocuments(query);

            const typeKey = type === 'text' ? 'texts' : `${type}s`;
            result[typeKey] = {
                items: items.map(item => ({
                    ...item,
                    file_url: buildAbsoluteUrl(req, item.file_path),
                    file_size: item.file_size
                })),
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(total / parseInt(limit)),
                    totalItems: total,
                    itemsPerPage: parseInt(limit)
                }
            };
        }

        const templateQuery = {
            waba_id,
            status: 'approved'
        };
        if (search) {
            templateQuery.template_name = { $regex: search, $options: 'i' };
        }
        const templateSkip = (parseInt(page) - 1) * parseInt(limit);
        const templates = await Template.find(templateQuery)
            .select('_id template_name language category components')
            .sort({ createdAt: -1 })
            .skip(templateSkip)
            .limit(parseInt(limit))
            .lean();
        const totalTemplates = await Template.countDocuments(templateQuery);


        result.templates = {
            items: templates,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalTemplates / parseInt(limit)),
                totalItems: totalTemplates,
                itemsPerPage: parseInt(limit)
            }
        };

        const catalogQuery = {
            waba_id,
            is_active: true,
            deleted_at: null
        };
        if (search) {
            catalogQuery.name = { $regex: search, $options: 'i' };
        }
        const catalogSkip = (parseInt(page) - 1) * parseInt(limit);
        const catalogs = await EcommerceCatalog.find(catalogQuery)
            .select('_id name catalog_id status')
            .sort({ createdAt: -1 })
            .skip(catalogSkip)
            .limit(parseInt(limit))
            .lean();
        const totalCatalogs = await EcommerceCatalog.countDocuments(catalogQuery);


        result.catalogs = {
            items: catalogs,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCatalogs / parseInt(limit)),
                totalItems: totalCatalogs,
                itemsPerPage: parseInt(limit)
            }
        };

        const ChatbotModel = mongoose.model('Chatbot');
        const chatbotQuery = {
            user_id: userId,
            deleted_at: null
        };
        if (search) {
            chatbotQuery.name = { $regex: search, $options: 'i' };
        }
        const chatbotSkip = (parseInt(page) - 1) * parseInt(limit);
        const chatbots = await ChatbotModel.find(chatbotQuery)
            .select('_id name status')
            .sort({ createdAt: -1 })
            .skip(chatbotSkip)
            .limit(parseInt(limit))
            .lean();
        const totalChatbots = await ChatbotModel.countDocuments(chatbotQuery);


        result.chatbots = {
            items: chatbots,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalChatbots / parseInt(limit)),
                totalItems: totalChatbots,
                itemsPerPage: parseInt(limit)
            }
        };

        const agentRole = await Role.findOne({ name: 'agent' });
        const UserModel = mongoose.model('User');
        const agentQuery = {
            created_by: userId,
            role_id: agentRole?._id,
            deleted_at: null
        };
        if (search) {
            agentQuery.name = { $regex: search, $options: 'i' };
        }
        const agentSkip = (parseInt(page) - 1) * parseInt(limit);
        const agents = await UserModel.find(agentQuery)
            .select('_id name email status')
            .populate('role_id', 'name')
            .sort({ createdAt: -1 })
            .skip(agentSkip)
            .limit(parseInt(limit))
            .lean();
        const totalAgents = await UserModel.countDocuments(agentQuery);


        result.agents = {
            items: agents,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalAgents / parseInt(limit)),
                totalItems: totalAgents,
                itemsPerPage: parseInt(limit)
            }
        };

        const sequenceQuery = { user_id: userId, waba_id, deleted_at: null };
        if (search) sequenceQuery.name = { $regex: search, $options: 'i' };
        const sequenceSkip = (parseInt(page) - 1) * parseInt(limit);
        const sequences = await Sequence.find(sequenceQuery)
            .select('_id name is_active')
            .sort({ created_at: -1 })
            .skip(sequenceSkip)
            .limit(parseInt(limit))
            .lean();
        const totalSequences = await Sequence.countDocuments(sequenceQuery);

        result.sequences = {
            items: sequences,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalSequences / parseInt(limit)),
                totalItems: totalSequences,
                itemsPerPage: parseInt(limit)
            }
        };

        const formQuery = { user_id: userId, deleted_at: null };
        if (search) formQuery.name = { $regex: search, $options: 'i' };
        formQuery["flow.flow_id"] = { $exists: true, $ne: "" };
        formQuery["flow.meta_status"] = "PUBLISHED";

        const formSkip = (parseInt(page) - 1) * parseInt(limit);
        const forms = await Form.find(formQuery)
            .select('_id name flow.flow_id')
            .sort({ createdAt: -1 })
            .skip(formSkip)
            .limit(parseInt(limit))
            .lean();
        const totalForms = await Form.countDocuments(formQuery);

        result.forms = {
            items: forms.map(f => ({
                _id: f._id,
                name: f.name,
                flow_id: f.flow?.flow_id,
                type: 'flow'
            })),
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalForms / parseInt(limit)),
                totalItems: totalForms,
                itemsPerPage: parseInt(limit)
            }
        };

        const appointmentQuery = {
            user_id: userId,
            waba_id,
            deleted_at: null
        };
        if (search) {
            appointmentQuery.name = { $regex: search, $options: 'i' };
        }
        const apptSkip = (parseInt(page) - 1) * parseInt(limit);
        const appts = await AppointmentConfig.find(appointmentQuery)
            .select('_id name status')
            .sort({ createdAt: -1 })
            .skip(apptSkip)
            .limit(parseInt(limit))
            .lean();
        const totalAppts = await AppointmentConfig.countDocuments(appointmentQuery);

        result.appointments = {
            items: appts,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalAppts / parseInt(limit)),
                totalItems: totalAppts,
                itemsPerPage: parseInt(limit)
            }
        };

        return res.status(200).json({ success: true, data: result });

    } catch (error) {
        console.error('Error fetching reply materials:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch reply materials', error: error.message });
    }
};

export const getReplyMaterialById = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { id } = req.params;

        const item = await ReplyMaterial.findOne({ _id: id, user_id: userId, deleted_at: null }).lean();
        if (!item) {
            return res.status(404).json({ success: false, message: 'Reply material not found' });
        }

        return res.status(200).json({
            success: true,
            data: {
                ...item,
                file_url: buildAbsoluteUrl(req, item.file_path)
            }
        });
    } catch (error) {
        console.error('Error fetching reply material:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch reply material', error: error.message });
    }
};

export const updateReplyMaterial = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { id } = req.params;
        const { name, content } = req.body;

        const item = await ReplyMaterial.findOne({ _id: id, user_id: userId, deleted_at: null });
        if (!item) {
            if (req.file) {
                const filePath = req.file.path.startsWith('http') ? req.file.path : `/${req.file.destination}/${req.file.filename}`.replace(/\\/g, '/');
                await deleteFile(filePath);
            }
            return res.status(404).json({ success: false, message: 'Reply material not found' });
        }

        if (name) item.name = name;
        if ((item.type === 'text' || item.type === 'flow') && content) item.content = content;
        if (item.type === 'flow') {
            if (req.body.flow_id) item.flow_id = req.body.flow_id;
            if (req.body.button_text) item.button_text = req.body.button_text;
        }

        if (req.file) {
            const oldPath = item.file_path;
            const oldSize = item.file_size || 0;
            item.file_path = req.file.path.startsWith('http') ? req.file.path : `/${req.file.destination}/${req.file.filename}`.replace(/\\/g, '/');
            item.file_size = req.file.size;
            if (oldPath) await deleteFile(oldPath);
            
            await User.findByIdAndUpdate(userId, { $inc: { storage_used: req.file.size - oldSize } });
        }

        await item.save();

        return res.status(200).json({
            success: true,
            message: 'Reply material updated successfully',
            data: {
                ...item.toObject(),
                file_url: buildAbsoluteUrl(req, item.file_path)
            }
        });
    } catch (error) {
        if (req.file) {
            const filePath = `/${req.file.destination}/${req.file.filename}`.replace(/\\/g, '/');
            await deleteFile(filePath);
        }
        console.error('Error updating reply material:', error);
        return res.status(500).json({ success: false, message: 'Failed to update reply material', error: error.message });
    }
};

export const deleteReplyMaterial = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { id } = req.params;

        const item = await ReplyMaterial.findOne({ _id: id, user_id: userId, deleted_at: null });
        if (!item) {
            return res.status(404).json({ success: false, message: 'Reply material not found' });
        }

        const filePath = item.file_path;
        const fileSize = item.file_size || 0;
        item.deleted_at = new Date();
        await item.save();

        if (filePath) await deleteFile(filePath);

        const setting = await Setting.findOne().select('restore_storage_on_delete').lean();
        const restoreStorage = setting?.restore_storage_on_delete !== false;
        if (restoreStorage) {
            await User.findByIdAndUpdate(userId, { $inc: { storage_used: -fileSize } });
        }

        return res.status(200).json({ success: true, message: 'Reply material deleted successfully' });
    } catch (error) {
        console.error('Error deleting reply material:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete reply material', error: error.message });
    }
};

export const bulkDeleteReplyMaterials = async (req, res) => {
    try {
        const userId = req.user?.owner_id;
        const { ids } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'IDs array is required' });
        }

        const items = await ReplyMaterial.find({
            _id: { $in: ids },
            user_id: userId,
            deleted_at: null
        }).select('file_path');

        if (items.length === 0) {
            return res.status(404).json({ success: false, message: 'No reply materials found' });
        }

        const foundIds = items.map(item => item._id);

        await ReplyMaterial.updateMany(
            { _id: { $in: foundIds } },
            { $set: { deleted_at: new Date() } }
        );

        for (const item of items) {
            if (item.file_path) await deleteFile(item.file_path);
        }

        const totalDeletedSize = items.reduce((acc, curr) => acc + (curr.file_size || 0), 0);
        const setting = await Setting.findOne().select('restore_storage_on_delete').lean();
        const restoreStorage = setting?.restore_storage_on_delete !== false;
        if (restoreStorage) {
            await User.findByIdAndUpdate(userId, { $inc: { storage_used: -totalDeletedSize } });
        }

        return res.status(200).json({
            success: true,
            message: `${foundIds.length} reply material(s) deleted successfully`,
            data: { deletedCount: foundIds.length, deletedIds: foundIds }
        });
    } catch (error) {
        console.error('Error bulk deleting reply materials:', error);
        return res.status(500).json({ success: false, message: 'Failed to delete reply materials', error: error.message });
    }
};

export default {
    createReplyMaterial,
    getReplyMaterials,
    getReplyMaterialById,
    updateReplyMaterial,
    deleteReplyMaterial,
    bulkDeleteReplyMaterials
};
