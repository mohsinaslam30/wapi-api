import { TelegramConnection } from '../models/index.js';
import Contact from '../models/contact.model.js';
import Message from '../models/message.model.js';
import mongoose from 'mongoose';
import automationEngine from '../utils/automation-engine.js';
import { findMatchingBot, sendAutomatedReply, processAutomatedPipeline } from '../utils/automated-response.service.js';
import db from '../models/index.js';
const { WhatsappWaba } = db;

export const handleTelegramWebhook = async (req, res) => {
    try {
        const { workspace_id } = req.params;
        const update = req.body;

        res.status(200).send('OK');

        let msg = null;
        let isCallback = false;
        let callbackData = null;
        let isReaction = false;
        let reactionData = null;

        if (update.message) {
            msg = update.message;
        } else if (update.callback_query) {
            isCallback = true;
            msg = update.callback_query.message;
            callbackData = update.callback_query.data;
        } else if (update.message_reaction) {
            isReaction = true;
            reactionData = update.message_reaction;
            msg = {
                chat: reactionData.chat,
                from: reactionData.user || reactionData.actor_chat || reactionData.chat,
                message_id: reactionData.message_id
            };
        } else {
            return;
        }

        const chatId = msg.chat.id.toString();
        const senderId = isCallback ? update.callback_query.from.id.toString() : msg.from.id.toString();

        const bot = await TelegramConnection.findOne({ workspace_id, is_active: true });
        if (!bot) {
            console.error(`[Telegram Webhook] No active bot found for workspace: ${workspace_id}`);
            return;
        }

        let contact = await Contact.findOne({
            telegram_chat_id: chatId,
            user_id: bot.user_id
        });

        if (!contact) {
            const chatObj = isCallback ? update.callback_query.from : msg.chat;
            contact = await Contact.create({
                user_id: bot.user_id,
                created_by: bot.user_id,
                workspace_id,
                name: (chatObj.first_name || '') + (chatObj.last_name ? ` ${chatObj.last_name}` : '') || chatObj.username || 'Telegram User',
                telegram_chat_id: chatId,
                source: 'telegram'
            });
        }

        contact.last_incoming_message_at = new Date();
        if (contact.deleted_at) {
            contact.deleted_at = null;
        }
        await contact.save();

        let messageType = 'text';
        let content = '';
        let interactiveId = null;

        if (isReaction) {
            messageType = 'reaction';
            const newReacts = reactionData.new_reaction || [];
            if (newReacts.length > 0 && newReacts[0].type === 'emoji') {
                content = newReacts[0].emoji;
            } else if (newReacts.length > 0 && newReacts[0].type === 'custom_emoji') {
                content = newReacts[0].custom_emoji_id;
            } else {
                content = 'reaction';
            }
        } else if (isCallback) {
            const rawData = callbackData || '';
            if (rawData.startsWith('phone_call|')) {
                const parts = rawData.split('|');
                interactiveId = parts[0];
                const phoneNumber = parts[1];
                content = parts.slice(2).join('|') || 'contact us';

                try {
                    const { default: telegramProvider } = await import('../services/messaging/providers/telegram.provider.js');
                    await telegramProvider.sendContact(bot.bot_token, chatId, phoneNumber, content);

                    const outboundMessage = await Message.create({
                        workspace_id,
                        user_id: bot.user_id,
                        contact_id: contact._id,
                        platform: 'telegram',
                        provider: 'telegram',
                        platform_message_id: `tg_contact_${Date.now()}`,
                        sender_id: bot.bot_id,
                        recipient_id: chatId,
                        direction: 'outbound',
                        from_me: true,
                        message_type: 'text',
                        content: `Contact Card: ${content} (${phoneNumber})`,
                        delivery_status: 'delivered',
                        read_status: 'read',
                        wa_timestamp: new Date()
                    });

                    const io = req.app.get('io');
                    if (io) {
                        const formattedMessage = {
                            id: outboundMessage._id.toString(),
                            content: outboundMessage.content,
                            messageType: outboundMessage.message_type,
                            fileUrl: null,
                            createdAt: outboundMessage.wa_timestamp,
                            can_chat: true,
                            delivered_at: new Date(),
                            delivery_status: outboundMessage.delivery_status,
                            direction: 'outbound',
                            from_me: true,
                            sender: {
                                id: bot.bot_id,
                                name: 'Bot'
                            },
                            recipient: {
                                id: chatId,
                                name: contact.name
                            },
                            user_id: outboundMessage.user_id?.toString(),
                            contact_id: contact._id.toString(),
                            platform: 'telegram',
                            provider: 'telegram'
                        };
                        io.emit('whatsapp:message', formattedMessage);
                    }
                } catch (e) {
                    console.error('[Telegram Webhook] Error sending contact card:', e);
                }
                return;
            } else if (rawData.includes('|')) {
                const parts = rawData.split('|');
                interactiveId = parts[0];
                content = parts.slice(1).join('|');
            } else {
                content = rawData;
                interactiveId = rawData;
            }
        } else {
            content = msg.text || '';
        }
        let fileUrl = null;

        if (!isCallback && !isReaction) {
            if (msg.photo) {
                messageType = 'image';
                const largestPhoto = msg.photo[msg.photo.length - 1];
                fileUrl = largestPhoto.file_id;
                content = msg.caption || '';
            } else if (msg.video) {
                messageType = 'video';
                fileUrl = msg.video.file_id;
                content = msg.caption || '';
            } else if (msg.document) {
                messageType = 'document';
                fileUrl = msg.document.file_id;
                content = msg.caption || '';
            } else if (msg.audio) {
                messageType = 'audio';
                fileUrl = msg.audio.file_id;
                content = msg.caption || 'Audio file';
            } else if (msg.voice) {
                messageType = 'audio';
                fileUrl = msg.voice.file_id;
                content = 'Voice message';
            } else if (msg.location) {
                messageType = 'location';
                content = JSON.stringify({ latitude: msg.location.latitude, longitude: msg.location.longitude });
            }
        }

        const newMessage = await Message.create({
            workspace_id,
            user_id: bot.user_id,
            contact_id: contact._id,
            platform: 'telegram',
            provider: 'telegram',
            platform_message_id: isReaction ? `reaction_${reactionData.message_id}_${Date.now()}` : (isCallback ? `callback_${update.callback_query.id}` : msg.message_id.toString()),
            reaction_message_id: isReaction ? reactionData.message_id.toString() : undefined,
            sender_id: senderId,
            recipient_id: bot.bot_id,
            direction: 'inbound',
            message_type: messageType,
            content: isReaction ? undefined : content,
            reaction_emoji: isReaction ? content : undefined,
            file_url: fileUrl,
            delivery_status: 'delivered',
            read_status: 'unread',
            wa_timestamp: new Date()
        });

        const io = req.app.get('io');
        if (io) {
            const formattedMessage = {
                id: newMessage._id.toString(),
                wa_message_id: newMessage.platform_message_id || newMessage.wa_message_id || newMessage._id.toString(),
                reaction_message_id: newMessage.reaction_message_id || undefined,
                reaction_emoji: newMessage.reaction_emoji || undefined,
                content: newMessage.content,
                messageType: newMessage.message_type,
                fileUrl: newMessage.file_url || null,
                createdAt: newMessage.wa_timestamp,
                can_chat: true,
                delivered_at: new Date(),
                delivery_status: newMessage.delivery_status || 'delivered',
                direction: newMessage.direction || 'inbound',
                sender: {
                    id: senderId,
                    name: contact.name
                },
                recipient: {
                    id: bot.bot_id,
                    name: bot.bot_id
                },
                user_id: newMessage.user_id?.toString(),
                contact_id: contact._id.toString(),
                platform: 'telegram',
                provider: 'telegram'
            };
            io.emit('whatsapp:message', formattedMessage);
        }

        if (content && typeof content === 'string') {
            const upperContent = content.trim().toUpperCase();
            const { UserSetting } = await import('../models/index.js');
            const userSetting = await UserSetting.findOne({ user_id: bot.user_id }).lean();

            const optOutKeywords = (userSetting?.whatsapp_optout_keyword?.length > 0 ? userSetting.whatsapp_optout_keyword : ['STOP'])
                .filter(k => k)
                .map(k => k.trim().toUpperCase());

            const optInKeywords = (userSetting?.whatsapp_optin_keyword?.length > 0 ? userSetting.whatsapp_optin_keyword : ['START'])
                .filter(k => k)
                .map(k => k.trim().toUpperCase());

            if (optOutKeywords.includes(upperContent)) {
                await Contact.findByIdAndUpdate(contact._id, { is_unsubscribed: true });

                try {
                    const { sendOmnichannelMessageHelper } = await import('../utils/automated-response.service.js');

                    const resubscribeHint = (userSetting?.whatsapp_optin_keyword && userSetting.whatsapp_optin_keyword.length > 0)
                        ? userSetting.whatsapp_optin_keyword.join('/ ')
                        : 'START';

                    let responseMsg = userSetting?.whatsapp_unsubscribe_message || `You have been unsubscribed and will no longer receive messages. Reply {optin_keywords} to subscribe again.`;
                    responseMsg = responseMsg.replace('{optin_keywords}', resubscribeHint);

                    await sendOmnichannelMessageHelper({
                        contactDoc: contact,
                        messageType: 'text',
                        text: responseMsg
                    });
                } catch (sendErr) {
                    console.error('[Unsubscribe] Failed to send confirmation:', sendErr.message);
                }
                return;
            }
            else if (optInKeywords.includes(upperContent)) {
                await Contact.findByIdAndUpdate(contact._id, { is_unsubscribed: false });

                try {
                    const { sendOmnichannelMessageHelper } = await import('../utils/automated-response.service.js');
                    const resubscribeMsg = userSetting?.whatsapp_resubscribe_message || "Welcome back! You have been re-subscribed to our broadcasts.";

                    await sendOmnichannelMessageHelper({
                        contactDoc: contact,
                        messageType: 'text',
                        text: resubscribeMsg
                    });
                } catch (sendErr) {
                    console.error('[Resubscribe] Failed to send confirmation:', sendErr.message);
                }
                return;
            }
        }

        if (contact.is_unsubscribed) {
            await Contact.findByIdAndUpdate(contact._id, { is_unsubscribed: false });
            contact.is_unsubscribed = false;
        }

        let automatedHandled = false;

        try {
            const chatAssignment = await db.ChatAssignment.findOne({
                sender_number: chatId,
                receiver_number: bot.bot_id,
                status: 'assigned',
                assigned_by: bot.user_id
            }).lean();

            if (chatAssignment && chatAssignment.chatbot_id) {
                const isExpired = chatAssignment.chatbot_expires_at && new Date() > new Date(chatAssignment.chatbot_expires_at);
                if (!isExpired) {
                    console.log(`[Telegram Webhook] Forwarding message to assigned chatbot ${chatAssignment.chatbot_id}`);
                    await sendAutomatedReply({
                        wabaId: null,
                        contactId: contact._id,
                        replyType: 'chatbot',
                        replyId: chatAssignment.chatbot_id,
                        senderNumber: chatId,
                        incomingText: content,
                        userId: bot.user_id,
                        whatsappPhoneNumberId: null
                    });
                    automatedHandled = true;
                } else {
                    console.log(`[Telegram Webhook] Chatbot assignment expired for ${chatId}`);
                    await db.ChatAssignment.findByIdAndUpdate(chatAssignment._id, { chatbot_id: null, chatbot_expires_at: null });
                }
            }

            if (!automatedHandled) {
                await processAutomatedPipeline({
                    workspaceId: workspace_id,
                    contactDoc: contact,
                    incomingText: content,
                    channel: 'telegram',
                    accountId: chatId,
                    userId: bot.user_id,
                    whatsappPhoneNumberId: null,
                    businessAccountId: bot.bot_id
                });
            }
        } catch (botErr) {
            console.error('[Telegram Webhook] Automated pipeline error:', botErr);
        }

        try {
            await automationEngine.triggerEvent("message_received", {
                platform: 'telegram',
                message: interactiveId || content,
                interactive_id: interactiveId,
                senderNumber: chatId,
                recipientNumber: bot.bot_id,
                messageType: messageType,
                userId: bot.user_id.toString(),
                workspaceId: workspace_id,
                whatsappPhoneNumberId: null,
                waMessageId: isCallback ? `callback_${update.callback_query.id}` : msg.message_id.toString(),
                waJid: chatId,
                contactId: contact._id.toString(),
                timestamp: new Date()
            });
        } catch (automationError) {
            console.error('[Telegram Webhook] Error triggering automation:', automationError);
        }

        console.log(`[Telegram Webhook] Processed incoming ${isReaction ? 'reaction' : (isCallback ? 'callback button query' : messageType)} from ${contact.name}`);

    } catch (error) {
        console.error('[Telegram Webhook Error]:', error);
    }
};
