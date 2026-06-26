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

// ═══════════════════════════════════════
// 【工具面板】创建两行横向滑动的工具面板
// ═══════════════════════════════════════

export function createThreadToolsGrid(state, options = {}) {
  injectStyle();

  const tools = options.tools || DEFAULT_TOOLS;
  const root = el('section', 'thread-tools-panel');

  // ───────────────────
  // 顶部栏：关闭按钮 + 标题
  // ───────────────────
  const header = el('div', 'thread-tools-header');

  const closeBtn = el('button', 'thread-tools-close-btn');
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', '关闭工具');
  closeBtn.append(createIcon('chevron-down', 20));
  closeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof options.onClose === 'function') options.onClose();
  });

  const titleWrap = el('div', 'thread-tools-title-wrap');
  titleWrap.append(
    el('div', 'thread-tools-title', options.title || '小工具'),
    el('div', 'thread-tools-subtitle', options.subtitle || '滑一滑看看')
  );

  header.append(closeBtn, titleWrap);

  // ───────────────────
  // 横向滚动区域：两行连续排列
  // ───────────────────
  const slider = el('div', 'thread-tools-slider');

  tools.forEach((item) => {
    const btn = el('button', 'thread-tool-card');
    btn.type = 'button';

    const iconWrap = el('span', 'thread-tool-icon');
    iconWrap.append(createIcon(item.icon || 'message', 18));

    const textWrap = el('span', 'thread-tool-text');
    textWrap.append(
      el('span', 'thread-tool-title', item.title || ''),
      el('span', 'thread-tool-desc', item.desc || '')
    );

    btn.append(iconWrap, textWrap);
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleToolClick(state, item, options);
    });

    slider.append(btn);
  });

  // ───────────────────
  // 底部渐变提示
  // ───────────────────
  const fade = el('div', 'thread-tools-fade');
  fade.textContent = '← 滑动查看更多 →';

  root.append(header, slider, fade);
  return root;
}

// ═══════════════════════════════════════
// 【工具执行】点击工具后执行对应操作
// ═══════════════════════════════════════

async function handleToolClick(state, item, options) {
  const id = String(item?.id || '').trim();
  if (!id) return;

  if (typeof options.onPick === 'function') {
    const handled = await options.onPick(item, state);
    if (handled) return;
  }

  const sheetOpts = { ...options, fromTools: true };

  switch (id) {
    case 'quickReply': return openQuickReplySheet(state, sheetOpts);
    case 'mood': return openMoodSheet(state, sheetOpts);
    case 'relay': return openRelaySheet(state, sheetOpts);
    case 'transfer': return openTransferSheet(state, sheetOpts);
    case 'clearContext': return openClearContextSheet(state, sheetOpts);
    case 'mcp': return openMcpSheet(state, sheetOpts);
    case 'voiceText': return openVoiceTextSheet(state, sheetOpts);
    case 'relationship': return openRelationshipSheet(state, sheetOpts);
    case 'call':
      return mountThreadCall(document.body, {
        state,
        character: state?.character || null,
        characterId: state?.characterId || '',
        close: typeof options.onCloseCall === 'function' ? options.onCloseCall : null,
        onReject: typeof options.onRejectCall === 'function' ? options.onRejectCall : null
      });
    case 'dice':
      return sendDiceMessage(state, { triggerAI: true });
    case 'rps':
      return sendRpsMessage(state, { triggerAI: true });
    default:
      showToast('这个工具还没接好');
  }
}

// ═══════════════════════════════════════
// 【工具函数】DOM 创建
// ═══════════════════════════════════════

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// ═══════════════════════════════════════
// 【样式】两行横向滑动工具面板
// ═══════════════════════════════════════

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .thread-tools-panel{
      display:flex;
      flex-direction:column;
      gap:0;
      color:var(--text-primary);
      user-select:none;
      -webkit-user-select:none;
    }

    .thread-tools-header{
      display:flex;
      align-items:center;
      gap:12px;
      padding:6px 20px 14px;
    }

    .thread-tools-close-btn{
      width:36px;
      height:36px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      background:var(--bg-card);
      color:var(--text-secondary);
      box-shadow:var(--shadow-sm);
      transition:all 200ms ease;
      flex-shrink:0;
    }

    .thread-tools-close-btn:active{
      transform:scale(.92);
      opacity:.8;
    }

    .thread-tools-title-wrap{
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:2px;
    }

    .thread-tools-title{
      color:var(--text-primary);
      font-size:17px;
      font-weight:600;
      line-height:1.35;
    }

    .thread-tools-subtitle{
      color:var(--text-hint);
      font-size:12px;
      line-height:1.4;
    }

    .thread-tools-slider{
      display:grid;
      grid-template-rows:1fr 1fr;
      grid-auto-flow:column;
      grid-auto-columns:minmax(140px, 1fr);
      gap:10px;
      overflow-x:auto;
      overflow-y:hidden;
      -webkit-overflow-scrolling:touch;
      overscroll-behavior-x:contain;
      scrollbar-width:none;
      -ms-overflow-style:none;
      padding:0 20px;
      scroll-snap-type:x proximity;
    }

    .thread-tools-slider::-webkit-scrollbar{
      display:none;
    }

    .thread-tool-card{
      min-height:72px;
      display:grid;
      grid-template-columns:auto minmax(0,1fr);
      align-items:center;
      gap:10px;
      padding:12px;
      border-radius:18px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      text-align:left;
      transition:transform 180ms ease, opacity 180ms ease;
      -webkit-tap-highlight-color:transparent;
      scroll-snap-align:start;
    }

    .thread-tool-card:active{
      transform:scale(.96);
      opacity:.85;
    }

    .thread-tool-icon{
      width:36px;
      height:36px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:12px;
      background:var(--surface-muted);
      color:var(--accent);
      flex-shrink:0;
    }

    .thread-tool-text{
      min-width:0;
      display:flex;
      flex-direction:column;
      gap:2px;
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
      line-height:1.4;
      overflow:hidden;
      white-space:nowrap;
      text-overflow:ellipsis;
    }

    .thread-tools-fade{
      padding:12px 20px 6px;
      color:var(--text-hint);
      font-size:11px;
      line-height:1.4;
      text-align:center;
      opacity:.6;
    }

    @media(prefers-reduced-motion:reduce){
      .thread-tools-close-btn,
      .thread-tool-card{
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/ui.js(createIcon,showToast)；./thread-sheets.js(openQuickReplySheet,openMoodSheet,openRelaySheet,openTransferSheet,openClearContextSheet,openMcpSheet,openVoiceTextSheet,openRelationshipSheet)；./thread-call.js(mountThreadCall)；./thread-actions.js(sendDiceMessage,sendRpsMessage)
