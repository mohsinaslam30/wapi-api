import { CustomField } from '../models/index.js';
import mongoose from 'mongoose';

const validateAndFilterIds = (ids) => {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return {
            isValid: false,
            message: 'Custom Fields IDs array is required and must not be empty',
            validIds: []
        };
    }

    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

    if (validIds.length === 0) {
        return {
            isValid: false,
            message: 'No valid Custom Fields IDs provided',
            validIds: []
        };
    }

    return {
        isValid: true,
        validIds
    };
};

const validateFieldDefinition = (fieldData) => {
  const errors = [];

  if (!fieldData.name || !fieldData.name.trim()) {
    errors.push('Field name is required');
  }

  if (!fieldData.label || !fieldData.label.trim()) {
    errors.push('Field label is required');
  }

  if (!fieldData.type) {
    errors.push('Field type is required');
  }

  if (fieldData.name && !/^[a-zA-Z0-9_]+$/.test(fieldData.name)) {
    errors.push('Field name can only contain letters, numbers, and underscores');
  }

  const validTypes = ['text', 'number', 'date', 'boolean', 'select', 'textarea', 'email', 'phone'];
  if (fieldData.type && !validTypes.includes(fieldData.type)) {
    errors.push(`Invalid field type. Valid types: ${validTypes.join(', ')}`);
  }

  if (fieldData.type === 'select') {
    if (!fieldData.options || !Array.isArray(fieldData.options) || fieldData.options.length === 0) {
      errors.push('Select field must have at least one option');
    } else {
      const invalidOptions = fieldData.options.filter(opt => !opt || typeof opt !== 'string');
      if (invalidOptions.length > 0) {
        errors.push('All select options must be non-empty strings');
      }
    }
  } else if (fieldData.options && fieldData.options.length > 0) {
    errors.push('Options are only allowed for select field type');
  }

  if (fieldData.min_length !== null && fieldData.min_length !== undefined) {
    if (fieldData.type !== 'text' && fieldData.type !== 'textarea') {
      errors.push('min_length is only valid for text and textarea fields');
    } else if (!Number.isInteger(fieldData.min_length) || fieldData.min_length < 0) {
      errors.push('min_length must be a positive integer');
    }
  }

  if (fieldData.max_length !== null && fieldData.max_length !== undefined) {
    if (fieldData.type !== 'text' && fieldData.type !== 'textarea') {
      errors.push('max_length is only valid for text and textarea fields');
    } else if (!Number.isInteger(fieldData.max_length) || fieldData.max_length <= 0) {
      errors.push('max_length must be a positive integer');
    }
  }

  if (fieldData.min_value !== null && fieldData.min_value !== undefined) {
    if (fieldData.type !== 'number') {
      errors.push('min_value is only valid for number fields');
    } else if (typeof fieldData.min_value !== 'number') {
      errors.push('min_value must be a number');
    }
  }

  if (fieldData.max_value !== null && fieldData.max_value !== undefined) {
    if (fieldData.type !== 'number') {
      errors.push('max_value is only valid for number fields');
    } else if (typeof fieldData.max_value !== 'number') {
      errors.push('max_value must be a number');
    }
  }

  if (fieldData.min_length !== null && fieldData.max_length !== null) {
    if (fieldData.min_length > fieldData.max_length) {
      errors.push('min_length cannot be greater than max_length');
    }
  }

  if (fieldData.min_value !== null && fieldData.max_value !== null) {
    if (fieldData.min_value > fieldData.max_value) {
      errors.push('min_value cannot be greater than max_value');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const createCustomField = async (req, res) => {
  try {
    const fieldData = req.body;

    const validation = validateFieldDefinition(fieldData);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Field validation failed',
        errors: validation.errors
      });
    }

    const existingField = await CustomField.findOne({
      name: fieldData.name.trim(),
      created_by: req.user.owner_id,
      deleted_at: null
    });

    if (existingField) {
      return res.status(409).json({
        success: false,
        message: 'A custom field with this name already exists'
      });
    }

    const cleanFieldData = {
      name: fieldData.name.trim(),
      label: fieldData.label.trim(),
      type: fieldData.type,
      is_active: fieldData.is_active ?? false,
      options: fieldData.type === 'select' ? fieldData.options : [],
      required: !!fieldData.required,
      min_length: fieldData.min_length !== undefined ? fieldData.min_length : null,
      max_length: fieldData.max_length !== undefined ? fieldData.max_length : null,
      min_value: fieldData.min_value !== undefined ? fieldData.min_value : null,
      max_value: fieldData.max_value !== undefined ? fieldData.max_value : null,
      placeholder: fieldData.placeholder ? fieldData.placeholder.trim() : null,
      description: fieldData.description ? fieldData.description.trim() : null,
      created_by: req.user.owner_id
    };

    const customField = await CustomField.create(cleanFieldData);

    return res.status(201).json({
      success: true,
      message: 'Custom field created successfully',
      data: customField
    });
  } catch (error) {
    console.error('Error creating custom field:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create custom field',
      error: error.message
    });
  }
};

export const getCustomFields = async (req, res) => {
  try {
    const {
      type,
      search,
      sort_by = 'created_at',
      sort_order = 'desc',
      page = 1,
      limit = 50
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {
      created_by: req.user.owner_id,
      deleted_at: null
    };

    if (type) {
      query.type = type;
    }

    if (search) {
      query.label = { $regex: search, $options: 'i' };
    }

    const allowedSortColumns = [
      'created_at',
      'is_active',
      'required',
      'label',
      'type'
    ];

    const sortColumn = allowedSortColumns.includes(sort_by)
      ? sort_by
      : 'created_at';

    const sortOrder = sort_order === 'asc' ? 1 : -1;

    const sort = { [sortColumn]: sortOrder };

    const customFields = await CustomField.find(query)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await CustomField.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: {
        fields: customFields,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching custom fields:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch custom fields',
      error: error.message
    });
  }
};


export const getCustomFieldById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid custom field ID'
      });
    }

    const customField = await CustomField.findOne({
      _id: id,
      created_by: req.user.owner_id,
      deleted_at: null
    });

    if (!customField) {
      return res.status(404).json({
        success: false,
        message: 'Custom field not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: customField
    });
  } catch (error) {
    console.error('Error fetching custom field:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch custom field',
      error: error.message
    });
  }
};

export const updateCustomField = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid custom field ID'
      });
    }

    const customField = await CustomField.findOne({
      _id: id,
      created_by: req.user.owner_id,
      deleted_at: null
    });

    if (!customField) {
      return res.status(404).json({
        success: false,
        message: 'Custom field not found'
      });
    }

    if (updateData.name && updateData.name !== customField.name) {
      const existingField = await CustomField.findOne({
        name: updateData.name.trim(),
        created_by: req.user.owner_id,
        deleted_at: null,
        _id: { $ne: id }
      });

      if (existingField) {
        return res.status(409).json({
          success: false,
          message: 'A custom field with this name already exists'
        });
      }
    }

    const mergedData = {
      ...customField.toObject(),
      ...updateData
    };

    if (mergedData.type !== 'text' && mergedData.type !== 'textarea') {
      mergedData.min_length = null;
      mergedData.max_length = null;
    }

    if (mergedData.type !== 'number') {
      mergedData.min_value = null;
      mergedData.max_value = null;
    }

    if (mergedData.type !== 'select') {
      mergedData.options = [];
    }

    const validation = validateFieldDefinition(mergedData);


    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Field validation failed',
        errors: validation.errors
      });
    }

    const cleanUpdateData = {};
    if (updateData.type !== undefined) {
      cleanUpdateData.type = updateData.type;

      if (updateData.type !== 'text' && updateData.type !== 'textarea') {
        cleanUpdateData.min_length = null;
        cleanUpdateData.max_length = null;
      }

      if (updateData.type !== 'number') {
        cleanUpdateData.min_value = null;
        cleanUpdateData.max_value = null;
      }

      if (updateData.type !== 'select') {
        cleanUpdateData.options = [];
      }
    }

    if (updateData.label !== undefined) {
      cleanUpdateData.label = updateData.label.trim();
    }
    if (updateData.type !== undefined) {
      cleanUpdateData.type = updateData.type;
    }
    if (updateData.options !== undefined) {
      cleanUpdateData.options = updateData.type === 'select' ? updateData.options : [];
    }
    if (updateData.required !== undefined) {
      cleanUpdateData.required = !!updateData.required;
    }
    if (updateData.min_length !== undefined) {
      cleanUpdateData.min_length = updateData.min_length !== null ? updateData.min_length : null;
    }
    if (updateData.max_length !== undefined) {
      cleanUpdateData.max_length = updateData.max_length !== null ? updateData.max_length : null;
    }
    if (updateData.min_value !== undefined) {
      cleanUpdateData.min_value = updateData.min_value !== null ? updateData.min_value : null;
    }
    if (updateData.max_value !== undefined) {
      cleanUpdateData.max_value = updateData.max_value !== null ? updateData.max_value : null;
    }
    if (updateData.placeholder !== undefined) {
      cleanUpdateData.placeholder = updateData.placeholder ? updateData.placeholder.trim() : null;
    }
    if (updateData.description !== undefined) {
      cleanUpdateData.description = updateData.description ? updateData.description.trim() : null;
    }
    if(updateData !== undefined) {
      cleanUpdateData.is_active = !!updateData.is_active;
    }

    Object.assign(customField, cleanUpdateData);
    await customField.save();

    return res.status(200).json({
      success: true,
      message: 'Custom field updated successfully',
      data: customField
    });
  } catch (error) {
    console.error('Error updating custom field:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update custom field',
      error: error.message
    });
  }
};

export const deleteCustomFields = async (req, res) => {
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

    const existingCustomFields = await CustomField.find({
      _id: { $in: validIds },
      created_by: req.user.owner_id
    });

    if (existingCustomFields.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No custom fields found with the provided IDs'
      });
    }

    const foundIds = existingCustomFields.map(field => field._id.toString());
    const notFoundIds = validIds.filter(
      id => !foundIds.includes(id.toString())
    );

    const deleteResult = await CustomField.deleteMany({
      _id: { $in: foundIds }
    });

    const response = {
      success: true,
      message: `${deleteResult.deletedCount} custom field(s) deleted successfully`,
      data: {
        deletedCount: deleteResult.deletedCount,
        deletedIds: foundIds
      }
    };

    if (notFoundIds.length > 0) {
      response.data.notFoundIds = notFoundIds;
      response.message += `, ${notFoundIds.length} custom field(s) not found`;
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error deleting custom fields:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete custom fields',
      error: error.message
    });
  }
};

export const updateCustomFieldsStatus = async (req, res) => {
  try {
    const { ids, is_active } = req.body;

    if (typeof is_active !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'is_active must be a boolean value'
      });
    }

    const validation = validateAndFilterIds(ids);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    const { validIds } = validation;

    const existingCustomFields = await CustomField.find({
      _id: { $in: validIds },
      created_by: req.user.owner_id,
      deleted_at: null
    });

    if (existingCustomFields.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No custom fields found with the provided IDs'
      });
    }

    const foundIds = existingCustomFields.map(field => field._id.toString());
    const notFoundIds = validIds.filter(
      id => !foundIds.includes(id.toString())
    );

    const updateResult = await CustomField.updateMany(
      { _id: { $in: foundIds } },
      { $set: { is_active } }
    );

    const response = {
      success: true,
      message: `Custom field(s) ${is_active ? 'activated' : 'deactivated'} successfully`,
      data: {
        matchedCount: updateResult.matchedCount,
        modifiedCount: updateResult.modifiedCount,
        updatedIds: foundIds,
        is_active
      }
    };

    if (notFoundIds.length > 0) {
      response.data.notFoundIds = notFoundIds;
      response.message += `, ${notFoundIds.length} custom field(s) not found`;
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error updating custom fields status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update custom fields status',
      error: error.message
    });
  }
};

export default {
  createCustomField,
  getCustomFields,
  getCustomFieldById,
  updateCustomField,
  deleteCustomFields,
  updateCustomFieldsStatus
};
