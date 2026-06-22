// apps/chat/list.js
// imports:
//   from '../../core/storage.js': getData, setData, generateId, getNow, getAllDB, getDB, setDB, deleteDB, getByIndexDB, compressImage
//   from '../../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon

import {
  getData,
  setData,
  generateId,
  getNow,
  getAllDB,
  getDB,
  setDB,
  deleteDB,
  getByIndexDB,
  compressImage
} from '../../core/storage.js';

import {
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm,
  createIcon
} from '../../core/ui.js';

const LIST_STYLE_ID = 'chat-list-style';
const HIDDEN_THREADS_KEY = 'chat_hidden_threads';

let rootEl = null;
let appState = null;
let currentTab = 'private';
let currentSearch = '';
let characters = [];
let groups = [];
let latestCache = {};
let latestGroupCache = {};
let unreadCounts = {};
let groupUnreadCounts = {};
let searchTimer = 0;
let injectedStyle = false;

export async function mountChatList(containerEl, options = {}) {
  rootEl = containerEl;
  appState = options.appState || null;
  currentTab = options.tab === 'group' ? 'group' : 'private';
  currentSearch = String(options.search || '');

  injectStyle();
  await loadListData();
  renderListPage();
}

async function loadListData() {
  characters = normalizeArray(await getAllDB('characters')).filter((item) => item?.id);
  groups = normalizeArray(await getAllDB('groups')).filter((item) => item?.id);
  latestCache = getData('chat_latest_cache') || {};
  latestGroupCache = getData('chat_group_latest_cache') || {};
  unreadCounts = getData('chat_unread_counts') || {};
  groupUnreadCounts = getData('chat_group_unread_counts') || {};
}

function renderListPage() {
  if (!rootEl) return;

  rootEl.innerHTML = '';

  const page = el('section', 'chat-page chat-list-page');

  const nav = el('header', 'chat-nav chat-list-nav');

  const backButton = iconButton('back', '返回');
  backButton.addEventListener('click', () => appState?.closeApp?.());

  const titleWrap = el('div', 'chat-nav-title-wrap');
  titleWrap.append(
    el('div', 'chat-nav-title', '聊天'),
    el('div', 'chat-nav-subtitle', '谁在偷偷想你')
  );

  const addButton = iconButton('add', '新建群聊');
  addButton.addEventListener('click', openGroupCreateSheet);

  nav.append(backButton, titleWrap, addButton);

  const content = el('main', 'chat-content chat-list-content');
  const wrap = el('div', 'chat-content-narrow chat-list-wrap');

  const searchBox = el('div', 'chat-list-search-box');
  const searchInput = input('搜名字、消息或记忆');
  searchInput.className = 'chat-input-card chat-list-search-input';
  searchInput.value = currentSearch;
  searchInput.addEventListener('input', () => {
    currentSearch = searchInput.value.trim();
    handleSearchInput(currentSearch);
  });

  const searchResults = el('div', 'chat-list-search-results');
  searchResults.id = 'chat-list-search-results';
  searchBox.append(searchInput, searchResults);

  const tabs = createSegmented(
    [
      { value: 'private', label: '私聊' },
      { value: 'group', label: '群聊' }
    ],
    currentTab,
    async (value) => {
      currentTab = value;
      currentSearch = '';
      await loadListData();
      renderListPage();
    }
  );

  const list = el('div', 'chat-thread-list');

  wrap.append(searchBox, tabs);

  if (currentTab === 'private') {
    const visibleCharacters = getVisiblePrivateCharacters();

    if (!visibleCharacters.length) {
      wrap.appendChild(emptyState('这里还很安静', '去角色那里找 TA 说句话，聊天入口就会回来。'));
    } else {
      visibleCharacters.forEach((character) => {
        list.appendChild(createPrivateThreadCard(character));
      });
      wrap.appendChild(list);
    }
  } else {
    if (!groups.length) {
      wrap.appendChild(emptyState('还没有小群', '点右上角，把几个 TA 拉到一起坐坐。'));
    } else {
      getSortedGroups().forEach((group) => {
        list.appendChild(createGroupThreadCard(group));
      });
      wrap.appendChild(list);
    }
  }

  content.appendChild(wrap);
  page.append(nav, content);
  rootEl.appendChild(page);

  if (currentSearch) {
    handleSearchInput(currentSearch);
  }
}

function getVisiblePrivateCharacters() {
  return characters
    .filter((character) => character?.id && !isPrivateThreadHidden(character.id))
    .slice()
    .sort((a, b) => {
      const bt = getLatestTime(b.id);
      const at = getLatestTime(a.id);
      return String(bt || '').localeCompare(String(at || ''));
    });
}

function getSortedGroups() {
  return groups
    .filter((group) => group?.id)
    .slice()
    .sort((a, b) => {
      const bt = getLatestGroupTime(b.id) || b.updatedAt || b.createdAt || '';
      const at = getLatestGroupTime(a.id) || a.updatedAt || a.createdAt || '';
      return String(bt || '').localeCompare(String(at || ''));
    });
}

function createPrivateThreadCard(character) {
  const outer = el('div', 'chat-swipe-wrap');
  const deleteAction = el('button', 'chat-swipe-delete', '清除记录');
  deleteAction.type = 'button';

  const card = el('button', 'chat-thread-card chat-private-card');
  card.type = 'button';

  const avatar = createAvatar(character.avatar, character.name, 'md');
  const latest = latestCache[character.id] || {};
  const unread = Number(unreadCounts[character.id] || 0);

  const main = el('div', 'chat-thread-main');
  main.append(
    el('div', 'chat-thread-title', character.name || '未命名角色'),
    el('div', 'chat-thread-preview', latest.preview || getPromptPreview(character)),
    el('div', 'chat-thread-meta', latest.time ? formatRelativeTime(latest.time) : getMoodText(character.mood))
  );

  const right = el('div', 'chat-thread-right');
  if (unread > 0) {
    right.appendChild(el('span', 'chat-unread-badge', unread > 99 ? '99+' : String(unread)));
  }

  card.append(avatar, main, right);

  let startX = 0;
  let startY = 0;
  let offsetX = 0;
  let dragging = false;
  let opened = false;
  let moved = false;

  const setOffset = (value, animate = true) => {
    offsetX = Math.max(0, Math.min(104, value));
    card.style.transition = animate ? 'all 200ms ease' : 'none';
    card.style.transform = `translateX(${offsetX}px)`;
    outer.classList.toggle('open', offsetX > 52);
  };

  const closeSwipe = () => {
    opened = false;
    setOffset(0);
  };

  const openSwipe = () => {
    opened = true;
    setOffset(104);
  };

  card.addEventListener('click', (event) => {
    if (moved) {
      event.preventDefault();
      event.stopPropagation();
      moved = false;
      return;
    }

    if (opened) {
      event.preventDefault();
      event.stopPropagation();
      closeSwipe();
      return;
    }

    appState?.openPrivateThread?.(character.id);
  });

  card.addEventListener('pointerdown', (event) => {
    startX = event.clientX;
    startY = event.clientY;
    dragging = true;
    moved = false;
    card.setPointerCapture?.(event.pointerId);
  });

  card.addEventListener('pointermove', (event) => {
    if (!dragging) return;

    const dx = event.clientX - startX;
    const dy = event.clientY - startY;

    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) return;

    if (dx > 8 || opened) {
      moved = true;
      event.preventDefault();
      setOffset((opened ? 104 : 0) + dx, false);
    }
  });

  card.addEventListener('pointerup', (event) => {
    if (!dragging) return;

    dragging = false;
    card.releasePointerCapture?.(event.pointerId);

    if (offsetX > 52) openSwipe();
    else closeSwipe();

    window.setTimeout(() => {
      moved = false;
    }, 0);
  });

  card.addEventListener('pointercancel', () => {
    dragging = false;
    if (offsetX > 52) openSwipe();
    else closeSwipe();
  });

  deleteAction.addEventListener('click', async (event) => {
    event.stopPropagation();

    const ok = await showConfirm(`要清掉和「${character.name || '这个角色'}」的聊天记录吗？角色本身会留着。`);
    if (!ok) {
      closeSwipe();
      return;
    }

    await clearPrivateThread(character.id);
    hidePrivateThread(character.id);
    await loadListData();
    showToast('聊天记录清掉了');
    renderListPage();
  });

  outer.append(deleteAction, card);
  return outer;
}

function createGroupThreadCard(group) {
  const card = el('button', 'chat-thread-card chat-group-card');
  card.type = 'button';

  const avatar = createAvatar(group.avatar, group.name, 'md');
  const latest = latestGroupCache[group.id] || {};
  const unread = Number(groupUnreadCounts[group.id] || 0);
  const memberCount = normalizeArray(group.memberIds).length;

  const main = el('div', 'chat-thread-main');
  main.append(
    el('div', 'chat-thread-title', group.name || '未命名群聊'),
    el('div', 'chat-thread-preview', latest.preview || `${memberCount} 个成员在小群里`),
    el('div', 'chat-thread-meta', latest.time ? formatRelativeTime(latest.time) : '小群聊')
  );

  const right = el('div', 'chat-thread-right');
  if (unread > 0) {
    right.appendChild(el('span', 'chat-unread-badge', unread > 99 ? '99+' : String(unread)));
  }

  card.append(avatar, main, right);

  let pressTimer = 0;
  let longPressed = false;

  card.addEventListener('pointerdown', () => {
    longPressed = false;
    window.clearTimeout(pressTimer);
    pressTimer = window.setTimeout(() => {
      longPressed = true;
      openGroupSettingsSheet(group.id);
    }, 520);
  });

  card.addEventListener('pointerup', async () => {
    window.clearTimeout(pressTimer);

    if (longPressed) {
      longPressed = false;
      return;
    }

    markGroupRead(group.id);
    await appState?.openGroupThread?.(group.id);
  });

  card.addEventListener('pointercancel', () => {
    window.clearTimeout(pressTimer);
  });

  card.addEventListener('pointerleave', () => {
    window.clearTimeout(pressTimer);
  });

  return card;
}

async function clearPrivateThread(characterId) {
  const messages = await getByIndexDB('messages', 'characterId', characterId);
  for (const message of normalizeArray(messages)) {
    if (message?.id) await deleteDB('messages', message.id);
  }

  const cache = getData('chat_latest_cache') || {};
  delete cache[characterId];
  setData('chat_latest_cache', cache);

  const unread = getData('chat_unread_counts') || {};
  unread[characterId] = 0;
  setData('chat_unread_counts', unread);

  window.refreshDesktopBadges?.();
}

function markGroupRead(groupId) {
  const id = String(groupId || '').trim();
  if (!id) return;

  const unread = getData('chat_group_unread_counts') || {};
  unread[id] = 0;
  setData('chat_group_unread_counts', unread);

  groupUnreadCounts = unread;
  window.refreshDesktopBadges?.();
}

function handleSearchInput(query) {
  window.clearTimeout(searchTimer);

  const resultsBox = rootEl?.querySelector('#chat-list-search-results');
  if (!resultsBox) return;

  resultsBox.innerHTML = '';

  if (!query) {
    resultsBox.classList.remove('show');
    return;
  }

  resultsBox.classList.add('show');
  resultsBox.appendChild(el('div', 'chat-search-loading', '正在翻小纸条'));

  searchTimer = window.setTimeout(async () => {
    await renderSearchResults(query, resultsBox);
  }, 180);
}

async function renderSearchResults(query, resultsBox) {
  const q = String(query || '').trim().toLowerCase();

  resultsBox.innerHTML = '';

  if (!q) {
    resultsBox.classList.remove('show');
    return;
  }

  const results = [];

  characters.forEach((character) => {
    const text = `${character.name || ''} ${character.systemPrompt || ''} ${character.mood || ''}`.toLowerCase();
    if (text.includes(q)) {
      results.push({
        type: 'private',
        id: character.id,
        title: character.name || '未命名角色',
        desc: '名字或人设里有这个词',
        avatar: character.avatar || '',
        action: () => appState?.openPrivateThread?.(character.id)
      });
    }
  });

  groups.forEach((group) => {
    const memberNames = normalizeArray(group.memberIds)
      .map((id) => characters.find((item) => item.id === id)?.name || '')
      .join(' ');

    const text = `${group.name || ''} ${memberNames}`.toLowerCase();
    if (text.includes(q)) {
      results.push({
        type: 'group',
        id: group.id,
        title: group.name || '未命名群聊',
        desc: '群名或成员里有这个词',
        avatar: group.avatar || '',
        action: () => {
          markGroupRead(group.id);
          appState?.openGroupThread?.(group.id);
        }
      });
    }
  });

  await appendMessageSearchResults(q, results);
  await appendMemorySearchResults(q, results);

  if (!results.length) {
    resultsBox.appendChild(el('div', 'chat-search-empty', '没搜到，换个词再轻轻找找'));
    return;
  }

  results.slice(0, 18).forEach((result) => {
    resultsBox.appendChild(createSearchResultItem(result));
  });
}

async function appendMessageSearchResults(query, results) {
  const privateMessages = normalizeArray(await getAllDB('messages'));
  const groupMessages = normalizeArray(await getAllDB('group_messages'));

  const privateHitMap = new Map();
  privateMessages
    .filter((message) => String(message?.content || '').toLowerCase().includes(query))
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
    .forEach((message) => {
      if (!message.characterId || privateHitMap.has(message.characterId)) return;
      privateHitMap.set(message.characterId, message);
    });

  privateHitMap.forEach((message, characterId) => {
    const character = characters.find((item) => item.id === characterId);
    if (!character) return;

    results.push({
      type: 'message',
      id: message.id,
      title: character.name || '未命名角色',
      desc: getMessagePreview(message, true),
      avatar: character.avatar || '',
      action: () => appState?.openPrivateThread?.(character.id)
    });
  });

  const groupHitMap = new Map();
  groupMessages
    .filter((message) => String(message?.content || '').toLowerCase().includes(query))
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
    .forEach((message) => {
      if (!message.groupId || groupHitMap.has(message.groupId)) return;
      groupHitMap.set(message.groupId, message);
    });

  groupHitMap.forEach((message, groupId) => {
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;

    results.push({
      type: 'message',
      id: message.id,
      title: group.name || '未命名群聊',
      desc: getMessagePreview(message, true),
      avatar: group.avatar || '',
      action: () => {
        markGroupRead(group.id);
        appState?.openGroupThread?.(group.id);
      }
    });
  });
}

async function appendMemorySearchResults(query, results) {
  const memories = normalizeArray(await getAllDB('memories'))
    .filter((memory) => String(memory?.content || '').toLowerCase().includes(query))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const memoryHitMap = new Map();

  memories.forEach((memory) => {
    if (!memory.characterId || memoryHitMap.has(memory.characterId)) return;
    memoryHitMap.set(memory.characterId, memory);
  });

  memoryHitMap.forEach((memory, characterId) => {
    const character = characters.find((item) => item.id === characterId);
    if (!character) return;

    results.push({
      type: 'memory',
      id: memory.id,
      title: character.name || '未命名角色',
      desc: `记忆：${String(memory.content || '').slice(0, 42)}`,
      avatar: character.avatar || '',
      action: () => appState?.openPrivateThread?.(character.id)
    });
  });
}

function createSearchResultItem(result) {
  const item = el('button', 'chat-search-result-item');
  item.type = 'button';

  item.append(
    createAvatar(result.avatar, result.title, 'xs'),
    el('span', 'chat-search-result-text')
  );

  const text = item.querySelector('.chat-search-result-text');
  text.append(
    el('span', 'chat-search-result-title', result.title),
    el('span', 'chat-search-result-desc', result.desc)
  );

  item.addEventListener('click', () => result.action?.());
  return item;
}

async function openGroupCreateSheet() {
  await loadListData();

  if (!characters.length) {
    showToast('先创建几个角色吧');
    return;
  }

  const sheet = el('div', 'chat-list-sheet group-create-sheet');

  const head = el('div', 'chat-sheet-head');
  head.append(
    el('div', 'chat-sheet-title', '新建群聊'),
    el('div', 'chat-sheet-subtitle', '把喜欢的 TA 拉到一起，慢慢聊。')
  );

  const nameInput = input('群聊名字');
  nameInput.className = 'chat-input-card';

  const memberList = el('div', 'group-member-picker');

  characters.forEach((character) => {
    const row = createCheckRow(character.name || '未命名角色', getPromptPreview(character), false);
    row.dataset.characterId = character.id;
    row.prepend(createAvatar(character.avatar, character.name, 'xs'));
    memberList.appendChild(row);
  });

  const save = button('建好啦', 'primary', 'check');
  save.addEventListener('click', async () => {
    const memberIds = [...memberList.querySelectorAll('[data-character-id]')]
      .filter((row) => getSwitchValue(row))
      .map((row) => row.dataset.characterId);

    if (!memberIds.length) {
      showToast('至少选一个成员');
      return;
    }

    const group = {
      id: generateId(),
      name: nameInput.value.trim() || '新的小群',
      avatar: '',
      memberIds,
      createdAt: getNow(),
      updatedAt: getNow()
    };

    await setDB('groups', group.id, group);

    hideBottomSheet();
    currentTab = 'group';
    await loadListData();
    showToast('小群建好了');
    renderListPage();
  });

  sheet.append(head, formRow('群名', nameInput), memberList, save);
  showBottomSheet(sheet);
}

async function openGroupSettingsSheet(groupId) {
  await loadListData();

  const group = groups.find((item) => item.id === groupId) || await getDB('groups', groupId);
  if (!group) {
    showToast('这个群聊不见了');
    return;
  }

  const sheet = el('div', 'chat-list-sheet group-settings-sheet');

  const head = el('div', 'chat-sheet-head');
  head.append(
    el('div', 'chat-sheet-title', '群聊设置'),
    el('div', 'chat-sheet-subtitle', '名字和头像都可以轻轻换掉。')
  );

  const avatarPreview = createAvatar(group.avatar, group.name, 'lg');
  const avatarButton = button('更换群头像', 'ghost', 'camera');

  let nextAvatar = group.avatar || '';

  avatarButton.addEventListener('click', async () => {
    const file = await pickFile('image/*');
    if (!file) return;

    nextAvatar = await compressImage(file, 512, 0.85);
    avatarPreview.innerHTML = '';

    const img = document.createElement('img');
    img.src = nextAvatar;
    img.alt = '';
    avatarPreview.appendChild(img);
  });

  const nameInput = input('群聊名字');
  nameInput.className = 'chat-input-card';
  nameInput.value = group.name || '';

  const memberHint = el('div', 'group-setting-hint', `${normalizeArray(group.memberIds).length} 个成员在这里`);

  const save = button('保存群设置', 'primary', 'check');
  save.addEventListener('click', async () => {
    const next = {
      ...group,
      name: nameInput.value.trim() || group.name || '群聊',
      avatar: nextAvatar,
      updatedAt: getNow()
    };

    await setDB('groups', next.id, next);
    hideBottomSheet();
    await loadListData();
    showToast('群设置收好了');
    renderListPage();
  });

  sheet.append(head, avatarPreview, avatarButton, formRow('群名', nameInput), memberHint, save);
  showBottomSheet(sheet);
}

function getLatestTime(characterId) {
  return latestCache?.[characterId]?.time || '';
}

function getLatestGroupTime(groupId) {
  return latestGroupCache?.[groupId]?.time || '';
}

function getMessagePreview(message, full = false) {
  if (!message) return '';

  let text = '';

  if (message.type === 'image') text = '[图片]';
  else if (message.type === 'sticker') text = '[表情]';
  else if (message.type === 'transfer') text = `[转账 ${message.transferAmount || 0}]`;
  else if (message.type === 'tool') text = '[工具]';
  else text = String(message.content || '').replace(/\s+/g, ' ').trim();

  if (full) return text;
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

function getPromptPreview(character) {
  const prompt = String(character?.systemPrompt || '').replace(/\s+/g, ' ').trim();
  return prompt ? prompt.slice(0, 42) : '点进来和 TA 说句话';
}

function getMoodText(mood) {
  const text = String(mood || '').trim();
  return text || '安静等你';
}

function formatRelativeTime(time) {
  if (!time) return '';

  const date = new Date(time);
  const diff = Date.now() - date.getTime();

  if (Number.isNaN(diff)) return '';
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`;

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function getHiddenThreads() {
  const saved = getData(HIDDEN_THREADS_KEY);
  return Array.isArray(saved) ? saved : [];
}

function isPrivateThreadHidden(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return false;

  if (appState?.isPrivateThreadHidden) return appState.isPrivateThreadHidden(id);
  return getHiddenThreads().includes(id);
}

function hidePrivateThread(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  if (appState?.hidePrivateThread) {
    appState.hidePrivateThread(id);
    return;
  }

  const set = new Set(getHiddenThreads());
  set.add(id);
  setData(HIDDEN_THREADS_KEY, [...set]);
}

function createSegmented(options, value, onChange) {
  const wrap = el('div', 'chat-segmented');

  options.forEach((option) => {
    const btn = el('button', option.value === value ? 'active' : '', option.label);
    btn.type = 'button';
    btn.addEventListener('click', () => onChange(option.value));
    wrap.appendChild(btn);
  });

  return wrap;
}

function createSwitchRow(title, desc, checked = false) {
  const row = el('button', 'chat-switch-row');
  row.type = 'button';
  row.dataset.checked = checked ? 'true' : 'false';

  const text = el('span', 'chat-switch-text');
  text.append(
    el('span', 'chat-switch-title', title),
    el('span', 'chat-switch-desc', desc || '')
  );

  const track = el('span', 'chat-switch-track');
  track.appendChild(el('span', 'chat-switch-thumb'));

  row.append(text, track);

  row.addEventListener('click', () => {
    row.dataset.checked = row.dataset.checked === 'true' ? 'false' : 'true';
  });

  return row;
}

function createCheckRow(title, desc, checked = false) {
  return createSwitchRow(title, desc, checked);
}

function getSwitchValue(row) {
  return row?.dataset?.checked === 'true';
}

function createAvatar(src, name = '', size = 'md') {
  const avatar = el('span', `chat-avatar chat-avatar-${size}`);

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
  const btn = el('button', 'chat-icon-btn');
  btn.type = 'button';
  btn.setAttribute('aria-label', label || iconName);
  btn.appendChild(createIcon(iconName, 20));
  return btn;
}

function button(text, variant = 'ghost', iconName = '') {
  const btn = el('button', variant === 'primary' ? 'chat-primary-btn' : 'chat-ghost-btn');
  btn.type = 'button';

  if (iconName) btn.appendChild(createIcon(iconName, 16));
  btn.appendChild(el('span', '', text));

  return btn;
}

function input(placeholder = '') {
  const node = document.createElement('input');
  node.placeholder = placeholder;
  node.autocomplete = 'off';
  return node;
}

function formRow(label, control) {
  const row = el('label', 'chat-form-row');
  row.append(el('span', 'chat-form-label', label), control);
  return row;
}

function emptyState(title, desc) {
  const wrap = el('div', 'chat-empty');
  wrap.append(
    el('div', 'chat-empty-title', title),
    el('div', 'chat-empty-desc', desc)
  );
  return wrap;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function pickFile(accept = '') {
  return new Promise((resolve) => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = accept;
    fileInput.addEventListener('change', () => resolve(fileInput.files?.[0] || null), { once: true });
    fileInput.click();
  });
}

function injectStyle() {
  if (injectedStyle || document.getElementById(LIST_STYLE_ID)) {
    injectedStyle = true;
    return;
  }

  injectedStyle = true;

  const style = document.createElement('style');
  style.id = LIST_STYLE_ID;
  style.textContent = `
    .chat-list-page {
      background: var(--bg-primary);
    }

    .chat-list-content {
      padding: 20px;
    }

    .chat-list-wrap {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 100%;
    }

    .chat-list-search-box {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .chat-list-search-results {
      display: none;
      flex-direction: column;
      gap: 8px;
    }

    .chat-list-search-results.show {
      display: flex;
    }

    .chat-search-loading,
    .chat-search-empty {
      padding: 14px;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: 13px;
      line-height: 1.6;
    }

    .chat-search-result-item {
      width: 100%;
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 10px;
      align-items: center;
      padding: 12px;
      border: 0;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      text-align: left;
      transition: all 200ms ease;
    }

    .chat-search-result-item:active {
      transform: scale(0.96);
    }

    .chat-search-result-text {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .chat-search-result-title {
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chat-search-result-desc {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.45;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chat-segmented {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      padding: 6px;
      border-radius: var(--radius-lg);
      background: color-mix(in srgb, var(--bg-card) 74%, transparent);
      box-shadow: var(--shadow-sm);
    }

    .chat-segmented button {
      min-height: 38px;
      border: 0;
      border-radius: var(--radius-md);
      background: transparent;
      color: var(--text-secondary);
      font: inherit;
      transition: all 200ms ease;
    }

    .chat-segmented button.active {
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .chat-segmented button:active {
      transform: scale(0.96);
    }

    .chat-thread-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .chat-swipe-wrap {
      position: relative;
      overflow: hidden;
      border-radius: var(--radius-lg);
      isolation: isolate;
    }

    .chat-swipe-delete {
      position: absolute;
      inset: 0 auto 0 0;
      width: 96px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: var(--radius-lg);
      background: color-mix(in srgb, var(--accent) 18%, var(--bg-card));
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 13px;
    }

    .chat-thread-card {
      width: 100%;
      border: 0;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
      font: inherit;
      text-align: left;
    }

    .chat-private-card,
    .chat-group-card {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 14px;
    }

    .chat-private-card {
      position: relative;
      z-index: 1;
      touch-action: pan-y;
      will-change: transform;
    }

    .chat-private-card:active,
    .chat-group-card:active {
      transform: scale(0.98);
    }

    .chat-thread-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .chat-thread-title {
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chat-thread-preview,
    .chat-thread-meta {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.45;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chat-thread-meta {
      color: var(--text-hint);
    }

    .chat-thread-right {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      min-width: 28px;
    }

    .chat-unread-badge {
      min-width: 22px;
      height: 22px;
      padding: 0 7px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--accent);
      color: var(--bubble-user-text);
      font-size: 11px;
      line-height: 1;
    }

    .chat-list-sheet,
    .bottom-sheet .chat-list-sheet {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 4px 0 10px;
      color: var(--text-primary);
    }

    .chat-sheet-head,
    .bottom-sheet .chat-sheet-head {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 0 2px;
    }

    .chat-sheet-title,
    .bottom-sheet .chat-sheet-title {
      color: var(--text-primary);
      font-size: 17px;
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-sheet-subtitle,
    .bottom-sheet .chat-sheet-subtitle {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.6;
    }

    .group-member-picker,
    .bottom-sheet .group-member-picker {
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 42vh;
      overflow-y: auto;
      padding: 2px;
    }

    .group-setting-hint,
    .bottom-sheet .group-setting-hint {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.6;
      padding: 0 2px;
    }

    .chat-form-row,
    .bottom-sheet .chat-form-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .chat-form-label,
    .bottom-sheet .chat-form-label {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.4;
    }

    .chat-switch-row,
    .bottom-sheet .chat-switch-row {
      width: 100%;
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: 10px;
      align-items: center;
      padding: 12px;
      border: 0;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      text-align: left;
      transition: all 200ms ease;
    }

    .chat-switch-row:active,
    .bottom-sheet .chat-switch-row:active {
      transform: scale(0.96);
    }

    .chat-switch-text,
    .bottom-sheet .chat-switch-text {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .chat-switch-title,
    .bottom-sheet .chat-switch-title {
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chat-switch-desc,
    .bottom-sheet .chat-switch-desc {
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.45;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chat-switch-track,
    .bottom-sheet .chat-switch-track {
      width: 44px;
      height: 26px;
      padding: 3px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--text-hint) 20%, var(--bg-secondary));
      transition: all 200ms ease;
    }

    .chat-switch-thumb,
    .bottom-sheet .chat-switch-thumb {
      width: 20px;
      height: 20px;
      display: block;
      border-radius: 999px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .chat-switch-row[data-checked="true"] .chat-switch-track,
    .bottom-sheet .chat-switch-row[data-checked="true"] .chat-switch-track {
      background: var(--accent);
    }

    .chat-switch-row[data-checked="true"] .chat-switch-thumb,
    .bottom-sheet .chat-switch-row[data-checked="true"] .chat-switch-thumb {
      transform: translateX(18px);
    }

    .chat-avatar,
    .bottom-sheet .chat-avatar {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent-light) 42%, var(--bg-card));
      color: var(--accent-dark);
      font-weight: 600;
      box-shadow: var(--shadow-sm);
    }

    .chat-avatar img,
    .bottom-sheet .chat-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .chat-avatar-xs,
    .bottom-sheet .chat-avatar-xs {
      width: 28px;
      height: 28px;
      font-size: 12px;
    }

    .chat-avatar-md,
    .bottom-sheet .chat-avatar-md {
      width: 46px;
      height: 46px;
      font-size: 16px;
    }

    .chat-avatar-lg,
    .bottom-sheet .chat-avatar-lg {
      width: 72px;
      height: 72px;
      font-size: 24px;
      align-self: center;
    }

    @media (max-width: 680px) {
      .chat-list-content {
        padding-left: 20px;
        padding-right: 20px;
      }
    }
  `;

  document.head.appendChild(style);
}

// 改了什么：修复初始搜索重复触发，群聊设置改为长按进入，并补上 chat_group_unread_counts 的读取、显示和点开清零。
// 会不会影响其他文件：不会要求其他文件同步更新；如果后续要真正产生群聊未读，需要在生成群消息的文件里写入 chat_group_unread_counts。
// 更新记忆里该文件的导出函数：mountChatList(containerEl, options)
