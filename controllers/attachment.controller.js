import { Attachment, User, Setting } from '../models/index.js';
import fs from 'fs';
import path from 'path';
import { deleteFile } from '../utils/aws-storage.js';

const SORT_ORDER = {
  ASC: 1,
  DESC: -1
};

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DEFAULT_SORT_FIELD = 'createdAt';
const ALLOWED_SORT_FIELDS = ['fileName', 'fileSize', 'fileType', 'mimeType', 'folder', 'createdAt', 'updatedAt'];

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

  const sortOrder = query.sort_order?.toLowerCase() === 'asc'
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
      { fileName: { $regex: sanitizedSearch, $options: 'i' } },
      { description: { $regex: sanitizedSearch, $options: 'i' } },
      { fileType: { $regex: sanitizedSearch, $options: 'i' } },
      { mimeType: { $regex: sanitizedSearch, $options: 'i' } },
      { folder: { $regex: sanitizedSearch, $options: 'i' } }
    ]
  };
};

export const createAttachment = async (req, res) => {
  try {
    const { folder, tags, description } = req.body;
    const userId = req.user.owner_id;

    if (!req.files || !req.files.length) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    const attachments = [];

    for (const file of req.files) {
      const isS3 = file.path.startsWith('http');
      const relativePath = isS3 ? file.path : `/${file.destination}/${file.filename}`.replace(/\\/g, '/');
      const absoluteUrl = isS3 ? file.path : `${req.protocol}://${req.get('host')}${relativePath}`;

      const attachmentData = {
        fileName: file.originalname,
        fileUrl: relativePath,
        fileSize: file.size,
        fileType: getFileType(file.mimetype),
        mimeType: file.mimetype,
        createdBy: userId,
        folder: folder || 'attachments',
        description
      };

      if (tags) {
        attachmentData.tags = Array.isArray(tags)
          ? tags
          : tags.split(',').map(tag => tag.trim());
      }

      const attachment = await Attachment.create(attachmentData);
      
      await User.findByIdAndUpdate(userId, { $inc: { storage_used: attachment.fileSize } });

      attachments.push({
        ...attachment.toObject(),
        fileUrl: absoluteUrl
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Attachments uploaded successfully',
      data: attachments
    });
  } catch (error) {
    console.error('Error creating attachments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create attachments',
      error: error.message
    });
  }
};

export const getAttachments = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { fileType, mimeType, folder } = req.query;

    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const searchQuery = buildSearchQuery(req.query.search);

    const filter = {
      ...searchQuery,
      createdBy: userId
    };

    if (fileType) filter.fileType = fileType;
    if (mimeType) filter.mimeType = mimeType;
    if (folder) filter.folder = folder;

    const attachments = await Attachment.find(filter)
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .select('-__v')
      .lean();

    const total = await Attachment.countDocuments(filter);

    const baseUrl = `${req.protocol}://${req.get('host')}`;

    const formattedAttachments = attachments.map(att => {
      let fileUrl = att.fileUrl;

      if (!fileUrl) {
        fileUrl = null;
      }
      else if (fileUrl.startsWith('http')) {
        fileUrl = fileUrl;
      }
      else if (fileUrl.startsWith('/uploads/') && !fileUrl.includes('/attachments/')) {
        fileUrl = `${baseUrl}/uploads/attachments/${fileUrl.split('/').pop()}`;
      }
      else {
        fileUrl = `${baseUrl}${fileUrl}`;
      }

      return {
        ...att,
        fileUrl
      };
    });


    res.status(200).json({
      success: true,
      data: formattedAttachments,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit
      }

    });
  } catch (error) {
    console.error('Error fetching attachments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch attachments',
      error: error.message
    });
  }
};

export const getAttachmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.owner_id;

    const attachment = await Attachment.findOne({
      _id: id,
      createdBy: userId
    }).select('-__v');

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Attachment not found'
      });
    }

    const absoluteUrl = `${req.protocol}://${req.get('host')}${attachment.fileUrl}`;

    return res.status(200).json({
      success: true,
      data: {
        ...attachment.toObject(),
        fileUrl: absoluteUrl
      }
    });
  } catch (error) {
    console.error('Error fetching attachment:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch attachment',
      error: error.message
    });
  }
};

export const updateAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const { fileName } = req.body;
    const userId = req.user.owner_id;

    if (!fileName) {
      return res.status(400).json({
        success: false,
        message: 'File name is required'
      });
    }

    const attachment = await Attachment.findOne({ _id: id, createdBy: userId });

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Attachment not found'
      });
    }

    if (attachment.fileName !== fileName) {
      const oldExt = path.extname(attachment.fileName);
      let finalFileName = fileName;

      if (!path.extname(finalFileName) && oldExt) {
        finalFileName += oldExt;
      }

      const oldRelativePath = attachment.fileUrl.replace(/^\//, '');
      const oldAbsolutePath = path.join(process.cwd(), oldRelativePath);

      const dir = path.dirname(oldRelativePath);
      const newRelativePath = `/${path.join(dir, finalFileName)}`.replace(/\\/g, '/');
      const newAbsolutePath = path.join(process.cwd(), dir, finalFileName);

      if (fs.existsSync(oldAbsolutePath)) {
        fs.renameSync(oldAbsolutePath, newAbsolutePath);
        attachment.fileUrl = newRelativePath;
      }
      attachment.fileName = finalFileName;
      await attachment.save();
    }

    const absoluteUrl = `${req.protocol}://${req.get('host')}${attachment.fileUrl}`;

    return res.status(200).json({
      success: true,
      message: 'Attachment and file renamed successfully',
      data: {
        ...attachment.toObject(),
        fileUrl: absoluteUrl
      }
    });

  } catch (error) {
    console.error('Error updating attachment name:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update attachment name',
      error: error.message
    });
  }
};


export const deleteAttachment = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.owner_id;

    const attachment = await Attachment.findOne({
      _id: id,
      createdBy: userId
    });

    if (!attachment) {
      return res.status(404).json({
        success: false,
        message: 'Attachment not found'
      });
    }

    await deleteFile(attachment.fileUrl);

    await Attachment.deleteOne({ _id: id });

    const setting = await Setting.findOne().select('restore_storage_on_delete').lean();
    const restoreStorage = setting?.restore_storage_on_delete !== false;
    if (restoreStorage) {
      await User.findByIdAndUpdate(userId, { $inc: { storage_used: -attachment.fileSize } });
    }

    res.status(200).json({
      success: true,
      message: 'Attachment deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete attachment',
      error: error.message
    });
  }
};

export const bulkDeleteAttachments = async (req, res) => {
  try {
    const { ids } = req.body;
    const userId = req.user.owner_id;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of attachment IDs'
      });
    }

    const attachments = await Attachment.find({
      _id: { $in: ids },
      createdBy: userId
    }).lean();

    const foundIds = attachments.map(a => a._id.toString());
    const notFoundIds = ids.filter(
      id => !foundIds.includes(id.toString())
    );

    for (const attachment of attachments) {
      await deleteFile(attachment.fileUrl);
    }

    const deleteResult = await Attachment.deleteMany({
      _id: { $in: foundIds },
      createdBy: userId
    });

    const setting = await Setting.findOne().select('restore_storage_on_delete').lean();
    const restoreStorage = setting?.restore_storage_on_delete !== false;
    
    if (restoreStorage) {
      const totalDeletedSize = attachments.reduce((acc, curr) => acc + curr.fileSize, 0);
      await User.findByIdAndUpdate(userId, { $inc: { storage_used: -totalDeletedSize } });
    }

    const response = {
      success: true,
      message: `${deleteResult.deletedCount} attachment(s) deleted successfully`,
      data: {
        deletedCount: deleteResult.deletedCount,
        deletedIds: foundIds
      }
    };

    if (notFoundIds.length > 0) {
      response.data.notFoundIds = notFoundIds;
      response.message += `, ${notFoundIds.length} attachment(s) not found`;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error('Error bulk deleting attachments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to bulk delete attachments',
      error: error.message
    });
  }
};


const getFileType = (mimetype) => {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  if (mimetype.startsWith('audio/')) return 'audio';
  if (mimetype.includes('pdf') || mimetype.includes('document') || mimetype.includes('text')) {
    return 'document';
  }
  return 'file';
};
