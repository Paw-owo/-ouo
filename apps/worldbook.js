// apps/worldbook.js
// imports:
//   from '../core/storage.js': generateId, getNow, getAllDB, setDB, deleteDB
//   from '../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon

import {
  generateId, getNow, getAllDB, setDB, deleteDB
} from '../core/storage.js';

import {
  showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon
} from '../core/ui.js';

const STYLE_ID = 'worldbook-styles';

let container = null;
let currentTab = 'A';
let editingEntry = null;
let selectedChars = [];
let allChars = [];

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .wb-screen {
      position: fixed;
      inset: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .wb-nav {
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

    .wb-nav-title {
      flex: 1;
      min-width: 0;
      font-size: var(--font-size-title);
      font-weight: 600;
      color: var(--text-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wb-body {
      flex: 1;
      overflow-x: hidden;
      overflow-y: auto;
      padding: calc(56px + env(safe-area-inset-top) + var(--spacing-md)) 20px calc(88px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling: touch;
    }

    .wb-tab-bar {
      display: flex;
      gap: var(--spacing-xs);
      padding: var(--spacing-xs);
      margin-bottom: var(--spacing-md);
      border-radius: var(--radius-md);
      background: var(--surface-muted);
    }

    .wb-tab-btn {
      flex: 1;
      min-height: 36px;
      border-radius: 12px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 500;
      transition: var(--motion);
    }

    .wb-tab-btn.active {
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .wb-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .wb-card {
      background: var(--bg-card);
      border-radius: var(--radius-lg);
      padding: var(--spacing-md);
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
      cursor: pointer;
    }

    .wb-card:active {
      transform: scale(0.98);
    }

    .wb-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-md);
    }

    .wb-card-info {
      flex: 1;
      min-width: 0;
    }

    .wb-card-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.4;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wb-card-type {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    .wb-card-preview {
      margin-top: 10px;
      color: var(--text-secondary);
      font-size: var(--font-size-base);
      line-height: 1.6;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .wb-card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 12px;
    }

    .wb-tag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      max-width: 100%;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--accent-light);
      color: var(--accent-dark);
      font-size: 12px;
      font-weight: 500;
      line-height: 1.4;
    }

    .wb-tag.all {
      background: var(--surface-muted);
      color: var(--text-secondary);
    }

    .wb-char-avatar,
    .wb-tag-avatar {
      width: 20px;
      height: 20px;
      flex: 0 0 20px;
      border-radius: 50%;
      object-fit: cover;
      background: var(--bg-secondary);
    }

    .wb-card-actions {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin-top: 14px;
    }

    .wb-action-btn {
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      border-radius: 12px;
      color: var(--text-secondary);
      background: var(--surface-muted);
      font-size: 12px;
      font-weight: 500;
      transition: var(--motion);
    }

    .wb-action-btn:active {
      transform: scale(0.96);
    }

    .wb-action-btn svg {
      width: 14px;
      height: 14px;
      flex: 0 0 14px;
    }

    .wb-action-btn.danger {
      color: var(--accent-dark);
    }

    .wb-empty {
      min-height: 260px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-lg);
      text-align: center;
      color: var(--text-secondary);
    }

    .wb-empty-icon {
      width: 58px;
      height: 58px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 22px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .wb-empty-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .wb-empty-text {
      max-width: 260px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .wb-sheet {
      padding-bottom: calc(var(--spacing-lg) + env(safe-area-inset-bottom));
    }

    .wb-sheet-title {
      margin-bottom: var(--spacing-md);
      color: var(--text-primary);
      font-size: 20px;
      font-weight: 600;
      line-height: 1.35;
      letter-spacing: -0.01em;
    }

    .wb-field {
      margin-bottom: var(--spacing-md);
    }

    .wb-field-label {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: var(--spacing-sm);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 500;
      line-height: 1.4;
    }

    .wb-field-label svg {
      width: 15px;
      height: 15px;
      color: var(--accent);
    }

    .wb-input,
    .wb-textarea {
      width: 100%;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: var(--font-size-base);
    }

    .wb-input {
      min-height: 46px;
      padding: 10px var(--spacing-md);
    }

    .wb-textarea {
      min-height: 150px;
      padding: 12px var(--spacing-md);
      line-height: 1.6;
    }

    .wb-input::placeholder,
    .wb-textarea::placeholder {
      color: var(--text-hint);
    }

    .wb-type-toggle {
      display: flex;
      gap: var(--spacing-xs);
      padding: var(--spacing-xs);
      border-radius: var(--radius-md);
      background: var(--surface-muted);
    }

    .wb-type-btn {
      flex: 1;
      min-height: 36px;
      border-radius: 12px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 500;
      transition: var(--motion);
    }

    .wb-type-btn.active {
      background: var(--bg-card);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .wb-type-hint {
      margin-top: var(--spacing-sm);
      color: var(--text-hint);
      font-size: var(--font-size-small);
      line-height: 1.5;
    }

    .wb-char-grid {
      display: flex;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }

    .wb-char-chip {
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 999px;
      color: var(--text-secondary);
      background: var(--surface-muted);
      font-size: var(--font-size-small);
      font-weight: 500;
      transition: var(--motion);
    }

    .wb-char-chip:active {
      transform: scale(0.96);
    }

    .wb-char-chip.selected {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .wb-char-chip.all-chip.selected {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .wb-enable-row {
      min-height: 52px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-md);
      padding: 4px 0;
    }

    .wb-enable-label {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 500;
    }

    .wb-save-btn {
      width: 100%;
      min-height: 48px;
      border-radius: var(--radius-md);
      background: var(--accent);
      color: var(--bubble-user-text);
      font-size: var(--font-size-base);
      font-weight: 600;
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
    }

    .wb-save-btn:active {
      transform: scale(0.96);
    }
  `;

  document.head.appendChild(style);
}

export async function mount(containerEl) {
  injectStyles();
  container = containerEl;
  currentTab = 'A';
  editingEntry = null;
  selectedChars = [];
  allChars = await getAllDB('characters');

  const screen = document.createElement('section');
  screen.className = 'wb-screen';

  const nav = document.createElement('div');
  nav.className = 'wb-nav';

  const backButton = document.createElement('button');
  backButton.className = 'icon-button';
  backButton.type = 'button';
  backButton.setAttribute('aria-label', '返回');
  backButton.appendChild(createIcon('back', 22));
  backButton.addEventListener('click', () => window.closeCurrentApp?.());

  const title = document.createElement('div');
  title.className = 'wb-nav-title';
  title.textContent = '世界书';

  const addButton = document.createElement('button');
  addButton.className = 'icon-button soft';
  addButton.type = 'button';
  addButton.setAttribute('aria-label', '新增');
  addButton.appendChild(createIcon('add', 22));
  addButton.addEventListener('click', () => openEditor(null));

  const body = document.createElement('div');
  body.className = 'wb-body';

  const tabBar = document.createElement('div');
  tabBar.className = 'wb-tab-bar';

  const tabA = createTabButton('A', '人设背景');
  const tabB = createTabButton('B', '思维方式');
  tabBar.append(tabA, tabB);

  const listWrap = document.createElement('div');
  listWrap.className = 'wb-list-wrap';

  body.append(tabBar, listWrap);
  nav.append(backButton, title, addButton);
  screen.append(nav, body);

  container.innerHTML = '';
  container.appendChild(screen);

  await renderList();
}

export function unmount() {
  if (container) {
    container.innerHTML = '';
    container = null;
  }

  editingEntry = null;
  selectedChars = [];
  allChars = [];
}

export async function getWorldbookForCharacter(characterId) {
  try {
    const all = await getAllDB('worldbook');
    if (!Array.isArray(all) || all.length === 0) return '';

    const parts = [];

    for (const entry of all) {
      if (!entry || entry.enabled === false) continue;
      if (!entry.content || !String(entry.content).trim()) continue;

      if (entry.type === 'B') {
        parts.push(String(entry.content).trim());
        continue;
      }

      if (entry.type === 'A') {
        const targets = entry.targetIds;

        if (targets === 'all' || (Array.isArray(targets) && targets.includes('all'))) {
          parts.push(String(entry.content).trim());
          continue;
        }

        if (Array.isArray(targets) && characterId && targets.includes(characterId)) {
          parts.push(String(entry.content).trim());
        }
      }
    }

    return parts.length ? `\n\n[世界书]\n${parts.join('\n\n')}` : '';
  } catch (error) {
    console.warn('[worldbook] getWorldbookForCharacter failed', error);
    return '';
  }
}

function createTabButton(type, label) {
  const button = document.createElement('button');
  button.className = `wb-tab-btn ${currentTab === type ? 'active' : ''}`;
  button.type = 'button';
  button.textContent = label;
  button.dataset.tab = type;

  button.addEventListener('click', async () => {
    currentTab = type;
    container.querySelectorAll('.wb-tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === currentTab);
    });
    await renderList();
  });

  return button;
}

async function renderList() {
  const wrap = container?.querySelector('.wb-list-wrap');
  if (!wrap) return;

  allChars = await getAllDB('characters');

  const entries = (await getAllDB('worldbook'))
    .filter((entry) => entry && entry.type === currentTab)
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  wrap.innerHTML = '';

  if (!entries.length) {
    wrap.appendChild(createEmptyState());
    return;
  }

  const list = document.createElement('div');
  list.className = 'wb-list';

  entries.forEach((entry) => {
    list.appendChild(createCard(entry));
  });

  wrap.appendChild(list);
}

function createEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'wb-empty';

  const icon = document.createElement('div');
  icon.className = 'wb-empty-icon';
  icon.appendChild(createIcon(currentTab === 'A' ? 'memory' : 'star', 26));

  const title = document.createElement('div');
  title.className = 'wb-empty-title';
  title.textContent = currentTab === 'A' ? '还没有人设背景' : '还没有思维方式';

  const text = document.createElement('div');
  text.className = 'wb-empty-text';
  text.textContent = currentTab === 'A'
    ? '这里可以写角色背景、世界观和关系设定'
    : '这里可以写所有角色都会参考的思考方式';

  empty.append(icon, title, text);
  return empty;
}

function createCard(entry) {
  const card = document.createElement('article');
  card.className = 'wb-card';
  card.setAttribute('role', 'button');
  card.tabIndex = 0;

  const top = document.createElement('div');
  top.className = 'wb-card-top';

  const info = document.createElement('div');
  info.className = 'wb-card-info';

  const title = document.createElement('div');
  title.className = 'wb-card-title';
  title.textContent = entry.title || '未命名';

  const type = document.createElement('div');
  type.className = 'wb-card-type';
  type.textContent = `${entry.type === 'A' ? '人设背景' : '思维方式'}${entry.enabled === false ? ' · 已禁用' : ''}`;

  info.append(title, type);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = `switch ${entry.enabled !== false ? 'active' : ''}`;
  toggle.setAttribute('aria-label', entry.enabled !== false ? '禁用' : '启用');
  toggle.addEventListener('click', async (event) => {
    event.stopPropagation();
    await setDB('worldbook', entry.id, {
      ...entry,
      enabled: entry.enabled === false
    });
    showToast(entry.enabled === false ? '已启用' : '已禁用');
    await renderList();
  });

  top.append(info, toggle);

  const preview = document.createElement('div');
  preview.className = 'wb-card-preview';
  preview.textContent = entry.content || '暂无内容';

  const tags = createTags(entry);

  const actions = document.createElement('div');
  actions.className = 'wb-card-actions';

  const editBtn = document.createElement('button');
  editBtn.className = 'wb-action-btn';
  editBtn.type = 'button';
  editBtn.append(createIcon('edit', 14), document.createTextNode('编辑'));
  editBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    openEditor(entry);
  });

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'wb-action-btn danger';
  deleteBtn.type = 'button';
  deleteBtn.append(createIcon('delete', 14), document.createTextNode('删除'));
  deleteBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    await deleteEntry(entry);
  });

  actions.append(editBtn, deleteBtn);
  card.append(top, preview);

  if (tags) card.appendChild(tags);
  card.appendChild(actions);

  card.addEventListener('click', () => openEditor(entry));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openEditor(entry);
    }
  });

  return card;
}

function createTags(entry) {
  if (entry.type !== 'A') return null;

  const tags = document.createElement('div');
  tags.className = 'wb-card-tags';

  const targets = entry.targetIds;

  if (targets === 'all' || (Array.isArray(targets) && targets.includes('all'))) {
    const tag = document.createElement('span');
    tag.className = 'wb-tag all';
    tag.textContent = '通用 · 所有角色';
    tags.appendChild(tag);
    return tags;
  }

  if (!Array.isArray(targets) || targets.length === 0) {
    const tag = document.createElement('span');
    tag.className = 'wb-tag all';
    tag.textContent = '未绑定角色';
    tags.appendChild(tag);
    return tags;
  }

  targets.forEach((id) => {
    const char = allChars.find((item) => item.id === id);
    const tag = document.createElement('span');
    tag.className = 'wb-tag';

    if (char?.avatar) {
      const img = document.createElement('img');
      img.className = 'wb-tag-avatar';
      img.src = char.avatar;
      img.alt = '';
      tag.appendChild(img);
    }

    tag.appendChild(document.createTextNode(char?.name || '未知角色'));
    tags.appendChild(tag);
  });

  return tags;
}

async function deleteEntry(entry) {
  const ok = await showConfirm(`确定删除「${entry.title || '未命名'}」吗？`);
  if (!ok) return;

  await deleteDB('worldbook', entry.id);
  showToast('已删除');
  await renderList();
}

function openEditor(entry) {
  editingEntry = entry;
  const isEdit = Boolean(entry);
  const initialType = entry?.type === 'B' ? 'B' : 'A';

  if (entry?.type === 'A') {
    selectedChars = normalizeTargetIds(entry.targetIds);
  } else {
    selectedChars = [];
  }

  const sheet = document.createElement('div');
  sheet.className = 'wb-sheet';

  const title = document.createElement('div');
  title.className = 'wb-sheet-title';
  title.textContent = isEdit ? '编辑世界书' : '新增世界书';

  const typeField = createTypeField(initialType, sheet);
  const bindField = createBindField(initialType);
  const titleField = createTextField('标题', '给这条设定起个名字', entry?.title || '');
  const contentField = createTextareaField('内容', '写下背景、世界观、说话方式或思维模式', entry?.content || '');
  const enabledRow = createEnabledRow(entry?.enabled !== false);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'wb-save-btn';
  saveBtn.type = 'button';
  saveBtn.textContent = isEdit ? '保存修改' : '添加条目';

  saveBtn.addEventListener('click', async () => {
    const type = sheet.querySelector('.wb-type-btn.active')?.dataset.type || 'A';
    const nextTitle = titleField.querySelector('input').value.trim();
    const nextContent = contentField.querySelector('textarea').value.trim();
    const enabled = enabledRow.querySelector('.switch').classList.contains('active');

    if (!nextTitle) {
      showToast('标题还没写');
      return;
    }

    if (!nextContent) {
      showToast('内容还没写');
      return;
    }

    const targetIds = type === 'A'
      ? (selectedChars.includes('all') || selectedChars.length === 0 ? 'all' : [...selectedChars])
      : 'all';

    const nextEntry = {
      id: editingEntry?.id || generateId(),
      type,
      title: nextTitle,
      content: nextContent,
      targetIds,
      enabled,
      createdAt: editingEntry?.createdAt || getNow()
    };

    await setDB('worldbook', nextEntry.id, nextEntry);
    hideBottomSheet();
    showToast(isEdit ? '已保存' : '已添加');
    editingEntry = null;
    await renderList();
  });

  sheet.append(title, typeField, bindField, titleField, contentField, enabledRow, saveBtn);
  showBottomSheet(sheet);
}

function createTypeField(initialType, sheet) {
  const field = document.createElement('div');
  field.className = 'wb-field';

  const label = createFieldLabel('edit', '类型');
  const toggle = document.createElement('div');
  toggle.className = 'wb-type-toggle';

  const btnA = document.createElement('button');
  btnA.className = `wb-type-btn ${initialType === 'A' ? 'active' : ''}`;
  btnA.type = 'button';
  btnA.dataset.type = 'A';
  btnA.textContent = '人设背景';

  const btnB = document.createElement('button');
  btnB.className = `wb-type-btn ${initialType === 'B' ? 'active' : ''}`;
  btnB.type = 'button';
  btnB.dataset.type = 'B';
  btnB.textContent = '思维方式';

  const hint = document.createElement('div');
  hint.className = 'wb-type-hint';
  hint.textContent = initialType === 'A'
    ? '人设背景可以绑定指定角色，也可以给全部角色使用'
    : '思维方式会自动给全部角色使用';

  function setType(type) {
    toggle.querySelectorAll('.wb-type-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.type === type);
    });

    const bindField = sheet.querySelector('.wb-bind-field');
    if (bindField) {
      bindField.style.display = type === 'A' ? '' : 'none';
    }

    hint.textContent = type === 'A'
      ? '人设背景可以绑定指定角色，也可以给全部角色使用'
      : '思维方式会自动给全部角色使用';
  }

  btnA.addEventListener('click', () => setType('A'));
  btnB.addEventListener('click', () => setType('B'));

  toggle.append(btnA, btnB);
  field.append(label, toggle, hint);
  return field;
}

function createBindField(initialType) {
  const field = document.createElement('div');
  field.className = 'wb-field wb-bind-field';
  field.style.display = initialType === 'A' ? '' : 'none';

  const label = createFieldLabel('heart', '绑定角色');
  const grid = document.createElement('div');
  grid.className = 'wb-char-grid';

  field.append(label, grid);
  renderCharChips(grid);

  return field;
}

function renderCharChips(grid) {
  grid.innerHTML = '';

  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = `wb-char-chip all-chip ${selectedChars.includes('all') ? 'selected' : ''}`;
  allChip.textContent = '通用';
  allChip.addEventListener('click', () => {
    selectedChars = selectedChars.includes('all') ? [] : ['all'];
    renderCharChips(grid);
  });
  grid.appendChild(allChip);

  allChars.forEach((char) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = `wb-char-chip ${selectedChars.includes(char.id) && !selectedChars.includes('all') ? 'selected' : ''}`;

    if (char.avatar) {
      const img = document.createElement('img');
      img.className = 'wb-char-avatar';
      img.src = char.avatar;
      img.alt = '';
      chip.appendChild(img);
    }

    chip.appendChild(document.createTextNode(char.name || '未命名'));

    chip.addEventListener('click', () => {
      if (selectedChars.includes('all')) {
        selectedChars = [char.id];
      } else if (selectedChars.includes(char.id)) {
        selectedChars = selectedChars.filter((id) => id !== char.id);
      } else {
        selectedChars.push(char.id);
      }

      renderCharChips(grid);
    });

    grid.appendChild(chip);
  });

  if (!allChars.length) {
    const hint = document.createElement('div');
    hint.className = 'wb-type-hint';
    hint.textContent = '还没有角色，之后创建角色也可以回来绑定';
    grid.appendChild(hint);
  }
}

function createTextField(labelText, placeholder, value) {
  const field = document.createElement('div');
  field.className = 'wb-field';

  const label = createFieldLabel('memory', labelText);
  const input = document.createElement('input');
  input.className = 'wb-input';
  input.type = 'text';
  input.placeholder = placeholder;
  input.value = value;

  field.append(label, input);
  return field;
}

function createTextareaField(labelText, placeholder, value) {
  const field = document.createElement('div');
  field.className = 'wb-field';

  const label = createFieldLabel('edit', labelText);
  const textarea = document.createElement('textarea');
  textarea.className = 'wb-textarea';
  textarea.placeholder = placeholder;
  textarea.value = value;

  field.append(label, textarea);
  return field;
}

function createEnabledRow(enabled) {
  const row = document.createElement('div');
  row.className = 'wb-enable-row';

  const label = document.createElement('div');
  label.className = 'wb-enable-label';
  label.textContent = '启用';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = `switch ${enabled ? 'active' : ''}`;
  toggle.setAttribute('aria-label', '启用开关');
  toggle.addEventListener('click', () => {
    toggle.classList.toggle('active');
  });

  row.append(label, toggle);
  return row;
}

function createFieldLabel(iconName, text) {
  const label = document.createElement('div');
  label.className = 'wb-field-label';
  label.append(createIcon(iconName, 15), document.createTextNode(text));
  return label;
}

function normalizeTargetIds(targetIds) {
  if (targetIds === 'all') return ['all'];
  if (Array.isArray(targetIds) && targetIds.includes('all')) return ['all'];
  if (Array.isArray(targetIds)) return [...targetIds];
  return ['all'];
}

// 依赖：../core/storage.js 的 generateId/getNow/getAllDB/setDB/deleteDB；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon
