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
  let url = String(endpoint || '').trim().replace(/\/+$/, '');

  if (url.endsWith('/v1')) {
    url = url.slice(0, -3);
  }

  return url;
}

function getSettings() {
  const settings = getData('app_settings') || {};
  const apiEndpoints = Array.isArray(settings.apiEndpoints) ? settings.apiEndpoints : [];

  return {
    defaultApiEndpointId: settings.defaultApiEndpointId || '',
    defaultModel: settings.defaultModel || '',
    ttsGlobal: settings.ttsGlobal || {
      provider: 'openai',
      apiKey: '',
      endpoint: ''
    },
    mcpServers: Array.isArray(settings.mcpServers) ? settings.mcpServers : [],
    bubbleMode: settings.bubbleMode === 'dialog' ? 'dialog' : 'bubble',
    fontSize: Number(settings.fontSize) || 15,
    user: settings.user || {
      name: '',
      avatar: ''
    },
    widgets: settings.widgets || {
      time: true,
      weather: true,
      anniversary: true
    },
    apiEndpoints
  };
}

function findEndpoint(endpointId = '') {
  const settings = getSettings();
  const targetId = endpointId || settings.defaultApiEndpointId;
  const endpoint = settings.apiEndpoints.find((item) => item.id === targetId) || settings.apiEndpoints[0] || null;

  if (!endpoint || !endpoint.endpoint) {
    throw new Error('请先配置 API 端点');
  }

  const normalizedEndpoint = normalizeEndpointUrl(endpoint.endpoint);

  if (!/^https?:\/\//i.test(normalizedEndpoint)) {
    throw new Error('API 端点必须以 http 或 https 开头');
  }

  return {
    id: endpoint.id || '',
    name: endpoint.name || '',
    endpoint: normalizedEndpoint,
    apiKey: endpoint.apiKey || '',
    model: endpoint.model || settings.defaultModel || '',
    modelList: Array.isArray(endpoint.modelList) ? endpoint.modelList : []
  };
}

function createTimeoutController(timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, Number(timeout) || DEFAULT_TIMEOUT);

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

function normalizeMessage(message) {
  if (!message || typeof message !== 'object') {
    return null;
  }

  const role = ['system', 'user', 'assistant'].includes(message.role) ? message.role : 'user';
  const content = typeof message.content === 'string' ? message.content : '';

  if (!content.trim()) {
    return null;
  }

  return { role, content };
}

function buildMessages(messages = [], systemPrompt = '') {
  const normalizedMessages = Array.isArray(messages)
    ? messages.map(normalizeMessage).filter(Boolean)
    : [];

  if (!systemPrompt || !String(systemPrompt).trim()) {
    return normalizedMessages;
  }

  return [
    {
      role: 'system',
      content: String(systemPrompt)
    },
    ...normalizedMessages
  ];
}

function buildRequestBody({ messages, systemPrompt, model, stream, temperature, maxTokens }) {
  const body = {
    model,
    messages: buildMessages(messages, systemPrompt),
    stream
  };

  if (typeof temperature === 'number' && Number.isFinite(temperature)) {
    body.temperature = temperature;
  }

  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
    body.max_tokens = maxTokens;
  }

  return body;
}

function getErrorMessage(status) {
  if (status === 400) {
    return '请求格式有误，请检查模型和消息内容';
  }

  if (status === 401) {
    return 'API Key 无效或已过期';
  }

  if (status === 403) {
    return '当前 API Key 没有访问权限';
  }

  if (status === 404) {
    return 'API 地址不正确，请检查端点';
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
    return detail ? `${getErrorMessage(response.status)}：${detail}` : getErrorMessage(response.status);
  } catch (error) {
    return getErrorMessage(response.status);
  }
}

function normalizeApiError(error, fallbackMessage) {
  if (error.name === 'AbortError') {
    return '网络超时，请稍后重试';
  }

  if (!navigator.onLine) {
    return '网络已断开，请检查连接';
  }

  return error.message || fallbackMessage;
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
    const cleanInnerText = String(innerText || '').trim();

    if (cleanInnerText) {
      thinking += thinking ? `\n${cleanInnerText}` : cleanInnerText;
    }

    return '';
  });

  return {
    content,
    thinking
  };
}

function readContentValue(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return '';
      return item.text || item.content || item.value || '';
    }).filter(Boolean).join('\n');
  }

  if (value && typeof value === 'object') {
    return value.text || value.content || value.value || '';
  }

  return '';
}

function extractContentFromData(data) {
  const choice = data?.choices?.[0] || {};
  const delta = choice.delta || {};
  const message = choice.message || {};
  const output = data?.output?.[0] || {};
  const outputContent = output?.content?.[0] || {};

  const text = [
    readContentValue(delta.content),
    readContentValue(message.content),
    readContentValue(choice.text),
    readContentValue(data.content),
    readContentValue(data.message),
    readContentValue(data.response),
    readContentValue(data.reply),
    readContentValue(outputContent.text),
    readContentValue(outputContent.content)
  ].filter(Boolean).join('');

  const reasoning = [
    delta.reasoning_content,
    delta.reasoning,
    delta.thinking,
    message.reasoning_content,
    message.reasoning,
    message.thinking,
    choice.reasoning_content,
    choice.reasoning,
    data.reasoning_content,
    data.reasoning,
    data.thinking
  ].filter(Boolean).join('\n');

  const extracted = extractThinkingFromText(text);

  return {
    done: data === '[DONE]' || Boolean(choice.finish_reason),
    content: extracted.content,
    thinking: [reasoning, extracted.thinking].filter(Boolean).join('\n'),
    finishReason: choice.finish_reason || '',
    raw: data
  };
}

function parseStreamPayload(payload) {
  if (!payload || payload === '[DONE]') {
    return {
      done: payload === '[DONE]',
      content: '',
      thinking: '',
      finishReason: '',
      raw: null
    };
  }

  try {
    return extractContentFromData(JSON.parse(payload));
  } catch (error) {
    return {
      done: false,
      content: '',
      thinking: '',
      finishReason: '',
      raw: null
    };
  }
}

function appendValue(base, value) {
  if (!value) {
    return base;
  }

  return base ? `${base}\n${value}` : value;
}

async function readStream(response, callbacks) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullContent = '';
  let fullThinking = '';
  let completed = false;

  while (!completed) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      const dataLines = event
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.replace(/^data:\s*/, ''));

      if (!dataLines.length) {
        continue;
      }

      const payload = dataLines.join('\n');
      const chunk = parseStreamPayload(payload);

      fullContent += chunk.content || '';
      fullThinking = appendValue(fullThinking, chunk.thinking);

      if (chunk.content || chunk.thinking) {
        callbacks.onChunk?.({
          content: chunk.content,
          thinking: chunk.thinking,
          raw: chunk.raw,
          done: false
        });
      }

      if (chunk.done) {
        completed = true;
        break;
      }
    }
  }

  if (buffer.trim()) {
    const dataLines = buffer
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.replace(/^data:\s*/, ''));

    if (dataLines.length) {
      const chunk = parseStreamPayload(dataLines.join('\n'));
      fullContent += chunk.content || '';
      fullThinking = appendValue(fullThinking, chunk.thinking);
    }
  }

  callbacks.onDone?.({
    content: fullContent,
    thinking: fullThinking
  });
}

function parseJsonFromText(text) {
  const cleanText = String(text || '').trim();

  if (!cleanText) {
    return null;
  }

  try {
    return JSON.parse(cleanText);
  } catch (error) {
    const match = cleanText.match(/\{[\s\S]*\}/);

    if (!match) {
      return null;
    }

    try {
      return JSON.parse(match[0]);
    } catch (innerError) {
      return null;
    }
  }
}

export async function streamMessage({
  messages = [],
  systemPrompt = '',
  endpointId = '',
  model = '',
  onChunk,
  onDone,
  onError,
  timeout = DEFAULT_TIMEOUT,
  temperature,
  maxTokens
} = {}) {
  const { controller, timer } = createTimeoutController(timeout);

  try {
    const endpointConfig = findEndpoint(endpointId);
    const requestModel = model || endpointConfig.model;

    if (!requestModel) {
      throw new Error('请先选择模型');
    }

    const body = buildRequestBody({
      messages,
      systemPrompt,
      model: requestModel,
      stream: true,
      temperature,
      maxTokens
    });

    if (!body.messages.length) {
      throw new Error('消息内容不能为空');
    }

    const response = await fetch(`${endpointConfig.endpoint}${CHAT_PATH}`, {
      method: 'POST',
      headers: buildHeaders(endpointConfig.apiKey),
      signal: controller.signal,
      body: JSON.stringify(body)
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
    const message = normalizeApiError(error, 'AI 请求失败');

    notifyApiError(message);
    onError?.({
      message,
      raw: error
    });

    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function silentRequest({
  prompt = '',
  messages = [],
  systemPrompt = '',
  endpointId = '',
  model = '',
  timeout = DEFAULT_TIMEOUT,
  temperature,
  maxTokens,
  json = false
} = {}) {
  const { controller, timer } = createTimeoutController(timeout);

  try {
    const endpointConfig = findEndpoint(endpointId);
    const requestModel = model || endpointConfig.model;

    if (!requestModel) {
      throw new Error('请先选择模型');
    }

    const requestMessages = Array.isArray(messages) && messages.length
      ? messages
      : [{ role: 'user', content: prompt }];

    const body = buildRequestBody({
      messages: requestMessages,
      systemPrompt,
      model: requestModel,
      stream: false,
      temperature,
      maxTokens
    });

    if (!body.messages.length) {
      throw new Error('请求内容不能为空');
    }

    const response = await fetch(`${endpointConfig.endpoint}${CHAT_PATH}`, {
      method: 'POST',
      headers: buildHeaders(endpointConfig.apiKey),
      signal: controller.signal,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }

    const data = await response.json();
    const extracted = extractContentFromData(data);
    const content = extracted.content.trim();
    const thinking = extracted.thinking.trim();

    if (json) {
      return parseJsonFromText(content || thinking);
    }

    return content || thinking;
  } catch (error) {
    const message = normalizeApiError(error, '后台请求失败');

    notifyApiError(message);

    return json ? null : '';
  } finally {
    clearTimeout(timer);
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
      .map((item) => item?.id)
      .filter(Boolean)
      .sort((first, second) => first.localeCompare(second));
  } catch (error) {
    const message = normalizeApiError(error, '拉取模型失败');

    notifyApiError(message);

    return [];
  } finally {
    clearTimeout(timer);
  }
}

// 改了什么：兼容更多 AI 返回字段，并在正文为空时用 reasoning/thinking 兜底，避免聊天层一直显示读取失败。
// 会不会影响其他文件：会影响所有 AI 请求读取结果，但只是增强兼容，不需要其他文件更新。
// 更新记忆里该文件的导出函数：无变化。
// depends: ./storage.js getData
