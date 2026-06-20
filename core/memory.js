import {
  createId,
  getNowInfo,
  getSettings,
  upsertCharacter,
  upsertGroup,
  getCharacterById
} from "./storage.js";

import {
  silentRequest,
  silentJsonRequest,
  buildChatMessagesFromHistory,
  getResolvedCharacterApiConfig
} from "./api.js";

const DEFAULT_SUMMARY_PROMPT = "请将以下对话总结为简洁的要点，用于长期记忆，保留重要的人物关系、事件、用户偏好、承诺、约定、长期设定等信息。不要写废话，不要写分析过程。";

const ACTIVE_MEMORY_PROMPT = `以上对话中，是否有值得长期记住的重要信息？
例如：用户透露的重要事实、特殊偏好、重大事件、长期关系、承诺、禁忌、称呼习惯。
如果有，请只返回 JSON：
{"remember": "一句话记忆"}
如果没有，请只返回：
{"remember": null}`;

const GROUP_MEMORY_PROMPT = `请判断这段群聊中，是否有值得这个群聊长期记住的公共信息。
只记录群聊公共事件、共同约定、群成员都能知道的内容。
不要记录某个角色的内心想法。
不要把某个角色和用户的私密单独互动写成所有人都知道。
如果有，请只返回 JSON：
{"remember": "一句话群聊记忆"}
如果没有，请只返回：
{"remember": null}`;

const CHARACTER_IN_GROUP_MEMORY_PROMPT = `请判断这段群聊中，是否有值得指定角色长期记住的内容。
规则：
1. 只为指定角色记录记忆。
2. 只记录“用户与该角色直接相关”的信息。
3. 不要让该角色知道其他角色的私聊记忆。
4. 不要把其他角色才知道的事情写进该角色记忆。
5. 如果用户在群里公开告诉大家的信息，且和该角色以后互动有关，可以记录。
6. 如果该角色在群里答应用户、和用户产生约定、了解了用户偏好，可以记录。
如果有，请只返回 JSON：
{"remember": "一句话角色记忆"}
如果没有，请只返回：
{"remember": null}`;

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getMemoryContent(memory) {
  if (typeof memory === "string") {
    return memory.trim();
  }

  return String(memory?.content || memory?.text || "").trim();
}

function normalizeMemory(memory) {
  if (typeof memory === "string") {
    return {
      id: createId("memory"),
      content: memory.trim(),
      source: "manual",
      createdAt: getNowInfo().localText
    };
  }

  return {
    id: memory.id || createId("memory"),
    content: String(memory.content || memory.text || "").trim(),
    source: memory.source || "manual",
    createdAt: memory.createdAt || getNowInfo().localText
  };
}

function buildMemoryObject(content, source = "auto") {
  return {
    id: createId("memory"),
    content: String(content || "").trim(),
    source,
    createdAt: getNowInfo().localText
  };
}

function appendMemoryToTarget(target = {}, memory) {
  const normalizedMemory = normalizeMemory(memory);

  if (!normalizedMemory.content) {
    return target;
  }

  const memories = safeArray(target.memories);
  const exists = memories.some((item) => {
    return getMemoryContent(item) === normalizedMemory.content;
  });

  if (exists) {
    return target;
  }

  return {
    ...target,
    memories: [
      ...memories,
      normalizedMemory
    ],
    updatedAt: getNowInfo().timestamp
  };
}

function getMemoryTriggerCount(target = {}) {
  const settings = getSettings();
  const count = Number(target.memoryTriggerCount || settings.memoryTriggerCount || 100);

  if (!Number.isFinite(count) || count < 1) {
    return 100;
  }

  return Math.floor(count);
}

function getUnmemorizedMessages(target = {}) {
  const chatHistory = safeArray(target.chatHistory);
  const lastMemoryIndex = Number.isInteger(target.lastMemoryIndex) ? target.lastMemoryIndex : 0;

  return chatHistory.slice(lastMemoryIndex);
}

function formatMessagesForPrompt(messages = []) {
  return safeArray(messages)
    .map((message) => {
      const role = message.role === "assistant" ? "AI" : message.role === "system" ? "系统" : "用户";
      const name = message.characterName ? `（${message.characterName}）` : "";
      const content = String(message.content || "").trim();

      if (!content) return "";

      return `${role}${name}：${content}`;
    })
    .filter(Boolean)
    .join("\n");
}

function formatGroupMessagesForPrompt(messages = []) {
  return safeArray(messages)
    .map((message) => {
      const speakerName = message.role === "user"
        ? "用户"
        : message.characterName || "某个AI角色";

      const content = String(message.content || "").trim();

      if (!content) return "";

      return `${speakerName}：${content}`;
    })
    .filter(Boolean)
    .join("\n");
}

function getApiConfigForTarget(target = {}, fallbackCharacter = null) {
  if (target.apiConfig) {
    return getResolvedCharacterApiConfig(target);
  }

  if (fallbackCharacter) {
    return getResolvedCharacterApiConfig(fallbackCharacter);
  }

  return getResolvedCharacterApiConfig({});
}

function shouldUseMemory() {
  const settings = getSettings();
  return settings.autoMemoryEnabled !== false;
}

function shouldUseActiveMemory() {
  const settings = getSettings();
  return settings.activeMemoryEnabled !== false;
}

function isGroupTarget(target = {}) {
  return Array.isArray(target.memberIds) && Array.isArray(target.chatHistory);
}

function getLastAssistantMessage(chatHistory = []) {
  for (let index = chatHistory.length - 1; index >= 0; index -= 1) {
    const message = chatHistory[index];

    if (message && message.role === "assistant") {
      return message;
    }
  }

  return null;
}

export function buildMemoryInjection(memories = []) {
  const lines = safeArray(memories)
    .map(getMemoryContent)
    .filter(Boolean)
    .map((text) => `- ${text}`);

  if (lines.length === 0) {
    return "";
  }

  return `[以下是你关于用户的长期记忆]\n${lines.join("\n")}`;
}

export function addMemory(target = {}, content = "", options = {}) {
  const memory = buildMemoryObject(content, options.source || "manual");
  return appendMemoryToTarget(target, memory);
}

export function deleteMemory(target = {}, memoryId = "") {
  const memories = safeArray(target.memories).filter((memory) => {
    return memory.id !== memoryId;
  });

  return {
    ...target,
    memories,
    updatedAt: getNowInfo().timestamp
  };
}

export function updateMemory(target = {}, memoryId = "", content = "") {
  const memories = safeArray(target.memories).map((memory) => {
    if (memory.id !== memoryId) {
      return memory;
    }

    return {
      ...memory,
      content: String(content || "").trim(),
      updatedAt: getNowInfo().localText
    };
  });

  return {
    ...target,
    memories,
    updatedAt: getNowInfo().timestamp
  };
}

export async function summarizeMessagesToMemory({
  target,
  messages,
  character,
  prompt = DEFAULT_SUMMARY_PROMPT,
  apiConfig = null
} = {}) {
  const finalMessages = safeArray(messages);

  if (finalMessages.length === 0) {
    return null;
  }

  const text = formatMessagesForPrompt(finalMessages);

  if (!text) {
    return null;
  }

  const resolvedApiConfig = apiConfig || getApiConfigForTarget(target, character);

  const summary = await silentRequest({
    systemPrompt: "你负责把聊天记录压缩成长期记忆。只输出记忆内容，不要解释。",
    prompt: `${prompt}\n\n聊天记录：\n${text}`,
    endpoint: resolvedApiConfig.endpoint,
    apiKey: resolvedApiConfig.apiKey,
    model: resolvedApiConfig.model,
    temperature: 0.2
  });

  const cleanSummary = String(summary || "").trim();

  if (!cleanSummary) {
    return null;
  }

  return buildMemoryObject(cleanSummary, "summary");
}

export async function detectActiveMemory({
  target,
  recentMessages,
  character,
  apiConfig = null
} = {}) {
  const finalMessages = safeArray(recentMessages);

  if (finalMessages.length === 0) {
    return null;
  }

  const text = formatMessagesForPrompt(finalMessages);

  if (!text) {
    return null;
  }

  const resolvedApiConfig = apiConfig || getApiConfigForTarget(target, character);

  const result = await silentJsonRequest({
    systemPrompt: "你负责判断聊天中是否出现值得长期保存的记忆。只返回 JSON，不要解释。",
    prompt: `${text}\n\n${ACTIVE_MEMORY_PROMPT}`,
    endpoint: resolvedApiConfig.endpoint,
    apiKey: resolvedApiConfig.apiKey,
    model: resolvedApiConfig.model,
    temperature: 0.1,
    fallback: {
      remember: null
    }
  });

  const remember = String(result?.remember || "").trim();

  if (!remember || remember === "null") {
    return null;
  }

  return buildMemoryObject(remember, "active");
}

export async function autoSummarizeIfNeeded({
  target,
  character,
  apiConfig = null
} = {}) {
  if (!target || !shouldUseMemory()) {
    return {
      changed: false,
      target
    };
  }

  const triggerCount = getMemoryTriggerCount(target);
  const messages = getUnmemorizedMessages(target);

  if (messages.length < triggerCount) {
    return {
      changed: false,
      target
    };
  }

  const memory = await summarizeMessagesToMemory({
    target,
    character,
    messages,
    apiConfig
  });

  if (!memory) {
    return {
      changed: false,
      target
    };
  }

  const nextTarget = appendMemoryToTarget(target, memory);

  return {
    changed: true,
    memory,
    target: {
      ...nextTarget,
      lastMemoryIndex: safeArray(target.chatHistory).length,
      updatedAt: getNowInfo().timestamp
    }
  };
}

export async function activeRememberAfterReply({
  target,
  character,
  apiConfig = null,
  lookbackCount = 8
} = {}) {
  if (!target || !shouldUseMemory() || !shouldUseActiveMemory()) {
    return {
      changed: false,
      target
    };
  }

  const chatHistory = safeArray(target.chatHistory);
  const recentMessages = chatHistory.slice(Math.max(0, chatHistory.length - lookbackCount));

  if (recentMessages.length === 0) {
    return {
      changed: false,
      target
    };
  }

  const memory = await detectActiveMemory({
    target,
    character,
    recentMessages,
    apiConfig
  });

  if (!memory) {
    return {
      changed: false,
      target
    };
  }

  const nextTarget = appendMemoryToTarget(target, memory);

  return {
    changed: true,
    memory,
    target: nextTarget
  };
}

export async function processCharacterMemoryAfterReply(character = {}) {
  if (!character || !character.id) {
    return {
      changed: false,
      character
    };
  }

  const apiConfig = getResolvedCharacterApiConfig(character);

  let changed = false;
  let workingCharacter = character;
  const createdMemories = [];

  try {
    const activeResult = await activeRememberAfterReply({
      target: workingCharacter,
      character: workingCharacter,
      apiConfig
    });

    if (activeResult.changed) {
      changed = true;
      workingCharacter = activeResult.target;
      createdMemories.push(activeResult.memory);
    }
  } catch (error) {
    console.warn("主动记忆失败：", error);
  }

  try {
    const summaryResult = await autoSummarizeIfNeeded({
      target: workingCharacter,
      character: workingCharacter,
      apiConfig
    });

    if (summaryResult.changed) {
      changed = true;
      workingCharacter = summaryResult.target;
      createdMemories.push(summaryResult.memory);
    }
  } catch (error) {
    console.warn("自动总结记忆失败：", error);
  }

  if (changed) {
    upsertCharacter(workingCharacter);
  }

  return {
    changed,
    memories: createdMemories,
    character: workingCharacter
  };
}

export async function detectGroupPublicMemory({
  group,
  recentMessages,
  speakerCharacter = null,
  apiConfig = null
} = {}) {
  if (!group || !shouldUseMemory() || !shouldUseActiveMemory()) {
    return null;
  }

  const finalMessages = safeArray(recentMessages);

  if (finalMessages.length === 0) {
    return null;
  }

  const text = formatGroupMessagesForPrompt(finalMessages);

  if (!text) {
    return null;
  }

  const resolvedApiConfig = apiConfig || getApiConfigForTarget(group, speakerCharacter);

  const result = await silentJsonRequest({
    systemPrompt: "你负责判断群聊中是否出现值得群聊长期保存的公共记忆。只返回 JSON，不要解释。",
    prompt: `群聊名称：${group.name || "未命名群聊"}\n\n群聊记录：\n${text}\n\n${GROUP_MEMORY_PROMPT}`,
    endpoint: resolvedApiConfig.endpoint,
    apiKey: resolvedApiConfig.apiKey,
    model: resolvedApiConfig.model,
    temperature: 0.1,
    fallback: {
      remember: null
    }
  });

  const remember = String(result?.remember || "").trim();

  if (!remember || remember === "null") {
    return null;
  }

  return buildMemoryObject(remember, "group-active");
}

export async function detectCharacterMemoryFromGroup({
  group,
  character,
  recentMessages,
  apiConfig = null
} = {}) {
  if (!group || !character || !shouldUseMemory() || !shouldUseActiveMemory()) {
    return null;
  }

  const finalMessages = safeArray(recentMessages);

  if (finalMessages.length === 0) {
    return null;
  }

  const text = formatGroupMessagesForPrompt(finalMessages);

  if (!text) {
    return null;
  }

  const resolvedApiConfig = apiConfig || getResolvedCharacterApiConfig(character);

  const result = await silentJsonRequest({
    systemPrompt: "你负责为指定 AI 角色提取个人长期记忆。必须严格记忆隔离，只返回 JSON，不要解释。",
    prompt: [
      `群聊名称：${group.name || "未命名群聊"}`,
      `指定角色：${character.name || "未命名角色"}`,
      "",
      "群聊记录：",
      text,
      "",
      CHARACTER_IN_GROUP_MEMORY_PROMPT
    ].join("\n"),
    endpoint: resolvedApiConfig.endpoint,
    apiKey: resolvedApiConfig.apiKey,
    model: resolvedApiConfig.model,
    temperature: 0.1,
    fallback: {
      remember: null
    }
  });

  const remember = String(result?.remember || "").trim();

  if (!remember || remember === "null") {
    return null;
  }

  return buildMemoryObject(remember, "group-character");
}

export async function summarizeGroupIfNeeded({
  group,
  speakerCharacter = null,
  apiConfig = null
} = {}) {
  if (!group || !shouldUseMemory()) {
    return {
      changed: false,
      group
    };
  }

  const triggerCount = getMemoryTriggerCount(group);
  const messages = getUnmemorizedMessages(group);

  if (messages.length < triggerCount) {
    return {
      changed: false,
      group
    };
  }

  const text = formatGroupMessagesForPrompt(messages);

  if (!text) {
    return {
      changed: false,
      group
    };
  }

  const resolvedApiConfig = apiConfig || getApiConfigForTarget(group, speakerCharacter);

  const summary = await silentRequest({
    systemPrompt: "你负责把群聊记录压缩成群聊公共长期记忆。只输出公共记忆，不要解释。",
    prompt: [
      "请总结以下群聊公共内容，用于这个群聊的长期记忆。",
      "只记录群成员都能知道的公共事件、约定、共同计划。",
      "不要记录某个角色的私密个人记忆。",
      "不要把 A 与用户的私聊内容写成 B 也知道。",
      "",
      `群聊名称：${group.name || "未命名群聊"}`,
      "",
      "群聊记录：",
      text
    ].join("\n"),
    endpoint: resolvedApiConfig.endpoint,
    apiKey: resolvedApiConfig.apiKey,
    model: resolvedApiConfig.model,
    temperature: 0.2
  });

  const cleanSummary = String(summary || "").trim();

  if (!cleanSummary) {
    return {
      changed: false,
      group
    };
  }

  const memory = buildMemoryObject(cleanSummary, "group-summary");
  const nextGroup = appendMemoryToTarget(group, memory);

  return {
    changed: true,
    memory,
    group: {
      ...nextGroup,
      lastMemoryIndex: safeArray(group.chatHistory).length,
      updatedAt: getNowInfo().timestamp
    }
  };
}

export async function processGroupMemoryAfterReply(group = {}) {
  if (!group || !group.id) {
    return {
      changed: false,
      group
    };
  }

  const chatHistory = safeArray(group.chatHistory);
  const recentMessages = chatHistory.slice(Math.max(0, chatHistory.length - 10));
  const lastAssistantMessage = getLastAssistantMessage(chatHistory);
  const speakerCharacterId = lastAssistantMessage?.characterId || "";
  const speakerCharacter = speakerCharacterId ? getCharacterById(speakerCharacterId) : null;

  let changed = false;
  let groupChanged = false;
  let characterChanged = false;
  let workingGroup = group;
  let workingCharacter = speakerCharacter;
  const createdGroupMemories = [];
  const createdCharacterMemories = [];

  const groupApiConfig = getApiConfigForTarget(workingGroup, workingCharacter);

  try {
    const groupMemory = await detectGroupPublicMemory({
      group: workingGroup,
      recentMessages,
      speakerCharacter: workingCharacter,
      apiConfig: groupApiConfig
    });

    if (groupMemory) {
      const nextGroup = appendMemoryToTarget(workingGroup, groupMemory);

      if (nextGroup !== workingGroup) {
        changed = true;
        groupChanged = true;
        workingGroup = nextGroup;
        createdGroupMemories.push(groupMemory);
      }
    }
  } catch (error) {
    console.warn("群聊主动记忆失败：", error);
  }

  try {
    const summaryResult = await summarizeGroupIfNeeded({
      group: workingGroup,
      speakerCharacter: workingCharacter,
      apiConfig: groupApiConfig
    });

    if (summaryResult.changed) {
      changed = true;
      groupChanged = true;
      workingGroup = summaryResult.group;
      createdGroupMemories.push(summaryResult.memory);
    }
  } catch (error) {
    console.warn("群聊自动总结失败：", error);
  }

  if (workingCharacter) {
    try {
      const characterMemory = await detectCharacterMemoryFromGroup({
        group: workingGroup,
        character: workingCharacter,
        recentMessages,
        apiConfig: getResolvedCharacterApiConfig(workingCharacter)
      });

      if (characterMemory) {
        const nextCharacter = appendMemoryToTarget(workingCharacter, characterMemory);

        if (nextCharacter !== workingCharacter) {
          changed = true;
          characterChanged = true;
          workingCharacter = nextCharacter;
          createdCharacterMemories.push(characterMemory);
        }
      }
    } catch (error) {
      console.warn("群聊角色个人记忆失败：", error);
    }
  }

  if (groupChanged) {
    upsertGroup(workingGroup);
  }

  if (characterChanged && workingCharacter) {
    upsertCharacter(workingCharacter);
  }

  return {
    changed,
    groupChanged,
    characterChanged,
    groupMemories: createdGroupMemories,
    characterMemories: createdCharacterMemories,
    group: workingGroup,
    character: workingCharacter
  };
}

export async function processGenericMemoryAfterReply({
  target,
  character = null,
  saveTarget = null,
  apiConfig = null
} = {}) {
  if (!target) {
    return {
      changed: false,
      target
    };
  }

  if (isGroupTarget(target)) {
    const groupResult = await processGroupMemoryAfterReply(target);

    if (groupResult.changed && typeof saveTarget === "function") {
      saveTarget(groupResult.group);
    }

    return {
      changed: groupResult.changed,
      memories: [
        ...(groupResult.groupMemories || []),
        ...(groupResult.characterMemories || [])
      ],
      target: groupResult.group,
      group: groupResult.group,
      character: groupResult.character
    };
  }

  let changed = false;
  let workingTarget = target;
  const createdMemories = [];

  try {
    const activeResult = await activeRememberAfterReply({
      target: workingTarget,
      character,
      apiConfig
    });

    if (activeResult.changed) {
      changed = true;
      workingTarget = activeResult.target;
      createdMemories.push(activeResult.memory);
    }
  } catch (error) {
    console.warn("主动记忆失败：", error);
  }

  try {
    const summaryResult = await autoSummarizeIfNeeded({
      target: workingTarget,
      character,
      apiConfig
    });

    if (summaryResult.changed) {
      changed = true;
      workingTarget = summaryResult.target;
      createdMemories.push(summaryResult.memory);
    }
  } catch (error) {
    console.warn("自动总结记忆失败：", error);
  }

  if (changed && typeof saveTarget === "function") {
    saveTarget(workingTarget);
  }

  return {
    changed,
    memories: createdMemories,
    target: workingTarget
  };
}

export async function rememberCharacterInteraction({
  character,
  messages = [],
  source = "app",
  sourceName = "其他应用",
  apiConfig = null
} = {}) {
  if (!character || !character.id || !shouldUseMemory()) {
    return {
      changed: false,
      character
    };
  }

  const text = formatMessagesForPrompt(messages);

  if (!text) {
    return {
      changed: false,
      character
    };
  }

  const resolvedApiConfig = apiConfig || getResolvedCharacterApiConfig(character);

  const result = await silentJsonRequest({
    systemPrompt: "你负责为指定 AI 角色提取和用户互动后的个人长期记忆。必须严格记忆隔离，只返回 JSON。",
    prompt: [
      `互动来源：${sourceName}`,
      `指定角色：${character.name || "未命名角色"}`,
      "",
      "互动记录：",
      text,
      "",
      "请判断这段互动中，是否有值得该角色以后记住的用户信息、约定、偏好、关系进展或重要事件。",
      "只写入这个角色自己的记忆，不要写入其他角色。",
      "如果有，请只返回 JSON：",
      "{\"remember\": \"一句话角色记忆\"}",
      "如果没有，请只返回：",
      "{\"remember\": null}"
    ].join("\n"),
    endpoint: resolvedApiConfig.endpoint,
    apiKey: resolvedApiConfig.apiKey,
    model: resolvedApiConfig.model,
    temperature: 0.1,
    fallback: {
      remember: null
    }
  });

  const remember = String(result?.remember || "").trim();

  if (!remember || remember === "null") {
    return {
      changed: false,
      character
    };
  }

  const memory = buildMemoryObject(remember, source);
  const nextCharacter = appendMemoryToTarget(character, memory);

  if (nextCharacter !== character) {
    upsertCharacter(nextCharacter);

    return {
      changed: true,
      memory,
      character: nextCharacter
    };
  }

  return {
    changed: false,
    character
  };
}

export function buildGroupMemoryInjection(group = {}, members = []) {
  const groupMemories = safeArray(group.memories);
  const groupLines = groupMemories
    .map(getMemoryContent)
    .filter(Boolean)
    .map((text) => `- ${text}`);

  const memberLines = safeArray(members)
    .map((member) => {
      const memories = safeArray(member.memories)
        .map(getMemoryContent)
        .filter(Boolean);

      if (memories.length === 0) {
        return "";
      }

      return `【${member.name || "未命名角色"}自己的长期记忆】\n${memories.map((text) => `- ${text}`).join("\n")}`;
    })
    .filter(Boolean);

  const parts = [];

  if (groupLines.length > 0) {
    parts.push(`[以下是这个群聊的公共长期记忆]\n${groupLines.join("\n")}`);
  }

  if (memberLines.length > 0) {
    parts.push(memberLines.join("\n\n"));
  }

  return parts.join("\n\n");
}

export function buildMemoryAwareMessages(chatHistory = []) {
  return buildChatMessagesFromHistory(chatHistory);
}

export function shouldTriggerMemory(target = {}) {
  const triggerCount = getMemoryTriggerCount(target);
  const messages = getUnmemorizedMessages(target);

  return messages.length >= triggerCount;
}
