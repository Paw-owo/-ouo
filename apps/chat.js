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
const ACTIVE_CHECK_INTERVAL = 30 * 1000;
const PROACTIVE_SCAN_INTERVAL = 60 * 1000;
const WEATHER_CACHE_TIME = 30 * 60 * 1000;
const MOMENT_COOLDOWN = 2 * 60 * 60 * 1000;
const TOKEN_STATS_KEY = 'chat_token_stats';

const DEFAULT_CHAT_CONFIG = {
  endpointId: '',
  model: '',
  ttsEnabled: false,
  mcpEnabled: false,
  enabledMcpServerIds: [],
  streamEnabled: true,
  memoryEnabled: true,
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
let activeTimers = [];
let activeMode2Timer = null;
let activeCallTimer = null;
let activeCallStartedAt = null;
let injectedStyle = false;
let longPressTimer = null;
let mcpContextBuffer = '';
let quotedMessage = null;

export async function mount(containerEl) {
  mountedContainer = containerEl;
  injectStyle();

  rootEl = el('section', 'app-screen chat-app');
  mountedContainer.innerHTML = '';
  mountedContainer.appendChild(rootEl);

  await loadBaseData();
  renderList();
  await scanProactiveAll();

  activeTimers.push(window.setInterval(scanProactiveAll, PROACTIVE_SCAN_INTERVAL));
  activeTimers.push(window.setInterval(checkActiveMode2, ACTIVE_CHECK_INTERVAL));

  document.addEventListener('visibilitychange', handleVisibilityChange);
}

export function unmount() {
  stopAll();
  stopActiveTts();
  hideBottomSheet();
  clearLongPress();

  activeTimers.forEach((timer) => window.clearInterval(timer));
  activeTimers = [];

  if (activeMode2Timer) {
    window.clearTimeout(activeMode2Timer);
    activeMode2Timer = null;
  }

  if (activeCallTimer) {
    window.clearInterval(activeCallTimer);
    activeCallTimer = null;
  }

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
  quotedMessage = null;
  isSending = false;
  mcpContextBuffer = '';
}

export async function recordExternalInteraction({ characterId, role = 'assistant', content = '', source = '外部互动' } = {}) {
  const cleanCharacterId = String(characterId || '').trim();
  const cleanContent = String(content || '').trim();

  if (!cleanCharacterId || !cleanContent) {
    return null;
  }

  const character = await getDB('characters', cleanCharacterId);
  if (!character) {
    return null;
  }

  const normalizedRole = role === 'user' ? 'user' : 'assistant';
  const message = createMessage({
    role: normalizedRole,
    content: `[${source || '外部互动'}] ${cleanContent}`,
    characterId: cleanCharacterId,
    type: 'text'
  });

  await setDB('messages', message.id, message);
  await updateLatestCache(cleanCharacterId);

  const isCurrentOpen = currentCharacter?.id === cleanCharacterId;

  if (isCurrentOpen) {
    currentMessages.push(message);
    await markRead(cleanCharacterId);
    renderChatScreen();
  } else if (normalizedRole === 'assistant') {
    addUnread(cleanCharacterId, 1);
    window.AppEvents?.emit?.('badge:chat', {
      characterId: cleanCharacterId,
      count: getUnreadCount(cleanCharacterId)
    });
    window.refreshDesktopBadges?.();
  }

  try {
    const recent = await getByIndexDB('messages', 'characterId', cleanCharacterId);
    await checkImportantInfo(cleanCharacterId, recent);
    await checkAndSummarize(cleanCharacterId);
  } catch (error) {
    console.warn('[chat] recordExternalInteraction memory failed', error);
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

  stopAll();
  stopActiveTts();
  currentCharacter = null;
  currentGroup = null;
  currentMessages = [];
  visibleCount = PAGE_SIZE;
  quotedMessage = null;

  rootEl.innerHTML = '';

  const nav = el('div', 'nav-bar');
  const backButton = iconButton('back', '返回');
  backButton.addEventListener('click', () => window.closeCurrentApp?.());

  const titleWrap = el('div', 'chat-nav-title');
  titleWrap.append(
    el('div', 'nav-title', '聊天'),
    el('div', 'nav-subtitle', '消息、通话和主动问候')
  );

  const addButton = iconButton('add', '新建群聊');
  addButton.addEventListener('click', openGroupCreateSheet);

  nav.append(backButton, titleWrap, addButton);

  const content = el('div', 'content-area chat-list-area');
  const wrap = el('div', 'content-narrow chat-list-wrap');

  const searchInput = input('搜索聊天记录');
  searchInput.className = 'input-card chat-search';
  searchInput.addEventListener('input', () => handleSearch(searchInput.value.trim(), resultsBox));

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

  const resultsBox = el('div', 'chat-search-results');
  const list = el('div', 'chat-thread-list');

  wrap.append(searchInput, tabs, resultsBox);

  if (currentTab === 'private') {
    if (!characters.length) {
      wrap.appendChild(emptyState('还没有角色', '先去角色应用创建一个角色，再回来聊天。'));
    } else {
      characters
        .slice()
        .sort((a, b) => getLastMessageTime(b.id).localeCompare(getLastMessageTime(a.id)))
        .forEach((character) => {
          list.appendChild(createPrivateThreadCard(character));
        });
      wrap.appendChild(list);
    }
  } else {
    if (!groups.length) {
      wrap.appendChild(emptyState('还没有群聊', '点击右上角创建一个群聊。'));
    } else {
      groups
        .slice()
        .sort((a, b) => getLastGroupMessageTime(b.id).localeCompare(getLastGroupMessageTime(a.id)))
        .forEach((group) => {
          list.appendChild(createGroupThreadCard(group));
        });
      wrap.appendChild(list);
    }
  }

  content.appendChild(wrap);
  rootEl.append(nav, content);
  refreshUnreadBadges();
}

function createPrivateThreadCard(character) {
  const card = el('button', 'chat-thread-card');
  card.type = 'button';

  const avatar = createAvatar(character.avatar, character.name, 'md');
  const main = el('div', 'chat-thread-main');
  const latest = getCachedLatestPreview(character.id);
  const unread = getUnreadCount(character.id);

  main.append(
    el('div', 'chat-thread-title', character.name || '未命名角色'),
    el('div', 'chat-thread-preview', latest.preview || getPromptPreview(character)),
    el('div', 'chat-thread-meta', latest.time ? formatRelativeTime(latest.time) : getMoodText(character.mood))
  );

  const right = el('div', 'chat-thread-right');
  if (unread > 0) {
    const badge = el('span', 'badge');
    badge.textContent = unread > 99 ? '99+' : String(unread);
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
  const main = el('div', 'chat-thread-main');
  const latest = getCachedLatestGroupPreview(group.id);

  main.append(
    el('div', 'chat-thread-title', group.name || '未命名群聊'),
    el('div', 'chat-thread-preview', latest.preview || `${group.memberIds?.length || 0} 个成员`),
    el('div', 'chat-thread-meta', latest.time ? formatRelativeTime(latest.time) : '群聊')
  );

  card.append(avatar, main, el('div', 'chat-thread-right'));
  card.addEventListener('click', () => openGroupChat(group.id));

  return card;
}

async function openPrivateChat(characterId) {
  await loadBaseData();

  const character = characters.find((item) => item.id === characterId) || await getDB('characters', characterId);
  if (!character) {
    showToast('角色不存在');
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

  await markRead(characterId);
  await loadPrivateMessages(characterId);
  renderChatScreen();
  scheduleMode2();
}

async function openGroupChat(groupId) {
  await loadBaseData();

  const group = groups.find((item) => item.id === groupId) || await getDB('groups', groupId);
  if (!group) {
    showToast('群聊不存在');
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

  const isGroup = Boolean(currentGroup);
  const title = isGroup ? currentGroup.name : currentCharacter.name;
  const avatar = isGroup ? currentGroup.avatar : currentCharacter.avatar;
  const subtitle = isGroup ? `${currentGroup.memberIds?.length || 0} 个成员` : getOnlineText();

  rootEl.innerHTML = '';

  const screen = el('section', 'chat-screen');

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
  person.append(
    createAvatar(avatar, title, 'sm'),
    el('span', 'chat-person-text')
  );
  person.querySelector('.chat-person-text').append(
    el('span', 'chat-person-name', title || '聊天'),
    el('span', 'chat-person-status', subtitle)
  );

  const phoneButton = iconButton('phone', '打电话');
  phoneButton.disabled = isGroup;
  phoneButton.addEventListener('click', openCallUI);

  const moreButton = iconButton('more', '更多');
  moreButton.addEventListener('click', openChatMoreSheet);

  nav.append(backButton, person, phoneButton, moreButton);

  const content = el('div', 'chat-messages-area');
  content.id = 'chat-messages-area';

  const messageList = el('div', 'message-list chat-message-list');
  messageList.id = 'chat-message-list';

  const visibleMessages = currentMessages.slice(Math.max(0, currentMessages.length - visibleCount));

  if (currentMessages.length > visibleCount) {
    const more = button('加载更早消息', 'ghost', 'arrow-down');
    more.className += ' load-more-button';
    more.addEventListener('click', () => {
      visibleCount += PAGE_SIZE;
      renderChatScreen();
      requestAnimationFrame(() => {
        document.getElementById('chat-messages-area')?.scrollTo({ top: 0 });
      });
    });
    messageList.appendChild(more);
  }

  visibleMessages.forEach((message) => {
    messageList.appendChild(createMessageRow(message, isGroup));
  });

  content.appendChild(messageList);

  const inputBar = createInputBar();

  screen.append(nav, content, inputBar);
  rootEl.appendChild(screen);

  scrollToBottom(false);
}

function applyChatBackground(screen, character) {
  const bg = character?.chatBackground || {};

  if (bg.type === 'color' && bg.value) {
    screen.style.background = bg.value;
  }

  if (bg.type === 'image' && bg.value) {
    screen.style.backgroundImage = `url("${bg.value}")`;
    screen.style.backgroundSize = 'cover';
    screen.style.backgroundPosition = 'center';
    screen.style.backgroundRepeat = 'no-repeat';
  }
}

function createInputBar() {
  const bar = el('div', 'chat-input-bar');

  const plusButton = iconButton('add', '展开工具');
  plusButton.addEventListener('click', openToolSheet);

  const wrap = el('div', 'chat-input-wrap');
  const quoteBox = createQuotePreview();
  const quickBar = createQuickReplyBar();
  const textarea = document.createElement('textarea');
  textarea.className = 'chat-input';
  textarea.placeholder = currentGroup ? '给群聊发消息' : '输入消息';
  textarea.rows = 1;

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(132, textarea.scrollHeight)}px`;
  });

  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendCurrentText(textarea);
    }
  });

  if (quoteBox) wrap.appendChild(quoteBox);
  wrap.append(quickBar, textarea);

  const sendButton = iconButton('send', '发送');
  sendButton.classList.add('accent');
  sendButton.addEventListener('click', () => sendCurrentText(textarea));

  bar.append(plusButton, wrap, sendButton);
  return bar;
}

function createQuotePreview() {
  if (!quotedMessage) return null;

  const box = el('div', 'quote-preview');
  const text = el('div', 'quote-preview-text', `${getSpeakerName(quotedMessage.characterId)}：${getMessagePreview(quotedMessage)}`);
  const close = iconButton('close', '取消引用');
  close.addEventListener('click', () => {
    quotedMessage = null;
    renderChatScreen();
  });

  box.append(text, close);
  return box;
}

function createQuickReplyBar() {
  const replies = currentCharacter?.quickReplies || [];
  const box = el('details', 'quick-reply-box');

  if (!replies.length || currentGroup) return box;

  const summary = document.createElement('summary');
  summary.textContent = '快捷回复';

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

async function sendCurrentText(textarea) {
  const text = textarea.value.trim();
  if (!text) return;

  textarea.value = '';
  textarea.style.height = 'auto';
  await sendText(text);
}

async function sendText(text) {
  if (isSending) {
    showToast('正在回复中');
    return;
  }

  const finalText = buildQuotedContent(text);

  if (currentGroup) {
    await sendGroupMessage(finalText);
    return;
  }

  if (!currentCharacter) return;

  const characterId = currentCharacter.id;

  const userMessage = createMessage({
    role: 'user',
    content: finalText,
    characterId,
    type: 'text'
  });

  quotedMessage = null;

  await setDB('messages', userMessage.id, userMessage);
  currentMessages.push(userMessage);

  const config = getChatConfig(characterId);
  config.proactiveAwaitingUserReply = false;
  saveChatConfig(characterId, config);
  await markRead(characterId);

  renderChatScreen();
  await generateAssistantReply();
}

function buildQuotedContent(text) {
  if (!quotedMessage) return text;

  const quoteText = getMessagePreview(quotedMessage, true).slice(0, 300);
  const speaker = getSpeakerName(quotedMessage.characterId);

  return `引用${speaker}的消息：${quoteText}\n我的回复：${text}`;
}

async function sendGroupMessage(text) {
  if (!currentGroup) return;

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
  renderChatScreen();

  const members = shuffleArray(currentGroup.memberIds || [])
    .map((id) => characters.find((character) => character.id === id))
    .filter(Boolean);

  for (const character of members) {
    await delay(800 + Math.random() * 1700);
    await generateGroupAssistantReply(character);
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

  const endpointId = resolveEndpointId(currentCharacter, config);
  const model = resolveModel(currentCharacter, config);

  let finalContent = '';
  let finalThinking = '';

  if (config.streamEnabled !== false) {
    await streamMessage({
      messages: contextMessages,
      systemPrompt,
      endpointId,
      model,
      temperature: 0.8,
      onChunk: (chunk) => {
        finalContent += chunk.content || '';
        finalThinking += chunk.thinking ? `\n${chunk.thinking}` : '';

        assistantMessage.content = finalContent;
        assistantMessage.thinking = finalThinking.trim() || null;
        renderMessagePatch(assistantMessage);
      },
      onDone: async ({ content, thinking }) => {
        assistantMessage.content = content || finalContent || '我刚才有点走神了，你再和我说一次好吗？';
        assistantMessage.thinking = thinking || finalThinking || null;
      },
      onError: () => {
        assistantMessage.content = '刚才连接不太顺，再试一次好吗？';
      }
    });
  } else {
    const content = await silentRequest({
      messages: contextMessages,
      systemPrompt,
      endpointId,
      model,
      temperature: 0.8
    });
    assistantMessage.content = content || '刚才连接不太顺，再试一次好吗？';
  }

  await setDB('messages', assistantMessage.id, assistantMessage);
  saveTokenStats(assistantMessage.id, {
    input: tokenInput,
    output: estimateTokens(assistantMessage.content || ''),
    total: tokenInput + estimateTokens(assistantMessage.content || ''),
    timestamp: getNow()
  });

  currentMessages = currentMessages.map((message) => {
    return message.id === assistantMessage.id ? assistantMessage : message;
  });

  await updateLatestCache(characterId);
  await afterAssistantReply(characterId, assistantMessage);
  await markRead(characterId);

  isSending = false;
  renderChatScreen();

  if (config.ttsEnabled && currentCharacter.ttsConfig?.enabled) {
    stopActiveTts();
    activeTts = playTTS(assistantMessage.content, currentCharacter.ttsConfig);
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

  currentMessages.push(assistantMessage);
  renderChatScreen();
  showTyping(assistantMessage.id);

  const contextMessages = currentMessages
    .filter((message) => message.id !== assistantMessage.id)
    .slice(-24)
    .map((message) => ({
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: `${getSpeakerName(message.characterId)}：${message.content}`
    }));

  const systemPrompt = await buildSystemPrompt(character, getChatConfig(character.id), '你正在群聊里回复。可以自然提到其他成员刚才说的话，但不要替别人说话。');

  const content = await silentRequest({
    messages: contextMessages,
    systemPrompt,
    endpointId: resolveEndpointId(character, getChatConfig(character.id)),
    model: resolveModel(character, getChatConfig(character.id)),
    temperature: 0.85
  });

  assistantMessage.content = content || '我先想一想。';
  await setDB('group_messages', assistantMessage.id, assistantMessage);
  saveTokenStats(assistantMessage.id, {
    input: estimateTokens(systemPrompt + '\n' + contextMessages.map((item) => item.content).join('\n')),
    output: estimateTokens(assistantMessage.content || ''),
    total: estimateTokens(systemPrompt + '\n' + contextMessages.map((item) => item.content).join('\n')) + estimateTokens(assistantMessage.content || ''),
    timestamp: getNow()
  });

  currentMessages = currentMessages.map((message) => {
    return message.id === assistantMessage.id ? assistantMessage : message;
  });

  renderChatScreen();
}

async function afterAssistantReply(characterId, assistantMessage) {
  try {
    await checkAndSummarize(characterId);
    await checkImportantInfo(characterId, currentMessages);
    await maybeAutoMoment(characterId, assistantMessage);
  } catch (error) {
    console.warn('[chat] background tasks failed', error);
  }
}

async function buildSystemPrompt(character, config, extraInstruction = '') {
  const parts = [];

  if (character.systemPrompt) {
    parts.push(character.systemPrompt);
  } else {
    parts.push(`你是${character.name || 'AI'}，请用自然、贴近关系的方式和用户聊天。`);
  }

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

  if (mcpContextBuffer) {
    parts.push(mcpContextBuffer);
  }

  parts.push(buildTimePrompt());

  if (extraInstruction) {
    parts.push(`[额外要求]\n${extraInstruction}`);
  }

  return parts.join('\n\n');
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
    const response = await fetch('https://wttr.in/?format=j1', {
      method: 'GET',
      cache: 'no-store'
    });

    if (!response.ok) return '';

    const data = await response.json();
    const current = data.current_condition?.[0] || {};
    const area = data.nearest_area?.[0] || {};
    const city = area.areaName?.[0]?.value || area.region?.[0]?.value || '当前位置';
    const temp = current.temp_C ? `${current.temp_C}℃` : '';
    const desc = current.lang_zh?.[0]?.value || current.weatherDesc?.[0]?.value || '';
    const text = [city, temp, desc].filter(Boolean).join(' · ');

    if (!text) return '';

    setData('weather_cache', {
      data: { city, temp, desc, text },
      timestamp: now
    });

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

function createMessageRow(message, isGroup = false) {
  const isUser = message.role === 'user';
  const row = el('article', `message-row ${isUser ? 'user' : 'assistant'}`);
  row.dataset.messageId = message.id;

  const avatar = isUser
    ? createAvatar(getSettings().user.avatar, getSettings().user.name || '我', 'sm')
    : createAvatar(getSpeakerAvatar(message.characterId), getSpeakerName(message.characterId), 'sm');

  const body = el('div', 'message-body');

  if (!isUser) {
    body.appendChild(el('div', 'message-name', isGroup ? getSpeakerName(message.characterId) : (currentCharacter?.name || 'AI')));
  }

  const bubble = el('div', 'message-bubble');
  bubble.dataset.bubble = message.id;

  if (message.thinking) {
    bubble.appendChild(createThinkingBlock(message.thinking));
  }

  if (message.type === 'image' && message.imageBase64) {
    const img = document.createElement('img');
    img.src = message.imageBase64;
    img.alt = '';
    img.className = 'message-image';
    bubble.appendChild(img);

    if (message.content) {
      bubble.appendChild(renderRichText(message.content));
    }
  } else if (message.type === 'sticker' && message.stickerId) {
    const sticker = stickers.find((item) => item.id === message.stickerId);
    if (sticker?.image) {
      const img = document.createElement('img');
      img.src = sticker.image;
      img.alt = '';
      img.className = 'message-sticker';
      bubble.appendChild(img);
    }
    if (message.content) bubble.appendChild(el('div', '', message.content));
  } else if (message.type === 'transfer') {
    bubble.appendChild(createTransferCard(message.transferAmount));
  } else {
    bubble.appendChild(renderRichText(message.content || ''));
  }

  body.appendChild(bubble);

  if (!isUser) {
    const config = getChatConfig(message.characterId);
    if (config.tokenStatsEnabled) {
      const stats = getTokenStats(message.id);
      if (stats) body.appendChild(createTokenStats(stats));
    }

    body.appendChild(createAssistantActions(message));
  }

  const longPressTarget = bubble;
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

  return row;
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
  const block = el('pre', 'code-block');
  const code = el('code');
  const firstLine = String(raw || '').split('\n')[0] || '';
  const hasLang = firstLine.length < 24 && /^[a-zA-Z0-9_-]+$/.test(firstLine.trim());
  const lang = hasLang ? firstLine.trim() : 'code';
  const content = hasLang ? String(raw).split('\n').slice(1).join('\n') : String(raw || '');

  const label = el('span', 'code-block-label', lang);
  const copy = el('button', 'code-block-copy', '复制');
  copy.type = 'button';
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(content);
      copy.textContent = '已复制';
      window.setTimeout(() => copy.textContent = '复制', 1000);
    } catch (_) {
      showToast('复制失败');
    }
  });

  const expand = el('button', 'code-expand', '展开全部');
  expand.type = 'button';
  expand.addEventListener('click', () => {
    block.classList.toggle('expanded');
    expand.textContent = block.classList.contains('expanded') ? '收起' : '展开全部';
  });

  code.textContent = content;
  block.append(label, copy, code, expand);
  return block;
}

function createThinkingBlock(text) {
  const details = document.createElement('details');
  details.className = 'thinking-card';

  const summary = document.createElement('summary');
  summary.textContent = '查看思维过程';

  const content = el('div', 'thinking-content', text);
  details.append(summary, content);
  return details;
}

function createAssistantActions(message) {
  const actions = el('div', 'assistant-actions');

  const play = iconButton('play', '播放');
  play.addEventListener('click', () => {
    if (activeTts) {
      stopActiveTts();
      return;
    }

    const character = characters.find((item) => item.id === message.characterId) || currentCharacter;
    activeTts = playTTS(message.content, character?.ttsConfig);
  });

  actions.appendChild(play);
  return actions;
}

function createTokenStats(stats) {
  const box = el('div', 'token-stats');
  box.textContent = `Token估算：输入 ${stats.input || 0} · 输出 ${stats.output || 0} · 合计 ${stats.total || 0}`;
  return box;
}

function createTransferCard(amount) {
  const card = el('div', 'transfer-card');
  card.append(
    el('div', 'transfer-title', '转账'),
    el('div', 'transfer-amount', `${Number(amount || 0).toFixed(2)} 元`)
  );
  return card;
}

function showTyping(messageId) {
  const bubble = document.querySelector(`[data-bubble="${messageId}"]`);
  if (!bubble) return;

  bubble.innerHTML = '';
  const dots = el('span', 'typing-dots');
  dots.append(el('span'), el('span'), el('span'));
  bubble.appendChild(dots);
  scrollToBottom(true);
}

function renderMessagePatch(message) {
  const bubble = document.querySelector(`[data-bubble="${message.id}"]`);
  if (!bubble) return;

  bubble.innerHTML = '';

  if (message.thinking) {
    bubble.appendChild(createThinkingBlock(message.thinking));
  }

  bubble.appendChild(renderRichText(message.content || ''));
  scrollToBottom(true);
}

function openToolSheet() {
  const sheet = el('div', 'tool-sheet');

  sheet.append(
    el('div', 'sheet-title', '工具'),
    createToolGrid([
      { icon: 'mic', label: '文字语音', action: () => showToast('当前版本用文字输入，避免 iOS 不兼容') },
      { icon: 'phone', label: '打电话', action: openCallUI },
      { icon: 'image', label: '发图片', action: openImagePicker },
      { icon: 'smile', label: '表情包', action: openStickerPanel },
      { icon: 'mcp', label: 'MCP 工具', action: openMcpPanel },
      { icon: 'memory', label: '记忆管理', action: openMemoryPanel },
      { icon: 'settings', label: '配置切换', action: openConfigSheet },
      { icon: 'clear', label: '清空上下文', action: clearContext },
      { icon: 'transfer', label: '转账', action: openTransferSheet }
    ])
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

function openConfigSheet() {
  if (!currentCharacter && !currentGroup) return;

  const id = currentCharacter?.id || currentGroup?.id;
  const config = getChatConfig(id);
  const settings = getSettings();

  const sheet = el('div', 'config-sheet');
  sheet.append(
    el('div', 'sheet-title', '配置切换'),
    el('div', 'sheet-description', '这些设置只保存到当前对话。')
  );

  const apiPanel = detailsBlock('API 与回复');
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

  apiPanel.append(
    field('API 端点', endpointSelect),
    field('模型', modelInput),
    customRow('流式输出', switchButton(config.streamEnabled !== false, (active) => {
      config.streamEnabled = active;
      saveChatConfig(id, config);
    })),
    customRow('记忆注入', switchButton(config.memoryEnabled !== false, (active) => {
      config.memoryEnabled = active;
      saveChatConfig(id, config);
    })),
    customRow('Token估算', switchButton(Boolean(config.tokenStatsEnabled), (active) => {
      config.tokenStatsEnabled = active;
      saveChatConfig(id, config);
      renderChatScreen();
    })),
    customRow('自动发朋友圈', switchButton(Boolean(config.autoMomentEnabled), (active) => {
      config.autoMomentEnabled = active;
      saveChatConfig(id, config);
    }))
  );

  const ttsPanel = detailsBlock('TTS');
  ttsPanel.append(
    customRow('本对话启用 TTS', switchButton(Boolean(config.ttsEnabled), (active) => {
      config.ttsEnabled = active;
      saveChatConfig(id, config);
    })),
    createSoftNote('角色自身也需要在角色设置里启用 TTS。')
  );

  const mcpPanel = detailsBlock('MCP');
  const servers = getMcpServers();
  const serverList = el('div', 'checkbox-list');

  if (!servers.length) {
    serverList.appendChild(createSoftNote('设置里还没有启用 MCP 服务器。'));
  } else {
    servers.forEach((server) => {
      serverList.appendChild(checkboxRow(server.name || server.url, config.enabledMcpServerIds.includes(server.id), (checked) => {
        config.enabledMcpServerIds = toggleId(config.enabledMcpServerIds, server.id, checked);
        saveChatConfig(id, config);
      }));
    });
  }

  mcpPanel.append(
    customRow('启用 MCP', switchButton(Boolean(config.mcpEnabled), (active) => {
      config.mcpEnabled = active;
      saveChatConfig(id, config);
    })),
    serverList
  );

  const proactivePanel = detailsBlock('AI 主动消息');
  proactivePanel.append(
    createSoftNote('网页关闭时不能后台运行。下次打开或停留聊天页时会检查是否触发。'),
    customRow('模式一：30分钟未回复', switchButton(Boolean(config.proactiveMode1Enabled), (active) => {
      config.proactiveMode1Enabled = active;
      saveChatConfig(id, config);
    })),
    field('模式一等待分钟', numberInput(config.proactiveMode1Minutes, 5, 240, (value) => {
      config.proactiveMode1Minutes = value;
      saveChatConfig(id, config);
    })),
    customRow('模式二：在线停留', switchButton(Boolean(config.proactiveMode2Enabled), (active) => {
      config.proactiveMode2Enabled = active;
      saveChatConfig(id, config);
      scheduleMode2();
    })),
    field('模式二最短分钟', numberInput(config.proactiveMode2MinMinutes, 1, 120, (value) => {
      config.proactiveMode2MinMinutes = value;
      saveChatConfig(id, config);
      scheduleMode2();
    })),
    field('模式二最长分钟', numberInput(config.proactiveMode2MaxMinutes, 1, 180, (value) => {
      config.proactiveMode2MaxMinutes = value;
      saveChatConfig(id, config);
      scheduleMode2();
    })),
    field('主动率', rangeInput(config.proactiveChance, 0, 100, '%', (value) => {
      config.proactiveChance = value;
      saveChatConfig(id, config);
    }))
  );

  sheet.append(apiPanel, ttsPanel, mcpPanel, proactivePanel);

  showBottomSheet(sheet);
}

function openChatMoreSheet() {
  const sheet = el('div');
  sheet.append(
    el('div', 'sheet-title', '更多'),
    createToolGrid([
      { icon: 'settings', label: '配置切换', action: openConfigSheet },
      { icon: 'clear', label: '清空聊天', action: clearAllMessages },
      { icon: 'copy', label: '导出文本', action: exportChatText },
      { icon: 'refresh', label: '主动检查', action: scanProactiveAll }
    ])
  );

  showBottomSheet(sheet);
}

async function openImagePicker() {
  if (!currentCharacter) {
    showToast('群聊暂不支持发图片');
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
      showToast('图片处理失败');
    }
  });

  file.click();
}

function openStickerPanel() {
  if (!currentCharacter) {
    showToast('群聊暂不支持表情包');
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

  const search = input('搜索描述或标签');
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

    if (!grid.children.length) {
      grid.appendChild(createSoftNote('没有匹配的表情包。'));
    }
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
    showToast('请先在配置切换里启用 MCP');
    return;
  }

  const servers = getMcpServers().filter((server) => config.enabledMcpServerIds.includes(server.id));
  const sheet = el('div');
  sheet.append(el('div', 'sheet-title', 'MCP 工具'));

  if (!servers.length) {
    sheet.appendChild(createSoftNote('没有选择 MCP 服务器。'));
    showBottomSheet(sheet);
    return;
  }

  const list = el('div', 'settings-list');

  for (const server of servers) {
    const tools = await listMcpTools(server.id);
    const card = el('div', 'mcp-server-card');
    card.appendChild(el('div', 'settings-item-title', server.name || 'MCP'));

    if (!tools.length) {
      card.appendChild(createSoftNote('没有可用工具。'));
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
    el('div', 'sheet-description', tool.description || '填写 JSON 参数后调用。')
  );

  const params = textarea('JSON 参数，例如 {}', '{}');
  const run = button('调用并注入上下文', 'primary', 'check');

  run.addEventListener('click', async () => {
    try {
      const data = JSON.parse(params.value || '{}');
      const result = await callMcpTool(server.id, tool.name, data);
      const context = buildMcpContext(server.id, tool.name, result);
      if (context) {
        mcpContextBuffer += context;
        showToast('工具结果已加入下一轮上下文');
      }
      hideBottomSheet();
    } catch (_) {
      showToast('JSON 参数格式不正确');
    }
  });

  sheet.append(field('参数', params), run);
  showBottomSheet(sheet);
}

function openMemoryPanel() {
  if (!currentCharacter) {
    showToast('群聊暂不支持记忆管理');
    return;
  }

  const sheet = el('div');
  sheet.append(
    el('div', 'sheet-title', '记忆管理'),
    createSoftNote('完整记忆管理在角色应用里。这里会显示当前是否启用记忆注入。')
  );

  const config = getChatConfig(currentCharacter.id);
  sheet.appendChild(customRow('记忆注入', switchButton(config.memoryEnabled !== false, (active) => {
    config.memoryEnabled = active;
    saveChatConfig(currentCharacter.id, config);
  })));

  showBottomSheet(sheet);
}

async function clearContext() {
  if (!currentCharacter && !currentGroup) return;

  const ok = await showConfirm('只清空本轮额外上下文，不删除聊天记录。继续吗？');
  if (!ok) return;

  mcpContextBuffer = '';
  showToast('上下文已清空');
}

async function clearAllMessages() {
  const ok = await showConfirm('确定清空这个对话的聊天记录吗？');
  if (!ok) return;

  if (currentCharacter) {
    for (const message of currentMessages) {
      await deleteDB('messages', message.id);
    }
    await markRead(currentCharacter.id);
    await updateLatestCache(currentCharacter.id);
    currentMessages = [];
  }

  if (currentGroup) {
    for (const message of currentMessages) {
      await deleteDB('group_messages', message.id);
    }
    currentMessages = [];
  }

  quotedMessage = null;
  showToast('已清空');
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

function openTransferSheet() {
  if (!currentCharacter) {
    showToast('群聊暂不支持转账');
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
      showToast('请输入金额');
      return;
    }

    const wallet = getData('wallet') || { balance: 0, records: [] };
    const balance = Number(wallet.balance || 0);

    if (balance < value) {
      showToast('余额不足');
      return;
    }

    wallet.balance = balance - value;
    wallet.records = Array.isArray(wallet.records) ? wallet.records : [];
    wallet.records.unshift({
      id: generateId(),
      type: 'expense',
      amount: -value,
      description: `转账给 ${currentCharacter.name || 'AI'}`,
      timestamp: getNow()
    });
    setData('wallet', wallet);

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

function openMessageActions(message) {
  clearLongPress();

  const sheet = el('div');
  sheet.appendChild(el('div', 'sheet-title', '消息操作'));

  const actions = [];

  actions.push({ label: '引用回复', icon: 'copy', action: () => quoteMessage(message) });

  if (message.role === 'assistant') {
    actions.push(
      { label: '重新生成', icon: 'refresh', action: () => regenerateFrom(message) },
      { label: '续写', icon: 'edit', action: () => continueFrom(message) }
    );
  } else {
    actions.push({ label: '编辑并重发', icon: 'edit', action: () => editUserMessage(message) });
  }

  actions.push(
    { label: '复制', icon: 'copy', action: () => copyText(message.content || '') },
    { label: '删除', icon: 'delete', action: () => deleteMessage(message) },
    { label: '查看原始内容', icon: 'eye', action: () => showRawMessage(message) }
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

  if (!currentCharacter) return;
  await generateAssistantReply(`请接着你上一条回复继续写，不要重复开头。上一条回复是：${message.content}`);
}

function editUserMessage(message) {
  hideBottomSheet();

  const sheet = el('div');
  sheet.appendChild(el('div', 'sheet-title', '编辑消息'));

  const edit = textarea('编辑消息', message.content || '');
  const save = button('保存并重新生成', 'primary', 'check');

  save.addEventListener('click', async () => {
    const content = edit.value.trim();
    if (!content) {
      showToast('内容不能为空');
      return;
    }

    message.content = content;
    await setDB('messages', message.id, message);

    const index = currentMessages.findIndex((item) => item.id === message.id);
    const after = currentMessages.slice(index + 1);

    for (const item of after) {
      await deleteDB('messages', item.id);
    }

    currentMessages = currentMessages.slice(0, index + 1);

    hideBottomSheet();
    renderChatScreen();
    await generateAssistantReply();
  });

  sheet.append(field('内容', edit), save);
  showBottomSheet(sheet);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('已复制');
  } catch (_) {
    showToast('复制失败');
  }
}

async function deleteMessage(message) {
  hideBottomSheet();

  const ok = await showConfirm('确定删除这条消息吗？');
  if (!ok) return;

  if (currentGroup) {
    await deleteDB('group_messages', message.id);
  } else {
    await deleteDB('messages', message.id);
  }

  currentMessages = currentMessages.filter((item) => item.id !== message.id);
  renderChatScreen();
}

function showRawMessage(message) {
  const sheet = el('div');
  sheet.append(
    el('div', 'sheet-title', '原始内容'),
    el('pre', 'raw-message', JSON.stringify(message, null, 2))
  );
  showBottomSheet(sheet);
}

function openCallUI() {
  if (!currentCharacter) {
    showToast('群聊暂不支持通话');
    return;
  }

  hideBottomSheet();
  stopAll();
  stopActiveTts();

  const call = el('section', 'call-screen');
  const top = el('div', 'call-time', '00:00');
  const avatar = createAvatar(currentCharacter.avatar, currentCharacter.name, 'call');
  const name = el('div', 'call-name', currentCharacter.name || 'AI');
  const status = el('div', 'call-status', '文字通话中，内容会保存到聊天记录');
  const log = el('div', 'call-log');
  const inputRow = el('div', 'call-input-row');
  const text = textarea('输入你想说的话', '');
  const send = iconButton('send', '发送');
  send.classList.add('accent');

  const hang = el('button', 'call-hang');
  hang.type = 'button';
  hang.appendChild(createIcon('close', 28));

  inputRow.append(text, send);
  call.append(top, avatar, name, status, log, inputRow, hang);
  rootEl.appendChild(call);

  activeCallStartedAt = Date.now();
  activeCallTimer = window.setInterval(() => {
    const seconds = Math.floor((Date.now() - activeCallStartedAt) / 1000);
    top.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }, 1000);

  async function sendCallMessage() {
    const content = text.value.trim();
    if (!content) return;

    text.value = '';
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
    const tokenInput = estimateTokens(systemPrompt + '\n' + callMessages.map((item) => item.content).join('\n'));

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
    saveTokenStats(assistantMessage.id, {
      input: tokenInput,
      output: estimateTokens(final),
      total: tokenInput + estimateTokens(final),
      timestamp: getNow()
    });

    currentMessages.push(assistantMessage);
    await updateLatestCache(currentCharacter.id);
    await afterAssistantReply(currentCharacter.id, assistantMessage);
    await markRead(currentCharacter.id);

    log.appendChild(el('div', 'call-line ai', final));
    avatar.classList.add('speaking');
    stopActiveTts();
    activeTts = playTTS(final, currentCharacter.ttsConfig);

    window.setTimeout(() => avatar.classList.remove('speaking'), 2200);
    log.scrollTop = log.scrollHeight;
  }

  send.addEventListener('click', sendCallMessage);
  text.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      sendCallMessage();
    }
  });

  hang.addEventListener('click', () => {
    stopActiveTts();
    stopAll();
    if (activeCallTimer) window.clearInterval(activeCallTimer);
    activeCallTimer = null;
    call.remove();
    renderChatScreen();
  });
}

function openGroupCreateSheet() {
  if (!characters.length) {
    showToast('请先创建角色');
    return;
  }

  const draft = {
    id: generateId(),
    name: '',
    avatar: '',
    memberIds: [],
    createdAt: getNow()
  };

  const sheet = el('div');
  sheet.append(el('div', 'sheet-title', '新建群聊'));

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
      showToast('至少选择 2 个角色');
      return;
    }

    await setDB('groups', draft.id, draft);
    hideBottomSheet();
    await loadBaseData();
    currentTab = 'group';
    renderList();
    showToast('群聊已创建');
  });

  sheet.append(field('名称', name), list, save);
  showBottomSheet(sheet);
}

async function scanProactiveAll() {
  if (document.hidden) return;

  await loadBaseData();

  for (const character of characters) {
    await checkMode1ForCharacter(character);
  }

  refreshUnreadBadges();
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

function scheduleMode2() {
  if (activeMode2Timer) {
    window.clearTimeout(activeMode2Timer);
    activeMode2Timer = null;
  }

  if (!currentCharacter) return;

  const config = getChatConfig(currentCharacter.id);
  if (!config.proactiveMode2Enabled) return;
  if (config.proactiveAwaitingUserReply) return;

  const min = Math.max(1, Number(config.proactiveMode2MinMinutes || 5));
  const max = Math.max(min, Number(config.proactiveMode2MaxMinutes || 10));
  const minutes = min + Math.random() * (max - min);
  const delayMs = minutes * 60 * 1000;

  activeMode2Timer = window.setTimeout(checkActiveMode2, delayMs);
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
  const tokenInput = estimateTokens(systemPrompt + '\n' + contextMessages.map((item) => item.content).join('\n'));

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
  saveTokenStats(message.id, {
    input: tokenInput,
    output: estimateTokens(content),
    total: tokenInput + estimateTokens(content),
    timestamp: getNow()
  });

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
  window.AppEvents?.emit?.('badge:chat', { characterId: character.id, count: getUnreadCount(character.id) });
  window.refreshDesktopBadges?.();

  if (mode === 'mode2' && config.ttsEnabled && character.ttsConfig?.enabled && currentCharacter?.id === character.id) {
    stopActiveTts();
    activeTts = playTTS(content, character.ttsConfig);
  }
}

async function markRead(characterId) {
  const unread = getData('chat_unread_counts') || {};
  unread[characterId] = 0;
  setData('chat_unread_counts', unread);

  const config = getChatConfig(characterId);
  config.readAt = getNow();
  saveChatConfig(characterId, config);

  window.AppEvents?.emit?.('badge:chat', { characterId, count: 0 });
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

function refreshUnreadBadges() {
  window.refreshDesktopBadges?.();
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

async function handleSearch(query, resultsBox) {
  resultsBox.innerHTML = '';

  if (!query) return;

  const allMessages = await getAllDB('messages');
  const matched = allMessages
    .filter((message) => String(message.content || '').includes(query))
    .slice(-20)
    .reverse();

  if (!matched.length) {
    resultsBox.appendChild(createSoftNote('没有找到相关聊天记录。'));
    return;
  }

  matched.forEach((message) => {
    const character = characters.find((item) => item.id === message.characterId);
    const item = el('button', 'search-result-item');
    item.type = 'button';
    item.append(
      el('div', 'search-result-title', character?.name || '未知角色'),
      el('div', 'search-result-text', getMessagePreview(message))
    );
    item.addEventListener('click', () => openPrivateChat(message.characterId));
    resultsBox.appendChild(item);
  });
}

function getChatConfig(id) {
  const saved = getData(`chat_${id}_config`) || {};

  return {
    ...DEFAULT_CHAT_CONFIG,
    ...saved,
    enabledMcpServerIds: Array.isArray(saved.enabledMcpServerIds) ? saved.enabledMcpServerIds : []
  };
}

function saveChatConfig(id, config) {
  setData(`chat_${id}_config`, {
    ...DEFAULT_CHAT_CONFIG,
    ...config,
    enabledMcpServerIds: Array.isArray(config.enabledMcpServerIds) ? config.enabledMcpServerIds : [],
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

  if (message.type === 'image') return message.content || '[图片]';
  if (message.type === 'sticker') return message.content || '[表情包]';
  if (message.type === 'transfer') return `转账 ${Number(message.transferAmount || 0).toFixed(2)} 元`;

  const text = String(message.content || '');
  return full || text.length <= 80 ? text : `${text.slice(0, 80)}…`;
}

function getSpeakerName(characterId) {
  if (characterId === 'user') return getSettings().user.name || '我';
  const character = characters.find((item) => item.id === characterId);
  return character?.name || currentCharacter?.name || 'AI';
}

function getSpeakerAvatar(characterId) {
  if (characterId === 'user') return getSettings().user.avatar || '';
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

  const entries = Object.entries(all);
  if (entries.length > 500) {
    const trimmed = entries
      .sort((a, b) => String(b[1]?.timestamp || '').localeCompare(String(a[1]?.timestamp || '')))
      .slice(0, 500);
    setData(TOKEN_STATS_KEY, Object.fromEntries(trimmed));
    return;
  }

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
}

function handleVisibilityChange() {
  if (!document.hidden) {
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

function detailsBlock(title) {
  const details = document.createElement('details');
  details.className = 'chat-details';

  const summary = document.createElement('summary');
  summary.textContent = title;

  details.appendChild(summary);
  return details;
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

function rangeInput(value, min, max, unit, onChange) {
  const wrap = el('div', 'range-wrap');
  const item = input('', value, 'range');
  const label = el('span', 'range-value', `${value}${unit}`);
  item.min = String(min);
  item.max = String(max);
  item.addEventListener('input', () => {
    label.textContent = `${item.value}${unit}`;
  });
  item.addEventListener('change', () => onChange(Number(item.value)));
  wrap.append(item, label);
  return wrap;
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
    .chat-app {
      color: var(--text-primary);
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

    .chat-thread-list,
    .chat-search-results,
    .checkbox-list,
    .settings-list {
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

    .chat-thread-right {
      position: relative;
      min-width: 22px;
      min-height: 22px;
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
      padding: calc(66px + env(safe-area-inset-top)) 20px calc(108px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling: touch;
    }

    .chat-message-list {
      max-width: 760px;
      margin: 0 auto;
    }

    .message-body {
      max-width: min(78vw, 560px);
      min-width: 0;
    }

    .chat-app .message-row.user .message-body {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }

    .chat-app .message-row.assistant .message-body {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
    }

    .message-rich {
      white-space: pre-wrap;
    }

    .message-image {
      max-width: min(64vw, 340px);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-sm);
    }

    .message-sticker {
      width: 118px;
      height: 118px;
      object-fit: cover;
      border-radius: var(--radius-lg);
    }

    .assistant-actions {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
      margin-top: 4px;
      color: var(--text-secondary);
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
    }

    .chat-input-wrap {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-xs);
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

    .quote-preview .icon-button {
      width: 30px;
      height: 30px;
      flex-basis: 30px;
      color: var(--accent-dark);
    }

    .chat-input {
      width: 100%;
      max-height: 132px;
      min-height: 42px;
      padding: 10px 14px;
      border-radius: 18px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      line-height: 1.45;
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

    .quick-reply-chip {
      flex: 0 0 auto;
      min-height: 30px;
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--accent-light);
      color: var(--accent-dark);
      font-size: 12px;
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

    .chat-details {
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      margin-top: var(--spacing-sm);
    }

    .chat-details summary {
      cursor: pointer;
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      list-style: none;
    }

    .chat-details summary::-webkit-details-marker {
      display: none;
    }

    .chat-details > *:not(summary) {
      margin-top: var(--spacing-md);
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

    .soft-note {
      padding: 12px 14px;
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .range-wrap {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .range-wrap input {
      flex: 1;
      accent-color: var(--accent);
    }

    .range-value {
      min-width: 48px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      text-align: right;
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

    .sticker-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .mcp-server-card {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .raw-message {
      max-height: 50vh;
      overflow: auto;
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: 12px;
      line-height: 1.6;
      white-space: pre-wrap;
    }

    .code-expand {
      margin-top: 8px;
      color: var(--bg-card);
      font-size: 11px;
      opacity: 0.8;
    }

    .load-more-button {
      align-self: center;
      margin-bottom: var(--spacing-sm);
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
      font-size: var(--font-size-small);
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
        grid-template-columns: repeat(5, minmax(0, 1fr));
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../core/storage.js 的 getData/setData/generateId/getNow/getAllDB/getDB/setDB/deleteDB/getByIndexDB/compressImage；../core/api.js 的 streamMessage/silentRequest；../core/memory.js 的 buildMemoryPrompt/checkAndSummarize/checkImportantInfo；../core/tts.js 的 playTTS/stopAll；../core/mcp.js 的 getMcpServers/callMcpTool/buildMcpContext/listMcpTools；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon
