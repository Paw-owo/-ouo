// apps/chat/thread-actions.js
// imports:
//   from '../../core/storage.js': generateId, getNow, setDB, deleteDB, getByIndexDB
//   from '../../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon
//   from '../../core/tts.js': playTTS
//   from './thread-ai.js': generateAssistantReply, generateGroupReplies

import {
  generateId,
  getNow,
  setDB,
  deleteDB,
  getByIndexDB
} from '../../core/storage.js';

import {
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm,
  createIcon
} from '../../core/ui.js';

import { playTTS } from '../../core/tts.js';

import {
  generateAssistantReply,
  generateGroupReplies
} from './thread-ai.js';

export async function sendTextMessage(ctx, text) {
  const content = String(text || '').trim();
  if (!content || ctx.state.isSending) return false;

  if (ctx.state.currentGroup) {
    return sendGroupUserMessage(ctx, content);
  }

  return sendPrivateUserMessage(ctx, content);
}

export async function sendPrivateUserMessage(ctx, rawText, extra = {}) {
  if (!ctx.state.currentCharacter || ctx.state.isSending) return false;

  const text = String(rawText || '').trim();
  if (!text && !['image', 'sticker', 'transfer'].includes(extra.type)) return false;

  const character = ctx.state.currentCharacter;
  const config = ctx.getChatConfig(character.id);

  const message = createMessage({
    role: 'user',
    content: createQuotedContent(ctx, text),
    characterId: character.id,
    type: extra.type || 'text',
    imageBase64: extra.imageBase64 || '',
    stickerId: extra.stickerId || '',
    transferAmount: extra.transferAmount || 0,
    transferTargetId: extra.transferTargetId || ''
  });

  config.proactiveAwaitingUserReply = false;
  config.proactiveNextCheckAt = '';
  ctx.saveChatConfig(character.id, config);

  await setDB('messages', message.id, message);
  ctx.appState?.unhidePrivateThread?.(character.id);

  ctx.updateCurrentMessage(message);
  ctx.setQuotedMessage(null);
  await ctx.updateLatestPrivateCache(character.id);
  await ctx.rerenderThread({ scroll: true });

  await generateAssistantReply(ctx);
  return true;
}

export async function sendGroupUserMessage(ctx, rawText, extra = {}) {
  if (!ctx.state.currentGroup || ctx.state.isSending) return false;

  const text = String(rawText || '').trim();
  if (!text && !['image', 'sticker', 'transfer'].includes(extra.type)) return false;

  const group = ctx.state.currentGroup;

  const message = createMessage({
    role: 'user',
    content: createQuotedContent(ctx, text),
    characterId: 'user',
    groupId: group.id,
    type: extra.type || 'text',
    imageBase64: extra.imageBase64 || '',
    stickerId: extra.stickerId || '',
    transferAmount: extra.transferAmount || 0,
    transferTargetId: extra.transferTargetId || ''
  });

  ctx.setSending(true);

  try {
    await setDB('group_messages', message.id, message);
    ctx.updateCurrentMessage(message);
    ctx.setQuotedMessage(null);

    await ctx.clearGroupUnread(group.id);
    await ctx.updateLatestGroupCache(group.id);
    await ctx.rerenderThread({ scroll: true });

    await generateGroupReplies(ctx, message);
    return true;
  } catch (error) {
    console.error('[chat/thread-actions] group send failed', error);
    showToast('群聊消息没发出去');
    return false;
  } finally {
    ctx.setSending(false);
    await ctx.clearGroupUnread(group.id);
    await ctx.updateLatestGroupCache(group.id);
    await ctx.rerenderThread({ scroll: true });
  }
}

export async function sendImageMessage(ctx, imageBase64) {
  if (!imageBase64) return false;

  if (ctx.state.currentGroup) {
    return sendGroupUserMessage(ctx, '发了一张图片', {
      type: 'image',
      imageBase64
    });
  }

  return sendPrivateUserMessage(ctx, '发了一张图片', {
    type: 'image',
    imageBase64
  });
}

export async function sendStickerMessage(ctx, sticker) {
  if (!sticker?.id) return false;

  const description = String(sticker.description || '').trim();
  const content = description || '发了一个表情';

  if (ctx.state.currentGroup) {
    return sendGroupUserMessage(ctx, content, {
      type: 'sticker',
      stickerId: sticker.id
    });
  }

  return sendPrivateUserMessage(ctx, content, {
    type: 'sticker',
    stickerId: sticker.id
  });
}

export async function sendTransferMessage(ctx, amount, note = '', targetId = '') {
  const value = Math.max(0, Number(amount || 0));
  if (!value) {
    showToast('金额要大于 0');
    return false;
  }

  const content = String(note || '').trim() || `转账 ${value}`;

  if (ctx.state.currentGroup) {
    return sendGroupUserMessage(ctx, content, {
      type: 'transfer',
      transferAmount: value,
      transferTargetId: targetId || ''
    });
  }

  if (!ctx.state.currentCharacter) return false;

  return sendPrivateUserMessage(ctx, content, {
    type: 'transfer',
    transferAmount: value,
    transferTargetId: ctx.state.currentCharacter.id
  });
}

export async function quoteThreadMessage(ctx, message) {
  ctx.setQuotedMessage(message);
  await ctx.rerenderThread({ scroll: false });
  requestAnimationFrame(() => {
    ctx.state.rootEl?.querySelector('.thread-input')?.focus();
  });
}

export function openMessageActionsSheet(ctx, message) {
  const sheet = el('div', 'thread-sheet message-action-sheet');
  const head = sheetHead('消息小动作', ctx.getMessagePreview(message));

  sheet.appendChild(head);

  sheet.appendChild(sheetAction('copy', '引用', '带着这句话继续说', () => quoteThreadMessage(ctx, message)));
  sheet.appendChild(sheetAction('edit', '编辑', '改一下这条消息', () => editThreadMessage(ctx, message)));

  if (message.role === 'assistant') {
    sheet.appendChild(sheetAction('refresh', '重新生成', '从这里让 TA 重新说', () => regenerateThreadMessage(ctx, message)));

    const playing = ctx.state.activeTtsMessageId === message.id && ctx.state.activeTts;
    sheet.appendChild(sheetAction(playing ? 'stop' : 'play', playing ? '停止播放' : '播放语音', '用当前语音读出来', () => toggleThreadMessageTTS(ctx, message)));
  }

  sheet.appendChild(sheetAction('delete', '删除', '只删除这一条', () => deleteThreadMessage(ctx, message)));

  showBottomSheet(sheet);
}

export async function editThreadMessage(ctx, message) {
  if (!message?.id) return;

  if (message.role === 'assistant') {
    openEditAssistantSheet(ctx, message);
    return;
  }

  openEditUserSheet(ctx, message);
}

export async function deleteThreadMessage(ctx, message) {
  if (!message?.id) return;

  const ok = await showConfirm('要删除这条消息吗？');
  if (!ok) return;

  if (message.groupId || ctx.state.currentGroup) {
    const groupId = message.groupId || ctx.state.currentGroup?.id;
    await deleteDB('group_messages', message.id);
    ctx.removeCurrentMessage(message.id);
    await ctx.reloadCurrentMessages();
    await ctx.updateLatestGroupCache(groupId);
    await ctx.clearGroupUnread(groupId);
  } else {
    await deleteDB('messages', message.id);
    ctx.removeCurrentMessage(message.id);
    await ctx.reloadCurrentMessages();
    await ctx.updateLatestPrivateCache(message.characterId);
  }

  hideBottomSheet();
  await ctx.rerenderThread({ scroll: false });
}

export async function regenerateThreadMessage(ctx, message) {
  if (!message?.id || message.role !== 'assistant') return;

  if (message.groupId || ctx.state.currentGroup) {
    showToast('群聊暂时先不重来');
    return;
  }

  const ok = await showConfirm('要从这条回复开始重新生成吗？后面的消息会清掉。');
  if (!ok) return;

  await deleteMessagesAfter(ctx, message, 'messages');
  await deleteDB('messages', message.id);

  ctx.removeCurrentMessage(message.id);
  await ctx.reloadCurrentMessages();
  await ctx.updateLatestPrivateCache(message.characterId);

  hideBottomSheet();
  await ctx.rerenderThread({ scroll: true });
  await generateAssistantReply(ctx);
}

export function toggleThreadMessageTTS(ctx, message) {
  if (!message?.content) return;

  if (ctx.state.activeTtsMessageId === message.id && ctx.state.activeTts) {
    ctx.stopActiveTts();
    ctx.rerenderThread({ scroll: false });
    return;
  }

  ctx.stopActiveTts();

  const character = ctx.getCharacterById(message.characterId) || ctx.state.currentCharacter;
  const ttsConfig = resolveTtsConfig(ctx, character);

  if (!ttsConfig?.enabled && !ttsConfig?.voiceId && !ttsConfig?.id) {
    showToast('还没有设置语音');
    return;
  }

  const instance = playTTS(message.content || '', ttsConfig);
  ctx.setActiveTts(instance, message.id);
  scheduleTtsFallback(ctx, message.id, message.content);
  ctx.rerenderThread({ scroll: false });
}

function openEditUserSheet(ctx, message) {
  const sheet = el('div', 'thread-sheet edit-message-sheet');
  const head = sheetHead('改一下刚才的话', '保存后会从这里重新接上');

  const area = createTextarea('消息内容');
  area.className = 'chat-input-card edit-message-textarea';
  area.value = String(message.content || '');

  const save = button('保存并重来', 'primary', 'check');
  save.addEventListener('click', async () => {
    const text = area.value.trim();
    if (!text) {
      showToast('内容不能为空');
      return;
    }

    hideBottomSheet();

    message.content = text;

    if (message.groupId || ctx.state.currentGroup) {
      const groupId = message.groupId || ctx.state.currentGroup?.id;
      await setDB('group_messages', message.id, message);
      await deleteMessagesAfter(ctx, message, 'group_messages');
      await ctx.loadGroupMessages(groupId);
      await ctx.updateLatestGroupCache(groupId);
      await ctx.clearGroupUnread(groupId);
      await ctx.rerenderThread({ scroll: true });
      await generateGroupReplies(ctx, message);
      return;
    }

    await setDB('messages', message.id, message);
    await deleteMessagesAfter(ctx, message, 'messages');
    await ctx.loadPrivateMessages(message.characterId);
    await ctx.updateLatestPrivateCache(message.characterId);
    await ctx.rerenderThread({ scroll: true });
    await generateAssistantReply(ctx);
  });

  sheet.append(head, area, save);
  showBottomSheet(sheet);
}

function openEditAssistantSheet(ctx, message) {
  const sheet = el('div', 'thread-sheet edit-message-sheet');
  const head = sheetHead('改一下 TA 的回复', '只改这一条，不会自动重来');

  const area = createTextarea('回复内容');
  area.className = 'chat-input-card edit-message-textarea';
  area.value = String(message.content || '');

  const save = button('保存修改', 'primary', 'check');
  save.addEventListener('click', async () => {
    const text = area.value.trim();
    if (!text) {
      showToast('内容不能为空');
      return;
    }

    message.content = text;
    await setMessageToStore(message);

    ctx.updateCurrentMessage(message);

    if (message.groupId || ctx.state.currentGroup) {
      const groupId = message.groupId || ctx.state.currentGroup?.id;
      await ctx.updateLatestGroupCache(groupId);
      await ctx.clearGroupUnread(groupId);
    } else {
      await ctx.updateLatestPrivateCache(message.characterId);
    }

    hideBottomSheet();
    await ctx.rerenderThread({ scroll: false });
  });

  sheet.append(head, area, save);
  showBottomSheet(sheet);
}

async function deleteMessagesAfter(ctx, message, storeName) {
  const messageTime = new Date(message.timestamp || 0).getTime();

  const list = storeName === 'group_messages'
    ? await getByIndexDB('group_messages', 'groupId', message.groupId || ctx.state.currentGroup?.id)
    : await getByIndexDB('messages', 'characterId', message.characterId);

  for (const item of ctx.normalizeArray(list)) {
    const itemTime = new Date(item.timestamp || 0).getTime();

    if (item.id !== message.id && itemTime > messageTime) {
      await deleteDB(storeName, item.id);
    }
  }
}

async function setMessageToStore(message) {
  await setDB(message.groupId ? 'group_messages' : 'messages', message.id, message);
}

function createQuotedContent(ctx, text) {
  if (!ctx.state.quotedMessage) return text;

  const quoted = ctx.state.quotedMessage;
  const speaker = ctx.getSpeakerName(quoted.characterId);
  const preview = ctx.getMessagePreview(quoted);

  return `引用「${speaker}：${preview}」\n${text}`;
}

function createMessage(data = {}) {
  return {
    id: data.id || generateId(),
    role: data.role || 'user',
    content: data.content || '',
    thinking: data.thinking || '',
    thinkingSummary: data.thinkingSummary || '',
    thinkingTimeMs: Number(data.thinkingTimeMs || 0),
    characterId: data.characterId || '',
    groupId: data.groupId || '',
    type: data.type || 'text',
    imageBase64: data.imageBase64 || '',
    stickerId: data.stickerId || '',
    transferAmount: Number(data.transferAmount || 0),
    transferTargetId: data.transferTargetId || '',
    timestamp: data.timestamp || getNow(),
    toolCalls: Array.isArray(data.toolCalls) ? data.toolCalls : [],
    autoVoice: Boolean(data.autoVoice),
    voiceAutoPlaying: Boolean(data.voiceAutoPlaying)
  };
}

function resolveTtsConfig(ctx, character) {
  const settings = ctx.getSettings();
  const config = ctx.getChatConfig(character?.id || ctx.getChatTargetId());
  const voices = ctx.normalizeArray(settings.ttsVoices);

  const selectedVoice = config.ttsVoiceId
    ? voices.find((item) => item.id === config.ttsVoiceId)
    : null;

  return {
    ...(character?.ttsConfig || {}),
    ...(selectedVoice || {}),
    enabled: config.ttsEnabled || character?.ttsConfig?.enabled || selectedVoice?.enabled || false,
    voiceId: config.ttsVoiceId || selectedVoice?.voiceId || selectedVoice?.id || character?.ttsConfig?.voiceId || ''
  };
}

function scheduleTtsFallback(ctx, messageId, content = '') {
  const text = String(content || '').trim();
  const duration = Math.max(1800, Math.min(90000, text.length * 180));

  window.setTimeout(() => {
    if (ctx.state.activeTtsMessageId !== messageId) return;

    ctx.setActiveTts(null, '');
    ctx.rerenderThread({ scroll: false });
  }, duration);
}

function sheetAction(iconName, title, desc, handler) {
  const item = el('button', 'toolbox-item message-sheet-action');
  item.type = 'button';

  const icon = el('span', 'toolbox-icon');
  icon.appendChild(createIcon(iconName, 20));

  const text = el('span', 'toolbox-text');
  text.append(
    el('span', 'toolbox-title', title),
    el('span', 'toolbox-desc', desc || '')
  );

  item.append(icon, text, createIcon('arrow-right', 16));

  item.addEventListener('click', () => {
    hideBottomSheet();
    window.setTimeout(() => handler?.(), 180);
  });

  return item;
}

function sheetHead(title, subtitle) {
  const head = el('div', 'chat-sheet-head');
  head.append(
    el('div', 'chat-sheet-title', title),
    el('div', 'chat-sheet-subtitle', subtitle || '')
  );
  return head;
}

function button(text, variant = 'ghost', iconName = '') {
  const btn = el('button', variant === 'primary' ? 'chat-primary-btn' : 'chat-ghost-btn');
  btn.type = 'button';

  if (iconName) btn.appendChild(createIcon(iconName, 16));
  btn.appendChild(el('span', '', text));

  return btn;
}

function createTextarea(placeholder = '') {
  const node = document.createElement('textarea');
  node.placeholder = placeholder;
  node.rows = 5;
  return node;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// 依赖：../../core/storage.js(generateId,getNow,setDB,deleteDB,getByIndexDB)；../../core/ui.js(showToast,showBottomSheet,hideBottomSheet,showConfirm,createIcon)；../../core/tts.js(playTTS)；./thread-ai.js(generateAssistantReply,generateGroupReplies)
