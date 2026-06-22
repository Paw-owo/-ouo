// apps/chat.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getAllDB, getDB, setDB, deleteDB, getByIndexDB, compressImage
//   from '../core/api.js': streamMessage, silentRequest
//   from '../core/memory.js': buildMemoryPrompt, checkAndSummarize, checkImportantInfo
//   from '../core/tts.js': playTTS, stopAll
//   from '../core/mcp.js': getMcpServers, callMcpTool, buildMcpContext, listMcpTools
//   from '../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon

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
} from '../core/storage.js';

import { streamMessage, silentRequest } from '../core/api.js';

import {
  buildMemoryPrompt,
  checkAndSummarize,
  checkImportantInfo
} from '../core/memory.js';

import { playTTS, stopAll } from '../core/tts.js';

import {
  getMcpServers,
  callMcpTool,
  buildMcpContext,
  listMcpTools
} from '../core/mcp.js';

import {
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm,
  createIcon
} from '../core/ui.js';

const PAGE_SIZE = 50;
const PROACTIVE_SCAN_INTERVAL = 60 * 1000;
const ACTIVE_MODE2_INTERVAL = 45 * 1000;
const WEATHER_CACHE_TIME = 30 * 60 * 1000;
const MOMENT_COOLDOWN = 2 * 60 * 60 * 1000;
const TOKEN_STATS_KEY = 'chat_token_stats';
const USER_PROFILES_KEY = 'app_user_profiles';

const DEFAULT_CHAT_CONFIG = {
  endpointId: '',
  model: '',
  ttsEnabled: false,
  mcpEnabled: false,
  enabledMcpServerIds: [],
  streamEnabled: true,
  memoryEnabled: true,
  memoryHistoryEnabled: true,
  memorySummaryFrequency: 5,
  autoMomentEnabled: false,
  proactiveMode1Enabled: false,
  proactiveMode1Minutes: 30,
  proactiveMode2Enabled: false,
  proactiveMode2MinMinutes: 5,
  proactiveMode2MaxMinutes: 10,
  proactiveChance: 35,
  proactiveLastSentAt: null,
  proactiveAwaitingUserReply: false,
  readAt: null,
  tokenStatsEnabled: false
};

const DEFAULT_SETTINGS = {
  defaultApiEndpointId: '',
  defaultModel: '',
  bubbleMode: 'bubble',
  fontSize: 15,
  user: { name: '', avatar: '' },
  apiEndpoints: []
};

let rootEl = null;
let mountedContainer = null;
let characters = [];
let groups = [];
let stickers = [];
let currentTab = 'private';
let currentCharacter = null;
let currentGroup = null;
let currentMessages = [];
let visibleCount = PAGE_SIZE;
let isSending = false;
let activeTts = null;
let activeTtsMessageId = '';
let quotedMessage = null;
let mcpContextBuffer = '';
let injectedStyle = false;
let longPressTimer = null;
let proactiveTimer = null;
let mode2Timer = null;
let callTimer = null;
let callStartedAt = null;
let memorySheetState = null;
let thinkingStartAt = null;
let thinkingTotalMs = 0;
let thinkingStopped = false;

export async function mount(containerEl) {
  mountedContainer = containerEl;
  injectStyle();

  rootEl = el('section', 'app-screen chat-app');
  mountedContainer.innerHTML = '';
  mountedContainer.appendChild(rootEl);

  await loadBaseData();
  renderList();
  await scanProactiveAll();

  scheduleProactiveLoop();
  scheduleMode2Loop();

  document.addEventListener('visibilitychange', handleVisibilityChange);
}

export function unmount() {
  stopAll();
  stopActiveTts();
  hideBottomSheet();
  clearLongPress();
  clearCallTimer();
  clearMode2Timer();
  clearProactiveTimer();

  document.removeEventListener('visibilitychange', handleVisibilityChange);

  if (rootEl) rootEl.remove();
  if (mountedContainer) mountedContainer.innerHTML = '';

  rootEl = null;
  mountedContainer = null;
  characters = [];
  groups = [];
  stickers = [];
  currentCharacter = null;
  currentGroup = null;
  currentMessages = [];
  memorySheetState = null;
  quotedMessage = null;
  isSending = false;
  mcpContextBuffer = '';
  activeTtsMessageId = '';
}

export async function recordExternalInteraction({ characterId, role = 'assistant', content = '', source = '外部互动' } = {}) {
  const cleanCharacterId = String(characterId || '').trim();
  const cleanContent = String(content || '').trim();
  if (!cleanCharacterId || !cleanContent) return null;

  const character = await getDB('characters', cleanCharacterId);
  if (!character) return null;

  const message = createMessage({
    role: role === 'user' ? 'user' : 'assistant',
    content: `[${source || '外部互动'}] ${cleanContent}`,
    characterId: cleanCharacterId,
    type: 'text'
  });

  await setDB('messages', message.id, message);
  await updateLatestCache(cleanCharacterId);

  if (currentCharacter?.id === cleanCharacterId) {
    currentMessages.push(message);
    await markRead(cleanCharacterId);
    renderChatScreen();
  } else if (message.role === 'assistant') {
    addUnread(cleanCharacterId, 1);
    window.refreshDesktopBadges?.();
  }

  try {
    const recent = await getByIndexDB('messages', 'characterId', cleanCharacterId);
    await checkImportantInfo(cleanCharacterId, recent);
    await checkAndSummarize(cleanCharacterId);
  } catch (error) {
    console.warn('[chat] recordExternalInteraction failed', error);
  }

  return message;
}

async function loadBaseData() {
  characters = normalizeArray(await getAllDB('characters')).filter((item) => item?.id);
  groups = normalizeArray(await getAllDB('groups')).filter((item) => item?.id);
  stickers = normalizeArray(await getAllDB('stickers')).filter((item) => item?.id);
}

function renderList() {
  if (!rootEl) return;

  applyChatFontSize();
  stopAll();
  stopActiveTts();

  currentCharacter = null;
  currentGroup = null;
  currentMessages = [];
  visibleCount = PAGE_SIZE;
  quotedMessage = null;
  memorySheetState = null;

  rootEl.innerHTML = '';

  const nav = el('div', 'nav-bar');

  const backButton = iconButton('back', '返回');
  backButton.addEventListener('click', () => window.closeCurrentApp?.());

  const titleWrap = el('div', 'chat-nav-title');
  titleWrap.append(
    el('div', 'nav-title', '聊天'),
    el('div', 'nav-subtitle', '谁在偷偷想你')
  );

  const addButton = iconButton('add', '新建群聊');
  addButton.addEventListener('click', openGroupCreateSheet);

  nav.append(backButton, titleWrap, addButton);

  const content = el('div', 'content-area chat-list-area');
  const wrap = el('div', 'content-narrow chat-list-wrap');

  const searchInput = input('搜名字、消息或记忆');
  searchInput.className = 'input-card chat-search';
  const resultsBox = el('div', 'chat-search-results');
  searchInput.addEventListener('input', () => handleGlobalSearch(searchInput.value.trim(), resultsBox));

  const tabs = createSegmented(
    [
      { value: 'private', label: '私聊' },
      { value: 'group', label: '群聊' }
    ],
    currentTab,
    async (value) => {
      currentTab = value;
      await loadBaseData();
      renderList();
    }
  );

  const list = el('div', 'chat-thread-list');
  wrap.append(searchInput, tabs, resultsBox);

  if (currentTab === 'private') {
    if (!characters.length) {
      wrap.appendChild(emptyState('还没有角色', '先去角色应用捏一个 TA，再回来聊天。'));
    } else {
      characters
        .slice()
        .sort((a, b) => getLastMessageTime(b.id).localeCompare(getLastMessageTime(a.id)))
        .forEach((character) => list.appendChild(createPrivateThreadCard(character)));
      wrap.appendChild(list);
    }
  } else {
    if (!groups.length) {
      wrap.appendChild(emptyState('还没有群聊', '点右上角，拉几个 TA 坐下来聊聊。'));
    } else {
      groups
        .slice()
        .sort((a, b) => getLastGroupMessageTime(b.id).localeCompare(getLastGroupMessageTime(a.id)))
        .forEach((group) => list.appendChild(createGroupThreadCard(group)));
      wrap.appendChild(list);
    }
  }

  content.appendChild(wrap);
  rootEl.append(nav, content);
}

function createPrivateThreadCard(character) {
  const card = el('button', 'chat-thread-card');
  card.type = 'button';

  const avatar = createAvatar(character.avatar, character.name, 'md');
  const latest = getCachedLatestPreview(character.id);
  const unread = getUnreadCount(character.id);

  const main = el('div', 'chat-thread-main');
  main.append(
    el('div', 'chat-thread-title', character.name || '未命名角色'),
    el('div', 'chat-thread-preview', latest.preview || getPromptPreview(character)),
    el('div', 'chat-thread-meta', latest.time ? formatRelativeTime(latest.time) : getMoodText(character.mood))
  );

  const right = el('div', 'chat-thread-right');
  if (unread > 0) {
    const badge = el('span', 'badge', unread > 99 ? '99+' : String(unread));
    right.appendChild(badge);
  }

  card.append(avatar, main, right);
  card.addEventListener('click', () => openPrivateChat(character.id));
  return card;
}

function createGroupThreadCard(group) {
  const card = el('button', 'chat-thread-card');
  card.type = 'button';

  const avatar = createAvatar(group.avatar, group.name, 'md');
  const latest = getCachedLatestGroupPreview(group.id);

  const main = el('div', 'chat-thread-main');
  main.append(
    el('div', 'chat-thread-title', group.name || '未命名群聊'),
    el('div', 'chat-thread-preview', latest.preview || `${group.memberIds?.length || 0} 个成员`),
    el('div', 'chat-thread-meta', latest.time ? formatRelativeTime(latest.time) : '小群聊')
  );

  card.append(avatar, main, el('div', 'chat-thread-right'));
  card.addEventListener('click', () => openGroupChat(group.id));
  return card;
}

async function openPrivateChat(characterId) {
  await loadBaseData();

  const character = characters.find((item) => item.id === characterId) || await getDB('characters', characterId);
  if (!character) {
    showToast('这个角色不见了');
    renderList();
    return;
  }

  stopAll();
  stopActiveTts();

  currentCharacter = character;
  currentGroup = null;
  visibleCount = PAGE_SIZE;
  quotedMessage = null;
  mcpContextBuffer = '';
  memorySheetState = null;

  await markRead(characterId);
  await loadPrivateMessages(characterId);
  renderChatScreen();
  scheduleMode2();
}

async function openGroupChat(groupId) {
  await loadBaseData();

  const group = groups.find((item) => item.id === groupId) || await getDB('groups', groupId);
  if (!group) {
    showToast('这个群聊不见了');
    renderList();
    return;
  }

  stopAll();
  stopActiveTts();

  currentGroup = group;
  currentCharacter = null;
  visibleCount = PAGE_SIZE;
  quotedMessage = null;
  mcpContextBuffer = '';
  memorySheetState = null;

  await loadGroupMessages(groupId);
  renderChatScreen();
}

async function loadPrivateMessages(characterId) {
  currentMessages = (await getByIndexDB('messages', 'characterId', characterId))
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
}

async function loadGroupMessages(groupId) {
  currentMessages = (await getByIndexDB('group_messages', 'groupId', groupId))
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));
}

function renderChatScreen() {
  if (!rootEl) return;

  applyChatFontSize();

  const isGroup = Boolean(currentGroup);
  const settings = getSettings();
  const bubbleMode = settings.bubbleMode !== 'dialog';
  const title = isGroup ? currentGroup.name : currentCharacter.name;
  const avatar = isGroup ? currentGroup.avatar : currentCharacter.avatar;
  const subtitle = isGroup ? `${currentGroup.memberIds?.length || 0} 个成员` : getOnlineText();

  rootEl.innerHTML = '';

  const screen = el('section', 'chat-screen');
  screen.classList.toggle('bubble-mode', bubbleMode);
  screen.classList.toggle('dialog-mode', !bubbleMode);
  if (!isGroup) applyChatBackground(screen, currentCharacter);

  const nav = el('div', 'nav-bar chat-topbar');

  const backButton = iconButton('back', '返回');
  backButton.addEventListener('click', () => {
    stopAll();
    stopActiveTts();
    renderList();
  });

  const person = el('button', 'chat-person-head');
  person.type = 'button';
  person.append(createAvatar(avatar, title, 'sm'), el('span', 'chat-person-text'));
  person.querySelector('.chat-person-text').append(
    el('span', 'chat-person-name', title || '聊天'),
    el('span', 'chat-person-status', subtitle)
  );
  if (isGroup) person.addEventListener('click', openGroupSettingsSheet);

  const searchToggle = iconButton('search', '搜索对话');
  searchToggle.addEventListener('click', () => toggleChatSearchBar(screen));

  const phoneButton = iconButton('phone', '打电话');
  phoneButton.disabled = isGroup;
  phoneButton.addEventListener('click', openCallUI);

  const memoryButton = iconButton('more', '记忆系统');
  memoryButton.addEventListener('click', openMemoryPage);

  nav.append(backButton, person, searchToggle, phoneButton, memoryButton);

  const searchBar = el('div', 'chat-search-bar hidden');
  const chatSearchInput = input('搜这条对话');
  chatSearchInput.className = 'input-card chat-search-input';
  chatSearchInput.addEventListener('input', () => handleChatSearch(chatSearchInput.value.trim()));
  const searchClose = iconButton('close', '关闭搜索');
  searchClose.addEventListener('click', () => closeChatSearchBar(screen));
  searchBar.append(chatSearchInput, searchClose);

  const content = el('div', 'chat-messages-area');
  content.id = 'chat-messages-area';

  const messageList = el('div', 'message-list chat-message-list');
  messageList.id = 'chat-message-list';

  const visibleMessages = currentMessages.slice(Math.max(0, currentMessages.length - visibleCount));
  if (currentMessages.length > visibleCount) {
    const more = button('看看更早的', 'ghost', 'arrow-down');
    more.className += ' load-more-button';
    more.addEventListener('click', () => {
      visibleCount += PAGE_SIZE;
      renderChatScreen();
      requestAnimationFrame(() => document.getElementById('chat-messages-area')?.scrollTo({ top: 0 }));
    });
    messageList.appendChild(more);
  }

  visibleMessages.forEach((message) => messageList.appendChild(createMessageRow(message)));
  content.appendChild(messageList);

  const inputBar = createInputBar();
  screen.append(nav, searchBar, content, inputBar);
  rootEl.appendChild(screen);

  scrollToBottom(false);
}

function toggleChatSearchBar(screen) {
  if (!screen) return;
  const bar = screen.querySelector('.chat-search-bar');
  if (!bar) return;

  bar.classList.remove('hidden');
  screen.classList.add('search-open');
  requestAnimationFrame(() => bar.querySelector('.chat-search-input')?.focus());
}

function closeChatSearchBar(screen) {
  if (!screen) return;
  const bar = screen.querySelector('.chat-search-bar');
  if (!bar) return;

  bar.classList.add('hidden');
  screen.classList.remove('search-open');
  const inputEl = bar.querySelector('.chat-search-input');
  if (inputEl) inputEl.value = '';

  document.querySelectorAll('.chat-search-hit').forEach((node) => node.classList.remove('chat-search-hit'));
}

function handleChatSearch(query) {
  document.querySelectorAll('.chat-search-hit').forEach((node) => node.classList.remove('chat-search-hit'));
  if (!query) return;

  const match = currentMessages.find((message) => {
    const base = `${getSpeakerName(message.characterId)} ${getMessagePreview(message, true)}`.toLowerCase();
    return base.includes(query.toLowerCase());
  });

  if (!match) {
    showToast('没在这段对话里找到');
    return;
  }

  const node = document.querySelector(`[data-message-id="${match.id}"]`);
  if (node) {
    node.classList.add('chat-search-hit');
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function createMessageRow(message) {
  const isUser = message.role === 'user';
  const bubbleMode = getSettings().bubbleMode !== 'dialog';
  const userProfile = getCurrentUserDisplayProfile();

  const row = el('article', `message-row ${isUser ? 'user' : 'assistant'} ${message.type === 'tool' ? 'tool-message-row' : ''}`);
  row.dataset.messageId = message.id;

  const avatar = isUser
    ? createAvatar(userProfile.avatar, userProfile.name || '我', 'sm')
    : createAvatar(getSpeakerAvatar(message.characterId), getSpeakerName(message.characterId), 'sm');

  const body = el('div', 'message-body');
  body.appendChild(el('div', 'message-name', isUser ? (userProfile.name || '我') : getSpeakerName(message.characterId)));

  if (isUser) {
    if (message.type === 'image' && message.imageBase64) {
      const img = document.createElement('img');
      img.src = message.imageBase64;
      img.alt = '';
      img.className = 'message-image';
      body.appendChild(img);
      if (message.content) body.appendChild(renderRichText(message.content));
    } else if (message.type === 'sticker' && message.stickerId) {
      const sticker = stickers.find((item) => item.id === message.stickerId);
      if (sticker?.image) {
        const img = document.createElement('img');
        img.src = sticker.image;
        img.alt = '';
        img.className = 'message-sticker';
        body.appendChild(img);
      }
      if (message.content) body.appendChild(renderRichText(message.content));
    } else if (message.type === 'transfer') {
      body.appendChild(createTransferCard(message.transferAmount));
    } else {
      body.appendChild(createBubbleBlock(message.content || ''));
    }
  } else {
    const card = el('div', 'message-card');
    card.dataset.card = message.id;
    if (isMemoryToolOnlyMessage(message)) {
      card.classList.add('memory-tool-card');
      card.appendChild(createMemoryToolStatusLine(message));
    } else {
      appendAssistantCardLayers(card, message);
    }
    body.appendChild(card);
  }

  const config = getChatConfig(currentCharacter?.id || message.characterId);
  if (!isUser && config.tokenStatsEnabled) {
    const stats = getTokenStats(message.id);
    if (stats) body.appendChild(createTokenStats(stats));
  }

  body.appendChild(createMessageActions(message));

  const longPressTarget = body.querySelector('.message-card') || body.querySelector('.message-rich') || body;
  longPressTarget.addEventListener('pointerdown', () => {
    clearLongPress();
    longPressTimer = window.setTimeout(() => openMessageActions(message), 520);
  });
  longPressTarget.addEventListener('pointerup', clearLongPress);
  longPressTarget.addEventListener('pointercancel', clearLongPress);
  longPressTarget.addEventListener('pointerleave', clearLongPress);

  if (isUser) {
    row.append(body, avatar);
  } else {
    row.append(avatar, body);
  }

  row.classList.toggle('flat-message', !bubbleMode);
  return row;
}

function appendAssistantCardLayers(card, message) {
  const hasThinking = Boolean(message.thinking);
  const toolCalls = normalizeArray(message.toolCalls).filter((item) => item && item.toolName);
  const hasTools = toolCalls.length > 0;
  const contentText = String(message.content || '').trim();

  if (hasThinking || hasTools) {
    const metaCard = el('div', 'assistant-meta-card');
    if (hasThinking) metaCard.appendChild(createThinkingBlock(message.thinking, message.thinkingTimeMs));
    if (hasThinking && hasTools) metaCard.appendChild(createExecutionConnector());
    if (hasTools) metaCard.appendChild(createToolChainBlock(toolCalls));
    card.appendChild(metaCard);
  }

  if (contentText || message.type === 'image' || message.type === 'sticker' || message.type === 'transfer') {
    card.appendChild(createBubbleBlock(contentText, message));
  }
}

function createExecutionConnector() {
  const connector = el('div', 'execution-connector');
  connector.appendChild(el('span', 'execution-line'));
  return connector;
}

function createBubbleBlock(content, message = null) {
  const bubble = el('div', 'message-bubble');

  if (message?.type === 'image' && message.imageBase64) {
    const img = document.createElement('img');
    img.src = message.imageBase64;
    img.alt = '';
    img.className = 'message-image';
    bubble.appendChild(img);
    if (content) bubble.appendChild(renderRichText(content));
    return bubble;
  }

  if (message?.type === 'sticker' && message.stickerId) {
    const sticker = stickers.find((item) => item.id === message.stickerId);
    if (sticker?.image) {
      const img = document.createElement('img');
      img.src = sticker.image;
      img.alt = '';
      img.className = 'message-sticker';
      bubble.appendChild(img);
    }
    if (content) bubble.appendChild(renderRichText(content));
    return bubble;
  }

  if (message?.type === 'transfer') {
    bubble.appendChild(createTransferCard(message.transferAmount));
    return bubble;
  }

  if (content) bubble.appendChild(renderRichText(content));
  return bubble;
}

function isMemoryToolOnlyMessage(message) {
  if (message.role !== 'assistant') return false;
  if (message.type !== 'tool') return false;

  const toolCalls = normalizeArray(message.toolCalls);
  if (!toolCalls.length) return false;

  return toolCalls.every((toolCall) => isMemoryToolCall(toolCall));
}

function createMemoryToolStatusLine(message) {
  const toolCalls = normalizeArray(message.toolCalls);
  const first = toolCalls[0] || {};

  const row = el('div', 'memory-tool-status');
  row.append(
    createToolStatusIcon(first.status || 'done', first),
    el('span', 'memory-tool-status-text', getMemoryToolSummary(first))
  );

  return row;
}

function getMemoryToolSummary(toolCall) {
  const action = getMemoryActionName(toolCall.toolName);
  if (toolCall.status === 'running') return `正在处理：${action}`;
  if (toolCall.status === 'error') return `处理失败：${action}`;
  return `处理完成：${action}`;
}

function getMemoryActionName(toolName) {
  const text = String(toolName || '');
  if (text.includes('删除')) return '删除记忆';
  if (text.includes('编辑')) return '编辑记忆';
  return '写入记忆';
}

function isMemoryToolCall(toolCall) {
  if (!toolCall) return false;
  if (toolCall.serverId === 'memory') return true;
  if (toolCall.serverName === '记忆系统') return true;
  return String(toolCall.toolName || '').includes('记忆');
}

function renderRichText(text) {
  const wrap = el('div', 'message-rich');
  const parts = String(text || '').split(/```/);

  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      wrap.appendChild(createCodeBlock(part));
      return;
    }

    if (part) {
      const lines = part.split('\n');
      lines.forEach((line, lineIndex) => {
        if (lineIndex > 0) wrap.appendChild(document.createElement('br'));
        wrap.appendChild(document.createTextNode(line));
      });
    }
  });

  return wrap;
}

function createCodeBlock(raw) {
  const details = document.createElement('details');
  details.className = 'code-fold-card';

  const summary = document.createElement('summary');
  summary.className = 'code-fold-summary';

  const firstLine = String(raw || '').split('\n')[0] || '';
  const hasLang = firstLine.length < 24 && /^[a-zA-Z0-9_-]+$/.test(firstLine.trim());
  const lang = hasLang ? firstLine.trim() : 'code';
  const content = hasLang ? String(raw).split('\n').slice(1).join('\n') : String(raw || '');

  summary.append(createIcon('copy', 16), el('span', '', `代码 · ${lang}`), createIcon('arrow-down', 16));

  const copy = el('button', 'code-block-copy', '复制代码');
  copy.type = 'button';
  copy.addEventListener('click', async (event) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(content);
      copy.textContent = '复制好了';
      window.setTimeout(() => copy.textContent = '复制代码', 1000);
    } catch (_) {
      showToast('复制没有成功');
    }
  });

  const pre = el('pre', 'code-block');
  const code = el('code');
  code.textContent = content;
  pre.append(copy, code);

  details.append(summary, pre);
  return details;
}

function createThinkingBlock(text, timeMs) {
  const normalized = normalizeThinkingText(text);
  const details = document.createElement('details');
  details.className = 'thinking-block';

  const summary = document.createElement('summary');
  summary.className = 'thinking-summary';

  const titleLine = el('div', 'thinking-title-line');
  titleLine.append(
    createChatSvgIcon('lightbulb', 16),
    el('span', 'thinking-title', normalized.length > 260 ? '深度思考' : '思考'),
    el('span', 'thinking-time', formatThinkingTime(timeMs))
  );

  const summaryText = el('div', 'thinking-summary-text', summarizeThinking(normalized));
  const arrow = createIcon('arrow-down', 16);

  const content = el('div', 'thinking-content', normalized || 'TA 正在整理思路');

  summary.append(titleLine, summaryText, arrow);
  details.append(summary, content);
  return details;
}

function normalizeThinkingText(text) {
  const raw = String(text || '').replace(/\r/g, '\n').trim();
  if (!raw) return '';

  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  const singleCharLike = lines.length >= 8 && lines.filter((line) => line.length <= 3).length / lines.length > 0.6;

  if (singleCharLike) {
    return lines.join('').replace(/[。！？；,.;:!?]\s*/g, '$1\n').replace(/\n{2,}/g, '\n').trim();
  }

  return raw.replace(/\n{3,}/g, '\n\n').replace(/[ \t]{2,}/g, ' ').trim();
}

function summarizeThinking(text) {
  const clean = normalizeThinkingText(text).replace(/[`*_>#{}\[\]]/g, '').replace(/\s+/g, ' ').trim();
  if (!clean || clean.length < 4) return 'TA 正在整理思路';
  return `TA 在想：${clean.slice(0, 34)}${clean.length > 34 ? '…' : ''}`;
}

function formatThinkingTime(ms) {
  const value = Number(ms) || 0;
  if (value <= 0 && !thinkingStartAt) return '';
  if (value <= 0) return '';
  return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${value}ms`;
}

function createToolChainBlock(toolCalls) {
  const wrap = el('div', 'tool-chain-block');

  toolCalls.forEach((toolCall, index) => {
    if (index > 0) wrap.appendChild(createExecutionConnector());
    wrap.appendChild(createToolCallCard(toolCall));
  });

  return wrap;
}

function createToolCallCard(toolCall) {
  const details = document.createElement('details');
  details.className = `tool-call-card tool-status-${toolCall.status || 'done'}`;

  const summary = document.createElement('summary');
  summary.className = 'tool-call-summary';

  const icon = createToolStatusIcon(toolCall.status, toolCall);
  const title = el('span', 'tool-call-title', getToolCallTitle(toolCall));
  const desc = el('span', 'tool-call-desc', getToolCallDesc(toolCall));
  const arrow = createIcon('arrow-down', 16);

  summary.append(icon, title, desc, arrow);

  const content = el('div', 'tool-call-content');
  if (isMemoryToolCall(toolCall)) {
    content.appendChild(createSoftNote('记忆内容不在聊天里展示。请到记忆管理页面查看。'));
  } else {
    content.append(
      createToolMetaLine('输入', stringifyCompact(toolCall.arguments)),
      createToolMetaLine('结果', stringifyCompact(toolCall.result))
    );
  }

  details.append(summary, content);
  return details;
}

function createToolStatusIcon(status, toolCall = null) {
  const box = el('span', 'tool-status-icon');
  if (status === 'done') {
    box.appendChild(createIcon('check', 15));
    return box;
  }

  if (status === 'running') {
    box.appendChild(createIcon('refresh', 15));
    return box;
  }

  if (status === 'error') {
    box.appendChild(createIcon('clear', 15));
    return box;
  }

  box.appendChild(createChatSvgIcon(getToolIconName(toolCall), 15));
  return box;
}

function getToolIconName(toolCall) {
  if (isMemoryToolCall(toolCall)) return 'notebook';
  const text = `${toolCall?.toolName || ''} ${toolCall?.serverName || ''}`.toLowerCase();
  if (text.includes('file') || text.includes('document') || text.includes('文档') || text.includes('文件')) return 'file';
  return 'wrench';
}

function getToolCallTitle(toolCall) {
  if (isMemoryToolCall(toolCall)) return getMemoryActionName(toolCall.toolName);
  return toolCall.toolName || '工具';
}

function getToolCallDesc(toolCall) {
  if (isMemoryToolCall(toolCall)) return getMemoryToolSummary(toolCall);
  if (toolCall.status === 'running') return '正在处理';
  if (toolCall.status === 'error') return '处理失败';
  return toolCall.serverName || '处理完成';
}

function createToolMetaLine(label, value) {
  const wrap = el('div', 'tool-meta-line');
  wrap.append(el('div', 'tool-meta-label', label), el('pre', 'tool-meta-value', value || '暂无'));
  return wrap;
}

function stringifyCompact(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'string') return value.length > 1200 ? `${value.slice(0, 1200)}…` : value;

  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > 1600 ? `${text.slice(0, 1600)}…` : text;
  } catch (_) {
    return String(value);
  }
}

