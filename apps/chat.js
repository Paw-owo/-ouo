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
let keyboardViewportRaf = 0;

export async function mount(containerEl) {
  mountedContainer = containerEl;
  injectStyle();

  rootEl = el('section', 'app-screen chat-app');
  mountedContainer.innerHTML = '';
  mountedContainer.appendChild(rootEl);

  setupKeyboardViewport();

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
  cleanupKeyboardViewport();

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
  updateKeyboardViewport();

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
  let raw = String(text || '').replace(/\r/g, '\n').trim();
  if (!raw) return '';

  raw = raw
    .replace(/<thinking>/gi, '')
    .replace(/<\/thinking>/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const lines = raw.split('\n').map((line) => line.trim()).filter(Boolean);

  if (lines.length >= 4) {
    const shortRatio = lines.filter((line) => line.length <= 8).length / lines.length;
    const avgLen = lines.reduce((sum, line) => sum + line.length, 0) / lines.length;

    if (shortRatio > 0.45 || avgLen < 11) {
      raw = lines.join('');
    } else {
      raw = lines.join('\n');
    }
  }

  raw = raw
    .replace(/([。！？；!?;])(?=\S)/g, '$1\n')
    .replace(/，\n/g, '，')
    .replace(/、\n/g, '、')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const finalLines = raw.split('\n').map((line) => line.trim()).filter(Boolean);
  if (finalLines.length >= 6 && finalLines.filter((line) => line.length <= 10).length / finalLines.length > 0.5) {
    return finalLines.join('').replace(/([。！？；!?;])(?=\S)/g, '$1\n').trim();
  }

  return raw;
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

  if (isMemoryToolCall(toolCall)) {
    box.appendChild(createChatSvgIcon('notebook', 15));
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
function createInputBar() {
  const bar = el('div', 'chat-input-bar');

  const plusButton = iconButton('add', '小工具');
  plusButton.addEventListener('click', openToolSheet);

  const wrap = el('div', 'chat-input-wrap');
  const quoteBox = createQuotePreview();
  const quickBar = createQuickReplyBar();

  const textareaEl = document.createElement('textarea');
  textareaEl.className = 'chat-input';
  textareaEl.placeholder = currentGroup ? '给大家发句话' : '想和 TA 说什么';
  textareaEl.rows = 1;

  textareaEl.addEventListener('input', () => {
    textareaEl.style.height = 'auto';
    textareaEl.style.height = `${Math.min(132, textareaEl.scrollHeight)}px`;
  });

  textareaEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendCurrentText(textareaEl);
    }
  });

  if (quoteBox) wrap.appendChild(quoteBox);
  wrap.append(quickBar, textareaEl);

  const sendButton = iconButton('send', '发送');
  sendButton.classList.add('accent');
  sendButton.addEventListener('click', () => sendCurrentText(textareaEl));

  bar.append(plusButton, wrap, sendButton);
  return bar;
}

function createQuotePreview() {
  if (!quotedMessage) return null;

  const box = el('div', 'quote-preview');
  const speaker = quotedMessage.role === 'user' ? '我' : getSpeakerName(quotedMessage.characterId);
  const close = iconButton('close', '取消引用');
  close.addEventListener('click', () => {
    quotedMessage = null;
    renderChatScreen();
  });

  box.append(el('div', 'quote-preview-text', `${speaker}：${getMessagePreview(quotedMessage)}`), close);
  return box;
}

function createQuickReplyBar() {
  const box = el('details', 'quick-reply-box');
  const replies = currentCharacter?.quickReplies || [];
  if (!replies.length || currentGroup) return box;

  const summary = document.createElement('summary');
  summary.textContent = '快捷小句子';

  const list = el('div', 'quick-reply-list');
  replies.slice(0, 8).forEach((reply) => {
    const item = el('button', 'quick-reply-chip', reply);
    item.type = 'button';
    item.addEventListener('click', () => sendText(reply));
    list.appendChild(item);
  });

  box.append(summary, list);
  return box;
}

async function sendCurrentText(textareaEl) {
  const text = textareaEl.value.trim();
  if (!text) return;

  textareaEl.value = '';
  textareaEl.style.height = 'auto';
  await sendText(text);
}

async function sendText(text) {
  if (isSending) {
    showToast('TA 正在回你');
    return;
  }

  const finalText = buildQuotedContent(text);
  if (currentGroup) {
    await sendGroupMessage(finalText);
    return;
  }

  if (!currentCharacter) return;

  const userMessage = createMessage({
    role: 'user',
    content: finalText,
    characterId: currentCharacter.id,
    type: 'text'
  });

  quotedMessage = null;
  await setDB('messages', userMessage.id, userMessage);
  currentMessages.push(userMessage);

  const config = getChatConfig(currentCharacter.id);
  config.proactiveAwaitingUserReply = false;
  saveChatConfig(currentCharacter.id, config);

  await markRead(currentCharacter.id);
  renderChatScreen();
  await generateAssistantReply();
}

function buildQuotedContent(text) {
  if (!quotedMessage) return text;

  const quoteText = getMessagePreview(quotedMessage, true).slice(0, 300);
  const speaker = quotedMessage.role === 'user' ? '我' : getSpeakerName(quotedMessage.characterId);

  return `引用${speaker}的消息：${quoteText}\n我的回复：${text}`;
}

async function sendGroupMessage(text) {
  if (!currentGroup || isSending) return;

  const userMessage = createMessage({
    role: 'user',
    content: text,
    characterId: 'user',
    groupId: currentGroup.id,
    type: 'text'
  });

  quotedMessage = null;
  await setDB('group_messages', userMessage.id, userMessage);
  currentMessages.push(userMessage);
  await updateLatestGroupCache(currentGroup.id);
  renderChatScreen();

  await replyGroupMembers();
}

async function replyGroupMembers() {
  if (!currentGroup || isSending) return;

  const memberIds = normalizeArray(currentGroup.memberIds);
  const members = shuffleArray(memberIds)
    .map((id) => characters.find((character) => character.id === id))
    .filter(Boolean);

  if (!members.length) {
    showToast('群里还没有能回复的角色');
    return;
  }

  isSending = true;

  try {
    const replyCount = Math.min(members.length, Math.max(1, Math.ceil(Math.random() * Math.min(2, members.length))));
    const speakers = members.slice(0, replyCount);

    for (const character of speakers) {
      showTypingPreview(character.id, character.name);
      await delay(700 + Math.random() * 1200);
      await generateGroupAssistantReply(character);
    }
  } finally {
    isSending = false;
    renderChatScreen();
  }
}

function showTypingPreview(characterId, name) {
  const tempId = `typing_${characterId}`;
  if (document.querySelector(`[data-message-id="${tempId}"]`)) return;

  const row = el('article', 'message-row assistant typing-row');
  row.dataset.messageId = tempId;

  row.append(
    createAvatar(getSpeakerAvatar(characterId), name, 'sm'),
    el('div', 'message-body', el('div', 'message-name', name || 'AI'), el('div', 'typing-dots', el('span'), el('span'), el('span')))
  );

  const list = document.getElementById('chat-message-list');
  if (list) {
    list.appendChild(row);
    scrollToBottom(true);
  }
}

async function generateAssistantReply(extraInstruction = '') {
  if (!currentCharacter || isSending) return;

  isSending = true;

  const characterId = currentCharacter.id;
  const config = getChatConfig(characterId);

  const assistantMessage = createMessage({
    role: 'assistant',
    content: '',
    thinking: '',
    characterId,
    type: 'text'
  });

  currentMessages.push(assistantMessage);
  renderChatScreen();
  showTyping(assistantMessage.id);

  const contextMessages = currentMessages
    .filter((message) => message.id !== assistantMessage.id)
    .slice(-30)
    .map(toApiMessage);

  const systemPrompt = await buildSystemPrompt(currentCharacter, config, extraInstruction);
  const tokenInput = estimateTokens(systemPrompt + '\n' + contextMessages.map((item) => item.content).join('\n'));

  let finalContent = '';
  let finalThinking = '';

  startThinkingTimer();

  if (config.streamEnabled !== false) {
    await streamMessage({
      messages: contextMessages,
      systemPrompt,
      endpointId: resolveEndpointId(currentCharacter, config),
      model: resolveModel(currentCharacter, config),
      temperature: 0.8,
      onChunk: (chunk) => {
        finalContent += chunk.content || '';
        finalThinking += chunk.thinking ? `\n${chunk.thinking}` : '';

        assistantMessage.content = finalContent;
        assistantMessage.thinking = normalizeThinkingText(finalThinking) || null;
        renderMessagePatch(assistantMessage);
      },
      onDone: async ({ content, thinking }) => {
        assistantMessage.content = content || finalContent || '我刚才有点走神了，你再和我说一次好吗？';
        assistantMessage.thinking = normalizeThinkingText(thinking || finalThinking) || null;
      },
      onError: () => {
        assistantMessage.content = assistantMessage.content || '刚才有点卡住，再试一次好吗？';
      }
    });
  } else {
    const content = await silentRequest({
      messages: contextMessages,
      systemPrompt,
      endpointId: resolveEndpointId(currentCharacter, config),
      model: resolveModel(currentCharacter, config),
      temperature: 0.8
    });
    assistantMessage.content = content || '刚才有点卡住，再试一次好吗？';
  }

  stopThinkingTimer();
  assistantMessage.thinkingTimeMs = getThinkingTimeMs();

  await setDB('messages', assistantMessage.id, assistantMessage);
  saveTokenStats(assistantMessage.id, {
    input: tokenInput,
    output: estimateTokens(assistantMessage.content || ''),
    total: tokenInput + estimateTokens(assistantMessage.content || ''),
    timestamp: getNow()
  });

  currentMessages = currentMessages.map((message) => message.id === assistantMessage.id ? assistantMessage : message);

  await updateLatestCache(characterId);
  await afterAssistantReply(characterId, assistantMessage);
  await markRead(characterId);

  isSending = false;
  renderChatScreen();

  if (config.ttsEnabled && currentCharacter.ttsConfig?.enabled) {
    stopActiveTts();
    activeTts = playTTS(assistantMessage.content, currentCharacter.ttsConfig);
    activeTtsMessageId = assistantMessage.id;
  }

  scheduleMode2();
}

async function generateGroupAssistantReply(character) {
  if (!currentGroup || !character) return;

  const assistantMessage = createMessage({
    role: 'assistant',
    content: '',
    thinking: '',
    characterId: character.id,
    groupId: currentGroup.id,
    type: 'text'
  });

  currentMessages = currentMessages.filter((message) => message.id !== `typing_${character.id}`);
  currentMessages.push(assistantMessage);
  renderChatScreen();
  showTyping(assistantMessage.id);

  const contextMessages = currentMessages
    .filter((message) => message.id !== assistantMessage.id)
    .slice(-28)
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: `${getSpeakerName(message.characterId)}：${getMessagePreview(message, true)}`
    }));

  const config = getChatConfig(character.id);
  const systemPrompt = await buildSystemPrompt(
    character,
    config,
    `你正在群聊「${currentGroup.name || '群聊'}」里回复。你只能扮演自己：${character.name || 'AI'}。不要替其他成员说话。回复要自然、短一点，可以回应用户，也可以接其他角色的话。`
  );

  const tokenInput = estimateTokens(systemPrompt + '\n' + contextMessages.map((item) => item.content).join('\n'));
  let finalContent = '';
  let finalThinking = '';

  startThinkingTimer();

  if (config.streamEnabled !== false) {
    await streamMessage({
      messages: contextMessages,
      systemPrompt,
      endpointId: resolveEndpointId(character, config),
      model: resolveModel(character, config),
      temperature: 0.85,
      onChunk: (chunk) => {
        finalContent += chunk.content || '';
        finalThinking += chunk.thinking ? `\n${chunk.thinking}` : '';

        assistantMessage.content = finalContent;
        assistantMessage.thinking = normalizeThinkingText(finalThinking) || null;
        renderMessagePatch(assistantMessage);
      },
      onDone: async ({ content, thinking }) => {
        assistantMessage.content = content || finalContent || '我先听着。';
        assistantMessage.thinking = normalizeThinkingText(thinking || finalThinking) || null;
      },
      onError: () => {
        assistantMessage.content = assistantMessage.content || '我刚刚卡了一下。';
      }
    });
  } else {
    const content = await silentRequest({
      messages: contextMessages,
      systemPrompt,
      endpointId: resolveEndpointId(character, config),
      model: resolveModel(character, config),
      temperature: 0.85
    });

    assistantMessage.content = content || '我先听着。';
  }

  stopThinkingTimer();
  assistantMessage.thinkingTimeMs = getThinkingTimeMs();

  await setDB('group_messages', assistantMessage.id, assistantMessage);
  saveTokenStats(assistantMessage.id, {
    input: tokenInput,
    output: estimateTokens(assistantMessage.content || ''),
    total: tokenInput + estimateTokens(assistantMessage.content || ''),
    timestamp: getNow()
  });

  currentMessages = currentMessages.map((message) => message.id === assistantMessage.id ? assistantMessage : message);
  await updateLatestGroupCache(currentGroup.id);

  if (config.ttsEnabled && character.ttsConfig?.enabled) {
    stopActiveTts();
    activeTts = playTTS(assistantMessage.content, character.ttsConfig);
    activeTtsMessageId = assistantMessage.id;
  }

  renderChatScreen();
}

async function afterAssistantReply(characterId, assistantMessage) {
  try {
    const beforeMemories = await getByIndexDB('memories', 'characterId', characterId);

    await checkAndSummarize(characterId);
    await checkImportantInfo(characterId, currentMessages);

    const afterMemories = await getByIndexDB('memories', 'characterId', characterId);
    const beforeIds = new Set(beforeMemories.map((item) => item.id));
    afterMemories
      .filter((item) => !beforeIds.has(item.id))
      .forEach((memory) => {
        appendMemoryToolMessage(characterId, memory, '写入记忆');
      });

    await maybeAutoMoment(characterId, assistantMessage);
  } catch (error) {
    console.warn('[chat] background tasks failed', error);
  }
}

async function appendMemoryToolMessage(characterId, memory, actionName = '记忆更新') {
  const toolCall = {
    id: generateId(),
    serverId: 'memory',
    serverName: '记忆系统',
    toolName: actionName,
    arguments: { characterId },
    result: '',
    status: 'done',
    timestamp: getNow()
  };

  const message = createMessage({
    role: 'assistant',
    content: '',
    characterId,
    type: 'tool'
  });

  message.toolCalls = [toolCall];
  await setDB('messages', message.id, message);

  if (currentCharacter?.id === characterId) {
    currentMessages.push(message);
  }
}

async function buildSystemPrompt(character, config, extraInstruction = '') {
  const parts = [];

  parts.push(character.systemPrompt || `你是${character.name || 'AI'}，请用自然、贴近关系的方式和用户聊天。`);

  const userProfile = buildUserProfilePrompt(character);
  if (userProfile) parts.push(userProfile);

  const worldbook = await buildWorldbookPrompt(character);
  if (worldbook) parts.push(worldbook);

  const inventory = await buildInventoryPrompt();
  if (inventory) parts.push(inventory);

  if (config.memoryEnabled !== false) {
    const memory = await buildMemoryPrompt(character.id);
    if (memory) parts.push(memory);
  }

  const weather = await getWeatherPrompt();
  if (weather) parts.push(weather);

  const moments = await buildRecentMomentsPrompt();
  if (moments) parts.push(moments);

  const anniversaries = buildAnniversaryPrompt();
  if (anniversaries) parts.push(anniversaries);

  const intimacy = await buildIntimacyPrompt(character.id);
  if (intimacy) parts.push(intimacy);

  if (mcpContextBuffer) parts.push(mcpContextBuffer);

  parts.push(buildTimePrompt());

  if (config.memoryHistoryEnabled === false) {
    parts.push('[记忆规则]\n当前对话关闭了参考历史聊天记录，请主要根据长期记忆和当前上下文回答。');
  }

  if (extraInstruction) parts.push(`[额外要求]\n${extraInstruction}`);

  return parts.filter(Boolean).join('\n\n');
}

function openToolSheet() {
  const sheet = el('div', 'tool-sheet');

  const pages = el('div', 'tool-pages');

  const pageOne = el('div', 'tool-page');
  pageOne.appendChild(createToolGrid([
    { icon: 'phone', label: '打电话', action: openCallUI },
    { icon: 'image', label: '发图片', action: openImagePicker },
    { icon: 'smile', label: '表情包', action: openStickerPanel },
    { icon: 'transfer', label: '转账', action: openTransferSheet },
    { icon: 'mcp', label: 'MCP工具', action: openMcpPanel },
    { icon: 'settings', label: '聊天开关', action: openConfigSheet }
  ]));

  const pageTwo = el('div', 'tool-page');
  pageTwo.appendChild(createToolGrid([
    { icon: 'clear', label: '清临时纸条', action: clearContext },
    { icon: 'delete', label: '清掉聊天', action: clearAllMessages },
    { icon: 'copy', label: '导出文本', action: exportChatText },
    { icon: 'refresh', label: '主动检查', action: () => scanProactiveAll() },
    { icon: 'eye', label: '当前资料', action: showCurrentInfoSheet },
    { icon: 'memory', label: '记忆系统', action: openMemoryPage }
  ]));

  pages.append(pageOne, pageTwo);

  sheet.append(
    el('div', 'sheet-title', '小工具'),
    el('div', 'sheet-description', '左右滑一下，还有另一页。'),
    pages
  );

  showBottomSheet(sheet);
}

function createToolGrid(items) {
  const grid = el('div', 'tool-grid');

  items.forEach((item) => {
    const buttonEl = el('button', 'tool-item');
    buttonEl.type = 'button';
    buttonEl.append(createIcon(item.icon, 22), el('span', '', item.label));
    buttonEl.addEventListener('click', () => {
      hideBottomSheet();
      window.setTimeout(item.action, 180);
    });
    grid.appendChild(buttonEl);
  });

  return grid;
}

async function openMemoryPage() {
  if (!currentCharacter) {
    showToast('群聊先不单独记忆');
    return;
  }

  hideBottomSheet();

  const config = getChatConfig(currentCharacter.id);

  const page = el('section', 'memory-page');
  const nav = el('div', 'memory-page-nav');
  const back = iconButton('back', '返回聊天');
  back.addEventListener('click', () => page.remove());
  nav.append(back, el('div', 'memory-page-title', '记忆'));

  const area = el('div', 'memory-page-area');

  const configCard = el('div', 'memory-config-card');
  configCard.append(
    memorySettingRow('memory', '记忆', '', switchButton(config.memoryEnabled !== false, (active) => {
      config.memoryEnabled = active;
      saveChatConfig(currentCharacter.id, config);
    })),
    memorySettingRow('refresh', '参考历史聊天记录', '', switchButton(config.memoryHistoryEnabled !== false, (active) => {
      config.memoryHistoryEnabled = active;
      saveChatConfig(currentCharacter.id, config);
    })),
    createFrequencyBlock(config)
  );

  const head = el('div', 'memory-manage-head');
  const add = button('添加记忆', 'ghost', 'add');
  add.addEventListener('click', () => openMemoryEditor(null, listEl));
  head.append(el('div', 'memory-manage-title', '管理记忆'), add);

  const listEl = el('div', 'memory-manager-list');

  area.append(configCard, head, listEl);
  page.append(nav, area);
  rootEl.appendChild(page);

  await renderMemoryManager(listEl);
}

function memorySettingRow(icon, title, desc, control) {
  const row = el('div', 'memory-setting-row');
  const iconBox = el('div', 'memory-setting-icon');
  iconBox.appendChild(createIcon(icon, 22));

  const text = el('div', 'memory-setting-text');
  text.append(el('div', 'memory-setting-title', title));
  if (desc) text.append(el('div', 'memory-setting-desc', desc));

  row.append(iconBox, text, control);
  return row;
}

function createFrequencyBlock(config) {
  const wrap = el('div', 'memory-frequency-block');
  const top = el('div', 'memory-frequency-title');
  top.append(createIcon('refresh', 22), el('div', '', '摘要更新频率'));

  const desc = el('div', 'memory-frequency-desc', '累计达到所选条数的新消息后，会更新历史聊天摘要。');
  const chips = el('div', 'frequency-chips');

  [1, 3, 5, 10, 20, 50].forEach((num) => {
    const chip = el('button', 'frequency-chip', `每 ${num} 条`);
    chip.type = 'button';
    chip.classList.toggle('active', Number(config.memorySummaryFrequency || 5) === num);
    chip.addEventListener('click', () => {
      config.memorySummaryFrequency = num;
      config.memoryTriggerCount = num;
      saveChatConfig(currentCharacter.id, config);
      chips.querySelectorAll('.frequency-chip').forEach((item) => item.classList.remove('active'));
      chip.classList.add('active');
      applyMemoryFrequencyToCharacter(currentCharacter.id, num);
    });
    chips.appendChild(chip);
  });

  const custom = el('button', 'frequency-chip custom', '自定义');
  custom.type = 'button';
  custom.appendChild(createIcon('edit', 16));
  custom.addEventListener('click', () => openCustomFrequencySheet(config));
  chips.appendChild(custom);

  wrap.append(top, desc, chips);
  return wrap;
}

async function applyMemoryFrequencyToCharacter(characterId, frequency) {
  const character = await getDB('characters', characterId);
  if (!character) return;

  character.memoryTriggerCount = Math.max(1, Number(frequency));
  await setDB('characters', character.id, character);

  if (currentCharacter?.id === character.id) {
    currentCharacter.memoryTriggerCount = character.memoryTriggerCount;
  }
}

function openCustomFrequencySheet(config) {
  const sheet = el('div');
  sheet.append(el('div', 'sheet-title', '自定义频率'));

  const num = numberInput(config.memorySummaryFrequency || 5, 1, 200, (value) => {
    config.memorySummaryFrequency = value;
    config.memoryTriggerCount = value;
    saveChatConfig(currentCharacter.id, config);
    applyMemoryFrequencyToCharacter(currentCharacter.id, value);
  });

  const save = button('保存', 'primary', 'check');
  save.addEventListener('click', () => {
    hideBottomSheet();
    showToast('频率收好啦');
  });

  sheet.append(field('消息条数', num), save);
  showBottomSheet(sheet);
}

async function renderMemoryManager(listEl) {
  if (!currentCharacter || !listEl) return;

  listEl.innerHTML = '';

  const memories = (await getByIndexDB('memories', 'characterId', currentCharacter.id))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  if (!memories.length) {
    listEl.appendChild(createSoftNote('这里还空空的，等 TA 慢慢记住你。'));
    return;
  }

  memories.forEach((memory) => listEl.appendChild(createMemoryCard(memory, listEl)));
}

function createMemoryCard(memory, listEl) {
  const card = el('article', 'memory-card');
  const main = el('div', 'memory-card-main');

  main.append(
    el('div', 'memory-card-content', memory.content || ''),
    el('div', 'memory-card-meta', `${getMemorySourceLabel(memory.source)} · ${formatMemoryTime(memory.updatedAt || memory.createdAt)}`)
  );

  const actions = el('div', 'memory-card-actions');

  const edit = iconButton('edit', '编辑记忆');
  edit.addEventListener('click', () => openMemoryEditor(memory, listEl));

  const del = iconButton('delete', '删除记忆');
  del.addEventListener('click', async () => {
    const ok = await showConfirm('要把这条小记忆揉掉吗？');
    if (!ok) return;
    await deleteDB('memories', memory.id);
    await appendMemoryToolMessage(currentCharacter.id, { ...memory, content: '' }, '删除记忆');
    await renderMemoryManager(listEl);
    renderChatScreen();
  });

  actions.append(edit, del);
  card.append(main, actions);
  return card;
}

function openMemoryEditor(memory, listEl) {
  const sheet = el('div');
  sheet.append(el('div', 'sheet-title', memory ? '修一下这条记忆' : '添加记忆'));

  const content = textarea('比如：我喜欢雨天喝热奶茶', memory?.content || '');
  const save = button('保存', 'primary', 'check');

  save.addEventListener('click', async () => {
    const clean = content.value.trim();
    if (!clean) {
      showToast('先写一点内容');
      return;
    }

    const next = {
      id: memory?.id || generateId(),
      characterId: memory?.characterId || currentCharacter.id,
      content: clean,
      source: memory?.source || 'manual',
      createdAt: memory?.createdAt || getNow(),
      updatedAt: getNow()
    };

    await setDB('memories', next.id, next);
    await appendMemoryToolMessage(currentCharacter.id, next, memory ? '编辑记忆' : '写入记忆');
    hideBottomSheet();
    await renderMemoryManager(listEl);
    renderChatScreen();
    showToast(memory ? '这版收好了' : '这条记住啦');
  });

  sheet.append(field('内容', content), save);
  showBottomSheet(sheet);
}

function openConfigSheet() {
  if (!currentCharacter && !currentGroup) return;

  const id = currentCharacter?.id || currentGroup?.id;
  const config = getChatConfig(id);
  const settings = getSettings();

  const sheet = el('div', 'config-sheet');
  sheet.append(
    el('div', 'sheet-title', '聊天小开关'),
    el('div', 'sheet-description', '这些小开关只影响当前对话。')
  );

  const endpointSelect = document.createElement('select');
  endpointSelect.className = 'input-card';

  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = '使用默认端点';
  endpointSelect.appendChild(empty);

  settings.apiEndpoints.forEach((endpoint) => {
    const option = document.createElement('option');
    option.value = endpoint.id;
    option.textContent = endpoint.name || endpoint.endpoint || '未命名端点';
    option.selected = config.endpointId === endpoint.id;
    endpointSelect.appendChild(option);
  });

  const modelInput = input('模型名，不填用默认', config.model || '');

  endpointSelect.addEventListener('change', () => {
    config.endpointId = endpointSelect.value;
    saveChatConfig(id, config);
  });

  modelInput.addEventListener('change', () => {
    config.model = modelInput.value.trim();
    saveChatConfig(id, config);
  });

  sheet.append(
    field('API 端点', endpointSelect),
    field('模型', modelInput),
    customRow('流式输出', switchButton(config.streamEnabled !== false, (active) => {
      config.streamEnabled = active;
      saveChatConfig(id, config);
    })),
    customRow('TTS', switchButton(Boolean(config.ttsEnabled), (active) => {
      config.ttsEnabled = active;
      saveChatConfig(id, config);
    })),
    customRow('Token估算', switchButton(Boolean(config.tokenStatsEnabled), (active) => {
      config.tokenStatsEnabled = active;
      saveChatConfig(id, config);
      renderChatScreen();
    })),
    customRow('MCP', switchButton(Boolean(config.mcpEnabled), (active) => {
      config.mcpEnabled = active;
      saveChatConfig(id, config);
    })),
    customRow('自动发朋友圈', switchButton(Boolean(config.autoMomentEnabled), (active) => {
      config.autoMomentEnabled = active;
      saveChatConfig(id, config);
    }))
  );

  showBottomSheet(sheet);
}

async function openGroupSettingsSheet() {
  if (!currentGroup) return;

  const sheet = el('div', 'group-settings-sheet');
  sheet.append(el('div', 'sheet-title', '群聊资料'));

  const avatarPreview = createAvatar(currentGroup.avatar, currentGroup.name, 'md');
  const nameInput = input('群聊名称', currentGroup.name || '');

  const upload = button('更换群头像', 'ghost', 'image');
  upload.addEventListener('click', () => {
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';

    file.addEventListener('change', async () => {
      const item = file.files?.[0];
      if (!item) return;

      try {
        currentGroup.avatar = await compressImage(item, 800, 0.86);
        avatarPreview.innerHTML = '';
        const img = document.createElement('img');
        img.src = currentGroup.avatar;
        img.alt = '';
        avatarPreview.appendChild(img);
      } catch (_) {
        showToast('头像没有处理好');
      }
    });

    file.click();
  });

  const save = button('保存群资料', 'primary', 'check');
  save.addEventListener('click', async () => {
    currentGroup.name = nameInput.value.trim() || '群聊';
    currentGroup.updatedAt = getNow();
    await setDB('groups', currentGroup.id, currentGroup);
    await loadBaseData();
    hideBottomSheet();
    showToast('群资料收好啦');
    renderChatScreen();
  });

  const avatarBox = el('div', 'group-avatar-editor');
  avatarBox.append(avatarPreview, upload);

  sheet.append(avatarBox, field('群名', nameInput), save);
  showBottomSheet(sheet);
}

async function openGroupCreateSheet() {
  if (!characters.length) {
    showToast('先创建角色吧');
    return;
  }

  const draft = {
    id: generateId(),
    name: '',
    avatar: '',
    memberIds: [],
    createdAt: getNow(),
    updatedAt: getNow()
  };

  const sheet = el('div');
  sheet.append(el('div', 'sheet-title', '新建群聊'));

  const avatarPreview = createAvatar('', '群头像', 'md');
  const upload = button('设置群头像', 'ghost', 'image');
  upload.addEventListener('click', () => {
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';

    file.addEventListener('change', async () => {
      const item = file.files?.[0];
      if (!item) return;

      try {
        draft.avatar = await compressImage(item, 800, 0.86);
        avatarPreview.innerHTML = '';
        const img = document.createElement('img');
        img.src = draft.avatar;
        img.alt = '';
        avatarPreview.appendChild(img);
      } catch (_) {
        showToast('头像没有处理好');
      }
    });

    file.click();
  });

  const avatarBox = el('div', 'group-avatar-editor');
  avatarBox.append(avatarPreview, upload);

  const name = input('群聊名称');
  const list = el('div', 'checkbox-list');

  characters.forEach((character) => {
    list.appendChild(checkboxRow(character.name || '未命名角色', false, (checked) => {
      draft.memberIds = toggleId(draft.memberIds, character.id, checked);
    }));
  });

  const save = button('创建', 'primary', 'check');
  save.addEventListener('click', async () => {
    draft.name = name.value.trim() || '群聊';
    if (draft.memberIds.length < 2) {
      showToast('至少选 2 个角色');
      return;
    }

    await setDB('groups', draft.id, draft);
    hideBottomSheet();
    await loadBaseData();
    currentTab = 'group';
    renderList();
    showToast('群聊建好了');
  });

  sheet.append(avatarBox, field('名称', name), list, save);
  showBottomSheet(sheet);
}

async function openImagePicker() {
  if (!currentCharacter) {
    showToast('群聊先不发图片');
    return;
  }

  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/*';

  file.addEventListener('change', async () => {
    const item = file.files?.[0];
    if (!item) return;

    try {
      const imageBase64 = await compressImage(item, 1200, 0.86);
      const message = createMessage({
        role: 'user',
        content: '',
        characterId: currentCharacter.id,
        type: 'image',
        imageBase64
      });

      await setDB('messages', message.id, message);
      currentMessages.push(message);
      renderChatScreen();
      await generateAssistantReply('用户刚刚发送了一张图片。你无法直接看见图片细节，只能根据用户之后补充的信息自然回应。');
    } catch (_) {
      showToast('图片没有处理好');
    }
  });

  file.click();
}

function openStickerPanel() {
  if (!currentCharacter) {
    showToast('群聊先不发表情包');
    return;
  }

  const bound = stickers.filter((item) => currentCharacter.stickerIds?.includes(item.id));
  const sheet = el('div');
  sheet.appendChild(el('div', 'sheet-title', '表情包'));

  if (!bound.length) {
    sheet.appendChild(createSoftNote('这个角色还没有绑定表情包。'));
    showBottomSheet(sheet);
    return;
  }

  const search = input('搜描述或标签');
  const grid = el('div', 'sticker-grid');

  function render(filter = '') {
    grid.innerHTML = '';
    const keyword = filter.trim().toLowerCase();

    bound
      .filter((sticker) => {
        if (!keyword) return true;
        const text = `${sticker.description || ''} ${(sticker.tags || []).join(' ')}`.toLowerCase();
        return text.includes(keyword);
      })
      .forEach((sticker) => {
        const item = el('button', 'sticker-item');
        item.type = 'button';

        const img = document.createElement('img');
        img.src = sticker.image;
        img.alt = '';

        item.appendChild(img);
        item.addEventListener('click', async () => {
          hideBottomSheet();

          const message = createMessage({
            role: 'user',
            content: sticker.description || '',
            characterId: currentCharacter.id,
            type: 'sticker',
            stickerId: sticker.id
          });

          await setDB('messages', message.id, message);
          currentMessages.push(message);
          renderChatScreen();
          await generateAssistantReply('用户刚刚发了一个表情，请结合表情描述自然回应。');
        });

        grid.appendChild(item);
      });

    if (!grid.children.length) grid.appendChild(createSoftNote('没找到这个表情。'));
  }

  search.addEventListener('input', () => render(search.value));
  render();

  sheet.append(search, grid);
  showBottomSheet(sheet);
}
async function openMcpPanel() {
  const id = currentCharacter?.id || currentGroup?.id;
  if (!id) return;

  const config = getChatConfig(id);
  if (!config.mcpEnabled) {
    showToast('先在聊天小开关里打开 MCP');
    return;
  }

  const servers = getMcpServers().filter((server) => {
    if (!config.enabledMcpServerIds.length) return server.enabled !== false;
    return config.enabledMcpServerIds.includes(server.id);
  });

  const sheet = el('div');
  sheet.append(el('div', 'sheet-title', 'MCP 工具'));

  if (!servers.length) {
    sheet.appendChild(createSoftNote('还没选 MCP 服务器。'));
    showBottomSheet(sheet);
    return;
  }

  const list = el('div', 'settings-list');

  for (const server of servers) {
    const tools = await listMcpTools(server.id);
    const card = el('div', 'mcp-server-card');
    card.appendChild(el('div', 'settings-item-title', server.name || 'MCP'));

    if (!tools.length) {
      card.appendChild(createSoftNote('这里暂时没有可用工具。'));
    } else {
      tools.forEach((tool) => {
        const btn = button(tool.name, 'ghost', 'mcp');
        btn.addEventListener('click', () => openMcpCallSheet(server, tool));
        card.appendChild(btn);
      });
    }

    list.appendChild(card);
  }

  sheet.appendChild(list);
  showBottomSheet(sheet);
}

function openMcpCallSheet(server, tool) {
  const sheet = el('div');
  sheet.append(
    el('div', 'sheet-title', tool.name),
    el('div', 'sheet-description', tool.description || '填 JSON 参数后调用。')
  );

  const params = textarea('JSON 参数，例如 {}', '{}');
  const run = button('调用工具', 'primary', 'check');

  run.addEventListener('click', async () => {
    let data = null;

    try {
      data = JSON.parse(params.value || '{}');
    } catch (_) {
      showToast('JSON 参数格式不对');
      return;
    }

    hideBottomSheet();

    const toolCall = {
      id: generateId(),
      serverId: server.id,
      serverName: server.name || server.url || 'MCP',
      toolName: tool.name,
      arguments: data,
      result: null,
      status: 'running',
      timestamp: getNow()
    };

    const toolMessage = createMessage({
      role: 'assistant',
      content: '',
      characterId: currentCharacter?.id || currentGroup?.memberIds?.[0] || 'system',
      groupId: currentGroup?.id || '',
      type: 'tool'
    });

    toolMessage.toolCalls = [toolCall];

    if (currentGroup) await setDB('group_messages', toolMessage.id, toolMessage);
    else if (currentCharacter) await setDB('messages', toolMessage.id, toolMessage);

    currentMessages.push(toolMessage);
    renderChatScreen();

    try {
      const result = await callMcpTool(server.id, tool.name, data);

      if (!result) throw new Error('工具没有成功返回');

      toolCall.status = 'done';
      toolCall.result = result;
      toolMessage.toolCalls = [toolCall];

      if (currentGroup) await setDB('group_messages', toolMessage.id, toolMessage);
      else await setDB('messages', toolMessage.id, toolMessage);

      appendToolCallToContext(toolCall);
      showToast('工具用好啦');
      renderChatScreen();
    } catch (error) {
      toolCall.status = 'error';
      toolCall.result = error?.message || '工具没有成功返回';
      toolMessage.toolCalls = [toolCall];

      if (currentGroup) await setDB('group_messages', toolMessage.id, toolMessage);
      else await setDB('messages', toolMessage.id, toolMessage);

      showToast('工具有点卡住');
      renderChatScreen();
    }
  });

  sheet.append(field('参数', params), run);
  showBottomSheet(sheet);
}

function appendToolCallToContext(toolCall) {
  const context = buildMcpContext(toolCall.serverId, toolCall.toolName, toolCall.result);
  if (context) mcpContextBuffer += context;
}

function openCallUI() {
  if (!currentCharacter) {
    showToast('群聊先不打电话');
    return;
  }

  hideBottomSheet();
  stopAll();
  stopActiveTts();

  const call = el('section', 'call-screen');
  applyChatBackground(call, currentCharacter);

  const top = el('div', 'call-time', '00:00');
  const avatar = createAvatar(currentCharacter.avatar, currentCharacter.name, 'call');
  const name = el('div', 'call-name', currentCharacter.name || 'AI');
  const status = el('div', 'call-status', '文字通话中，内容会保存到聊天记录');
  const log = el('div', 'call-log');
  const inputRow = el('div', 'call-input-row');
  const textareaEl = textarea('输入你想说的话', '');
  const send = iconButton('send', '发送');
  send.classList.add('accent');

  const hang = el('button', 'call-hang');
  hang.type = 'button';
  hang.appendChild(createIcon('close', 28));

  inputRow.append(textareaEl, send);
  call.append(top, avatar, name, status, log, inputRow, hang);
  rootEl.appendChild(call);

  callStartedAt = Date.now();
  callTimer = window.setInterval(() => {
    const seconds = Math.floor((Date.now() - callStartedAt) / 1000);
    top.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }, 1000);

  async function sendCallMessage() {
    const content = textareaEl.value.trim();
    if (!content) return;

    textareaEl.value = '';
    log.appendChild(el('div', 'call-line user', content));

    const userMessage = createMessage({
      role: 'user',
      content,
      characterId: currentCharacter.id,
      type: 'text'
    });

    await setDB('messages', userMessage.id, userMessage);
    currentMessages.push(userMessage);

    const config = getChatConfig(currentCharacter.id);
    config.proactiveAwaitingUserReply = false;
    saveChatConfig(currentCharacter.id, config);

    const systemPrompt = await buildSystemPrompt(currentCharacter, config, '你正在和用户通话。回复要更口语、更短、更适合朗读。');
    const callMessages = currentMessages.slice(-16).map(toApiMessage);

    const reply = await silentRequest({
      messages: callMessages,
      systemPrompt,
      endpointId: resolveEndpointId(currentCharacter, config),
      model: resolveModel(currentCharacter, config),
      temperature: 0.8
    });

    const final = reply || '我在听，你继续说。';

    const assistantMessage = createMessage({
      role: 'assistant',
      content: final,
      characterId: currentCharacter.id,
      type: 'text'
    });

    await setDB('messages', assistantMessage.id, assistantMessage);

    currentMessages.push(assistantMessage);
    await updateLatestCache(currentCharacter.id);
    await afterAssistantReply(currentCharacter.id, assistantMessage);
    await markRead(currentCharacter.id);

    log.appendChild(el('div', 'call-line ai', final));
    avatar.classList.add('speaking');
    stopActiveTts();
    activeTts = playTTS(final, currentCharacter.ttsConfig);
    activeTtsMessageId = assistantMessage.id;

    window.setTimeout(() => avatar.classList.remove('speaking'), 2200);
    log.scrollTop = log.scrollHeight;
  }

  send.addEventListener('click', sendCallMessage);
  textareaEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendCallMessage();
    }
  });

  hang.addEventListener('click', () => {
    stopActiveTts();
    stopAll();
    clearCallTimer();
    call.remove();
    renderChatScreen();
  });
}

function clearCallTimer() {
  if (callTimer) {
    window.clearInterval(callTimer);
    callTimer = null;
  }
  callStartedAt = null;
}

async function scanProactiveAll() {
  if (document.hidden) return;

  await loadBaseData();

  for (const character of characters) {
    await checkMode1ForCharacter(character);
  }

  window.refreshDesktopBadges?.();
}

async function checkMode1ForCharacter(character) {
  const config = getChatConfig(character.id);
  if (!config.proactiveMode1Enabled) return;
  if (config.proactiveAwaitingUserReply) return;

  const messages = (await getByIndexDB('messages', 'characterId', character.id))
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));

  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') return;

  const diff = Date.now() - new Date(last.timestamp).getTime();
  const waitMs = Math.max(1, Number(config.proactiveMode1Minutes || 30)) * 60 * 1000;
  if (diff < waitMs) return;

  await sendProactiveMessage(character, 'mode1', '用户发出上一条消息后已经有一段时间没有继续回复。请结合上下文和当前时间，主动发一条自然、关心但不打扰的消息。');
}

function scheduleProactiveLoop() {
  clearProactiveTimer();
  proactiveTimer = window.setInterval(scanProactiveAll, PROACTIVE_SCAN_INTERVAL);
}

function clearProactiveTimer() {
  if (proactiveTimer) {
    window.clearInterval(proactiveTimer);
    proactiveTimer = null;
  }
}

function scheduleMode2Loop() {
  clearMode2Timer();
  mode2Timer = window.setInterval(checkActiveMode2, ACTIVE_MODE2_INTERVAL);
  scheduleMode2();
}

function clearMode2Timer() {
  if (mode2Timer) {
    window.clearTimeout(mode2Timer);
    window.clearInterval(mode2Timer);
    mode2Timer = null;
  }
}

function scheduleMode2() {
  if (!currentCharacter) return;

  const config = getChatConfig(currentCharacter.id);
  if (!config.proactiveMode2Enabled) return;
  if (config.proactiveAwaitingUserReply) return;

  const min = Math.max(1, Number(config.proactiveMode2MinMinutes || 5));
  const max = Math.max(min, Number(config.proactiveMode2MaxMinutes || 10));
  const minutes = min + Math.random() * (max - min);

  window.clearTimeout(mode2Timer);
  mode2Timer = window.setTimeout(checkActiveMode2, minutes * 60 * 1000);
}

async function checkActiveMode2() {
  if (document.hidden || !currentCharacter || isSending) return;

  const config = getChatConfig(currentCharacter.id);
  if (!config.proactiveMode2Enabled) return;
  if (config.proactiveAwaitingUserReply) return;

  const chance = Math.max(0, Math.min(100, Number(config.proactiveChance || 35)));
  if (Math.random() * 100 > chance) {
    scheduleMode2();
    return;
  }

  const last = currentMessages[currentMessages.length - 1];
  if (!last || last.role === 'user') {
    scheduleMode2();
    return;
  }

  await sendProactiveMessage(currentCharacter, 'mode2', '用户停留在当前聊天界面有一会儿没有回复。请根据最近上下文自然延续话题，不能尬聊，不能像通知，要像真实聊天中的轻轻补一句。');
  scheduleMode2();
}

async function sendProactiveMessage(character, mode, instruction) {
  const config = getChatConfig(character.id);

  const messages = (await getByIndexDB('messages', 'characterId', character.id))
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));

  const contextMessages = messages.slice(-24).map(toApiMessage);
  const systemPrompt = await buildSystemPrompt(character, config, instruction);

  const content = await silentRequest({
    messages: contextMessages,
    systemPrompt,
    endpointId: resolveEndpointId(character, config),
    model: resolveModel(character, config),
    temperature: 0.85
  });

  if (!content) return;

  const message = createMessage({
    role: 'assistant',
    content,
    characterId: character.id,
    type: 'text'
  });

  await setDB('messages', message.id, message);

  config.proactiveLastSentAt = getNow();
  config.proactiveAwaitingUserReply = true;
  saveChatConfig(character.id, config);

  if (currentCharacter?.id === character.id) {
    currentMessages.push(message);
    await markRead(character.id);
    renderChatScreen();
  } else {
    addUnread(character.id, 1);
  }

  await updateLatestCache(character.id);
  window.refreshDesktopBadges?.();

  if (mode === 'mode2' && config.ttsEnabled && character.ttsConfig?.enabled && currentCharacter?.id === character.id) {
    stopActiveTts();
    activeTts = playTTS(content, character.ttsConfig);
    activeTtsMessageId = message.id;
  }
}

async function maybeAutoMoment(characterId, assistantMessage) {
  const config = getChatConfig(characterId);
  if (!config.autoMomentEnabled) return;

  const character = await getDB('characters', characterId);
  if (!character) return;

  const lastMomentKey = `last_moment_${characterId}`;
  const last = Number(getData(lastMomentKey) || 0);

  if (Date.now() - last < MOMENT_COOLDOWN) return;
  if (Math.random() > 0.3) return;

  const result = await silentRequest({
    prompt: `根据这段 AI 回复判断是否适合发朋友圈。只返回JSON：{"post":"朋友圈内容或null","mood":"心情"}\n\n${assistantMessage.content}`,
    endpointId: resolveEndpointId(character, config),
    model: resolveModel(character, config),
    json: true,
    temperature: 0.7
  });

  if (!result?.post) return;

  const post = {
    id: generateId(),
    authorId: characterId,
    content: String(result.post).slice(0, 300),
    images: [],
    likes: [],
    comments: [],
    timestamp: getNow(),
    isRead: false
  };

  await setDB('moments', post.id, post);
  setData(lastMomentKey, Date.now());
  window.AppEvents?.emit?.('badge:moments', 1);
}

function createMessageActions(message) {
  const isUser = message.role === 'user';
  const actions = el('div', 'message-actions');

  const quote = miniAction('copy', '引用', () => quoteMessage(message));
  const edit = miniAction('edit', '编辑', () => isUser ? editUserMessage(message) : editAssistantMessage(message));
  const del = miniAction('delete', '删除', () => deleteMessage(message));
  const more = miniAction('more', '更多', () => openMessageActions(message));

  if (!isUser) {
    const isPlayingThis = activeTtsMessageId === message.id && activeTts;

    const play = miniAction(isPlayingThis ? 'stop' : 'play', isPlayingThis ? '停止' : '播放', () => {
      if (isPlayingThis) {
        stopActiveTts();
        renderChatScreen();
        return;
      }

      stopActiveTts();
      const character = characters.find((item) => item.id === message.characterId) || currentCharacter;
      activeTts = playTTS(message.content, character?.ttsConfig);
      activeTtsMessageId = message.id;
      renderChatScreen();
    });

    const refresh = miniAction('refresh', '重来', () => regenerateFrom(message));
    actions.append(play, refresh, quote, edit, del, more);
    return actions;
  }

  actions.append(quote, edit, del, more);
  return actions;
}

function miniAction(iconName, label, action) {
  const item = el('button', 'message-action-btn');
  item.type = 'button';
  item.setAttribute('aria-label', label);
  item.append(createIcon(iconName, 15), el('span', '', label));
  item.addEventListener('click', action);
  return item;
}

function openMessageActions(message) {
  clearLongPress();

  const sheet = el('div');
  sheet.appendChild(el('div', 'sheet-title', '想怎么处理这句话'));

  const actions = [{ label: '引用回复', icon: 'copy', action: () => quoteMessage(message) }];

  if (message.role === 'assistant') {
    actions.push(
      { label: '重新生成', icon: 'refresh', action: () => regenerateFrom(message) },
      { label: '续写', icon: 'edit', action: () => continueFrom(message) },
      { label: '编辑', icon: 'edit', action: () => editAssistantMessage(message) }
    );
  } else {
    actions.push({ label: '编辑并重发', icon: 'edit', action: () => editUserMessage(message) });
  }

  actions.push(
    { label: '复制', icon: 'copy', action: () => copyText(message.content || '') },
    { label: '删除', icon: 'delete', action: () => deleteMessage(message) },
    { label: '原始小纸条', icon: 'eye', action: () => showRawMessage(message) }
  );

  sheet.appendChild(createToolGrid(actions));
  showBottomSheet(sheet);
}

function quoteMessage(message) {
  hideBottomSheet();
  quotedMessage = message;
  renderChatScreen();
}

async function regenerateFrom(message) {
  hideBottomSheet();

  if (currentGroup) {
    showToast('群聊暂时先不重来');
    return;
  }

  if (!currentCharacter) return;

  const index = currentMessages.findIndex((item) => item.id === message.id);
  if (index < 0) return;

  await deleteDB('messages', message.id);
  currentMessages.splice(index, 1);
  renderChatScreen();
  await generateAssistantReply('请重新生成上一条回复，避免和刚才完全一样。');
}

async function continueFrom(message) {
  hideBottomSheet();

  if (currentGroup) {
    showToast('群聊暂时先不续写');
    return;
  }

  if (!currentCharacter) return;
  await generateAssistantReply(`请接着你上一条回复继续写，不要重复开头。上一条回复是：${message.content}`);
}

function editUserMessage(message) {
  hideBottomSheet();

  const sheet = el('div');
  sheet.appendChild(el('div', 'sheet-title', '改一下这句话'));

  const edit = textarea('编辑消息', message.content || '');
  const save = button('保存并让 TA 重新回', 'primary', 'check');

  save.addEventListener('click', async () => {
    const content = edit.value.trim();
    if (!content) {
      showToast('内容不能空空的');
      return;
    }

    message.content = content;

    const index = currentMessages.findIndex((item) => item.id === message.id);
    const after = currentMessages.slice(index + 1);

    if (currentGroup) {
      await setDB('group_messages', message.id, message);
      for (const item of after) await deleteDB('group_messages', item.id);

      currentMessages = currentMessages.slice(0, index + 1);
      hideBottomSheet();
      renderChatScreen();
      await replyGroupMembers();
      return;
    }

    await setDB('messages', message.id, message);
    for (const item of after) await deleteDB('messages', item.id);

    currentMessages = currentMessages.slice(0, index + 1);
    hideBottomSheet();
    renderChatScreen();
    await generateAssistantReply();
  });

  sheet.append(field('内容', edit), save);
  showBottomSheet(sheet);
}

function editAssistantMessage(message) {
  hideBottomSheet();

  const sheet = el('div');
  sheet.appendChild(el('div', 'sheet-title', '帮TA修一下这句话'));

  const edit = textarea('编辑 AI 消息', message.content || '');
  const save = button('保存这版', 'primary', 'check');

  save.addEventListener('click', async () => {
    const content = edit.value.trim();
    if (!content) {
      showToast('内容不能空空的');
      return;
    }

    message.content = content;

    if (currentGroup) await setDB('group_messages', message.id, message);
    else await setDB('messages', message.id, message);

    currentMessages = currentMessages.map((item) => item.id === message.id ? message : item);
    hideBottomSheet();
    showToast('这版收好了');
    renderChatScreen();
  });

  sheet.append(field('内容', edit), save);
  showBottomSheet(sheet);
}

async function deleteMessage(message) {
  hideBottomSheet();

  const ok = await showConfirm('要把这句话轻轻删掉吗？');
  if (!ok) return;

  if (currentGroup) await deleteDB('group_messages', message.id);
  else await deleteDB('messages', message.id);

  currentMessages = currentMessages.filter((item) => item.id !== message.id);
  renderChatScreen();
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('复制好了');
  } catch (_) {
    showToast('复制没有成功');
  }
}

function showRawMessage(message) {
  const sheet = el('div');
  sheet.append(
    el('div', 'sheet-title', '原始小纸条'),
    el('pre', 'raw-message', JSON.stringify(message, null, 2))
  );
  showBottomSheet(sheet);
}

async function clearContext() {
  const ok = await showConfirm('只清掉临时小纸条，不删聊天记录。继续吗？');
  if (!ok) return;

  mcpContextBuffer = '';
  showToast('临时小纸条清掉了');
}

async function clearAllMessages() {
  const ok = await showConfirm('要把这个对话里的话都清掉吗？');
  if (!ok) return;

  if (currentCharacter) {
    for (const message of currentMessages) await deleteDB('messages', message.id);
    await markRead(currentCharacter.id);
    await updateLatestCache(currentCharacter.id);
  }

  if (currentGroup) {
    for (const message of currentMessages) await deleteDB('group_messages', message.id);
    await updateLatestGroupCache(currentGroup.id);
  }

  currentMessages = [];
  quotedMessage = null;
  showToast('已经清干净了');
  renderChatScreen();
}

function exportChatText() {
  const title = currentCharacter?.name || currentGroup?.name || 'chat';
  const text = currentMessages
    .map((message) => `${getSpeakerName(message.characterId)}：${message.content || ''}`)
    .join('\n\n');

  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title}.txt`;
  link.click();
  URL.revokeObjectURL(url);
}

function showCurrentInfoSheet() {
  const sheet = el('div');
  sheet.append(
    el('div', 'sheet-title', '当前资料'),
    el('pre', 'raw-message', JSON.stringify(currentCharacter || currentGroup || {}, null, 2))
  );
  showBottomSheet(sheet);
}

function openTransferSheet() {
  if (!currentCharacter) {
    showToast('群聊先不转账');
    return;
  }

  const sheet = el('div');
  sheet.append(el('div', 'sheet-title', '转账'));

  const amount = input('金额', '', 'number');
  amount.min = '0';

  const send = button('确认转账', 'primary', 'transfer');
  send.addEventListener('click', async () => {
    const value = Number(amount.value);
    if (!Number.isFinite(value) || value <= 0) {
      showToast('先填一个金额');
      return;
    }

    const message = createMessage({
      role: 'user',
      content: `给你转了 ${value.toFixed(2)} 元`,
      characterId: currentCharacter.id,
      type: 'transfer',
      transferAmount: value
    });

    await setDB('messages', message.id, message);
    currentMessages.push(message);
    hideBottomSheet();
    renderChatScreen();
    await generateAssistantReply(`用户刚刚给你转了 ${value.toFixed(2)} 元，请自然回应。`);
  });

  sheet.append(field('金额', amount), send);
  showBottomSheet(sheet);
}

function showTyping(messageId) {
  const bubble = document.querySelector(`[data-card="${messageId}"]`) || document.querySelector(`[data-bubble="${messageId}"]`);
  if (!bubble) return;

  bubble.innerHTML = '';
  const dots = el('span', 'typing-dots');
  dots.append(el('span'), el('span'), el('span'));
  bubble.appendChild(dots);
  scrollToBottom(true);
}

function renderMessagePatch(message) {
  const card = document.querySelector(`[data-card="${message.id}"]`);
  if (card) {
    card.innerHTML = '';
    appendAssistantCardLayers(card, message);
    scrollToBottom(true);
    return;
  }

  const bubble = document.querySelector(`[data-bubble="${message.id}"]`);
  if (!bubble) return;

  bubble.innerHTML = '';
  if (message.content) bubble.appendChild(renderRichText(message.content));
  scrollToBottom(true);
}

function createTransferCard(amount) {
  const card = el('div', 'transfer-card');
  card.append(
    el('div', 'transfer-title', '转账'),
    el('div', 'transfer-amount', `${Number(amount || 0).toFixed(2)} 元`)
  );
  return card;
}

function createTokenStats(stats) {
  const box = el('div', 'token-stats');
  box.textContent = `Token估算：输入 ${stats.input || 0} · 输出 ${stats.output || 0} · 合计 ${stats.total || 0}`;
  return box;
}

function applyChatBackground(container, character) {
  const bg = character?.chatBackground || {};
  container.style.background = '';
  container.style.backgroundImage = '';

  if (bg.type === 'color' && bg.value) container.style.background = bg.value;

  if (bg.type === 'image' && bg.value) {
    container.style.backgroundImage = `url("${bg.value}")`;
    container.style.backgroundSize = 'cover';
    container.style.backgroundPosition = 'center';
    container.style.backgroundRepeat = 'no-repeat';
  }
}

function applyChatFontSize() {
  if (!rootEl) return;
  const fontSize = Number(getSettings().fontSize) || 15;
  rootEl.style.setProperty('--chat-font-size', `${fontSize}px`);
}

function getUserProfiles() {
  const profiles = getData(USER_PROFILES_KEY);
  return Array.isArray(profiles) ? profiles : [];
}

function resolveUserProfileForCharacter(character) {
  const profiles = getUserProfiles();
  if (!profiles.length) return null;

  if (character) {
    const profileId = character.userProfileId || 'default';
    if (profileId === 'none') return null;
    if (profileId && profileId !== 'default') return profiles.find((profile) => profile.id === profileId) || null;
  }

  return profiles.find((profile) => profile.isDefault === true) || profiles[0] || null;
}

function getCurrentUserDisplayProfile() {
  const settings = getSettings();
  const profile = resolveUserProfileForCharacter(currentCharacter);

  return {
    name: profile?.name || settings.user.name || '我',
    avatar: profile?.avatar || settings.user.avatar || ''
  };
}

function buildUserProfilePrompt(character) {
  const profile = resolveUserProfileForCharacter(character);
  if (!profile || !profile.content) return '';

  const name = profile.name || getSettings().user.name || '用户';
  return `[用户人设]\n昵称：${name}\n内容：${profile.content}`;
}

async function buildWorldbookPrompt(character) {
  const entries = await getAllDB('worldbook');
  const targetIds = new Set(character.worldbookIds || []);

  const matched = normalizeArray(entries).filter((entry) => {
    if (!entry || entry.enabled === false) return false;
    if (entry.type === 'B') return true;
    if (entry.targetIds === 'all') return true;
    if (Array.isArray(entry.targetIds) && entry.targetIds.includes(character.id)) return true;
    return targetIds.has(entry.id);
  });

  if (!matched.length) return '';
  return `[世界书]\n${matched.map((entry) => `【${entry.title || '条目'}】${entry.content || ''}`).join('\n')}`;
}

async function buildInventoryPrompt() {
  const inventory = await getAllDB('inventory');
  const effects = normalizeArray(inventory)
    .map((item) => item.effect || item.itemEffect || '')
    .filter(Boolean);

  if (!effects.length) return '';
  return `[当前状态]\n${effects.join('；')}`;
}

async function getWeatherPrompt() {
  const cache = getData('weather_cache');
  const now = Date.now();

  if (cache?.data?.text && cache.timestamp && now - cache.timestamp < WEATHER_CACHE_TIME) {
    return `[当前天气]\n${cache.data.text}`;
  }

  try {
    const response = await fetch('https://wttr.in/?format=j1', { method: 'GET', cache: 'no-store' });
    if (!response.ok) return '';

    const data = await response.json();
    const current = data.current_condition?.[0] || {};
    const area = data.nearest_area?.[0] || {};
    const city = area.areaName?.[0]?.value || area.region?.[0]?.value || '当前位置';
    const temp = current.temp_C ? `${current.temp_C}℃` : '';
    const desc = current.lang_zh?.[0]?.value || current.weatherDesc?.[0]?.value || '';
    const text = [city, temp, desc].filter(Boolean).join(' · ');

    if (!text) return '';

    setData('weather_cache', { data: { city, temp, desc, text }, timestamp: now });
    return `[当前天气]\n${text}`;
  } catch (_) {
    return '';
  }
}

async function buildRecentMomentsPrompt() {
  const moments = await getAllDB('moments');
  const recent = normalizeArray(moments)
    .slice()
    .sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')))
    .slice(0, 3)
    .map((item) => `${getSpeakerName(item.authorId)}：${item.content || ''}`)
    .filter(Boolean);

  if (!recent.length) return '';
  return `[最近朋友圈]\n${recent.join('\n')}`;
}

function buildAnniversaryPrompt() {
  const list = getData('anniversaries');
  if (!Array.isArray(list) || !list.length) return '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayItems = list.filter((item) => {
    if (!item?.date || item.aiReminder === false) return false;
    const date = new Date(item.date);
    date.setHours(0, 0, 0, 0);
    return date.getTime() === today.getTime();
  });

  if (!todayItems.length) return '';
  return `[纪念日提醒]\n今天是${todayItems.map((item) => item.name).join('、')}，请在合适时机自然提及。`;
}

async function buildIntimacyPrompt(characterId) {
  const messages = await getByIndexDB('messages', 'characterId', characterId);
  const count = messages.length;

  if (count >= 300) return `[关系状态]\n你和用户已经非常熟悉，可以更自然亲密，但不要越界。`;
  if (count >= 80) return `[关系状态]\n你和用户已经比较熟悉，可以主动关心用户的近况。`;
  if (count >= 20) return `[关系状态]\n你和用户正在熟悉中，语气可以温柔自然。`;
  return `[关系状态]\n你们刚开始聊天，请自然、克制、真诚。`;
}

function buildTimePrompt() {
  const now = new Date();
  const hour = now.getHours();
  let period = '白天';

  if (hour < 5) period = '深夜';
  else if (hour < 11) period = '早上';
  else if (hour < 14) period = '中午';
  else if (hour < 18) period = '下午';
  else if (hour < 23) period = '晚上';
  else period = '夜里';

  const text = new Intl.DateTimeFormat('zh-CN', {
    dateStyle: 'full',
    timeStyle: 'short'
  }).format(now);

  return `[当前日期时间]\n${text}\n当前时间段：${period}。请根据时间段调整语气。`;
}

function handleGlobalSearch(query, resultsBox) {
  resultsBox.innerHTML = '';
  if (!query) return;

  const lower = query.toLowerCase();
  const matched = [];

  characters.forEach((character) => {
    if ((character.name || '').toLowerCase().includes(lower)) {
      matched.push({ type: 'character', character, preview: '角色匹配' });
    }
  });

  const cache = getData('chat_latest_cache') || {};
  Object.entries(cache).forEach(([id, item]) => {
    if (String(item?.preview || '').toLowerCase().includes(lower)) {
      const character = characters.find((c) => c.id === id);
      if (character) matched.push({ type: 'message', character, preview: item.preview });
    }
  });

  if (!matched.length) {
    resultsBox.appendChild(createSoftNote('没找到角色或聊天记录。'));
    return;
  }

  matched.slice(0, 20).forEach((item) => {
    const btn = el('button', 'search-result-item');
    btn.type = 'button';
    btn.append(
      el('div', 'search-result-title', item.character.name || '角色'),
      el('div', 'search-result-text', item.preview || '')
    );
    btn.addEventListener('click', () => openPrivateChat(item.character.id));
    resultsBox.appendChild(btn);
  });
}

async function updateLatestCache(characterId) {
  const messages = (await getByIndexDB('messages', 'characterId', characterId))
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));

  const latest = messages[messages.length - 1];
  const cache = getData('chat_latest_cache') || {};

  if (latest) {
    cache[characterId] = {
      preview: getMessagePreview(latest),
      time: latest.timestamp
    };
  } else {
    delete cache[characterId];
  }

  setData('chat_latest_cache', cache);
}

async function updateLatestGroupCache(groupId) {
  const messages = (await getByIndexDB('group_messages', 'groupId', groupId))
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));

  const latest = messages[messages.length - 1];
  const cache = getData('group_latest_cache') || {};

  if (latest) {
    cache[groupId] = {
      preview: getMessagePreview(latest),
      time: latest.timestamp
    };
  } else {
    delete cache[groupId];
  }

  setData('group_latest_cache', cache);
}

async function markRead(characterId) {
  const unread = getData('chat_unread_counts') || {};
  unread[characterId] = 0;
  setData('chat_unread_counts', unread);

  const config = getChatConfig(characterId);
  config.readAt = getNow();
  saveChatConfig(characterId, config);

  window.refreshDesktopBadges?.();
}

function addUnread(characterId, count = 1) {
  const unread = getData('chat_unread_counts') || {};
  unread[characterId] = Math.max(0, Number(unread[characterId] || 0) + count);
  setData('chat_unread_counts', unread);
}

function getUnreadCount(characterId) {
  const unread = getData('chat_unread_counts') || {};
  return Math.max(0, Number(unread[characterId] || 0));
}

function getCachedLatestPreview(characterId) {
  const cache = getData('chat_latest_cache') || {};
  return cache[characterId] || { preview: '', time: '' };
}

function getCachedLatestGroupPreview(groupId) {
  const cache = getData('group_latest_cache') || {};
  return cache[groupId] || { preview: '', time: '' };
}

function getLastMessageTime(characterId) {
  return getCachedLatestPreview(characterId).time || '';
}

function getLastGroupMessageTime(groupId) {
  return getCachedLatestGroupPreview(groupId).time || '';
}

function getChatConfig(id) {
  const saved = getData(`chat_${id}_config`) || {};

  return {
    ...DEFAULT_CHAT_CONFIG,
    ...saved,
    enabledMcpServerIds: Array.isArray(saved.enabledMcpServerIds) ? saved.enabledMcpServerIds : [],
    memorySummaryFrequency: Number(saved.memorySummaryFrequency || saved.memoryTriggerCount || 5)
  };
}

function saveChatConfig(id, config) {
  setData(`chat_${id}_config`, {
    ...DEFAULT_CHAT_CONFIG,
    ...config,
    enabledMcpServerIds: Array.isArray(config.enabledMcpServerIds) ? config.enabledMcpServerIds : [],
    memorySummaryFrequency: Math.max(1, Number(config.memorySummaryFrequency || 5)),
    memoryTriggerCount: Math.max(1, Number(config.memorySummaryFrequency || config.memoryTriggerCount || 5)),
    proactiveMode1Minutes: Math.max(1, Number(config.proactiveMode1Minutes || 30)),
    proactiveMode2MinMinutes: Math.max(1, Number(config.proactiveMode2MinMinutes || 5)),
    proactiveMode2MaxMinutes: Math.max(1, Number(config.proactiveMode2MaxMinutes || 10)),
    proactiveChance: Math.max(0, Math.min(100, Number(config.proactiveChance || 35))),
    tokenStatsEnabled: Boolean(config.tokenStatsEnabled)
  });
}

function getSettings() {
  const saved = getData('app_settings') || {};

  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    user: {
      ...DEFAULT_SETTINGS.user,
      ...(saved.user || {})
    },
    apiEndpoints: Array.isArray(saved.apiEndpoints) ? saved.apiEndpoints : []
  };
}

function resolveEndpointId(character, config) {
  if (config.endpointId) return config.endpointId;
  if (character.apiConfig && character.apiConfig.useGlobal === false) return character.apiConfig.endpointId || '';
  return '';
}

function resolveModel(character, config) {
  if (config.model) return config.model;
  if (character.apiConfig && character.apiConfig.useGlobal === false) return character.apiConfig.model || '';
  return '';
}

function createMessage({
  role,
  content = '',
  thinking = null,
  characterId,
  groupId = '',
  type = 'text',
  imageBase64 = null,
  stickerId = null,
  transferAmount = null
}) {
  const message = {
    id: generateId(),
    role,
    content,
    thinking,
    characterId,
    type,
    imageBase64,
    stickerId,
    transferAmount,
    timestamp: getNow()
  };

  if (groupId) message.groupId = groupId;
  return message;
}

function toApiMessage(message) {
  return {
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content: getMessagePreview(message, true)
  };
}

function getMessagePreview(message, full = false) {
  if (!message) return '';

  if (message.type === 'tool') {
    const toolCall = normalizeArray(message.toolCalls)[0];
    if (!toolCall) return '[工具]';
    if (isMemoryToolCall(toolCall)) return getMemoryToolSummary(toolCall);
    return createToolCallSummary(toolCall);
  }

  if (message.type === 'image') return message.content || '[图片]';
  if (message.type === 'sticker') return message.content || '[表情包]';
  if (message.type === 'transfer') return `转账 ${Number(message.transferAmount || 0).toFixed(2)} 元`;

  const text = String(message.content || '');
  return full || text.length <= 80 ? text : `${text.slice(0, 80)}…`;
}

function createToolCallSummary(toolCall) {
  if (!toolCall) return '[工具]';
  const name = toolCall.toolName || '工具';
  if (toolCall.status === 'running') return `[工具] ${name} 正在处理`;
  if (toolCall.status === 'error') return `[工具] ${name} 处理失败`;
  return `[工具] ${name} 处理完成`;
}

function getSpeakerName(characterId) {
  if (characterId === 'user') return getCurrentUserDisplayProfile().name || '我';
  const character = characters.find((item) => item.id === characterId);
  return character?.name || currentCharacter?.name || 'AI';
}

function getSpeakerAvatar(characterId) {
  if (characterId === 'user') return getCurrentUserDisplayProfile().avatar || '';
  const character = characters.find((item) => item.id === characterId);
  return character?.avatar || currentCharacter?.avatar || '';
}

function getPromptPreview(character) {
  const text = String(character.systemPrompt || '').trim();
  return text ? (text.length > 60 ? `${text.slice(0, 60)}…` : text) : '还没有填写人设';
}

function getMoodText(mood) {
  if (mood === 'happy') return '心情不错';
  if (mood === 'sad') return '有点低落';
  if (mood === 'excited') return '有点兴奋';
  return '在线';
}

function getOnlineText() {
  const latest = currentMessages[currentMessages.length - 1];
  if (!latest) return '刚刚在线';
  return formatRelativeTime(latest.timestamp);
}

function formatRelativeTime(value) {
  if (!value) return '刚刚';

  const diff = Date.now() - new Date(value).getTime();
  const minute = Math.floor(diff / 60000);
  const hour = Math.floor(diff / 3600000);

  if (minute < 1) return '刚刚';
  if (minute < 60) return `${minute} 分钟前`;
  if (hour < 24) return `${hour} 小时前`;

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(value));
}

function formatMemoryTime(value) {
  if (!value) return '刚刚';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch (_) {
    return '刚刚';
  }
}

function getMemorySourceLabel(source) {
  if (source === 'manual') return '你写的';
  if (source === 'summary') return 'AI整理';
  return 'AI记录';
}

function createAvatar(src, name, size = 'md') {
  const box = el('div', `avatar-box ${size}`);

  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    box.appendChild(img);
  } else {
    box.appendChild(createIcon('smile', size === 'sm' ? 18 : 24));
  }

  box.setAttribute('aria-label', name || '头像');
  return box;
}

function createChatSvgIcon(name, size = 16) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const paths = {
    lightbulb: ['M9 18h6', 'M10 22h4', 'M8.5 14.5c-1.6-1.1-2.5-2.8-2.5-4.7A6 6 0 0 1 18 9.8c0 1.9-.9 3.6-2.5 4.7-.6.4-.9 1-.9 1.7V17H9.4v-.8c0-.7-.3-1.3-.9-1.7Z'],
    notebook: ['M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M9 3v18', 'M12 8h4', 'M12 12h4'],
    wrench: ['M14.7 6.3a4 4 0 0 0 4.8 4.8l-7.9 7.9a2.2 2.2 0 0 1-3.1-3.1l7.9-7.9Z', 'M7 17l-2 2'],
    file: ['M7 3h7l5 5v13H7V3Z', 'M14 3v6h5', 'M10 13h6', 'M10 17h4']
  };

  (paths[name] || paths.wrench).forEach((d) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  });

  return svg;
}

function estimateTokens(text) {
  const clean = String(text || '').trim();
  if (!clean) return 0;

  const chineseChars = (clean.match(/[\u4e00-\u9fff]/g) || []).length;
  const nonChinese = clean.replace(/[\u4e00-\u9fff]/g, '');
  const words = (nonChinese.match(/[a-zA-Z0-9_]+/g) || []).length;
  const symbols = Math.ceil((nonChinese.replace(/[a-zA-Z0-9_\s]/g, '').length || 0) / 2);

  return Math.max(1, Math.ceil(chineseChars * 0.65 + words * 1.25 + symbols));
}

function saveTokenStats(messageId, stats) {
  if (!messageId) return;

  const all = getData(TOKEN_STATS_KEY) || {};
  all[messageId] = {
    input: Math.max(0, Math.round(Number(stats.input) || 0)),
    output: Math.max(0, Math.round(Number(stats.output) || 0)),
    total: Math.max(0, Math.round(Number(stats.total) || 0)),
    timestamp: stats.timestamp || getNow()
  };

  setData(TOKEN_STATS_KEY, all);
}

function getTokenStats(messageId) {
  const all = getData(TOKEN_STATS_KEY) || {};
  return all[messageId] || null;
}

function stopActiveTts() {
  if (activeTts) {
    activeTts.stop();
    activeTts = null;
  }

  activeTtsMessageId = '';
}

function startThinkingTimer() {
  thinkingStartAt = Date.now();
  thinkingTotalMs = 0;
  thinkingStopped = false;
}

function stopThinkingTimer() {
  if (thinkingStopped) return;
  thinkingStopped = true;
  if (thinkingStartAt) thinkingTotalMs = Date.now() - thinkingStartAt;
  thinkingStartAt = null;
}

function getThinkingTimeMs() {
  if (thinkingTotalMs > 0) return thinkingTotalMs;
  if (thinkingStartAt) return Date.now() - thinkingStartAt;
  return 0;
}

function setupKeyboardViewport() {
  updateKeyboardViewport();

  if (!window.visualViewport) {
    window.addEventListener('resize', updateKeyboardViewport, { passive: true });
    window.addEventListener('orientationchange', updateKeyboardViewport, { passive: true });
    return;
  }

  window.visualViewport.addEventListener('resize', updateKeyboardViewport, { passive: true });
  window.visualViewport.addEventListener('scroll', updateKeyboardViewport, { passive: true });
  window.addEventListener('orientationchange', updateKeyboardViewport, { passive: true });
}

function cleanupKeyboardViewport() {
  if (keyboardViewportRaf) {
    window.cancelAnimationFrame(keyboardViewportRaf);
    keyboardViewportRaf = 0;
  }

  if (window.visualViewport) {
    window.visualViewport.removeEventListener('resize', updateKeyboardViewport);
    window.visualViewport.removeEventListener('scroll', updateKeyboardViewport);
  } else {
    window.removeEventListener('resize', updateKeyboardViewport);
  }

  window.removeEventListener('orientationchange', updateKeyboardViewport);
  document.documentElement.style.removeProperty('--chat-keyboard-offset');
  document.documentElement.style.removeProperty('--chat-visual-height');
}

function updateKeyboardViewport() {
  if (keyboardViewportRaf) window.cancelAnimationFrame(keyboardViewportRaf);

  keyboardViewportRaf = window.requestAnimationFrame(() => {
    keyboardViewportRaf = 0;

    const viewport = window.visualViewport;
    const layoutHeight = window.innerHeight;
    const visualHeight = viewport?.height || layoutHeight;
    const offsetTop = viewport?.offsetTop || 0;
    const keyboardOffset = Math.max(0, layoutHeight - visualHeight - offsetTop);

    document.documentElement.style.setProperty('--chat-keyboard-offset', `${Math.round(keyboardOffset)}px`);
    document.documentElement.style.setProperty('--chat-visual-height', `${Math.round(visualHeight)}px`);

    const active = document.activeElement;
    if (active && (active.classList?.contains('chat-input') || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
      window.setTimeout(() => scrollToBottom(false), 40);
    }
  });
}

function handleVisibilityChange() {
  if (!document.hidden) {
    updateKeyboardViewport();
    scanProactiveAll();
    scheduleMode2();
  }
}

function scrollToBottom(smooth = true) {
  requestAnimationFrame(() => {
    const area = document.getElementById('chat-messages-area');
    if (!area) return;

    area.scrollTo({
      top: area.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
  });
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function shuffleArray(list) {
  return list.slice().sort(() => Math.random() - 0.5);
}

function toggleId(list, id, checked) {
  const set = new Set(Array.isArray(list) ? list : []);
  if (checked) set.add(id);
  else set.delete(id);
  return [...set];
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function clearLongPress() {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function createSegmented(options, value, onChange) {
  const wrap = el('div', 'segmented');

  options.forEach((option) => {
    const item = el('button', '', option.label);
    item.type = 'button';
    item.classList.toggle('active', option.value === value);
    item.addEventListener('click', () => onChange(option.value));
    wrap.appendChild(item);
  });

  return wrap;
}

function switchButton(active, onChange) {
  const item = el('button', 'switch');
  item.type = 'button';
  item.classList.toggle('active', Boolean(active));

  item.addEventListener('click', () => {
    item.classList.toggle('active');
    onChange?.(item.classList.contains('active'));
  });

  return item;
}

function checkboxRow(label, checked, onChange) {
  const row = el('button', 'checkbox-row');
  row.type = 'button';
  row.classList.toggle('active', checked);

  const text = el('span', '', label);
  const mark = el('span', 'checkbox-mark');
  if (checked) mark.appendChild(createIcon('check', 16));

  row.append(text, mark);
  row.addEventListener('click', () => {
    const next = !row.classList.contains('active');
    row.classList.toggle('active', next);
    mark.innerHTML = '';
    if (next) mark.appendChild(createIcon('check', 16));
    onChange?.(next);
  });

  return row;
}

function field(labelText, control) {
  const wrap = el('label', 'settings-field');
  wrap.append(el('span', 'field-label', labelText), control);
  return wrap;
}

function customRow(labelText, control) {
  const row = el('div', 'form-row');
  row.append(el('div', 'form-label', labelText), el('div', 'form-control'));
  row.querySelector('.form-control').appendChild(control);
  return row;
}

function input(placeholder, value = '', type = 'text') {
  const item = document.createElement('input');
  item.className = 'input-card';
  item.type = type;
  item.placeholder = placeholder || '';
  item.value = value ?? '';
  return item;
}

function textarea(placeholder, value = '') {
  const item = document.createElement('textarea');
  item.className = 'textarea-card';
  item.placeholder = placeholder || '';
  item.value = value ?? '';
  return item;
}

function numberInput(value, min, max, onChange) {
  const item = input('', value, 'number');
  item.min = String(min);
  item.max = String(max);
  item.addEventListener('change', () => {
    const next = Math.max(min, Math.min(max, Number(item.value) || min));
    item.value = String(next);
    onChange(next);
  });
  return item;
}

function button(text, variant = 'ghost', iconName = '') {
  const item = el('button', variant === 'primary' ? 'btn-primary' : 'btn-ghost');
  item.type = 'button';
  if (iconName) item.appendChild(createIcon(iconName, 18));
  item.appendChild(el('span', '', text));
  return item;
}

function iconButton(iconName, label) {
  const item = el('button', 'icon-button');
  item.type = 'button';
  item.setAttribute('aria-label', label);
  item.appendChild(createIcon(iconName, 22));
  return item;
}

function createSoftNote(text) {
  return el('div', 'soft-note', text);
}

function emptyState(title, text) {
  const box = el('div', 'empty-state');
  box.append(el('div', 'empty-state-title', title), el('div', 'empty-state-text', text));
  return box;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null && text !== '') node.textContent = String(text);
  return node;
}

function injectStyle() {
  if (injectedStyle || document.getElementById('chat-style')) return;

  injectedStyle = true;

  const style = document.createElement('style');
  style.id = 'chat-style';
  style.textContent = `
    .chat-app,
    .chat-app * {
      font-family: var(--font-main);
    }

    .chat-app {
      color: var(--text-primary);
      font-size: var(--chat-font-size, var(--font-size-base));
    }

    .chat-nav-title {
      flex: 1;
      min-width: 0;
    }

    .chat-list-wrap {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      padding-bottom: var(--spacing-lg);
    }

    .chat-search {
      box-shadow: var(--shadow-sm);
    }

    .chat-search-bar {
      position: relative;
      z-index: 130;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 40px;
      align-items: center;
      gap: var(--spacing-sm);
      padding: 8px 20px 10px;
      background: var(--surface-glass);
      box-shadow: var(--shadow-sm);
    }

    .chat-search-bar.hidden {
      display: none;
    }

    .chat-search-input {
      width: 100%;
      min-width: 0;
      display: block;
      opacity: 1;
      visibility: visible;
    }

    .chat-screen.search-open .chat-messages-area {
      padding-top: calc(122px + env(safe-area-inset-top));
    }

    .chat-thread-list,
    .chat-search-results,
    .checkbox-list,
    .settings-list,
    .memory-manager-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .chat-thread-card,
    .search-result-item {
      width: 100%;
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      text-align: left;
    }

    .chat-thread-main {
      min-width: 0;
    }

    .chat-thread-title,
    .search-result-title,
    .settings-item-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chat-thread-preview,
    .search-result-text {
      margin-top: 3px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.45;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chat-thread-meta {
      margin-top: 4px;
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.3;
    }

    .avatar-box {
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: var(--surface-muted);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
      flex: 0 0 auto;
    }

    .avatar-box.sm {
      width: 34px;
      height: 34px;
      border-radius: 14px;
    }

    .avatar-box.md {
      width: 48px;
      height: 48px;
      border-radius: 18px;
    }

    .avatar-box.call {
      width: 132px;
      height: 132px;
      border-radius: 50%;
    }

    .avatar-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .chat-screen {
      position: fixed;
      inset: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      height: var(--chat-visual-height, 100dvh);
    }

    .chat-topbar {
      background: var(--surface-glass);
    }

    .chat-person-head {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      text-align: left;
    }

    .chat-person-text {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .chat-person-name {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.25;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .chat-person-status {
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.25;
    }

    .chat-messages-area {
      flex: 1;
      overflow-x: hidden;
      overflow-y: auto;
      padding: calc(66px + env(safe-area-inset-top)) 20px calc(118px + env(safe-area-inset-bottom) + var(--chat-keyboard-offset, 0px));
      -webkit-overflow-scrolling: touch;
    }

    .chat-message-list {
      max-width: 760px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .message-row {
      display: flex;
      gap: var(--spacing-sm);
      width: 100%;
      align-items: flex-start;
    }

    .message-row.user {
      justify-content: flex-end;
      gap: 7px;
    }

    .message-row.assistant {
      justify-content: flex-start;
    }

    .message-body {
      max-width: min(78vw, 560px);
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .message-row.user .message-body {
      align-items: flex-end;
      max-width: min(68vw, 480px);
      order: 1;
    }

    .message-row.user .avatar-box {
      order: 2;
    }

    .message-row.assistant .message-body {
      align-items: flex-start;
    }

    .message-name {
      margin: 0 0 6px 4px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.3;
    }

    .message-row.user .message-name {
      margin: 0 2px 6px 0;
      align-self: flex-end;
      text-align: right;
    }

    .message-card {
      width: min(72vw, 480px);
      max-width: 100%;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .assistant-meta-card {
      width: 100%;
      padding: 9px 10px;
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .thinking-block,
    .tool-call-card {
      width: 100%;
      border-radius: var(--radius-md);
      overflow: hidden;
    }

    .thinking-block summary,
    .tool-call-card summary {
      list-style: none;
      cursor: pointer;
    }

    .thinking-block summary::-webkit-details-marker,
    .tool-call-card summary::-webkit-details-marker {
      display: none;
    }

    .thinking-summary {
      display: grid;
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1.85fr) 18px;
      align-items: center;
      gap: 8px;
      padding: 5px 1px;
    }

    .thinking-title-line {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      color: var(--text-primary);
      font-size: var(--font-size-small);
      font-weight: 600;
      line-height: 1.3;
      white-space: nowrap;
    }

    .thinking-time {
      color: var(--text-secondary);
      font-weight: 500;
      font-size: 12px;
    }

    .thinking-summary-text {
      min-width: 0;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .thinking-content {
      padding: 8px 2px 2px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.65;
      white-space: pre-wrap;
      overflow-wrap: break-word;
      word-break: normal;
      writing-mode: horizontal-tb;
    }

    .execution-connector {
      height: 16px;
      display: flex;
      align-items: stretch;
      padding-left: 10px;
    }

    .execution-line {
      width: 2px;
      height: 16px;
      border-radius: 999px;
      background: var(--text-hint);
      opacity: 0.55;
    }

    .tool-chain-block {
      display: flex;
      flex-direction: column;
    }

    .tool-call-summary {
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr) minmax(0, 1.5fr) 18px;
      align-items: center;
      gap: 8px;
      padding: 5px 0;
    }

    .tool-status-icon {
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .tool-call-title {
      min-width: 0;
      color: var(--text-primary);
      font-size: var(--font-size-small);
      font-weight: 600;
      line-height: 1.3;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tool-call-desc {
      min-width: 0;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tool-call-content {
      padding: 8px 2px 4px;
    }

    .memory-tool-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
      box-shadow: var(--shadow-sm);
    }

    .memory-tool-status-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .message-bubble {
      font-size: var(--chat-font-size, var(--font-size-base));
      line-height: 1.6;
      word-break: break-word;
    }

    .chat-screen.bubble-mode .message-bubble {
      padding: 10px 13px;
      border-radius: var(--bubble-radius);
      box-shadow: var(--shadow-sm);
    }

    .chat-screen.bubble-mode .message-row.user .message-bubble {
      background: var(--bubble-user-bg);
      color: var(--bubble-user-text);
    }

    .chat-screen.bubble-mode .message-row.assistant .message-bubble {
      background: var(--bubble-ai-bg);
      color: var(--bubble-ai-text);
    }

    .chat-screen.dialog-mode .message-row {
      margin: 2px 0 18px;
    }

    .chat-screen.dialog-mode .message-body {
      max-width: min(74vw, 560px);
    }

    .chat-screen.dialog-mode .message-row.user .message-body {
      max-width: min(68vw, 480px);
    }

    .chat-screen.dialog-mode .message-bubble {
      width: auto;
      max-width: 100%;
      background: transparent;
      color: var(--text-primary);
      box-shadow: none;
      padding: 0;
      border-radius: 0;
    }

    .chat-screen.dialog-mode .message-row.user .message-bubble {
      text-align: left;
    }

    .chat-search-hit {
      outline: 2px solid var(--accent);
      border-radius: var(--radius-md);
    }

    .message-rich {
      white-space: pre-wrap;
    }

    .message-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 5px;
      margin-top: 8px;
      color: var(--text-secondary);
    }

    .message-row.user .message-actions {
      justify-content: flex-end;
    }

    .message-action-btn {
      min-height: 26px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      padding: 4px 7px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: 11px;
      line-height: 1;
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
    }

    .message-action-btn:active {
      transform: scale(var(--press-scale));
    }

    .code-fold-card {
      margin: 8px 0;
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
    }

    .code-fold-summary {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) 18px;
      align-items: center;
      gap: var(--spacing-sm);
      padding: 10px 12px;
      color: var(--text-primary);
      font-size: var(--font-size-small);
      font-weight: 600;
      list-style: none;
      cursor: pointer;
    }

    .code-fold-summary::-webkit-details-marker {
      display: none;
    }

    .code-block {
      position: relative;
      margin: 0;
      max-height: 260px;
      overflow: auto;
      padding: 42px 12px 12px;
      background: var(--bg-card);
      color: var(--text-primary);
      font-size: 12px;
      line-height: 1.6;
      white-space: pre-wrap;
      box-shadow: none;
    }

    .code-block-copy {
      position: absolute;
      top: 8px;
      right: 8px;
      padding: 6px 9px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: 11px;
      box-shadow: var(--shadow-sm);
    }

    .tool-meta-value,
    .raw-message {
      margin: 0;
      max-height: 50vh;
      overflow: auto;
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: 12px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .tool-meta-label {
      margin: 8px 0 5px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.3;
    }

    .chat-input-bar {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 120;
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) 42px;
      align-items: end;
      gap: var(--spacing-sm);
      padding: 10px 20px calc(10px + env(safe-area-inset-bottom));
      background: var(--surface-glass);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      transform: translateY(calc(var(--chat-keyboard-offset, 0px) * -1));
      transition: transform 120ms ease;
      will-change: transform;
    }

    .chat-input-wrap {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
    }

    .chat-input,
    .textarea-card {
      width: 100%;
      min-height: 42px;
      padding: 10px 14px;
      border-radius: 18px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      line-height: 1.45;
      font-size: var(--chat-font-size, var(--font-size-base));
    }

    .chat-input {
      max-height: 132px;
    }

    .textarea-card {
      min-height: 128px;
      resize: none;
    }

    .quote-preview {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 32px;
      align-items: center;
      gap: var(--spacing-sm);
      padding: 8px 10px;
      border-radius: var(--radius-md);
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .quote-preview-text {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    .quick-reply-box {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
    }

    .quick-reply-box summary {
      cursor: pointer;
      list-style: none;
      margin-bottom: 6px;
    }

    .quick-reply-box summary::-webkit-details-marker {
      display: none;
    }

    .quick-reply-list {
      display: flex;
      gap: var(--spacing-xs);
      overflow-x: auto;
      padding-bottom: 2px;
    }

    .quick-reply-chip,
    .frequency-chip {
      flex: 0 0 auto;
      min-height: 34px;
      padding: 7px 12px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: 12px;
      box-shadow: var(--shadow-sm);
    }

    .frequency-chip.active {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .tool-pages {
      display: flex;
      overflow-x: auto;
      scroll-snap-type: x mandatory;
      gap: var(--spacing-md);
      padding-bottom: var(--spacing-sm);
    }

    .tool-page {
      flex: 0 0 100%;
      scroll-snap-align: start;
    }

    .tool-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--spacing-sm);
    }

    .tool-item {
      min-height: 78px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm);
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: var(--font-size-small);
    }

    .memory-page {
      position: fixed;
      inset: 0;
      z-index: 190;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .memory-page-nav {
      height: calc(66px + env(safe-area-inset-top));
      padding: calc(14px + env(safe-area-inset-top)) 20px 10px;
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) 44px;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .memory-page-title {
      font-size: 22px;
      font-weight: 600;
      line-height: 1.25;
    }

    .memory-page-area {
      flex: 1;
      overflow-y: auto;
      padding: 18px 20px calc(28px + env(safe-area-inset-bottom));
      display: flex;
      flex-direction: column;
      gap: var(--spacing-lg);
    }

    .memory-config-card,
    .memory-card,
    .mcp-server-card,
    .soft-note {
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .memory-config-card {
      padding: var(--spacing-md);
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .memory-setting-row {
      display: grid;
      grid-template-columns: 42px minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--spacing-md);
      padding: 10px 0;
    }

    .memory-setting-icon {
      color: var(--text-secondary);
    }

    .memory-setting-title,
    .memory-frequency-title,
    .memory-manage-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .memory-frequency-title {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .memory-frequency-desc {
      margin-top: 8px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .frequency-chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-md);
    }

    .frequency-chip.custom {
      display: inline-flex;
      align-items: center;
      gap: var(--spacing-xs);
    }

    .memory-manage-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-md);
    }

    .memory-card {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
    }

    .memory-card-content {
      color: var(--text-primary);
      font-size: var(--chat-font-size, var(--font-size-base));
      line-height: 1.6;
      word-break: break-word;
    }

    .memory-card-meta {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.35;
    }

    .memory-card-actions {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
    }

    .soft-note {
      padding: 12px 14px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .checkbox-row {
      min-height: 48px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 28px;
      align-items: center;
      gap: var(--spacing-sm);
      width: 100%;
      padding: 10px 12px;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-secondary);
      text-align: left;
    }

    .checkbox-row.active {
      color: var(--text-primary);
      background: var(--accent-light);
    }

    .checkbox-mark {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      color: var(--accent-dark);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .transfer-card {
      min-width: 180px;
      padding: 14px;
      border-radius: var(--radius-lg);
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .transfer-title {
      font-size: var(--font-size-small);
      color: var(--accent-dark);
    }

    .transfer-amount {
      margin-top: 4px;
      font-size: 22px;
      font-weight: 600;
      line-height: 1.25;
    }

    .sticker-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--spacing-sm);
      margin-top: var(--spacing-md);
    }

    .sticker-item {
      aspect-ratio: 1;
      overflow: hidden;
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .sticker-item img,
    .message-image,
    .message-sticker {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .message-image {
      max-width: min(64vw, 340px);
      height: auto;
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
    }

    .message-sticker {
      width: 118px;
      height: 118px;
      border-radius: var(--radius-lg);
    }

    .group-avatar-editor {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
    }

    .token-stats {
      margin-top: 5px;
      padding: 5px 9px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: 11px;
      line-height: 1.3;
    }

    .typing-dots {
      display: inline-flex;
      gap: 4px;
      padding: 6px;
    }

    .typing-dots span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      opacity: 0.45;
      animation: chat-dot 900ms ease-in-out infinite;
    }

    .typing-dots span:nth-child(2) {
      animation-delay: 120ms;
    }

    .typing-dots span:nth-child(3) {
      animation-delay: 240ms;
    }

    @keyframes chat-dot {
      0%, 100% {
        transform: translateY(0);
        opacity: 0.35;
      }
      50% {
        transform: translateY(-3px);
        opacity: 0.75;
      }
    }

    .call-screen {
      position: fixed;
      inset: 0;
      z-index: 180;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: calc(44px + env(safe-area-inset-top)) 20px calc(22px + env(safe-area-inset-bottom));
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .call-time {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    .call-screen .avatar-box.call {
      margin-top: 44px;
      box-shadow: var(--shadow-lg);
    }

    .call-screen .avatar-box.speaking {
      animation: call-pulse 1200ms ease-in-out infinite;
    }

    .call-name {
      margin-top: var(--spacing-lg);
      color: var(--text-primary);
      font-size: 24px;
      font-weight: 600;
      line-height: 1.3;
    }

    .call-status {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
    }

    .call-log {
      width: 100%;
      max-width: 520px;
      flex: 1;
      overflow-y: auto;
      margin: var(--spacing-lg) 0;
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .call-line {
      max-width: 82%;
      padding: 10px 13px;
      border-radius: var(--bubble-radius);
      box-shadow: var(--shadow-sm);
      font-size: var(--chat-font-size, var(--font-size-base));
      line-height: 1.6;
    }

    .call-line.user {
      align-self: flex-end;
      background: var(--bubble-user-bg);
      color: var(--bubble-user-text);
    }

    .call-line.ai {
      align-self: flex-start;
      background: var(--bubble-ai-bg);
      color: var(--bubble-ai-text);
    }

    .call-input-row {
      width: 100%;
      max-width: 520px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 44px;
      gap: var(--spacing-sm);
      align-items: end;
    }

    .call-input-row .textarea-card {
      min-height: 46px;
      max-height: 110px;
    }

    .call-hang {
      width: 58px;
      height: 58px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: var(--spacing-md);
      border-radius: 50%;
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-lg);
    }

    @keyframes call-pulse {
      0%, 100% {
        transform: scale(1);
        box-shadow: var(--shadow-lg);
      }
      50% {
        transform: scale(1.05);
        box-shadow: 0 8px 32px color-mix(in srgb, var(--accent) 28%, transparent);
      }
    }

    @media (min-width: 680px) {
      .tool-grid {
        grid-template-columns: repeat(6, minmax(0, 1fr));
      }
    }

    @media (max-width: 420px) {
      .assistant-meta-card {
        padding: 8px;
      }

      .chat-screen.dialog-mode .message-body {
        max-width: min(72vw, 520px);
      }

      .chat-screen.dialog-mode .message-row.user .message-body,
      .message-row.user .message-body {
        max-width: min(64vw, 420px);
      }

      .message-card {
        width: min(76vw, 420px);
      }

      .thinking-summary {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) 18px;
      }

      .tool-call-summary {
        grid-template-columns: 22px minmax(0, 1fr) minmax(0, 1fr) 18px;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../core/storage.js 的 getData/setData/generateId/getNow/getAllDB/getDB/setDB/deleteDB/getByIndexDB/compressImage；../core/api.js 的 streamMessage/silentRequest；../core/memory.js 的 buildMemoryPrompt/checkAndSummarize/checkImportantInfo；../core/tts.js 的 playTTS/stopAll；../core/mcp.js 的 getMcpServers/callMcpTool/buildMcpContext/listMcpTools；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon
