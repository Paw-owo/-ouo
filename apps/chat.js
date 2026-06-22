// apps/chat.js
// imports:
//   from './chat/list.js': mountChatList
//   from './chat/thread.js': mountChatThread, unmountChatThread
//   from './chat/memory.js': mountChatMemory
//   from '../core/storage.js': getData, setData, generateId, getNow, getAllDB, getDB, setDB, getByIndexDB
//   from '../core/api.js': silentRequest
//   from '../core/memory.js': buildMemoryPrompt

import { mountChatList } from './chat/list.js';
import { mountChatThread, unmountChatThread } from './chat/thread.js';
import { mountChatMemory } from './chat/memory.js';

import {
  getData,
  setData,
  generateId,
  getNow,
  getAllDB,
  getDB,
  setDB,
  getByIndexDB
} from '../core/storage.js';

import { silentRequest } from '../core/api.js';
import { buildMemoryPrompt } from '../core/memory.js';

const CHAT_STYLE_ID = 'chat-app-style';
const HIDDEN_THREADS_KEY = 'chat_hidden_threads';
const PROACTIVE_SCAN_LOCK_KEY = 'chat_proactive_scan_lock';
const PROACTIVE_SCAN_GAP = 45 * 1000;

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
  proactiveNextCheckAt: '',
  readAt: null,
  tokenStatsEnabled: false
};

let rootEl = null;
let currentRoute = {
  name: 'list',
  params: {
    tab: 'private'
  }
};

let renderedRouteName = '';
let mounted = false;
let scanningProactive = false;

export async function mount(containerEl, options = {}) {
  rootEl = containerEl;
  mounted = true;
  renderedRouteName = '';

  injectStyle();

  const initialRoute = options.route || getData('chat_last_route') || null;

  if (initialRoute?.name === 'thread') {
    currentRoute = {
      name: 'thread',
      params: {
        mode: initialRoute.params?.mode === 'group' ? 'group' : 'private',
        characterId: initialRoute.params?.characterId || '',
        groupId: initialRoute.params?.groupId || ''
      }
    };
  } else if (initialRoute?.name === 'memory') {
    currentRoute = {
      name: 'memory',
      params: {
        characterId: initialRoute.params?.characterId || '',
        fromRoute: initialRoute.params?.fromRoute || null
      }
    };
  } else {
    currentRoute = {
      name: 'list',
      params: {
        tab: options.tab === 'group' ? 'group' : 'private',
        search: ''
      }
    };
  }

  window.addEventListener('chat:visible', handleVisible);
  document.addEventListener('visibilitychange', handleDocumentVisible);

  await scanProactiveMessages();
  await renderCurrentRoute();
}

export function unmount() {
  mounted = false;

  unmountChatThread();

  window.removeEventListener('chat:visible', handleVisible);
  document.removeEventListener('visibilitychange', handleDocumentVisible);

  if (rootEl) {
    rootEl.innerHTML = '';
  }

  rootEl = null;
  renderedRouteName = '';
}

export async function recordExternalInteraction(input = {}, legacyInteraction = {}) {
  const payload = normalizeExternalInteractionInput(input, legacyInteraction);
  const characterId = String(payload.characterId || '').trim();
  const role = payload.role === 'user' ? 'user' : 'assistant';
  const content = String(payload.content || '').replace(/\s+/g, ' ').trim();
  const source = String(payload.source || '外部互动').replace(/\s+/g, ' ').trim();

  if (!characterId || !content) return null;

  const character = await getDB('characters', characterId);
  if (!character) return null;

  const memoryText = await summarizeExternalInteraction({
    character,
    role,
    content,
    source
  });

  if (!memoryText) return null;

  const duplicated = await isDuplicatedMemory(characterId, memoryText);
  if (duplicated) return null;

  const memory = {
    id: generateId(),
    characterId,
    content: memoryText,
    source: 'auto',
    createdAt: getNow()
  };

  await setDB('memories', memory.id, memory);
  return memory;
}

const appState = {
  getRoute() {
    return currentRoute;
  },

  async navigateToList(options = {}) {
    currentRoute = {
      name: 'list',
      params: {
        tab: options.tab === 'group' ? 'group' : 'private',
        search: options.search || ''
      }
    };

    saveRoute();
    await scanProactiveMessages();
    await renderCurrentRoute();
  },

  async openPrivateThread(characterId) {
    const id = String(characterId || '').trim();
    if (!id) return;

    unhidePrivateThread(id);

    currentRoute = {
      name: 'thread',
      params: {
        mode: 'private',
        characterId: id,
        groupId: ''
      }
    };

    saveRoute();
    await renderCurrentRoute();
  },

  async openGroupThread(groupId) {
    const id = String(groupId || '').trim();
    if (!id) return;

    currentRoute = {
      name: 'thread',
      params: {
        mode: 'group',
        characterId: '',
        groupId: id
      }
    };

    saveRoute();
    await renderCurrentRoute();
  },

  async openMemory(characterId, options = {}) {
    const id = String(characterId || '').trim();
    if (!id) return;

    currentRoute = {
      name: 'memory',
      params: {
        characterId: id,
        fromRoute: options.from === 'thread'
          ? {
              name: 'thread',
              params: { ...currentRoute.params }
            }
          : null
      }
    };

    saveRoute();
    await renderCurrentRoute();
  },

  closeApp() {
    if (typeof window.closeCurrentApp === 'function') {
      window.closeCurrentApp();
      return;
    }

    if (typeof window.closeApp === 'function') {
      window.closeApp('chat');
      return;
    }

    if (typeof window.navigateHome === 'function') {
      window.navigateHome();
    }
  },

  hidePrivateThread(characterId) {
    hidePrivateThread(characterId);
  },

  unhidePrivateThread(characterId) {
    unhidePrivateThread(characterId);
  },

  isPrivateThreadHidden(characterId) {
    return isPrivateThreadHidden(characterId);
  }
};

async function renderCurrentRoute() {
  if (!rootEl || !mounted) return;

  const nextRoute = currentRoute;

  if (nextRoute.name === 'thread') {
    if (renderedRouteName === 'thread') {
      unmountChatThread();
    }

    rootEl.innerHTML = '';

    await mountChatThread(rootEl, {
      appState,
      mode: nextRoute.params.mode,
      characterId: nextRoute.params.characterId,
      groupId: nextRoute.params.groupId
    });

    renderedRouteName = 'thread';
    return;
  }

  const stage = document.createElement('div');
  stage.className = 'chat-route-stage';

  if (nextRoute.name === 'memory') {
    await mountChatMemory(stage, {
      appState,
      characterId: nextRoute.params.characterId,
      fromRoute: nextRoute.params.fromRoute
    });
  } else {
    await mountChatList(stage, {
      appState,
      tab: nextRoute.params.tab,
      search: nextRoute.params.search
    });
  }

  if (!rootEl || !mounted || currentRoute !== nextRoute) return;

  if (renderedRouteName === 'thread') {
    unmountChatThread();
  }

  rootEl.replaceChildren(...Array.from(stage.childNodes));
  renderedRouteName = nextRoute.name;
}

function saveRoute() {
  setData('chat_last_route', currentRoute);
}

async function handleVisible() {
  await scanProactiveMessages();

  if (currentRoute.name === 'list') {
    await renderCurrentRoute();
  }
}

function handleDocumentVisible() {
  if (document.visibilityState === 'visible') {
    handleVisible();
  }
}

function normalizeExternalInteractionInput(input, legacyInteraction) {
  if (typeof input === 'object' && input !== null && !Array.isArray(input)) {
    return {
      characterId: input.characterId,
      role: input.role || 'assistant',
      content: input.content || input.text || input.note || '',
      source: input.source || '外部互动'
    };
  }

  return {
    characterId: input,
    role: legacyInteraction?.role || 'assistant',
    content: legacyInteraction?.content || legacyInteraction?.text || legacyInteraction?.note || '',
    source: legacyInteraction?.source || '外部互动'
  };
}

async function scanProactiveMessages() {
  if (scanningProactive) return;

  const lastLock = Number(getData(PROACTIVE_SCAN_LOCK_KEY) || 0);
  if (Date.now() - lastLock < PROACTIVE_SCAN_GAP) return;

  scanningProactive = true;
  setData(PROACTIVE_SCAN_LOCK_KEY, Date.now());

  try {
    const characters = normalizeArray(await getAllDB('characters')).filter((item) => item?.id);

    for (const character of characters) {
      await maybeSendProactiveMessage(character);
    }
  } finally {
    scanningProactive = false;
  }
}

async function maybeSendProactiveMessage(character) {
  if (!character?.id) return false;

  const config = getChatConfig(character.id);
  if (!config.proactiveMode1Enabled) return false;

  const messages = normalizeArray(await getByIndexDB('messages', 'characterId', character.id))
    .filter((item) => item?.id)
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));

  const last = messages[messages.length - 1];
  if (!last || last.role !== 'user') return false;

  if (config.proactiveAwaitingUserReply) return false;

  const minutes = Math.max(1, Number(config.proactiveMode1Minutes || 30));
  const lastTime = new Date(last.timestamp || 0).getTime();

  if (!lastTime || Date.now() - lastTime < minutes * 60 * 1000) return false;

  const content = await createProactiveContent(character, config, messages);
  if (!content) return false;

  const message = {
    id: generateId(),
    role: 'assistant',
    content,
    thinking: '',
    thinkingTimeMs: 0,
    characterId: character.id,
    groupId: '',
    type: 'text',
    imageBase64: '',
    stickerId: '',
    transferAmount: 0,
    transferTargetId: '',
    timestamp: getNow(),
    toolCalls: [],
    autoVoice: false,
    voiceAutoPlaying: false
  };

  await setDB('messages', message.id, message);

  config.proactiveAwaitingUserReply = true;
  config.proactiveLastSentAt = getNow();
  saveChatConfig(character.id, config);

  unhidePrivateThread(character.id);
  await updateLatestCache(character.id);

  if (currentRoute.name === 'thread' && currentRoute.params?.characterId === character.id) {
    await markRead(character.id);
  } else {
    addUnread(character.id, 1);
  }

  window.refreshDesktopBadges?.();

  return true;
}

async function createProactiveContent(character, config, messages) {
  const systemPrompt = [
    character.systemPrompt || `你是${character.name || 'AI'}，正在和用户进行私人聊天。`,
    await getMemoryPrompt(character.id, config),
    '[主动消息要求]',
    '用户已经一段时间没有回复你。请结合你们最近的聊天，自然主动发一条消息。',
    '不要像提醒机器人，不要解释规则，不要说你在执行主动消息。',
    '只输出你要发给用户的一条消息。'
  ].filter(Boolean).join('\n\n');

  const apiMessages = messages
    .slice(-24)
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .map((item) => ({
      role: item.role,
      content: String(item.content || '').trim()
    }))
    .filter((item) => item.content);

  const text = await silentRequest({
    messages: apiMessages,
    systemPrompt,
    endpointId: config.endpointId || resolveCharacterEndpointId(character),
    model: config.model || resolveCharacterModel(character)
  }).catch(() => '');

  return String(text || '').trim();
}

async function getMemoryPrompt(characterId, config) {
  if (config.memoryEnabled === false) return '';

  try {
    return await buildMemoryPrompt(characterId);
  } catch (_) {
    return '';
  }
}

async function summarizeExternalInteraction({ character, role, content, source }) {
  const fallback = createExternalFallbackMemory({ role, content, source, character });

  const result = await silentRequest({
    prompt: [
      '请把下面这段外部应用互动总结成一句适合长期记忆的中文短句。',
      '要求：约30个字，自然、具体、不要像系统记录。',
      '只返回 JSON：{"memory":"..."}',
      `角色：${character.name || 'AI'}`,
      `来源：${source}`,
      `发言者：${role === 'user' ? '用户' : character.name || 'AI'}`,
      `互动内容：${content}`
    ].join('\n'),
    json: true
  }).catch(() => null);

  const memory = String(result?.memory || '').replace(/\s+/g, ' ').trim();
  return memory ? trimExternalMemory(memory) : fallback;
}

function createExternalFallbackMemory({ role, content, source, character }) {
  const actor = role === 'user' ? '用户' : (character?.name || 'TA');
  const cleanSource = String(source || '外部互动').trim();
  const cleanContent = String(content || '').replace(/\s+/g, ' ').trim();

  if (!cleanContent) return '';

  const short = cleanContent.length > 22 ? `${cleanContent.slice(0, 22)}…` : cleanContent;
  return trimExternalMemory(`在${cleanSource}里，${actor}一起经历了：${short}`);
}

function trimExternalMemory(text) {
  const clean = String(text || '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return '';
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
}

async function isDuplicatedMemory(characterId, content) {
  const fingerprint = normalizeMemoryFingerprint(content);
  if (!fingerprint) return true;

  const memories = normalizeArray(await getByIndexDB('memories', 'characterId', characterId)).slice(-120);

  return memories.some((item) => {
    const old = normalizeMemoryFingerprint(item.content || '');
    if (!old) return false;

    return old === fingerprint ||
      old.includes(fingerprint.slice(0, 24)) ||
      fingerprint.includes(old.slice(0, 24));
  });
}

function normalizeMemoryFingerprint(text) {
  return String(text || '')
    .replace(/\s+/g, '')
    .replace(/[，。！？、；：“”‘’"'`~\-—_=+()[\]{}<>【】《》,.!?;:]/g, '')
    .toLowerCase()
    .slice(0, 180);
}

async function updateLatestCache(characterId) {
  const messages = normalizeArray(await getByIndexDB('messages', 'characterId', characterId))
    .filter((item) => item?.id)
    .sort((a, b) => String(a.timestamp || '').localeCompare(String(b.timestamp || '')));

  const last = messages[messages.length - 1];
  const cache = getData('chat_latest_cache') || {};

  if (!last) {
    delete cache[characterId];
  } else {
    cache[characterId] = {
      preview: getMessagePreview(last),
      time: last.timestamp || getNow()
    };
  }

  setData('chat_latest_cache', cache);
}

function addUnread(characterId, count = 1) {
  const unread = getData('chat_unread_counts') || {};
  unread[characterId] = Math.max(0, Number(unread[characterId] || 0) + Number(count || 1));
  setData('chat_unread_counts', unread);
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

function getMessagePreview(message) {
  if (!message) return '';

  if (message.type === 'image') return '[图片]';
  if (message.type === 'sticker') return '[表情]';
  if (message.type === 'transfer') return `[转账 ${message.transferAmount || 0}]`;

  const text = String(message.content || '').replace(/\s+/g, ' ').trim();
  return text.length > 48 ? `${text.slice(0, 48)}…` : text;
}

function getChatConfig(characterId) {
  if (!characterId) return { ...DEFAULT_CHAT_CONFIG };

  const saved = getData(`chat_${characterId}_config`) || {};

  return {
    ...DEFAULT_CHAT_CONFIG,
    ...saved,
    enabledMcpServerIds: normalizeArray(saved.enabledMcpServerIds),
    proactiveMode1Minutes: Number(saved.proactiveMode1Minutes || DEFAULT_CHAT_CONFIG.proactiveMode1Minutes),
    proactiveMode2MinMinutes: Number(saved.proactiveMode2MinMinutes || DEFAULT_CHAT_CONFIG.proactiveMode2MinMinutes),
    proactiveMode2MaxMinutes: Number(saved.proactiveMode2MaxMinutes || DEFAULT_CHAT_CONFIG.proactiveMode2MaxMinutes),
    proactiveChance: Number(saved.proactiveChance ?? DEFAULT_CHAT_CONFIG.proactiveChance),
    memorySummaryFrequency: Number(saved.memorySummaryFrequency || DEFAULT_CHAT_CONFIG.memorySummaryFrequency),
    proactiveNextCheckAt: saved.proactiveNextCheckAt || ''
  };
}

function saveChatConfig(characterId, config) {
  if (!characterId) return;

  setData(`chat_${characterId}_config`, {
    ...DEFAULT_CHAT_CONFIG,
    ...config,
    enabledMcpServerIds: normalizeArray(config.enabledMcpServerIds)
  });
}

function resolveCharacterEndpointId(character) {
  if (!character?.apiConfig || character.apiConfig.useGlobal !== false) return '';
  return character.apiConfig.endpointId || '';
}

function resolveCharacterModel(character) {
  if (!character?.apiConfig || character.apiConfig.useGlobal !== false) return '';
  return character.apiConfig.model || '';
}

function getHiddenThreads() {
  const saved = getData(HIDDEN_THREADS_KEY);
  return Array.isArray(saved) ? saved : [];
}

function hidePrivateThread(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  const set = new Set(getHiddenThreads());
  set.add(id);
  setData(HIDDEN_THREADS_KEY, [...set]);
}

function unhidePrivateThread(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  const next = getHiddenThreads().filter((item) => item !== id);
  setData(HIDDEN_THREADS_KEY, next);
}

function isPrivateThreadHidden(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return false;

  return getHiddenThreads().includes(id);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function injectStyle() {
  if (document.getElementById(CHAT_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = CHAT_STYLE_ID;
  style.textContent = `
    .chat-route-stage {
      position: absolute;
      inset: 0;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .chat-page {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
    }

    .chat-nav {
      flex: 0 0 auto;
      min-height: 64px;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 12px 20px;
      background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
      backdrop-filter: blur(18px);
      color: var(--text-primary);
      z-index: 4;
    }

    .chat-nav-title-wrap {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .chat-nav-title {
      min-width: 0;
      color: var(--text-primary);
      font-size: 17px;
      font-weight: 600;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chat-nav-subtitle {
      min-width: 0;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .chat-content {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      -webkit-overflow-scrolling: touch;
    }

    .chat-content-narrow {
      width: 100%;
      max-width: 760px;
      margin: 0 auto;
    }

    .chat-card {
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .chat-icon-btn {
      width: 38px;
      height: 38px;
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 0;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .chat-icon-btn:active {
      transform: scale(0.96);
    }

    .chat-primary-btn,
    .chat-ghost-btn {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 0 16px;
      border: 0;
      border-radius: var(--radius-lg);
      font: inherit;
      font-size: 15px;
      line-height: 1;
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .chat-primary-btn {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-ghost-btn {
      background: var(--bg-card);
      color: var(--text-primary);
    }

    .chat-primary-btn:active,
    .chat-ghost-btn:active {
      transform: scale(0.96);
    }

    .chat-input-card {
      width: 100%;
      min-height: 42px;
      border: 0;
      outline: 0;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      padding: 10px 13px;
      font: inherit;
      font-size: 16px;
      line-height: 1.6;
      appearance: none;
    }

    textarea.chat-input-card {
      resize: vertical;
    }

    .chat-input-card::placeholder {
      color: var(--text-hint);
    }

    .chat-empty {
      min-height: 180px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 28px 20px;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      text-align: center;
    }

    .chat-empty-title {
      color: var(--text-primary);
      font-size: 17px;
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-empty-desc {
      max-width: 260px;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.6;
    }

    @media (max-width: 680px) {
      .chat-nav {
        padding-left: 20px;
        padding-right: 20px;
      }
    }
  `;

  document.head.appendChild(style);
}

// 改了什么：修复返回消息列表时先清空 root 导致瞬间露出桌面的问题，改成先在临时容器渲染列表/记忆页，再一次性替换。
// 会不会影响其他文件：不会。
// 更新记忆里该文件的导出函数：mount(containerEl, options)、unmount()、recordExternalInteraction(input, legacyInteraction)
// 依赖：./chat/list.js(mountChatList)；./chat/thread.js(mountChatThread,unmountChatThread)；./chat/memory.js(mountChatMemory)；../core/storage.js(getData,setData,generateId,getNow,getAllDB,getDB,setDB,getByIndexDB)；../core/api.js(silentRequest)；../core/memory.js(buildMemoryPrompt)
