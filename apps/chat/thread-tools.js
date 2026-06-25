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

const DEFAULT_TOOLS = [
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

const toolState = {
  rootEl: null,
  state: null,
  options: null,
  currentView: 'grid',
  currentTool: null
};

// ═══════════════════════════════════════
// 【工具宫格】横向滑动两行图标工具入口
// ═══════════════════════════════════════

export function createThreadToolsGrid(state, options = {}) {
  injectStyle();

  toolState.state = state;
  toolState.options = options;
  toolState.currentView = 'grid';
  toolState.currentTool = null;

  const root = el('section', 'thread-tools-panel');
  toolState.rootEl = root;

  root.append(createToolGridView());
  return root;
}

// ───────────────────
// 工具宫格主界面
// ───────────────────

function createToolGridView() {
  const view = el('div', 'thread-tools-grid-view');

  const header = el('div', 'thread-tools-header');
  header.append(
    el('div', 'thread-tools-title', toolState.options?.title || '小工具'),
    el('div', 'thread-tools-subtitle', toolState.options?.subtitle || '横向滑一滑')
  );

  const scroller = el('div', 'thread-tools-scroller');
  const grid = el('div', 'thread-tools-grid');

  const tools = normalizeList(toolState.options?.tools || DEFAULT_TOOLS);

  tools.forEach((item) => {
    const button = el('button', 'thread-tool-card');
    button.type = 'button';

    const icon = el('span', 'thread-tool-icon');
    icon.appendChild(createIcon(item.icon || 'message', 18));

    const text = el('span', 'thread-tool-text');
    text.append(
      el('span', 'thread-tool-title', item.title || ''),
      el('span', 'thread-tool-desc', item.desc || '')
    );

    button.append(icon, text);
    button.addEventListener('click', () => handleToolClick(item), { passive: true });

    grid.append(button);
  });

  scroller.append(grid);
  view.append(header, scroller);
  return view;
}

// ───────────────────
// 工具详情页
// ───────────────────

function createToolDetailView(item) {
  const view = el('div', 'thread-tools-detail-view');

  const header = el('div', 'thread-tools-detail-header');

  const back = iconButton('arrow-left', '返回');
  back.addEventListener('click', () => switchToGrid(), { passive: true });

  header.append(
    back,
    el('div', 'thread-tools-detail-title', item?.title || '工具'),
    el('div', 'thread-tools-detail-spacer')
  );

  const body = el('div', 'thread-tools-detail-body');
  body.append(el('div', 'thread-tools-detail-empty', '加载中'));

  view.append(header, body);
  return view;
}

function switchToGrid() {
  toolState.currentView = 'grid';
  toolState.currentTool = null;

  if (!toolState.rootEl) return;
  toolState.rootEl.replaceChildren(createToolGridView());
}

function switchToDetail(item) {
  toolState.currentView = 'detail';
  toolState.currentTool = item;

  if (!toolState.rootEl) return;
  toolState.rootEl.replaceChildren(createToolDetailView(item));
}

// ═══════════════════════════════════════
// 【工具点击】根据类型打开抽屉或执行动作
// ═══════════════════════════════════════

async function handleToolClick(item) {
  const id = String(item?.id || '').trim();
  if (!id) return;

  const state = toolState.state;
  const options = toolState.options || {};

  if (typeof options.onPick === 'function') {
    const handled = await options.onPick(item, state);
    if (handled) return;
  }

  if (id === 'quickReply') {
    switchToDetail(item);
    await openQuickReplySheet(state, options.quickReply || {});
    return;
  }

  if (id === 'mood') {
    switchToDetail(item);
    await openMoodSheet(state, options.mood || {});
    return;
  }

  if (id === 'relay') {
    switchToDetail(item);
    await openRelaySheet(state, options.relay || {});
    return;
  }

  if (id === 'transfer') {
    switchToDetail(item);
    await openTransferSheet(state, options.transfer || {});
    return;
  }

  if (id === 'clearContext') {
    switchToDetail(item);
    await openClearContextSheet(state, options.clearContext || {});
    return;
  }

  if (id === 'mcp') {
    switchToDetail(item);
    await openMcpSheet(state, options.mcp || {});
    return;
  }

  if (id === 'voiceText') {
    switchToDetail(item);
    await openVoiceTextSheet(state, options.voiceText || {});
    return;
  }

  if (id === 'relationship') {
    switchToDetail(item);
    await openRelationshipSheet(state, options.relationship || {});
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

  if (id === 'dice') {
    await sendDiceMessage(state, { triggerAI: true });
    return;
  }

  if (id === 'rps') {
    await sendRpsMessage(state, { triggerAI: true });
    return;
  }

  showToast('这个工具还没接好');
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
// 【工具函数】数组、DOM
// ═══════════════════════════════════════

function normalizeList(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// ═══════════════════════════════════════
// 【样式】工具宫格、横向滑动、详情页和按钮反馈
// ═══════════════════════════════════════

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .thread-tools-panel{
      display:flex;
      flex-direction:column;
      min-height:0;
      color:var(--text-primary);
    }

    .thread-tools-grid-view,
    .thread-tools-detail-view{
      display:flex;
      flex-direction:column;
      gap:14px;
      padding:6px 20px 20px;
    }

    .thread-tools-header{
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

    .thread-tools-scroller{
      overflow-x:auto;
      overflow-y:hidden;
      -webkit-overflow-scrolling:touch;
      overscroll-behavior-x:contain;
      padding-bottom:4px;
    }

    .thread-tools-grid{
      display:grid;
      grid-template-columns:repeat(auto-fill,minmax(152px,1fr));
      grid-auto-flow:column;
      grid-template-rows:repeat(2,minmax(0,1fr));
      gap:10px;
      width:max-content;
      min-width:100%;
    }

    .thread-tool-card{
      min-width:152px;
      min-height:76px;
      display:grid;
      grid-template-columns:auto minmax(0,1fr);
      align-items:center;
      gap:10px;
      padding:12px;
      border-radius:20px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      text-align:left;
      transition:transform 200ms ease;
    }

    .thread-tool-card:active{
      transform:scale(.96);
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
      gap:4px;
    }

    .thread-tool-title{
      color:var(--text-primary);
      font-size:14px;
      font-weight:600;
      line-height:1.35;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .thread-tool-desc{
      color:var(--text-secondary);
      font-size:12px;
      line-height:1.45;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .thread-tools-detail-header{
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto;
      align-items:center;
      gap:12px;
    }

    .thread-tools-detail-title{
      color:var(--text-primary);
      font-size:17px;
      font-weight:600;
      line-height:1.35;
      text-align:center;
    }

    .thread-tools-detail-spacer{
      width:44px;
      height:44px;
    }

    .thread-tools-icon-btn{
      width:44px;
      height:44px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:16px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      transition:transform 200ms ease;
    }

    .thread-tools-icon-btn:active{
      transform:scale(.96);
    }

    .thread-tools-detail-body{
      min-height:240px;
      display:flex;
      align-items:center;
      justify-content:center;
      border-radius:24px;
      background:var(--bg-card);
      box-shadow:var(--shadow-sm);
    }

    .thread-tools-detail-empty{
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.6;
      text-align:center;
    }

    @media(max-width:430px){
      .thread-tools-grid{
        grid-template-columns:repeat(auto-fill,minmax(140px,1fr));
      }

      .thread-tool-card{
        min-width:140px;
      }
    }

    @media(prefers-reduced-motion:reduce){
      .thread-tool-card,
      .thread-tools-icon-btn{
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/ui.js(createIcon,showToast)；./thread-sheets.js(openQuickReplySheet,openMoodSheet,openRelaySheet,openTransferSheet,openClearContextSheet,openMcpSheet,openVoiceTextSheet,openRelationshipSheet)；./thread-call.js(mountThreadCall)；./thread-actions.js(sendDiceMessage,sendRpsMessage)
