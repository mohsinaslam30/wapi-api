import { User, Team, Role } from '../models/index.js';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import * as funnelService from '../services/funnel.service.js';


const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const DEFAULT_SORT_FIELD = 'created_at';
const DEFAULT_SORT_ORDER = -1;
const BCRYPT_SALT_ROUNDS = 10;

const ALLOWED_SORT_FIELDS = [
    '_id',
    'name',
    'email',
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

    return {
        $or: [
            { name: { $regex: sanitizedSearch, $options: 'i' } },
            { email: { $regex: sanitizedSearch, $options: 'i' } },
            { country_code: { $regex: sanitizedSearch, $options: 'i' } },
            { phone: { $regex: sanitizedSearch, $options: 'i' } },
            { 'team_id.name': { $regex: sanitizedSearch, $options: 'i' } }
        ]
    };
};

const validateAgentData = (data, isUpdate = false) => {
    const { name, email, password, country_code, phone, team_id } = data;

    if (!name || name.trim() === '') {
        return {
            isValid: false,
            message: 'Name is required and cannot be empty'
        };
    }

    if (!email || email.trim() === '') {
        return {
            isValid: false,
            message: 'Email is required and cannot be empty'
        };
    }

    if (!isUpdate && (!password || password.trim() === '')) {
        return {
            isValid: false,
            message: 'Password is required and cannot be empty'
        };
    }

    if (!country_code || country_code === '') {
        return {
            isValid: false,
            message: 'Country Code is required and cannot be empty'
        };
    }

    if (!phone || phone.trim() === '') {
        return {
            isValid: false,
            message: 'Phone is required and cannot be empty'
        };
    }

    if (phone.trim().length < 6 || phone.trim().length > 15) {
        return {
            isValid: false,
            message: 'Phone must be between 6 and 15 digits'
        };
    }

    if (!team_id || team_id === '') {
        return {
            isValid: false,
            message: 'Team ID is required and cannot be empty'
        };
    }

    return { isValid: true };
};

const validateAndFilterIds = (ids) => {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return {
            isValid: false,
            message: 'AGENT IDs array is required and must not be empty',
            validIds: []
        };
    }

    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

    if (validIds.length === 0) {
        return {
            isValid: false,
            message: 'No valid AGENT IDs provided',
            validIds: []
        };
    }

    return {
        isValid: true,
        validIds
    };
};

export const getAllAgents = async (req, res) => {
    try {
        const { page, limit, skip } = parsePaginationParams(req.query);
        const { sortField, sortOrder } = parseSortParams(req.query);
        const searchTerm = req.query.search || '';

        const role = await Role.findOne({ name: 'agent' });
        const baseQuery = {
            role_id: role?._id,
            deleted_at: null
        };

        if (req.user.role !== 'super_admin') {
            baseQuery.created_by = req.user._id;
        }

        const searchQuery = buildSearchQuery(searchTerm);

        const finalQuery = {
            ...baseQuery,
            ...searchQuery
        };

        const totalCount = await User.countDocuments(finalQuery);

        const agents = await User.find(finalQuery)
            .sort({ [sortField]: sortOrder })
            .skip(skip)
            .limit(limit)
            .populate('team_id', 'name')
            .lean();

        return res.status(200).json({
            success: true,
            data: {
                agents,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalCount / limit),
                    totalItems: totalCount,
                    itemsPerPage: limit
                }
            }
        });
    } catch (error) {
        console.error('Error retrieving AGENTs:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve AGENTs',
            error: error.message
        });
    }
};

export const createAgent = async (req, res) => {
    try {

        const { name, email, password, note, country_code, phone, team_id, status, is_phoneno_hide } = req.body;

        const validation = validateAgentData({ name, email, password, country_code, phone, team_id }, false);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        const team = await Team.findOne({
            _id: team_id,
            user_id: req.user._id
        });

        if (!team) {
            return res.status(404).json({
                success: false,
                message: 'Team not found'
            });
        }

        const role = await Role.findOne({
            name: 'agent'
        });

        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        const duplicateQuery = {
            $or: [
                { email: email },
                { phone: phone }
            ],
            created_by: req.user._id
        };

        const duplicateAgent = await User.findOne(duplicateQuery);

        if (duplicateAgent) {
            return res.status(409).json({
                success: false,
                message: 'AGENT with this email or phone already exists'
            });
        }
        const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

        const newAgent = await User.create({
            name: name.trim(),
            email: email.trim(),
            password: hashedPassword,
            note: note ? note.trim() : null,
            country_code: country_code,
            phone: phone.trim(),
            team_id: (team_id && mongoose.Types.ObjectId.isValid(team_id)) ? team_id : null,
            created_by: req.user._id,
            role_id: role._id,
            is_phoneno_hide: is_phoneno_hide,
            status: status !== undefined ? status : true
        });

        return res.status(201).json({
            success: true,
            message: 'AGENT created successfully',
            data: newAgent
        });
    } catch (error) {
        console.error('Error creating AGENT:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create AGENT',
            error: error.message
        });
    }
};

export const updateAgent = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, email, note, country_code, phone, team_id, status, is_phoneno_hide, password } = req.body;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid AGENT ID is required'
            });
        }

        const role = await Role.findOne({
            name: 'agent'
        });

        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        const findQuery = {
            _id: id,
            role_id: role._id
        };

        if (req.user.role !== 'super_admin') {
            findQuery.created_by = req.user._id;
        }

        const existingAgent = await User.findOne(findQuery);

        if (!existingAgent) {
            return res.status(404).json({
                success: false,
                message: 'AGENT not found'
            });
        }

        const validation = validateAgentData({ name, email, note, country_code, phone, status, team_id, password }, true);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        const duplicateQuery = {
            _id: { $ne: id },
            $or: [
                { email: email },
                { phone: phone }
            ]
        };

        if (req.user.role !== 'super_admin') {
            duplicateQuery.created_by = req.user._id;
        }

        const duplicateAgent = await User.findOne(duplicateQuery);

        if (duplicateAgent) {
            return res.status(409).json({
                success: false,
                message: 'AGENT with this email or phone already exists'
            });
        }

        existingAgent.name = name.trim();
        existingAgent.email = email.trim();
        existingAgent.note = note.trim();
        existingAgent.country_code = country_code;
        existingAgent.phone = phone.trim();
        existingAgent.is_phoneno_hide = is_phoneno_hide;
        existingAgent.team_id = (team_id && mongoose.Types.ObjectId.isValid(team_id)) ? team_id : existingAgent.team_id;
        existingAgent.created_by = existingAgent.created_by || req.user._id;
        existingAgent.role_id = role._id;

        if (password && password.trim() !== '') {
            existingAgent.password = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
        }

        if (status !== undefined) {
            existingAgent.status = status;
        }

        await existingAgent.save();

        return res.status(200).json({
            success: true,
            message: 'AGENT updated successfully',
            data: existingAgent
        });
    } catch (error) {
        console.error('Error updating AGENT:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update AGENT',
            error: error.message
        });
    }
};

export const updateAgentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid AGENT ID is required'
            });
        }

        if (status === undefined || typeof status !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'Status must be a boolean value'
            });
        }

        const role = await Role.findOne({
            name: 'agent'
        });

        if (!role) {
            return res.status(404).json({
                success: false,
                message: 'Role not found'
            });
        }

        const findQuery = {
            _id: id,
            role_id: role._id
        };

        if (req.user.role !== 'super_admin') {
            findQuery.created_by = req.user._id;
        }

        const agent = await User.findOne(findQuery);

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'AGENT not found'
            });
        }


        agent.status = status;
        await agent.save();

        return res.status(200).json({
            success: true,
            message: `AGENT ${status ? 'activated' : 'deactivated'} successfully`,
            data: {
                id: agent._id,
                status: agent.status
            }
        });
    } catch (error) {
        console.error('Error updating AGENT status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update AGENT status',
            error: error.message
        });
    }
};

export const updatePhonenoStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_phoneno_hide } = req.body;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid AGENT ID is required'
            });
        }

        if (is_phoneno_hide === undefined || typeof is_phoneno_hide !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'is_phoneno_hide must be a boolean value'
            });
        }


        const role = await Role.findOne({ name: 'agent' });
        const findQuery = {
            _id: id,
            role_id: role?._id
        };

        if (req.user.role !== 'super_admin') {
            findQuery.created_by = req.user._id;
        }

        const agent = await User.findOne(findQuery);

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'AGENT not found'
            });
        }


        agent.is_phoneno_hide = is_phoneno_hide;
        await agent.save();

        return res.status(200).json({
            success: true,
            message: `Phone ${is_phoneno_hide ? 'hide' : 'show'} successfully for agent`,
            data: {
                id: agent._id,
                is_phoneno_hide: agent.is_phoneno_hide
            }
        });
    } catch (error) {
        console.error('Error updating AGENT status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update AGENT phone no status',
            error: error.message
        });
    }
};

export const deleteAgent = async (req, res) => {
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

        const role = await Role.findOne({ name: 'agent' });
        const findQuery = {
            _id: { $in: validIds },
            role_id: role?._id
        };

        if (req.user.role !== 'super_admin') {
            findQuery.created_by = req.user._id;
        }

        const existingAgents = await User.find(findQuery);

        if (existingAgents.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No AGENTs found with the provided IDs'
            });
        }

        const foundIds = existingAgents.map(agent => agent._id.toString());
        const notFoundIds = validIds.filter(id => !foundIds.includes(id.toString()));

        const deleteResult = await User.deleteMany({ _id: { $in: foundIds } });

        const response = {
            success: true,
            message: `${deleteResult.deletedCount} AGENT(s) deleted successfully`,
            data: {
                deletedCount: deleteResult.deletedCount,
                deletedIds: foundIds
            }
        };

        if (notFoundIds.length > 0) {
            response.data.notFoundIds = notFoundIds;
            response.message += `, ${notFoundIds.length} AGENT(s) not found`;
        }

        return res.status(200).json(response);
    } catch (error) {
        console.error('Error deleting AGENTs:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete AGENTs',
            error: error.message
        });
    }
};

export const getAgentById = async (req, res) => {
    try {
        const { id } = req.params;

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                message: 'Valid AGENT ID is required'
            });
        }

        const findQuery = {
            _id: id
        };

        if (req.user.role !== 'super_admin') {
            findQuery.created_by = req.user._id;
        }

        const agent = await User.findOne(findQuery).populate('team_id', 'name').lean();

        if (!agent) {
            return res.status(404).json({
                success: false,
                message: 'AGENT not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: agent
        });
    } catch (error) {
        console.error('Error retrieving AGENT:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve AGENT',
            error: error.message
        });
    }
};

export const getAgentFunnels = async (req, res) => {
    try {
        const userId = req.user.owner_id;
        const funnels = await funnelService.getFunnelsByType(userId, 'agent');
        res.status(200).json({ success: true, data: funnels });
    } catch (error) {
        console.error("Error fetching agent funnels:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getAgentKanbanStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.owner_id;
        const status = await funnelService.getItemStatus(id, userId);
        res.status(200).json({ success: true, data: status });
    } catch (error) {
        console.error("Error fetching agent kanban status:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const handleAgentKanbanAction = async (req, res) => {
    try {
        const userId = req.user.owner_id;
        const { globalItemId, actions } = req.body;

        let result;
        if (actions && Array.isArray(actions)) {
            result = await funnelService.processBulkActions({
                globalItemId,
                actions,
                userId,
                changedBy: req.user.id
            });
        } else {
            result = await funnelService.processAction({
                ...req.body,
                userId,
                changedBy: req.user.id
            });
        }

        res.status(200).json({ success: true, data: result, message: "Action processed successfully" });
    } catch (error) {
        console.error("Error processing agent kanban action:", error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export default {
    getAllAgents,
    createAgent,
    updateAgent,
    updateAgentStatus,
    deleteAgent,
    getAgentById,
    updatePhonenoStatus,
    getAgentFunnels,
    getAgentKanbanStatus,
    handleAgentKanbanAction
};
