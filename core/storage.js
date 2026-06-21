export const STORAGE_VERSION = '1.0.0';

export const STORAGE_KEYS = {
  root: 'ai_phone_desktop_state_v1',
  theme: 'ai_phone_theme_v1'
};

export const DEFAULT_APPS = [
  { id: 'chat', name: '消息', module: '/apps/chat.js' },
  { id: 'moments', name: '朋友圈', module: '/apps/moments.js' },
  { id: 'characters', name: '角色管理', module: '/apps/characters.js' },
  { id: 'worldbook', name: '世界书', module: '/apps/worldbook.js' },
  { id: 'games', name: '小游戏', module: '/apps/games.js' },
  { id: 'shop', name: '商店', module: '/apps/shop.js' },
  { id: 'wallet', name: '钱包', module: '/apps/wallet.js' },
  { id: 'memo', name: '备忘录', module: '/apps/memo.js' },
  { id: 'anniversary', name: '纪念日', module: '/apps/anniversary.js' },
  { id: 'settings', name: '设置', module: '/apps/settings.js' }
];

export const DEFAULT_API_CONFIG = {
  endpoint: '',
  model: '',
  apiKey: ''
};

export const DEFAULT_TTS_CONFIG = {
  provider: 'openai',
  voice: 'nova',
  apiKey: '',
  endpoint: '',
  enabled: false
};

export const DEFAULT_CHARACTER = {
  id: '',
  name: '新的角色',
  avatar: '',
  chatBackground: '',
  systemPrompt: '',
  ttsConfig: { ...DEFAULT_TTS_CONFIG },
  apiConfig: { ...DEFAULT_API_CONFIG },
  memoryTriggerCount: 100,
  memories: [],
  chatHistory: [],
  mood: 'neutral',
  worldbookIds: []
};

export const DEFAULT_SETTINGS = {
  apiConfigs: [],
  defaultApiConfigId: '',
  ttsConfig: { ...DEFAULT_TTS_CONFIG },
  mcpServers: [],
  themeName: '奶油白',
  personalization: {
    wallpaper: '',
    userAvatar: '',
    bubbleMode: 'bubble',
    widgets: {
      time: true,
      weather: true,
      anniversary: true
    },
    weather: {
      city: '',
      latitude: '',
      longitude: ''
    }
  },
  chat: {
    stream: true,
    memoryInjection: true,
    autoMoments: false,
    autoTTS: false
  }
};

export const DEFAULT_WALLET = {
  balance: 0,
  records: [],
  inventory: []
};

export const DEFAULT_DATA = {
  version: STORAGE_VERSION,
  settings: DEFAULT_SETTINGS,
  apps: [],
  characters: [],
  worldbook: [],
  groups: [],
  moments: [],
  wallet: DEFAULT_WALLET,
  memos: [],
  anniversaries: [],
  games: {
    sessions: []
  },
  lastOpenedApp: '',
  createdAt: '',
  updatedAt: ''
};

export function uuid() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function nowISO() {
  return new Date().toISOString();
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function readLocal(key, fallback = null) {
  try {
    const value = localStorage.getItem(key);
    return safeParse(value, fallback);
  } catch {
    return fallback;
  }
}

export function writeLocal(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeLocal(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

function createDefaultApps() {
  return DEFAULT_APPS.map((app, index) => ({
    ...app,
    customName: app.name,
    icon: '',
    page: index < 8 ? 0 : 1,
    order: index,
    dock: ['chat', 'moments', 'characters', 'settings'].includes(app.id)
  }));
}

function normalizeApiConfig(apiConfig = {}) {
  return {
    endpoint: apiConfig.endpoint || '',
    model: apiConfig.model || '',
    apiKey: apiConfig.apiKey || ''
  };
}

function normalizeTTSConfig(ttsConfig = {}) {
  return {
    provider: ttsConfig.provider || DEFAULT_TTS_CONFIG.provider,
    voice: ttsConfig.voice || DEFAULT_TTS_CONFIG.voice,
    apiKey: ttsConfig.apiKey || '',
    endpoint: ttsConfig.endpoint || '',
    enabled: Boolean(ttsConfig.enabled)
  };
}

export function createDefaultCharacter(data = {}) {
  return {
    id: data.id || uuid(),
    name: data.name || DEFAULT_CHARACTER.name,
    avatar: data.avatar || '',
    chatBackground: data.chatBackground || '',
    systemPrompt: data.systemPrompt || '',
    ttsConfig: normalizeTTSConfig(data.ttsConfig),
    apiConfig: normalizeApiConfig(data.apiConfig),
    memoryTriggerCount: Number(data.memoryTriggerCount || DEFAULT_CHARACTER.memoryTriggerCount),
    memories: Array.isArray(data.memories) ? data.memories : [],
    chatHistory: Array.isArray(data.chatHistory) ? data.chatHistory : [],
    mood: data.mood || DEFAULT_CHARACTER.mood,
    worldbookIds: Array.isArray(data.worldbookIds) ? data.worldbookIds : []
  };
}

export function createMessage(data = {}) {
  return {
    id: data.id || uuid(),
    role: data.role || 'user',
    type: data.type || 'text',
    content: data.content || '',
    name: data.name || '',
    avatar: data.avatar || '',
    characterId: data.characterId || '',
    groupId: data.groupId || '',
    thinking: data.thinking || '',
    raw: data.raw || '',
    amount: Number(data.amount || 0),
    createdAt: data.createdAt || nowISO()
  };
}

export function createMemoryItem(data = {}) {
  return {
    id: data.id || uuid(),
    content: data.content || '',
    source: data.source || 'manual',
    createdAt: data.createdAt || nowISO()
  };
}

export function createWorldbookItem(data = {}) {
  return {
    id: data.id || uuid(),
    type: data.type || 'background',
    title: data.title || '新的条目',
    content: data.content || '',
    characterIds: Array.isArray(data.characterIds) ? data.characterIds : [],
    enabled: data.enabled !== false,
    createdAt: data.createdAt || nowISO(),
    updatedAt: data.updatedAt || nowISO()
  };
}

export function createMoment(data = {}) {
  return {
    id: data.id || uuid(),
    characterId: data.characterId || '',
    name: data.name || '',
    avatar: data.avatar || '',
    content: data.content || '',
    image: data.image || '',
    likes: Array.isArray(data.likes) ? data.likes : [],
    comments: Array.isArray(data.comments) ? data.comments : [],
    createdAt: data.createdAt || nowISO()
  };
}

export function createMemo(data = {}) {
  return {
    id: data.id || uuid(),
    title: data.title || '无标题',
    content: data.content || '',
    createdAt: data.createdAt || nowISO(),
    updatedAt: data.updatedAt || nowISO()
  };
}

export function createAnniversary(data = {}) {
  return {
    id: data.id || uuid(),
    title: data.title || '纪念日',
    date: data.date || new Date().toISOString().slice(0, 10),
    remind: data.remind !== false,
    createdAt: data.createdAt || nowISO(),
    updatedAt: data.updatedAt || nowISO()
  };
}

export function createWalletRecord(data = {}) {
  return {
    id: data.id || uuid(),
    type: data.type || 'manual',
    title: data.title || '',
    amount: Number(data.amount || 0),
    balanceAfter: Number(data.balanceAfter || 0),
    targetCharacterId: data.targetCharacterId || '',
    itemId: data.itemId || '',
    createdAt: data.createdAt || nowISO()
  };
}

export function createInventoryItem(data = {}) {
  return {
    id: data.id || uuid(),
    itemId: data.itemId || '',
    name: data.name || '',
    description: data.description || '',
    effectPrompt: data.effectPrompt || '',
    targetCharacterId: data.targetCharacterId || '',
    used: Boolean(data.used),
    createdAt: data.createdAt || nowISO()
  };
}

export function createGroup(data = {}) {
  return {
    id: data.id || uuid(),
    name: data.name || '新的群聊',
    avatar: data.avatar || '',
    characterIds: Array.isArray(data.characterIds) ? data.characterIds : [],
    chatHistory: Array.isArray(data.chatHistory) ? data.chatHistory : [],
    createdAt: data.createdAt || nowISO(),
    updatedAt: data.updatedAt || nowISO()
  };
}

function normalizeSettings(settings = {}) {
  const personalization = settings.personalization || {};
  const widgets = personalization.widgets || {};
  const weather = personalization.weather || {};
  const chat = settings.chat || {};

  return {
    apiConfigs: Array.isArray(settings.apiConfigs) ? settings.apiConfigs : [],
    defaultApiConfigId: settings.defaultApiConfigId || '',
    ttsConfig: normalizeTTSConfig(settings.ttsConfig),
    mcpServers: Array.isArray(settings.mcpServers) ? settings.mcpServers : [],
    themeName: settings.themeName || DEFAULT_SETTINGS.themeName,
    personalization: {
      wallpaper: personalization.wallpaper || '',
      userAvatar: personalization.userAvatar || '',
      bubbleMode: personalization.bubbleMode || DEFAULT_SETTINGS.personalization.bubbleMode,
      widgets: {
        time: widgets.time !== false,
        weather: widgets.weather !== false,
        anniversary: widgets.anniversary !== false
      },
      weather: {
        city: weather.city || '',
        latitude: weather.latitude || '',
        longitude: weather.longitude || ''
      }
    },
    chat: {
      stream: chat.stream !== false,
      memoryInjection: chat.memoryInjection !== false,
      autoMoments: Boolean(chat.autoMoments),
      autoTTS: Boolean(chat.autoTTS)
    }
  };
}

function normalizeWallet(wallet = {}) {
  return {
    balance: Number(wallet.balance || 0),
    records: Array.isArray(wallet.records) ? wallet.records : [],
    inventory: Array.isArray(wallet.inventory) ? wallet.inventory : []
  };
}

function normalizeApp(app, index) {
  const defaultApp = DEFAULT_APPS.find((item) => item.id === app.id) || {};

  return {
    id: app.id || defaultApp.id || uuid(),
    name: defaultApp.name || app.name || '应用',
    module: defaultApp.module || app.module || '',
    customName: app.customName || app.name || defaultApp.name || '应用',
    icon: app.icon || '',
    page: Number.isFinite(Number(app.page)) ? Number(app.page) : index < 8 ? 0 : 1,
    order: Number.isFinite(Number(app.order)) ? Number(app.order) : index,
    dock: Boolean(app.dock)
  };
}

export function normalizeData(data = {}) {
  const createdAt = data.createdAt || nowISO();
  const savedApps = Array.isArray(data.apps) && data.apps.length ? data.apps : createDefaultApps();
  const mergedApps = createDefaultApps().map((defaultApp, index) => {
    const saved = savedApps.find((item) => item.id === defaultApp.id);
    return normalizeApp({ ...defaultApp, ...(saved || {}) }, index);
  });

  return {
    version: data.version || STORAGE_VERSION,
    settings: normalizeSettings(data.settings),
    apps: mergedApps,
    characters: Array.isArray(data.characters) ? data.characters.map(createDefaultCharacter) : [],
    worldbook: Array.isArray(data.worldbook) ? data.worldbook.map(createWorldbookItem) : [],
    groups: Array.isArray(data.groups) ? data.groups.map(createGroup) : [],
    moments: Array.isArray(data.moments) ? data.moments.map(createMoment) : [],
    wallet: normalizeWallet(data.wallet),
    memos: Array.isArray(data.memos) ? data.memos.map(createMemo) : [],
    anniversaries: Array.isArray(data.anniversaries) ? data.anniversaries.map(createAnniversary) : [],
    games: {
      sessions: data.games && Array.isArray(data.games.sessions) ? data.games.sessions : []
    },
    lastOpenedApp: data.lastOpenedApp || '',
    createdAt,
    updatedAt: data.updatedAt || nowISO()
  };
}

export function createInitialData() {
  const time = nowISO();

  return normalizeData({
    ...clone(DEFAULT_DATA),
    apps: createDefaultApps(),
    createdAt: time,
    updatedAt: time
  });
}

export function getData() {
  const stored = readLocal(STORAGE_KEYS.root, null);

  if (!stored) {
    const initialData = createInitialData();
    writeLocal(STORAGE_KEYS.root, initialData);
    return initialData;
  }

  const data = normalizeData(stored);

  if (JSON.stringify(data) !== JSON.stringify(stored)) {
    writeLocal(STORAGE_KEYS.root, data);
  }

  return data;
}

export function setData(nextData) {
  const data = normalizeData({
    ...nextData,
    updatedAt: nowISO()
  });

  writeLocal(STORAGE_KEYS.root, data);
  dispatchStorageChange(data);
  return data;
}

export function updateData(updater) {
  const current = getData();
  const next = typeof updater === 'function' ? updater(clone(current)) : updater;
  return setData(next);
}

export function resetData() {
  const data = createInitialData();
  writeLocal(STORAGE_KEYS.root, data);
  dispatchStorageChange(data);
  return data;
}

export function exportAllData() {
  return JSON.stringify(getData(), null, 2);
}

export function importAllData(json) {
  const parsed = typeof json === 'string' ? JSON.parse(json) : json;
  return setData(parsed);
}

export function clearAllData() {
  removeLocal(STORAGE_KEYS.root);
  removeLocal(STORAGE_KEYS.theme);
  const data = createInitialData();
  dispatchStorageChange(data);
  return data;
}

export function getSettings() {
  return getData().settings;
}

export function setSettings(settings) {
  return updateData((data) => {
    data.settings = normalizeSettings(settings);
    return data;
  }).settings;
}

export function updateSettings(updater) {
  const settings = getSettings();
  const next = typeof updater === 'function' ? updater(clone(settings)) : updater;
  return setSettings(next);
}

export function getApps() {
  return getData().apps.slice().sort((a, b) => a.page - b.page || a.order - b.order);
}

export function setApps(apps) {
  return updateData((data) => {
    data.apps = apps.map(normalizeApp);
    return data;
  }).apps;
}

export function updateApp(appId, patch) {
  return updateData((data) => {
    data.apps = data.apps.map((app) => app.id === appId ? normalizeApp({ ...app, ...patch }, app.order) : app);
    return data;
  }).apps.find((app) => app.id === appId);
}

export function getCharacters() {
  return getData().characters;
}

export function getCharacter(characterId) {
  return getCharacters().find((character) => character.id === characterId) || null;
}

export function saveCharacter(character) {
  const normalized = createDefaultCharacter(character);

  updateData((data) => {
    const index = data.characters.findIndex((item) => item.id === normalized.id);

    if (index >= 0) {
      data.characters[index] = normalized;
    } else {
      data.characters.unshift(normalized);
    }

    return data;
  });

  return normalized;
}

export function deleteCharacter(characterId) {
  return updateData((data) => {
    data.characters = data.characters.filter((character) => character.id !== characterId);
    data.groups = data.groups.map((group) => ({
      ...group,
      characterIds: group.characterIds.filter((id) => id !== characterId)
    }));
    return data;
  });
}

export function appendCharacterMessage(characterId, message) {
  const normalizedMessage = createMessage({
    ...message,
    characterId
  });

  updateData((data) => {
    const character = data.characters.find((item) => item.id === characterId);

    if (character) {
      character.chatHistory.push(normalizedMessage);
    }

    return data;
  });

  return normalizedMessage;
}

export function setCharacterHistory(characterId, chatHistory) {
  return updateData((data) => {
    const character = data.characters.find((item) => item.id === characterId);

    if (character) {
      character.chatHistory = Array.isArray(chatHistory) ? chatHistory.map(createMessage) : [];
    }

    return data;
  });
}

export function addCharacterMemory(characterId, memory) {
  const memoryItem = createMemoryItem(memory);

  updateData((data) => {
    const character = data.characters.find((item) => item.id === characterId);

    if (character) {
      character.memories.unshift(memoryItem);
    }

    return data;
  });

  return memoryItem;
}

export function deleteCharacterMemory(characterId, memoryId) {
  return updateData((data) => {
    const character = data.characters.find((item) => item.id === characterId);

    if (character) {
      character.memories = character.memories.filter((memory) => memory.id !== memoryId);
    }

    return data;
  });
}

export function getWorldbookItems() {
  return getData().worldbook;
}

export function saveWorldbookItem(item) {
  const normalized = createWorldbookItem({
    ...item,
    updatedAt: nowISO()
  });

  updateData((data) => {
    const index = data.worldbook.findIndex((entry) => entry.id === normalized.id);

    if (index >= 0) {
      data.worldbook[index] = normalized;
    } else {
      data.worldbook.unshift(normalized);
    }

    return data;
  });

  return normalized;
}

export function deleteWorldbookItem(itemId) {
  return updateData((data) => {
    data.worldbook = data.worldbook.filter((item) => item.id !== itemId);
    data.characters = data.characters.map((character) => ({
      ...character,
      worldbookIds: character.worldbookIds.filter((id) => id !== itemId)
    }));
    return data;
  });
}

export function getGroups() {
  return getData().groups;
}

export function getGroup(groupId) {
  return getGroups().find((group) => group.id === groupId) || null;
}

export function saveGroup(group) {
  const normalized = createGroup({
    ...group,
    updatedAt: nowISO()
  });

  updateData((data) => {
    const index = data.groups.findIndex((item) => item.id === normalized.id);

    if (index >= 0) {
      data.groups[index] = normalized;
    } else {
      data.groups.unshift(normalized);
    }

    return data;
  });

  return normalized;
}

export function deleteGroup(groupId) {
  return updateData((data) => {
    data.groups = data.groups.filter((group) => group.id !== groupId);
    return data;
  });
}

export function appendGroupMessage(groupId, message) {
  const normalizedMessage = createMessage({
    ...message,
    groupId
  });

  updateData((data) => {
    const group = data.groups.find((item) => item.id === groupId);

    if (group) {
      group.chatHistory.push(normalizedMessage);
      group.updatedAt = nowISO();
    }

    return data;
  });

  return normalizedMessage;
}

export function getMoments() {
  return getData().moments;
}

export function saveMoment(moment) {
  const normalized = createMoment(moment);

  updateData((data) => {
    const index = data.moments.findIndex((item) => item.id === normalized.id);

    if (index >= 0) {
      data.moments[index] = normalized;
    } else {
      data.moments.unshift(normalized);
    }

    return data;
  });

  return normalized;
}

export function deleteMoment(momentId) {
  return updateData((data) => {
    data.moments = data.moments.filter((moment) => moment.id !== momentId);
    return data;
  });
}

export function getWallet() {
  return getData().wallet;
}

export function setWallet(wallet) {
  return updateData((data) => {
    data.wallet = normalizeWallet(wallet);
    return data;
  }).wallet;
}

export function addWalletRecord(record) {
  let savedRecord = null;

  updateData((data) => {
    const amount = Number(record.amount || 0);
    data.wallet.balance = Math.max(0, Number(data.wallet.balance || 0) + amount);

    savedRecord = createWalletRecord({
      ...record,
      amount,
      balanceAfter: data.wallet.balance
    });

    data.wallet.records.unshift(savedRecord);
    return data;
  });

  return savedRecord;
}

export function addInventoryItem(item) {
  const inventoryItem = createInventoryItem(item);

  updateData((data) => {
    data.wallet.inventory.unshift(inventoryItem);
    return data;
  });

  return inventoryItem;
}

export function getMemos() {
  return getData().memos;
}

export function saveMemo(memo) {
  const normalized = createMemo({
    ...memo,
    updatedAt: nowISO()
  });

  updateData((data) => {
    const index = data.memos.findIndex((item) => item.id === normalized.id);

    if (index >= 0) {
      data.memos[index] = normalized;
    } else {
      data.memos.unshift(normalized);
    }

    return data;
  });

  return normalized;
}

export function deleteMemo(memoId) {
  return updateData((data) => {
    data.memos = data.memos.filter((memo) => memo.id !== memoId);
    return data;
  });
}

export function getAnniversaries() {
  return getData().anniversaries;
}

export function saveAnniversary(anniversary) {
  const normalized = createAnniversary({
    ...anniversary,
    updatedAt: nowISO()
  });

  updateData((data) => {
    const index = data.anniversaries.findIndex((item) => item.id === normalized.id);

    if (index >= 0) {
      data.anniversaries[index] = normalized;
    } else {
      data.anniversaries.unshift(normalized);
    }

    return data;
  });

  return normalized;
}

export function deleteAnniversary(anniversaryId) {
  return updateData((data) => {
    data.anniversaries = data.anniversaries.filter((anniversary) => anniversary.id !== anniversaryId);
    return data;
  });
}

export function getGameSessions() {
  return getData().games.sessions;
}

export function saveGameSession(session) {
  const normalized = {
    id: session.id || uuid(),
    gameId: session.gameId || '',
    mode: session.mode || 'host',
    characterIds: Array.isArray(session.characterIds) ? session.characterIds : [],
    messages: Array.isArray(session.messages) ? session.messages : [],
    status: session.status || 'active',
    createdAt: session.createdAt || nowISO(),
    updatedAt: nowISO()
  };

  updateData((data) => {
    const index = data.games.sessions.findIndex((item) => item.id === normalized.id);

    if (index >= 0) {
      data.games.sessions[index] = normalized;
    } else {
      data.games.sessions.unshift(normalized);
    }

    return data;
  });

  return normalized;
}

export function setLastOpenedApp(appId) {
  return updateData((data) => {
    data.lastOpenedApp = appId || '';
    return data;
  }).lastOpenedApp;
}

export function dispatchStorageChange(data = getData()) {
  window.dispatchEvent(new CustomEvent('ai-phone-storage-change', {
    detail: clone(data)
  }));
}

export function onStorageChange(callback) {
  const handler = (event) => callback(event.detail || getData());
  window.addEventListener('ai-phone-storage-change', handler);

  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEYS.root) {
      callback(getData());
    }
  });

  return () => {
    window.removeEventListener('ai-phone-storage-change', handler);
  };
}
