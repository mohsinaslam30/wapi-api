import facebookProvider from './providers/facebook.provider.js';
import telegramProvider from './providers/telegram.provider.js';
import instagramProvider from './providers/instagram.provider.js';
// import twitterProvider from './providers/twitter.provider.js'; // DISABLED: Twitter not working
import { TelegramConnection, FacebookConnection, InstagramConnection /*, TwitterConnection */ } from '../../models/index.js'; // DISABLED: Twitter not working
import BusinessAPIProvider from '../whatsapp/providers/business-api.provider.js';

const businessApiProvider = new BusinessAPIProvider();

class OmnichannelService {

    async sendMessage({ platform, workspace_id, page_id, recipient_id, message_type = 'text', text, file_url, latitude, longitude, name, address, buttons, carousel_elements, ...options }) {
        try {
            const allowedTypes = ['text', 'image', 'video', 'document', 'audio', 'file', 'location', 'link', 'interactive', 'carousel', 'sticker', 'reaction'];
            if (!allowedTypes.includes(message_type)) {
                throw new Error(`Message type '${message_type}' is not supported on ${platform}. Only text and media are allowed.`);
            }

            const resolvedFileUrl = businessApiProvider.getPublicMediaUrl(file_url);
            console.log("=== OMNICHANNEL SEND MESSAGE DIAGNOSTIC ===");
            console.log("Platform:", platform);
            console.log("Input file_url:", file_url);
            console.log("Resolved file_url:", resolvedFileUrl);
            console.log("APP_URL from env:", process.env.APP_URL);

            if (['facebook', 'instagram'].includes(platform) && message_type === 'sticker') {
                message_type = 'image';
            }

            if (['facebook', 'instagram'].includes(platform) && message_type === 'location') {
                const locationName = name ? `*${name}*\n` : '';
                const locationAddress = address ? `${address}\n` : '';
                const locationStr = `📍 Location:\n${locationName}${locationAddress}https://maps.google.com/?q=${latitude},${longitude}`;
                text = (text ? text + '\n\n' : '') + locationStr;
                message_type = (buttons && buttons.length > 0) ? 'interactive' : 'text';
            }

            if (platform === 'instagram' && (message_type === 'document' || message_type === 'file')) {
                message_type = 'text';
                text = (text ? text + '\n\n' : '') + `📎 Document Attached:\n${resolvedFileUrl}`;
            }

            if (platform === 'facebook' && message_type === 'document') {
                message_type = 'file';
            }

            let tagOptions = { ...options };
            if (['facebook', 'instagram'].includes(platform)) {
                const { Contact } = await import('../../models/index.js');
                const contactDoc = await Contact.findOne({
                    $or: [
                        { facebook_page_scoped_id: recipient_id },
                        { instagram_scoped_id: recipient_id }
                    ],
                    workspace_id
                }).lean();

                if (contactDoc && contactDoc.last_incoming_message_at) {
                    const diffMs = Date.now() - new Date(contactDoc.last_incoming_message_at).getTime();
                    const diffHours = diffMs / (1000 * 60 * 60);
                    if (diffHours > 24) {
                        tagOptions.messaging_type = 'MESSAGE_TAG';
                        tagOptions.tag = options.tag || 'HUMAN_AGENT';
                        console.log(`[Omnichannel Service] 24h window closed for ${platform} contact ${recipient_id}. Appending MESSAGE_TAG: ${tagOptions.tag}`);
                    }
                }
            }

            if (platform === 'telegram') {
                let bot = null;
                if (workspace_id) {
                    bot = await TelegramConnection.findOne({ workspace_id, is_active: true });
                }
                if (!bot && options.user_id) {
                    bot = await TelegramConnection.findOne({ user_id: options.user_id, is_active: true });
                }
                if (!bot) throw new Error("No active Telegram bot found for this workspace or user");

                if (message_type === 'carousel') {
                    if (!carousel_elements || !Array.isArray(carousel_elements)) {
                        throw new Error("carousel_elements array is required for carousel messages on Telegram");
                    }

                    let carouselText = '';
                    if (text && text.trim().length > 0) {
                        carouselText += text + '\n\n';
                    }

                    carousel_elements.forEach((el, index) => {
                        carouselText += `${index + 1}. ${el.title || 'Card'}\n`;
                        if (el.image_url) {
                            carouselText += `${el.image_url}\n`;
                        }

                        let cardButtons = el.buttons || [];
                        if (cardButtons.length > 0) {
                            cardButtons.forEach(btn => {
                                const btnUrl = btn.url || btn.url_value;
                                if (btnUrl) {
                                    carouselText += `> ${btn.text || btn.title || 'Button'}: ${btnUrl}\n`;
                                } else {
                                    carouselText += `> ${btn.text || btn.title || 'Button'}\n`;
                                }
                            });
                        }
                        carouselText += '\n';
                    });

                   const allButtons = [];
                    for (const el of carousel_elements) {
                        if (el.buttons && Array.isArray(el.buttons)) {
                            allButtons.push(...el.buttons);
                        }
                    }

                    return await telegramProvider.sendTextMessage(bot.bot_token, recipient_id, carouselText.trim(), allButtons);
                }

                if (resolvedFileUrl) {
                    let mediaType = 'document';
                    let ext = '';
                    if (typeof resolvedFileUrl === 'string') {
                        try {
                            const urlObj = new URL(resolvedFileUrl);
                            ext = urlObj.pathname.split('.').pop().toLowerCase();
                        } catch (e) {
                            ext = resolvedFileUrl.split('.').pop().split('?')[0].toLowerCase();
                        }
                    }
                    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
                    const videoExts = ['mp4', 'mkv', 'avi', 'mov', '3gp'];
                    const audioExts = ['mp3', 'ogg', 'wav', 'aac', 'm4a'];
                    if (imageExts.includes(ext)) mediaType = 'image';
                    else if (videoExts.includes(ext)) mediaType = 'video';
                    else if (audioExts.includes(ext)) mediaType = 'audio';

                    return await telegramProvider.sendMediaMessage(bot.bot_token, recipient_id, mediaType, resolvedFileUrl, text, buttons);
                }

                if (message_type === 'text' || message_type === 'link' || message_type === 'interactive') {
                    return await telegramProvider.sendTextMessage(bot.bot_token, recipient_id, text, buttons);
                } else if (message_type === 'location') {
                    return await telegramProvider.sendLocation(bot.bot_token, recipient_id, latitude, longitude, name, address);
                } else if (message_type === 'reaction') {
                    return await telegramProvider.sendReaction(bot.bot_token, recipient_id, options.reaction_message_id, options.reaction_emoji);
                } else {
                    return await telegramProvider.sendMediaMessage(bot.bot_token, recipient_id, message_type, resolvedFileUrl, text, buttons);
                }
            }

            else if (platform === 'instagram') {
                let connection = null;
                if (workspace_id) {
                    connection = await InstagramConnection.findOne({ workspace_id, is_active: true });
                }
                if (!connection && options.user_id) {
                    connection = await InstagramConnection.findOne({ user_id: options.user_id, is_active: true });
                }
                if (!connection) throw new Error("No active Instagram Connection found for this workspace or user");

                let pageAccessToken = null;
                if (page_id) {
                    const matchedPage = connection.pages?.find(p => p.instagram_account_id === page_id || p.page_id === page_id);
                    if (matchedPage) {
                        pageAccessToken = matchedPage.page_access_token;
                    }
                }

                if (!pageAccessToken) {
                    pageAccessToken = connection.access_token || (connection.pages && connection.pages[0]?.page_access_token);
                }
                if (!pageAccessToken) throw new Error("Instagram page access token not found");

                if (message_type === 'text' || message_type === 'link') {
                    return await instagramProvider.sendTextMessage(pageAccessToken, recipient_id, text, tagOptions);
                } else if (['image', 'video', 'audio', 'file'].includes(message_type)) {
                    if (!resolvedFileUrl) throw new Error(`file_url is required for ${message_type} messages on Instagram`);
                    if (buttons && Array.isArray(buttons) && buttons.length > 0) {
                        return await instagramProvider.sendInteractiveMessage(pageAccessToken, recipient_id, text || "Message", buttons, resolvedFileUrl, tagOptions);
                    }
                    const result = await instagramProvider.sendMediaMessage(pageAccessToken, recipient_id, message_type, resolvedFileUrl, tagOptions);
                    if (text && text.trim().length > 0) {
                        try { await instagramProvider.sendTextMessage(pageAccessToken, recipient_id, text, tagOptions); } catch (e) { console.error("Text with media error:", e); }
                    }
                    return result;
                } else if (message_type === 'interactive') {
                    if (!buttons || !Array.isArray(buttons) || buttons.length === 0) {
                        throw new Error("buttons array is required for interactive messages on Instagram");
                    }
                    return await instagramProvider.sendInteractiveMessage(pageAccessToken, recipient_id, text, buttons, resolvedFileUrl, tagOptions);
                } else if (message_type === 'carousel') {
                    if (!carousel_elements || !Array.isArray(carousel_elements)) {
                        throw new Error("carousel_elements array is required for carousel messages on Instagram");
                    }
                    if (text && text.trim().length > 0) {
                        try { await instagramProvider.sendTextMessage(pageAccessToken, recipient_id, text, tagOptions); } catch (e) { console.error("Text before carousel error:", e); }
                    }
                    return await instagramProvider.sendCarouselMessage(pageAccessToken, recipient_id, carousel_elements, tagOptions);
                } else if (message_type === 'reaction') {
                    return await instagramProvider.sendReaction(pageAccessToken, recipient_id, options.reaction_message_id, options.reaction_emoji);
                } else {
                    throw new Error(`Message type '${message_type}' is not supported on Instagram API.`);
                }
            }

            else if (platform === 'facebook') {
                let connection = null;
                if (workspace_id) {
                    connection = await FacebookConnection.findOne({ workspace_id, is_active: true });
                }
                if (!connection && options.user_id) {
                    connection = await FacebookConnection.findOne({ user_id: options.user_id, is_active: true });
                }
                if (!connection) throw new Error("No active Facebook Connection found for this workspace or user");
                if (!page_id) throw new Error("page_id is required to send facebook messages");

                const page = connection.pages?.find(p => p.page_id === page_id && p.is_active !== false);
                if (!page) throw new Error(`No active Facebook Page found with ID: ${page_id}`);

                if (message_type === 'text' || message_type === 'link') {
                    return await facebookProvider.sendTextMessage(page.page_access_token, recipient_id, text, tagOptions);
                } else if (['image', 'video', 'audio', 'file'].includes(message_type)) {
                    if (!resolvedFileUrl) throw new Error(`file_url is required for ${message_type} messages on Facebook`);
                    if (buttons && Array.isArray(buttons) && buttons.length > 0) {
                        return await facebookProvider.sendInteractiveMessage(page.page_access_token, recipient_id, text || "Message", buttons, resolvedFileUrl, tagOptions);
                    }
                    const result = await facebookProvider.sendMediaMessage(page.page_access_token, recipient_id, message_type, resolvedFileUrl, tagOptions);
                    if (text && text.trim().length > 0) {
                        try { await facebookProvider.sendTextMessage(page.page_access_token, recipient_id, text, tagOptions); } catch (e) { console.error("Text with media error:", e); }
                    }
                    return result;
                } else if (message_type === 'interactive') {
                    if (!buttons || !Array.isArray(buttons) || buttons.length === 0) {
                        throw new Error("buttons array is required for interactive messages on Facebook");
                    }
                    return await facebookProvider.sendInteractiveMessage(page.page_access_token, recipient_id, text, buttons, resolvedFileUrl, tagOptions);
                } else if (message_type === 'carousel') {
                    if (!carousel_elements || !Array.isArray(carousel_elements)) {
                        throw new Error("carousel_elements array is required for carousel messages on Facebook");
                    }
                    if (text && text.trim().length > 0) {
                        try { await facebookProvider.sendTextMessage(page.page_access_token, recipient_id, text, tagOptions); } catch (e) { console.error("Text before carousel error:", e); }
                    }
                    return await facebookProvider.sendCarouselMessage(page.page_access_token, recipient_id, carousel_elements, tagOptions);
                } else if (message_type === 'reaction') {
                    return await facebookProvider.sendReaction(page.page_access_token, recipient_id, options.reaction_message_id, options.reaction_emoji);
                } else {
                    throw new Error(`Message type '${message_type}' is not supported on Facebook API.`);
                }
            }

            else if (platform === 'twitter') {
                throw new Error('Twitter integration is currently disabled.');
            }

            else {
                throw new Error(`Unsupported omnichannel platform: ${platform}. Use unified-whatsapp.service.js for WhatsApp.`);
            }
        } catch (error) {
            console.error(`[OmnichannelService] Failed to send message via ${platform}:`, error.message);
            throw error;
        }
    }
}

export default new OmnichannelService();
