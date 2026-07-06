// ============================================
// ai-client.js — AI统一请求入口
// 所有AI请求（聊天/视觉）只走这里
// 负责：读API配置 → 组装请求 → 流式/非流式 → 超时 → 重试 → 失败兜底 → 事件发出
// 不负责：上下文组装（交给 ai-context.js）、UI渲染
// ============================================

import { STORAGE_KEYS } from '../../core/storage-keys.js';
import { getSetting } from '../../core/storage.js';
import { assembleContext } from './ai-context.js';
import { getFallbackResponse, shouldRetry, getRetryDelay } from './ai-fallback.js';
import {
  classifyError,
  emitRequestStarted,
  emitResponseChunk,
  emitResponseComplete,
  emitError,
  emitFallbackUsed
} from './ai-events.js';

// ========== API配置读取 ==========

// 读取当前激活的API分组配置
// 返回 { baseURL, apiKey, model } 或 null
function _getActiveAPIConfig() {
  // 从存储读取API分组配置
  const groups = getSetting(STORAGE_KEYS.API_GROUPS);
  const defaultModel = getSetting(STORAGE_KEYS.API_DEFAULT_CHAT_MODEL);

  if (!groups) return null;

  // groups 可能是数组或对象
  // 数组格式：[{ id, name, baseURL, apiKey, active, models: [] }]
  // 对象格式：{ default: { baseURL, apiKey, active }, ... }
  let activeGroup = null;

  if (Array.isArray(groups)) {
    activeGroup = groups.find(g => g.active) || groups[0];
  } else if (typeof groups === 'object') {
    const entries = Object.values(groups);
    activeGroup = entries.find(g => g.active) || entries[0];
  }

  if (!activeGroup || !activeGroup.baseURL) return null;

  return {
    baseURL: activeGroup.baseURL,
    apiKey: activeGroup.apiKey || '',
    model: defaultModel || activeGroup.model || ''
  };
}

// 检查API是否已配置可用
function isAPIConfigured() {
  return _getActiveAPIConfig() !== null;
}

// ========== 主请求入口 ==========

// 发送聊天请求
// options:
//   characterId, conversationId, appId, userMessage, history
//   onChunk: 流式分片回调 (chunk) => void
//   signal: 外部AbortSignal
//   retry: 是否自动重试（默认true）
// 返回 { text, requestId, degraded, error }
async function sendChat(options = {}) {
  const {
    characterId,
    conversationId,
    appId,
    userMessage,
    history = [],
    onChunk = null,
    signal = null,
    retry = true
  } = options;

  // 1. 组装上下文
  const context = await assembleContext({
    characterId,
    conversationId,
    appId,
    userMessage,
    history
  });

  // 2. 发出请求开始事件
  const started = emitRequestStarted({
    characterId: context.characterId,
    conversationId,
    appId
  });
  const requestId = started.requestId;

  // 3. 检查API配置
  const apiConfig = _getActiveAPIConfig();
  if (!apiConfig) {
    return _handleNoConfig(requestId, userMessage);
  }

  // 4. 发送请求（带重试）
  const maxAttempts = retry ? 2 : 1;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await _doRequest({
        apiConfig,
        messages: context.messages,
        temperature: context.temperature,
        stream: context.stream,
        timeout: context.timeout,
        onChunk: (chunk) => {
          emitResponseChunk(requestId, chunk);
          if (typeof onChunk === 'function') onChunk(chunk);
        },
        signal
      });

      // 成功
      emitResponseComplete(requestId, result.text, {
        degraded: false,
        meta: context.meta
      });

      return {
        text: result.text,
        requestId,
        degraded: false,
        error: null
      };

    } catch (err) {
      lastError = err;

      // 如果外部主动取消，不重试
      if (signal?.aborted) break;

      const errorType = classifyError(err);
      emitError(requestId, err);

      // 判断是否重试
      if (attempt < maxAttempts && shouldRetry(errorType, attempt)) {
        await _sleep(getRetryDelay(attempt));
        continue;
      }

      // 不重试或重试用完，走兜底
      break;
    }
  }

  // 5. 走兜底
  return _handleFallback(requestId, lastError, userMessage);
}

// ========== 实际请求 ==========

async function _doRequest({ apiConfig, messages, temperature, stream, timeout, onChunk, signal }) {
  const url = _buildRequestURL(apiConfig.baseURL);
  const headers = _buildHeaders(apiConfig.apiKey);
  const body = JSON.stringify({
    model: apiConfig.model,
    messages,
    temperature,
    stream: !!stream
  });

  // 超时控制
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  // 如果外部传了signal，联动取消
  if (signal) {
    if (signal.aborted) controller.abort();
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal
    });

    if (!response.ok) {
      const errorBody = await _safeReadError(response);
      const err = new Error(`API返回 ${response.status}: ${errorBody || response.statusText}`);
      err.status = response.status;
      throw err;
    }

    if (stream && response.body) {
      const text = await _readStream(response.body, onChunk);
      return { text };
    } else {
      const data = await response.json();
      const text = _extractContent(data);
      return { text };
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

// 构建请求URL（兼容不同API格式的baseURL结尾）
function _buildRequestURL(baseURL) {
  const base = baseURL.replace(/\/+$/, '');
  // 如果baseURL已经包含 /chat/completions 就不再追加
  if (base.endsWith('/chat/completions') || base.endsWith('/v1/chat/completions')) {
    return base;
  }
  // 默认追加OpenAI兼容格式
  if (base.endsWith('/v1')) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

function _buildHeaders(apiKey) {
  const headers = {
    'Content-Type': 'application/json'
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

// 流式读取（SSE格式）
async function _readStream(body, onChunk) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 按行处理SSE
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 最后一行可能不完整，留着

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':')) continue;
        if (!trimmed.startsWith('data:')) continue;

        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content || '';
          if (delta) {
            fullText += delta;
            if (typeof onChunk === 'function') onChunk(delta);
          }
        } catch {
          // 单行解析失败跳过，不影响整体
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return fullText;
}

// 从非流式响应中提取文本内容
function _extractContent(data) {
  if (!data) return '';
  // OpenAI格式
  if (data.choices?.[0]?.message?.content) {
    return data.choices[0].message.content;
  }
  // 兜底
  if (typeof data === 'string') return data;
  if (data.content) return data.content;
  if (data.text) return data.text;
  return '';
}

// ========== 兜底处理 ==========

function _handleNoConfig(requestId, userMessage) {
  const fallback = getFallbackResponse('no_config', { userMessage });
  emitFallbackUsed(requestId, { ...fallback, errorType: 'no_config' });
  return {
    text: fallback.text,
    requestId,
    degraded: true,
    error: { type: 'no_config', message: fallback.reason }
  };
}

function _handleFallback(requestId, error, userMessage) {
  const errorType = classifyError(error);
  const fallback = getFallbackResponse(errorType, { userMessage });
  emitFallbackUsed(requestId, { ...fallback, errorType });
  return {
    text: fallback.text,
    requestId,
    degraded: true,
    error: { type: errorType, message: fallback.reason, original: error?.message }
  };
}

// ========== 工具 ==========

async function _safeReadError(response) {
  try {
    const text = await response.text();
    return text.slice(0, 200);
  } catch {
    return '';
  }
}

function _sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export {
  sendChat,
  isAPIConfigured
};
