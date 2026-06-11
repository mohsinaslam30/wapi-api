import mongoose from 'mongoose';
import SocialAutomation from '../models/social-automation.model.js';
import axios from 'axios';
import { InstagramConnection, FacebookConnection, SocialMediaPost } from '../models/index.js';

const META_GRAPH_API_VERSION = 'v22.0';

export const createAutomation = async (req, res) => {
    try {
        const userId = req.user.owner_id;
        const {
            workspace_id, platform, connection_id, automation_type,
            target_media_id, keywords, matching_method, partial_percentage,
            reply_type, reply_id, reply_type_ref, variables_mapping, media_url, coupon_code,
            carousel_cards_data, carousel_products,
            auto_like_comment, auto_hide_comment, auto_reply_text, hide_condition_type, hide_keywords, hide_chatbot_id, requires_following, location_data,
            follow_gate_message, follow_gate_button_yes, follow_gate_button_no, follow_gate_rejection_message,
            delay_seconds, status
        } = req.body;

        let resolvedConnectionId = connection_id;
        if (!resolvedConnectionId) {
            if (platform === 'facebook') {
                const conn = await FacebookConnection.findOne({ workspace_id, user_id: userId, is_active: true });
                if (conn) resolvedConnectionId = conn._id;
            } else if (platform === 'instagram') {
                const conn = await InstagramConnection.findOne({ workspace_id, user_id: userId, is_active: true });
                if (conn) resolvedConnectionId = conn._id;
            }
        }

        if (!resolvedConnectionId) {
            return res.status(400).json({ success: false, error: 'Active connection not found for this platform' });
        }

        const automation = new SocialAutomation({
            user_id: userId,
            workspace_id,
            platform,
            connection_id: resolvedConnectionId,
            automation_type,
            target_media_id,
            keywords,
            matching_method,
            partial_percentage,
            reply_type,
            reply_id,
            reply_type_ref,
            variables_mapping,
            media_url,
            coupon_code,
            carousel_cards_data,
            carousel_products,
            auto_like_comment,
            auto_hide_comment,
            auto_reply_text,
            hide_condition_type,
            hide_keywords,
            hide_chatbot_id,
            requires_following,
            location_data,
            follow_gate_message,
            follow_gate_button_yes,
            follow_gate_button_no,
            follow_gate_rejection_message,
            delay_seconds,
            status
        });

        await automation.save();
        res.status(201).json({ success: true, message: 'Automation created successfully', data: automation });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getAutomations = async (req, res) => {
    try {
        const userId = req.user.owner_id;
        const { workspace_id, platform } = req.query;

        const query = { user_id: userId, deleted_at: null };
        if (workspace_id) query.workspace_id = workspace_id;
        if (platform) query.platform = platform;

        let automations = await SocialAutomation.find(query).sort({ created_at: -1 }).lean();
        
        const mediaIds = automations.filter(a => a.target_media_id && a.target_media_id !== 'all').map(a => a.target_media_id);
        const mediaPosts = await SocialMediaPost.find({ media_id: { $in: mediaIds }, user_id: userId }).lean();
        
        const mediaMap = mediaPosts.reduce((acc, post) => {
            acc[post.media_id] = post;
            return acc;
        }, {});

        automations = automations.map(a => {
            if (a.target_media_id === 'all') {
                return { ...a, post_details: { caption: 'Any Post', media_type: 'ALL', media_url: null } };
            }
            return { ...a, post_details: mediaMap[a.target_media_id] || null };
        });

        res.status(200).json({ success: true, data: automations });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getAutomationById = async (req, res) => {
    try {
        const userId = req.user.owner_id;
        const automation = await SocialAutomation.findOne({ _id: req.params.id, user_id: userId, deleted_at: null }).lean();

        if (!automation) {
            return res.status(404).json({ success: false, error: 'Automation not found' });
        }

        if (automation.target_media_id === 'all') {
            automation.post_details = { caption: 'Any Post', media_type: 'ALL', media_url: null };
        } else if (automation.target_media_id) {
            automation.post_details = await SocialMediaPost.findOne({ media_id: automation.target_media_id, user_id: userId }).lean();
        }

        res.status(200).json({ success: true, data: automation });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateAutomation = async (req, res) => {
    try {
        const userId = req.user.owner_id;
        const updateData = { ...req.body };

        const automation = await SocialAutomation.findOneAndUpdate(
            { _id: req.params.id, user_id: userId, deleted_at: null },
            updateData,
            { new: true }
        );

        if (!automation) {
            return res.status(404).json({ success: false, error: 'Automation not found' });
        }

        res.status(200).json({ success: true, message: 'Automation updated successfully', data: automation });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteAutomation = async (req, res) => {
    try {
        const userId = req.user.owner_id;
        const automation = await SocialAutomation.findOneAndUpdate(
            { _id: req.params.id, user_id: userId, deleted_at: null },
            { deleted_at: new Date() },
            { new: true }
        );

        if (!automation) {
            return res.status(404).json({ success: false, error: 'Automation not found' });
        }

        res.status(200).json({ success: true, message: 'Automation deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const fetchMedia = async (req, res) => {
    try {
        const userId = req.user.owner_id;
        const { platform, media_type, workspace_id, page_id } = req.body;

        if (!workspace_id || !platform) {
            return res.status(400).json({ success: false, error: 'workspace_id and platform are required' });
        }

        let connection;
        let targets = [];

        if (platform === 'instagram') {
            connection = await InstagramConnection.findOne({ workspace_id: workspace_id, user_id: userId, is_active: true });
            if (!connection) return res.status(404).json({ success: false, error: 'Instagram connection not found' });
            
            const accessToken = connection.access_token || connection.pages?.[0]?.page_access_token;
            const targetId = connection.global_instagram_account_id || connection.ig_user_id || connection.pages?.[0]?.instagram_account_id;
            
            if (!accessToken || !targetId) {
                return res.status(400).json({ success: false, error: 'Incomplete Instagram connection data' });
            }
            targets.push({ accessToken, targetId, baseUrl: accessToken.startsWith('IGAA') ? 'https://graph.instagram.com' : 'https://graph.facebook.com' });
            
        } else if (platform === 'facebook') {
            connection = await FacebookConnection.findOne({ workspace_id: workspace_id, user_id: userId, is_active: true });
            if (!connection) return res.status(404).json({ success: false, error: 'Facebook connection not found' });
            
            const activePages = connection.pages?.filter(p => p.is_active !== false) || [];
            if (activePages.length === 0) {
                return res.status(400).json({ success: false, error: 'No active Facebook pages found' });
            }
            
            for (const page of activePages) {
                if (page.page_access_token && page.page_id) {
                    if (page_id && page.page_id !== page_id) continue; 

                    targets.push({
                        accessToken: page.page_access_token,
                        targetId: page.page_id,
                        pageName: page.page_name,
                        baseUrl: 'https://graph.facebook.com'
                    });
                }
            }
        }

        let endpoint = platform === 'facebook' ? 'published_posts' : 'media';
        if (media_type === 'story') {
            endpoint = 'stories';
        }

        let allFetchedData = [];

        for (const target of targets) {
            try {
                let fieldsStr = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url},comments.limit(10){text,from}';
                
                if (platform === 'instagram' && media_type === 'story') {
                    fieldsStr = 'id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,children{id,media_type,media_url,thumbnail_url}';
                } else if (platform === 'facebook') {
                    if (media_type === 'story') {
                        fieldsStr = 'id,post_id,status,creation_time,media_type,url,media_id';
                    } else {
                        fieldsStr = 'id,message,created_time,permalink_url,full_picture,status_type,comments.limit(10){message,from},attachments{media}';
                    }
                }

                const response = await axios.get(`${target.baseUrl}/${META_GRAPH_API_VERSION}/${target.targetId}/${endpoint}`, {
                    params: {
                        fields: fieldsStr,
                        access_token: target.accessToken,
                        limit: 50
                    }
                });

                let data = response.data?.data || [];

                if (platform === 'facebook') {
                    data = data.map(item => {
                        if (media_type === 'story') {
                            const isVideo = item.media_type === 'video';
                            return {
                                id: item.post_id || item.id,
                                caption: 'Facebook Story',
                                media_type: isVideo ? 'VIDEO' : 'IMAGE',
                                media_product_type: 'STORY',
                                media_url: item.url || '',
                                thumbnail_url: item.url || '',
                                permalink: item.url || '',
                                timestamp: item.creation_time || '',
                                media_id: item.media_id || null,
                                children: { data: [] },
                                comments: { data: [] }
                            };
                        } else {
                            const isVideo = item.status_type === 'added_video';
                            const attachmentSource = item.attachments?.data?.[0]?.media?.source || '';
                            return {
                                id: item.id,
                                caption: item.message || '',
                                media_type: isVideo ? 'VIDEO' : 'IMAGE',
                                media_product_type: isVideo && item.permalink_url?.includes('/reel/') ? 'REELS' : 'FEED',
                                media_url: attachmentSource || item.full_picture || '',
                                thumbnail_url: item.full_picture || attachmentSource || '',
                                permalink: item.permalink_url || '',
                                timestamp: item.created_time || '',
                                children: { data: [] },
                                comments: { 
                                    data: (item.comments?.data || []).map(c => ({
                                        text: c.message,
                                        from: c.from
                                    }))
                                }
                            };
                        }
                    });

                    if (media_type === 'story') {
                        const mediaIds = data.map(d => d.media_id).filter(id => id);
                        if (mediaIds.length > 0) {
                            try {
                                const chunkSize = 50;
                                for (let i = 0; i < mediaIds.length; i += chunkSize) {
                                    const chunk = mediaIds.slice(i, i + chunkSize);
                                    const batchRes = await axios.get(`${target.baseUrl}/${META_GRAPH_API_VERSION}/`, {
                                        params: {
                                            ids: chunk.join(','),
                                            fields: 'picture,thumbnails,source',
                                            access_token: target.accessToken
                                        }
                                    });
                                    const batchData = batchRes.data;
                                    data = data.map(d => {
                                        if (d.media_id && batchData[d.media_id]) {
                                            const mediaObj = batchData[d.media_id];
                                            let bestThumb = mediaObj.picture;
                                            if (mediaObj.thumbnails && mediaObj.thumbnails.data && mediaObj.thumbnails.data.length > 0) {
                                                const preferred = mediaObj.thumbnails.data.find(t => t.is_preferred) || mediaObj.thumbnails.data[0];
                                                bestThumb = preferred.uri || bestThumb;
                                            }
                                            if (bestThumb) {
                                                d.thumbnail_url = bestThumb;
                                            }
                                            if (mediaObj.source && d.media_type === 'VIDEO') {
                                                d.media_url = mediaObj.source;
                                            }
                                        }
                                        return d;
                                    });
                                }
                            } catch (err) {
                                console.error('[Facebook] Error batch fetching story thumbnails:', err.response?.data || err.message);
                            }
                        }
                    }
                }
                
                if (media_type === 'reel') {
                    data = data.filter(item => item.media_product_type === 'REELS' || (item.permalink && item.permalink.includes('/reel/')));
                } else if (media_type === 'post') {
                    data = data.filter(item => item.media_product_type !== 'REELS' && item.media_product_type !== 'STORY' && (!item.permalink || !item.permalink.includes('/reel/')));
                }

                data = data.map(item => {
                    let captionText = item.caption || '';
                    if (!captionText && item.comments && item.comments.data && item.comments.data.length > 0) {
                        const authorComment = item.comments.data.find(c => c.from && c.from.id === target.targetId);
                        if (authorComment) {
                            captionText = authorComment.text;
                            item.caption = captionText;
                        } else if (media_type === 'story') {
                            captionText = item.comments.data[0].text;
                            item.caption = captionText;
                        }
                    }

                    const suggestedKeywords = [];
                    if (captionText) {
                        const quoteMatches = captionText.match(/['"]([^'"\s]+)['"]/g);
                        if (quoteMatches) {
                            quoteMatches.forEach(match => {
                                const word = match.replace(/['"]/g, '');
                                if (word.length > 2 && !suggestedKeywords.includes(word.toUpperCase())) {
                                    suggestedKeywords.push(word.toUpperCase());
                                }
                            });
                        }

                        const capsMatches = captionText.match(/\b[A-Z]{3,}\b/g);
                        if (capsMatches) {
                            capsMatches.forEach(word => {
                                if (!suggestedKeywords.includes(word)) {
                                    suggestedKeywords.push(word);
                                }
                            });
                        }
                    }
                    return {
                        ...item,
                        page_id: target.targetId,
                        page_name: target.pageName || null,
                        suggested_keywords: suggestedKeywords
                    };
                });

                allFetchedData = allFetchedData.concat(data);
            } catch (err) {
                console.error(`[SocialAutomationController] Error fetching media for target ${target.targetId}:`, err?.response?.data || err.message);
            }
        }

        if (allFetchedData.length > 0) {
            const bulkOps = allFetchedData.map(item => ({
                updateOne: {
                    filter: { connection_id: connection._id, media_id: item.id },
                    update: {
                        $set: {
                            user_id: userId,
                            workspace_id: workspace_id,
                            connection_id: connection._id,
                            platform: platform,
                            media_id: item.id,
                            media_type: item.media_type,
                            caption: item.caption,
                            media_url: item.media_url,
                            thumbnail_url: item.thumbnail_url,
                            permalink: item.permalink,
                            timestamp: item.timestamp,
                            suggested_keywords: item.suggested_keywords,
                            children: item.children ? item.children.data : null
                        }
                    },
                    upsert: true
                }
            }));
            await SocialMediaPost.bulkWrite(bulkOps);

            const mediaIds = allFetchedData.map(item => item.id);
            const existingAutomations = await SocialAutomation.find({
                user_id: userId,
                workspace_id: workspace_id,
                target_media_id: { $in: mediaIds },
                deleted_at: null
            }).lean();

            const automationMap = {};
            existingAutomations.forEach(auto => {
                automationMap[auto.target_media_id] = auto;
            });

            allFetchedData = allFetchedData.map(item => {
                const auto = automationMap[item.id];
                let finalKeywords = item.suggested_keywords || [];
                if (auto && auto.keywords && auto.keywords.length > 0) {
                    finalKeywords = auto.keywords;
                }

                return {
                    ...item,
                    has_automation: !!auto,
                    automation_id: auto ? auto._id.toString() : null,
                    suggested_keywords: finalKeywords
                };
            });
        }

        res.status(200).json({ success: true, data: allFetchedData });
    } catch (error) {
        console.error('[SocialAutomationController] Error fetching media:', error?.response?.data || error.message);
        res.status(500).json({ success: false, error: error?.response?.data?.error?.message || error.message });
    }
};

export const retriggerComments = async (req, res) => {
    try {
        const { media_id, platform, workspace_id } = req.body;
        const userId = req.user.owner_id;

        if (!media_id || !platform || !workspace_id) {
            return res.status(400).json({ success: false, error: 'media_id, platform, and workspace_id are required' });
        }

        let connection = null;
        let accessToken = null;
        let pageId = null;

        if (platform === 'instagram') {
            const { InstagramConnection } = await import('../models/index.js');
            connection = await InstagramConnection.findOne({ workspace_id, user_id: userId, is_active: true });
            if (connection) {
                accessToken = connection.access_token || connection.pages[0]?.page_access_token;
                pageId = connection.global_instagram_account_id || connection.ig_user_id || connection.pages[0]?.instagram_account_id;
            }
        } else if (platform === 'facebook') {
            const { FacebookConnection } = await import('../models/index.js');
            connection = await FacebookConnection.findOne({ workspace_id, user_id: userId, is_active: true });
            if (connection && connection.pages && connection.pages.length > 0) {
                const page = connection.pages.find(p => p.is_active);
                accessToken = page?.page_access_token;
                pageId = page?.page_id;
            }
        }

        if (!connection || !accessToken) {
            return res.status(400).json({ success: false, error: 'No active connection found for this platform' });
        }

        const baseUrl = accessToken.startsWith('IGAA') ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
        const META_GRAPH_API_VERSION = 'v22.0';

        let comments = [];
        try {
            const fieldsStr = platform === 'facebook' ? 'id,message,from,created_time' : 'id,text,from,timestamp';
            const response = await axios.get(`${baseUrl}/${META_GRAPH_API_VERSION}/${media_id}/comments`, {
                params: {
                    fields: fieldsStr,
                    access_token: accessToken,
                    limit: 100
                }
            });
            comments = response.data.data || [];
        } catch (err) {
            const errMsg = err.response?.data?.error?.message || '';
            if (errMsg.includes('nonexisting field (comments)')) {
                return res.status(200).json({ success: true, message: 'Retrigger is not supported for Facebook Stories as replies are sent directly to the inbox.', count: 0 });
            }
            throw err;
        }

        if (comments.length === 0) {
            return res.status(200).json({ success: true, message: 'No comments found to retrigger', count: 0 });
        }

        const { default: socialAutomationService } = await import('../services/messaging/social-automation.service.js');

        let triggeredCount = 0;
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        for (const comment of comments) {
            const commentText = comment.text || comment.message || '';
            const commentTimestamp = comment.timestamp || comment.created_time || '';
            const commentTime = new Date(commentTimestamp);
            
            if (!commentText) continue;
            if (commentTime < sevenDaysAgo) continue;
            if (comment.from && comment.from.id === pageId) continue;

            const webhookPayload = {
                id: comment.id,
                text: commentText,
                from: comment.from || { id: `fb_comment_${comment.id}`, name: 'Facebook User' },
                media: { id: media_id }
            };

            const connectionData = {
                platform,
                workspaceId: workspace_id,
                connectionId: connection._id,
                userId: connection.user_id,
                pageAccessToken: accessToken,
                pageOrAccountId: pageId
            };

            try {
                const matchFound = await socialAutomationService.handleIncomingComment(platform, webhookPayload, connectionData);
                if (matchFound) {
                    triggeredCount++;
                }
            } catch (err) {
                console.error(`[Retrigger] Error processing comment ${comment.id}:`, err.message);
            }
        }

        res.status(200).json({
            success: true,
            message: `Processed ${comments.length} comments, successfully triggered automations for ${triggeredCount} comments.`,
            total_processed: comments.length,
            triggered: triggeredCount
        });

    } catch (error) {
        console.error('[SocialAutomationController] Error retriggering comments:', error?.response?.data || error.message);
        res.status(500).json({ success: false, error: error?.response?.data?.error?.message || error.message });
    }
};
