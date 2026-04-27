import axios from "axios";
import FormData from "form-data";

async function uploadMediaToWhatsApp({
  phone_number_id,
  access_token,
  buffer,
  mime_type,
  filename
}) {
  const form = new FormData();

  form.append("messaging_product", "whatsapp");
  form.append("type", mime_type);

  const fileOptions = {
    filename: filename || 'audio.ogg',
    contentType: mime_type
  };

  if (mime_type.includes('audio/ogg') && !fileOptions.filename.endsWith('.ogg')) {
    fileOptions.filename = fileOptions.filename + '.ogg';
  }

  form.append("file", buffer, fileOptions);

  console.log('[UploadMedia] Uploading to WhatsApp:', {
    phone_number_id,
    mime_type,
    filename: fileOptions.filename,
    bufferSize: buffer.length
  });

  const response = await axios.post(
    `https://graph.facebook.com/v19.0/${phone_number_id}/media`,
    form,
    {
      headers: {
        Authorization: `Bearer ${access_token}`,
        ...form.getHeaders()
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    }
  );

  return response.data.id;
}

function getWhatsAppTypeFromMime(mime) {
  console.log("mime" , mime);
  if (!mime) return "text";

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";

  return "document";
}

async function getWhatsAppMediaUrl(mediaId, access_token) {
  const res = await axios.get(
    `https://graph.facebook.com/v19.0/${mediaId}`,
    {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    }
  );

  return res.data.url;
}



export { uploadMediaToWhatsApp , getWhatsAppTypeFromMime , getWhatsAppMediaUrl};
