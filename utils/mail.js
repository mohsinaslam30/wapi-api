import nodemailer from 'nodemailer';
import { Setting } from '../models/index.js';

const sendMail = async (to, subject, html, attachments = []) => {
  try {
    const settings = await Setting.findOne().sort({ created_at: -1 }).lean();

    const host = (process.env.SMTP_HOST !== undefined ? process.env.SMTP_HOST : (settings?.smtp_host || '')).trim();
    const user = (process.env.SMTP_USER !== undefined ? process.env.SMTP_USER : (settings?.smtp_user || '')).trim();
    const pass = (process.env.SMTP_PASS !== undefined ? process.env.SMTP_PASS : (settings?.smtp_pass || '')).trim();
    const port = Number(process.env.SMTP_PORT !== undefined ? process.env.SMTP_PORT : (settings?.smtp_port || 587));

    if (!host || !user || !pass) {
      throw new Error('SMTP settings are not configured.');
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    const fromName = settings.mail_from_name || settings.app_name || 'App';
    const fromEmail = settings.mail_from_email || settings.smtp_user;
    const from = `${fromName} <${fromEmail}>`;

    await transporter.sendMail({ from: from, to, subject, html, attachments });
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
