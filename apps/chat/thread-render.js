// apps/chat/thread-render.js
// imports:
//   from '../../core/ui.js': createIcon, showToast
//   from './thread-actions.js': sendTextMessage, quoteThreadMessage, openMessageActionsSheet, editThreadMessage, deleteThreadMessage, regenerateThreadMessage, toggleThreadMessageTTS
//   from './thread-tools.js': openToolboxSheet
//   from './thread-code.js': renderRichTextWithCode

import {
  createIcon,
  showToast
} from '../../core/ui.js';

import {
  sendTextMessage,
  quoteThreadMessage,
  openMessageActionsSheet,
  editThreadMessage,
  deleteThreadMessage,
  regenerateThreadMessage,
  toggleThreadMessageTTS
} from './thread-actions.js';

import { openToolboxSheet } from './thread-tools.js';
import { renderRichTextWithCode } from './thread-code.js';

let longPressTimer = 0;

export async function renderThread(ctx, options = {}) {
  const rootEl = ctx.state.rootEl;
  if (!rootEl) return;

  const displayMode = ctx.getDisplayMode();
  const isGroup = Boolean(ctx.state.currentGroup);
  const target = isGroup ? ctx.state.currentGroup : ctx.state.currentCharacter;

  if (!target) return;

  rootEl.style.setProperty('--chat-font-size', `${getSafeFontSize(ctx)}px`);
  rootEl.innerHTML = '';

  const page = el('section', `chat-page chat-thread-page ${displayMode === 'dialog' ? 'dialog-mode' : 'bubble-mode'}`);
  page.dataset.mode = displayMode;

  if (!isGroup && ctx.state.currentCharacter?.chatBackground) {
    applyChatBackground(page, ctx.state.currentCharacter.chatBackground);
  }

  const nav = createThreadNav(ctx);
  const search = createSearchBar(ctx);
  const messages = createMessagesArea(ctx, displayMode);
  const inputBar = createInputBar(ctx);

  page.append(nav, search, messages, inputBar);
  rootEl.appendChild(page);

  if (options.scroll !== false) {
    scrollToBottom(rootEl, options.preserveScroll ? 'auto' : 'smooth');
  } else {
    scrollToBottom(rootEl, 'auto');
  }
}

function createThreadNav(ctx) {
  const isGroup = Boolean(ctx.state.currentGroup);
  const target = isGroup ? ctx.state.currentGroup : ctx.state.currentCharacter;
  const title = target?.name || '聊天';
  const avatar = target?.avatar || '';
  const status = isGroup
    ? `${ctx.normalizeArray(ctx.state.currentGroup.memberIds).length} 个成员`
    : getOnlineText();

  const nav = el('header', 'chat-nav chat-thread-nav');

  const back = iconButton('back', '返回');
  back.addEventListener('click', () => ctx.navigateBackToList());

  const person = el('button', 'thread-person');
  person.type = 'button';

  const textWrap = el('span', 'thread-person-text');
  textWrap.append(
    el('span', 'thread-person-name', title),
    el('span', 'thread-person-status', status)
  );

  person.append(createAvatar(avatar, title, 'sm'), textWrap);

  const tools = el('div', 'thread-nav-tools');

  const search = iconButton('search', '搜索');
  search.addEventListener('click', () => openSearchBar(ctx));

  const call = iconButton('phone', '电话');
  call.addEventListener('click', async () => {
    const mod = await import('./thread-call.js');
    mod.openThreadCall(ctx);
  });

  const more = iconButton('more', '工具');
  more.addEventListener('click', () => openToolboxSheet(ctx));

  tools.append(search, call, more);
  nav.append(back, person, tools);

  return nav;
}

function createSearchBar(ctx) {
  const wrap = el('div', 'thread-search-bar hidden');
  const input = createInput('搜这条对话');
  input.className = 'chat-input-card thread-search-input';

  input.addEventListener('input', () => handleThreadSearch(ctx, input.value.trim()));

  const close = iconButton('close', '关闭搜索');
  close.addEventListener('click', () => closeSearchBar(ctx));

  wrap.append(input, close);
  return wrap;
}

function openSearchBar(ctx) {
  const bar = ctx.state.rootEl?.querySelector('.thread-search-bar');
  if (!bar) return;

  bar.classList.remove('hidden');
  requestAnimationFrame(() => bar.querySelector('input')?.focus());
}

function closeSearchBar(ctx) {
  const bar = ctx.state.rootEl?.querySelector('.thread-search-bar');
  if (!bar) return;

  bar.classList.add('hidden');

  const input = bar.querySelector('input');
  if (input) input.value = '';

  ctx.state.rootEl?.querySelectorAll('.thread-search-hit').forEach((node) => {
    node.classList.remove('thread-search-hit');
  });
}

function handleThreadSearch(ctx, query) {
  ctx.state.rootEl?.querySelectorAll('.thread-search-hit').forEach((node) => {
    node.classList.remove('thread-search-hit');
  });

  if (!query) return;

  const q = query.toLowerCase();

  const hit = ctx.state.messages.find((message) => {
    const base = `${ctx.getSpeakerName(message.characterId)} ${ctx.getMessagePreview(message, true)}`.toLowerCase();
    return base.includes(q);
  });

  if (!hit) {
    showToast('这段对话里没找到');
    return;
  }

  const node = ctx.state.rootEl?.querySelector(`[data-message-id="${hit.id}"]`);
  if (!node) return;

  node.classList.add('thread-search-hit');
  node.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function createMessagesArea(ctx, displayMode) {
  const area = el('main', 'thread-messages-area');
  area.id = 'thread-messages-area';

  const list = el('div', 'thread-message-list');
  list.id = 'thread-message-list';
  list.dataset.mode = displayMode;

  const visibleMessages = ctx.state.messages.slice(
    Math.max(0, ctx.state.messages.length - ctx.state.visibleCount)
  );

  if (ctx.state.messages.length > ctx.state.visibleCount) {
    const more = button('看看更早的', 'ghost', 'arrow-down');
    more.classList.add('load-more-button');
    more.addEventListener('click', async () => {
      ctx.state.visibleCount += ctx.constants.PAGE_SIZE;
      await ctx.rerenderThread({ scroll: false });
      requestAnimationFrame(() => {
        ctx.state.rootEl?.querySelector('#thread-messages-area')?.scrollTo({ top: 0, behavior: 'auto' });
      });
    });
    list.appendChild(more);
  }

  if (!visibleMessages.length) {
    list.appendChild(createThreadEmpty(ctx));
  } else {
    visibleMessages.forEach((message) => {
      list.appendChild(createMessageRow(ctx, message, displayMode));
    });
  }

  area.appendChild(list);
  return area;
}

function createThreadEmpty(ctx) {
  const isGroup = Boolean(ctx.state.currentGroup);
  const wrap = el('div', 'thread-empty-card');
  wrap.append(
    el('div', 'thread-empty-title', isGroup ? '小群还很安静' : '从一句话开始'),
    el('div', 'thread-empty-desc', isGroup ? '你先说一句，大家就会靠过来。' : '慢慢说，TA 会在这里回应你。')
  );
  return wrap;
}

function createMessageRow(ctx, message, displayMode) {
  const isUser = message.role === 'user';

  const row = el('article', `message-row ${isUser ? 'user' : 'assistant'} ${displayMode === 'dialog' ? 'dialog-message' : 'bubble-message'}`);
  row.dataset.messageId = message.id;
  row.dataset.role = isUser ? 'user' : 'assistant';

  const userProfile = ctx.getCurrentUserDisplayProfile();

  const avatar = isUser
    ? createAvatar(userProfile.avatar, userProfile.name || '我', 'sm')
    : createAvatar(ctx.getSpeakerAvatar(message.characterId), ctx.getSpeakerName(message.characterId), 'sm');

  const body = el('div', 'message-body');
  const name = el('div', 'message-name', isUser ? userProfile.name || '我' : ctx.getSpeakerName(message.characterId));

  const content = isUser
    ? createUserMessageContent(ctx, message, displayMode)
    : createAssistantMessageContent(ctx, message, displayMode);

  body.append(name, content, createInlineActions(ctx, message));

  const pressTarget = body.querySelector('.assistant-card') || body.querySelector('.message-content-card') || body;
  bindLongPress(pressTarget, () => openMessageActionsSheet(ctx, message));

  if (isUser) {
    row.append(body, avatar);
  } else {
    row.append(avatar, body);
  }

  return row;
}

function createUserMessageContent(ctx, message, displayMode) {
  const wrap = el('div', 'message-content-card');
  if (displayMode === 'dialog') wrap.classList.add('dialog-content');
  appendMessagePayload(ctx, wrap, message);
  return wrap;
}

function createAssistantMessageContent(ctx, message, displayMode) {
  const card = el('div', 'assistant-card');
  if (displayMode === 'dialog') card.classList.add('dialog-card');

  const thinking = String(message.thinking || '').trim();
  const toolCalls = ctx.normalizeArray(message.toolCalls).filter((item) => item?.toolName);
  const content = String(message.content || '').trim();

  if (thinking) {
    card.appendChild(createThinkingCard(message));
  }

  if (toolCalls.length) {
    card.appendChild(createToolCallsCard(toolCalls));
  }

  const reply = el('section', 'assistant-reply-card');
  if (displayMode === 'dialog') reply.classList.add('dialog-reply');

  if (content || message.type !== 'text') {
    appendMessagePayload(ctx, reply, message);
  } else {
    reply.appendChild(el('div', 'message-typing-text', '正在想'));
  }

  card.appendChild(reply);
  return card;
}

function appendMessagePayload(ctx, wrap, message) {
  const content = String(message.content || '').trim();

  if (message.type === 'image' && message.imageBase64) {
    const img = document.createElement('img');
    img.src = message.imageBase64;
    img.alt = '';
    img.className = 'message-image';
    wrap.appendChild(img);
    if (content) wrap.appendChild(renderRichTextWithCode(content));
    return;
  }

  if (message.type === 'sticker' && message.stickerId) {
    const sticker = ctx.getStickerById(message.stickerId);
    if (sticker?.image) {
      const img = document.createElement('img');
      img.src = sticker.image;
      img.alt = '';
      img.className = 'message-sticker';
      wrap.appendChild(img);
    }
    if (content) wrap.appendChild(renderRichTextWithCode(content));
    return;
  }

  if (message.type === 'transfer') {
    wrap.appendChild(createTransferCard(ctx, message));
    return;
  }

  if (content) {
    wrap.appendChild(renderRichTextWithCode(content));
  }
}

function createThinkingCard(message) {
  const details = document.createElement('details');
  details.className = 'thinking-card';
  details.open = false;

  const clean = normalizeThinkingText(message.thinking);
  const summaryText = message.thinkingSummary || summarizeThinking(clean);

  const summary = el('summary', 'thinking-summary');
  summary.append(
    el('span', 'thinking-title', 'Thinking'),
    el('span', 'thinking-preview', summaryText || '正在整理思路'),
    el('span', 'thinking-time', formatThinkingTime(message.thinkingTimeMs))
  );

  const content = el('div', 'thinking-content');
  content.textContent = clean || '没有留下更多思考内容。';

  details.append(summary, content);
  return details;
}

function createToolCallsCard(toolCalls) {
  const wrap = el('section', 'tool-calls-card');

  toolCalls.forEach((toolCall, index) => {
    if (index > 0) wrap.appendChild(el('div', 'tool-call-connector'));

    const details = document.createElement('details');
    details.className = `tool-call-card status-${toolCall.status || 'done'}`;

    const summary = el('summary', 'tool-call-summary');
    const icon = el('span', 'tool-call-icon');
    icon.appendChild(createIcon(toolCall.status === 'error' ? 'close' : toolCall.status === 'running' ? 'refresh' : 'check', 14));

    summary.append(
      icon,
      el('span', 'tool-call-title', toolCall.toolName || '工具'),
      el('span', 'tool-call-desc', getToolCallDesc(toolCall)),
      createIcon('arrow-down', 15)
    );

    const body = el('div', 'tool-call-body');
    body.append(
      el('div', 'tool-call-label', '参数'),
      el('pre', 'tool-call-pre', JSON.stringify(toolCall.arguments || {}, null, 2)),
      el('div', 'tool-call-label', '结果'),
      el('pre', 'tool-call-pre', formatToolResult(toolCall.result))
    );

    details.append(summary, body);
    wrap.appendChild(details);
  });

  return wrap;
}

function createTransferCard(ctx, message) {
  const card = el('div', 'transfer-card');
  const icon = el('span', 'transfer-icon');
  icon.appendChild(createIcon('transfer', 22));

  const info = el('span', 'transfer-info');
  info.append(
    el('span', 'transfer-title', `转账 ${Number(message.transferAmount || 0).toFixed(0)}`),
    el('span', 'transfer-desc', message.transferTargetId ? `给 ${ctx.getSpeakerName(message.transferTargetId)}` : '已记录在聊天里')
  );

  card.append(icon, info);
  return card;
}

function createInlineActions(ctx, message) {
  const actions = el('div', 'message-actions');

  const quote = actionButton('引用', 'copy');
  quote.addEventListener('click', () => quoteThreadMessage(ctx, message));
  actions.appendChild(quote);

  const edit = actionButton('编辑', 'edit');
  edit.addEventListener('click', () => editThreadMessage(ctx, message));
  actions.appendChild(edit);

  if (message.role === 'assistant') {
    const regen = actionButton('重来', 'refresh');
    regen.addEventListener('click', () => regenerateThreadMessage(ctx, message));
    actions.appendChild(regen);

    const playing = ctx.state.activeTtsMessageId === message.id && ctx.state.activeTts;
    const play = actionButton(playing ? '停止' : '播放', playing ? 'stop' : 'play');
    play.addEventListener('click', () => toggleThreadMessageTTS(ctx, message));
    actions.appendChild(play);
  }

  const more = actionButton('更多', 'more');
  more.addEventListener('click', () => openMessageActionsSheet(ctx, message));
  actions.appendChild(more);

  const del = actionButton('删除', 'delete');
  del.addEventListener('click', () => deleteThreadMessage(ctx, message));
  actions.appendChild(del);

  return actions;
}

function createInputBar(ctx) {
  const bar = el('footer', 'thread-input-bar');

  const toolbox = iconButton('add', '小工具');
  toolbox.addEventListener('click', () => openToolboxSheet(ctx));

  const wrap = el('div', 'thread-input-wrap');

  if (ctx.state.quotedMessage) {
    wrap.appendChild(createQuotePreview(ctx));
  }

  const line = el('div', 'thread-input-line');

  const textarea = createTextarea('慢慢说，我在听');
  textarea.className = 'thread-input';
  textarea.rows = 1;

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(132, textarea.scrollHeight)}px`;
  });

  textarea.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      await submitInput(ctx, textarea);
    }
  });

  const send = iconButton('send', '发送');
  send.classList.add('inside-input-btn');
  send.addEventListener('click', () => submitInput(ctx, textarea));

  line.append(textarea, send);
  wrap.appendChild(line);
  bar.append(toolbox, wrap);

  return bar;
}

function createQuotePreview(ctx) {
  const message = ctx.state.quotedMessage;
  const quote = el('div', 'quote-preview');

  const text = el('div', 'quote-preview-text', `引用 ${ctx.getSpeakerName(message.characterId)}：${ctx.getMessagePreview(message)}`);
  const close = iconButton('close', '取消引用');

  close.addEventListener('click', async () => {
    ctx.setQuotedMessage(null);
    await ctx.rerenderThread({ scroll: false });
  });

  quote.append(text, close);
  return quote;
}

async function submitInput(ctx, textarea) {
  const text = textarea.value.trim();
  if (!text || ctx.state.isSending) return;

  const sent = await sendTextMessage(ctx, text);
  if (!sent) return;

  textarea.value = '';
  textarea.style.height = 'auto';
}

function actionButton(text, iconName) {
  const btn = el('button', 'message-action-btn');
  btn.type = 'button';
  btn.append(createIcon(iconName, 13), el('span', '', text));
  return btn;
}

function bindLongPress(node, callback) {
  if (!node) return;

  node.addEventListener('pointerdown', () => {
    clearLongPress();
    longPressTimer = window.setTimeout(callback, 520);
  });

  node.addEventListener('pointerup', clearLongPress);
  node.addEventListener('pointercancel', clearLongPress);
  node.addEventListener('pointerleave', clearLongPress);
}

function clearLongPress() {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer);
    longPressTimer = 0;
  }
}

function scrollToBottom(rootEl, behavior = 'smooth') {
  requestAnimationFrame(() => {
    const area = rootEl?.querySelector('#thread-messages-area');
    if (!area) return;

    area.scrollTo({
      top: area.scrollHeight,
      behavior
    });
  });
}

function applyChatBackground(page, image) {
  page.style.backgroundImage = `url("${image}")`;
  page.style.backgroundSize = 'cover';
  page.style.backgroundPosition = 'center';
  page.classList.add('has-chat-bg');
}

function getSafeFontSize(ctx) {
  const settings = ctx.getSettings();
  return Math.max(13, Math.min(20, Number(settings.fontSize || 15)));
}

function getOnlineText() {
  const hour = new Date().getHours();
  if (hour >= 23 || hour < 5) return '在夜里陪你';
  if (hour < 9) return '刚醒来一样在';
  if (hour < 18) return '在线等你';
  return '靠近一点聊天';
}

function normalizeThinkingText(text) {
  return String(text || '')
    .replace(/<thinking>/gi, '')
    .replace(/<\/thinking>/gi, '')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim();
}

function summarizeThinking(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  const firstSentence = clean.split(/[。！？.!?]/).find(Boolean) || clean;
  const summary = firstSentence.trim();

  return summary.length > 34 ? `${summary.slice(0, 34)}…` : summary;
}

function formatThinkingTime(ms) {
  const value = Number(ms || 0);
  if (!value) return '';
  if (value < 1000) return `${Math.max(1, Math.round(value / 100)) / 10}s`;
  return `${Math.round(value / 100) / 10}s`;
}

function getToolCallDesc(toolCall) {
  if (toolCall?.status === 'running') return '正在处理';
  if (toolCall?.status === 'error') return '处理失败';
  return '处理完成';
}

function formatToolResult(result) {
  if (typeof result === 'string') return result;
  return JSON.stringify(result || {}, null, 2);
}

function iconButton(iconName, label) {
  const btn = el('button', 'chat-icon-btn');
  btn.type = 'button';
  btn.setAttribute('aria-label', label || iconName);
  btn.appendChild(createIcon(iconName, 20));
  return btn;
}

function button(text, variant = 'ghost', iconName = '') {
  const btn = el('button', variant === 'primary' ? 'chat-primary-btn' : 'chat-ghost-btn');
  btn.type = 'button';

  if (iconName) btn.appendChild(createIcon(iconName, 16));
  btn.appendChild(el('span', '', text));

  return btn;
}

function createInput(placeholder = '') {
  const node = document.createElement('input');
  node.placeholder = placeholder;
  node.autocomplete = 'off';
  return node;
}

function createTextarea(placeholder = '') {
  const node = document.createElement('textarea');
  node.placeholder = placeholder;
  node.rows = 4;
  return node;
}

function createAvatar(src, name = '', size = 'md') {
  const avatar = el('span', `chat-avatar chat-avatar-${size}`);

  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitial(name);
  }

  return avatar;
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

// 改了什么：修复 message row 里把数组 append 成文本的问题，确保头像和消息体按节点正确插入。
// 会不会影响其他文件：不会。
// 更新记忆里该文件的导出函数：renderThread(ctx, options)
// 依赖：../../core/ui.js(createIcon,showToast)；./thread-actions.js(sendTextMessage,quoteThreadMessage,openMessageActionsSheet,editThreadMessage,deleteThreadMessage,regenerateThreadMessage,toggleThreadMessageTTS)；./thread-tools.js(openToolboxSheet)；./thread-code.js(renderRichTextWithCode)
