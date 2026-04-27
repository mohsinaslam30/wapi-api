import * as segmentService from '../services/segment.service.js';
import { Segment } from '../models/index.js';
import mongoose from 'mongoose';

const SORT_ORDER = {
  ASC: 1,
  DESC: -1
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;
const DEFAULT_SORT_FIELD = 'sort_order';
const ALLOWED_SORT_FIELDS = ['name', 'description', 'member_count', 'created_at', 'updated_at'];

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

  const sortOrder = query.sort_order?.toUpperCase() === 'DESC'
    ? SORT_ORDER.DESC
    : SORT_ORDER.ASC;

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
      { description: { $regex: sanitizedSearch, $options: 'i' } },
    ]
  };
};

export const getSegments = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const searchQuery = buildSearchQuery(req.query.search);

    const query = {
      user_id: userId,
      deleted_at: null,
      ...searchQuery
    };

    const segments = await Segment.find(query)
      .skip(skip)
      .limit(parseInt(limit))
      .sort({ [sortField]: sortOrder });

    const total = await Segment.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: {
        segments,
        pagination: {
          currentPage: page,
          totalSegments: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit
        }
      }
    });
  } catch (error) {
    console.error('Error fetching segments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch segments',
      error: error.message
    });
  }
};

export const getSegmentById = async (req, res) => {
  try {
    const { segmentId } = req.params;
    const userId = req.user.owner_id;

    if (!mongoose.Types.ObjectId.isValid(segmentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid segment ID'
      });
    }

    const segment = await segmentService.getSegmentById(segmentId, userId);

    if (!segment) {
      return res.status(404).json({
        success: false,
        message: 'Segment not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: segment
    });
  } catch (error) {
    console.error('Error fetching segment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch segment',
      error: error.message
    });
  }
};

export const updateSegment = async (req, res) => {
  try {
    const { segmentId } = req.params;
    const userId = req.user.owner_id;

    if (!mongoose.Types.ObjectId.isValid(segmentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid segment ID'
      });
    }

    const segment = await segmentService.updateSegment(segmentId, req.body, userId);

    if (!segment) {
      return res.status(404).json({
        success: false,
        message: 'Segment not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Segment updated successfully',
      data: segment
    });
  } catch (error) {
    console.error('Error updating segment:', error);
    const status = error.message.includes('already exists') ? 409 : 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to update segment',
      error: error.message
    });
  }
}

export const createSegment = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Segment name is required'
      });
    }

    const segment = await segmentService.createSegment(req.body, userId);

    return res.status(201).json({
      success: true,
      message: 'Segment created successfully',
      data: segment
    });
  } catch (error) {
    console.error('Error creating segment:', error);
    const status = error.message.includes('already exists') ? 409 : 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to create segment',
      error: error.message
    });
  }
};

export const addContactsToSegment = async (req, res) => {
  try {
    const { segmentId } = req.params;
    const { contactIds } = req.body;
    const userId = req.user.owner_id;

    if (!mongoose.Types.ObjectId.isValid(segmentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid segment ID'
      });
    }

    if (!contactIds || !Array.isArray(contactIds)) {
      return res.status(400).json({
        success: false,
        message: 'contactIds array is required'
      });
    }

    const processedCount = await segmentService.addContactsToSegment(segmentId, contactIds, userId);

    return res.status(200).json({
      success: true,
      message: `${processedCount} contacts processed`,
      data: { processedCount }
    });
  } catch (error) {
    console.error('Error adding contacts to segment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to add contacts to segment',
      error: error.message
    });
  }
};

export const removeContactsFromSegment = async (req, res) => {
  try {
    const { segmentId } = req.params;
    const { contactIds } = req.body;
    const userId = req.user.owner_id;

    if (!mongoose.Types.ObjectId.isValid(segmentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid segment ID'
      });
    }

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'contactIds array is required and must not be empty'
      });
    }

    const deletedCount = await segmentService.removeContactsFromSegment(segmentId, contactIds, userId);

    return res.status(200).json({
      success: true,
      message: `${deletedCount} contact(s) removed from segment`,
      data: { deletedCount }
    });
  } catch (error) {
    console.error('Error removing contacts from segment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to remove contacts from segment',
      error: error.message
    });
  }
};

export const getSegmentContacts = async (req, res) => {
  try {
    const { segmentId } = req.params;
    const userId = req.user.owner_id;
    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const searchQuery = buildSearchQuery(req.query.search);

    if (!mongoose.Types.ObjectId.isValid(segmentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid segment ID'
      });
    }

    const result = await segmentService.getSegmentContacts(segmentId, userId, { page, limit, skip, sortField, sortOrder, searchQuery });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching segment contacts:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch segment contacts',
      error: error.message
    });
  }
};

export const bulkAddContactsToSegments = async (req, res) => {
  try {
    const { contactIds, segmentIds } = req.body;
    const userId = req.user.owner_id;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'contactIds array is required and must not be empty'
      });
    }

    if (!segmentIds || !Array.isArray(segmentIds) || segmentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'segmentIds array is required and must not be empty'
      });
    }

    const totalMappings = await segmentService.bulkAddContactsToSegments(contactIds, segmentIds, userId);

    return res.status(200).json({
      success: true,
      message: `Bulk operation completed: ${totalMappings} mappings processed`,
      data: { totalMappings }
    });
  } catch (error) {
    console.error('Error in bulk adding contacts to segments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to perform bulk operation',
      error: error.message
    });
  }
};

export const deleteSegment = async (req, res) => {
  try {
    const { segmentId } = req.params;
    const userId = req.user.owner_id;

    if (!mongoose.Types.ObjectId.isValid(segmentId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid segment ID'
      });
    }

    const segment = await segmentService.deleteSegment(segmentId, userId);

    if (!segment) {
      return res.status(404).json({
        success: false,
        message: 'Segment not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Segment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting segment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete segment',
      error: error.message
    });
  }
};

export const bulkDeleteSegments = async (req, res) => {
  try {
    const { segmentIds } = req.body;
    const userId = req.user.owner_id;

    if (!segmentIds || !Array.isArray(segmentIds) || segmentIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'segmentIds array is required and must not be empty'
      });
    }

    const deletedCount = await segmentService.bulkDeleteSegments(segmentIds, userId);

    return res.status(200).json({
      success: true,
      message: `${deletedCount} segment(s) deleted successfully`,
      data: { deletedCount }
    });
  } catch (error) {
    console.error('Error bulk deleting segments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to bulk delete segments',
      error: error.message
    });
  }
};
