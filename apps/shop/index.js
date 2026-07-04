// apps/shop/index.js
// 商店 App——把心意买下来送给她。
// 功能：
//   1) 顶部金币余额（读 KEYS.walletState.globalBalance，兼容 balance）+ 充值按钮（+100，写回 globalBalance）
//   2) 分类筛选：全部 / 礼物 / 装饰 / 食物 / 道具 / 纪念物 / 互动券
//   3) 商品网格 2 列：图标 + 名字 + 描述 + 价格 + 购买按钮；自定义商品带「自」角标
//   4) 自定义商品：右上角 + 新增 -> 表单（名字/描述/价格/图标 select/分类/上架）；编辑/删除在「管理商品」里
//   5) 默认商品不能删但可隐藏（hidden 数组），自定义商品可下架（onShelf=false 不显示）
//   6) 购买：showConfirm -> 余额够则扣款（写 globalBalance + 一条 expense 交易）+ 存 STORES.inventory + bus.emit + toast；不够则 showAlert
//   7) 背包：bottomSheet 列已购物品，可「送给她」（选角色 -> 存 STORES.gifts + deleteDB inventory + bus.emit）或丢弃（confirm + deleteDB）
//   8) 全中文注释 + 第一人称软萌文案，所有图标走 createIcon（SVG 线稿，无 emoji）
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js, core/app-bg.js
//       ./styles.js, ./products.js, ./backpack.js

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, setData, setDB, deleteDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, createIcon, showAlert } from '../../core/ui.js';
import bus from '../../core/events.js';
import { applyAppBg } from '../../core/app-bg.js';
import { recordInteraction } from '../../core/memory.js';
import { addAffection } from '../../core/affection.js';
import { injectShopStyles } from './styles.js';
import {
  CATEGORIES,
  readShopState,
  writeShopState,
  getMergedProducts,
  getVisibleProducts,
  renderProductGrid,
  openProductEditor,
  openManagement,
  formatCoins,
  charName
} from './products.js';
import { openBackpack } from './backpack.js';

let containerEl = null;
let currentFilter = '全部';
const RECHARGE_AMOUNT = 100;

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  injectShopStyles();
  currentFilter = '全部';
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="shop-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">小心意商店</div>
      <button class="app-add" id="shop-add" aria-label="新增商品">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="shop-body"></div>
  `;
  container.querySelector('#shop-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#shop-add').addEventListener('click', () => {
    openProductEditor({
      onSave: handleSaveCustomProduct
    });
  });
  await render();
  // 末尾应用背景层
  applyAppBg(container, 'shop');
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 钱包读写（与 wallet App 共享 KEYS.walletState，globalBalance 为余额真源）
// ════════════════════════════════════════

function readWallet() {
  const s = getData(KEYS.walletState, null);
  if (!s || typeof s !== 'object') return { globalBalance: 0, balance: 0, characters: {}, transactions: [] };
  // 兼容旧版：无 globalBalance 则用 balance
  if (s.globalBalance === undefined) {
    s.globalBalance = (typeof s.balance === 'number' ? s.balance : 0);
  }
  if (!Array.isArray(s.transactions)) s.transactions = [];
  if (!s.characters || typeof s.characters !== 'object') s.characters = {};
  s.balance = s.globalBalance;
  return s;
}

function writeWallet(state) {
  state.balance = state.globalBalance;
  setData(KEYS.walletState, state);
}

// 调整用户余额 + 记一条交易（delta 为正=收入，负=支出）
function adjustWallet(delta, tx) {
  const s = readWallet();
  s.globalBalance = Math.round((Number(s.globalBalance) + delta) * 100) / 100;
  s.balance = s.globalBalance;
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
  const balance = wallet.globalBalance;
  const shopState = readShopState();
  const visible = getVisibleProducts(shopState, currentFilter);
  const filters = ['全部', ...CATEGORIES];

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
      ${filters.map((f) => `<button class="shop-filter ${f === currentFilter ? 'active' : ''}" data-filter="${f === '全部' ? '全部' : f}">${f}</button>`).join('')}
    </div>
    ${renderProductGrid(visible)}
    <div class="shop-entries">
      <button class="shop-bag-entry" id="shop-bag-entry">${createIcon('gift', 18).outerHTML}我的背包</button>
      <button class="shop-bag-entry" id="shop-mgmt-entry">${createIcon('settings', 18).outerHTML}管理商品</button>
    </div>
  `;

  // 充值
  bodyEl.querySelector('#shop-recharge').addEventListener('click', () => {
    adjustWallet(RECHARGE_AMOUNT, {
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

  // 筛选
  bodyEl.querySelectorAll('.shop-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter || '全部';
      render();
    });
  });

  // 购买
  bodyEl.querySelectorAll('.shop-buy').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const merged = getMergedProducts(readShopState());
      const p = merged.find((x) => x.id === id);
      if (p) tryBuy(p);
    });
  });

  // 背包
  bodyEl.querySelector('#shop-bag-entry').addEventListener('click', () => {
    openBackpack({ onGive: handleGiveGift });
  });

  // 管理
  bodyEl.querySelector('#shop-mgmt-entry').addEventListener('click', () => {
    const mgmt = openManagement({
      getState: () => readShopState(),
      onToggle: (p, visible) => handleToggleVisibility(p, visible, mgmt),
      onEdit: (p) => {
        openProductEditor({
          prefill: p,
          onSave: (data) => { handleSaveCustomProduct(data); mgmt.refresh(); },
          onDelete: (id) => { handleDeleteCustomProduct(id); mgmt.refresh(); }
        });
      },
      onDelete: (p) => { handleDeleteCustomProduct(p.id); mgmt.refresh(); }
    });
  });
}

// ════════════════════════════════════════
// 购买
// ════════════════════════════════════════

function tryBuy(product) {
  const wallet = readWallet();
  if (Number(wallet.globalBalance) < product.price) {
    showAlert({
      title: '金币不够嘛',
      body: '去充值或者记账攒一点再来吧',
      okText: '知道啦'
    });
    return;
  }
  showConfirm({
    title: '买下它吗？',
    body: `花 ${formatCoins(product.price)} 金币买「${product.name}」`,
    confirmText: '买下吧',
    cancelText: '再想想',
    onConfirm: async () => {
      // 扣款（写 globalBalance + 一条 expense 交易，保持与钱包一致）
      adjustWallet(-product.price, {
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
          source: 'shop',
          boughtAt: getNow()
        });
      } catch (e) {
        // 入库失败则把扣款回滚
        console.warn('[shop] 入库失败', e);
        adjustWallet(product.price, {
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
      bus.emit('shop:purchase', { itemId: product.id, name: product.name, price: product.price });
      showToast('买好啦，送给她吧', 'success', 1400);
      render();
    }
  });
}

// ════════════════════════════════════════
// 赠礼（背包 -> 角色）
// ════════════════════════════════════════

async function handleGiveGift(item, character) {
  const giftId = generateId('gift');
  const toName = charName(character);
  try {
    await setDB(STORES.gifts, giftId, {
      id: giftId,
      characterId: character.id,
      itemName: item.name,
      itemIcon: item.icon,
      itemId: item.itemId || item.id,
      from: 'user',
      note: '',
      createdAt: getNow()
    });
  } catch (e) {
    console.warn('[shop] 礼物记录失败', e);
    showToast('没送出去，再试一下嘛', 'error');
    return;
  }
  // 从背包移除
  try {
    await deleteDB(STORES.inventory, item.id);
  } catch (e) {
    console.warn('[shop] 背包移除失败', e);
  }
  bus.emit('shop:gift-sent', { giftName: item.name, to: toName, itemId: item.itemId || item.id });
  // 送礼加好感度 + 写入长期记忆
  try {
    await addAffection(character.id, 5, 'gift');
    await recordInteraction({
      characterId: character.id,
      role: 'user',
      source: 'gift',
      content: `送了${item.name}`,
      importance: 8,
      relatedApp: 'shop'
    });
  } catch (e) {
    console.warn('[shop] 记忆/好感度写入失败', e);
  }
  showToast(`送好啦，${toName}会很开心的`, 'success', 1500);
}

// ════════════════════════════════════════
// 自定义商品：新增 / 编辑 / 删除 / 上下架 / 隐藏
// ════════════════════════════════════════

function handleSaveCustomProduct(data) {
  const state = readShopState();
  const idx = state.products.findIndex((p) => p.id === data.id);
  if (idx >= 0) {
    state.products[idx] = data;
  } else {
    state.products.push(data);
  }
  writeShopState(state);
  showToast(idx >= 0 ? '改好啦' : '加进来啦', 'success', 1200);
  render();
}

function handleDeleteCustomProduct(id) {
  const state = readShopState();
  state.products = state.products.filter((p) => p.id !== id);
  writeShopState(state);
  showToast('删掉啦', 'default', 1000);
  render();
}

// 切换可见性：自定义商品改 onShelf；默认商品改 hidden 数组
function handleToggleVisibility(p, visible, mgmt) {
  const state = readShopState();
  if (p.custom) {
    const idx = state.products.findIndex((x) => x.id === p.id);
    if (idx >= 0) {
      state.products[idx].onShelf = visible;
    }
  } else {
    if (visible) {
      state.hidden = state.hidden.filter((id) => id !== p.id);
    } else {
      if (!state.hidden.includes(p.id)) state.hidden.push(p.id);
    }
  }
  writeShopState(state);
  mgmt.refresh();
  render();
}
