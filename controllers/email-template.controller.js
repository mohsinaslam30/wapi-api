import EmailTemplate from '../models/email-template.model.js';

const SORT_ORDER = {
  ASC: 1,
  DESC: -1
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_SORT_FIELD = 'created_at';
const ALLOWED_SORT_FIELDS = ['name', 'slug', 'subject', 'created_at', 'updated_at'];

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

export const listEmailTemplates = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const { search } = req.query;

    const query = { deleted_at: null };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { subject: { $regex: search, $options: 'i' } },
        { slug: { $regex: search, $options: 'i' } }
      ];
    }

    const total = await EmailTemplate.countDocuments(query);
    const templates = await EmailTemplate.find(query)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      data: templates,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error listing email templates:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch email templates'
    });
  }
};

export const getEmailTemplateById = async (req, res) => {
  try {
    const { id } = req.params;
    const template = await EmailTemplate.findOne({ _id: id, deleted_at: null });
    
    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: template
    });
  } catch (error) {
    console.error('Error getting email template:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch template'
    });
  }
};
import mongoose from 'mongoose';

export const updateEmailTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { subject, content } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid template id'
      });
    }

    if (!subject?.trim() || !content?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Subject and content are required'
      });
    }

    if (subject.length > 255) {
      return res.status(400).json({
        success: false,
        message: 'Subject must be less than 255 characters'
      });
    }

    const template = await EmailTemplate.findOneAndUpdate(
      { _id: id, deleted_at: null },
      {
        subject: subject.trim(),
        content: content.trim()
      },
      {
        returnDocument: 'after',
        runValidators: true
      }
    );

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'Template not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Template updated successfully',
      data: template
    });

  } catch (error) {
    console.error('Error updating email template:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update template'
    });
  }
};