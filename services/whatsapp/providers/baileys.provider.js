import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    delay,
    downloadContentFromMessage
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import BaseProvider from './base.provider.js';
import { WhatsappWaba, Message, Contact, WhatsappPhoneNumber, WabaConfiguration } from '../../../models/index.js';
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

export default class BaileysProvider extends BaseProvider {
    constructor() {
        super();
        this.sockets = new Map();
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
                    console.log(`Ignoring spurious QR for already-connected WABA ${wabaId}`);
                    return;
                }

                if (waba && waba.connection_status !== 'qrcode') {
                    console.log(`New QR generated for WABA ${wabaId}`);
                }

                const qrBase64 = await QRCode.toDataURL(qr);
                await WhatsappWaba.findByIdAndUpdate(wabaId, {
                    qr_code: qrBase64,
                    connection_status: 'qrcode'
                });

                this.emitStatus(wabaId, 'qrcode', { qr_code: qrBase64 });
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
                            if (phoneDoc?.display_phone_number) {
                                const myNum = phoneDoc.display_phone_number;
                                const { deletedCount } = await Message.deleteMany({
                                    user_id: userId,
                                    $or: [
                                        { sender_number: myNum },
                                        { recipient_number: myNum }
                                    ]
                                });
                                console.log(`Deleted ${deletedCount} messages for number ${myNum} on logout.`);
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
                    await WhatsappPhoneNumber.create({
                        user_id: userId,
                        waba_id: wabaId,
                        phone_number_id: userJid,
                        display_phone_number: phoneNumber,
                        is_active: true
                    });
                }
            }
        });

        sock.ev.on('messages.upsert', async (m) => {
            if (m.type === 'append' || m.type === 'notify') {
                for (const msg of m.messages) {
                    await this.handleIncomingMessage(userId, wabaId, msg);
                }
            }
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
                            userId: updatedMessage.user_id?.toString()
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
                                    userId: updatedMessage.user_id?.toString()
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

            const senderJid = msg.key.remoteJidAlt || remoteJid;

            if (!senderJid.endsWith('@s.whatsapp.net')) {
                return;
            }

            const senderNumber = senderJid.split('@')[0];
            const fromMe = msg.key.fromMe;
            const phone = await WhatsappPhoneNumber.findOne({ waba_id: wabaId });
            const myNumber = phone?.display_phone_number;

            const existingMessage = await Message.findOne({ wa_message_id: msg.key.id });
            if (existingMessage) {
                return;
            }

            let contact = await Contact.findOne({ phone_number: senderNumber, created_by: userId });
            if (!contact) {
                contact = await Contact.create({
                    phone_number: senderNumber,
                    name: msg.pushName || senderNumber,
                    user_id: userId,
                    created_by: userId,
                    source: 'baileys'
                });
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
            if (['image', 'video', 'audio', 'document'].includes(messageType)) {
                fileUrl = await this.downloadMedia(wabaId, unwrapped, messageType);
            }

            const messageDoc = await Message.create({
                sender_number: fromMe ? myNumber : senderNumber,
                recipient_number: fromMe ? senderNumber : myNumber,
                user_id: userId,
                contact_id: contact._id,
                content: content,
                message_type: messageType,
                file_url: fileUrl,
                from_me: fromMe,
                direction: fromMe ? 'outbound' : 'inbound',
                wa_message_id: msg.key.id,
                wa_timestamp: new Date(msg.messageTimestamp * 1000),
                provider: 'baileys',
                interactive_data: messageType === 'location' ? {
                    location: {
                        latitude: unwrapped.locationMessage?.degreesLatitude,
                        longitude: unwrapped.locationMessage?.degreesLongitude,
                        name: unwrapped.locationMessage?.name,
                        address: unwrapped.locationMessage?.address
                    }
                } : null,
                reply_message_id: replyMessageId,
                reaction_message_id: reactionMessageId
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
                    await automationEngine.triggerEvent("message_received", {
                        message: content,
                        senderNumber: senderNumber,
                        recipientNumber: myNumber,
                        messageType: messageType,
                        userId: userId.toString(),
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

                    if (!automatedHandled) {
                        const matchingBot = await findMatchingBot(wabaId, content);
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
        const type = Object.keys(message)[0];
        if (type === 'conversation' || type === 'extendedTextMessage') return 'text';
        if (type === 'imageMessage') return 'image';
        if (type === 'videoMessage') return 'video';
        if (type === 'audioMessage') return 'audio';
        if (type === 'documentMessage') return 'document';
        if (type === 'locationMessage') return 'location';
        if (type === 'reactionMessage') return 'reaction';
        return 'text';
    }

    getBaileysMessageContent(message, type) {
        if (!message) return '';
        if (type === 'text') return message.conversation || message.extendedTextMessage?.text || '';
        if (type === 'image') return message.imageMessage?.caption || '';
        if (type === 'video') return message.videoMessage?.caption || '';
        if (type === 'document') return message.documentMessage?.caption || '';
        if (type === 'location') {
            const loc = message.locationMessage;
            return `Location: ${loc.name || ''} ${loc.address || ''} (${loc.degreesLatitude}, ${loc.degreesLongitude})`.trim();
        }
        if (type === 'reaction') {
            return message.reactionMessage?.text || '';
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

        const { recipientNumber, messageText, messageType: messageTypeInput, mediaUrl, templateId } = params;
        console.log(`Baileys sending message to ${recipientNumber}: type=${messageTypeInput}, mediaUrl=${mediaUrl}`);
        const messageType = messageTypeInput || (mediaUrl ? this.getMediaTypeFromUrl(mediaUrl) : 'text');
        const jid = `${recipientNumber}@s.whatsapp.net`;

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
        }

        if (!result) {
            throw new Error(`Failed to send message: Unsupported message type "${messageType}" or result undefined`);
        }

        const myNumber = connection.registred_phone_number;
        const contact = await Contact.findOne({ phone_number: recipientNumber, created_by: userId });

        const savedMessage = await Message.create({
            sender_number: myNumber,
            recipient_number: recipientNumber,
            user_id: userId,
            contact_id: contact?._id,
            content: messageText,
            message_type: messageType,
            file_url: mediaUrl,
            from_me: true,
            direction: 'outbound',
            wa_message_id: result.key.id,
            wa_timestamp: new Date(),
            provider: 'baileys',
            interactive_data: messageType === 'location' ? {
                location: params.locationParams
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

        const messages = await Message.find(query)
            .sort({ wa_timestamp: 1 })
            .lean();

        return messages;
    }

    async getRecentChats(userId, connection = null) {
        const myNumber = connection.registred_phone_number;
        const sentMessages = await Message.distinct('recipient_number', {
            sender_number: myNumber,
            recipient_number: { $ne: null },
            deleted_at: null
        });

        const receivedMessages = await Message.distinct('sender_number', {
            recipient_number: myNumber,
            sender_number: { $ne: null },
            deleted_at: null
        });

        const numbers = [...new Set([...sentMessages, ...receivedMessages])].filter(n => n && n !== myNumber);

        const chats = await Promise.all(numbers.map(async (num) => {
            const lastMessage = await Message.findOne({
                $or: [
                    { sender_number: myNumber, recipient_number: num },
                    { sender_number: num, recipient_number: myNumber }
                ],
                deleted_at: null
            }).sort({ wa_timestamp: -1 }).lean();

            let contact = await Contact.findOne({ phone_number: num, created_by: userId });

            return {
                contact: {
                    id: contact?._id,
                    number: num,
                    name: contact?.name || num,
                    avatar: null
                },
                lastMessage: lastMessage ? {
                    id: lastMessage._id,
                    content: lastMessage.content,
                    messageType: lastMessage.message_type,
                    direction: lastMessage.direction,
                    fromMe: lastMessage.from_me,
                    createdAt: lastMessage.wa_timestamp
                } : null
            };
        }));

        return chats.sort((a, b) => (b.lastMessage?.createdAt || 0) - (a.lastMessage?.createdAt || 0));
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
                            reaction_message_id: reactionMessageId
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
        const sock = this.sockets.get(wabaId.toString());

        if (sock) {
            try {
                if (connection.connection_status === 'connected') {
                    console.log(`Explicitly logging out Baileys for WABA ${wabaId}`);
                    await sock.logout();
                } else {
                    sock.end();
                }
            } catch (err) {
                console.error(`Error during Baileys logout for WABA ${wabaId}:`, err.message);
                sock.end();
            }
            this.sockets.delete(wabaId.toString());
        }
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

        this.emitStatus(wabaId, 'disconnected', { message: 'Disconnected by user' });

        return { success: true };
    }
}
