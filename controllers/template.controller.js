import Template from "../models/template.model.js";
import WhatsappWaba from "../models/whatsapp-waba.model.js";
import Contact from "../models/contact.model.js";
import Message from "../models/message.model.js";
import { AIModel, UserSetting } from "../models/index.js";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import axios from "axios";
import { getWhatsAppTypeFromMime, getWhatsAppMediaUrl } from "../utils/uploadMediaToWhatsapp.js";
import { callAIModel as commonCallAIModel } from '../utils/ai-utils.js';

const API_VERSION = "v21.0";
const UPDATE_API_VERSION = "v23.0";

export const createTemplate = async (req, res) => {
  try {
    let {
      waba_id,
      template_name,
      language = "en_US",
      category,
      message_body,
      footer_text,
      buttons,
      variable_examples,
      variables_example,
      add_security_recommendation,
      code_expiration_minutes,
      otp_code_length,
      otp_buttons,
      call_permission,
      is_limited_time_offer,
      offer_text,
      has_expiration,
      template_type = "standard",
      carousel_cards
    } = req.body;

    if (typeof buttons === "string") {
      try {
        buttons = JSON.parse(buttons);
      } catch (e) {
        console.error("Error parsing buttons:", e);
      }
    }

    let rawOtpButtons = otp_buttons;
    if (typeof rawOtpButtons === "string") {
      try {
        rawOtpButtons = JSON.parse(rawOtpButtons);
      } catch (e) {
        console.error("Error parsing otp_buttons:", e);
        rawOtpButtons = [];
      }
    }
    if (!Array.isArray(rawOtpButtons)) rawOtpButtons = [];

    let rawCarouselCards = carousel_cards;
    if (typeof rawCarouselCards === "string") {
      try {
        rawCarouselCards = JSON.parse(rawCarouselCards);
      } catch (e) {
        console.error("Error parsing carousel_cards:", e);
        rawCarouselCards = [];
      }
    }
    if (!Array.isArray(rawCarouselCards)) rawCarouselCards = [];

    let rawVars = variable_examples || variables_example || {};
    if (typeof rawVars === "string") {
      try {
        rawVars = JSON.parse(rawVars);
      } catch (e) {
        console.error("Error parsing variables:", e);
      }
    }

    const processedVariableExamples = {};
    if (Array.isArray(rawVars)) {
      rawVars.forEach((v) => {
        if (v && v.key) processedVariableExamples[v.key] = v.example;
      });
    } else if (typeof rawVars === "object" && rawVars !== null) {
      Object.assign(processedVariableExamples, rawVars);
    }
    console.log("waba_id", waba_id);
    console.log("template_name", template_name);

    const userId = req.user.owner_id;

    if (!waba_id) {
      return res.status(400).json({ error: "WABA ID is required" });
    }

    let wabaQuery = {
      user_id: userId,
      deleted_at: null,
    };

    if (mongoose.Types.ObjectId.isValid(waba_id)) {
      wabaQuery.$or = [
        { _id: waba_id },
        { whatsapp_business_account_id: waba_id }
      ];
    } else {
      wabaQuery.whatsapp_business_account_id = waba_id;
    }

    const waba = await WhatsappWaba.findOne(wabaQuery);
    if (!waba) {
      return res.status(404).json({ error: "WhatsApp WABA not found" });
    }

    waba_id = waba._id.toString();

    const { access_token, whatsapp_business_account_id, app_id } = waba;

    const normalizedCategory = (category || "UTILITY").toUpperCase();
    const isAuthenticationCategory = normalizedCategory === "AUTHENTICATION";
    const normalizedTemplateType = (template_type || "standard").toLowerCase();
    const isCarouselTemplate =
      ["carousel_product", "carousel_media"].includes(normalizedTemplateType) &&
      rawCarouselCards.length >= 2 &&
      rawCarouselCards.length <= 10;

    const uploadedFile = req.file || (req.files && req.files.file && req.files.file[0]);
    let header = null;
    if (!isAuthenticationCategory && !isCarouselTemplate) {
      if (uploadedFile) {
        let buffer = uploadedFile.buffer;
        if (!buffer && uploadedFile.path) {
          try {
            if (uploadedFile.path.startsWith('http')) {
              const response = await axios.get(uploadedFile.path, { responseType: 'arraybuffer' });
              buffer = Buffer.from(response.data);
            } else {
              buffer = fs.readFileSync(path.join(process.cwd(), uploadedFile.path));
            }
          } catch (err) {
            console.error('[TemplateController] Error reading uploaded file:', err.message);
          }
        }

        if (buffer) {
          const handle = await uploadSampleMediaForTemplate({
            app_id: app_id,
            access_token,
            file_name: uploadedFile.originalname,
            file_size: uploadedFile.size,
            mime_type: uploadedFile.mimetype,
            buffer: buffer,
          });
          console.log("handle", handle);
          header = {
            format: "media",
            media_type: getWhatsAppTypeFromMime(uploadedFile.mimetype),
            handle: handle,
          };
        }
      }
      if (req.body.header_text) {
        header = {
          format: "text",
          text: req.body.header_text,
        };
      }
    }

    const cardMediaFiles = (req.files && req.files.card_media) ? (Array.isArray(req.files.card_media) ? req.files.card_media : [req.files.card_media]) : [];
    console.log("cardMediaFiles", cardMediaFiles);
    if (isCarouselTemplate && cardMediaFiles.length > 0) {
      for (let i = 0; i < cardMediaFiles.length && i < rawCarouselCards.length; i++) {
        const file = cardMediaFiles[i];
        let buffer = file.buffer;
        if (!buffer && file.path) {
          try {
            if (file.path.startsWith('http')) {
              const response = await axios.get(file.path, { responseType: 'arraybuffer' });
              buffer = Buffer.from(response.data);
            } else {
              buffer = fs.readFileSync(path.join(process.cwd(), file.path));
            }
          } catch (err) {
            console.error('[TemplateController] Error reading carousel file:', err.message);
          }
        }

        if (buffer) {
          const handle = await uploadSampleMediaForTemplate({
            app_id: app_id,
            access_token,
            file_name: file.originalname,
            file_size: file.size,
            mime_type: file.mimetype,
            buffer: buffer,
          });
          const card = rawCarouselCards[i];
          if (card && card.components) {
            const headerComp = card.components.find((c) => (c.type || "").toLowerCase() === "header");
            if (headerComp) {
              headerComp.format = headerComp.format || getWhatsAppTypeFromMime(file.mimetype);
              headerComp.example = { header_handle: [handle] };
            }
          }
        }
      }
    }

    let bodyVariables = [];
    if (!isAuthenticationCategory) {
      const extractedVariables = extractVariables(message_body);
      bodyVariables = extractedVariables.map((v) => ({
        key: v.key,
        example: processedVariableExamples[v.key] || "example",
      }));
    } else {

      const extractedVariables = extractVariables(message_body);
      bodyVariables = extractedVariables.map((v) => ({
        key: v.key,
        example: processedVariableExamples[v.key] || "example",
      }));
    }

    let authentication_options = null;
    if (isAuthenticationCategory) {
      authentication_options = {
        add_security_recommendation: add_security_recommendation !== false && add_security_recommendation !== "false",
        code_expiration_minutes: code_expiration_minutes != null ? Number(code_expiration_minutes) : undefined,
        otp_code_length: otp_code_length != null ? Number(otp_code_length) : 6,
        otp_buttons: rawOtpButtons.map((btn) => {
          const b = {
            otp_type: (btn.otp_type || btn.type || "COPY_CODE").toUpperCase().replace(/\s/g, "_"),
            copy_button_text: btn.copy_button_text || btn.text,
            supported_apps: Array.isArray(btn.supported_apps) ? btn.supported_apps : undefined,
          };
          if (b.otp_type !== "COPY_CODE" && b.otp_type !== "ONE_TAP") b.otp_type = "COPY_CODE";
          return b;
        }),
      };
      if (authentication_options.otp_buttons.length === 0) {
        authentication_options.otp_buttons = [{ otp_type: "COPY_CODE" }];
      }
    }

    if (!["UTILITY", "MARKETING", "AUTHENTICATION"].includes(normalizedCategory)) {
      return res.status(400).json({ error: "Category must be UTILITY, MARKETING, or AUTHENTICATION" });
    }

    const templateComponents = [];

    if (message_body && !isAuthenticationCategory) {
      templateComponents.push({
        type: "BODY",
        text: message_body
      });
    }

    if (buttons && buttons.length > 0) {
      buttons = buttons.map(btn => {
        const type = (btn.type || "").toLowerCase();
        if (type === "url" || type === "website") {
          const url = btn.url || btn.website_url || "";
          if (!url.includes("{{")) {
            const { example, ...rest } = btn;
            return rest;
          }
        }
        const { example, ...rest } = btn;
        if (!example || (Array.isArray(example) && example.length === 0)) {
          return rest;
        }
        return btn;
      });
    }

    if (buttons && buttons.length > 0) {
      const buttonComponents = buttons.map(btn => {
        const btnType = (btn.type || "").toUpperCase();
        const component = { type: btnType, text: btn.text };

        if (btnType === "PHONE_CALL") {
          component.phone_number = btn.phone_number;
        } else if (btnType === "URL" || btnType === "WEBSITE") {
          component.url = btn.url || btn.website_url;
        } else if (btnType === "COPY_CODE") {
          component.copy_button_text = btn.text;
          if (btn.example) component.example = btn.example;
        }

        return component;
      });

      templateComponents.push({
        type: "BUTTONS",
        buttons: buttonComponents
      });
    }

    if (isAuthenticationCategory && footer_text) {
      const footerComponent = { type: "FOOTER", text: footer_text };
      if (code_expiration_minutes) {
        footerComponent.code_expiration_minutes = Number(code_expiration_minutes);
      }
      templateComponents.push(footerComponent);
    }

    const detectedTemplateType = detectTemplateType(templateComponents, isCarouselTemplate, isAuthenticationCategory);

    const createdTemplate = await Template.create({
      user_id: req.user.owner_id,
      created_by: req.user.id,
      waba_id: waba_id,
      template_name: template_name.toLowerCase(),
      language,
      category: normalizedCategory,
      call_permission,
      header,
      message_body: isAuthenticationCategory ? "" : message_body,
      is_limited_time_offer,
      offer_text,
      has_expiration,
      body_variables: bodyVariables,
      footer_text,
      buttons,
      template_type: detectedTemplateType,
      carousel_cards: isCarouselTemplate ? rawCarouselCards : undefined,
      authentication_options: authentication_options || undefined,
      status: "draft",
    });
    console.log("createdTemplate", createdTemplate);
    try {
      const metaPayload = buildMetaTemplatePayload(createdTemplate);

      const metaResponse = await submitTemplateToMeta(metaPayload, waba.whatsapp_business_account_id, waba.access_token);

      await Template.findByIdAndUpdate(createdTemplate._id, {
        status: metaResponse.status?.toLowerCase(),
        meta_template_id: metaResponse.id || metaResponse.name,
      });

      try {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const wabaInfo = await WhatsappWaba.findOne({
          _id: waba_id,
          user_id: userId,
          deleted_at: null,
        });

        if (wabaInfo) {
          const metaTemplates = await fetchTemplatesFromMeta(wabaInfo.whatsapp_business_account_id, wabaInfo.access_token);

          const metaTemplate = metaTemplates.find((t) => t.name === template_name.toLowerCase());
          if (metaTemplate && metaTemplate.components) {
            const headerInfo = extractHeader(metaTemplate.components);
            if (headerInfo && headerInfo.media_url) {
              await Template.findByIdAndUpdate(createdTemplate._id, { header: headerInfo }, { returnDocument: 'after' });
            }
          }
        }
      } catch (syncError) {
        console.warn("Could not sync template after creation:", syncError.message);
      }
    } catch (error) {
      await Template.findByIdAndDelete(createdTemplate._id);
      throw error;
    }

    return res.status(201).json({
      message: "Template submitted",
      template_id: createdTemplate._id,
    });
  } catch (error) {
    console.error("Error creating template:", error);
    return res.status(400).json({
      message: error.response?.data.error.error_user_msg || error.message,
      error: error.response?.data.error.error_user_msg || error.message,
    });
  }
};

export const uploadSampleMediaForTemplate = async ({ app_id, access_token, file_name, file_size, mime_type, buffer }) => {
  const startUrl = `https://graph.facebook.com/${API_VERSION}/${app_id}/uploads`;
  const startResponse = await axios.post(startUrl, null, {
    params: {
      file_name,
      file_length: file_size,
      file_type: mime_type,
      access_token,
    },
  });
  const sessionId = startResponse.data.id;

  const uploadUrl = `https://graph.facebook.com/${API_VERSION}/${sessionId}`;
  const uploadResponse = await axios.post(uploadUrl, buffer, {
    headers: {
      Authorization: `OAuth ${access_token}`,
      file_offset: "0",
      "Content-Type": "application/octet-stream",
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  return uploadResponse.data.h;
};

export const extractVariables = (text) => {
  const regex = /{{(.*?)}}/g;
  const variables = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    variables.push({
      key: match[1].trim(),
    });
  }

  return variables;
};


function buildAuthenticationTemplatePayload(template) {
  const auth = template.authentication_options || {};
  const components = [];


  const bodyComponent = {
    type: "BODY",
    add_security_recommendation: auth.add_security_recommendation !== false,
  };

  const bodyVariables = template.body_variables || [];
  const hasVariables = bodyVariables.length > 0;
  if (hasVariables) {
    const isPositional = bodyVariables.every((v) => /^\d+$/.test(v.key));
    if (isPositional) {
      bodyComponent.example = {
        body_text: [bodyVariables.map((v) => String(v.example || "example"))],
      };
    } else {
      bodyComponent.example = {
        body_text_named_params: bodyVariables.map((v) => ({
          param_name: String(v.key),
          example: String(v.example || "example"),
        })),
      };
    }
  }


  components.push(bodyComponent);

  if (auth.code_expiration_minutes != null && auth.code_expiration_minutes >= 1 && auth.code_expiration_minutes <= 90) {
    components.push({
      type: "FOOTER",
      code_expiration_minutes: Number(auth.code_expiration_minutes),
    });
  } else if (template.footer_text) {
    components.push({ type: "FOOTER", text: template.footer_text });
  }

  const otpButtons = auth.otp_buttons || [{ otp_type: "COPY_CODE" }];
  if (otpButtons.length > 0) {
    const metaOtpButtons = otpButtons.map((btn) => {
      const otpType = (btn.otp_type || "COPY_CODE").toUpperCase();
      const metaBtn = {
        type: "OTP",
        otp_type: otpType === "ONE_TAP" ? "ONE_TAP" : "COPY_CODE",
      };
      if (metaBtn.otp_type === "COPY_CODE" && (btn.copy_button_text || btn.text)) {
        metaBtn.text = btn.copy_button_text || btn.text;
      }
      if (metaBtn.otp_type === "ONE_TAP" && Array.isArray(btn.supported_apps) && btn.supported_apps.length > 0) {
        metaBtn.supported_apps = btn.supported_apps.map((app) => ({
          package_name: app.package_name,
          signature_hash: app.signature_hash,
        }));
      }
      return metaBtn;
    });
    components.push({ type: "BUTTONS", buttons: metaOtpButtons });
  }

  return {
    name: template.template_name,
    language: template.language,
    category: "AUTHENTICATION",
    components,
  };
}

export const buildMetaTemplatePayload = (template) => {
  const category = (template.category || "").toUpperCase();
  if (category === "AUTHENTICATION") {
    return buildAuthenticationTemplatePayload(template);
  }
  const templateType = (template.template_type || "").toLowerCase();
  if (["carousel_product", "carousel_media"].includes(templateType) && template.carousel_cards?.length) {
    return buildCarouselMetaTemplatePayload(template);
  }

  const components = [];

  if (template.header) {
    if (template.header.format === "text" && !template.is_limited_time_offer) {
      components.push({
        type: "HEADER",
        format: "TEXT",
        text: template.header.text,
      });
    }



    if (template.header.format === "media") {
      const component = {
        type: "HEADER",
        format: template.header.media_type.toUpperCase(),
      };


      if (template.header.media_type === "image") {
        if (template.header.media_url) {
          component.example = {
            header_url: template.header.media_url,
          };
        } else {
          component.example = {
            header_handle: [template.header.handle],
          };
        }
      } else if (template.header.media_type === "video") {
        if (template.header.media_url) {
          component.example = {
            header_url: template.header.media_url,
          };
        } else {
          component.example = {
            header_handle: [template.header.handle],
          };
        }
      } else if (template.header.media_type === "document") {
        if (template.header.media_url) {
          component.example = {
            header_url: template.header.media_url,
          };
        } else {
          component.example = {
            header_handle: [template.header.handle],
          };
        }
      } else {
        component.example = {
          header_handle: [template.header.handle],
        };
      }

      components.push(component);
    }
    console.log("header", template.header.handle);
  }


  const bodyVariables = template.body_variables || [];
  const bodyComponent = {
    type: "BODY",
    text: template.message_body,
  };
  if (template.call_permission === true) {
    components.push({
      type: "call_permission_request"
    })
  }

  if (template.is_limited_time_offer === true) {
    components.push({
      type: "limited_time_offer",
      limited_time_offer: {
        text: template.offer_text,
        has_expiration: template.has_expiration
      }
    })
  }
  const hasVariables = bodyVariables.length > 0;
  const isPositional = hasVariables && bodyVariables.every((v) => /^\d+$/.test(v.key));
  console.log("hasVariables", hasVariables, isPositional);
  console.log("bodyVariables:", bodyVariables);

  if (hasVariables) {
    if (isPositional) {
      const examplesArray = bodyVariables.map((v) => String(v.example || "example"));
      bodyComponent.example = {
        body_text: [examplesArray],
      };
    } else {
      bodyComponent.example = {
        body_text_named_params: bodyVariables.map((v) => ({
          param_name: String(v.key),
          example: String(v.example || "example"),
        })),
      };
    }
  }

  components.push(bodyComponent);

  if (template.footer_text && !template.is_limited_time_offer) {
    components.push({
      type: "FOOTER",
      text: template.footer_text,
    });
  }

  if (template.buttons?.length) {
    const ctaButtons = [];
    const quickReplyButtons = [];

    template.buttons.forEach((btn) => {
      if (btn.type === "phone_call") {
        ctaButtons.push({
          type: "PHONE_NUMBER",
          text: btn.text,
          phone_number: btn.phone_number,
        });
      } else if (btn.type === "website") {
        ctaButtons.push({
          type: "URL",
          text: btn.text,
          url: btn.website_url,
        });
      } else if (btn.type === "quick_reply") {
        quickReplyButtons.push({
          type: "QUICK_REPLY",
          text: btn.text,
        });
      } else if (btn.type === "catalog") {
        quickReplyButtons.push({
          type: "CATALOG",
          text: btn.text,
        })
      } else if (btn.type === "copy_code") {
        quickReplyButtons.push({
          type: "copy_code",
          example: btn.text,
        })
      }
      else if (btn.type === "url") {
        quickReplyButtons.push({
          type: "URL",
          text: btn.text,
          url: btn.url,
        })
      }
    });

    if (ctaButtons.length && quickReplyButtons.length) {
      throw new Error("Cannot mix Call-to-Action and Quick Reply buttons");
    }

    if (ctaButtons.length > 2) throw new Error("Maximum 2 CTA buttons allowed");
    if (quickReplyButtons.length > 3) throw new Error("Maximum 3 Quick Reply buttons allowed");

    if (ctaButtons.length || quickReplyButtons.length) {
      components.push({
        type: "BUTTONS",
        buttons: ctaButtons.length ? ctaButtons : quickReplyButtons,
      });
    }
  }

  return {
    name: template.template_name,
    language: template.language,
    category: template.category,
    parameter_format: bodyVariables.length > 0 && bodyVariables.every((v) => /^\d+$/.test(v.key)) ? "positional" : "named",
    components,
  };
};


function buildCarouselMetaTemplatePayload(template) {
  const bodyVariables = template.body_variables || [];
  const bodyComponent = {
    type: "body",
    text: template.message_body,
  };
  if (bodyVariables.length > 0) {
    const examples = bodyVariables.map((v) => v.example);
    bodyComponent.example = examples.length === 1
      ? { body_text: examples[0] }
      : { body_text: [examples] };
  }

  const cards = (template.carousel_cards || []).map((card) => {
    const components = (card.components || []).map((comp) => {
      const c = { type: (comp.type || "").toLowerCase() };
      if (comp.format) c.format = comp.format.toLowerCase();
      if (comp.text) c.text = comp.text;
      if (comp.example && typeof comp.example === "object") {
        c.example = comp.example;
      }
      if (comp.buttons && comp.buttons.length) {
        c.buttons = comp.buttons.map((btn) => {
          const b = {
            type: (btn.type || "spm").toLowerCase().replace("quick_reply", "quick_reply").replace("url", "url"),
            text: btn.text || "View",
          };
          if (btn.url) b.url = btn.url;
          return b;
        });
      }
      return c;
    });
    return { components };
  });

  const components = [bodyComponent];
  if (cards.length) {
    components.push({ type: "carousel", cards });
  }

  return {
    name: template.template_name,
    language: template.language,
    category: (template.category || "MARKETING").toUpperCase(),
    components,
  };
}

export const submitTemplateToMeta = async (payload, WABA_ID, ACCESS_TOKEN) => {
  console.log("payload", payload.components[4]);

  const url = `https://graph.facebook.com/${API_VERSION}/${WABA_ID}/message_templates`;

  const response = await axios.post(url, payload, {
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  return response.data;
};


const updateTemplateComponentsOnMeta = async (metaTemplateId, components, accessToken) => {
  const url = `https://graph.facebook.com/${UPDATE_API_VERSION}/${metaTemplateId}`;
  console.log("Updating template components:", components);
  const response = await axios.post(
    url,
    { components },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );
  console.log("Template update response:", response.data);

  return response.data;
};

export const getTemplateById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.owner_id;

    const template = await Template.findOne({
      _id: id,
      user_id: userId,
      is_admin_template: { $ne: true },
      deleted_at: null,
    })
      .select("-__v")
      .lean();

    if (!template) {
      return res.status(404).json({
        success: false,
        error: "Template not found",
      });
    }

    return res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error("Error getting template:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get template",
      details: error.message,
    });
  }
};


export const getAdminTemplatesForUsers = async (req, res) => {
  try {
    const { sector, template_category, category, search } = req.query;

    const filter = {
      is_admin_template: true,
      deleted_at: null
    };

    if (sector) {
      filter.sector = sector;
    }

    if (template_category) {
      filter.template_category = template_category;
    }

    if (category) {
      filter.category = category.toUpperCase();
    }

    if (search) {
      filter.$or = [
        { template_name: { $regex: search, $options: "i" } },
        { message_body: { $regex: search, $options: "i" } }
      ];
    }

    const templates = await Template.find(filter)
      .sort({ created_at: -1 })
      .select("-__v")
      .lean();

    return res.json({
      success: true,
      count: templates.length,
      data: templates,
    });
  } catch (error) {
    console.error("Error getting admin templates for users:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get admin templates",
      details: error.message,
    });
  }
};

export const getAllTemplates = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { waba_id, status, category, search } = req.query;

    if (!waba_id) {
      return res.status(400).json({ error: "WABA ID is required" });
    }

    const waba = await WhatsappWaba.findOne({
      _id: waba_id,
      user_id: userId,
      deleted_at: null,
    });
    if (!waba) {
      return res.status(404).json({ error: "WhatsApp WABA not found" });
    }

    const filter = {
      user_id: userId,
      waba_id: waba_id,
      is_admin_template: { $ne: true },
      deleted_at: null
    };

    if (status) {
      filter.status = status;
    }

    if (category) {
      filter.category = category;
    }

    if (search) {
      filter.$or = [
        { template_name: { $regex: search, $options: "i" } },
        { template_type: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { template_category: { $regex: search, $options: "i" } },
        { status: { $regex: search, $options: "i" } },
      ];
    }

    const templates = await Template.find(filter).sort({ created_at: -1 }).select("-__v").lean();

    return res.json({
      success: true,
      count: templates.length,
      data: templates,
    });
  } catch (error) {
    console.error("Error getting templates:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get templates",
      details: error.message,
    });
  }
};

export const getTemplatesFromMeta = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const waba_id = req.query.waba_id || req.body?.waba_id;

    if (!waba_id) {
      return res.status(400).json({
        success: false,
        error: "waba_id is required (query or body)",
      });
    }

    const waba = await WhatsappWaba.findOne({
      _id: waba_id,
      user_id: userId,
      deleted_at: null,
    });

    if (!waba) {
      return res.status(404).json({
        success: false,
        error: "WhatsApp WABA not found",
      });
    }

    const metaTemplates = await fetchTemplatesFromMeta(waba.whatsapp_business_account_id, waba.access_token);

    return res.json({
      success: true,
      data: metaTemplates,
      count: metaTemplates.length,
    });
  } catch (error) {
    console.error("Error fetching templates from Meta:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch templates from Meta",
      details: error.message,
    });
  }
};

export const syncTemplatesFromMeta = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { waba_id, meta_template_ids } = req.body || {};

    if (!waba_id) {
      return res.status(400).json({
        success: false,
        error: "waba_id is required",
      });
    }

    const idsToSync = Array.isArray(meta_template_ids) ? meta_template_ids : [];
    if (idsToSync.length === 0) {
      return res.status(400).json({
        success: false,
        error: "meta_template_ids is required and must be a non-empty array of Meta template IDs",
      });
    }

    const waba = await WhatsappWaba.findOne({
      _id: waba_id,
      user_id: userId,
      deleted_at: null,
    });

    if (!waba) {
      return res.status(404).json({
        success: false,
        error: "WhatsApp WABA not found",
      });
    }

    const allMetaTemplates = await fetchTemplatesFromMeta(waba.whatsapp_business_account_id, waba.access_token);
    const idSet = new Set(idsToSync.map((id) => String(id).trim()).filter(Boolean));
    const metaTemplatesToSync = allMetaTemplates.filter((t) => idSet.has(String(t.id)));

    let syncedCount = 0;
    let updatedCount = 0;
    const errors = [];

    for (const metaTemplate of metaTemplatesToSync) {
      try {
        const doc = metaTemplateToDbDocument(metaTemplate, waba_id, userId);

        const existing = await Template.findOne({
          user_id: userId,
          meta_template_id: metaTemplate.id,
        });

        if (existing) {
          await Template.findByIdAndUpdate(existing._id, doc);
          updatedCount++;
        } else {
          await Template.create(doc);
          syncedCount++;
        }
      } catch (err) {
        errors.push({
          meta_template_id: metaTemplate.id,
          template_name: metaTemplate.name,
          error: err.message,
        });
      }
    }

    const notFoundIds = idsToSync.filter((id) => !metaTemplatesToSync.some((t) => String(t.id) === String(id)));

    return res.json({
      success: true,
      message: "Sync completed",
      stats: {
        requested: idsToSync.length,
        found_on_meta: metaTemplatesToSync.length,
        not_found_on_meta: notFoundIds,
        newly_synced: syncedCount,
        updated: updatedCount,
        errors: errors.length,
      },
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error syncing templates:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to sync templates",
      details: error.message,
    });
  }
};

export const syncTemplatesStatusFromMeta = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { waba_id, template_ids } = req.body || {};

    if (!waba_id) {
      return res.status(400).json({
        success: false,
        error: "waba_id is required",
      });
    }

    const waba = await WhatsappWaba.findOne({
      _id: waba_id,
      user_id: userId,
      deleted_at: null,
    });

    if (!waba) {
      return res.status(404).json({
        success: false,
        error: "WhatsApp WABA not found",
      });
    }

    const query = {
      user_id: userId,
      waba_id: waba_id,
      meta_template_id: { $exists: true, $ne: null, $ne: "" },
    };
    if (Array.isArray(template_ids) && template_ids.length > 0) {
      query._id = { $in: template_ids };
    }

    const dbTemplates = await Template.find(query).lean();
    if (dbTemplates.length === 0) {
      return res.json({
        success: true,
        message: "No templates to sync status for",
        stats: { updated: 0, not_found_on_meta: 0, errors: 0 },
      });
    }

    const metaTemplates = await fetchTemplatesFromMeta(waba.whatsapp_business_account_id, waba.access_token);
    const metaById = new Map(metaTemplates.map((t) => [String(t.id), t]));

    let updatedCount = 0;
    const errors = [];
    const notFound = [];

    for (const dbT of dbTemplates) {
      const metaT = metaById.get(String(dbT.meta_template_id));
      if (!metaT) {
        notFound.push({ template_id: dbT._id.toString(), meta_template_id: dbT.meta_template_id, template_name: dbT.template_name });
        continue;
      }
      try {
        const status = (metaT.status || "").toLowerCase();
        const rejection_reason = metaT.rejected_reason || null;
        await Template.findByIdAndUpdate(dbT._id, {
          status,
          rejection_reason,
        });
        updatedCount++;
      } catch (err) {
        errors.push({
          template_id: dbT._id.toString(),
          template_name: dbT.template_name,
          error: err.message,
        });
      }
    }

    return res.json({
      success: true,
      message: "Status sync completed",
      stats: {
        total_checked: dbTemplates.length,
        updated: updatedCount,
        not_found_on_meta: notFound.length,
        errors: errors.length,
      },
      not_found_on_meta: notFound.length > 0 ? notFound : undefined,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("Error syncing template status:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to sync template status",
      details: error.message,
    });
  }
};

const findComponent = (components, type) => {
  if (!Array.isArray(components)) return null;
  const upper = (type || "").toUpperCase();
  return components.find((c) => (c.type || "").toUpperCase() === upper);
};

const fetchTemplatesFromMeta = async (wabaId, accessToken) => {
  const url = `https://graph.facebook.com/${API_VERSION}/${wabaId}/message_templates`;

  const response = await axios.get(url, {
    params: {
      fields: "id,name,status,category,language,components,rejected_reason,quality_score",
    },
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.data.data || [];
};

const extractBodyText = (components) => {
  const bodyComponent = findComponent(components, "BODY");
  return bodyComponent ? bodyComponent.text : "";
};

const extractVariablesFromComponents = (components) => {
  const bodyComponent = findComponent(components, "BODY");

  if (!bodyComponent || !bodyComponent.text) return [];

  const text = bodyComponent.text;
  const variableKeys = [];
  const regex = /{{(.*?)}}/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    variableKeys.push(match[1].trim());
  }

  let examples = [];
  const ex = bodyComponent.example;
  if (ex && ex.body_text) {
    const bt = ex.body_text;
    if (Array.isArray(bt)) {
      examples = Array.isArray(bt[0]) ? bt[0] : bt;
    }
  }

  return variableKeys.map((key, i) => ({
    key,
    example: examples[i] != null ? String(examples[i]) : "example",
  }));
};

const extractHeader = (components) => {
  const headerComponent = findComponent(components, "HEADER");
  if (!headerComponent) return null;

  const format = (headerComponent.format || "").toUpperCase();
  if (format === "TEXT") {
    return {
      format: "text",
      text: headerComponent.text,
    };
  }

  if (["IMAGE", "VIDEO", "DOCUMENT"].includes(format)) {
    const example = headerComponent.example || {};
    const handle = example.header_handle?.[0] || example.header_handle;
    const url = example.header_url;
    return {
      format: "media",
      media_type: format.toLowerCase(),
      media_url: url || (handle ? String(handle) : null),
      handle: handle || undefined,
    };
  }

  return null;
};

const extractFooterText = (components) => {
  const footerComponent = findComponent(components, "FOOTER");
  return footerComponent ? footerComponent.text : null;
};

const extractButtons = (components) => {
  const buttonComponent = findComponent(components, "BUTTONS");
  if (!buttonComponent || !buttonComponent.buttons) return [];

  return buttonComponent.buttons
    .map((btn) => {
      const t = (btn.type || "").toUpperCase();
      if (t === "PHONE_NUMBER") {
        return {
          type: "phone_call",
          text: btn.text,
          phone_number: btn.phone_number,
        };
      }
      if (t === "URL") {
        return {
          type: "url",
          text: btn.text,
          url: btn.url,
        };
      }
      if (t === "QUICK_REPLY") {
        return { type: "quick_reply", text: btn.text };
      }
      if (t === "CATALOG") {
        return { type: "catalog", text: btn.text };
      }
      if (t === "COPY_CODE") {
        return {
          type: "copy_code",
          text: btn.copy_button_text || btn.text,
          example: btn.example,
        };
      }
      if (t === "WEBSITE") {
        return {
          type: "website",
          text: btn.text,
          website_url: btn.url,
        };
      }
      return null;
    })
    .filter(Boolean);
};

const extractAuthenticationOptions = (components) => {
  const bodyComponent = findComponent(components, "BODY");
  if (!bodyComponent || bodyComponent.add_security_recommendation === undefined) return null;

  const footerComponent = findComponent(components, "FOOTER");
  let code_expiration_minutes;
  if (footerComponent && footerComponent.code_expiration_minutes != null) {
    code_expiration_minutes = footerComponent.code_expiration_minutes;
  }

  const buttonComponent = findComponent(components, "BUTTONS");
  const otp_buttons = [];
  if (buttonComponent && Array.isArray(buttonComponent.buttons)) {
    buttonComponent.buttons.forEach((btn) => {
      const otpType = (btn.otp_type || btn.type || "COPY_CODE").toUpperCase();
      otp_buttons.push({
        otp_type: otpType === "ONE_TAP" ? "ONE_TAP" : "COPY_CODE",
        copy_button_text: btn.copy_button_text || btn.text,
        supported_apps: btn.supported_apps,
      });
    });
  }
  if (otp_buttons.length === 0) otp_buttons.push({ otp_type: "COPY_CODE" });

  return {
    add_security_recommendation: bodyComponent.add_security_recommendation !== false,
    code_expiration_minutes,
    otp_code_length: bodyComponent.otp_code_length ?? 6,
    otp_buttons,
  };
};

const extractCarouselCards = (components) => {
  const carouselComponent = findComponent(components, "CAROUSEL");
  if (!carouselComponent || !carouselComponent.cards || !Array.isArray(carouselComponent.cards)) return [];

  return carouselComponent.cards.map((card) => {
    const comps = (card.components || []).map((comp) => {
      const type = (comp.type || "").toLowerCase();
      const c = { type };
      const format = (comp.format || "").toLowerCase();
      if (format) c.format = format;
      if (comp.text) c.text = comp.text;
      if (comp.example && typeof comp.example === "object") c.example = comp.example;
      if (comp.buttons && Array.isArray(comp.buttons)) {
        c.buttons = comp.buttons.map((btn) => {
          const b = {
            type: (btn.type || "").toLowerCase(),
            text: btn.text,
          };
          if (btn.url) b.url = btn.url;
          if (Array.isArray(btn.example)) b.example = btn.example;
          return b;
        });
      }
      return c;
    });
    return { components: comps };
  });
};


const detectTemplateType = (components, isCarousel, isAuth) => {
  if (isCarousel) {
    const cards = extractCarouselCards(components);
    const hasProductHeader = cards.some((card) =>
      (card.components || []).some(
        (c) =>
          (c.type || "").toLowerCase() === "header" &&
          (c.format || "").toLowerCase() === "product"
      )
    );
    return hasProductHeader ? "carousel_product" : "carousel_media";
  }

  if (isAuth) {
    return "authentication";
  }

  const ltoComponent = components.find((c) => (c.type || "").toUpperCase() === "LIMITED_TIME_OFFER");
  if (ltoComponent) {
    return "limited_time_offer";
  }

  const callPermissionComponent = components.find((c) => (c.type || "").toUpperCase() === "CALL_PERMISSION_REQUEST");
  if (callPermissionComponent) {
    return "call_permission";
  }

  const hasCatalogButton = components.some((c) =>
    (c.type || "").toUpperCase() === "BUTTONS" &&
    c.buttons &&
    c.buttons.some((btn) => (btn.type || "").toUpperCase() === "CATALOG")
  );

  const hasProductMessage = components.some((c) =>
    (c.type || "").toUpperCase() === "BODY" &&
    c.text &&
    (c.text.toLowerCase().includes("product") || c.text.toLowerCase().includes("catalog"))
  );

  if (hasCatalogButton || hasProductMessage) {
    return "catalog";
  }

  const hasCouponCode = components.some((c) =>
    (c.type || "").toUpperCase() === "BODY" &&
    c.text &&
    (c.text.toLowerCase().includes("coupon") || c.text.toLowerCase().includes("code") || c.text.toLowerCase().includes("discount"))
  );

  const hasCopyCodeButton = components.some((c) =>
    (c.type || "").toUpperCase() === "BUTTONS" &&
    c.buttons &&
    c.buttons.some((btn) => (btn.type || "").toUpperCase() === "COPY_CODE")
  );

  if (hasCouponCode || hasCopyCodeButton) {
    return "coupon";
  }

  return "standard";
};

const metaTemplateToDbDocument = (metaTemplate, wabaId, userId) => {
  const components = metaTemplate.components || [];
  const category = (metaTemplate.category || "UTILITY").toUpperCase();
  const isAuth = category === "AUTHENTICATION";
  const carouselComponent = findComponent(components, "CAROUSEL");
  const isCarousel = !!carouselComponent;

  let template_type = detectTemplateType(components, isCarousel, isAuth);

  const doc = {
    user_id: userId,
    waba_id: wabaId,
    template_name: (metaTemplate.name || "").toLowerCase(),
    language: metaTemplate.language || "en_US",
    category: ["UTILITY", "MARKETING", "AUTHENTICATION"].includes(category) ? category : "UTILITY",
    status: (metaTemplate.status || "draft").toLowerCase(),
    meta_template_id: metaTemplate.id,
    rejection_reason: metaTemplate.rejected_reason || null,
    template_type,
    message_body: isAuth ? "" : extractBodyText(components),
    body_variables: extractVariablesFromComponents(components),
    header: isCarousel ? null : extractHeader(components),
    footer_text: extractFooterText(components),
    buttons: isCarousel ? [] : extractButtons(components),
    carousel_cards: isCarousel ? extractCarouselCards(components) : [],
    authentication_options: isAuth ? extractAuthenticationOptions(components) : undefined,
  };

  const callPermissionComp = components.find((c) => (c.type || "").toUpperCase() === "CALL_PERMISSION_REQUEST");
  if (callPermissionComp) doc.call_permission = true;

  const ltoComp = components.find((c) => (c.type || "").toUpperCase() === "LIMITED_TIME_OFFER");
  if (ltoComp && ltoComp.limited_time_offer) {
    doc.is_limited_time_offer = true;
    doc.offer_text = ltoComp.limited_time_offer.text;
    doc.has_expiration = ltoComp.limited_time_offer.has_expiration;
  }

  return doc;
};


export const updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    if (!req.body) {
      return res.status(400).json({ error: "Request body is missing" });
    }

    let {
      template_name,
      language,
      category,
      message_body,
      footer_text,
      buttons,
      variable_examples,
      variables_example,
      header_text,
      add_security_recommendation,
      code_expiration_minutes,
      otp_code_length,
      otp_buttons,
      carousel_cards,
      template_type,
    } = req.body;

    if (typeof carousel_cards === 'string') {
      try {
        carousel_cards = JSON.parse(carousel_cards);
      } catch (e) {
        console.error("Error parsing carousel_cards:", e);
        carousel_cards = [];
      }
    }

    if (typeof buttons === 'string') {
      try {
        buttons = JSON.parse(buttons);
      } catch (e) {
        console.error("Error parsing buttons:", e);
      }
    }

    if (typeof otp_buttons === 'string') {
      try {
        otp_buttons = JSON.parse(otp_buttons);
      } catch (e) {
        console.error("Error parsing otp_buttons:", e);
      }
    }

    let rawVars = variable_examples || variables_example || {};
    console.log("Raw variables from request:", rawVars);

    if (typeof rawVars === "string") {
      try {
        rawVars = JSON.parse(rawVars);
        console.log("Parsed variables from JSON string:", rawVars);
      } catch (e) {
        console.error("Error parsing variables:", e);
        rawVars = {};
      }
    }

    const processedVariableExamples = {};
    if (Array.isArray(rawVars)) {
      rawVars.forEach((v) => {
        if (v && v.key) processedVariableExamples[v.key] = v.example;
      });
      console.log("Processed array variables:", processedVariableExamples);
    } else if (typeof rawVars === "object" && rawVars !== null) {
      Object.assign(processedVariableExamples, rawVars);
      console.log("Processed object variables:", processedVariableExamples);
    }
    console.log("Final processedVariableExamples:", processedVariableExamples);

    const userId = req.user.owner_id;

    const template = await Template.findOne({
      _id: id,
      user_id: userId,
      is_admin_template: { $ne: true },
      deleted_at: null,
    });

    if (!template) {
      return res.status(404).json({ error: "Template not found" });
    }

    const waba = await WhatsappWaba.findOne({
      _id: template.waba_id,
      user_id: userId,
      deleted_at: null,
    });
    console.log("waba", waba);
    if (!waba) {
      return res.status(404).json({ error: "WhatsApp WABA not found" });
    }

    const { access_token, whatsapp_business_account_id, app_id } = waba;
    const normalizedTemplateType = (template_type || template.template_type || "standard").toLowerCase();

    const updateData = {};

    const uploadedFile = req.file || (req.files && req.files.file && req.files.file[0]);
    if (uploadedFile) {
      let buffer = uploadedFile.buffer;
      if (!buffer && uploadedFile.path) {
        try {
          if (uploadedFile.path.startsWith('http')) {
            const response = await axios.get(uploadedFile.path, { responseType: 'arraybuffer' });
            buffer = Buffer.from(response.data);
          } else {
            buffer = fs.readFileSync(path.join(process.cwd(), uploadedFile.path));
          }
        } catch (err) {
          console.error('[TemplateController] Error reading uploaded file:', err.message);
        }
      }

      if (buffer) {
        const handle = await uploadSampleMediaForTemplate({
          app_id: app_id,
          access_token,
          file_name: uploadedFile.originalname,
          file_size: uploadedFile.size,
          mime_type: uploadedFile.mimetype,
          buffer: buffer,
        });
        updateData.header = {
          format: "media",
          media_type: getWhatsAppTypeFromMime(uploadedFile.mimetype),
          handle: handle,
        };
      }
    }

    const cardMediaFiles = (req.files && req.files.card_media) ? (Array.isArray(req.files.card_media) ? req.files.card_media : [req.files.card_media]) : [];
    if (["carousel_product", "carousel_media"].includes(normalizedTemplateType) && Array.isArray(carousel_cards)) {
      if (cardMediaFiles.length > 0) {
        for (let i = 0; i < cardMediaFiles.length && i < carousel_cards.length; i++) {
          const file = cardMediaFiles[i];
          let buffer = file.buffer;
          if (!buffer && file.path) {
            try {
              if (file.path.startsWith('http')) {
                const response = await axios.get(file.path, { responseType: 'arraybuffer' });
                buffer = Buffer.from(response.data);
              } else {
                buffer = fs.readFileSync(path.join(process.cwd(), file.path));
              }
            } catch (err) {
              console.error('[TemplateController] Error reading carousel file:', err.message);
            }
          }

          if (buffer) {
            const handle = await uploadSampleMediaForTemplate({
              app_id: app_id,
              access_token,
              file_name: file.originalname,
              file_size: file.size,
              mime_type: file.mimetype,
              buffer: buffer,
            });
            const card = carousel_cards[i];
            if (card && card.components) {
              const headerComp = card.components.find((c) => (c.type || "").toLowerCase() === "header");
              if (headerComp) {
                headerComp.format = headerComp.format || getWhatsAppTypeFromMime(file.mimetype);
                headerComp.example = { header_handle: [handle] };
              }
            }
          }
        }
      }
      updateData.carousel_cards = carousel_cards;
    }

    if (template_name) updateData.template_name = template_name.toLowerCase();
    if (language) updateData.language = language;
    if (category) updateData.category = category;
    if (message_body) {
      const isAuthenticationCategory = (category || "").toUpperCase() === "AUTHENTICATION";
      updateData.message_body = isAuthenticationCategory ? "" : message_body;

      const extractedVariables = extractVariables(message_body);
      console.log("Extracted variables from message body:", extractedVariables);
      console.log("Processed variable examples:", processedVariableExamples);

      if (!isAuthenticationCategory) {
        const bodyVariables = extractedVariables.map((v) => ({
          key: v.key,
          example: processedVariableExamples[v.key] || "example",
        }));
        console.log("Final body variables for standard template:", bodyVariables);
        updateData.body_variables = bodyVariables;
      } else {
        const bodyVariables = extractedVariables.map((v) => ({
          key: v.key,
          example: processedVariableExamples[v.key] || "example",
        }));
        console.log("Final body variables for auth template:", bodyVariables);
        updateData.body_variables = bodyVariables;
      }
    }
    if (footer_text !== undefined) updateData.footer_text = footer_text;
    if (buttons !== undefined) {
      if (Array.isArray(buttons)) {
        updateData.buttons = buttons.map(btn => {
          const type = (btn.type || "").toLowerCase();
          if (type === "url" || type === "website") {
            const url = btn.url || btn.website_url || "";
            if (!url.includes("{{")) {
              const { example, ...rest } = btn;
              return rest;
            }
          }
          const { example, ...rest } = btn;
          if (!example || (Array.isArray(example) && example.length === 0)) {
            return rest;
          }
          return btn;
        });
      } else {
        updateData.buttons = buttons;
      }
    }

    if ((category || template.category || "").toUpperCase() === "AUTHENTICATION") {
      const existingAuth = template.authentication_options && (template.authentication_options.toObject ? template.authentication_options.toObject() : template.authentication_options) || {};
      const authUpdates = { ...existingAuth };
      if (add_security_recommendation !== undefined) {
        authUpdates.add_security_recommendation = add_security_recommendation !== false && add_security_recommendation !== "false";
      }
      if (code_expiration_minutes !== undefined) authUpdates.code_expiration_minutes = code_expiration_minutes != null ? Number(code_expiration_minutes) : undefined;
      if (otp_code_length !== undefined) authUpdates.otp_code_length = otp_code_length != null ? Number(otp_code_length) : 6;
      if (otp_buttons !== undefined) {
        let rawOtpButtons = otp_buttons;
        if (typeof rawOtpButtons === "string") {
          try {
            rawOtpButtons = JSON.parse(rawOtpButtons);
          } catch (e) {
            rawOtpButtons = [];
          }
        }
        authUpdates.otp_buttons = Array.isArray(rawOtpButtons)
          ? rawOtpButtons.map((btn) => {
            let otpType = ((btn.otp_type || btn.type || "COPY_CODE") + "").toUpperCase().replace(/\s/g, "_");
            if (otpType !== "ONE_TAP") otpType = "COPY_CODE";
            return {
              otp_type: otpType,
              copy_button_text: btn.copy_button_text || btn.text,
              supported_apps: Array.isArray(btn.supported_apps) ? btn.supported_apps : undefined,
            };
          })
          : existingAuth.otp_buttons;
      }
      updateData.authentication_options = authUpdates;
    }

    if (header_text !== undefined) {
      if (header_text === null || header_text === '') {
        updateData.header = null;
      } else {
        updateData.header = {
          format: "text",
          text: header_text,
        };
      }
    }

    const updatedLocalTemplate = await Template.findByIdAndUpdate(
      id,
      updateData,
      { returnDocument: 'after', runValidators: true }
    );

    const shouldUpdateOnMeta = req.body.should_update_on_meta ?? true === true;

    if (shouldUpdateOnMeta) {
      try {
        const wabaId = waba.whatsapp_business_account_id;
        const accessToken = waba.access_token;
        const metaTemplateId = template.meta_template_id;

        if (metaTemplateId) {
          const metaPayload = buildMetaTemplatePayload(updatedLocalTemplate);
          const components = metaPayload.components || [];

          console.log("Meta payload for update:", JSON.stringify(metaPayload, null, 2));
          console.log("Components being sent:", JSON.stringify(components, null, 2));

          const updateResponse = await updateTemplateComponentsOnMeta(
            metaTemplateId,
            components,
            accessToken
          );

          const newStatus = updateResponse.status
            ? String(updateResponse.status).toLowerCase()
            : undefined;

          if (newStatus) {
            await Template.findByIdAndUpdate(id, { status: newStatus });
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));

          const metaTemplates = await fetchTemplatesFromMeta(wabaId, accessToken);
          const metaTemplate = metaTemplates.find(
            (t) => String(t.id) === String(metaTemplateId)
          );

          if (metaTemplate && metaTemplate.components) {
            const headerInfo = extractHeader(metaTemplate.components);
            if (headerInfo && headerInfo.media_url) {
              await Template.findByIdAndUpdate(id, { header: headerInfo }, { returnDocument: 'after' });
            }
          }

          return res.status(200).json({
            success: true,
            message: "Template components updated successfully on Meta using the edit components API.",
            data: await Template.findById(id),
          });
        } else {
          const metaPayload = buildMetaTemplatePayload(updatedLocalTemplate);
          const createResponse = await submitTemplateToMeta(metaPayload, wabaId, accessToken);

          await Template.findByIdAndUpdate(id, {
            meta_template_id: createResponse.id || createResponse.name,
            status: createResponse.status?.toLowerCase(),
          });

          await new Promise((resolve) => setTimeout(resolve, 2000));

          const metaTemplates = await fetchTemplatesFromMeta(wabaId, accessToken);
          const metaTemplate = metaTemplates.find(
            (t) => t.name === updatedLocalTemplate.template_name
          );

          if (metaTemplate && metaTemplate.components) {
            const headerInfo = extractHeader(metaTemplate.components);
            if (headerInfo && headerInfo.media_url) {
              await Template.findByIdAndUpdate(id, { header: headerInfo }, { returnDocument: 'after' });
            }
          }

          return res.status(200).json({
            success: true,
            message: "Template created on Meta (no existing Meta template ID found).",
            data: await Template.findById(id),
          });
        }
      } catch (metaError) {
        console.error("Error updating Meta template:", metaError.response?.data || metaError.message);
        console.error("Full error response:", JSON.stringify(metaError.response?.data, null, 2));
        return res.status(400).json({
          success: false,
          message: error.response?.data.error.error_user_msg || error.message,
          error: metaError.response?.data?.error?.message || metaError.message,
          error_details: metaError.response?.data || null,
          local_template_updated: true,
          data: updatedLocalTemplate,
        });
      }
    } else {
      return res.status(200).json({
        success: true,
        message: "Template updated locally. To update the template on WhatsApp Meta, set should_update_on_meta=true in your request.",
        data: updatedLocalTemplate,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Template updated successfully",
      data: updatedLocalTemplate,
    });
  } catch (error) {
    console.error("Error updating template:", error);
    return res.status(400).json({
      error: error.response?.data || error.message,
    });
  }
};

export const deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.owner_id;
    const currentUserId = req.user.id;
    const { delete_from_meta = true } = req.body || {};

    const template = await Template.findOne({
      _id: id,
      user_id: ownerId,
      is_admin_template: { $ne: true },
      deleted_at: null,
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: "Template not found"
      });
    }

    const result = {
      template_id: id,
      template_name: template.template_name,
      deleted_from_database: false,
      deleted_from_meta: false,
      meta_deletion_method: null
    };

    if (delete_from_meta && template.meta_template_id) {
      try {
        const waba = await WhatsappWaba.findOne({
          _id: template.waba_id,
          user_id: ownerId,
          deleted_at: null,
        });

        if (waba) {
          try {
            await deleteTemplateOnMetaById(template.meta_template_id, waba.access_token);
            result.deleted_from_meta = true;
            result.meta_deletion_method = "by_id";
            console.log(`Template ${template.template_name} deleted from Meta by ID: ${template.meta_template_id}`);
          } catch (metaError) {
            console.warn("ID-based deletion failed, trying name-based deletion:", metaError.message);
            try {
              await deleteTemplateOnMeta(template.template_name, waba.whatsapp_business_account_id, waba.access_token);
              result.deleted_from_meta = true;
              result.meta_deletion_method = "by_name";
              console.log(`Template ${template.template_name} deleted from Meta by name`);
            } catch (nameError) {
              console.error("Failed to delete template from Meta:", nameError.response?.data || nameError.message);
              result.meta_deletion_error = nameError.response?.data?.error?.message || nameError.message;
            }
          }
        } else {
          result.meta_deletion_error = "WABA not found or access token missing";
        }
      } catch (error) {
        console.error("Error deleting from Meta:", error.message);
        result.meta_deletion_error = error.message;
      }
    } else if (delete_from_meta && !template.meta_template_id) {
      result.meta_deletion_skipped = "No Meta template ID found";
    }

    await Template.findByIdAndUpdate(id, {
      deleted_at: new Date(),
      deleted_by: currentUserId
    });

    result.deleted_from_database = true;
    console.log(`Template ${template.template_name} deleted from database`);

    const successMessage = result.deleted_from_meta
      ? "Template deleted successfully from both database and Meta"
      : "Template deleted successfully from database" + (delete_from_meta ? " (Meta deletion skipped or failed)" : " (Meta deletion not requested)");

    return res.status(200).json({
      success: true,
      message: successMessage,
      data: result
    });

  } catch (error) {
    console.error("Error deleting template:", error);
    return res.status(500).json({
      success: false,
      message: error.response?.data.error.error_user_msg || error.message,
      error: "Failed to delete template",
      details: error.message
    });
  }
};

export const suggestTemplate = async (req, res) => {
  try {
    const { businessName, language, industry, occasion, purpose, action, tone, additionalDetails } = req.body;
    const userId = req.user.owner_id;

    if (!businessName || !language || !industry || !occasion || !purpose || !action || !tone) {
      return res.status(400).json({
        success: false,
        message: "All fields are required: businessName, language, industry, occasion, purpose, action, tone",
      });
    }

    const userSettings = await UserSetting.findOne({ user_id: userId });

    if (!userSettings || !userSettings.ai_model || !userSettings.api_key) {
      return res.status(400).json({
        success: false,
        message: "Please select model and add API key in settings",
      });
    }

    const { ai_model: modelId, api_key: apiKey } = userSettings;

    const aiModel = await AIModel.findOne({
      _id: modelId,
      status: "active",
      deleted_at: null,
    });

    if (!aiModel) {
      return res.status(404).json({
        success: false,
        message: "AI model not found or inactive",
      });
    }

    const prompt = `You are an expert WhatsApp template creator. Create a professional WhatsApp message template using the details below.

Business Name: ${businessName}
Language: ${language}
Industry: ${industry}
Occasion: ${occasion}
Purpose: ${purpose}
Action: ${action}
Tone: ${tone}
Additional Details: ${additionalDetails || "None provided"}

Return the template in the following JSON format ONLY:

{
  "template_name": "unique_template_name",
  "category": "MARKETING",
  "language": "${language}",
  "header_text": "Optional short header text",
  "message_body": "Main message content with variables like {{name}}",
  "footer_text": "Optional footer text"
}

STRICT RULES:
1. Return ONLY the raw JSON object - NO markdown backticks, NO explanations, NO additional text
2. Do NOT include buttons or any extra fields
3. Ensure all strings are properly escaped (apostrophes as \' and quotes as \")
4. message_body must be under 1024 characters
5. Use a professional ${tone} tone
6. category must be MARKETING for promotional content, UTILITY otherwise
7. Use WhatsApp-approved language suitable for the ${industry} industry
8. Focus on ${purpose} with a clear ${action} call-to-action
9. Complete ALL JSON fields with proper closing quotes and braces
10. If you cannot comply exactly, return an empty JSON object {}`;

    const templateResponse = await commonCallAIModel(userId, aiModel, apiKey, prompt);

    console.log("Extracted response text:", templateResponse);

    let cleanResponse = templateResponse
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const parsedData = safeJsonParse(cleanResponse);

    return res.status(200).json({
      success: true,
      message: "Template suggested successfully",
      data: [
        {
          ...(parsedData ? parsedData : { raw_response: cleanResponse }),
          modelUsed: aiModel.display_name,
          modelId: aiModel.model_id,
        },
      ],
    });
  } catch (error) {
    console.error("Error in suggestTemplate:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

const safeJsonParse = (input) => {
  try {
    if (typeof input !== "string") return null;

    const normalized = normalizeJson(input);

    const parsed = JSON.parse(normalized);

    if (typeof parsed === "string") {
      return JSON.parse(normalizeJson(parsed));
    }

    return parsed;
  } catch (e) {
    console.error("JSON parse error:", e.message);
    return null;
  }
};

const deleteTemplateOnMeta = async (templateName, wabaId, accessToken) => {
  console.log("Deleting template from Meta:", templateName);
  const url = `https://graph.facebook.com/${API_VERSION}/${wabaId}/message_templates?name=${encodeURIComponent(templateName)}`;

  const response = await axios.delete(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  console.log("Meta delete response:", response.data);
  return response.data;
};

const deleteTemplateOnMetaById = async (metaTemplateId, accessToken) => {
  console.log("Deleting template from Meta by ID:", metaTemplateId);
  const url = `https://graph.facebook.com/${UPDATE_API_VERSION}/${metaTemplateId}`;

  const response = await axios.delete(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  console.log("Meta delete by ID response:", response.data);
  return response.data;
};

const normalizeJson = (text) => {
  if (!text) return text;

  return text
    .replace(/\\'/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1");
};

export const migrateTemplate = async (req, res) => {
  try {
    const userId = req.user.owner_id;
    const { template_id, destination_waba_id } = req.body;

    if (!template_id || !destination_waba_id) {
      return res.status(400).json({
        success: false,
        error: "template_id and destination_waba_id are required",
      });
    }

    const template = await Template.findOne({
      _id: template_id,
      user_id: userId,
      deleted_at: null,
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: "Template not found",
      });
    }

    const sourceWaba = await WhatsappWaba.findOne({
      _id: template.waba_id,
      user_id: userId,
      deleted_at: null,
    });

    if (!sourceWaba) {
      return res.status(404).json({
        success: false,
        error: "Source WABA not found",
      });
    }

    const destinationWaba = await WhatsappWaba.findOne({
      $or: [
        { _id: destination_waba_id },
        { whatsapp_business_account_id: destination_waba_id }
      ],
      user_id: userId,
      deleted_at: null,
    });

    if (!destinationWaba) {
      return res.status(404).json({
        success: false,
        error: "Destination WABA not found",
      });
    }

    if (String(sourceWaba._id) === String(destinationWaba._id)) {
      return res.status(400).json({
        success: false,
        error: "Source and destination WABAs must be different",
      });
    }


    if (!sourceWaba.business_id || !destinationWaba.business_id || sourceWaba.business_id !== destinationWaba.business_id) {
      return res.status(400).json({
        success: false,
        error: "Templates can only be migrated between WABAs owned by the same Meta business",
        details: `Source BM: ${sourceWaba.business_id}, Destination BM: ${destinationWaba.business_id}`
      });
    }


    const metaTemplates = await fetchTemplatesFromMeta(sourceWaba.whatsapp_business_account_id, sourceWaba.access_token);
    const metaTemplate = metaTemplates.find((t) => t.name === template.template_name);

    if (!metaTemplate) {
      return res.status(404).json({
        success: false,
        error: "Template not found on Meta",
      });
    }

    const { status, quality_score } = metaTemplate;
    const allowedQualityScores = ["GREEN", "UNKNOWN"];

    const currentQualityScore = (quality_score && typeof quality_score === 'object') ? quality_score.score : quality_score;

    if (status !== "APPROVED") {
      return res.status(400).json({
        success: false,
        error: `Only APPROVED templates are eligible for migration. Current status: ${status}`,
      });
    }

    if (!allowedQualityScores.includes(currentQualityScore)) {
      return res.status(400).json({
        success: false,
        error: `Only templates with a quality score of GREEN or UNKNOWN are eligible for migration. Current quality score: ${currentQualityScore}`,
      });
    }

    const migrationUrl = `https://graph.facebook.com/${API_VERSION}/${destinationWaba.whatsapp_business_account_id}/migrate_message_templates`;
    try {
      if (!template.meta_template_id) {
        throw new Error("Template does not have a Meta Template ID. Please sync the template first.");
      }

      const migrationResponse = await axios.post(
        migrationUrl,
        {
          source_waba_id: String(sourceWaba.whatsapp_business_account_id),
          template_ids: [String(template.meta_template_id)],
        },
        {
          headers: {
            Authorization: `Bearer ${destinationWaba.access_token}`,
            "Content-Type": "application/json",
          },
        }
      );
      console.log("Meta migration API Success:", migrationResponse.data);
    } catch (migrationError) {
      const errorData = migrationError.response?.data;
      console.error("Meta migration API Error:", JSON.stringify(errorData, null, 2));


      return res.status(400).json({
        success: false,
        error: "Failed to migrate template on Meta",
        details: errorData?.error?.message || migrationError.message,
        meta_error: errorData
      });
    }

    const newTemplateData = template.toObject();
    delete newTemplateData._id;
    delete newTemplateData.createdAt;
    delete newTemplateData.updatedAt;

    newTemplateData.waba_id = destinationWaba._id;

    const newLocalTemplate = await Template.create(newTemplateData);

    return res.json({
      success: true,
      message: "Template migrated (copied) successfully",
      data: {
        new_template_id: newLocalTemplate._id,
        source_template_id: template._id,
        template_name: template.template_name,
        source_waba_id: sourceWaba._id,
        destination_waba_id: destinationWaba._id,
      },
    });
  } catch (error) {
    console.error("Error in migrateTemplate:", error);
    return res.status(500).json({
      success: false,
      error: "Internal server error",
      details: error.message,
    });
  }
};

export default {
  createTemplate,
  getAllTemplates,
  getTemplateById,
  getTemplatesFromMeta,
  syncTemplatesFromMeta,
  syncTemplatesStatusFromMeta,
  suggestTemplate,
  updateTemplate,
  deleteTemplate,
  migrateTemplate,
  getAdminTemplatesForUsers,
};
