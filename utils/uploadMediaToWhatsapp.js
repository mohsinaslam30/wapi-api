import axios from "axios";
import FormData from "form-data";

async function uploadMediaToWhatsApp({
  phone_number_id,
  access_token,
  buffer,
  mime_type,
  filename
}) {
  let finalMimeType = mime_type;

  // List of officially supported document MIME types by Meta WhatsApp Cloud API
  const SUPPORTED_DOCUMENT_MIMES = [
    'text/plain',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ];

  // List of other supported media MIME prefixes
  const isImage = mime_type && mime_type.startsWith('image/');
  const isVideo = mime_type && mime_type.startsWith('video/');
  const isAudio = mime_type && mime_type.startsWith('audio/');

  // If it's a document and not officially supported, map to text/plain
  if (!isImage && !isVideo && !isAudio && mime_type && !SUPPORTED_DOCUMENT_MIMES.includes(mime_type)) {
    console.log(`[UploadMedia] Mapping unsupported document MIME type "${mime_type}" to "text/plain" for filename "${filename}"`);
    finalMimeType = 'text/plain';
  }

  const form = new FormData();

  form.append("messaging_product", "whatsapp");
  form.append("type", finalMimeType);

  const fileOptions = {
    filename: filename || 'file.bin',
    contentType: finalMimeType
  };

  if (mime_type.includes('audio/ogg') && !fileOptions.filename.endsWith('.ogg')) {
    fileOptions.filename = fileOptions.filename + '.ogg';
  }

  form.append("file", buffer, fileOptions);

  console.log('[UploadMedia] Uploading to WhatsApp:', {
    phone_number_id,
    mime_type: finalMimeType,
    original_mime_type: mime_type,
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
