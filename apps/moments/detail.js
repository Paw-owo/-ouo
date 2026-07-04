// apps/moments/detail.js
// 朋友圈动态详情页——点开一条动态看全文、看大图、看所有评论、再点个赞或留个言。
// 全屏覆盖层，点图片进大图查看器，操作栏支持点赞 / 更多（置顶 / 删除）。
// 红线：图标只准 SVG 线稿，禁止 emoji；视觉值走 CSS 变量。
// 依赖：core/storage.js, core/ui.js, core/events.js, ./shared.js, ./comments.js

import { STORES } from '../../core/storage-keys.js';
import { getDB } from '../../core/storage.js';
import { showToast, showBottomSheet, createIcon } from '../../core/ui.js';
import {
  escapeHTML, escapeAttr, normalizeMoment, renderAvatar, renderImages,
  formatRelative, canDelete, toggleLike, togglePin, deleteMomentWithConfirm
} from './shared.js';
import { renderCommentSectionHTML, bindCommentSection } from './comments.js';

// ════════════════════════════════════════
// 大图查看器
// ════════════════════════════════════════

function openImageViewer(src) {
  if (!src) return;
  const overlay = document.createElement('div');
  overlay.className = 'mom-img-viewer';
  overlay.innerHTML = `
    <button class="mom-img-viewer-close" aria-label="关闭">${createIcon('close', 22).outerHTML}</button>
    <img src="${escapeAttr(src)}" alt="">
  `;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener('click', close);
  // 阻止图片点击冒泡关闭（点图片不关，点空白才关）——其实点哪都关也行，体验上更简单
  return overlay;
}

// ════════════════════════════════════════
// 详情页主体
// ════════════════════════════════════════

/**
 * 打开某条动态的详情页（全屏覆盖层）。
 * @param {string} momentId
 * @param {object} charAvatarMap 角色头像映射
 * @param {function} onChange 动态变化时回调（刷新外层列表），删除时传 null
 */
export async function openDetail(momentId, charAvatarMap = {}, onChange) {
  let moment = normalizeMoment(await getDB(STORES.moments, momentId));
  if (!moment) {
    showToast('这条动态不见啦', 'error');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'mom-detail-overlay';
  document.body.appendChild(overlay);

  const renderShell = () => {
    overlay.innerHTML = `
      <div class="mom-detail-header">
        <button class="app-back" aria-label="返回朋友圈">${createIcon('back', 20).outerHTML}</button>
        <div class="mom-detail-title">动态详情</div>
        <button class="app-back mom-detail-more" aria-label="更多" style="margin-left:auto">${createIcon('more', 20).outerHTML}</button>
      </div>
      <div class="mom-detail-body"></div>
    `;
    overlay.querySelector('.app-back').addEventListener('click', closeDetail);
    overlay.querySelector('.mom-detail-more').addEventListener('click', () => openMenu());
  };

  const renderBody = () => {
    const bodyEl = overlay.querySelector('.mom-detail-body');
    if (!bodyEl) return;
    const avatar = renderAvatar(moment.author, charAvatarMap);
    const time = formatRelative(moment.createdAt);
    const authorCls = moment.author === '初一' ? 'ai' : '';
    const pinBadge = moment.pinned
      ? `<span class="mom-pin-badge">${createIcon('pin', 12).outerHTML}置顶</span>`
      : '';
    const visBadge = moment.visibility === 'private'
      ? `<span class="mom-vis-badge">${createIcon('lock', 12).outerHTML}仅自己</span>`
      : '';
    const likeCount = moment.likes || 0;
    const likeLabel = likeCount > 0 ? String(likeCount) : '赞';
    const imagesHTML = renderImages(moment.images || [], { detail: true });
    const commentSectionHTML = renderCommentSectionHTML(moment, charAvatarMap);

    bodyEl.innerHTML = `
      <div class="mom-card ${moment.pinned ? 'pinned' : ''}" style="margin-bottom:16px;box-shadow:none;">
        <div class="mom-card-head">
          ${avatar}
          <div class="mom-card-meta">
            <div class="mom-author ${authorCls}">${escapeHTML(moment.author)}</div>
            <div class="mom-time">${escapeHTML(time)}</div>
            ${pinBadge}
            ${visBadge}
          </div>
        </div>
        ${moment.content ? `<div class="mom-content">${escapeHTML(moment.content)}</div>` : ''}
        ${imagesHTML}
        <div class="mom-actions">
          <button class="mom-action-btn mom-like ${moment.likedByMe ? 'liked' : ''}" aria-label="${moment.likedByMe ? '取消赞' : '点赞'}">
            ${createIcon('heart', 18).outerHTML}<span>${escapeHTML(likeLabel)}</span>
          </button>
          <button class="mom-action-btn mom-comment-btn" aria-label="评论">
            ${createIcon('chat', 18).outerHTML}<span>${(moment.comments || []).length || '评论'}</span>
          </button>
        </div>
      </div>
      <div class="mom-detail-comments"></div>
    `;

    // 点赞：局部刷新按钮状态，不清空正在输入的评论
    bodyEl.querySelector('.mom-like').addEventListener('click', async () => {
      const updated = await toggleLike(moment.id);
      if (updated) {
        moment = updated;
        const likeBtn = bodyEl.querySelector('.mom-like');
        if (likeBtn) {
          likeBtn.classList.toggle('liked', moment.likedByMe);
          const span = likeBtn.querySelector('span');
          if (span) span.textContent = moment.likes > 0 ? String(moment.likes) : '赞';
        }
        if (typeof onChange === 'function') onChange(updated);
      }
    });
    // 评论按钮：聚焦到输入框
    bodyEl.querySelector('.mom-comment-btn').addEventListener('click', () => {
      const input = bodyEl.querySelector('.mom-comment-input');
      if (input) { try { input.focus(); } catch (e) {} input.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    });
    // 图片 → 大图查看
    bodyEl.querySelectorAll('.mom-img').forEach((el) => {
      el.addEventListener('click', () => {
        const i = Number(el.dataset.i);
        const src = (moment.images || [])[i];
        if (src) openImageViewer(src);
      });
    });
    // 评论 section：列表由 bindCommentSection 内部 refreshList 维护，
    // 这里只在评论变化时同步评论数按钮，避免整块重渲染清掉输入框
    const commentsEl = bodyEl.querySelector('.mom-detail-comments');
    commentsEl.innerHTML = commentSectionHTML;
    bindCommentSection(commentsEl, moment, charAvatarMap, (updated) => {
      moment = updated;
      const cmtSpan = bodyEl.querySelector('.mom-comment-btn span');
      if (cmtSpan) cmtSpan.textContent = (updated.comments || []).length || '评论';
      if (typeof onChange === 'function') onChange(updated);
    });
  };

  function closeDetail() {
    overlay.remove();
  }

  function openMenu() {
    const body = document.createElement('div');
    const pinLabel = moment.pinned ? '取消置顶' : '置顶';
    const pinIcon = createIcon('pin', 18).outerHTML;
    const delItem = canDelete(moment)
      ? `<button class="mom-menu-item danger" data-act="del">${createIcon('trash', 18).outerHTML}删除</button>`
      : '';
    body.innerHTML = `
      <button class="mom-menu-item" data-act="pin">${pinIcon}${escapeHTML(pinLabel)}</button>
      ${delItem}
    `;
    const sheet = showBottomSheet({ title: '操作', bodyElement: body, dismissible: true });
    body.addEventListener('click', async (e) => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'pin') {
        sheet.close();
        const updated = await togglePin(moment.id);
        if (updated) {
          moment = updated;
          renderBody();
          if (typeof onChange === 'function') onChange(updated);
        }
      } else if (act === 'del') {
        sheet.close();
        deleteMomentWithConfirm(moment, (ok) => {
          if (ok) {
            closeDetail();
            if (typeof onChange === 'function') onChange(null);
          }
        });
      }
    });
  }

  renderShell();
  renderBody();
  // 默认滚到顶部
  requestAnimationFrame(() => {
    const bodyEl = overlay.querySelector('.mom-detail-body');
    if (bodyEl) bodyEl.scrollTop = 0;
  });
}
