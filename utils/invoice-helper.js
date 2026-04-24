import crypto from 'crypto';


export const generateInvoiceNumber = () => {
    const randomPart = crypto.randomBytes(4).toString('hex').toUpperCase();
    const timestampPart = Date.now().toString(36).toUpperCase().slice(-4);
    return `INV-${timestampPart}-${randomPart}`;
};
