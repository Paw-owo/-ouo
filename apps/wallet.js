// apps/wallet.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getDB, setDB, deleteDB, compressImage, getAllDB
//   from '../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon

import {
  getData, setData, generateId, getNow, getDB, setDB, deleteDB, compressImage, getAllDB
} from '../core/storage.js';

import {
  showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon
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

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .wallet-screen{position:fixed;inset:0;z-index:10;display:flex;flex-direction:column;overflow:hidden;background:var(--bg-primary);color:var(--text-primary)}
    .wallet-screen.has-bg{background-size:cover;background-position:center;background-repeat:no-repeat}
    .wallet-soft-layer{position:absolute;inset:0;z-index:0;pointer-events:none;background:color-mix(in srgb,var(--bg-primary) 78%,transparent)}
    .wallet-nav{position:fixed;top:0;left:0;right:0;z-index:100;height:calc(56px + env(safe-area-inset-top));display:flex;align-items:center;gap:var(--spacing-sm);padding:env(safe-area-inset-top) 20px 0;background:var(--surface-glass);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
    .wallet-nav-title{flex:1;min-width:0;color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .wallet-body{position:relative;z-index:1;flex:1;overflow-x:hidden;overflow-y:auto;padding:calc(56px + env(safe-area-inset-top) + 18px) 20px calc(88px + env(safe-area-inset-bottom));-webkit-overflow-scrolling:touch}
    .wallet-balance-card{min-height:188px;display:flex;flex-direction:column;justify-content:space-between;padding:22px;border-radius:28px;background:var(--bg-card);box-shadow:var(--shadow-md);overflow:hidden;position:relative}
    .wallet-balance-card.has-card-bg{background-size:cover;background-position:center;background-repeat:no-repeat}
    .wallet-card-layer{position:absolute;inset:0;z-index:0;background:color-mix(in srgb,var(--bg-card) 76%,transparent);pointer-events:none}
    .wallet-card-content{position:relative;z-index:1}
    .wallet-balance-label{display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-md);color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.4}
    .wallet-mark{width:42px;height:42px;display:flex;align-items:center;justify-content:center;border-radius:16px;background:var(--accent-light);color:var(--accent-dark);box-shadow:var(--shadow-sm);overflow:hidden}
    .wallet-mark img{width:100%;height:100%;object-fit:cover;display:block}
    .wallet-balance-number{margin-top:18px;color:var(--text-primary);font-size:42px;font-weight:600;line-height:1;letter-spacing:-.04em}
    .wallet-balance-number span{font-size:18px;font-weight:500;color:var(--text-secondary);letter-spacing:0}
    .wallet-balance-note{margin-top:12px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.5;white-space:pre-wrap}
    .wallet-actions{display:grid;grid-template-columns:1fr 1fr;gap:var(--spacing-md);margin-top:var(--spacing-md)}
    .wallet-action{min-height:54px;display:flex;align-items:center;justify-content:center;gap:var(--spacing-sm);border-radius:18px;background:var(--bg-card);color:var(--text-primary);box-shadow:var(--shadow-sm);font-size:var(--font-size-base);font-weight:600;transition:var(--motion)}
    .wallet-action.primary{background:var(--accent);color:var(--bubble-user-text)}
    .wallet-action:active,.wallet-mini-btn:active,.wallet-ai-row:active{transform:scale(.96)}
    .wallet-section{margin-top:24px}
    .wallet-section-head{display:flex;align-items:center;justify-content:space-between;gap:var(--spacing-md);margin-bottom:var(--spacing-sm);padding:0 2px}
    .wallet-section-title{color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35}
    .wallet-section-sub{color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.4}
    .wallet-list{display:flex;flex-direction:column;gap:10px}
    .wallet-record{display:flex;align-items:center;gap:var(--spacing-md);padding:14px;border-radius:20px;background:var(--bg-card);box-shadow:var(--shadow-sm)}
    .wallet-record-icon{width:40px;height:40px;flex:0 0 40px;display:flex;align-items:center;justify-content:center;border-radius:15px;background:var(--surface-muted);color:var(--text-secondary)}
    .wallet-record.income .wallet-record-icon{background:var(--accent-light);color:var(--accent-dark)}
    .wallet-record-main{flex:1;min-width:0}
    .wallet-record-title{color:var(--text-primary);font-size:var(--font-size-base);font-weight:500;line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .wallet-record-time{margin-top:2px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.4}
    .wallet-record-amount{flex:0 0 auto;font-size:var(--font-size-base);font-weight:600;line-height:1.4}
    .wallet-record.income .wallet-record-amount{color:var(--accent-dark)}
    .wallet-record.expense .wallet-record-amount{color:var(--text-secondary)}
    .wallet-empty{min-height:210px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:var(--spacing-sm);padding:var(--spacing-lg);border-radius:24px;background:var(--bg-card);box-shadow:var(--shadow-sm);color:var(--text-secondary);text-align:center}
    .wallet-empty-icon{width:56px;height:56px;display:flex;align-items:center;justify-content:center;border-radius:20px;background:var(--accent-light);color:var(--accent-dark)}
    .wallet-empty-title{color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35}
    .wallet-empty-text{max-width:260px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.6}
    .wallet-sheet-title{margin-bottom:var(--spacing-md);color:var(--text-primary);font-size:20px;font-weight:600;line-height:1.35;letter-spacing:-.01em}
    .wallet-field{margin-bottom:var(--spacing-md)}
    .wallet-field-label{display:flex;align-items:center;gap:6px;margin-bottom:var(--spacing-sm);color:var(--text-secondary);font-size:var(--font-size-small);font-weight:500;line-height:1.4}
    .wallet-field-label svg{width:15px;height:15px;color:var(--accent)}
    .wallet-input,.wallet-textarea{width:100%;border-radius:var(--radius-md);background:var(--surface-muted);color:var(--text-primary);font-size:var(--font-size-base)}
    .wallet-input{min-height:48px;padding:10px var(--spacing-md)}
    .wallet-textarea{min-height:92px;padding:12px var(--spacing-md);line-height:1.6;resize:none}
    .wallet-input::placeholder,.wallet-textarea::placeholder{color:var(--text-hint)}
    .wallet-sheet-actions{display:flex;gap:var(--spacing-sm);margin-top:var(--spacing-lg);flex-wrap:wrap}
    .wallet-sheet-actions button{flex:1}
    .wallet-custom-section{padding:var(--spacing-md);border-radius:var(--radius-lg);background:var(--bg-card);box-shadow:var(--shadow-sm);margin-bottom:var(--spacing-md)}
    .wallet-custom-title{color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35}
    .wallet-custom-sub{margin-top:4px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.6}
    .wallet-custom-actions{display:flex;gap:var(--spacing-sm);flex-wrap:wrap;margin-top:var(--spacing-md)}
    .wallet-mini-btn{min-height:36px;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;border-radius:14px;background:var(--surface-muted);color:var(--text-primary);font-size:var(--font-size-small);font-weight:600;transition:var(--motion)}
    .wallet-mini-btn.primary{background:var(--accent);color:var(--bubble-user-text)}
    .wallet-mini-btn.danger{color:var(--accent-dark)}
    .wallet-ai-list{display:flex;flex-direction:column;gap:var(--spacing-sm);max-height:420px;overflow:auto}
    .wallet-ai-row{display:flex;align-items:center;gap:var(--spacing-sm);padding:12px;border-radius:18px;background:var(--bg-card);box-shadow:var(--shadow-sm);transition:var(--motion)}
    .wallet-ai-avatar{width:44px;height:44px;flex:0 0 44px;border-radius:16px;background:var(--accent-light);color:var(--accent-dark);display:flex;align-items:center;justify-content:center;overflow:hidden}
    .wallet-ai-avatar img{width:100%;height:100%;object-fit:cover;display:block}
    .wallet-ai-main{flex:1;min-width:0}
    .wallet-ai-name{color:var(--text-primary);font-size:var(--font-size-base);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .wallet-ai-balance{margin-top:2px;color:var(--text-secondary);font-size:var(--font-size-small)}
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

function readProfile() {
  const data = getData(PROFILE_KEY, {});
  return {
    name: data?.name || '我的小金库',
    note: data?.note || '可以在商店购买小道具，之后会影响聊天里的状态注入',
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
      diff > 0 ? 'income' : 'expense'
    );
    nextWallet.balance = current.balance;
    wallets[characterId] = nextWallet;
  } else {
    wallets[characterId] = current;
  }

  saveAiWallets(wallets);
  return true;
}

async function loadWalletVisuals() {
  const iconRecord = await getDB('blobs', ICON_KEY).catch(() => null);
  const cardRecord = await getDB('blobs', CARD_BG_KEY).catch(() => null);
  walletIconCache = iconRecord?.value || '';
  walletCardBgCache = cardRecord?.value || '';
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

function renderWallet() {
  const body = container?.querySelector('.wallet-body');
  if (!body) return;

  const wallet = readWallet();
  const profile = readProfile();

  body.innerHTML = '';

  const balanceCard = document.createElement('section');
  balanceCard.className = `wallet-balance-card ${walletCardBgCache ? 'has-card-bg' : ''}`;
  if (walletCardBgCache) balanceCard.style.backgroundImage = `url("${walletCardBgCache}")`;

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

  content.append(label, number, note);
  balanceCard.append(layer, content);

  const actions = document.createElement('div');
  actions.className = 'wallet-actions';

  const rechargeButton = document.createElement('button');
  rechargeButton.className = 'wallet-action primary';
  rechargeButton.type = 'button';
  rechargeButton.append(createIcon('add', 18), document.createTextNode('充值'));
  rechargeButton.addEventListener('click', openRechargeSheet);

  const aiButton = document.createElement('button');
  aiButton.className = 'wallet-action';
  aiButton.type = 'button';
  aiButton.append(createIcon('heart', 18), document.createTextNode('AI 小金库'));
  aiButton.addEventListener('click', openAiWalletSheet);

  const exportButton = document.createElement('button');
  exportButton.className = 'wallet-action';
  exportButton.type = 'button';
  exportButton.append(createIcon('download', 18), document.createTextNode('导出'));
  exportButton.addEventListener('click', exportWallet);

  const customButton = document.createElement('button');
  customButton.className = 'wallet-action';
  customButton.type = 'button';
  customButton.append(createIcon('edit', 18), document.createTextNode('装扮'));
  customButton.addEventListener('click', openCustomizeSheet);

  actions.append(rechargeButton, aiButton, exportButton, customButton);

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

  const row = document.createElement('div');
  row.className = 'wallet-ai-row';

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

  const edit = document.createElement('button');
  edit.className = 'wallet-mini-btn';
  edit.type = 'button';
  edit.append(createIcon('edit', 15));
  edit.addEventListener('click', () => openAiBalanceEditor(character));

  row.append(avatar, main, edit);
  return row;
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
    showToast('已保存');
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
    showToast('钱包文字已保存');
    renderWallet();
  });

  profileSection.append(nameField, noteField);
  profileSection.querySelector('.wallet-custom-actions').appendChild(saveText);

  const bgSection = createCustomSection('页面背景', '给钱包页面换一张背景。');
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
      source: 'upload',
      opacity: 1,
      updatedAt: getNow()
    });
    await afterSave?.();
    hideBottomSheet();
    showToast('已保存');
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
      showToast('图片处理失败');
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

// 依赖：../core/storage.js 的 getData/setData/generateId/getNow/getDB/setDB/deleteDB/compressImage/getAllDB；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon
