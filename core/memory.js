import {
  getCharacter,
  getCharacters,
  saveCharacter,
  addCharacterMemory,
  deleteCharacterMemory,
  createMemoryItem,
  getWorldbookItems,
  getWallet,
  nowISO,
  clone
} from './storage.js';

import {
  createChatCompletion
} from './api.js';

export const MEMORY_SOURCE = {
  manual: 'manual',
  summary: 'summary',
  proactive: 'proactive',
  import: 'import'
};

export const MEMORY_DEFAULTS = {
  triggerCount: 100,
  maxInjectedMemories: 18,
  maxRecentMessages: 24,
  maxSummaryMessages: 80,
  maxMemoryLength: 1200
};

export function getCharacterMemories(characterId) {
  const character = getCharacter(characterId);

  if (!character) {
    return [];
  }

  return Array.isArray(character.memories) ? character.memories : [];
}

export function normalizeMemory(memory = {}) {
  return {
    id: memory.id || crypto.randomUUID(),
    content: String(memory.content || '').trim(),
    source: memory.source || MEMORY_SOURCE.manual,
    createdAt: memory.createdAt || nowISO()
  };
}

export function addMemory(characterId, content, source = MEMORY_SOURCE.manual) {
  const text = String(content || '').trim();

  if (!characterId || !text) {
    return null;
  }

  return addCharacterMemory(characterId, {
    content: text,
    source
  });
}

export function addMemories(characterId, memories = [], source = MEMORY_SOURCE.manual) {
  const saved = [];

  memories.forEach((memory) => {
    const content = typeof memory === 'string' ? memory : memory.content;

    if (String(content || '').trim()) {
      saved.push(addMemory(characterId, content, memory.source || source));
    }
  });

  return saved.filter(Boolean);
}

export function updateMemory(characterId, memoryId, patch = {}) {
  const character = getCharacter(characterId);

  if (!character) {
    return null;
  }

  const memories = Array.isArray(character.memories) ? character.memories : [];
  const index = memories.findIndex((memory) => memory.id === memoryId);

  if (index < 0) {
    return null;
  }

  memories[index] = normalizeMemory({
    ...memories[index],
    ...patch,
    id: memoryId,
    createdAt: memories[index].createdAt || nowISO()
  });

  character.memories = memories;
  saveCharacter(character);

  return memories[index];
}

export function removeMemory(characterId, memoryId) {
  return deleteCharacterMemory(characterId, memoryId);
}

export function clearMemories(characterId) {
  const character = getCharacter(characterId);

  if (!character) {
    return null;
  }

  character.memories = [];
  return saveCharacter(character);
}

export function importMemories(characterId, memories = []) {
  const normalized = Array.isArray(memories) ? memories : [];

  return addMemories(
    characterId,
    normalized.map((memory) => ({
      ...memory,
      source: memory.source || MEMORY_SOURCE.import
    })),
    MEMORY_SOURCE.import
  );
}

export function exportMemories(characterId) {
  return JSON.stringify(getCharacterMemories(characterId), null, 2);
}

export function searchMemories(characterId, keyword = '') {
  const query = String(keyword || '').trim().toLowerCase();

  if (!query) {
    return getCharacterMemories(characterId);
  }

  return getCharacterMemories(characterId).filter((memory) => {
    return String(memory.content || '').toLowerCase().includes(query);
  });
}

export function getRecentMessages(characterId, limit = MEMORY_DEFAULTS.maxRecentMessages) {
  const character = getCharacter(characterId);

  if (!character || !Array.isArray(character.chatHistory)) {
    return [];
  }

  return character.chatHistory.slice(-limit);
}

export function getMessagesSinceLastSummary(characterId) {
  const character = getCharacter(characterId);

  if (!character || !Array.isArray(character.chatHistory)) {
    return [];
  }

  const lastSummary = [...(character.memories || [])]
    .filter((memory) => memory.source === MEMORY_SOURCE.summary)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];

  if (!lastSummary) {
    return character.chatHistory;
  }

  const lastTime = new Date(lastSummary.createdAt).getTime();

  return character.chatHistory.filter((message) => {
    return new Date(message.createdAt || 0).getTime() > lastTime;
  });
}

export function shouldAutoSummarize(characterId) {
  const character = getCharacter(characterId);

  if (!character) {
    return false;
  }

  const triggerCount = Number(character.memoryTriggerCount || MEMORY_DEFAULTS.triggerCount);
  const messages = getMessagesSinceLastSummary(characterId);

  return messages.length >= triggerCount;
}

export function formatMessageForMemory(message = {}) {
  const roleName = message.role === 'user'
    ? '用户'
    : message.name || '角色';

  if (message.type === 'transfer') {
    return `${roleName}：转账 ${Number(message.amount || 0).toFixed(2)}`;
  }

  return `${roleName}：${message.content || ''}`;
}

export function formatMessagesForMemory(messages = []) {
  return messages
    .filter((message) => message && (message.content || message.type === 'transfer'))
    .map(formatMessageForMemory)
    .join('\n');
}

export function buildMemoryPrompt(characterId, options = {}) {
  const {
    max = MEMORY_DEFAULTS.maxInjectedMemories,
    includeTitle = true
  } = options;

  const memories = getCharacterMemories(characterId)
    .filter((memory) => String(memory.content || '').trim())
    .slice(0, max);

  if (!memories.length) {
    return '';
  }

  const content = memories
    .map((memory, index) => `${index + 1}. ${memory.content}`)
    .join('\n');

  return includeTitle
    ? `以下是你需要长期记住的信息：\n${content}`
    : content;
}

export function getWorldbookPrompt(characterId) {
  const items = getWorldbookItems()
    .filter((item) => item.enabled !== false)
    .filter((item) => {
      if (item.type === 'thinking') {
        return true;
      }

      if (!Array.isArray(item.characterIds) || !item.characterIds.length) {
        return true;
      }

      return item.characterIds.includes(characterId);
    });

  if (!items.length) {
    return '';
  }

  const background = items
    .filter((item) => item.type !== 'thinking')
    .map((item) => `【${item.title}】\n${item.content}`)
    .join('\n\n');

  const thinking = items
    .filter((item) => item.type === 'thinking')
    .map((item) => `【${item.title}】\n${item.content}`)
    .join('\n\n');

  return [
    background ? `世界与关系设定：\n${background}` : '',
    thinking ? `思维方式与行为准则：\n${thinking}` : ''
  ].filter(Boolean).join('\n\n');
}

export function getMoodPrompt(character = {}) {
  const mood = character.mood || 'neutral';

  const map = {
    happy: '你现在心情很好，回复会更柔软、更主动。',
    neutral: '',
    sad: '你现在心情低落，回复会更安静、更需要被理解。',
    angry: '你现在有些不高兴，回复会更克制，但不要伤害用户。',
    shy: '你现在有些害羞，回复会更含蓄、更轻声。',
    excited: '你现在很期待交流，回复会更积极。'
  };

  return map[mood] || '';
}

export function getInventoryPrompt(characterId) {
  const wallet = getWallet();
  const inventory = Array.isArray(wallet.inventory) ? wallet.inventory : [];

  const activeItems = inventory.filter((item) => {
    if (item.used) {
      return false;
    }

    if (!item.effectPrompt) {
      return false;
    }

    if (!item.targetCharacterId) {
      return true;
    }

    return item.targetCharacterId === characterId;
  });

  if (!activeItems.length) {
    return '';
  }

  return activeItems
    .map((item) => item.effectPrompt)
    .join('\n');
}

export function buildSystemPrompt(characterId, options = {}) {
  const character = typeof characterId === 'object' ? characterId : getCharacter(characterId);

  if (!character) {
    return '';
  }

  const basePrompt = options.basePrompt !== undefined
    ? options.basePrompt
    : character.systemPrompt || '';

  const worldbookPrompt = options.includeWorldbook === false
    ? ''
    : getWorldbookPrompt(character.id);

  const moodPrompt = options.includeMood === false
    ? ''
    : getMoodPrompt(character);

  const inventoryPrompt = options.includeInventory === false
    ? ''
    : getInventoryPrompt(character.id);

  const extraPrompt = options.extraPrompt || '';

  const memoryPrompt = options.includeMemory === false
    ? ''
    : buildMemoryPrompt(character.id, {
      max: options.maxInjectedMemories || MEMORY_DEFAULTS.maxInjectedMemories
    });

  return [
    basePrompt,
    worldbookPrompt,
    moodPrompt,
    inventoryPrompt,
    extraPrompt,
    memoryPrompt
  ].filter((text) => String(text || '').trim()).join('\n\n');
}

export function injectMemoriesIntoSystemPrompt(systemPrompt = '', characterId, options = {}) {
  const memoryPrompt = buildMemoryPrompt(characterId, options);

  return [
    systemPrompt,
    memoryPrompt
  ].filter((text) => String(text || '').trim()).join('\n\n');
}

export function buildMessagesWithMemory(characterId, chatHistory = [], options = {}) {
  const systemPrompt = buildSystemPrompt(characterId, options);
  const messages = [];

  if (systemPrompt) {
    messages.push({
      role: 'system',
      content: systemPrompt
    });
  }

  chatHistory.forEach((message) => {
    if (!message || !message.content) {
      return;
    }

    if (message.role === 'user') {
      messages.push({
        role: 'user',
        content: message.content
      });
      return;
    }

    if (message.role === 'assistant' || message.role === 'ai') {
      messages.push({
        role: 'assistant',
        content: message.content
      });
    }
  });

  return messages;
}

export async function summarizeCharacterMemory(characterId, options = {}) {
  const character = getCharacter(characterId);

  if (!character) {
    return null;
  }

  const messages = (options.messages || getMessagesSinceLastSummary(characterId))
    .slice(-Number(options.maxMessages || MEMORY_DEFAULTS.maxSummaryMessages));

  if (!messages.length) {
    return null;
  }

  const transcript = formatMessagesForMemory(messages);

  if (!transcript.trim()) {
    return null;
  }

  const prompt = [
    '请把以下聊天记录总结成长期记忆。',
    '只保留会影响未来互动的重要事实、关系变化、偏好、承诺、称呼、事件和情绪线索。',
    '不要写客套话，不要编造。',
    '请用简洁中文输出，最多8条，每条一行。',
    '',
    transcript
  ].join('\n');

  const result = await createChatCompletion({
    characterId,
    stream: false,
    messages: [
      {
        role: 'system',
        content: '你是记忆整理助手，只输出可长期保存的记忆条目。'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    model: options.model,
    endpoint: options.endpoint,
    apiKey: options.apiKey
  });

  const content = String(result.content || '').trim();

  if (!content) {
    return null;
  }

  const memory = addMemory(characterId, content, MEMORY_SOURCE.summary);

  trimMemories(characterId);

  return memory;
}

export async function detectImportantMemory(characterId, options = {}) {
  const character = getCharacter(characterId);

  if (!character) {
    return [];
  }

  const recentMessages = options.messages || getRecentMessages(characterId, 8);
  const transcript = formatMessagesForMemory(recentMessages);

  if (!transcript.trim()) {
    return [];
  }

  const prompt = [
    '请判断以下对话中是否有需要长期记住的信息。',
    '只提取会影响未来互动的事实、偏好、关系、承诺、重要事件、称呼、边界和计划。',
    '如果没有，输出空字符串。',
    '如果有，每条一行，最多5条。',
    '',
    transcript
  ].join('\n');

  const result = await createChatCompletion({
    characterId,
    stream: false,
    messages: [
      {
        role: 'system',
        content: '你是记忆判断助手，只输出需要保存的记忆条目，不解释。'
      },
      {
        role: 'user',
        content: prompt
      }
    ],
    model: options.model,
    endpoint: options.endpoint,
    apiKey: options.apiKey
  });

  return parseMemoryLines(result.content);
}

export function parseMemoryLines(text = '') {
  return String(text || '')
    .split('\n')
    .map((line) => line.replace(/^\s*[-*序号\d.、)）]+\s*/, '').trim())
    .filter(Boolean)
    .filter((line) => !['无', '没有', '空', '无重要信息', '没有需要记住的信息'].includes(line))
    .slice(0, 8);
}

export async function proactiveRemember(characterId, options = {}) {
  const lines = await detectImportantMemory(characterId, options);

  if (!lines.length) {
    return [];
  }

  const existing = getCharacterMemories(characterId)
    .map((memory) => normalizeText(memory.content));

  const saved = [];

  lines.forEach((line) => {
    const normalizedLine = normalizeText(line);

    if (!normalizedLine) {
      return;
    }

    const duplicated = existing.some((item) => {
      return item.includes(normalizedLine) || normalizedLine.includes(item);
    });

    if (!duplicated) {
      saved.push(addMemory(characterId, line, MEMORY_SOURCE.proactive));
      existing.push(normalizedLine);
    }
  });

  trimMemories(characterId);

  return saved.filter(Boolean);
}

export async function runMemoryCycle(characterId, options = {}) {
  const result = {
    summarized: null,
    proactive: []
  };

  if (!characterId) {
    return result;
  }

  if (options.proactive !== false) {
    try {
      result.proactive = await proactiveRemember(characterId, options);
    } catch {}
  }

  if (options.summary !== false && shouldAutoSummarize(characterId)) {
    try {
      result.summarized = await summarizeCharacterMemory(characterId, options);
    } catch {}
  }

  return result;
}

export function trimMemories(characterId, max = 200) {
  const character = getCharacter(characterId);

  if (!character) {
    return null;
  }

  const memories = Array.isArray(character.memories) ? character.memories : [];

  if (memories.length <= max) {
    return character;
  }

  character.memories = memories
    .slice()
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, max);

  return saveCharacter(character);
}

export function normalizeText(text = '') {
  return String(text || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase();
}

export function mergeMemoryText(characterId, text = '', source = MEMORY_SOURCE.manual) {
  const lines = parseMemoryLines(text);
  return addMemories(characterId, lines, source);
}

export function replaceAllMemories(characterId, memories = []) {
  const character = getCharacter(characterId);

  if (!character) {
    return null;
  }

  character.memories = memories
    .map((memory) => {
      if (typeof memory === 'string') {
        return createMemoryItem({
          content: memory,
          source: MEMORY_SOURCE.import
        });
      }

      return normalizeMemory(memory);
    })
    .filter((memory) => memory.content);

  return saveCharacter(character);
}

export function copyMemories(fromCharacterId, toCharacterId) {
  const memories = getCharacterMemories(fromCharacterId);

  return addMemories(
    toCharacterId,
    memories.map((memory) => ({
      content: memory.content,
      source: MEMORY_SOURCE.import
    })),
    MEMORY_SOURCE.import
  );
}

export function getAllMemoryIndex() {
  return getCharacters().flatMap((character) => {
    return getCharacterMemories(character.id).map((memory) => ({
      ...memory,
      characterId: character.id,
      characterName: character.name,
      characterAvatar: character.avatar
    }));
  });
}

export function searchAllMemories(keyword = '') {
  const query = String(keyword || '').trim().toLowerCase();

  if (!query) {
    return getAllMemoryIndex();
  }

  return getAllMemoryIndex().filter((item) => {
    return String(item.content || '').toLowerCase().includes(query)
      || String(item.characterName || '').toLowerCase().includes(query);
  });
}

export function createMemoryExport(characterId) {
  const character = getCharacter(characterId);

  if (!character) {
    return null;
  }

  return {
    characterId: character.id,
    characterName: character.name,
    exportedAt: nowISO(),
    memories: clone(character.memories || [])
  };
}

export function getMemoryStats(characterId) {
  const memories = getCharacterMemories(characterId);
  const sinceLastSummary = getMessagesSinceLastSummary(characterId);
  const character = getCharacter(characterId);
  const triggerCount = Number(character?.memoryTriggerCount || MEMORY_DEFAULTS.triggerCount);

  return {
    total: memories.length,
    manual: memories.filter((memory) => memory.source === MEMORY_SOURCE.manual).length,
    summary: memories.filter((memory) => memory.source === MEMORY_SOURCE.summary).length,
    proactive: memories.filter((memory) => memory.source === MEMORY_SOURCE.proactive).length,
    messagesSinceLastSummary: sinceLastSummary.length,
    triggerCount,
    shouldSummarize: sinceLastSummary.length >= triggerCount
  };
}
