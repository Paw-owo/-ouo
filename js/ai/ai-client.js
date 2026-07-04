// js/ai/ai-client.js
// 我发送请求和处理回复的主逻辑。
// 职责：
//   1) 读 settings 里的 AI 配置（url / apiKey / model / style / chain）
//   2) 把上下文构建委托给 ./ai-context.js（10 步规范）
//   3) 流式输出（OpenAI 兼容 /v1/chat/completions，stream:true）
//   4) 无配置 -> 返回 null，调用方走本地兜底（./ai-fallback.js）
//   5) 失败可重试，超时友好提示
//   6) 回复完成后触发情绪检测 + 记忆提取 + 记忆归档（委托给 ./ai-emotion.js / ./ai-memory.js）
// 依赖：./ai-context.js, ./ai-emotion.js, ./ai-memory.js, ./ai-fallback.js,
//       ../../core/storage-keys.js, ../../core/storage.js, ../../core/events.js, ../../core/config.js
// 红线：不硬编码 URL/Key，全部从用户配置读；无配置不卡死。

import { KEYS } from '../../core/storage-keys.js';
import { getData, setData } from '../../core/storage.js';
import bus from '../../core/events.js';
import { get as getConfig } from '../../core/config.js';
import { buildContext } from './ai-context.js';
import { handleEmotion } from './ai-emotion.js';
import { autoRecordMemories, archiveOldMemories } from './ai-memory.js';
import { getFallbackReply, randomFallback } from './ai-fallback.js';

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

/** 我检查是否配置了可用 AI（url + apiKey 都有） */
export function isAIConfigured() {
  const c = getAIConfig();
  return !!(c.url && c.apiKey);
}

// ════════════════════════════════════════
// 上下文构建（委托给 ./ai-context.js）
// ════════════════════════════════════════

/**
 * 我读主人当前心情（KEYS.moodState，由心情日记 App 写入），拼成提示词。
 * 只读今天的；跨天的心情缓存会被忽略，避免我误判主人情绪。
 * 返回空串表示没有可用心情。
 */
function buildMoodContextLine() {
  let m = null;
  try { m = getData(KEYS.moodState, null); } catch (e) { return ''; }
  if (!m || typeof m !== 'object') return '';
  // 校验是今天的（防止缓存跨天失效）
  const today = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  if (m.date !== today) return '';
  const label = m.label || m.key || '';
  if (!label) return '';
  const note = m.note ? `，主人写的话：「${String(m.note).slice(0, 80)}」` : '';
  return `主人当前的心情：${label}${note}（请用对应的语气陪伴ta，不要生硬复述）`;
}

/**
 * 我构建发给 AI 的 messages 数组。委托给 buildContext（10 步规范）。
 * 兼容旧调用方：接受 { character, history, userText, memoryPrompt, recentEvents }，
 * 其中 memoryPrompt / recentEvents 由 buildContext 自己重建（规范要求），传入的会被忽略。
 * 额外保留：主人当前心情作为补充 system 段落（原 buildMessages 的功能，不丢）。
 * @param {object} opts { character, history, userText, session, ... }
 * @returns {Promise<Array<{role, content}>>}
 */
export async function buildMessages(opts = {}) {
  const messages = await buildContext(opts);
  // 补充：主人当前心情（独立 system 段落，让 AI 体察主人情绪）
  const moodLine = buildMoodContextLine();
  if (moodLine) {
    // 插到历史消息之前（让心情作为系统上下文，不混入对话）
    const lastSystemIdx = (() => {
      let idx = -1;
      for (let i = 0; i < messages.length; i++) {
        if (messages[i].role === 'system') idx = i;
        else break;
      }
      return idx;
    })();
    if (lastSystemIdx >= 0) {
      messages.splice(lastSystemIdx + 1, 0, { role: 'system', content: moodLine });
    } else {
      messages.unshift({ role: 'system', content: moodLine });
    }
  }
  return messages;
}

// ════════════════════════════════════════
// 流式调用
// ════════════════════════════════════════

/**
 * 我做流式聊天。无配置返回 { ok:false, reason:'not_configured' }，调用方走本地兜底。
 * @param {object} opts
 *   { messages, characterId?, userText?, onToken(text), onDone(fullText), onError(err), signal }
 *   - characterId + userText 可选：传了的话，回复完成后我会自动跑情绪检测 + 记忆提取 + 归档
 * @returns {Promise<{ok, reason?, fullText}>}
 */
export async function streamChat(opts = {}) {
  const cfg = getAIConfig();
  if (!cfg.url || !cfg.apiKey) {
    return { ok: false, reason: 'not_configured', fullText: '' };
  }
  const { messages, onToken, onDone, onError, signal, characterId, userText } = opts;
  const maxRetry = getConfig('ai.maxRetry', 2);
  let lastErr = null;

  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      const result = await doFetch(cfg, messages, { onToken, signal });
      if (typeof onDone === 'function') onDone(result.fullText);
      // 回复完成后：情绪检测 + 记忆提取 + 归档（只在调用方提供 characterId + userText 时跑）
      // 注意：sending.js 的 finishAIMessage 也会跑一遍，这里只面向"直接调 streamChat 的调用方"。
      if (characterId && userText && result.fullText) {
        try {
          await handleEmotion(result.fullText, characterId, userText);
        } catch (e) {
          console.warn('[ai-client] 我处理情绪失败', e);
        }
        try {
          await autoRecordMemories(userText, result.fullText, characterId);
        } catch (e) {
          console.warn('[ai-client] 我自动提取记忆失败', e);
        }
        // 归档异步跑，不阻塞返回
        archiveOldMemories(characterId).catch((e) => {
          console.warn('[ai-client] 我归档老记忆失败', e);
        });
      }
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
  // 超时计时器：在每次读到 chunk 时重置，避免流式期间被误超时中断
  const timeoutMs = cfg.timeoutMs || 30000;
  let timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const resetTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => ctrl.abort(), timeoutMs);
  };
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
    clearTimeout(timer);
    const txt = await safeReadText(resp);
    throw new Error(`AI 接口返回 ${resp.status}：${txt.slice(0, 200)}`);
  }
  if (!resp.body) {
    clearTimeout(timer);
    throw new Error('AI 接口没返回流');
  }

  // 注意：不要在进入 reader 循环前 clearTimeout，否则流式期间无超时保护
  // 改为每次读到 chunk 时重置计时器，等所有 chunk 读取完毕再 clearTimeout
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // 收到 chunk 即重置超时计时器，避免长文本流式被误中断
      resetTimer();
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
  } finally {
    // 所有 chunk 读取完毕（或异常退出），清理超时计时器
    clearTimeout(timer);
    try { reader.releaseLock(); } catch (e) {}
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

// ════════════════════════════════════════
// 兜底入口（重新导出，方便调用方一处拿全）
// ════════════════════════════════════════

export { getFallbackReply, randomFallback };
