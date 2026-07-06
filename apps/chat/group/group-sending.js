// apps/chat/group/group-sending.js
// 群聊发送 + AI 回复核心。复用 sending.js 的流式骨架，但：
//   - 消息写 STORES.groupMessages（按 groupId 隔离）
//   - 记忆走 scope='group'（buildGroupMemoryPrompt / recordInteraction）
//   - AI 回复轮询成员：每次用户发言后，挑一个成员回复（@触发时挑被@的成员）
//   - 群消息带 senderId/senderName/senderAvatar，渲染时显示发言人
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js,
//       core/ai-client.js, core/memory.js, core/util.js, ./group-detail-view.js
// 全中文注释；不省 token；功能不阉割。

import { STORES, KEYS } from '../../../core/storage-keys.js';
import { getDB, setDB, getAllDB, generateId, getNow, compressImage } from '../../../core/storage.js';
import { showToast, createIcon, registerIcon } from '../../../core/ui.js';
import bus from '../../../core/events.js';
import { pickImageFile } from '../../../core/util.js';
import { streamChat, buildMessages, isAIConfigured, parseThinkingTags } from '../../../core/ai-client.js';
import { buildGroupMemoryPrompt, recordInteraction } from '../../../core/memory.js';
import { archiveOldGroupMemories } from '../../../js/ai/ai-memory.js';
import { getRecentEventsPrompt } from '../../../core/inbox.js';
import { getState } from '../index.js';
import { recalcChatUnread } from '../sending.js';
import {
  appendGroupMessageEl, updateGroupChatHeader, scrollToBottom,
  showGroupTypingIndicator, hideGroupTypingIndicator,
  clearGroupQuote, autoResizeGroupInput, updateGroupSendButtonState,
  updateGroupMessageStatus, updateGroupThinkingUI,
  isNearBottom
} from './group-detail-view.js';
import { renderMarkdown } from '../markdown.js';
import { enhanceCodeBlocks } from '../code-block.js';
import { escapeHTML } from '../shared-utils.js';

// 注册重试图标（与单聊一致）
registerIcon('refresh', 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0 1 14.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0 0 20.49 15');

// ════════════════════════════════════════
// 群配置读写
// ════════════════════════════════════════

function readGroupConfig(groupId) {
  try {
    const raw = localStorage.getItem(KEYS.groupConfig(groupId));
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { groupId, lastReplierIndex: 0, groupAtTrigger: true, hapticOnReceive: true };
}

function writeGroupConfig(groupId, patch) {
  const cur = readGroupConfig(groupId);
  const next = { ...cur, ...patch };
  try { localStorage.setItem(KEYS.groupConfig(groupId), JSON.stringify(next)); } catch (e) {}
  return next;
}

// ════════════════════════════════════════
// 发送文字消息
// ════════════════════════════════════════

export async function sendGroupMessage() {
  const state = getState();
  if (!state.inputEl || !state.messageListEl) return;
  if (state.isReplying) return;
  const text = state.inputEl.value.trim();
  if (!text) return;
  const session = state.currentSession;
  if (!session || !session.isGroup) return;

  const quoteObj = state.pendingQuote || null;
  clearGroupQuote();

  state.inputEl.value = '';
  autoResizeGroupInput();
  updateGroupSendButtonState();

  const userMsg = {
    id: generateId('gmsg'),
    groupId: session.groupId,
    sessionId: session.id,
    senderId: 'user',
    senderName: '我',
    senderAvatar: '',
    role: 'user',
    content: text,
    type: 'text',
    quote: quoteObj?.text || null,
    quoteId: quoteObj?.id || null,
    quoteSender: quoteObj?.sender || null,
    status: 'sending',
    timestamp: getNow()
  };

  appendGroupMessageEl(userMsg);
  updateGroupChatHeader(userMsg.timestamp);
  scrollToBottom();

  try {
    await setDB(STORES.groupMessages, userMsg.id, userMsg);
    userMsg.status = 'sent';
    try { await setDB(STORES.groupMessages, userMsg.id, userMsg); } catch (e) {}
    updateGroupMessageStatus(userMsg.id, 'sent');
  } catch (e) {
    console.warn('[group] 保存群消息失败', e);
    userMsg.status = 'failed';
    try { await setDB(STORES.groupMessages, userMsg.id, userMsg); } catch (e2) {}
    updateGroupMessageStatus(userMsg.id, 'failed', userMsg);
    showToast('消息没发出去，再试一下嘛', 'error');
    return;
  }

  await bumpGroupSession(session, text.slice(0, 60), userMsg.timestamp);
  // 带 muted 标志：免打扰群聊的发言事件不生成消息卡片、不弹横幅
  bus.emit('chat:group-user-message', {
    groupId: session.groupId,
    sessionId: session.id,
    preview: text.slice(0, 60),
    muted: !!session.muted
  });

  await triggerGroupAIReply(userMsg);
}

// ════════════════════════════════════════
// 发送图片消息
// ════════════════════════════════════════

export async function sendGroupImageMessage() {
  const state = getState();
  if (state.isReplying) {
    showToast('等群里回完再发图片嘛', 'default', 1400);
    return;
  }
  const session = state.currentSession;
  if (!session || !session.isGroup) return;
  let file = null;
  try { file = await pickImageFile(); } catch (e) {}
  if (!file) return;
  let dataUrl = '';
  try {
    dataUrl = await compressImage(file, { maxWidth: 1620, quality: 0.82 });
  } catch (e) {
    console.warn('[group] 图片压缩失败', e);
    showToast('图片处理不了，换一张试试嘛', 'error');
    return;
  }
  const userMsg = {
    id: generateId('gmsg'),
    groupId: session.groupId,
    sessionId: session.id,
    senderId: 'user',
    senderName: '我',
    senderAvatar: '',
    role: 'user',
    content: '',
    type: 'image',
    mediaUrl: dataUrl,
    status: 'sending',
    timestamp: getNow()
  };
  appendGroupMessageEl(userMsg);
  updateGroupChatHeader(userMsg.timestamp);
  scrollToBottom();
  try {
    await setDB(STORES.groupMessages, userMsg.id, userMsg);
    userMsg.status = 'sent';
    try { await setDB(STORES.groupMessages, userMsg.id, userMsg); } catch (e) {}
    updateGroupMessageStatus(userMsg.id, 'sent');
  } catch (e) {
    userMsg.status = 'failed';
    try { await setDB(STORES.groupMessages, userMsg.id, userMsg); } catch (e2) {}
    updateGroupMessageStatus(userMsg.id, 'failed', userMsg);
    showToast('图片没发出去，再试一下嘛', 'error');
    return;
  }
  await bumpGroupSession(session, '[图片]', userMsg.timestamp);
  await triggerGroupAIReply(userMsg);
}

// ════════════════════════════════════════
// 发送其他类型（文件/位置/名片/拍照）—— 内容描述塞 content，富字段塞 meta
// ════════════════════════════════════════

export async function sendGroupRichMessage(partial) {
  const state = getState();
  if (state.isReplying) {
    showToast('等群里回完再发嘛', 'default', 1400);
    return;
  }
  const session = state.currentSession;
  if (!session || !session.isGroup) return;
  const userMsg = {
    id: generateId('gmsg'),
    groupId: session.groupId,
    sessionId: session.id,
    senderId: 'user',
    senderName: '我',
    senderAvatar: '',
    role: 'user',
    content: partial.content || '',
    type: partial.type || 'text',
    status: 'sending',
    timestamp: getNow(),
    ...partial.meta
  };
  appendGroupMessageEl(userMsg);
  updateGroupChatHeader(userMsg.timestamp);
  scrollToBottom();
  try {
    await setDB(STORES.groupMessages, userMsg.id, userMsg);
    userMsg.status = 'sent';
    try { await setDB(STORES.groupMessages, userMsg.id, userMsg); } catch (e) {}
    updateGroupMessageStatus(userMsg.id, 'sent');
  } catch (e) {
    userMsg.status = 'failed';
    try { await setDB(STORES.groupMessages, userMsg.id, userMsg); } catch (e2) {}
    updateGroupMessageStatus(userMsg.id, 'failed', userMsg);
    showToast('没发出去，再试一下嘛', 'error');
    return;
  }
  const preview = partial.preview || userMsg.content?.slice(0, 60) || `[${partial.type}]`;
  await bumpGroupSession(session, preview, userMsg.timestamp);
  await triggerGroupAIReply(userMsg);
}

// ════════════════════════════════════════
// 失败重发
// ════════════════════════════════════════

export async function retrySendGroupMessage(msg) {
  // 只重置状态重新落盘 + 重触发；图片/富消息的 mediaUrl 已在库里
  const next = { ...msg, status: 'sending', timestamp: getNow() };
  try { await setDB(STORES.groupMessages, msg.id, next); } catch (e) {}
  updateGroupMessageStatus(msg.id, 'sent');
  const session = getState().currentSession;
  if (session && session.groupId === msg.groupId) {
    await triggerGroupAIReply(next);
  }
}

// ════════════════════════════════════════
// 取消流式
// ════════════════════════════════════════

export function cancelGroupStreaming() {
  const state = getState();
  state.streamCancelled = true;
  if (state.abortController) {
    try { state.abortController.abort(); } catch (e) {}
    state.abortController = null;
  }
}

function setGroupReplying(replying) {
  const state = getState();
  state.isReplying = replying;
  if (state.sendBtnEl) {
    state.sendBtnEl.innerHTML = replying ? createIcon('pause', 20).outerHTML : createIcon('check', 20).outerHTML;
    state.sendBtnEl.setAttribute('aria-label', replying ? '停止回复' : '发送');
  }
}

// ════════════════════════════════════════
// 群 AI 回复（核心）
// ════════════════════════════════════════

/**
 * 群聊 AI 回复。逻辑：
 *   1. 读群配置 groupAtTrigger：true 时只在用户 @某人 或 @所有人 时回复；
 *      false 时每次用户发言都回复（轮询一个成员回复）
 *   2. @某人 → 该角色回复；@所有人 / 关闭触发 → 轮询挑一个成员回复
 *   3. 回复走 streamChat，记忆用 buildGroupMemoryPrompt（scope='group'）
 *   4. 回复完成后 recordInteraction({scope:'group', groupId, ...}) 写群记忆
 *   5. 用户切走时只落盘不渲染
 */
export async function triggerGroupAIReply(userMsg) {
  const state = getState();
  let sess = null;
  try { sess = await getDB(STORES.chatSessions, userMsg.sessionId); } catch (e) {}
  if (!sess) return;
  const groupId = sess.groupId || userMsg.groupId;
  if (!groupId) return;
  const viewingThis = state.currentSession?.id === sess.id;

  // 解析要回复的角色
  const repliers = pickRepliers(sess, userMsg);
  if (!repliers.length) return; // @触发且无人被@，静默

  const cfg = readGroupConfig(groupId);
  // 取第一个回复者（@多人时按顺序依次回复会太吵，只取第一个被@的）
  let replier = repliers[0];
  // 非明确 @某人 时，按轮询指针挑一个
  if (!repliers._explicit) {
    const idx = (cfg.lastReplierIndex || 0) % sess.participants.length;
    replier = sess.participants[idx];
    writeGroupConfig(groupId, { lastReplierIndex: (idx + 1) % sess.participants.length });
  }

  setGroupReplying(true);
  state.streamCancelled = false;

  if (viewingThis) {
    try {
      const cur = await getDB(STORES.groupMessages, userMsg.id);
      if (cur && cur.status === 'sent') {
        cur.status = 'delivered';
        await setDB(STORES.groupMessages, userMsg.id, cur);
        updateGroupMessageStatus(userMsg.id, 'delivered');
      }
    } catch (e) {}
    showGroupTypingIndicator(replier);
    scrollToBottom();
  }

  // 历史消息（最近 20 条，按 groupId）
  let history = [];
  try {
    const all = await getAllDB(STORES.groupMessages);
    history = all
      .filter((m) => m.groupId === groupId && m.id !== userMsg.id)
      .sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt))
      .slice(-20)
      .map((m) => ({
        // 群聊历史里把发言者身份标进 content，让 AI 知道是谁说的
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.role === 'assistant'
          ? `${m.senderName}：${m.content || ''}`
          : `我：${m.content || (m.type === 'image' ? '（图片）' : '')}`
      }));
  } catch (e) {}

  // 群记忆 + 最近事件
  let memoryPrompt = '';
  try { memoryPrompt = await buildGroupMemoryPrompt(groupId, { limit: 20 }); } catch (e) {}
  let recentEvents = '';
  try { recentEvents = getRecentEventsPrompt(8); } catch (e) {}

  // 把角色当作 character 传给 buildMessages（人设/开场白等来自角色）
  const character = {
    id: replier.id,
    name: replier.name,
    nickname: replier.name,
    avatar: replier.avatar,
    persona: replier.persona || '',
    greeting: ''
  };

  // 群聊 system 提示：告诉 AI 这是群聊，自己在扮演谁
  const groupSystemPrompt = `你正在一个群聊里。群里成员有：${sess.participants.map((p) => p.name).join('、')}。你这次扮演「${replier.name}」，请用 ${replier.name} 的语气和人设回复。其他成员的发言会用「名字：内容」的格式给你看。直接以 ${replier.name} 的身份回一句话就行，不要在开头重复自己的名字。`;

  const userText = userMsg.type === 'image'
    ? '（我发了一张图片）'
    : (userMsg.content || '');

  const messages = await buildMessages({
    character,
    history,
    userText,
    memoryPrompt: `${groupSystemPrompt}\n\n${memoryPrompt}`,
    recentEvents
  });

  if (viewingThis) hideGroupTypingIndicator();
  const aiMsg = {
    id: generateId('gmsg'),
    groupId,
    sessionId: sess.id,
    senderId: replier.id,
    senderName: replier.name,
    senderAvatar: replier.avatar || '',
    role: 'assistant',
    content: '',
    type: 'text',
    timestamp: getNow()
  };
  let msgEl = viewingThis ? appendGroupMessageEl(aiMsg, { stream: true }) : null;
  if (!msgEl) {
    msgEl = document.createElement('div');
    msgEl.innerHTML = '<div class="chat-bubble"></div>';
  }
  const bubbleEl = msgEl.querySelector('.chat-bubble');

  // 本地模式提示（按群专属配置判断）
  if (!isAIConfigured(groupId) && !state.localModeHintedSessions.has(sess.id)) {
    state.localModeHintedSessions.add(sess.id);
    const hint = document.createElement('div');
    hint.className = 'chat-local-hint';
    hint.textContent = '（本地模式，配置 AI 接口后回复更自然）';
    if (msgEl.firstChild) msgEl.insertBefore(hint, msgEl.firstChild);
    else msgEl.appendChild(hint);
  }

  let accText = '';
  let thinkingText = '';

  if (isAIConfigured(groupId)) {
    const result = await runGroupAIStream(bubbleEl, messages, sess, replier, groupId,
      () => accText, (t) => { accText = t; },
      () => thinkingText, (t) => { thinkingText = t; },
      msgEl, aiMsg);
    if (result.ok) {
      await finishGroupAIMessage(sess, replier, aiMsg, msgEl, bubbleEl, accText, userMsg, thinkingText);
      return;
    }
    if (result.reason === 'cancelled') {
      await finishGroupAIMessage(sess, replier, aiMsg, msgEl, bubbleEl, accText, userMsg, thinkingText);
      return;
    }
  }
  // 本地兜底
  const fallback = await getGroupLocalReply(replier, userText);
  accText = fallback;
  if (viewingThis) {
    bubbleEl.innerHTML = renderMarkdown(fallback);
    enhanceCodeBlocks(bubbleEl);
  }
  await finishGroupAIMessage(sess, replier, aiMsg, msgEl, bubbleEl, fallback, userMsg, '');
}

// ════════════════════════════════════════
// 解析要回复的角色
// ════════════════════════════════════════

/**
 * 根据群配置 + 用户消息，决定哪些角色要回复。
 * @returns {Array & {_explicit?: boolean}} _explicit=true 表示是 @触发（明确指定）
 */
function pickRepliers(sess, userMsg) {
  const cfg = readGroupConfig(sess.groupId);
  const text = (userMsg.content || '').toLowerCase();
  const result = [];
  // @所有人 → 全员（但实际只取第一个，避免太吵）
  if (/@(所有人|all|大家)/i.test(text)) {
    result.push(...sess.participants);
    result._explicit = true;
    return result;
  }
  // @角色名
  for (const p of sess.participants) {
    const name = (p.name || '').toLowerCase();
    if (name && text.includes(`@${name}`)) {
      result.push(p);
    }
  }
  if (result.length) {
    result._explicit = true;
    return result;
  }
  // 关闭 @触发 → 轮询（返回空数组让上层走轮询逻辑）
  if (!cfg.groupAtTrigger) {
    // 返回空数组但带 _explicit=false，上层会走轮询
    result._explicit = false;
    return result;
  }
  // 开启 @触发 且无人被@ → 静默
  result._explicit = true;
  return result;
}

// ════════════════════════════════════════
// 流式执行 + 完成（参照 sending.js 但走 groupMessages）
// ════════════════════════════════════════

async function runGroupAIStream(bubbleEl, messages, sess, replier, groupId, getAcc, setAcc, getThinking, setThinking, msgEl, aiMsg) {
  const state = getState();
  const ctrl = new AbortController();
  state.abortController = ctrl;
  // 首次进入时初始化气泡：显示已有内容 + 光标（与单聊 runAIStream 一致）
  const initAcc = getAcc() || '';
  if (bubbleEl.isConnected) {
    bubbleEl.innerHTML = escapeHTML(initAcc) + '<span class="chat-cursor"></span>';
  }
  const result = await streamChat({
    messages,
    ownerId: groupId,  // 让群专属 aiOverride 生效
    onChunk: (delta) => {
      // streamChat 传的是 delta（增量），不是累积文本
      // 流式期间用 textContent 增量显示，不调 renderMarkdown/enhanceCodeBlocks（与单聊一致）
      if (state.streamCancelled) return;
      if (!state.messageListEl || state.currentSession?.id !== sess.id) return;
      const acc = (getAcc() || '') + delta;  // 累加
      setAcc(acc);
      if (bubbleEl.isConnected) {
        renderGroupStreamToken(bubbleEl, acc);
        if (isNearBottom()) scrollToBottom();
      }
    },
    onThinking: (delta) => {
      if (state.streamCancelled) return;
      if (!delta) return;
      const next = (getThinking() || '') + delta;  // 累加
      setThinking(next);
      if (msgEl && msgEl.isConnected) {
        updateGroupThinkingUI(msgEl, next, { streaming: true });
        if (isNearBottom()) scrollToBottom();
      }
    },
    signal: ctrl.signal
  });
  return result;
}

/**
 * 流式渲染单个 token：维护一个 textNode，仅追加新内容，避免全量 innerHTML 重排。
 * 与单聊 sending.js 的 renderStreamToken 逻辑一致（群聊独立实现，避免循环依赖）。
 */
function renderGroupStreamToken(bubbleEl, fullText) {
  let textNode = bubbleEl.firstChild;
  if (!textNode || textNode.nodeType !== Node.TEXT_NODE) {
    textNode = document.createTextNode('');
    bubbleEl.insertBefore(textNode, bubbleEl.firstChild);
  }
  if (textNode.textContent !== fullText) {
    textNode.textContent = fullText;
  }
  if (!bubbleEl.querySelector('.chat-cursor')) {
    const cursor = document.createElement('span');
    cursor.className = 'chat-cursor';
    bubbleEl.appendChild(cursor);
  }
}

async function finishGroupAIMessage(sess, replier, aiMsg, msgEl, bubbleEl, finalText, userMsg, thinkingText = '') {
  const state = getState();
  const viewingThis = state.currentSession?.id === sess.id;
  // parseThinkingTags 返回数组，遍历累加出 content / thinking
  const segs = parseThinkingTags(finalText);
  let content = '';
  let thinking = '';
  for (const seg of segs) {
    if (seg.type === 'thinking') thinking += seg.text;
    else content += seg.text;
  }
  aiMsg.content = content || finalText;
  aiMsg.thinking = thinking || thinkingText || '';
  aiMsg.status = 'sent';
  try { await setDB(STORES.groupMessages, aiMsg.id, aiMsg); } catch (e) {}
  if (viewingThis) {
    if (bubbleEl) {
      bubbleEl.innerHTML = renderMarkdown(aiMsg.content);
      enhanceCodeBlocks(bubbleEl);
    }
    if (aiMsg.thinking) updateGroupThinkingUI(msgEl, aiMsg.thinking, { streaming: false });
    updateGroupChatHeader(aiMsg.timestamp);
    scrollToBottom();
  }
  // 更新会话 lastMessage
  await bumpGroupSession(sess, `${replier.name}：${aiMsg.content.slice(0, 50)}`, aiMsg.timestamp);
  // 写群记忆
  try {
    await recordInteraction({
      scope: 'group',
      groupId: sess.groupId,
      characterId: replier.id,
      role: 'assistant',
      source: 'group-chat',
      content: aiMsg.content,
      mood: '',
      importance: 5,
      relatedApp: 'chat',
      relatedId: aiMsg.id
    });
  } catch (e) {
    console.warn('[group] 写群记忆失败', e);
  }
  // 群记忆归档：与单聊对称，超过 100 条时异步归档低重要度的，不阻塞回复
  archiveOldGroupMemories(sess.groupId).catch((e) => {
    console.warn('[group] 群记忆归档失败', e);
  });
  // 通知其他 App（带 muted 标志：免打扰群聊的 AI 回复不生成消息卡片、不弹横幅）
  bus.emit('chat:group-ai-message', {
    groupId: sess.groupId,
    sessionId: sess.id,
    senderId: replier.id,
    senderName: replier.name,
    preview: aiMsg.content.slice(0, 60),
    muted: !!sess.muted
  });
  setGroupReplying(false);
  state.abortController = null;
}

// ════════════════════════════════════════
// 更新群会话 lastMessage/lastAt
// ════════════════════════════════════════

async function bumpGroupSession(sess, preview, timestamp, addUnread = 0) {
  const state = getState();
  try {
    const cur = await getDB(STORES.chatSessions, sess.id) || sess;
    const nextUnread = addUnread > 0
      ? (cur.unread || 0) + addUnread
      : (state.view === 'group' && state.currentSessionId === sess.id ? 0 : (cur.unread || 0));
    await setDB(STORES.chatSessions, sess.id, {
      ...cur,
      lastMessage: preview,
      lastAt: timestamp,
      unread: nextUnread,
      updatedAt: timestamp
    });
    if (state.currentSessionId === sess.id) {
      state.currentSession = { ...cur, lastMessage: preview, lastAt: timestamp, unread: nextUnread };
    }
  } catch (e) {
    console.warn('[group] 更新群会话失败', e);
  }
  // 聚合全局未读数写入 chatUnreadCount，让桌面 chat 图标角标跟着变
  // 修复：原版只更新单个会话 unread，桌面 desktop.js getBadgeMap 读 chatUnreadCount，
  // 群聊消息也走 chatSessions，但不聚合就导致群聊新消息不计入桌面角标。
  recalcChatUnread().catch(() => {});
}

// ════════════════════════════════════════
// 本地兜底回复
// ════════════════════════════════════════

async function getGroupLocalReply(replier, userText) {
  // 简单兜底：角色名 + 几句模板
  const templates = [
    `嗯嗯，${replier.name}在听呢`,
    `${replier.name}觉得你说得对呀`,
    `哈哈，${replier.name}忍不住笑了一下`,
    `${replier.name}想了想，点点头`,
    `嗯...${replier.name}再想想哦`
  ];
  return templates[Math.floor(Math.random() * templates.length)];
}
