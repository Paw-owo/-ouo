// apps/chat/thread-render.js
// imports:
//   from '../../core/storage.js': getData
//   from '../../core/ui.js': showToast, showBottomSheet, hideBottomSheet
//   from './thread-actions.js': copyThreadMessage, quoteThreadMessage, editThreadMessage, deleteThreadMessage, regenerateThreadMessage, continueThreadMessage, playThreadTTS, stopThreadTTS
//   from './thinking-chain.js': createThinkingChainButton

import { getData } from '../../core/storage.js';
import { showToast, showBottomSheet, hideBottomSheet } from '../../core/ui.js';
import { createThinkingChainButton } from './thinking-chain.js';

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
const TIME_GAP_MS = 5 * 60 * 1000;

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

  let lastTime = 0;
  messages.forEach((message, index) => {
    const currentTime = getMessageTimeValue(message);
    const shouldShowTime = index === 0 || (currentTime && lastTime && currentTime - lastTime >= TIME_GAP_MS);

    if (shouldShowTime) {
      list.appendChild(createTimeDivider(currentTime, lastTime));
    }

    list.appendChild(createMessageRow(state, message, pageEl));

    if (currentTime) lastTime = currentTime;
  });

  renderQuotePreview(state, pageEl);

  requestAnimationFrame(() => {
    if (wasNearBottom || messages.length <= 2) {
      list.scrollTop = list.scrollHeight;
    }
  });
}

// ═══════════════════════════════════════
// 【消息行】单条消息的完整结构
// ═══════════════════════════════════════

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
    createReasoningStack(state, message, role, mode),
    body
  );

  return row;
}

// ───────────────────
// 时间分隔线
// ───────────────────

function createTimeDivider(currentTime, lastTime) {
  const wrap = el('div', 'chat-time-divider');
  const pill = el('span', 'chat-time-pill', formatTimeDividerText(currentTime, lastTime));
  wrap.appendChild(pill);
  return wrap;
}

// ═══════════════════════════════════════
// 【思维链】接入新 thinking-chain 组件
// ═══════════════════════════════════════

function createReasoningStack(state, message, role, mode = 'bubble') {
  const stack = el('section', `chat-reasoning-stack role-${role} mode-${mode}`);
  const target = getTargetInfo(state, message);
  const button = createThinkingChainButton(message, { roleName: target.name });

  if (!button) {
    stack.hidden = true;
    return stack;
  }

  stack.appendChild(button);
  return stack;
}

// ═══════════════════════════════════════
// 【旧推理面板】已由 thinking-chain.js 替代，保留不删
// ═══════════════════════════════════════

function openReasoningSheet(message) {
  const steps = buildReasoningSteps(message);
  const sheet = el('section', 'chat-reasoning-sheet');
  const handle = el('div', 'chat-reasoning-sheet-handle');
  const top = el('div', 'chat-reasoning-sheet-top');

  const close = safeButton('chat-reasoning-sheet-close', '关闭');
  close.appendChild(createLineIcon('x'));
  close.addEventListener('click', () => hideBottomSheet());

  const title = el('div', 'chat-reasoning-sheet-title', '概要');
  const spacer = el('span', 'chat-reasoning-sheet-spacer');
  top.append(close, title, spacer);

  const content = el('div', 'chat-reasoning-sheet-content');

  const renderList = () => {
    title.textContent = '概要';
    close.replaceChildren(createLineIcon('x'));
    close.setAttribute('aria-label', '关闭');
    close.onclick = null;
    close.addEventListener('click', () => hideBottomSheet(), { once: true });

    const list = el('div', 'chat-reasoning-timeline');
    steps.forEach((step, index) => {
      list.appendChild(createTimelineStep(step, index, () => renderDetail(step)));
    });
    content.replaceChildren(list);
  };

  const renderDetail = (step) => {
    title.textContent = step.title || '思考过程';
    close.replaceChildren(createLineIcon('back'));
    close.setAttribute('aria-label', '返回概要');
    close.onclick = null;
    close.addEventListener('click', () => renderList(), { once: true });

    const detail = el('article', 'chat-reasoning-detail-view');
    detail.append(
      el('div', 'chat-reasoning-detail-title', step.title || '思考过程'),
      el('div', 'chat-reasoning-detail-summary', step.summary || '这是这一小步的内容。'),
      createReasoningDetailContent(step)
    );
    content.replaceChildren(detail);
  };

  sheet.append(handle, top, content);
  showBottomSheet(sheet);
  renderList();
}

function buildReasoningSteps(message) {
  const steps = [];
  const toolSteps = normalizeToolCalls(message.toolCalls);
  const memorySteps = normalizeToolCalls(message.memoryWrites || message.memories || message.memoryUpdates);
  const hasNextSteps = toolSteps.length || memorySteps.length;
  const thinkingText = normalizeMultiline(message.thinking);

  if (thinkingText) {
    steps.push({
      type: 'thinking',
      title: hasNextSteps ? '思考中' : '思考过程',
      summary: hasNextSteps ? '我先整理了一下回应方向。' : '点开查看完整想法。',
      detail: thinkingText,
      status: 'done'
    });
  }

  toolSteps.forEach((tool, index) => {
    const title = normalizeText(tool.name || tool.toolName || tool.title) || `小工具 ${index + 1}`;
    steps.push({
      type: detectToolType(tool),
      title,
      summary: getToolStatusText(tool),
      detail: buildToolDetailText(tool),
      status: getToolStatus(tool)
    });
  });

  memorySteps.forEach((memory, index) => {
    steps.push({
      type: 'memory',
      title: `写进记忆 ${index + 1}`,
      summary: trimOneLine(memory.content || memory.summary || memory.text || memory, 34) || '我记下了一点重要的小事。',
      detail: normalizeToolValue(memory) || '没有记录详情',
      status: 'done'
    });
  });

  return steps;
}

function createTimelineStep(step, index, onOpen) {
  const item = el('section', `chat-timeline-step type-${step.type || 'tool'} status-${step.status || 'done'}`);
  const head = safeButton('chat-timeline-head', step.title || `步骤 ${index + 1}`);

  const marker = el('span', 'chat-timeline-marker');
  marker.appendChild(createLineIcon(getStepIcon(step.type)));

  const body = el('span', 'chat-timeline-main');
  body.append(
    el('span', 'chat-timeline-title', step.title || `步骤 ${index + 1}`),
    el('span', 'chat-timeline-summary', step.summary || '已完成')
  );

  const arrow = el('span', 'chat-timeline-arrow');
  arrow.appendChild(createLineIcon('chevron'));

  head.append(marker, body, arrow);
  head.addEventListener('click', onOpen);
  item.appendChild(head);
  return item;
}

function createReasoningDetailContent(step) {
  const wrap = el('section', 'chat-reasoning-detail-card');
  const pre = el('pre', 'chat-reasoning-detail-pre');
  pre.textContent = normalizeDetailText(step);
  wrap.appendChild(pre);
  return wrap;
}

function normalizeDetailText(step) {
  const detail = normalizeMultiline(step.detail);
  const summary = normalizeMultiline(step.summary);
  if (!detail) return '这里没有更多操作记录。';
  if (detail === summary) return '这一步只是轻轻想了一下，没有更多操作记录。';
  return detail;
}

function getReasoningSummary(message) {
  const given = normalizeText(message.thinkingSummary || message.reasoningSummary || message.summary);
  if (given) return toFirstPersonSummary(given);

  const thinking = normalizeText(message.thinking);
  if (!thinking) return '我正在认真想。';

  return toFirstPersonSummary(thinking);
}

function toFirstPersonSummary(text) {
  const clean = normalizeText(text)
    .replace(/^我认为[:：]?/g, '我在想')
    .replace(/^思考[:：]?/g, '')
    .replace(/^分析[:：]?/g, '')
    .replace(/^总结[:：]?/g, '')
    .trim();

  if (!clean) return '我正在认真想。';

  if (/^我/.test(clean)) {
    return clean.length > 18 ? `${clean.slice(0, 18)}…` : clean;
  }

  const short = clean.length > 14 ? clean.slice(0, 14) : clean;
  return `我在想${short}`;
}

function detectToolType(tool) {
  const text = normalizeText([
    tool.type,
    tool.name,
    tool.toolName,
    tool.title,
    tool.source,
    tool.action
  ].join(' ')).toLowerCase();

  if (/memory|记忆/.test(text)) return 'memory';
  if (/mcp|search|browser|web|fetch|联网|上网|搜索/.test(text)) return 'web';
  if (/wallet|transfer|shop|gift|钱包|商店|礼物/.test(text)) return 'card';
  if (/code|html|js|css|代码/.test(text)) return 'code';
  return 'tool';
}

function getStepIcon(type) {
  if (type === 'thinking') return 'thought';
  if (type === 'memory') return 'memory';
  if (type === 'web') return 'web';
  if (type === 'code') return 'code';
  if (type === 'card') return 'card';
  return 'tool';
}

function buildToolDetailText(tool) {
  const parts = [];
  const status = getToolStatusText(tool);
  const params = normalizeToolValue(tool.query || tool.input || tool.arguments || tool.params);
  const result = normalizeToolValue(tool.result || tool.output || tool.content || tool.detail);
  const error = normalizeToolValue(tool.error || tool.message);

  if (status) parts.push(`状态：${status}`);
  if (params) parts.push(`参数：\n${params}`);
  if (error) parts.push(`错误：\n${error}`);
  if (result) parts.push(`结果：\n${result}`);

  return parts.join('\n\n') || normalizeToolValue(tool) || '没有记录详情';
}

// ═══════════════════════════════════════
// 【作者信息】头像和名称
// ═══════════════════════════════════════

function createMessageAuthor(state, message) {
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
// 【气泡内容】消息气泡和内容类型
// ═══════════════════════════════════════

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

// ───────────────────
// 语音消息卡片
// ───────────────────

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

// ───────────────────
// 转账和商店小卡片
// ───────────────────

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
// ───────────────────
// 表情包内容
// ───────────────────

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

// ───────────────────
// 骰子和石头剪刀布
// ───────────────────

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

// ───────────────────
// 文本和代码块
// ───────────────────

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

function createCodeActionButton(text, icon, onClick) {
  const btn = safeButton('chat-message-code-action', text);
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

// ═══════════════════════════════════════
// 【操作栏】消息操作按钮和菜单
// ═══════════════════════════════════════

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
  const chip = el('span', 'chat-message-token-chip');
  chip.textContent = `${estimateMessageTokens(message)}t`;
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
    renderThreadMessages(state, pageEl);
  });

  actions.append(cancel, save);
  sheet.append(title, textarea, actions);
  showBottomSheet(sheet);

  requestAnimationFrame(() => textarea.focus());
}

function sheetButton(text, icon, onClick) {
  const btn = safeButton('chat-action-sheet-item', text);
  btn.append(createLineIcon(icon), el('span', '', text));
  btn.addEventListener('click', onClick);
  return btn;
}
// ═══════════════════════════════════════
// 【引用预览】输入框上方的引用条
// ═══════════════════════════════════════

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
  const btn = safeButton('chat-quote-preview-close', '取消引用');
  btn.appendChild(createLineIcon('x'));
  btn.addEventListener('click', () => {
    state.quotedMessageId = '';
    renderQuotePreview(state, pageEl);
  });
  return btn;
}

// ───────────────────
// 空状态
// ───────────────────

function createEmptyThread() {
  const empty = el('section', 'chat-empty');
  empty.append(
    el('div', 'chat-empty-title', '这里还安安静静的'),
    el('div', 'chat-empty-desc', '先递一句话过去，TA 会接住你。')
  );
  return empty;
}

// ═══════════════════════════════════════
// 【数据工具】消息过滤、目标信息、用户档案
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

// ═══════════════════════════════════════
// 【通用工具】图片选择、代码分割、估算token
// ═══════════════════════════════════════

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
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === false) return [];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  return [value].filter(Boolean);
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
  return summary ? trimOneLine(summary, 34) : '已完成';
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
    html: 'html', htm: 'html', css: 'css', js: 'js',
    javascript: 'js', json: 'json', md: 'md', markdown: 'md',
    txt: 'txt', python: 'py', py: 'py', typescript: 'ts', ts: 'ts'
  };

  if (map[value]) return map[value];
  if (isHtmlCode(value, code)) return 'html';
  return 'txt';
}

function getCodeMime(lang, code) {
  const ext = getCodeExtension(lang, code);
  const map = {
    html: 'text/html;charset=utf-8', css: 'text/css;charset=utf-8',
    js: 'text/javascript;charset=utf-8', json: 'application/json;charset=utf-8',
    md: 'text/markdown;charset=utf-8', py: 'text/x-python;charset=utf-8',
    ts: 'text/typescript;charset=utf-8', txt: 'text/plain;charset=utf-8'
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

function getMessageTimeValue(message) {
  if (!message?.timestamp) return 0;
  const time = new Date(message.timestamp).getTime();
  return Number.isFinite(time) ? time : 0;
}

function formatTimeDividerText(currentTime, lastTime) {
  if (!currentTime) return '刚刚';

  if (!lastTime) {
    const date = new Date(currentTime);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    if (sameDay) return `今天 ${formatClock(date)}`;
    if (date.toDateString() === yesterday.toDateString()) return `昨天 ${formatClock(date)}`;
    return `${date.getMonth() + 1}月${date.getDate()}日 ${formatClock(date)}`;
  }

  const diff = Math.max(0, currentTime - lastTime);
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `过了 ${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `过了 ${hours} 小时`;
  const days = Math.floor(hours / 24);
  return `过了 ${days} 天`;
}

function formatClock(date) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// ═══════════════════════════════════════
// 【DOM工具】按钮、图标、元素创建
// ═══════════════════════════════════════

function smallAction(iconName, label, onClick) {
  const btn = safeButton('chat-message-action-btn', label);
  btn.appendChild(createLineIcon(iconName));
  btn.addEventListener('click', onClick);
  return btn;
}

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

// ═══════════════════════════════════════
// 【样式注入】聊天渲染组件样式
// ═══════════════════════════════════════

function injectStyle() {
  if (document.getElementById(RENDER_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = RENDER_STYLE_ID;
  style.textContent = `
    .chat-time-divider {
      width: 100%;
      display: flex;
      justify-content: center;
      margin: 10px 0 6px;
      pointer-events: none;
    }

    .chat-time-pill {
      max-width: 80%;
      padding: 6px 11px;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-hint);
      box-shadow: var(--shadow-sm);
      font-size: 11px;
      line-height: 1.35;
      white-space: nowrap;
    }

    .chat-message-row {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 6px;
      animation: chatMessageIn 200ms ease both;
      overscroll-behavior: contain;
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
      touch-action: pan-y;
    }

    .chat-message-body.role-user {
      align-items: flex-end;
    }

    .chat-message-body.role-assistant {
      align-items: flex-start;
    }

    .chat-message-row.mode-dialog {
      gap: 4px;
      margin: 2px 0 12px;
    }

    .chat-message-row.mode-dialog .chat-message-body {
      width: auto;
      max-width: min(78%, 620px);
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
      margin-right: 46px;
    }

    .chat-message-row.mode-dialog.role-assistant .chat-message-bubble {
      margin-left: 46px;
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
      max-width: min(100%, 540px);
      color: var(--text-primary);
      font-size: var(--font-size-base);
      line-height: 1.72;
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
      touch-action: manipulation;
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
      width: auto;
      max-width: 240px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .chat-reasoning-stack.role-user {
      align-self: flex-end;
      margin-right: 46px;
    }

    .chat-reasoning-stack.role-assistant {
      align-self: flex-start;
      margin-left: 46px;
    }

    .chat-reasoning-stack.mode-dialog {
      max-width: 220px;
    }

    .chat-reasoning-peek {
      width: 100%;
      min-height: 34px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      padding: 7px 10px;
      border-radius: 18px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      text-align: left;
      transition: all 200ms ease;
      touch-action: manipulation;
    }

    .chat-reasoning-peek:active {
      transform: scale(0.98);
    }

    .chat-reasoning-peek svg {
      color: var(--text-hint);
      flex: 0 0 auto;
    }

    .chat-reasoning-peek-text {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      font-size: 12px;
      line-height: 1.4;
      color: var(--text-secondary);
    }

    .chat-reasoning-sheet {
      min-height: min(58vh, 560px);
      max-height: min(78vh, 720px);
      display: flex;
      flex-direction: column;
      padding: 0 2px 8px;
      color: var(--text-primary);
    }

    .chat-reasoning-sheet-handle {
      width: 48px;
      height: 5px;
      flex: 0 0 auto;
      margin: 0 auto 16px;
      border-radius: 999px;
      background: var(--text-hint);
      opacity: 0.28;
    }

    .chat-reasoning-sheet-top {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: 48px minmax(0, 1fr) 48px;
      align-items: center;
      gap: 10px;
      margin-bottom: 18px;
    }

    .chat-reasoning-sheet-title {
      min-width: 0;
      text-align: center;
      color: var(--text-primary);
      font-size: 18px;
      font-weight: 650;
      line-height: 1.35;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .chat-reasoning-sheet-close {
      width: 46px;
      height: 46px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-md);
      transition: all 200ms ease;
      touch-action: manipulation;
    }

    .chat-reasoning-sheet-close:active {
      transform: scale(0.96);
    }

    .chat-reasoning-sheet-spacer {
      width: 48px;
      height: 1px;
    }

    .chat-reasoning-sheet-content {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
    }

    .chat-reasoning-timeline {
      height: 100%;
      overflow-y: auto;
      padding: 2px 8px 12px;
      overscroll-behavior: contain;
    }

    .chat-timeline-step {
      position: relative;
      display: flex;
      flex-direction: column;
      padding: 0 0 18px;
    }

    .chat-timeline-step::before {
      content: "";
      position: absolute;
      left: 22px;
      top: 45px;
      bottom: -2px;
      width: 2px;
      border-radius: 999px;
      background: var(--text-hint);
      opacity: 0.2;
    }

    .chat-timeline-step:last-child::before {
      display: none;
    }

    .chat-timeline-head {
      width: 100%;
      min-height: 48px;
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) 28px;
      align-items: center;
      gap: 14px;
      padding: 0;
      background: transparent;
      color: var(--text-primary);
      font: inherit;
      text-align: left;
      transition: all 200ms ease;
      touch-action: manipulation;
    }

    .chat-timeline-head:active {
      transform: scale(0.99);
    }

    .chat-timeline-marker {
      width: 44px;
      height: 44px;
      position: relative;
      z-index: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--text-secondary);
      background: var(--bg-card);
      border-radius: 999px;
      box-shadow: var(--shadow-sm);
    }

    .chat-timeline-marker svg {
      width: 19px;
      height: 19px;
    }

    .chat-timeline-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 2px 0;
    }

    .chat-timeline-title {
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 650;
      line-height: 1.38;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .chat-timeline-summary {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.45;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .chat-timeline-arrow {
      display: inline-flex;
      justify-content: center;
      color: var(--text-hint);
      transition: all 200ms ease;
    }

    .chat-reasoning-detail-view {
      height: 100%;
      overflow-y: auto;
      padding: 2px 8px 14px;
      overscroll-behavior: contain;
    }

    .chat-reasoning-detail-title {
      margin: 2px 0 12px;
      color: var(--text-primary);
      font-size: 16px;
      font-weight: 650;
      line-height: 1.45;
    }

    .chat-reasoning-detail-summary {
      margin: 0 0 14px;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.55;
    }

    .chat-reasoning-detail-card {
      padding: 14px 15px;
      border-radius: 20px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .chat-reasoning-detail-pre {
      margin: 0;
      color: var(--text-primary);
      font-size: 14px;
      line-height: 1.75;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: var(--font-main);
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
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
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
      opacity: 0.5;
      overflow: hidden;
      transition: all 200ms ease;
      touch-action: manipulation;
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
      opacity: 0.36;
    }

    .chat-message-row.mode-dialog.role-user .chat-message-actions {
      margin-right: 46px;
    }

    .chat-message-row.mode-dialog.role-assistant .chat-message-actions {
      margin-left: 46px;
    }

    .chat-message-row.mode-dialog .chat-message-body:hover .chat-message-actions {
      opacity: 0.72;
    }

    .chat-message-action-btn,
    .chat-message-token-chip {
      min-height: 26px;
      min-width: 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      border-radius: 999px;
      padding: 0 7px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      white-space: nowrap;
    }

    .chat-message-row.mode-dialog .chat-message-action-btn,
    .chat-message-row.mode-dialog .chat-message-token-chip {
      min-height: 24px;
      min-width: 24px;
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
      touch-action: manipulation;
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
      .chat-message-body {
        max-width: 92%;
        width: auto;
      }

      .chat-message-row.mode-dialog .chat-message-body {
        max-width: 80%;
      }

      .chat-reasoning-stack {
        max-width: 210px;
      }

      .chat-message-name {
        max-width: 104px;
      }

      .chat-message-bubble {
        padding: 10px 12px;
      }

      .chat-message-row.mode-dialog .chat-message-bubble {
        padding: 0;
      }

      .chat-message-row.mode-dialog.role-user .chat-message-bubble,
      .chat-message-row.mode-dialog.role-user .chat-message-actions {
        margin-right: 42px;
      }

      .chat-message-row.mode-dialog.role-assistant .chat-message-bubble,
      .chat-message-row.mode-dialog.role-assistant .chat-message-actions {
        margin-left: 42px;
      }

      .chat-reasoning-stack.role-user {
        margin-right: 42px;
      }

      .chat-reasoning-stack.role-assistant {
        margin-left: 42px;
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
        min-width: 24px;
        padding: 0 6px;
        font-size: 11px;
      }

      .chat-message-row.mode-dialog .chat-message-action-btn,
      .chat-message-row.mode-dialog .chat-message-token-chip {
        min-height: 22px;
        min-width: 22px;
        padding: 0 5px;
      }

      .chat-reasoning-sheet {
        min-height: min(62vh, 620px);
      }

      .chat-timeline-title {
        font-size: 14px;
      }

      .chat-timeline-summary {
        font-size: 12px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .chat-message-row,
      .chat-quote-preview,
      .chat-dice-card[data-rolling="true"] .chat-dice-face,
      .chat-rps-card[data-flipping="true"] .chat-rps-icon,
      .chat-voice-waves i {
        animation: none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/storage.js(getData)；../../core/ui.js(showToast,showBottomSheet,hideBottomSheet)；./thread-actions.js(copyThreadMessage,quoteThreadMessage,editThreadMessage,deleteThreadMessage,regenerateThreadMessage,continueThreadMessage,playThreadTTS,stopThreadTTS)；./thinking-chain.js(createThinkingChainButton)
