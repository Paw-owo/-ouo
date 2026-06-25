// apps/chat/thread-panels.js
// imports:
//   from '../../core/ui.js': showBottomSheet, hideBottomSheet, showToast, createIcon
//   from './thread-tools.js': createThreadToolsGrid
//   from './thread-settings.js': mountThreadSettings, unmountThreadSettings
//   from './thread-call.js': mountThreadCall, unmountThreadCall

import {
  showBottomSheet,
  hideBottomSheet,
  showToast,
  createIcon
} from '../../core/ui.js';

import { createThreadToolsGrid } from './thread-tools.js';
import { mountThreadSettings, unmountThreadSettings } from './thread-settings.js';
import { mountThreadCall, unmountThreadCall } from './thread-call.js';

const STYLE_ID = 'chat-thread-panels-style';

const panelState = {
  toolsSheetEl: null,
  settingsSheetEl: null,
  callMounted: false,
  lastState: null
};

// ═══════════════════════════════════════
// 【工具面板】打开工具宫格和关闭工具面板
// ═══════════════════════════════════════

export function openThreadToolsPanel(state, options = {}) {
  injectStyle();
  panelState.lastState = state || null;

  closeThreadSettingsPanel();
  closeThreadCallPanel();
  closeThreadToolsPanel();

  const sheet = el('div', 'chat-thread-tools-sheet');
  const head = el('div', 'chat-thread-tools-head');

  head.append(
    el('div', 'chat-thread-tools-title', '小工具箱')
  );

  const grid = createThreadToolsGrid(state, {
    ...options,
    containerEl: sheet,
    onPick: async (item, nextState) => {
      if (typeof options.onPick === 'function') {
        const handled = await options.onPick(item, nextState);
        if (handled) return true;
      }

      if (item?.id === 'call') {
        closeThreadToolsPanel();
        await openThreadCallPanel(nextState || state, options);
        return true;
      }

      return false;
    },
    onCloseCall: () => closeThreadCallPanel(),
    onRejectCall: () => closeThreadCallPanel()
  });

  sheet.append(head, grid);

  panelState.toolsSheetEl = sheet;
  showBottomSheet(sheet);
}

export function closeThreadToolsPanel() {
  if (panelState.toolsSheetEl) {
    hideBottomSheet();
    panelState.toolsSheetEl = null;
  }
}

// ═══════════════════════════════════════
// 【设置面板】打开聊天设置和关闭设置面板
// ═══════════════════════════════════════

export function openThreadSettingsPanel(state, options = {}) {
  injectStyle();
  panelState.lastState = state || null;

  if (state?.mode === 'group') {
    showToast('群聊设置晚点再接');
    return;
  }

  if (!state?.characterId) {
    showToast('这个聊天还没有角色');
    return;
  }

  closeThreadToolsPanel();
  closeThreadCallPanel();
  closeThreadSettingsPanel();

  const sheet = el('div', 'chat-settings-sheet');
  const top = el('div', 'chat-settings-sheet-top');

  const close = buttonIcon('close', '关闭设置');
  close.addEventListener('click', () => closeThreadSettingsPanel());

  top.append(
    close,
    el('div', 'chat-settings-sheet-title', '聊天设置'),
    el('div', 'chat-settings-sheet-spacer')
  );

  const host = el('div', 'chat-settings-host');
  sheet.append(top, host);

  panelState.settingsSheetEl = sheet;
  showBottomSheet(sheet);

  mountThreadSettings(host, {
    characterId: state.characterId,
    appState: state.appState,
    ...options.settings
  });
}

export function closeThreadSettingsPanel() {
  if (panelState.settingsSheetEl) {
    unmountThreadSettings();
    hideBottomSheet();
    panelState.settingsSheetEl = null;
  }
}

// ═══════════════════════════════════════
// 【电话面板】打开电话和关闭电话面板
// ═══════════════════════════════════════

export async function openThreadCallPanel(state, options = {}) {
  injectStyle();
  panelState.lastState = state || null;

  if (state?.mode === 'group') {
    showToast('群聊电话先不接');
    return;
  }

  if (!state?.characterId) {
    showToast('这个聊天还没有角色');
    return;
  }

  closeThreadToolsPanel();
  closeThreadSettingsPanel();
  closeThreadCallPanel();

  const target = options.containerEl || document.body;

  try {
    await mountThreadCall(target, {
      state,
      character: state?.character || null,
      characterId: state?.characterId || '',
      incoming: Boolean(options.incoming),
      close: () => closeThreadCallPanel(),
      onReject: () => closeThreadCallPanel()
    });

    panelState.callMounted = true;
  } catch (error) {
    panelState.callMounted = false;
    console.error('[chat-thread-panels] call mount failed', error);
    showToast('电话没接起来');
  }
}

export function closeThreadCallPanel() {
  if (panelState.callMounted) {
    unmountThreadCall();
    panelState.callMounted = false;
  }
}

// ═══════════════════════════════════════
// 【统一关闭】把当前打开的面板一口气关掉
// ═══════════════════════════════════════

export function closeThreadPanels() {
  closeThreadCallPanel();
  closeThreadSettingsPanel();
  closeThreadToolsPanel();
}

// ═══════════════════════════════════════
// 【通用组件】图标按钮和 DOM
// ═══════════════════════════════════════

function buttonIcon(iconName, label) {
  const button = el('button', 'chat-panel-icon-btn');
  button.type = 'button';
  button.setAttribute('aria-label', label || iconName);
  button.appendChild(createIcon(iconName, 18));
  return button;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// ═══════════════════════════════════════
// 【样式】工具、设置、电话面板壳
// ═══════════════════════════════════════

function injectStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .chat-thread-tools-sheet,
    .chat-settings-sheet{
      padding:6px 20px 20px;
      color:var(--text-primary);
    }

    .chat-thread-tools-head,
    .chat-settings-sheet-top{
      display:grid;
      grid-template-columns:auto minmax(0,1fr) auto;
      align-items:center;
      gap:12px;
      margin-bottom:14px;
    }

    .chat-thread-tools-title,
    .chat-settings-sheet-title{
      color:var(--text-primary);
      font-size:17px;
      font-weight:600;
      line-height:1.35;
    }

    .chat-settings-sheet-spacer{
      width:44px;
      height:44px;
    }

    .chat-settings-host{
      min-height:min(72vh,640px);
      border-radius:24px;
      overflow:hidden;
      background:var(--bg-card);
      box-shadow:var(--shadow-sm);
    }

    .chat-panel-icon-btn{
      width:44px;
      height:44px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:16px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      transition:all 200ms ease;
    }

    .chat-panel-icon-btn:active{
      transform:scale(.96);
    }

    @media(max-width:430px){
      .chat-thread-tools-sheet,
      .chat-settings-sheet{
        padding-left:20px;
        padding-right:20px;
      }
    }

    @media(prefers-reduced-motion:reduce){
      .chat-panel-icon-btn{
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/ui.js(showBottomSheet,hideBottomSheet,showToast,createIcon)；./thread-tools.js(createThreadToolsGrid)；./thread-settings.js(mountThreadSettings,unmountThreadSettings)；./thread-call.js(mountThreadCall,unmountThreadCall)
