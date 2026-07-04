// apps/chat/detail-view.js
// 聊天详情页渲染——header + 消息列表 + 输入区，气泡/对话双模式，打字呼吸气泡，
// 自动滚到底部，长按手势绑定，输入区自适应/草稿/引用。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js
// 状态由 index.js 持有，通过 getState 拿；index.js / sending.js 都会调用本模块函数。

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, getDB, setDB, getAllDB } from '../../core/storage.js';
import { showToast, showBottomSheet, createIcon, registerIcon } from '../../core/ui.js';
import { formatTime, formatRelative, clamp, throttle, isUsableImage, cssUrl } from '../../core/util.js';
import { getState, render, backToSessionList } from './index.js';
import { openChatMoreMenu, openMessageActionSheet } from './message-actions.js';
import { sendMessage, sendImageMessage, cancelStreaming, retrySendMessage } from './sending.js';
import { applySessionWallpaper } from './wallpaper.js';
import { renderMarkdown } from './markdown.js';
import { escapeHTML, escapeAttr, attachLongPress } from './shared-utils.js';
import { openApp } from '../../core/router.js';

// 注册感叹号图标（用于消息发送失败状态）
registerIcon('alert', 'M12 3v10 M12 17h.01');

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
      <button class="app-header-gear" id="chat-settings" aria-label="聊天设置">${createIcon('settings', 18).outerHTML}</button>
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
  // 齿轮跳到设置「AI 与陪伴」分组
  container.querySelector('#chat-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'ai' } }));
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
  // 时间分组：相邻消息间隔 >5 分钟插入时间分隔条
  let lastTime = 0;
  const GROUP_GAP_MS = 5 * 60 * 1000;
  messages.forEach((msg) => {
    const t = new Date(msg.timestamp || msg.createdAt || 0).getTime();
    if (t - lastTime > GROUP_GAP_MS) {
      appendTimeDivider(t);
    }
    appendMessageEl(msg);
    lastTime = t;
  });
  updateChatHeader(messages[messages.length - 1].timestamp || messages[messages.length - 1].createdAt);
  scrollToBottom();
}

/** 插入时间分隔条（居中灰色胶囊小字） */
function appendTimeDivider(time) {
  const state = getState();
  if (!state.messageListEl) return;
  const el = document.createElement('div');
  el.className = 'chat-time-divider';
  el.textContent = formatChatGroupTime(time);
  state.messageListEl.appendChild(el);
}

/** 时间分组显示：今天显示 HH:mm，昨天显示"昨天 HH:mm"，更早显示完整日期 */
function formatChatGroupTime(time) {
  const d = new Date(time);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return `${hh}:${mm}`;
  if (sameDay(d, yesterday)) return `昨天 ${hh}:${mm}`;
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${month}月${day}日 ${hh}:${mm}`;
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

/**
 * 更新已渲染消息的状态图标（sending/sent/failed）。
 * 在 sending.js 中 DB 写入成功/失败后调用。
 * @param {string} msgId
 * @param {'sending'|'sent'|'failed'} status
 * @param {object} [msg] 可选消息对象（失败时用于重试，避免 DB 读不到）
 */
export function updateMessageStatus(msgId, status, msg) {
  const state = getState();
  if (!state.messageListEl) return;
  const row = state.messageListEl.querySelector(`.chat-msg-row[data-id="${cssEscape(msgId)}"]`);
  if (!row) return;
  const metaEl = row.querySelector('.chat-meta');
  if (!metaEl) return;
  // 用一条临时消息对象复用 renderStatusIndicator
  const html = renderStatusIndicator({ status });
  metaEl.innerHTML = html;
  // 失败状态重新绑重试：优先用传入的 msg，否则从 DB 读
  if (status === 'failed') {
    const statusEl = metaEl.querySelector('.chat-status-failed');
    if (statusEl) {
      statusEl.addEventListener('click', async () => {
        try {
          const cur = msg || (await getDB(STORES.messages, msgId));
          if (cur) await retrySendMessage(cur);
        } catch (e) {
          console.warn('[chat] 重试读取消息失败', e);
        }
      });
    }
  }
}

/** CSS.escape 兜底 */
function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, '\\$&');
}

function createMessageEl(msg, opts = {}) {
  const state = getState();
  const mode = getData(KEYS.chatMode, 'bubble');
  const isUser = msg.role === 'user';
  const isImage = msg.type === 'image';

  // ── 撤回占位 ──
  if (msg.recalled) {
    const el = document.createElement('div');
    el.className = 'chat-recalled-hint';
    el.textContent = isUser ? '你撤回了一条消息' : '对方撤回了一条消息';
    return el;
  }

  const el = document.createElement('div');

  if (mode === 'dialog') {
    // 对话模式：Kelivo 风格富文本卡片流
    // AI 消息渲染为独立卡片（背景/圆角/阴影 + 头像昵称 + markdown 正文 + 时间）
    // 用户消息保持简洁：只有名字 + 内容，无卡片背景
    el.className = `chat-msg-row dialog ${isUser ? 'user' : 'ai'}`;
    el.dataset.id = msg.id;
    const name = isUser ? '我' : (state.currentCharacter?.name || state.currentCharacter?.nickname || '她');
    const time = formatTime(msg.timestamp || msg.createdAt);

    // 引用块（dialog 模式也要渲染）
    const quoteHTML = msg.quote
      ? `<div class="chat-quote">引用：${escapeHTML(msg.quote)}</div>`
      : '';

    // 正文内容
    let inner;
    if (isImage) {
      const safeUrl = String(msg.mediaUrl || '').replace(/"/g, '&quot;');
      inner = `<img class="chat-image" src="${safeUrl}" alt="图片" loading="lazy">`;
    } else if (opts.stream) {
      inner = '';
    } else if (isUser) {
      inner = escapeHTML(msg.content || '');
    } else {
      inner = renderMarkdown(msg.content || '');
    }

    if (isUser) {
      // 用户消息：简洁，无卡片背景，只有名字 + 内容
      el.innerHTML = `
        <div class="chat-dialog-user">
          <div class="chat-dialog-user-name">${escapeHTML(name)}</div>
          <div class="chat-bubble">${quoteHTML}${inner}</div>
        </div>
      `;
    } else {
      // AI 消息：独立卡片，头像 + 昵称 + 时间 + markdown 正文
      const avatarHTML = renderCharacterAvatar(state.currentCharacter);
      el.innerHTML = `
        <div class="chat-dialog-card">
          <div class="chat-dialog-card-header">
            <div class="chat-dialog-card-avatar">${avatarHTML}</div>
            <div class="chat-dialog-card-name">${escapeHTML(name)}</div>
            <div class="chat-dialog-card-time">${escapeHTML(time)}</div>
          </div>
          <div class="chat-bubble chat-dialog-card-body">${quoteHTML}${inner}</div>
        </div>
      `;
    }
    attachLongPress(el, () => openMessageActionSheet(msg));
    return el;
  }

  // 气泡模式（默认）
  el.className = `chat-msg-row ${isUser ? 'user' : 'ai'}`;
  el.dataset.id = msg.id;

  // 头像：AI 用 character.avatar；用户用默认 smile icon
  const avatarHTML = isUser ? renderUserAvatar() : renderCharacterAvatar(state.currentCharacter);
  // 多角色昵称：仅在 AI 消息且有角色名时显示
  const nicknameHTML = (!isUser && state.currentCharacter?.name)
    ? `<div class="chat-nickname">${escapeHTML(state.currentCharacter.name)}</div>`
    : '';

  const content = opts.stream ? '' : (msg.content || '');
  let bubbleInner = '';
  if (msg.quote) {
    bubbleInner += `<div class="chat-quote">引用：${escapeHTML(msg.quote)}</div>`;
  }
  if (isImage) {
    const safeUrl = String(msg.mediaUrl || '').replace(/"/g, '&quot;');
    bubbleInner += `<img class="chat-image" src="${safeUrl}" alt="图片" loading="lazy">`;
    if (content) {
      bubbleInner += isUser ? escapeHTML(content) : renderMarkdown(content);
    }
  } else if (opts.stream) {
    bubbleInner += '';
  } else {
    bubbleInner += isUser ? escapeHTML(content) : renderMarkdown(content);
  }

  // 状态图标（仅用户消息显示）
  const statusHTML = isUser ? renderStatusIndicator(msg) : '';

  el.innerHTML = `
    <div class="chat-avatar">${avatarHTML}</div>
    <div class="chat-msg-main">
      ${nicknameHTML}
      <div class="chat-bubble">${bubbleInner}</div>
      <div class="chat-meta">${statusHTML}</div>
    </div>
  `;

  // 图片点击查看大图（增强版：双击放大 / 拖动 / 保存）
  if (isImage) {
    const img = el.querySelector('.chat-image');
    if (img) img.addEventListener('click', () => openImagePreview(msg.mediaUrl));
  }
  // 失败状态点击重试
  if (isUser && msg.status === 'failed') {
    const statusEl = el.querySelector('.chat-status-failed');
    if (statusEl) {
      statusEl.addEventListener('click', () => {
        if (typeof retrySendMessage === 'function') retrySendMessage(msg);
      });
    }
  }
  // 长按操作
  attachLongPress(el, () => openMessageActionSheet(msg));
  return el;
}

/** 渲染角色头像（36px 圆形） */
function renderCharacterAvatar(character) {
  const av = character?.avatar;
  if (av && isUsableImage(av)) {
    return `<div class="chat-avatar-img" style="background-image:${cssUrl(av)}"></div>`;
  }
  return `<div class="chat-avatar-fallback">${createIcon('smile', 22).outerHTML}</div>`;
}

/** 渲染用户头像（36px 圆形，从 settings.systemName 取首字，无则用 smile） */
function renderUserAvatar() {
  // 暂未提供用户头像字段，使用 smile 图标作为默认头像
  return `<div class="chat-avatar-fallback">${createIcon('smile', 22).outerHTML}</div>`;
}

/** 渲染消息状态指示器：sending / sent / failed */
function renderStatusIndicator(msg) {
  const status = msg.status || 'sent';
  if (status === 'sending') {
    return `<span class="chat-status-sending" aria-label="发送中"></span>`;
  }
  if (status === 'failed') {
    return `<span class="chat-status-failed" role="button" aria-label="发送失败，点击重试">${createIcon('alert', 14).outerHTML}</span>`;
  }
  // sent
  return `<span class="chat-status-sent" aria-label="已发送">${createIcon('check', 14).outerHTML}</span>`;
}

function openImagePreview(url) {
  if (!url) return;
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:12px;padding:8px';
  // 图片容器：支持双击放大/缩小 + 拖动平移
  const stage = document.createElement('div');
  stage.className = 'chat-img-stage';
  const img = document.createElement('img');
  img.className = 'chat-img-preview';
  img.src = url;
  img.alt = '图片';
  img.draggable = false;
  stage.appendChild(img);
  body.appendChild(stage);

  // 状态
  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let lastTap = 0;
  let dragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let startTX = 0;
  let startTY = 0;

  const applyTransform = () => {
    img.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  };

  // 双击放大/缩小
  img.addEventListener('click', () => {
    const now = Date.now();
    if (now - lastTap < 350) {
      // 双击
      if (scale > 1) {
        scale = 1; translateX = 0; translateY = 0;
      } else {
        scale = 2;
      }
      applyTransform();
      lastTap = 0;
    } else {
      lastTap = now;
    }
  });

  // 拖动平移（仅在放大状态生效）
  img.addEventListener('pointerdown', (e) => {
    if (scale <= 1) return;
    dragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    startTX = translateX;
    startTY = translateY;
    img.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  img.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    translateX = startTX + (e.clientX - dragStartX);
    translateY = startTY + (e.clientY - dragStartY);
    applyTransform();
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try { img.releasePointerCapture(e.pointerId); } catch (err) {}
  };
  img.addEventListener('pointerup', endDrag);
  img.addEventListener('pointercancel', endDrag);

  // 保存到本地按钮
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn ghost';
  saveBtn.style.cssText = 'display:inline-flex;align-items:center;gap:6px';
  saveBtn.innerHTML = `${createIcon('download', 18).outerHTML}<span>保存到本地</span>`;
  saveBtn.addEventListener('click', async () => {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const ext = (blob.type.split('/')[1] || 'png').split('+')[0];
      const filename = `popo_${Date.now()}.${ext}`;
      // 用 a 标签触发下载
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
      showToast('图片已保存', 'success', 1400);
    } catch (e) {
      // dataURL 直接走 a 下载兜底
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = `popo_${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        showToast('图片已保存', 'success', 1400);
      } catch (e2) {
        console.warn('[chat] 图片保存失败', e2);
        showToast('保存失败了，再试一下嘛', 'error');
      }
    }
  });
  body.appendChild(saveBtn);

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
  const mode = getData(KEYS.chatMode, 'bubble');
  state.typingIndicatorEl = document.createElement('div');
  // dialog 模式下呼吸气泡也走卡片背景，与 AI 消息卡片一致
  state.typingIndicatorEl.className = mode === 'dialog'
    ? 'chat-typing chat-typing-dialog'
    : 'chat-typing';
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

// scrollToBottom 节流 50ms：流式高频调用时避免重排风暴
const _scrollThrottled = throttle(() => {
  const state = getState();
  if (state.messageListEl) state.messageListEl.scrollTop = state.messageListEl.scrollHeight;
}, 50);

export function scrollToBottom() {
  const state = getState();
  if (!state.messageListEl) return;
  // rAF 确保渲染完再滚；外层节流避免流式期间过频
  requestAnimationFrame(_scrollThrottled);
}

// ════════════════════════════════════════
// 长按 / 转义工具已收拢到 ./shared-utils.js
// ════════════════════════════════════════

