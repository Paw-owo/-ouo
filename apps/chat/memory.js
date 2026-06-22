// apps/chat/memory.js
// imports:
//   from '../../core/storage.js': getData, setData, generateId, getNow, getDB, setDB, deleteDB, getByIndexDB
//   from '../../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon

import {
  getData,
  setData,
  generateId,
  getNow,
  getDB,
  setDB,
  deleteDB,
  getByIndexDB
} from '../../core/storage.js';

import {
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm,
  createIcon
} from '../../core/ui.js';

const MEMORY_STYLE_ID = 'chat-memory-style';

const DEFAULT_CHAT_CONFIG = {
  endpointId: '',
  model: '',
  ttsEnabled: false,
  mcpEnabled: false,
  enabledMcpServerIds: [],
  streamEnabled: true,
  memoryEnabled: true,
  memoryHistoryEnabled: true,
  memorySummaryFrequency: 5,
  autoMomentEnabled: false,
  proactiveMode1Enabled: false,
  proactiveMode1Minutes: 30,
  proactiveMode2Enabled: false,
  proactiveMode2MinMinutes: 5,
  proactiveMode2MaxMinutes: 10,
  proactiveChance: 35,
  proactiveLastSentAt: null,
  proactiveAwaitingUserReply: false,
  proactiveNextCheckAt: '',
  readAt: null,
  tokenStatsEnabled: false
};

const FREQUENCY_OPTIONS = [1, 3, 5, 10, 20, 50];

let rootEl = null;
let appState = null;
let characterId = '';
let character = null;
let fromRoute = null;
let memories = [];
let injectedStyle = false;

export async function mountChatMemory(containerEl, options = {}) {
  rootEl = containerEl;
  appState = options.appState || null;
  characterId = String(options.characterId || '').trim();
  fromRoute = options.fromRoute || null;

  injectStyle();

  if (!characterId) {
    showToast('群聊记忆先不单独整理');
    await appState?.navigateToList?.();
    return;
  }

  await loadMemoryData();

  if (!character) {
    showToast('这个角色的小本本不见了');
    await appState?.navigateToList?.();
    return;
  }

  renderMemoryPage();
}

async function loadMemoryData() {
  character = await getDB('characters', characterId);

  memories = normalizeArray(await getByIndexDB('memories', 'characterId', characterId))
    .filter((item) => item?.id)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

function renderMemoryPage() {
  if (!rootEl) return;

  rootEl.innerHTML = '';

  const page = el('section', 'chat-page chat-memory-page');

  const nav = el('header', 'chat-nav chat-memory-nav');

  const backButton = iconButton('back', '返回');
  backButton.addEventListener('click', handleBack);

  const titleWrap = el('div', 'chat-nav-title-wrap');
  titleWrap.append(
    el('div', 'chat-nav-title', '记忆'),
    el('div', 'chat-nav-subtitle', `${character?.name || 'TA'} 的小本本`)
  );

  const addButton = iconButton('add', '新增记忆');
  addButton.addEventListener('click', () => openMemoryEditSheet(null));

  nav.append(backButton, titleWrap, addButton);

  const content = el('main', 'chat-content chat-memory-content');
  const wrap = el('div', 'chat-content-narrow chat-memory-wrap');

  wrap.append(
    createConfigCard(),
    createMemoryListCard()
  );

  content.appendChild(wrap);
  page.append(nav, content);
  rootEl.appendChild(page);
}

function createConfigCard() {
  const config = getChatConfig(characterId);

  const card = el('section', 'chat-card memory-config-card');

  const head = el('div', 'memory-section-head');
  head.append(
    el('div', 'memory-section-title', '记忆设置'),
    el('div', 'memory-section-desc', 'TA 会把重要的小事收好，不会把你刷屏。')
  );

  const memorySwitch = createSwitchRow(
    '记忆开关',
    '允许 TA 把重要的事放进小本本',
    config.memoryEnabled !== false
  );

  const historySwitch = createSwitchRow(
    '参考历史聊天',
    '回复时带一点你们过去的上下文',
    config.memoryHistoryEnabled !== false
  );

  const frequencyBox = createFrequencyPicker(config.memorySummaryFrequency);

  const saveButton = button('保存记忆设置', 'primary', 'check');
  saveButton.addEventListener('click', () => {
    const frequency = getSelectedFrequency(frequencyBox);

    saveChatConfig(characterId, {
      ...config,
      memoryEnabled: getSwitchValue(memorySwitch),
      memoryHistoryEnabled: getSwitchValue(historySwitch),
      memorySummaryFrequency: Math.max(1, frequency)
    });

    showToast('记忆设置收好了');
    renderMemoryPage();
  });

  const folded = document.createElement('details');
  folded.className = 'memory-config-fold';

  const summary = el('summary', 'memory-config-summary');
  summary.append(
    el('span', '', '配置小卡片'),
    createIcon('arrow-down', 16)
  );

  const body = el('div', 'memory-config-body');
  body.append(memorySwitch, historySwitch, frequencyBox, saveButton);

  folded.append(summary, body);
  card.append(head, folded);

  return card;
}

function createFrequencyPicker(currentValue) {
  const current = Number(currentValue || DEFAULT_CHAT_CONFIG.memorySummaryFrequency);
  const box = el('div', 'memory-frequency-box');

  box.appendChild(el('div', 'memory-field-label', '摘要更新频率'));

  const chips = el('div', 'memory-frequency-chips');

  FREQUENCY_OPTIONS.forEach((num) => {
    const chip = el('button', `memory-frequency-chip ${current === num ? 'active' : ''}`, `每 ${num} 条`);
    chip.type = 'button';
    chip.dataset.value = String(num);

    chip.addEventListener('click', () => {
      chips.querySelectorAll('.memory-frequency-chip').forEach((node) => node.classList.remove('active'));
      chip.classList.add('active');

      const customInput = box.querySelector('.memory-custom-frequency');
      if (customInput) customInput.value = '';
    });

    chips.appendChild(chip);
  });

  const customInput = input('自定义条数');
  customInput.type = 'number';
  customInput.min = '1';
  customInput.className = 'chat-input-card memory-custom-frequency';

  if (!FREQUENCY_OPTIONS.includes(current)) {
    customInput.value = String(current);
  }

  customInput.addEventListener('input', () => {
    if (customInput.value.trim()) {
      chips.querySelectorAll('.memory-frequency-chip').forEach((node) => node.classList.remove('active'));
    }
  });

  box.append(chips, customInput);
  return box;
}

function getSelectedFrequency(frequencyBox) {
  const custom = Number(frequencyBox.querySelector('.memory-custom-frequency')?.value || 0);
  if (custom > 0) return custom;

  const active = frequencyBox.querySelector('.memory-frequency-chip.active');
  return Number(active?.dataset?.value || DEFAULT_CHAT_CONFIG.memorySummaryFrequency);
}

function createMemoryListCard() {
  const card = el('section', 'chat-card memory-list-card');

  const head = el('div', 'memory-section-head');
  head.append(
    el('div', 'memory-section-title', '管理记忆'),
    el('div', 'memory-section-desc', 'AI 悄悄记的、聊天摘要、你手写的，都放在这里。')
  );

  const list = el('div', 'memory-list');

  if (!memories.length) {
    list.appendChild(emptyState('还没有记忆', '等你们多聊聊，TA 就会慢慢把重要的事收好。'));
  } else {
    memories.forEach((memory) => {
      list.appendChild(createMemoryItem(memory));
    });
  }

  card.append(head, list);
  return card;
}

function createMemoryItem(memory) {
  const item = el('article', 'memory-item');

  const head = el('div', 'memory-item-head');
  head.append(
    el('span', `memory-source memory-source-${memory.source || 'auto'}`, getMemorySourceText(memory.source)),
    el('span', 'memory-time', formatRelativeTime(memory.createdAt))
  );

  const content = el('div', 'memory-item-content', memory.content || '');

  const actions = el('div', 'memory-item-actions');

  const editButton = smallActionButton('编辑', 'edit');
  editButton.addEventListener('click', () => openMemoryEditSheet(memory));

  const deleteButton = smallActionButton('删除', 'delete');
  deleteButton.addEventListener('click', () => deleteMemoryWithConfirm(memory));

  actions.append(editButton, deleteButton);
  item.append(head, content, actions);

  return item;
}

function getMemorySourceText(source) {
  if (source === 'manual') return '你写给 TA 的';
  if (source === 'summary') return '聊天摘要';
  if (source === 'auto') return 'AI 悄悄记的';
  return '小记忆';
}

function openMemoryEditSheet(memory) {
  const isEdit = Boolean(memory?.id);
  const source = isEdit ? (memory.source || 'auto') : 'manual';

  const sheet = el('div', 'chat-memory-sheet memory-edit-sheet');

  const head = el('div', 'chat-sheet-head');
  head.append(
    el('div', 'chat-sheet-title', isEdit ? '编辑小记忆' : '新增小记忆'),
    el('div', 'chat-sheet-subtitle', isEdit ? '只改内容，来源会乖乖保留。' : '你亲手写下来的，会标成手写记忆。')
  );

  const area = textarea('记忆内容');
  area.className = 'chat-input-card memory-edit-textarea';
  area.value = memory?.content || '';

  const sourceView = el('div', 'memory-source-view');
  sourceView.append(
    el('span', 'memory-source-view-label', '来源'),
    el('span', `memory-source-view-pill memory-source-${source}`, getMemorySourceText(source))
  );

  const saveButton = button('保存记忆', 'primary', 'check');
  saveButton.addEventListener('click', async () => {
    const content = area.value.trim();

    if (!content) {
      showToast('记忆内容不能为空');
      return;
    }

    const data = {
      id: memory?.id || generateId(),
      characterId: memory?.characterId || characterId,
      content,
      source,
      createdAt: memory?.createdAt || getNow()
    };

    await setDB('memories', data.id, data);

    hideBottomSheet();
    showToast(isEdit ? '记忆改好了' : '记忆放好了');

    await loadMemoryData();
    renderMemoryPage();
  });

  sheet.append(
    head,
    formRow('内容', area),
    sourceView,
    saveButton
  );

  showBottomSheet(sheet);
}

async function deleteMemoryWithConfirm(memory) {
  const ok = await showConfirm('要删掉这条记忆吗？');
  if (!ok) return;

  await deleteDB('memories', memory.id);

  showToast('这条记忆删掉了');

  await loadMemoryData();
  renderMemoryPage();
}

async function handleBack() {
  if (fromRoute?.name === 'thread') {
    const params = fromRoute.params || {};

    if (params.mode === 'group' && params.groupId) {
      await appState?.openGroupThread?.(params.groupId);
      return;
    }

    if (params.characterId) {
      await appState?.openPrivateThread?.(params.characterId);
      return;
    }
  }

  await appState?.navigateToList?.();
}

function getChatConfig(id) {
  if (!id) return { ...DEFAULT_CHAT_CONFIG };

  const saved = getData(`chat_${id}_config`) || {};

  return {
    ...DEFAULT_CHAT_CONFIG,
    ...saved,
    enabledMcpServerIds: normalizeArray(saved.enabledMcpServerIds),
    proactiveMode1Minutes: Number(saved.proactiveMode1Minutes || DEFAULT_CHAT_CONFIG.proactiveMode1Minutes),
    proactiveMode2MinMinutes: Number(saved.proactiveMode2MinMinutes || DEFAULT_CHAT_CONFIG.proactiveMode2MinMinutes),
    proactiveMode2MaxMinutes: Number(saved.proactiveMode2MaxMinutes || DEFAULT_CHAT_CONFIG.proactiveMode2MaxMinutes),
    proactiveChance: Number(saved.proactiveChance ?? DEFAULT_CHAT_CONFIG.proactiveChance),
    memorySummaryFrequency: Number(saved.memorySummaryFrequency || DEFAULT_CHAT_CONFIG.memorySummaryFrequency),
    proactiveNextCheckAt: saved.proactiveNextCheckAt || ''
  };
}

function saveChatConfig(id, config) {
  if (!id) return;

  setData(`chat_${id}_config`, {
    ...DEFAULT_CHAT_CONFIG,
    ...config,
    enabledMcpServerIds: normalizeArray(config.enabledMcpServerIds)
  });
}

function createSwitchRow(title, desc, checked = false) {
  const row = el('button', 'chat-switch-row');
  row.type = 'button';
  row.dataset.checked = checked ? 'true' : 'false';

  const text = el('span', 'chat-switch-text');
  text.append(
    el('span', 'chat-switch-title', title),
    el('span', 'chat-switch-desc', desc || '')
  );

  const track = el('span', 'chat-switch-track');
  track.appendChild(el('span', 'chat-switch-thumb'));

  row.append(text, track);

  row.addEventListener('click', () => {
    row.dataset.checked = row.dataset.checked === 'true' ? 'false' : 'true';
  });

  return row;
}

function getSwitchValue(row) {
  return row?.dataset?.checked === 'true';
}

function iconButton(iconName, label) {
  const btn = el('button', 'chat-icon-btn');
  btn.type = 'button';
  btn.setAttribute('aria-label', label || iconName);
  btn.appendChild(createIcon(iconName, 20));
  return btn;
}

function button(text, variant = 'ghost', iconName = '') {
  const btn = el('button', variant === 'primary' ? 'chat-primary-btn' : 'chat-ghost-btn');
  btn.type = 'button';

  if (iconName) btn.appendChild(createIcon(iconName, 16));
  btn.appendChild(el('span', '', text));

  return btn;
}

function smallActionButton(text, iconName) {
  const btn = el('button', 'memory-action-btn');
  btn.type = 'button';
  btn.append(createIcon(iconName, 13), el('span', '', text));
  return btn;
}

function input(placeholder = '') {
  const node = document.createElement('input');
  node.placeholder = placeholder;
  node.autocomplete = 'off';
  return node;
}

function textarea(placeholder = '') {
  const node = document.createElement('textarea');
  node.placeholder = placeholder;
  node.rows = 6;
  return node;
}

function formRow(label, control) {
  const row = el('label', 'chat-form-row');
  row.append(el('span', 'chat-form-label', label), control);
  return row;
}

function emptyState(title, desc) {
  const wrap = el('div', 'chat-empty');
  wrap.append(
    el('div', 'chat-empty-title', title),
    el('div', 'chat-empty-desc', desc)
  );
  return wrap;
}

function formatRelativeTime(time) {
  if (!time) return '';

  const date = new Date(time);
  const diff = Date.now() - date.getTime();

  if (Number.isNaN(diff)) return '';
  if (diff < 60 * 1000) return '刚刚';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}小时前`;

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function injectStyle() {
  if (injectedStyle || document.getElementById(MEMORY_STYLE_ID)) {
    injectedStyle = true;
    return;
  }

  injectedStyle = true;

  const style = document.createElement('style');
  style.id = MEMORY_STYLE_ID;
  style.textContent = `
    .chat-memory-page {
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .chat-memory-content {
      padding: 20px;
    }

    .chat-memory-wrap {
      display: flex;
      flex-direction: column;
      gap: 16px;
      min-height: 100%;
    }

    .memory-config-card,
    .memory-list-card {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 16px;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .memory-section-head {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .memory-section-title {
      color: var(--text-primary);
      font-size: 17px;
      font-weight: 600;
      line-height: 1.35;
    }

    .memory-section-desc {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.6;
    }

    .memory-config-fold {
      border-radius: var(--radius-lg);
      background: color-mix(in srgb, var(--bg-primary) 56%, var(--bg-card));
      box-shadow: var(--shadow-sm);
      overflow: hidden;
    }

    .memory-config-summary {
      min-height: 44px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 10px;
      padding: 12px;
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      list-style: none;
      transition: all 200ms ease;
    }

    .memory-config-summary::-webkit-details-marker {
      display: none;
    }

    .memory-config-summary:active {
      transform: scale(0.98);
    }

    .memory-config-body {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 0 12px 12px;
    }

    .memory-frequency-box {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .memory-field-label {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.4;
    }

    .memory-frequency-chips {
      display: flex;
      gap: 8px;
      overflow-x: auto;
      scrollbar-width: none;
      padding-bottom: 2px;
    }

    .memory-frequency-chips::-webkit-scrollbar {
      display: none;
    }

    .memory-frequency-chip {
      flex: 0 0 auto;
      min-height: 34px;
      padding: 0 12px;
      border: 0;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent-light) 34%, var(--bg-card));
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 13px;
      transition: all 200ms ease;
    }

    .memory-frequency-chip.active {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .memory-frequency-chip:active {
      transform: scale(0.96);
    }

    .memory-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .memory-item {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 13px;
      border-radius: var(--radius-lg);
      background: color-mix(in srgb, var(--bg-primary) 50%, var(--bg-card));
      box-shadow: var(--shadow-sm);
    }

    .memory-item-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .memory-source {
      min-width: 0;
      color: var(--accent-dark);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.35;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .memory-time {
      flex: 0 0 auto;
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.35;
    }

    .memory-item-content {
      color: var(--text-primary);
      font-size: 15px;
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .memory-item-actions {
      display: flex;
      justify-content: flex-end;
      flex-wrap: wrap;
      gap: 8px;
    }

    .memory-action-btn,
    .bottom-sheet .memory-action-btn {
      min-height: 28px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 0 9px;
      border: 0;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 12px;
      transition: all 200ms ease;
    }

    .memory-action-btn:active,
    .bottom-sheet .memory-action-btn:active {
      transform: scale(0.96);
    }

    .memory-source-view,
    .bottom-sheet .memory-source-view {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .memory-source-view-label,
    .bottom-sheet .memory-source-view-label {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.4;
    }

    .memory-source-view-pill,
    .bottom-sheet .memory-source-view-pill {
      min-height: 28px;
      display: inline-flex;
      align-items: center;
      padding: 0 10px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent-light) 34%, var(--bg-card));
      color: var(--accent-dark);
      font-size: 12px;
      font-weight: 600;
      line-height: 1;
      box-shadow: var(--shadow-sm);
    }

    .chat-memory-sheet,
    .bottom-sheet .chat-memory-sheet {
      display: flex;
      flex-direction: column;
      gap: 14px;
      padding: 4px 0 10px;
      color: var(--text-primary);
    }

    .chat-sheet-head,
    .bottom-sheet .chat-sheet-head {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 0 2px;
    }

    .chat-sheet-title,
    .bottom-sheet .chat-sheet-title {
      color: var(--text-primary);
      font-size: 17px;
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-sheet-subtitle,
    .bottom-sheet .chat-sheet-subtitle {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.6;
    }

    .memory-edit-textarea,
    .bottom-sheet .memory-edit-textarea {
      min-height: 132px;
      resize: vertical;
    }

    .chat-form-row,
    .bottom-sheet .chat-form-row {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .chat-form-label,
    .bottom-sheet .chat-form-label {
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.4;
    }

    .chat-switch-row,
    .bottom-sheet .chat-switch-row {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 12px;
      align-items: center;
      padding: 12px;
      border: 0;
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      text-align: left;
      transition: all 200ms ease;
    }

    .chat-switch-row:active,
    .bottom-sheet .chat-switch-row:active {
      transform: scale(0.96);
    }

    .chat-switch-text,
    .bottom-sheet .chat-switch-text {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .chat-switch-title,
    .bottom-sheet .chat-switch-title {
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-switch-desc,
    .bottom-sheet .chat-switch-desc {
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.45;
    }

    .chat-switch-track,
    .bottom-sheet .chat-switch-track {
      width: 44px;
      height: 26px;
      padding: 3px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--text-hint) 20%, var(--bg-secondary));
      transition: all 200ms ease;
    }

    .chat-switch-thumb,
    .bottom-sheet .chat-switch-thumb {
      width: 20px;
      height: 20px;
      display: block;
      border-radius: 999px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .chat-switch-row[data-checked="true"] .chat-switch-track,
    .bottom-sheet .chat-switch-row[data-checked="true"] .chat-switch-track {
      background: var(--accent);
    }

    .chat-switch-row[data-checked="true"] .chat-switch-thumb,
    .bottom-sheet .chat-switch-row[data-checked="true"] .chat-switch-thumb {
      transform: translateX(18px);
    }

    @media (max-width: 680px) {
      .chat-memory-content {
        padding-left: 20px;
        padding-right: 20px;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/storage.js(getData,setData,generateId,getNow,getDB,setDB,deleteDB,getByIndexDB)；../../core/ui.js(showToast,showBottomSheet,hideBottomSheet,showConfirm,createIcon)；由 apps/chat.js 提供 appState.navigateToList/openPrivateThread/openGroupThread
