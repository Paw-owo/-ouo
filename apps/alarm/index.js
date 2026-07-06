// apps/alarm/index.js
// 闹钟 App —— 软萌少女风 PWA「泡泡」。
// 我是小闹钟，记得叫我叫你起床哦。
// 重要提醒：PWA 在后台不一定能响，所以小手机要开着才能叫你嘛。
// 数据：IndexedDB STORES.alarms
// 字段：id / time(HH:MM) / label / enabled / repeat('once'|'daily'|'weekdays') / sound('chime'|'knock'|'beep'|'dingdong'|'piano') / createdAt
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, deleteDB, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon, showAlert } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle } from '../../core/util.js';
import { openApp } from '../../core/router.js';
import { applyAppBg } from '../../core/app-bg.js';

let containerEl = null;
let timer = null;
// 记录本分钟已经响过的闹钟 id，防止同一分钟内重复弹窗
let firedSet = new Set();
let lastMinute = '';
// 正在响的闹钟（贪睡用）：{ alarm, snoozeCount, soundLoop }
let ringingAlarm = null;
// 保存当前响铃弹窗引用，unmount 时关闭，避免弹窗残留在桌面
let ringDialog = null;

// 贪睡次数上限
const MAX_SNOOZE = 3;
// 贪睡间隔（毫秒）
const SNOOZE_MS = 5 * 60 * 1000;

const REPEAT_LABELS = {
  once: '只响一次',
  daily: '每天',
  weekdays: '工作日'
};

// 5 种铃声：用 Web Audio API 合成，不需要音频文件
const SOUNDS = [
  { key: 'chime',   label: '叮铃铃', desc: '高频连续，叫你起床' },
  { key: 'knock',   label: '咚咚咚', desc: '低频间隔，慢慢醒' },
  { key: 'beep',    label: '滴滴滴', desc: '短促电子音' },
  { key: 'dingdong',label: '叮咚',   desc: '双音，温柔一些' },
  { key: 'piano',   label: '轻柔钢琴', desc: '和弦模拟，软软的' }
];

const DEFAULT_SOUND = 'chime';

// 音频上下文（懒加载，避免没用户交互就启动）
let audioCtx = null;
function getAudioCtx() {
  if (audioCtx) return audioCtx;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  } catch (e) {
    console.warn('[alarm] AudioContext 不可用', e);
    return null;
  }
}

// 单个振荡音
function playTone(ctx, freq, startAt, duration, type = 'sine', gain = 0.18) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, startAt);
  // 包络：起音 - 保持 - 释放
  g.gain.setValueAtTime(0, startAt);
  g.gain.linearRampToValueAtTime(gain, startAt + 0.01);
  g.gain.setValueAtTime(gain, startAt + duration - 0.04);
  g.gain.linearRampToValueAtTime(0, startAt + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}

// 按铃声 key 合成一段提示音（约 1.2-2 秒）
function playSoundOnce(key) {
  const ctx = getAudioCtx();
  if (!ctx) return;
  // 浏览器策略：用户交互后才能解锁
  if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
  const t0 = ctx.currentTime + 0.02;
  switch (key) {
    case 'chime': {
      // 高频连续叮铃铃：880Hz 短脉冲 5 次
      for (let i = 0; i < 5; i++) playTone(ctx, 880, t0 + i * 0.18, 0.14, 'triangle', 0.16);
      break;
    }
    case 'knock': {
      // 低频间隔咚咚咚：220Hz 三次
      for (let i = 0; i < 3; i++) playTone(ctx, 220, t0 + i * 0.4, 0.28, 'sine', 0.22);
      break;
    }
    case 'beep': {
      // 短促电子音：1200Hz 三声
      for (let i = 0; i < 3; i++) playTone(ctx, 1200, t0 + i * 0.22, 0.08, 'square', 0.12);
      break;
    }
    case 'dingdong': {
      // 双音叮咚：660 -> 880
      playTone(ctx, 660, t0, 0.32, 'triangle', 0.18);
      playTone(ctx, 880, t0 + 0.34, 0.42, 'triangle', 0.18);
      break;
    }
    case 'piano': {
      // 轻柔钢琴：和弦模拟（C-E-G）
      playTone(ctx, 523.25, t0, 1.0, 'triangle', 0.12);
      playTone(ctx, 659.25, t0, 1.0, 'triangle', 0.10);
      playTone(ctx, 783.99, t0, 1.0, 'triangle', 0.10);
      break;
    }
    default: {
      playTone(ctx, 880, t0, 0.2, 'sine', 0.18);
    }
  }
}

// 闹钟响铃：循环播放，直到用户处理
let ringLoopId = null;
function startRingLoop(key) {
  stopRingLoop();
  const periodMs = 1600;
  playSoundOnce(key);
  ringLoopId = setInterval(() => playSoundOnce(key), periodMs);
}
function stopRingLoop() {
  if (ringLoopId) { clearInterval(ringLoopId); ringLoopId = null; }
}

// 振动（如果支持）
function vibratePattern() {
  try {
    if (navigator && typeof navigator.vibrate === 'function') {
      // 振动 200ms，间隔 100ms，重复 3 次
      navigator.vibrate([200, 100, 200, 100, 200]);
    }
  } catch (e) { /* 忽略 */ }
}

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;

  // 我的小闹钟样式（视觉值都走 CSS 变量，主题切换会跟着变）
  injectStyle('app-alarm-style', `
    .alarm-warn{
      background:color-mix(in srgb,var(--accent-light) 55%,transparent);
      border:1px solid color-mix(in srgb,var(--accent) 45%,transparent);
      border-radius:var(--radius-card);
      padding:12px 14px;
      font-size:var(--font-size-small);
      color:var(--accent-dark);
      line-height:1.55;
      margin-bottom:16px;
      display:flex;gap:8px;align-items:flex-start;
    }
    .alarm-warn .popo-icon{flex-shrink:0;margin-top:1px}
    .alarm-list{display:flex;flex-direction:column;gap:12px}
    .alarm-item{
      background:var(--bg-card);
      border-radius:var(--radius-card);
      padding:16px 18px;
      box-shadow:var(--shadow-sm);
      display:flex;align-items:center;gap:14px;
      transition:var(--motion);
      cursor:pointer;
    }
    .alarm-item.disabled{opacity:.55}
    .alarm-item:active{transform:scale(.99)}
    .alarm-time{
      font-size:30px;font-weight:700;color:var(--text-primary);
      letter-spacing:.5px;line-height:1;font-variant-numeric:tabular-nums;
      min-width:72px;
    }
    .alarm-meta{flex:1;min-width:0}
    .alarm-label{
      font-size:var(--font-size-base);color:var(--text-primary);
      font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
    }
    .alarm-repeat{font-size:var(--font-size-small);color:var(--text-secondary);margin-top:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .alarm-sound-pill{
      display:inline-flex;align-items:center;gap:3px;
      padding:1px 8px;border-radius:999px;
      background:color-mix(in srgb,var(--accent-light) 50%,transparent);
      color:var(--accent-dark);font-size:var(--font-size-small);
    }
    /* toggle 开关 */
    .alarm-toggle{
      width:46px;height:26px;border-radius:999px;
      background:color-mix(in srgb,var(--text-hint) 55%,transparent);
      position:relative;flex-shrink:0;cursor:pointer;
      transition:background var(--motion);
      border:none;padding:0;
    }
    .alarm-toggle::after{
      content:'';position:absolute;top:3px;left:3px;
      width:20px;height:20px;border-radius:50%;
      background:var(--bg-card);box-shadow:var(--shadow-sm);
      transition:transform var(--motion) var(--motion-spring);
    }
    .alarm-toggle.on{background:var(--accent)}
    .alarm-toggle.on::after{transform:translateX(20px)}
    .alarm-empty{
      padding:60px 24px;text-align:center;color:var(--text-hint);
      font-size:var(--font-size-small);line-height:1.7;
    }
    .alarm-empty-icon{margin-bottom:10px;opacity:.6;display:flex;justify-content:center;color:var(--accent)}
    /* 新增 / 编辑表单 */
    .alarm-form{display:flex;flex-direction:column;gap:12px}
    .alarm-form .field-label{font-size:var(--font-size-small);color:var(--text-secondary);margin-bottom:4px}
    .alarm-form input[type=time]{
      width:100%;padding:12px 16px;
      background:color-mix(in srgb,var(--bg-secondary) 60%,transparent);
      border:1px solid color-mix(in srgb,var(--text-hint) 18%,transparent);
      border-radius:var(--radius-md);
      font-size:var(--font-size-large);color:var(--text-primary);
    }
    .alarm-form .row-actions{display:flex;gap:8px;margin-top:6px}
    .alarm-form .row-actions .btn{flex:1;justify-content:center}
    /* 铃声选择 */
    .alarm-sound-list{display:flex;flex-direction:column;gap:8px}
    .alarm-sound-item{
      display:flex;align-items:center;gap:10px;
      padding:11px 14px;border-radius:var(--radius-md);
      background:color-mix(in srgb,var(--bg-secondary) 55%,transparent);
      border:1px solid transparent;
      cursor:pointer;transition:var(--motion);
    }
    .alarm-sound-item:active{transform:scale(.99)}
    .alarm-sound-item.active{
      border-color:var(--accent);
      background:color-mix(in srgb,var(--accent-light) 35%,transparent);
    }
    .alarm-sound-main{flex:1;min-width:0}
    .alarm-sound-name{font-size:var(--font-size-base);color:var(--text-primary);font-weight:500}
    .alarm-sound-desc{font-size:var(--font-size-small);color:var(--text-secondary);margin-top:2px}
    .alarm-sound-play{
      width:36px;height:36px;border-radius:50%;
      background:var(--accent);color:var(--bubble-user-text);
      border:none;display:flex;align-items:center;justify-content:center;
      flex-shrink:0;cursor:pointer;
    }
    .alarm-sound-play:active{transform:scale(var(--press-scale))}
    .alarm-sound-check{color:var(--accent);flex-shrink:0}
    /* 响铃弹窗按钮 */
    .alarm-ring-actions{display:flex;flex-direction:column;gap:8px;margin-top:8px}
  `);

  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="alarm-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">闹钟</div>
      <button class="app-header-gear" id="alarm-settings" aria-label="闹钟设置">${createIcon('settings', 18).outerHTML}</button>
      <button class="app-add" id="alarm-add" aria-label="新增闹钟">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="alarm-body"></div>
  `;
  container.querySelector('#alarm-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#alarm-add').addEventListener('click', () => openForm(null));
  // 齿轮跳到设置「数据与系统」分组
  container.querySelector('#alarm-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'system' } }));

  await render();
  startPolling();
  applyAppBg(container, 'alarm');
}

export function unmount() {
  // 我走了，定时器也要带走，不然会偷偷在后台跑
  if (timer) { clearInterval(timer); timer = null; }
  stopRingLoop();
  // 关闭可能残留的响铃弹窗，避免退出 APP 后弹窗还挂在桌面
  if (ringDialog && typeof ringDialog.close === 'function') {
    ringDialog.close();
    ringDialog = null;
  }
  firedSet.clear();
  lastMinute = '';
  ringingAlarm = null;
  containerEl = null;
}

// ════════════════════════════════════════
// 渲染列表
// ════════════════════════════════════════

async function render() {
  if (!containerEl) return;
  const body = containerEl.querySelector('#alarm-body');
  const alarms = await getAllDB(STORES.alarms);
  // 按时间从早到晚排好
  const sorted = alarms.slice().sort((a, b) => (a.time || '').localeCompare(b.time || ''));

  body.innerHTML = `
    <div class="alarm-warn">
      ${createIcon('bell', 16).outerHTML}
      <span>小手机要开着才能叫你哦，关了就听不见啦</span>
    </div>
    <div class="alarm-list" id="alarm-list"></div>
  `;
  const list = body.querySelector('#alarm-list');

  if (!sorted.length) {
    list.innerHTML = `
      <div class="alarm-empty">
        <div class="alarm-empty-icon">${createIcon('bell', 48).outerHTML}</div>
        <div>还没有闹钟呢，右上角加一个嘛<br>「起床啦」「别睡过头嘛」</div>
      </div>
    `;
    return;
  }

  for (const a of sorted) {
    const item = document.createElement('div');
    item.className = `alarm-item ${a.enabled ? '' : 'disabled'}`;
    item.dataset.id = a.id;
    const sound = SOUNDS.find((s) => s.key === a.sound) || SOUNDS[0];
    item.innerHTML = `
      <div class="alarm-time">${escapeHTML(a.time || '00:00')}</div>
      <div class="alarm-meta">
        <div class="alarm-label">${escapeHTML(a.label || '闹钟')}</div>
        <div class="alarm-repeat">
          <span>${escapeHTML(REPEAT_LABELS[a.repeat] || '只响一次')}</span>
          <span class="alarm-sound-pill">${createIcon('volume', 12).outerHTML}${escapeHTML(sound.label)}</span>
        </div>
      </div>
      <button class="alarm-toggle ${a.enabled ? 'on' : ''}" aria-label="${a.enabled ? '关掉' : '打开'}" data-act="toggle"></button>
    `;
    // 点开关只切换，不进编辑
    item.querySelector('[data-act=toggle]').addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleAlarm(a.id, !a.enabled);
    });
    // 点条目本身进编辑
    item.addEventListener('click', () => openForm(a));
    list.appendChild(item);
  }
}

async function toggleAlarm(id, enabled) {
  const a = await getDB(STORES.alarms, id);
  if (!a) return;
  await setDB(STORES.alarms, id, { ...a, enabled });
  showToast(enabled ? '开好啦，到点叫你' : '关掉啦', enabled ? 'success' : 'default', 1200);
  await render();
}

// ════════════════════════════════════════
// 新增 / 编辑表单（底部 sheet）
// ════════════════════════════════════════

function openForm(existing) {
  const isEdit = !!existing;
  let pickedSound = existing?.sound || DEFAULT_SOUND;
  const body = document.createElement('div');
  body.className = 'alarm-form';

  const renderSoundList = () => {
    const wrap = body.querySelector('#alarm-sound-list');
    if (!wrap) return;
    wrap.innerHTML = SOUNDS.map((s) => `
      <div class="alarm-sound-item ${s.key === pickedSound ? 'active' : ''}" data-sound="${escapeAttr(s.key)}">
        <div class="alarm-sound-main">
          <div class="alarm-sound-name">${escapeHTML(s.label)}</div>
          <div class="alarm-sound-desc">${escapeHTML(s.desc)}</div>
        </div>
        <button class="alarm-sound-play" data-play="${escapeAttr(s.key)}" aria-label="试听 ${escapeAttr(s.label)}">${createIcon('volume', 16).outerHTML}</button>
        ${s.key === pickedSound ? `<span class="alarm-sound-check">${createIcon('check', 18).outerHTML}</span>` : ''}
      </div>
    `).join('');
    // 选中（不含播放按钮）
    wrap.querySelectorAll('.alarm-sound-item').forEach((row) => {
      row.addEventListener('click', (e) => {
        // 点播放按钮不切换选中
        if (e.target.closest('[data-play]')) return;
        pickedSound = row.dataset.sound;
        renderSoundList();
      });
    });
    // 试听
    wrap.querySelectorAll('[data-play]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const k = btn.dataset.play;
        playSoundOnce(k);
        vibratePattern();
        showToast(`正在试听：${SOUNDS.find((s) => s.key === k)?.label || ''}`, 'default', 1000);
      });
    });
  };

  body.innerHTML = `
    <div>
      <div class="field-label">时间</div>
      <input type="time" id="alarm-input-time" value="${escapeAttr(existing?.time || '07:00')}">
    </div>
    <div>
      <div class="field-label">标签</div>
      <input class="input" id="alarm-input-label" maxlength="20" placeholder="比如：起床啦" value="${escapeAttr(existing?.label || '')}">
    </div>
    <div>
      <div class="field-label">重复</div>
      <select class="select" id="alarm-input-repeat">
        <option value="once" ${existing?.repeat === 'once' ? 'selected' : ''}>只响一次</option>
        <option value="daily" ${existing?.repeat === 'daily' ? 'selected' : ''}>每天</option>
        <option value="weekdays" ${existing?.repeat === 'weekdays' ? 'selected' : ''}>工作日（周一到周五）</option>
      </select>
    </div>
    <div>
      <div class="field-label">铃声（点一下试听，再点选中）</div>
      <div class="alarm-sound-list" id="alarm-sound-list"></div>
    </div>
    <div class="row-actions">
      ${isEdit ? '<button class="btn danger" id="alarm-del">删掉</button>' : ''}
      <button class="btn primary" id="alarm-save">${isEdit ? '改好啦' : '加一个'}</button>
    </div>
  `;
  renderSoundList();

  const sheet = showBottomSheet({
    title: isEdit ? '改一下闹钟' : '加个闹钟',
    bodyElement: body,
    dismissible: true
  });

  body.querySelector('#alarm-save').addEventListener('click', async () => {
    const time = body.querySelector('#alarm-input-time').value || '07:00';
    const label = body.querySelector('#alarm-input-label').value.trim() || '闹钟';
    const repeat = body.querySelector('#alarm-input-repeat').value || 'once';
    const sound = pickedSound;
    if (isEdit) {
      await setDB(STORES.alarms, existing.id, { ...existing, time, label, repeat, sound });
      showToast('改好啦', 'success', 1200);
    } else {
      const id = generateId('alarm');
      await setDB(STORES.alarms, id, {
        id, time, label, repeat, sound, enabled: true, createdAt: getNow()
      });
      showToast('加好啦，到点叫你', 'success', 1200);
    }
    sheet.close();
    await render();
  });

  if (isEdit) {
    body.querySelector('#alarm-del').addEventListener('click', () => {
      showConfirm({
        title: '删掉这个闹钟吗？',
        body: '删掉后就不再叫你啦',
        confirmText: '删掉',
        cancelText: '不要',
        danger: true,
        onConfirm: async () => {
          await deleteDB(STORES.alarms, existing.id);
          sheet.close();
          showToast('删掉啦');
          await render();
        }
      });
    });
  }
}

// ════════════════════════════════════════
// 前台轮询：每秒看一眼时间到了没
// ════════════════════════════════════════

function startPolling() {
  if (timer) clearInterval(timer);
  firedSet.clear();
  lastMinute = '';
  timer = setInterval(checkAlarms, 1000);
}

async function checkAlarms() {
  if (!containerEl) return;
  // 正在响时不再触发新闹钟（贪睡期间除外，贪睡由 setTimeout 单独调度）
  if (ringingAlarm) return;
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const cur = `${hh}:${mm}`;
  const dow = now.getDay(); // 0=周日, 6=周六
  const isWeekday = dow >= 1 && dow <= 5;

  // 进入新的一分钟，把上一分钟的记录清掉
  if (cur !== lastMinute) {
    firedSet = new Set();
    lastMinute = cur;
  }

  const alarms = await getAllDB(STORES.alarms);
  for (const a of alarms) {
    if (!a.enabled) continue;
    if (a.time !== cur) continue;
    // 工作日闹钟周末不响
    if (a.repeat === 'weekdays' && !isWeekday) continue;
    // 本分钟已经响过就跳过
    const firedKey = `${a.id}@${cur}`;
    if (firedSet.has(firedKey)) continue;
    firedSet.add(firedKey);
    triggerAlarm(a);
  }
}

async function triggerAlarm(a) {
  // 一次性闹钟一响就自动关掉，不然下一分钟又会响
  if (a.repeat === 'once') {
    const cur = await getDB(STORES.alarms, a.id);
    if (cur && cur.enabled) {
      await setDB(STORES.alarms, a.id, { ...cur, enabled: false });
    }
  }
  // 设置正在响的闹钟，开始循环播放铃声 + 振动
  ringingAlarm = { alarm: a, snoozeCount: 0 };
  const soundKey = a.sound || DEFAULT_SOUND;
  startRingLoop(soundKey);
  vibratePattern();
  showRingDialog(a);
  await render();
}

// 响铃弹窗：含"再睡5分钟"和"起床啦"，并把贪睡次数告诉宝贝
function showRingDialog(a) {
  const count = ringingAlarm?.snoozeCount || 0;
  const remaining = Math.max(0, MAX_SNOOZE - count);
  let body = a.label || '早安呀，别睡过头嘛';
  // 已经贪睡过的话，把次数显示在响铃界面，让宝贝心里有数
  if (count > 0) {
    body = `${body}（已经贪睡 ${count} 次啦，还能再贪睡 ${remaining} 次哦）`;
  }
  // 贪睡次数用完，只能起床啦，不再给"再睡5分钟"按钮
  if (remaining <= 0) {
    ringDialog = showAlert({
      title: '该起床啦宝贝',
      body: '不能再贪睡啦，新的一天开始啦',
      okText: '起床啦',
      onOk: () => dismissRing(a)
    });
    return;
  }
  // 用 showConfirm 实现两个按钮：取消=起床，确认=贪睡
  ringDialog = showConfirm({
    title: '该起床啦宝贝',
    body,
    confirmText: '再睡5分钟',
    cancelText: '起床啦',
    danger: false,
    onConfirm: () => snooze(a),
    onCancel: () => dismissRing(a)
  });
}

// 贪睡：5 分钟后再响，最多 MAX_SNOOZE 次，超过就强制起床
function snooze(a) {
  if (!ringingAlarm) return;
  // 已经贪睡到上限就不再延后，直接强制起床
  if (ringingAlarm.snoozeCount >= MAX_SNOOZE) {
    showToast('不能再贪睡啦，赶紧起来嘛', 'default', 1800);
    dismissRing(a);
    return;
  }
  ringingAlarm.snoozeCount += 1;
  stopRingLoop();
  ringDialog = null; // 旧弹窗已被 showConfirm 关闭，清引用避免悬空
  const remaining = MAX_SNOOZE - ringingAlarm.snoozeCount;
  // 最后一次贪睡的话，温柔提醒一下下次就得起来啦
  if (remaining > 0) {
    showToast(`再睡一小会儿，还能贪睡 ${remaining} 次哦`, 'default', 1800);
  } else {
    showToast('再睡最后一会儿啦，下次就得起来咯', 'default', 1800);
  }
  // 5 分钟后再响
  setTimeout(() => {
    if (!ringingAlarm || ringingAlarm.alarm.id !== a.id) return;
    const soundKey = ringingAlarm.alarm.sound || DEFAULT_SOUND;
    startRingLoop(soundKey);
    vibratePattern();
    showRingDialog(ringingAlarm.alarm);
  }, SNOOZE_MS);
}

// 关闭响铃
function dismissRing(a) {
  stopRingLoop();
  ringingAlarm = null;
  ringDialog = null; // 弹窗已被 onOk/onCancel 关闭，清引用即可
  showToast('早安呀，今天也要软乎乎的', 'success', 1600);
}

// ════════════════════════════════════════
// 小工具
// ════════════════════════════════════════

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) {
  return escapeHTML(s).replace(/"/g, '&quot;');
}
