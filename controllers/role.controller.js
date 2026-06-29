import { Role, Permission, RolePermission, User, Team, TeamPermission } from '../models/index.js';
import mongoose from 'mongoose';

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
    const conditions = [
        { name: { $regex: sanitizedSearch, $options: 'i' } },
        { description: { $regex: sanitizedSearch, $options: 'i' } }
    ];

    if (sanitizedSearch.toLowerCase() === 'system') {
        conditions.push({ system_reserved: true });
    } else if (sanitizedSearch.toLowerCase() === 'custom') {
        conditions.push({ system_reserved: false });
    }

    return { $or: conditions };
};

const validateRoleData = (data) => {
    const { name, status } = data;
    const errors = [];

    if (!name || name.trim() === '') {
        errors.push('Role name is required');
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

export const createRole = async (req, res) => {
    try {
        const { name, description, permissions, status, sort_order } = req.body;

        const validation = validateRoleData({ name, status });
        if (!validation.isValid) {
            return res.status(400).json({
                success: false,
                message: 'Role validation failed',
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

        const existingRole = await Role.findOne({ name: name.trim(), deleted_at: null });
        if (existingRole) {
            return res.status(409).json({
                success: false,
                message: 'A role with this name already exists'
            });
        }

        if (name.trim().toLowerCase() === 'agent' && permissions?.length) {
            return res.status(400).json({
                success: false,
                message: 'Permissions cannot be assigned to the agent role directly. They are managed via teams.'
            });
        }

        const role = await Role.create({
            name: name.trim(),
            description,
            status: status || 'active',
            sort_order: sort_order || 0
        });

        if (permissions && permissions.length > 0) {
            const permissionDocs = await Permission.find().lean();
            const slugToPermissionMap = {};

            permissionDocs.forEach(doc => {
                if (doc.slug) {
                    slugToPermissionMap[doc.slug] = doc._id;
                }
            });

            const rolePermissionOps = [];

            permissions.forEach(slug => {
                const permissionId = slugToPermissionMap[slug];

                if (!permissionId) return;

                rolePermissionOps.push({
                    role_id: role._id,
                    permission_id: permissionId
                });
            });

            if (rolePermissionOps.length) {
                await RolePermission.insertMany(rolePermissionOps);
            }
        }

        return res.status(201).json({
            success: true,
            message: 'Role created successfully',
            data: role
        });
    } catch (error) {
        console.error('Error creating role:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to create role',
            error: error.message
        });
    }
};

export const getRoles = async (req, res) => {
    try {
        const { search, status } = req.query;
        const { page, limit, skip } = parsePaginationParams(req.query);
        const { sortField, sortOrder } = parseSortParams(req.query);

        const searchQuery = buildSearchQuery(search);
        if (status) searchQuery.status = status;
        searchQuery.deleted_at = null;

        const roles = await Role.find(searchQuery)
            .sort({ [sortField]: sortOrder })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await Role.countDocuments(searchQuery);

        // const roleIds = roles.map(r => r._id);
        // const rolePermissions = await RolePermission.find({ role_id: { $in: roleIds } })
        //     .populate('permission_id')
        //     .lean();

        // const rolesWithPermissions = roles.map(role => {
        //     const permissions = rolePermissions
        //         .filter(rp => rp.role_id.toString() === role._id.toString())
        //         .map(rp => rp.permission_id);
        //     return { ...role, permissions };
        // });

        return res.status(200).json({
            success: true,
            data: {
                roles: roles,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(total / limit),
                    totalItems: total,
                    itemsPerPage: limit
                }
            }
        });
    } catch (error) {
        console.error('Error fetching roles:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch roles',
            error: error.message
        });
    }
};

export const getRoleById = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid role ID' });
        }

        const role = await Role.findOne({ _id: id, deleted_at: null }).lean();
        if (!role) {
            return res.status(404).json({ success: false, message: 'Role not found' });
        }

        const permissions = await RolePermission.find({ role_id: id }).populate('permission_id').lean();

        return res.status(200).json({
            success: true,
            data: {
                ...role,
                permissions: permissions.filter(p => p.permission_id).map(p => p.permission_id.slug)
            }
        });
    } catch (error) {
        console.error('Error fetching role:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch role',
            error: error.message
        });
    }
};

export const updateRole = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, permissions, status, sort_order } = req.body;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid role ID' });
        }

        const role = await Role.findOne({ _id: id, deleted_at: null });

        if (!role) {
            return res.status(404).json({ success: false, message: 'Role not found' });
        }

        if (role.system_reserved && name && name.trim() !== role.name) {
            return res.status(403).json({
                success: false,
                message: 'System reserved role names cannot be changed'
            });
        }

        if (name) role.name = name.trim();
        if (description !== undefined) role.description = description;
        if (status) role.status = status;
        if (sort_order !== undefined) role.sort_order = sort_order;

        if (role.name.toLowerCase() === 'agent' && permissions?.length) {
            return res.status(400).json({
                success: false,
                message: 'Permissions cannot be assigned to the agent role directly. They are managed via teams.'
            });
        }

        await role.save();
        if (permissions && Array.isArray(permissions)) {

            const permissionDocs = await Permission.find().lean();
            const slugToPermissionMap = {};

            permissionDocs.forEach(doc => {
                if (doc.slug) slugToPermissionMap[doc.slug] = doc._id;
            });

            const existingPermissions = await RolePermission.find({ role_id: id }).populate('permission_id').lean();
            const existingSlugsMap = {};
            existingPermissions.forEach(p => {
                if (p.permission_id && p.permission_id.slug) {
                    existingSlugsMap[p.permission_id.slug] = p.permission_id._id;
                }
            });

            const existingSlugs = Object.keys(existingSlugsMap);
            const newSlugs = permissions;

            const toDeleteSlugs = existingSlugs.filter(s => !newSlugs.includes(s));
            const toAddSlugs = newSlugs.filter(s => !existingSlugs.includes(s));

            if (toDeleteSlugs.length) {
                const deleteIds = toDeleteSlugs.map(s => existingSlugsMap[s]);
                await RolePermission.deleteMany({
                    role_id: id,
                    permission_id: { $in: deleteIds }
                });
            }

            const ops = [];

            toAddSlugs.forEach(slug => {
                const permissionId = slugToPermissionMap[slug];
                if (!permissionId) return;

                ops.push({
                    updateOne: {
                        filter: { role_id: id, permission_id: permissionId },
                        update: {
                            role_id: id,
                            permission_id: permissionId
                        },
                        upsert: true
                    }
                });
            });

            if (ops.length) {
                await RolePermission.bulkWrite(ops);
            }
        }

        if (permissions && Array.isArray(permissions)) {
            const permissionDocs = await Permission.find({
                slug: { $in: permissions }
            }).select('_id');

            const allowedPermissionIds = permissionDocs.map(p => p._id);

            const usersWithRole = await User.find({ role_id: id }).select('_id');
            const userIds = usersWithRole.map(u => u._id);

            if (userIds.length > 0) {
                const teams = await Team.find({ user_id: { $in: userIds } }).select('_id');
                const teamIds = teams.map(t => t._id);

                if (teamIds.length > 0) {
                    await TeamPermission.deleteMany({
                        team_id: { $in: teamIds },
                        permission_id: { $nin: allowedPermissionIds }
                    });
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Role updated successfully',
            data: role
        });
    } catch (error) {
        console.error('Error updating role:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to update role',
            error: error.message
        });
    }
};

export const deleteRoles = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: 'Role IDs are required' });
        }

        const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));
        const allRoles = await Role.find({ _id: { $in: validIds } });

        if (allRoles.length === 0) {
            return res.status(404).json({ success: false, message: 'No roles found' });
        }

        const reservedRoles = allRoles.filter(r => r.system_reserved);
        if (reservedRoles.length > 0) {
            return res.status(403).json({
                success: false,
                message: 'System reserved roles cannot be deleted',
                reservedRoles: reservedRoles.map(r => r.name)
            });
        }

        const rolesToDelete = allRoles.filter(r => r.deleted_at === null);
        if (rolesToDelete.length === 0) {
            return res.status(404).json({ success: false, message: 'No active roles found' });
        }

        const idsToDelete = rolesToDelete.map(r => r._id);

        const deleteRole = await Role.updateMany(
            { _id: { $in: idsToDelete } },
            { $set: { deleted_at: new Date() } }
        );

        await RolePermission.deleteMany({ role_id: { $in: idsToDelete } });

        return res.status(200).json({
            success: true,
            message: `${rolesToDelete.length} role(s) deleted successfully`
        });
    } catch (error) {
        console.error('Error deleting roles:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete roles',
            error: error.message
        });
    }
};

export const toggleRoleStatus = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ success: false, message: 'Invalid role ID' });
        }

        const role = await Role.findOne({ _id: id, deleted_at: null });
        if (!role) {
            return res.status(404).json({ success: false, message: 'Role not found' });
        }

        if (role.system_reserved) {
            return res.status(403).json({
                success: false,
                message: 'System reserved role status cannot be changed'
            });
        }

        role.status = role.status === 'active' ? 'inactive' : 'active';
        await role.save();

        return res.status(200).json({
            success: true,
            message: `Role ${role.status === 'active' ? 'activated' : 'deactivated'} successfully`,
            data: role
        });
    } catch (error) {
        console.error('Error toggling role status:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to toggle role status',
            error: error.message
        });
    }
};

export const getAllPermission = async (req, res) => {
    try {
        const permissions = await Permission.find({ deleted_at: null }).lean();

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
        console.error('Error fetching permissions:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch permissions',
            error: error.message
        });
    }
}


export default {
    createRole,
    getRoles,
    getRoleById,
    updateRole,
    deleteRoles,
    toggleRoleStatus,
    getAllPermission
};
