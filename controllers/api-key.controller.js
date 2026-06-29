import crypto from 'crypto';
import { ApiKey, User } from '../models/index.js';

const API_KEY_BYTES = 32;
const API_KEY_PREFIX_LENGTH = 6;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const generateApiKey = () => {
  const raw = crypto.randomBytes(API_KEY_BYTES).toString('hex');
  const prefix = raw;
  return { rawKey: raw, prefix };
};

const parsePaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
  const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(query.limit) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

export const createApiKey = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name } = req.body || {};

    const user = await User.findOne({ _id: userId, deleted_at: null });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const { rawKey, prefix } = generateApiKey();

    const keyHash = crypto
      .createHash('sha256')
      .update(rawKey)
      .digest('hex');

    const apiKey = await ApiKey.create({
      user_id: userId,
      name: name || null,
      key_hash: keyHash,
      prefix
    });

    return res.status(201).json({
      success: true,
      message: 'API key created successfully',
      api_key: rawKey,
      key: {
        id: apiKey._id.toString(),
        name: apiKey.name,
        api_key: apiKey.prefix,
        prefix: apiKey.prefix,
        created_at: apiKey.created_at
      }
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create API key',
      error: error.message
    });
  }
};

export const listApiKeys = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page, limit, skip } = parsePaginationParams(req.query);
    const { search } = req.query;

    const filter = {
      user_id: userId,
      deleted_at: null
    };

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { prefix: { $regex: search, $options: 'i' } }
      ];
    }

    const [totalItems, keys] = await Promise.all([
      ApiKey.countDocuments(filter),
      ApiKey.find(filter)
        .sort({ created_at: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
    ]);

    const sanitized = keys.map(k => ({
      id: k._id.toString(),
      name: k.name,
      api_key: k.prefix,
      prefix: k.prefix,
      created_at: k.created_at,
      last_used_at: k.last_used_at
    }));

    return res.json({
      success: true,
      data: sanitized,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalItems / limit) || 0,
        totalItems,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    console.error('Error listing API keys:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to list API keys',
      error: error.message
    });
  }
};

export const deleteApiKey = async (req, res) => {
  try {
    const userId = req.user.id;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please provide an array of API key IDs'
      });
    }

    const keys = await ApiKey.find({
      _id: { $in: ids },
      user_id: userId,
      deleted_at: null
    }).select('_id');

    const foundIds = keys.map(k => k._id.toString());
    const notFoundIds = ids.filter(id => !foundIds.includes(id.toString()));

    const result = await ApiKey.updateMany(
      { _id: { $in: foundIds } },
      { $set: { deleted_at: new Date() } }
    );

    const response = {
      success: true,
      data: {
        deletedCount: result.modifiedCount || 0,
        deletedIds: foundIds
      }
    };

    if (notFoundIds.length > 0) {
      response.data.notFoundIds = notFoundIds;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error deleting API key:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete API key',
      error: error.message
    });
  }
};

export default {
  createApiKey,
  listApiKeys,
  deleteApiKey
};

