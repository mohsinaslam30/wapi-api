import { ContactInquiry } from '../models/index.js';
import { sendMail, getSupportMail } from '../utils/mail.js';
import mongoose from 'mongoose';


const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const DEFAULT_SORT_FIELD = 'created_at';
const DEFAULT_SORT_ORDER = -1;
const MAX_LIMIT = 100;

const ALLOWED_SORT_FIELDS = [
  '_id',
  'name',
  'email',
  'subject',
  'message',
  'created_at',
  'updated_at'
];

const SORT_ORDER = {
  ASC: 1,
  DESC: -1
};


const parsePaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
  const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(query.limit) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};


const parseSortParams = (query) => {
  const sortField = ALLOWED_SORT_FIELDS.includes(query.sort_by)
    ? query.sort_by
    : DEFAULT_SORT_FIELD;

  const sortOrder = query.sort_order?.toUpperCase() === 'ASC'
    ? SORT_ORDER.ASC
    : SORT_ORDER.DESC;

  return { sortField, sortOrder };
};


const buildSearchQuery = (searchTerm) => {
  if (!searchTerm || searchTerm.trim() === '') {
    return {};
  }

  const sanitizedSearch = searchTerm.trim();

  return {
    $or: [
      { name: { $regex: sanitizedSearch, $options: 'i' } },
      { email: { $regex: sanitizedSearch, $options: 'i' } },
      { subject: { $regex: sanitizedSearch, $options: 'i' } },
      { message: { $regex: sanitizedSearch, $options: 'i' } }
    ]
  };
};


const validateInquiryData = (data) => {
  const { name, email, subject, message } = data;
  const errors = [];

  if (!name || name.trim() === '') {
    errors.push('Name is required');
  }

  if (!email || email.trim() === '') {
    errors.push('Email is required');
  } else if (!isValidEmail(email)) {
    errors.push('Valid email address is required');
  }

  if (!subject || subject.trim() === '') {
    errors.push('Subject is required');
  }

  if (!message || message.trim() === '') {
    errors.push('Message is required');
  }

  return {
    isValid: errors.length === 0,
    errors,
    message: errors.join(', ')
  };
};


const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};


const validateAndFilterIds = (ids) => {
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return {
      isValid: false,
      message: 'Inquiry IDs array is required and must not be empty',
      validIds: []
    };
  }

  const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

  if (validIds.length === 0) {
    return {
      isValid: false,
      message: 'No valid inquiry IDs provided',
      validIds: []
    };
  }

  return {
    isValid: true,
    validIds
  };
};


const formatNotificationEmail = (inquiry) => {
  const { name, email, subject, message } = inquiry;

  const emailBody = `
New Contact Inquiry Received
============================

From: ${name}
Email: ${email}
Subject: ${subject}

Message:
--------
${message}

----
This is an automated notification from your contact form.
  `.trim();

  return {
    subject: `New Contact Inquiry: ${subject}`,
    body: emailBody
  };
};


export const getAllInquiries = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const searchTerm = req.query.search || '';

    const searchQuery = buildSearchQuery(searchTerm);

    const totalCount = await ContactInquiry.countDocuments(searchQuery);

    const inquiries = await ContactInquiry.find(searchQuery)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        inquiries,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit
        }
      }
    });
  } catch (error) {
    console.error('Error retrieving contact inquiries:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve contact inquiries',
      error: error.message
    });
  }
};


export const getInquiryById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Valid inquiry ID is required'
      });
    }

    const inquiry = await ContactInquiry.findById(id).lean();

    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Contact inquiry not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: inquiry
    });
  } catch (error) {
    console.error('Error retrieving contact inquiry:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve contact inquiry',
      error: error.message
    });
  }
};


export const createInquiry = async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    const validation = validateInquiryData({ name, email, subject, message });
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
        errors: validation.errors
      });
    }

    const newInquiry = await ContactInquiry.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      subject: subject.trim(),
      message: message.trim(),
      created_at: new Date()
    });

    try {
      const supportEmail = await getSupportMail();

      if (supportEmail) {
        const emailContent = formatNotificationEmail({
          name: newInquiry.name,
          email: newInquiry.email,
          subject: newInquiry.subject,
          message: newInquiry.message
        });

        await sendMail(supportEmail, emailContent.subject, emailContent.body);
      }
    } catch (emailError) {
      console.error('Failed to send notification email:', emailError);
    }

    return res.status(201).json({
      success: true,
      message: 'Contact inquiry submitted successfully',
      data: {
        id: newInquiry._id,
        name: newInquiry.name,
        email: newInquiry.email,
        subject: newInquiry.subject,
        createdAt: newInquiry.created_at
      }
    });
  } catch (error) {
    console.error('Error creating contact inquiry:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit contact inquiry',
      error: error.message
    });
  }
};


export const deleteInquiry = async (req, res) => {
  try {
    const { ids } = req.body;

    const validation = validateAndFilterIds(ids);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    const { validIds } = validation;

    const existingInquiries = await ContactInquiry.find({ _id: { $in: validIds } });

    if (existingInquiries.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No contact inquiries found with the provided IDs'
      });
    }

    const foundIds = existingInquiries.map(inquiry => inquiry._id.toString());
    const notFoundIds = validIds.filter(id => !foundIds.includes(id.toString()));

    const deleteResult = await ContactInquiry.deleteMany({ _id: { $in: foundIds } });

    const response = {
      success: true,
      message: `${deleteResult.deletedCount} contact inquiry(ies) deleted successfully`,
      data: {
        deletedCount: deleteResult.deletedCount,
        deletedIds: foundIds
      }
    };

    if (notFoundIds.length > 0) {
      response.data.notFoundIds = notFoundIds;
      response.message += `, ${notFoundIds.length} inquiry(ies) not found`;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error deleting contact inquiries:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete contact inquiries',
      error: error.message
    });
  }
};


export const updateInquiryStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isRead } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Valid inquiry ID is required'
      });
    }

    if (isRead === undefined || typeof isRead !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isRead must be a boolean value'
      });
    }

    const inquiry = await ContactInquiry.findById(id);
    if (!inquiry) {
      return res.status(404).json({
        success: false,
        message: 'Contact inquiry not found'
      });
    }

    inquiry.isRead = isRead;
    await inquiry.save();

    return res.status(200).json({
      success: true,
      message: `Inquiry marked as ${isRead ? 'read' : 'unread'}`,
      data: {
        id: inquiry._id,
        isRead: inquiry.isRead
      }
    });
  } catch (error) {
    console.error('Error updating inquiry status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update inquiry status',
      error: error.message
    });
  }
};

export default {
  getAllInquiries,
  getInquiryById,
  createInquiry,
  deleteInquiry,
  updateInquiryStatus
};
