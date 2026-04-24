import mongoose from 'mongoose';
import Campaign from '../models/campaign.model.js';
import Template from '../models/template.model.js';
import Contact from '../models/contact.model.js';
import WhatsappWaba from '../models/whatsapp-waba.model.js';
import { processCampaignInBackground } from '../utils/campaign-processing.js';

const API_VERSION = 'v23.0';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const parsePaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
  const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(query.limit) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const SORT_ORDER = {
  ASC: 1,
  DESC: -1
};

const DEFAULT_SORT_FIELD = 'created_at';
const ALLOWED_SORT_FIELDS = ['name', 'description', 'recipient_type', 'status', 'created_at', 'sent_at'];

const parseSortParams = (query) => {
  const sortField = ALLOWED_SORT_FIELDS.includes(query.sort_by)
    ? query.sort_by
    : DEFAULT_SORT_FIELD;

  const sortOrder = query.sort_order?.toUpperCase() === 'DESC'
    ? SORT_ORDER.DESC
    : SORT_ORDER.ASC;

  return { sortField, sortOrder };
};

export const createCampaign = async (req, res) => {
  try {
    let {
      name,
      description,
      waba_id,
      template_id,
      template_name,
      language_code,
      recipient_type,
      specific_contacts = [],
      contact_numbers = [],
      tag_ids = [],
      variables_mapping = {},
      media_url,
      coupon_code,
      carousel_products,
      carousel_cards_data,
      offer_expiration_minutes,
      is_scheduled = false,
      scheduled_at
    } = req.body;

    const userId = req.user.owner_id;

    if (!name) {
      return res.status(400).json({ error: 'Campaign name is required' });
    }

    if (!waba_id) {
      return res.status(400).json({ error: 'WABA ID is required' });
    }

    if (!template_id && !template_name) {
      return res.status(400).json({ error: 'Template ID or Template Name is required' });
    }

    if (!recipient_type) {
      return res.status(400).json({ error: 'Recipient type is required' });
    }

    if (recipient_type === 'specific_contacts' && (!specific_contacts || specific_contacts.length === 0) && (!contact_numbers || contact_numbers.length === 0)) {
      return res.status(400).json({ error: 'Specific contacts or contact numbers are required for this recipient type' });
    }

    if (recipient_type === 'tags' && (!tag_ids || tag_ids.length === 0)) {
      return res.status(400).json({ error: 'Tag IDs are required for this recipient type' });
    }

    if (is_scheduled && !scheduled_at) {
      return res.status(400).json({ error: 'Scheduled time is required for scheduled campaigns' });
    }

    let wabaQuery = {
      user_id: userId,
      deleted_at: null,
    };

    if (mongoose.Types.ObjectId.isValid(waba_id)) {
      wabaQuery.$or = [
        { _id: waba_id },
        { whatsapp_business_account_id: waba_id }
      ];
    } else {
      wabaQuery.whatsapp_business_account_id = waba_id;
    }

    const waba = await WhatsappWaba.findOne(wabaQuery);

    if (!waba) {
      return res.status(404).json({ error: 'WhatsApp WABA not found' });
    }
    
    waba_id = waba._id.toString();

    let templateQuery = {
      user_id: userId,
      deleted_at: null
    };

    if (template_name) {
      templateQuery.template_name = template_name.toLowerCase();
    } else if (template_id) {
      templateQuery._id = template_id;
    }

    const template = await Template.findOne(templateQuery);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    template_id = template._id.toString();

    const templateType = (template.template_type || '').toLowerCase();
    const isCarouselTemplate = ['carousel_product', 'carousel_media'].includes(templateType);
    const carouselProducts = req.body.carousel_products;
    const carouselCardsData = req.body.carousel_cards_data;
    const isProductCarousel = isCarouselTemplate && template.carousel_cards?.length > 0 &&
      template.carousel_cards[0].components?.some(c => (c.type || '').toLowerCase() === 'header' && (c.format || '').toLowerCase() === 'product');
    if (isCarouselTemplate) {
      if (isProductCarousel) {
        if (!carouselProducts || !Array.isArray(carouselProducts) || carouselProducts.length === 0) {
          return res.status(400).json({
            error: 'Product carousel template requires carousel_products: array of { product_retailer_id, catalog_id }'
          });
        }
        if (carouselProducts.length > 10) {
          return res.status(400).json({ error: 'Carousel supports at most 10 cards' });
        }
      } else {
        if (!carouselCardsData || !Array.isArray(carouselCardsData) || carouselCardsData.length === 0) {
          return res.status(400).json({
            error: 'Media carousel template requires carousel_cards_data: array of { header: { type, id or link }, buttons: [{ type, payload or url_value }] }'
          });
        }
        if (carouselCardsData.length > 10) {
          return res.status(400).json({ error: 'Carousel supports at most 10 cards' });
        }
      }
    }

    let contacts = [];
    if (recipient_type === 'all_contacts') {
      contacts = await Contact.find({
        created_by: userId,
        deleted_at: null
      });
    } else if (recipient_type === 'specific_contacts') {
      if (specific_contacts && specific_contacts.length > 0) {
        contacts = await Contact.find({
          _id: { $in: specific_contacts },
          created_by: userId,
          deleted_at: null
        });
      } else if (contact_numbers && contact_numbers.length > 0) {
        contacts = await Contact.find({
          phone_number: { $in: contact_numbers },
          created_by: userId,
          deleted_at: null
        });

        const foundNumbers = contacts.map(c => c.phone_number);
        const missingNumbers = contact_numbers.filter(num => !foundNumbers.includes(num));
        
        if (missingNumbers.length > 0) {
          const newContactsToInsert = missingNumbers.map(num => ({
            phone_number: num,
            name: num,
            user_id: userId,
            created_by: userId,
            status: 'lead'
          }));
          const newlyCreated = await Contact.insertMany(newContactsToInsert);
          contacts.push(...newlyCreated);
        }
      }
    } else if (recipient_type === 'tags') {
      contacts = await Contact.find({
        tags: { $in: tag_ids },
        created_by: userId,
        deleted_at: null
      });
    }

    if (contacts.length === 0) {
      return res.status(400).json({ error: 'No contacts found for the specified criteria' });
    }

    const recipients = contacts.map(contact => ({
      contact_id: contact._id,
      phone_number: contact.phone_number,
      status: 'pending'
    }));

    const campaign = await Campaign.create({
      name,
      description,
      user_id: userId,
      created_by: req.user.id,
      waba_id,
      template_id,
      template_name: template.template_name,
      language_code: language_code?? template.language,
      recipient_type,
      specific_contacts: recipient_type === 'specific_contacts' ? specific_contacts : [],
      tag_ids: recipient_type === 'tags' ? tag_ids : [],
      variables_mapping,
      media_url,
      coupon_code: coupon_code || null,
      carousel_products: carousel_products && Array.isArray(carousel_products) ? carousel_products : undefined,
      carousel_cards_data: carousel_cards_data && Array.isArray(carousel_cards_data) ? carousel_cards_data : undefined,
      offer_expiration_minutes: offer_expiration_minutes ?? null,
      is_scheduled,
      scheduled_at: is_scheduled ? new Date(scheduled_at) : null,
      status: is_scheduled ? 'scheduled' : 'draft',
      stats: {
        total_recipients: contacts.length,
        pending_count: contacts.length
      },
      recipients
    });

    if (!is_scheduled) {
      campaign.status = 'sending';
      campaign.sent_at = new Date();
      await campaign.save();

      setImmediate(async () => {
        await processCampaignInBackground(campaign);
      });

      return res.status(201).json({
        success: true,
        message: 'Campaign created and sending started',
        data: campaign
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Campaign created successfully',
      data: campaign
    });

  } catch (error) {
    console.error('Error creating campaign:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create campaign',
      details: error.message
    });
  }
};

export const getAllCampaigns = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const { status, search } = req.query;

    const matchFilter = {
      user_id: new mongoose.Types.ObjectId(userId),
      deleted_at: null
    };

    if (status) {
      matchFilter.status = status;
    }

    if (search) {
      matchFilter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const [totalCount, campaigns, campaignStatsAgg] = await Promise.all([
      Campaign.countDocuments(matchFilter),
      Campaign.find(matchFilter)
      .select(
        'name description recipient_type is_scheduled scheduled_at sent_at stats status completion_duration_seconds template_id created_at'
      )
      .populate({
        path: 'template_id',
        select: 'template_name'
      })
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit)
      .lean(),
      Campaign.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: null,
            total_campaigns: { $sum: 1 },
            total_sent: { $sum: '$stats.sent_count' },
            total_delivered: { $sum: '$stats.delivered_count' },
            total_read: { $sum: '$stats.read_count' }
          }
        }
      ])
    ]);

    const campaignStats = campaignStatsAgg[0] || {
      total_campaigns: 0,
      total_sent: 0,
      total_delivered: 0,
      total_read: 0
    };

    const formattedCampaigns = campaigns.map(c => ({
      id: c._id,
      name: c.name,
      description: c.description,
      template_name: c.template_id?.template_name || null,
      recipient_type: c.recipient_type,
      is_scheduled: c.is_scheduled,
      scheduled_at: c.scheduled_at,
      sent_at: c.sent_at,
      stats: c.stats,
      status: c.status,
      completion_duration_seconds: c.completion_duration_seconds
    }));

    return res.json({
      success: true,
      data: {
        campaigns: formattedCampaigns,
        campaignStatistics: {
          totalCampaignsCreated: campaignStats.total_campaigns,
          totalSent: campaignStats.total_sent,
          messagesDelivered: campaignStats.total_delivered,
          messagesRead: campaignStats.total_read
        },
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit
        }
      }
    });

  } catch (error) {
    console.error('Error getting campaigns:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get campaigns',
      details: error.message
    });
  }
};


export const getCampaignById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.owner_id;

    const campaign = await Campaign.findOne({
      _id: id,
      user_id: userId,
      deleted_at: null
    })
      .populate('template_id')
      .populate('waba_id', 'whatsapp_business_account_id')
      .populate('specific_contacts', 'name phone_number')
      .populate('tag_ids', 'label color');

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    return res.json({
      success: true,
      data: campaign
    });

  } catch (error) {
    console.error('Error getting campaign:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get campaign',
      details: error.message
    });
  }
};

export const updateCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.owner_id;
    const updateData = req.body;

    delete updateData.user_id;
    delete updateData.stats;
    delete updateData.recipients;
    delete updateData.sent_at;

    const campaign = await Campaign.findOne({
      _id: id,
      user_id: userId,
      deleted_at: null
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    if (['sending', 'completed', 'failed'].includes(campaign.status)) {
      return res.status(400).json({
        success: false,
        error: 'Cannot update campaign that is already in progress or completed'
      });
    }

    if (updateData.is_scheduled !== undefined) {
      if (updateData.is_scheduled && !updateData.scheduled_at) {
        return res.status(400).json({
          success: false,
          error: 'Scheduled time is required when enabling scheduling'
        });
      }
      updateData.status = updateData.is_scheduled ? 'scheduled' : 'draft';
      updateData.scheduled_at = updateData.is_scheduled ? new Date(updateData.scheduled_at) : null;
    }

    const updatedCampaign = await Campaign.findByIdAndUpdate(
      id,
      { ...updateData, updated_at: new Date() },
      { returnDocument: 'after' }
    )
      .populate('template_id')
      .populate('waba_id', 'whatsapp_business_account_id');

    return res.json({
      success: true,
      message: 'Campaign updated successfully',
      data: updatedCampaign
    });

  } catch (error) {
    console.error('Error updating campaign:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update campaign',
      details: error.message
    });
  }
};

export const deleteCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.owner_id;

    const campaign = await Campaign.findOne({
      _id: id,
      user_id: userId,
      deleted_at: null
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    if (['sending', 'completed', 'failed'].includes(campaign.status)) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete campaign that is already in progress or completed'
      });
    }

    await campaign.softDelete();

    return res.json({
      success: true,
      message: 'Campaign deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting campaign:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete campaign',
      details: error.message
    });
  }
};

export const sendCampaign = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.owner_id;

    const campaign = await Campaign.findOne({
      _id: id,
      user_id: userId,
      deleted_at: null
    }).populate('template_id');

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: 'Campaign not found'
      });
    }

    if (campaign.status !== 'draft') {
      return res.status(400).json({
        success: false,
        error: 'Campaign must be in draft status to send'
      });
    }


    campaign.status = 'sending';
    campaign.sent_at = new Date();
    await campaign.save();


    setTimeout(async () => {
      await processCampaignInBackground(campaign);
    }, 0);

    return res.json({
      success: true,
      message: 'Campaign sending started',
      data: {
        campaign_id: campaign._id,
        total_recipients: campaign.stats.total_recipients,
        status: campaign.status
      }
    });

  } catch (error) {
    console.error('Error sending campaign:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send campaign',
      details: error.message
    });
  }
};


export default {
  createCampaign,
  getAllCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  sendCampaign
};
