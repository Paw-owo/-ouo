// apps/chat/thread-actions.js
// imports:
//   from '../../core/storage.js': generateId, getNow, setDB, getDB, deleteDB, getByIndexDB
//   from '../../core/ui.js': showToast
//   from '../../core/tts.js': playTTS, stopAll
// dynamic imports:
//   from './thread-ai.js': requestThreadAIReply

import {
  generateId,
  getNow,
  setDB,
  getDB,
  deleteDB,
  getByIndexDB
} from '../../core/storage.js';

import { showToast } from '../../core/ui.js';
import { playTTS, stopAll } from '../../core/tts.js';

let requestThreadAIReplyFn = null;

export async function sendThreadMessage(state, text, extra = {}) {
  const content = String(text || '').trim();
  if (!content) return null;

  const type = normalizeMessageType(extra.type || 'text');

  const message = buildBaseMessage(state, {
    ...extra,
    role: normalizeRole(extra.role || 'user'),
    content,
    type,
    quoteMessageId: state.quotedMessageId || extra.quoteMessageId || '',
    quoteText: await resolveQuoteText(state, state.quotedMessageId || extra.quoteMessageId || ''),
    imageBase64: extra.imageBase64 || '',
    stickerId: extra.stickerId || '',
    transferAmount: extra.transferAmount || 0,
    note: extra.note || '',
    characterId: extra.characterId || '',
    characterName: extra.characterName || '',
    characterAvatar: extra.characterAvatar || ''
  });

  await saveMessage(state, message);
  clearQuote(state);

  if (message.role === 'user' && extra.triggerAI !== false) {
    await requestAIReplySafely(state);
  }

  return message;
}

export async function editThreadMessage(state, messageId, nextContent) {
  const id = String(messageId || '').trim();
  const content = String(nextContent || '').trim();

  if (!id || !content) {
    showToast('内容不能为空');
    return null;
  }

  const store = getStoreName(state);
  const message = await getDB(store, id).catch(() => null);

  if (!message) {
    showToast('这条消息找不到了');
    return null;
  }

  if (!canEditMessage(message)) {
    showToast('这条不适合编辑');
    return null;
  }

  const now = getNow();
  const next = {
    ...message,
    content,
    editedAt: now,
    updatedAt: now
  };

  await setDB(store, next);
  await refreshStateMessages(state);

  showToast('改好啦');
  return next;
}

export async function deleteThreadMessage(state, messageId) {
  const id = String(messageId || '').trim();

  if (!id) return false;

  await deleteDB(getStoreName(state), id);
  await refreshStateMessages(state);

  if (state.quotedMessageId === id) {
    clearQuote(state);
  }

  showToast('已经删掉');
  return true;
}

export function quoteThreadMessage(state, messageId) {
  const id = String(messageId || '').trim();

  if (!id) {
    clearQuote(state);
    showToast('已取消引用');
    return;
  }

  state.quotedMessageId = id;
  showToast('已引用这句');
}

export async function copyThreadMessage(message) {
  const text = getCopyText(message);

  if (!text) {
    showToast('没有可复制的内容');
    return false;
  }

  try {
    await navigator.clipboard.writeText(text);
    showToast('复制好啦');
    return true;
  } catch (_) {
    showToast('复制失败');
    return false;
  }
}

export async function regenerateThreadMessage(state, messageId) {
  const id = String(messageId || '').trim();
  const list = getStateList(state);
  const target = list.find((item) => item.id === id);

  if (!target) {
    showToast('这条消息找不到了');
    return null;
  }

  if (target.role !== 'assistant') {
    showToast('只能重来 TA 的回复');
    return null;
  }

  await deleteDB(getStoreName(state), id);
  await refreshStateMessages(state);
  await requestAIReplySafely(state, { regenerate: true });

  return true;
}

export async function continueThreadMessage(state) {
  await requestAIReplySafely(state, { continue: true });
  return true;
}

export async function sendTransferMessage(state, amount, note = '', extra = {}) {
  const value = Number(amount || 0);

  if (!Number.isFinite(value) || value <= 0) {
    showToast('金额要大于 0');
    return null;
  }

  const cleanNote = String(note || '').trim();

  const message = buildBaseMessage(state, {
    ...extra,
    role: normalizeRole(extra.role || 'user'),
    type: 'transfer',
    content: cleanNote || `转账 ${formatAmount(value)}`,
    transferAmount: value,
    note: cleanNote,
    quoteMessageId: state.quotedMessageId || extra.quoteMessageId || '',
    quoteText: await resolveQuoteText(state, state.quotedMessageId || extra.quoteMessageId || '')
  });

  await saveMessage(state, message);
  clearQuote(state);

  if (message.role === 'user' && extra.triggerAI !== false) {
    await requestAIReplySafely(state);
  }

  return message;
}

export async function sendImageMessage(state, imageBase64, caption = '', extra = {}) {
  const image = String(imageBase64 || '').trim();

  if (!image) {
    showToast('图片不见了');
    return null;
  }

  const message = buildBaseMessage(state, {
    ...extra,
    role: normalizeRole(extra.role || 'user'),
    type: 'image',
    content: String(caption || '[图片]').trim(),
    imageBase64: image,
    quoteMessageId: state.quotedMessageId || extra.quoteMessageId || '',
    quoteText: await resolveQuoteText(state, state.quotedMessageId || extra.quoteMessageId || '')
  });

  await saveMessage(state, message);
  clearQuote(state);

  if (message.role === 'user' && extra.triggerAI !== false) {
    await requestAIReplySafely(state);
  }

  return message;
}

export async function sendStickerMessage(state, stickerId, extra = {}) {
  const id = String(stickerId || '').trim();
  const text = String(extra.content || extra.text || '[表情]').trim();

  if (!id && !text) {
    showToast('表情不见了');
    return null;
  }

  const message = buildBaseMessage(state, {
    ...extra,
    role: normalizeRole(extra.role || 'user'),
    type: 'sticker',
    content: text || '[表情]',
    stickerId: id,
    quoteMessageId: state.quotedMessageId || extra.quoteMessageId || '',
    quoteText: await resolveQuoteText(state, state.quotedMessageId || extra.quoteMessageId || '')
  });

  await saveMessage(state, message);
  clearQuote(state);

  if (message.role === 'user' && extra.triggerAI !== false) {
    await requestAIReplySafely(state);
  }

  return message;
}

export async function sendDiceMessage(state, options = {}) {
  const sides = clampNumber(options.sides || 6, 2, 100);
  const value = rollDice(sides);
  const role = normalizeRole(options.role || 'user');
  const speaker = options.character || null;

  const message = buildBaseMessage(state, {
    ...options,
    role,
    type: 'dice',
    content: `${role === 'assistant' ? getSpeakerName(speaker) : '我'} 摇了骰子：${value}`,
    diceValue: value,
    diceSides: sides,
    rolling: true,
    characterId: role === 'assistant' ? speaker?.id || options.characterId || state.characterId || '' : options.characterId || '',
    characterName: role === 'assistant' ? speaker?.name || options.characterName || '' : options.characterName || '',
    characterAvatar: role === 'assistant' ? speaker?.avatar || options.characterAvatar || '' : options.characterAvatar || ''
  });

  await saveMessage(state, message);
  await settleRollingMessage(state, message.id);

  if (role === 'user' && options.triggerAI !== false) {
    await requestAIReplySafely(state, {
      game: 'dice',
      diceValue: value,
      diceSides: sides
    });
  }

  return {
    ...message,
    rolling: false
  };
}

export async function sendRpsMessage(state, options = {}) {
  const role = normalizeRole(options.role || 'user');
  const speaker = options.character || null;
  const choice = options.choice ? normalizeRpsChoice(options.choice) || randomRpsChoice() : randomRpsChoice();
  const opponentChoice = options.opponentChoice ? normalizeRpsChoice(options.opponentChoice) : '';
  const outcome = opponentChoice ? getRpsOutcome(choice, opponentChoice) : '';

  const message = buildBaseMessage(state, {
    ...options,
    role,
    type: 'rps',
    content: `${role === 'assistant' ? getSpeakerName(speaker) : '我'} 出了${getRpsLabel(choice)}`,
    rpsChoice: choice,
    rpsOpponentChoice: opponentChoice,
    rpsOutcome: outcome,
    rolling: true,
    characterId: role === 'assistant' ? speaker?.id || options.characterId || state.characterId || '' : options.characterId || '',
    characterName: role === 'assistant' ? speaker?.name || options.characterName || '' : options.characterName || '',
    characterAvatar: role === 'assistant' ? speaker?.avatar || options.characterAvatar || '' : options.characterAvatar || ''
  });

  await saveMessage(state, message);
  await settleRollingMessage(state, message.id);

  if (role === 'user' && options.triggerAI !== false) {
    await requestAIReplySafely(state, {
      game: 'rps',
      rpsChoice: choice,
      rpsOpponentChoice: opponentChoice,
      rpsOutcome: outcome
    });
  }

  return {
    ...message,
    rolling: false
  };
}

export async function playThreadTTS(state, message) {
  const text = getTtsText(message);

  if (!text) {
    showToast('没有可以朗读的内容');
    return false;
  }

  stopAll();
  state.activeTtsMessageId = message.id || '';
  state.activeTts = true;

  try {
    await playTTS(text);
    return true;
  } catch (_) {
    showToast('朗读失败');
    return false;
  } finally {
    state.activeTtsMessageId = '';
    state.activeTts = false;
  }
}

export function stopThreadTTS() {
  stopAll();
}

function buildBaseMessage(state, data = {}) {
  const now = getNow();
  const role = normalizeRole(data.role || 'user');
  const type = normalizeMessageType(data.type || 'text');

  const message = {
    id: data.id || generateId('msg'),
    role,
    content: String(data.content || '').trim(),
    type,
    timestamp: data.timestamp || now,
    createdAt: data.createdAt || now,
    updatedAt: now,
    quoteMessageId: data.quoteMessageId || '',
    quoteText: data.quoteText || '',
    imageBase64: data.imageBase64 || '',
    stickerId: data.stickerId || '',
    transferAmount: Number(data.transferAmount || 0),
    note: data.note || '',
    diceValue: data.diceValue || 0,
    diceSides: data.diceSides || 0,
    rpsChoice: data.rpsChoice || '',
    rpsOpponentChoice: data.rpsOpponentChoice || '',
    rpsOutcome: data.rpsOutcome || '',
    rolling: Boolean(data.rolling),
    characterName: data.characterName || '',
    characterAvatar: data.characterAvatar || ''
  };

  if (state.mode === 'group') {
    message.groupId = state.groupId;
    message.characterId = data.characterId || '';
  } else {
    message.characterId = data.characterId || state.characterId;
    message.groupId = '';
  }

  if (data.editedAt) message.editedAt = data.editedAt;
  if (data.duration) message.duration = data.duration;
  if (data.proactive) message.proactive = Boolean(data.proactive);
  if (data.proactiveReason) message.proactiveReason = data.proactiveReason;

  return message;
}

async function saveMessage(state, message) {
  await setDB(getStoreName(state), message);
  await refreshStateMessages(state);
  return message;
}

async function settleRollingMessage(state, messageId) {
  await wait(680);

  const store = getStoreName(state);
  const message = await getDB(store, messageId).catch(() => null);
  if (!message) return null;

  const next = {
    ...message,
    rolling: false,
    updatedAt: getNow()
  };

  await setDB(store, next);
  await refreshStateMessages(state);

  return next;
}

async function requestAIReplySafely(state, options = {}) {
  const fn = await getAIReplyFunction();

  if (typeof fn !== 'function') {
    showToast('AI 回复模块还没接上');
    return null;
  }

  try {
    return await fn(state, options);
  } catch (error) {
    console.error(error);
    showToast('TA 刚刚走神了');
    return null;
  }
}

async function getAIReplyFunction() {
  if (requestThreadAIReplyFn) return requestThreadAIReplyFn;

  const mod = await import('./thread-ai.js').catch(() => null);
  requestThreadAIReplyFn = mod?.requestThreadAIReply || null;

  return requestThreadAIReplyFn;
}

async function resolveQuoteText(state, messageId) {
  const id = String(messageId || '').trim();
  if (!id) return '';

  const local = getStateList(state).find((item) => item.id === id);
  if (local) return getPreviewText(local);

  const dbMessage = await getDB(getStoreName(state), id).catch(() => null);
  return dbMessage ? getPreviewText(dbMessage) : '';
}

function getPreviewText(message) {
  if (!message) return '';
  if (message.type === 'image') return '[图片]';
  if (message.type === 'sticker') return String(message.content || '[表情]');
  if (message.type === 'transfer') return `[转账 ${formatAmount(message.transferAmount)}]`;
  if (message.type === 'voice') return `[语音] ${trimText(message.content || '', 40)}`;
  if (message.type === 'dice') return `[骰子 ${message.diceValue || ''}]`;
  if (message.type === 'rps') return `[石头剪刀布 ${getRpsLabel(message.rpsChoice)}]`;

  const text = String(message.content || '').trim();
  return trimText(text, 80);
}

function getCopyText(message) {
  if (!message) return '';
  if (message.type === 'image') return String(message.content || '[图片]');
  if (message.type === 'sticker') return String(message.content || '[表情]');
  if (message.type === 'transfer') return `转账：${formatAmount(message.transferAmount)}${message.note ? `，备注：${message.note}` : ''}`;
  if (message.type === 'voice') return `语音文字：${message.content || ''}`;
  if (message.type === 'dice') return `骰子：${message.diceValue || ''}`;
  if (message.type === 'rps') return `石头剪刀布：${getRpsLabel(message.rpsChoice)}${message.rpsOutcome ? `，结果：${message.rpsOutcome}` : ''}`;

  return String(message.content || '').trim();
}

function getTtsText(message) {
  if (!message) return '';
  if (message.type === 'dice') return `骰子摇到了 ${message.diceValue || ''}`;
  if (message.type === 'rps') return `石头剪刀布出了 ${getRpsLabel(message.rpsChoice)}`;
  if (message.type === 'transfer') return `收到一条转账消息，金额 ${formatAmount(message.transferAmount)}。${message.note || ''}`;
  if (message.type === 'image') return String(message.content || '这是一张图片');
  return String(message.content || '').trim();
}

async function refreshStateMessages(state) {
  const store = getStoreName(state);

  if (state.mode === 'group') {
    const list = await getByIndexDB(store, 'groupId', state.groupId).catch(() => []);
    state.groupMessages = normalizeList(list).sort(sortByTimestamp);
    return state.groupMessages;
  }

  const list = await getByIndexDB(store, 'characterId', state.characterId).catch(() => []);
  state.messages = normalizeList(list).sort(sortByTimestamp);
  return state.messages;
}

function clearQuote(state) {
  state.quotedMessageId = '';
}

function getStoreName(state) {
  return state.mode === 'group' ? 'group_messages' : 'messages';
}

function getStateList(state) {
  return state.mode === 'group' ? normalizeList(state.groupMessages) : normalizeList(state.messages);
}

function canEditMessage(message) {
  return ['text', 'voice', 'sticker'].includes(normalizeMessageType(message?.type || 'text'));
}

function normalizeMessageType(type) {
  const value = String(type || 'text').trim().toLowerCase();

  if ([
    'text',
    'voice',
    'sticker',
    'image',
    'transfer',
    'dice',
    'rps'
  ].includes(value)) {
    return value;
  }

  return 'text';
}

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function sortByTimestamp(a, b) {
  return String(a?.timestamp || '').localeCompare(String(b?.timestamp || ''));
}

function normalizeRole(role) {
  return role === 'assistant' ? 'assistant' : 'user';
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function rollDice(sides = 6) {
  return Math.floor(Math.random() * sides) + 1;
}

function randomRpsChoice() {
  const list = ['rock', 'paper', 'scissors'];
  return list[Math.floor(Math.random() * list.length)];
}

function normalizeRpsChoice(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['rock', 'stone', '石头'].includes(text)) return 'rock';
  if (['paper', '布'].includes(text)) return 'paper';
  if (['scissors', 'scissor', '剪刀'].includes(text)) return 'scissors';
  return '';
}

function getRpsOutcome(choice, opponentChoice) {
  if (!choice || !opponentChoice) return '';
  if (choice === opponentChoice) return 'draw';

  if (
    (choice === 'rock' && opponentChoice === 'scissors') ||
    (choice === 'scissors' && opponentChoice === 'paper') ||
    (choice === 'paper' && opponentChoice === 'rock')
  ) {
    return 'win';
  }

  return 'lose';
}

function getRpsLabel(choice) {
  if (choice === 'rock') return '石头';
  if (choice === 'paper') return '布';
  if (choice === 'scissors') return '剪刀';
  return '未知';
}

function getSpeakerName(character) {
  return character?.name || 'TA';
}

function formatAmount(amount) {
  const number = Number(amount || 0);
  if (!Number.isFinite(number)) return '0.00';
  return number.toFixed(2);
}

function trimText(text, max) {
  const value = String(text || '').trim();
  if (!value) return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// 改了什么：补齐 sendThreadMessage 的 extra.type 支持，统一 voice/sticker/text/image/transfer/dice/rps 数据结构，并保持私聊只写 messages、群聊只写 group_messages。
// 会不会影响其他文件：会，thread.js 的语音文字/表情入口和 thread-render.js 的特殊消息显示会更稳定；不需要改导出。
// 更新记忆里该文件的导出函数：无变化。
// 依赖：../../core/storage.js(generateId,getNow,setDB,getDB,deleteDB,getByIndexDB)；../../core/ui.js(showToast)；../../core/tts.js(playTTS,stopAll)
