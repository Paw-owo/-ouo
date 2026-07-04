// core/api.js
// 多 provider（OpenAI/Anthropic/Gemini/Ollama）+ 轮换池 + fallback。
// 修复原 bug：
//  1) 免费组必须全部试过
//  2) 新旧机制统一为 callAPI 一套
//  3) buildAnthropicRequestBody 必须保留 system message
//  4) markPoolSourceSuccess/Error 加缓存
//  5) SSE 解析失败必须明确结束流
//  6) 首源超时 15s 而非 60s
//  7) testPoolEndpoint 允许自定义 prompt
// 依赖：core/storage.js, core/storage-keys.js, core/config.js, core/ui.js

import { STORES } from './storage-keys.js';
import { getData, setData, getAllDB, setDB } from './storage.js';
import { get as getConfig } from './config.js';
import { showToast } from './ui.js';

const DEFAULT_FREE_ENDPOINTS = [
  {
    id: 'siliconflow_free',
    name: '硅基流动（免费）',
    provider: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: '',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    group: 'free',
    enabled: true
  }
];

// ════════════════════════════════════════
// 轮换池
// ════════════════════════════════════════

export async function getPool() {
  let pool = getData('api_pool', null);
  if (!pool || !Array.isArray(pool) || !pool.length) {
    // 从 IndexedDB 兜底
    try {
      const records = await getAllDB(STORES.apiPool);
      pool = records.length ? records : DEFAULT_FREE_ENDPOINTS;
    } catch (e) {
      pool = DEFAULT_FREE_ENDPOINTS;
    }
  }
  return pool.filter((e) => e.enabled !== false);
}

export async function savePoolEntry(entry) {
  if (!entry || !entry.id) throw new Error('缺少 id 嘛');
  await setDB(STORES.apiPool, entry.id, entry);
  // 同步到 localStorage 加速
  const pool = await getPool();
  setData('api_pool', pool);
  return entry;
}

export async function deletePoolEntry(id) {
  const { deleteDB } = await import('./storage.js');
  await deleteDB(STORES.apiPool, id);
  const pool = await getPool();
  setData('api_pool', pool);
}

// 缓存 markPoolSourceSuccess/Error 结果
const poolStatusCache = new Map();

export function markPoolSourceSuccess(endpointId) {
  poolStatusCache.set(endpointId, { ok: true, t: Date.now() });
}

export function markPoolSourceError(endpointId, error) {
  poolStatusCache.set(endpointId, { ok: false, t: Date.now(), error: String(error || '').slice(0, 200) });
}

export function getPoolStatus(endpointId) {
  return poolStatusCache.get(endpointId) || null;
}

// ════════════════════════════════════════
// 统一调用入口
// ════════════════════════════════════════

/**
 * 统一 AI 调用。三层回退：付费组 -> 免费组 -> 本地关键词。
 * @param {object} opts
 *   { messages, systemPrompt, characterId, stream, onChunk, signal, timeoutMs }
 */
export async function callAPI(opts = {}) {
  const { messages = [], systemPrompt = '', stream = false, onChunk, signal } = opts;
  const pool = await getPool();
  const paid = pool.filter((e) => e.group === 'paid');
  const free = pool.filter((e) => e.group === 'free');

  // 修复：首源超时 15s
  const firstTimeout = getConfig('ai.requestTimeoutMs', 15000);
  const fallbackTimeout = getConfig('ai.fallbackTimeoutMs', 60000);

  // 先试付费组（全部试过），再试免费组（全部试过）
  const order = [...paid, ...free];
  let lastError = null;
  for (const ep of order) {
    if (signal && signal.aborted) throw new Error('被打断啦');
    try {
      const result = await callEndpoint(ep, {
        messages, systemPrompt, stream, onChunk, signal,
        timeoutMs: order.indexOf(ep) === 0 ? firstTimeout : fallbackTimeout
      });
      markPoolSourceSuccess(ep.id);
      return result;
    } catch (e) {
      lastError = e;
      markPoolSourceError(ep.id, e);
      console.warn('[api] 端点失败，换下一个', ep.id, e);
      // 继续下一个
    }
  }

  // 全部失败 -> 抛出，由调用方决定是否走 local-chat
  const err = new Error(`所有端点都失败啦：${lastError ? lastError.message : '未知'}`);
  err.allFailed = true;
  err.lastError = lastError;
  throw err;
}

async function callEndpoint(ep, { messages, systemPrompt, stream, onChunk, signal, timeoutMs }) {
  switch (ep.provider) {
    case 'openai': return callOpenAI(ep, { messages, systemPrompt, stream, onChunk, signal, timeoutMs });
    case 'anthropic': return callAnthropic(ep, { messages, systemPrompt, stream, onChunk, signal, timeoutMs });
    case 'gemini': return callGemini(ep, { messages, systemPrompt, stream, onChunk, signal, timeoutMs });
    case 'ollama': return callOllama(ep, { messages, systemPrompt, stream, onChunk, signal, timeoutMs });
    default: throw new Error(`不认识的 provider：${ep.provider}`);
  }
}

function buildOpenAIRequestBody({ messages, systemPrompt, stream, model }) {
  const fullMessages = [];
  if (systemPrompt) fullMessages.push({ role: 'system', content: systemPrompt });
  for (const m of messages) {
    fullMessages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content });
  }
  return {
    model: model || 'gpt-3.5-turbo',
    messages: fullMessages,
    stream: !!stream,
    temperature: 0.8
  };
}

async function callOpenAI(ep, { messages, systemPrompt, stream, onChunk, signal, timeoutMs }) {
  const url = `${ep.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const body = buildOpenAIRequestBody({ messages, systemPrompt, stream, model: ep.model });
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(ep.apiKey ? { Authorization: `Bearer ${ep.apiKey}` } : {})
    },
    body: JSON.stringify(body),
    signal
  }, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!stream) {
    const data = await res.json();
    return { content: data.choices?.[0]?.message?.content || '', raw: data };
  }
  return parseSSEStream(res, onChunk);
}

// 修复：buildAnthropicRequestBody 必须保留 system message
function buildAnthropicRequestBody({ messages, systemPrompt, stream, model }) {
  // Anthropic 的 system 是顶级字段，不是 messages 里
  const userMessages = messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content
  }));
  return {
    model: model || 'claude-3-haiku-20240307',
    system: systemPrompt || undefined,  // 保留 system message
    messages: userMessages,
    max_tokens: 1024,
    stream: !!stream
  };
}

async function callAnthropic(ep, { messages, systemPrompt, stream, onChunk, signal, timeoutMs }) {
  const url = `${ep.baseUrl.replace(/\/$/, '')}/v1/messages`;
  const body = buildAnthropicRequestBody({ messages, systemPrompt, stream, model: ep.model });
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ep.apiKey || '',
      'anthropic-version': '2023-06-01',
      ...(stream ? { 'anthropic-dangerous-direct-browser-access': 'true' } : {})
    },
    body: JSON.stringify(body),
    signal
  }, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!stream) {
    const data = await res.json();
    return { content: data.content?.[0]?.text || '', raw: data };
  }
  return parseAnthropicSSE(res, onChunk);
}

async function callGemini(ep, { messages, systemPrompt, stream, onChunk, signal, timeoutMs }) {
  const model = ep.model || 'gemini-1.5-flash';
  const url = `${ep.baseUrl.replace(/\/$/, '')}/v1beta/models/${model}:generateContent?key=${ep.apiKey || ''}`;
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  const body = {
    contents,
    ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
    generationConfig: { temperature: 0.8 }
  };
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  }, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return { content: data.candidates?.[0]?.content?.parts?.[0]?.text || '', raw: data };
}

async function callOllama(ep, { messages, systemPrompt, stream, onChunk, signal, timeoutMs }) {
  const url = `${ep.baseUrl.replace(/\/$/, '')}/api/chat`;
  const body = {
    model: ep.model || 'llama3',
    messages: [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      ...messages.map((m) => ({ role: m.role, content: m.content }))
    ],
    stream: !!stream
  };
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  }, timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  if (!stream) {
    const data = await res.json();
    return { content: data.message?.content || '', raw: data };
  }
  return parseOllamaStream(res, onChunk);
}

// ════════════════════════════════════════
// SSE 流式解析（修复：解析失败必须明确结束流）
// ════════════════════════════════════════

async function parseSSEStream(res, onChunk) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  let streamEnded = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') { streamEnded = true; break; }
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content || '';
          if (delta && typeof onChunk === 'function') {
            onChunk(delta, full);
            full += delta;
          }
        } catch (e) {
          // 解析失败：跳过这一行但不结束流（除非严重错误）
          console.warn('[api] SSE 行解析失败', e);
        }
      }
      if (streamEnded) break;
    }
  } catch (e) {
    // 明确结束流
    console.warn('[api] SSE 流异常结束', e);
    throw e;
  } finally {
    try { reader.releaseLock(); } catch (e) {}
  }
  return { content: full, raw: null };
}

async function parseAnthropicSSE(res, onChunk) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        try {
          const json = JSON.parse(payload);
          if (json.type === 'content_block_delta' && json.delta?.text) {
            if (typeof onChunk === 'function') {
              onChunk(json.delta.text, full);
              full += json.delta.text;
            }
          }
        } catch (e) {
          console.warn('[api] Anthropic SSE 行解析失败', e);
        }
      }
    }
  } catch (e) {
    console.warn('[api] Anthropic SSE 流异常结束', e);
    throw e;
  } finally {
    try { reader.releaseLock(); } catch (e) {}
  }
  return { content: full, raw: null };
}

async function parseOllamaStream(res, onChunk) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let full = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const json = JSON.parse(trimmed);
          const delta = json.message?.content || '';
          if (delta && typeof onChunk === 'function') {
            onChunk(delta, full);
            full += delta;
          }
        } catch (e) {
          console.warn('[api] Ollama 流解析失败', e);
        }
      }
    }
  } catch (e) {
    console.warn('[api] Ollama 流异常结束', e);
    throw e;
  } finally {
    try { reader.releaseLock(); } catch (e) {}
  }
  return { content: full, raw: null };
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

function fetchWithTimeout(url, opts, timeoutMs) {
  const ctrl = new AbortController();
  const external = opts.signal;
  if (external) {
    if (external.aborted) ctrl.abort();
    else external.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// 测试单个端点（允许自定义 prompt）
export async function testPoolEndpoint(endpointId, customPrompt) {
  const pool = await getPool();
  const ep = pool.find((e) => e.id === endpointId);
  if (!ep) throw new Error('端点不存在嘛');
  const prompt = customPrompt || '你好呀，回我一句话好不好？';
  try {
    const r = await callEndpoint(ep, {
      messages: [{ role: 'user', content: prompt }],
      systemPrompt: '',
      stream: false,
      signal: null,
      timeoutMs: 15000
    });
    markPoolSourceSuccess(ep.id);
    return { ok: true, content: r.content };
  } catch (e) {
    markPoolSourceError(ep.id, e);
    return { ok: false, error: e.message };
  }
}

export async function testAllEndpoints() {
  const pool = await getPool();
  const results = [];
  for (const ep of pool) {
    results.push({ id: ep.id, name: ep.name, ...(await testPoolEndpoint(ep.id)) });
  }
  return results;
}

// 拉取模型列表
export async function fetchModels(endpointId) {
  const pool = await getPool();
  const ep = pool.find((e) => e.id === endpointId);
  if (!ep) throw new Error('端点不存在嘛');
  const url = `${ep.baseUrl.replace(/\/$/, '')}/models`;
  const res = await fetchWithTimeout(url, {
    headers: { ...(ep.apiKey ? { Authorization: `Bearer ${ep.apiKey}` } : {}) }
  }, 15000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return (data.data || data.models || []).map((m) => m.id || m.name).filter(Boolean);
}

export { DEFAULT_FREE_ENDPOINTS };
