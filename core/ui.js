// core/ui.js
// 统一 UI 组件：Toast / BottomSheet / Dialog / Confirm / Alert / Icon。
// 必须满足：
//  1) 所有弹窗继承 CSS 变量，6 套主题下都美观，对比度 ≥ 4.5:1
//  2) 支持堆栈（多个 sheet 可叠加）
//  3) 用 transitionend 事件而非固定 setTimeout
//  4) focusInto 跳过隐藏元素
//  5) createIcon 支持 SVG path 字符串 + icon font 便于扩展
// 依赖：core/config.js, core/util.js

import { get as getConfig } from './config.js';
import { injectStyle } from './util.js';

// 内联 SVG 图标库（stroke-width: 1.5，手绘风）
const ICON_PATHS = {
  chat: 'M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z',
  heart: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z',
  close: 'M18 6L6 18 M6 6l12 12',
  back: 'M19 12H5 M12 19l-7-7 7-7',
  check: 'M20 6L9 17l-5-5',
  trash: 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  plus: 'M12 5v14 M5 12h14',
  minus: 'M5 12h14',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  weather: 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z',
  calendar: 'M19 4H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M16 2v4 M8 2v4 M3 10h18',
  music: 'M9 18V5l12-2v13 M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0z M21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  wallet: 'M21 12V7H5a2 2 0 0 1 0-4h14v4 M3 5v14a2 2 0 0 0 2 2h16v-5 M18 12a2 2 0 0 0 0 4h4v-4z',
  shop: 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z M3 6h18 M16 10a4 4 0 0 1-8 0',
  memo: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',
  star: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  dream: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  games: 'M6 12h4 M8 10v4 M15 13h.01 M18 11h.01 M17.32 5H6.68a4 4 0 0 0-3.978 3.71c-.014.121-.014.27-.014.382V18a3 3 0 0 0 3 3c1.21 0 2.18-.73 2.7-1.7l.4-.8a2 2 0 0 1 1.79-1.11h2.84a2 2 0 0 1 1.79 1.11l.4.8c.52.97 1.49 1.7 2.7 1.7a3 3 0 0 0 3-3V9.092c0-.111 0-.261-.014-.382A4 4 0 0 0 17.32 5z',
  smile: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20z M8 14s1.5 2 4 2 4-2 4-2 M9 9h.01 M15 9h.01',
  home: 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z M9 22V12h6v10',
  bell: 'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9 M13.73 21a2 2 0 0 1-3.46 0',
  moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  sun: 'M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42 M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12z',
  volume: 'M11 5L6 9H2v6h4l5 4V5z',
  play: 'M5 3l14 9-14 9V3z',
  pause: 'M6 4h4v16H6z M14 4h4v16h-4z',
  next: 'M5 4l10 8-10 8V4z M19 5v14',
  prev: 'M19 4l-10 8 10 8V4z M5 5v14',
  phone: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z',
  dice: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
  gift: 'M20 12v10H4V12 M2 7h20v5H2z M12 22V7 M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z',
  edit: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7 M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z',
  more: 'M12 12h.01 M19 12h.01 M5 12h.01',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  upload: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  lock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4',
  unlock: 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 9.9-1'
};

// 注入全局 UI 样式（基于 CSS 变量，主题适配）
let uiStyleInjected = false;
function ensureUIStyle() {
  if (uiStyleInjected) return;
  injectStyle('popo-ui-style', `
    .popo-toast-stack{position:fixed;top:calc(env(safe-area-inset-top,0px) + 12px);left:50%;transform:translateX(-50%);z-index:9999;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;width:max-content;max-width:90vw}
    .popo-toast{background:color-mix(in srgb,var(--bg-card) 92%,transparent);backdrop-filter:blur(var(--glass-blur));-webkit-backdrop-filter:blur(var(--glass-blur));color:var(--text-primary);padding:10px 18px;border-radius:var(--radius-md);box-shadow:var(--shadow-md);font-size:var(--font-size-small);line-height:1.4;pointer-events:auto;border:1px solid color-mix(in srgb,var(--accent-light) 60%,transparent);animation:popoToastIn var(--motion) var(--motion-spring);max-width:80vw;text-align:center}
    .popo-toast.leaving{animation:popoToastOut 160ms ease forwards}
    .popo-toast.error{background:color-mix(in srgb,#E8888C 92%,transparent);color:#fff;border-color:#E8888C}
    .popo-toast.success{background:color-mix(in srgb,var(--accent) 92%,transparent);color:var(--bubble-user-text);border-color:var(--accent)}
    @keyframes popoToastIn{from{opacity:0;transform:translateY(-12px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}
    @keyframes popoToastOut{to{opacity:0;transform:translateY(-8px) scale(.96)}}
    .popo-overlay{position:fixed;inset:0;background:var(--bg-overlay);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);z-index:9000;opacity:0;transition:opacity var(--motion)}
    .popo-overlay.show{opacity:1}
    .popo-sheet{position:fixed;left:0;right:0;bottom:0;background:color-mix(in srgb,var(--bg-card) 96%,transparent);backdrop-filter:blur(var(--glass-blur-strong));-webkit-backdrop-filter:blur(var(--glass-blur-strong));border-radius:var(--radius-sheet) var(--radius-sheet) 0 0;box-shadow:var(--shadow-lg);z-index:9001;transform:translateY(100%);transition:transform var(--motion) var(--motion-spring);max-height:88vh;display:flex;flex-direction:column;padding-bottom:env(safe-area-inset-bottom,0px)}
    .popo-sheet.show{transform:translateY(0)}
    .popo-sheet-handle{width:36px;height:5px;border-radius:3px;background:color-mix(in srgb,var(--text-hint) 70%,transparent);margin:10px auto 4px;flex-shrink:0}
    .popo-sheet-header{padding:8px 20px 12px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid color-mix(in srgb,var(--text-hint) 20%,transparent)}
    .popo-sheet-title{font-size:var(--font-size-title);font-weight:600;color:var(--text-primary)}
    .popo-sheet-body{flex:1;overflow-y:auto;padding:16px 20px;-webkit-overflow-scrolling:touch}
    .popo-dialog{position:fixed;left:50%;top:50%;transform:translate(-50%,-46%) scale(.94);background:color-mix(in srgb,var(--bg-card) 98%,transparent);backdrop-filter:blur(var(--glass-blur));-webkit-backdrop-filter:blur(var(--glass-blur));border-radius:var(--radius-card);box-shadow:var(--shadow-lg);z-index:9002;opacity:0;transition:opacity var(--motion),transform var(--motion) var(--motion-spring);min-width:280px;max-width:84vw;padding:22px 22px 16px}
    .popo-dialog.show{opacity:1;transform:translate(-50%,-50%) scale(1)}
    .popo-dialog-title{font-size:var(--font-size-title);font-weight:600;color:var(--text-primary);margin-bottom:8px;text-align:center}
    .popo-dialog-body{font-size:var(--font-size-base);color:var(--text-secondary);text-align:center;margin-bottom:18px;line-height:1.5}
    .popo-dialog-actions{display:flex;gap:10px}
    .popo-dialog-actions button{flex:1;padding:11px 14px;border-radius:var(--radius-sm);font-size:var(--font-size-base);font-weight:500;background:color-mix(in srgb,var(--bg-secondary) 80%,transparent);color:var(--text-primary);transition:var(--motion)}
    .popo-dialog-actions button:active{transform:scale(var(--press-scale))}
    .popo-dialog-actions button.primary{background:var(--accent);color:var(--bubble-user-text)}
    .popo-dialog-actions button.danger{background:#E8888C;color:#fff}
    .popo-icon-svg{stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;fill:none;display:inline-block;vertical-align:middle}
    .popo-loading{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;background:var(--bg-overlay);backdrop-filter:blur(4px)}
    .popo-loading-dot{width:14px;height:14px;border-radius:50%;background:var(--accent);margin:0 5px;animation:popoPulse 1s ease-in-out infinite}
    .popo-loading-dot:nth-child(2){animation-delay:.2s}
    .popo-loading-dot:nth-child(3){animation-delay:.4s}
    @keyframes popoPulse{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}
    @media (prefers-reduced-motion:reduce){.popo-toast,.popo-sheet,.popo-dialog,.popo-loading-dot{animation-duration:.01ms!important;transition-duration:.01ms!important}}
  `);
  uiStyleInjected = true;
}

// ════════════════════════════════════════
// Toast
// ════════════════════════════════════════

function getToastStack() {
  let el = document.querySelector('.popo-toast-stack');
  if (!el) {
    el = document.createElement('div');
    el.className = 'popo-toast-stack';
    document.body.appendChild(el);
  }
  return el;
}

export function showToast(message, type = 'default', durationMs) {
  ensureUIStyle();
  if (!message) return;
  const stack = getToastStack();
  const el = document.createElement('div');
  el.className = `popo-toast ${type === 'error' ? 'error' : type === 'success' ? 'success' : ''}`;
  el.textContent = message;
  stack.appendChild(el);
  const dur = durationMs || getConfig('ui.toastDurationMs', 2200);
  const leave = () => {
    el.classList.add('leaving');
    const onEnd = () => { el.remove(); };
    el.addEventListener('animationend', onEnd, { once: true });
    // 兜底
    setTimeout(onEnd, 250);
  };
  setTimeout(leave, dur);
  // 点击提前关闭
  el.addEventListener('click', leave, { once: true });
  return () => leave();
}

// ════════════════════════════════════════
// BottomSheet（支持堆栈）
// ════════════════════════════════════════

const sheetStack = [];

export function showBottomSheet(opts = {}) {
  ensureUIStyle();
  const { title = '', bodyHTML = '', bodyElement = null, onClose, dismissible = true } = opts;

  const overlay = document.createElement('div');
  overlay.className = 'popo-overlay';
  const sheet = document.createElement('div');
  sheet.className = 'popo-sheet';
  sheet.innerHTML = `
    <div class="popo-sheet-handle" aria-hidden="true"></div>
    ${title ? `<div class="popo-sheet-header"><div class="popo-sheet-title"></div><button class="popo-sheet-close" aria-label="关闭">${iconHTML('close', 22)}</button></div>` : ''}
    <div class="popo-sheet-body"></div>
  `;
  if (title) sheet.querySelector('.popo-sheet-title').textContent = title;
  const bodyEl = sheet.querySelector('.popo-sheet-body');
  if (bodyElement) bodyEl.appendChild(bodyElement);
  else bodyEl.innerHTML = bodyHTML || '';

  document.body.appendChild(overlay);
  document.body.appendChild(sheet);

  const entry = { overlay, sheet, onClose };
  sheetStack.push(entry);

  // 入场动画
  requestAnimationFrame(() => {
    overlay.classList.add('show');
    sheet.classList.add('show');
  });

  const close = () => {
    const idx = sheetStack.indexOf(entry);
    if (idx === -1) return;
    sheetStack.splice(idx, 1);
    sheet.classList.remove('show');
    overlay.classList.remove('show');
    const cleanup = () => {
      sheet.remove();
      overlay.remove();
      if (typeof onClose === 'function') {
        try { onClose(); } catch (e) { console.warn('[ui] sheet onClose 失败', e); }
      }
    };
    // 用 transitionend 而非固定 setTimeout
    const onTransEnd = (e) => {
      if (e.propertyName !== 'transform') return;
      cleanup();
    };
    sheet.addEventListener('transitionend', onTransEnd, { once: true });
    // 兜底
    setTimeout(cleanup, getConfig('ui.sheetTransitionMs', 260) + 100);
  };

  if (dismissible) {
    overlay.addEventListener('click', close);
    const closeBtn = sheet.querySelector('.popo-sheet-close');
    if (closeBtn) closeBtn.addEventListener('click', close);
  }

  // 焦点跳过隐藏元素
  focusInto(sheet);
  return { close, sheet, bodyEl, overlay };
}

export function hideBottomSheet() {
  // 关闭栈顶 sheet
  const top = sheetStack[sheetStack.length - 1];
  if (top && typeof top.sheet._close === 'function') top.sheet._close();
}

// ════════════════════════════════════════
// Dialog / Confirm / Alert
// ════════════════════════════════════════

function showDialog({ title, body, buttons }) {
  ensureUIStyle();
  const overlay = document.createElement('div');
  overlay.className = 'popo-overlay';
  const dialog = document.createElement('div');
  dialog.className = 'popo-dialog';
  dialog.innerHTML = `
    <div class="popo-dialog-title"></div>
    <div class="popo-dialog-body"></div>
    <div class="popo-dialog-actions"></div>
  `;
  dialog.querySelector('.popo-dialog-title').textContent = title || '';
  dialog.querySelector('.popo-dialog-body').textContent = body || '';
  const actions = dialog.querySelector('.popo-dialog-actions');
  const overlayDialog = { overlay, dialog, closed: false };

  const close = () => {
    if (overlayDialog.closed) return;
    overlayDialog.closed = true;
    dialog.classList.remove('show');
    overlay.classList.remove('show');
    const cleanup = () => {
      dialog.remove();
      overlay.remove();
    };
    dialog.addEventListener('transitionend', cleanup, { once: true });
    setTimeout(cleanup, 320);
  };

  buttons.forEach((b) => {
    const btn = document.createElement('button');
    btn.textContent = b.label;
    if (b.type === 'primary') btn.classList.add('primary');
    if (b.type === 'danger') btn.classList.add('danger');
    btn.addEventListener('click', () => {
      if (typeof b.onClick === 'function') {
        const r = b.onClick();
        if (r !== false) close();
      } else close();
    });
    actions.appendChild(btn);
  });

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);
  requestAnimationFrame(() => {
    overlay.classList.add('show');
    dialog.classList.add('show');
  });
  overlay.addEventListener('click', close);
  return overlayDialog;
}

export function showConfirm({ title = '再想想嘛？', body = '', confirmText = '好哒', cancelText = '不要', danger = false, onConfirm, onCancel }) {
  return showDialog({
    title, body,
    buttons: [
      { label: cancelText, type: 'default', onClick: () => { if (typeof onCancel === 'function') onCancel(); } },
      { label: confirmText, type: danger ? 'danger' : 'primary', onClick: () => { if (typeof onConfirm === 'function') onConfirm(); } }
    ]
  });
}

export function showAlert({ title = '哎呀', body = '', okText = '知道啦', onOk }) {
  return showDialog({
    title, body,
    buttons: [
      { label: okText, type: 'primary', onClick: () => { if (typeof onOk === 'function') onOk(); } }
    ]
  });
}

// ════════════════════════════════════════
// Loading
// ════════════════════════════════════════

export function showLoading(text = '小手机正在醒来') {
  ensureUIStyle();
  let el = document.querySelector('.popo-loading');
  if (el) el.remove();
  el = document.createElement('div');
  el.className = 'popo-loading';
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;gap:14px">
      <div style="display:flex">
        <div class="popo-loading-dot"></div>
        <div class="popo-loading-dot"></div>
        <div class="popo-loading-dot"></div>
      </div>
      <div style="color:var(--text-primary);font-size:var(--font-size-small)">${text}</div>
    </div>
  `;
  document.body.appendChild(el);
  return () => el.remove();
}

// ════════════════════════════════════════
// Icon
// ════════════════════════════════════════

export function iconHTML(name, size = 22, opts = {}) {
  const path = ICON_PATHS[name];
  if (!path) return '';
  const extra = opts.fill ? `fill="${opts.fill}"` : '';
  return `<svg class="popo-icon-svg" width="${size}" height="${size}" viewBox="0 0 24 24" ${extra}><path d="${path}"></path></svg>`;
}

export function createIcon(name, size = 22, opts = {}) {
  const wrapper = document.createElement('span');
  wrapper.className = 'popo-icon';
  wrapper.style.display = 'inline-flex';
  wrapper.innerHTML = iconHTML(name, size, opts);
  return wrapper;
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

export function focusInto(container) {
  if (!container) return;
  const focusable = container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  for (const el of focusable) {
    // 跳过隐藏元素
    if (el.offsetParent === null && el.tagName !== 'INPUT') continue;
    if (el.disabled) continue;
    if (el.getAttribute('aria-hidden') === 'true') continue;
    try { el.focus(); break; } catch (e) {}
  }
}

export function registerIcon(name, path) {
  if (name && path) ICON_PATHS[name] = path;
}

export function getIconNames() {
  return Object.keys(ICON_PATHS);
}
