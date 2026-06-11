import { TelegramConnection, FacebookConnection, InstagramConnection, /* TwitterConnection, */ FacebookPage, FacebookLead, FacebookLeadForm, FacebookAdAccount, FacebookAdCampaign, FacebookAdSet, FacebookAd, Setting } from '../models/index.js';
import telegramProvider from '../services/messaging/providers/telegram.provider.js';
import facebookProvider from '../services/messaging/providers/facebook.provider.js';
import instagramProvider from '../services/messaging/providers/instagram.provider.js';
// import twitterProvider from '../services/messaging/providers/twitter.provider.js';
import { fetchAllFacebookPages } from './facebook.controller.js';
import axios from 'axios';
import mongoose from 'mongoose';

const FB_API_VERSION = 'v22.0';

export const connectChannel = async (req, res) => {
    try {
        const { platform, workspace_id } = req.body;
        const userId = req.user.owner_id || req.user.id;

        if (!platform || !workspace_id) {
            return res.status(400).json({ success: false, error: 'platform and workspace_id are required' });
        }

        let connection;

        if (platform === 'telegram') {
            const { bot_token } = req.body;
            if (!bot_token) {
                return res.status(400).json({ success: false, error: 'bot_token is required for telegram' });
            }

            let botDetails;
            try {
                const url = `https://api.telegram.org/bot${bot_token}/getMe`;
                const response = await axios.get(url);
                botDetails = response.data.result;
            } catch (error) {
                return res.status(400).json({ success: false, error: 'Invalid Telegram Bot Token' });
            }

            const existingTelegram = await TelegramConnection.findOne({
                bot_id: botDetails.id.toString(),
                workspace_id: { $ne: workspace_id }
            });
            if (existingTelegram) {
                return res.status(400).json({ success: false, error: 'This Telegram bot is already connected by another user or in another workspace.' });
            }

            const baseUrl = process.env.APP_URL || process.env.FRONTEND_URL;
            if (!baseUrl) {
                return res.status(500).json({ success: false, error: 'APP_URL is not configured in environment variables' });
            }

            const webhookUrl = `${baseUrl}/api/webhook/telegram/${workspace_id}`;
            await telegramProvider.setWebhook(bot_token, webhookUrl);

            connection = await TelegramConnection.findOneAndUpdate(
                { workspace_id },
                {
                    $set: {
                        user_id: userId,
                        workspace_id,
                        bot_token,
                        bot_id: botDetails.id.toString(),
                        bot_username: botDetails.username,
                        bot_name: botDetails.first_name,
                        webhook_url: webhookUrl,
                        is_active: true
                    }
                },
                { upsert: true, new: true }
            );
        } else if (platform === 'facebook') {
            const { access_token } = req.body;
            if (!access_token) {
                return res.status(400).json({ success: false, error: 'access_token is required' });
            }

            const setting = await Setting.findOne();
            let finalToken = access_token;
            if (setting?.app_id && setting?.app_secret) {
                try {
                    const fbExchangeRes = await axios.get(`https://graph.facebook.com/${FB_API_VERSION}/oauth/access_token`, {
                        params: {
                            grant_type: 'fb_exchange_token',
                            client_id: setting.app_id,
                            client_secret: setting.app_secret,
                            fb_exchange_token: finalToken
                        }
                    });
                    finalToken = fbExchangeRes.data.access_token || finalToken;
                } catch (err) {
                    console.warn("Failed to exchange Facebook token in connectChannel:", err.message);
                }
            }

            const meRes = await axios.get(`https://graph.facebook.com/${FB_API_VERSION}/me`, {
                params: { access_token: finalToken, fields: 'id,name,email' }
            });
            const fbUser = meRes.data;

            const existingFacebook = await FacebookConnection.findOne({
                fb_user_id: fbUser.id,
                workspace_id: { $ne: workspace_id }
            });
            if (existingFacebook) {
                return res.status(400).json({ success: false, error: 'This Facebook account is already connected by another user or in another workspace.' });
            }

            const pages = await fetchAllFacebookPages(finalToken, fbUser.id, userId);
            const validPages = pages.filter(p => !!p.access_token);

            connection = await FacebookConnection.findOneAndUpdate(
                { workspace_id },
                {
                    $set: {
                        user_id: userId,
                        workspace_id,
                        is_active: true,
                        fb_user_id: fbUser.id,
                        name: fbUser.name,
                        email: fbUser.email,
                        long_lived_access_token: finalToken,
                        pages: validPages.map(p => ({
                            page_id: p.id,
                            page_name: p.name,
                            page_access_token: p.access_token,
                            is_active: true
                        }))
                    }
                },
                { upsert: true, new: true }
            );

            await FacebookPage.deleteMany({ connection_id: connection._id });

            const pageDocs = validPages.map(p => ({
                user_id: userId,
                workspace_id,
                connection_id: connection._id,
                page_id: p.id,
                name: p.name,
                access_token: p.access_token,
                business_id: p.business?.id || null,
                is_whatsapp_connected: !!p.is_whatsapp_connected,
                is_instagram_connected: !!p.instagram_business_account?.id,
                instagram_username: p.instagram_business_account?.username || null,
                instagram_account_id: p.instagram_business_account?.id || null,
                is_active: true
            }));
            await FacebookPage.insertMany(pageDocs);

            for (const p of validPages) {
                try {
                    await facebookProvider.subscribePageToWebhook(p.id, p.access_token);
                } catch (subErr) {
                    console.error(`[Facebook Connection] Failed to subscribe page ${p.name}:`, subErr.message);
                }
            }
        } else if (platform === 'instagram') {
            const { code, redirect_uri } = req.body;
            if (!code || !redirect_uri) {
                return res.status(400).json({ success: false, error: 'code and redirect_uri are required for instagram' });
            }

            const setting = await Setting.findOne();
            if (!setting?.ig_app_id || !setting?.ig_app_secret) {
                return res.status(400).json({ success: false, error: 'Instagram App ID or Secret missing in settings' });
            }

            const form = new URLSearchParams();
            form.append('client_id', setting.ig_app_id);
            form.append('client_secret', setting.ig_app_secret);
            form.append('grant_type', 'authorization_code');
            form.append('redirect_uri', redirect_uri);
            form.append('code', code);

            let shortLivedToken;
            let igUserId;
            try {
                const tokenRes = await axios.post('https://api.instagram.com/oauth/access_token', form.toString(), {
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
                shortLivedToken = tokenRes.data.access_token;
                igUserId = tokenRes.data.user_id;
            } catch (err) {
                console.error("Instagram token exchange error:", err.response?.data || err.message);
                return res.status(400).json({ success: false, error: 'Failed to exchange Instagram authorization code' });
            }

            let longLivedToken = shortLivedToken;
            try {
                const igLongLivedRes = await axios.get('https://graph.instagram.com/access_token', {
                    params: {
                        grant_type: 'ig_exchange_token',
                        client_secret: setting.ig_app_secret,
                        access_token: shortLivedToken
                    }
                });
                longLivedToken = igLongLivedRes.data.access_token || shortLivedToken;
            } catch (err) {
                console.warn("Failed to exchange for long lived Instagram token:", err.response?.data || err.message);
            }

            let igUser = { id: igUserId, name: `Instagram Account (ID: ${igUserId})`, username: igUserId };
            try {
                const meResIg = await axios.get(`https://graph.instagram.com/v22.0/me`, {
                    params: { access_token: longLivedToken, fields: 'id,username,name,account_type,user_id' }
                });
                if (meResIg.data) {
                    igUser = {
                        id: meResIg.data.id,
                        global_id: meResIg.data.user_id,
                        name: meResIg.data.name || meResIg.data.username || `Instagram Account (ID: ${igUserId})`,
                        username: meResIg.data.username || igUserId
                    };
                }
            } catch (err2) {
                console.error("Instagram profile fetch error:", err2.response?.data || err2.message);
            }

            const existingInstagram = await InstagramConnection.findOne({
                ig_user_id: igUser.id,
                workspace_id: { $ne: workspace_id }
            });
            if (existingInstagram) {
                return res.status(400).json({ success: false, error: 'This Instagram account is already connected by another user or in another workspace.' });
            }

            connection = await InstagramConnection.findOneAndUpdate(
                { workspace_id },
                {
                    $set: {
                        user_id: userId,
                        workspace_id,
                        is_active: true,
                        ig_user_id: igUser.id,
                        global_instagram_account_id: igUser.global_id,
                        username: igUser.username || igUser.name || 'instagram_user',
                        name: igUser.name || igUser.username || 'Instagram Account',
                        access_token: longLivedToken,
                        pages: [{
                            page_id: igUser.id,
                            page_name: igUser.name || 'Instagram Account',
                            page_access_token: longLivedToken,
                            instagram_account_id: igUser.id,
                            global_instagram_account_id: igUser.global_id,
                            instagram_username: igUser.username || 'instagram_user',
                            is_active: true
                        }]
                    }
                },
                { upsert: true, new: true }
            );

            try {
                await instagramProvider.subscribePageToWebhook(igUser.id, longLivedToken);
            } catch (err) {
                console.error(`[Instagram Connection] Failed to subscribe webhook for ${igUser.username}:`, err.message);
            }
        } else if (platform === 'twitter') {
            return res.status(400).json({ success: false, error: 'Twitter integration is currently disabled.' });
        } else {
            return res.status(400).json({ success: false, error: 'Unsupported platform' });
        }

        res.status(200).json({
            success: true,
            message: `${platform.charAt(0).toUpperCase() + platform.slice(1)} connected successfully!`,
            data: connection
        });
    } catch (error) {
        console.error('Error connecting omnichannel channel:', error);
        res.status(500).json({ success: false, error: 'Failed to connect channel', details: error.message });
    }
};


export const getTwitterConfig = async (req, res) => {
    try {
        const setting = await Setting.findOne();

        if (!setting?.twitter_client_id) {
            return res.status(400).json({ success: false, error: 'Twitter credentials are not configured. Please contact your administrator.' });
        }

        const baseUrl = process.env.APP_URL || process.env.FRONTEND_URL;
        const redirectUri = setting.twitter_redirect_uri || `${baseUrl}/api/social/twitter/callback`;
        const clientId = setting.twitter_client_id;

        const scope = 'dm.read dm.write users.read tweet.read offline.access';

        res.status(200).json({
            success: true,
            data: { clientId, redirectUri, scope }
        });
    } catch (error) {
        console.error('[getTwitterConfig] Error:', error.message);
        res.status(500).json({ success: false, error: 'Failed to get Twitter config' });
    }
};


export const twitterCallback = async (req, res) => {
    const { code, state, error, error_description } = req.query;
    const html = `
        <!DOCTYPE html>
        <html>
          <head><title>Twitter Authorization</title></head>
          <body>
            <script>
              const data = {
                type: 'TWITTER_AUTH_CALLBACK',
                code: ${JSON.stringify(code || null)},
                state: ${JSON.stringify(state || null)},
                error: ${JSON.stringify(error || null)},
                error_description: ${JSON.stringify(error_description || null)}
              };
              if (window.opener) {
                window.opener.postMessage(data, '*');
                setTimeout(() => window.close(), 300);
              } else {
                document.body.innerHTML = '<h2>Authorization complete. You can close this window.</h2>';
              }
            </script>
          </body>
        </html>
    `;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
};

export const getConnectedChannels = async (req, res) => {
    try {
        const { workspace_id, platform } = req.query;
        if (!workspace_id) {
            return res.status(400).json({ success: false, error: 'workspace_id is required' });
        }

        let data = [];
        const connections = [];

        if (platform) {
            const userId = req.user?.owner_id || req.user?.id;
            const query = workspace_id && mongoose.Types.ObjectId.isValid(workspace_id) ? { workspace_id, is_active: true } : { user_id: userId, workspace_id: null, is_active: true };

            if (platform === 'telegram') {
                const conns = await TelegramConnection.find(query).lean();
                conns.forEach(conn => {
                    data.push({ ...conn, platform: 'telegram', telegram: conn });
                    connections.push({
                        id: conn.bot_id || conn._id.toString(),
                        name: conn.bot_name || conn.bot_username || 'Telegram Bot',
                        platform: 'telegram',
                        connection_id: conn._id.toString()
                    });
                });
            } else if (platform === 'facebook') {
                const conns = await FacebookConnection.find(query).lean();
                conns.forEach(conn => {
                    data.push({ ...conn, platform: 'facebook', facebook: conn });
                    (conn.pages || []).forEach(p => {
                        connections.push({
                            id: p.page_id,
                            name: p.page_name || 'Facebook Page',
                            platform: 'facebook',
                            connection_id: conn._id.toString()
                        });
                    });
                });
            } else if (platform === 'instagram') {
                const conns = await InstagramConnection.find(query).lean();
                conns.forEach(conn => {
                    data.push({ ...conn, platform: 'instagram', instagram: conn });
                    (conn.pages || []).forEach(p => {
                        connections.push({
                            id: p.instagram_account_id || p.page_id,
                            name: p.instagram_username || p.page_name || 'Instagram Account',
                            platform: 'instagram',
                            connection_id: conn._id.toString()
                        });
                    });
                });
            } else if (platform === 'twitter') {
            }
        } else {
            const userId = req.user?.owner_id || req.user?.id;
            const query = workspace_id && mongoose.Types.ObjectId.isValid(workspace_id) ? { workspace_id, is_active: true } : { user_id: userId, workspace_id: null, is_active: true };
            const [tgConns, fbConns, igConns] = await Promise.all([

                TelegramConnection.find(query).lean(),
                FacebookConnection.find(query).lean(),
                InstagramConnection.find(query).lean(),
                // TwitterConnection.find(query).lean()
            ]);

            tgConns.forEach(conn => {
                data.push({ ...conn, platform: 'telegram', telegram: conn });
                connections.push({
                    id: conn.bot_id || conn._id.toString(),
                    name: conn.bot_name || conn.bot_username || 'Telegram Bot',
                    platform: 'telegram',
                    connection_id: conn._id.toString()
                });
            });

            fbConns.forEach(conn => {
                data.push({ ...conn, platform: 'facebook', facebook: conn });
                (conn.pages || []).forEach(p => {
                    connections.push({
                        id: p.page_id,
                        name: p.page_name || 'Facebook Page',
                        platform: 'facebook',
                        connection_id: conn._id.toString()
                    });
                });
            });

            igConns.forEach(conn => {
                data.push({ ...conn, platform: 'instagram', instagram: conn });
                (conn.pages || []).forEach(p => {
                    connections.push({
                        id: p.instagram_account_id || p.page_id,
                        name: p.instagram_username || p.page_name || 'Instagram Account',
                        platform: 'instagram',
                        connection_id: conn._id.toString()
                    });
                });
            });

            // twConns.forEach(conn => {
            //     data.push({ ...conn, platform: 'twitter', twitter: conn });
            //     connections.push({
            //         id: conn.twitter_user_id || conn._id.toString(),
            //         name: conn.username || conn.name || 'Twitter Account',
            //         platform: 'twitter',
            //         connection_id: conn._id.toString()
            //     });
            // });
        }

        res.status(200).json({ success: true, data, connections });
    } catch (error) {
        console.error('Error fetching channels:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch channels' });
    }
};

export const disconnectChannel = async (req, res) => {
    try {
        const { id } = req.params;
        let connection = await TelegramConnection.findById(id);
        let platform = 'telegram';

        if (!connection) {
            connection = await FacebookConnection.findById(id);
            platform = 'facebook';
        }
        if (!connection) {
            connection = await InstagramConnection.findById(id);
            platform = 'instagram';
        }
        // DISABLED: Twitter not working
        // if (!connection) {
        //     connection = await TwitterConnection.findById(id);
        //     platform = 'twitter';
        // }

        if (!connection) {
            return res.status(404).json({ success: false, error: 'Channel connection not found' });
        }

        if (platform === 'telegram' && connection.bot_token) {
            try {
                await telegramProvider.setWebhook(connection.bot_token, '');
            } catch (err) {
                console.warn('Could not remove webhook from telegram:', err.message);
            }
            await TelegramConnection.findByIdAndDelete(id);
        } else if (platform === 'facebook') {
            await FacebookConnection.findByIdAndDelete(id);

            const pages = await FacebookPage.find({ connection_id: id });
            const pageIds = pages.map(p => p._id);
            const formDocs = await FacebookLeadForm.find({ facebook_page_id: { $in: pageIds } });
            const formIds = formDocs.map(f => f._id);

            await FacebookLead.deleteMany({ lead_form_id: { $in: formIds } });
            await FacebookLeadForm.deleteMany({ facebook_page_id: { $in: pageIds } });
            await FacebookPage.deleteMany({ connection_id: id });

            const adAccounts = await FacebookAdAccount.find({ connection_id: id });
            const adAccountIds = adAccounts.map(a => a.ad_account_id);
            if (adAccountIds.length > 0) {
                const campaigns = await FacebookAdCampaign.find({ ad_account_id: { $in: adAccountIds } });
                await FacebookAdSet.deleteMany({ campaign_id: { $in: campaignIds } });
                await FacebookAdCampaign.deleteMany({ ad_account_id: { $in: adAccountIds } });
                await FacebookAdAccount.deleteMany({ connection_id: id });
            }
        } else if (platform === 'instagram') {
            await InstagramConnection.findByIdAndDelete(id);
        } else if (platform === 'twitter') {
            // DISABLED: Twitter not working
            // await TwitterConnection.findByIdAndDelete(id);
        }

        res.status(200).json({ success: true, message: `${platform} disconnected successfully` });
    } catch (error) {
        console.error('Error disconnecting channel:', error);
        res.status(500).json({ success: false, error: 'Failed to disconnect channel' });
    }
};

// DISABLED: Twitter not working - getTwitterAuthUrl and handleTwitterCallback commented out
export const getTwitterAuthUrl = async (req, res) => {
    return res.status(400).json({ success: false, error: 'Twitter integration is currently disabled.' });
};

export const handleTwitterCallback = async (req, res) => {
    return res.status(400).json({ success: false, error: 'Twitter integration is currently disabled.' });
};
