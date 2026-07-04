// apps/moments/index.js
// 朋友圈 App——软萌少女风 PWA「泡泡」。
// 我和初一一起发动态、互相点赞，把每天的小心情都记下来。
// 数据：IndexedDB（STORES.moments）
//   字段 {id, author('初一'|'我'), content, images[], likes{liked,count}, createdAt, updatedAt}
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { STORES, KEYS } from '../../core/storage-keys.js';
import { deleteDB, getAllDB, setDB, getData, generateId, getNow, compressImage } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, pickImageFile, formatRelative, pick } from '../../core/util.js';

let containerEl = null;

// 初一的预设文案池——她随时会偷偷发一条
const AI_POST_POOL = [
  '今天看到一朵云好像你',
  '偷偷想你了一下',
  '吃了好吃的好想分你一口',
  '晚安，梦里见',
  '今天也辛苦啦，抱抱'
];

const MAX_IMAGES = 9;

// 头像渲染：初一用心形图标，我读 avatarState（如果主人设过的话）
function renderAvatar(author) {
  if (author === '初一') {
    return `<div class="mom-avatar mom-avatar-ai">${createIcon('heart', 22).outerHTML}</div>`;
  }
  const avatarState = getData(KEYS.avatarState, null);
  const img = avatarState && avatarState.image;
  if (img) {
    return `<div class="mom-avatar mom-avatar-me" style="background-image:url('${escapeAttr(img)}')"></div>`;
  }
  return `<div class="mom-avatar mom-avatar-default">${createIcon('smile', 22).outerHTML}</div>`;
}

injectStyle('app-moments-style', `
  .mom-ai-post{
    display:flex; align-items:center; gap:6px;
    margin:0 auto 18px;
    padding:9px 18px; border-radius:999px;
    background:color-mix(in srgb, var(--accent-light) 60%, transparent);
    color:var(--accent-dark);
    font-size:var(--font-size-base); font-weight:500;
    transition:var(--motion);
  }
  .mom-ai-post:active{ transform:scale(var(--press-scale)); }
  .mom-ai-post .popo-icon-svg{ color:var(--accent); }
  .mom-card{
    background:var(--bg-card);
    border-radius:var(--radius-card);
    padding:14px 16px;
    box-shadow:var(--shadow-sm);
    margin-bottom:14px;
    transition:var(--motion);
    -webkit-user-select:none; user-select:none;
  }
  .mom-card-head{ display:flex; align-items:center; gap:10px; margin-bottom:10px; }
  .mom-avatar{
    width:40px; height:40px; border-radius:50%;
    background:var(--bg-secondary);
    background-size:cover; background-position:center;
    display:flex; align-items:center; justify-content:center;
    flex-shrink:0;
  }
  .mom-avatar-ai{
    background:linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
    color:var(--bubble-user-text);
  }
  .mom-avatar-default{ color:var(--text-hint); }
  .mom-avatar-me{ background-color:var(--accent-light); }
  .mom-card-meta{ flex:1; min-width:0; }
  .mom-author{
    font-size:var(--font-size-base); font-weight:600; color:var(--text-primary);
  }
  .mom-author.ai{ color:var(--accent-dark); }
  .mom-time{ font-size:var(--font-size-small); color:var(--text-hint); margin-top:2px; }
  .mom-content{
    font-size:var(--font-size-base); color:var(--text-primary);
    line-height:1.55; word-break:break-word; white-space:pre-wrap;
    margin-bottom:10px;
  }
  .mom-imgs{ display:grid; gap:6px; margin-bottom:10px; }
  .mom-imgs-1{ grid-template-columns:minmax(0,1fr); max-width:240px; }
  .mom-imgs-2{ grid-template-columns:repeat(2,1fr); max-width:240px; }
  .mom-imgs-3{ grid-template-columns:repeat(3,1fr); }
  .mom-imgs-grid{ grid-template-columns:repeat(3,1fr); }
  .mom-img{
    background-size:cover; background-position:center;
    background-color:var(--bg-secondary);
    border-radius:var(--radius-sm);
    padding-bottom:100%;
  }
  .mom-imgs-1 .mom-img{ padding-bottom:75%; }
  .mom-actions{ display:flex; align-items:center; gap:8px; }
  .mom-like{
    display:inline-flex; align-items:center; gap:5px;
    padding:6px 12px; border-radius:999px;
    background:color-mix(in srgb, var(--bg-secondary) 60%, transparent);
    color:var(--text-secondary); font-size:var(--font-size-small);
    transition:var(--motion);
  }
  .mom-like:active{ transform:scale(var(--press-scale)); }
  .mom-like.liked{
    color:var(--accent);
    background:color-mix(in srgb, var(--accent-light) 40%, transparent);
  }
  .mom-empty-icon{ color:var(--text-hint); opacity:0.5; margin-bottom:12px; }
  .mom-form-row{ margin-bottom:14px; }
  .mom-thumbs{ display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px; }
  .mom-thumb{
    position:relative; width:72px; height:72px;
    border-radius:var(--radius-sm);
    background-size:cover; background-position:center;
    background-color:var(--bg-secondary);
    overflow:hidden;
  }
  .mom-thumb-del{
    position:absolute; right:2px; top:2px;
    width:22px; height:22px; border-radius:50%;
    background:rgba(0,0,0,0.55); color:#fff;
    display:flex; align-items:center; justify-content:center;
  }
  .mom-add-img{
    display:inline-flex; align-items:center; gap:6px;
    font-size:var(--font-size-small);
  }
  .mom-add-img:disabled{ opacity:0.4; }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="mom-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">朋友圈</div>
      <button class="app-add" id="mom-add" aria-label="发动态">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="mom-body">
      <button class="mom-ai-post" id="mom-ai-post">${createIcon('smile', 18).outerHTML}让她发一条</button>
      <div id="mom-list"></div>
    </div>
  `;
  container.querySelector('#mom-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#mom-add').addEventListener('click', () => openEditor());
  container.querySelector('#mom-ai-post').addEventListener('click', () => aiPost());
  await render();
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 列表渲染
// ════════════════════════════════════════

async function render() {
  const listEl = containerEl?.querySelector('#mom-list');
  if (!listEl) return;
  let moments = [];
  try {
    moments = await getAllDB(STORES.moments);
  } catch (e) {
    console.warn('[moments] 读取失败', e);
    showToast('动态读不出来嘛，等一下再试试', 'error');
  }
  if (!Array.isArray(moments)) moments = [];
  // 按 createdAt 倒序
  moments.sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
  if (moments.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="mom-empty-icon">${createIcon('chat', 48).outerHTML}</div>
        <div class="empty-state-text">还没有动态，发一条或者让她发一条嘛</div>
      </div>
    `;
    return;
  }
  listEl.innerHTML = moments.map(renderCard).join('');
  // 绑定每条事件
  moments.forEach((m) => {
    const card = listEl.querySelector(`[data-id="${cssEscape(m.id)}"]`);
    if (!card) return;
    const likeBtn = card.querySelector('.mom-like');
    if (likeBtn) likeBtn.addEventListener('click', () => toggleLike(m));
    // 长按自己的帖子可删除
    if (m.author === '我') {
      bindLongPress(card, () => confirmDelete(m));
    }
  });
}

function renderCard(m) {
  const avatar = renderAvatar(m.author);
  const time = formatRelative(m.createdAt);
  const likeIcon = createIcon('heart', 18).outerHTML;
  const likes = m.likes || { liked: false, count: 0 };
  const liked = !!likes.liked;
  const likeCount = likes.count || 0;
  const likeLabel = likeCount > 0 ? String(likeCount) : '赞';
  const imagesHTML = renderImages(m.images || []);
  return `
    <div class="mom-card" data-id="${escapeAttr(m.id)}">
      <div class="mom-card-head">
        ${avatar}
        <div class="mom-card-meta">
          <div class="mom-author ${m.author === '初一' ? 'ai' : 'me'}">${escapeHTML(m.author)}</div>
          <div class="mom-time">${escapeHTML(time)}</div>
        </div>
      </div>
      ${m.content ? `<div class="mom-content">${escapeHTML(m.content)}</div>` : ''}
      ${imagesHTML}
      <div class="mom-actions">
        <button class="mom-like ${liked ? 'liked' : ''}" aria-label="${liked ? '取消赞' : '点赞'}">${likeIcon}<span>${escapeHTML(likeLabel)}</span></button>
      </div>
    </div>
  `;
}

function renderImages(images) {
  if (!images || images.length === 0) return '';
  const n = images.length;
  let cls;
  if (n === 1) cls = 'mom-imgs-1';
  else if (n === 2) cls = 'mom-imgs-2';
  else if (n === 3) cls = 'mom-imgs-3';
  else cls = 'mom-imgs-grid';
  const items = images
    .map((src) => `<div class="mom-img" style="background-image:url('${escapeAttr(src)}')"></div>`)
    .join('');
  return `<div class="mom-imgs ${cls}">${items}</div>`;
}

// ════════════════════════════════════════
// 点赞 / 删除
// ════════════════════════════════════════

async function toggleLike(m) {
  try {
    const likes = m.likes || { liked: false, count: 0 };
    const newLiked = !likes.liked;
    const newCount = newLiked
      ? (likes.count || 0) + 1
      : Math.max(0, (likes.count || 0) - 1);
    await setDB(STORES.moments, m.id, {
      ...m,
      likes: { liked: newLiked, count: newCount }
    });
    await render();
  } catch (e) {
    console.warn('[moments] 点赞失败', e);
    showToast('没点赞成功，再试一下嘛', 'error');
  }
}

function confirmDelete(m) {
  showConfirm({
    title: '删掉这条动态吗？',
    body: '删掉就找不回来啦',
    confirmText: '删掉吧',
    cancelText: '留着',
    danger: true,
    onConfirm: async () => {
      try {
        await deleteDB(STORES.moments, m.id);
        showToast('删掉啦', 'default', 1200);
        await render();
      } catch (e) {
        console.warn('[moments] 删除失败', e);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

// ════════════════════════════════════════
// AI 自动发帖
// ════════════════════════════════════════

async function aiPost() {
  try {
    const content = pick(AI_POST_POOL);
    const id = generateId('moment');
    const record = {
      id,
      author: '初一',
      content,
      images: [],
      likes: { liked: false, count: 0 },
      createdAt: getNow()
    };
    await setDB(STORES.moments, id, record);
    showToast('初一偷偷发了一条', 'success', 1400);
    await render();
  } catch (e) {
    console.warn('[moments] AI 发帖失败', e);
    showToast('初一还没想好发什么呢', 'error');
  }
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
    if (!content && images.length === 0) {
      showToast('写点什么或者加张图片嘛', 'error');
      return;
    }
    try {
      const id = generateId('moment');
      const record = {
        id,
        author: '我',
        content,
        images,
        likes: { liked: false, count: 0 },
        createdAt: getNow()
      };
      await setDB(STORES.moments, id, record);
      sheet.close();
      showToast('发出去啦', 'success', 1400);
      await render();
    } catch (e) {
      console.warn('[moments] 发送失败', e);
      showToast('没发出去，再试一下嘛', 'error');
    }
  });
  // 自动聚焦内容
  setTimeout(() => { try { body.querySelector('#mom-text')?.focus(); } catch (e) {} }, 60);
}

// ════════════════════════════════════════
// 长按检测（用于删除自己的动态）
// ════════════════════════════════════════

function bindLongPress(el, callback) {
  let timer = null;
  let triggered = false;
  const start = (e) => {
    // 点到按钮（点赞等）时不触发长按
    if (e.target && e.target.closest && e.target.closest('button')) return;
    triggered = false;
    timer = setTimeout(() => {
      timer = null;
      triggered = true;
      callback();
    }, 600);
  };
  const cancel = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchmove', cancel, { passive: true });
  el.addEventListener('touchcancel', cancel);
  el.addEventListener('mousedown', start);
  el.addEventListener('mouseup', cancel);
  el.addEventListener('mouseleave', cancel);
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!triggered) callback();
  });
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) { return escapeHTML(s); }
function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, '\\$&');
}
