import SocialAutomation from '../../models/social-automation.model.js';
import omnichannelService from './omnichannel.service.js';
import axios from 'axios';
import { Contact, Message, ReplyMaterial, Template, Chatbot, ProcessedSocialComment } from '../../models/index.js';
import { callAIModel } from '../../utils/ai-utils.js';

const META_GRAPH_API_VERSION = 'v22.0';

class SocialAutomationService {

    async handleIncomingComment(platform, entryData, connectionData) {
        try {
            console.log(`[SocialAutomation] Handling ${platform} comment:`, JSON.stringify(entryData));

            const value = entryData.value || entryData;
            if (!value.text || !value.from || !value.media) return;

            if (value.from.id === connectionData.pageOrAccountId) return;

            const text = value.text.trim();
            const mediaId = value.media.id;
            const commenterId = value.from.id;
            const commentId = value.id;

            let automationTypes = ['post_comment', 'reel_comment', 'story_reply'];

            try {
                const { SocialMediaPost } = await import('../../models/index.js');
                const post = await SocialMediaPost.findOne({ media_id: mediaId }).lean();
                if (post) {
                    if (post.media_product_type === 'REELS' || post.media_type === 'reel' || (post.permalink && post.permalink.includes('/reel/'))) {
                        automationTypes = ['reel_comment'];
                    } else if (post.media_product_type === 'STORY' || post.media_type === 'story') {
                        automationTypes = ['story_reply'];
                    } else {
                        automationTypes = ['post_comment'];
                    }
                }
            } catch (err) {
                console.error('[SocialAutomation] Error looking up media type:', err);
            }

            return await this.processAutomationRules(platform, text, mediaId, commenterId, commentId, automationTypes, connectionData);
        } catch (error) {
            console.error('[SocialAutomation] Error handling comment:', error);
            return false;
        }
    }

    async processAutomationRules(platform, text, mediaId, senderId, commentId, automationTypes, connectionData) {
        const { workspaceId, userId, connectionId, pageAccessToken, pageOrAccountId } = connectionData;

        const automations = await SocialAutomation.find({
            workspace_id: workspaceId,
            platform: platform,
            automation_type: { $in: Array.isArray(automationTypes) ? automationTypes : [automationTypes] },
            status: 'active',
            deleted_at: null
        }).lean();

        for (const automation of automations) {
            let mediaMatch = !automation.target_media_id ||
                automation.target_media_id === 'all' ||
                (mediaId && (
                    automation.target_media_id === mediaId ||
                    automation.target_media_id.endsWith(mediaId) ||
                    mediaId.endsWith(automation.target_media_id) ||
                    automation.target_media_id.includes(mediaId) ||
                    mediaId.includes(automation.target_media_id)
                ));

            if (!mediaMatch && platform === 'facebook' && automation.automation_type === 'story_reply') {
                mediaMatch = true;
            }

            if (!mediaMatch) continue;

            if (automation.auto_hide_comment && commentId && connectionData.pageAccessToken) {
                await this.evaluateModerationRules(automation, text, commentId, platform, connectionData);
            }

            let isMatch = false;
            if (!automation.keywords || automation.keywords.length === 0) {
                isMatch = true;
            } else {
                for (const keyword of automation.keywords) {
                    isMatch = this.checkKeywordMatch(text, keyword, automation.matching_method, automation.partial_percentage);
                    if (isMatch) break;
                }
            }

            if (isMatch) {
                const existingProcess = await ProcessedSocialComment.findOne({
                    automation_id: automation._id,
                    comment_id: commentId
                }).lean();

                if (existingProcess) {
                    console.log(`[SocialAutomation] Skipping comment ${commentId} - Already processed for automation ${automation._id}`);
                    continue;
                }

                console.log(`[SocialAutomation] Match found for automation ID: ${automation._id}`);

                try {
                    await ProcessedSocialComment.create({
                        workspace_id: workspaceId,
                        automation_id: automation._id,
                        platform: platform,
                        comment_id: commentId
                    });
                } catch (err) {
                    if (err.code === 11000) {
                        console.log(`[SocialAutomation] Duplicate comment ${commentId} prevented by index`);
                        continue;
                    }
                    console.error('[SocialAutomation] Error saving processed comment:', err);
                }

                if (automation.delay_seconds > 0) {
                    setTimeout(() => {
                        this.executeAutomationActions(automation, senderId, commentId, connectionData, text);
                    }, automation.delay_seconds * 1000);
                } else {
                    await this.executeAutomationActions(automation, senderId, commentId, connectionData, text);
                }

                return true;
            }
        }
        return false;
    }

    async handleIncomingDM(platform, messageText, senderId, messageId, storyId, connectionData) {
        try {
            console.log(`[SocialAutomation] Handling ${platform} DM:`, messageText, 'StoryId:', storyId);
            if (!messageText) return false;

            let automationTypes = [];
            if (storyId || platform === 'facebook') {
                automationTypes.push('story_reply');
            }

            if (automationTypes.length === 0) return false;

            return await this.processAutomationRules(platform, messageText, storyId, senderId, messageId, automationTypes, connectionData);
        } catch (error) {
            console.error('[SocialAutomation] Error handling DM:', error);
            return false;
        }
    }

    checkKeywordMatch(text, keyword, method, partialPercentage) {
        const t = text.toLowerCase();
        const k = keyword.toLowerCase();

        switch (method) {
            case 'exact':
                return t === k;
            case 'contains':
                return t.includes(k);
            case 'starts_with':
                return t.startsWith(k);
            case 'ends_with':
                return t.endsWith(k);
            case 'partial':
                const textWords = t.split(/\s+/);
                const keywordWords = k.split(/\s+/);
                let matchCount = 0;
                for (const kw of keywordWords) {
                    if (textWords.includes(kw)) matchCount++;
                }
                const percentage = (matchCount / keywordWords.length) * 100;
                return percentage >= (partialPercentage || 100);
            default:
                return false;
        }
    }


    async sendAutomationReplyMaterial(automation, senderId, commentId, connectionData) {
        const { workspaceId, userId, pageAccessToken, pageOrAccountId } = connectionData;
        const platform = automation.platform;

        try {
            let msgType = 'text';
            let msgText = '';
            let fileUrl = '';
            let buttons = [];
            let templateObj = null;

            const replyType = automation.reply_type;
            const replyId = automation.reply_id;

            if (replyType === 'media' || replyType === 'text') {
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
            } else if (replyType === 'template') {
                templateObj = await Template.findById(replyId).lean();
                const template = templateObj;
                if (template) {
                    if (template.template_type === 'carousel_media' || template.template_type === 'carousel') {
                        msgType = 'carousel';
                        msgText = template.message_body || '';

                        let carouselElements = [];

                        if (automation.carousel_cards_data && automation.carousel_cards_data.length > 0) {
                            for (const card of automation.carousel_cards_data) {
                                let element = {};

                                let imgUrl = null;
                                if (card.header && card.header.link) {
                                    imgUrl = card.header.link;
                                }
                                imgUrl = imgUrl || automation.media_url;

                                if (imgUrl) {
                                    element.image_url = imgUrl;
                                } else {
                                    element.image_url = "https://via.placeholder.com/600x600/ffffff/ffffff.png";
                                }

                                element.title = (card.body || 'Card').substring(0, 80);

                                if (card.buttons && card.buttons.length > 0) {
                                    element.buttons = card.buttons.map(b => {
                                        const btnType = b.type === 'url' ? 'web_url' : 'postback';
                                        const mappedBtn = {
                                            type: btnType,
                                            title: (b.text || 'Button').substring(0, 20)
                                        };
                                        if (btnType === 'web_url') {
                                            mappedBtn.url = b.url_value || b.url || 'https://google.com';
                                        } else {
                                            mappedBtn.payload = b.payload || b.text || 'payload';
                                        }
                                        return mappedBtn;
                                    });
                                }
                                carouselElements.push(element);
                            }
                        }

                        automation.carousel_elements = carouselElements;
                    } else {
                        msgType = 'text';
                        msgText = template.message_body || '';

                        const vars = automation.variables_mapping || {};
                        if (vars) {
                            for (const [key, value] of Object.entries(vars)) {
                                const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                                msgText = msgText.replace(regex, value);
                            }
                        }

                        if (template.footer_text) {
                            msgText += '\n\n' + template.footer_text;
                        }

                        if (template.buttons && template.buttons.length > 0) {
                            buttons = template.buttons;
                        }

                        if (template.header && (
                            ['IMAGE', 'VIDEO', 'DOCUMENT'].includes((template.header.format || '').toUpperCase()) ||
                            template.header.format === 'media'
                        )) {
                            fileUrl = automation.media_url || template.header.media_url;
                            msgType = (template.header.media_type || template.header.format || 'image').toLowerCase();
                        } else if (template.header && (template.header.format || '').toUpperCase() === 'LOCATION') {
                            msgType = 'location';
                            if (!automation.location_data) {
                                automation.location_data = {};
                            }
                            const locSource = template.header.location || template.header;
                            if (locSource.latitude) automation.location_data.latitude = locSource.latitude;
                            if (locSource.longitude) automation.location_data.longitude = locSource.longitude;
                            if (locSource.name) automation.location_data.name = locSource.name;
                            if (locSource.address) automation.location_data.address = locSource.address;
                        }

                        if (buttons.length > 0 && msgType === 'text') {
                            msgType = 'interactive';
                        }
                    }
                }
            } else if (replyType === 'chatbot') {
                const chatbot = await Chatbot.findById(replyId).populate('ai_model');
                if (chatbot) {
                    const aiResponse = await callAIModel(userId, chatbot.ai_model, chatbot.api_key, `${chatbot.system_prompt}\n\nCustomer Commented on Post.`);
                    msgType = 'text';
                    msgText = aiResponse;
                }
            }

            if (msgText || fileUrl || msgType === 'carousel' || msgType === 'location') {
                console.log(`[SocialAutomation] Sending DM to ${senderId} for comment ${commentId}`);

                const sendResponse = await omnichannelService.sendMessage({
                    platform,
                    workspace_id: workspaceId,
                    user_id: userId,
                    page_id: pageOrAccountId,
                    recipient_id: senderId,
                    message_type: msgType,
                    text: msgText,
                    file_url: fileUrl,
                    buttons: buttons,
                    carousel_elements: automation.carousel_elements,
                    ...(automation.location_data || {}),
                    reply_to_comment_id: automation.automation_type === 'story_reply' ? null : commentId
                });

                try {
                    let contact = await Contact.findOne({
                        $or: [
                            { facebook_page_scoped_id: senderId },
                            { instagram_scoped_id: senderId }
                        ],
                        user_id: userId
                        
                    });

                    if (!contact && !senderId.startsWith('fb_comment_')) {
                        const contactFields = {
                            user_id: userId,
                            created_by: userId,
                            name: platform === 'facebook' ? 'Facebook User' : 'Instagram User',
                            phone_number: senderId,
                            chat_status: 'open',
                            source: platform
                        };
                        if (platform === 'facebook') contactFields.facebook_page_scoped_id = senderId;
                        if (platform === 'instagram') contactFields.instagram_scoped_id = senderId;

                        contact = await Contact.create(contactFields);
                        console.log(`[SocialAutomation] Created new contact for ${senderId}`);
                    }

                    if (contact) {
                        const newMessage = await Message.create({
                            workspace_id: workspaceId,
                            user_id: userId,
                            contact_id: contact._id,
                            platform: platform,
                            provider: platform,
                            sender_id: pageOrAccountId,
                            recipient_id: senderId,
                            sender_number: pageOrAccountId,
                            recipient_number: senderId,
                            direction: 'outbound',
                            message_type: replyType === 'template' && msgType !== 'carousel' ? 'template' : (msgType === 'location' ? 'location' : msgType),
                            content: msgType === 'location' ? JSON.stringify({
                                latitude: automation.location_data?.latitude,
                                longitude: automation.location_data?.longitude,
                                name: automation.location_data?.name,
                                address: automation.location_data?.address || msgText,
                                text: msgText
                            }) : msgText,
                            file_url: fileUrl,
                            interactive_data: msgType === 'interactive' ? { interactiveType: 'button', buttons: buttons } : null,
                            template_id: replyType === 'template' ? replyId : null,
                            from_me: true,
                            delivery_status: 'delivered',
                            read_status: 'unread',
                            wa_timestamp: new Date(),
                            platform_message_id: sendResponse?.message_id
                        });

                        if (connectionData.io) {
                            connectionData.io.emit('whatsapp:message', {
                                id: newMessage._id.toString(),
                                wa_message_id: newMessage.platform_message_id || newMessage.wa_message_id || newMessage._id.toString(),
                                content: newMessage.content,
                                fileUrl: newMessage.file_url,
                                interactiveData: newMessage.interactive_data || null,
                                messageType: newMessage.message_type,
                                platform: newMessage.platform,
                                provider: newMessage.provider,
                                direction: 'outbound',
                                delivery_status: 'delivered',
                                createdAt: newMessage.wa_timestamp,
                                contact_id: contact._id.toString(),
                                sender: { id: pageOrAccountId },
                                recipient: { id: senderId },
                                template: templateObj || null
                            });
                        }
                    }
                } catch (dbErr) {
                    console.error('[SocialAutomation] Error saving outbound message to DB:', dbErr);
                }
            }

        } catch (error) {
            console.error('[SocialAutomation] Error sending reply material:', error);
        }
    }

    async executeAutomationActions(automation, senderId, commentId, connectionData, text = '') {
        const { workspaceId, userId, pageAccessToken, pageOrAccountId } = connectionData;
        const platform = automation.platform;

        try {
            if (automation.requires_following && !connectionData.isFollowGateBypass) {
                const msgText = automation.follow_gate_message || "Please make sure you are following our page to receive the details.";
                const btnYes = automation.follow_gate_button_yes || "I Follow";
                const btnNo = automation.follow_gate_button_no || "Not Now";

                const sendResponse = await omnichannelService.sendMessage({
                    platform,
                    workspace_id: workspaceId,
                    user_id: userId,
                    page_id: pageOrAccountId,
                    recipient_id: senderId,
                    message_type: 'interactive',
                    text: msgText,
                    buttons: [
                        { type: 'postback', title: btnYes, payload: `FOLLOW_GATE_YES___${automation._id}` },
                        { type: 'postback', title: btnNo, payload: `FOLLOW_GATE_NO___${automation._id}` }
                    ],
                    reply_to_comment_id: automation.automation_type === 'story_reply' ? null : commentId
                });

                try {
                    const contact = await Contact.findOne({
                        user_id: userId,
                        $or: [{ facebook_page_scoped_id: senderId }, { instagram_scoped_id: senderId }]
                    });

                    if (contact) {
                        const newMessage = await Message.create({
                            workspace_id: workspaceId,
                            user_id: userId,
                            contact_id: contact._id,
                            platform: platform,
                            provider: platform,
                            sender_id: pageOrAccountId,
                            recipient_id: senderId,
                            sender_number: pageOrAccountId,
                            recipient_number: senderId,
                            direction: 'outbound',
                            message_type: 'interactive',
                            content: msgText,
                            interactive_data: {
                                interactiveType: 'button', buttons: [
                                    { type: 'postback', title: btnYes, payload: `FOLLOW_GATE_YES___${automation._id}` },
                                    { type: 'postback', title: btnNo, payload: `FOLLOW_GATE_NO___${automation._id}` }
                                ]
                            },
                            from_me: true,
                            delivery_status: 'delivered',
                            read_status: 'unread',
                            wa_timestamp: new Date(),
                            platform_message_id: sendResponse?.message_id
                        });

                        if (connectionData.io) {
                            connectionData.io.emit('whatsapp:message', {
                                id: newMessage._id.toString(),
                                wa_message_id: newMessage.platform_message_id || newMessage.wa_message_id || newMessage._id.toString(),
                                content: newMessage.content,
                                interactiveData: newMessage.interactive_data || null,
                                messageType: newMessage.message_type,
                                platform: newMessage.platform,
                                provider: newMessage.provider,
                                timestamp: newMessage.wa_timestamp,
                                contact_id: contact._id.toString(),
                                sender: { id: pageOrAccountId },
                                recipient: { id: senderId }
                            });
                        }
                    }
                } catch (dbErr) {
                    console.error('[SocialAutomation] Error saving follow gate outbound message to DB:', dbErr);
                }

            } else {
                await this.sendAutomationReplyMaterial(automation, senderId, commentId, connectionData);
            }
            if (automation.auto_like_comment && commentId && pageAccessToken) {
                try {
                    const baseUrl = pageAccessToken.startsWith('IGAA') ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
                    await axios.post(`${baseUrl}/${META_GRAPH_API_VERSION}/${commentId}/likes`, null, {
                        params: { access_token: pageAccessToken }
                    });
                    console.log(`[SocialAutomation] Auto-liked comment ${commentId}`);
                } catch (likeErr) {
                    console.warn(`[SocialAutomation] Failed to like comment ${commentId}:`, likeErr?.response?.data || likeErr.message);
                }
            }

            if (automation.auto_reply_text && commentId && pageAccessToken) {
                try {
                    const baseUrl = pageAccessToken.startsWith('IGAA') ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
                    const isInstagram = platform === 'instagram';
                    const replyEdge = isInstagram ? 'replies' : 'comments';

                    await axios.post(`${baseUrl}/${META_GRAPH_API_VERSION}/${commentId}/${replyEdge}`, null, {
                        params: {
                            message: automation.auto_reply_text,
                            access_token: pageAccessToken
                        }
                    });
                    console.log(`[SocialAutomation] Auto-replied to comment ${commentId}`);
                } catch (replyErr) {
                    console.warn(`[SocialAutomation] Failed to reply to comment ${commentId}:`, replyErr?.response?.data || replyErr.message);
                }
            }

        } catch (error) {
            console.error('[SocialAutomation] Error executing automation actions:', error);
        }
    }

    async evaluateModerationRules(automation, text, commentId, platform, connectionData) {
        const { userId, pageAccessToken } = connectionData;
        let shouldHide = false;

        if (automation.hide_condition_type === 'keywords') {
            if (automation.hide_keywords && automation.hide_keywords.length > 0 && text) {
                for (const kw of automation.hide_keywords) {
                    if (text.toLowerCase().includes(kw.toLowerCase())) {
                        shouldHide = true;
                        break;
                    }
                }
            }
        } else if (automation.hide_condition_type === 'aimodel' && text) {
            try {
                const { AIModel, UserSetting } = await import('../../models/index.js');
                const { callAIModel } = await import('../../utils/ai-utils.js');
                const userSettings = await UserSetting.findOne({ user_id: userId }).lean();
                if (userSettings && userSettings.ai_model) {
                    const aiModel = await AIModel.findById(userSettings.ai_model);
                    if (aiModel) {
                        const apiKey = userSettings.api_key || '';
                        const systemPrompt = "Analyze this social media comment. If it contains hate speech, vulgarity, severe toxicity, highly inappropriate content, negativity, negative feedback, insults, spam, or complaints, reply strictly and only with the word 'yes'. If it is a normal, neutral, or positive comment, reply strictly and only with the word 'no'. Do not include any other words.";
                        const aiResponse = await callAIModel(userId, aiModel, apiKey, `${systemPrompt}\n\nComment to analyze: "${text}"`);
                        if (aiResponse && aiResponse.toLowerCase().trim().startsWith('yes')) {
                            shouldHide = true;
                        }
                    }
                }
            } catch (err) {
                console.error('[SocialAutomation] Error calling AI model for hide check:', err);
            }
        }

        if (shouldHide) {
            try {
                const isInstagram = platform === 'instagram';
                const baseUrl = pageAccessToken.startsWith('IGAA') ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
                const payload = isInstagram ? { hide: true } : { is_hidden: true };

                await axios.post(`${baseUrl}/${META_GRAPH_API_VERSION}/${commentId}`, null, {
                    params: { ...payload, access_token: pageAccessToken }
                });
                console.log(`[SocialAutomation] Auto-hid comment ${commentId}`);
            } catch (hideErr) {
                console.warn(`[SocialAutomation] Failed to hide comment ${commentId}:`, hideErr?.response?.data || hideErr.message);
            }
        }
    }
}

export default new SocialAutomationService();
