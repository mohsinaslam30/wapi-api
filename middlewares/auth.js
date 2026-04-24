import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { User, Session, ApiKey } from '../models/index.js';

const extractApiKeyFromRequest = (req) => {
  const headerKey = req.headers['x-api-key'];
  if (headerKey && typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('ApiKey ')) {
    return authHeader.slice('ApiKey '.length).trim();
  }

  return null;
};

export const authenticate = async (req, res, next) => {
  try {
    const apiKey = extractApiKeyFromRequest(req);

    if (apiKey) {
      const crypto = await import('crypto');
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      const key = await ApiKey.findOne({
        key_hash: keyHash,
        deleted_at: null
      }).lean();

      if (!key) {
        return res.status(401).json({
          success: false,
          message: 'Invalid API key'
        });
      }

      const user = await User.findOne({
        _id: key.user_id,
        deleted_at: null
      }).populate('role_id');

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Invalid API key: user not found'
        });
      }

      const userObj = user.toObject ? user.toObject() : user;
      userObj.id = user._id.toString();
      userObj.role = user.role_id ? user.role_id.name : null;
      userObj.owner_id = userObj.role === 'agent' ? user.created_by : user._id;
      req.user = userObj;
      req.authType = 'api_key';


      ApiKey.findByIdAndUpdate(
        key._id,
        {
          $set: {
            last_used_at: new Date(),
            last_used_ip: req.ip || null,
            last_used_user_agent: req.headers['user-agent'] || null
          }
        }
      ).catch(() => {});

      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Authorization token missing or malformed'
      });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).populate('role_id');
    if (!user || user.deleted_at) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token: user not found'
      });
    }

    const session = await Session.findOne({
      user_id: new mongoose.Types.ObjectId(user._id),
      session_token: token,
      status: 'active'
    });

    if (!session) {
      return res.status(401).json({
        success: false,
        message: 'Session expired or logged out. Please log in again.'
      });
    }

    const userObj = user.toObject ? user.toObject() : user;
    userObj.id = user._id.toString();
    userObj.role = user.role_id ? user.role_id.name : null;
    userObj.owner_id = userObj.role === 'agent' ? user.created_by : user._id;
    req.user = userObj;
    req.token = token;
    req.authType = 'jwt';

    return next();
  } catch (err) {
    console.error('JWT error:', err);
    return res.status(403).json({
      success: false,
      message: 'Token is invalid or expired'
    });
  }
};

export const authorizeRoles = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: insufficient permissions'
      });
    }
    next();
  };
};

export const authenticateUser = authenticate;

export const authorizeAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({
      success: false,
      message: 'Forbidden: Admin access required'
    });
  }
  next();
};
