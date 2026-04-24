import { User, Permission, RolePermission, TeamPermission } from '../models/index.js';

export const checkPermission = (permissionSlug) => {
  return async (req, res, next) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      let userRole;
      if (user.role_id && user.role_id.name) {
        userRole = user.role_id;
      } else {
        const userWithRole = await User.findById(user._id).populate('role_id').lean();
        if (!userWithRole || !userWithRole.role_id) {
          return res.status(403).json({
            success: false,
            message: 'Forbidden: No role assigned to user'
          });
        }
        userRole = userWithRole.role_id;
      }

      if (userRole.name === 'super_admin') {
        return next();
      }

      const permissionDoc = await Permission.findOne({ slug: permissionSlug }).lean();

      if (!permissionDoc) {
        return res.status(403).json({
          success: false,
          message: 'Invalid permission requested'
        });
      }

      if (userRole.name === 'agent') {
        if (!user.team_id) {
          return res.status(403).json({
            success: false,
            message: 'Agent not assigned to any team'
          });
        }

        const hasPermission = await TeamPermission.exists({
          team_id: user.team_id,
          permission_id: permissionDoc._id
        });

        if (!hasPermission) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: Team permission missing'
          });
        }

        return next();
      }

      const hasPermission = await RolePermission.exists({
        role_id: userRole._id,
        permission_id: permissionDoc._id
      });

      if (!hasPermission) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Role permission missing'
        });
      }

      return next();

    } catch (error) {
      console.error('Permission middleware error:', error);
      return res.status(500).json({
        success: false,
        message: 'Internal server error during permission check'
      });
    }
  };
};
