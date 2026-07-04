// apps/characters/shared.js
// 角色管理共用层——样式、常量、小工具都收在这里，方便 index / form / detail / io 复用。
// 红线：图标只准 SVG 线稿（createIcon），禁止任何 emoji 字符；视觉值全部走 CSS 变量。
// 依赖：core/ui.js, core/util.js

import { createIcon } from '../../core/ui.js';
import { injectStyle, isUsableImage, cssUrl } from '../../core/util.js';

// ════════════════════════════════════════
// 常量
// ════════════════════════════════════════

// 默认当前角色（没存过时回退到初依）
export const DEFAULT_CHARACTER_ID = 'char_chuyi';
// 默认温度
export const DEFAULT_TEMPERATURE = 0.7;

// 角色卡导出文件的版本号，方便以后升级
export const EXPORT_VERSION = 1;
export const EXPORT_KIND = 'popo-character';

// ════════════════════════════════════════
// 样式（全部走 CSS 变量，跟着主题变）
// ════════════════════════════════════════

injectStyle('app-characters-style', `
  .char-list-head {
    display: flex; align-items: center; justify-content: space-between;
    margin: 4px 2px 10px;
  }
  .char-list-head-title {
    font-size: var(--font-size-base); font-weight: 600; color: var(--text-secondary);
  }
  .char-list-head-count {
    font-size: var(--font-size-small); color: var(--text-hint);
  }

  .char-card {
    display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
    background: var(--bg-card);
    border: 1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    border-radius: var(--radius-card);
    padding: 14px;
    margin-bottom: 12px;
    cursor: pointer; transition: var(--motion);
    position: relative;
  }
  .char-card:active { transform: scale(var(--press-scale)); }
  .char-card.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-light) 50%, transparent);
  }
  .char-avatar {
    width: 56px; height: 56px; border-radius: 50%;
    flex-shrink: 0; background: color-mix(in srgb, var(--accent-light) 50%, transparent);
    background-size: cover; background-position: center;
    display: flex; align-items: center; justify-content: center;
    color: var(--accent-dark); overflow: hidden;
    box-shadow: var(--shadow-sm);
  }
  .char-main { flex: 1; min-width: 0; }
  .char-name-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .char-name {
    font-size: var(--font-size-base); font-weight: 600; color: var(--text-primary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%;
  }
  .char-nickname {
    font-size: var(--font-size-small); color: var(--text-secondary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .char-persona {
    font-size: var(--font-size-small); color: var(--text-secondary);
    margin-top: 4px; line-height: 1.5;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; word-break: break-word;
  }
  .char-tags-row {
    display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px;
  }
  .char-tag-mini {
    font-size: var(--font-size-small); color: var(--accent-dark);
    background: color-mix(in srgb, var(--accent-light) 55%, transparent);
    padding: 1px 8px; border-radius: 999px;
  }
  .char-current-badge {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: var(--font-size-small); font-weight: 600;
    color: var(--bubble-user-text);
    background: var(--accent);
    padding: 3px 10px; border-radius: 999px;
    flex-shrink: 0;
  }
  .char-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
  .char-icon-btn {
    width: 32px; height: 32px; border-radius: 50%;
    background: transparent; color: var(--text-hint);
    display: flex; align-items: center; justify-content: center;
    transition: var(--motion);
  }
  .char-icon-btn:active { transform: scale(var(--press-scale)); }

  .char-empty {
    display: flex; flex-direction: column; align-items: center;
    padding: 60px 24px; text-align: center; color: var(--text-hint);
  }
  .char-empty-icon {
    color: var(--accent); opacity: 0.6; margin-bottom: 14px;
    display: flex; justify-content: center;
  }
  .char-empty-text {
    font-size: var(--font-size-base); color: var(--text-secondary); line-height: 1.6;
  }

  /* 表单通用 */
  .char-form-row { margin-bottom: 12px; }
  .char-form-label {
    font-size: var(--font-size-small); color: var(--text-secondary);
    margin-bottom: 6px; display: block;
  }
  .char-form-hint {
    font-size: var(--font-size-small); color: var(--text-hint);
    margin-top: 4px; line-height: 1.4;
  }
  .char-avatar-picker {
    display: flex; align-items: center; gap: 12px;
    padding: 10px; border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--bg-secondary) 50%, transparent);
    cursor: pointer; transition: var(--motion);
  }
  .char-avatar-picker:active { transform: scale(var(--press-scale)); }
  .char-avatar-preview {
    width: 64px; height: 64px; border-radius: 50%;
    background: color-mix(in srgb, var(--accent-light) 50%, transparent);
    background-size: cover; background-position: center;
    display: flex; align-items: center; justify-content: center;
    color: var(--accent-dark); flex-shrink: 0; overflow: hidden;
    box-shadow: var(--shadow-sm);
  }
  .char-avatar-hint {
    flex: 1; font-size: var(--font-size-small); color: var(--text-secondary); line-height: 1.5;
  }
  .char-temp-row { display: flex; align-items: center; gap: 12px; }
  .char-temp-slider {
    flex: 1; -webkit-appearance: none; appearance: none;
    height: 6px; border-radius: 3px;
    background: color-mix(in srgb, var(--text-hint) 24%, transparent);
    outline: none;
  }
  .char-temp-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--accent); cursor: pointer;
    box-shadow: var(--shadow-sm); border: none;
  }
  .char-temp-slider::-moz-range-thumb {
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--accent); cursor: pointer; border: none;
  }
  .char-temp-value {
    min-width: 42px; text-align: right;
    font-size: var(--font-size-base); font-weight: 600; color: var(--accent-dark);
  }
  .char-actions-row { display: flex; gap: 8px; }
  .char-actions-row .btn { flex: 1; justify-content: center; }

  /* 多选清单（关联世界书 / 关联角色） */
  .char-multiselect {
    max-height: 180px; overflow-y: auto;
    border: 1px solid color-mix(in srgb, var(--text-hint) 18%, transparent);
    border-radius: var(--radius-md);
    padding: 4px; background: color-mix(in srgb, var(--bg-secondary) 30%, transparent);
  }
  .char-multiselect-empty {
    padding: 14px; text-align: center;
    font-size: var(--font-size-small); color: var(--text-hint);
  }
  .char-check-row {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 10px; border-radius: var(--radius-sm);
    cursor: pointer; transition: var(--motion);
  }
  .char-check-row:active { transform: scale(var(--press-scale)); }
  .char-check-row input { flex-shrink: 0; width: 18px; height: 18px; accent-color: var(--accent); }
  .char-check-row-label { flex: 1; min-width: 0; font-size: var(--font-size-base); color: var(--text-primary); }
  .char-check-row-sub { font-size: var(--font-size-small); color: var(--text-hint); }

  /* 标签输入 */
  .char-tags-input {
    width: 100%; box-sizing: border-box;
    padding: 10px 14px;
    background: color-mix(in srgb, var(--bg-secondary) 50%, transparent);
    border: 1px solid color-mix(in srgb, var(--text-hint) 18%, transparent);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base); color: var(--text-primary);
  }
  .char-tags-input:focus { border-color: var(--accent); outline: none; }
  .char-tags-preview {
    display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;
  }
  .char-tag-chip {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: var(--font-size-small); color: var(--accent-dark);
    background: color-mix(in srgb, var(--accent-light) 55%, transparent);
    padding: 3px 10px; border-radius: 999px;
  }

  /* 详情页 */
  .char-detail-top {
    display: flex; align-items: center; gap: 8px; margin-bottom: 14px;
  }
  .char-detail-top .btn { flex: 1; justify-content: center; }
  .char-detail-top .btn.icon-only { flex: 0 0 auto; width: 40px; padding: 0; }
  .char-detail-hero {
    display: flex; flex-direction: column; align-items: center;
    background: var(--bg-card);
    border: 1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    border-radius: var(--radius-card);
    padding: 22px 18px; margin-bottom: 14px;
    box-shadow: var(--shadow-sm);
  }
  .char-detail-avatar-big {
    width: 96px; height: 96px; border-radius: 50%;
    background: color-mix(in srgb, var(--accent-light) 50%, transparent);
    background-size: cover; background-position: center;
    display: flex; align-items: center; justify-content: center;
    color: var(--accent-dark); overflow: hidden;
    box-shadow: var(--shadow-md); margin-bottom: 12px;
  }
  .char-detail-name {
    font-size: var(--font-size-title); font-weight: 700; color: var(--text-primary);
  }
  .char-detail-nickname {
    font-size: var(--font-size-base); color: var(--text-secondary); margin-top: 2px;
  }
  .char-detail-relation {
    margin-top: 8px;
    display: inline-flex; align-items: center; gap: 4px;
    font-size: var(--font-size-small); color: var(--accent-dark);
    background: color-mix(in srgb, var(--accent-light) 55%, transparent);
    padding: 4px 12px; border-radius: 999px;
  }
  .char-detail-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; justify-content: center; }

  .char-detail-section {
    background: var(--bg-card);
    border: 1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    border-radius: var(--radius-card);
    padding: 14px; margin-bottom: 12px;
    box-shadow: var(--shadow-sm);
  }
  .char-detail-section-title {
    font-size: var(--font-size-base); font-weight: 600; color: var(--text-secondary);
    margin-bottom: 8px; display: flex; align-items: center; gap: 6px;
  }
  .char-detail-section-title .popo-icon-svg { color: var(--accent); }
  .char-detail-section-content {
    font-size: var(--font-size-base); color: var(--text-primary);
    line-height: 1.6; word-break: break-word; white-space: pre-wrap;
  }
  .char-detail-section-empty {
    font-size: var(--font-size-small); color: var(--text-hint); font-style: italic;
  }
  .char-detail-temp-row {
    display: flex; align-items: center; gap: 10px;
  }
  .char-detail-temp-bar {
    flex: 1; height: 8px; border-radius: 4px;
    background: color-mix(in srgb, var(--text-hint) 24%, transparent);
    overflow: hidden;
  }
  .char-detail-temp-fill {
    height: 100%; background: var(--accent); border-radius: 4px;
    transition: width var(--motion) var(--motion-spring);
  }
  .char-detail-temp-v {
    min-width: 42px; text-align: right;
    font-size: var(--font-size-base); font-weight: 600; color: var(--accent-dark);
  }

  /* 独立数据面板 */
  .char-data-grid { display: flex; flex-direction: column; gap: 10px; }
  .char-data-card {
    display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
    background: var(--bg-card);
    border: 1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    border-radius: var(--radius-card);
    padding: 12px 14px;
    cursor: pointer; transition: var(--motion);
  }
  .char-data-card:active { transform: scale(var(--press-scale)); }
  .char-data-card-icon {
    width: 38px; height: 38px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
    background: color-mix(in srgb, var(--accent) 14%, transparent);
    color: var(--accent);
  }
  .char-data-card-main { flex: 1; min-width: 0; }
  .char-data-card-title {
    font-size: var(--font-size-base); font-weight: 600; color: var(--text-primary);
  }
  .char-data-card-sub {
    font-size: var(--font-size-small); color: var(--text-secondary);
    margin-top: 2px; line-height: 1.4;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .char-data-card-count {
    font-size: var(--font-size-small); font-weight: 600;
    color: var(--accent-dark);
    background: color-mix(in srgb, var(--accent-light) 55%, transparent);
    padding: 2px 10px; border-radius: 999px; flex-shrink: 0;
  }
  .char-data-card-arrow { color: var(--text-hint); flex-shrink: 0; }
  .char-data-preview-list {
    margin-top: 8px; display: flex; flex-direction: column; gap: 4px;
  }
  .char-data-preview-item {
    font-size: var(--font-size-small); color: var(--text-secondary);
    line-height: 1.4;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
`);

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
export function escapeAttr(s) { return escapeHTML(s); }
export function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, '\\$&');
}
export function truncate(s, n) {
  const str = String(s ?? '');
  if (str.length <= n) return str;
  return str.slice(0, n) + '…';
}

// 渲染头像（带默认图标兜底），返回 HTML 字符串
export function renderAvatarHTML(c, size = 56) {
  const av = c && c.avatar;
  if (isUsableImage(av)) {
    return `<div class="char-avatar" style="width:${size}px;height:${size}px;background-image:${cssUrl(av)}"></div>`;
  }
  return `<div class="char-avatar" style="width:${size}px;height:${size}px">${createIcon('smile', Math.round(size * 0.5)).outerHTML}</div>`;
}

// 把逗号/顿号/空格分隔的标签字符串拆成数组
export function parseTags(raw) {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  return String(raw || '')
    .split(/[,，、\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// 把数组拼成展示用的标签 HTML
export function renderTagsHTML(tags, cls = 'char-tag-mini') {
  if (!Array.isArray(tags) || !tags.length) return '';
  return tags.map((t) => `<span class="${cls}">${escapeHTML(t)}</span>`).join('');
}
