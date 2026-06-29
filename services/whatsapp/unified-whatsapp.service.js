import BusinessAPIProvider from './providers/business-api.provider.js';
import BaileysProvider from './providers/baileys.provider.js';
import db from '../../models/index.js';
const {
  WhatsappConnection,
  WhatsappPhoneNumber,
  WhatsappWaba,
  Contact,
  ReplyMaterial,
  Template,
  EcommerceCatalog,
  Message
} = db;
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const PROVIDER_TYPES = {
  BUSINESS_API: 'business_api',
  BAILEY: 'baileys'
};

class UnifiedWhatsAppService {
  constructor() {
    this.providers = {
      [PROVIDER_TYPES.BUSINESS_API]: new BusinessAPIProvider(),
      [PROVIDER_TYPES.BAILEY]: new BaileysProvider()
    };
    this.io = null;
  }

  setIO(io) {
    this.io = io;
    this.providers[PROVIDER_TYPES.BAILEY].setIO(io);

    this.io.on('connection', (socket) => {
      socket.on('whatsapp:agent_typing', async (data) => {
        try {
          const { user_id, contact_id, whatsapp_phone_number_id, isTyping } = data;
          console.log(`[Socket] Received agent_typing: user=${user_id}, contact=${contact_id}, typing=${isTyping}`);
          if (!isTyping) {
          }
          const contact = await Contact.findById(contact_id);
          if (contact && ['telegram', 'facebook', 'instagram'].includes(contact.source)) {
             return;
          }

          const lastMessage = await Message.findOne({
            contact_id: contact_id,
            from_me: false
          }).sort({ created_at: -1 });

          await this.sendMessage(user_id, {
            contactId: contact_id,
            whatsappPhoneNumberId: whatsapp_phone_number_id,
            messageType: 'typing',
            replyMessageId: lastMessage?.wa_message_id
          });
        } catch (err) {
          console.error('[UnifiedService] Error handling agent typing socket event:', err.message);
        }
      });
    });
  }

  async getProvider(userId, connectionId = null) {
    let waba = null;

    if (connectionId) {
      waba = await WhatsappWaba.findOne({
        _id: connectionId,
        user_id: userId,
        deleted_at: null
      });
    } else {
      waba = await WhatsappWaba.findOne({
        user_id: userId,
        is_active: true,
        deleted_at: null
      });
    }

    if (waba) {
      const providerType = waba.provider || PROVIDER_TYPES.BUSINESS_API;
      return {
        provider: this.providers[providerType],
        type: providerType,
        connection: waba
      };
    }

    let businessConnection = null;
    if (connectionId) {
      businessConnection = await WhatsappConnection.findOne({
        _id: connectionId,
        user_id: userId,
        deleted_at: null
      });
    } else {
      businessConnection = await WhatsappConnection.findOne({
        user_id: userId,
        is_active: true,
        deleted_at: null
      });
    }

    if (businessConnection) {
      return {
        provider: this.providers[PROVIDER_TYPES.BUSINESS_API],
        type: PROVIDER_TYPES.BUSINESS_API,
        connection: businessConnection
      };
    }

    return {
      provider: this.providers[PROVIDER_TYPES.BUSINESS_API],
      type: PROVIDER_TYPES.BUSINESS_API,
      connection: null
    };
  }


  async getProviderByType(providerType, userId = null, connectionId = null) {
    if (!this.providers[providerType]) {
      throw new Error(`Unknown provider type: ${providerType}`);
    }

    let connection = null;
    if (userId) {
      if (providerType === PROVIDER_TYPES.BUSINESS_API) {
        if (connectionId) {
          connection = await WhatsappConnection.findOne({
            _id: connectionId,
            user_id: userId,
            deleted_at: null
          });
        }

        if (!connection) {
          connection = await WhatsappConnection.findOne({
            user_id: userId,
            is_active: true,
            deleted_at: null
          });
        }
      }

      if (!connection || providerType === PROVIDER_TYPES.BAILEY) {
        if (connectionId) {
          connection = await WhatsappWaba.findOne({
            _id: connectionId,
            provider: providerType,
            deleted_at: null
          });
        } else {
          connection = await WhatsappWaba.findOne({
            user_id: userId,
            provider: providerType,
            is_active: true,
            deleted_at: null
          });
        }
      }
    }

    return {
      provider: this.providers[providerType],
      type: providerType,
      connection
    };
  }


  async sendMessage(userId, params) {
    const { providerType, connectionId, ...messageParams } = params;
    let {
      whatsappPhoneNumber,
      whatsappPhoneNumberId,
      contactId,
      recipientNumber,
      messageText,
      messageType,
      replyType,
      replyId,
      templateName,
      templateVariables,
      templateComponents: templateComponentsInput,
      mediaUrl,
      replyMessageId,
      reactionMessageId,
      reactionEmoji,
      templateId
    } = messageParams;

    if (contactId && !messageParams.ignoreUnsubscribe) {
      const contact = await Contact.findById(contactId);
      if (contact?.is_unsubscribed) {
        throw new Error('Contact has unsubscribed and cannot receive messages.');
      }
    }

    if (contactId && !recipientNumber) {
      const contact = await Contact.findById(contactId);
      if (contact) {
        recipientNumber = contact.phone_number;
      }
    }

    if (!whatsappPhoneNumber && whatsappPhoneNumberId) {
      whatsappPhoneNumber = await WhatsappPhoneNumber.findById(whatsappPhoneNumberId)
        .populate('waba_id')
        .lean();
    }

    if (replyType && replyId) {
      if (replyType === 'ReplyMaterial' || replyType === 'replymaterial' || ['text', 'media', 'image', 'video', 'audio', 'document', 'flow'].includes(replyType)) {
        const material = await ReplyMaterial.findById(replyId);
        if (material) {
          messageType = material.type;
          if (material.type === 'text') {
            messageText = material.content;
          } else if (material.type === 'flow') {
            messageType = 'interactive';
            messageParams.interactiveType = 'flow';
            messageParams.flowId = material.flow_id;
            messageParams.buttonText = material.button_text;
            messageText = material.content;
          } else {
            mediaUrl = material.file_path;
            if (material.content) messageText = material.content;
          }
        } else {
          console.error(`[UnifiedService] ReplyMaterial not found for ID: ${replyId}`);
        }
      } else if (replyType === 'Template' || replyType === 'template') {
        const template = await Template.findById(replyId).lean();
        if (template) {
          messageType = 'template';
          templateName = template.template_name;
          messageParams.languageCode = template.language || 'en_US';
          messageParams.templateObj = template;
          messageParams.templateId = template._id;
        }
      } else if (replyType === 'EcommerceCatalog' || replyType === 'catalog') {
        const catalog = await EcommerceCatalog.findById(replyId);
        if (catalog) {
          messageType = 'catalog';
          messageParams.catalogId = catalog._id;
        }
      }
    }

    if (mediaUrl && (!messageType || messageType === 'text')) {
      messageType = this.getMediaTypeFromUrl(mediaUrl);
    }

    let templateComponents = templateComponentsInput || [];
    if (messageType === 'template' && templateName) {
      const template = messageParams.templateObj
        || await Template.findOne({ template_name: templateName, user_id: userId, deleted_at: null }).lean()
        || await Template.findOne({ template_name: templateName, deleted_at: null }).lean();

      if (template && !messageText) {
        messageText = template.message_body || `Template: ${template.template_name}`;
      }

      if (templateComponents.length === 0) {
        let finalHeaderUrl = mediaUrl;
        let headerType = null;

        if (!finalHeaderUrl && template?.header && ['IMAGE', 'VIDEO', 'DOCUMENT', 'MEDIA'].includes((template.header.format || '').toUpperCase())) {
          finalHeaderUrl = template.header.media_url;
          headerType = (template.header.media_type || template.header.format || 'image').toLowerCase();
          if (headerType === 'media') headerType = 'image'; 
          console.log(`[UnifiedService] Auto-injecting template header from DB: ${headerType} -> ${finalHeaderUrl}`);
        }

        if (finalHeaderUrl) {
          let mediaType = headerType || 'image';
          if (!headerType) {
            if (finalHeaderUrl.endsWith('.mp4') || finalHeaderUrl.includes('video')) mediaType = 'video';
            else if (finalHeaderUrl.endsWith('.mp3') || finalHeaderUrl.includes('audio')) mediaType = 'audio';
            else if (finalHeaderUrl.endsWith('.pdf') || finalHeaderUrl.includes('document')) mediaType = 'document';
          }

          const headerParam = {
            type: mediaType,
            [mediaType]: { link: finalHeaderUrl }
          };

          if (mediaType === 'document') {
            let filename = 'document.pdf';
            if (messageParams.campaignOriginalFilename) {
              filename = messageParams.campaignOriginalFilename;
            } else if (messageParams.file && messageParams.file.originalname) {
              filename = messageParams.file.originalname;
            } else if (template?.header?.original_filename) {
              filename = template.header.original_filename;
            } else {
              try {
                const decodedPath = decodeURIComponent(finalHeaderUrl);
                const urlWithoutQuery = decodedPath.split('?')[0];
                const extractedFilename = path.basename(urlWithoutQuery);
                if (extractedFilename && extractedFilename.includes('.')) {
                  filename = extractedFilename.replace(/-\d{10,13}(?=\.\w+$)/, '');
                }
              } catch (err) {
                filename = 'document.pdf';
              }
            }
            headerParam.document.filename = filename;
          }

          templateComponents.push({
            type: 'header',
            parameters: [headerParam]
          });
        }

        if (templateVariables && Object.keys(templateVariables).length > 0) {
          const bodyParams = Object.keys(templateVariables).map(key => ({
            type: 'text',
            text: String(templateVariables[key]),
            parameter_name: key
          }));

          templateComponents.push({
            type: 'body',
            parameters: bodyParams
          });
        }

        if (template) {
          if (!messageParams.templateId) {
            messageParams.templateId = template._id;
          }

          if (Array.isArray(template.buttons)) {
            template.buttons.forEach((btn, btnIndex) => {
              if (btn.type === 'copy_code') {
                const c_code = messageParams.couponCode || (templateVariables ? (templateVariables.coupon_code || templateVariables['1']) : null);
                if (c_code) {
                  templateComponents.push({
                    type: 'button',
                    sub_type: 'copy_code',
                    index: btnIndex.toString(),
                    parameters: [
                      {
                        type: 'coupon_code',
                        coupon_code: String(c_code)
                      }
                    ]
                  });
                }
              } else if (btn.type === 'url') {
                const isDynamicUrl = typeof btn.url === 'string' && btn.url.includes('{{');
                if (isDynamicUrl) {
                  const urlValue = templateVariables?.url || templateVariables?.['1'] || Object.values(templateVariables || {}).find(v => typeof v === 'string' && /^https?:\/\//.test(v));
                  if (urlValue) {
                    templateComponents.push({
                      type: 'button',
                      sub_type: 'url',
                      index: btnIndex.toString(),
                      parameters: [{ type: 'text', text: String(urlValue) }]
                    });
                  }
                }
              } else if (btn.type === 'catalog') {
                const p_id = messageParams.productRetailerId || templateVariables?.product_retailer_id || templateVariables?.['1'];
                if (p_id) {
                  templateComponents.push({
                    type: 'button',
                    sub_type: 'CATALOG',
                    index: btnIndex.toString(),
                    parameters: [{
                      type: 'action',
                      action: {
                        thumbnail_product_retailer_id: String(p_id)
                      }
                    }]
                  });
                }
              }
            });
          }
        }

        if (template?.is_limited_time_offer === true) {
          const expirationMinutes = messageParams.offerExpirationMinutes ?? 60;
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

        const templateType = template ? (template.template_type || '').toLowerCase() : '';
        const isCarouselTemplate = template && ['carousel_product', 'carousel_media'].includes(templateType);
        const carouselProducts = messageParams.carouselProducts && Array.isArray(messageParams.carouselProducts) ? messageParams.carouselProducts : [];
        let carouselCardsData = messageParams.carouselCardsData && Array.isArray(messageParams.carouselCardsData) ? messageParams.carouselCardsData : [];
        if (isCarouselTemplate) {
          if (carouselProducts.length === 0 && carouselCardsData.length === 0) {
            if (template && Array.isArray(template.carousel_cards)) {
              carouselCardsData = template.carousel_cards.map(card => {
                const headerComp = card.components?.find(c => c.type === 'header');
                const buttonsComp = card.components?.find(c => c.type === 'buttons');

                let cardHeader = null;
                if (headerComp) {
                  cardHeader = {
                    type: headerComp.format || 'image',
                    link: headerComp.example?.header_handle?.[0] || headerComp.media_url || headerComp.media_handle || null,
                    id: headerComp.media_id || null
                  };
                }

                let cardButtons = [];
                if (buttonsComp && Array.isArray(buttonsComp.buttons)) {
                  cardButtons = buttonsComp.buttons.map(btn => ({
                    type: btn.type,
                    url_value: btn.url_value || btn.url,
                    payload: btn.payload
                  }));
                }

                return {
                  header: cardHeader,
                  buttons: cardButtons
                };
              });
            }
          }

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
                  const param = { type: mediaType, _uploadedFile: card.header._uploadedFile || null };
                  if (!card.header._uploadedFile) {
                    param[mediaType] = card.header.id ? { id: card.header.id } : { link: card.header.link };
                  }
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
            console.error(
              `Template "${template.template_name}" is a carousel template, but no carousel_products or carousel_cards_data was provided.`
            );
          }
        }
      }


      if (!messageParams.templateId && templateName) {
        const templateForId = messageParams.templateObj
          || await Template.findOne({ template_name: templateName, user_id: userId, deleted_at: null }).lean()
          || await Template.findOne({ template_name: templateName, deleted_at: null }).lean();
        if (templateForId) {
          messageParams.templateId = templateForId._id;
        }
      }
    }

    messageParams.recipientNumber = recipientNumber;
    messageParams.messageText = messageText;
    messageParams.messageType = messageType;
    messageParams.templateName = templateName;
    messageParams.templateComponents = templateComponents;
    messageParams.mediaUrl = mediaUrl;
    let finalReplyMessageId = replyMessageId;
    let finalReactionMessageId = reactionMessageId;

    const isValidObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

    if (replyMessageId && isValidObjectId(replyMessageId)) {
      const msg = await Message.findById(replyMessageId).lean();
      if (msg) {
        finalReplyMessageId = msg.platform_message_id || msg.wa_message_id || replyMessageId;
      }
    }

    if (reactionMessageId && isValidObjectId(reactionMessageId)) {
      const msg = await Message.findById(reactionMessageId).lean();
      if (msg) {
        finalReactionMessageId = msg.platform_message_id || msg.wa_message_id || reactionMessageId;
      }
    }

    messageParams.replyMessageId = finalReplyMessageId;
    messageParams.reactionMessageId = finalReactionMessageId;
    messageParams.reactionEmoji = reactionEmoji;
    if (!messageParams.templateId && templateId) {
      messageParams.templateId = templateId;
    }

    if (recipientNumber) {
      await Contact.updateOne(
        { phone_number: recipientNumber, created_by: userId },
        { last_outgoing_message_at: new Date() }
      );
    }

    let result;
    if (whatsappPhoneNumber && whatsappPhoneNumber.waba_id) {
      const waba = whatsappPhoneNumber.waba_id;
      const providerType = waba.provider || PROVIDER_TYPES.BUSINESS_API;

      const connection = providerType === PROVIDER_TYPES.BUSINESS_API
        ? {
          access_token: waba.access_token,
          phone_number_id: whatsappPhoneNumber.phone_number_id,
          registred_phone_number: whatsappPhoneNumber.display_phone_number
        }
        : waba;

      console.log('[UnifiedService] Calling provider sendMessage with:', {
        providerType,
        hasFile: !!messageParams.file,
        fileType: messageParams.file?.mimetype || messageParams.file?.type,
        hasBuffer: !!messageParams.file?.buffer,
        hasUrl: !!messageParams.file?.url,
        messageType: messageParams.messageType
      });

      result = await this.providers[providerType].sendMessage(userId, messageParams, connection);
    } else {
      let providerInfo;
      if (providerType) {
        providerInfo = await this.getProviderByType(providerType, userId, connectionId);
      } else {
        providerInfo = await this.getProvider(userId, connectionId);
      }
      result = await providerInfo.provider.sendMessage(userId, messageParams, providerInfo.connection);
    }

    if (result && result.messageId && this.io) {
      try {
        const savedMessage = isValidObjectId(result.messageId)
          ? await Message.findById(result.messageId).lean()
          : await Message.findOne({ wa_message_id: result.messageId }).lean();
        if (savedMessage) {
          const contact = await Contact.findById(savedMessage.contact_id).lean();
          const templateObj = savedMessage.template_id
            ? await Template.findById(savedMessage.template_id).lean()
            : null;
          this.io.emit('whatsapp:message', {
            id: savedMessage._id.toString(),
            messageId: savedMessage._id.toString(),
            senderNumber: savedMessage.sender_number,
            recipientNumber: savedMessage.recipient_number,
            content: savedMessage.content,
            interactiveData: savedMessage.interactive_data,
            messageType: savedMessage.message_type,
            fileUrl: savedMessage.file_url,
            fromMe: savedMessage.from_me,
            direction: savedMessage.direction,
            createdAt: savedMessage.wa_timestamp,
            contact_id: savedMessage.contact_id?.toString(),
            contactId: savedMessage.contact_id?.toString(),
            sender: { id: savedMessage.sender_number, name: savedMessage.sender_number },
            recipient: { id: savedMessage.recipient_number, name: contact ? contact.name : savedMessage.recipient_number },
            provider: savedMessage.provider,
            wa_message_id: savedMessage.wa_message_id,
            user_id: savedMessage.user_id?.toString(),
            whatsapp_phone_number_id: whatsappPhoneNumber ? whatsappPhoneNumber._id?.toString() : (messageParams.whatsappPhoneNumberId?.toString() || null),
            platform: savedMessage.platform || 'whatsapp',
            template: templateObj,
            metadata: savedMessage.metadata || null
          });
        }
      } catch (err) {
        console.error('Error emitting whatsapp:message socket event from unified service:', err);
      }
    }

    return result;
  }

  getMediaTypeFromUrl(url) {
    if (!url) return 'text';
    const extension = url.split('.').pop().toLowerCase().split('?')[0];
    const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
    const videoExtensions = ['mp4', 'mov', 'avi', 'mkv'];
    const audioExtensions = ['mp3', 'ogg', 'wav', 'm4a'];

    if (imageExtensions.includes(extension)) return 'image';
    if (videoExtensions.includes(extension)) return 'video';
    if (audioExtensions.includes(extension)) return 'audio';
    return 'document';
  }



  async getMessages(userId, contactNumber, providerType = null, connectionId = null, whatsappPhoneNumber = null, options = {}) {
    if (whatsappPhoneNumber && whatsappPhoneNumber.waba_id) {
      const waba = whatsappPhoneNumber.waba_id;
      const type = waba.provider || PROVIDER_TYPES.BUSINESS_API;

      const connection = type === PROVIDER_TYPES.BUSINESS_API
        ? {
          access_token: waba.access_token,
          phone_number_id: whatsappPhoneNumber.phone_number_id,
          registred_phone_number: whatsappPhoneNumber.display_phone_number
        }
        : waba;

      return await this.providers[type].getMessages(userId, contactNumber, whatsappPhoneNumber, options);
    }

    let providerInfo;
    if (providerType) {
      providerInfo = await this.getProviderByType(providerType, userId, connectionId);
    } else {
      providerInfo = await this.getProvider(userId, connectionId);
    }

    return await providerInfo.provider.getMessages(userId, contactNumber, providerInfo.connection, options);
  }


  async getConnectionStatus(userId, providerType = null, connectionId = null) {
    let providerInfo;
    if (providerType) {
      providerInfo = await this.getProviderByType(providerType, userId, connectionId);
    } else {
      providerInfo = await this.getProvider(userId, connectionId);
    }

    return await providerInfo.provider.getConnectionStatus(userId, providerInfo.connection);
  }


  async initializeConnection(userId, providerType, connectionData = null) {
    const providerInfo = await this.getProviderByType(providerType, userId);
    return await providerInfo.provider.initializeConnection(userId, connectionData);
  }

  async initializeAllConnections() {
    try {
      const connections = await WhatsappWaba.find({
        provider: PROVIDER_TYPES.BAILEY,
        is_active: true,
        deleted_at: null
      });

      console.log(`Found ${connections.length} Baileys connections in database`);

      for (const conn of connections) {
        if (conn.connection_status === 'disconnected' || conn.connection_status === 'qr_timeout') {
          console.log(`Skipping ${conn._id} - status: ${conn.connection_status}. User needs to manually reconnect.`);
          continue;
        }

        const sessionDir = path.join(process.cwd(), 'storage', 'sessions', 'baileys', conn._id.toString());
        const hasSessionFiles = fs.existsSync(sessionDir) && fs.readdirSync(sessionDir).length > 0;

        if (hasSessionFiles || conn.connection_status === 'connected') {
          console.log(`Auto-initializing ${conn._id} - status: ${conn.connection_status}, has session: ${hasSessionFiles}`);
          this.providers[PROVIDER_TYPES.BAILEY].initializeConnection(conn.user_id, conn)
            .catch(err => console.error(`Error auto-initializing Baileys for WABA ${conn._id}:`, err));
        } else {
          console.log(`Skipping ${conn._id} - no session files found. Status: ${conn.connection_status}`);
        }
      }
    } catch (error) {
      console.error('Error fetching connections for auto-initialization:', error);
    }
  }


  async getQRCode(userId, wabaId) {
    const providerInfo = await this.getProviderByType(PROVIDER_TYPES.BAILEY, userId, wabaId);
    return await providerInfo.provider.getQRCode(userId, providerInfo.connection);
  }


  async getRecentChats(userId, providerType = null, connectionId = null, connection = null, options = {}) {
    if (connection) {
      const type = connection.provider || (connection.access_token ? PROVIDER_TYPES.BUSINESS_API : PROVIDER_TYPES.BAILEY);
      return await this.providers[type].getRecentChats(userId, connection, options);
    }

    let providerInfo;
    if (providerType) {
      providerInfo = await this.getProviderByType(providerType, userId, connectionId);
    } else {
      providerInfo = await this.getProvider(userId, connectionId);
    }

    return await providerInfo.provider.getRecentChats(userId, providerInfo.connection, options);
  }


  async hasProvider(userId, providerType) {
    if (providerType === PROVIDER_TYPES.BUSINESS_API) {
      const connection = await WhatsappConnection.findOne({
        user_id: userId,
        deleted_at: null
      });
      return !!connection;
    }

    return false;
  }

  async getUserConnections(userId) {
    const connections = await WhatsappConnection.find({
      user_id: userId,
      deleted_at: null
    })
      .sort({ created_at: -1 })
      .lean();

    const enrichedConnections = await Promise.all(
      connections.map(async (conn) => {
        let verified_name = null;
        let quality_rating = null;
        console.log("conn.phone_number_id", conn.phone_number_id)
        console.log("conn.access_token", conn.access_token)

        try {
          const response = await axios.get(
            `https://graph.facebook.com/v19.0/${conn.phone_number_id}`,
            {
              params: {
                fields: 'verified_name,quality_rating'
              },
              headers: {
                Authorization: `Bearer ${conn.access_token}`
              }
            }
          );
          verified_name = response.data.verified_name;
          quality_rating = response.data.quality_rating;
        } catch (err) {
          console.error(
            `Failed to fetch WhatsApp details for ${conn.phone_number_id}`,
            err.message
          );
        }

        return {
          id: conn._id.toString(),
          name: conn.name,
          registred_phone_number: conn.registred_phone_number,
          phone_number_id: conn.phone_number_id,
          whatsapp_business_account_id: conn.whatsapp_business_account_id,
          app_id: conn.app_id,
          is_active: conn.is_active,
          verified_name,
          quality_rating,
          created_at: conn.created_at,
          updated_at: conn.updated_at
        };
      })
    );

    return enrichedConnections;
  }

  async updateConnection(userId, connectionId, updateData) {
    const connection = await WhatsappConnection.findOne({
      _id: connectionId,
      user_id: userId,
      deleted_at: null
    });

    if (!connection) {
      throw new Error('Connection not found');
    }

    if (updateData.name !== undefined) {
      connection.name = updateData.name;
    }

    if (updateData.is_active !== undefined) {
      connection.is_active = updateData.is_active;

      if (updateData.is_active === true) {
        await WhatsappConnection.updateMany(
          {
            user_id: userId,
            _id: { $ne: connectionId },
            deleted_at: null
          },
          { is_active: false }
        );
      }
    }

    await connection.save();

    return {
      id: connection._id.toString(),
      name: connection.name,
      registred_phone_number: connection.registred_phone_number,
      is_active: connection.is_active
    };
  }

  async deleteConnection(userId, connectionId) {
    const connection = await WhatsappConnection.findOne({
      _id: connectionId,
      user_id: userId,
      deleted_at: null
    });

    if (!connection) {
      throw new Error('Connection not found');
    }

    connection.deleted_at = new Date();
    await connection.save();

    return { success: true };
  }

  async disconnectWhatsApp(userId, providerType = null, connectionId = null) {
    let providerInfo;
    if (providerType) {
      providerInfo = await this.getProviderByType(providerType, userId, connectionId);
    } else {
      providerInfo = await this.getProvider(userId, connectionId);
    }

    if (!providerInfo.connection) {
      throw new Error('Connection not found');
    }

    return await providerInfo.provider.disconnect(userId, providerInfo.connection);
  }
}

export { PROVIDER_TYPES };
export default new UnifiedWhatsAppService();

