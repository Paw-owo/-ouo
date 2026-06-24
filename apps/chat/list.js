// apps/chat/list.js
// imports:
//   from '../../core/storage.js': getData, setData, generateId, getNow, setDB, getAllDB, getByIndexDB, deleteDB
//   from '../../core/ui.js': createIcon, showToast, showConfirm

import {
  getData,
  setData,
  generateId,
  getNow,
  setDB,
  getAllDB,
  getByIndexDB,
  deleteDB
} from '../../core/storage.js';

import {
  createIcon,
  showToast,
  showConfirm
} from '../../core/ui.js';

const LIST_STYLE_ID = 'chat-list-style';
const HIDDEN_PRIVATE_KEY = 'chat_hidden_private_threads';
const PRIVATE_UNREAD_KEY = 'chat_unread_counts';
const GROUP_UNREAD_KEY = 'chat_group_unread_counts';
const LAST_ROUTE_KEY = 'chat_last_route';
const SWIPE_WIDTH = 214;

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
  closeSwipe();

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

  state.privateItems = privateItems
    .filter((item) => item && !isSoftBlockedItem(item))
    .sort(sortListItems);

  state.groupItems = groupItems.sort(sortListItems);
}

async function buildPrivateItem(character) {
  const messages = normalizeArray(await getByIndexDB('messages', 'characterId', character.id).catch(() => []))
    .filter((message) => message?.id)
    .sort(sortByTimestamp);

  const latest = messages[messages.length - 1] || null;
  const matched = findMatchedMessage(messages, state.search);
  const relationshipLock = await loadActiveRelationshipLock(character.id);

  const unreadMap = normalizeObject(getData(PRIVATE_UNREAD_KEY));
  const unread = relationshipLock?.type === 'soft_block'
    ? 0
    : Math.max(0, Number(unreadMap[character.id] || 0));

  return {
    id: character.id,
    type: 'private',
    name: character.name || '未命名',
    avatar: character.avatar || '',
    preview: getRelationshipPreview(relationshipLock) || (latest ? getMessagePreview(latest) : '还没有聊天记录'),
    matchedPreview: matched ? getMessagePreview(matched, true) : '',
    time: latest?.timestamp || relationshipLock?.updatedAt || character.updatedAt || character.createdAt || '',
    unread,
    relationshipLock,
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

async function loadActiveRelationshipLock(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return null;

  const locks = normalizeArray(await getByIndexDB('relationship_locks', 'characterId', id).catch(() => []))
    .filter((item) => item?.status === 'active')
    .sort(sortByUpdatedAtDesc);

  const now = Date.now();

  for (const lock of locks) {
    const endsAt = new Date(lock.endsAt || 0).getTime();

    if (endsAt && endsAt <= now) {
      await setDB('relationship_locks', {
        ...lock,
        status: 'expired',
        updatedAt: getNow()
      }).catch(() => null);
      continue;
    }

    return lock;
  }

  return null;
}

function isSoftBlockedItem(item) {
  return item?.relationshipLock?.type === 'soft_block';
}

function getRelationshipPreview(lock) {
  if (!lock || lock.status !== 'active') return '';

  if (lock.type === 'soft_block') return '';
  if (lock.type === 'cooldown') return 'TA 有点冷，先给 TA 一点时间。';
  if (lock.type === 'ultimatum') return 'TA 在等你认真解释。';

  return lock.reason || 'TA 现在有点闹别扭。';
}

function getRelationshipBadge(lock) {
  if (!lock || lock.status !== 'active') return '';

  if (lock.type === 'cooldown') return '冷战中';
  if (lock.type === 'ultimatum') return '最后通牒';
  if (lock.type === 'soft_block') return '躲起来了';

  return '闹别扭';
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

  const close = iconButton('back', '返回桌面');
  close.classList.add('chat-list-back-btn');
  close.addEventListener('click', () => {
    state.appState?.closeApp?.();
  });

  const titleWrap = el('div', 'chat-list-title-wrap');
  titleWrap.append(
    el('div', 'chat-list-title-main', '消息'),
    el('div', 'chat-list-title-sub', '私聊和群聊分开放好')
  );

  const createGroup = iconButton('add', '建立群聊');
  createGroup.classList.add('chat-list-create-group-btn');
  createGroup.addEventListener('click', () => createGroupChat());

  header.append(close, titleWrap, createGroup);
  return header;
}

async function createGroupChat() {
  const characters = normalizeArray(await getAllDB('characters').catch(() => []))
    .filter((item) => item?.id);

  if (!characters.length) {
    showToast('先去角色管理里添加角色');
    return;
  }

  const now = getNow();
  const group = {
    id: generateId('group'),
    name: buildGroupName(characters),
    avatar: '',
    memberIds: characters.map((item) => item.id),
    createdAt: now,
    updatedAt: now
  };

  await setDB('groups', group);

  state.tab = 'group';
  state.search = '';
  await loadItems();
  render();

  showToast('群聊建好啦');

  if (typeof state.appState?.openGroupThread === 'function') {
    await state.appState.openGroupThread(group.id);
  }
}

function buildGroupName(characters) {
  const names = characters
    .slice(0, 3)
    .map((item) => String(item.name || '').trim())
    .filter(Boolean);

  if (!names.length) return '新的群聊';
  if (characters.length <= 3) return `${names.join('、')}的小群聊`;
  return `${names.join('、')}等 ${characters.length} 人的小群聊`;
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
    closeSwipe();
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
    closeSwipe();
    await rerender();
  });

  const clear = iconButton('close', '清空搜索');
  clear.addEventListener('click', async () => {
    state.search = '';
    closeSwipe();
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

  if (item.relationshipLock) {
    row.dataset.relationshipLocked = 'true';
    row.dataset.relationshipType = item.relationshipLock.type || '';
  }

  const content = el('div', 'chat-thread-content');
  const avatar = createAvatar(item.avatar, item.name, item.type);
  const body = el('button', 'chat-thread-body');
  body.type = 'button';

  const top = el('div', 'chat-thread-top');
  const nameWrap = el('div', 'chat-thread-name-wrap');
  nameWrap.appendChild(el('div', 'chat-thread-name', item.name));

  const badgeText = getRelationshipBadge(item.relationshipLock);
  if (badgeText) {
    nameWrap.appendChild(el('span', 'chat-thread-lock-badge', badgeText));
  }

  top.append(
    nameWrap,
    el('div', 'chat-thread-time', formatTime(item.time))
  );

  const bottom = el('div', 'chat-thread-bottom');
  const preview = el('div', 'chat-thread-preview', item.matchedPreview || item.preview);
  if (item.matchedPreview) preview.classList.add('matched');
  if (item.relationshipLock) preview.classList.add('relationship-preview');

  bottom.append(preview);

  if (item.unread > 0) {
    bottom.appendChild(el('span', 'chat-thread-unread', String(Math.min(item.unread, 99))));
  }

  body.append(top, bottom);

  body.addEventListener('click', async () => {
    if (row.classList.contains('swipe-open')) {
      closeSwipe();
      return;
    }

    if (item.type === 'group') {
      await state.appState?.openGroupThread?.(item.id);
      return;
    }

    await state.appState?.openPrivateThread?.(item.id);
  });

  content.append(avatar, body);

  if (item.type === 'private') {
    const actions = createSwipeActions(item);
    row.append(actions, content);
    bindSwipe(row, content);
  } else {
    row.append(content);
  }

  return row;
}

function createSwipeActions(item) {
  const actions = el('div', 'chat-thread-swipe-actions');

  const fresh = el('button', 'chat-swipe-action soft', '新对话');
  fresh.type = 'button';
  fresh.addEventListener('click', async (event) => {
    event.stopPropagation();
    await confirmNewConversation(item);
  });

  const clear = el('button', 'chat-swipe-action warn', '清空记录');
  clear.type = 'button';
  clear.addEventListener('click', async (event) => {
    event.stopPropagation();
    await confirmClearMessages(item);
  });

  const remove = el('button', 'chat-swipe-action danger', '删除角色');
  remove.type = 'button';
  remove.addEventListener('click', async (event) => {
    event.stopPropagation();
    await confirmDeleteCharacter(item);
  });

  actions.append(fresh, clear, remove);
  return actions;
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
    el('div', 'chat-empty-desc', state.tab === 'group' ? '点右上角加号，就能建一个小群。' : '去角色管理里添加角色，就能开始聊天。')
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
    const text = normalizeSearch([
      message.content || '',
      message.stickerDescription || '',
      message.quoteText || '',
      message.itemName || '',
      message.itemDesc || '',
      message.title || '',
      message.description || ''
    ].join(' '));
    return text.includes(q);
  }) || null;
}

function bindSwipe(row, content) {
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let swiping = false;
  let locked = false;
  let baseX = 0;
  let lastTranslate = 0;

  row.addEventListener('pointerdown', (event) => {
    startX = event.clientX;
    startY = event.clientY;
    currentX = event.clientX;
    swiping = true;
    locked = false;
    baseX = row.classList.contains('swipe-open') ? -SWIPE_WIDTH : 0;
    lastTranslate = baseX;
  });

  row.addEventListener('pointermove', (event) => {
    if (!swiping) return;

    currentX = event.clientX;
    const dx = currentX - startX;
    const dy = Math.abs(event.clientY - startY);

    if (!locked && dy > 12 && Math.abs(dx) < 18) {
      swiping = false;
      return;
    }

    if (Math.abs(dx) > 10) locked = true;
    if (!locked) return;

    const next = clamp(baseX + dx, -SWIPE_WIDTH, 0);
    lastTranslate = next;

    if (next < -4) {
      closeSwipe(row);
    }

    content.style.transform = `translateX(${next}px)`;
  });

  row.addEventListener('pointerup', () => {
    if (!swiping) return;
    swiping = false;

    if (!locked) return;

    if (lastTranslate <= -SWIPE_WIDTH * 0.45) {
      openSwipe(row, content);
      return;
    }

    closeSwipe();
    content.style.transform = '';
  });

  row.addEventListener('pointercancel', () => {
    swiping = false;

    if (row.classList.contains('swipe-open')) {
      content.style.transform = `translateX(-${SWIPE_WIDTH}px)`;
      return;
    }

    content.style.transform = '';
  });
}

function openSwipe(row, content) {
  closeSwipe(row);
  row.classList.add('swipe-open');
  content.style.transform = `translateX(-${SWIPE_WIDTH}px)`;
  state.swipe = { row, content };
}

function closeSwipe(exceptRow = null) {
  if (!state.swipe) return;
  if (exceptRow && state.swipe.row === exceptRow) return;

  state.swipe.row?.classList?.remove('swipe-open');
  if (state.swipe.content) {
    state.swipe.content.style.transform = '';
  }
  state.swipe = null;
}

async function confirmNewConversation(item) {
  const ok = await showConfirm(`要和「${item.name}」开一段新对话吗？旧聊天会收成一条小记忆，角色还在。`);
  if (!ok) {
    closeSwipe();
    return;
  }

  const messages = await getCharacterMessages(item.id);

  if (messages.length) {
    await saveConversationMemory(item, messages).catch(() => null);
  }

  await deleteMessages(messages);
  clearPrivateUnread(item.id);
  clearLastRouteIfCharacter(item.id);

  showToast('新对话准备好啦');
  closeSwipe();
  await rerender();
}

async function confirmClearMessages(item) {
  const ok = await showConfirm(`确定清空「${item.name}」的聊天记录吗？只清聊天，不会删除角色。`);
  if (!ok) {
    closeSwipe();
    return;
  }

  const messages = await getCharacterMessages(item.id);
  await deleteMessages(messages);
  clearPrivateUnread(item.id);
  clearLastRouteIfCharacter(item.id);

  showToast('聊天记录清空啦');
  closeSwipe();
  await rerender();
}

async function confirmDeleteCharacter(item) {
  const ok = await showConfirm(`真的要删除「${item.name}」吗？这会删掉角色和相关聊天数据，不只是清记录哦。`);
  if (!ok) {
    closeSwipe();
    return;
  }

  await deleteCharacterEverywhere(item.id);
  showToast('已经把 TA 从列表里移走了');
  closeSwipe();
  await rerender();

  window.dispatchEvent(new CustomEvent('characters:updated'));
  window.dispatchEvent(new CustomEvent('chat:refresh'));
  window.dispatchEvent(new CustomEvent('desktop:refresh'));
}

async function getCharacterMessages(characterId) {
  return normalizeArray(await getByIndexDB('messages', 'characterId', characterId).catch(() => []))
    .filter((message) => message?.id);
}

async function deleteMessages(messages) {
  await Promise.all(
    normalizeArray(messages)
      .filter((message) => message?.id)
      .map((message) => deleteDB('messages', message.id).catch(() => null))
  );
}

async function saveConversationMemory(item, messages) {
  const useful = normalizeArray(messages)
    .filter((message) => message?.content)
    .slice(-8)
    .map((message) => {
      const who = message.role === 'user' ? '用户' : item.name;
      return `${who}：${String(message.content || '').replace(/\s+/g, ' ').trim()}`;
    })
    .filter(Boolean);

  if (!useful.length) return;

  const now = getNow();
  await setDB('memories', {
    id: generateId('memory'),
    characterId: item.id,
    content: `开新对话前的小回忆：${useful.join(' / ').slice(0, 520)}`,
    source: 'summary',
    createdAt: now,
    updatedAt: now
  });
}

async function deleteCharacterEverywhere(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  await Promise.all([
    deleteDB('characters', id).catch(() => null),
    deleteIndexedByCharacter('messages', 'characterId', id),
    deleteIndexedByCharacter('memories', 'characterId', id),
    deleteIndexedByCharacter('grudges', 'characterId', id),
    deleteIndexedByCharacter('punishments', 'characterId', id),
    deleteIndexedByCharacter('relationship_locks', 'characterId', id)
  ]);

  await removeCharacterFromGroups(id);
  clearPrivateUnread(id);
  removeFromHiddenPrivate(id);
  clearLastRouteIfCharacter(id);
}

async function deleteIndexedByCharacter(storeName, indexName, characterId) {
  const rows = normalizeArray(await getByIndexDB(storeName, indexName, characterId).catch(() => []));
  await Promise.all(
    rows
      .filter((row) => row?.id)
      .map((row) => deleteDB(storeName, row.id).catch(() => null))
  );
}

async function removeCharacterFromGroups(characterId) {
  const groups = normalizeArray(await getAllDB('groups').catch(() => []));

  await Promise.all(groups.map(async (group) => {
    const memberIds = normalizeArray(group.memberIds);
    if (!memberIds.includes(characterId)) return;

    await setDB('groups', {
      ...group,
      memberIds: memberIds.filter((id) => id !== characterId),
      updatedAt: getNow()
    }).catch(() => null);
  }));
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

function removeFromHiddenPrivate(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  const hidden = getHiddenPrivateThreads().filter((item) => item !== id);
  setData(HIDDEN_PRIVATE_KEY, hidden);
}

function clearPrivateUnread(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  const unreadMap = normalizeObject(getData(PRIVATE_UNREAD_KEY));
  if (Object.prototype.hasOwnProperty.call(unreadMap, id)) {
    delete unreadMap[id];
    setData(PRIVATE_UNREAD_KEY, unreadMap);
  }

  window.AppEvents?.emit?.('badge:chat', { characterId: id, count: 0 });
  window.refreshDesktopBadges?.();
}

function clearLastRouteIfCharacter(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  const route = getData(LAST_ROUTE_KEY);
  if (!route || typeof route !== 'object') return;

  const params = normalizeObject(route.params);
  if (params.characterId === id || params.id === id) {
    setData(LAST_ROUTE_KEY, { name: 'list', params: {} });
  }
}

function getMessagePreview(message, longer = false) {
  if (!message) return '';

  if (message.type === 'image') return '[图片]';
  if (message.type === 'sticker') return `[表情包] ${message.stickerDescription || message.content || ''}`.trim();
  if (message.type === 'transfer') return `[转账 ${Number(message.transferAmount || 0)}]`;
  if (['gift', 'shop_item', 'shop-item', 'purchase', 'item'].includes(String(message.type || ''))) {
    return `[小卡片] ${message.itemName || message.title || message.name || message.content || ''}`.trim();
  }
  if (message.type === 'voice') return '[语音]';
  if (message.type === 'dice') return `[骰子 ${message.diceValue || ''}]`;
  if (message.type === 'rps') return '[石头剪刀布]';

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

function sortByUpdatedAtDesc(a, b) {
  return String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || ''));
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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
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
      grid-template-columns: auto minmax(0, 1fr) 44px;
      align-items: center;
      gap: 12px;
      padding: 14px 20px 10px;
      background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
      backdrop-filter: blur(18px);
      z-index: 2;
    }

    .chat-list-back-btn {
      justify-self: start;
    }

    .chat-list-create-group-btn {
      justify-self: end;
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
      overflow: hidden;
      min-height: 70px;
      border-radius: 22px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .chat-thread-row[data-relationship-locked="true"] {
      background: color-mix(in srgb, var(--bg-card) 92%, var(--accent-light));
    }

    .chat-thread-content {
      position: relative;
      z-index: 1;
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 12px;
      min-height: 70px;
      padding: 12px;
      border-radius: 22px;
      background: inherit;
      transition: all 200ms ease;
      will-change: transform;
    }

    .chat-thread-swipe-actions {
      position: absolute;
      inset: 0 8px 0 auto;
      z-index: 0;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 7px;
      pointer-events: auto;
    }

    .chat-swipe-action {
      min-width: 62px;
      height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      padding: 0 10px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 12px;
      white-space: nowrap;
      transition: all 200ms ease;
    }

    .chat-swipe-action.warn {
      background: var(--accent-light);
      color: var(--accent);
    }

    .chat-swipe-action.danger {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-swipe-action:active {
      transform: scale(0.96);
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

    .chat-thread-name-wrap {
      min-width: 0;
      display: inline-flex;
      align-items: center;
      gap: 7px;
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

    .chat-thread-lock-badge {
      flex: 0 0 auto;
      max-width: 72px;
      min-height: 20px;
      display: inline-flex;
      align-items: center;
      padding: 0 8px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--accent);
      box-shadow: var(--shadow-sm);
      font-size: 11px;
      line-height: 1;
      white-space: nowrap;
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

    .chat-thread-preview.relationship-preview {
      color: var(--accent);
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

      .chat-swipe-action {
        min-width: 58px;
        padding: 0 9px;
      }
    }
  `;

  document.head.appendChild(style);
}

// 改了什么：只修左滑展开后再拖动的位移计算，避免按钮半露。
// 会不会影响其他文件：不会。
// 更新记忆里该文件的导出函数：无变化。
// 依赖：../../core/storage.js(getData,setData,generateId,getNow,setDB,getAllDB,getByIndexDB,deleteDB)；../../core/ui.js(createIcon,showToast,showConfirm)
