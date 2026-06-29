import { KanbanFunnel, KanbanItem, Contact, Submission, User, EcommerceProduct } from '../models/index.js';
import mongoose from 'mongoose';

const normalizeFunnelType = (type) => type?.toLowerCase().replace(/\s+/g, '_');

const syncItemData = async (item, funnel) => {
  try {
    const funnelType = normalizeFunnelType(funnel.funnelType);
    let sourceModel;
    switch (funnelType) {
      case 'contact': sourceModel = Contact; break;
      case 'form_submission': sourceModel = Submission; break;
      case 'agent': sourceModel = User; break;
      case 'ecommerce_product': sourceModel = EcommerceProduct; break;
    }

    if (sourceModel) {
      const queryBuilder = sourceModel.findById(item.globalItemId);

      if (funnelType === 'form_submission') {
        queryBuilder.populate('form_id', 'name category');
      } else if (funnelType === 'agent') {
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
    console.error('Error syncing item data in service:', error);
  }
};


const mapData = (item, funnelTypeInput) => {
  let title = 'N/A';
  let subtitle = 'N/A';
  let label = 'Unknown';
  let extra = {};

  const funnelType = normalizeFunnelType(funnelTypeInput);

  switch (funnelType) {
    case 'contact':
      title = item.name || `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'No Name';
      subtitle = item.email || item.phone_number || 'No Contact Info';
      label = 'Contact';
      extra = { phone: item.phone_number || item.phone, company: item.company, source: item.source };
      break;
    case 'form_submission':
      title = item.form_id?.name || 'form submission';
      subtitle = item.form_id?.category;
      label = 'form submission';
      const { flow_token, ...restData } = item.data || {};
      extra = {
        name: restData.name,
        email: restData.email,
        phone: item.meta?.phone_number,
        submittedAt: item.createdAt
      };
      break;
    case 'agent':
      title = item.name || 'Agent';
      subtitle = item.email || 'No Email';
      label = 'Agent';
      extra = { phone: item.phone, team: item.team_id?.name };
      break;
    case 'ecommerce_product':
      title = item.name || 'Product';
      subtitle = item.price ? `$ ${item.price}` : 'No Price';
      label = 'Product';
      extra = { stock: item.stock, availability: item.availability };
      break;
  }

  return { title, subtitle, label, extra };
};

export const processAction = async ({
  funnelId,
  globalItemId,
  toStageId,
  position,
  priority,
  isArchived,
  userId,
  changedBy
}) => {

  const funnel = await KanbanFunnel.findOne({
    _id: funnelId,
    userId,
    deletedAt: null
  });

  if (!funnel) throw new Error('Funnel not found or unauthorized');

  const targetStage = funnel.stages.find(
    s => s._id.toString() === toStageId.toString()
  );

  if (!targetStage) {
    throw new Error('Target stage not found in funnel');
  }

  let item = await KanbanItem.findOne({ funnelId, globalItemId });

  let fromStageId = null;
  let isNewItem = false;
  let oldPosition = null;

  if (!item) {
    isNewItem = true;

    item = new KanbanItem({
      funnelId,
      globalItemId,
      stageId: toStageId,
      priority: priority || 'medium',
      isArchived: false,
      history: []
    });
  } else {
    fromStageId = item.stageId;
    oldPosition = item.position;
  }

  if (typeof isArchived === 'boolean') {
    item.isArchived = isArchived;
  }

  if (priority) {
    item.priority = priority;
  }

  if (toStageId && !item.isArchived) {
    let targetPosition = position;
    if (targetPosition === undefined || targetPosition === null) {
      const lastItem = await KanbanItem.findOne({ funnelId, stageId: toStageId })
        .sort({ position: -1 })
        .select('position')
        .lean();
      targetPosition = lastItem ? lastItem.position + 1 : 0;
    }

    if (fromStageId && fromStageId.toString() !== toStageId.toString()) {
      await KanbanItem.updateMany(
        { funnelId, stageId: fromStageId, position: { $gt: oldPosition } },
        { $inc: { position: -1 } }
      );
    }

    await KanbanItem.updateMany(
      {
        funnelId,
        stageId: toStageId,
        position: { $gte: targetPosition },
        _id: { $ne: item._id }
      },
      { $inc: { position: 1 } }
    );

    item.stageId = toStageId;
    item.position = targetPosition;
    item.movedAt = new Date();
  }

  item.history.push({
    action: isNewItem ? 'created' : 'moved',
    fromStageId,
    toStageId: item.stageId,
    changedBy,
    timestamp: new Date()
  });

  await syncItemData(item, funnel);

  await item.save();
  return item;
};


export const processBulkActions = async ({
  globalItemId,
  actions,
  userId,
  changedBy
}) => {
  if (!Array.isArray(actions)) {
    throw new Error('Actions must be an array');
  }

  const results = [];
  for (const action of actions) {
    const result = await processAction({
      ...action,
      globalItemId,
      userId,
      changedBy
    });
    results.push(result);
  }

  return results;
};


export const getFunnelsByType = async (userId, funnelType) => {
  return await KanbanFunnel.find({
    userId,
    funnelType,
    deletedAt: null
  }).sort({ sort_order: 1 }).lean();
};


export const getItemStatus = async (globalItemId, userId) => {
  const items = await KanbanItem.find({ globalItemId })
    .populate({
      path: 'funnelId',
      match: { userId, deletedAt: null },
      select: 'name funnelType stages'
    })
    .lean();

  const active = items.filter(i => i.funnelId);

  return active.map(i => {
    const stage = i.funnelId.stages.find(s => s._id.toString() === i.stageId.toString());
    return {
      funnelId: i.funnelId._id,
      funnelName: i.funnelId.name,
      funnelType: i.funnelId.funnelType,
      stageId: i.stageId,
      stageName: stage?.name || 'Unknown',
      priority: i.priority,
      isArchived: i.isArchived
    };
  });
};
