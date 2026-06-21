import {
  getSettings,
  updateSettings,
  getCharacter,
  saveCharacter,
  uuid,
  clone
} from './storage.js';

export const API_RUNTIME_KEY = 'ai_phone_runtime_api_v1';

export const DEFAULT_MODEL = '';

export function normalizeApiConfig(config = {}) {
  return {
    id: config.id || uuid(),
    name: config.name || config.label || 'API配置',
    endpoint: config.endpoint || config.url || '',
    apiKey: config.apiKey || config.key || '',
    model: config.model || config.defaultModel || '',
    models: Array.isArray(config.models) ? config.models : [],
    enabled: config.enabled !== false,
    createdAt: config.createdAt || new Date().toISOString(),
    updatedAt: config.updatedAt || new Date().toISOString()
  };
}

export function normalizeApiConfigs(configs = []) {
  return Array.isArray(configs) ? configs.map(normalizeApiConfig) : [];
}

export function getApiConfigs() {
  return normalizeApiConfigs(getSettings().apiConfigs);
}

export function getApiConfig(configId = '') {
  const configs = getApiConfigs();

  if (configId) {
    return configs.find((config) => config.id === configId) || null;
  }

  return null;
}

export function getDefaultApiConfig() {
  const settings = getSettings();
  const configs = getApiConfigs();

  if (!configs.length) {
    return null;
  }

  return configs.find((config) => config.id === settings.defaultApiConfigId) || configs[0];
}

export function saveApiConfig(config) {
  const normalized = normalizeApiConfig({
    ...config,
    updatedAt: new Date().toISOString()
  });

  updateSettings((settings) => {
    const configs = normalizeApiConfigs(settings.apiConfigs);
    const index = configs.findIndex((item) => item.id === normalized.id);

    if (index >= 0) {
      configs[index] = normalized;
    } else {
      configs.unshift(normalized);
    }

    settings.apiConfigs = configs;

    if (!settings.defaultApiConfigId) {
      settings.defaultApiConfigId = normalized.id;
    }

    return settings;
  });

  return normalized;
}

export function deleteApiConfig(configId) {
  updateSettings((settings) => {
    settings.apiConfigs = normalizeApiConfigs(settings.apiConfigs).filter((config) => config.id !== configId);

    if (settings.defaultApiConfigId === configId) {
      settings.defaultApiConfigId = settings.apiConfigs[0]?.id || '';
    }

    return settings;
  });
}

export function setDefaultApiConfig(configId) {
  updateSettings((settings) => {
    settings.defaultApiConfigId = configId || '';
    return settings;
  });

  return getApiConfig(configId);
}

export function setApiConfigModels(configId, models = []) {
  const config = getApiConfig(configId);

  if (!config) {
    return null;
  }

  return saveApiConfig({
    ...config,
    models,
    model: config.model || models[0] || ''
  });
}

export function bindCharacterApiConfig(characterId, apiConfig = {}) {
  const character = getCharacter(characterId);

  if (!character) {
    return null;
  }

  character.apiConfig = {
    endpoint: apiConfig.endpoint || '',
    model: apiConfig.model || '',
    apiKey: apiConfig.apiKey || '',
    configId: apiConfig.configId || apiConfig.id || ''
  };

  return saveCharacter(character);
}

export function getRuntimeApiMap() {
  try {
    return JSON.parse(sessionStorage.getItem(API_RUNTIME_KEY) || '{}');
  } catch {
    return {};
  }
}

export function setRuntimeApiMap(map) {
  try {
    sessionStorage.setItem(API_RUNTIME_KEY, JSON.stringify(map || {}));
  } catch {}
}

export function getRuntimeApi(conversationId) {
  const map = getRuntimeApiMap();
  return conversationId ? map[conversationId] || null : null;
}

export function setRuntimeApi(conversationId, apiState = {}) {
  if (!conversationId) {
    return null;
  }

  const map = getRuntimeApiMap();

  map[conversationId] = {
    configId: apiState.configId || '',
    model: apiState.model || '',
    endpoint: apiState.endpoint || '',
    apiKey: apiState.apiKey || ''
  };

  setRuntimeApiMap(map);

  window.dispatchEvent(new CustomEvent('ai-phone-api-runtime-change', {
    detail: {
      conversationId,
      apiState: map[conversationId]
    }
  }));

  return map[conversationId];
}

export function clearRuntimeApi(conversationId) {
  const map = getRuntimeApiMap();
  delete map[conversationId];
  setRuntimeApiMap(map);
}

export function normalizeEndpoint(endpoint = '') {
  return String(endpoint || '').trim().replace(/\/+$/, '');
}

export function getChatCompletionsUrl(endpoint = '') {
  const cleanEndpoint = normalizeEndpoint(endpoint);

  if (!cleanEndpoint) {
    return '';
  }

  if (cleanEndpoint.endsWith('/chat/completions')) {
    return cleanEndpoint;
  }

  if (cleanEndpoint.endsWith('/v1')) {
    return `${cleanEndpoint}/chat/completions`;
  }

  if (cleanEndpoint.includes('/v1/')) {
    return `${cleanEndpoint}/chat/completions`;
  }

  return `${cleanEndpoint}/v1/chat/completions`;
}

export function getModelsUrl(endpoint = '') {
  const cleanEndpoint = normalizeEndpoint(endpoint);

  if (!cleanEndpoint) {
    return '';
  }

  if (cleanEndpoint.endsWith('/chat/completions')) {
    return cleanEndpoint.replace(/\/chat\/completions$/, '/models');
  }

  if (cleanEndpoint.endsWith('/models')) {
    return cleanEndpoint;
  }

  if (cleanEndpoint.endsWith('/v1')) {
    return `${cleanEndpoint}/models`;
  }

  if (cleanEndpoint.includes('/v1/')) {
    return cleanEndpoint.replace(/\/[^/]*$/, '/models');
  }

  return `${cleanEndpoint}/v1/models`;
}

export function createHeaders(apiKey = '', extraHeaders = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...extraHeaders
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

export async function fetchModels(inputConfig = {}) {
  const config = normalizeApiConfig(inputConfig);
  const url = getModelsUrl(config.endpoint);

  if (!url) {
    throw new Error('请先填写API端点');
  }

  const response = await fetch(url, {
    method: 'GET',
    headers: createHeaders(config.apiKey)
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `模型拉取失败：${response.status}`);
  }

  const data = await response.json();
  const models = extractModels(data);

  return models;
}

export async function fetchAndSaveModels(configId) {
  const config = getApiConfig(configId);

  if (!config) {
    throw new Error('找不到API配置');
  }

  const models = await fetchModels(config);
  setApiConfigModels(configId, models);

  return models;
}

export function extractModels(data) {
  if (Array.isArray(data)) {
    return data.map((item) => typeof item === 'string' ? item : item.id || item.name || '').filter(Boolean);
  }

  if (Array.isArray(data?.data)) {
    return data.data.map((item) => typeof item === 'string' ? item : item.id || item.name || '').filter(Boolean);
  }

  if (Array.isArray(data?.models)) {
    return data.models.map((item) => typeof item === 'string' ? item : item.id || item.name || '').filter(Boolean);
  }

  return [];
}

export function resolveApiConfig(options = {}) {
  const character = options.characterId ? getCharacter(options.characterId) : options.character || null;
  const runtime = options.conversationId ? getRuntimeApi(options.conversationId) : null;
  const settingsDefault = getDefaultApiConfig();
  const runtimeBase = runtime?.configId ? getApiConfig(runtime.configId) : null;
  const optionBase = options.configId ? getApiConfig(options.configId) : null;
  const characterConfigId = character?.apiConfig?.configId || '';
  const characterBase = characterConfigId ? getApiConfig(characterConfigId) : null;
  const base = optionBase || runtimeBase || characterBase || settingsDefault || null;

  const resolved = normalizeApiConfig({
    ...(base || {}),
    endpoint: options.endpoint || runtime?.endpoint || character?.apiConfig?.endpoint || base?.endpoint || '',
    apiKey: options.apiKey || runtime?.apiKey || character?.apiConfig?.apiKey || base?.apiKey || '',
    model: options.model || runtime?.model || character?.apiConfig?.model || base?.model || DEFAULT_MODEL,
    name: base?.name || '临时API配置',
    id: base?.id || options.configId || runtime?.configId || characterConfigId || ''
  });

  return resolved;
}

export function formatMessages(messages = []) {
  return messages
    .filter((message) => message && message.role && message.content !== undefined && message.content !== null)
    .map((message) => ({
      role: message.role,
      content: String(message.content)
    }));
}

export function createChatPayload(options = {}) {
  const payload = {
    model: options.model || DEFAULT_MODEL,
    messages: formatMessages(options.messages || []),
    stream: Boolean(options.stream)
  };

  if (Number.isFinite(Number(options.temperature))) {
    payload.temperature = Number(options.temperature);
  }

  if (Number.isFinite(Number(options.max_tokens))) {
    payload.max_tokens = Number(options.max_tokens);
  }

  if (Number.isFinite(Number(options.maxTokens))) {
    payload.max_tokens = Number(options.maxTokens);
  }

  if (options.tools) {
    payload.tools = options.tools;
  }

  if (options.tool_choice) {
    payload.tool_choice = options.tool_choice;
  }

  if (options.response_format) {
    payload.response_format = options.response_format;
  }

  return {
    ...payload,
    ...(options.extraBody || {})
  };
}

export function extractThinkingFromText(text = '') {
  const match = String(text).match(/<thinking>([\s\S]*?)<\/thinking>/i);

  if (!match) {
    return {
      thinking: '',
      content: text
    };
  }

  return {
    thinking: match[1].trim(),
    content: String(text).replace(match[0], '').trim()
  };
}

export function extractChoiceMessage(data = {}) {
  const message = data.choices?.[0]?.message || {};
  const rawContent = message.content || '';
  const tagResult = extractThinkingFromText(rawContent);

  return {
    content: tagResult.content,
    thinking: message.thinking || message.reasoning_content || tagResult.thinking || '',
    raw: rawContent,
    usage: data.usage || null,
    finishReason: data.choices?.[0]?.finish_reason || ''
  };
}

export function extractDelta(data = {}) {
  const choice = data.choices?.[0] || {};
  const delta = choice.delta || {};

  return {
    content: delta.content || '',
    thinking: delta.thinking || delta.reasoning_content || '',
    role: delta.role || '',
    finishReason: choice.finish_reason || ''
  };
}

export async function createChatCompletion(options = {}) {
  const apiConfig = resolveApiConfig(options);
  const url = getChatCompletionsUrl(apiConfig.endpoint);

  if (!url) {
    throw new Error('请先填写API端点');
  }

  if (!apiConfig.model && !options.model) {
    throw new Error('请先选择或输入模型');
  }

  const payload = createChatPayload({
    ...options,
    model: options.model || apiConfig.model
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: createHeaders(apiConfig.apiKey, options.headers || {}),
    body: JSON.stringify(payload),
    signal: options.signal
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `AI请求失败：${response.status}`);
  }

  if (payload.stream) {
    return readStreamResponse(response, options);
  }

  const data = await response.json();
  const result = extractChoiceMessage(data);

  if (typeof options.onDone === 'function') {
    options.onDone(result);
  }

  return result;
}

export async function readStreamResponse(response, options = {}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let content = '';
  let thinking = '';
  let raw = '';

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();

      if (!trimmed || !trimmed.startsWith('data:')) {
        continue;
      }

      const dataText = trimmed.replace(/^data:\s*/, '');

      if (dataText === '[DONE]') {
        continue;
      }

      try {
        const data = JSON.parse(dataText);
        raw += dataText + '\n';

        const delta = extractDelta(data);

        if (delta.thinking) {
          thinking += delta.thinking;

          if (typeof options.onThinking === 'function') {
            options.onThinking(delta.thinking, thinking);
          }
        }

        if (delta.content) {
          content += delta.content;

          if (typeof options.onDelta === 'function') {
            options.onDelta(delta.content, content);
          }
        }

        if (typeof options.onChunk === 'function') {
          options.onChunk(data, {
            content,
            thinking,
            raw
          });
        }
      } catch {}
    }
  }

  const tagResult = extractThinkingFromText(content);

  if (tagResult.thinking) {
    thinking = thinking || tagResult.thinking;
    content = tagResult.content;
  }

  const result = {
    content,
    thinking,
    raw
  };

  if (typeof options.onDone === 'function') {
    options.onDone(result);
  }

  return result;
}

export function createAbortController() {
  return new AbortController();
}

export async function testApiConfig(config, model = '') {
  const apiConfig = normalizeApiConfig({
    ...config,
    model: model || config.model
  });

  const result = await createChatCompletion({
    endpoint: apiConfig.endpoint,
    apiKey: apiConfig.apiKey,
    model: apiConfig.model,
    stream: false,
    messages: [
      {
        role: 'user',
        content: '请回复“连接成功”。'
      }
    ]
  });

  return result;
}

export function onRuntimeApiChange(callback) {
  const handler = (event) => callback(event.detail);
  window.addEventListener('ai-phone-api-runtime-change', handler);

  return () => {
    window.removeEventListener('ai-phone-api-runtime-change', handler);
  };
}

export function getApiDisplayName(config = {}) {
  const normalized = normalizeApiConfig(config);
  const modelText = normalized.model ? ` · ${normalized.model}` : '';
  return `${normalized.name}${modelText}`;
}

export function toOpenAIMessages(systemPrompt = '', history = []) {
  const messages = [];

  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt
    });
  }

  history.forEach((item) => {
    if (item.role === 'user' || item.role === 'assistant' || item.role === 'system') {
      messages.push({
        role: item.role,
        content: item.content || ''
      });
    }
  });

  return messages;
}

export function copyApiConfig(config) {
  return clone(normalizeApiConfig(config));
}
