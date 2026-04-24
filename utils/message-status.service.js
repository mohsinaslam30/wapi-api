import Message from '../models/message.model.js';
import { updateCampaignStatsFromMessage } from './campaign-stats.service.js';


export const updateDeliveryStatus = async (messageId, status, timestamp = null) => {
  try {
    const updateData = {
      delivery_status: status,
      wa_status: status,
      wa_status_timestamp: timestamp || new Date()
    };

    if (status === 'delivered') {
      updateData.is_delivered = true;
      updateData.delivered_at = timestamp || new Date();
    } else if (status === 'failed') {
      updateData.is_delivered = false;
    }

    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      { $set: updateData },
      { returnDocument: 'after', runValidators: true }
    );

    if (!updatedMessage) {
      throw new Error('Message not found');
    }

    try {
      const { updateCampaignStatsFromMessage } = await import('./campaign-stats.service.js');
      const result = await updateCampaignStatsFromMessage(messageId, status, timestamp);
      console.log(`Campaign stats update result for message ${messageId}:`, result);
    } catch (campaignError) {
      console.error('Error updating campaign stats:', campaignError);
    }

    return updatedMessage;
  } catch (error) {
    console.error('Error updating delivery status:', error);
    throw error;
  }
};


export const updateReadStatus = async (messageId, status, timestamp = null) => {
  try {
    const updateData = {
      read_status: status,
      wa_status: status,
      wa_status_timestamp: timestamp || new Date()
    };

    if (status === 'read' || status === 'read_by_multiple') {
      updateData.is_seen = true;
      updateData.seen_at = timestamp || new Date();
    }

    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      { $set: updateData },
      { returnDocument: 'after', runValidators: true }
    );

    if (!updatedMessage) {
      throw new Error('Message not found');
    }

    try {
      const { updateCampaignStatsFromMessage } = await import('./campaign-stats.service.js');
      const result = await updateCampaignStatsFromMessage(messageId, status, timestamp);
      console.log(`Campaign stats update result for message ${messageId}:`, result);
    } catch (campaignError) {
      console.error('Error updating campaign stats:', campaignError);
    }

    return updatedMessage;
  } catch (error) {
    console.error('Error updating read status:', error);
    throw error;
  }
};


export const updateWhatsAppStatus = async (waMessageId, status, timestamp = null) => {
  try {
    if (!waMessageId) {
      throw new Error('WhatsApp message ID is required');
    }

    const updateData = {
      wa_status: status,
      wa_status_timestamp: timestamp || new Date()
    };

    switch (status) {
      case 'sent':
        updateData.delivery_status = 'sent';
        break;
      case 'delivered':
        updateData.delivery_status = 'delivered';
        updateData.is_delivered = true;
        updateData.delivered_at = timestamp || new Date();
        break;
      case 'read':
        updateData.read_status = 'read';
        updateData.is_seen = true;
        updateData.seen_at = timestamp || new Date();
        break;
      case 'failed':
        updateData.delivery_status = 'failed';
        updateData.is_delivered = false;
        break;
    }

    const updatedMessage = await Message.findOneAndUpdate(
      { wa_message_id: waMessageId },
      { $set: updateData },
      { returnDocument: 'after', runValidators: true }
    );

    if (!updatedMessage) {
      if (waMessageId.startsWith('wacid.')) {
        console.log(`[StatusWebhook] Handling status for call: ${waMessageId} (${status})`);

        const statusMap = {
          'RINGING': 'ringing',
          'ACCEPTED': 'answered',
          'FAILED': 'failed',
          'COMPLETED': 'completed'
        };

        const callStatus = statusMap[status] || status.toLowerCase();
        const validStatuses = ['ringing', 'answered', 'completed', 'failed', 'missed'];

        if (validStatuses.includes(callStatus)) {
          const { WhatsappCallLog } = await import('../models/index.js');
          await WhatsappCallLog.findOneAndUpdate(
            { wa_call_id: waMessageId },
            { $set: { status: callStatus } }
          );
        }
        return null;
      }
      throw new Error('Message not found for WhatsApp ID: ' + waMessageId);
    }

    try {
      const { updateCampaignStatsFromMessage } = await import('./campaign-stats.service.js');
      await updateCampaignStatsFromMessage(updatedMessage._id.toString(), status, timestamp);
    } catch (campaignError) {
      console.error('Error updating campaign stats:', campaignError);
    }

    return updatedMessage;
  } catch (error) {
    console.error('Error updating WhatsApp status:', error);
    throw error;
  }
};


export const markMessagesAsDelivered = async (messageIds, timestamp = null) => {
  try {
    const result = await Message.updateMany(
      { _id: { $in: messageIds } },
      {
        $set: {
          is_delivered: true,
          delivered_at: timestamp || new Date(),
          delivery_status: 'delivered',
          wa_status: 'delivered',
          wa_status_timestamp: timestamp || new Date()
        }
      }
    );

    try {
      const { bulkUpdateCampaignStats } = await import('./campaign-stats.service.js');
      const result = await bulkUpdateCampaignStats(messageIds, 'delivered', timestamp);
      console.log(`Bulk campaign stats update result:`, result);
    } catch (campaignError) {
      console.error('Error updating campaign stats in bulk:', campaignError);
    }

    return result;
  } catch (error) {
    console.error('Error marking messages as delivered:', error);
    throw error;
  }
};


export const markMessagesAsRead = async (messageIds, timestamp = null) => {
  try {
    const result = await Message.updateMany(
      { _id: { $in: messageIds } },
      {
        $set: {
          is_seen: true,
          seen_at: timestamp || new Date(),
          read_status: 'read',
          wa_status: 'read',
          wa_status_timestamp: timestamp || new Date()
        }
      }
    );

    try {
      const { bulkUpdateCampaignStats } = await import('./campaign-stats.service.js');
      const result = await bulkUpdateCampaignStats(messageIds, 'read', timestamp);
      console.log(`Bulk campaign stats update result:`, result);
    } catch (campaignError) {
      console.error('Error updating campaign stats in bulk:', campaignError);
    }

    return result;
  } catch (error) {
    console.error('Error marking messages as read:', error);
    throw error;
  }
};


export const getMessageStatusSummary = async (userId, options = {}) => {
  try {
    const { startDate, endDate, contactId } = options;

    const query = { user_id: userId, deleted_at: null };

    if (startDate || endDate) {
      query.created_at = {};
      if (startDate) query.created_at.$gte = new Date(startDate);
      if (endDate) query.created_at.$lte = new Date(endDate);
    }

    if (contactId) {
      query.contact_id = contactId;
    }

    const [deliveryStats, readStats, totalMessages] = await Promise.all([
      Message.aggregate([
        { $match: query },
        { $group: { _id: '$delivery_status', count: { $sum: 1 } } }
      ]),
      Message.aggregate([
        { $match: query },
        { $group: { _id: '$read_status', count: { $sum: 1 } } }
      ]),
      Message.countDocuments(query)
    ]);

    const summary = {
      total: totalMessages,
      delivery: {},
      read: {}
    };

    deliveryStats.forEach(stat => {
      summary.delivery[stat._id] = stat.count;
    });

    readStats.forEach(stat => {
      summary.read[stat._id] = stat.count;
    });

    return summary;
  } catch (error) {
    console.error('Error getting message status summary:', error);
    throw error;
  }
};

export default {
  updateDeliveryStatus,
  updateReadStatus,
  updateWhatsAppStatus,
  markMessagesAsDelivered,
  markMessagesAsRead,
  getMessageStatusSummary
};
