// apps/chat/thinking-chain.js
// imports:
//   无外部依赖，纯 DOM 组件

const THINKING_CARD_CLASS = 'chat-thinking-card';
const THINKING_TRIGGER_CLASS = 'chat-thinking-trigger';
const THINKING_BODY_CLASS = 'chat-thinking-body';
const THINKING_TEXT_CLASS = 'chat-thinking-text';
const THINKING_TOOLS_CLASS = 'chat-thinking-tools';
const THINKING_TOOL_ITEM_CLASS = 'chat-thinking-tool-item';
const THINKING_TOOL_HEAD_CLASS = 'chat-thinking-tool-head';
const THINKING_TOOL_BODY_CLASS = 'chat-thinking-tool-body';

const FIXED_SUMMARY_TEXT = '让我想想这话何意味…';
const FIXED_SUMMARY_TEXT_RUNNING = '让我再想想…';

// 全局状态缓存：按消息 id + 内容指纹保存展开状态和打字进度
const stateCache = new Map();
const activeTypewriters = new WeakMap();

// ═══════════════════════════════════════
// 【对外导出】判断消息是否有 thinking 或工具内容
// ═══════════════════════════════════════

export function hasThinkingChain(message) {
  if (!message) return false;
  if (String(message.thinking || '').trim()) return true;
  if (normalizeToolCalls(message.toolCalls).length > 0) return true;
  if (normalizeToolCalls(message.memoryWrites).length > 0) return true;
  if (normalizeToolCalls(message.grudgeWrites).length > 0) return true;
  return false;
}

// ═══════════════════════════════════════
// 【对外导出】创建 thinking 折叠卡片
// ═══════════════════════════════════════
// options.roleName: 角色名，用于无障碍标签
// options.messageId: 消息 id，用于状态恢复

export function createThinkingCard(message, options = {}) {
  const roleName = String(options.roleName || options.characterName || options.name || 'TA').trim();
  const messageId = String(options.messageId || '').trim();
  const fingerprint = buildFingerprint(message);
  const isRunning = isMessageRunning(message);

  const card = el('section', THINKING_CARD_CLASS);
  card.dataset.running = isRunning ? 'true' : 'false';

  const trigger = createTrigger(roleName, isRunning);
  const body = createBody(message, roleName, messageId, fingerprint, isRunning);

  const stateKey = messageId ? `${messageId}:${fingerprint}` : null;
  const saved = stateKey ? getSavedCardState(stateKey) : null;
  card.dataset.expanded = saved?.expanded ? 'true' : 'false';

  trigger.addEventListener('click', () => {
    const expanded = card.dataset.expanded === 'true';
    card.dataset.expanded = expanded ? 'false' : 'true';

    if (stateKey) {
      saveCardState(stateKey, { expanded: !expanded });
    }
  });

  card.append(trigger, body);

  const cleanup = activeTypewriters.get(body);
  if (cleanup) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (node === card || card.contains(node)) {
            cleanup();
            observer.disconnect();
            return;
          }
        }
      }
    });

    if (card.parentNode) {
      observer.observe(card.parentNode, { childList: true, subtree: true });
    }
  }

  return card;
}

// ═══════════════════════════════════════
// 【状态持久化】用消息 id + 内容指纹做 key
// ═══════════════════════════════════════

function buildFingerprint(message) {
  const thinking = String(message?.thinking || '').trim();
  const tools = collectTools(message);
  const toolHash = tools.map((t) => `${t.name}:${t.status}:${String(t.result || '').slice(0, 40)}`).join('|');
  return hashString(`${thinking}|${toolHash}`).slice(0, 12);
}

function hashString(text) {
  let value = 0;
  for (let index = 0; index < text.length; index += 1) {
    value = (value * 31 + text.charCodeAt(index)) % 1000000007;
  }
  return value.toString(36);
}

function getSavedCardState(key) {
  if (!key) return null;
  return stateCache.get(key) || null;
}

function saveCardState(key, patch) {
  if (!key) return;

  const current = stateCache.get(key) || {};
  stateCache.set(key, { ...current, ...patch });
}

// ═══════════════════════════════════════
// 【触发区】固定文案 + 小图标
// ═══════════════════════════════════════

function createTrigger(roleName, isRunning) {
  const trigger = el('button', THINKING_TRIGGER_CLASS);
  trigger.type = 'button';
  trigger.setAttribute('aria-label', `${roleName}的思考过程`);

  const icon = createLineIcon('thought');
  icon.classList.add('chat-thinking-trigger-icon');

  const text = el('span', 'chat-thinking-trigger-text', isRunning ? FIXED_SUMMARY_TEXT_RUNNING : FIXED_SUMMARY_TEXT);

  const arrow = createLineIcon('chevron');
  arrow.classList.add('chat-thinking-trigger-arrow');

  trigger.append(icon, text, arrow);
  return trigger;
}

// ═══════════════════════════════════════
// 【展开内容区】thinking 文本 + 工具时间线
// ═══════════════════════════════════════

function createBody(message, roleName, messageId, fingerprint, isRunning) {
  const body = el('div', THINKING_BODY_CLASS);

  const thinkingText = String(message?.thinking || '').trim();
  if (thinkingText) {
    const textBlock = el('div', THINKING_TEXT_CLASS);
    const stateKey = messageId ? `${messageId}:${fingerprint}` : null;
    const typedKey = stateKey ? `${stateKey}:typed` : null;
    const saved = typedKey ? getSavedCardState(typedKey) : null;

    if (saved?.done || !isRunning) {
      textBlock.textContent = thinkingText;
      if (typedKey) saveCardState(typedKey, { done: true });
    } else {
      const cleanup = typeWrite(textBlock, thinkingText, () => {
        if (typedKey) saveCardState(typedKey, { done: true });
      });
      activeTypewriters.set(body, cleanup);
    }

    body.appendChild(textBlock);
  }

  const tools = collectTools(message);
  if (tools.length > 0) {
    const toolsWrap = el('div', THINKING_TOOLS_CLASS);
    tools.forEach((tool, index) => {
      toolsWrap.appendChild(createToolItem(tool, index, roleName, messageId, fingerprint));
    });
    body.appendChild(toolsWrap);
  }

  return body;
}

// ═══════════════════════════════════════
// 【工具时间线】单个工具折叠块
// ═══════════════════════════════════════

function createToolItem(tool, index, roleName, messageId, fingerprint) {
  const item = el('div', THINKING_TOOL_ITEM_CLASS);

  const status = getToolStatus(tool);
  const title = getToolTitle(tool, index);

  const head = el('button', THINKING_TOOL_HEAD_CLASS);
  head.type = 'button';
  head.setAttribute('aria-label', `展开${title}`);

  const dot = el('span', 'chat-thinking-tool-dot');
  dot.dataset.status = status;

  const icon = createLineIcon(status === 'running' ? 'tool' : status === 'error' ? 'warning' : 'check');
  icon.classList.add('chat-thinking-tool-icon');

  const label = el('span', 'chat-thinking-tool-title', title);

  const arrow = createLineIcon('chevron');
  arrow.classList.add('chat-thinking-tool-arrow');

  head.append(dot, icon, label, arrow);

  const detail = el('div', THINKING_TOOL_BODY_CLASS);
  const detailText = el('pre', 'chat-thinking-tool-detail-text', buildToolDetail(tool));
  detail.appendChild(detailText);

  const stateKey = messageId ? `${messageId}:${fingerprint}:tool:${index}` : null;
  const saved = stateKey ? getSavedCardState(stateKey) : null;
  item.dataset.open = saved?.open ? 'true' : 'false';

  head.addEventListener('click', () => {
    const open = item.dataset.open === 'true';
    item.dataset.open = open ? 'false' : 'true';

    if (stateKey) {
      saveCardState(stateKey, { open: !open });
    }
  });

  item.append(head, detail);
  return item;
}

// ═══════════════════════════════════════
// 【打字机效果】逐字显示 thinking 文本
// ═══════════════════════════════════════

function typeWrite(container, text, onDone) {
  container.textContent = '';
  container.dataset.typing = 'true';

  const chars = Array.from(String(text || ''));
  let index = 0;
  const step = 18;
  let cancelled = false;
  let timerId = null;

  const tick = () => {
    if (cancelled) return;

    if (index >= chars.length) {
      container.dataset.typing = 'false';
      if (typeof onDone === 'function') onDone();
      return;
    }

    const end = Math.min(index + step, chars.length);
    container.textContent += chars.slice(index, end).join('');
    index = end;

    timerId = window.setTimeout(tick, 16);
  };

  tick();

  return () => {
    cancelled = true;
    if (timerId) window.clearTimeout(timerId);
    container.dataset.typing = 'false';
  };
}

// ═══════════════════════════════════════
// 【工具收集】合并 model toolCalls + memoryWrites + grudgeWrites
// ═══════════════════════════════════════

function collectTools(message) {
  const tools = [];

  normalizeToolCalls(message?.toolCalls).forEach((tool) => {
    tools.push({ ...tool, _source: 'tool' });
  });

  normalizeToolCalls(message?.memoryWrites).forEach((memory) => {
    tools.push({
      name: '悄悄记下一笔',
      status: 'done',
      result: memory.content || memory.summary || memory.text || '',
      _source: 'memory'
    });
  });

  normalizeToolCalls(message?.grudgeWrites).forEach((grudge) => {
    tools.push({
      name: '在小本本上画圈圈',
      status: 'done',
      result: grudge.reason || grudge.content || grudge.text || '',
      _source: 'grudge'
    });
  });

  return tools;
}

// ═══════════════════════════════════════
// 【工具数据处理】
// ═══════════════════════════════════════

function normalizeToolCalls(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === false) return [];
  if (typeof value === 'string') return value.trim() ? [value.trim()] : [];
  return [value].filter(Boolean);
}

function getToolStatus(tool) {
  const status = normalizeText(tool?.status || tool?.state).toLowerCase();
  if (['running', 'loading', 'pending', 'calling'].includes(status)) return 'running';
  if (['error', 'failed', 'fail'].includes(status)) return 'error';
  return 'done';
}

function getToolTitle(tool, index) {
  const name = normalizeText(tool?.name || tool?.toolName || tool?.title || tool?.action);
  return name || `工具调用 ${index + 1}`;
}

function buildToolDetail(tool) {
  const parts = [];
  const status = getToolStatus(tool);
  const source = tool?._source || 'tool';

  if (status === 'running') parts.push('状态：正在处理中…');
  if (status === 'error') parts.push('状态：调用失败');

  const input = normalizeMultiline(tool?.arguments || tool?.input || tool?.params || tool?.query);
  if (input) parts.push(`我拿到的内容：\n${input}`);

  const result = normalizeMultiline(tool?.result || tool?.output || tool?.content);
  if (result) {
    if (source === 'memory') parts.push(`我记下了：\n${result}`);
    else if (source === 'grudge') parts.push(`我在意的事：\n${result}`);
    else parts.push(`我得到的结果：\n${result}`);
  }

  const error = normalizeMultiline(tool?.error || tool?.message);
  if (error) parts.push(`我碰到的问题：\n${error}`);

  return parts.join('\n\n') || '这一步没有留下更多内容。';
}

function isMessageRunning(message) {
  if (message?.isPending === true) return true;
  if (message?.isStreaming === true) return true;

  const status = normalizeText(message?.status || message?.streamStatus).toLowerCase();
  return ['streaming', 'thinking', 'running', 'loading', 'pending'].includes(status);
}

// ═══════════════════════════════════════
// 【图标】线条 SVG
// ═══════════════════════════════════════

function createLineIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
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

  const addCircle = (cx, cy, r) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', r);
    svg.appendChild(circle);
  };

  if (name === 'thought') {
    addPath('M12 3a7 7 0 0 1 7 7c0 2.2-1 4.2-2.8 5.5-.6.4-.9 1.1-1 1.8H8.8c-.1-.7-.4-1.4-1-1.8C6 14.2 5 12.2 5 10a7 7 0 0 1 7-7z');
    addPath('M9 19h6');
  } else if (name === 'chevron') {
    addPath('m9 6 6 6-6 6');
  } else if (name === 'tool') {
    addCircle('12', '12', '3');
    addPath('M12 4.5v2.1M12 17.4v2.1M19.5 12h-2.1M6.6 12H4.5M17.3 6.7l-1.5 1.5M8.2 15.8l-1.5 1.5M17.3 17.3l-1.5-1.5M8.2 8.2 6.7 6.7');
  } else if (name === 'check') {
    addPath('m5 12 4 4L19 6');
  } else if (name === 'warning') {
    addPath('M12 2L2 20h20L12 2z');
    addPath('M12 10v4');
    addPath('M12 18h.01');
  }

  return svg;
}

// ═══════════════════════════════════════
// 【基础 DOM 工具】
// ═══════════════════════════════════════

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
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
