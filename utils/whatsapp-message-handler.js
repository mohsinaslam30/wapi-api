import axios from 'axios';
import fs from 'fs';
import path from 'path';


export function parseIncomingMessage(message) {
  let content = null;
  let mediaId = null;
  let fileType = null;
  let mimeType = null;
  let interactiveId = null;
  let replyMessageId = null;
  let reactionMessageId = null;
  let reactionEmoji = null;

  if (message.context && message.context.id) {
    replyMessageId = message.context.id;
  }

  switch (message.type) {
    case "text":
      content = message.text.body;
      break;

    case "image":
      mediaId = message.image.id;
      mimeType = message.image.mime_type;
      content = message.image.caption || null;
      fileType = "image";
      break;

    case "video":
      mediaId = message.video.id;
      mimeType = message.video.mime_type;
      content = message.video.caption || null;
      fileType = "video";
      break;

    case "audio":
      mediaId = message.audio.id;
      mimeType = message.audio.mime_type;
      fileType = "audio";
      break;

    case "document":
      mediaId = message.document.id;
      mimeType = message.document.mime_type;
      content = message.document.filename;
      fileType = "document";
      break;

    case "location":
      content = JSON.stringify({
        latitude: message.location.latitude,
        longitude: message.location.longitude,
        name: message.location.name || null,
        address: message.location.address || null,
      });
      fileType = "location";
      break;

    case "interactive":
      console.log("message.interactive" , message.interactive)
      if (message.interactive?.button_reply) {
        interactiveId = message.interactive.button_reply.id;
        content = message.interactive.button_reply.title;
        fileType = "button_reply";
      } else if (message.interactive?.list_reply) {
        interactiveId = message.interactive.list_reply.id;
        content = message.interactive.list_reply.title;
        fileType = "list_reply";
      } else if (message.interactive?.nfm_reply) {
        content = "Response sent";
        fileType = "nfm_reply";
      }

      else if(message.interactive?.call_permission_reply) {
        const permissionResponse = message.interactive.call_permission_reply;

        if(permissionResponse.response === "reject") {
          content = "call permission is rejected";
        }
        else if(permissionResponse.response === "accept") {
          content = permissionResponse.is_permanent
            ? "call permission is allowed permanently"
            : "call permission is allowed temporarily";
        }
      }
      console.log("content" , content)
      break;

    case "reaction":
      reactionMessageId = message.reaction.message_id;
      reactionEmoji = message.reaction.emoji;
      content = message.reaction.emoji;
      fileType = "reaction";
      break;

    default:
      fileType = "unknown";
  }

  let interactiveData = null;
  if (message.type === "interactive") {
    interactiveData = message.interactive;
  }

  return { content, mediaId, fileType, mimeType, interactiveId, interactiveData, replyMessageId, reactionMessageId, reactionEmoji };
}


export async function getWhatsAppMediaUrl(mediaId, access_token) {
  const res = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    {
      headers: { Authorization: `Bearer ${access_token}` }
    }
  );

  return res.data.url;
}


export function getExtension(mimeType, fallback = "bin") {
  if (!mimeType) return fallback;

  const map = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "video/mp4": "mp4",
      "audio/ogg": "ogg",
      "audio/mpeg": "mp3",
      "application/pdf": "pdf"
  };

  return map[mimeType] || mimeType.split("/")[1] || fallback;
}


export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
  }
}


export async function downloadAndStoreMedia(url, accessToken, mimeType, fileType) {
  const ext = getExtension(mimeType);
  const filename = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.${ext}`;

  const safeType = fileType || "other";

  const uploadDir = path.join(
    process.cwd(),
    "uploads",
    "whatsapp",
    safeType
  );

  ensureDir(uploadDir);

  const filePath = path.join(uploadDir, filename);

  const response = await axios.get(url, {
    responseType: "stream",
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  await new Promise((resolve, reject) => {
    const stream = fs.createWriteStream(filePath);
    response.data.pipe(stream);
    stream.on("finish", resolve);
    stream.on("error", reject);
  });

  return `/uploads/whatsapp/${safeType}/${filename}`;
}


export async function handleCallPermissionGranted(contactNumber, phoneNumberId, wabaId) {
  try {
    console.log(`📞 Call permission granted for ${contactNumber}, scheduling call...`);

    const Contact = (await import('../models/index.js')).Contact;
    const contact = await Contact.findOne({ phone_number: contactNumber });
    if (!contact) {
      console.warn(`Contact not found: ${contactNumber}`);
      return;
    }

    let agentId = contact.assigned_call_agent_id;

    if (!agentId) {
      const WhatsappCallSetting = (await import('../models/index.js')).WhatsappCallSetting;
      const settings = await WhatsappCallSetting.findOne({
        phone_number_id: phoneNumberId,
        deleted_at: null
      });
      if (settings?.fallback_agent_id) {
        agentId = settings.fallback_agent_id;
      }
    }

    if (!agentId) {
      console.warn(`No call agent configured for ${contactNumber}`);
      return;
    }

    const UserSetting = (await import('../models/index.js')).UserSetting;
    const userSettings = await UserSetting.findOne({ user_id: contact.created_by });
    const autoCallEnabled = userSettings?.call_automation_settings?.auto_call_on_permission_grant !== false;

    if (!autoCallEnabled) {
      console.log(`⏸️ Auto-call disabled for user ${contact.created_by}`);
      return;
    }

    const delaySeconds = userSettings?.call_automation_settings?.call_delay_seconds || 10;

    const { scheduleOutboundCall } = await import('../queues/outbound-call-queue.js');
    await scheduleOutboundCall({
      phoneNumberId,
      contactNumber,
      contactId: contact._id,
      agentId,
      userId: contact.created_by,
      wabaId,
      trigger_reason: 'permission_granted'
    }, delaySeconds);

    console.log(`✅ Call scheduled for ${contactNumber} in ${delaySeconds} seconds`);

  } catch (error) {
    console.error('Error handling call permission grant:', error);
  }
}
