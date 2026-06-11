import { WhatsappPhoneNumber, Message, EcommerceOrder, EcommerceOrderStatusTemplate, User, AppointmentBooking, AppointmentConfig, Contact, FacebookAdCampaign, AutomationFlow, UserSetting, Setting, FacebookPage, FacebookConnection, InstagramConnection } from '../models/index.js';
import {
  isWithinWorkingHours,
  findMatchingBot,
  sendAutomatedReply,
  assignRoundRobin,
  processAutomatedPipeline
} from '../utils/automated-response.service.js';
import db from '../models/index.js';
const { WabaConfiguration, WhatsappWaba } = db;
import { parseIncomingMessage, getWhatsAppMediaUrl, downloadAndStoreMedia } from '../utils/whatsapp-message-handler.js';
import automationEngine from '../utils/automation-engine.js';
import { updateWhatsAppStatus } from '../utils/message-status.service.js';
import { updateCampaignStatsFromWhatsApp } from '../utils/campaign-stats.service.js';
import { sendPushNotification } from '../utils/one-signal.js';
import axios from 'axios';
import socialAutomationService from '../services/messaging/social-automation.service.js';
import SocialAutomation from '../models/social-automation.model.js';
import omnichannelService from '../services/messaging/omnichannel.service.js';

const processedMids = new Set();
setInterval(() => processedMids.clear(), 60000);


export const handleWebhookVerification = async (req, res) => {
  console.log("called");
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe') {
    if (token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    const setting = await Setting.findOne().select('facebook_lead_webhook_verify_token instagram_webhook_verify_token').lean();
    const fbToken = setting?.facebook_lead_webhook_verify_token ||
      process.env.FACEBOOK_LEAD_WEBHOOK_VERIFY_TOKEN;

    if (fbToken && token === fbToken) {
      return res.status(200).send(challenge);
    }

    const igToken = setting?.instagram_webhook_verify_token ||
      process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN;

    if (igToken && token === igToken) {
      return res.status(200).send(challenge);
    }
  }

  return res.sendStatus(403);
};


export const handleFacebookInstagramIncoming = async (req, res, io = null) => {
  try {
    console.log('[Facebook/Instagram Webhook] Received POST:', JSON.stringify(req.body, null, 2));

    const isLeadgen = req.body.entry?.some(entry =>
      entry.changes && entry.changes.some(change => change.field === 'leadgen')
    );
    if (isLeadgen) {
      console.log('[Facebook/Instagram Webhook] Redirecting leadgen change event to facebook-lead.controller');
      const { handleLeadgenWebhook } = await import('./facebook-lead.controller.js');
      await handleLeadgenWebhook(req, res);
      return;
    }

    const body = req.body;
    const activeIo = req.app.get('io');

    res.status(200).send('EVENT_RECEIVED');

    if (body.object !== 'page' && body.object !== 'instagram') {
      return;
    }

    for (const entry of (body.entry || [])) {
      const pageOrAccountId = entry.id;
      console.log("ENTRY ID:", pageOrAccountId);
      console.log("FULL ENTRY:", JSON.stringify(entry, null, 2));

      const messagingEvents = entry.messaging || [];
      const commentEvents = [];
      if (entry.changes) {
        for (const change of entry.changes) {
          console.log("CHANGE FIELD:", change.field);
          console.log("CHANGE VALUE:", JSON.stringify(change.value, null, 2));
          if ((change.field === 'messages' || change.field === 'messaging_postbacks') && change.value) {
            messagingEvents.push(change.value);
          } else if (change.field === 'comments' && change.value) {
            commentEvents.push(change.value);

            if (change.value.from) {
              messagingEvents.push({
                sender: { id: change.value.from.id, name: change.value.from.name || change.value.from.username },
                recipient: { id: pageOrAccountId },
                timestamp: entry.time ? entry.time * 1000 : Date.now(),
                message: {
                  mid: `comment_${change.value.id}`,
                  text: change.value.text
                }
              });
            }
          } else if (change.field === 'feed' && change.value && change.value.item === 'comment' && change.value.verb === 'add') {
             const normalizedComment = {
              id: change.value.comment_id,
              text: change.value.message,
              from: change.value.from || { id: 'unknown', name: 'Unknown User' },
              media: { id: change.value.post_id }
            };
            commentEvents.push(normalizedComment);

            if (change.value.from) {
              messagingEvents.push({
                sender: { id: change.value.from.id, name: change.value.from.name || change.value.from.username },
                recipient: { id: pageOrAccountId },
                timestamp: change.value.created_time ? change.value.created_time * 1000 : Date.now(),
                message: {
                  mid: `comment_${change.value.comment_id}`,
                  text: change.value.message
                }
              });
            }
          }
        }
      }

      console.log("MESSAGING EVENTS:", JSON.stringify(messagingEvents, null, 2));

      let workspaceId = null;
      let userId = null;
      let connectionId = null;
      let pageAccessToken = null;
      let platform = null;
      let pageDoc = null;
      let connection = null;

      let pageWithIg = await FacebookPage.findOne({ instagram_account_id: pageOrAccountId, is_active: true });
      if (!pageWithIg) {
        pageWithIg = await FacebookPage.findOne({ page_id: pageOrAccountId, is_active: true });
      }

      if (pageWithIg) {
        platform = pageWithIg.instagram_account_id === pageOrAccountId ? 'instagram' : 'facebook';
        pageDoc = pageWithIg;
        workspaceId = pageWithIg.workspace_id;
        userId = pageWithIg.user_id;
        connectionId = pageWithIg.connection_id;
        pageAccessToken = pageWithIg.page_access_token;
      } else {
        connection = await InstagramConnection.findOne({ 'pages.page_id': pageOrAccountId, is_active: true });
        if (!connection) connection = await InstagramConnection.findOne({ ig_user_id: pageOrAccountId, is_active: true });
        if (!connection) connection = await InstagramConnection.findOne({ global_instagram_account_id: pageOrAccountId, is_active: true });

        if (connection) {
          platform = 'instagram';
          workspaceId = connection.workspace_id;
          userId = connection.user_id;
          connectionId = connection._id;
          const matchedPage = connection.pages?.find(p => p.instagram_account_id === pageOrAccountId || p.page_id === pageOrAccountId);
          pageAccessToken = matchedPage?.page_access_token || connection.pages?.[0]?.page_access_token || connection.access_token;
        } else {
            const activeIgConns = await InstagramConnection.find({ is_active: true });
            for (const conn of activeIgConns) {
              if (conn.access_token && conn.access_token.startsWith('IGAA')) {
                try {
                  const res = await axios.get(`https://graph.instagram.com/v22.0/${pageOrAccountId}?fields=id`, {
                    params: { access_token: conn.access_token }
                  });
                  if (res.data && res.data.id === conn.ig_user_id) {
                    console.log(`[Webhook] Resolved global ID ${pageOrAccountId} to IGSID ${conn.ig_user_id}`);
                    connection = conn;
                    platform = 'instagram';
                    workspaceId = conn.workspace_id;
                    userId = conn.user_id;
                    connectionId = conn._id;
                    pageAccessToken = conn.access_token;

                    if (conn.global_instagram_account_id !== pageOrAccountId) {
                      await InstagramConnection.findByIdAndUpdate(conn._id, {
                        global_instagram_account_id: pageOrAccountId
                      });
                    }
                    break;
                  }
                } catch (e) {
                }
              }
            }
        }
      }

      if (!workspaceId) {
        console.warn(`[Facebook/Instagram Webhook] No active Instagram connection or FacebookPage found in DB for ID: ${pageOrAccountId}`);
        continue;
      }

      for (const commentEvent of commentEvents) {
        await socialAutomationService.handleIncomingComment(platform, commentEvent, {
          workspaceId,
          userId,
          connectionId,
          pageAccessToken,
          pageOrAccountId,
          io: activeIo
        });
      }

      for (const event of messagingEvents) {
        const mid = event.message?.mid || event.postback?.mid || event.reaction?.mid || event.read?.mid;
        if (mid && processedMids.has(mid)) {
            console.log(`[Facebook/Instagram Webhook] Skipping duplicate webhook for mid: ${mid}`);
            continue;
        }
        if (mid && !event.read) {
            processedMids.add(mid);
        }

        const senderId = event.sender?.id;
        const recipientId = event.recipient?.id;

        if (event.message?.is_echo || senderId === pageOrAccountId) {
          console.log('[Facebook/Instagram Webhook] Skipping echo/outbound message');
          continue;
        }

        const isReaction = !!event.reaction;
        const isPostback = !!event.postback;

        const payload = event.postback?.payload || event.message?.quick_reply?.payload || '';

        if (payload.startsWith('FOLLOW_GATE_YES___')) {
            const automationId = payload.replace('FOLLOW_GATE_YES___', '');
            try {
                const automation = await SocialAutomation.findById(automationId).lean();
                if (automation) {
                    let isUserFollowing = true;

                    if (body.object === 'instagram' && pageAccessToken && pageAccessToken.startsWith('IGAA')) {
                        try {
                            const checkFollowUrl = `https://graph.instagram.com/v22.0/${senderId}?fields=is_user_follow_business&access_token=${pageAccessToken}`;
                            const checkRes = await axios.get(checkFollowUrl);
                            isUserFollowing = checkRes.data.is_user_follow_business;
                        } catch (apiErr) {
                            console.warn('[Facebook/Instagram Webhook] Could not verify IG follow status:', apiErr.message);
                        }
                    }

                    if (!isUserFollowing) {
                        const msgText = "We just checked, and it looks like you aren't following us yet! Please follow our page to receive the details.";
                        const sendResponse = await omnichannelService.sendMessage({
                            platform: 'instagram',
                            workspace_id: workspaceId,
                            user_id: userId,
                            page_id: pageOrAccountId,
                            recipient_id: senderId,
                            message_type: 'interactive',
                            text: msgText,
                            buttons: [
                                { type: 'postback', title: automation.follow_gate_button_yes || "I Follow", payload: `FOLLOW_GATE_YES___${automation._id}` },
                                { type: 'postback', title: automation.follow_gate_button_no || "Not Now", payload: `FOLLOW_GATE_NO___${automation._id}` }
                            ]
                        });
                        try {
                            const contact = await Contact.findOne({
                                user_id: userId,
                                $or: [ { facebook_page_scoped_id: senderId }, { instagram_scoped_id: senderId } ]
                            });
                            if (contact) {
                                await Message.create({
                                    workspace_id: workspaceId,
                                    user_id: userId,
                                    contact_id: contact._id,
                                    platform: 'instagram',
                                    provider: 'instagram',
                                    sender_id: pageOrAccountId,
                                    recipient_id: senderId,
                                    sender_number: pageOrAccountId,
                                    recipient_number: senderId,
                                    direction: 'outbound',
                                    message_type: 'interactive',
                                    content: msgText,
                                    interactive_data: { interactiveType: 'button', buttons: [
                                        { type: 'postback', title: automation.follow_gate_button_yes || "I Follow", payload: `FOLLOW_GATE_YES___${automation._id}` },
                                        { type: 'postback', title: automation.follow_gate_button_no || "Not Now", payload: `FOLLOW_GATE_NO___${automation._id}` }
                                    ]},
                                    from_me: true,
                                    delivery_status: 'delivered',
                                    read_status: 'unread',
                                    wa_timestamp: new Date(),
                                    platform_message_id: sendResponse?.message_id
                                });
                            }
                        } catch (dbErr) {}
                    } else {
                        const connectionData = { workspaceId, userId, pageAccessToken, pageOrAccountId, isFollowGateBypass: true };
                        await socialAutomationService.sendAutomationReplyMaterial(automation, senderId, null, connectionData);
                    }
                }
            } catch (err) {
                console.error('[Facebook/Instagram Webhook] Error triggering FOLLOW_GATE_YES:', err);
            }
        }

        if (payload.startsWith('FOLLOW_GATE_NO___')) {
            const automationId = payload.replace('FOLLOW_GATE_NO___', '');
            try {
                const automation = await SocialAutomation.findById(automationId).lean();
                if (automation) {
                    const rejectionMessage = automation.follow_gate_rejection_message || "No worries! Whenever you're ready, just follow our page to get the exclusive details.";
                    const localEventPlatform = body.object === 'instagram' ? 'instagram' : 'facebook';
                    const sendResponse = await omnichannelService.sendMessage({
                        platform: localEventPlatform,
                        workspace_id: workspaceId,
                        user_id: userId,
                        page_id: pageOrAccountId,
                        recipient_id: senderId,
                        message_type: 'text',
                        text: rejectionMessage,
                        reply_to_comment_id: null
                    });
                    try {
                        const contact = await Contact.findOne({
                            user_id: userId,
                            $or: [ { facebook_page_scoped_id: senderId }, { instagram_scoped_id: senderId } ]
                        });
                        if (contact) {
                            await Message.create({
                                workspace_id: workspaceId,
                                user_id: userId,
                                contact_id: contact._id,
                                platform: localEventPlatform,
                                provider: localEventPlatform,
                                sender_id: pageOrAccountId,
                                recipient_id: senderId,
                                sender_number: pageOrAccountId,
                                recipient_number: senderId,
                                direction: 'outbound',
                                message_type: 'text',
                                content: rejectionMessage,
                                from_me: true,
                                delivery_status: 'delivered',
                                read_status: 'unread',
                                wa_timestamp: new Date(),
                                platform_message_id: sendResponse?.message_id
                            });
                        }
                    } catch (dbErr) {}
                }
            } catch (err) {
                console.error('[Facebook/Instagram Webhook] Error triggering FOLLOW_GATE_NO:', err);
            }
        }

        if (payload.startsWith('phone_call|')) {
          console.log(`[Facebook/Instagram Webhook] Intercepted button payload: ${payload}. Skipping processing.`);
          continue;
        }

        if (!event.message && !isReaction && !isPostback) {
          continue;
        }

        let eventPlatform = platform;
        if (body.object === 'page') {
          eventPlatform = 'facebook';
          if (connection) {
            const isIgRecipient = recipientId === connection.ig_user_id ||
              connection.pages?.some(p => p.instagram_account_id === recipientId || p.instagram_account_id === senderId);
            if (isIgRecipient || recipientId === connection.ig_user_id || senderId === connection.ig_user_id) {
              eventPlatform = 'instagram';
            }
          } else if (pageDoc) {
            if (pageDoc.instagram_account_id && (recipientId === pageDoc.instagram_account_id || senderId === pageDoc.instagram_account_id)) {
              eventPlatform = 'instagram';
            }
          }
        } else if (body.object === 'instagram') {
          eventPlatform = 'instagram';
        }

        const message = event.message || (isPostback ? {
          mid: event.postback.mid || Date.now().toString(),
          text: event.postback.title || event.postback.payload,
          title: event.postback.title,
          payload: event.postback.payload
        } : {
          mid: event.reaction.mid,
          text: event.reaction.emoji || event.reaction.reaction || 'reaction'
        });

        console.log(`[Facebook/Instagram Webhook] Processed message object:`, JSON.stringify(message));


        let contactDoc = null;
        if (eventPlatform === 'facebook') {
          contactDoc = await Contact.findOne({ facebook_page_scoped_id: senderId, user_id: userId });
        } else if (eventPlatform === 'instagram') {
          contactDoc = await Contact.findOne({ instagram_scoped_id: senderId, user_id: userId });
        }

        if (!contactDoc) {
          let senderName = event.sender?.name || (eventPlatform === 'facebook' ? 'Facebook User' : 'Instagram User');
          if (pageAccessToken) {
            try {
              if (eventPlatform === 'facebook') {
                const convUrl = `https://graph.facebook.com/v22.0/${pageOrAccountId}/conversations?user_id=${senderId}&fields=participants&access_token=${pageAccessToken}`;
                const convRes = await axios.get(convUrl);
                const data = convRes.data.data;
                if (data && data.length > 0) {
                  const participants = data[0].participants?.data || [];
                  const userParticipant = participants.find(p => p.id === senderId);
                  if (userParticipant && userParticipant.name) {
                    senderName = userParticipant.name;
                  } else {
                    const profileUrl = `https://graph.facebook.com/v22.0/${senderId}?fields=first_name,last_name,name&access_token=${pageAccessToken}`;
                    const profileRes = await axios.get(profileUrl);
                    senderName = profileRes.data.name || `${profileRes.data.first_name || ''} ${profileRes.data.last_name || ''}`.trim() || 'Facebook User';
                  }
                } else {
                  const profileUrl = `https://graph.facebook.com/v22.0/${senderId}?fields=first_name,last_name,name&access_token=${pageAccessToken}`;
                  const profileRes = await axios.get(profileUrl);
                  senderName = profileRes.data.name || `${profileRes.data.first_name || ''} ${profileRes.data.last_name || ''}`.trim() || 'Facebook User';
                }
              } else {
                const baseUrl = pageAccessToken.startsWith('IGAA') ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
                const profileUrl = `${baseUrl}/v22.0/${senderId}?fields=username,name&access_token=${pageAccessToken}`;
                const profileRes = await axios.get(profileUrl);
                senderName = profileRes.data.name || profileRes.data.username || 'Instagram User';
              }
            } catch (err) {
              console.warn(`[Webhook] Could not retrieve profile for ${senderId}:`, err.response?.data?.error?.message || err.message);
            }
          }

          const contactFields = {
            user_id: userId,
            created_by: userId,
            workspace_id: workspaceId,
            name: senderName,
            source: eventPlatform
          };

          if (eventPlatform === 'facebook') {
            contactFields.facebook_page_scoped_id = senderId;
          } else {
            contactFields.instagram_scoped_id = senderId;
          }

          contactDoc = await Contact.create(contactFields);
        } else if (contactDoc.name === 'Facebook User' || contactDoc.name === 'Instagram User') {
          let updatedName = event.sender?.name || null;
          if (!updatedName && pageAccessToken) {
            try {
              if (eventPlatform === 'facebook') {
                const convUrl = `https://graph.facebook.com/v22.0/${pageOrAccountId}/conversations?user_id=${senderId}&fields=participants&access_token=${pageAccessToken}`;
                const convRes = await axios.get(convUrl);
                const data = convRes.data.data;
                if (data && data.length > 0) {
                  const participants = data[0].participants?.data || [];
                  const userParticipant = participants.find(p => p.id === senderId);
                  if (userParticipant && userParticipant.name) {
                    updatedName = userParticipant.name;
                  } else {
                    const profileUrl = `https://graph.facebook.com/v22.0/${senderId}?fields=first_name,last_name,name&access_token=${pageAccessToken}`;
                    const profileRes = await axios.get(profileUrl);
                    updatedName = profileRes.data.name || `${profileRes.data.first_name || ''} ${profileRes.data.last_name || ''}`.trim() || null;
                  }
                } else {
                  const profileUrl = `https://graph.facebook.com/v22.0/${senderId}?fields=first_name,last_name,name&access_token=${pageAccessToken}`;
                  const profileRes = await axios.get(profileUrl);
                  updatedName = profileRes.data.name || `${profileRes.data.first_name || ''} ${profileRes.data.last_name || ''}`.trim() || null;
                }
              } else {
                const baseUrl = pageAccessToken.startsWith('IGAA') ? 'https://graph.instagram.com' : 'https://graph.facebook.com';
                const profileUrl = `${baseUrl}/v22.0/${senderId}?fields=username,name&access_token=${pageAccessToken}`;
                const profileRes = await axios.get(profileUrl);
                updatedName = profileRes.data.name || profileRes.data.username || null;
              }
            } catch (err) {
              console.warn(`[Webhook] Could not retrieve profile for ${senderId}:`, err.response?.data?.error?.message || err.message);
            }
          }
          if (updatedName && updatedName !== 'Facebook User' && updatedName !== 'Instagram User') {
            contactDoc.name = updatedName;
            await Contact.findByIdAndUpdate(contactDoc._id, { name: updatedName });
          }
        }

        contactDoc.last_incoming_message_at = new Date();
        if (contactDoc.deleted_at) {
          contactDoc.deleted_at = null;
        }
        await contactDoc.save();

        let messageType = isReaction ? 'reaction' : (isPostback ? 'interactive' : 'text');

        if (message.mid && message.mid.startsWith('comment_')) {
          messageType = 'comment';
        }

        let content = message.text || '';
        let fileUrl = null;

        if (!isReaction && message.attachments && message.attachments.length > 0) {
          const attachment = message.attachments[0];
          const type = attachment.type;

          if (type === 'location') {
            messageType = 'location';
            content = JSON.stringify({
              latitude: attachment.payload?.coordinates?.lat,
              longitude: attachment.payload?.coordinates?.long
            });
          } else if (type === 'story_reply' || type === 'story_mention') {
            messageType = 'story_reply';
            fileUrl = attachment.payload?.url || null;
          } else {
            messageType = type === 'file' ? 'document' : type;
            fileUrl = attachment.payload?.url || null;
            content = fileUrl ? fileUrl.split('/').pop().split('?')[0] : '';
          }
        } else if (message.reply_to?.story?.url) {
          messageType = 'story_reply';
          fileUrl = message.reply_to.story.url;
        }

        const newMessage = await Message.create({
          workspace_id: workspaceId,
          user_id: userId,
          contact_id: contactDoc._id,
          platform: eventPlatform,
          provider: eventPlatform,
          platform_message_id: isReaction ? `reaction_${message.mid}_${Date.now()}` : message.mid,
          reaction_message_id: isReaction ? message.mid : undefined,
          sender_id: senderId,
          recipient_id: recipientId,
          direction: 'inbound',
          message_type: messageType,
          content: isReaction ? undefined : content,
          reaction_emoji: isReaction ? content : undefined,
          file_url: fileUrl,
          delivery_status: 'delivered',
          read_status: 'unread',
          wa_timestamp: new Date(event.timestamp || Date.now())
        });

        if (activeIo) {
          let wabaIdForSocket = recipientId;
          try {
            if (eventPlatform === 'instagram') {
              const { InstagramConnection } = await import('../models/index.js');
              const igConn = await InstagramConnection.findOne({
                $or: [
                  { global_instagram_account_id: recipientId },
                  { ig_user_id: recipientId },
                  { 'pages.instagram_account_id': recipientId }
                ]
              });
              if (igConn && igConn.pages && igConn.pages.length > 0) {
                const page = igConn.pages.find(p => p.instagram_account_id === recipientId || p.global_instagram_account_id === recipientId || igConn.global_instagram_account_id === recipientId);
                wabaIdForSocket = page ? page.instagram_account_id : igConn.pages[0].instagram_account_id;
              }
            } else if (eventPlatform === 'facebook') {
              const { FacebookConnection } = await import('../models/index.js');
              const fbConn = await FacebookConnection.findOne({
                $or: [
                  { fb_user_id: recipientId },
                  { 'pages.page_id': recipientId }
                ]
              });
              if (fbConn && fbConn.pages && fbConn.pages.length > 0) {
                const page = fbConn.pages.find(p => p.page_id === recipientId);
                wabaIdForSocket = page ? page.page_id : fbConn.pages[0].page_id;
              }
            }
          } catch (err) {
            console.error('Error resolving socket wabaId:', err);
          }

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
              name: contactDoc.name
            },
            recipient: {
              id: recipientId,
              name: recipientId
            },
            user_id: newMessage.user_id?.toString(),
            contact_id: contactDoc._id.toString(),
            platform: eventPlatform,
            provider: eventPlatform,
            whatsapp_phone_number_id: wabaIdForSocket
          };
          activeIo.emit('whatsapp:message', formattedMessage);
        }

        if (content && typeof content === 'string') {
          const upperContent = content.trim().toUpperCase();
          const { UserSetting } = await import('../models/index.js');
          const userSetting = await UserSetting.findOne({ user_id: userId }).lean();

          const optOutKeywords = (userSetting?.whatsapp_optout_keyword?.length > 0 ? userSetting.whatsapp_optout_keyword : ['STOP'])
            .filter(k => k)
            .map(k => k.trim().toUpperCase());

          const optInKeywords = (userSetting?.whatsapp_optin_keyword?.length > 0 ? userSetting.whatsapp_optin_keyword : ['START'])
            .filter(k => k)
            .map(k => k.trim().toUpperCase());

          if (optOutKeywords.includes(upperContent)) {
            await Contact.findByIdAndUpdate(contactDoc._id, { is_unsubscribed: true });

            try {
              const { sendOmnichannelMessageHelper } = await import('../utils/automated-response.service.js');

              const resubscribeHint = (userSetting?.whatsapp_optin_keyword && userSetting.whatsapp_optin_keyword.length > 0)
                ? userSetting.whatsapp_optin_keyword.join('/ ')
                : 'START';

              let responseMsg = userSetting?.whatsapp_unsubscribe_message || `You have been unsubscribed and will no longer receive messages. Reply {optin_keywords} to subscribe again.`;
              responseMsg = responseMsg.replace('{optin_keywords}', resubscribeHint);

              await sendOmnichannelMessageHelper({
                contactDoc: contactDoc,
                messageType: 'text',
                text: responseMsg
              });
            } catch (sendErr) {
              console.error('[Unsubscribe] Failed to send confirmation:', sendErr.message);
            }
            continue;
          }
          else if (optInKeywords.includes(upperContent)) {
            await Contact.findByIdAndUpdate(contactDoc._id, { is_unsubscribed: false });

            try {
              const { sendOmnichannelMessageHelper } = await import('../utils/automated-response.service.js');
              const resubscribeMsg = userSetting?.whatsapp_resubscribe_message || "Welcome back! You have been re-subscribed to our broadcasts.";

              await sendOmnichannelMessageHelper({
                contactDoc: contactDoc,
                messageType: 'text',
                text: resubscribeMsg
              });
            } catch (sendErr) {
              console.error('[Resubscribe] Failed to send confirmation:', sendErr.message);
            }
            continue;
          }
        }

        if (contactDoc.is_unsubscribed) {
          await Contact.findByIdAndUpdate(contactDoc._id, { is_unsubscribed: false });
          contactDoc.is_unsubscribed = false;
        }

        let automatedHandled = false;
        try {
          let storyReplyId = message?.reply_to?.story?.id || message?.reply_to?.object?.story?.id || null;
          if (!storyReplyId && message.attachments && message.attachments.length > 0) {
            const attachment = message.attachments[0];
            if (attachment.type === 'story_reply' || attachment.type === 'fallback') {
              storyReplyId = attachment.payload?.id || attachment.payload?.url || null;
            }
          }
          if (storyReplyId || eventPlatform === 'facebook') {
            automatedHandled = await socialAutomationService.handleIncomingDM(eventPlatform, content, senderId, message.mid, storyReplyId, {
              workspaceId,
              userId,
              connectionId,
              pageAccessToken,
              pageOrAccountId,
              io: activeIo
            });
          }

          if (!automatedHandled) {
            const chatAssignment = await db.ChatAssignment.findOne({
              sender_number: senderId,
              receiver_number: recipientId,
              status: 'assigned',
              assigned_by: userId
            }).lean();

            if (chatAssignment && chatAssignment.chatbot_id) {
              const isExpired = chatAssignment.chatbot_expires_at && new Date() > new Date(chatAssignment.chatbot_expires_at);
              if (!isExpired) {
                console.log(`[Facebook/Instagram Webhook] Forwarding message to assigned chatbot ${chatAssignment.chatbot_id}`);
                await sendAutomatedReply({
                  wabaId: null,
                  contactId: contactDoc._id,
                  replyType: 'chatbot',
                  replyId: chatAssignment.chatbot_id,
                  senderNumber: senderId,
                  incomingText: content,
                  userId: userId,
                  whatsappPhoneNumberId: null
                });
                automatedHandled = true;
              } else {
                console.log(`[Facebook/Instagram Webhook] Chatbot assignment expired for ${senderId}`);
                await db.ChatAssignment.findByIdAndUpdate(chatAssignment._id, { chatbot_id: null, chatbot_expires_at: null });
              }
            }
          }
          if (!automatedHandled) {
            await processAutomatedPipeline({
              workspaceId: workspaceId,
              contactDoc: contactDoc,
              incomingText: content,
              channel: eventPlatform,
              accountId: senderId,
              userId: userId,
              whatsappPhoneNumberId: null,
              businessAccountId: recipientId
            });
          }
        } catch (botErr) {
          console.error('[Facebook/Instagram Webhook] Automated pipeline error:', botErr);
        }

        if (!message.mid || !message.mid.startsWith('comment_')) {
          try {
            await automationEngine.triggerEvent("message_received", {
              platform: eventPlatform,
              message: content,
              interactive_id: message.payload || null,
              senderNumber: senderId,
              recipientNumber: recipientId,
              messageType: messageType,
              userId: userId.toString(),
              workspaceId: workspaceId?.toString(),
              whatsappPhoneNumberId: null,
              waMessageId: message.mid,
              waJid: senderId,
              contactId: contactDoc._id.toString(),
              timestamp: new Date()
            });
          } catch (automationError) {
            console.error(`[Facebook/Instagram Webhook] Automation trigger error:`, automationError);
          }
        }
      }
    }
  } catch (error) {
    console.error('[Facebook/Instagram Webhook Error]:', error);
  }
};

export const handleIncomingMessage = async (req, res, io = null) => {
  try {
    console.log("Incoming webhook called");

    const body = req.body;
    const entry = body.entry?.[0];

    if (body.object === 'page' || body.object === 'instagram' || (entry && entry.messaging)) {
      return handleFacebookInstagramIncoming(req, res, io);
    }

    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.messages) {
      return res.sendStatus(200);
    }

    const message = value.messages[0];
    const phoneNumberId = value.metadata.phone_number_id;

    const whatsappPhoneNumber = await WhatsappPhoneNumber.findOne({
      phone_number_id: phoneNumberId
    })
      .populate('waba_id')
      .lean();

    if (!whatsappPhoneNumber || !whatsappPhoneNumber.waba_id) {
      console.log(`WhatsApp phone number not found for phone_number_id: ${phoneNumberId}`);
      return res.sendStatus(200);
    }

    const { access_token } = whatsappPhoneNumber.waba_id;

    const {
      content,
      mediaId,
      fileType,
      mimeType,
      interactiveId,
      interactiveData,
      replyMessageId,
      reactionMessageId,
      reactionEmoji
    } = parseIncomingMessage(message);

    let mediaUrl = null;
    let storedPath = null;

    if (mediaId) {
      try {
        mediaUrl = await getWhatsAppMediaUrl(mediaId, access_token);
        storedPath = await downloadAndStoreMedia(
          mediaUrl,
          access_token,
          mimeType,
          fileType,
          whatsappPhoneNumber.user_id
        );
      } catch (mediaErr) {
        console.error(`[Webhook] Failed to download media (id=${mediaId}):`, mediaErr.message);
      }
    }

    const contact = await import('../models/index.js');
    const Contact = contact.Contact;
    let contactDoc = await Contact.findOneAndUpdate(
      { phone_number: message.from, created_by: whatsappPhoneNumber.user_id },
      {
        $setOnInsert: {
          phone_number: message.from,
          name: message.from,
          source: 'whatsapp',
          user_id: whatsappPhoneNumber.user_id,
          created_by: whatsappPhoneNumber.user_id,
          status: 'lead'
        },
        $set: { deleted_at: null }
      },
      { new: true, upsert: true }
    );


    contactDoc = await Contact.findById(contactDoc._id);

    let automatedHandled = false;

    const messageDoc = await Message.create({
      sender_number: message.from,
      recipient_number: whatsappPhoneNumber.display_phone_number,
      message_type: ['text', 'link', 'image', 'sticker', 'file', 'video', 'poll', 'form', 'system', 'call', 'document', 'audio', 'location', 'interactive', 'template', 'order', 'system_messages', 'reaction'].includes(message.type) ? message.type : 'system_messages',
      content: content || (message.type === 'unsupported' ? 'Unsupported message type received' : null),
      wa_message_id: message.id,
      wa_media_id: mediaId,
      file_url: storedPath,
      file_type: fileType,
      from_me: false,
      direction: "inbound",
      wa_timestamp: new Date(Number(message.timestamp) * 1000),
      metadata: message,
      user_id: whatsappPhoneNumber.user_id,
      contact_id: contactDoc._id,
      interactive_data: interactiveData,
      provider: 'business_api',
      reply_message_id: replyMessageId,
      reaction_message_id: reactionMessageId,
      reaction_emoji: reactionEmoji
    });

    if (content && typeof content === 'string') {
      const upperContent = content.trim().toUpperCase();

      const userSetting = await UserSetting.findOne({ user_id: whatsappPhoneNumber.user_id }).lean();

      const optOutKeywords = (userSetting?.whatsapp_optout_keyword?.length > 0 ? userSetting.whatsapp_optout_keyword : ['STOP'])
        .filter(k => k)
        .map(k => k.trim().toUpperCase());

      const optInKeywords = (userSetting?.whatsapp_optin_keyword?.length > 0 ? userSetting.whatsapp_optin_keyword : ['START'])
        .filter(k => k)
        .map(k => k.trim().toUpperCase());

      if (optOutKeywords.includes(upperContent)) {
        await Contact.findByIdAndUpdate(contactDoc._id, { is_unsubscribed: true });

        try {
          const { default: unifiedService } = await import('../services/whatsapp/unified-whatsapp.service.js');

          const resubscribeHint = (userSetting?.whatsapp_optin_keyword && userSetting.whatsapp_optin_keyword.length > 0)
            ? userSetting.whatsapp_optin_keyword.join('/ ')
            : 'START';

          let responseMsg = userSetting?.whatsapp_unsubscribe_message || `You have been unsubscribed and will no longer receive messages. Reply {optin_keywords} to subscribe again.`;
          responseMsg = responseMsg.replace('{optin_keywords}', resubscribeHint);

          await unifiedService.sendMessage(whatsappPhoneNumber.user_id, {
            whatsappPhoneNumberId: whatsappPhoneNumber._id,
            contactId: contactDoc._id,
            messageText: responseMsg,
            messageType: 'text',
            ignoreUnsubscribe: true
          });
        } catch (sendErr) {
          console.error('[Unsubscribe] Failed to send confirmation:', sendErr.message);
        }

        return res.sendStatus(200);
      }
      else if (optInKeywords.includes(upperContent)) {
        await Contact.findByIdAndUpdate(contactDoc._id, { is_unsubscribed: false });

        try {
          const { default: unifiedService } = await import('../services/whatsapp/unified-whatsapp.service.js');
          const resubscribeMsg = userSetting?.whatsapp_resubscribe_message || "Welcome back! You have been re-subscribed to our broadcasts.";
          await unifiedService.sendMessage(whatsappPhoneNumber.user_id, {
            whatsappPhoneNumberId: whatsappPhoneNumber._id,
            contactId: contactDoc._id,
            messageText: resubscribeMsg,
            messageType: 'text',
            ignoreUnsubscribe: true
          });
        } catch (sendErr) {
          console.error('[Resubscribe] Failed to send confirmation:', sendErr.message);
        }
        return res.sendStatus(200);
      }
    }

    if (contactDoc.is_unsubscribed) {
      await Contact.findByIdAndUpdate(contactDoc._id, { is_unsubscribed: false });
      contactDoc.is_unsubscribed = false;
    }

    if (message.referral && message.referral.source_id && message.referral.source_type === 'ad') {
      try {
        const adId = message.referral.source_id;
        console.log(`[Webhook] Ad Referral detected: source_id=${adId}`);

        const campaign = await FacebookAdCampaign.findOne({ fb_ad_id: adId }).lean();

        if (campaign && campaign.automation_trigger && campaign.automation_trigger.type_name !== 'none') {
          const trigger = campaign.automation_trigger;
          console.log(`[Webhook] Found linked automation: ${trigger.type_name} (${trigger.id})`);

          if (trigger.type_name === 'reply_material') {
            await sendAutomatedReply({
              wabaId: whatsappPhoneNumber.waba_id._id || whatsappPhoneNumber.waba_id,
              contactId: contactDoc._id,
              replyType: 'reply_material',
              replyId: trigger.id,
              senderNumber: message.from,
              incomingText: content,
              userId: whatsappPhoneNumber.user_id,
              whatsappPhoneNumberId: whatsappPhoneNumber._id
            });
            automatedHandled = true;
          } else if (trigger.type_name === 'workflow') {
            const flow = await AutomationFlow.findById(trigger.id).lean();
            if (flow && flow.is_active) {
              await automationEngine.executeFlow(flow, {
                message: content,
                senderNumber: message.from,
                recipientNumber: whatsappPhoneNumber.display_phone_number,
                messageType: message.type,
                userId: whatsappPhoneNumber.user_id.toString(),
                whatsappPhoneNumberId: whatsappPhoneNumber._id.toString(),
                waMessageId: message.id,
                contactId: contactDoc._id.toString(),
                timestamp: new Date(Number(message.timestamp) * 1000),
                event_type: 'ad_click'
              });
              automatedHandled = true;
            }
          }
        }
      } catch (attrError) {
        console.error('[Webhook] Error handling ad referral attribution:', attrError);
      }
    }

    if (io) {
      const populatedMessage = await Message.findById(messageDoc._id)
        .populate({
          path: 'template_id',
          select: 'template_name language category status message_body body_variables header footer_text buttons meta_template_id'
        })
        .populate('submission_id')
        .lean();

      const senderNumber = populatedMessage.sender_number;
      const recipientNumber = populatedMessage.recipient_number;

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
          id: senderNumber,
          name: senderNumber
        },
        recipient: {
          id: recipientNumber,
          name: recipientNumber
        },
        submission_id: populatedMessage.submission_id?._id || populatedMessage.submission_id || null,
        fields: populatedMessage.submission_id?.fields || [],
        user_id: populatedMessage.user_id?.toString(),
        whatsapp_phone_number_id: whatsappPhoneNumber._id?.toString()
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

      req.app.get('io').emit('whatsapp:message', formattedMessage);
    }

    try {
      const notificationContent = content || (fileType ? `Received ${fileType}` : 'New message');
      const senderName = contactDoc.name || message.from;
      const user = await User.findById(whatsappPhoneNumber.user_id)
        .select('player_id')
        .lean();

      await sendPushNotification({
        userIds: user.player_id,
        heading: `New message from ${senderName}`,
        content: notificationContent.length > 100 ? notificationContent.substring(0, 97) + '...' : notificationContent,
        data: {
          contact_id: contactDoc._id.toString(),
          wa_message_id: message.id,
          sender_number: message.from,
          type: 'incoming_message'
        }
      });
    } catch (pushError) {
      console.error('Error sending push notification:', pushError);
    }

    const metadata = contactDoc.metadata || {};
    const waitingType = metadata.automation_waiting_type;
    const configId = metadata.automation_waiting_config_id;
    const bookingId = metadata.automation_current_booking_id;

    if (message.type === 'interactive' && (waitingType || bookingId)) {
      console.log(`[PIVOTAL] Entering Clinical Priority Handler: WaitingType=${waitingType}, BookingId=${bookingId}`);
      console.log(`[PIVOTAL] Metadata Dump: ${JSON.stringify(metadata)}`);
    }

    if (waitingType === 'appointment_question' && message.type === 'text') {
      try {
        const inputData = JSON.parse(metadata.automation_input_data || "{}");
        const answers = inputData.appointment_answers || {};
        const questionId = metadata.automation_current_question_id;

        if (questionId) {
          answers[questionId] = content;
          inputData.appointment_answers = answers;

          contactDoc.metadata.automation_waiting_type = null;
          contactDoc.markModified('metadata');
          await contactDoc.save();

          const { default: appointmentService } = await import('../services/appointment.service.js');
          console.log(`[PIVOTAL] Resuming Questionnaire. Handing off to startConversationalFlow.`);
          await appointmentService.startConversationalFlow({
            userId: whatsappPhoneNumber.user_id,
            contactId: contactDoc._id,
            configId: metadata.automation_waiting_config_id,
            whatsappPhoneNumberId: whatsappPhoneNumber._id,
            inputData: inputData
          });
          return res.sendStatus(200);
        }
      } catch (err) {
        console.error("[PIVOTAL] Error resuming questionnaire:", err);
      }
    }
    else if (message.type === 'interactive' && message.interactive?.type === 'list_reply' && waitingType?.startsWith('appointment_')) {
      const selectionId = message.interactive.list_reply.id;
      try {
        const { default: appointmentService } = await import('../services/appointment.service.js');
        const inputData = JSON.parse(metadata.automation_input_data || "{}");

        if (waitingType === 'appointment_date_selection' && selectionId.startsWith('date_')) {
          const selectedDate = selectionId.replace('date_', '');
          console.log(`[PIVOTAL] Date selection detected: ${selectedDate}`);
          await appointmentService.sendTimeSelection(whatsappPhoneNumber.user_id, contactDoc._id, configId, selectedDate, whatsappPhoneNumber._id, inputData);
          return res.sendStatus(200);
        }
        else if (waitingType === 'appointment_time_selection' && selectionId.startsWith('slot_')) {
          const slotStart = selectionId.replace('slot_', '');
          console.log(`[PIVOTAL] Slot selection detected: ${slotStart}`);
          const { AppointmentConfig } = await import('../models/index.js');
          const config = await AppointmentConfig.findById(configId).lean();
          const duration = config?.duration_minutes || 30;
          const startTime = new Date(slotStart);
          const endTime = new Date(startTime.getTime() + duration * 60000);
          const rescheduleBookingId = metadata.automation_reschedule_booking_id;

          if (rescheduleBookingId) {
            await appointmentService.rescheduleBooking(rescheduleBookingId, startTime.toISOString(), endTime.toISOString(), whatsappPhoneNumber._id);
            contactDoc.metadata.automation_waiting_type = null;
            contactDoc.metadata.automation_reschedule_booking_id = null;
            contactDoc.markModified('metadata');
            await contactDoc.save();
          } else {
            const booking = await appointmentService.createBooking({
              configId,
              contactId: contactDoc._id,
              userId: whatsappPhoneNumber.user_id,
              startTime,
              endTime: endTime.toISOString(),
              answers: inputData.appointment_answers || {},
              whatsappPhoneNumberId: whatsappPhoneNumber._id
            });

            console.log(`[PIVOTAL] Booking Created: ${booking._id}. Sending status options...`);

            if (config.send_confirmation_message !== false) {
              await appointmentService.sendBookingStatusOptions(
                whatsappPhoneNumber.user_id,
                contactDoc._id,
                booking._id,
                whatsappPhoneNumber._id
              );
            } else {
              console.log(`[PIVOTAL] Skip confirmation buttons (config limit). Ending flow.`);
              contactDoc.metadata.automation_waiting_type = null;
              contactDoc.markModified('metadata');
              await contactDoc.save();
            }
          }
          return res.sendStatus(200);
        }
      } catch (err) {
        console.error("[PIVOTAL] Error handling appointment list reply:", err);
      }
    }
    else if (message.type === 'interactive' && message.interactive?.type === 'button_reply' && (waitingType === 'appointment_status_selection' || bookingId)) {
      const buttonId = message.interactive.button_reply.id;
      if (buttonId.startsWith('status_')) {
        try {
          const { default: appointmentService } = await import('../services/appointment.service.js');
          console.log(`[PIVOTAL] Status Update detected: ${buttonId} for Booking: ${bookingId}`);

          if (buttonId === 'status_confirm') {
            if (!bookingId) {
              console.error(`[PIVOTAL] Error: status_confirm clicked but bookingId is null in metadata.`);
              return res.sendStatus(200);
            }
            const booking = await AppointmentBooking.findByIdAndUpdate(bookingId, { status: 'confirmed' }, { returnDocument: 'after' });
            if (!booking) {
              console.error(`[PIVOTAL] Error: Booking document ${bookingId} not found during confirmation.`);
              return res.sendStatus(200);
            }
            const config = await AppointmentConfig.findById(booking.config_id).lean();
            if (config?.confirm_template_id) {
              await appointmentService.sendAppointmentTemplate(whatsappPhoneNumber.user_id, contactDoc._id, config.confirm_template_id, booking, 'confirm', whatsappPhoneNumber._id);
            }
            contactDoc.metadata.automation_waiting_type = null;
          }
          else if (buttonId === 'status_cancel') {
            if (bookingId) {
              await appointmentService.cancelBooking(bookingId, whatsappPhoneNumber._id);
            }
            contactDoc.metadata.automation_waiting_type = null;
          }
          else if (buttonId === 'status_reschedule') {
            if (!bookingId) {
              console.error(`[PIVOTAL] Error: status_reschedule clicked but bookingId is null.`);
              return res.sendStatus(200);
            }
            const inputData = JSON.parse(metadata.automation_input_data || "{}");
            contactDoc.metadata.automation_reschedule_booking_id = bookingId;
            contactDoc.markModified('metadata');
            await contactDoc.save();
            await appointmentService.sendDateSelection(whatsappPhoneNumber.user_id, contactDoc._id, configId, whatsappPhoneNumber._id, inputData);
            return res.sendStatus(200);
          }

          contactDoc.markModified('metadata');
          await contactDoc.save();
          return res.sendStatus(200);
        } catch (err) {
          console.error("[PIVOTAL] Error handling appointment status button:", err);
        }
      }
    }

    if (message.type === 'interactive' && message.interactive?.type === 'nfm_reply') {
      try {
        const { default: appointmentWebhookService } = await import('../services/whatsapp/appointment-webhook.service.js');
        const handled = await appointmentWebhookService.handleFlowResponse(message, contactDoc);

        if (!handled) {
          const { default: metaFlowService } = await import('../services/whatsapp/meta-flow.service.js');
          const submission = await metaFlowService.handleFlowSubmission(message, whatsappPhoneNumber, contactDoc);
          if (submission?._id) {
            messageDoc.submission_id = submission._id;
            await messageDoc.save();
            console.log(`[Webhook] Linked submission ${submission._id} to message ${messageDoc._id}`);
          }
        }
      } catch (err) {
        console.error("Error processing meta-flow/appointment submission:", err);
      }
    }


    if (message.order) {
      try {
        const order = message.order;

        const items = Array.isArray(order.product_items)
          ? order.product_items.map((item) => ({
            product_retailer_id: item.product_retailer_id || item.retailer_id || null,
            quantity: Number(item.quantity) || 1,
            price: item.item_price ? Number(item.item_price) : null,
            name: item.name || null,
            raw: item
          }))
          : [];

        const totalPrice = items.reduce(
          (sum, it) => (it.price && it.quantity ? sum + it.price * it.quantity : sum),
          0
        );

        const createdOrder = await EcommerceOrder.create({
          user_id: whatsappPhoneNumber.user_id,
          phone_no_id: whatsappPhoneNumber._id,
          contact_id: contactDoc._id,
          wa_message_id: message.id,
          wa_order_id: order.id || null,
          currency: order.currency || null,
          total_price: Number.isFinite(totalPrice) ? totalPrice : null,
          items,
          raw_payload: message
        });

        try {
          await automationEngine.triggerEvent("order_received", {
            platform: 'whatsapp',
            order_id: createdOrder._id?.toString(),
            wa_order_id: createdOrder.wa_order_id,
            wa_message_id: createdOrder.wa_message_id,
            total_price: createdOrder.total_price,
            currency: createdOrder.currency,
            items_count: Array.isArray(createdOrder.items) ? createdOrder.items.length : 0,
            senderNumber: message.from,
            recipientNumber: whatsappPhoneNumber.display_phone_number,
            userId: whatsappPhoneNumber.user_id.toString(),
            workspaceId: whatsappPhoneNumber.waba_id?.workspace_id?.toString(),
            whatsappPhoneNumberId: whatsappPhoneNumber._id.toString(),
            contactId: contactDoc._id.toString(),
            timestamp: new Date(Number(message.timestamp) * 1000)
          });
        } catch (automationOrderError) {
          console.error('Error triggering order_received automation:', automationOrderError);
        }

        try {
          const { default: automationCache } = await import('../utils/automation-cache.js');
          const triggers = await automationCache.getUserActiveFlows(whatsappPhoneNumber.user_id.toString());
          const incomingWorkspaceId = whatsappPhoneNumber.waba_id?.workspace_id?.toString();

          const workspaceTriggers = triggers.filter(t => {
            const triggerWorkspaceId = t.workspace_id ? t.workspace_id.toString() : null;
            return !triggerWorkspaceId || !incomingWorkspaceId || triggerWorkspaceId === incomingWorkspaceId;
          });

          const hasOrderReceivedTrigger = workspaceTriggers.some(t => t.event_type === 'order_received');

          if (!hasOrderReceivedTrigger) {
            const { default: unifiedService } = await import('../services/whatsapp/unified-whatsapp.service.js');

            const orderCount = await EcommerceOrder.countDocuments({
              contact_id: contactDoc._id,
              deleted_at: null
            });

            const statusesToSend = [];
            if (orderCount === 1) {
              statusesToSend.push('first_message');
            }
            statusesToSend.push('pending');

            for (const statusToSend of statusesToSend) {
              const tmplDoc = await EcommerceOrderStatusTemplate.findOne({
                user_id: whatsappPhoneNumber.user_id,
                status: statusToSend,
                is_active: true,
                deleted_at: null
              }).populate('approved_template_id').lean();

              if (tmplDoc) {
                const formatItemsSummaryLocal = (itemsList = []) => {
                  if (!Array.isArray(itemsList) || itemsList.length === 0) return '';
                  return itemsList
                    .map((it) => {
                      const label = it?.name || it?.product_retailer_id || 'Item';
                      const qty = Number(it?.quantity) || 1;
                      return `${label} x${qty}`;
                    })
                    .join(', ');
                };

                const renderTemplateLocal = (tmplStr, data) => {
                  if (!tmplStr || typeof tmplStr !== 'string') return '';
                  return tmplStr.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
                    const val = data?.[key];
                    if (val === null || val === undefined) return '';
                    return String(val);
                  });
                };

                const itemsSummary = formatItemsSummaryLocal(createdOrder.items);
                const placeholderValues = {
                  status: createdOrder.status,
                  wa_order_id: createdOrder.wa_order_id || 'N/A',
                  order_id: createdOrder._id?.toString(),
                  total_price: (createdOrder.total_price || 0).toFixed(2),
                  currency: createdOrder.currency || 'INR',
                  customer_name: contactDoc.name || message.from,
                  customer_phone: contactDoc.phone_number || message.from,
                  items_count: Array.isArray(createdOrder.items) ? createdOrder.items.length : 0,
                  items_summary: itemsSummary || 'N/A'
                };

                if (tmplDoc.use_approved_template && tmplDoc.approved_template_id) {
                  const templateDoc = tmplDoc.approved_template_id;
                  const templateVariables = {};
                  if (tmplDoc.variable_mappings) {
                    for (const [key, placeholderKey] of Object.entries(tmplDoc.variable_mappings)) {
                      templateVariables[key] = placeholderValues[placeholderKey] !== undefined ? placeholderValues[placeholderKey] : placeholderKey;
                    }
                  }

                  await unifiedService.sendMessage(whatsappPhoneNumber.user_id, {
                    whatsappPhoneNumber: whatsappPhoneNumber,
                    recipientNumber: contactDoc.phone_number || message.from,
                    contactId: contactDoc._id,
                    messageType: 'template',
                    templateName: templateDoc.template_name,
                    languageCode: templateDoc.language || 'en_US',
                    templateVariables
                  });
                  console.log(`[Order Webhook] Successfully sent order status approved template message: ${statusToSend}`);
                } else {
                  const messageText = renderTemplateLocal(tmplDoc.message_template, placeholderValues);

                  if (messageText) {
                    await unifiedService.sendMessage(whatsappPhoneNumber.user_id, {
                      whatsappPhoneNumber: whatsappPhoneNumber,
                      recipientNumber: contactDoc.phone_number || message.from,
                      contactId: contactDoc._id,
                      messageText,
                      messageType: 'text'
                    });
                    console.log(`[Order Webhook] Successfully sent order status template message: ${statusToSend}`);
                  }
                }
              }
            }
          } else {
            console.log(`[Order Webhook] Skipping automatic order status template messages because an active order_received trigger flow is configured.`);
          }
        } catch (templateSendErr) {
          console.error('Error sending order status templates on order receipt:', templateSendErr);
        }
      } catch (orderError) {
        console.error('Error saving WhatsApp order:', orderError);
      }
    }


    try {
      const automationMessage =
        message.type === "interactive" && interactiveId
          ? interactiveId
          : content;

      await automationEngine.triggerEvent("message_received", {
        platform: 'whatsapp',
        message: automationMessage,
        interactive_id: interactiveId,
        senderNumber: message.from,
        recipientNumber: whatsappPhoneNumber.display_phone_number,
        messageType: message.type,
        userId: whatsappPhoneNumber.user_id.toString(),
        workspaceId: whatsappPhoneNumber.waba_id?.workspace_id?.toString(),
        whatsappPhoneNumberId: whatsappPhoneNumber._id.toString(),
        waMessageId: message.id,
        waJid: message.from,
        contactId: contactDoc?._id?.toString(),
        timestamp: new Date(Number(message.timestamp) * 1000),
      });
    } catch (automationError) {
      console.error('Error triggering automation:', automationError);
    }



    try {
      const wabaId = whatsappPhoneNumber.waba_id._id || whatsappPhoneNumber.waba_id;
      const config = await WabaConfiguration.findOne({ waba_id: wabaId });

      contactDoc.last_incoming_message_at = new Date();
      if (!contactDoc.user_id) {
        contactDoc.user_id = whatsappPhoneNumber.user_id;
      }
      await contactDoc.save();

      const chatAssignment = await db.ChatAssignment.findOne({
        sender_number: message.from,
        whatsapp_phone_number_id: whatsappPhoneNumber._id,
        status: 'assigned',
        assigned_by: whatsappPhoneNumber.user_id
      }).lean();

      if (chatAssignment && chatAssignment.chatbot_id) {
        const isExpired = chatAssignment.chatbot_expires_at && new Date() > new Date(chatAssignment.chatbot_expires_at);
        if (!isExpired) {
          console.log(`[Webhook] Forwarding message to assigned chatbot ${chatAssignment.chatbot_id}`);
          await sendAutomatedReply({
            wabaId,
            contactId: contactDoc._id,
            replyType: 'chatbot',
            replyId: chatAssignment.chatbot_id,
            senderNumber: message.from,
            incomingText: content,
            userId: whatsappPhoneNumber.user_id,
            whatsappPhoneNumberId: whatsappPhoneNumber._id
          });
          automatedHandled = true;
        } else {
          console.log(`[Webhook] Chatbot assignment expired for ${message.from}`);
          await db.ChatAssignment.findByIdAndUpdate(chatAssignment._id, { chatbot_id: null, chatbot_expires_at: null });
        }
      }

      if (!automatedHandled) {
        await processAutomatedPipeline({
          workspaceId: whatsappPhoneNumber.waba_id?.workspace_id,
          contactDoc,
          incomingText: content,
          channel: 'whatsapp',
          accountId: message.from,
          userId: whatsappPhoneNumber.user_id,
          whatsappPhoneNumberId: whatsappPhoneNumber._id,
          businessAccountId: whatsappPhoneNumber._id.toString()
        });
      }

    } catch (autoErr) {
      console.error('Error in advanced automated handling:', autoErr);
    }

    if (value?.calls) {
      try {
        const callEvent = value.calls[0];
        const phoneNumberId = value.metadata?.phone_number_id;

        console.log('[CallWebhook] Received call event:', callEvent.event, callEvent.id);

        const callAutomationService = (await import('../services/whatsapp/call-automation.service.js')).default;

        if (callEvent.event === 'connect' && callEvent.session?.sdp_type === 'answer') {
          const callbackData = JSON.parse(callEvent.biz_opaque_callback_data || '{}');

          if (callbackData.is_outbound) {
            console.log('[CallWebhook] Handling outbound call connection:', callEvent.id);
            await callAutomationService.handleOutboundCallConnected(
              callEvent.id,
              callEvent.session,
              callbackData,
              phoneNumberId
            );
          }
        }

        if (callEvent.event === 'terminate') {
          console.log('[CallWebhook] Handling call termination:', callEvent.id);
          await callAutomationService.handleOutboundCallTerminated(
            callEvent.id,
            callEvent.duration,
            callEvent.reason
          );
        }
      } catch (callError) {
        console.error('[CallWebhook] Error handling call event:', callError);
      }
    }

    if (message.type === 'interactive' && message.interactive?.call_permission_reply) {
      try {
        const permissionResponse = message.interactive.call_permission_reply;
        const Contact = (await import('../models/index.js')).Contact;

        if (permissionResponse.response === 'accept') {
          await Contact.findOneAndUpdate(
            { phone_number: message.from },
            {
              call_permission_status: 'granted',
              call_permission_type: permissionResponse.is_permanent ? 'permanent' : 'temporary',
              call_permission_updated_at: new Date()
            }
          );

          const { handleCallPermissionGranted } = await import('../utils/whatsapp-message-handler.js');
          await handleCallPermissionGranted(
            message.from,
            value.metadata.phone_number_id,
            entry.id
          );
        } else if (permissionResponse.response === 'reject') {
          await Contact.findOneAndUpdate(
            { phone_number: message.from },
            {
              call_permission_status: 'denied',
              call_permission_updated_at: new Date()
            }
          );
        }
      } catch (permissionError) {
        console.error('Error handling call permission response:', permissionError);
      }
    }

    res.sendStatus(200);

  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    res.sendStatus(200);
  }
};


export const handleStatusUpdate = async (req, res, io = null) => {
  try {
    console.log("WhatsApp status webhook called");

    const entry = req.body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value?.statuses) {
      return res.sendStatus(200);
    }

    const status = value.statuses[0];
    console.log("sttatuss", value.statuses[0].errors);
    const waMessageId = status.id;
    const statusType = status.status;
    const timestamp = new Date(Number(status.timestamp) * 1000);

    console.log(`Processing status update for message ${waMessageId}: ${statusType}`);

    try {
      const updatedMessage = await updateWhatsAppStatus(waMessageId, statusType, timestamp);

      if (io && updatedMessage) {
        const populatedMessage = await Message.findById(updatedMessage._id)
          .populate({
            path: 'template_id',
            select: 'template_name language category status message_body body_variables header footer_text buttons meta_template_id'
          })
          .populate('submission_id')
          .lean();

        const senderNumber = populatedMessage.sender_number;
        const recipientNumber = populatedMessage.recipient_number;

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
          direction: populatedMessage.direction || null,
          sender: {
            id: senderNumber,
            name: senderNumber
          },
          recipient: {
            id: recipientNumber,
            name: recipientNumber
          },
          submission_id: populatedMessage.submission_id?._id || populatedMessage.submission_id || null,
          fields: populatedMessage.submission_id?.fields || [],
          user_id: populatedMessage.user_id?.toString(),
          whatsapp_phone_number_id: populatedMessage.whatsapp_connection_id?.toString()
        };

        console.log("formattedMessage", formattedMessage);
        req.app.get('io').emit('whatsapp:status', formattedMessage);
      }

      try {
        const { updateCampaignStatsFromWhatsApp } = await import('../utils/campaign-stats.service.js');
        const result = await updateCampaignStatsFromWhatsApp(waMessageId, statusType, timestamp);
        console.log(`Campaign stats update result for ${waMessageId}:`, result);
      } catch (campaignError) {
        console.error(`Error updating campaign stats for message ${waMessageId}:`, campaignError);
      }

      if (updatedMessage) {
        await automationEngine.triggerEvent("status_update", {
          waMessageId: waMessageId,
          status: statusType,
          timestamp: timestamp,
          recipientId: status.recipient_id,
          messageId: updatedMessage._id.toString(),
          userId: updatedMessage.user_id?.toString(),
          workspaceId: updatedMessage.workspace_id?.toString()
        });

        console.log(`Status updated successfully for message ${waMessageId}`);
      } else {
        console.log(`Status update processed for call: ${waMessageId}`);
      }

    } catch (updateError) {
      console.error(`Error updating status for message ${waMessageId}:`, updateError);
    }

    res.sendStatus(200);

  } catch (error) {
    console.error("WhatsApp status webhook error:", error);
    res.sendStatus(200);
  }
};

