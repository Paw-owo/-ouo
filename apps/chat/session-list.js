// apps/chat/session-list.js
// 会话列表页——我把每个和她聊过的小角落都收在这里，点一下就能继续。
// 负责：列表渲染、搜索过滤、长按操作菜单、新建聊天（选角色）。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js
// 状态由 index.js 持有，本模块通过 getState/render 回调协作（循环依赖在调用时才用，安全）。

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, setData, getDB, setDB, deleteDB, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { formatRelative, debounce, isUsableImage, cssUrl } from '../../core/util.js';
import { getState, render, enterChat, refreshSessionList } from './index.js';
import { escapeHTML, escapeAttr, attachLongPress } from './shared-utils.js';
import { openApp } from '../../core/router.js';

// ════════════════════════════════════════
// 列表页渲染
// ════════════════════════════════════════

/**
 * 渲染会话列表页（首页）。把整个页面塞进 container。
 * @param {string} [keyword] 搜索关键字（小写）
 */
export async function renderSessionListPage(keyword = '') {
  const state = getState();
  const container = state.containerEl;
  if (!container) return;

  // 先画外壳，列表占位
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="chat-list-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">消息</div>
      <button class="app-header-gear" id="chat-list-settings" aria-label="聊天设置">${createIcon('settings', 18).outerHTML}</button>
      <button class="chat-list-add" id="chat-list-add" aria-label="新建聊天">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="chat-list-body" id="chat-list-body">
      <div class="chat-search-wrap">
        ${createIcon('search', 18).outerHTML}
        <input class="chat-search" id="chat-search" type="search" placeholder="找找聊过的小事..." aria-label="搜索会话" value="${escapeAttr(keyword)}">
      </div>
      <div id="chat-list-items"></div>
    </div>
  `;

  // 绑事件
  container.querySelector('#chat-list-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#chat-list-add').addEventListener('click', openNewChatSheet);
  // 齿轮跳到设置「AI 与陪伴」分组
  container.querySelector('#chat-list-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'ai' } }));

  const searchInput = container.querySelector('#chat-search');
  const onSearch = debounce((e) => {
    const kw = (e.target.value || '').trim().toLowerCase();
    renderSessionListItems(kw);
  }, 180);
  searchInput.addEventListener('input', onSearch);

  await renderSessionListItems(keyword);
  // 进入列表页时聚焦一下搜索框（仅当无关键字且非触屏时）
  try { if (!keyword) searchInput.blur(); } catch (e) {}
}

/** 仅刷新列表项区域（搜索时不重画整个页面） */
export async function renderSessionListItems(keyword = '') {
  const state = getState();
  const listEl = state.containerEl?.querySelector('#chat-list-items');
  if (!listEl) return;

  let sessions = [];
  try {
    sessions = await getAllDB(STORES.chatSessions);
  } catch (e) {
    console.warn('[chat] 读取会话列表失败', e);
    showToast('会话读不出来嘛，等一下再试试', 'error');
    return;
  }

  // 关键词过滤：先按 title/lastMessage 快速匹配，未命中的再搜历史消息正文
  const kw = String(keyword || '').toLowerCase();
  let filtered;
  if (kw) {
    const matchedIds = new Set();
    const quickMatches = sessions.filter((s) => {
      const t = (s.title || '').toLowerCase();
      const lm = (s.lastMessage || '').toLowerCase();
      if (t.includes(kw) || lm.includes(kw)) {
        matchedIds.add(s.id);
        return true;
      }
      return false;
    });
    // 对未命中的会话，搜历史消息 content（较慢，故只在快速匹配不足时跑）
    const unmatched = sessions.filter((s) => !matchedIds.has(s.id));
    if (unmatched.length) {
      let allMessages = [];
      try { allMessages = await getAllDB(STORES.messages); } catch (e) {}
      const msgMatches = unmatched.filter((s) => {
        return allMessages.some((m) =>
          (m.sessionId === s.id || (!m.sessionId && m.characterId === s.characterId)) &&
          String(m.content || '').toLowerCase().includes(kw)
        );
      });
      filtered = [...quickMatches, ...msgMatches];
    } else {
      filtered = quickMatches;
    }
  } else {
    filtered = sessions;
  }

  // 排序：置顶优先，其次 lastAt 倒序
  filtered.sort((a, b) => {
    const pa = a.pinned ? 1 : 0;
    const pb = b.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const ta = new Date(a.lastAt || a.updatedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.lastAt || b.updatedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="chat-empty-list">
        <div class="chat-empty-list-icon">${createIcon('chat', 52).outerHTML}</div>
        <div class="chat-empty-list-text">${kw ? '没找到相关的聊天呀，换几个字试试嘛' : '还没有聊天，点右上角找一个角色聊聊嘛'}</div>
      </div>
    `;
    return;
  }

  // 预读角色，做头像映射（一次批量，避免 N+1）
  const charCache = new Map();
  try {
    const allChars = await getAllDB(STORES.characters);
    allChars.forEach((c) => charCache.set(c.id, c));
  } catch (e) { /* 角色读不到也不阻塞，列表照画 */ }

  listEl.innerHTML = filtered.map((s) => renderSessionItem(s, charCache.get(s.characterId))).join('');

  // 绑定每条事件
  filtered.forEach((s) => {
    const item = listEl.querySelector(`[data-id="${cssEscape(s.id)}"]`);
    if (!item) return;
    // 点击进入聊天
    item.addEventListener('click', () => enterChat(s.id));
    // 长按弹操作菜单
    attachLongPress(item, () => openSessionActionsSheet(s));
  });
}

function renderSessionItem(session, character) {
  const avatarHTML = renderSessionAvatar(session, character);
  const title = escapeHTML(session.title || character?.name || character?.nickname || '未知');
  const time = formatRelative(session.lastAt || session.updatedAt || session.createdAt);
  const unread = Number(session.unread || 0);
  const unreadBadge = unread > 0
    ? `<span class="chat-unread-badge ${session.muted ? 'muted' : ''}">${unread > 99 ? '99+' : unread}</span>`
    : '';
  const pinnedIcon = session.pinned ? `<span class="chat-pin-mark">${createIcon('star', 14).outerHTML}</span>` : '';
  const mutedIcon = session.muted ? `<span class="chat-mute-mark">${createIcon('moon', 14).outerHTML}</span>` : '';

  // 草稿优先显示：有未发送草稿时，预览位显示 [草稿] xxx，[草稿] 前缀用 accent 色，正文用 hint 色
  const draft = (session.draft || '').trim();
  let previewHTML;
  if (draft) {
    const draftText = draft.length > 28 ? draft.slice(0, 28) + '...' : draft;
    previewHTML = `<span class="chat-list-draft-tag">[草稿]</span><span class="chat-list-draft-text">${escapeHTML(draftText)}</span>`;
  } else {
    const previewText = session.lastMessage
      ? (session.lastMessage.length > 32 ? session.lastMessage.slice(0, 32) + '...' : session.lastMessage)
      : '还没有消息呢';
    previewHTML = escapeHTML(previewText);
  }

  return `
    <div class="chat-list-item" data-id="${escapeAttr(session.id)}" role="button" tabindex="0" aria-label="进入 ${title} 的聊天">
      <div class="chat-list-avatar">${avatarHTML}</div>
      <div class="chat-list-main">
        <div class="chat-list-row1">
          <span class="chat-list-title">${title}</span>
          ${pinnedIcon}${mutedIcon}
          <span class="chat-list-time">${escapeHTML(time)}</span>
        </div>
        <div class="chat-list-row2">
          <span class="chat-list-preview">${previewHTML}</span>
          ${unreadBadge}
        </div>
      </div>
    </div>
  `;
}

function renderSessionAvatar(session, character) {
  const av = character?.avatar;
  if (av && isUsableImage(av)) {
    return `<div class="chat-list-avatar-img" style="background-image:${cssUrl(av)}"></div>`;
  }
  return `<div class="chat-list-avatar-fallback">${createIcon('smile', 24).outerHTML}</div>`;
}

// ════════════════════════════════════════
// 会话操作菜单（长按）
// ════════════════════════════════════════

function openSessionActionsSheet(session) {
  const body = document.createElement('div');
  body.className = 'chat-action-list';
  const actions = [
    {
      key: 'pin', label: session.pinned ? '取消置顶' : '置顶会话',
      icon: 'star', onClick: () => togglePin(session)
    },
    {
      key: 'mute', label: session.muted ? '取消免打扰' : '免打扰',
      icon: 'moon', onClick: () => toggleMute(session)
    },
    {
      key: 'read', label: (session.unread || 0) > 0 ? '标记已读' : '标记未读',
      icon: 'check', onClick: () => toggleRead(session)
    },
    {
      key: 'delete', label: '删除会话', icon: 'trash', danger: true, onClick: () => confirmDeleteSession(session)
    }
  ];

  body.innerHTML = actions.map((a) => `
    <button class="chat-action-item ${a.danger ? 'danger' : ''}" data-key="${a.key}" role="menuitem">
      ${createIcon(a.icon, 20).outerHTML}
      <span>${escapeHTML(a.label)}</span>
    </button>
  `).join('');

  const sheet = showBottomSheet({
    title: escapeText(session.title || '会话操作'),
    bodyElement: body,
    dismissible: true
  });

  body.querySelectorAll('.chat-action-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.key;
      const action = actions.find((a) => a.key === key);
      sheet.close();
      if (action && typeof action.onClick === 'function') {
        try { action.onClick(); } catch (e) { console.warn('[chat] 会话操作失败', e); }
      }
    });
  });
}

async function togglePin(session) {
  try {
    await setDB(STORES.chatSessions, session.id, { ...session, pinned: !session.pinned });
    showToast(session.pinned ? '取消置顶啦' : '置顶好啦，重要的会话放最上面', 'success', 1200);
    await refreshSessionList();
  } catch (e) {
    console.warn('[chat] 切换置顶失败', e);
    showToast('没切换成功，再试一下嘛', 'error');
  }
}

async function toggleMute(session) {
  try {
    await setDB(STORES.chatSessions, session.id, { ...session, muted: !session.muted });
    showToast(session.muted ? '取消免打扰啦' : '已开启免打扰，新消息不再打扰你', 'default', 1400);
    await refreshSessionList();
  } catch (e) {
    console.warn('[chat] 切换免打扰失败', e);
    showToast('没切换成功，再试一下嘛', 'error');
  }
}

async function toggleRead(session) {
  try {
    // 标记已读清零，标记未读设为 1
    const nextUnread = (session.unread || 0) > 0 ? 0 : 1;
    await setDB(STORES.chatSessions, session.id, { ...session, unread: nextUnread });
    showToast(nextUnread === 0 ? '已标记为已读' : '已标记为未读', 'default', 1200);
    await refreshSessionList();
  } catch (e) {
    console.warn('[chat] 切换已读失败', e);
    showToast('没切换成功，再试一下嘛', 'error');
  }
}

function confirmDeleteSession(session) {
  showConfirm({
    title: '删掉这个会话吗？',
    body: '会话和里面所有消息都会一起删掉，确定嘛？',
    confirmText: '删掉吧',
    cancelText: '再想想',
    danger: true,
    onConfirm: async () => {
      try {
        // 先删该会话的所有消息，再删会话本身
        const all = await getAllDB(STORES.messages);
        const toDelete = all.filter((m) => m.sessionId === session.id || (!m.sessionId && m.characterId === session.characterId));
        for (const m of toDelete) {
          try { await deleteDB(STORES.messages, m.id); } catch (e) {}
        }
        await deleteDB(STORES.chatSessions, session.id);
        showToast('删掉啦', 'default', 1200);
        await refreshSessionList();
      } catch (e) {
        console.warn('[chat] 删除会话失败', e);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

// ════════════════════════════════════════
// 新建聊天（选角色 -> 创建 session）
// ════════════════════════════════════════

export async function openNewChatSheet() {
  let characters = [];
  try {
    characters = await getAllDB(STORES.characters);
  } catch (e) {
    console.warn('[chat] 读取角色列表失败', e);
    showToast('角色读不出来嘛', 'error');
    return;
  }
  if (!characters.length) {
    // 没有角色：确认后跳转到角色 App 创建
    showConfirm({
      title: '还没有角色呢',
      body: '先去角色 App 里创建一个嘛，建好回来就能聊啦',
      confirmText: '去创建',
      cancelText: '再想想',
      onConfirm: () => { openApp('characters'); }
    });
    return;
  }

  // 列出已有会话的角色，方便去重提示
  let existingSessions = [];
  try { existingSessions = await getAllDB(STORES.chatSessions); } catch (e) {}
  const existingCharIds = new Set(existingSessions.map((s) => s.characterId));

  const body = document.createElement('div');
  body.className = 'chat-char-list';
  body.innerHTML = characters.map((c) => `
    <div class="chat-char-item" data-id="${escapeAttr(c.id)}" role="button" tabindex="0" aria-label="和 ${escapeAttr(c.name || c.nickname || '角色')} 聊天">
      ${renderCharAvatar(c, 44)}
      <div class="chat-char-info">
        <div class="chat-char-name">${escapeHTML(c.name || c.nickname || '未命名')}</div>
        <div class="chat-char-persona">${escapeHTML((c.persona || '还没有人设呢').slice(0, 40))}</div>
      </div>
      ${existingCharIds.has(c.id) ? `<span class="chat-char-exists">${createIcon('chat', 16).outerHTML}</span>` : ''}
    </div>
  `).join('');

  const sheet = showBottomSheet({
    title: '选一个角色聊天',
    bodyElement: body,
    dismissible: true
  });

  body.querySelectorAll('.chat-char-item').forEach((item) => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      sheet.close();
      // 已有会话则直接进入，否则新建
      const exist = existingSessions.find((s) => s.characterId === id);
      if (exist) {
        enterChat(exist.id);
      } else {
        createSessionForCharacter(id);
      }
    });
  });
}

/** 给角色创建一个新会话，并进入 */
export async function createSessionForCharacter(characterId) {
  let character = null;
  try { character = await getDB(STORES.characters, characterId); } catch (e) {}
  if (!character) {
    showToast('找不到这个角色呀', 'error');
    return;
  }
  const now = getNow();
  const sessionId = generateId('sess');
  // 兼容旧版单聊壁纸：若该角色已有 legacy 壁纸，迁移过来
  let wallpaper = null;
  try {
    const legacyUrl = getData(KEYS.chatWallpaper(characterId), '');
    if (legacyUrl) {
      const legacyOpacity = getData(KEYS.chatWallpaperOpacity(characterId), 60);
      wallpaper = { url: legacyUrl, opacity: Number(legacyOpacity) || 60 };
    }
  } catch (e) {}

  const session = {
    id: sessionId,
    characterId,
    title: character.name || character.nickname || '聊天',
    pinned: false,
    muted: false,
    draft: '',
    unread: 0,
    wallpaper,
    lastMessage: '',
    lastAt: now
  };
  try {
    await setDB(STORES.chatSessions, sessionId, session);
    // 同步当前角色 id（兼容其他 App）
    setData(KEYS.chatCurrentCharacter, characterId);
    await refreshSessionList();
    enterChat(sessionId);
  } catch (e) {
    console.warn('[chat] 创建会话失败', e);
    showToast('会话没建好，再试一下嘛', 'error');
  }
}

function renderCharAvatar(char, size) {
  const av = char.avatar;
  if (av && isUsableImage(av)) {
    return `<div class="chat-char-avatar" style="width:${size}px;height:${size}px;background-image:${cssUrl(av)};background-size:cover;background-position:center"></div>`;
  }
  return `<div class="chat-char-avatar" style="width:${size}px;height:${size}px">${createIcon('smile', Math.round(size * 0.55)).outerHTML}</div>`;
}

// ════════════════════════════════════════
// 工具：escapeHTML / escapeAttr / attachLongPress 已收拢到 ./shared-utils.js
// ════════════════════════════════════════

// escapeText 保留为 escapeHTML 别名（本模块历史调用点沿用）
function escapeText(s) { return escapeHTML(s); }
function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, '\\$&');
}
