import Template from "../models/template.model.js";
import mongoose from "mongoose";
import { getWhatsAppTypeFromMime } from "../utils/uploadMediaToWhatsapp.js";

const addBaseUrlToMediaUrls = (template) => {
  if (!template) return template;

  const result = { ...template };

  if (result.header && result.header.media_url && !result.header.media_url.startsWith('http')) {
    result.header.media_url = `${process.env.APP_URL}/${result.header.media_url}`;
  }

  if (result.carousel_cards && Array.isArray(result.carousel_cards)) {
    result.carousel_cards = result.carousel_cards.map(card => {
      if (card.components && Array.isArray(card.components)) {
        card = {
          ...card,
          components: card.components.map(component => {
            if (component.media_url && !component.media_url.startsWith('http')) {
              component = {
                ...component,
                media_url: `${process.env.APP_URL}/${component.media_url}`
              };
            }
            return component;
          })
        };
      }
      return card;
    });
  }

  return result;
};


const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 100;

const parsePaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
  const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(query.limit) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const SORT_ORDER = {
  ASC: 1,
  DESC: -1
};

const DEFAULT_SORT_FIELD = "created_at";
const ALLOWED_SORT_FIELDS = ["template_name", "category", "status", "sector", "template_category", "created_at", "updated_at"];

const parseSortParams = (query) => {
  const sortField = ALLOWED_SORT_FIELDS.includes(query.sort_by)
    ? query.sort_by
    : DEFAULT_SORT_FIELD;

  const sortOrder = query.sort_order?.toLowerCase() === "asc"
    ? SORT_ORDER.ASC
    : SORT_ORDER.DESC;

  return { sortField, sortOrder };
};

export const createAdminTemplate = async (req, res) => {
  try {
    const { template_name, language = "en_US", category, message_body, footer_text, buttons, variable_examples, variables_example, add_security_recommendation, code_expiration_minutes, otp_code_length, otp_buttons, call_permission, is_limited_time_offer, offer_text, has_expiration, template_type, carousel_cards, sector, template_category, header_text } = req.body;
    console.log("template_name", template_name);
    if (!template_name || !category) {
      return res.status(400).json({
        success: false,
        error: "template_name and category are required",
      });
    }

    if (!["UTILITY", "MARKETING", "AUTHENTICATION"].includes(category.toUpperCase())) {
      return res.status(400).json({
        success: false,
        error: "Category must be UTILITY, MARKETING, or AUTHENTICATION",
      });
    }

    let parsedButtons = buttons;
    if (typeof buttons === "string") {
      try {
        parsedButtons = JSON.parse(buttons);
      } catch (e) {
        console.error("Error parsing buttons:", e);
        parsedButtons = [];
      }
    }
    if (!Array.isArray(parsedButtons)) parsedButtons = [];

    let parsedCarouselCards = carousel_cards;
    if (typeof carousel_cards === "string") {
      try {
        parsedCarouselCards = JSON.parse(carousel_cards);
      } catch (e) {
        console.error("Error parsing carousel_cards:", e);
        parsedCarouselCards = [];
      }
    }
    if (!Array.isArray(parsedCarouselCards)) parsedCarouselCards = [];

    const cardMediaFiles = (req.files && req.files.card_media) ? (Array.isArray(req.files.card_media) ? req.files.card_media : [req.files.card_media]) : [];
    console.log("cardMediaFiles", cardMediaFiles);

    if (parsedCarouselCards.length > 0 && cardMediaFiles.length > 0) {
      for (let i = 0; i < cardMediaFiles.length && i < parsedCarouselCards.length; i++) {
        const file = cardMediaFiles[i];
        const card = parsedCarouselCards[i];

        if (card && card.components) {
          const headerComp = card.components.find((c) => (c.type || "").toLowerCase() === "header");
          if (headerComp) {
            headerComp.format = headerComp.format || getWhatsAppTypeFromMime(file.mimetype);
            headerComp.example = { header_handle: [file.path] };
            headerComp.media_url = file.path;
            headerComp.original_filename = file.originalname;
          }
        }
      }
    }

    let parsedOtpButtons = otp_buttons;
    if (typeof otp_buttons === "string") {
      try {
        parsedOtpButtons = JSON.parse(otp_buttons);
      } catch (e) {
        console.error("Error parsing otp_buttons:", e);
        parsedOtpButtons = [];
      }
    }
    if (!Array.isArray(parsedOtpButtons)) parsedOtpButtons = [];

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

    const extractVariables = (text) => {
      if (!text) return [];
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

    const detectTemplateType = (components, isCarousel, isAuth, call_permission, is_limited_time_offer, offer_text, buttons, msgBody) => {
      console.log("isCarousel", isCarousel)
      if (isCarousel) {
        const cards = [];
        const hasProductHeader = false;
        return hasProductHeader ? "carousel_product" : "carousel_media";
      }

      if (isAuth) {
        return "authentication";
      }

      if (is_limited_time_offer) {
        return "limited_time_offer";
      }

      if (call_permission) {
        return "call_permission";
      }
      console.log("buttons", buttons);
      const hasCatalogButton = Array.isArray(buttons) &&
        buttons.some((btn) => (btn.type || "").toLowerCase() === "catalog");
      console.log("hasCatalogButton", hasCatalogButton);
      const hasProductMessage = (msgBody || "").toLowerCase().includes("product") ||
        (msgBody || "").toLowerCase().includes("catalog");

      if (hasCatalogButton || hasProductMessage) {
        return "catalog";
      }

      const hasCouponCode = (msgBody || "").toLowerCase().includes("coupon") ||
        (msgBody || "").toLowerCase().includes("code") ||
        (msgBody || "").toLowerCase().includes("discount");

      const hasCopyCodeButton = Array.isArray(buttons) &&
        buttons.some((btn) => (btn.type || "").toLowerCase() === "copy_code");

      if (hasCouponCode || hasCopyCodeButton) {
        return "coupon";
      }

      return "standard";
    };

    const normalizedCategory = category.toUpperCase();
    const isAuthenticationCategory = normalizedCategory === "AUTHENTICATION";

    let bodyVariables = [];
    if (message_body && !isAuthenticationCategory) {
      const extractedVariables = extractVariables(message_body);
      bodyVariables = extractedVariables.map((v) => ({
        key: v.key,
        example: processedVariableExamples[v.key] || "example",
      }));
    } else if (isAuthenticationCategory && message_body) {
      const extractedVariables = extractVariables(message_body);
      bodyVariables = extractedVariables.map((v) => ({
        key: v.key,
        example: processedVariableExamples[v.key] || "example",
      }));
    }

    let header = null;

    const uploadedFile = req.file || (req.files && req.files.file && req.files.file[0]);
    if (uploadedFile) {
      header = {
        format: "media",
        media_type: getWhatsAppTypeFromMime(uploadedFile.mimetype),
        media_url: uploadedFile.path,
        original_filename: uploadedFile.originalname,
      };
    }

    if (header_text && !uploadedFile) {
      header = {
        format: "text",
        text: header_text,
      };
    }

    const templateComponents = [];

    if (message_body) {
      templateComponents.push({
        type: "BODY",
        text: message_body
      });
    }

    let parsedButtonsForDetection = parsedButtons;
    if (parsedButtonsForDetection && parsedButtonsForDetection.length > 0) {
      const buttonComponents = parsedButtonsForDetection.map(btn => {
        const btnType = (btn.type || "").toUpperCase();
        const component = { type: btnType, text: btn.text };

        if (btnType === "PHONE_CALL") {
          component.phone_number = btn.phone_number;
        } else if (btnType === "URL" || btnType === "WEBSITE") {
          component.url = btn.url || btn.website_url;
          if (btn.example) component.example = btn.example;
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
    console.log("template_type", template_type);
    const isCarouselTemplate =
      ["carousel_product", "carousel_media"].includes(
        (template_type || "").toLowerCase()
      ) &&
      parsedCarouselCards.length >= 2 &&
      parsedCarouselCards.length <= 10;

    const detectedTemplateType = detectTemplateType(templateComponents, isCarouselTemplate, isAuthenticationCategory, call_permission, is_limited_time_offer, offer_text, buttons, message_body);

    const finalTemplateType =
      template_type?.trim() ||
      detectedTemplateType ||
      "standard";
    console.log("detectedTemplateType", finalTemplateType)

    let authentication_options = null;
    if (isAuthenticationCategory) {
      authentication_options = {
        add_security_recommendation: add_security_recommendation !== false && add_security_recommendation !== "false",
        code_expiration_minutes: code_expiration_minutes != null ? Number(code_expiration_minutes) : undefined,
        otp_code_length: otp_code_length != null ? Number(otp_code_length) : 6,
        otp_buttons: parsedOtpButtons.map((btn) => {
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

    const existingTemplate = await Template.findOne({
      template_name: template_name.toLowerCase(),
      is_admin_template: true,
      deleted_at: null,
    });

    if (existingTemplate) {
      return res.status(400).json({
        success: false,
        error: "Template name already exists",
      });
    }

    const adminTemplate = await Template.create({
      is_admin_template: true,
      user_id: null,
      waba_id: null,
      template_name: template_name.toLowerCase(),
      language,
      category: normalizedCategory,
      sector: sector || null,
      template_category: template_category || null,
      call_permission: call_permission || false,
      header,
      message_body: isAuthenticationCategory ? "" : message_body,
      is_limited_time_offer: is_limited_time_offer || false,
      offer_text: offer_text || null,
      has_expiration: has_expiration || false,
      body_variables: bodyVariables,
      footer_text: footer_text || null,
      buttons: parsedButtons,
      template_type: finalTemplateType,
      carousel_cards: parsedCarouselCards.length > 0 ? parsedCarouselCards : undefined,
      authentication_options: authentication_options || undefined,
      status: "draft",
    });

    return res.status(201).json({
      success: true,
      message: "Admin template created successfully",
      data: adminTemplate,
    });
  } catch (error) {
    console.error("Error creating admin template:", error);
    return res.status(400).json({
      success: false,
      error: error.message || "Failed to create admin template",
    });
  }
};

export const getAllAdminTemplates = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const { sector, template_category, category, search, status } = req.query;

    const filter = {
      is_admin_template: true,
      deleted_at: null,
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

    if (status) {
      filter.status = status;
    }

    if (search) {
      filter.$or = [{ template_name: { $regex: search, $options: "i" } }, { message_body: { $regex: search, $options: "i" } }];
    }

    const totalCount = await Template.countDocuments(filter);

    const templates = await Template.find(filter)
      .sort({ [sortField]: sortOrder })
      .select("-__v")
      .skip(skip)
      .limit(limit)
      .lean();

    const templatesWithUrls = templates.map(template => addBaseUrlToMediaUrls(template));

    return res.json({
      success: true,
      data: {
        templates: templatesWithUrls,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit,
        },
      },
    });
  } catch (error) {
    console.error("Error getting admin templates:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get admin templates",
      details: error.message,
    });
  }
};

export const getAdminTemplateById = async (req, res) => {
  try {
    const { id } = req.params;

    const template = await Template.findOne({
      _id: id,
      is_admin_template: true,
      deleted_at: null,
    })
      .select("-__v")
      .lean();

    if (!template) {
      return res.status(404).json({
        success: false,
        error: "Admin template not found",
      });
    }

    const templateWithUrls = addBaseUrlToMediaUrls(template);

    return res.json({
      success: true,
      data: templateWithUrls,
    });
  } catch (error) {
    console.error("Error getting admin template:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get admin template",
      details: error.message,
    });
  }
};

export const updateAdminTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { template_name, language, category, message_body, footer_text, buttons, variable_examples, variables_example, header_text, add_security_recommendation, code_expiration_minutes, otp_code_length, otp_buttons, call_permission, is_limited_time_offer, offer_text, has_expiration, template_type, carousel_cards, sector, template_category } = req.body;

    const template = await Template.findOne({
      _id: id,
      is_admin_template: true,
      deleted_at: null,
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        error: "Admin template not found",
      });
    }

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

    const extractVariables = (text) => {
      if (!text) return [];
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

    const updateData = {};

    if (template_name) {
      const existingTemplate = await Template.findOne({
        template_name: template_name.toLowerCase(),
        is_admin_template: true,
        deleted_at: null,
        _id: { $ne: id },
      });

      if (existingTemplate) {
        return res.status(400).json({
          success: false,
          error: "Template name already exists",
        });
      }
      updateData.template_name = template_name.toLowerCase();
    }

    if (language) updateData.language = language;
    if (category) {
      if (!["UTILITY", "MARKETING", "AUTHENTICATION"].includes(category.toUpperCase())) {
        return res.status(400).json({
          success: false,
          error: "Category must be UTILITY, MARKETING, or AUTHENTICATION",
        });
      }
      updateData.category = category.toUpperCase();
    }
    if (sector !== undefined) updateData.sector = sector || null;
    if (template_category !== undefined) updateData.template_category = template_category || null;

    const currentCategory = (category || template.category || "").toUpperCase();
    const isAuthenticationCategory = currentCategory === "AUTHENTICATION";

    if (message_body !== undefined) {
      updateData.message_body = isAuthenticationCategory ? "" : message_body;
      if (message_body) {
        const extractedVariables = extractVariables(message_body);
        const bodyVariables = extractedVariables.map((v) => ({
          key: v.key,
          example: processedVariableExamples[v.key] || "example",
        }));
        updateData.body_variables = bodyVariables;
      }
    }

    if (footer_text !== undefined) updateData.footer_text = footer_text;

    if (buttons !== undefined) {
      let parsedButtons = buttons;
      if (typeof buttons === "string") {
        try {
          parsedButtons = JSON.parse(buttons);
        } catch (e) {
          parsedButtons = [];
        }
      }
      updateData.buttons = Array.isArray(parsedButtons) ? parsedButtons : [];
    }

    if (call_permission !== undefined) updateData.call_permission = call_permission;
    if (is_limited_time_offer !== undefined) updateData.is_limited_time_offer = is_limited_time_offer;
    if (offer_text !== undefined) updateData.offer_text = offer_text;
    if (has_expiration !== undefined) updateData.has_expiration = has_expiration;
    if (template_type !== undefined) updateData.template_type = template_type;

    if (carousel_cards !== undefined) {
      let parsedCarouselCards = carousel_cards;
      if (typeof carousel_cards === "string") {
        try {
          parsedCarouselCards = JSON.parse(carousel_cards);
        } catch (e) {
          parsedCarouselCards = [];
        }
      }
      updateData.carousel_cards = Array.isArray(parsedCarouselCards) ? parsedCarouselCards : [];
    }

    const uploadedFile = req.file || (req.files && req.files.file && req.files.file[0]);
    if (uploadedFile) {
      updateData.header = {
        format: "media",
        media_type: getWhatsAppTypeFromMime(uploadedFile.mimetype),
        media_url: uploadedFile.path,
        original_filename: uploadedFile.originalname,
      };
    } else if (header_text !== undefined) {
      if (header_text === null || header_text === "") {
        updateData.header = null;
      } else {
        updateData.header = {
          format: "text",
          text: header_text,
        };
      }
    }

    const cardMediaFiles = (req.files && req.files.card_media) ? (Array.isArray(req.files.card_media) ? req.files.card_media : [req.files.card_media]) : [];
    console.log("cardMediaFiles in update", cardMediaFiles);

    if (carousel_cards !== undefined && Array.isArray(carousel_cards) && carousel_cards.length > 0 && cardMediaFiles.length > 0) {
      for (let i = 0; i < cardMediaFiles.length && i < carousel_cards.length; i++) {
        const file = cardMediaFiles[i];
        const card = carousel_cards[i];

        if (card && card.components) {
          const headerComp = card.components.find((c) => (c.type || "").toLowerCase() === "header");
          if (headerComp) {
            headerComp.format = headerComp.format || getWhatsAppTypeFromMime(file.mimetype);
            headerComp.example = { header_handle: [file.path] };
            headerComp.media_url = file.path;
            headerComp.original_filename = file.originalname;
          }
        }
      }
      updateData.carousel_cards = carousel_cards;
    }

    if (isAuthenticationCategory) {
      const existingAuth = (template.authentication_options && (template.authentication_options.toObject ? template.authentication_options.toObject() : template.authentication_options)) || {};
      const authUpdates = { ...existingAuth };

      if (add_security_recommendation !== undefined) {
        authUpdates.add_security_recommendation = add_security_recommendation !== false && add_security_recommendation !== "false";
      }
      if (code_expiration_minutes !== undefined) {
        authUpdates.code_expiration_minutes = code_expiration_minutes != null ? Number(code_expiration_minutes) : undefined;
      }
      if (otp_code_length !== undefined) {
        authUpdates.otp_code_length = otp_code_length != null ? Number(otp_code_length) : 6;
      }
      if (otp_buttons !== undefined) {
        let parsedOtpButtons = otp_buttons;
        if (typeof otp_buttons === "string") {
          try {
            parsedOtpButtons = JSON.parse(otp_buttons);
          } catch (e) {
            parsedOtpButtons = [];
          }
        }
        authUpdates.otp_buttons = Array.isArray(parsedOtpButtons)
          ? parsedOtpButtons.map((btn) => {
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

    const templateComponents = [];

    if (updateData.message_body !== undefined) {
      templateComponents.push({
        type: "BODY",
        text: updateData.message_body
      });
    } else if (template.message_body) {
      templateComponents.push({
        type: "BODY",
        text: template.message_body
      });
    }

    let buttonsForDetection = [];

    if (updateData.buttons !== undefined) {
      let parsedUpdateButtons = updateData.buttons;
      if (typeof updateData.buttons === "string") {
        try {
          parsedUpdateButtons = JSON.parse(updateData.buttons);
        } catch (e) {
          console.error("Error parsing updated buttons:", e);
          parsedUpdateButtons = [];
        }
      }
      if (Array.isArray(parsedUpdateButtons) && parsedUpdateButtons.length > 0) {
        buttonsForDetection = parsedUpdateButtons;
      }
    } else if (template.buttons && Array.isArray(template.buttons) && template.buttons.length > 0) {
      buttonsForDetection = template.buttons;
    }

    if (buttonsForDetection && buttonsForDetection.length > 0) {
      const buttonComponents = buttonsForDetection.map(btn => {
        const btnType = (btn.type || "").toUpperCase();
        const component = { type: btnType, text: btn.text };

        if (btnType === "PHONE_CALL") {
          component.phone_number = btn.phone_number;
        } else if (btnType === "URL" || btnType === "WEBSITE") {
          component.url = btn.url || btn.website_url;
          if (btn.example) component.example = btn.example;
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

    const isCarouselTemplate =
      ["carousel_product", "carousel_media"].includes(updateData.template_type || template.template_type) &&
      (updateData.carousel_cards || template.carousel_cards) &&
      Array.isArray(updateData.carousel_cards || template.carousel_cards) &&
      (updateData.carousel_cards || template.carousel_cards).length >= 2 &&
      (updateData.carousel_cards || template.carousel_cards).length <= 10;

    const detectTemplateType = (components, isCarousel, isAuth, call_permission, is_limited_time_offer, offer_text, buttons, msgBody) => {
      console.log("isCarousel", isCarousel)
      if (isCarousel) {
        const cards = [];
        const hasProductHeader = false;
        return hasProductHeader ? "carousel_product" : "carousel_media";
      }

      if (isAuth) {
        return "authentication";
      }

      if (is_limited_time_offer) {
        return "limited_time_offer";
      }

      if (call_permission) {
        return "call_permission";
      }
      console.log("buttons", buttons);
      const hasCatalogButton = Array.isArray(buttons) &&
        buttons.some((btn) => (btn.type || "").toLowerCase() === "catalog");
      console.log("hasCatalogButton", hasCatalogButton);
      const hasProductMessage = (msgBody || "").toLowerCase().includes("product") ||
        (msgBody || "").toLowerCase().includes("catalog");

      if (hasCatalogButton || hasProductMessage) {
        return "catalog";
      }

      const hasCouponCode = (msgBody || "").toLowerCase().includes("coupon") ||
        (msgBody || "").toLowerCase().includes("code") ||
        (msgBody || "").toLowerCase().includes("discount");

      const hasCopyCodeButton = Array.isArray(buttons) &&
        buttons.some((btn) => (btn.type || "").toLowerCase() === "copy_code");

      if (hasCouponCode || hasCopyCodeButton) {
        return "coupon";
      }

      return "standard";
    };

    const detectedTemplateType = detectTemplateType(
      templateComponents,
      isCarouselTemplate,
      isAuthenticationCategory,
      updateData.call_permission !== undefined ? updateData.call_permission : template.call_permission,
      updateData.is_limited_time_offer !== undefined ? updateData.is_limited_time_offer : template.is_limited_time_offer,
      updateData.offer_text !== undefined ? updateData.offer_text : template.offer_text,
      buttonsForDetection,
      updateData.message_body !== undefined ? updateData.message_body : template.message_body
    );

    if (!updateData.template_type) {
      updateData.template_type = detectedTemplateType;
    }

    const updatedTemplate = await Template.findByIdAndUpdate(id, updateData, { returnDocument: 'after', runValidators: true });

    return res.status(200).json({
      success: true,
      message: "Admin template updated successfully",
      data: updatedTemplate,
    });
  } catch (error) {
    console.error("Error updating admin template:", error);
    return res.status(400).json({
      success: false,
      error: error.message || "Failed to update admin template",
    });
  }
};

export const deleteAdminTemplate = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedTemplate = await Template.findOneAndDelete({
      _id: id,
      is_admin_template: true,
      deleted_at: null,
    });

    if (!deletedTemplate) {
      return res.status(404).json({
        success: false,
        error: "Admin template not found",
      });
    }

    return res.json({
      success: true,
      message: "Admin template permanently deleted",
    });

  } catch (error) {
    console.error("Error deleting admin template:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to delete admin template",
      details: error.message,
    });
  }
};

export const bulkDeleteAdminTemplates = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Template IDs array is required and must not be empty",
      });
    }

    const validIds = ids.filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );

    if (validIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No valid template IDs provided",
      });
    }

    const deleteResult = await Template.deleteMany({
      _id: { $in: validIds },
      is_admin_template: true,
      deleted_at: null,
    });

    if (deleteResult.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        error: "No admin templates found with the provided IDs",
      });
    }

    return res.json({
      success: true,
      message: `${deleteResult.deletedCount} admin template(s) permanently deleted`,
      data: {
        deletedCount: deleteResult.deletedCount,
      },
    });

  } catch (error) {
    console.error("Error bulk deleting admin templates:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to bulk delete admin templates",
      details: error.message,
    });
  }
};

export default {
  createAdminTemplate,
  getAllAdminTemplates,
  getAdminTemplateById,
  updateAdminTemplate,
  deleteAdminTemplate,
  bulkDeleteAdminTemplates,
};
