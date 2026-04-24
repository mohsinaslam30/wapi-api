export const transformMessage = async (req, res) => {
  const { message, language, aiModel, apiKey, feature } = req.body;

  try {
    if (!message || !language || !aiModel || !apiKey || !feature) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: message, language, aiModel, apiKey, feature'
      });
    }

    const validFeatures = ['translate', 'summarize', 'improve', 'formalize', 'casualize'];
    if (!validFeatures.includes(feature)) {
      return res.status(400).json({
        success: false,
        message: `Invalid feature. Must be one of: ${validFeatures.join(', ')}`
      });
    }

    const validModels = ['gemini-1.5-pro', 'gemini-1.5-flash', 'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];
    if (!validModels.includes(aiModel)) {
      return res.status(400).json({
        success: false,
        message: `Invalid AI model. Must be one of: ${validModels.join(', ')}`
      });
    }

    let prompt = '';
    const languageName = getLanguageName(language);

    switch (feature) {
      case 'translate':
        prompt = `Translate the following message to ${languageName}. Preserve the tone and meaning:\n\n${message}`;
        break;
      case 'summarize':
        prompt = `Summarize the following message in ${languageName}. Keep it concise:\n\n${message}`;
        break;
      case 'improve':
        prompt = `Improve and rewrite the following message in ${languageName}. Make it more professional and clear:\n\n${message}`;
        break;
      case 'formalize':
        prompt = `Rewrite the following message in a formal tone in ${languageName}:\n\n${message}`;
        break;
      case 'casualize':
        prompt = `Rewrite the following message in a casual, friendly tone in ${languageName}:\n\n${message}`;
        break;
    }

    let transformedMessage = '';

    if (aiModel.startsWith('gemini')) {
      transformedMessage = await callGemini(apiKey, aiModel, prompt);
    } else if (aiModel.startsWith('claude')) {
      transformedMessage = await callClaude(apiKey, aiModel, prompt);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported AI model'
      });
    }

    res.json({
      success: true,
      data: {
        original: message,
        transformed: transformedMessage,
        feature,
        language
      }
    });

  } catch (error) {
    console.error('Transform message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to transform message',
      error: error.message
    });
  }
};

export const suggestReply = async (req, res) => {
  const { conversation, aiModel, apiKey, tone } = req.body;

  try {
    if (!conversation || !aiModel || !apiKey) {
      return res.status(400).json({
        success: false,
        message: 'conversation, aiModel, and apiKey are required'
      });
    }

    const validTones = ['professional', 'friendly', 'casual', 'empathetic', 'concise'];
    const selectedTone = tone || 'friendly';

    if (!validTones.includes(selectedTone)) {
      return res.status(400).json({
        success: false,
        message: `Invalid tone. Must be one of: ${validTones.join(', ')}`
      });
    }

    const validModels = ['gemini-1.5-pro', 'gemini-1.5-flash', 'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'];
    if (!validModels.includes(aiModel)) {
      return res.status(400).json({
        success: false,
        message: `Invalid AI model. Must be one of: ${validModels.join(', ')}`
      });
    }

    const conversationText = Array.isArray(conversation)
      ? conversation.map(msg => `${msg.role || 'user'}: ${msg.content || msg.message}`).join('\n')
      : conversation;

    const prompt = `Based on the following conversation, suggest a ${selectedTone} reply. Keep it brief and appropriate:\n\n${conversationText}\n\nSuggested reply:`;

    let suggestedReply = '';

    if (aiModel.startsWith('gemini')) {
      suggestedReply = await callGemini(apiKey, aiModel, prompt);
    } else if (aiModel.startsWith('claude')) {
      suggestedReply = await callClaude(apiKey, aiModel, prompt);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Unsupported AI model'
      });
    }

    res.json({
      success: true,
      data: {
        suggestedReply: suggestedReply.trim(),
        tone: selectedTone
      }
    });

  } catch (error) {
    console.error('Suggest reply error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to suggest reply',
      error: error.message
    });
  }
};

function getLanguageName(code) {
  const languages = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'nl': 'Dutch',
    'pl': 'Polish',
    'tr': 'Turkish',
    'sv': 'Swedish',
    'da': 'Danish',
    'no': 'Norwegian',
    'fi': 'Finnish',
    'cs': 'Czech',
    'hu': 'Hungarian',
    'ro': 'Romanian',
    'th': 'Thai',
    'vi': 'Vietnamese',
    'id': 'Indonesian',
    'ms': 'Malay',
    'he': 'Hebrew',
    'uk': 'Ukrainian',
    'el': 'Greek',
    'bg': 'Bulgarian',
    'hr': 'Croatian',
    'sk': 'Slovak',
    'sl': 'Slovenian',
    'et': 'Estonian',
    'lv': 'Latvian',
    'lt': 'Lithuanian',
    'ga': 'Irish',
    'mt': 'Maltese',
    'cy': 'Welsh'
  };
  return languages[code] || code;
}

async function callGemini(apiKey, model, prompt) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Gemini API error');
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
}

async function callClaude(apiKey, model, prompt) {
  const modelMap = {
    'claude-3-opus': 'claude-3-opus-20240229',
    'claude-3-sonnet': 'claude-3-sonnet-20240229',
    'claude-3-haiku': 'claude-3-haiku-20240307'
  };

  const claudeModel = modelMap[model] || model;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: claudeModel,
      max_tokens: 1000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Claude API error');
  }

  const data = await response.json();
  return data.content?.[0]?.text || "";
}

export default {
  transformMessage,
  suggestReply
};
