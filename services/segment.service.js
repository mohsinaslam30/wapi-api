import { Segment, Contact } from '../models/index.js';
import mongoose from 'mongoose';

const updateSegmentMemberCount = async (segmentId) => {
  const count = await Contact.countDocuments({
    segments: segmentId,
    deleted_at: null
  });
  await Segment.findByIdAndUpdate(segmentId, { member_count: count });
};

export const createSegment = async (data, userId) => {
  const { name, description, contactIds } = data;

  const existingSegment = await Segment.findOne({
    name: { $regex: new RegExp(`^${name}$`, 'i') },
    user_id: userId,
    deleted_at: null
  });

  if (existingSegment) {
    throw new Error('A segment with this name already exists');
  }

  const segment = await Segment.create({
    name,
    description,
    user_id: userId
  });

  if (Array.isArray(contactIds) && contactIds.length > 0) {
    console.log(`[createSegment] Received ${contactIds.length} contactIds to add to segment ${segment._id}`);
    const addedCount = await addContactsToSegment(segment._id, contactIds, userId);
    console.log(`[createSegment] Successfully added ${addedCount} contacts to segment ${segment._id}`);
  }

  const refreshedSegment = await Segment.findById(segment._id);
  return refreshedSegment || segment;
};

export const addContactsToSegment = async (segmentId, contactIds, userId) => {
  const validContacts = await Contact.find({
    _id: { $in: contactIds },
    user_id: userId,
    deleted_at: null
  }).select('_id');

  const validIds = validContacts.map(c => c._id);

  if (validIds.length === 0) return 0;

  await Contact.updateMany(
    { _id: { $in: validIds } },
    { $addToSet: { segments: segmentId } }
  );

  await updateSegmentMemberCount(segmentId);

  return validIds.length;
};

export const bulkAddContactsToSegments = async (contactIds, segmentIds, userId) => {
  const validContacts = await Contact.find({
    _id: { $in: contactIds },
    user_id: userId,
    deleted_at: null
  }).select('_id');
  const validContactIds = validContacts.map(c => c._id);

  const validSegments = await Segment.find({
    _id: { $in: segmentIds },
    user_id: userId,
    deleted_at: null
  }).select('_id');
  const validSegmentIds = validSegments.map(g => g._id);

  if (validContactIds.length === 0 || validSegmentIds.length === 0) return 0;

  await Contact.updateMany(
    { _id: { $in: validContactIds } },
    { $addToSet: { segments: { $each: validSegmentIds } } }
  );

  for (const segmentId of validSegmentIds) {
    await updateSegmentMemberCount(segmentId);
  }

  return validContactIds.length * validSegmentIds.length;
};

export const updateContactSegments = async (contactId, segmentIds, userId) => {
  const contact = await Contact.findOne({ _id: contactId, user_id: userId, deleted_at: null });
  if (!contact) return;

  const oldSegmentIds = contact.segments || [];

  await Contact.findByIdAndUpdate(contactId, {
    $set: { segments: segmentIds }
  });

  const allAffectedSegmentIds = [...new Set([...oldSegmentIds.map(id => id.toString()), ...segmentIds.map(id => id.toString())])];

  for (const segmentId of allAffectedSegmentIds) {
    await updateSegmentMemberCount(segmentId);
  }
};

export const attachSegmentsToContacts = async (contacts, userId) => {
  if (!contacts) return contacts;
  const isArray = Array.isArray(contacts);
  const contactsList = isArray ? contacts : [contacts];

  await Contact.populate(contactsList, {
    path: 'segments',
    select: 'name'
  });

  return contacts;
};

export const removeContactsFromSegment = async (segmentId, contactIds, userId) => {
  if (!Array.isArray(contactIds) || contactIds.length === 0) return 0;

  const result = await Contact.updateMany(
    { _id: { $in: contactIds }, user_id: userId },
    { $pull: { segments: segmentId } }
  );

  if (result.modifiedCount > 0) {
    await updateSegmentMemberCount(segmentId);
  }

  return result.modifiedCount;
};

export const getSegmentContacts = async (segmentId, userId, options = {}) => {
  const { page, limit, skip, sortField = 'name', sortOrder = 1, searchQuery = {} } = options;

  const query = {
    segments: segmentId,
    user_id: userId,
    deleted_at: null,
    ...searchQuery
  };

  const contacts = await Contact.find(query)
    .sort({ [sortField]: sortOrder })
    .skip(skip)
    .limit(limit)
    .populate('tags', '_id label color');

  const total = await Contact.countDocuments(query);

  return {
    contacts,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      itemsPerPage: limit
    }
  };
};

export const getContactSegments = async (contactId, userId) => {
  const contact = await Contact.findOne({ _id: contactId, user_id: userId, deleted_at: null })
    .populate('segments');

  if (!contact) return [];
  return contact.segments.filter(s => s.deleted_at === null);
};

export const deleteSegment = async (segmentId, userId) => {
  const segment = await Segment.findOne({ _id: segmentId, user_id: userId });
  if (!segment) return null;

  await segment.softDelete();

  await Contact.updateMany(
    { segments: segmentId },
    { $pull: { segments: segmentId } }
  );

  return segment;
};

export const removeContactFromAllSegments = async (contactIds, userId) => {
  const ids = Array.isArray(contactIds) ? contactIds : [contactIds];
  if (ids.length === 0) return;

  const contacts = await Contact.find({ _id: { $in: ids }, user_id: userId }).select('segments');
  const affectedSegmentIds = [...new Set(contacts.flatMap(c => (c.segments || []).map(id => id.toString())))];

  await Contact.updateMany(
    { _id: { $in: ids }, user_id: userId },
    { $set: { segments: [] } }
  );

  for (const segmentId of affectedSegmentIds) {
    await updateSegmentMemberCount(segmentId);
  }
};

export const getContactsForSegments = async (segmentIds, userId) => {
  if (!Array.isArray(segmentIds) || segmentIds.length === 0) return [];

  return await Contact.find({
    segments: { $in: segmentIds },
    user_id: userId,
    deleted_at: null
  });
};

export const getSegmentById = async (segmentId, userId) => {
  return await Segment.findOne({ _id: segmentId, user_id: userId });
}

export const updateSegment = async (segmentId, segmentData, userId) => {
  const segment = await Segment.findOne({ _id: segmentId, user_id: userId });
  if (!segment) return null;

  if (segmentData.name !== undefined && segmentData.name !== segment.name) {
    const existingSegment = await Segment.findOne({
      name: { $regex: new RegExp(`^${segmentData.name}$`, 'i') },
      user_id: userId,
      deleted_at: null,
      _id: { $ne: segmentId }
    });

    if (existingSegment) {
      throw new Error('A segment with this name already exists');
    }
    segment.name = segmentData.name;
  }

  if (segmentData.description !== undefined) segment.description = segmentData.description;
  if (segmentData.sort_order !== undefined) segment.sort_order = segmentData.sort_order;

  if (segmentData.hasOwnProperty('contactIds')) {
    await Contact.updateMany(
      { segments: segmentId, user_id: userId },
      { $pull: { segments: segmentId } }
    );

    const contactIds = segmentData.contactIds;
    if (Array.isArray(contactIds) && contactIds.length > 0) {
      await addContactsToSegment(segmentId, contactIds, userId);
    } else {
      await updateSegmentMemberCount(segmentId);
    }

    const updatedSegment = await Segment.findById(segmentId);
    if (updatedSegment) {
      segment.member_count = updatedSegment.member_count;
    }
  }

  return await segment.save();
}

export const bulkDeleteSegments = async (segmentIds, userId) => {
  if (!Array.isArray(segmentIds) || segmentIds.length === 0) return 0;

  const objectIds = segmentIds.map(id => new mongoose.Types.ObjectId(id));

  const result = await Segment.updateMany(
    { _id: { $in: objectIds }, user_id: userId, deleted_at: null },
    { $set: { deleted_at: new Date() } }
  );

  if (result.modifiedCount > 0) {
    await Contact.updateMany(
      { user_id: userId, segments: { $in: objectIds } },
      { $pull: { segments: { $in: objectIds } } }
    );
  }

  return result.modifiedCount;
};