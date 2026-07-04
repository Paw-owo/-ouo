// apps/chat/detail-view.js
// 聊天详情页渲染——header + 消息列表 + 输入区，气泡/对话双模式，打字呼吸气泡，
// 自动滚到底部，长按手势绑定，输入区自适应/草稿/引用。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js
// 状态由 index.js 持有，通过 getState 拿；index.js / sending.js 都会调用本模块函数。

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, getDB, setDB, getAllDB } from '../../core/storage.js';
import { showToast, showBottomSheet, createIcon, registerIcon } from '../../core/ui.js';
import { formatTime, formatRelative, clamp, throttle, isUsableImage, cssUrl, injectStyle } from '../../core/util.js';
import { getState, render, backToSessionList } from './index.js';
import { openChatMoreMenu, openMessageActionSheet } from './message-actions.js';
import { sendMessage, sendImageMessage, cancelStreaming, retrySendMessage } from './sending.js';
import { applySessionWallpaper } from './wallpaper.js';
import { renderMarkdown } from './markdown.js';
import { escapeHTML, escapeAttr, attachLongPress } from './shared-utils.js';
import { openApp } from '../../core/router.js';
import { stopAllTTS } from '../../core/tts.js';

// 注册感叹号图标（用于消息发送失败状态）
registerIcon('alert', 'M12 3v10 M12 17h.01');

// 注入思维链 / 滚动按钮 / 加载更多 样式（全部走 CSS 变量）
injectStyle('app-chat-thinking-scroll', `
  /* 气泡模式 meta 行（状态图标 / 时间） */
  .chat-meta{ display:flex; align-items:center; gap:6px; }
  .chat-meta:empty{ display:none; }

  /* ── 思维链区域（消息内容上方，可折叠） ── */
  .chat-thinking{
    margin-bottom:6px; border-radius:var(--radius-md);
    background:color-mix(in srgb, var(--accent) 6%, var(--bg-card));
    overflow:hidden;
    transition:var(--motion);
  }
  .chat-thinking-header{
    display:flex; align-items:center; gap:6px;
    padding:6px 10px; cursor:pointer;
    font-size:var(--font-size-small); color:var(--text-hint);
    user-select:none;
  }
  .chat-thinking-header:active{ transform:scale(var(--press-scale)); }
  .chat-thinking-arrow{
    display:inline-flex; transition:transform var(--motion);
    color:var(--text-hint); flex-shrink:0;
  }
  .chat-thinking[data-collapsed="false"] .chat-thinking-arrow{ transform:rotate(180deg); }
  .chat-thinking-label{ flex:1; min-width:0; }
  .chat-thinking-body{
    padding:0 10px 8px;
    font-size:var(--font-size-small); line-height:1.55;
    color:var(--text-hint);
    max-height:240px; overflow-y:auto; -webkit-overflow-scrolling:touch;
    word-break:break-word;
  }
  .chat-thinking[data-collapsed="true"] .chat-thinking-body{ display:none; }
  /* 流式中给 header 加一点呼吸感，提示正在思考 */
  .chat-thinking[data-streaming="true"] .chat-thinking-label{
    color:var(--accent-dark);
  }
  .chat-thinking[data-streaming="true"] .chat-thinking-arrow{
    animation:chatThinkingPulse 1.2s ease-in-out infinite;
    color:var(--accent);
  }
  @keyframes chatThinkingPulse{
    0%,100%{ opacity:0.5; }
    50%{ opacity:1; }
  }
  /* 思维链内 markdown 样式继承 bubble */
  .chat-thinking-body .md-p{ margin:0 0 4px; }
  .chat-thinking-body .md-p:last-child{ margin-bottom:0; }
  .chat-thinking-body .md-code{
    font-family:var(--font-mono, ui-monospace, Menlo, Consolas, monospace);
    background:color-mix(in srgb, var(--text-hint) 18%, transparent);
    padding:1px 4px; border-radius:4px; font-size:0.9em;
  }

  /* ── 滚动到底部浮动按钮 ── */
  .chat-scroll-btn{
    position:absolute; right:14px; bottom:14px;
    width:40px; height:40px; border-radius:50%;
    background:var(--bg-card);
    box-shadow:var(--shadow-md);
    border:1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    display:flex; align-items:center; justify-content:center;
    color:var(--accent-dark);
    cursor:pointer; transition:var(--motion);
    z-index:5;
    opacity:0; transform:translateY(8px) scale(0.8); pointer-events:none;
  }
  .chat-scroll-btn.show{
    opacity:1; transform:translateY(0) scale(1); pointer-events:auto;
  }
  .chat-scroll-btn:active{ transform:scale(var(--press-scale)); }
  .chat-scroll-btn .chat-scroll-badge{
    position:absolute; top:-4px; right:-4px;
    min-width:18px; height:18px; padding:0 5px; border-radius:9px;
    background:var(--accent); color:var(--bubble-user-text);
    font-size:11px; font-weight:600; line-height:18px; text-align:center;
    box-shadow:var(--shadow-sm);
  }

  /* ── 加载更多指示器 ── */
  .chat-load-more{
    align-self:center; text-align:center;
    padding:8px 16px; color:var(--text-hint);
    font-size:var(--font-size-small);
  }
  .chat-load-more-spinner{
    display:inline-block; width:14px; height:14px;
    border:1.5px solid var(--text-hint); border-top-color:transparent;
    border-radius:50%;
    animation:chatStatusSpin 0.8s linear infinite;
    vertical-align:middle; margin-right:6px;
  }
`);

// 思维链区域是否被用户手动操作过（避免流式结束后覆盖用户意图）
const thinkingUserToggled = new WeakSet();

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
    <div class="chat-messages" id="chat-messages" data-mode="${escapeAttr(mode)}">
      <div class="chat-load-more" id="chat-load-more" style="display:none"><span class="chat-load-more-spinner"></span>正在加载更多...</div>
    </div>
    <button class="chat-scroll-btn" id="chat-scroll-btn" type="button" aria-label="滚动到底部">${createIcon('chevron-down', 20).outerHTML}</button>
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
  state.scrollBtnEl = container.querySelector('#chat-scroll-btn');
  state.loadMoreEl = container.querySelector('#chat-load-more');
  state.unseenNewCount = 0;
  state.allMessagesLoaded = false;

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

  // 滚动监听：上滑显示"回到底部"按钮；滑到顶部触发加载更多
  state.messageListEl.addEventListener('scroll', onMessagesScroll);
  state.scrollBtnEl.addEventListener('click', () => {
    state.unseenNewCount = 0;
    updateScrollBtn();
    state.messageListEl.scrollTo({ top: state.messageListEl.scrollHeight, behavior: 'smooth' });
  });

  // 应用壁纸
  applySessionWallpaper();

  // 恢复草稿 + 引用
  if (session.draft) state.inputEl.value = session.draft;
  if (state.pendingQuote) showQuotePreview(state.pendingQuote);
  autoResizeInput();

  // 加载消息
  await loadAndRenderMessages();
}

// 分页：首次加载最近 50 条，滚到顶部再加载更早的
const MESSAGE_PAGE_SIZE = 50;

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

  // 缓存全量消息，供"加载更多"使用
  state.allMessages = messages;
  state.allMessagesLoaded = messages.length <= MESSAGE_PAGE_SIZE;
  state.visibleCount = Math.min(messages.length, MESSAGE_PAGE_SIZE);

  // 清空列表（保留 load-more 占位）
  state.messageListEl.innerHTML = '';
  if (state.loadMoreEl) state.messageListEl.appendChild(state.loadMoreEl);
  updateLoadMoreIndicator();

  if (messages.length === 0) {
    // 空会话：如果有问候语就显示为第一条 AI 消息（不落库，仅展示）
    const greeting = state.currentCharacter?.greeting;
    if (greeting && greeting.trim()) {
      const greetingMsg = {
        id: '__greeting__',
        role: 'assistant',
        content: greeting,
        type: 'text',
        timestamp: session.lastAt || session.createdAt || Date.now(),
        _greeting: true
      };
      appendTimeDivider(new Date(greetingMsg.timestamp).getTime());
      appendMessageEl(greetingMsg);
      updateChatHeader(greetingMsg.timestamp);
    } else {
      renderEmptyState();
      updateChatHeader(null);
    }
    return;
  }

  renderVisibleMessages();
  updateChatHeader(messages[messages.length - 1].timestamp || messages[messages.length - 1].createdAt);
  scrollToBottom();
}

/** 渲染当前 visibleCount 范围内的消息（最后 N 条） */
function renderVisibleMessages() {
  const state = getState();
  if (!state.messageListEl) return;
  const messages = state.allMessages || [];
  const visible = messages.slice(Math.max(0, messages.length - (state.visibleCount || MESSAGE_PAGE_SIZE)));
  // 清空但保留 load-more 占位
  state.messageListEl.innerHTML = '';
  if (state.loadMoreEl) state.messageListEl.appendChild(state.loadMoreEl);
  updateLoadMoreIndicator();
  let lastTime = 0;
  const GROUP_GAP_MS = 5 * 60 * 1000;
  visible.forEach((msg) => {
    const t = new Date(msg.timestamp || msg.createdAt || 0).getTime();
    if (t - lastTime > GROUP_GAP_MS) {
      appendTimeDivider(t);
    }
    appendMessageEl(msg);
    lastTime = t;
  });
}

/** 滚到顶部时加载更早的消息（保持滚动位置不跳到顶部） */
async function loadMoreMessages() {
  const state = getState();
  if (!state.messageListEl || !state.allMessages) return;
  if (state.allMessagesLoaded) return;
  if (state.isLoadingMore) return;
  if (state.isReplying) return; // 回复中不重渲染，避免冲掉流式气泡
  state.isLoadingMore = true;
  updateLoadMoreIndicator();
  // 模拟一点延迟让 spinner 可见（实际 DB 读取很快）
  await new Promise((r) => setTimeout(r, 80));
  const listEl = state.messageListEl;
  const oldScrollHeight = listEl.scrollHeight;
  const oldScrollTop = listEl.scrollTop;
  const total = state.allMessages.length;
  const nextVisible = Math.min(total, (state.visibleCount || MESSAGE_PAGE_SIZE) + MESSAGE_PAGE_SIZE);
  state.visibleCount = nextVisible;
  state.allMessagesLoaded = nextVisible >= total;
  renderVisibleMessages();
  // 保持视图位置：新内容加在顶部，scrollHeight 增加，scrollTop 同步下移
  const newScrollHeight = listEl.scrollHeight;
  listEl.scrollTop = newScrollHeight - oldScrollHeight + oldScrollTop;
  state.isLoadingMore = false;
  updateLoadMoreIndicator();
}

/** 更新"加载更多"指示器显隐 */
function updateLoadMoreIndicator() {
  const state = getState();
  if (!state.loadMoreEl) return;
  // 还有更早的消息可加载时显示指示器（loading 中显示 spinner，否则显示提示）
  const hasMore = !state.allMessagesLoaded && state.allMessages && state.allMessages.length > MESSAGE_PAGE_SIZE;
  state.loadMoreEl.style.display = hasMore ? '' : 'none';
}

/** 滚动监听：上滑显示回到底部按钮 + 滑到顶部加载更多 */
const _onScrollThrottled = throttle(() => {
  const state = getState();
  if (!state.messageListEl) return;
  const el = state.messageListEl;
  const distToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  // 距顶部 < 30 触发加载更多
  if (el.scrollTop < 30 && !state.allMessagesLoaded) {
    loadMoreMessages();
  }
  updateScrollBtn(distToBottom > 200);
}, 80);

function onMessagesScroll() {
  _onScrollThrottled();
}

/** 更新"回到底部"按钮显隐 + 未读新消息徽章 */
function updateScrollBtn(farFromBottom) {
  const state = getState();
  if (!state.scrollBtnEl) return;
  const show = farFromBottom || (state.unseenNewCount || 0) > 0;
  state.scrollBtnEl.classList.toggle('show', !!show);
  // 徽章：有未看新消息时显示
  let badge = state.scrollBtnEl.querySelector('.chat-scroll-badge');
  const count = state.unseenNewCount || 0;
  if (count > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'chat-scroll-badge';
      state.scrollBtnEl.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : String(count);
  } else if (badge) {
    badge.remove();
  }
}

/** 判断是否在底部附近（用于新消息到来时决定自动滚还是只提示） */
export function isNearBottom() {
  const state = getState();
  if (!state.messageListEl) return true;
  const el = state.messageListEl;
  const distToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  return distToBottom < 120;
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
  // 新消息到来：流式中不在此处判定（由流式回调处理）；
  // 非流式 AI 新消息且用户不在底部 -> 不自动滚，只显示"新消息"提示
  if (!opts.stream && msg.role === 'assistant' && !msg._greeting) {
    if (!isNearBottom()) {
      state.unseenNewCount = (state.unseenNewCount || 0) + 1;
      updateScrollBtn(true);
    }
  }
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

  // 1对1会话判断：当前所有会话都是单角色，未来支持群聊时扩展
  const isOneOnOne = isOneOnOneSession(state.currentSession);
  // 思维链 HTML：AI 消息且有 thinking 字段时渲染（流式中由 updateThinkingUI 动态创建）
  const showThinking = !isUser && !opts.stream && !!(msg.thinking && msg.thinking.trim());
  const thinkingHTML = showThinking ? renderThinkingHTML(msg.thinking, { streaming: false }) : '';

  const el = document.createElement('div');

  if (mode === 'dialog') {
    // 对话模式：Kelivo 风格富文本卡片流
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
      // 用户消息：与 AI 卡片对称 —— 头像(右) + 时间 + 名字 + 内容
      const avatarHTML = renderUserAvatar();
      el.innerHTML = `
        <div class="chat-dialog-user">
          <div class="chat-bubble">${quoteHTML}${inner}</div>
          <div class="chat-dialog-user-meta">
            <span class="chat-dialog-user-time">${escapeHTML(time)}</span>
            <span class="chat-dialog-user-name">${escapeHTML(name)}</span>
          </div>
          <div class="chat-dialog-card-avatar chat-dialog-user-avatar">${avatarHTML}</div>
        </div>
      `;
    } else {
      // AI 消息：独立卡片，头像 + 昵称 + 时间 + 思维链 + markdown 正文
      const avatarHTML = renderCharacterAvatar(state.currentCharacter);
      el.innerHTML = `
        <div class="chat-dialog-card">
          <div class="chat-dialog-card-header">
            <div class="chat-dialog-card-avatar">${avatarHTML}</div>
            <div class="chat-dialog-card-name">${escapeHTML(name)}</div>
            <div class="chat-dialog-card-time">${escapeHTML(time)}</div>
          </div>
          ${thinkingHTML}
          <div class="chat-bubble chat-dialog-card-body">${quoteHTML}${inner}</div>
        </div>
      `;
    }
    if (showThinking) bindThinkingToggle(el);
    attachLongPress(el, () => openMessageActionSheet(msg));
    return el;
  }

  // 气泡模式（默认）
  el.className = `chat-msg-row ${isUser ? 'user' : 'ai'}`;
  el.dataset.id = msg.id;

  // 头像：AI 用 character.avatar；用户用默认 smile icon
  const avatarHTML = isUser ? renderUserAvatar() : renderCharacterAvatar(state.currentCharacter);
  // 昵称：1对1会话不显示，多角色/群聊才显示
  const nicknameHTML = (!isUser && !isOneOnOne && state.currentCharacter?.name)
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
      ${thinkingHTML}
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
  // 思维链折叠/展开
  if (showThinking) bindThinkingToggle(el);
  // 长按操作（TTS 已改为长按菜单，不再常驻按钮）
  attachLongPress(el, () => openMessageActionSheet(msg));
  return el;
}

/** 判断是否为 1对1 会话（非群聊）。当前所有会话都是单角色，未来扩展时改这里 */
function isOneOnOneSession(session) {
  if (!session) return true;
  // 群聊字段（未来支持）：isGroup=true 或 participants.length > 1
  if (session.isGroup) return false;
  if (Array.isArray(session.participants) && session.participants.length > 1) return false;
  return true;
}

/** 渲染思维链区域 HTML（默认折叠） */
function renderThinkingHTML(thinking, opts = {}) {
  const streaming = opts.streaming;
  const collapsed = streaming ? 'false' : 'true';
  const streamAttr = streaming !== undefined ? `data-streaming="${streaming ? 'true' : 'false'}"` : '';
  return `
    <div class="chat-thinking" data-collapsed="${collapsed}" ${streamAttr}>
      <div class="chat-thinking-header">
        <span class="chat-thinking-arrow">${createIcon('chevron-down', 14).outerHTML}</span>
        <span class="chat-thinking-label">TA 想了想...</span>
      </div>
      <div class="chat-thinking-body">${renderMarkdown(thinking)}</div>
    </div>
  `;
}

/** 绑定思维链 header 点击折叠/展开 */
function bindThinkingToggle(el) {
  const thinkEl = el.querySelector('.chat-thinking');
  if (!thinkEl) return;
  const header = thinkEl.querySelector('.chat-thinking-header');
  if (!header) return;
  header.addEventListener('click', (e) => {
    e.stopPropagation();
    thinkingUserToggled.add(thinkEl);
    const collapsed = thinkEl.dataset.collapsed === 'true';
    thinkEl.dataset.collapsed = collapsed ? 'false' : 'true';
  });
}

/**
 * 实时更新思维链区域（流式中由 sending.js 调用）。
 * - 区域不存在则创建并插入到 bubble 之前
 * - 实时追加 thinking 文本（markdown 渲染）
 * - 流式中保持展开；流式结束后折叠（除非用户手动展开过）
 * @param {HTMLElement} msgEl 消息行元素
 * @param {string} thinkingText 思维链全文
 * @param {object} [opts] { streaming?: boolean }
 */
export function updateThinkingUI(msgEl, thinkingText, opts = {}) {
  if (!msgEl || !msgEl.isConnected) return;
  let thinkEl = msgEl.querySelector('.chat-thinking');
  const bubbleEl = msgEl.querySelector('.chat-bubble');
  if (!thinkingText || !thinkingText.trim()) {
    if (thinkEl) thinkEl.remove();
    return;
  }
  if (!thinkEl) {
    // 创建思维链区域
    const wrapper = document.createElement('div');
    wrapper.innerHTML = renderThinkingHTML(thinkingText, { streaming: opts.streaming });
    thinkEl = wrapper.firstElementChild;
    if (!thinkEl) return;
    // 绑定点击折叠/展开
    const header = thinkEl.querySelector('.chat-thinking-header');
    if (header) {
      header.addEventListener('click', (e) => {
        e.stopPropagation();
        thinkingUserToggled.add(thinkEl);
        const collapsed = thinkEl.dataset.collapsed === 'true';
        thinkEl.dataset.collapsed = collapsed ? 'false' : 'true';
      });
    }
    // 插入到 bubble 之前（气泡模式在 chat-msg-main 内；对话模式在 chat-dialog-card 内）
    if (bubbleEl && bubbleEl.parentNode) {
      bubbleEl.parentNode.insertBefore(thinkEl, bubbleEl);
    } else {
      msgEl.appendChild(thinkEl);
    }
  } else {
    // 更新内容
    const body = thinkEl.querySelector('.chat-thinking-body');
    if (body) body.innerHTML = renderMarkdown(thinkingText);
  }
  // 流式状态：流式中展开（让主人看到思考过程），结束后折叠（除非用户手动操作过）
  if (opts.streaming !== undefined) {
    thinkEl.dataset.streaming = opts.streaming ? 'true' : 'false';
    if (!thinkingUserToggled.has(thinkEl)) {
      thinkEl.dataset.collapsed = opts.streaming ? 'false' : 'true';
    }
  }
}

/** 刷新当前详情页里所有 AI 头像（avatar:updated 事件触发） */
export function refreshAvatar() {
  const state = getState();
  if (!state.containerEl || !state.currentCharacter) return;
  const newAvatarHTML = renderCharacterAvatar(state.currentCharacter);
  // 更新消息列表里所有 AI 头像
  const avatars = state.containerEl.querySelectorAll('.chat-msg-row.ai .chat-avatar, .chat-dialog-card-avatar');
  avatars.forEach((avEl) => {
    // 跳过用户头像（chat-dialog-user-avatar）
    if (avEl.classList.contains('chat-dialog-user-avatar')) return;
    avEl.innerHTML = newAvatarHTML;
  });
  // 更新顶部 header 头像（如有）
  const headerAv = state.containerEl.querySelector('#chat-header-avatar');
  if (headerAv) headerAv.innerHTML = newAvatarHTML;
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
// TTS：常驻按钮已移除，"念给我听"改为长按菜单项（见 message-actions.js）。
// 这里只保留 stopChatTTS 供 unmount 时停掉正在念的。
// ════════════════════════════════════════

/** 离开聊天详情页时调一下，把正在念的停掉 */
export function stopChatTTS() {
  try { stopAllTTS(); } catch (e) {}
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

