// core/api.js
// imports: getData from './storage.js'

import { getData } from './storage.js';

// ═══════════════════════════════════════
// 【常量】
// ═══════════════════════════════════════
const DEFAULT_TIMEOUT = 60000;
const ANTHROPIC_VERSION = '2023-06-01';

// ───────────────────
// Toast / 错误通知
// ───────────────────

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

// ═══════════════════════════════════════
// 【URL 处理】智能拼接，兼容各种中转站
// ═══════════════════════════════════════

function normalizeEndpointUrl(endpoint) {
  return String(endpoint || '').trim().replace(/\/+$/, '');
}

// ───────────────────
// 检测 URL 的路径部分是否已包含某个关键词
// 只取 URL 的 pathname 段去匹配，不影响域名判断
// ───────────────────

function urlHasPathKeyword(url, keyword) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.includes(keyword.toLowerCase());
  } catch {
    return url.toLowerCase().includes(keyword.toLowerCase());
  }
}

// ───────────────────
// 智能拼接聊天 URL
// 路径里已经有 /chat/completions /messages /api/chat 就不重复追加
// ───────────────────

function smartChatUrl(base, provider) {
  const lower = base.toLowerCase();

  if (provider === 'anthropic') {
    if (urlHasPathKeyword(base, '/messages')) return base;
    return base + '/v1/messages';
  }

  if (provider === 'ollama') {
    if (urlHasPathKeyword(base, '/api/chat')) return base;
    return base + '/api/chat';
  }

  // openai 兼容（默认）：只要路径里已经有 /chat/completions 就不追加
  if (urlHasPathKeyword(base, '/chat/completions')) return base;
  return base + '/v1/chat/completions';
}

// ───────────────────
// 智能拼接模型列表 URL
// ───────────────────

function smartModelsUrl(base, provider) {
  if (provider === 'ollama') {
    if (urlHasPathKeyword(base, '/api/tags')) return base;
    return base + '/api/tags';
  }

  if (urlHasPathKeyword(base, '/v1/models')) return base;
  return base + '/v1/models';
}

// ───────────────────
// 智能拼接 Gemini URL
// ───────────────────

function smartGeminiUrl(base, model, apiKey) {
  const cleanModel = String(model || '').trim();
  if (!cleanModel) {
    throw new Error('请先选择模型');
  }

  let origin = base.replace(/\/+$/, '');

  // 已经包含完整路径（含 :generateContent）→ 直接用
  if (/\/v1beta\/models\/[^/]+:generateContent/i.test(origin)) {
    return origin;
  }

  // 去掉末尾的 /v1beta 或 /v1beta/models
  origin = origin
    .replace(/\/v1beta\/models\/?$/i, '')
    .replace(/\/v1beta\/?$/i, '')
    .replace(/\/+$/, '');

  const url = new URL(`${origin}/v1beta/models/${encodeURIComponent(cleanModel)}:generateContent`);
  if (apiKey) url.searchParams.set('key', apiKey);
  return url.toString();
}

// ═══════════════════════════════════════
// 【配置读取】从 localStorage 读设置
// ═══════════════════════════════════════

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

// ═══════════════════════════════════════
// 【Provider 检测】自动识别 API 提供商
// ═══════════════════════════════════════

function detectProvider(endpoint) {
  const raw = String(endpoint || '').toLowerCase();

  if (raw.includes('anthropic.com')) return 'anthropic';
  if (raw.includes('generativelanguage.googleapis.com')) return 'gemini';
  if (raw.includes('localhost') || raw.includes('127.0.0.1')) return 'ollama';
  return 'openai';
}

// ═══════════════════════════════════════
// 【端点查找】从配置中找到要用的 API 端点
// ═══════════════════════════════════════

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

// ═══════════════════════════════════════
// 【请求构建】各 Provider 的 Body/Header/URL
// ═══════════════════════════════════════

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
  if (!message || typeof message !== 'object') return null;

  const role = ['system', 'user', 'assistant'].includes(message.role) ? message.role : 'user';
  const content = typeof message.content === 'string' ? message.content : '';

  if (!content.trim()) return null;
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
    { role: 'system', content: String(systemPrompt) },
    ...normalizedMessages
  ];
}

// ───────────────────
// OpenAI Body
// ───────────────────

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

// ───────────────────
// Anthropic Body
// ───────────────────

function buildAnthropicMessages(messages = [], systemPrompt = '') {
  const normalized = Array.isArray(messages)
    ? messages.map(normalizeMessage).filter(Boolean)
    : [];

  return {
    system: String(systemPrompt || '').trim(),
    messages: normalized
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({
        role: m.role,
        content: [{ type: 'text', text: m.content }]
      }))
  };
}

function buildAnthropicRequestBody({ messages, systemPrompt, model, stream, temperature, maxTokens }) {
  const { system, messages: anthropicMessages } = buildAnthropicMessages(messages, systemPrompt);
  const body = {
    model,
    messages: anthropicMessages,
    stream
  };

  if (system) body.system = system;
  if (typeof temperature === 'number' && Number.isFinite(temperature)) {
    body.temperature = temperature;
  }
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
    body.max_tokens = maxTokens;
  }
  return body;
}

// ───────────────────
// Gemini Body
// ───────────────────

function toGeminiParts(content) {
  if (typeof content === 'string') return [{ text: content }];
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') return { text: item };
      if (!item || typeof item !== 'object') return null;
      return item.text ? { text: item.text } : null;
    }).filter(Boolean);
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
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: toGeminiParts(m.content)
    }))
    .filter((m) => m.parts.length);

  return {
    systemInstruction: systemPrompt
      ? { parts: [{ text: String(systemPrompt) }] }
      : undefined,
    contents
  };
}

function buildGeminiRequestBody({ messages, systemPrompt, stream, temperature, maxTokens }) {
  const { systemInstruction, contents } = buildGeminiContents(messages, systemPrompt);
  const body = {
    contents,
    generationConfig: {}
  };

  if (systemInstruction) body.systemInstruction = systemInstruction;
  if (typeof temperature === 'number' && Number.isFinite(temperature)) {
    body.generationConfig.temperature = temperature;
  }
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
    body.generationConfig.maxOutputTokens = maxTokens;
  }
  if (stream) body.stream = true;

  return body;
}

// ───────────────────
// Ollama Body
// ───────────────────

function buildOllamaRequestBody({ messages, systemPrompt, model, stream, temperature, maxTokens }) {
  const body = {
    model,
    messages: buildMessages(messages, systemPrompt),
    stream
  };

  if (typeof temperature === 'number' && Number.isFinite(temperature)) {
    body.options = { ...(body.options || {}), temperature };
  }
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) {
    body.options = { ...(body.options || {}), num_predict: maxTokens };
  }
  return body;
}

// ═══════════════════════════════════════
// 【请求上下文构建】智能拼 URL + 组装请求
// ═══════════════════════════════════════

function buildRequestContext({ endpointConfig, model, systemPrompt, messages, stream, temperature, maxTokens }) {
  const provider = endpointConfig.provider || 'openai';
  const requestModel = model || endpointConfig.model;
  const base = endpointConfig.endpoint;

  if (provider !== 'gemini' && !requestModel) {
    throw new Error('请先选择模型');
  }

  if (provider === 'openai') {
    return {
      provider,
      url: smartChatUrl(base, 'openai'),
      headers: buildHeaders(endpointConfig.apiKey, provider),
      body: buildOpenAIRequestBody({ messages, systemPrompt, model: requestModel, stream, temperature, maxTokens })
    };
  }

  if (provider === 'anthropic') {
    return {
      provider,
      url: smartChatUrl(base, 'anthropic'),
      headers: buildHeaders(endpointConfig.apiKey, provider),
      body: buildAnthropicRequestBody({ messages, systemPrompt, model: requestModel, stream, temperature, maxTokens })
    };
  }

  if (provider === 'gemini') {
    return {
      provider,
      url: smartGeminiUrl(base, requestModel, endpointConfig.apiKey),
      headers: buildHeaders('', provider),
      body: buildGeminiRequestBody({ messages, systemPrompt, stream, temperature, maxTokens })
    };
  }

  if (provider === 'ollama') {
    return {
      provider,
      url: smartChatUrl(base, 'ollama'),
      headers: buildHeaders('', provider),
      body: buildOllamaRequestBody({ messages, systemPrompt, model: requestModel, stream, temperature, maxTokens })
    };
  }

  // 兜底走 OpenAI
  return {
    provider: 'openai',
    url: smartChatUrl(base, 'openai'),
    headers: buildHeaders(endpointConfig.apiKey, 'openai'),
    body: buildOpenAIRequestBody({ messages, systemPrompt, model: requestModel, stream, temperature, maxTokens })
  };
}

// ═══════════════════════════════════════
// 【错误处理】HTTP 状态码 + 网络错误
// ═══════════════════════════════════════

function getErrorMessage(status) {
  if (status === 400) return '请求格式有误，请检查模型和消息内容';
  if (status === 401) return 'API Key 无效或已过期';
  if (status === 403) return '当前 API Key 没有访问权限';
  if (status === 404) return 'API 地址不正确，请检查端点';
  if (status === 429) return '请求太频繁，请稍后再试';
  if (status >= 500) return 'AI 服务暂时不可用';
  if (status >= 400) return '请求失败，请检查 API 配置';
  return '网络连接失败';
}

async function parseErrorResponse(response) {
  try {
    const data = await response.json();
    const detail = data?.error?.message || data?.message || data?.error || '';
    return detail ? `${getErrorMessage(response.status)}：${detail}` : getErrorMessage(response.status);
  } catch {
    return getErrorMessage(response.status);
  }
}

function normalizeApiError(error, fallbackMessage) {
  if (error?.name === 'AbortError') return '网络超时，请稍后重试';
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) {
    return '网络已断开，请检查连接';
  }
  return error?.message || fallbackMessage;
}

// ═══════════════════════════════════════
// 【响应解析】从各种格式中提取文字和思维链
// ═══════════════════════════════════════

function extractThinkingFromText(text) {
  if (!text) return { content: '', thinking: '' };

  let thinking = '';
  const content = String(text).replace(/<thinking>([\s\S]*?)<\/thinking>/gi, (match, innerText) => {
    const clean = String(innerText || '').trim();
    if (clean) thinking += thinking ? `\n${clean}` : clean;
    return '';
  });

  return { content, thinking };
}

function readContentValue(value) {
  if (typeof value === 'string') return value;
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
  const candidateParts = candidate?.content?.parts || [];

  const geminiText = candidateParts.map((p) => p?.text || '').filter(Boolean).join('');

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
    geminiText
  ].filter(Boolean).join('');

  const reasoning = [
    delta.reasoning_content, delta.reasoning, delta.thinking,
    message.reasoning_content, message.reasoning, message.thinking,
    choice.reasoning_content, choice.reasoning,
    data.reasoning_content, data.reasoning, data.thinking,
    candidate?.reasoning, candidate?.reasoningContent,
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

// ═══════════════════════════════════════
// 【流式读取】SSE 解析
// ═══════════════════════════════════════

function parseStreamPayload(payload) {
  if (!payload || payload === '[DONE]') {
    return { done: payload === '[DONE]', content: '', thinking: '', finishReason: '', raw: null };
  }
  try {
    const parsed = JSON.parse(payload);
    if (parsed?.error) {
      return { done: true, content: '', thinking: '', finishReason: '', raw: parsed };
    }
    return extractContentFromData(parsed);
  } catch {
    return { done: false, content: '', thinking: '', finishReason: '', raw: null };
  }
}

function appendValue(base, value) {
  if (!value) return base;
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
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const eventBlocks = buffer.split('\n\n');
    buffer = eventBlocks.pop() || '';

    for (const event of eventBlocks) {
      const dataLines = event
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.replace(/^data:\s*/, ''));

      if (!dataLines.length) continue;

      const chunk = parseStreamPayload(dataLines.join('\n'));
      fullContent += chunk.content || '';
      fullThinking = appendValue(fullThinking, chunk.thinking);

      if (chunk.content || chunk.thinking) {
        callbacks.onChunk?.({ content: chunk.content, thinking: chunk.thinking, raw: chunk.raw, done: false });
      }

      if (chunk.done) { completed = true; break; }
    }
  }

  if (buffer.trim()) {
    const dataLines = buffer.split('\n').map((l) => l.trim()).filter((l) => l.startsWith('data:')).map((l) => l.replace(/^data:\s*/, ''));
    if (dataLines.length) {
      const chunk = parseStreamPayload(dataLines.join('\n'));
      fullContent += chunk.content || '';
      fullThinking = appendValue(fullThinking, chunk.thinking);
    }
  }

  callbacks.onDone?.({ content: fullContent, thinking: fullThinking });
}

// ═══════════════════════════════════════
// 【JSON 解析辅助】
// ═══════════════════════════════════════

function parseJsonFromText(text) {
  const cleanText = String(text || '').trim();
  if (!cleanText) return null;
  try {
    return JSON.parse(cleanText);
  } catch {
    const match = cleanText.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try { return JSON.parse(match[0]); } catch { return null; }
  }
}

// ═══════════════════════════════════════
// 【非流式响应读取】
// ═══════════════════════════════════════

function normalizeResponsePayload(data, provider) {
  if (provider === 'gemini') {
    const candidate = (Array.isArray(data?.candidates) ? data.candidates : [])[0] || {};
    const text = (candidate?.content?.parts || []).map((p) => p?.text || '').filter(Boolean).join('');
    return extractThinkingFromText(text);
  }
  if (provider === 'ollama') {
    return extractThinkingFromText(data?.message?.content || data?.response || '');
  }
  if (provider === 'anthropic') {
    const raw = data?.content;
    const text = raw ? (Array.isArray(raw) ? raw.map((i) => i?.text || '').filter(Boolean).join('') : String(raw)) : '';
    return extractThinkingFromText(text);
  }
  const extracted = extractContentFromData(data);
  return { content: extracted.content, thinking: extracted.thinking };
}

async function readJsonResponse(response, provider) {
  return normalizeResponsePayload(await response.json(), provider);
}

async function readTextResponse(response, provider) {
  const text = await response.text();
  const parsed = parseJsonFromText(text);
  if (parsed) return normalizeResponsePayload(parsed, provider);

  if (provider === 'gemini') return normalizeResponsePayload({ candidates: [{ content: { parts: [{ text }] } }] }, provider);
  if (provider === 'ollama') return normalizeResponsePayload({ message: { content: text } }, provider);
  if (provider === 'anthropic') return normalizeResponsePayload({ content: [{ text }] }, provider);
  return normalizeResponsePayload({ content: text }, provider);
}

// ═══════════════════════════════════════
// 【导出 API】streamMessage / silentRequest / fetchModels
// ═══════════════════════════════════════

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
      endpointConfig, model, systemPrompt, messages, stream: true, temperature, maxTokens
    });

    const hasMessages = requestContext.provider === 'gemini'
      ? Array.isArray(requestContext.body.contents) && requestContext.body.contents.length > 0
      : Array.isArray(requestContext.body.messages) && requestContext.body.messages.length > 0;

    if (!hasMessages) throw new Error('消息内容不能为空');

    const response = await fetch(requestContext.url, {
      method: 'POST',
      headers: requestContext.headers,
      signal: controller.signal,
      body: JSON.stringify(requestContext.body)
    });

    if (!response.ok) throw new Error(await parseErrorResponse(response));

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
    onError?.({ message, raw: error });
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
      endpointConfig, model, systemPrompt,
      messages: Array.isArray(messages) && messages.length ? messages : [{ role: 'user', content: prompt }],
      stream: false, temperature, maxTokens
    });

    const hasMessages = requestContext.provider === 'gemini'
      ? Array.isArray(requestContext.body.contents) && requestContext.body.contents.length > 0
      : Array.isArray(requestContext.body.messages) && requestContext.body.messages.length > 0;

    if (!hasMessages) throw new Error('请求内容不能为空');

    const response = await fetch(requestContext.url, {
      method: 'POST',
      headers: requestContext.headers,
      signal: controller.signal,
      body: JSON.stringify(requestContext.body)
    });

    if (!response.ok) throw new Error(await parseErrorResponse(response));

    const { content, thinking } = response.body
      ? await readJsonResponse(response, requestContext.provider)
      : await readTextResponse(response, requestContext.provider);

    const finalContent = String(content || '').trim();
    const finalThinking = String(thinking || '').trim();

    if (json) return parseJsonFromText(finalContent || finalThinking);
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

    if (endpointConfig.provider === 'gemini') return [];

    const url = smartModelsUrl(endpointConfig.endpoint, endpointConfig.provider);

    const response = await fetch(url, {
      method: 'GET',
      headers: buildHeaders(endpointConfig.apiKey, endpointConfig.provider),
      signal: controller.signal
    });

    if (!response.ok) throw new Error(await parseErrorResponse(response));

    const data = await response.json();

    if (endpointConfig.provider === 'ollama') {
      const models = Array.isArray(data.models) ? data.models : [];
      return models.map((m) => m?.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
    }

    const models = Array.isArray(data.data) ? data.data : [];
    return models.map((m) => m?.id).filter(Boolean).sort((a, b) => a.localeCompare(b));
  } catch (error) {
    const message = normalizeApiError(error, '拉取模型失败');
    notifyApiError(message);
    return [];
  } finally {
    clearTimeout(timer);
  }
}
