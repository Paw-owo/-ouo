import {
  readState,
  updateState,
  getCharacter,
  saveCharacter,
  createId,
  nowISO,
} from "./storage.js";
import {
  chatCompletion,
  buildChatMessages,
  estimateTokenCount,
} from "./api.js";

export const MEMORY_DEFAULT_TRIGGER_COUNT = 100;
export const MEMORY_IMPORTANCE_PROMPT = [
  "请判断下面这轮对话是否包含值得长期记住的信息。",
  "只在涉及用户偏好、重要关系、长期计划、稳定设定、角色关系变化时记忆。",
  "如果不需要记忆，返回空数组。",
  "如果需要，返回 JSON 数组，每项格式为：",
  "{\"content\":\"记忆内容\",\"tags\":[\"标签\"],\"importance\":1到5}",
].join("\n");

export const MEMORY_SUMMARY_PROMPT = [
  "请把下面的聊天记录整理成长期记忆。",
  "要求短、准确、可用于未来对话注入。",
  "不要写临时寒暄，不要重复已有信息。",
  "返回 JSON 数组，每项格式为：",
  "{\"content\":\"记忆内容\",\"tags\":[\"标签\"],\"importance\":1到5}",
].join("\n");

export function createMemoryItem(overrides = {}) {
  return {
    id: createId("memory"),
    content: "",
    tags: [],
    importance: 3,
    source: "manual",
    createdAt: nowISO(),
    updatedAt: nowISO(),
    ...overrides,
  };
}

export function getCharacterMemories(characterId) {
  return getCharacter(characterId)?.memories || [];
}

export function addCharacterMemory(characterId, contentOrMemory, source = "manual") {
  const character = getCharacter(characterId);
  if (!character) throw new Error("角色不存在");

  const memory = typeof contentOrMemory === "string"
    ? createMemoryItem({ content: contentOrMemory.trim(), source })
    : createMemoryItem({ ...contentOrMemory, source: contentOrMemory.source || source });

  if (!memory.content) return character.memories || [];

  const memories = dedupeMemories([...(character.memories || []), memory]);
  saveCharacter({
    ...character,
    memories,
    updatedAt: nowISO(),
  });

  return memories;
}

export function updateCharacterMemory(characterId, memoryId, patch) {
  const character = getCharacter(characterId);
  if (!character) throw new Error("角色不存在");

  const memories = (character.memories || []).map((memory) => {
    if (memory.id !== memoryId) return memory;
    return {
      ...memory,
      ...patch,
      updatedAt: nowISO(),
    };
  });

  saveCharacter({
    ...character,
    memories,
    updatedAt: nowISO(),
  });

  return memories;
}

export function deleteCharacterMemory(characterId, memoryId) {
  const character = getCharacter(characterId);
  if (!character) throw new Error("角色不存在");

  const memories = (character.memories || []).filter((memory) => memory.id !== memoryId);

  saveCharacter({
    ...character,
    memories,
    updatedAt: nowISO(),
  });

  return memories;
}

export function clearCharacterMemories(characterId) {
  const character = getCharacter(characterId);
  if (!character) throw new Error("角色不存在");

  saveCharacter({
    ...character,
    memories: [],
    updatedAt: nowISO(),
  });

  return [];
}

export function getRelevantMemories(characterId, text = "", limit = 12) {
  const memories = getCharacterMemories(characterId);
  if (!text.trim()) {
    return memories
      .slice()
      .sort(sortMemoryByImportance)
      .slice(0, limit);
  }

  const keywords = tokenizeText(text);
  return memories
    .map((memory) => ({
      memory,
      score: scoreMemory(memory, keywords),
    }))
    .sort((a, b) => b.score - a.score || sortMemoryByImportance(a.memory, b.memory))
    .filter((item) => item.score > 0)
    .slice(0, limit)
    .map((item) => item.memory);
}

export function buildMemoryPrompt(characterId, currentText = "", limit = 12) {
  const memories = getRelevantMemories(characterId, currentText, limit);
  if (!memories.length) return "";

  return [
    "以下是需要长期遵守的记忆：",
    ...memories.map((memory) => `- ${memory.content}`),
  ].join("\n");
}

export function injectMemoriesToMessages(messages, characterId, currentText = "") {
  const memoryPrompt = buildMemoryPrompt(characterId, currentText);
  if (!memoryPrompt) return messages;

  const nextMessages = messages.map((message) => ({ ...message }));
  const systemIndex = nextMessages.findIndex((message) => message.role === "system");

  if (systemIndex >= 0) {
    nextMessages[systemIndex].content = `${nextMessages[systemIndex].content}\n\n${memoryPrompt}`.trim();
  } else {
    nextMessages.unshift({
      role: "system",
      content: memoryPrompt,
    });
  }

  return nextMessages;
}

export async function rememberFromConversation({
  characterId,
  latestMessages = [],
  apiConfigId = "",
  apiModel = "",
} = {}) {
  const character = getCharacter(characterId);
  if (!character || !latestMessages.length) return [];

  const apiReady = Boolean(apiConfigId || character.apiConfigId);
  if (!apiReady) return [];

  const content = latestMessages
    .map((message) => `${message.role === "user" ? "用户" : character.name}：${message.content || message.rawContent || ""}`)
    .join("\n");

  const messages = [
    { role: "system", content: MEMORY_IMPORTANCE_PROMPT },
    { role: "user", content },
  ];

  try {
    const response = await chatCompletion({
      apiConfigId: apiConfigId || character.apiConfigId,
      model: apiModel || character.apiModel,
      messages,
      temperature: 0.2,
    });

    const parsed = parseMemoryJson(response.content);
    const memories = parsed.map((item) => createMemoryItem({
      content: item.content,
      tags: Array.isArray(item.tags) ? item.tags : [],
      importance: normalizeImportance(item.importance),
      source: "auto",
    }));

    memories.forEach((memory) => addCharacterMemory(characterId, memory, "auto"));
    return memories;
  } catch {
    return [];
  }
}

export async function summarizeCharacterIfNeeded({
  characterId,
  apiConfigId = "",
  apiModel = "",
  force = false,
} = {}) {
  const state = readState();
  const character = state.characters.find((item) => item.id === characterId);
  if (!character) return [];

  const conversation = state.conversations.single[characterId];
  const messages = conversation?.messages || character.chatHistory || [];
  const triggerCount = Number(character.memoryTriggerCount || MEMORY_DEFAULT_TRIGGER_COUNT);

  if (!force && messages.length < triggerCount) return [];

  const unsummarized = getUnsummarizedMessages(characterId, messages);
  if (!force && unsummarized.length < triggerCount) return [];

  const apiReady = Boolean(apiConfigId || character.apiConfigId);
  if (!apiReady) return [];

  const compactText = unsummarized
    .slice(-triggerCount)
    .map((message) => `${message.role === "user" ? "用户" : character.name}：${message.content || message.rawContent || ""}`)
    .join("\n");

  try {
    const response = await chatCompletion({
      apiConfigId: apiConfigId || character.apiConfigId,
      model: apiModel || character.apiModel,
      messages: [
        { role: "system", content: MEMORY_SUMMARY_PROMPT },
        { role: "user", content: compactText },
      ],
      temperature: 0.2,
    });

    const parsed = parseMemoryJson(response.content);
    const memories = parsed.map((item) => createMemoryItem({
      content: item.content,
      tags: Array.isArray(item.tags) ? item.tags : ["总结"],
      importance: normalizeImportance(item.importance),
      source: "summary",
    }));

    updateState((draft) => {
      const target = draft.characters.find((item) => item.id === characterId);
      if (!target) return draft;

      target.memories = dedupeMemories([...(target.memories || []), ...memories]);
      target.lastMemorySummaryAt = nowISO();
      target.lastMemoryMessageId = unsummarized.at(-1)?.id || "";
      target.updatedAt = nowISO();

      return draft;
    });

    return memories;
  } catch {
    return [];
  }
}

export function getUnsummarizedMessages(characterId, messages = []) {
  const character = getCharacter(characterId);
  const lastMessageId = character?.lastMemoryMessageId;
  if (!lastMessageId) return messages;

  const index = messages.findIndex((message) => message.id === lastMessageId);
  return index >= 0 ? messages.slice(index + 1) : messages;
}

export function buildMessagesWithMemory({
  character,
  userPersona,
  worldbookEntries = [],
  inventoryEffects = [],
  history = [],
  userMessage = "",
  extraPrompt = "",
  maxHistory = 30,
  memoryLimit = 12,
} = {}) {
  const memories = character?.id
    ? getRelevantMemories(character.id, userMessage, memoryLimit)
    : [];

  return buildChatMessages({
    character,
    userPersona,
    memories,
    worldbookEntries,
    inventoryEffects,
    history,
    userMessage,
    extraPrompt,
    maxHistory,
  });
}

export function parseMemoryJson(text = "") {
  const source = String(text || "").trim();
  const jsonBlock = source.match(/```json\s*([\s\S]*?)```/i)?.[1]
    || source.match(/```\s*([\s\S]*?)```/i)?.[1]
    || source.match(/\[[\s\S]*\]/)?.[0]
    || source;

  try {
    const parsed = JSON.parse(jsonBlock);
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.content)
      : [];
  } catch {
    return fallbackParseMemories(source);
  }
}

export function fallbackParseMemories(text = "") {
  return text
    .split(/\n+/)
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .filter((line) => !line.includes("不需要") && !line.includes("空数组"))
    .map((content) => ({
      content,
      tags: [],
      importance: 3,
    }));
}

export function dedupeMemories(memories = []) {
  const seen = new Set();
  return memories
    .filter((memory) => memory?.content?.trim())
    .map((memory) => ({
      ...createMemoryItem(),
      ...memory,
      content: memory.content.trim(),
      importance: normalizeImportance(memory.importance),
      tags: Array.isArray(memory.tags) ? memory.tags.filter(Boolean) : [],
    }))
    .filter((memory) => {
      const key = normalizeMemoryText(memory.content);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort(sortMemoryByImportance);
}

export function scoreMemory(memory, keywords) {
  const text = normalizeMemoryText(`${memory.content} ${(memory.tags || []).join(" ")}`);
  const keywordScore = keywords.reduce((score, keyword) => {
    if (!keyword) return score;
    return score + (text.includes(keyword) ? 2 : 0);
  }, 0);

  return keywordScore + normalizeImportance(memory.importance) * 0.4;
}

export function tokenizeText(text = "") {
  const source = normalizeMemoryText(text);
  const chineseTokens = source.match(/[\u4e00-\u9fa5]{2,}/g) || [];
  const wordTokens = source.match(/[a-z0-9_]{2,}/g) || [];
  return Array.from(new Set([...chineseTokens, ...wordTokens])).slice(0, 30);
}

export function normalizeMemoryText(text = "") {
  return String(text)
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[，。！？、,.!?;；:"“”'‘’（）()【】[\]{}]/g, "");
}

export function normalizeImportance(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 3;
  return Math.max(1, Math.min(5, Math.round(number)));
}

export function sortMemoryByImportance(a, b) {
  return normalizeImportance(b.importance) - normalizeImportance(a.importance)
    || new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0);
}

export function getMemoryStats(characterId) {
  const memories = getCharacterMemories(characterId);
  const tokenCount = estimateTokenCount(memories.map((memory) => memory.content).join("\n"));

  return {
    count: memories.length,
    tokenCount,
    highImportanceCount: memories.filter((memory) => normalizeImportance(memory.importance) >= 4).length,
    lastUpdatedAt: memories[0]?.updatedAt || "",
  };
}

export function exportCharacterMemories(characterId) {
  const character = getCharacter(characterId);
  if (!character) throw new Error("角色不存在");

  return JSON.stringify({
    version: "1.0",
    characterId,
    characterName: character.name,
    memories: character.memories || [],
  }, null, 2);
}

export function importCharacterMemories(characterId, jsonText, mode = "merge") {
  const parsed = JSON.parse(jsonText);
  const incoming = Array.isArray(parsed) ? parsed : parsed.memories || [];
  const character = getCharacter(characterId);
  if (!character) throw new Error("角色不存在");

  const memories = mode === "replace"
    ? dedupeMemories(incoming)
    : dedupeMemories([...(character.memories || []), ...incoming]);

  saveCharacter({
    ...character,
    memories,
    updatedAt: nowISO(),
  });

  return memories;
}

/* 待后续文件对齐：chat.js 在构建消息时调用 buildMessagesWithMemory，回复后调用 rememberFromConversation 和 summarizeCharacterIfNeeded。 */
