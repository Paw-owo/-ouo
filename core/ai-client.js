// core/ai-client.js
// 统一 AI 接口调用。所有 App 调 AI 必须走这里。
// 职责：
//   1) 读 settings 里的 AI 配置（url / apiKey / model / style / chain）
//   2) 流式输出（OpenAI 兼容 /v1/chat/completions，stream:true）
//   3) 无配置 → 返回 null，调用方走本地兜底
//   4) 失败可重试，超时友好提示
//   5) 注入角色人设 + 记忆 + 最近事件上下文
// 依赖：core/storage-keys.js, core/storage.js, core/memory.js, core/events.js, core/config.js
// 红线：不硬编码 URL/Key，全部从用户配置读；无配置不卡死。

import { KEYS } from './storage-keys.js';
import { getData, setData } from './storage.js';
import bus from './events.js';
import { get as getConfig } from './config.js';

// ════════════════════════════════════════
// 配置读写
// ════════════════════════════════════════

const DEFAULT_AI_CONFIG = Object.freeze({
  url: '',           // 例：https://api.openai.com/v1/chat/completions
  apiKey: '',        // sk-xxx
  model: 'gpt-4o-mini',
  style: '温柔可爱，第一人称，软萌语气，偶尔用"嘛""啦""呀"结尾',
  enableChain: false, // 思维链开关
  temperature: 0.8,
  maxTokens: 800,
  timeoutMs: 30000
});

export function getAIConfig() {
  const saved = getData(KEYS.aiConfig, null);
  if (!saved || typeof saved !== 'object') return { ...DEFAULT_AI_CONFIG };
  return { ...DEFAULT_AI_CONFIG, ...saved };
}

export function saveAIConfig(patch) {
  const cur = getAIConfig();
  const next = { ...cur, ...patch };
  setData(KEYS.aiConfig, next);
  bus.emit('ai:config-changed', { config: next });
  return next;
}

/** 是否配置了可用 AI（url + apiKey 都有） */
export function isAIConfigured() {
  const c = getAIConfig();
  return !!(c.url && c.apiKey);
}

// ════════════════════════════════════════
// 上下文构建
// ════════════════════════════════════════

/**
 * 构建发给 AI 的 messages 数组。
 * @param {object} opts { character, history, userText, memoryPrompt, recentEvents }
 *   - character: 角色对象 {name, persona, greeting, temperature}
 *   - history: 最近消息数组 [{role, content}]
 *   - userText: 本次用户输入
 *   - memoryPrompt: 记忆 prompt（来自 memory.buildMemoryPrompt）
 *   - recentEvents: 最近事件文本（来自 inbox.getRecentEventsPrompt）
 */
export function buildMessages(opts = {}) {
  const cfg = getAIConfig();
  const { character, history = [], userText = '', memoryPrompt = '', recentEvents = '' } = opts;
  const messages = [];

  // 系统提示：角色人设 + 说话风格 + 记忆 + 事件
  const parts = [];
  if (character) {
    if (character.name) parts.push(`你的名字是${character.name}。`);
    if (character.persona) parts.push(character.persona);
    if (character.greeting) parts.push(`开场白：${character.greeting}`);
  }
  parts.push(`说话风格：${cfg.style}`);
  if (memoryPrompt) parts.push(memoryPrompt);
  if (recentEvents) parts.push(`最近发生的事（可以自然提起，但不要生硬罗列）：\n${recentEvents}`);
  parts.push('要求：第一人称，软萌可爱，回复简短自然，不要复述用户的话，不要用 emoji。');

  messages.push({ role: 'system', content: parts.join('\n\n') });

  // 历史消息（最近 N 条）
  const limit = getConfig('ai.contextMessageLimit', 20);
  const sliced = history.slice(-limit);
  sliced.forEach((m) => {
    if (m && m.role && m.content) messages.push({ role: m.role, content: m.content });
  });

  // 本次输入
  if (userText) messages.push({ role: 'user', content: userText });

  return messages;
}

// ════════════════════════════════════════
// 流式调用
// ════════════════════════════════════════

/**
 * 流式聊天。无配置返回 { ok:false, reason:'not_configured' }，调用方走本地兜底。
 * @param {object} opts
 *   { messages, characterId, onToken(text), onDone(fullText), onError(err), signal }
 * @returns {Promise<{ok, reason?, fullText}>}
 */
export async function streamChat(opts = {}) {
  const cfg = getAIConfig();
  if (!cfg.url || !cfg.apiKey) {
    return { ok: false, reason: 'not_configured', fullText: '' };
  }
  const { messages, onToken, onDone, onError, signal } = opts;
  const maxRetry = getConfig('ai.maxRetry', 2);
  let lastErr = null;

  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      const result = await doFetch(cfg, messages, { onToken, signal });
      if (typeof onDone === 'function') onDone(result.fullText);
      return { ok: true, fullText: result.fullText };
    } catch (e) {
      lastErr = e;
      if (signal?.aborted) break; // 用户取消，不重试
      if (attempt < maxRetry) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
    }
  }
  if (typeof onError === 'function') onError(lastErr);
  return { ok: false, reason: 'fetch_failed', error: lastErr, fullText: '' };
}

async function doFetch(cfg, messages, { onToken, signal }) {
  const body = {
    model: cfg.model,
    messages,
    stream: true,
    temperature: Number(cfg.temperature) || 0.8,
    max_tokens: Number(cfg.maxTokens) || 800
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs || 30000);
  if (signal) {
    signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }

  const resp = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`
    },
    body: JSON.stringify(body),
    signal: ctrl.signal
  });

  if (!resp.ok) {
    const txt = await safeReadText(resp);
    throw new Error(`AI 接口返回 ${resp.status}：${txt.slice(0, 200)}`);
  }
  if (!resp.body) throw new Error('AI 接口没返回流');

  clearTimeout(timer);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE 按 \n\n 分块
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content || '';
        if (delta) {
          fullText += delta;
          if (typeof onToken === 'function') onToken(delta);
        }
      } catch (e) {
        // 单块解析失败跳过，不中断整体
      }
    }
  }
  return { fullText };
}

async function safeReadText(resp) {
  try { return await resp.text(); } catch (e) { return ''; }
}

// ════════════════════════════════════════
// 非流式（简单场景用，如游戏 AI 评价）
// ════════════════════════════════════════

export async function chatOnce(opts = {}) {
  const cfg = getAIConfig();
  if (!cfg.url || !cfg.apiKey) return { ok: false, reason: 'not_configured', text: '' };
  const { messages } = opts;
  try {
    const resp = await fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        stream: false,
        temperature: Number(cfg.temperature) || 0.8,
        max_tokens: Number(cfg.maxTokens) || 800
      })
    });
    if (!resp.ok) throw new Error(`AI 接口返回 ${resp.status}`);
    const json = await resp.json();
    const text = json.choices?.[0]?.message?.content || '';
    return { ok: true, text };
  } catch (e) {
    return { ok: false, reason: 'fetch_failed', error: e, text: '' };
  }
}
