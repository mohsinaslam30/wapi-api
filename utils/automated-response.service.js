import db from '../models/index.js';
import unifiedWhatsAppService from '../services/whatsapp/unified-whatsapp.service.js';
import { callAIModel } from './ai-utils.js';
import mongoose from 'mongoose';

const {
    WorkingHours,
    MessageBot,
    WabaConfiguration,
    ReplyMaterial,
    Template,
    EcommerceCatalog,
    Chatbot,
    User,
    ChatAssignment,
    Contact,
    WhatsappPhoneNumber,
    Form,
    Submission,
    TelegramConnection,
    FacebookConnection,
    InstagramConnection,
    Message,
    Sequence,
    WhatsappWaba
} = db;


export const isWithinWorkingHours = async (wabaId) => {
    try {
        const workingHours = await WorkingHours.findOne({ waba_id: wabaId });
        if (!workingHours) return true;
        if (workingHours.is_holiday_mode) return false;

        const now = new Date();
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const currentDay = days[now.getDay()];
        const dayConfig = workingHours[currentDay];

        if (!dayConfig || dayConfig.status === 'closed') return false;
        if (!dayConfig.hours || dayConfig.hours.length === 0) return true;

        const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');

        return dayConfig.hours.some(range => {
            return currentTime >= range.from && currentTime <= range.to;
        });
    } catch (error) {
        console.error('Error checking working hours:', error);
        return true;
    }
};

export const findMatchingBot = async (accountId, text, platform = 'whatsapp', contact = null) => {
    if (!text) return null;

    let queryPlatforms = [platform];
    if (platform === 'whatsapp' || platform === 'baileys') {
        queryPlatforms = ['whatsapp', 'baileys'];
    }

    const bots = await MessageBot.find({
        account_id: accountId,
        status: 'active',
        deleted_at: null,
        $or: [
            { platform: { $in: queryPlatforms } },
            { platform: 'all' },
            { platform: null }
        ]
    });

    const normalizedText = text.toLowerCase().trim();

    for (const bot of bots) {
        if (bot.recipient_type && bot.recipient_type !== 'all_contacts') {
            if (!contact) {
                continue;
            }
            if (bot.recipient_type === 'specific_contacts') {
                const contactIdStr = contact._id.toString();
                const isIncluded = bot.specific_contacts && bot.specific_contacts.some(cId => cId.toString() === contactIdStr);
                if (!isIncluded) continue;
            } else if (bot.recipient_type === 'segments') {
                const contactSegments = contact.segments || [];
                const botSegments = bot.segment_ids || [];
                if (botSegments.length > 0) {
                    const hasSegment = botSegments.some(segId =>
                        contactSegments.some(cSegId => cSegId.toString() === segId.toString())
                    );
                    if (!hasSegment) continue;
                }
            } else if (bot.recipient_type === 'tags') {
                const contactTags = contact.tags || [];
                const botTags = bot.tag_ids || [];
                if (botTags.length > 0) {
                    const hasTag = botTags.some(tagId =>
                        contactTags.some(cTagId => cTagId.toString() === tagId.toString())
                    );
                    if (!hasTag) {
                        const hasContactTag = await db.ContactTag.findOne({
                            contact_id: contact._id,
                            tag_id: { $in: botTags }
                        }).lean();
                        if (!hasContactTag) continue;
                    }
                }
            }
        }
        if (bot.reply_type === 'template' || bot.reply_type_ref === 'Template') {
            const template = await Template.findById(bot.reply_id).lean();
            if (template) {
                const templatePlatform = template.platform || 'whatsapp';
                const isPlatformMatch = templatePlatform === platform || (['whatsapp', 'baileys'].includes(templatePlatform) && ['whatsapp', 'baileys'].includes(platform));
                if (!isPlatformMatch) {
                    continue;
                }
            }
        }

        if (bot.reply_type === 'sequence') {
            const sequence = await Sequence.findById(bot.reply_id).lean();
            if (sequence) {
                const sequencePlatform = sequence.platform || 'whatsapp';
                const isPlatformMatch = sequencePlatform === platform || (['whatsapp', 'baileys'].includes(sequencePlatform) && ['whatsapp', 'baileys'].includes(platform));
                if (!isPlatformMatch) {
                    continue;
                }
            }
        }

        for (const keyword of bot.keywords) {
            const normalizedKeyword = keyword.toLowerCase().trim();
            let matched = false;

            switch (bot.matching_method) {
                case 'exact':
                    if (normalizedText === normalizedKeyword) matched = true;
                    break;
                case 'contains':
                    if (normalizedText.includes(normalizedKeyword)) matched = true;
                    break;
                case 'starts_with':
                    if (normalizedText.startsWith(normalizedKeyword)) matched = true;
                    break;
                case 'ends_with':
                    if (normalizedText.endsWith(normalizedKeyword)) matched = true;
                    break;
                case 'partial':
                    const matchCount = [...normalizedKeyword].filter(char => normalizedText.includes(char)).length;
                    const percentage = (matchCount / normalizedKeyword.length) * 100;
                    if (percentage >= (bot.partial_percentage || 70)) matched = true;
                    break;
            }

            if (matched) return bot;
        }
    }
    return null;
};

export const sendOmnichannelMessageHelper = async ({ contactDoc, messageType, text, fileUrl, buttons, location }) => {
    try {
        const platform = contactDoc.source;
        const userId = contactDoc.user_id;
        let workspaceId = contactDoc.workspace_id;
        let senderId = null;

        const { default: omnichannelService } = await import('../services/messaging/omnichannel.service.js');

        let msgType = messageType || 'text';
        if (msgType === 'template') {
            msgType = 'text';
        }

        let fileUrlToPass = fileUrl;
        let dbFileUrl = fileUrl;

        if (platform === 'telegram') {
            const bot = await TelegramConnection.findOne({ user_id: contactDoc.user_id, is_active: true });
            if (!bot) {
                console.error('No active Telegram bot found for this contact');
                return;
            }
            senderId = bot.bot_id;
            workspaceId = workspaceId || bot.workspace_id;

            await omnichannelService.sendMessage({
                platform,
                workspace_id: workspaceId,
                recipient_id: contactDoc.telegram_chat_id,
                message_type: msgType,
                text,
                file_url: fileUrlToPass,
                buttons,
                latitude: location?.latitude,
                longitude: location?.longitude,
                name: location?.name,
                address: location?.address
            });
        } else {
            let connection = null;
            if (platform === 'facebook') {
                connection = await FacebookConnection.findOne({ $or: [{ workspace_id: workspaceId }, { user_id: contactDoc.user_id }], is_active: true }).lean();
            } else if (platform === 'instagram') {
                connection = await InstagramConnection.findOne({ $or: [{ workspace_id: workspaceId }, { user_id: contactDoc.user_id }], is_active: true }).lean();
            }

            if (!connection) {
                console.error(`No active ${platform} connection for this workspace`);
                return;
            }
            workspaceId = workspaceId || connection.workspace_id;

            let pageId = null;
            const lastMsg = await Message.findOne({ contact_id: contactDoc._id }).sort({ wa_timestamp: -1 }).lean();
            if (lastMsg) {
                pageId = lastMsg.direction === 'inbound' ? lastMsg.recipient_id : lastMsg.sender_id;
            }

            if (platform === 'facebook') {
                if (!pageId) {
                    const page = connection.pages?.find(p => p.is_active !== false);
                    pageId = page?.page_id;
                }
                if (!pageId) {
                    console.error(`No active Facebook Page found for this workspace`);
                    return;
                }
                senderId = pageId;
            } else if (platform === 'instagram') {
                if (!pageId) {
                    pageId = connection.ig_user_id || (connection.pages && connection.pages[0]?.instagram_account_id);
                }
                if (!pageId) {
                    console.error(`No active Instagram Account found for this workspace`);
                    return;
                }

                const matchedPage = connection.pages?.find(p => p.page_id === pageId || p.instagram_account_id === pageId);
                if (matchedPage?.instagram_account_id) {
                    senderId = matchedPage.instagram_account_id;
                } else {
                    senderId = pageId;
                }
            }

            await omnichannelService.sendMessage({
                platform,
                workspace_id: workspaceId,
                page_id: pageId,
                recipient_id: platform === 'facebook' ? contactDoc.facebook_page_scoped_id : contactDoc.instagram_scoped_id,
                message_type: msgType,
                text,
                file_url: fileUrlToPass,
                buttons,
                latitude: location?.latitude,
                longitude: location?.longitude,
                name: location?.name,
                address: location?.address
            });
        }

        const newMessage = await Message.create({
            workspace_id: workspaceId,
            user_id: userId,
            contact_id: contactDoc._id,
            platform: platform,
            provider: platform,
            sender_id: senderId,
            recipient_id: platform === 'telegram' ? contactDoc.telegram_chat_id : (platform === 'facebook' ? contactDoc.facebook_page_scoped_id : contactDoc.instagram_scoped_id),
            direction: 'outbound',
            message_type: msgType,
            content: text,
            file_url: dbFileUrl,
            from_me: true,
            delivery_status: 'delivered',
            read_status: 'unread',
            wa_timestamp: new Date()
        });

        const io = unifiedWhatsAppService.io;
        if (io) {
            const formattedMessage = {
                id: newMessage._id.toString(),
                content: newMessage.content,
                messageType: newMessage.message_type,
                fileUrl: newMessage.file_url || null,
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
    } catch (err) {
        console.error('Error in sendOmnichannelMessageHelper:', err);
    }
};

export const sendAutomatedReply = async (params) => {
    const { wabaId, contactId, replyType, replyId, incomingText, userId, whatsappPhoneNumberId, sequenceAutomationData } = params;

    try {
        const contactDoc = await Contact.findById(contactId);
        if (!contactDoc) {
            console.error(`Contact not found for automated reply: ${contactId}`);
            return;
        }

        let activeBot = params.bot;
        if (!activeBot && params.botId) {
            activeBot = await MessageBot.findById(params.botId).lean();
        }

        const isOmnichannel = ['telegram', 'facebook', 'instagram'].includes(contactDoc.source);

        if (isOmnichannel) {
            if (replyType === 'flow' || replyType === 'catalog' || replyType === 'EcommerceCatalog' || replyType === 'appointment_flow') {
                console.log(`[Omnichannel] Reply type '${replyType}' is not supported on ${contactDoc.source}`);
                return;
            }
            if (replyType === 'ReplyMaterial' || replyType === 'replymaterial') {
                const material = await ReplyMaterial.findById(replyId).lean();
                if (material && material.type === 'flow') {
                    console.log(`[Omnichannel] Reply material type 'flow' is not supported on ${contactDoc.source}`);
                    return;
                }
            }
            if (replyType === 'Template' || replyType === 'template') {
                const template = await Template.findById(replyId).lean();
                if (template) {
                    const templateType = (template.template_type || '').toLowerCase();
                    if (templateType === 'catalog' || templateType === 'carousel_product') {
                        console.log(`[Omnichannel] Template type '${templateType}' is not supported on ${contactDoc.source}`);
                        return;
                    }
                }
            }
        }

        if (replyType === 'flow' || replyType === 'ReplyMaterial' || replyType === 'replymaterial') {
            const material = await ReplyMaterial.findById(replyId).lean();
            if (material && material.type === 'flow') {
                const form = await Form.findOne({ "flow.flow_id": material.flow_id, deleted_at: null }).lean();
                if (form && form.submit_settings?.max_submissions_per_user > 0) {
                    const submissionCount = await Submission.countDocuments({
                        "meta.phone_number": params.senderNumber,
                        "meta.flow_id": material.flow_id
                    });

                    if (submissionCount >= form.submit_settings.max_submissions_per_user) {
                        const fallbackMessage = form.submit_settings.limit_exceeded_message || "You have already reached the maximum number of submissions for this form.";
                        if (isOmnichannel) {
                            await sendOmnichannelMessageHelper({
                                contactDoc,
                                messageType: 'text',
                                text: fallbackMessage
                            });
                        } else {
                            await unifiedWhatsAppService.sendMessage(userId, {
                                recipientNumber: params.senderNumber,
                                messageText: fallbackMessage,
                                messageType: 'text',
                                whatsappPhoneNumberId
                            });
                        }
                        return;
                    }
                }
            }
        }

        if (replyType === 'chatbot') {
            const chatbot = await Chatbot.findById(replyId).populate('ai_model');

            if (chatbot) {
                const aiResponse = await callAIModel(userId, chatbot.ai_model, chatbot.api_key, `${chatbot.system_prompt}\n\nCustomer: ${incomingText}`);
                console.log("airesponse", aiResponse);
                if (isOmnichannel) {
                    await sendOmnichannelMessageHelper({
                        contactDoc,
                        messageType: 'text',
                        text: aiResponse
                    });
                } else {
                    await unifiedWhatsAppService.sendMessage(userId, {
                        recipientNumber: params.senderNumber,
                        messageText: aiResponse,
                        messageType: 'text',
                        whatsappPhoneNumberId
                    });
                }
                return;
            }
        }

        if (replyType === 'agent' || replyType === 'assign_agent') {
            await assignToAgentInternal({ contactId, agentId: replyId, whatsappPhoneNumberId, adminId: userId });
            if (contactDoc) {
                contactDoc.assigned_to = replyId;
                await contactDoc.save();
            }
            return;
        }

        if (replyType === 'sequence' || replyType === 'Sequence') {
            await handleSequenceReply({ wabaId, contactId, sequenceId: replyId, userId, whatsappPhoneNumberId });
            return;
        }

        if (replyType === 'appointment_flow') {
            const { AppointmentConfig } = await import('../models/index.js');
            const { default: appointmentService } = await import('../services/appointment.service.js');

            let configId = replyId;
            const material = await ReplyMaterial.findById(replyId).lean();
            if (material && material.appointment_config_id) {
                configId = material.appointment_config_id;
            }

            const config = await AppointmentConfig.findById(configId).lean();
            if (config) {
                await appointmentService.startConversationalFlow({
                    userId,
                    contactId,
                    configId: config._id,
                    whatsappPhoneNumberId,
                    inputData: { senderNumber: params.senderNumber, whatsappPhoneNumberId }
                });
                return;
            }
        }

        const isTemplate = replyType === 'template' || replyType === 'Template';

        let automationData = typeof sequenceAutomationData !== 'undefined' && sequenceAutomationData ? sequenceAutomationData : {};
        if (automationData) {
            if (automationData.variables_mapping) automationData.templateVariables = automationData.variables_mapping;
            if (automationData.media_url) automationData.mediaUrl = automationData.media_url;
            if (automationData.carousel_cards_data) automationData.carouselCardsData = automationData.carousel_cards_data;
            if (automationData.coupon_code) automationData.couponCode = automationData.coupon_code;
            if (automationData.catalog_id) automationData.catalogId = automationData.catalog_id;
            if (automationData.product_retailer_id) automationData.productRetailerId = automationData.product_retailer_id;
        }

        if (replyType === 'chatbot') {
        } else if (replyType === 'agent' || replyType === 'assign_agent') {
        } else if (replyType === 'sequence' || replyType === 'Sequence') {
        } else if (!automationData.templateVariables) {
            const bot = activeBot || await MessageBot.findOne({ account_id: params.senderNumber || wabaId, reply_id: replyId, status: 'active' }).lean();
            if (bot) {
                automationData = {
                    templateVariables: bot.variables_mapping,
                    mediaUrl: bot.media_url,
                    carouselCardsData: bot.carousel_cards_data,
                    couponCode: bot.coupon_code,
                    catalogId: bot.catalog_id,
                    productRetailerId: bot.product_retailer_id
                };
            } else {
                const config = await WabaConfiguration.findOne({ waba_id: wabaId }).lean();
                if (config) {
                    const fields = ['welcome_message', 'out_of_working_hours', 'delayed_reply', 'fallback_message', 'reengagement_message'];
                    for (const field of fields) {
                        const item = config[field];
                        if (item && item.id && item.id.toString() === replyId.toString()) {
                            automationData = {
                                templateVariables: item.variables_mapping,
                                mediaUrl: item.media_url,
                                carouselCardsData: item.carousel_cards_data,
                                couponCode: item.coupon_code,
                                catalogId: item.catalog_id,
                                productRetailerId: item.product_retailer_id
                            };
                            break;
                        }
                    }
                }
            }
        }



        if (isOmnichannel) {
            let msgType = 'text';
            let msgText = '';
            let fileUrl = '';

            if (replyType === 'ReplyMaterial' || replyType === 'replymaterial' || ['text', 'media', 'image', 'video', 'audio', 'document'].includes(replyType)) {
                const material = await ReplyMaterial.findById(replyId).lean();
                if (material) {
                    msgType = material.type;
                    if (material.type === 'text') {
                        msgText = material.content;
                    } else {
                        fileUrl = material.file_path;
                        msgText = material.content || '';
                    }
                }
            } else if (replyType === 'template' || replyType === 'Template') {
                const template = await Template.findById(replyId).lean();
                if (template) {
                    msgType = 'text';
                    msgText = template.message_body || '';

                    const vars = automationData?.templateVariables || {};
                    if (vars) {
                        for (const [key, value] of Object.entries(vars)) {
                            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                            msgText = msgText.replace(regex, value);
                        }
                    }

                    if (template.header && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes((template.header.format || '').toUpperCase())) {
                        fileUrl = automationData?.mediaUrl || template.header.media_url;
                        msgType = (template.header.media_type || template.header.format || 'image').toLowerCase();
                    }
                }
            }

            await sendOmnichannelMessageHelper({
                contactDoc,
                messageType: msgType,
                text: msgText,
                fileUrl
            });
            return;
        }

        await unifiedWhatsAppService.sendMessage(userId, {
            recipientNumber: params.senderNumber,
            whatsappPhoneNumberId,
            contactId,
            replyType,
            replyId,
            ...automationData
        });

    } catch (error) {
        console.error('Error sending automated reply:', error);
    }
};

const assignToAgentInternal = async ({ contactId, agentId, whatsappPhoneNumberId, adminId }) => {
    try {
        const contact = await Contact.findById(contactId);
        const phoneNumber = await WhatsappPhoneNumber.findById(whatsappPhoneNumberId);

        if (!contact || !phoneNumber) {
            console.error('Contact or WhatsApp phone number not found in assignToAgentInternal');
            return;
        }

        const contactPhoneNumber = contact.phone_number;
        const businessPhoneNumber = phoneNumber.display_phone_number;

        const chatMatch = {
            $or: [
                { sender_number: contactPhoneNumber, receiver_number: businessPhoneNumber },
                { sender_number: businessPhoneNumber, receiver_number: contactPhoneNumber }
            ]
        };

        const existingAssignment = await ChatAssignment.findOne({
            whatsapp_phone_number_id: whatsappPhoneNumberId,
            ...chatMatch
        });

        if (existingAssignment) {
            existingAssignment.agent_id = agentId;
            existingAssignment.status = 'assigned';
            existingAssignment.assigned_by = adminId;
            existingAssignment.updated_at = new Date();
            await existingAssignment.save();
        } else {
            await ChatAssignment.create({
                sender_number: contactPhoneNumber,
                receiver_number: businessPhoneNumber,
                whatsapp_phone_number_id: whatsappPhoneNumberId,
                agent_id: agentId,
                assigned_by: adminId,
                status: 'assigned'
            });
        }
    } catch (error) {
        console.error('Error in assignToAgentInternal:', error);
    }
};

export const handleSequenceReply = async ({ wabaId, contactId, sequenceId, userId, whatsappPhoneNumberId, params }) => {
    try {
        console.log("calledd");
        const { Sequence, SequenceStep, Contact } = db;
        const sequence = await Sequence.findById(sequenceId);
        if (!sequence || !sequence.is_active) return;

        const steps = await SequenceStep.find({ sequence_id: sequenceId, deleted_at: null }).sort({ sort: 1 });
        if (steps.length === 0) return;

        console.log(`Assigning sequence ${sequence.name} to contact ${contactId}`);

        let cumulativeDelayMs = 0;

        for (const step of steps) {
            if (!step.is_active) continue;

            const { getSequenceQueue } = await import('../queues/sequence-queue.js');
            const sequenceQueue = await getSequenceQueue();

            let delayMs = 0;
            if (step.delay_value > 0) {
                switch (step.delay_unit) {
                    case 'minutes': delayMs += step.delay_value * 60 * 1000; break;
                    case 'hours': delayMs += step.delay_value * 60 * 60 * 1000; break;
                    case 'days': delayMs += step.delay_value * 24 * 60 * 60 * 1000; break;
                }
            }

            cumulativeDelayMs += delayMs;

            await sequenceQueue.add('send_sequence_step', {
                wabaId,
                contactId,
                step,
                userId,
                whatsappPhoneNumberId,
                params
            }, {
                delay: cumulativeDelayMs > 0 ? cumulativeDelayMs : undefined,
                jobId: `seq_${sequenceId}_${contactId}_step_${step._id}_${Date.now()}`
            });

            console.log(`Enqueued sequence step ${step.sort} in ${cumulativeDelayMs} ms`);
        }

    } catch (error) {
        console.error('Error in handleSequenceReply:', error);
    }
};

export const canSendSequenceStep = async (contactId, materialType) => {
    return true;
};

export const assignRoundRobin = async (userId, contactId, whatsappPhoneNumberId) => {
    try {
        console.log("called")
        const agents = await User.find({ created_by: userId, role: 'agent', status: 'active' }).sort({ _id: 1 });
        console.log("agents", agents);
        if (agents.length === 0) return null;

        const lastAssignment = await ChatAssignment.findOne({
            whatsapp_phone_number_id: whatsappPhoneNumberId
        }).sort({ createdAt: -1 });

        let nextAgentIndex = 0;
        if (lastAssignment && lastAssignment.agent_id) {
            const lastAgentIndex = agents.findIndex(a => a._id.toString() === lastAssignment.agent_id.toString());
            if (lastAgentIndex !== -1) {
                nextAgentIndex = (lastAgentIndex + 1) % agents.length;
            }
        }

        const selectedAgent = agents[nextAgentIndex];
        await assignToAgentInternal({ contactId, agentId: selectedAgent._id, whatsappPhoneNumberId, adminId: userId });
        return selectedAgent;
    } catch (error) {
        console.error('Error in assignRoundRobin:', error);
        return null;
    }
};


export const processAutomatedPipeline = async ({
    workspaceId,
    contactDoc,
    incomingText,
    channel,
    accountId,
    userId,
    whatsappPhoneNumberId,
    businessAccountId
}) => {
    try {
        let automatedHandled = false;

        let wabaId = null;
        let config = null;
        let connectionId = null;

        if (channel === 'whatsapp' || channel === 'baileys') {
            const waba = await WhatsappWaba.findOne({ workspace_id: workspaceId, deleted_at: null });
            if (!waba) {
                console.warn(`[Automated Pipeline] No WhatsappWaba found for workspace: ${workspaceId}`);
            }

            wabaId = waba?._id || null;
            connectionId = wabaId;
            config = wabaId ? await WabaConfiguration.findOne({ waba_id: wabaId }).lean() : null;

            if (wabaId) {
                const withinWorkingHours = await isWithinWorkingHours(wabaId);
                if (!withinWorkingHours && config?.out_of_working_hours?.id) {
                    await sendAutomatedReply({
                        wabaId,
                        contactId: contactDoc._id,
                        replyType: config.out_of_working_hours.type,
                        replyId: config.out_of_working_hours.id,
                        senderNumber: accountId,
                        incomingText,
                        userId,
                        whatsappPhoneNumberId
                    });
                    automatedHandled = true;
                }
            }
        } else if (channel === 'telegram') {
            const bot = await db.TelegramConnection.findOne({ workspace_id: workspaceId, is_active: true }).lean();
            if (bot) connectionId = bot._id;
        } else if (channel === 'facebook') {
            const page = await db.FacebookConnection.findOne({ workspace_id: workspaceId, is_active: true }).lean();
            if (page) connectionId = page._id;
        } else if (channel === 'instagram') {
            const ig = await db.InstagramConnection.findOne({ workspace_id: workspaceId, is_active: true }).lean();
            if (ig) connectionId = ig._id;
        }

        if (!automatedHandled && connectionId) {
            let matchingBot = await findMatchingBot(connectionId, incomingText, channel, contactDoc);
            
            if (!matchingBot && workspaceId) {
                matchingBot = await findMatchingBot(workspaceId, incomingText, channel, contactDoc);
            }

            if (matchingBot) {
                await sendAutomatedReply({
                    wabaId,
                    contactId: contactDoc._id,
                    replyType: matchingBot.reply_type,
                    replyId: matchingBot.reply_id,
                    senderNumber: accountId,
                    incomingText,
                    userId,
                    whatsappPhoneNumberId,
                    botId: matchingBot._id,
                    bot: matchingBot
                });
                automatedHandled = true;
            }
        }

        const isNewContact = (Date.now() - new Date(contactDoc.created_at).getTime() < 10000);
        
        if (channel === 'whatsapp' || channel === 'baileys') {
            if (!automatedHandled && isNewContact && config?.welcome_message?.id) {
                await sendAutomatedReply({
                    wabaId,
                    contactId: contactDoc._id,
                    replyType: config.welcome_message.type,
                    replyId: config.welcome_message.id,
                    senderNumber: accountId,
                    incomingText,
                    userId,
                    whatsappPhoneNumberId
                });
                automatedHandled = true;

                if (config?.round_robin_assignment) {
                    await assignRoundRobin(userId, contactDoc._id, whatsappPhoneNumberId);
                }
            }

            if (!automatedHandled && config?.fallback_message?.id && wabaId) {
                await sendAutomatedReply({
                    wabaId,
                    contactId: contactDoc._id,
                    replyType: config.fallback_message.type,
                    replyId: config.fallback_message.id,
                    senderNumber: accountId,
                    incomingText,
                    userId,
                    whatsappPhoneNumberId
                });
                automatedHandled = true;
            }
        }

        return automatedHandled;
    } catch (error) {
        console.error('[Automated Pipeline] Error in processAutomatedPipeline:', error);
        return false;
    }
};
