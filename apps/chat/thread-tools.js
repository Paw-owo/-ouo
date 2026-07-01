// apps/chat/thread-tools.js
// imports:
//   from '../../core/ui.js': showBottomSheet, hideBottomSheet, showToast
//   from '../../core/storage.js': getData, setData
//   from './thread-sheets.js': openTransferSheet, openClearContextSheet, openMcpSheet
//   from './thread-relationship.js': openRelationshipLockSheet
//   from './thread-actions.js': sendDiceMessage, sendRpsMessage
//   from './thread-mailbox.js': buildMailboxDetail
//   from '../../core/ai-phone-hub.js': getAllUnreadMailboxCount

import { showBottomSheet, hideBottomSheet, showToast } from '../../core/ui.js';
import { getData, setData } from '../../core/storage.js';
import { openTransferSheet, openClearContextSheet, openMcpSheet } from './thread-sheets.js';
import { openRelationshipLockSheet } from './thread-relationship.js';
import { sendDiceMessage, sendRpsMessage } from './thread-actions.js';
import { buildMailboxDetail } from './thread-mailbox.js';
import { getAllUnreadMailboxCount } from '../../core/ai-phone-hub.js';

const STYLE_ID = 'thread-tools-style-v2';

// ═══════════════════════════════════════
// 【工具列表】平坦排列，按 8 个一页滑页
// ═══════════════════════════════════════

const TOOLS = [
  { id: 'dice', title: '骰子', icon: 'dice' },
  { id: 'rps', title: '猜拳', icon: 'rps' },
  { id: 'quickReply', title: '快捷回复', icon: 'chat' },
  { id: 'transfer', title: '转账', icon: 'transfer' },
  { id: 'phone', title: '电话', icon: 'phone' },
  { id: 'mailbox', title: '信箱', icon: 'mailbox' },
  { id: 'clearCtx', title: '清上下文', icon: 'clean' },
  { id: 'relLock', title: '关系锁', icon: 'lock' },
  { id: 'mcp', title: 'MCP', icon: 'mcp' },
];

const TOOLS_PER_PAGE = 8;
const TOTAL_PAGES = Math.ceil(TOOLS.length / TOOLS_PER_PAGE);

// ═══════════════════════════════════════
// 【猫咪简笔画 SVG 图标】粗线条 stroke 2.5
// ═══════════════════════════════════════

const TOOL_ICONS = {
  chat: '<rect x="1" y="2.5" width="9" height="6.5" rx="3.5" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M3.5 9L2 12V9" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="4.5" cy="5.5" r="0.7" fill="currentColor"/><circle cx="7" cy="5.5" r="0.7" fill="currentColor"/><path d="M5 7.2C5.3 7.8 5.8 7.8 6 7.2C6.2 7.8 6.7 7.8 7 7.2" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="6" y="4.5" width="9" height="6.5" rx="3.5" fill="var(--bg-surface,#fff)" stroke="currentColor" stroke-width="2.5"/>',
  transfer: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2.5"/><text x="8" y="11" text-anchor="middle" font-size="8" font-weight="600" fill="currentColor" stroke="none">¥</text><circle cx="12.5" cy="3.5" r="0.7" fill="currentColor" opacity="0.3"/><circle cx="13.8" cy="5.2" r="0.7" fill="currentColor" opacity="0.3"/><circle cx="11.5" cy="2.5" r="0.7" fill="currentColor" opacity="0.3"/>',
  phone: '<path d="M3.5 2.5C3.5 1.5 4 1.5 5 1.5H7L8.5 5.5L6 7C6 7 7.5 10 10 12L12.5 9.5L15 11V13.5C15 14.5 14 15 13 15C7 15 1.5 9 1.5 3.5C1.5 2.5 2 2 3.5 2.5Z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>',
  dice: '<rect x="2" y="2" width="12" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="5" cy="5" r="1" fill="currentColor"/><circle cx="11" cy="5" r="1" fill="currentColor"/><circle cx="8" cy="8" r="1" fill="currentColor"/><circle cx="5" cy="11" r="1" fill="currentColor"/><circle cx="11" cy="11" r="1" fill="currentColor"/>',
  rps: '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="6" cy="7.5" r="0.8" fill="currentColor"/><circle cx="10" cy="7.5" r="0.8" fill="currentColor"/><path d="M6 10.5C6.8 11.5 7.5 11.5 8 10.5C8.5 11.5 9.2 11.5 10 10.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  clean: '<rect x="3" y="4" width="10" height="10.5" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><line x1="2" y1="4.5" x2="14" y2="4.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><path d="M6 4V2.5C6 1.8 6.8 1.5 8 1.5C9.2 1.5 10 1.8 10 2.5V4" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/><circle cx="6" cy="8.5" r="0.6" fill="currentColor"/><circle cx="10" cy="8.5" r="0.6" fill="currentColor"/><path d="M6.5 10.5C7 11.2 7.5 11.2 8 10.5C8.5 11.2 9 11.2 9.5 10.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>',
  lock: '<path d="M8 3L5.5 5.5C4 7 4 9.5 5.5 11L8 13.5L10.5 11C12 9.5 12 7 10.5 5.5L8 3Z" fill="currentColor" opacity="0.1" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/><circle cx="8" cy="8.5" r="1.5" fill="currentColor"/>',
  mailbox: '<rect x="1.5" y="4" width="13" height="9" rx="2" fill="none" stroke="currentColor" stroke-width="2.5"/><polyline points="1.5,5 8,10 14.5,5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>',
  mcp: '<rect x="1.5" y="3" width="13" height="10" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M5 6.5L3.5 8L5 9.5" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><line x1="7" y1="9.5" x2="11" y2="9.5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>',
};
// ═══════════════════════════════════════
// 【CSS 注入】
// ═══════════════════════════════════════

function injectStyle() {
  var old = document.getElementById(STYLE_ID);
  if (old) old.remove();

  var style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .tools-container{display:flex;flex-direction:column;min-height:0;max-height:62vh;overflow:hidden}
    .tools-swiper{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;flex:1;gap:0}
    .tools-swiper::-webkit-scrollbar{display:none}
    .tools-page{flex:0 0 100%;scroll-snap-align:start;display:grid;grid-template-columns:repeat(4,1fr);grid-auto-rows:1fr;gap:10px;padding:10px 4px 6px;min-height:0}
    .tools-dots{display:flex;justify-content:center;align-items:center;gap:6px;padding:4px 0 2px}
    .tools-dot{width:6px;height:6px;border-radius:50%;background:var(--text-hint);opacity:0.25;transition:all 0.3s ease;cursor:pointer;flex:0 0 auto}
    .tools-dot.active{opacity:1;background:var(--accent);width:20px;border-radius:4px}
    .tool-cell{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:10px 4px 8px;border:none;outline:none;border-radius:var(--radius-lg);background:transparent;cursor:pointer;transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);-webkit-tap-highlight-color:transparent;user-select:none}
    .tool-cell:active{transform:scale(0.9)}
    .tool-icon-wrap{width:42px;height:42px;display:flex;align-items:center;justify-content:center;color:var(--accent);background:var(--surface-muted);border-radius:var(--radius-md);padding:5px;box-shadow:var(--shadow-sm);transition:all 0.2s ease}
    .tool-cell:active .tool-icon-wrap{transform:scale(0.92)}
    .tool-icon-wrap svg{width:100%;height:100%}
    .tool-name{font-size:11px;font-weight:500;color:var(--text-secondary);line-height:1.2;text-align:center;white-space:nowrap}
    .tool-badge{position:absolute;top:4px;right:4px;min-width:14px;height:14px;display:flex;align-items:center;justify-content:center;padding:0 4px;border-radius:999px;background:var(--accent);color:var(--bubble-user-text,#fff);font-size:9px;font-weight:700;line-height:1;box-shadow:0 0 0 2px var(--bg-primary);pointer-events:none}
    .tools-detail-wrap{display:flex;flex-direction:column;gap:14px;padding:4px 4px 8px;animation:toolsFadeIn 200ms ease both}
    .tools-detail-header{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;margin-bottom:4px}
    .tools-back-btn{width:38px;height:38px;display:inline-flex;align-items:center;justify-content:center;border:none;outline:none;border-radius:var(--radius-md);background:var(--bg-card);color:var(--text-primary);box-shadow:var(--shadow-sm);transition:all 200ms ease}
    .tools-back-btn:active{transform:scale(0.92)}
    .tools-back-btn svg{width:18px;height:18px}
    .tools-detail-title{min-width:0;color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35}
    .tools-detail-spacer{width:38px;height:38px}
    .tools-option-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
    .tools-option-btn{min-height:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:12px;border:none;outline:none;border-radius:var(--radius-lg);background:var(--surface-muted);color:var(--text-primary);box-shadow:var(--shadow-sm);cursor:pointer;transition:all 0.2s cubic-bezier(0.34,1.56,0.64,1);-webkit-tap-highlight-color:transparent;font-family:inherit;text-align:center}
    .tools-option-btn:active{transform:scale(0.94)}
    .tools-option-icon{width:32px;height:32px;display:flex;align-items:center;justify-content:center;color:var(--accent)}
    .tools-option-icon svg{width:100%;height:100%}
    .tools-option-label{font-size:13px;font-weight:600;color:var(--text-primary)}
    .tools-option-sub{font-size:11px;color:var(--text-hint)}
    .tools-stat-row{display:flex;align-items:center;justify-content:center;gap:12px;padding:10px 14px;border-radius:var(--radius-lg);background:var(--surface-muted);box-shadow:var(--shadow-sm)}
    .tools-stat-item{display:flex;flex-direction:column;align-items:center;gap:2px}
    .tools-stat-num{font-size:18px;font-weight:700;color:var(--text-primary)}
    .tools-stat-label{font-size:11px;color:var(--text-hint)}
    .tools-stat-divider{width:1px;height:24px;background:var(--bg-hover)}
    .tools-chip-list{display:flex;flex-direction:column;gap:8px;max-height:180px;overflow-y:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch}
    .tools-chip{display:flex;align-items:center;gap:8px;padding:10px 14px;border:none;outline:none;border-radius:var(--radius-lg);background:var(--surface-muted);color:var(--text-primary);box-shadow:var(--shadow-sm);cursor:pointer;transition:all 0.2s ease;font-family:inherit;font-size:14px;text-align:left;-webkit-tap-highlight-color:transparent}
    .tools-chip:active{transform:scale(0.97)}
    .tools-chip-text{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .tools-chip-del{width:26px;height:26px;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:999px;background:transparent;color:var(--text-hint);cursor:pointer;transition:all 0.2s ease}
    .tools-chip-del:active{transform:scale(0.85)}
    .tools-input-row{display:flex;gap:8px;margin-top:4px}
    .tools-input{flex:1;padding:0 12px;min-height:40px;border:none;outline:none;border-radius:var(--radius-md);background:var(--surface-muted);color:var(--text-primary);box-shadow:var(--shadow-sm);font-family:inherit;font-size:14px;line-height:1.5;-webkit-appearance:none;appearance:none}
    .tools-send-btn{padding:0 16px;min-height:40px;border:none;outline:none;border-radius:var(--radius-md);background:var(--accent);color:var(--bubble-user-text);font-family:inherit;font-size:14px;font-weight:600;cursor:pointer;white-space:nowrap;transition:all 0.2s ease}
    .tools-send-btn:active{transform:scale(0.95)}
    .tools-empty{padding:16px 12px;border-radius:var(--radius-lg);background:var(--surface-muted);color:var(--text-hint);font-size:13px;line-height:1.6;text-align:center}
    .tools-section-title{font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:2px}
    .tools-section-desc{font-size:12px;color:var(--text-secondary);line-height:1.5;margin-bottom:8px}
    .tools-mailbox-wrap{display:flex;flex-direction:column;gap:12px;min-height:0;max-height:52vh;overflow:hidden}
    .tools-mailbox-list{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;display:flex;flex-direction:column;gap:10px;padding-bottom:8px}
    .tools-mailbox-card{padding:12px 14px;border-radius:var(--radius-lg);background:var(--bg-card);box-shadow:var(--shadow-sm);cursor:pointer;transition:all 0.2s ease}
    .tools-mailbox-card:active{transform:scale(0.98)}
    .tools-mailbox-card.is-read{opacity:0.75}
    .tools-mailbox-card.is-open{background:var(--surface-muted)}
    .tools-mailbox-top{display:flex;align-items:center;gap:8px}
    .tools-mailbox-dot{width:8px;height:8px;flex:0 0 auto;border-radius:50%;background:transparent}
    .tools-mailbox-dot.unread{background:var(--accent)}
    .tools-mailbox-title{flex:1;min-width:0;font-size:14px;font-weight:600;color:var(--text-primary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .tools-mailbox-time{font-size:11px;color:var(--text-hint);white-space:nowrap}
    .tools-mailbox-preview{margin-top:6px;font-size:13px;color:var(--text-secondary);line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .tools-mailbox-detail{display:none;margin-top:10px;padding-top:10px;border-top:1px solid var(--surface-muted);font-size:14px;color:var(--text-primary);line-height:1.7;white-space:pre-wrap;word-break:break-word}
    .tools-mailbox-card.is-open .tools-mailbox-detail{display:block}
    @keyframes toolsFadeIn{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}
    @media(max-width:430px){.tools-option-grid{grid-template-columns:repeat(2,1fr)}}
    @media(prefers-reduced-motion:reduce){.tool-cell,.tool-icon-wrap,.tools-option-btn,.tools-chip,.tools-back-btn,.tools-send-btn{transition:none}.tools-detail-wrap{animation:none}}
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════
// 【图标创建】
// ═══════════════════════════════════════

function createToolIcon(type) {
  var wrap = document.createElement('div');
  wrap.className = 'tool-icon-wrap';
  wrap.innerHTML = '<svg viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">' + (TOOL_ICONS[type] || TOOL_ICONS.chat) + '</svg>';
  return wrap;
}

function createBackIcon() {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M15 18l-6-6 6-6');
  svg.appendChild(path);
  return svg;
}

// ═══════════════════════════════════════
// 【滑页宫格】导出给 thread-panels.js
// ═══════════════════════════════════════

export function createThreadToolsGrid(state, options = {}) {
  injectStyle();

  var container = document.createElement('div');
  container.className = 'tools-container';

  var unreadCount = 0;

  async function loadUnread() {
    try {
      unreadCount = await getAllUnreadMailboxCount();
    } catch (e) {
      unreadCount = 0;
    }
  }

  function buildSwiper() {
    var swiper = document.createElement('div');
    swiper.className = 'tools-swiper';

    for (var p = 0; p < TOTAL_PAGES; p++) {
      var page = document.createElement('div');
      page.className = 'tools-page';

      var start = p * TOOLS_PER_PAGE;
      var end = Math.min(start + TOOLS_PER_PAGE, TOOLS.length);

      for (var i = start; i < end; i++) {
        var tool = TOOLS[i];
        var cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'tool-cell';
        cell.appendChild(createToolIcon(tool.icon));

        if (tool.id === 'mailbox' && unreadCount > 0) {
          var badge = document.createElement('span');
          badge.className = 'tool-badge';
          badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
          cell.appendChild(badge);
        }

        var name = document.createElement('div');
        name.className = 'tool-name';
        name.textContent = tool.title;
        cell.appendChild(name);

        cell.addEventListener('click', async function(id) {
          return async function() {
            await handleToolClick(id, state, options, showDetail);
          };
        }(tool.id));

        page.appendChild(cell);
      }

      swiper.appendChild(page);
    }

    return swiper;
  }

  function buildDots(swiper) {
    if (TOTAL_PAGES <= 1) return null;

    var dots = document.createElement('div');
    dots.className = 'tools-dots';

    for (var i = 0; i < TOTAL_PAGES; i++) {
      var dot = document.createElement('span');
      dot.className = 'tools-dot' + (i === 0 ? ' active' : '');
      dot.dataset.index = String(i);
      dots.appendChild(dot);
    }

    // 滑动更新圆点
    swiper.addEventListener('scroll', function() {
      var idx = Math.round(swiper.scrollLeft / swiper.clientWidth);
      var allDots = dots.querySelectorAll('.tools-dot');
      allDots.forEach(function(d, j) {
        d.classList.toggle('active', j === idx);
      });
    });

    // 点圆点跳页
    dots.addEventListener('click', function(e) {
      var dot = e.target.closest('.tools-dot');
      if (!dot) return;
      var idx = parseInt(dot.dataset.index, 10);
      swiper.scrollTo({ left: swiper.clientWidth * idx, behavior: 'smooth' });
    });

    return dots;
  }

  function showGrid() {
    loadUnread().then(function() {
      var swiper = buildSwiper();
      container.replaceChildren(swiper);
      var dots = buildDots(swiper);
      if (dots) container.appendChild(dots);
    });
  }

  function showDetail(title, detailEl) {
    container.replaceChildren(buildDetailView(title, detailEl, function() {
      showGrid();
    }));
  }

  showGrid();
  return container;
}

function buildDetailView(title, contentEl, onBack) {
  var wrap = document.createElement('div');
  wrap.className = 'tools-detail-wrap';

  var header = document.createElement('div');
  header.className = 'tools-detail-header';

  var back = document.createElement('button');
  back.type = 'button';
  back.className = 'tools-back-btn';
  back.setAttribute('aria-label', '返回');
  back.appendChild(createBackIcon());
  back.addEventListener('click', onBack);

  var titleEl = document.createElement('div');
  titleEl.className = 'tools-detail-title';
  titleEl.textContent = title;

  var spacer = document.createElement('div');
  spacer.className = 'tools-detail-spacer';

  header.append(back, titleEl, spacer);
  wrap.append(header, contentEl);
  return wrap;
}

// ═══════════════════════════════════════
// 【工具点击分发】
// ═══════════════════════════════════════

async function handleToolClick(toolId, state, options, showDetail) {
  switch (toolId) {
    case 'dice':
      showDetail('骰子', buildDiceDetail(state, options));
      break;
    case 'rps':
      showDetail('猜拳', buildRpsDetail(state, options));
      break;
    case 'quickReply':
      showDetail('快捷回复', buildQuickReplyDetail(state, options));
      break;
    case 'transfer':
      closeToolsSheet(options);
      openTransferSheet(state, options);
      break;
    case 'phone':
      closeToolsSheet(options);
      if (typeof options?.onPick === 'function') {
        options.onPick({ id: 'phone' });
      }
      break;
    case 'mailbox':
      showDetail('信箱', buildMailboxDetail(state, options));
      break;
    case 'clearCtx':
      closeToolsSheet(options);
      openClearContextSheet(state, options);
      break;
    case 'relLock':
      closeToolsSheet(options);
      openRelationshipLockSheet(state, options);
      break;
    case 'mcp':
      closeToolsSheet(options);
      openMcpSheet(state, options);
      break;
    default:
      break;
  }
}

// ═══════════════════════════════════════
// 【通用辅助】关闭抽屉、发送消息
// ═══════════════════════════════════════

function closeToolsSheet(options) {
  if (typeof options?.onClose === 'function') {
    options.onClose();
  } else {
    hideBottomSheet();
  }
}

async function sendMessageToChat(text, options) {
  if (typeof options?.onSend === 'function') {
    await options.onSend(text);
  }
}
// ═══════════════════════════════════════
// 【存储辅助】按角色 ID 存取
// ═══════════════════════════════════════

function getCharacterId(state) {
  return state?.characterId || '';
}

function getQuickReplies(state) {
  var id = getCharacterId(state);
  return getData('chat_' + id + '_quick_replies') || [
    '在忙吗~',
    '想你了',
    '晚安',
    '今天辛苦啦',
  ];
}

function saveQuickReplies(state, replies) {
  setData('chat_' + getCharacterId(state) + '_quick_replies', replies);
}

function getRpsRecord(state) {
  return getData('chat_' + getCharacterId(state) + '_rps_record') || { wins: 0, losses: 0, draws: 0 };
}

function saveRpsRecord(state, record) {
  setData('chat_' + getCharacterId(state) + '_rps_record', record);
}

// ═══════════════════════════════════════
// 【骰子详情】选择面数后直接发送
// ═══════════════════════════════════════

function buildDiceDetail(state, options) {
  var wrap = document.createElement('div');

  var desc = document.createElement('div');
  desc.className = 'tools-section-desc';
  desc.textContent = '选一个面数，掷出去看看运气~';
  wrap.appendChild(desc);

  var grid = document.createElement('div');
  grid.className = 'tools-option-grid';

  var diceTypes = [
    { sides: 6, label: 'D6', sub: '经典骰子' },
    { sides: 20, label: 'D20', sub: '跑团骰子' },
    { sides: 100, label: 'D100', sub: '百分骰子' },
  ];

  diceTypes.forEach(function(d) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tools-option-btn';

    var icon = document.createElement('div');
    icon.className = 'tools-option-icon';
    icon.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><rect x="2" y="2" width="12" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>';

    var label = document.createElement('div');
    label.className = 'tools-option-label';
    label.textContent = d.label;

    var sub = document.createElement('div');
    sub.className = 'tools-option-sub';
    sub.textContent = d.sub;

    btn.append(icon, label, sub);
    btn.addEventListener('click', async function() {
      closeToolsSheet(options);
      await sendDiceMessage(state, { sides: d.sides, triggerAI: true });
      if (typeof state?.reloadAndRender === 'function') {
        await state.reloadAndRender();
      }
    });

    grid.appendChild(btn);
  });

  wrap.appendChild(grid);
  return wrap;
}

// ═══════════════════════════════════════
// 【猜拳详情】胜负记录 + 出手
// ═══════════════════════════════════════

function computeRpsOutcome(userChoice, aiChoice) {
  if (userChoice === aiChoice) return 'draw';
  if (
    (userChoice === 'rock' && aiChoice === 'scissors') ||
    (userChoice === 'scissors' && aiChoice === 'paper') ||
    (userChoice === 'paper' && aiChoice === 'rock')
  ) return 'win';
  return 'lose';
}

function buildRpsDetail(state, options) {
  var wrap = document.createElement('div');

  var record = getRpsRecord(state);

  var statRow = document.createElement('div');
  statRow.className = 'tools-stat-row';

  var stats = [
    { num: record.wins || 0, label: '胜' },
    { num: record.losses || 0, label: '负' },
    { num: record.draws || 0, label: '平' },
  ];

  stats.forEach(function(stat, index) {
    if (index > 0) {
      var divider = document.createElement('div');
      divider.className = 'tools-stat-divider';
      statRow.appendChild(divider);
    }
    var item = document.createElement('div');
    item.className = 'tools-stat-item';
    item.append(
      createText('div', 'tools-stat-num', String(stat.num)),
      createText('div', 'tools-stat-label', stat.label)
    );
    statRow.appendChild(item);
  });

  wrap.appendChild(statRow);

  var desc = document.createElement('div');
  desc.className = 'tools-section-desc';
  desc.style.marginTop = '12px';
  desc.textContent = '出招吧~';
  wrap.appendChild(desc);

  var grid = document.createElement('div');
  grid.className = 'tools-option-grid';

  var choices = [
    { choice: 'rock', label: '石头', svg: '<path d="M7 11c0-2 1.3-3.5 3-3.5h3.5c2 0 3.5 1.5 3.5 3.5v2.5c0 2.8-2.2 5-5 5s-5-2.2-5-5V11Z" fill="none" stroke="currentColor" stroke-width="2.5"/>' },
    { choice: 'paper', label: '布', svg: '<path d="M6 12V7.5a1.5 1.5 0 0 1 3 0V12M9 12V5.5a1.5 1.5 0 0 1 3 0V12M12 12V6.5a1.5 1.5 0 0 1 3 0V12M15 12V8.5a1.5 1.5 0 0 1 3 0v5c0 3-2.3 5.5-6 5.5-3.2 0-6-2.2-6-5.5V12" fill="none" stroke="currentColor" stroke-width="2.5"/>' },
    { choice: 'scissors', label: '剪刀', svg: '<path d="M6 6l12 12M18 6 6 18" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="6" cy="6" r="2" fill="none" stroke="currentColor" stroke-width="2.5"/><circle cx="6" cy="18" r="2" fill="none" stroke="currentColor" stroke-width="2.5"/>' },
  ];

  choices.forEach(function(c) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tools-option-btn';

    var icon = document.createElement('div');
    icon.className = 'tools-option-icon';
    icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">' + c.svg + '</svg>';

    var label = document.createElement('div');
    label.className = 'tools-option-label';
    label.textContent = c.label;

    btn.append(icon, label);
    btn.addEventListener('click', async function() {
      var aiChoices = ['rock', 'paper', 'scissors'];
      var aiChoice = aiChoices[Math.floor(Math.random() * 3)];
      var outcome = computeRpsOutcome(c.choice, aiChoice);

      var rec = getRpsRecord(state);
      if (outcome === 'win') rec.wins = (rec.wins || 0) + 1;
      else if (outcome === 'lose') rec.losses = (rec.losses || 0) + 1;
      else rec.draws = (rec.draws || 0) + 1;
      saveRpsRecord(state, rec);

      closeToolsSheet(options);
      await sendRpsMessage(state, {
        choice: c.choice,
        opponentChoice: aiChoice,
        triggerAI: true
      });

      if (typeof state?.reloadAndRender === 'function') {
        await state.reloadAndRender();
      }
    });

    grid.appendChild(btn);
  });

  wrap.appendChild(grid);
  return wrap;
}

// ═══════════════════════════════════════
// 【快捷回复】自定义常用语
// ═══════════════════════════════════════

function buildQuickReplyDetail(state, options) {
  var wrap = document.createElement('div');

  var replies = getQuickReplies(state);

  var list = document.createElement('div');
  list.className = 'tools-chip-list';

  function renderList() {
    list.replaceChildren();
    var current = getQuickReplies(state);

    if (!current.length) {
      var empty = document.createElement('div');
      empty.className = 'tools-empty';
      empty.textContent = '还没有常用语，下面加几句吧~';
      list.appendChild(empty);
      return;
    }

    current.forEach(function(text, index) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'tools-chip';

      var chipText = document.createElement('span');
      chipText.className = 'tools-chip-text';
      chipText.textContent = text;

      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'tools-chip-del';
      del.setAttribute('aria-label', '删除');
      del.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>';
      del.addEventListener('click', function(e) {
        e.stopPropagation();
        var updated = getQuickReplies(state).filter(function(_, i) { return i !== index; });
        saveQuickReplies(state, updated);
        renderList();
      });

      chip.append(chipText, del);
      chip.addEventListener('click', async function() {
        closeToolsSheet(options);
        await sendMessageToChat(text, options);
      });
      list.appendChild(chip);
    });
  }

  renderList();
  wrap.appendChild(list);

  var inputRow = document.createElement('div');
  inputRow.className = 'tools-input-row';

  var input = document.createElement('input');
  input.type = 'text';
  input.className = 'tools-input';
  input.placeholder = '加一句常用语...';
  input.maxLength = 50;

  var addBtn = document.createElement('button');
  addBtn.type = 'button';
  addBtn.className = 'tools-send-btn';
  addBtn.textContent = '添加';
  addBtn.addEventListener('click', function() {
    var val = input.value.trim();
    if (!val) return;
    var current = getQuickReplies(state);
    current.push(val);
    saveQuickReplies(state, current);
    input.value = '';
    renderList();
    showToast('加好啦');
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addBtn.click();
    }
  });

  inputRow.append(input, addBtn);
  wrap.appendChild(inputRow);

  return wrap;
}

// ═══════════════════════════════════════
// 【独立面板入口】导出给 thread-panels.js
// ═══════════════════════════════════════

export function showToolsPanel(state, options = {}) {
  var sheet = document.createElement('div');
  sheet.className = 'thread-tools-panel-wrap';
  sheet.style.cssText = 'display:flex;flex-direction:column;gap:0;padding:6px 20px 20px;';

  var head = document.createElement('div');
  head.style.cssText = 'margin-bottom:10px;';
  head.appendChild(buildDetailView('小工具箱', document.createElement('div'), function() {
    if (typeof options.onClose === 'function') {
      options.onClose();
    } else {
      hideBottomSheet();
    }
  }).querySelector('.tools-detail-header'));

  var backBtn = head.querySelector('.tools-back-btn');
  if (backBtn) {
    backBtn.setAttribute('aria-label', '关闭工具箱');
    backBtn.replaceChildren();
    backBtn.appendChild(createCloseIcon());
  }

  sheet.appendChild(head);

  var grid = createThreadToolsGrid(state, options);
  sheet.appendChild(grid);

  showBottomSheet(sheet);
}

function createCloseIcon() {
  var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  var p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p1.setAttribute('d', 'M6 6l12 12');
  var p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p2.setAttribute('d', 'M18 6 6 18');
  svg.append(p1, p2);
  return svg;
}

// ═══════════════════════════════════════
// 【DOM 辅助】
// ═══════════════════════════════════════

function createText(tag, className, text) {
  var node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== '') node.textContent = text;
  return node;
}

// ═══════════════════════════════════════
// 【导出】
// ═══════════════════════════════════════

export { showToolsPanel as default };

