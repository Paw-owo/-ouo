// apps/health/index.js
// 健康打卡 App——软萌少女风 PWA「泡泡」。
// 功能：
//   1) 今日打卡：喝水(0-12 杯) / 睡眠(0-12 小时) / 步数 / 体重(BMI 自动算) / 运动 / 一句话备注
//   2) 目标设定：每个维度可设每日目标，进度环展示完成度，达成目标 toast 庆祝
//   3) 图表可视化：本周趋势柱状图（纯 CSS/SVG），每个维度一张图
//   4) 喝水提醒：每 N 小时弹一次，设置存 localStorage
//   5) IndexedDB 持久化（STORES.healthEntries），一天一条，同日覆盖
//   6) 自动保存（debounce 800ms）+ 手动保存按钮
//   7) 顶部小统计：本周平均睡眠 / 平均喝水
//   8) 本周记录列表（按日期倒序）
//   9) 晚睡关心提示（读 config.health.lateSleepThresholdHour）
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js,
//      core/util.js, core/config.js

import { STORES, KEYS } from '../../core/storage-keys.js';
import { setDB, getAllDB, getData, setData } from '../../core/storage.js';
import { showToast, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { formatDate, clamp, debounce, injectStyle } from '../../core/util.js';
import { get as getConfig } from '../../core/config.js';
import { openApp } from '../../core/router.js';
import { applyAppBg } from '../../core/app-bg.js';

let containerEl = null;
let todayEntry = null;   // 今天的打卡（可能为 null）
let weekEntries = [];    // 本周记录（按日期倒序）
let goals = defaultGoals(); // 每日目标 + 身高 + 喝水提醒设置
let reminderTimer = null;   // 喝水提醒定时器
let celebratedKeys = new Set(); // 已庆祝过的目标，避免重复 toast

// 默认目标配置（软萌推荐值）
function defaultGoals() {
  return {
    water: 8,        // 杯
    sleep: 8,        // 小时
    steps: 8000,     // 步
    exerciseMin: 30, // 分钟
    height: 0,       // cm（用于算 BMI，0 = 没填）
    reminder: { enabled: false, intervalMin: 120 } // 喝水提醒
  };
}

// 自动保存：800ms 防抖，避免边输入边写库
const debouncedSave = debounce(() => saveEntry(false), 800);

// 运动类型选项
const EXERCISE_TYPES = [
  { key: 'run', label: '跑步' },
  { key: 'walk', label: '散步' },
  { key: 'cycle', label: '骑行' },
  { key: 'yoga', label: '瑜伽' }
];
const INTENSITY_LEVELS = [
  { key: 'light', label: '轻松' },
  { key: 'medium', label: '适中' },
  { key: 'hard', label: '爆汗' }
];

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
  /* 进度环：今日完成度 */
  .health-ring-row{ display:flex; gap:10px; flex-wrap:wrap; margin:6px 0 4px }
  .health-ring{ flex:1; min-width:72px; display:flex; flex-direction:column; align-items:center; gap:4px; padding:10px 4px; background:color-mix(in srgb,var(--accent-light) 18%,transparent); border-radius:var(--radius-md) }
  .health-ring-svg{ display:block }
  .health-ring-svg .track{ stroke:color-mix(in srgb,var(--text-hint) 30%,transparent) }
  .health-ring-svg .bar{ stroke:var(--accent); transition:stroke-dashoffset var(--motion) var(--motion-spring) }
  .health-ring-svg .bar.done{ stroke:var(--success) }
  .health-ring-label{ font-size:var(--font-size-small); color:var(--text-secondary) }
  .health-ring-pct{ font-size:11px; color:var(--text-hint) }
  .health-ring-text{ font-size:13px; font-weight:600; color:var(--text-primary) }
  /* 体重 + BMI 行 */
  .health-weight-row{ display:flex; gap:10px; align-items:flex-end; flex-wrap:wrap }
  .health-weight-row .input{ flex:1; min-width:120px }
  .health-bmi{ font-size:var(--font-size-small); color:var(--text-secondary); padding:6px 12px; border-radius:var(--radius-sm); background:color-mix(in srgb,var(--accent-light) 30%,transparent); white-space:nowrap }
  .health-bmi.warn{ color:var(--warning) }
  /* 运动记录 */
  .health-ex-add{ display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end; margin-top:6px }
  .health-ex-add .select{ flex:1; min-width:96px; padding:10px 12px }
  .health-ex-add .input{ width:84px }
  .health-ex-list{ display:flex; flex-direction:column; gap:6px; margin-top:8px }
  .health-ex-item{ display:flex; align-items:center; gap:8px; padding:8px 10px; background:color-mix(in srgb,var(--bg-secondary) 60%,transparent); border-radius:var(--radius-sm); font-size:var(--font-size-small); color:var(--text-primary) }
  .health-ex-item .popo-icon-svg{ color:var(--accent); flex-shrink:0 }
  .health-ex-item-text{ flex:1; min-width:0 }
  .health-ex-item button{ width:26px; height:26px; border-radius:50%; border:none; background:transparent; color:var(--text-hint); display:flex; align-items:center; justify-content:center; cursor:pointer }
  .health-ex-item button:active{ transform:scale(var(--press-scale)) }
  /* 目标设置表单 */
  .health-goal-grid{ display:grid; grid-template-columns:1fr 1fr; gap:10px; margin:6px 0 10px }
  .health-goal-field{ display:flex; flex-direction:column; gap:4px }
  .health-goal-field .health-goal-label{ font-size:var(--font-size-small); color:var(--text-secondary) }
  .health-goal-field .input{ padding:8px 12px }
  .health-toggle-row{ display:flex; align-items:center; justify-content:space-between; padding:10px 0; border-top:1px solid color-mix(in srgb,var(--text-hint) 12%,transparent) }
  .health-toggle{ width:42px; height:24px; border-radius:999px; background:color-mix(in srgb,var(--text-hint) 40%,transparent); position:relative; cursor:pointer; transition:var(--motion); border:none; padding:0 }
  .health-toggle.on{ background:var(--accent) }
  .health-toggle::after{ content:""; position:absolute; top:3px; left:3px; width:18px; height:18px; border-radius:50%; background:var(--bg-card); transition:var(--motion) var(--motion-spring) }
  .health-toggle.on::after{ left:21px }
  /* 柱状图 */
  .health-chart-block{ margin-top:10px }
  .health-chart-title{ font-size:var(--font-size-small); color:var(--text-secondary); margin-bottom:6px; display:flex; align-items:center; gap:6px }
  .health-chart-title .popo-icon-svg{ color:var(--accent) }
  .health-chart-bars{ display:flex; align-items:flex-end; gap:6px; height:80px; padding:6px 0 0; border-bottom:1px solid color-mix(in srgb,var(--text-hint) 12%,transparent) }
  .health-bar-col{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; gap:4px }
  .health-bar{ width:60%; min-height:2px; border-radius:4px 4px 0 0; background:var(--accent); transition:height var(--motion) var(--motion-spring); position:relative }
  .health-bar.empty{ background:color-mix(in srgb,var(--text-hint) 22%,transparent) }
  .health-bar.today{ background:var(--accent-dark) }
  .health-bar-val{ position:absolute; top:-16px; left:50%; transform:translateX(-50%); font-size:10px; color:var(--text-secondary); white-space:nowrap }
  .health-bar-labels{ display:flex; gap:6px; margin-top:4px }
  .health-bar-label{ flex:1; text-align:center; font-size:10px; color:var(--text-hint) }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  goals = loadGoals();
  celebratedKeys = new Set();
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="health-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">健康打卡</div>
      <button class="app-header-gear" id="health-settings" aria-label="健康设置">${createIcon('settings', 18).outerHTML}</button>
    </div>
    <div class="app-body" id="health-body"></div>
  `;
  container.querySelector('#health-back').addEventListener('click', () => bus.emit('router:home'));
  // 齿轮跳到设置「数据与系统」分组
  container.querySelector('#health-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'system' } }));
  await render();
  startWaterReminder();
  applyAppBg(container, 'health');
}

export function unmount() {
  containerEl = null;
  if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
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
  body.appendChild(renderGoalsCard());
  body.appendChild(renderChartsCard());
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
  // 今日目标完成度（4 个进度环）
  const t = todayEntry || {};
  const rings = [
    { key: 'water', label: '喝水', icon: 'weather', cur: Number(t.water) || 0, goal: goals.water, unit: '杯' },
    { key: 'sleep', label: '睡眠', icon: 'moon', cur: Number(t.sleep) || 0, goal: goals.sleep, unit: 'h' },
    { key: 'steps', label: '步数', icon: 'heart', cur: Number(t.steps) || 0, goal: goals.steps, unit: '步' },
    { key: 'exercise', label: '运动', icon: 'play', cur: sumExerciseMin(t.exercises), goal: goals.exerciseMin, unit: '分' }
  ];
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
    <div class="health-ring-row">
      ${rings.map((r) => renderProgressRing(r)).join('')}
    </div>
    <div class="health-save-hint">${escapeHtml(hint)}</div>
  `;
  return card;
}

// 进度环 SVG：半径 18，周长约 113
function renderProgressRing(r) {
  const goal = Math.max(1, Number(r.goal) || 0);
  const cur = Math.max(0, Number(r.cur) || 0);
  const pct = clamp(cur / goal, 0, 1);
  const done = pct >= 1;
  const circ = 2 * Math.PI * 18;
  const offset = circ * (1 - pct);
  const pctText = Math.round(pct * 100) + '%';
  return `
    <div class="health-ring" data-key="${escapeHtml(r.key)}">
      <svg class="health-ring-svg" width="48" height="48" viewBox="0 0 48 48">
        <circle class="track" cx="24" cy="24" r="18" fill="none" stroke-width="4"></circle>
        <circle class="bar ${done ? 'done' : ''}" cx="24" cy="24" r="18" fill="none" stroke-width="4"
          stroke-linecap="round" stroke-dasharray="${circ.toFixed(2)}"
          stroke-dashoffset="${offset.toFixed(2)}"
          transform="rotate(-90 24 24)"></circle>
      </svg>
      <div class="health-ring-text">${formatRingValue(r, cur)}</div>
      <div class="health-ring-label">${escapeHtml(r.label)}</div>
      <div class="health-ring-pct">${done ? '达成啦' : pctText}</div>
    </div>
  `;
}

function formatRingValue(r, cur) {
  if (r.key === 'steps') return cur >= 1000 ? (cur / 1000).toFixed(1) + 'k' : String(cur);
  return String(cur);
}

// ════════════════════════════════════════
// 今日打卡卡片
// ════════════════════════════════════════

function renderTodayCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'health-today-card';

  const t = todayEntry || { date: todayStr(), water: 0, sleep: 0, steps: 0, weight: '', exercises: [], note: '' };
  const water = Number(t.water) || 0;
  const sleep = Number(t.sleep) || 0;
  const steps = Number(t.steps) || 0;
  const weight = t.weight != null ? t.weight : '';
  const exercises = Array.isArray(t.exercises) ? t.exercises : [];
  const note = t.note || '';
  const bmiInfo = computeBMI(weight, goals.height);

  card.innerHTML = `
    <div class="card-title">今日打卡 · ${escapeHtml(formatDate(new Date(), { withWeek: true }))}</div>
    <div class="card-row">
      <span class="card-row-label">今天喝够水了吗（杯）</span>
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
    <div class="card-row">
      <span class="card-row-label">体重（kg）</span>
      <div class="health-weight-row" style="flex:1;justify-content:flex-end">
        <input type="number" class="input health-num-input" id="health-weight" min="0" max="300" step="0.1" value="${escapeHtml(weight == null ? '' : weight)}" placeholder="今天称了嘛" style="width:110px">
        ${bmiInfo ? `<div class="health-bmi ${bmiInfo.warn ? 'warn' : ''}">BMI ${bmiInfo.value} · ${bmiInfo.label}</div>` : ''}
      </div>
    </div>
    <div style="margin-top:12px">
      <div class="card-row-label" style="margin-bottom:6px">运动一下嘛</div>
      <div class="health-ex-add">
        <select class="select" id="health-ex-type" aria-label="运动类型">
          ${EXERCISE_TYPES.map((x) => `<option value="${escapeAttr(x.key)}">${escapeHtml(x.label)}</option>`).join('')}
        </select>
        <select class="select" id="health-ex-intensity" aria-label="强度">
          ${INTENSITY_LEVELS.map((x) => `<option value="${escapeAttr(x.key)}">${escapeHtml(x.label)}</option>`).join('')}
        </select>
        <input type="number" class="input health-num-input" id="health-ex-dur" min="1" max="600" step="1" value="30" placeholder="分钟" style="width:80px">
        <button class="btn primary" id="health-ex-add-btn" aria-label="添加运动">${createIcon('plus', 16).outerHTML}</button>
      </div>
      <div class="health-ex-list" id="health-ex-list">
        ${renderExercisesHTML(exercises)}
      </div>
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
    onCounterChange();
  });
  if (plusBtn) plusBtn.addEventListener('click', () => {
    const cur = Number(waterEl.textContent) || 0;
    waterEl.textContent = String(clamp(cur + 1, 0, 12));
    onCounterChange();
  });

  // 输入框自动保存
  const sleepInput = card.querySelector('#health-sleep');
  const stepsInput = card.querySelector('#health-steps');
  const weightInput = card.querySelector('#health-weight');
  const noteInput = card.querySelector('#health-note');
  if (sleepInput) sleepInput.addEventListener('input', debouncedSave);
  if (stepsInput) stepsInput.addEventListener('input', debouncedSave);
  if (noteInput) noteInput.addEventListener('input', debouncedSave);
  // 体重变化：立刻更新 BMI 提示 + 自动保存
  if (weightInput) weightInput.addEventListener('input', () => {
    updateBMIDisplay(weightInput.value, goals.height);
    debouncedSave();
  });

  // 添加运动
  const exAddBtn = card.querySelector('#health-ex-add-btn');
  if (exAddBtn) exAddBtn.addEventListener('click', () => addExerciseFromForm());

  // 运动删除按钮
  bindExerciseRemove(card);

  // 手动保存
  const saveBtn = card.querySelector('#health-save');
  if (saveBtn) saveBtn.addEventListener('click', () => saveEntry(true));

  return card;
}

// 计数器变化时：立即保存 + 检查目标庆祝
function onCounterChange() {
  debouncedSave();
}

// BMI 计算：weight(kg) + height(cm) -> {value, label, warn} 或 null
function computeBMI(weight, heightCm) {
  const w = Number(weight);
  const h = Number(heightCm);
  if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(h) || h <= 0) return null;
  const m = h / 100;
  const bmi = w / (m * m);
  let label = '正常', warn = false;
  if (bmi < 18.5) { label = '偏瘦'; warn = true; }
  else if (bmi < 24) { label = '正常'; }
  else if (bmi < 28) { label = '偏胖'; warn = true; }
  else { label = '肥胖'; warn = true; }
  return { value: bmi.toFixed(1), label, warn };
}

// 实时刷新 BMI 显示（不重渲染整张卡片）
function updateBMIDisplay(weight, heightCm) {
  if (!containerEl) return;
  const row = containerEl.querySelector('#health-today-card .health-weight-row');
  if (!row) return;
  const info = computeBMI(weight, heightCm);
  let bmiEl = row.querySelector('.health-bmi');
  if (!info) {
    if (bmiEl) bmiEl.remove();
    return;
  }
  if (!bmiEl) {
    bmiEl = document.createElement('div');
    bmiEl.className = 'health-bmi';
    row.appendChild(bmiEl);
  }
  bmiEl.className = 'health-bmi ' + (info.warn ? 'warn' : '');
  bmiEl.textContent = `BMI ${info.value} · ${info.label}`;
}

// 运动列表 HTML
function renderExercisesHTML(exercises) {
  if (!exercises || !exercises.length) {
    return `<div class="health-save-hint" style="text-align:left;margin:6px 0">还没记录运动，动一下嘛</div>`;
  }
  return exercises.map((ex, i) => {
    const type = EXERCISE_TYPES.find((x) => x.key === ex.type) || { label: ex.type || '运动' };
    const inten = INTENSITY_LEVELS.find((x) => x.key === ex.intensity) || { label: '' };
    return `
      <div class="health-ex-item" data-index="${i}">
        ${createIcon('play', 14).outerHTML}
        <div class="health-ex-item-text">${escapeHtml(type.label)} · ${Number(ex.duration) || 0} 分钟${inten.label ? ' · ' + escapeHtml(inten.label) : ''}</div>
        <button data-act="ex-remove" data-index="${i}" aria-label="删除运动">${createIcon('trash', 14).outerHTML}</button>
      </div>
    `;
  }).join('');
}

// 从表单添加一条运动记录
function addExerciseFromForm() {
  if (!containerEl) return;
  const typeSel = containerEl.querySelector('#health-ex-type');
  const intSel = containerEl.querySelector('#health-ex-intensity');
  const durInput = containerEl.querySelector('#health-ex-dur');
  if (!typeSel || !intSel || !durInput) return;
  const dur = clamp(Math.floor(Number(durInput.value) || 0), 1, 600);
  if (dur <= 0) { showToast('填一下时长嘛', 'default', 1200); return; }
  const ex = { type: typeSel.value, duration: dur, intensity: intSel.value, ts: Date.now() };
  // 先把当前内存里的 entry 同步上 exercises
  const entry = todayEntry || { date: todayStr(), water: 0, sleep: 0, steps: 0, weight: '', exercises: [], note: '' };
  if (!Array.isArray(entry.exercises)) entry.exercises = [];
  entry.exercises.push(ex);
  todayEntry = entry;
  // 持久化 + 刷新运动列表 + 进度环
  saveEntry(false, true).then(() => {
    const listEl = containerEl.querySelector('#health-ex-list');
    if (listEl && todayEntry) listEl.innerHTML = renderExercisesHTML(todayEntry.exercises || []);
    bindExerciseRemove(containerEl.querySelector('#health-today-card'));
  });
}

// 绑定运动删除按钮
function bindExerciseRemove(scope) {
  if (!scope) return;
  scope.querySelectorAll('[data-act=ex-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!todayEntry || !Array.isArray(todayEntry.exercises)) return;
      const idx = Number(btn.dataset.index);
      if (Number.isInteger(idx) && idx >= 0 && idx < todayEntry.exercises.length) {
        todayEntry.exercises.splice(idx, 1);
        saveEntry(false, true).then(() => {
          const listEl = scope.querySelector('#health-ex-list');
          if (listEl && todayEntry) listEl.innerHTML = renderExercisesHTML(todayEntry.exercises || []);
          bindExerciseRemove(scope);
        });
      }
    });
  });
}

// 合计今日运动分钟数
function sumExerciseMin(exercises) {
  if (!Array.isArray(exercises)) return 0;
  return exercises.reduce((sum, ex) => sum + (Number(ex && ex.duration) || 0), 0);
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
    const exMin = sumExerciseMin(e.exercises);
    const w = e.weight != null && e.weight !== '' ? Number(e.weight) : null;
    row.innerHTML = `
      <div class="health-week-date">
        <div class="health-week-date-main">${escapeHtml(dateLabel)}</div>
        ${isToday ? '<div class="health-week-today-badge">今天</div>' : ''}
      </div>
      <div class="health-week-data">
        <span title="喝水">${createIcon('weather', 14).outerHTML} ${Number(e.water) || 0} 杯</span>
        <span title="睡眠">${createIcon('moon', 14).outerHTML} ${Number(e.sleep) || 0} 小时</span>
        <span title="步数">${createIcon('heart', 14).outerHTML} ${Number(e.steps) || 0} 步</span>
        ${exMin > 0 ? `<span title="运动">${createIcon('play', 14).outerHTML} ${exMin} 分钟</span>` : ''}
        ${w && Number.isFinite(w) ? `<span title="体重">${createIcon('memo', 14).outerHTML} ${w} kg</span>` : ''}
      </div>
      ${e.note ? `<div class="health-week-note">${escapeHtml(e.note)}</div>` : ''}
    `;
    list.appendChild(row);
  });

  card.appendChild(list);
  return card;
}

// ════════════════════════════════════════
// 目标设置卡片
// ════════════════════════════════════════

function renderGoalsCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'health-goals-card';
  const g = goals;
  card.innerHTML = `
    <div class="card-title">${createIcon('check', 18).outerHTML} 目标设定</div>
    <div class="health-goal-grid">
      <div class="health-goal-field">
        <span class="health-goal-label">喝水目标（杯）</span>
        <input type="number" class="input health-num-input" id="health-goal-water" min="1" max="30" step="1" value="${Number(g.water) || 0}">
      </div>
      <div class="health-goal-field">
        <span class="health-goal-label">睡眠目标（小时）</span>
        <input type="number" class="input health-num-input" id="health-goal-sleep" min="0" max="14" step="0.5" value="${Number(g.sleep) || 0}">
      </div>
      <div class="health-goal-field">
        <span class="health-goal-label">步数目标</span>
        <input type="number" class="input health-num-input" id="health-goal-steps" min="0" step="500" value="${Number(g.steps) || 0}">
      </div>
      <div class="health-goal-field">
        <span class="health-goal-label">运动目标（分钟）</span>
        <input type="number" class="input health-num-input" id="health-goal-exercise" min="0" step="5" value="${Number(g.exerciseMin) || 0}">
      </div>
      <div class="health-goal-field" style="grid-column:1 / -1">
        <span class="health-goal-label">身高（cm，用于算 BMI）</span>
        <input type="number" class="input health-num-input" id="health-goal-height" min="50" max="250" step="0.5" value="${Number(g.height) || 0}" placeholder="填一下身高嘛">
      </div>
    </div>
    <div class="health-toggle-row">
      <div>
        <div class="card-row-label">喝水提醒</div>
        <div class="health-save-hint" style="text-align:left;margin:0">每 ${Number(g.reminder && g.reminder.intervalMin) || 120} 分钟提醒一次</div>
      </div>
      <button class="health-toggle ${g.reminder && g.reminder.enabled ? 'on' : ''}" id="health-reminder-toggle" aria-label="开关喝水提醒" role="switch" aria-checked="${g.reminder && g.reminder.enabled ? 'true' : 'false'}"></button>
    </div>
    <input type="number" class="input health-num-input" id="health-reminder-interval" min="30" max="480" step="15" value="${Number(g.reminder && g.reminder.intervalMin) || 120}" style="width:120px;margin-top:8px" aria-label="提醒间隔分钟">
    <button class="btn primary block" id="health-goal-save" style="margin-top:12px">${createIcon('check', 18).outerHTML} 保存目标</button>
    <div class="health-save-hint">目标定好啦，每天努力一点点</div>
  `;

  const saveBtn = card.querySelector('#health-goal-save');
  if (saveBtn) saveBtn.addEventListener('click', () => saveGoalsFromForm());

  const toggle = card.querySelector('#health-reminder-toggle');
  if (toggle) toggle.addEventListener('click', () => {
    const on = !toggle.classList.contains('on');
    toggle.classList.toggle('on', on);
    toggle.setAttribute('aria-checked', on ? 'true' : 'false');
    // 即时生效，不等点保存
    goals.reminder = { enabled: on, intervalMin: Number(goals.reminder && goals.reminder.intervalMin) || 120 };
    persistGoals();
    startWaterReminder();
    showToast(on ? '喝水提醒开好啦' : '喝水提醒关掉啦', 'default', 1200);
  });

  const intInput = card.querySelector('#health-reminder-interval');
  if (intInput) intInput.addEventListener('change', () => {
    const v = clamp(Math.floor(Number(intInput.value) || 120), 30, 480);
    intInput.value = String(v);
    goals.reminder = { enabled: !!(goals.reminder && goals.reminder.enabled), intervalMin: v };
    persistGoals();
    startWaterReminder();
    const hint = card.querySelector('.health-toggle-row .health-save-hint');
    if (hint) hint.textContent = `每 ${v} 分钟提醒一次`;
  });

  return card;
}

// 从表单保存目标
function saveGoalsFromForm() {
  if (!containerEl) return;
  const get = (id) => {
    const el = containerEl.querySelector('#' + id);
    return el ? el.value : '';
  };
  const next = {
    water: clamp(Math.floor(Number(get('health-goal-water')) || 0), 1, 30),
    sleep: clamp(Number(get('health-goal-sleep')) || 0, 0, 14),
    steps: Math.max(0, Math.floor(Number(get('health-goal-steps')) || 0)),
    exerciseMin: Math.max(0, Math.floor(Number(get('health-goal-exercise')) || 0)),
    height: clamp(Number(get('health-goal-height')) || 0, 0, 250),
    reminder: {
      enabled: !!(goals.reminder && goals.reminder.enabled),
      intervalMin: clamp(Number(goals.reminder && goals.reminder.intervalMin) || 120, 30, 480)
    }
  };
  goals = next;
  persistGoals();
  // 体重 BMI 即时刷新
  const wInput = containerEl.querySelector('#health-weight');
  if (wInput) updateBMIDisplay(wInput.value, goals.height);
  showToast('目标存好啦，加油哦', 'success', 1400);
  // 刷新进度环
  const body = containerEl.querySelector('#health-body');
  if (body) {
    const oldStats = body.querySelector('#health-stats-card');
    if (oldStats) oldStats.replaceWith(renderStatsCard());
    const oldCharts = body.querySelector('#health-charts-card');
    if (oldCharts) oldCharts.replaceWith(renderChartsCard());
  }
}

// 读取 / 持久化目标（localStorage）
function loadGoals() {
  try {
    const raw = getData(KEYS.healthState, null);
    if (raw && typeof raw === 'object') {
      const base = defaultGoals();
      const merged = Object.assign({}, base, raw);
      merged.reminder = Object.assign({}, base.reminder, raw.reminder || {});
      return merged;
    }
  } catch (e) {
    console.warn('[health] 读取目标失败', e);
  }
  return defaultGoals();
}
function persistGoals() {
  try { setData(KEYS.healthState, goals); } catch (e) { console.warn('[health] 写入目标失败', e); }
}

// 喝水提醒：用 setTimeout 简易轮询，挂载期间每 intervalMin 提醒一次
function startWaterReminder() {
  if (reminderTimer) { clearTimeout(reminderTimer); reminderTimer = null; }
  if (!goals.reminder || !goals.reminder.enabled) return;
  const intervalMs = Math.max(30, goals.reminder.intervalMin || 120) * 60 * 1000;
  const tick = () => {
    if (!containerEl) return; // 已卸载
    const hour = new Date().getHours();
    // 夜里 23 点到早上 7 点不吵
    if (hour >= 7 && hour < 23) {
      showToast('今天喝够水了吗，来一杯嘛', 'default', 2400);
    }
    reminderTimer = setTimeout(tick, intervalMs);
  };
  reminderTimer = setTimeout(tick, intervalMs);
}

// ════════════════════════════════════════
// 本周趋势柱状图卡片
// ════════════════════════════════════════

function renderChartsCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.id = 'health-charts-card';
  card.innerHTML = `
    <div class="card-title">${createIcon('calendar', 18).outerHTML} 本周趋势</div>
    ${renderBarChart('喝水（杯）', 'water', (v) => v, 'weather')}
    ${renderBarChart('睡眠（小时）', 'sleep', (v) => v, 'moon')}
    ${renderBarChart('步数', 'steps', (v) => v, 'heart')}
    ${renderBarChart('运动（分钟）', 'exercises', (v) => sumExerciseMin(v), 'play')}
  `;
  return card;
}

// 单维度柱状图：本周 7 天（周一到周日）
function renderBarChart(title, field, getter, icon) {
  const days = weekDays(); // [{date, label, isToday}]
  const values = days.map((d) => {
    const e = weekEntries.find((x) => x.date === d.date);
    const raw = e ? e[field] : 0;
    const v = Number(getter(raw)) || 0;
    return { date: d.date, label: d.label, isToday: d.isToday, value: v };
  });
  const max = Math.max(1, ...values.map((v) => v.value));
  const goal = field === 'water' ? goals.water
    : field === 'sleep' ? goals.sleep
    : field === 'steps' ? goals.steps
    : goals.exerciseMin;
  return `
    <div class="health-chart-block">
      <div class="health-chart-title">${createIcon(icon, 14).outerHTML} ${escapeHtml(title)}${goal > 0 ? ` · 目标 ${goal}` : ''}</div>
      <div class="health-chart-bars">
        ${values.map((v) => {
          const pct = v.value <= 0 ? 0 : Math.max(6, (v.value / max) * 100);
          const cls = v.value <= 0 ? 'empty' : (v.isToday ? 'today' : '');
          return `
            <div class="health-bar-col" title="${escapeHtml(v.label)}: ${v.value}">
              <div class="health-bar ${cls}" style="height:${pct}%">
                ${v.value > 0 ? `<span class="health-bar-val">${formatBarVal(v.value, field)}</span>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="health-bar-labels">
        ${values.map((v) => `<div class="health-bar-label">${escapeHtml(v.label)}</div>`).join('')}
      </div>
    </div>
  `;
}

function formatBarVal(v, field) {
  if (field === 'steps' && v >= 1000) return (v / 1000).toFixed(1) + 'k';
  return String(v);
}

// 本周 7 天（周一到周日），带短标签
function weekDays() {
  const start = startOfWeek();
  const labels = ['一', '二', '三', '四', '五', '六', '日'];
  const today = todayStr();
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    out.push({
      date: `${y}-${m}-${day}`,
      label: labels[i],
      isToday: `${y}-${m}-${day}` === today
    });
  }
  return out;
}

// ════════════════════════════════════════
// 保存（自动 / 手动）
// ════════════════════════════════════════

async function saveEntry(showFeedback, skipCardRefresh) {
  if (!containerEl) return;
  // 取消任何待执行的自动保存，避免重复写
  debouncedSave.cancel();

  const body = containerEl.querySelector('#health-body');
  if (!body) return;

  const waterEl = body.querySelector('#health-water-val');
  const sleepEl = body.querySelector('#health-sleep');
  const stepsEl = body.querySelector('#health-steps');
  const weightEl = body.querySelector('#health-weight');
  const noteEl = body.querySelector('#health-note');

  const waterRaw = Number((waterEl && waterEl.textContent) || 0);
  const water = clamp(isNaN(waterRaw) ? 0 : waterRaw, 0, 12);

  const sleepRaw = Number((sleepEl && sleepEl.value) || 0);
  const sleep = clamp(isNaN(sleepRaw) ? 0 : sleepRaw, 0, 12);

  const stepsRaw = Number((stepsEl && stepsEl.value) || 0);
  const steps = isNaN(stepsRaw) ? 0 : Math.max(0, Math.floor(stepsRaw));

  // 体重：允许空字符串（没填）；填了就转 number
  const weightRaw = (weightEl && weightEl.value) || '';
  let weight = '';
  if (weightRaw !== '') {
    const w = Number(weightRaw);
    weight = isNaN(w) ? '' : clamp(w, 0, 300);
  }

  const note = String((noteEl && noteEl.value) || '').trim();

  const date = todayStr();
  // 保留当前内存里的 exercises（运动记录不走表单输入）
  const exercises = Array.isArray(todayEntry && todayEntry.exercises)
    ? todayEntry.exercises.slice()
    : [];
  const entry = { id: date, date, water, sleep, steps, weight, exercises, note };

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

    // 目标达成庆祝（仅第一次达成时 toast）
    checkGoalCelebration(entry);

    // skipCardRefresh：添加/删除运动时不刷整张今日卡片，避免运动列表抖动
    // 但统计环 + 本周列表 + 图表需要刷新
    const oldStats = body.querySelector('#health-stats-card');
    const oldWeek = body.querySelector('#health-week-card');
    const oldCharts = body.querySelector('#health-charts-card');
    if (oldStats) oldStats.replaceWith(renderStatsCard());
    if (oldWeek) oldWeek.replaceWith(renderWeekCard());
    if (oldCharts) oldCharts.replaceWith(renderChartsCard());
    if (skipCardRefresh) return;
  } catch (e) {
    console.warn('[health] 保存失败', e);
    showToast('保存失败啦，再试一次嘛', 'error', 2000);
  }
}

// 目标达成庆祝：4 个维度刚跨过目标时弹 toast
function checkGoalCelebration(entry) {
  if (!entry) return;
  const checks = [
    { key: 'water', cur: Number(entry.water) || 0, goal: goals.water, label: '喝水目标达成啦' },
    { key: 'sleep', cur: Number(entry.sleep) || 0, goal: goals.sleep, label: '睡眠目标达成啦' },
    { key: 'steps', cur: Number(entry.steps) || 0, goal: goals.steps, label: '步数目标达成啦' },
    { key: 'exercise', cur: sumExerciseMin(entry.exercises), goal: goals.exerciseMin, label: '运动目标达成啦' }
  ];
  const todayKey = todayStr();
  checks.forEach((c) => {
    if (c.goal > 0 && c.cur >= c.goal) {
      const k = todayKey + ':' + c.key;
      if (!celebratedKeys.has(k)) {
        celebratedKeys.add(k);
        showToast(c.label + '，太棒啦', 'success', 1800);
      }
    }
  });
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
function escapeAttr(s) { return escapeHtml(s); }
