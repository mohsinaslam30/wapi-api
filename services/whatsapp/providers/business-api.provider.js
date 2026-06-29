

import axios from 'axios';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import BaseProvider from './base.provider.js';
import { WhatsappConnection, Message, Contact, Template } from '../../../models/index.js';
import {
  uploadMediaToWhatsApp,
  getWhatsAppTypeFromMime,
  getWhatsAppMediaUrl
} from '../../../utils/uploadMediaToWhatsapp.js';
import { saveBufferLocally, getExtension } from '../../../utils/whatsapp-message-handler.js';
import ffmpegPath from 'ffmpeg-static';
import { execFile } from 'child_process';
import os from 'os';

function transcodeToOggOpus(inputBuffer) {
  return new Promise((resolve, reject) => {
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `input_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
    const outputPath = path.join(tempDir, `output_${Date.now()}_${Math.random().toString(36).slice(2)}.ogg`);

    fs.writeFile(inputPath, inputBuffer, (err) => {
      if (err) return reject(err);

      const args = [
        '-i', inputPath,
        '-vn',
        '-c:a', 'libopus',
        '-b:a', '16k',
        '-ac', '1',
        '-ar', '16000',
        '-y',
        outputPath
      ];

      execFile(ffmpegPath, args, (execErr, stdout, stderr) => {
        fs.unlink(inputPath, () => {});

        if (execErr) {
          fs.unlink(outputPath, () => {});
          console.error('[BusinessAPI] FFmpeg exec error:', execErr.message);
          console.error('[BusinessAPI] FFmpeg stderr:', stderr);
          return reject(execErr);
        }

        fs.readFile(outputPath, (readErr, outputBuffer) => {
          fs.unlink(outputPath, () => {});

          if (readErr) return reject(readErr);
          resolve(outputBuffer);
        });
      });
    });
  });
}

function transcodeToWebp(inputBuffer) {
  return new Promise((resolve, reject) => {
    const tempDir = os.tmpdir();
    const inputPath = path.join(tempDir, `input_${Date.now()}_${Math.random().toString(36).slice(2)}.tmp`);
    const outputPath = path.join(tempDir, `output_${Date.now()}_${Math.random().toString(36).slice(2)}.webp`);

    fs.writeFile(inputPath, inputBuffer, (err) => {
      if (err) return reject(err);

      const args = [
        '-i', inputPath,
        '-c:v', 'libwebp',
        '-vf', 'scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0',
        '-y',
        outputPath
      ];

      execFile(ffmpegPath, args, (execErr, stdout, stderr) => {
        fs.unlink(inputPath, () => {});

        if (execErr) {
          fs.unlink(outputPath, () => {});
          console.error('[BusinessAPI] FFmpeg webp exec error:', execErr.message);
          console.error('[BusinessAPI] FFmpeg webp stderr:', stderr);
          return reject(execErr);
        }

        fs.readFile(outputPath, (readErr, outputBuffer) => {
          fs.unlink(outputPath, () => {});

          if (readErr) return reject(readErr);
          resolve(outputBuffer);
        });
      });
    });
  });
}

const WHATSAPP_API_VERSION = 'v25.0';
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
  REACTION: 'reaction',
  TYPING: 'typing',
  STICKER: 'sticker'
};

export default class BusinessAPIProvider extends BaseProvider {

  async buildWhatsAppPayload(params) {
    const { recipientNumber, messageType, messageText, mediaId, mediaUrl, fileName, replyMessageId, reactionMessageId, reactionEmoji, isVoiceNote } = params;

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
        if (mediaId) {
          payload.audio.id = mediaId;
          console.log('[BusinessAPI] Audio payload using media ID:', mediaId);
        } else if (mediaUrl) {
          payload.audio.link = mediaUrl;
          console.log('[BusinessAPI] Audio payload using media URL:', mediaUrl);
        } else {
          console.error('[BusinessAPI] Audio payload has NO media ID or URL!');
        }

        if (isVoiceNote) {
          payload.audio.voice = true;
          console.log('[BusinessAPI] Voice note flag set to true');
        }
        break;

      case MESSAGE_TYPES.DOCUMENT:
        payload.document = {};
        if (mediaId) payload.document.id = mediaId;
        else if (mediaUrl) payload.document.link = mediaUrl;

        if (fileName) payload.document.filename = fileName;
        if (messageText) payload.document.caption = messageText;
        break;

      case MESSAGE_TYPES.STICKER:
        payload.sticker = {};
        if (mediaId) payload.sticker.id = mediaId;
        else if (mediaUrl) payload.sticker.link = mediaUrl;
        break;

      case MESSAGE_TYPES.LOCATION:
        const { location } = params;
        payload.location = {
          longitude: Number(location.longitude),
          latitude: Number(location.latitude),
          ...(location.name ? { name: location.name } : {}),
          ...(location.address ? { address: location.address } : {})
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
                display_text: params.buttonParams?.display_text || 'Visit',
                url: params.buttonParams?.url || ''
              }
            }
          };
        } else if (interactiveType === 'flow') {
          payload.interactive = {
            type: 'flow',
            body: {
              text: messageText
            },
            action: {
              name: 'flow',
              parameters: {
                flow_id: params.flowId,
                mode: 'published',
                flow_cta: params.buttonText || 'Open',
                flow_action: 'navigate',
                flow_context: {
                  flow_id: params.flowId,
                  screen: 'START'
                }
              }
            }
          };
        }
        break;

      case MESSAGE_TYPES.TYPING:
        delete payload.to;
        delete payload.type;
        payload.status = 'read';
        payload.message_id = params.replyMessageId || params.wa_message_id;
        if (!payload.message_id) {
          console.warn('[BusinessAPI] Cannot send typing indicator: No message_id found to associate with.');
          return { success: false, error: 'no_message_id' };
        }
        payload.typing_indicator = {
          type: 'text'
        };
        break;

      case MESSAGE_TYPES.TEMPLATE:
        const { templateName, languageCode, templateComponents } = params;

        payload.template = {
          name: templateName || params.template_name,
          language: { code: languageCode || params.language_code || 'en_US' }
        };

        if (templateComponents && templateComponents.length > 0) {
          const resolvedComponents = await Promise.all(templateComponents.map(async (comp) => {

            if (comp.type === 'header' && Array.isArray(comp.parameters)) {
              const resolvedParams = comp.parameters.map(p => {
                if (p.type && p[p.type]) {
                  let resolvedObj;
                  if (p[p.type].link) {
                    resolvedObj = { ...p, [p.type]: { ...p[p.type], link: this.getPublicMediaUrl(p[p.type].link) } };
                  } else {
                    resolvedObj = { ...p };
                  }

                  if (p.type === 'document' && !resolvedObj.document.filename) {
                    let filename = 'document.pdf';
                    if (params.campaignOriginalFilename) {
                      filename = params.campaignOriginalFilename;
                    } else if (params.templateObj?.header?.original_filename) {
                      filename = params.templateObj.header.original_filename;
                    } else {
                      const fileSource = p.document.link || p.document.handle || '';
                      try {
                        const decodedPath = decodeURIComponent(fileSource);
                        const urlWithoutQuery = decodedPath.split('?')[0];
                        const extractedFilename = path.basename(urlWithoutQuery);
                        if (extractedFilename && extractedFilename.includes('.')) {
                          filename = extractedFilename.replace(/-\d{10,13}(?=\.\w+$)/, '');
                        }
                      } catch (err) {
                        filename = 'document.pdf';
                      }
                    }
                    resolvedObj.document.filename = filename;
                  }
                  return resolvedObj;
                }
                return p;
              });
              return { ...comp, parameters: resolvedParams };
            }

            if (comp.type === 'carousel' && Array.isArray(comp.cards)) {
              const resolvedCards = await Promise.all(comp.cards.map(async (card) => {
                const resolvedCardComponents = await Promise.all((card.components || []).map(async (cardComp) => {
                  if (cardComp.type !== 'header' && cardComp.type !== 'button') return cardComp;

                  const resolvedParams = await Promise.all((cardComp.parameters || []).map(async (p) => {
                    if (p._uploadedFile) {
                      const file = p._uploadedFile;
                      const mediaId = await uploadMediaToWhatsApp({
                        phone_number_id: params.phone_number_id,
                        access_token: params.access_token,
                        buffer: file.buffer,
                        mime_type: file.mimetype,
                        filename: file.originalname
                      });
                      const { _uploadedFile, ...rest } = p;
                      rest[p.type] = { id: mediaId };
                      return rest;
                    }

                    if (p.type && p[p.type] && p[p.type].link) {
                      return { ...p, [p.type]: { ...p[p.type], link: this.getPublicMediaUrl(p[p.type].link) } };
                    }

                    return p;
                  }));
                  return { ...cardComp, parameters: resolvedParams };
                }));
                return { ...card, components: resolvedCardComponents };
              }));
              return { ...comp, cards: resolvedCards };
            }

            return comp;
          }));
          payload.template.components = resolvedComponents;
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
    console.log("phone_number_id", phone_number_id);
    const apiUrl = `${WHATSAPP_GRAPH_API_APP_URL}/${WHATSAPP_API_VERSION}/${phone_number_id}/messages`;
    console.log(`[BusinessAPI] Calling API URL: ${apiUrl}`);
    console.log('Sending WhatsApp API Payload:', JSON.stringify(payload, null, 2));

    let responseData = null;
    let lastError = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await axios.post(apiUrl, payload, {
          headers: {
            Authorization: `Bearer ${access_token}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        });
        responseData = response.data;
        break;
      } catch (err) {
        lastError = err;
        console.warn(`[BusinessAPI] Attempt ${attempt} failed: ${err.message}`);
        if (err.response) {
          responseData = err.response.data;
          break;
        }
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    if (!responseData && lastError) {
      throw new Error(`WhatsApp API network error: ${lastError.message}`);
    }

    console.log("responseData", responseData);

    if (responseData && responseData.error) {
      if (payload.type === 'typing_indicator') {
        console.warn('[BusinessAPI] Typing indicator not supported for this account. Skipping.');
        return { success: true, warning: 'typing_not_supported' };
      }
      throw new Error(
        `WhatsApp API error: ${responseData.error?.error_data?.details || responseData.error?.message || 'Unknown error'}`
      );
    }

    return responseData;
  }

  async processMediaUpload(params, userId = null) {
    const { file, phone_number_id, access_token, expectedMessageType } = params;

    if (!file) {
      return { mediaId: null, localPath: null, messageType: MESSAGE_TYPES.TEXT };
    }

    const messageType = expectedMessageType || getWhatsAppTypeFromMime(file.mimetype);
    const isVoiceNote = file.mimetype && (file.mimetype.includes('audio/ogg') || file.mimetype.includes('audio/webm') || file.originalname?.endsWith('.ogg') || file.originalname?.endsWith('.webm'));

    let uploadMimeType = file.mimetype;
    if (isVoiceNote) {
      if (!file.mimetype.includes('codecs=opus') && !file.mimetype.includes('opus')) {
        console.warn('[BusinessAPI] OGG file without Opus codec detected. WhatsApp may reject it.');
        console.warn('[BusinessAPI] File MIME type:', file.mimetype);
        uploadMimeType = 'audio/ogg; codecs=opus';
      }
    }

    let buffer = file.buffer;
    if (!buffer && (file.path || file.url)) {
      const target = file.path || file.url;
      try {
        const isLocalHost = target.includes('localhost') || target.includes('127.0.0.1');
        if (target.startsWith('http') && !isLocalHost) {
          const response = await axios.get(target, { responseType: 'arraybuffer' });
          buffer = Buffer.from(response.data);
        } else if (target.startsWith('blob:')) {
          console.error('[BusinessAPI] Cannot process browser-side blob URL in backend:', target);
          return { mediaId: null, localPath: null, messageType: MESSAGE_TYPES.TEXT };
        } else {
         let diskPath = target;
          if (isLocalHost) {
          const urlObj = new URL(target);
            diskPath = urlObj.pathname;
          }
          const absolutePath = path.join(process.cwd(), diskPath.startsWith('/') ? diskPath : `/${diskPath}`);
          if (fs.existsSync(absolutePath)) {
            buffer = fs.readFileSync(absolutePath);
          } else if (target.startsWith('http')) {
            const response = await axios.get(target, { responseType: 'arraybuffer' });
            buffer = Buffer.from(response.data);
          }
        }
      } catch (err) {
        console.error('[BusinessAPI] Error reading file for buffer:', err.message);
      }
    }

    if (!buffer) {
      throw new Error("Could not retrieve file buffer for WhatsApp upload.");
    }

    let finalVoiceNote = isVoiceNote;
    if (isVoiceNote) {
      try {
        console.log('[BusinessAPI] Transcoding voice note buffer to valid OGG/Opus using ffmpeg...');
        const startTime = Date.now();
        buffer = await transcodeToOggOpus(buffer);
        console.log(`[BusinessAPI] Transcoding completed in ${Date.now() - startTime}ms. New buffer size: ${buffer.length} bytes.`);
        uploadMimeType = 'audio/ogg; codecs=opus';
        file.mimetype = 'audio/ogg';
        if (file.originalname && !file.originalname.endsWith('.ogg')) {
          file.originalname = file.originalname.substring(0, file.originalname.lastIndexOf('.')) + '.ogg';
        } else if (!file.originalname) {
          file.originalname = 'audio_message.ogg';
        }
        finalVoiceNote = true;
      } catch (transcodeErr) {
        console.error('[BusinessAPI] Failed to transcode audio file:', transcodeErr.message);
      }
    }

    if (messageType === 'sticker') {
      try {
        console.log('[BusinessAPI] Transcoding sticker buffer to valid WEBP using ffmpeg...');
        const startTime = Date.now();
        buffer = await transcodeToWebp(buffer);
        console.log(`[BusinessAPI] Transcoding completed in ${Date.now() - startTime}ms. New buffer size: ${buffer.length} bytes.`);
        uploadMimeType = 'image/webp';
        file.mimetype = 'image/webp';
        if (file.originalname && !file.originalname.endsWith('.webp')) {
          file.originalname = file.originalname.substring(0, file.originalname.lastIndexOf('.')) + '.webp';
        } else if (!file.originalname) {
          file.originalname = 'sticker.webp';
        }
      } catch (transcodeErr) {
        console.error('[BusinessAPI] Failed to transcode sticker file:', transcodeErr.message);
      }
    }

    let localPath = null;
    try {
      localPath = await saveBufferLocally(buffer, file.mimetype, messageType, userId, file.originalname);
    } catch (saveErr) {
      console.error('[BusinessAPI] Error saving media:', saveErr.message);
    }

    const mediaId = await uploadMediaToWhatsApp({
      phone_number_id: phone_number_id,
      access_token: access_token,
      buffer: buffer,
      mime_type: uploadMimeType,
      filename: file.originalname
    });

    return { mediaId, localPath, messageType, isVoiceNote: finalVoiceNote };
  }


  getPublicMediaUrl(filePath) {
    if (!filePath) return null;
    if (typeof filePath !== 'string') return filePath;

    const appUrl = process.env.APP_URL || '';

    if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      if (appUrl && filePath.includes('localhost')) {
        try {
          const urlObj = new URL(filePath);
          const cleanAppUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
          return `${cleanAppUrl}${urlObj.pathname}${urlObj.search}`;
        } catch (e) {
          return filePath;
        }
      }
      return filePath;
    }

    if (appUrl) {
      const cleanPath = filePath.startsWith('/') ? filePath : `/${filePath}`;
      const cleanAppUrl = appUrl.endsWith('/') ? appUrl.slice(0, -1) : appUrl;
      return `${cleanAppUrl}${cleanPath}`;
    }

    console.warn('[BusinessAPI] APP_URL not set, media URL may not be accessible:', filePath);
    return filePath;
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
      contact = await Contact.findOneAndUpdate(
        { phone_number: recipientNumber, created_by: userId },
        {
          $setOnInsert: {
            phone_number: recipientNumber,
            name: recipientNumber,
            source: 'whatsapp',
            user_id: userId,
            created_by: userId,
            status: 'lead'
          },
          $set: { deleted_at: null }
        },
        { new: true, upsert: true }
      ).lean();
    } else {
      contact = { _id: params.contactId || null };
    }

    let mediaId = null;
    let fileMediaUrl = null;
    let localFilePath = null;
    let isVoiceNote = false;
    let targetFile = file;
    if (!targetFile && messageType === 'sticker' && mediaUrl) {
      targetFile = {
        url: mediaUrl,
        mimetype: 'image/png',
        originalname: mediaUrl.split('/').pop() || 'sticker.png'
      };
    }

    if (targetFile) {
      if (targetFile.buffer || targetFile.url || targetFile.path) {
        console.log('[BusinessAPI] Uploading media file:', {
          mimetype: targetFile.mimetype,
          originalname: targetFile.originalname,
          size: targetFile.size || (targetFile.buffer ? targetFile.buffer.length : 'N/A'),
          url: targetFile.url,
          path: targetFile.path
        });
        const mediaResult = await this.processMediaUpload({
          file: targetFile,
          phone_number_id,
          access_token,
          expectedMessageType: messageType
        }, userId);
        mediaId = mediaResult.mediaId;
        localFilePath = mediaResult.localPath;
        fileMediaUrl = null;
        isVoiceNote = mediaResult.isVoiceNote || false;
        console.log('[BusinessAPI] Media upload result:', {
          mediaId,
          localFilePath,
          isVoiceNote,
          messageType: mediaResult.messageType
        });
      }
    }

    const finalMediaUrl = fileMediaUrl || this.getPublicMediaUrl(mediaUrl);

    console.log('[BusinessAPI] Final media parameters:', {
      mediaId,
      finalMediaUrl,
      messageType,
      isVoiceNote,
      willUseMediaId: !!mediaId,
      willUseUrl: !mediaId && !!finalMediaUrl
    });

    let whatsappPayload;

    if (messageType === 'interactive') {
      if (interactiveType === 'button') {
        whatsappPayload = {
          messaging_product: 'whatsapp',
          to: recipientNumber,
          type: 'interactive',
          interactive: {
            type: 'button',
            header: (mediaId || finalMediaUrl) ? {
              type: 'image',
              image: mediaId ? { id: mediaId } : { link: finalMediaUrl }
            } : undefined,
            body: {
              text: messageText || 'Please select an option'
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
        const { header, body, footer, buttonTitle, sections: sectionsInput, items, sectionTitle } = listParams || {};

        let sections;
        if (sectionsInput && Array.isArray(sectionsInput)) {
          sections = sectionsInput.map(section => ({
            title: section.title || 'Options',
            rows: (section.rows || []).map((row, i) => ({
              id: row.rowId || row.id || `row_${i}`,
              title: row.title,
              description: row.description || ''
            }))
          }));
        } else {
          sections = [
            {
              title: sectionTitle || 'Options',
              rows: (items || []).map(item => ({
                id: item.id,
                title: item.title,
                description: item.description || ''
              }))
            }
          ];
        }

        whatsappPayload = {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipientNumber,
          type: 'interactive',
          interactive: {
            type: 'list',
            header: header ? {
              type: 'text',
              text: header
            } : undefined,
            body: {
              text: body || messageText || 'Please select an option'
            },
            footer: footer ? {
              text: footer
            } : undefined,
            action: {
              button: buttonTitle || 'Select',
              sections
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
      whatsappPayload = await this.buildWhatsAppPayload({
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
        isVoiceNote: isVoiceNote,
        reactionEmoji: reactionEmoji,
        phone_number_id,
        access_token,
        campaignOriginalFilename: params.campaignOriginalFilename,
        templateObj: params.templateObj
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
    if (!params.fromCampaignSystem && messageType !== MESSAGE_TYPES.TYPING) {
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

      let dbFileUrl = null;
      if (localFilePath) {
        dbFileUrl = localFilePath;
      } else if (mediaUrl) {
        if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://')) {
          dbFileUrl = mediaUrl;
        } else {
          dbFileUrl = mediaUrl.startsWith('/') ? mediaUrl : '/' + mediaUrl;
        }
      } else if (finalMediaUrl) {
        dbFileUrl = finalMediaUrl;
      }

      savedMessage = await Message.create({
        sender_number: myPhoneNumber,
        user_id: userId,
        recipient_number: recipientNumber,
        contact_id: contact?._id || params.contactId,
        content: contentToStore,
        message_type: messageType,
        file_url: dbFileUrl,
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
        template_id: templateId || null,
        delivery_status: 'sent',
        wa_status: 'sent'
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

    const page = options.page || 1;
    const limit = options.limit || 30;
    const skip = (page - 1) * limit;

    const messages = await Message.find(query)
      .sort({ wa_timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'template_id'
      })
      .populate('submission_id')
      .populate('user_id', 'name')
      .lean();

    const reversedMessages = messages.reverse();

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

    const total = await Message.countDocuments(query);

    const enrichedMessages = reversedMessages.map(message => ({
      ...message,
      can_chat: canChat,
      contact_id: contact ? contact._id.toString() : null
    }));

    return {
      data: enrichedMessages,
      pagination: {
        total,
        page,
        limit,
        hasMore: total > skip + messages.length
      }
    };
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

  async getRecentChats(userId, connection = null, options = {}) {
    if (!connection) {
      throw new Error('WhatsApp Business API connection not found');
    }

    const myPhoneNumber = connection.registred_phone_number;
    const page = options.page || 1;
    const limit = options.limit || 15;
    const skip = (page - 1) * limit;

    const matchQuery = {
      $or: [
        { sender_number: myPhoneNumber },
        { recipient_number: myPhoneNumber }
      ],
      message_type: { $ne: 'reaction' },
      deleted_at: null
    };

    if (options.assignedNumbers && Array.isArray(options.assignedNumbers) && options.assignedNumbers.length > 0) {
      matchQuery.$or = [
        { sender_number: myPhoneNumber, recipient_number: { $in: options.assignedNumbers } },
        { recipient_number: myPhoneNumber, sender_number: { $in: options.assignedNumbers } }
      ];
    }

    const result = await Message.aggregate([
      { $match: matchQuery },
      { $sort: { wa_timestamp: -1 } },
      {
        $group: {
          _id: {
            $cond: [
              { $eq: ["$sender_number", myPhoneNumber] },
              "$recipient_number",
              "$sender_number"
            ]
          },
          lastMessage: { $first: "$$ROOT" }
        }
      },
      {
        $lookup: {
          from: 'contacts',
          let: { contactNum: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$phone_number", "$$contactNum"] },
                    { $eq: ["$created_by", new mongoose.Types.ObjectId(userId)] },
                    { $eq: ["$deleted_at", null] }
                  ]
                }
              }
            }
          ],
          as: 'contact'
        }
      },
      { $unwind: "$contact" },
      { $sort: { "lastMessage.wa_timestamp": -1 } },
      {
        $facet: {
          metadata: [{ $count: "total" }],
          data: [{ $skip: skip }, { $limit: limit }]
        }
      }
    ]);

    const chatsData = result[0].data;
    const total = result[0].metadata[0]?.total || 0;

    const formattedChats = chatsData.map(chat => ({
      contact: {
        id: chat.contact._id.toString(),
        number: chat._id,
        name: chat.contact.name || chat._id,
        avatar: chat.contact.avatar || null,
        chat_status: chat.contact.chat_status || 'open'
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
    }));

    return {
      data: formattedChats,
      pagination: {
        total,
        page,
        limit,
        hasMore: total > skip + chatsData.length
      }
    };
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

    const deleteOps = [
      WhatsappWaba.findOneAndDelete(
        { _id: connection._id || connection.id, user_id: userId }
      )
    ];

    if (phone_number_id) {
      deleteOps.push(
        WhatsappConnection.findOneAndDelete(
          { phone_number_id: phone_number_id, user_id: userId }
        ),
        WhatsappPhoneNumber.deleteMany(
          {
            $or: [
              { waba_id: connection._id || connection.id },
              { phone_number_id: phone_number_id }
            ],
            user_id: userId
          }
        )
      );
    }

    await Promise.all(deleteOps);


    return { success: true };
  }
}

