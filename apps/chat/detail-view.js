// apps/chat/detail-view.js
// 聊天详情页渲染——header + 消息列表 + 输入区，气泡/对话双模式，打字呼吸气泡，
// 自动滚到底部，长按手势绑定，输入区自适应/草稿/引用。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js
// 状态由 index.js 持有，通过 getState 拿；index.js / sending.js 都会调用本模块函数。

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, getDB, setDB, getAllDB } from '../../core/storage.js';
import { showToast, showBottomSheet, createIcon } from '../../core/ui.js';
import { formatTime, formatRelative, clamp } from '../../core/util.js';
import { getState, render, backToSessionList } from './index.js';
import { openChatMoreMenu, openMessageActionSheet } from './message-actions.js';
import { sendMessage, sendImageMessage, cancelStreaming } from './sending.js';
import { applySessionWallpaper } from './wallpaper.js';

// ════════════════════════════════════════
// 聊天详情页渲染
// ════════════════════════════════════════

export async function renderChatDetailView() {
  const state = getState();
  const container = state.containerEl;
  const session = state.currentSession;
  if (!container || !session) {
    state.view = 'list';
    await render();
    return;
  }

  const mode = getData(KEYS.chatMode, 'bubble');
  const charName = state.currentCharacter?.name || state.currentCharacter?.nickname || session.title || '聊天';

  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="chat-back" aria-label="返回会话列表">${createIcon('back', 20).outerHTML}</button>
      <div class="chat-header-info">
        <div class="chat-header-name" id="chat-header-name">${escapeHTML(charName)}</div>
        <div class="chat-header-status">
          <span class="chat-online-dot" aria-hidden="true"></span>
          <span id="chat-header-status-text">在线</span>
        </div>
      </div>
      <button class="chat-more" id="chat-more" aria-label="聊天设置">${createIcon('more', 20).outerHTML}</button>
    </div>
    <div class="chat-messages" id="chat-messages" data-mode="${escapeAttr(mode)}"></div>
    <div class="chat-input-bar">
      <div class="chat-quote-preview" id="chat-quote-preview" style="display:none">
        <div class="chat-quote-preview-text" id="chat-quote-preview-text"></div>
        <button class="chat-quote-preview-close" id="chat-quote-close" aria-label="取消引用">${createIcon('close', 16).outerHTML}</button>
      </div>
      <div class="chat-input-row">
        <button class="chat-plus" id="chat-plus" aria-label="发送图片">${createIcon('plus', 20).outerHTML}</button>
        <textarea class="chat-input" id="chat-input" placeholder="说点什么吧..." rows="1" enterkeyhint="send" aria-label="输入消息"></textarea>
        <button class="chat-send" id="chat-send" aria-label="发送">${createIcon('check', 20).outerHTML}</button>
      </div>
    </div>
  `;

  // 缓存元素引用
  state.messageListEl = container.querySelector('#chat-messages');
  state.inputEl = container.querySelector('#chat-input');
  state.sendBtnEl = container.querySelector('#chat-send');

  // 绑定事件
  container.querySelector('#chat-back').addEventListener('click', backToSessionList);
  container.querySelector('#chat-more').addEventListener('click', openChatMoreMenu);
  container.querySelector('#chat-plus').addEventListener('click', openInputPlusMenu);
  state.sendBtnEl.addEventListener('click', onSendClick);
  state.inputEl.addEventListener('keydown', onInputKeyDown);
  state.inputEl.addEventListener('input', onInputChanged);
  container.querySelector('#chat-quote-close').addEventListener('click', () => clearQuote());

  // 应用壁纸
  applySessionWallpaper();

  // 恢复草稿 + 引用
  if (session.draft) state.inputEl.value = session.draft;
  if (state.pendingQuote) showQuotePreview(state.pendingQuote);
  autoResizeInput();

  // 加载消息
  await loadAndRenderMessages();
}

async function loadAndRenderMessages() {
  const state = getState();
  if (!state.messageListEl) return;
  const session = state.currentSession;
  if (!session) return;

  let messages = [];
  try {
    const all = await getAllDB(STORES.messages);
    messages = all.filter((m) => m.sessionId === session.id || (!m.sessionId && m.characterId === session.characterId));
  } catch (e) {
    console.warn('[chat] 读取消息失败', e);
    showToast('消息读不出来嘛，等一下再试试', 'error');
  }
  messages.sort((a, b) => {
    const ta = new Date(a.timestamp || a.createdAt || 0).getTime();
    const tb = new Date(b.timestamp || b.createdAt || 0).getTime();
    return ta - tb;
  });

  state.messageListEl.innerHTML = '';
  if (messages.length === 0) {
    renderEmptyState();
    updateChatHeader(null);
    return;
  }
  messages.forEach((msg) => appendMessageEl(msg));
  updateChatHeader(messages[messages.length - 1].timestamp || messages[messages.length - 1].createdAt);
  scrollToBottom();
}

function renderEmptyState() {
  const state = getState();
  if (!state.messageListEl) return;
  const charName = state.currentCharacter?.name || state.currentCharacter?.nickname || '她';
  state.messageListEl.innerHTML = `
    <div class="chat-empty">
      <div class="chat-empty-icon">${createIcon('chat', 48).outerHTML}</div>
      <div class="chat-empty-text">${escapeHTML(charName)}还在等你说话呢，发一条试试嘛</div>
    </div>
  `;
}

export function updateChatHeader(lastMsgTime) {
  const state = getState();
  if (!state.containerEl) return;
  const statusEl = state.containerEl.querySelector('#chat-header-status-text');
  if (statusEl) {
    statusEl.textContent = lastMsgTime ? `在线 · ${formatRelative(lastMsgTime)}` : '在线';
  }
}

// ════════════════════════════════════════
// 消息渲染（气泡模式 / 对话模式）
// ════════════════════════════════════════

export function appendMessageEl(msg, opts = {}) {
  const state = getState();
  if (!state.messageListEl) return null;
  const empty = state.messageListEl.querySelector('.chat-empty');
  if (empty) empty.remove();
  const el = createMessageEl(msg, opts);
  state.messageListEl.appendChild(el);
  return el;
}

function createMessageEl(msg, opts = {}) {
  const state = getState();
  const mode = getData(KEYS.chatMode, 'bubble');
  const isUser = msg.role === 'user';
  const isImage = msg.type === 'image';
  const el = document.createElement('div');

  if (mode === 'dialog') {
    // 对话模式：剧本式，每行"我：xxx" / "角色名：xxx"
    el.className = `chat-msg dialog ${isUser ? 'user' : 'ai'}`;
    el.dataset.id = msg.id;
    const name = isUser ? '我' : (state.currentCharacter?.name || state.currentCharacter?.nickname || '她');
    let inner;
    if (isImage) {
      const safeUrl = String(msg.mediaUrl || '').replace(/"/g, '&quot;');
      inner = `<img class="chat-image" src="${safeUrl}" alt="图片" loading="lazy">`;
    } else {
      inner = opts.stream ? '' : escapeHTML(msg.content || '');
    }
    el.innerHTML = `
      <span class="chat-dialog-name">${escapeHTML(name)}：</span>
      <span class="chat-bubble">${inner}</span>
      <span class="chat-time">${escapeHTML(formatTime(msg.timestamp || msg.createdAt))}</span>
    `;
    // 长按操作
    attachLongPress(el, () => openMessageActionSheet(msg));
    return el;
  }

  // 气泡模式（默认）
  el.className = `chat-msg ${isUser ? 'user' : 'ai'}`;
  el.dataset.id = msg.id;
  const content = opts.stream ? '' : (msg.content || '');
  let bubbleInner = '';
  if (msg.quote) {
    bubbleInner += `<div class="chat-quote">引用：${escapeHTML(msg.quote)}</div>`;
  }
  if (isImage) {
    const safeUrl = String(msg.mediaUrl || '').replace(/"/g, '&quot;');
    bubbleInner += `<img class="chat-image" src="${safeUrl}" alt="图片" loading="lazy">`;
    if (content) bubbleInner += escapeHTML(content);
  } else {
    bubbleInner += escapeHTML(content);
  }
  el.innerHTML = `
    <div class="chat-bubble">${bubbleInner}</div>
    <div class="chat-time">${escapeHTML(formatTime(msg.timestamp || msg.createdAt))}</div>
  `;
  // 图片点击查看大图（用 alert 简化）
  if (isImage) {
    const img = el.querySelector('.chat-image');
    if (img) img.addEventListener('click', () => openImagePreview(msg.mediaUrl));
  }
  // 长按操作
  attachLongPress(el, () => openMessageActionSheet(msg));
  return el;
}

function openImagePreview(url) {
  if (!url) return;
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;justify-content:center;padding:8px';
  body.innerHTML = `<img src="${escapeAttr(url)}" alt="图片" style="max-width:100%;max-height:60vh;border-radius:var(--radius-md);">`;
  showBottomSheet({ title: '查看图片', bodyElement: body, dismissible: true });
}

// ════════════════════════════════════════
// 输入区：自适应高度 / 草稿 / 引用
// ════════════════════════════════════════

function onInputChanged() {
  autoResizeInput();
  // 草稿防抖保存
  const state = getState();
  if (state.saveDraftDebounced) state.saveDraftDebounced();
}

export function autoResizeInput() {
  const state = getState();
  if (!state.inputEl) return;
  state.inputEl.style.height = 'auto';
  const h = clamp(state.inputEl.scrollHeight, 0, 96);
  state.inputEl.style.height = h + 'px';
}

function onInputKeyDown(e) {
  // 回车发送，Shift+回车换行；回复中不拦截
  const state = getState();
  if (e.key === 'Enter' && !e.shiftKey && !state.isReplying) {
    e.preventDefault();
    sendMessage();
  }
}

export async function flushDraft() {
  const state = getState();
  if (!state.inputEl || !state.currentSession) return;
  const draft = state.inputEl.value || '';
  const session = state.currentSession;
  if ((session.draft || '') === draft) return;
  try {
    const cur = await getDB(STORES.chatSessions, session.id) || session;
    await setDB(STORES.chatSessions, session.id, { ...cur, draft });
    state.currentSession = { ...cur, draft };
  } catch (e) {
    console.warn('[chat] 草稿保存失败', e);
  }
}

/** 设置引用：在输入框上方显示引用预览，下一条消息会带上 quote 字段 */
export function setQuoteToInput(text) {
  const state = getState();
  state.pendingQuote = String(text || '').slice(0, 80);
  showQuotePreview(state.pendingQuote);
  try { state.inputEl?.focus(); } catch (e) {}
}

function showQuotePreview(text) {
  const state = getState();
  const previewEl = state.containerEl?.querySelector('#chat-quote-preview');
  const textEl = state.containerEl?.querySelector('#chat-quote-preview-text');
  if (previewEl && textEl) {
    textEl.textContent = `引用：${text}`;
    previewEl.style.display = 'flex';
  }
}

export function clearQuote() {
  const state = getState();
  state.pendingQuote = null;
  const previewEl = state.containerEl?.querySelector('#chat-quote-preview');
  if (previewEl) previewEl.style.display = 'none';
}

// ════════════════════════════════════════
// 发送按钮 / + 菜单
// ════════════════════════════════════════

function onSendClick() {
  const state = getState();
  if (state.isReplying) {
    // 回复中点一下 = 取消
    cancelStreaming();
  } else {
    sendMessage();
  }
}

function openInputPlusMenu() {
  const body = document.createElement('div');
  body.className = 'chat-action-list';
  body.innerHTML = `
    <button class="chat-action-item" data-key="image" role="menuitem">
      ${createIcon('camera', 20).outerHTML}
      <span>发图片</span>
    </button>
  `;
  const sheet = showBottomSheet({ title: '选择发送内容', bodyElement: body, dismissible: true });
  body.querySelector('[data-key="image"]').addEventListener('click', () => {
    sheet.close();
    sendImageMessage();
  });
}

// ════════════════════════════════════════
// 打字呼吸气泡 / 自动滚到底部
// ════════════════════════════════════════

export function showTypingIndicator() {
  const state = getState();
  if (!state.messageListEl) return;
  hideTypingIndicator();
  state.typingIndicatorEl = document.createElement('div');
  state.typingIndicatorEl.className = 'chat-typing';
  state.typingIndicatorEl.setAttribute('aria-label', '她正在打字');
  state.typingIndicatorEl.innerHTML = `
    <div class="chat-typing-dot"></div>
    <div class="chat-typing-dot"></div>
    <div class="chat-typing-dot"></div>
  `;
  state.messageListEl.appendChild(state.typingIndicatorEl);
  scrollToBottom();
}

export function hideTypingIndicator() {
  const state = getState();
  if (state.typingIndicatorEl && state.typingIndicatorEl.parentNode) {
    state.typingIndicatorEl.parentNode.removeChild(state.typingIndicatorEl);
  }
  state.typingIndicatorEl = null;
}

export function scrollToBottom() {
  const state = getState();
  if (!state.messageListEl) return;
  // rAF 确保渲染完再滚
  requestAnimationFrame(() => {
    if (state.messageListEl) state.messageListEl.scrollTop = state.messageListEl.scrollHeight;
  });
}

// ════════════════════════════════════════
// 长按（消息用，调 message-actions 弹操作菜单）
// ════════════════════════════════════════

function attachLongPress(el, handler) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let moved = false;
  const LONG_PRESS_MS = 500;
  const MOVE_THRESHOLD = 10;

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    timer = setTimeout(() => {
      timer = null;
      // 长按触发后阻止 click
      moved = true;
      try { handler(e); } catch (err) { console.warn('[chat] longpress 失败', err); }
    }, LONG_PRESS_MS);
  };
  const onMove = (e) => {
    if (!timer) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
      moved = true;
      clearTimeout(timer);
      timer = null;
    }
  };
  const onUp = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };
  const onClickCapture = (e) => {
    if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('pointerleave', onUp);
  el.addEventListener('contextmenu', (e) => { if (!timer) e.preventDefault(); });
  el.addEventListener('click', onClickCapture, true);
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) { return escapeHTML(s); }
