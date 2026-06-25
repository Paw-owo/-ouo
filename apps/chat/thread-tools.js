// apps/chat/thread-tools.js
// imports:
//   from '../../core/ui.js': createIcon, showToast
//   from '../../core/storage.js': getData, setData
//   from './thread-sheets.js': openMoodSheet, openRelaySheet, openTransferSheet, openClearContextSheet, openMcpSheet, openVoiceTextSheet, openRelationshipSheet
//   from './thread-call.js': mountThreadCall
//   from './thread-actions.js': sendDiceMessage, sendRpsMessage

import { createIcon, showToast } from '../../core/ui.js';
import { getData, setData } from '../../core/storage.js';

import {
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
const QUICK_REPLIES_KEY = 'chat_quick_replies';

const DEFAULT_TOOLS = [
  { id: 'quickReply', title: '快捷回复', desc: '自定义短句', icon: 'message' },
  { id: 'mood', title: '心情', desc: '发点情绪', icon: 'heart' },
  { id: 'relay', title: '接龙', desc: '把话题丢出去', icon: 'repeat' },
  { id: 'transfer', title: '转账', desc: '发小卡片', icon: 'wallet' },
  { id: 'voiceText', title: '语音文字', desc: '先发文字', icon: 'mic' },
  { id: 'clearContext', title: '清上下文', desc: '收短一点', icon: 'trash' },
  { id: 'relationship', title: '关系锁', desc: '看当前状态', icon: 'lock' },
  { id: 'call', title: '电话', desc: '打给 TA', icon: 'phone' },
  { id: 'dice', title: '骰子', desc: '摇一把', icon: 'dice' },
  { id: 'rps', title: '猜拳', desc: '来一局', icon: 'hand' },
  { id: 'mcp', title: 'MCP', desc: '外部工具', icon: 'web' },
  { id: 'quickReplyManage', title: '编辑快捷回复', desc: '添加或删改', icon: 'edit' }
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
    currentY: 0,
    dragging: false,
    direction: null
  }
};

// ═══════════════════════════════════════
// 【快捷回复】读取和保存用户自定义内容
// ═══════════════════════════════════════

export function getQuickReplies() {
  const raw = getData(QUICK_REPLIES_KEY);
  if (Array.isArray(raw)) return raw.filter((r) => r && r.text);
  return [];
}

export function saveQuickReplies(list) {
  const clean = Array.isArray(list)
    ? list
        .filter((r) => r && r.text)
        .map((r, i) => ({
          id: r.id || `qr_${Date.now()}_${i}`,
          text: String(r.text).trim()
        }))
        .filter((r) => r.text)
    : [];
  setData(QUICK_REPLIES_KEY, clean);
  return clean;
}

export function addQuickReply(text) {
  const list = getQuickReplies();
  list.push({ id: `qr_${Date.now()}`, text: String(text).trim() });
  return saveQuickReplies(list);
}

export function removeQuickReply(id) {
  const list = getQuickReplies().filter((r) => r.id !== id);
  return saveQuickReplies(list);
}

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
// 【列表页】横向滑动工具抽屉
// ═══════════════════════════════════════

function renderListPage() {
  if (!state.rootEl) return;

  const header = el('div', 'thread-tools-header');
  header.append(
    el('div', 'thread-tools-title', '小工具箱')
  );

  const scrollWrap = el('div', 'thread-tools-drawer');
  scrollWrap.setAttribute('dir', 'ltr');

  DEFAULT_TOOLS.forEach((item) => {
    scrollWrap.append(createDrawerCard(item));
  });

  state.rootEl.append(header, scrollWrap);
}

// ───────────────────
// 横向抽屉卡片
// ───────────────────

function createDrawerCard(item) {
  const card = el('button', 'thread-drawer-card');
  card.type = 'button';

  const icon = el('span', 'thread-drawer-icon');
  icon.appendChild(createIcon(item.icon || 'message', 20));

  const title = el('span', 'thread-drawer-title', item.title || '');

  card.append(icon, title);

  card.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    handleToolTap(item);
  });

  return card;
}
// ───────────────────
// 工具点击
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
// 内联动作
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
  const tool = DEFAULT_TOOLS.find((t) => t.id === toolId);

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

  if (toolId === 'quickReply') {
    renderQuickReplyPicker(container);
    return;
  }

  if (toolId === 'quickReplyManage') {
    renderQuickReplyManager(container);
    return;
  }

  const routes = {
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
// 快捷回复选择器：不依赖 thread-sheets，直接展示并发送
// ───────────────────

function renderQuickReplyPicker(container) {
  const replies = getQuickReplies();

  if (!replies.length) {
    const empty = el('div', 'thread-tools-empty');
    empty.textContent = '';
    const tip = el('div', 'qr-empty-tip', '还没有快捷回复');
    const hint = el('div', 'qr-empty-hint', '去「编辑快捷回复」添加几个吧');
    empty.append(tip, hint);
    container.append(empty);
    return;
  }

  const list = el('div', 'qr-picker-list');

  replies.forEach((item) => {
    const btn = el('button', 'qr-picker-item');
    btn.type = 'button';
    btn.textContent = item.text;

    btn.addEventListener('click', async () => {
      if (!state.chatState) return;
      try {
        const { sendThreadMessage } = await import('./thread-actions.js');
        await sendThreadMessage(state.chatState, item.text);
        showToast('发送成功');
      } catch (error) {
        console.error('[thread-tools] quick reply send failed', error);
        showToast('发送没成功');
      }
    });

    list.append(btn);
  });

  container.append(list);
}

// ───────────────────
// 快捷回复管理页面
// ───────────────────

function renderQuickReplyManager(container) {
  const list = getQuickReplies();

  const tip = el('div', 'qr-manage-tip', '长按或点右边删掉，输入框里添加新的');
  container.append(tip);

  const addRow = el('div', 'qr-add-row');

  const input = document.createElement('input');
  input.className = 'qr-add-input';
  input.type = 'text';
  input.placeholder = '输入新的快捷短句...';
  input.autocomplete = 'off';
  input.setAttribute('spellcheck', 'false');

  const addBtn = el('button', 'qr-add-btn');
  addBtn.type = 'button';
  addBtn.append(createIcon('add', 16));

  addBtn.addEventListener('click', () => {
    const text = String(input.value || '').trim();
    if (!text) {
      showToast('还没输入内容');
      return;
    }
    addQuickReply(text);
    input.value = '';
    showToast('添加成功');
    refreshQuickReplyList(listWrap);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      addBtn.click();
    }
  });

  addRow.append(input, addBtn);
  container.append(addRow);

  const listWrap = el('div', 'qr-list-wrap');
  container.append(listWrap);

  refreshQuickReplyList(listWrap);
}

// ───────────────────
// 刷新快捷回复列表
// ───────────────────

function refreshQuickReplyList(container) {
  const list = getQuickReplies();
  container.replaceChildren();

  if (!list.length) {
    container.append(el('div', 'thread-tools-empty', '还没有快捷回复，添加一个试试'));
    return;
  }

  list.forEach((item) => {
    const row = el('div', 'qr-item');

    const text = el('span', 'qr-item-text', item.text);

    const delBtn = el('button', 'qr-item-del');
    delBtn.type = 'button';
    delBtn.setAttribute('aria-label', '删除');
    delBtn.appendChild(createIcon('close', 14));

    delBtn.addEventListener('click', () => {
      removeQuickReply(item.id);
      showToast('删掉了');
      refreshQuickReplyList(container);
    });

    row.append(text, delBtn);
    container.append(row);
  });
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
// 【滑动手势】横向滑动切换
// ═══════════════════════════════════════

function setupSwipe(container) {
  if (!container) return;

  const onStart = (event) => {
    const touch = event.touches ? event.touches[0] : event;
    state.touch.startX = touch.clientX;
    state.touch.startY = touch.clientY;
    state.touch.currentX = touch.clientX;
    state.touch.currentY = touch.clientY;
    state.touch.dragging = true;
    state.touch.direction = null;
  };

  const onMove = (event) => {
    if (!state.touch.dragging) return;

    const touch = event.touches ? event.touches[0] : event;
    const dx = touch.clientX - state.touch.startX;
    const dy = touch.clientY - state.touch.startY;

    state.touch.currentX = touch.clientX;
    state.touch.currentY = touch.clientY;

    if (!state.touch.direction) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
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

    if (state.touch.direction === 'h') {
      const dx = state.touch.currentX - state.touch.startX;
      if (dx > 60 && state.currentPage === 'sub') {
        goBackToList();
      }
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
// 【样式】横向抽屉、子页面、快捷回复管理
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

    /* ── 横向抽屉 ── */
    .thread-tools-drawer{
      display:flex;
      flex-direction:row;
      flex-wrap:nowrap;
      gap:10px;
      padding:0 20px;
      overflow-x:auto;
      overflow-y:hidden;
      -webkit-overflow-scrolling:touch;
      overscroll-behavior-x:contain;
      scroll-snap-type:x mandatory;
      scrollbar-width:none;
    }

    .thread-tools-drawer::-webkit-scrollbar{
      display:none;
    }

    .thread-drawer-card{
      flex:0 0 auto;
      width:82px;
      min-height:82px;
      display:flex;
      flex-direction:column;
      align-items:center;
      justify-content:center;
      gap:8px;
      padding:14px 8px;
      border-radius:20px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      scroll-snap-align:start;
      transition:transform 180ms ease;
    }

    .thread-drawer-card:active{
      transform:scale(.94);
    }

    .thread-drawer-icon{
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

    .thread-drawer-title{
      color:var(--text-primary);
      font-size:12px;
      font-weight:500;
      line-height:1.35;
      white-space:nowrap;
      overflow:hidden;
      text-overflow:ellipsis;
      max-width:68px;
      text-align:center;
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

    /* ── 快捷回复选择器 ── */
    .qr-picker-list{
      display:flex;
      flex-direction:column;
      gap:8px;
    }

    .qr-picker-item{
      width:100%;
      min-height:48px;
      padding:12px 16px;
      border-radius:16px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font-size:15px;
      line-height:1.55;
      text-align:left;
      transition:transform 180ms ease;
    }

    .qr-picker-item:active{
      transform:scale(.97);
    }

    .qr-empty-tip{
      color:var(--text-primary);
      font-size:15px;
      font-weight:500;
      line-height:1.55;
      margin-bottom:6px;
    }

    .qr-empty-hint{
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.55;
    }

    /* ── 快捷回复管理 ── */
    .qr-manage-tip{
      margin-bottom:14px;
      padding:12px 14px;
      border-radius:16px;
      background:var(--surface-muted);
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.55;
    }

    .qr-add-row{
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      align-items:center;
      gap:8px;
      margin-bottom:14px;
    }

    .qr-add-input{
      width:100%;
      min-height:44px;
      padding:0 12px;
      border-radius:16px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font-size:15px;
      line-height:1.6;
      -webkit-appearance:none;
      appearance:none;
    }

    .qr-add-btn{
      width:44px;
      height:44px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:16px;
      background:var(--accent);
      color:var(--bubble-user-text);
      box-shadow:var(--shadow-sm);
      transition:transform 180ms ease;
    }

    .qr-add-btn:active{
      transform:scale(.94);
    }

    .qr-list-wrap{
      display:flex;
      flex-direction:column;
      gap:8px;
    }

    .qr-item{
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      align-items:center;
      gap:10px;
      min-height:48px;
      padding:10px 14px;
      border-radius:16px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
    }

    .qr-item-text{
      min-width:0;
      color:var(--text-primary);
      font-size:15px;
      line-height:1.55;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .qr-item-del{
      width:34px;
      height:34px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      background:var(--surface-muted);
      color:var(--text-secondary);
      flex:0 0 auto;
      transition:transform 180ms ease;
    }

    .qr-item-del:active{
      transform:scale(.9);
    }

    /* ── 响应式 ── */
    @media(max-width:430px){
      .thread-drawer-card{
        width:74px;
        min-height:74px;
        padding:12px 6px;
      }

      .thread-drawer-title{
        max-width:62px;
        font-size:11px;
      }
    }

    @media(prefers-reduced-motion:reduce){
      .thread-drawer-card,
      .thread-tools-back-btn,
      .qr-add-btn,
      .qr-item-del,
      .qr-picker-item{
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/ui.js(createIcon,showToast)；../../core/storage.js(getData,setData)；./thread-sheets.js(openMoodSheet,openRelaySheet,openTransferSheet,openClearContextSheet,openMcpSheet,openVoiceTextSheet,openRelationshipSheet)；./thread-call.js(mountThreadCall)；./thread-actions.js(sendDiceMessage,sendRpsMessage)
