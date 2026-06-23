// apps/chat/thread-ai.js
// imports:
//   from '../../core/storage.js': getData, setData, generateId, getNow, setDB, deleteDB, getByIndexDB, getAllDB
//   from '../../core/api.js': silentRequest

import {
  getData,
  setData,
  generateId,
  getNow,
  setDB,
  deleteDB,
  getByIndexDB,
  getAllDB
} from '../../core/storage.js';

import { silentRequest } from '../../core/api.js';

const PRIVATE_STORE = 'messages';
const GROUP_STORE = 'group_messages';
const MEMORY_STORE = 'memories';

const AI_CONTEXT_LIMIT = 28;
const MEMORY_LIMIT = 18;
const GROUP_REPLY_MAX = 3;

const DEFAULT_PROACTIVE_CONFIG = {
  proactiveMode1Enabled: false,
  proactiveMode1Minutes: 30,
  proactiveMode2Enabled: false,
  proactiveMode2MinMinutes: 5,
  proactiveMode2MaxMinutes: 10,
  proactiveChance: 0.35,
  proactiveLastSentAt: null,
  proactiveAwaitingUserReply: false,
  proactiveNextCheckAt: null,
  readAt: null
};

export async function requestThreadAIReply(state, options = {}) {
  if (!state) return null;

  if (state.mode === 'group') {
    return requestGroupReply(state, options);
  }

  return requestPrivateReply(state, options);
}

export async function checkThreadProactiveMessages(state, options = {}) {
  if (!state || state.mode === 'group') return null;

  const character = state.character;
  const characterId = character?.id || state.characterId;
  if (!characterId) return null;

  const config = getChatConfig(characterId);
  const messages = await loadPrivateMessages(characterId);
  const last = messages[messages.length - 1] || null;

  if (!last) return null;

  const now = Date.now();
  const lastTime = new Date(last.timestamp || last.createdAt || 0).getTime();
  if (!lastTime) return null;

  await markUserReplyIfNeeded(characterId, config, last);

  const refreshedConfig = getChatConfig(characterId);

  if (refreshedConfig.proactiveAwaitingUserReply) {
    return null;
  }

  if (refreshedConfig.proactiveMode1Enabled) {
    const minutes = clampNumber(refreshedConfig.proactiveMode1Minutes, 1, 240);
    const due = now - lastTime >= minutes * 60 * 1000;

    if (last.role === 'user' && due) {
      return sendProactivePrivateMessage(state, {
        reason: 'offline_timeout',
        config: refreshedConfig,
        incrementUnread: options.incrementUnread !== false
      });
    }
  }

  if (refreshedConfig.proactiveMode2Enabled && isPageActive()) {
    const min = clampNumber(refreshedConfig.proactiveMode2MinMinutes, 1, 240);
    const max = Math.max(min, clampNumber(refreshedConfig.proactiveMode2MaxMinutes, min, 240));
    const nextAt = new Date(refreshedConfig.proactiveNextCheckAt || 0).getTime();
    const chance = clampChance(refreshedConfig.proactiveChance);

    if (!nextAt) {
      const nextDelayMinutes = randomBetween(min, max);
      saveChatConfig(characterId, {
        ...refreshedConfig,
        proactiveNextCheckAt: new Date(now + nextDelayMinutes * 60 * 1000).toISOString()
      });
      return null;
    }

    if (now >= nextAt) {
      if (Math.random() <= chance) {
        return sendProactivePrivateMessage(state, {
          reason: 'online_idle',
          config: refreshedConfig,
          incrementUnread: options.incrementUnread !== false
        });
      }

      const nextDelayMinutes = randomBetween(min, max);
      saveChatConfig(characterId, {
        ...refreshedConfig,
        proactiveNextCheckAt: new Date(now + nextDelayMinutes * 60 * 1000).toISOString()
      });
    }
  }

  return null;
}

export async function requestProactiveThreadMessage(state, reason = 'manual') {
  if (!state || state.mode === 'group') return null;

  const characterId = state.character?.id || state.characterId;
  if (!characterId) return null;

  return sendProactivePrivateMessage(state, {
    reason,
    config: getChatConfig(characterId),
    incrementUnread: true
  });
}

async function requestPrivateReply(state, options = {}) {
  const character = state.character;
  const characterId = character?.id || state.characterId;

  if (!characterId) return null;

  const messages = await loadPrivateMessages(characterId);
  const userMessage = getLastUserMessage(messages);

  if (!userMessage && !options.continue && !options.proactive) return null;

  const placeholder = createAssistantPlaceholder({
    characterId,
    groupId: '',
    character,
    content: '',
    thinking: options.proactive ? 'TA 想主动和你说句话。' : 'TA 正在认真想怎么回复你。',
    thinkingSummary: options.proactive ? '想主动找你' : '正在整理思路',
    toolCalls: []
  });

  await setDB(PRIVATE_STORE, placeholder);
  await syncPrivateState(state, characterId);

  try {
    const promptMessages = await buildPrompt({
      mode: 'private',
      character,
      group: null,
      messages,
      targetCharacter: character,
      options
    });

    const result = await requestAIText(promptMessages);
    const parsed = normalizeAIResult(result);

    if (!parsed.content && !parsed.thinking) {
      await deleteDB(PRIVATE_STORE, placeholder.id);
      await syncPrivateState(state, characterId);
      return null;
    }

    const finalMessage = {
      ...placeholder,
      content: parsed.content || '我刚刚有点卡住了，可以再说一遍吗？',
      thinking: parsed.thinking || placeholder.thinking,
      thinkingSummary: parsed.thinkingSummary || summarizeText(parsed.thinking || placeholder.thinking, 28),
      toolCalls: parsed.toolCalls,
      proactive: Boolean(options.proactive),
      proactiveReason: options.proactiveReason || '',
      updatedAt: getNow()
    };

    await setDB(PRIVATE_STORE, finalMessage);

    if (!options.proactive) {
      await maybeWriteMemory({
        characterId,
        sourceMessage: userMessage,
        aiText: finalMessage.content,
        source: 'auto'
      });
    }

    await syncPrivateState(state, characterId);

    if (options.proactive) {
      markProactiveSent(characterId);
      await updateUnreadCount(characterId, options.incrementUnread === false ? 0 : 1);
    } else {
      await markUserReplyIfNeeded(characterId, getChatConfig(characterId), userMessage);
      await updateUnreadCount(characterId, 0);
    }

    return finalMessage;
  } catch (error) {
    await deleteDB(PRIVATE_STORE, placeholder.id).catch(() => {});
    await syncPrivateState(state, characterId);
    throw error;
  }
}

async function sendProactivePrivateMessage(state, options = {}) {
  return requestPrivateReply(state, {
    proactive: true,
    proactiveReason: options.reason || 'proactive',
    incrementUnread: options.incrementUnread !== false
  });
}

async function requestGroupReply(state, options = {}) {
  const group = state.group;
  const groupId = group?.id || state.groupId;

  if (!groupId) return [];

  const groupMessages = await loadGroupMessages(groupId);
  const userMessage = getLastUserMessage(groupMessages);

  if (!userMessage && !options.continue) return [];

  const members = await resolveGroupMembers(group);
  const speakers = chooseGroupSpeakers(members, groupMessages);
  const replies = [];

  for (const character of speakers) {
    const placeholder = createAssistantPlaceholder({
      characterId: character.id,
      groupId,
      character,
      content: '',
      thinking: `${character.name || 'TA'} 正在接话。`,
      thinkingSummary: '正在接话',
      toolCalls: []
    });

    await setDB(GROUP_STORE, placeholder);
    await syncGroupState(state, groupId);

    try {
      const promptMessages = await buildPrompt({
        mode: 'group',
        character,
        group,
        messages: groupMessages,
        targetCharacter: character,
        options
      });

      const result = await requestAIText(promptMessages);
      const parsed = normalizeAIResult(result);

      if (!parsed.content && !parsed.thinking) {
        await deleteDB(GROUP_STORE, placeholder.id);
        await syncGroupState(state, groupId);
        continue;
      }

      const finalMessage = {
        ...placeholder,
        content: parsed.content || '我先听你们说。',
        thinking: parsed.thinking || placeholder.thinking,
        thinkingSummary: parsed.thinkingSummary || summarizeText(parsed.thinking || placeholder.thinking, 28),
        toolCalls: parsed.toolCalls,
        characterName: character.name || 'TA',
        characterAvatar: character.avatar || '',
        updatedAt: getNow()
      };

      await setDB(GROUP_STORE, finalMessage);

      await maybeWriteMemory({
        characterId: character.id,
        sourceMessage: userMessage,
        aiText: finalMessage.content,
        source: 'auto'
      });

      replies.push(finalMessage);
    } catch (error) {
      await deleteDB(GROUP_STORE, placeholder.id).catch(() => {});
      await syncGroupState(state, groupId);
      throw error;
    }
  }

  await syncGroupState(state, groupId);
  return replies;
}

async function buildPrompt({
  mode,
  character,
  group,
  messages,
  targetCharacter,
  options
}) {
  const memories = await loadMemories(targetCharacter?.id || character?.id || '');
  const worldbook = await loadWorldbook();
  const inventory = await loadInventory();
  const anniversary = loadAnniversary();
  const userProfile = loadUserProfile();
  const currentTime = formatCurrentTime();
  const context = buildMessageContext(messages, mode);

  const system = [
    buildCharacterPrompt(targetCharacter || character),
    buildUserProfilePrompt(userProfile),
    buildWorldbookPrompt(worldbook),
    buildInventoryPrompt(inventory),
    buildMemoryPrompt(memories),
    buildAnniversaryPrompt(anniversary),
    `当前时间：${currentTime}`,
    buildModePrompt(mode, group, targetCharacter || character, options),
    options.proactive ? buildProactivePrompt(options.proactiveReason, messages) : ''
  ].filter(Boolean).join('\n\n');

  const chatMessages = [
    {
      role: 'system',
      content: system
    },
    ...context
  ];

  if (options.regenerate) {
    chatMessages.push({
      role: 'user',
      content: '请基于上面的上下文重新回复上一句，保持人设，不要解释你在重新生成。'
    });
  }

  if (options.continue) {
    chatMessages.push({
      role: 'user',
      content: '请自然续写上一条回复，语气保持一致，不要重复已经说过的内容。'
    });
  }

  if (options.proactive) {
    chatMessages.push({
      role: 'user',
      content: '现在请你主动发一条消息。不要说“系统让我主动联系你”，也不要解释触发原因。'
    });
  }

  return chatMessages;
}

function buildCharacterPrompt(character) {
  if (!character) return '你是一个温柔自然的聊天对象。';

  return [
    `你正在扮演：${character.name || 'TA'}`,
    character.description ? `角色简介：${character.description}` : '',
    character.persona ? `人设：${character.persona}` : '',
    character.prompt ? `补充设定：${character.prompt}` : '',
    character.style ? `说话风格：${character.style}` : '',
    character.relationship ? `和用户的关系：${character.relationship}` : ''
  ].filter(Boolean).join('\n');
}

function buildUserProfilePrompt(user) {
  if (!user || !Object.keys(user).length) return '';

  return [
    '用户人设：',
    user.name ? `名字：${user.name}` : '',
    user.profile ? `资料：${user.profile}` : '',
    user.persona ? `设定：${user.persona}` : ''
  ].filter(Boolean).join('\n');
}

function buildWorldbookPrompt(items) {
  if (!items.length) return '';

  return [
    '世界书：',
    ...items.slice(0, 16).map((item) => `- ${item.title || item.name || '设定'}：${item.content || item.description || ''}`)
  ].join('\n');
}

function buildInventoryPrompt(items) {
  if (!items.length) return '';

  return [
    '道具和状态：',
    ...items.slice(0, 12).map((item) => `- ${item.name || '道具'}：${item.description || item.effect || item.content || ''}`)
  ].join('\n');
}

function buildMemoryPrompt(memories) {
  if (!memories.length) return '';

  return [
    '长期记忆：',
    ...memories.slice(0, MEMORY_LIMIT).map((item) => `- ${item.content}`)
  ].join('\n');
}

function buildAnniversaryPrompt(value) {
  if (!value) return '';

  if (Array.isArray(value)) {
    return [
      '纪念日：',
      ...value.slice(0, 10).map((item) => `- ${item.name || item.title || '纪念日'}：${item.date || item.content || ''}`)
    ].join('\n');
  }

  if (typeof value === 'object') {
    return `纪念日：${JSON.stringify(value)}`;
  }

  return `纪念日：${String(value)}`;
}

function buildModePrompt(mode, group, character, options) {
  const base = [
    '回复要求：',
    '- 自然、口语化，像真实聊天。',
    '- 不要把系统设定原样说出来。',
    '- 不要提到“提示词”“系统消息”。',
    '- 可以结合时间、记忆和最近上下文。',
    '- 如果需要表达思考，请用 <thinking>...</thinking> 包住简短思考。',
    '- 正文不要太长，优先像手机聊天。'
  ];

  if (mode === 'group') {
    base.push(`- 当前是群聊：${group?.name || '群聊'}。`);
    base.push(`- 你只代表 ${character?.name || '当前角色'} 发言，不要替其他人说完整台词。`);
    base.push('- 群聊回复要短一点，不要一次说太多。');
  }

  if (options.proactive) {
    base.push('- 这是一次主动消息，要像自然想起用户一样开口，不要显得突兀。');
    base.push('- 不要连续追问，不要显得催促。');
    base.push('- 内容要结合当前时间段、最近聊天上下文、长期记忆和你的人设。');
  }

  return base.join('\n');
}

function buildProactivePrompt(reason, messages) {
  const last = normalizeList(messages).slice(-1)[0];
  const lastText = last ? summarizeText(formatMessageForPrompt(last, 'private'), 90) : '';

  const reasonText = reason === 'offline_timeout'
    ? '用户发完上一句话后已经有一段时间没继续聊，你可以自然接一句。'
    : reason === 'online_idle'
      ? '用户停留在聊天里有一会儿没说话，你可以轻轻主动开口。'
      : '你想主动和用户说句话。';

  return [
    '主动消息场景：',
    reasonText,
    lastText ? `最近一句：${lastText}` : '',
    '请只输出你要发给用户的那条消息。'
  ].filter(Boolean).join('\n');
}

function buildMessageContext(messages, mode) {
  return normalizeList(messages)
    .slice(-AI_CONTEXT_LIMIT)
    .map((message) => {
      if (message.role === 'assistant') {
        return {
          role: 'assistant',
          content: formatMessageForPrompt(message, mode)
        };
      }

      if (message.role === 'system') {
        return {
          role: 'system',
          content: String(message.content || '')
        };
      }

      return {
        role: 'user',
        content: formatMessageForPrompt(message, mode)
      };
    });
}

function formatMessageForPrompt(message, mode) {
  const prefix = mode === 'group'
    ? `${message.role === 'user' ? '用户' : message.characterName || 'TA'}：`
    : '';

  if (message.type === 'image') return `${prefix}[图片] ${message.content || ''}`.trim();
  if (message.type === 'sticker') return `${prefix}[表情]`;
  if (message.type === 'transfer') return `${prefix}[转账 ${Number(message.transferAmount || 0)}] ${message.note || message.content || ''}`.trim();
  if (message.type === 'voice') return `${prefix}[语音] ${message.content || ''}`.trim();

  if (message.quoteText) {
    return `${prefix}引用「${message.quoteText}」\n${message.content || ''}`.trim();
  }

  return `${prefix}${message.content || ''}`.trim();
}

async function requestAIText(messages) {
  const settings = getData('app_settings') || {};
  const model = settings.defaultModel || settings.model || '';

  return await silentRequest({
    messages,
    model,
    temperature: 0.85
  });
}

function normalizeAIResult(result) {
  if (typeof result === 'string') {
    return parseAIText(result);
  }

  if (result && typeof result === 'object') {
    const content =
      result.content ||
      result.text ||
      result.message ||
      result.reply ||
      result.choices?.[0]?.message?.content ||
      '';

    const parsed = parseAIText(String(content || ''));

    return {
      content: parsed.content,
      thinking: result.thinking || parsed.thinking || '',
      thinkingSummary: result.thinkingSummary || parsed.thinkingSummary || '',
      toolCalls: normalizeToolCalls(result.toolCalls || result.tools || result.choices?.[0]?.message?.tool_calls || [])
    };
  }

  return {
    content: '',
    thinking: '',
    thinkingSummary: '',
    toolCalls: []
  };
}

function parseAIText(text) {
  const raw = String(text || '').trim();
  const thinkingMatch = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const thinking = thinkingMatch ? thinkingMatch[1].trim() : '';
  const content = thinkingMatch ? raw.replace(thinkingMatch[0], '').trim() : raw;

  return {
    content,
    thinking,
    thinkingSummary: summarizeText(thinking, 28),
    toolCalls: []
  };
}

function normalizeToolCalls(value) {
  if (!Array.isArray(value)) return [];

  return value.map((tool, index) => {
    const fn = tool.function || {};

    return {
      id: tool.id || generateId('tool'),
      name: tool.name || fn.name || tool.toolName || `工具 ${index + 1}`,
      status: tool.status || 'done',
      arguments: tool.arguments || fn.arguments || tool.input || '',
      result: tool.result || tool.output || ''
    };
  });
}

function createAssistantPlaceholder({
  characterId,
  groupId,
  character,
  content,
  thinking,
  thinkingSummary,
  toolCalls
}) {
  const now = getNow();

  return {
    id: generateId('msg'),
    role: 'assistant',
    content: content || '',
    type: 'text',
    characterId: characterId || '',
    groupId: groupId || '',
    characterName: character?.name || '',
    characterAvatar: character?.avatar || '',
    thinking: thinking || '',
    thinkingSummary: thinkingSummary || '',
    toolCalls: Array.isArray(toolCalls) ? toolCalls : [],
    timestamp: now,
    createdAt: now,
    updatedAt: now
  };
}

async function maybeWriteMemory({ characterId, sourceMessage, aiText, source }) {
  if (!characterId || !sourceMessage) return null;

  const text = String(sourceMessage.content || '').trim();
  if (!shouldRemember(text)) return null;

  const content = buildMemoryText(text, aiText);
  if (!content) return null;

  const existing = await getByIndexDB(MEMORY_STORE, 'characterId', characterId).catch(() => []);
  const duplicated = normalizeList(existing).some((item) => similarText(item.content, content));

  if (duplicated) return null;

  const now = getNow();
  const memory = {
    id: generateId('memory'),
    characterId,
    content,
    source: source || 'auto',
    createdAt: now,
    updatedAt: now
  };

  await setDB(MEMORY_STORE, memory);
  return memory;
}

function shouldRemember(text) {
  const clean = String(text || '').trim();
  if (clean.length < 12) return false;

  return [
    '我喜欢',
    '我不喜欢',
    '我讨厌',
    '我害怕',
    '我想要',
    '我希望',
    '记住',
    '别忘',
    '生日',
    '纪念日',
    '今天',
    '以后',
    '名字',
    '住在',
    '工作',
    '学校',
    '朋友',
    '家人'
  ].some((word) => clean.includes(word));
}

function buildMemoryText(userText, aiText) {
  const user = summarizeText(userText, 80);
  const ai = summarizeText(aiText, 50);

  if (!user) return '';

  return ai
    ? `用户提到：${user}。当时回复氛围：${ai}`
    : `用户提到：${user}`;
}

function similarText(a, b) {
  const left = String(a || '').replace(/\s+/g, '');
  const right = String(b || '').replace(/\s+/g, '');

  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  return left.slice(0, 24) === right.slice(0, 24);
}

async function loadPrivateMessages(characterId) {
  const list = await getByIndexDB(PRIVATE_STORE, 'characterId', characterId).catch(() => []);
  return normalizeList(list).sort(sortByTimestamp);
}

async function loadGroupMessages(groupId) {
  const list = await getByIndexDB(GROUP_STORE, 'groupId', groupId).catch(() => []);
  return normalizeList(list).sort(sortByTimestamp);
}

async function syncPrivateState(state, characterId) {
  state.messages = await loadPrivateMessages(characterId);
  return state.messages;
}

async function syncGroupState(state, groupId) {
  state.groupMessages = await loadGroupMessages(groupId);
  return state.groupMessages;
}

async function loadMemories(characterId) {
  if (!characterId) return [];

  const list = await getByIndexDB(MEMORY_STORE, 'characterId', characterId).catch(() => []);

  return normalizeList(list)
    .sort(sortByUpdatedAtDesc)
    .slice(0, MEMORY_LIMIT);
}

async function loadWorldbook() {
  const list = await getAllDB('worldbook').catch(() => []);
  return normalizeList(list).filter((item) => item.enabled !== false);
}

async function loadInventory() {
  const list = await getAllDB('inventory').catch(() => []);
  return normalizeList(list).filter((item) => item.enabled !== false);
}

function loadAnniversary() {
  return getData('anniversary_items') || getData('app_anniversary') || getData('anniversaries') || null;
}

function loadUserProfile() {
  const settings = getData('app_settings') || {};
  const appUser = getData('app_user') || {};
  const profiles = getData('user_profiles') || [];
  const activeId = getData('active_user_profile_id') || settings.activeUserProfileId || '';

  if (Array.isArray(profiles) && profiles.length) {
    const active = profiles.find((item) => item.id === activeId) || profiles.find((item) => item.isDefault) || profiles[0];

    return {
      ...appUser,
      ...active
    };
  }

  return settings.user || appUser || {};
}

async function resolveGroupMembers(group) {
  const ids = Array.isArray(group?.memberIds) ? group.memberIds.map(String) : [];
  const characters = await getAllDB('characters').catch(() => []);

  if (!ids.length) {
    return normalizeList(characters).slice(0, GROUP_REPLY_MAX);
  }

  return normalizeList(characters).filter((item) => ids.includes(String(item.id)));
}

function chooseGroupSpeakers(members, messages) {
  const list = normalizeList(members);
  if (!list.length) return [];

  const recentAssistantIds = normalizeList(messages)
    .slice(-6)
    .filter((item) => item.role === 'assistant')
    .map((item) => item.characterId)
    .filter(Boolean);

  const sorted = [...list].sort((a, b) => {
    const aRecent = recentAssistantIds.includes(a.id) ? 1 : 0;
    const bRecent = recentAssistantIds.includes(b.id) ? 1 : 0;
    return aRecent - bRecent;
  });

  const count = Math.min(sorted.length, Math.max(1, Math.ceil(Math.random() * GROUP_REPLY_MAX)));
  return sorted.slice(0, count);
}

function getLastUserMessage(messages) {
  return [...normalizeList(messages)].reverse().find((item) => item.role === 'user') || null;
}

function getChatConfig(characterId) {
  const key = getChatConfigKey(characterId);
  const stored = getData(key) || {};

  return {
    ...DEFAULT_PROACTIVE_CONFIG,
    ...stored,
    proactiveMode1Minutes: Number(stored.proactiveMode1Minutes || DEFAULT_PROACTIVE_CONFIG.proactiveMode1Minutes),
    proactiveMode2MinMinutes: Number(stored.proactiveMode2MinMinutes || DEFAULT_PROACTIVE_CONFIG.proactiveMode2MinMinutes),
    proactiveMode2MaxMinutes: Number(stored.proactiveMode2MaxMinutes || DEFAULT_PROACTIVE_CONFIG.proactiveMode2MaxMinutes),
    proactiveChance: Number(stored.proactiveChance ?? DEFAULT_PROACTIVE_CONFIG.proactiveChance)
  };
}

function saveChatConfig(characterId, config) {
  if (!characterId) return;
  setData(getChatConfigKey(characterId), {
    ...DEFAULT_PROACTIVE_CONFIG,
    ...config
  });
}

function getChatConfigKey(characterId) {
  return `chat_${characterId}_config`;
}

async function markUserReplyIfNeeded(characterId, config, lastMessage) {
  if (!characterId || !lastMessage || lastMessage.role !== 'user') return;

  const lastUserTime = new Date(lastMessage.timestamp || lastMessage.createdAt || 0).getTime();
  const proactiveTime = new Date(config.proactiveLastSentAt || 0).getTime();

  if (config.proactiveAwaitingUserReply && lastUserTime > proactiveTime) {
    saveChatConfig(characterId, {
      ...config,
      proactiveAwaitingUserReply: false
    });
  }
}

function markProactiveSent(characterId) {
  const config = getChatConfig(characterId);
  const now = getNow();

  saveChatConfig(characterId, {
    ...config,
    proactiveLastSentAt: now,
    proactiveAwaitingUserReply: true,
    proactiveNextCheckAt: null
  });
}

async function updateUnreadCount(characterId, delta = 0) {
  if (!characterId) return;

  const key = 'chat_unread_counts';
  const counts = getData(key) || {};
  const current = Number(counts[characterId] || 0);
  const next = {
    ...counts,
    [characterId]: Math.max(0, current + Number(delta || 0))
  };

  setData(key, next);

  if (window.AppEvents?.emit) {
    window.AppEvents.emit('badge:chat', {
      characterId,
      count: next[characterId]
    });
  }

  if (typeof window.refreshDesktopBadges === 'function') {
    window.refreshDesktopBadges();
  }
}

function isPageActive() {
  return document.visibilityState === 'visible' && document.hasFocus();
}

function formatCurrentTime() {
  return new Date().toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function summarizeText(text, max = 60) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function sortByTimestamp(a, b) {
  return String(a?.timestamp || '').localeCompare(String(b?.timestamp || ''));
}

function sortByUpdatedAtDesc(a, b) {
  return String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || ''));
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function clampChance(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function randomBetween(min, max) {
  const left = Number(min);
  const right = Number(max);
  return Math.floor(left + Math.random() * (right - left + 1));
}

// 改了什么：修复在线停留型主动消息到期后不触发的问题。
// 会不会影响其他文件：会，thread.js 后续需要调用 checkThreadProactiveMessages 才能自动检查触发。
// 更新记忆里该文件的导出函数：requestThreadAIReply(state, options) / checkThreadProactiveMessages(state, options) / requestProactiveThreadMessage(state, reason)
// 依赖：../../core/storage.js(getData,setData,generateId,getNow,setDB,deleteDB,getByIndexDB,getAllDB)；../../core/api.js(silentRequest)
