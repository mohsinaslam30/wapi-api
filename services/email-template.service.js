import EmailTemplate from '../models/email-template.model.js';
import { Setting } from '../models/index.js';
import { sendMail } from '../utils/mail.js';
import { generateInvoicePDF } from '../utils/invoice-generator.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EmailTemplateService {
  async send(slug, to, data = {}, attachments = []) {
    try {
      const template = await EmailTemplate.findOne({ slug, deleted_at: null });
      if (!template) {
        console.error(`Email template with slug "${slug}" not found.`);
        return false;
      }

      const settings = await Setting.findOne().sort({ created_at: -1 }).lean();

      const frontendUrl = process.env.FRONTEND_URL || (process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',')[0] : process.env.APP_URL);

      const commonData = {
        app_name: settings?.app_name || process.env.APP_NAME,
        company_name: settings?.app_name || process.env.APP_NAME,
        login_url: frontendUrl ? `${frontendUrl}/auth/login` : '',
        ...data
      };

      let subject = template.subject;
      let content = template.content;

      Object.keys(commonData).forEach(key => {
        const placeholder = new RegExp(`{{${key}}}`, 'g');
        subject = subject.replace(placeholder, commonData[key]);
        content = content.replace(placeholder, commonData[key]);
      });

      const appLogo = settings?.app_logo ? `${frontendUrl}${settings.app_logo}` : null;
      const footerText = settings?.footer_text || `© ${new Date().getFullYear()} ${commonData.app_name}. All rights reserved.`;

      const htmlWrapper = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${subject}</title>
    <style>
        body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f4f7f6;
        }
        .container {
            max-width: 600px;
            margin: 20px auto;
            background: #ffffff;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 4px 10px rgba(0,0,0,0.05);
        }
        .header {
            padding: 30px;
            text-align: center;
            background-color: #ffffff;
            border-bottom: 1px solid #f0f0f0;
        }
        .header img {
            max-height: 50px;
        }
        .content {
            padding: 40px 30px;
            font-size: 16px;
        }
        .footer {
            padding: 20px;
            text-align: center;
            font-size: 12px;
            color: #999;
            background-color: #fafafa;
            border-top: 1px solid #f0f0f0;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 24px 0;
            font-size: 14px;
            border-radius: 4px;
            overflow: hidden;
            border: 1px solid #e2e8f0;
        }
        th {
            background-color: #f1f5f9;
            color: #1e293b;
            font-weight: 700;
            text-align: left;
            padding: 14px 16px;
            border-bottom: 2px solid #cbd5e1;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            font-size: 11px;
        }
        td {
            padding: 14px 16px;
            border-bottom: 1px solid #f1f5f9;
            color: #475569;
            vertical-align: middle;
        }
        tr:nth-child(even) {
            background-color: #f8fafc;
        }
        tr:hover {
            background-color: #f1f5f9;
        }
        tr:last-child td {
            border-bottom: none;
        }
        a {
            color: #3b82f6 !important;
            text-decoration: none !important;
            font-weight: 500 !important;
        }
        p {
            margin: 0 0 16px 0 !important;
        }
        .btn {
            display: inline-block !important;
            padding: 12px 24px !important;
            background-color: #3b82f6 !important;
            color: #ffffff !important;
            text-decoration: none !important;
            border-radius: 6px !important;
            font-weight: 600 !important;
            margin-top: 20px !important;
        }
    </style>
</head>
<body>
    <div class="container">
        ${appLogo ? `
        <div class="header">
            <img src="${appLogo}" alt="${commonData.company_name}" style="max-width: 200px; height: auto;">
        </div>` : ''}
        <div class="content">
            ${content}
        </div>
        <div class="footer">
            ${footerText}
        </div>
    </div>
</body>
</html>`;

      return await sendMail(to, subject, htmlWrapper, attachments);
    } catch (error) {
      console.error(`Error sending template email (${slug}):`, error);
      return false;
    }
  }

  async sendActivationEmail(subscription) {
    try {
      console.log(`[EmailService] Preparing activation email for sub: ${subscription._id}`);

      let sub = subscription;
      if (!sub.user_id || !sub.user_id.email || !sub.plan_id || !sub.plan_id.name) {
        sub = await subscription.constructor.findById(subscription._id).populate('user_id plan_id');
      }

      if (sub && sub.user_id && sub.user_id.email) {
        const start = new Date(sub.current_period_start);
        const end = new Date(sub.current_period_end);
        const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));

        let attachments = [];
        try {
          await new Promise(resolve => setTimeout(resolve, 500));

          const PaymentHistory = mongoose.model('PaymentHistory');
          const paymentHistory = await PaymentHistory.findOne({
            subscription_id: sub._id
          }).sort({ created_at: -1 }).populate('plan_id taxes');

          if (paymentHistory) {
            console.log(`[EmailService] Found payment history: ${paymentHistory.invoice_number}, generating PDF...`);
            const pdfBuffer = await generateInvoicePDF(paymentHistory, sub.user_id, sub.plan_id);
            attachments.push({
              filename: `Invoice-${paymentHistory.invoice_number}.pdf`,
              content: pdfBuffer
            });
          } else {
            console.warn(`[EmailService] No payment history found for sub: ${sub._id}. Sending without invoice.`);
          }
        } catch (invoiceErr) {
          console.error('[EmailService] Error generating invoice for email:', invoiceErr);
        }

        console.log(`[EmailService] Sending 'plan-activation' email to: ${sub.user_id.email}`);
        return await this.send('plan-activation', sub.user_id.email, {
          user_name: sub.user_id.name,
          plan_name: sub.plan_id?.name || 'Your Plan',
          amount_paid: `${sub.amount_paid} ${sub.currency}`,
          validity_days: diffDays
        }, attachments);
      } else {
        console.error(`[EmailService] Cannot send email. Missing user email or populated data for sub: ${sub?._id}`);
      }
    } catch (error) {
      console.error('[EmailService] Error sending activation email helper:', error);
    }
    return false;
  }

  async init() {
    try {
      const jsonPath = path.join(__dirname, '../data/email-templates.json');
      const data = await fs.readFile(jsonPath, 'utf8');
      const emailTemplates = JSON.parse(data);

      for (const template of emailTemplates) {
        await EmailTemplate.findOneAndUpdate(
          { slug: template.slug },
          { $setOnInsert: template },
          { upsert: true, returnDocument: 'after' }
        );
      }
      console.log('Email templates initialized from JSON');
    } catch (error) {
      console.error('Error initializing email templates:', error);
    }
  }
}

export default new EmailTemplateService();
