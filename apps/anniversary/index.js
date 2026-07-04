// apps/anniversary/index.js
// 纪念日 App——软萌少女风格 PWA「泡泡」。
// 我帮主人把每一个值得纪念的日子悄悄记下来，快到日子时会大声告诉她，
// 还能顺手把倒计时分享到朋友圈，让大家都来一起期待。
// 存 localStorage（KEYS.appAnniversaries），字段与桌面 widget 完全兼容：
//   {id, title, date(YYYY-MM-DD), emoji, note, repeat('year'|''),
//    cover(dataURL), remindDays(数字), reminded(bool), createdAt}
// 朋友圈分享走 IndexedDB（STORES.moments）。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js, core/app-bg.js

import { KEYS } from '../../core/storage-keys.js';
import { getData, setData, generateId, getNow, compressImage } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, pickImageFile, isUsableImage } from '../../core/util.js';
import { openApp } from '../../core/router.js';
import { applyAppBg } from '../../core/app-bg.js';
import { shareToMoments } from './share.js';

let containerEl = null;

// 八个 SVG 线稿图标供主人挑（红线：图标只准 SVG 线稿，不准 emoji）
const ICON_CHOICES = ['heart', 'star', 'gift', 'camera', 'dream', 'smile', 'moon', 'sun'];
const DEFAULT_ICON = 'heart';
const DEFAULT_REMIND_DAYS = 3; // 默认提前 3 天提醒

// 把图标名渲染成 SVG 线稿（兼容旧数据：若值不是已知图标名，回退成 heart）
function renderIcon(name, size) {
  const known = ICON_CHOICES.includes(name);
  return createIcon(known ? name : DEFAULT_ICON, size).outerHTML;
}

// 注入样式（基于 CSS 变量，主题变了我也跟着变）
injectStyle('app-anniversary-style', `
  .ann-hero {
    position: relative;
    overflow: hidden;
    border-radius: var(--radius-card);
    padding: 22px 18px 18px;
    margin-bottom: 16px;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
    color: var(--bubble-user-text);
    box-shadow: var(--shadow-md);
    cursor: pointer;
    transition: var(--motion);
    background-size: cover;
    background-position: center;
  }
  .ann-hero:active { transform: scale(var(--press-scale)); }
  .ann-hero.has-cover::before{
    content:""; position:absolute; inset:0;
    background:linear-gradient(135deg, color-mix(in srgb, var(--accent) 55%, transparent) 0%, color-mix(in srgb, var(--accent-dark) 78%, transparent) 100%);
    z-index:0;
  }
  .ann-hero > *{ position:relative; z-index:1; }
  .ann-hero-emoji {
    display: flex;
    line-height: 1;
    margin-bottom: 8px;
    color: var(--bubble-user-text);
    filter: drop-shadow(0 2px 6px color-mix(in srgb, var(--text-primary) 18%, transparent));
  }
  .ann-hero-title {
    font-size: var(--font-size-title);
    font-weight: 700;
    margin-bottom: 4px;
    word-break: break-word;
  }
  .ann-hero-date {
    font-size: var(--font-size-small);
    opacity: .9;
  }
  .ann-hero-days {
    font-size: var(--font-size-huge);
    font-weight: 700;
    margin-top: 10px;
    line-height: 1.1;
    word-break: break-word;
  }
  .ann-hero-note {
    font-size: var(--font-size-small);
    opacity: .92;
    margin-top: 6px;
    line-height: 1.5;
  }
  .ann-hero-bubble {
    position: absolute;
    border-radius: 50%;
    background: rgba(255,255,255,.18);
    pointer-events: none;
    z-index:0;
  }
  .ann-hero-bubble.b1 { width: 90px; height: 90px; right: -24px; top: -28px; }
  .ann-hero-bubble.b2 { width: 50px; height: 50px; right: 30px; bottom: -20px; background: rgba(255,255,255,.12); }
  .ann-hero-bubble.b3 { width: 26px; height: 26px; right: 70px; top: 18px; background: rgba(255,255,255,.22); }

  .ann-list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 4px 2px 10px;
  }
  .ann-list-head-title {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--text-secondary);
  }
  .ann-list-head-count {
    font-size: var(--font-size-small);
    color: var(--text-hint);
  }

  .ann-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    text-align: left;
    background: var(--bg-card);
    border: 1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: var(--motion);
    background-size: cover;
    background-position: center;
    position: relative;
    overflow: hidden;
  }
  .ann-item:active { transform: scale(var(--press-scale)); }
  .ann-item.has-cover{
    border:none;
    box-shadow:var(--shadow-md);
  }
  .ann-item.has-cover::before{
    content:""; position:absolute; inset:0;
    background:linear-gradient(to right, color-mix(in srgb, var(--bg-card) 92%, transparent), color-mix(in srgb, var(--bg-card) 70%, transparent));
    z-index:0;
  }
  .ann-item > *{ position:relative; z-index:1; }
  .ann-item-emoji {
    line-height: 1;
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--accent-dark);
    background: color-mix(in srgb, var(--accent-light) 50%, transparent);
    border-radius: 50%;
  }
  .ann-item-main { flex: 1; min-width: 0; }
  .ann-item-title {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ann-item-meta {
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ann-item-days {
    font-size: var(--font-size-title);
    font-weight: 700;
    color: var(--accent);
    flex-shrink: 0;
    text-align: right;
    white-space: nowrap;
    line-height: 1.1;
  }
  .ann-item-days small{
    display:block; font-size:var(--font-size-small);
    font-weight:400; color:var(--text-hint);
  }
  .ann-item-days.today { color: var(--accent); }
  .ann-item-days.past { color: var(--text-hint); }

  .ann-empty {
    text-align: center;
    padding: 60px 20px;
    color: var(--text-hint);
  }
  .ann-empty-emoji {
    color: var(--accent);
    display: flex;
    justify-content: center;
    margin-bottom: 12px;
    opacity: .8;
  }
  .ann-empty-text {
    font-size: var(--font-size-base);
    color: var(--text-secondary);
    line-height: 1.6;
  }

  .ann-emoji-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 6px;
    margin-bottom: 12px;
  }
  .ann-emoji-btn {
    aspect-ratio: 1;
    border-radius: var(--radius-sm);
    border: 2px solid transparent;
    background: var(--bg-secondary);
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: var(--motion);
  }
  .ann-emoji-btn:active { transform: scale(var(--press-scale)); }
  .ann-emoji-btn.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent-light) 60%, transparent);
  }
  .ann-field { margin-bottom: 10px; }
  .ann-field-label {
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    margin-bottom: 6px;
    display: block;
  }
  .ann-date-input {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    background: var(--bg-secondary);
    color: var(--text-primary);
    border: 1px solid color-mix(in srgb, var(--text-hint) 20%, transparent);
    font-size: var(--font-size-base);
  }
  .ann-cover-row{ display:flex; gap:10px; align-items:stretch; }
  .ann-cover-pick{
    flex:1; min-height:120px; border-radius:var(--radius-md);
    background:var(--bg-secondary); border:1px dashed color-mix(in srgb, var(--text-hint) 40%, transparent);
    cursor:pointer; display:flex; align-items:center; justify-content:center;
    overflow:hidden; padding:0; transition:var(--motion);
  }
  .ann-cover-pick:active{ transform:scale(var(--press-scale)); }
  .ann-cover-preview{ width:100%; height:120px; object-fit:cover; display:block; }
  .ann-cover-placeholder{ display:flex; flex-direction:column; align-items:center; gap:6px; color:var(--text-hint); }
  .ann-cover-placeholder em{ font-style:normal; font-size:var(--font-size-small); }
  .ann-cover-del{
    width:44px; border-radius:var(--radius-md);
    background:var(--bg-secondary); color:var(--danger); border:none; cursor:pointer;
    display:flex; align-items:center; justify-content:center;
  }
  .ann-cover-del:active{ transform:scale(var(--press-scale)); }
  .ann-actions { display: flex; gap: 8px; flex-wrap:wrap; }
  .ann-actions .btn { flex: 1; justify-content: center; min-width:80px; }
`);

// ========================================
// mount / unmount
// ========================================

export async function mount(container, context) {
  containerEl = container;
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="ann-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">纪念日</div>
      <button class="app-header-gear" id="ann-settings" aria-label="纪念日设置">${createIcon('settings', 18).outerHTML}</button>
      <button class="app-add" id="ann-add" aria-label="新增纪念日">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="ann-body"></div>
  `;
  container.querySelector('#ann-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#ann-add').addEventListener('click', () => openForm(null));
  // 齿轮跳到设置「数据与系统」分组
  container.querySelector('#ann-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'system' } }));
  await render();
  // mount 末尾：应用背景 + 检查即将到来的纪念日提醒
  applyAppBg(container, 'anniversary');
  checkReminders(getAll());
}

export function unmount() {
  containerEl = null;
}

// ========================================
// 数据读写（与桌面 widget 共用同一份 localStorage）
// ========================================

function getAll() {
  const v = getData(KEYS.appAnniversaries, []);
  return Array.isArray(v) ? v : [];
}

function saveAll(list) {
  setData(KEYS.appAnniversaries, list || []);
  // 桌面 widget 也读这个 key，告诉它该刷新啦
  bus.emit('desktop:refresh');
}

// ========================================
// 日期计算
// ========================================

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function parseDate(s) {
  if (!s) return null;
  // 兼容 YYYY-MM-DD：换成 / 让 Safari 等浏览器按本地时区解析
  const d = new Date(String(s).replace(/-/g, '/'));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 算下一次"该被提醒"的日期。
 * repeat='year' 时按周年滚动到今年/明年；否则用原日期。
 */
function nextOccurrence(item, today) {
  const d = parseDate(item.date);
  if (!d) return null;
  if (item.repeat === 'year') {
    let target = new Date(today.getFullYear(), d.getMonth(), d.getDate());
    if (target < startOfDay(today)) {
      target = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
    }
    return target;
  }
  return d;
}

function daysUntil(target, today) {
  if (!target) return null;
  const ms = startOfDay(target).getTime() - startOfDay(today).getTime();
  return Math.round(ms / 86400000);
}

/**
 * 给每条纪念日算出 days 与文案，并按距今天数升序排（最近的在最前）。
 */
function decorate(list) {
  const today = new Date();
  return list
    .map((item) => {
      const target = nextOccurrence(item, today);
      const days = daysUntil(target, today);
      return { item, target, days };
    })
    .filter((x) => x.days !== null)
    .sort((a, b) => a.days - b.days);
}

function dayText(days) {
  if (days === 0) return '就是今天';
  if (days > 0) return `${days}`;
  return `已过 ${Math.abs(days)}`;
}

function daySub(days) {
  if (days === 0) return '就是今天呀';
  if (days > 0) return '天后到啦';
  return '天前';
}

function prettyDate(s) {
  const d = parseDate(s);
  if (!d) return s || '';
  return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月${String(d.getDate()).padStart(2, '0')}日`;
}

// ========================================
// 提醒检查（mount 时跑一次）
// 规则：距今 <= remindDays 天 且 reminded=false -> 触发 + 标记
// 跨年重置：下一 occurrence 是明年的且 reminded=true -> 重置（每年独立提醒）
// ========================================

function checkReminders(list) {
  const today = new Date();
  let changed = false;
  for (const item of list) {
    const target = nextOccurrence(item, today);
    if (!target) continue;
    const days = daysUntil(target, today);
    const remindDays = Number(item.remindDays ?? DEFAULT_REMIND_DAYS);
    // 跨年重置：下一个 occurrence 是明年的，说明今年的已过，重置 reminded
    if (item.reminded && target.getFullYear() > today.getFullYear()) {
      item.reminded = false;
      changed = true;
    }
    // 距今 <= remindDays 天 且 reminded=false -> 触发提醒
    if (days >= 0 && days <= remindDays && !item.reminded) {
      item.reminded = true;
      changed = true;
      bus.emit('anniversary:reminder', { id: item.id, title: item.title, daysLeft: days });
      showToast('纪念日快到啦：' + item.title, 'success', 2600);
    }
  }
  if (changed) saveAll(list);
}

// ========================================
// 渲染
// ========================================

async function render() {
  if (!containerEl) return;
  const body = containerEl.querySelector('#ann-body');
  if (!body) return;
  const list = getAll();
  const sorted = decorate(list);

  if (sorted.length === 0) {
    body.innerHTML = `
      <div class="ann-empty">
        <div class="ann-empty-emoji">${renderIcon('heart', 48)}</div>
        <div class="ann-empty-text">还没有纪念日，加一个嘛，我会一直帮你记着</div>
      </div>
    `;
    return;
  }

  const hero = sorted[0];
  const rest = sorted.slice(1);

  body.innerHTML = `
    ${renderHero(hero)}
    <div class="ann-list-head">
      <span class="ann-list-head-title">全部纪念日</span>
      <span class="ann-list-head-count">共 ${sorted.length} 个</span>
    </div>
    ${rest.map(renderItem).join('')}
  `;

  // 顶部大卡片：点击编辑，长按弹菜单
  const heroEl = body.querySelector('.ann-hero');
  if (heroEl) {
    heroEl.addEventListener('click', () => {
      const target = list.find((x) => x.id === hero.item.id);
      if (target) openForm(target);
    });
    attachLongPress(heroEl, hero.item, hero);
  }
  // 其余条目：点击进入编辑，长按弹菜单
  body.querySelectorAll('.ann-item').forEach((el) => {
    const id = el.dataset.id;
    const decorated = rest.find((x) => x.item.id === id);
    el.addEventListener('click', () => {
      const target = list.find((x) => x.id === id);
      if (target) openForm(target);
    });
    if (decorated) attachLongPress(el, decorated.item, decorated);
  });
}

function renderHero(decorated) {
  const { item, days } = decorated;
  const today = days === 0;
  const repeatTag = item.repeat === 'year' ? ' · 每年提醒' : '';
  const daysText = today ? '就是今天呀' : `还有 ${days} 天就到啦`;
  const note = item.note ? `<div class="ann-hero-note">${escapeHTML(item.note)}</div>` : '';
  const coverBg = item.cover ? `style="background-image:url('${escapeAttr(item.cover)}');"` : '';
  return `
    <div class="ann-hero ${item.cover ? 'has-cover' : ''}" data-id="${item.id}" ${coverBg}>
      <span class="ann-hero-bubble b1"></span>
      <span class="ann-hero-bubble b2"></span>
      <span class="ann-hero-bubble b3"></span>
      <div class="ann-hero-emoji">${renderIcon(item.emoji, 40)}</div>
      <div class="ann-hero-title">${escapeHTML(item.title)}</div>
      <div class="ann-hero-date">${prettyDate(item.date)}${repeatTag}</div>
      <div class="ann-hero-days">${daysText}</div>
      ${note}
    </div>
  `;
}

function renderItem(decorated) {
  const { item, days } = decorated;
  const today = days === 0;
  const cls = today ? 'today' : days < 0 ? 'past' : '';
  const repeatTag = item.repeat === 'year' ? ' · 每年' : '';
  const noteTag = item.note ? ' · ' + escapeHTML(item.note) : '';
  // 有封面则用渐变蒙版盖一层，保证文字可读
  const coverStyle = item.cover
    ? `background-image:url('${escapeAttr(item.cover)}');`
    : '';
  const daysBig = today ? '今天' : (days > 0 ? days : Math.abs(days));
  const daysSub = today ? '就是今天呀' : (days > 0 ? '天后到啦' : '天前啦');
  return `
    <button class="ann-item ${item.cover ? 'has-cover' : ''}" data-id="${item.id}" ${coverStyle ? `style="${coverStyle}"` : ''}>
      <div class="ann-item-emoji">${renderIcon(item.emoji, 22)}</div>
      <div class="ann-item-main">
        <div class="ann-item-title">${escapeHTML(item.title)}</div>
        <div class="ann-item-meta">${prettyDate(item.date)}${repeatTag}${noteTag}</div>
      </div>
      <div class="ann-item-days ${cls}">${daysBig}<small>${daysSub}</small></div>
    </button>
  `;
}

// ========================================
// 长按菜单（编辑 / 分享到朋友圈 / 删除）
// ========================================

function attachLongPress(el, item, decorated) {
  if (!el || !item) return;
  let timer = null;
  const start = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      showItemMenu(item, decorated);
    }, 550);
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
  // 桌面端右键也能弹出
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showItemMenu(item, decorated);
  });
}

function showItemMenu(item, decorated) {
  const days = decorated?.days;
  const body = document.createElement('div');
  body.innerHTML = `
    <button class="btn ghost block" id="ann-menu-edit" style="margin-bottom:8px;">${createIcon('edit', 18).outerHTML} 编辑这条</button>
    <button class="btn ghost block" id="ann-menu-share" style="margin-bottom:8px;">${createIcon('upload', 18).outerHTML} 分享到朋友圈</button>
    <button class="btn ghost block" id="ann-menu-del" style="color:var(--danger);">${createIcon('trash', 18).outerHTML} 删掉</button>
  `;
  const sheet = showBottomSheet({
    title: item.title || '纪念日',
    bodyElement: body,
    dismissible: true
  });
  body.querySelector('#ann-menu-edit').addEventListener('click', () => { sheet.close(); openForm(item); });
  body.querySelector('#ann-menu-share').addEventListener('click', () => {
    sheet.close();
    // 用最新的列表数据重新算一次倒计时，避免数据陈旧
    const fresh = getAll().find((x) => x.id === item.id) || item;
    const today = new Date();
    const target = nextOccurrence(fresh, today);
    const d = daysUntil(target, today);
    shareToMoments(fresh, d);
  });
  body.querySelector('#ann-menu-del').addEventListener('click', () => {
    sheet.close();
    showConfirm({
      title: '真的要删掉吗？',
      body: `「${item.title}」会被我忘掉哦`,
      confirmText: '删掉吧',
      cancelText: '再想想',
      danger: true,
      onConfirm: () => {
        const list = getAll().filter((x) => x.id !== item.id);
        saveAll(list);
        bus.emit('anniversary:changed', { id: item.id, action: 'delete' });
        showToast('删掉啦', 'default');
        render();
      }
    });
  });
}

// ========================================
// 表单（新增 / 编辑共用）
// ========================================

function openForm(existing) {
  const editing = !!existing;
  const data = existing || { emoji: ICON_CHOICES[0], repeat: '', remindDays: DEFAULT_REMIND_DAYS };

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="ann-field">
      <label class="ann-field-label" for="ann-f-title">叫什么名字</label>
      <input class="input" id="ann-f-title" placeholder="比如：第一次见面" value="${escapeAttr(data.title || '')}" maxlength="40">
    </div>
    <div class="ann-field">
      <label class="ann-field-label" for="ann-f-date">哪一天</label>
      <input type="date" class="ann-date-input" id="ann-f-date" value="${escapeAttr(data.date || '')}">
    </div>
    <div class="ann-field">
      <label class="ann-field-label">选个小图标</label>
      <div class="ann-emoji-grid" id="ann-f-emoji">
        ${ICON_CHOICES.map((e) => `<button type="button" class="ann-emoji-btn ${e === data.emoji ? 'active' : ''}" data-emoji="${e}">${renderIcon(e, 22)}</button>`).join('')}
      </div>
    </div>
    <div class="ann-field">
      <label class="ann-field-label">封面图（可以不传）</label>
      <div class="ann-cover-row" id="ann-f-cover-row">
        <button type="button" class="ann-cover-pick" id="ann-f-cover-pick">${
          data.cover
            ? `<img class="ann-cover-preview" alt="封面预览" src="${escapeAttr(data.cover)}">`
            : `<span class="ann-cover-placeholder">${createIcon('camera', 24).outerHTML}<em>选张封面嘛</em></span>`
        }</button>
        ${data.cover ? `<button type="button" class="ann-cover-del" id="ann-f-cover-del" aria-label="删掉封面">${createIcon('trash', 18).outerHTML}</button>` : ''}
      </div>
    </div>
    <div class="ann-field">
      <label class="ann-field-label" for="ann-f-note">悄悄记一笔（可以不写）</label>
      <textarea class="textarea" id="ann-f-note" placeholder="想说点什么..." maxlength="200">${escapeHTML(data.note || '')}</textarea>
    </div>
    <div class="ann-field">
      <label class="ann-field-label" for="ann-f-repeat">重复方式</label>
      <select class="ann-date-input" id="ann-f-repeat">
        <option value="" ${data.repeat !== 'year' ? 'selected' : ''}>只这一次</option>
        <option value="year" ${data.repeat === 'year' ? 'selected' : ''}>每年都提醒</option>
      </select>
    </div>
    <div class="ann-field">
      <label class="ann-field-label" for="ann-f-remind">提前几天提醒我</label>
      <input type="number" class="ann-date-input" id="ann-f-remind" min="0" max="60" value="${escapeAttr(String(data.remindDays ?? DEFAULT_REMIND_DAYS))}">
    </div>
    <div class="ann-actions">
      ${editing ? `<button class="btn ghost" id="ann-f-share">${createIcon('upload', 16).outerHTML} 分享</button>` : ''}
      ${editing ? '<button class="btn ghost" id="ann-f-del">删掉</button>' : ''}
      <button class="btn primary" id="ann-f-ok">${editing ? '改好啦' : '记下来'}</button>
    </div>
  `;

  const sheet = showBottomSheet({
    title: editing ? '改一下纪念日' : '加一个纪念日',
    bodyElement: body,
    dismissible: true
  });

  // 选中的 emoji
  let pickedEmoji = data.emoji || ICON_CHOICES[0];
  const emojiGrid = body.querySelector('#ann-f-emoji');
  emojiGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.ann-emoji-btn');
    if (!btn) return;
    pickedEmoji = btn.dataset.emoji;
    emojiGrid.querySelectorAll('.ann-emoji-btn').forEach((b) => b.classList.toggle('active', b === btn));
  });

  // 封面选择 / 删除
  let pickedCover = data.cover || '';
  const coverPick = body.querySelector('#ann-f-cover-pick');
  const coverRow = body.querySelector('#ann-f-cover-row');
  const renderCoverUI = () => {
    if (pickedCover) {
      coverPick.innerHTML = `<img class="ann-cover-preview" alt="封面预览" src="${escapeAttr(pickedCover)}">`;
      if (!coverRow.querySelector('.ann-cover-del')) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'ann-cover-del';
        delBtn.id = 'ann-f-cover-del';
        delBtn.setAttribute('aria-label', '删掉封面');
        delBtn.innerHTML = createIcon('trash', 18).outerHTML;
        delBtn.addEventListener('click', () => { pickedCover = ''; renderCoverUI(); });
        coverRow.appendChild(delBtn);
      }
    } else {
      coverPick.innerHTML = `<span class="ann-cover-placeholder">${createIcon('camera', 24).outerHTML}<em>选张封面嘛</em></span>`;
      const oldDel = coverRow.querySelector('.ann-cover-del');
      if (oldDel) oldDel.remove();
    }
  };
  if (coverPick) {
    coverPick.addEventListener('click', async () => {
      try {
        const file = await pickImageFile();
        if (!isUsableImage(file)) { showToast('这张图好像不太行嘛', 'error'); return; }
        showToast('正在处理封面...', 'default', 1000);
        const dataURL = await compressImage(file, { maxWidth: 800, maxHeight: 600 });
        pickedCover = dataURL;
        renderCoverUI();
      } catch (e) {
        if (e && /取消/.test(e.message || '')) return;
        console.warn('[anniversary] 选封面失败', e);
        showToast('没选成功，再试一下嘛', 'error');
      }
    });
  }
  const coverDel = body.querySelector('#ann-f-cover-del');
  if (coverDel) {
    coverDel.addEventListener('click', () => { pickedCover = ''; renderCoverUI(); });
  }

  // 保存
  body.querySelector('#ann-f-ok').addEventListener('click', () => {
    const title = body.querySelector('#ann-f-title').value.trim();
    const date = body.querySelector('#ann-f-date').value;
    const note = body.querySelector('#ann-f-note').value.trim();
    const repeat = body.querySelector('#ann-f-repeat').value;
    const remindDays = Math.max(0, Math.min(60, Number(body.querySelector('#ann-f-remind').value) || 0));

    if (!title) { showToast('起个名字嘛', 'error'); return; }
    if (!date) { showToast('选个日期嘛', 'error'); return; }

    const list = getAll();
    let savedId;
    if (editing) {
      const idx = list.findIndex((x) => x.id === data.id);
      if (idx >= 0) {
        const old = list[idx];
        // 日期或重复方式变了 -> 重置 reminded，让它能重新触发提醒
        const dateChanged = old.date !== date || old.repeat !== repeat;
        list[idx] = {
          ...old,
          title, date, emoji: pickedEmoji, note, repeat,
          cover: pickedCover || '',
          remindDays,
          reminded: dateChanged ? false : (old.reminded || false)
        };
        savedId = list[idx].id;
      }
    } else {
      const created = {
        id: generateId('ann'),
        title, date, emoji: pickedEmoji, note, repeat,
        cover: pickedCover || '',
        remindDays,
        reminded: false,
        createdAt: getNow()
      };
      list.push(created);
      savedId = created.id;
    }
    saveAll(list);
    bus.emit('anniversary:changed', { id: savedId, action: editing ? 'edit' : 'add' });
    sheet.close();
    showToast(editing ? '改好啦' : '记下来啦，我会一直记得', 'success');
    render();
  });

  // 分享按钮（仅编辑时）
  const shareBtn = body.querySelector('#ann-f-share');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      // 用当前表单值算倒计时，主人改到一半也能分享
      const title = body.querySelector('#ann-f-title').value.trim() || data.title || '纪念日';
      const date = body.querySelector('#ann-f-date').value || data.date;
      const repeat = body.querySelector('#ann-f-repeat').value;
      if (!date) { showToast('先把日期填好嘛', 'error'); return; }
      const today = new Date();
      const target = nextOccurrence({ date, repeat }, today);
      const d = daysUntil(target, today);
      shareToMoments({ ...data, title, date, repeat }, d);
    });
  }

  // 删除（仅编辑时）
  const delBtn = body.querySelector('#ann-f-del');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      showConfirm({
        title: '真的要删掉吗？',
        body: `「${data.title}」会被我忘掉哦`,
        confirmText: '删掉吧',
        cancelText: '再想想',
        danger: true,
        onConfirm: () => {
          const list = getAll().filter((x) => x.id !== data.id);
          saveAll(list);
          bus.emit('anniversary:changed', { id: data.id, action: 'delete' });
          sheet.close();
          showToast('删掉啦', 'default');
          render();
        }
      });
    });
  }
}

// ========================================
// 工具
// ========================================

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) {
  return escapeHTML(s).replace(/"/g, '&quot;');
}
