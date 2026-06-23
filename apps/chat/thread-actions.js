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

  const message = buildBaseMessage(state, {
    role: extra.role || 'user',
    content,
    type: extra.type || 'text',
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

  const next = {
    ...message,
    content,
    editedAt: getNow(),
    updatedAt: getNow()
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
  state.quotedMessageId = String(messageId || '').trim();
  showToast(state.quotedMessageId ? '已引用这句' : '已取消引用');
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

  await deleteThreadMessage(state, id);
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

  const message = buildBaseMessage(state, {
    role: 'user',
    type: 'transfer',
    content: String(note || `转账 ${value}`).trim(),
    transferAmount: value,
    note: String(note || '').trim(),
    quoteMessageId: state.quotedMessageId || '',
    quoteText: await resolveQuoteText(state, state.quotedMessageId || '')
  });

  await saveMessage(state, message);
  clearQuote(state);

  if (extra.triggerAI !== false) {
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
    role: 'user',
    type: 'image',
    content: String(caption || '[图片]').trim(),
    imageBase64: image,
    quoteMessageId: state.quotedMessageId || '',
    quoteText: await resolveQuoteText(state, state.quotedMessageId || '')
  });

  await saveMessage(state, message);
  clearQuote(state);

  if (extra.triggerAI !== false) {
    await requestAIReplySafely(state);
  }

  return message;
}

export async function sendStickerMessage(state, stickerId, extra = {}) {
  const id = String(stickerId || '').trim();

  if (!id) {
    showToast('表情不见了');
    return null;
  }

  const message = buildBaseMessage(state, {
    role: 'user',
    type: 'sticker',
    content: '[表情]',
    stickerId: id,
    quoteMessageId: state.quotedMessageId || '',
    quoteText: await resolveQuoteText(state, state.quotedMessageId || '')
  });

  await saveMessage(state, message);
  clearQuote(state);

  if (extra.triggerAI !== false) {
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
    role,
    type: 'dice',
    content: `${role === 'assistant' ? getSpeakerName(speaker) : '我'} 摇了骰子：${value}`,
    diceValue: value,
    diceSides: sides,
    rolling: true,
    characterId: role === 'assistant' ? speaker?.id || options.characterId || '' : options.characterId || '',
    characterName: speaker?.name || '',
    characterAvatar: speaker?.avatar || ''
  });

  await saveMessage(state, message);
  await settleRollingMessage(state, message.id);

  if (role === 'user' && options.triggerAI !== false) {
    await requestAIReplySafely(state, { game: 'dice', diceValue: value, diceSides: sides });
  }

  return {
    ...message,
    rolling: false
  };
}

export async function sendRpsMessage(state, options = {}) {
  const role = normalizeRole(options.role || 'user');
  const speaker = options.character || null;
  const choice = randomRpsChoice();
  const opponentChoice = options.opponentChoice ? normalizeRpsChoice(options.opponentChoice) : '';
  const outcome = opponentChoice ? getRpsOutcome(choice, opponentChoice) : '';

  const message = buildBaseMessage(state, {
    role,
    type: 'rps',
    content: `${role === 'assistant' ? getSpeakerName(speaker) : '我'} 出了${getRpsLabel(choice)}`,
    rpsChoice: choice,
    rpsOpponentChoice: opponentChoice,
    rpsOutcome: outcome,
    rolling: true,
    characterId: role === 'assistant' ? speaker?.id || options.characterId || '' : options.characterId || '',
    characterName: speaker?.name || '',
    characterAvatar: speaker?.avatar || ''
  });

  await saveMessage(state, message);
  await settleRollingMessage(state, message.id);

  if (role === 'user' && options.triggerAI !== false) {
    await requestAIReplySafely(state, { game: 'rps', rpsChoice: choice, rpsOpponentChoice: opponentChoice, rpsOutcome: outcome });
  }

  return {
    ...message,
    rolling: false
  };
}

export async function playThreadTTS(state, message) {
  const text = String(message?.content || '').trim();

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

  const message = {
    id: generateId('msg'),
    role: data.role || 'user',
    content: String(data.content || '').trim(),
    type: data.type || 'text',
    timestamp: now,
    createdAt: now,
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
  if (message.type === 'sticker') return '[表情]';
  if (message.type === 'transfer') return `[转账 ${Number(message.transferAmount || 0)}]`;
  if (message.type === 'voice') return '[语音]';
  if (message.type === 'dice') return `[骰子 ${message.diceValue || ''}]`;
  if (message.type === 'rps') return `[石头剪刀布 ${getRpsLabel(message.rpsChoice)}]`;

  const text = String(message.content || '').trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function getCopyText(message) {
  if (!message) return '';
  if (message.type === 'dice') return `骰子：${message.diceValue || ''}`;
  if (message.type === 'rps') return `石头剪刀布：${getRpsLabel(message.rpsChoice)}`;
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

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

// 改了什么：新增 triggerAI=false 支持，方便文件分段发完后只让 AI 回一次。
// 会不会影响其他文件：会，thread.js 可以用 extra.triggerAI=false 做文件分段。
// 更新记忆里该文件的导出函数：sendTransferMessage/sendImageMessage/sendStickerMessage 参数支持 extra。
// 依赖：../../core/storage.js(generateId,getNow,setDB,getDB,deleteDB,getByIndexDB)；../../core/ui.js(showToast)；../../core/tts.js(playTTS,stopAll)
