import axios from 'axios';

class TelegramProvider {

    _formatButtons(buttons) {
        if (!buttons || !buttons.length) return undefined;
        const inlineKeyboard = buttons.map(btn => {
            if (btn.url || btn.type === 'url') {
                return [{ text: btn.text || btn.title, url: btn.url }];
            }
            const btnText = btn.text || btn.title || '';
            const btnId = btn.id || btn.payload || btn.value || '';
            const callbackData = btnId ? `${btnId}|${btnText}` : btnText;
            return [{ text: btnText, callback_data: callbackData }];
        });
        return { inline_keyboard: inlineKeyboard };
    }

    async sendTextMessage(botToken, chatId, text, buttons = null) {
        try {
            const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
            const payload = {
                chat_id: chatId,
                text: text
            };

            const replyMarkup = this._formatButtons(buttons);
            if (replyMarkup) payload.reply_markup = replyMarkup;

            const response = await axios.post(url, payload);
            return response.data;
        } catch (error) {
            console.error('[TelegramProvider] Error sending message:', error?.response?.data || error.message);
            throw error;
        }
    }

    async sendMediaMessage(botToken, chatId, messageType, fileUrl, caption, buttons = null) {
        try {
            let endpoint = 'sendDocument';
            let mediaField = 'document';

            if (messageType === 'image') {
                endpoint = 'sendPhoto';
                mediaField = 'photo';
            } else if (messageType === 'video') {
                endpoint = 'sendVideo';
                mediaField = 'video';
            } else if (messageType === 'audio') {
                endpoint = 'sendAudio';
                mediaField = 'audio';
            } else if (messageType === 'voice') {
                endpoint = 'sendVoice';
                mediaField = 'voice';
            } else if (messageType === 'sticker') {
                endpoint = 'sendSticker';
                mediaField = 'sticker';
            }

            if (typeof fileUrl === 'string' && fileUrl.includes('/uploads/')) {
                try {
                    const path = await import('path');
                    const fs = await import('fs');
                    const relativePath = fileUrl.substring(fileUrl.indexOf('uploads/'));
                    const absolutePath = path.join(process.cwd(), relativePath);
                    if (fs.existsSync(absolutePath)) {
                        fileUrl = { path: absolutePath };
                    }
                } catch (err) {
                    console.error('[TelegramProvider] Error resolving local file path:', err);
                }
            }

            const url = `https://api.telegram.org/bot${botToken}/${endpoint}`;

            const isFileObject = fileUrl && typeof fileUrl === 'object' && (fileUrl.buffer || fileUrl.path);

            let response;
            if (isFileObject) {
                const FormData = (await import('form-data')).default;
                const form = new FormData();
                form.append('chat_id', chatId);
                form.append('caption', caption || '');

                if (fileUrl.buffer) {
                    form.append(mediaField, fileUrl.buffer, { filename: fileUrl.originalname });
                } else {
                    const fs = await import('fs');
                    form.append(mediaField, fs.createReadStream(fileUrl.path));
                }

                const replyMarkup = this._formatButtons(buttons);
                if (replyMarkup) {
                    form.append('reply_markup', JSON.stringify(replyMarkup));
                }

                response = await axios.post(url, form, {
                    headers: form.getHeaders()
                });
            } else {
                const payload = {
                    chat_id: chatId,
                    [mediaField]: fileUrl,
                    caption: caption || ''
                };

                const replyMarkup = this._formatButtons(buttons);
                if (replyMarkup) payload.reply_markup = replyMarkup;

                response = await axios.post(url, payload);
            }

            return response.data;
        } catch (error) {
            console.error(`[TelegramProvider] Error sending ${messageType}:`, error?.response?.data || error.message);
            throw error;
        }
    }

    async sendLocation(botToken, chatId, latitude, longitude, name = null, address = null) {
        try {
            let endpoint = 'sendLocation';
            const payload = {
                chat_id: chatId,
                latitude: latitude,
                longitude: longitude
            };

            if (name || address) {
                endpoint = 'sendVenue';
                payload.title = name || 'Location';
                payload.address = address || 'Address';
            }

            const url = `https://api.telegram.org/bot${botToken}/${endpoint}`;
            const response = await axios.post(url, payload);
            return response.data;
        } catch (error) {
            console.error('[TelegramProvider] Error sending location:', error?.response?.data || error.message);
            throw error;
        }
    }

    async sendContact(botToken, chatId, phoneNumber, firstName) {
        try {
            const url = `https://api.telegram.org/bot${botToken}/sendContact`;
            const payload = {
                chat_id: chatId,
                phone_number: phoneNumber,
                first_name: firstName || 'Contact'
            };
            const response = await axios.post(url, payload);
            return response.data;
        } catch (error) {
            console.error('[TelegramProvider] Error sending contact:', error?.response?.data || error.message);
            throw error;
        }
    }

    async sendMediaGroup(botToken, chatId, mediaElements) {
        try {
            const url = `https://api.telegram.org/bot${botToken}/sendMediaGroup`;
            const payload = {
                chat_id: chatId,
                media: mediaElements.map(el => ({
                    type: el.type || 'photo',
                    media: el.media,
                    caption: el.caption || ''
                }))
            };
            const response = await axios.post(url, payload);
            return response.data;
        } catch (error) {
            console.error('[TelegramProvider] Error sending media group:', error?.response?.data || error.message);
            throw error;
        }
    }

    async sendReaction(botToken, chatId, messageId, emoji) {
        try {
            const url = `https://api.telegram.org/bot${botToken}/setMessageReaction`;
            const payload = {
                chat_id: chatId,
                message_id: parseInt(messageId, 10)
            };
            if (emoji) {
                payload.reaction = [{ type: 'emoji', emoji: emoji }];
            } else {
                payload.reaction = [];
            }
            const response = await axios.post(url, payload);
            return response.data;
        } catch (error) {
            console.error('[TelegramProvider] Error sending reaction:', error?.response?.data || error.message);
            throw error;
        }
    }

    async setWebhook(botToken, webhookUrl) {
        try {
            const url = `https://api.telegram.org/bot${botToken}/setWebhook`;
            const response = await axios.post(url, {
                url: webhookUrl,
                allowed_updates: ['message', 'edited_message', 'callback_query', 'my_chat_member', 'chat_member', 'message_reaction']
            });
            return response.data;
        } catch (error) {
            console.error('[TelegramProvider] Error setting webhook:', error?.response?.data || error.message);
            throw error;
        }
    }
}

export default new TelegramProvider();
