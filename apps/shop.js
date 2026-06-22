// apps/shop.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getAllDB, setDB, getDB, deleteDB, compressImage
//   from '../core/ui.js': showToast, showConfirm, showBottomSheet, hideBottomSheet, createIcon
//   from './wallet.js': getBalance, deductBalance

import {
  getData, setData, generateId, getNow, getAllDB, setDB, getDB, deleteDB, compressImage
} from '../core/storage.js';

import {
  showToast, showConfirm, showBottomSheet, hideBottomSheet, createIcon
} from '../core/ui.js';

import {
  getBalance, deductBalance
} from './wallet.js';

const SHOP_KEY = 'shop_items';
const SHOP_VISUALS_KEY = 'app_shop_item_visuals';
const SHOP_DELETED_KEY = 'app_shop_deleted_items';
const AI_WALLETS_KEY = 'app_ai_wallets';
const STYLE_ID = 'shop-styles';
const BG_KEY = 'app_bg_shop';
const AI_INITIAL_BALANCE = 5000;

let container = null;
let currentTab = 'shop';

const DEFAULT_ITEMS = [
  { id: 'item-soft-tea', name: '暖乎乎奶茶', description: '递过去一杯甜甜的热饮，聊天会变得更软一点。', price: 18, effect: '用户送过一杯暖乎乎奶茶，请用更柔软、更贴近的语气回应。', moodEffect: 'happy' },
  { id: 'item-little-flower', name: '小小花束', description: '不大张扬，但很认真地表达喜欢。', price: 36, effect: '用户送过一束小小花束，请记得表达被珍惜、被认真对待的感觉。', moodEffect: 'excited' },
  { id: 'item-sweet-cake', name: '云朵小蛋糕', description: '一口下去，心情像被轻轻托起来。', price: 28, effect: '用户送过云朵小蛋糕，请在合适时用轻松、开心、带一点亲近感的语气互动。', moodEffect: 'happy' },
  { id: 'item-soft-blanket', name: '午睡软毯', description: '适合夜晚、雨天、或者想被安慰的时候。', price: 48, effect: '用户送过午睡软毯，夜晚或疲惫时请更温柔、更有陪伴感。', moodEffect: 'neutral' },
  { id: 'item-starlight-card', name: '星光留言卡', description: '把没说出口的想念，悄悄夹进卡片里。', price: 66, effect: '用户送过星光留言卡，可以更自然地表达想念、牵挂和期待。', moodEffect: 'excited' },
  { id: 'item-moon-ticket', name: '月亮车票', description: '像一张去梦里的票，适合约定和幻想。', price: 88, effect: '用户送过月亮车票，可以在聊天里加入旅行、约定、幻想陪伴的氛围。', moodEffect: 'excited' },
  { id: 'item-pet-food', name: '宠物饲料', description: '给小宠物准备的日常口粮，朴素但很安心。', price: 12, effect: '背包里有宠物饲料，云养宠互动时可用于恢复饥饿度。', moodEffect: 'happy' },
  { id: 'item-dried-fish', name: '香香小鱼干', description: '猫猫系宠物会很喜欢，也可能让角色想撒娇。', price: 16, effect: '背包里有香香小鱼干，适合猫类宠物奖励，也会让聊天氛围更可爱。', moodEffect: 'happy' },
  { id: 'item-toy-ball', name: '软软玩具球', description: '滚来滚去的小玩具，能让宠物开心一整会儿。', price: 22, effect: '背包里有软软玩具球，云养宠玩耍时可提升心情和亲密度。', moodEffect: 'excited' },
  { id: 'item-pet-bed', name: '月牙宠物窝', description: '小小一张床，睡进去像被月光抱住。', price: 52, effect: '背包里有月牙宠物窝，宠物休息时恢复更好，角色也可能提醒用户照顾宠物。', moodEffect: 'neutral' },
  { id: 'item-clean-brush', name: '柔毛清洁刷', description: '轻轻梳一梳，烦躁也会被梳顺。', price: 26, effect: '背包里有柔毛清洁刷，云养宠清洁或抚摸互动时可增加亲密度。', moodEffect: 'happy' },
  { id: 'item-energy-snack', name: '元气小零食', description: '适合宠物低落时补一点精神。', price: 30, effect: '背包里有元气小零食，宠物心情低时可作为恢复道具。', moodEffect: 'excited' },
  { id: 'item-tarot-wax', name: '塔罗蜡封卡', description: '带着一点神秘气息，适合塔罗牌小游戏。', price: 40, effect: '背包里有塔罗蜡封卡，塔罗牌小游戏可获得更细腻、更有仪式感的解读。', moodEffect: 'neutral' },
  { id: 'item-script-clue', name: '剧本线索夹', description: '把关键线索收好，推理时会更有底气。', price: 45, effect: '背包里有剧本线索夹，剧本杀小游戏可辅助整理线索和关系。', moodEffect: 'neutral' },
  { id: 'item-truth-pack', name: '真心话卡包', description: '问题不尖锐，但会把心事轻轻翻出来。', price: 34, effect: '背包里有真心话卡包，真心话大冒险小游戏可解锁更柔软、更暧昧的问题。', moodEffect: 'excited' },
  { id: 'item-werewolf-sleeve', name: '身份牌护套', description: '把秘密藏好一点，狼人杀会更有氛围。', price: 38, effect: '背包里有身份牌护套，狼人杀小游戏可增强身份隐藏和仪式感。', moodEffect: 'neutral' },
  { id: 'item-card-cloth', name: '绒面牌桌布', description: '铺开后，普通牌局也变得像小小聚会。', price: 42, effect: '背包里有绒面牌桌布，扑克牌小游戏可使用更沉浸的牌桌氛围。', moodEffect: 'happy' },
  { id: 'item-match-ticket', name: '灵感提示券', description: '猜不到的时候，它会悄悄推你一下。', price: 32, effect: '背包里有灵感提示券，配对或猜测小游戏可获得一次温柔提示。', moodEffect: 'happy' },
  { id: 'item-lucky-bell', name: '幸运小铃', description: '轻轻一响，好像今天会顺一点。', price: 58, effect: '用户拥有幸运小铃，聊天和小游戏中可以偶尔加入好运、鼓励和正向暗示。', moodEffect: 'happy' },
  { id: 'item-mood-candy', name: '心情糖', description: '不是万能药，但能把坏心情甜一下。', price: 24, effect: '用户拥有心情糖，当用户情绪低落时请更温柔地安慰，并提醒慢慢来。', moodEffect: 'happy' },
  { id: 'item-sleep-sachet', name: '安睡香囊', description: '适合睡前聊天，声音会变得很轻。', price: 46, effect: '用户拥有安睡香囊，深夜聊天时请更轻、更慢、更适合睡前陪伴。', moodEffect: 'neutral' },
  { id: 'item-inspiration-note', name: '灵感便签', description: '写一点点想法，明天也许会开花。', price: 50, effect: '用户拥有灵感便签，创作、备忘录和小游戏时可以给出更有想象力的建议。', moodEffect: 'excited' }
];

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .shop-screen{position:fixed;inset:0;z-index:10;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-primary);color:var(--text-primary)}
    .shop-screen.has-bg{background-size:cover;background-position:center;background-repeat:no-repeat}
    .shop-soft-layer{position:absolute;inset:0;z-index:0;pointer-events:none;background:color-mix(in srgb,var(--bg-primary) 78%,transparent)}
    .shop-nav{position:fixed;top:0;left:0;right:0;z-index:100;height:calc(56px + env(safe-area-inset-top));display:flex;align-items:center;gap:var(--spacing-sm);padding:env(safe-area-inset-top) 20px 0;background:var(--surface-glass);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
    .shop-nav-title{flex:1;min-width:0;color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .shop-body{position:relative;z-index:1;flex:1;overflow-x:hidden;overflow-y:auto;padding:calc(56px + env(safe-area-inset-top) + 18px) 20px calc(88px + env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch}
    .shop-hero{min-height:170px;display:flex;align-items:center;gap:var(--spacing-md);padding:20px;border-radius:28px;background:var(--bg-card);box-shadow:var(--shadow-md)}
    .shop-house{width:92px;height:92px;flex:0 0 92px;display:flex;align-items:center;justify-content:center;color:var(--accent-dark);background:var(--accent-light);border-radius:28px;box-shadow:var(--shadow-sm);overflow:hidden}
    .shop-house img,.shop-item-art img,.shop-manage-thumb img{width:100%;height:100%;object-fit:cover;display:block}
    .shop-hero-main{flex:1;min-width:0}
    .shop-hero-kicker{color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.4}
    .shop-hero-title{margin-top:4px;color:var(--text-primary);font-size:24px;font-weight:600;line-height:1.25;letter-spacing:-.02em}
    .shop-hero-text{margin-top:8px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.6}
    .shop-balance{display:inline-flex;align-items:center;gap:6px;margin-top:12px;padding:6px 12px;border-radius:999px;background:var(--surface-muted);color:var(--text-primary);font-size:var(--font-size-small);font-weight:600}
    .shop-tabs{display:flex;gap:var(--spacing-xs);padding:var(--spacing-xs);margin-top:var(--spacing-md);border-radius:var(--radius-md);background:var(--surface-muted)}
    .shop-tab-btn{flex:1;min-height:36px;border-radius:12px;color:var(--text-secondary);font-size:var(--font-size-small);font-weight:500;transition:var(--motion)}
    .shop-tab-btn.active{background:var(--bg-card);color:var(--text-primary);box-shadow:var(--shadow-sm)}
    .shop-list{display:flex;flex-direction:column;gap:var(--spacing-md);margin-top:var(--spacing-md)}
    .shop-card,.shop-inventory-row{display:flex;align-items:stretch;gap:var(--spacing-md);padding:var(--spacing-md);border-radius:var(--radius-lg);background:var(--bg-card);box-shadow:var(--shadow-sm)}
    .shop-item-art{width:70px;height:70px;flex:0 0 70px;display:flex;align-items:center;justify-content:center;border-radius:24px;background:var(--accent-light);color:var(--accent-dark);overflow:hidden}
    .shop-item-main,.shop-inventory-main{flex:1;min-width:0}
    .shop-item-name,.shop-inventory-name{color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .shop-item-desc,.shop-inventory-desc{margin-top:4px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.55}
    .shop-item-effect{margin-top:10px;padding:10px 12px;border-radius:var(--radius-md);background:var(--surface-muted);color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.55}
    .shop-card-foot{display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-sm);margin-top:12px}
    .shop-price{display:inline-flex;align-items:center;gap:5px;color:var(--accent-dark);font-size:var(--font-size-base);font-weight:600;line-height:1}
    .shop-buy-btn{min-height:38px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;border-radius:14px;background:var(--accent);color:var(--bubble-user-text);font-size:var(--font-size-small);font-weight:600;box-shadow:var(--shadow-sm);transition:var(--motion)}
    .shop-buy-btn:active,.shop-mini-btn:active,.shop-manage-row:active{transform:scale(.96)}
    .shop-inventory-count{min-width:42px;min-height:34px;display:inline-flex;align-items:center;justify-content:center;padding:6px 10px;border-radius:999px;background:var(--surface-muted);color:var(--text-primary);font-size:var(--font-size-small);font-weight:600}
    .shop-empty{min-height:220px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--spacing-sm);padding:var(--spacing-lg);border-radius:24px;background:var(--bg-card);box-shadow:var(--shadow-sm);color:var(--text-secondary);text-align:center}
    .shop-empty-icon{width:58px;height:58px;display:flex;align-items:center;justify-content:center;border-radius:22px;background:var(--accent-light);color:var(--accent-dark)}
    .shop-empty-title{color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35}
    .shop-empty-text{max-width:260px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.6}
    .shop-sheet-title{color:var(--text-primary);font-size:20px;font-weight:600;line-height:1.35;margin-bottom:var(--spacing-md)}
    .shop-sheet-section{padding:var(--spacing-md);border-radius:var(--radius-lg);background:var(--bg-card);box-shadow:var(--shadow-sm);margin-bottom:var(--spacing-md)}
    .shop-sheet-label{color:var(--text-primary);font-size:var(--font-size-title);font-weight:600}
    .shop-sheet-sub{color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.6;margin-top:4px}
    .shop-sheet-actions{display:flex;gap:var(--spacing-sm);flex-wrap:wrap;margin-top:var(--spacing-md)}
    .shop-mini-btn{min-height:36px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;border-radius:14px;background:var(--surface-muted);color:var(--text-primary);font-size:var(--font-size-small);font-weight:600;transition:var(--motion)}
    .shop-mini-btn.primary{background:var(--accent);color:var(--bubble-user-text)}
    .shop-mini-btn.danger{color:var(--accent-dark)}
    .shop-form-field{display:block;margin-bottom:var(--spacing-md)}
    .shop-form-label{color:var(--text-secondary);font-size:var(--font-size-small);font-weight:500;margin-bottom:8px}
    .shop-input,.shop-textarea{width:100%;border-radius:var(--radius-md);background:var(--surface-muted);color:var(--text-primary);font-size:var(--font-size-base)}
    .shop-input{min-height:46px;padding:10px 14px}
    .shop-textarea{min-height:92px;padding:12px 14px;line-height:1.6;resize:none}
    .shop-manage-list{display:flex;flex-direction:column;gap:var(--spacing-sm);max-height:360px;overflow:auto}
    .shop-manage-row{display:flex;align-items:center;gap:var(--spacing-sm);padding:10px;border-radius:16px;background:var(--surface-muted);transition:var(--motion)}
    .shop-manage-thumb{width:42px;height:42px;flex:0 0 42px;border-radius:14px;background:var(--accent-light);color:var(--accent-dark);display:flex;align-items:center;justify-content:center;overflow:hidden}
    .shop-manage-main{flex:1;min-width:0}
    .shop-manage-name{color:var(--text-primary);font-size:var(--font-size-base);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .shop-manage-price{color:var(--text-secondary);font-size:var(--font-size-small);margin-top:2px}
  `;
  document.head.appendChild(style);
}

function getDeletedIds() {
  const list = getData(SHOP_DELETED_KEY, []);
  return Array.isArray(list) ? list : [];
}

function setDeletedIds(list) {
  setData(SHOP_DELETED_KEY, Array.isArray(list) ? [...new Set(list)] : []);
}

function normalizeShopItem(item) {
  if (!item || typeof item !== 'object') return null;
  return {
    id: item.id || generateId(),
    name: item.name || '未命名商品',
    description: item.description || '',
    price: Math.max(0, Number(item.price) || 0),
    effect: item.effect || '',
    moodEffect: item.moodEffect || 'neutral'
  };
}

function getItems() {
  const saved = getData(SHOP_KEY);
  const deleted = new Set(getDeletedIds());
  const map = new Map();

  DEFAULT_ITEMS.forEach((item) => {
    if (!deleted.has(item.id)) map.set(item.id, item);
  });

  if (Array.isArray(saved)) {
    saved.map(normalizeShopItem).filter(Boolean).forEach((item) => {
      if (!deleted.has(item.id)) map.set(item.id, item);
    });
  }

  const merged = [...map.values()];
  setData(SHOP_KEY, merged);
  return merged;
}

export function getShopItems() {
  return getItems();
}

export function getShopItemVisual(itemId) {
  const visuals = getData(SHOP_VISUALS_KEY, {});
  if (!visuals || typeof visuals !== 'object') return null;
  return visuals[itemId] || null;
}

export function getAiBalance(characterId) {
  if (!characterId) return 0;
  const wallets = getData(AI_WALLETS_KEY, {});
  const wallet = wallets[characterId] || createAiWallet();
  wallets[characterId] = wallet;
  setData(AI_WALLETS_KEY, wallets);
  return Number(wallet.balance) || 0;
}

export function addAiBalance(characterId, amount, description = '余额调整') {
  if (!characterId) return false;

  const value = Number(amount) || 0;
  const wallets = getData(AI_WALLETS_KEY, {});
  const wallet = wallets[characterId] || createAiWallet();

  wallet.balance = Math.max(0, Number(wallet.balance || 0) + value);
  wallet.transactions = Array.isArray(wallet.transactions) ? wallet.transactions : [];
  wallet.transactions.unshift({
    id: generateId(),
    amount: value,
    description,
    timestamp: getNow(),
    type: value >= 0 ? 'income' : 'expense'
  });

  wallets[characterId] = wallet;
  setData(AI_WALLETS_KEY, wallets);
  return true;
}

export async function aiBuyItem(characterId, itemId, options = {}) {
  const quantity = Math.max(1, Number(options.quantity) || 1);
  const silent = options.silent === true;

  if (!characterId || !itemId) return { ok: false, reason: 'missing_params' };

  const item = getItems().find((record) => record.id === itemId);
  if (!item) return { ok: false, reason: 'item_not_found' };

  const total = Number(item.price || 0) * quantity;
  const balance = getAiBalance(characterId);

  if (balance < total) {
    if (!silent) showToast('这个 AI 的余额不够');
    return { ok: false, reason: 'insufficient_balance', item, balance };
  }

  addAiBalance(characterId, -total, `购买 ${item.name}`);
  await addToInventory(item, {
    ownerType: 'ai',
    ownerId: characterId,
    quantity
  });

  if (!silent) showToast('AI 已经买好啦');

  return {
    ok: true,
    item,
    quantity,
    balance: getAiBalance(characterId)
  };
}

function createAiWallet() {
  return {
    balance: AI_INITIAL_BALANCE,
    transactions: [{
      id: generateId(),
      amount: AI_INITIAL_BALANCE,
      description: '初始小金库',
      timestamp: getNow(),
      type: 'income'
    }]
  };
}

function setShopItemVisual(itemId, visual) {
  const visuals = getData(SHOP_VISUALS_KEY, {});
  visuals[itemId] = visual;
  setData(SHOP_VISUALS_KEY, visuals);
}

function removeShopItemVisual(itemId) {
  const visuals = getData(SHOP_VISUALS_KEY, {});
  delete visuals[itemId];
  setData(SHOP_VISUALS_KEY, visuals);
}

function getVisualImage(visual) {
  if (!visual) return '';
  if (typeof visual === 'string') return visual;

  const direct = visual.image || visual.iconImage || visual.backgroundImage || visual.imageBase64 || visual.imageSource || visual.value || visual.data || visual.src || visual.url || visual.base64 || '';
  if (typeof direct === 'string') return direct;
  if (direct && typeof direct === 'object') return direct.value || direct.data || direct.src || direct.url || direct.base64 || '';
  return '';
}

function getVisualOpacity(visual) {
  const value = Number(visual?.opacity);
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0.08, value));
}

function applyVisualToArt(art, itemId, fallbackSvg) {
  const visual = getShopItemVisual(itemId);
  const image = getVisualImage(visual);
  art.innerHTML = '';

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.alt = '';
    img.style.opacity = String(getVisualOpacity(visual));
    art.appendChild(img);
    return;
  }

  art.appendChild(fallbackSvg);
}

function formatMoney(amount) {
  const value = Number(amount) || 0;
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  });
}

export async function mount(containerEl) {
  injectStyles();
  container = containerEl;
  currentTab = 'shop';

  const screen = document.createElement('section');
  screen.className = 'shop-screen';

  const softLayer = document.createElement('div');
  softLayer.className = 'shop-soft-layer';

  const nav = document.createElement('div');
  nav.className = 'shop-nav';

  const backButton = document.createElement('button');
  backButton.className = 'icon-button';
  backButton.type = 'button';
  backButton.setAttribute('aria-label', '返回');
  backButton.appendChild(createIcon('back', 22));
  backButton.addEventListener('click', () => window.closeCurrentApp?.());

  const title = document.createElement('div');
  title.className = 'shop-nav-title';
  title.textContent = '商店';

  const customButton = document.createElement('button');
  customButton.className = 'icon-button soft';
  customButton.type = 'button';
  customButton.setAttribute('aria-label', '个性化');
  customButton.appendChild(createIcon('edit', 22));
  customButton.addEventListener('click', openCustomizeSheet);

  const refreshButton = document.createElement('button');
  refreshButton.className = 'icon-button soft';
  refreshButton.type = 'button';
  refreshButton.setAttribute('aria-label', '刷新');
  refreshButton.appendChild(createIcon('refresh', 22));
  refreshButton.addEventListener('click', renderShop);

  const body = document.createElement('div');
  body.className = 'shop-body';

  nav.append(backButton, title, customButton, refreshButton);
  screen.append(softLayer, nav, body);

  container.innerHTML = '';
  container.appendChild(screen);

  await applyShopBackground(screen);
  renderShop();
}

export function unmount() {
  if (container) {
    container.innerHTML = '';
    container = null;
  }
}

async function applyShopBackground(screen) {
  try {
    const record = await getDB('blobs', BG_KEY);
    const value = record?.value || '';
    if (!value) {
      screen.classList.remove('has-bg');
      screen.style.backgroundImage = '';
      return;
    }

    screen.classList.add('has-bg');
    screen.style.backgroundImage = `url("${value}")`;
  } catch (_) {
    screen.classList.remove('has-bg');
    screen.style.backgroundImage = '';
  }
}

async function renderShop() {
  const body = container?.querySelector('.shop-body');
  if (!body) return;

  body.innerHTML = '';

  const hero = document.createElement('section');
  hero.className = 'shop-hero';

  const art = document.createElement('div');
  art.className = 'shop-house';
  const shopVisual = getShopItemVisual('shop-hero');
  const shopImage = getVisualImage(shopVisual);

  if (shopImage) {
    const img = document.createElement('img');
    img.src = shopImage;
    img.alt = '';
    img.style.opacity = String(getVisualOpacity(shopVisual));
    art.appendChild(img);
  } else {
    art.appendChild(createShopSvg());
  }

  const main = document.createElement('div');
  main.className = 'shop-hero-main';

  const kicker = document.createElement('div');
  kicker.className = 'shop-hero-kicker';
  kicker.textContent = '小道具商铺';

  const title = document.createElement('div');
  title.className = 'shop-hero-title';
  title.textContent = '给喜欢的日常添一点光';

  const text = document.createElement('div');
  text.className = 'shop-hero-text';
  text.textContent = '礼物、宠物用品、小游戏道具都会放进背包，之后可以和聊天、宠物、游戏联动。';

  const balance = document.createElement('div');
  balance.className = 'shop-balance';
  balance.append(createIcon('transfer', 15), document.createTextNode(`我的余额 ¥${formatMoney(getBalance())}`));

  main.append(kicker, title, text, balance);
  hero.append(art, main);

  const tabs = document.createElement('div');
  tabs.className = 'shop-tabs';
  tabs.append(createTabButton('shop', '商店'), createTabButton('bag', '背包'));

  const list = document.createElement('div');
  list.className = 'shop-list';

  body.append(hero, tabs, list);

  if (currentTab === 'shop') renderItemList(list);
  else await renderInventory(list);
}

function createTabButton(tab, label) {
  const button = document.createElement('button');
  button.className = `shop-tab-btn ${currentTab === tab ? 'active' : ''}`;
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', async () => {
    currentTab = tab;
    await renderShop();
  });
  return button;
}

function renderItemList(list) {
  const items = getItems();

  if (!items.length) {
    list.appendChild(createEmptyState('没有商品', '现在货架是空的，稍后再来看看'));
    return;
  }

  items.forEach((item) => list.appendChild(createItemCard(item)));
}

function createItemCard(item) {
  const card = document.createElement('article');
  card.className = 'shop-card';

  const art = document.createElement('div');
  art.className = 'shop-item-art';
  applyVisualToArt(art, item.id, createItemSvg(item.id));

  const main = document.createElement('div');
  main.className = 'shop-item-main';

  const name = document.createElement('div');
  name.className = 'shop-item-name';
  name.textContent = item.name;

  const desc = document.createElement('div');
  desc.className = 'shop-item-desc';
  desc.textContent = item.description;

  const effect = document.createElement('div');
  effect.className = 'shop-item-effect';
  effect.textContent = item.effect || '这个小东西会在之后悄悄派上用场。';

  const foot = document.createElement('div');
  foot.className = 'shop-card-foot';

  const price = document.createElement('div');
  price.className = 'shop-price';
  price.append(createIcon('transfer', 15), document.createTextNode(`¥${formatMoney(item.price)}`));

  const buy = document.createElement('button');
  buy.className = 'shop-buy-btn';
  buy.type = 'button';
  buy.append(createIcon('add', 15), document.createTextNode('带走'));
  buy.addEventListener('click', () => buyItem(item));

  foot.append(price, buy);
  main.append(name, desc, effect, foot);
  card.append(art, main);
  return card;
}

async function buyItem(item) {
  if (getBalance() < item.price) {
    showToast('余额有点不够，先去钱包补一点');
    return;
  }

  const ok = await showConfirm(`要把「${item.name}」带回背包吗？`);
  if (!ok) return;

  const paid = deductBalance(item.price, `购买 ${item.name}`);
  if (!paid) {
    showToast('余额不够');
    return;
  }

  await addToInventory(item, {
    ownerType: 'user',
    ownerId: 'user',
    quantity: 1
  });
  showToast('已放进背包');
  await renderShop();
}

async function addToInventory(item, options = {}) {
  const ownerType = options.ownerType || 'user';
  const ownerId = options.ownerId || 'user';
  const quantity = Math.max(1, Number(options.quantity) || 1);

  const all = await getAllDB('inventory');
  const existing = all.find((record) =>
    record &&
    record.itemId === item.id &&
    (record.ownerType || 'user') === ownerType &&
    (record.ownerId || 'user') === ownerId
  );

  if (existing) {
    await setDB('inventory', existing.id, {
      ...existing,
      ownerType,
      ownerId,
      quantity: Number(existing.quantity || 0) + quantity,
      purchasedAt: existing.purchasedAt || getNow(),
      updatedAt: getNow()
    });
    return;
  }

  const id = generateId();
  await setDB('inventory', id, {
    id,
    itemId: item.id,
    quantity,
    ownerType,
    ownerId,
    purchasedAt: getNow()
  });
}

async function renderInventory(list) {
  const items = getItems();
  const inventory = await getAllDB('inventory');
  const owned = inventory
    .filter((record) =>
      record &&
      Number(record.quantity) > 0 &&
      (record.ownerType || 'user') === 'user'
    )
    .map((record) => {
      const item = items.find((shopItem) => shopItem.id === record.itemId);
      return item ? { ...record, item } : null;
    })
    .filter(Boolean);

  if (!owned.length) {
    list.appendChild(createEmptyState('背包还是空的', '买到的小东西都会乖乖放在这里'));
    return;
  }

  owned.forEach((record) => list.appendChild(createInventoryRow(record)));
}

function createInventoryRow(record) {
  const row = document.createElement('article');
  row.className = 'shop-inventory-row';

  const art = document.createElement('div');
  art.className = 'shop-item-art';
  applyVisualToArt(art, record.item.id, createItemSvg(record.item.id));

  const main = document.createElement('div');
  main.className = 'shop-inventory-main';

  const name = document.createElement('div');
  name.className = 'shop-inventory-name';
  name.textContent = record.item.name;

  const desc = document.createElement('div');
  desc.className = 'shop-inventory-desc';
  desc.textContent = record.item.effect || record.item.description;

  main.append(name, desc);

  const count = document.createElement('div');
  count.className = 'shop-inventory-count';
  count.textContent = `×${Number(record.quantity) || 0}`;

  row.append(art, main, count);
  return row;
}

function openCustomizeSheet() {
  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'shop-sheet-title';
  title.textContent = '装扮商店';

  const bgSection = createSheetSection('商店壁纸', '给商店换一张自己的背景图。');

  const uploadBg = document.createElement('button');
  uploadBg.className = 'shop-mini-btn primary';
  uploadBg.type = 'button';
  uploadBg.append(createIcon('upload', 15), document.createTextNode('上传壁纸'));
  uploadBg.addEventListener('click', () => chooseImage(async (file) => {
    const value = await compressImage(file, 1600, 0.86);
    await setDB('blobs', BG_KEY, {
      key: BG_KEY,
      value,
      source: 'upload',
      opacity: 1,
      updatedAt: getNow()
    });
    showToast('壁纸换好啦');
    hideBottomSheet();
    const screen = container?.querySelector('.shop-screen');
    if (screen) await applyShopBackground(screen);
  }));

  const clearBg = document.createElement('button');
  clearBg.className = 'shop-mini-btn';
  clearBg.type = 'button';
  clearBg.append(createIcon('clear', 15), document.createTextNode('清除壁纸'));
  clearBg.addEventListener('click', async () => {
    await deleteDB('blobs', BG_KEY);
    const screen = container?.querySelector('.shop-screen');
    if (screen) await applyShopBackground(screen);
    hideBottomSheet();
    showToast('已恢复默认背景');
  });

  bgSection.querySelector('.shop-sheet-actions').append(uploadBg, clearBg);

  const itemSection = createSheetSection('商品管理', '可以新增商品，也可以给每个商品换图片。');

  const addButton = document.createElement('button');
  addButton.className = 'shop-mini-btn primary';
  addButton.type = 'button';
  addButton.append(createIcon('add', 15), document.createTextNode('添加商品'));
  addButton.addEventListener('click', () => openItemEditor(null));

  itemSection.querySelector('.shop-sheet-actions').appendChild(addButton);

  const list = document.createElement('div');
  list.className = 'shop-manage-list';
  getItems().forEach((item) => list.appendChild(createManageRow(item)));

  itemSection.appendChild(list);
  sheet.append(title, bgSection, itemSection);
  showBottomSheet(sheet);
}

function createSheetSection(label, sub) {
  const section = document.createElement('section');
  section.className = 'shop-sheet-section';

  const title = document.createElement('div');
  title.className = 'shop-sheet-label';
  title.textContent = label;

  const desc = document.createElement('div');
  desc.className = 'shop-sheet-sub';
  desc.textContent = sub;

  const actions = document.createElement('div');
  actions.className = 'shop-sheet-actions';

  section.append(title, desc, actions);
  return section;
}

function createManageRow(item) {
  const row = document.createElement('div');
  row.className = 'shop-manage-row';

  const thumb = document.createElement('div');
  thumb.className = 'shop-manage-thumb';
  applyVisualToArt(thumb, item.id, createItemSvg(item.id));

  const main = document.createElement('div');
  main.className = 'shop-manage-main';

  const name = document.createElement('div');
  name.className = 'shop-manage-name';
  name.textContent = item.name;

  const price = document.createElement('div');
  price.className = 'shop-manage-price';
  price.textContent = `¥${formatMoney(item.price)}`;

  main.append(name, price);

  const imageButton = document.createElement('button');
  imageButton.className = 'shop-mini-btn';
  imageButton.type = 'button';
  imageButton.append(createIcon('image', 15));
  imageButton.addEventListener('click', () => changeItemImage(item));

  const editButton = document.createElement('button');
  editButton.className = 'shop-mini-btn';
  editButton.type = 'button';
  editButton.append(createIcon('edit', 15));
  editButton.addEventListener('click', () => openItemEditor(item));

  const deleteButton = document.createElement('button');
  deleteButton.className = 'shop-mini-btn danger';
  deleteButton.type = 'button';
  deleteButton.append(createIcon('delete', 15));
  deleteButton.addEventListener('click', () => deleteShopItem(item));

  row.append(thumb, main, imageButton, editButton, deleteButton);
  return row;
}

async function changeItemImage(item) {
  chooseImage(async (file) => {
    const value = await compressImage(file, 800, 0.86);
    setShopItemVisual(item.id, {
      image: value,
      iconImage: value,
      backgroundImage: value,
      imageBase64: value,
      imageSource: value,
      opacity: 1,
      name: item.name,
      updatedAt: getNow()
    });
    showToast('小图换好啦');
    hideBottomSheet();
    await renderShop();
  });
}

function openItemEditor(item) {
  const isEdit = Boolean(item);
  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'shop-sheet-title';
  title.textContent = isEdit ? '编辑商品' : '添加商品';

  const nameField = createFormField('商品名称', item?.name || '', '比如：晚安抱枕');
  const priceField = createFormField('价格', item?.price ?? '', '比如：30', 'number');
  const descField = createTextField('商品文案', item?.description || '', '写一句可爱的介绍');
  const effectField = createTextField('AI 可感知效果', item?.effect || '', '比如：收到这个后更温柔一点');

  let pendingImage = '';

  const imageButton = document.createElement('button');
  imageButton.className = 'shop-mini-btn';
  imageButton.type = 'button';
  imageButton.append(createIcon('image', 15), document.createTextNode(isEdit ? '更换图片' : '选择图片'));
  imageButton.addEventListener('click', () => chooseImage(async (file) => {
    pendingImage = await compressImage(file, 800, 0.86);
    showToast('图片选好啦，记得保存');
  }));

  const actions = document.createElement('div');
  actions.className = 'shop-sheet-actions';

  const cancel = document.createElement('button');
  cancel.className = 'shop-mini-btn';
  cancel.type = 'button';
  cancel.textContent = '取消';
  cancel.addEventListener('click', hideBottomSheet);

  const save = document.createElement('button');
  save.className = 'shop-mini-btn primary';
  save.type = 'button';
  save.textContent = '保存';
  save.addEventListener('click', async () => {
    const name = nameField.querySelector('input').value.trim();
    const price = Number(priceField.querySelector('input').value) || 0;
    const description = descField.querySelector('textarea').value.trim();
    const effect = effectField.querySelector('textarea').value.trim();

    if (!name) {
      showToast('商品还没有名字');
      return;
    }

    const items = getItems();
    const nextItem = {
      id: item?.id || `item-custom-${generateId()}`,
      name,
      description,
      price: Math.max(0, price),
      effect,
      moodEffect: item?.moodEffect || 'happy'
    };

    const next = isEdit
      ? items.map((record) => record.id === item.id ? nextItem : record)
      : [nextItem, ...items];

    setData(SHOP_KEY, next);

    if (pendingImage) {
      setShopItemVisual(nextItem.id, {
        image: pendingImage,
        iconImage: pendingImage,
        backgroundImage: pendingImage,
        imageBase64: pendingImage,
        imageSource: pendingImage,
        opacity: 1,
        name: nextItem.name,
        updatedAt: getNow()
      });
    }

    hideBottomSheet();
    showToast('已保存');
    await renderShop();
  });

  actions.append(cancel, save);
  sheet.append(title, nameField, priceField, descField, effectField, imageButton, actions);
  showBottomSheet(sheet);
}

function createFormField(label, value, placeholder, type = 'text') {
  const field = document.createElement('label');
  field.className = 'shop-form-field';

  const text = document.createElement('div');
  text.className = 'shop-form-label';
  text.textContent = label;

  const input = document.createElement('input');
  input.className = 'shop-input';
  input.type = type;
  input.value = value;
  input.placeholder = placeholder;

  field.append(text, input);
  return field;
}

function createTextField(label, value, placeholder) {
  const field = document.createElement('label');
  field.className = 'shop-form-field';

  const text = document.createElement('div');
  text.className = 'shop-form-label';
  text.textContent = label;

  const textarea = document.createElement('textarea');
  textarea.className = 'shop-textarea';
  textarea.value = value;
  textarea.placeholder = placeholder;

  field.append(text, textarea);
  return field;
}

async function deleteShopItem(item) {
  const ok = await showConfirm(`确定删除「${item.name}」吗？`);
  if (!ok) return;

  const deleted = getDeletedIds();
  deleted.push(item.id);
  setDeletedIds(deleted);

  const next = getItems().filter((record) => record.id !== item.id);
  setData(SHOP_KEY, next);
  removeShopItemVisual(item.id);

  hideBottomSheet();
  showToast('已删除');
  await renderShop();
}

function chooseImage(onPicked) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      await onPicked(file);
    } catch (_) {
      showToast('图片处理失败');
    }
  });
  input.click();
}

function createEmptyState(titleText, textContent) {
  const empty = document.createElement('div');
  empty.className = 'shop-empty';

  const icon = document.createElement('div');
  icon.className = 'shop-empty-icon';
  icon.appendChild(createIcon('star', 26));

  const title = document.createElement('div');
  title.className = 'shop-empty-title';
  title.textContent = titleText;

  const text = document.createElement('div');
  text.className = 'shop-empty-text';
  text.textContent = textContent;

  empty.append(icon, title, text);
  return empty;
}

function createShopSvg() {
  const svg = createSvgBase(92, 92);
  svg.append(
    svgPath('M20 42h52v32a4 4 0 0 1-4 4H24a4 4 0 0 1-4-4V42z'),
    svgPath('M16 38l6-18h48l6 18'),
    svgPath('M22 20h48'),
    svgPath('M28 42v-6'),
    svgPath('M40 42v-6'),
    svgPath('M52 42v-6'),
    svgPath('M64 42v-6'),
    svgPath('M34 78V58a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v20'),
    svgPath('M26 50h12'),
    svgPath('M54 50h12')
  );
  return svg;
}

function createItemSvg(id) {
  const svg = createSvgBase(46, 46);

  if (id.includes('match')) {
    addSoftFill(svg, 'M23 9a11 11 0 0 1 6 20v6H17v-6a11 11 0 0 1 6-20z');
    svg.append(svgPath('M23 9a11 11 0 0 1 6 20v6H17v-6a11 11 0 0 1 6-20z'), svgPath('M19 39h8'), svgPath('M20 23l3 3 5-7'));
    return svg;
  }

  if (id.includes('tea')) {
    addSoftFill(svg, 'M12 19h16v9a8 8 0 0 1-16 0v-9z');
    svg.append(svgPath('M12 19h16v9a8 8 0 0 1-16 0v-9z'), svgPath('M28 22h3a4 4 0 0 1 0 8h-3'), svgPath('M15 13c1.5-2 1.5-4 0-6'), svgPath('M22 13c1.5-2 1.5-4 0-6'));
    return svg;
  }

  if (id.includes('flower')) {
    addSoftFill(svg, 'M23 23c-8-2-8-12 0-10 8-2 8 8 0 10z');
    svg.append(svgPath('M23 23v15'), svgPath('M23 23c-8-2-8-12 0-10 8-2 8 8 0 10z'), svgPath('M23 23c-6 5-13 0-8-6'), svgPath('M23 23c6 5 13 0 8-6'), svgPath('M23 29c-5 0-7 4-7 4'), svgPath('M23 31c5 0 7 4 7 4'));
    return svg;
  }

  if (id.includes('cake')) {
    addSoftFill(svg, 'M10 23h26v12a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V23z');
    svg.append(svgPath('M10 23h26v12a3 3 0 0 1-3 3H13a3 3 0 0 1-3-3V23z'), svgPath('M13 17h20a3 3 0 0 1 3 3v3H10v-3a3 3 0 0 1 3-3z'), svgPath('M17 17v-5'), svgPath('M23 17v-5'), svgPath('M29 17v-5'));
    return svg;
  }

  if (id.includes('ticket')) {
    addSoftFill(svg, 'M12 14h23v6a4 4 0 0 0 0 8v6H12v-6a4 4 0 0 0 0-8v-6z');
    svg.append(svgPath('M12 14h23v6a4 4 0 0 0 0 8v6H12v-6a4 4 0 0 0 0-8v-6z'), svgPath('M20 19h8'), svgPath('M20 25h6'), svgPath('M20 31h8'));
    return svg;
  }

  if (id.includes('food')) {
    addSoftFill(svg, 'M12 20h22l-3 17H15l-3-17z');
    svg.append(svgPath('M12 20h22l-3 17H15l-3-17z'), svgPath('M15 20l3-8h10l3 8'), svgPath('M18 26h10'), svgPath('M19 31h8'));
    return svg;
  }

  if (id.includes('fish')) {
    addSoftFill(svg, 'M10 23c6-8 17-8 24 0-7 8-18 8-24 0z');
    svg.append(svgPath('M10 23c6-8 17-8 24 0-7 8-18 8-24 0z'), svgPath('M34 23l6-5v10l-6-5z'), svgPath('M18 23h.1'), svgPath('M24 18c2 3 2 7 0 10'));
    return svg;
  }

  if (id.includes('ball')) {
    addSoftFill(svg, 'M23 10a13 13 0 1 1 0 26 13 13 0 0 1 0-26z');
    svg.append(svgPath('M23 10a13 13 0 1 1 0 26 13 13 0 0 1 0-26z'), svgPath('M13 22c6 0 10-4 10-12'), svgPath('M23 36c0-7 4-11 13-12'));
    return svg;
  }

  if (id.includes('bell')) {
    addSoftFill(svg, 'M14 31h18c-3-4-3-7-3-12a6 6 0 0 0-12 0c0 5 0 8-3 12z');
    svg.append(svgPath('M14 31h18c-3-4-3-7-3-12a6 6 0 0 0-12 0c0 5 0 8-3 12z'), svgPath('M20 35a3 3 0 0 0 6 0'), svgPath('M23 10V7'));
    return svg;
  }

  addSoftFill(svg, 'M13 11h20l4 10-14 17L9 21l4-10z');
  svg.append(svgPath('M13 11h20l4 10-14 17L9 21l4-10z'), svgPath('M9 21h28'), svgPath('M18 11l-2 10 7 17'), svgPath('M28 11l2 10-7 17'));
  return svg;
}

function createSvgBase(width, height) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}

function svgPath(d) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  return path;
}

function addSoftFill(svg, d) {
  const path = svgPath(d);
  path.setAttribute('fill', 'var(--bg-card)');
  path.setAttribute('opacity', '0.55');
  svg.appendChild(path);
}

// 依赖：../core/storage.js 的 getData/setData/generateId/getNow/getAllDB/setDB/getDB/deleteDB/compressImage；../core/ui.js 的 showToast/showConfirm/showBottomSheet/hideBottomSheet/createIcon；./wallet.js 的 getBalance/deductBalance
