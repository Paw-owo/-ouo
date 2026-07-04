// apps/chat/wallpaper.js
// 聊天背景——把会话里存的壁纸应用到 messageListEl。
// 依赖：core/util.js
// 状态由 index.js 持有，通过 getState 拿；index.js / message-actions.js 都会调用 applySessionWallpaper。

import { isUsableImage, cssUrl, clamp } from '../../core/util.js';
import { getState } from './index.js';

// ════════════════════════════════════════
// 聊天背景（应用到当前 messageListEl）
// ════════════════════════════════════════

export function applySessionWallpaper() {
  const state = getState();
  if (!state.messageListEl) return;
  const wp = state.currentSession?.wallpaper;
  if (wp && wp.url && isUsableImage(wp.url)) {
    state.messageListEl.style.setProperty('--chat-wp-image', cssUrl(wp.url));
    state.messageListEl.style.setProperty('--chat-wp-opacity', String(clamp(Number(wp.opacity ?? 60), 0, 100) / 100));
  } else {
    state.messageListEl.style.removeProperty('--chat-wp-image');
    state.messageListEl.style.removeProperty('--chat-wp-opacity');
  }
}
