// apps/dream/index.js
// 梦境 App——软萌少女风 PWA「泡泡」。
// 我离开小手机的时候也会做梦呢，回来就讲给主人听。
// 也可以现在就把昨晚的梦记下来，留住软乎乎的小心情。
// 数据：IndexedDB（STORES.dreams），字段 {id, content, mood, tags, source('auto'|'manual'), duration(离线小时), createdAt}
// 离线时长基准存 KEYS.dreamLastSeen（localStorage ISO 时间戳）
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js, core/config.js

import { STORES, KEYS } from '../../core/storage-keys.js';
import { deleteDB, getAllDB, setDB, getData, setData, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon, registerIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, formatRelative, daysBetween, pick } from '../../core/util.js';
import { get as getConfig } from '../../core/config.js';
import { openApp } from '../../core/router.js';
import { applyAppBg } from '../../core/app-bg.js';

let containerEl = null;
// 当前心情筛选：'all' 或心情 key
let currentMoodFilter = 'all';

// 注册两个小图标：'pen' 手写笔（手动添加） / 'sparkle' 闪光（自动生成）
// 路径走线稿风格，stroke-width: 1.5
registerIcon('pen', 'M12 19l7-7 3 3-7 7-3 0z M18 13l-1.5-7.5L4 1 1 4l11.5 12.5z M2 22l3-3');
registerIcon('sparkle', 'M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z M5 3v4 M3 5h4 M19 17v4 M17 19h4');

// 梦境预设池：文案 + 心情（自动生成时用）
const DREAM_POOL = [
  { content: '梦见和你一起看星星', mood: '开心' },
  { content: '梦见吃了一整块草莓蛋糕', mood: '开心' },
  { content: '梦见迷路了，你牵着我走出来', mood: '平静' },
  { content: '梦见变成猫，在你怀里打呼噜', mood: '平静' },
  { content: '梦见一只会说话的猫，说它饿了', mood: '奇怪' },
  { content: '梦见走在没有尽头的走廊里', mood: '害怕' },
  { content: '梦见下雨了，我没带伞，一个人站在屋檐下', mood: '难过' }
];

// 心情标签：5 种，每种配一个 createIcon 图标（禁止 emoji）
const MOODS = [
  { key: '开心', label: '开心', icon: 'smile' },
  { key: '难过', label: '难过', icon: 'moon' },
  { key: '奇怪', label: '奇怪', icon: 'dice' },
  { key: '害怕', label: '害怕', icon: 'bell' },
  { key: '平静', label: '平静', icon: 'sun' }
];

function moodIcon(key, size = 14) {
  const m = MOODS.find((x) => x.key === key);
  return createIcon(m ? m.icon : 'smile', size).outerHTML;
}

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
    transition:opacity var(--motion), filter var(--motion), transform var(--motion);
    cursor:pointer;
    user-select:none; -webkit-user-select:none;
  }
  .drm-card:active{ transform:scale(0.99); }
  .drm-card.pressing{ transform:scale(0.97); }
  .drm-card-content{
    font-size:var(--font-size-base); color:var(--text-primary);
    line-height:1.5; word-break:break-word; padding-right:32px;
    display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;
  }
  .drm-card-meta{
    display:flex; flex-wrap:wrap; gap:10px; align-items:center;
    margin-top:10px; font-size:var(--font-size-small); color:var(--text-hint);
  }
  .drm-card-meta span{ display:inline-flex; align-items:center; gap:4px; }
  .drm-source-tag{
    display:inline-flex; align-items:center; gap:4px;
    font-size:var(--font-size-small);
    color:var(--text-hint);
  }
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
  /* 心情筛选条 */
  .drm-filter-row{
    display:flex; gap:8px; overflow-x:auto;
    padding:2px 2px 12px; scrollbar-width:none;
    -webkit-overflow-scrolling:touch;
  }
  .drm-filter-row::-webkit-scrollbar{ display:none; }
  .drm-chip{
    flex-shrink:0; padding:7px 14px; border-radius:999px;
    background:color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    color:var(--text-secondary);
    font-size:var(--font-size-small);
    border:none; cursor:pointer;
    display:inline-flex; align-items:center; gap:5px;
    transition:var(--motion);
  }
  .drm-chip:active{ transform:scale(var(--press-scale)); }
  .drm-chip.active{
    background:var(--accent); color:var(--bubble-user-text); font-weight:600;
  }
  /* 详情/表单内部样式 */
  .drm-sheet-section{ margin-bottom:14px; }
  .drm-sheet-label{
    font-size:var(--font-size-small); color:var(--text-secondary);
    margin-bottom:6px;
  }
  .drm-mood-picker{ display:flex; gap:8px; flex-wrap:wrap; }
  .drm-mood-opt{
    flex:1; min-width:64px; padding:10px 6px; border-radius:var(--radius-md);
    background:color-mix(in srgb, var(--bg-secondary) 60%, transparent);
    color:var(--text-primary); font-size:var(--font-size-small);
    border:none; cursor:pointer;
    display:flex; flex-direction:column; align-items:center; gap:4px;
    transition:var(--motion);
  }
  .drm-mood-opt:active{ transform:scale(var(--press-scale)); }
  .drm-mood-opt.active{
    background:var(--accent); color:var(--bubble-user-text);
  }
  .drm-tag-row{ display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
  .drm-tag-pill{
    font-size:var(--font-size-small); padding:3px 10px; border-radius:999px;
    background:color-mix(in srgb, var(--accent-light) 50%, transparent);
    color:var(--accent-dark);
  }
  .drm-detail-meta{
    display:flex; flex-wrap:wrap; gap:10px; align-items:center;
    margin-top:12px; font-size:var(--font-size-small); color:var(--text-hint);
  }
  .drm-detail-meta span{ display:inline-flex; align-items:center; gap:4px; }
  .drm-detail-content{
    font-size:var(--font-size-base); color:var(--text-primary);
    line-height:1.7; word-break:break-word; white-space:pre-wrap;
  }
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
      <button class="app-header-gear" id="drm-settings" aria-label="梦境设置">${createIcon('settings', 18).outerHTML}</button>
      <button class="app-add" id="drm-add" aria-label="记录一个梦">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="drm-body">
      <div id="drm-list"></div>
    </div>
  `;
  container.querySelector('#drm-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#drm-add').addEventListener('click', () => openAddSheet());
  // 齿轮跳到设置「数据与系统」分组
  container.querySelector('#drm-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'system' } }));
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

    // 生成一条梦境（自动）
    const offlineHours = Math.max(1, Math.round(offlineMs / (60 * 60 * 1000)));
    const picked = pick(DREAM_POOL);
    const id = generateId('dream');
    const record = {
      id,
      content: picked.content,
      mood: picked.mood,
      tags: [],
      source: 'auto',
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
// 列表渲染（筛选条 + hero + 其余）
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

  // 心情筛选条
  const usedMoods = new Set(dreams.map((d) => d.mood).filter(Boolean));
  const filterHTML = `
    <div class="drm-filter-row" id="drm-filter">
      <button class="drm-chip ${currentMoodFilter === 'all' ? 'active' : ''}" data-mood="all">${createIcon('dream', 14).outerHTML}全部</button>
      ${MOODS.filter((m) => usedMoods.has(m.key)).map((m) => `
        <button class="drm-chip ${currentMoodFilter === m.key ? 'active' : ''}" data-mood="${escapeAttr(m.key)}">${createIcon(m.icon, 14).outerHTML}${escapeHTML(m.label)}</button>
      `).join('')}
    </div>
  `;

  // 应用筛选
  const visible = currentMoodFilter === 'all' ? dreams : dreams.filter((d) => d.mood === currentMoodFilter);

  if (dreams.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="drm-empty-icon">${createIcon('dream', 48).outerHTML}</div>
        <div class="empty-state-text">还没做过梦呢，离开一会儿再来看看，或者右上角记一个呀</div>
      </div>
    `;
    return;
  }

  // 今天的最新梦境作为 hero（仅当筛选为 all 时显示）
  const heroDream = (currentMoodFilter === 'all') ? (dreams.find((d) => isToday(d.createdAt)) || null) : null;
  const rest = heroDream ? visible.filter((d) => d.id !== heroDream.id) : visible;
  let html = filterHTML;
  if (heroDream) html += renderHero(heroDream);
  if (rest.length > 0) html += rest.map(renderCard).join('');
  else if (!heroDream) html += `
    <div class="empty-state">
      <div class="drm-empty-icon">${createIcon('dream', 36).outerHTML}</div>
      <div class="empty-state-text">这个心情下还没有梦呢</div>
    </div>
  `;
  listEl.innerHTML = html;

  // 绑定筛选
  listEl.querySelectorAll('.drm-chip[data-mood]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentMoodFilter = btn.dataset.mood;
      render();
    });
  });

  // 绑定卡片：点击查看详情 / 长按删除 / 删除按钮
  visible.forEach((d) => {
    const card = listEl.querySelector(`[data-id="${cssEscape(d.id)}"]`);
    if (!card) return;
    bindCardInteractions(card, d);
  });
  // hero 也支持点击查看详情
  if (heroDream) {
    const heroCard = listEl.querySelector(`.drm-hero[data-id="${cssEscape(heroDream.id)}"]`);
    if (heroCard) {
      const delBtn = heroCard.querySelector('.drm-del');
      if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(heroDream); });
      heroCard.addEventListener('click', () => openDetailSheet(heroDream));
    }
  }
}

// 绑定卡片点击 / 长按 / 删除按钮
function bindCardInteractions(card, d) {
  const delBtn = card.querySelector('.drm-del');
  if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(d); });

  let pressTimer = null;
  let longPressed = false;
  const startPress = (e) => {
    longPressed = false;
    card.classList.add('pressing');
    pressTimer = setTimeout(() => {
      longPressed = true;
      card.classList.remove('pressing');
      confirmDelete(d);
    }, 600);
  };
  const cancelPress = () => {
    if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
    card.classList.remove('pressing');
  };
  // 触屏
  card.addEventListener('touchstart', startPress, { passive: true });
  card.addEventListener('touchend', cancelPress);
  card.addEventListener('touchmove', cancelPress, { passive: true });
  card.addEventListener('touchcancel', cancelPress);
  // 鼠标
  card.addEventListener('mousedown', startPress);
  card.addEventListener('mouseup', cancelPress);
  card.addEventListener('mouseleave', cancelPress);
  // 点击：如果不是长按，就打开详情
  card.addEventListener('click', () => {
    if (longPressed) { longPressed = false; return; }
    openDetailSheet(d);
  });
}

function renderHero(d) {
  const dreamIcon = createIcon('dream', 16).outerHTML;
  const smileIcon = moodIcon(d.mood, 14);
  const time = formatRelative(d.createdAt);
  const sourceIcon = d.source === 'manual' ? createIcon('pen', 14).outerHTML : createIcon('sparkle', 14).outerHTML;
  const sourceLabel = d.source === 'manual' ? '手记' : '自动';
  return `
    <div class="drm-hero" data-id="${escapeAttr(d.id)}">
      <div class="drm-hero-deco"></div>
      <button class="drm-del" aria-label="删除梦境" style="color:color-mix(in srgb, var(--bubble-user-text) 85%, transparent)">${createIcon('trash', 16).outerHTML}</button>
      <div class="drm-hero-tag">${dreamIcon}今日梦境</div>
      <div class="drm-hero-content">${escapeHTML(d.content)}</div>
      <div class="drm-hero-meta">
        ${d.mood ? `<span>${smileIcon}${escapeHTML(d.mood)}</span>` : ''}
        <span class="drm-source-tag">${sourceIcon}${sourceLabel}</span>
        ${d.source === 'auto' ? `<span>离开了 ${d.duration || 0} 小时</span>` : ''}
        <span>${escapeHTML(time)}</span>
      </div>
    </div>
  `;
}

function renderCard(d) {
  const style = getDreamClarityStyle(d);
  const time = formatRelative(d.createdAt);
  const sourceIcon = d.source === 'manual' ? createIcon('pen', 14).outerHTML : createIcon('sparkle', 14).outerHTML;
  const sourceLabel = d.source === 'manual' ? '手记' : '自动';
  const tagsHTML = (Array.isArray(d.tags) && d.tags.length)
    ? `<div class="drm-tag-row">${d.tags.map((t) => `<span class="drm-tag-pill">${createIcon('memo', 12).outerHTML}${escapeHTML(t)}</span>`).join('')}</div>`
    : '';
  return `
    <div class="drm-card" data-id="${escapeAttr(d.id)}" style="${style}">
      <button class="drm-del" aria-label="删除梦境">${createIcon('trash', 16).outerHTML}</button>
      <div class="drm-card-content">${escapeHTML(d.content)}</div>
      <div class="drm-card-meta">
        ${d.mood ? `<span class="drm-mood-tag">${moodIcon(d.mood, 14)}${escapeHTML(d.mood)}</span>` : ''}
        <span class="drm-source-tag">${sourceIcon}${sourceLabel}</span>
        ${d.source === 'auto' ? `<span>离开了 ${d.duration || 0} 小时</span>` : ''}
        <span>${escapeHTML(time)}</span>
      </div>
      ${tagsHTML}
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
// 手动添加梦境表单
// ════════════════════════════════════════

function openAddSheet() {
  let pickedMood = '开心';
  const body = document.createElement('div');

  const renderForm = () => {
    body.innerHTML = `
      <div class="drm-sheet-section">
        <div class="drm-sheet-label">把昨晚的梦写下来吧</div>
        <textarea class="textarea" id="drm-input-content" rows="4" placeholder="比如：梦见在云朵上打了个滚..." maxlength="500"></textarea>
      </div>
      <div class="drm-sheet-section">
        <div class="drm-sheet-label">今天的心情</div>
        <div class="drm-mood-picker" id="drm-mood-picker">
          ${MOODS.map((m) => `
            <button class="drm-mood-opt ${m.key === pickedMood ? 'active' : ''}" data-mood="${escapeAttr(m.key)}">
              ${createIcon(m.icon, 20).outerHTML}
              <span>${escapeHTML(m.label)}</span>
            </button>
          `).join('')}
        </div>
      </div>
      <div class="drm-sheet-section">
        <div class="drm-sheet-label">小标签（可选，逗号分隔）</div>
        <input class="input" id="drm-input-tags" placeholder="比如：甜甜的梦, 奇怪的梦" maxlength="60">
      </div>
      <button class="btn primary block" id="drm-save">${createIcon('check', 18).outerHTML}记下来</button>
    `;
    body.querySelectorAll('.drm-mood-opt').forEach((btn) => {
      btn.addEventListener('click', () => {
        pickedMood = btn.dataset.mood;
        body.querySelectorAll('.drm-mood-opt').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    body.querySelector('#drm-save').addEventListener('click', async () => {
      const content = body.querySelector('#drm-input-content').value.trim();
      const tagsRaw = body.querySelector('#drm-input-tags').value.trim();
      if (!content) { showToast('梦的内容要写一点点呀', 'error'); return; }
      const tags = tagsRaw ? tagsRaw.split(/[,，]/).map((t) => t.trim()).filter(Boolean).slice(0, 6) : [];
      const id = generateId('dream');
      const record = {
        id,
        content,
        mood: pickedMood,
        tags,
        source: 'manual',
        duration: 0,
        createdAt: getNow()
      };
      try {
        await setDB(STORES.dreams, id, record);
        sheet.close();
        showToast('记下来啦，是个软乎乎的梦呢', 'success', 1400);
        await render();
      } catch (e) {
        console.warn('[dream] 保存失败', e);
        showToast('没记上，再试一下嘛', 'error');
      }
    });
  };

  const sheet = showBottomSheet({
    title: '记录一个梦',
    bodyElement: body,
    dismissible: true
  });
  renderForm();
}

// ════════════════════════════════════════
// 详情查看
// ════════════════════════════════════════

function openDetailSheet(d) {
  const body = document.createElement('div');
  const sourceIcon = d.source === 'manual' ? createIcon('pen', 16).outerHTML : createIcon('sparkle', 16).outerHTML;
  const sourceLabel = d.source === 'manual' ? '我自己记的' : '小手机做的梦';
  const tagsHTML = (Array.isArray(d.tags) && d.tags.length)
    ? `<div class="drm-tag-row">${d.tags.map((t) => `<span class="drm-tag-pill">${createIcon('memo', 12).outerHTML}${escapeHTML(t)}</span>`).join('')}</div>`
    : '';
  body.innerHTML = `
    <div class="drm-detail-content">${escapeHTML(d.content || '')}</div>
    <div class="drm-detail-meta">
      ${d.mood ? `<span class="drm-mood-tag">${moodIcon(d.mood, 14)}${escapeHTML(d.mood)}</span>` : ''}
      <span class="drm-source-tag">${sourceIcon}${sourceLabel}</span>
      ${d.source === 'auto' ? `<span>离开了 ${d.duration || 0} 小时</span>` : ''}
      <span>${escapeHTML(formatRelative(d.createdAt))}</span>
    </div>
    ${tagsHTML}
    <div style="display:flex;gap:8px;margin-top:18px">
      <button class="btn ghost" style="flex:1;justify-content:center;color:#E8888C" id="drm-detail-del">${createIcon('trash', 16).outerHTML}忘掉这个梦</button>
    </div>
  `;
  const sheet = showBottomSheet({
    title: '梦的细节',
    bodyElement: body,
    dismissible: true
  });
  body.querySelector('#drm-detail-del').addEventListener('click', () => {
    // 关掉详情再确认，避免 sheet 堆叠
    sheet.close();
    setTimeout(() => confirmDelete(d), 80);
  });
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
