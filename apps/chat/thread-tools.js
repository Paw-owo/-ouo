// apps/chat/thread-tools.js
// imports:
//   from '../../core/ui.js': createIcon, showToast
//   from './thread-sheets.js': openMoodSheet, openRelaySheet, openClearContextSheet, openMcpSheet, openRelationshipSheet
//   from './thread-call.js': mountThreadCall
//   from './thread-actions.js': sendDiceMessage, sendRpsMessage

import { createIcon, showToast } from '../../core/ui.js';

import {
  openMoodSheet,
  openRelaySheet,
  openClearContextSheet,
  openMcpSheet,
  openRelationshipSheet
} from './thread-sheets.js';

import { mountThreadCall } from './thread-call.js';
import { sendDiceMessage, sendRpsMessage } from './thread-actions.js';

const STYLE_ID = 'chat-thread-tools-style';

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
// 【工具宫格】两排横向滑动小图标，点工具原地切换详情
// ═══════════════════════════════════════

export function createThreadToolsGrid(state, options = {}) {
  injectStyle();

  const tools = normalizeArray(options.tools || DEFAULT_TOOLS);
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
  header.append(titleWrap);

  const scroll = el('div', 'thread-tools-scroll');
  const row1 = el('div', 'thread-tools-row');
  const row2 = el('div', 'thread-tools-row');

  tools.forEach((item, index) => {
    const button = createToolIcon(item);
    button.addEventListener('click', async () => {
      await handleToolClick(state, item, options, root, detailView, gridView);
    });

    if (index % 2 === 0) {
      row1.append(button);
    } else {
      row2.append(button);
    }
  });

  scroll.append(row1, row2);
  gridView.append(header, scroll);

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

  // ── 直接执行的工具（不需要打开详情页）──

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

  // ── 需要打开详情的工具 ──

  const detailBody = detailView.querySelector('.thread-tools-detail-body');
  if (!detailBody) return;

  switchToDetail(root, detailView, gridView, item.title || '详情');

  if (id === 'quickReply') {
    renderQuickReplyDetail(detailBody, state, options);
    return;
  }

  if (id === 'mood') {
    openMoodSheet(state, options.mood || {});
    switchToGrid(root, detailView, gridView);
    return;
  }

  if (id === 'relay') {
    openRelaySheet(state, options.relay || {});
    switchToGrid(root, detailView, gridView);
    return;
  }

  if (id === 'transfer') {
    renderTransferDetail(detailBody, state, options);
    return;
  }

  if (id === 'voiceText') {
    renderVoiceTextDetail(detailBody, state, options);
    return;
  }

  if (id === 'clearContext') {
    openClearContextSheet(state, options.clearContext || {});
    switchToGrid(root, detailView, gridView);
    return;
  }

  if (id === 'mcp') {
    openMcpSheet(state, options.mcp || {});
    switchToGrid(root, detailView, gridView);
    return;
  }

  if (id === 'relationship') {
    openRelationshipSheet(state, options.relationship || {});
    switchToGrid(root, detailView, gridView);
    return;
  }

  // ── 未接好的工具 ──

  switchToGrid(root, detailView, gridView);
  showToast('这个工具还没接好');
}

// ═══════════════════════════════════════
// 【详情渲染】快捷回复列表
// ═══════════════════════════════════════

function renderQuickReplyDetail(container, state, options) {
  container.replaceChildren();

  const replies = [
    '嗯嗯，我在听',
    '继续说呀',
    '然后呢？',
    '想你了',
    '晚安，明天见',
    '你说得对',
    '我也不知道',
    '好的好的'
  ];

  const grid = el('div', 'tool-detail-reply-grid');

  replies.forEach((text) => {
    const btn = el('button', 'tool-detail-reply-btn', text);
    btn.type = 'button';
    btn.addEventListener('click', async () => {
      if (typeof options.quickReply?.send === 'function') {
        await options.quickReply.send(text);
      } else if (typeof options.onSend === 'function') {
        await options.onSend(text);
      }
      showToast('发出去啦');
    });
    grid.append(btn);
  });

  container.append(
    el('div', 'tool-detail-hint', '点一下直接发送'),
    grid
  );
}

// ═══════════════════════════════════════
// 【详情渲染】转账金额输入
// ═══════════════════════════════════════

function renderTransferDetail(container, state, options) {
  container.replaceChildren();

  const hint = el('div', 'tool-detail-hint', '输入金额，点发送');

  const input = document.createElement('input');
  input.className = 'tool-detail-input';
  input.type = 'number';
  input.placeholder = '金额';
  input.min = '1';
  input.step = '1';

  const note = document.createElement('input');
  note.className = 'tool-detail-input';
  note.type = 'text';
  note.placeholder = '备注（可选）';

  const send = el('button', 'tool-detail-primary-btn', '转账');
  send.type = 'button';
  send.addEventListener('click', async () => {
    const amount = Number(input.value);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('金额不对');
      return;
    }

    if (typeof options.transfer?.send === 'function') {
      await options.transfer.send({ amount, note: note.value.trim() });
    } else if (typeof options.onTransfer === 'function') {
      await options.onTransfer({ amount, note: note.value.trim() });
    }
    showToast('转账发出去啦');
  });

  container.append(hint, input, note, send);
}

// ═══════════════════════════════════════
// 【详情渲染】语音文字输入
// ═══════════════════════════════════════

function renderVoiceTextDetail(container, state, options) {
  container.replaceChildren();

  const hint = el('div', 'tool-detail-hint', '输入文字，发成语音消息');

  const textarea = document.createElement('textarea');
  textarea.className = 'tool-detail-textarea';
  textarea.placeholder = '写点什么，TA 会读出来';
  textarea.rows = 4;
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('spellcheck', 'false');

  const send = el('button', 'tool-detail-primary-btn', '发送语音');
  send.type = 'button';
  send.addEventListener('click', async () => {
    const text = textarea.value.trim();
    if (!text) {
      showToast('还没有写内容');
      return;
    }

    if (typeof options.voiceText?.send === 'function') {
      await options.voiceText.send(text);
    } else if (typeof options.onVoiceText === 'function') {
      await options.onVoiceText(text);
    }
    showToast('发出去啦');
  });

  container.append(hint, textarea, send);
}

// ═══════════════════════════════════════
// 【小图标按钮】两排里的单个工具
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
// 【工具函数】数组和 DOM
// ═══════════════════════════════════════

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
// 【样式】两排滑动图标、详情页、按钮反馈
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

    /* ── 图标网格层 ── */

    .thread-tools-header{
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

    .thread-tools-scroll{
      display:flex;
      flex-direction:column;
      gap:10px;
    }

    .thread-tools-row{
      display:flex;
      gap:10px;
      overflow-x:auto;
      overflow-y:hidden;
      padding-bottom:4px;
      scroll-snap-type:x proximity;
      -webkit-overflow-scrolling:touch;
      scrollbar-width:none;
    }

    .thread-tools-row::-webkit-scrollbar{
      display:none;
    }

    .thread-tool-icon-btn{
      flex:0 0 auto;
      width:68px;
      display:flex;
      flex-direction:column;
      align-items:center;
      gap:6px;
      padding:10px 0 8px;
      border-radius:18px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      transition:all 200ms ease;
      touch-action:manipulation;
      scroll-snap-align:start;
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
      max-width:60px;
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

    /* ── 详情内组件 ── */

    .tool-detail-hint{
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.5;
    }

    .tool-detail-input,
    .tool-detail-textarea{
      width:100%;
      min-height:44px;
      padding:10px 12px;
      border-radius:16px;
      background:var(--surface-muted);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:16px;
      line-height:1.6;
    }

    .tool-detail-textarea{
      min-height:96px;
      resize:none;
    }

    .tool-detail-primary-btn{
      width:100%;
      min-height:44px;
      padding:0 14px;
      border-radius:18px;
      background:var(--accent);
      color:var(--bubble-user-text);
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:14px;
      font-weight:600;
      transition:all 200ms ease;
      touch-action:manipulation;
    }

    .tool-detail-primary-btn:active{
      transform:scale(.96);
    }

    .tool-detail-reply-grid{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:8px;
    }

    .tool-detail-reply-btn{
      min-height:44px;
      padding:10px 12px;
      border-radius:16px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:14px;
      line-height:1.4;
      text-align:center;
      transition:all 200ms ease;
      touch-action:manipulation;
    }

    .tool-detail-reply-btn:active{
      transform:scale(.96);
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
        width:62px;
      }

      .tool-detail-reply-grid{
        grid-template-columns:1fr;
      }
    }

    @media(prefers-reduced-motion:reduce){
      .thread-tool-icon-btn,
      .thread-tools-icon-btn,
      .tool-detail-primary-btn,
      .tool-detail-reply-btn,
      .thread-tools-detail-view{
        animation:none;
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/ui.js(createIcon,showToast)；./thread-sheets.js(openMoodSheet,openRelaySheet,openClearContextSheet,openMcpSheet,openRelationshipSheet)；./thread-call.js(mountThreadCall)；./thread-actions.js(sendDiceMessage,sendRpsMessage)
