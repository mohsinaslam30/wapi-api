import { WhatsappConnection, Message } from '../models/index.js';
import {
  uploadMediaToWhatsApp,
  getWhatsAppTypeFromMime,
  getWhatsAppMediaUrl
} from '../utils/uploadMediaToWhatsapp.js';


const WHATSAPP_API_VERSION = 'v19.0';
const WHATSAPP_GRAPH_API_APP_URL = 'https://graph.facebook.com';

const MESSAGE_TYPES = {
  TEXT: 'text',
  IMAGE: 'image',
  VIDEO: 'video',
  AUDIO: 'audio',
  DOCUMENT: 'document'
};

const DEFAULT_CAPTIONS = {
  [MESSAGE_TYPES.IMAGE]: 'Image attachment',
  [MESSAGE_TYPES.VIDEO]: '',
  [MESSAGE_TYPES.AUDIO]: '',
  [MESSAGE_TYPES.DOCUMENT]: ''
};


const validateConnectionFields = (fields) => {
  const { phoneNumberId, accessToken, whatsappBusinessAccountId } = fields;

  if (!phoneNumberId || !accessToken || !whatsappBusinessAccountId) {
    return {
      isValid: false,
      message: 'Phone number ID, access token, and WhatsApp Business Account ID are required'
    };
  }

  return { isValid: true };
};


const sanitizeConnectionData = (data) => {
  const sanitized = {};

  if (data.phoneNumberId) {
    sanitized.phone_number_id = data.phoneNumberId.trim();
  }

  if (data.accessToken) {
    sanitized.access_token = data.accessToken.trim();
  }

  if (data.whatsappBusinessAccountId) {
    sanitized.whatsapp_business_account_id = data.whatsappBusinessAccountId.trim();
  }

  return sanitized;
};


const buildWhatsAppPayload = (params) => {
  const { recipientNumber, messageType, messageText, mediaId, fileName } = params;

  const payload = {
    messaging_product: 'whatsapp',
    to: recipientNumber,
    type: messageType
  };

  switch (messageType) {
    case MESSAGE_TYPES.TEXT:
      payload.text = { body: messageText };
      break;

    case MESSAGE_TYPES.IMAGE:
      payload.image = {
        id: mediaId,
        caption: messageText || DEFAULT_CAPTIONS[MESSAGE_TYPES.IMAGE]
      };
      break;

    case MESSAGE_TYPES.VIDEO:
      payload.video = {
        id: mediaId,
        caption: messageText || DEFAULT_CAPTIONS[MESSAGE_TYPES.VIDEO]
      };
      break;

    case MESSAGE_TYPES.AUDIO:
      payload.audio = { id: mediaId };
      break;

    case MESSAGE_TYPES.DOCUMENT:
      payload.document = {
        id: mediaId,
        filename: fileName
      };
      if (messageText) {
        payload.document.caption = messageText;
      }
      break;

    default:
      throw new Error(`Unsupported message type: ${messageType}`);
  }

  return payload;
};


const sendWhatsAppAPIMessage = async (params) => {
  const { phoneNumberId, accessToken, payload } = params;

  const apiUrl = `${WHATSAPP_GRAPH_API_APP_URL}/${WHATSAPP_API_VERSION}/${phoneNumberId}/messages`;

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const responseData = await response.json();

  if (!response.ok) {
    throw new Error(
      `WhatsApp API error: ${responseData.error?.message || 'Unknown error'}`
    );
  }

  return responseData;
};


const processMediaUpload = async (params) => {
  const { file, phoneNumberId, accessToken } = params;

  if (!file) {
    return { mediaId: null, mediaUrl: null, messageType: MESSAGE_TYPES.TEXT };
  }

  const messageType = getWhatsAppTypeFromMime(file.mimetype);

  const mediaId = await uploadMediaToWhatsApp({
    phone_number_id: phoneNumberId,
    access_token: accessToken,
    buffer: file.buffer,
    mime_type: file.mimetype,
    filename: file.originalname
  });

  const mediaUrl = await getWhatsAppMediaUrl(mediaId, accessToken);

  return { mediaId, mediaUrl, messageType };
};


export const createWhatsappConnection = async (req, res) => {
  try {
    const {
      phone_number_id: phoneNumberId,
      access_token: accessToken,
      whatsapp_business_account_id: whatsappBusinessAccountId
    } = req.body;

    const validation = validateConnectionFields({
      phoneNumberId,
      accessToken,
      whatsappBusinessAccountId
    });

    if (!validation.isValid) {
      return res.status(400).json({ message: validation.message });
    }

    const userId = req.user.id;

    const connectionData = sanitizeConnectionData({
      phoneNumberId,
      accessToken,
      whatsappBusinessAccountId
    });

    const whatsappConnection = await WhatsappConnection.create({
      ...connectionData,
      user_id: userId
    });

    return res.status(201).json({
      message: 'WhatsApp connection created successfully',
      data: whatsappConnection
    });
  } catch (error) {
    console.error('Error creating WhatsApp connection:', error);
    return res.status(500).json({
      message: 'Failed to create WhatsApp connection',
      error: error.message
    });
  }
};


export const getWhatsappConnection = async (req, res) => {
  try {
    const userId = req.user.id;

    const whatsappConnection = await WhatsappConnection.findOne({
      user_id: userId
    });

    if (!whatsappConnection) {
      return res.status(404).json({
        message: 'WhatsApp connection not found'
      });
    }

    return res.status(200).json({
      message: 'WhatsApp connection retrieved successfully',
      data: whatsappConnection
    });
  } catch (error) {
    console.error('Error retrieving WhatsApp connection:', error);
    return res.status(500).json({
      message: 'Failed to retrieve WhatsApp connection',
      error: error.message
    });
  }
};


export const updateWhatsappConnection = async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      phone_number_id: phoneNumberId,
      access_token: accessToken,
      whatsapp_business_account_id: whatsappBusinessAccountId
    } = req.body;

    const updateData = sanitizeConnectionData({
      phoneNumberId,
      accessToken,
      whatsappBusinessAccountId
    });

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        message: 'At least one field is required to update'
      });
    }

    const whatsappConnection = await WhatsappConnection.findOneAndUpdate(
      { user_id: userId },
      { $set: updateData },
      { returnDocument: 'after', runValidators: true }
    );

    if (!whatsappConnection) {
      return res.status(404).json({
        message: 'WhatsApp connection not found'
      });
    }

    return res.status(200).json({
      message: 'WhatsApp connection updated successfully',
      data: whatsappConnection
    });
  } catch (error) {
    console.error('Error updating WhatsApp connection:', error);
    return res.status(500).json({
      message: 'Failed to update WhatsApp connection',
      error: error.message
    });
  }
};


export const sendMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { to: recipientNumber, message: messageText } = req.body;
    const uploadedFile = req.file;


    if (!recipientNumber) {
      return res.status(400).json({
        message: 'Recipient number is required'
      });
    }


    const whatsappConnection = await WhatsappConnection.findOne({
      user_id: userId
    });

    if (!whatsappConnection) {
      return res.status(404).json({
        message: 'WhatsApp connection not found. Please configure your connection first.'
      });
    }

    const { access_token: accessToken, phone_number_id: phoneNumberId } = whatsappConnection;

    const { mediaId, mediaUrl, messageType } = await processMediaUpload({
      file: uploadedFile,
      phoneNumberId,
      accessToken
    });

    const whatsappPayload = buildWhatsAppPayload({
      recipientNumber,
      messageType,
      messageText,
      mediaId,
      fileName: uploadedFile?.originalname
    });

    const apiResponse = await sendWhatsAppAPIMessage({
      phoneNumberId,
      accessToken,
      payload: whatsappPayload
    });

    const savedMessage = await Message.create({
      sender_number: whatsappConnection.registred_phone_number,
      recipient_number: recipientNumber,
      content: messageText || null,
      message_type: messageType,
      file_url: mediaUrl,
      file_type: uploadedFile?.mimetype || null,
      from_me: true,
      direction: 'outbound',
      wa_message_id: apiResponse.messages?.[0]?.id || null,
      wa_timestamp: new Date(),
      metadata: apiResponse
    });

    return res.status(200).json({
      success: true,
      message: 'WhatsApp message sent successfully',
      data: {
        messageId: savedMessage._id.toString(),
        waMessageId: savedMessage.wa_message_id,
        recipientNumber,
        messageType,
        timestamp: savedMessage.wa_timestamp,
        apiResponse
      }
    });
  } catch (error) {
    console.error('Error sending WhatsApp message:', error);
    return res.status(500).json({
      message: 'Failed to send WhatsApp message',
      error: error.message
    });
  }
};


export const deleteWhatsappConnection = async (req, res) => {
  try {
    const userId = req.user.id;

    const whatsappConnection = await WhatsappConnection.findOneAndDelete({
      user_id: userId
    });

    if (!whatsappConnection) {
      return res.status(404).json({
        message: 'WhatsApp connection not found'
      });
    }

    return res.status(200).json({
      message: 'WhatsApp connection deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting WhatsApp connection:', error);
    return res.status(500).json({
      message: 'Failed to delete WhatsApp connection',
      error: error.message
    });
  }
};

export default {
  createWhatsappConnection,
  getWhatsappConnection,
  updateWhatsappConnection,
  sendMessage,
  deleteWhatsappConnection
};
