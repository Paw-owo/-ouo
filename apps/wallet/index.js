// apps/wallet/index.js
// 钱包 App——你的小金库，也是她的小零钱包。
// 功能：
//   1) 状态存 localStorage KEYS.walletState：
//      {globalBalance, characters:{charId:balance}, transactions:[{id,type,amount,note,category,characterId?,fromUser?,createdAt}]}
//      兼容旧版 {balance, transactions:[...]}：读取时 balance -> globalBalance
//   2) 顶部大卡片：用户余额（大字）+ 编辑按钮（直接改 globalBalance）+ 本月收支统计
//   3) 她的零钱包：列出所有 AI 角色 + 各自余额（首次 5000）+ 转账按钮
//   4) 转账：bottomSheet 选方向（我转给她 / 她转给我）+ 金额 + 备注，余额不足 alert，转账后 bus.emit('wallet:changed')
//   5) 交易明细：列表倒序，类型图标 + 金额 + 备注 + 分类 + 涉及角色 + 时间；筛选 全部/收入/支出/按角色
//   6) 删除交易带 showConfirm，删除后反转用户余额与角色余额
//   7) 余额变色：正数 var(--accent)，负数 #E8888C
//   8) 全中文注释 + 第一人称软萌文案，所有图标走 createIcon（SVG 线稿，无 emoji）
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js, core/app-bg.js
//       ./styles.js, ./panels.js, ./sheets.js

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, setData, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { applyAppBg } from '../../core/app-bg.js';
import { injectWalletStyles } from './styles.js';
import {
  INITIAL_BALANCE,
  INITIAL_NOTE,
  INITIAL_CHAR_BALANCE,
  monthStats,
  renderHero,
  renderCharPanel,
  renderFilters,
  renderTxList,
  bindTxEvents,
  charName
} from './panels.js';
import { openEditor, openTransfer, openEditBalance, confirmDeleteTx } from './sheets.js';

let containerEl = null;
// 当前筛选：'all' | 'income' | 'expense' | 'char:<id>'
let currentFilter = 'all';
// 角色缓存（一次 render 拉一次），charMap 方便交易卡片查角色名
let cachedCharacters = [];
let cachedCharMap = new Map();

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  injectWalletStyles();
  currentFilter = 'all';
  // 首次进入初始化小金库（送 1000 零花钱）
  ensureState();
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="wallet-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">你的小金库</div>
      <button class="app-add" id="wallet-add" aria-label="记一笔">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="wallet-body"></div>
  `;
  container.querySelector('#wallet-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#wallet-add').addEventListener('click', () => openEditor({
    onSave: handleAddTx
  }));
  await render();
  // 末尾应用背景层
  applyAppBg(container, 'wallet');
}

export function unmount() {
  containerEl = null;
  cachedCharacters = [];
  cachedCharMap = new Map();
}

// ════════════════════════════════════════
// 状态读写（含旧版迁移）
// ════════════════════════════════════════

function ensureState() {
  let s = getData(KEYS.walletState, null);
  if (!s || typeof s !== 'object') {
    s = {
      globalBalance: INITIAL_BALANCE,
      characters: {},
      transactions: [{
        id: generateId('tx'),
        type: 'income',
        amount: INITIAL_BALANCE,
        note: INITIAL_NOTE,
        category: '红包',
        createdAt: getNow()
      }]
    };
    setData(KEYS.walletState, s);
    return s;
  }
  // 兼容迁移：旧 balance -> globalBalance
  if (s.globalBalance === undefined) {
    if (typeof s.balance === 'number') s.globalBalance = s.balance;
    else s.globalBalance = INITIAL_BALANCE;
  }
  if (!s.characters || typeof s.characters !== 'object') s.characters = {};
  if (!Array.isArray(s.transactions)) s.transactions = [];
  // balance 字段始终与 globalBalance 同步，方便 shop 等旧读取
  s.balance = s.globalBalance;
  return s;
}

function saveState(state) {
  state.balance = state.globalBalance;
  setData(KEYS.walletState, state);
}

// 手动记一笔：push tx + 同步 globalBalance
function addTransaction(state, tx) {
  state.transactions.push(tx);
  const amt = Number(tx.amount) || 0;
  state.globalBalance += (tx.type === 'income' ? amt : -amt);
  state.balance = state.globalBalance;
}

// 转账：调整用户余额 + 角色余额 + push tx
function transfer(state, { characterId, amount, note, fromUser }) {
  const amt = Math.round(amount * 100) / 100;
  const type = fromUser ? 'expense' : 'income';
  const tx = {
    id: generateId('tx'),
    type,
    amount: amt,
    note: note || '',
    category: '转账',
    characterId,
    fromUser,
    createdAt: getNow()
  };
  state.transactions.push(tx);
  state.globalBalance += (fromUser ? -amt : amt);
  state.balance = state.globalBalance;
  const cur = Number(state.characters[characterId]) || 0;
  state.characters[characterId] = cur + (fromUser ? amt : -amt);
  return tx;
}

// 删除交易：反转用户余额（按 type）；若是转账，同步反转角色余额（按 fromUser）
function deleteTransaction(state, id) {
  const idx = state.transactions.findIndex((t) => t.id === id);
  if (idx < 0) return false;
  const t = state.transactions[idx];
  const amt = Number(t.amount) || 0;
  state.globalBalance += (t.type === 'income' ? -amt : amt);
  if (t.characterId && t.fromUser !== undefined) {
    const cur = Number(state.characters[t.characterId]) || 0;
    state.characters[t.characterId] = cur + (t.fromUser ? -amt : amt);
  }
  state.balance = state.globalBalance;
  state.transactions.splice(idx, 1);
  return true;
}

// 直接改用户余额
function setUserBalance(state, value) {
  state.globalBalance = Math.round(value * 100) / 100;
  state.balance = state.globalBalance;
}

// 确保某角色余额存在（首次显示时初始化 5000），返回是否新建
function ensureCharacterBalance(state, charId) {
  if (state.characters[charId] === undefined || state.characters[charId] === null) {
    state.characters[charId] = INITIAL_CHAR_BALANCE;
    return true;
  }
  return false;
}

// ════════════════════════════════════════
// 渲染
// ════════════════════════════════════════

async function render() {
  const bodyEl = containerEl?.querySelector('#wallet-body');
  if (!bodyEl) return;

  // 拉取所有角色
  try {
    cachedCharacters = await getAllDB(STORES.characters);
  } catch (e) {
    console.warn('[wallet] 读取角色失败', e);
    cachedCharacters = [];
  }
  cachedCharacters.sort((a, b) => {
    const na = a.nickname || a.name || '';
    const nb = b.nickname || b.name || '';
    return na.localeCompare(nb, 'zh');
  });
  cachedCharMap = new Map(cachedCharacters.map((c) => [c.id, c]));

  const state = ensureState();
  // 首次显示的角色送 5000 零花钱（一次性）
  let newCount = 0;
  let firstName = '';
  cachedCharacters.forEach((c) => {
    if (ensureCharacterBalance(state, c.id)) {
      newCount++;
      if (!firstName) firstName = charName(c);
    }
  });
  if (newCount > 0) {
    saveState(state);
    if (newCount === 1) {
      showToast(`送了${firstName} 5000 零花钱`, 'success', 1500);
    } else {
      showToast(`给${newCount} 位小伙伴各送了 5000 零花钱`, 'success', 1600);
    }
  }

  const stats = monthStats(state.transactions);
  const txs = filterAndSortTxs(state.transactions);

  bodyEl.innerHTML = `
    ${renderHero(state, stats)}
    ${renderCharPanel(cachedCharacters, state)}
    <div class="wallet-section-title">${createIcon('memo', 16).outerHTML}收支明细</div>
    ${renderFilters(currentFilter, cachedCharacters)}
    <div id="wallet-list">${renderTxList(txs, cachedCharMap)}</div>
  `;

  bindBodyEvents(bodyEl, state);
}

// 交易按筛选 + 倒序
function filterAndSortTxs(transactions) {
  let list = transactions.slice();
  if (currentFilter === 'income') {
    list = list.filter((t) => t.type === 'income');
  } else if (currentFilter === 'expense') {
    list = list.filter((t) => t.type === 'expense');
  } else if (currentFilter.startsWith('char:')) {
    const cid = currentFilter.slice(5);
    list = list.filter((t) => t.characterId === cid);
  }
  list.sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
  return list;
}

// 给 body 里所有按钮绑定事件
function bindBodyEvents(bodyEl, state) {
  // 改余额
  const editBtn = bodyEl.querySelector('#wallet-edit-balance');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      openEditBalance({
        current: state.globalBalance,
        onConfirm: (val) => {
          const s = ensureState();
          setUserBalance(s, val);
          saveState(s);
          showToast('余额改好啦', 'success', 1200);
          render();
        }
      });
    });
  }

  // 转账按钮
  bodyEl.querySelectorAll('.wallet-char-transfer').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cid = btn.dataset.transfer;
      const c = cachedCharacters.find((x) => x.id === cid);
      if (!c) return;
      const s = ensureState();
      ensureCharacterBalance(s, c.id);
      saveState(s);
      openTransfer({
        character: c,
        userBalance: s.globalBalance,
        charBalance: Number(s.characters[c.id]) || 0,
        onConfirm: ({ amount, note, fromUser }) => handleTransfer(c, { amount, note, fromUser })
      });
    });
  });

  // 筛选
  bodyEl.querySelectorAll('.wallet-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter || 'all';
      render();
    });
  });

  // 删除交易
  const listEl = bodyEl.querySelector('#wallet-list');
  bindTxEvents(listEl, null, (id) => {
    confirmDeleteTx(() => {
      const s = ensureState();
      deleteTransaction(s, id);
      saveState(s);
      showToast('删掉啦，余额已经重算', 'default', 1200);
      render();
    });
  });
}

// ════════════════════════════════════════
// 业务回调
// ════════════════════════════════════════

function handleAddTx({ type, amount, category, note }) {
  const s = ensureState();
  addTransaction(s, {
    id: generateId('tx'),
    type,
    amount,
    note,
    category,
    createdAt: getNow()
  });
  saveState(s);
  showToast(type === 'income' ? '记下啦，小金库多了一点' : '记下啦，花得明明白白', 'success', 1400);
  render();
}

function handleTransfer(character, { amount, note, fromUser }) {
  const s = ensureState();
  transfer(s, { characterId: character.id, amount, note, fromUser });
  saveState(s);
  const name = charName(character);
  showToast(fromUser ? `转给${name}啦` : `${name}转给你啦`, 'success', 1400);
  // 通知消息中心：delta 带方向（inbox 据此决定文案）
  bus.emit('wallet:changed', {
    delta: fromUser ? -amount : amount,
    amount,
    note,
    characterId: character.id,
    characterName: name,
    fromUser
  });
  render();
}
