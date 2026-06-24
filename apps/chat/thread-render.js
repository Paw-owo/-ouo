// apps/chat/thread-render.js
// imports:
//   from '../../core/storage.js': getData
//   from '../../core/ui.js': showToast, showBottomSheet, hideBottomSheet
//   from './thread-actions.js': copyThreadMessage, quoteThreadMessage, editThreadMessage, deleteThreadMessage, regenerateThreadMessage, continueThreadMessage, playThreadTTS, stopThreadTTS

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

const RENDER_STYLE_ID = 'chat-thread-render-style';

export function renderThreadMessages(state, pageEl) {
  injectStyle();

  const list = pageEl.querySelector('#chat-thread-list');
  if (!list) return;

  const wasNearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 140;
  const messages = getVisibleMessages(state);

  list.replaceChildren();

  if (!messages.length) {
    list.appendChild(createEmptyThread());
    renderQuotePreview(state, pageEl);
    return;
  }

  messages.forEach((message) => {
    list.appendChild(createMessageRow(state, message, pageEl));
  });

  renderQuotePreview(state, pageEl);

  requestAnimationFrame(() => {
    if (wasNearBottom || messages.length <= 2) {
      list.scrollTop = list.scrollHeight;
    }
  });
}

function createMessageRow(state, message, pageEl) {
  const role = message.role === 'user' ? 'user' : 'assistant';
  const mode = state.displayMode || 'bubble';
  const row = el('article', `chat-message-row role-${role} mode-${mode}`);
  row.dataset.messageId = message.id || '';
  row.dataset.role = role;

  const body = el('div', `chat-message-body role-${role}`);
  body.append(
    createMessageAuthor(state, message),
    createBubbleContent(state, message),
    createMessageActions(state, message, pageEl)
  );

  row.append(
    createReasoningStack(message, role, mode),
    body
  );

  return row;
}

function createReasoningStack(message, role, mode = 'bubble') {
  const stack = el('section', `chat-reasoning-stack role-${role} mode-${mode}`);

  if (message.thinking) {
    stack.appendChild(createThinkingCard(message));
  }

  normalizeToolCalls(message.toolCalls).forEach((tool, index) => {
    stack.appendChild(createToolCard(tool, index));
  });

  if (!stack.children.length) {
    stack.hidden = true;
  }

  return stack;
}

function createThinkingCard(message) {
  const card = el('section', 'chat-fold-card chat-thinking-card');
  card.dataset.open = 'false';

  const toggle = el('button', 'chat-fold-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');

  const left = el('span', 'chat-fold-left');
  left.append(
    createLineIcon('thought'),
    el('span', 'chat-fold-summary', normalizeText(message.thinkingSummary) || summarizeThinking(message.thinking))
  );

  const arrow = el('span', 'chat-fold-arrow');
  arrow.appendChild(createLineIcon('chevron'));

  toggle.append(left, arrow);

  const detail = el('div', 'chat-fold-detail');
  const inner = el('div', 'chat-fold-detail-inner thinking');
  inner.appendChild(createThinkingDetail(message.thinking));
  detail.appendChild(inner);

  toggle.addEventListener('click', () => toggleFold(card, toggle));

  card.append(toggle, detail);
  return card;
}

function createToolCard(tool, index) {
  const card = el('section', `chat-fold-card chat-tool-card status-${getToolStatus(tool)}`);
  card.dataset.open = 'false';

  const toolName = normalizeText(tool.name || tool.toolName || tool.title) || `工具 ${index + 1}`;
  const status = getToolStatus(tool);

  const toggle = el('button', 'chat-fold-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');

  const left = el('span', 'chat-fold-left');
  left.append(
    createLineIcon('tool'),
    el('span', 'chat-tool-name', toolName),
    createToolStatusMark(status),
    el('span', 'chat-tool-status-text', getToolStatusText(tool))
  );

  const arrow = el('span', 'chat-fold-arrow');
  arrow.appendChild(createLineIcon('chevron'));

  toggle.append(left, arrow);

  const detail = el('div', 'chat-fold-detail');
  const inner = el('div', 'chat-fold-detail-inner tool');
  inner.appendChild(createToolDetail(tool));
  detail.appendChild(inner);

  toggle.addEventListener('click', () => toggleFold(card, toggle));

  card.append(toggle, detail);
  return card;
}

function toggleFold(card, toggle) {
  const open = card.dataset.open === 'true';
  card.dataset.open = open ? 'false' : 'true';
  toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
}

function createThinkingDetail(text) {
  const wrap = el('div', 'chat-thinking-detail');
  const line = el('span', 'chat-thinking-line');
  const content = el('pre', 'chat-thinking-pre');
  content.textContent = normalizeMultiline(text) || 'TA 在认真整理这句话。';
  wrap.append(line, content);
  return wrap;
}

function createToolDetail(tool) {
  const wrap = el('div', 'chat-tool-detail');
  const params = normalizeToolValue(tool.query || tool.input || tool.arguments || tool.params);
  const result = normalizeToolValue(tool.result || tool.output || tool.content || tool.detail);
  const error = normalizeToolValue(tool.error || tool.message);

  wrap.appendChild(createToolBlock('参数', params || '没有记录参数'));
  wrap.appendChild(createToolBlock('结果', error ? `没有成功：${error}` : result || '没有记录返回值'));

  return wrap;
}

function createToolBlock(label, value) {
  const block = el('section', 'chat-tool-block');
  block.append(
    el('div', 'chat-tool-label', label),
    el('pre', 'chat-tool-pre', value)
  );
  return block;
}

function createToolStatusMark(status) {
  const mark = el('span', `chat-tool-status-mark ${status}`);
  if (status === 'running') return mark;
  mark.appendChild(createLineIcon(status === 'done' ? 'check' : 'x'));
  return mark;
}

function createMessageAuthor(state, message) {
  const role = message.role === 'user' ? 'user' : 'assistant';
  const target = getTargetInfo(state, message);
  const author = el('div', `chat-message-author role-${role}`);

  const avatar = createMessageAvatar(target, role);
  const meta = el('div', 'chat-message-meta');
  meta.append(
    el('div', 'chat-message-name', target.name),
    el('div', 'chat-message-time', formatTime(message.timestamp))
  );

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

function createBubbleContent(state, message) {
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

function createMessageContent(state, message) {
  const content = el('div', `chat-message-content ${message.type === 'sticker' ? 'sticker-content' : ''}`);

  if (isVoiceMessage(message)) {
    content.appendChild(createVoiceMessageCard(state, message));
    return content;
  }

  if (message.type === 'image' && message.imageBase64) {
    const frame = el('section', 'chat-message-image-frame');
    const img = document.createElement('img');
    img.src = message.imageBase64;
    img.alt = '';
    img.className = 'chat-message-image';
    frame.appendChild(img);

    const caption = String(message.content || '').trim();
    content.appendChild(frame);
    if (caption && caption !== '[图片]' && !caption.startsWith('图片：')) {
      content.appendChild(createTextBlock(caption));
    }

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
    content.appendChild(part.type === 'code' ? createCodeBlock(part) : createTextBlock(part.text));
  });

  return content;
}

function createVoiceMessageCard(state, message) {
  const card = el('section', 'chat-voice-card');
  card.dataset.open = 'false';
  card.dataset.playing = 'false';

  const bar = el('button', 'chat-voice-bar');
  bar.type = 'button';
  bar.setAttribute('aria-label', '播放语音');

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
    const toggle = el('button', 'chat-message-code-toggle');
    toggle.type = 'button';
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

function createCodeActionButton(text, icon, onClick) {
  const btn = el('button', 'chat-message-code-action');
  btn.type = 'button';
  btn.append(createLineIcon(icon), el('span', '', text));
  btn.addEventListener('click', onClick);
  return btn;
}

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

function createQuoteBlock(text) {
  return el('section', 'chat-message-quote', String(text || ''));
}

function createMessageActions(state, message, pageEl) {
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

function createTokenChip(message) {
  return el('span', 'chat-message-token-chip', `${estimateMessageTokens(message)}t`);
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
    renderThreadMessages(state, pageEl);
  }));

  if (message.role === 'assistant') {
    list.append(
      sheetButton('重新生成', 'refresh', async () => {
        hideBottomSheet();
        await regenerateThreadMessage(state, message.id);
        renderThreadMessages(state, pageEl);
      }),
      sheetButton('续写', 'continue', async () => {
        hideBottomSheet();
        await continueThreadMessage(state);
        renderThreadMessages(state, pageEl);
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

function canEditMessage(message) {
  return ['text', 'voice', 'tts', 'sticker'].includes(String(message?.type || 'text')) && Boolean(String(message?.content || message?.stickerDescription || message?.transcript || '').trim());
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

  const cancel = el('button', 'chat-edit-btn ghost', '取消');
  cancel.type = 'button';
  cancel.addEventListener('click', () => hideBottomSheet());

  const save = el('button', 'chat-edit-btn primary', '保存');
  save.type = 'button';
  save.addEventListener('click', async () => {
    const value = textarea.value.trim();
    if (!value) {
      showToast('内容不能为空');
      return;
    }

    await editThreadMessage(state, message.id, value);
    hideBottomSheet();
    renderThreadMessages(state, pageEl);
  });

  actions.append(cancel, save);
  sheet.append(title, textarea, actions);
  showBottomSheet(sheet);

  requestAnimationFrame(() => textarea.focus());
}

function sheetButton(text, icon, onClick) {
  const btn = el('button', 'chat-action-sheet-item');
  btn.type = 'button';
  btn.append(createLineIcon(icon), el('span', '', text));
  btn.addEventListener('click', onClick);
  return btn;
}

function renderQuotePreview(state, pageEl) {
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
  const btn = el('button', 'chat-quote-preview-close');
  btn.type = 'button';
  btn.setAttribute('aria-label', '取消引用');
  btn.appendChild(createLineIcon('x'));
  btn.addEventListener('click', () => {
    state.quotedMessageId = '';
    renderQuotePreview(state, pageEl);
  });
  return btn;
}

function createEmptyThread() {
  const empty = el('section', 'chat-empty');
  empty.append(
    el('div', 'chat-empty-title', '这里还安安静静的'),
    el('div', 'chat-empty-desc', '先递一句话过去，TA 会接住你。')
  );
  return empty;
}

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

function normalizeToolCalls(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function getToolStatus(tool) {
  const status = normalizeText(tool.status || tool.state);
  if (['running', 'loading', 'pending', 'calling'].includes(status)) return 'running';
  if (['error', 'failed', 'fail'].includes(status)) return 'error';
  return 'done';
}

function getToolStatusText(tool) {
  const status = getToolStatus(tool);
  if (status === 'running') return '调用中...';
  if (status === 'error') return '没有成功';

  const summary = normalizeText(tool.summary || tool.resultSummary || tool.result || tool.output || tool.content);
  return summary ? trimOneLine(summary, 22) : '已完成';
}

function summarizeThinking(text) {
  const clean = normalizeText(text);
  if (!clean) return 'TA 在整理思路';
  return clean.length > 26 ? `${clean.slice(0, 26)}…` : clean;
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

function normalizeDiceValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number < 1 || number > 6) return 0;
  return Math.floor(number);
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

function normalizeText(value) {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim();

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value).replace(/\s+/g, ' ').trim();
    } catch (_) {
      return '';
    }
  }

  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeMultiline(value) {
  if (typeof value === 'string') return value.trim();

  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch (_) {
      return '';
    }
  }

  return String(value || '').trim();
}

function trimOneLine(text, max) {
  const clean = normalizeText(text);
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
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

function formatTime(value) {
  if (!value) return '';

  const time = new Date(value);
  if (Number.isNaN(time.getTime())) return '';

  const pad = (number) => String(number).padStart(2, '0');

  return [
    time.getFullYear(),
    pad(time.getMonth() + 1),
    pad(time.getDate())
  ].join('-') + ' ' + [
    pad(time.getHours()),
    pad(time.getMinutes())
  ].join(':');
}

function smallAction(iconName, text, onClick) {
  const btn = el('button', 'chat-message-action-btn');
  btn.type = 'button';
  btn.append(createLineIcon(iconName), el('span', '', text));
  btn.addEventListener('click', onClick);
  return btn;
}

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

function injectStyle() {
  if (document.getElementById(RENDER_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = RENDER_STYLE_ID;
  style.textContent = `
    .chat-message-row {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
      animation: chatMessageIn 200ms ease both;
    }

    .chat-message-row.role-user {
      align-items: flex-end;
    }

    .chat-message-row.role-assistant {
      align-items: flex-start;
    }

    .chat-message-body {
      max-width: min(82%, 620px);
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-width: 0;
    }

    .chat-message-body.role-user {
      align-items: flex-end;
    }

    .chat-message-body.role-assistant {
      align-items: flex-start;
    }

    .chat-message-row.mode-dialog {
      gap: 4px;
      margin: 2px 0 10px;
    }

    .chat-message-row.mode-dialog .chat-message-body {
      width: auto;
      max-width: min(76%, 620px);
    }

    .chat-message-row.mode-dialog.role-user .chat-message-body {
      align-items: flex-end;
    }

    .chat-message-row.mode-dialog.role-assistant .chat-message-body {
      align-items: flex-start;
    }

    .chat-message-author {
      max-width: 100%;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .chat-message-author.role-user {
      flex-direction: row-reverse;
      text-align: right;
    }

    .chat-message-author.role-assistant {
      flex-direction: row;
      text-align: left;
    }

    .chat-message-avatar {
      width: 30px;
      height: 30px;
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: 12px;
      font-weight: 600;
    }

    .chat-message-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .chat-message-meta {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .chat-message-name {
      max-width: 132px;
      color: var(--text-primary);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .chat-message-time {
      max-width: 136px;
      color: var(--text-hint);
      font-size: 10px;
      line-height: 1.25;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .chat-message-bubble {
      min-width: 0;
      max-width: 100%;
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 11px 14px;
      border-radius: var(--bubble-radius);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
    }

    .chat-message-bubble.role-user {
      background: var(--bubble-user-bg);
      color: var(--bubble-user-text);
      align-items: flex-start;
    }

    .chat-message-bubble.role-ai {
      background: var(--bubble-ai-bg);
      color: var(--bubble-ai-text);
      align-items: flex-start;
    }

    .chat-message-row.role-user .chat-message-bubble,
    .chat-message-row.role-assistant .chat-message-bubble {
      border-radius: var(--bubble-radius);
    }

    .chat-message-bubble.sticker-bubble,
    .chat-message-bubble.image-bubble {
      padding: 8px;
      background: var(--bg-card);
      color: var(--text-primary);
    }

    .chat-message-bubble.voice-bubble {
      min-width: 168px;
    }

    .chat-message-row.mode-dialog .chat-message-bubble {
      width: auto;
      max-width: 100%;
      padding: 0;
      border-radius: 0;
      background: transparent;
      color: var(--text-primary);
      box-shadow: none;
      overflow: visible;
    }

    .chat-message-row.mode-dialog.role-user .chat-message-bubble {
      margin-right: 38px;
    }

    .chat-message-row.mode-dialog.role-assistant .chat-message-bubble {
      margin-left: 38px;
    }

    .chat-message-row.mode-dialog .chat-message-bubble.sticker-bubble,
    .chat-message-row.mode-dialog .chat-message-bubble.image-bubble {
      padding: 0;
      background: transparent;
      box-shadow: none;
    }

    .chat-message-content {
      width: 100%;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .chat-message-row.mode-dialog .chat-message-content {
      width: auto;
      max-width: 100%;
    }

    .chat-message-row.mode-dialog.role-user .chat-message-content {
      align-items: flex-end;
    }

    .chat-message-row.mode-dialog.role-assistant .chat-message-content {
      align-items: flex-start;
    }

    .chat-message-text {
      width: 100%;
      font-size: var(--font-size-base);
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .chat-message-row.mode-dialog .chat-message-text {
      width: auto;
      max-width: min(100%, 520px);
      color: var(--text-primary);
      font-size: var(--font-size-base);
      line-height: 1.72;
    }

    .chat-message-row.mode-dialog.role-user .chat-message-text {
      text-align: left;
    }

    .chat-message-row.mode-dialog.role-assistant .chat-message-text {
      text-align: left;
    }

    .chat-message-content.sticker-content {
      width: auto;
      line-height: 1;
      white-space: normal;
    }

    .chat-message-edited {
      color: var(--text-hint);
      font-size: 11px;
      line-height: 1.3;
    }

    .chat-message-row.mode-dialog .chat-message-edited {
      opacity: 0.72;
    }

    .chat-message-image-frame {
      width: min(64vw, 260px);
      max-height: 320px;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 18px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .chat-message-image {
      display: block;
      width: 100%;
      max-height: 320px;
      object-fit: contain;
      border-radius: 18px;
    }

    .chat-message-sticker-card {
      width: 136px;
      max-width: 136px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
    }

    .chat-message-sticker-image {
      width: 128px;
      height: 128px;
      display: block;
      object-fit: contain;
      border-radius: 18px;
      background: var(--surface-muted);
    }

    .chat-message-sticker-placeholder {
      width: 128px;
      height: 128px;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
      border-radius: 18px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: 14px;
      line-height: 1.5;
      text-align: center;
    }

    .chat-message-quote,
    .chat-message-code,
    .chat-game-card,
    .chat-fold-card,
    .chat-mini-message-card,
    .chat-voice-card {
      border-radius: 16px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .chat-message-quote {
      width: 100%;
      padding: 9px 10px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.5;
      word-break: break-word;
    }

    .chat-message-row.mode-dialog .chat-message-quote {
      width: auto;
      max-width: min(100%, 460px);
      padding: 8px 10px;
      opacity: 0.82;
    }

    .chat-voice-card {
      width: min(100%, 260px);
      overflow: hidden;
      color: var(--text-primary);
    }

    .chat-message-row.mode-dialog .chat-voice-card {
      width: min(100%, 300px);
    }

    .chat-voice-bar {
      width: 100%;
      min-height: 46px;
      display: grid;
      grid-template-columns: auto 1fr auto auto;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      transition: all 200ms ease;
    }

        .chat-voice-bar:active {
      transform: scale(0.98);
    }

    .chat-voice-play {
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--accent);
      box-shadow: var(--shadow-sm);
    }

    .chat-voice-waves {
      min-width: 76px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }

    .chat-voice-waves i {
      width: 3px;
      height: 12px;
      display: block;
      border-radius: 999px;
      background: currentColor;
      opacity: 0.42;
      transform-origin: center;
      animation: chatVoiceWave 900ms ease-in-out infinite;
    }

    .chat-voice-waves i:nth-child(2) {
      height: 18px;
      animation-delay: 100ms;
    }

    .chat-voice-waves i:nth-child(3) {
      height: 24px;
      animation-delay: 200ms;
    }

    .chat-voice-waves i:nth-child(4) {
      height: 16px;
      animation-delay: 300ms;
    }

    .chat-voice-waves i:nth-child(5) {
      height: 20px;
      animation-delay: 400ms;
    }

    .chat-voice-card[data-playing="false"] .chat-voice-waves i {
      animation-play-state: paused;
    }

    .chat-voice-meta {
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.35;
      white-space: nowrap;
    }

    .chat-voice-arrow {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--text-hint);
      transition: all 200ms ease;
    }

    .chat-voice-card[data-open="true"] .chat-voice-arrow {
      transform: rotate(90deg);
    }

    .chat-voice-transcript {
      max-height: 0;
      overflow: hidden;
      opacity: 0;
      transition: all 200ms ease;
    }

    .chat-voice-card[data-open="true"] .chat-voice-transcript {
      max-height: 220px;
      opacity: 1;
      overflow-y: auto;
      padding: 0 12px 12px;
    }

    .chat-voice-transcript .chat-message-text {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.65;
    }

    .chat-reasoning-stack {
      width: min(82%, 620px);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .chat-reasoning-stack.role-user {
      align-self: flex-end;
    }

    .chat-reasoning-stack.role-assistant {
      align-self: flex-start;
    }

    .chat-reasoning-stack.mode-dialog {
      width: min(76%, 620px);
    }

    .chat-fold-card {
      width: 100%;
      overflow: hidden;
    }

    .chat-fold-toggle {
      width: 100%;
      min-height: 40px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      background: transparent;
      color: var(--text-secondary);
      font: inherit;
      text-align: left;
      transition: all 200ms ease;
    }

    .chat-fold-toggle:active {
      transform: scale(0.98);
    }

    .chat-fold-left {
      min-width: 0;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .chat-fold-summary,
    .chat-tool-name,
    .chat-tool-status-text {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 12px;
      line-height: 1.35;
    }

    .chat-tool-name {
      color: var(--text-primary);
      font-weight: 600;
    }

    .chat-fold-arrow {
      transition: all 200ms ease;
    }

    .chat-fold-card[data-open="true"] .chat-fold-arrow {
      transform: rotate(90deg);
    }

    .chat-fold-detail {
      max-height: 0;
      overflow: hidden;
      opacity: 0;
      transition: all 200ms ease;
    }

    .chat-fold-card[data-open="true"] .chat-fold-detail {
      max-height: min(52vh, 520px);
      opacity: 1;
      overflow-y: auto;
    }

    .chat-fold-detail-inner {
      padding: 0 12px 12px;
    }

    .chat-thinking-detail {
      display: grid;
      grid-template-columns: 3px minmax(0, 1fr);
      gap: 9px;
    }

    .chat-thinking-line {
      width: 3px;
      min-height: 100%;
      border-radius: 999px;
      background: var(--accent);
      opacity: 0.35;
    }

    .chat-thinking-pre,
    .chat-tool-pre {
      margin: 0;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    .chat-tool-block {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-top: 8px;
    }

    .chat-tool-label {
      color: var(--text-hint);
      font-size: 11px;
      line-height: 1.3;
    }

    .chat-tool-status-mark {
      width: 15px;
      height: 15px;
      flex: 0 0 15px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      color: var(--accent);
      background: var(--bg-card);
    }

    .chat-tool-status-mark.running {
      animation: chatPulse 900ms ease infinite;
    }

    .chat-message-code {
      width: 100%;
      overflow: hidden;
      padding: 10px;
    }

    .chat-message-code-top {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      margin-bottom: 8px;
    }

    .chat-message-code-meta,
    .chat-message-code-actions {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .chat-message-code-actions {
      flex-wrap: wrap;
      justify-content: flex-end;
    }

    .chat-message-code-lang {
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.35;
    }

    .chat-message-code-action,
    .chat-message-code-toggle,
    .chat-message-action-btn,
    .chat-message-token-chip {
      background: transparent;
      color: var(--text-secondary);
      font: inherit;
      font-size: 12px;
      transition: all 200ms ease;
    }

    .chat-message-code-action {
      min-height: 28px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0 8px;
      border-radius: 999px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .chat-message-code-action:active,
    .chat-message-code-toggle:active,
    .chat-message-action-btn:active {
      transform: scale(0.96);
    }

    .chat-message-code-pre {
      max-height: none;
      overflow: auto;
      margin: 0;
      color: var(--text-primary);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .chat-message-code[data-collapsed="true"] .chat-message-code-pre {
      max-height: 128px;
      overflow: hidden;
    }

    .chat-message-code-toggle {
      margin-top: 8px;
      min-height: 28px;
      padding: 0 8px;
      border-radius: 999px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .chat-html-preview-sheet {
      display: flex;
      flex-direction: column;
      gap: 12px;
      height: min(70vh, 620px);
      padding: 2px 0 8px;
    }

    .chat-html-preview-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-html-preview-frame {
      flex: 1;
      width: 100%;
      min-height: 320px;
      border-radius: 18px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .chat-game-card,
    .chat-mini-message-card {
      width: min(100%, 280px);
      min-width: 188px;
      display: grid;
      grid-template-columns: 52px minmax(0, 1fr);
      align-items: center;
      gap: 12px;
      padding: 10px;
      color: var(--text-primary);
      overflow: hidden;
    }

    .chat-game-icon {
      width: 52px;
      height: 52px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 18px;
      background: var(--bg-card);
      color: var(--accent);
      box-shadow: var(--shadow-sm);
    }

    .chat-game-title,
    .chat-mini-card-title {
      font-size: 13px;
      font-weight: 600;
      line-height: 1.35;
      color: var(--text-primary);
      word-break: break-word;
    }

    .chat-game-result,
    .chat-game-note,
    .chat-mini-card-desc {
      margin-top: 3px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.45;
      word-break: break-word;
    }

    .chat-game-note {
      color: var(--text-hint);
      font-size: 11px;
    }

    .chat-mini-message-card.transfer {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      gap: 6px;
    }

    .chat-mini-card-top {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
    }

    .chat-mini-card-cover {
      width: 52px;
      height: 52px;
      overflow: hidden;
      border-radius: 16px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .chat-mini-card-cover img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .chat-mini-card-body {
      min-width: 0;
    }

    .chat-mini-card-price {
      color: var(--accent);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.35;
      white-space: nowrap;
    }

    .chat-dice-face {
      width: 34px;
      height: 34px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      grid-template-rows: repeat(3, 1fr);
      gap: 3px;
      padding: 5px;
      border-radius: 10px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .chat-dice-face span {
      width: 5px;
      height: 5px;
      align-self: center;
      justify-self: center;
      border-radius: 999px;
      background: transparent;
    }

    .chat-dice-face span.active {
      background: currentColor;
    }

    .chat-dice-card[data-rolling="true"] .chat-dice-face {
      animation: chatDiceShake 680ms ease both;
    }

    .chat-rps-icon {
      width: 34px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .chat-rps-icon svg {
      width: 30px;
      height: 30px;
    }

    .chat-rps-card[data-flipping="true"] .chat-rps-icon {
      animation: chatRpsFlip 620ms ease both;
    }

    .chat-message-actions {
      max-width: 100%;
      display: flex;
      flex-wrap: nowrap;
      gap: 6px;
      opacity: 0.52;
      overflow: hidden;
      transition: all 200ms ease;
    }

    .chat-message-body:hover .chat-message-actions {
      opacity: 0.82;
    }

    .chat-message-body.role-user .chat-message-actions {
      justify-content: flex-end;
    }

    .chat-message-body.role-assistant .chat-message-actions {
      justify-content: flex-start;
    }

    .chat-message-row.mode-dialog .chat-message-actions {
      margin-top: 1px;
      opacity: 0.38;
    }

    .chat-message-row.mode-dialog.role-user .chat-message-actions {
      margin-right: 38px;
    }

    .chat-message-row.mode-dialog.role-assistant .chat-message-actions {
      margin-left: 38px;
    }

    .chat-message-row.mode-dialog .chat-message-body:hover .chat-message-actions {
      opacity: 0.72;
    }

    .chat-message-action-btn,
    .chat-message-token-chip {
      min-height: 26px;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      border-radius: 999px;
      padding: 0 7px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      white-space: nowrap;
    }

    .chat-message-row.mode-dialog .chat-message-action-btn,
    .chat-message-row.mode-dialog .chat-message-token-chip {
      min-height: 23px;
      padding: 0 6px;
      background: transparent;
      box-shadow: none;
    }

    .chat-message-token-chip {
      color: var(--text-hint);
      font-size: 11px;
      padding: 0 6px;
    }

    .chat-action-sheet,
    .chat-edit-sheet {
      padding: 4px 0 8px;
    }

    .chat-action-sheet-title {
      margin: 0 0 14px;
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-action-sheet-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .chat-action-sheet-item,
    .chat-edit-btn {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: 16px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 14px;
      transition: all 200ms ease;
    }

    .chat-action-sheet-item:active,
    .chat-edit-btn:active {
      transform: scale(0.96);
    }

    .chat-edit-textarea {
      width: 100%;
      min-height: 140px;
      padding: 12px 14px;
      border-radius: 16px;
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: 16px;
      line-height: 1.6;
      resize: none;
    }

    .chat-edit-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 12px;
    }

    .chat-edit-btn.primary {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-edit-btn.ghost {
      color: var(--text-secondary);
    }

    .chat-quote-preview {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: 8px;
      margin: 0 20px 8px;
      padding: 10px 12px;
      border-radius: 16px;
      background: var(--bg-card);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      animation: chatMessageIn 180ms ease both;
    }

    .chat-quote-preview-text {
      min-width: 0;
      font-size: 12px;
      line-height: 1.4;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .chat-quote-preview-close {
      width: 28px;
      height: 28px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      color: var(--text-hint);
      background: var(--surface-muted);
    }

    @keyframes chatMessageIn {
      from {
        opacity: 0;
        transform: translateY(5px) scale(0.995);
      }

      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @keyframes chatPulse {
      0%, 100% {
        opacity: 0.5;
        transform: scale(0.9);
      }

      50% {
        opacity: 1;
        transform: scale(1);
      }
    }

    @keyframes chatVoiceWave {
      0%, 100% {
        opacity: 0.34;
        transform: scaleY(0.72);
      }

      50% {
        opacity: 0.9;
        transform: scaleY(1.08);
      }
    }

    @keyframes chatDiceShake {
      0% { transform: rotate(0deg) scale(0.96); }
      18% { transform: rotate(18deg) translateY(-2px); }
      36% { transform: rotate(-16deg) translateY(2px); }
      54% { transform: rotate(12deg) translateY(-1px); }
      72% { transform: rotate(-8deg); }
      100% { transform: rotate(0deg) scale(1); }
    }

    @keyframes chatRpsFlip {
      0% { transform: rotateY(0deg) scale(0.96); }
      45% { transform: rotateY(180deg) scale(1.06); }
      100% { transform: rotateY(360deg) scale(1); }
    }

    @media (max-width: 520px) {
      .chat-message-body,
      .chat-reasoning-stack {
        max-width: 92%;
        width: auto;
      }

      .chat-message-row.mode-dialog .chat-message-body,
      .chat-reasoning-stack.mode-dialog {
        max-width: 78%;
      }

      .chat-message-name {
        max-width: 104px;
      }

      .chat-message-time {
        max-width: 112px;
      }

      .chat-message-bubble {
        padding: 10px 12px;
      }

      .chat-message-row.mode-dialog .chat-message-bubble {
        padding: 0;
      }

      .chat-message-row.mode-dialog.role-user .chat-message-bubble,
      .chat-message-row.mode-dialog.role-user .chat-message-actions {
        margin-right: 34px;
      }

      .chat-message-row.mode-dialog.role-assistant .chat-message-bubble,
      .chat-message-row.mode-dialog.role-assistant .chat-message-actions {
        margin-left: 34px;
      }

      .chat-message-image-frame {
        width: min(68vw, 240px);
        max-height: 280px;
      }

      .chat-message-image {
        max-height: 280px;
      }

      .chat-message-sticker-card {
        width: 126px;
        max-width: 126px;
      }

      .chat-message-sticker-image,
      .chat-message-sticker-placeholder {
        width: 118px;
        height: 118px;
      }

      .chat-voice-card {
        width: min(100%, 238px);
      }

      .chat-voice-waves {
        min-width: 58px;
      }

      .chat-action-sheet-list {
        grid-template-columns: 1fr;
      }

      .chat-message-code-top {
        align-items: flex-start;
        flex-direction: column;
      }

      .chat-message-code-actions {
        justify-content: flex-start;
      }

      .chat-message-actions {
        gap: 5px;
      }

      .chat-message-action-btn,
      .chat-message-token-chip {
        min-height: 24px;
        padding: 0 6px;
        font-size: 11px;
      }

      .chat-message-row.mode-dialog .chat-message-action-btn,
      .chat-message-row.mode-dialog .chat-message-token-chip {
        min-height: 22px;
        padding: 0 5px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .chat-message-row,
      .chat-quote-preview,
      .chat-dice-card[data-rolling="true"] .chat-dice-face,
      .chat-rps-card[data-flipping="true"] .chat-rps-icon,
      .chat-tool-status-mark.running,
      .chat-voice-waves i {
        animation: none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/storage.js(getData)；../../core/ui.js(showToast,showBottomSheet,hideBottomSheet)；./thread-actions.js(copyThreadMessage,quoteThreadMessage,editThreadMessage,deleteThreadMessage,regenerateThreadMessage,continueThreadMessage,playThreadTTS,stopThreadTTS)
