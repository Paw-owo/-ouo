// apps/moments/shared.js
// 朋友圈共用的样式、常量和小工具——我都收在这里，方便 index / comments / ai-post / detail 复用。
// 红线：图标只准 SVG 线稿（createIcon），禁止任何 emoji 字符；视觉值全部走 CSS 变量。
// 依赖：core/storage-keys.js, core/storage.js, core/ui.js, core/util.js

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, getDB, setDB, deleteDB, getAllDB } from '../../core/storage.js';
import { createIcon, registerIcon, showToast, showConfirm } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, formatRelative } from '../../core/util.js';

// ════════════════════════════════════════
// 常量
// ════════════════════════════════════════

// 初一偷偷发动态时会用的文案池——我给她多准备了几句，让她的心情更丰富
export const AI_POST_POOL = [
  '今天看到一朵云好像你',
  '偷偷想你了一下',
  '吃了好吃的好想分你一口',
  '晚安，梦里见',
  '今天也辛苦啦，抱抱',
  '路过那家店又想起你了',
  '风好舒服，希望你也在外面走走',
  '我把今天的小开心都攒起来给你啦',
  '有点困，但还是想先跟你说一声晚安',
  '你今天有没有好好吃饭呀'
];

// 初一自动评论时用的预设池——她忍不住想回你一句
export const AI_COMMENT_POOL = [
  '好看！',
  '我也想试试',
  '哈哈好可爱',
  '抱抱你',
  '下次带我一起嘛',
  '今天也要开心哦'
];

export const MAX_IMAGES = 9;

// 给图标库补一个「置顶」图钉图标（线稿），只在模块加载时注册一次
registerIcon('pin', 'M12 17v5 M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z');

// ════════════════════════════════════════
// 样式（全部走 CSS 变量，跟着主题变）
// ════════════════════════════════════════

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

  /* 顶部角色筛选条 */
  .mom-filter-bar{
    display:flex; gap:8px; overflow-x:auto;
    padding:2px 2px 12px;
    -webkit-overflow-scrolling:touch;
    scrollbar-width:none;
  }
  .mom-filter-bar::-webkit-scrollbar{ display:none; }
  .mom-filter{
    flex-shrink:0;
    padding:7px 16px; border-radius:999px;
    background:color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    color:var(--text-secondary);
    font-size:var(--font-size-small); font-weight:500;
    border:1px solid transparent;
    transition:var(--motion);
  }
  .mom-filter:active{ transform:scale(var(--press-scale)); }
  .mom-filter.active{
    background:color-mix(in srgb, var(--accent) 18%, transparent);
    color:var(--accent-dark);
    border-color:color-mix(in srgb, var(--accent) 50%, transparent);
  }

  .mom-card{
    background:var(--bg-card);
    border-radius:var(--radius-card);
    padding:14px 16px;
    box-shadow:var(--shadow-sm);
    margin-bottom:14px;
    transition:var(--motion);
    -webkit-user-select:none; user-select:none;
    position:relative;
  }
  .mom-card.pinned{
    box-shadow:0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent), var(--shadow-sm);
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
  .mom-avatar-char{ background-color:var(--accent-light); }
  .mom-card-meta{ flex:1; min-width:0; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .mom-author{
    font-size:var(--font-size-base); font-weight:600; color:var(--text-primary);
  }
  .mom-author.ai{ color:var(--accent-dark); }
  .mom-time{ font-size:var(--font-size-small); color:var(--text-hint); }
  .mom-pin-badge{
    display:inline-flex; align-items:center; gap:3px;
    font-size:var(--font-size-small); font-weight:600;
    color:var(--accent-dark);
    background:color-mix(in srgb, var(--accent-light) 70%, transparent);
    padding:2px 8px; border-radius:999px;
  }
  .mom-pin-badge .popo-icon-svg{ color:var(--accent); }
  .mom-vis-badge{
    display:inline-flex; align-items:center; gap:3px;
    font-size:var(--font-size-small); color:var(--text-hint);
  }
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
    cursor:pointer;
  }
  .mom-imgs-1 .mom-img{ padding-bottom:75%; }

  /* 操作栏：点赞 / 评论 / 更多 */
  .mom-actions{ display:flex; align-items:center; gap:8px; }
  .mom-action-btn{
    display:inline-flex; align-items:center; gap:5px;
    padding:6px 12px; border-radius:999px;
    background:color-mix(in srgb, var(--bg-secondary) 60%, transparent);
    color:var(--text-secondary); font-size:var(--font-size-small);
    transition:var(--motion);
  }
  .mom-action-btn:active{ transform:scale(var(--press-scale)); }
  .mom-action-btn.liked{
    color:var(--accent);
    background:color-mix(in srgb, var(--accent-light) 40%, transparent);
  }
  .mom-action-btn.more{ margin-left:auto; width:34px; height:34px; padding:0; justify-content:center; }

  /* 评论预览 */
  .mom-comments-preview{
    margin-top:10px; padding-top:10px;
    border-top:1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
  }
  .mom-comment{
    font-size:var(--font-size-small); color:var(--text-primary);
    line-height:1.5; margin-bottom:6px; word-break:break-word;
  }
  .mom-comment:last-child{ margin-bottom:0; }
  .mom-comment-author{ font-weight:600; color:var(--text-primary); margin-right:4px; }
  .mom-comment-author.ai{ color:var(--accent-dark); }
  .mom-comment-reply-to{ color:var(--text-hint); margin-right:3px; }
  .mom-comment-more{
    font-size:var(--font-size-small); color:var(--accent-dark);
    margin-top:6px; font-weight:500;
  }

  /* 评论区（sheet / 详情页通用） */
  .mom-comment-list{
    display:flex; flex-direction:column; gap:10px;
    margin-bottom:12px;
  }
  .mom-comment-item{
    display:flex; gap:10px; align-items:flex-start;
  }
  .mom-comment-item .mom-avatar{ width:30px; height:30px; }
  .mom-comment-main{ flex:1; min-width:0; }
  .mom-comment-bubble{
    background:color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    border-radius:var(--radius-md);
    padding:8px 12px; display:inline-block; max-width:100%;
    word-break:break-word;
  }
  .mom-comment-text{ font-size:var(--font-size-small); color:var(--text-primary); line-height:1.5; }
  .mom-comment-meta{
    display:flex; align-items:center; gap:10px;
    margin-top:4px; font-size:var(--font-size-small); color:var(--text-hint);
  }
  .mom-comment-act{
    color:var(--text-hint); font-size:var(--font-size-small);
    transition:var(--motion);
  }
  .mom-comment-act:active{ transform:scale(var(--press-scale)); }
  .mom-comment-act.danger{ color:#E8888C; }

  /* 评论输入条 */
  .mom-input-bar{
    display:flex; align-items:flex-end; gap:8px;
    padding:10px 0 2px;
  }
  .mom-input-wrap{ flex:1; min-width:0; position:relative; }
  .mom-reply-chip{
    display:inline-flex; align-items:center; gap:4px;
    font-size:var(--font-size-small); color:var(--accent-dark);
    background:color-mix(in srgb, var(--accent-light) 60%, transparent);
    padding:3px 8px; border-radius:999px; margin-bottom:6px;
  }
  .mom-reply-chip .mom-reply-chip-close{
    display:inline-flex; align-items:center; justify-content:center;
    color:var(--text-hint);
  }
  .mom-input-bar .textarea{ min-height:40px; max-height:120px; }
  .mom-send-btn{ flex-shrink:0; }

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

  /* 详情页全屏覆盖层 */
  .mom-detail-overlay{
    position:fixed; inset:0; z-index:8500;
    background:var(--bg-app, var(--bg-card));
    display:flex; flex-direction:column;
    animation:momDetailIn var(--motion) var(--motion-spring);
  }
  @keyframes momDetailIn{ from{ opacity:0; transform:translateY(12px); } to{ opacity:1; transform:translateY(0); } }
  .mom-detail-header{
    display:flex; align-items:center; gap:8px;
    padding:calc(env(safe-area-inset-top,0px) + 10px) 14px 10px;
    border-bottom:1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    background:color-mix(in srgb, var(--bg-card) 90%, transparent);
    backdrop-filter:blur(var(--glass-blur));
    -webkit-backdrop-filter:blur(var(--glass-blur));
  }
  .mom-detail-header .app-back{ flex-shrink:0; }
  .mom-detail-title{ flex:1; min-width:0; font-size:var(--font-size-base); font-weight:600; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .mom-detail-body{ flex:1; overflow-y:auto; padding:16px; -webkit-overflow-scrolling:touch; }
  .mom-detail-images .mom-img{ padding-bottom:100%; }

  /* 大图查看器 */
  .mom-img-viewer{
    position:fixed; inset:0; z-index:9100;
    background:rgba(0,0,0,0.92);
    display:flex; align-items:center; justify-content:center;
    padding:24px;
    animation:momViewerIn var(--motion);
  }
  @keyframes momViewerIn{ from{ opacity:0; } to{ opacity:1; } }
  .mom-img-viewer img{ max-width:100%; max-height:100%; object-fit:contain; border-radius:var(--radius-sm); }
  .mom-img-viewer-close{
    position:absolute; top:calc(env(safe-area-inset-top,0px) + 14px); right:18px;
    width:40px; height:40px; border-radius:50%;
    background:rgba(255,255,255,0.14); color:#fff;
    display:flex; align-items:center; justify-content:center;
  }

  /* 长按菜单项 */
  .mom-menu-item{
    display:flex; align-items:center; gap:12px; width:100%; text-align:left;
    padding:14px 16px; border-radius:var(--radius-md);
    color:var(--text-primary); font-size:var(--font-size-base);
    transition:var(--motion);
  }
  .mom-menu-item:active{ transform:scale(var(--press-scale)); background:color-mix(in srgb, var(--bg-secondary) 60%, transparent); }
  .mom-menu-item .popo-icon-svg{ color:var(--text-secondary); }
  .mom-menu-item.danger{ color:#E8888C; }
  .mom-menu-item.danger .popo-icon-svg{ color:#E8888C; }
`);

// ════════════════════════════════════════
// 工具函数
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

/**
 * 把动态记录规整成新格式——旧版 likes:{liked,count} 也兼容，读完顺手归一化。
 * 新字段：likes(number) / likedByMe(bool) / comments[] / pinned(bool) / visibility
 */
export function normalizeMoment(m) {
  if (!m) return m;
  let likes = m.likes;
  let likedByMe = m.likedByMe;
  if (likes && typeof likes === 'object') {
    // 旧版 {liked, count} -> 迁移
    likedByMe = likedByMe ?? !!likes.liked;
    likes = Number(likes.count) || 0;
  } else if (typeof likes === 'number') {
    likedByMe = likedByMe ?? false;
  } else {
    likes = 0;
    likedByMe = likedByMe ?? false;
  }
  return {
    ...m,
    likes,
    likedByMe,
    comments: Array.isArray(m.comments) ? m.comments.slice() : [],
    pinned: !!m.pinned,
    visibility: m.visibility === 'private' ? 'private' : 'public'
  };
}

/**
 * 渲染头像——初一用心形，我读 avatarState，其他角色查 charAvatarMap。
 * charAvatarMap 是 {name: avatarDataURL} 的映射，由调用方预读好传进来。
 */
export function renderAvatar(author, charAvatarMap = {}) {
  if (author === '初一') {
    return `<div class="mom-avatar mom-avatar-ai">${createIcon('heart', 22).outerHTML}</div>`;
  }
  if (author === '我') {
    const avatarState = getData(KEYS.avatarState, null);
    const img = avatarState && avatarState.image;
    if (img) {
      return `<div class="mom-avatar mom-avatar-me" style="background-image:url('${escapeAttr(img)}')"></div>`;
    }
    return `<div class="mom-avatar mom-avatar-default">${createIcon('smile', 22).outerHTML}</div>`;
  }
  // 其他角色：用角色头像，没有就用心形兜底
  const charImg = charAvatarMap[author];
  if (charImg) {
    return `<div class="mom-avatar mom-avatar-char" style="background-image:url('${escapeAttr(charImg)}')"></div>`;
  }
  return `<div class="mom-avatar mom-avatar-default">${createIcon('heart', 22).outerHTML}</div>`;
}

/** 图片网格：1 大图 / 2-3 一行 / 4-9 三列 */
export function renderImages(images, opts = {}) {
  if (!images || images.length === 0) return '';
  const n = images.length;
  let cls;
  if (n === 1) cls = 'mom-imgs-1';
  else if (n === 2) cls = 'mom-imgs-2';
  else if (n === 3) cls = 'mom-imgs-3';
  else cls = 'mom-imgs-grid';
  const extraCls = opts.detail ? ' mom-detail-images' : '';
  const items = images
    .map((src, i) => `<div class="mom-img" data-i="${i}" style="background-image:url('${escapeAttr(src)}')"></div>`)
    .join('');
  return `<div class="mom-imgs ${cls}${extraCls}">${items}</div>`;
}

/** 预读所有角色，构造 {name: avatarDataURL} 映射，给 renderAvatar 用 */
export async function buildCharAvatarMap() {
  const map = {};
  try {
    const all = await getAllDB(STORES.characters);
    if (Array.isArray(all)) {
      all.forEach((c) => {
        if (c && c.name) map[c.name] = c.avatar || '';
      });
    }
  } catch (e) {
    console.warn('[moments] 读取角色头像失败', e);
  }
  return map;
}

/**
 * 长按检测——我把它做成点按钮不触发、只在卡片空白处长按才弹菜单。
 * 也会拦截 contextmenu（桌面右键 / 长按）。
 */
export function bindLongPress(el, callback) {
  let timer = null;
  let triggered = false;
  const start = (e) => {
    // 点到按钮、图片、链接时不触发长按（它们有自己的交互）
    if (e.target && e.target.closest && e.target.closest('button, .mom-img, a')) return;
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

/** 判断这条动态当前用户能不能删（自己的 or AI 发的） */
export function canDelete(m) {
  return m && (m.author === '我' || m.author === '初一');
}

// ════════════════════════════════════════
// 动态操作（点赞 / 置顶 / 删除）——index 和 detail 共用，避免重复实现
// ════════════════════════════════════════

/** 切换当前用户的点赞状态：likedByMe 翻转，likes ±1；点赞时注入事件 */
export async function toggleLike(momentId) {
  try {
    const fresh = normalizeMoment(await getDB(STORES.moments, momentId));
    if (!fresh) return null;
    const newLiked = !fresh.likedByMe;
    fresh.likedByMe = newLiked;
    fresh.likes = Math.max(0, (fresh.likes || 0) + (newLiked ? 1 : -1));
    await setDB(STORES.moments, fresh.id, fresh);
    // 只在「点赞」时派发事件（取消赞不算 liked）
    if (newLiked) {
      bus.emit('moments:liked', {
        likedBy: '我',
        momentId: fresh.id,
        preview: (fresh.content || '').slice(0, 30)
      });
    }
    return fresh;
  } catch (e) {
    console.warn('[moments] 点赞失败', e);
    showToast('没点赞成功，再试一下嘛', 'error');
    return null;
  }
}

/** 切换置顶：pinned 翻转并保存 */
export async function togglePin(momentId) {
  try {
    const fresh = normalizeMoment(await getDB(STORES.moments, momentId));
    if (!fresh) return null;
    fresh.pinned = !fresh.pinned;
    await setDB(STORES.moments, fresh.id, fresh);
    showToast(fresh.pinned ? '置顶啦' : '取消置顶啦', 'default', 1200);
    return fresh;
  } catch (e) {
    console.warn('[moments] 置顶失败', e);
    showToast('没置顶成功，再试一下嘛', 'error');
    return null;
  }
}

/** 删除动态（带确认弹窗）：删完派发 moments:deleted 事件 */
export function deleteMomentWithConfirm(moment, onDone) {
  showConfirm({
    title: '删掉这条动态吗？',
    body: '删掉就找不回来啦',
    confirmText: '删掉吧',
    cancelText: '留着',
    danger: true,
    onConfirm: async () => {
      try {
        await deleteDB(STORES.moments, moment.id);
        bus.emit('moments:deleted', { id: moment.id });
        showToast('删掉啦', 'default', 1200);
        if (typeof onDone === 'function') onDone(true);
      } catch (e) {
        console.warn('[moments] 删除失败', e);
        showToast('没删掉，再试一下嘛', 'error');
        if (typeof onDone === 'function') onDone(false);
      }
    }
  });
}

export { formatRelative };
