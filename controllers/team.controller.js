import { Team, User, TeamPermission, Permission, RolePermission, Role } from "../models/index.js";
import mongoose from "mongoose";


const SORT_ORDER = {
    ASC: 1,
    DESC: -1
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_SORT_FIELD = 'sort_order';
const ALLOWED_SORT_FIELDS = ['name', 'description', 'status', 'sort_order', 'created_at', 'updated_at'];

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
            { name: { $regex: sanitizedSearch, $options: 'i' } },
            { description: { $regex: sanitizedSearch, $options: 'i' } }
        ]
    };
};


const validateTeamData = (data) => {
    const { name, status } = data;
    const errors = [];

    if (!name || name.trim() === '') {
        errors.push('Team name is required');
    }

    if (status && !['active', 'inactive'].includes(status)) {
        errors.push('Invalid status value');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

const validatePermissionSlugs = (slugs) => {
    const errors = [];

    if (!Array.isArray(slugs) || slugs.length === 0) {
        return {
            isValid: false,
            errors: ['At least one permission is required'],
            validIds: []
        };
    }

    const validSlugs = slugs.filter(slug => typeof slug === 'string' && slug.trim() !== '');

    if (validSlugs.length !== slugs.length) {
        errors.push('One or more permissions are invalid');
    }

    return {
        isValid: errors.length === 0,
        errors,
        validSlugs
    };
};

const validateAndFilterIds = (ids) => {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return {
            isValid: false,
            message: 'Team IDs array is required and must not be empty',
            validIds: []
        };
    }

    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

    if (validIds.length === 0) {
        return {
            isValid: false,
            message: 'No valid Team IDs provided',
            validIds: []
        };
    }

    return {
        isValid: true,
        validIds
    };
};

const getUserAllowedPermissions = async (user) => {
    const userRole = await Role.findOne({ name: 'user' });
    if (!userRole) return [];

    const rolePermissions = await RolePermission.find({ role_id: userRole._id }).populate('permission_id').lean();
    return rolePermissions.filter(rp => rp.permission_id).map(rp => rp.permission_id.slug);
};

export const createTeam = async (req, res) => {
    try {
        const { name, description, permissions, status } = req.body;
        const userId = req.user.id;

        const validation = validateTeamData({ name, status });
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Team validation failed',
                errors: validation.errors
            });
        }

        const permissionValidation = validatePermissionSlugs(permissions);
        if (!permissionValidation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Permission validation failed',
                errors: permissionValidation.errors
            });
        }

        const userDoc = await User.findById(userId).populate('role_id');
        if (!userDoc || !userDoc.role_id) {
            return res.status(403).json({ success: false, message: 'User role not found' });
        }

        const allowedRolePermissions = await RolePermission.find({ role_id: userDoc.role_id._id }).populate('permission_id').lean();
        const allowedSlugs = allowedRolePermissions.filter(rp => rp.permission_id).map(rp => rp.permission_id.slug);

        const role = userDoc.role_id;
        const unauthorizedPermissions = role?.name !== 'super_admin'
            ? permissions.filter(p => !allowedSlugs.includes(p))
            : [];

        if (unauthorizedPermissions.length > 0) {
            return res.status(403).json({
                success: false,
                message: 'You do not have permission to assign some of these permissions',
                unauthorizedPermissions
            });
        }

        const existingTeam = await Team.findOne({
            name: name.trim(),
            user_id: userId,
            deleted_at: null
        });

        if (existingTeam) {
            return res.status(409).json({
                success: false,
                message: 'A team with this name already exists'
            });
        }

        const team = await Team.create({
            user_id: userId,
            name,
            description,
            status: status || 'active'
        });

        if (permissions && Array.isArray(permissions) && permissions.length > 0) {
            const permissionDocs = await Permission.find().lean();
            const slugToPermissionMap = {};

            permissionDocs.forEach(doc => {
                if (doc.slug) {
                    slugToPermissionMap[doc.slug] = doc._id;
                }
            });

            const teamPermissions = [];

            permissions.forEach(slug => {
                const permissionId = slugToPermissionMap[slug];
                if (!permissionId) return;
                teamPermissions.push({
                    team_id: team._id,
                    permission_id: permissionId
                });
            });

            if (teamPermissions.length > 0) {
                await TeamPermission.insertMany(teamPermissions);
            }
        }

        return res.status(201).json({
            success: true,
            message: "Team created successfully",
            data: team
        });
    } catch (error) {
        console.error("Error creating team:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to create team",
            error: error.message
        });
    }
};

export const getAllTeams = async (req, res) => {
    try {
        const { search, status } = req.query;

        const { page, limit, skip } = parsePaginationParams(req.query);
        const { sortField, sortOrder } = parseSortParams(req.query);
        let userId = req.user._id;

        const searchQuery = buildSearchQuery(search);

        if (status !== undefined) {
            searchQuery.status = status;
        }

        const query = {
            ...searchQuery,
            user_id: req.user._id,
            deleted_at: null
        };

        if (status !== undefined) {
            query.status = status;
        }

        const user = await User.findById(req.user._id).populate('role_id');
        if (user && user.role_id && user.role_id.name === 'agent') {
            userId = user.created_by;
        }

        const teams = await Team.find(query)
            .sort({ [sortField]: sortOrder })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        const total = await Team.countDocuments(query);

        // const teamIds = teams.map(t => t._id);

        // const teamPermissions = await TeamPermission.find({
        //     team_id: { $in: teamIds }
        // }).populate('permission_id').lean();

        // const teamsWithPermissions = teams.map(team => {
        //     const permissions = teamPermissions
        //         .filter(tp => tp.team_id.toString() === team._id.toString())
        //         .map(tp => tp.permission_id);

        //     return {
        //         ...team,
        //         permissions
        //     };
        // });

        return res.status(200).json({
            success: true,
            data: {
                teams: teams,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    totalItems: total,
                    itemsPerPage: limit
                }
            }
        });

    } catch (error) {
        console.error('Error fetching teams:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch teams',
            error: error.message
        });
    }
};

export const getTeamById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid team ID" });
        }

        const team = await Team.findOne({ _id: id, user_id: userId, deleted_at: null }).lean();

        if (!team) {
            return res.status(404).json({ success: false, message: "Team not found" });
        }

        const permissions = await TeamPermission.find({ team_id: id })
            .populate('permission_id')
            .lean();

        return res.status(200).json({
            success: true,
            data: {
                ...team,
                permissions: permissions.filter(tp => tp.permission_id).map(tp => tp.permission_id.slug)
            }
        });
    } catch (error) {
        console.error("Error fetching team:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch team",
            error: error.message
        });
    }
};

export const getPermissions = async (req, res) => {
    try {
        const allowedSlugs = await getUserAllowedPermissions(req.user);
        let permissions = await Permission.find().sort({ name: 1 }).lean();

        if (allowedSlugs !== 'all') {
            permissions = permissions.filter(permission => allowedSlugs.includes(permission.slug));
        }

        const grouped = {};

        permissions.forEach(p => {
            const parts = p.slug.split('.');
            const action = parts[0];
            const moduleName = parts.length > 1 ? parts[1] : 'common';

            if (!grouped[moduleName]) {
                grouped[moduleName] = {
                    _id: p._id,
                    module: moduleName,
                    description: `${moduleName} module`,
                    submodules: []
                };
            }

            grouped[moduleName].submodules.push({
                name: action,
                slug: p.slug,
                description: p.description || `Permission to ${action} ${moduleName}`
            });
        });

        const transformedData = Object.values(grouped).sort((a, b) => a.module.localeCompare(b.module));

        return res.status(200).json({
            success: true,
            data: transformedData
        });
    } catch (error) {
        console.error("Error fetching permissions:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to fetch permissions",
            error: error.message
        });
    }
};

export const updateTeam = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, permissions, status } = req.body;

        console.log("permissions" , permissions);
        const userId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid team ID" });
        }

        const validation = validateTeamData({ name, status });
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Team validation failed',
                errors: validation.errors
            });
        }

        if (permissions) {
            const perValidation = validatePermissionSlugs(permissions);
            if (!perValidation.isValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Permission validation failed',
                    errors: perValidation.errors
                });
            }

            const userDoc = await User.findById(userId).populate('role_id');
            if (!userDoc || !userDoc.role_id) {
                return res.status(403).json({ success: false, message: 'User role not found' });
            }

            const allowedRolePermissions = await RolePermission.find({ role_id: userDoc.role_id._id }).populate('permission_id').lean();
            const allowedSlugs = allowedRolePermissions.filter(rp => rp.permission_id).map(rp => rp.permission_id.slug);

            console.log("allowedSlugs" , allowedSlugs);
            const role = userDoc.role_id;
            const unauthorizedPermissions = role?.name !== 'super_admin'
                ? permissions.filter(p => !allowedSlugs.includes(p))
                : [];
            console.log("unauthorizedPermissions" , unauthorizedPermissions)
            if (unauthorizedPermissions.length > 0) {
                return res.status(403).json({
                    success: false,
                    message: 'You do not have permission to assign some of these permissions',
                    unauthorizedPermissions
                });
            }
        }


        const nameCollision = await Team.findOne({
            name: name.trim(),
            user_id: userId,
            deleted_at: null,
            _id: { $ne: id }
        });

        if (nameCollision) {
            return res.status(409).json({
                success: false,
                message: 'A team with this name already exists'
            });
        }

        const team = await Team.findOneAndUpdate(
            { _id: id, user_id: userId, deleted_at: null },
            { name, description, status },
            { returnDocument: 'after' }
        );

        if (!team) {
            return res.status(404).json({ success: false, message: "Team not found" });
        }

        if (permissions && Array.isArray(permissions)) {
            await TeamPermission.deleteMany({ team_id: id });

            if (permissions.length > 0) {
                const permissionDocs = await Permission.find().lean();
                const slugToPermissionMap = {};

                permissionDocs.forEach(doc => {
                    if (doc.slug) {
                        slugToPermissionMap[doc.slug] = doc._id;
                    }
                });

                const teamPermissions = [];
                permissions.forEach(slug => {
                    const permissionId = slugToPermissionMap[slug];
                    if (!permissionId) return;
                    teamPermissions.push({
                        team_id: id,
                        permission_id: permissionId
                    });
                });

                if (teamPermissions.length > 0) {
                    await TeamPermission.insertMany(teamPermissions);
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: "Team updated successfully",
            data: team
        });
    } catch (error) {
        console.error("Error updating team:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update team",
            error: error.message
        });
    }
};

export const deleteTeam = async (req, res) => {
    try {
        const { ids } = req.body;
        const userId = req.user.id;

        const validation = validateAndFilterIds(ids);
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: validation.message
            });
        }

        const { validIds } = validation;

        const teams = await Team.find({
            _id: { $in: validIds },
            user_id: userId,
            deleted_at: null
        });

        if (teams.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No teams found with the provided IDs'
            });
        }

        const foundIds = teams.map(team => team._id.toString());
        const notFoundIds = validIds.filter(id => !foundIds.includes(id.toString()));

        const deletableIds = [];
        const usedIds = [];

        for (const teamId of foundIds) {
            const usageCount = await User.countDocuments({
                team_id: teamId,
                deleted_at: null
            });

            if (usageCount > 0) {
                usedIds.push(teamId);
            } else {
                deletableIds.push(teamId);
            }
        }

        if (deletableIds.length > 0) {
            await Team.updateMany(
                { _id: { $in: deletableIds } },
                { $set: { deleted_at: new Date() } }
            );
        }

        const response = {
            success: true,
            message: `${deletableIds.length} team(s) deleted successfully`,
            data: {
                deletedCount: deletableIds.length,
                deletedIds: deletableIds
            }
        };

        if (usedIds.length > 0) {
            response.data.usedIds = usedIds;
            response.message += `, ${usedIds.length} team(s) are in use by agents`;
        }

        if (notFoundIds.length > 0) {
            response.data.notFoundIds = notFoundIds;
            response.message += `, ${notFoundIds.length} team(s) not found`;
        }

        return res.status(200).json(response);

    } catch (error) {
        console.error('Error deleting teams:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete teams',
            error: error.message
        });
    }
};

export const toggleTeamStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: "Invalid team ID" });
        }

        const team = await Team.findOne({ _id: id, user_id: userId, deleted_at: null });

        if (!team) {
            return res.status(404).json({ success: false, message: "Team not found" });
        }

        team.status = team.status === 'active' ? 'inactive' : 'active';
        await team.save();

        return res.status(200).json({
            success: true,
            message: `Team ${team.status === 'active' ? 'activated' : 'deactivated'} successfully`,
            data: team
        });
    } catch (error) {
        console.error("Error toggling team status:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to toggle team status",
            error: error.message
        });
    }
};


export default {
    createTeam,
    getAllTeams,
    getTeamById,
    getPermissions,
    updateTeam,
    deleteTeam,
    toggleTeamStatus
};
