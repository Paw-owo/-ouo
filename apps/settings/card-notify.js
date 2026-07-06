// apps/settings/card-notify.js
// 通知设置卡。我把通知的小开关都拢在一起啦，
// 总开关、分 App 开关、免打扰时段、桌面图标提示都在这儿。
// 依赖：core/storage-keys.js, core/storage.js, core/ui.js, core/util.js, core/events.js, apps-registry.js

import { KEYS } from '../../core/storage-keys.js';
import { getData, setData } from '../../core/storage.js';
import { showToast } from '../../core/ui.js';
import { injectStyle } from '../../core/util.js';
import bus from '../../core/events.js';
import { APPS } from '../../apps-registry.js';

injectStyle('popo-settings-notify-card', `
  .notify-per-app{display:flex;flex-direction:column;gap:6px;margin-top:4px}
  .notify-quiet-row{display:flex;align-items:center;gap:8px}
  .notify-quiet-row input[type=time]{padding:5px 8px;border-radius:var(--radius-md);background:var(--bg-secondary);color:var(--text-primary);border:1px solid color-mix(in srgb,var(--text-hint) 20%,transparent);font-size:var(--font-size-base)}
  .notify-quiet-sep{color:var(--text-hint);font-size:var(--font-size-small)}
  .notify-section-label{font-size:var(--font-size-small);color:var(--text-secondary);margin:12px 0 2px;font-weight:500}
  .notify-style-select{padding:5px 8px;border-radius:var(--radius-md);background:var(--bg-secondary);color:var(--text-primary);border:1px solid color-mix(in srgb,var(--text-hint) 20%,transparent);font-size:var(--font-size-base)}
`);

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

// 读桌面图标提示风格（4档温柔提示）。未设时回退看旧 badge 字段，保持兼容。
function readNoticeStyle() {
  const s = getData(KEYS.desktopNoticeStyle, null);
  if (s) return s;
  const cfg = getData(KEYS.notifySettings, null);
  return (cfg && cfg.badge === false) ? 'none' : 'ring';
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
      <span class="card-row-label">桌面图标提示</span>
      <select id="notify-notice-style" class="notify-style-select">
        <option value="ring">圆环</option>
        <option value="breathe">呼吸</option>
        <option value="tag">新字</option>
        <option value="none">关掉</option>
      </select>
    </div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-top:8px;line-height:1.5">免打扰时段里通知会安安静静的，不打扰你休息哦</div>
  `;

  // 渲染分 App 行（从注册表动态读，新增 App 自动出现）
  const perAppEl = card.querySelector('#notify-per-app');
  APPS.forEach((app) => {
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
    // 桌面图标提示风格独立存储
    setData(KEYS.desktopNoticeStyle, card.querySelector('#notify-notice-style').value);
  };

  // 总开关
  card.querySelector('#notify-global').addEventListener('change', (e) => {
    persist();
    showToast(e.target.checked ? '通知打开啦' : '通知关掉啦，安安静静');
    bus.emit('notify:settings-changed');
  });
  // 桌面图标提示风格
  const styleSel = card.querySelector('#notify-notice-style');
  styleSel.value = readNoticeStyle();
  styleSel.addEventListener('change', (e) => {
    persist();
    const label = { ring: '圆环', breathe: '呼吸', tag: '新字', none: '关掉' }[e.target.value] || '';
    showToast(label ? `图标提示改成${label}啦` : '图标提示关掉啦');
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
