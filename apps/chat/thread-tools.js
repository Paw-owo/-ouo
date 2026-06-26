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
  { id: 'quickReply', title: '快捷回复', icon: 'chatHeart' },
  { id: 'mood', title: '心情', icon: 'faceSmile' },
  { id: 'relay', title: '接龙', icon: 'linkBunny' },
  { id: 'transfer', title: '转账', icon: 'coinStar' },
  { id: 'voiceText', title: '语音文字', icon: 'micCute' },
  { id: 'clearContext', title: '清上下文', icon: 'broomSparkle' },
  { id: 'relationship', title: '关系锁', icon: 'lockHeart' },
  { id: 'call', title: '电话', icon: 'phoneHeart' },
  { id: 'dice', title: '骰子', icon: 'diceFace' },
  { id: 'rps', title: '猜拳', icon: 'handPeace' },
  { id: 'mcp', title: 'MCP', icon: 'globeMandCute' }
];

// ═══════════════════════════════════════
// 【工具宫格】分页式 4×2 网格，跟手滑翻页
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
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let dragLocked = false;
  let dragHorizontal = false;

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

  // ── 跟手拖拽翻页 ──

  const pageWidth = () => carousel.offsetWidth || 280;

  const snapTo = (index, animate) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, index));
    currentPage = clamped;

    if (animate !== false) {
      track.style.transition = 'transform 280ms cubic-bezier(0.22, 1, 0.36, 1)';
    } else {
      track.style.transition = 'none';
    }

    track.style.transform = `translateX(-${clamped * 100}%)`;

    dots.querySelectorAll('.thread-tools-dot').forEach((dot, i) => {
      dot.classList.toggle('is-active', i === clamped);
    });
  };

  const setDragOffset = (offsetPx) => {
    const base = -currentPage * pageWidth();
    const total = base + offsetPx;
    const maxOffset = (pages.length - 1) * pageWidth();
    const clamped = Math.max(-maxOffset - 30, Math.min(30, total));
    track.style.transition = 'none';
    track.style.transform = `translateX(${clamped}px)`;
  };

  carousel.addEventListener('touchstart', (event) => {
    if (pages.length < 2) return;
    isDragging = true;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    deltaX = 0;
    dragLocked = false;
    dragHorizontal = false;
  }, { passive: true });

  carousel.addEventListener('touchmove', (event) => {
    if (!isDragging) return;

    const dx = event.touches[0].clientX - startX;
    const dy = event.touches[0].clientY - startY;

    if (!dragLocked) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        dragHorizontal = Math.abs(dx) > Math.abs(dy);
        dragLocked = true;
      }
      return;
    }

    if (!dragHorizontal) return;

    deltaX = dx;
    event.preventDefault();
    setDragOffset(deltaX);
  }, { passive: false });

  carousel.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;

    if (!dragHorizontal) {
      snapTo(currentPage);
      return;
    }

    const threshold = pageWidth() * 0.22;
    if (deltaX < -threshold) {
      snapTo(currentPage + 1);
    } else if (deltaX > threshold) {
      snapTo(currentPage - 1);
    } else {
      snapTo(currentPage);
    }
  }, { passive: true });

  carousel.addEventListener('touchcancel', () => {
    if (!isDragging) return;
    isDragging = false;
    snapTo(currentPage);
  }, { passive: true });

  // 点小圆点
  dots.addEventListener('click', (event) => {
    const dot = event.target.closest('.thread-tools-dot');
    if (!dot) return;
    snapTo(Number(dot.dataset.index || 0));
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
// 【可爱图标】手绘风 SVG 图标工厂
// ═══════════════════════════════════════

function createCuteIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 36 36');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const p = (d, fill) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    if (fill) path.setAttribute('fill', fill);
    svg.appendChild(path);
  };
  const c = (cx, cy, r, fill) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', r);
    if (fill) circle.setAttribute('fill', fill);
    svg.appendChild(circle);
  };
  const rg = (x, y, w, h, rx, fill) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('rx', rx);
    if (fill) rect.setAttribute('fill', fill);
    svg.appendChild(rect);
  };

  // 快捷回复：小对话泡泡 + 小星星
  if (name === 'chatHeart') {
    p('M7 10a7 7 0 0 1 14 0v5a7 7 0 0 1-7 7l-2.5 2.5L11 22a7 7 0 0 1-4-2', 'none');
    c('12', '11', '1.2', 'currentColor');
    c('17', '11', '1.2', 'currentColor');
    p('M24 8c1.5-1.5 3.5-1 4 0s.5 2-1 3.5L24 14.5l-3-3c-1.5-1.5-1-3.5 0-4s3 .5 3 2', 'none');
    return svg;
  }

  // 心情：圆圆笑脸 + 腮红
  if (name === 'faceSmile') {
    c('18', '18', '11', 'none');
    c('13.5', '15.5', '1.2', 'currentColor');
    c('22.5', '15.5', '1.2', 'currentColor');
    p('M14 21c1 1.8 3 3 4 3s3-1.2 4-3', 'none');
    c('11', '19', '1.8', '#f9a8c9');
    c('25', '19', '1.8', '#f9a8c9');
    return svg;
  }

  // 接龙：小兔子耳朵 + 串珠
  if (name === 'linkBunny') {
    c('10', '16', '4', 'none');
    c('22', '16', '4', 'none');
    p('M14 16h8', 'none');
    c('16', '25', '3', 'none');
    p('M14.7 21.8l-1.2 1.2', 'none');
    p('M10 12c-1-3 0-5 2-5s2 1.5 1 3', 'none');
    p('M22 12c-1-3 0-5 2-5s2 1.5 1 3', 'none');
    return svg;
  }

  // 转账：小钱袋 + 闪光
  if (name === 'coinStar') {
    c('18', '20', '9', 'none');
    c('18', '20', '5', 'none');
    p('M15.5 18.5h5', 'none');
    p('M18 16v5', 'none');
    p('M8 10l1 2 2 0.5-1.5 1.5 0.3 2.2-1.8-1.2-1.8 1.2 0.3-2.2L5 12.5l2-0.5z', 'none');
    p('M28 8l0.5 1 1.1 0.1-0.8 0.8 0.2 1.1-1-0.5-1 0.5 0.2-1.1-0.8-0.8 1.1-0.1z', 'none');
    return svg;
  }

  // 语音文字：小话筒 + 爱心
  if (name === 'micCute') {
    rg('14', '8', '8', '13', '4', 'none');
    p('M12 19a6 6 0 0 0 12 0', 'none');
    p('M18 25v3', 'none');
    p('M15 28h6', 'none');
    p('M26 10c1-1 2.5-0.6 3 0s.5 1.5-0.5 2.5l-2.5 2.5-2-2c-1-1-.5-2.5 0-3s2 .5 2 2', 'none');
    return svg;
  }

  // 清上下文：小扫帚 + 闪光
  if (name === 'broomSparkle') {
    p('M10 26l12-18', 'none');
    p('M9 27l2-1', 'none');
    p('M21 9l1.5-3.5c.3-.6 1-.3.8.2l-1.2 4', 'none');
    p('M8 28c-0.5-1.5 1-4 4-5.5', 'none');
    p('M11 26c-1-0.5-1.5-2 0-4', 'none');
    p('M27 17l0.4 0.8 0.9 0.1-0.6 0.6 0.1 0.8-0.8-0.4-0.8 0.4 0.1-0.8-0.6-0.6 0.9-0.1z', 'none');
    p('M24 12l0.3 0.5 0.6 0.1-0.4 0.4 0.1 0.6-0.6-0.3-0.6 0.3 0.1-0.6-0.4-0.4 0.6-0.1z', 'none');
    return svg;
  }

  // 关系锁：小锁头 + 爱心钥匙孔
  if (name === 'lockHeart') {
    rg('11', '16', '14', '13', '3', 'none');
    p('M14 16v-3a4 4 0 0 1 8 0v3', 'none');
    p('M18 21c-0.8-0.6-1.5-1.2-1.5-1.8 0-0.5.4-0.9.9-0.9.3 0 .6.2.6.5 0-.3.3-.5.6-.5.5 0 .9.4.9.9 0 .6-.7 1.2-1.5 1.8z', 'none');
    return svg;
  }

  // 电话：小电话 + 爱心
  if (name === 'phoneHeart') {
    p('M8 10c0-1.5 1-3 3-3l2 3-1.5 2.5c1 1.5 3 3.5 4.5 4.5L18.5 15l3 2c0 2-1.5 3-3 3-5 0-10-5-12.5-10', 'none');
    p('M27 9c1-1 2.5-0.6 3 0s.5 1.5-0.5 2.5L27 14l-2.5-2.5c-1-1-.5-2.5 0-3s2 .5 2 2', 'none');
    return svg;
  }

  // 骰子：小骰子 + 笑脸
  if (name === 'diceFace') {
    rg('9', '9', '18', '18', '5', 'none');
    c('14', '14', '1.3', 'currentColor');
    c('22', '14', '1.3', 'currentColor');
    c('14', '22', '1.3', 'currentColor');
    c('22', '22', '1.3', 'currentColor');
    c('18', '18', '1.3', 'currentColor');
    return svg;
  }

  // 猜拳：比耶的小手
  if (name === 'handPeace') {
    p('M15 24v-8l-2-2', 'none');
    p('M15 16v-6c0-1 .8-2 2-2s2 1 2 2v4', 'none');
    p('M19 10v-4c0-1 .8-2 2-2s2 1 2 2v10', 'none');
    p('M21 10c1-1.5 2.5-2 3.5-1s.5 2.5-0.5 3.5L18 24c-2 2-5 2-7 1s-3-3-1-5l4-4', 'none');
    c('18', '8', '1.5', 'none');
    return svg;
  }

  // MCP：小地球 + 脸
  if (name === 'globeMandCute') {
    c('18', '18', '10', 'none');
    p('M8 18h20', 'none');
    p('M18 8c2.5 2.5 4 5 4 10s-1.5 7.5-4 10', 'none');
    p('M18 8c-2.5 2.5-4 5-4 10s1.5 7.5 4 10', 'none');
    c('15', '16', '0.8', 'currentColor');
    c('21', '16', '0.8', 'currentColor');
    p('M16 20.5c.8 1 1.4 1.5 2 1.5s1.2-.5 2-1.5', 'none');
    return svg;
  }

  // 兜底：小星星
  p('M18 6l2 6h6l-5 4 2 6-5-4-5 4 2-6-5-4h6z', 'none');
  return svg;
}

// ═══════════════════════════════════════
// 【小图标按钮】分页里的单个工具
// ═══════════════════════════════════════

function createToolIcon(item) {
  const button = el('button', 'thread-tool-icon-btn');
  button.type = 'button';

  const iconWrap = el('span', 'thread-tool-icon-wrap');
  iconWrap.appendChild(createCuteIcon(item.icon || 'chatHeart'));

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
      transition:all 280ms cubic-bezier(0.22,1,0.36,1);
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
      will-change:transform;
    }

    .thread-tools-track{
      display:flex;
      will-change:transform;
      transition:transform 280ms cubic-bezier(0.22,1,0.36,1);
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
      padding:12px 4px 10px;
      border-radius:20px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      transition:transform 180ms cubic-bezier(0.22,1,0.36,1), box-shadow 180ms ease;
      touch-action:manipulation;
      -webkit-tap-highlight-color:transparent;
    }

    .thread-tool-icon-btn:active{
      transform:scale(0.92);
      box-shadow:var(--shadow-md);
    }

    .thread-tool-icon-wrap{
      width:40px;
      height:40px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:14px;
      background:var(--surface-muted);
      color:var(--accent);
      box-shadow:var(--shadow-sm);
      transition:all 180ms ease;
    }

    .thread-tool-icon-btn:active .thread-tool-icon-wrap{
      transform:scale(1.08);
    }

    .thread-tool-icon-wrap svg{
      width:22px;
      height:22px;
    }

    .thread-tool-icon-label{
      max-width:68px;
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
      animation:toolDetailIn 240ms cubic-bezier(0.22,1,0.36,1) both;
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
      transition:all 180ms cubic-bezier(0.22,1,0.36,1);
      touch-action:manipulation;
    }

    .thread-tools-icon-btn:active{
      transform:scale(0.94);
    }

    .thread-tools-detail-body{
      display:flex;
      flex-direction:column;
      gap:10px;
    }

    @keyframes toolDetailIn{
      from{
        opacity:0;
        transform:translateX(16px);
      }
      to{
        opacity:1;
        transform:translateX(0);
      }
    }

    @media(max-width:430px){
      .thread-tool-icon-btn{
        padding:10px 2px 8px;
      }

      .thread-tool-icon-wrap{
        width:36px;
        height:36px;
      }

      .thread-tool-icon-wrap svg{
        width:20px;
        height:20px;
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
      .thread-tool-icon-wrap,
      .thread-tools-detail-view{
        animation:none;
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/ui.js(createIcon,showToast)；./thread-sheets.js(openQuickReplySheet,openMoodSheet,openRelaySheet,openTransferSheet,openClearContextSheet,openMcpSheet,openVoiceTextSheet,openRelationshipSheet)；./thread-call.js(mountThreadCall)；./thread-actions.js(sendDiceMessage,sendRpsMessage)
