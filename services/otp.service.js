import bcrypt from 'bcryptjs';
import { sendMail } from '../utils/mail.js';
import axios from 'axios';


const OTP_LENGTH = 6;
const BCRYPT_SALT_ROUNDS = 10;

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONENO_ID;

const formatPhoneNumber = (countryCode, phone) => {
  const cleanCountryCode = String(countryCode).replace(/\D/g, '');
  const cleanPhone = String(phone).replace(/\D/g, '');
  return `${cleanCountryCode}${cleanPhone}`;
};

export const generateOTP = () => {
  const min = Math.pow(10, OTP_LENGTH - 1);
  const max = Math.pow(10, OTP_LENGTH) - 1;
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
};

export const hashOTP = async (otp) => {
  return await bcrypt.hash(otp, BCRYPT_SALT_ROUNDS);
};

export const verifyOTP = async (otp, hashedOTP) => {
  return await bcrypt.compare(otp, hashedOTP);
};

export const sendEmailOTP = async (email, otp) => {
  const subject = 'Your Verification Code';
  const message = `${otp} is your verification code. For your security, do not share this code.`;
  await sendMail(email, subject, message);
  return true;
};

export const sendWhatsAppOTP = async (countryCode, phone, otp) => {
  try {
    const formattedPhone = formatPhoneNumber(countryCode, phone);

    const messageBody = `*${otp}* is your verification code. For your security, do not share this code. Please enter it within 5 min to verify your account.`;

    const payload = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: formattedPhone,
      type: "text",
      text: {
        preview_url: false,
        body: messageBody
      }
    };

    const response = await axios.post(
      `https://graph.facebook.com/v25.0/${PHONE_NUMBER_ID}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );

    return true;

  } catch (error) {
    console.error("[WhatsApp OTP Error]:", error.response?.data || error.message);
    return false;
  }
};

export const sendOTP = async (user, otp, channel) => {
  if (channel === 'email') {
    return await sendEmailOTP(user.email, otp);
  } else if (channel === 'whatsapp') {
    return await sendWhatsAppOTP(user.country_code, user.phone, otp);
  }
  return false;
};

export default {
  generateOTP,
  hashOTP,
  verifyOTP,
  sendEmailOTP,
  sendWhatsAppOTP,
  sendOTP
};
