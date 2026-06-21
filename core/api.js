// core/api.js
// imports: getData from './storage.js'

import { getData } from './storage.js';

const CHAT_PATH = '/v1/chat/completions';
const MODELS_PATH = '/v1/models';
const DEFAULT_TIMEOUT = 60000;

function notifyApiError(message) {
  try {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(message);
      return;
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('api:error', { detail: message }));
    }
  } catch (error) {
    console.warn(message, error);
  }
}

function normalizeEndpointUrl(endpoint) {
  return String(endpoint || '').trim().replace(/\/+$/, '');
}

function getSettings() {
  const settings = getData('app_settings') || {};

  return {
    defaultApiEndpointId: settings.defaultApiEndpointId || '',
    defaultModel: settings.defaultModel || '',
    apiEndpoints: Array.isArray(settings.apiEndpoints)
      ? settings.apiEndpoints
      : Array.isArray(settings.endpoints)
        ? settings.endpoints
        : Array.isArray(settings.endpointsList)
          ? settings.endpointsList
          : [],
    ...settings
  };
}

function findEndpoint(endpointId) {
  const settings = getSettings();
  const targetId = endpointId || settings.defaultApiEndpointId;
  const endpoints = settings.apiEndpoints || [];
  const endpoint = endpoints.find((item) => item.id === targetId) || endpoints[0] || null;

  if (!endpoint || !endpoint.endpoint) {
    throw new Error('请先配置 API 端点');
  }

  return {
    id: endpoint.id || '',
    name: endpoint.name || '',
    endpoint: normalizeEndpointUrl(endpoint.endpoint),
    apiKey: endpoint.apiKey || '',
    model: endpoint.model || settings.defaultModel || '',
    modelList: Array.isArray(endpoint.modelList) ? endpoint.modelList : []
  };
}

function createTimeoutController(timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => {
    controller.abort();
  }, timeout);

  return { controller, timer };
}

function buildHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

function buildMessages(messages = [], systemPrompt = '') {
  const normalizedMessages = Array.isArray(messages) ? messages.filter(Boolean) : [];

  if (!systemPrompt) {
    return normalizedMessages;
  }

  return [
    {
      role: 'system',
      content: systemPrompt
    },
    ...normalizedMessages
  ];
}

function getErrorMessage(status) {
  if (status === 401) {
    return 'API Key 无效或已过期';
  }

  if (status === 429) {
    return '请求太频繁，请稍后再试';
  }

  if (status >= 500) {
    return 'AI 服务暂时不可用';
  }

  if (status >= 400) {
    return '请求失败，请检查 API 配置';
  }

  return '网络连接失败';
}

async function parseErrorResponse(response) {
  try {
    const data = await response.json();
    const detail = data?.error?.message || data?.message || '';
    const message = detail ? `${getErrorMessage(response.status)}：${detail}` : getErrorMessage(response.status);

    return message;
  } catch (error) {
    return getErrorMessage(response.status);
  }
}

function extractThinkingFromText(text) {
  if (!text) {
    return {
      content: '',
      thinking: ''
    };
  }

  let thinking = '';
  const content = String(text).replace(/<thinking>([\s\S]*?)<\/thinking>/gi, (match, innerText) => {
    thinking += innerText.trim();
    return '';
  });

  return {
    content,
    thinking
  };
}

function parseStreamPayload(payload) {
  if (!payload || payload === '[DONE]') {
    return {
      done: payload === '[DONE]',
      content: '',
      thinking: '',
      raw: null
    };
  }

  try {
    const data = JSON.parse(payload);
    const choice = data.choices?.[0] || {};
    const delta = choice.delta || {};
    const message = choice.message || {};
    const text = delta.content || message.content || '';
    const reasoning = delta.reasoning_content || message.reasoning_content || '';
    const extracted = extractThinkingFromText(text);

    return {
      done: Boolean(choice.finish_reason),
      content: extracted.content,
      thinking: [reasoning, extracted.thinking].filter(Boolean).join('\n'),
      raw: data
    };
  } catch (error) {
    return {
      done: false,
      content: '',
      thinking: '',
      raw: null
    };
  }
}

async function readStream(response, callbacks) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullContent = '';
  let fullThinking = '';

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine || !trimmedLine.startsWith('data:')) {
        continue;
      }

      const payload = trimmedLine.replace(/^data:\s*/, '');
      const chunk = parseStreamPayload(payload);

      if (chunk.content) {
        fullContent += chunk.content;
      }

      if (chunk.thinking) {
        fullThinking += fullThinking ? `\n${chunk.thinking}` : chunk.thinking;
      }

      if (chunk.content || chunk.thinking) {
        callbacks.onChunk?.({
          content: chunk.content,
          thinking: chunk.thinking,
          raw: chunk.raw,
          done: false
        });
      }

      if (chunk.done) {
        callbacks.onDone?.({
          content: fullContent,
          thinking: fullThinking
        });
        return;
      }
    }
  }

  callbacks.onDone?.({
    content: fullContent,
    thinking: fullThinking
  });
}

export async function streamMessage({
  messages = [],
  systemPrompt = '',
  endpointId = '',
  model = '',
  onChunk,
  onDone,
  onError,
  timeout = DEFAULT_TIMEOUT
} = {}) {
  const { controller, timer } = createTimeoutController(timeout);

  try {
    const endpointConfig = findEndpoint(endpointId);
    const requestModel = model || endpointConfig.model;

    if (!requestModel) {
      throw new Error('请先选择模型');
    }

    const response = await fetch(`${endpointConfig.endpoint}${CHAT_PATH}`, {
      method: 'POST',
      headers: buildHeaders(endpointConfig.apiKey),
      signal: controller.signal,
      body: JSON.stringify({
        model: requestModel,
        messages: buildMessages(messages, systemPrompt),
        stream: true
      })
    });

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }

    if (!response.body) {
      throw new Error('当前浏览器不支持流式响应');
    }

    await readStream(response, { onChunk, onDone });

    return true;
  } catch (error) {
    const message = error.name === 'AbortError' ? '网络超时，请稍后重试' : error.message || 'AI 请求失败';

    notifyApiError(message);
    onError?.(error);

    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

export async function silentRequest({
  prompt = '',
  messages = [],
  systemPrompt = '',
  endpointId = '',
  model = '',
  timeout = DEFAULT_TIMEOUT
} = {}) {
  const { controller, timer } = createTimeoutController(timeout);

  try {
    const endpointConfig = findEndpoint(endpointId);
    const requestModel = model || endpointConfig.model;

    if (!requestModel) {
      throw new Error('请先选择模型');
    }

    const requestMessages = messages.length
      ? buildMessages(messages, systemPrompt)
      : buildMessages([{ role: 'user', content: prompt }], systemPrompt);

    const response = await fetch(`${endpointConfig.endpoint}${CHAT_PATH}`, {
      method: 'POST',
      headers: buildHeaders(endpointConfig.apiKey),
      signal: controller.signal,
      body: JSON.stringify({
        model: requestModel,
        messages: requestMessages,
        stream: false
      })
    });

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    const extracted = extractThinkingFromText(content);

    return extracted.content.trim();
  } catch (error) {
    const message = error.name === 'AbortError' ? '网络超时，请稍后重试' : error.message || '后台请求失败';

    notifyApiError(message);

    return '';
  } finally {
    window.clearTimeout(timer);
  }
}

export async function fetchModels(endpointId, timeout = DEFAULT_TIMEOUT) {
  const { controller, timer } = createTimeoutController(timeout);

  try {
    const endpointConfig = findEndpoint(endpointId);
    const response = await fetch(`${endpointConfig.endpoint}${MODELS_PATH}`, {
      method: 'GET',
      headers: buildHeaders(endpointConfig.apiKey),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }

    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data : [];

    return models
      .map((item) => item.id)
      .filter(Boolean);
  } catch (error) {
    const message = error.name === 'AbortError' ? '拉取模型超时' : error.message || '拉取模型失败';

    notifyApiError(message);

    return [];
  } finally {
    window.clearTimeout(timer);
  }
}

// depends: ./storage.js getData
