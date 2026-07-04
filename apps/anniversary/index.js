// apps/anniversary/index.js
// 纪念日 App——软萌少女风格 PWA「泡泡」。
// 我帮主人把每一个值得纪念的日子悄悄记下来，到了日子会大声告诉她。
// 存 localStorage（KEYS.appAnniversaries），字段与桌面 widget 完全兼容：
//   {id, title, date(YYYY-MM-DD), emoji, note, repeat('year'|''), createdAt}
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { KEYS } from '../../core/storage-keys.js';
import { getData, setData, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle } from '../../core/util.js';

let containerEl = null;

// 八个 SVG 线稿图标供主人挑（红线：图标只准 SVG 线稿，不准 emoji）
const ICON_CHOICES = ['heart', 'star', 'gift', 'camera', 'dream', 'smile', 'moon', 'sun'];
const DEFAULT_ICON = 'heart';

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
  }
  .ann-hero:active { transform: scale(var(--press-scale)); }
  .ann-hero-emoji {
    display: flex;
    line-height: 1;
    margin-bottom: 8px;
    color: var(--bubble-user-text);
    filter: drop-shadow(0 2px 6px rgba(0,0,0,.18));
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
  }
  .ann-item:active { transform: scale(var(--press-scale)); }
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
    font-size: var(--font-size-small);
    font-weight: 600;
    color: var(--accent-dark);
    flex-shrink: 0;
    text-align: right;
    white-space: nowrap;
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
  .ann-repeat-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: var(--bg-secondary);
    border-radius: var(--radius-sm);
    margin-bottom: 12px;
  }
  .ann-repeat-row label {
    font-size: var(--font-size-base);
    color: var(--text-primary);
    cursor: pointer;
    flex: 1;
  }
  .ann-actions { display: flex; gap: 8px; }
  .ann-actions .btn { flex: 1; justify-content: center; }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="ann-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">纪念日</div>
      <button class="app-add" id="ann-add" aria-label="新增纪念日">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="ann-body"></div>
  `;
  container.querySelector('#ann-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#ann-add').addEventListener('click', () => openForm(null));
  await render();
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 数据读写（与桌面 widget 共用同一份 localStorage）
// ════════════════════════════════════════

function getAll() {
  const v = getData(KEYS.appAnniversaries, []);
  return Array.isArray(v) ? v : [];
}

function saveAll(list) {
  setData(KEYS.appAnniversaries, list || []);
  // 桌面 widget 也读这个 key，告诉它该刷新啦
  bus.emit('desktop:refresh');
}

// ════════════════════════════════════════
// 日期计算
// ════════════════════════════════════════

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
  if (days === 0) return '就是今天呀';
  if (days > 0) return `还有 ${days} 天`;
  return `已过 ${Math.abs(days)} 天`;
}

function prettyDate(s) {
  const d = parseDate(s);
  if (!d) return s || '';
  return `${d.getFullYear()}年${String(d.getMonth() + 1).padStart(2, '0')}月${String(d.getDate()).padStart(2, '0')}日`;
}

// ════════════════════════════════════════
// 渲染
// ════════════════════════════════════════

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

  // 顶部大卡片也支持点击编辑
  body.querySelector('.ann-hero')?.addEventListener('click', () => {
    const target = list.find((x) => x.id === hero.item.id);
    if (target) openForm(target);
  });
  // 其余条目点击进入编辑
  body.querySelectorAll('.ann-item').forEach((el) => {
    const id = el.dataset.id;
    el.addEventListener('click', () => {
      const target = list.find((x) => x.id === id);
      if (target) openForm(target);
    });
  });
}

function renderHero(decorated) {
  const { item, days } = decorated;
  const today = days === 0;
  const repeatTag = item.repeat === 'year' ? ' · 每年提醒' : '';
  const daysText = today ? '就是今天呀' : `还有 ${days} 天就到啦`;
  const note = item.note ? `<div class="ann-hero-note">${escapeHTML(item.note)}</div>` : '';
  return `
    <div class="ann-hero" data-id="${item.id}">
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
  return `
    <button class="ann-item" data-id="${item.id}">
      <div class="ann-item-emoji">${renderIcon(item.emoji, 22)}</div>
      <div class="ann-item-main">
        <div class="ann-item-title">${escapeHTML(item.title)}</div>
        <div class="ann-item-meta">${prettyDate(item.date)}${repeatTag}${noteTag}</div>
      </div>
      <div class="ann-item-days ${cls}">${dayText(days)}</div>
    </button>
  `;
}

// ════════════════════════════════════════
// 表单（新增 / 编辑共用）
// ════════════════════════════════════════

function openForm(existing) {
  const editing = !!existing;
  const data = existing || { emoji: ICON_CHOICES[0], repeat: '' };

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
      <label class="ann-field-label" for="ann-f-note">悄悄记一笔（可以不写）</label>
      <textarea class="textarea" id="ann-f-note" placeholder="想说点什么..." maxlength="200">${escapeHTML(data.note || '')}</textarea>
    </div>
    <div class="ann-repeat-row">
      <label for="ann-f-repeat">每年都提醒我</label>
      <input type="checkbox" id="ann-f-repeat" ${data.repeat === 'year' ? 'checked' : ''}>
    </div>
    <div class="ann-actions">
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

  // 保存
  body.querySelector('#ann-f-ok').addEventListener('click', () => {
    const title = body.querySelector('#ann-f-title').value.trim();
    const date = body.querySelector('#ann-f-date').value;
    const note = body.querySelector('#ann-f-note').value.trim();
    const repeat = body.querySelector('#ann-f-repeat').checked ? 'year' : '';

    if (!title) { showToast('起个名字嘛', 'error'); return; }
    if (!date) { showToast('选个日期嘛', 'error'); return; }

    const list = getAll();
    if (editing) {
      const idx = list.findIndex((x) => x.id === data.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], title, date, emoji: pickedEmoji, note, repeat };
      }
    } else {
      list.push({
        id: generateId('ann'),
        title, date, emoji: pickedEmoji, note, repeat,
        createdAt: getNow()
      });
    }
    saveAll(list);
    sheet.close();
    showToast(editing ? '改好啦' : '记下来啦，我会一直记得', 'success');
    render();
  });

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
          sheet.close();
          showToast('删掉啦', 'default');
          render();
        }
      });
    });
  }
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) {
  return escapeHTML(s).replace(/"/g, '&quot;');
}
