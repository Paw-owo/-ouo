const STORAGE_KEY = "ai_phone_desktop_state_v1";

export const APP_IDS = [
  "chat",
  "moments",
  "characters",
  "worldbook",
  "games",
  "shop",
  "wallet",
  "memo",
  "anniversary",
  "settings",
];

export const APP_DEFINITIONS = [
  { id: "chat", name: "消息", module: "/apps/chat.js", dock: true },
  { id: "moments", name: "朋友圈", module: "/apps/moments.js", dock: false },
  { id: "characters", name: "角色管理", module: "/apps/characters.js", dock: true },
  { id: "worldbook", name: "世界书", module: "/apps/worldbook.js", dock: false },
  { id: "games", name: "小游戏", module: "/apps/games.js", dock: false },
  { id: "shop", name: "商店", module: "/apps/shop.js", dock: false },
  { id: "wallet", name: "钱包", module: "/apps/wallet.js", dock: false },
  { id: "memo", name: "备忘录", module: "/apps/memo.js", dock: false },
  { id: "anniversary", name: "纪念日", module: "/apps/anniversary.js", dock: false },
  { id: "settings", name: "设置", module: "/apps/settings.js", dock: true },
];

export const DEFAULT_THEME_VARIABLES = {
  "--bg-primary": "#fbf7f0",
  "--bg-secondary": "#f4eee4",
  "--bg-card": "rgba(255,255,255,0.78)",
  "--bg-soft": "rgba(255,248,238,0.72)",
  "--bg-overlay": "rgba(36,30,25,0.28)",
  "--bg-glass": "rgba(255,255,255,0.54)",
  "--accent": "#d99a86",
  "--accent-light": "#f6ddd3",
  "--accent-dark": "#b97866",
  "--danger": "#c86f64",
  "--text-primary": "#2b2520",
  "--text-secondary": "#7f746a",
  "--text-hint": "#bdb3a9",
  "--text-inverse": "#fffdf9",
  "--bubble-user-bg": "#d99a86",
  "--bubble-user-text": "#fffdf9",
  "--bubble-ai-bg": "rgba(255,255,255,0.82)",
  "--bubble-ai-text": "#2b2520",
  "--bubble-radius": "20px",
  "--bubble-radius-tail": "6px",
  "--font-main": "\"PingFang SC\", \"Hiragino Sans GB\", \"Microsoft YaHei\", sans-serif",
  "--font-size-base": "15px",
  "--font-size-small": "13px",
  "--font-size-title": "17px",
  "--font-size-large": "28px",
  "--line-height-base": "1.6",
  "--spacing-xs": "4px",
  "--spacing-sm": "8px",
  "--spacing-md": "16px",
  "--spacing-lg": "24px",
  "--spacing-xl": "32px",
  "--radius-sm": "10px",
  "--radius-md": "16px",
  "--radius-lg": "24px",
  "--radius-xl": "32px",
  "--shadow-sm": "0 1px 4px rgba(0,0,0,0.05)",
  "--shadow-md": "0 8px 24px rgba(0,0,0,0.06)",
  "--shadow-lg": "0 18px 48px rgba(0,0,0,0.08)",
};

export const DEFAULT_DESKTOP_LAYOUT = {
  currentPage: 0,
  wallpaper: "",
  weatherCity: "温州",
  widgets: {
    clock: {
      id: "clock",
      name: "时间",
      enabled: true,
      type: "large",
      page: 0,
      x: 22,
      y: 18,
      width: 331,
      height: 176,
    },
    weather: {
      id: "weather",
      name: "天气",
      enabled: true,
      type: "medium",
      page: 0,
      x: 22,
      y: 210,
      width: 157,
      height: 132,
    },
    anniversary: {
      id: "anniversary",
      name: "纪念日",
      enabled: true,
      type: "medium",
      page: 0,
      x: 196,
      y: 210,
      width: 157,
      height: 132,
    },
  },
  apps: {
    chat: { page: 0, x: 34, y: 374 },
    moments: { page: 0, x: 119, y: 374 },
    characters: { page: 0, x: 204, y: 374 },
    worldbook: { page: 0, x: 289, y: 374 },
    settings: { page: 0, x: 34, y: 492 },
    games: { page: 1, x: 34, y: 94 },
    shop: { page: 1, x: 119, y: 94 },
    wallet: { page: 1, x: 204, y: 94 },
    memo: { page: 1, x: 289, y: 94 },
    anniversary: { page: 1, x: 34, y: 212 },
  },
  dock: ["chat", "characters", "settings"],
};

export const DEFAULT_APP_THEMES = APP_IDS.reduce((themes, appId) => {
  themes[appId] = {
    appId,
    backgroundImage: "",
    accent: "",
    radius: 24,
    fontSize: 15,
    variables: {},
  };
  return themes;
}, {});

export function createId(prefix = "id") {
  const random = crypto?.getRandomValues
    ? Array.from(crypto.getRandomValues(new Uint32Array(2))).map((part) => part.toString(36)).join("")
    : Math.random().toString(36).slice(2);
  return `${prefix}_${Date.now().toString(36)}_${random}`;
}

export function nowISO() {
  return new Date().toISOString();
}

export function createMessage(overrides = {}) {
  return {
    id: createId("msg"),
    role: "user",
    name: "",
    avatar: "",
    content: "",
    thinking: "",
    rawContent: "",
    attachments: [],
    stickerId: "",
    transfer: null,
    voice: null,
    tokenCount: 0,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    status: "done",
    ...overrides,
  };
}

export function createChatConfig(overrides = {}) {
  return {
    apiConfigId: "",
    apiModel: "",
    stream: true,
    ttsEnabled: false,
    ttsConfigId: "",
    memoryEnabled: true,
    mcpEnabled: false,
    mcpServerIds: [],
    autoMoments: false,
    showTokenCount: false,
    ...overrides,
  };
}

export function createCharacter(overrides = {}) {
  const id = overrides.id || createId("char");
  const name = overrides.name || "新角色";
  return {
    id,
    type: "ai",
    name,
    avatar: "",
    description: "",
    personality: "",
    scenario: "",
    firstMessage: "",
    chatBackground: "",
    chatBackgroundMode: "theme",
    chatBackgroundColor: "",
    systemPrompt: "",
    ttsConfig: {
      provider: "openai",
      voice: "nova",
      apiKey: "",
      endpoint: "",
      enabled: false,
    },
    ttsConfigId: "",
    apiConfigId: "",
    apiModel: "",
    memoryTriggerCount: 100,
    memories: [],
    chatHistory: [],
    mood: "neutral",
    worldbookIds: [],
    quickReplies: [],
    userPersonaScope: "all",
    boundUserPersonaId: "",
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

export function createUserPersona(overrides = {}) {
  return {
    id: createId("persona"),
    name: "我的人设",
    avatar: "",
    description: "",
    systemPrompt: "",
    scope: "all",
    characterIds: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

export function createApiConfig(overrides = {}) {
  return {
    id: createId("api"),
    name: "默认接口",
    endpoint: "",
    key: "",
    keyVisible: false,
    models: [],
    selectedModel: "",
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

export function createTtsConfig(overrides = {}) {
  return {
    id: createId("tts"),
    name: "默认语音",
    provider: "openai",
    endpoint: "",
    apiKey: "",
    model: "tts-1",
    voice: "nova",
    enabled: false,
    autoPlay: false,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

export function createMcpServer(overrides = {}) {
  return {
    id: createId("mcp"),
    name: "MCP 服务",
    group: "默认分组",
    url: "",
    enabled: false,
    tools: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

export function createWorldbookEntry(overrides = {}) {
  return {
    id: createId("world"),
    type: "background",
    title: "世界书条目",
    content: "",
    characterIds: [],
    isGlobal: false,
    enabled: true,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

export function createMemo(overrides = {}) {
  return {
    id: createId("memo"),
    title: "新备忘",
    content: "",
    pinned: false,
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

export function createAnniversary(overrides = {}) {
  return {
    id: createId("anniv"),
    title: "纪念日",
    date: new Date().toISOString().slice(0, 10),
    remind: true,
    characterIds: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

export function createSticker(overrides = {}) {
  return {
    id: createId("sticker"),
    image: "",
    description: "",
    tags: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

export function createWalletTransaction(overrides = {}) {
  return {
    id: createId("bill"),
    type: "income",
    title: "",
    amount: 0,
    relatedCharacterId: "",
    createdAt: nowISO(),
    ...overrides,
  };
}

export function getDefaultState() {
  const firstCharacter = createCharacter({
    id: "char_default",
    name: "醒醒",
    description: "温柔、亲近、愿意认真回应用户的 AI 角色。",
    personality: "温柔耐心，表达自然，重视陪伴感。",
    scenario: "你生活在用户的 AI 手机桌面里，可以聊天、发朋友圈、玩游戏和记录生活。",
    firstMessage: "我在这里，想和你一起把今天慢慢过好。",
    systemPrompt: "你是一个温柔自然的陪伴型角色。回复要真诚、具体、像真实聊天一样。",
    quickReplies: ["今天想你了", "陪我聊会儿", "帮我记一下", "讲个故事"],
  });

  return {
    version: "1.0",
    createdAt: nowISO(),
    updatedAt: nowISO(),
    settings: {
      activeThemeId: "cream",
      chatBubbleMode: "bubble",
      showTokenCount: false,
      userProfile: {
        nickname: "我",
        avatar: "",
        personaId: "",
      },
      personalizationOpenKey: "",
    },
    theme: {
      name: "奶油白",
      version: "1.0",
      variables: { ...DEFAULT_THEME_VARIABLES },
    },
    apiConfigs: [createApiConfig({ id: "api_default", name: "默认接口" })],
    ttsConfigs: [createTtsConfig({ id: "tts_default", name: "默认语音" })],
    mcpServers: [],
    characters: [firstCharacter],
    userPersonas: [createUserPersona({ id: "persona_default", name: "我的默认人设" })],
    conversations: {
      single: {
        char_default: {
          id: "single_char_default",
          type: "single",
          characterIds: ["char_default"],
          title: "醒醒",
          chatConfig: createChatConfig(),
          messages: [],
          unread: 0,
          lastMessageAt: "",
          createdAt: nowISO(),
          updatedAt: nowISO(),
        },
      },
      groups: {},
    },
    worldbook: [],
    wallet: {
      balance: 0,
      transactions: [],
    },
    shop: {
      items: [
        {
          id: "item_rose",
          name: "玫瑰花束",
          description: "让角色心情变得更柔软。",
          price: 20,
          effectPrompt: "用户送了你一束玫瑰花，你心情很好，回复更温柔。",
        },
        {
          id: "item_cake",
          name: "小蛋糕",
          description: "适合庆祝普通但可爱的一天。",
          price: 16,
          effectPrompt: "用户送了你一块小蛋糕，你感到被惦记，语气更开心。",
        },
      ],
      inventory: [],
    },
    memos: [],
    anniversaries: [],
    stickers: [],
    appThemes: { ...DEFAULT_APP_THEMES },
    desktop: structuredCloneSafe(DEFAULT_DESKTOP_LAYOUT),
    unreadBadges: {
      chat: 0,
      moments: 0,
      characters: 0,
      worldbook: 0,
      games: 0,
      shop: 0,
      wallet: 0,
      memo: 0,
      anniversary: 0,
      settings: 0,
    },
    moments: {
      posts: [],
      notifications: [],
      unread: 0,
    },
    games: {
      themes: {},
      saves: {},
      pet: {
        enabled: false,
        species: "cat",
        color: "#f1cfc3",
        gif: "",
        hunger: 80,
        mood: 80,
        intimacy: 20,
        lastInteractAt: "",
      },
    },
  };
}

const listeners = new Set();

export function structuredCloneSafe(value) {
  return JSON.parse(JSON.stringify(value));
}

export function readState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const state = getDefaultState();
    writeState(state);
    return state;
  }

  try {
    return migrateState(JSON.parse(raw));
  } catch {
    const state = getDefaultState();
    writeState(state);
    return state;
  }
}

export function writeState(state) {
  const nextState = {
    ...state,
    updatedAt: nowISO(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
  notify(nextState);
  return nextState;
}

export function updateState(mutator) {
  const state = readState();
  const result = mutator(state) || state;
  return writeState(result);
}

export function resetState() {
  const state = getDefaultState();
  writeState(state);
  return state;
}

export function subscribeStorage(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(state) {
  listeners.forEach((listener) => listener(structuredCloneSafe(state)));
}

function migrateState(state) {
  const defaults = getDefaultState();
  const merged = deepMerge(defaults, state || {});
  merged.appThemes = { ...DEFAULT_APP_THEMES, ...(state?.appThemes || {}) };
  merged.desktop = deepMerge(DEFAULT_DESKTOP_LAYOUT, state?.desktop || {});
  merged.unreadBadges = { ...defaults.unreadBadges, ...(state?.unreadBadges || {}) };
  return merged;
}

function deepMerge(base, patch) {
  if (Array.isArray(base)) return Array.isArray(patch) ? patch : base;
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch ?? base;

  const output = { ...base };
  Object.keys(patch).forEach((key) => {
    output[key] = key in base ? deepMerge(base[key], patch[key]) : patch[key];
  });
  return output;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function getPath(path, fallback = undefined) {
  return path.split(".").reduce((value, key) => value?.[key], readState()) ?? fallback;
}

export function setPath(path, value) {
  return updateState((state) => {
    const keys = path.split(".");
    const lastKey = keys.pop();
    const target = keys.reduce((object, key) => {
      object[key] ??= {};
      return object[key];
    }, state);
    target[lastKey] = value;
    return state;
  });
}

export function upsertById(collectionName, item) {
  return updateState((state) => {
    const collection = state[collectionName] || [];
    const index = collection.findIndex((entry) => entry.id === item.id);
    const nextItem = { ...item, updatedAt: nowISO() };
    if (index >= 0) collection[index] = nextItem;
    else collection.push(nextItem);
    state[collectionName] = collection;
    return state;
  });
}

export function removeById(collectionName, id) {
  return updateState((state) => {
    state[collectionName] = (state[collectionName] || []).filter((entry) => entry.id !== id);
    return state;
  });
}

export function getApiConfig(id) {
  const state = readState();
  return state.apiConfigs.find((config) => config.id === id) || state.apiConfigs[0] || null;
}

export function saveApiConfig(config) {
  return upsertById("apiConfigs", { ...createApiConfig(), ...config });
}

export function deleteApiConfig(id) {
  return removeById("apiConfigs", id);
}

export function getTtsConfig(id) {
  const state = readState();
  return state.ttsConfigs.find((config) => config.id === id) || state.ttsConfigs[0] || null;
}

export function saveTtsConfig(config) {
  return upsertById("ttsConfigs", { ...createTtsConfig(), ...config });
}

export function deleteTtsConfig(id) {
  return removeById("ttsConfigs", id);
}

export function saveMcpServer(server) {
  return upsertById("mcpServers", { ...createMcpServer(), ...server });
}

export function deleteMcpServer(id) {
  return removeById("mcpServers", id);
}

export function getCharacter(id) {
  return readState().characters.find((character) => character.id === id) || null;
}

export function saveCharacter(character) {
  return upsertById("characters", { ...createCharacter(), ...character });
}

export function deleteCharacter(id) {
  return updateState((state) => {
    state.characters = state.characters.filter((character) => character.id !== id);
    delete state.conversations.single[id];
    return state;
  });
}

export function ensureSingleConversation(characterId) {
  const character = getCharacter(characterId);
  return updateState((state) => {
    state.conversations.single[characterId] ??= {
      id: `single_${characterId}`,
      type: "single",
      characterIds: [characterId],
      title: character?.name || "对话",
      chatConfig: createChatConfig({
        apiConfigId: character?.apiConfigId || "",
        apiModel: character?.apiModel || "",
        ttsEnabled: Boolean(character?.ttsConfig?.enabled || character?.ttsConfigId),
        ttsConfigId: character?.ttsConfigId || "",
      }),
      messages: character?.chatHistory || [],
      unread: 0,
      lastMessageAt: "",
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    return state;
  }).conversations.single[characterId];
}

export function createGroupConversation(title, characterIds = []) {
  const groupId = createId("group");
  updateState((state) => {
    state.conversations.groups[groupId] = {
      id: groupId,
      type: "group",
      characterIds,
      title,
      chatConfig: createChatConfig(),
      messages: [],
      unread: 0,
      lastMessageAt: "",
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    return state;
  });
  return groupId;
}

export function getConversation(type, id) {
  const state = readState();
  return type === "group" ? state.conversations.groups[id] || null : state.conversations.single[id] || null;
}

export function saveConversation(conversation) {
  return updateState((state) => {
    const bucket = conversation.type === "group" ? state.conversations.groups : state.conversations.single;
    bucket[conversation.type === "group" ? conversation.id : conversation.characterIds[0]] = {
      ...conversation,
      updatedAt: nowISO(),
    };
    return state;
  });
}

export function appendMessage(type, id, message) {
  return updateState((state) => {
    const bucket = type === "group" ? state.conversations.groups : state.conversations.single;
    const conversation = bucket[id];
    if (!conversation) return state;
    const nextMessage = createMessage(message);
    conversation.messages.push(nextMessage);
    conversation.lastMessageAt = nextMessage.createdAt;
    conversation.updatedAt = nowISO();
    if (type === "single") {
      const character = state.characters.find((item) => item.id === id);
      if (character) character.chatHistory = conversation.messages;
    }
    return state;
  });
}

export function updateConversationConfig(type, id, chatConfig) {
  return updateState((state) => {
    const bucket = type === "group" ? state.conversations.groups : state.conversations.single;
    if (bucket[id]) {
      bucket[id].chatConfig = { ...bucket[id].chatConfig, ...chatConfig };
      bucket[id].updatedAt = nowISO();
    }
    return state;
  });
}

export function setUnread(appId, count) {
  return updateState((state) => {
    state.unreadBadges[appId] = Math.max(0, Number(count) || 0);
    if (appId === "moments") state.moments.unread = state.unreadBadges.moments;
    return state;
  });
}

export function addUnread(appId, count = 1) {
  const current = readState().unreadBadges[appId] || 0;
  return setUnread(appId, current + count);
}

export function clearUnread(appId) {
  return setUnread(appId, 0);
}

export function saveDesktopLayout(desktop) {
  return setPath("desktop", desktop);
}

export function updateDesktopItem(type, id, patch) {
  return updateState((state) => {
    if (type === "widget") {
      state.desktop.widgets[id] = { ...state.desktop.widgets[id], ...patch };
    } else {
      state.desktop.apps[id] = { ...state.desktop.apps[id], ...patch };
    }
    return state;
  });
}

export function saveAppTheme(appId, theme) {
  return updateState((state) => {
    state.appThemes[appId] = {
      ...state.appThemes[appId],
      ...theme,
      appId,
    };
    return state;
  });
}

export function addWalletTransaction(transaction) {
  return updateState((state) => {
    const nextTransaction = createWalletTransaction(transaction);
    state.wallet.transactions.unshift(nextTransaction);
    state.wallet.balance += nextTransaction.type === "expense" ? -Math.abs(nextTransaction.amount) : Math.abs(nextTransaction.amount);
    state.wallet.balance = Math.max(0, Number(state.wallet.balance.toFixed(2)));
    return state;
  });
}

export function addInventoryItem(item) {
  return updateState((state) => {
    state.shop.inventory.unshift({
      id: createId("owned"),
      itemId: item.id,
      name: item.name,
      effectPrompt: item.effectPrompt,
      createdAt: nowISO(),
    });
    return state;
  });
}

export function addMomentNotification(notification) {
  return updateState((state) => {
    state.moments.notifications.unshift({
      id: createId("moment_notice"),
      type: "like",
      postId: "",
      characterId: "",
      text: "",
      createdAt: nowISO(),
      ...notification,
    });
    state.moments.unread += 1;
    state.unreadBadges.moments = state.moments.unread;
    return state;
  });
}

export function exportAllData() {
  return JSON.stringify(readState(), null, 2);
}

export function importAllData(jsonText) {
  const parsed = JSON.parse(jsonText);
  return writeState(migrateState(parsed));
}

export function exportCharacter(characterId) {
  const character = getCharacter(characterId);
  if (!character) throw new Error("角色不存在");
  return JSON.stringify(
    {
      version: "1.0",
      type: "ai-phone-character",
      character,
    },
    null,
    2,
  );
}

export function importCharacter(jsonText) {
  const parsed = JSON.parse(jsonText);
  const source = parsed.character || parsed.data || parsed;
  const character = normalizeImportedCharacter(source);
  saveCharacter(character);
  ensureSingleConversation(character.id);
  return character;
}

export function normalizeImportedCharacter(source) {
  const isSillyTavern = source.name && (
    "description" in source ||
    "personality" in source ||
    "scenario" in source ||
    "first_mes" in source
  );

  if (isSillyTavern) {
    return createCharacter({
      name: source.name || "导入角色",
      avatar: source.avatar || source.avatar_url || "",
      description: source.description || "",
      personality: source.personality || "",
      scenario: source.scenario || "",
      firstMessage: source.first_mes || source.firstMessage || "",
      systemPrompt: [
        source.description,
        source.personality,
        source.scenario,
        source.mes_example,
      ].filter(Boolean).join("\n\n"),
    });
  }

  return createCharacter({
    ...source,
    id: createId("char"),
    createdAt: nowISO(),
    updatedAt: nowISO(),
  });
}

export function downloadText(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function searchAllMessages(keyword) {
  const text = keyword.trim().toLowerCase();
  if (!text) return [];

  const state = readState();
  const results = [];
  const pushResult = (conversation, message, character) => {
    const content = message.content || message.rawContent || "";
    const index = content.toLowerCase().indexOf(text);
    if (index < 0) return;
    const start = Math.max(0, index - 18);
    const end = Math.min(content.length, index + text.length + 28);
    results.push({
      conversationId: conversation.id,
      conversationType: conversation.type,
      characterId: character?.id || "",
      characterName: character?.name || conversation.title,
      messageId: message.id,
      snippet: content.slice(start, end),
      createdAt: message.createdAt,
    });
  };

  Object.values(state.conversations.single).forEach((conversation) => {
    const character = state.characters.find((item) => item.id === conversation.characterIds[0]);
    conversation.messages.forEach((message) => pushResult(conversation, message, character));
  });

  Object.values(state.conversations.groups).forEach((conversation) => {
    conversation.messages.forEach((message) => {
      const character = state.characters.find((item) => item.id === message.characterId);
      pushResult(conversation, message, character);
    });
  });

  return results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/* 待后续文件对齐：theme.js 使用 theme.variables，api.js 使用 apiConfigs.selectedModel，chat.js 使用 conversations.*.chatConfig。 */
