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
  { id: 'mood', title: '心情', icon: 'flowerCute' },
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

  if (!tools.length) {
    const emptyHint = el('div', 'thread-tools-empty-hint', '暂无工具～');
    root.append(emptyHint);
    return root;
  }

  const debounceMap = new Map();
  const DEBOUNCE_MS = 300;

  const gridView = el('div', 'thread-tools-grid-view');
  const header = el('div', 'thread-tools-header');
  const titleWrap = el('div', 'thread-tools-title-wrap');
  titleWrap.append(
    el('div', 'thread-tools-title', options.title || '小工具'),
    el('div', 'thread-tools-subtitle', options.subtitle || '点一下打开..')
  );
  const dots = el('div', 'thread-tools-dots');
  pages.forEach((_, index) => {
    const dot = el('span', 'thread-tools-dot');
    if (index === 0) dot.classList.add('is-active');
    dot.dataset.index = String(index);
    dots.appendChild(dot);
  });
  if (pages.length <= 1) {
    dots.style.display = 'none';
  }
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

  let velocity = 0;
  let lastMoveX = 0;
  let cachedPageWidth = 0;
  let rafId = null;

  pages.forEach((pageTools) => {
    const page = el('div', 'thread-tools-page');
    const grid = el('div', 'thread-tools-grid');
    pageTools.forEach((item) => {
      const button = createToolIcon(item);
      button.addEventListener('click', async () => {
        const now = Date.now();
        const last = debounceMap.get(item.id) || 0;
        if (now - last < DEBOUNCE_MS) return;
        debounceMap.set(item.id, now);
        await handleToolClick(state, item, options, root, detailView, gridView);
      });
      grid.append(button);
    });
    page.append(grid);
    track.append(page);
  });
  carousel.append(track);

  const pageWidth = () => cachedPageWidth || carousel.offsetWidth || 280;
  const snapTo = (index, animate) => {
    const clamped = Math.max(0, Math.min(pages.length - 1, index));
    const isChanging = clamped !== currentPage;
    currentPage = clamped;
    if (animate !== false) {
      const spd = Math.abs(velocity);
      const dur = isChanging && spd > 3 ? 220 : 300;
      track.style.transition = `transform ${dur}ms cubic-bezier(0.25, 1, 0.5, 1)`;
    } else {
      track.style.transition = 'none';
    }
    track.style.transform = `translateX(-${clamped * 100}%)`;
    dots.querySelectorAll('.thread-tools-dot').forEach((dot, i) => {
      dot.classList.toggle('is-active', i === clamped);
    });
  };

  const setDragOffset = (offsetPx) => {
    const pw = pageWidth();
    const base = -currentPage * pw;
    const total = base + offsetPx;
    const maxOffset = (pages.length - 1) * pw;
    const clamped = Math.max(-maxOffset - 30, Math.min(30, total));
    track.style.transition = 'none';
    track.style.transform = `translateX(${clamped}px)`;
  };

  carousel.addEventListener('touchstart', (event) => {
    if (pages.length < 2) return;
    isDragging = true;
    startX = event.touches[0].clientX;
    startY = event.touches[0].clientY;
    lastMoveX = startX;
    deltaX = 0;
    velocity = 0;
    dragLocked = false;
    dragHorizontal = false;
    cachedPageWidth = carousel.offsetWidth || 280;
    const tx = -currentPage * cachedPageWidth;
    track.style.transition = 'none';
    track.style.transform = `translateX(${tx}px)`;
  }, { passive: true });

  carousel.addEventListener('touchmove', (event) => {
    if (!isDragging) return;
    const currentX = event.touches[0].clientX;
    const dx = currentX - startX;
    const dy = event.touches[0].clientY - startY;
    if (!dragLocked) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        dragHorizontal = Math.abs(dx) > Math.abs(dy);
        dragLocked = true;
      }
      return;
    }
    if (!dragHorizontal) return;
    velocity = currentX - lastMoveX;
    lastMoveX = currentX;
    deltaX = dx;
    event.preventDefault();
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => {
      setDragOffset(deltaX);
      rafId = null;
    });
  }, { passive: false });

  carousel.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (!dragHorizontal) {
      snapTo(currentPage);
      return;
    }
    const threshold = pageWidth() * 0.22;
    const velThreshold = 2.5;
    if (deltaX < -threshold || (Math.abs(deltaX) > 10 && velocity < -velThreshold)) {
      snapTo(currentPage + 1);
    } else if (deltaX > threshold || (Math.abs(deltaX) > 10 && velocity > velThreshold)) {
      snapTo(currentPage - 1);
    } else {
      snapTo(currentPage);
    }
  }, { passive: true });

  carousel.addEventListener('touchcancel', () => {
    if (!isDragging) return;
    isDragging = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    snapTo(currentPage);
  }, { passive: true });

  dots.addEventListener('click', (event) => {
    const dot = event.target.closest('.thread-tools-dot');
    if (!dot) return;
    snapTo(Number(dot.dataset.index || 0));
  });

  gridView.append(header, carousel);

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
// 【视图切换】在图标网格和详情之间切换，带淡入淡出过渡
// ═══════════════════════════════════════
function switchToDetail(root, detailView, gridView, title) {
  const detailTitle = detailView.querySelector('.thread-tools-detail-title');
  if (detailTitle) detailTitle.textContent = title || '';

  gridView.style.transition = 'opacity 160ms ease';
  gridView.style.opacity = '0';

  setTimeout(() => {
    gridView.hidden = true;
    gridView.style.opacity = '';
    gridView.style.transition = '';

    detailView.hidden = false;
    detailView.style.opacity = '0';
    detailView.style.transition = 'opacity 200ms ease';
    requestAnimationFrame(() => {
      detailView.style.opacity = '1';
    });
  }, 160);
}

function switchToGrid(root, detailView, gridView) {
  const detailBody = detailView.querySelector('.thread-tools-detail-body');
  if (detailBody) detailBody.replaceChildren();

  detailView.style.transition = 'opacity 160ms ease';
  detailView.style.opacity = '0';

  setTimeout(() => {
    detailView.hidden = true;
    detailView.style.opacity = '';
    detailView.style.transition = '';

    gridView.hidden = false;
    gridView.style.opacity = '0';
    gridView.style.transition = 'opacity 200ms ease';
    requestAnimationFrame(() => {
      gridView.style.opacity = '1';
    });
  }, 160);
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
// 【可爱图标】粗线条圆幼简笔画 SVG，每个只保留 2~3 个核心元素
// ═══════════════════════════════════════
function createCuteIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '3');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const add = (tag, attrs) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, v);
    }
    svg.appendChild(el);
    return el;
  };

  // ───────────────────
  // 快捷回复：胖气泡 + 填充爱心
  // ───────────────────
  if (name === 'chatHeart') {
    add('path', { d: 'M8 14C8 9.6 11.6 6 16 6H32C36.4 6 40 9.6 40 14V20C40 24.4 36.4 28 32 28H26L20 34V28C14 28 8 24 8 18V14Z' });
    add('path', {
      d: 'M24 15C24 12 21 10 19 12C17 14 18 17 24 22C30 17 31 14 29 12C27 10 24 12 24 15Z',
      fill: 'var(--accent)',
      stroke: 'none'
    });
    return svg;
  }

  // ───────────────────
  // 心情：小花朵
  // ───────────────────
  if (name === 'flowerCute') {
    add('path', { d: 'M24 26C24 22 21 19 24 16C27 19 24 22 24 26Z' });
    add('path', { d: 'M24 26C20 26 17 23 14 26C17 29 20 26 24 26Z' });
    add('path', { d: 'M24 26C24 30 27 33 24 36C21 33 24 30 24 26Z' });
    add('path', { d: 'M24 26C28 26 31 29 34 26C31 23 28 26 24 26Z' });
    add('path', { d: 'M24 26C21.5 24 19 21.5 16.5 23C18.5 25 20.5 25 24 26Z' });
    add('path', { d: 'M24 26C26.5 24 29 21.5 31.5 23C29.5 25 27.5 25 24 26Z' });
    add('path', { d: 'M24 26C21.5 28 19 30.5 16.5 29C18.5 27 20.5 27 24 26Z' });
    add('path', { d: 'M24 26C26.5 28 29 30.5 31.5 29C29.5 27 27.5 27 24 26Z' });
    add('circle', { cx: '24', cy: '26', r: '3', fill: 'var(--accent)', stroke: 'none' });
    add('path', { d: 'M24 29V38', stroke: 'currentColor' });
    add('path', { d: 'M20 34C22 33 24 34 24 34C24 34 26 33 28 34', stroke: 'currentColor' });
    return svg;
  }

  // ───────────────────
  // 接龙：三颗星星用虚线连起来
  // ───────────────────
  if (name === 'linkBunny') {
    add('path', { d: 'M11 24L24 16L37 24L24 32Z', 'stroke-dasharray': '4 3' });
    add('path', { d: 'M24 16L24 8L20 13L16 8L20 16H16L11 19L16 22H20L20 28L24 23L28 28L28 22H32L37 19L32 16H28L24 8' });
    add('path', { d: 'M10 22L14 16M34 16L38 22' });
    return svg;
  }

  // ───────────────────
  // 转账：硬币 + 星星
  // ───────────────────
  if (name === 'coinStar') {
    add('circle', { cx: '24', cy: '24', r: '14' });
    add('path', {
      d: 'M24 16L26 21H31L27 24.5L28.5 30L24 26.5L19.5 30L21 24.5L17 21H22Z',
      fill: 'var(--accent)',
      stroke: 'none'
    });
    return svg;
  }

  // ───────────────────
  // 语音文字：铅笔 + 声波
  // ───────────────────
  if (name === 'micCute') {
    add('path', { d: 'M10 38L30 18L34 22L14 42L8 44L10 38Z' });
    add('path', { d: 'M28 16L32 20' });
    add('path', { d: 'M32 12C34 11 36 12.5 36 14.5' });
    add('path', { d: 'M35 9C38 7.5 42 9 42 12.5' });
    return svg;
  }

  // ───────────────────
  // 清上下文：星星扫帚
  // ───────────────────
  if (name === 'broomSparkle') {
    add('path', { d: 'M12 36L32 12' });
    add('path', { d: 'M30 10L34 6L36 12L40 14L34 16L30 10Z' });
    add('path', { d: 'M10 38C8 36 8 33 12 32C16 31 18 34 16 37C14 40 10 40 10 38Z' });
    add('circle', { cx: '38', cy: '28', r: '1.5', fill: 'var(--accent)', stroke: 'none' });
    return svg;
  }

  // ───────────────────
  // 关系锁：圆锁 + 爱心
  // ───────────────────
  if (name === 'lockHeart') {
    add('rect', { x: '12', y: '22', width: '24', height: '18', rx: '6' });
    add('path', { d: 'M18 22V16C18 12 21 8 24 8C27 8 30 12 30 16V22' });
    add('path', {
      d: 'M24 30C24 28 22.5 26 21 27.5C19.5 29 20.5 31.5 24 34.5C27.5 31.5 28.5 29 27 27.5C25.5 26 24 28 24 30Z',
      fill: 'var(--accent)',
      stroke: 'none'
    });
    return svg;
  }

  // ───────────────────
  // 电话：听筒 + 爱心
  // ───────────────────
  if (name === 'phoneHeart') {
    add('path', { d: 'M10 14C10 11 13 8 16 8L19 14L16 18C18 21 22 25 24 28L28 25L34 28C34 31 31 34 28 34C20 34 10 24 10 14Z' });
    add('path', {
      d: 'M36 10C36 8 34.5 6 33 7.5C31.5 9 32.5 11.5 36 14.5C39.5 11.5 40.5 9 39 7.5C37.5 6 36 8 36 10Z',
      fill: 'var(--accent)',
      stroke: 'none'
    });
    return svg;
  }

  // ───────────────────
  // 骰子：圆角方块 + 点
  // ───────────────────
  if (name === 'diceFace') {
    add('rect', { x: '8', y: '8', width: '32', height: '32', rx: '8' });
    add('circle', { cx: '17', cy: '17', r: '2.5', fill: 'currentColor', stroke: 'none' });
    add('circle', { cx: '31', cy: '17', r: '2.5', fill: 'currentColor', stroke: 'none' });
    add('circle', { cx: '17', cy: '31', r: '2.5', fill: 'currentColor', stroke: 'none' });
    add('circle', { cx: '31', cy: '31', r: '2.5', fill: 'currentColor', stroke: 'none' });
    add('circle', { cx: '24', cy: '24', r: '2.5', fill: 'currentColor', stroke: 'none' });
    return svg;
  }

  // ───────────────────
  // 猜拳：剪刀手
  // ───────────────────
  if (name === 'handPeace') {
    add('path', { d: 'M18 32V18L16 14' });
    add('path', { d: 'M18 18V10C18 8.5 19.5 7 21 7C22.5 7 24 8.5 24 10V20' });
    add('path', { d: 'M26 10C26 8.5 27.5 7 29 7C30.5 7 32 8.5 32 10V22' });
    add('path', { d: 'M26 14C28 12 30 12 32 14L24 32C21 35 17 35 14 33C11 31 10 27 13 24L18 18' });
    add('circle', { cx: '36', cy: '14', r: '2', fill: 'var(--accent)', stroke: 'none' });
    return svg;
  }

  // ───────────────────
  // MCP：地球 + 小花
  // ───────────────────
  if (name === 'globeMandCute') {
    add('circle', { cx: '24', cy: '24', r: '15' });
    add('path', { d: 'M9 24H39' });
    add('path', { d: 'M24 9C28 14 30 19 30 24C30 29 28 34 24 39' });
    add('path', { d: 'M24 9C20 14 18 19 18 24C18 29 20 34 24 39' });
    add('circle', { cx: '36', cy: '36', r: '5', fill: 'var(--accent)', stroke: 'none' });
    add('circle', { cx: '36', cy: '33', r: '1.5', fill: 'var(--accent-light)', stroke: 'none' });
    add('circle', { cx: '33.5', cy: '35.5', r: '1.5', fill: 'var(--accent-light)', stroke: 'none' });
    add('circle', { cx: '38.5', cy: '35.5', r: '1.5', fill: 'var(--accent-light)', stroke: 'none' });
    add('circle', { cx: '34.5', cy: '38', r: '1.5', fill: 'var(--accent-light)', stroke: 'none' });
    add('circle', { cx: '37.5', cy: '38', r: '1.5', fill: 'var(--accent-light)', stroke: 'none' });
    return svg;
  }

  // ───────────────────
  // 兜底：星星
  // ───────────────────
  add('path', { d: 'M24 6L28 18H40L30 26L34 38L24 30L14 38L18 26L8 18H20Z' });
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
// 【样式】分页网格、翻页指示器、详情页、空列表兜底
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
    .thread-tools-empty-hint{
      padding:40px 20px;
      text-align:center;
      color:var(--text-hint, var(--text-secondary));
      font-size:14px;
      line-height:1.6;
    }
    .thread-tools-grid-view,
    .thread-tools-detail-view{
      padding:6px 20px 20px;
    }
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
      background:var(--text-secondary);
      opacity:0.3;
      transition:all 300ms cubic-bezier(0.25,1,0.5,1);
    }
    .thread-tools-dot.is-active{
      width:18px;
      opacity:1;
      background:var(--accent);
    }
    .thread-tools-carousel{
      overflow:hidden;
      border-radius:20px;
      touch-action:pan-y;
      will-change:transform;
    }
    .thread-tools-track{
      display:flex;
      will-change:transform;
      transition:transform 300ms cubic-bezier(0.25,1,0.5,1);
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
      gap:8px;
      padding:14px 4px 12px;
      border-radius:22px;
      background:var(--bg-card, var(--bg-surface));
      color:var(--text-primary);
      box-shadow:var(--shadow-card);
      transition:transform 180ms cubic-bezier(0.25,1,0.5,1), box-shadow 180ms ease;
      touch-action:manipulation;
      -webkit-tap-highlight-color:transparent;
    }
    .thread-tool-icon-btn:active{
      transform:scale(0.92);
      box-shadow:var(--shadow-float);
    }
    .thread-tool-icon-wrap{
      width:56px;
      height:56px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:18px;
      background:var(--bg-card, var(--bg-surface));
      color:var(--accent);
      box-shadow:var(--shadow-card);
      transition:all 180ms ease;
    }
    .thread-tool-icon-btn:active .thread-tool-icon-wrap{
      transform:scale(1.08);
      background:var(--accent-light);
    }
    .thread-tool-icon-wrap svg{
      width:36px;
      height:36px;
    }
    .thread-tool-icon-label{
      max-width:72px;
      color:var(--text-primary);
      font-size:12px;
      font-weight:500;
      line-height:1.3;
      text-align:center;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }
    .thread-tools-detail-view{
      animation:toolDetailIn 240ms cubic-bezier(0.25,1,0.5,1) both;
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
      background:var(--bg-card, var(--bg-surface));
      color:var(--text-primary);
      box-shadow:var(--shadow-card);
      transition:all 180ms cubic-bezier(0.25,1,0.5,1);
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
      from{ opacity:0; transform:translateX(16px); }
      to{ opacity:1; transform:translateX(0); }
    }
    @media(max-width:430px){
      .thread-tool-icon-btn{
        padding:10px 2px 8px;
      }
      .thread-tool-icon-wrap{
        width:48px;
        height:48px;
      }
      .thread-tool-icon-wrap svg{
        width:30px;
        height:30px;
      }
      .thread-tool-icon-label{
        font-size:11px;
      }
    }
    @media(prefers-reduced-motion:reduce){
      .thread-tool-icon-btn,
      .thread-tools-icon-btn,
      .thread-tools-dot,
      .thread-tools-track,
      .thread-tool-icon-wrap,
      .thread-tools-detail-view,
      .thread-tools-grid-view{
        animation:none !important;
        transition:none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

// 依赖：../../core/ui.js(createIcon,showToast)；./thread-sheets.js(openQuickReplySheet,openMoodSheet,openRelaySheet,openTransferSheet,openClearContextSheet,openMcpSheet,openVoiceTextSheet,openRelationshipSheet)；./thread-call.js(mountThreadCall)；./thread-actions.js(sendDiceMessage,sendRpsMessage)
