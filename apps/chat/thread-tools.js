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
// 【可爱图标】萌系简笔画 SVG 图标工厂，画得更大更圆更萌
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

  const accent = 'var(--accent)';
  const accentLight = 'var(--accent-light)';

  // 简笔画路径工厂
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
    if (fill) { circle.setAttribute('fill', fill); path.setAttribute('stroke', 'none'); }
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
  // 快捷回复：大胖气泡 + 爱心
  // ───────────────────
  if (name === 'chatHeart') {
    p('M8 16c0-5.5 4.5-10 10-10h7c5.5 0 10 4.5 10 10v4c0 5.5-4.5 10-10 10h-3l-4 4v-4h-0c-3 0-5.5-1.5-7-3.5', 'none');
    c('16', '18', '1.8', 'currentColor');
    c('26', '18', '1.8', 'currentColor');
    p('M36 10c1.5-1.5 4-0.5 4.5 1s0 3.5-1.5 5l-3 3-3-3c-1.5-1.5-1.5-4 0-5.5s4-1 4.5 0.5', accent);
    return svg;
  }

  // ───────────────────
  // 心情：大圆脸 + 弯弯眼 + 张嘴笑 + 腮红 + 小花
  // ───────────────────
  if (name === 'faceSmile') {
    c('24', '24', '16', 'none');
    p('M16 21c0.5-1 1.5-1.5 2.5-1s1.5 1.5 1 2.5', 'none');
    p('M28 21c0.5-1 1.5-1.5 2.5-1s1.5 1.5 1 2.5', 'none');
    p('M16 28c2 3 5 5 8 5s6-2 8-5', 'none');
    c('12', '27', '3', accentLight);
    c('36', '27', '3', accentLight);
    p('M38 9l1 2 2 0.3-1.5 1.4 0.3 2-1.8-1-1.8 1 0.3-2L35 11.3l2-0.3z', accentLight);
    return svg;
  }

  // ───────────────────
  // 接龙：圆润小兔子 + 串珠链
  // ───────────────────
  if (name === 'linkBunny') {
    c('14', '22', '6', 'none');
    c('34', '22', '6', 'none');
    p('M20 22h8', 'none', '2');
    c('24', '36', '4', 'none');
    p('M14 16c-2-5 0-9 4-9s3 3 2 5', 'none');
    p('M34 16c-2-5 0-9 4-9s3 3 2 5', 'none');
    c('12', '21', '1.2', accent);
    c('16', '21', '1.2', accent);
    c('32', '21', '1.2', accent);
    c('36', '21', '1.2', accent);
    return svg;
  }

  // ───────────────────
  // 转账：胖钱袋 + 闪光 + 爱心
  // ───────────────────
  if (name === 'coinStar') {
    p('M10 24c0-7.5 6-13 14-13s14 5.5 14 13v2c0 7-6 13-14 13S10 33 10 26v-2z', 'none');
    c('24', '26', '7', 'none');
    p('M20 26h8', 'none', '2.5');
    p('M24 22v8', 'none', '2.5');
    p('M8 11l1.5 3 3 0.5-2.2 2 0.5 3-2.8-1.5-2.8 1.5 0.5-3-2.2-2 3-0.5z', accentLight);
    p('M38 8l1 2 2 0.3-1.5 1.4 0.3 2-1.8-1-1.8 1 0.3-2L35 10.3l2-0.3z', accentLight);
    return svg;
  }

  // ───────────────────
  // 语音文字：粗壮话筒 + 波浪线 + 小爱心
  // ───────────────────
  if (name === 'micCute') {
    rg('16', '8', '12', '18', '6', 'none');
    p('M13 24a10 10 0 0 0 18 0', 'none', '2');
    p('M24 34v5', 'none', '2');
    p('M17 39h14', 'none', '2');
    p('M36 12c2-2 5-1 5.5 0.5s0.5 3-1.5 5L36 22l-3.5-3.5c-2-2-1.5-5 0-6s4 1 3.5 3.5', accent);
    return svg;
  }

  // ───────────────────
  // 清上下文：粗扫帚 + 闪亮星星
  // ───────────────────
  if (name === 'broomSparkle') {
    p('M12 36l18-26', 'none', '2.5');
    p('M10 37.5l3-1.5', 'none', '2.5');
    p('M28 12l3-5c0.5-0.8 1.5-0.5 1.2 0.3l-2 6', 'none');
    p('M8 39c-0.5-2.5 2-6.5 6-8.5', 'none', '2');
    p('M13 36c-2-0.5-2.5-3 0-5.5', 'none', '2');
    p('M38 20l0.8 1.5 1.5 0.2-1 1 0.2 1.5-1.5-0.8-1.5 0.8 0.2-1.5-1-1 1.5-0.2z', accent);
    p('M34 12l0.5 1 1 0.1-0.7 0.7 0.2 1-1-0.5-1 0.5 0.2-1-0.7-0.7 1-0.1z', accentLight);
    return svg;
  }

  // ───────────────────
  // 关系锁：胖锁头 + 爱心钥匙孔 + 小翅膀
  // ───────────────────
  if (name === 'lockHeart') {
    rg('11', '20', '22', '19', '5', 'none');
    p('M17 20v-5a7 7 0 0 1 14 0v5', 'none', '2.5');
    p('M24 30c-1.5-1-2.5-2-2.5-2.8 0-1 .8-1.5 1.5-1.5.5 0 .9.3.8.8 0-.5.5-.8 1-.8.8 0 1.4.7 1.4 1.5 0 1-1.2 2-2.2 2.8z', accent);
    p('M10 34c-1 1.5-2 4 0 5', 'none', '1.5');
    p('M38 34c1 1.5 2 4 0 5', 'none', '1.5');
    return svg;
  }

  // ───────────────────
  // 电话：粗电话 + 信号线 + 小爱心
  // ───────────────────
  if (name === 'phoneHeart') {
    p('M10 14c0-2.5 2-5 5-5l3 5-2.5 3.5c2 2.5 5 5.5 7 7.5l3.5-2.5 5 3.5c0 3-2.5 5-5 5-8 0-16-8-18-16', 'none', '2');
    p('M37 11c2-2 5-1 5.5 0.5s0 3.5-1.5 5L37 20l-3.5-3.5c-1.5-1.5-1.5-4 0-5.5s4-1 4.5 0', accent);
    return svg;
  }

  // ───────────────────
  // 骰子：圆角大骰子 + 可爱圆点
  // ───────────────────
  if (name === 'diceFace') {
    rg('9', '9', '26', '26', '7', 'none');
    c('17', '17', '2.5', 'currentColor');
    c('31', '17', '2.5', 'currentColor');
    c('17', '31', '2.5', 'currentColor');
    c('31', '31', '2.5', 'currentColor');
    c('24', '24', '2.5', 'currentColor');
    p('M38 6l0.6 1.2 1.2 0.1-0.9 0.9 0.2 1.2-1.1-0.6-1.1 0.6 0.2-1.2-0.9-0.9 1.2-0.1z', accentLight);
    return svg;
  }

  // ───────────────────
  // 猜拳：圆润比耶手 + 小爱心
  // ───────────────────
  if (name === 'handPeace') {
    p('M18 33v-12l-3-3', 'none');
    p('M18 21v-8c0-1.5 1.2-2.5 2.8-2.5s2.8 1 2.8 2.5v7', 'none');
    p('M23.6 13v-5c0-1.5 1.2-2.5 2.8-2.5s2.8 1 2.8 2.5v14', 'none');
    p('M26.4 13c2-2 4-2.5 5.5-1s1 4-1 5.5L23 33c-3 3-6.5 3-9.5 1.5s-4.5-4.5-1.5-7l6-6', 'none');
    c('25', '9', '2.2', 'none');
    p('M39 16c1.2-1.2 3-0.7 3.5 0s.5 2-0.5 3L39 22l-3-3c-1-1-.5-3 0-3.5s2.5.5 2.5 2', accent);
    return svg;
  }

  // ───────────────────
  // MCP：大地球 + 可爱脸 + 腮红
  // ───────────────────
  if (name === 'globeMandCute') {
    c('24', '24', '15', 'none');
    p('M9 24h30', 'none');
    p('M24 9c4 3.5 6 8 6 15s-2 11.5-6 15', 'none');
    p('M24 9c-4 3.5-6 8-6 15s2 11.5 6 15', 'none');
    c('19', '21', '1.5', 'currentColor');
    c('29', '21', '1.5', 'currentColor');
    p('M20 28c1.5 1.5 2.5 2 4 2s2.5-0.5 4-2', 'none');
    c('15', '26', '2.5', accentLight);
    c('33', '26', '2.5', accentLight);
    return svg;
  }

  // ───────────────────
  // 兜底：大星星 + accent 填色 + 小装饰
  // ───────────────────
  p('M24 6l4 10h10l-8 6 3 10-9-6.5-9 6.5 3-10-8-6h10z', accentLight);
  c('36', '10', '1.5', accent);
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
