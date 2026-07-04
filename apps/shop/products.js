// apps/shop/products.js
// 商店 App 的商品层——默认商品、自定义商品、上下架、隐藏、编辑、删除都在这。
// 数据：
//   KEYS.shopState = { products:[自定义商品], hidden:[被隐藏的默认商品 id] }
//   默认商品写死在本文件，custom:false；自定义商品 custom:true。
// 红线：图标只走 createIcon（SVG 线稿）；视觉值走 CSS 变量；全中文注释 + 第一人称软萌文案。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/util.js

import { KEYS } from '../../core/storage-keys.js';
import { getData, setData, generateId } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import { isUsableImage } from '../../core/util.js';

// ════════════════════════════════════════
// 常量
// ════════════════════════════════════════

// 分类筛选标签（含「全部」由 index 拼接，这里只给商品分类）
export const CATEGORIES = ['礼物', '装饰', '食物', '道具', '纪念物', '互动券'];

// 自定义商品可选的图标（从现有 SVG 线稿名里挑适合做商品的）
export const ICON_OPTIONS = [
  'heart', 'star', 'gift', 'camera', 'dream', 'smile', 'moon', 'sun',
  'bell', 'home', 'dice', 'games', 'music', 'chat', 'memo', 'calendar',
  'wallet', 'play', 'phone'
];

// 默认商品清单（写死，覆盖六大类，至少 10 个）
export const DEFAULT_PRODUCTS = [
  { id: 'cake',          name: '草莓蛋糕',     desc: '甜甜的，她会很开心',   price: 50,  icon: 'heart',    category: '礼物' },
  { id: 'gift_box',      name: '神秘礼盒',     desc: '拆开才知道里面是什么', price: 120, icon: 'gift',     category: '礼物' },
  { id: 'bell_bracelet', name: '小铃铛手链',   desc: '走起路来叮叮响',       price: 150, icon: 'bell',     category: '礼物' },
  { id: 'star_lamp',     name: '星星灯',       desc: '夜里陪着她做梦',       price: 80,  icon: 'star',     category: '装饰' },
  { id: 'film_camera',   name: '小相机',       desc: '记下你们的每个瞬间',   price: 200, icon: 'camera',   category: '装饰' },
  { id: 'dream_catcher', name: '捕梦网',       desc: '把噩梦都兜走啦',       price: 90,  icon: 'dream',    category: '装饰' },
  { id: 'home_keychain', name: '小房子钥匙扣', desc: '回家的钥匙有了伴',     price: 60,  icon: 'home',     category: '装饰' },
  { id: 'smile_cookie',  name: '笑脸饼干',     desc: '咬一口就开心起来',     price: 30,  icon: 'smile',    category: '食物' },
  { id: 'moon_tea',      name: '月光茶',       desc: '晚上喝一杯暖暖的',     price: 40,  icon: 'moon',     category: '食物' },
  { id: 'sun_lolly',     name: '太阳冰棍',     desc: '夏天的味道',           price: 25,  icon: 'sun',      category: '食物' },
  { id: 'dice_charm',    name: '幸运骰子',     desc: '随身带着好运气',       price: 100, icon: 'dice',     category: '道具' },
  { id: 'game_token',    name: '游戏代币',     desc: '下次一起玩的时候用',   price: 75,  icon: 'games',    category: '道具' },
  { id: 'love_letter',   name: '手写情书',     desc: '一笔一划都是心意',     price: 180, icon: 'memo',     category: '纪念物' },
  { id: 'first_ticket',  name: '第一次电影票', desc: '把那一张票留住',       price: 220, icon: 'star',     category: '纪念物' },
  { id: 'hug_coupon',    name: '抱抱券',       desc: '随时兑换一个抱抱',     price: 90,  icon: 'heart',    category: '互动券' },
  { id: 'date_coupon',   name: '约会券',       desc: '指定一天的约会',       price: 150, icon: 'calendar', category: '互动券' },
  { id: 'sing_coupon',   name: '唱歌给你听券', desc: '她专属的小演唱会',     price: 130, icon: 'music',    category: '互动券' }
];

// ════════════════════════════════════════
// 共用小工具
// ════════════════════════════════════════

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
export function escapeAttr(s) { return escapeHTML(s); }

export function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, '\\$&');
}

// 金币显示（整数，四舍五入）
export function formatCoins(n) {
  return String(Math.round(Number(n) || 0));
}

// 角色显示名
export function charName(char) {
  if (!char) return '她';
  return char.nickname || char.name || '她';
}

// 角色选择列表里的小头像（有图走图，没图走 smile 线稿）
export function renderPickAvatar(char, size = 40) {
  if (char && isUsableImage(char.avatar)) {
    return `<div class="shop-pick-avatar" style="background-image:url('${escapeAttr(char.avatar)}')"></div>`;
  }
  return `<div class="shop-pick-avatar">${createIcon('smile', Math.round(size * 0.55)).outerHTML}</div>`;
}

// ════════════════════════════════════════
// shopState 读写（兼容旧结构）
// ════════════════════════════════════════

export function readShopState() {
  let s = getData(KEYS.shopState, null);
  // 兼容：旧数据可能是数组（商品列表）或缺少字段
  if (Array.isArray(s)) s = { products: s, hidden: [] };
  if (!s || typeof s !== 'object') s = { products: [], hidden: [] };
  if (!Array.isArray(s.products)) s.products = [];
  if (!Array.isArray(s.hidden)) s.hidden = [];
  return s;
}

export function writeShopState(state) {
  setData(KEYS.shopState, state);
}

// 合并默认商品 + 自定义商品，统一打上 onShelf / custom 标记
export function getMergedProducts(state) {
  const customList = (state.products || []).map((p) => ({
    ...p,
    custom: true,
    onShelf: p.onShelf !== false
  }));
  const defaultList = DEFAULT_PRODUCTS.map((p) => ({
    ...p,
    custom: false,
    onShelf: !state.hidden.includes(p.id)
  }));
  return [...defaultList, ...customList];
}

// 当前可见商品（上架 + 未隐藏 + 分类匹配）
export function getVisibleProducts(state, filter) {
  return getMergedProducts(state).filter((p) => {
    if (p.onShelf === false) return false;
    if (filter && filter !== '全部' && p.category !== filter) return false;
    return true;
  });
}

// ════════════════════════════════════════
// 渲染：商品网格 / 卡片
// ════════════════════════════════════════

export function renderProductGrid(products) {
  if (!products || products.length === 0) {
    return `
      <div class="empty-state" style="padding:40px 12px">
        <div class="shop-empty-icon">${createIcon('shop', 48).outerHTML}</div>
        <div class="empty-state-text">这个分类下还没有东西呢</div>
      </div>
    `;
  }
  return `<div class="shop-grid">${products.map(renderProductCard).join('')}</div>`;
}

export function renderProductCard(p) {
  const customTag = p.custom ? 'custom' : '';
  return `
    <div class="shop-card ${customTag}" data-id="${escapeAttr(p.id)}">
      <div class="shop-card-icon">${createIcon(p.icon || 'gift', 26).outerHTML}</div>
      <div class="shop-card-name">${escapeHTML(p.name)}</div>
      <div class="shop-card-desc">${escapeHTML(p.desc || '')}</div>
      <div class="shop-card-foot">
        <span class="shop-card-price">${formatCoins(p.price)} 金币</span>
        <button class="shop-buy" data-buy="${escapeAttr(p.id)}" aria-label="购买${escapeAttr(p.name)}">${createIcon('plus', 14).outerHTML}购买</button>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════
// 自定义商品编辑器（新增 / 编辑）
// ════════════════════════════════════════

export function openProductEditor({ prefill = null, onSave, onDelete = null } = {}) {
  const isEdit = !!prefill;
  const init = prefill || {
    name: '', desc: '', price: '', icon: ICON_OPTIONS[0], category: CATEGORIES[0], onShelf: true
  };
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="shop-form-row">
      <label class="shop-form-label" for="shop-p-name">名字</label>
      <input class="input" id="shop-p-name" type="text" maxlength="20" placeholder="给心意起个名字呀" value="${escapeAttr(init.name)}">
    </div>
    <div class="shop-form-row">
      <label class="shop-form-label" for="shop-p-desc">描述</label>
      <textarea class="textarea" id="shop-p-desc" maxlength="60" placeholder="想说点什么...">${escapeHTML(init.desc || '')}</textarea>
    </div>
    <div class="shop-form-row">
      <label class="shop-form-label" for="shop-p-price">价格（金币）</label>
      <input class="input" id="shop-p-price" type="number" inputmode="numeric" min="0" step="1" placeholder="多少金币呀" value="${escapeAttr(String(init.price))}">
    </div>
    <div class="shop-form-row">
      <label class="shop-form-label" for="shop-p-icon">图标</label>
      <select class="select" id="shop-p-icon">
        ${ICON_OPTIONS.map((n) => `<option value="${escapeAttr(n)}" ${n === init.icon ? 'selected' : ''}>${escapeHTML(n)}</option>`).join('')}
      </select>
    </div>
    <div class="shop-form-row">
      <label class="shop-form-label" for="shop-p-cat">分类</label>
      <select class="select" id="shop-p-cat">
        ${CATEGORIES.map((c) => `<option value="${escapeAttr(c)}" ${c === init.category ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('')}
      </select>
    </div>
    <div class="shop-form-row">
      <div class="shop-toggle-row">
        <div>
          <div class="shop-toggle-text">上架出售</div>
          <div class="shop-toggle-hint">关掉就先藏起来啦</div>
        </div>
        <button type="button" class="shop-switch ${init.onShelf !== false ? 'on' : ''}" id="shop-p-shelf" aria-label="切换上架"></button>
      </div>
    </div>
    <div class="shop-form-actions">
      ${isEdit ? `<button class="btn danger" id="shop-p-del">${createIcon('trash', 14).outerHTML}删除</button>` : ''}
      <button class="btn primary" id="shop-p-save">${isEdit ? '保存' : '加进来'}</button>
    </div>
  `;
  const sheet = showBottomSheet({
    title: isEdit ? '编辑商品' : '新增心意',
    bodyElement: body,
    dismissible: true
  });

  let onShelf = init.onShelf !== false;
  const shelfBtn = body.querySelector('#shop-p-shelf');
  shelfBtn.addEventListener('click', () => {
    onShelf = !onShelf;
    shelfBtn.classList.toggle('on', onShelf);
  });

  body.querySelector('#shop-p-save').addEventListener('click', () => {
    const name = body.querySelector('#shop-p-name').value.trim();
    const desc = body.querySelector('#shop-p-desc').value.trim();
    const priceRaw = body.querySelector('#shop-p-price').value.trim();
    const price = parseInt(priceRaw, 10);
    const icon = body.querySelector('#shop-p-icon').value || 'gift';
    const category = body.querySelector('#shop-p-cat').value || '礼物';
    if (!name) {
      showToast('得有个名字呀', 'error');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      showToast('价格得是个非负数嘛', 'error');
      return;
    }
    sheet.close();
    if (typeof onSave === 'function') {
      onSave({
        id: init.id || generateId('prod'),
        name, desc, price, icon, category, onShelf,
        custom: true
      });
    }
  });

  if (isEdit) {
    body.querySelector('#shop-p-del').addEventListener('click', () => {
      sheet.close();
      if (typeof onDelete === 'function') onDelete(init.id);
    });
  }
  setTimeout(() => { try { body.querySelector('#shop-p-name')?.focus(); } catch (e) {} }, 60);
  return sheet;
}

// ════════════════════════════════════════
// 商品管理（列表 + 显隐切换 + 编辑 + 删除）
// ════════════════════════════════════════

// state 用 getState() 闭包取最新的，避免列表刷新时拿到旧引用
export function openManagement({ getState, onToggle, onEdit, onDelete } = {}) {
  const body = document.createElement('div');
  const sheet = showBottomSheet({
    title: '管理商品',
    bodyElement: body,
    dismissible: true
  });

  // 重新读取最新状态并刷新列表（每次增删改后都调一次）
  function refresh() {
    const merged = getMergedProducts(getState());
    body.innerHTML = renderManagementList(merged);
    bindManagementEvents(body, merged, { onToggle, onEdit, onDelete });
  }
  refresh();
  return { sheet, refresh };
}

function renderManagementList(merged) {
  if (merged.length === 0) {
    return `
      <div class="empty-state" style="padding:24px 8px">
        <div class="shop-empty-icon">${createIcon('shop', 48).outerHTML}</div>
        <div class="empty-state-text">还没有商品呢</div>
      </div>
    `;
  }
  return merged.map((p) => {
    const visible = p.onShelf !== false;
    const sub = `${escapeHTML(p.category)} · ${formatCoins(p.price)} 金币${p.custom ? ' · 自定义' : ' · 默认'}`;
    const hideBtn = visible
      ? `<button class="shop-mgmt-btn hide" data-hide="${escapeAttr(p.id)}" aria-label="隐藏" title="隐藏">${createIcon('lock', 16).outerHTML}</button>`
      : `<button class="shop-mgmt-btn show" data-show="${escapeAttr(p.id)}" aria-label="显示" title="显示">${createIcon('unlock', 16).outerHTML}</button>`;
    const editBtn = p.custom
      ? `<button class="shop-mgmt-btn edit" data-edit="${escapeAttr(p.id)}" aria-label="编辑" title="编辑">${createIcon('edit', 16).outerHTML}</button>`
      : '';
    const delBtn = p.custom
      ? `<button class="shop-mgmt-btn del" data-del="${escapeAttr(p.id)}" aria-label="删除" title="删除">${createIcon('trash', 16).outerHTML}</button>`
      : '';
    return `
      <div class="shop-mgmt-item" data-id="${escapeAttr(p.id)}">
        <div class="shop-mgmt-icon">${createIcon(p.icon || 'gift', 18).outerHTML}</div>
        <div class="shop-mgmt-main">
          <div class="shop-mgmt-name">${escapeHTML(p.name)}</div>
          <div class="shop-mgmt-sub">${sub}</div>
        </div>
        <div class="shop-mgmt-actions">
          ${hideBtn}${editBtn}${delBtn}
        </div>
      </div>
    `;
  }).join('');
}

function bindManagementEvents(body, merged, ctx) {
  const find = (id) => merged.find((p) => p.id === id);
  body.querySelectorAll('[data-hide]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = find(btn.dataset.hide);
      if (p && typeof ctx.onToggle === 'function') ctx.onToggle(p, false);
    });
  });
  body.querySelectorAll('[data-show]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = find(btn.dataset.show);
      if (p && typeof ctx.onToggle === 'function') ctx.onToggle(p, true);
    });
  });
  body.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = find(btn.dataset.edit);
      if (p && typeof ctx.onEdit === 'function') ctx.onEdit(p);
    });
  });
  body.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const p = find(btn.dataset.del);
      if (!p) return;
      showConfirm({
        title: '删掉这个商品吗？',
        body: `删掉「${p.name}」就找不回来啦`,
        confirmText: '删掉吧',
        cancelText: '留着',
        danger: true,
        onConfirm: () => {
          if (typeof ctx.onDelete === 'function') ctx.onDelete(p);
        }
      });
    });
  });
}
