import { KanbanFunnel, Contact, Submission, User, EcommerceProduct, KanbanItem } from '../models/index.js';
import mongoose from 'mongoose';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const DEFAULT_SORT_FIELD = 'sort_order';
const DEFAULT_SORT_ORDER = 1;
const MAX_LIMIT = 100;

const ALLOWED_SORT_FIELDS = [
  'name',
  'funnelType',
  'createdAt'
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
      { funnelType: { $regex: sanitizedSearch, $options: 'i' } }
    ]
  };
};

export const getFunnels = async (req, res) => {
  try {
    const { search, funnelType } = req.query;
    const userId = req.user.owner_id;

    const { skip, limit, page } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const searchQuery = buildSearchQuery(search);

    if (userId) {
      searchQuery.userId = userId;
    }

    if (funnelType) {
      searchQuery.funnelType = funnelType;
    }
    searchQuery.deletedAt = null;

    const funnleCount = await KanbanFunnel.countDocuments(searchQuery);
    const funnels = await KanbanFunnel.find(searchQuery)
      .skip(skip)
      .limit(limit)
      .sort({ [sortField]: sortOrder })
      .select("-__v")
      .lean();

    return res.status(200).json({
      success: true,
      data: funnels,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(funnleCount / limit),
        totalFunnels: funnleCount,
        limit: limit,
        skip: skip
      }
    });
  } catch (error) {
    console.error('Error fetching funnels:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch funnels',
      error: error.message
    });
  }
};

const getDefaultStages = (funnelType) => {
  switch (funnelType) {
    case 'contact':
      return [
        { name: 'New Lead', order: 1, color: '#ebf8ff' },
        { name: 'Contacted', order: 2, color: '#bee3f8' },
        { name: 'Qualified', order: 3, color: '#90cdf4' },
        { name: 'Proposal Sent', order: 4, color: '#63b3ed' },
        { name: 'Closed (Won)', order: 5, color: '#c6f6d5' },
        { name: 'Closed (Lost)', order: 6, color: '#fed7d7' }
      ];
    case 'form_submission':
      return [
        { name: 'New', order: 1, color: '#ebf8ff' },
        { name: 'Under Review', order: 2, color: '#fefcbf' },
        { name: 'Processed', order: 3, color: '#90cdf4' },
        { name: 'Rejected', order: 4, color: '#fed7d7' }
      ];
    case 'ecommerce_product':
      return [
        { name: 'Draft', order: 1, color: '#edf2f7' },
        { name: 'Active', order: 2, color: '#c6f6d5' },
        { name: 'Out of Stock', order: 3, color: '#fed7d7' },
        { name: 'Discontinued', order: 4, color: '#a0aec0' }
      ];
    case 'agent':
      return [
        { name: 'New', order: 1, color: '#edf2f7' },
        { name: 'Onboarding', order: 2, color: '#bee3f8' },
        { name: 'Active', order: 3, color: '#c6f6d5' },
        { name: 'Top Performer', order: 4, color: '#9ae6b4' },
        { name: 'Under Review', order: 5, color: '#fefcbf' },
        { name: 'Inactive', order: 6, color: '#fed7d7' }
      ];
    default:
      return [
        { name: 'New', order: 1, color: '#ebf8ff' },
        { name: 'In Progress', order: 2, color: '#fefcbf' },
        { name: 'Completed', order: 3, color: '#f0fff4' }
      ];
  }
};

const syncItemData = async (item, funnel) => {
  try {
    let sourceModel;
    switch (funnel.funnelType) {
      case 'contact': sourceModel = Contact; break;
      case 'form_submission': sourceModel = Submission; break;
      case 'agent': sourceModel = User; break;
      case 'ecommerce_product': sourceModel = EcommerceProduct; break;
    }

    if (sourceModel) {
      const queryBuilder = sourceModel.findById(item.globalItemId);

      if (funnel.funnelType === 'form_submission') {
        queryBuilder.populate('form_id', 'name category');
      } else if (funnel.funnelType === 'agent') {
        queryBuilder.populate('team_id', 'name');
      }

      const sourceData = await queryBuilder.lean();

      if (sourceData) {
        const mapped = mapData(sourceData, funnel.funnelType);
        item.data = {
          title: mapped.title,
          subtitle: mapped.subtitle,
          label: mapped.label,
          extra: mapped.extra
        };
      }
    }
  } catch (error) {
    console.error('Error syncing item data:', error);
  }
};

const mapData = (item, funnelType) => {
  let title = 'N/A';
  let subtitle = 'N/A';
  let label = 'Unknown';
  let extra = {};

  switch (funnelType) {
    case 'contact':
      title = item.name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'No Name';
      subtitle = item.email || item.phone_number || 'No Contact Info';
      label = 'Contact';
      extra = {
        phone: item.phone_number || item.phone,
        company: item.company,
        source: item.source,
        chat_status: item.chat_status
      };
      break;
    case 'form_submission':
      title = item.form_id?.name || 'form submission';
      subtitle = item.form_id?.category;
      label = 'form submission';

      const { flow_token, ...restData } = item.data || {};
      extra = {
        name: restData.name,
        email: restData.email,
        service: restData.service,
        date: restData.date,
        phone: item.meta?.phone_number,
        submittedAt: item.createdAt
      };
      break;
    case 'agent':
      title = item.name || 'Agent';
      subtitle = item.email || 'No Email';
      label = 'Agent';
      extra = {
        phone: item.phone,
        team_name: item.team_id?.name
      };
      break;
    case 'ecommerce_product':
      title = item.name || 'Product';
      subtitle = item.price ? `$ ${item.price}` : 'No Price';
      label = 'Product';
      extra = {
        stock: item.stock,
        currency: item.currency,
        availability: item.availability,
        condition: item.condition
      };
      break;
  }

  const cleanedExtra = Object.fromEntries(
    Object.entries(extra).filter(([_, v]) => v !== null && v !== undefined)
  );

  return {
    _id: item._id,
    title,
    subtitle,
    label,
    extra: cleanedExtra,
  };
};

export const createFunnel = async (req, res) => {
  try {
    const { name, description, funnelType } = req.body;
    const userId = req.user.owner_id;

    if (!name || !funnelType) {
      return res.status(400).json({
        success: false,
        message: 'Name and funnelType are required'
      });
    }

    const normalizedName = name.trim();

    const existingFunnel = await KanbanFunnel.findOne({
      name: { $regex: `^${normalizedName}$`, $options: 'i' },
      userId,
      deletedAt: null
    });

    if (existingFunnel) {
      return res.status(400).json({
        success: false,
        message: 'Funnel with this name already exists'
      });
    }

    const existingTypeFunnel = await KanbanFunnel.findOne({
      userId,
      funnelType,
      deletedAt: null
    });

    const stages = existingTypeFunnel
      ? [
        {
          name: 'Untitled',
          order: 1,
          color: '#e2e8f0'
        }
      ]
      : getDefaultStages(funnelType);

    const funnel = await KanbanFunnel.create({
      name: normalizedName,
      description,
      userId,
      funnelType,
      stages
    });

    return res.status(201).json({
      success: true,
      message: 'Funnel created successfully',
      data: funnel
    });

  } catch (error) {
    console.error('Error creating funnel:', error);

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Funnel name already exists'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create funnel',
      error: error.message
    });
  }
};

export const getFunnelById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.owner_id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid funnel ID'
      });
    }

    const funnel = await KanbanFunnel.findOne({ _id: id, userId, deletedAt: null }).lean();

    if (!funnel) {
      return res.status(404).json({
        success: false,
        message: 'Funnel not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: funnel
    });
  } catch (error) {
    console.error('Error fetching funnel:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch funnel',
      error: error.message
    });
  }
};

export const getFunnelStages = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.owner_id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid funnel ID'
      });
    }

    const funnel = await KanbanFunnel.findOne({ _id: id, userId, deletedAt: null }).lean();

    if (!funnel) {
      return res.status(404).json({
        success: false,
        message: 'Funnel not found'
      });
    }

    const sortedStages = funnel.stages.sort((a, b) => a.order - b.order);

    return res.status(200).json({
      success: true,
      data: sortedStages
    });
  } catch (error) {
    console.error('Error fetching funnel stages:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch stages',
      error: error.message
    });
  }
};

export const updateFunnel = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    const userId = req.user.owner_id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid funnel ID' });
    }

    const funnel = await KanbanFunnel.findOne({ _id: id, userId, deletedAt: null });
    if (!funnel) {
      return res.status(404).json({ success: false, message: 'Funnel not found' });
    }

    if (name) funnel.name = name;
    if (description !== undefined) funnel.description = description;

    await funnel.save();

    return res.status(200).json({
      success: true,
      message: 'Funnel updated successfully',
      data: funnel
    });
  } catch (error) {
    console.error('Error updating funnel:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update funnel',
      error: error.message
    });
  }
};

export const deleteFunnel = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.owner_id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid funnel ID' });
    }

    const funnel = await KanbanFunnel.findOneAndUpdate(
      { _id: id, userId, deletedAt: null },
      { $set: { deletedAt: new Date() } },
      { new: true }
    );
    if (!funnel) {
      return res.status(404).json({ success: false, message: 'Funnel not found' });
    }

    await KanbanItem.deleteMany({ funnelId: id });

    return res.status(200).json({
      success: true,
      message: 'Funnel and all associated items deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting funnel:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete funnel',
      error: error.message
    });
  }
};

export const syncStages = async (req, res) => {
  try {
    const { id } = req.params;
    const { stages = [] } = req.body;
    const userId = req.user.owner_id;

    if (!Array.isArray(stages)) {
      return res.status(400).json({
        success: false,
        message: 'Stages must be an array'
      });
    }

    const funnel = await KanbanFunnel.findOne({ _id: id, userId, deletedAt: null });
    if (!funnel) {
      return res.status(404).json({
        success: false,
        message: 'Funnel not found'
      });
    }

    const existingMap = new Map();
    const removedStageIds = new Set();

    funnel.stages.forEach(stage => {
      const stageIdStr = stage._id.toString();
      existingMap.set(stageIdStr, stage);
      removedStageIds.add(stageIdStr);
    });

    const newStages = [];

    for (const item of stages) {
      if (!item.name) {
        return res.status(400).json({
          success: false,
          message: 'Stage name is required'
        });
      }

      if (item._id && existingMap.has(item._id.toString())) {
        const stageIdStr = item._id.toString();
        const existing = existingMap.get(stageIdStr);

        existing.name = item.name;
        existing.color = item.color || existing.color;
        existing.order = item.order ?? existing.order;

        newStages.push(existing);
        removedStageIds.delete(stageIdStr);
      }
      else {
        newStages.push({
          name: item.name,
          color: item.color || '#cbd5e0',
          order: item.order ?? (newStages.length + 1)
        });
      }
    }

    if (removedStageIds.size > 0) {
      await KanbanItem.deleteMany({
        funnelId: id,
        stageId: { $in: Array.from(removedStageIds) }
      });
    }

    newStages.sort((a, b) => a.order - b.order);

    newStages.forEach((stage, index) => {
      stage.order = index + 1;
    });

    funnel.stages = newStages;

    await funnel.save();

    return res.status(200).json({
      success: true,
      message: 'Stages synced successfully',
      data: funnel.stages
    });

  } catch (error) {
    console.error('Error syncing stages:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to sync stages',
      error: error.message
    });
  }
};

export const getAvailableData = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.owner_id;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid funnel ID'
      });
    }

    const funnel = await KanbanFunnel.findOne({
      _id: id,
      userId,
      deletedAt: null
    }).lean();

    if (!funnel) {
      return res.status(404).json({
        success: false,
        message: 'Funnel not found'
      });
    }

    const funnelItems = await KanbanItem.find({ funnelId: id }).lean();

    const archivedItemsRaw = funnelItems.filter(i => i.isArchived);

    const existingItemIds = funnelItems.map(item => item.globalItemId);

    const archivedItems = archivedItemsRaw.map(item => {
      const d = item.data || {};

      return {
        _id: item.globalItemId,
        title: d.title || 'Untitled',
        subtitle: d.subtitle || '',
        label: d.label || '',
        extra: d.extra || {},
        priority: item.priority,
        isArchived: true,
        itemId: item._id
      };
    });

    let sourceModel;
    let query = {};

    switch (funnel.funnelType) {
      case 'contact':
        sourceModel = Contact;
        query = { user_id: userId, deleted_at: null };
        break;
      case 'form_submission':
        sourceModel = Submission;
        query = { user_id: userId, deleted_at: null };
        break;
      case 'agent':
        sourceModel = User;
        query = { created_by: userId, deleted_at: null };
        break;
      case 'ecommerce_product':
        sourceModel = EcommerceProduct;
        query = { user_id: userId };
        break;
      default:
        return res.status(400).json({
          success: false,
          message: `Unsupported funnel type: ${funnel.funnelType}`
        });
    }

    query._id = { $nin: existingItemIds };

    let availableDataQuery = sourceModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(50);

    if (funnel.funnelType === 'form_submission') {
      availableDataQuery = availableDataQuery.populate('form_id', 'name category');
    } else if (funnel.funnelType === 'agent') {
      availableDataQuery = availableDataQuery.populate('team_id', 'name');
    }

    const availableData = await availableDataQuery.lean();

    const formattedAvailable = availableData.map(item =>
      mapData(item, funnel.funnelType)
    );

    return res.status(200).json({
      success: true,
      data: {
        available: formattedAvailable,
        archived: archivedItems
      }
    });

  } catch (error) {
    console.error('Error fetching available data:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch available data',
      error: error.message
    });
  }
};

export const getFunnelItems = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.owner_id;

    const { search, priority } = req.query;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid funnel ID'
      });
    }

    const funnel = await KanbanFunnel.findOne({
      _id: id,
      userId,
      deletedAt: null
    }).lean();

    if (!funnel) {
      return res.status(404).json({
        success: false,
        message: 'Funnel not found'
      });
    }


    const query = { funnelId: id, isArchived: false };

    if (priority) {
      const priorities = priority.split(',').map(p => p.trim());
      query.priority = { $in: priorities };
    }
    if (search) {
      const searchRegex = new RegExp(search, 'i');

      query.$or = [
        { "data.title": searchRegex },
        { "data.subtitle": searchRegex },
        { "data.label": searchRegex },
        {
          $expr: {
            $gt: [
              {
                $size: {
                  $filter: {
                    input: { $objectToArray: "$data.extra" },
                    as: "field",
                    cond: {
                      $regexMatch: {
                        input: { $toString: "$$field.v" },
                        regex: search,
                        options: "i"
                      }
                    }
                  }
                }
              },
              0
            ]
          }
        }
      ];
    }

    const items = await KanbanItem.find(query)
      .sort({ position: 1, createdAt: 1 })
      .lean();


    const stageMap = {};
    funnel.stages.forEach(stage => {
      stageMap[stage._id.toString()] = stage.name;
    });


    const stageItems = {};
    funnel.stages.forEach(stage => {
      stageItems[stage._id.toString()] = [];
    });


    const buildLastActivity = (history = []) => {
      if (!history.length) return null;

      const last = history[history.length - 1];

      const activity = {
        action: last.action,
        timestamp: last.timestamp
      };

      if (last.fromStageId) {
        activity.from = stageMap[last.fromStageId.toString()] || 'Unknown';
      }

      if (last.toStageId) {
        activity.to = stageMap[last.toStageId.toString()] || 'Unknown';
      }

      if (last.action === 'created' && last.toStageId) {
        activity.stageName = stageMap[last.toStageId.toString()] || 'Unknown';
      }

      if (last.details) {
        activity.details = last.details;
      }

      return activity;
    };


    items.forEach(item => {
      const { title, subtitle, label, extra } = item.data || {};

      const formattedItem = {
        _id: item._id,
        globalItemId: item.globalItemId,

        title: title || 'Untitled',
        subtitle: subtitle || '',
        label: label || '',
        extra: extra || {},

        priority: item.priority,
        isArchived: item.isArchived,

        lastActivity: buildLastActivity(item.history)
      };

      const stageKey = item.stageId.toString();

      if (stageItems[stageKey]) {
        stageItems[stageKey].push(formattedItem);
      }
    });

    const responseStages = funnel.stages
      .sort((a, b) => a.order - b.order)
      .map(stage => ({
        _id: stage._id,
        name: stage.name,
        color: stage.color,
        stageOrder: stage.order,
        items: stageItems[stage._id.toString()] || []
      }));

    return res.status(200).json({
      success: true,
      data: {
        stages: responseStages
      }
    });

  } catch (error) {
    console.error('Error fetching funnel items:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch items',
      error: error.message
    });
  }
};

export const moveItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { itemId, globalItemId, toStageId, position } = req.body;
    const userId = req.user.owner_id;

    if (
      !mongoose.Types.ObjectId.isValid(id) ||
      !mongoose.Types.ObjectId.isValid(toStageId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid funnel or stage ID",
      });
    }

    const funnel = await KanbanFunnel.findOne({
      _id: id,
      userId,
      deletedAt: null,
    });

    if (!funnel) {
      return res.status(404).json({
        success: false,
        message: "Funnel not found",
      });
    }

    const targetStage = funnel.stages.find(
      (s) => s._id.toString() === toStageId.toString()
    );

    if (!targetStage) {
      return res.status(400).json({
        success: false,
        message: "Target stage not found in this funnel",
      });
    }

    let item;
    let fromStageId = null;
    let isNewItem = false;

    if (itemId) {
      item = await KanbanItem.findOne({ _id: itemId, funnelId: id });
      if (!item) {
        return res.status(404).json({
          success: false,
          message: "Item not found",
        });
      }
    } else if (globalItemId) {
      item = await KanbanItem.findOne({ globalItemId, funnelId: id });
    }

    if (item) {
      fromStageId = item.stageId;
    } else if (globalItemId) {
      isNewItem = true;
      item = new KanbanItem({
        funnelId: id,
        globalItemId,
        priority: "medium",
        history: [],
      });
    } else {
      return res.status(400).json({
        success: false,
        message: "Either itemId or globalItemId is required",
      });
    }

    const targetPosition = position ?? 0;

    const isSameStage =
      !isNewItem &&
      fromStageId &&
      fromStageId.toString() === toStageId.toString();

    if (!isNewItem && isSameStage) {
      const oldPosition = item.position;

      if (targetPosition > oldPosition) {
        await KanbanItem.updateMany(
          {
            funnelId: id,
            stageId: toStageId,
            position: { $gt: oldPosition, $lte: targetPosition },
          },
          { $inc: { position: -1 } }
        );
      } else if (targetPosition < oldPosition) {
        await KanbanItem.updateMany(
          {
            funnelId: id,
            stageId: toStageId,
            position: { $gte: targetPosition, $lt: oldPosition },
          },
          { $inc: { position: 1 } }
        );
      }

      item.position = targetPosition;
    }

    if (!isNewItem && !isSameStage) {
      await KanbanItem.updateMany(
        {
          funnelId: id,
          stageId: fromStageId,
          position: { $gt: item.position },
        },
        { $inc: { position: -1 } }
      );

      await KanbanItem.updateMany(
        {
          funnelId: id,
          stageId: toStageId,
          position: { $gte: targetPosition },
        },
        { $inc: { position: 1 } }
      );

      item.stageId = toStageId;
      item.position = targetPosition;
    }

    if (isNewItem) {
      await KanbanItem.updateMany(
        {
          funnelId: id,
          stageId: toStageId,
          position: { $gte: targetPosition },
        },
        { $inc: { position: 1 } }
      );

      item.stageId = toStageId;
      item.position = targetPosition;
    }

    item.isArchived = false;
    item.movedAt = new Date();


    if (isNewItem) {
      item.history.push({
        action: "created",
        toStageId,
        changedBy: req.user.id,
        timestamp: new Date(),
      });
    } else {
      item.history.push({
        action: "moved",
        fromStageId,
        toStageId,
        changedBy: req.user.id,
        timestamp: new Date(),
      });
    }

    await syncItemData(item, funnel);

    await item.save();

    return res.status(200).json({
      success: true,
      message: isNewItem
        ? "Item added successfully"
        : "Item moved successfully",
      data: item,
    });

  } catch (error) {
    console.error("Error moving Kanban item:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to move item",
      error: error.message,
    });
  }
};

export const updateFunnelItem = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { priority, isArchived } = req.body;
    const userId = req.user.owner_id;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid funnel or item ID'
      });
    }

    const item = await KanbanItem.findOne({ _id: itemId, funnelId: id });
    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    let historyAction = null;

    if (priority) {
      const validPriorities = ['low', 'medium', 'high'];
      if (!validPriorities.includes(priority)) {
        return res.status(400).json({ success: false, message: 'Invalid priority level' });
      }
      item.priority = priority;
      historyAction = 'updated';
    }

    if (isArchived !== undefined) {
      if (isArchived === true && !item.isArchived) {
        historyAction = 'archived';
        item.isArchived = true;
      } else if (isArchived === false && item.isArchived) {
        historyAction = 'restored';
        item.isArchived = false;
      }
    }

    if (historyAction) {
      item.history.push({
        action: historyAction,
        fromStageId: item.stageId,
        toStageId: item.stageId,
        changedBy: userId,
        timestamp: new Date()
      });
    }

    await item.save();

    return res.status(200).json({
      success: true,
      message: 'Item updated successfully',
      data: item
    });

  } catch (error) {
    console.error('Error updating Kanban item:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update item',
      error: error.message
    });
  }
};

export const deleteFunnelItem = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const userId = req.user.owner_id;

    if (!mongoose.Types.ObjectId.isValid(id) || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid funnel or item ID'
      });
    }

    const item = await KanbanItem.findOne({ _id: itemId, funnelId: id });

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    const stageId = item.stageId;


    await KanbanItem.deleteOne({ _id: itemId });

    await KanbanItem.updateMany(
      { funnelId: id, stageId, position: { $gt: item.position } },
      { $inc: { position: -1 } }
    );

    return res.status(200).json({
      success: true,
      message: 'Item removed from funnel successfully'
    });

  } catch (error) {
    console.error('Error deleting item:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete item',
      error: error.message
    });
  }
};