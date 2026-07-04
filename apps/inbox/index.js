// apps/inbox/index.js
// 消息中心 App——软萌少女风格 PWA「泡泡」。
// 我把各 App 发生的小事都收拢到这里，主人一打开就能看到谁来找过她啦。
// 数据由 core/inbox.js 统一管理（存 localStorage KEYS.inboxMessages），这里只读不写。
//   消息字段 {id, app, type, title, body, read, t, createdAt}
// 依赖：core/inbox.js, core/ui.js, core/events.js, core/util.js, core/router.js, core/app-bg.js
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符；视觉值走 CSS 变量。

import {
  getInboxMessages, markInboxRead, markAllInboxRead,
  deleteInboxMessage, clearInbox, getUnreadCount
} from '../../core/inbox.js';
import { showToast, showConfirm, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { formatRelative, injectStyle } from '../../core/util.js';
import { openApp } from '../../core/router.js';
import { applyAppBg } from '../../core/app-bg.js';

// ════════════════════════════════════════
// 模块状态
// ════════════════════════════════════════

let containerEl = null;
// bus 监听的取消函数，unmount 时一定要清掉，不然会重复刷新
let disposeInboxNew = null;
let disposeInboxUpdated = null;

// app 标识 -> 图标名映射（全部走 ICON_PATHS 已注册的 SVG 线稿图标，禁止 emoji）
const APP_ICON_MAP = {
  chat: 'chat',
  moments: 'heart',
  wallet: 'wallet',
  shop: 'gift',
  grudge: 'bell',
  memo: 'memo',
  anniversary: 'calendar',
  games: 'games',
  music: 'music',
  memory: 'star',
  system: 'bell'
};

// app 标识 -> 中文小标签（给消息卡片右上角贴个来源小条）
const APP_LABEL_MAP = {
  chat: '聊天',
  moments: '朋友圈',
  wallet: '钱包',
  shop: '礼物',
  grudge: '记仇',
  memo: '备忘',
  anniversary: '纪念日',
  games: '游戏',
  music: '音乐',
  memory: '记忆',
  system: '系统'
};

// ════════════════════════════════════════
// 样式（全部走 CSS 变量，主题变了我也跟着变）
// ════════════════════════════════════════

injectStyle('app-inbox-style', `
  .inbox-unread-bar {
    display: flex; align-items: center; gap: 8px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
    border-radius: var(--radius-md);
    padding: 8px 14px; margin-bottom: 12px;
    color: var(--accent-dark); font-size: var(--font-size-small);
    transition: var(--motion);
  }
  .inbox-unread-bar:active { transform: scale(var(--press-scale)); }
  .inbox-unread-bar .popo-icon-svg { width: 16px; height: 16px; }
  .inbox-unread-bar-text { flex: 1; min-width: 0; font-weight: 600; }
  .inbox-unread-bar-btn {
    font-size: var(--font-size-small); color: var(--accent-dark);
    font-weight: 600; padding: 2px 8px; border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }
  .inbox-unread-bar-btn:active { transform: scale(var(--press-scale)); }

  .inbox-list { display: flex; flex-direction: column; gap: 10px; }

  .inbox-item {
    position: relative; display: flex; align-items: flex-start; gap: 12px;
    width: 100%; text-align: left;
    background: var(--bg-card); border-radius: var(--radius-card);
    padding: 14px 14px 14px 18px; box-shadow: var(--shadow-sm);
    border: 1px solid color-mix(in srgb, var(--text-hint) 10%, transparent);
    cursor: pointer; transition: var(--motion);
    overflow: hidden;
  }
  .inbox-item:active { transform: scale(var(--press-scale)); }
  .inbox-item.read { opacity: 0.62; }
  .inbox-item.unread { border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .inbox-dot {
    position: absolute; left: 7px; top: 50%; transform: translateY(-50%);
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--danger); flex-shrink: 0;
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--danger) 22%, transparent);
  }
  .inbox-item-icon {
    flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%;
    background: color-mix(in srgb, var(--accent-light) 55%, transparent);
    color: var(--accent-dark);
    display: flex; align-items: center; justify-content: center;
  }
  .inbox-item-icon .popo-icon-svg { width: 20px; height: 20px; }
  .inbox-item-main { flex: 1; min-width: 0; }
  .inbox-item-title-row {
    display: flex; align-items: center; gap: 8px; margin-bottom: 3px;
  }
  .inbox-item-title {
    flex: 1; min-width: 0;
    font-size: var(--font-size-base); font-weight: 600;
    color: var(--text-primary); line-height: 1.35;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .inbox-item-tag {
    flex-shrink: 0; font-size: var(--font-size-small);
    color: var(--text-hint);
    padding: 1px 7px; border-radius: 999px;
    background: color-mix(in srgb, var(--text-hint) 14%, transparent);
  }
  .inbox-item-body {
    font-size: var(--font-size-small); color: var(--text-secondary);
    line-height: 1.5; word-break: break-word;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .inbox-item-time {
    font-size: var(--font-size-small); color: var(--text-hint);
    margin-top: 6px;
  }

  .inbox-empty {
    text-align: center; padding: 56px 20px 40px;
    color: var(--text-hint);
  }
  .inbox-empty-icon {
    color: var(--accent); opacity: 0.55;
    display: flex; justify-content: center; margin-bottom: 12px;
  }
  .inbox-empty-icon .popo-icon-svg { width: 44px; height: 44px; }
  .inbox-empty-text {
    font-size: var(--font-size-base); color: var(--text-secondary);
    line-height: 1.6;
  }

  .inbox-footer {
    margin-top: 18px; padding-bottom: calc(env(safe-area-inset-bottom, 0px) + 12px);
    display: flex; justify-content: center;
  }
  .inbox-clear-all {
    font-size: var(--font-size-small); color: var(--text-hint);
    padding: 8px 18px; border-radius: 999px;
    background: color-mix(in srgb, var(--bg-secondary) 60%, transparent);
    border: 1px solid color-mix(in srgb, var(--text-hint) 16%, transparent);
    transition: var(--motion);
  }
  .inbox-clear-all:active { transform: scale(var(--press-scale)); }
  .inbox-clear-all.danger { color: var(--danger); border-color: color-mix(in srgb, var(--danger) 40%, transparent); }

  .inbox-header-action {
    font-size: var(--font-size-small); color: var(--accent-dark);
    font-weight: 600; padding: 4px 10px; border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    transition: var(--motion);
  }
  .inbox-header-action:active { transform: scale(var(--press-scale)); }
  .inbox-header-action:disabled {
    color: var(--text-hint); background: transparent;
    opacity: 0.5; cursor: default;
  }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="inbox-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">小消息</div>
      <button class="inbox-header-action" id="inbox-read-all" aria-label="全部已读">全部已读</button>
    </div>
    <div class="app-body" id="inbox-body">
      <div id="inbox-unread-wrap"></div>
      <div class="inbox-list" id="inbox-list"></div>
      <div class="inbox-footer" id="inbox-footer"></div>
    </div>
  `;
  container.querySelector('#inbox-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#inbox-read-all').addEventListener('click', handleMarkAllRead);
  // 监听新消息 + 状态变更，实时刷新列表。mount 时注册，unmount 时一定取消，避免重复。
  disposeInboxNew = bus.on('inbox:new', () => render());
  disposeInboxUpdated = bus.on('inbox:updated', () => render());
  await render();
  applyAppBg(container, 'inbox');
}

export function unmount() {
  // 取消 bus 监听，防止离开后还在重复刷新
  if (disposeInboxNew) { disposeInboxNew(); disposeInboxNew = null; }
  if (disposeInboxUpdated) { disposeInboxUpdated(); disposeInboxUpdated = null; }
  containerEl = null;
}

// ════════════════════════════════════════
// 列表渲染
// ════════════════════════════════════════

function render() {
  if (!containerEl) return;
  const bodyEl = containerEl.querySelector('#inbox-body');
  if (!bodyEl) return;

  const messages = getInboxMessages();
  // 按时间倒序（t 越大越新）。getInboxMessages 默认已是最新在前，这里再保险排一次。
  const sorted = messages.slice().sort((a, b) => (b.t || 0) - (a.t || 0));
  const unread = sorted.filter((m) => !m.read).length;

  // 顶部未读胶囊条
  renderUnreadBar(bodyEl, unread);
  // 全部已读按钮可用性
  const readAllBtn = bodyEl.querySelector('#inbox-read-all') || containerEl.querySelector('#inbox-read-all');
  if (readAllBtn) readAllBtn.disabled = unread === 0;

  // 列表
  const listEl = bodyEl.querySelector('#inbox-list');
  if (sorted.length === 0) {
    listEl.innerHTML = `
      <div class="inbox-empty">
        <div class="inbox-empty-icon">${createIcon('bell', 44).outerHTML}</div>
        <div class="inbox-empty-text">还没有消息嘛，各 App 发生的小事都会跑到这里来哦</div>
      </div>
    `;
  } else {
    listEl.innerHTML = sorted.map(renderItem).join('');
    listEl.querySelectorAll('.inbox-item').forEach((el) => {
      const id = el.dataset.id;
      const target = sorted.find((m) => m.id === id);
      if (!target) return;
      bindLongPress(el, () => confirmDelete(target));
      el.addEventListener('click', () => handleMessageClick(target));
    });
  }

  // 底部清空按钮
  renderFooter(bodyEl, sorted.length);
}

function renderUnreadBar(bodyEl, unread) {
  const wrap = bodyEl.querySelector('#inbox-unread-wrap');
  if (!wrap) return;
  if (unread <= 0) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = `
    <div class="inbox-unread-bar" id="inbox-unread-bar" role="button" tabindex="0" aria-label="全部已读">
      ${createIcon('bell', 16).outerHTML}
      <span class="inbox-unread-bar-text">有 ${unread} 条小消息还没看呢</span>
      <button class="inbox-unread-bar-btn" id="inbox-unread-bar-btn">全部已读</button>
    </div>
  `;
  const bar = wrap.querySelector('#inbox-unread-bar');
  const btn = wrap.querySelector('#inbox-unread-bar-btn');
  if (bar) bar.addEventListener('click', handleMarkAllRead);
  if (btn) btn.addEventListener('click', (e) => { e.stopPropagation(); handleMarkAllRead(); });
}

function renderFooter(bodyEl, count) {
  const footer = bodyEl.querySelector('#inbox-footer');
  if (!footer) return;
  if (count === 0) { footer.innerHTML = ''; return; }
  footer.innerHTML = `<button class="inbox-clear-all danger" id="inbox-clear-all">清空全部</button>`;
  const btn = footer.querySelector('#inbox-clear-all');
  if (btn) btn.addEventListener('click', handleClearAll);
}

function renderItem(msg) {
  const iconName = APP_ICON_MAP[msg.app] || 'bell';
  const tag = APP_LABEL_MAP[msg.app] || '消息';
  const time = formatRelative(msg.t || msg.createdAt);
  const title = msg.title || '有一条新消息';
  const body = msg.body || '';
  const isUnread = !msg.read;
  return `
    <div class="inbox-item ${isUnread ? 'unread' : 'read'}" data-id="${escapeAttr(msg.id)}" role="button" tabindex="0" aria-label="${isUnread ? '未读消息' : '已读消息'}：${escapeAttr(title)}">
      ${isUnread ? '<span class="inbox-dot" aria-hidden="true"></span>' : ''}
      <div class="inbox-item-icon">${createIcon(iconName, 20).outerHTML}</div>
      <div class="inbox-item-main">
        <div class="inbox-item-title-row">
          <div class="inbox-item-title">${escapeHTML(title)}</div>
          <span class="inbox-item-tag">${escapeHTML(tag)}</span>
        </div>
        ${body ? `<div class="inbox-item-body">${escapeHTML(body)}</div>` : ''}
        ${time ? `<div class="inbox-item-time">${escapeHTML(time)}</div>` : ''}
      </div>
    </div>
  `;
}

// ════════════════════════════════════════
// 交互
// ════════════════════════════════════════

// 点击消息：标记已读，再跳到对应 App。markInboxRead 会 emit 'inbox:updated' 触发刷新。
function handleMessageClick(msg) {
  if (!msg || !msg.id) return;
  try {
    if (!msg.read) markInboxRead(msg.id);
  } catch (e) {
    console.warn('[inbox] 标记已读失败', e);
  }
  // 跳到对应 App（system / 未知来源就不跳，留在消息中心）
  const appId = msg.app;
  if (appId && appId !== 'system' && APP_ICON_MAP[appId]) {
    openApp(appId).catch((e) => {
      console.warn('[inbox] 跳转 App 失败', appId, e);
    });
  } else {
    // 没有可跳的 App，刷新一下把已读状态刷出来
    render();
  }
}

// 全部已读
function handleMarkAllRead() {
  try {
    markAllInboxRead();
    showToast('都看过啦，清清爽爽', 'success', 1200);
  } catch (e) {
    console.warn('[inbox] 全部已读失败', e);
    showToast('没操作成功，再试一下嘛', 'error');
  }
}

// 清空全部
function handleClearAll() {
  showConfirm({
    title: '清空所有消息吗？',
    body: '清掉就找不回来啦，确定的话就点确认嘛',
    confirmText: '清空吧',
    cancelText: '再想想',
    danger: true,
    onConfirm: () => {
      try {
        clearInbox();
        showToast('都清掉啦', 'default', 1200);
      } catch (e) {
        console.warn('[inbox] 清空失败', e);
        showToast('没清掉，再试一下嘛', 'error');
      }
    }
  });
}

// 长按删除单条
function confirmDelete(msg) {
  if (!msg || !msg.id) return;
  showConfirm({
    title: '删掉这条消息吗？',
    body: msg.title ? String(msg.title).slice(0, 40) : '',
    confirmText: '删掉吧',
    cancelText: '不要',
    danger: true,
    onConfirm: () => {
      try {
        deleteInboxMessage(msg.id);
        showToast('删掉啦', 'default', 1200);
      } catch (e) {
        console.warn('[inbox] 删除失败', e);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

// ════════════════════════════════════════
// 长按检测（参考 moments 的实现：touchstart 计时 + contextmenu 兜底）
// ════════════════════════════════════════

function bindLongPress(el, callback) {
  let timer = null;
  let triggered = false;
  const start = () => {
    triggered = false;
    timer = setTimeout(() => {
      timer = null;
      triggered = true;
      callback();
    }, 600);
  };
  const cancel = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchmove', cancel, { passive: true });
  el.addEventListener('touchcancel', cancel);
  el.addEventListener('mousedown', start);
  el.addEventListener('mouseup', cancel);
  el.addEventListener('mouseleave', cancel);
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!triggered) callback();
  });
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
