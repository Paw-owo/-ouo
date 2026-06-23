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
    stickerImageBase64: extra.stickerImageBase64 || '',
    stickerDescription: extra.stickerDescription || '',
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
  const next = cleanForDB({
    ...message,
    content,
    editedAt: now,
    updatedAt: now
  });

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
  const id = String(stickerId || extra.stickerId || '').trim();
  const sticker = id ? await getDB('stickers', id).catch(() => null) : null;
  const stickerImageBase64 = String(extra.stickerImageBase64 || sticker?.imageBase64 || sticker?.image || sticker?.dataUrl || '').trim();
  const stickerDescription = String(extra.stickerDescription || sticker?.description || sticker?.desc || sticker?.prompt || '').trim();
  const text = String(extra.content || extra.text || stickerDescription || sticker?.name || '[表情包]').trim();

  if (!id && !stickerImageBase64 && !text) {
    showToast('表情包不见了');
    return null;
  }

  const message = buildBaseMessage(state, {
    ...extra,
    role: normalizeRole(extra.role || 'user'),
    type: 'sticker',
    content: text || '[表情包]',
    stickerId: id,
    stickerImageBase64,
    stickerDescription,
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
    id: String(data.id || generateId('msg')),
    role,
    content: String(data.content || '').trim(),
    type,
    timestamp: String(data.timestamp || now),
    createdAt: String(data.createdAt || now),
    updatedAt: String(now),
    quoteMessageId: String(data.quoteMessageId || ''),
    quoteText: String(data.quoteText || ''),
    imageBase64: String(data.imageBase64 || ''),
    stickerId: String(data.stickerId || ''),
    stickerImageBase64: String(data.stickerImageBase64 || ''),
    stickerDescription: String(data.stickerDescription || ''),
    transferAmount: Number(data.transferAmount || 0),
    note: String(data.note || ''),
    diceValue: Number(data.diceValue || 0),
    diceSides: Number(data.diceSides || 0),
    rpsChoice: String(data.rpsChoice || ''),
    rpsOpponentChoice: String(data.rpsOpponentChoice || ''),
    rpsOutcome: String(data.rpsOutcome || ''),
    rolling: Boolean(data.rolling),
    characterName: String(data.characterName || ''),
    characterAvatar: String(data.characterAvatar || '')
  };

  if (state.mode === 'group') {
    message.groupId = String(state.groupId || '');
    message.characterId = String(data.characterId || '');
  } else {
    message.characterId = String(data.characterId || state.characterId || '');
    message.groupId = '';
  }

  if (data.editedAt) message.editedAt = String(data.editedAt);
  if (data.duration) message.duration = Number(data.duration) || 0;
  if (data.proactive) message.proactive = Boolean(data.proactive);
  if (data.proactiveReason) message.proactiveReason = String(data.proactiveReason);

  return cleanForDB(message);
}

async function saveMessage(state, message) {
  const store = getStoreName(state);
  const cleanMessage = cleanForDB(message);

  try {
    await setDB(store, cleanMessage);
  } catch (error) {
    console.error('save message failed', error);

    const fallback = buildFallbackMessage(state, cleanMessage);
    try {
      await setDB(store, fallback);
      showToast('图片内容太大，先保存了文字版');
    } catch (fallbackError) {
      console.error('save fallback message failed', fallbackError);
      showToast('写入数据库失败');
      throw fallbackError;
    }
  }

  await refreshStateMessages(state);
  return cleanMessage;
}

function buildFallbackMessage(state, message) {
  const now = getNow();
  const fallback = {
    id: String(message.id || generateId('msg')),
    role: normalizeRole(message.role || 'user'),
    content: String(message.content || getPreviewText(message) || '[消息]').trim(),
    type: normalizeMessageType(message.type || 'text'),
    timestamp: String(message.timestamp || now),
    createdAt: String(message.createdAt || now),
    updatedAt: String(now),
    quoteMessageId: String(message.quoteMessageId || ''),
    quoteText: String(message.quoteText || ''),
    imageBase64: '',
    stickerId: String(message.stickerId || ''),
    stickerImageBase64: '',
    stickerDescription: String(message.stickerDescription || ''),
    transferAmount: Number(message.transferAmount || 0),
    note: String(message.note || ''),
    diceValue: Number(message.diceValue || 0),
    diceSides: Number(message.diceSides || 0),
    rpsChoice: String(message.rpsChoice || ''),
    rpsOpponentChoice: String(message.rpsOpponentChoice || ''),
    rpsOutcome: String(message.rpsOutcome || ''),
    rolling: Boolean(message.rolling),
    characterName: String(message.characterName || ''),
    characterAvatar: String(message.characterAvatar || '')
  };

  if (state.mode === 'group') {
    fallback.groupId = String(state.groupId || message.groupId || '');
    fallback.characterId = String(message.characterId || '');
  } else {
    fallback.characterId = String(state.characterId || message.characterId || '');
    fallback.groupId = '';
  }

  return cleanForDB(fallback);
}

async function settleRollingMessage(state, messageId) {
  await wait(680);

  const store = getStoreName(state);
  const message = await getDB(store, messageId).catch(() => null);
  if (!message) return null;

  const next = cleanForDB({
    ...message,
    rolling: false,
    updatedAt: getNow()
  });

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
  if (message.type === 'image') return String(message.content || '[图片]');
  if (message.type === 'sticker') return String(message.stickerDescription || message.content || '[表情包]');
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
  if (message.type === 'sticker') return String(message.stickerDescription || message.content || '[表情包]');
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
  if (message.type === 'sticker') return String(message.stickerDescription || message.content || '这是一个表情包');
  return String(message.content || '').trim();
}

async function refreshStateMessages(state) {
  const store = getStoreName(state);

  if (state.mode === 'group') {
    const list = await getByIndexDB(store, 'groupId', state.groupId).catch(() => []);
    state.groupMessages = normalizeList(list).map(cleanForDB).sort(sortByTimestamp);
    return state.groupMessages;
  }

  const list = await getByIndexDB(store, 'characterId', state.characterId).catch(() => []);
  state.messages = normalizeList(list).map(cleanForDB).sort(sortByTimestamp);
  return state.messages;
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

// 改了什么：修复消息写库失败时的兜底保存，并让表情包支持用户上传图片和 AI 可读描述。
// 会不会影响其他文件：会，thread-render.js 需要显示 stickerImageBase64，thread-ai.js 需要把 stickerDescription 放进 prompt。
// 更新记忆里该文件的导出函数：无变化。
// 依赖：../../core/storage.js(generateId,getNow,setDB,getDB,deleteDB,getByIndexDB)；../../core/ui.js(showToast)；../../core/tts.js(playTTS,stopAll)
