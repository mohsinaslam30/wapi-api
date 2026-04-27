import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { generateToken } from '../utils/jwt.js';
import { User, Session, Setting, OTPLog, Subscription, Plan, Role, RolePermission, Permission, TeamPermission, WhatsappWaba, WhatsappConnection } from '../models/index.js';
import { sendMail } from '../utils/mail.js';
import UnifiedWhatsAppService from '../services/whatsapp/unified-whatsapp.service.js';
import OTPService from '../services/otp.service.js';
const OTP_LENGTH = 6;
const OTP_EXPIRATION_MINUTES = 10;
const DEFAULT_SESSION_EXPIRATION_DAYS = 7;
const MAX_ACTIVE_SESSIONS = 10;
const BCRYPT_SALT_ROUNDS = 10;

const PASSWORD_MIN_LENGTH = 8;
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 50;
const PHONE_MIN_LENGTH = 6;
const PHONE_MAX_LENGTH = 15;

const REGEX = {
  NAME: /^[a-zA-Z\s]{2,50}$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  PHONE: /^\d{6,15}$/
};


const generateOTP = () => {
  const min = Math.pow(10, OTP_LENGTH - 1);
  const max = Math.pow(10, OTP_LENGTH) - 1;
  return "123456";
};


const validateRegistrationInput = (data) => {
  const { name, email, phone, countryCode, password } = data;
  const errors = [];

  if (!name || !email || !phone || !countryCode || !password) {
    return {
      isValid: false,
      message: 'All fields are required',
      errors: ['name', 'email', 'phone', 'countryCode', 'password'].filter(
        field => !data[field]
      )
    };
  }

  if (!REGEX.NAME.test(name.trim())) {
    errors.push(
      `Name must be ${NAME_MIN_LENGTH}-${NAME_MAX_LENGTH} characters and contain only letters and spaces`
    );
  }

  if (!REGEX.EMAIL.test(email)) {
    errors.push('Please enter a valid email address');
  }

  if (!REGEX.PHONE.test(phone)) {
    errors.push(`Phone number must be ${PHONE_MIN_LENGTH}-${PHONE_MAX_LENGTH} digits`);
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    message: errors.join(', ')
  };
};


const validateLoginIdentifier = (identifier) => {
  const isEmail = REGEX.EMAIL.test(identifier);
  const isPhone = REGEX.PHONE.test(identifier);

  if (!isEmail && !isPhone) {
    return {
      isValid: false,
      type: null,
      message: 'Invalid email or phone number format'
    };
  }

  return {
    isValid: true,
    type: isEmail ? 'email' : 'phone',
    normalizedValue: isEmail ? identifier.toLowerCase().trim() : identifier
  };
};


export const findUserByIdentifier = async (value, type) => {
  const query = {
    deleted_at: null
  };

  if (type === 'email') query.email = value;
  if (type === 'phone') query.phone = value;

  return User.findOne(query).populate('role_id');
};



const manageUserSessions = async (userId, userAgent) => {
  const activeSessions = await Session.find({
    user_id: userId,
    status: 'active',
    device_info: userAgent
  }).sort({ created_at: 1 });

  if (activeSessions.length >= MAX_ACTIVE_SESSIONS) {
    const oldestSession = activeSessions[0];
    await Session.findByIdAndDelete(oldestSession._id);
  }
};


const createUserSession = async (params) => {
  const { userId, token, userAgent, ipAddress, agenda } = params;

  const settings = await Setting.findOne().sort({ created_at: -1 });
  const sessionExpirationDays = settings?.session_expiration_days || DEFAULT_SESSION_EXPIRATION_DAYS;

  const expiresAt = new Date(
    Date.now() + sessionExpirationDays * 24 * 60 * 60 * 1000
  );

  return await Session.create({
    user_id: userId,
    session_token: token,
    device_info: userAgent,
    ip_address: ipAddress,
    agenda: agenda || 'login',
    expires_at: expiresAt,
    status: 'active'
  });
};


const getOTPExpirationTime = () => {
  return new Date(Date.now() + OTP_EXPIRATION_MINUTES * 60 * 1000);
};


const sendOTPEmail = async (email, otp, subject = 'Your OTP Code') => {
  const emailBody = `
Your OTP Code
=============

Your one-time password (OTP) is: ${otp}

This code will expire in ${OTP_EXPIRATION_MINUTES} minutes.

If you did not request this code, please ignore this email.

----
This is an automated message. Please do not reply.
  `.trim();

  await sendMail(email, subject, emailBody);
};


export const register = async (req, res) => {
  const { name, email, phone, countryCode, password } = req.body;

  if (!name || !email || !phone || !countryCode || !password) {
    return res.status(400).json({ message: 'All fields are required.' });
  }

  try {
    const {
      name,
      email,
      phone,
      countryCode,
      password
    } = req.body;

    const role = await Role.findOne({ name: 'user' });
    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Role not found'
      });
    }

    const validation = validateRegistrationInput({
      name,
      email,
      phone,
      countryCode,
      password
    });

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
        errors: validation.errors
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingEmail = await User.findOne({
      email: normalizedEmail,
      deleted_at: null
    });

    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: 'Email already registered'
      });
    }

    const existingPhone = await User.findOne({
      country_code: countryCode,
      phone,
      deleted_at: null
    });

    if (existingPhone) return res.status(409).json({ message: 'Phone number already registered' });

    const nameRegex = /^[a-zA-Z\s]{2,50}$/;
    if (!nameRegex.test(name.trim())) {
      return res.status(400).json({ message: 'Name must be 2-50 characters long and contain only letters and spaces' });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const settings = await Setting.findOne().sort({ created_at: -1 });
    const globalStorageLimitMB = settings?.storage_limit || 100;

    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      country_code: countryCode,
      phone,
      role_id: role._id,
      password: hashedPassword,
      storage_limit: globalStorageLimitMB,
      is_verified: false,
      phone_verified: false
    });

    const otp = OTPService.generateOTP();
    const hashedOTP = await OTPService.hashOTP(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await OTPLog.create({
      user_id: newUser._id,
      email: normalizedEmail,
      otp: hashedOTP,
      channel: 'whatsapp',
      whatsapp_count: 1,
      expires_at: expiresAt,
      last_sent_at: new Date()
    });

    const whatsappResult = await OTPService.sendWhatsAppOTP(countryCode, phone, otp);
    if (!whatsappResult) {
      return res.status(500).json({
        success: false,
        message: 'Failed to send WhatsApp OTP. Please try again later.'
      });
    }

    try {
      const user = await User.findById(newUser._id).populate('role_id');

      if (user.role_id.name === 'user') {
        const settings = await Setting.findOne().sort({ created_at: -1 });
        if (settings && settings.free_trial_enabled && settings.free_trial_days > 0) {
          const trialPlan = await Plan.findOne({
            billing_cycle: 'free Trial',
            is_active: true,
            deleted_at: null
          });

          if (trialPlan) {
            const trialEndsAt = new Date();
            trialEndsAt.setDate(trialEndsAt.getDate() + settings.free_trial_days);

            await Subscription.create({
              user_id: newUser._id,
              plan_id: trialPlan._id,
              status: 'trial',
              current_period_start: new Date(),
              current_period_end: trialEndsAt,
              trial_ends_at: trialEndsAt,
              started_at: new Date(),
              features: trialPlan.features
            });
          } else {
            console.warn('Free trial enabled but no active "free Trial" plan found.');
          }
        }
      }
    } catch (trialError) {
      console.error('Failed to assign free trial to new user:', trialError);
    }

    return res.status(201).json({
      success: true,
      message: `${role.name} registered successfully`,
      data: {
        redirect: '/verify-signup-otp',
        user_id: newUser._id,
        identifier: normalizedEmail
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to register',
      error: error.message
    });
  }
};

export const login = async (req, res) => {
  try {
    const { identifier, password, agenda, role_id } = req.body;
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email/phone and password are required'
      });
    }

    const role = await Role.findOne({ name: 'user' });
    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Role not found'
      });
    }


    const identifierValidation = validateLoginIdentifier(identifier);
    if (!identifierValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: identifierValidation.message
      });
    }

    const user = await findUserByIdentifier(
      identifierValidation.normalizedValue,
      identifierValidation.type
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.status === false || user.status === 'deactive') {
      return res.status(403).json({
        success: false,
        message: 'Your account is deactivated'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid password'
      });
    }

    if (role_id && user.role_id?._id.toString() !== role_id) {
      return res.status(401).json({
        success: false,
        message: 'You are not authorized to login with this role'
      });
    }

    const roleName = user.role_id?.name || 'user';

    const token = generateToken({
      id: user._id.toString(),
      email: user.email,
      role: roleName
    });

    await manageUserSessions(user._id, userAgent);

    await createUserSession({
      userId: user._id,
      token,
      userAgent,
      ipAddress,
      is_phoneno_hide: user.is_phoneno_hide,
      agenda
    });

    await User.findByIdAndUpdate(user._id, { last_login: new Date() });

    return res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: roleName,
        is_phoneno_hide: user.is_phoneno_hide
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to login',
      error: error.message
    });
  }
};

export const forgotPassword = async (req, res) => {
  const { email } = req.body;
  const ip = req.ip;

  try {
    const user = await User.findOne({ email: email.toLowerCase().trim(), deleted_at: null });
    if (!user) return res.status(404).json({ message: 'User not found.' });

    const otp = generateOTP();
    const expires_at = new Date(Date.now() + 10 * 60 * 1000);

    await OTPLog.create({
      email: email.toLowerCase().trim(),
      otp,
      expires_at,
      verified: false
    });

    await sendMail(email, 'Password Reset OTP', `Your OTP is: ${otp}`);

    return res.status(201).json({ message: 'OTP sent to your email.' });
  } catch (err) {
    console.error('Forgot Password Error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const verifyOTP = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const ip = req.ip;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const otpLog = await OTPLog.findOne({
      email: email.toLowerCase().trim(),
      otp,
      verified: false
    }).sort({ created_at: -1 });

    if (!otpLog) {
      return res.status(400).json({ message: 'Invalid or expired OTP' });
    }

    if (otpLog.expires_at < new Date()) {
      return res.status(400).json({ message: 'OTP has expired' });
    }

    otpLog.verified = true;
    await otpLog.save();

    const user = await User.findOne({ email: email.toLowerCase().trim(), deleted_at: null });
    if (user) {
      await User.findByIdAndUpdate(user._id, { email_verified: true });
    }

    res.status(201).json({
      message: 'OTP verified successfully',
    });

  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const resendOTP = async (req, res) => {
  try {
    const { email } = req.body;
    const ip = req.ip;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingOTP = await OTPLog.findOne({
      email: normalizedEmail,
      verified: false
    }).sort({ created_at: -1 });

    let otp;
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    if (!existingOTP || existingOTP.expires_at < new Date()) {
      otp = generateOTP();

      await OTPLog.create({
        email: normalizedEmail,
        otp,
        expires_at: expiresAt
      });
    } else {
      otp = existingOTP.otp;
      existingOTP.expires_at = expiresAt;
      await existingOTP.save();
    }

    await sendOTPEmail(normalizedEmail, otp);

    return res.status(200).json({ message: 'OTP resent successfully' });

  } catch (error) {
    console.error('Error resending OTP:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

export const resetPassword = async (req, res) => {
  const { email, otp, new_password } = req.body;
  const ip = req.ip;

  try {
    const { email, otp, new_password: newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Email, OTP, and new password are required'
      });
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const otpRecord = await OTPLog.findOne({
      email: email.toLowerCase().trim(),
      otp,
      verified: true,
      expires_at: { $gt: new Date() }
    }).sort({ created_at: -1 });

    if (!otpRecord) {
      return res.status(400).json({ message: 'Invalid or session expired.' });
    }

    const user = await User.findOne({
      email: normalizedEmail,
      deleted_at: null
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await User.findByIdAndUpdate(user._id, { password: hashedPassword });

    otpRecord.verified = true;
    await otpRecord.save();

    return res.status(201).json({ message: 'Password reset successful.' });

  } catch (err) {
    console.error('Reset Password Error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const resetPasswordViaToken = async (req, res) => {
  try {
    const { token, new_password: newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, message: 'Token and new password are required' });
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({ success: false, message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long` });
    }

    const user = await User.findOne({
      reset_password_token: token,
      reset_password_expires: { $gt: new Date() },
      deleted_at: null
    });

    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid or expired reset token' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    user.password = hashedPassword;
    user.reset_password_token = null;
    user.reset_password_expires = null;
    await user.save();

    return res.status(200).json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset Password Via Token Error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', });
  }
};

export const logout = async (req, res) => {
  try {
    const userId = req.user.id;
    const token = req.token;

    const session = await Session.findOne({
      user_id: new mongoose.Types.ObjectId(userId),
      session_token: token,
      status: 'active'
    });

    if (!session) {
      return res.status(404).json({ message: 'Session not found or already logged out.' });
    }

    await Session.findByIdAndDelete(session._id);
    return res.status(200).json({ message: 'Logged out successfully.' });
  } catch (error) {
    console.error('Error in logout:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const changePassword = async (req, res) => {
  try {
    const userId = req.user.id;
    const { current_password: currentPassword, new_password: newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'current_password and new_password are required'
      });
    }

    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters long`
      });
    }

    const user = await User.findOne({
      _id: userId,
      deleted_at: null
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password || '');
    if (!isCurrentValid) {
      return res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    const isSameAsOld = await bcrypt.compare(newPassword, user.password || '');
    if (isSameAsOld) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from current password'
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    user.password = hashedPassword;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    console.error('Error changing password:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: error.message
    });
  }
};

export const getProfile = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const requesterRole = req.user.role;
    const { user_id: targetUserId } = req.query;

    let targetId = requesterId;

    if (targetUserId && requesterRole === 'super_admin') {
      if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user_id'
        });
      }
      targetId = targetUserId;
    } else if (targetUserId && requesterRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to view other users'
      });
    }

    const user = await User.findOne({
      _id: targetId,
      deleted_at: null
    }).populate('role_id');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        is_phoneno_hide: user.is_phoneno_hide ?? '',
        country: user.country,
        country_code: user.country_code,
        note: user.note,
        role: user.role_id?.name || 'user',
        status: user.status,
        storage_limit: `${user.storage_limit || 0} MB`,
        storage_used: `${parseFloat(((user.storage_used || 0) / (1024 * 1024)).toFixed(2))} MB`
      }
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch profile',
      error: error.message
    });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const requesterRole = req.user.role;
    const { user_id: targetUserId } = req.body;

    let targetId = requesterId;

    if (targetUserId && requesterRole === 'super_admin') {
      if (!mongoose.Types.ObjectId.isValid(targetUserId)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid user_id'
        });
      }
      targetId = targetUserId;
    } else if (targetUserId && requesterRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'You are not allowed to update other users'
      });
    }

    const user = await User.findOne({
      _id: targetId,
      deleted_at: null
    }).populate('role_id');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const updatableFields = ['name', 'phone', 'country', 'country_code', 'note', 'email'];
    const updateData = {};

    updatableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updateData[field] = req.body[field];
      }
    });

    if (requesterRole === 'super_admin' && req.body.status !== undefined) {
      updateData.status = req.body.status;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid fields provided to update'
      });
    }

    Object.assign(user, updateData);
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        country: user.country,
        country_code: user.country_code,
        note: user.note,
        role: user.role_id?.name || 'user',
        status: user.status
      }
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error.message
    });
  }
};

export const getMyPermissions = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).populate('role_id');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let permissions = [];

    if (user.team_id) {
      const teamPermissions = await TeamPermission.find({ team_id: user.team_id }).populate('permission_id').lean();
      permissions = teamPermissions.filter(tp => tp.permission_id).map(tp => tp.permission_id);
    } else if (user.role_id) {
      const rolePermissions = await RolePermission.find({ role_id: user.role_id._id }).populate('permission_id').lean();
      permissions = rolePermissions.filter(rp => rp.permission_id).map(rp => rp.permission_id);
    }

    if (permissions.length === 0) {
      return res.status(200).json({ success: true, data: [] });
    }

    const grouped = {};

    permissions.forEach(p => {
      const parts = p.slug?.split('.');
      if (!parts) return;

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
    console.error('Error fetching user permissions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch permissions',
      error: error.message
    });
  }
};

export const getPublicRoles = async (req, res) => {
  try {
    const roles = await Role.find({ status: 'active', deleted_at: null })
      .select('name _id')
      .sort({ sort_order: 1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: roles
    });
  } catch (error) {
    console.error('Error fetching public roles:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch roles',
      error: error.message
    });
  }
};

export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    try {
      const activeWabas = await WhatsappWaba.find({ user_id: userId, deleted_at: null });
      for (const waba of activeWabas) {
        try {
          await UnifiedWhatsAppService.disconnectWhatsApp(userId, waba.provider, waba._id);
        } catch (err) {
          console.error(`Failed to disconnect WABA ${waba._id}:`, err.message);
        }
      }
    } catch (err) {
      console.error('Error fetching/disconnecting WABAs:', err.message);
    }

    await WhatsappConnection.deleteMany({ user_id: userId });
    await WhatsappWaba.deleteMany({ user_id: userId });

    await Subscription.updateMany(
      { user_id: userId, deleted_at: null },
      { $set: { deleted_at: now, status: 'cancelled', cancelled_at: now } }
    );

    user.deleted_at = now;
    user.status = false;
    await user.save();

    await Session.deleteMany({ user_id: userId });

    await OTPLog.deleteMany({ email: user.email });

    return res.status(200).json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    console.error('Error in deleteAccount:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete account',
      error: error.message
    });
  }
};

export const resendSignUpOTP = async (req, res) => {
  try {
    const { identifier, channel } = req.body;
    if (!identifier || !channel) {
      return res.status(400).json({ success: false, message: 'Identifier and channel are required' });
    }

    if (!['email', 'whatsapp'].includes(channel)) {
      return res.status(400).json({ success: false, message: 'Invalid channel' });
    }

    const validation = validateLoginIdentifier(identifier);
    if (!validation.isValid) return res.status(400).json({ success: false, message: validation.message });

    const user = await findUserByIdentifier(validation.normalizedValue, validation.type);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const lastOTP = await OTPLog.findOne({ user_id: user._id }).sort({ created_at: -1 });

    if (lastOTP && (Date.now() - new Date(lastOTP.last_sent_at).getTime() < 60000)) {
      return res.status(429).json({
        success: false,
        message: 'Please wait 60 seconds before requesting another OTP'
      });
    }

    let whatsappCount = lastOTP ? lastOTP.whatsapp_count : 0;
    let emailCount = lastOTP ? lastOTP.email_count : 0;

    if (channel === 'whatsapp' && whatsappCount >= 5) {
      return res.status(400).json({
        success: false,
        message: 'Maximum WhatsApp OTP limit reached. Please use Email verification.'
      });
    }

    const otp = OTPService.generateOTP();
    const hashedOTP = await OTPService.hashOTP(otp);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    if (channel === 'whatsapp') whatsappCount++;
    if (channel === 'email') emailCount++;

    await OTPLog.create({
      user_id: user._id,
      email: user.email,
      otp: hashedOTP,
      channel: channel,
      whatsapp_count: whatsappCount,
      email_count: emailCount,
      expires_at: expiresAt,
      last_sent_at: new Date()
    });

    let sent = false;
    if (channel === 'whatsapp') {
      sent = await OTPService.sendWhatsAppOTP(user.country_code, user.phone, otp);
    } else {
      sent = await OTPService.sendEmailOTP(user.email, otp);
    }

    if (!sent) {
      return res.status(500).json({
        success: false,
        message: `Failed to send OTP via ${channel}. Please try again later.`
      });
    }

    return res.status(200).json({
      success: true,
      message: `OTP resent successfully via ${channel}`
    });
  } catch (error) {
    console.error('Error resending signup OTP:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

export const verifySignUpOTP = async (req, res) => {
  try {
    const { identifier, otp } = req.body;
    if (!identifier || !otp) {
      return res.status(400).json({ success: false, message: 'Identifier and OTP are required' });
    }

    const validation = validateLoginIdentifier(identifier);
    if (!validation.isValid) return res.status(400).json({ success: false, message: validation.message });

    const user = await findUserByIdentifier(validation.normalizedValue, validation.type);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const otpLog = await OTPLog.findOne({
      user_id: user._id,
      verified: false
    }).sort({ created_at: -1 });

    if (!otpLog) return res.status(400).json({ success: false, message: 'No pending OTP found' });

    if (new Date() > otpLog.expires_at) {
      await OTPLog.findByIdAndDelete(otpLog._id);
      return res.status(400).json({ success: false, message: 'OTP has expired' });
    }

    const isValid = await OTPService.verifyOTP(otp, otpLog.otp);
    if (!isValid) return res.status(400).json({ success: false, message: 'Invalid OTP' });

    otpLog.verified = true;
    await otpLog.save();

    user.is_verified = true;
    if (otpLog.channel === 'email') user.email_verified = true;
    if (otpLog.channel === 'whatsapp') user.phone_verified = true;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Account verified successfully',
      data: {
        redirect: '/login',
      }
    });
  } catch (error) {
    console.error('Error verifying signup OTP:', error);
    return res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
};

export default {
  register,
  login,
  forgotPassword,
  verifyOTP,
  resendOTP,
  resetPassword,
  logout,
  changePassword,
  getProfile,
  updateProfile,
  getMyPermissions,
  getPublicRoles,
  resetPasswordViaToken,
  deleteAccount,
  resendSignUpOTP,
  verifySignUpOTP
};