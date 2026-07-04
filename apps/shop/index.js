// apps/shop/index.js
// 商店 App——把心意买下来送给她。
// 功能：
//   1) 8-10 个虚拟商品写死在文件里（礼物/装饰/食物），图标全用现有 SVG 线稿名
//   2) 顶部金币余额（读 KEYS.walletState.balance）+ 充值按钮（点一次 +100）
//   3) 商品网格 2 列：图标 + 名字 + 描述 + 价格 + 购买按钮
//   4) 购买：余额够则扣款（写一条 expense 交易到 walletState，保持与钱包一致）
//      + 存 STORES.inventory + toast；不够则 showAlert 提示
//   5) 底部"我的背包"入口：bottomSheet 列已购物品，可"送给她"或丢弃（confirm）
//   6) 分类筛选：全部/礼物/装饰/食物
//   7) 全中文注释 + 第一人称软萌文案，所有图标走 createIcon（SVG 线稿，无 emoji）
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, setData, setDB, deleteDB, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon, showAlert } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, formatRelative } from '../../core/util.js';

let containerEl = null;
let currentFilter = '全部';

// 商品清单（虚拟商品，送给初一或自己用）
const PRODUCTS = [
  { id: 'cake',          name: '草莓蛋糕',     desc: '甜甜的，她会很开心',   price: 50,  icon: 'heart',  category: '礼物' },
  { id: 'star_lamp',     name: '星星灯',       desc: '夜里陪着她做梦',       price: 80,  icon: 'star',   category: '装饰' },
  { id: 'gift_box',      name: '神秘礼盒',     desc: '拆开才知道里面是什么', price: 120, icon: 'gift',   category: '礼物' },
  { id: 'film_camera',   name: '小相机',       desc: '记下你们的每个瞬间',   price: 200, icon: 'camera', category: '装饰' },
  { id: 'dream_catcher', name: '捕梦网',       desc: '把噩梦都兜走啦',       price: 90,  icon: 'dream',  category: '装饰' },
  { id: 'smile_cookie',  name: '笑脸饼干',     desc: '咬一口就开心起来',     price: 30,  icon: 'smile',  category: '食物' },
  { id: 'moon_tea',      name: '月光茶',       desc: '晚上喝一杯暖暖的',     price: 40,  icon: 'moon',   category: '食物' },
  { id: 'sun_lolly',     name: '太阳冰棍',     desc: '夏天的味道',           price: 25,  icon: 'sun',    category: '食物' },
  { id: 'bell_bracelet', name: '小铃铛手链',   desc: '走起路来叮叮响',       price: 150, icon: 'bell',   category: '礼物' },
  { id: 'home_keychain', name: '小房子钥匙扣', desc: '回家的钥匙有了伴',     price: 60,  icon: 'home',   category: '装饰' }
];
const FILTERS = ['全部', '礼物', '装饰', '食物'];
const RECHARGE_AMOUNT = 100;

injectStyle('app-shop-style', `
  .shop-balance{
    display:flex; align-items:center; gap:12px;
    background:linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
    color:var(--bubble-user-text);
    border-radius:var(--radius-card);
    padding:16px 18px;
    box-shadow:var(--shadow-md);
    margin-bottom:14px;
  }
  .shop-balance-icon{
    width:40px; height:40px; border-radius:50%;
    background:color-mix(in srgb, var(--bubble-user-text) 22%, transparent);
    display:flex; align-items:center; justify-content:center;
    flex-shrink:0;
  }
  .shop-balance-main{ flex:1; min-width:0; }
  .shop-balance-label{
    font-size:var(--font-size-small);
    color:color-mix(in srgb, var(--bubble-user-text) 78%, transparent);
  }
  .shop-balance-value{
    font-size:var(--font-size-title);
    font-weight:700;
    line-height:1.1;
    margin-top:2px;
    word-break:break-all;
  }
  .shop-recharge{
    padding:8px 14px;
    border-radius:var(--radius-md);
    background:color-mix(in srgb, var(--bubble-user-text) 24%, transparent);
    color:var(--bubble-user-text);
    font-size:var(--font-size-small);
    font-weight:600;
    display:flex; align-items:center; gap:4px;
    transition:var(--motion);
    flex-shrink:0;
  }
  .shop-recharge:active{ transform:scale(var(--press-scale)); }
  .shop-filters{
    display:flex; gap:8px; margin-bottom:14px;
    overflow-x:auto; -webkit-overflow-scrolling:touch;
    padding-bottom:2px;
  }
  .shop-filter{
    padding:7px 14px;
    border-radius:var(--radius-md);
    background:color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    color:var(--text-secondary);
    font-size:var(--font-size-small);
    border:1px solid transparent;
    white-space:nowrap;
    transition:var(--motion);
  }
  .shop-filter:active{ transform:scale(var(--press-scale)); }
  .shop-filter.active{
    background:color-mix(in srgb, var(--accent) 18%, transparent);
    color:var(--accent);
    border-color:var(--accent);
  }
  .shop-grid{
    display:grid;
    grid-template-columns:repeat(2, 1fr);
    gap:12px;
    margin-bottom:16px;
  }
  .shop-card{
    background:var(--bg-card);
    border-radius:var(--radius-card);
    padding:14px;
    box-shadow:var(--shadow-sm);
    display:flex; flex-direction:column;
    transition:var(--motion);
  }
  .shop-card:active{ transform:scale(var(--press-scale)); }
  .shop-card-icon{
    width:48px; height:48px; border-radius:var(--radius-md);
    background:color-mix(in srgb, var(--accent) 14%, transparent);
    color:var(--accent);
    display:flex; align-items:center; justify-content:center;
    margin-bottom:10px;
  }
  .shop-card-name{
    font-size:var(--font-size-base);
    font-weight:600;
    color:var(--text-primary);
    line-height:1.3;
    margin-bottom:4px;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .shop-card-desc{
    font-size:var(--font-size-small);
    color:var(--text-secondary);
    line-height:1.4;
    flex:1;
    margin-bottom:10px;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
    overflow:hidden;
  }
  .shop-card-foot{
    display:flex; align-items:center; justify-content:space-between; gap:8px;
  }
  .shop-card-price{
    font-size:var(--font-size-base);
    font-weight:700;
    color:var(--accent);
  }
  .shop-buy{
    padding:6px 12px;
    border-radius:var(--radius-sm);
    background:var(--accent);
    color:var(--bubble-user-text);
    font-size:var(--font-size-small);
    font-weight:600;
    display:flex; align-items:center; gap:3px;
    transition:var(--motion);
  }
  .shop-buy:active{ transform:scale(var(--press-scale)); }
  .shop-bag-entry{
    width:100%;
    padding:14px;
    border-radius:var(--radius-card);
    background:var(--bg-card);
    box-shadow:var(--shadow-sm);
    color:var(--text-primary);
    font-size:var(--font-size-base);
    font-weight:500;
    display:flex; align-items:center; justify-content:center; gap:8px;
    transition:var(--motion);
  }
  .shop-bag-entry:active{ transform:scale(var(--press-scale)); }
  .shop-bag-empty-icon{ color:var(--text-hint); opacity:0.5; margin-bottom:10px; }
  .shop-bag-item{
    display:flex; align-items:center; gap:12px;
    padding:12px 0;
    border-bottom:1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
  }
  .shop-bag-item:last-child{ border-bottom:0; }
  .shop-bag-icon{
    width:38px; height:38px; border-radius:var(--radius-sm);
    background:color-mix(in srgb, var(--accent) 14%, transparent);
    color:var(--accent);
    display:flex; align-items:center; justify-content:center;
    flex-shrink:0;
  }
  .shop-bag-main{ flex:1; min-width:0; }
  .shop-bag-name{
    font-size:var(--font-size-base);
    font-weight:500;
    color:var(--text-primary);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .shop-bag-time{
    font-size:var(--font-size-small);
    color:var(--text-hint);
    margin-top:2px;
  }
  .shop-bag-actions{ display:flex; gap:6px; flex-shrink:0; }
  .shop-bag-btn{
    padding:6px 10px;
    border-radius:var(--radius-sm);
    font-size:var(--font-size-small);
    font-weight:500;
    display:flex; align-items:center; gap:3px;
    transition:var(--motion);
  }
  .shop-bag-btn:active{ transform:scale(var(--press-scale)); }
  .shop-bag-btn.gift{ background:var(--accent); color:var(--bubble-user-text); }
  .shop-bag-btn.drop{ background:color-mix(in srgb, var(--text-hint) 22%, transparent); color:var(--text-secondary); }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  currentFilter = '全部';
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="shop-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">小心意商店</div>
      <button class="app-add" id="shop-bag-btn" aria-label="我的背包">${createIcon('gift', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="shop-body"></div>
  `;
  container.querySelector('#shop-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#shop-bag-btn').addEventListener('click', () => openBackpack());
  await render();
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 钱包读写（与 wallet App 共享 KEYS.walletState，余额始终以交易为准）
// ════════════════════════════════════════

function readWallet() {
  const s = getData(KEYS.walletState, null);
  if (!s || typeof s !== 'object') return { balance: 0, transactions: [] };
  if (!Array.isArray(s.transactions)) s.transactions = [];
  s.balance = recomputeBalance(s.transactions);
  return s;
}
function writeWallet(state) {
  state.balance = recomputeBalance(state.transactions);
  setData(KEYS.walletState, state);
}
function recomputeBalance(transactions) {
  return transactions.reduce((sum, t) => {
    const amt = Number(t.amount) || 0;
    return sum + (t.type === 'income' ? amt : -amt);
  }, 0);
}
function pushWalletTransaction(tx) {
  const s = readWallet();
  s.transactions.push(tx);
  writeWallet(s);
}

// ════════════════════════════════════════
// 渲染
// ════════════════════════════════════════

async function render() {
  const bodyEl = containerEl?.querySelector('#shop-body');
  if (!bodyEl) return;
  const wallet = readWallet();
  const balance = wallet.balance;
  const list = currentFilter === '全部'
    ? PRODUCTS
    : PRODUCTS.filter((p) => p.category === currentFilter);
  bodyEl.innerHTML = `
    <div class="shop-balance">
      <div class="shop-balance-icon">${createIcon('wallet', 20).outerHTML}</div>
      <div class="shop-balance-main">
        <div class="shop-balance-label">我的金币</div>
        <div class="shop-balance-value">${formatCoins(balance)}</div>
      </div>
      <button class="shop-recharge" id="shop-recharge" aria-label="充值">${createIcon('plus', 16).outerHTML}充值</button>
    </div>
    <div class="shop-filters">
      ${FILTERS.map((f) => `<button class="shop-filter ${f === currentFilter ? 'active' : ''}" data-filter="${escapeAttr(f)}">${escapeHTML(f)}</button>`).join('')}
    </div>
    <div class="shop-grid" id="shop-grid">
      ${list.map(renderProductCard).join('')}
    </div>
    <button class="shop-bag-entry" id="shop-bag-entry">${createIcon('gift', 18).outerHTML}我的背包</button>
  `;
  bodyEl.querySelector('#shop-recharge').addEventListener('click', () => {
    pushWalletTransaction({
      id: generateId('tx'),
      type: 'income',
      amount: RECHARGE_AMOUNT,
      note: '充值零花钱',
      category: '红包',
      createdAt: getNow()
    });
    showToast('零花钱到账啦', 'success', 1200);
    render();
  });
  bodyEl.querySelectorAll('.shop-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      render();
    });
  });
  bodyEl.querySelectorAll('.shop-buy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const p = PRODUCTS.find((x) => x.id === id);
      if (p) tryBuy(p);
    });
  });
  bodyEl.querySelector('#shop-bag-entry').addEventListener('click', () => openBackpack());
}

function renderProductCard(p) {
  return `
    <div class="shop-card">
      <div class="shop-card-icon">${createIcon(p.icon, 26).outerHTML}</div>
      <div class="shop-card-name">${escapeHTML(p.name)}</div>
      <div class="shop-card-desc">${escapeHTML(p.desc)}</div>
      <div class="shop-card-foot">
        <span class="shop-card-price">${formatCoins(p.price)}</span>
        <button class="shop-buy" data-id="${escapeAttr(p.id)}" aria-label="购买${escapeAttr(p.name)}">${createIcon('plus', 14).outerHTML}购买</button>
      </div>
    </div>
  `;
}

function formatCoins(n) {
  const num = Math.round(Number(n) || 0);
  return String(num);
}

// ════════════════════════════════════════
// 购买
// ════════════════════════════════════════

async function tryBuy(product) {
  const wallet = readWallet();
  if (wallet.balance < product.price) {
    showAlert({
      title: '金币不够嘛',
      body: '去充值或者记账攒一点再来吧',
      okText: '知道啦'
    });
    return;
  }
  // 扣款（写一条 expense 交易到 walletState，保持与钱包余额一致）
  pushWalletTransaction({
    id: generateId('tx'),
    type: 'expense',
    amount: product.price,
    note: `买下${product.name}`,
    category: '购物',
    createdAt: getNow()
  });
  // 入库存档
  const invId = generateId('inv');
  try {
    await setDB(STORES.inventory, invId, {
      id: invId,
      itemId: product.id,
      name: product.name,
      icon: product.icon,
      boughtAt: getNow()
    });
  } catch (e) {
    // 入库失败则把扣款回滚
    console.warn('[shop] 入库失败', e);
    pushWalletTransaction({
      id: generateId('tx'),
      type: 'income',
      amount: product.price,
      note: `退回${product.name}`,
      category: '购物',
      createdAt: getNow()
    });
    showToast('没买成功，再试一下嘛', 'error');
    render();
    return;
  }
  showToast('买好啦，送给她吧', 'success', 1400);
  render();
}

// ════════════════════════════════════════
// 背包（bottomSheet）
// ════════════════════════════════════════

async function openBackpack() {
  let items = [];
  try {
    items = await getAllDB(STORES.inventory);
  } catch (e) {
    console.warn('[shop] 读取背包失败', e);
    showToast('背包打不开嘛，等一下再试', 'error');
    return;
  }
  items.sort((a, b) => {
    const ta = new Date(a.boughtAt || a.createdAt || 0).getTime();
    const tb = new Date(b.boughtAt || b.createdAt || 0).getTime();
    return tb - ta;
  });
  const body = document.createElement('div');
  const sheet = showBottomSheet({
    title: '我的背包',
    bodyElement: body,
    dismissible: true
  });
  renderBagBody(body, items, sheet);
  return sheet;
}

function renderBagBody(body, items, sheet) {
  if (!items || items.length === 0) {
    body.innerHTML = `
      <div class="empty-state" style="padding:32px 12px">
        <div class="shop-bag-empty-icon">${createIcon('gift', 48).outerHTML}</div>
        <div class="empty-state-text">还没有买过东西呢</div>
      </div>
    `;
    return;
  }
  body.innerHTML = items.map(renderBagItem).join('');
  // 送给她：只弹 toast，不改数据
  body.querySelectorAll('.shop-bag-btn.gift').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const it = items.find((x) => x.id === id);
      if (it) showToast(`她收到${it.name}好开心`, 'success', 1500);
    });
  });
  // 丢弃：confirm 后 deleteDB，并从 DOM 移除该行
  body.querySelectorAll('.shop-bag-btn.drop').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const it = items.find((x) => x.id === id);
      if (!it) return;
      showConfirm({
        title: '丢掉这个吗？',
        body: `丢掉${it.name}就找不回来啦`,
        confirmText: '丢掉吧',
        cancelText: '留着',
        danger: true,
        onConfirm: async () => {
          try {
            await deleteDB(STORES.inventory, id);
            const row = body.querySelector(`[data-bag-id="${cssEscape(id)}"]`);
            if (row) row.remove();
            // 同步更新内存列表
            const idx = items.findIndex((x) => x.id === id);
            if (idx >= 0) items.splice(idx, 1);
            // 全丢空了则展示空状态
            if (items.length === 0) renderBagBody(body, items, sheet);
            showToast('丢掉啦', 'default', 1000);
          } catch (e) {
            console.warn('[shop] 丢弃失败', e);
            showToast('没丢掉，再试一下嘛', 'error');
          }
        }
      });
    });
  });
}

function renderBagItem(it) {
  const name = escapeHTML(it.name || '神秘物品');
  const icon = createIcon(it.icon || 'gift', 20).outerHTML;
  const time = formatRelative(it.boughtAt || it.createdAt);
  return `
    <div class="shop-bag-item" data-bag-id="${escapeAttr(it.id)}">
      <div class="shop-bag-icon">${icon}</div>
      <div class="shop-bag-main">
        <div class="shop-bag-name">${name}</div>
        <div class="shop-bag-time">${escapeHTML(time)}</div>
      </div>
      <div class="shop-bag-actions">
        <button class="shop-bag-btn gift" data-id="${escapeAttr(it.id)}">${createIcon('heart', 14).outerHTML}送给她</button>
        <button class="shop-bag-btn drop" data-id="${escapeAttr(it.id)}" aria-label="丢弃${escapeAttr(it.name)}">${createIcon('trash', 14).outerHTML}</button>
      </div>
    </div>
  `;
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
function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, '\\$&');
}
