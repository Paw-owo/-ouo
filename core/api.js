/* core/api.js - AI 调用层
   支持 OpenAI 兼容格式 /v1/chat/completions
   支持流式 SSE、多 API 配置、拉取模型列表、角色默认配置、对话临时切换 */

import {
  getSettings,
  saveSettings,
  getApiConfig,
  resolveApiConfig,
  uuid,
} from './storage.js';

/* ============ URL 处理 ============ */

function trimSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

function normalizeEndpoint(endpoint) {
  return trimSlash(endpoint || '');
}

function buildChatUrl(endpoint) {
  const base = normalizeEndpoint(endpoint);
  if (!base) return '';
  if (base.endsWith('/v1/chat/completions')) return base;
  if (base.endsWith('/chat/completions')) return base;
  if (base.endsWith('/v1')) return `${base}/chat/completions`;
  return `${base}/v1/chat/completions`;
}

function buildModelsUrl(endpoint) {
  const base = normalizeEndpoint(endpoint);
  if (!base) return '';
  if (base.endsWith('/v1/models')) return base;
  if (base.endsWith('/models')) return base;
  if (base.endsWith('/v1')) return `${base}/models`;
  return `${base}/v1/models`;
}

function authHeaders(apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  return headers;
}

/* ============ API 配置管理 ============ */

export function createApiConfig(partial = {}) {
  return {
    id: uuid(),
    name: '新接口',
    endpoint: '',
    apiKey: '',
    models: [],
    selectedModel: '',
    createdAt: Date.now(),
    ...partial,
  };
}

export function getApiConfigs() {
  return getSettings().apiConfigs || [];
}

export function saveApiConfig(config) {
  const settings = getSettings();
  const list = settings.apiConfigs || [];
  const idx = list.findIndex((item) => item.id === config.id);

  if (idx >= 0) list[idx] = config;
  else list.push(config);

  settings.apiConfigs = list;

  if (!settings.defaultApiConfigId && list.length) {
    settings.defaultApiConfigId = list[0].id;
  }

  saveSettings(settings);
  return config;
}

export function deleteApiConfig(id) {
  const settings = getSettings();
  settings.apiConfigs = (settings.apiConfigs || []).filter((item) => item.id !== id);

  if (settings.defaultApiConfigId === id) {
    settings.defaultApiConfigId = settings.apiConfigs[0]?.id || '';
  }

  saveSettings(settings);
}

export function setDefaultApiConfig(id) {
  const settings = getSettings();
  settings.defaultApiConfigId = id;
  saveSettings(settings);
}

/* ============ 拉取模型列表 ============ */

export async function fetchModels(configOrId) {
  const config = typeof configOrId === 'string' ? getApiConfig(configOrId) : configOrId;
  if (!config || !config.endpoint) {
    return { ok: false, models: [], error: '缺少 endpoint' };
  }

  try {
    const res = await fetch(buildModelsUrl(config.endpoint), {
      method: 'GET',
      headers: authHeaders(config.apiKey),
    });

    if (!res.ok) {
      return { ok: false, models: [], error: `模型拉取失败：${res.status}` };
    }

    const json = await res.json();
    const models = parseModelsResponse(json);

    const updated = {
      ...config,
      models,
      selectedModel: config.selectedModel || models[0] || '',
    };

    saveApiConfig(updated);

    return { ok: true, models, config: updated };
  } catch (error) {
    return { ok: false, models: [], error: error.message || '模型拉取失败' };
  }
}

function parseModelsResponse(json) {
  if (!json) return [];

  if (Array.isArray(json.data)) {
    return json.data
      .map((item) => (typeof item === 'string' ? item : item.id || item.name || ''))
      .filter(Boolean);
  }

  if (Array.isArray(json.models)) {
    return json.models
      .map((item) => (typeof item === 'string' ? item : item.id || item.name || ''))
      .filter(Boolean);
  }

  if (Array.isArray(json)) {
    return json
      .map((item) => (typeof item === 'string' ? item : item.id || item.name || ''))
      .filter(Boolean);
  }

  return [];
}

/* ============ 当前对话 API 解析 ============ */
/* 优先级：
   1. 对话临时配置 conversationConfig.apiConfigId / model
   2. 角色绑定 character.apiConfigId / model
   3. 设置里的默认 API 配置
   4. 第一条 API 配置
*/

export function resolveChatConfig(character = null, conversationConfig = {}) {
  const settings = getSettings();
  const apiConfigs = settings.apiConfigs || [];

  let apiConfig = null;

  if (conversationConfig.apiConfigId) {
    apiConfig = apiConfigs.find((item) => item.id === conversationConfig.apiConfigId) || null;
  }

  if (!apiConfig && character) {
    apiConfig = resolveApiConfig(character);
  }

  if (!apiConfig && settings.defaultApiConfigId) {
    apiConfig = apiConfigs.find((item) => item.id === settings.defaultApiConfigId) || null;
  }

  if (!apiConfig) {
    apiConfig = apiConfigs[0] || null;
  }

  const model =
    conversationConfig.model ||
    character?.model ||
    apiConfig?.selectedModel ||
    '';

  return { apiConfig, model };
}

/* ============ Chat Completions ============ */

export async function chatCompletion({
  character = null,
  conversationConfig = {},
  messages = [],
  tools = null,
  temperature = 0.8,
  stream = true,
  signal = null,
  onStart = null,
  onToken = null,
  onThinking = null,
  onRaw = null,
  onDone = null,
  onError = null,
} = {}) {
  const { apiConfig, model } = resolveChatConfig(character, conversationConfig);

  if (!apiConfig || !apiConfig.endpoint) {
    const error = new Error('还没有配置 API endpoint');
    onError?.(error);
    throw error;
  }

  if (!model) {
    const error = new Error('还没有选择模型');
    onError?.(error);
    throw error;
  }

  const body = {
    model,
    messages,
    temperature,
    stream,
  };

  if (tools && Array.isArray(tools) && tools.length) {
    body.tools = tools;
  }

  onStart?.({ apiConfig, model, body });

  try {
    const res = await fetch(buildChatUrl(apiConfig.endpoint), {
      method: 'POST',
      headers: authHeaders(apiConfig.apiKey),
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = await safeReadText(res);
      throw new Error(text || `请求失败：${res.status}`);
    }

    if (stream) {
      return await readSSE(res, { onToken, onThinking, onRaw, onDone });
    }

    const json = await res.json();
    onRaw?.(json);

    const parsed = parseNonStreamResult(json);
    onThinking?.(parsed.thinking);
    onToken?.(parsed.content);
    onDone?.(parsed);

    return parsed;
  } catch (error) {
    onError?.(error);
    throw error;
  }
}

/* ============ 非流式结果解析 ============ */

function parseNonStreamResult(json) {
  const choice = json?.choices?.[0] || {};
  const message = choice.message || {};
  const rawContent = message.content || '';

  const thinking =
    message.thinking ||
    json?.thinking ||
    extractThinking(rawContent);

  const content = removeThinking(rawContent);

  return {
    content,
    thinking,
    raw: json,
    finishReason: choice.finish_reason || '',
  };
}

/* ============ SSE 读取 ============ */

async function readSSE(res, handlers = {}) {
  const { onToken, onThinking, onRaw, onDone } = handlers;

  const reader = res.body.getReader();
  const decoder = new TextDecoder('utf-8');

  let buffer = '';
  let fullContent = '';
  let fullThinking = '';
  let finished = false;

  while (!finished) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';

    for (const part of parts) {
      const lines = part
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        if (!line.startsWith('data:')) continue;

        const data = line.replace(/^data:\s*/, '');

        if (data === '[DONE]') {
          finished = true;
          break;
        }

        try {
          const json = JSON.parse(data);
          onRaw?.(json);

          const delta = json?.choices?.[0]?.delta || {};
          const thinkingDelta =
            delta.thinking ||
            delta.reasoning_content ||
            delta.reasoning ||
            '';

          const contentDelta = delta.content || '';

          if (thinkingDelta) {
            fullThinking += thinkingDelta;
            onThinking?.(fullThinking, thinkingDelta);
          }

          if (contentDelta) {
            fullContent += contentDelta;
            onToken?.(contentDelta, fullContent);
          }
        } catch {
          // 忽略无法解析的 SSE 片段
        }
      }
    }
  }

  const extractedThinking = extractThinking(fullContent);
  const finalThinking = fullThinking || extractedThinking;
  const finalContent = removeThinking(fullContent);

  const result = {
    content: finalContent,
    thinking: finalThinking,
    raw: null,
    finishReason: 'stop',
  };

  onDone?.(result);
  return result;
}

/* ============ thinking 标签处理 ============ */

export function extractThinking(content = '') {
  const match = String(content).match(/<thinking>([\s\S]*?)<\/thinking>/i);
  return match ? match[1].trim() : '';
}

export function removeThinking(content = '') {
  return String(content).replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
}

/* ============ 消息构建辅助 ============ */

export function createSystemMessage(content) {
  return { role: 'system', content: content || '' };
}

export function createUserMessage(content) {
  return { role: 'user', content: content || '' };
}

export function createAssistantMessage(content) {
  return { role: 'assistant', content: content || '' };
}

/* ============ 表情包视觉识别 ============
   用当前 API 的视觉模型识别图片内容，返回简短描述
   如果没有视觉模型，会返回空字符串，设置页可手动填写 */

export async function describeImageWithVision({
  imageBase64,
  prompt = '请用不超过12个中文字符描述这张表情包的情绪或内容。',
  apiConfigId = '',
  model = '',
} = {}) {
  const settings = getSettings();
  const apiConfig =
    (apiConfigId && getApiConfig(apiConfigId)) ||
    (settings.defaultApiConfigId && getApiConfig(settings.defaultApiConfigId)) ||
    settings.apiConfigs?.[0];

  const visionModel = model || settings.visionModel || apiConfig?.selectedModel || '';

  if (!apiConfig || !apiConfig.endpoint || !visionModel || !imageBase64) {
    return '';
  }

  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageBase64 } },
      ],
    },
  ];

  try {
    const result = await chatCompletion({
      conversationConfig: { apiConfigId: apiConfig.id, model: visionModel },
      messages,
      stream: false,
      temperature: 0.2,
    });

    return String(result.content || '').trim();
  } catch {
    return '';
  }
}

/* ============ 通用文件下载 ============ */

export function downloadText(filename, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ============ 工具 ============ */

async function safeReadText(res) {
  try {
    return await res.text();
  } catch {
    return '';
  }
}
