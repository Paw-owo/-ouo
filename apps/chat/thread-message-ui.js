// apps/chat/thread-message-ui.js
// imports:
//   from '../../core/storage.js': getData
//   from '../../core/ui.js': showToast, showBottomSheet, hideBottomSheet
//   from './thread-actions.js': copyThreadMessage, quoteThreadMessage, editThreadMessage, deleteThreadMessage, regenerateThreadMessage, continueThreadMessage, playThreadTTS, stopThreadTTS
//   from './thinking-chain.js': createThinkingChainButton, buildThinkingSteps

import { getData } from '../../core/storage.js';
import { showToast, showBottomSheet, hideBottomSheet } from '../../core/ui.js';

import {
  copyThreadMessage,
  quoteThreadMessage,
  editThreadMessage,
  deleteThreadMessage,
  regenerateThreadMessage,
  continueThreadMessage,
  playThreadTTS,
  stopThreadTTS
} from './thread-actions.js';

import {
  createThinkingChainButton,
  buildThinkingSteps
} from './thinking-chain.js';

// ═══════════════════════════════════════
// 【消息入口】渲染单条聊天消息
// ═══════════════════════════════════════

export function createMessageRow(state, message, pageEl) {
  const role = message.role === 'user' ? 'user' : 'assistant';
  const mode = state.displayMode || 'bubble';
  const row = el('article', `chat-message-row role-${role} mode-${mode}`);

  row.dataset.messageId = message.id || '';
  row.dataset.role = role;

  const body = el('div', `chat-message-body role-${role}`);
  const thinkingRow = createThinkingRow(state, message);

  body.appendChild(createMessageAuthor(state, message));

  if (thinkingRow) {
    body.appendChild(thinkingRow);
  }

  body.append(
    createBubbleContent(state, message),
    createMessageActions(state, message, pageEl)
  );

  row.appendChild(body);
  return row;
}

// ═══════════════════════════════════════
// 【头像名字】渲染发言者头像和名称
// ═══════════════════════════════════════

export function createMessageAuthor(state, message) {
  const role = message.role === 'user' ? 'user' : 'assistant';
  const target = getTargetInfo(state, message);
  const author = el('div', `chat-message-author role-${role}`);

  const avatar = createMessageAvatar(target, role);
  const meta = el('div', 'chat-message-meta');
  meta.appendChild(el('div', 'chat-message-name', target.name));

  author.append(avatar, meta);
  return author;
}

function createMessageAvatar(target, role) {
  const avatar = el('span', `chat-message-avatar ${role === 'user' ? 'user' : 'ai'}`);

  if (target.avatar) {
    const img = document.createElement('img');
    img.src = target.avatar;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitial(target.name);
  }

  return avatar;
}

// ═══════════════════════════════════════
// 【Thinking入口】把新步骤链胶囊放到消息上方
// ═══════════════════════════════════════

function createThinkingRow(state, message) {
  const steps = buildThinkingSteps(message);
  if (!steps.length) return null;

  const role = message.role === 'user' ? 'user' : 'assistant';
  const target = getTargetInfo(state, message);
  const button = createThinkingChainButton(message, {
    roleName: target.name,
    characterName: target.name
  });

  if (!button) return null;

  const wrap = el('div', `chat-reasoning-stack role-${role} mode-${state.displayMode || 'bubble'}`);
  wrap.appendChild(button);
  return wrap;
}

// ═══════════════════════════════════════
// 【消息外壳】渲染气泡和对话模式共同结构
// ═══════════════════════════════════════

export function createBubbleContent(state, message) {
  const role = message.role === 'user' ? 'user' : 'ai';
  const bubble = el('div', `chat-message-bubble role-${role}`);

  if (message.type === 'sticker') bubble.classList.add('sticker-bubble');
  if (message.type === 'image') bubble.classList.add('image-bubble');
  if (isVoiceMessage(message)) bubble.classList.add('voice-bubble');

  if (message.quoteText) {
    bubble.append(createQuoteBlock(message.quoteText));
  }

  bubble.append(createMessageContent(state, message));

  if (message.editedAt) {
    bubble.append(el('div', 'chat-message-edited', '已编辑'));
  }

  return bubble;
}

export function createMessageContent(state, message) {
  const content = el('div', `chat-message-content ${message.type === 'sticker' ? 'sticker-content' : ''}`);

  if (isVoiceMessage(message)) {
    content.appendChild(createVoiceMessageCard(state, message));
    return content;
  }

  if (message.type === 'image' && message.imageBase64) {
    content.appendChild(createImageContent(message));
    return content;
  }

  if (message.type === 'sticker') {
    content.appendChild(createStickerContent(message));
    return content;
  }

  if (message.type === 'dice') {
    content.appendChild(createDiceCard(message));
    return content;
  }

  if (message.type === 'rps') {
    content.appendChild(createRpsCard(message));
    return content;
  }

  if (message.type === 'transfer') {
    content.appendChild(createTransferCard(message));
    return content;
  }

  if (['gift', 'shop_item', 'shop-item', 'purchase', 'item'].includes(String(message.type || ''))) {
    content.appendChild(createShopCard(message));
    return content;
  }

  splitCodeBlocks(String(message.content || '').trim()).forEach((part) => {
    const node = part.type === 'code' ? createCodeBlock(part) : createTextBlock(part.text);
    if (node) content.appendChild(node);
  });

  return content;
}

function createImageContent(message) {
  const wrap = el('section', 'chat-message-image-wrap');
  const frame = el('section', 'chat-message-image-frame');
  const img = document.createElement('img');
  img.src = message.imageBase64;
  img.alt = '';
  img.className = 'chat-message-image';
  frame.appendChild(img);

  const caption = String(message.content || '').trim();
  wrap.appendChild(frame);

  if (caption && caption !== '[图片]' && !caption.startsWith('图片：')) {
    wrap.appendChild(createTextBlock(caption));
  }

  return wrap;
}

function createQuoteBlock(text) {
  return el('section', 'chat-message-quote', String(text || ''));
}

// ═══════════════════════════════════════
// 【消息菜单】复制、引用、编辑、删除、重来、续写、朗读
// ═══════════════════════════════════════

export function createMessageActions(state, message, pageEl) {
  const actions = el('div', 'chat-message-actions');

  actions.append(
    createTokenChip(message),
    smallAction('quote', '引用', () => {
      quoteThreadMessage(state, message.id);
      renderQuotePreview(state, pageEl);
    }),
    smallAction('more', '更多', () => openMessageActionSheet(state, message, pageEl))
  );

  return actions;
}

function openMessageActionSheet(state, message, pageEl) {
  const sheet = el('div', 'chat-action-sheet');
  const title = el('div', 'chat-action-sheet-title', '这句话要怎么处理');
  const list = el('div', 'chat-action-sheet-list');

  list.append(
    sheetButton('复制', 'copy', async () => {
      await copyThreadMessage(message);
      hideBottomSheet();
    }),
    sheetButton('引用', 'quote', () => {
      quoteThreadMessage(state, message.id);
      renderQuotePreview(state, pageEl);
      hideBottomSheet();
    })
  );

  if (canEditMessage(message)) {
    list.append(sheetButton('编辑', 'edit', () => {
      hideBottomSheet();
      openEditSheet(state, message, pageEl);
    }));
  }

  list.append(sheetButton('删除', 'trash', async () => {
    hideBottomSheet();
    await deleteThreadMessage(state, message.id);
    await notifyMessageChanged(state, pageEl, 'delete', message);
  }));

  if (message.role === 'assistant') {
    list.append(
      sheetButton('重新生成', 'refresh', async () => {
        hideBottomSheet();
        await regenerateThreadMessage(state, message.id);
        await notifyMessageChanged(state, pageEl, 'regenerate', message);
      }),
      sheetButton('续写', 'continue', async () => {
        hideBottomSheet();
        await continueThreadMessage(state);
        await notifyMessageChanged(state, pageEl, 'continue', message);
      }),
      sheetButton('朗读', 'volume', async () => {
        hideBottomSheet();
        await playThreadTTS(state, message);
      }),
      sheetButton('停止朗读', 'stop', () => {
        stopThreadTTS();
        hideBottomSheet();
      })
    );
  }

  sheet.append(title, list);
  showBottomSheet(sheet);
}

function openEditSheet(state, message, pageEl) {
  if (!canEditMessage(message)) {
    showToast('这条不适合编辑');
    return;
  }

  const sheet = el('div', 'chat-edit-sheet');
  const title = el('div', 'chat-action-sheet-title', message.type === 'sticker' ? '改一下表情包描述' : '改一下这句话');

  const textarea = document.createElement('textarea');
  textarea.className = 'chat-edit-textarea';
  textarea.value = String(message.type === 'sticker' ? message.stickerDescription || message.content || '' : message.content || message.transcript || '');
  textarea.rows = 6;
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocorrect', 'off');
  textarea.setAttribute('spellcheck', 'false');

  const actions = el('div', 'chat-edit-actions');

  const cancel = safeButton('chat-edit-btn ghost', '取消');
  cancel.textContent = '取消';
  cancel.addEventListener('click', () => hideBottomSheet());

  const save = safeButton('chat-edit-btn primary', '保存');
  save.textContent = '保存';
  save.addEventListener('click', async () => {
    const value = textarea.value.trim();
    if (!value) {
      showToast('内容不能为空');
      return;
    }

    await editThreadMessage(state, message.id, value);
    hideBottomSheet();
    await notifyMessageChanged(state, pageEl, 'edit', {
      ...message,
      content: value
    });
  });

  actions.append(cancel, save);
  sheet.append(title, textarea, actions);
  showBottomSheet(sheet);

  requestAnimationFrame(() => textarea.focus());
}

async function notifyMessageChanged(state, pageEl, action, message) {
  if (typeof state?.onMessageChanged === 'function') {
    await state.onMessageChanged({ action, message, pageEl });
    return;
  }

  if (typeof state?.reloadAndRender === 'function') {
    await state.reloadAndRender();
    return;
  }

  if (typeof state?.refreshMessageListOnly === 'function') {
    state.refreshMessageListOnly({ keepScroll: action !== 'regenerate' && action !== 'continue' });
    return;
  }

  window.dispatchEvent(new CustomEvent('chat:message-changed', {
    detail: {
      action,
      messageId: message?.id || '',
      characterId: state?.characterId || '',
      groupId: state?.groupId || ''
    }
  }));
}

// ═══════════════════════════════════════
// 【文字内容】普通文本和代码块
// ═══════════════════════════════════════

function createTextBlock(text) {
  const block = el('div', 'chat-message-text');
  block.textContent = text || '';
  return block;
}

function createCodeBlock(part) {
  const wrap = el('section', 'chat-message-code');
  const lang = normalizeCodeLang(part.lang);
  const code = String(part.code || '');

  const top = el('div', 'chat-message-code-top');

  const meta = el('div', 'chat-message-code-meta');
  meta.append(
    createLineIcon('code'),
    el('span', 'chat-message-code-lang', lang)
  );

  const actions = el('div', 'chat-message-code-actions');
  actions.append(
    createCodeActionButton('复制', 'copy', () => copyCode(code)),
    createCodeActionButton('下载', 'download', () => downloadCodeFile(code, lang))
  );

  if (isHtmlCode(lang, code)) {
    actions.append(createCodeActionButton('预览', 'eye', () => previewHtmlCode(code)));
  }

  top.append(meta, actions);

  const pre = document.createElement('pre');
  pre.className = 'chat-message-code-pre';
  pre.textContent = code;

  const shouldCollapse = code.split('\n').length > 6 || code.length > 520;
  if (shouldCollapse) wrap.dataset.collapsed = 'true';

  wrap.append(top, pre);

  if (shouldCollapse) {
    const toggle = safeButton('chat-message-code-toggle', '展开代码');
    toggle.textContent = '展开全部';
    toggle.addEventListener('click', () => {
      const collapsed = wrap.dataset.collapsed === 'true';
      wrap.dataset.collapsed = collapsed ? 'false' : 'true';
      toggle.textContent = collapsed ? '收起' : '展开全部';
    });
    wrap.appendChild(toggle);
  }

  return wrap;
}

// ═══════════════════════════════════════
// 【语音消息】语音条、波形和折叠文字
// ═══════════════════════════════════════

function createVoiceMessageCard(state, message) {
  const card = el('section', 'chat-voice-card');
  card.dataset.open = 'false';
  card.dataset.playing = 'false';

  const bar = safeButton('chat-voice-bar', '播放语音');

  const playIcon = el('span', 'chat-voice-play');
  playIcon.appendChild(createLineIcon('volume'));

  const waves = el('span', 'chat-voice-waves');
  for (let index = 0; index < 5; index += 1) {
    waves.appendChild(el('i', ''));
  }

  const meta = el('span', 'chat-voice-meta', getVoiceDurationText(message));
  const arrow = el('span', 'chat-voice-arrow');
  arrow.appendChild(createLineIcon('chevron'));

  bar.append(playIcon, waves, meta, arrow);

  const transcript = el('div', 'chat-voice-transcript');
  transcript.appendChild(createTextBlock(getVoiceTranscript(message) || '这条语音还没有文字内容。'));

  bar.addEventListener('click', async () => {
    card.dataset.playing = 'true';
    try {
      await playThreadTTS(state, message);
    } catch (_) {
      showToast('语音播放失败');
    } finally {
      window.setTimeout(() => {
        card.dataset.playing = 'false';
      }, 360);
    }
  });

  arrow.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const open = card.dataset.open === 'true';
    card.dataset.open = open ? 'false' : 'true';
  });

  card.append(bar, transcript);
  return card;
}

function isVoiceMessage(message) {
  const type = String(message?.type || '').toLowerCase();
  return type === 'voice' || type === 'tts' || message?.voice === true || message?.tts === true || Boolean(message?.audioBase64 || message?.voiceAudioBase64 || message?.ttsAudioBase64);
}

function getVoiceTranscript(message) {
  return String(message.transcript || message.voiceText || message.ttsText || message.content || '').trim();
}

function getVoiceDurationText(message) {
  const seconds = Number(message.duration || message.voiceDuration || message.ttsDuration || 0);
  if (Number.isFinite(seconds) && seconds > 0) return `${Math.max(1, Math.round(seconds))}"`;
  const text = getVoiceTranscript(message);
  const guessed = Math.max(1, Math.ceil(text.length / 5));
  return `${Math.min(60, guessed)}"`;
}
// ═══════════════════════════════════════
// 【卡片消息】转账、商店礼物、表情包、骰子、猜拳
// ═══════════════════════════════════════

function createTransferCard(message) {
  const card = el('section', 'chat-mini-message-card transfer');
  const top = el('div', 'chat-mini-card-top');
  top.append(
    el('div', 'chat-mini-card-title', message.title || '小票据'),
    el('div', 'chat-mini-card-price', `￥${Number(message.transferAmount || message.amount || 0)}`)
  );

  const note = String(message.note || message.content || '').trim();
  card.append(top);
  if (note) card.appendChild(el('div', 'chat-mini-card-desc', note));
  return card;
}

function createShopCard(message) {
  const card = el('section', 'chat-mini-message-card shop');
  const image = pickImage(message.itemImage, message.imageBase64, message.image, message.cover, message.iconImage);

  if (image) {
    const cover = el('div', 'chat-mini-card-cover');
    const img = document.createElement('img');
    img.src = image;
    img.alt = '';
    cover.appendChild(img);
    card.appendChild(cover);
  }

  const body = el('div', 'chat-mini-card-body');
  body.append(
    el('div', 'chat-mini-card-title', message.itemName || message.title || message.name || '小礼物'),
    el('div', 'chat-mini-card-desc', message.itemDesc || message.description || message.content || 'TA 收到了一份小心意。')
  );

  const price = Number(message.itemPrice || message.price || 0);
  if (price > 0) {
    body.appendChild(el('div', 'chat-mini-card-price', `￥${price}`));
  }

  card.appendChild(body);
  return card;
}

function createStickerContent(message) {
  const wrap = el('section', 'chat-message-sticker-card');
  const image = pickImage(message.stickerImageBase64, message.imageBase64, message.image);
  const desc = String(message.stickerDescription || message.content || '').trim();

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.alt = desc || '';
    img.className = 'chat-message-sticker-image';
    wrap.appendChild(img);
  } else {
    wrap.appendChild(el('div', 'chat-message-sticker-placeholder', '表情包'));
  }

  return wrap;
}

function createDiceCard(message) {
  const value = normalizeDiceValue(message.diceValue || message.value || message.result);
  const sides = Number(message.diceSides || 6);
  const card = el('section', 'chat-game-card chat-dice-card');
  card.dataset.rolling = message.rolling ? 'true' : 'false';

  const icon = el('div', 'chat-game-icon dice');
  icon.appendChild(createDiceFace(value));

  const body = el('div', 'chat-game-body');
  body.append(
    el('div', 'chat-game-title', '骰子'),
    el('div', 'chat-game-result', value ? `摇到了 ${value} / ${sides}` : '正在摇骰子')
  );

  card.append(icon, body);
  return card;
}

function createDiceFace(value) {
  const face = el('div', `chat-dice-face value-${value || 0}`);
  const dotMap = {
    1: [5],
    2: [1, 9],
    3: [1, 5, 9],
    4: [1, 3, 7, 9],
    5: [1, 3, 5, 7, 9],
    6: [1, 3, 4, 6, 7, 9]
  };

  for (let index = 1; index <= 9; index += 1) {
    face.appendChild(el('span', dotMap[value]?.includes(index) ? 'active' : ''));
  }

  return face;
}

function createRpsCard(message) {
  const choice = normalizeRpsChoice(message.rpsChoice || message.choice || message.result);
  const card = el('section', 'chat-game-card chat-rps-card');
  card.dataset.flipping = message.rolling ? 'true' : 'false';

  const icon = el('div', 'chat-game-icon rps');
  icon.appendChild(createRpsIcon(choice));

  const body = el('div', 'chat-game-body');
  body.append(
    el('div', 'chat-game-title', '石头剪刀布'),
    el('div', 'chat-game-result', choice ? `出了 ${getRpsLabel(choice)}` : '正在出手')
  );

  if (message.rpsOpponentChoice || message.rpsOutcome) {
    body.appendChild(el('div', 'chat-game-note', buildRpsNote(message)));
  }

  card.append(icon, body);
  return card;
}

function createRpsIcon(choice) {
  const wrap = el('div', `chat-rps-icon ${choice || 'unknown'}`);
  wrap.appendChild(createLineIcon(
    choice === 'rock'
      ? 'rps-rock'
      : choice === 'paper'
        ? 'rps-paper'
        : choice === 'scissors'
          ? 'rps-scissors'
          : 'rps'
  ));
  return wrap;
}

function buildRpsNote(message) {
  const opponent = normalizeRpsChoice(message.rpsOpponentChoice);
  const outcome = String(message.rpsOutcome || '').trim();

  const parts = [];
  if (opponent) parts.push(`对方：${getRpsLabel(opponent)}`);
  if (outcome) parts.push(getRpsOutcomeLabel(outcome));

  return parts.join(' · ');
}

// ═══════════════════════════════════════
// 【引用预览】渲染输入框上方的引用条
// ═══════════════════════════════════════

export function renderQuotePreview(state, pageEl) {
  const inputBar = pageEl.querySelector('.chat-thread-input-bar');
  if (!inputBar) return;

  const old = pageEl.querySelector('.chat-quote-preview');
  if (old) old.remove();

  if (!state.quotedMessageId) return;

  const message = getVisibleMessages(state).find((item) => item.id === state.quotedMessageId);
  const text = message ? getPreviewText(message) : '已引用一条消息';

  const preview = el('section', 'chat-quote-preview');
  preview.append(
    createLineIcon('quote'),
    el('div', 'chat-quote-preview-text', text),
    createQuoteCancelButton(state, pageEl)
  );

  inputBar.parentNode.insertBefore(preview, inputBar);
}

function createQuoteCancelButton(state, pageEl) {
  const btn = safeButton('chat-quote-preview-close', '取消引用');
  btn.appendChild(createLineIcon('x'));
  btn.addEventListener('click', () => {
    state.quotedMessageId = '';
    renderQuotePreview(state, pageEl);
  });
  return btn;
}

// ═══════════════════════════════════════
// 【空状态】没有消息时的提示
// ═══════════════════════════════════════

export function createEmptyThread() {
  const empty = el('section', 'chat-empty');
  empty.append(
    el('div', 'chat-empty-title', '还没开始说话'),
    el('div', 'chat-empty-desc', '先发一句，TA 就会接住。')
  );
  return empty;
}

// ═══════════════════════════════════════
// 【数据读取】统一读取消息、用户档案和角色信息
// ═══════════════════════════════════════

function getVisibleMessages(state) {
  const list = state.mode === 'group' ? state.groupMessages : state.messages;
  const q = String(state.searchValue || '').trim().toLowerCase();
  const visible = list.slice(Math.max(0, list.length - state.visibleCount));

  if (!q) return visible;

  return visible.filter((message) => {
    return [
      message.content,
      message.transcript,
      message.voiceText,
      message.ttsText,
      message.stickerDescription,
      message.quoteText,
      message.thinkingSummary,
      message.itemName,
      message.itemDesc,
      message.title,
      message.description
    ].some((item) => String(item || '').toLowerCase().includes(q));
  });
}

function getPreviewText(message) {
  if (!message) return '';
  if (message.type === 'image') return '[图片]';
  if (message.type === 'sticker') return `[表情包] ${message.stickerDescription || message.content || ''}`.trim();
  if (message.type === 'transfer') return `[转账 ${Number(message.transferAmount || 0)}]`;
  if (['gift', 'shop_item', 'shop-item', 'purchase', 'item'].includes(String(message.type || ''))) {
    return `[小卡片] ${message.itemName || message.title || message.name || message.content || ''}`.trim();
  }
  if (isVoiceMessage(message)) return `[语音] ${getVoiceTranscript(message)}`.trim();
  if (message.type === 'dice') return `[骰子 ${normalizeDiceValue(message.diceValue || message.value || message.result) || ''}]`;
  if (message.type === 'rps') return `[石头剪刀布 ${getRpsLabel(normalizeRpsChoice(message.rpsChoice || message.choice || message.result))}]`;

  const text = String(message.content || '').trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function canEditMessage(message) {
  return ['text', 'voice', 'tts', 'sticker'].includes(String(message?.type || 'text')) && Boolean(String(message?.content || message?.stickerDescription || message?.transcript || '').trim());
}

function getTargetInfo(state, message) {
  if (message.role === 'user') {
    const user = getUserProfile();
    return {
      name: user.name || user.nickname || '我',
      avatar: pickImage(user.avatar, user.avatarUrl, user.imageBase64, user.image, user.iconImage, user.photo)
    };
  }

  if (state.mode === 'group') {
    return {
      name: message.characterName || message.name || 'TA',
      avatar: pickImage(
        message.characterAvatar,
        message.avatar,
        message.avatarUrl,
        message.imageBase64,
        message.iconImage,
        state.group?.avatar,
        state.group?.avatarUrl,
        state.group?.imageBase64,
        state.group?.iconImage
      )
    };
  }

  return {
    name: state.character?.name || message.characterName || 'TA',
    avatar: pickImage(
      message.characterAvatar,
      state.character?.avatar,
      state.character?.avatarUrl,
      state.character?.imageBase64,
      state.character?.iconImage,
      state.character?.image
    )
  };
}

function getUserProfile() {
  const settings = getData('app_settings') || {};
  const appUser = getData('app_user') || {};
  const profiles = getData('user_profiles') || [];
  const legacyProfiles = getData('app_user_profiles') || [];
  const activeId = getData('active_user_profile_id') || settings.activeUserProfileId || '';

  const list = Array.isArray(profiles) && profiles.length
    ? profiles
    : Array.isArray(legacyProfiles)
      ? legacyProfiles
      : [];

  if (list.length) {
    const active = list.find((item) => item.id === activeId) || list.find((item) => item.isDefault) || list[0];
    return {
      ...appUser,
      ...active
    };
  }

  const user = settings.user || appUser || {};
  return user && typeof user === 'object' ? user : {};
}

function pickImage(...values) {
  for (const value of values) {
    if (!value) continue;
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      const nested = pickImage(value.value, value.source, value.image, value.imageBase64, value.avatar, value.avatarUrl, value.iconImage, value.url, value.src, value.data);
      if (nested) return nested;
    }
  }
  return '';
}

// ═══════════════════════════════════════
// 【格式处理】代码、骰子、猜拳、token 和文件信息
// ═══════════════════════════════════════

function splitCodeBlocks(text) {
  const source = String(text || '');
  const result = [];
  const reg = /```(\w+)?\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = reg.exec(source))) {
    const prev = source.slice(lastIndex, match.index);
    if (prev) result.push({ type: 'text', text: prev });

    result.push({
      type: 'code',
      lang: match[1] || 'code',
      code: match[2] || ''
    });

    lastIndex = reg.lastIndex;
  }

  const tail = source.slice(lastIndex);
  if (tail) result.push({ type: 'text', text: tail });
  if (!result.length) result.push({ type: 'text', text: source });

  return result;
}

function normalizeRpsChoice(value) {
  const text = String(value || '').trim().toLowerCase();
  if (['rock', 'stone', '石头'].includes(text)) return 'rock';
  if (['paper', '布'].includes(text)) return 'paper';
  if (['scissors', 'scissor', '剪刀'].includes(text)) return 'scissors';
  return '';
}

function getRpsLabel(choice) {
  if (choice === 'rock') return '石头';
  if (choice === 'paper') return '布';
  if (choice === 'scissors') return '剪刀';
  return '未知';
}

function getRpsOutcomeLabel(outcome) {
  if (outcome === 'win') return '赢了';
  if (outcome === 'lose') return '输了';
  if (outcome === 'draw') return '平局';
  return outcome;
}

function normalizeDiceValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number < 1 || number > 6) return 0;
  return Math.floor(number);
}

function normalizeCodeLang(lang) {
  const value = String(lang || 'code').trim().toLowerCase();
  return value || 'code';
}

function isHtmlCode(lang, code) {
  const value = normalizeCodeLang(lang);
  if (['html', 'htm'].includes(value)) return true;
  return /<!doctype html|<html[\s>]|<body[\s>]|<div[\s>]|<script[\s>]/i.test(String(code || ''));
}

function estimateMessageTokens(message) {
  const text = [
    message.content || '',
    message.transcript || '',
    message.voiceText || '',
    message.ttsText || '',
    message.quoteText || '',
    message.thinking || '',
    message.stickerDescription || '',
    normalizeToolCalls(message.toolCalls).map((tool) => normalizeToolValue(tool)).join(' ')
  ].join('\n');

  return estimateTokens(text);
}

function estimateTokens(text) {
  const value = String(text || '');
  if (!value.trim()) return 0;

  const cjk = (value.match(/[\u3400-\u9fff]/g) || []).length;
  const latinWords = (value.replace(/[\u3400-\u9fff]/g, ' ').match(/[a-zA-Z0-9_]+/g) || []).length;
  const punctuation = (value.match(/[^\s\u3400-\u9fffa-zA-Z0-9_]/g) || []).length;
  const spaces = (value.match(/\s+/g) || []).length;

  return Math.max(
    Math.ceil(cjk * 1.05 + latinWords * 1.25 + punctuation * 0.45 + spaces * 0.15),
    value.trim() ? 1 : 0
  );
}

function normalizeToolCalls(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === false) return [];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  return [value].filter(Boolean);
}

function normalizeToolValue(value) {
  if (typeof value === 'string') return value.trim();

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch (_) {
      return '';
    }
  }

  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function getCodeExtension(lang, code) {
  const value = normalizeCodeLang(lang);
  const map = {
    html: 'html',
    htm: 'html',
    css: 'css',
    js: 'js',
    javascript: 'js',
    json: 'json',
    md: 'md',
    markdown: 'md',
    txt: 'txt',
    python: 'py',
    py: 'py',
    typescript: 'ts',
    ts: 'ts'
  };

  if (map[value]) return map[value];
  if (isHtmlCode(value, code)) return 'html';
  return 'txt';
}

function getCodeMime(lang, code) {
  const ext = getCodeExtension(lang, code);
  const map = {
    html: 'text/html;charset=utf-8',
    css: 'text/css;charset=utf-8',
    js: 'text/javascript;charset=utf-8',
    json: 'application/json;charset=utf-8',
    md: 'text/markdown;charset=utf-8',
    py: 'text/x-python;charset=utf-8',
    ts: 'text/typescript;charset=utf-8',
    txt: 'text/plain;charset=utf-8'
  };

  return map[ext] || 'text/plain;charset=utf-8';
}

function formatFileTime() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
}

// ═══════════════════════════════════════
// 【按钮工具】复制代码、下载代码、预览 HTML
// ═══════════════════════════════════════

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(String(code || ''));
    showToast('代码复制好啦');
  } catch (_) {
    showToast('复制失败');
  }
}

function downloadCodeFile(code, lang) {
  const filename = `chat-code-${formatFileTime()}.${getCodeExtension(lang, code)}`;
  const blob = new Blob([String(code || '')], { type: getCodeMime(lang, code) });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 800);
  showToast('代码文件已下载');
}

function previewHtmlCode(code) {
  const sheet = el('div', 'chat-html-preview-sheet');

  const title = el('div', 'chat-html-preview-title');
  title.append(
    el('span', '', 'HTML 预览'),
    createCodeActionButton('关闭', 'x', () => hideBottomSheet())
  );

  const frame = document.createElement('iframe');
  frame.className = 'chat-html-preview-frame';
  frame.setAttribute('sandbox', 'allow-scripts allow-forms');
  frame.setAttribute('frameborder', '0');
  frame.srcdoc = String(code || '');

  sheet.append(title, frame);
  showBottomSheet(sheet);
}

// ═══════════════════════════════════════
// 【小按钮】消息操作按钮和代码操作按钮
// ═══════════════════════════════════════

function smallAction(iconName, label, onClick) {
  const btn = safeButton('chat-message-action-btn', label);
  btn.appendChild(createLineIcon(iconName));
  btn.addEventListener('click', onClick);
  return btn;
}

function createTokenChip(message) {
  const chip = el('span', 'chat-message-token-chip');
  chip.textContent = `${estimateMessageTokens(message)}t`;
  return chip;
}

function sheetButton(text, icon, onClick) {
  const btn = safeButton('chat-action-sheet-item', text);
  btn.append(createLineIcon(icon), el('span', '', text));
  btn.addEventListener('click', onClick);
  return btn;
}

function createCodeActionButton(text, icon, onClick) {
  const btn = safeButton('chat-message-code-action', text);
  btn.append(createLineIcon(icon), el('span', '', text));
  btn.addEventListener('click', onClick);
  return btn;
}

// ═══════════════════════════════════════
// 【SVG图标】聊天消息里使用的线条图标
// ═══════════════════════════════════════

function createLineIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const addPath = (d) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
  };

  const addRect = (x, y, width, height, rx = 2) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', width);
    rect.setAttribute('height', height);
    rect.setAttribute('rx', rx);
    svg.appendChild(rect);
  };

  const addCircle = (cx, cy, r) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', r);
    svg.appendChild(circle);
  };

  if (name === 'thought') {
    addPath('M7.5 16.5h9');
    addPath('M9 20h6');
    addPath('M8 13.5c-1.4-1.1-2.2-2.8-2.2-4.6A6.2 6.2 0 0 1 12 2.8a6.2 6.2 0 0 1 6.2 6.1c0 1.8-.8 3.5-2.2 4.6-.7.5-1 1.2-1 2H9c0-.8-.3-1.5-1-2Z');
  } else if (name === 'memory') {
    addRect('5', '4', '14', '16', '3');
    addPath('M8 8h8');
    addPath('M8 12h6');
    addPath('M8 16h5');
  } else if (name === 'web') {
    addCircle('12', '12', '8');
    addPath('M4 12h16');
    addPath('M12 4c2 2.2 3 4.8 3 8s-1 5.8-3 8');
    addPath('M12 4c-2 2.2-3 4.8-3 8s1 5.8 3 8');
  } else if (name === 'card') {
    addRect('4', '6', '16', '12', '3');
    addPath('M7 10h10');
    addPath('M7 14h5');
  } else if (name === 'back') {
    addPath('m15 18-6-6 6-6');
  } else if (name === 'tool' || name === 'edit') {
    addPath('M14.5 4.5 19 9l-9.5 9.5H5v-4.5L14.5 4.5Z');
    addPath('M13 6l5 5');
  } else if (name === 'chevron') {
    addPath('m9 6 6 6-6 6');
  } else if (name === 'check') {
    addPath('m5 12 4 4L19 6');
  } else if (name === 'x' || name === 'stop') {
    addPath('M6 6l12 12');
    addPath('M18 6 6 18');
  } else if (name === 'copy') {
    addPath('M9 9h10v10H9z');
    addPath('M5 15H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v1');
  } else if (name === 'download') {
    addPath('M12 4v10');
    addPath('m8 10 4 4 4-4');
    addPath('M5 20h14');
  } else if (name === 'eye') {
    addPath('M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z');
    addCircle('12', '12', '2.5');
  } else if (name === 'code') {
    addPath('m9 8-4 4 4 4');
    addPath('m15 8 4 4-4 4');
  } else if (name === 'quote') {
    addPath('M8 10h-3c0-3 1.4-5 4-6');
    addPath('M18 10h-3c0-3 1.4-5 4-6');
    addPath('M5 10v7h6v-7H5z');
    addPath('M15 10v7h6v-7h-6z');
  } else if (name === 'more') {
    addCircle('6', '12', '1.2');
    addCircle('12', '12', '1.2');
    addCircle('18', '12', '1.2');
  } else if (name === 'refresh') {
    addPath('M20 12a8 8 0 0 1-13.6 5.7');
    addPath('M4 12A8 8 0 0 1 17.6 6.3');
    addPath('M18 3v4h-4');
    addPath('M6 21v-4h4');
  } else if (name === 'volume') {
    addPath('M4 10v4h4l5 4V6L8 10H4Z');
    addPath('M16 9.5a4 4 0 0 1 0 5');
    addPath('M18.5 7a7 7 0 0 1 0 10');
  } else if (name === 'trash') {
    addPath('M5 7h14');
    addPath('M10 11v6');
    addPath('M14 11v6');
    addPath('M8 7l1-3h6l1 3');
    addPath('M7 7l1 14h8l1-14');
  } else if (name === 'continue') {
    addPath('M5 12h12');
    addPath('m13 8 4 4-4 4');
  } else if (name === 'rps-rock') {
    addPath('M7 11c0-2 1.3-3.5 3-3.5h3.5c2 0 3.5 1.5 3.5 3.5v2.5c0 2.8-2.2 5-5 5s-5-2.2-5-5V11Z');
    addPath('M9 8V6.5');
    addPath('M12 7.5V6');
    addPath('M15 8V6.5');
  } else if (name === 'rps-paper') {
    addPath('M6 12V7.5a1.5 1.5 0 0 1 3 0V12');
    addPath('M9 12V5.5a1.5 1.5 0 0 1 3 0V12');
    addPath('M12 12V6.5a1.5 1.5 0 0 1 3 0V12');
    addPath('M15 12V8.5a1.5 1.5 0 0 1 3 0v5c0 3-2.3 5.5-6 5.5-3.2 0-6-2.2-6-5.5V12Z');
  } else if (name === 'rps-scissors') {
    addPath('M6 6l12 12');
    addPath('M18 6 6 18');
    addCircle('6', '6', '2');
    addCircle('6', '18', '2');
  } else if (name === 'rps') {
    addRect('5', '5', '14', '14', '4');
    addPath('M8 12h8');
  } else {
    addCircle('12', '12', '8');
  }

  return svg;
}

// ═══════════════════════════════════════
// 【DOM工具】安全按钮和节点创建
// ═══════════════════════════════════════

function safeButton(className, label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = className;
  if (label) btn.setAttribute('aria-label', label);

  btn.addEventListener('touchstart', (event) => {
    event.stopPropagation();
  }, { passive: true });

  btn.addEventListener('touchmove', (event) => {
    event.stopPropagation();
  }, { passive: true });

  btn.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  return btn;
}

function getInitial(name) {
  const text = String(name || '').trim();
  return text ? text.slice(0, 1).toUpperCase() : 'A';
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// 依赖：../../core/storage.js(getData)；../../core/ui.js(showToast,showBottomSheet,hideBottomSheet)；./thread-actions.js(copyThreadMessage,quoteThreadMessage,editThreadMessage,deleteThreadMessage,regenerateThreadMessage,continueThreadMessage,playThreadTTS,stopThreadTTS)；./thinking-chain.js(createThinkingChainButton,buildThinkingSteps)
