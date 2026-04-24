import PDFDocument from 'pdfkit';
import { Setting } from '../models/index.js';
import path from 'path';
import fs from 'fs';

export const generateInvoicePDF = async (paymentHistory, user, plan) => {
    return new Promise(async (resolve, reject) => {
        try {
            const settings = await Setting.findOne();
            const doc = new PDFDocument({
                margin: 50,
                size: 'A4'
            });
            const buffers = [];

            doc.on('data', buffers.push.bind(buffers));
            doc.on('end', () => {
                const pdfData = Buffer.concat(buffers);
                resolve(pdfData);
            });

            const primaryColor = '#059669';
            const secondaryColor = '#111827';
            const textColor = '#374151';
            const mutedTextColor = '#6B7280';
            const borderColor = '#E5E7EB';


            let logoPath = null;
            if (settings?.logo_light_url) {
                const relativePath = settings.logo_light_url.replace(/\\/g, '/');
                const testPath = path.join(process.cwd(), relativePath.startsWith('/') ? relativePath.substring(1) : relativePath);
                if (fs.existsSync(testPath)) {
                    logoPath = testPath;
                }
            }

            if (logoPath) {
                doc.image(logoPath, 50, 45, { width: 40 });
                doc.fillColor(secondaryColor)
                   .font('Helvetica-Bold')
                   .fontSize(18)
                   .text(settings?.app_name || 'Wapi', 100, 52);
            } else {
                doc.fillColor(primaryColor)
                   .font('Helvetica-Bold')
                   .fontSize(24)
                   .text(settings?.app_name || 'Wapi', 50, 50);
            }

            doc.fillColor(primaryColor)
               .font('Helvetica-Bold')
               .fontSize(20)
               .text('INVOICE', 400, 50, { align: 'right' });

            doc.fillColor(mutedTextColor)
               .font('Helvetica')
               .fontSize(10)
               .text(`Invoice #: ${paymentHistory.invoice_number}`, 400, 75, { align: 'right' })
               .text(`Date: ${new Date(paymentHistory.paid_at || paymentHistory.created_at).toLocaleDateString()}`, 400, 90, { align: 'right' });

            doc.moveTo(50, 120)
               .lineTo(550, 120)
               .strokeColor(borderColor)
               .lineWidth(1)
               .stroke();

            doc.fillColor(secondaryColor)
               .font('Helvetica-Bold')
               .fontSize(12)
               .text('Bill To:', 50, 150)
               .font('Helvetica')
               .fontSize(10)
               .fillColor(textColor)
               .text(user.name || 'Valued Customer', 50, 168)
               .fillColor(mutedTextColor)
               .text(user.email, 50, 183)
               .text(user.phone || '', 50, 198);

            doc.fillColor(secondaryColor)
               .font('Helvetica-Bold')
               .fontSize(12)
               .text('Issued By:', 300, 150)
               .font('Helvetica')
               .fontSize(10)
               .fillColor(textColor)
               .text(settings?.app_name || 'Wapi Service', 300, 168)
               .fillColor(mutedTextColor)
               .text(settings?.app_email || '', 300, 183);

            const tableTop = 260;
            doc.rect(50, tableTop, 500, 25)
               .fill('#F9FAFB');

            doc.fillColor(secondaryColor)
               .font('Helvetica-Bold')
               .fontSize(10)
               .text('Description', 65, tableTop + 8)
               .text('Qty', 350, tableTop + 8, { width: 50, align: 'center' })
               .text('Amount', 450, tableTop + 8, { width: 100, align: 'right' });

            const itemRowTop = tableTop + 35;
            doc.fillColor(textColor)
               .font('Helvetica')
               .fontSize(10)
               .text(`${plan.name} Subscription`, 65, itemRowTop)
               .text('1', 350, itemRowTop, { width: 50, align: 'center' });

            const totalAmount = paymentHistory.amount;
            const taxes = paymentHistory.taxes || [];
            let totalTaxPercentage = 0;
            taxes.forEach(t => {
                if (t.type === 'percentage') totalTaxPercentage += (t.rate || 0);
            });

            const baseAmount = totalAmount / (1 + (totalTaxPercentage / 100));

            doc.text(`${paymentHistory.currency} ${baseAmount.toFixed(2)}`, 450, itemRowTop, { width: 100, align: 'right' });

            let currentY = itemRowTop + 30;

            doc.moveTo(50, currentY)
               .lineTo(550, currentY)
               .strokeColor(borderColor)
               .lineWidth(0.5)
               .stroke();

            currentY += 15;

            doc.fillColor(mutedTextColor)
               .text('Subtotal', 350, currentY)
               .fillColor(textColor)
               .text(`${paymentHistory.currency} ${baseAmount.toFixed(2)}`, 450, currentY, { width: 100, align: 'right' });

            currentY += 20;

            if (taxes.length > 0) {
                for (const tax of taxes) {
                    const taxAmt = baseAmount * ((tax.rate || 0) / 100);
                    doc.fillColor(mutedTextColor)
                       .text(`${tax.name || 'Tax'} (${tax.rate || 0}%)`, 350, currentY)
                       .fillColor(textColor)
                       .text(`${paymentHistory.currency} ${taxAmt.toFixed(2)}`, 450, currentY, { width: 100, align: 'right' });
                    currentY += 20;
                }
            }

            currentY += 10;
            doc.rect(340, currentY, 210, 35)
               .fill(primaryColor);

            doc.fillColor('#FFFFFF')
               .font('Helvetica-Bold')
               .fontSize(12)
               .text('Total Paid', 355, currentY + 12)
               .fontSize(14)
               .text(`${paymentHistory.currency} ${totalAmount.toFixed(2)}`, 440, currentY + 10, { width: 100, align: 'right' });

            doc.fillColor(mutedTextColor)
               .font('Helvetica')
               .fontSize(9)
               .text('Thank you for choosing Wapi for your WhatsApp marketing needs!', 50, 750, { align: 'center', width: 500 })
               .text('For any questions, please contact support at ' + (settings?.support_email || 'support@example.com'), 50, 765, { align: 'center', width: 500 });

            doc.end();
        } catch (error) {
            console.error('Invoice PDF Generation Error:', error);
            reject(error);
        }
    });
};
