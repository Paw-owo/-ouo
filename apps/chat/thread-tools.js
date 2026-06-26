// apps/chat/thread-tools.js
// imports:
//   from '../../core/ui.js': createIcon, showToast
//   from './thread-sheets.js': openQuickReplySheet, openMoodSheet, openRelaySheet, openTransferSheet, openClearContextSheet, openMcpSheet, openVoiceTextSheet, openRelationshipSheet
//   from './thread-call.js': mountThreadCall
//   from './thread-actions.js': sendDiceMessage, sendRpsMessage

import { createIcon, showToast } from '../../core/ui.js';

import {
  openQuickReplySheet,
  openMoodSheet,
  openRelaySheet,
  openTransferSheet,
  openClearContextSheet,
  openMcpSheet,
  openVoiceTextSheet,
  openRelationshipSheet
} from './thread-sheets.js';

import { mountThreadCall } from './thread-call.js';
import { sendDiceMessage, sendRpsMessage } from './thread-actions.js';

const STYLE_ID = 'chat-thread-tools-style';
const PAGE_SIZE = 8;

// ═══════════════════════════════════════
// 【工具列表】定义所有可展示的工具
// ═══════════════════════════════════════

const DEFAULT_TOOLS = [
  { id: 'quickReply', title: '快捷回复', icon: 'message' },
  { id: 'mood', title: '心情', icon: 'heart' },
  { id: 'relay', title: '接龙', icon: 'repeat' },
  { id: 'transfer', title: '转账', icon: 'wallet' },
  { id: 'voiceText', title: '语音文字', icon: 'mic' },
  { id: 'clearContext', title: '清上下文', icon: 'trash' },
  { id: 'relationship', title: '关系锁', icon: 'lock' },
  { id: 'call', title: '电话', icon: 'phone' },
  { id: 'dice', title: '骰子', icon: 'dice' },
  { id: 'rps', title: '猜拳', icon: 'hand' },
  { id: 'mcp', title: 'MCP', icon: 'web' }
];

// ═══════════════════════════════════════
// 【工具宫格】分页式 4×2 网格，左右滑翻页
// ═══════════════════════════════════════

export function createThreadToolsGrid(state, options = {}) {
  injectStyle();

  const tools = normalizeArray(options.tools || DEFAULT_TOOLS);
  const pages = splitPages(tools, PAGE_SIZE);
  const root = el('section', 'thread-tools-root');

  // ───────────────────
  // 图标网格层
  // ───────────────────

  const gridView = el('div', 'thread-tools-grid-view');

  const header = el('div', 'thread-tools-header');
  const titleWrap = el('div', 'thread-tools-title-wrap');
  titleWrap.append(
    el('div', 'thread-tools-title', options.title || '小工具'),
    el('div', 'thread-tools-subtitle', options.subtitle || '点一下打开。')
  );

  const dots = el('div', 'thread-tools-dots');
  pages.forEach((_, index) => {
    const dot = el('span', 'thread-tools-dot');
    if (index === 0) dot.classList.add('is-active');
    dot.dataset.index = String(index);
    dots.appendChild(dot);
  });

  header.append(titleWrap, dots);

  const carousel = el('div', 'thread-tools-carousel');
  const track = el('div', 'thread-tools-track');

  let currentPage = 0;

  pages.forEach((pageTools) => {
    const page = el('div', 'thread-tools-page');
    const grid = el('div', 'thread-tools-grid');

    pageTools.forEach((item) => {
      const button = createToolIcon(item);
      button.addEventListener('click', async () => {
        await handleToolClick(state, item, options, root, detailView, gridView);
      });
      grid.append(button);
    });

    page.append(grid);
    track.append(page);
  });

  carousel.append(track);

  // ── 翻页逻辑 ──

  const updatePage = (index) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, index));
    currentPage = clamped;
    track.style.transform = `translateX(-${clamped * 100}%)`;

    dots.querySelectorAll('.thread-tools-dot').forEach((dot, i) => {
      dot.classList.toggle('is-active', i === clamped);
    });
  };

  // 触摸滑动
  let touchStartX = 0;
  let touchStartY = 0;
  let touchLocked = false;
  let touchHorizontal = false;

  carousel.addEventListener('touchstart', (event) => {
    touchStartX = event.touches[0].clientX;
    touchStartY = event.touches[0].clientY;
    touchLocked = false;
    touchHorizontal = false;
  }, { passive: true });

  carousel.addEventListener('touchmove', (event) => {
    if (touchLocked) return;

    const dx = event.touches[0].clientX - touchStartX;
    const dy = event.touches[0].clientY - touchStartY;

    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      touchHorizontal = Math.abs(dx) > Math.abs(dy);
      touchLocked = true;
    }
  }, { passive: true });

  carousel.addEventListener('touchend', (event) => {
    if (!touchHorizontal) return;

    const dx = event.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) {
      updatePage(currentPage + (dx < 0 ? 1 : -1));
    }
  }, { passive: true });

  // 点小圆点翻页
  dots.addEventListener('click', (event) => {
    const dot = event.target.closest('.thread-tools-dot');
    if (!dot) return;
    updatePage(Number(dot.dataset.index || 0));
  });

  gridView.append(header, carousel);

  // ───────────────────
  // 工具详情层
  // ───────────────────

  const detailView = el('div', 'thread-tools-detail-view');
  detailView.hidden = true;

  const detailHeader = el('div', 'thread-tools-detail-header');

  const backBtn = iconButton('chevron-left', '返回');
  backBtn.addEventListener('click', () => {
    switchToGrid(root, detailView, gridView);
  });

  const detailTitle = el('div', 'thread-tools-detail-title', '');

  detailHeader.append(backBtn, detailTitle);

  const detailBody = el('div', 'thread-tools-detail-body');

  detailView.append(detailHeader, detailBody);

  root.append(gridView, detailView);

  return root;
}

// ═══════════════════════════════════════
// 【视图切换】在图标网格和详情之间切换
// ═══════════════════════════════════════

function switchToDetail(root, detailView, gridView, title) {
  const detailTitle = detailView.querySelector('.thread-tools-detail-title');
  if (detailTitle) detailTitle.textContent = title || '';

  detailView.hidden = false;
  gridView.hidden = true;
}

function switchToGrid(root, detailView, gridView) {
  const detailBody = detailView.querySelector('.thread-tools-detail-body');
  if (detailBody) detailBody.replaceChildren();

  detailView.hidden = true;
  gridView.hidden = false;
}

// ═══════════════════════════════════════
// 【工具点击】分发到对应动作或渲染详情
// ═══════════════════════════════════════

async function handleToolClick(state, item, options, root, detailView, gridView) {
  const id = String(item?.id || '').trim();
  if (!id) return;

  if (typeof options.onPick === 'function') {
    const handled = await options.onPick(item, state);
    if (handled) return;
  }

  // ── 直接执行的工具 ──

  if (id === 'dice') {
    await sendDiceMessage(state, { triggerAI: true });
    return;
  }

  if (id === 'rps') {
    await sendRpsMessage(state, { triggerAI: true });
    return;
  }

  if (id === 'call') {
    await mountThreadCall(document.body, {
      state,
      character: state?.character || null,
      characterId: state?.characterId || '',
      close: typeof options.onCloseCall === 'function' ? options.onCloseCall : null,
      onReject: typeof options.onRejectCall === 'function' ? options.onRejectCall : null
    });
    return;
  }

  // ── 在详情页内渲染的工具 ──

  const detailBody = detailView.querySelector('.thread-tools-detail-body');
  if (!detailBody) return;

  const sheetOptions = {
    ...options,
    containerEl: detailBody,
    onBack: () => switchToGrid(root, detailView, gridView)
  };

  const sheetMap = {
    quickReply: openQuickReplySheet,
    mood: openMoodSheet,
    relay: openRelaySheet,
    transfer: openTransferSheet,
    voiceText: openVoiceTextSheet,
    clearContext: openClearContextSheet,
    mcp: openMcpSheet,
    relationship: openRelationshipSheet
  };

  const handler = sheetMap[id];
  if (handler) {
    switchToDetail(root, detailView, gridView, item.title || '详情');
    handler(state, sheetOptions);
    return;
  }

  switchToGrid(root, detailView, gridView);
  showToast('这个工具还没接好');
}

// ═══════════════════════════════════════
// 【小图标按钮】分页里的单个工具
// ═══════════════════════════════════════

function createToolIcon(item) {
  const button = el('button', 'thread-tool-icon-btn');
  button.type = 'button';

  const iconWrap = el('span', 'thread-tool-icon-wrap');
  iconWrap.appendChild(createIcon(item.icon || 'message', 20));

  const label = el('span', 'thread-tool-icon-label', item.title || '');

  button.append(iconWrap, label);
  return button;
}

// ═══════════════════════════════════════
// 【公共组件】图标按钮
// ═══════════════════════════════════════

function iconButton(iconName, label) {
  const button = el('button', 'thread-tools-icon-btn');
  button.type = 'button';
  button.setAttribute('aria-label', label || iconName);
  button.appendChild(createIcon(iconName, 18));
  return button;
}

// ═══════════════════════════════════════
// 【工具函数】分页、数组和 DOM
// ═══════════════════════════════════════

function splitPages(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result.length ? result : [[]];
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// ═══════════════════════════════════════
// 【样式】分页网格、翻页指示器、详情页
// ═══════════════════════════════════════

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .thread-tools-root{
      display:flex;
      flex-direction:column;
      min-height:0;
      color:var(--text-primary);
    }

    .thread-tools-grid-view,
    .thread-tools-detail-view{
      padding:6px 20px 20px;
    }

    /* ── 顶部标题和圆点 ── */

    .thread-tools-header{
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      align-items:center;
      gap:12px;
      margin-bottom:14px;
    }

    .thread-tools-title-wrap{
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:4px;
    }

    .thread-tools-title{
      color:var(--text-primary);
      font-size:17px;
      font-weight:600;
      line-height:1.35;
    }

    .thread-tools-subtitle{
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.5;
    }

    .thread-tools-dots{
      display:inline-flex;
      align-items:center;
      gap:6px;
    }

    .thread-tools-dot{
      width:7px;
      height:7px;
      border-radius:999px;
      background:var(--text-hint);
      opacity:0.3;
      transition:all 200ms ease;
    }

    .thread-tools-dot.is-active{
      width:18px;
      opacity:1;
      background:var(--accent);
    }

    /* ── 分页轮播 ── */

    .thread-tools-carousel{
      overflow:hidden;
      border-radius:20px;
      touch-action:pan-y;
    }

    .thread-tools-track{
      display:flex;
      transition:transform 260ms ease;
    }

    .thread-tools-page{
      flex:0 0 100%;
      min-width:100%;
    }

    .thread-tools-grid{
      display:grid;
      grid-template-columns:repeat(4,1fr);
      grid-template-rows:repeat(2,auto);
      gap:10px;
    }

    .thread-tool-icon-btn{
      display:flex;
      flex-direction:column;
      align-items:center;
      gap:6px;
      padding:10px 4px 8px;
      border-radius:18px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      transition:all 200ms ease;
      touch-action:manipulation;
    }

    .thread-tool-icon-btn:active{
      transform:scale(.94);
    }

    .thread-tool-icon-wrap{
      width:36px;
      height:36px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:12px;
      background:var(--surface-muted);
      color:var(--accent);
      box-shadow:var(--shadow-sm);
    }

    .thread-tool-icon-label{
      max-width:64px;
      color:var(--text-primary);
      font-size:11px;
      font-weight:500;
      line-height:1.3;
      text-align:center;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    /* ── 工具详情层 ── */

    .thread-tools-detail-view{
      min-height:min(52vh,480px);
      animation:toolDetailIn 200ms ease both;
    }

    .thread-tools-detail-header{
      display:grid;
      grid-template-columns:auto minmax(0,1fr);
      align-items:center;
      gap:10px;
      margin-bottom:16px;
    }

    .thread-tools-detail-title{
      min-width:0;
      color:var(--text-primary);
      font-size:17px;
      font-weight:600;
      line-height:1.35;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .thread-tools-icon-btn{
      width:44px;
      height:44px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:14px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      transition:all 200ms ease;
      touch-action:manipulation;
    }

    .thread-tools-icon-btn:active{
      transform:scale(.96);
    }

    .thread-tools-detail-body{
      display:flex;
      flex-direction:column;
      gap:10px;
    }

    @keyframes toolDetailIn{
      from{
        opacity:0;
        transform:translateX(12px);
      }
      to{
        opacity:1;
        transform:translateX(0);
      }
    }

    @media(max-width:430px){
      .thread-tool-icon-btn{
        padding:8px 2px 6px;
      }

      .thread-tool-icon-wrap{
        width:32px;
        height:32px;
      }

      .thread-tool-icon-label{
        font-size:10px;
      }
    }

    @media(prefers-reduced-motion:reduce){
      .thread-tool-icon-btn,
      .thread-tools-icon-btn,
      .thread-tools-dot,
      .thread-tools-track,
      .thread-tools-detail-view{
        animation:none;
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/ui.js(createIcon,showToast)；./thread-sheets.js(openQuickReplySheet,openMoodSheet,openRelaySheet,openTransferSheet,openClearContextSheet,openMcpSheet,openVoiceTextSheet,openRelationshipSheet)；./thread-call.js(mountThreadCall)；./thread-actions.js(sendDiceMessage,sendRpsMessage)
