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

    const templateVariables = {};
    if (templateData.variables && typeof templateData.variables === 'object') {
      Object.keys(templateData.variables).forEach(key => {
        templateVariables[key] = templateData.variables[key];
      });
    }

    let templateComponents = [];

    const template = await Template.findById(campaign.template_id);
    const isAuthenticationTemplate = template && template.category && template.category.toUpperCase() === 'AUTHENTICATION';

    console.log('Campaign template ID:', campaign.template_id);
    console.log('Template found:', !!template);
    console.log('Is authentication template:', isAuthenticationTemplate);
    console.log('Template variables from job data:', templateData.variables);
    console.log('Template body variables:', template?.body_variables);

    if (templateData.media_url) {
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

    const templateType = template ? (template.template_type || '').toLowerCase() : '';
    const isCarouselTemplate = template && ['carousel_product', 'carousel_media'].includes(templateType);
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
      fromCampaignSystem: true
    };

    console.log('Template components for sending:', templateComponents);

    const result = await unifiedWhatsAppService.sendMessage(userId, messageParams);

    const existingMessage = await Message.findOne({
      wa_message_id: result.messageId || result.id,
      recipient_number: recipient.phone_number
    });

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
        wa_message_id: result.messageId || result.id,
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
      console.log(`Message already exists, skipping duplicate: ${result.messageId || result.id}`);
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
