import { Contact, CustomField, User, Tag, ImportJob } from '../models/index.js';
import mongoose from 'mongoose';
import { getContactExportQueue } from '../queues/contact-export-queue.js';
import { getContactImportQueue } from '../queues/contact-import-queue.js';
import path from 'path';
import fs from 'fs';

const validateTags = async (tagIds, userId) => {
  if (!tagIds || tagIds.length === 0) {
    return { isValid: true, errors: [] };
  }

  const errors = [];

  const validTagIds = tagIds.filter(id => mongoose.Types.ObjectId.isValid(id));

  if (validTagIds.length !== tagIds.length) {
    errors.push('Some tag IDs are not valid');
    return {
      isValid: false,
      errors
    };
  }

  const validTags = await Tag.forUser(userId).select('_id').lean();
  const validTagObjectIds = validTags.map(tag => tag._id.toString());

  for (const tagId of validTagIds) {
    if (!validTagObjectIds.includes(tagId.toString())) {
      errors.push(`Tag with ID '${tagId}' does not exist or does not belong to you. Please create it first using the tags API.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

const validatePhoneNumber = (phoneNumber) => {
  const cleaned = phoneNumber.replace(/[\s\-()\+]/g, '');

  if (!/^\d{10,15}$/.test(cleaned)) {
    return {
      isValid: false,
      message: 'Phone number must be 10-15 digits'
    };
  }

  return {
    isValid: true,
    cleanedNumber: cleaned
  };
};

const validateCustomFields = async (customFields = {}, userId) => {
  const errors = [];

  const userCustomFields = await CustomField.forUser(userId).lean();

  const requiredFields = userCustomFields.filter(f => f.required);

  for (const field of requiredFields) {
    const value = customFields[field.name];

    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      errors.push(`Custom field '${field.name}' is required`);
    }
  }

  for (const [fieldName, fieldValue] of Object.entries(customFields)) {
    const fieldDefinition = userCustomFields.find(f => f.name === fieldName);

    if (!fieldDefinition) {
      errors.push(`Custom field '${fieldName}' is not defined`);
      continue;
    }

    if (
      fieldValue === null ||
      fieldValue === undefined ||
      fieldValue === ''
    ) {
      continue;
    }

    switch (fieldDefinition.type) {
      case 'number': {
        if (isNaN(fieldValue)) {
          errors.push(`Custom field '${fieldName}' must be a number`);
        } else {
          const numValue = Number(fieldValue);
          if (fieldDefinition.min_value !== null && numValue < fieldDefinition.min_value) {
            errors.push(`Custom field '${fieldName}' must be at least ${fieldDefinition.min_value}`);
          }
          if (fieldDefinition.max_value !== null && numValue > fieldDefinition.max_value) {
            errors.push(`Custom field '${fieldName}' must be at most ${fieldDefinition.max_value}`);
          }
        }
        break;
      }

      case 'text':
      case 'textarea': {
        if (typeof fieldValue !== 'string') {
          errors.push(`Custom field '${fieldName}' must be text`);
        } else {
          if (fieldDefinition.min_length !== null && fieldValue.length < fieldDefinition.min_length) {
            errors.push(`Custom field '${fieldName}' must be at least ${fieldDefinition.min_length} characters`);
          }
          if (fieldDefinition.max_length !== null && fieldValue.length > fieldDefinition.max_length) {
            errors.push(`Custom field '${fieldName}' must be at most ${fieldDefinition.max_length} characters`);
          }
        }
        break;
      }

      case 'email': {
        if (
          typeof fieldValue !== 'string' ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fieldValue)
        ) {
          errors.push(`Custom field '${fieldName}' must be a valid email`);
        }
        break;
      }

      case 'phone': {
        const phoneValidation = validatePhoneNumber(fieldValue);
        if (!phoneValidation.isValid) {
          errors.push(`Custom field '${fieldName}' ${phoneValidation.message}`);
        }
        break;
      }

      case 'date': {
        if (isNaN(Date.parse(fieldValue))) {
          errors.push(`Custom field '${fieldName}' must be a valid date`);
        }
        break;
      }

      case 'boolean': {
        if (typeof fieldValue !== 'boolean') {
          errors.push(`Custom field '${fieldName}' must be true or false`);
        }
        break;
      }

      case 'select': {
        if (!fieldDefinition.options.includes(fieldValue)) {
          errors.push(
            `Custom field '${fieldName}' must be one of: ${fieldDefinition.options.join(', ')}`
          );
        }
        break;
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const importContactsFromCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'CSV file is required'
      });
    }

    const { originalname, path: filepath } = req.file;

    const fileExt = originalname.split('.').pop().toLowerCase();
    if (fileExt !== 'csv' && fileExt !== 'xlsx' && fileExt !== 'xls') {
      return res.status(400).json({
        success: false,
        message: 'Only CSV and Excel files are allowed'
      });
    }

    const userId = req.user.id;

    const importJob = await ImportJob.create({
      user_id: userId,
      original_filename: originalname,
      status: 'pending'
    });

    const contactImportQueue = getContactImportQueue();
    const job = await contactImportQueue.add('import-contacts', {
      userId,
      filepath,
      originalFilename: originalname,
      importJobId: importJob._id,
      timestamp: new Date().toISOString()
    }, {
      jobId: `import-${userId}-${Date.now()}`
    });


    return res.status(202).json({
      success: true,
      message: 'Contact import initiated. Processing in background.',
      jobId: job.id
    });

  } catch (error) {
    console.error('Error initiating contact import:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to initiate contact import',
      error: error.message
    });
  }
};

export const createContact = async (req, res) => {
  try {
    const {
      phone_number,
      name,
      source: sourceInput = 'whatsapp',
      assigned_to,
      tags = [],
      email,
      status: statusInput = 'lead',
      custom_fields = {}
    } = req.body;

    const status = statusInput === '' ? 'lead' : statusInput;
    const source = sourceInput === '' ? 'whatsapp' : sourceInput;
    const userId = req.user.owner_id;

    if (!phone_number || !name) {
      return res.status(400).json({
        success: false,
        message: 'Phone number and name are required'
      });
    }

    const phoneValidation = validatePhoneNumber(phone_number);
    if (!phoneValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: phoneValidation.message
      });
    }

    const cleanedPhoneNumber = phoneValidation.cleanedNumber;

    const existingContact = await Contact.findOne({
      phone_number: cleanedPhoneNumber,
      created_by: req.user.id,
      deleted_at: null
    });

    if (existingContact) {
      return res.status(409).json({
        success: false,
        message: 'Contact with this phone number already exists'
      });
    }

    if (assigned_to) {
      if (!mongoose.Types.ObjectId.isValid(assigned_to)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid assigned_to user ID'
        });
      }

      const agentRole = await Role.findOne({ name: 'agent' });
      const assignedUser = await User.findOne({
        _id: assigned_to,
        role_id: agentRole?._id,
        deleted_at: null
      });

      if (!assignedUser) {
        return res.status(404).json({
          success: false,
          message: 'Assigned user not found or invalid role'
        });
      }
    }

    const tagValidation = await validateTags(tags, userId);
    if (!tagValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Tag validation failed',
        errors: tagValidation.errors
      });
    }

    const normalizedTags = Array.isArray(tags)
      ? tags.map(tagId => new mongoose.Types.ObjectId(tagId)).filter(tagId => tagId)
      : [];

    const customFieldValidation = await validateCustomFields(custom_fields, userId);
    if (!customFieldValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Custom field validation failed',
        errors: customFieldValidation.errors
      });
    }

    const contact = await Contact.create({
      phone_number: cleanedPhoneNumber,
      name: name.trim(),
      source,
      assigned_to: assigned_to || null,
      tags: normalizedTags,
      email: email ? email.trim() : null,
      status,
      custom_fields,
      user_id: userId,
      created_by: req.user.id
    });

    return res.status(201).json({
      success: true,
      message: 'Contact created successfully',
      data: contact
    });
  } catch (error) {
    console.error('Error creating contact:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create contact',
      error: error.message
    });
  }
};

export const getContacts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      status,
      assigned_to,
      tags,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOrder = sort_order === 'asc' ? 1 : -1;

    const query = {
      created_by: req.user.owner_id,
      deleted_at: null
    };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { phone_number: { $regex: search, $options: 'i' } }
      ];
    }

    if (status) {
      query.status = status;
    }

    if (assigned_to) {
      query.assigned_to = assigned_to;
    }

    if (tags) {
      const tagArray = Array.isArray(tags) ? tags : tags.split(',');
      const validTagIds = tagArray.filter(id => mongoose.Types.ObjectId.isValid(id));
      query.tags = { $in: validTagIds };
    }
    console.log("query", query);
    const contacts = await Contact.find(query)
      .populate('assigned_to', 'name email')
      .populate({
        path: 'tags',
        select: '_id label color'
      })
      .sort({ [sort_by]: sortOrder })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Contact.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: {
        contacts,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching contacts:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch contacts',
      error: error.message
    });
  }
};

export const getContactById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact ID'
      });
    }

    const contact = await Contact.findOne({
      _id: id,
      user_id: req.user.owner_id,
      deleted_at: null
    }).populate('assigned_to', 'name email')
      .populate({
        path: 'tags',
        select: '_id label color'
      });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: contact
    });
  } catch (error) {
    console.error('Error fetching contact:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch contact',
      error: error.message
    });
  }
};

export const updateContact = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body || {};

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact ID'
      });
    }

    const contact = await Contact.findOne({
      _id: id,
      user_id: req.user.owner_id,
      deleted_at: null
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    if (updateData.phone_number) {
      const phoneValidation = validatePhoneNumber(updateData.phone_number);
      if (!phoneValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: phoneValidation.message
        });
      }
      updateData.phone_number = phoneValidation.cleanedNumber;

      const existingContact = await Contact.findOne({
        phone_number: updateData.phone_number,
        user_id: req.user.owner_id,
        deleted_at: null,
        _id: { $ne: id }
      });

      if (existingContact) {
        return res.status(409).json({
          success: false,
          message: 'Another contact with this phone number already exists'
        });
      }
    }

    if (updateData.assigned_to) {
      if (!mongoose.Types.ObjectId.isValid(updateData.assigned_to)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid assigned_to user ID'
        });
      }

      const allowedRoles = await Role.find({ name: { $in: ['agent', 'user'] } });
      const allowedRoleIds = allowedRoles.map(r => r._id);

      const assignedUser = await User.findOne({
        _id: updateData.assigned_to,
        role_id: { $in: allowedRoleIds },
        deleted_at: null
      });

      if (!assignedUser) {
        return res.status(404).json({
          success: false,
          message: 'Assigned user not found or invalid role'
        });
      }
    }

    if (updateData.custom_fields) {
      const customFieldValidation = await validateCustomFields(updateData.custom_fields, req.user.owner_id);
      if (!customFieldValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: 'Custom field validation failed',
          errors: customFieldValidation.errors
        });
      }
    }

    if (updateData.tags) {
      const tagValidation = await validateTags(updateData.tags, req.user.owner_id);
      if (!tagValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: 'Tag validation failed',
          errors: tagValidation.errors
        });
      }

      updateData.tags = Array.isArray(updateData.tags)
        ? updateData.tags.map(tagId => new mongoose.Types.ObjectId(tagId)).filter(tagId => tagId)
        : [];
    }

    Object.assign(contact, updateData);
    contact.updated_by = req.user.id;
    if (!contact.user_id) {
      contact.user_id = req.user.owner_id;
    }
    await contact.save();

    await contact.populate('assigned_to', 'name email');
    await contact.populate({
      path: 'tags',
      select: '_id label color'
    });

    return res.status(200).json({
      success: true,
      message: 'Contact updated successfully',
      data: contact
    });
  } catch (error) {
    console.error('Error updating contact:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update contact',
      error: error.message
    });
  }
};

export const deleteContact = async (req, res) => {
  try {
    const { id } = req.params;
    console.log("called");

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid contact ID'
      });
    }

    const contact = await Contact.findOne({
      _id: id,
      user_id: req.user.owner_id,
      deleted_at: null
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: 'Contact not found'
      });
    }

    if (!contact.user_id) {
      contact.user_id = req.user.owner_id;
    }
    await contact.softDelete();

    return res.status(200).json({
      success: true,
      message: 'Contact deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting contact:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete contact',
      error: error.message
    });
  }
};

const validateAndFilterIds = (ids) => {
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return {
      isValid: false,
      message: 'Contact IDs array is required and must not be empty',
      validIds: []
    };
  }

  const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

  if (validIds.length === 0) {
    return {
      isValid: false,
      message: 'No valid Contact IDs provided',
      validIds: []
    };
  }

  return {
    isValid: true,
    validIds
  };
};

export const bulkDeleteContacts = async (req, res) => {
  try {

    const { ids } = req.body;
    console.log("this called");
    const validation = validateAndFilterIds(ids);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    const { validIds } = validation;

    const existingContacts = await Contact.find({
      _id: { $in: validIds },
      user_id: req.user.owner_id,
      deleted_at: null
    }).select('_id');

    if (existingContacts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No contacts found with the provided IDs'
      });
    }

    const foundIds = existingContacts.map(c => c._id.toString());
    const notFoundIds = validIds.filter(
      id => !foundIds.includes(id.toString())
    );

    const result = await Contact.updateMany(
      { _id: { $in: foundIds } },
      { $set: { deleted_at: new Date() } }
    );

    const response = {
      success: true,
      message: `${result.modifiedCount} contact(s) deleted successfully`,
      data: {
        deletedCount: result.modifiedCount,
        deletedIds: foundIds
      }
    };

    if (notFoundIds.length > 0) {
      response.data.notFoundIds = notFoundIds;
      response.message += `, ${notFoundIds.length} contact(s) not found`;
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error bulk deleting contacts:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete contacts',
      error: error.message
    });
  }
};

export const getContactStats = async (req, res) => {
  try {
    const userId = req.user.owner_id;

    const totalContacts = await Contact.countDocuments({
      user_id: userId,
      deleted_at: null
    });

    const statusCounts = await Contact.aggregate([
      {
        $match: {
          user_id: new mongoose.Types.ObjectId(userId),
          deleted_at: null
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);

    const assignedCount = await Contact.countDocuments({
      created_by: userId,
      assigned_to: { $exists: true, $ne: null },
      deleted_at: null
    });

    const unassignedCount = totalContacts - assignedCount;

    const stats = {
      total: totalContacts,
      assigned: assignedCount,
      unassigned: unassignedCount,
      by_status: statusCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    };

    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error fetching contact stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch contact statistics',
      error: error.message
    });
  }
};

export const exportContacts = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { format = 'csv' } = req.body;

    if (!['csv', 'xlsx'].includes(format)) {
      return res.status(400).json({
        success: false,
        message: 'Format must be either csv or xlsx'
      });
    }

    const totalContacts = await Contact.countDocuments({
      user_id: userId,
      deleted_at: null
    });

    if (totalContacts === 0) {
      return res.status(400).json({
        success: false,
        message: 'No contacts found to export'
      });
    }

    const contactExportQueue = getContactExportQueue();
    const job = await contactExportQueue.add('export-contacts', {
      userId,
      format,
      timestamp: new Date().toISOString()
    }, {
      jobId: `export-${userId}-${Date.now()}`
    });

    return res.status(202).json({
      success: true,
      message: 'Contact export initiated. You will be notified when it\'s ready.',
      jobId: job.id,
      contactCount: totalContacts
    });

  } catch (error) {
    console.error('Error initiating contact export:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to initiate contact export',
      error: error.message
    });
  }
};

export const getExportStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id;

    const contactExportQueue = getContactExportQueue();
    const job = await contactExportQueue.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Export job not found'
      });
    }

    if (job.data.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this export job'
      });
    }

    const state = await job.getState();

    return res.status(200).json({
      success: true,
      jobId: job.id,
      state: state,
      progress: job.progress
    });

  } catch (error) {
    console.error('Error getting export status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get export status',
      error: error.message
    });
  }
};

export const downloadExport = async (req, res) => {
  try {
    const { filename } = req.params;
    const userId = req.user.id;

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({
        success: false,
        message: 'Invalid filename'
      });
    }

    const exportsDir = path.join(process.cwd(), 'exports');
    const filepath = path.join(exportsDir, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({
        success: false,
        message: 'Export file not found'
      });
    }

    if (!filename.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this file'
      });
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const fileStream = fs.createReadStream(filepath);
    fileStream.pipe(res);

    fileStream.on('close', () => {

    });

  } catch (error) {
    console.error('Error downloading export:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to download export',
      error: error.message
    });
  }
};


export default {
  createContact,
  getContacts,
  getContactById,
  updateContact,
  deleteContact,
  bulkDeleteContacts,
  getContactStats,
  exportContacts,
  getExportStatus,
  downloadExport,
  importContactsFromCSV
};
