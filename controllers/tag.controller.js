import { Tag, Contact, User } from '../models/index.js';
import mongoose from 'mongoose';

const validateTagData = (tagData) => {
  const errors = [];

  if (!tagData.label || typeof tagData.label !== 'string' || !tagData.label.trim()) {
    errors.push('Tag label is required');
  } else if (!/^[a-zA-Z0-9 _-]+$/.test(tagData.label.trim())) {
    errors.push('Tag label can only contain letters, numbers, spaces, hyphens, and underscores');
  }

  if (tagData.color && !/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(tagData.color)) {
    errors.push('Invalid color format. Use hex color codes like #ff0000');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

export const createTag = async (req, res) => {
  try {
    const tagData = req.body;

    const validation = validateTagData(tagData);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Tag validation failed',
        errors: validation.errors
      });
    }


    const tagLabel = tagData.label.trim();


    const existingTagLabel = await Tag.findOne({
      label: tagLabel,
      created_by: req.user.owner_id,
      deleted_at: null
    });

    if (existingTagLabel) {
      return res.status(409).json({
        success: false,
        message: 'A tag with this label already exists'
      });
    }

    const tag = await Tag.create({
      label: tagLabel,
      color: tagData.color || '#007bff',
      created_by: req.user.owner_id
    });

    return res.status(201).json({
      success: true,
      message: 'Tag created successfully',
      data: tag
    });
  } catch (error) {
    console.error('Error creating tag:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create tag',
      error: error.message
    });
  }
};

export const getTags = async (req, res) => {
  try {
    const {
      search = '',
      page = 1,
      limit = 50,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOrder = sort_order === 'asc' ? 1 : -1;

    const userId = req.user.owner_id;

    const query = {
      created_by: userId,
      deleted_at: null
    };

    if (search) {
      query.$or = [
        { label: { $regex: search, $options: 'i' } },
        { color: { $regex: search, $options: 'i' } }
      ];
    }

    const tags = await Tag.find(query)
      .select('_id label color')
      .sort({ [sort_by]: sortOrder })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Tag.countDocuments(query);


    const tagsWithUsage = await Promise.all(tags.map(async (tag) => {
      const usageCount = await Contact.countDocuments({
        tags: tag._id,
        created_by: userId,
        deleted_at: null
      });

      return {
        ...tag,
        usage_count: usageCount
      };
    }));

    return res.status(200).json({
      success: true,
      data: {
        tags: tagsWithUsage,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching tags:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch tags',
      error: error.message
    });
  }
};

export const getTagById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tag ID'
      });
    }

    const tag = await Tag.findOne({
      _id: id,
      created_by: req.user.owner_id,
      deleted_at: null
    }).select('_id label color');

    if (!tag) {
      return res.status(404).json({
        success: false,
        message: 'Tag not found'
      });
    }

    const usageCount = await Contact.countDocuments({
      tags: id,
      created_by: req.user.owner_id,
      deleted_at: null
    });

    const tagWithUsage = {
      ...tag.toObject(),
      usage_count: usageCount
    };

    return res.status(200).json({
      success: true,
      data: tagWithUsage
    });
  } catch (error) {
    console.error('Error fetching tag:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch tag',
      error: error.message
    });
  }
};

export const updateTag = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tag ID'
      });
    }

    const tag = await Tag.findOne({
      _id: id,
      created_by: req.user.owner_id,
      deleted_at: null
    });

    if (!tag) {
      return res.status(404).json({
        success: false,
        message: 'Tag not found'
      });
    }

    const mergedData = {
      label: updateData.label !== undefined ? updateData.label : tag.label,
      color: updateData.color !== undefined ? updateData.color : tag.color
    };

    const validation = validateTagData(mergedData);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.errors,
        errors: validation.errors
      });
    }

    if (updateData.label !== undefined) {
      const newLabel = updateData.label.trim();
      if (newLabel !== tag.label) {
        const existingTagLabel = await Tag.findOne({
          label: newLabel,
          created_by: req.user.owner_id,
          deleted_at: null,
          _id: { $ne: id }
        });

        if (existingTagLabel) {
          return res.status(409).json({
            success: false,
            message: 'A tag with this label already exists'
          });
        }
        tag.label = newLabel;
      }
    }

    if (updateData.color !== undefined) {
      tag.color = updateData.color || '#007bff';
    }

    await tag.save();

    return res.status(200).json({
      success: true,
      message: 'Tag updated successfully',
      data: tag
    });
  } catch (error) {
    console.error('Error updating tag:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update tag',
      error: error.message
    });
  }
};

const validateAndFilterIds = (ids) => {
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return {
      isValid: false,
      message: 'Tags IDs array is required and must not be empty',
      validIds: []
    };
  }

  const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

  if (validIds.length === 0) {
    return {
      isValid: false,
      message: 'No valid Tags IDs provided',
      validIds: []
    };
  }

  return {
    isValid: true,
    validIds
  };
};

export const deleteTags = async (req, res) => {
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

    const tags = await Tag.find({
      _id: { $in: validIds },
      created_by: req.user.owner_id,
      deleted_at: null
    });

    if (tags.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No tags found with the provided IDs'
      });
    }

    const foundIds = tags.map(tag => tag._id.toString());
    const notFoundIds = validIds.filter(
      id => !foundIds.includes(id.toString())
    );

    const deletableIds = [];
    const usedIds = [];

    for (const tagId of foundIds) {
      const usageCount = await Contact.countDocuments({
        tags: tagId,
        created_by: req.user.owner_id,
        deleted_at: null
      });

      if (usageCount > 0) {
        usedIds.push(tagId);
      } else {
        deletableIds.push(tagId);
      }
    }

    if (deletableIds.length > 0) {
      await Tag.updateMany(
        { _id: { $in: deletableIds } },
        { $set: { deleted_at: new Date() } }
      );
    }

    const response = {
      success: true,
      message: `${deletableIds.length} tag(s) deleted successfully`,
      data: {
        deletedCount: deletableIds.length,
        deletedIds: deletableIds
      }
    };

    if (usedIds.length > 0) {
      response.data.usedIds = usedIds;
      response.message += `, ${usedIds.length} tag(s) are in use`;
    }

    if (notFoundIds.length > 0) {
      response.data.notFoundIds = notFoundIds;
      response.message += `, ${notFoundIds.length} tag(s) not found`;
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error deleting tags:', error);
    return res.status(500).json({
      success: false,
      message: error.message,
      error: error.message
    });
  }
};


export const getPopularTags = async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const popularTags = await Contact.aggregate([
      {
        $match: {
          created_by: new mongoose.Types.ObjectId(req.user.owner_id),
          deleted_at: null,
          tags: { $exists: true, $ne: [] }
        }
      },
      { $unwind: '$tags' },
      {
        $group: {
          _id: '$tags',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: parseInt(limit) }
    ]);

    const tagDetails = await Promise.all(
      popularTags.map(async (item) => {
        const tag = await Tag.findOne({
          _id: item._id,
          created_by: req.user.owner_id,
          deleted_at: null
        }).select('_id label color').lean();

        return tag ? {
          ...tag,
          usage_count: item.count
        } : null;
      })
    );

    const validTags = tagDetails
      .filter(tag => tag !== null)
      .sort((a, b) => b.usage_count - a.usage_count);

    return res.status(200).json({
      success: true,
      data: validTags
    });
  } catch (error) {
    console.error('Error fetching popular tags:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch popular tags',
      error: error.message
    });
  }
};

export const getTagsWithStats = async (req, res) => {
  try {
    const tags = await Tag.find({ created_by: req.user.owner_id, deleted_at: null }).select('_id label color').lean();

    const tagsWithStats = await Promise.all(
      tags.map(async (tag) => {
        const usageCount = await Contact.countDocuments({
          tags: tag._id,
          created_by: req.user.owner_id,
          deleted_at: null
        });

        return {
          ...tag,
          usage_count: usageCount
        };
      })
    );

    tagsWithStats.sort((a, b) => b.usage_count - a.usage_count);

    return res.status(200).json({
      success: true,
      data: tagsWithStats
    });
  } catch (error) {
    console.error('Error fetching tags with stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch tags with statistics',
      error: error.message
    });
  }
};

export default {
  createTag,
  getTags,
  getTagById,
  updateTag,
  deleteTags,
  getPopularTags,
  getTagsWithStats
};
