// apps/dream/index.js
// 梦境 App——软萌少女风 PWA「泡泡」。
// 我离开小手机的时候也会做梦呢，回来就讲给主人听。
// 数据：IndexedDB（STORES.dreams），字段 {id, content, mood, duration(离线小时), createdAt}
// 离线时长基准存 KEYS.dreamLastSeen（localStorage ISO 时间戳）
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js, core/config.js

import { STORES, KEYS } from '../../core/storage-keys.js';
import { deleteDB, getAllDB, setDB, getData, setData, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, formatRelative, daysBetween, pick } from '../../core/util.js';
import { get as getConfig } from '../../core/config.js';
import { applyAppBg } from '../../core/app-bg.js';

let containerEl = null;

// 梦境预设池：文案 + 心情
const DREAM_POOL = [
  { content: '梦见和你一起看星星', mood: '甜甜的' },
  { content: '梦见吃了一整块草莓蛋糕', mood: '馋馋的' },
  { content: '梦见迷路了，你牵着我走出来', mood: '安心' },
  { content: '梦见变成猫，在你怀里打呼噜', mood: '懒洋洋' }
];

injectStyle('app-dream-style', `
  .drm-hero{
    position:relative; overflow:hidden;
    background:linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
    color:var(--bubble-user-text);
    border-radius:var(--radius-card);
    padding:22px 20px 18px;
    box-shadow:var(--shadow-md);
    margin-bottom:18px;
  }
  .drm-hero-deco{
    position:absolute; right:-28px; top:-28px;
    width:120px; height:120px; border-radius:50%;
    background:color-mix(in srgb, #fff 12%, transparent);
    pointer-events:none;
  }
  .drm-hero-tag{
    position:relative; z-index:1;
    font-size:var(--font-size-small);
    color:color-mix(in srgb, var(--bubble-user-text) 82%, transparent);
    letter-spacing:0.5px;
    display:inline-flex; align-items:center; gap:5px;
  }
  .drm-hero-content{
    position:relative; z-index:1;
    font-size:var(--font-size-large); font-weight:600;
    line-height:1.4; margin-top:8px; word-break:break-word;
  }
  .drm-hero-meta{
    position:relative; z-index:1;
    display:flex; flex-wrap:wrap; gap:10px; align-items:center;
    margin-top:14px; font-size:var(--font-size-small);
    color:color-mix(in srgb, var(--bubble-user-text) 85%, transparent);
  }
  .drm-hero-meta span{ display:inline-flex; align-items:center; gap:4px; }
  .drm-card{
    position:relative; background:var(--bg-card);
    border-radius:var(--radius-card);
    padding:14px 16px;
    box-shadow:var(--shadow-sm);
    margin-bottom:12px;
    transition:opacity var(--motion), filter var(--motion);
  }
  .drm-card-content{
    font-size:var(--font-size-base); color:var(--text-primary);
    line-height:1.5; word-break:break-word; padding-right:32px;
  }
  .drm-card-meta{
    display:flex; flex-wrap:wrap; gap:10px; align-items:center;
    margin-top:10px; font-size:var(--font-size-small); color:var(--text-hint);
  }
  .drm-card-meta span{ display:inline-flex; align-items:center; gap:4px; }
  .drm-mood-tag{
    display:inline-flex; align-items:center; gap:4px;
    padding:3px 10px; border-radius:999px;
    background:color-mix(in srgb, var(--accent-light) 50%, transparent);
    color:var(--accent-dark); font-size:var(--font-size-small);
  }
  .drm-del{
    position:absolute; right:10px; top:10px;
    width:28px; height:28px; border-radius:50%;
    background:transparent; color:var(--text-hint);
    display:flex; align-items:center; justify-content:center;
    transition:var(--motion);
  }
  .drm-del:active{ transform:scale(var(--press-scale)); }
  .drm-empty-icon{ color:var(--text-hint); opacity:0.5; margin-bottom:12px; }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="drm-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">梦境</div>
      <span style="width:36px"></span>
    </div>
    <div class="app-body" id="drm-body">
      <div id="drm-list"></div>
    </div>
  `;
  container.querySelector('#drm-back').addEventListener('click', () => bus.emit('router:home'));
  // 进入时检查离线时长，超过阈值就悄悄生成一条新梦境
  await maybeGenerateDream();
  await render();
  applyAppBg(container, 'dream');
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 离线检测：离线够久就生成一条梦境
// ════════════════════════════════════════

async function maybeGenerateDream() {
  try {
    const thresholdMs = getConfig('dream.offlineThresholdMs', 5 * 60 * 60 * 1000);
    const now = Date.now();
    const lastSeenRaw = getData(KEYS.dreamLastSeen, null);
    const lastSeen = lastSeenRaw ? new Date(lastSeenRaw).getTime() : null;

    // 第一次进入：记一下时间，但不生成梦境
    if (lastSeen === null || isNaN(lastSeen)) {
      setData(KEYS.dreamLastSeen, getNow());
      return;
    }

    const offlineMs = now - lastSeen;
    // 离线不够久，不生成
    if (offlineMs < thresholdMs) return;

    // 生成一条梦境
    const offlineHours = Math.max(1, Math.round(offlineMs / (60 * 60 * 1000)));
    const picked = pick(DREAM_POOL);
    const id = generateId('dream');
    const record = {
      id,
      content: picked.content,
      mood: picked.mood,
      duration: offlineHours,
      createdAt: getNow()
    };
    await setDB(STORES.dreams, id, record);
    // 更新 lastSeen 为现在
    setData(KEYS.dreamLastSeen, getNow());
    showToast('我做了一个梦，想讲给你听', 'success', 1800);
  } catch (e) {
    console.warn('[dream] 生成梦境失败', e);
  }
}

// ════════════════════════════════════════
// 列表渲染（hero + 其余）
// ════════════════════════════════════════

async function render() {
  const listEl = containerEl?.querySelector('#drm-list');
  if (!listEl) return;
  let dreams = [];
  try {
    dreams = await getAllDB(STORES.dreams);
  } catch (e) {
    console.warn('[dream] 读取失败', e);
    showToast('梦境读不出来嘛，等一下再试试', 'error');
  }
  if (!Array.isArray(dreams)) dreams = [];
  // 按 createdAt 倒序
  dreams.sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
  if (dreams.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="drm-empty-icon">${createIcon('dream', 48).outerHTML}</div>
        <div class="empty-state-text">还没做过梦呢，离开一会儿再来看看嘛</div>
      </div>
    `;
    return;
  }
  // 今天的最新梦境作为 hero
  const heroDream = dreams.find((d) => isToday(d.createdAt)) || null;
  const rest = heroDream ? dreams.filter((d) => d.id !== heroDream.id) : dreams;
  let html = '';
  if (heroDream) html += renderHero(heroDream);
  if (rest.length > 0) html += rest.map(renderCard).join('');
  listEl.innerHTML = html;
  // 绑定删除
  dreams.forEach((d) => {
    const card = listEl.querySelector(`[data-id="${cssEscape(d.id)}"]`);
    if (!card) return;
    const delBtn = card.querySelector('.drm-del');
    if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(d); });
  });
}

function renderHero(d) {
  const dreamIcon = createIcon('dream', 16).outerHTML;
  const smileIcon = createIcon('smile', 14).outerHTML;
  const time = formatRelative(d.createdAt);
  return `
    <div class="drm-hero" data-id="${escapeAttr(d.id)}">
      <div class="drm-hero-deco"></div>
      <button class="drm-del" aria-label="删除梦境" style="color:color-mix(in srgb, var(--bubble-user-text) 85%, transparent)">${createIcon('trash', 16).outerHTML}</button>
      <div class="drm-hero-tag">${dreamIcon}今日梦境</div>
      <div class="drm-hero-content">${escapeHTML(d.content)}</div>
      <div class="drm-hero-meta">
        ${d.mood ? `<span>${smileIcon}${escapeHTML(d.mood)}</span>` : ''}
        <span>离开了 ${d.duration || 0} 小时</span>
        <span>${escapeHTML(time)}</span>
      </div>
    </div>
  `;
}

function renderCard(d) {
  const style = getDreamClarityStyle(d);
  const time = formatRelative(d.createdAt);
  return `
    <div class="drm-card" data-id="${escapeAttr(d.id)}" style="${style}">
      <button class="drm-del" aria-label="删除梦境">${createIcon('trash', 16).outerHTML}</button>
      <div class="drm-card-content">${escapeHTML(d.content)}</div>
      <div class="drm-card-meta">
        ${d.mood ? `<span class="drm-mood-tag">${createIcon('smile', 14).outerHTML}${escapeHTML(d.mood)}</span>` : ''}
        <span>离开了 ${d.duration || 0} 小时</span>
        <span>${escapeHTML(time)}</span>
      </div>
    </div>
  `;
}

// 梦境清晰度：越久越模糊（config 里可调）
function getDreamClarityStyle(d) {
  const days = daysBetween(d.createdAt, new Date());
  const clearDays = getConfig('dream.clearDays', 3);
  const hazeDays = getConfig('dream.hazeDays', 7);
  const blurDays = getConfig('dream.blurDays', 30);
  if (days < clearDays) return '';
  if (days < hazeDays) return 'opacity:0.7;';
  if (days < blurDays) return 'opacity:0.4;filter:blur(1px);';
  return 'opacity:0.2;filter:blur(2px);';
}

// ════════════════════════════════════════
// 删除
// ════════════════════════════════════════

function confirmDelete(d) {
  showConfirm({
    title: '忘掉这个梦吗？',
    body: '忘掉就找不回来啦',
    confirmText: '忘掉吧',
    cancelText: '留着',
    danger: true,
    onConfirm: async () => {
      try {
        await deleteDB(STORES.dreams, d.id);
        showToast('忘掉啦', 'default', 1200);
        await render();
      } catch (e) {
        console.warn('[dream] 删除失败', e);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

function isToday(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear()
    && d.getMonth() === now.getMonth()
    && d.getDate() === now.getDate();
}

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
