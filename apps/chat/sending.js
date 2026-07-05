// apps/chat/sending.js
// 发送消息 + AI 流式回复核心——文字/图片/语音发送、流式渲染、本地兜底、失败重试、取消、写记忆。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js,
//       core/ai-client.js, core/memory.js, core/inbox.js, core/util.js, ./local-replies.js
// 状态由 index.js 持有，通过 getState 拿；发送函数 export 给 detail-view.js 调用。

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, getAllDB, generateId, getNow, compressImage } from '../../core/storage.js';
import { showToast, createIcon, registerIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { pickImageFile } from '../../core/util.js';
import { streamChat, buildMessages, isAIConfigured, parseThinkingTags } from '../../core/ai-client.js';
import { buildMemoryPrompt, recordInteraction } from '../../core/memory.js';
import { getRecentEventsPrompt } from '../../core/inbox.js';
import { getLocalReply, pickReplyCategory, inferMood, inferImportance } from './local-replies.js';
// 新流程：回复完成后跑情绪检测 + 自动提取记忆 + 归档老记忆
import { handleEmotion } from '../../js/ai/ai-emotion.js';
import { autoRecordMemories, archiveOldMemories } from '../../js/ai/ai-memory.js';
import { getState, markUserMessagesRead } from './index.js';
import {
  appendMessageEl, updateChatHeader, scrollToBottom, isNearBottom,
  showTypingIndicator, hideTypingIndicator,
  clearQuote, autoResizeInput, flushDraft, updateMessageStatus,
  updateThinkingUI, updateSendButtonState
} from './detail-view.js';
import { renderMarkdown } from './markdown.js';
import { escapeHTML } from './shared-utils.js';

// 注册 refresh 图标（用于重试按钮）
registerIcon('refresh', 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15');

// ════════════════════════════════════════
// 发送消息（文字）
// ════════════════════════════════════════

export async function sendMessage() {
  const state = getState();
  if (!state.inputEl || !state.messageListEl) return;
  if (state.isReplying) return;
  const text = state.inputEl.value.trim();
  if (!text) return;

  // 取出引用（发送后清空）。pendingQuote 现在是 { text, id, sender } 对象
  const quoteObj = state.pendingQuote || null;
  const quote = quoteObj?.text || null;
  const quoteId = quoteObj?.id || null;
  const quoteSender = quoteObj?.sender || null;
  clearQuote();

  // 清空输入框并重置高度
  state.inputEl.value = '';
  autoResizeInput();
  updateSendButtonState();
  // 落盘空草稿（覆盖旧草稿）
  if (state.saveDraftDebounced) state.saveDraftDebounced.cancel?.();
  await flushDraft();

  const session = state.currentSession;
  if (!session) return;

  const userMsg = {
    id: generateId('msg'),
    sessionId: session.id,
    characterId: session.characterId,
    role: 'user',
    content: text,
    type: 'text',
    quote,
    quoteId,
    quoteSender,
    status: 'sending',
    timestamp: getNow()
  };

  // 先渲染（status: sending）再写 DB；写完后更新状态图标
  appendMessageEl(userMsg);
  updateChatHeader(userMsg.timestamp);
  scrollToBottom();

  try {
    await setDB(STORES.messages, userMsg.id, userMsg);
    userMsg.status = 'sent';
    try { await setDB(STORES.messages, userMsg.id, userMsg); } catch (e) {}
    updateMessageStatus(userMsg.id, 'sent');
  } catch (e) {
    console.warn('[chat] 保存用户消息失败', e);
    userMsg.status = 'failed';
    try { await setDB(STORES.messages, userMsg.id, userMsg); } catch (e2) {}
    updateMessageStatus(userMsg.id, 'failed', userMsg);
    showToast('消息没发出去，再试一下嘛', 'error');
    return;
  }

  // 更新会话 lastMessage/lastAt
  await bumpSession(session, text.slice(0, 60), userMsg.timestamp);

  // 通知其他 App：用户发消息了
  bus.emit('chat:user-message', {
    characterId: session.characterId,
    sessionId: session.id,
    preview: text.slice(0, 60)
  });

  // 触发 AI 回复
  await triggerAIReply(userMsg);
}

// ════════════════════════════════════════
// 发送图片消息
// ════════════════════════════════════════

export async function sendImageMessage() {
  const state = getState();
  if (state.isReplying) {
    showToast('等她回完再发图片嘛', 'default', 1400);
    return;
  }
  const session = state.currentSession;
  if (!session) return;

  let file;
  try {
    file = await pickImageFile('image/*');
  } catch (e) {
    // 用户取消，不报错
    return;
  }
  let dataURL = '';
  try {
    dataURL = await compressImage(file, { quality: 0.78, maxWidth: 1280, maxHeight: 1280 });
  } catch (e) {
    console.warn('[chat] 图片压缩失败', e);
    showToast('图片处理不出来嘛', 'error');
    return;
  }
  if (!dataURL) return;

  const userMsg = {
    id: generateId('msg'),
    sessionId: session.id,
    characterId: session.characterId,
    role: 'user',
    content: '[图片]',
    type: 'image',
    mediaUrl: dataURL,
    timestamp: getNow()
  };
  try {
    await setDB(STORES.messages, userMsg.id, userMsg);
  } catch (e) {
    console.warn('[chat] 保存图片消息失败', e);
    showToast('图片没发出去，再试一下嘛', 'error');
    return;
  }

  appendMessageEl(userMsg);
  updateChatHeader(userMsg.timestamp);
  scrollToBottom();
  await bumpSession(session, '[图片]', userMsg.timestamp);
  bus.emit('chat:user-message', {
    characterId: session.characterId,
    sessionId: session.id,
    preview: '[图片]'
  });

  await triggerAIReply(userMsg);
}

// ════════════════════════════════════════
// 发送语音消息
// ════════════════════════════════════════

/**
 * 发送语音消息（type='voice'）。extras.js 里的录音器停录后通过动态 import 调到这里。
 * 写 DB + 渲染 + 更新会话 + 触发 AI 回复。
 * @param {string} dataUrl 录音数据 URL（通常为 audio/webm;base64,...）
 * @param {number} duration 录音时长（秒）
 */
export async function sendVoiceMessage(dataUrl, duration) {
  const state = getState();
  if (state.isReplying) {
    showToast('等她回完再发语音嘛', 'default', 1400);
    return;
  }
  const session = state.currentSession;
  if (!session) return;
  if (!dataUrl || !duration || duration <= 0) {
    showToast('录的太短啦，长一点试试', 'default', 1200);
    return;
  }

  // 语音消息预览文案
  const preview = `[语音 ${Math.round(duration)}"]`;
  const userMsg = {
    id: generateId('msg'),
    sessionId: session.id,
    characterId: session.characterId,
    role: 'user',
    content: preview,
    type: 'voice',
    mediaUrl: dataUrl,
    duration: Math.round(duration),
    status: 'sending',
    timestamp: getNow()
  };

  // 先渲染（status: sending）再写 DB
  appendMessageEl(userMsg);
  updateChatHeader(userMsg.timestamp);
  scrollToBottom();

  try {
    await setDB(STORES.messages, userMsg.id, userMsg);
    userMsg.status = 'sent';
    try { await setDB(STORES.messages, userMsg.id, userMsg); } catch (e) {}
    updateMessageStatus(userMsg.id, 'sent');
  } catch (e) {
    console.warn('[chat] 保存语音消息失败', e);
    userMsg.status = 'failed';
    try { await setDB(STORES.messages, userMsg.id, userMsg); } catch (e2) {}
    updateMessageStatus(userMsg.id, 'failed', userMsg);
    showToast('语音没发出去，再试一下嘛', 'error');
    return;
  }

  // 更新会话 lastMessage/lastAt
  await bumpSession(session, preview, userMsg.timestamp);
  bus.emit('chat:user-message', {
    characterId: session.characterId,
    sessionId: session.id,
    preview
  });

  // 触发 AI 回复（AI 看到的 userText 用自然语言描述，提示对方发了语音）
  await triggerAIReply(userMsg);
}

/**
 * 重试发送失败的消息：把状态重置为 sent，并重新触发 AI 回复。
 * 由 detail-view.js 中失败状态图标点击时调用。
 * @param {object} msg 失败的消息对象
 */
export async function retrySendMessage(msg) {
  if (!msg || !msg.id) return;
  const state = getState();
  if (state.isReplying) {
    showToast('等她回完再重试嘛', 'default', 1400);
    return;
  }
  try {
    // 失败消息本身已存在 DB（或写不进去），重置状态为 sent
    const cur = await getDB(STORES.messages, msg.id) || msg;
    await setDB(STORES.messages, msg.id, { ...cur, status: 'sent' });
    // 更新 UI 状态图标
    updateMessageStatus(msg.id, 'sent', cur);
    // 重新触发 AI 回复（如果原本没触发过的话）
    if (msg.role === 'user') {
      await triggerAIReply(cur);
    }
  } catch (e) {
    console.warn('[chat] 重试失败', e);
    showToast('重试出错了，再试一下嘛', 'error');
  }
}

// ════════════════════════════════════════
// AI 回复（核心）
// ════════════════════════════════════════

// 导出供 extras.js（表情包发送）与 group/group-sending.js（群聊回复）调用
export async function triggerAIReply(userMsg) {
  const state = getState();
  // 用 userMsg.sessionId 从 DB 查会话，避免 sendMessage 的 await 期间用户切走会话造成串话
  let sess = null;
  try {
    sess = await getDB(STORES.chatSessions, userMsg.sessionId);
  } catch (e) {}
  if (!sess) return; // 会话已被删除，直接结束
  // 用户是否仍停留在该会话：决定要不要渲染 DOM
  const viewingThis = state.currentSession?.id === sess.id;

  setReplying(true);
  state.streamCancelled = false;
  if (viewingThis) {
    // 用户消息从 sent -> delivered：AI 开始处理即视为送达
    try {
      const cur = await getDB(STORES.messages, userMsg.id);
      if (cur && cur.status === 'sent') {
        cur.status = 'delivered';
        await setDB(STORES.messages, userMsg.id, cur);
        updateMessageStatus(userMsg.id, 'delivered');
      }
    } catch (e) {}
    showTypingIndicator();
    scrollToBottom();
  }

  // 读角色
  let character = state.currentCharacter;
  if (!character || character.id !== sess.characterId) {
    try { character = await getDB(STORES.characters, sess.characterId); } catch (e) {}
    if (viewingThis) state.currentCharacter = character;
  }

  // 历史消息（最近 20 条）—— 排除当前刚落盘的 userMsg，避免和单独传入的 userText 在 messages 末尾重复
  let history = [];
  try {
    const all = await getAllDB(STORES.messages);
    history = all
      .filter((m) => (m.sessionId === sess.id || (!m.sessionId && m.characterId === sess.characterId)) && m.id !== userMsg.id)
      .sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt))
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content || '' }));
  } catch (e) {}

  // 记忆 + 最近事件
  let memoryPrompt = '';
  try { memoryPrompt = await buildMemoryPrompt(sess.characterId, { limit: 20 }); } catch (e) {}
  let recentEvents = '';
  try { recentEvents = getRecentEventsPrompt(8); } catch (e) {}

  // 世界书触发：根据用户消息匹配世界书条目，注入 AI 上下文
  let worldbookContext = '';
  try {
    const wb = await import('../worldbook/index.js');
    if (typeof wb.matchWorldbook === 'function') {
      const userText = userMsg.type === 'image' ? '' : userMsg.content;
      const hits = await wb.matchWorldbook(userText, sess.characterId);
      if (hits && hits.length) {
        const lines = hits.slice(0, 5).map((h) => `[${h.keyword}] ${h.content || ''}`.slice(0, 200));
        worldbookContext = `世界书设定（自然融入对话，不要生硬复述）：\n${lines.join('\n')}`;
        // 累加触发次数（不 await 不阻塞）
        hits.forEach((h) => { if (typeof wb.incrementTriggerCount === 'function') wb.incrementTriggerCount(h.id); });
      }
    }
  } catch (e) {
    // worldbook 模块加载失败不影响聊天
  }

  const messages = await buildMessages({
    character,
    history,
    userText: userMsg.type === 'image' ? '（用户发了一张图片）' : userMsg.content,
    memoryPrompt: worldbookContext ? `${memoryPrompt}\n\n${worldbookContext}` : memoryPrompt,
    recentEvents
  });

  // 隐藏呼吸气泡，建空气泡
  if (viewingThis) hideTypingIndicator();
  const aiMsg = {
    id: generateId('msg'),
    sessionId: sess.id,
    characterId: sess.characterId,
    role: 'assistant',
    content: '',
    type: 'text',
    timestamp: getNow()
  };
  // 用户已切走时只落盘不渲染：用脱离 DOM 的占位元素，让 runAIStream / finishAIMessage 里的 isConnected 守卫自动跳过 UI 更新
  let msgEl = viewingThis ? appendMessageEl(aiMsg, { stream: true }) : null;
  if (!msgEl) {
    msgEl = document.createElement('div');
    msgEl.innerHTML = '<div class="chat-bubble"></div>';
  }
  const bubbleEl = msgEl.querySelector('.chat-bubble');

  // 本地模式提示：每个会话首次只提示一次
  if (!isAIConfigured() && !state.localModeHintedSessions.has(sess.id)) {
    state.localModeHintedSessions.add(sess.id);
    const hint = document.createElement('div');
    hint.className = 'chat-local-hint';
    hint.textContent = '（本地模式，配置 AI 接口后回复更自然）';
    if (msgEl.firstChild) msgEl.insertBefore(hint, msgEl.firstChild);
    else msgEl.appendChild(hint);
  }

  let accText = '';
  let thinkingText = '';

  // ── 走 AI 流式 ──
  if (isAIConfigured()) {
    const result = await runAIStream(bubbleEl, messages, sess,
      () => accText, (t) => { accText = t; },
      () => thinkingText, (t) => { thinkingText = t; },
      msgEl, aiMsg);
    if (result.ok) {
      await finishAIMessage(sess, character, aiMsg, msgEl, bubbleEl, accText, userMsg, thinkingText);
      return;
    }
    if (result.reason === 'not_configured') {
      // 配置中途被改了，走本地兜底
    } else if (result.reason === 'cancelled') {
      // 用户取消，保留已流式部分（若有）
      await finishAIMessage(sess, character, aiMsg, msgEl, bubbleEl, accText, userMsg, thinkingText);
      return;
    } else {
      // fetch_failed 且用户没点重试（关掉了），保留空气泡或移除
      if (!accText && msgEl.isConnected) {
        msgEl.remove();
      } else {
        await finishAIMessage(sess, character, aiMsg, msgEl, bubbleEl, accText, userMsg, thinkingText);
      }
      setReplying(false);
      return;
    }
  }

  // ── 本地兜底 ──
  let replyText = getLocalReply(userMsg.content, state.lastReply, {
    isImage: userMsg.type === 'image',
    characterId: sess.characterId
  });
  // 拆 ~thinking~ 标签：思维链走 onThinking UI，主内容走流式
  if (replyText.includes('~thinking~')) {
    const segs = parseThinkingTags(replyText, false);
    let content = '';
    let thinking = '';
    for (const seg of segs) {
      if (seg.type === 'thinking') thinking += seg.text;
      else content += seg.text;
    }
    // lastReply 用纯主内容做去重，不带 thinking 标签
    state.lastReply = content;
    // 思维链先发（模拟"先想后说"），和 AI 流式 onThinking 一致的处理
    if (thinking && msgEl && msgEl.isConnected) {
      thinkingText = thinking;
      updateThinkingUI(msgEl, thinking, { streaming: true });
      if (isNearBottom()) scrollToBottom();
    }
    replyText = content;
  } else {
    state.lastReply = replyText;
  }
  accText = await streamLocalReply(bubbleEl, replyText);
  await finishAIMessage(sess, character, aiMsg, msgEl, bubbleEl, accText, userMsg, thinkingText);
}

/**
 * 跑一次 AI 流式请求。失败时在气泡里显示重试按钮，等用户决定。
 * 重试时保留已流式的内容，在已有内容基础上继续。
 * @param {HTMLElement} bubbleEl 气泡元素
 * @param {Array} messages 发给 AI 的消息数组
 * @param {object} sess 当前会话
 * @param {() => string} getAcc 拿累积主内容
 * @param {(t: string) => void} setAcc 写累积主内容
 * @param {() => string} getThinking 拿累积思维链
 * @param {(t: string) => void} setThinking 写累积思维链
 * @param {HTMLElement} msgEl 消息行元素（用于实时更新思维链 UI）
 * @param {object} aiMsg AI 消息对象
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
async function runAIStream(bubbleEl, messages, sess, getAcc, setAcc, getThinking, setThinking, msgEl, aiMsg) {
  const state = getState();
  while (true) {
    state.abortController = new AbortController();
    // 重试时保留已流式内容（getAcc() 拿到上次累积的文本），不再清空
    let acc = getAcc() || '';
    // 首次进入时初始化气泡：显示已有内容 + 光标
    if (bubbleEl.isConnected) {
      bubbleEl.innerHTML = escapeHTML(acc) + '<span class="chat-cursor"></span>';
    }
    const result = await streamChat({
      messages,
      onChunk: (delta) => {
        acc += delta;
        setAcc(acc);
        if (bubbleEl.isConnected) {
          // 流式性能优化：用 textContent 增量追加到 textNode，避免每次 innerHTML 重排
          renderStreamToken(bubbleEl, acc);
          // 用户在底部才跟随滚动，上滑读历史时不打扰
          if (isNearBottom()) scrollToBottom();
        }
      },
      onThinking: (delta) => {
        if (!delta) return;
        const next = (getThinking() || '') + delta;
        setThinking(next);
        // 实时更新思维链区域（流式中保持展开，让主人看到思考过程）
        if (msgEl && msgEl.isConnected) {
          updateThinkingUI(msgEl, next, { streaming: true });
          if (isNearBottom()) scrollToBottom();
        }
      },
      signal: state.abortController.signal
    });
    state.abortController = null;

    if (result.ok) {
      // 流式期间被取消（abort）但 ok=true 的情况，acc 可能不完整，仍按已完成处理
      return { ok: true };
    }
    if (result.reason === 'not_configured') {
      return { ok: false, reason: 'not_configured' };
    }
    if (state.streamCancelled) {
      return { ok: false, reason: 'cancelled' };
    }
    if (result.reason === 'fetch_failed') {
      // 免打扰会话不弹 toast
      if (!sess.muted) showToast('AI 暂时联系不上，等会再试嘛', 'error');
      // 在气泡里显示重试按钮，等用户决定（保留已流式内容前缀）
      const choice = await showRetryAndWait(bubbleEl, acc);
      if (choice === 'retry') continue; // 再来一次，acc 会被保留
      return { ok: false, reason: 'cancelled' };
    }
    // 未知原因
    return { ok: false, reason: 'unknown' };
  }
}

/**
 * 流式渲染单个 token：维护一个 textNode，仅追加新内容，避免全量 innerHTML 重排。
 * 兼容首次无 textNode 的情况。
 */
function renderStreamToken(bubbleEl, fullText) {
  // 找到或创建文本节点（光标前）
  let textNode = bubbleEl.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    textNode = document.createTextNode('');
    bubbleEl.insertBefore(textNode, bubbleEl.firstChild);
  }
  // 仅当内容变化时更新 textContent
  if (textNode.textContent !== fullText) {
    textNode.textContent = fullText;
  }
  // 确保光标元素存在
  if (!bubbleEl.querySelector('.chat-cursor')) {
    const cursor = document.createElement('span');
    cursor.className = 'chat-cursor';
    bubbleEl.appendChild(cursor);
  }
}

/** 在气泡里显示重试按钮（保留已流式内容前缀），返回 Promise<'retry'|'dismiss'> */
function showRetryAndWait(bubbleEl, accText) {
  return new Promise((resolve) => {
    if (!bubbleEl.isConnected) { resolve('dismiss'); return; }
    const prefix = accText ? escapeHTML(accText) + '<br>' : '';
    bubbleEl.innerHTML = `${prefix}<button class="chat-retry-btn" type="button">${createIcon('refresh', 16).outerHTML}<span>重新联系</span></button>`;
    const btn = bubbleEl.querySelector('.chat-retry-btn');
    if (!btn) { resolve('dismiss'); return; }
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); finish('retry'); });
    // 气泡被移除时也视为放弃
    const observer = new MutationObserver(() => {
      if (!bubbleEl.isConnected) { observer.disconnect(); finish('dismiss'); }
    });
    observer.observe(bubbleEl.parentNode || document.body, { childList: true });
  });
}

/** 本地兜底流式显示，返回最终显示的文本（可能被取消截断） */
function streamLocalReply(bubbleEl, fullText) {
  const state = getState();
  const chars = Array.from(fullText); // Array.from 正确处理 surrogate pair
  let i = 0;
  let acc = '';
  return new Promise((resolve) => {
    function tick() {
      // 被取消 / 组件已卸载 -> 直接结束
      if (state.streamCancelled || !state.containerEl) {
        if (bubbleEl.isConnected) bubbleEl.textContent = acc;
        resolve(acc);
        return;
      }
      if (i >= chars.length) {
        if (bubbleEl.isConnected) bubbleEl.textContent = fullText;
        resolve(fullText);
        return;
      }
      acc += chars[i];
      i++;
      // 流式性能优化：用 textNode 增量追加，避免每次 innerHTML 重排
      if (bubbleEl.isConnected) {
        renderStreamToken(bubbleEl, acc);
        if (isNearBottom()) scrollToBottom();
      }
      state.typingTimer = setTimeout(tick, 50);
    }
    tick();
  });
}

/** AI 回复完成：保存、更新会话、emit 事件、写记忆 */
async function finishAIMessage(sess, character, aiMsg, msgEl, bubbleEl, finalText, userMsg, thinkingText = '') {
  const state = getState();
  // 没有任何文本（被取消且没流到字）-> 移除空气泡
  if (!finalText || !finalText.trim()) {
    if (msgEl.isConnected) msgEl.remove();
    setReplying(false);
    state.streamCancelled = false;
    return;
  }
  // 去掉光标，固定文本（AI 消息用 markdown 渲染）
  if (bubbleEl.isConnected) {
    bubbleEl.innerHTML = renderMarkdown(finalText);
  }
  aiMsg.content = finalText;
  // 思维链单独存储（下一轮历史只传 content，不传 thinking）
  if (thinkingText && thinkingText.trim()) {
    aiMsg.thinking = thinkingText;
    // 流式结束后把思维链区域固定为折叠态（保留内容）
    if (msgEl && msgEl.isConnected) {
      updateThinkingUI(msgEl, thinkingText, { streaming: false });
    }
  }
  try { await setDB(STORES.messages, aiMsg.id, aiMsg); } catch (e) {
    console.warn('[chat] 保存 AI 消息失败', e);
  }

  // 更新会话 lastMessage/lastAt + 未读（用户在当前会话则不增未读）
  const inThisChat = state.view === 'chat' && state.currentSessionId === sess.id;
  await bumpSession(sess, finalText.slice(0, 60), aiMsg.timestamp, inThisChat ? 0 : 1);
  if (inThisChat) updateChatHeader(aiMsg.timestamp);

  // 通知消息中心
  bus.emit('chat:message-received', {
    characterId: sess.characterId,
    characterName: character?.name || character?.nickname || '',
    preview: finalText.slice(0, 60),
    sessionId: sess.id
  });

  // 写长期记忆（来源 chat）
  try {
    const category = pickReplyCategory(userMsg.content || '');
    await recordInteraction({
      characterId: sess.characterId,
      role: 'assistant',
      source: 'chat',
      content: finalText,
      mood: inferMood(category),
      importance: inferImportance(category),
      relatedApp: 'chat',
      timestamp: aiMsg.timestamp
    });
  } catch (e) {
    console.warn('[chat] 记忆写入失败', e);
  }

  // ── 新流程：回复完成后跑情绪检测 + 自动提取记忆 + 归档老记忆 ──
  // 情绪检测：根据我和主人的话判情绪，写记仇本 / 原谅
  try {
    await handleEmotion(finalText, sess.characterId, userMsg?.content || '');
  } catch (e) {
    console.warn('[chat] 情绪检测失败', e);
  }
  // 自动提取记忆：从对话里抽"我叫XX / 我喜欢XX / 我的生日是XX" 这种值得记的事
  try {
    await autoRecordMemories(userMsg?.content || '', finalText, sess.characterId);
  } catch (e) {
    console.warn('[chat] 自动提取记忆失败', e);
  }
  // 归档老记忆：超过 100 条时把低重要度的归档（异步跑，不阻塞 UI）
  archiveOldMemories(sess.characterId).catch((e) => {
    console.warn('[chat] 归档老记忆失败', e);
  });

  // AI 回复完成即视为对方已读用户的消息——标记该会话所有用户消息为 read
  // （markUserMessagesRead 内部会刷新当前会话可见消息的状态图标 + emit chat:messages-read）
  try { await markUserMessagesRead(sess.id); } catch (e) {}

  setReplying(false);
  state.streamCancelled = false;
}

/** 更新会话 lastMessage/lastAt，可选未读计数 */
async function bumpSession(sess, preview, timestamp, addUnread = 0) {
  const state = getState();
  try {
    const cur = await getDB(STORES.chatSessions, sess.id) || sess;
    const nextUnread = addUnread > 0 ? (cur.unread || 0) + addUnread : (state.view === 'chat' && state.currentSessionId === sess.id ? 0 : (cur.unread || 0));
    await setDB(STORES.chatSessions, sess.id, {
      ...cur,
      lastMessage: preview,
      lastAt: timestamp,
      unread: nextUnread
    });
    if (state.currentSessionId === sess.id) {
      state.currentSession = { ...cur, lastMessage: preview, lastAt: timestamp, unread: nextUnread };
    }
  } catch (e) {
    console.warn('[chat] 更新会话失败', e);
  }
}

// ════════════════════════════════════════
// 取消流式 / 发送按钮态
// ════════════════════════════════════════

export function cancelStreaming() {
  const state = getState();
  state.streamCancelled = true;
  if (state.abortController) {
    try { state.abortController.abort(); } catch (e) {}
    state.abortController = null;
  }
}

function setReplying(replying) {
  const state = getState();
  state.isReplying = replying;
  if (state.sendBtnEl) {
    state.sendBtnEl.innerHTML = replying ? createIcon('pause', 20).outerHTML : createIcon('check', 20).outerHTML;
    state.sendBtnEl.setAttribute('aria-label', replying ? '停止回复' : '发送');
  }
}

// ════════════════════════════════════════
// 工具：escapeHTML 已收拢到 ./shared-utils.js
// ════════════════════════════════════════

