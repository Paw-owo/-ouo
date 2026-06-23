// apps/wallet.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getDB, setDB, deleteDB, compressImage, getAllDB
//   from '../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon

import {
  getData,
  setData,
  generateId,
  getNow,
  getDB,
  setDB,
  deleteDB,
  compressImage,
  getAllDB
} from '../core/storage.js';

import {
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm,
  createIcon
} from '../core/ui.js';

const WALLET_KEY = 'wallet';
const AI_WALLETS_KEY = 'app_ai_wallets';
const PROFILE_KEY = 'app_wallet_profile';
const STYLE_ID = 'wallet-styles';

const BG_KEY = 'app_bg_wallet';
const CARD_BG_KEY = 'app_wallet_card_bg';
const ICON_KEY = 'app_wallet_icon';
const AI_INITIAL_BALANCE = 5000;

let container = null;
let walletIconCache = '';
let walletCardBgCache = '';
let currentFilter = 'all';

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
      font-family: var(--font-main);
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
      background: transparent;
    }

    .wallet-nav {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      height: calc(58px + env(safe-area-inset-top));
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: env(safe-area-inset-top) 20px 0;
      background: color-mix(in srgb, var(--bg-primary) 76%, transparent);
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
      padding: calc(58px + env(safe-area-inset-top) + 18px) 20px calc(92px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling: touch;
    }

    .wallet-balance-card,
    .wallet-action,
    .wallet-record,
    .wallet-empty,
    .wallet-custom-section,
    .wallet-ai-row,
    .wallet-filter-panel,
    .wallet-ai-detail-card {
      background: color-mix(in srgb, var(--bg-card) 90%, transparent);
      box-shadow: var(--shadow-sm);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .wallet-screen.has-bg .wallet-balance-card,
    .wallet-screen.has-bg .wallet-action,
    .wallet-screen.has-bg .wallet-record,
    .wallet-screen.has-bg .wallet-empty,
    .wallet-screen.has-bg .wallet-custom-section,
    .wallet-screen.has-bg .wallet-ai-row,
    .wallet-screen.has-bg .wallet-filter-panel,
    .wallet-screen.has-bg .wallet-ai-detail-card {
      background: color-mix(in srgb, var(--bg-card) 70%, transparent);
    }

    .wallet-balance-card {
      min-height: 196px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 22px;
      border-radius: 28px;
      overflow: hidden;
      position: relative;
      box-shadow: var(--shadow-md);
    }

    .wallet-balance-card.has-card-bg {
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }

    .wallet-card-layer {
      position: absolute;
      inset: 0;
      z-index: 0;
      background: color-mix(in srgb, var(--bg-card) 32%, transparent);
      pointer-events: none;
    }

    .wallet-card-content {
      position: relative;
      z-index: 1;
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
      overflow: hidden;
    }

    .wallet-mark img,
    .wallet-ai-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
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
      line-height: 1.55;
      white-space: pre-wrap;
    }

    .wallet-balance-mood {
      margin-top: 8px;
      color: var(--accent-dark);
      font-size: var(--font-size-small);
      font-weight: 600;
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
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      transition: all 200ms ease;
    }

    .wallet-action.primary {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .wallet-action:active,
    .wallet-mini-btn:active,
    .wallet-ai-row:active,
    .wallet-filter-btn:active {
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

    .wallet-filter-panel {
      display: none;
      grid-template-columns: repeat(3, 1fr);
      gap: 8px;
      margin-bottom: var(--spacing-md);
      padding: 10px;
      border-radius: 20px;
    }

    .wallet-filter-panel.open {
      display: grid;
    }

    .wallet-filter-btn {
      min-height: 34px;
      border-radius: 13px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
      transition: all 200ms ease;
    }

    .wallet-filter-btn.active {
      background: var(--accent);
      color: var(--bubble-user-text);
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

    .wallet-empty-title,
    .wallet-custom-title,
    .wallet-section-title,
    .wallet-ai-detail-name {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .wallet-empty-text,
    .wallet-custom-sub,
    .wallet-ai-detail-sub {
      max-width: 280px;
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

    .wallet-input,
    .wallet-textarea {
      width: 100%;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: 16px;
    }

    .wallet-input {
      min-height: 48px;
      padding: 10px var(--spacing-md);
    }

    .wallet-textarea {
      min-height: 92px;
      padding: 12px var(--spacing-md);
      line-height: 1.6;
      resize: none;
    }

    .wallet-input::placeholder,
    .wallet-textarea::placeholder {
      color: var(--text-hint);
    }

    .wallet-sheet-actions {
      display: flex;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-lg);
      flex-wrap: wrap;
    }

    .wallet-sheet-actions button {
      flex: 1;
    }

    .wallet-custom-section {
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      margin-bottom: var(--spacing-md);
    }

    .wallet-custom-sub {
      margin-top: 4px;
    }

    .wallet-custom-actions {
      display: flex;
      gap: var(--spacing-sm);
      flex-wrap: wrap;
      margin-top: var(--spacing-md);
    }

    .wallet-mini-btn {
      min-height: 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 12px;
      border-radius: 14px;
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: var(--font-size-small);
      font-weight: 600;
      transition: all 200ms ease;
    }

    .wallet-mini-btn.primary {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .wallet-mini-btn.danger {
      color: var(--accent-dark);
    }

    .wallet-ai-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      max-height: 420px;
      overflow: auto;
      padding: 2px;
    }

    .wallet-ai-row {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: 12px;
      border-radius: 18px;
      transition: all 200ms ease;
    }

    .wallet-ai-avatar {
      width: 44px;
      height: 44px;
      flex: 0 0 44px;
      border-radius: 16px;
      background: var(--accent-light);
      color: var(--accent-dark);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
    }

    .wallet-ai-main {
      flex: 1;
      min-width: 0;
    }

    .wallet-ai-name {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wallet-ai-balance {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
    }

    .wallet-ai-detail-card {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      margin-bottom: var(--spacing-md);
    }

    .wallet-ai-detail-balance {
      margin-top: 6px;
      color: var(--accent-dark);
      font-size: 22px;
      font-weight: 600;
      line-height: 1.2;
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

function normalizeTransaction(item) {
  const type = item.type === 'expense' ? 'expense' : 'income';
  const category = item.category || (type === 'expense' ? 'expense' : 'income');
  const amount = normalizeAmount(item.amount);
  const timestamp = item.timestamp || item.createdAt || getNow();
  const title = item.title || item.description || (type === 'income' ? '收入' : '支出');
  const note = item.note || '';

  return {
    id: item.id || generateId(),
    amount,
    description: item.description || title,
    title,
    note,
    timestamp,
    createdAt: item.createdAt || timestamp,
    type,
    category,
    source: item.source || category,
    ownerType: item.ownerType || 'user',
    direction: item.direction || '',
    characterId: item.characterId || '',
    characterName: item.characterName || ''
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
          .map(normalizeTransaction)
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

function readProfile() {
  const data = getData(PROFILE_KEY, {});
  return {
    name: data?.name || '我的小金库',
    note: data?.note || '可以在商店购买小道具，也可以和TA互相转一点小钱。',
    updatedAt: data?.updatedAt || ''
  };
}

function saveProfile(profile) {
  setData(PROFILE_KEY, {
    name: profile.name || '我的小金库',
    note: profile.note || '',
    updatedAt: getNow()
  });
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

function getBalanceMood(balance) {
  const value = Number(balance) || 0;
  if (value <= 0) return '小金库空空的，等一点点小钱住进来 ᗜ ‸ ᗜ';
  if (value < 100) return '小金库有点瘦瘦的，先轻轻养一养 OvO';
  if (value < 1000) return '今天也有一点点安全感 ⌯\'ᵕ\'⌯';
  return '小金库被照顾得很好 ˶>ᗜ<˶';
}

function createTransferCard({ direction, amount, note = '', characterId = '', characterName = 'TA', timestamp = getNow() } = {}) {
  const value = normalizeAmount(amount);
  const isUserToAi = direction === 'user_to_ai';

  return {
    type: 'transfer',
    direction: isUserToAi ? 'user_to_ai' : 'ai_to_user',
    amount: value,
    transferAmount: value,
    note: note || '',
    characterId: characterId || '',
    characterName: characterName || 'TA',
    title: isUserToAi ? `转给${characterName || 'TA'}` : `${characterName || 'TA'}转给我`,
    description: note || (isUserToAi ? '一笔给TA的小转账' : 'TA转来的一点小钱'),
    timestamp
  };
}

function addTransaction(wallet, amount, description, type, extra = {}) {
  const timestamp = extra.timestamp || getNow();
  const title = extra.title || description || (type === 'income' ? '收入' : '支出');
  const category = extra.category || (type === 'income' ? 'income' : 'expense');

  const transaction = {
    id: extra.id || generateId(),
    amount: normalizeAmount(amount),
    description: description || title,
    title,
    note: extra.note || '',
    timestamp,
    createdAt: extra.createdAt || timestamp,
    type,
    category,
    source: extra.source || category,
    ownerType: extra.ownerType || 'user',
    direction: extra.direction || '',
    characterId: extra.characterId || '',
    characterName: extra.characterName || ''
  };

  return {
    balance: wallet.balance,
    transactions: [transaction, ...wallet.transactions].slice(0, 240)
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

  const nextWallet = addTransaction(wallet, value, description, 'income', {
    category: 'income',
    title: description,
    source: 'wallet',
    ownerType: 'user'
  });
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

  const nextWallet = addTransaction(wallet, value, description, 'expense', {
    category: 'expense',
    title: description,
    source: 'wallet',
    ownerType: 'user'
  });
  nextWallet.balance = wallet.balance;

  saveWallet(nextWallet);
  return true;
}

function createAiWallet() {
  return {
    balance: AI_INITIAL_BALANCE,
    transactions: [{
      id: generateId(),
      amount: AI_INITIAL_BALANCE,
      description: '初始小金库',
      title: '初始小金库',
      note: '',
      timestamp: getNow(),
      createdAt: getNow(),
      type: 'income',
      category: 'income',
      source: 'system',
      ownerType: 'character',
      direction: '',
      characterId: '',
      characterName: ''
    }]
  };
}

export function getAiWallets() {
  const wallets = getData(AI_WALLETS_KEY, {});
  return wallets && typeof wallets === 'object' ? wallets : {};
}

function saveAiWallets(wallets) {
  setData(AI_WALLETS_KEY, wallets && typeof wallets === 'object' ? wallets : {});
}

export function getAiWallet(characterId) {
  if (!characterId) return createAiWallet();

  const wallets = getAiWallets();
  const wallet = normalizeWallet(wallets[characterId] || createAiWallet());

  wallets[characterId] = wallet;
  saveAiWallets(wallets);

  return wallet;
}

export function setAiWalletBalance(characterId, amount, description = '余额调整') {
  if (!characterId) return false;

  const value = Math.max(0, normalizeAmount(amount));
  const wallets = getAiWallets();
  const current = normalizeWallet(wallets[characterId] || createAiWallet());
  const diff = normalizeAmount(value - current.balance);

  current.balance = value;

  if (diff !== 0) {
    const nextWallet = addTransaction(
      current,
      Math.abs(diff),
      description,
      diff > 0 ? 'income' : 'expense',
      {
        category: diff > 0 ? 'income' : 'expense',
        title: description,
        source: 'wallet',
        ownerType: 'character',
        characterId
      }
    );
    nextWallet.balance = current.balance;
    wallets[characterId] = nextWallet;
  } else {
    wallets[characterId] = current;
  }

  saveAiWallets(wallets);
  return true;
}

export function addAiBalance(characterId, amount, description = '收入', extra = {}) {
  if (!characterId) return false;

  const value = normalizeAmount(amount);
  if (value <= 0) return false;

  const wallets = getAiWallets();
  const wallet = normalizeWallet(wallets[characterId] || createAiWallet());
  wallet.balance = normalizeAmount(wallet.balance + value);

  const nextWallet = addTransaction(wallet, value, description, 'income', {
    ...extra,
    title: extra.title || description,
    source: extra.source || 'wallet',
    ownerType: 'character',
    characterId: extra.characterId || characterId
  });
  nextWallet.balance = wallet.balance;
  wallets[characterId] = nextWallet;

  saveAiWallets(wallets);
  return true;
}

export function deductAiBalance(characterId, amount, description = '支出', extra = {}) {
  if (!characterId) return false;

  const value = normalizeAmount(amount);
  if (value <= 0) return false;

  const wallets = getAiWallets();
  const wallet = normalizeWallet(wallets[characterId] || createAiWallet());

  if (wallet.balance < value) return false;

  wallet.balance = normalizeAmount(wallet.balance - value);

  const nextWallet = addTransaction(wallet, value, description, 'expense', {
    ...extra,
    title: extra.title || description,
    source: extra.source || 'wallet',
    ownerType: 'character',
    characterId: extra.characterId || characterId
  });
  nextWallet.balance = wallet.balance;
  wallets[characterId] = nextWallet;

  saveAiWallets(wallets);
  return true;
}

export async function transferToAI({ characterId, characterName = 'TA', amount, note = '' } = {}) {
  const value = normalizeAmount(amount);
  if (!characterId || value <= 0) return { ok: false, reason: 'invalid' };

  const timestamp = getNow();
  const wallet = readWallet();
  if (wallet.balance < value) return { ok: false, reason: 'no_balance' };

  const cleanNote = String(note || '').trim();
  const card = createTransferCard({
    direction: 'user_to_ai',
    amount: value,
    note: cleanNote,
    characterId,
    characterName,
    timestamp
  });

  wallet.balance = normalizeAmount(wallet.balance - value);
  const nextWallet = addTransaction(
    wallet,
    value,
    card.title,
    'expense',
    {
      category: 'transfer',
      title: card.title,
      note: cleanNote,
      source: 'wallet_transfer',
      ownerType: 'user',
      direction: 'user_to_ai',
      characterId,
      characterName,
      timestamp
    }
  );
  nextWallet.balance = wallet.balance;
  saveWallet(nextWallet);

  addAiBalance(characterId, value, `收到用户转账${cleanNote ? `：${cleanNote}` : ''}`, {
    category: 'transfer',
    title: '收到用户转账',
    note: cleanNote,
    source: 'wallet_transfer',
    ownerType: 'character',
    direction: 'user_to_ai',
    characterId,
    characterName,
    timestamp
  });

  await recordWalletMemory({
    characterId,
    role: 'user',
    source: '钱包转账',
    content: `用户转给我 ¥${formatMoney(value)}${cleanNote ? `，备注是：${cleanNote}` : ''}。我会记得这份小小的照顾。`
  });

  window.dispatchEvent(new CustomEvent('wallet-transfer-created', {
    detail: { ...card }
  }));

  return { ok: true, amount: value, card };
}

export async function aiTransferToUser({ characterId, characterName = 'TA', amount, note = '' } = {}) {
  const value = normalizeAmount(amount);
  if (!characterId || value <= 0) return { ok: false, reason: 'invalid' };

  const timestamp = getNow();
  const cleanNote = String(note || '').trim();
  const card = createTransferCard({
    direction: 'ai_to_user',
    amount: value,
    note: cleanNote,
    characterId,
    characterName,
    timestamp
  });

  const paid = deductAiBalance(characterId, value, `转给用户${cleanNote ? `：${cleanNote}` : ''}`, {
    category: 'transfer',
    title: '转给用户',
    note: cleanNote,
    source: 'wallet_transfer',
    ownerType: 'character',
    direction: 'ai_to_user',
    characterId,
    characterName,
    timestamp
  });

  if (!paid) return { ok: false, reason: 'no_ai_balance' };

  const wallet = readWallet();
  wallet.balance = normalizeAmount(wallet.balance + value);

  const nextWallet = addTransaction(
    wallet,
    value,
    card.title,
    'income',
    {
      category: 'transfer',
      title: card.title,
      note: cleanNote,
      source: 'wallet_transfer',
      ownerType: 'user',
      direction: 'ai_to_user',
      characterId,
      characterName,
      timestamp
    }
  );
  nextWallet.balance = wallet.balance;
  saveWallet(nextWallet);

  await recordWalletMemory({
    characterId,
    role: 'assistant',
    source: '钱包转账',
    content: `我转给用户 ¥${formatMoney(value)}${cleanNote ? `，备注是：${cleanNote}` : ''}。`
  });

  window.dispatchEvent(new CustomEvent('wallet-transfer-created', {
    detail: { ...card }
  }));

  return { ok: true, amount: value, card };
}

async function loadWalletVisuals() {
  const iconRecord = await getDB('blobs', ICON_KEY).catch(() => null);
  const cardRecord = await getDB('blobs', CARD_BG_KEY).catch(() => null);
  walletIconCache = getImageFromRecord(iconRecord);
  walletCardBgCache = getImageFromRecord(cardRecord);
}

export async function mount(containerEl) {
  injectStyles();
  container = containerEl;
  currentFilter = 'all';

  const screen = document.createElement('section');
  screen.className = 'wallet-screen';
  screen.dataset.imageKey = BG_KEY;

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

  const customButton = document.createElement('button');
  customButton.className = 'icon-button soft';
  customButton.type = 'button';
  customButton.setAttribute('aria-label', '个性化');
  customButton.appendChild(createIcon('edit', 22));
  customButton.addEventListener('click', openCustomizeSheet);

  const clearButton = document.createElement('button');
  clearButton.className = 'icon-button soft';
  clearButton.type = 'button';
  clearButton.setAttribute('aria-label', '清空记录');
  clearButton.appendChild(createIcon('clear', 22));
  clearButton.addEventListener('click', clearTransactions);

  const body = document.createElement('div');
  body.className = 'wallet-body';

  nav.append(backButton, title, customButton, clearButton);
  screen.append(softLayer, nav, body);

  container.innerHTML = '';
  container.appendChild(screen);

  await applyWalletBackground(screen);
  await loadWalletVisuals();
  renderWallet();
}

export function unmount() {
  walletIconCache = '';
  walletCardBgCache = '';

  if (container) {
    container.innerHTML = '';
    container = null;
  }
}

async function applyWalletBackground(screen) {
  try {
    const record = await getDB('blobs', BG_KEY);
    const value = getImageFromRecord(record);

    if (!value) {
      screen.classList.remove('has-bg');
      screen.style.backgroundImage = '';
      return;
    }

    screen.classList.add('has-bg');
    screen.style.backgroundImage = `url("${cssUrl(value)}")`;
  } catch (_) {
    screen.classList.remove('has-bg');
    screen.style.backgroundImage = '';
  }
}

function renderWallet() {
  const body = container?.querySelector('.wallet-body');
  if (!body) return;

  const wallet = readWallet();
  const profile = readProfile();

  body.innerHTML = '';

  const balanceCard = document.createElement('section');
  balanceCard.className = `wallet-balance-card ${walletCardBgCache ? 'has-card-bg' : ''}`;
  if (walletCardBgCache) balanceCard.style.backgroundImage = `url("${cssUrl(walletCardBgCache)}")`;

  const layer = document.createElement('div');
  layer.className = 'wallet-card-layer';

  const content = document.createElement('div');
  content.className = 'wallet-card-content';

  const label = document.createElement('div');
  label.className = 'wallet-balance-label';

  const labelText = document.createElement('span');
  labelText.textContent = profile.name;

  const mark = document.createElement('div');
  mark.className = 'wallet-mark';

  if (walletIconCache) {
    const img = document.createElement('img');
    img.src = walletIconCache;
    img.alt = '';
    mark.appendChild(img);
  } else {
    mark.appendChild(createIcon('transfer', 22));
  }

  label.append(labelText, mark);

  const number = document.createElement('div');
  number.className = 'wallet-balance-number';
  number.innerHTML = `<span>¥</span> ${formatMoney(wallet.balance)}`;

  const note = document.createElement('div');
  note.className = 'wallet-balance-note';
  note.textContent = profile.note;

  const mood = document.createElement('div');
  mood.className = 'wallet-balance-mood';
  mood.textContent = getBalanceMood(wallet.balance);

  content.append(label, number, note, mood);
  balanceCard.append(layer, content);

  const actions = document.createElement('div');
  actions.className = 'wallet-actions';

  const rechargeButton = document.createElement('button');
  rechargeButton.className = 'wallet-action primary';
  rechargeButton.type = 'button';
  rechargeButton.append(createIcon('add', 18), document.createTextNode('充值'));
  rechargeButton.addEventListener('click', openRechargeSheet);

  const transferButton = document.createElement('button');
  transferButton.className = 'wallet-action';
  transferButton.type = 'button';
  transferButton.append(createIcon('upload', 18), document.createTextNode('转给TA'));
  transferButton.addEventListener('click', openTransferToAiSheet);

  const aiButton = document.createElement('button');
  aiButton.className = 'wallet-action';
  aiButton.type = 'button';
  aiButton.append(createIcon('heart', 18), document.createTextNode('AI 小金库'));
  aiButton.addEventListener('click', openAiWalletSheet);

  const customButton = document.createElement('button');
  customButton.className = 'wallet-action';
  customButton.type = 'button';
  customButton.append(createIcon('edit', 18), document.createTextNode('装扮'));
  customButton.addEventListener('click', openCustomizeSheet);

  actions.append(rechargeButton, transferButton, aiButton, customButton);

  const section = document.createElement('section');
  section.className = 'wallet-section';

  const head = document.createElement('div');
  head.className = 'wallet-section-head';

  const sectionTitle = document.createElement('div');
  sectionTitle.className = 'wallet-section-title';
  sectionTitle.textContent = '小账本';

  const sectionSub = document.createElement('button');
  sectionSub.className = 'wallet-mini-btn';
  sectionSub.type = 'button';
  sectionSub.append(createIcon('settings', 14), document.createTextNode(getFilterLabel(currentFilter)));
  sectionSub.addEventListener('click', () => {
    const panel = body.querySelector('.wallet-filter-panel');
    panel?.classList.toggle('open');
  });

  head.append(sectionTitle, sectionSub);
  section.appendChild(head);

  const filterPanel = createFilterPanel();
  section.appendChild(filterPanel);

  const filteredTransactions = filterTransactions(wallet.transactions);

  if (filteredTransactions.length) {
    const list = document.createElement('div');
    list.className = 'wallet-list';

    filteredTransactions.forEach((record) => {
      list.appendChild(createRecord(record));
    });

    section.appendChild(list);
  } else {
    section.appendChild(createEmptyState());
  }

  body.append(balanceCard, actions, section);
}

function getFilterLabel(filter) {
  const labels = {
    all: '全部',
    income: '收入',
    expense: '支出',
    transfer: '转账',
    gift: '礼物'
  };

  return labels[filter] || '全部';
}

function createFilterPanel() {
  const panel = document.createElement('div');
  panel.className = 'wallet-filter-panel';

  [
    ['all', '全部'],
    ['income', '收入'],
    ['expense', '支出'],
    ['transfer', '转账'],
    ['gift', '礼物']
  ].forEach(([key, label]) => {
    const button = document.createElement('button');
    button.className = `wallet-filter-btn ${currentFilter === key ? 'active' : ''}`;
    button.type = 'button';
    button.textContent = label;

    button.addEventListener('click', () => {
      currentFilter = key;
      renderWallet();
    });

    panel.appendChild(button);
  });

  return panel;
}

function filterTransactions(transactions) {
  if (currentFilter === 'all') return transactions;
  if (currentFilter === 'income') return transactions.filter((item) => item.type === 'income');
  if (currentFilter === 'expense') return transactions.filter((item) => item.type === 'expense');
  return transactions.filter((item) => item.category === currentFilter);
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
  title.textContent = record.title || record.description || (record.type === 'income' ? '充值' : '消费');

  const time = document.createElement('div');
  time.className = 'wallet-record-time';
  time.textContent = `${formatTime(record.timestamp)}${record.note ? ` · ${record.note}` : ''}`;

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
  title.textContent = '这里还很安静';

  const text = document.createElement('div');
  text.className = 'wallet-empty-text';
  text.textContent = '充值、购物、转账后，小账本会乖乖记下来。';

  empty.append(icon, title, text);
  return empty;
}

function openRechargeSheet() {
  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'wallet-sheet-title';
  title.textContent = '给小金库加一点余额';

  const amountField = createInputField('金额', '输入充值金额，例如 100', 'number');
  const descField = createInputField('备注', '默认写作充值', 'text');

  const actions = document.createElement('div');
  actions.className = 'wallet-sheet-actions';

  const cancelButton = document.createElement('button');
  cancelButton.className = 'btn-ghost';
  cancelButton.type = 'button';
  cancelButton.textContent = '先不加';
  cancelButton.addEventListener('click', hideBottomSheet);

  const confirmButton = document.createElement('button');
  confirmButton.className = 'btn-primary';
  confirmButton.type = 'button';
  confirmButton.textContent = '放进去';
  confirmButton.addEventListener('click', () => {
    const amount = normalizeAmount(amountField.querySelector('input').value);
    const desc = descField.querySelector('input').value.trim() || '充值';

    if (amount <= 0) {
      showToast('金额要认真填一下 ๑ᵒᯅᵒ๑');
      return;
    }

    addBalance(amount, desc);
    hideBottomSheet();
    showToast('小金库变鼓一点啦 OvO');
    renderWallet();
  });

  actions.append(cancelButton, confirmButton);
  sheet.append(title, amountField, descField, actions);

  showBottomSheet(sheet);
}

async function openTransferToAiSheet() {
  const characters = await getAllDB('characters');

  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'wallet-sheet-title';
  title.textContent = '转一点给TA';

  if (!characters.length) {
    sheet.append(title, createSheetEmpty('还没有TA', '先去角色里创建一个TA，再来转小钱。'));
    showBottomSheet(sheet);
    return;
  }

  const listField = createSelectField('选择TA', characters.map((character) => ({
    value: character.id,
    label: character.name || '未命名'
  })));

  const amountField = createInputField('金额', '比如 20', 'number');
  const noteField = createInputField('备注', '比如：买点喜欢的小东西', 'text');

  const actions = document.createElement('div');
  actions.className = 'wallet-sheet-actions';

  const cancel = document.createElement('button');
  cancel.className = 'btn-ghost';
  cancel.type = 'button';
  cancel.textContent = '先不转';
  cancel.addEventListener('click', hideBottomSheet);

  const confirm = document.createElement('button');
  confirm.className = 'btn-primary';
  confirm.type = 'button';
  confirm.textContent = '转给TA';
  confirm.addEventListener('click', async () => {
    const characterId = listField.querySelector('select').value;
    const character = characters.find((item) => item.id === characterId);
    const amount = normalizeAmount(amountField.querySelector('input').value);
    const note = noteField.querySelector('input').value.trim();

    if (!character || amount <= 0) {
      showToast('金额和TA都要选好 ᗜ ‸ ᗜ');
      return;
    }

    const result = await transferToAI({
      characterId: character.id,
      characterName: character.name || 'TA',
      amount,
      note
    });

    if (!result.ok) {
      showToast(result.reason === 'no_balance' ? '余额不够啦 ˶╸▵╺˶' : '转账失败啦');
      return;
    }

    hideBottomSheet();
    showToast('已经转给TA啦 ˶>ᗜ<˶');
    renderWallet();
  });

  actions.append(cancel, confirm);
  sheet.append(title, listField, amountField, noteField, actions);
  showBottomSheet(sheet);
}

async function openAiWalletSheet() {
  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'wallet-sheet-title';
  title.textContent = 'AI 小金库';

  const list = document.createElement('div');
  list.className = 'wallet-ai-list';

  const characters = await getAllDB('characters');

  if (!characters.length) {
    list.appendChild(createSheetEmpty('还没有 AI 角色', '创建角色后，这里会出现他们的小金库。'));
  } else {
    characters.forEach((character) => {
      getAiWallet(character.id);
      list.appendChild(createAiWalletRow(character));
    });
  }

  sheet.append(title, list);
  showBottomSheet(sheet);
}

function createAiWalletRow(character) {
  const wallet = getAiWallet(character.id);

  const row = document.createElement('button');
  row.className = 'wallet-ai-row';
  row.type = 'button';

  const avatar = document.createElement('div');
  avatar.className = 'wallet-ai-avatar';

  if (character.avatar) {
    const img = document.createElement('img');
    img.src = character.avatar;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.appendChild(createIcon('heart', 20));
  }

  const main = document.createElement('div');
  main.className = 'wallet-ai-main';

  const name = document.createElement('div');
  name.className = 'wallet-ai-name';
  name.textContent = character.name || '未命名';

  const balance = document.createElement('div');
  balance.className = 'wallet-ai-balance';
  balance.textContent = `余额 ¥${formatMoney(wallet.balance)} · ${wallet.transactions.length} 条记录`;

  main.append(name, balance);

  const edit = document.createElement('span');
  edit.className = 'wallet-mini-btn';
  edit.append(createIcon('edit', 15));

  row.append(avatar, main, edit);
  row.addEventListener('click', () => openAiWalletDetail(character));

  return row;
}

function openAiWalletDetail(character) {
  const wallet = getAiWallet(character.id);
  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'wallet-sheet-title';
  title.textContent = `${character.name || 'TA'} 的小金库`;

  const detail = document.createElement('div');
  detail.className = 'wallet-ai-detail-card';

  const avatar = document.createElement('div');
  avatar.className = 'wallet-ai-avatar';

  if (character.avatar) {
    const img = document.createElement('img');
    img.src = character.avatar;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.appendChild(createIcon('heart', 20));
  }

  const main = document.createElement('div');
  main.className = 'wallet-ai-main';

  const name = document.createElement('div');
  name.className = 'wallet-ai-detail-name';
  name.textContent = character.name || '未命名';

  const sub = document.createElement('div');
  sub.className = 'wallet-ai-detail-sub';
  sub.textContent = 'TA也有自己的小金库，可以收到你转的钱，也可以给你转回来。';

  const balance = document.createElement('div');
  balance.className = 'wallet-ai-detail-balance';
  balance.textContent = `¥${formatMoney(wallet.balance)}`;

  main.append(name, sub, balance);
  detail.append(avatar, main);

  const actions = document.createElement('div');
  actions.className = 'wallet-custom-actions';

  const editBalance = document.createElement('button');
  editBalance.className = 'wallet-mini-btn primary';
  editBalance.type = 'button';
  editBalance.append(createIcon('edit', 15), document.createTextNode('调余额'));
  editBalance.addEventListener('click', () => openAiBalanceEditor(character));

  const aiPay = document.createElement('button');
  aiPay.className = 'wallet-mini-btn';
  aiPay.type = 'button';
  aiPay.append(createIcon('download', 15), document.createTextNode('TA转给我'));
  aiPay.addEventListener('click', () => openAiTransferToUserSheet(character));

  actions.append(editBalance, aiPay);

  const sectionTitle = document.createElement('div');
  sectionTitle.className = 'wallet-section-title';
  sectionTitle.textContent = '最近记录';

  const list = document.createElement('div');
  list.className = 'wallet-list';

  if (wallet.transactions.length) {
    wallet.transactions.slice(0, 12).forEach((record) => {
      list.appendChild(createRecord(record));
    });
  } else {
    list.appendChild(createSheetEmpty('还没有记录', 'TA的小金库还很安静。'));
  }

  sheet.append(title, detail, actions, sectionTitle, list);
  showBottomSheet(sheet);
}

function openAiTransferToUserSheet(character) {
  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'wallet-sheet-title';
  title.textContent = `${character.name || 'TA'} 转给我`;

  const amountField = createInputField('金额', '比如 18', 'number');
  const noteField = createInputField('备注', '比如：请你喝奶茶', 'text');

  const actions = document.createElement('div');
  actions.className = 'wallet-sheet-actions';

  const cancel = document.createElement('button');
  cancel.className = 'btn-ghost';
  cancel.type = 'button';
  cancel.textContent = '取消';
  cancel.addEventListener('click', hideBottomSheet);

  const confirm = document.createElement('button');
  confirm.className = 'btn-primary';
  confirm.type = 'button';
  confirm.textContent = '确认';
  confirm.addEventListener('click', async () => {
    const amount = normalizeAmount(amountField.querySelector('input').value);
    const note = noteField.querySelector('input').value.trim();

    if (amount <= 0) {
      showToast('金额要认真填一下 ๑ᵒᯅᵒ๑');
      return;
    }

    const result = await aiTransferToUser({
      characterId: character.id,
      characterName: character.name || 'TA',
      amount,
      note
    });

    if (!result.ok) {
      showToast(result.reason === 'no_ai_balance' ? 'TA的小金库不够啦' : '转账失败啦');
      return;
    }

    hideBottomSheet();
    showToast('已经收到TA的小钱啦 ˶>ᗜ<˶');
    renderWallet();
  });

  actions.append(cancel, confirm);
  sheet.append(title, amountField, noteField, actions);
  showBottomSheet(sheet);
}

function openAiBalanceEditor(character) {
  const wallet = getAiWallet(character.id);
  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'wallet-sheet-title';
  title.textContent = `${character.name || 'AI'} 的小金库`;

  const amountField = createInputField('设置余额', '输入新的余额', 'number');
  amountField.querySelector('input').value = String(wallet.balance);

  const descField = createInputField('备注', '比如：补贴零花钱', 'text');

  const actions = document.createElement('div');
  actions.className = 'wallet-sheet-actions';

  const cancel = document.createElement('button');
  cancel.className = 'btn-ghost';
  cancel.type = 'button';
  cancel.textContent = '取消';
  cancel.addEventListener('click', hideBottomSheet);

  const save = document.createElement('button');
  save.className = 'btn-primary';
  save.type = 'button';
  save.textContent = '保存';
  save.addEventListener('click', async () => {
    const amount = Math.max(0, normalizeAmount(amountField.querySelector('input').value));
    const desc = descField.querySelector('input').value.trim() || '余额调整';

    setAiWalletBalance(character.id, amount, desc);
    hideBottomSheet();
    showToast('已保存 OvO');
    await openAiWalletSheet();
  });

  actions.append(cancel, save);
  sheet.append(title, amountField, descField, actions);
  showBottomSheet(sheet);
}

function openCustomizeSheet() {
  const profile = readProfile();
  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'wallet-sheet-title';
  title.textContent = '装扮钱包';

  const profileSection = createCustomSection('文字设置', '换一个更像自己的钱包名字和说明。');

  const nameField = createInputField('钱包名称', '比如：恋爱基金', 'text');
  nameField.querySelector('input').value = profile.name;

  const noteField = createTextareaField('卡片文案', '写一句钱包说明');
  noteField.querySelector('textarea').value = profile.note;

  const saveText = document.createElement('button');
  saveText.className = 'wallet-mini-btn primary';
  saveText.type = 'button';
  saveText.append(createIcon('check', 15), document.createTextNode('保存文字'));
  saveText.addEventListener('click', () => {
    saveProfile({
      name: nameField.querySelector('input').value.trim() || '我的小金库',
      note: noteField.querySelector('textarea').value.trim()
    });
    hideBottomSheet();
    showToast('钱包文字已保存 ⌯\'ᵕ\'⌯');
    renderWallet();
  });

  profileSection.append(nameField, noteField);
  profileSection.querySelector('.wallet-custom-actions').appendChild(saveText);

  const bgSection = createCustomSection('页面背景', '给钱包页面换一张背景，图片会尽量完整显示。');
  bgSection.querySelector('.wallet-custom-actions').append(
    createUploadButton('上传背景', BG_KEY, async () => {
      const screen = container?.querySelector('.wallet-screen');
      if (screen) await applyWalletBackground(screen);
    }),
    createClearBlobButton('清除背景', BG_KEY, async () => {
      const screen = container?.querySelector('.wallet-screen');
      if (screen) await applyWalletBackground(screen);
    })
  );

  const cardSection = createCustomSection('余额卡片', '可以换卡片背景和右上角小图。');
  cardSection.querySelector('.wallet-custom-actions').append(
    createUploadButton('上传卡片背景', CARD_BG_KEY, async () => {
      await loadWalletVisuals();
      renderWallet();
    }),
    createClearBlobButton('清除卡片背景', CARD_BG_KEY, async () => {
      await loadWalletVisuals();
      renderWallet();
    }),
    createUploadButton('上传小图', ICON_KEY, async () => {
      await loadWalletVisuals();
      renderWallet();
    }),
    createClearBlobButton('清除小图', ICON_KEY, async () => {
      await loadWalletVisuals();
      renderWallet();
    })
  );

  sheet.append(title, profileSection, bgSection, cardSection);
  showBottomSheet(sheet);
}

function createCustomSection(titleText, subText) {
  const section = document.createElement('section');
  section.className = 'wallet-custom-section';

  const title = document.createElement('div');
  title.className = 'wallet-custom-title';
  title.textContent = titleText;

  const sub = document.createElement('div');
  sub.className = 'wallet-custom-sub';
  sub.textContent = subText;

  const actions = document.createElement('div');
  actions.className = 'wallet-custom-actions';

  section.append(title, sub, actions);
  return section;
}

function createUploadButton(label, key, afterSave) {
  const button = document.createElement('button');
  button.className = 'wallet-mini-btn primary';
  button.type = 'button';
  button.append(createIcon('upload', 15), document.createTextNode(label));
  button.addEventListener('click', () => chooseImage(async (file) => {
    const value = await compressImage(file, 1600, 0.86);
    await setDB('blobs', key, {
      key,
      value,
      source: value,
      opacity: 100,
      updatedAt: getNow()
    });
    await afterSave?.();
    hideBottomSheet();
    showToast('已保存 ˶>ᗜ<˶');
  }));
  return button;
}

function createClearBlobButton(label, key, afterClear) {
  const button = document.createElement('button');
  button.className = 'wallet-mini-btn';
  button.type = 'button';
  button.append(createIcon('clear', 15), document.createTextNode(label));
  button.addEventListener('click', async () => {
    await deleteDB('blobs', key);
    await afterClear?.();
    hideBottomSheet();
    showToast('已清除');
  });
  return button;
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
      showToast('图片处理失败 ᗜ ‸ ᗜ');
    }
  });
  input.click();
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

function createSelectField(labelText, options) {
  const field = document.createElement('div');
  field.className = 'wallet-field';

  const label = document.createElement('div');
  label.className = 'wallet-field-label';
  label.append(createIcon('heart', 15), document.createTextNode(labelText));

  const select = document.createElement('select');
  select.className = 'wallet-input';

  options.forEach((option) => {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    select.appendChild(item);
  });

  field.append(label, select);
  return field;
}

function createTextareaField(labelText, placeholder) {
  const field = document.createElement('div');
  field.className = 'wallet-field';

  const label = document.createElement('div');
  label.className = 'wallet-field-label';
  label.append(createIcon('edit', 15), document.createTextNode(labelText));

  const textarea = document.createElement('textarea');
  textarea.className = 'wallet-textarea';
  textarea.placeholder = placeholder;

  field.append(label, textarea);
  return field;
}

function createSheetEmpty(titleText, textContent) {
  const empty = document.createElement('div');
  empty.className = 'wallet-empty';

  const icon = document.createElement('div');
  icon.className = 'wallet-empty-icon';
  icon.appendChild(createIcon('heart', 26));

  const title = document.createElement('div');
  title.className = 'wallet-empty-title';
  title.textContent = titleText;

  const text = document.createElement('div');
  text.className = 'wallet-empty-text';
  text.textContent = textContent;

  empty.append(icon, title, text);
  return empty;
}

async function clearTransactions() {
  const wallet = readWallet();

  if (!wallet.transactions.length) {
    showToast('还没有记录呢 OvO');
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

async function recordWalletMemory({ characterId, role, content, source }) {
  if (!characterId || !content) return;

  try {
    const chatModule = await import('./chat.js');

    if (typeof chatModule.recordExternalInteraction === 'function') {
      await chatModule.recordExternalInteraction({
        characterId,
        role,
        content,
        source
      });
      return;
    }
  } catch (_) {}

  const id = generateId();

  await setDB('memories', id, {
    id,
    characterId,
    content,
    source: 'manual',
    createdAt: getNow(),
    updatedAt: getNow()
  });
}

function getImageFromRecord(record) {
  if (!record) return '';
  if (typeof record === 'string') return record.trim();

  for (const key of ['value', 'source', 'data', 'image', 'imageBase64', 'backgroundImage', 'iconImage', 'url', 'src']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }

  return '';
}

function cssUrl(value) {
  return String(value || '').replace(/"/g, '\\"');
}

function exportWallet() {
  const wallet = readWallet();
  const aiWallets = getAiWallets();
  const profile = readProfile();

  const blob = new Blob([JSON.stringify({
    wallet,
    aiWallets,
    profile
  }, null, 2)], {
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

// 依赖：../core/storage.js 的 getData/setData/generateId/getNow/getDB/setDB/deleteDB/compressImage/getAllDB；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon；可选动态依赖 ./chat.js 的 recordExternalInteraction
