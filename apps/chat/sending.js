// apps/chat/sending.js
// 发送消息 + AI 流式回复核心——文字/图片发送、流式渲染、本地兜底、失败重试、取消、写记忆。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js,
//       core/ai-client.js, core/memory.js, core/inbox.js, core/util.js, ./local-replies.js
// 状态由 index.js 持有，通过 getState 拿；发送函数 export 给 detail-view.js 调用。

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, getAllDB, generateId, getNow, compressImage } from '../../core/storage.js';
import { showToast, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { pickImageFile } from '../../core/util.js';
import { streamChat, buildMessages, isAIConfigured } from '../../core/ai-client.js';
import { buildMemoryPrompt, recordInteraction } from '../../core/memory.js';
import { getRecentEventsPrompt } from '../../core/inbox.js';
import { getLocalReply, pickReplyCategory, inferMood, inferImportance } from './local-replies.js';
import { getState } from './index.js';
import {
  appendMessageEl, updateChatHeader, scrollToBottom,
  showTypingIndicator, hideTypingIndicator,
  clearQuote, autoResizeInput, flushDraft
} from './detail-view.js';

// ════════════════════════════════════════
// 发送消息（文字）
// ════════════════════════════════════════

export async function sendMessage() {
  const state = getState();
  if (!state.inputEl || !state.messageListEl) return;
  if (state.isReplying) return;
  const text = state.inputEl.value.trim();
  if (!text) return;

  // 取出引用（发送后清空）
  const quote = state.pendingQuote || null;
  clearQuote();

  // 清空输入框并重置高度
  state.inputEl.value = '';
  autoResizeInput();
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
    timestamp: getNow()
  };
  try {
    await setDB(STORES.messages, userMsg.id, userMsg);
  } catch (e) {
    console.warn('[chat] 保存用户消息失败', e);
    showToast('消息没发出去，再试一下嘛', 'error');
    return;
  }

  // 渲染用户消息
  appendMessageEl(userMsg);
  updateChatHeader(userMsg.timestamp);
  scrollToBottom();

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
// AI 回复（核心）
// ════════════════════════════════════════

async function triggerAIReply(userMsg) {
  const state = getState();
  const session = state.currentSession;
  // 兼容：若用户切走了会话，仍用闭包里的 session 继续
  const sess = session || null;
  if (!sess) return;

  setReplying(true);
  state.streamCancelled = false;
  showTypingIndicator();
  scrollToBottom();

  // 读角色
  let character = state.currentCharacter;
  if (!character || character.id !== sess.characterId) {
    try { character = await getDB(STORES.characters, sess.characterId); } catch (e) {}
    if (state.currentSessionId === sess.id) state.currentCharacter = character;
  }

  // 历史消息（最近 20 条）
  let history = [];
  try {
    const all = await getAllDB(STORES.messages);
    history = all
      .filter((m) => m.sessionId === sess.id || (!m.sessionId && m.characterId === sess.characterId))
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
      const hits = wb.matchWorldbook(userText, sess.characterId);
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

  const messages = buildMessages({
    character,
    history,
    userText: userMsg.type === 'image' ? '（用户发了一张图片）' : userMsg.content,
    memoryPrompt: worldbookContext ? `${memoryPrompt}\n\n${worldbookContext}` : memoryPrompt,
    recentEvents
  });

  // 隐藏呼吸气泡，建空气泡
  hideTypingIndicator();
  const aiMsg = {
    id: generateId('msg'),
    sessionId: sess.id,
    characterId: sess.characterId,
    role: 'assistant',
    content: '',
    type: 'text',
    timestamp: getNow()
  };
  const msgEl = appendMessageEl(aiMsg, { stream: true });
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

  // ── 走 AI 流式 ──
  if (isAIConfigured()) {
    const result = await runAIStream(bubbleEl, messages, sess, () => accText, (t) => { accText = t; });
    if (result.ok) {
      await finishAIMessage(sess, character, aiMsg, msgEl, bubbleEl, accText, userMsg);
      return;
    }
    if (result.reason === 'not_configured') {
      // 配置中途被改了，走本地兜底
    } else if (result.reason === 'cancelled') {
      // 用户取消，保留已流式部分（若有）
      await finishAIMessage(sess, character, aiMsg, msgEl, bubbleEl, accText, userMsg);
      return;
    } else {
      // fetch_failed 且用户没点重试（关掉了），保留空气泡或移除
      if (!accText && msgEl.isConnected) {
        msgEl.remove();
      } else {
        await finishAIMessage(sess, character, aiMsg, msgEl, bubbleEl, accText, userMsg);
      }
      setReplying(false);
      return;
    }
  }

  // ── 本地兜底 ──
  const replyText = getLocalReply(userMsg.content, state.lastReply, { isImage: userMsg.type === 'image' });
  state.lastReply = replyText;
  accText = await streamLocalReply(bubbleEl, replyText);
  await finishAIMessage(sess, character, aiMsg, msgEl, bubbleEl, accText, userMsg);
}

/**
 * 跑一次 AI 流式请求。失败时在气泡里显示重试按钮，等用户决定。
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
async function runAIStream(bubbleEl, messages, sess, getAcc, setAcc) {
  const state = getState();
  while (true) {
    state.abortController = new AbortController();
    let acc = '';
    setAcc('');
    if (bubbleEl.isConnected) {
      bubbleEl.innerHTML = '<span class="chat-cursor"></span>';
    }
    const result = await streamChat({
      messages,
      onToken: (delta) => {
        acc += delta;
        setAcc(acc);
        if (bubbleEl.isConnected) {
          bubbleEl.innerHTML = escapeHTML(acc) + '<span class="chat-cursor"></span>';
          scrollToBottom();
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
      // 在气泡里显示重试按钮，等用户决定
      const choice = await showRetryAndWait(bubbleEl);
      if (choice === 'retry') continue; // 再来一次
      return { ok: false, reason: 'cancelled' };
    }
    // 未知原因
    return { ok: false, reason: 'unknown' };
  }
}

/** 在空气泡里显示重试按钮，返回 Promise<'retry'|'dismiss'> */
function showRetryAndWait(bubbleEl) {
  return new Promise((resolve) => {
    if (!bubbleEl.isConnected) { resolve('dismiss'); return; }
    bubbleEl.innerHTML = `<button class="chat-retry-btn" type="button">${createIcon('back', 16).outerHTML}<span>重新联系</span></button>`;
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
      if (bubbleEl.isConnected) {
        bubbleEl.innerHTML = escapeHTML(acc) + '<span class="chat-cursor"></span>';
        scrollToBottom();
      }
      state.typingTimer = setTimeout(tick, 50);
    }
    tick();
  });
}

/** AI 回复完成：保存、更新会话、emit 事件、写记忆 */
async function finishAIMessage(sess, character, aiMsg, msgEl, bubbleEl, finalText, userMsg) {
  const state = getState();
  // 没有任何文本（被取消且没流到字）-> 移除空气泡
  if (!finalText || !finalText.trim()) {
    if (msgEl.isConnected) msgEl.remove();
    setReplying(false);
    state.streamCancelled = false;
    return;
  }
  // 去掉光标，固定文本
  if (bubbleEl.isConnected) {
    bubbleEl.textContent = finalText;
  }
  aiMsg.content = finalText;
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
// 工具
// ════════════════════════════════════════

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
