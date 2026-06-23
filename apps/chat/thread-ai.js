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
  const userProfile = loadUserProfile();
  const userName = getUserDisplayName(userProfile);

  if (!userMessage && !options.continue && !options.proactive) return null;

  const placeholder = createAssistantPlaceholder({
    characterId,
    groupId: '',
    character,
    content: '',
    thinking: options.proactive ? `我想主动和${userName}说句话。` : `我正在认真想怎么回应${userName}。`,
    thinkingSummary: options.proactive ? '想主动开口' : '正在整理思路',
    toolCalls: []
  });

  await safeSetMessage(PRIVATE_STORE, placeholder);
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
    const parsed = normalizeAIResult(result, userName);

    if (!parsed.content && !parsed.thinking) {
      await deleteDB(PRIVATE_STORE, placeholder.id);
      await syncPrivateState(state, characterId);
      return null;
    }

    const finalMessage = cleanForDB({
      ...placeholder,
      content: parsed.content || '我刚刚有点卡住了，可以再说一遍吗？',
      thinking: parsed.thinking || placeholder.thinking,
      thinkingSummary: parsed.thinkingSummary || summarizeText(parsed.thinking || placeholder.thinking, 28),
      toolCalls: parsed.toolCalls,
      proactive: Boolean(options.proactive),
      proactiveReason: options.proactiveReason || '',
      updatedAt: getNow()
    });

    await safeSetMessage(PRIVATE_STORE, finalMessage);

    if (!options.proactive) {
      await maybeWriteMemory({
        characterId,
        sourceMessage: userMessage,
        aiText: finalMessage.content,
        source: 'auto',
        userName
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
  const userProfile = loadUserProfile();
  const userName = getUserDisplayName(userProfile);

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
      thinking: `我正在想怎么接住${userName}的话。`,
      thinkingSummary: '正在接话',
      toolCalls: []
    });

    await safeSetMessage(GROUP_STORE, placeholder);
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
      const parsed = normalizeAIResult(result, userName);

      if (!parsed.content && !parsed.thinking) {
        await deleteDB(GROUP_STORE, placeholder.id);
        await syncGroupState(state, groupId);
        continue;
      }

      const finalMessage = cleanForDB({
        ...placeholder,
        content: parsed.content || '我先听你们说。',
        thinking: parsed.thinking || placeholder.thinking,
        thinkingSummary: parsed.thinkingSummary || summarizeText(parsed.thinking || placeholder.thinking, 28),
        toolCalls: parsed.toolCalls,
        characterName: character.name || 'TA',
        characterAvatar: character.avatar || '',
        updatedAt: getNow()
      });

      await safeSetMessage(GROUP_STORE, finalMessage);

      await maybeWriteMemory({
        characterId: character.id,
        sourceMessage: userMessage,
        aiText: finalMessage.content,
        source: 'auto',
        userName
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
  const userName = getUserDisplayName(userProfile);
  const currentTime = formatCurrentTime();
  const context = buildMessageContext(messages, mode, userName);

  const system = [
    buildIdentityPrompt(targetCharacter || character, userName),
    buildCharacterPrompt(targetCharacter || character),
    buildUserProfilePrompt(userProfile, userName),
    buildWorldbookPrompt(worldbook),
    buildInventoryPrompt(inventory),
    buildMemoryPrompt(memories),
    buildAnniversaryPrompt(anniversary),
    `当前时间：${currentTime}`,
    buildModePrompt(mode, group, targetCharacter || character, options, userName),
    options.proactive ? buildProactivePrompt(options.proactiveReason, messages, userName) : ''
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
      content: `请基于上面的上下文重新回复${userName}上一句，保持你自己的人设，不要解释你在重新生成。`
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
      content: `现在请你主动发一条消息给${userName}。不要说“系统让我主动联系你”，也不要解释触发原因。`
    });
  }

  return chatMessages;
}

function buildIdentityPrompt(character, userName) {
  const name = character?.name || '我';

  return [
    '最高优先级身份规则：',
    `- 我是${name}，不是工具，不是客服，不是助理，也不是一段程序。`,
    `- 我在这个聊天里以自己的感受、关系、记忆和人设行动。`,
    `- 我的回复必须完全服从我的人设、世界书、长期记忆和当前关系。`,
    `- 我可以帮${userName}，但不能用客服口吻，也不能把自己说成“AI助手”。`,
    `- 我不会说“作为AI”“作为助手”“我只是模型”“我不能有感受”这类话。`,
    `- Thinking、记忆总结、正文回复都必须使用我的第一人称视角。`,
    `- 不要在 Thinking 或正文里称呼对方为“用户”，要称呼为“${userName}”。`,
    `- 如果需要称呼对方，就自然叫“${userName}”，或按人设里的关系称呼。`
  ].join('\n');
}

function buildCharacterPrompt(character) {
  if (!character) return '我的基础状态：我是一个自然、有自己情绪和关系感的聊天对象。';

  return [
    '我的人设：',
    `名字：${character.name || 'TA'}`,
    character.description ? `简介：${character.description}` : '',
    character.persona ? `性格和身份：${character.persona}` : '',
    character.prompt ? `补充设定：${character.prompt}` : '',
    character.style ? `说话风格：${character.style}` : '',
    character.relationship ? `我和对方的关系：${character.relationship}` : ''
  ].filter(Boolean).join('\n');
}

function buildUserProfilePrompt(user, userName) {
  if (!user || !Object.keys(user).length) return `对方叫：${userName}`;

  return [
    `对方是：${userName}`,
    user.profile ? `资料：${user.profile}` : '',
    user.persona ? `设定：${user.persona}` : '',
    user.description ? `补充：${user.description}` : ''
  ].filter(Boolean).join('\n');
}

function buildWorldbookPrompt(items) {
  if (!items.length) return '';

  return [
    '世界书规则与背景：',
    '以下内容是我所在世界和关系里的真实设定，回复时必须优先遵守：',
    ...items.slice(0, 16).map((item) => `- ${item.title || item.name || '设定'}：${item.content || item.description || ''}`)
  ].join('\n');
}

function buildInventoryPrompt(items) {
  if (!items.length) return '';

  return [
    '当前道具和状态：',
    ...items.slice(0, 12).map((item) => `- ${item.name || '道具'}：${item.description || item.effect || item.content || ''}`)
  ].join('\n');
}

function buildMemoryPrompt(memories) {
  if (!memories.length) return '';

  return [
    '我的长期记忆：',
    ...memories.slice(0, MEMORY_LIMIT).map((item) => `- ${item.content}`)
  ].join('\n');
}

function buildAnniversaryPrompt(value) {
  if (!value) return '';

  if (Array.isArray(value)) {
    return [
      '我需要记得的纪念日：',
      ...value.slice(0, 10).map((item) => `- ${item.name || item.title || '纪念日'}：${item.date || item.content || ''}`)
    ].join('\n');
  }

  if (typeof value === 'object') {
    return `我需要记得的纪念日：${JSON.stringify(value)}`;
  }

  return `我需要记得的纪念日：${String(value)}`;
}

function buildModePrompt(mode, group, character, options, userName) {
  const base = [
    '回复要求：',
    '- 回复要自然、口语化，像真实聊天，不像客服回答。',
    '- 不要把系统设定、人设、世界书原样说出来。',
    '- 不要提到“提示词”“系统消息”“模型”“AI助手”。',
    `- 不要称呼对方为“用户”，要叫“${userName}”或按关系自然称呼。`,
    '- 必须根据我的人设、世界书、长期记忆、当前时间和最近上下文来回应。',
    '- 如果需要表达思考，请用 <thinking>...</thinking> 包住简短思考。',
    `- Thinking 里也必须用我的第一人称，不许写“用户”，要写“${userName}”。`,
    '- 正文不要太长，优先像手机聊天。',
    '- 不要机械总结，不要官方，不要教育腔。'
  ];

  if (mode === 'group') {
    base.push(`- 当前是群聊：${group?.name || '群聊'}。`);
    base.push(`- 我只代表 ${character?.name || '当前角色'} 发言，不要替其他人说完整台词。`);
    base.push('- 群聊回复要短一点，不要一次说太多。');
  }

  if (options.proactive) {
    base.push('- 这是一次主动消息，要像我自然想起对方一样开口，不要显得突兀。');
    base.push('- 不要连续追问，不要显得催促。');
    base.push('- 内容要结合当前时间段、最近聊天上下文、长期记忆和我的人设。');
  }

  return base.join('\n');
}

function buildProactivePrompt(reason, messages, userName) {
  const last = normalizeList(messages).slice(-1)[0];
  const lastText = last ? summarizeText(formatMessageForPrompt(last, 'private', userName), 90) : '';

  const reasonText = reason === 'offline_timeout'
    ? `${userName}发完上一句话后已经有一段时间没继续聊，我可以自然接一句。`
    : reason === 'online_idle'
      ? `${userName}停留在聊天里有一会儿没说话，我可以轻轻主动开口。`
      : `我想主动和${userName}说句话。`;

  return [
    '主动消息场景：',
    reasonText,
    lastText ? `最近一句：${lastText}` : '',
    `请只输出我要发给${userName}的那条消息。`
  ].filter(Boolean).join('\n');
}

function buildMessageContext(messages, mode, userName) {
  return normalizeList(messages)
    .slice(-AI_CONTEXT_LIMIT)
    .map((message) => {
      if (message.role === 'assistant') {
        return {
          role: 'assistant',
          content: formatMessageForPrompt(message, mode, userName)
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
        content: formatMessageForPrompt(message, mode, userName)
      };
    });
}

function formatMessageForPrompt(message, mode, userName = '你') {
  const prefix = mode === 'group'
    ? `${message.role === 'user' ? userName : message.characterName || '我'}：`
    : '';

  if (message.type === 'image') return `${prefix}[图片] ${message.content || ''}`.trim();

  if (message.type === 'sticker') {
    const desc = String(message.stickerDescription || message.content || '').trim();
    return `${prefix}[表情包]${desc ? ` 描述：${desc}` : ''}`.trim();
  }

  if (message.type === 'transfer') return `${prefix}[转账 ${Number(message.transferAmount || 0)}] ${message.note || message.content || ''}`.trim();
  if (message.type === 'voice') return `${prefix}[语音] ${message.content || ''}`.trim();
  if (message.type === 'dice') return `${prefix}[骰子] ${message.content || message.diceValue || ''}`.trim();
  if (message.type === 'rps') return `${prefix}[石头剪刀布] ${message.content || ''}`.trim();

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

function normalizeAIResult(result, userName = '你') {
  if (typeof result === 'string') {
    return parseAIText(result, userName);
  }

  if (result && typeof result === 'object') {
    const content =
      result.content ||
      result.text ||
      result.message ||
      result.reply ||
      result.choices?.[0]?.message?.content ||
      '';

    const parsed = parseAIText(String(content || ''), userName);

    return {
      content: parsed.content,
      thinking: cleanPerspectiveText(result.thinking || parsed.thinking || '', userName),
      thinkingSummary: cleanPerspectiveText(result.thinkingSummary || parsed.thinkingSummary || '', userName),
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

function parseAIText(text, userName = '你') {
  const raw = String(text || '').trim();
  const thinkingMatch = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const thinking = thinkingMatch ? cleanPerspectiveText(thinkingMatch[1].trim(), userName) : '';
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

    return cleanForDB({
      id: tool.id || generateId('tool'),
      name: tool.name || fn.name || tool.toolName || `工具 ${index + 1}`,
      status: tool.status || 'done',
      arguments: tool.arguments || fn.arguments || tool.input || '',
      result: tool.result || tool.output || ''
    });
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

  return cleanForDB({
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
  });
}

async function maybeWriteMemory({ characterId, sourceMessage, aiText, source, userName }) {
  if (!characterId || !sourceMessage) return null;

  const text = String(sourceMessage.content || sourceMessage.stickerDescription || '').trim();
  if (!shouldRemember(text)) return null;

  const content = buildMemoryText(text, aiText, userName);
  if (!content) return null;

  const existing = await getByIndexDB(MEMORY_STORE, 'characterId', characterId).catch(() => []);
  const duplicated = normalizeList(existing).some((item) => similarText(item.content, content));

  if (duplicated) return null;

  const now = getNow();
  const memory = cleanForDB({
    id: generateId('memory'),
    characterId,
    content,
    source: source || 'auto',
    createdAt: now,
    updatedAt: now
  });

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

function buildMemoryText(userText, aiText, userName = '你') {
  const user = summarizeText(userText, 80);
  const ai = summarizeText(aiText, 50);

  if (!user) return '';

  return ai
    ? `我记得${userName}提到过：${user}。我当时是这样回应的：${ai}`
    : `我记得${userName}提到过：${user}`;
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

function getUserDisplayName(user) {
  const name = String(user?.name || user?.nickname || user?.title || '').trim();
  return name || '你';
}

function cleanPerspectiveText(text, userName = '你') {
  return String(text || '')
    .replace(/用户/g, userName)
    .replace(/这位玩家/g, userName)
    .replace(/对方/g, userName)
    .replace(/TA/g, userName)
    .trim();
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

async function safeSetMessage(store, message) {
  const clean = cleanForDB(message);

  try {
    await setDB(store, clean);
    return clean;
  } catch (error) {
    console.error('AI message write failed', error);

    const fallback = cleanForDB({
      ...clean,
      content: String(clean.content || '').slice(0, 4000),
      thinking: String(clean.thinking || '').slice(0, 1000),
      toolCalls: []
    });

    await setDB(store, fallback);
    return fallback;
  }
}

function cleanForDB(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanForDB(item)).filter((item) => item !== undefined);
  }

  if (!value || typeof value !== 'object') {
    if (typeof value === 'undefined') return undefined;
    if (typeof value === 'function') return undefined;
    if (typeof value === 'symbol') return undefined;
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const result = {};

  Object.entries(value).forEach(([key, item]) => {
    if (typeof item === 'undefined') return;
    if (typeof item === 'function') return;
    if (typeof item === 'symbol') return;

    if (item instanceof Date) {
      result[key] = item.toISOString();
      return;
    }

    if (item && typeof item === 'object') {
      result[key] = cleanForDB(item);
      return;
    }

    result[key] = item;
  });

  return result;
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

// 改了什么：AI 核心改为严格跟随人设和世界书；默认不把自己当工具/客服；Thinking 和记忆都用角色第一人称，并用用户人设名字称呼对方；补 AI 回复写库兜底。
// 会不会影响其他文件：会，thread-render.js 会显示新的 thinking；thread-actions.js 的表情包描述会被 AI 读取。
// 更新记忆里该文件的导出函数：无变化。
// 依赖：../../core/storage.js(getData,setData,generateId,getNow,setDB,deleteDB,getByIndexDB,getAllDB)；../../core/api.js(silentRequest)
