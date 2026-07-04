// apps/games/index.js
// 小游戏合集 App —— 软萌少女风 PWA「泡泡」。
// 里面装着三个软乎乎的小玩具：塔罗牌 / 真心话大冒险 / 骰子。
// 数据：
//   1) 塔罗占卜历史存 STORES.tarotGame：{id, cards:[{name, reversed}], reading, createdAt}
//   2) 真心话大冒险历史存 STORES.truthGame：{id, type, question, createdAt}
//   3) 骰子不存 DB，纯即时玩法
// 红线：图标只用 SVG 线稿（createIcon），禁止任何 emoji 字符。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { STORES } from '../../core/storage-keys.js';
import { getAllDB, setDB, deleteDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, pick, shuffle, formatRelative } from '../../core/util.js';

let containerEl = null;
// 当前选中的小游戏 tab
let currentTab = 'tarot';

// ── 塔罗：22 张大阿卡那（名字 + 关键词 + 图标 + 正逆位文案）──
// 图标全部用现有 SVG 线稿，每张牌一个不同图标
const TAROT_DECK = [
  { name: '愚者', icon: 'dream', keyword: '新开始',
    upright: '像踩着云出门一样，新的旅程在等你，放心走吧',
    reversed: '太冲动啦，先深呼吸三下再出发也不迟' },
  { name: '魔术师', icon: 'gift', keyword: '创造',
    upright: '你手里已经攒齐了工具，动手就能变成魔法',
    reversed: '想得太多做得太少，今天先迈一小步嘛' },
  { name: '女祭司', icon: 'memo', keyword: '直觉',
    upright: '闭眼听听心里的声音，答案早就藏在里面啦',
    reversed: '别只凭感觉乱猜，找点证据再下结论' },
  { name: '女皇', icon: 'smile', keyword: '丰盛',
    upright: '今天会被温柔包围，记得也对自己软一点',
    reversed: '别把所有人都照顾完了，却忘了自己' },
  { name: '皇帝', icon: 'lock', keyword: '秩序',
    upright: '把今天的事排个顺序，你会稳稳拿捏',
    reversed: '太想掌控反而累，松开一点点也没关系' },
  { name: '教皇', icon: 'bell', keyword: '引导',
    upright: '遇到不懂的，找个长辈聊聊会有收获',
    reversed: '别人的规矩不一定适合你，按自己的节奏来' },
  { name: '恋人', icon: 'heart', keyword: '选择',
    upright: '心里那个人，今天可以试着靠近一点点',
    reversed: '别为了讨好谁委屈自己，先问问自己喜不喜欢' },
  { name: '战车', icon: 'next', keyword: '前进',
    upright: '方向已经定好啦，踩下油门往前冲',
    reversed: '别横冲直撞，先看看路标再走' },
  { name: '力量', icon: 'check', keyword: '勇气',
    upright: '你比想象中更勇敢，慢慢来也能驯服那头小兽',
    reversed: '别硬撑，今天允许自己躲一躲' },
  { name: '隐者', icon: 'search', keyword: '独处',
    upright: '给自己一段安静的时间，提着小灯走走',
    reversed: '一个人待太久会闷，找朋友聊两句吧' },
  { name: '命运之轮', icon: 'dice', keyword: '转机',
    upright: '风向要变啦，好事正在转过来',
    reversed: '起起伏伏是正常的，别太在意一时的高低' },
  { name: '正义', icon: 'settings', keyword: '平衡',
    upright: '之前种下的会慢慢收回来，公平得很',
    reversed: '别急着评判，先把事情看完整' },
  { name: '倒吊人', icon: 'download', keyword: '换角度',
    upright: '换个角度看，困住你的地方其实有出口',
    reversed: '别瞎牺牲，值不值得先想清楚' },
  { name: '死神', icon: 'close', keyword: '转变',
    upright: '旧的一页翻过去啦，新故事要开始了',
    reversed: '该放下的还攥着，手会疼的' },
  { name: '节制', icon: 'minus', keyword: '调和',
    upright: '把不同的东西混一混，会有刚刚好的味道',
    reversed: '别走极端，今天多一分少一分都不舒服' },
  { name: '恶魔', icon: 'wallet', keyword: '执念',
    upright: '看清那条拴着你的链子，其实一直能解开',
    reversed: '别被小欲望牵着走，停一下再决定' },
  { name: '高塔', icon: 'weather', keyword: '突变',
    upright: '旧架子要晃一晃，别怕，拆了才能重建',
    reversed: '压着的事快兜不住了，主动处理比较好' },
  { name: '星星', icon: 'star', keyword: '希望',
    upright: '许个小愿吧，星星都偷偷记下来了',
    reversed: '别灰心，云后面一直有光' },
  { name: '月亮', icon: 'moon', keyword: '梦境',
    upright: '今晚的梦可能有点意思，醒来记一记',
    reversed: '别被莫名的害怕吓到，看清就没那么可怕' },
  { name: '太阳', icon: 'sun', keyword: '明朗',
    upright: '今天整个人都亮亮的，去晒晒也好',
    reversed: '别太嗨，留点力气给晚上' },
  { name: '审判', icon: 'volume', keyword: '召唤',
    upright: '有个声音在叫你啦，是时候回应一下',
    reversed: '别老等别人判决，自己给自己一个答案' },
  { name: '世界', icon: 'home', keyword: '圆满',
    upright: '这一段要走完啦，可以好好抱抱自己',
    reversed: '还差最后一口气，别在终点前松手' }
];

// 综合解读贴心话库
const TAROT_READINGS = [
  '三张牌连起来看，今天记得对自己温柔一点呀',
  '牌面说，今天的你正在慢慢变好，别急',
  '让心里的光带着你走，今天不会太糟的',
  '今天的种种小情绪都值得被好好接住',
  '慢慢来比较快，今天的不安会一点点散开',
  '牌面偷偷说，今晚会有一个安稳的觉',
  '今天的你比昨天多懂了一点点自己，这就够啦'
];

// ── 真心话 / 大冒险 题库 ──
const TRUTH_QUESTIONS = [
  '最近一次说谎是什么时候',
  '最怕什么',
  '最想对谁说一句什么话',
  '心里最藏不住的小秘密',
  '最近一次哭是为了什么',
  '最让你后悔的一件事',
  '最想回到哪个时刻',
  '偷偷喜欢过谁',
  '最受不了自己哪一点',
  '最想被怎样夸',
  '最近一次心动是什么时候',
  '最想删掉的一段记忆',
  '手机里最不想让人看到的是什么',
  '最想对谁说一句对不起',
  '此刻最想见的一个人是谁'
];

const DARE_QUESTIONS = [
  '给最近联系人发一句晚安',
  '唱一首歌的副歌部分',
  '学猫叫三声',
  '给一个朋友发“我想你”',
  '做十个深蹲',
  '用撒娇语气说一句“人家想要抱抱”',
  '闭上眼转三圈再走十步',
  '把头像换成小动物十分钟',
  '给妈妈发一句“我爱你”',
  '大声喊一句“今天我最棒”',
  '模仿一个朋友的口头禅',
  '一口气喝完一杯水',
  '对着镜子夸自己一分钟',
  '发一条朋友圈只说“嗯”',
  '给身边的人一个拥抱'
];

injectStyle('app-games-style', `
  .games-tabs{
    display:flex;gap:8px;margin-bottom:16px;
    overflow-x:auto;-webkit-overflow-scrolling:touch;
    padding-bottom:2px;scrollbar-width:none;
  }
  .games-tabs::-webkit-scrollbar{display:none;}
  .games-tab{
    flex-shrink:0;padding:9px 18px;border-radius:999px;
    background:color-mix(in srgb,var(--bg-secondary) 70%,transparent);
    color:var(--text-secondary);font-size:var(--font-size-base);
    font-weight:500;border:none;cursor:pointer;transition:var(--motion);
    display:inline-flex;align-items:center;gap:6px;
  }
  .games-tab:active{transform:scale(var(--press-scale));}
  .games-tab.active{
    background:var(--accent);color:var(--bubble-user-text);
    box-shadow:var(--shadow-sm);
  }
  .games-tab .popo-icon{display:inline-flex;}

  /* 塔罗 */
  .tarot-action{margin-bottom:16px;display:flex;gap:10px;flex-wrap:wrap;}
  .tarot-cards{display:flex;gap:10px;margin-bottom:14px;}
  .tarot-card{
    flex:1;min-width:0;background:var(--bg-card);
    border-radius:var(--radius-card);padding:14px 8px;
    box-shadow:var(--shadow-sm);text-align:center;
    border:1px solid color-mix(in srgb,var(--text-hint) 14%,transparent);
    transition:var(--motion);
  }
  .tarot-card.reversed{background:color-mix(in srgb,var(--accent-light) 35%,var(--bg-card));}
  .tarot-card-icon{
    color:var(--accent-dark);display:flex;justify-content:center;
    margin-bottom:6px;line-height:1;
  }
  .tarot-card-name{font-size:var(--font-size-base);font-weight:600;color:var(--text-primary);}
  .tarot-card-pos{
    font-size:var(--font-size-small);color:var(--accent-dark);
    margin-top:2px;font-weight:500;
  }
  .tarot-card-keyword{
    font-size:var(--font-size-small);color:var(--text-hint);margin-top:2px;
  }
  .tarot-meaning{
    background:var(--bg-card);border-radius:var(--radius-card);
    padding:14px 16px;margin-bottom:10px;box-shadow:var(--shadow-sm);
  }
  .tarot-meaning-title{
    font-size:var(--font-size-small);color:var(--text-secondary);
    font-weight:600;margin-bottom:4px;
  }
  .tarot-meaning-text{font-size:var(--font-size-base);color:var(--text-primary);line-height:1.55;}
  .tarot-reading{
    background:linear-gradient(135deg,var(--accent) 0%,var(--accent-dark) 100%);
    color:var(--bubble-user-text);border-radius:var(--radius-card);
    padding:16px 18px;margin-bottom:18px;box-shadow:var(--shadow-md);
    font-size:var(--font-size-base);line-height:1.6;
  }
  .tarot-reading-label{font-size:var(--font-size-small);opacity:.85;margin-bottom:4px;}

  /* 真心话 */
  .truth-actions{display:flex;gap:10px;margin-bottom:16px;}
  .truth-btn{
    flex:1;padding:14px 12px;border-radius:var(--radius-card);
    background:var(--bg-card);border:1px solid color-mix(in srgb,var(--text-hint) 18%,transparent);
    color:var(--text-primary);font-size:var(--font-size-base);font-weight:600;
    cursor:pointer;transition:var(--motion);
    display:flex;flex-direction:column;align-items:center;gap:6px;
  }
  .truth-btn:active{transform:scale(var(--press-scale));}
  .truth-btn.truth{color:var(--accent-dark);}
  .truth-btn.dare{color:#E8888C;}
  .truth-btn .popo-icon{display:flex;}
  .truth-card{
    background:var(--bg-card);border-radius:var(--radius-card);
    padding:22px 18px;margin-bottom:14px;box-shadow:var(--shadow-sm);
    text-align:center;
  }
  .truth-card-label{
    font-size:var(--font-size-small);color:var(--text-hint);
    margin-bottom:8px;display:flex;align-items:center;justify-content:center;gap:6px;
  }
  .truth-card-q{font-size:var(--font-size-title);font-weight:600;color:var(--text-primary);line-height:1.5;}
  .truth-card-actions{margin-top:14px;display:flex;justify-content:center;gap:8px;}

  /* 骰子 */
  .dice-area{
    background:var(--bg-card);border-radius:var(--radius-card);
    padding:28px 18px;margin-bottom:14px;box-shadow:var(--shadow-sm);
    text-align:center;
  }
  .dice-row{display:flex;justify-content:center;gap:18px;flex-wrap:wrap;}
  .dice-block{
    display:flex;flex-direction:column;align-items:center;gap:8px;
  }
  .dice-icon-wrap{
    width:84px;height:84px;border-radius:var(--radius-card);
    background:color-mix(in srgb,var(--accent-light) 40%,transparent);
    display:flex;align-items:center;justify-content:center;
    color:var(--accent-dark);
  }
  .dice-icon-wrap.rolling{animation:diceShake .4s ease-in-out infinite;}
  @keyframes diceShake{
    0%,100%{transform:rotate(0) translateY(0);}
    25%{transform:rotate(-12deg) translateY(-4px);}
    75%{transform:rotate(12deg) translateY(-2px);}
  }
  .dice-number{font-size:36px;font-weight:700;color:var(--text-primary);line-height:1;font-variant-numeric:tabular-nums;}
  .dice-label{font-size:var(--font-size-small);color:var(--text-hint);}
  .dice-sum{
    margin-top:18px;font-size:var(--font-size-base);color:var(--text-secondary);
  }
  .dice-sum b{color:var(--accent-dark);font-size:var(--font-size-title);}
  .dice-controls{display:flex;justify-content:center;gap:10px;margin-top:18px;flex-wrap:wrap;}

  /* 通用历史列表 */
  .games-history-title{
    font-size:var(--font-size-small);color:var(--text-secondary);
    margin:6px 2px 10px;font-weight:600;
  }
  .games-history-item{
    background:var(--bg-card);border-radius:var(--radius-card);
    padding:12px 14px;margin-bottom:10px;box-shadow:var(--shadow-sm);
    display:flex;align-items:flex-start;gap:10px;
  }
  .games-history-main{flex:1;min-width:0;}
  .games-history-top{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
  .games-history-tag{
    font-size:var(--font-size-small);color:var(--accent-dark);
    background:color-mix(in srgb,var(--accent-light) 50%,transparent);
    padding:1px 8px;border-radius:999px;font-weight:500;
  }
  .games-history-tag.dare{color:#E8888C;background:color-mix(in srgb,#E8888C 18%,transparent);}
  .games-history-time{font-size:var(--font-size-small);color:var(--text-hint);}
  .games-history-text{font-size:var(--font-size-base);color:var(--text-primary);margin-top:4px;line-height:1.5;}
  .games-history-cards{
    display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;
    font-size:var(--font-size-small);color:var(--text-secondary);
  }
  .games-history-cards span{
    background:color-mix(in srgb,var(--bg-secondary) 70%,transparent);
    padding:2px 8px;border-radius:999px;
  }
  .games-history-del{
    width:30px;height:30px;border-radius:50%;flex-shrink:0;
    background:transparent;color:var(--text-hint);border:none;
    display:flex;align-items:center;justify-content:center;transition:var(--motion);
  }
  .games-history-del:active{transform:scale(var(--press-scale));}
  .games-empty-icon{opacity:.5;margin-bottom:12px;color:var(--text-hint);}
  @media (prefers-reduced-motion:reduce){
    .dice-icon-wrap.rolling{animation:none!important;}
  }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  currentTab = 'tarot';
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="games-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">小游戏</div>
      <span style="width:36px"></span>
    </div>
    <div class="app-body" id="games-body"></div>
  `;
  container.querySelector('#games-back').addEventListener('click', () => bus.emit('router:home'));
  render();
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 主体渲染
// ════════════════════════════════════════

function render() {
  if (!containerEl) return;
  const body = containerEl.querySelector('#games-body');
  if (!body) return;
  body.innerHTML = `
    <div class="games-tabs" id="games-tabs">
      <button class="games-tab ${currentTab === 'tarot' ? 'active' : ''}" data-tab="tarot">${createIcon('dream', 16).outerHTML}塔罗牌</button>
      <button class="games-tab ${currentTab === 'truth' ? 'active' : ''}" data-tab="truth">${createIcon('chat', 16).outerHTML}真心话</button>
      <button class="games-tab ${currentTab === 'dice' ? 'active' : ''}" data-tab="dice">${createIcon('dice', 16).outerHTML}骰子</button>
    </div>
    <div id="games-content"></div>
  `;
  body.querySelectorAll('.games-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      render();
    });
  });
  const content = body.querySelector('#games-content');
  if (currentTab === 'tarot') renderTarot(content);
  else if (currentTab === 'truth') renderTruth(content);
  else if (currentTab === 'dice') renderDice(content);
}

// ════════════════════════════════════════
// 1) 塔罗牌占卜
// ════════════════════════════════════════

function renderTarot(content) {
  content.innerHTML = `
    <div class="tarot-action">
      <button class="btn primary block" id="tarot-draw">${createIcon('shuffle', 0).outerHTML ? '' : ''}洗牌抽三张</button>
    </div>
    <div id="tarot-result"></div>
    <div class="games-history-title">占卜记录</div>
    <div id="tarot-history"></div>
  `;
  // 注意：上面 icon 占位是避免空字符串拼接报错，按钮文案是“洗牌抽三张”
  content.querySelector('#tarot-draw').addEventListener('click', drawTarot);
  renderTarotHistory(content.querySelector('#tarot-history'));
}

async function drawTarot() {
  const resultEl = containerEl?.querySelector('#tarot-result');
  if (!resultEl) return;
  // 洗牌后抽 3 张，每张随机正逆位
  const drawn = shuffle(TAROT_DECK).slice(0, 3).map((card) => ({
    name: card.name,
    icon: card.icon,
    keyword: card.keyword,
    upright: card.upright,
    reversed: card.reversed,
    reversed: Math.random() < 0.5
  }));
  const reading = pick(TAROT_READINGS) || TAROT_READINGS[0];
  resultEl.innerHTML = `
    <div class="tarot-cards">
      ${drawn.map((c) => `
        <div class="tarot-card ${c.reversed ? 'reversed' : ''}">
          <div class="tarot-card-icon">${createIcon(c.icon, 30).outerHTML}</div>
          <div class="tarot-card-name">${escapeHTML(c.name)}</div>
          <div class="tarot-card-pos">${c.reversed ? '逆位' : '正位'}</div>
          <div class="tarot-card-keyword">${escapeHTML(c.keyword)}</div>
        </div>
      `).join('')}
    </div>
    ${drawn.map((c) => `
      <div class="tarot-meaning">
        <div class="tarot-meaning-title">${escapeHTML(c.name)} · ${c.reversed ? '逆位' : '正位'}</div>
        <div class="tarot-meaning-text">${escapeHTML(c.reversed ? c.reversed : c.upright)}</div>
      </div>
    `).join('')}
    <div class="tarot-reading">
      <div class="tarot-reading-label">综合解读</div>
      ${escapeHTML(reading)}
    </div>
  `;
  // 存历史：只存 name + reversed
  const record = {
    id: generateId('tarot'),
    cards: drawn.map((c) => ({ name: c.name, reversed: c.reversed })),
    reading,
    createdAt: getNow()
  };
  try {
    await setDB(STORES.tarotGame, record.id, record);
    const histEl = containerEl?.querySelector('#tarot-history');
    if (histEl) renderTarotHistory(histEl);
  } catch (e) {
    console.warn('[games] 塔罗历史写入失败', e);
  }
}

async function renderTarotHistory(el) {
  let list = [];
  try {
    list = await getAllDB(STORES.tarotGame);
  } catch (e) {
    console.warn('[games] 读取塔罗历史失败', e);
  }
  list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  if (list.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="games-empty-icon">${createIcon('dream', 48).outerHTML}</div>
        <div class="empty-state-text">让塔罗牌偷偷告诉你今天的事</div>
      </div>
    `;
    return;
  }
  el.innerHTML = list.map((r) => `
    <div class="games-history-item" data-id="${escapeAttr(r.id)}">
      <div class="games-history-main">
        <div class="games-history-top">
          <span class="games-history-time">${escapeHTML(formatRelative(r.createdAt))}</span>
        </div>
        <div class="games-history-cards">
          ${(r.cards || []).map((c) => `<span>${escapeHTML(c.name)}${c.reversed ? '·逆' : '·正'}</span>`).join('')}
        </div>
        <div class="games-history-text">${escapeHTML(r.reading || '')}</div>
      </div>
      <button class="games-history-del" data-del="${escapeAttr(r.id)}" aria-label="删除">${createIcon('trash', 16).outerHTML}</button>
    </div>
  `).join('');
  el.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.del;
      try {
        await deleteDB(STORES.tarotGame, id);
        showToast('删掉啦', 'default', 1000);
        renderTarotHistory(el);
      } catch (e) {
        showToast('没删掉，再试一下嘛', 'error');
      }
    });
  });
}

// ════════════════════════════════════════
// 2) 真心话大冒险
// ════════════════════════════════════════

function renderTruth(content) {
  content.innerHTML = `
    <div class="truth-actions">
      <button class="truth-btn truth" id="truth-truth">
        ${createIcon('chat', 24).outerHTML}
        <span>真心话</span>
      </button>
      <button class="truth-btn dare" id="truth-dare">
        ${createIcon('gift', 24).outerHTML}
        <span>大冒险</span>
      </button>
    </div>
    <div id="truth-card"></div>
    <div class="games-history-title">游戏记录</div>
    <div id="truth-history"></div>
  `;
  content.querySelector('#truth-truth').addEventListener('click', () => drawTruth('truth'));
  content.querySelector('#truth-dare').addEventListener('click', () => drawTruth('dare'));
  renderTruthHistory(content.querySelector('#truth-history'));
}

async function drawTruth(type) {
  const cardEl = containerEl?.querySelector('#truth-card');
  if (!cardEl) return;
  const pool = type === 'dare' ? DARE_QUESTIONS : TRUTH_QUESTIONS;
  const question = pick(pool) || pool[0];
  const label = type === 'dare' ? '大冒险' : '真心话';
  cardEl.innerHTML = `
    <div class="truth-card">
      <div class="truth-card-label">
        ${createIcon(type === 'dare' ? 'gift' : 'chat', 16).outerHTML}
        <span>${label}</span>
      </div>
      <div class="truth-card-q">${escapeHTML(question)}</div>
      <div class="truth-card-actions">
        <button class="btn ghost" id="truth-change">${createIcon('next', 16).outerHTML}换一题</button>
      </div>
    </div>
  `;
  cardEl.querySelector('#truth-change').addEventListener('click', () => drawTruth(type));
  // 存历史
  const record = {
    id: generateId('truth'),
    type,
    question,
    createdAt: getNow()
  };
  try {
    await setDB(STORES.truthGame, record.id, record);
    const histEl = containerEl?.querySelector('#truth-history');
    if (histEl) renderTruthHistory(histEl);
  } catch (e) {
    console.warn('[games] 真心话历史写入失败', e);
  }
}

async function renderTruthHistory(el) {
  let list = [];
  try {
    list = await getAllDB(STORES.truthGame);
  } catch (e) {
    console.warn('[games] 读取真心话历史失败', e);
  }
  list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  if (list.length === 0) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="games-empty-icon">${createIcon('chat', 48).outerHTML}</div>
        <div class="empty-state-text">还没有玩过，点上面挑一个嘛</div>
      </div>
    `;
    return;
  }
  el.innerHTML = list.map((r) => {
    const isDare = r.type === 'dare';
    const tag = isDare ? '大冒险' : '真心话';
    return `
      <div class="games-history-item">
        <div class="games-history-main">
          <div class="games-history-top">
            <span class="games-history-tag ${isDare ? 'dare' : ''}">${tag}</span>
            <span class="games-history-time">${escapeHTML(formatRelative(r.createdAt))}</span>
          </div>
          <div class="games-history-text">${escapeHTML(r.question || '')}</div>
        </div>
        <button class="games-history-del" data-del="${escapeAttr(r.id)}" aria-label="删除">${createIcon('trash', 16).outerHTML}</button>
      </div>
    `;
  }).join('');
  el.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.del;
      try {
        await deleteDB(STORES.truthGame, id);
        showToast('删掉啦', 'default', 1000);
        renderTruthHistory(el);
      } catch (e) {
        showToast('没删掉，再试一下嘛', 'error');
      }
    });
  });
}

// ════════════════════════════════════════
// 3) 骰子
// ════════════════════════════════════════

let diceCount = 1;       // 1 或 2 颗
let diceValues = [1];    // 当前点数
let diceRolling = false;

function renderDice(content) {
  content.innerHTML = `
    <div class="dice-area">
      <div class="dice-row" id="dice-row">${renderDiceBlocks()}</div>
      ${diceCount === 2 ? `
        <div class="dice-sum">点数和：<b>${diceValues.reduce((a, b) => a + b, 0)}</b></div>
      ` : ''}
      <div class="dice-controls">
        <div class="games-tabs" style="margin:0;padding:0;overflow:visible;">
          <button class="games-tab ${diceCount === 1 ? 'active' : ''}" id="dice-c1">1 颗</button>
          <button class="games-tab ${diceCount === 2 ? 'active' : ''}" id="dice-c2">2 颗</button>
        </div>
        <button class="btn primary" id="dice-roll">${createIcon('dice', 18).outerHTML}掷骰子</button>
      </div>
    </div>
    <div class="games-history-title">说明</div>
    <div class="card">
      <div class="card-row">
        <span class="card-row-label">玩法</span>
        <span class="card-row-value">点掷骰子，看小点点怎么落</span>
      </div>
      <div class="card-row">
        <span class="card-row-label">2 颗</span>
        <span class="card-row-value">显示两颗点数和</span>
      </div>
    </div>
  `;
  content.querySelector('#dice-c1').addEventListener('click', () => {
    if (diceCount === 1) return;
    diceCount = 1;
    diceValues = [1];
    renderDice(content);
  });
  content.querySelector('#dice-c2').addEventListener('click', () => {
    if (diceCount === 2) return;
    diceCount = 2;
    diceValues = [1, 1];
    renderDice(content);
  });
  content.querySelector('#dice-roll').addEventListener('click', () => rollDice(content));
}

function renderDiceBlocks(rolling = false) {
  return diceValues.map((v, i) => `
    <div class="dice-block">
      <div class="dice-icon-wrap ${rolling ? 'rolling' : ''}">${createIcon('dice', 60).outerHTML}</div>
      <div class="dice-number">${rolling ? '?' : v}</div>
      <div class="dice-label">${diceCount === 2 ? `第 ${i + 1} 颗` : '点数'}</div>
    </div>
  `).join('');
}

async function rollDice(content) {
  if (diceRolling) return;
  diceRolling = true;
  const row = content.querySelector('#dice-row');
  // 摇晃阶段：先转一会儿显示问号
  if (row) row.innerHTML = renderDiceBlocks(true);
  // 摇 5 下，每下随机一个假点数，制造跳动效果
  const ticks = 5;
  for (let i = 0; i < ticks; i++) {
    await sleep(90);
    diceValues = diceValues.map(() => Math.floor(Math.random() * 6) + 1);
    if (row) row.innerHTML = renderDiceBlocks(true);
  }
  // 最终落点
  diceValues = diceValues.map(() => Math.floor(Math.random() * 6) + 1);
  diceRolling = false;
  // 重新渲染整块（含点数和）
  renderDice(content);
  const sum = diceValues.reduce((a, b) => a + b, 0);
  showToast(`掷出 ${diceCount === 2 ? `点数和 ${sum}` : sum}`, 'default', 1000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) { return escapeHTML(s); }
