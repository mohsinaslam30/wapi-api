import Campaign from '../models/campaign.model.js';
import Message from '../models/message.model.js';
import mongoose from 'mongoose';



export const updateCampaignStatsFromMessage = async (messageId, newStatus, timestamp = null) => {
  try {
    const message = await Message.findById(messageId)
      .select('template_id metadata recipient_number contact_id user_id')
      .lean();

    if (!message) {
      console.log(`Message not found: ${messageId}`);
      return null;
    }

    const campaignId = message.metadata?.campaign_id;
    if (!campaignId) {
      console.log(`Message ${messageId} is not part of a campaign`);
      return null;
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      console.log(`Campaign not found: ${campaignId}`);
      return null;
    }

    let statusUpdate = {};
    let campaignStatsUpdate = {};

    switch (newStatus) {
      case 'sent':
        statusUpdate.status = 'sent';
        statusUpdate.sent_at = timestamp || new Date();
        campaignStatsUpdate.sent_count = (campaign.stats.sent_count || 0) + 1;
        campaignStatsUpdate.pending_count = Math.max(0, (campaign.stats.pending_count || 0) - 1);
        break;

      case 'delivered':
        statusUpdate.status = 'delivered';
        statusUpdate.delivered_at = timestamp || new Date();
        campaignStatsUpdate.delivered_count = (campaign.stats.delivered_count || 0) + 1;
        break;

      case 'read':
        statusUpdate.status = 'read';
        statusUpdate.read_at = timestamp || new Date();
        campaignStatsUpdate.read_count = (campaign.stats.read_count || 0) + 1;
        break;

      case 'failed':
        statusUpdate.status = 'failed';
        statusUpdate.failed_at = timestamp || new Date();
        campaignStatsUpdate.failed_count = (campaign.stats.failed_count || 0) + 1;
        campaignStatsUpdate.pending_count = Math.max(0, (campaign.stats.pending_count || 0) - 1);
        break;

      default:
        console.log(`Unknown status: ${newStatus}`);
        return null;
    }

    const recipientQuery = message.contact_id
      ? { _id: campaignId, "recipients.contact_id": message.contact_id }
      : { _id: campaignId, "recipients.phone_number": message.recipient_number };

    const currentCampaign = await Campaign.findById(campaignId);
    if (!currentCampaign) {
      console.log(`Campaign not found: ${campaignId}`);
      return null;
    }

    const recipient = currentCampaign.recipients.find(r =>
      (message.contact_id && r.contact_id?.toString() === message.contact_id.toString()) ||
      (r.phone_number === message.recipient_number)
    );

    if (!recipient) {
      console.log(`Recipient not found in campaign ${campaignId}`);
      return null;
    }

    console.log(`Current recipient status: ${recipient.status}, new status: ${newStatus}`);

    let shouldIncrementStats = false;

    switch (newStatus) {
      case 'sent':
        shouldIncrementStats = recipient.status !== 'sent';
        break;
      case 'delivered':
        shouldIncrementStats = recipient.status === 'sent';
        break;
      case 'read':
        shouldIncrementStats = recipient.status === 'delivered' || recipient.status === 'sent';
        break;
      case 'failed':
        shouldIncrementStats = recipient.status !== 'failed';
        break;
    }

    console.log(`Should increment stats: ${shouldIncrementStats}`);

    const recipientUpdate = {
      $set: {
        "recipients.$.status": statusUpdate.status,
        "recipients.$.updated_at": new Date()
      }
    };

    if (statusUpdate.sent_at) {
      recipientUpdate.$set["recipients.$.sent_at"] = statusUpdate.sent_at;
    }
    if (statusUpdate.delivered_at) {
      recipientUpdate.$set["recipients.$.delivered_at"] = statusUpdate.delivered_at;
    }
    if (statusUpdate.read_at) {
      recipientUpdate.$set["recipients.$.read_at"] = statusUpdate.read_at;
    }
    if (statusUpdate.failed_at) {
      recipientUpdate.$set["recipients.$.failed_at"] = statusUpdate.failed_at;
    }

    await Campaign.updateOne(
      recipientQuery,
      recipientUpdate
    );

    let updatedCampaign;
    if (shouldIncrementStats) {
      const statsUpdate = {};

      if (campaignStatsUpdate.sent_count !== undefined) {
        statsUpdate['stats.sent_count'] = campaignStatsUpdate.sent_count;
      }
      if (campaignStatsUpdate.delivered_count !== undefined) {
        statsUpdate['stats.delivered_count'] = campaignStatsUpdate.delivered_count;
      }
      if (campaignStatsUpdate.read_count !== undefined) {
        statsUpdate['stats.read_count'] = campaignStatsUpdate.read_count;
      }
      if (campaignStatsUpdate.failed_count !== undefined) {
        statsUpdate['stats.failed_count'] = campaignStatsUpdate.failed_count;
      }
      if (campaignStatsUpdate.pending_count !== undefined) {
        statsUpdate['stats.pending_count'] = campaignStatsUpdate.pending_count;
      }

      statsUpdate.updated_at = new Date();

      console.log(`Updating campaign ${campaignId} stats:`, statsUpdate);

      updatedCampaign = await Campaign.findByIdAndUpdate(
        campaignId,
        { $set: statsUpdate },
        { returnDocument: 'after', runValidators: true }
      );
    } else {
      console.log(`Skipping stats update for campaign ${campaignId} - status already processed`);
      updatedCampaign = await Campaign.findById(campaignId);
    }

    if (!updatedCampaign) {
      console.log(`Campaign not found for ID: ${campaignId}`);
      return null;
    }

    if (updatedCampaign && updatedCampaign.recipients && updatedCampaign.recipients.length > 0) {
      const recipientStatuses = updatedCampaign.recipients.map(r => r.status);

      let newCampaignStatus = updatedCampaign.status;

      if (recipientStatuses.includes('failed')) {
        newCampaignStatus = 'completed_with_errors';
      } else if (recipientStatuses.every(status => status === 'read')) {
        newCampaignStatus = 'completed';
      } else if (recipientStatuses.every(status => status === 'delivered' || status === 'read')) {
        newCampaignStatus = 'delivered';
      }

      if (newCampaignStatus !== updatedCampaign.status) {
        await Campaign.findByIdAndUpdate(campaignId, {
          $set: {
            status: newCampaignStatus,
            updated_at: new Date()
          }
        });
      }
    }

    const totalProcessed = (updatedCampaign.stats.sent_count || 0) +
                          (updatedCampaign.stats.failed_count || 0);

    if (totalProcessed >= updatedCampaign.stats.total_recipients &&
        updatedCampaign.status === 'sending') {

      const hasFailures = (updatedCampaign.stats.failed_count || 0) > 0;
      const finalStatus = hasFailures ? 'completed_with_errors' : 'completed';

      await Campaign.findByIdAndUpdate(campaignId, {
        $set: {
          status: finalStatus,
          completed_at: new Date(),
          updated_at: new Date()
        }
      });

      if (updatedCampaign.sent_at) {
        const duration = Math.floor((Date.now() - new Date(updatedCampaign.sent_at).getTime()) / 1000);
        await Campaign.findByIdAndUpdate(campaignId, {
          $set: {
            completion_duration_seconds: duration,
            updated_at: new Date()
          }
        });
      }
    }

    console.log(`Campaign ${campaignId} stats updated for message ${messageId}: ${newStatus}`);

    return {
      campaignId: updatedCampaign._id,
      stats: updatedCampaign.stats,
      status: updatedCampaign.status
    };

  } catch (error) {
    console.error('Error updating campaign stats from message:', error);
    throw error;
  }
};


export const bulkUpdateCampaignStats = async (messageIds, status, timestamp = null) => {
  try {
    const results = [];

    for (const messageId of messageIds) {
      try {
        const result = await updateCampaignStatsFromMessage(messageId, status, timestamp);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.error(`Error updating campaign stats for message ${messageId}:`, error);
      }
    }

    return {
      processed: results.length,
      total: messageIds.length,
      results
    };

  } catch (error) {
    console.error('Error in bulk campaign stats update:', error);
    throw error;
  }
};


export const getCampaignStats = async (campaignId) => {
  try {
    const campaign = await Campaign.findById(campaignId)
      .select('stats status name created_at sent_at completed_at completion_duration_seconds')
      .lean();

    if (!campaign) {
      throw new Error('Campaign not found');
    }

    return campaign;

  } catch (error) {
    console.error('Error getting campaign stats:', error);
    throw error;
  }
};


export const updateCampaignStatsFromWhatsApp = async (waMessageId, status, timestamp = null) => {
  try {
    const message = await Message.findOne({ wa_message_id: waMessageId })
      .select('_id metadata')
      .lean();

    if (!message) {
      console.log(`Message not found for WhatsApp ID: ${waMessageId}`);
      return null;
    }

    let internalStatus;
    switch (status) {
      case 'sent':
        internalStatus = 'sent';
        break;
      case 'delivered':
        internalStatus = 'delivered';
        break;
      case 'read':
        internalStatus = 'read';
        break;
      case 'failed':
        internalStatus = 'failed';
        break;
      default:
        console.log(`Unknown WhatsApp status: ${status}`);
        return null;
    }

    return await updateCampaignStatsFromMessage(
      message._id.toString(),
      internalStatus,
      timestamp
    );

  } catch (error) {
    console.error('Error updating campaign stats from WhatsApp:', error);
    throw error;
  }
};

export default {
  updateCampaignStatsFromMessage,
  bulkUpdateCampaignStats,
  getCampaignStats,
  updateCampaignStatsFromWhatsApp
};
