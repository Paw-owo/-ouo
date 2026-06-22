// apps/wallet.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getDB
//   from '../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon

import {
  getData, setData, generateId, getNow, getDB
} from '../core/storage.js';

import {
  showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon
} from '../core/ui.js';

const WALLET_KEY = 'wallet';
const STYLE_ID = 'wallet-styles';
const BG_KEY = 'app_bg_wallet';

let container = null;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .wallet-screen {
      position: fixed;
      inset: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .wallet-screen.has-bg {
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }

    .wallet-soft-layer {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background: color-mix(in srgb, var(--bg-primary) 78%, transparent);
    }

    .wallet-nav {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      height: calc(56px + env(safe-area-inset-top));
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: env(safe-area-inset-top) 20px 0;
      background: var(--surface-glass);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .wallet-nav-title {
      flex: 1;
      min-width: 0;
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wallet-body {
      position: relative;
      z-index: 1;
      flex: 1;
      overflow-x: hidden;
      overflow-y: auto;
      padding: calc(56px + env(safe-area-inset-top) + 18px) 20px calc(88px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling: touch;
    }

    .wallet-balance-card {
      min-height: 188px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 22px;
      border-radius: 28px;
      background: var(--bg-card);
      box-shadow: var(--shadow-md);
    }

    .wallet-balance-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-md);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    .wallet-mark {
      width: 42px;
      height: 42px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .wallet-balance-number {
      margin-top: 18px;
      color: var(--text-primary);
      font-size: 42px;
      font-weight: 600;
      line-height: 1;
      letter-spacing: -0.04em;
    }

    .wallet-balance-number span {
      font-size: 18px;
      font-weight: 500;
      color: var(--text-secondary);
      letter-spacing: 0;
    }

    .wallet-balance-note {
      margin-top: 12px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.5;
    }

    .wallet-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-md);
      margin-top: var(--spacing-md);
    }

    .wallet-action {
      min-height: 54px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      border-radius: 18px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-base);
      font-weight: 600;
      transition: var(--motion);
    }

    .wallet-action.primary {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .wallet-action:active {
      transform: scale(0.96);
    }

    .wallet-section {
      margin-top: 24px;
    }

    .wallet-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-sm);
      padding: 0 2px;
    }

    .wallet-section-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .wallet-section-sub {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    .wallet-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .wallet-record {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: 14px;
      border-radius: 20px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .wallet-record-icon {
      width: 40px;
      height: 40px;
      flex: 0 0 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 15px;
      background: var(--surface-muted);
      color: var(--text-secondary);
    }

    .wallet-record.income .wallet-record-icon {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .wallet-record-main {
      flex: 1;
      min-width: 0;
    }

    .wallet-record-title {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 500;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wallet-record-time {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    .wallet-record-amount {
      flex: 0 0 auto;
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.4;
    }

    .wallet-record.income .wallet-record-amount {
      color: var(--accent-dark);
    }

    .wallet-record.expense .wallet-record-amount {
      color: var(--text-secondary);
    }

    .wallet-empty {
      min-height: 210px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-lg);
      border-radius: 24px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      color: var(--text-secondary);
      text-align: center;
    }

    .wallet-empty-icon {
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 20px;
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .wallet-empty-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .wallet-empty-text {
      max-width: 260px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .wallet-sheet-title {
      margin-bottom: var(--spacing-md);
      color: var(--text-primary);
      font-size: 20px;
      font-weight: 600;
      line-height: 1.35;
      letter-spacing: -0.01em;
    }

    .wallet-field {
      margin-bottom: var(--spacing-md);
    }

    .wallet-field-label {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: var(--spacing-sm);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 500;
      line-height: 1.4;
    }

    .wallet-field-label svg {
      width: 15px;
      height: 15px;
      color: var(--accent);
    }

    .wallet-input {
      width: 100%;
      min-height: 48px;
      padding: 10px var(--spacing-md);
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: var(--font-size-base);
    }

    .wallet-input::placeholder {
      color: var(--text-hint);
    }

    .wallet-sheet-actions {
      display: flex;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-lg);
    }

    .wallet-sheet-actions button {
      flex: 1;
    }
  `;

  document.head.appendChild(style);
}

function createDefaultWallet() {
  return {
    balance: 0,
    transactions: []
  };
}

function normalizeWallet(data) {
  const source = data && typeof data === 'object' ? data : {};
  const balance = Number(source.balance);

  return {
    balance: Number.isFinite(balance) ? Math.max(0, balance) : 0,
    transactions: Array.isArray(source.transactions)
      ? source.transactions
          .filter((item) => item && typeof item === 'object')
          .map((item) => ({
            id: item.id || generateId(),
            amount: Number(item.amount) || 0,
            description: item.description || '钱包记录',
            timestamp: item.timestamp || getNow(),
            type: item.type === 'expense' ? 'expense' : 'income'
          }))
          .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
      : []
  };
}

function readWallet() {
  return normalizeWallet(getData(WALLET_KEY) || createDefaultWallet());
}

function saveWallet(wallet) {
  return setData(WALLET_KEY, normalizeWallet(wallet));
}

function normalizeAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function formatMoney(amount) {
  const value = normalizeAmount(amount);
  return value.toLocaleString('zh-CN', {
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2
  });
}

function formatTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '刚刚';

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date);
}

function addTransaction(wallet, amount, description, type) {
  const transaction = {
    id: generateId(),
    amount: normalizeAmount(amount),
    description: description || (type === 'income' ? '充值' : '消费'),
    timestamp: getNow(),
    type
  };

  return {
    balance: wallet.balance,
    transactions: [transaction, ...wallet.transactions].slice(0, 200)
  };
}

export function getBalance() {
  return readWallet().balance;
}

export function addBalance(amount, description = '充值') {
  const value = normalizeAmount(amount);
  if (value <= 0) return false;

  const wallet = readWallet();
  wallet.balance = normalizeAmount(wallet.balance + value);

  const nextWallet = addTransaction(wallet, value, description, 'income');
  nextWallet.balance = wallet.balance;

  saveWallet(nextWallet);
  return true;
}

export function deductBalance(amount, description = '消费') {
  const value = normalizeAmount(amount);
  if (value <= 0) return false;

  const wallet = readWallet();
  if (wallet.balance < value) return false;

  wallet.balance = normalizeAmount(wallet.balance - value);

  const nextWallet = addTransaction(wallet, value, description, 'expense');
  nextWallet.balance = wallet.balance;

  saveWallet(nextWallet);
  return true;
}

export async function mount(containerEl) {
  injectStyles();
  container = containerEl;

  const screen = document.createElement('section');
  screen.className = 'wallet-screen';

  const softLayer = document.createElement('div');
  softLayer.className = 'wallet-soft-layer';

  const nav = document.createElement('div');
  nav.className = 'wallet-nav';

  const backButton = document.createElement('button');
  backButton.className = 'icon-button';
  backButton.type = 'button';
  backButton.setAttribute('aria-label', '返回');
  backButton.appendChild(createIcon('back', 22));
  backButton.addEventListener('click', () => window.closeCurrentApp?.());

  const title = document.createElement('div');
  title.className = 'wallet-nav-title';
  title.textContent = '钱包';

  const clearButton = document.createElement('button');
  clearButton.className = 'icon-button soft';
  clearButton.type = 'button';
  clearButton.setAttribute('aria-label', '清空记录');
  clearButton.appendChild(createIcon('clear', 22));
  clearButton.addEventListener('click', clearTransactions);

  const body = document.createElement('div');
  body.className = 'wallet-body';

  nav.append(backButton, title, clearButton);
  screen.append(softLayer, nav, body);

  container.innerHTML = '';
  container.appendChild(screen);

  await applyWalletBackground(screen);
  renderWallet();
}

export function unmount() {
  if (container) {
    container.innerHTML = '';
    container = null;
  }
}

async function applyWalletBackground(screen) {
  try {
    const record = await getDB('blobs', BG_KEY);
    const value = record?.value || '';
    if (!value) return;

    screen.classList.add('has-bg');
    screen.style.backgroundImage = `url("${value}")`;
  } catch (_) {
    screen.classList.remove('has-bg');
    screen.style.backgroundImage = '';
  }
}

function renderWallet() {
  const body = container?.querySelector('.wallet-body');
  if (!body) return;

  const wallet = readWallet();

  body.innerHTML = '';

  const balanceCard = document.createElement('section');
  balanceCard.className = 'wallet-balance-card';

  const label = document.createElement('div');
  label.className = 'wallet-balance-label';

  const labelText = document.createElement('span');
  labelText.textContent = '当前余额';

  const mark = document.createElement('div');
  mark.className = 'wallet-mark';
  mark.appendChild(createIcon('transfer', 22));

  label.append(labelText, mark);

  const number = document.createElement('div');
  number.className = 'wallet-balance-number';
  number.innerHTML = `<span>¥</span> ${formatMoney(wallet.balance)}`;

  const note = document.createElement('div');
  note.className = 'wallet-balance-note';
  note.textContent = '可以在商店购买小道具，之后会影响聊天里的状态注入';

  balanceCard.append(label, number, note);

  const actions = document.createElement('div');
  actions.className = 'wallet-actions';

  const rechargeButton = document.createElement('button');
  rechargeButton.className = 'wallet-action primary';
  rechargeButton.type = 'button';
  rechargeButton.append(createIcon('add', 18), document.createTextNode('充值'));
  rechargeButton.addEventListener('click', openRechargeSheet);

  const exportButton = document.createElement('button');
  exportButton.className = 'wallet-action';
  exportButton.type = 'button';
  exportButton.append(createIcon('download', 18), document.createTextNode('导出'));
  exportButton.addEventListener('click', exportWallet);

  actions.append(rechargeButton, exportButton);

  const section = document.createElement('section');
  section.className = 'wallet-section';

  const head = document.createElement('div');
  head.className = 'wallet-section-head';

  const sectionTitle = document.createElement('div');
  sectionTitle.className = 'wallet-section-title';
  sectionTitle.textContent = '消费记录';

  const sectionSub = document.createElement('div');
  sectionSub.className = 'wallet-section-sub';
  sectionSub.textContent = `${wallet.transactions.length} 条`;

  head.append(sectionTitle, sectionSub);

  section.appendChild(head);

  if (wallet.transactions.length) {
    const list = document.createElement('div');
    list.className = 'wallet-list';

    wallet.transactions.forEach((record) => {
      list.appendChild(createRecord(record));
    });

    section.appendChild(list);
  } else {
    section.appendChild(createEmptyState());
  }

  body.append(balanceCard, actions, section);
}

function createRecord(record) {
  const item = document.createElement('article');
  item.className = `wallet-record ${record.type}`;

  const icon = document.createElement('div');
  icon.className = 'wallet-record-icon';
  icon.appendChild(createIcon(record.type === 'income' ? 'download' : 'upload', 18));

  const main = document.createElement('div');
  main.className = 'wallet-record-main';

  const title = document.createElement('div');
  title.className = 'wallet-record-title';
  title.textContent = record.description || (record.type === 'income' ? '充值' : '消费');

  const time = document.createElement('div');
  time.className = 'wallet-record-time';
  time.textContent = formatTime(record.timestamp);

  main.append(title, time);

  const amount = document.createElement('div');
  amount.className = 'wallet-record-amount';
  amount.textContent = `${record.type === 'income' ? '+' : '-'}¥${formatMoney(record.amount)}`;

  item.append(icon, main, amount);
  return item;
}

function createEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'wallet-empty';

  const icon = document.createElement('div');
  icon.className = 'wallet-empty-icon';
  icon.appendChild(createIcon('transfer', 26));

  const title = document.createElement('div');
  title.className = 'wallet-empty-title';
  title.textContent = '还没有记录';

  const text = document.createElement('div');
  text.className = 'wallet-empty-text';
  text.textContent = '充值或购买道具后，会在这里留下小账本';

  empty.append(icon, title, text);
  return empty;
}

function openRechargeSheet() {
  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'wallet-sheet-title';
  title.textContent = '给钱包加一点余额';

  const amountField = createInputField('金额', '输入充值金额，例如 100', 'number');
  const descField = createInputField('备注', '默认写作充值', 'text');

  const actions = document.createElement('div');
  actions.className = 'wallet-sheet-actions';

  const cancelButton = document.createElement('button');
  cancelButton.className = 'btn-ghost';
  cancelButton.type = 'button';
  cancelButton.textContent = '取消';
  cancelButton.addEventListener('click', hideBottomSheet);

  const confirmButton = document.createElement('button');
  confirmButton.className = 'btn-primary';
  confirmButton.type = 'button';
  confirmButton.textContent = '确认充值';
  confirmButton.addEventListener('click', () => {
    const amount = normalizeAmount(amountField.querySelector('input').value);
    const desc = descField.querySelector('input').value.trim() || '充值';

    if (amount <= 0) {
      showToast('请输入正确金额');
      return;
    }

    addBalance(amount, desc);
    hideBottomSheet();
    showToast('充值成功');
    renderWallet();
  });

  actions.append(cancelButton, confirmButton);
  sheet.append(title, amountField, descField, actions);

  showBottomSheet(sheet);
}

function createInputField(labelText, placeholder, type) {
  const field = document.createElement('div');
  field.className = 'wallet-field';

  const label = document.createElement('div');
  label.className = 'wallet-field-label';
  label.append(createIcon(type === 'number' ? 'transfer' : 'edit', 15), document.createTextNode(labelText));

  const input = document.createElement('input');
  input.className = 'wallet-input';
  input.type = type === 'number' ? 'number' : 'text';
  input.inputMode = type === 'number' ? 'decimal' : 'text';
  input.placeholder = placeholder;

  field.append(label, input);
  return field;
}

async function clearTransactions() {
  const wallet = readWallet();

  if (!wallet.transactions.length) {
    showToast('还没有记录');
    return;
  }

  const ok = await showConfirm('确定清空钱包记录吗？余额会保留。');
  if (!ok) return;

  saveWallet({
    balance: wallet.balance,
    transactions: []
  });

  showToast('记录已清空');
  renderWallet();
}

function exportWallet() {
  const wallet = readWallet();
  const blob = new Blob([JSON.stringify(wallet, null, 2)], {
    type: 'application/json'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `wallet-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('已导出');
}

// 依赖：../core/storage.js 的 getData/setData/generateId/getNow/getDB；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon
