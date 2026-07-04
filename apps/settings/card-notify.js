// apps/settings/card-notify.js
// 通知设置卡。我把通知的小开关都拢在一起啦，
// 总开关、分 App 开关、免打扰时段、桌面角标都在这儿。
// 依赖：core/storage-keys.js, core/storage.js, core/ui.js, core/util.js, core/events.js

import { KEYS } from '../../core/storage-keys.js';
import { getData, setData } from '../../core/storage.js';
import { showToast } from '../../core/ui.js';
import { injectStyle } from '../../core/util.js';
import bus from '../../core/events.js';

injectStyle('popo-settings-notify-card', `
  .notify-per-app{display:flex;flex-direction:column;gap:2px;margin-top:4px}
  .notify-per-app .card-row{padding:6px 0;border-bottom:1px solid color-mix(in srgb,var(--text-hint) 12%,transparent)}
  .notify-per-app .card-row:last-child{border-bottom:none}
  .notify-quiet-row{display:flex;align-items:center;gap:8px}
  .notify-quiet-row input[type=time]{padding:5px 8px;border-radius:var(--radius-sm);background:var(--bg-secondary);color:var(--text-primary);border:1px solid color-mix(in srgb,var(--text-hint) 20%,transparent);font-size:var(--font-size-base)}
  .notify-quiet-sep{color:var(--text-hint);font-size:var(--font-size-small)}
  .notify-section-label{font-size:var(--font-size-small);color:var(--text-secondary);margin:12px 0 2px;font-weight:500}
`);

// 任务要求里的分 App 列表
const PER_APP_LIST = [
  { id: 'chat', name: '聊天' },
  { id: 'moments', name: '朋友圈' },
  { id: 'wallet', name: '钱包' },
  { id: 'shop', name: '商店' },
  { id: 'grudge', name: '记仇本' },
  { id: 'memo', name: '备忘录' },
  { id: 'anniversary', name: '纪念日' }
];

// 默认通知配置，没存过就用这套
const DEFAULT_NOTIFY = {
  global: true,
  perApp: {},
  quietHours: { start: '23:00', end: '07:30' },
  badge: true
};

function readNotify() {
  const saved = getData(KEYS.notifySettings, null);
  if (!saved || typeof saved !== 'object') {
    return { ...DEFAULT_NOTIFY, perApp: {} };
  }
  return {
    global: saved.global !== false,
    perApp: { ...(saved.perApp || {}) },
    quietHours: {
      start: (saved.quietHours && saved.quietHours.start) || DEFAULT_NOTIFY.quietHours.start,
      end: (saved.quietHours && saved.quietHours.end) || DEFAULT_NOTIFY.quietHours.end
    },
    badge: saved.badge !== false
  };
}

export function renderNotifyCard() {
  const cfg = readNotify();
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-title">通知</div>
    <div class="card-row">
      <span class="card-row-label">通知总开关</span>
      <input type="checkbox" id="notify-global" ${cfg.global ? 'checked' : ''}>
    </div>
    <div class="notify-section-label">分 App 通知</div>
    <div class="notify-per-app" id="notify-per-app"></div>
    <div class="notify-section-label">免打扰时段</div>
    <div class="card-row">
      <div class="notify-quiet-row">
        <input type="time" id="notify-quiet-start" value="${cfg.quietHours.start}">
        <span class="notify-quiet-sep">到</span>
        <input type="time" id="notify-quiet-end" value="${cfg.quietHours.end}">
      </div>
    </div>
    <div class="card-row">
      <span class="card-row-label">桌面角标红点</span>
      <input type="checkbox" id="notify-badge" ${cfg.badge ? 'checked' : ''}>
    </div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-top:8px;line-height:1.5">免打扰时段里通知会安安静静的，不打扰你休息哦</div>
  `;

  // 渲染分 App 行
  const perAppEl = card.querySelector('#notify-per-app');
  PER_APP_LIST.forEach((app) => {
    const on = cfg.perApp[app.id] !== false; // 没存过默认开
    const row = document.createElement('div');
    row.className = 'card-row';
    row.innerHTML = `<span class="card-row-label">${app.name}</span>
      <input type="checkbox" data-app="${app.id}" ${on ? 'checked' : ''}>`;
    perAppEl.appendChild(row);
  });

  // 统一持久化函数，每次变更都把整份配置写回
  const persist = () => {
    const next = readNotify();
    next.global = !!card.querySelector('#notify-global').checked;
    next.badge = !!card.querySelector('#notify-badge').checked;
    next.quietHours = {
      start: card.querySelector('#notify-quiet-start').value,
      end: card.querySelector('#notify-quiet-end').value
    };
    const perApp = {};
    perAppEl.querySelectorAll('input[type=checkbox]').forEach((inp) => {
      perApp[inp.dataset.app] = inp.checked;
    });
    next.perApp = perApp;
    setData(KEYS.notifySettings, next);
  };

  // 总开关
  card.querySelector('#notify-global').addEventListener('change', (e) => {
    persist();
    showToast(e.target.checked ? '通知打开啦' : '通知关掉啦，安安静静');
    bus.emit('notify:settings-changed');
  });
  // 角标开关
  card.querySelector('#notify-badge').addEventListener('change', (e) => {
    persist();
    showToast(e.target.checked ? '角标打开啦' : '角标关掉啦');
    bus.emit('notify:settings-changed');
  });
  // 分 App 开关
  perAppEl.querySelectorAll('input[type=checkbox]').forEach((inp) => {
    inp.addEventListener('change', () => {
      persist();
      bus.emit('notify:settings-changed');
    });
  });
  // 免打扰时段
  card.querySelector('#notify-quiet-start').addEventListener('change', () => {
    persist();
    bus.emit('notify:settings-changed');
  });
  card.querySelector('#notify-quiet-end').addEventListener('change', () => {
    persist();
    bus.emit('notify:settings-changed');
  });

  return card;
}
