// apps/pomodoro/index.js
// 番茄钟 App——软萌少女风专注小助手。
// 我陪主人专注一会儿嘛，累了就歇歇，加油呀～
// 功能：
//   1) 大圆环倒计时（SVG circle），工作 / 休息两种模式上色不同
//   2) 开始 / 暂停（切换）、重置、跳过三个控制
//   3) 25 / 5 与 50 / 10 两个预设，一键切换并持久化
//   4) 顶部统计卡片：今日完成 X 个番茄 + 连续 Y 天
//   5) 工作结束 -> toast + 自动切休息 + completedCount+1；休息结束 -> toast + 自动切工作
//   6) unmount 一定清掉定时器，不偷偷占内存
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { KEYS } from '../../core/storage-keys.js';
import { getData, setData } from '../../core/storage.js';
import { showToast, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, formatDate, clamp } from '../../core/util.js';
import { openApp } from '../../core/router.js';
import { applyAppBg } from '../../core/app-bg.js';

let containerEl = null;
let timer = null;

// 番茄钟运行状态（模块级，跨 mount/unmount 保留）
//   mode: 'work' | 'break'
//   remaining: 剩余秒数
//   running: 是否正在倒计时
//   workMinutes / breakMinutes: 当前预设时长
let state = {
  mode: 'work',
  remaining: 25 * 60,
  running: false,
  workMinutes: 25,
  breakMinutes: 5
};

// 圆环参数
const RING_R = 118;
const RING_C = 2 * Math.PI * RING_R;

const PRESETS = [
  { work: 25, brk: 5 },
  { work: 50, brk: 10 }
];

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container) {
  containerEl = container;
  loadState();
  injectStyle('app-pomodoro-style', `
    .pomo-stats { display: flex; gap: 10px; }
    .pomo-stat { flex: 1; text-align: center; }
    .pomo-stat-num { font-size: var(--font-size-huge); font-weight: 700; color: var(--accent-dark); line-height: 1.1; font-variant-numeric: tabular-nums; }
    .pomo-stat-label { font-size: var(--font-size-small); color: var(--text-secondary); margin-top: 4px; }
    .pomo-timer-card { display: flex; flex-direction: column; align-items: center; }
    .pomo-ring-wrap { position: relative; width: 260px; height: 260px; margin: 6px 0 4px; }
    .pomo-ring { width: 260px; height: 260px; display: block; }
    .pomo-ring-bg { fill: none; stroke: color-mix(in srgb, var(--text-hint) 22%, transparent); stroke-width: 10; }
    .pomo-ring-fg { fill: none; stroke: var(--accent); stroke-width: 10; stroke-linecap: round; stroke-dasharray: ${RING_C}; stroke-dashoffset: 0; transition: stroke-dashoffset 0.95s linear, stroke var(--motion); transform: rotate(-90deg); transform-origin: center; transform-box: fill-box; }
    .pomo-ring-fg.break { stroke: var(--accent-dark); }
    .pomo-ring-fg.no-anim { transition: stroke var(--motion); }
    .pomo-center { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; }
    .pomo-mode { font-size: var(--font-size-small); color: var(--text-secondary); letter-spacing: 2px; }
    .pomo-time { font-size: 48px; font-weight: 700; color: var(--text-primary); line-height: 1.1; margin-top: 2px; font-variant-numeric: tabular-nums; }
    .pomo-controls { display: flex; gap: 14px; margin-top: 18px; align-items: center; }
    .pomo-ctrl { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--bg-secondary) 80%, transparent); color: var(--text-primary); transition: var(--motion); border: none; cursor: pointer; }
    .pomo-ctrl:active { transform: scale(var(--press-scale)); }
    .pomo-ctrl svg { width: 22px; height: 22px; }
    .pomo-ctrl.primary { width: 72px; height: 72px; background: var(--accent); color: var(--bubble-user-text); box-shadow: var(--shadow-glow); }
    .pomo-ctrl.primary svg { width: 28px; height: 28px; }
    .pomo-presets { display: flex; gap: 10px; justify-content: center; margin-top: 16px; }
    .pomo-preset { padding: 8px 18px; border-radius: 999px; background: color-mix(in srgb, var(--bg-secondary) 60%, transparent); color: var(--text-secondary); font-size: var(--font-size-small); border: none; transition: var(--motion); cursor: pointer; }
    .pomo-preset.active { background: var(--accent-light); color: var(--accent-dark); font-weight: 600; }
    .pomo-preset:active { transform: scale(var(--press-scale)); }
    .pomo-hint { font-size: var(--font-size-small); color: var(--text-hint); text-align: center; margin-top: 14px; line-height: 1.5; }
  `);

  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="pomo-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">番茄钟</div>
      <button class="app-header-gear" id="pomo-settings" aria-label="番茄钟设置">${createIcon('settings', 18).outerHTML}</button>
    </div>
    <div class="app-body" id="pomo-body"></div>
  `;
  container.querySelector('#pomo-back').addEventListener('click', () => bus.emit('router:home'));
  // 齿轮跳到设置「数据与系统」分组
  container.querySelector('#pomo-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'system' } }));
  render();
  applyAppBg(container, 'pomodoro');
}

export function unmount() {
  // 重要：离开页面一定清掉定时器，避免内存泄漏
  if (timer) { clearInterval(timer); timer = null; }
  state.running = false; // 离开就停住，回来再按开始嘛
  // 离开前把剩余时间和模式存起来，回来能接着上次的进度
  saveRuntimeState();
  containerEl = null;
}

// ════════════════════════════════════════
// 状态持久化
// ════════════════════════════════════════

function todayStr() {
  return formatDate(new Date(), { full: true }); // YYYY-MM-DD
}

// 读取上次预设 + 未跑完的剩余时间，恢复初始状态
// 重新挂载时不会自动跑（running=false），主人按开始才继续
function loadState() {
  const raw = getData(KEYS.pomodoroState, null);
  if (raw && typeof raw === 'object') {
    if (typeof raw.workMinutes === 'number' && raw.workMinutes > 0) state.workMinutes = raw.workMinutes;
    if (typeof raw.breakMinutes === 'number' && raw.breakMinutes > 0) state.breakMinutes = raw.breakMinutes;
    // 恢复上次的模式（work / break），默认 work
    if (raw.mode === 'work' || raw.mode === 'break') {
      state.mode = raw.mode;
    } else {
      state.mode = 'work';
    }
    // 恢复上次未跑完的剩余时间；不合法就回到当前模式满时长
    const fullSec = (state.mode === 'work' ? state.workMinutes : state.breakMinutes) * 60;
    if (typeof raw.remaining === 'number' && raw.remaining > 0 && raw.remaining <= fullSec) {
      state.remaining = Math.floor(raw.remaining);
    } else {
      state.remaining = fullSec;
    }
  } else {
    state.mode = 'work';
    state.remaining = state.workMinutes * 60;
  }
  state.running = false;
}

// 把当前运行状态（模式 + 剩余时间 + 预设）合并进 pomodoroState
// unmount / 切模式 / 重置 / 切预设时调用，保证回来能接着上次的进度
function saveRuntimeState() {
  try {
    const cur = getData(KEYS.pomodoroState, null);
    setData(KEYS.pomodoroState, {
      ...(cur && typeof cur === 'object' ? cur : {}),
      mode: state.mode,
      remaining: state.remaining,
      workMinutes: state.workMinutes,
      breakMinutes: state.breakMinutes,
      savedAt: Date.now()
    });
  } catch (e) {
    console.warn('[pomodoro] 保存运行状态失败', e);
  }
}

// 取今日统计（处理跨天重置）
function getTodayStats() {
  const today = todayStr();
  const raw = getData(KEYS.pomodoroState, null);
  if (raw && raw.date === today) {
    return {
      date: today,
      completedCount: raw.completedCount || 0,
      workMinutes: state.workMinutes,
      breakMinutes: state.breakMinutes,
      streak: raw.streak || 0
    };
  }
  // 跨天：今日还没完成过，连续天数看上次距离
  let streak = 0;
  if (raw && raw.date) {
    const diff = dayDiff(raw.date, today);
    if (diff === 1) streak = raw.streak || 0; // 昨天刚做过，连续天数还留着待激活
    else if (diff <= 0) streak = raw.streak || 0;
    else streak = 0; // 断啦，归零
  }
  return {
    date: today,
    completedCount: 0,
    workMinutes: state.workMinutes,
    breakMinutes: state.breakMinutes,
    streak
  };
}

function saveStats(stats) {
  setData(KEYS.pomodoroState, stats);
}

// 完成 1 个番茄：累加今日完成数 + 推进连续天数
function recordCompletion() {
  const today = todayStr();
  const raw = getData(KEYS.pomodoroState, null);
  let completedCount;
  let streak;
  if (raw && raw.date) {
    const diff = dayDiff(raw.date, today);
    if (diff === 0) {
      // 今天已经做过，累加，连续天数不变
      completedCount = (raw.completedCount || 0) + 1;
      streak = raw.streak || 1;
    } else if (diff === 1) {
      // 昨天做过，今天第一次做，连续 +1
      completedCount = 1;
      streak = (raw.streak || 0) + 1;
    } else {
      // 断了，从 1 重新开始
      completedCount = 1;
      streak = 1;
    }
  } else {
    completedCount = 1;
    streak = 1;
  }
  saveStats({
    date: today,
    completedCount,
    workMinutes: state.workMinutes,
    breakMinutes: state.breakMinutes,
    streak
  });
}

function dayDiff(a, b) {
  // a, b 都是 YYYY-MM-DD，返回 b - a 的天数
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.round((db.getTime() - da.getTime()) / 86400_000);
}

// ════════════════════════════════════════
// 渲染
// ════════════════════════════════════════

function render() {
  const body = containerEl.querySelector('#pomo-body');
  const stats = getTodayStats();
  const modeLabel = state.mode === 'work' ? '专注中' : '休息中';
  const playPauseIcon = state.running ? 'pause' : 'play';
  body.innerHTML = `
    <div class="card">
      <div class="pomo-stats">
        <div class="pomo-stat">
          <div class="pomo-stat-num" id="pomo-today-count">${stats.completedCount}</div>
          <div class="pomo-stat-label">今日番茄</div>
        </div>
        <div class="pomo-stat">
          <div class="pomo-stat-num" id="pomo-streak">${stats.streak}</div>
          <div class="pomo-stat-label">连续天数</div>
        </div>
      </div>
    </div>
    <div class="card pomo-timer-card">
      <div class="pomo-ring-wrap">
        <svg class="pomo-ring" viewBox="0 0 260 260" aria-hidden="true">
          <circle class="pomo-ring-bg" cx="130" cy="130" r="${RING_R}"></circle>
          <circle class="pomo-ring-fg ${state.mode === 'break' ? 'break' : ''}" id="pomo-ring-fg" cx="130" cy="130" r="${RING_R}"></circle>
        </svg>
        <div class="pomo-center">
          <div class="pomo-mode" id="pomo-mode">${modeLabel}</div>
          <div class="pomo-time" id="pomo-time">${fmtTime(state.remaining)}</div>
        </div>
      </div>
      <div class="pomo-controls">
        <button class="pomo-ctrl" id="pomo-reset" aria-label="重置">${createIcon('back', 22).outerHTML}</button>
        <button class="pomo-ctrl primary" id="pomo-toggle" aria-label="${state.running ? '暂停' : '开始'}">${createIcon(playPauseIcon, 28).outerHTML}</button>
        <button class="pomo-ctrl" id="pomo-skip" aria-label="跳过">${createIcon('next', 22).outerHTML}</button>
      </div>
      <div class="pomo-presets" id="pomo-presets">
        ${PRESETS.map((p) => {
          const active = (p.work === state.workMinutes && p.brk === state.breakMinutes);
          return `<button class="pomo-preset ${active ? 'active' : ''}" data-w="${p.work}" data-b="${p.brk}">${p.work} / ${p.brk}</button>`;
        }).join('')}
      </div>
      <div class="pomo-hint" id="pomo-hint">${state.mode === 'work' ? '专注一会儿嘛，加油呀～' : '歇口气，喝口水嘛～'}</div>
    </div>
  `;
  body.querySelector('#pomo-toggle').addEventListener('click', toggleRun);
  body.querySelector('#pomo-reset').addEventListener('click', resetSession);
  body.querySelector('#pomo-skip').addEventListener('click', skipSession);
  body.querySelectorAll('.pomo-preset').forEach((btn) => {
    btn.addEventListener('click', () => applyPreset(Number(btn.dataset.w), Number(btn.dataset.b)));
  });
  // 初始圆环（无动画）
  updateRing(false);
}

// 更新圆环进度，animate=false 时直接跳到目标值
function updateRing(animate) {
  const fg = containerEl.querySelector('#pomo-ring-fg');
  if (!fg) return;
  const total = (state.mode === 'work' ? state.workMinutes : state.breakMinutes) * 60;
  const ratio = total > 0 ? clamp(state.remaining / total, 0, 1) : 0;
  const offset = String(RING_C * (1 - ratio));
  if (!animate) {
    fg.classList.add('no-anim');
    fg.style.strokeDashoffset = offset;
    void fg.getBoundingClientRect(); // 强制重排，让无动画值生效
    fg.classList.remove('no-anim');
  } else {
    fg.style.strokeDashoffset = offset;
  }
}

function updateDisplay() {
  const timeEl = containerEl.querySelector('#pomo-time');
  if (timeEl) timeEl.textContent = fmtTime(state.remaining);
  updateRing(true);
}

function updateStatsDisplay() {
  const stats = getTodayStats();
  const c = containerEl.querySelector('#pomo-today-count');
  const s = containerEl.querySelector('#pomo-streak');
  if (c) c.textContent = String(stats.completedCount);
  if (s) s.textContent = String(stats.streak);
}

function updateModeUI() {
  const modeEl = containerEl.querySelector('#pomo-mode');
  if (modeEl) modeEl.textContent = state.mode === 'work' ? '专注中' : '休息中';
  const fg = containerEl.querySelector('#pomo-ring-fg');
  if (fg) fg.classList.toggle('break', state.mode === 'break');
  const hint = containerEl.querySelector('#pomo-hint');
  if (hint) hint.textContent = state.mode === 'work' ? '专注一会儿嘛，加油呀～' : '歇口气，喝口水嘛～';
}

function updateToggleIcon() {
  const btn = containerEl.querySelector('#pomo-toggle');
  if (!btn) return;
  btn.setAttribute('aria-label', state.running ? '暂停' : '开始');
  btn.innerHTML = createIcon(state.running ? 'pause' : 'play', 28).outerHTML;
}

// ════════════════════════════════════════
// 控制
// ════════════════════════════════════════

function toggleRun() {
  state.running = !state.running;
  updateToggleIcon();
  if (state.running) startTicking();
  else stopTicking();
}

function startTicking() {
  if (timer) clearInterval(timer);
  timer = setInterval(tick, 1000);
}

function stopTicking() {
  if (timer) { clearInterval(timer); timer = null; }
}

function tick() {
  if (!state.running) return;
  state.remaining -= 1;
  if (state.remaining <= 0) {
    state.remaining = 0;
    updateDisplay();
    onComplete();
    return;
  }
  updateDisplay();
}

function onComplete() {
  if (state.mode === 'work') {
    showToast('专注完成，休息一下嘛', 'success');
    recordCompletion();
    updateStatsDisplay();
    switchMode('break', true); // 自动切休息并开始倒计时
  } else {
    showToast('回来继续嘛', 'default');
    switchMode('work', false); // 自动切工作，等主人按开始
  }
}

// 切换模式：重置剩余时间为新模式满时长，autoStart 决定是否自动开始
function switchMode(mode, autoStart) {
  state.mode = mode;
  state.remaining = (mode === 'work' ? state.workMinutes : state.breakMinutes) * 60;
  state.running = !!autoStart;
  updateModeUI();
  updateRing(false); // 切模式时圆环直接刷新，不动画
  updateDisplay();
  updateToggleIcon();
  if (state.running) startTicking();
  else stopTicking();
  saveRuntimeState(); // 切模式后存一下，避免被 kill 丢进度
}

function resetSession() {
  state.running = false;
  stopTicking();
  state.remaining = (state.mode === 'work' ? state.workMinutes : state.breakMinutes) * 60;
  updateRing(false);
  updateDisplay();
  updateToggleIcon();
  saveRuntimeState(); // 重置后也存一下
  showToast('重置好啦，重新开始嘛', 'default', 1200);
}

// 跳过当前阶段，不计入完成数
function skipSession() {
  const nextMode = state.mode === 'work' ? 'break' : 'work';
  switchMode(nextMode, false);
  showToast('跳过啦', 'default', 1000);
}

// 切预设：更新时长、回到工作满时长、持久化
function applyPreset(work, brk) {
  state.workMinutes = work;
  state.breakMinutes = brk;
  state.running = false;
  stopTicking();
  state.mode = 'work';
  state.remaining = work * 60;
  // 更新预设按钮高亮
  containerEl.querySelectorAll('.pomo-preset').forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.w) === work && Number(btn.dataset.b) === brk);
  });
  // 持久化预设到统计
  const stats = getTodayStats();
  stats.workMinutes = work;
  stats.breakMinutes = brk;
  saveStats(stats);
  updateModeUI();
  updateRing(false);
  updateDisplay();
  updateToggleIcon();
  saveRuntimeState(); // 切预设后存一下新的模式 + 剩余时间
  showToast(`换成 ${work} / ${brk} 啦`, 'default', 1200);
}

// 秒数格式化为 MM:SS
function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}