// apps/chat/list.js
// imports:
//   from '../../core/storage.js': getData, setData, getAllDB, getByIndexDB
//   from '../../core/ui.js': createIcon, showToast

import {
  getData,
  setData,
  getAllDB,
  getByIndexDB
} from '../../core/storage.js';

import {
  createIcon,
  showToast
} from '../../core/ui.js';

const LIST_STYLE_ID = 'chat-list-style';
const HIDDEN_PRIVATE_KEY = 'chat_hidden_private_threads';
const PRIVATE_UNREAD_KEY = 'chat_unread_counts';
const GROUP_UNREAD_KEY = 'chat_group_unread_counts';

const state = {
  rootEl: null,
  appState: null,
  mounted: false,
  tab: 'private',
  search: '',
  privateItems: [],
  groupItems: [],
  swipe: null
};

export async function mountChatList(containerEl, options = {}) {
  state.rootEl = containerEl;
  state.appState = options.appState || null;
  state.mounted = true;
  state.tab = options.tab === 'group' ? 'group' : 'private';
  state.search = String(options.search || '').trim();

  injectStyle();
  await loadItems();
  render();
}

export function unmountChatList() {
  state.mounted = false;
  state.swipe = null;

  if (state.rootEl) {
    state.rootEl.replaceChildren();
  }

  state.rootEl = null;
  state.appState = null;
  state.privateItems = [];
  state.groupItems = [];
}

async function loadItems() {
  const [characters, groups] = await Promise.all([
    getAllDB('characters').catch(() => []),
    getAllDB('groups').catch(() => [])
  ]);

  const hidden = getHiddenPrivateThreads();

  const privateItems = await Promise.all(
    normalizeArray(characters)
      .filter((character) => character?.id && !hidden.includes(character.id))
      .map((character) => buildPrivateItem(character))
  );

  const groupItems = await Promise.all(
    normalizeArray(groups)
      .filter((group) => group?.id)
      .map((group) => buildGroupItem(group))
  );

  state.privateItems = privateItems.sort(sortListItems);
  state.groupItems = groupItems.sort(sortListItems);
}

async function buildPrivateItem(character) {
  const messages = normalizeArray(await getByIndexDB('messages', 'characterId', character.id).catch(() => []))
    .filter((message) => message?.id)
    .sort(sortByTimestamp);

  const latest = messages[messages.length - 1] || null;
  const matched = findMatchedMessage(messages, state.search);

  const unreadMap = normalizeObject(getData(PRIVATE_UNREAD_KEY));
  const unread = Math.max(0, Number(unreadMap[character.id] || 0));

  return {
    id: character.id,
    type: 'private',
    name: character.name || '未命名',
    avatar: character.avatar || '',
    preview: latest ? getMessagePreview(latest) : '还没有聊天记录',
    matchedPreview: matched ? getMessagePreview(matched, true) : '',
    time: latest?.timestamp || character.updatedAt || character.createdAt || '',
    unread,
    raw: character
  };
}

async function buildGroupItem(group) {
  const messages = normalizeArray(await getByIndexDB('group_messages', 'groupId', group.id).catch(() => []))
    .filter((message) => message?.id)
    .sort(sortByTimestamp);

  const latest = messages[messages.length - 1] || null;
  const matched = findMatchedMessage(messages, state.search);

  const unreadMap = normalizeObject(getData(GROUP_UNREAD_KEY));
  const unread = Math.max(0, Number(unreadMap[group.id] || 0));
  const count = normalizeArray(group.memberIds).length;

  return {
    id: group.id,
    type: 'group',
    name: group.name || '未命名群聊',
    avatar: group.avatar || '',
    preview: latest ? getMessagePreview(latest) : `${count || 0} 个成员，等你开口`,
    matchedPreview: matched ? getMessagePreview(matched, true) : '',
    time: latest?.timestamp || group.updatedAt || group.createdAt || '',
    unread,
    raw: group
  };
}

function render() {
  if (!state.rootEl || !state.mounted) return;

  const page = el('section', 'chat-page chat-list-page');
  page.append(
    createHeader(),
    createTabs(),
    createSearch(),
    createListArea()
  );

  state.rootEl.replaceChildren(page);
}

function createHeader() {
  const header = el('header', 'chat-list-header');

  const titleWrap = el('div', 'chat-list-title-wrap');
  titleWrap.append(
    el('div', 'chat-list-title-main', '消息'),
    el('div', 'chat-list-title-sub', '私聊和群聊分开放好')
  );

  const close = iconButton('close', '关闭');
  close.addEventListener('click', () => {
    state.appState?.closeApp?.();
  });

  header.append(titleWrap, close);
  return header;
}

function createTabs() {
  const tabs = el('div', 'chat-list-tabs');

  const privateTab = createTabButton('私聊', 'private');
  const groupTab = createTabButton('群聊', 'group');

  tabs.append(privateTab, groupTab);
  return tabs;
}

function createTabButton(text, tab) {
  const button = el('button', `chat-list-tab ${state.tab === tab ? 'active' : ''}`);
  button.type = 'button';
  button.textContent = text;

  button.addEventListener('click', async () => {
    if (state.tab === tab) return;
    state.tab = tab;
    state.search = '';
    await rerender();
  });

  return button;
}

function createSearch() {
  const wrap = el('div', 'chat-list-search-wrap');

  const input = document.createElement('input');
  input.className = 'chat-input-card chat-list-search-input';
  input.type = 'text';
  input.autocomplete = 'off';
  input.placeholder = state.tab === 'group' ? '搜群名或群消息' : '搜名字或聊天内容';
  input.value = state.search;

  input.addEventListener('input', async () => {
    state.search = input.value.trim();
    await rerender();
  });

  const clear = iconButton('close', '清空搜索');
  clear.addEventListener('click', async () => {
    state.search = '';
    await rerender();
  });

  wrap.append(input, clear);
  return wrap;
}

function createListArea() {
  const area = el('main', 'chat-list-area');
  const list = el('div', 'chat-list-scroll');

  const items = getVisibleItems();

  if (!items.length) {
    list.appendChild(createEmpty());
  } else {
    items.forEach((item) => {
      list.appendChild(createRow(item));
    });
  }

  area.appendChild(list);
  return area;
}

function createRow(item) {
  const row = el('article', 'chat-thread-row');
  row.dataset.id = item.id;
  row.dataset.type = item.type;

  const avatar = createAvatar(item.avatar, item.name, item.type);
  const body = el('button', 'chat-thread-body');
  body.type = 'button';

  const top = el('div', 'chat-thread-top');
  top.append(
    el('div', 'chat-thread-name', item.name),
    el('div', 'chat-thread-time', formatTime(item.time))
  );

  const bottom = el('div', 'chat-thread-bottom');
  const preview = el('div', 'chat-thread-preview', item.matchedPreview || item.preview);
  if (item.matchedPreview) preview.classList.add('matched');

  bottom.append(preview);

  if (item.unread > 0) {
    bottom.appendChild(el('span', 'chat-thread-unread', String(Math.min(item.unread, 99))));
  }

  body.append(top, bottom);

  body.addEventListener('click', async () => {
    if (item.type === 'group') {
      await state.appState?.openGroupThread?.(item.id);
      return;
    }

    await state.appState?.openPrivateThread?.(item.id);
  });

  if (item.type === 'private') {
    bindSwipe(row, item);
  }

  row.append(avatar, body);
  return row;
}

function createEmpty() {
  const empty = el('section', 'chat-empty');

  if (state.search) {
    empty.append(
      el('div', 'chat-empty-title', '没搜到'),
      el('div', 'chat-empty-desc', '换个词试试，也许它藏在另一段话里。')
    );
    return empty;
  }

  empty.append(
    el('div', 'chat-empty-title', state.tab === 'group' ? '还没有群聊' : '还没有私聊'),
    el('div', 'chat-empty-desc', state.tab === 'group' ? '创建群聊后，这里会热闹起来。' : '去角色管理里添加角色，就能开始聊天。')
  );

  return empty;
}

function getVisibleItems() {
  const q = normalizeSearch(state.search);
  const items = state.tab === 'group' ? state.groupItems : state.privateItems;

  if (!q) return items;

  return items.filter((item) => {
    return normalizeSearch(item.name).includes(q) ||
      normalizeSearch(item.preview).includes(q) ||
      normalizeSearch(item.matchedPreview).includes(q);
  });
}

function findMatchedMessage(messages, search) {
  const q = normalizeSearch(search);
  if (!q) return null;

  return messages.find((message) => {
    const text = normalizeSearch(message.content || '');
    return text.includes(q);
  }) || null;
}

function bindSwipe(row, item) {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let swiping = false;

  row.addEventListener('pointerdown', (event) => {
    startX = event.clientX;
    startY = event.clientY;
    currentX = event.clientX;
    swiping = true;
  });

  row.addEventListener('pointermove', (event) => {
    if (!swiping) return;

    currentX = event.clientX;
    const dx = currentX - startX;
    const dy = Math.abs(event.clientY - startY);

    if (dy > 22 || dx >= 0) return;

    row.style.transform = `translateX(${Math.max(dx, -82)}px)`;
  });

  row.addEventListener('pointerup', async () => {
    if (!swiping) return;
    swiping = false;

    const dx = currentX - startX;

    if (dx < -68) {
      await confirmHidePrivate(item);
      return;
    }

    row.style.transform = '';
  });

  row.addEventListener('pointercancel', () => {
    swiping = false;
    row.style.transform = '';
  });
}

async function confirmHidePrivate(item) {
  hidePrivateThread(item.id);
  showToast('已经帮你收起来了');
  await rerender();
}

async function rerender() {
  if (!state.mounted) return;
  await loadItems();
  render();
}

function getHiddenPrivateThreads() {
  const saved = getData(HIDDEN_PRIVATE_KEY);
  return Array.isArray(saved) ? saved : [];
}

function hidePrivateThread(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  const hidden = new Set(getHiddenPrivateThreads());
  hidden.add(id);
  setData(HIDDEN_PRIVATE_KEY, [...hidden]);
  state.appState?.hidePrivateThread?.(id);
}

function getMessagePreview(message, longer = false) {
  if (!message) return '';

  if (message.type === 'image') return '[图片]';
  if (message.type === 'sticker') return '[表情]';
  if (message.type === 'transfer') return `[转账 ${Number(message.transferAmount || 0)}]`;
  if (message.type === 'voice') return '[语音]';

  const text = String(message.content || '').replace(/\s+/g, ' ').trim();
  const max = longer ? 64 : 42;

  if (!text) return '[消息]';
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function createAvatar(src, name, type) {
  const avatar = el('span', `chat-list-avatar ${type === 'group' ? 'group' : ''}`);

  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitial(name);
  }

  return avatar;
}

function getInitial(name) {
  const text = String(name || '').trim();
  return text ? text.slice(0, 1).toUpperCase() : 'A';
}

function iconButton(iconName, label) {
  const button = el('button', 'chat-icon-btn');
  button.type = 'button';
  button.setAttribute('aria-label', label || iconName);
  button.appendChild(createIcon(iconName, 18));
  return button;
}

function formatTime(value) {
  if (!value) return '';

  const time = new Date(value).getTime();
  if (!time) return '';

  const now = Date.now();
  const diff = Math.max(0, now - time);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)}小时前`;

  const date = new Date(time);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function sortListItems(a, b) {
  const at = new Date(a.time || 0).getTime();
  const bt = new Date(b.time || 0).getTime();

  if (at !== bt) return bt - at;
  return String(a.name || '').localeCompare(String(b.name || ''));
}

function sortByTimestamp(a, b) {
  return String(a?.timestamp || '').localeCompare(String(b?.timestamp || ''));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeSearch(value) {
  return String(value || '').trim().toLowerCase();
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function injectStyle() {
  if (document.getElementById(LIST_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = LIST_STYLE_ID;
  style.textContent = `
    .chat-list-page {
      gap: 0;
    }

    .chat-list-header {
      flex: 0 0 auto;
      min-height: 68px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 14px 20px 10px;
      background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
      backdrop-filter: blur(18px);
      z-index: 2;
    }

    .chat-list-title-wrap {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .chat-list-title-main {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-list-title-sub {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.45;
    }

    .chat-list-tabs {
      flex: 0 0 auto;
      display: flex;
      gap: 10px;
      padding: 4px 20px 12px;
    }

    .chat-list-tab {
      min-height: 38px;
      border: 0;
      border-radius: 999px;
      padding: 0 16px;
      background: var(--bg-card);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 14px;
      transition: all 200ms ease;
    }

    .chat-list-tab.active {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-list-tab:active {
      transform: scale(0.96);
    }

    .chat-list-search-wrap {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      padding: 0 20px 12px;
    }

    .chat-list-search-input {
      min-width: 0;
    }

    .chat-list-area {
      flex: 1;
      min-height: 0;
      overflow: hidden;
      padding: 0 20px 20px;
    }

    .chat-list-scroll {
      height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-bottom: 18px;
      -webkit-overflow-scrolling: touch;
    }

    .chat-thread-row {
      position: relative;
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 22px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
      will-change: transform;
    }

    .chat-list-avatar {
      width: 46px;
      height: 46px;
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 999px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: 16px;
      font-weight: 600;
    }

    .chat-list-avatar.group {
      border-radius: 18px;
    }

    .chat-list-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .chat-thread-body {
      min-width: 0;
      border: 0;
      padding: 0;
      background: transparent;
      color: var(--text-primary);
      font: inherit;
      text-align: left;
    }

    .chat-thread-top {
      min-width: 0;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
      margin-bottom: 4px;
    }

    .chat-thread-name {
      min-width: 0;
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chat-thread-time {
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.35;
      white-space: nowrap;
    }

    .chat-thread-bottom {
      min-width: 0;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
    }

    .chat-thread-preview {
      min-width: 0;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.45;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chat-thread-preview.matched {
      color: var(--text-primary);
    }

    .chat-thread-unread {
      min-width: 18px;
      height: 18px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 5px;
      border-radius: 999px;
      background: var(--accent);
      color: var(--bubble-user-text);
      font-size: 11px;
      line-height: 1;
    }

    @media (max-width: 680px) {
      .chat-list-header,
      .chat-list-tabs,
      .chat-list-search-wrap,
      .chat-list-area {
        padding-left: 20px;
        padding-right: 20px;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/storage.js(getData,setData,getAllDB,getByIndexDB)；../../core/ui.js(createIcon,showToast)
