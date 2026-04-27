import unifiedWhatsAppService, { PROVIDER_TYPES } from '../services/whatsapp/unified-whatsapp.service.js';
import { Message, ContactTag, ChatNote, WhatsappWaba, WhatsappPhoneNumber, Contact, Tag, ChatAssignment, User } from '../models/index.js';
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
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

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


const formatDateLabel = (date) => {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
};

const groupMessagesByDateAndSender = (messages, replyMessagesMap = {}, reactionsMap = {}) => {
  const groupedMessages = {};
  let lastSenderNumber = null;
  let lastDateKey = null;
  let currentGroup = null;

  messages.forEach((message) => {
    const dateKey = message.wa_timestamp.toISOString().split('T')[0];
    const senderNumber = message.sender_number;
    const recipientNumber = message.recipient_number;

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
          name: senderNumber,
          avatar: null
        },
        recipient: {
          id: recipientNumber,
          name: recipientNumber,
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
      createdAt: message.wa_timestamp,
      can_chat: message.can_chat,
      delivered_at: message.delivered_at || null,
      delivery_status: message.delivery_status || 'pending',
      is_delivered: message.is_delivered || false,
      is_seen: message.is_seen || false,
      seen_at: message.seen_at || null,
      wa_status: message.wa_status || null,
      wa_message_id: message.wa_message_id || null,
      direction: message.direction || null,
      reply_message_id: message.reply_message_id || null,
      reply_message: replyMessagesMap[message.reply_message_id] || null,
      reaction_message_id: message.reaction_message_id || null,
      sender: {
        id: senderNumber,
        name: (message.from_me && message.user_id?.name) ? message.user_id.name : senderNumber
      },
      agent: (message.from_me && message.user_id) ? {
        id: message.user_id._id || message.user_id,
        name: message.user_id.name || 'Unknown Agent'
      } : null,
      recipient: {
        id: recipientNumber,
        name: recipientNumber
      },
      reactions: reactionsMap[message.wa_message_id] || [],
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
      contact_id: contactIdInput,
      whatsapp_phone_number_id: whatsappPhoneNumberIdInput,
      contact_no: contactNoInput,
      whatsapp_phone_number: whatsappPhoneNumberInput,
      message,
      messageText: messageTextBody,
      provider,
      connection_id: connectionId,
      buttonParams,
      messageType: messageTypeInput,
      interactiveType,
      listParams,
      templateName,
      languageCode,
      templateVariables,
      templateComponents: templateComponentsInput,
      mediaUrl,
      mediaUrls,
      location,
      replyMessageId,
      reactionMessageId,
      reactionEmoji,
      amount,
      description,
      gateway_id,
      currency,
      coupon_code,
      carouselCardsData,
      carouselProducts,
      template_id: templateIdInput
    } = req.body;

    const uploadedFile = req.file || (req.files && req.files['file_url'] ? req.files['file_url'][0] : null);
    const carouselUploadedFiles = req.files && req.files['carousel_files'] ? req.files['carousel_files'] : [];

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

    let messageText = messageTextBody || message;
    let messageType = messageTypeInput;
    let whatsappPhoneNumberId = whatsappPhoneNumberIdInput;
    let contactId = contactIdInput;

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

      let contact = await Contact.findOne({ phone_number: cleanedPhone, user_id: userId, deleted_at: null }).lean();
      if (!contact) {
        contact = await Contact.create({
          phone_number: cleanedPhone,
          name: contactNoInput,
          user_id: userId,
          created_by: userId,
          status: 'lead'
        });
      }
      if (contact) {
        contactId = contact._id.toString();
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

    if (mediaUrls && Array.isArray(mediaUrls) && mediaUrls.length > 1) {
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
      locationParams: messageType === 'location' && location ? {
        latitude: location.latitude,
        longitude: location.longitude,
        name: location.name || undefined,
        address: location.address || undefined
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
    const { contact_id: contactId, whatsapp_phone_number_id: whatsappPhoneNumberId } = req.query;

    if (!contactId) {
      return res.status(400).json({
        success: false,
        error: 'Contact ID is required'
      });
    }

    let resolvedWhatsappPhoneNumberId = whatsappPhoneNumberId;
    if (!resolvedWhatsappPhoneNumberId) {
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

    const contact = await Contact.findById(contactId).populate('assigned_call_agent_id', 'name');
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    const whatsappPhoneNumber = await WhatsappPhoneNumber.findById(resolvedWhatsappPhoneNumberId)
      .populate('waba_id')
      .lean();

    if (!whatsappPhoneNumber || !whatsappPhoneNumber.waba_id) {
      return res.status(404).json({
        success: false,
        error: 'WhatsApp Phone Number not found'
      });
    }

    let myPhoneNumber = null;
    if (whatsappPhoneNumber) {
      myPhoneNumber = whatsappPhoneNumber.display_phone_number;
    }

    const notes = whatsappPhoneNumberId ? await ChatNote.find({
      contact_id: contactId,
      whatsapp_phone_number_id: whatsappPhoneNumberId,
      deleted_at: null
    })
      .select('note created_at')
      .lean() : [];


    let allMessages = await Message.find({
      $or: [
        { sender_number: contact.phone_number, recipient_number: myPhoneNumber },
        { sender_number: myPhoneNumber, recipient_number: contact.phone_number }
      ],
      user_id: userId,
      deleted_at: null,
      message_type: { $in: ['image', 'audio', 'video', 'document'] }
    }).lean();

    if (allMessages.length === 0) {
      allMessages = await Message.find({
        $or: [
          { sender_number: contact.phone_number, recipient_number: myPhoneNumber },
          { sender_number: myPhoneNumber, recipient_number: contact.phone_number }
        ],
        deleted_at: null,
        message_type: { $in: ['image', 'audio', 'video', 'document'] }
      }).lean();
      console.log('Found media messages without user_id filter:', allMessages.length);
    }

    if (allMessages.length === 0) {
      const allConversationMessages = await Message.find({
        $or: [
          { sender_number: contact.phone_number, recipient_number: myPhoneNumber },
          { sender_number: myPhoneNumber, recipient_number: contact.phone_number }
        ],
        deleted_at: null
      }).lean();

      allMessages = allConversationMessages.filter(msg =>
        ['image', 'video', 'audio', 'document'].includes(msg.message_type)
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
          { sender_number: contact.phone_number, receiver_number: myPhoneNumber },
          { sender_number: myPhoneNumber, receiver_number: contact.phone_number }
        ]
      };
      const statusMatch = { $or: [{ status: 'assigned' }, { status: { $exists: false } }] };

      const assignment = await ChatAssignment.findOne({
        whatsapp_phone_number_id: resolvedWhatsappPhoneNumberId,
        $and: [chatMatch, statusMatch]
      })
        .populate('agent_id', 'name email phone')
        .lean();


      if (assignment && assignment.agent_id) {
        assignedAgentId = assignment.agent_id;
      }
    }

    return res.json({
      success: true,
      contact: {
        _id: contact._id.toString(),
        name: contact.name,
        phone_number: contact.phone_number,
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
    documents: []
  };

  const weekGroups = {};

  messages.forEach((message) => {
    const messageType = message.message_type || message.messageType;
    if (['image', 'audio', 'video', 'document'].includes(messageType)) {
      const mediaPayload = {
        id: message._id.toString(),
        messageType: messageType,
        fileUrl: message.file_url || message.fileUrl,
        createdAt: message.wa_timestamp || message.createdAt || message.created_at,
        senderNumber: message.sender_number,
        recipientNumber: message.recipient_number
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
          documents: []
        };
      }

      switch (message.message_type) {
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
    const { contact_id: contactId, whatsapp_phone_number_id: whatsappPhoneNumberId, provider, connection_id, search, start_date, end_date } = req.query;

    if (!contactId) {
      return res.status(400).json({
        success: false,
        error: 'Contact ID is required'
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

    const contact = await Contact.findById(contactId);
    if (!contact) {
      return res.status(404).json({
        success: false,
        error: 'Contact not found'
      });
    }

    let whatsappPhoneNumber = await WhatsappPhoneNumber.findById(resolvedWhatsappPhoneNumberId)
      .populate('waba_id')
      .lean();

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

    const messages = await unifiedWhatsAppService.getMessages(
      userId,
      contact.phone_number,
      providerType,
      connectionId,
      whatsappPhoneNumber,
      {
        search: search && String(search).trim() ? String(search).trim() : null,
        start_date: startDate,
        end_date: endDate
      }
    );

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

    const baseMessages = messages.filter(m => m.message_type !== 'reaction');
    const reactionMessages = messages.filter(m => m.message_type === 'reaction');

    const reactionsMap = {};
    reactionMessages.forEach(rm => {
      const targetId = rm.reaction_message_id;
      if (targetId) {
        reactionsMap[targetId] = [{
          emoji: rm.content
        }];
      }
    });

    const groupedMessages = groupMessagesByDateAndSender(baseMessages, replyMessagesMap, reactionsMap);


    return res.json({
      success: true,
      messages: Object.values(groupedMessages)
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
    const {
      provider,
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

    const providerType = provider || null;

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
      const whatsappPhoneNumber = await WhatsappPhoneNumber.findById(resolvedWhatsappPhoneNumberId)
        .populate('waba_id')
        .lean();

      if (!whatsappPhoneNumber || !whatsappPhoneNumber.waba_id) {
        return res.status(404).json({
          success: false,
          error: 'WhatsApp Phone Number not found'
        });
      }

      if (req.user.role === 'agent') {
        let agentHasAssignment = await ChatAssignment.findOne({
          agent_id: req.user.id,
          whatsapp_phone_number_id: resolvedWhatsappPhoneNumberId,
          $or: [{ status: 'assigned' }, { status: { $exists: false } }]
        }).lean();
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
    console.log("called")
    const chats = await unifiedWhatsAppService.getRecentChats(userId, providerType, null, connection);

    let filteredChats = chats;
    if (req.user.role === 'agent' && myPhoneNumber) {
      const assignments = await ChatAssignment.find({
        agent_id: req.user.id,
        whatsapp_phone_number_id: resolvedWhatsappPhoneNumberId,
        $or: [{ status: 'assigned' }, { status: { $exists: false } }]
      }).select('sender_number receiver_number').lean();

      const assignedNumbers = new Set();
      assignments.forEach(a => {
        if (a.sender_number !== myPhoneNumber) assignedNumbers.add(a.sender_number);
        if (a.receiver_number !== myPhoneNumber) assignedNumbers.add(a.receiver_number);
      });

      filteredChats = chats.filter(chat =>
        assignedNumbers.has(chat.contact.number)
      );
    }

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

        return {
          ...chat,
          is_pinned: isPinned,
          contact: {
            ...chat.contact,
            id: contactId,
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

        return {
          ...chat,
          is_pinned: isPinned,
          contact: {
            ...chat.contact,
            id: contactId,
            name: contactInfo.name,
            is_pinned: isPinned,
            chat_status: contactInfo.chat_status || 'open',
            labels: mergeLabelDetails(contactId)
          }
        };
      });
    }

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
      filteredChats = filteredChats.filter(chat => {
        const last = chat.lastMessage;
        if (!last) return false;
        const isRead = last.is_seen === true || last.read_status === 'read' || last.read_status === 'read_by_multiple';
        return filterLastMessageRead ? isRead : !isRead;
      });
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
            recipient_number: myPhoneNumber,
            sender_number: { $in: filteredChats.map(c => c.contact.number) },
            deleted_at: null,
            $or: [
              { is_seen: false },
              { read_status: 'unread' }
            ]
          }
        },
        {
          $group: {
            _id: '$sender_number',
            count: { $sum: 1 }
          }
        }
      ]);

      const unreadCountMap = unreadCounts.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {});

      filteredChats = filteredChats.map(chat => ({
        ...chat,
        unread_count: unreadCountMap[chat.contact.number] || 0
      }));
    }

    return res.json({
      success: true,
      data: filteredChats
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
    const { provider, whatsapp_phone_number_id: whatsappPhoneNumberId } = req.query;

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
        whatsapp_business_account_id,
        deleted_at: null
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
        await waba.save();
      }

      let phoneNumber = await WhatsappPhoneNumber.findOne({
        user_id: userId,
        phone_number_id,
        deleted_at: null
      });

      if (phoneNumber) {
        phoneNumber.waba_id = waba._id;
        phoneNumber.display_phone_number = registred_phone_number;
        phoneNumber.is_active = true;
        await phoneNumber.save();
      } else {
        phoneNumber = await WhatsappPhoneNumber.create({
          user_id: userId,
          waba_id: waba._id,
          phone_number_id,
          display_phone_number: registred_phone_number,
          verified_name: name,
          is_active: true
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
  const userId = req.user.id;
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
      'https://graph.facebook.com/v22.0/oauth/access_token',
      {
        params: {
          client_id: APP_ID,
          client_secret: APP_SECRET,
          code
        }
      }
    );

    const accessToken = tokenRes.data.access_token;

    const phoneRes = await axios.get(
      `https://graph.facebook.com/v22.0/${signupData.phone_number_id}`,
      {
        params: {
          fields: 'display_phone_number,verified_name,quality_rating'
        },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    const { display_phone_number, verified_name, quality_rating } = phoneRes.data;

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
      whatsapp_business_account_id: signupData.waba_id,
      deleted_at: null
    });

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
      await waba.save();
    }

    let phoneNumber = await WhatsappPhoneNumber.findOne({
      user_id: userId,
      phone_number_id: signupData.phone_number_id,
      deleted_at: null
    });

    if (phoneNumber) {
      phoneNumber.waba_id = waba._id;
      phoneNumber.display_phone_number = display_phone_number;
      phoneNumber.verified_name = verified_name;
      phoneNumber.quality_rating = quality_rating;
      phoneNumber.is_active = true;
      await phoneNumber.save();
    } else {
      phoneNumber = await WhatsappPhoneNumber.create({
        user_id: userId,
        waba_id: waba._id,
        phone_number_id: signupData.phone_number_id,
        display_phone_number,
        verified_name,
        quality_rating,
        is_active: true
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
        quality_rating: phoneNumber.quality_rating,
        is_new_waba: !waba,
        is_new_phone: !phoneNumber
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

            try {
              const response = await axios.get(
                `https://graph.facebook.com/v22.0/${phone.phone_number_id}`,
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
    const wabas = await WhatsappWaba.find({
      user_id: effectiveUserId,
      is_active: true,
      deleted_at: null
    })
      .sort({ created_at: -1 })
      .lean();

    if (wabas.length === 0) {
      return res.json({
        success: true,
        data: [],
        total_wabas: 0,
        total_phone_numbers: 0
      });
    }

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

        if (phone.waba_id?.access_token) {
          try {
            const response = await axios.get(
              `https://graph.facebook.com/v22.0/${phone.phone_number_id}`,
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

        return {
          display_phone_number: phone.display_phone_number,
          id: phone._id,
          is_primary: phone.is_primary
        };
      })
    );

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

    const waba = await WhatsappWaba.findOne({
      _id: wabaId,
      user_id: userId,
      deleted_at: null
    });

    if (!waba) {
      return res.status(404).json({
        success: false,
        error: 'WABA not found'
      });
    }

    const totalPhoneNumbers = await WhatsappPhoneNumber.countDocuments({
      user_id: userId,
      waba_id: wabaId,
      deleted_at: null
    });

    const phoneNumbers = await WhatsappPhoneNumber.find({
      user_id: userId,
      waba_id: wabaId,
      deleted_at: null
    })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const enrichedPhoneNumbers = await Promise.all(
      phoneNumbers.map(async (phone) => {
        let verified_name = phone.verified_name;
        let quality_rating = phone.quality_rating;

        try {
          const response = await axios.get(
            `https://graph.facebook.com/v22.0/${phone.phone_number_id}`,
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

        return {
          id: phone._id,
          phone_number_id: phone.phone_number_id,
          verified_name: verified_name ?? "N/A",
          quality_rating: quality_rating ?? "N/A",
          display_phone_number: phone.display_phone_number,
          is_primary: phone.is_primary
        };
      })
    );

    const sortedPhoneNumbers = enrichedPhoneNumbers.sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      return 0;
    });

    return res.json({
      success: true,
      data: sortedPhoneNumbers,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalPhoneNumbers / limit),
        totalItems: totalPhoneNumbers,
        itemsPerPage: limit
      },
      waba_id: wabaId,
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

    for (let i = 0; i < mediaUrls.length; i++) {
      const mediaUrl = mediaUrls[i];
      const isLast = i === mediaUrls.length - 1;

      try {
        const mediaType = getMediaTypeFromUrl(mediaUrl);

        const fileCaption = mediaUrls.length > 1
          ? `${messageText || 'Shared media'} (${i + 1}/${mediaUrls.length})`
          : messageText || 'Shared media';

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
  disconnectWhatsApp,
  getWabaList
};
