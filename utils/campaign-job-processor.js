import { Job } from 'bullmq';
import Campaign from '../models/campaign.model.js';
import Message from '../models/message.model.js';
import Contact from '../models/contact.model.js';
import { WhatsappPhoneNumber } from '../models/index.js';
import Template from '../models/template.model.js';
import unifiedWhatsAppService from '../services/whatsapp/unified-whatsapp.service.js';

const OBJECT_ID_REGEX = /^[a-f0-9]{24}$/i;

const isNewVariablesFormat = (mapping) => {
  if (!mapping || typeof mapping !== 'object') return false;
  const keys = Object.keys(mapping);
  if (keys.length === 0) return false;
  return keys.some((k) => !OBJECT_ID_REGEX.test(k));
};

const resolveVariablesForContact = (mapping, contact) => {
  if (!mapping || typeof mapping !== 'object') return {};
  const result = {};
  for (const [key, value] of Object.entries(mapping)) {
    if (value === undefined || value === null) continue;
    const strVal = String(value).trim();
    const match = strVal.match(/^\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}$/);
    if (match) {
      const fieldName = match[1];
      let resolved = '';
      if (contact) {
        if (fieldName in contact && contact[fieldName] != null) {
          resolved = String(contact[fieldName]);
        } else if (contact.custom_fields) {
          const cf = contact.custom_fields;
          const val = typeof cf.get === 'function' ? cf.get(fieldName) : cf[fieldName];
          if (val != null) resolved = String(val);
        }
      }
      result[key] = resolved;
    } else {
      result[key] = value;
    }
  }
  return result;
};

const toOrderedTemplateParamValues = (vars) => {
  if (!vars || typeof vars !== 'object') return [];
  const keys = Object.keys(vars);
  keys.sort((a, b) => Number(a) - Number(b));
  return keys
    .map((k) => vars[k])
    .filter((v) => v !== undefined && v !== null)
    .map((v) => String(v));
};

export const processCampaignMessageJob = async (jobData) => {
  const { campaignId, recipient, userId, templateData, wabaId } = jobData;

  if (!recipient || !recipient.phone_number) {
    console.error('Invalid recipient data:', recipient);
    throw new Error('Invalid recipient data: missing phone_number');
  }


  if (!recipient.contact_id) {
    console.warn('Missing contact_id, processing with phone_number only:', recipient.phone_number);
  }

  console.log('=== PROCESSING CAMPAIGN JOB ===', {
    campaignId,
    recipientPhone: recipient.phone_number,
    wabaId,
    timestamp: new Date().toISOString()
  });


  try {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found`);
    }

    const template = await Template.findById(campaign.template_id);
    if (!template) {
      throw new Error(`Template not found for campaign ${campaignId}`);
    }

    const templateVariables = {};
    if (templateData.variables && typeof templateData.variables === 'object') {
      Object.keys(templateData.variables).forEach(key => {
        templateVariables[key] = templateData.variables[key];
      });
    }

    const campaignPlatform = campaign.platform || 'whatsapp';

    if (campaignPlatform !== 'whatsapp') {
      const contactDoc = recipient.contact_id
        ? await Contact.findById(recipient.contact_id).lean()
        : await Contact.findOne({
          $or: [
            { phone_number: recipient.phone_number },
            { telegram_chat_id: recipient.phone_number },
            { facebook_page_scoped_id: recipient.phone_number },
            { instagram_scoped_id: recipient.phone_number }
          ],
          created_by: userId,
          deleted_at: null
        }).lean();

      let resultMsgId = '';
      let provider = campaignPlatform;
      let senderId = '';
      let resolvedCarouselElements = null;

      if (campaignPlatform === 'telegram') {
        const { default: TelegramConnection } = await import('../models/telegram-connection.model.js');
        const bot = await TelegramConnection.findOne({ user_id: userId, is_active: true });
        if (!bot) {
          throw new Error('No active Telegram bot found for user');
        }

        let bodyText = template.message_body || '';
        for (const [key, val] of Object.entries(templateVariables)) {
          bodyText = bodyText.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
        }

        let telegramText = '';
        if (template.header && template.header.format === 'text' && template.header.text) {
          telegramText += template.header.text + '\n\n';
        }
        telegramText += bodyText;
        if (template.footer_text) {
          telegramText += '\n\n' + template.footer_text;
        }

        if (template.is_limited_time_offer && template.offer_text) {
          telegramText += '\n\nOffer: ' + template.offer_text;
        }

        if (campaign.coupon_code) {
          telegramText += `\n\nCoupon Code: ${campaign.coupon_code}`;
        }



        const otpButtons = (template.authentication_options?.otp_buttons || []).map((btn) => {
          return {
            text: btn.copy_button_text || 'Copy Code',
            value: templateVariables.code || templateVariables['code'] || 'copy_code',
            id: templateVariables.code || templateVariables['code'] || 'copy_code'
          };
        });

        let buttonsToPass = [];
        const rawButtons = [
          ...otpButtons,
          ...(template.buttons || [])
        ];

        if (rawButtons.length > 0) {
          buttonsToPass = rawButtons.map((btn, index) => {
            if (btn.type === 'url' || btn.type === 'website') {
              const btnUrl = btn.url || btn.website_url || '';
              return {
                text: btn.text,
                url: btnUrl,
                type: 'url'
              };
            }
            if (btn.type === 'phone_call') {
              const phone = templateVariables.phone_number || templateVariables.phone || templateVariables.contact_number || btn.phone_number || '';
              return {
                text: btn.text || 'Call',
                id: `phone_call|${phone}`
              };
            }
            if (btn.type === 'copy_code') {
              const code = templateVariables.coupon_code || templateVariables.code || campaign.coupon_code || btn.text || 'COUPON';
              return {
                text: code,
                id: `copy_code|${code}`
              };
            }
            return {
              text: btn.text || btn.title,
              id: btn.value || btn.id || btn.payload || `btn_${index + 1}`
            };
          });
        }

        const { default: omnichannelService } = await import('../services/messaging/omnichannel.service.js');

        let msgType = 'text';
        let locationParams = {};
        let mediaUrlToSend = templateData.media_url;
        if (!mediaUrlToSend && template.header && template.header.format === 'media' && template.header.media_url) {
          mediaUrlToSend = template.header.media_url;
        }

        if (templateData.location_data && templateData.location_data.latitude && templateData.location_data.longitude) {
          msgType = 'location';
          locationParams = {
            latitude: templateData.location_data.latitude,
            longitude: templateData.location_data.longitude,
            name: templateData.location_data.name,
            address: templateData.location_data.address
          };
        } else if (mediaUrlToSend) {
          const extension = mediaUrlToSend.split('.').pop().toLowerCase().split('?')[0];
          if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension)) msgType = 'image';
          else if (['mp4', 'mov', 'avi', 'mkv'].includes(extension)) msgType = 'video';
          else if (['mp3', 'ogg', 'wav', 'm4a'].includes(extension)) msgType = 'audio';
          else msgType = 'document';
        }

        let carouselElements = null;
        const isCarousel = template && ['carousel_product', 'carousel_media'].includes((template.template_type || '').toLowerCase());
        if (isCarousel) {
          msgType = 'carousel';
          const carouselCardsData = templateData.carousel_cards_data && Array.isArray(templateData.carousel_cards_data) ? templateData.carousel_cards_data : [];
          const templateCards = template.carousel_cards && Array.isArray(template.carousel_cards) ? template.carousel_cards : [];

          if (carouselCardsData.length > 0 || templateCards.length > 0) {
            const limit = Math.min(Math.max(carouselCardsData.length, templateCards.length), 10);
            carouselElements = [];
            for (let i = 0; i < limit; i++) {
              const cardData = carouselCardsData[i] || {};
              const tCard = templateCards[i] || {};
              const bodyComp = (tCard.components || []).find(c => c.type === 'BODY' || c.type === 'body');
              const title = (cardData.body || bodyComp?.text || telegramText || "Card").substring(0, 80);
              const element = { title };

              if (cardData.header && cardData.header.link) {
                element.image_url = cardData.header.link;
              } else {
                const headerComp = (tCard.components || []).find(c => c.type === 'HEADER' || c.type === 'header');
                if (headerComp && headerComp.example?.header_url) {
                  element.image_url = Array.isArray(headerComp.example.header_url) ? headerComp.example.header_url[0] : headerComp.example.header_url;
                } else if (mediaUrlToSend && i === 0) {
                  element.image_url = mediaUrlToSend;
                }
              }

              let cardButtons = cardData.buttons || [];
              if (!cardButtons.length) {
                const btnComp = (tCard.components || []).filter(c => c.type === 'BUTTONS' || c.type === 'buttons');
                if (btnComp.length > 0 && btnComp[0].buttons) {
                  cardButtons = btnComp[0].buttons;
                }
              }

              if (cardButtons && Array.isArray(cardButtons) && cardButtons.length > 0) {
                element.buttons = cardButtons.slice(0, 3).map(btn => {
                  const isUrl = (btn.type || '').toLowerCase() === 'url' || (btn.type || '').toLowerCase() === 'website';
                  const btnObj = {
                    text: btn.text || btn.title || 'Button'
                  };
                  if (isUrl) {
                    btnObj.type = 'url';
                    btnObj.url = btn.url_value || btn.url || 'https://example.com';
                  } else {
                    btnObj.type = 'postback';
                    btnObj.id = btn.payload || btn.text || 'btn';
                  }
                  return btnObj;
                });
              }
              carouselElements.push(element);
            }
            resolvedCarouselElements = carouselElements;
          }
        }

        const recipientId = contactDoc?.telegram_chat_id || recipient.phone_number;

        const result = await omnichannelService.sendMessage({
          platform: 'telegram',
          workspace_id: bot.workspace_id,
          recipient_id: recipientId,
          message_type: msgType,
          text: telegramText,
          file_url: mediaUrlToSend,
          buttons: buttonsToPass,
          carousel_elements: carouselElements,
          ...locationParams
        });

        resultMsgId = result?.message_id?.toString() || `tg_${Date.now()}`;
        senderId = bot.bot_id;
        provider = 'telegram';

      } else if (campaignPlatform === 'facebook' || campaignPlatform === 'instagram') {
        const platform = campaignPlatform;
        let connection = null;
        if (platform === 'facebook') {
          const { default: FacebookConnection } = await import('../models/facebook-connection.model.js');
          connection = await FacebookConnection.findOne({ workspace_id: contactDoc?.workspace_id, is_active: true });
          if (!connection) {
            connection = await FacebookConnection.findOne({ user_id: userId, is_active: true });
          }
        } else {
          const { default: InstagramConnection } = await import('../models/instagram-connection.model.js');
          connection = await InstagramConnection.findOne({ workspace_id: contactDoc?.workspace_id, is_active: true });
          if (!connection) {
            connection = await InstagramConnection.findOne({ user_id: userId, is_active: true });
          }
        }

        if (!connection) {
          throw new Error(`No active ${platform} connection found for user`);
        }

        let pageId = null;
        if (contactDoc) {
          const lastMsg = await Message.findOne({ contact_id: contactDoc._id }).sort({ wa_timestamp: -1 }).lean();
          if (lastMsg) {
            pageId = lastMsg.direction === 'inbound' ? lastMsg.recipient_id : lastMsg.sender_id;
          }
        }

        if (platform === 'facebook') {
          if (!pageId) {
            const page = connection.pages?.find(p => p.is_active !== false);
            pageId = page?.page_id;
          }
          if (!pageId) throw new Error(`No active Facebook Page found for this connection`);
        } else {
          if (!pageId) {
            pageId = connection.ig_user_id || (connection.pages && connection.pages[0]?.instagram_account_id);
          }
          if (!pageId) throw new Error(`No active Instagram Account found for this connection`);
        }

        const recipientId = platform === 'facebook'
          ? (contactDoc?.facebook_page_scoped_id || recipient.phone_number)
          : (contactDoc?.instagram_scoped_id || recipient.phone_number);

        if (!recipientId) {
          throw new Error(`Recipient scoped ID not found for contact`);
        }

        let bodyText = template.message_body || '';
        for (const [key, val] of Object.entries(templateVariables)) {
          bodyText = bodyText.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(val));
        }

        let fbIgText = '';
        if (template.header && template.header.format === 'text' && template.header.text) {
          fbIgText += template.header.text + '\n\n';
        }
        fbIgText += bodyText;
        if (template.footer_text) {
          fbIgText += '\n\n' + template.footer_text;
        }

        if (template.is_limited_time_offer && template.offer_text) {
          fbIgText += '\n\nOffer: ' + template.offer_text;
        }

        if (campaign.coupon_code) {
          fbIgText += `\n\nCoupon Code: ${campaign.coupon_code}`;
        }



        const otpButtons = (template.authentication_options?.otp_buttons || []).map((btn) => {
          return {
            text: btn.copy_button_text || 'Copy Code',
            value: templateVariables.code || templateVariables['code'] || 'copy_code',
            id: templateVariables.code || templateVariables['code'] || 'copy_code'
          };
        });

        let buttonsToPass = [];
        const rawButtons = [
          ...otpButtons,
          ...(template.buttons || [])
        ];

        if (rawButtons.length > 0) {
          buttonsToPass = rawButtons.map((btn, index) => {
            if (btn.type === 'url' || btn.type === 'website') {
              const btnUrl = btn.url || btn.website_url || '';
              return {
                text: btn.text,
                url: btnUrl,
                type: 'url'
              };
            }
            if (btn.type === 'phone_call') {
              const phone = templateVariables.phone_number || templateVariables.phone || templateVariables.contact_number || btn.phone_number || '';
              return {
                text: btn.text || 'Call',
                id: `phone_call|${phone}`
              };
            }
            if (btn.type === 'copy_code') {
              const code = templateVariables.coupon_code || templateVariables.code || campaign.coupon_code || btn.text || 'COUPON';
              return {
                text: code,
                id: `copy_code|${code}`
              };
            }
            return {
              text: btn.text || btn.title,
              id: btn.value || btn.id || btn.payload || `btn_${index + 1}`
            };
          });
        }

        const { default: omnichannelService } = await import('../services/messaging/omnichannel.service.js');

        let msgType = 'text';
        let locationParams = {};
        let mediaUrlToSend = templateData.media_url;
        if (!mediaUrlToSend && template.header && template.header.format === 'media' && template.header.media_url) {
          mediaUrlToSend = template.header.media_url;
        }

        if (templateData.location_data && templateData.location_data.latitude && templateData.location_data.longitude) {
          msgType = 'location';
          locationParams = {
            latitude: templateData.location_data.latitude,
            longitude: templateData.location_data.longitude,
            name: templateData.location_data.name,
            address: templateData.location_data.address
          };
        } else if (!mediaUrlToSend) {
          const carouselCardsData = templateData.carousel_cards_data && Array.isArray(templateData.carousel_cards_data) ? templateData.carousel_cards_data : [];
          if (carouselCardsData.length > 0) {
            const firstCard = carouselCardsData[0];
            if (firstCard.header && firstCard.header.link) {
              mediaUrlToSend = firstCard.header.link;
            }
          } else if (template.carousel_cards && template.carousel_cards.length > 0) {
            const firstCard = template.carousel_cards[0];
            const headerComp = (firstCard.components || []).find(c => (c.type || '').toLowerCase() === 'header');
            if (headerComp && headerComp.example?.header_url) {
              mediaUrlToSend = Array.isArray(headerComp.example.header_url)
                ? headerComp.example.header_url[0]
                : headerComp.example.header_url;
            }
          }
        }

        let carouselElements = null;
        const isCarousel = template && ['carousel_product', 'carousel_media'].includes((template.template_type || '').toLowerCase());
        if (isCarousel && platform !== 'whatsapp') {
          msgType = 'carousel';
          const carouselCardsData = templateData.carousel_cards_data && Array.isArray(templateData.carousel_cards_data) ? templateData.carousel_cards_data : [];
          const templateCards = template.carousel_cards && Array.isArray(template.carousel_cards) ? template.carousel_cards : [];

          if (carouselCardsData.length > 0 || templateCards.length > 0) {
            const limit = Math.min(Math.max(carouselCardsData.length, templateCards.length), 10);
            carouselElements = [];
            for (let i = 0; i < limit; i++) {
              const cardData = carouselCardsData[i] || {};
              const tCard = templateCards[i] || {};
              const bodyComp = (tCard.components || []).find(c => c.type === 'BODY' || c.type === 'body');
              const title = (cardData.body || bodyComp?.text || fbIgText || "Card").substring(0, 80);
              const element = { title };

              if (cardData.header && cardData.header.link) {
                element.image_url = cardData.header.link;
              } else {
                const headerComp = (tCard.components || []).find(c => c.type === 'HEADER' || c.type === 'header');
                if (headerComp && headerComp.example?.header_url) {
                  element.image_url = Array.isArray(headerComp.example.header_url) ? headerComp.example.header_url[0] : headerComp.example.header_url;
                } else if (mediaUrlToSend && i === 0) {
                  element.image_url = mediaUrlToSend;
                }
              }

              let cardButtons = cardData.buttons || [];
              if (!cardButtons.length) {
                const btnComp = (tCard.components || []).filter(c => c.type === 'BUTTONS' || c.type === 'buttons');
                if (btnComp.length > 0 && btnComp[0].buttons) {
                  cardButtons = btnComp[0].buttons;
                }
              }

              if (cardButtons && Array.isArray(cardButtons) && cardButtons.length > 0) {
                element.buttons = cardButtons.slice(0, 3).map(btn => {
                  const btnType = (btn.type || '').toLowerCase() === 'url' ? 'web_url' : 'postback';
                  const btnObj = {
                    type: btnType,
                    title: (btn.text || btn.title || 'Button').substring(0, 20)
                  };
                  if (btnType === 'web_url') {
                    btnObj.url = btn.url_value || btn.url || 'https://example.com';
                  } else {
                    btnObj.payload = btn.payload || btn.text || 'btn';
                  }
                  return btnObj;
                });
              }
              carouselElements.push(element);
            }
            resolvedCarouselElements = carouselElements;
          }
        } else if (msgType !== 'location' && mediaUrlToSend) {
          const extension = mediaUrlToSend.split('.').pop().toLowerCase().split('?')[0];
          if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension)) msgType = 'image';
          else if (['mp4', 'mov', 'avi', 'mkv'].includes(extension)) msgType = 'video';
          else if (['mp3', 'ogg', 'wav', 'm4a'].includes(extension)) msgType = 'audio';
          else msgType = 'document';
        }

        if (msgType === 'text' && buttonsToPass.length > 0) {
          msgType = 'interactive';
        }

        const result = await omnichannelService.sendMessage({
          platform,
          workspace_id: connection.workspace_id,
          page_id: pageId,
          recipient_id: recipientId,
          message_type: msgType,
          text: fbIgText,
          file_url: mediaUrlToSend,
          buttons: buttonsToPass,
          carousel_elements: carouselElements,
          ...locationParams
        });

        resultMsgId = result?.message_id?.toString() || `fbig_${Date.now()}`;
        senderId = pageId;
        provider = platform;
      }

      const existingMessage = await Message.findOne({
        wa_message_id: resultMsgId,
        recipient_number: recipient.phone_number
      });

      if (!existingMessage) {
        await Message.create({
          sender_number: senderId,
          recipient_number: recipient.phone_number,
          contact_id: recipient.contact_id,
          user_id: userId,
          template_id: campaign.template_id,
          content: `Campaign: ${campaign.name} - Template: ${templateData.template_name}`,
          message_type: 'template',
          from_me: true,
          direction: 'outbound',
          wa_message_id: resultMsgId,
          wa_timestamp: new Date(),
          metadata: {
            campaign_id: campaign._id,
            template_name: templateData.template_name,
            language_code: templateData.language_code,
            variables: templateData.variables,
            components: []
          },
          interactive_data: resolvedCarouselElements ? { cards: resolvedCarouselElements } : null,
          provider: provider
        });
      }

      let updateResult;
      if (recipient.contact_id) {
        updateResult = await Campaign.updateOne(
          { _id: campaign._id, "recipients.contact_id": recipient.contact_id },
          {
            $set: {
              "recipients.$.status": 'sent',
              "recipients.$.sent_at": new Date(),
              "recipients.$.message_id": resultMsgId,
              updated_at: new Date()
            }
          }
        );
      } else {
        updateResult = await Campaign.updateOne(
          {
            _id: campaign._id,
            "recipients.phone_number": recipient.phone_number,
            "recipients.status": "pending"
          },
          {
            $set: {
              "recipients.$.status": 'sent',
              "recipients.$.sent_at": new Date(),
              "recipients.$.message_id": resultMsgId,
              updated_at: new Date()
            }
          }
        );
      }

      if (updateResult.modifiedCount > 0) {
        const campaignStats = await Campaign.findById(campaign._id, {
          'recipients.status': 1,
          'sent_at': 1
        });

        if (campaignStats && campaignStats.recipients) {
          const sentCount = campaignStats.recipients.filter(r => r.status === 'sent').length;
          const pendingCount = campaignStats.recipients.filter(r => r.status === 'pending').length;
          const failedCount = campaignStats.recipients.filter(r => r.status === 'failed').length;

          if (pendingCount === 0) {
            const status = failedCount > 0 ? 'completed_with_errors' : 'completed';
            const updateData = {
              status,
              completed_at: new Date(),
              updated_at: new Date(),
              'stats.sent_count': sentCount,
              'stats.pending_count': pendingCount,
              'stats.failed_count': failedCount
            };
            if (campaign.sent_at) {
              const startTime = new Date(campaign.sent_at);
              const endTime = new Date(updateData.completed_at);
              updateData.completion_duration_seconds = Math.round((endTime - startTime) / 1000);
            }
            await Campaign.findByIdAndUpdate(campaign._id, updateData);
          }
        }
      }

      return {
        success: true,
        recipientId: recipient.contact_id,
        phone_number: recipient.phone_number,
        messageId: resultMsgId,
        provider: provider,
        phoneUsed: senderId
      };
    }

    const phoneNumbers = await WhatsappPhoneNumber.find({
      waba_id: wabaId,
      is_active: true,
      deleted_at: null
    })
      .populate('waba_id')
      .sort({ last_used_at: 1 });

    if (!phoneNumbers || phoneNumbers.length === 0) {
      throw new Error(`No active phone numbers found for WABA ${wabaId}`);
    }

    const selectedPhoneNumber = phoneNumbers[0];

    await WhatsappPhoneNumber.findByIdAndUpdate(selectedPhoneNumber._id, {
      last_used_at: new Date()
    });

    let templateComponents = [];
    const isAuthenticationTemplate = template && template.category && template.category.toUpperCase() === 'AUTHENTICATION';

    const templateType = template ? (template.template_type || '').toLowerCase() : '';
    const isCarouselTemplate = template && ['carousel_product', 'carousel_media'].includes(templateType);

    console.log('Campaign template ID:', campaign.template_id);
    console.log('Template found:', !!template);
    console.log('Is authentication template:', isAuthenticationTemplate);
    console.log('Template variables from job data:', templateData.variables);
    console.log('Template body variables:', template?.body_variables);

    if (templateData.location_data && templateData.location_data.latitude && templateData.location_data.longitude) {
      templateComponents.push({
        type: 'header',
        parameters: [{
          type: 'location',
          location: {
            latitude: Number(templateData.location_data.latitude),
            longitude: Number(templateData.location_data.longitude),
            ...(templateData.location_data.name ? { name: templateData.location_data.name } : {}),
            ...(templateData.location_data.address ? { address: templateData.location_data.address } : {})
          }
        }]
      });
    } else if (templateData.media_url) {
      let mediaType = 'image';
      if (templateData.media_url.endsWith('.mp4') || templateData.media_url.includes('video')) mediaType = 'video';
      if (templateData.media_url.endsWith('.pdf') || templateData.media_url.includes('document')) mediaType = 'document';

      templateComponents.push({
        type: 'header',
        parameters: [{
          type: mediaType,
          [mediaType]: { link: templateData.media_url }
        }]
      });
    }

    if (isAuthenticationTemplate) {

      const expectedParamCount = template.body_variables ? template.body_variables.length : 0;

      let authParams = [];

      if (templateVariables && Object.keys(templateVariables).length > 0) {
        console.log('Processing dynamic template variables from job data:', templateVariables);
        const values = toOrderedTemplateParamValues(templateVariables);
        values.forEach((value, idx) => {
          console.log('Adding parameter index:', idx + 1, 'with value:', value);
          authParams.push({ type: 'text', text: value });
        });
      } else {
        console.log('No variables from job data, fetching from campaign...');
        const campaignDoc = await Campaign.findById(campaignId);
        console.log('Campaign document retrieved:', campaignDoc ? 'Yes' : 'No');
        if (campaignDoc && campaignDoc.variables_mapping) {
          console.log('Campaign variables_mapping object:', campaignDoc.variables_mapping);

          const varsMap = campaignDoc.variables_mapping;
          const mappingPlain = varsMap instanceof Map ? Object.fromEntries(varsMap) : varsMap;
          let recipientVariables = {};

          if (isNewVariablesFormat(mappingPlain)) {
            const contact = recipient.contact_id
              ? await Contact.findById(recipient.contact_id).lean()
              : null;
            recipientVariables = resolveVariablesForContact(mappingPlain, contact);
          } else {
            const possibleContactIds = [
              recipient.contact_id,
              recipient.contact_id?.toString?.(),
              String(recipient.contact_id)
            ].filter(Boolean);

            for (const contactId of possibleContactIds) {
              const found =
                typeof varsMap.get === 'function'
                  ? varsMap.get(contactId)
                  : varsMap[contactId];

              if (found) {
                recipientVariables = found;
                console.log('Found recipient variables for contact ID:', contactId);
                break;
              }
            }
          }

          console.log('Campaign variables mapping for recipient:', recipient.contact_id, recipientVariables);

          if (Object.keys(recipientVariables).length > 0) {
            const values = toOrderedTemplateParamValues(recipientVariables);
            values.forEach((value) => {
              authParams.push({ type: 'text', text: value });
            });
          } else {
            console.log('No recipient variables found in campaign, using fallback');
          }
        } else {
          console.log('No campaign document or variables_mapping found');
        }
      }

      if (authParams.length === 0 && expectedParamCount > 0) {
        console.log('WARNING: No dynamic OTP found for authentication template, parameters expected:', expectedParamCount);
      } else if (authParams.length === 0) {

        console.log('No authParams found, checking for OTP in variables');
        if (authParams.length === 0) {
          console.log('ERROR: No dynamic OTP found in variables_mapping');
        }
      }

      if (expectedParamCount > 0 && authParams.length > 0 && authParams.length !== expectedParamCount) {
        throw new Error(
          `Template parameter mismatch for "${template.template_name}": expected ${expectedParamCount}, got ${authParams.length}. ` +
          `Check campaign.variables_mapping for contact ${recipient.contact_id?.toString?.()}.`
        );
      }

      if (authParams.length > 0) {
        console.log('Final authParams for template components:', authParams);
        templateComponents.push({
          type: 'body',
          parameters: authParams
        });

        if (template.buttons && template.buttons.length > 0) {
          template.buttons.forEach((button, index) => {
            if (button.type === 'website' && button.website_url && button.website_url.includes('otp')) {
              templateComponents.push({
                type: 'button',
                sub_type: 'url',
                index: index.toString(),
                parameters: authParams
              });
            }
          });
        }
      }
    } else {
      if (templateVariables && Object.keys(templateVariables).length > 0) {
        let bodyParams = [];

        if (template && Array.isArray(template.body_variables) && template.body_variables.length > 0) {
          bodyParams = template.body_variables.map((bodyVar, index) => {
            const varKey = bodyVar.key || String(index + 1);
            const value = templateVariables[varKey] ?? '';
            return {
              type: 'text',
              text: String(value),
              parameter_name: varKey
            };
          });
        } else {
          const values = toOrderedTemplateParamValues(templateVariables);
          bodyParams = values.map((value) => ({ type: 'text', text: value }));
        }

        templateComponents.push({
          type: 'body',
          parameters: bodyParams
        });
      }
    }


    const carouselProducts = templateData.carousel_products && Array.isArray(templateData.carousel_products) ? templateData.carousel_products : [];
    const carouselCardsData = templateData.carousel_cards_data && Array.isArray(templateData.carousel_cards_data) ? templateData.carousel_cards_data : [];
    if (isCarouselTemplate) {
      if (carouselProducts.length > 0) {
        templateComponents.push({
          type: 'carousel',
          cards: carouselProducts.map((product, index) => ({
            card_index: index,
            components: [
              {
                type: 'header',
                parameters: [
                  {
                    type: 'product',
                    product: {
                      product_retailer_id: product.product_retailer_id,
                      catalog_id: product.catalog_id
                    }
                  }
                ]
              }
            ]
          }))
        });
      } else if (carouselCardsData.length > 0) {
        templateComponents.push({
          type: 'carousel',
          cards: carouselCardsData.map((card, index) => {
            const cardComponents = [];
            if (card.header && card.header.type) {
              const mediaType = card.header.type.toLowerCase();
              const param = { type: mediaType };
              param[mediaType] = card.header.id ? { id: card.header.id } : { link: card.header.link };
              cardComponents.push({
                type: 'header',
                parameters: [param]
              });
            }
            if (card.buttons && Array.isArray(card.buttons)) {
              card.buttons.forEach((btn, btnIndex) => {
                const subType = (btn.type || '').toLowerCase();
                if (subType === 'quick_reply') {
                  cardComponents.push({
                    type: 'button',
                    sub_type: 'quick_reply',
                    index: btnIndex,
                    parameters: btn.payload ? [{ type: 'payload', payload: String(btn.payload) }] : []
                  });
                } else if (subType === 'url' && btn.url_value) {
                  cardComponents.push({
                    type: 'button',
                    sub_type: 'url',
                    index: btnIndex,
                    parameters: [{ type: 'text', text: String(btn.url_value) }]
                  });
                }
              });
            }
            return { card_index: index, components: cardComponents };
          })
        });
      } else {
        throw new Error(
          `Template "${template.template_name}" is a carousel template. Provide carousel_products (product cards) or carousel_cards_data (media cards).`
        );
      }
    }

    if (template?.is_limited_time_offer === true) {
      const expirationMinutes = templateData.offer_expiration_minutes ?? 60;
      const expirationTimeMs = Date.now() + expirationMinutes * 60 * 1000;
      templateComponents.push({
        type: 'limited_time_offer',
        parameters: [
          {
            type: 'limited_time_offer',
            limited_time_offer: {
              expiration_time_ms: expirationTimeMs
            }
          }
        ]
      });
    }

    if (template && Array.isArray(template.buttons)) {
      template.buttons.forEach((btn, btnIndex) => {
        if (btn.type === 'catalog') {
          templateComponents.push({
            type: 'button',
            sub_type: 'CATALOG',
            index: btnIndex.toString(),
            parameters: [
              {
                type: 'action',
                action: {
                  thumbnail_product_retailer_id: templateData.thumbnail_product_retailer_id
                }
              }
            ]
          });
        } else if (btn.type === 'copy_code' && templateData.coupon_code) {
          templateComponents.push({
            type: 'button',
            sub_type: 'copy_code',
            index: btnIndex.toString(),
            parameters: [
              {
                type: 'coupon_code',
                coupon_code: String(templateData.coupon_code)
              }
            ]
          });
        } else if (btn.type === 'url') {

          const isDynamicUrl = typeof btn.url === 'string' && btn.url.includes('{{');

          if (!isDynamicUrl) {
            return;
          }

          const urlValue =
            templateVariables?.url ??
            templateVariables?.['1'] ??
            Object.values(templateVariables || {}).find(
              v => typeof v === 'string' && /^https?:\/\//.test(v)
            );

          if (urlValue) {
            templateComponents.push({
              type: 'button',
              sub_type: 'url',
              index: btnIndex.toString(),
              parameters: [
                { type: 'text', text: String(urlValue) }
              ]
            });
          }
        }
      });
    }

    const messageParams = {
      recipientNumber: recipient.phone_number,
      messageText: '',
      messageType: 'template',
      templateName: templateData.template_name,
      languageCode: templateData.language_code,
      templateComponents: templateComponents,
      userId: userId,
      whatsappPhoneNumber: selectedPhoneNumber,
      contactId: recipient.contact_id,
      fromCampaignSystem: true,
      ignoreUnsubscribe: campaign.avoid_unsubscribers === false
    };

    console.log('Template components for sending:', templateComponents);

    const result = await unifiedWhatsAppService.sendMessage(userId, messageParams);

    let existingMessage = null;
    if (result.messageId && typeof result.messageId === 'string' && result.messageId.length === 24) {
      existingMessage = await Message.findById(result.messageId);
    }
    if (!existingMessage) {
      existingMessage = await Message.findOne({
        wa_message_id: result.waMessageId || result.messageId || result.id,
        recipient_number: recipient.phone_number
      });
    }

    if (!existingMessage) {
      await Message.create({
        sender_number: selectedPhoneNumber.display_phone_number,
        recipient_number: recipient.phone_number,
        contact_id: recipient.contact_id,
        user_id: userId,
        template_id: campaign.template_id,
        content: `Campaign: ${campaign.name} - Template: ${templateData.template_name}`,
        message_type: 'template',
        from_me: true,
        direction: 'outbound',
        wa_message_id: result.waMessageId || result.messageId || result.id,
        wa_timestamp: new Date(),
        metadata: {
          campaign_id: campaign._id,
          template_name: templateData.template_name,
          language_code: templateData.language_code,
          variables: templateData.variables,
          components: []
        },
        whatsapp_phone_number_id: selectedPhoneNumber._id,
        provider: result.provider
      });
    } else {
      console.log(`Message already exists, updating campaign metadata: ${existingMessage._id}`);
      if (!existingMessage.metadata) {
        existingMessage.metadata = {};
      }
      existingMessage.metadata.campaign_id = campaign._id;
      existingMessage.metadata.template_name = templateData.template_name;
      existingMessage.metadata.language_code = templateData.language_code;
      existingMessage.metadata.variables = templateData.variables;
      existingMessage.metadata.components = [];
      await Message.updateOne(
        { _id: existingMessage._id },
        {
          $set: {
            metadata: existingMessage.metadata,
            template_id: campaign.template_id
          }
        }
      );
    }


    let updateResult;
    if (recipient.contact_id) {
      updateResult = await Campaign.updateOne(
        { _id: campaign._id, "recipients.contact_id": recipient.contact_id },
        {
          $set: {
            "recipients.$.status": 'sent',
            "recipients.$.sent_at": new Date(),
            "recipients.$.message_id": result.messageId || result.id,
            updated_at: new Date()
          }
        }
      );
    } else {
      updateResult = await Campaign.updateOne(
        {
          _id: campaign._id,
          "recipients.phone_number": recipient.phone_number,
          "recipients.status": "pending"
        },
        {
          $set: {
            "recipients.$.status": 'sent',
            "recipients.$.sent_at": new Date(),
            "recipients.$.message_id": result.messageId || result.id,
            updated_at: new Date()
          }
        }
      );
    }

    if (updateResult.modifiedCount > 0) {
      const campaignStats = await Campaign.findById(campaign._id, {
        'recipients.status': 1,
        'sent_at': 1
      });

      if (campaignStats && campaignStats.recipients) {
        const sentCount = campaignStats.recipients.filter(r => r.status === 'sent').length;
        const pendingCount = campaignStats.recipients.filter(r => r.status === 'pending').length;
        const failedCount = campaignStats.recipients.filter(r => r.status === 'failed').length;

        if (pendingCount === 0) {
          const status = failedCount > 0 ? 'completed_with_errors' : 'completed';

          const updateData = {
            status,
            completed_at: new Date(),
            updated_at: new Date()
          };

          if (campaign.sent_at) {
            const startTime = new Date(campaign.sent_at);
            const endTime = new Date(updateData.completed_at);
            updateData.completion_duration_seconds = Math.round((endTime - startTime) / 1000);
          }

          updateData['stats.sent_count'] = sentCount;
          updateData['stats.pending_count'] = pendingCount;
          updateData['stats.failed_count'] = failedCount;

          await Campaign.findByIdAndUpdate(campaign._id, updateData);
        }
      }
    }

    return {
      success: true,
      recipientId: recipient.contact_id,
      phone_number: recipient.phone_number,
      messageId: result.messageId || result.id,
      provider: result.provider,
      phoneUsed: selectedPhoneNumber.display_phone_number
    };
  } catch (error) {
    if (!recipient || !recipient.phone_number) {
      console.error('Invalid recipient data in error handler:', recipient);
      throw new Error('Invalid recipient data in error handler: missing phone_number');
    }

    let updateResult;
    if (recipient.contact_id) {
      updateResult = await Campaign.updateOne(
        { _id: campaignId, "recipients.contact_id": recipient.contact_id },
        {
          $set: {
            "recipients.$.status": 'failed',
            "recipients.$.failed_at": new Date(),
            "recipients.$.failure_reason": error.message,
            updated_at: new Date()
          }
        }
      );
    } else {
      updateResult = await Campaign.updateOne(
        {
          _id: campaignId,
          "recipients.phone_number": recipient.phone_number,
          "recipients.status": "pending"
        },
        {
          $set: {
            "recipients.$.status": 'failed',
            "recipients.$.failed_at": new Date(),
            "recipients.$.failure_reason": error.message,
            updated_at: new Date()
          }
        }
      );
    }

    const campaign = await Campaign.findById(campaignId);
    if (campaign) {
      const existingErrorLog = campaign.error_log.find(log =>
        (recipient.contact_id ? log.contact_id?.toString() === recipient.contact_id.toString() : log.phone_number === recipient.phone_number) &&
        log.phone_number === recipient.phone_number &&
        log.error === error.message
      );

      if (!existingErrorLog) {
        await Campaign.updateOne(
          { _id: campaign._id },
          {
            $push: {
              error_log: {
                timestamp: new Date(),
                contact_id: recipient.contact_id || null,
                phone_number: recipient.phone_number,
                error: error.message
              }
            },
            updated_at: new Date()
          }
        );
      } else {
        console.log(`Error already logged, skipping duplicate for: ${recipient.phone_number}`);
      }

      if (updateResult.modifiedCount > 0) {
        const campaignStats = await Campaign.findById(campaignId, {
          'recipients.status': 1,
          'sent_at': 1
        });

        if (campaignStats && campaignStats.recipients) {
          const sentCount = campaignStats.recipients.filter(r => r.status === 'sent').length;
          const pendingCount = campaignStats.recipients.filter(r => r.status === 'pending').length;
          const failedCount = campaignStats.recipients.filter(r => r.status === 'failed').length;

          if (pendingCount === 0) {
            const status = failedCount > 0 ? 'completed_with_errors' : 'completed';

            const updateData = {
              status,
              completed_at: new Date(),
              updated_at: new Date()
            };

            if (campaignStats.sent_at) {
              const startTime = new Date(campaignStats.sent_at);
              const endTime = new Date(updateData.completed_at);
              updateData.completion_duration_seconds = Math.round((endTime - startTime) / 1000);
            }

            updateData['stats.sent_count'] = sentCount;
            updateData['stats.pending_count'] = pendingCount;
            updateData['stats.failed_count'] = failedCount;

            await Campaign.findByIdAndUpdate(campaignId, updateData);
          }
        }
      }
    }

    console.error(`Error processing campaign job for recipient ${recipient.phone_number}:`, error);
    throw error;
  } finally {
  }
};


export const monitorCampaignCompletion = async (campaignId) => {
  try {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      console.error(`Campaign ${campaignId} not found`);
      return;
    }

    const pendingRecipientsMonitor = campaign.recipients.filter(r => r.status === 'pending');
    if (pendingRecipientsMonitor.length === 0) {
      const failedCount = campaign.recipients.filter(r => r.status === 'failed').length;
      campaign.status = failedCount > 0 ? 'completed_with_errors' : 'completed';
      campaign.completed_at = new Date();
      await campaign.save();

      console.log(`Campaign ${campaignId} completed. Status: ${campaign.status}`);
    }
  } catch (error) {
    console.error(`Error monitoring campaign completion ${campaignId}:`, error);
  }
};
