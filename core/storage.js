const STORAGE_PREFIX = "ai_phone_";

export const STORAGE_KEYS = {
  theme: `${STORAGE_PREFIX}theme`,
  customTheme: `${STORAGE_PREFIX}custom_theme`,
  wallpaper: `${STORAGE_PREFIX}wallpaper`,
  userAvatar: `${STORAGE_PREFIX}user_avatar`,
  appIcons: `${STORAGE_PREFIX}app_icons`,
  appPages: `${STORAGE_PREFIX}app_pages`,
  characters: `${STORAGE_PREFIX}characters`,
  activeCharacterId: `${STORAGE_PREFIX}active_character_id`,
  groups: `${STORAGE_PREFIX}groups`,
  activeGroupId: `${STORAGE_PREFIX}active_group_id`,
  settings: `${STORAGE_PREFIX}settings`,
  moments: `${STORAGE_PREFIX}moments`,
  mcpServers: `${STORAGE_PREFIX}mcp_servers`,
  apiEndpoints: `${STORAGE_PREFIX}api_endpoints`,
  callBackgrounds: `${STORAGE_PREFIX}call_backgrounds`
};

function buildKey(key) {
  if (!key || typeof key !== "string") {
    throw new Error("存储 key 必须是字符串");
  }

  if (key.startsWith(STORAGE_PREFIX)) {
    return key;
  }

  return `${STORAGE_PREFIX}${key}`;
}

function safeJsonParse(value, fallback) {
  try {
    if (value === null || value === undefined || value === "") {
      return fallback;
    }

    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    throw new Error("数据无法保存，请检查是否包含循环引用");
  }
}

function normalizeNumber(value, fallback, min = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return Math.max(min, Math.floor(number));
}

function normalizeString(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

export function getRaw(key, fallback = "") {
  const fullKey = buildKey(key);
  const value = localStorage.getItem(fullKey);

  if (value === null || value === undefined) {
    return fallback;
  }

  return value;
}

export function setRaw(key, value) {
  const fullKey = buildKey(key);

  try {
    localStorage.setItem(fullKey, String(value));
    return true;
  } catch (error) {
    console.error("保存失败：", error);
    return false;
  }
}

export function getJson(key, fallback = null) {
  const fullKey = buildKey(key);
  const value = localStorage.getItem(fullKey);

  return safeJsonParse(value, fallback);
}

export function setJson(key, value) {
  const fullKey = buildKey(key);

  try {
    localStorage.setItem(fullKey, safeJsonStringify(value));
    return true;
  } catch (error) {
    console.error("保存失败：", error);
    return false;
  }
}

export function remove(key) {
  const fullKey = buildKey(key);
  localStorage.removeItem(fullKey);
}

export function has(key) {
  const fullKey = buildKey(key);
  return localStorage.getItem(fullKey) !== null;
}

export function clearAllAppData() {
  const keysToRemove = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);

    if (key && key.startsWith(STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => {
    localStorage.removeItem(key);
  });

  return keysToRemove.length;
}

export function getAllAppData() {
  const data = {};

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);

    if (!key || !key.startsWith(STORAGE_PREFIX)) {
      continue;
    }

    const value = localStorage.getItem(key);
    data[key] = safeJsonParse(value, value);
  }

  return data;
}

export function importAllAppData(data = {}, options = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("导入的数据格式不正确");
  }

  if (options.clearBeforeImport === true) {
    clearAllAppData();
  }

  Object.entries(data).forEach(([key, value]) => {
    if (!key.startsWith(STORAGE_PREFIX)) {
      return;
    }

    if (typeof value === "string") {
      localStorage.setItem(key, value);
    } else {
      localStorage.setItem(key, safeJsonStringify(value));
    }
  });

  return true;
}

export function downloadJsonFile(filename, data) {
  const safeFilename = filename || `ai-phone-backup-${Date.now()}.json`;
  const jsonText = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonText], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = safeFilename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("没有选择文件"));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        resolve(data);
      } catch {
        reject(new Error("JSON 文件格式不正确"));
      }
    };

    reader.onerror = () => {
      reject(new Error("文件读取失败"));
    };

    reader.readAsText(file, "utf-8");
  });
}

export function readFileAsBase64(file, options = {}) {
  const maxSizeMB = options.maxSizeMB || 8;

  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error("没有选择文件"));
      return;
    }

    if (options.imageOnly !== false && !file.type.startsWith("image/")) {
      reject(new Error("请选择图片文件"));
      return;
    }

    const maxBytes = maxSizeMB * 1024 * 1024;

    if (file.size > maxBytes) {
      reject(new Error(`文件不能超过 ${maxSizeMB}MB`));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error("文件读取失败"));
    };

    reader.readAsDataURL(file);
  });
}

export function createId(prefix = "id") {
  const randomText = Math.random().toString(36).slice(2, 10);
  const timeText = Date.now().toString(36);

  return `${prefix}_${timeText}_${randomText}`;
}

export function getNowInfo() {
  const now = new Date();
  const weekNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  const second = String(now.getSeconds()).padStart(2, "0");

  return {
    timestamp: now.toISOString(),
    localDate: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    localTime: `${hour}:${minute}:${second}`,
    localText: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 ${weekNames[now.getDay()]} ${hour}:${minute}`,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: now.getHours(),
    minute: now.getMinutes(),
    second: now.getSeconds(),
    week: weekNames[now.getDay()]
  };
}

export function getDefaultTtsConfig() {
  return {
    provider: "browser",
    voice: "default",
    voiceId: "default",
    model: "tts-1",
    apiKey: "",
    endpoint: "",
    enabled: false,
    autoSpeak: false,
    autoVoiceDecision: false,
    allowCallIntent: false
  };
}

export function normalizeTtsConfig(config = {}) {
  const defaults = getDefaultTtsConfig();

  return {
    provider: normalizeString(config.provider, defaults.provider),
    voice: normalizeString(config.voice, config.voiceId || defaults.voice),
    voiceId: normalizeString(config.voiceId, config.voice || defaults.voiceId),
    model: normalizeString(config.model, defaults.model),
    apiKey: normalizeString(config.apiKey, ""),
    endpoint: normalizeString(config.endpoint, ""),
    enabled: Boolean(config.enabled),
    autoSpeak: Boolean(config.autoSpeak),
    autoVoiceDecision: Boolean(config.autoVoiceDecision),
    allowCallIntent: Boolean(config.allowCallIntent)
  };
}

export function getDefaultApiConfig() {
  return {
    endpoint: "",
    model: "",
    apiKey: ""
  };
}

export function normalizeApiConfig(config = {}) {
  const defaults = getDefaultApiConfig();

  return {
    endpoint: normalizeString(config.endpoint, defaults.endpoint),
    model: normalizeString(config.model, defaults.model),
    apiKey: normalizeString(config.apiKey, defaults.apiKey)
  };
}

export function createDefaultCharacter(overrides = {}) {
  const now = getNowInfo();

  return {
    id: overrides.id || createId("char"),
    name: normalizeString(overrides.name, "新角色"),
    avatar: normalizeString(overrides.avatar, ""),
    chatBackground: normalizeString(overrides.chatBackground, ""),
    systemPrompt: normalizeString(overrides.systemPrompt, ""),
    ttsConfig: normalizeTtsConfig(overrides.ttsConfig || {}),
    apiConfig: normalizeApiConfig(overrides.apiConfig || {}),
    memoryTriggerCount: normalizeNumber(overrides.memoryTriggerCount, 100, 1),
    memories: normalizeArray(overrides.memories),
    chatHistory: normalizeArray(overrides.chatHistory),
    lastMemoryIndex: normalizeNumber(overrides.lastMemoryIndex, 0, 0),
    createdAt: overrides.createdAt || now.timestamp,
    updatedAt: now.timestamp
  };
}

export function normalizeCharacter(character = {}) {
  return createDefaultCharacter(character);
}

export function getDefaultSettings() {
  return {
    defaultApiEndpointId: "",
    defaultModel: "",
    globalTts: getDefaultTtsConfig(),
    memoryTriggerCount: 100,
    autoMemoryEnabled: true,
    activeMemoryEnabled: true,
    autoMomentEnabled: true,
    aiTimeAwarenessEnabled: true,
    groupChat: {
      defaultReplyMode: "one",
      maxAutoReplies: 3
    }
  };
}

export function getSettings() {
  const savedSettings = getJson(STORAGE_KEYS.settings, {});
  const defaults = getDefaultSettings();

  return {
    ...defaults,
    ...savedSettings,
    globalTts: normalizeTtsConfig({
      ...defaults.globalTts,
      ...(savedSettings.globalTts || {})
    }),
    groupChat: {
      ...defaults.groupChat,
      ...(savedSettings.groupChat || {}),
      defaultReplyMode: normalizeString(savedSettings.groupChat?.defaultReplyMode, defaults.groupChat.defaultReplyMode),
      maxAutoReplies: normalizeNumber(savedSettings.groupChat?.maxAutoReplies, defaults.groupChat.maxAutoReplies, 1)
    },
    memoryTriggerCount: normalizeNumber(savedSettings.memoryTriggerCount, defaults.memoryTriggerCount, 1),
    autoMemoryEnabled: savedSettings.autoMemoryEnabled !== false,
    activeMemoryEnabled: savedSettings.activeMemoryEnabled !== false,
    autoMomentEnabled: savedSettings.autoMomentEnabled !== false,
    aiTimeAwarenessEnabled: savedSettings.aiTimeAwarenessEnabled !== false
  };
}

export function saveSettings(settings = {}) {
  const currentSettings = getSettings();

  const nextSettings = {
    ...currentSettings,
    ...settings,
    globalTts: normalizeTtsConfig({
      ...currentSettings.globalTts,
      ...(settings.globalTts || {})
    }),
    groupChat: {
      ...currentSettings.groupChat,
      ...(settings.groupChat || {}),
      maxAutoReplies: normalizeNumber(
        settings.groupChat?.maxAutoReplies ?? currentSettings.groupChat.maxAutoReplies,
        currentSettings.groupChat.maxAutoReplies,
        1
      )
    }
  };

  return setJson(STORAGE_KEYS.settings, nextSettings);
}

export function getCharacters() {
  const characters = getJson(STORAGE_KEYS.characters, []);

  if (!Array.isArray(characters)) {
    return [];
  }

  return characters.map(normalizeCharacter);
}

export function saveCharacters(characters = []) {
  if (!Array.isArray(characters)) {
    throw new Error("角色数据必须是数组");
  }

  return setJson(STORAGE_KEYS.characters, characters.map(normalizeCharacter));
}

export function getCharacterById(characterId) {
  const characters = getCharacters();
  return characters.find((character) => character.id === characterId) || null;
}

export function upsertCharacter(character) {
  if (!character || typeof character !== "object") {
    throw new Error("角色数据不正确");
  }

  if (!character.id) {
    throw new Error("角色缺少 id");
  }

  const characters = getCharacters();
  const normalizedCharacter = normalizeCharacter(character);
  const index = characters.findIndex((item) => item.id === normalizedCharacter.id);

  if (index >= 0) {
    characters[index] = {
      ...characters[index],
      ...normalizedCharacter,
      updatedAt: getNowInfo().timestamp
    };
  } else {
    characters.push(normalizedCharacter);
  }

  saveCharacters(characters);
  return normalizedCharacter;
}

export function deleteCharacter(characterId) {
  const characters = getCharacters();
  const nextCharacters = characters.filter((character) => character.id !== characterId);

  saveCharacters(nextCharacters);

  const activeCharacterId = getRaw(STORAGE_KEYS.activeCharacterId, "");

  if (activeCharacterId === characterId) {
    remove(STORAGE_KEYS.activeCharacterId);
  }

  const groups = getGroups();
  const nextGroups = groups.map((group) => {
    const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];

    return {
      ...group,
      memberIds: memberIds.filter((id) => id !== characterId),
      updatedAt: getNowInfo().timestamp
    };
  });

  saveGroups(nextGroups);

  const callBackgrounds = getCallBackgrounds();

  if (callBackgrounds[characterId]) {
    delete callBackgrounds[characterId];
    saveCallBackgrounds(callBackgrounds);
  }

  return true;
}

export function getActiveCharacterId() {
  return getRaw(STORAGE_KEYS.activeCharacterId, "");
}

export function setActiveCharacterId(characterId) {
  return setRaw(STORAGE_KEYS.activeCharacterId, characterId || "");
}

export function createDefaultGroup(name = "新群聊", memberIds = []) {
  const now = getNowInfo();

  return {
    id: createId("group"),
    name,
    avatar: "",
    memberIds: Array.isArray(memberIds) ? memberIds : [],
    memories: [],
    chatHistory: [],
    lastMemoryIndex: 0,
    memoryTriggerCount: 100,
    replyMode: "one",
    createdAt: now.timestamp,
    updatedAt: now.timestamp
  };
}

export function normalizeGroup(group = {}) {
  const now = getNowInfo();

  return {
    id: group.id || createId("group"),
    name: normalizeString(group.name, "未命名群聊"),
    avatar: normalizeString(group.avatar, ""),
    memberIds: normalizeArray(group.memberIds),
    memories: normalizeArray(group.memories),
    chatHistory: normalizeArray(group.chatHistory),
    lastMemoryIndex: normalizeNumber(group.lastMemoryIndex, 0, 0),
    memoryTriggerCount: normalizeNumber(group.memoryTriggerCount, 100, 1),
    replyMode: normalizeString(group.replyMode, "one"),
    createdAt: group.createdAt || now.timestamp,
    updatedAt: group.updatedAt || now.timestamp
  };
}

export function getGroups() {
  const groups = getJson(STORAGE_KEYS.groups, []);

  if (!Array.isArray(groups)) {
    return [];
  }

  return groups.map(normalizeGroup);
}

export function saveGroups(groups = []) {
  if (!Array.isArray(groups)) {
    throw new Error("群聊数据必须是数组");
  }

  return setJson(STORAGE_KEYS.groups, groups.map(normalizeGroup));
}

export function getGroupById(groupId) {
  const groups = getGroups();
  return groups.find((group) => group.id === groupId) || null;
}

export function upsertGroup(group) {
  if (!group || typeof group !== "object") {
    throw new Error("群聊数据不正确");
  }

  if (!group.id) {
    throw new Error("群聊缺少 id");
  }

  const groups = getGroups();
  const normalizedGroup = {
    ...normalizeGroup(group),
    updatedAt: getNowInfo().timestamp
  };
  const index = groups.findIndex((item) => item.id === normalizedGroup.id);

  if (index >= 0) {
    groups[index] = {
      ...groups[index],
      ...normalizedGroup
    };
  } else {
    groups.push(normalizedGroup);
  }

  saveGroups(groups);
  return normalizedGroup;
}

export function deleteGroup(groupId) {
  const groups = getGroups();
  const nextGroups = groups.filter((group) => group.id !== groupId);

  saveGroups(nextGroups);

  const activeGroupId = getRaw(STORAGE_KEYS.activeGroupId, "");

  if (activeGroupId === groupId) {
    remove(STORAGE_KEYS.activeGroupId);
  }

  return true;
}

export function getActiveGroupId() {
  return getRaw(STORAGE_KEYS.activeGroupId, "");
}

export function setActiveGroupId(groupId) {
  return setRaw(STORAGE_KEYS.activeGroupId, groupId || "");
}

export function addGroupMessage(groupId, message) {
  const group = getGroupById(groupId);

  if (!group) {
    throw new Error("群聊不存在");
  }

  const nextMessage = {
    id: message.id || createId("group_msg"),
    role: message.role || "user",
    characterId: message.characterId || "",
    characterName: message.characterName || "",
    content: message.content || "",
    thinking: message.thinking || "",
    image: message.image || "",
    hidden: Boolean(message.hidden),
    createdAt: message.createdAt || getNowInfo().timestamp
  };

  const nextGroup = {
    ...group,
    chatHistory: [
      ...normalizeArray(group.chatHistory),
      nextMessage
    ],
    updatedAt: getNowInfo().timestamp
  };

  upsertGroup(nextGroup);

  return nextMessage;
}

export function updateGroupMessage(groupId, messageId, patch = {}) {
  const group = getGroupById(groupId);

  if (!group) {
    throw new Error("群聊不存在");
  }

  const chatHistory = normalizeArray(group.chatHistory);

  const nextHistory = chatHistory.map((message) => {
    if (message.id !== messageId) {
      return message;
    }

    return {
      ...message,
      ...patch,
      updatedAt: getNowInfo().timestamp
    };
  });

  const nextGroup = {
    ...group,
    chatHistory: nextHistory,
    updatedAt: getNowInfo().timestamp
  };

  upsertGroup(nextGroup);

  return nextGroup;
}

export function deleteGroupMessage(groupId, messageId) {
  const group = getGroupById(groupId);

  if (!group) {
    throw new Error("群聊不存在");
  }

  const chatHistory = normalizeArray(group.chatHistory);

  const nextGroup = {
    ...group,
    chatHistory: chatHistory.filter((message) => message.id !== messageId),
    updatedAt: getNowInfo().timestamp
  };

  upsertGroup(nextGroup);

  return nextGroup;
}

export function addMemberToGroup(groupId, characterId) {
  const group = getGroupById(groupId);

  if (!group) {
    throw new Error("群聊不存在");
  }

  const memberIds = normalizeArray(group.memberIds);

  if (memberIds.includes(characterId)) {
    return group;
  }

  const nextGroup = {
    ...group,
    memberIds: [
      ...memberIds,
      characterId
    ],
    updatedAt: getNowInfo().timestamp
  };

  upsertGroup(nextGroup);
  return nextGroup;
}

export function removeMemberFromGroup(groupId, characterId) {
  const group = getGroupById(groupId);

  if (!group) {
    throw new Error("群聊不存在");
  }

  const memberIds = normalizeArray(group.memberIds);

  const nextGroup = {
    ...group,
    memberIds: memberIds.filter((id) => id !== characterId),
    updatedAt: getNowInfo().timestamp
  };

  upsertGroup(nextGroup);
  return nextGroup;
}

export function getGroupMembers(group = {}) {
  const characters = getCharacters();
  const memberIds = normalizeArray(group.memberIds);

  return memberIds
    .map((id) => characters.find((character) => character.id === id))
    .filter(Boolean);
}

export function getMoments() {
  const moments = getJson(STORAGE_KEYS.moments, []);

  if (!Array.isArray(moments)) {
    return [];
  }

  return moments;
}

export function saveMoments(moments = []) {
  if (!Array.isArray(moments)) {
    throw new Error("朋友圈数据必须是数组");
  }

  return setJson(STORAGE_KEYS.moments, moments);
}

export function addMoment(moment) {
  if (!moment || typeof moment !== "object") {
    throw new Error("朋友圈数据不正确");
  }

  const moments = getMoments();

  moments.unshift({
    id: moment.id || createId("moment"),
    authorId: moment.authorId || "user",
    authorName: moment.authorName || "用户",
    authorAvatar: moment.authorAvatar || "",
    content: moment.content || "",
    images: Array.isArray(moment.images) ? moment.images : [],
    likes: Array.isArray(moment.likes) ? moment.likes : [],
    comments: Array.isArray(moment.comments) ? moment.comments : [],
    mood: moment.mood || "",
    createdAt: moment.createdAt || getNowInfo().timestamp
  });

  saveMoments(moments);
  return moments[0];
}

export function getApiEndpoints() {
  const endpoints = getJson(STORAGE_KEYS.apiEndpoints, []);

  if (!Array.isArray(endpoints)) {
    return [];
  }

  return endpoints;
}

export function saveApiEndpoints(endpoints = []) {
  if (!Array.isArray(endpoints)) {
    throw new Error("API 端点数据必须是数组");
  }

  return setJson(STORAGE_KEYS.apiEndpoints, endpoints);
}

export function getMcpServers() {
  const servers = getJson(STORAGE_KEYS.mcpServers, []);

  if (!Array.isArray(servers)) {
    return [];
  }

  return servers;
}

export function saveMcpServers(servers = []) {
  if (!Array.isArray(servers)) {
    throw new Error("MCP 服务数据必须是数组");
  }

  return setJson(STORAGE_KEYS.mcpServers, servers);
}

export function getCallBackgrounds() {
  return getJson(STORAGE_KEYS.callBackgrounds, {});
}

export function saveCallBackgrounds(backgrounds = {}) {
  if (!backgrounds || typeof backgrounds !== "object" || Array.isArray(backgrounds)) {
    throw new Error("电话背景数据必须是对象");
  }

  return setJson(STORAGE_KEYS.callBackgrounds, backgrounds);
}

export function getCallBackground(characterId) {
  const backgrounds = getCallBackgrounds();
  return backgrounds[characterId] || "";
}

export function setCallBackground(characterId, base64) {
  if (!characterId) {
    throw new Error("缺少角色 id");
  }

  const backgrounds = getCallBackgrounds();
  backgrounds[characterId] = base64 || "";
  saveCallBackgrounds(backgrounds);
  return true;
}

export function clearCallBackground(characterId) {
  const backgrounds = getCallBackgrounds();

  if (backgrounds[characterId]) {
    delete backgrounds[characterId];
  }

  saveCallBackgrounds(backgrounds);
  return true;
}

export function getStorageUsage() {
  let total = 0;
  const details = [];

  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);

    if (!key || !key.startsWith(STORAGE_PREFIX)) {
      continue;
    }

    const value = localStorage.getItem(key) || "";
    const size = key.length + value.length;

    total += size;

    details.push({
      key,
      size
    });
  }

  details.sort((a, b) => b.size - a.size);

  return {
    total,
    totalText: `${(total / 1024).toFixed(2)} KB`,
    details
  };
}
