import bcrypt from 'bcryptjs';
import { sendMail } from '../utils/mail.js';
import axios from 'axios';
import { Setting, User, Template, WhatsappWaba, Role, WhatsappPhoneNumber } from '../models/index.js';
import EmailTemplateService from './email-template.service.js';

const OTP_LENGTH = 6;
const BCRYPT_SALT_ROUNDS = 10;


const formatPhoneNumber = (countryCode, phone) => {
  const cleanCountryCode = String(countryCode).replace(/\D/g, '');
  const cleanPhone = String(phone).replace(/\D/g, '');
  return `${cleanCountryCode}${cleanPhone}`;
};

export const generateOTP = async () => {
  const settings = await Setting.findOne().sort({ created_at: -1 });
  if (settings?.is_demo_mode) {
    return "123456";
  }
  const min = Math.pow(10, OTP_LENGTH - 1);
  const max = Math.pow(10, OTP_LENGTH) - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
};

export const hashOTP = async (otp) => {
  return await bcrypt.hash(otp, BCRYPT_SALT_ROUNDS);
};

export const verifyOTP = async (otp, hashedOTP) => {
  const settings = await Setting.findOne().sort({ created_at: -1 });
  if (settings?.is_demo_mode && otp === '123456') {
    return true;
  }
  return await bcrypt.compare(otp, hashedOTP);
};

export const getOTPExpiryMinutes = async () => {
  try {
    const settings = await Setting.findOne().sort({ created_at: -1 });
    if (settings?.otp_delivery_method === 'whatsapp' && settings?.whatsapp_otp_template_id) {
      const template = await Template.findById(settings.whatsapp_otp_template_id).lean();
      if (template?.authentication_options?.code_expiration_minutes) {
        return template.authentication_options.code_expiration_minutes;
      }
    }
  } catch (error) {
    console.error('Error getting OTP expiry minutes:', error);
  }
  return 5;
};

export const sendEmailOTP = async (email, otp, userName = 'User', slug = 'registration-otp') => {
  return await EmailTemplateService.send(slug, email, {
    otp_code: otp,
    user_name: userName
  });
};

export const sendWhatsAppOTP = async (countryCode, phone, otp) => {
  try {
    const settings = await Setting.findOne().sort({ created_at: -1 });
    const formattedPhone = formatPhoneNumber(countryCode, phone);

    const superAdminRole = await Role.findOne({ name: 'super_admin' });
    const admin = await User.findOne({ role_id: superAdminRole?._id, deleted_at: null });
    if (!admin) throw new Error('Super Admin not found');

    const connection = await WhatsappWaba.findOne({
      user_id: admin._id,
      connection_status: { $in: ['connected', 'initial'] },
      deleted_at: null
    }).lean();
    if (!connection) throw new Error('Admin WhatsApp connection not found');

    const accessToken = connection.access_token;
    const phoneNumber = await WhatsappPhoneNumber.findOne({ waba_id: connection._id, is_active: true }).lean();
    const phoneNumberId = phoneNumber?.phone_number_id;

    if (!accessToken || !phoneNumberId) throw new Error('WhatsApp credentials (token/ID) missing');

    let payload = {};

    if (settings?.whatsapp_otp_template_id) {
      const template = await Template.findById(settings.whatsapp_otp_template_id).lean();
      if (!template) throw new Error('OTP Template not found');

      const bodyVariables = template.body_variables || [];
      const mapping = settings.whatsapp_otp_variable_mapping || template.variables_mapping || {};
      const parameters = [];

      if (bodyVariables.length > 0) {
        const mappingKeys = Object.keys(mapping);
        let loopCount = mappingKeys.length > 0 ? mappingKeys.length : bodyVariables.length;

        if (template.category === 'AUTHENTICATION') {
          loopCount = 1;
        }

        for (let i = 0; i < loopCount; i++) {
          const varKey = String(i + 1);
          const mappedTo = mapping[varKey];

          if (mappedTo === 'otp_code') {
            parameters.push({ type: "text", text: otp });
          } else if (mappedTo === 'expiry_time') {
            const expiry = template.authentication_options?.code_expiration_minutes || 5;
            parameters.push({ type: "text", text: String(expiry) });
          } else if (mappedTo) {
            parameters.push({ type: "text", text: String(mappedTo) });
          } else if (i === 0 && mappingKeys.length === 0) {
            parameters.push({ type: "text", text: otp });
          }
        }
      } else {
        parameters.push({ type: "text", text: otp });
      }

      const components = [
        {
          type: "body",
          parameters: parameters
        }
      ];

      const allButtons = [
        ...(template.authentication_options?.otp_buttons || []),
        ...(template.buttons || [])
      ];

      if (allButtons.length > 0) {
        allButtons.forEach((btn, index) => {
          const isOtpButton = btn.type === 'OTP' || btn.otp_type === 'COPY_CODE' || btn.type === 'copy_code';
          const isUrlButton = btn.type === 'url' || btn.type === 'URL';

          if (isOtpButton || isUrlButton) {
            components.push({
              type: "button",
              sub_type: isOtpButton ? "url" : btn.type.toLowerCase(),
              index: index,
              parameters: [{ type: "text", text: otp }]
            });
          }
        });
      }

      payload = {
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "template",
        template: {
          name: template.template_name,
          language: { code: template.language || 'en_US' },
          components: components
        }
      };
    } else {
      payload = {
        messaging_product: "whatsapp",
        to: formattedPhone,
        type: "text",
        text: { body: `*${otp}* is your verification code. Valid for 5 minutes.` }
      };
    }

    await axios.post(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`,
      payload,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    return true;
  } catch (error) {
    console.error("[WhatsApp OTP Error]:", error.response?.data || error.message);
    return false;
  }
};

export const sendOTPBySettings = async (identifier, otp, metadata = {}) => {
  try {
    const settings = await Setting.findOne().sort({ created_at: -1 });
    const method = settings?.otp_delivery_method || 'email';

    if (method === 'whatsapp' && (metadata.phone || metadata.phone_number)) {
      const phone = metadata.phone || metadata.phone_number;
      const countryCode = metadata.country_code || metadata.countryCode || '91';
      return await sendWhatsAppOTP(countryCode, phone, otp);
    }

    return await sendEmailOTP(identifier, otp, metadata.user_name, metadata.slug);
  } catch (error) {
    console.error('[OTP Service sendOTPBySettings Error]:', error);
    return await sendEmailOTP(identifier, otp);
  }
};

export const sendOTP = async (user, otp, channel) => {
  if (channel === 'email') {
    return await sendEmailOTP(user.email, otp, user.name);
  } else if (channel === 'whatsapp') {
    return await sendWhatsAppOTP(user.country_code, user.phone, otp);
  }
  return false;
};

export default {
  generateOTP,
  hashOTP,
  verifyOTP,
  getOTPExpiryMinutes,
  sendEmailOTP,
  sendWhatsAppOTP,
  sendOTP,
  sendOTPBySettings
};
