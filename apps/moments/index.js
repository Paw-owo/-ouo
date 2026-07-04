// apps/moments/index.js
// 朋友圈 App——软萌少女风 PWA「泡泡」。
// 我和初一（还有其他角色）一起发动态、互相点赞、留言回复，把每天的小心情都记下来。
// 数据：IndexedDB（STORES.moments）
//   字段 {id, author('初一'|'我'|角色名), content, images[], likes(number),
//        likedByMe(bool), comments[{id,author,text,replyTo,createdAt}],
//        pinned(bool), visibility('public'|'private'), createdAt, updatedAt}
// 旧版 likes:{liked,count} 会在读取时自动迁移成新格式（见 shared.normalizeMoment）。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js,
//       core/ai-client.js, ./shared.js, ./comments.js, ./ai-post.js, ./detail.js

import { STORES, KEYS } from '../../core/storage-keys.js';
import { getAllDB, setDB, generateId, getNow, compressImage, getData } from '../../core/storage.js';
import { showToast, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { pickImageFile } from '../../core/util.js';
import {
  MAX_IMAGES, escapeHTML, escapeAttr, cssEscape, normalizeMoment,
  renderAvatar, renderImages, buildCharAvatarMap, bindLongPress,
  canDelete, toggleLike, togglePin, deleteMomentWithConfirm, formatRelative
} from './shared.js';
import { renderCommentPreview, openCommentSheet } from './comments.js';
import { aiPost, scheduleAIReactions, maybeAutoPost } from './ai-post.js';
import { openDetail } from './detail.js';
import { openApp } from '../../core/router.js';
import { applyAppBg } from '../../core/app-bg.js';

let containerEl = null;
let activeFilter = '全部';     // 当前角色筛选：'全部' | '我' | 角色名
let charAvatarMap = {};         // {name: avatarDataURL}，每次 render 前刷新
let characterNames = [];        // 所有角色名，给筛选条用

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container) {
  containerEl = container;
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="mom-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">朋友圈</div>
      <button class="app-header-gear" id="mom-settings" aria-label="朋友圈设置">${createIcon('settings', 18).outerHTML}</button>
      <button class="app-add" id="mom-add" aria-label="发动态">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="mom-body">
      <div class="mom-filter-bar" id="mom-filter-bar"></div>
      <button class="mom-ai-post" id="mom-ai-post">${createIcon('smile', 18).outerHTML}让她发一条</button>
      <div id="mom-list"></div>
    </div>
  `;
  container.querySelector('#mom-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#mom-add').addEventListener('click', () => openEditor());
  // 齿轮跳到设置「外观」分组
  container.querySelector('#mom-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'appearance' } }));
  container.querySelector('#mom-ai-post').addEventListener('click', async () => {
    await aiPost();
    await render();
  });
  await render();
  applyAppBg(container, 'moments');
  // 进入朋友圈时尝试让当前角色主动发动态（24h 内同一事件只触发一次，30% 概率）
  // 不阻塞渲染：失败 / 不触发都不影响列表
  try {
    const cid = getData(KEYS.chatCurrentCharacter, 'char_chuyi');
    const posted = await maybeAutoPost(cid);
    if (posted) await render();
  } catch (e) {
    console.warn('[moments] 主动发动态失败', e);
  }
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 列表渲染
// ════════════════════════════════════════

async function render() {
  const bodyEl = containerEl?.querySelector('#mom-body');
  if (!bodyEl) return;
  const listEl = bodyEl.querySelector('#mom-list');
  const filterBarEl = bodyEl.querySelector('#mom-filter-bar');
  if (!listEl || !filterBarEl) return;

  // 预读角色（头像 + 名字）——筛选条要用名字，卡片要用头像
  charAvatarMap = await buildCharAvatarMap();
  characterNames = Object.keys(charAvatarMap);

  // 渲染筛选条：全部 / 我 / 各角色
  const tabs = ['全部', '我', ...characterNames];
  filterBarEl.innerHTML = tabs.map((name) => `
    <button class="mom-filter ${name === activeFilter ? 'active' : ''}" data-filter="${escapeAttr(name)}">${escapeHTML(name)}</button>
  `).join('');
  filterBarEl.querySelectorAll('.mom-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeFilter = btn.dataset.filter;
      render();
    });
  });

  // 读动态
  let moments = [];
  try {
    moments = await getAllDB(STORES.moments);
  } catch (e) {
    console.warn('[moments] 读取失败', e);
    showToast('动态读不出来嘛，等一下再试试', 'error');
  }
  if (!Array.isArray(moments)) moments = [];
  moments = moments.map(normalizeMoment);

  // 角色筛选
  if (activeFilter === '我') {
    moments = moments.filter((m) => m.author === '我');
  } else if (activeFilter !== '全部') {
    moments = moments.filter((m) => m.author === activeFilter);
  }

  // 排序：置顶在前，再按 createdAt 倒序
  moments.sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });

  if (moments.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="mom-empty-icon">${createIcon('chat', 48).outerHTML}</div>
        <div class="empty-state-text">${activeFilter === '全部' ? '还没有动态，发一条或者让她发一条嘛' : '这里还没有动态哦'}</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = moments.map(renderCard).join('');
  // 绑定每条事件
  moments.forEach((m) => {
    const card = listEl.querySelector(`[data-id="${cssEscape(m.id)}"]`);
    if (!card) return;
    bindCardEvents(card, m);
  });
}

function renderCard(m) {
  const avatar = renderAvatar(m.author, charAvatarMap);
  const relTime = formatRelative(m.createdAt);
  const likeCount = m.likes || 0;
  const likeLabel = likeCount > 0 ? String(likeCount) : '赞';
  const commentCount = (m.comments || []).length;
  const commentLabel = commentCount > 0 ? String(commentCount) : '评论';
  const imagesHTML = renderImages(m.images || []);
  const commentsPreviewHTML = renderCommentPreview(m, charAvatarMap);
  const pinBadge = m.pinned
    ? `<span class="mom-pin-badge">${createIcon('pin', 12).outerHTML}置顶</span>`
    : '';
  const visBadge = m.visibility === 'private'
    ? `<span class="mom-vis-badge">${createIcon('lock', 12).outerHTML}仅自己</span>`
    : '';
  return `
    <div class="mom-card ${m.pinned ? 'pinned' : ''}" data-id="${escapeAttr(m.id)}">
      <div class="mom-card-head">
        ${avatar}
        <div class="mom-card-meta">
          <div class="mom-author ${m.author === '初一' ? 'ai' : ''}">${escapeHTML(m.author)}</div>
          <div class="mom-time">${escapeHTML(relTime)}</div>
          ${pinBadge}
          ${visBadge}
        </div>
      </div>
      ${m.content ? `<div class="mom-content">${escapeHTML(m.content)}</div>` : ''}
      ${imagesHTML}
      <div class="mom-actions">
        <button class="mom-action-btn mom-like ${m.likedByMe ? 'liked' : ''}" data-act="like" aria-label="${m.likedByMe ? '取消赞' : '点赞'}">
          ${createIcon('heart', 18).outerHTML}<span>${escapeHTML(likeLabel)}</span>
        </button>
        <button class="mom-action-btn mom-comment-btn" data-act="comment" aria-label="评论">
          ${createIcon('chat', 18).outerHTML}<span>${escapeHTML(commentLabel)}</span>
        </button>
        <button class="mom-action-btn more" data-act="more" aria-label="更多">
          ${createIcon('more', 18).outerHTML}
        </button>
      </div>
      ${commentsPreviewHTML}
    </div>
  `;
}

// formatRelative 直接从 shared 引入，卡片时间用它显示「刚刚 / N 分钟前」

/** 给单张卡片绑定事件：点赞 / 评论 / 更多 / 进详情 / 长按菜单 */
function bindCardEvents(card, m) {
  // 点赞
  const likeBtn = card.querySelector('[data-act="like"]');
  if (likeBtn) {
    likeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const updated = await toggleLike(m.id);
      if (updated) {
        m.likes = updated.likes;
        m.likedByMe = updated.likedByMe;
        // 局部刷新这张卡片的点赞状态，体验更跟手
        likeBtn.classList.toggle('liked', m.likedByMe);
        const span = likeBtn.querySelector('span');
        if (span) span.textContent = m.likes > 0 ? String(m.likes) : '赞';
      }
    });
  }
  // 评论
  const commentBtn = card.querySelector('[data-act="comment"]');
  if (commentBtn) {
    commentBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openCommentSheet(m.id, charAvatarMap, async () => { await render(); });
    });
  }
  // 更多
  const moreBtn = card.querySelector('[data-act="more"]');
  if (moreBtn) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openMenu(m);
    });
  }
  // 点「查看全部评论」也进详情
  const viewAllBtn = card.querySelector('.mom-comment-more');
  if (viewAllBtn) {
    viewAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDetail(m.id, charAvatarMap, async () => { await render(); });
    });
  }
  // 点卡片其它区域进详情
  card.addEventListener('click', (e) => {
    if (e.target.closest('button')) return; // 按钮已经各自处理
    openDetail(m.id, charAvatarMap, async () => { await render(); });
  });
  // 长按弹菜单
  bindLongPress(card, () => openMenu(m));
}

// ════════════════════════════════════════
// 更多菜单（置顶 / 删除）
// ════════════════════════════════════════

function openMenu(m) {
  const body = document.createElement('div');
  const pinLabel = m.pinned ? '取消置顶' : '置顶';
  const delItem = canDelete(m)
    ? `<button class="mom-menu-item danger" data-act="del">${createIcon('trash', 18).outerHTML}删除</button>`
    : '';
  body.innerHTML = `
    <button class="mom-menu-item" data-act="pin">${createIcon('pin', 18).outerHTML}${escapeHTML(pinLabel)}</button>
    ${delItem}
  `;
  const sheet = showBottomSheet({ title: '操作', bodyElement: body, dismissible: true });
  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'pin') {
      sheet.close();
      await togglePin(m.id);
      await render();
    } else if (act === 'del') {
      sheet.close();
      deleteMomentWithConfirm(m, async () => { await render(); });
    }
  });
}

// ════════════════════════════════════════
// 发帖表单（bottomSheet）
// ════════════════════════════════════════

function openEditor() {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="mom-form-row">
      <textarea class="textarea" id="mom-text" placeholder="说点什么吧，发条动态..." maxlength="500"></textarea>
    </div>
    <div class="mom-form-row">
      <div class="mom-thumbs" id="mom-thumbs"></div>
      <button class="btn ghost mom-add-img" id="mom-add-img">${createIcon('camera', 18).outerHTML}添加图片</button>
    </div>
    <div class="mom-form-row">
      <label class="mom-add-img" style="display:inline-flex;margin-bottom:6px;">可见范围</label>
      <select class="input" id="mom-vis" style="width:100%;">
        <option value="public">公开</option>
        <option value="private">仅自己</option>
      </select>
    </div>
    <button class="btn primary block" id="mom-send">发出去</button>
  `;
  const sheet = showBottomSheet({
    title: '发条动态',
    bodyElement: body,
    dismissible: true
  });
  const images = [];
  const thumbsEl = body.querySelector('#mom-thumbs');
  const addImgBtn = body.querySelector('#mom-add-img');

  const renderThumbs = () => {
    thumbsEl.innerHTML = images
      .map((src, i) => `
        <div class="mom-thumb" data-i="${i}" style="background-image:url('${escapeAttr(src)}')">
          <button class="mom-thumb-del" aria-label="删除图片">${createIcon('close', 14).outerHTML}</button>
        </div>
      `)
      .join('');
    thumbsEl.querySelectorAll('.mom-thumb-del').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = Number(btn.parentElement.dataset.i);
        images.splice(idx, 1);
        renderThumbs();
        updateAddBtn();
      });
    });
  };
  const updateAddBtn = () => {
    addImgBtn.disabled = images.length >= MAX_IMAGES;
  };
  addImgBtn.addEventListener('click', async () => {
    if (images.length >= MAX_IMAGES) {
      showToast('最多 9 张图片嘛', 'error');
      return;
    }
    try {
      const file = await pickImageFile();
      const dataURL = await compressImage(file);
      if (!dataURL) return;
      images.push(dataURL);
      renderThumbs();
      updateAddBtn();
    } catch (e) {
      if (e && e.message && e.message.includes('取消')) return;
      console.warn('[moments] 图片选择失败', e);
      showToast('图片没加上，再试一下嘛', 'error');
    }
  });
  body.querySelector('#mom-send').addEventListener('click', async () => {
    const content = body.querySelector('#mom-text').value.trim();
    const visibility = body.querySelector('#mom-vis').value;
    if (!content && images.length === 0) {
      showToast('写点什么或者加张图片嘛', 'error');
      return;
    }
    try {
      const id = generateId('moment');
      const record = normalizeMoment({
        id,
        author: '我',
        content,
        images,
        likes: 0,
        likedByMe: false,
        comments: [],
        pinned: false,
        visibility: visibility === 'private' ? 'private' : 'public',
        createdAt: getNow()
      });
      await setDB(STORES.moments, id, record);
      sheet.close();
      showToast('发出去啦', 'success', 1400);
      // 事件注入：消息中心会捕获
      bus.emit('moments:new', { author: '我', preview: content.slice(0, 30), momentId: id });
      await render();
      // 安排初一来互动：2-5s 点赞，5-10s 评论（用户离开页面也会照常进行）
      scheduleAIReactions(id, content, () => { render(); });
    } catch (e) {
      console.warn('[moments] 发送失败', e);
      showToast('没发出去，再试一下嘛', 'error');
    }
  });
  // 自动聚焦内容
  setTimeout(() => { try { body.querySelector('#mom-text')?.focus(); } catch (e) {} }, 60);
}
