// apps/chat/thread.js
// imports:
//   from '../../core/storage.js': getData, setData, getAllDB, getDB, getByIndexDB
//   from '../../core/tts.js': stopAll
//   from '../../core/ui.js': showToast, hideBottomSheet
//   from './thread-render.js': renderThread
//   from './thread-ai.js': startThreadProactiveLoop, stopThreadProactiveLoop
//   from './thread-call.js': closeThreadCall

import {
  getData,
  setData,
  getAllDB,
  getDB,
  getByIndexDB
} from '../../core/storage.js';

import { stopAll } from '../../core/tts.js';

import {
  showToast,
  hideBottomSheet
} from '../../core/ui.js';

import { renderThread } from './thread-render.js';

import {
  startThreadProactiveLoop,
  stopThreadProactiveLoop
} from './thread-ai.js';

import { closeThreadCall } from './thread-call.js';

const THREAD_CSS_ID = 'chat-thread-css';
const THREAD_CSS_HREF = './chat/thread-style.css';
const PAGE_SIZE = 50;
const GROUP_UNREAD_KEY = 'chat_group_unread_counts';
const PRIVATE_UNREAD_KEY = 'chat_unread_counts';
const LATEST_PRIVATE_KEY = 'chat_latest_cache';
const LATEST_GROUP_KEY = 'chat_group_latest_cache';
const SETTINGS_KEY = 'app_settings';
const USER_PROFILES_KEY = 'app_user_profiles';

const DEFAULT_SETTINGS = {
  defaultApiEndpointId: '',
  defaultModel: '',
  bubbleMode: 'bubble',
  fontSize: 15,
  user: {
    name: '',
    avatar: '',
    profileId: ''
  },
  apiEndpoints: [],
  ttsVoices: []
};

const DEFAULT_CHAT_CONFIG = {
  endpointId: '',
  model: '',
  ttsEnabled: false,
  ttsVoiceId: '',
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
  proactiveNextCheckAt: '',
  readAt: null,
  tokenStatsEnabled: false,
  displayMode: ''
};

const threadState = {
  rootEl: null,
  appState: null,
  mode: 'private',
  currentCharacter: null,
  currentGroup: null,
  characters: [],
  groups: [],
  stickers: [],
  messages: [],
  visibleCount: PAGE_SIZE,
  quotedMessage: null,
  isSending: false,
  activeTts: null,
  activeTtsMessageId: '',
  activeCall: null,
  keyboardViewportRaf: 0,
  keyboardCleanup: null,
  mounted: false
};

export async function mountChatThread(containerEl, options = {}) {
  threadState.rootEl = containerEl;
  threadState.appState = options.appState || null;
  threadState.mode = options.mode === 'group' ? 'group' : 'private';
  threadState.visibleCount = PAGE_SIZE;
  threadState.quotedMessage = null;
  threadState.isSending = false;
  threadState.mounted = true;

  injectThreadCss();
  setupKeyboardViewport();
  await loadBaseData();

  if (threadState.mode === 'group') {
    await mountGroupThread(options.groupId);
  } else {
    await mountPrivateThread(options.characterId);
  }

  if (!threadState.mounted) return;

  await rerenderThread({ scroll: false });
  startThreadProactiveLoop(createThreadContext());
  window.addEventListener('chat:visible', handleChatVisible);
}

export function unmountChatThread() {
  threadState.mounted = false;

  stopAll();
  stopActiveTts();
  stopThreadProactiveLoop();
  closeThreadCall(createThreadContext());
  hideBottomSheet();
  cleanupKeyboardViewport();

  window.removeEventListener('chat:visible', handleChatVisible);

  if (threadState.rootEl) {
    threadState.rootEl.innerHTML = '';
  }

  threadState.rootEl = null;
  threadState.appState = null;
  threadState.mode = 'private';
  threadState.currentCharacter = null;
  threadState.currentGroup = null;
  threadState.characters = [];
  threadState.groups = [];
  threadState.stickers = [];
  threadState.messages = [];
  threadState.visibleCount = PAGE_SIZE;
  threadState.quotedMessage = null;
  threadState.isSending = false;
  threadState.activeTts = null;
  threadState.activeTtsMessageId = '';
  threadState.activeCall = null;
}

export function getThreadContext() {
  return createThreadContext();
}

async function mountPrivateThread(characterId) {
  const id = String(characterId || '').trim();
  threadState.currentCharacter = threadState.characters.find((item) => item.id === id) || await getDB('characters', id);
  threadState.currentGroup = null;

  if (!threadState.currentCharacter) {
    showToast('这个角色不见了');
    await threadState.appState?.navigateToList?.({ tab: 'private' });
    return;
  }

  threadState.appState?.unhidePrivateThread?.(threadState.currentCharacter.id);
  await markPrivateRead(threadState.currentCharacter.id);
  await loadPrivateMessages(threadState.currentCharacter.id);
}

async function mountGroupThread(groupId) {
  const id = String(groupId || '').trim();
  threadState.currentGroup = threadState.groups.find((item) => item.id === id) || await getDB('groups', id);
  threadState.currentCharacter = null;

  if (!threadState.currentGroup) {
    showToast('这个群聊不见了');
    await threadState.appState?.navigateToList?.({ tab: 'group' });
    return;
  }

  await clearGroupUnread(threadState.currentGroup.id);
  await loadGroupMessages(threadState.currentGroup.id);
}

async function loadBaseData() {
  const [characters, groups, stickers] = await Promise.all([
    getAllDB('characters'),
    getAllDB('groups'),
    getAllDB('stickers')
  ]);

  threadState.characters = normalizeArray(characters).filter((item) => item?.id);
  threadState.groups = normalizeArray(groups).filter((item) => item?.id);
  threadState.stickers = normalizeArray(stickers).filter((item) => item?.id);
}

async function loadPrivateMessages(characterId) {
  threadState.messages = normalizeArray(await getByIndexDB('messages', 'characterId', characterId))
    .filter((item) => item?.id)
    .sort(sortByTimestamp);
}

async function loadGroupMessages(groupId) {
  threadState.messages = normalizeArray(await getByIndexDB('group_messages', 'groupId', groupId))
    .filter((item) => item?.id)
    .sort(sortByTimestamp);
}

async function reloadCurrentMessages() {
  if (threadState.currentGroup) {
    await loadGroupMessages(threadState.currentGroup.id);
    return;
  }

  if (threadState.currentCharacter) {
    await loadPrivateMessages(threadState.currentCharacter.id);
  }
}

async function refreshBaseData() {
  await loadBaseData();

  if (threadState.currentCharacter) {
    threadState.currentCharacter = threadState.characters.find((item) => item.id === threadState.currentCharacter.id) || threadState.currentCharacter;
  }

  if (threadState.currentGroup) {
    threadState.currentGroup = threadState.groups.find((item) => item.id === threadState.currentGroup.id) || threadState.currentGroup;
  }
}

async function rerenderThread(options = {}) {
  if (!threadState.rootEl || !threadState.mounted) return;

  updateKeyboardViewport();

  await renderThread(createThreadContext(), {
    scroll: options.scroll !== false,
    preserveScroll: Boolean(options.preserveScroll)
  });
}

async function navigateBackToList() {
  stopAll();
  stopActiveTts();
  closeThreadCall(createThreadContext());
  hideBottomSheet();

  const tab = threadState.currentGroup ? 'group' : 'private';
  await threadState.appState?.navigateToList?.({ tab });
}

async function markPrivateRead(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  const unread = getData(PRIVATE_UNREAD_KEY) || {};
  unread[id] = 0;
  setData(PRIVATE_UNREAD_KEY, unread);

  const config = getChatConfig(id);
  config.readAt = new Date().toISOString();
  saveChatConfig(id, config);

  window.refreshDesktopBadges?.();
}

async function clearGroupUnread(groupId) {
  const id = String(groupId || '').trim();
  if (!id) return;

  const unread = getData(GROUP_UNREAD_KEY) || {};
  unread[id] = 0;
  setData(GROUP_UNREAD_KEY, unread);

  window.refreshDesktopBadges?.();
}

async function updateLatestPrivateCache(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  const messages = normalizeArray(await getByIndexDB('messages', 'characterId', id))
    .filter((item) => item?.id)
    .sort(sortByTimestamp);

  const latest = messages[messages.length - 1];
  const cache = getData(LATEST_PRIVATE_KEY) || {};

  if (!latest) {
    delete cache[id];
  } else {
    cache[id] = {
      preview: getMessagePreview(latest),
      time: latest.timestamp || new Date().toISOString()
    };
  }

  setData(LATEST_PRIVATE_KEY, cache);
}

async function updateLatestGroupCache(groupId) {
  const id = String(groupId || '').trim();
  if (!id) return;

  const messages = normalizeArray(await getByIndexDB('group_messages', 'groupId', id))
    .filter((item) => item?.id)
    .sort(sortByTimestamp);

  const latest = messages[messages.length - 1];
  const cache = getData(LATEST_GROUP_KEY) || {};

  if (!latest) {
    delete cache[id];
  } else {
    cache[id] = {
      preview: getMessagePreview(latest),
      time: latest.timestamp || new Date().toISOString()
    };
  }

  setData(LATEST_GROUP_KEY, cache);
}

function updateCurrentMessage(nextMessage) {
  if (!nextMessage?.id) return;

  const index = threadState.messages.findIndex((item) => item.id === nextMessage.id);
  if (index >= 0) {
    threadState.messages[index] = nextMessage;
  } else {
    threadState.messages.push(nextMessage);
  }

  threadState.messages.sort(sortByTimestamp);
}

function removeCurrentMessage(messageId) {
  const id = String(messageId || '').trim();
  if (!id) return;

  threadState.messages = threadState.messages.filter((item) => item.id !== id);
}

function setQuotedMessage(message) {
  threadState.quotedMessage = message || null;
}

function setSending(value) {
  threadState.isSending = Boolean(value);
}

function setActiveTts(instance, messageId = '') {
  threadState.activeTts = instance || null;
  threadState.activeTtsMessageId = instance ? String(messageId || '') : '';
}

function stopActiveTts() {
  if (threadState.activeTts?.stop) {
    try {
      threadState.activeTts.stop();
    } catch (_) {}
  }

  threadState.activeTts = null;
  threadState.activeTtsMessageId = '';
}

function setActiveCall(callState) {
  threadState.activeCall = callState || null;
}

function getChatTargetId() {
  if (threadState.currentCharacter) return threadState.currentCharacter.id;
  if (threadState.currentGroup) return normalizeArray(threadState.currentGroup.memberIds)[0] || '';
  return '';
}

function getChatConfig(characterId = getChatTargetId()) {
  const id = String(characterId || '').trim();
  if (!id) return { ...DEFAULT_CHAT_CONFIG };

  const saved = getData(`chat_${id}_config`) || {};

  return {
    ...DEFAULT_CHAT_CONFIG,
    ...saved,
    enabledMcpServerIds: normalizeArray(saved.enabledMcpServerIds),
    proactiveMode1Minutes: Number(saved.proactiveMode1Minutes || DEFAULT_CHAT_CONFIG.proactiveMode1Minutes),
    proactiveMode2MinMinutes: Number(saved.proactiveMode2MinMinutes || DEFAULT_CHAT_CONFIG.proactiveMode2MinMinutes),
    proactiveMode2MaxMinutes: Number(saved.proactiveMode2MaxMinutes || DEFAULT_CHAT_CONFIG.proactiveMode2MaxMinutes),
    proactiveChance: Number(saved.proactiveChance ?? DEFAULT_CHAT_CONFIG.proactiveChance),
    memorySummaryFrequency: Number(saved.memorySummaryFrequency || DEFAULT_CHAT_CONFIG.memorySummaryFrequency),
    proactiveNextCheckAt: saved.proactiveNextCheckAt || '',
    displayMode: saved.displayMode || ''
  };
}

function saveChatConfig(characterId, config) {
  const id = String(characterId || '').trim();
  if (!id) return;

  setData(`chat_${id}_config`, {
    ...DEFAULT_CHAT_CONFIG,
    ...config,
    enabledMcpServerIds: normalizeArray(config.enabledMcpServerIds)
  });
}

function getSettings() {
  const saved = getData(SETTINGS_KEY) || {};

  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    user: {
      ...DEFAULT_SETTINGS.user,
      ...(saved.user || {})
    },
    apiEndpoints: normalizeArray(saved.apiEndpoints),
    ttsVoices: normalizeArray(saved.ttsVoices)
  };
}

function saveSettings(settings) {
  setData(SETTINGS_KEY, {
    ...getSettings(),
    ...(settings || {})
  });
}

function getDisplayMode() {
  const targetId = getChatTargetId();
  const config = getChatConfig(targetId);
  const settings = getSettings();

  return config.displayMode || settings.bubbleMode || 'bubble';
}

function saveDisplayMode(mode) {
  const nextMode = mode === 'dialog' ? 'dialog' : 'bubble';
  const targetId = getChatTargetId();

  if (targetId) {
    const config = getChatConfig(targetId);
    config.displayMode = nextMode;
    saveChatConfig(targetId, config);
    return;
  }

  const settings = getSettings();
  settings.bubbleMode = nextMode;
  saveSettings(settings);
}

function getCurrentUserDisplayProfile() {
  const settings = getSettings();
  const profiles = normalizeArray(getData(USER_PROFILES_KEY));
  const profileId = settings.user?.profileId || settings.userProfileId || '';
  const selectedProfile = profileId ? profiles.find((item) => item.id === profileId) : null;
  const defaultProfile = profiles.find((item) => item.isDefault || item.type === 'self' || item.role === 'user');

  const profile = selectedProfile || defaultProfile || {};

  return {
    id: profile.id || profileId || 'user',
    name: settings.user?.name || profile.name || profile.nickname || '我',
    avatar: settings.user?.avatar || profile.avatar || profile.image || '',
    content: profile.content || profile.prompt || profile.description || ''
  };
}

function getSpeakerName(characterId) {
  const id = String(characterId || '').trim();

  if (!id || id === 'user') {
    return getCurrentUserDisplayProfile().name || '我';
  }

  const character = threadState.characters.find((item) => item.id === id);
  return character?.name || 'TA';
}

function getSpeakerAvatar(characterId) {
  const id = String(characterId || '').trim();

  if (!id || id === 'user') {
    return getCurrentUserDisplayProfile().avatar || '';
  }

  const character = threadState.characters.find((item) => item.id === id);
  return character?.avatar || '';
}

function getCharacterById(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return null;
  return threadState.characters.find((item) => item.id === id) || null;
}

function getGroupMemberCharacters(group = threadState.currentGroup) {
  return normalizeArray(group?.memberIds)
    .map((id) => getCharacterById(id))
    .filter(Boolean);
}

function getStickerById(stickerId) {
  const id = String(stickerId || '').trim();
  if (!id) return null;
  return threadState.stickers.find((item) => item.id === id) || null;
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

function setupKeyboardViewport() {
  cleanupKeyboardViewport();

  const viewport = window.visualViewport;
  if (!viewport) {
    updateKeyboardViewport();
    return;
  }

  const update = () => {
    if (threadState.keyboardViewportRaf) {
      cancelAnimationFrame(threadState.keyboardViewportRaf);
    }

    threadState.keyboardViewportRaf = requestAnimationFrame(updateKeyboardViewport);
  };

  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);

  threadState.keyboardCleanup = () => {
    viewport.removeEventListener('resize', update);
    viewport.removeEventListener('scroll', update);
  };

  updateKeyboardViewport();
}

function cleanupKeyboardViewport() {
  if (threadState.keyboardCleanup) {
    threadState.keyboardCleanup();
    threadState.keyboardCleanup = null;
  }

  if (threadState.keyboardViewportRaf) {
    cancelAnimationFrame(threadState.keyboardViewportRaf);
    threadState.keyboardViewportRaf = 0;
  }

  document.documentElement.style.removeProperty('--chat-keyboard-offset');
}

function updateKeyboardViewport() {
  const viewport = window.visualViewport;

  if (!viewport) {
    document.documentElement.style.setProperty('--chat-keyboard-offset', '0px');
    return;
  }

  const offset = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
  document.documentElement.style.setProperty('--chat-keyboard-offset', `${offset}px`);
}

async function handleChatVisible() {
  if (!threadState.mounted) return;

  if (threadState.currentGroup) {
    await clearGroupUnread(threadState.currentGroup.id);
  }

  if (threadState.currentCharacter) {
    await markPrivateRead(threadState.currentCharacter.id);
  }

  startThreadProactiveLoop(createThreadContext());
}

function injectThreadCss() {
  if (document.getElementById(THREAD_CSS_ID)) return;

  const link = document.createElement('link');
  link.id = THREAD_CSS_ID;
  link.rel = 'stylesheet';
  link.href = new URL(THREAD_CSS_HREF, import.meta.url).href;
  document.head.appendChild(link);
}

function createThreadContext() {
  return {
    state: threadState,
    constants: {
      PAGE_SIZE,
      GROUP_UNREAD_KEY,
      PRIVATE_UNREAD_KEY,
      LATEST_PRIVATE_KEY,
      LATEST_GROUP_KEY
    },
    appState: threadState.appState,
    getData,
    setData,
    getAllDB,
    getDB,
    getByIndexDB,
    loadBaseData,
    refreshBaseData,
    reloadCurrentMessages,
    loadPrivateMessages,
    loadGroupMessages,
    rerenderThread,
    navigateBackToList,
    markPrivateRead,
    clearGroupUnread,
    updateLatestPrivateCache,
    updateLatestGroupCache,
    updateCurrentMessage,
    removeCurrentMessage,
    setQuotedMessage,
    setSending,
    setActiveTts,
    stopActiveTts,
    setActiveCall,
    getChatTargetId,
    getChatConfig,
    saveChatConfig,
    getSettings,
    saveSettings,
    getDisplayMode,
    saveDisplayMode,
    getCurrentUserDisplayProfile,
    getSpeakerName,
    getSpeakerAvatar,
    getCharacterById,
    getGroupMemberCharacters,
    getStickerById,
    getMessagePreview,
    normalizeArray,
    sortByTimestamp
  };
}

function sortByTimestamp(a, b) {
  return String(a?.timestamp || '').localeCompare(String(b?.timestamp || ''));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

// 依赖：../../core/storage.js(getData,setData,getAllDB,getDB,getByIndexDB)；../../core/tts.js(stopAll)；../../core/ui.js(showToast,hideBottomSheet)；./thread-render.js(renderThread)；./thread-ai.js(startThreadProactiveLoop,stopThreadProactiveLoop)；./thread-call.js(closeThreadCall)
