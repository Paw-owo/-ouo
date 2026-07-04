// apps/worldbook/shared.js
// 世界书共用层——样式、常量、小工具都收在这里，方便 index / form / match / io 复用。
// 红线：图标只准 SVG 线稿（createIcon），禁止任何 emoji 字符；视觉值全部走 CSS 变量。
// 依赖：core/ui.js, core/util.js

import { createIcon } from '../../core/ui.js';
import { injectStyle, isUsableImage, cssUrl } from '../../core/util.js';

// ════════════════════════════════════════
// 常量
// ════════════════════════════════════════

export const DEFAULT_PRIORITY = 0;
export const MAX_PRIORITY = 9999;

// 默认分类（用户也可自定义）
export const DEFAULT_CATEGORY = '';
// 「全部」分类的占位 key
export const CATEGORY_ALL = '__all__';

// 导出文件版本
export const EXPORT_VERSION = 1;
export const EXPORT_KIND = 'popo-worldbook';

// ════════════════════════════════════════
// 样式（全部走 CSS 变量，跟着主题变）
// ════════════════════════════════════════

injectStyle('app-worldbook-style', `
  .wb-search-wrap { position: relative; margin-bottom: 14px; }
  .wb-search-wrap .popo-icon {
    position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
    color: var(--text-hint); pointer-events: none;
  }
  .wb-search {
    width: 100%; box-sizing: border-box;
    padding: 11px 16px 11px 42px;
    background: color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    border: 1px solid color-mix(in srgb, var(--text-hint) 18%, transparent);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base); color: var(--text-primary);
    transition: var(--motion);
  }
  .wb-search:focus { border-color: var(--accent); background: var(--bg-card); outline: none; }

  /* 分类文件夹标签条 */
  .wb-category-bar {
    display: flex; gap: 8px; overflow-x: auto;
    padding: 2px 2px 12px;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  .wb-category-bar::-webkit-scrollbar { display: none; }
  .wb-category {
    flex-shrink: 0;
    padding: 7px 16px; border-radius: 999px;
    background: color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    color: var(--text-secondary);
    font-size: var(--font-size-small); font-weight: 500;
    border: 1px solid transparent;
    transition: var(--motion);
    white-space: nowrap;
  }
  .wb-category:active { transform: scale(var(--press-scale)); }
  .wb-category.active {
    background: color-mix(in srgb, var(--accent) 18%, transparent);
    color: var(--accent-dark);
    border-color: color-mix(in srgb, var(--accent) 40%, transparent);
  }

  .wb-list-head {
    display: flex; align-items: center; justify-content: space-between;
    margin: 4px 2px 10px;
  }
  .wb-list-head-title {
    font-size: var(--font-size-base); font-weight: 600; color: var(--text-secondary);
  }
  .wb-list-head-count {
    font-size: var(--font-size-small); color: var(--text-hint);
  }

  .wb-card {
    background: var(--bg-card);
    border: 1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    border-radius: var(--radius-card);
    padding: 14px;
    margin-bottom: 12px;
    transition: var(--motion);
  }
  .wb-card.disabled { opacity: 0.55; }
  .wb-card-row { display: flex; align-items: flex-start; gap: 10px; }
  .wb-card-main { flex: 1; min-width: 0; cursor: pointer; }
  .wb-card-keyword-row {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px;
  }
  .wb-card-keyword {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: var(--font-size-base); font-weight: 600;
    color: var(--accent-dark);
    background: color-mix(in srgb, var(--accent-light) 55%, transparent);
    padding: 3px 10px; border-radius: 999px;
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .wb-card-category {
    font-size: var(--font-size-small); color: var(--text-secondary);
    background: color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    padding: 2px 8px; border-radius: 999px;
  }
  .wb-card-trigger-count {
    display: inline-flex; align-items: center; gap: 3px;
    font-size: var(--font-size-small); color: var(--text-hint);
  }
  .wb-card-trigger-count .popo-icon-svg { color: var(--accent); }
  .wb-card-priority {
    font-size: var(--font-size-small); color: var(--text-hint);
    flex-shrink: 0;
  }
  .wb-card-triggers {
    display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px;
  }
  .wb-card-trigger-tag {
    font-size: var(--font-size-small); color: var(--text-secondary);
    background: color-mix(in srgb, var(--text-hint) 12%, transparent);
    padding: 1px 8px; border-radius: 999px;
  }
  .wb-card-content {
    font-size: var(--font-size-small); color: var(--text-secondary);
    line-height: 1.5; margin-top: 6px;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
    overflow: hidden; word-break: break-word;
  }
  .wb-card-chars {
    display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; align-items: center;
  }
  .wb-card-chars-label {
    font-size: var(--font-size-small); color: var(--text-hint);
  }
  .wb-card-char-chip {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: var(--font-size-small); color: var(--text-primary);
    background: color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    padding: 2px 8px 2px 2px; border-radius: 999px;
  }
  .wb-card-char-avatar {
    width: 18px; height: 18px; border-radius: 50%;
    background: color-mix(in srgb, var(--accent-light) 50%, transparent);
    background-size: cover; background-position: center;
    display: flex; align-items: center; justify-content: center;
    color: var(--accent-dark); overflow: hidden; flex-shrink: 0;
  }
  .wb-card-char-global {
    font-size: var(--font-size-small); color: var(--accent-dark);
    background: color-mix(in srgb, var(--accent-light) 45%, transparent);
    padding: 2px 8px; border-radius: 999px;
  }
  .wb-card-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
  .wb-icon-btn {
    width: 32px; height: 32px; border-radius: 50%;
    background: transparent; color: var(--text-hint);
    display: flex; align-items: center; justify-content: center;
    transition: var(--motion);
  }
  .wb-icon-btn:active { transform: scale(var(--press-scale)); }

  /* 启用开关（纯 SVG 线稿风，无 emoji） */
  .wb-toggle {
    width: 44px; height: 26px; border-radius: 999px;
    background: color-mix(in srgb, var(--text-hint) 30%, transparent);
    position: relative; cursor: pointer; transition: var(--motion);
    flex-shrink: 0; border: none; padding: 0;
  }
  .wb-toggle.on { background: var(--accent); }
  .wb-toggle-thumb {
    position: absolute; top: 3px; left: 3px;
    width: 20px; height: 20px; border-radius: 50%;
    background: #fff; box-shadow: var(--shadow-sm);
    transition: var(--motion) var(--motion-spring);
    display: flex; align-items: center; justify-content: center;
    color: var(--text-hint);
  }
  .wb-toggle.on .wb-toggle-thumb {
    left: 21px; color: var(--accent);
  }

  .wb-empty {
    display: flex; flex-direction: column; align-items: center;
    padding: 60px 24px; text-align: center; color: var(--text-hint);
  }
  .wb-empty-icon {
    color: var(--accent); opacity: 0.6; margin-bottom: 14px;
    display: flex; justify-content: center;
  }
  .wb-empty-text {
    font-size: var(--font-size-base); color: var(--text-secondary); line-height: 1.6;
  }

  /* 表单 */
  .wb-form-row { margin-bottom: 12px; }
  .wb-form-label {
    font-size: var(--font-size-small); color: var(--text-secondary);
    margin-bottom: 6px; display: block;
  }
  .wb-form-hint {
    font-size: var(--font-size-small); color: var(--text-hint);
    margin-top: 4px; line-height: 1.4;
  }
  .wb-priority-row { display: flex; align-items: center; gap: 10px; }
  .wb-priority-input { width: 90px; flex-shrink: 0; }
  .wb-enable-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px; border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--bg-secondary) 50%, transparent);
  }
  .wb-enable-row label {
    flex: 1; font-size: var(--font-size-base); color: var(--text-primary); cursor: pointer;
  }

  /* 多选清单（关联角色） */
  .wb-multiselect {
    max-height: 180px; overflow-y: auto;
    border: 1px solid color-mix(in srgb, var(--text-hint) 18%, transparent);
    border-radius: var(--radius-md);
    padding: 4px; background: color-mix(in srgb, var(--bg-secondary) 30%, transparent);
  }
  .wb-multiselect-empty {
    padding: 14px; text-align: center;
    font-size: var(--font-size-small); color: var(--text-hint);
  }
  .wb-check-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 10px; border-radius: var(--radius-sm);
    cursor: pointer; transition: var(--motion);
  }
  .wb-check-row:active { transform: scale(var(--press-scale)); }
  .wb-check-row input { flex-shrink: 0; width: 18px; height: 18px; accent-color: var(--accent); }
  .wb-check-row-label { flex: 1; min-width: 0; font-size: var(--font-size-base); color: var(--text-primary); }

  .wb-actions-row { display: flex; gap: 8px; }
  .wb-actions-row .btn { flex: 1; justify-content: center; }

  /* 测试触发结果 */
  .wb-test-result {
    margin-top: 14px;
  }
  .wb-test-result-title {
    font-size: var(--font-size-base); font-weight: 600; color: var(--text-secondary);
    margin-bottom: 8px;
  }
  .wb-test-hit {
    background: color-mix(in srgb, var(--accent-light) 30%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
    border-radius: var(--radius-md);
    padding: 10px 12px; margin-bottom: 8px;
  }
  .wb-test-hit-keyword {
    font-size: var(--font-size-base); font-weight: 600; color: var(--accent-dark);
  }
  .wb-test-hit-content {
    font-size: var(--font-size-small); color: var(--text-secondary);
    line-height: 1.5; margin-top: 4px; word-break: break-word;
  }
  .wb-test-empty {
    font-size: var(--font-size-small); color: var(--text-hint);
    padding: 14px; text-align: center;
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
export function clamp(v, min, max) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

// 把逗号/顿号/空格分隔的触发词字符串拆成数组
export function parseList(raw) {
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  return String(raw || '')
    .split(/[,，、\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

// 渲染角色小头像 HTML（用于卡片关联角色标签）
export function renderCharAvatarHTML(character) {
  const av = character && character.avatar;
  if (isUsableImage(av)) {
    return `<span class="wb-card-char-avatar" style="background-image:${cssUrl(av)}"></span>`;
  }
  return `<span class="wb-card-char-avatar">${createIcon('smile', 12).outerHTML}</span>`;
}
