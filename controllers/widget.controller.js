import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { Widget } from '../models/index.js';

function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === '1' || v === 'yes') return true;
    if (v === 'false' || v === '0' || v === 'no') return false;
  }
  return undefined;
}

function buildAbsoluteUrl(req, maybeRelativeUrl) {
  if (!maybeRelativeUrl) return null;
  if (typeof maybeRelativeUrl !== 'string') return null;
  if (maybeRelativeUrl.startsWith('http://') || maybeRelativeUrl.startsWith('https://')) return maybeRelativeUrl;
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  return `${baseUrl}${maybeRelativeUrl.startsWith('/') ? '' : '/'}${maybeRelativeUrl}`;
}

function extractWidgetBody(req) {
  const body = req.body || {};

  return {
    whatsapp_phone_number:
      body.whatsapp_phone_number ??
      body.whatsappPhoneNumber,

    welcome_text: body.welcome_text ?? body.welcomeText,
    default_user_message: body.default_user_message ?? body.defaultUserMessage,
    header_text: body.header_text ?? body.headerText,

    default_open_popup:
      body.default_open_popup ??
      body.defaultOpenPopup ??
      body.default_open ??
      body.defaultOpen,

    widget_position: body.widget_position ?? body.widgetPosition,

    widget_image_url:
      body.widget_image_url ??
      body.widgetImageUrl ??
      body.widget_image,

    body_background_image:
      body.body_background_image ??
      body.bodyBackgroundImage,

    widget_color: body.widget_color ?? body.widgetColor,

    header_text_color:
      body.header_text_color ??
      body.headerTextColor,

    header_background_color:
      body.header_background_color ??
      body.headerBackgroundColor,

    body_background_color:
      body.body_background_color ??
      body.bodyBackgroundColor,

    welcome_text_color:
      body.welcome_text_color ??
      body.welcomeTextColor,

    welcome_text_background:
      body.welcome_text_background ??
      body.welcomeTextBackground,

    start_chat_button_text:
      body.start_chat_button_text ??
      body.startChatButtonText,

    start_chat_button_background:
      body.start_chat_button_background ??
      body.startChatButtonBackground,

    start_chat_button_text_color:
      body.start_chat_button_text_color ??
      body.startChatButtonTextColor,
  };
}

function buildWidgetEmbedCode(req, widget) {
  if (!widget) return null;

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const widgetId =
    (typeof widget._id === 'string' ? widget._id : widget._id?.toString?.()) || '';

  const scriptSrc = `${baseUrl}/uploads/widget.js`;

  return `<div data-id="${widgetId}" id="vf_root_"></div>
  <script src="${scriptSrc}"></script>`;
}

function maybeDeleteLocalUpload(relativeUrl) {
  if (!relativeUrl || typeof relativeUrl !== 'string') return;
  if (!relativeUrl.startsWith('/uploads/')) return;
  if (!relativeUrl.includes('/widgets/')) return;

  const absolutePath = path.join(process.cwd(), relativeUrl.replace(/^\//, ''));
  if (fs.existsSync(absolutePath)) {
    try {
      fs.unlinkSync(absolutePath);
    } catch {
    }
  }
}


function extractUploadedFiles(req) {
  const files = req.files || {};
  let widgetImagePath = null;
  let bodyBgImagePath = null;

  if (files.widget_image && files.widget_image[0]) {
    const f = files.widget_image[0];
    widgetImagePath = `/${f.destination}/${f.filename}`.replace(/\\/g, '/');
  }

  if (files.body_background_image && files.body_background_image[0]) {
    const f = files.body_background_image[0];
    bodyBgImagePath = `/${f.destination}/${f.filename}`.replace(/\\/g, '/');
  }

  return { widgetImagePath, bodyBgImagePath };
}


function cleanupUploadedFiles(req) {
  const { widgetImagePath, bodyBgImagePath } = extractUploadedFiles(req);
  if (widgetImagePath) maybeDeleteLocalUpload(widgetImagePath);
  if (bodyBgImagePath) maybeDeleteLocalUpload(bodyBgImagePath);
}

export const createWidget = async (req, res) => {
  try {
    const userId = req.user?.owner_id;


    const payload = extractWidgetBody(req);

    if (!payload.whatsapp_phone_number) {
      return res.status(400).json({
        success: false,
        message: 'whatsapp_phone_number is required',
      });
    }

    const { widgetImagePath, bodyBgImagePath } = extractUploadedFiles(req);

    let widgetImageUrl = widgetImagePath || payload.widget_image_url || null;
    let bodyBackgroundImage = bodyBgImagePath || payload.body_background_image || null;

    const boolVal = toBool(payload.default_open_popup);
    const defaultOpenPopup = boolVal === undefined ? false : boolVal;

    const widgetData = {
      user_id: userId,
      whatsapp_phone_number: payload.whatsapp_phone_number,
      widget_image_url: widgetImageUrl,
      body_background_image: bodyBackgroundImage,
      welcome_text: (payload.welcome_text ?? '').toString(),
      default_open_popup: defaultOpenPopup,
      default_user_message: (payload.default_user_message ?? '').toString(),
      widget_position: (payload.widget_position ?? 'bottom-right').toString(),
      widget_color: payload.widget_color ? String(payload.widget_color).trim() : null,
      deleted_at: null,
    };

    const existing = await Widget.findOne({
      user_id: userId,
      whatsapp_phone_number: payload.whatsapp_phone_number,
      deleted_at: null,
    }).lean();
    if (existing) {
      cleanupUploadedFiles(req);
      return res.status(409).json({
        success: false,
        message: 'Widget already exists for this WhatsApp phone number',
      });
    }

    const widget = await Widget.create(widgetData);

    return res.status(201).json({
      success: true,
      message: 'Widget created successfully',
      data: {
        ...widget.toObject(),
        widget_image_url: buildAbsoluteUrl(req, widget.widget_image_url),
        body_background_image: buildAbsoluteUrl(req, widget.body_background_image),
        embed_code: buildWidgetEmbedCode(req, widget),
      },
    });
  } catch (error) {
    cleanupUploadedFiles(req);
    console.error('Error creating widget:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create widget',
      error: error.message,
    });
  }
};

export const updateWidget = async (req, res) => {
  try {
    const userId = req.user?.owner_id;


    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid widget ID' });
    }

    const widget = await Widget.findOne({ _id: id, user_id: userId, deleted_at: null });
    if (!widget) {
      return res.status(404).json({ success: false, message: 'Widget not found' });
    }

    const payload = extractWidgetBody(req);
    const { widgetImagePath, bodyBgImagePath } = extractUploadedFiles(req);

    if (payload.whatsapp_phone_number !== undefined && payload.whatsapp_phone_number !== null) {
      widget.whatsapp_phone_number = String(payload.whatsapp_phone_number).trim();
    }

    if (payload.welcome_text !== undefined) widget.welcome_text = (payload.welcome_text ?? '').toString();

    if (payload.default_open_popup !== undefined) {
      const boolVal = toBool(payload.default_open_popup);
      if (boolVal !== undefined) widget.default_open_popup = boolVal;
    }

    if (payload.default_user_message !== undefined) {
      widget.default_user_message = (payload.default_user_message ?? '').toString();
    }

    if (payload.widget_position !== undefined) widget.widget_position = (payload.widget_position ?? '').toString();

    if (payload.widget_color !== undefined) {
      widget.widget_color = payload.widget_color ? String(payload.widget_color).trim() : null;
    }

    if (payload.widget_image_url !== undefined && !widgetImagePath) {
      widget.widget_image_url = payload.widget_image_url ? String(payload.widget_image_url).trim() : null;
    }

    if (payload.header_text !== undefined)
      widget.header_text = (payload.header_text ?? '').toString();

    if (payload.header_text_color !== undefined)
      widget.header_text_color = payload.header_text_color ? String(payload.header_text_color).trim() : null;

    if (payload.header_background_color !== undefined)
      widget.header_background_color = payload.header_background_color ? String(payload.header_background_color).trim() : null;

    if (payload.body_background_color !== undefined)
      widget.body_background_color = payload.body_background_color ? String(payload.body_background_color).trim() : null;

    if (payload.body_background_image !== undefined && !bodyBgImagePath)
      widget.body_background_image = payload.body_background_image ? String(payload.body_background_image).trim() : null;

    if (payload.welcome_text_color !== undefined)
      widget.welcome_text_color = payload.welcome_text_color ? String(payload.welcome_text_color).trim() : null;

    if (payload.welcome_text_background !== undefined)
      widget.welcome_text_background = payload.welcome_text_background ? String(payload.welcome_text_background).trim() : null;

    if (payload.start_chat_button_text !== undefined)
      widget.start_chat_button_text = (payload.start_chat_button_text ?? '').toString();

    if (payload.start_chat_button_background !== undefined)
      widget.start_chat_button_background = payload.start_chat_button_background
        ? String(payload.start_chat_button_background).trim()
        : null;

    if (payload.start_chat_button_text_color !== undefined)
      widget.start_chat_button_text_color = payload.start_chat_button_text_color
        ? String(payload.start_chat_button_text_color).trim()
        : null;

    if (widgetImagePath) {
      const old = widget.widget_image_url;
      widget.widget_image_url = widgetImagePath;
      if (old && old !== widgetImagePath) maybeDeleteLocalUpload(old);
    }

    if (bodyBgImagePath) {
      const old = widget.body_background_image;
      widget.body_background_image = bodyBgImagePath;
      if (old && old !== bodyBgImagePath) maybeDeleteLocalUpload(old);
    }

    await widget.save();

    return res.status(200).json({
      success: true,
      message: 'Widget updated successfully',
      data: {
        ...widget.toObject(),
        widget_image_url: buildAbsoluteUrl(req, widget.widget_image_url),
        body_background_image: buildAbsoluteUrl(req, widget.body_background_image),
        embed_code: buildWidgetEmbedCode(req, widget),
      },
    });
  } catch (error) {
    cleanupUploadedFiles(req);

    const duplicate = error?.code === 11000;
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: 'Widget already exists for this WhatsApp phone number',
      });
    }

    console.error('Error updating widget:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update widget',
      error: error.message,
    });
  }
};

export const deleteWidget = async (req, res) => {
  try {
    const userId = req.user?.owner_id;


    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid widget ID' });
    }

    const widget = await Widget.findOne({ _id: id, user_id: userId, deleted_at: null });
    if (!widget) {
      return res.status(404).json({ success: false, message: 'Widget not found' });
    }

    const oldImage = widget.widget_image_url;
    const oldBgImage = widget.body_background_image;
    widget.deleted_at = new Date();
    await widget.save();

    if (oldImage) maybeDeleteLocalUpload(oldImage);
    if (oldBgImage) maybeDeleteLocalUpload(oldBgImage);

    return res.status(200).json({
      success: true,
      message: 'Widget deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting widget:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete widget',
      error: error.message,
    });
  }
};

export const getWidgetById = async (req, res) => {
  try {

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid widget ID' });
    }

    const widget = await Widget.findOne({
      _id: id,
      deleted_at: null,
    })
      .select('-__v')
      .lean();

    if (!widget) {
      return res.status(404).json({ success: false, message: 'Widget not found' });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...widget,
        widget_image_url: buildAbsoluteUrl(req, widget.widget_image_url),
        body_background_image: buildAbsoluteUrl(req, widget.body_background_image),
        embed_code: buildWidgetEmbedCode(req, widget),
      },
    });
  } catch (error) {
    console.error('Error fetching widget:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch widget',
      error: error.message,
    });
  }
};

export const getWidgetByPhoneNumber = async (req, res) => {
  try {
    const userId = req.user?.owner_id;


    const { phoneNumber } = req.params;
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'phoneNumber is required' });
    }

    const widget = await Widget.findOne({
      user_id: userId,
      whatsapp_phone_number: phoneNumber.trim(),
      deleted_at: null,
    })
      .select('-__v')
      .lean();

    if (!widget) {
      return res.status(404).json({
        success: false,
        message: 'Widget not found for this WhatsApp phone number',
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...widget,
        widget_image_url: buildAbsoluteUrl(req, widget.widget_image_url),
        body_background_image: buildAbsoluteUrl(req, widget.body_background_image),
        embed_code: buildWidgetEmbedCode(req, widget),
      },
    });
  } catch (error) {
    console.error('Error fetching widget by phone number:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch widget',
      error: error.message,
    });
  }
};

export const getAllWidgets = async (req, res) => {
  try {
    const userId = req.user?.owner_id;


    const {
      page = 1,
      limit = 10,
      search = '',
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOrder = sort_order === 'asc' ? 1 : -1;

    const query = {
      user_id: userId,
      deleted_at: null,
    };

    if (search) {
      query.$or = [
        { whatsapp_phone_number: { $regex: search, $options: 'i' } },
        { welcome_text: { $regex: search, $options: 'i' } }
      ];
    }

    const widgets = await Widget.find(query)
      .select('-__v')
      .sort({ [sort_by]: sortOrder })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await Widget.countDocuments(query);

    const data = widgets.map((w) => ({
      ...w,
      widget_image_url: buildAbsoluteUrl(req, w.widget_image_url),
      body_background_image: buildAbsoluteUrl(req, w.body_background_image),
      embed_code: buildWidgetEmbedCode(req, w),
    }));

    return res.status(200).json({
      success: true,
      data: {
        widgets: data,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          totalItems: total,
          itemsPerPage: parseInt(limit)
        }
      }
    });

  } catch (error) {
    console.error('Error fetching widgets:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch widgets',
      error: error.message,
    });
  }
};

const validateAndFilterIds = (ids) => {
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return {
      isValid: false,
      message: 'IDs array is required and must not be empty',
      validIds: []
    };
  }

  const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

  if (validIds.length === 0) {
    return {
      isValid: false,
      message: 'No valid IDs provided',
      validIds: []
    };
  }

  return {
    isValid: true,
    validIds
  };
};

export const bulkDeleteWidgets = async (req, res) => {
  try {
    const userId = req.user?.owner_id;


    const { ids } = req.body;
    const validation = validateAndFilterIds(ids);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message
      });
    }

    const { validIds } = validation;

    const existingWidgets = await Widget.find({
      _id: { $in: validIds },
      user_id: userId,
      deleted_at: null
    }).select('_id widget_image_url body_background_image');

    if (existingWidgets.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No widgets found with the provided IDs'
      });
    }

    const foundIds = existingWidgets.map(w => w._id.toString());
    const notFoundIds = validIds.filter(
      id => !foundIds.includes(id.toString())
    );

    await Widget.updateMany(
      { _id: { $in: foundIds } },
      { $set: { deleted_at: new Date() } }
    );


    for (const widget of existingWidgets) {
      if (widget.widget_image_url) maybeDeleteLocalUpload(widget.widget_image_url);
      if (widget.body_background_image) maybeDeleteLocalUpload(widget.body_background_image);
    }

    const response = {
      success: true,
      message: `${foundIds.length} widget(s) deleted successfully`,
      data: {
        deletedCount: foundIds.length,
        deletedIds: foundIds
      }
    };

    if (notFoundIds.length > 0) {
      response.data.notFoundIds = notFoundIds;
      response.message += `, ${notFoundIds.length} widget(s) not found`;
    }

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error bulk deleting widgets:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete widgets',
      error: error.message
    });
  }
};

export default {
  createWidget,
  updateWidget,
  deleteWidget,
  getWidgetById,
  getWidgetByPhoneNumber,
  getAllWidgets,
  bulkDeleteWidgets,
};
