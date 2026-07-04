// apps/health/index.js
// 健康打卡 App——软萌少女风 PWA「泡泡」。
// 功能：
//   1) 今日打卡：喝水(0-12 杯) / 睡眠(0-12 小时) / 步数 / 一句话备注
//   2) IndexedDB 持久化（STORES.healthEntries），一天一条，同日覆盖
//   3) 自动保存（debounce 800ms）+ 手动保存按钮
//   4) 顶部小统计：本周平均睡眠 / 平均喝水
//   5) 下方本周记录列表（按日期倒序）
//   6) 晚睡关心提示（读 config.health.lateSleepThresholdHour）
//   7) 空状态文案
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js,
//      core/util.js, core/config.js

import { STORES } from '../../core/storage-keys.js';
import { setDB, getAllDB } from '../../core/storage.js';
import { showToast, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { formatDate, clamp, debounce, injectStyle } from '../../core/util.js';
import { get as getConfig } from '../../core/config.js';

let containerEl = null;
let todayEntry = null;   // 今天的打卡（可能为 null）
let weekEntries = [];    // 本周记录（按日期倒序）

// 自动保存：800ms 防抖，避免边输入边写库
const debouncedSave = debounce(() => saveEntry(false), 800);

// ════════════════════════════════════════
// 样式（自定义部分，全走 CSS 变量）
// ════════════════════════════════════════

injectStyle('app-health-style', `
  .health-stats{ display:flex; gap:12px }
  .health-stat{ flex:1; text-align:center; padding:14px 8px; background:color-mix(in srgb,var(--accent-light) 22%,transparent); border-radius:var(--radius-md) }
  .health-stat-label{ font-size:var(--font-size-small); color:var(--text-secondary); margin-bottom:6px }
  .health-stat-value{ font-size:var(--font-size-title); font-weight:600; color:var(--text-primary) }
  .health-stat-value span{ font-size:var(--font-size-small); font-weight:400; color:var(--text-secondary) }
  .health-counter{ display:flex; align-items:center; gap:10px }
  .health-counter button{ width:34px; height:34px; border-radius:50%; padding:0; justify-content:center }
  .health-counter-value{ min-width:28px; text-align:center; font-size:var(--font-size-title); font-weight:600; color:var(--text-primary) }
  .health-num-input{ text-align:right }
  .health-week-list{ display:flex; flex-direction:column; gap:0 }
  .health-week-row{ padding:12px 0; border-bottom:1px solid color-mix(in srgb,var(--text-hint) 12%,transparent) }
  .health-week-row:last-child{ border-bottom:0 }
  .health-week-date{ display:flex; align-items:center; gap:8px; margin-bottom:6px }
  .health-week-date-main{ font-size:var(--font-size-base); color:var(--text-primary); font-weight:500 }
  .health-week-today-badge{ font-size:11px; padding:2px 8px; border-radius:999px; background:var(--accent); color:var(--bubble-user-text) }
  .health-week-data{ display:flex; flex-wrap:wrap; gap:14px; font-size:var(--font-size-small); color:var(--text-secondary) }
  .health-week-data span{ display:inline-flex; align-items:center; gap:4px }
  .health-week-data .popo-icon-svg{ color:var(--accent) }
  .health-week-note{ font-size:var(--font-size-small); color:var(--text-secondary); margin-top:6px; padding:6px 10px; background:color-mix(in srgb,var(--bg-secondary) 60%,transparent); border-radius:var(--radius-sm) }
  .health-save-hint{ font-size:var(--font-size-small); color:var(--text-hint); text-align:center; margin-top:8px }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="health-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">健康打卡</div>
      <span style="width:36px"></span>
    </div>
    <div class="app-body" id="health-body"></div>
  `;
  container.querySelector('#health-back').addEventListener('click', () => bus.emit('router:home'));
  await render();
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 主渲染
// ════════════════════════════════════════

async function render() {
  await loadEntries();
  renderAll();
}

async function loadEntries() {
  let all = [];
  try {
    all = await getAllDB(STORES.healthEntries);
  } catch (e) {
    console.warn('[health] 读取记录失败', e);
    all = [];
  }
  if (!Array.isArray(all)) all = [];

  const today = todayStr();
  todayEntry = all.find((e) => e && e.date === today) || null;

  const weekStart = startOfWeek();
  weekEntries = all
    .filter((e) => e && e.date && new Date(e.date + 'T00:00:00') >= weekStart)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

function renderAll() {
  const body = containerEl.querySelector('#health-body');
  if (!body) return;
  body.innerHTML = '';
  body.appendChild(renderStatsCard());
  body.appendChild(renderTodayCard());
  body.appendChild(renderWeekCard());
}

// ════════════════════════════════════════
// 顶部统计卡片
// ════════════════════════════════════════

function renderStatsCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'health-stats-card';
  const week = weekStats();
  const hint = week.count === 0
    ? '本周还没打卡，先从今天开始吧'
    : `已坚持 ${week.count} 天，继续加油呀`;
  card.innerHTML = `
    <div class="card-title">本周小总结</div>
    <div class="health-stats">
      <div class="health-stat">
        <div class="health-stat-label">平均睡眠</div>
        <div class="health-stat-value">${week.avgSleep.toFixed(1)}<span> 小时</span></div>
      </div>
      <div class="health-stat">
        <div class="health-stat-label">平均喝水</div>
        <div class="health-stat-value">${week.avgWater.toFixed(1)}<span> 杯</span></div>
      </div>
    </div>
    <div class="health-save-hint">${escapeHtml(hint)}</div>
  `;
  return card;
}

// ════════════════════════════════════════
// 今日打卡卡片
// ════════════════════════════════════════

function renderTodayCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'health-today-card';

  const t = todayEntry || { date: todayStr(), water: 0, sleep: 0, steps: 0, note: '' };
  const water = Number(t.water) || 0;
  const sleep = Number(t.sleep) || 0;
  const steps = Number(t.steps) || 0;
  const note = t.note || '';

  card.innerHTML = `
    <div class="card-title">今日打卡 · ${escapeHtml(formatDate(new Date(), { withWeek: true }))}</div>
    <div class="card-row">
      <span class="card-row-label">喝水（杯）</span>
      <div class="health-counter">
        <button class="btn" data-act="water-minus" aria-label="少喝一杯">${createIcon('minus', 16).outerHTML}</button>
        <span class="health-counter-value" id="health-water-val">${water}</span>
        <button class="btn" data-act="water-plus" aria-label="多喝一杯">${createIcon('plus', 16).outerHTML}</button>
      </div>
    </div>
    <div class="card-row">
      <span class="card-row-label">睡眠（小时）</span>
      <input type="number" class="input health-num-input" id="health-sleep" min="0" max="12" step="0.5" value="${sleep}" style="width:110px">
    </div>
    <div class="card-row">
      <span class="card-row-label">步数</span>
      <input type="number" class="input health-num-input" id="health-steps" min="0" step="100" value="${steps}" style="width:130px">
    </div>
    <div style="margin-top:12px">
      <div class="card-row-label" style="margin-bottom:6px">一句话备注</div>
      <textarea class="textarea" id="health-note" placeholder="今天感觉怎么样...">${escapeHtml(note)}</textarea>
    </div>
    <button class="btn primary block" id="health-save" style="margin-top:14px">${createIcon('check', 18).outerHTML} 保存打卡</button>
    <div class="health-save-hint">改完会自动保存哦，不用一直点</div>
  `;

  // 喝水 +/-
  const waterEl = card.querySelector('#health-water-val');
  const minusBtn = card.querySelector('[data-act=water-minus]');
  const plusBtn = card.querySelector('[data-act=water-plus]');
  if (minusBtn) minusBtn.addEventListener('click', () => {
    const cur = Number(waterEl.textContent) || 0;
    waterEl.textContent = String(clamp(cur - 1, 0, 12));
    debouncedSave();
  });
  if (plusBtn) plusBtn.addEventListener('click', () => {
    const cur = Number(waterEl.textContent) || 0;
    waterEl.textContent = String(clamp(cur + 1, 0, 12));
    debouncedSave();
  });

  // 输入框自动保存
  const sleepInput = card.querySelector('#health-sleep');
  const stepsInput = card.querySelector('#health-steps');
  const noteInput = card.querySelector('#health-note');
  if (sleepInput) sleepInput.addEventListener('input', debouncedSave);
  if (stepsInput) stepsInput.addEventListener('input', debouncedSave);
  if (noteInput) noteInput.addEventListener('input', debouncedSave);

  // 手动保存
  const saveBtn = card.querySelector('#health-save');
  if (saveBtn) saveBtn.addEventListener('click', () => saveEntry(true));

  return card;
}

// ════════════════════════════════════════
// 本周记录卡片
// ════════════════════════════════════════

function renderWeekCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'health-week-card';

  if (weekEntries.length === 0) {
    card.innerHTML = `
      <div class="card-title">本周记录</div>
      <div class="empty-state">
        <div class="empty-state-icon">${createIcon('heart', 48).outerHTML}</div>
        <div class="empty-state-text">今天还没打卡，喝杯水嘛</div>
      </div>
    `;
    return card;
  }

  card.innerHTML = `<div class="card-title">本周记录</div>`;
  const list = document.createElement('div');
  list.className = 'health-week-list';

  weekEntries.forEach((e) => {
    const isToday = e.date === todayStr();
    const row = document.createElement('div');
    row.className = 'health-week-row';
    const dateLabel = formatDate(e.date + 'T00:00:00', { withWeek: true }) || e.date;
    row.innerHTML = `
      <div class="health-week-date">
        <div class="health-week-date-main">${escapeHtml(dateLabel)}</div>
        ${isToday ? '<div class="health-week-today-badge">今天</div>' : ''}
      </div>
      <div class="health-week-data">
        <span title="喝水">${createIcon('weather', 14).outerHTML} ${Number(e.water) || 0} 杯</span>
        <span title="睡眠">${createIcon('moon', 14).outerHTML} ${Number(e.sleep) || 0} 小时</span>
        <span title="步数">${createIcon('heart', 14).outerHTML} ${Number(e.steps) || 0} 步</span>
      </div>
      ${e.note ? `<div class="health-week-note">${escapeHtml(e.note)}</div>` : ''}
    `;
    list.appendChild(row);
  });

  card.appendChild(list);
  return card;
}

// ════════════════════════════════════════
// 保存（自动 / 手动）
// ════════════════════════════════════════

async function saveEntry(showFeedback) {
  if (!containerEl) return;
  // 取消任何待执行的自动保存，避免重复写
  debouncedSave.cancel();

  const body = containerEl.querySelector('#health-body');
  if (!body) return;

  const waterEl = body.querySelector('#health-water-val');
  const sleepEl = body.querySelector('#health-sleep');
  const stepsEl = body.querySelector('#health-steps');
  const noteEl = body.querySelector('#health-note');

  const waterRaw = Number((waterEl && waterEl.textContent) || 0);
  const water = clamp(isNaN(waterRaw) ? 0 : waterRaw, 0, 12);

  const sleepRaw = Number((sleepEl && sleepEl.value) || 0);
  const sleep = clamp(isNaN(sleepRaw) ? 0 : sleepRaw, 0, 12);

  const stepsRaw = Number((stepsEl && stepsEl.value) || 0);
  const steps = isNaN(stepsRaw) ? 0 : Math.max(0, Math.floor(stepsRaw));

  const note = String((noteEl && noteEl.value) || '').trim();

  const date = todayStr();
  const entry = { id: date, date, water, sleep, steps, note };

  try {
    await setDB(STORES.healthEntries, date, entry);
    todayEntry = entry;

    // 同步本周列表内存
    const idx = weekEntries.findIndex((e) => e.date === date);
    if (idx >= 0) weekEntries[idx] = entry;
    else {
      weekEntries.unshift(entry);
      weekEntries.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    }

    if (showFeedback) {
      showToast('打卡好啦，今天也辛苦自己啦', 'success', 1600);
      checkLateSleep(sleep);
    }

    // 只刷新统计 + 本周列表，不动今日卡片（保留输入焦点）
    const oldStats = body.querySelector('#health-stats-card');
    const oldWeek = body.querySelector('#health-week-card');
    if (oldStats) oldStats.replaceWith(renderStatsCard());
    if (oldWeek) oldWeek.replaceWith(renderWeekCard());
  } catch (e) {
    console.warn('[health] 保存失败', e);
    showToast('保存失败啦，再试一次嘛', 'error', 2000);
  }
}

// ════════════════════════════════════════
// 晚睡关心提示
// ════════════════════════════════════════

function checkLateSleep(sleepHours) {
  const threshold = getConfig('health.lateSleepThresholdHour', 1);
  const hour = new Date().getHours();
  // 时间晚：22 点以后到第二天 6 点之前
  const isLate = hour >= 22 || hour < 6;
  if (sleepHours < threshold && isLate) {
    // 延迟一点再提示，避免和保存成功 toast 撞车
    setTimeout(() => {
      showToast('又晚睡啦，早点休息嘛', 'default', 2800);
    }, 1000);
  }
}

// ════════════════════════════════════════
// 统计 & 日期工具
// ════════════════════════════════════════

function weekStats() {
  if (!weekEntries.length) return { avgSleep: 0, avgWater: 0, count: 0 };
  let totalSleep = 0, totalWater = 0;
  weekEntries.forEach((e) => {
    totalSleep += Number(e.sleep) || 0;
    totalWater += Number(e.water) || 0;
  });
  return {
    avgSleep: totalSleep / weekEntries.length,
    avgWater: totalWater / weekEntries.length,
    count: weekEntries.length
  };
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=周日, 1=周一
  // 回到本周周一
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
