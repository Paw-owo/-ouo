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
let currentAiFilter = 'all';

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
    .wallet-ai-detail-card,
    .wallet-ai-page-card,
    .wallet-ai-stat {
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
    .wallet-screen.has-bg .wallet-ai-detail-card,
    .wallet-screen.has-bg .wallet-ai-page-card,
    .wallet-screen.has-bg .wallet-ai-stat {
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
    .wallet-ai-avatar img,
    .wallet-ai-page-avatar img,
    .wallet-record-avatar img {
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

    .wallet-record-icon,
    .wallet-record-avatar {
      width: 40px;
      height: 40px;
      flex: 0 0 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 15px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      overflow: hidden;
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
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
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
    .wallet-ai-detail-name,
    .wallet-ai-page-name {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .wallet-empty-text,
    .wallet-custom-sub,
    .wallet-ai-detail-sub,
    .wallet-ai-page-sub,
    .wallet-ai-stat-label {
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
      width: 100%;
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: 12px;
      border-radius: 18px;
      transition: all 200ms ease;
      text-align: left;
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

    .wallet-ai-page {
      position: fixed;
      inset: 0;
      z-index: 130;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .wallet-ai-page-body {
      flex: 1;
      overflow-x: hidden;
      overflow-y: auto;
      padding: calc(58px + env(safe-area-inset-top) + 18px) 20px calc(88px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling: touch;
    }

    .wallet-ai-page-card {
      display: flex;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md);
      border-radius: 28px;
      margin-bottom: var(--spacing-md);
    }

    .wallet-ai-page-avatar {
      width: 66px;
      height: 66px;
      flex: 0 0 66px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 24px;
      overflow: hidden;
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .wallet-ai-page-balance {
      margin-top: 8px;
      color: var(--accent-dark);
      font-size: 28px;
      font-weight: 600;
      line-height: 1.1;
      letter-spacing: -0.03em;
    }

    .wallet-ai-stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--spacing-sm);
      margin-bottom: var(--spacing-md);
    }

    .wallet-ai-stat {
      padding: 14px;
      border-radius: 20px;
    }

    .wallet-ai-stat-value {
      margin-top: 4px;
      color: var(--text-primary);
      font-size: 20px;
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

function normalizeAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function normalizeTransaction(item = {}) {
  const type = item.type === 'expense' ? 'expense' : 'income';
  const category = item.category || (type === 'expense' ? 'expense' : 'income');
  const amount = normalizeAmount(item.amount);
  const timestamp = item.timestamp || item.createdAt || getNow();
  const title = item.title || item.description || (type === 'income' ? '收入' : '支出');
  const note = item.note || item.itemDesc || '';

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
    characterName: item.characterName || '',
    itemId: item.itemId || '',
    itemName: item.itemName || '',
    itemDesc: item.itemDesc || item.itemDescription || '',
    itemPrice: Number(item.itemPrice ?? item.price) || 0,
    itemImage: item.itemImage || item.imageBase64 || '',
    messageId: item.messageId || ''
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
    characterName: extra.characterName || '',
    itemId: extra.itemId || '',
    itemName: extra.itemName || '',
    itemDesc: extra.itemDesc || extra.itemDescription || '',
    itemPrice: Number(extra.itemPrice ?? extra.price) || 0,
    itemImage: extra.itemImage || extra.imageBase64 || '',
    messageId: extra.messageId || ''
  };

  return {
    balance: wallet.balance,
    transactions: [transaction, ...wallet.transactions].slice(0, 240)
  };
}

export function getBalance() {
  return readWallet().balance;
}

export function addBalance(amount, description = '充值', extra = {}) {
  const value = normalizeAmount(amount);
  if (value <= 0) return false;

  const wallet = readWallet();
  wallet.balance = normalizeAmount(wallet.balance + value);

  const nextWallet = addTransaction(wallet, value, description, 'income', {
    ...extra,
    category: extra.category || 'income',
    title: extra.title || description,
    source: extra.source || 'wallet',
    ownerType: 'user'
  });
  nextWallet.balance = wallet.balance;

  saveWallet(nextWallet);
  return true;
}

export function deductBalance(amount, description = '消费', extra = {}) {
  const value = normalizeAmount(amount);
  if (value <= 0) return false;

  const wallet = readWallet();
  if (wallet.balance < value) return false;

  wallet.balance = normalizeAmount(wallet.balance - value);

  const nextWallet = addTransaction(wallet, value, description, 'expense', {
    ...extra,
    category: extra.category || 'expense',
    title: extra.title || description,
    source: extra.source || 'wallet',
    ownerType: 'user'
  });
  nextWallet.balance = wallet.balance;

  saveWallet(nextWallet);
  return true;
}

function createAiWallet(characterId = '', characterName = '') {
  const timestamp = getNow();

  return {
    balance: AI_INITIAL_BALANCE,
    transactions: [{
      id: generateId(),
      amount: AI_INITIAL_BALANCE,
      description: '初始小金库',
      title: '初始小金库',
      note: '',
      timestamp,
      createdAt: timestamp,
      type: 'income',
      category: 'income',
      source: 'system',
      ownerType: 'character',
      direction: '',
      characterId,
      characterName,
      itemId: '',
      itemName: '',
      itemDesc: '',
      itemPrice: 0,
      itemImage: '',
      messageId: ''
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
  const current = wallets[characterId] || createAiWallet(characterId);
  const wallet = normalizeWallet(current);

  wallets[characterId] = wallet;
  saveAiWallets(wallets);

  return wallet;
}

export function setAiWalletBalance(characterId, amount, description = '余额调整') {
  if (!characterId) return false;

  const value = Math.max(0, normalizeAmount(amount));
  const wallets = getAiWallets();
  const current = normalizeWallet(wallets[characterId] || createAiWallet(characterId));
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
  const wallet = normalizeWallet(wallets[characterId] || createAiWallet(characterId, extra.characterName || ''));
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
  const wallet = normalizeWallet(wallets[characterId] || createAiWallet(characterId, extra.characterName || ''));

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
