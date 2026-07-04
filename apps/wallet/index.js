// apps/wallet/index.js
// 钱包 App——你的小金库。
// 功能：
//   1) 状态存 localStorage KEYS.walletState：{balance, transactions:[{id,type,amount,note,category,createdAt}]}
//   2) 首次进入送 1000 零花钱（写一条 income 交易）
//   3) 顶部大卡片：余额大字 + 本月收支统计（收入X / 支出Y）
//   4) 交易列表按 createdAt 倒序：类型图标(income=plus / expense=minus) + 金额 + 备注 + 分类 + 时间
//   5) 右上角 + 添加交易（bottomSheet 表单：类型 + 金额 + 分类 select + 备注）
//   6) 删除交易带 showConfirm，删除后重算余额
//   7) 余额变色：正数 var(--accent)，负数 #E8888C
//   8) 全中文注释 + 第一人称软萌文案，所有图标走 createIcon（SVG 线稿）
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { KEYS } from '../../core/storage-keys.js';
import { getData, setData, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, formatRelative } from '../../core/util.js';

let containerEl = null;

// 分类清单（内容数据，中文）
const CATEGORIES = ['餐饮', '交通', '购物', '工资', '红包', '其他'];
// 首次进入赠送的零花钱
const INITIAL_BALANCE = 1000;
const INITIAL_NOTE = '初次见面的零花钱';

// 自定义样式（全部走 CSS 变量，负数色 #E8888C 是与 .btn.danger 一致的红粉警示色）
injectStyle('app-wallet-style', `
  .wallet-hero{
    background:linear-gradient(135deg, var(--bg-card) 0%, color-mix(in srgb, var(--accent) 12%, var(--bg-card)) 100%);
    border:1px solid color-mix(in srgb, var(--accent) 22%, transparent);
    border-radius:var(--radius-card);
    padding:22px 20px 18px;
    box-shadow:var(--shadow-sm);
    margin-bottom:16px;
  }
  .wallet-hero-label{
    font-size:var(--font-size-small);
    color:var(--text-secondary);
    margin-bottom:6px;
  }
  .wallet-hero-balance{
    font-size:var(--font-size-huge);
    font-weight:700;
    line-height:1.15;
    letter-spacing:0.5px;
    color:var(--accent);
    word-break:break-all;
  }
  .wallet-hero-balance.neg{ color:#E8888C; }
  .wallet-hero-stats{
    display:flex; gap:18px; margin-top:14px;
    padding-top:12px;
    border-top:1px solid color-mix(in srgb, var(--text-hint) 16%, transparent);
  }
  .wallet-stat{ flex:1; min-width:0; }
  .wallet-stat-label{
    font-size:var(--font-size-small);
    color:var(--text-hint);
  }
  .wallet-stat-value{
    font-size:var(--font-size-title);
    font-weight:600;
    margin-top:2px;
    color:var(--text-primary);
  }
  .wallet-stat-value.income{ color:var(--accent); }
  .wallet-stat-value.expense{ color:#E8888C; }
  .wallet-section-title{
    font-size:var(--font-size-base);
    color:var(--text-secondary);
    margin:4px 2px 10px;
    display:flex; align-items:center; gap:6px;
  }
  .wallet-tx{
    display:flex; align-items:center; gap:12px;
    background:var(--bg-card);
    border-radius:var(--radius-card);
    padding:12px 14px;
    box-shadow:var(--shadow-sm);
    margin-bottom:10px;
    transition:var(--motion);
  }
  .wallet-tx:active{ transform:scale(var(--press-scale)); }
  .wallet-tx-icon{
    width:38px; height:38px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    flex-shrink:0;
  }
  .wallet-tx-icon.income{
    background:color-mix(in srgb, var(--accent) 18%, transparent);
    color:var(--accent);
  }
  .wallet-tx-icon.expense{
    background:color-mix(in srgb, #E8888C 18%, transparent);
    color:#E8888C;
  }
  .wallet-tx-main{ flex:1; min-width:0; }
  .wallet-tx-note{
    font-size:var(--font-size-base);
    color:var(--text-primary);
    font-weight:500;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .wallet-tx-meta{
    font-size:var(--font-size-small);
    color:var(--text-hint);
    margin-top:3px;
    display:flex; align-items:center; gap:8px;
  }
  .wallet-tx-meta span + span::before{
    content:''; display:inline-block;
    width:3px; height:3px; border-radius:50%;
    background:var(--text-hint);
    margin-right:8px; vertical-align:middle;
    opacity:0.7;
  }
  .wallet-tx-amount{
    font-size:var(--font-size-title);
    font-weight:600;
    flex-shrink:0;
  }
  .wallet-tx-amount.income{ color:var(--accent); }
  .wallet-tx-amount.expense{ color:#E8888C; }
  .wallet-tx-del{
    width:30px; height:30px; border-radius:50%;
    background:transparent; color:var(--text-hint);
    display:flex; align-items:center; justify-content:center;
    transition:var(--motion);
    flex-shrink:0;
  }
  .wallet-tx-del:active{ transform:scale(var(--press-scale)); }
  .wallet-form-row{ margin-bottom:14px; }
  .wallet-form-label{
    font-size:var(--font-size-small);
    color:var(--text-secondary);
    margin-bottom:6px; display:block;
  }
  .wallet-type-toggle{ display:flex; gap:8px; }
  .wallet-type-btn{
    flex:1; padding:10px;
    border-radius:var(--radius-md);
    background:color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    color:var(--text-secondary);
    font-size:var(--font-size-base);
    border:1px solid transparent;
    display:flex; align-items:center; justify-content:center; gap:6px;
    transition:var(--motion);
  }
  .wallet-type-btn:active{ transform:scale(var(--press-scale)); }
  .wallet-type-btn.active.income{
    background:color-mix(in srgb, var(--accent) 18%, transparent);
    color:var(--accent); border-color:var(--accent);
  }
  .wallet-type-btn.active.expense{
    background:color-mix(in srgb, #E8888C 18%, transparent);
    color:#E8888C; border-color:#E8888C;
  }
  .wallet-empty-icon{ color:var(--text-hint); opacity:0.5; margin-bottom:12px; }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
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
  container.querySelector('#wallet-add').addEventListener('click', () => openEditor(null));
  await render();
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 状态读写
// ════════════════════════════════════════

function ensureState() {
  let s = getData(KEYS.walletState, null);
  if (!s || typeof s !== 'object') {
    s = {
      balance: INITIAL_BALANCE,
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
  if (!Array.isArray(s.transactions)) s.transactions = [];
  // 兜底：余额始终以交易为准重算，避免与 shop 等其他 App 写入后漂移
  s.balance = recomputeBalance(s.transactions);
  return s;
}

function saveState(state) {
  state.balance = recomputeBalance(state.transactions);
  setData(KEYS.walletState, state);
}

function recomputeBalance(transactions) {
  return transactions.reduce((sum, t) => {
    const amt = Number(t.amount) || 0;
    return sum + (t.type === 'expense' ? -amt : amt);
  }, 0);
}

function monthStats(transactions) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  let income = 0, expense = 0;
  transactions.forEach((t) => {
    const d = new Date(t.createdAt);
    if (Number.isNaN(d.getTime())) return;
    if (d.getFullYear() === y && d.getMonth() === m) {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') income += amt;
      else expense += amt;
    }
  });
  return { income, expense };
}

// ════════════════════════════════════════
// 渲染
// ════════════════════════════════════════

async function render() {
  const bodyEl = containerEl?.querySelector('#wallet-body');
  if (!bodyEl) return;
  const state = ensureState();
  const txs = state.transactions.slice().sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
  const stats = monthStats(state.transactions);
  const neg = state.balance < 0;
  bodyEl.innerHTML = `
    <div class="wallet-hero">
      <div class="wallet-hero-label">小金库余额</div>
      <div class="wallet-hero-balance ${neg ? 'neg' : ''}">${formatMoney(state.balance)}</div>
      <div class="wallet-hero-stats">
        <div class="wallet-stat">
          <div class="wallet-stat-label">本月收入</div>
          <div class="wallet-stat-value income">+${formatMoney(stats.income)}</div>
        </div>
        <div class="wallet-stat">
          <div class="wallet-stat-label">本月支出</div>
          <div class="wallet-stat-value expense">-${formatMoney(stats.expense)}</div>
        </div>
      </div>
    </div>
    <div class="wallet-section-title">${createIcon('memo', 16).outerHTML}收支明细</div>
    <div id="wallet-list"></div>
  `;
  const listEl = bodyEl.querySelector('#wallet-list');
  if (txs.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="wallet-empty-icon">${createIcon('wallet', 48).outerHTML}</div>
        <div class="empty-state-text">还没有收支记录，记一笔嘛</div>
      </div>
    `;
    return;
  }
  listEl.innerHTML = txs.map(renderTxCard).join('');
  txs.forEach((t) => {
    const card = listEl.querySelector(`[data-id="${cssEscape(t.id)}"]`);
    if (!card) return;
    const del = card.querySelector('.wallet-tx-del');
    if (del) del.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(t.id); });
  });
}

function renderTxCard(t) {
  const type = t.type === 'expense' ? 'expense' : 'income';
  const icon = createIcon(type === 'income' ? 'plus' : 'minus', 18).outerHTML;
  const sign = type === 'income' ? '+' : '-';
  const amt = formatMoney(Number(t.amount) || 0);
  const note = t.note ? escapeHTML(t.note) : (type === 'income' ? '收到一笔' : '花掉一笔');
  const category = escapeHTML(t.category || '其他');
  const time = formatRelative(t.createdAt);
  const trash = createIcon('trash', 16).outerHTML;
  return `
    <div class="wallet-tx" data-id="${escapeAttr(t.id)}">
      <div class="wallet-tx-icon ${type}">${icon}</div>
      <div class="wallet-tx-main">
        <div class="wallet-tx-note">${note}</div>
        <div class="wallet-tx-meta">
          <span>${category}</span>
          <span>${escapeHTML(time)}</span>
        </div>
      </div>
      <div class="wallet-tx-amount ${type}">${sign}${amt}</div>
      <button class="wallet-tx-del" aria-label="删除这笔记录" title="删除">${trash}</button>
    </div>
  `;
}

function formatMoney(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  const s = abs.toFixed(2);
  const [int, dec] = s.split('.');
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${withSep}.${dec}`;
}

// ════════════════════════════════════════
// 删除
// ════════════════════════════════════════

function confirmDelete(id) {
  showConfirm({
    title: '删掉这笔记录吗？',
    body: '删掉后余额会重新算哦，确定就点确认嘛',
    confirmText: '删掉吧',
    cancelText: '再想想',
    danger: true,
    onConfirm: () => {
      const state = ensureState();
      state.transactions = state.transactions.filter((t) => t.id !== id);
      saveState(state);
      showToast('删掉啦，已经重新算好余额', 'default', 1200);
      render();
    }
  });
}

// ════════════════════════════════════════
// 新增表单（bottomSheet）
// ════════════════════════════════════════

function openEditor(prefill) {
  const init = prefill || { type: 'expense', amount: '', category: CATEGORIES[0], note: '' };
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="wallet-form-row">
      <label class="wallet-form-label">类型</label>
      <div class="wallet-type-toggle">
        <button type="button" class="wallet-type-btn income ${init.type === 'income' ? 'active' : ''}" data-type="income">${createIcon('plus', 16).outerHTML}收入</button>
        <button type="button" class="wallet-type-btn expense ${init.type === 'expense' ? 'active' : ''}" data-type="expense">${createIcon('minus', 16).outerHTML}支出</button>
      </div>
    </div>
    <div class="wallet-form-row">
      <label class="wallet-form-label" for="wallet-amount">金额</label>
      <input class="input" id="wallet-amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="花掉或收到多少呀" value="${escapeAttr(String(init.amount))}">
    </div>
    <div class="wallet-form-row">
      <label class="wallet-form-label" for="wallet-category">分类</label>
      <select class="select" id="wallet-category">
        ${CATEGORIES.map((c) => `<option value="${escapeAttr(c)}" ${c === init.category ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('')}
      </select>
    </div>
    <div class="wallet-form-row">
      <label class="wallet-form-label" for="wallet-note">备注</label>
      <textarea class="textarea" id="wallet-note" placeholder="想记点什么都可以写呀..." maxlength="200">${escapeHTML(init.note || '')}</textarea>
    </div>
    <button class="btn primary block" id="wallet-save">记下来</button>
  `;
  const sheet = showBottomSheet({
    title: '记一笔新的收支',
    bodyElement: body,
    dismissible: true
  });
  let chosenType = init.type === 'income' ? 'income' : 'expense';
  body.querySelectorAll('.wallet-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      chosenType = btn.dataset.type;
      body.querySelectorAll('.wallet-type-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  body.querySelector('#wallet-save').addEventListener('click', () => {
    const amountRaw = body.querySelector('#wallet-amount').value.trim();
    const amount = parseFloat(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('金额得是个正数嘛', 'error');
      return;
    }
    const category = body.querySelector('#wallet-category').value || '其他';
    const note = body.querySelector('#wallet-note').value.trim();
    const state = ensureState();
    const tx = {
      id: generateId('tx'),
      type: chosenType,
      amount: Math.round(amount * 100) / 100,
      note,
      category,
      createdAt: getNow()
    };
    state.transactions.push(tx);
    saveState(state);
    sheet.close();
    showToast(chosenType === 'income' ? '记下啦，小金库多了一点' : '记下啦，花得明明白白', 'success', 1400);
    render();
  });
  setTimeout(() => { try { body.querySelector('#wallet-amount')?.focus(); } catch (e) {} }, 60);
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
