// apps/games/shared.js
// 小游戏合集的公共工具 —— 我把跨游戏用的小函数都收在这里，免得每个游戏都重写一遍。
// 内容：HTML 转义 / 通用历史列表渲染 / AI 题目与回应包装 / 通用空状态。
// 红线：图标只用 SVG 线稿（createIcon），禁止任何 emoji 字符；视觉值走 CSS 变量。

import { createIcon, showToast } from '../../core/ui.js';
import { chatOnce, isAIConfigured } from '../../core/ai-client.js';
import { pick } from '../../core/util.js';
import { formatRelative } from '../../core/util.js';

// ════════════════════════════════════════
// HTML 转义：渲染用户输入 / DB 字段时必须用，防 XSS
// ════════════════════════════════════════

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
export function escapeAttr(s) { return escapeHTML(s); }

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ════════════════════════════════════════
// AI 包装：有配置走 chatOnce，没配置走本地兜底
// 这样每个游戏不用重复处理 not_configured 分支
// ════════════════════════════════════════

/**
 * 调 AI 拿一段文本。失败/未配置都返回 fallback，调用方无感。
 * @param {string} systemPrompt 系统提示
 * @param {string} userPrompt 用户输入
 * @param {string} fallback 本地兜底文案
 * @returns {Promise<string>}
 */
export async function aiText(systemPrompt, userPrompt, fallback) {
  if (!isAIConfigured()) return fallback;
  try {
    const r = await chatOnce({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    });
    if (r && r.ok && r.text) return r.text.trim();
    return fallback;
  } catch (e) {
    console.warn('[games] AI 调用失败，走兜底', e);
    return fallback;
  }
}

/**
 * 通用历史列表渲染。
 * @param {HTMLElement} el 容器
 * @param {Array} list DB 读出的记录数组
 * @param {Function} renderRow (record) => HTML 字符串，单条卡片的 innerHTML
 * @param {Function} onDelete (record) => Promise，点删除时调用
 * @param {object} emptyOpts {icon, text} 空状态配置
 */
export function renderHistoryList(el, list, renderRow, onDelete, emptyOpts = {}) {
  if (!el) return;
  if (!Array.isArray(list) || list.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="games-empty-icon">${createIcon(emptyOpts.icon || 'dream', 48).outerHTML}</div>
        <div class="empty-state-text">${escapeHTML(emptyOpts.text || '还没有记录呀')}</div>
      </div>
    `;
    return;
  }
  // 按时间倒序
  const sorted = list.slice().sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
  el.innerHTML = sorted.map(renderRow).join('');
  el.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.del;
      try {
        await onDelete(id);
        showToast('删掉啦', 'default', 1000);
      } catch (err) {
        console.warn('[games] 删除失败', err);
        showToast('没删掉，再试一下嘛', 'error');
      }
    });
  });
}

// 时间标签的小工具，给历史卡片用
export function timeLabel(rec) {
  return escapeHTML(formatRelative(rec.createdAt));
}

// 通用历史卡片外框：左边主内容 + 右边删除按钮
// inner 是主内容 HTML，tagHtml 是可选的标签 HTML
export function historyCardHTML(rec, inner, tagHTML = '') {
  return `
    <div class="games-history-item" data-id="${escapeAttr(rec.id)}">
      <div class="games-history-main">
        <div class="games-history-top">
          ${tagHTML}
          <span class="games-history-time">${timeLabel(rec)}</span>
        </div>
        ${inner}
      </div>
      <button class="games-history-del" data-del="${escapeAttr(rec.id)}" aria-label="删除">${createIcon('trash', 16).outerHTML}</button>
    </div>
  `;
}
