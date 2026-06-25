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

const ALL_TOOLS = [
  { id: 'quickReply', title: '快捷回复', desc: '一键发短句', icon: 'message' },
  { id: 'mood', title: '心情', desc: '发点情绪', icon: 'heart' },
  { id: 'relay', title: '接龙', desc: '把话题丢出去', icon: 'repeat' },
  { id: 'transfer', title: '转账', desc: '发小卡片', icon: 'wallet' },
  { id: 'voiceText', title: '语音文字', desc: '先发文字', icon: 'mic' },
  { id: 'clearContext', title: '清上下文', desc: '收短一点', icon: 'trash' },
  { id: 'relationship', title: '关系锁', desc: '看当前状态', icon: 'lock' },
  { id: 'call', title: '电话', desc: '打给 TA', icon: 'phone' },
  { id: 'dice', title: '骰子', desc: '摇一把', icon: 'dice' },
  { id: 'rps', title: '猜拳', desc: '来一局', icon: 'hand' },
  { id: 'mcp', title: 'MCP', desc: '外部工具', icon: 'web' }
];

const state = {
  rootEl: null,
  chatState: null,
  options: null,
  currentPage: 'list',
  currentToolId: '',
  listeners: [],
  touch: {
    startX: 0,
    startY: 0,
    currentX: 0,
    dragging: false,
    direction: null
  }
};

// ═══════════════════════════════════════
// 【公开接口】创建工具面板和销毁工具面板
// ═══════════════════════════════════════

export function createThreadToolsGrid(chatState, options = {}) {
  injectStyle();
  destroyThreadTools();

  state.chatState = chatState || null;
  state.options = options || null;
  state.currentPage = 'list';
  state.currentToolId = '';

  const root = el('section', 'thread-tools-panel');
  state.rootEl = root;

  renderCurrentPage();
  return root;
}

export function destroyThreadTools() {
  clearListeners();
  state.rootEl = null;
  state.chatState = null;
  state.options = null;
  state.currentPage = 'list';
  state.currentToolId = '';
}

// ═══════════════════════════════════════
// 【页面路由】根据状态渲染列表页或子页面
// ═══════════════════════════════════════

function renderCurrentPage() {
  if (!state.rootEl) return;

  state.rootEl.replaceChildren();

  if (state.currentPage === 'sub' && state.currentToolId) {
    renderSubPage();
  } else {
    renderListPage();
  }
}

// ═══════════════════════════════════════
// 【列表页】可滑动工具列表
// ═══════════════════════════════════════

function renderListPage() {
  if (!state.rootEl) return;

  const header = el('div', 'thread-tools-header');
  header.append(
    el('div', 'thread-tools-title', '小工具箱')
  );

  const scrollWrap = el('div', 'thread-tools-scroll-wrap');
  const list = el('div', 'thread-tools-list');

  ALL_TOOLS.forEach((item) => {
    list.append(createToolCard(item));
  });

  scrollWrap.append(list);
  setupSwipe(scrollWrap);

  state.rootEl.append(header, scrollWrap);
}

// ───────────────────
// 工具卡片
// ───────────────────

function createToolCard(item) {
  const card = el('button', 'thread-tool-card');
  card.type = 'button';

  const icon = el('span', 'thread-tool-icon');
  icon.appendChild(createIcon(item.icon || 'message', 18));

  const text = el('span', 'thread-tool-text');
  text.append(
    el('span', 'thread-tool-title', item.title || ''),
    el('span', 'thread-tool-desc', item.desc || '')
  );

  const arrow = el('span', 'thread-tool-arrow');
  arrow.appendChild(createIcon('chevron-right', 16));

  card.append(icon, text, arrow);

  card.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    handleToolTap(item);
  });

  return card;
}
// ───────────────────
// 工具点击：进入子页面
// ───────────────────

function handleToolTap(item) {
  const id = String(item?.id || '').trim();
  if (!id) return;

  if (id === 'dice' || id === 'rps') {
    handleInlineAction(id, item);
    return;
  }

  state.currentPage = 'sub';
  state.currentToolId = id;
  renderCurrentPage();
}

// ───────────────────
// 内联动作：骰子和猜拳，加反馈提示
// ───────────────────

async function handleInlineAction(id, item) {
  if (!state.chatState) return;

  const label = item?.title || id;

  try {
    if (id === 'dice') {
      showToast('摇骰子中...');
      await sendDiceMessage(state.chatState, { triggerAI: true });
      showToast('骰子扔出去啦');
    }
    if (id === 'rps') {
      showToast('出拳中...');
      await sendRpsMessage(state.chatState, { triggerAI: true });
      showToast('猜拳开始啦');
    }
  } catch (error) {
    console.error('[thread-tools] inline action failed', error);
    showToast(label + '没发出去');
  }
}

// ═══════════════════════════════════════
// 【子页面】带返回键的工具详情页
// ═══════════════════════════════════════

function renderSubPage() {
  if (!state.rootEl) return;

  const toolId = state.currentToolId;
  const tool = ALL_TOOLS.find((t) => t.id === toolId);

  const page = el('section', 'thread-tools-sub-page');

  const header = el('div', 'thread-tools-sub-header');

  const backBtn = el('button', 'thread-tools-back-btn');
  backBtn.type = 'button';
  backBtn.setAttribute('aria-label', '返回工具栏');
  const backIcon = el('span', 'thread-tools-back-icon');
  backIcon.appendChild(createIcon('chevron-left', 18));
  const backText = el('span', 'thread-tools-back-text', '工具');
  backBtn.append(backIcon, backText);

  backBtn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    goBackToList();
  });

  const titleEl = el('div', 'thread-tools-sub-title', tool?.title || toolId);

  header.append(backBtn, titleEl);

  const body = el('div', 'thread-tools-sub-body');

  page.append(header, body);
  state.rootEl.append(page);

  setupSwipe(page);

  routeSubPageContent(toolId, body);
}

// ───────────────────
// 返回列表
// ───────────────────

function goBackToList() {
  state.currentPage = 'list';
  state.currentToolId = '';
  renderCurrentPage();
}

// ───────────────────
// 子页面内容路由
// ───────────────────

function routeSubPageContent(toolId, container) {
  const chatState = state.chatState;
  const options = state.options || {};

  if (!chatState) {
    container.append(el('div', 'thread-tools-empty', '还没有聊天数据'));
    return;
  }

  const routes = {
    quickReply: () => openQuickReplySheet(chatState, options.quickReply || {}),
    mood: () => openMoodSheet(chatState, options.mood || {}),
    relay: () => openRelaySheet(chatState, options.relay || {}),
    transfer: () => openTransferSheet(chatState, options.transfer || {}),
    voiceText: () => openVoiceTextSheet(chatState, options.voiceText || {}),
    clearContext: () => openClearContextSheet(chatState, options.clearContext || {}),
    relationship: () => openRelationshipSheet(chatState, options.relationship || {}),
    mcp: () => openMcpSheet(chatState, options.mcp || {}),
    call: () => handleCallRoute(chatState, options)
  };

  const routeFn = routes[toolId];

  if (routeFn) {
    routeFn();
    container.append(el('div', 'thread-tools-sub-hint', '面板已打开，收起来就能回这里'));
    return;
  }

  container.append(el('div', 'thread-tools-empty', '这个工具还没接好'));
}

// ───────────────────
// 电话子路由
// ───────────────────

async function handleCallRoute(chatState, options) {
  const target = options.containerEl || document.body;

  try {
    await mountThreadCall(target, {
      state: chatState,
      character: chatState?.character || null,
      characterId: chatState?.characterId || '',
      close: typeof options.onCloseCall === 'function' ? options.onCloseCall : null,
      onReject: typeof options.onRejectCall === 'function' ? options.onRejectCall : null
    });
  } catch (error) {
    console.error('[thread-tools] call mount failed', error);
    showToast('电话没接起来');
  }
}
// ═══════════════════════════════════════
// 【滑动手势】横向滑动返回
// ═══════════════════════════════════════

function setupSwipe(container) {
  if (!container) return;

  const onStart = (event) => {
    const touch = event.touches ? event.touches[0] : event;
    state.touch.startX = touch.clientX;
    state.touch.startY = touch.clientY;
    state.touch.currentX = touch.clientX;
    state.touch.dragging = true;
    state.touch.direction = null;
  };

  const onMove = (event) => {
    if (!state.touch.dragging) return;

    const touch = event.touches ? event.touches[0] : event;
    const dx = touch.clientX - state.touch.startX;
    const dy = touch.clientY - state.touch.startY;

    state.touch.currentX = touch.clientX;

    if (!state.touch.direction) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        state.touch.direction = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      }
    }

    if (state.touch.direction === 'h') {
      event.preventDefault();
    }
  };

  const onEnd = () => {
    if (!state.touch.dragging) return;
    state.touch.dragging = false;

    if (state.touch.direction !== 'h') return;

    const dx = state.touch.currentX - state.touch.startX;
    const threshold = 50;

    if (dx > threshold && state.currentPage === 'sub') {
      goBackToList();
    }

    state.touch.direction = null;
  };

  container.addEventListener('touchstart', onStart, { passive: true });
  container.addEventListener('touchmove', onMove, { passive: false });
  container.addEventListener('touchend', onEnd, { passive: true });

  state.listeners.push(
    { el: container, type: 'touchstart', fn: onStart },
    { el: container, type: 'touchmove', fn: onMove },
    { el: container, type: 'touchend', fn: onEnd }
  );
}

// ───────────────────
// 清理事件
// ───────────────────

function clearListeners() {
  state.listeners.forEach(({ el, type, fn }) => {
    try { el.removeEventListener(type, fn); } catch (_) {}
  });
  state.listeners = [];
}

// ═══════════════════════════════════════
// 【辅助函数】DOM
// ═══════════════════════════════════════

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// ═══════════════════════════════════════
// 【样式】滑动列表、子页面返回键、卡片
// ═══════════════════════════════════════

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* ── 面板容器 ── */
    .thread-tools-panel{
      display:flex;
      flex-direction:column;
      min-height:0;
      padding:6px 0 20px;
      color:var(--text-primary);
    }

    /* ── 列表页头部 ── */
    .thread-tools-header{
      display:flex;
      align-items:center;
      padding:0 20px 14px;
    }

    .thread-tools-title{
      color:var(--text-primary);
      font-size:17px;
      font-weight:600;
      line-height:1.35;
    }

    /* ── 可滑动列表区 ── */
    .thread-tools-scroll-wrap{
      overflow-y:auto;
      overflow-x:hidden;
      -webkit-overflow-scrolling:touch;
      overscroll-behavior:contain;
      padding:0 20px;
      max-height:min(56vh, 480px);
    }

    .thread-tools-list{
      display:flex;
      flex-direction:column;
      gap:8px;
      padding-bottom:6px;
    }

    /* ── 工具卡片 ── */
    .thread-tool-card{
      width:100%;
      min-height:64px;
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto;
      align-items:center;
      gap:12px;
      padding:12px 14px;
      border-radius:18px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      text-align:left;
      transition:transform 180ms ease;
    }

    .thread-tool-card:active{
      transform:scale(.97);
    }

    .thread-tool-icon{
      width:38px;
      height:38px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:14px;
      background:var(--surface-muted);
      color:var(--accent);
      box-shadow:var(--shadow-sm);
      flex:0 0 auto;
    }

    .thread-tool-text{
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:3px;
    }

    .thread-tool-title{
      color:var(--text-primary);
      font-size:15px;
      font-weight:500;
      line-height:1.35;
    }

    .thread-tool-desc{
      color:var(--text-secondary);
      font-size:12px;
      line-height:1.45;
    }

    .thread-tool-arrow{
      width:28px;
      height:28px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      color:var(--text-hint);
      flex:0 0 auto;
    }

    /* ── 子页面壳 ── */
    .thread-tools-sub-page{
      display:flex;
      flex-direction:column;
      min-height:0;
    }

    .thread-tools-sub-header{
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto;
      align-items:center;
      gap:12px;
      padding:0 20px 14px;
    }

    .thread-tools-back-btn{
      display:inline-flex;
      align-items:center;
      gap:4px;
      min-width:0;
      height:38px;
      padding:0 10px 0 6px;
      border-radius:14px;
      background:var(--bg-card);
      color:var(--accent);
      box-shadow:var(--shadow-sm);
      transition:transform 180ms ease;
    }

    .thread-tools-back-btn:active{
      transform:scale(.94);
    }

    .thread-tools-back-icon{
      width:28px;
      height:28px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      flex:0 0 auto;
    }

    .thread-tools-back-text{
      font-size:13px;
      font-weight:500;
      line-height:1.35;
      white-space:nowrap;
    }

    .thread-tools-sub-title{
      color:var(--text-primary);
      font-size:17px;
      font-weight:600;
      line-height:1.35;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .thread-tools-sub-body{
      flex:1 1 auto;
      min-height:0;
      padding:0 20px;
      overflow-y:auto;
      overflow-x:hidden;
      -webkit-overflow-scrolling:touch;
      overscroll-behavior:contain;
    }

    /* ── 子页面提示 ── */
    .thread-tools-sub-hint{
      margin-top:16px;
      padding:14px 16px;
      border-radius:16px;
      background:var(--surface-muted);
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.6;
      text-align:center;
    }

    /* ── 空状态 ── */
    .thread-tools-empty{
      padding:24px 16px;
      border-radius:18px;
      background:var(--surface-muted);
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.6;
      text-align:center;
    }

    /* ── 响应式 ── */
    @media(max-width:430px){
      .thread-tools-scroll-wrap{
        max-height:min(50vh, 400px);
      }
    }

    @media(prefers-reduced-motion:reduce){
      .thread-tool-card,
      .thread-tools-back-btn{
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/ui.js(createIcon,showToast)；./thread-sheets.js(openQuickReplySheet,openMoodSheet,openRelaySheet,openTransferSheet,openClearContextSheet,openMcpSheet,openVoiceTextSheet,openRelationshipSheet)；./thread-call.js(mountThreadCall)；./thread-actions.js(sendDiceMessage,sendRpsMessage)
