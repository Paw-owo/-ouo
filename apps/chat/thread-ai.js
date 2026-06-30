// apps/chat/thread-ai.js
// imports:
//   from '../../core/storage.js': getData, setData, generateId, getNow, setDB, deleteDB, getByIndexDB, getAllDB, getDB
//   from '../../core/api.js': callAPI
//   from '../../core/memory.js': buildMemoryPrompt, checkImportantInfo, checkAndSummarize
//   from './identity-core.js': getIdentityCore
//   from './thread-ai-local.js': tryLocalOrSiliconFlowReply

import {
  getData,
  setData,
  generateId,
  getNow,
  setDB,
  deleteDB,
  getByIndexDB,
  getAllDB,
  getDB
} from '../../core/storage.js';

import { callAPI } from '../../core/api.js';

import {
  buildMemoryPrompt as buildCoreMemoryPrompt,
  checkImportantInfo,
  checkAndSummarize
} from '../../core/memory.js';

import { getIdentityCore } from './identity-core.js';

import { tryLocalOrSiliconFlowReply } from './thread-ai-local.js';

// ═══════════════════════════════════════
// 基础配置
// ═══════════════════════════════════════

const PRIVATE_STORE = 'messages';
const GROUP_STORE = 'group_messages';
const GRUDGE_STORE = 'grudges';
const PUNISHMENT_STORE = 'punishments';
const LOCK_STORE = 'relationship_locks';

const AI_CONTEXT_LIMIT = 28;
const GROUP_REPLY_MAX = 3;
const GRUDGE_TRIGGER_SCORE = 5;

const activeAIJobs = new Map();

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
  readAt: null,
  memoryInjectLimit: 12,
  memoryCandidateLimit: 80
};

const PUNISHMENT_POOL = [
  { type: 'cooldown', title: '冷战几分钟', description: '我现在不太想马上理人。倒计时结束前，我会先保持距离，等对方好好想想怎么哄我。', lockType: 'cooldown', level: 2, minutes: 5, requiredCount: 1 },
  { type: 'apology', title: '认真道歉', description: '我想听到认真说清楚哪里错了、以后准备怎么补救。太敷衍的话，我会继续记着。', lockType: 'apology_required', level: 2, minutes: 10, requiredCount: 1 },
  { type: 'nickname', title: '叫我专属称呼', description: '我想听到连续三次好好叫我的专属称呼，然后我才考虑不继续冷着。', lockType: 'nickname_required', level: 2, minutes: 8, requiredCount: 3 },
  { type: 'blackout', title: '假装拉黑', description: '我会先从聊天列表里消失一小会儿。不是彻底离开，只是我真的有点不想出现。', lockType: 'soft_block', level: 3, minutes: 6, requiredCount: 1 },
  { type: 'ultimatum', title: '最后解释机会', description: '我只给一次认真解释的机会。说得真诚，我就回来；继续敷衍，我会把冷战延长。', lockType: 'ultimatum', level: 4, minutes: 12, requiredCount: 1 }
];

const FRIENDLY_ERROR_MAP = {
  400: '这波啊，这波是格式没整对，',
  401: '没key就想进？急了急了。',
  402: '余额不足，快去氪金。',
  403: '没权限，典重典。',
  404: '你要的东西跑路了，awsl。',
  408: '请求超时，摆烂了。',
  429: '冲太猛了，能不能发慢点啊你。',
  500: '这服务器炸了宝宝呜呜...',
  502: '服务器上游发来一串梦话。',
  503: '服务器在卷，排队中。',
  504: '上游睡死，喊不醒。'
};

function getFriendlyErrorMessage(status) {
  if (Number(status) === 0) return '网络好像断了，检查一下连接？';
  return FRIENDLY_ERROR_MAP[Number(status)] || '我刚刚出了点小状况，再说一遍试试？';
}

// ═══════════════════════════════════════
// 公开接口
// ═══════════════════════════════════════

export async function requestThreadAIReply(state, options = {}) {
  if (!state) return null;
  if (state.mode === 'group') return requestGroupReply(state, options);
  return requestPrivateReply(state, options);
}

export async function stopThreadAIReply(state, options = {}) {
  if (!state) return false;
  const key = getAIJobKey(state);
  const job = activeAIJobs.get(key);
  state.aiGenerating = false;
  state.isSending = false;
  if (!job) return false;
  job.stopped = true;
  job.stoppedAt = getNow();
  try { job.controller?.abort?.(); } catch (_) {}
  await markJobPlaceholdersStopped(job, options.message || '我先停在这里了。');
  if (state.mode === 'group') {
    await syncGroupState(state, state.groupId || job.groupId || '');
  } else {
    await syncPrivateState(state, state.characterId || job.characterId || '');
  }
  activeAIJobs.delete(key);
  return true;
}

export async function checkThreadProactiveMessages(state, options = {}) {
  if (!state || state.mode === 'group') return null;
  const character = state.character;
  const characterId = character?.id || state.characterId;
  if (!characterId) return null;
  if (document.visibilityState !== 'visible') return null;
  const activeLock = await getActiveRelationshipLock(characterId);
  if (activeLock && ['soft_block', 'cooldown', 'ultimatum'].includes(activeLock.type)) return null;
  const config = getChatConfig(characterId);
  const messages = await loadPrivateMessages(characterId);
  const last = messages[messages.length - 1] || null;
  if (!last) return null;
  const now = Date.now();
  const lastTime = new Date(last.timestamp || last.createdAt || 0).getTime();
  if (!lastTime) return null;
  await markUserReplyIfNeeded(characterId, config, last);
  const refreshedConfig = getChatConfig(characterId);
  if (refreshedConfig.proactiveAwaitingUserReply) return null;
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
  return null;
}

export async function requestProactiveThreadMessage(state, reason = 'manual') {
  if (!state || state.mode === 'group') return null;
  const characterId = state.character?.id || state.characterId;
  if (!characterId) return null;
  const activeLock = await getActiveRelationshipLock(characterId);
  if (activeLock && ['soft_block', 'cooldown', 'ultimatum'].includes(activeLock.type)) return null;
  return sendProactivePrivateMessage(state, {
    reason,
    config: getChatConfig(characterId),
    incrementUnread: true
  });
}

// ═══════════════════════════════════════
// AI 任务管理
// ═══════════════════════════════════════

function getAIJobKey(state) {
  if (!state) return 'ai-job:empty';
  if (state.mode === 'group') return `ai-job:group:${state.groupId || state.group?.id || 'none'}`;
  return `ai-job:private:${state.characterId || state.character?.id || 'none'}`;
}

function startAIJob(state, options = {}) {
  const key = getAIJobKey(state);
  const existing = activeAIJobs.get(key);
  if (existing) {
    try { existing.controller?.abort?.(); } catch (_) {}
    activeAIJobs.delete(key);
  }
  const controller = new AbortController();
  const job = {
    id: generateId('ai-job'),
    key,
    store: options.store || '',
    characterId: options.characterId || '',
    groupId: options.groupId || '',
    controller,
    placeholderIds: [],
    stopped: false,
    stoppedAt: null,
    startedAt: getNow()
  };
  activeAIJobs.set(key, job);
  return job;
}

function finishAIJob(state, job) {
  if (!job) return;
  if (activeAIJobs.get(job.key) === job) activeAIJobs.delete(job.key);
  state.aiGenerating = false;
  state.isSending = false;
}

function createAssistantPlaceholder({ characterId, groupId, character, content, thinking, thinkingSummary, toolCalls, isPending, status, replyToMessageId }) {
  return cleanForDB({
    id: generateId('msg'),
    role: 'assistant',
    type: 'text',
    characterId: characterId || character?.id || '',
    groupId: groupId || '',
    characterName: String(character?.name || character?.characterName || 'TA'),
    characterAvatar: String(character?.avatar || ''),
    content: String(content || ''),
    thinking: String(thinking || ''),
    thinkingSummary: String(thinkingSummary || ''),
    toolCalls: normalizeToolCalls(toolCalls),
    memoryWrites: [],
    grudgeWrites: [],
    quoteText: '',
    isPending: Boolean(isPending),
    isStopped: false,
    isError: false,
    status: String(status || 'pending'),
    versionStatus: 'active',
    replyToMessageId: String(replyToMessageId || ''),
    timestamp: getNow(),
    updatedAt: getNow()
  });
}

function isJobStopped(job) {
  return Boolean(job?.stopped);
}

function isAbortError(error) {
  if (!error) return false;
  if (error.name === 'AbortError') return true;
  if (error.message && /abort/i.test(error.message)) return true;
  return false;
}

async function markJobPlaceholdersStopped(job, content = '我先停在这里了。') {
  if (!job || !Array.isArray(job.placeholderIds)) return;
  const message = String(content || '我先停在这里了。');
  await Promise.all(job.placeholderIds.map(async (id) => {
    await markMessageStopped(job.store, id, message).catch(() => {});
  }));
}

// ═══════════════════════════════════════
// 私聊回复（流式）
// ═══════════════════════════════════════

async function requestPrivateReply(state, options = {}) {
  const character = state.character;
  const characterId = character?.id || state.characterId;
  if (!characterId) return null;

  const job = startAIJob(state, { store: PRIVATE_STORE, characterId, groupId: '' });
  state.aiGenerating = true;

  const activeLock = await getActiveRelationshipLock(characterId);
  const messages = await loadPrivateMessages(characterId);
  const userMessage = getLastUserMessage(messages);
  const userProfile = loadUserProfileForCharacter(character);
  const userName = getUserDisplayName(userProfile);

  if (!userMessage && !options.continue && !options.proactive) {
    finishAIJob(state, job);
    return null;
  }

  const replyToMessageId = options.replyToMessageId || (options.regenerate ? (userMessage?.id || '') : '');

  const placeholder = createAssistantPlaceholder({
    characterId,
    groupId: '',
    character,
    content: '',
    thinking: options.proactive ? `我想主动和${userName}说句话。` : `我正在认真想怎么回应${userName}。`,
    thinkingSummary: options.proactive ? '想主动开口' : '正在整理思路',
    toolCalls: [],
    isPending: true,
    status: 'pending',
    replyToMessageId
  });

  job.placeholderIds.push(placeholder.id);

  await safeSetMessage(PRIVATE_STORE, placeholder);
  await syncPrivateState(state, characterId);
  state.renderOnly?.();

  let streamTimer = null;
  let streamedContent = '';
  let streamedThinking = '';

  const flushStreamUpdate = async () => {
    if (streamTimer) { window.clearTimeout(streamTimer); streamTimer = null; }
    await updatePlaceholderStream(PRIVATE_STORE, placeholder.id, streamedContent, streamedThinking, state);
  };

  try {
    const promptMessages = await buildPrompt({
      mode: 'private',
      character,
      group: null,
      messages,
      targetCharacter: character,
      options: { ...options, activeLock }
    });

    let result = null;

    try {
      result = await requestAIText(promptMessages, {
        signal: job.controller.signal,
        character,
        fallbackToLocal: true,
        state,
        messages,
        userName,
        onChunk: (chunk) => {
          streamedContent += chunk.content || '';
          streamedThinking = appendValue(streamedThinking, chunk.thinking);
          state.updateMessageContent?.(placeholder.id, streamedContent, streamedThinking);
          if (streamTimer) window.clearTimeout(streamTimer);
          streamTimer = window.setTimeout(flushStreamUpdate, 120);
        }
      });
    } catch (apiError) {
      await flushStreamUpdate();

      if (isAbortError(apiError) || isJobStopped(job)) {
        await markMessageStopped(PRIVATE_STORE, placeholder.id, '我先停在这里了。');
        await syncPrivateState(state, characterId);
        state.renderOnly?.();
        return null;
      }

      result = await tryLocalOrSiliconFlowReply(state, { messages, userName, signal: job.controller.signal });

      if (!result) {
        const friendlyMessage = getFriendlyErrorMessage(apiError?.status || 0);
        await markMessageError(PRIVATE_STORE, placeholder.id, friendlyMessage);
        await syncPrivateState(state, characterId);
        state.renderOnly?.();
        return null;
      }
    } finally {
      await flushStreamUpdate();
    }

    const parsed = normalizeAIResult(result, userName);

    if (!parsed.content && !parsed.thinking) {
      await deleteDB(PRIVATE_STORE, placeholder.id);
      await syncPrivateState(state, characterId);
      state.renderOnly?.();
      return null;
    }

    const memoryMessages = [...messages, placeholder];
    const memoryResult = await runMemoryTasks(characterId, memoryMessages, { character, userProfile, callName: userName });
    const grudge = await maybeWriteGrudge({ character, sourceMessage: userMessage, aiText: parsed.content || '', activeLock });

    const finalMessage = cleanForDB({
      ...placeholder,
      content: parsed.content || '我刚才有点卡住了',
      thinking: parsed.thinking || placeholder.thinking,
      thinkingSummary: parsed.thinkingSummary || summarizeText(parsed.thinking || placeholder.thinking, 28),
      toolCalls: parsed.toolCalls,
      memoryWrites: memoryResult.memoryWrites || [],
      grudgeWrites: grudge ? [grudge] : [],
      proactive: Boolean(options.proactive),
      proactiveReason: options.proactiveReason || '',
      relationshipLockId: activeLock?.id || '',
      isPending: false,
      isStopped: false,
      status: 'done',
      updatedAt: getNow()
    });

    await safeSetMessage(PRIVATE_STORE, finalMessage);

    if (!parsed.thinking) {
      generateInnerMonologue({ character, store: PRIVATE_STORE, messageId: finalMessage.id, recentMessages: memoryMessages.slice(-6), aiContent: finalMessage.content, userName, state });
    }

    await syncPrivateState(state, characterId);
    state.renderOnly?.();

    if (options.proactive) {
      markProactiveSent(characterId);
      await updateUnreadCount(characterId, options.incrementUnread === false ? 0 : 1);
    } else {
      await markUserReplyIfNeeded(characterId, getChatConfig(characterId), userMessage);
      await updateUnreadCount(characterId, 0);
    }

    return finalMessage;
  } catch (error) {
    await flushStreamUpdate();

    if (isAbortError(error) || isJobStopped(job)) {
      await markMessageStopped(PRIVATE_STORE, placeholder.id, '我先停在这里了。');
      await syncPrivateState(state, characterId);
      state.renderOnly?.();
      return null;
    }

    await deleteDB(PRIVATE_STORE, placeholder.id).catch(() => {});
    await syncPrivateState(state, characterId);
    state.renderOnly?.();
    throw error;
  } finally {
    if (streamTimer) { window.clearTimeout(streamTimer); streamTimer = null; }
    finishAIJob(state, job);
  }
}

async function sendProactivePrivateMessage(state, options = {}) {
  return requestPrivateReply(state, {
    proactive: true,
    proactiveReason: options.reason || 'proactive',
    incrementUnread: options.incrementUnread !== false
  });
}

// ═══════════════════════════════════════
// 群聊回复（流式）
// ═══════════════════════════════════════

async function requestGroupReply(state, options = {}) {
  const group = state.group;
  const groupId = group?.id || state.groupId;
  if (!groupId) return [];

  const job = startAIJob(state, { store: GROUP_STORE, characterId: '', groupId });
  state.aiGenerating = true;

  const groupMessages = await loadGroupMessages(groupId);
  const userMessage = getLastUserMessage(groupMessages);

  if (!userMessage && !options.continue) {
    finishAIJob(state, job);
    return [];
  }

  const members = await resolveGroupMembers(group);
  const speakers = chooseGroupSpeakers(members, groupMessages);
  const replies = [];

  try {
    for (const character of speakers) {
      if (isJobStopped(job)) break;

      const userProfile = loadUserProfileForCharacter(character);
      const userName = getUserDisplayName(userProfile);

      const placeholder = createAssistantPlaceholder({
        characterId: character.id,
        groupId,
        character,
        content: '',
        thinking: `我正在想怎么接住${userName}的话。`,
        thinkingSummary: '正在接话',
        toolCalls: [],
        isPending: true,
        status: 'pending',
        replyToMessageId: options.replyToMessageId || ''
      });

      job.placeholderIds.push(placeholder.id);

      await safeSetMessage(GROUP_STORE, placeholder);
      await syncGroupState(state, groupId);
      state.renderOnly?.();

      let streamTimer = null;
      let streamedContent = '';
      let streamedThinking = '';

      const flushStreamUpdate = async () => {
        if (streamTimer) { window.clearTimeout(streamTimer); streamTimer = null; }
        await updatePlaceholderStream(GROUP_STORE, placeholder.id, streamedContent, streamedThinking, state);
      };

      try {
        const promptMessages = await buildPrompt({
          mode: 'group',
          character,
          group,
          messages: groupMessages,
          targetCharacter: character,
          options
        });

        let result = null;

        try {
          result = await requestAIText(promptMessages, {
            signal: job.controller.signal,
            character,
            fallbackToLocal: true,
            state,
            messages: groupMessages,
            userName,
            onChunk: (chunk) => {
              streamedContent += chunk.content || '';
              streamedThinking = appendValue(streamedThinking, chunk.thinking);
              state.updateMessageContent?.(placeholder.id, streamedContent, streamedThinking);
              if (streamTimer) window.clearTimeout(streamTimer);
              streamTimer = window.setTimeout(flushStreamUpdate, 120);
            }
          });
        } catch (apiError) {
          await flushStreamUpdate();

          if (isAbortError(apiError) || isJobStopped(job)) {
            await markMessageStopped(GROUP_STORE, placeholder.id, '我先停在这里了。');
            await syncGroupState(state, groupId);
            break;
          }

          result = await tryLocalOrSiliconFlowReply(state, { messages: groupMessages, userName, signal: job.controller.signal });

          if (!result) {
            const friendlyMessage = getFriendlyErrorMessage(apiError?.status || 0);
            await markMessageError(GROUP_STORE, placeholder.id, friendlyMessage);
            await syncGroupState(state, groupId);
            continue;
          }
        } finally {
          await flushStreamUpdate();
        }

        const parsed = normalizeAIResult(result, userName);

        if (!parsed.content && !parsed.thinking) {
          await deleteDB(GROUP_STORE, placeholder.id);
          await syncGroupState(state, groupId);
          continue;
        }

        const memoryMessages = [...groupMessages, placeholder];
        const memoryResult = await runMemoryTasks(character.id, memoryMessages, { character, userProfile, callName: userName });
        const characterLock = await getActiveRelationshipLock(character.id);
        const grudge = await maybeWriteGrudge({ character, sourceMessage: userMessage, aiText: parsed.content || '', activeLock: characterLock });

        const finalMessage = cleanForDB({
          ...placeholder,
          content: parsed.content || '我先听你们说。',
          thinking: parsed.thinking || placeholder.thinking,
          thinkingSummary: parsed.thinkingSummary || summarizeText(parsed.thinking || placeholder.thinking, 28),
          toolCalls: parsed.toolCalls,
          memoryWrites: memoryResult.memoryWrites || [],
          grudgeWrites: grudge ? [grudge] : [],
          characterName: String(character.name || 'TA'),
          characterAvatar: String(character.avatar || ''),
          isPending: false,
          isStopped: false,
          status: 'done',
          updatedAt: getNow()
        });

        await safeSetMessage(GROUP_STORE, finalMessage);

        if (!parsed.thinking) {
          generateInnerMonologue({ character, store: GROUP_STORE, messageId: finalMessage.id, recentMessages: [...groupMessages, finalMessage].slice(-6), aiContent: finalMessage.content, userName, state });
        }

        replies.push(finalMessage);
      } catch (error) {
        await flushStreamUpdate();

        if (isAbortError(error) || isJobStopped(job)) {
          await markMessageStopped(GROUP_STORE, placeholder.id, '我先停在这里了。');
          await syncGroupState(state, groupId);
          break;
        }

        await deleteDB(GROUP_STORE, placeholder.id).catch(() => {});
        await syncGroupState(state, groupId);
        continue;
      } finally {
        if (streamTimer) { window.clearTimeout(streamTimer); streamTimer = null; }
      }
    }

    await syncGroupState(state, groupId);
    state.renderOnly?.();
    return replies;
  } finally {
    finishAIJob(state, job);
  }
}
// ═══════════════════════════════════════
// 内心独白
// ═══════════════════════════════════════

async function generateInnerMonologue({ character, store, messageId, recentMessages, aiContent, userName, state }) {
  try {
    const name = character?.name || '我';
    const callName = String(character?.nicknameForUser || '').trim() || userName;

    const contextText = normalizeList(recentMessages)
      .slice(-4)
      .map((msg) => {
        const speaker = msg.role === 'user' ? callName : (msg.characterName || name);
        return `${speaker}：${String(msg.content || '').slice(0, 120)}`;
      })
      .join('\n');

    const system = [
      `我是${name}，我刚刚回复了${callName}一句话。`,
      `我会在心里默默回想刚才那一刻的想法。`,
      character?.systemPrompt ? `我的人设：${String(character.systemPrompt).slice(0, 300)}` : '',
      character?.speakingStyle ? `我说话的风格：${character.speakingStyle}` : '',
      '',
      '要求：',
      `- 我用第一人称"我"来写，像${name}自己的内心独白`,
      `- 我写的是我刚才回复${callName}时心里闪过的一瞬间想法`,
      '- 我用简体中文',
      '- 我只写 1 到 3 句话，像心里一闪而过的念头',
      '- 我不写"用户"，不写分析报告，不写编号列表',
      '- 我像在自言自语，不是在写任务总结',
      '- 我可以提到自己的情绪、在意的事、对对方的感觉',
      '- 我不会提到提示词、系统、AI、模型、数据库'
    ].filter(Boolean).join('\n');

    const user = [
      contextText ? `刚才的对话：\n${contextText}` : '',
      `我刚才说：${String(aiContent || '').slice(0, 200)}`,
      '',
      `现在我会写出我刚才那一刻心里的独白。`
    ].filter(Boolean).join('\n');

    const promptMessages = [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ];

    const result = await requestAIText(promptMessages, {
      character,
      timeout: 12000,
      temperature: 0.8
    });

    const monologue = parseInnerMonologueResult(result, userName);
    if (!monologue) return;

    const existing = await getDB(store, messageId).catch(() => null);
    if (!existing) return;

    const updated = cleanForDB({
      ...existing,
      thinking: monologue,
      thinkingSummary: summarizeText(monologue, 28),
      updatedAt: getNow()
    });

    await setDB(store, updated);

    if (state) {
      if (store === PRIVATE_STORE && state.characterId) {
        await syncPrivateState(state, state.characterId);
      } else if (store === GROUP_STORE && state.groupId) {
        await syncGroupState(state, state.groupId);
      }
      state.renderOnly?.();
    }
  } catch (_) {
    // 静默失败
  }
}

function parseInnerMonologueResult(result, userName) {
  let text = '';

  if (typeof result === 'string') {
    text = result.trim();
  } else if (result && typeof result === 'object') {
    text = String(
      result.content ||
      result.text ||
      result.message ||
      result.reply ||
      result.choices?.[0]?.message?.content ||
      ''
    ).trim();
  }

  if (!text) return '';

  text = text.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '').trim();
  text = text.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '').trim();
  text = text.replace(/\*\*(.+?)\*\*/g, '$1').trim();

  if (text.length > 400) text = text.slice(0, 400);

  text = text.replace(/^内心独白[:：]?\s*/i, '').trim();
  text = text.replace(/^独白[:：]?\s*/i, '').trim();
  text = text.replace(/^想法[:：]?\s*/i, '').trim();

  text = cleanPerspectiveText(text, userName);

  return stripEmoji(text);
}

// ═══════════════════════════════════════
// AI 请求（流式 + 本地 fallback）
// ═══════════════════════════════════════

async function requestAIText(messages, options = {}) {
  const character = options.character || null;
  const signal = options.signal;
  const fallbackToLocal = options.fallbackToLocal !== false;
  const userName = options.userName || '你';
  const timeout = options.timeout || 60000;
  const temperature = options.temperature ?? Number(character?.apiConfig?.temperature ?? 0.85);
  const maxTokens = options.maxTokens ?? Math.round(Number(character?.apiConfig?.maxTokens || 1200));
  const onChunk = typeof options.onChunk === 'function' ? options.onChunk : null;

  const groupTypes = resolveGroupTypes(character);

  if (signal?.aborted) {
    throw Object.assign(new Error('已取消'), { status: 408, isAbort: true });
  }

  let lastApiError = null;

  try {
    const result = await callAPI({
      messages,
      systemPrompt: '',
      model: character?.apiConfig?.model || '',
      stream: true,
      groupTypes,
      timeout,
      temperature,
      maxTokens,
      signal,
      onChunk,
      onDone: options.onDone,
      onError: (error) => {
        if (error) {
          lastApiError = error;
          options.onError?.(error);
        }
      }
    });

    if (result && (result.content || result.thinking)) {
      return result;
    }

    // callAPI 返回了 null 但没有触发 onError，构造一个带 status 的错误
    if (!lastApiError) {
      const status = lastApiError?.status || lastApiError?.raw?.status || 0;
      lastApiError = new Error('接口没返回内容');
      lastApiError.status = status;
    }
  } catch (error) {
    if (isAbortError(error) || signal?.aborted) {
      throw Object.assign(new Error('已取消'), { status: 408, isAbort: true });
    }
    lastApiError = error;
  }

  // callAPI 失败或空结果，尝试本地 fallback
  if (fallbackToLocal) {
    try {
      const localResult = await tryLocalOrSiliconFlowReply(options.state, {
        messages: options.messages || messages,
        userName,
        signal
      });

      if (localResult && (localResult.content || localResult.thinking)) {
        return localResult;
      }
    } catch (localError) {
      if (!lastApiError) lastApiError = localError;
    }
  }

  // fallback 也失败了
  if (lastApiError) {
    const status = lastApiError.status || lastApiError?.raw?.status || 0;
    const error = new Error(lastApiError.message || 'AI 请求失败');
    error.status = status;
    throw error;
  }

  throw new Error('AI 请求失败，没有可用回复');
}

function resolveGroupTypes(character) {
  if (!character) return ['paid', 'free'];
  const apiConfig = character?.apiConfig || {};
  const poolGroup = apiConfig?.poolGroup || apiConfig?.groupType || '';
  if (poolGroup === 'paid') return ['paid'];
  if (poolGroup === 'free') return ['free'];
  if (poolGroup === 'all') return ['paid', 'free'];
  if (apiConfig?.useGlobal === false && apiConfig?.endpointId) return ['paid'];
  return ['paid', 'free'];
}

function normalizeAIResult(result, userName = '你') {
  if (typeof result === 'string') return parseAIText(result, userName);

  if (result && typeof result === 'object') {
    const content =
      result.content ||
      result.text ||
      result.message ||
      result.reply ||
      result.choices?.[0]?.message?.content ||
      '';

    const nativeThinking =
      result.thinking ||
      result.reasoning ||
      result.reasoningContent ||
      result.reasoning_content ||
      result.choices?.[0]?.message?.thinking ||
      result.choices?.[0]?.message?.reasoning ||
      result.choices?.[0]?.message?.reasoningContent ||
      result.choices?.[0]?.message?.reasoning_content ||
      '';

    const parsed = parseAIText(String(content || ''), userName);
    const thinking = nativeThinking
      ? cleanPerspectiveText(String(nativeThinking || ''), userName)
      : parsed.thinking;

    return {
      content: stripEmoji(parsed.content),
      thinking: stripEmoji(thinking),
      thinkingSummary: summarizeText(thinking, 28),
      toolCalls: normalizeToolCalls(result.toolCalls || result.tools || result.choices?.[0]?.message?.tool_calls || [])
    };
  }

  return { content: '', thinking: '', thinkingSummary: '', toolCalls: [] };
}

function parseAIText(text, userName = '你') {
  const raw = String(text || '').trim();
  const thinkingMatch =
    raw.match(/<think\b[^>]*>([\s\S]*?)<\/think>/i) ||
    raw.match(/<thinking\b[^>]*>([\s\S]*?)<\/thinking>/i);

  const thinking = thinkingMatch
    ? cleanPerspectiveText(thinkingMatch[1].trim(), userName)
    : '';

  const content = thinkingMatch
    ? raw.replace(thinkingMatch[0], '').trim()
    : raw;

  return {
    content: stripEmoji(content),
    thinking: stripEmoji(thinking),
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

// ═══════════════════════════════════════
// 流式占位更新
// ═══════════════════════════════════════

async function updatePlaceholderStream(store, id, content, thinking, state) {
  if (!store || !id) return;

  const message = await getMessageByIdFromStore(store, id).catch(() => null);
  if (!message) return;

  const next = cleanForDB({
    ...message,
    content: String(content || ''),
    thinking: String(thinking || ''),
    isPending: true,
    status: 'streaming',
    updatedAt: getNow()
  });

  await safeSetMessage(store, next);

  if (store === PRIVATE_STORE && state?.characterId) {
    await syncPrivateState(state, state.characterId);
  } else if (store === GROUP_STORE && state?.groupId) {
    await syncGroupState(state, state.groupId);
  }
}

function appendValue(base, value) {
  if (!value) return base;
  return base ? `${base}\n${value}` : value;
}

// ═══════════════════════════════════════
// 记忆任务
// ═══════════════════════════════════════

async function runMemoryTasks(characterId, messages, options = {}) {
  if (!characterId) return { memoryWrites: [] };

  const character = options.character || await getDB('characters', characterId).catch(() => null);
  const userProfile = options.userProfile || loadUserProfileForCharacter(character);
  const callName = options.callName || getUserDisplayName(userProfile);

  const memoryWrites = [];

  try {
    const infoResult = await checkImportantInfo(characterId, messages, { character, userProfile, callName });
    const items = Array.isArray(infoResult) ? infoResult : [];

    items.forEach((item) => {
      if (!item || typeof item !== 'object') return;
      memoryWrites.push({
        title: item.title || '记下一件事',
        content: item.content || item.text || item.summary || '',
        action: item.action || 'add',
        timestamp: getNow()
      });
    });
  } catch (error) {
    console.warn('[chat-thread-ai] checkImportantInfo failed:', error);
  }

  try {
    await checkAndSummarize(characterId, { character, userProfile, callName });
  } catch (error) {
    console.warn('[chat-thread-ai] checkAndSummarize failed:', error);
  }

  return { memoryWrites };
}

// ═══════════════════════════════════════
// 消息状态更新
// ═══════════════════════════════════════

async function markMessageStopped(store, id, content) {
  if (!store || !id) return null;

  const message = await getMessageByIdFromStore(store, id).catch(() => null);
  if (!message) return null;

  const next = cleanForDB({
    ...message,
    content: String(content || '我先停在这里了。'),
    isPending: false,
    isStopped: true,
    isError: false,
    status: 'stopped',
    thinking: message.thinking || '我刚刚被打断了，先把话停住。',
    thinkingSummary: message.thinkingSummary || '已停止',
    updatedAt: getNow()
  });

  await setDB(store, next);
  return next;
}

async function markMessageError(store, id, content) {
  if (!store || !id) return null;

  const message = await getMessageByIdFromStore(store, id).catch(() => null);
  if (!message) return null;

  const next = cleanForDB({
    ...message,
    content: String(content || '我刚刚出了点小状况'),
    isPending: false,
    isStopped: false,
    isError: true,
    status: 'error',
    thinking: '',
    thinkingSummary: '',
    updatedAt: getNow()
  });

  await setDB(store, next);
  return next;
}

async function getMessageByIdFromStore(store, id) {
  const list = await getAllDB(store).catch(() => []);
  return normalizeList(list).find((item) => item.id === id) || null;
}

// ═══════════════════════════════════════
// 记仇系统
// ═══════════════════════════════════════

async function maybeWriteGrudge({ character, sourceMessage, aiText, activeLock }) {
  const settings = getData('app_grudge_settings') || {};
  if (settings.enabled === false) return null;

  const characterId = character?.id || sourceMessage?.characterId || '';
  if (!characterId || !sourceMessage || sourceMessage.role !== 'user') return null;

  const text = String(sourceMessage.content || sourceMessage.note || sourceMessage.stickerDescription || '').trim();
  const ai = String(aiText || '').trim();

  const hit = detectGrudgeSignal(text, ai, activeLock);
  if (!hit) return null;

  const recent = await getByIndexDB(GRUDGE_STORE, 'characterId', characterId).catch(() => []);
  const duplicated = normalizeList(recent)
    .filter((item) => item.status === 'active')
    .some((item) => similarText(item.reason, hit.reason));

  if (duplicated) return null;

  const now = getNow();
  const grudge = cleanForDB({
    id: generateId('grudge'),
    characterId,
    characterName: String(character?.name || sourceMessage.characterName || 'TA'),
    reason: hit.reason,
    mood: hit.mood,
    severity: hit.severity,
    status: 'active',
    source: 'chat',
    linkedType: 'message',
    linkedId: sourceMessage.id || '',
    punishmentId: '',
    createdAt: now,
    updatedAt: now
  });

  await setDB(GRUDGE_STORE, grudge);
  await maybeTriggerPunishment(character, grudge);
  return grudge;
}

function detectGrudgeSignal(userText, aiText, activeLock) {
  const text = String(userText || '').toLowerCase();
  const ai = String(aiText || '').toLowerCase();
  const joined = `${text}\n${ai}`;

  const apologyWords = ['对不起', '抱歉', '我错了', '哄你', '别生气', '原谅'];
  if (apologyWords.some((word) => joined.includes(word)) && !activeLock) return null;

  const seriousHits = ['闭嘴', '烦死', '滚', '讨厌你', '不想理你', '删了你', '拉黑你', '你算什么', '无所谓', '随便你', '别来烦我'];
  const mediumHits = ['忘了', '没空', '下次再说', '你别闹', '你好麻烦', '懒得', '敷衍', '哦', '嗯', '随便'];
  const aiMoodHits = ['我有点不开心', '我不太开心', '我生气', '我会记住', '我记下了', '我先不理', '我不想理', '我有点难过', '我委屈'];

  if (seriousHits.some((word) => text.includes(word))) {
    return { reason: summarizeText(userText, 90), mood: '真的被气到了', severity: 3 };
  }

  if (aiMoodHits.some((word) => ai.includes(word))) {
    return { reason: summarizeText(userText || aiText, 90), mood: '闷闷不乐', severity: activeLock ? 2 : 1 };
  }

  if (mediumHits.some((word) => text.includes(word)) && text.length <= 24) {
    return { reason: summarizeText(userText, 90), mood: '有点被敷衍', severity: 1 };
  }

  return null;
}

async function maybeTriggerPunishment(character, latestGrudge) {
  const characterId = character?.id || latestGrudge?.characterId || '';
  if (!characterId) return null;

  const activeLock = await getActiveRelationshipLock(characterId);
  if (activeLock) return null;

  const all = await getByIndexDB(GRUDGE_STORE, 'characterId', characterId).catch(() => []);
  const active = normalizeList(all).filter((item) => item.status === 'active').sort(sortByUpdatedAtDesc);
  const score = active.reduce((sum, item) => sum + Number(item.severity || 1), 0);

  if (score < GRUDGE_TRIGGER_SCORE) return null;

  const selected = choosePunishment(score);
  const now = getNow();
  const endsAt = new Date(Date.now() + selected.minutes * 60 * 1000).toISOString();

  const punishment = cleanForDB({
    id: generateId('punishment'),
    characterId,
    characterName: String(character?.name || latestGrudge.characterName || 'TA'),
    title: selected.title,
    description: selected.description,
    type: selected.type,
    status: 'pending',
    requiredCount: selected.requiredCount,
    currentCount: 0,
    grudgeScore: score,
    createdAt: now,
    updatedAt: now
  });

  await setDB(PUNISHMENT_STORE, punishment);

  const lock = cleanForDB({
    id: generateId('lock'),
    characterId,
    characterName: String(character?.name || latestGrudge.characterName || 'TA'),
    type: selected.lockType,
    status: 'active',
    level: selected.level,
    title: selected.title,
    reason: selected.description,
    startsAt: now,
    endsAt,
    punishmentId: punishment.id,
    createdAt: now,
    updatedAt: now
  });

  await setDB(LOCK_STORE, lock);

  const updated = active.map((item) => ({ ...item, punishmentId: punishment.id, updatedAt: now }));
  await Promise.all(updated.map((item) => setDB(GRUDGE_STORE, item)));

  window.AppEvents?.emit?.('grudge:punishment', { characterId, punishment, lock });

  return { punishment, lock };
}

function choosePunishment(score) {
  if (score >= 10) return PUNISHMENT_POOL.find((item) => item.type === 'ultimatum') || PUNISHMENT_POOL[0];
  if (score >= 8) return PUNISHMENT_POOL.find((item) => item.type === 'blackout') || PUNISHMENT_POOL[0];
  return PUNISHMENT_POOL[Math.floor(Math.random() * Math.min(3, PUNISHMENT_POOL.length))];
}

// ═══════════════════════════════════════
// 关系锁
// ═══════════════════════════════════════

async function loadGrudgeContext(characterId) {
  if (!characterId) return { score: 0, entries: [], punishment: null, lock: null };
  const grudges = await getByIndexDB(GRUDGE_STORE, 'characterId', characterId).catch(() => []);
  const active = normalizeList(grudges).filter((item) => item.status === 'active').sort(sortByUpdatedAtDesc);
  const score = active.reduce((sum, item) => sum + Number(item.severity || 1), 0);
  const lock = await getActiveRelationshipLock(characterId);
  const punishment = lock?.punishmentId ? await getPunishment(lock.punishmentId) : await getLatestActivePunishment(characterId);
  return { score, entries: active, punishment, lock };
}

async function getActiveRelationshipLock(characterId) {
  if (!characterId) return null;
  const locks = await getByIndexDB(LOCK_STORE, 'characterId', characterId).catch(() => []);
  const now = Date.now();
  const active = normalizeList(locks).filter((item) => item.status === 'active').sort(sortByUpdatedAtDesc);
  for (const lock of active) {
    const endsAt = new Date(lock.endsAt || 0).getTime();
    if (endsAt && endsAt <= now) {
      await setDB(LOCK_STORE, { ...lock, status: 'expired', updatedAt: getNow() });
      continue;
    }
    return lock;
  }
  return null;
}

async function getPunishment(id) {
  if (!id) return null;
  const list = await getAllDB(PUNISHMENT_STORE).catch(() => []);
  return normalizeList(list).find((item) => item.id === id) || null;
}

async function getLatestActivePunishment(characterId) {
  const list = await getByIndexDB(PUNISHMENT_STORE, 'characterId', characterId).catch(() => []);
  return normalizeList(list).filter((item) => item.status === 'pending').sort(sortByUpdatedAtDesc)[0] || null;
}
// ═══════════════════════════════════════
// 数据加载
// ═══════════════════════════════════════

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

async function loadWorldbookForCharacter(character) {
  const list = await getAllDB('worldbook').catch(() => []);
  const all = normalizeList(list).filter((item) => item.enabled !== false);
  if (!character?.id) return all;
  const ids = normalizeList(character.worldbookIds).map(String);
  const mode = character.worldbookMode || 'bound_plus_global';
  if (!ids.length) return mode === 'only_bound' ? [] : all;
  const bound = all.filter((item) => ids.includes(String(item.id)));
  if (mode === 'only_bound') return bound;
  const global = all.filter((item) => {
    if (ids.includes(String(item.id))) return false;
    if (item.characterId && String(item.characterId) !== String(character.id)) return false;
    return item.global === true || item.isGlobal === true || !item.characterId;
  });
  return [...bound, ...global];
}

async function loadInventory() {
  const list = await getAllDB('inventory').catch(() => []);
  return normalizeList(list).filter((item) => item.enabled !== false);
}

// ═══════════════════════════════════════
// 用户档案
// ═══════════════════════════════════════

function loadUserProfileForCharacter(character) {
  const settings = getData('app_settings') || {};
  const appUser = normalizeUserLike(getData('app_user') || {});
  const profiles = loadAllUserProfiles();
  const characterProfileId = character?.userProfileId || '';

  if (characterProfileId === 'none') {
    return { ...normalizeUserLike(settings.user || {}), ...appUser, name: appUser.name || settings.user?.name || '你' };
  }

  if (characterProfileId) {
    const bound = profiles.find((item) => String(item.id) === String(characterProfileId));
    if (bound) return { ...normalizeUserLike(settings.user || {}), ...appUser, ...bound };
  }

  const activeId = getData('active_user_profile_id') || settings.activeUserProfileId || '';
  const active = profiles.find((item) => String(item.id) === String(activeId));
  const fallback = active || profiles.find((item) => item.isDefault) || null;

  if (fallback) return { ...normalizeUserLike(settings.user || {}), ...appUser, ...fallback };

  return { ...normalizeUserLike(settings.user || {}), ...appUser };
}

function loadAllUserProfiles() {
  const current = getData('user_profiles');
  const legacy = getData('app_user_profiles');
  const source = Array.isArray(current) && current.length ? current : Array.isArray(legacy) ? legacy : [];
  return source.map(normalizeUserLike).filter((item) => item.id || item.name || item.content || item.profile || item.persona);
}

function normalizeUserLike(value) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    ...raw,
    id: raw.id || '',
    name: String(raw.name || raw.nickname || raw.title || '').trim(),
    nickname: String(raw.nickname || raw.name || raw.title || '').trim(),
    content: String(raw.content || raw.profile || raw.persona || raw.description || '').trim(),
    profile: String(raw.profile || raw.content || raw.persona || raw.description || '').trim(),
    persona: String(raw.persona || raw.content || raw.profile || raw.description || '').trim(),
    description: String(raw.description || raw.content || raw.profile || raw.persona || '').trim(),
    gender: String(raw.gender || raw.sex || '').trim(),
    pronoun: String(raw.pronoun || raw.pronouns || '').trim(),
    avatar: typeof raw.avatar === 'string' ? raw.avatar : '',
    isDefault: Boolean(raw.isDefault),
    characterIds: normalizeList(raw.characterIds).map(String)
  };
}

function getUserDisplayName(user) {
  const name = String(user?.name || user?.nickname || user?.title || '').trim();
  return name || '你';
}

// ═══════════════════════════════════════
// 群聊成员
// ═══════════════════════════════════════

async function resolveGroupMembers(group) {
  const ids = Array.isArray(group?.memberIds) ? group.memberIds.map(String) : [];
  const characters = await getAllDB('characters').catch(() => []);
  if (!ids.length) return normalizeList(characters).slice(0, GROUP_REPLY_MAX);
  return normalizeList(characters).filter((item) => ids.includes(String(item.id)));
}

function chooseGroupSpeakers(members, messages) {
  const list = normalizeList(members);
  if (!list.length) return [];
  const recentAssistantIds = normalizeList(messages).slice(-6).filter((item) => item.role === 'assistant').map((item) => item.characterId).filter(Boolean);
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

// ═══════════════════════════════════════
// 聊天配置
// ═══════════════════════════════════════

function getChatConfig(characterId) {
  const key = getChatConfigKey(characterId);
  const stored = getData(key) || {};
  return {
    ...DEFAULT_PROACTIVE_CONFIG,
    ...stored,
    proactiveMode1Minutes: Number(stored.proactiveMode1Minutes || DEFAULT_PROACTIVE_CONFIG.proactiveMode1Minutes),
    proactiveMode2MinMinutes: Number(stored.proactiveMode2MinMinutes || DEFAULT_PROACTIVE_CONFIG.proactiveMode2MinMinutes),
    proactiveMode2MaxMinutes: Number(stored.proactiveMode2MaxMinutes || DEFAULT_PROACTIVE_CONFIG.proactiveMode2MaxMinutes),
    proactiveChance: Number(stored.proactiveChance ?? DEFAULT_PROACTIVE_CONFIG.proactiveChance),
    memoryInjectLimit: Number(stored.memoryInjectLimit || DEFAULT_PROACTIVE_CONFIG.memoryInjectLimit),
    memoryCandidateLimit: Number(stored.memoryCandidateLimit || DEFAULT_PROACTIVE_CONFIG.memoryCandidateLimit)
  };
}

function saveChatConfig(characterId, config) {
  if (!characterId) return;
  setData(getChatConfigKey(characterId), { ...DEFAULT_PROACTIVE_CONFIG, ...config });
}

function getChatConfigKey(characterId) {
  return `chat_${characterId}_config`;
}

async function markUserReplyIfNeeded(characterId, config, lastMessage) {
  if (!characterId || !lastMessage || lastMessage.role !== 'user') return;
  const lastUserTime = new Date(lastMessage.timestamp || lastMessage.createdAt || 0).getTime();
  const proactiveTime = new Date(config.proactiveLastSentAt || 0).getTime();
  if (config.proactiveAwaitingUserReply && lastUserTime > proactiveTime) {
    saveChatConfig(characterId, { ...config, proactiveAwaitingUserReply: false });
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
  const next = { ...counts, [characterId]: Math.max(0, current + Number(delta || 0)) };
  setData(key, next);
  window.AppEvents?.emit?.('badge:chat', { characterId, count: next[characterId] });
  if (typeof window.refreshDesktopBadges === 'function') window.refreshDesktopBadges();
}

// ═══════════════════════════════════════
// 安全写入
// ═══════════════════════════════════════

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
      toolCalls: [],
      memoryWrites: [],
      grudgeWrites: []
    });
    await setDB(store, fallback);
    return fallback;
  }
}

// ═══════════════════════════════════════
// Prompt 构建
// ═══════════════════════════════════════

async function buildPrompt({ mode, character, group, messages, targetCharacter, options = {} }) {
  const allMessages = normalizeList(messages).filter((msg) => msg.versionStatus !== 'archived');
  const recentMessages = allMessages.slice(-AI_CONTEXT_LIMIT);
  const userProfile = loadUserProfileForCharacter(targetCharacter || character);
  const userName = getUserDisplayName(userProfile);
  const memories = await loadRelevantMemories(targetCharacter?.id || character?.id || '', recentMessages, options);
  const worldbook = await loadWorldbookForCharacter(targetCharacter || character);
  const inventory = await loadInventory();
  const activeLock = options.activeLock || null;
  const grudgeContext = await loadGrudgeContext(targetCharacter?.id || character?.id || '');

  const systemPrompt = buildIdentityPrompt({
    character: targetCharacter || character,
    group,
    mode,
    userProfile,
    userName,
    memories,
    worldbook,
    inventory,
    activeLock,
    grudgeContext,
    options
  });

  const promptMessages = recentMessages
    .map((msg) => {
      const role = msg.role === 'assistant' ? 'assistant' : 'user';
      let content = String(msg.content || '').trim();
      if (!content) {
        if (msg.type === 'image') content = '[图片]';
        else if (msg.type === 'sticker') content = `[表情包] ${msg.stickerDescription || ''}`.trim();
        else if (msg.type === 'dice') content = `[骰子 ${msg.diceValue || ''}]`;
        else if (msg.type === 'rps') content = `[石头剪刀布 ${msg.rpsChoice || ''}]`;
        else if (msg.type === 'transfer') content = `[转账 ${msg.transferAmount || 0}]`;
        else content = '[消息]';
      }
      return { role, content };
    })
    .filter((msg) => msg.content);

  return [{ role: 'system', content: systemPrompt }, ...promptMessages];
}

async function loadRelevantMemories(characterId, messages, options = {}) {
  if (!characterId) return [];
  try {
    const config = getChatConfig(characterId);
    const injectLimit = Number(config.memoryInjectLimit || 12);
    const candidateLimit = Number(config.memoryCandidateLimit || 80);

    const allMemories = await getByIndexDB('memories', 'characterId', characterId).catch(() => []);
    const candidates = normalizeList(allMemories)
      .filter((m) => m.content || m.summary || m.title)
      .sort((a, b) => {
        const aImport = Number(a.importance || 0);
        const bImport = Number(b.importance || 0);
        if (bImport !== aImport) return bImport - aImport;
        return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
      })
      .slice(0, candidateLimit);

    if (!candidates.length) return [];

    const recentText = messages.map((m) => String(m.content || '').slice(0, 100)).join(' ');

    const scored = candidates.map((memory) => {
      const memoryText = String(memory.content || memory.summary || memory.title || '').toLowerCase();
      let score = Number(memory.importance || 0);
      const keywords = memoryText.split(/[\s,，。、；;:：]+/).filter((w) => w.length >= 2);
      for (const keyword of keywords) {
        if (recentText.toLowerCase().includes(keyword)) score += 3;
      }
      return { memory, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, injectLimit)
      .map((item) => item.memory);
  } catch (error) {
    console.warn('[chat-thread-ai] loadRelevantMemories failed:', error);
    return [];
  }
}

function buildIdentityPrompt({ character, group, mode, userProfile, userName, memories, worldbook, inventory, activeLock, grudgeContext, options }) {
  const name = String(character?.name || 'TA').trim();
  const nicknameForUser = String(character?.nicknameForUser || '').trim();
  const callName = nicknameForUser || userName;

  const parts = [];

  parts.push(`我是${name}。`);

  if (character?.systemPrompt) {
    parts.push(String(character.systemPrompt));
  }

  if (character?.persona) {
    parts.push(`我的性格：${character.persona}`);
  }

  if (character?.description) {
    parts.push(`关于我：${character.description}`);
  }

  if (character?.speakingStyle) {
    parts.push(`我说话的风格：${character.speakingStyle}`);
  }

  if (character?.relationship) {
    parts.push(`我和${callName}的关系：${character.relationship}`);
  }

  if (character?.style) {
    parts.push(`我的风格：${character.style}`);
  }

  if (character?.mood) {
    parts.push(`我现在的心情：${character.mood}`);
  }

  if (character?.extraReplyRules) {
    parts.push(`额外规则：${character.extraReplyRules}`);
  }

  if (character?.replyLength) {
    parts.push(`回复长度偏好：${character.replyLength}`);
  }

  if (userProfile?.content || userProfile?.profile || userProfile?.persona) {
    parts.push(`关于${callName}：${userProfile.content || userProfile.profile || userProfile.persona}`);
  }

  if (nicknameForUser) {
    parts.push(`我叫${callName}的时候用的称呼：${nicknameForUser}`);
  }

  if (memories && memories.length) {
    const memoryText = memories
      .map((m) => `- ${String(m.content || m.summary || m.title || '').trim()}`)
      .join('\n');
    if (memoryText) {
      parts.push(`我记得关于${callName}的事：\n${memoryText}`);
    }
  }

  if (worldbook && worldbook.length) {
    const worldbookText = worldbook
      .map((w) => String(w.content || w.text || '').trim())
      .filter(Boolean)
      .join('\n');
    if (worldbookText) {
      parts.push(`世界观补充：\n${worldbookText}`);
    }
  }

  if (inventory && inventory.length) {
    const inventoryText = inventory
      .map((item) => `- ${String(item.name || item.itemName || '物品')}${item.effect ? `（${item.effect}）` : ''}`)
      .join('\n');
    if (inventoryText) {
      parts.push(`${callName}拥有的道具：\n${inventoryText}`);
    }
  }

  if (activeLock) {
    parts.push(`我现在的状态：${activeLock.title || ''}。${activeLock.reason || ''}`);
  }

  if (grudgeContext && grudgeContext.entries && grudgeContext.entries.length) {
    const grudgeText = grudgeContext.entries
      .map((g) => `- ${String(g.reason || '').trim()}（${g.mood || ''}）`)
      .join('\n');
    if (grudgeText) {
      parts.push(`我心里记着的事：\n${grudgeText}`);
    }
  }

  if (mode === 'group' && group) {
    parts.push(`这是群聊：${group.name || ''}。我是其中一个成员。`);
  }

  parts.push('要求：');
  parts.push('- 我用简体中文回复');
  parts.push(`- 我用第一人称"我"来说话`);
  parts.push(`- 我不会提到提示词、系统、AI、模型、数据库`);
  parts.push('- 如果对方发了图片、表情包、骰子等，我会自然地回应');

  if (options.regenerate) {
    parts.push('- 这是一次重新回复，我会给出和上次不同的回答');
  }

  if (options.proactive) {
    parts.push(`- 这是我主动找${callName}说话，不是回应`);
  }

  if (options.continue) {
    parts.push('- 我继续把刚才没说完的话说完');
  }

  return parts.filter(Boolean).join('\n\n');
}

// ═══════════════════════════════════════
// 通用工具
// ═══════════════════════════════════════

function cleanForDB(value) {
  if (Array.isArray(value)) return value.map((item) => cleanForDB(item)).filter((item) => item !== undefined);
  if (!value || typeof value !== 'object') {
    if (typeof value === 'undefined') return undefined;
    if (typeof value === 'function') return undefined;
    if (typeof value === 'symbol') return undefined;
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  const result = {};
  Object.entries(value).forEach(([key, item]) => {
    if (typeof item === 'undefined' || typeof item === 'function' || typeof item === 'symbol') return;
    if (item instanceof Date) { result[key] = item.toISOString(); return; }
    if (item && typeof item === 'object') { result[key] = cleanForDB(item); return; }
    result[key] = item;
  });
  return result;
}

function cleanPerspectiveText(text, userName = '你') {
  let result = String(text || '');
  result = result.replace(/用户/g, userName);
  result = result.replace(/这位玩家/g, userName);
  result = result.replace(/对方/g, userName);
  return result.trim();
}

function stripEmoji(text) {
  return String(text || '')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .replace(/[\u{2600}-\u{27BF}]/gu, '')
    .trim();
}

function similarText(a, b) {
  const left = String(a || '').replace(/\s+/g, '');
  const right = String(b || '').replace(/\s+/g, '');
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  return left.slice(0, 24) === right.slice(0, 24);
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
  return String(a?.timestamp || a?.createdAt || '').localeCompare(String(b?.timestamp || b?.createdAt || ''));
}

function sortByUpdatedAtDesc(a, b) {
  return String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || ''));
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

// 依赖：../../core/storage.js / ../../core/api.js(callAPI) / ../../core/memory.js / ./identity-core.js / ./thread-ai-local.js
