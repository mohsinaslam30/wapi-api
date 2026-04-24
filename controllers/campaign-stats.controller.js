import {
  getCampaignStats,
  updateCampaignStatsFromMessage,
  bulkUpdateCampaignStats
} from '../utils/campaign-stats.service.js';
import Campaign from '../models/campaign.model.js';


export const getCampaignStatistics = async (req, res) => {
  try {
    const { campaignId } = req.params;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: 'Campaign ID is required'
      });
    }

    const stats = await getCampaignStats(campaignId);

    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Get campaign statistics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get campaign statistics',
      error: error.message
    });
  }
};


export const updateCampaignStatsFromMessageEndpoint = async (req, res) => {
  try {
    const { messageId, status, timestamp } = req.body;

    if (!messageId) {
      return res.status(400).json({
        success: false,
        message: 'Message ID is required'
      });
    }

    if (!status || !['sent', 'delivered', 'read', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status (sent, delivered, read, failed) is required'
      });
    }

    const result = await updateCampaignStatsFromMessage(
      messageId,
      status,
      timestamp ? new Date(timestamp) : null
    );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found for this message'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Campaign statistics updated successfully',
      data: result
    });
  } catch (error) {
    console.error('Update campaign stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update campaign statistics',
      error: error.message
    });
  }
};


export const bulkUpdateCampaignStatsEndpoint = async (req, res) => {
  try {
    const { messageIds, status, timestamp } = req.body;

    if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Array of message IDs is required'
      });
    }

    if (!status || !['sent', 'delivered', 'read', 'failed'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Valid status (sent, delivered, read, failed) is required'
      });
    }

    const result = await bulkUpdateCampaignStats(
      messageIds,
      status,
      timestamp ? new Date(timestamp) : null
    );

    return res.status(200).json({
      success: true,
      message: `Processed ${result.processed} out of ${result.total} messages`,
      data: result
    });
  } catch (error) {
    console.error('Bulk update campaign stats error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to bulk update campaign statistics',
      error: error.message
    });
  }
};


export const getCampaignStatsWithMessages = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { status } = req.query; 

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: 'Campaign ID is required'
      });
    }

    const campaign = await Campaign.findById(campaignId)
      .populate('recipients.contact_id', 'name phone_number email')
      .select('name stats status recipients created_at sent_at completed_at')
      .lean();

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: 'Campaign not found'
      });
    }

    let recipients = campaign.recipients;
    if (status) {
      recipients = recipients.filter(recipient => recipient.status === status);
    }

    const response = {
      campaign: {
        id: campaign._id,
        name: campaign.name,
        status: campaign.status,
        stats: campaign.stats,
        created_at: campaign.created_at,
        sent_at: campaign.sent_at,
        completed_at: campaign.completed_at
      },
      recipients: recipients.map(recipient => ({
        contact_id: recipient.contact_id?._id || null,
        name: recipient.contact_id?.name || 'Unknown',
        phone_number: recipient.phone_number,
        status: recipient.status,
        sent_at: recipient.sent_at,
        delivered_at: recipient.delivered_at,
        read_at: recipient.read_at,
        failed_at: recipient.failed_at,
        failure_reason: recipient.failure_reason
      }))
    };

    return res.status(200).json({
      success: true,
      data: response
    });
  } catch (error) {
    console.error('Get campaign stats with messages error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get campaign statistics with messages',
      error: error.message
    });
  }
};

export default {
  getCampaignStatistics,
  updateCampaignStatsFromMessageEndpoint,
  bulkUpdateCampaignStatsEndpoint,
  getCampaignStatsWithMessages
};
