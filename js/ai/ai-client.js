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
  style: '',         // 说话风格留空，让 AI 跟着人设自然发挥；用户可在设置里手动填
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
 *   { messages, characterId?, userText?, onChunk(text), onThinking(text), onDone(fullText), onError(err), signal }
 *   - onChunk：主内容增量回调（旧名 onToken 也兼容，等价于 onChunk）
 *   - onThinking：思维链增量回调（cfg.enableChain 开启时才会有内容）
 *   - characterId + userText 可选：传了的话，回复完成后我会自动跑情绪检测 + 记忆提取 + 归档
 *   - 思维链不会污染历史：调用方应把 onChunk 存入 aiMsg.content，把 onThinking 存入 aiMsg.thinking，
 *     下一轮历史只传 content。
 * @returns {Promise<{ok, reason?, fullText}>}
 */
export async function streamChat(opts = {}) {
  const cfg = getAIConfig();
  if (!cfg.url || !cfg.apiKey) {
    return { ok: false, reason: 'not_configured', fullText: '' };
  }
  // onChunk 是新规范名；onToken 是旧名（兼容 sending.js），两者取其一
  const { messages, onChunk, onThinking, onToken, onDone, onError, signal, characterId, userText } = opts;
  const chunkCb = onChunk || onToken;
  const maxRetry = getConfig('ai.maxRetry', 2);
  let lastErr = null;

  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      const result = await doFetch(cfg, messages, { onChunk: chunkCb, onThinking, signal });
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
      // 401/403 等不可重试的错误直接跳出，重试也是浪费力气
      if (e?.noRetry) break;
      if (attempt < maxRetry) {
        await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
        continue;
      }
    }
  }
  if (typeof onError === 'function') onError(lastErr);
  return { ok: false, reason: 'fetch_failed', error: lastErr, fullText: '' };
}

async function doFetch(cfg, messages, { onChunk, onThinking, signal }) {
  // 请求体：基础字段 + 可选参数（只在配置里有值时才加）
  const body = {
    model: cfg.model,
    messages,
    stream: !!onChunk,
    temperature: cfg.temperature ?? 0.8,
    max_tokens: cfg.maxTokens ?? 2000,
  };
  // 思维链开关：让支持的模型先把"想一想"的过程吐出来
  if (cfg.enableChain) {
    body.enable_thinking = true;        // 兼容 DeepSeek 等
    body.reasoning_effort = 'medium';   // 兼容 OpenAI o 系列
  }
  if (cfg.topP != null) body.top_p = cfg.topP;
  if (cfg.presencePenalty != null) body.presence_penalty = cfg.presencePenalty;
  if (cfg.frequencyPenalty != null) body.frequency_penalty = cfg.frequencyPenalty;
  if (cfg.stop) body.stop = cfg.stop;

  // headers：标准 + 自定义合并
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${cfg.apiKey}`,
  };
  if (cfg.customHeaders) {
    try {
      const extra = typeof cfg.customHeaders === 'string'
        ? JSON.parse(cfg.customHeaders)
        : cfg.customHeaders;
      if (extra && typeof extra === 'object') Object.assign(headers, extra);
    } catch (e) {
      console.warn('[ai-client] 我解析自定义 headers 失败', e);
    }
  }

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
    headers,
    body: JSON.stringify(body),
    signal: ctrl.signal
  });

  if (!resp.ok) {
    clearTimeout(timer);
    // 友好的状态码文案，软萌语气
    let errMsg = `AI 接口返回 ${resp.status}`;
    if (resp.status === 401) errMsg = 'API 钥匙不对哦，检查一下嘛';
    else if (resp.status === 403) errMsg = '没有权限访问这个模型呢';
    else if (resp.status === 429) errMsg = '请求太频繁啦，等一下再试嘛';
    else if (resp.status >= 500) errMsg = 'AI 服务器出问题了，等一下再试嘛';
    // 401/403 不重试，429/5xx 可以重试
    const err = new Error(errMsg);
    err.statusCode = resp.status;
    err.noRetry = (resp.status === 401 || resp.status === 403);
    // 把响应原文挂在错误对象上，方便排查
    try { err.bodyText = (await safeReadText(resp)).slice(0, 200); } catch (e) {}
    throw err;
  }
  if (!resp.body) {
    clearTimeout(timer);
    throw new Error('AI 接口没返回流');
  }

  // 非流式（没传 onChunk）：一次性读完 JSON 再拆思维链
  if (!onChunk) {
    clearTimeout(timer);
    const json = await resp.json();
    const msg = json.choices?.[0]?.message || {};
    let fullText = msg.content || '';
    // 思维链：reasoning_content（DeepSeek 风格）或 reasoning（OpenAI o1 风格）
    const reasoning = msg.reasoning_content || msg.reasoning || '';
    if (reasoning && typeof onThinking === 'function') {
      onThinking(reasoning);
    }
    // 兜底：拆 ~thinking~ 标签（本地兜底回复走 streamChat 时会用）
    if (fullText.includes('~thinking~')) {
      const segs = parseThinkingTags(fullText, false);
      let rebuilt = '';
      for (const seg of segs) {
        if (seg.type === 'thinking') {
          if (typeof onThinking === 'function') onThinking(seg.text);
        } else {
          rebuilt += seg.text;
        }
      }
      fullText = rebuilt;
    }
    return { fullText };
  }

  // 注意：不要在进入 reader 循环前 clearTimeout，否则流式期间无超时保护
  // 改为每次读到 chunk 时重置计时器，等所有 chunk 读取完毕再 clearTimeout
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';
  // ~thinking~ 标签可能跨 chunk：累积所有 content，每次重新解析发增量
  let contentAcc = '';
  let emittedContentLen = 0;
  let emittedThinkingLen = 0;

  // 把新增的 content 喂进累积缓冲，再按 ~thinking~ 标签拆分发出增量
  const THINKING_TAG = '~thinking~';
  // 检查 buffer 末尾是否是 ~thinking~ 标签的形成中前缀（如 '~thin'），返回前缀长度
  const trailingTagPrefixLen = (buf) => {
    const max = Math.min(buf.length, THINKING_TAG.length - 1);
    for (let i = max; i >= 1; i--) {
      if (THINKING_TAG.startsWith(buf.slice(-i))) return i;
    }
    return 0;
  };

  const flushContent = (deltaText) => {
    contentAcc += deltaText;
    // 没有 ~thinking~ 标签时走快速路径：直接发 content 增量
    if (!contentAcc.includes('~thinking~')) {
      // 但要小心：buffer 末尾可能是正在形成中的标签前缀（如 '~thin'）
      // 只有传了 onThinking 才需要保留前缀（否则标签也没用，全当 content 发出去更顺滑）
      let safeLen = contentAcc.length;
      if (typeof onThinking === 'function') {
        const prefixLen = trailingTagPrefixLen(contentAcc);
        safeLen = contentAcc.length - prefixLen;
      }
      if (safeLen > emittedContentLen) {
        const delta = contentAcc.slice(emittedContentLen, safeLen);
        fullText += delta;
        onChunk(delta);
        emittedContentLen = safeLen;
      }
      return;
    }
    // 有 ~thinking~ 标签：用 parseThinkingTags 拆分（流式模式：未闭合标签也当作 thinking）
    const segs = parseThinkingTags(contentAcc, true);
    let fullContent = '';
    let fullThinking = '';
    for (const seg of segs) {
      if (seg.type === 'content') fullContent += seg.text;
      else fullThinking += seg.text;
    }
    // 发 content 增量
    if (fullContent.length > emittedContentLen) {
      const delta = fullContent.slice(emittedContentLen);
      fullText += delta;
      onChunk(delta);
      emittedContentLen = fullContent.length;
    }
    // 发 thinking 增量
    if (fullThinking.length > emittedThinkingLen && typeof onThinking === 'function') {
      const delta = fullThinking.slice(emittedThinkingLen);
      onThinking(delta);
      emittedThinkingLen = fullThinking.length;
    }
  };

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
          const delta = json.choices?.[0]?.delta || {};
          // 1. 思维链：reasoning_content / reasoning（直接走 onThinking，不进 fullText）
          const reasoning = delta.reasoning_content || delta.reasoning || '';
          if (reasoning && typeof onThinking === 'function') {
            onThinking(reasoning);
          }
          // 2. 主内容：可能含 ~thinking~ 标签，进 flushContent 拆分
          const deltaContent = delta.content || '';
          if (deltaContent) {
            flushContent(deltaContent);
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
// 思维链标签解析
// ════════════════════════════════════════

/**
 * 我把一段文本按 ~thinking~...~thinking~ 标签拆成片段数组。
 * 用于把"思维链"和"主内容"分离开，让 onThinking 接收 thinking，onChunk 接收 content。
 * @param {string} text 待拆分的文本
 * @param {boolean} [stream=false] 流式模式：未闭合的 ~thinking~ 标签内容也当作 thinking 段返回
 *   （非流式模式下，未闭合的内容保守地当作 content）
 * @returns {Array<{type: 'thinking'|'content', text: string}>}
 */
export function parseThinkingTags(text, stream = false) {
  if (!text) return [];
  const str = String(text);
  const segments = [];
  const TAG = '~thinking~';
  let lastIdx = 0;            // 上次处理到的位置（下一段 content 的起点）
  let inThinking = false;     // 当前是否在 thinking 段内
  let thinkingStart = -1;     // 当前 thinking 段内容起点（开标签之后）
  let thinkingTagStart = -1;  // 当前开标签开始的位置（未闭合时回退用）

  // 手动扫描，避免正则全局状态问题
  let pos = 0;
  while (pos <= str.length - TAG.length) {
    if (str.substr(pos, TAG.length) === TAG) {
      if (!inThinking) {
        // 开标签：前面的内容是 content
        if (pos > lastIdx) {
          segments.push({ type: 'content', text: str.slice(lastIdx, pos) });
        }
        thinkingTagStart = pos;            // 记住开标签位置
        thinkingStart = pos + TAG.length;  // thinking 内容起点
        inThinking = true;
      } else {
        // 闭标签：中间内容是 thinking
        segments.push({ type: 'thinking', text: str.slice(thinkingStart, pos) });
        lastIdx = pos + TAG.length;
        inThinking = false;
        thinkingStart = -1;
        thinkingTagStart = -1;
      }
      pos += TAG.length;
    } else {
      pos++;
    }
  }

  if (inThinking) {
    // 还有未闭合的 ~thinking~ 标签
    if (stream) {
      // 流式模式：未闭合的内容当作 thinking（标签闭合后内容不变，增量正确）
      segments.push({ type: 'thinking', text: str.slice(thinkingStart) });
    } else {
      // 非流式模式：保守处理，开标签 + 内容都当作 content（避免标签字符丢失）
      if (thinkingTagStart < str.length) {
        segments.push({ type: 'content', text: str.slice(thinkingTagStart) });
      }
    }
  } else if (lastIdx < str.length) {
    // 剩余的 content
    segments.push({ type: 'content', text: str.slice(lastIdx) });
  }
  return segments;
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
