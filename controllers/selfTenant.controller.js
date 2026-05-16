import { User, Session, Setting, Role } from '../models/index.js';
import { generateToken } from '../utils/jwt.js';
import mongoose from 'mongoose';


export const switchToTenant = async (req, res) => {
  try {
    const admin = req.user;
    const adminToken = req.token;

    const tenantToken = generateToken({
      id: admin.id,
      email: admin.email,
      role: admin.role,
      isSelfTenant: true,
      originalAdminToken: adminToken
    });

    const userAgent = req.headers['user-agent'] || 'unknown';
    const ipAddress = req.ip;

    const settings = await Setting.findOne().sort({ created_at: -1 });
    const sessionExpirationDays = settings?.session_expiration_days || 7;
    const expiresAt = new Date(Date.now() + sessionExpirationDays * 24 * 60 * 60 * 1000);

    await Session.create({
      user_id: admin.id,
      session_token: tenantToken,
      device_info: userAgent,
      ip_address: ipAddress,
      agenda: 'self_tenant_mode',
      expires_at: expiresAt,
      status: 'active'
    });

    return res.status(200).json({
      success: true,
      message: 'Switched to tenant mode successfully',
      token: tenantToken,
      user: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        isSelfTenant: true
      }
    });
  } catch (error) {
    console.error('Error in switchToTenant:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};


export const backToAdmin = async (req, res) => {
  try {
    const user = req.user;
    
    if (!req.user.isSelfTenant && user.role !== 'super_admin') {
      return res.status(403).json({ success: false, message: 'Not in tenant mode or unauthorized' });
    }

    const adminToken = generateToken({
      id: user.id,
      email: user.email,
      role: 'super_admin',
      isSelfTenant: false
    });

    const userAgent = req.headers['user-agent'] || 'unknown';
    const ipAddress = req.ip;

    const settings = await Setting.findOne().sort({ created_at: -1 });
    const sessionExpirationDays = settings?.session_expiration_days || 7;
    const expiresAt = new Date(Date.now() + sessionExpirationDays * 24 * 60 * 60 * 1000);

    await Session.create({
      user_id: user.id,
      session_token: adminToken,
      device_info: userAgent,
      ip_address: ipAddress,
      agenda: 'back_to_admin',
      expires_at: expiresAt,
      status: 'active'
    });

    await Session.findOneAndDelete({ session_token: req.token });

    return res.status(200).json({
      success: true,
      message: 'Returned to admin panel successfully',
      token: adminToken,
      user: {
        id: user.id,
        email: user.email,
        role: 'super_admin'
      }
    });
  } catch (error) {
    console.error('Error in backToAdmin:', error);
    return res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
