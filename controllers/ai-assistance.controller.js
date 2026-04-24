import { AIModel, UserSetting } from '../models/index.js';
import { callAIModel } from '../utils/ai-utils.js';

const TRANSFORMATION_FEATURES = {
  TRANSLATE: 'translate',
  SUMMARIZE: 'summarize',
  IMPROVE: 'improve',
  FORMALIZE: 'formalize',
  CASUALIZE: 'casualize'
};

const REPLY_TONES = {
  PROFESSIONAL: 'professional',
  FRIENDLY: 'friendly',
  CASUAL: 'casual',
  EMPATHETIC: 'empathetic',
  CONCISE: 'concise'
};

const LANGUAGE_MAP = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  ar: 'Arabic',
  hi: 'Hindi',
  nl: 'Dutch',
  pl: 'Polish',
  tr: 'Turkish',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  cs: 'Czech',
  hu: 'Hungarian',
  ro: 'Romanian',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
  ms: 'Malay',
  he: 'Hebrew',
  uk: 'Ukrainian',
  el: 'Greek',
  bg: 'Bulgarian',
  hr: 'Croatian',
  sk: 'Slovak',
  sl: 'Slovenian',
  et: 'Estonian',
  lv: 'Latvian',
  lt: 'Lithuanian',
  ga: 'Irish',
  mt: 'Maltese',
  cy: 'Welsh'
};

const getLanguageName = (code) => {
  return LANGUAGE_MAP[code] || code;
};

const buildTransformationPrompt = (feature, message, language) => {
  const languageName = getLanguageName(language);

  const prompts = {
    [TRANSFORMATION_FEATURES.TRANSLATE]: `Translate the following message to ${languageName}. Preserve the tone and meaning. Only return the translated text without any additional commentary:\n\n${message}`,
    [TRANSFORMATION_FEATURES.SUMMARIZE]: `Summarize the following message in ${languageName}. Keep it concise and capture the key points. Only return the summary:\n\n${message}`,
    [TRANSFORMATION_FEATURES.IMPROVE]: `Improve and rewrite the following message in ${languageName}. Make it more professional, clear, and well-structured. Only return the improved text:\n\n${message}`,
    [TRANSFORMATION_FEATURES.FORMALIZE]: `Rewrite the following message in a formal, professional tone in ${languageName}. Only return the formalized text:\n\n${message}`,
    [TRANSFORMATION_FEATURES.CASUALIZE]: `Rewrite the following message in a casual, friendly tone in ${languageName}. Only return the casualized text:\n\n${message}`
  };

  return prompts[feature] || message;
};


const buildReplySuggestionPrompt = (conversation, tone) => {
  let conversationText;

  if (Array.isArray(conversation)) {
    conversationText = conversation
      .map(msg => `${msg.role || 'user'}: ${msg.content || msg.message || ''}`)
      .join('\n');
  } else {
    conversationText = conversation;
  }

  return `Based on the following conversation, suggest a ${tone} reply. Keep it brief, natural, and appropriate. Only return the suggested reply text without any labels or prefixes:\n\n${conversationText}`;
};

export const transformMessage = async (req, res) => {
  try {
    const { message, language, feature } = req.body;
    const userId = req.user.id;

    if (!message || !language || !feature) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: message, language, feature'
      });
    }

    const userSettings = await UserSetting.findOne({ user_id: userId });

    if (!userSettings || !userSettings.ai_model || !userSettings.api_key) {
      return res.status(400).json({
        success: false,
        message: 'Please select model and add API key in settings'
      });
    }

    const { ai_model: modelId, api_key: apiKey } = userSettings;

    const validFeatures = Object.values(TRANSFORMATION_FEATURES);
    if (!validFeatures.includes(feature)) {
      return res.status(400).json({
        success: false,
        message: `Invalid feature. Must be one of: ${validFeatures.join(', ')}`
      });
    }

    if (message.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message cannot be empty'
      });
    }

    const aiModel = await AIModel.findOne({
      _id: modelId,
      status: 'active',
      deleted_at: null
    });

    if (!aiModel) {
      return res.status(404).json({
        success: false,
        message: 'AI model not found or inactive'
      });
    }

    if (!aiModel.capabilities[feature]) {
      return res.status(400).json({
        success: false,
        message: `This model does not support the '${feature}' feature`
      });
    }

    const prompt = buildTransformationPrompt(feature, message, language);

    const transformedMessage = await callAIModel(userId, aiModel, apiKey, prompt);

    return res.json({
      success: true,
      data: {
        original: message,
        transformed: transformedMessage.trim(),
        feature,
        language,
        languageName: getLanguageName(language),
        modelUsed: aiModel.display_name,
        modelId: aiModel.model_id
      }
    });
  } catch (error) {
    console.error('Transform message error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to transform message',
      error: error.message
    });
  }
};


export const suggestReply = async (req, res) => {
  try {
    const { conversation, tone, count = 3 } = req.body;
    const userId = req.user.id;

    if (!conversation) {
      return res.status(400).json({
        success: false,
        message: 'conversation is required'
      });
    }

    const userSettings = await UserSetting.findOne({ user_id: userId });

    if (!userSettings || !userSettings.ai_model || !userSettings.api_key) {
      return res.status(400).json({
        success: false,
        message: 'Please select model and add API key in settings'
      });
    }

    const { ai_model: modelId, api_key: apiKey } = userSettings;

    const validTones = Object.values(REPLY_TONES);
    const selectedTone = tone || REPLY_TONES.FRIENDLY;

    if (!validTones.includes(selectedTone)) {
      return res.status(400).json({
        success: false,
        message: `Invalid tone. Must be one of: ${validTones.join(', ')}`
      });
    }

    const aiModel = await AIModel.findOne({
      _id: modelId,
      status: 'active',
      deleted_at: null
    });

    if (!aiModel) {
      return res.status(404).json({
        success: false,
        message: 'AI model not found or inactive'
      });
    }

    if (!aiModel.capabilities.reply_suggestion) {
      return res.status(400).json({
        success: false,
        message: 'This model does not support reply suggestions'
      });
    }

    const numSuggestions = Math.min(Math.max(1, count), 5);

    let conversationText;
    if (Array.isArray(conversation)) {
      conversationText = conversation
        .map(msg => `${msg.role || 'user'}: ${msg.content || msg.message || ''}`)
        .join('\n');
    } else {
      conversationText = conversation;
    }

    const prompt = `Based on the following conversation, suggest ${numSuggestions} different ${selectedTone} replies. Return ONLY a JSON array with ${numSuggestions} replies. No explanations or additional text:

Conversation:
${conversationText}

Return format:
[
  "First suggested reply...",
  "Second suggested reply...",
  "Third suggested reply..."
]

Rules:
- Keep each reply brief, natural, and appropriate
- Ensure all replies are in ${selectedTone} tone
- Return exactly ${numSuggestions} replies`;

    const aiResponse = await callAIModel(userId, aiModel, apiKey, prompt);

    let suggestions;
    try {
      const parsedResponse = JSON.parse(aiResponse);
      if (Array.isArray(parsedResponse)) {
        suggestions = parsedResponse.map(reply => reply.toString().trim()).filter(reply => reply.length > 0);
      } else {
        suggestions = [aiResponse.toString().trim()];
      }
    } catch (parseError) {
      const matches = aiResponse.match(/\[(.*?)\]/s);
      if (matches) {
        try {
          const extractedArray = JSON.parse(matches[0]);
          if (Array.isArray(extractedArray)) {
            suggestions = extractedArray.map(reply => reply.toString().trim()).filter(reply => reply.length > 0);
          } else {
            suggestions = [aiResponse.toString().trim()];
          }
        } catch {
          suggestions = [aiResponse.toString().trim()];
        }
      } else {
        suggestions = aiResponse.split('\n')
          .map(line => line.replace(/^\d+[.]\s*/, '').trim())
          .filter(reply => reply.length > 0 && !reply.includes('[') && !reply.includes(']'));

        if (suggestions.length === 0) {
          suggestions = [aiResponse.toString().trim()];
        }
      }
    }

    if (suggestions.length === 0) {
      suggestions = [aiResponse.toString().trim()];
    }

    suggestions = suggestions.slice(0, numSuggestions);

    return res.json({
      success: true,
      data: {
        suggestedReplies: suggestions,
        tone: selectedTone,
        modelUsed: aiModel.display_name,
        modelId: aiModel.model_id,
        count: suggestions.length
      }
    });
  } catch (error) {
    console.error('Suggest reply error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to suggest reply',
      error: error.message
    });
  }
};


export const getSupportedLanguages = async (req, res) => {
  try {
    const languages = Object.entries(LANGUAGE_MAP).map(([code, name]) => ({
      code,
      name
    }));

    return res.json({
      success: true,
      data: {
        languages,
        totalCount: languages.length
      }
    });
  } catch (error) {
    console.error('Get supported languages error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch supported languages',
      error: error.message
    });
  }
};

export default {
  transformMessage,
  suggestReply,
  getSupportedLanguages
};
