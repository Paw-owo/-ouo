// apps/chat/group/group-detail-view.js
// 群聊详情页渲染——header + 消息列表（带发言人头像/昵称）+ 输入区。
// 复用 detail-view.js 的部分能力（scrollToBottom / 思维链 UI 思路），
// 但消息渲染独立：每条消息带 senderName / senderAvatar / senderId。
// 消息读 STORES.groupMessages（按 groupId 过滤）。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js
// 状态由 index.js 持有（state.view='group'）。
// 全中文注释；不省 token；功能不阉割。

import { KEYS, STORES } from '../../../core/storage-keys.js';
import { getData, getDB, setDB, getAllDB } from '../../../core/storage.js';
import { showToast, showBottomSheet, createIcon, registerIcon } from '../../../core/ui.js';
import { formatTime, formatRelative, clamp, throttle, isUsableImage, cssUrl, injectStyle } from '../../../core/util.js';
import { getState, backToSessionList } from '../index.js';
import { renderMarkdown } from '../markdown.js';
import { enhanceCodeBlocks } from '../code-block.js';
import { escapeHTML, escapeAttr, attachLongPress } from '../shared-utils.js';
import { applySessionWallpaper } from '../wallpaper.js';
import { stopAllTTS } from '../../../core/tts.js';
import {
  sendGroupMessage, sendGroupImageMessage, sendGroupRichMessage,
  retrySendGroupMessage, cancelGroupStreaming
} from './group-sending.js';
import { openGroupSettings } from './group-settings-view.js';
import { openGroupMembersSheet } from './group-members.js';
import { openGroupPlusMenu } from './group-plus-menu.js';

// 注册群聊用到的图标
registerIcon('alert', 'M12 3v10 M12 17h.01');
registerIcon('arrow-up', 'M12 19V5 M5 12l7-7 7 7');
registerIcon('arrow-down', 'M12 5v14 M19 12l-7 7-7-7');
registerIcon('file', 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8');
registerIcon('location', 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z');
registerIcon('contact', 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75');
registerIcon('forward', 'M15 17l5-5-5-5 M4 18v-2a4 4 0 0 1 4-4h12');
registerIcon('voice-play', 'M5 3l14 9-14 9V3z');

// 注入群聊页样式
injectStyle('app-chat-group-detail', `
  .group-header-info{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:0}
  .group-header-name{font-size:var(--font-size-base);font-weight:600;color:var(--text-primary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .group-header-status{font-size:var(--font-size-small);color:var(--text-hint);display:flex;align-items:center;gap:4px}
  .group-header-members{display:flex;align-items:center}
  .group-header-members .ghm-avatars{display:flex}
  .group-header-members .ghm-avatar{width:18px;height:18px;border-radius:50%;background-size:cover;background-position:center;border:1.5px solid var(--bg-card);margin-left:-6px}
  .group-header-members .ghm-avatar:first-child{margin-left:0}
  .group-header-members .ghm-count{font-size:var(--font-size-small);color:var(--text-hint);margin-left:6px}

  /* 群聊消息行：带头像 + 发言人昵称 */
  .chat-msg-row .chat-group-sender{font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:2px;padding:0 4px}
  .chat-msg-row.user .chat-group-sender{display:none}
  /* 群聊昵称颜色：按 senderId 哈希上色，让多角色群聊一眼能区分 */
  .chat-msg-row.ai .chat-group-sender{color:var(--sender-color, var(--text-hint));font-weight:500}

  /* 群聊打字提示：带发言人头像 */
  .chat-typing-group{display:flex;align-items:center;gap:8px;padding:4px 8px}
  .chat-typing-group-avatar{width:28px;height:28px;border-radius:50%;background-size:cover;background-position:center;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--text-hint)}
  .chat-typing-group-body{display:flex;align-items:center;gap:4px;background:var(--bg-card);padding:8px 12px;border-radius:var(--radius-md);box-shadow:var(--shadow-sm)}
  .chat-typing-group-name{font-size:var(--font-size-small);color:var(--text-hint);margin-right:4px}

  /* 群系统消息（入群/退群等） */
  .chat-group-sys{align-self:center;text-align:center;padding:4px 12px;background:color-mix(in srgb,var(--text-hint) 12%,transparent);border-radius:var(--radius-sm);font-size:var(--font-size-small);color:var(--text-hint);margin:8px 0;max-width:80%}

  /* 名片气泡 */
  .chat-contact-card{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius-sm);background:color-mix(in srgb,var(--bg-secondary) 60%,transparent);border:1px solid color-mix(in srgb,var(--text-hint) 14%,transparent);cursor:pointer;transition:var(--motion);min-width:200px}
  .chat-contact-card:active{transform:scale(var(--press-scale))}
  .chat-contact-avatar{width:40px;height:40px;border-radius:50%;background-size:cover;background-position:center;background-color:color-mix(in srgb,var(--text-hint) 18%,transparent);display:flex;align-items:center;justify-content:center;color:var(--text-hint);flex-shrink:0;overflow:hidden}
  .chat-contact-info{flex:1;min-width:0}
  .chat-contact-name{font-size:var(--font-size-base);color:var(--text-primary);font-weight:500}
  .chat-contact-desc{font-size:var(--font-size-small);color:var(--text-hint);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

  /* 位置气泡 */
  .chat-location-card{padding:10px 12px;border-radius:var(--radius-sm);background:color-mix(in srgb,var(--accent) 8%,var(--bg-card));border:1px solid color-mix(in srgb,var(--accent) 24%,transparent);cursor:pointer;min-width:200px}
  .chat-location-name{font-size:var(--font-size-base);color:var(--text-primary);font-weight:500;display:flex;align-items:center;gap:6px}
  .chat-location-addr{font-size:var(--font-size-small);color:var(--text-hint);margin-top:4px}
  .chat-location-coord{font-size:11px;color:var(--text-hint);margin-top:2px;font-family:var(--font-mono,ui-monospace,monospace)}

  /* 文件气泡 */
  .chat-file-card{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius-sm);background:color-mix(in srgb,var(--bg-secondary) 60%,transparent);border:1px solid color-mix(in srgb,var(--text-hint) 14%,transparent);cursor:pointer;transition:var(--motion);min-width:200px}
  .chat-file-card:active{transform:scale(var(--press-scale))}
  .chat-file-icon{width:40px;height:40px;border-radius:var(--radius-sm);background:color-mix(in srgb,var(--accent) 14%,transparent);display:flex;align-items:center;justify-content:center;color:var(--accent-dark);flex-shrink:0}
  .chat-file-info{flex:1;min-width:0}
  .chat-file-name{font-size:var(--font-size-base);color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .chat-file-meta{font-size:var(--font-size-small);color:var(--text-hint);margin-top:2px}
`);

// 思维链用户手动操作标记
const thinkingUserToggled = new WeakSet();

// ════════════════════════════════════════
// 群聊详情页渲染（主入口）
// ════════════════════════════════════════

export async function renderGroupDetailView() {
  const state = getState();
  const container = state.containerEl;
  const session = state.currentSession;
  if (!container || !session || !session.isGroup) {
    state.view = 'list';
    const { render } = await import('../index.js');
    await render();
    return;
  }

  const mode = getData(KEYS.chatMode, 'bubble');
  const groupName = session.title || '群聊';
  const memberCount = (session.participants || []).length;

  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="group-back" aria-label="返回会话列表">${createIcon('back', 20).outerHTML}</button>
      <div class="group-header-info">
        <div class="group-header-name" id="group-header-name">${escapeHTML(groupName)}</div>
        <div class="group-header-status">
          <span class="group-header-members" id="group-header-members"></span>
          <span id="group-header-count">${memberCount} 人</span>
        </div>
      </div>
      <button class="chat-header-search" id="group-header-members-btn" aria-label="群成员">${createIcon('users', 18).outerHTML}</button>
      <button class="app-header-gear" id="group-settings" aria-label="群聊设置">${createIcon('settings', 18).outerHTML}</button>
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
        <button class="chat-plus" id="chat-plus" aria-label="更多操作">${createIcon('plus', 20).outerHTML}</button>
        <textarea class="chat-input" id="chat-input" placeholder="说点什么吧... @名字 可以指定回复" rows="1" enterkeyhint="send" aria-label="输入消息"></textarea>
        <button class="chat-emoji-btn" id="chat-emoji-btn" aria-label="表情面板">${createIcon('smile', 20).outerHTML}</button>
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

  // 顶部成员头像组
  renderHeaderMembers(session);

  // 绑定事件
  container.querySelector('#group-back').addEventListener('click', backToSessionList);
  container.querySelector('#group-header-members-btn').addEventListener('click', () => {
    openGroupMembersSheet(session.groupId);
  });
  container.querySelector('#group-settings').addEventListener('click', () => {
    openGroupSettings(session.groupId);
  });
  container.querySelector('#chat-plus').addEventListener('click', openGroupPlusMenu);
  state.sendBtnEl.addEventListener('click', onGroupSendClick);
  state.inputEl.addEventListener('keydown', onGroupInputKeyDown);
  state.inputEl.addEventListener('input', onGroupInputChanged);
  container.querySelector('#chat-quote-close').addEventListener('click', () => clearGroupQuote());
  // 表情面板：复用 extras.js 的表情包面板（群聊也用用户收藏的表情包）
  container.querySelector('#chat-emoji-btn').addEventListener('click', async () => {
    try {
      const { toggleEmojiPanel } = await import('../extras.js');
      toggleEmojiPanel();
    } catch (e) {
      showToast('表情面板打不开呢', 'error');
    }
  });
  updateGroupSendButtonState();

  // 滚动监听
  state._onMessagesScroll = onGroupMessagesScroll;
  state.messageListEl.addEventListener('scroll', onGroupMessagesScroll);
  state.scrollBtnEl.addEventListener('click', () => {
    state.unseenNewCount = 0;
    updateScrollBtn();
    state.messageListEl.scrollTo({ top: state.messageListEl.scrollHeight, behavior: 'smooth' });
  });

  // 应用壁纸
  applySessionWallpaper();

  // 恢复草稿 + 引用
  if (session.draft) state.inputEl.value = session.draft;
  if (state.pendingQuote) showGroupQuotePreview(state.pendingQuote);
  autoResizeGroupInput();

  // 加载消息
  await loadAndRenderGroupMessages();
}

// 顶部成员头像组渲染
function renderHeaderMembers(session) {
  const el = getState().containerEl?.querySelector('#group-header-members');
  if (!el) return;
  const members = (session.participants || []).slice(0, 4);
  el.innerHTML = members.map((p) => {
    if (p.avatar && isUsableImage(p.avatar)) {
      return `<div class="ghm-avatar" style="background-image:${cssUrl(p.avatar)}"></div>`;
    }
    return `<div class="ghm-avatar" style="display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--text-hint) 18%,transparent);color:var(--text-hint)">${createIcon('smile', 12).outerHTML}</div>`;
  }).join('');
}

// ════════════════════════════════════════
// 消息加载 + 渲染
// ════════════════════════════════════════

const GROUP_PAGE_SIZE = 50;

async function loadAndRenderGroupMessages() {
  const state = getState();
  if (!state.messageListEl) return;
  const session = state.currentSession;
  if (!session) return;

  let messages = [];
  try {
    const all = await getAllDB(STORES.groupMessages);
    messages = all.filter((m) => m.groupId === session.groupId);
  } catch (e) {
    console.warn('[group] 读取群消息失败', e);
    showToast('群消息读不出来嘛', 'error');
  }
  messages.sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt));

  state.allMessages = messages;
  state.allMessagesLoaded = messages.length <= GROUP_PAGE_SIZE;
  state.visibleCount = Math.min(messages.length, GROUP_PAGE_SIZE);

  state.messageListEl.innerHTML = '';
  if (state.loadMoreEl) state.messageListEl.appendChild(state.loadMoreEl);
  updateLoadMoreIndicator();

  if (messages.length === 0) {
    renderGroupEmptyState();
    updateGroupChatHeader(null);
    return;
  }
  renderVisibleGroupMessages();
  updateGroupChatHeader(messages[messages.length - 1].timestamp);
  scrollToBottom();
}

function renderGroupEmptyState() {
  const state = getState();
  const session = state.currentSession;
  const names = (session?.participants || []).map((p) => p.name).join('、');
  const el = document.createElement('div');
  el.className = 'chat-empty';
  el.innerHTML = `
    <div class="chat-empty-icon">${createIcon('users', 48).outerHTML}</div>
    <div class="chat-empty-text">群里还没人说话呢，${escapeHTML(names)} 都在等你开个头呀</div>
  `;
  state.messageListEl.appendChild(el);
}

function renderVisibleGroupMessages() {
  const state = getState();
  const messages = state.allMessages || [];
  const visible = messages.slice(Math.max(0, messages.length - (state.visibleCount || GROUP_PAGE_SIZE)));
  let lastTime = 0;
  for (const m of visible) {
    const ts = new Date(m.timestamp || m.createdAt || 0).getTime();
    if (ts - lastTime > 5 * 60 * 1000) {
      appendTimeDivider(ts);
      lastTime = ts;
    }
    appendGroupMessageEl(m);
  }
}

function appendTimeDivider(ts) {
  const state = getState();
  if (!state.messageListEl) return;
  const el = document.createElement('div');
  el.className = 'chat-time-divider';
  el.textContent = formatRelative(ts);
  state.messageListEl.appendChild(el);
}

function updateLoadMoreIndicator() {
  const state = getState();
  if (!state.loadMoreEl) return;
  state.loadMoreEl.style.display = state.allMessagesLoaded ? 'none' : 'none';
}

// ════════════════════════════════════════
// 单条消息渲染
// ════════════════════════════════════════

export function appendGroupMessageEl(msg, opts = {}) {
  const state = getState();
  if (!state.messageListEl) return null;
  const empty = state.messageListEl.querySelector('.chat-empty');
  if (empty) empty.remove();
  const el = createGroupMessageEl(msg, opts);
  state.messageListEl.appendChild(el);
  if (!opts.stream && msg.role === 'assistant') {
    if (!isNearBottom()) {
      state.unseenNewCount = (state.unseenNewCount || 0) + 1;
      updateScrollBtn(true);
    }
  }
  return el;
}

function createGroupMessageEl(msg, opts = {}) {
  const state = getState();
  const mode = getData(KEYS.chatMode, 'bubble');
  const isUser = msg.role === 'user';
  const isImage = msg.type === 'image';
  const isVoice = msg.type === 'voice' || msg.type === 'audio';
  const isFile = msg.type === 'file';
  const isLocation = msg.type === 'location';
  const isContact = msg.type === 'contact';

  // 撤回占位
  if (msg.recalled) {
    const el = document.createElement('div');
    el.className = 'chat-recalled-hint';
    el.textContent = isUser ? '你撤回了一条消息' : `${msg.senderName || '对方'}撤回了一条消息`;
    return el;
  }

  // 系统消息（入群/退群等）
  if (msg.type === 'system') {
    const el = document.createElement('div');
    el.className = 'chat-group-sys';
    el.textContent = msg.content || '';
    return el;
  }

  const showThinking = !isUser && !opts.stream && !!(msg.thinking && msg.thinking.trim());
  const thinkingHTML = showThinking ? renderThinkingHTML(msg.thinking, { streaming: false }) : '';

  const el = document.createElement('div');

  // 发言人头像 + 昵称
  const senderName = msg.senderName || (isUser ? '我' : '未知');
  const senderAvatar = msg.senderAvatar || '';
  const senderColor = senderColorOf(msg.senderId || senderName);

  if (mode === 'dialog') {
    el.className = `chat-msg-row dialog ${isUser ? 'user' : 'ai'}`;
    el.dataset.id = msg.id;
    el.style.setProperty('--sender-color', senderColor);
    const time = formatTime(msg.timestamp || msg.createdAt);
    const quoteHTML = renderGroupQuoteHTML(msg);
    let inner;
    if (isImage) {
      const safeUrl = String(msg.mediaUrl || '').replace(/"/g, '&quot;');
      inner = `<img class="chat-image" src="${safeUrl}" alt="图片" loading="lazy">`;
    } else if (isVoice) {
      inner = renderGroupAudioHTML(msg);
    } else if (isFile) {
      inner = renderFileHTML(msg);
    } else if (isLocation) {
      inner = renderLocationHTML(msg);
    } else if (isContact) {
      inner = renderContactHTML(msg);
    } else if (opts.stream) {
      inner = '';
    } else if (isUser) {
      inner = escapeHTML(msg.content || '');
    } else {
      inner = renderMarkdown(msg.content || '');
    }
    const forwardedTag = msg.forwarded
      ? `<div class="chat-forwarded-tag">${createIcon('forward', 14).outerHTML}<span>转发消息</span></div>`
      : '';
    if (isUser) {
      el.innerHTML = `
        <div class="chat-dialog-user">
          ${forwardedTag}
          <div class="chat-bubble">${quoteHTML}${inner}</div>
          <div class="chat-dialog-user-meta">
            <span class="chat-dialog-user-time">${escapeHTML(time)}</span>
            <span class="chat-dialog-user-name">${escapeHTML(senderName)}</span>
          </div>
          <div class="chat-dialog-card-avatar chat-dialog-user-avatar">${renderSenderAvatar(msg, isUser)}</div>
        </div>
      `;
    } else {
      el.innerHTML = `
        <div class="chat-dialog-card">
          <div class="chat-dialog-card-header">
            <div class="chat-dialog-card-avatar">${renderSenderAvatar(msg, isUser)}</div>
            <div class="chat-dialog-card-name" style="color:${senderColor}">${escapeHTML(senderName)}</div>
            <div class="chat-dialog-card-time">${escapeHTML(time)}</div>
          </div>
          ${thinkingHTML}
          <div class="chat-bubble chat-dialog-card-body">${quoteHTML}${inner}</div>
        </div>
      `;
    }
    if (showThinking) bindThinkingToggle(el);
    bindGroupInteractiveControls(el, msg);
    attachLongPress(el, () => openGroupMessageActionSheet(msg));
    return el;
  }

  // 气泡模式
  el.className = `chat-msg-row ${isUser ? 'user' : 'ai'}`;
  el.dataset.id = msg.id;
  el.style.setProperty('--sender-color', senderColor);

  const avatarHTML = renderSenderAvatar(msg, isUser);
  const senderLabel = (!isUser) ? `<div class="chat-group-sender">${escapeHTML(senderName)}</div>` : '';
  const content = opts.stream ? '' : (msg.content || '');
  const forwardedTag = msg.forwarded
    ? `<div class="chat-forwarded-tag">${createIcon('forward', 14).outerHTML}<span>转发消息</span></div>`
    : '';
  let bubbleInner = '';
  bubbleInner += renderGroupQuoteHTML(msg);
  if (isImage) {
    const safeUrl = String(msg.mediaUrl || '').replace(/"/g, '&quot;');
    bubbleInner += `<img class="chat-image" src="${safeUrl}" alt="图片" loading="lazy">`;
    if (content) bubbleInner += isUser ? escapeHTML(content) : renderMarkdown(content);
  } else if (isVoice) {
    bubbleInner += renderGroupAudioHTML(msg);
  } else if (isFile) {
    bubbleInner += renderFileHTML(msg);
  } else if (isLocation) {
    bubbleInner += renderLocationHTML(msg);
  } else if (isContact) {
    bubbleInner += renderContactHTML(msg);
  } else if (opts.stream) {
    bubbleInner += '';
  } else {
    bubbleInner += isUser ? escapeHTML(content) : renderMarkdown(content);
  }
  const statusHTML = renderGroupStatusIndicator(msg);
  el.innerHTML = `
    <div class="chat-avatar">${avatarHTML}</div>
    <div class="chat-msg-body">
      ${senderLabel}
      ${forwardedTag}
      <div class="chat-bubble">${bubbleInner}</div>
      <div class="chat-meta">${statusHTML}</div>
    </div>
  `;
  if (showThinking) {
    const thinkEl = document.createElement('div');
    thinkEl.innerHTML = thinkingHTML;
    el.querySelector('.chat-msg-body').insertBefore(thinkEl.firstChild, el.querySelector('.chat-bubble'));
    bindThinkingToggle(el);
  }
  bindGroupInteractiveControls(el, msg);
  // 代码块增强（复制 / 下载 / 预览 / 折叠）—— 仅 AI 成员的消息可能有代码块
  if (!isUser) enhanceCodeBlocks(el);
  attachLongPress(el, () => openGroupMessageActionSheet(msg));
  return el;
}

// 发言人头像渲染
function renderSenderAvatar(msg, isUser) {
  if (isUser) {
    // 用户头像：暂时用 smile icon
    return `<div class="chat-avatar-fallback">${createIcon('smile', 24).outerHTML}</div>`;
  }
  const av = msg.senderAvatar;
  if (av && isUsableImage(av)) {
    return `<div class="chat-list-avatar-img" style="background-image:${cssUrl(av)}"></div>`;
  }
  return `<div class="chat-avatar-fallback">${createIcon('smile', 24).outerHTML}</div>`;
}

// 发言人昵称颜色（按 id 哈希）
const SENDER_COLORS = [
  'var(--accent-dark)', '#e67e22', '#27ae60', '#2980b9',
  '#8e44ad', '#c0392b', '#16a085', '#d35400'
];
function senderColorOf(id) {
  if (!id) return 'var(--text-hint)';
  let h = 0;
  for (let i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) | 0;
  return SENDER_COLORS[Math.abs(h) % SENDER_COLORS.length];
}

// 引用卡片
function renderGroupQuoteHTML(msg) {
  if (!msg.quote) return '';
  const text = String(msg.quote);
  if (msg.quoteId) {
    const sender = msg.quoteSender || '原文';
    const preview = text.length > 60 ? text.slice(0, 60) + '...' : text;
    return `<div class="chat-quote-clickable" data-quote-id="${escapeAttr(msg.quoteId)}" role="button" tabindex="0" aria-label="点击查看原消息">
      <div class="chat-quote-sender">${escapeHTML(sender)}</div>
      <div class="chat-quote-preview-text">${escapeHTML(preview)}</div>
    </div>`;
  }
  return `<div class="chat-quote">引用：${escapeHTML(text)}</div>`;
}

// 语音消息 HTML
function renderGroupAudioHTML(msg) {
  const url = String(msg.mediaUrl || '');
  const duration = Math.max(0, Number(msg.duration || 0));
  const m = Math.floor(duration / 60);
  const s = duration % 60;
  const durStr = `${m}:${String(s).padStart(2, '0')}`;
  const bars = Math.min(28, Math.max(8, Math.round(duration / 0.4) + 8));
  const waveParts = [];
  for (let i = 0; i < bars; i++) {
    const h = 40 + Math.round(Math.sin(i * 1.3 + duration * 0.7) * 35);
    waveParts.push(`<span style="height:${clamp(h, 20, 100)}%"></span>`);
  }
  return `<div class="chat-audio" data-url="${escapeAttr(url)}" data-duration="${duration}">
    <button class="chat-audio-play" type="button" aria-label="播放语音">${createIcon('voice-play', 18).outerHTML}</button>
    <div class="chat-audio-wave">${waveParts.join('')}</div>
    <span class="chat-audio-duration">${durStr}</span>
  </div>`;
}

// 文件消息 HTML
function renderFileHTML(msg) {
  const name = escapeHTML(msg.fileName || msg.content || '文件');
  const size = msg.fileSize ? formatFileSize(msg.fileSize) : '';
  const url = escapeAttr(msg.mediaUrl || '');
  return `<div class="chat-file-card" data-url="${url}" role="button" tabindex="0" aria-label="下载文件">
    <div class="chat-file-icon">${createIcon('file', 22).outerHTML}</div>
    <div class="chat-file-info">
      <div class="chat-file-name">${name}</div>
      <div class="chat-file-meta">${size} · 点击下载</div>
    </div>
  </div>`;
}

// 位置消息 HTML
function renderLocationHTML(msg) {
  const name = escapeHTML(msg.locationName || msg.content || '我的位置');
  const addr = escapeHTML(msg.locationAddr || '');
  const lat = msg.lat || 0;
  const lng = msg.lng || 0;
  return `<div class="chat-location-card" data-lat="${escapeAttr(lat)}" data-lng="${escapeAttr(lng)}" data-name="${escapeAttr(msg.locationName || '')}" role="button" tabindex="0" aria-label="查看位置">
    <div class="chat-location-name">${createIcon('location', 16).outerHTML}<span>${name}</span></div>
    ${addr ? `<div class="chat-location-addr">${addr}</div>` : ''}
    <div class="chat-location-coord">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
  </div>`;
}

// 名片消息 HTML
function renderContactHTML(msg) {
  const name = escapeHTML(msg.contactName || '名片');
  const desc = escapeHTML(msg.contactDesc || '点击查看资料');
  const avatar = msg.contactAvatar;
  const avatarHTML = (avatar && isUsableImage(avatar))
    ? `<div class="chat-contact-avatar" style="background-image:${cssUrl(avatar)}"></div>`
    : `<div class="chat-contact-avatar">${createIcon('smile', 22).outerHTML}</div>`;
  return `<div class="chat-contact-card" data-contact-id="${escapeAttr(msg.contactId || '')}" role="button" tabindex="0" aria-label="查看名片">
    ${avatarHTML}
    <div class="chat-contact-info">
      <div class="chat-contact-name">${name}</div>
      <div class="chat-contact-desc">${desc}</div>
    </div>
  </div>`;
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
}

// 状态指示器
function renderGroupStatusIndicator(msg) {
  const status = msg.status || 'sent';
  const time = formatTime(msg.timestamp || msg.createdAt);
  if (status === 'sending') {
    return `<span class="chat-status-sending"></span><span class="chat-status-time">${escapeHTML(time)}</span>`;
  }
  if (status === 'failed') {
    return `<span class="chat-status-failed" role="button" aria-label="发送失败，点击重试">${createIcon('alert', 14).outerHTML}</span><span class="chat-status-time">${escapeHTML(time)}</span>`;
  }
  return `<span class="chat-status-time">${escapeHTML(time)}</span>`;
}

// 思维链 HTML（复用单聊样式）
function renderThinkingHTML(text, opts = {}) {
  const streaming = opts.streaming ? 'true' : 'false';
  const collapsed = opts.streaming ? 'false' : 'true';
  return `<div class="chat-thinking" data-collapsed="${collapsed}" data-streaming="${streaming}">
    <div class="chat-thinking-header">
      <span class="chat-thinking-arrow">${createIcon('chevron-down', 14).outerHTML}</span>
      <span class="chat-thinking-label">想一想中...</span>
    </div>
    <div class="chat-thinking-body">${escapeHTML(text)}</div>
  </div>`;
}

function bindThinkingToggle(el) {
  const header = el.querySelector('.chat-thinking-header');
  if (!header) return;
  header.addEventListener('click', (e) => {
    e.stopPropagation();
    const card = header.closest('.chat-thinking');
    if (!card) return;
    thinkingUserToggled.add(card);
    const cur = card.dataset.collapsed === 'true';
    card.dataset.collapsed = cur ? 'false' : 'true';
  });
}

// 交互控件绑定（引用卡片 / 文件下载 / 位置查看 / 名片查看 / 语音播放）
function bindGroupInteractiveControls(el, msg) {
  const quoteEl = el.querySelector('.chat-quote-clickable');
  if (quoteEl) {
    quoteEl.addEventListener('click', (e) => {
      e.stopPropagation();
      const qid = quoteEl.dataset.quoteId;
      if (qid) scrollGroupToMessageAndHighlight(qid);
    });
  }
  const fileCard = el.querySelector('.chat-file-card');
  if (fileCard) {
    fileCard.addEventListener('click', async (e) => {
      e.stopPropagation();
      const url = fileCard.dataset.url;
      if (!url) return;
      try {
        const { downloadBlob } = await import('../../core/util.js');
        const a = document.createElement('a');
        a.href = url;
        a.download = msg.fileName || 'file';
        a.click();
      } catch (e) { showToast('下载不了呢', 'error'); }
    });
  }
  const locCard = el.querySelector('.chat-location-card');
  if (locCard) {
    locCard.addEventListener('click', (e) => {
      e.stopPropagation();
      const lat = parseFloat(locCard.dataset.lat);
      const lng = parseFloat(locCard.dataset.lng);
      if (isNaN(lat) || isNaN(lng)) return;
      // 优先用系统地图 App，兜底用网页地图
      const url = `https://www.google.com/maps?q=${lat},${lng}`;
      window.open(url, '_blank');
    });
  }
  const contactCard = el.querySelector('.chat-contact-card');
  if (contactCard) {
    contactCard.addEventListener('click', async (e) => {
      e.stopPropagation();
      const cid = contactCard.dataset.contactId;
      if (!cid) return;
      try {
        const { openApp } = await import('../../core/router.js');
        openApp('characters', { characterId: cid });
      } catch (e) { showToast('打开不了名片呢', 'error'); }
    });
  }
  const audio = el.querySelector('.chat-audio');
  if (audio) {
    const playBtn = audio.querySelector('.chat-audio-play');
    if (playBtn) {
      playBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const url = audio.dataset.url;
        if (!url) return;
        try {
          const { playVoice } = await import('../../core/tts.js');
          playVoice(url);
        } catch (e) { showToast('语音播放不了呢', 'error'); }
      });
    }
  }
}

function scrollGroupToMessageAndHighlight(msgId) {
  const state = getState();
  if (!state.messageListEl) return;
  const target = state.messageListEl.querySelector(`.chat-msg-row[data-id="${cssEscape(msgId)}"]`);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('chat-highlight');
  setTimeout(() => target.classList.remove('chat-highlight'), 1600);
}

function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, '\\$&');
}

// 消息操作菜单（长按）
function openGroupMessageActionSheet(msg) {
  // 复用单聊的消息操作面板
  import('../message-actions.js').then(({ openMessageActionSheet }) => {
    // 群聊消息也走同一个面板，但传 group 标记
    openMessageActionSheet(msg, { group: true });
  }).catch(() => showToast('操作菜单打不开呢', 'error'));
}

// ════════════════════════════════════════
// 打字提示 / 滚动 / 状态更新
// ════════════════════════════════════════

export function showGroupTypingIndicator(replier) {
  const state = getState();
  if (!state.messageListEl) return;
  hideGroupTypingIndicator();
  const el = document.createElement('div');
  el.className = 'chat-typing chat-typing-group';
  el.setAttribute('aria-label', `${replier?.name || '对方'}正在打字`);
  const avatarHTML = (replier?.avatar && isUsableImage(replier.avatar))
    ? `<div class="chat-typing-group-avatar" style="background-image:${cssUrl(replier.avatar)}"></div>`
    : `<div class="chat-typing-group-avatar">${createIcon('smile', 16).outerHTML}</div>`;
  el.innerHTML = `
    ${avatarHTML}
    <div class="chat-typing-group-body">
      <span class="chat-typing-group-name">${escapeHTML(replier?.name || '')}</span>
      <div class="chat-typing-dot"></div>
      <div class="chat-typing-dot"></div>
      <div class="chat-typing-dot"></div>
    </div>
  `;
  state.messageListEl.appendChild(el);
  state.typingIndicatorEl = el;
  scrollToBottom();
}

export function hideGroupTypingIndicator() {
  const state = getState();
  if (state.typingIndicatorEl && state.typingIndicatorEl.parentNode) {
    state.typingIndicatorEl.parentNode.removeChild(state.typingIndicatorEl);
  }
  state.typingIndicatorEl = null;
}

export function scrollToBottom() {
  const state = getState();
  if (!state.messageListEl) return;
  state.messageListEl.scrollTop = state.messageListEl.scrollHeight;
}

export function isNearBottom() {
  const state = getState();
  if (!state.messageListEl) return true;
  const el = state.messageListEl;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
}

function onGroupMessagesScroll() {
  const state = getState();
  if (!state.messageListEl) return;
  updateScrollBtn();
  // 滚到顶部加载更多
  if (state.messageListEl.scrollTop < 40 && !state.allMessagesLoaded) {
    loadMoreGroupMessages();
  }
}

function loadMoreGroupMessages() {
  const state = getState();
  if (!state.messageListEl || state.allMessagesLoaded) return;
  const messages = state.allMessages || [];
  const nextCount = Math.min(messages.length, (state.visibleCount || 0) + GROUP_PAGE_SIZE);
  if (nextCount === state.visibleCount) {
    state.allMessagesLoaded = true;
    return;
  }
  // 记录滚动前高度，加载后保持视觉位置
  const prevHeight = state.messageListEl.scrollHeight;
  state.visibleCount = nextCount;
  state.allMessagesLoaded = messages.length <= nextCount;
  // 重渲染
  const curScroll = state.messageListEl.scrollTop;
  state.messageListEl.innerHTML = '';
  if (state.loadMoreEl) state.messageListEl.appendChild(state.loadMoreEl);
  renderVisibleGroupMessages();
  // 保持视觉位置：滚动到 (新高度 - 旧高度 + 旧 scrollTop)
  requestAnimationFrame(() => {
    const newHeight = state.messageListEl.scrollHeight;
    state.messageListEl.scrollTop = newHeight - prevHeight + curScroll;
  });
}

function updateScrollBtn(hasNew) {
  const state = getState();
  if (!state.scrollBtnEl) return;
  const show = !isNearBottom();
  state.scrollBtnEl.classList.toggle('show', show);
  const badge = state.scrollBtnEl.querySelector('.chat-scroll-badge');
  if (hasNew && (state.unseenNewCount || 0) > 0) {
    if (!badge) {
      const b = document.createElement('span');
      b.className = 'chat-scroll-badge';
      b.textContent = state.unseenNewCount > 99 ? '99+' : state.unseenNewCount;
      state.scrollBtnEl.appendChild(b);
    } else {
      badge.textContent = state.unseenNewCount > 99 ? '99+' : state.unseenNewCount;
    }
  } else if (!show) {
    state.unseenNewCount = 0;
    if (badge) badge.remove();
  }
}

export function updateGroupChatHeader(lastMsgTime) {
  const state = getState();
  if (!state.containerEl) return;
  if (lastMsgTime) {
    const el = state.containerEl.querySelector('#group-header-count');
    if (el) {
      const session = state.currentSession;
      const count = (session?.participants || []).length;
      el.textContent = `${count} 人 · ${formatRelative(lastMsgTime)}`;
    }
  }
}

export function updateGroupMessageStatus(msgId, status, msg) {
  const state = getState();
  if (!state.messageListEl) return;
  const row = state.messageListEl.querySelector(`.chat-msg-row[data-id="${cssEscape(msgId)}"]`);
  if (!row) return;
  const metaEl = row.querySelector('.chat-meta');
  if (!metaEl) return;
  metaEl.innerHTML = renderGroupStatusIndicator({ status, timestamp: msg?.timestamp || Date.now() });
  if (status === 'failed') {
    const failEl = metaEl.querySelector('.chat-status-failed');
    if (failEl) {
      failEl.addEventListener('click', async () => {
        try {
          const cur = msg || (await getDB(STORES.groupMessages, msgId));
          if (cur) await retrySendGroupMessage(cur);
        } catch (e) { console.warn('[group] 重试读取失败', e); }
      });
    }
  }
}

export function updateGroupThinkingUI(msgEl, thinkingText, opts = {}) {
  if (!msgEl) return;
  let thinkEl = msgEl.querySelector('.chat-thinking');
  if (!thinkingText) return;
  if (!thinkEl) {
    thinkEl = document.createElement('div');
    thinkEl.innerHTML = renderThinkingHTML(thinkingText, { streaming: opts.streaming });
    const body = msgEl.querySelector('.chat-msg-body') || msgEl.querySelector('.chat-dialog-card') || msgEl;
    const bubble = msgEl.querySelector('.chat-bubble');
    if (bubble) body.insertBefore(thinkEl.firstChild, bubble);
    else body.appendChild(thinkEl.firstChild);
    thinkEl = msgEl.querySelector('.chat-thinking');
    bindThinkingToggle(msgEl);
  } else {
    const bodyEl = thinkEl.querySelector('.chat-thinking-body');
    if (bodyEl) {
      // 与单聊一致：思维链用 markdown 渲染，并增强代码块
      bodyEl.innerHTML = renderMarkdown(thinkingText);
      enhanceCodeBlocks(bodyEl);
    }
    thinkEl.dataset.streaming = opts.streaming ? 'true' : 'false';
  }
}

// ════════════════════════════════════════
// 输入框 / 引用 / 草稿
// ════════════════════════════════════════

export function autoResizeGroupInput() {
  const state = getState();
  if (!state.inputEl) return;
  state.inputEl.style.height = 'auto';
  state.inputEl.style.height = Math.min(120, state.inputEl.scrollHeight) + 'px';
}

export function updateGroupSendButtonState() {
  const state = getState();
  if (!state.sendBtnEl || !state.inputEl) return;
  const hasText = state.inputEl.value.trim().length > 0;
  if (state.isReplying) {
    state.sendBtnEl.classList.add('active');
  } else {
    state.sendBtnEl.classList.toggle('active', hasText);
  }
}

function onGroupInputChanged() {
  updateGroupSendButtonState();
  autoResizeGroupInput();
  // 草稿防抖
  const state = getState();
  if (state.saveDraftDebounced) state.saveDraftDebounced();
}

function onGroupInputKeyDown(e) {
  // 回车发送（shift+回车换行）；回复中回车会触发取消流式（onGroupSendClick 内部处理）
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    onGroupSendClick();
  }
}

function onGroupSendClick() {
  const state = getState();
  if (state.isReplying) {
    cancelGroupStreaming();
    return;
  }
  // 收起表情面板
  try {
    import('../extras.js').then(({ closeEmojiPanel }) => closeEmojiPanel());
  } catch (e) {}
  sendGroupMessage();
}

export function showGroupQuotePreview(quote) {
  const state = getState();
  const preview = state.containerEl?.querySelector('#chat-quote-preview');
  const textEl = state.containerEl?.querySelector('#chat-quote-preview-text');
  if (!preview || !textEl) return;
  const sender = quote.sender ? `${quote.sender}：` : '';
  const t = String(quote.text || '');
  textEl.textContent = sender + (t.length > 60 ? t.slice(0, 60) + '...' : t);
  preview.style.display = '';
}

export function clearGroupQuote() {
  const state = getState();
  state.pendingQuote = null;
  const preview = state.containerEl?.querySelector('#chat-quote-preview');
  if (preview) preview.style.display = 'none';
}

export function setGroupQuoteToInput(text, meta) {
  const state = getState();
  state.pendingQuote = { text: String(text || ''), id: meta?.id || null, sender: meta?.sender || null };
  showGroupQuotePreview(state.pendingQuote);
}

// 刷新群成员（群设置改了成员后调用）
export async function refreshGroupHeader() {
  const state = getState();
  if (!state.currentSession) return;
  try {
    const sess = await getDB(STORES.chatSessions, state.currentSession.id);
    if (sess) {
      state.currentSession = sess;
      renderHeaderMembers(sess);
      const nameEl = state.containerEl?.querySelector('#group-header-name');
      if (nameEl) nameEl.textContent = sess.title || '群聊';
      const countEl = state.containerEl?.querySelector('#group-header-count');
      if (countEl) countEl.textContent = `${(sess.participants || []).length} 人`;
    }
  } catch (e) {}
}
