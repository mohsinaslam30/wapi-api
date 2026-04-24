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
    Submission
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

export const findMatchingBot = async (wabaId, text) => {
    if (!text) return null;

    const bots = await MessageBot.find({ waba_id: wabaId, status: 'active' });

    const normalizedText = text.toLowerCase().trim();

    for (const bot of bots) {
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

export const sendAutomatedReply = async (params) => {
    const { wabaId, contactId, replyType, replyId, incomingText, userId, whatsappPhoneNumberId, sequenceAutomationData } = params;

    try {
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
                        await unifiedWhatsAppService.sendMessage(userId, {
                            recipientNumber: params.senderNumber,
                            messageText: fallbackMessage,
                            messageType: 'text',
                            whatsappPhoneNumberId
                        });
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
                await unifiedWhatsAppService.sendMessage(userId, {
                    recipientNumber: params.senderNumber,
                    messageText: aiResponse,
                    messageType: 'text',
                    whatsappPhoneNumberId
                });
                return;
            }
        }

        if (replyType === 'agent' || replyType === 'assign_agent') {
            await assignToAgentInternal({ contactId, agentId: replyId, whatsappPhoneNumberId, adminId: userId });
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
            const bot = await MessageBot.findOne({ waba_id: wabaId, reply_id: replyId, status: 'active' }).lean();
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

        if (!isTemplate) {
            const contact = await Contact.findById(contactId);
            if (contact && contact.last_incoming_message_at) {
                const diff = Date.now() - new Date(contact.last_incoming_message_at).getTime();
                if (diff > 24 * 60 * 60 * 1000) {
                    console.log(`Skipping non-template reply for contact ${contactId} due to 24h rule`);
                    return;
                }
            }
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
        const existingAssignment = await ChatAssignment.findOne({ contact_id: contactId });
        if (existingAssignment) {
            existingAssignment.agent_id = agentId;
            existingAssignment.status = 'assigned';
            await existingAssignment.save();
        } else {
            await ChatAssignment.create({
                contact_id: contactId,
                whatsapp_phone_number_id: whatsappPhoneNumberId,
                agent_id: agentId,
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
    const { Contact } = db;
    const contact = await Contact.findById(contactId);
    if (!contact || !contact.last_incoming_message_at) return true;

    const diff = Date.now() - new Date(contact.last_incoming_message_at).getTime();
    if (diff > 24 * 60 * 60 * 1000 && materialType !== 'Template') {
        return false;
    }
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
