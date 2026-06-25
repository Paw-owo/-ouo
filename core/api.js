// core/api.js
// imports: getData from './storage.js'

import { getData } from './storage.js';

const CHAT_PATH = '/v1/chat/completions';
const ANTHROPIC_MESSAGES_PATH = '/v1/messages';
const GEMINI_MODEL_PREFIX = '/v1beta/models/';
const OLLAMA_CHAT_PATH = '/api/chat';
const MODELS_PATH = '/v1/models';
const DEFAULT_TIMEOUT = 60000;
const ANTHROPIC_VERSION = '2023-06-01';

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

function detectProvider(endpoint) {
  const raw = String(endpoint || '').toLowerCase();

  if (raw.includes('anthropic.com')) return 'anthropic';
  if (raw.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (raw.includes('localhost') || raw.includes('127.0.0.1')) return 'ollama';
  return 'openai';
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

  const provider = (endpoint.provider || '').trim().toLowerCase() || detectProvider(normalizedEndpoint);

  return {
    id: endpoint.id || '',
    name: endpoint.name || '',
    endpoint: normalizedEndpoint,
    apiKey: endpoint.apiKey || '',
    provider,
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

function buildHeaders(apiKey, provider = 'openai') {
  const headers = {
    'Content-Type': 'application/json'
  };

  if (provider === 'anthropic') {
    if (apiKey) headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = ANTHROPIC_VERSION;
    return headers;
  }

  if (provider !== 'ollama' && apiKey) {
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

function buildOpenAIRequestBody({ messages, systemPrompt, model, stream, temperature, maxTokens }) {
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

function buildAnthropicMessages(messages = [], systemPrompt = '') {
  const normalized = Array.isArray(messages)
    ? messages.map(normalizeMessage).filter(Boolean)
    : [];

  const anthropicMessages = normalized
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role,
      content: [{ type: 'text', text: message.content }]
    }));

  return {
    system: String(systemPrompt || '').trim(),
    messages: anthropicMessages
  };
}

function buildAnthropicRequestBody({ messages, systemPrompt, model, stream, temperature, maxTokens }) {
  const { system, messages: anthropicMessages } = buildAnthropicMessages(messages, systemPrompt);
  const body = {
    model,
    messages: anthropicMessages,
    stream
  };

  if (system) {
    body.system = system;
  }

  if (typeof temperature === 'number' && Number.isFinite(temperature)) {
    body.temperature = temperature;
  }

  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
    body.max_tokens = maxTokens;
  }

  return body;
}

function toGeminiParts(content) {
  if (typeof content === 'string') {
    return [{ text: content }];
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return { text: item };
        if (!item || typeof item !== 'object') return null;
        return item.text ? { text: item.text } : null;
      })
      .filter(Boolean);
  }

  if (content && typeof content === 'object' && content.text) {
    return [{ text: content.text }];
  }

  return [];
}

function buildGeminiContents(messages = [], systemPrompt = '') {
  const normalized = Array.isArray(messages)
    ? messages.map(normalizeMessage).filter(Boolean)
    : [];

  const contents = normalized
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: toGeminiParts(message.content)
    }))
    .filter((message) => message.parts.length);

  return {
    systemInstruction: systemPrompt
      ? {
          parts: [{ text: String(systemPrompt) }]
        }
      : undefined,
    contents
  };
}

function buildGeminiRequestUrl(endpoint, model, apiKey) {
  const cleanModel = String(model || '').trim();
  if (!cleanModel) {
    throw new Error('请先选择模型');
  }

  const base = endpoint.replace(/\/v1beta\/models\/?$/i, '').replace(/\/+$/, '');
  const url = new URL(`${base}${GEMINI_MODEL_PREFIX}${encodeURIComponent(cleanModel)}:generateContent`);
  if (apiKey) url.searchParams.set('key', apiKey);
  return url.toString();
}

function buildGeminiRequestBody({ messages, systemPrompt, stream, temperature, maxTokens }) {
  const { systemInstruction, contents } = buildGeminiContents(messages, systemPrompt);
  const body = {
    contents,
    generationConfig: {}
  };

  if (systemInstruction) {
    body.systemInstruction = systemInstruction;
  }

  if (typeof temperature === 'number' && Number.isFinite(temperature)) {
    body.generationConfig.temperature = temperature;
  }

  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
    body.generationConfig.maxOutputTokens = maxTokens;
  }

  if (stream) {
    body.stream = true;
  }

  return body;
}

function buildOllamaRequestBody({ messages, systemPrompt, model, stream, temperature, maxTokens }) {
  const body = {
    model,
    messages: buildMessages(messages, systemPrompt),
    stream
  };

  if (typeof temperature === 'number' && Number.isFinite(temperature)) {
    body.options = {
      ...(body.options || {}),
      temperature
    };
  }

  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
    body.options = {
      ...(body.options || {}),
      num_predict: maxTokens
    };
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
    const detail = data?.error?.message || data?.message || data?.error || '';
    return detail ? `${getErrorMessage(response.status)}：${detail}` : getErrorMessage(response.status);
  } catch (error) {
    return getErrorMessage(response.status);
  }
}

function normalizeApiError(error, fallbackMessage) {
  if (error?.name === 'AbortError') {
    return '网络超时，请稍后重试';
  }

  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
    return '网络已断开，请检查连接';
  }

  return error?.message || fallbackMessage;
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
  const candidate = data?.candidates?.[0] || {};
  const candidateContent = candidate?.content || {};
  const candidateParts = candidateContent?.parts || [];

  const geminiText = candidateParts
    .map((part) => part?.text || '')
    .filter(Boolean)
    .join('');

  const anthropicText = [
    readContentValue(message.content),
    readContentValue(delta.content),
    readContentValue(data.content),
    readContentValue(data.message)
  ].filter(Boolean).join('');

  const ollamaText = [
    readContentValue(message.content),
    readContentValue(delta.content),
    readContentValue(data.response),
    readContentValue(data.message),
    readContentValue(data.reply)
  ].filter(Boolean).join('');

  const text = [
    readContentValue(delta.content),
    readContentValue(message.content),
    readContentValue(choice.text),
    readContentValue(data.content),
    readContentValue(data.message),
    readContentValue(data.response),
    readContentValue(data.reply),
    readContentValue(outputContent.text),
    readContentValue(outputContent.content),
    geminiText,
    anthropicText,
    ollamaText
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
    data.thinking,
    candidate?.reasoning,
    candidate?.reasoningContent,
    data?.candidates?.[0]?.content?.thought || ''
  ].filter(Boolean).join('\n');

  const extracted = extractThinkingFromText(text);

  return {
    done: data === '[DONE]' || Boolean(choice.finish_reason) || Boolean(candidate.finishReason),
    content: extracted.content,
    thinking: [reasoning, extracted.thinking].filter(Boolean).join('\n'),
    finishReason: choice.finish_reason || candidate.finishReason || '',
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
    const parsed = JSON.parse(payload);

    if (parsed?.error) {
      return {
        done: true,
        content: '',
        thinking: '',
        finishReason: '',
        raw: parsed
      };
    }

    return extractContentFromData(parsed);
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

    const eventBlocks = buffer.split('\n\n');
    buffer = eventBlocks.pop() || '';

    for (const event of eventBlocks) {
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

function buildRequestContext({ endpointConfig, model, systemPrompt, messages, stream, temperature, maxTokens }) {
  const provider = endpointConfig.provider || 'openai';
  const requestModel = model || endpointConfig.model;

  if (provider !== 'gemini' && !requestModel) {
    throw new Error('请先选择模型');
  }

  if (provider === 'openai') {
    const body = buildOpenAIRequestBody({
      messages,
      systemPrompt,
      model: requestModel,
      stream,
      temperature,
      maxTokens
    });

    return {
      provider,
      url: `${endpointConfig.endpoint}${CHAT_PATH}`,
      headers: buildHeaders(endpointConfig.apiKey, provider),
      body
    };
  }

  if (provider === 'anthropic') {
    const body = buildAnthropicRequestBody({
      messages,
      systemPrompt,
      model: requestModel,
      stream,
      temperature,
      maxTokens
    });

    return {
      provider,
      url: `${endpointConfig.endpoint}${ANTHROPIC_MESSAGES_PATH}`,
      headers: buildHeaders(endpointConfig.apiKey, provider),
      body
    };
  }

  if (provider === 'gemini') {
    const url = buildGeminiRequestUrl(endpointConfig.endpoint, requestModel, endpointConfig.apiKey);
    const body = buildGeminiRequestBody({
      messages,
      systemPrompt,
      stream,
      temperature,
      maxTokens
    });

    return {
      provider,
      url,
      headers: buildHeaders('', provider),
      body
    };
  }

  if (provider === 'ollama') {
    const body = buildOllamaRequestBody({
      messages,
      systemPrompt,
      model: requestModel,
      stream,
      temperature,
      maxTokens
    });

    return {
      provider,
      url: `${endpointConfig.endpoint}${OLLAMA_CHAT_PATH}`,
      headers: buildHeaders('', provider),
      body
    };
  }

  const body = buildOpenAIRequestBody({
    messages,
    systemPrompt,
    model: requestModel,
    stream,
    temperature,
    maxTokens
  });

  return {
    provider: 'openai',
    url: `${endpointConfig.endpoint}${CHAT_PATH}`,
    headers: buildHeaders(endpointConfig.apiKey, 'openai'),
    body
  };
}

function normalizeResponsePayload(data, provider) {
  if (provider === 'gemini') {
    const candidates = Array.isArray(data?.candidates) ? data.candidates : [];
    const candidate = candidates[0] || {};
    const parts = candidate?.content?.parts || [];
    const text = parts.map((part) => part?.text || '').filter(Boolean).join('');
    return extractThinkingFromText(text);
  }

  if (provider === 'ollama') {
    const text = data?.message?.content || data?.response || '';
    return extractThinkingFromText(text);
  }

  if (provider === 'anthropic') {
    const text = data?.content
      ? Array.isArray(data.content)
        ? data.content.map((item) => item?.text || '').filter(Boolean).join('')
        : String(data.content)
      : '';
    return extractThinkingFromText(text);
  }

  const extracted = extractContentFromData(data);
  return {
    content: extracted.content,
    thinking: extracted.thinking
  };
}

async function readJsonResponse(response, provider) {
  const data = await response.json();
  return normalizeResponsePayload(data, provider);
}

async function readTextResponse(response, provider) {
  const text = await response.text();
  const parsed = parseJsonFromText(text);

  if (parsed) {
    return normalizeResponsePayload(parsed, provider);
  }

  if (provider === 'gemini') {
    return normalizeResponsePayload({ candidates: [{ content: { parts: [{ text }] } }] }, provider);
  }

  if (provider === 'ollama') {
    return normalizeResponsePayload({ message: { content: text } }, provider);
  }

  if (provider === 'anthropic') {
    return normalizeResponsePayload({ content: [{ text }] }, provider);
  }

  return normalizeResponsePayload({ content: text }, provider);
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
    const requestContext = buildRequestContext({
      endpointConfig,
      model,
      systemPrompt,
      messages,
      stream: true,
      temperature,
      maxTokens
    });

    const hasMessages = requestContext.provider === 'gemini'
      ? Array.isArray(requestContext.body.contents) && requestContext.body.contents.length > 0
      : Array.isArray(requestContext.body.messages) && requestContext.body.messages.length > 0;

    if (!hasMessages) {
      throw new Error(requestContext.provider === 'gemini' ? '消息内容不能为空' : '消息内容不能为空');
    }

    const response = await fetch(requestContext.url, {
      method: 'POST',
      headers: requestContext.headers,
      signal: controller.signal,
      body: JSON.stringify(requestContext.body)
    });

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }

    if (!response.body) {
      const fallback = await readTextResponse(response, requestContext.provider);
      onDone?.(fallback);
      return true;
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
    const requestContext = buildRequestContext({
      endpointConfig,
      model,
      systemPrompt,
      messages: Array.isArray(messages) && messages.length ? messages : [{ role: 'user', content: prompt }],
      stream: false,
      temperature,
      maxTokens
    });

    const hasMessages = requestContext.provider === 'gemini'
      ? Array.isArray(requestContext.body.contents) && requestContext.body.contents.length > 0
      : Array.isArray(requestContext.body.messages) && requestContext.body.messages.length > 0;

    if (!hasMessages) {
      throw new Error(requestContext.provider === 'gemini' ? '请求内容不能为空' : '请求内容不能为空');
    }

    const response = await fetch(requestContext.url, {
      method: 'POST',
      headers: requestContext.headers,
      signal: controller.signal,
      body: JSON.stringify(requestContext.body)
    });

    if (!response.ok) {
      throw new Error(await parseErrorResponse(response));
    }

    const { content, thinking } = response.body
      ? await readJsonResponse(response, requestContext.provider)
      : await readTextResponse(response, requestContext.provider);

    const finalContent = String(content || '').trim();
    const finalThinking = String(thinking || '').trim();

    if (json) {
      return parseJsonFromText(finalContent || finalThinking);
    }

    return finalContent || finalThinking;
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

    if (endpointConfig.provider === 'gemini') {
      return [];
    }

    if (endpointConfig.provider === 'ollama') {
      const response = await fetch(`${endpointConfig.endpoint}/api/tags`, {
        method: 'GET',
        headers: buildHeaders('', 'ollama'),
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error(await parseErrorResponse(response));
      }

      const data = await response.json();
      const models = Array.isArray(data.models) ? data.models : [];

      return models
        .map((item) => item?.name)
        .filter(Boolean)
        .sort((first, second) => first.localeCompare(second));
    }

    const response = await fetch(`${endpointConfig.endpoint}${MODELS_PATH}`, {
      method: 'GET',
      headers: buildHeaders(endpointConfig.apiKey, endpointConfig.provider),
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

// 改了什么：
// 1. 保留 OpenAI 默认路径，同时增加 Anthropic / Gemini / Ollama 分流。
// 2. 增强流式与非流式返回兼容：当非标准响应没有 body 时，退回到 text/json 解析。
// 3. Gemini 通过 URL key 参数请求，Anthropic 使用 x-api-key + anthropic-version，Ollama 使用 /api/chat。
// 4. fetchModels 对 Ollama 做了 tags 适配，Gemini 继续返回空数组以避免错误。
// 5. 错误提示、超时和网络断开提示保持友好。
// 会不会影响其他文件：
// - 函数签名未变，通常不需要其他文件配合。
// - 如果 settings 以后补 provider 字段，会更精准；不补也能靠 URL 自动识别。
// - 上层若依赖非标准流式格式，这版比之前更稳，不应破坏现有功能。
