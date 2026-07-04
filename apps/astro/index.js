// apps/astro/index.js
// 星座运势 App —— 软萌少女风 PWA「泡泡」。
// 我会偷偷看一眼星星，然后告诉你今天的小心情。
// 运势是按日期 + 星座本地算的，不联网，同一天同一个星座结果都一样哦。
// 数据：localStorage KEYS.astroState = { sign, updatedAt }
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { KEYS } from '../../core/storage-keys.js';
import { getData, setData } from '../../core/storage.js';
import { showToast, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, formatDate } from '../../core/util.js';
import { applyAppBg } from '../../core/app-bg.js';

let containerEl = null;

// 12 星座数据：名字 + 日期范围 + 图标名（统一用 star 线稿）
// 摩羯跨年（12.22 - 1.19），这里只用作展示，不参与运算
const SIGNS = [
  { name: '白羊', icon: 'star', start: '3.21', end: '4.19' },
  { name: '金牛', icon: 'star', start: '4.20', end: '5.20' },
  { name: '双子', icon: 'star', start: '5.21', end: '6.21' },
  { name: '巨蟹', icon: 'star', start: '6.22', end: '7.22' },
  { name: '狮子', icon: 'star', start: '7.23', end: '8.22' },
  { name: '处女', icon: 'star', start: '8.23', end: '9.22' },
  { name: '天秤', icon: 'star', start: '9.23', end: '10.23' },
  { name: '天蝎', icon: 'star', start: '10.24', end: '11.22' },
  { name: '射手', icon: 'star', start: '11.23', end: '12.21' },
  { name: '摩羯', icon: 'star', start: '12.22', end: '1.19' },
  { name: '水瓶', icon: 'star', start: '1.20', end: '2.18' },
  { name: '双鱼', icon: 'star', start: '2.19', end: '3.20' }
];

// 把星座图标渲染成 SVG 线稿
function signIcon(name, size) {
  return createIcon(name || 'star', size).outerHTML;
}

// 贴心话文案库：每天根据 hash 选一句，保证同一天同一星座结果一致
const QUOTES = [
  '今天的星星说，可以多相信自己一点点哦',
  '今天适合放下手机，看看窗外的小云朵',
  '今天会遇到一件小惊喜，别走太快啦',
  '今天心里那句没说出口的话，可以试着讲出来',
  '今天的状态像泡芙一样软软的，记得吃点甜的',
  '今天会有一个人偷偷想着你，可能是你想不到的那个',
  '今天的疲惫可以放进枕头里，今晚睡个好觉',
  '今天不要为难自己，慢慢来比较快',
  '今天适合给老朋友发一句"在干嘛呀"',
  '今天多喝点水，对心情也好',
  '今天会收到一个让你嘴角上扬的消息',
  '今天的你比昨天多懂了一点点自己，赞',
  '今天天气不一定晴，但你的心里可以晴',
  '今天记得对自己说一句：你已经很棒啦',
  '今天的小烦恼会被一阵风吹走，放心吧'
];

const LUCKY_COLORS = [
  '奶油白', '樱花粉', '薄荷绿', '天空蓝', '薰衣草紫',
  '蜜桃橙', '柠檬黄', '玫瑰红', '雾霾灰', '可可棕',
  '婴儿蓝', '奶黄色', '青草绿', '葡萄紫', '珊瑚橙'
];

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;

  injectStyle('app-astro-style', `
    /* 选星座 12 宫格 */
    .astro-picker-grid{
      display:grid;grid-template-columns:repeat(3,1fr);gap:12px;
    }
    .astro-sign-card{
      background:var(--bg-card);
      border-radius:var(--radius-card);
      padding:18px 10px;text-align:center;
      box-shadow:var(--shadow-sm);
      transition:var(--motion);
      border:none;cursor:pointer;
    }
    .astro-sign-card:active{transform:scale(var(--press-scale))}
    .astro-sign-emoji{
      color:var(--accent-dark);line-height:1;margin-bottom:6px;
      display:flex;justify-content:center;
    }
    .astro-sign-name{
      font-size:var(--font-size-base);font-weight:600;color:var(--text-primary);
    }
    .astro-sign-range{
      font-size:var(--font-size-small);color:var(--text-secondary);margin-top:2px;
    }
    /* 顶部运势 hero */
    .astro-hero{
      background:linear-gradient(135deg,var(--accent) 0%,var(--accent-dark) 100%);
      color:var(--bubble-user-text);
      border-radius:var(--radius-card);
      padding:22px 20px;margin-bottom:16px;
      box-shadow:var(--shadow-md);
    }
    .astro-hero-top{display:flex;align-items:center;gap:14px}
    .astro-hero-emoji{line-height:1;display:flex}
    .astro-hero-name{font-size:var(--font-size-title);font-weight:700}
    .astro-hero-date{font-size:var(--font-size-small);opacity:.85;margin-top:2px}
    .astro-hero-switch{
      margin-left:auto;background:rgba(255,255,255,.22);color:inherit;
      border:none;border-radius:999px;padding:6px 12px;
      font-size:var(--font-size-small);cursor:pointer;
    }
    .astro-hero-switch:active{transform:scale(var(--press-scale))}
    .astro-quote{
      margin-top:14px;font-size:var(--font-size-base);line-height:1.65;opacity:.96;
    }
    /* 运势条目 */
    .astro-fortune-list{display:flex;flex-direction:column;gap:10px;margin-top:4px}
    .astro-fortune-row{
      display:flex;align-items:center;justify-content:space-between;
      padding:10px 14px;border-radius:var(--radius-md);
      background:color-mix(in srgb,var(--bg-secondary) 60%,transparent);
    }
    .astro-fortune-label{font-size:var(--font-size-base);color:var(--text-primary)}
    .astro-stars{color:var(--accent);display:inline-flex;gap:2px;align-items:center}
    .astro-star-dim{opacity:.4;display:inline-flex}
    /* 幸运色 / 数字 */
    .astro-lucky{display:flex;gap:12px;margin-top:12px}
    .astro-lucky-pill{
      flex:1;background:var(--bg-card);
      border-radius:var(--radius-md);padding:12px;text-align:center;
      box-shadow:var(--shadow-sm);
    }
    .astro-lucky-label{font-size:var(--font-size-small);color:var(--text-secondary)}
    .astro-lucky-value{
      font-size:var(--font-size-title);font-weight:600;color:var(--accent-dark);margin-top:4px;
    }
    .astro-tip{
      font-size:var(--font-size-small);color:var(--text-hint);
      text-align:center;margin-top:18px;line-height:1.7;
    }
  `);

  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="astro-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">星座运势</div>
      <span style="width:36px"></span>
    </div>
    <div class="app-body" id="astro-body"></div>
  `;
  container.querySelector('#astro-back').addEventListener('click', () => bus.emit('router:home'));
  await render();
  applyAppBg(container, 'astro');
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 渲染
// ════════════════════════════════════════

async function render() {
  if (!containerEl) return;
  const body = containerEl.querySelector('#astro-body');
  const state = getData(KEYS.astroState, null);

  // 第一次进来还没选星座，先让人挑
  if (!state || !state.sign) {
    body.innerHTML = `
      <div class="card">
        <div class="card-title">先选一下你的星座嘛</div>
        <div class="astro-picker-grid" id="astro-grid"></div>
      </div>
      <div class="astro-tip">偷偷看一眼星星，告诉你今天的小心情～</div>
    `;
    renderPicker(body.querySelector('#astro-grid'), () => render());
    return;
  }

  renderFortune(body, state.sign);
}

function renderPicker(grid, onPick) {
  SIGNS.forEach((s) => {
    const btn = document.createElement('button');
    btn.className = 'astro-sign-card';
    btn.innerHTML = `
      <div class="astro-sign-emoji">${signIcon(s.icon, 30)}</div>
      <div class="astro-sign-name">${s.name}座</div>
      <div class="astro-sign-range">${s.start} - ${s.end}</div>
    `;
    btn.addEventListener('click', () => {
      setData(KEYS.astroState, { sign: s.name, updatedAt: new Date().toISOString() });
      showToast(`选好啦，${s.name}座`, 'success', 1200);
      if (typeof onPick === 'function') onPick();
    });
    grid.appendChild(btn);
  });
}

function renderFortune(body, signName) {
  const sign = SIGNS.find((s) => s.name === signName) || SIGNS[0];
  const today = new Date();
  const dateStr = formatDate(today, { full: true }); // YYYY-MM-DD
  // 同一天同一星座，seed 一样，结果就一样
  const seed = hashStr(dateStr + sign.name);

  const overall = starFrom(seed, 1);
  const love = starFrom(seed, 2);
  const career = starFrom(seed, 3);
  const wealth = starFrom(seed, 4);
  const quote = QUOTES[seed % QUOTES.length];
  const color = LUCKY_COLORS[(seed >> 2) % LUCKY_COLORS.length];
  const number = ((seed >> 3) % 9) + 1; // 1-9

  body.innerHTML = `
    <div class="astro-hero">
      <div class="astro-hero-top">
        <div class="astro-hero-emoji">${signIcon(sign.icon, 42)}</div>
        <div>
          <div class="astro-hero-name">${sign.name}座</div>
          <div class="astro-hero-date">${formatDate(today, { withWeek: true })}</div>
        </div>
        <button class="astro-hero-switch" id="astro-switch">换一个</button>
      </div>
      <div class="astro-quote">今天的星星说……<br>${escapeHTML(quote)}</div>
    </div>

    <div class="card">
      <div class="card-title">今日运势</div>
      <div class="astro-fortune-list">
        ${fortuneRow('综合', overall)}
        ${fortuneRow('爱情', love)}
        ${fortuneRow('事业', career)}
        ${fortuneRow('财运', wealth)}
      </div>
      <div class="astro-lucky">
        <div class="astro-lucky-pill">
          <div class="astro-lucky-label">幸运色</div>
          <div class="astro-lucky-value">${escapeHTML(color)}</div>
        </div>
        <div class="astro-lucky-pill">
          <div class="astro-lucky-label">幸运数字</div>
          <div class="astro-lucky-value">${number}</div>
        </div>
      </div>
    </div>

    <div class="astro-tip">运势是按星座和日期偷偷算的，每天都不一样哦<br>明天再来翻翻看嘛～</div>
  `;

  body.querySelector('#astro-switch').addEventListener('click', () => {
    openSignPicker(() => render());
  });
}

function fortuneRow(label, stars) {
  // 实心星用 fill，空心星用 stroke（线稿）
  let html = '';
  for (let i = 0; i < 5; i++) {
    const icon = i < stars
      ? createIcon('star', 18, { fill: 'currentColor' }).outerHTML
      : `<span class="astro-star-dim">${createIcon('star', 18).outerHTML}</span>`;
    html += icon;
  }
  return `
    <div class="astro-fortune-row">
      <span class="astro-fortune-label">${label}</span>
      <span class="astro-stars">${html}</span>
    </div>
  `;
}

function openSignPicker(onPick) {
  const body = document.createElement('div');
  body.innerHTML = `<div class="astro-picker-grid" id="astro-sheet-grid"></div>`;
  const sheet = showBottomSheet({
    title: '换个星座看看',
    bodyElement: body,
    dismissible: true
  });
  const grid = body.querySelector('#astro-sheet-grid');
  SIGNS.forEach((s) => {
    const btn = document.createElement('button');
    btn.className = 'astro-sign-card';
    btn.innerHTML = `
      <div class="astro-sign-emoji">${signIcon(s.icon, 30)}</div>
      <div class="astro-sign-name">${s.name}座</div>
      <div class="astro-sign-range">${s.start} - ${s.end}</div>
    `;
    btn.addEventListener('click', () => {
      setData(KEYS.astroState, { sign: s.name, updatedAt: new Date().toISOString() });
      sheet.close();
      showToast(`换好啦，${s.name}座`, 'success', 1200);
      if (typeof onPick === 'function') onPick();
    });
    grid.appendChild(btn);
  });
}

// ════════════════════════════════════════
// 小工具：稳定的字符串 hash
// ════════════════════════════════════════

function hashStr(str) {
  // FNV-1a 32 位
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 把 seed 拌一点盐，得到 1-5 颗星
function starFrom(seed, salt) {
  const v = (seed ^ Math.imul(salt, 2654435761)) >>> 0;
  return (v % 5) + 1;
}

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
