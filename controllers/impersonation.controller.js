import { User, Session } from '../models/index.js';
import { generateToken } from '../utils/jwt.js';

export const startImpersonation = async (req, res) => {
  try {
    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ success: false, message: 'Target user ID is required' });
    }

    const impersonator = req.user;
    if (impersonator.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Only super_admin can impersonate users' });
    }

    const targetUser = await User.findById(targetUserId).populate('role_id').lean();
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Target user not found' });
    }

    const targetUserRole = targetUser.role_id ? targetUser.role_id.name : null;
    if (targetUserRole === 'super_admin') {
      return res.status(400).json({ success: false, message: 'Cannot impersonate another super_admin' });
    }

    const impersonationToken = generateToken({
      id: targetUser._id,
      email: targetUser.email,
      role: targetUserRole,
      isImpersonated: true,
      impersonatorId: impersonator.id
    });

    await Session.create({
      user_id: targetUser._id,
      session_token: impersonationToken,
      device_info: req.headers['user-agent'] || 'unknown',
      ip_address: req.ip,
      agenda: `impersonation_by_${impersonator.id}`,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      status: 'active',
    });

    return res.status(200).json({
      success: true,
      message: 'Impersonation started successfully',
      token: impersonationToken,
      user: {
        id: targetUser._id,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUserRole,
      }
    });
  } catch (error) {
    console.error('Error in startImpersonation:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const stopImpersonation = async (req, res) => {
  try {
    const token = req.token || req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ success: false, message: 'No token provided' });
    }

    const session = await Session.findOne({ 
      session_token: token, 
      agenda: { $regex: /^impersonation_by_/ }, 
      status: 'active' 
    });

    if (!session) {
      return res.status(400).json({ success: false, message: 'Not currently impersonating anyone' });
    }

    const impersonatorId = session.agenda.replace('impersonation_by_', '');

    const originalUser = await User.findById(impersonatorId).populate('role_id').lean();
    if (!originalUser) {
      return res.status(404).json({ success: false, message: 'Original admin not found' });
    }

    const originalUserRole = originalUser.role_id ? originalUser.role_id.name : null;

    const originalToken = generateToken({
      id: originalUser._id,
      email: originalUser.email,
      role: originalUserRole,
    });

    await Session.updateOne({ _id: session._id }, { status: 'inactive' });

    await Session.create({
      user_id: originalUser._id,
      session_token: originalToken,
      device_info: req.headers['user-agent'] || 'unknown',
      ip_address: req.ip,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'active',
    });

    return res.status(200).json({
      success: true,
      message: 'Impersonation stopped successfully',
      token: originalToken,
      user: {
        id: originalUser._id,
        name: originalUser.name,
        email: originalUser.email,
        role: originalUserRole,
      },
    });
  } catch (error) {
    console.error('Stop impersonation error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getImpersonationStatus = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      isImpersonating: !!req.isImpersonating,
      impersonatorId: req.isImpersonating ? req.impersonatorId : null,
    });
  } catch (error) {
    console.error('Get status error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export default {
  startImpersonation,
  stopImpersonation,
  getImpersonationStatus
}