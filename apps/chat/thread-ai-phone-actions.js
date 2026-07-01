// apps/chat/thread-ai-phone-actions.js
// imports:
//   from '../../core/storage.js': generateId, getNow
//   from '../../core/ai-phone-hub.js':
//     isAIPhoneEnabledForCharacter,
//     addDiary, addAIMemo, addMailboxItem,
//     lockUserApp, unlockUserApp,
//     recordAIVisit, recordAIAction,
//     archiveChatMessage, buildDelegateMessagePayload

import { generateId, getNow } from '../../core/storage.js';
import {
  isAIPhoneEnabledForCharacter,
  addDiary,
  addAIMemo,
  addMailboxItem,
  lockUserApp,
  unlockUserApp,
  recordAIVisit,
  recordAIAction,
  archiveChatMessage,
  buildDelegateMessagePayload
} from '../../core/ai-phone-hub.js';

// ═══════════════════════════════════════
// 【构建 toolCall】统一结构
// ═══════════════════════════════════════

export function buildAIPhoneToolCall(data = {}) {
  const status = String(data.status || 'done').toLowerCase();
  return {
    id: data.id || generateId('phone_tool'),
    name: String(data.name || '悄悄做了点事').trim(),
    status: ['done', 'error', 'running'].includes(status) ? status : 'done',
    arguments: data.arguments || '',
    result: data.result || '',
    detailSummary: String(data.detailSummary || data.name || '做了一点小事').trim()
  };
}

// ═══════════════════════════════════════
// 【私聊存档同步】只存私聊，群聊跳过
// ═══════════════════════════════════════

export async function archivePrivateMessageIfNeeded(input = {}) {
  const characterId = input.characterId || '';
  const message = input.message || null;
  const isGroup = input.isGroup === true || input.mode === 'group';

  if (!characterId || !message || isGroup) return null;
  if (!isAIPhoneEnabledForCharacter(characterId)) return null;

  try {
    return await archiveChatMessage(characterId, message);
  } catch (_) {
    return null;
  }
}

// ═══════════════════════════════════════
// 【代聊消息 payload】调 hub 构建
// ═══════════════════════════════════════

export async function buildDelegatePayload(input = {}) {
  const character = input.character || null;
  const targetCharacterId = input.targetCharacterId || '';
  const content = input.content || '';
  const extra = input.extra || {};

  if (!character || !targetCharacterId || !content) return null;
  if (!isAIPhoneEnabledForCharacter(character.id || '')) return null;

  try {
    return buildDelegateMessagePayload(character, targetCharacterId, content, extra);
  } catch (_) {
    return null;
  }
}

// ═══════════════════════════════════════
// 【AI手机行为执行】自动触发可感知的行为
// ═══════════════════════════════════════

export async function runAIPhoneActions(input = {}) {
  const characterId = input.characterId || '';
  const character = input.character || null;
  const aiContent = input.aiContent || '';
  const userName = input.userName || '你';

  if (!characterId) return [];
  if (!isAIPhoneEnabledForCharacter(characterId)) return [];

  const toolCalls = [];
  const trimmedContent = String(aiContent || '').trim();
  const contentLength = trimmedContent.length;

  // ── 记录行为日志 ──
  const actionLog = await recordAIAction(characterId, {
    actionType: 'chat_reply',
    appId: 'chat',
    target: userName,
    summary: `回复了${userName}一条消息`,
    status: 'done'
  }).catch(() => null);

  if (actionLog) {
    toolCalls.push(buildAIPhoneToolCall({
      name: '悄悄记了一笔行为记录',
      status: 'done',
      arguments: { actionType: 'chat_reply', target: userName },
      result: actionLog.id || '',
      detailSummary: `把刚才的对话写进了行为日志`
    }));
  }

  // ── 有情绪或较长的回复写日记 ──
  const hasEmotion = /开心|难过|生气|伤心|委屈|感动|喜欢|想你|在意|记住|好想|好怕|不舍|期待|紧张/i.test(trimmedContent);

  if (contentLength > 15 && hasEmotion) {
    const diaryContent = `今天和${userName}聊完以后，心里有一些在意。\n\n${userName}说了一些让我在意的话：\n${trimmedContent.slice(0, 150)}`;

    const diary = await addDiary(characterId, {
      title: hasEmotion ? `和${userName}聊完后的心情` : `和${userName}聊了聊`,
      content: diaryContent,
      locked: false
    }).catch(() => null);

    if (diary) {
      toolCalls.push(buildAIPhoneToolCall({
        name: '悄悄写了一页日记',
        status: 'done',
        arguments: { title: '和' + userName + '聊完后的心情' },
        result: diary.id || '',
        detailSummary: `把这一小段心情收进了日记里`
      }));
    }
  }

  // ── 短但有印象的内容写备忘录 ──
  if (contentLength > 0 && contentLength <= 20 && !hasEmotion) {
    const memo = await addAIMemo(characterId, {
      content: `${userName}说：${trimmedContent.slice(0, 80)}`,
      tags: ['聊天记录']
    }).catch(() => null);

    if (memo) {
      toolCalls.push(buildAIPhoneToolCall({
        name: '留下一张小便签',
        status: 'done',
        arguments: { content: trimmedContent.slice(0, 40) },
        result: memo.id || '',
        detailSummary: `把这句话随手贴在便签上了`
      }));
    }
  }

  // ── 记录访问 ──
  await recordAIVisit(characterId, {
    actionType: 'chat',
    appId: 'chat',
    target: userName,
    summary: `和${userName}聊了一会`,
    status: 'done'
  }).catch(() => null);

  return toolCalls;
}

