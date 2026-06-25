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

const DEFAULT_TOOL_PAGES = [
  [
    { id: 'quickReply', title: '快捷回复', desc: '一键发短句', icon: 'message' },
    { id: 'mood', title: '心情', desc: '发点情绪', icon: 'heart' },
    { id: 'relay', title: '接龙', desc: '把话题丢出去', icon: 'repeat' },
    { id: 'transfer', title: '转账', desc: '发小卡片', icon: 'wallet' }
  ],
  [
    { id: 'voiceText', title: '语音文字', desc: '先发文字', icon: 'mic' },
    { id: 'clearContext', title: '清上下文', desc: '收短一点', icon: 'trash' },
    { id: 'relationship', title: '关系锁', desc: '看当前状态', icon: 'lock' },
    { id: 'call', title: '电话', desc: '打给 TA', icon: 'phone' }
  ],
  [
    { id: 'dice', title: '骰子', desc: '摇一把', icon: 'dice' },
    { id: 'rps', title: '猜拳', desc: '来一局', icon: 'hand' },
    { id: 'mcp', title: 'MCP', desc: '外部工具', icon: 'web' }
  ]
];

// ═══════════════════════════════════════
// 【工具宫格】渲染分页工具入口
// ═══════════════════════════════════════

export function createThreadToolsGrid(state, options = {}) {
  injectStyle();

  const pages = normalizePages(options.pages || DEFAULT_TOOL_PAGES);
  const startPage = clampNumber(options.startPage || 0, 0, Math.max(0, pages.length - 1));
  const root = el('section', 'thread-tools-panel');

  const header = el('div', 'thread-tools-header');
  const titleWrap = el('div', 'thread-tools-title-wrap');
  titleWrap.append(
    el('div', 'thread-tools-title', options.title || '小工具'),
    el('div', 'thread-tools-subtitle', options.subtitle || '点一下才会展开。')
  );

  const pager = el('div', 'thread-tools-pager');
  const pageLabel = el('span', 'thread-tools-page-label', '');

  const prev = iconButton('chevron-left');
  const next = iconButton('chevron-right');

  pager.append(prev, pageLabel, next);
  header.append(titleWrap, pager);

  const body = el('div', 'thread-tools-body');

  let currentPage = startPage;

  const renderPage = () => {
    const page = pages[currentPage] || [];
    pageLabel.textContent = `${currentPage + 1}/${pages.length}`;
    body.replaceChildren(createToolGrid(state, page, options));
    prev.disabled = currentPage <= 0;
    next.disabled = currentPage >= pages.length - 1;
  };

  prev.addEventListener('click', () => {
    if (currentPage <= 0) return;
    currentPage -= 1;
    renderPage();
  });

  next.addEventListener('click', () => {
    if (currentPage >= pages.length - 1) return;
    currentPage += 1;
    renderPage();
  });

  root.append(header, body);
  renderPage();

  return root;
}

// ═══════════════════════════════════════
// 【工具点击】根据类型打开抽屉或执行动作
// ═══════════════════════════════════════

function createToolGrid(state, items, options = {}) {
  const grid = el('div', 'thread-tools-grid');

  if (!items.length) {
    grid.append(createEmptyTip('这里还没有工具。'));
    return grid;
  }

  items.forEach((item) => {
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
    button.addEventListener('click', async () => {
      await handleToolClick(state, item, options);
    });

    grid.append(button);
  });

  return grid;
}

async function handleToolClick(state, item, options) {
  const id = String(item?.id || '').trim();

  if (!id) return;

  if (typeof options.onPick === 'function') {
    const handled = await options.onPick(item, state);
    if (handled) return;
  }

  if (id === 'quickReply') return openQuickReplySheet(state, options.quickReply || {});
  if (id === 'mood') return openMoodSheet(state, options.mood || {});
  if (id === 'relay') return openRelaySheet(state, options.relay || {});
  if (id === 'transfer') return openTransferSheet(state, options.transfer || {});
  if (id === 'clearContext') return openClearContextSheet(state, options.clearContext || {});
  if (id === 'mcp') return openMcpSheet(state, options.mcp || {});
  if (id === 'voiceText') return openVoiceTextSheet(state, options.voiceText || {});
  if (id === 'relationship') return openRelationshipSheet(state, options.relationship || {});
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
    await sendDiceMessage(state, {
      triggerAI: true
    });
    return;
  }

  if (id === 'rps') {
    await sendRpsMessage(state, {
      triggerAI: true
    });
    return;
  }

  showToast('这个工具还没接好');
}

// ═══════════════════════════════════════
// 【公共组件】图标按钮和空状态
// ═══════════════════════════════════════

function iconButton(iconName) {
  const button = el('button', 'thread-tools-pager-btn');
  button.type = 'button';
  button.appendChild(createIcon(iconName, 18));
  return button;
}

function createEmptyTip(text) {
  return el('div', 'thread-tools-empty', text || '');
}

// ═══════════════════════════════════════
// 【工具函数】分页、数组、DOM
// ═══════════════════════════════════════

function normalizePages(value) {
  const pages = Array.isArray(value) ? value : [];
  return pages.map((page) => Array.isArray(page) ? page.filter(Boolean) : []).filter((page) => page.length);
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// ═══════════════════════════════════════
// 【样式】工具宫格、分页和按钮反馈
// ═══════════════════════════════════════

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .thread-tools-panel{
      display:flex;
      flex-direction:column;
      gap:14px;
      padding:6px 20px 20px;
      color:var(--text-primary);
    }

    .thread-tools-header{
      display:grid;
      grid-template-columns:minmax(0,1fr) auto;
      align-items:center;
      gap:12px;
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

    .thread-tools-pager{
      display:inline-flex;
      align-items:center;
      gap:8px;
    }

    .thread-tools-page-label{
      min-width:52px;
      text-align:center;
      color:var(--text-secondary);
      font-size:12px;
      line-height:1.4;
    }

    .thread-tools-pager-btn{
      width:38px;
      height:38px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      transition:all 200ms ease;
    }

    .thread-tools-pager-btn:active,
    .thread-tool-card:active{
      transform:scale(.96);
    }

    .thread-tools-pager-btn:disabled{
      opacity:.45;
    }

    .thread-tools-body{
      min-height:0;
    }

    .thread-tools-grid{
      display:grid;
      grid-template-columns:repeat(2,minmax(0,1fr));
      gap:10px;
    }

    .thread-tool-card{
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
      transition:all 200ms ease;
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

    .thread-tools-empty{
      padding:18px 12px;
      border-radius:18px;
      background:var(--surface-muted);
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.6;
      text-align:center;
    }

    @media(max-width:430px){
      .thread-tools-grid{
        grid-template-columns:1fr;
      }
    }

    @media(prefers-reduced-motion:reduce){
      .thread-tools-pager-btn,
      .thread-tool-card{
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/ui.js(createIcon,showToast)；./thread-sheets.js(openQuickReplySheet,openMoodSheet,openRelaySheet,openTransferSheet,openClearContextSheet,openMcpSheet,openVoiceTextSheet,openRelationshipSheet)；./thread-call.js(mountThreadCall)；./thread-actions.js(sendDiceMessage,sendRpsMessage)
