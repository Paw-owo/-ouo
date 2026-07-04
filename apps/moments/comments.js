// apps/moments/comments.js
// 朋友圈的评论模块——我帮主人和初一在这里聊起来。
// 支持发评论、回复（@前缀）、删自己的评论，列表按时间升序。
// 评论字段：{id, author, text, replyTo(评论id|null), createdAt}
// 红线：图标只准 SVG 线稿，禁止 emoji；视觉值走 CSS 变量。
// 依赖：core/storage.js, core/ui.js, core/events.js, ./shared.js

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import {
  escapeHTML, escapeAttr, normalizeMoment, renderAvatar, formatRelative
} from './shared.js';

// ════════════════════════════════════════
// 渲染：单条评论的回复前缀
// ════════════════════════════════════════

/** 找到被回复的评论作者，找不到就返回空（被删了就不再显示前缀） */
function replyTargetName(c, moment) {
  if (!c.replyTo) return '';
  const orig = (moment.comments || []).find((x) => x.id === c.replyTo);
  return orig ? orig.author : '';
}

/** 评论按 createdAt 升序（早的在上） */
function sortCommentsAsc(list) {
  return (list || []).slice().sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return ta - tb;
  });
}

// ════════════════════════════════════════
// 渲染：列表卡片里的评论预览（最近 2 条）
// ════════════════════════════════════════

export function renderCommentPreview(moment, charAvatarMap = {}) {
  const all = sortCommentsAsc(moment.comments || []);
  if (all.length === 0) return '';
  const recent = all.slice(-2); // 最近 2 条
  const items = recent.map((c) => {
    const authorCls = c.author === '初一' ? 'ai' : '';
    const tgt = replyTargetName(c, moment);
    const tgtHTML = tgt ? `<span class="mom-comment-reply-to">回复 @${escapeHTML(tgt)}</span>` : '';
    return `
      <div class="mom-comment">
        <span class="mom-comment-author ${authorCls}">${escapeHTML(c.author)}</span>${tgtHTML}<span>${escapeHTML(c.text)}</span>
      </div>
    `;
  }).join('');
  const more = all.length > 2
    ? `<button class="mom-comment-more" data-act="all">查看全部 ${all.length} 条评论</button>`
    : '';
  return `
    <div class="mom-comments-preview">
      ${items}
      ${more}
    </div>
  `;
}

// ════════════════════════════════════════
// 渲染：完整评论列表（详情页 / sheet 通用）
// ════════════════════════════════════════

function renderCommentItem(c, moment, charAvatarMap) {
  const avatar = renderAvatar(c.author, charAvatarMap);
  const authorCls = c.author === '初一' ? 'ai' : '';
  const tgt = replyTargetName(c, moment);
  const tgtHTML = tgt ? `<span class="mom-comment-reply-to">回复 @${escapeHTML(tgt)}</span>` : '';
  const time = formatRelative(c.createdAt);
  // 只有自己的评论能删
  const canDel = c.author === '我';
  const delBtn = canDel
    ? `<button class="mom-comment-act danger" data-act="del" data-id="${escapeAttr(c.id)}">删除</button>`
    : '';
  return `
    <div class="mom-comment-item" data-id="${escapeAttr(c.id)}">
      ${avatar}
      <div class="mom-comment-main">
        <div class="mom-comment-bubble">
          <span class="mom-comment-author ${authorCls}">${escapeHTML(c.author)} </span>${tgtHTML}<span class="mom-comment-text">${escapeHTML(c.text)}</span>
        </div>
        <div class="mom-comment-meta">
          <span>${escapeHTML(time)}</span>
          <button class="mom-comment-act" data-act="reply" data-id="${escapeAttr(c.id)}" data-name="${escapeAttr(c.author)}">回复</button>
          ${delBtn}
        </div>
      </div>
    </div>
  `;
}

/** 完整评论 section 的 HTML（列表 + 输入条），供 sheet 和详情页复用 */
export function renderCommentSectionHTML(moment, charAvatarMap = {}) {
  const all = sortCommentsAsc(moment.comments || []);
  const listHTML = all.length > 0
    ? all.map((c) => renderCommentItem(c, moment, charAvatarMap)).join('')
    : `<div style="color:var(--text-hint);font-size:var(--font-size-small);padding:8px 0;">还没有评论，留一句吧</div>`;
  return `
    <div class="mom-comment-section">
      <div class="mom-comment-list">${listHTML}</div>
      <div class="mom-input-bar">
        <div class="mom-input-wrap">
          <div class="mom-reply-chip" hidden>
            <span class="mom-reply-chip-text"></span>
            <button class="mom-reply-chip-close" aria-label="取消回复">${createIcon('close', 14).outerHTML}</button>
          </div>
          <textarea class="textarea mom-comment-input" placeholder="写句评论吧..." maxlength="300"></textarea>
        </div>
        <button class="btn primary mom-send-btn" id="mom-send-cmt">${createIcon('edit', 16).outerHTML}发送</button>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════
// 绑定：评论 section 的事件（回复 / 删除 / 发送）
// ════════════════════════════════════════

/**
 * 给一个包含 renderCommentSectionHTML 输出的容器绑定事件。
 * @param {HTMLElement} rootEl 容器
 * @param {object} moment 当前动态（规整后）
 * @param {object} charAvatarMap
 * @param {function} onUpdated 评论变化后的回调（刷新外层列表）
 * @returns {function} 取消绑定（暂未用到，预留）
 */
export function bindCommentSection(rootEl, moment, charAvatarMap, onUpdated) {
  if (!rootEl) return () => {};

  // 当前回复状态
  let replyTo = null;     // 被回复评论 id
  let replyName = '';     // 被回复者名字

  const listEl = rootEl.querySelector('.mom-comment-list');
  const chipEl = rootEl.querySelector('.mom-reply-chip');
  const chipTextEl = rootEl.querySelector('.mom-reply-chip-text');
  const chipClose = rootEl.querySelector('.mom-reply-chip-close');
  const inputEl = rootEl.querySelector('.mom-comment-input');
  const sendBtn = rootEl.querySelector('#mom-send-cmt');

  const setReply = (id, name) => {
    replyTo = id;
    replyName = name;
    if (id) {
      chipEl.hidden = false;
      chipTextEl.textContent = `回复 @${name}`;
      inputEl.placeholder = `回复 @${name}：`;
    } else {
      chipEl.hidden = true;
      inputEl.placeholder = '写句评论吧...';
    }
    setTimeout(() => { try { inputEl.focus(); } catch (e) {} }, 30);
  };

  const refreshList = (updated) => {
    if (!listEl) return;
    const all = sortCommentsAsc(updated.comments || []);
    listEl.innerHTML = all.length > 0
      ? all.map((c) => renderCommentItem(c, updated, charAvatarMap)).join('')
      : `<div style="color:var(--text-hint);font-size:var(--font-size-small);padding:8px 0;">还没有评论，留一句吧</div>`;
  };

  // 列表事件委托：回复 / 删除
  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.dataset.id;
    if (act === 'reply') {
      const name = btn.dataset.name || 'ta';
      setReply(id, name);
      return;
    }
    if (act === 'del') {
      const current = await getDB(STORES.moments, moment.id);
      if (!current) return;
      const norm = normalizeMoment(current);
      const target = (norm.comments || []).find((c) => c.id === id);
      if (!target) return;
      if (target.author !== '我') {
        showToast('只能删自己的评论哦', 'error');
        return;
      }
      showConfirm({
        title: '删掉这条评论吗？',
        body: '删掉就找不回来啦',
        confirmText: '删掉吧',
        cancelText: '留着',
        danger: true,
        onConfirm: async () => {
          try {
            const fresh = normalizeMoment(await getDB(STORES.moments, moment.id));
            fresh.comments = (fresh.comments || []).filter((c) => c.id !== id);
            await setDB(STORES.moments, fresh.id, fresh);
            refreshList(fresh);
            if (typeof onUpdated === 'function') onUpdated(fresh);
            showToast('删掉啦', 'default', 1200);
          } catch (err) {
            console.warn('[moments] 删评论失败', err);
            showToast('没删掉，再试一下嘛', 'error');
          }
        }
      });
    }
  });

  // 取消回复
  if (chipClose) chipClose.addEventListener('click', () => setReply(null, ''));

  // 发送评论
  const doSend = async () => {
    const text = (inputEl.value || '').trim();
    if (!text) {
      showToast('写点什么再发送嘛', 'error');
      return;
    }
    try {
      const fresh = normalizeMoment(await getDB(STORES.moments, moment.id));
      if (!fresh) {
        showToast('这条动态不见啦', 'error');
        return;
      }
      const cmt = {
        id: generateId('cmt'),
        author: '我',
        text,
        replyTo: replyTo || null,
        createdAt: getNow()
      };
      fresh.comments = (fresh.comments || []).concat([cmt]);
      await setDB(STORES.moments, fresh.id, fresh);
      // 事件注入：消息中心会捕获
      bus.emit('moments:commented', {
        commentBy: '我',
        text,
        momentId: fresh.id,
        preview: (fresh.content || '').slice(0, 30)
      });
      inputEl.value = '';
      setReply(null, '');
      refreshList(fresh);
      if (typeof onUpdated === 'function') onUpdated(fresh);
    } catch (err) {
      console.warn('[moments] 发评论失败', err);
      showToast('没发出去，再试一下嘛', 'error');
    }
  };

  if (sendBtn) sendBtn.addEventListener('click', doSend);
  if (inputEl) {
    inputEl.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Enter 快速发送
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        doSend();
      }
    });
  }

  return () => {};
}

// ════════════════════════════════════════
// 评论 bottomSheet（点列表卡片的「评论」按钮时弹出）
// ════════════════════════════════════════

export async function openCommentSheet(momentId, charAvatarMap = {}, onUpdated) {
  let moment = normalizeMoment(await getDB(STORES.moments, momentId));
  if (!moment) {
    showToast('这条动态不见啦', 'error');
    return;
  }
  const body = document.createElement('div');
  body.innerHTML = renderCommentSectionHTML(moment, charAvatarMap);
  const count = (moment.comments || []).length;
  const sheet = showBottomSheet({
    title: `评论 ${count}`,
    bodyElement: body,
    dismissible: true
  });
  bindCommentSection(body, moment, charAvatarMap, async (updated) => {
    moment = updated;
    // 同步标题里的数量
    const titleEl = sheet.sheet.querySelector('.popo-sheet-title');
    if (titleEl) titleEl.textContent = `评论 ${(updated.comments || []).length}`;
    if (typeof onUpdated === 'function') onUpdated(updated);
  });
  // 自动聚焦输入框
  setTimeout(() => { try { body.querySelector('.mom-comment-input')?.focus(); } catch (e) {} }, 80);
}

// ════════════════════════════════════════
// 给 AI 自动评论用的写入接口（不弹 UI，不弹 toast）
// ════════════════════════════════════════

/**
 * 让某个角色直接给动态加一条评论（AI 自动评论用）。
 * @returns {Promise<object|null>} 更新后的 moment，失败返回 null
 */
export async function addCommentBy(momentId, author, text, replyTo = null) {
  try {
    const fresh = normalizeMoment(await getDB(STORES.moments, momentId));
    if (!fresh) return null;
    const cmt = {
      id: generateId('cmt'),
      author,
      text,
      replyTo: replyTo || null,
      createdAt: getNow()
    };
    fresh.comments = (fresh.comments || []).concat([cmt]);
    await setDB(STORES.moments, fresh.id, fresh);
    return fresh;
  } catch (e) {
    console.warn('[moments] AI 写入评论失败', e);
    return null;
  }
}
