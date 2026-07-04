// apps/chat/shared-utils.js
// 聊天模块共用工具——把散落在 detail-view/sending/session-list/message-actions
// 里的 escapeHTML / escapeAttr / attachLongPress 收拢到一处，避免重复定义。
// 纯函数 + DOM 工具，无副作用，无外部依赖。

/**
 * HTML 转义：把 & < > " ' 转成实体，防 XSS。
 * @param {string} s
 * @returns {string}
 */
export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/**
 * 属性转义：用于 HTML 属性值。escapeHTML 已覆盖双引号，这里保持同义。
 * @param {string} s
 * @returns {string}
 */
export function escapeAttr(s) {
  return escapeHTML(s);
}

/**
 * 长按手势：pointerdown 起 500ms 触发；移动超阈值取消；右键直接触发；
 * 长按触发后阻止后续 click（避免误跳转）。不再监听 pointerleave，
 * 避免手指滑出元素边界时误触发清理（用 pointermove 阈值判定替代）。
 * @param {HTMLElement} el 目标元素
 * @param {(e:PointerEvent|MouseEvent)=>void} handler 长按回调
 */
export function attachLongPress(el, handler) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let moved = false;
  let longPressed = false;
  const LONG_PRESS_MS = 500;
  const MOVE_THRESHOLD = 10;

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    moved = false;
    longPressed = false;
    startX = e.clientX;
    startY = e.clientY;
    timer = setTimeout(() => {
      timer = null;
      longPressed = true;
      // 长按触发后阻止 click
      try { handler(e); } catch (err) { console.warn('[chat] longpress 失败', err); }
    }, LONG_PRESS_MS);
  };
  const onMove = (e) => {
    if (!timer) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    // 距离超过阈值视为移动，取消长按
    if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
      moved = true;
      clearTimeout(timer);
      timer = null;
    }
  };
  const onUp = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };
  const onClickCapture = (e) => {
    if (longPressed || moved) { e.preventDefault(); e.stopPropagation(); longPressed = false; moved = false; }
  };
  // 桌面端右键菜单：直接触发长按 handler，并阻止系统右键菜单
  const onContextMenu = (e) => {
    e.preventDefault();
    if (timer) { clearTimeout(timer); timer = null; }
    longPressed = true;
    try { handler(e); } catch (err) { console.warn('[chat] longpress 失败', err); }
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('contextmenu', onContextMenu);
  el.addEventListener('click', onClickCapture, true);
}
