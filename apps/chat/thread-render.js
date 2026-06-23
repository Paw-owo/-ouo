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
    const last = list.lastElementChild;
    if (last?.scrollIntoView) {
      last.scrollIntoView({ block: 'end', behavior: 'auto' });
    }
  });
}

function createMessageRow(state, message, pageEl) {
  const row = el('article', `chat-message-row role-${message.role || 'assistant'} mode-${state.displayMode || 'bubble'}`);
  row.dataset.messageId = message.id || '';
  row.dataset.role = message.role || 'assistant';

  const line = el('div', `chat-message-line role-${message.role || 'assistant'} mode-${state.displayMode || 'bubble'}`);
  line.append(
    (state.displayMode || 'bubble') === 'dialog'
      ? createDialogHead(state, message)
      : createBubbleHead(state, message),
    createBubbleContent(message)
  );

  row.append(
    createReasoningStack(message),
    line,
    createMessageActions(state, message, pageEl)
  );

  return row;
}

function createReasoningStack(message) {
  const stack = el('section', 'chat-reasoning-stack');

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

function createBubbleHead(state, message) {
  const head = el('div', `chat-message-head ${message.role === 'user' ? 'user' : 'ai'}`);
  const target = getTargetInfo(state, message);

  const avatar = createMessageAvatar(target, message.role);
  const meta = el('div', 'chat-message-meta');
  meta.append(
    el('div', 'chat-message-name', target.name),
    el('div', 'chat-message-time', formatTime(message.timestamp))
  );

  head.append(avatar, meta);
  return head;
}

function createDialogHead(state, message) {
  const head = el('div', `chat-message-dialog-head ${message.role === 'user' ? 'user' : 'ai'}`);
  const target = getTargetInfo(state, message);

  const avatar = createMessageAvatar(target, message.role);
  avatar.classList.add('dialog');

  const meta = el('div', 'chat-message-dialog-meta');
  meta.append(
    el('div', 'chat-message-name', target.name),
    el('div', 'chat-message-time', formatTime(message.timestamp))
  );

  head.append(avatar, meta);
  return head;
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

function createBubbleContent(message) {
  const bubble = el('div', `chat-message-bubble role-${message.role === 'user' ? 'user' : 'ai'}`);
  if (message.type === 'sticker') bubble.classList.add('sticker-bubble');

  if (message.quoteText) {
    bubble.append(createQuoteBlock(message.quoteText));
  }

  bubble.append(createMessageContent(message));

  if (message.editedAt) {
    bubble.append(el('div', 'chat-message-edited', '已编辑'));
  }

  if (message.type === 'voice') {
    bubble.append(createVoiceTag());
  }

  return bubble;
}

function createMessageContent(message) {
  const content = el('div', `chat-message-content ${message.type === 'sticker' ? 'sticker-content' : ''}`);

  if (message.type === 'image' && message.imageBase64) {
    const img = document.createElement('img');
    img.src = message.imageBase64;
    img.alt = '';
    img.className = 'chat-message-image';
    content.appendChild(img);
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
    content.append(
      el('div', 'chat-message-transfer-title', '转账消息'),
      el('div', 'chat-message-transfer-amount', `￥${Number(message.transferAmount || 0)}`)
    );
    return content;
  }

  splitCodeBlocks(String(message.content || '').trim()).forEach((part) => {
    content.appendChild(part.type === 'code' ? createCodeBlock(part) : createTextBlock(part.text));
  });

  return content;
}
function createStickerContent(message) {
  const wrap = el('section', 'chat-message-sticker-card');
  const image = String(message.stickerImageBase64 || message.imageBase64 || '').trim();
  const desc = String(message.stickerDescription || message.content || '').trim();

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.alt = desc || '';
    img.className = 'chat-message-sticker-image';
    wrap.appendChild(img);
  } else {
    wrap.appendChild(el('div', 'chat-message-sticker-placeholder', desc || '表情包'));
  }

  if (desc) {
    wrap.appendChild(el('div', 'chat-message-sticker-desc', desc));
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

  const shouldCollapse = code.split('\n').length > 3 || code.length > 360;
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
  frame.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
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
    smallAction('copy', '复制', () => copyThreadMessage(message)),
    smallAction('quote', '引用', () => {
      quoteThreadMessage(state, message.id);
      renderQuotePreview(state, pageEl);
    }),
    smallAction('more', '更多', () => openMessageActionSheet(state, message, pageEl))
  );

  return actions;
}

function createTokenChip(message) {
  const chip = el('span', 'chat-message-token-chip', `${estimateMessageTokens(message)} tokens`);
  return chip;
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
  return ['text', 'voice', 'sticker'].includes(String(message?.type || 'text')) && Boolean(String(message?.content || message?.stickerDescription || '').trim());
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
  textarea.value = String(message.type === 'sticker' ? message.stickerDescription || message.content || '' : message.content || '');
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

function createVoiceTag() {
  return el('div', 'chat-message-voice-tag', '语音');
}

function createEmptyThread() {
  const empty = el('section', 'chat-empty');
  empty.append(
    el('div', 'chat-empty-title', '还没开始说话'),
    el('div', 'chat-empty-desc', '先发一句，TA 就会接住。')
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
      message.stickerDescription,
      message.quoteText,
      message.thinkingSummary
    ].some((item) => String(item || '').toLowerCase().includes(q));
  });
}

function getTargetInfo(state, message) {
  if (message.role === 'user') {
    const user = getUserProfile();
    return { name: user.name || '我', avatar: user.avatar || '' };
  }

  if (state.mode === 'group') {
    return {
      name: message.characterName || 'TA',
      avatar: message.characterAvatar || state.group?.avatar || ''
    };
  }

  return {
    name: state.character?.name || 'TA',
    avatar: state.character?.avatar || ''
  };
}

function getUserProfile() {
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

  const user = settings.user || appUser || {};
  return user && typeof user === 'object' ? user : {};
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
  if (message.type === 'voice') return '[语音]';
  if (message.type === 'dice') return `[骰子 ${normalizeDiceValue(message.diceValue || message.value || message.result) || ''}]`;
  if (message.type === 'rps') return `[石头剪刀布 ${getRpsLabel(normalizeRpsChoice(message.rpsChoice || message.choice || message.result))}]`;

  const text = String(message.content || '').trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function estimateMessageTokens(message) {
  const text = [
    message.content || '',
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
    pad(time.getMinutes()),
    pad(time.getSeconds())
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
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-width: 88%;
      animation: chatMessageIn 220ms ease both;
    }

    .chat-message-row.role-user {
      align-self: flex-end;
      align-items: flex-end;
    }

    .chat-message-row.role-assistant,
    .chat-message-row.role-system {
      align-self: flex-start;
      align-items: flex-start;
    }

    .chat-message-row.mode-dialog {
      max-width: 100%;
      width: 100%;
      align-self: stretch;
      align-items: stretch;
    }

    .chat-message-line {
      width: 100%;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }

    .chat-message-line.role-user {
      flex-direction: row-reverse;
      justify-content: flex-start;
    }

    .chat-message-line.role-assistant,
    .chat-message-line.role-system {
      flex-direction: row;
      justify-content: flex-start;
    }

    .chat-message-line.mode-dialog {
      width: 100%;
    }

    .chat-message-line.mode-dialog.role-user {
      justify-content: flex-start;
      flex-direction: row-reverse;
      padding-left: 34px;
    }

    .chat-message-line.mode-dialog.role-assistant,
    .chat-message-line.mode-dialog.role-system {
      justify-content: flex-start;
      flex-direction: row;
      padding-right: 34px;
    }

    .chat-message-head,
    .chat-message-dialog-head {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      padding: 1px 0 0;
    }

    .chat-message-head.user,
    .chat-message-dialog-head.user {
      flex-direction: row-reverse;
      text-align: right;
    }

    .chat-message-head.ai,
    .chat-message-dialog-head.ai {
      flex-direction: row;
      text-align: left;
    }

    .chat-message-avatar {
      width: 28px;
      height: 28px;
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

    .chat-message-avatar.dialog {
      width: 30px;
      height: 30px;
    }

    .chat-message-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .chat-message-meta,
    .chat-message-dialog-meta {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 1px;
    }

    .chat-message-name {
      max-width: 92px;
      color: var(--text-primary);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .chat-message-time {
      max-width: 104px;
      color: var(--text-hint);
      font-size: 11px;
      line-height: 1.25;
      letter-spacing: 0.01em;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .chat-message-bubble {
      min-width: 0;
      max-width: min(100%, 560px);
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 12px 14px;
      border-radius: var(--bubble-radius);
      box-shadow: var(--shadow-sm);
    }

    .chat-message-line.role-user .chat-message-bubble {
      align-items: flex-end;
    }

    .chat-message-line.role-assistant .chat-message-bubble,
    .chat-message-line.role-system .chat-message-bubble {
      align-items: flex-start;
    }

    .chat-message-bubble.role-user {
      background: var(--bubble-user-bg);
      color: var(--bubble-user-text);
    }

    .chat-message-bubble.role-ai {
      background: var(--bubble-ai-bg);
      color: var(--bubble-ai-text);
    }

    .chat-message-bubble.sticker-bubble {
      padding: 4px;
      background: transparent;
      box-shadow: none;
    }

    .chat-message-row.mode-dialog .chat-message-bubble {
      width: min(100%, 640px);
      border-radius: 18px;
      background: var(--bg-card);
      color: var(--text-primary);
    }

    .chat-message-row.mode-dialog.role-user .chat-message-bubble {
      margin-left: auto;
    }

    .chat-message-row.mode-dialog.role-assistant .chat-message-bubble,
    .chat-message-row.mode-dialog.role-system .chat-message-bubble {
      margin-right: auto;
    }

    .chat-message-row.mode-dialog .chat-message-bubble.sticker-bubble {
      width: fit-content;
      background: transparent;
      box-shadow: none;
    }

    .chat-message-content,
    .chat-message-text {
      font-size: var(--font-size-base);
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .chat-message-content.sticker-content {
      line-height: 1;
      white-space: normal;
    }

    .chat-message-edited,
    .chat-message-voice-tag {
      color: var(--text-hint);
      font-size: 11px;
      line-height: 1.3;
    }

    .chat-message-image {
      max-width: 220px;
      border-radius: 16px;
      box-shadow: var(--shadow-sm);
    }

    .chat-message-sticker-card {
      width: fit-content;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      max-width: 144px;
    }

    .chat-message-sticker-image {
      width: clamp(112px, 30vw, 136px);
      height: clamp(112px, 30vw, 136px);
      object-fit: contain;
      border-radius: 18px;
      background: transparent;
      box-shadow: none;
    }

    .chat-message-sticker-placeholder {
      width: clamp(112px, 30vw, 136px);
      height: clamp(112px, 30vw, 136px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 12px;
      border-radius: 18px;
      background: var(--bg-card);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: 14px;
      line-height: 1.5;
      text-align: center;
    }

    .chat-message-sticker-desc {
      max-width: 136px;
      color: var(--text-secondary);
      font-size: 11px;
      line-height: 1.35;
      text-align: center;
      word-break: break-word;
      opacity: 0.82;
    }

    .chat-message-quote,
    .chat-message-code,
    .chat-game-card,
    .chat-fold-card {
      border-radius: 16px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .chat-message-quote {
      padding: 10px;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.5;
    }

    .chat-fold-card {
      width: min(100%, 560px);
      overflow: hidden;
    }

    .chat-reasoning-stack {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: min(100%, 560px);
    }

    .chat-message-row.role-user .chat-reasoning-stack {
      align-self: flex-end;
    }

    .chat-message-row.role-assistant .chat-reasoning-stack,
    .chat-message-row.role-system .chat-reasoning-stack {
      align-self: flex-start;
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

    .chat-fold-arrow {
      transition: all 200ms ease;
    }

    .chat-fold-card[data-open="true"] .chat-fold-arrow {
      transform: rotate(90deg);
    }

    .chat-fold-detail {
      display: grid;
      grid-template-rows: 0fr;
      transition: all 200ms ease;
    }

    .chat-fold-card[data-open="true"] .chat-fold-detail {
      grid-template-rows: 1fr;
    }

    .chat-fold-detail-inner {
      min-height: 0;
      overflow: hidden;
      padding: 0 12px;
    }

    .chat-fold-card[data-open="true"] .chat-fold-detail-inner {
      padding-bottom: 12px;
    }

    .chat-thinking-pre,
    .chat-tool-pre {
      margin: 0;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.55;
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
      width: 16px;
      height: 16px;
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
      width: min(100%, 680px);
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
      font-size: 13px;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .chat-message-code[data-collapsed="true"] .chat-message-code-pre {
      max-height: 96px;
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

    .chat-game-card {
      min-width: 188px;
      display: grid;
      grid-template-columns: 52px 1fr;
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

    .chat-game-title {
      font-size: 13px;
      font-weight: 600;
      line-height: 1.35;
      color: var(--text-primary);
    }

    .chat-game-result {
      margin-top: 3px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.45;
    }

    .chat-game-note {
      margin-top: 4px;
      color: var(--text-hint);
      font-size: 11px;
      line-height: 1.35;
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
      box-shadow: inset 0 0 0 999px color-mix(in srgb, var(--accent-light) 32%, transparent);
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
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      padding: 0 4px;
      opacity: 0.78;
    }

    .chat-message-row.role-user .chat-message-actions {
      justify-content: flex-end;
    }

    .chat-message-row.role-assistant .chat-message-actions,
    .chat-message-row.role-system .chat-message-actions {
      justify-content: flex-start;
    }

    .chat-message-action-btn,
    .chat-message-token-chip {
      min-height: 28px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border-radius: 999px;
      padding: 0 8px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .chat-message-token-chip {
      color: var(--text-hint);
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

    .chat-message-transfer-title,
    .chat-message-transfer-amount {
      font-size: var(--font-size-base);
      line-height: 1.6;
    }

    @keyframes chatMessageIn {
      from {
        opacity: 0;
        transform: translateY(6px) scale(0.992);
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
      .chat-message-row {
        max-width: 94%;
      }

      .chat-message-name {
        max-width: 72px;
      }

      .chat-message-time {
        max-width: 84px;
      }

      .chat-message-line {
        gap: 8px;
      }

      .chat-message-line.mode-dialog.role-user {
        padding-left: 18px;
      }

      .chat-message-line.mode-dialog.role-assistant,
      .chat-message-line.mode-dialog.role-system {
        padding-right: 18px;
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

      .chat-message-sticker-card {
        max-width: 128px;
      }

      .chat-message-sticker-image,
      .chat-message-sticker-placeholder {
        width: 118px;
        height: 118px;
      }

      .chat-message-sticker-desc {
        max-width: 118px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .chat-message-row,
      .chat-quote-preview,
      .chat-dice-card[data-rolling="true"] .chat-dice-face,
      .chat-rps-card[data-flipping="true"] .chat-rps-icon,
      .chat-tool-status-mark.running {
        animation: none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 改了什么：只调整消息布局，用户/AI 名字贴头像，气泡与头像同一行持平；对话模式保留 AI 左、用户右。
// 会不会影响其他文件：不会；记仇核心不在本文件，后续在 thread.js/list.js/grudge.js 接。
// 更新记忆里该文件的导出函数：无变化。
// 依赖：../../core/storage.js(getData)；../../core/ui.js(showToast,showBottomSheet,hideBottomSheet)；./thread-actions.js(copyThreadMessage,quoteThreadMessage,editThreadMessage,deleteThreadMessage,regenerateThreadMessage,continueThreadMessage,playThreadTTS,stopThreadTTS)
