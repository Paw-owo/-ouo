// apps/chat/thinking-chain.js
// imports:
//   from '../../core/ui.js': showBottomSheet, hideBottomSheet

import { showBottomSheet, hideBottomSheet } from '../../core/ui.js';

const THINKING_CHAIN_STYLE_ID = 'chat-thinking-chain-style';
const THINKING_PILL_TEXTS = [
  '认真想你说的话…',
  '想着呢…',
  '嗯…让我想想',
  '在想我该怎么回…'
];

// ═══════════════════════════════════════
// 【对外导出】给聊天渲染层调用的主入口
// ═══════════════════════════════════════

export function hasThinkingChain(message) {
  const steps = buildThinkingSteps(message);
  return steps.length > 0;
}

export function createThinkingChainButton(message, options = {}) {
  injectStyle();

  const steps = buildThinkingSteps(message);
  if (!steps.length) return null;

  const roleName = String(options.roleName || options.characterName || options.name || '').trim();
  const isRunning = isThinkingRunning(message, steps);
  const button = createSafeButton('chat-thinking-pill', isRunning ? '打开想法步骤' : '打开想法步骤');
  button.dataset.running = isRunning ? 'true' : 'false';

  const iconWrap = el('span', 'chat-thinking-pill-icon');
  iconWrap.appendChild(createPillIcon(isRunning ? 'thinking' : 'done'));

  const text = el(
    'span',
    'chat-thinking-pill-text',
    isRunning
      ? getRunningText(message, roleName)
      : `想了${formatThinkingDuration(message, steps)}`
  );

  button.append(iconWrap, text);

  button.addEventListener('click', () => {
    openThinkingChainSheet(message, options);
  });

  return button;
}

export function openThinkingChainSheet(message, options = {}) {
  injectStyle();

  const steps = buildThinkingSteps(message);
  if (!steps.length) return;

  const roleName = String(options.roleName || options.characterName || options.name || '').trim();
  const titleText = getSheetTitle(message, roleName);

  const sheet = el('section', 'chat-thinking-sheet');
  const handle = el('div', 'chat-thinking-sheet-handle');

  const header = el('div', 'chat-thinking-sheet-header');
  const title = el('div', 'chat-thinking-sheet-title', titleText);

  const closeBtn = createSafeButton('chat-thinking-sheet-close', '关闭');
  closeBtn.appendChild(createNodeIcon('close', false));
  closeBtn.addEventListener('click', () => hideBottomSheet());

  header.append(title, closeBtn);

  const list = el('div', 'chat-thinking-chain-list');

  steps.forEach((step, index) => {
    const item = createChainItem(step, index);
    list.appendChild(item);
  });

  sheet.append(handle, header, list);
  showBottomSheet(sheet);
}

export function buildThinkingSteps(message) {
  const steps = [];
  const toolSteps = normalizeToolCalls(message?.toolCalls);
  const memorySteps = normalizeToolCalls(message?.memoryWrites || message?.memories || message?.memoryUpdates);
  const thinkingText = normalizeMultiline(message?.thinking);
  const isRunning = isMessageRunning(message);
  const hasActionSteps = toolSteps.length > 0 || memorySteps.length > 0;

  if (thinkingText) {
    steps.push({
      type: 'thinking',
      title: getThinkingTitle(message),
      summary: getThinkingSummary(message),
      detail: thinkingText,
      running: isRunning && !toolSteps.length && !memorySteps.length,
      done: !isRunning || hasActionSteps
    });
  }

  if (toolSteps.length) {
    toolSteps.forEach((tool, index) => {
      const toolType = detectToolType(tool);
      const status = getToolStatus(tool);
      steps.push({
        type: toolType === 'memory' ? 'memory' : 'tool',
        title: getToolTitle(tool, index),
        summary: getToolSummary(tool),
        detail: buildToolDetailText(tool),
        running: status === 'running',
        done: status !== 'running'
      });
    });
  }

  if (memorySteps.length) {
    memorySteps.forEach((memory, index) => {
      steps.push({
        type: 'memory',
        title: getMemoryTitle(memory, index),
        summary: getMemorySummary(memory),
        detail: normalizeToolValue(memory) || '这一步没有留下更多内容。',
        running: false,
        done: true
      });
    });
  }

  if (steps.length) {
    steps.push({
      type: 'write',
      title: isRunning ? '我在组织回复' : '我把想法写出来啦',
      summary: isRunning ? '我在把前面的内容慢慢整理成一句句回复。' : '前面的想法已经变成现在这段回复了。',
      detail: normalizeMultiline(message?.content) || '这一步没有更多内容。',
      running: isRunning,
      done: !isRunning
    });
  }

  if (steps.length && !isRunning) {
    steps.push({
      type: 'done',
      title: '我想完啦',
      summary: '这一轮已经顺顺地回完了。',
      detail: '这次回复已经完成啦。',
      running: false,
      done: true
    });
  }

  return steps;
}

// ═══════════════════════════════════════
// 【节点渲染】生成步骤链节点和展开详情
// ═══════════════════════════════════════

function createChainItem(step, index) {
  const item = el('section', 'chat-thinking-chain-item');
  item.dataset.type = step.type || 'thinking';
  item.dataset.open = 'false';
  item.style.setProperty('--thinking-delay', `${index * 70}ms`);

  const button = createSafeButton('chat-thinking-chain-head', step.title || `步骤 ${index + 1}`);

  const marker = el('span', 'chat-thinking-chain-marker');
  marker.dataset.running = step.running ? 'true' : 'false';
  marker.appendChild(createNodeIcon(step.type, step.running));

  const body = el('span', 'chat-thinking-chain-body');
  const title = el('span', 'chat-thinking-chain-item-title', step.title || `步骤 ${index + 1}`);
  const summary = el('span', 'chat-thinking-chain-item-summary', step.summary || '我轻轻做完了这一步。');
  body.append(title, summary);

  const arrow = el('span', 'chat-thinking-chain-arrow');
  arrow.appendChild(createNodeIcon('chevron', false));

  button.append(marker, body, arrow);

  const detail = el('div', 'chat-thinking-chain-detail');
  const detailText = el('pre', 'chat-thinking-chain-detail-text');
  detailText.textContent = normalizeDetailText(step);
  detail.appendChild(detailText);

  button.addEventListener('click', () => {
    const isOpen = item.dataset.open === 'true';
    item.dataset.open = isOpen ? 'false' : 'true';
  });

  item.append(button, detail);
  return item;
}

// ═══════════════════════════════════════
// 【状态文案】按钮和标题文字
// ═══════════════════════════════════════

function getRunningText(message, roleName) {
  const custom = normalizeText(
    message?.thinkingLabel ||
    message?.thinkingStatusText ||
    message?.thinkingDisplayText
  );
  if (custom) return custom;

  const pool = THINKING_PILL_TEXTS.slice();
  const seed = getStableNumber(message?.id || message?.timestamp || roleName || pool.join(''));
  return pool[seed % pool.length];
}

function getSheetTitle(message, roleName) {
  const custom = normalizeText(message?.thinkingSheetTitle || message?.thinkingTitle);
  if (custom) return custom;

  if (roleName) {
    return `${roleName}在想什么`;
  }

  return '他在想什么';
}

function getThinkingTitle(message) {
  const custom = normalizeText(message?.thinkingStepTitle);
  if (custom) return custom;
  return '我先想了一下';
}

function getThinkingSummary(message) {
  const summary = normalizeText(
    message?.thinkingSummary ||
    message?.reasoningSummary ||
    message?.summary
  );

  if (summary) {
    return trimOneLine(toFirstPersonSummary(summary), 40) || '我在整理回应方向。';
  }

  const thinking = normalizeText(message?.thinking);
  if (!thinking) return '我在整理回应方向。';

  return trimOneLine(toFirstPersonSummary(thinking), 40) || '我在整理回应方向。';
}

function getToolTitle(tool, index) {
  const title = normalizeText(tool?.title || tool?.name || tool?.toolName || tool?.action);
  return title || `我用了一个小工具 ${index + 1}`;
}

function getToolSummary(tool) {
  const status = getToolStatus(tool);
  if (status === 'running') return '我还在轻轻处理这一步。';
  if (status === 'error') return '这一步没有顺顺利利完成。';

  const summary = normalizeText(tool?.summary || tool?.resultSummary || tool?.result || tool?.output || tool?.content);
  return trimOneLine(summary, 42) || '这一步已经处理好了。';
}

function getMemoryTitle(memory, index) {
  const title = normalizeText(memory?.title || memory?.name);
  return title || `我翻到了一点记忆 ${index + 1}`;
}

function getMemorySummary(memory) {
  const summary = normalizeText(memory?.summary || memory?.content || memory?.text);
  return trimOneLine(summary, 42) || '我把重要的小事轻轻记住了。';
}

function formatThinkingDuration(message, steps) {
  const directSeconds = pickDurationSeconds(message);
  if (directSeconds > 0) {
    return directSeconds >= 60
      ? `${Math.max(1, Math.round(directSeconds / 60))}分钟`
      : `${Math.max(1, Math.round(directSeconds))}秒`;
  }

  const thinkingLength = normalizeText(message?.thinking).length;
  const toolCount = normalizeToolCalls(message?.toolCalls).length;
  const memoryCount = normalizeToolCalls(message?.memoryWrites || message?.memories || message?.memoryUpdates).length;
  const rough = Math.max(1, Math.min(24, Math.round(thinkingLength / 24) + toolCount * 2 + memoryCount));
  if (rough >= 60) return `${Math.max(1, Math.round(rough / 60))}分钟`;
  return `${rough}秒`;
}

// ═══════════════════════════════════════
// 【图标】内联 SVG 和轻动画
// ═══════════════════════════════════════

function createPillIcon(type) {
  const wrap = el('span', `chat-thinking-icon-wrap type-${type}`);

  if (type === 'done') {
    wrap.appendChild(createNodeIcon('done', false));
    return wrap;
  }

  wrap.appendChild(createNodeIcon('thinking', true));
  return wrap;
}

function createNodeIcon(type, animated) {
  const svg = svgEl('svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  if (type === 'thinking') {
    const head = pathEl('M12 4.5c4 0 7 2.9 7 6.6 0 2.1-.9 3.8-2.6 5.1-.5.4-.8 1-.9 1.6H8.5c-.1-.6-.4-1.2-.9-1.6C5.9 14.9 5 13.2 5 11.1 5 7.4 8 4.5 12 4.5Z');
    head.classList.add('chat-thinking-icon-head');

    const eyeLeft = circleEl('9.2', '11', '0.7');
    eyeLeft.classList.add('chat-thinking-icon-eye', 'left');

    const eyeRight = circleEl('14.8', '11', '0.7');
    eyeRight.classList.add('chat-thinking-icon-eye', 'right');

    const mouth = pathEl('M10 14.2c.7.5 1.4.8 2 .8s1.3-.3 2-.8');
    const star = pathEl('M18.3 5.6l.5 1.2 1.2.5-1.2.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5.5-1.2Z');
    star.classList.add(animated ? 'chat-thinking-icon-star' : '');

    const neck = pathEl('M9.5 19h5');
    svg.append(head, eyeLeft, eyeRight, mouth, neck, star);
    return svg;
  }

  if (type === 'tool') {
    const circle = circleEl('12', '12', '3');
    const gear = pathEl('M12 4.5v2.1M12 17.4v2.1M19.5 12h-2.1M6.6 12H4.5M17.3 6.7l-1.5 1.5M8.2 15.8l-1.5 1.5M17.3 17.3l-1.5-1.5M8.2 8.2 6.7 6.7');
    if (animated) gear.classList.add('chat-thinking-icon-rotate');
    svg.append(gear, circle);
    return svg;
  }

  if (type === 'memory') {
    const book = rectEl('6', '5', '12', '14', '3');
    const line1 = pathEl('M9 9h6');
    const line2 = pathEl('M9 12h6');
    const page = pathEl('M12 5v14');
    if (animated) page.classList.add('chat-thinking-icon-book');
    svg.append(book, line1, line2, page);
    return svg;
  }

  if (type === 'write') {
    const feather = pathEl('M18.5 5.5c-3.5.3-6.3 1.8-8.3 4.4-1.3 1.7-2.1 3.6-2.4 5.8 2.2-.3 4.1-1.1 5.8-2.4 2.6-2 4.1-4.8 4.4-8.3Z');
    const line = pathEl('M8.3 15.7 5.8 18.2');
    if (animated) feather.classList.add('chat-thinking-icon-write');
    svg.append(feather, line);
    return svg;
  }

  if (type === 'done') {
    const check = pathEl('M6.5 12.3 10.2 16 17.5 8.8');
    check.classList.add('chat-thinking-icon-bounce');
    svg.appendChild(check);
    return svg;
  }

  if (type === 'close') {
    svg.append(pathEl('M7 7l10 10'), pathEl('M17 7 7 17'));
    return svg;
  }

  if (type === 'chevron') {
    svg.appendChild(pathEl('m9 6 6 6-6 6'));
    return svg;
  }

  svg.appendChild(circleEl('12', '12', '8'));
  return svg;
}

// ═══════════════════════════════════════
// 【数据处理】兼容不同消息结构
// ═══════════════════════════════════════

function isThinkingRunning(message, steps) {
  if (isMessageRunning(message)) return true;
  return steps.some((step) => step.running);
}

function isMessageRunning(message) {
  const status = normalizeText(
    message?.status ||
    message?.streamStatus ||
    message?.thinkingStatus ||
    message?.state
  ).toLowerCase();

  if (['streaming', 'thinking', 'running', 'loading', 'pending'].includes(status)) return true;
  if (message?.isStreaming === true || message?.streaming === true || message?.pending === true) return true;
  return false;
}

function getToolStatus(tool) {
  const status = normalizeText(tool?.status || tool?.state).toLowerCase();
  if (['running', 'loading', 'pending', 'calling'].includes(status)) return 'running';
  if (['error', 'failed', 'fail'].includes(status)) return 'error';
  return 'done';
}

function detectToolType(tool) {
  const text = normalizeText([
    tool?.type,
    tool?.name,
    tool?.toolName,
    tool?.title,
    tool?.source,
    tool?.action
  ].join(' ')).toLowerCase();

  if (/memory|记忆|summary|总结/.test(text)) return 'memory';
  return 'tool';
}

function buildToolDetailText(tool) {
  const parts = [];
  const status = getToolStatus(tool);
  const params = normalizeToolValue(tool?.query || tool?.input || tool?.arguments || tool?.params);
  const result = normalizeToolValue(tool?.result || tool?.output || tool?.content || tool?.detail);
  const error = normalizeToolValue(tool?.error || tool?.message);

  if (status === 'running') parts.push('状态：我还在处理中。');
  if (status === 'error') parts.push('状态：这一步没有成功。');
  if (params) parts.push(`我拿到的内容：\n${params}`);
  if (error) parts.push(`我碰到的问题：\n${error}`);
  if (result) parts.push(`我得到的结果：\n${result}`);

  return parts.join('\n\n') || '这一步没有留下更多内容。';
}

function pickDurationSeconds(message) {
  const candidates = [
    message?.thinkingSeconds,
    message?.reasoningSeconds,
    message?.durationSeconds,
    message?.thinkingDuration,
    message?.reasoningDuration
  ];

  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }

  const startedAt = new Date(message?.thinkingStartedAt || message?.startedAt || '').getTime();
  const endedAt = new Date(message?.thinkingEndedAt || message?.completedAt || message?.finishedAt || '').getTime();

  if (Number.isFinite(startedAt) && Number.isFinite(endedAt) && endedAt > startedAt) {
    return Math.max(1, Math.round((endedAt - startedAt) / 1000));
  }

  return 0;
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

function normalizeDetailText(step) {
  const detail = normalizeMultiline(step?.detail);
  const summary = normalizeMultiline(step?.summary);

  if (!detail) return '这里暂时没有更多细节。';
  if (detail === summary) return '这一步没有更多展开内容。';

  return detail;
}

function trimOneLine(text, max) {
  const clean = normalizeText(text);
  if (!clean) return '';
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function toFirstPersonSummary(text) {
  const clean = normalizeText(text)
    .replace(/^我认为[:：]?/g, '我在想')
    .replace(/^思考[:：]?/g, '')
    .replace(/^分析[:：]?/g, '')
    .replace(/^总结[:：]?/g, '')
    .trim();

  if (!clean) return '我在整理回应方向。';
  if (/^我/.test(clean)) return clean;

  return `我在想${clean}`;
}

function getStableNumber(text) {
  const source = String(text || 'thinking');
  let value = 0;

  for (let index = 0; index < source.length; index += 1) {
    value = (value * 31 + source.charCodeAt(index)) % 1000003;
  }

  return value;
}

// ═══════════════════════════════════════
// 【基础 DOM】小工具函数
// ═══════════════════════════════════════

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function createSafeButton(className, label) {
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

function svgEl(tag) {
  return document.createElementNS('http://www.w3.org/2000/svg', tag);
}

function pathEl(d) {
  const path = svgEl('path');
  path.setAttribute('d', d);
  return path;
}

function circleEl(cx, cy, r) {
  const circle = svgEl('circle');
  circle.setAttribute('cx', cx);
  circle.setAttribute('cy', cy);
  circle.setAttribute('r', r);
  return circle;
}

function rectEl(x, y, width, height, rx = 2) {
  const rect = svgEl('rect');
  rect.setAttribute('x', x);
  rect.setAttribute('y', y);
  rect.setAttribute('width', width);
  rect.setAttribute('height', height);
  rect.setAttribute('rx', rx);
  return rect;
}

// ═══════════════════════════════════════
// 【样式注入】组件自己的样式和动画
// ═══════════════════════════════════════

function injectStyle() {
  if (document.getElementById(THINKING_CHAIN_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = THINKING_CHAIN_STYLE_ID;
  style.textContent = `
    .chat-thinking-pill {
      min-height: 30px;
      max-width: min(240px, 72vw);
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 12px;
      line-height: 1.35;
      text-align: left;
      transition: all 200ms ease;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
    }

    .chat-thinking-pill:active {
      transform: scale(0.96);
    }

    .chat-thinking-pill-icon {
      width: 18px;
      height: 18px;
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--accent);
    }

    .chat-thinking-pill[data-running="false"] .chat-thinking-pill-icon {
      color: var(--text-secondary);
    }

    .chat-thinking-pill-text {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .chat-thinking-sheet {
      min-height: min(56vh, 560px);
      max-height: min(78vh, 720px);
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 0 2px 8px;
      color: var(--text-primary);
    }

    .chat-thinking-sheet-handle {
      width: 48px;
      height: 5px;
      margin: 0 auto;
      border-radius: 999px;
      background: var(--text-hint);
      opacity: 0.28;
      flex: 0 0 auto;
    }

    .chat-thinking-sheet-header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      flex: 0 0 auto;
    }

    .chat-thinking-sheet-title {
      min-width: 0;
      color: var(--text-primary);
      font-size: 17px;
      font-weight: 600;
      line-height: 1.35;
      padding-left: 4px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .chat-thinking-sheet-close {
      width: 40px;
      height: 40px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
      touch-action: manipulation;
    }

    .chat-thinking-sheet-close:active {
      transform: scale(0.96);
    }

    .chat-thinking-chain-list {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      padding: 2px 4px 12px;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }

    .chat-thinking-chain-item {
      position: relative;
      display: flex;
      flex-direction: column;
      padding: 0 0 16px;
      opacity: 0;
      transform: translateY(8px);
      animation: chatThinkingChainItemIn 240ms ease forwards;
      animation-delay: var(--thinking-delay, 0ms);
    }

    .chat-thinking-chain-item::before {
      content: "";
      position: absolute;
      left: 18px;
      top: 42px;
      bottom: -2px;
      width: 2px;
      border-radius: 999px;
      background: var(--surface-muted);
      opacity: 1;
    }

    .chat-thinking-chain-item:last-child::before {
      display: none;
    }

    .chat-thinking-chain-head {
      width: 100%;
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr) 24px;
      align-items: start;
      gap: 12px;
      padding: 0;
      background: transparent;
      color: var(--text-primary);
      font: inherit;
      text-align: left;
      transition: all 200ms ease;
      touch-action: manipulation;
    }

    .chat-thinking-chain-head:active {
      transform: scale(0.99);
    }

    .chat-thinking-chain-marker {
      width: 36px;
      height: 36px;
      position: relative;
      z-index: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--accent);
      box-shadow: var(--shadow-sm);
      flex: 0 0 auto;
    }

    .chat-thinking-chain-item[data-type="done"] .chat-thinking-chain-marker {
      color: var(--text-secondary);
    }

    .chat-thinking-chain-item[data-type="memory"] .chat-thinking-chain-marker {
      color: var(--text-primary);
    }

    .chat-thinking-chain-item[data-type="write"] .chat-thinking-chain-marker {
      color: var(--accent-dark, var(--accent));
    }

    .chat-thinking-chain-body {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding-top: 2px;
    }

    .chat-thinking-chain-item-title {
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.4;
      word-break: break-word;
    }

    .chat-thinking-chain-item-summary {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.5;
      word-break: break-word;
    }

    .chat-thinking-chain-arrow {
      width: 24px;
      height: 24px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--text-hint);
      transition: all 200ms ease;
      padding-top: 6px;
    }

    .chat-thinking-chain-item[data-open="true"] .chat-thinking-chain-arrow {
      transform: rotate(90deg);
    }

    .chat-thinking-chain-detail {
      max-height: 0;
      overflow: hidden;
      opacity: 0;
      margin-left: 48px;
      transition: all 200ms ease;
    }

    .chat-thinking-chain-item[data-open="true"] .chat-thinking-chain-detail {
      max-height: 360px;
      opacity: 1;
      padding-top: 8px;
    }

    .chat-thinking-chain-detail-text {
      margin: 0;
      padding: 12px 14px;
      border-radius: 18px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-family: var(--font-main);
      font-size: 13px;
      line-height: 1.65;
      white-space: pre-wrap;
      word-break: break-word;
      overflow-y: auto;
      max-height: 320px;
    }

    .chat-thinking-icon-eye {
      transform-origin: center;
      animation: chatThinkingBlink 3.2s ease-in-out infinite;
    }

    .chat-thinking-icon-eye.right {
      animation-delay: 120ms;
    }

    .chat-thinking-icon-star {
      transform-origin: 18.3px 7.3px;
      animation: chatThinkingTwinkle 2.6s linear infinite;
    }

    .chat-thinking-icon-rotate {
      transform-origin: 12px 12px;
      animation: chatThinkingRotate 2.2s linear infinite;
    }

    .chat-thinking-icon-book {
      transform-origin: 12px 12px;
      animation: chatThinkingBook 1.8s ease-in-out infinite;
    }

    .chat-thinking-icon-write {
      transform-origin: 13px 12px;
      animation: chatThinkingWrite 1.7s ease-in-out infinite;
    }

    .chat-thinking-icon-bounce {
      transform-origin: center;
      animation: chatThinkingBounce 820ms ease;
    }

    @keyframes chatThinkingChainItemIn {
      from {
        opacity: 0;
        transform: translateY(8px);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes chatThinkingBlink {
      0%, 44%, 48%, 100% {
        transform: scaleY(1);
      }

      46% {
        transform: scaleY(0.12);
      }
    }

    @keyframes chatThinkingTwinkle {
      0% {
        opacity: 0.7;
        transform: rotate(0deg) scale(0.92);
      }

      50% {
        opacity: 1;
        transform: rotate(180deg) scale(1.06);
      }

      100% {
        opacity: 0.7;
        transform: rotate(360deg) scale(0.92);
      }
    }

    @keyframes chatThinkingRotate {
      from {
        transform: rotate(0deg);
      }

      to {
        transform: rotate(360deg);
      }
    }

    @keyframes chatThinkingBook {
      0%, 100% {
        transform: rotateY(0deg);
        opacity: 0.9;
      }

      50% {
        transform: rotateY(24deg);
        opacity: 1;
      }
    }

    @keyframes chatThinkingWrite {
      0%, 100% {
        transform: rotate(-4deg) translateY(0);
      }

      50% {
        transform: rotate(4deg) translateY(1px);
      }
    }

    @keyframes chatThinkingBounce {
      0% {
        transform: scale(0.82);
      }

      55% {
        transform: scale(1.08);
      }

      100% {
        transform: scale(1);
      }
    }

    @media (max-width: 520px) {
      .chat-thinking-pill {
        max-width: min(220px, 74vw);
      }

      .chat-thinking-sheet {
        min-height: min(60vh, 620px);
      }

      .chat-thinking-chain-item-title {
        font-size: 14px;
      }

      .chat-thinking-chain-item-summary,
      .chat-thinking-chain-detail-text {
        font-size: 12px;
      }

      .chat-thinking-chain-detail {
        margin-left: 44px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .chat-thinking-chain-item,
      .chat-thinking-icon-eye,
      .chat-thinking-icon-star,
      .chat-thinking-icon-rotate,
      .chat-thinking-icon-book,
      .chat-thinking-icon-write,
      .chat-thinking-icon-bounce {
        animation: none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/ui.js(showBottomSheet,hideBottomSheet)
