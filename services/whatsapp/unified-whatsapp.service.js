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
            user_id: userId,
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
      if (replyType === 'ReplyMaterial' || replyType === 'replymaterial' || ['text', 'image', 'video', 'audio', 'document', 'flow'].includes(replyType)) {
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
        }
      } else if (replyType === 'Template' || replyType === 'template') {
        const template = await Template.findById(replyId);
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
      if (templateComponents.length === 0) {
        if (mediaUrl) {
          let mediaType = 'image';
          if (mediaUrl.endsWith('.mp4') || mediaUrl.includes('video')) mediaType = 'video';
          else if (mediaUrl.endsWith('.mp3') || mediaUrl.includes('audio')) mediaType = 'audio';
          else if (mediaUrl.endsWith('.pdf') || mediaUrl.includes('document')) mediaType = 'document';

          templateComponents.push({
            type: 'header',
            parameters: [{
              type: mediaType,
              [mediaType]: { link: mediaUrl }
            }]
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

        const template = messageParams.templateObj;
        if (template && Array.isArray(template.buttons)) {
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
        const carouselCardsData = messageParams.carouselCardsData && Array.isArray(messageParams.carouselCardsData) ? messageParams.carouselCardsData : [];
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
            console.error(
              `Template "${template.template_name}" is a carousel template, but no carousel_products or carousel_cards_data was provided.`
            );
          }
        }
      }
    }

    messageParams.recipientNumber = recipientNumber;
    messageParams.messageText = messageText;
    messageParams.messageType = messageType;
    messageParams.templateName = templateName;
    messageParams.templateComponents = templateComponents;
    messageParams.mediaUrl = mediaUrl;
    messageParams.replyMessageId = replyMessageId;
    messageParams.reactionMessageId = reactionMessageId;
    messageParams.reactionEmoji = reactionEmoji;
    messageParams.templateId = templateId;

    if (recipientNumber) {
      await Contact.updateOne(
        { phone_number: recipientNumber, created_by: userId },
        { last_outgoing_message_at: new Date() }
      );
    }

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

      return await this.providers[providerType].sendMessage(userId, messageParams, connection);
    }

    let providerInfo;
    if (providerType) {
      providerInfo = await this.getProviderByType(providerType, userId, connectionId);
    } else {
      providerInfo = await this.getProvider(userId, connectionId);
    }

    return await providerInfo.provider.sendMessage(userId, messageParams, providerInfo.connection);
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


  async getRecentChats(userId, providerType = null, connectionId = null, connection = null) {
    if (connection) {

      const type = connection.provider || (connection.access_token ? PROVIDER_TYPES.BUSINESS_API : PROVIDER_TYPES.BAILEY);
      return await this.providers[type].getRecentChats(userId, connection);
    }

    let providerInfo;
    if (providerType) {
      providerInfo = await this.getProviderByType(providerType, userId, connectionId);
    } else {
      providerInfo = await this.getProvider(userId, connectionId);
    }

    return await providerInfo.provider.getRecentChats(userId, providerInfo.connection);
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

