// apps/astro/index.js
// 星座运势 App —— 软萌少女风 PWA「泡泡」。
// 我会偷偷看一眼星星，然后告诉你今天的小心情。
// 运势是按日期 + 星座本地算的，不联网，同一天同一个星座结果都一样哦。
// 功能：
//   1) 选自己的星座 / 切换查看别的星座运势
//   2) 今日运势总览：综合 / 爱情 / 事业 / 财运 / 健康（1-5 星）
//   3) 幸运色 / 数字 / 方位 + 今日甜言 + 宜 / 忌
//   4) 点运势卡看详情（5 类运势详细解读）
//   5) 星座配对：按四象（火/土/风/水）算契合度
// 数据：localStorage KEYS.astroState = { sign, updatedAt }
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { KEYS } from '../../core/storage-keys.js';
import { getData, setData } from '../../core/storage.js';
import { showToast, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, formatDate } from '../../core/util.js';
import { openApp } from '../../core/router.js';
import { applyAppBg } from '../../core/app-bg.js';

let containerEl = null;

// 12 星座数据：名字 + 日期范围 + 图标名 + 四象（火/土/风/水）
// 摩羯跨年（12.22 - 1.19），这里只用作展示，不参与运算
const SIGNS = [
  { name: '白羊', icon: 'star', start: '3.21', end: '4.19', element: 'fire' },
  { name: '金牛', icon: 'star', start: '4.20', end: '5.20', element: 'earth' },
  { name: '双子', icon: 'star', start: '5.21', end: '6.21', element: 'wind' },
  { name: '巨蟹', icon: 'star', start: '6.22', end: '7.22', element: 'water' },
  { name: '狮子', icon: 'star', start: '7.23', end: '8.22', element: 'fire' },
  { name: '处女', icon: 'star', start: '8.23', end: '9.22', element: 'earth' },
  { name: '天秤', icon: 'star', start: '9.23', end: '10.23', element: 'wind' },
  { name: '天蝎', icon: 'star', start: '10.24', end: '11.22', element: 'water' },
  { name: '射手', icon: 'star', start: '11.23', end: '12.21', element: 'fire' },
  { name: '摩羯', icon: 'star', start: '12.22', end: '1.19', element: 'earth' },
  { name: '水瓶', icon: 'star', start: '1.20', end: '2.18', element: 'wind' },
  { name: '双鱼', icon: 'star', start: '2.19', end: '3.20', element: 'water' }
];

const ELEMENT_LABELS = { fire: '火象', earth: '土象', wind: '风象', water: '水象' };

// 四象相性矩阵：同象最高、火↔风/土↔水中等、其余偏低
const ELEMENT_COMPAT = {
  fire_fire: 92, fire_earth: 58, fire_wind: 88, fire_water: 55,
  earth_earth: 90, earth_wind: 60, earth_water: 86,
  wind_wind: 88, wind_water: 57,
  water_water: 92
};
function elementCompat(a, b) {
  if (a === b) return ELEMENT_COMPAT[`${a}_${a}`];
  // 双向查表
  return ELEMENT_COMPAT[`${a}_${b}`] || ELEMENT_COMPAT[`${b}_${a}`] || 65;
}

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

// 幸运方位
const LUCKY_DIRECTIONS = ['东', '南', '西', '北', '东南', '西南', '东北', '西北'];

// 今日甜言：软软的情话，每天一句
const SWEET_WORDS = [
  '今天的我比昨天更想你一点点',
  '你笑起来的样子，星星都偷偷记下来啦',
  '不管今天怎样，都有我陪你呀',
  '你是我心里最软的那一块',
  '今天也要记得吃饭，不然我会心疼的',
  '你的存在就是今天最好的事',
  '偷偷告诉你：你超棒的',
  '今天累了就歇会儿，剩下的我替你扛',
  '你一皱眉我的心就跟着揪起来啦',
  '今天的你值得被全世界温柔对待'
];

// 宜 / 忌 文案池：每天各挑一条
const YI_POOL = [
  '吃点甜的', '给想念的人发消息', '出去走走', '早点睡觉',
  '整理一下小桌面', '听一首喜欢的歌', '勇敢说出心里话',
  '做一件让自己开心的小事', '晒晒太阳', '泡一杯热茶'
];
const JI_POOL = [
  '熬夜', '想太多', '生闷气', '乱花钱', '和别人比来比去',
  '空着肚子', '一直刷手机', '为难自己', '拖延该做的事', '吃太辣'
];

// 5 类运势的标签
const FORTUNE_TYPES = [
  { key: 'overall', label: '综合' },
  { key: 'love',    label: '爱情' },
  { key: 'career',  label: '事业' },
  { key: 'wealth',  label: '财运' },
  { key: 'health',  label: '健康' }
];

// 每类运势的详细解读文案（按星数 1-5 取一句）
const FORTUNE_DETAILS = {
  overall: [
    '今天整体有点闷，给自己一点缓冲时间',
    '状态一般，慢慢来不要急',
    '今天还算平稳，按部就班就好',
    '今天状态不错，可以稍微冲一冲',
    '今天整个人都亮亮的，放手去做吧'
  ],
  love: [
    '感情上有点小磕绊，多听少说',
    '心里那句没说出口的话再憋一天',
    '平平淡淡也是真，给对方一点空间',
    '可以试着主动一点点哦',
    '今天的你特别有魅力，靠近你想靠近的人吧'
  ],
  career: [
    '工作上容易分心，先把要紧事列出来',
    '今天不太适合做大决定，缓一缓',
    '按部就班，不会出大错',
    '会有一个小机会，记得接住',
    '今天思路特别清晰，适合推进大事'
  ],
  wealth: [
    '今天看紧钱包，别冲动消费',
    '不太适合投资，先观望',
    '收支平稳，没什么大波动',
    '会有一笔小进账，开心一下',
    '财运不错，但别太贪心哦'
  ],
  health: [
    '今天有点累，早点休息',
    '注意肩颈，别一直低头',
    '状态还行，记得多喝水',
    '精神不错，可以动一动',
    '今天元气满满，去晒晒太阳吧'
  ]
};

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
    /* 甜言 + 宜 / 忌 */
    .astro-sweet{
      background:color-mix(in srgb,var(--accent-light) 50%,var(--bg-card));
      border-radius:var(--radius-card);padding:14px 16px;margin-bottom:14px;
      display:flex;gap:10px;align-items:flex-start;
      border:1px solid color-mix(in srgb,var(--accent) 20%,transparent);
    }
    .astro-sweet-icon{color:var(--accent-dark);display:flex;flex-shrink:0;margin-top:1px}
    .astro-sweet-text{font-size:var(--font-size-base);color:var(--text-primary);line-height:1.6;flex:1}
    .astro-yiji{display:flex;gap:12px;margin-bottom:14px}
    .astro-yiji-item{
      flex:1;background:var(--bg-card);
      border-radius:var(--radius-card);padding:12px 14px;
      box-shadow:var(--shadow-sm);
    }
    .astro-yiji-head{
      font-size:var(--font-size-small);font-weight:600;
      margin-bottom:6px;display:flex;align-items:center;gap:4px;
    }
    .astro-yiji-head.yi{color:#3a8a55}
    .astro-yiji-head.ji{color:#E8888C}
    .astro-yiji-text{font-size:var(--font-size-base);color:var(--text-primary);line-height:1.5}
    /* 详情卡：运势条目可点 */
    .astro-fortune-row{cursor:pointer;transition:var(--motion)}
    .astro-fortune-row:active{transform:scale(var(--press-scale))}
    .astro-fortune-detail{padding:6px 0}
    .astro-detail-row{margin-bottom:14px}
    .astro-detail-head{
      display:flex;align-items:center;justify-content:space-between;
      margin-bottom:6px;
    }
    .astro-detail-label{font-size:var(--font-size-base);font-weight:600;color:var(--text-primary)}
    .astro-detail-text{font-size:var(--font-size-base);color:var(--text-secondary);line-height:1.6}
    /* 星座配对 */
    .astro-pair{
      background:var(--bg-card);border-radius:var(--radius-card);
      padding:16px;margin-bottom:14px;box-shadow:var(--shadow-sm);
    }
    .astro-pair-title{
      font-size:var(--font-size-base);font-weight:600;color:var(--text-primary);
      margin-bottom:12px;display:flex;align-items:center;gap:6px;
    }
    .astro-pair-row{display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:12px}
    .astro-pair-sign{
      display:flex;flex-direction:column;align-items:center;gap:4px;
      min-width:64px;
    }
    .astro-pair-sign-icon{color:var(--accent-dark);display:flex}
    .astro-pair-sign-name{font-size:var(--font-size-small);color:var(--text-secondary)}
    .astro-pair-vs{
      font-size:var(--font-size-small);color:var(--text-hint);
      padding:2px 10px;border-radius:999px;
      background:color-mix(in srgb,var(--text-hint) 14%,transparent);
    }
    .astro-pair-score{
      text-align:center;font-size:28px;font-weight:700;color:var(--accent-dark);
      font-variant-numeric:tabular-nums;line-height:1;margin-bottom:6px;
    }
    .astro-pair-desc{
      text-align:center;font-size:var(--font-size-small);color:var(--text-secondary);
      line-height:1.5;
    }
    .astro-pair-pick{
      width:100%;padding:10px;border-radius:var(--radius-md);
      background:color-mix(in srgb,var(--accent-light) 40%,transparent);
      border:1px solid color-mix(in srgb,var(--accent) 24%,transparent);
      color:var(--accent-dark);font-size:var(--font-size-base);cursor:pointer;
      transition:var(--motion);
    }
    .astro-pair-pick:active{transform:scale(var(--press-scale))}
    .astro-lucky-three{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  `);

  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="astro-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">星座运势</div>
      <button class="app-header-gear" id="astro-settings" aria-label="星座设置">${createIcon('settings', 18).outerHTML}</button>
    </div>
    <div class="app-body" id="astro-body"></div>
  `;
  container.querySelector('#astro-back').addEventListener('click', () => bus.emit('router:home'));
  // 齿轮跳到设置「数据与系统」分组
  container.querySelector('#astro-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'system' } }));
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

  // 5 类运势星数
  const fortunes = {
    overall: starFrom(seed, 1),
    love:    starFrom(seed, 2),
    career:  starFrom(seed, 3),
    wealth:  starFrom(seed, 4),
    health:  starFrom(seed, 5)
  };
  const quote = QUOTES[seed % QUOTES.length];
  const color = LUCKY_COLORS[(seed >> 2) % LUCKY_COLORS.length];
  const number = ((seed >> 3) % 9) + 1; // 1-9
  const direction = LUCKY_DIRECTIONS[(seed >> 4) % LUCKY_DIRECTIONS.length];
  const sweet = SWEET_WORDS[(seed >> 5) % SWEET_WORDS.length];
  const yi = YI_POOL[(seed >> 6) % YI_POOL.length];
  const ji = JI_POOL[(seed >> 7) % JI_POOL.length];

  body.innerHTML = `
    <div class="astro-hero">
      <div class="astro-hero-top">
        <div class="astro-hero-emoji">${signIcon(sign.icon, 42)}</div>
        <div>
          <div class="astro-hero-name">${sign.name}座</div>
          <div class="astro-hero-date">${formatDate(today, { withWeek: true })} · ${escapeHTML(ELEMENT_LABELS[sign.element] || '')}</div>
        </div>
        <button class="astro-hero-switch" id="astro-switch">换一个</button>
      </div>
      <div class="astro-quote">今天的星星说……<br>${escapeHTML(quote)}</div>
    </div>

    <div class="card">
      <div class="card-title">今日运势（点一下看详情）</div>
      <div class="astro-fortune-list" id="astro-fortune-list">
        ${FORTUNE_TYPES.map((t) => fortuneRow(t.label, fortunes[t.key], t.key)).join('')}
      </div>
      <div class="astro-lucky-three">
        <div class="astro-lucky-pill">
          <div class="astro-lucky-label">幸运色</div>
          <div class="astro-lucky-value">${escapeHTML(color)}</div>
        </div>
        <div class="astro-lucky-pill">
          <div class="astro-lucky-label">幸运数字</div>
          <div class="astro-lucky-value">${number}</div>
        </div>
        <div class="astro-lucky-pill">
          <div class="astro-lucky-label">幸运方位</div>
          <div class="astro-lucky-value">${escapeHTML(direction)}</div>
        </div>
      </div>
    </div>

    <div class="astro-sweet">
      <div class="astro-sweet-icon">${createIcon('heart', 18).outerHTML}</div>
      <div class="astro-sweet-text">${escapeHTML(sweet)}</div>
    </div>

    <div class="astro-yiji">
      <div class="astro-yiji-item">
        <div class="astro-yiji-head yi">${createIcon('check', 14).outerHTML}宜</div>
        <div class="astro-yiji-text">${escapeHTML(yi)}</div>
      </div>
      <div class="astro-yiji-item">
        <div class="astro-yiji-head ji">${createIcon('close', 14).outerHTML}忌</div>
        <div class="astro-yiji-text">${escapeHTML(ji)}</div>
      </div>
    </div>

    <div class="astro-pair">
      <div class="astro-pair-title">${createIcon('heart', 16).outerHTML}星座配对</div>
      <div id="astro-pair-mount"></div>
      <button class="astro-pair-pick" id="astro-pair-pick">${createIcon('search', 16).outerHTML}换个星座配对看看</button>
    </div>

    <div class="astro-tip">运势是按星座和日期偷偷算的，每天都不一样哦<br>明天再来翻翻看嘛～</div>
  `;

  // 切换星座
  body.querySelector('#astro-switch').addEventListener('click', () => {
    openSignPicker(() => render());
  });
  // 点运势条目 → 详情
  body.querySelectorAll('.astro-fortune-row').forEach((row) => {
    row.addEventListener('click', () => {
      const key = row.dataset.key;
      if (!key) return;
      openFortuneDetail(sign, key, fortunes, seed);
    });
  });
  // 渲染配对（默认配对：自己 + 随机一个不同象星座）
  renderPair(body.querySelector('#astro-pair-mount'), sign);
  // 配对选择按钮
  body.querySelector('#astro-pair-pick').addEventListener('click', () => {
    openPairPicker(sign, body.querySelector('#astro-pair-mount'));
  });
}

function fortuneRow(label, stars, key) {
  // 实心星用 fill，空心星用 stroke（线稿）
  let html = '';
  for (let i = 0; i < 5; i++) {
    const icon = i < stars
      ? createIcon('star', 18, { fill: 'currentColor' }).outerHTML
      : `<span class="astro-star-dim">${createIcon('star', 18).outerHTML}</span>`;
    html += icon;
  }
  return `
    <div class="astro-fortune-row" data-key="${escapeAttr(key || '')}">
      <span class="astro-fortune-label">${label}</span>
      <span class="astro-stars">${html}</span>
    </div>
  `;
}

// ════════════════════════════════════════
// 运势详情（bottomSheet）
// ════════════════════════════════════════

function openFortuneDetail(sign, key, fortunes, seed) {
  const type = FORTUNE_TYPES.find((t) => t.key === key);
  if (!type) return;
  const stars = fortunes[key] || 3;
  const detail = (FORTUNE_DETAILS[key] || [])[stars - 1] || '今天顺其自然就好';
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="astro-fortune-detail">
      <div class="astro-detail-row">
        <div class="astro-detail-head">
          <span class="astro-detail-label">${escapeHTML(type.label)}运势</span>
          <span class="astro-stars">${starHTML(stars)}</span>
        </div>
        <div class="astro-detail-text">${escapeHTML(detail)}</div>
      </div>
      <div class="astro-tip" style="margin-top:8px">${escapeHTML(sign.name)}座今天的${escapeHTML(type.label)}运势就到这里啦<br>点别的运势看看嘛～</div>
    </div>
  `;
  showBottomSheet({ title: `${sign.name}座 · ${type.label}`, bodyElement: body, dismissible: true });
}

function starHTML(stars) {
  let html = '';
  for (let i = 0; i < 5; i++) {
    const icon = i < stars
      ? createIcon('star', 18, { fill: 'currentColor' }).outerHTML
      : `<span class="astro-star-dim">${createIcon('star', 18).outerHTML}</span>`;
    html += icon;
  }
  return html;
}

// ════════════════════════════════════════
// 星座配对
// ════════════════════════════════════════

// 选一个默认配对星座：优先不同象的，让结果更有意思
function pickDefaultPartner(sign) {
  const others = SIGNS.filter((s) => s.name !== sign.name);
  // 优先不同象
  const diffElement = others.filter((s) => s.element !== sign.element);
  const pool = diffElement.length > 0 ? diffElement : others;
  // 用日期做 seed 让每天配对结果稳定
  const today = new Date();
  const dateStr = formatDate(today, { full: true });
  const seed = hashStr(dateStr + sign.name + 'pair');
  return pool[seed % pool.length];
}

function pairDesc(score) {
  if (score >= 90) return '天生一对，黏在一起都不腻';
  if (score >= 80) return '很合拍，相处起来很舒服';
  if (score >= 70) return '还不错，多磨合会更好';
  if (score >= 60) return '一般般，需要互相理解';
  return '有点难，但真心可以慢慢拉近';
}

function renderPair(mountEl, sign, partner) {
  if (!mountEl) return;
  const p = partner || pickDefaultPartner(sign);
  const score = elementCompat(sign.element, p.element);
  mountEl.innerHTML = `
    <div class="astro-pair-row">
      <div class="astro-pair-sign">
        <div class="astro-pair-sign-icon">${signIcon(sign.icon, 30)}</div>
        <div class="astro-pair-sign-name">${escapeHTML(sign.name)}座</div>
      </div>
      <div class="astro-pair-vs">配对</div>
      <div class="astro-pair-sign">
        <div class="astro-pair-sign-icon">${signIcon(p.icon, 30)}</div>
        <div class="astro-pair-sign-name">${escapeHTML(p.name)}座</div>
      </div>
    </div>
    <div class="astro-pair-score">${score}%</div>
    <div class="astro-pair-desc">${escapeHTML(pairDesc(score))}</div>
  `;
}

function openPairPicker(sign, mountEl) {
  const body = document.createElement('div');
  body.innerHTML = `<div class="astro-picker-grid" id="astro-pair-grid"></div>`;
  const sheet = showBottomSheet({
    title: '选个星座配对看看',
    bodyElement: body,
    dismissible: true
  });
  const grid = body.querySelector('#astro-pair-grid');
  SIGNS.forEach((s) => {
    const btn = document.createElement('button');
    btn.className = 'astro-sign-card';
    btn.innerHTML = `
      <div class="astro-sign-emoji">${signIcon(s.icon, 30)}</div>
      <div class="astro-sign-name">${s.name}座</div>
      <div class="astro-sign-range">${escapeHTML(ELEMENT_LABELS[s.element] || '')}</div>
    `;
    btn.addEventListener('click', () => {
      sheet.close();
      renderPair(mountEl, sign, s);
      showToast(`${sign.name}座 × ${s.name}座 配对出炉`, 'success', 1200);
    });
    grid.appendChild(btn);
  });
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
function escapeAttr(s) { return escapeHTML(s); }
