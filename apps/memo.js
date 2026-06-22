// apps/memo.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getDB
//   from '../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon

import {
  getData, setData, generateId, getNow, getDB
} from '../core/storage.js';

import {
  showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon
} from '../core/ui.js';

const MEMO_KEY = 'memos';
const STYLE_ID = 'memo-styles';
const BG_KEY = 'app_bg_memo';

let container = null;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .memo-screen {
      position: fixed;
      inset: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .memo-screen.has-bg {
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }

    .memo-soft-layer {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background: color-mix(in srgb, var(--bg-primary) 80%, transparent);
    }

    .memo-nav {
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

    .memo-nav-title {
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

    .memo-body {
      position: relative;
      z-index: 1;
      flex: 1;
      overflow-x: hidden;
      overflow-y: auto;
      padding: calc(56px + env(safe-area-inset-top) + 18px) 20px calc(88px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling: touch;
    }

    .memo-hero {
      padding: 22px;
      border-radius: 28px;
      background: var(--bg-card);
      box-shadow: var(--shadow-md);
    }

    .memo-hero-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-md);
    }

    .memo-hero-title {
      color: var(--text-primary);
      font-size: 24px;
      font-weight: 600;
      line-height: 1.25;
      letter-spacing: -0.02em;
    }

    .memo-hero-text {
      margin-top: 8px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .memo-mark {
      width: 48px;
      height: 48px;
      flex: 0 0 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 18px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .memo-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      margin-top: var(--spacing-md);
    }

    .memo-card {
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
      cursor: pointer;
    }

    .memo-card:active {
      transform: scale(0.98);
    }

    .memo-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-md);
    }

    .memo-card-main {
      flex: 1;
      min-width: 0;
    }

    .memo-card-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .memo-card-time {
      margin-top: 3px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    .memo-card-text {
      margin-top: 10px;
      color: var(--text-secondary);
      font-size: var(--font-size-base);
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
    }

    .memo-actions {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin-top: 14px;
    }

    .memo-action-btn {
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      border-radius: 12px;
      color: var(--text-secondary);
      background: var(--surface-muted);
      font-size: var(--font-size-small);
      font-weight: 500;
      transition: var(--motion);
    }

    .memo-action-btn:active {
      transform: scale(0.96);
    }

    .memo-action-btn.danger {
      color: var(--accent-dark);
    }

    .memo-empty {
      min-height: 260px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-md);
      padding: var(--spacing-lg);
      border-radius: 24px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      color: var(--text-secondary);
      text-align: center;
    }

    .memo-empty-icon {
      width: 58px;
      height: 58px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 22px;
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .memo-empty-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .memo-empty-text {
      max-width: 260px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .memo-sheet-title {
      margin-bottom: var(--spacing-md);
      color: var(--text-primary);
      font-size: 20px;
      font-weight: 600;
      line-height: 1.35;
      letter-spacing: -0.01em;
    }

    .memo-field {
      margin-bottom: var(--spacing-md);
    }

    .memo-field-label {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: var(--spacing-sm);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 500;
      line-height: 1.4;
    }

    .memo-field-label svg {
      width: 15px;
      height: 15px;
      color: var(--accent);
    }

    .memo-input,
    .memo-textarea {
      width: 100%;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: var(--font-size-base);
    }

    .memo-input {
      min-height: 46px;
      padding: 10px var(--spacing-md);
    }

    .memo-textarea {
      min-height: 220px;
      padding: 12px var(--spacing-md);
      line-height: 1.6;
    }

    .memo-input::placeholder,
    .memo-textarea::placeholder {
      color: var(--text-hint);
    }

    .memo-sheet-actions {
      display: flex;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-lg);
    }

    .memo-sheet-actions button {
      flex: 1;
    }
  `;

  document.head.appendChild(style);
}

function readMemos() {
  const list = getData(MEMO_KEY);
  if (!Array.isArray(list)) return [];

  return list
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: item.id || generateId(),
      title: item.title || '未命名',
      content: item.content || '',
      createdAt: item.createdAt || getNow(),
      updatedAt: item.updatedAt || item.createdAt || getNow()
    }))
    .sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));
}

function saveMemos(list) {
  setData(MEMO_KEY, Array.isArray(list) ? list : []);
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

export async function mount(containerEl) {
  injectStyles();
  container = containerEl;

  const screen = document.createElement('section');
  screen.className = 'memo-screen';

  const softLayer = document.createElement('div');
  softLayer.className = 'memo-soft-layer';

  const nav = document.createElement('div');
  nav.className = 'memo-nav';

  const backButton = document.createElement('button');
  backButton.className = 'icon-button';
  backButton.type = 'button';
  backButton.setAttribute('aria-label', '返回');
  backButton.appendChild(createIcon('back', 22));
  backButton.addEventListener('click', () => window.closeCurrentApp?.());

  const title = document.createElement('div');
  title.className = 'memo-nav-title';
  title.textContent = '备忘录';

  const addButton = document.createElement('button');
  addButton.className = 'icon-button soft';
  addButton.type = 'button';
  addButton.setAttribute('aria-label', '新建');
  addButton.appendChild(createIcon('add', 22));
  addButton.addEventListener('click', () => openEditor(null));

  const body = document.createElement('div');
  body.className = 'memo-body';

  nav.append(backButton, title, addButton);
  screen.append(softLayer, nav, body);

  container.innerHTML = '';
  container.appendChild(screen);

  await applyMemoBackground(screen);
  renderMemo();
}

export function unmount() {
  if (container) {
    container.innerHTML = '';
    container = null;
  }
}

async function applyMemoBackground(screen) {
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

function renderMemo() {
  const body = container?.querySelector('.memo-body');
  if (!body) return;

  const memos = readMemos();

  body.innerHTML = '';

  const hero = document.createElement('section');
  hero.className = 'memo-hero';

  const heroTop = document.createElement('div');
  heroTop.className = 'memo-hero-top';

  const heroMain = document.createElement('div');

  const heroTitle = document.createElement('div');
  heroTitle.className = 'memo-hero-title';
  heroTitle.textContent = '把小想法先放这里';

  const heroText = document.createElement('div');
  heroText.className = 'memo-hero-text';
  heroText.textContent = memos.length
    ? `已经收好 ${memos.length} 条小记录`
    : '灵感、待办、心事，都可以轻轻记一下。';

  const mark = document.createElement('div');
  mark.className = 'memo-mark';
  mark.appendChild(createMemoSvg());

  heroMain.append(heroTitle, heroText);
  heroTop.append(heroMain, mark);
  hero.appendChild(heroTop);

  body.appendChild(hero);

  if (!memos.length) {
    body.appendChild(createEmptyState());
    return;
  }

  const list = document.createElement('div');
  list.className = 'memo-list';

  memos.forEach((memo) => {
    list.appendChild(createMemoCard(memo));
  });

  body.appendChild(list);
}

function createMemoCard(memo) {
  const card = document.createElement('article');
  card.className = 'memo-card';
  card.setAttribute('role', 'button');
  card.tabIndex = 0;

  const top = document.createElement('div');
  top.className = 'memo-card-top';

  const main = document.createElement('div');
  main.className = 'memo-card-main';

  const title = document.createElement('div');
  title.className = 'memo-card-title';
  title.textContent = memo.title || '未命名';

  const time = document.createElement('div');
  time.className = 'memo-card-time';
  time.textContent = `更新于 ${formatTime(memo.updatedAt || memo.createdAt)}`;

  main.append(title, time);
  top.appendChild(main);

  const text = document.createElement('div');
  text.className = 'memo-card-text';
  text.textContent = memo.content || '还没有写内容';

  const actions = document.createElement('div');
  actions.className = 'memo-actions';

  const editButton = document.createElement('button');
  editButton.className = 'memo-action-btn';
  editButton.type = 'button';
  editButton.append(createIcon('edit', 14), document.createTextNode('编辑'));
  editButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openEditor(memo);
  });

  const deleteButton = document.createElement('button');
  deleteButton.className = 'memo-action-btn danger';
  deleteButton.type = 'button';
  deleteButton.append(createIcon('delete', 14), document.createTextNode('删除'));
  deleteButton.addEventListener('click', async (event) => {
    event.stopPropagation();
    await deleteMemo(memo);
  });

  actions.append(editButton, deleteButton);
  card.append(top, text, actions);

  card.addEventListener('click', () => openEditor(memo));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openEditor(memo);
    }
  });

  return card;
}

function createEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'memo-empty';

  const icon = document.createElement('div');
  icon.className = 'memo-empty-icon';
  icon.appendChild(createIcon('edit', 26));

  const title = document.createElement('div');
  title.className = 'memo-empty-title';
  title.textContent = '还没有小纸条';

  const text = document.createElement('div');
  text.className = 'memo-empty-text';
  text.textContent = '点右上角新建，把今天想到的事情先收起来。';

  empty.append(icon, title, text);
  return empty;
}

function openEditor(memo) {
  const isEdit = Boolean(memo);
  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'memo-sheet-title';
  title.textContent = isEdit ? '编辑小纸条' : '新建小纸条';

  const titleField = createInputField('标题', '写个短短的标题', memo?.title || '');
  const contentField = createTextareaField('正文', '慢慢写，不急', memo?.content || '');

  const actions = document.createElement('div');
  actions.className = 'memo-sheet-actions';

  const cancelButton = document.createElement('button');
  cancelButton.className = 'btn-ghost';
  cancelButton.type = 'button';
  cancelButton.textContent = '取消';
  cancelButton.addEventListener('click', hideBottomSheet);

  const saveButton = document.createElement('button');
  saveButton.className = 'btn-primary';
  saveButton.type = 'button';
  saveButton.textContent = isEdit ? '保存' : '记下来';

  saveButton.addEventListener('click', () => {
    const nextTitle = titleField.querySelector('input').value.trim();
    const nextContent = contentField.querySelector('textarea').value.trim();

    if (!nextTitle && !nextContent) {
      showToast('还没有写内容');
      return;
    }

    const list = readMemos();
    const now = getNow();

    if (isEdit) {
      const nextList = list.map((item) => {
        if (item.id !== memo.id) return item;
        return {
          ...item,
          title: nextTitle || '未命名',
          content: nextContent,
          updatedAt: now
        };
      });
      saveMemos(nextList);
    } else {
      list.unshift({
        id: generateId(),
        title: nextTitle || '未命名',
        content: nextContent,
        createdAt: now,
        updatedAt: now
      });
      saveMemos(list);
    }

    hideBottomSheet();
    showToast('已收好');
    renderMemo();
  });

  actions.append(cancelButton, saveButton);
  sheet.append(title, titleField, contentField, actions);

  showBottomSheet(sheet);
}

function createInputField(labelText, placeholder, value) {
  const field = document.createElement('div');
  field.className = 'memo-field';

  const label = document.createElement('div');
  label.className = 'memo-field-label';
  label.append(createIcon('edit', 15), document.createTextNode(labelText));

  const input = document.createElement('input');
  input.className = 'memo-input';
  input.type = 'text';
  input.placeholder = placeholder;
  input.value = value;

  field.append(label, input);
  return field;
}

function createTextareaField(labelText, placeholder, value) {
  const field = document.createElement('div');
  field.className = 'memo-field';

  const label = document.createElement('div');
  label.className = 'memo-field-label';
  label.append(createIcon('memory', 15), document.createTextNode(labelText));

  const textarea = document.createElement('textarea');
  textarea.className = 'memo-textarea';
  textarea.placeholder = placeholder;
  textarea.value = value;

  field.append(label, textarea);
  return field;
}

async function deleteMemo(memo) {
  const ok = await showConfirm(`确定删除「${memo.title || '未命名'}」吗？`);
  if (!ok) return;

  const list = readMemos().filter((item) => item.id !== memo.id);
  saveMemos(list);
  showToast('已删除');
  renderMemo();
}

function createMemoSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '28');
  svg.setAttribute('height', '28');
  svg.setAttribute('viewBox', '0 0 28 28');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const paper = svgPath('M8 4.5h9.5L22 9v14.5H8V4.5z');
  paper.setAttribute('fill', 'var(--bg-card)');
  paper.setAttribute('opacity', '0.55');

  svg.append(
    paper,
    svgPath('M8 4.5h9.5L22 9v14.5H8V4.5z'),
    svgPath('M17.5 4.5V9H22'),
    svgPath('M11.5 13h7'),
    svgPath('M11.5 17h7'),
    svgPath('M11.5 21h4')
  );

  return svg;
}

function svgPath(d) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  return path;
}

// 依赖：../core/storage.js 的 getData/setData/generateId/getNow/getDB；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon
