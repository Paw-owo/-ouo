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
  setDB
} from '../core/storage.js';

const CHAT_APP_STYLE_ID = 'chat-app-style';
const CHAT_ROUTE_KEY = 'chat_last_route';
const CHAT_HIDDEN_PRIVATE_KEY = 'chat_hidden_private_threads';

let rootEl = null;
let mounted = false;
let activeView = '';
let unsubscribeCharsUpdated = null;
let unsubscribeWalletTransfer = null;
let unsubscribeShopGift = null;
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

  // 注册到 appBus，让其他 APP 可以联动 chat
  try {
    window.AppBus?.registerAPI('chat', getAppApi());
  } catch (_) {}

  // 监听全局事件
  if (window.AppBus) {
    unsubscribeCharsUpdated = window.AppBus.on('characters:updated', async () => {
      if (currentRoute.name === 'list') {
        await renderRoute();
      }
    });

    unsubscribeWalletTransfer = window.AppBus.on('wallet:transfer', (data) => {
      const amount = Number(data?.amount || 0);
      const name = data?.characterName || data?.characterId || 'TA';
      const dir = data?.direction;
      const isInThread = currentRoute.name === 'thread' && currentRoute.params?.characterId === data?.characterId;

      // 落库 + 写未读（角色隔离：必须有 characterId 才写入对应私聊会话）
      if (data?.characterId) {
        appendExternalChatMessage({
          characterId: String(data.characterId),
          characterName: name,
          role: dir === 'ai_to_user' ? 'assistant' : 'user',
          type: 'transfer',
          content: dir === 'ai_to_user'
            ? `收到 ${name} 转来的 ¥${amount}${data?.note ? `，${data.note}` : ''}`
            : `已转给 ${name} ¥${amount}${data?.note ? `，${data.note}` : ''}`,
          amount,
          transferAmount: amount,
          note: String(data?.note || ''),
          direction: dir || '',
          title: dir === 'ai_to_user' ? `${name}转给我` : `转给${name}`,
          incrementUnread: !isInThread
        });
      }

      // 当前会话就是该角色时不再 toast（避免在 thread 内重复打扰）
      if (isInThread) return;
      const text = dir === 'ai_to_user'
        ? `收到 ${name} 转来的 ¥${amount}`
        : `已转给 ${name} ¥${amount}`;
      window.showToast?.(text);
    });

    unsubscribeShopGift = window.AppBus.on('shop:gift', (data) => {
      const itemName = data?.itemName || data?.title || '礼物';
      const name = data?.characterName || data?.characterId || 'TA';
      const dir = data?.direction;
      const isInThread = currentRoute.name === 'thread' && currentRoute.params?.characterId === data?.characterId;

      // 落库 + 写未读（角色隔离：必须有 characterId 才写入对应私聊会话）
      if (data?.characterId) {
        appendExternalChatMessage({
          characterId: String(data.characterId),
          characterName: name,
          role: dir === 'ai_to_user' ? 'assistant' : 'user',
          type: 'gift',
          content: dir === 'ai_to_user'
            ? `收到 ${name} 的礼物：${itemName}${data?.note ? `，${data.note}` : ''}`
            : `已送 ${name} 礼物：${itemName}${data?.note ? `，${data.note}` : ''}`,
          note: String(data?.note || ''),
          direction: dir || '',
          title: dir === 'ai_to_user' ? `${name}送给我一件小物` : `送给${name}的小礼物`,
          itemId: String(data?.itemId || ''),
          itemName: itemName,
          itemDesc: String(data?.itemDesc || data?.itemDescription || ''),
          itemPrice: Number(data?.itemPrice || data?.price || 0),
          itemImage: String(data?.itemImage || data?.image || ''),
          card: data?.card || null,
          item: data?.item || null,
          shopItem: data?.shopItem || null,
          incrementUnread: !isInThread
        });
      }

      // 当前会话就是该角色时不再 toast
      if (isInThread) return;
      const text = dir === 'ai_to_user'
        ? `收到 ${name} 的礼物：${itemName}`
        : `已送 ${name} 礼物：${itemName}`;
      window.showToast?.(text);
    });
  }
}

export function unmount() {
  mounted = false;

  unmountActiveView();

  if (unsubscribeCharsUpdated) {
    try { unsubscribeCharsUpdated(); } catch (_) {}
    unsubscribeCharsUpdated = null;
  }
  if (unsubscribeWalletTransfer) {
    try { unsubscribeWalletTransfer(); } catch (_) {}
    unsubscribeWalletTransfer = null;
  }
  if (unsubscribeShopGift) {
    try { unsubscribeShopGift(); } catch (_) {}
    unsubscribeShopGift = null;
  }

  if (rootEl) {
    rootEl.replaceChildren();
  }

  rootEl = null;
  activeView = '';
}

// 对外暴露 chat 能力，供其他 APP 通过 appBus.getAPI('chat') 调用
export function getAppApi() {
  return {
    appState,

    async openPrivateThread(characterId) {
      return appState.openPrivateThread(characterId);
    },

    async openGroupThread(groupId) {
      return appState.openGroupThread(groupId);
    },

    async openMemory(characterId, options = {}) {
      return appState.openMemory(characterId, options);
    },

    async sendMessage(characterId, text, extra = {}) {
      const id = String(characterId || '').trim();
      const content = String(text || '').trim();
      if (!id || !content) return null;
      await appState.openPrivateThread(id);
      // 通过 recordExternalInteraction 把外部消息写入记忆；UI 层的消息渲染由 thread 自身处理
      return recordExternalInteraction({
        characterId: id,
        role: 'user',
        content,
        source: extra.source || '外部 APP',
        importance: extra.importance,
        mood: extra.mood || ''
      });
    },

    async refreshList() {
      if (currentRoute.name === 'list') {
        await renderRoute();
      }
    },

    async refreshCurrentThread() {
      if (currentRoute.name === 'thread') {
        await renderRoute();
      }
    },

    async recordExternalInteraction(payload) {
      return recordExternalInteraction(payload);
    },

    async navigateToRoute(route) {
      if (!route || !route.name) return;
      await navigateTo(route);
    }
  };
}

export async function recordExternalInteraction(input = {}, legacyInteraction = {}) {
  // 统一走 core/memory.js（通过 appBus 转发），保留 source/keywords/importance/mood
  const payload = normalizeExternalInteraction(input, legacyInteraction);
  if (!payload?.characterId || !payload?.content) return null;
  try {
    return await window.AppBus.recordExternalInteraction(payload);
  } catch (_) {
    return null;
  }
}

// 把外部事件（shop:gift / wallet:transfer）写入私聊消息库 + 写未读
// 复用现有 messages store 和 chat_unread_counts 键，不新增 store / 不新增未读键
// 角色隔离：无 characterId 直接 return，不乱塞默认角色
async function appendExternalChatMessage(payload = {}) {
  const characterId = String(payload.characterId || '').trim();
  if (!characterId) return null;

  const now = getNow();
  const role = payload.role === 'assistant' ? 'assistant' : 'user';
  const type = String(payload.type || 'text').trim().toLowerCase() === 'shop-item' ? 'shop_item'
    : ['text', 'voice', 'sticker', 'image', 'transfer', 'gift', 'shop_item', 'purchase', 'item', 'dice', 'rps'].includes(String(payload.type || '').trim().toLowerCase())
      ? String(payload.type).trim().toLowerCase()
      : 'text';

  // 字段格式对齐 thread-actions.js 的 buildBaseMessage，保证渲染层正常显示
  const message = {
    id: generateId('msg'),
    role,
    content: String(payload.content || '').trim(),
    type,
    timestamp: now,
    createdAt: now,
    updatedAt: now,
    quoteMessageId: '',
    quoteText: '',
    imageBase64: '',
    stickerId: '',
    stickerImageBase64: '',
    stickerDescription: '',
    transferAmount: Number(payload.transferAmount || payload.amount || 0),
    amount: Number(payload.amount || payload.transferAmount || payload.price || payload.itemPrice || 0),
    price: Number(payload.price || payload.itemPrice || payload.amount || 0),
    note: String(payload.note || ''),
    title: String(payload.title || ''),
    description: String(payload.description || payload.desc || ''),
    desc: String(payload.desc || payload.description || ''),
    direction: String(payload.direction || ''),
    itemId: String(payload.itemId || ''),
    itemName: String(payload.itemName || ''),
    itemDesc: String(payload.itemDesc || payload.itemDescription || ''),
    itemDescription: String(payload.itemDescription || payload.itemDesc || ''),
    itemEffect: String(payload.itemEffect || ''),
    itemPrice: Number(payload.itemPrice || payload.price || 0),
    itemImage: String(payload.itemImage || payload.image || ''),
    image: String(payload.image || payload.itemImage || ''),
    cardType: String(payload.cardType || type),
    card: payload.card || null,
    item: payload.item || null,
    shopItem: payload.shopItem || null,
    characterId,
    characterName: String(payload.characterName || ''),
    characterAvatar: String(payload.characterAvatar || ''),
    groupId: '',
    versionGroupId: '',
    versionStatus: 'active'
  };

  try {
    await setDB('messages', message);
  } catch (error) {
    console.error('[chat] appendExternalChatMessage setDB failed', error);
    return null;
  }

  // 写未读：私聊用 chat_unread_counts，群聊不动 chat_group_unread_counts
  if (payload.incrementUnread !== false) {
    try {
      const unreadMap = getData('chat_unread_counts') || {};
      const next = Math.max(0, Number(unreadMap[characterId] || 0) + 1);
      setData('chat_unread_counts', { ...unreadMap, [characterId]: next });
      if (typeof window.refreshDesktopBadges === 'function') window.refreshDesktopBadges();
    } catch (_) {}
  }

  // 若当前正在该会话内，刷新一下 thread
  try {
    if (currentRoute.name === 'thread' && currentRoute.params?.characterId === characterId) {
      await renderRoute();
    }
  } catch (_) {}

  return message;
}

export const appState = {
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
      source: input.source || '外部互动',
      importance: input.importance,
      mood: input.mood || '',
      character: input.character || null,
      userProfile: input.userProfile || {}
    };
  }

  return {
    characterId: input,
    role: legacyInteraction?.role || 'assistant',
    content: legacyInteraction?.content || legacyInteraction?.text || legacyInteraction?.note || '',
    source: legacyInteraction?.source || '外部互动'
  };
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
