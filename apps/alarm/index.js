// apps/alarm/index.js
// 闹钟 App —— 软萌少女风 PWA「泡泡」。
// 我是小闹钟，记得叫我叫你起床哦。
// 重要提醒：PWA 在后台不一定能响，所以小手机要开着才能叫你嘛。
// 数据：IndexedDB STORES.alarms
// 字段：id / time(HH:MM) / label / enabled / repeat('once'|'daily'|'weekdays') / createdAt
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, deleteDB, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon, showAlert } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle } from '../../core/util.js';

let containerEl = null;
let timer = null;
// 记录本分钟已经响过的闹钟 id，防止同一分钟内重复弹窗
let firedSet = new Set();
let lastMinute = '';

const REPEAT_LABELS = {
  once: '只响一次',
  daily: '每天',
  weekdays: '工作日'
};

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
    .alarm-repeat{font-size:var(--font-size-small);color:var(--text-secondary);margin-top:4px}
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
      background:#fff;box-shadow:var(--shadow-sm);
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
  `);

  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="alarm-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">闹钟</div>
      <button class="app-add" id="alarm-add" aria-label="新增闹钟">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="alarm-body"></div>
  `;
  container.querySelector('#alarm-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#alarm-add').addEventListener('click', () => openForm(null));

  await render();
  startPolling();
}

export function unmount() {
  // 我走了，定时器也要带走，不然会偷偷在后台跑
  if (timer) { clearInterval(timer); timer = null; }
  firedSet.clear();
  lastMinute = '';
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
    item.innerHTML = `
      <div class="alarm-time">${escapeHTML(a.time || '00:00')}</div>
      <div class="alarm-meta">
        <div class="alarm-label">${escapeHTML(a.label || '闹钟')}</div>
        <div class="alarm-repeat">${escapeHTML(REPEAT_LABELS[a.repeat] || '只响一次')}</div>
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
  const body = document.createElement('div');
  body.className = 'alarm-form';
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
    <div class="row-actions">
      ${isEdit ? '<button class="btn danger" id="alarm-del">删掉</button>' : ''}
      <button class="btn primary" id="alarm-save">${isEdit ? '改好啦' : '加一个'}</button>
    </div>
  `;

  const sheet = showBottomSheet({
    title: isEdit ? '改一下闹钟' : '加个闹钟',
    bodyElement: body,
    dismissible: true
  });

  body.querySelector('#alarm-save').addEventListener('click', async () => {
    const time = body.querySelector('#alarm-input-time').value || '07:00';
    const label = body.querySelector('#alarm-input-label').value.trim() || '闹钟';
    const repeat = body.querySelector('#alarm-input-repeat').value || 'once';
    if (isEdit) {
      await setDB(STORES.alarms, existing.id, { ...existing, time, label, repeat });
      showToast('改好啦', 'success', 1200);
    } else {
      const id = generateId('alarm');
      await setDB(STORES.alarms, id, {
        id, time, label, repeat, enabled: true, createdAt: getNow()
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
  showAlert({
    title: '闹钟响啦',
    body: a.label || '起床啦，别睡过头嘛',
    okText: '知道啦'
  });
  // 顺手再弹个小提示凑热闹
  showToast(`到点啦：${a.label || '闹钟'}`, 'default', 3000);
  await render();
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
