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
  // 空工具列表兜底提示
  // ───────────────────
  if (!tools.length) {
    const emptyHint = el('div', 'thread-tools-empty-hint', '暂无工具～');
    root.append(emptyHint);
    return root;
  }

  // ───────────────────
  // 防抖 Map：记录每个工具最后点击时间
  // ───────────────────
  const debounceMap = new Map();
  const DEBOUNCE_MS = 300;

  // ───────────────────
  // 图标网格层
  // ───────────────────
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
  // ───────────────────
  // 只有一页时隐藏圆点指示器
  // ───────────────────
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

  // ───────────────────
  // 速度 / 缓存宽度 / RAF
  // ───────────────────
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
        // ───────────────────
        // 防抖：300ms 内同一工具不响应
        // ───────────────────
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

  // ───────────────────
  // 跟手拖拽翻页
  // ───────────────────
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
// 【视图切换】在图标网格和详情之间切换，带淡入淡出过渡
// ═══════════════════════════════════════
function switchToDetail(root, detailView, gridView, title) {
  const detailTitle = detailView.querySelector('.thread-tools-detail-title');
  if (detailTitle) detailTitle.textContent = title || '';

  // 网格淡出
  gridView.style.transition = 'opacity 160ms ease';
  gridView.style.opacity = '0';

  setTimeout(() => {
    gridView.hidden = true;
    gridView.style.opacity = '';
    gridView.style.transition = '';

    // 详情淡入
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

  // 详情淡出
  detailView.style.transition = 'opacity 160ms ease';
  detailView.style.opacity = '0';

  setTimeout(() => {
    detailView.hidden = true;
    detailView.style.opacity = '';
    detailView.style.transition = '';

    // 网格淡入
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
// 【可爱图标】少女心手绘风 SVG 图标工厂
// ═══════════════════════════════════════
function createCuteIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const accentLight = 'var(--accent-light)';
  const accentSoft = 'var(--accent)';

  const p = (d, fill, sw) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    if (fill) { path.setAttribute('fill', fill); path.setAttribute('stroke', 'none'); }
    if (sw) path.setAttribute('stroke-width', sw);
    svg.appendChild(path);
  };

  const c = (cx, cy, r, fill, sw) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', r);
    if (fill) { circle.setAttribute('fill', fill); circle.setAttribute('stroke', 'none'); }
    if (sw) circle.setAttribute('stroke-width', sw);
    svg.appendChild(circle);
  };

  const rg = (x, y, w, h, rx, fill) => {
    const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', w);
    rect.setAttribute('height', h);
    rect.setAttribute('rx', rx);
    if (fill) { rect.setAttribute('fill', fill); rect.setAttribute('stroke', 'none'); }
    svg.appendChild(rect);
  };

  // ───────────────────
  // 快捷回复：大对话泡泡 + 小爱心
  // ───────────────────
  if (name === 'chatHeart') {
    p('M9 14a9 9 0 0 1 18 0v6a9 9 0 0 1-9 9l-3 3-1-3a9 9 0 0 1-5-2.5');
    c('14', '15', '1.5', 'currentColor');
    c('20', '15', '1.5', 'currentColor');
    p('M33 10c2-2 4.5-1 5 0.5s0.5 3-1.5 5L33 19l-3.5-3.5c-2-2-1.5-5 0-6s4 1 3.5 3.5', accentSoft);
    p('M37 18l0.3 0.7 0.7 0.1-0.5 0.5 0.1 0.7-0.6-0.3-0.6 0.3 0.1-0.7-0.5-0.5 0.7-0.1z', accentLight);
    return svg;
  }

  // ───────────────────
  // 心情：大圆脸 + 弯弯眼 + 腮红 + 小花
  // ───────────────────
  if (name === 'faceSmile') {
    c('24', '24', '14', 'none');
    p('M17 21q0-2 2-2t2 2', 'none');
    p('M25 21q0-2 2-2t2 2', 'none');
    p('M17 29c1.5 2.5 4 4 7 4s5.5-1.5 7-4', 'none');
    c('13', '26', '2.5', accentLight);
    c('35', '26', '2.5', accentLight);
    p('M36 10l0.8 1.8 1.9 0.3-1.4 1.3 0.3 1.8-1.6-0.9-1.6 0.9 0.3-1.8L33.3 12l1.9-0.3z', accentLight);
    return svg;
  }

  // ───────────────────
  // 接龙：小兔子 + 串珠
  // ───────────────────
  if (name === 'linkBunny') {
    c('13', '20', '5', 'none');
    c('29', '20', '5', 'none');
    p('M18 20h6', 'none');
    c('20.5', '32', '3.5', 'none');
    p('M13 15c-1.5-4 0-7 3-7s2.5 2 1.5 4', 'none');
    p('M29 15c-1.5-4 0-7 3-7s2.5 2 1.5 4', 'none');
    c('11', '19', '1', accentLight);
    c('15', '19', '1', accentLight);
    c('27', '19', '1', accentLight);
    c('31', '19', '1', accentLight);
    return svg;
  }

  // ───────────────────
  // 转账：小钱袋 + 爱心 + 闪光
  // ───────────────────
  if (name === 'coinStar') {
    c('21', '26', '11', 'none');
    c('21', '26', '6', 'none');
    p('M18 24h6', 'none', '2');
    p('M21 21v6', 'none', '2');
    p('M9 13l1.5 2.8 3 0.5-2.2 2 0.5 3-2.8-1.4-2.8 1.4 0.5-3-2.2-2 3-0.5z', accentLight);
    p('M36 8l0.8 1.6 1.7 0.2-1.2 1.2 0.3 1.7-1.6-0.9-1.6 0.9 0.3-1.7-1.2-1.2 1.7-0.2z', accentLight);
    return svg;
  }

  // ───────────────────
  // 语音文字：大话筒 + 小爱心
  // ───────────────────
  if (name === 'micCute') {
    rg('17', '10', '10', '16', '5', 'none');
    p('M15 24a8 8 0 0 0 16 0', 'none');
    p('M22 32v4', 'none');
    p('M18 36h8', 'none');
    p('M34 13c1.5-1.5 4-0.8 4.5 0.5s0.5 2.5-1 3.5L34 21l-3-3c-1.5-1.5-1-4 0.5-5s3.5 1 2.5 3.5', accentSoft);
    return svg;
  }

  // ───────────────────
  // 清上下文：大扫帚 + 小星星
  // ───────────────────
  if (name === 'broomSparkle') {
    p('M13 34l16-24', 'none', '2');
    p('M12 35.5l2.5-1.2', 'none', '2');
    p('M28 12l2-4.5c.4-.7 1.3-.4 1 .3l-1.5 5', 'none');
    p('M10 37c-0.5-2 1.5-5.5 5.5-7.5', 'none');
    p('M14 34.5c-1.5-0.5-2-2.5 0-5', 'none');
    p('M36 22l0.6 1.2 1.2 0.1-0.8 0.8 0.2 1.2-1.2-0.6-1.2 0.6 0.2-1.2-0.8-0.8 1.2-0.1z', accentLight);
    p('M32 15l0.4 0.8 0.8 0.1-0.6 0.6 0.1 0.8-0.7-0.4-0.7 0.4 0.1-0.8-0.6-0.6 0.8-0.1z', accentLight);
    return svg;
  }

  // ───────────────────
  // 关系锁：大锁头 + 爱心钥匙孔
  // ───────────────────
  if (name === 'lockHeart') {
    rg('13', '20', '18', '17', '4', 'none');
    p('M17 20v-4a6 6 0 0 1 12 0v4', 'none', '2');
    p('M24 28c-1.2-0.9-2-1.8-2-2.5 0-0.8.6-1.3 1.3-1.3.4 0 .8.3.7.7 0-.4.4-.7.8-.7.7 0 1.2.6 1.2 1.3 0 .8-1 1.8-2 2.5z', accentSoft);
    return svg;
  }

  // ───────────────────
  // 电话：大电话 + 小爱心
  // ───────────────────
  if (name === 'phoneHeart') {
    p('M10 13c0-2 1.5-4 4-4l3 4-2 3c1.5 2 4 4.5 6 6l3-2 4 3c0 2.5-2 4-4 4-7 0-14-7-17-14', 'none');
    p('M36 12c1.5-1.5 4-0.8 4.5 0.5s0.5 2.5-1 3.5L36 20l-3.5-3.5c-1.5-1.5-1-4 0.5-5s3.5 1 2.5 3.5', accentSoft);
    return svg;
  }

  // ───────────────────
  // 骰子：大方块 + 闪亮小圆点
  // ───────────────────
  if (name === 'diceFace') {
    rg('11', '11', '22', '22', '6', 'none');
    c('17', '17', '2', 'currentColor');
    c('29', '17', '2', 'currentColor');
    c('17', '29', '2', 'currentColor');
    c('29', '29', '2', 'currentColor');
    c('23', '23', '2', 'currentColor');
    p('M36 7l0.5 1 1 0.1-0.7 0.7 0.2 1-0.9-0.5-1 0.5 0.2-1-0.7-0.7 1-0.1z', accentLight);
    return svg;
  }

  // ───────────────────
  // 猜拳：比耶大手 + 小爱心
  // ───────────────────
  if (name === 'handPeace') {
    p('M19 32v-11l-3-3', 'none');
    p('M19 21v-8c0-1.5 1-2.5 2.5-2.5s2.5 1 2.5 2.5v6', 'none');
    p('M24 13v-5c0-1.5 1-2.5 2.5-2.5s2.5 1 2.5 2.5v13', 'none');
    p('M26.5 13c1.5-2 3.5-2.5 5-1s0.5 3.5-1 5L23 32c-2.5 2.5-6 2.5-9 1s-4-4-1.5-6.5l5.5-5.5', 'none');
    c('24', '10', '2', 'none');
    p('M38 18c1-1 2.5-0.6 3 0s.5 1.5-0.5 2.5L38 23l-2.5-2.5c-1-1-.5-2.5 0-3s2 .5 2 2', accentSoft);
    return svg;
  }

  // ───────────────────
  // MCP：大地球 + 可爱脸
  // ───────────────────
  if (name === 'globeMandCute') {
    c('24', '24', '13', 'none');
    p('M11 24h22', 'none');
    p('M24 11c3.5 3 5.5 6.5 5.5 13s-2 10-5.5 13', 'none');
    p('M24 11c-3.5 3-5.5 6.5-5.5 13s2 10 5.5 13', 'none');
    c('19.5', '21', '1.2', 'currentColor');
    c('28.5', '21', '1.2', 'currentColor');
    p('M21 27c1.2 1.3 2 2 3 2s1.8-.7 3-2', 'none');
    c('17', '25', '2', accentLight);
    c('31', '25', '2', accentLight);
    return svg;
  }

  // ───────────────────
  // 兜底：小星星（加 accent 填色）
  // ───────────────────
  p('M24 8l3 8h8l-6.5 5 2.5 8-7-5-7 5 2.5-8L13 16h8z', accentLight);
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
      color:var(--text-hint);
      font-size:14px;
      line-height:1.6;
    }
    .thread-tools-grid-view,
    .thread-tools-detail-view{
      padding:6px 20px 20px;
    }

    /* ───────────────────
       顶部标题和圆点
    ─────────────────── */
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
      transition:all 300ms cubic-bezier(0.25,1,0.5,1);
    }
    .thread-tools-dot.is-active{
      width:18px;
      opacity:1;
      background:var(--accent);
    }

    /* ───────────────────
       分页轮播
    ─────────────────── */
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
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      transition:transform 180ms cubic-bezier(0.25,1,0.5,1), box-shadow 180ms ease;
      touch-action:manipulation;
      -webkit-tap-highlight-color:transparent;
    }
    .thread-tool-icon-btn:active{
      transform:scale(0.92);
      box-shadow:var(--shadow-md);
    }
    .thread-tool-icon-wrap{
      width:48px;
      height:48px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:16px;
      background:var(--bg-card);
      border:1px solid var(--border-subtle, rgba(0,0,0,0.05));
      color:var(--accent);
      box-shadow:0 2px 8px rgba(0,0,0,0.06);
      transition:all 180ms ease;
    }
    .thread-tool-icon-btn:active .thread-tool-icon-wrap{
      transform:scale(1.1);
      background:var(--accent-light, color-mix(in srgb, var(--accent) 12%, transparent));
      border-color:var(--accent-light, transparent);
    }
    .thread-tool-icon-wrap svg{
      width:30px;
      height:30px;
    }
    .thread-tool-icon-label{
      max-width:72px;
      color:var(--text-primary);
      font-size:11px;
      font-weight:500;
      line-height:1.3;
      text-align:center;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    /* ───────────────────
       工具详情层
    ─────────────────── */
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
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
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
        width:42px;
        height:42px;
      }
      .thread-tool-icon-wrap svg{
        width:26px;
        height:26px;
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
