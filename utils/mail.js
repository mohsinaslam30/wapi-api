import nodemailer from 'nodemailer';
import { Setting } from '../models/index.js';

const sendMail = async (to, subject, html) => {
  try {
    const settings = await Setting.findOne().sort({ created_at: -1 }).lean();
    if (!settings) throw new Error('SMTP settings not found.');

    const transporter = nodemailer.createTransport({
      host: settings.smtp_host || process.env.SMTP_HOST,
      port: settings.smtp_port || process.env.SMTP_PORT,
      secure: false,
      auth: {
        user: settings.smtp_user || process.env.SMTP_USER,
        pass: settings.smtp_pass || process.env.SMTP_PASS,
      },
    });

    const fromName = settings.mail_from_name || settings.app_name || 'App';
    const fromEmail = settings.mail_from_email || settings.smtp_user;
    const from = `${fromName} <${fromEmail}>`;

    await transporter.sendMail({ from: from, to, subject, html });
    return true;
  } catch (err) {
    console.error('Error sending mail:', err);
    return false;
  }
};

const getSupportMail = async () => {
    const settings = await Setting.findOne().sort({ created_at: -1 }).lean();
    const supportEmail = settings?.support_email;

    return supportEmail;
}

export { sendMail, getSupportMail };
