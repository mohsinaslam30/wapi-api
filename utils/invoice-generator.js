import PDFDocument from 'pdfkit';
import { Setting } from '../models/index.js';
import path from 'path';
import fs from 'fs';
import axios from 'axios';


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
         doc.on('end', () => resolve(Buffer.concat(buffers)));

         const primaryColor = '#059669';
         const secondaryColor = '#111827';
         const textColor = '#374151';
         const mutedTextColor = '#6B7280';
         const borderColor = '#E5E7EB';

         doc.rect(0, 0, 595, 110).fill('#F9FAFB');

         let logoSource = null;
         if (settings?.logo_light_url) {
            const logoUrl = settings.logo_light_url.replace(/\\/g, '/');

            if (logoUrl.startsWith('http')) {
               try {
                  const response = await axios.get(logoUrl, { responseType: 'arraybuffer', timeout: 5000 });
                  logoSource = Buffer.from(response.data);
               } catch (err) {
                  console.error('Error fetching remote logo:', err.message);
               }
            } else {
               const testPath = path.join(process.cwd(), logoUrl.startsWith('/') ? logoUrl.substring(1) : logoUrl);
               if (fs.existsSync(testPath)) {
                  logoSource = testPath;
               }
            }
         }

         if (logoSource) {
            try {
               doc.image(logoSource, 50, 35, { width: 50 });
            } catch (err) {
               console.error('Error adding logo image to PDF:', err.message);
               doc.fillColor(primaryColor)
                  .font('Helvetica-Bold')
                  .fontSize(24)
                  .text(settings?.app_name || 'Wapi', 50, 40);
            }
         } else {
            doc.fillColor(primaryColor)
               .font('Helvetica-Bold')
               .fontSize(24)
               .text(settings?.app_name || 'Wapi', 50, 40);
         }

         doc.fillColor(secondaryColor)
            .font('Helvetica-Bold')
            .fontSize(26)
            .text('INVOICE', 400, 40, { align: 'right' });

         const invoiceDate = new Date(
            paymentHistory.paid_at || paymentHistory.created_at
         ).toLocaleDateString();

         doc.fillColor(mutedTextColor)
            .font('Helvetica')
            .fontSize(10)
            .text(`Invoice #: ${paymentHistory.invoice_number}`, 400, 70, { align: 'right' })
            .text(`Date: ${invoiceDate}`, 400, 85, { align: 'right' });

         const sectionTop = 130;

         doc.roundedRect(50, sectionTop, 220, 80, 8)
            .strokeColor(borderColor)
            .stroke();

         doc.roundedRect(300, sectionTop, 250, 80, 8)
            .strokeColor(borderColor)
            .stroke();

         doc.fillColor(secondaryColor)
            .font('Helvetica-Bold')
            .fontSize(11)
            .text('Bill To', 60, sectionTop + 10);

         doc.fillColor(textColor)
            .font('Helvetica')
            .fontSize(10)
            .text(user.name || 'Customer', 60, sectionTop + 30)
            .fillColor(mutedTextColor)
            .text(user.email || '', 60, sectionTop + 45)
            .text(user.phone || '', 60, sectionTop + 60);

         doc.fillColor(secondaryColor)
            .font('Helvetica-Bold')
            .fontSize(11)
            .text('Issued By', 310, sectionTop + 10);

         doc.fillColor(textColor)
            .font('Helvetica')
            .fontSize(10)
            .text(settings?.app_name || 'Wapi Service', 310, sectionTop + 30)
            .fillColor(mutedTextColor)
            .text(settings?.app_email || '', 310, sectionTop + 45);

         const totalAmount = paymentHistory.amount;
         const taxes = paymentHistory.taxes || [];

         let totalTaxPercentage = 0;
         taxes.forEach(t => {
            if (t.type === 'percentage') {
               totalTaxPercentage += (t.rate || 0);
            }
         });

         const baseAmount = totalAmount / (1 + totalTaxPercentage / 100);

         const tableTop = 250;

         doc.roundedRect(50, tableTop, 500, 30, 5)
            .fill('#F3F4F6');

         doc.fillColor(secondaryColor)
            .font('Helvetica-Bold')
            .fontSize(10)
            .text('Description', 65, tableTop + 10)
            .text('Qty', 350, tableTop + 10, { width: 50, align: 'center' })
            .text('Amount', 450, tableTop + 10, { width: 100, align: 'right' });

         const rowY = tableTop + 40;

         doc.fillColor(textColor)
            .font('Helvetica')
            .fontSize(10)
            .text(`${plan.name} Subscription`, 65, rowY)
            .text('1', 350, rowY, { width: 50, align: 'center' })
            .text(
               `${paymentHistory.currency} ${baseAmount.toFixed(2)}`,
               450,
               rowY,
               { width: 100, align: 'right' }
            );

         doc.moveTo(50, rowY + 20)
            .lineTo(550, rowY + 20)
            .strokeColor(borderColor)
            .stroke();

         let currentY = rowY + 40;

         doc.fillColor(mutedTextColor)
            .text('Subtotal', 350, currentY)
            .fillColor(textColor)
            .text(
               `${paymentHistory.currency} ${baseAmount.toFixed(2)}`,
               450,
               currentY,
               { align: 'right' }
            );

         currentY += 20;

         for (const tax of taxes) {
            const taxAmt = baseAmount * ((tax.rate || 0) / 100);

            doc.fillColor(mutedTextColor)
               .text(`${tax.name || 'Tax'} (${tax.rate || 0}%)`, 350, currentY)
               .fillColor(textColor)
               .text(
                  `${paymentHistory.currency} ${taxAmt.toFixed(2)}`,
                  450,
                  currentY,
                  { align: 'right' }
               );

            currentY += 20;
         }

         currentY += 10;

         doc.roundedRect(330, currentY, 220, 45, 8)
            .fill(primaryColor);

         doc.fillColor('#FFFFFF')
            .font('Helvetica-Bold')
            .fontSize(12)
            .text('Total Paid', 345, currentY + 15);

         doc.fontSize(16)
            .text(
               `${paymentHistory.currency} ${totalAmount.toFixed(2)}`,
               430,
               currentY + 12,
               { align: 'right' }
            );

         const footerY = 730;

         doc.fillColor(mutedTextColor)
            .font('Helvetica')
            .fontSize(9)
            .text(
               'Thank you for choosing Wapi for your WhatsApp marketing needs!',
               50,
               footerY,
               { align: 'center', width: 500 }
            )
            .text(
               `For support: ${settings?.support_email || 'support@example.com'}`,
               50,
               footerY + 15,
               { align: 'center', width: 500 }
            );

         doc.end();
      } catch (err) {
         console.error('Invoice PDF Error:', err);
         reject(err);
      }
   });
};