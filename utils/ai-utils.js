import { AiPromptLog } from '../models/index.js'

const getNestedValue = (obj, path) => {
  return path.split('.').reduce((current, key) => current?.[key], obj);
};


const formatRequestBody = (model, prompt) => {
  const { provider, model_id, config } = model;
  const safeConfig = config || {};
  console.log("provider", provider, model_id, safeConfig)
  switch (provider) {
    case 'anthropic':
      return {
        model: model_id,
        max_tokens: safeConfig.max_tokens || 1024,
        messages: [{ role: 'user', content: prompt }]
      };

    case 'google':
      return {
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: safeConfig.temperature ?? 0.7,
          maxOutputTokens: safeConfig.max_tokens ?? 1024,
          topP: safeConfig.top_p ?? 0.95
        }
      };

    case 'openai':
    default:
      return {
        model: model_id,
        messages: [{ role: 'user', content: prompt }],
        temperature: safeConfig.temperature ?? 0.7,
        max_tokens: safeConfig.max_tokens || 1024,
        top_p: safeConfig.top_p ?? 1,
        frequency_penalty: safeConfig.frequency_penalty ?? 0,
        presence_penalty: safeConfig.presence_penalty ?? 0
      };
  }
};


const formatRequestHeaders = (model, apiKey) => {
  const { provider, api_version, headers_template } = model;
  const headers = {
    'Content-Type': 'application/json'
  };

  if (headers_template && Object.keys(headers_template).length > 0) {
    Object.entries(headers_template).forEach(([key, value]) => {
      if (typeof key !== 'string' || key.startsWith('$')) {
        return;
      }

      let headerValue = value;
      if (typeof headerValue === 'string') {
        headerValue = headerValue.replace('{{API_KEY}}', apiKey);
      }

      if (typeof headerValue === 'string' && headerValue.trim() !== '') {
        headers[key] = headerValue;
      }
    });

    if (headers['Authorization'] || headers['x-api-key'] || headers['x-goog-api-key']) {
      return headers;
    }
  }

  switch (provider) {
    case 'anthropic':
      if (!headers['x-api-key'] && typeof apiKey === 'string') {
        headers['x-api-key'] = apiKey;
      }
      if (typeof api_version === 'string') {
        headers['anthropic-version'] = api_version || '2023-06-01';
      }
      break;

    case 'google':
      if (headers_template && headers_template['x-goog-api-key'] && typeof apiKey === 'string') {
        headers['x-goog-api-key'] = apiKey;
      }
      break;

    case 'openai':
    case 'groq':
    case 'mistral':
    default:
      if (!headers['Authorization'] && typeof apiKey === 'string') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      break;
  }

  return headers;
};


const buildApiEndpoint = (model, apiKey) => {
  let { api_endpoint, provider, model_id } = model;

  if (provider === 'google') {
    let url = api_endpoint || 'https://generativelanguage.googleapis.com/v1/models';

    if (url.includes('v1beta') && (model_id.includes('gemini-1.5') || model_id.includes('gemini-2.'))) {
      url = url.replace('v1beta', 'v1');
    }

    if (url.endsWith('/models') || url.endsWith('/v1') || url.endsWith('/v1beta')) {
        const baseUrl = url.endsWith('/models') ? url : `${url.replace(/\/$/, '')}/models`;
        url = `${baseUrl}/${model_id}:generateContent`;
    } else if (!url.includes(':generateContent')) {
        if (url.endsWith(model_id)) {
            url = `${url}:generateContent`;
        } else if (!url.includes('/models/')) {
            url = `${url.replace(/\/$/, '')}/models/${model_id}:generateContent`;
        }
    }

    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}key=${apiKey}`;
  }

  return api_endpoint;
};


const callAIModel = async (userId, model, apiKey, prompt) => {
  const requestBody = formatRequestBody(model, prompt);
  console.log('Generated Request Body:', JSON.stringify(requestBody, null, 2));
  const requestHeaders = formatRequestHeaders(model, apiKey);


  const apiEndpoint = buildApiEndpoint(model, apiKey);

  const response = await fetch(apiEndpoint, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message ||
      errorData.message ||
      `API request failed with status ${response.status}`
    );
  }

  const data = await response.json();

  let responseText;
  if (model.provider === 'google') {
    const parts = data.candidates?.[0]?.content?.parts || [];
    responseText = parts.map(part => part.text).join('');

    if (!responseText) {
      throw new Error('Unable to extract response from Google AI model');
    }
  } else {
    responseText = getNestedValue(data, model.response_path);

    if (!responseText) {
      throw new Error('Unable to extract response from AI model');
    }
  }

  try {
    await AiPromptLog.create({
      user_id: userId,
      feature: 'ai_prompts'
    });
  } catch (err) {
    console.error('AI log failed:', err);
  }

  return responseText;
};


const testAIModel = async (model, prompt, apiKey) => {

  if (!apiKey) {
    throw new Error('API key not found in model configuration');
  }

  return await callAIModel(model, apiKey, prompt);
};

export {
  getNestedValue,
  formatRequestBody,
  formatRequestHeaders,
  buildApiEndpoint,
  callAIModel,
  testAIModel
};
