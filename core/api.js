// core/api.js
// imports: getData from './storage.js'
// exports: streamMessage, silentRequest, fetchModels, smartModelsUrl, buildHeaders, parseErrorResponse, getFallbackSources

import { getData } from './storage.js';

const DEFAULT_TIMEOUT = 60000;
const ANTHROPIC_VERSION = '2023-06-01';

// ═══════════════════════════════════════
// 【匿名接口池】免Key直连，失败自动切换
// ═══════════════════════════════════════

const ANONYMOUS_SOURCES = [
  {
    id: 'anon_llm7',
    name: 'LLM7',
    endpoint: 'https://api.llm7.io/v1',
    model: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'deepseek-v3-0324', 'deepseek-r1-0528', 'gemini-2.5-flash-lite', 'qwen2.5-coder-32b', 'mistral-small-3.1-24b'],
    rateLimit: '30次/分钟',
    description: '免Key直连，30+模型'
  },
  {
    id: 'anon_ovhcloud',
    name: 'OVHcloud',
    endpoint: 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1',
    model: 'Qwen/Qwen3.5-397B-A17B',
    models: ['Qwen/Qwen3.5-397B-A17B', 'Meta-Llama-3_3-70B-Instruct', 'Qwen/Qwen3.6-27B', 'Qwen/Qwen3-32B', 'Mistral-Small-3.1-24B-Instruct'],
    rateLimit: '2次/分钟',
    description: '免Key直连，欧盟机房'
  }
];

// ═══════════════════════════════════════
// 【Toast 通知】
// ═══════════════════════════════════════

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

function notifyRetry(sourceName) {
  try {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(`这个接口没接上，正在换 ${sourceName} 试试`);
    }
  } catch {}
}

function notifyApiInfo(msg) {
  try {
    if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
      window.showToast(msg);
    }
  } catch {}
}

// ═══════════════════════════════════════
// 【URL 处理】智能拼接，兼容各种中转站
// ═══════════════════════════════════════

function normalizeEndpointUrl(endpoint) {
  return String(endpoint || '').trim().replace(/\/+$/, '');
}

function urlHasPathKeyword(url, keyword) {
  try {
    return new URL(url).pathname.toLowerCase().includes(keyword.toLowerCase());
  } catch {
    return url.toLowerCase().includes(keyword.toLowerCase());
  }
}

function urlHasV1(url) {
  try {
    return new URL(url).pathname.toLowerCase().includes('/v1');
  } catch {
    return url.toLowerCase().includes('/v1');
  }
}

function smartChatUrl(base, provider) {
  if (provider === 'anthropic') {
    if (urlHasPathKeyword(base, '/messages')) return base;
    if (urlHasV1(base)) return base + '/messages';
    return base + '/v1/messages';
  }

  if (provider === 'ollama') {
    if (urlHasPathKeyword(base, '/api/chat')) return base;
    return base + '/api/chat';
  }

  if (urlHasPathKeyword(base, '/chat/completions')) return base;
  if (urlHasV1(base)) return base + '/chat/completions';
  return base + '/v1/chat/completions';
}

export function smartModelsUrl(base, provider) {
  if (provider === 'ollama') {
    if (urlHasPathKeyword(base, '/api/tags')) return base;
    return base + '/api/tags';
  }

  if (urlHasPathKeyword(base, '/models')) return base;
  if (urlHasV1(base)) return base + '/models';
  return base + '/v1/models';
}

function smartGeminiUrl(base, model, apiKey, stream = false) {
  const cleanModel = String(model || '').trim();
  if (!cleanModel) throw new Error('请先选择模型');

  let origin = base.replace(/\/+$/, '');
  const fullPattern = stream
    ? /\/v1beta\/models\/[^/]+:streamGenerateContent/i
    : /\/v1beta\/models\/[^/]+:generateContent/i;

  if (fullPattern.test(origin)) {
    if (apiKey) {
      const url = new URL(origin);
      url.searchParams.set('key', apiKey);
      if (stream) url.searchParams.set('alt', 'sse');
      return url.toString();
    }

    return origin;
  }

  origin = origin
    .replace(/\/v1beta\/models\/?$/i, '')
    .replace(/\/v1beta\/?$/i, '')
    .replace(/\/+$/, '');

  const action = stream ? 'streamGenerateContent' : 'generateContent';
  const url = new URL(`${origin}/v1beta/models/${encodeURIComponent(cleanModel)}:${action}`);

  if (apiKey) url.searchParams.set('key', apiKey);
  if (stream) url.searchParams.set('alt', 'sse');

  return url.toString();
}

// ═══════════════════════════════════════
// 【配置读取】
// ═══════════════════════════════════════

function getSettings() {
  const settings = getData('app_settings') || {};
  const apiEndpoints = Array.isArray(settings.apiEndpoints) ? settings.apiEndpoints : [];

  return {
    defaultApiEndpointId: settings.defaultApiEndpointId || '',
    defaultModel: settings.defaultModel || '',
    ttsGlobal: settings.ttsGlobal || { provider: 'openai', apiKey: '', endpoint: '' },
    mcpServers: Array.isArray(settings.mcpServers) ? settings.mcpServers : [],
    bubbleMode: settings.bubbleMode === 'dialog' ? 'dialog' : 'bubble',
    fontSize: Number(settings.fontSize) || 15,
    user: settings.user || { name: '', avatar: '' },
    widgets: settings.widgets || { time: true, weather: true, anniversary: true },
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

  if (!endpoint || !endpoint.endpoint) throw new Error('请先配置 API 端点');

  const normalizedEndpoint = normalizeEndpointUrl(endpoint.endpoint);
  if (!/^https?:\/\//i.test(normalizedEndpoint)) throw new Error('API 端点必须以 http 或 https 开头');

  const provider = (endpoint.provider || '').trim().toLowerCase() || detectProvider(normalizedEndpoint);

  return {
    id: endpoint.id || '',
    name: endpoint.name || '',
    endpoint: normalizedEndpoint,
    apiKey: endpoint.apiKey || '',
    provider,
    model: endpoint.model || settings.defaultModel || '',
    modelList: Array.isArray(endpoint.modelList) ? endpoint.modelList : [],
    source: endpoint.source || ''
  };
}

// ═══════════════════════════════════════
// 【Fallback 源管理】用户API + 匿名池
// ═══════════════════════════════════════

export function getFallbackSources() {
  const settings = getSettings();
  const freeEndpoints = settings.apiEndpoints.filter((api) => api.source === 'free' && api.apiKey);

  const sources = [];

  freeEndpoints.forEach((ep) => {
    sources.push({
      id: ep.id,
      name: ep.name || '免费API',
      endpoint: ep.endpoint,
      model: ep.model,
      apiKey: ep.apiKey,
      provider: ep.provider || detectProvider(ep.endpoint),
      isUser: false,
      isAnonymous: false
    });
  });

  ANONYMOUS_SOURCES.forEach((anon) => {
    sources.push({
      id: anon.id,
      name: anon.name,
      endpoint: anon.endpoint,
      model: anon.model,
      apiKey: '',
      provider: 'openai',
      isUser: false,
      isAnonymous: true
    });
  });

  return sources;
}

function getAvailableSources(endpointId = '') {
  const sources = [];

  try {
    const ep = findEndpoint(endpointId);

    sources.push({
      id: ep.id,
      name: ep.name || '我的API',
      endpoint: ep.endpoint,
      apiKey: ep.apiKey,
      model: ep.model,
      provider: ep.provider,
      isUser: true,
      isAnonymous: false
    });
  } catch {}

  const settings = getSettings();
  const usedIds = new Set(sources.map((s) => s.id));

  settings.apiEndpoints
    .filter((api) => api.source === 'free' && api.apiKey && !usedIds.has(api.id))
    .forEach((ep) => {
      usedIds.add(ep.id);

      sources.push({
        id: ep.id,
        name: ep.name || '免费API',
        endpoint: ep.endpoint,
        apiKey: ep.apiKey,
        model: ep.model,
        provider: ep.provider || detectProvider(ep.endpoint),
        isUser: false,
        isAnonymous: false
      });
    });

  ANONYMOUS_SOURCES
    .filter((anon) => !usedIds.has(anon.id))
    .forEach((anon) => {
      sources.push({
        id: anon.id,
        name: anon.name,
        endpoint: anon.endpoint,
        apiKey: '',
        model: anon.model,
        provider: 'openai',
        isUser: false,
        isAnonymous: true
      });
    });

  return sources;
}

// ═══════════════════════════════════════
// 【错误分类】
// ═══════════════════════════════════════

function getStatusFromError(error) {
  if (typeof error?.status === 'number') return error.status;

  const message = String(error?.message || '');
  const statusMatch = message.match(/HTTP\s*(\d+)/i);

  if (statusMatch) return Number(statusMatch[1]);
  if (error?.name === 'AbortError') return 408;
  if (error?.isNetworkError) return 0;

  return 0;
}

function isBrowserBlockedError(error) {
  if (!error) return false;

  const message = String(error.message || '').toLowerCase();

  return error.name === 'TypeError'
    || message.includes('failed to fetch')
    || message.includes('load failed')
    || message.includes('networkerror')
    || message.includes('network request failed')
    || message.includes('cors');
}

function createNetworkError(error, source) {
  const message = source?.isUser
    ? `这个中转站被浏览器拦住啦，可能没开放跨域访问（CORS）。换支持网页直连的中转站会更稳。`
    : `网络没牵上小手，连接失败啦`;

  const next = new Error(message);
  next.name = error?.name || 'NetworkError';
  next.cause = error;
  next.status = 0;
  next.isNetworkError = true;
  next.sourceName = source?.name || '';

  return next;
}

function shouldStopOnUserError(status, source) {
  if (!source?.isUser) return false;

  if (status === 0) return true;
  if (status === 400) return true;
  if (status === 401) return true;
  if (status === 403) return true;
  if (status === 404) return true;

  return false;
}

function isRetryableError(status, hasKey, source) {
  if (shouldStopOnUserError(status, source)) return false;

  if (status === 0) return true;
  if (status === 408) return true;
  if (status === 429 || status === 503) return true;
  if (status >= 500) return true;
  if ((status === 401 || status === 403) && !hasKey) return true;

  return false;
}

// ═══════════════════════════════════════
// 【重试引擎】失败自动切下一个源
// ═══════════════════════════════════════

async function tryWithFallback({ sources, buildFn, onSwitch, onReset }) {
  if (!sources.length) throw new Error('没有可用的 API 接口');

  let lastError = null;

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];

    try {
      return await buildFn(source);
    } catch (error) {
      const normalizedError = isBrowserBlockedError(error) ? createNetworkError(error, source) : error;
      const status = getStatusFromError(normalizedError);
      const hasKey = Boolean(source.apiKey);

      lastError = normalizedError;

      if (i < sources.length - 1 && isRetryableError(status, hasKey, source)) {
        onReset?.();

        const nextSource = sources[i + 1];
        const nextName = nextSource?.name || '备用接口';

        onSwitch?.(nextName);
        continue;
      }

      throw normalizedError;
    }
  }

  throw lastError || new Error('所有 API 接口都不可用');
}

// ═══════════════════════════════════════
// 【超时控制】
// ═══════════════════════════════════════

function createTimeoutController(timeout = DEFAULT_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(timeout) || DEFAULT_TIMEOUT);

  return { controller, timer };
}

// ═══════════════════════════════════════
// 【请求构建】
// ═══════════════════════════════════════

export function buildHeaders(apiKey, provider = 'openai') {
  const headers = { 'Content-Type': 'application/json' };

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
  const normalizedMessages = Array.isArray(messages) ? messages.map(normalizeMessage).filter(Boolean) : [];

  if (!systemPrompt || !String(systemPrompt).trim()) return normalizedMessages;

  return [{ role: 'system', content: String(systemPrompt) }, ...normalizedMessages];
}

function buildOpenAIRequestBody({ messages, systemPrompt, model, stream, temperature, maxTokens }) {
  const body = {
    model,
    messages: buildMessages(messages, systemPrompt),
    stream
  };

  if (typeof temperature === 'number' && Number.isFinite(temperature)) body.temperature = temperature;
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) body.max_tokens = maxTokens;

  return body;
}

function buildAnthropicMessages(messages = [], systemPrompt = '') {
  const normalized = Array.isArray(messages) ? messages.map(normalizeMessage).filter(Boolean) : [];

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
  if (typeof temperature === 'number' && Number.isFinite(temperature)) body.temperature = temperature;
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) body.max_tokens = maxTokens;

  return body;
}

function toGeminiParts(content) {
  if (typeof content === 'string') return [{ text: content }];

  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') return { text: item };
      if (!item || typeof item !== 'object') return null;
      return item.text ? { text: item.text } : null;
    }).filter(Boolean);
  }

  if (content && typeof content === 'object' && content.text) return [{ text: content.text }];

  return [];
}

function buildGeminiContents(messages = [], systemPrompt = '') {
  const normalized = Array.isArray(messages) ? messages.map(normalizeMessage).filter(Boolean) : [];

  const contents = normalized
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: toGeminiParts(m.content)
    }))
    .filter((m) => m.parts.length);

  return {
    systemInstruction: systemPrompt ? { parts: [{ text: String(systemPrompt) }] } : undefined,
    contents
  };
}

function buildGeminiRequestBody({ messages, systemPrompt, temperature, maxTokens }) {
  const { systemInstruction, contents } = buildGeminiContents(messages, systemPrompt);

  const body = {
    contents,
    generationConfig: {}
  };

  if (systemInstruction) body.systemInstruction = systemInstruction;
  if (typeof temperature === 'number' && Number.isFinite(temperature)) body.generationConfig.temperature = temperature;
  if (typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0) body.generationConfig.maxOutputTokens = maxTokens;

  return body;
}

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

function buildRequestContext({ endpointConfig, model, systemPrompt, messages, stream, temperature, maxTokens }) {
  const provider = endpointConfig.provider || 'openai';
  const requestModel = model || endpointConfig.model;
  const base = endpointConfig.endpoint;

  if (provider !== 'gemini' && !requestModel) throw new Error('请先选择模型');

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
      url: smartGeminiUrl(base, requestModel, endpointConfig.apiKey, stream),
      headers: buildHeaders('', provider),
      body: buildGeminiRequestBody({ messages, systemPrompt, temperature, maxTokens })
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

  return {
    provider: 'openai',
    url: smartChatUrl(base, 'openai'),
    headers: buildHeaders(endpointConfig.apiKey, 'openai'),
    body: buildOpenAIRequestBody({ messages, systemPrompt, model: requestModel, stream, temperature, maxTokens })
  };
}

// ═══════════════════════════════════════
// 【错误处理】
// ═══════════════════════════════════════

function getErrorMessage(status) {
  if (status === 400) return '请求格式不对，模型名或消息内容可能不合适';
  if (status === 401) return '密钥不对或过期啦';
  if (status === 402) return '额度不够啦，需要看看账户余额';
  if (status === 403) return '这个密钥没有访问权限';
  if (status === 404) return '接口地址或模型名没找到';
  if (status === 408) return '等太久啦，连接超时了';
  if (status === 429) return '请求太密啦，先歇一小会儿';
  if (status === 500) return '服务器炸咯，晚点再戳它';
  if (status === 502) return '中转站打了个喷嚏，暂时接不上';
  if (status === 503) return '服务正在忙，稍后再试试';
  if (status === 504) return '中转站等太久啦，超时了';
  if (status >= 500) return 'AI 服务暂时不可用';
  if (status >= 400) return '请求失败啦，请检查 API 配置';

  return '网络连接失败';
}

export async function parseErrorResponse(response) {
  try {
    const data = await response.json();
    const detail = data?.error?.message || data?.message || data?.error || '';
    const base = getErrorMessage(response.status);

    return detail
      ? `HTTP ${response.status}｜${base}：${detail}`
      : `HTTP ${response.status}｜${base}`;
  } catch {
    return `HTTP ${response.status}｜${getErrorMessage(response.status)}`;
  }
}

async function buildHttpError(response) {
  const message = await parseErrorResponse(response);
  const error = new Error(message);

  error.status = response.status;
  error.statusText = response.statusText || '';
  error.isHttpError = true;

  return error;
}

function cleanApiErrorMessage(message) {
  const raw = String(message || '').trim();

  if (!raw) return '';

  return raw
    .replace(/^HTTP\s*\d+\s*[｜|]\s*/i, '')
    .replace(/^Error:\s*/i, '')
    .trim();
}

function normalizeApiError(error, fallbackMessage) {
  if (error?.name === 'AbortError') return '等太久啦，连接超时了';
  if (typeof navigator !== 'undefined' && navigator && navigator.onLine === false) return '网络断开啦，先检查一下连接';
  if (error?.isNetworkError) return error.message;
  if (isBrowserBlockedError(error)) return '这个中转站被浏览器拦住啦，可能没开放跨域访问（CORS）';

  const message = cleanApiErrorMessage(error?.message);

  return message || fallbackMessage;
}

// ═══════════════════════════════════════
// 【响应解析】
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

  if (value && typeof value === 'object') return value.text || value.content || value.value || '';

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
  } catch {
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
      .map((l) => l.trim())
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.replace(/^data:\s*/, ''));

    if (dataLines.length) {
      const chunk = parseStreamPayload(dataLines.join('\n'));

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
    }
  }

  if (!fullContent && buffer.trim()) {
    try {
      const parsed = JSON.parse(buffer.trim());
      const extracted = extractContentFromData(parsed);

      if (extracted.content) {
        fullContent = extracted.content;
        fullThinking = appendValue(fullThinking, extracted.thinking);
      }
    } catch {}
  }

  callbacks.onDone?.({
    content: fullContent,
    thinking: fullThinking
  });
}

function parseJsonFromText(text) {
  const cleanText = String(text || '').trim();

  if (!cleanText) return null;

  try {
    return JSON.parse(cleanText);
  } catch {}

  const match = cleanText.match(/\{[\s\S]*\}/);

  if (!match) return null;

  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

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
    const text = raw
      ? Array.isArray(raw)
        ? raw.map((i) => i?.text || '').filter(Boolean).join('')
        : String(raw)
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
// 【导出 API】带 Fallback 的三大接口
// ═══════════════════════════════════════

export async function streamMessage({
  messages = [],
  systemPrompt = '',
  endpointId = '',
  model = '',
  onChunk,
  onDone,
  onError,
  onReset,
  timeout = DEFAULT_TIMEOUT,
  temperature,
  maxTokens
} = {}) {
  const sources = getAvailableSources(endpointId);
  let currentTimer = null;
  const hasKeyedSource = sources.some((s) => Boolean(s.apiKey));

  try {
    const result = await tryWithFallback({
      sources,
      onSwitch: notifyRetry,
      onReset,
      buildFn: async (source) => {
        if (currentTimer) {
          clearTimeout(currentTimer);
          currentTimer = null;
        }

        const { controller, timer } = createTimeoutController(timeout);
        currentTimer = timer;

        try {
          const provider = source.provider || detectProvider(source.endpoint);
          const requestContext = buildRequestContext({
            endpointConfig: { ...source, provider },
            model: model || source.model,
            systemPrompt,
            messages,
            stream: true,
            temperature,
            maxTokens
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

          if (!response.ok) throw await buildHttpError(response);

          if (!response.body) {
            const fallback = await readTextResponse(response, requestContext.provider);

            return {
              content: fallback.content,
              thinking: fallback.thinking
            };
          }

          return await new Promise((resolve, reject) => {
            readStream(response, {
              onChunk,
              onDone: ({ content, thinking }) => resolve({ content, thinking })
            }).catch(reject);
          });
        } finally {
          clearTimeout(timer);
          currentTimer = null;
        }
      }
    });

    onDone?.(result);
    return true;
  } catch (error) {
    const message = normalizeApiError(error, 'AI 请求失败啦');

    if (hasKeyedSource || error?.isNetworkError || error?.isHttpError) {
      notifyApiError(message);
    }

    onError?.({
      message,
      raw: error,
      status: getStatusFromError(error)
    });

    return false;
  } finally {
    if (currentTimer) {
      clearTimeout(currentTimer);
      currentTimer = null;
    }
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
  const sources = getAvailableSources(endpointId);
  let currentTimer = null;
  const hasKeyedSource = sources.some((s) => Boolean(s.apiKey));

  try {
    const result = await tryWithFallback({
      sources,
      onSwitch: notifyRetry,
      onReset: null,
      buildFn: async (source) => {
        if (currentTimer) {
          clearTimeout(currentTimer);
          currentTimer = null;
        }

        const { controller, timer } = createTimeoutController(timeout);
        currentTimer = timer;

        try {
          const provider = source.provider || detectProvider(source.endpoint);
          const requestContext = buildRequestContext({
            endpointConfig: { ...source, provider },
            model: model || source.model,
            systemPrompt,
            messages: Array.isArray(messages) && messages.length ? messages : [{ role: 'user', content: prompt }],
            stream: false,
            temperature,
            maxTokens
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

          if (!response.ok) throw await buildHttpError(response);

          const { content, thinking } = response.body
            ? await readJsonResponse(response, requestContext.provider)
            : await readTextResponse(response, requestContext.provider);

          return {
            content: String(content || '').trim(),
            thinking: String(thinking || '').trim()
          };
        } finally {
          clearTimeout(timer);
          currentTimer = null;
        }
      }
    });

    const finalContent = result?.content || '';
    const finalThinking = result?.thinking || '';

    if (json) return parseJsonFromText(finalContent || finalThinking);

    return finalContent || finalThinking;
  } catch (error) {
    const message = normalizeApiError(error, '后台请求失败啦');

    if (hasKeyedSource || error?.isNetworkError || error?.isHttpError) {
      notifyApiError(message);
    }

    return json ? null : '';
  } finally {
    if (currentTimer) {
      clearTimeout(currentTimer);
      currentTimer = null;
    }
  }
}

export async function fetchModels(endpointId, timeout = DEFAULT_TIMEOUT) {
  const settings = getSettings();
  const targetId = endpointId || settings.defaultApiEndpointId;
  const hasUserEndpoint = Boolean(settings.apiEndpoints.find((item) => item.id === targetId)?.endpoint);

  if (hasUserEndpoint) {
    const { controller, timer } = createTimeoutController(timeout);

    try {
      const endpointConfig = findEndpoint(endpointId);

      if (endpointConfig.provider === 'gemini') {
        let base = endpointConfig.endpoint
          .replace(/\/v1beta\/models\/?$/i, '')
          .replace(/\/v1beta\/?$/i, '')
          .replace(/\/+$/, '');

        const url = new URL(`${base}/v1beta/models`);

        if (endpointConfig.apiKey) url.searchParams.set('key', endpointConfig.apiKey);

        const response = await fetch(url.toString(), {
          method: 'GET',
          signal: controller.signal
        });

        if (!response.ok) throw await buildHttpError(response);

        const data = await response.json();
        const models = Array.isArray(data.models) ? data.models : [];

        return models
          .map((m) => {
            const name = m?.name || '';
            return name.replace(/^models\//, '');
          })
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
      }

      const url = smartModelsUrl(endpointConfig.endpoint, endpointConfig.provider);

      const response = await fetch(url, {
        method: 'GET',
        headers: buildHeaders(endpointConfig.apiKey, endpointConfig.provider),
        signal: controller.signal
      });

      if (!response.ok) throw await buildHttpError(response);

      const data = await response.json();

      if (endpointConfig.provider === 'ollama') {
        const models = Array.isArray(data.models) ? data.models : [];

        return models
          .map((m) => m?.name)
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
      }

      const models = Array.isArray(data.data) ? data.data : [];

      return models
        .map((m) => m?.id)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
    } catch (error) {
      const normalizedError = isBrowserBlockedError(error) ? createNetworkError(error, { isUser: true }) : error;
      const message = normalizeApiError(normalizedError, '拉取模型失败啦');

      notifyApiError(message);
    } finally {
      clearTimeout(timer);
    }
  }

  for (const anon of ANONYMOUS_SOURCES) {
    const { controller, timer } = createTimeoutController(timeout);

    try {
      const url = smartModelsUrl(anon.endpoint, 'openai');

      const response = await fetch(url, {
        method: 'GET',
        headers: buildHeaders('', 'openai'),
        signal: controller.signal
      });

      if (!response.ok) continue;

      const data = await response.json();
      const models = Array.isArray(data.data) ? data.data : [];

      const list = models
        .map((m) => m?.id)
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));

      if (list.length) {
        if (!hasUserEndpoint) notifyApiInfo(`从 ${anon.name} 拉到 ${list.length} 个模型`);
        return list;
      }
    } catch {
      continue;
    } finally {
      clearTimeout(timer);
    }
  }

  return [];
}

// 依赖：./storage.js(getData)
