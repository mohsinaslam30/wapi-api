import unifiedWhatsAppService, { PROVIDER_TYPES } from '../services/whatsapp/unified-whatsapp.service.js';
import { Message, ContactTag, ChatNote, WhatsappWaba, WhatsappPhoneNumber, Contact, Tag, ChatAssignment, User, TelegramConnection, InstagramConnection, FacebookConnection, TwitterConnection, FacebookPage, Template, Submission } from '../models/index.js';
import { uploadSingle } from '../utils/upload.js';
import { Setting } from '../models/index.js';
const WHATSAPP_JID_SUFFIX = '@s.whatsapp.net';
import axios from 'axios';
import { WhatsappConnection } from '../models/index.js';
import { assignChatToAgent as assignChatToAgentFromChat } from './chat.controller.js';
import paymentLinkService from '../services/payment-link.service.js';
import mongoose from 'mongoose';

const processedAuthCodes = new Set();

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;
const META_GRAPH_API_VERSION = 'v25.0';

const extractPhoneNumber = (userId) => {
  return userId.split(':')[0].replace(WHATSAPP_JID_SUFFIX, '');
};

const parsePaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
  const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(query.limit) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const getAgentAllowedPhoneNumber = async (agentId, contactPhoneNumber, whatsappPhoneNumberId) => {
  if (!whatsappPhoneNumberId || !contactPhoneNumber) return null;
  const phoneNumber = await WhatsappPhoneNumber.findById(whatsappPhoneNumberId)
    .populate('waba_id')
    .lean();
  if (!phoneNumber || !phoneNumber.waba_id) return null;
  const businessNumber = phoneNumber.display_phone_number;
  const chatMatch = {
    $or: [
      { sender_number: contactPhoneNumber, receiver_number: businessNumber },
      { sender_number: businessNumber, receiver_number: contactPhoneNumber }
    ]
  };
  const statusMatch = { $or: [{ status: 'assigned' }, { status: { $exists: false } }] };

  let assignment = await ChatAssignment.findOne({
    agent_id: agentId,
    whatsapp_phone_number_id: whatsappPhoneNumberId,
    $and: [statusMatch, chatMatch]
  }).lean();
  if (!assignment) {
    assignment = await ChatAssignment.findOne({
      agent_id: agentId,
      whatsapp_phone_number_id: { $exists: false },
      $and: [statusMatch, chatMatch]
    }).lean();
  }
  return assignment ? phoneNumber : null;
};

const isAlreadyRegisteredError = (error) => {
  const metaError = error?.response?.data?.error;
  const message = `${metaError?.message || ''} ${metaError?.error_data?.details || ''}`.toLowerCase();
  return message.includes('already') && message.includes('register');
};

const isCoexistenceSignup = (signupData = {}, phoneData = {}) => {
  return signupData.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'
    || signupData.featureType === 'whatsapp_business_app_onboarding'
    || signupData.is_on_biz_app === true
    || phoneData.is_on_biz_app === true;
};

const subscribeWabaToApp = async (wabaId, accessToken) => {
  return axios.post(
    `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${wabaId}/subscribed_apps`,
    {},
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );
};


const formatDateLabel = (date) => {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const groupMessagesByDateAndSender = (messages, replyMessagesMap = {}, reactionsMap = {}, contact = null, connection = null) => {
  const groupedMessages = {};
  let lastSenderNumber = null;
  let lastDateKey = null;
  let currentGroup = null;

  const resolveName = (id) => {
    if (!id) return '';
    const idStr = String(id);
    if (contact) {
      if (
        idStr === String(contact.phone_number) ||
        idStr === String(contact.telegram_chat_id) ||
        idStr === String(contact.facebook_page_scoped_id) ||
        idStr === String(contact.instagram_scoped_id) ||
        idStr === String(contact._id)
      ) {
        return contact.name || contact.phone_number || idStr;
      }
    }
    if (connection) {
      if (
        idStr === String(connection.bot_id) ||
        idStr === String(connection.bot_username) ||
        idStr === String(connection.username) ||
        idStr === String(connection.display_phone_number) ||
        idStr === String(connection._id) ||
        (connection.pages || []).some(p => String(p.page_id) === idStr || String(p.instagram_account_id) === idStr)
      ) {
        return connection.bot_name || connection.name || connection.username || connection.display_phone_number || idStr;
      }
    }
    return idStr;
  };

  messages.forEach((message) => {
    const dateKey = message.wa_timestamp.toISOString().split('T')[0];
    const senderNumber = message.sender_number || message.sender_id;
    const recipientNumber = message.recipient_number || message.recipient_id;

    if (!groupedMessages[dateKey]) {
      groupedMessages[dateKey] = {
        dateLabel: formatDateLabel(message.wa_timestamp),
        dateKey,
        messageGroups: []
      };
    }

    if (lastDateKey !== dateKey || lastSenderNumber !== senderNumber) {
      currentGroup = {
        senderId: senderNumber,
        sender: {
          id: senderNumber,
          name: resolveName(senderNumber),
          avatar: null
        },
        recipient: {
          id: recipientNumber,
          name: resolveName(recipientNumber),
          avatar: null
        },
        messages: [],
        createdAt: message.wa_timestamp,
        lastMessageTime: message.wa_timestamp
      };
      groupedMessages[dateKey].messageGroups.push(currentGroup);
    }

    const messageObject = {
      id: message._id.toString(),
      content: message.content,
      interactiveData: message.interactive_data,
      messageType: message.message_type,
      fileUrl: message.file_url || null,
      template: message.template_id || null,
      metadata: message.metadata || null,
      createdAt: message.wa_timestamp,
      can_chat: message.can_chat,
      delivered_at: message.delivered_at || null,
      delivery_status: message.delivery_status || 'pending',
      is_delivered: message.is_delivered || false,
      is_seen: message.is_seen || false,
      seen_at: message.seen_at || null,
      wa_status: message.wa_status || null,
      wa_message_id: message.wa_message_id || message.platform_message_id || null,
      direction: message.direction || null,
      reply_message_id: message.reply_message_id || null,
      reply_message: replyMessagesMap[message.reply_message_id] || null,
      reaction_message_id: message.reaction_message_id || null,
      sender: {
        id: senderNumber,
        name: (message.from_me && message.user_id?.name) ? message.user_id.name : resolveName(senderNumber)
      },
      agent: (message.from_me && message.user_id) ? {
        id: message.user_id._id || message.user_id,
        name: message.user_id.name || 'Unknown Agent'
      } : null,
      recipient: {
        id: recipientNumber,
        name: resolveName(recipientNumber)
      },
      reactions: reactionsMap[message.wa_message_id || message.platform_message_id] || [],
      submission_id: message.submission_id?._id || message.submission_id || null,
      fields: message.submission_id?.fields || []
    };

    currentGroup.messages.push(messageObject);
    currentGroup.lastMessageTime = message.wa_timestamp;

    lastSenderNumber = senderNumber;
    lastDateKey = dateKey;
  });

  return groupedMessages;
};

const categorizeMediaMessages = (messages) => {
  const media = {
    images: [],
    audios: [],
    videos: [],
    documents: []
  };

  messages.forEach((message) => {
    const mediaPayload = {
      id: message._id.toString(),
      messageType: message.message_type,
      fileUrl: message.file_url,
      createdAt: message.wa_timestamp,
      senderNumber: message.sender_number,
      recipientNumber: message.recipient_number
    };

    switch (message.message_type) {
      case 'image':
        media.images.push(mediaPayload);
        break;
      case 'audio':
        media.audios.push(mediaPayload);
        break;
      case 'video':
        media.videos.push(mediaPayload);
        break;
      case 'document':
        media.documents.push(mediaPayload);
        break;
    }
  });

  return media;
};

export const sendMessage = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const senderId = req.user.id;
    const {
      platform: platformInput,
      contact_id: contactIdInput,
      whatsapp_phone_number_id: whatsappPhoneNumberIdInput,
      contact_no: contactNoInput,
      whatsapp_phone_number: whatsappPhoneNumberInput,
      message,
      messageText: messageTextBody,
      provider,
      connection_id: connectionId,
      buttonParams,
      buttons,
      messageType: messageTypeInput,
      interactiveType,
      listParams,
      templateName,
      languageCode,
      templateVariables,
      templateComponents: templateComponentsInput,
      mediaUrl,
      mediaUrls,
      location: locationInput,
      replyMessageId,
      reactionMessageId,
      reactionEmoji,
      amount: rawAmount,
      description,
      gateway_id,
      currency,
      coupon_code,
      carouselCardsData,
      carouselProducts,
      template_id: templateIdInput
    } = req.body;

    const amount = rawAmount ? Math.round(Number(rawAmount) * 100) : undefined;

    const uploadedFiles = req.files && req.files['file_url'] ? req.files['file_url'] : (req.file ? [req.file] : []);
    const uploadedFile = uploadedFiles[0] || null;
    const carouselUploadedFiles = req.files && req.files['carousel_files'] ? req.files['carousel_files'] : [];

    let parsedMediaUrls = [];
    if (mediaUrls) {
      if (Array.isArray(mediaUrls)) {
        parsedMediaUrls = mediaUrls;
      } else if (typeof mediaUrls === 'string') {
        try {
          const parsed = JSON.parse(mediaUrls);
          parsedMediaUrls = Array.isArray(parsed) ? parsed : [mediaUrls];
        } catch (_) {
          parsedMediaUrls = [mediaUrls];
        }
      }
    } else if (mediaUrl) {
      parsedMediaUrls = [mediaUrl];
    }
    const totalMediaCount = parsedMediaUrls.length + uploadedFiles.length;

    let parsedLocation = null;
    if (locationInput) {
      if (typeof locationInput === 'string') {
        try {
          parsedLocation = JSON.parse(locationInput);
        } catch (_) {
          parsedLocation = null;
        }
      } else {
        parsedLocation = locationInput;
      }
    }

    let resolvedCarouselCardsData = carouselCardsData;
    if (carouselUploadedFiles.length > 0) {
      const parsed = typeof carouselCardsData === 'string' ? JSON.parse(carouselCardsData) : (carouselCardsData || []);
      resolvedCarouselCardsData = parsed.map((card, index) => {
        const file = carouselUploadedFiles[index];
        if (file) {
          return {
            ...card,
            header: {
              type: file.mimetype.startsWith('video/') ? 'video' : 'image',
              _uploadedFile: file
            }
          };
        }
        return card;
      });
    } else if (typeof carouselCardsData === 'string') {
      try { resolvedCarouselCardsData = JSON.parse(carouselCardsData); } catch (_) { }
    }

    if (req.body.segment_id) {
      const segmentId = req.body.segment_id;
      if (!mongoose.Types.ObjectId.isValid(segmentId)) {
        return res.status(400).json({ success: false, message: 'Invalid segment ID' });
      }

      let whatsappPhoneNumberId = whatsappPhoneNumberIdInput;
      if (!whatsappPhoneNumberId && whatsappPhoneNumberInput) {
        const wNumber = await WhatsappPhoneNumber.findOne({
          $or: [
            { display_phone_number: whatsappPhoneNumberInput },
            { phone_number_id: whatsappPhoneNumberInput }
          ],
          user_id: userId,
          deleted_at: null
        }).lean();
        if (wNumber) whatsappPhoneNumberId = wNumber._id.toString();
      }

      if (!whatsappPhoneNumberId && connectionId && provider === PROVIDER_TYPES.BAILEY) {
        const phone = await WhatsappPhoneNumber.findOne({ waba_id: connectionId, deleted_at: null }).lean();
        if (phone) whatsappPhoneNumberId = phone._id.toString();
      }

      if (!whatsappPhoneNumberId) {
        return res.status(400).json({ success: false, message: 'WhatsApp Phone Number (ID or Number) is required for segment broadcast' });
      }

      const contacts = await Contact.find({
        segments: segmentId,
        user_id: userId,
        deleted_at: null,
        is_unsubscribed: { $ne: true }
      });

      if (contacts.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No eligible (subscribed) contacts found in this segment'
        });
      }

      setImmediate(async () => {
        let sentCount = 0;
        let failedCount = 0;
        for (const contact of contacts) {
          try {
            await unifiedWhatsAppService.sendMessage(senderId, {
              contactId: contact._id.toString(),
              whatsappPhoneNumberId,
              messageText: messageTextBody || message,
              file: uploadedFile,
              messageType: messageTypeInput,
              interactiveType,
              buttonParams,
              listParams,
              templateName,
              languageCode,
              templateComponents: templateComponentsInput,
              templateVariables,
              providerType: provider,
              connectionId,
              mediaUrl: uploadedFile ? uploadedFile.path : ((mediaUrls && mediaUrls.length === 1) ? mediaUrls[0] : mediaUrl),
              locationParams: messageTypeInput === 'location' && parsedLocation ? {
                latitude: parsedLocation.latitude,
                longitude: parsedLocation.longitude,
                name: parsedLocation.name || undefined,
                address: parsedLocation.address || undefined
              } : undefined,
              couponCode: coupon_code,
              carouselCardsData: resolvedCarouselCardsData,
              carouselProducts,
              templateId: templateIdInput || undefined
            });
            sentCount++;
          } catch (err) {
            failedCount++;
            console.error(`Failed to send broadcast to ${contact.phone_number}:`, err);
          }
        }
        console.log(`Finished sending segment broadcast. Sent: ${sentCount}, Failed: ${failedCount}`);
      });

      return res.status(200).json({
        success: true,
        message: `Message broadcast started for ${contacts.length} eligible contacts. Unsubscribed contacts were skipped.`,
        data: {
          totalEligible: contacts.length
        }
      });
    }

    let messageText = messageTextBody || message || req.body.text;
    let messageType = messageTypeInput || req.body.type || req.body.message_type || 'text';
    let whatsappPhoneNumberId = whatsappPhoneNumberIdInput;
    let contactId = contactIdInput;

    if (platformInput && ['telegram', 'facebook', 'instagram', 'twitter'].includes(platformInput) && !contactId && !whatsappPhoneNumberId) {
      const platform = platformInput;
      const msgType = messageType || 'text';
      const msgText = messageText || req.body.text;
      const wsId = req.body.workspace_id || req.params.workspace_id;

      if (!msgText && msgType !== 'reaction') {
        return res.status(400).json({ success: false, error: 'text is required' });
      }

      let connection = null;
      let recipientId = req.body.recipient_id;

      if (platform === 'twitter') {
        const { default: TwitterConnection } = await import('../models/twitter-connection.model.js');
        connection = await TwitterConnection.findOne({ $or: [{ workspace_id: wsId }, { user_id: userId }], is_active: true }).lean();
        if (!connection) return res.status(400).json({ success: false, error: 'No active Twitter connection found' });
        if (!connection.access_token) return res.status(400).json({ success: false, error: 'Twitter access token not found' });
        if (!recipientId) return res.status(400).json({ success: false, error: 'recipient_id is required for Twitter' });
      } else if (platform === 'telegram') {
        const { default: TelegramConnection } = await import('../models/telegram-connection.model.js');
        connection = await TelegramConnection.findOne({ $or: [{ workspace_id: wsId }, { user_id: userId }], is_active: true }).lean();
        if (!connection) return res.status(400).json({ success: false, error: 'No active Telegram connection found' });
      } else {
        return res.status(400).json({ success: false, error: `Direct sending not yet supported for ${platform}` });
      }

      let fileUrlToPass = null;
      if (uploadedFile) {
        fileUrlToPass = uploadedFile.path || uploadedFile;
      } else if (mediaUrls?.length > 0) {
        fileUrlToPass = mediaUrls[0];
      } else {
        fileUrlToPass = mediaUrl;
      }

      const { default: omnichannelService } = await import('../services/messaging/omnichannel.service.js');
      const { default: Contact } = await import('../models/contact.model.js');
      const { default: Message } = await import('../models/message.model.js');

      let contact = null;
      let resolvedRecipientId = recipientId;

      if (platform === 'twitter') {
        const { default: twitterProvider } = await import('../services/messaging/providers/twitter.provider.js');
        if (recipientId && !/^\d+$/.test(recipientId)) {
          const resolved = await twitterProvider.resolveUserId(connection, recipientId);
          if (resolved) resolvedRecipientId = resolved;
        }

        contact = await Contact.findOne({ twitter_user_id: resolvedRecipientId, user_id: userId });
        if (!contact) {
          let name = recipientId;
          try {
            const profile = await twitterProvider.getUserProfileById(connection, resolvedRecipientId);
            if (profile) {
              name = profile.name || profile.username || name;
            }
          } catch (e) {
            console.error('[Direct Send] Twitter profile fetch error:', e.message);
          }
          contact = await Contact.create({
            user_id: userId,
            created_by: userId,
            workspace_id: wsId || connection.workspace_id,
            name: name,
            twitter_user_id: resolvedRecipientId,
            source: 'twitter'
          });
        }
      } else if (platform === 'telegram') {
        contact = await Contact.findOne({ telegram_chat_id: recipientId, user_id: userId });
        if (!contact) {
          contact = await Contact.create({
            user_id: userId,
            created_by: userId,
            workspace_id: wsId || connection.workspace_id,
            name: `Telegram User ${recipientId}`,
            telegram_chat_id: recipientId,
            source: 'telegram'
          });
        }
      }

      const sendResponse = await omnichannelService.sendMessage({
        platform,
        workspace_id: wsId || connection.workspace_id,
        user_id: userId,
        recipient_id: resolvedRecipientId,
        message_type: msgType,
        text: msgText,
        file_url: fileUrlToPass,
        buttons: buttonParams || buttons,
        latitude: parsedLocation?.latitude,
        longitude: parsedLocation?.longitude,
        name: parsedLocation?.name,
        address: parsedLocation?.address
      });

      const platformMessageId = sendResponse?.message_id || sendResponse?.result?.message_id;

      const newMessage = await Message.create({
        workspace_id: wsId || connection.workspace_id,
        user_id: userId,
        contact_id: contact ? contact._id : undefined,
        platform: platform,
        provider: platform,
        sender_id: platform === 'twitter' ? connection.twitter_user_id : connection.bot_id,
        recipient_id: resolvedRecipientId,
        direction: 'outbound',
        message_type: msgType,
        content: msgType === 'location' && parsedLocation ? JSON.stringify({
          latitude: parsedLocation.latitude,
          longitude: parsedLocation.longitude,
          name: parsedLocation.name,
          address: parsedLocation.address
        }) : msgText,
        file_url: fileUrlToPass,
        from_me: true,
        delivery_status: 'delivered',
        read_status: 'read',
        wa_timestamp: new Date(),
        platform_message_id: platformMessageId ? platformMessageId.toString() : undefined
      });

      const io = req.app.get('io');
      if (io && contact) {
        const formattedMessage = {
          id: newMessage._id.toString(),
          wa_message_id: newMessage.platform_message_id || newMessage._id.toString(),
          content: newMessage.content,
          interactiveData: newMessage.interactive_data || null,
          messageType: newMessage.message_type,
          fileUrl: newMessage.file_url || null,
          createdAt: newMessage.wa_timestamp,
          can_chat: true,
          delivered_at: new Date(),
          delivery_status: newMessage.delivery_status || 'delivered',
          direction: newMessage.direction,
          sender: {
            id: platform === 'twitter' ? connection.twitter_user_id : connection.bot_id,
            name: 'Agent'
          },
          recipient: {
            id: resolvedRecipientId,
            name: contact.name
          },
          user_id: newMessage.user_id?.toString(),
          contact_id: contact._id.toString(),
          platform: platform,
          provider: platform
        };
        io.emit('whatsapp:message', formattedMessage);
      }

      return res.status(200).json({
        success: true,
        message: 'Message sent successfully',
        data: newMessage
      });
    }

    if (!whatsappPhoneNumberId && whatsappPhoneNumberInput) {
      const wNumber = await WhatsappPhoneNumber.findOne({
        $or: [
          { display_phone_number: whatsappPhoneNumberInput },
          { phone_number_id: whatsappPhoneNumberInput }
        ],
        user_id: userId,
        deleted_at: null
      }).lean();
      if (wNumber) {
        whatsappPhoneNumberId = wNumber._id.toString();
      }
    }

    if (!contactId && contactNoInput) {
      const cleanedPhone = contactNoInput.replace(/[\s\-()\+]/g, '');
      if (!/^\d{6,15}$/.test(cleanedPhone)) {
        return res.status(400).json({
          success: false,
          error: 'Contact phone number must be 6-15 digits'
        });
      }

      let contact = await Contact.findOneAndUpdate(
        { phone_number: cleanedPhone, user_id: userId },
        {
          $setOnInsert: {
            phone_number: cleanedPhone,
            name: contactNoInput,
            user_id: userId,
            created_by: userId,
            status: 'lead'
          },
          $set: { deleted_at: null }
        },
        { new: true, upsert: true }
      ).lean();
      if (contact) {
        contactId = contact._id.toString();
      }
    }

    let contactDoc = null;
    if (contactId) {
      contactDoc = await Contact.findById(contactId);
    }

    if (contactDoc && ['telegram', 'facebook', 'instagram', 'twitter'].includes(contactDoc.source)) {
      try {
        const platform = contactDoc.source;

        const allowedTypes = ['text', 'image', 'video', 'document', 'audio', 'file', 'location', 'link', 'interactive', 'template', 'reaction', 'payment_link'];
        let msgType = messageType || 'text';
        if (!allowedTypes.includes(msgType)) {
          return res.status(400).json({
            success: false,
            error: `Message type '${msgType}' is not supported on ${platform}.`
          });
        }

        const isTemplate = msgType === 'template';
        if (isTemplate) {
          msgType = 'text';
        }

        let templateObj = null;
        if (isTemplate && templateIdInput) {
          try {
            templateObj = await Template.findById(templateIdInput).lean();
          } catch (err) {
            console.error('Error fetching template in sendMessage:', err);
          }
        }

        let paymentResult = null;
        if (msgType === 'payment_link') {
          if (!amount || amount <= 0) {
            return res.status(400).json({ success: false, error: 'Valid amount is required for payment_link' });
          }
          paymentResult = await paymentLinkService.sendPaymentLink({
            context: 'custom',
            context_id: new mongoose.Types.ObjectId(),
            user_id: userId,
            contact_id: contactDoc._id,
            amount,
            currency: currency || 'INR',
            description: description || 'Payment for service',
            whatsapp_phone_number_id: whatsappPhoneNumberIdInput, 
            gateway_config_id: gateway_id,
            skip_message: true, 
            metadata: {
              description: description || 'Payment for service',
              contact_id: contactDoc._id
            }
          });
          
          const amountDisplay = (amount / 100).toFixed(2);
          messageText = 
            `💳 *Payment Required*\n\n` +
            `*Description:* ${description || 'Payment for service'}\n` +
            `*Amount:* ${currency || 'INR'} ${amountDisplay}\n\n` +
            `Please complete your payment using the link below:\n` +
            `${paymentResult.payment_link}\n\n` +
            `_This link is secure and unique to you._`;
            
          msgType = 'text'; 
        }

        let workspaceId = contactDoc.workspace_id;
        let senderId = null;
        let platformMessageId = null;

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
            if (!msg.platform_message_id && !msg.wa_message_id) {
              return res.status(400).json({ success: false, error: "Cannot react: The target message has no platform ID saved." });
            }
          }
        }

        let mediaItems = [];
        if (uploadedFiles && uploadedFiles.length > 0) {
          uploadedFiles.forEach(file => {
            const mimeType = file.mimetype || '';
            let type = 'file';
            if (mimeType.startsWith('image/')) type = 'image';
            else if (mimeType.startsWith('video/')) type = 'video';
            else if (mimeType.startsWith('audio/')) type = 'audio';
            else type = 'document';
            mediaItems.push({ file, type, isUrl: false });
          });
        }
        if (parsedMediaUrls && parsedMediaUrls.length > 0) {
          parsedMediaUrls.forEach(url => {
            let type = 'file';
            const lowerUrl = url.toLowerCase();
            if (lowerUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|tiff|svg)(\?.*)?$/i)) type = 'image';
            else if (lowerUrl.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)(\?.*)?$/i)) type = 'video';
            else if (lowerUrl.match(/\.(mp3|wav|ogg|flac|aac|m4a|wma)(\?.*)?$/i)) type = 'audio';
            else type = 'document';
            mediaItems.push({ file: url, type, isUrl: true });
          });
        }

        if (mediaItems.length === 0) {
          mediaItems.push({ file: null, type: msgType, isUrl: false });
        }

        const { default: omnichannelService } = await import('../services/messaging/omnichannel.service.js');
        const { default: FacebookPage } = await import('../models/facebook-page.model.js');

        let connection = null;
        workspaceId = contactDoc.workspace_id;
        senderId = null;
        let pageId = null;
        let reply_to_comment_id = undefined;

        if (platform === 'telegram') {
          const { default: TelegramConnection } = await import('../models/telegram-connection.model.js');
          connection = await TelegramConnection.findOne({ $or: [{ workspace_id: workspaceId }, { user_id: contactDoc.user_id }], is_active: true });
          if (!connection) return res.status(400).json({ success: false, error: 'No active Telegram bot found for this contact' });
          senderId = connection.bot_id;
          workspaceId = connection.workspace_id;
        } else if (platform === 'twitter') {
          const { default: TwitterConnection } = await import('../models/twitter-connection.model.js');
          connection = await TwitterConnection.findOne({ $or: [{ workspace_id: workspaceId }, { user_id: contactDoc.user_id }], is_active: true }).lean();
          if (!connection) return res.status(400).json({ success: false, error: 'No active Twitter connection found' });
          if (!connection.access_token) return res.status(400).json({ success: false, error: 'Twitter access token not found' });
          workspaceId = workspaceId || connection.workspace_id;
        } else {
          if (platform === 'facebook') {
            const { default: FacebookConnection } = await import('../models/facebook-connection.model.js');
            connection = await FacebookConnection.findOne({ $or: [{ workspace_id: workspaceId }, { user_id: contactDoc.user_id }], is_active: true }).lean();
          } else if (platform === 'instagram') {
            const { default: InstagramConnection } = await import('../models/instagram-connection.model.js');
            connection = await InstagramConnection.findOne({ $or: [{ workspace_id: workspaceId }, { user_id: contactDoc.user_id }], is_active: true }).lean();
          }

          if (!connection) return res.status(400).json({ success: false, error: `No active ${platform} connection for this workspace` });
          workspaceId = workspaceId || connection.workspace_id;

          const lastMsg = await Message.findOne({ contact_id: contactDoc._id }).sort({ wa_timestamp: -1 }).lean();
          if (lastMsg) {
            pageId = lastMsg.direction === 'inbound' ? lastMsg.recipient_id : lastMsg.sender_id;
            if (lastMsg.platform_message_id && lastMsg.platform_message_id.startsWith('comment_')) {
              reply_to_comment_id = lastMsg.platform_message_id.replace('comment_', '');
            }
          }

          if (platform === 'facebook') {
            if (!pageId) {
              const page = connection.pages?.find(p => p.is_active !== false);
              pageId = page?.page_id;
            }
            if (!pageId) return res.status(400).json({ success: false, error: `No active Facebook Page found for this workspace` });
            senderId = pageId;
          } else if (platform === 'instagram') {
            if (!pageId) {
              pageId = connection.ig_user_id || (connection.pages && connection.pages[0]?.instagram_account_id);
            }
            if (!pageId) return res.status(400).json({ success: false, error: `No active Instagram Account found for this workspace` });

            const matchedPage = connection.pages?.find(p => p.page_id === pageId || p.instagram_account_id === pageId);
            if (matchedPage?.instagram_account_id) {
              senderId = matchedPage.instagram_account_id;
            } else {
              senderId = pageId;
            }
          }
        }

        let lastMessage = null;

        for (let i = 0; i < mediaItems.length; i++) {
          const mediaItem = mediaItems[i];
          const currentMsgType = mediaItem.file ? mediaItem.type : msgType;
          let platformMessageId = null;

          let fileUrlToPass = null;
          let dbFileUrl = null;
          if (mediaItem.file && !mediaItem.isUrl) {
            const fileObj = mediaItem.file;
            if (fileObj.buffer) {
              try {
                const { saveBufferLocally, convertAudioForMeta } = await import('../utils/whatsapp-message-handler.js');
                let localPath = await saveBufferLocally(fileObj.buffer, fileObj.mimetype, currentMsgType, userId);
                
                if (currentMsgType === 'audio' && ['facebook', 'instagram'].includes(platform)) {
                  localPath = await convertAudioForMeta(localPath);
                }
                
                fileUrlToPass = localPath;
                dbFileUrl = localPath;
              } catch (saveErr) {
                console.error('[Omnichannel Controller] Error saving uploaded file buffer:', saveErr);
                fileUrlToPass = fileObj;
                dbFileUrl = fileObj.path || fileObj.originalname;
              }
            } else {
              let localPath = fileObj.path || fileObj;
              if (currentMsgType === 'audio' && ['facebook', 'instagram'].includes(platform) && typeof localPath === 'string') {
                const { convertAudioForMeta } = await import('../utils/whatsapp-message-handler.js');
                localPath = await convertAudioForMeta(localPath);
              }
              fileUrlToPass = localPath;
              dbFileUrl = localPath;
            }
          } else if (mediaItem.file && mediaItem.isUrl) {
            fileUrlToPass = mediaItem.file;
            dbFileUrl = mediaItem.file;
          }

          if (dbFileUrl && typeof dbFileUrl === 'string' && dbFileUrl.startsWith('http')) {
            try {
              const urlObj = new URL(dbFileUrl);
              dbFileUrl = urlObj.pathname.replace(/^\//, '');
            } catch (_) { }
          }

          let buttonsToPass = buttonParams || buttons;
          let messageTextToPass = messageText;

          if (mediaItems.length > 1) {
            messageTextToPass = messageText ? `${messageText} (${i + 1}/${mediaItems.length})` : '';
            if (i > 0) buttonsToPass = undefined;
          }

          if (currentMsgType === 'interactive' && interactiveType === 'list' && listParams) {
            const listItems = listParams.items || [];
            buttonsToPass = listItems.map(item => ({
              id: item.id || item.title,
              text: item.title
            }));
            if (!messageTextToPass) {
              messageTextToPass = listParams.body || listParams.header || "Please select an option:";
            }
          }

          let currentReplyToCommentId = i === 0 ? reply_to_comment_id : undefined;

          if (platform === 'telegram') {
            const sendResponse = await omnichannelService.sendMessage({
              platform,
              workspace_id: workspaceId,
              user_id: contactDoc.user_id,
              recipient_id: contactDoc.telegram_chat_id,
              message_type: currentMsgType,
              text: messageTextToPass,
              file_url: fileUrlToPass,
              buttons: buttonsToPass,
              latitude: parsedLocation?.latitude,
              longitude: parsedLocation?.longitude,
              name: parsedLocation?.name,
              address: parsedLocation?.address,
              reaction_message_id: reactionMessageId,
              reaction_emoji: reactionEmoji
            });
            if (sendResponse) {
              platformMessageId = sendResponse.message_id || sendResponse.result?.message_id;
            }
          } else if (platform === 'twitter') {
            const sendResponse = await omnichannelService.sendMessage({
              platform,
              workspace_id: workspaceId,
              user_id: contactDoc.user_id,
              recipient_id: contactDoc.twitter_user_id || req.body.recipient_id,
              message_type: currentMsgType,
              text: messageTextToPass,
              file_url: fileUrlToPass,
              buttons: buttonsToPass
            });
            if (sendResponse) {
              platformMessageId = sendResponse.message_id || sendResponse.result?.message_id;
            }
          } else {
            const sendResponse = await omnichannelService.sendMessage({
              platform,
              workspace_id: workspaceId,
              user_id: contactDoc.user_id,
              page_id: pageId,
              recipient_id: platform === 'facebook' ? contactDoc.facebook_page_scoped_id : contactDoc.instagram_scoped_id,
              message_type: currentMsgType,
              text: messageTextToPass,
              file_url: fileUrlToPass,
              buttons: buttonsToPass,
              latitude: parsedLocation?.latitude,
              longitude: parsedLocation?.longitude,
              name: parsedLocation?.name,
              address: parsedLocation?.address,
              reaction_message_id: finalReactionMessageId,
              reaction_emoji: reactionEmoji,
              reply_to_comment_id: currentReplyToCommentId
            });

            if (sendResponse) {
              platformMessageId = sendResponse.message_id || sendResponse.result?.message_id;
            }
          }

          const interactiveDataToSave = currentMsgType === 'interactive'
            ? {
              interactiveType,
              buttons: interactiveType === 'button' ? buttonParams : undefined,
              list: interactiveType === 'list' ? listParams : undefined
            }
            : null;

          const newMessage = await Message.create({
            workspace_id: workspaceId,
            user_id: userId,
            contact_id: contactDoc._id,
            platform: platform,
            provider: platform,
            sender_id: senderId,
            recipient_id: platform === 'telegram' ? contactDoc.telegram_chat_id : (platform === 'facebook' ? contactDoc.facebook_page_scoped_id : contactDoc.instagram_scoped_id),
            direction: 'outbound',
            message_type: isTemplate ? 'template' : currentMsgType,
            template_id: isTemplate ? (templateIdInput || undefined) : undefined,
            content: currentMsgType === 'location' && parsedLocation ? JSON.stringify({
              latitude: parsedLocation.latitude,
              longitude: parsedLocation.longitude,
              name: parsedLocation.name,
              address: parsedLocation.address
            }) : messageTextToPass,
            file_url: dbFileUrl,
            interactive_data: interactiveDataToSave,
            from_me: true,
            delivery_status: 'delivered',
            read_status: 'unread',
            wa_timestamp: new Date(),
            reply_message_id: finalReplyMessageId,
            reaction_message_id: finalReactionMessageId,
            reaction_emoji: reactionEmoji,
            platform_message_id: platformMessageId ? platformMessageId.toString() : undefined
          });

          lastMessage = newMessage;

          const io = req.app.get('io');
          if (io) {
            const formattedMessage = {
              id: newMessage._id.toString(),
              wa_message_id: newMessage.platform_message_id || newMessage.wa_message_id || newMessage._id.toString(),
              reaction_message_id: newMessage.reaction_message_id || undefined,
              reaction_emoji: newMessage.reaction_emoji || undefined,
              content: newMessage.content,
              interactiveData: newMessage.interactive_data || null,
              messageType: newMessage.message_type,
              fileUrl: newMessage.file_url || null,
              template: templateObj || null,
              createdAt: newMessage.wa_timestamp,
              can_chat: true,
              delivered_at: new Date(),
              delivery_status: newMessage.delivery_status || 'delivered',
              direction: newMessage.direction || 'outbound',
              sender: {
                id: senderId,
                name: 'Agent'
              },
              recipient: {
                id: platform === 'telegram' ? contactDoc.telegram_chat_id : (platform === 'facebook' ? contactDoc.facebook_page_scoped_id : contactDoc.instagram_scoped_id),
                name: contactDoc.name
              },
              user_id: newMessage.user_id?.toString(),
              contact_id: contactDoc._id.toString(),
              platform: platform,
              provider: platform
            };
            io.emit('whatsapp:message', formattedMessage);
          }
        }

        let responseData = lastMessage;
        if (paymentResult) {
          responseData = {
            ...lastMessage.toObject(),
            payment_link: paymentResult.payment_link,
            transaction_id: paymentResult.transaction._id
          };
        }

        return res.status(200).json({
          success: true,
          message: paymentResult ? 'Payment link sent successfully' : (mediaItems.length > 1 ? `Successfully sent ${mediaItems.length} messages` : 'Message sent successfully'),
          data: responseData
        });
      } catch (err) {
        console.error(`Error sending ${contactDoc.source} message:`, err);
        let errorMessage = 'Failed to send omnichannel message';
        if (err.message) {
          errorMessage = err.message;
        } else if (err.error && err.error.description) {
          errorMessage = err.error.description;
        } else if (typeof err === 'object') {
          errorMessage = JSON.stringify(err);
        }
        return res.status(500).json({ success: false, error: errorMessage });
      }
    }

    if (!whatsappPhoneNumberId && connectionId && provider === PROVIDER_TYPES.BAILEY) {
      const phone = await WhatsappPhoneNumber.findOne({ waba_id: connectionId, deleted_at: null }).lean();
      if (phone) whatsappPhoneNumberId = phone._id.toString();
    }

    if (!contactId || !whatsappPhoneNumberId) {
      return res.status(400).json({
        success: false,
        error: 'Contact (ID or Phone Number) and WhatsApp Phone Number (ID or Number) are required'
      });
    }

    let whatsappPhoneNumber = null;
    if (req.user.role === 'agent') {
      const contact = await Contact.findById(contactId);
      if (!contact) {
        return res.status(404).json({ success: false, error: 'Contact not found' });
      }
      const allowed = await getAgentAllowedPhoneNumber(req.user.id, contact.phone_number, whatsappPhoneNumberId);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          error: 'You do not have access to this chat. Replies must use the same whatsapp_phone_number_id as the assigned chat.'
        });
      }
      whatsappPhoneNumber = allowed;
    }


    if (totalMediaCount > 1) {
      const contact = await Contact.findById(contactId);
      return await sendMultipleMediaUrls({
        userId: senderId,
        contact,
        whatsappPhoneNumber,
        mediaUrls,
        messageText,
        providerType: provider,
        connectionId
      }, res);
    }

    if (messageType === 'payment_link') {
      if (!amount || amount <= 0) {
        return res.status(400).json({ success: false, error: 'Valid amount is required for payment_link' });
      }
      const result = await paymentLinkService.sendPaymentLink({
        context: 'custom',
        context_id: new mongoose.Types.ObjectId(),
        user_id: userId,
        contact_id: contactId,
        amount,
        currency,
        description: description || 'Payment for service',
        whatsapp_phone_number_id: whatsappPhoneNumberId,
        gateway_config_id: gateway_id,
        metadata: {
          description: description || 'Payment for service',
          contact_id: contactId
        }
      });

      return res.json({
        success: true,
        message: 'Payment link sent successfully',
        data: {
          payment_link: result.payment_link,
          transaction_id: result.transaction._id
        }
      });
    }

    const result = await unifiedWhatsAppService.sendMessage(senderId, {
      contactId,
      whatsappPhoneNumberId,
      whatsappPhoneNumber,
      messageText,
      file: uploadedFile,
      messageType,
      interactiveType,
      buttonParams,
      listParams,
      templateName,
      languageCode,
      templateComponents: templateComponentsInput,
      templateVariables,
      providerType: provider,
      connectionId,
      mediaUrl: uploadedFile ? uploadedFile.path : ((mediaUrls && mediaUrls.length === 1) ? mediaUrls[0] : mediaUrl),
      locationParams: messageType === 'location' && parsedLocation ? {
        latitude: parsedLocation.latitude,
        longitude: parsedLocation.longitude,
        name: parsedLocation.name || undefined,
        address: parsedLocation.address || undefined
      } : undefined,
      replyMessageId,
      reactionMessageId,
      reactionEmoji,
      couponCode: coupon_code,
      carouselCardsData: resolvedCarouselCardsData,
      carouselProducts,
      templateId: templateIdInput || undefined
    });

    let messageId = result.id || result.messageId;

    if (!messageId) {
      return res.json({
        success: true,
        message: 'Message sent successfully',
        data: result
      });
    }

    const savedMessage = await Message.findById(messageId).lean();

    if (!savedMessage) {
      return res.json({
        success: true,
        message: 'Message sent successfully',
        data: result
      });
    }

    const formattedResponse = {
      id: savedMessage._id.toString(),
      sender_number: savedMessage.sender_number,
      recipient_number: savedMessage.recipient_number,
      content: savedMessage.content,
      message_type: savedMessage.message_type,
      file_url: savedMessage.file_url,
      file_type: savedMessage.file_type,
      wa_jid: savedMessage.wa_jid,
      from_me: savedMessage.from_me,
      direction: savedMessage.direction,
      wa_message_id: savedMessage.wa_message_id,
      wa_timestamp: savedMessage.wa_timestamp,
      is_delivered: savedMessage.is_delivered,
      is_seen: savedMessage.is_seen,
      delivery_status: savedMessage.delivery_status || 'sent',
      wa_status: savedMessage.wa_status || 'sent',
      provider: savedMessage.provider,
      reply_message_id: savedMessage.reply_message_id,
      reaction_message_id: savedMessage.reaction_message_id,
      created_at: savedMessage.created_at,
      updated_at: savedMessage.updated_at
    };

    return res.json({
      success: true,
      message: 'Message sent successfully',
      data: formattedResponse
    });
  } catch (error) {
    console.error('Error sending message:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send message',
      details: error.message
    });
  }
};



export const getContactProfile = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    let { contact_id: contactId, whatsapp_phone_number_id: whatsappPhoneNumberId } = req.query;

    if (whatsappPhoneNumberId === 'null' || whatsappPhoneNumberId === 'undefined' || !whatsappPhoneNumberId) {
      whatsappPhoneNumberId = null;
    }

    if (!contactId || contactId === 'null' || contactId === 'undefined') {
      return res.status(400).json({
        success: false,
        error: 'Contact ID is required'
      });
    }

    const contact = await Contact.findById(contactId).populate('assigned_call_agent_id', 'name');
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    let resolvedWhatsappPhoneNumberId = whatsappPhoneNumberId;
    if (!resolvedWhatsappPhoneNumberId) {
      const lastMsg = await Message.findOne({ contact_id: contactId }).sort({ created_at: -1 }).lean();
      if (lastMsg) {
        if (['facebook', 'instagram', 'telegram'].includes(lastMsg.platform)) {
          const contactIdentifier = contact.phone_number || contact.telegram_chat_id || contact.instagram_scoped_id || contact.facebook_page_scoped_id;
          resolvedWhatsappPhoneNumberId = (lastMsg.sender_id === contactIdentifier || lastMsg.sender_number === contactIdentifier) ? (lastMsg.recipient_id || lastMsg.recipient_number) : (lastMsg.sender_id || lastMsg.sender_number);
        } else if (lastMsg.whatsapp_phone_number_id) {
          resolvedWhatsappPhoneNumberId = lastMsg.whatsapp_phone_number_id.toString();
        }
      }

      if (!resolvedWhatsappPhoneNumberId) {
        const primaryPhoneNumber = await WhatsappPhoneNumber.findOne({
          user_id: userId,
          is_primary: true,
          is_active: true,
          deleted_at: null
        }).lean();

        if (primaryPhoneNumber) {
          resolvedWhatsappPhoneNumberId = primaryPhoneNumber._id.toString();
        } else {
          const tg = await TelegramConnection.findOne({ user_id: userId, is_active: true }).lean();
          if (tg) {
            resolvedWhatsappPhoneNumberId = tg._id.toString();
          } else {
            const ig = await InstagramConnection.findOne({ user_id: userId, is_active: true }).lean();
            if (ig) {
              resolvedWhatsappPhoneNumberId = ig._id.toString();
            } else {
              const fb = await FacebookConnection.findOne({ user_id: userId, is_active: true }).lean();
              if (fb) {
                resolvedWhatsappPhoneNumberId = fb._id.toString();
              }
            }
          }
        }
      }

      if (!resolvedWhatsappPhoneNumberId) {
        return res.status(400).json({
          success: false,
          error: 'No active connection found.'
        });
      }
    }

    let isTelegram = false;
    let isInstagram = false;
    let isFacebook = false;
    let activeConnection = null;
    let myPhoneNumber = null;

    let whatsappPhoneNumber = null;
    if (mongoose.Types.ObjectId.isValid(resolvedWhatsappPhoneNumberId)) {
      whatsappPhoneNumber = await WhatsappPhoneNumber.findById(resolvedWhatsappPhoneNumberId)
        .populate('waba_id')
        .lean();
    }

    if (whatsappPhoneNumber && whatsappPhoneNumber.waba_id) {
      myPhoneNumber = whatsappPhoneNumber.display_phone_number;
    } else {
      const isObjectId = mongoose.Types.ObjectId.isValid(resolvedWhatsappPhoneNumberId);
      const tg = await TelegramConnection.findOne({
        $or: [
          ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(resolvedWhatsappPhoneNumberId) }] : []),
          { bot_id: resolvedWhatsappPhoneNumberId }
        ]
      });
      if (tg) {
        isTelegram = true;
        activeConnection = tg;
        myPhoneNumber = tg.bot_id;
      } else {
        const ig = await InstagramConnection.findOne({
          $or: [
            ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(resolvedWhatsappPhoneNumberId) }] : []),
            { ig_user_id: resolvedWhatsappPhoneNumberId },
            { "pages.instagram_account_id": resolvedWhatsappPhoneNumberId }
          ]
        });
        if (ig) {
          isInstagram = true;
          activeConnection = ig;
          const page = (ig.pages || []).find(p => p.instagram_account_id === resolvedWhatsappPhoneNumberId || ig._id.toString() === resolvedWhatsappPhoneNumberId);
          myPhoneNumber = page ? page.instagram_account_id : ig.ig_user_id;
        } else {
          const fb = await FacebookConnection.findOne({
            $or: [
              ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(resolvedWhatsappPhoneNumberId) }] : []),
              { fb_user_id: resolvedWhatsappPhoneNumberId },
              { "pages.page_id": resolvedWhatsappPhoneNumberId }
            ]
          });
          if (fb) {
            isFacebook = true;
            activeConnection = fb;
            const page = (fb.pages || []).find(p => p.page_id === resolvedWhatsappPhoneNumberId || fb._id.toString() === resolvedWhatsappPhoneNumberId);
            myPhoneNumber = page ? page.page_id : fb.fb_user_id;
          }
        }
      }

      if (!activeConnection) {
        return res.status(404).json({
          success: false,
          error: 'Connection not found'
        });
      }
    }

    const notesQuery = {
      contact_id: contactId,
      deleted_at: null
    };
    if (resolvedWhatsappPhoneNumberId && mongoose.Types.ObjectId.isValid(resolvedWhatsappPhoneNumberId)) {
      notesQuery.whatsapp_phone_number_id = resolvedWhatsappPhoneNumberId;
    }

    const notes = await ChatNote.find(notesQuery)
      .select('note created_at')
      .lean();


    let allMessages = await Message.find({
      contact_id: contact._id,
      deleted_at: null,
      message_type: { $in: ['image', 'audio', 'video', 'document', 'location'] }
    }).lean();

    const contactIdentifier = contact.phone_number || contact.telegram_chat_id || contact.instagram_scoped_id || contact.facebook_page_scoped_id;

    if (allMessages.length === 0 && contactIdentifier && myPhoneNumber) {
      allMessages = await Message.find({
        $or: [
          { sender_number: contactIdentifier, recipient_number: myPhoneNumber },
          { sender_number: myPhoneNumber, recipient_number: contactIdentifier },
          { sender_id: contactIdentifier, recipient_id: myPhoneNumber },
          { sender_id: myPhoneNumber, recipient_id: contactIdentifier }
        ],
        user_id: userId,
        deleted_at: null,
        message_type: { $in: ['image', 'audio', 'video', 'document', 'location'] }
      }).lean();
    }

    if (allMessages.length === 0 && contactIdentifier && myPhoneNumber) {
      allMessages = await Message.find({
        $or: [
          { sender_number: contactIdentifier, recipient_number: myPhoneNumber },
          { sender_number: myPhoneNumber, recipient_number: contactIdentifier },
          { sender_id: contactIdentifier, recipient_id: myPhoneNumber },
          { sender_id: myPhoneNumber, recipient_id: contactIdentifier }
        ],
        deleted_at: null,
        message_type: { $in: ['image', 'audio', 'video', 'document', 'location'] }
      }).lean();
      console.log('Found media messages without user_id filter:', allMessages.length);
    }

    if (allMessages.length === 0 && contactIdentifier && myPhoneNumber) {
      const allConversationMessages = await Message.find({
        $or: [
          { sender_number: contactIdentifier, recipient_number: myPhoneNumber },
          { sender_number: myPhoneNumber, recipient_number: contactIdentifier },
          { sender_id: contactIdentifier, recipient_id: myPhoneNumber },
          { sender_id: myPhoneNumber, recipient_id: contactIdentifier }
        ],
        deleted_at: null
      }).lean();

      allMessages = allConversationMessages.filter(msg =>
        ['image', 'video', 'audio', 'document', 'location'].includes(msg.message_type)
      );
      console.log('Found media messages by filtering conversation:', allMessages.length);
    }

    console.log('Final found media messages:', allMessages.length);

    const mediaByWeeks = groupMediaByWeeks(allMessages);

    console.log('Media grouped by weeks:', Object.keys(mediaByWeeks));

    const tagIds = contact.tags || [];
    const tags = tagIds.length > 0
      ? await Tag.find({
        _id: { $in: tagIds },
        deleted_at: null
      }).select('label color created_at')
        .lean()
      : [];

    let assignedAgentId = null;
    if (myPhoneNumber && resolvedWhatsappPhoneNumberId) {
      const chatMatch = {
        $or: [
          { sender_number: contactIdentifier, receiver_number: myPhoneNumber },
          { sender_number: myPhoneNumber, receiver_number: contactIdentifier }
        ]
      };
      const statusMatch = { $or: [{ status: 'assigned' }, { status: { $exists: false } }] };

      const assignmentQuery = { $and: [chatMatch, statusMatch] };
      if (mongoose.Types.ObjectId.isValid(resolvedWhatsappPhoneNumberId)) {
        assignmentQuery.whatsapp_phone_number_id = resolvedWhatsappPhoneNumberId;
      }

      const assignment = await ChatAssignment.findOne(assignmentQuery)
        .sort({ created_at: -1 })
        .populate('agent_id', 'name email phone')
        .lean();


      if (assignment && assignment.agent_id) {
        assignedAgentId = assignment.agent_id;
      }
    }

    let displayName = contact.name || contact.phone_number || contact.telegram_chat_id || contact.instagram_scoped_id || contact.facebook_page_scoped_id || "";
    if (contact.source === 'whatsapp' || contact.source === 'baileys') {
      if (!contact.name || contact.name.trim() === "" || contact.name.trim() === contact.phone_number) {
        displayName = contact.phone_number;
      } else {
        displayName = contact.name;
      }
    }

    return res.json({
      success: true,
      contact: {
        _id: contact._id.toString(),
        name: contact.name,
        phone_number: displayName,
        email: contact.email,
        status: contact.status,
        chat_status: contact.chat_status,
        created_at: contact.created_at,
        updated_at: contact.updated_at
      },
      tags: tags,
      notes: notes.map(note => ({
        id: note._id,
        note: note.note,
        created_at: note.created_at
      })),
      media: mediaByWeeks,
      assigned_agent: assignedAgentId,
      assigned_call_agent: contact.assigned_call_agent_id
    });
  } catch (error) {
    console.error('Error retrieving contact profile:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve contact profile',
      details: error.message
    });
  }
};


const groupMediaByWeeks = (messages) => {
  const media = {
    images: [],
    audios: [],
    videos: [],
    documents: [],
    locations: []
  };

  const weekGroups = {};

  messages.forEach((message) => {
    const messageType = message.message_type || message.messageType;
    if (['image', 'audio', 'video', 'document', 'location'].includes(messageType)) {
      let fileUrl = message.file_url || message.fileUrl || '';
      if (messageType === 'location' && message.content) {
        try {
          const loc = typeof message.content === 'string' ? JSON.parse(message.content) : message.content;
          if (loc && loc.latitude && loc.longitude) {
            fileUrl = `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
          }
        } catch (e) {
          console.error('[groupMediaByWeeks] Failed to parse location content:', e);
        }
      }

      const mediaPayload = {
        id: message._id.toString(),
        messageType: messageType,
        fileUrl: fileUrl,
        createdAt: message.wa_timestamp || message.createdAt || message.created_at,
        senderNumber: message.sender_number,
        recipientNumber: message.recipient_number,
        metadata: message.metadata
      };

      const messageDate = new Date(message.wa_timestamp || message.createdAt || message.created_at);
      if (isNaN(messageDate.getTime())) {
        console.log('Invalid date for message:', message._id, message.createdAt);
        return;
      }
      const year = messageDate.getFullYear();
      const weekNumber = getWeekNumber(messageDate);
      const weekKey = `${year}-W${weekNumber.toString().padStart(2, '0')}`;

      if (!weekGroups[weekKey]) {
        weekGroups[weekKey] = {
          week: weekKey,
          startDate: getStartDateOfWeek(year, weekNumber),
          endDate: getEndDateOfWeek(year, weekNumber),
          images: [],
          audios: [],
          videos: [],
          documents: [],
          locations: []
        };
      }

      switch (messageType) {
        case 'image':
          weekGroups[weekKey].images.push(mediaPayload);
          break;
        case 'audio':
          weekGroups[weekKey].audios.push(mediaPayload);
          break;
        case 'video':
          weekGroups[weekKey].videos.push(mediaPayload);
          break;
        case 'document':
          weekGroups[weekKey].documents.push(mediaPayload);
          break;
        case 'location':
          weekGroups[weekKey].locations.push(mediaPayload);
          break;
      }
    }
  });

  return weekGroups;
};


const getWeekNumber = (date) => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  console.log(`Date: ${date.toISOString()}, Week Number: ${weekNumber}`);
  return weekNumber;
};


const getStartDateOfWeek = (year, weekNumber) => {
  const januaryFirst = new Date(year, 0, 1);
  const daysOffset = (weekNumber - 1) * 7;
  const startDate = new Date(januaryFirst);
  startDate.setDate(januaryFirst.getDate() + daysOffset - januaryFirst.getDay() + 1);
  return startDate;
};


const getEndDateOfWeek = (year, weekNumber) => {
  const startDate = getStartDateOfWeek(year, weekNumber);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  return endDate;
};


const parseDate = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

export const getMessages = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    console.log("userId", userId);
    let { contact_id: contactId, whatsapp_phone_number_id: whatsappPhoneNumberId, provider, connection_id, search, start_date, end_date } = req.query;

    if (whatsappPhoneNumberId === 'null' || whatsappPhoneNumberId === 'undefined' || !whatsappPhoneNumberId) {
      whatsappPhoneNumberId = null;
    }

    if (!contactId || contactId === 'null' || contactId === 'undefined') {
      return res.status(400).json({
        success: false,
        error: 'Contact ID is required'
      });
    }

    const contact = await Contact.findById(contactId);
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    // Mark inbound messages as read for this contact
    const unreadMessages = await Message.find({
      contact_id: contact._id,
      direction: 'inbound',
      deleted_at: null,
      $or: [
        { is_seen: false },
        { read_status: 'unread' }
      ]
    }).lean();

    if (unreadMessages.length > 0) {
      await Message.updateMany(
        { _id: { $in: unreadMessages.map(m => m._id) } },
        {
          $set: {
            is_seen: true,
            seen_at: new Date(),
            read_status: 'read'
          }
        }
      );

      const io = req.app.get('io');
      if (io) {
        unreadMessages.forEach(m => {
          io.emit('whatsapp:status', {
            id: m._id.toString(),
            wa_message_id: m.wa_message_id,
            is_seen: true,
            seen_at: new Date(),
            read_status: 'read',
            direction: 'inbound',
            sender: { id: m.sender_number, name: m.sender_number },
            recipient: { id: m.recipient_number, name: m.recipient_number },
            user_id: m.user_id?.toString(),
            contact_id: m.contact_id?.toString(),
            whatsapp_phone_number_id: m.whatsapp_connection_id?.toString() || whatsappPhoneNumberId
          });
        });
      }
    }

    if (contact.source && ['telegram', 'facebook', 'instagram'].includes(contact.source)) {
      let activeConnection = null;
      const connectionIdToUse = connection_id && connection_id !== 'null' && connection_id !== 'undefined' ? connection_id : whatsappPhoneNumberId;
      
      if (connectionIdToUse && connectionIdToUse !== 'null' && connectionIdToUse !== 'undefined') {
        const isObjectId = mongoose.Types.ObjectId.isValid(connectionIdToUse);
        if (contact.source === 'telegram') {
          activeConnection = await TelegramConnection.findOne({
            $or: [
              ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(connectionIdToUse) }] : []),
              { bot_id: connectionIdToUse }
            ]
          });
        } else if (contact.source === 'instagram') {
          activeConnection = await InstagramConnection.findOne({
            $or: [
              ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(connectionIdToUse) }] : []),
              { ig_user_id: connectionIdToUse },
              { "pages.instagram_account_id": connectionIdToUse }
            ]
          });
        } else if (contact.source === 'facebook') {
          activeConnection = await FacebookConnection.findOne({
            $or: [
              ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(connectionIdToUse) }] : []),
              { fb_user_id: connectionIdToUse },
              { "pages.page_id": connectionIdToUse }
            ]
          });
        }
      }
      
      if (!activeConnection) {
        if (contact.source === 'telegram') {
          activeConnection = await TelegramConnection.findOne({ user_id: userId, is_active: true });
        } else if (contact.source === 'instagram') {
          activeConnection = await InstagramConnection.findOne({ user_id: userId, is_active: true });
        } else if (contact.source === 'facebook') {
          activeConnection = await FacebookConnection.findOne({ user_id: userId, is_active: true });
        }
      }

      const startDate = parseDate(start_date);
      const endDate = end_date ? (() => {
        const d = parseDate(end_date);
        if (!d) return null;
        d.setHours(23, 59, 59, 999);
        return d;
      })() : null;

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 30;
      const skip = (page - 1) * limit;

      const query = {
        contact_id: contact._id,
        deleted_at: null
      };

      if (activeConnection) {
        let platformIds = [];
        if (contact.source === 'telegram') {
          if (activeConnection.bot_id) platformIds.push(activeConnection.bot_id);
        } else if (contact.source === 'facebook') {
          if (activeConnection.pages) {
            platformIds.push(...activeConnection.pages.map(p => p.page_id).filter(Boolean));
          }
        } else if (contact.source === 'instagram') {
          if (activeConnection.ig_user_id) platformIds.push(activeConnection.ig_user_id);
          if (activeConnection.global_instagram_account_id) platformIds.push(activeConnection.global_instagram_account_id);
          if (activeConnection.pages) {
            platformIds.push(...activeConnection.pages.map(p => p.instagram_account_id).filter(Boolean));
          }
        }
        
        if (platformIds.length > 0) {
          query.$or = [{ sender_id: { $in: platformIds } }, { recipient_id: { $in: platformIds } }];
        }
      }

      if (search && String(search).trim()) {
        query.content = { $regex: String(search).trim(), $options: 'i' };
      }

      if (startDate || endDate) {
        query.wa_timestamp = {};
        if (startDate) query.wa_timestamp.$gte = startDate;
        if (endDate) query.wa_timestamp.$lte = endDate;
      }

      const messages = await Message.find(query)
        .sort({ wa_timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .populate('user_id', 'name')
        .populate('template_id')
        .populate('submission_id')
        .lean();

      const reversedMessages = messages.reverse();
      const total = await Message.countDocuments(query);

      let canChat = true;
      const lastInboundMessage = await Message.findOne({
        contact_id: contact._id,
        direction: 'inbound',
        deleted_at: null
      }).sort({ wa_timestamp: -1 }).lean();

      if (lastInboundMessage) {
        const lastMessageTime = new Date(lastInboundMessage.wa_timestamp);
        const timeDifference = new Date() - lastMessageTime;
        canChat = timeDifference < 24 * 60 * 60 * 1000;
      }

      const enrichedMessages = reversedMessages.map(message => ({
        ...message,
        can_chat: canChat,
        contact_id: contact._id.toString()
      }));

      const baseMessages = enrichedMessages.filter(m => m.message_type !== 'reaction' && !(m.message_type === 'system_messages' && m.content === 'Chat cleared'));
      const reactionMessages = enrichedMessages.filter(m => m.message_type === 'reaction');

      const reactionsMap = {};
      reactionMessages.forEach(rm => {
        const targetId = rm.reaction_message_id;
        if (targetId) {
          if (!reactionsMap[targetId]) {
            reactionsMap[targetId] = [];
          }

          const userId = rm.direction === 'outbound' ? 'current-user' : (rm.sender_id || rm.sender_number);
          const userName = rm.direction === 'outbound' ? 'You' : (contact ? contact.name : (rm.sender_id || rm.sender_number));
          let emoji = rm.reaction_emoji !== undefined ? rm.reaction_emoji : rm.content;

          reactionsMap[targetId] = reactionsMap[targetId].filter(r => {
            r.users = r.users.filter(u => u.id !== userId);
            return r.users.length > 0;
          });

          if (emoji && emoji.trim() !== '') {
            let existingReaction = reactionsMap[targetId].find(r => r.emoji === emoji);
            if (existingReaction) {
              existingReaction.users.push({ id: userId, name: userName });
            } else {
              reactionsMap[targetId].push({
                emoji: emoji,
                users: [{ id: userId, name: userName }]
              });
            }
          }
        }
      });

      const groupedMessages = groupMessagesByDateAndSender(baseMessages, {}, reactionsMap, contact, activeConnection);

      return res.json({
        success: true,
        messages: Object.values(groupedMessages),
        pagination: {
          total,
          page,
          limit,
          hasMore: total > skip + messages.length
        }
      });
    }

    let resolvedWhatsappPhoneNumberId = whatsappPhoneNumberId;
    if (!resolvedWhatsappPhoneNumberId) {
      if (req.user.role === 'agent') {
        return res.status(400).json({
          success: false,
          error: 'whatsapp_phone_number_id is required for agents (use the phone number of the assigned chat).'
        });
      }
      const primaryPhoneNumber = await WhatsappPhoneNumber.findOne({
        user_id: userId,
        is_primary: true,
        is_active: true,
        deleted_at: null
      }).lean();

      if (!primaryPhoneNumber) {
        return res.status(400).json({
          success: false,
          error: 'No primary phone number found. Please set a primary phone number or provide a WhatsApp Phone Number ID.'
        });
      }

      resolvedWhatsappPhoneNumberId = primaryPhoneNumber._id.toString();
    }

    let whatsappPhoneNumber = null;
    if (mongoose.Types.ObjectId.isValid(resolvedWhatsappPhoneNumberId)) {
      whatsappPhoneNumber = await WhatsappPhoneNumber.findById(resolvedWhatsappPhoneNumberId)
        .populate('waba_id')
        .lean();
    }

    if (!whatsappPhoneNumber || !whatsappPhoneNumber.waba_id) {
      return res.status(404).json({
        success: false,
        error: 'WhatsApp Phone Number not found'
      });
    }

    if (req.user.role === 'agent') {
      const allowed = await getAgentAllowedPhoneNumber(req.user.id, contact.phone_number, resolvedWhatsappPhoneNumberId);
      if (!allowed) {
        return res.status(403).json({
          success: false,
          error: 'You do not have access to this chat. Use the same whatsapp_phone_number_id as the assigned chat.'
        });
      }
      whatsappPhoneNumber = allowed;
    }

    const providerType = provider || null;
    const connectionId = connection_id || null;

    const startDate = parseDate(start_date);
    const endDate = end_date ? (() => {
      const d = parseDate(end_date);
      if (!d) return null;
      d.setHours(23, 59, 59, 999);
      return d;
    })() : null;

    const { page, limit } = parsePaginationParams({ ...req.query, limit: req.query.limit || 30 });

    const messagesResult = await unifiedWhatsAppService.getMessages(
      userId,
      contact.phone_number,
      providerType,
      connectionId,
      whatsappPhoneNumber,
      {
        search: search && String(search).trim() ? String(search).trim() : null,
        start_date: startDate,
        end_date: endDate,
        page,
        limit
      }
    );

    const messages = messagesResult.data || [];
    const pagination = messagesResult.pagination || { total: 0, page, limit, hasMore: false };

    let canChat = true;
    const lastInboundMessage = await Message.findOne({
      contact_id: contact._id,
      direction: 'inbound',
      deleted_at: null
    }).sort({ wa_timestamp: -1 }).lean();

    if (lastInboundMessage) {
      const lastMessageTime = new Date(lastInboundMessage.wa_timestamp);
      const timeDifference = new Date() - lastMessageTime;
      canChat = timeDifference < 24 * 60 * 60 * 1000;
    }

    messages.forEach(m => {
      m.can_chat = canChat;
    });

    const replyIds = [...new Set(messages.map(m => m.reply_message_id).filter(id => !!id))];
    const replyMessagesMap = {};
    if (replyIds.length > 0) {
      const replyMessages = await Message.find({ wa_message_id: { $in: replyIds } })
        .populate('submission_id')
        .lean();
      replyMessages.forEach(rm => {
        replyMessagesMap[rm.wa_message_id] = {
          id: rm._id.toString(),
          content: rm.content,
          interactiveData: rm.interactive_data,
          messageType: rm.message_type,
          fileUrl: rm.file_url || null,
          template: rm.template_id || null,
          createdAt: rm.wa_timestamp,
          delivered_at: rm.delivered_at || null,
          delivery_status: rm.delivery_status || 'pending',
          is_delivered: rm.is_delivered || false,
          is_seen: rm.is_seen || false,
          seen_at: rm.seen_at || null,
          wa_status: rm.wa_status || null,
          wa_message_id: rm.wa_message_id || null,
          direction: rm.direction || null,
          sender: {
            id: rm.sender_number,
            name: rm.sender_number
          },
          recipient: {
            id: rm.recipient_number,
            name: rm.recipient_number
          },
          submission_id: rm.submission_id?._id || rm.submission_id || null,
          fields: rm.submission_id?.fields || []
        };
      });
    }

    const baseMessages = messages.filter(m => m.message_type !== 'reaction' && !(m.message_type === 'system_messages' && m.content === 'Chat cleared'));
    const reactionMessages = messages.filter(m => m.message_type === 'reaction');

    const reactionsMap = {};
    reactionMessages.forEach(rm => {
      const targetId = rm.reaction_message_id;
      if (targetId) {
        if (!reactionsMap[targetId]) {
          reactionsMap[targetId] = [];
        }

        const userId = rm.direction === 'outbound' ? 'current-user' : (rm.sender_id || rm.sender_number);
        const userName = rm.direction === 'outbound' ? 'You' : (contact ? contact.name : (rm.sender_id || rm.sender_number));
        let emoji = rm.reaction_emoji !== undefined ? rm.reaction_emoji : rm.content;

        reactionsMap[targetId] = reactionsMap[targetId].filter(r => {
          r.users = r.users.filter(u => u.id !== userId);
          return r.users.length > 0;
        });

        if (emoji && emoji.trim() !== '') {
          let existingReaction = reactionsMap[targetId].find(r => r.emoji === emoji);
          if (existingReaction) {
            existingReaction.users.push({ id: userId, name: userName });
          } else {
            reactionsMap[targetId].push({
              emoji: emoji,
              users: [{ id: userId, name: userName }]
            });
          }
        }
      }
    });

    const groupedMessages = groupMessagesByDateAndSender(baseMessages, replyMessagesMap, reactionsMap, contact, whatsappPhoneNumber);


    return res.json({
      success: true,
      messages: Object.values(groupedMessages),
      pagination
    });
  } catch (error) {
    console.error('Error retrieving messages:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve messages',
      details: error.message
    });
  }
};

export const togglePinChat = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { contact_id: contactId, phone_number: phoneNumber } = req.body;

    if (!contactId && !phoneNumber) {
      return res.status(400).json({
        success: false,
        error: 'contact_id or phone_number is required'
      });
    }

    let contact = null;

    if (contactId) {
      contact = await Contact.findById(contactId);
    } else if (phoneNumber) {
      contact = await Contact.findOne({
        phone_number: phoneNumber,
        created_by: userId,
        deleted_at: null
      });
    }

    if (!contact || contact.deleted_at) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    contact.is_pinned = !contact.is_pinned;
    await contact.save();

    return res.json({
      success: true,
      data: {
        id: contact._id.toString(),
        is_pinned: contact.is_pinned
      }
    });
  } catch (error) {
    console.error('Error toggling pinned chat:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to toggle pinned chat',
      details: error.message
    });
  }
};

const parseRecentChatsDate = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

export const getRecentChats = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    let {
      provider,
      platform,
      whatsapp_phone_number_id: whatsappPhoneNumberId,
      search,
      tags: tagsParam,
      has_notes,
      last_message_read,
      start_date: startDateParam,
      end_date: endDateParam,
      is_assigned: isAssignedParam,
      agent_id: agentIdParam
    } = req.query;

    if (whatsappPhoneNumberId === 'null' || whatsappPhoneNumberId === 'undefined' || !whatsappPhoneNumberId) {
      whatsappPhoneNumberId = null;
    }

    let isTelegram = false;
    let isInstagram = false;
    let isFacebook = false;
    let isTwitter = false;
    let activeConnection = null;

    if (whatsappPhoneNumberId) {
      const isObjectId = mongoose.Types.ObjectId.isValid(whatsappPhoneNumberId);
      const tg = await TelegramConnection.findOne({
        $or: [
          ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(whatsappPhoneNumberId) }] : []),
          { bot_id: whatsappPhoneNumberId }
        ]
      });
      if (tg) {
        isTelegram = true;
        activeConnection = tg;
      } else {
        const ig = await InstagramConnection.findOne({
          $or: [
            ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(whatsappPhoneNumberId) }] : []),
            { ig_user_id: whatsappPhoneNumberId },
            { "pages.instagram_account_id": whatsappPhoneNumberId }
          ]
        });
        if (ig) {
          isInstagram = true;
          activeConnection = ig;
        } else {
          const fb = await FacebookConnection.findOne({
            $or: [
              ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(whatsappPhoneNumberId) }] : []),
              { fb_user_id: whatsappPhoneNumberId },
              { "pages.page_id": whatsappPhoneNumberId }
            ]
          });
          if (fb) {
            isFacebook = true;
            activeConnection = fb;
          } else {
            const tw = await TwitterConnection.findOne({
              $or: [
                ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(whatsappPhoneNumberId) }] : []),
                { twitter_user_id: whatsappPhoneNumberId }
              ]
            });
            if (tw) {
              isTwitter = true;
              activeConnection = tw;
            }
          }
        }
      }
    }

    const providerType = provider || null;
    let targetPlatform = platform || providerType;
    if (isTelegram) targetPlatform = 'telegram';
    if (isInstagram) targetPlatform = 'instagram';
    if (isFacebook) targetPlatform = 'facebook';
    if (isTwitter) targetPlatform = 'twitter';

    const isOmnichannel = ['telegram', 'facebook', 'instagram', 'twitter'].includes(targetPlatform) || isTelegram || isInstagram || isFacebook || isTwitter;

    if (isOmnichannel || (!whatsappPhoneNumberId && !providerType)) {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 15;
      const skip = (page - 1) * limit;

      const matchQuery = {
        user_id: new mongoose.Types.ObjectId(userId),
        message_type: { $ne: 'reaction' },
        deleted_at: null
      };

      if (targetPlatform && ['telegram', 'facebook', 'instagram', 'whatsapp'].includes(targetPlatform)) {
        if (targetPlatform === 'whatsapp') {
          matchQuery.platform = { $nin: ['telegram', 'facebook', 'instagram'] };
        } else {
          matchQuery.platform = targetPlatform;
        }
      }

      if (isTelegram && whatsappPhoneNumberId) {
        const isObjectId = mongoose.Types.ObjectId.isValid(whatsappPhoneNumberId);
        const tg = activeConnection || await TelegramConnection.findOne({
          $or: [
            ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(whatsappPhoneNumberId) }] : []),
            { bot_id: whatsappPhoneNumberId }
          ]
        });
        if (tg) {
          const botId = tg.bot_id;
          matchQuery.$or = [
            { sender_id: botId },
            { recipient_id: botId }
          ];
        }
      } else if (isInstagram && whatsappPhoneNumberId) {
        const isObjectId = mongoose.Types.ObjectId.isValid(whatsappPhoneNumberId);
        const ig = activeConnection || await InstagramConnection.findOne({
          $or: [
            ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(whatsappPhoneNumberId) }] : []),
            { ig_user_id: whatsappPhoneNumberId },
            { "pages.instagram_account_id": whatsappPhoneNumberId }
          ]
        });
        if (ig) {
          const page = (ig.pages || []).find(p => p.instagram_account_id === whatsappPhoneNumberId || ig._id.toString() === whatsappPhoneNumberId);
          const targetId = page ? page.instagram_account_id : whatsappPhoneNumberId;
          const globalId = ig.global_instagram_account_id;
          matchQuery.$or = [
            { sender_id: targetId },
            { recipient_id: targetId }
          ];
          if (globalId) {
            matchQuery.$or.push({ sender_id: globalId }, { recipient_id: globalId });
          }
        }
      } else if (isFacebook && whatsappPhoneNumberId) {
        const isObjectId = mongoose.Types.ObjectId.isValid(whatsappPhoneNumberId);
        const fb = activeConnection || await FacebookConnection.findOne({
          $or: [
            ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(whatsappPhoneNumberId) }] : []),
            { fb_user_id: whatsappPhoneNumberId },
            { "pages.page_id": whatsappPhoneNumberId }
          ]
        });
        if (fb) {
          const page = (fb.pages || []).find(p => p.page_id === whatsappPhoneNumberId || fb._id.toString() === whatsappPhoneNumberId);
          const targetId = page ? page.page_id : whatsappPhoneNumberId;
          matchQuery.$or = [
            { sender_id: targetId },
            { recipient_id: targetId }
          ];
        }
      }

      const pipeline = [
        { $match: matchQuery },
        { $sort: { wa_timestamp: -1 } },
        {
          $group: {
            _id: "$contact_id",
            lastMessage: { $first: "$$ROOT" }
          }
        },
        {
          $lookup: {
            from: 'contacts',
            localField: '_id',
            foreignField: '_id',
            as: 'contact'
          }
        },
        { $unwind: "$contact" },
        {
          $match: {
            "contact.deleted_at": null
          }
        }
      ];

      if (search && String(search).trim()) {
        pipeline.push({
          $match: {
            $or: [
              { "contact.name": { $regex: String(search).trim(), $options: 'i' } },
              { "lastMessage.content": { $regex: String(search).trim(), $options: 'i' } }
            ]
          }
        });
      }

      pipeline.push({ $sort: { "lastMessage.wa_timestamp": -1 } });

      pipeline.push({
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: limit }]
        }
      });

      const aggregateResult = await Message.aggregate(pipeline);
      const chatsData = aggregateResult[0].data || [];
      const total = aggregateResult[0].metadata[0]?.total || 0;

      const pagination = {
        total,
        page,
        limit,
        hasMore: total > skip + chatsData.length
      };

      let filteredChats = chatsData.map(chat => {
        const contactIdStr = chat.contact._id.toString();
        const number = chat.contact.phone_number || chat.contact.telegram_chat_id || chat.contact.facebook_page_scoped_id || chat.contact.instagram_scoped_id || chat._id.toString();

        let displayName = number;
        if (chat.contact.source === 'whatsapp' || chat.contact.source === 'baileys') {
          if (chat.contact.name && chat.contact.name.trim() !== "" && chat.contact.name.trim() !== chat.contact.phone_number) {
            displayName = chat.contact.name;
          } else {
            displayName = chat.contact.phone_number;
          }
        } else {
          displayName = chat.contact.name || number;
        }

        return {
          contact: {
            id: contactIdStr,
            number: displayName,
            name: chat.contact.name || number,
            avatar: chat.contact.avatar || null,
            chat_status: chat.contact.chat_status || 'open',
            source: chat.contact.source || 'whatsapp'
          },
          is_pinned: chat.contact.is_pinned || false,
          lastMessage: chat.lastMessage ? {
            id: chat.lastMessage._id.toString(),
            content: chat.lastMessage.content,
            messageType: chat.lastMessage.message_type,
            fileUrl: chat.lastMessage.file_url,
            direction: chat.lastMessage.direction,
            fromMe: chat.lastMessage.from_me,
            createdAt: chat.lastMessage.wa_timestamp,
            is_seen: chat.lastMessage.is_seen || false,
            read_status: chat.lastMessage.read_status || 'unread'
          } : null
        };
      });

      const contactIdsInChats = filteredChats.map(c => c.contact.id).filter(Boolean);

      const labelsFromContactTags = contactIdsInChats.length > 0
        ? await ContactTag.find({
          contact_id: { $in: contactIdsInChats },
          deleted_at: null
        })
          .populate('tag_id', 'label color')
          .select('contact_id tag_id')
          .lean()
        : [];

      const contactMap = {};
      const userContacts = await Contact.find({
        _id: { $in: contactIdsInChats }
      }).populate('tags', 'label color').lean();

      userContacts.forEach(contact => {
        contactMap[contact._id.toString()] = {
          id: contact._id.toString(),
          name: contact.name,
          chat_status: contact.chat_status || 'open',
          is_pinned: contact.is_pinned === true,
          tags: contact.tags || []
        };
      });

      const labelsFromContactModel = userContacts.reduce((acc, contact) => {
        const id = contact._id.toString();
        const tags = (contact.tags || []).filter(t => t && t.label);
        if (!tags.length) return acc;

        acc[id] = {
          labels: tags.map(t => t.label),
          details: tags.map(t => ({
            label: t.label,
            color: t.color || '#007bff'
          }))
        };
        return acc;
      }, {});

      const contactTagLabelMap = labelsFromContactTags.reduce((acc, item) => {
        const cid = item.contact_id?.toString?.() || item.contact_id;
        if (!cid) return acc;
        const label = item.tag_id?.label;
        if (label) {
          if (!acc[cid]) acc[cid] = [];
          acc[cid].push(label);
        }
        return acc;
      }, {});

      const contactTagDetailMap = labelsFromContactTags.reduce((acc, item) => {
        const cid = item.contact_id?.toString?.() || item.contact_id;
        if (!cid) return acc;
        const label = item.tag_id?.label;
        if (!label) return acc;

        if (!acc[cid]) acc[cid] = [];
        acc[cid].push({
          label,
          color: item.tag_id?.color || '#007bff'
        });

        return acc;
      }, {});

      const mergeLabelDetails = (contactId) => {
        if (!contactId) return [];

        const fromContact = labelsFromContactModel[contactId]?.details || [];
        const fromContactTag = contactTagDetailMap[contactId] || [];

        const byLabel = new Map();
        [...fromContact, ...fromContactTag].forEach(tag => {
          if (!tag || !tag.label) return;
          if (!byLabel.has(tag.label)) {
            byLabel.set(tag.label, {
              label: tag.label,
              color: tag.color || '#007bff'
            });
          }
        });

        return Array.from(byLabel.values());
      };

      filteredChats = filteredChats.map(chat => {
        const contactId = chat.contact.id;
        const contactInfo = contactMap[contactId] || {
          is_pinned: false,
          chat_status: 'open'
        };
        return {
          ...chat,
          is_pinned: chat.is_pinned || contactInfo.is_pinned,
          contact: {
            ...chat.contact,
            is_pinned: chat.is_pinned || contactInfo.is_pinned,
            chat_status: contactInfo.chat_status,
            labels: mergeLabelDetails(contactId)
          }
        };
      });

      const filterTags = tagsParam
        ? String(tagsParam).split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
        : null;
      const filterHasNotes = has_notes === 'true' || has_notes === true;
      const filterLastMessageRead = last_message_read === undefined || last_message_read === ''
        ? null
        : (last_message_read === 'true' || last_message_read === true);
      const filterStartDate = parseRecentChatsDate(startDateParam);
      const filterEndDate = endDateParam ? (() => {
        const d = parseRecentChatsDate(endDateParam);
        if (!d) return null;
        d.setHours(23, 59, 59, 999);
        return d;
      })() : null;

      if (filterTags && filterTags.length > 0) {
        filteredChats = filteredChats.filter(chat => {
          const labels = (chat.contact?.labels || []).map(l => (l?.label || l || '').toLowerCase());
          return filterTags.some(tag => labels.includes(tag));
        });
      }

      if (filterHasNotes) {
        const contactIdsWithNotes = await ChatNote.find({
          contact_id: { $in: filteredChats.map(c => c.contact?.id).filter(Boolean) },
          deleted_at: null
        })
          .distinct('contact_id')
          .then(ids => new Set(ids.map(id => id.toString())));
        filteredChats = filteredChats.filter(chat => contactIdsWithNotes.has(chat.contact?.id));
      }

      if (filterLastMessageRead !== null) {
        const contactsWithUnread = await Message.distinct('contact_id', {
          direction: 'inbound',
          deleted_at: null,
          $or: [
            { is_seen: false },
            { read_status: 'unread' }
          ]
        }).then(ids => new Set(ids.map(id => id.toString())));

        if (filterLastMessageRead === false) {
          filteredChats = filteredChats.filter(chat => contactsWithUnread.has(chat.contact?.id));
        } else {
          filteredChats = filteredChats.filter(chat => !contactsWithUnread.has(chat.contact?.id));
        }
      }

      if (filterStartDate || filterEndDate) {
        filteredChats = filteredChats.filter(chat => {
          const createdAt = chat.lastMessage?.createdAt;
          if (!createdAt) return false;
          const d = new Date(createdAt);
          if (filterStartDate && d < filterStartDate) return false;
          if (filterEndDate && d > filterEndDate) return false;
          return true;
        });
      }

      filteredChats = filteredChats.sort((a, b) => {
        const aPinned = a.is_pinned === true;
        const bPinned = b.is_pinned === true;
        if (aPinned === bPinned) return 0;
        return aPinned ? -1 : 1;
      });

      if (filteredChats.length > 0) {
        const unreadCounts = await Message.aggregate([
          {
            $match: {
              contact_id: { $in: filteredChats.map(c => new mongoose.Types.ObjectId(c.contact.id)) },
              direction: 'inbound',
              deleted_at: null,
              $or: [
                { is_seen: false },
                { read_status: 'unread' }
              ]
            }
          },
          {
            $group: {
              _id: '$contact_id',
              count: { $sum: 1 }
            }
          }
        ]);

        const unreadCountMap = unreadCounts.reduce((acc, item) => {
          acc[item._id.toString()] = item.count;
          return acc;
        }, {});

        filteredChats = filteredChats.map(chat => {
          const unreadCountVal = unreadCountMap[chat.contact.id] || 0;
          return {
            ...chat,
            unread_count: unreadCountVal,
            lastMessage: chat.lastMessage ? {
              ...chat.lastMessage,
              unreadCount: unreadCountVal.toString()
            } : null
          };
        });
      }

      return res.json({
        success: true,
        data: filteredChats,
        pagination
      });
    }

    let myPhoneNumber = null;
    let connection = null;
    let resolvedWhatsappPhoneNumberId = whatsappPhoneNumberId;
    let contactsOwnerId = userId;

    if (req.user.role === 'agent' && !resolvedWhatsappPhoneNumberId) {
      const assignments = await ChatAssignment.find({
        agent_id: req.user.id,
        $or: [{ status: 'assigned' }, { status: { $exists: false } }]
      })
        .select('whatsapp_phone_number_id assigned_by sender_number receiver_number')
        .lean();
      const phoneIds = new Set();
      for (const a of assignments) {
        if (a.whatsapp_phone_number_id) {
          phoneIds.add(a.whatsapp_phone_number_id.toString());
        } else {
          const phone = await WhatsappPhoneNumber.findOne({
            user_id: a.assigned_by,
            display_phone_number: { $in: [a.sender_number, a.receiver_number] },
            deleted_at: null
          }).select('_id').lean();
          if (phone) phoneIds.add(phone._id.toString());
        }
      }
      const uniquePhoneIds = [...phoneIds];
      if (uniquePhoneIds.length === 0) {
        return res.status(200).json({ success: true, data: [] });
      }
      if (uniquePhoneIds.length > 1) {
        return res.status(400).json({
          success: false,
          error: 'Multiple assigned chats use different phone numbers. Please pass whatsapp_phone_number_id to list chats for a specific number.'
        });
      }
      resolvedWhatsappPhoneNumberId = uniquePhoneIds[0];
    }

    if (resolvedWhatsappPhoneNumberId) {
      let whatsappPhoneNumber = null;
      if (mongoose.Types.ObjectId.isValid(resolvedWhatsappPhoneNumberId)) {
        whatsappPhoneNumber = await WhatsappPhoneNumber.findById(resolvedWhatsappPhoneNumberId)
          .populate('waba_id')
          .lean();
      }

      if (!whatsappPhoneNumber || !whatsappPhoneNumber.waba_id) {
        return res.status(404).json({
          success: false,
          error: 'WhatsApp Phone Number not found'
        });
      }

      if (req.user.role === 'agent') {
        const assignmentQuery = {
          agent_id: req.user.id,
          $or: [{ status: 'assigned' }, { status: { $exists: false } }]
        };
        if (mongoose.Types.ObjectId.isValid(resolvedWhatsappPhoneNumberId)) {
          assignmentQuery.whatsapp_phone_number_id = resolvedWhatsappPhoneNumberId;
        }

        let agentHasAssignment = await ChatAssignment.findOne(assignmentQuery).lean();
        if (!agentHasAssignment) {
          const legacy = await ChatAssignment.findOne({
            agent_id: req.user.id,
            whatsapp_phone_number_id: { $exists: false },
            $or: [{ status: 'assigned' }, { status: { $exists: false } }]
          }).select('assigned_by sender_number receiver_number').lean();
          if (legacy) {
            const phone = await WhatsappPhoneNumber.findOne({
              user_id: legacy.assigned_by,
              display_phone_number: { $in: [legacy.sender_number, legacy.receiver_number] },
              _id: resolvedWhatsappPhoneNumberId,
              deleted_at: null
            }).lean();
            agentHasAssignment = !!phone;
          }
        }
        if (!agentHasAssignment) {
          return res.status(200).json({
            success: true,
            data: [],
            message: 'You do not have any assigned chats for this phone number'
          });
        }
      }

      myPhoneNumber = whatsappPhoneNumber.display_phone_number;

      if (whatsappPhoneNumber.user_id) {
        contactsOwnerId = whatsappPhoneNumber.user_id.toString();
      }
      connection = {
        access_token: whatsappPhoneNumber.waba_id.access_token,
        phone_number_id: whatsappPhoneNumber.phone_number_id,
        registred_phone_number: whatsappPhoneNumber.display_phone_number
      };
    } else {
      const firstPhoneNumber = await WhatsappPhoneNumber.findOne({
        user_id: userId,
        is_active: true,
        deleted_at: null
      })
        .populate('waba_id')
        .lean();

      if (firstPhoneNumber && firstPhoneNumber.waba_id) {
        myPhoneNumber = firstPhoneNumber.display_phone_number;
        contactsOwnerId = userId;
        connection = {
          access_token: firstPhoneNumber.waba_id.access_token,
          phone_number_id: firstPhoneNumber.phone_number_id,
          registred_phone_number: firstPhoneNumber.display_phone_number
        };
      }
    }
    console.log("connection", !connection);

    if (!connection) {
      return res.status(200).json({
        success: true,
        data: []
      });
    }
    const { page, limit } = parsePaginationParams({ ...req.query, limit: req.query.limit || 15 });

    let assignedNumbersArr = [];
    if (req.user.role === 'agent' && myPhoneNumber) {
      const assignments = await ChatAssignment.find({
        agent_id: req.user.id,
        whatsapp_phone_number_id: resolvedWhatsappPhoneNumberId,
        $or: [{ status: 'assigned' }, { status: { $exists: false } }]
      }).select('sender_number receiver_number').lean();

      const assignedNumbersSet = new Set();
      assignments.forEach(a => {
        if (a.sender_number !== myPhoneNumber) assignedNumbersSet.add(a.sender_number);
        if (a.receiver_number !== myPhoneNumber) assignedNumbersSet.add(a.receiver_number);
      });
      assignedNumbersArr = Array.from(assignedNumbersSet);
    }

    const chatsResult = await unifiedWhatsAppService.getRecentChats(userId, providerType, null, connection, {
      page,
      limit,
      assignedNumbers: assignedNumbersArr
    });

    const chats = chatsResult.data || [];
    const pagination = chatsResult.pagination || { total: 0, page, limit, hasMore: false };

    let filteredChats = chats;

    const userContacts = await Contact.find({
      created_by: contactsOwnerId,
      deleted_at: null
    })
      .select('_id phone_number name tags is_pinned chat_status')
      .populate('tags', 'label color')
      .lean();

    const contactMap = userContacts.reduce((acc, contact) => {
      acc[contact.phone_number] = {
        id: contact._id.toString(),
        name: contact.name,
        chat_status: contact.chat_status || 'open',
        is_pinned: contact.is_pinned === true
      };
      return acc;
    }, {});

    const contactIdsInChats = filteredChats
      .map(c => contactMap[c.contact.number]?.id)
      .filter(Boolean);

    const labelsFromContactTags = contactIdsInChats.length > 0
      ? await ContactTag.find({
        contact_id: { $in: contactIdsInChats },
        deleted_at: null
      })
        .populate('tag_id', 'label color')
        .select('contact_id tag_id')
        .lean()
      : [];

    const labelsFromContactModel = userContacts.reduce((acc, contact) => {
      const id = contact._id.toString();
      const tags = (contact.tags || []).filter(t => t && t.label);
      if (!tags.length) return acc;

      acc[id] = {
        labels: tags.map(t => t.label),
        details: tags.map(t => ({
          label: t.label,
          color: t.color || '#007bff'
        }))
      };
      return acc;
    }, {});

    const contactTagLabelMap = labelsFromContactTags.reduce((acc, item) => {
      const cid = item.contact_id?.toString?.() || item.contact_id;
      if (!cid) return acc;
      const label = item.tag_id?.label;
      if (label) {
        if (!acc[cid]) acc[cid] = [];
        acc[cid].push(label);
      }
      return acc;
    }, {});

    const contactTagDetailMap = labelsFromContactTags.reduce((acc, item) => {
      const cid = item.contact_id?.toString?.() || item.contact_id;
      if (!cid) return acc;
      const label = item.tag_id?.label;
      if (!label) return acc;

      if (!acc[cid]) acc[cid] = [];
      acc[cid].push({
        label,
        color: item.tag_id?.color || '#007bff'
      });

      return acc;
    }, {});

    const mergeLabels = (contactId) => {
      if (!contactId) return [];
      const fromContact = labelsFromContactModel[contactId]?.labels || [];
      const fromContactTag = contactTagLabelMap[contactId] || [];
      return [...new Set([...fromContact, ...fromContactTag])];
    };

    const mergeLabelDetails = (contactId) => {
      if (!contactId) return [];

      const fromContact = labelsFromContactModel[contactId]?.details || [];
      const fromContactTag = contactTagDetailMap[contactId] || [];

      const byLabel = new Map();
      [...fromContact, ...fromContactTag].forEach(tag => {
        if (!tag || !tag.label) return;
        if (!byLabel.has(tag.label)) {
          byLabel.set(tag.label, {
            label: tag.label,
            color: tag.color || '#007bff'
          });
        }
      });

      return Array.from(byLabel.values());
    };

    if (myPhoneNumber) {
      filteredChats = filteredChats.map(chat => {
        const contactInfo = contactMap[chat.contact.number] || {
          id: null,
          name: chat.contact.number,
          is_pinned: false
        };

        const isPinned = !!contactInfo.is_pinned;
        const contactId = contactInfo.id;

        let displayName = chat.contact.number;
        if (contactInfo.name && contactInfo.name.trim() !== "" && contactInfo.name.trim() !== chat.contact.number) {
          displayName = contactInfo.name;
        }

        return {
          ...chat,
          is_pinned: isPinned,
          contact: {
            ...chat.contact,
            id: contactId,
            number: displayName,
            name: contactInfo.name,
            is_pinned: isPinned,
            chat_status: contactInfo.chat_status || 'open',
            labels: mergeLabelDetails(contactId)
          }
        };
      });
    } else {
      filteredChats = filteredChats.map(chat => {
        const contactInfo = contactMap[chat.contact.number] || {
          id: null,
          name: chat.contact.number,
          is_pinned: false
        };

        const isPinned = !!contactInfo.is_pinned;
        const contactId = contactInfo.id;

        let displayName = chat.contact.number;
        if (contactInfo.name && contactInfo.name.trim() !== "" && contactInfo.name.trim() !== chat.contact.number) {
          displayName = contactInfo.name;
        }

        return {
          ...chat,
          is_pinned: isPinned,
          contact: {
            ...chat.contact,
            id: contactId,
            number: displayName,
            name: contactInfo.name,
            is_pinned: isPinned,
            chat_status: contactInfo.chat_status || 'open',
            labels: mergeLabelDetails(contactId)
          }
        };
      });
    }

    filteredChats = filteredChats.filter(chat => chat.contact && chat.contact.id !== null);

    const searchTerm = search && String(search).trim() ? String(search).trim().toLowerCase() : null;
    const filterTags = tagsParam
      ? String(tagsParam).split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
      : null;
    const filterHasNotes = has_notes === 'true' || has_notes === true;
    const filterLastMessageRead = last_message_read === undefined || last_message_read === ''
      ? null
      : (last_message_read === 'true' || last_message_read === true);
    const filterStartDate = parseRecentChatsDate(startDateParam);
    const filterEndDate = endDateParam ? (() => {
      const d = parseRecentChatsDate(endDateParam);
      if (!d) return null;
      d.setHours(23, 59, 59, 999);
      return d;
    })() : null;

    if (searchTerm) {
      filteredChats = filteredChats.filter(chat => {
        const num = (chat.contact?.number || '').toLowerCase();
        const name = (chat.contact?.name || '').toLowerCase();
        return num.includes(searchTerm) || name.includes(searchTerm);
      });
    }

    if (filterTags && filterTags.length > 0) {
      filteredChats = filteredChats.filter(chat => {
        const labels = (chat.contact?.labels || []).map(l => (l?.label || l || '').toLowerCase());
        return filterTags.some(tag => labels.includes(tag));
      });
    }

    if (filterHasNotes) {
      const contactIdsWithNotes = await ChatNote.find({
        contact_id: { $in: filteredChats.map(c => c.contact?.id).filter(Boolean) },
        deleted_at: null
      })
        .distinct('contact_id')
        .then(ids => new Set(ids.map(id => id.toString())));
      filteredChats = filteredChats.filter(chat => contactIdsWithNotes.has(chat.contact?.id));
    }

    if (filterLastMessageRead !== null) {
      const contactsWithUnread = await Message.distinct('contact_id', {
        direction: 'inbound',
        deleted_at: null,
        $or: [
          { is_seen: false },
          { read_status: 'unread' }
        ]
      }).then(ids => new Set(ids.map(id => id.toString())));

      if (filterLastMessageRead === false) {
        filteredChats = filteredChats.filter(chat => contactsWithUnread.has(chat.contact?.id));
      } else {
        filteredChats = filteredChats.filter(chat => !contactsWithUnread.has(chat.contact?.id));
      }
    }

    if (filterStartDate || filterEndDate) {
      filteredChats = filteredChats.filter(chat => {
        const createdAt = chat.lastMessage?.createdAt;
        if (!createdAt) return false;
        const d = new Date(createdAt);
        if (filterStartDate && d < filterStartDate) return false;
        if (filterEndDate && d > filterEndDate) return false;
        return true;
      });
    }

    filteredChats = filteredChats.sort((a, b) => {
      const aPinned = a.is_pinned === true;
      const bPinned = b.is_pinned === true;
      if (aPinned === bPinned) return 0;
      return aPinned ? -1 : 1;
    });

    const isAssignedFilter = isAssignedParam === 'true' ? true : (isAssignedParam === 'false' ? false : null);
    const agentIdFilter = agentIdParam || null;

    if (isAssignedFilter !== null || agentIdFilter) {
      const assignmentQuery = {
        whatsapp_phone_number_id: resolvedWhatsappPhoneNumberId,
        $or: [{ status: 'assigned' }, { status: { $exists: false } }]
      };

      if (agentIdFilter) {
        assignmentQuery.agent_id = agentIdFilter;
      }

      const assignments = await ChatAssignment.find(assignmentQuery).lean();
      const relevantNumbers = new Set();
      assignments.forEach(a => {
        const contactNo = a.sender_number === myPhoneNumber ? a.receiver_number : a.sender_number;
        relevantNumbers.add(contactNo);
      });

      if (agentIdFilter || isAssignedFilter === true) {
        filteredChats = filteredChats.filter(chat => relevantNumbers.has(chat.contact.number));
      } else if (isAssignedFilter === false) {
        const allAssignedNumbers = await ChatAssignment.find({
          whatsapp_phone_number_id: resolvedWhatsappPhoneNumberId,
          $or: [{ status: 'assigned' }, { status: { $exists: false } }]
        }).lean().then(list => {
          const set = new Set();
          list.forEach(a => {
            const contactNo = a.sender_number === myPhoneNumber ? a.receiver_number : a.sender_number;
            set.add(contactNo);
          });
          return set;
        });
        filteredChats = filteredChats.filter(chat => !allAssignedNumbers.has(chat.contact.number));
      }
    }

    if (filteredChats.length > 0) {
      const unreadCounts = await Message.aggregate([
        {
          $match: {
            contact_id: { $in: filteredChats.map(c => new mongoose.Types.ObjectId(c.contact.id)).filter(Boolean) },
            direction: 'inbound',
            deleted_at: null,
            $or: [
              { is_seen: false },
              { read_status: 'unread' }
            ]
          }
        },
        {
          $group: {
            _id: '$contact_id',
            count: { $sum: 1 }
          }
        }
      ]);

      const unreadCountMap = unreadCounts.reduce((acc, item) => {
        acc[item._id.toString()] = item.count;
        return acc;
      }, {});

      filteredChats = filteredChats.map(chat => {
        const unreadCountVal = unreadCountMap[chat.contact.id] || 0;
        return {
          ...chat,
          unread_count: unreadCountVal,
          lastMessage: chat.lastMessage ? {
            ...chat.lastMessage,
            unreadCount: unreadCountVal.toString()
          } : null
        };
      });
    }

    return res.json({
      success: true,
      data: filteredChats,
      pagination
    });
  } catch (error) {
    console.error('Error fetching recent chats:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch recent chats',
      details: error.message
    });
  }
};

export const getConnectionStatus = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    let { provider, whatsapp_phone_number_id: whatsappPhoneNumberId } = req.query;

    if (whatsappPhoneNumberId === 'null' || whatsappPhoneNumberId === 'undefined' || !whatsappPhoneNumberId) {
      whatsappPhoneNumberId = null;
    }

    const providerType = provider || null;

    if (!whatsappPhoneNumberId) {
      const firstPhoneNumber = await WhatsappPhoneNumber.findOne({
        user_id: userId,
        is_active: true,
        deleted_at: null
      })
        .populate('waba_id')
        .lean();

      if (!firstPhoneNumber || !firstPhoneNumber.waba_id) {
        return res.status(200).json({
          success: true,
          connected: false
        });
      }

      return res.json({
        success: true,
        connected: true,

      });
    }

    const isObjectId = mongoose.Types.ObjectId.isValid(whatsappPhoneNumberId);
    const tg = await TelegramConnection.findOne({
      $or: [
        ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(whatsappPhoneNumberId) }] : []),
        { bot_id: whatsappPhoneNumberId }
      ]
    });
    if (tg) {
      return res.json({
        success: true,
        connected: true
      });
    }

    const ig = await InstagramConnection.findOne({
      $or: [
        ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(whatsappPhoneNumberId) }] : []),
        { ig_user_id: whatsappPhoneNumberId },
        { "pages.instagram_account_id": whatsappPhoneNumberId }
      ]
    });
    if (ig) {
      return res.json({
        success: true,
        connected: true
      });
    }

    const fb = await FacebookConnection.findOne({
      $or: [
        ...(isObjectId ? [{ _id: new mongoose.Types.ObjectId(whatsappPhoneNumberId) }] : []),
        { fb_user_id: whatsappPhoneNumberId },
        { "pages.page_id": whatsappPhoneNumberId }
      ]
    });
    if (fb) {
      return res.json({
        success: true,
        connected: true
      });
    }

    const whatsappPhoneNumber = await WhatsappPhoneNumber.findById(whatsappPhoneNumberId)
      .populate('waba_id')
      .lean();

    if (!whatsappPhoneNumber || !whatsappPhoneNumber.waba_id) {
      return res.status(404).json({
        success: false,
        error: 'WhatsApp Phone Number not found'
      });
    }

    return res.json({
      success: true,
      connected: true,
    });
  } catch (error) {
    console.error('Error getting connection status:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get connection status',
      details: error.message
    });
  }
};

export const connectWhatsApp = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { name, provider = 'business_api', phone_number_id, access_token, whatsapp_business_account_id, registred_phone_number, app_id, workspace_id, business_id } = req.body;

    if (provider === PROVIDER_TYPES.BUSINESS_API) {
      if (!phone_number_id || !access_token || !whatsapp_business_account_id || !app_id || !workspace_id) {
        return res.status(400).json({
          success: false,
          error: 'Name, Phone number ID, Workspace id ,access token, app ID and WhatsApp Business Account ID are required for Business API'
        });
      }

      let phoneNumber = await WhatsappPhoneNumber.findOne({
        phone_number_id
      });

      if (phoneNumber && phoneNumber.user_id.toString() !== userId.toString() && phoneNumber.deleted_at === null) {
        return res.status(400).json({
          success: false,
          error: 'This WhatsApp phone number is already connected to another workspace or user.'
        });
      }

      if (workspace_id) {
        const existingWaba = await WhatsappWaba.findOne({
          workspace_id: workspace_id,
          whatsapp_business_account_id: { $ne: whatsapp_business_account_id }
        });

        if (existingWaba) {
          await WhatsappPhoneNumber.deleteMany({ waba_id: existingWaba._id });
          await WhatsappWaba.deleteOne({ _id: existingWaba._id });
        }
      }

      let waba = await WhatsappWaba.findOne({
        user_id: userId,
        whatsapp_business_account_id
      });

      if (!waba) {
        waba = await WhatsappWaba.create({
          user_id: userId,
          whatsapp_business_account_id,
          app_id,
          business_id,
          access_token,
          workspace_id,
          name: name || registred_phone_number,
          provider: PROVIDER_TYPES.BUSINESS_API,
          is_active: true
        });
      } else {
        waba.access_token = access_token;
        waba.business_id = business_id || waba.business_id;
        waba.workspace_id = workspace_id || waba.workspace_id;
        waba.name = name || registred_phone_number;
        waba.provider = PROVIDER_TYPES.BUSINESS_API;
        waba.is_active = true;
        waba.deleted_at = null;
        await waba.save();
      }

      if (phoneNumber) {
        phoneNumber.user_id = userId;
        phoneNumber.waba_id = waba._id;
        phoneNumber.display_phone_number = registred_phone_number;
        phoneNumber.is_active = true;
        phoneNumber.deleted_at = null;
        if (name) phoneNumber.verified_name = name;
        await phoneNumber.save();
      } else {
        const phoneCount = await WhatsappPhoneNumber.countDocuments({ user_id: userId, deleted_at: null });
        phoneNumber = await WhatsappPhoneNumber.create({
          user_id: userId,
          waba_id: waba._id,
          phone_number_id,
          display_phone_number: registred_phone_number,
          verified_name: name,
          is_active: true,
          is_primary: phoneCount === 0
        });
      }

      return res.json({
        success: true,
        data: {
          waba_id: waba._id,
          waba_name: waba.name,
          whatsapp_business_account_id: waba.whatsapp_business_account_id,
          phone_id: phoneNumber._id,
          phone_number_id: phoneNumber.phone_number_id,
          display_phone_number: phoneNumber.display_phone_number,
          verified_name: phoneNumber.verified_name,
          is_new_waba: !waba,
          is_new_phone: !phoneNumber
        }
      });
    } else if (provider === PROVIDER_TYPES.BAILEY) {
      const { instance_name, name: bodyName, workspace_id } = req.body;
      const finalInstanceName = instance_name || bodyName;

      if (!finalInstanceName) {
        return res.status(400).json({
          success: false,
          error: 'Instance name is required for Baileys connection'
        });
      }

      if (workspace_id) {
        const existingWaba = await WhatsappWaba.findOne({ workspace_id });
        if (existingWaba) {
          await WhatsappPhoneNumber.deleteMany({ waba_id: existingWaba._id });
          await WhatsappWaba.deleteOne({ _id: existingWaba._id });
        }
      }

      let waba = await WhatsappWaba.create({
        user_id: userId,
        workspace_id: workspace_id || null,
        name: finalInstanceName,
        instance_name: finalInstanceName,
        provider: PROVIDER_TYPES.BAILEY,
        connection_status: 'initial',
        is_active: true
      });

      unifiedWhatsAppService.initializeConnection(userId, PROVIDER_TYPES.BAILEY, waba)
        .catch(err => console.error('Error initializing Baileys in background:', err));

      return res.json({
        success: true,
        message: 'Baileys instance created and initializing. Please fetch QR code.',
        data: {
          waba_id: waba._id,
          instance_name: waba.instance_name,
          status: waba.connection_status,
          provider: waba.provider
        }
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Unsupported provider'
      });
    }
  } catch (error) {
    console.error('Error initializing WhatsApp:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to initialize WhatsApp connection',
      details: error.message
    });
  }
};

export const getEmbbededSignupConnection = async (req, res) => {
  const userId = req.user.owner_id;
  const { code, signupData, workspace_id } = req.body;

  if (!code || !signupData?.waba_id || !signupData?.phone_number_id || !signupData.business_id) {
    return res.status(400).json({
      success: false,
      error: 'Invalid signup payload'
    });
  }

  if (processedAuthCodes.has(code)) {
    return res.status(400).json({
      success: false,
      error: 'This authorization code has already been processed or is currently being processed.'
    });
  }

  processedAuthCodes.add(code);
  setTimeout(() => processedAuthCodes.delete(code), 5 * 60 * 1000);

  try {

    const metaSettings = await Setting.findOne().lean();

    if (!metaSettings?.app_id || !metaSettings?.app_secret) {
      return res.status(500).json({
        success: false,
        error: 'Meta app configuration not found'
      });
    }

    const { app_id: APP_ID, app_secret: APP_SECRET } = metaSettings;

    const tokenRes = await axios.get(
      `https://graph.facebook.com/${META_GRAPH_API_VERSION}/oauth/access_token`,
      {
        params: {
          client_id: APP_ID,
          client_secret: APP_SECRET,
          code
        }
      }
    );

    const accessToken = tokenRes.data.access_token;

    await subscribeWabaToApp(signupData.waba_id, accessToken);

    const phoneRes = await axios.get(
      `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${signupData.phone_number_id}`,
      {
        params: {
          fields: 'display_phone_number,verified_name,quality_rating,is_on_biz_app,platform_type'
        },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const { display_phone_number, verified_name, quality_rating } = phoneRes.data;
    const isCoexistence = isCoexistenceSignup(signupData, phoneRes.data);

    let phoneNumber = await WhatsappPhoneNumber.findOne({
      phone_number_id: signupData.phone_number_id
    });

    if (phoneNumber && phoneNumber.user_id.toString() !== userId.toString() && phoneNumber.deleted_at === null) {
      return res.status(400).json({
        success: false,
        error: 'This WhatsApp phone number is already connected to another workspace or user.'
      });
    }

    if (workspace_id) {
      const existingWaba = await WhatsappWaba.findOne({
        workspace_id: workspace_id,
        whatsapp_business_account_id: { $ne: signupData.waba_id }
      });

      if (existingWaba) {
        await WhatsappPhoneNumber.deleteMany({ waba_id: existingWaba._id });
        await WhatsappWaba.deleteOne({ _id: existingWaba._id });
      }
    }

    let waba = await WhatsappWaba.findOne({
      user_id: userId,
      whatsapp_business_account_id: signupData.waba_id
    });
    const isNewWaba = !waba;

    if (!waba) {
      waba = await WhatsappWaba.create({
        user_id: userId,
        whatsapp_business_account_id: signupData.waba_id,
        business_id: signupData.business_id,
        app_id: APP_ID,
        access_token: accessToken,
        workspace_id,
        name: verified_name || display_phone_number,
        is_active: true
      });
    } else {
      waba.access_token = accessToken;
      waba.business_id = signupData.business_id,
        waba.workspace_id = workspace_id || waba.workspace_id;
      waba.name = verified_name || display_phone_number;
      waba.is_active = true;
      waba.deleted_at = null;
      await waba.save();
    }

    const isNewPhone = !phoneNumber;

    if (phoneNumber) {
      phoneNumber.user_id = userId;
      phoneNumber.waba_id = waba._id;
      phoneNumber.display_phone_number = display_phone_number;
      phoneNumber.verified_name = verified_name;
      phoneNumber.quality_rating = quality_rating;
      phoneNumber.is_active = true;
      phoneNumber.deleted_at = null;
      await phoneNumber.save();
    } else {
      const phoneCount = await WhatsappPhoneNumber.countDocuments({ user_id: userId, deleted_at: null });
      phoneNumber = await WhatsappPhoneNumber.create({
        user_id: userId,
        waba_id: waba._id,
        phone_number_id: signupData.phone_number_id,
        display_phone_number,
        verified_name,
        quality_rating,
        is_active: true,
        is_primary: phoneCount === 0
      });
    }

    // if (!isCoexistence) {
    //   try {
    //     await axios.post(
    //       `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${signupData.phone_number_id}/register`,
    //       {
    //         messaging_product: "whatsapp",
    //         pin: signupData.pin || req.body.pin || process.env.WHATSAPP_DEFAULT_PIN || "123456"
    //       },
    //       {
    //         headers: {
    //           Authorization: `Bearer ${accessToken}`,
    //           'Content-Type': 'application/json'
    //         }
    //       }
    //     );
    //   } catch (regErr) {
    //     if (!isAlreadyRegisteredError(regErr)) {
    //       throw regErr;
    //     }
    //   }
    // }

    return res.json({
      success: true,
      data: {
        waba_id: waba._id,
        waba_name: waba.name,
        whatsapp_business_account_id: waba.whatsapp_business_account_id,
        phone_id: phoneNumber._id,
        phone_number_id: phoneNumber.phone_number_id,
        display_phone_number: phoneNumber.display_phone_number,
        verified_name: phoneNumber.verified_name,
        quality_rating: phoneNumber.quality_rating,
        is_on_biz_app: phoneRes.data.is_on_biz_app,
        platform_type: phoneRes.data.platform_type,
        is_coexistence: isCoexistence,
        webhook_subscribed: true,
        is_new_waba: isNewWaba,
        is_new_phone: isNewPhone
      }
    });
  } catch (err) {
    console.error('Embedded signup failed:', err.response?.data || err.message);

    const errorData = err.response?.data?.error || {};
    const errorMessage = errorData.message || 'Embedded signup failed';
    const subcode = errorData.error_subcode;

    const statusCode = err.response?.status || 500;

    return res.status(statusCode).json({
      success: false,
      error: errorMessage,
      subcode: subcode
    });
  }
};

export const getUserConnections = async (req, res) => {
  try {
    const userId = req.user.owner_id;

    const wabas = await WhatsappWaba.find({
      user_id: userId,
      deleted_at: null
    })
      .sort({ created_at: -1 })
      .lean();

    const enrichedWabas = await Promise.all(
      wabas.map(async (waba) => {
        const phoneNumbers = await WhatsappPhoneNumber.find({
          user_id: userId,
          waba_id: waba._id,
          deleted_at: null
        })
          .sort({ created_at: -1 })
          .lean();

        const enrichedPhoneNumbers = await Promise.all(
          phoneNumbers.map(async (phone) => {
            let verified_name = phone.verified_name;
            let quality_rating = phone.quality_rating;

            if (waba.provider !== 'baileys') {
              try {
                const response = await axios.get(
                  `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${phone.phone_number_id}`,
                  {
                    params: {
                      fields: 'verified_name,quality_rating'
                    },
                    headers: {
                      Authorization: `Bearer ${waba.access_token}`
                    }
                  }
                );
                verified_name = response.data.verified_name || verified_name;
                quality_rating = response.data.quality_rating || quality_rating;
              } catch (err) {
                console.error(
                  `Failed to fetch WhatsApp details for ${phone.phone_number_id}`,
                  err.message
                );
              }
            }

            return {
              id: phone._id.toString(),
              phone_number_id: phone.phone_number_id,
              display_phone_number: phone.display_phone_number,
              verified_name,
              quality_rating,
              is_active: phone.is_active,
              created_at: phone.created_at,
              updated_at: phone.updated_at
            };
          })
        );

        return {
          id: waba._id.toString(),
          name: waba.name,
          whatsapp_business_account_id: waba.whatsapp_business_account_id,
          app_id: waba.app_id,
          access_token: waba.access_token ? '***' : null,
          is_active: waba.is_active,
          phone_numbers: enrichedPhoneNumbers,
          phone_numbers_count: enrichedPhoneNumbers.length,
          created_at: waba.created_at,
          updated_at: waba.updated_at
        };
      })
    );

    return res.json({
      success: true,
      data: enrichedWabas,
      total_wabas: enrichedWabas.length
    });
  } catch (error) {
    console.error('Error getting user connections:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user connections',
      details: error.message
    });
  }
};

export const getMyPhoneNumbers = async (req, res) => {
  try {
    let effectiveUserId = req.user.id;

    if (req.user.role === "agent") {
      const agent = await User.findById(req.user.id)
        .select("created_by")
        .lean();

      if (agent?.created_by) {
        effectiveUserId = agent.created_by;
      }
    }
    console.log("effectiveUserId", effectiveUserId);
    const [wabas, telegramConns, instagramConns, facebookConns] = await Promise.all([
      WhatsappWaba.find({
        user_id: effectiveUserId,
        is_active: true,
        deleted_at: null
      }).sort({ created_at: -1 }).lean(),
      TelegramConnection.find({
        user_id: effectiveUserId,
        is_active: true
      }).lean(),
      InstagramConnection.find({
        user_id: effectiveUserId,
        is_active: true
      }).lean(),
      FacebookConnection.find({
        user_id: effectiveUserId,
        is_active: true
      }).lean()
    ]);

    const allPhoneNumbers = await WhatsappPhoneNumber.find({
      user_id: effectiveUserId,
      is_active: true,
      deleted_at: null
    })
      .populate("waba_id")
      .sort({ created_at: -1 })
      .lean();

    const enrichedPhoneNumbers = await Promise.all(
      allPhoneNumbers.map(async (phone) => {
        let verified_name = phone.verified_name;
        let quality_rating = phone.quality_rating;

        if (phone.waba_id?.provider !== 'baileys' && phone.waba_id?.access_token) {
          try {
            const response = await axios.get(
              `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${phone.phone_number_id}`,
              {
                params: { fields: "verified_name,quality_rating" },
                headers: {
                  Authorization: `Bearer ${phone.waba_id.access_token}`
                }
              }
            );

            verified_name = response.data.verified_name || verified_name;
            quality_rating = response.data.quality_rating || quality_rating;
          } catch (err) {
            console.error(
              `Failed to fetch WhatsApp details for ${phone.phone_number_id}`,
              err.message
            );
          }
        }

        let displayName = phone.display_phone_number;
        if (verified_name && verified_name !== 'N/A' && verified_name.trim() !== '') {
          displayName = verified_name;
        }

        return {
          display_phone_number: displayName,
          id: phone._id,
          is_primary: phone.is_primary
        };
      })
    );

    telegramConns.forEach(tg => {
      enrichedPhoneNumbers.push({
        display_phone_number: tg.bot_name || tg.bot_username || "Telegram Bot",
        id: tg._id,
        is_primary: false
      });
    });

    instagramConns.forEach(ig => {
      (ig.pages || []).forEach(p => {
        enrichedPhoneNumbers.push({
          display_phone_number: p.instagram_username || p.page_name || "Instagram Account",
          id: p.instagram_account_id || ig._id,
          is_primary: false
        });
      });
    });

    facebookConns.forEach(fb => {
      (fb.pages || []).forEach(p => {
        enrichedPhoneNumbers.push({
          display_phone_number: p.page_name || "Facebook Page",
          id: p.page_id || fb._id,
          is_primary: false
        });
      });
    });

    const sortedPhoneNumbers = enrichedPhoneNumbers.sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return 0;
    });

    return res.json({
      success: true,
      data: sortedPhoneNumbers,
      total_wabas: wabas.length,
      total_phone_numbers: sortedPhoneNumbers.length
    });

  } catch (error) {
    console.error("Error getting user phone numbers:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get user phone numbers",
      message: error.message
    });
  }
};

export const getWabaPhoneNumbers = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { wabaId } = req.params;
    const { page, limit, skip } = parsePaginationParams(req.query);

    const waba = await WhatsappWaba.findOne({ _id: wabaId, user_id: userId, deleted_at: null });
    if (!waba) {
      return res.status(404).json({ success: false, error: 'WABA not found' });
    }

    const phoneNumbers = await WhatsappPhoneNumber.find({
      user_id: userId,
      waba_id: waba._id,
      deleted_at: null
    })
      .sort({ created_at: -1 })
      .lean();

    const enrichedPhoneNumbers = [];

    await Promise.all(
      phoneNumbers.map(async (phone) => {
        let verified_name = phone.verified_name;
        let quality_rating = phone.quality_rating;

        if (waba.provider !== 'baileys' && waba.access_token) {
          try {
            const response = await axios.get(
              `https://graph.facebook.com/${META_GRAPH_API_VERSION}/${phone.phone_number_id}`,
              {
                params: {
                  fields: 'verified_name,quality_rating'
                },
                headers: {
                  Authorization: `Bearer ${waba.access_token}`
                }
              }
            );
            verified_name = response.data.verified_name || verified_name;
            quality_rating = response.data.quality_rating || quality_rating;
          } catch (err) {
            console.error(
              `Failed to fetch WhatsApp details for ${phone.phone_number_id}`,
              err.message
            );
          }
        }

        enrichedPhoneNumbers.push({
          id: phone._id.toString(),
          phone_number_id: phone.phone_number_id,
          verified_name: verified_name ?? "N/A",
          quality_rating: quality_rating ?? "N/A",
          display_phone_number: phone.display_phone_number,
          is_primary: phone.is_primary || false
        });
      })
    );

    const sortedPhoneNumbers = enrichedPhoneNumbers.sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return 0;
    });

    const totalPhoneNumbers = sortedPhoneNumbers.length;
    const paginatedPhoneNumbers = sortedPhoneNumbers.slice(skip, skip + limit);

    return res.json({
      success: true,
      data: paginatedPhoneNumbers,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalPhoneNumbers / limit),
        totalItems: totalPhoneNumbers,
        itemsPerPage: limit
      },
      waba_id: waba._id,
      waba_name: waba.name
    });
  } catch (error) {
    console.error('Error getting WABA phone numbers:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get WABA phone numbers',
      details: error.message
    });
  }
};

export const updateConnection = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const connectionId = req.params.id;
    const { name, is_active } = req.body;

    let waba = await WhatsappWaba.findOne({
      _id: connectionId,
      user_id: userId,
      deleted_at: null
    });

    if (waba) {
      if (name !== undefined) {
        waba.name = name;
      }

      if (is_active !== undefined) {
        waba.is_active = is_active;

        if (is_active === true) {
          await WhatsappWaba.updateMany(
            {
              user_id: userId,
              _id: { $ne: connectionId },
              deleted_at: null
            },
            { is_active: false }
          );
        }
      }

      await waba.save();

      return res.json({
        success: true,
        message: 'WABA updated successfully',
        data: {
          id: waba._id.toString(),
          name: waba.name,
          whatsapp_business_account_id: waba.whatsapp_business_account_id,
          is_active: waba.is_active
        }
      });
    }

    let phoneNumber = await WhatsappPhoneNumber.findOne({
      _id: connectionId,
      user_id: userId,
      deleted_at: null
    });

    if (phoneNumber) {
      if (name !== undefined) {
        phoneNumber.verified_name = name;
      }

      if (is_active !== undefined) {
        phoneNumber.is_active = is_active;

        if (is_active === true) {
          await WhatsappPhoneNumber.updateMany(
            {
              user_id: userId,
              waba_id: phoneNumber.waba_id,
              _id: { $ne: connectionId },
              deleted_at: null
            },
            { is_active: false }
          );
        }
      }

      await phoneNumber.save();

      return res.json({
        success: true,
        message: 'Phone number updated successfully',
        data: {
          id: phoneNumber._id.toString(),
          phone_number_id: phoneNumber.phone_number_id,
          display_phone_number: phoneNumber.display_phone_number,
          verified_name: phoneNumber.verified_name,
          is_active: phoneNumber.is_active
        }
      });
    }

    return res.status(404).json({
      success: false,
      error: 'Connection not found'
    });
  } catch (error) {
    console.error('Error updating connection:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update connection',
      details: error.message
    });
  }
};

const validateAndFilterIds = (ids) => {
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return {
      isValid: false,
      message: 'Waba IDs array is required and must not be empty',
      validIds: []
    };
  }

  const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

  if (validIds.length === 0) {
    return {
      isValid: false,
      message: 'No valid Waba IDs provided',
      validIds: []
    };
  }

  return {
    isValid: true,
    validIds
  };
};


export const deleteConnections = async (req, res) => {
  try {
    const { ids } = req.body;

    const validation = validateAndFilterIds(ids);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    const { validIds } = validation;
    const userId = req.user.owner_id;


    const wabas = await WhatsappWaba.find({
      _id: { $in: validIds },
      user_id: userId
    }).select('_id');

    const wabaIds = wabas.map(w => w._id.toString());


    const phones = await WhatsappPhoneNumber.find({
      _id: { $in: validIds },
      user_id: userId
    }).select('_id');

    const phoneIds = phones.map(p => p._id.toString());


    const foundIds = [...new Set([...wabaIds, ...phoneIds])];
    const notFoundIds = validIds.filter(
      id => !foundIds.includes(id.toString())
    );


    if (wabaIds.length > 0) {

      await WhatsappWaba.deleteMany({
        _id: { $in: wabaIds },
        user_id: userId
      });

      await WhatsappPhoneNumber.deleteMany({
        user_id: userId,
        waba_id: { $in: wabaIds }
      });
    }


    if (phoneIds.length > 0) {
      await WhatsappPhoneNumber.deleteMany({
        _id: { $in: phoneIds },
        user_id: userId
      });
    }


    let message = `${foundIds.length} connection(s) deleted successfully`;

    if (notFoundIds.length > 0) {
      message += `, ${notFoundIds.length} connection(s) not found`;
    }

    return res.status(200).json({
      success: true,
      message,
      data: {
        deletedCount: foundIds.length,
        deletedIds: foundIds,
        notFoundIds
      }
    });

  } catch (error) {
    console.error('Error deleting connections:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete connections',
      error: error.message
    });
  }
};

export const setPrimaryPhoneNumber = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { phoneNumberId } = req.params;

    const phoneNumber = await WhatsappPhoneNumber.findOne({
      _id: phoneNumberId,
      user_id: userId,
      deleted_at: null
    });

    if (!phoneNumber) {
      return res.status(404).json({
        success: false,
        error: 'Phone number not found'
      });
    }

    await WhatsappPhoneNumber.updateMany(
      {
        user_id: userId,
        _id: { $ne: phoneNumberId },
        deleted_at: null
      },
      { $set: { is_primary: false } }
    );

    await WhatsappPhoneNumber.findByIdAndUpdate(
      phoneNumberId,
      { $set: { is_primary: true } },
      { returnDocument: 'after' }
    );

    const updatedPhoneNumber = await WhatsappPhoneNumber.findById(phoneNumberId)
      .populate('waba_id')
      .lean();

    return res.json({
      success: true,
      message: 'Primary phone number updated successfully',
      data: {
        display_phone_number: updatedPhoneNumber.display_phone_number,
        is_primary: updatedPhoneNumber.is_primary
      }
    });
  } catch (error) {
    console.error('Error setting primary phone number:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to set primary phone number',
      details: error.message
    });
  }
};

const sendMultipleMediaUrls = async (params, res) => {
  const { userId, contact, whatsappPhoneNumber, mediaUrls, messageText, providerType, connectionId } = params;

  try {
    const sentMessages = [];
    const failedUrls = [];

    // 1. Process uploaded files first
    for (let i = 0; i < uploadedFiles.length; i++) {
      const file = uploadedFiles[i];
      try {
        const mediaType = getWhatsAppTypeFromMime(file.mimetype) || 'document';

        const fileCaption = messageText || undefined;

        const messageParams = {
          contactId: contact._id,
          recipientNumber: contact.phone_number,
          messageText: fileCaption,
          messageType: mediaType,
          file,
          providerType,
          connectionId,
          whatsappPhoneNumber,
          whatsappPhoneNumberId,
          replyMessageId
        };

        const result = await unifiedWhatsAppService.sendMessage(userId, messageParams);
        sentMessages.push({
          fileName: file.originalname,
          type: mediaType,
          result: result
        });

      } catch (error) {
        console.error(`Error sending uploaded file ${file.originalname}:`, error);
        failedItems.push({
          fileName: file.originalname,
          error: error.message
        });
      }
    }

    // 2. Process media URLs
    for (let i = 0; i < mediaUrls.length; i++) {
      const mediaUrl = mediaUrls[i];
      const isLast = i === mediaUrls.length - 1;

      try {
        const mediaType = getMediaTypeFromUrl(mediaUrl);

        const currentIdx = uploadedFiles.length + i;
        const fileCaption = messageText || undefined;

        const messageParams = {
          recipientNumber: contact.phone_number,
          messageText: fileCaption,
          messageType: mediaType,
          mediaUrl: mediaUrl,
          providerType,
          connectionId,
          whatsappPhoneNumber
        };

        const result = await unifiedWhatsAppService.sendMessage(userId, messageParams);
        sentMessages.push({
          url: mediaUrl,
          type: mediaType,
          result: result
        });

      } catch (error) {
        console.error(`Error sending media URL ${mediaUrl}:`, error);
        failedUrls.push({
          url: mediaUrl,
          error: error.message
        });
      }
    }

    if (sentMessages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No media URLs were successfully sent',
        failed: failedUrls
      });
    }

    return res.json({
      success: true,
      message: `Successfully sent ${sentMessages.length} media files`,
      data: {
        totalUrls: mediaUrls.length,
        sentMessages: sentMessages.length,
        failedUrls: failedUrls.length,
        sent: sentMessages,
        failed: failedUrls
      }
    });

  } catch (error) {
    console.error('Error sending multiple media URLs:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to send multiple media URLs',
      details: error.message
    });
  }
};


const getMediaTypeFromUrl = (url) => {
  const lowerUrl = url.toLowerCase();
  console.log("lowerUrl", lowerUrl);
  if (lowerUrl.match(/\.(jpg|jpeg|png|gif|webp|bmp|tiff|svg)(\?.*)?$/i)) {
    return 'image';
  }
  if (lowerUrl.match(/\.(mp4|avi|mov|wmv|flv|webm|mkv)(\?.*)?$/i)) {
    return 'video';
  }
  if (lowerUrl.match(/\.(mp3|wav|ogg|flac|aac|m4a|wma)(\?.*)?$/i)) {
    return 'audio';
  }
  if (lowerUrl.match(/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|rtf|csv)(\?.*)?$/i)) {
    return 'document';
  }

  return 'document';
};


export const assignChatToAgent = assignChatToAgentFromChat;

export const getBaileysQRCode = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { wabaId } = req.params;
    const syncChat = req.query.sync_chat === 'true';

    if (!wabaId) {
      return res.status(400).json({
        success: false,
        error: 'WABA ID is required'
      });
    }

    let qrData;
    try {
      qrData = await unifiedWhatsAppService.getQRCode(userId, wabaId);
    } catch (qrErr) {
      const waba = await WhatsappWaba.findOne({ _id: wabaId, user_id: userId, deleted_at: null }).lean();
      if (!waba) {
        return res.status(404).json({ success: false, error: 'WABA not found' });
      }
      console.log(`QR requested for disconnected WABA ${wabaId}, triggering initialization... (sync_chat=${syncChat})`);
      unifiedWhatsAppService
        .initializeConnection(userId, 'baileys', { ...waba, sync_chat: syncChat })
        .catch(err => console.error(`Failed to init Baileys QR for WABA ${wabaId}:`, err));
      return res.json({
        success: true,
        data: { success: true, qr_code: null, status: 'generating' }
      });
    }

    const needsInit = !qrData.qr_code &&
      ['disconnected', 'qr_timeout', 'initial'].includes(qrData.status);

    if (needsInit) {
      const waba = await WhatsappWaba.findOne({
        _id: wabaId,
        user_id: userId,
        deleted_at: null
      });

      if (waba) {
        console.log(`QR requested for disconnected WABA ${wabaId}, triggering initialization... (sync_chat=${syncChat})`);
        unifiedWhatsAppService
          .initializeConnection(userId, 'baileys', { ...waba.toObject(), sync_chat: syncChat })
          .catch(err => console.error(`Failed to init Baileys QR for WABA ${wabaId}:`, err));

        return res.json({
          success: true,
          data: {
            success: true,
            qr_code: null,
            status: 'generating'
          }
        });
      }
    }

    return res.json({
      success: true,
      data: qrData
    });
  } catch (error) {
    console.error('Error fetching Baileys QR code:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch QR code',
      details: error.message
    });
  }
};

export const disconnectWhatsApp = async (req, res) => {
  try {
    const userId = req.user.id;
    const { provider, waba_id } = req.body;

    await unifiedWhatsAppService.disconnectWhatsApp(userId, provider, waba_id);

    return res.json({
      success: true,
      message: 'WhatsApp connection disconnected successfully'
    });
  } catch (error) {
    console.error('Error disconnecting WhatsApp:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to disconnect WhatsApp',
      details: error.message
    });
  }
};

export const getWabaList = async (req, res) => {
  try {
    const userId = req.user.id;

    const wabas = await WhatsappWaba.find({
      user_id: userId,
      deleted_at: null
    })
      .select('_id name whatsapp_business_account_id provider')
      .sort({ created_at: -1 })
      .lean();

    return res.json({
      success: true,
      data: wabas
    });
  } catch (error) {
    console.error('Error fetching WABA list:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch WABA list',
      details: error.message
    });
  }
};

export const getMessageLogs = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { page, limit, skip } = parsePaginationParams(req.query);
    const { status, timeFilter, search, platform } = req.query;

    const query = {
      user_id: userId,
      deleted_at: null
    };

    const andConditions = [
      {
        $or: [
          { message_type: { $ne: 'system_messages' } },
          { content: { $ne: 'Chat cleared' } }
        ]
      }
    ];

    const workspaceId = req.query.workspace_id || req.headers['x-workspace-id'];
    const hasValidWorkspace = workspaceId && mongoose.Types.ObjectId.isValid(workspaceId);

    if (hasValidWorkspace) {
      const identifiers = [];

      const wabas = await WhatsappWaba.find({ workspace_id: workspaceId, is_active: true }).lean();
      if (wabas.length > 0) {
        const wabaIds = wabas.map(w => w._id);
        const waPhones = await WhatsappPhoneNumber.find({ waba_id: { $in: wabaIds }, is_active: true }).lean();
        waPhones.forEach(p => {
          if (p.phone_number_id) identifiers.push(p.phone_number_id);
          if (p.display_phone_number) {
            identifiers.push(p.display_phone_number);
            identifiers.push(p.display_phone_number.replace(/\D/g, ''));
          }
        });
      }

      const fbPages = await FacebookPage.find({ workspace_id: workspaceId, is_active: true }).lean();
      fbPages.forEach(p => {
        if (p.page_id) identifiers.push(p.page_id);
        if (p.instagram_account_id) identifiers.push(p.instagram_account_id);
      });

      const tgConns = await TelegramConnection.find({ workspace_id: workspaceId, is_active: true }).lean();
      tgConns.forEach(t => {
        if (t.bot_id) identifiers.push(t.bot_id);
        if (t.bot_username) identifiers.push(t.bot_username);
      });

      if (identifiers.length > 0) {
        andConditions.push({
          $or: [
            { sender_number: { $in: identifiers } },
            { recipient_number: { $in: identifiers } },
            { sender_id: { $in: identifiers } },
            { recipient_id: { $in: identifiers } }
          ]
        });
      } else {
        andConditions.push({ _id: null });
      }
    }

    if (platform) {
      const lowerPlatform = platform.toLowerCase();
      if (lowerPlatform === 'whatsapp') {
        andConditions.push({
          $or: [
            { platform: 'whatsapp' },
            { platform: { $exists: false } },
            { platform: null },
            { platform: '' }
          ]
        });
      } else {
        andConditions.push({ platform: lowerPlatform });
      }
    }

    if (status && status !== 'All Status' && status !== 'all_status') {
      const lowerStatus = status.toLowerCase();
      if (lowerStatus === 'pending') {
        andConditions.push({ delivery_status: 'pending' });
      } else if (lowerStatus === 'read') {
        andConditions.push({ read_status: 'read' });
      } else if (['sent', 'delivered', 'failed'].includes(lowerStatus)) {
        andConditions.push({
          $or: [
            { wa_status: lowerStatus },
            { delivery_status: lowerStatus }
          ]
        });
      }
    }

    if (timeFilter && timeFilter !== 'All time' && timeFilter !== 'all_time') {
      const now = new Date();
      let startDate = null;

      if (timeFilter === 'today') {
        startDate = new Date(now);
        startDate.setHours(0, 0, 0, 0);
      } else if (timeFilter === 'last 24 hour' || timeFilter === 'last_24_hours') {
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      } else if (timeFilter === 'last week' || timeFilter === 'last_week') {
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else if (timeFilter === 'last 30 days' || timeFilter === 'last_30_days') {
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }

      if (startDate) {
        andConditions.push({ created_at: { $gte: startDate } });
      }
    }

    if (search) {
      andConditions.push({
        $or: [
          { sender_number: { $regex: search, $options: 'i' } },
          { recipient_number: { $regex: search, $options: 'i' } },
          { sender_id: { $regex: search, $options: 'i' } },
          { recipient_id: { $regex: search, $options: 'i' } },
          { content: { $regex: search, $options: 'i' } }
        ]
      });
    }

    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    const messages = await Message.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('contact_id', 'name phone_number')
      .lean();

    const total = await Message.countDocuments(query);

    return res.status(200).json({
      success: true,
      data: {
        logs: messages.map(msg => ({
          id: msg._id,
          phone_number: msg.direction === 'outbound'
            ? (msg.recipient_number || msg.recipient_id)
            : (msg.sender_number || msg.sender_id),
          platform: msg.platform || 'whatsapp',
          contact: msg.contact_id ? msg.contact_id.name : null,
          direction: msg.direction,
          provider: msg.provider,
          type: msg.message_type,
          content: msg.content || (msg.file_url ? 'Media File' : ''),
          status: msg.wa_status || msg.delivery_status,
          error: msg.wa_status === 'failed' ? (msg.metadata?.error || 'Unknown error') : null,
          sent_at: msg.created_at
        })),
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(total / limit),
          totalItems: total,
          itemsPerPage: limit
        }
      }
    });
  } catch (error) {
    console.error('Error fetching message logs:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch message logs',
      details: error.message
    });
  }
};

export const clearChat = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { contact_id, connection_id } = req.body;

    if (!contact_id) {
      return res.status(400).json({ success: false, error: 'contact_id is required' });
    }

    const contact = await Contact.findOne({
      $or: [
        { _id: contact_id, user_id: userId },
        { telegram_chat_id: contact_id, user_id: userId },
        { facebook_page_scoped_id: contact_id, user_id: userId },
        { instagram_scoped_id: contact_id, user_id: userId }
      ],
      deleted_at: null
    });

    if (!contact) {
      return res.status(404).json({ success: false, error: 'Contact not found' });
    }

    const platform = contact.source || 'whatsapp';
    const contactNumber = contact.phone_number || contact.telegram_chat_id || contact.facebook_page_scoped_id || contact.instagram_scoped_id;

    let myPhoneNumber = contactNumber;
    let senderId = null;
    let recipientId = null;
    let provider = null;
    let workspaceId = null;

    const { default: unifiedService } = await import('../services/whatsapp/unified-whatsapp.service.js');

    const lastMsg = await Message.findOne({ contact_id: contact._id, user_id: userId }).sort({ wa_timestamp: -1 }).lean();

    if (lastMsg) {
      if (lastMsg.direction === 'outbound') {
        myPhoneNumber = lastMsg.sender_number || myPhoneNumber;
        senderId = lastMsg.sender_id;
        recipientId = lastMsg.recipient_id;
      } else {
        myPhoneNumber = lastMsg.recipient_number || myPhoneNumber;
        senderId = lastMsg.recipient_id;
        recipientId = lastMsg.sender_id;
      }
      provider = lastMsg.provider;
      workspaceId = lastMsg.workspace_id;
    } else {
      if (connection_id && platform === 'whatsapp') {
        const providerInfo = await unifiedService.getProvider(userId, connection_id);
        if (providerInfo && providerInfo.connection) {
          myPhoneNumber = providerInfo.connection.registred_phone_number || providerInfo.connection.display_phone_number || myPhoneNumber;
        }
      } else if (platform === 'whatsapp') {
        const firstPhoneNumber = await WhatsappPhoneNumber.findOne({ user_id: userId, is_active: true, deleted_at: null }).lean();
        if (firstPhoneNumber) myPhoneNumber = firstPhoneNumber.display_phone_number;
      }
    }

    await Message.deleteMany({
      user_id: userId,
      $or: [
        { contact_id: contact._id },
        { sender_number: contactNumber },
        { recipient_number: contactNumber },
        { sender_id: contactNumber },
        { recipient_id: contactNumber }
      ]
    });

    const mockId = new mongoose.Types.ObjectId().toString();

   await Message.create({
      _id: mockId,
      user_id: userId,
      contact_id: contact._id,
      sender_number: myPhoneNumber,
      recipient_number: contactNumber,
      sender_id: senderId || myPhoneNumber,
      recipient_id: recipientId || contactNumber,
      platform: platform,
      provider: provider || platform,
      content: 'Chat cleared',
      message_type: 'system_messages',
      from_me: true,
      direction: 'outbound',
      wa_timestamp: new Date(),
      created_at: new Date(),
      workspace_id: workspaceId || contact.workspace_id || null
    });

    if (unifiedService.io) {
      unifiedService.io.emit('whatsapp:message', {
        id: mockId,
        messageId: mockId,
        contact_id: contact._id.toString(),
        contactId: contact._id.toString(),
        senderNumber: myPhoneNumber,
        recipientNumber: contactNumber,
        sender: { id: senderId || myPhoneNumber },
        recipient: { id: recipientId || contactNumber },
        platform: platform,
        provider: provider || platform,
        content: 'Chat cleared',
        messageText: 'Chat cleared',
        messageType: 'system_messages',
        fromMe: true,
        direction: 'outbound',
        createdAt: new Date(),
        wa_timestamp: new Date(),
        user_id: userId.toString(),
        workspace_id: workspaceId || contact.workspace_id || null
      });
    }

    if (connection_id && platform === 'whatsapp') {
      const connection = await WhatsappWaba.findOne({ _id: connection_id, user_id: userId }).lean();

      if (connection && connection.provider === 'baileys') {
        try {
          const { default: unifiedService } = await import('../services/whatsapp/unified-whatsapp.service.js');
          const provider = unifiedService.providers['baileys'];

          if (provider && provider.sockets) {
            const sock = provider.sockets.get(connection._id.toString());

            if (sock && contact.phone_number) {
              const jid = `${contact.phone_number}@s.whatsapp.net`;
              await sock.chatModify({ clear: 'all' }, jid);
              console.log(`[ClearChat] Cleared Baileys chat on device for ${jid}`);
            } else {
              console.log(`[ClearChat] No active Baileys socket found for waba_id ${connection._id} or missing phone number`);
            }
          }
        } catch (baileysErr) {
          console.error('[ClearChat] Failed to clear Baileys chat on device:', baileysErr);
        }
      }
    }

    return res.status(200).json({ success: true, message: 'Chat cleared successfully' });
  } catch (error) {
    console.error('Error clearing chat:', error);
    return res.status(500).json({ success: false, error: 'Failed to clear chat', details: error.message });
  }
};

export default {
  sendMessage,
  getContactProfile,
  getMessages,
  togglePinChat,
  getRecentChats,
  assignChatToAgent,
  getConnectionStatus,
  connectWhatsApp,
  getBaileysQRCode,
  updateConnection,
  deleteConnections,
  getUserConnections,
  getMyPhoneNumbers,
  setPrimaryPhoneNumber,
  getWabaPhoneNumbers,
  getEmbbededSignupConnection,
  getMessageLogs,
  clearChat,
  disconnectWhatsApp,
  getWabaList
};
