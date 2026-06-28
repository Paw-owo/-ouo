// apps/chat/thread-tools.js
// imports:
//   from '../../core/ui.js': showBottomSheet, hideBottomSheet
//   from './thread-sheets.js': openQuickReplySheet, openTransferSheet, openVoiceTextSheet, openClearContextSheet, openMcpSheet
//   from './thread-relationship.js': openRelationshipLockSheet
//   from './thread-actions.js': sendDiceMessage, sendRpsMessage

import { showBottomSheet, hideBottomSheet } from '../../core/ui.js';

import {
  openQuickReplySheet,
  openTransferSheet,
  openVoiceTextSheet,
  openClearContextSheet,
  openMcpSheet
} from './thread-sheets.js';

import { openRelationshipLockSheet } from './thread-relationship.js';
import { sendDiceMessage, sendRpsMessage } from './thread-actions.js';

// ═══════════════════════════════════════
// 【工具列表】11个工具，每页8个，滑动翻页
// ═══════════════════════════════════════

const DEFAULT_TOOLS = [
  { id: 'quickReply', title: '快捷回复', icon: 'chat' },
  { id: 'task',       title: '小任务',   icon: 'task' },
  { id: 'quiz',       title: '默契问答', icon: 'quiz' },
  { id: 'transfer',   title: '转账',     icon: 'transfer' },
  { id: 'voiceText',  title: '语音文字', icon: 'mic' },
  { id: 'clearCtx',   title: '清上下文', icon: 'clean' },
  { id: 'relLock',    title: '关系锁',   icon: 'lock' },
  { id: 'phone',      title: '电话',     icon: 'phone' },
  { id: 'dice',       title: '骰子',     icon: 'dice' },
  { id: 'rps',        title: '猜拳',     icon: 'rps' },
  { id: 'mcp',        title: 'MCP',      icon: 'mcp' },
];

const TOOLS_PER_PAGE = 8;

// ═══════════════════════════════════════
// 【猫咪简笔画SVG图标】粗线条 stroke 2.5
// viewBox 16×16 round caps，走 --accent
// ═══════════════════════════════════════

const TOOL_ICONS = {
  chat: `<rect x="1" y="2.5" width="9" height="6.5" rx="3.5" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M3.5 9L2 12V9" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="4.5" cy="5.5" r="0.7" fill="currentColor"/><circle cx="7" cy="5.5" r="0.7" fill="currentColor"/><path d="M5 7.2C5.3 7.8 5.8 7.8 6 7.2C6.2 7.8 6.7 7.8 7 7.2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="6" y="4.5" width="9" height="6.5" rx="3.5" fill="var(--bg-surface,#fff)" stroke="currentColor" stroke-width="2.5"/>`,
  task: `<path d="M4 4.5L2.5 1.5L6.5 3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 4.5L13.5 1.5L9.5 3" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><rect x="3" y="4" width="10" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><line x1="5.5" y1="7.5" x2="10.5" y2="7.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="5.5" y1="10.5" x2="8.5" y2="10.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`,
  quiz: `<path d="M5.5 3.5L4.5 1L7.5 2.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.5 3.5L11.5 1L8.5 2.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="9" r="5.5" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M6.5 7.5C6.5 6.5 7.2 6 8 6C8.8 6 9.5 6.5 9.5 7.5C9.5 8.2 8.5 8 8 9" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="8" cy="11" r="0.8" fill="currentColor"/>`,
  transfer: `<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2.5"/><text x="8" y="11" text-anchor="middle" font-size="8" font-weight="600" fill="currentColor" stroke="none">¥</text><circle cx="12.5" cy="3.5" r="0.7" fill="currentColor" opacity="0.3"/><circle cx="13.8" cy="5.2" r="0.7" fill="currentColor" opacity="0.3"/><circle cx="11.5" cy="2.5" r="0.7" fill="currentColor" opacity="0.3"/>`,
  mic: `<rect x="6" y="1.5" width="4" height="7" rx="2" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M3.5 7C3.5 9.5 5.5 11.5 8 11.5C10.5 11.5 12.5 9.5 12.5 7" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="8" y1="11.5" x2="8" y2="14.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><line x1="5.5" y1="14.5" x2="10.5" y2="14.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`,
  clean: `<rect x="3" y="4" width="10" height="10.5" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><line x1="2" y1="4.5" x2="14" y2="4.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M6 4V2.5C6 1.8 6.8 1.5 8 1.5C9.2 1.5 10 1.8 10 2.5V4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="6" cy="8.5" r="0.6" fill="currentColor"/><circle cx="10" cy="8.5" r="0.6" fill="currentColor"/><path d="M6.5 10.5C7 11.2 7.5 11.2 8 10.5C8.5 11.2 9 11.2 9.5 10.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>`,
  lock: `<path d="M8 3L5.5 5.5C4 7 4 9.5 5.5 11L8 13.5L10.5 11C12 9.5 12 7 10.5 5.5L8 3Z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><circle cx="8" cy="8.5" r="1.5" fill="currentColor"/>`,
  phone: `<path d="M3.5 2.5C3.5 1.5 4 1.5 5 1.5H7L8.5 5.5L6 7C6 7 7.5 10 10 12L12.5 9.5L15 11V13.5C15 14.5 14 15 13 15C7 15 1.5 9 1.5 3.5C1.5 2.5 2 2 3.5 2.5Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>`,
  dice: `<rect x="2" y="2" width="12" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="5" cy="5" r="1" fill="currentColor"/><circle cx="11" cy="5" r="1" fill="currentColor"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="5" cy="11" r="1" fill="currentColor"/><circle cx="11" cy="11" r="1" fill="currentColor"/>`,
  rps: `<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="6" cy="7.5" r="0.8" fill="currentColor"/><circle cx="10" cy="7.5" r="0.8" fill="currentColor"/><path d="M6 10.5C6.8 11.5 7.5 11.5 8 10.5C8.5 11.5 9.2 11.5 10 10.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`,
  mcp: `<rect x="1.5" y="3" width="13" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M5 6.5L3.5 8L5 9.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="7" y1="9.5" x2="11" y2="9.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>`,
};

// ═══════════════════════════════════════
// 【创建图标DOM】
// ═══════════════════════════════════════

function createToolIcon(type) {
  const wrap = document.createElement('div');
  wrap.className = 'tool-icon-wrap';
  wrap.innerHTML = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' + (TOOL_ICONS[type] || TOOL_ICONS.chat) + '</svg>';
  return wrap;
}

// ═══════════════════════════════════════
// 【CSS注入】走全局变量，不硬编码颜色
// ═══════════════════════════════════════

function injectToolsCSS() {
  var old = document.getElementById('thread-tools-style');
  if (old) old.remove();

  var style = document.createElement('style');
  style.id = 'thread-tools-style';
  style.textContent = `
    .thread-tools-panel{position:absolute;inset:0;z-index:100;display:flex;flex-direction:column;background:var(--bg-primary);opacity:0;transform:translateY(100%);transition:all 0.3s cubic-bezier(0.34,1.56,0.64,1);pointer-events:none}
    .thread-tools-panel.is-open{opacity:1;transform:translateY(0);pointer-events:auto}
    .tools-carousel-wrap{flex:1;overflow:hidden;position:relative;overscroll-behavior:contain;touch-action:pan-x}
    .tools-carousel{display:flex;transition:transform 0.35s cubic-bezier(0.25,0.46,0.45,0.94);height:100%;will-change:transform}
    .tools-page{min-width:100%;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(2,1fr);gap:12px;padding:12px 16px;align-content:center;justify-items:center}
    .tool-cell{width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:14px 2px;border:none;outline:none;border-radius:var(--radius-lg);background:var(--bg-surface);box-shadow:var(--shadow-sm);cursor:pointer;transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);-webkit-tap-highlight-color:transparent;user-select:none}
    .tool-cell:active{transform:scale(0.92)}
    .tool-icon-wrap{width:36px;height:36px;display:flex;align-items:center;justify-content:center;color:var(--accent);background:var(--bg-card);border-radius:var(--radius-md);padding:4px}
    .tool-icon-wrap svg{width:100%;height:100%}
    .tool-name{font-size:11px;font-weight:500;color:var(--text-secondary);line-height:1.2;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;padding:0 2px}
    .tools-dots{display:flex;justify-content:center;align-items:center;gap:6px;padding:6px 0 18px;flex-shrink:0}
    .tools-dot{width:6px;height:6px;border-radius:999px;background:var(--text-placeholder);transition:all 0.3s ease}
    .tools-dot.is-active{width:18px;background:var(--accent)}
    .thread-tools-detail-header{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;margin:0 0 14px}
    .thread-tools-back-btn{width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;border:none;outline:none;border-radius:var(--radius-md);background:var(--bg-card);color:var(--text-primary);box-shadow:var(--shadow-sm);transition:all 200ms ease}
    .thread-tools-back-btn:active{transform:scale(.94)}
    .thread-tools-back-btn svg{width:18px;height:18px}
    .thread-tools-detail-title{min-width:0;color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35}
    .thread-tools-detail-spacer{width:38px;height:38px}
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════
// 【翻页触摸滑动】丝滑跟手+边界阻尼
// ═══════════════════════════════════════

var currentPage = 0;
var totalPages = 1;
var touchStartX = 0;
var touchDeltaX = 0;
var isSwiping = false;
var toolsPanelEl = null;

function setupSwipe(carousel, dotsContainer) {
  var wrap = carousel.parentElement;
  wrap.addEventListener('touchstart', function(e) {
    touchStartX = e.touches[0].clientX;
    touchDeltaX = 0;
    isSwiping = true;
    carousel.style.transition = 'none';
  }, { passive: true });
  wrap.addEventListener('touchmove', function(e) {
    if (!isSwiping) return;
    touchDeltaX = e.touches[0].clientX - touchStartX;
    if (Math.abs(touchDeltaX) > 8 && e.cancelable) {
      e.preventDefault();
    }
    var atStart = currentPage === 0 && touchDeltaX > 0;
    var atEnd = currentPage === totalPages - 1 && touchDeltaX < 0;
    var damped = (atStart || atEnd) ? touchDeltaX * 0.3 : touchDeltaX;
    carousel.style.transform = 'translateX(calc(' + (-currentPage * 100) + '% + ' + damped + 'px))';
  }, { passive: false });
  wrap.addEventListener('touchend', function() {
    if (!isSwiping) return;
    isSwiping = false;
    carousel.style.transition = 'transform 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    var threshold = wrap.clientWidth * 0.2;
    if (touchDeltaX < -threshold && currentPage < totalPages - 1) currentPage++;
    else if (touchDeltaX > threshold && currentPage > 0) currentPage--;
    carousel.style.transform = 'translateX(' + (-currentPage * 100) + '%)';
    updateDots(dotsContainer);
  });
}

function updateDots(container) {
  if (!container) return;
  container.querySelectorAll('.tools-dot').forEach(function(d, i) {
    d.classList.toggle('is-active', i === currentPage);
  });
}

// ═══════════════════════════════════════
// 【发送消息到聊天】通过回调
// ═══════════════════════════════════════

async function sendMessageToChat(text, options) {
  if (typeof options?.onSend === 'function') {
    await options.onSend(text);
  }
}

// ═══════════════════════════════════════
// 【关掉工具箱】优先回调，兜底关抽屉
// ═══════════════════════════════════════

function closeToolsSheet(options) {
  if (typeof options?.onClose === 'function') {
    options.onClose();
  } else {
    hideBottomSheet();
  }

  if (toolsPanelEl && toolsPanelEl.classList.contains('is-open')) {
    toolsPanelEl.classList.remove('is-open');
  }
}

// ═══════════════════════════════════════
// 【返回按钮头部】带返回到工具选择的按钮
// ═══════════════════════════════════════

function createBackHeader(title, options) {
  var header = document.createElement('div');
  header.className = 'thread-tools-detail-header';

  var back = document.createElement('button');
  back.type = 'button';
  back.className = 'thread-tools-back-btn';
  back.setAttribute('aria-label', '返回小工具箱');
  back.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
  back.addEventListener('click', function() {
    if (typeof options?.onBackToTools === 'function') {
      options.onBackToTools();
    } else {
      hideBottomSheet();
    }
  });

  var titleEl = document.createElement('div');
  titleEl.className = 'thread-tools-detail-title';
  titleEl.textContent = title || '小工具';

  var spacer = document.createElement('div');
  spacer.className = 'thread-tools-detail-spacer';

  header.append(back, titleEl, spacer);
  return header;
}

// ═══════════════════════════════════════
// 【小任务详情】预设任务 + 自定义输入
// ═══════════════════════════════════════

function openTaskSheet(state, options) {
  var content = document.createElement('div');
  content.style.cssText = 'display:flex;flex-direction:column;gap:14px;padding-top:4px;';
  content.appendChild(createBackHeader('小任务', options));

  var grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;';

  var presets = [
    { text: '提醒我喝水', prompt: '提醒我要多喝水，关心一下我~' },
    { text: '帮我记件事', prompt: '帮我记一件重要的事，我接下来要跟你说~' },
    { text: '讲个小故事', prompt: '给我讲一个温馨可爱的小故事吧~' },
    { text: '给我加油', prompt: '我今天有点累，给我加油打气吧~' },
    { text: '哄我睡觉', prompt: '现在该睡觉了，哄我入睡吧~' },
    { text: '帮我做决定', prompt: '我有两个选择拿不定主意，帮我选一个~' },
  ];

  presets.forEach(function(p) {
    var card = document.createElement('button');
    card.type = 'button';
    card.style.cssText = 'padding:16px 12px;border:none;outline:none;border-radius:var(--radius-lg);background:var(--bg-surface);box-shadow:var(--shadow-sm);cursor:pointer;transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);text-align:center;font-size:14px;color:var(--text-primary);font-weight:500;-webkit-tap-highlight-color:transparent;';
    card.textContent = p.text;
    card.addEventListener('click', async function() {
      closeToolsSheet(options);
      await sendMessageToChat(p.prompt, options);
    });
    grid.appendChild(card);
  });

  content.appendChild(grid);

  var inputWrap = document.createElement('div');
  inputWrap.style.cssText = 'display:flex;gap:8px;margin-top:4px;';

  var input = document.createElement('textarea');
  input.placeholder = '或者自己输入任务...';
  input.style.cssText = 'flex:1;padding:12px;border-radius:var(--radius-md);background:var(--bg-surface);box-shadow:var(--shadow-sm);font-size:14px;color:var(--text-primary);resize:none;height:44px;outline:none;border:none;font-family:inherit;';

  var sendBtn = document.createElement('button');
  sendBtn.type = 'button';
  sendBtn.textContent = '发送';
  sendBtn.style.cssText = 'padding:0 20px;height:44px;border-radius:var(--radius-md);background:var(--accent);color:var(--bubble-user-text);font-size:14px;font-weight:500;border:none;outline:none;cursor:pointer;white-space:nowrap;transition:all 0.2s ease;';
  sendBtn.addEventListener('click', async function() {
    var t = input.value.trim();
    if (!t) return;
    closeToolsSheet(options);
    await sendMessageToChat(t, options);
  });

  inputWrap.appendChild(input);
  inputWrap.appendChild(sendBtn);
  content.appendChild(inputWrap);

  showBottomSheet(content);
}

// ═══════════════════════════════════════
// 【默契问答详情】选范围后让AI出题
// ═══════════════════════════════════════

function openQuizSheet(state, options) {
  var content = document.createElement('div');
  content.style.cssText = 'display:flex;flex-direction:column;gap:10px;padding-top:4px;';
  content.appendChild(createBackHeader('默契问答', options));

  var categories = [
    { title: '你有多了解我', desc: 'AI出题考你，看它对你了解多少', prompt: '我们来玩默契问答吧~你来出题考考我，看你对我有多了解！问我一些关于我的喜好的问题，我来回答~' },
    { title: '我有多了解你', desc: '你来答题，看对AI了解多少', prompt: '我们来玩默契问答吧~我来出题考考你，看我对你有多了解！问我一些关于你的问题，看你记不记得~' },
    { title: '生活小测验', desc: '聊聊日常生活里的小事', prompt: '我们来玩默契问答吧~聊一聊日常生活的小事，你问我一些关于生活习惯、喜好的问题~' },
    { title: '脑洞大开', desc: '奇奇怪怪的假设问题', prompt: '我们来玩默契问答吧~来点脑洞大开的假设问题！比如如果我是动物会是什么、如果穿越到古代会干什么之类的~' },
    { title: '情感默契', desc: '测测彼此的心意', prompt: '我们来玩默契问答吧~来测测彼此的情感默契！你问我一些关于感情、心情、小确幸的问题~' },
    { title: '随机挑战', desc: '随机来点刺激的', prompt: '我们来玩默契问答吧~来个随机挑战！你可以随便问我任何有趣的问题，越出乎意料越好~' },
  ];

  categories.forEach(function(cat) {
    var card = document.createElement('button');
    card.type = 'button';
    card.style.cssText = 'width:100%;padding:16px;border:none;outline:none;border-radius:var(--radius-lg);background:var(--bg-surface);box-shadow:var(--shadow-sm);cursor:pointer;transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);-webkit-tap-highlight-color:transparent;text-align:left;';
    var titleDiv = document.createElement('div');
    titleDiv.style.cssText = 'font-size:15px;color:var(--text-primary);font-weight:500;';
    titleDiv.textContent = cat.title;
    var descDiv = document.createElement('div');
    descDiv.style.cssText = 'font-size:12px;color:var(--text-secondary);margin-top:4px;';
    descDiv.textContent = cat.desc;
    card.appendChild(titleDiv);
    card.appendChild(descDiv);
    card.addEventListener('click', async function() {
      closeToolsSheet(options);
      await sendMessageToChat(cat.prompt, options);
    });
    content.appendChild(card);
  });

  showBottomSheet(content);
}

// ═══════════════════════════════════════
// 【工具点击处理】分发到各个sheet或回调
// ═══════════════════════════════════════

async function handleToolClick(toolId, state, options) {
  switch (toolId) {
    case 'quickReply':
      closeToolsSheet(options);
      openQuickReplySheet(state, options);
      break;
    case 'task':
      openTaskSheet(state, options);
      break;
    case 'quiz':
      openQuizSheet(state, options);
      break;
    case 'transfer':
      closeToolsSheet(options);
      openTransferSheet(state, options);
      break;
    case 'voiceText':
      closeToolsSheet(options);
      openVoiceTextSheet(state, options);
      break;
    case 'clearCtx':
      closeToolsSheet(options);
      openClearContextSheet(state, options);
      break;
    case 'relLock':
      closeToolsSheet(options);
      openRelationshipLockSheet(state, options);
      break;
    case 'phone':
      closeToolsSheet(options);
      if (typeof options?.onPick === 'function') {
        options.onPick({ id: 'phone' });
      }
      break;
    case 'dice':
      closeToolsSheet(options);
      await handleDiceClick(state);
      break;
    case 'rps':
      closeToolsSheet(options);
      await handleRpsClick(state);
      break;
    case 'mcp':
      closeToolsSheet(options);
      openMcpSheet(state, options);
      break;
    default:
      break;
  }
}

// ═══════════════════════════════════════
// 【骰子】真实写入聊天消息
// ═══════════════════════════════════════

async function handleDiceClick(state) {
  try {
    await sendDiceMessage(state, { triggerAI: true });
    if (typeof state?.reloadAndRender === 'function') {
      await state.reloadAndRender();
    }
  } catch (_) {
    // 静默
  }
}

// ═══════════════════════════════════════
// 【猜拳】真实写入聊天消息
// ═══════════════════════════════════════

async function handleRpsClick(state) {
  try {
    await sendRpsMessage(state, { triggerAI: true });
    if (typeof state?.reloadAndRender === 'function') {
      await state.reloadAndRender();
    }
  } catch (_) {
    // 静默
  }
}

// ═══════════════════════════════════════
// 【给thread-panels用的宫格入口】返回DOM节点
// ═══════════════════════════════════════

export function createThreadToolsGrid(state, options = {}) {
  injectToolsCSS();
  currentPage = 0;

  var pages = [];
  for (var i = 0; i < DEFAULT_TOOLS.length; i += TOOLS_PER_PAGE) {
    pages.push(DEFAULT_TOOLS.slice(i, i + TOOLS_PER_PAGE));
  }
  totalPages = pages.length;

  var wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;flex:1;min-height:0;';

  var carouselWrap = document.createElement('div');
  carouselWrap.className = 'tools-carousel-wrap';
  var carousel = document.createElement('div');
  carousel.className = 'tools-carousel';

  pages.forEach(function(pageTools) {
    var pageEl = document.createElement('div');
    pageEl.className = 'tools-page';
    pageTools.forEach(function(tool) {
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'tool-cell';
      cell.appendChild(createToolIcon(tool.icon));
      var nameEl = document.createElement('div');
      nameEl.className = 'tool-name';
      nameEl.textContent = tool.title;
      cell.appendChild(nameEl);
      cell.addEventListener('click', async function() { await handleToolClick(tool.id, state, options); });
      pageEl.appendChild(cell);
    });
    var remaining = TOOLS_PER_PAGE - pageTools.length;
    for (var j = 0; j < remaining; j++) {
      var empty = document.createElement('div');
      empty.className = 'tool-cell';
      empty.style.visibility = 'hidden';
      pageEl.appendChild(empty);
    }
    carousel.appendChild(pageEl);
  });

  carouselWrap.appendChild(carousel);
  wrap.appendChild(carouselWrap);

  if (totalPages > 1) {
    var dotsEl = document.createElement('div');
    dotsEl.className = 'tools-dots';
    for (var k = 0; k < totalPages; k++) {
      var dot = document.createElement('div');
      dot.className = 'tools-dot' + (k === 0 ? ' is-active' : '');
      dotsEl.appendChild(dot);
    }
    wrap.appendChild(dotsEl);
    setupSwipe(carousel, dotsEl);
  }

  return wrap;
}

// ═══════════════════════════════════════
// 【独立面板】抽屉模式打开工具箱
// ═══════════════════════════════════════

export function showToolsPanel(state, options = {}) {
  var sheet = document.createElement('div');
  sheet.style.cssText = 'display:flex;flex-direction:column;gap:0;padding:6px 20px 20px;';

  var head = document.createElement('div');
  head.style.cssText = 'margin-bottom:14px;';
  head.appendChild(createBackHeader('小工具箱', { onBackToTools: function() {
    if (typeof options.onBackToTools === 'function') {
      options.onBackToTools();
    } else {
      hideBottomSheet();
    }
  }}));
  sheet.appendChild(head);

  var grid = createThreadToolsGrid(state, options);
  sheet.appendChild(grid);

  showBottomSheet(sheet);
}

// ═══════════════════════════════════════
// 【工具详情页】抽屉模式
// ═══════════════════════════════════════

export function showToolDetail(contentEl, title) {
  var content = document.createElement('div');
  content.style.cssText = 'display:flex;flex-direction:column;gap:12px;padding-top:4px;';

  var header = document.createElement('div');
  header.className = 'thread-tools-detail-header';

  var spacerLeft = document.createElement('div');
  spacerLeft.className = 'thread-tools-detail-spacer';

  var titleEl = document.createElement('div');
  titleEl.className = 'thread-tools-detail-title';
  titleEl.textContent = title || '工具';

  var spacerRight = document.createElement('div');
  spacerRight.className = 'thread-tools-detail-spacer';

  header.append(spacerLeft, titleEl, spacerRight);
  content.appendChild(header);

  if (contentEl) content.appendChild(contentEl);
  showBottomSheet(content);

  return content;
}

// ═══════════════════════════════════════
// 【导出】
// ═══════════════════════════════════════

export { showToolsPanel as default };
