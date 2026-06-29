import { AIModel } from "../models/index.js";
import { testAIModel } from "../utils/ai-utils.js";
import mongoose from 'mongoose';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 10;
const DEFAULT_SORT_FIELD = "created_at";
const DEFAULT_SORT_ORDER = -1;
const MAX_LIMIT = 100;

const ALLOWED_SORT_FIELDS = ["_id", "name", "display_name", "provider", "model_id", "status", "is_default", "created_at", "updated_at"];

const SORT_ORDER = {
  ASC: 1,
  DESC: -1,
};

const PROVIDERS = ["openai", "anthropic", "google", "groq", "mistral"];

const parsePaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.page) || DEFAULT_PAGE);
  const limit = Math.max(1, Math.min(MAX_LIMIT, parseInt(query.limit) || DEFAULT_LIMIT));
  const skip = (page - 1) * limit;

  return { page, limit, skip };
};

const parseSortParams = (query) => {
  const sortField = ALLOWED_SORT_FIELDS.includes(query.sort_by) ? query.sort_by : DEFAULT_SORT_FIELD;

  const sortOrder = query.sort_order?.toUpperCase() === "ASC" ? SORT_ORDER.ASC : SORT_ORDER.DESC;

  return { sortField, sortOrder };
};

const buildSearchQuery = (searchTerm) => {
  if (!searchTerm || searchTerm.trim() === "") {
    return {};
  }

  const sanitizedSearch = searchTerm.trim();

  return {
    $or: [{ name: { $regex: sanitizedSearch, $options: "i" } }, { display_name: { $regex: sanitizedSearch, $options: "i" } }, { model_id: { $regex: sanitizedSearch, $options: "i" } }, { description: { $regex: sanitizedSearch, $options: "i" } }],
  };
};

export const getAllModels = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaginationParams(req.query);
    const { sortField, sortOrder } = parseSortParams(req.query);
    const searchTerm = req.query.search || "";
    const { provider, capability, status, is_default } = req.query;

    let baseQuery = {
      deleted_at: null,
    };

    const searchQuery = buildSearchQuery(searchTerm);

    if (provider && PROVIDERS.includes(provider.toLowerCase())) {
      baseQuery.provider = provider.toLowerCase();
    }

    if (capability) {
      baseQuery[`capabilities.${capability}`] = true;
    }

    if (status && ["active", "inactive"].includes(status)) {
      baseQuery.status = status;
    }

    if (is_default !== undefined) {
      baseQuery.is_default = is_default === "true";
    }

    const finalQuery = {
      ...baseQuery,
      ...searchQuery,
    };

    const totalCount = await AIModel.countDocuments(finalQuery);

    const models = await AIModel.find(finalQuery)
      .select("-deleted_at -created_by")
      .sort({ [sortField]: sortOrder, is_default: -1, display_name: 1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        models,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalCount / limit),
          totalItems: totalCount,
          itemsPerPage: limit
        },
      },
    });
  } catch (error) {
    console.error("Get all models error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch models",
      error: error.message,
    });
  }
};

export const getModelById = async (req, res) => {
  try {
    console.log("req.params", req.params);
    const { id } = req.params;

    const model = await AIModel.findOne({
      _id: id,
      deleted_at: null,
    })
      .select("-deleted_at -created_by")
      .lean();

    if (!model) {
      return res.status(404).json({
        success: false,
        message: "Model not found",
      });
    }

    return res.json({
      success: true,
      data: model,
    });
  } catch (error) {
    console.error("Get model by ID error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch model details",
      error: error.message,
    });
  }
};

export const createModel = async (req, res) => {
  try {
    const { displayName, provider, modelId, apiEndpoint, apiVersion, capabilities, config, headersTemplate, requestFormat, responsePath, description } = req.body;

    if (!displayName || !provider || !modelId || !apiEndpoint) {
      return res.status(400).json({
        success: false,
        message: "displayName, provider, modelId, and apiEndpoint are required",
      });
    }

    const existingModel = await AIModel.findOne({
      model_id: modelId,
      deleted_at: null,
    });

    if (existingModel) {
      return res.status(409).json({
        success: false,
        message: "Model with this name already exists",
      });
    }

    const newModel = await AIModel.create({
      display_name: displayName.trim(),
      provider: provider.toLowerCase(),
      model_id: modelId.trim(),
      api_endpoint: apiEndpoint.trim(),
      api_version: apiVersion || null,
      capabilities: capabilities || {},
      config: config || {},
      headers_template: headersTemplate ? new Map(Object.entries(headersTemplate)) : new Map(),
      request_format: requestFormat || "openai",
      response_path: responsePath || "choices.0.message.content",
      description: description || "",
      // created_by: req.user.id
    });

    return res.status(201).json({
      success: true,
      message: "AI model created successfully",
      data: newModel,
    });
  } catch (error) {
    console.error("Create model error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create AI model",
      error: error.message,
    });
  }
};

export const updateModel = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const model = await AIModel.findOne({
      _id: id,
      deleted_at: null,
    });

    if (!model) {
      return res.status(404).json({
        success: false,
        message: "Model not found",
      });
    }

    const allowedUpdates = ["display_name", "api_endpoint", "api_version", "capabilities", "config", "headers_template", "request_format", "response_path", "status", "is_default", "description"];

    const fieldMapping = {
      displayName: "display_name",
      modelId: "model_id",
      headersTemplate: "headers_template",
      apiKey: "api_key"
    };

    allowedUpdates.forEach((field) => {
      if (updateData[field] !== undefined) {
        if (field === "headers_template") {
          model[field] = new Map(Object.entries(updateData[field]));
        } else {
          model[field] = updateData[field];
        }
      }
      const camelCaseField = Object.keys(fieldMapping).find(key => fieldMapping[key] === field);
      if (camelCaseField && updateData[camelCaseField] !== undefined) {
        if (field === "headers_template") {
          model[field] = new Map(Object.entries(updateData[camelCaseField]));
        } else {
          model[field] = updateData[camelCaseField];
        }
      }
    });

    await model.save();

    return res.json({
      success: true,
      message: "AI model updated successfully",
      data: model,
    });
  } catch (error) {
    console.error("Update model error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update AI model",
      error: error.message,
    });
  }
};

const validateAndFilterIds = (ids) => {
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return {
            isValid: false,
            message: 'FAQ IDs array is required and must not be empty',
            validIds: []
        };
    }

    const validIds = ids.filter(id => mongoose.Types.ObjectId.isValid(id));

    if (validIds.length === 0) {
        return {
            isValid: false,
            message: 'No valid FAQ IDs provided',
            validIds: []
        };
    }

    return {
        isValid: true,
        validIds
    };
};

export const bulkDeleteModels = async (req, res) => {
  try {
    const { ids } = req.body;

    const validation = validateAndFilterIds(ids);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    const { validIds } = validation;

    const existingModels = await AIModel.find({
      _id: { $in: validIds },
    }).select("_id");

    if (existingModels.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No AI models found with the provided IDs",
      });
    }

    const foundIds = existingModels.map((m) => m._id.toString());
    const notFoundIds = validIds.filter((id) => !foundIds.includes(id.toString()));

    const result = await AIModel.deleteMany({
      _id: { $in: foundIds },
    });

    const response = {
      success: true,
      message: `${result.deletedCount} AI model(s) deleted successfully`,
      data: {
        deletedCount: result.deletedCount,
        deletedIds: foundIds,
      },
    };

    if (notFoundIds.length > 0) {
      response.data.notFoundIds = notFoundIds;
      response.message += `, ${notFoundIds.length} model(s) not found`;
    }

    return res.status(200).json(response);
  } catch (error) {
    console.error("Bulk delete model error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete AI models",
      error: error.message,
    });
  }
};

export const toggleModelStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !["active", "inactive"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Valid status (active/inactive) is required",
      });
    }

    const model = await AIModel.findOne({
      _id: id,
      deleted_at: null,
    });

    if (!model) {
      return res.status(404).json({
        success: false,
        message: "Model not found",
      });
    }

    model.status = status;
    await model.save();

    return res.json({
      success: true,
      message: `Model ${status === "active" ? "activated" : "deactivated"} successfully`,
      data: {
        name: model.name,
        status: model.status,
      },
    });
  } catch (error) {
    console.error("Toggle model status error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to toggle model status",
      error: error.message,
    });
  }
};

export const testModelApi = async (req, res) => {
  try {
    const { modelId, prompt, apiKey } = req.body;

    if (!modelId || !prompt || !apiKey) {
      return res.status(400).json({
        success: false,
        message: "modelId , apiKey and prompt are required",
      });
    }

    const model = await AIModel.findOne({
      _id: modelId,
      deleted_at: null,
    }).lean();

    if (!model) {
      return res.status(404).json({
        success: false,
        message: "AI Model not found",
      });
    }

    const cleanModel = {
      provider: model.provider,
      api_version: model.api_version,
      headers_template: model.headers_template,
      api_endpoint: model.api_endpoint,
      model_id: model.model_id,
      request_format: model.request_format,
      response_path: model.response_path,
      config: model.config,
    };

    const result = await testAIModel(cleanModel, prompt, apiKey);

    return res.json({
      success: true,
      data: {
        response: result,
        model: model.display_name,
        provider: model.provider,
      },
    });
  } catch (error) {
    console.error("Test model API error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to test AI model",
      error: error.message,
    });
  }
};

export default {
  getAllModels,
  getModelById,
  createModel,
  updateModel,
  bulkDeleteModels,
  toggleModelStatus,
  testModelApi,
};
