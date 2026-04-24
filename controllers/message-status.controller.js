import {
  updateDeliveryStatus,
  updateReadStatus,
  updateWhatsAppStatus,
  markMessagesAsDelivered,
  markMessagesAsRead,
  getMessageStatusSummary
} from '../utils/message-status.service.js';
import Message from '../models/message.model.js';


export const updateMessageDeliveryStatus = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { status, timestamp } = req.body;

    if (!messageId) {
      return res.status(400).json({
        success: false,
        message: 'Message ID is required'
      });
    }

    if (!status || !['sent', 'delivered', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status (sent, delivered, failed) is required'
      });
    }

    const updatedMessage = await updateDeliveryStatus(
      messageId,
      status,
      timestamp ? new Date(timestamp) : null
    );

    return res.status(200).json({
      success: true,
      message: 'Delivery status updated successfully',
      data: updatedMessage
    });
  } catch (error) {
    console.error('Update delivery status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update delivery status',
      error: error.message
    });
  }
};


export const updateMessageReadStatus = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { status, timestamp } = req.body;

    if (!messageId) {
      return res.status(400).json({
        success: false,
        message: 'Message ID is required'
      });
    }

    if (!status || !['read', 'read_by_multiple'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status (read, read_by_multiple) is required'
      });
    }

    const updatedMessage = await updateReadStatus(
      messageId,
      status,
      timestamp ? new Date(timestamp) : null
    );

    return res.status(200).json({
      success: true,
      message: 'Read status updated successfully',
      data: updatedMessage
    });
  } catch (error) {
    console.error('Update read status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update read status',
      error: error.message
    });
  }
};


export const updateWhatsAppMessageStatus = async (req, res) => {
  try {
    const { waMessageId, status, timestamp } = req.body;

    if (!waMessageId) {
      return res.status(400).json({
        success: false,
        message: 'WhatsApp message ID is required'
      });
    }

    if (!status || !['sent', 'delivered', 'read', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid WhatsApp status (sent, delivered, read, failed) is required'
      });
    }

    const updatedMessage = await updateWhatsAppStatus(
      waMessageId,
      status,
      timestamp ? new Date(timestamp) : null
    );

    return res.status(200).json({
      success: true,
      message: 'WhatsApp status updated successfully',
      data: updatedMessage
    });
  } catch (error) {
    console.error('Update WhatsApp status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update WhatsApp status',
      error: error.message
    });
  }
};


export const bulkUpdateDeliveryStatus = async (req, res) => {
  try {
    const { messageIds, timestamp } = req.body;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array of message IDs is required'
      });
    }

    const result = await markMessagesAsDelivered(
      messageIds,
      timestamp ? new Date(timestamp) : null
    );

    return res.status(200).json({
      success: true,
      message: `${result.modifiedCount} messages marked as delivered`,
      data: {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    console.error('Bulk update delivery status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to bulk update delivery status',
      error: error.message
    });
  }
};


export const bulkUpdateReadStatus = async (req, res) => {
  try {
    const { messageIds, timestamp } = req.body;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array of message IDs is required'
      });
    }

    const result = await markMessagesAsRead(
      messageIds,
      timestamp ? new Date(timestamp) : null
    );

    return res.status(200).json({
      success: true,
      message: `${result.modifiedCount} messages marked as read`,
      data: {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount
      }
    });
  } catch (error) {
    console.error('Bulk update read status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to bulk update read status',
      error: error.message
    });
  }
};


export const getMessageStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, contactId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const options = {};
    if (startDate) options.startDate = startDate;
    if (endDate) options.endDate = endDate;
    if (contactId) options.contactId = contactId;

    const summary = await getMessageStatusSummary(userId, options);

    return res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    console.error('Get message status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get message status',
      error: error.message
    });
  }
};


export const getMessagesStatus = async (req, res) => {
  try {
    const { messageIds } = req.body;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array of message IDs is required'
      });
    }

    const messages = await Message.find({
      _id: { $in: messageIds },
      deleted_at: null
    }).select(
      '_id is_delivered delivered_at delivery_status is_seen seen_at read_status wa_status wa_status_timestamp'
    );

    return res.status(200).json({
      success: true,
      data: messages
    });
  } catch (error) {
    console.error('Get messages status error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get messages status',
      error: error.message
    });
  }
};

export default {
  updateMessageDeliveryStatus,
  updateMessageReadStatus,
  updateWhatsAppMessageStatus,
  bulkUpdateDeliveryStatus,
  bulkUpdateReadStatus,
  getMessageStatus,
  getMessagesStatus
};
