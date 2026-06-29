import {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    delay,
    downloadContentFromMessage
} from 'baileys-pro';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import BaseProvider from './base.provider.js';
import { WhatsappWaba, Message, Contact, WhatsappPhoneNumber, WabaConfiguration, Template, Submission, EcommerceProduct, ChatAssignment } from '../../../models/index.js';
import pino from 'pino';
import automationEngine from '../../../utils/automation-engine.js';
import { updateWhatsAppStatus } from '../../../utils/message-status.service.js';
import {
    isWithinWorkingHours,
    findMatchingBot,
    sendAutomatedReply,
    assignRoundRobin,
    handleSequenceReply
} from '../../../utils/automated-response.service.js';

const logger = pino({ level: 'silent' });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const recentlySentMessageIds = new Set();

export default class BaileysProvider extends BaseProvider {
    constructor() {
        super();
        this.sockets = new Map();
        this.initializing = new Map();
        this.io = null;
    }

    setIO(io) {
        this.io = io;
    }

    emitStatus(wabaId, status, data = {}) {
        if (this.io) {
            this.io.emit('whatsapp:connection:update', {
                waba_id: wabaId,
                status: status,
                timestamp: new Date(),
                user_id: data.user_id || undefined,
                ...data
            });
        }
    }

    async initializeConnection(userId, connectionData = null) {
        const wabaId = connectionData._id || connectionData.id;
        if (!wabaId) throw new Error('WABA ID is required for Baileys initialization');

        const sessionDir = path.join(process.cwd(), 'storage', 'sessions', 'baileys', wabaId.toString());

        if (this.sockets.has(wabaId.toString())) {
            const existingSock = this.sockets.get(wabaId.toString());
            if (connectionData.connection_status === 'qrcode' || connectionData.qr_code) {
                console.log(`Socket already active and QR generated for WABA ${wabaId}`);
                return { success: true, status: 'qrcode' };
            }
            console.log(`Socket already active for WABA ${wabaId}`);
            return { success: true, status: 'active' };
        }

        if (this.initializing.has(wabaId.toString())) {
            console.log(`Socket initialization already in progress for WABA ${wabaId}`);
            return { success: true, status: 'initializing' };
        }

        this.initializing.set(wabaId.toString(), true);

        try {
            if (!fs.existsSync(sessionDir)) {
                fs.mkdirSync(sessionDir, { recursive: true });
            }

            const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
            const { version, isLatest } = await fetchLatestBaileysVersion();

            const syncChat = connectionData.sync_chat;

            const sock = makeWASocket({
                version,
                printQRInTerminal: false,
                syncFullHistory: syncChat,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger)
                },
                logger,
                getMessage: async (key) => {
                    return { conversation: 'Hello' };
                }
            });

            this.sockets.set(wabaId.toString(), sock);

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {

                    const waba = await WhatsappWaba.findById(wabaId);

                    if (waba?.connection_status === 'connected') {

                        console.log(`Session invalidated for WABA ${wabaId} (was connected). QR required to re-authenticate.`);
                    } else if (waba && waba.connection_status !== 'qrcode') {
                        console.log(`New QR generated for WABA ${wabaId}`);
                    }

                    const qrBase64 = await QRCode.toDataURL(qr);
                    await WhatsappWaba.findByIdAndUpdate(wabaId, {
                        qr_code: qrBase64,
                        connection_status: 'qrcode'
                    });

                    this.emitStatus(wabaId, 'qrcode', { qr_code: qrBase64, session_expired: waba?.connection_status === 'connected' });
                }

                if (connection === 'close') {
                    const errorCode = (lastDisconnect.error)?.output?.statusCode;
                    const errorMessage = (lastDisconnect.error)?.message || (lastDisconnect.error)?.toString();
                    const isQRTimeout = errorCode === 408 || errorMessage?.includes('QR refs attempts ended');
                    const shouldReconnect = errorCode !== DisconnectReason.loggedOut && !isQRTimeout;

                    console.log(`Connection closed for WABA ${wabaId}. Error: ${errorMessage} (Code: ${errorCode}), reconnecting: ${shouldReconnect}`);

                    this.sockets.delete(wabaId.toString());

                    if (shouldReconnect) {
                        await delay(5000);

                        const freshData = await WhatsappWaba.findById(wabaId).lean();
                        await this.initializeConnection(userId, {
                            ...(freshData || connectionData),
                            sync_chat: connectionData.sync_chat
                        });
                    } else {
                        if (isQRTimeout) {
                            console.log(`QR timeout for WABA ${wabaId}. Breaking loop.`);
                        } else {
                            console.log(`Baileys logged out for WABA ${wabaId}. Cleaning up session and chat history...`);
                            try {
                                const phoneDoc = await WhatsappPhoneNumber.findOne({ waba_id: wabaId }).lean();
                                if (phoneDoc?._id) {

                                    const { deletedCount } = await Message.deleteMany({
                                        user_id: userId,
                                        whatsapp_phone_number_id: phoneDoc._id
                                    });
                                    console.log(`Deleted ${deletedCount} messages for phone ${phoneDoc.display_phone_number} (WABA ${wabaId}) on logout.`);
                                }
                            } catch (delErr) {
                                console.error(`Error deleting messages on logout for WABA ${wabaId}:`, delErr.message);
                            }
                        }

                        await WhatsappWaba.findByIdAndUpdate(wabaId, {
                            connection_status: 'disconnected',
                            qr_code: null
                        });

                        if (fs.existsSync(sessionDir)) {
                            try {
                                fs.rmSync(sessionDir, { recursive: true, force: true });
                                console.log(`Deleted session directory: ${sessionDir}`);
                            } catch (err) {
                                console.error(`Error deleting session directory: ${err.message}`);
                            }
                        }

                        this.emitStatus(wabaId, isQRTimeout ? 'qr_timeout' : 'disconnected', {
                            message: errorMessage,
                            code: errorCode
                        });


                        if (!isQRTimeout) {
                            const checkWaba = await WhatsappWaba.findById(wabaId).lean();
                            if (checkWaba && !checkWaba.deleted_at) {
                                console.log(`Regenerating QR code for WABA ${wabaId} after disconnect...`);
                                setTimeout(() => {
                                    this.initializeConnection(userId, connectionData).catch(err => {
                                        console.error(`Failed to regenerate QR code for WABA ${wabaId}:`, err);
                                    });
                                }, 5000);
                            } else {
                                console.log(`Skipping QR regeneration for WABA ${wabaId} as it is marked for deletion.`);
                            }
                        }
                    }
                } else if (connection === 'open') {
                    console.log(`Baileys connection opened for WABA ${wabaId}`);
                    const userJid = sock.user.id;
                    const phoneNumber = userJid.split(':')[0].split('@')[0];

                    await WhatsappWaba.findByIdAndUpdate(wabaId, {
                        connection_status: 'connected',
                        qr_code: null,
                    });

                    this.emitStatus(wabaId, 'connected', { phone_number: phoneNumber });

                    let phone = await WhatsappPhoneNumber.findOne({ waba_id: wabaId });
                    if (!phone) {
                        const phoneCount = await WhatsappPhoneNumber.countDocuments({ user_id: userId, deleted_at: null });
                        await WhatsappPhoneNumber.create({
                            user_id: userId,
                            waba_id: wabaId,
                            phone_number_id: userJid,
                            display_phone_number: phoneNumber,
                            is_active: true,
                            is_primary: phoneCount === 0
                        });
                    }
                }
            });

            sock.ev.on('messages.upsert', async (m) => {
                console.log(`[Baileys DEBUG] messages.upsert type=${m.type}, count=${m.messages?.length}`);
                if (m.type === 'append' || m.type === 'notify') {
                    for (const msg of m.messages) {
                        const msgKeys = msg.message ? Object.keys(msg.message) : [];
                        console.log(`[Baileys DEBUG] Raw message: ${JSON.stringify(msg)}`);
                        await this.handleIncomingMessage(userId, wabaId, msg);
                    }
                }
            });

            sock.ev.on('contacts.upsert', (contacts) => {
                console.log('[Baileys DEBUG] contacts.upsert:', JSON.stringify(contacts));
            });

            sock.ev.on('contacts.update', (updates) => {
                console.log('[Baileys DEBUG] contacts.update:', JSON.stringify(updates));
            });

            sock.ev.on('chats.upsert', (chats) => {
                console.log('[Baileys DEBUG] chats.upsert:', JSON.stringify(chats));
            });

            sock.ev.on('chats.update', (updates) => {
                console.log('[Baileys DEBUG] chats.update:', JSON.stringify(updates));
            });

            sock.ev.on('lid-mapping.update', (updates) => {
                console.log('[Baileys DEBUG] lid-mapping.update:', JSON.stringify(updates));
            });

            sock.ev.on('message-receipt.update', async (updates) => {
                for (const receipt of updates) {
                    const waMessageId = receipt.key.id;
                    console.log("receipt.receiptType", receipt.receiptType)
                    const status = receipt.receiptType === 'read' ? 'read' : (receipt.receiptType === 'delivered' ? 'delivered' : null);

                    if (!status) continue;

                    console.log(`Baileys receipt: ${waMessageId} -> ${status}`);
                    try {
                        const timestamp = new Date();
                        const updatedMessage = await updateWhatsAppStatus(waMessageId, status, timestamp);

                        if (updatedMessage) {
                            await automationEngine.triggerEvent("status_update", {
                                waMessageId: waMessageId,
                                status: status,
                                timestamp: timestamp,
                                recipientId: receipt.key.remoteJid,
                                messageId: updatedMessage._id.toString(),
                                userId: updatedMessage.user_id?.toString(),
                                workspaceId: updatedMessage.workspace_id?.toString()
                            });
                        }
                    } catch (err) { }
                }
            });

            sock.ev.on('messages.update', async (updates) => {
                for (const update of updates) {
                    if (update.update.status) {
                        const waMessageId = update.key.id;
                        let status = null;
                        console.log("update.update.status", update.update.status)

                        if (update.update.status === 2) status = 'sent';
                        else if (update.update.status === 3) status = 'delivered';
                        else if (update.update.status === 4) status = 'read';

                        if (status) {
                            console.log(`Baileys status update: ${waMessageId} -> ${status}`);
                            try {
                                const timestamp = new Date();
                                const updatedMessage = await updateWhatsAppStatus(waMessageId, status, timestamp);
                                if (updatedMessage) {
                                    await automationEngine.triggerEvent("status_update", {
                                        waMessageId: waMessageId,
                                        status: status,
                                        timestamp: timestamp,
                                        recipientId: update.key.remoteJid,
                                        messageId: updatedMessage._id.toString(),
                                        userId: updatedMessage.user_id?.toString(),
                                        workspaceId: updatedMessage.workspace_id?.toString()
                                    });
                                }
                            } catch (err) { }
                        }
                    }
                }
            });

            sock.ev.on('messaging-history.set', async (data) => {
                if (!syncChat) {
                    console.log(`History sync skipped for WABA ${wabaId} (sync_chat=false)`);
                    return;
                }
                setTimeout(() => {
                    this.processHistorySync(userId, wabaId, data).catch(err => {
                        console.error('Background history sync failed:', err);
                    });
                }, 100);
            });

            return { success: true };
        } finally {
            this.initializing.delete(wabaId.toString());
        }
    }

    async handleIncomingMessage(userId, wabaId, msg) {
        try {

            const remoteJid = msg.key.remoteJid;

            if (!remoteJid ||
                remoteJid === 'status@broadcast' ||
                remoteJid.endsWith('@broadcast') ||
                remoteJid.endsWith('@g.us')) {
                return;
            }

            if (!msg.message) {
                return;
            }

            const allKeys = Object.keys(msg.message);
            const INTERNAL_MSG_TYPES = [
                'protocolMessage',
                'senderKeyDistributionMessage',
                'appStateSyncKeyShare',
                'appStateSyncKeyRequest',
                'messageContextInfo',
                'requestPhoneNumberMessage',
                'deviceListMetadata',
                'deviceListMetadataVersion'
            ];
            const realKeys = allKeys.filter(k => !INTERNAL_MSG_TYPES.includes(k));
            console.log(`[Baileys DEBUG] handleIncomingMessage: allKeys=${JSON.stringify(allKeys)}, realKeys=${JSON.stringify(realKeys)}`);
            if (realKeys.length === 0) {
                console.log(`[Baileys DEBUG] Skipping purely internal/metadata message: ${allKeys.join(', ')}`);
                return;
            }

            const senderJid = msg.key.remoteJidAlt || remoteJid;

            if (!senderJid.endsWith('@s.whatsapp.net') && !senderJid.endsWith('@lid')) {
                console.log(`[Baileys DEBUG] Skipping unsupported JID format: ${senderJid}`);
                return;
            }

            let senderNumber = senderJid.split('@')[0];
            if (senderJid.endsWith('@lid')) {
                const sock = this.sockets.get(wabaId.toString());
                let resolvedPnJid = null;
                try {
                    if (sock?.signalRepository?.lidMapping?.getPNForLID) {
                        resolvedPnJid = await sock.signalRepository.lidMapping.getPNForLID(senderJid);
                        console.log(`[Baileys DEBUG] Resolved PN JID from getPNForLID: ${resolvedPnJid}`);
                    }
                } catch (err) {
                    console.error('[Baileys DEBUG] Error calling getPNForLID:', err.message);
                }

                if (resolvedPnJid && resolvedPnJid.endsWith('@s.whatsapp.net')) {
                    senderNumber = resolvedPnJid.split('@')[0];
                } else {
                    const phoneJid = msg.key.remoteJidAlt || msg.key.participant;
                    if (phoneJid && phoneJid.endsWith('@s.whatsapp.net')) {
                        senderNumber = phoneJid.split('@')[0];
                    } else if (sock?.store?.contacts?.[senderJid]?.id) {
                        senderNumber = sock.store.contacts[senderJid].id.split('@')[0];
                    } else if (msg.pushName) {
                        console.log(`[Baileys DEBUG] Using LID number as sender: ${senderNumber} (pushName: ${msg.pushName})`);
                    }
                }
            }

            const fromMe = msg.key.fromMe;
            if (msg.key.id && recentlySentMessageIds.has(msg.key.id)) {
                console.log(`[Baileys DEBUG] Skipping recently sent outbound message to avoid race condition duplicate: ${msg.key.id}`);
                return;
            }
            const phone = await WhatsappPhoneNumber.findOne({ waba_id: wabaId });
            const myNumber = phone?.display_phone_number;


            if (fromMe) {
                const sock = this.sockets.get(wabaId.toString());
                const myJidNumber = sock?.user?.id?.split(':')[0]?.split('@')[0];
                const isSelfEcho = (myJidNumber && senderNumber === myJidNumber) ||
                    (myNumber && senderNumber === myNumber);
                if (isSelfEcho) {
                    return;
                }
            }

            const existingMessage = await Message.findOne({ wa_message_id: msg.key.id });
            if (existingMessage) {
                return;
            }

            let contact = await Contact.findOne({
                created_by: userId,
                $or: [
                    { phone_number: senderNumber },
                    { 'metadata.whatsapp_lid': senderNumber }
                ]
            });

            if (contact) {
                if (contact.phone_number !== senderNumber && !senderJid.endsWith('@s.whatsapp.net')) {
                    console.log(`[Baileys DEBUG] Mapping incoming LID ${senderNumber} to existing contact phone number: ${contact.phone_number}`);
                    senderNumber = contact.phone_number;
                }

                if (contact.deleted_at) {
                    contact.deleted_at = null;
                    await contact.save();
                }
            } else {
                const isLid = senderJid.endsWith('@lid');
                contact = await Contact.create({
                    phone_number: senderNumber,
                    name: msg.pushName || senderNumber,
                    user_id: userId,
                    created_by: userId,
                    source: 'baileys',
                    metadata: isLid ? { whatsapp_lid: senderNumber } : {}
                });
                console.log(`[Baileys DEBUG] Created new contact for ${senderNumber} (isLid: ${isLid})`);
            }

            const unwrapped = this.unwrapMessage(msg.message);
            const messageType = this.getBaileysMessageType(unwrapped);
            const content = this.getBaileysMessageContent(unwrapped, messageType);

            let replyMessageId = unwrapped?.extendedTextMessage?.contextInfo?.stanzaId || null;
            let reactionMessageId = null;

            if (messageType === 'reaction') {
                reactionMessageId = unwrapped?.reactionMessage?.key?.id || null;
            }

            let fileUrl = null;
            if (['image', 'video', 'audio', 'document', 'sticker'].includes(messageType)) {
                fileUrl = await this.downloadMedia(wabaId, unwrapped, messageType);
            }

            const messageDoc = await Message.create({
                sender_number: fromMe ? myNumber : senderNumber,
                recipient_number: fromMe ? senderNumber : myNumber,
                user_id: userId,
                contact_id: contact._id,
                whatsapp_phone_number_id: phone?._id || null,
                content: content,
                message_type: messageType,
                file_url: fileUrl,
                from_me: fromMe,
                direction: fromMe ? 'outbound' : 'inbound',
                wa_message_id: msg.key.id,
                wa_jid: senderJid,
                wa_timestamp: new Date(msg.messageTimestamp * 1000),
                provider: 'baileys',
                interactive_data: messageType === 'location' ? {
                    location: {
                        latitude: unwrapped.locationMessage?.degreesLatitude,
                        longitude: unwrapped.locationMessage?.degreesLongitude,
                        name: unwrapped.locationMessage?.name,
                        address: unwrapped.locationMessage?.address
                    }
                } : messageType === 'interactive' ? {
                    type: unwrapped.buttonsResponseMessage ? 'button_reply' : 'list_reply',
                    button_reply: unwrapped.buttonsResponseMessage ? {
                        id: unwrapped.buttonsResponseMessage.selectedButtonId,
                        title: unwrapped.buttonsResponseMessage.selectedDisplayText
                    } : undefined,
                    list_reply: unwrapped.listResponseMessage ? {
                        id: unwrapped.listResponseMessage.singleSelectReply?.selectedRowId,
                        title: unwrapped.listResponseMessage.title,
                        description: unwrapped.listResponseMessage.description
                    } : undefined
                } : null,
                reply_message_id: replyMessageId,
                reaction_message_id: reactionMessageId,
                reaction_emoji: messageType === 'reaction' ? content : undefined
            });

            if (this.io) {
                try {
                    const populatedMessage = await Message.findById(messageDoc._id)
                        .populate({
                            path: 'template_id',
                            select: 'template_name language category status message_body body_variables header footer_text buttons meta_template_id'
                        })
                        .lean();

                    const formattedMessage = {
                        id: populatedMessage._id.toString(),
                        content: populatedMessage.content,
                        interactiveData: populatedMessage.interactive_data,
                        messageType: populatedMessage.message_type,
                        fileUrl: populatedMessage.file_url || null,
                        template: populatedMessage.template_id || null,
                        createdAt: populatedMessage.wa_timestamp,
                        can_chat: true,
                        delivered_at: populatedMessage.delivered_at || null,
                        delivery_status: populatedMessage.delivery_status || 'pending',
                        is_delivered: populatedMessage.is_delivered || false,
                        is_seen: populatedMessage.is_seen || false,
                        seen_at: populatedMessage.seen_at || null,
                        wa_status: populatedMessage.wa_status || null,
                        wa_message_id: populatedMessage.wa_message_id || null,
                        direction: populatedMessage.direction || null,
                        reply_message_id: populatedMessage.reply_message_id || null,
                        reaction_message_id: populatedMessage.reaction_message_id || null,
                        reaction_emoji: populatedMessage.reaction_emoji || null,
                        sender: {
                            id: populatedMessage.sender_number,
                            name: populatedMessage.sender_number
                        },
                        recipient: {
                            id: populatedMessage.recipient_number,
                            name: populatedMessage.recipient_number
                        },
                        user_id: populatedMessage.user_id?.toString(),
                        whatsapp_phone_number_id: phone?._id?.toString()
                    };

                    if (formattedMessage.reply_message_id) {
                        const replyMsg = await Message.findOne({ wa_message_id: formattedMessage.reply_message_id }).lean();
                        if (replyMsg) {
                            formattedMessage.reply_message = {
                                id: replyMsg._id.toString(),
                                content: replyMsg.content,
                                interactiveData: replyMsg.interactive_data,
                                messageType: replyMsg.message_type,
                                fileUrl: replyMsg.file_url || null,
                                template: replyMsg.template_id || null,
                                createdAt: replyMsg.wa_timestamp,
                                wa_message_id: replyMsg.wa_message_id || null,
                                direction: replyMsg.direction || null,
                                sender: {
                                    id: replyMsg.sender_number,
                                    name: replyMsg.sender_number
                                }
                            };
                        }
                    }

                    this.io.emit('whatsapp:message', formattedMessage);
                } catch (socketError) {
                    console.error('Error emitting socket message for Baileys:', socketError);
                }
            }

            if (!fromMe) {
                try {
                    const interactiveId = messageDoc.interactive_data?.button_reply?.id 
                        || messageDoc.interactive_data?.list_reply?.id 
                        || null;

                    await automationEngine.triggerEvent("message_received", {
                        platform: 'baileys',
                        message: interactiveId || content,
                        interactive_id: interactiveId,
                        senderNumber: senderNumber,
                        recipientNumber: myNumber,
                        messageType: messageType,
                        userId: userId.toString(),
                        workspaceId: phone?.workspace_id?.toString(),
                        whatsappPhoneNumberId: phone?._id?.toString(),
                        waMessageId: msg.key.id,
                        waJid: senderJid,
                        contactId: contact._id.toString(),
                        timestamp: new Date(msg.messageTimestamp * 1000),
                    });
                } catch (automationError) {
                    console.error('Error triggering automation engine:', automationError);
                }

                try {
                    const config = await WabaConfiguration.findOne({ waba_id: wabaId });

                    contact.last_incoming_message_at = new Date();
                    if (!contact.user_id) {
                        contact.user_id = userId;
                    }
                    await contact.save();

                    let automatedHandled = false;

                    const chatAssignment = await ChatAssignment.findOne({
                        sender_number: senderNumber,
                        whatsapp_phone_number_id: phone?._id,
                        status: 'assigned',
                        assigned_by: userId
                    }).lean();

                    if (chatAssignment && chatAssignment.chatbot_id) {
                        const isExpired = chatAssignment.chatbot_expires_at && new Date() > new Date(chatAssignment.chatbot_expires_at);
                        if (!isExpired) {
                            console.log(`[Baileys] Forwarding message to assigned chatbot ${chatAssignment.chatbot_id}`);
                            await sendAutomatedReply({
                                wabaId,
                                contactId: contact._id,
                                replyType: 'chatbot',
                                replyId: chatAssignment.chatbot_id,
                                senderNumber: senderNumber,
                                incomingText: content,
                                userId: userId,
                                whatsappPhoneNumberId: phone?._id
                            });
                            automatedHandled = true;
                        } else {
                            console.log(`[Baileys] Chatbot assignment expired for ${senderNumber}`);
                            await ChatAssignment.findByIdAndUpdate(chatAssignment._id, { chatbot_id: null, chatbot_expires_at: null });
                        }
                    }

                    if (!automatedHandled) {
                        const open = await isWithinWorkingHours(wabaId);
                        console.log("open0", open, config)
                        if (!open && config?.out_of_working_hours?.id) {
                            await sendAutomatedReply({
                                wabaId,
                                contactId: contact._id,
                                replyType: config.out_of_working_hours.type,
                                replyId: config.out_of_working_hours.id,
                                senderNumber: senderNumber,
                                incomingText: content,
                                userId: userId,
                                whatsappPhoneNumberId: phone?._id
                            });
                            automatedHandled = true;
                        }
                    }

                    if (!automatedHandled) {
                        const matchingBot = await findMatchingBot(wabaId, content, 'baileys', contact);
                        if (matchingBot) {
                            await sendAutomatedReply({
                                wabaId,
                                contactId: contact._id,
                                replyType: matchingBot.reply_type,
                                replyId: matchingBot.reply_id,
                                senderNumber: senderNumber,
                                incomingText: content,
                                userId: userId,
                                whatsappPhoneNumberId: phone?._id
                            });
                            automatedHandled = true;
                        }
                    }

                    const isNewContact = (Date.now() - new Date(contact.created_at).getTime() < 10000);
                    if (!automatedHandled && isNewContact) {
                        if (config?.welcome_message?.id) {
                            await sendAutomatedReply({
                                wabaId,
                                contactId: contact._id,
                                replyType: config.welcome_message.type,
                                replyId: config.welcome_message.id,
                                senderNumber: senderNumber,
                                incomingText: content,
                                userId: userId,
                                whatsappPhoneNumberId: phone?._id
                            });
                            automatedHandled = true;
                        }

                        if (config?.round_robin_assignment) {
                            await assignRoundRobin(userId, contact._id, phone?._id);
                        }
                    }

                    if (!automatedHandled && config?.fallback_message?.id) {
                        await sendAutomatedReply({
                            wabaId,
                            contactId: contact._id,
                            replyType: config.fallback_message.type,
                            replyId: config.fallback_message.id,
                            senderNumber: senderNumber,
                            incomingText: content,
                            userId: userId,
                            whatsappPhoneNumberId: phone?._id
                        });
                    }
                } catch (autoErr) {
                    console.error('Error in advanced automated handling for Baileys:', autoErr);
                }
            }
        } catch (error) {
            console.error('Error handling Baileys incoming message:', error);
        }
    }

    unwrapMessage(message) {
        if (!message) return message;
        if (message.ephemeralMessage) return this.unwrapMessage(message.ephemeralMessage.message);
        if (message.viewOnceMessage) return this.unwrapMessage(message.viewOnceMessage.message);
        if (message.viewOnceMessageV2) return this.unwrapMessage(message.viewOnceMessageV2.message);
        return message;
    }

    getBaileysMessageType(message) {
        if (!message) return 'text';
        const keys = Object.keys(message).filter(k =>
            k !== 'messageContextInfo' &&
            k !== 'deviceListMetadata' &&
            k !== 'deviceListMetadataVersion'
        );
        const type = keys[0];
        if (type === 'conversation' || type === 'extendedTextMessage') return 'text';
        if (type === 'imageMessage') return 'image';
        if (type === 'stickerMessage') return 'sticker';
        if (type === 'videoMessage') return 'video';
        if (type === 'audioMessage') return 'audio';
        if (type === 'documentMessage') return 'document';
        if (type === 'locationMessage') return 'location';
        if (type === 'reactionMessage') return 'reaction';
        if (type === 'buttonsResponseMessage') return 'interactive';
        if (type === 'listResponseMessage') return 'interactive';
        return 'text';
    }

    getBaileysMessageContent(message, type) {
        if (!message) return '';
        if (type === 'text') return message.conversation || message.extendedTextMessage?.text || '';
        if (type === 'image') return message.imageMessage?.caption || '';
        if (type === 'sticker') return '';
        if (type === 'video') return message.videoMessage?.caption || '';
        if (type === 'document') return message.documentMessage?.caption || '';
        if (type === 'location') {
            const loc = message.locationMessage;
            return `Location: ${loc.name || ''} ${loc.address || ''} (${loc.degreesLatitude}, ${loc.degreesLongitude})`.trim();
        }
        if (type === 'reaction') {
            return message.reactionMessage?.text || '';
        }
        if (type === 'interactive') {
            if (message.buttonsResponseMessage) {
                return message.buttonsResponseMessage.selectedDisplayText
                    || message.buttonsResponseMessage.selectedButtonId
                    || '';
            }
            if (message.listResponseMessage) {
                return message.listResponseMessage.title
                    || message.listResponseMessage.singleSelectReply?.selectedRowId
                    || '';
            }
            return '';
        }
        return '';
    }

    async sendMessage(userId, params, connection = null) {
        const wabaId = connection._id || connection.id;
        let sock = this.sockets.get(wabaId.toString());

        if (!sock) {
            await this.initializeConnection(userId, connection);
            sock = this.sockets.get(wabaId.toString());
            let attempts = 0;
            while (!sock?.user && attempts < 10) {
                await delay(1000);
                sock = this.sockets.get(wabaId.toString());
                attempts++;
            }
        }

        if (!sock) throw new Error('Baileys socket not initialized');

        const { recipientNumber, messageText, messageType: messageTypeInput, templateId } = params;
        let mediaUrl = params.mediaUrl;
        if (mediaUrl && !mediaUrl.startsWith('http')) {
            if (mediaUrl.startsWith('/uploads') || mediaUrl.startsWith('uploads')) {
                const relativePath = mediaUrl.startsWith('/') ? mediaUrl.slice(1) : mediaUrl;
                const absolutePath = path.join(process.cwd(), relativePath);
                if (fs.existsSync(absolutePath)) {
                    mediaUrl = absolutePath;
                }
            }
        }
        console.log(`Baileys sending message to ${recipientNumber}: type=${messageTypeInput}, mediaUrl=${mediaUrl}`);
        const messageType = messageTypeInput || (mediaUrl ? this.getMediaTypeFromUrl(mediaUrl) : 'text');
        let jid = `${recipientNumber}@s.whatsapp.net`;
        if (recipientNumber && recipientNumber.length >= 14) {
            jid = `${recipientNumber}@lid`;
        }
        const contact = await Contact.findOne({ phone_number: recipientNumber, created_by: userId });

        if (messageTypeInput === 'typing') {
            await sock.sendPresenceUpdate('composing', jid);
            return { success: true, status: 'typing_sent' };
        }

        let result;
        const isUrl = mediaUrl && mediaUrl.startsWith('http');
        const isLocalFile = mediaUrl && !isUrl && (mediaUrl.includes('/') || mediaUrl.includes('\\')) && fs.existsSync(mediaUrl);

        const sendOptions = {};
        if (params.replyMessageId) {
            sendOptions.quoted = {
                key: {
                    id: params.replyMessageId,
                    remoteJid: jid,
                    fromMe: false
                },
                message: { conversation: '' }
            };
        }

        if (messageType === 'text' || (!isUrl && !isLocalFile && mediaUrl)) {
            const textToSend = messageText || (mediaUrl && !isUrl && !isLocalFile ? mediaUrl : '');
            result = await sock.sendMessage(jid, { text: textToSend }, sendOptions);
        } else if (messageType === 'image') {
            result = await sock.sendMessage(jid, { image: { url: mediaUrl }, caption: messageText }, sendOptions);
        } else if (messageType === 'video') {
            result = await sock.sendMessage(jid, { video: { url: mediaUrl }, caption: messageText }, sendOptions);
        } else if (messageType === 'audio') {
            result = await sock.sendMessage(jid, { audio: { url: mediaUrl }, mimetype: 'audio/mp4' }, sendOptions);
        } else if (messageType === 'document') {
            const fileName = this.getFileNameFromUrl(mediaUrl);
            result = await sock.sendMessage(jid, { document: { url: mediaUrl }, fileName: fileName, caption: messageText }, sendOptions);
        } else if (messageType === 'sticker') {
            result = await sock.sendMessage(jid, { sticker: { url: mediaUrl } }, sendOptions);
        } else if (messageType === 'location') {
            const { locationParams } = params;
            if (locationParams) {
                result = await sock.sendMessage(jid, {
                    location: {
                        degreesLatitude: locationParams.latitude,
                        degreesLongitude: locationParams.longitude,
                        name: locationParams.name,
                        address: locationParams.address
                    }
                }, sendOptions);
            }
        } else if (messageType === 'reaction') {
            result = await sock.sendMessage(jid, {
                react: {
                    text: params.reactionEmoji,
                    key: {
                        id: params.reactionMessageId,
                        remoteJid: jid,
                        fromMe: false
                    }
                }
            });
        } else if (messageType === 'template') {
            let template = params.templateObj;
            if (!template && templateId) {
                template = await Template.findById(templateId).lean();
            }
            if (!template && params.templateName) {
                template = await Template.findOne({ template_name: params.templateName, user_id: userId, deleted_at: null }).lean();
            }
            if (!template) {
                throw new Error(`Template not found for sending: ${templateId || params.templateName}`);
            }

            let bodyText = template.message_body || '';
            let headerText = template.header?.text || '';
            let footerText = template.footer_text || '';
            let headerMediaUrl = template.header?.media_url || null;
            let headerMediaType = template.header?.media_type || null;

            const variables = params.templateVariables || {};
            const components = params.templateComponents || [];

            let bodyParams = [];
            let headerParams = [];
            let buttonParamsList = [];

            if (components && Array.isArray(components)) {
                components.forEach(comp => {
                    const compType = (comp.type || '').toLowerCase();
                    const paramsList = comp.parameters || [];
                    if (compType === 'body') {
                        bodyParams = paramsList.map(p => p.text);
                    } else if (compType === 'header') {
                        headerParams = paramsList.map(p => {
                            if (p.type === 'text') return p.text;
                            if (p.type === 'image') return p.image?.link || p.image?.url;
                            if (p.type === 'video') return p.video?.link || p.video?.url;
                            if (p.type === 'document') return p.document?.link || p.document?.url;
                            return '';
                        });
                    } else if (compType === 'button') {
                        buttonParamsList.push({
                            index: comp.index,
                            subType: comp.sub_type,
                            value: paramsList[0]?.text || paramsList[0]?.payload || ''
                        });
                    }
                });
            }

            if (bodyParams.length === 0 && variables) {
                if (Array.isArray(variables)) {
                    bodyParams = variables.map(v => String(v));
                } else if (typeof variables === 'object') {
                    const keys = Object.keys(variables).sort((a, b) => {
                        const na = parseInt(a, 10);
                        const nb = parseInt(b, 10);
                        if (!isNaN(na) && !isNaN(nb)) return na - nb;
                        return a.localeCompare(b);
                    });
                    bodyParams = keys.map(k => String(variables[k]));
                }
            }

            bodyParams.forEach((val, idx) => {
                bodyText = bodyText.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g'), String(val));
            });

            headerParams.forEach((val, idx) => {
                const placeholder = `{{${idx + 1}}}`;
                if (headerMediaType) {
                    if (typeof val === 'string' && val.startsWith('http')) {
                        headerMediaUrl = val;
                    }
                } else {
                    headerText = headerText.replace(new RegExp(`\\{\\{${idx + 1}\\}\\}`, 'g'), String(val));
                }
            });

            let interactiveButtons = [];
            if (template.buttons && Array.isArray(template.buttons)) {
                template.buttons.forEach((btn, idx) => {
                    const btnType = (btn.type || '').toLowerCase();
                    const btnText = btn.text || '';
                    if (btnType === 'quick_reply') {
                        interactiveButtons.push({
                            name: 'quick_reply',
                            buttonParamsJson: JSON.stringify({
                                display_text: btnText,
                                id: btn.id || `btn_${idx}`
                            })
                        });
                    } else if (btnType === 'url' || btnType === 'website') {
                        let btnUrl = btn.url || btn.website_url || '';
                        const matchedParam = buttonParamsList.find(bp => String(bp.index) === String(idx));
                        if (matchedParam) {
                            btnUrl = btnUrl.replace(/\{\{1\}\}/g, String(matchedParam.value));
                        } else if (bodyParams.length > 0 && btnUrl.includes('{{')) {
                            btnUrl = btnUrl.replace(/\{\{1\}\}/g, String(bodyParams[bodyParams.length - 1]));
                        }
                        interactiveButtons.push({
                            name: 'cta_url',
                            buttonParamsJson: JSON.stringify({
                                display_text: btnText,
                                url: btnUrl
                            })
                        });
                    } else if (btnType === 'phone_call') {
                        let phone = btn.phone_number || '';
                        if (phone && !phone.startsWith('+')) {
                            phone = '+' + phone;
                        }
                        interactiveButtons.push({
                            name: 'cta_call',
                            buttonParamsJson: JSON.stringify({
                                display_text: btnText,
                                phone_number: phone
                            })
                        });
                    } else if (btnType === 'copy_code') {
                        let code = btn.example || btn.text || '';
                        const matchedParam = buttonParamsList.find(bp => bp.subType === 'copy_code');
                        if (matchedParam) {
                            code = matchedParam.value;
                        }
                        interactiveButtons.push({
                            name: 'cta_copy',
                            buttonParamsJson: JSON.stringify({
                                display_text: btnText,
                                id: btn.id || btn.copy_code || `btn_${idx}`,
                                copy_code: code
                            })
                        });
                    }
                });
            }

            if (headerMediaUrl && !headerMediaUrl.startsWith('http')) {
                if (headerMediaUrl.startsWith('/uploads') || headerMediaUrl.startsWith('uploads')) {
                    const relativePath = headerMediaUrl.startsWith('/') ? headerMediaUrl.slice(1) : headerMediaUrl;
                    const absolutePath = path.join(process.cwd(), relativePath);
                    if (fs.existsSync(absolutePath)) {
                        headerMediaUrl = absolutePath;
                    }
                }
            }

            const carouselComp = components?.find(comp => comp.type?.toLowerCase() === 'carousel');
            if (carouselComp) {
                const templateCards = template.carousel_cards || [];

                const cardPromises = templateCards.map(async (tCard, idx) => {
                    const resolvedCard = carouselComp.cards?.find(c => c.card_index === idx);
                    const bodyComp = tCard.components?.find(c => c.type?.toLowerCase() === 'body');
                    const titleText = bodyComp?.text || '';

                    let mediaUrl = '';
                    let mediaType = 'image';

                    const paramHeader = resolvedCard?.components?.find(c => c.type?.toLowerCase() === 'header');
                    const paramMedia = paramHeader?.parameters?.[0];
                    if (paramMedia) {
                        mediaType = paramMedia.type || 'image';
                        mediaUrl = paramMedia[mediaType]?.link || paramMedia[mediaType]?.url || '';
                    }

                    if (!mediaUrl) {
                        const staticHeader = tCard.components?.find(c => c.type?.toLowerCase() === 'header');
                        if (staticHeader) {
                            mediaUrl = staticHeader.media_url || '';
                            mediaType = staticHeader.format?.toLowerCase() || 'image';
                        }
                    }

                    if (mediaUrl && !mediaUrl.startsWith('http')) {
                        if (mediaUrl.startsWith('/uploads') || mediaUrl.startsWith('uploads')) {
                            const relativePath = mediaUrl.startsWith('/') ? mediaUrl.slice(1) : mediaUrl;
                            const absolutePath = path.join(process.cwd(), relativePath);
                            if (fs.existsSync(absolutePath)) {
                                mediaUrl = absolutePath;
                            }
                        }
                    }

                    const cardObj = {
                        title: '',
                        caption: titleText
                    };

                    const cardButtons = [];
                    const staticButtonComp = tCard.components?.find(c => c.type?.toLowerCase() === 'button');
                    if (staticButtonComp?.buttons && Array.isArray(staticButtonComp.buttons)) {
                        staticButtonComp.buttons.forEach((btn, btnIdx) => {
                            const btnText = btn.text || 'Click here';
                            const btnType = (btn.type || '').toLowerCase();

                            const paramButton = resolvedCard?.components?.find(
                                c => c.type?.toLowerCase() === 'button' && String(c.index) === String(btnIdx)
                            );

                            let btnId = `btn_${idx}_${btnIdx}`;
                            if (paramButton?.parameters?.[0]) {
                                const pVal = paramButton.parameters[0].payload || paramButton.parameters[0].text;
                                if (pVal) btnId = String(pVal);
                            } else if (btn.url) {
                                btnId = btn.url;
                            }

                            if (btnType === 'url') {
                                cardButtons.push({
                                    name: 'cta_url',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: btnText,
                                        url: btn.url || btnId,
                                        merchant_url: btn.url || btnId
                                    })
                                });
                            } else {
                                cardButtons.push({
                                    name: 'quick_reply',
                                    buttonParamsJson: JSON.stringify({
                                        display_text: btnText,
                                        id: btnId
                                    })
                                });
                            }
                        });
                    }

                    if (cardButtons.length > 0) {
                        cardObj.buttons = cardButtons;
                    }

                    if (mediaType === 'video') {
                        cardObj.video = { url: mediaUrl };
                    } else {
                        cardObj.image = { url: mediaUrl };
                    }

                    return cardObj;
                });

                const cards = await Promise.all(cardPromises);

                const messagePayload = {
                    text: bodyText || '',
                    footer: footerText || undefined,
                    cards: cards,
                    viewOnce: true
                };

                console.log('[Baileys DEBUG] Dispatching Carousel message payload:', JSON.stringify(messagePayload));
                result = await sock.sendMessage(jid, messagePayload, sendOptions);
            } else {
                let messagePayload = {};
                if (headerMediaUrl && headerMediaType) {
                    messagePayload = {
                        [headerMediaType]: { url: headerMediaUrl },
                        caption: bodyText,
                        title: headerText || undefined,
                        footer: footerText || undefined,
                        media: true
                    };
                    if (interactiveButtons.length > 0) {
                        messagePayload.interactiveButtons = interactiveButtons;
                    }
                } else {
                    if (interactiveButtons.length > 0) {
                        messagePayload = {
                            text: bodyText,
                            title: headerText || undefined,
                            footer: footerText || undefined,
                            interactiveButtons: interactiveButtons
                        };
                    } else {
                        let fullText = '';
                        if (headerText) fullText += `*${headerText}*\n\n`;
                        fullText += bodyText;
                        if (footerText) fullText += `\n\n_${footerText}_`;
                        messagePayload = { text: fullText };
                    }
                }

                console.log('[Baileys DEBUG] Dispatching Template message payload:', JSON.stringify(messagePayload));
                result = await sock.sendMessage(jid, messagePayload, sendOptions);
            }
        } else if (messageType === 'interactive') {
            const { interactiveType, buttonParams, listParams } = params;

            if (interactiveType === 'button') {
                const buttons = (buttonParams || []).map((btn, i) => ({
                    buttonId: btn.id || `btn_${i}`,
                    buttonText: { displayText: btn.title },
                    type: 1
                }));

                const buttonMessage = {
                    text: messageText || 'Please select an option',
                    footer: params.footerText || '',
                    buttons: buttons,
                    headerType: 1,
                    viewOnce: true
                };

                if (mediaUrl) {
                    buttonMessage.image = { url: mediaUrl };
                    buttonMessage.headerType = 4;
                }

                result = await sock.sendMessage(jid, buttonMessage, sendOptions);
            } else if (interactiveType === 'list') {
                let sections;
                if (listParams?.sections && Array.isArray(listParams.sections)) {
                    sections = listParams.sections.map(section => ({
                        title: section.title || 'Menu',
                        rows: (section.rows || []).map((row, i) => ({
                            title: row.title,
                            rowId: row.rowId || row.id || `row_${i}`,
                            description: row.description || ''
                        }))
                    }));
                } else {
                    sections = [
                        {
                            title: listParams?.sectionTitle || 'Menu',
                            rows: (listParams?.items || []).map((item, i) => ({
                                title: item.title,
                                rowId: item.id || `item_${i}`,
                                description: item.description || ''
                            }))
                        }
                    ];
                }

                const listMessage = {
                    text: messageText || listParams?.body || 'Please select an option',
                    footer: listParams?.footer || '',
                    title: listParams?.header || '',
                    buttonText: listParams?.buttonTitle || 'Select',
                    sections
                };

                result = await sock.sendMessage(jid, listMessage, sendOptions);
            }
        }

        if (!result) {
            throw new Error(`Failed to send message: Unsupported message type "${messageType}" or result undefined`);
        }

        if (result?.key?.id) {
            recentlySentMessageIds.add(result.key.id);
            setTimeout(() => recentlySentMessageIds.delete(result.key.id), 5000);
        }

        if (result?.key?.remoteJid) {
            console.log(`[Baileys DEBUG] sendMessage JID: ${result.key.remoteJid} (original JID sent: ${jid})`);
            if (result.key.remoteJid.endsWith('@lid')) {
                const lidNumber = result.key.remoteJid.split('@')[0];
                try {
                    const updateResult = await Contact.updateOne(
                        { phone_number: recipientNumber, created_by: userId },
                        { $set: { 'metadata.whatsapp_lid': lidNumber } }
                    );
                    console.log(`[Baileys DEBUG] Associated phone_number ${recipientNumber} with whatsapp_lid ${lidNumber}. Modified: ${updateResult.modifiedCount}`);
                } catch (updateErr) {
                    console.error('[Baileys DEBUG] Error storing whatsapp_lid in Contact metadata:', updateErr);
                }
            }
        }


        const phoneRecord = await WhatsappPhoneNumber.findOne({ waba_id: wabaId }).lean();
        const myNumber = phoneRecord?.display_phone_number || connection.display_phone_number || connection.registred_phone_number;

        const savedMessage = await Message.create({
            sender_number: myNumber,
            recipient_number: recipientNumber,
            user_id: userId,
            contact_id: contact?._id,
            whatsapp_phone_number_id: phoneRecord?._id || null,
            content: messageText,
            message_type: messageType,
            file_url: mediaUrl,
            from_me: true,
            direction: 'outbound',
            wa_message_id: result.key.id,
            wa_jid: jid,
            wa_timestamp: new Date(),
            provider: 'baileys',
            interactive_data: messageType === 'location' ? {
                location: params.locationParams
            } : messageType === 'interactive' ? {
                interactiveType: params.interactiveType,
                buttons: params.interactiveType === 'button' ? params.buttonParams : undefined,
                list: params.interactiveType === 'list' ? params.listParams : undefined
            } : null,
            reply_message_id: params.replyMessageId || null,
            reaction_message_id: params.reactionMessageId || null,
            template_id: templateId || null
        });

        return {
            id: savedMessage._id,
            messageId: savedMessage._id,
            waMessageId: result.key.id,
            status: 'sent'
        };
    }

    async getQRCode(userId, connection = null) {
        if (!connection) throw new Error('Connection not found');
        return {
            success: true,
            qr_code: connection.qr_code,
            status: connection.connection_status
        };
    }

    async getConnectionStatus(userId, connection = null) {
        if (!connection) return { connected: false };
        return {
            connected: connection.connection_status === 'connected',
            status: connection.connection_status
        };
    }

    async getMessages(userId, contactNumber, connection = null, options = {}) {

        const myNumber = connection.display_phone_number;

        const baseCondition = {
            $or: [
                { sender_number: contactNumber, recipient_number: myNumber, deleted_at: null },
                { sender_number: myNumber, recipient_number: contactNumber, deleted_at: null }
            ],
            user_id: userId
        };

        const query = { ...baseCondition };
        if (options.search) {
            query.content = { $regex: options.search, $options: 'i' };
        }

        const page = options.page || 1;
        const limit = options.limit || 30;
        const skip = (page - 1) * limit;

        const messages = await Message.find(query)
            .sort({ wa_timestamp: -1 })
            .skip(skip)
            .limit(limit)
            .populate('template_id')
            .populate('submission_id')
            .populate('user_id', 'name')
            .lean();

        const total = await Message.countDocuments(query);

        return {
            data: messages.reverse(),
            pagination: {
                total,
                page,
                limit,
                hasMore: total > skip + messages.length
            }
        };
    }

    async getRecentChats(userId, connection = null, options = {}) {
        if (!connection) {
            throw new Error('WhatsApp connection not found');
        }

        const myNumber = connection.registred_phone_number;
        const page = options.page || 1;
        const limit = options.limit || 15;
        const skip = (page - 1) * limit;

        const matchQuery = {
            $or: [
                { sender_number: myNumber },
                { recipient_number: myNumber }
            ],
            message_type: { $ne: 'reaction' },
            deleted_at: null
        };

        if (options.assignedNumbers && Array.isArray(options.assignedNumbers) && options.assignedNumbers.length > 0) {
            matchQuery.$or = [
                { sender_number: myNumber, recipient_number: { $in: options.assignedNumbers } },
                { recipient_number: myNumber, sender_number: { $in: options.assignedNumbers } }
            ];
        }

        const result = await Message.aggregate([
            { $match: matchQuery },
            { $sort: { wa_timestamp: -1 } },
            {
                $group: {
                    _id: {
                        $cond: [
                            { $eq: ["$sender_number", myNumber] },
                            "$recipient_number",
                            "$sender_number"
                        ]
                    },
                    lastMessage: { $first: "$$ROOT" }
                }
            },
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

        const contactNumbers = chatsData.map(c => c._id);
        const contacts = await Contact.find({
            phone_number: { $in: contactNumbers },
            created_by: userId,
            deleted_at: null
        }).select('phone_number name chat_status is_pinned').lean();

        const contactMap = contacts.reduce((acc, c) => {
            acc[c.phone_number] = c;
            return acc;
        }, {});

        const formattedChats = chatsData.map(chat => {
            const contactInfo = contactMap[chat._id];
            if (!contactInfo) return null;

            return {
                contact: {
                    id: contactInfo._id || null,
                    number: chat._id,
                    name: contactInfo.name || chat._id,
                    avatar: null,
                    chat_status: contactInfo.chat_status || 'open'
                },
                is_pinned: contactInfo.is_pinned || false,
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
        }).filter(Boolean);

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

    getMediaTypeFromUrl(url) {
        if (!url) return 'text';

        if (!url.startsWith('http') && !url.includes('/') && !url.includes('\\') && !url.includes('.')) {
            return 'text';
        }

        const extension = url.split('.').pop().toLowerCase().split('?')[0];
        const imageExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif'];
        const videoExtensions = ['mp4', 'mov', 'avi', 'mkv'];
        const audioExtensions = ['mp3', 'ogg', 'wav', 'm4a', 'aac'];

        if (imageExtensions.includes(extension)) return 'image';
        if (videoExtensions.includes(extension)) return 'video';
        if (audioExtensions.includes(extension)) return 'audio';

        if (url.includes('.') || url.startsWith('http')) {
            return 'document';
        }

        return 'text';
    }

    async downloadMedia(wabaId, message, type, silent = false) {
        try {
            const mediaMessage = message[`${type}Message`];
            if (!mediaMessage) return null;

            const stream = await downloadContentFromMessage(mediaMessage, type);
            let buffer = Buffer.from([]);
            for await (const chunk of stream) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            if (buffer.length === 0) {
                if (!silent) console.error(`Downloaded buffer is empty for ${type} message`);
                return null;
            }

            let extension = '';
            if (mediaMessage.fileName) {
                extension = path.extname(mediaMessage.fileName);
            } else if (mediaMessage.mimetype) {
                const mime = mediaMessage.mimetype.split(';')[0];
                const types = {
                    'image/jpeg': '.jpg',
                    'image/png': '.png',
                    'image/webp': '.webp',
                    'video/mp4': '.mp4',
                    'audio/mpeg': '.mp3',
                    'audio/ogg': '.ogg',
                    'audio/mp4': '.m4a',
                    'application/pdf': '.pdf'
                };
                extension = types[mime] || '';
            }

            const fileName = `${wabaId}_${Date.now()}_${mediaMessage.fileName || 'file'}${extension ? '' : (type === 'image' ? '.jpg' : type === 'video' ? '.mp4' : '')}${extension}`;
            const uploadDir = path.join(process.cwd(), 'uploads', 'whatsapp');
            if (!fs.existsSync(uploadDir)) {
                fs.mkdirSync(uploadDir, { recursive: true });
            }

            const filePath = path.join(uploadDir, fileName);
            fs.writeFileSync(filePath, buffer);

            console.log(`Media saved: ${filePath} (${buffer.length} bytes)`);

            return `uploads/whatsapp/${fileName}`;
        } catch (error) {
            if (silent) {

                const isExpected =
                    error?.output?.statusCode === 404 ||
                    error?.message?.includes('empty media key') ||
                    error?.cause?.code === 'ECONNRESET' ||
                    error?.code === 'ECONNRESET';
                if (!isExpected) {
                    console.error('Unexpected error downloading history media:', error.message);
                }
                return null;
            }
            console.error('Error downloading Baileys media:', error);
            return null;
        }
    }

    getFileNameFromUrl(url) {
        if (!url) return 'file';
        try {
            const parsedUrl = new URL(url);
            const pathname = parsedUrl.pathname;
            const fileName = pathname.substring(pathname.lastIndexOf('/') + 1);
            return fileName || 'file';
        } catch (e) {
            const parts = url.split('/');
            const lastPart = parts[parts.length - 1].split('?')[0];
        }
    }

    async processHistorySync(userId, wabaId, data) {
        console.log(`Processing history sync for WABA ${wabaId}...`);
        try {
            const { chats, contacts, messages, isLatest } = data;

            if (contacts && contacts.length > 0) {
                console.log(`Syncing ${contacts.length} historical contacts...`);
                for (const c of contacts) {
                    if (!c.id || c.id === 'status@broadcast' || c.id.endsWith('@g.us')) continue;

                    const senderNumber = c.id.split('@')[0];
                    if (senderNumber && senderNumber.length > 5) {
                        await Contact.updateOne(
                            { phone_number: senderNumber, created_by: userId },
                            {
                                $setOnInsert: { user_id: userId, created_by: userId, source: 'baileys', created_at: new Date() },
                                $set: { name: c.name || c.notify || senderNumber, updated_at: new Date() }
                            },
                            { upsert: true }
                        );
                    }
                }
            }

            if (messages && messages.length > 0) {
                console.log(`Syncing ${messages.length} historical messages...`);
                const phone = await WhatsappPhoneNumber.findOne({ waba_id: wabaId }).lean();
                if (!phone) {
                    console.log(`Phone not found for WABA ${wabaId}, skipping historical message ingestion.`);
                    return;
                }
                const myNumber = phone.display_phone_number;

                const messageBulkOps = [];

                for (const msgObj of messages) {
                    try {
                        const msg = msgObj.message ? msgObj : (msgObj.msg || msgObj);
                        if (!msg.key) continue;

                        const remoteJid = msg.key.remoteJid;
                        if (!remoteJid || remoteJid === 'status@broadcast' || remoteJid.endsWith('@g.us')) continue;

                        const senderJid = msg.key.remoteJidAlt || remoteJid;
                        if (!senderJid.endsWith('@s.whatsapp.net')) continue;

                        const senderNumber = senderJid.split('@')[0];
                        const fromMe = msg.key.fromMe;

                        const timestamp = msg.messageTimestamp ? new Date(msg.messageTimestamp * 1000) : new Date();

                        const unwrapped = this.unwrapMessage(msg.message);
                        if (!unwrapped) continue;

                        const messageType = this.getBaileysMessageType(unwrapped);
                        const content = this.getBaileysMessageContent(unwrapped, messageType);

                        let replyMessageId = unwrapped?.extendedTextMessage?.contextInfo?.stanzaId || null;
                        let reactionMessageId = null;
                        if (messageType === 'reaction') {
                            reactionMessageId = unwrapped?.reactionMessage?.key?.id || null;
                        }

                        if (!fromMe) {
                            const contactName = msg.pushName || senderNumber;
                            await Contact.updateOne(
                                { phone_number: senderNumber, created_by: userId },
                                {
                                    $setOnInsert: { user_id: userId, created_by: userId, source: 'baileys' },
                                    $set: { name: contactName }
                                },
                                { upsert: true }
                            ).catch(() => { });
                        }

                        let fileUrl = null;

                        const messagePayload = {
                            sender_number: fromMe ? myNumber : senderNumber,
                            recipient_number: fromMe ? senderNumber : myNumber,
                            user_id: userId,
                            content: content,
                            message_type: messageType,
                            file_url: fileUrl,
                            from_me: fromMe,
                            direction: fromMe ? 'outbound' : 'inbound',
                            wa_message_id: msg.key.id,
                            wa_timestamp: timestamp,
                            provider: 'baileys',
                            reply_message_id: replyMessageId,
                            reaction_message_id: reactionMessageId,
                            reaction_emoji: messageType === 'reaction' ? content : undefined
                        };

                        if (messageType === 'location') {
                            messagePayload.interactive_data = {
                                location: {
                                    latitude: unwrapped.locationMessage?.degreesLatitude,
                                    longitude: unwrapped.locationMessage?.degreesLongitude,
                                    name: unwrapped.locationMessage?.name,
                                    address: unwrapped.locationMessage?.address
                                }
                            };
                        }

                        messageBulkOps.push({
                            updateOne: {
                                filter: { wa_message_id: msg.key.id },
                                update: { $setOnInsert: messagePayload },
                                upsert: true
                            }
                        });

                        if (messageBulkOps.length >= 500) {
                            await Message.bulkWrite(messageBulkOps, { ordered: false });
                            messageBulkOps.length = 0;
                            await new Promise(resolve => setTimeout(resolve, 50));
                        }

                    } catch (err) {
                    }
                }

                if (messageBulkOps.length > 0) {
                    await Message.bulkWrite(messageBulkOps, { ordered: false });
                }

                console.log(`Finished chunk processing of historical messages for WABA ${wabaId}`);
            }
        } catch (error) {
            console.error(`Error in processHistorySync for WABA ${wabaId}:`, error);
        }
    }

    async disconnect(userId, connection = null) {
        if (!connection) throw new Error('Connection not found');
        const wabaId = connection._id || connection.id;

        await Promise.all([
            WhatsappWaba.findByIdAndUpdate(wabaId, {
                connection_status: 'disconnected',
                is_active: false,
                qr_code: null,
                deleted_at: new Date()
            }),
            WhatsappPhoneNumber.updateMany(
                { waba_id: wabaId, user_id: userId },
                { deleted_at: new Date(), is_active: false }
            )
        ]);

        const sock = this.sockets.get(wabaId.toString());

        if (sock) {
            try {
                if (sock.user) {
                    console.log(`Explicitly logging out Baileys for WABA ${wabaId} (removing from linked devices)`);
                    await sock.logout();
                } else {
                    console.log(`Closing unauthenticated Baileys socket for WABA ${wabaId}`);
                    sock.end();
                }
            } catch (err) {
                console.error(`Error during Baileys logout for WABA ${wabaId}:`, err.message);
                try { sock.end(); } catch { }
            }
            this.sockets.delete(wabaId.toString());
        } else {
            this.emitStatus(wabaId, 'disconnected', { message: 'Disconnected by user' });
        }

        return { success: true };
    }
}
