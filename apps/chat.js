// apps/chat.js
// imports:
//   from './chat/list.js': mountChatList, unmountChatList
//   from './chat/memory.js': mountChatMemory, unmountChatMemory
//   from './chat/thread.js': mountChatThread, unmountChatThread
//   from '../core/storage.js': getData, setData, generateId, getNow, getDB, setDB, getByIndexDB
//   from '../core/api.js': silentRequest

import { mountChatList, unmountChatList } from './chat/list.js';
import { mountChatMemory, unmountChatMemory } from './chat/memory.js';
import { mountChatThread, unmountChatThread } from './chat/thread.js';

import {
  getData,
  setData,
  generateId,
  getNow,
  getDB,
  setDB,
  getByIndexDB
} from '../core/storage.js';

import { silentRequest } from '../core/api.js';

const CHAT_APP_STYLE_ID = 'chat-app-style';
const CHAT_ROUTE_KEY = 'chat_last_route';
const CHAT_HIDDEN_PRIVATE_KEY = 'chat_hidden_private_threads';
const MEMORY_DUPLICATE_LIMIT = 160;

let rootEl = null;
let mounted = false;
let activeView = '';
let currentRoute = {
  name: 'list',
  params: {
    tab: 'private',
    search: ''
  }
};

export async function mount(containerEl, options = {}) {
  rootEl = containerEl;
  mounted = true;
  activeView = '';

  injectChatAppStyle();
  currentRoute = resolveInitialRoute(options);

  await renderRoute();
}

export function unmount() {
  mounted = false;

  unmountActiveView();

  if (rootEl) {
    rootEl.replaceChildren();
  }

  rootEl = null;
  activeView = '';
}

export async function recordExternalInteraction(input = {}, legacyInteraction = {}) {
  const payload = normalizeExternalInteraction(input, legacyInteraction);
  const characterId = String(payload.characterId || '').trim();
  const role = payload.role === 'user' ? 'user' : 'assistant';
  const content = normalizeText(payload.content);
  const source = normalizeText(payload.source || '外部互动');

  if (!characterId || !content) return null;

  const character = await getDB('characters', characterId).catch(() => null);
  if (!character) return null;

  const memoryContent = await summarizeExternalMemory({
    character,
    role,
    content,
    source
  });

  if (!memoryContent) return null;

  const duplicated = await isDuplicateMemory(characterId, memoryContent);
  if (duplicated) return null;

  const now = getNow();
  const memory = {
    id: generateId(),
    characterId,
    content: memoryContent,
    source: 'auto',
    createdAt: now,
    updatedAt: now
  };

  await setDB('memories', memory.id, memory);
  return memory;
}

const appState = {
  getRoute() {
    return currentRoute;
  },

  async goList(options = {}) {
    await navigateTo({
      name: 'list',
      params: {
        tab: options.tab === 'group' ? 'group' : 'private',
        search: options.search || ''
      }
    });
  },

  async navigateToList(options = {}) {
    await this.goList(options);
  },

  async openPrivateThread(characterId) {
    const id = String(characterId || '').trim();
    if (!id) return;

    unhidePrivateThread(id);

    await navigateTo({
      name: 'thread',
      params: {
        mode: 'private',
        characterId: id,
        groupId: ''
      }
    });
  },

  async openGroupThread(groupId) {
    const id = String(groupId || '').trim();
    if (!id) return;

    await navigateTo({
      name: 'thread',
      params: {
        mode: 'group',
        characterId: '',
        groupId: id
      }
    });
  },

  async openMemory(characterId, options = {}) {
    const id = String(characterId || '').trim();
    if (!id) return;

    await navigateTo({
      name: 'memory',
      params: {
        characterId: id,
        fromRoute: options.fromRoute || currentRoute
      }
    });
  },

  async backFromMemory(fallbackRoute = null) {
    const route = fallbackRoute || currentRoute.params?.fromRoute || {
      name: 'list',
      params: { tab: 'private', search: '' }
    };

    await navigateTo(route);
  },

  hidePrivateThread(characterId) {
    hidePrivateThread(characterId);
  },

  isPrivateThreadHidden(characterId) {
    return isPrivateThreadHidden(characterId);
  },

  async recordExternalInteraction(input = {}, legacyInteraction = {}) {
    return recordExternalInteraction(input, legacyInteraction);
  },

  closeApp() {
    closeChatApp();
  }
};

async function navigateTo(route) {
  currentRoute = normalizeRoute(route);
  saveRoute();
  await renderRoute();
}

async function renderRoute() {
  if (!rootEl || !mounted) return;

  const route = normalizeRoute(currentRoute);
  const stage = document.createElement('div');
  stage.className = 'chat-route-stage';

  unmountActiveView();

  if (route.name === 'thread') {
    await mountChatThread(stage, {
      appState,
      mode: route.params.mode,
      characterId: route.params.characterId,
      groupId: route.params.groupId
    });
  } else if (route.name === 'memory') {
    await mountChatMemory(stage, {
      appState,
      characterId: route.params.characterId,
      fromRoute: route.params.fromRoute
    });
  } else {
    await mountChatList(stage, {
      appState,
      tab: route.params.tab,
      search: route.params.search
    });
  }

  if (!rootEl || !mounted) return;

  rootEl.replaceChildren(stage);
  activeView = route.name;
}

function unmountActiveView() {
  if (activeView === 'thread') {
    unmountChatThread();
  }

  if (activeView === 'memory') {
    unmountChatMemory();
  }

  if (activeView === 'list') {
    unmountChatList();
  }

  activeView = '';
}

function resolveInitialRoute(options = {}) {
  if (options.route) return normalizeRoute(options.route);

  const saved = getData(CHAT_ROUTE_KEY);
  if (saved?.name) return normalizeRoute(saved);

  return normalizeRoute({
    name: 'list',
    params: {
      tab: options.tab === 'group' ? 'group' : 'private',
      search: ''
    }
  });
}

function saveRoute() {
  setData(CHAT_ROUTE_KEY, currentRoute);
}

function normalizeRoute(route) {
  if (!route || typeof route !== 'object') {
    return {
      name: 'list',
      params: {
        tab: 'private',
        search: ''
      }
    };
  }

  if (route.name === 'thread') {
    const mode = route.params?.mode === 'group' ? 'group' : 'private';

    return {
      name: 'thread',
      params: {
        mode,
        characterId: mode === 'private' ? String(route.params?.characterId || '') : '',
        groupId: mode === 'group' ? String(route.params?.groupId || '') : ''
      }
    };
  }

  if (route.name === 'memory') {
    return {
      name: 'memory',
      params: {
        characterId: String(route.params?.characterId || ''),
        fromRoute: route.params?.fromRoute ? normalizeRoute(route.params.fromRoute) : null
      }
    };
  }

  return {
    name: 'list',
    params: {
      tab: route.params?.tab === 'group' ? 'group' : 'private',
      search: String(route.params?.search || '')
    }
  };
}

function normalizeExternalInteraction(input, legacyInteraction) {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
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

async function summarizeExternalMemory({ character, role, content, source }) {
  const fallback = createFallbackExternalMemory({
    character,
    role,
    content,
    source
  });

  const prompt = [
    '请把下面这段外部事件总结成一条适合长期记忆的中文。',
    '要求：自然、具体、可作为以后聊天时想起来的素材。',
    '不要写成系统日志，不要提“外部事件”这四个字。',
    '只返回 JSON：{"memory":"..."}',
    `角色：${character.name || 'TA'}`,
    `来源：${source}`,
    `发言者：${role === 'user' ? '用户' : character.name || 'TA'}`,
    `内容：${content}`
  ].join('\n');

  const result = await silentRequest({
    prompt,
    json: true
  }).catch(() => null);

  const memory = normalizeText(result?.memory || '');
  return memory ? trimMemory(memory) : fallback;
}

function createFallbackExternalMemory({ character, role, content, source }) {
  const actor = role === 'user' ? '用户' : (character?.name || 'TA');
  const shortContent = trimMemory(content, 34);
  const cleanSource = normalizeText(source || '某个地方');

  if (!shortContent) return '';

  return trimMemory(`${actor}曾在${cleanSource}里经历过：${shortContent}`);
}

async function isDuplicateMemory(characterId, content) {
  const fingerprint = createMemoryFingerprint(content);
  if (!fingerprint) return true;

  const memories = await getByIndexDB('memories', 'characterId', characterId).catch(() => []);
  const recent = normalizeArray(memories).slice(-MEMORY_DUPLICATE_LIMIT);

  return recent.some((item) => {
    const oldFingerprint = createMemoryFingerprint(item?.content || '');
    if (!oldFingerprint) return false;

    return oldFingerprint === fingerprint ||
      oldFingerprint.includes(fingerprint.slice(0, 22)) ||
      fingerprint.includes(oldFingerprint.slice(0, 22));
  });
}

function createMemoryFingerprint(text) {
  return normalizeText(text)
    .replace(/[，。！？、；：“”‘’"'`~\-—_=+()[\]{}<>【】《》,.!?;:]/g, '')
    .toLowerCase()
    .slice(0, 160);
}

function getHiddenPrivateThreads() {
  const saved = getData(CHAT_HIDDEN_PRIVATE_KEY);
  return Array.isArray(saved) ? saved : [];
}

function hidePrivateThread(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  const ids = new Set(getHiddenPrivateThreads());
  ids.add(id);
  setData(CHAT_HIDDEN_PRIVATE_KEY, [...ids]);
}

function unhidePrivateThread(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return;

  const next = getHiddenPrivateThreads().filter((item) => item !== id);
  setData(CHAT_HIDDEN_PRIVATE_KEY, next);
}

function isPrivateThreadHidden(characterId) {
  const id = String(characterId || '').trim();
  if (!id) return false;
  return getHiddenPrivateThreads().includes(id);
}

function closeChatApp() {
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
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function trimMemory(text, max = 48) {
  const clean = normalizeText(text)
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');

  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function injectChatAppStyle() {
  if (document.getElementById(CHAT_APP_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = CHAT_APP_STYLE_ID;
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
      font-size: var(--font-size-base);
      line-height: 1.6;
    }

    .chat-icon-btn,
    .chat-primary-btn,
    .chat-ghost-btn {
      border: 0;
      font: inherit;
      transition: all 200ms ease;
    }

    .chat-icon-btn:active,
    .chat-primary-btn:active,
    .chat-ghost-btn:active {
      transform: scale(0.96);
    }

    .chat-icon-btn {
      width: 38px;
      height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .chat-primary-btn,
    .chat-ghost-btn {
      min-height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      padding: 0 16px;
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
    }

    .chat-primary-btn {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-ghost-btn {
      background: var(--bg-card);
      color: var(--text-primary);
    }

    .chat-input-card {
      width: 100%;
      min-height: 42px;
      border: 0;
      outline: 0;
      border-radius: var(--radius-md);
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      padding: 10px 13px;
      font: inherit;
      font-size: 16px;
      line-height: 1.6;
      appearance: none;
    }

    .chat-input-card::placeholder {
      color: var(--text-hint);
    }

    .chat-empty {
      min-height: 190px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 30px 20px;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      text-align: center;
    }

    .chat-empty-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-empty-desc {
      max-width: 270px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }
  `;

  document.head.appendChild(style);
}

// 改了什么：只修 renderRoute 挂载顺序，并补 navigateToList 兼容旧返回调用。
// 会不会影响其他文件：不会；反而避免 list/thread/memory 的全局 state 被误清空。
// 更新记忆里该文件的导出函数：mount(containerEl, options)、unmount()、recordExternalInteraction(input, legacyInteraction)
// 依赖：./chat/list.js(mountChatList,unmountChatList)；./chat/memory.js(mountChatMemory,unmountChatMemory)；./chat/thread.js(mountChatThread,unmountChatThread)；../core/storage.js(getData,setData,generateId,getNow,getDB,setDB,getByIndexDB)；../core/api.js(silentRequest)
