

import BaseProvider from './base.provider.js';
import { WhatsappConnection, Message, Contact, Template } from '../../../models/index.js';
import {
  uploadMediaToWhatsApp,
  getWhatsAppTypeFromMime,
  getWhatsAppMediaUrl
} from '../../../utils/uploadMediaToWhatsapp.js';

const WHATSAPP_API_VERSION = 'v22.0';
const WHATSAPP_GRAPH_API_APP_URL = 'https://graph.facebook.com';

const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document',
  INTERACTIVE: 'interactive',
  LOCATION: 'location',
  TEMPLATE: 'template',
  REACTION: 'reaction'
};

export default class BusinessAPIProvider extends BaseProvider {

  buildWhatsAppPayload(params) {
    const { recipientNumber, messageType, messageText, mediaId, mediaUrl, fileName, replyMessageId, reactionMessageId, reactionEmoji } = params;

    const payload = {
      messaging_product: 'whatsapp',
      to: recipientNumber,
      type: messageType
    };

    if (replyMessageId) {
      payload.context = {
        message_id: replyMessageId
      };
    }

    switch (messageType) {
      case MESSAGE_TYPES.TEXT:
        payload.text = { body: messageText };
        break;

      case MESSAGE_TYPES.IMAGE:
        payload.image = {};
        if (mediaId) payload.image.id = mediaId;
        else if (mediaUrl) payload.image.link = mediaUrl;

        if (messageText) payload.image.caption = messageText;
        break;

      case MESSAGE_TYPES.VIDEO:
        payload.video = {};
        if (mediaId) payload.video.id = mediaId;
        else if (mediaUrl) payload.video.link = mediaUrl;

        if (messageText) payload.video.caption = messageText;
        break;

      case MESSAGE_TYPES.AUDIO:
        payload.audio = {};
        if (mediaId) payload.audio.id = mediaId;
        else if (mediaUrl) payload.audio.link = mediaUrl;
        break;

      case MESSAGE_TYPES.DOCUMENT:
        payload.document = {};
        if (mediaId) payload.document.id = mediaId;
        else if (mediaUrl) payload.document.link = mediaUrl;

        if (fileName) payload.document.filename = fileName;
        if (messageText) payload.document.caption = messageText;
        break;

      case MESSAGE_TYPES.LOCATION:
        const { location } = params;
        payload.location = {
          longitude: location.longitude,
          latitude: location.latitude,
          name: location.name,
          address: location.address
        };
        break;

      case MESSAGE_TYPES.INTERACTIVE:
        const { interactiveType, buttonParams, listParams } = params;

        if (interactiveType === 'button') {
          payload.interactive = {
            type: 'button',
            body: {
              text: messageText
            },
            action: {
              buttons: buttonParams?.map((btn, index) => ({
                type: 'reply',
                reply: {
                  id: btn.id || `btn_${index}`,
                  title: btn.title
                }
              })) || []
            }
          };
        } else if (interactiveType === 'list') {
          payload.interactive = {
            type: 'list',
            header: {
              type: 'text',
              text: listParams?.header || 'Options'
            },
            body: {
              text: messageText
            },
            action: {
              button: listParams?.buttonTitle || 'Select',
              sections: [
                {
                  title: listParams?.sectionTitle || 'Menu',
                  rows: listParams?.items?.map((item, index) => ({
                    id: item.id || `item_${index}`,
                    title: item.title,
                    description: item.description || ''
                  })) || []
                }
              ]
            }
          };
        } else if (interactiveType === 'cta_url') {
          payload.interactive = {
            type: 'cta_url',
            body: {
              text: messageText
            },
            action: {
              name: 'cta_url',
              parameters: {
                display_text: buttonParams?.display_text || 'Visit',
                url: buttonParams?.url || ''
              }
            }
          };
        }
        break;

      case MESSAGE_TYPES.TEMPLATE:
        const { templateName, languageCode, templateComponents } = params;

        payload.template = {
          name: templateName || params.template_name,
          language: { code: languageCode || params.language_code || 'en_US' }
        };

        if (templateComponents && templateComponents.length > 0) {
          payload.template.components = templateComponents;
        }

        console.log('Template payload being sent to WhatsApp:', JSON.stringify(payload, null, 2));
        break;

      case MESSAGE_TYPES.REACTION:
        payload.reaction = {
          message_id: params.reactionMessageId,
          emoji: params.reactionEmoji
        };
        break;

      default:
        throw new Error(`Unsupported message type: ${messageType}`);
    }

    return payload;
  }

  async sendWhatsAppAPIMessage(params) {
    const { phone_number_id, access_token, payload } = params;
    console.log("phone_number_id" , phone_number_id);
    const apiUrl = `${WHATSAPP_GRAPH_API_APP_URL}/${WHATSAPP_API_VERSION}/${phone_number_id}/messages`;

    console.log('Sending WhatsApp API Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const responseData = await response.json();
    if (!response.ok) {
      throw new Error(
        `WhatsApp API error: ${responseData.error?.error_data?.details || 'Unknown error'}`
      );
    }

    return responseData;
  }

  async processMediaUpload(params) {
    const { file, phone_number_id, access_token } = params;

    if (!file) {
      return { mediaId: null, mediaUrl: null, messageType: MESSAGE_TYPES.TEXT };
    }

    const messageType = getWhatsAppTypeFromMime(file.mimetype);

    const mediaId = await uploadMediaToWhatsApp({
      phone_number_id: phone_number_id,
      access_token: access_token,
      buffer: file.buffer,
      mime_type: file.mimetype,
      filename: file.originalname
    });
    const mediaUrl = await getWhatsAppMediaUrl(mediaId, access_token);

    return { mediaId, mediaUrl, messageType };
  }

  async sendMessage(userId, params, connection = null) {
    const {
      recipientNumber,
      messageText,
      file,
      messageType = 'text',
      interactiveType,
      buttonParams,
      listParams,
      locationParams,
      mediaUrl,
      replyMessageId,
      reactionMessageId,
      reactionEmoji,
      templateId
    } = params;

    if (!connection) {
      throw new Error(
        'WhatsApp Business API connection not found. Please provide a connection ID.'
      );
    }

    const {
      access_token,
      phone_number_id,
      registred_phone_number
    } = connection;

    const myPhoneNumber = connection.registred_phone_number || registred_phone_number;


    let contact = null;
    if (!params.fromCampaignSystem) {
      contact = await Contact.findOne({
        phone_number: recipientNumber,
        created_by: userId,
        deleted_at: null
      });

      if (!contact) {
        contact = await Contact.create({
          phone_number: recipientNumber,
          name: recipientNumber,
          source: 'whatsapp',
          user_id: userId,
          created_by: userId,
          status: 'lead'
        });
      }
    } else {
      contact = { _id: params.contactId || null };
    }

    let mediaId = null;
    let fileMediaUrl = null;
    if (file && messageType !== 'interactive') {
      if (file.buffer) {
        const mediaResult = await this.processMediaUpload({
          file,
          phone_number_id,
          access_token
        });
        mediaId = mediaResult.mediaId;
        fileMediaUrl = mediaResult.mediaUrl;
      } else if (file.url) {
        fileMediaUrl = file.url;
      }
    }

    const finalMediaUrl = fileMediaUrl || mediaUrl;

    let whatsappPayload;

    if (messageType === 'interactive') {
      if (interactiveType === 'button') {
        whatsappPayload = {
          messaging_product: 'whatsapp',
          to: recipientNumber,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: messageText
            },
            action: {
              buttons: (buttonParams || []).map((btn, index) => ({
                type: 'reply',
                reply: {
                  id: btn.id || `btn_${index}`,
                  title: btn.title || `Button ${index + 1}`
                }
              }))
            }
          }
        };
      }

      if (interactiveType === 'list') {
        whatsappPayload = {
          messaging_product: 'whatsapp',
          to: recipientNumber,
          type: 'interactive',
          interactive: {
            type: 'list',
            header: {
              type: 'text',
              text: listParams?.header || 'Options'
            },
            body: {
              text: messageText || listParams.body || 'Please select an option'
            },
            footer: listParams?.footer ? {
              text: listParams.footer
            } : undefined,
            action: {
              button: listParams?.buttonTitle || 'Select',
              sections: [
                {
                  title: listParams?.sectionTitle || 'Menu',
                  rows: (listParams?.items || []).map((item, index) => ({
                    id: item.id || `item_${index}`,
                    title: item.title || `Item ${index + 1}`,
                    description: item.description || ''
                  }))
                }
              ]
            }
          }
        };
      }

      if (interactiveType === 'flow') {
        whatsappPayload = {
          messaging_product: 'whatsapp',
          to: recipientNumber,
          type: 'interactive',
          interactive: {
            type: 'flow',
            body: {
              text: messageText
            },
            action: {
              name: 'flow',
              parameters: {
                flow_message_version: '3',
                flow_token: params.flowToken || `token_${Date.now()}`,
                flow_id: params.flowId,
                flow_cta: params.buttonText || 'Open Form',
                flow_action: 'navigate',
                flow_action_payload: {
                  screen: 'STEP_ONE'
                }
              }
            }
          }
        };
      }

      if (interactiveType === 'cta_url') {
        whatsappPayload = {
          messaging_product: 'whatsapp',
          to: recipientNumber,
          type: 'interactive',
          interactive: {
            type: 'cta_url',
            body: {
              text: messageText
            },
            action: {
              name: 'cta_url',
              parameters: {
                display_text: buttonParams?.display_text || 'Visit',
                url: buttonParams?.url || ''
              }
            }
          }
        };
      }
    }

    else {
      whatsappPayload = this.buildWhatsAppPayload({
        recipientNumber,
        messageType,
        messageText,
        mediaId,
        mediaUrl: finalMediaUrl,
        fileName: file?.originalname,
        location: locationParams,
        templateName: params.templateName,
        template_name: params.templateName,
        languageCode: params.languageCode,
        language_code: params.languageCode,
        templateComponents: params.templateComponents,
        replyMessageId: replyMessageId,
        reactionMessageId: reactionMessageId,
        reactionEmoji: reactionEmoji
      });
    }

    if (!whatsappPayload) {
      whatsappPayload = {
        messaging_product: 'whatsapp',
        to: recipientNumber,
        type: 'text',
        text: { body: messageText || 'Error: Empty Payload' }
      };
    }

    const apiResponse = await this.sendWhatsAppAPIMessage({
      phone_number_id,
      access_token,
      payload: whatsappPayload
    });
    const messageMeta = messageType === 'interactive'
      ? {
        interactiveType,
        buttons: interactiveType === 'button' ? buttonParams : undefined,
        list: interactiveType === 'list' ? listParams : undefined,
        flowId: interactiveType === 'flow' ? params.flowId : undefined,
        flowToken: interactiveType === 'flow' ? (whatsappPayload.interactive.action.parameters.flow_token) : undefined,
        flow_cta: interactiveType === 'flow' ? (params.buttonText || 'Open Form') : undefined,
      }
      : null;


    let savedMessage = null;
    if (!params.fromCampaignSystem) {
      let contentToStore = messageText || null;

      if (messageType === MESSAGE_TYPES.LOCATION && locationParams) {
        contentToStore = JSON.stringify({
          latitude: locationParams.latitude,
          longitude: locationParams.longitude,
          name: locationParams.name,
          address: locationParams.address
        });
      } else if (messageType === MESSAGE_TYPES.REACTION) {
        contentToStore = reactionEmoji;
      }

      savedMessage = await Message.create({
        sender_number: myPhoneNumber,
        user_id: userId,
        recipient_number: recipientNumber,
        contact_id: contact?._id || params.contactId,
        content: contentToStore,
        message_type: messageType,
        file_url: finalMediaUrl,
        file_type: file?.mimetype || null,
        from_me: true,
        direction: 'outbound',
        wa_message_id: apiResponse.messages?.[0]?.id || null,
        wa_timestamp: new Date(),
        metadata: apiResponse,
        interactive_data: messageMeta,
        provider: 'business_api',
        reply_message_id: params.replyMessageId || null,
        reaction_message_id: params.reactionMessageId || null,
        template_id: templateId || null
      });
    }

    return {
      messageId: savedMessage ? savedMessage._id.toString() : apiResponse.messages?.[0]?.id || null,
      waMessageId: savedMessage ? savedMessage.wa_message_id : apiResponse.messages?.[0]?.id || null,
      recipientNumber,
      messageType,
      timestamp: new Date(),
      apiResponse,
      provider: 'business_api'
    };
  }

  async getMessages(userId, contactNumber, connection = null, options = {}) {
    if (!connection) {
      throw new Error('WhatsApp Business API connection not found');
    }

    const myPhoneNumber = connection.display_phone_number || connection.display_phone_number;

    const contact = await Contact.findOne({
      phone_number: contactNumber,
      created_by: userId,
      deleted_at: null
    });

    const baseCondition = {
      $or: [
        {
          sender_number: contactNumber,
          recipient_number: myPhoneNumber,
          deleted_at: null
        },
        {
          sender_number: myPhoneNumber,
          recipient_number: contactNumber,
          deleted_at: null
        }
      ]
    };

    const query = { ...baseCondition };

    if (options.search) {
      query.content = { $regex: options.search, $options: 'i' };
    }

    if (options.start_date || options.end_date) {
      query.wa_timestamp = {};
      if (options.start_date) query.wa_timestamp.$gte = options.start_date;
      if (options.end_date) query.wa_timestamp.$lte = options.end_date;
    }

    const messages = await Message.find(query)
      .sort({ wa_timestamp: 1 })
      .populate({
        path: 'template_id'
      })
      .populate('submission_id')
      .lean();

    let canChat = true;
    if (contact) {
      const lastInboundMessage = await Message.findOne({
        sender_number: contactNumber,
        recipient_number: myPhoneNumber,
        deleted_at: null
      })
        .sort({ wa_timestamp: -1 })
        .lean();

      if (lastInboundMessage) {
        const lastMessageTime = new Date(lastInboundMessage.wa_timestamp);
        const currentTime = new Date();
        const timeDifference = currentTime - lastMessageTime;
        const twentyFourHours = 24 * 60 * 60 * 1000;

        canChat = timeDifference < twentyFourHours;
      }
    }

    const enrichedMessages = messages.map(message => ({
      ...message,
      can_chat: canChat,
      contact_id: contact ? contact._id.toString() : null
    }));

    return enrichedMessages;
  }

  async getConnectionStatus(userId, connection = null) {
    if (!connection) {
      throw new Error('WhatsApp Business API connection not found');
    }

    return {
      connected: !!connection,
    };
  }

  async initializeConnection(userId, connectionData) {
    if (!connectionData) {
      throw new Error('Connection data is required for Business API');
    }

    const { name, phone_number_id, access_token, whatsapp_business_account_id, registred_phone_number, app_id } = connectionData;

    if (!phone_number_id || !access_token || !whatsapp_business_account_id || !app_id) {
      throw new Error('Name, Phone number ID, access token, app_id, registred_phone_number and WhatsApp Business Account ID are required');
    }

    const connection = await WhatsappConnection.create({
      user_id: userId,
      name: name,
      phone_number_id: phone_number_id,
      access_token: access_token,
      whatsapp_business_account_id: whatsapp_business_account_id,
      registred_phone_number: registred_phone_number,
      app_id: app_id,
      is_active: true
    });

    return {
      success: true,
      connected: true,
      provider: 'business_api',
      connection: {
        id: connection._id.toString(),
        phone_number_id: connection.phone_number_id
      }
    };
  }

  async getRecentChats(userId, connection = null) {
    if (!connection) {
      throw new Error('WhatsApp Business API connection not found');
    }

    const myPhoneNumber = connection.registred_phone_number;

    const sentMessages = await Message.distinct('recipient_number', {
      sender_number: myPhoneNumber,
      recipient_number: { $ne: null },
      deleted_at: null
    });

    const receivedMessages = await Message.distinct('sender_number', {
      recipient_number: myPhoneNumber,
      sender_number: { $ne: null },
      deleted_at: null
    });

    const allContactNumbers = [
      ...new Set([
        ...sentMessages.filter(Boolean),
        ...receivedMessages.filter(Boolean)
      ])
    ].filter(number => number && number !== myPhoneNumber);

    const recentChats = await Promise.all(
      allContactNumbers.map(async (contactNumber) => {
        const lastMessage = await Message.findOne({
          $or: [
            {
              sender_number: myPhoneNumber,
              recipient_number: contactNumber,
              deleted_at: null
            },
            {
              sender_number: contactNumber,
              recipient_number: myPhoneNumber,
              deleted_at: null
            }
          ]
        })
          .sort({ wa_timestamp: -1 })
          .lean();

        return {
          contact: {
            number: contactNumber,
            name: contactNumber,
            avatar: null
          },
          lastMessage: lastMessage ? {
            id: lastMessage._id.toString(),
            content: lastMessage.content,
            messageType: lastMessage.message_type,
            fileUrl: lastMessage.file_url,
            direction: lastMessage.direction,
            fromMe: lastMessage.from_me,
            createdAt: lastMessage.wa_timestamp,
            is_seen: lastMessage.is_seen || false,
            read_status: lastMessage.read_status || 'unread'
          } : null
        };
      })
    );

    return recentChats.sort((a, b) => {
      if (!a.lastMessage && !b.lastMessage) return 0;
      if (!a.lastMessage) return 1;
      if (!b.lastMessage) return -1;
      return new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt);
    });
  }

  async disconnect(userId, connection = null) {
    if (!connection) {
      throw new Error('WhatsApp Business API connection not found');
    }

    const { WhatsappWaba, WhatsappConnection, WhatsappPhoneNumber } = await import('../../../models/index.js');

    let phone_number_id = connection.phone_number_id;

    if (!phone_number_id) {
      const phoneDoc = await WhatsappPhoneNumber.findOne({ waba_id: connection._id || connection.id, deleted_at: null });
      if (phoneDoc) {
        phone_number_id = phoneDoc.phone_number_id;
      }
    }

    const updateOps = [
      WhatsappWaba.findOneAndUpdate(
        { _id: connection._id || connection.id, user_id: userId },
        { is_active: false, connection_status: 'disconnected', deleted_at: new Date() }
      )
    ];

    if (phone_number_id) {
      updateOps.push(
        WhatsappConnection.findOneAndUpdate(
          { phone_number_id: phone_number_id, user_id: userId },
          { is_active: false, deleted_at: new Date() }
        ),
        WhatsappPhoneNumber.updateMany(
          {
            $or: [
              { waba_id: connection._id || connection.id },
              { phone_number_id: phone_number_id }
            ],
            user_id: userId
          },
          { deleted_at: new Date(), is_active: false }
        )
      );
    }

    await Promise.all(updateOps);

    return { success: true };
  }
}

