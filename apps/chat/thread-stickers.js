// apps/chat/thread-stickers.js
// imports:
//   from '../../core/storage.js': getAllDB, setDB, deleteDB, generateId, getNow
//   from '../../core/ui.js': createIcon, showBottomSheet, hideBottomSheet, showToast
//   from './thread-actions.js': sendStickerMessage
//   from './thread-relationship.js': getRelationshipLockLevel, openRelationshipLockSheet

import {
  getAllDB,
  setDB,
  deleteDB,
  generateId,
  getNow
} from '../../core/storage.js';

import {
  createIcon,
  showBottomSheet,
  hideBottomSheet,
  showToast
} from '../../core/ui.js';

import { sendStickerMessage } from './thread-actions.js';

import {
  getRelationshipLockLevel,
  openRelationshipLockSheet
} from './thread-relationship.js';

const STICKER_STYLE_ID = 'chat-thread-stickers-style';
const STICKER_MODAL_ID = 'chat-thread-sticker-modal';
const MAX_STICKER_IMAGE_SIZE = 4 * 1024 * 1024;

const stickerState = {
  state: null,
  mounted: false,
  sheetEl: null,
  modalEl: null,
  manageMode: false,
  searchOpen: false,
  searchValue: '',
  items: [],
  refresh: null
};

// ═══════════════════════════════════════
// 【公开接口】打开和关闭表情包面板
// ═══════════════════════════════════════

export async function openStickerSheet(state, options = {}) {
  stickerState.state = state || null;
  stickerState.mounted = true;
  stickerState.manageMode = false;
  stickerState.searchOpen = false;
  stickerState.searchValue = '';
  stickerState.refresh = typeof options.onRefresh === 'function' ? options.onRefresh : null;

  injectStyle();
  closeStickerModal();

  if (getRelationshipLockLevel(state)) {
    const refresh = stickerState.refresh;
    resetStickerState();

    openRelationshipLockSheet(state, {
      onRefresh: refresh
    });
    return;
  }

  const sheet = await createStickerSheet();
  stickerState.sheetEl = sheet;
  showBottomSheet(sheet);
}

export function closeStickerSheet() {
  if (stickerState.sheetEl && document.body.contains(stickerState.sheetEl)) {
    hideBottomSheet();
  }

  resetStickerState();
}

export function closeStickerModal() {
  if (stickerState.modalEl) {
    stickerState.modalEl.remove();
    stickerState.modalEl = null;
  }

  const old = document.getElementById(STICKER_MODAL_ID);
  if (old) old.remove();
}

function resetStickerState() {
  stickerState.mounted = false;
  stickerState.sheetEl = null;
  stickerState.state = null;
  stickerState.items = [];
  stickerState.searchOpen = false;
  stickerState.searchValue = '';
  stickerState.manageMode = false;
  stickerState.refresh = null;
  closeStickerModal();
}

// ═══════════════════════════════════════
// 【面板渲染】生成表情包底部抽屉
// ═══════════════════════════════════════

async function createStickerSheet(forceRecent = false) {
  const sheet = el('div', 'chat-sticker-panel');
  sheet.dataset.manage = stickerState.manageMode ? 'true' : 'false';

  sheet.append(
    createStickerToolbar(),
    await createStickerGrid(forceRecent)
  );

  return sheet;
}

function createStickerToolbar() {
  const toolbar = el('section', 'chat-sticker-toolbar');

  const search = toolbarButton('search', '搜索');
  search.classList.toggle('is-active', stickerState.searchOpen);
  search.addEventListener('click', async () => {
    stickerState.searchOpen = !stickerState.searchOpen;

    if (!stickerState.searchOpen) {
      stickerState.searchValue = '';
    }

    await refreshStickerSheet();
  });

  const recent = toolbarButton('clock', '最近');
  recent.addEventListener('click', async () => {
    stickerState.searchValue = '';
    await refreshStickerSheet(true);
  });

  const manage = toolbarButton('trash', stickerState.manageMode ? '完成' : '删除');
  manage.classList.toggle('is-active', stickerState.manageMode);
  manage.addEventListener('click', async () => {
    stickerState.manageMode = !stickerState.manageMode;
    await refreshStickerSheet();
  });

  const add = toolbarButton('add', '添加');
  add.addEventListener('click', () => openStickerAddChoiceModal());

  toolbar.append(search, recent, manage, add);

  if (stickerState.searchOpen) {
    toolbar.appendChild(createSearchInputWrap());
  }

  return toolbar;
}

async function createStickerGrid(forceRecent = false) {
  const wrap = el('section', 'chat-sticker-grid-wrap');
  const grid = el('div', 'chat-sticker-grid');

  const addCell = el('button', 'chat-sticker-cell add');
  addCell.type = 'button';
  addCell.setAttribute('aria-label', '添加表情包');
  addCell.appendChild(createIcon('add', 18));
  addCell.addEventListener('click', () => openStickerAddChoiceModal());
  grid.appendChild(addCell);

  const stickers = await loadStickerItems(forceRecent);

  if (!stickers.length) {
    const empty = el('section', 'chat-sticker-empty-inline');
    empty.append(
      el('div', 'chat-sticker-empty-title', '还没有表情包'),
      el('div', 'chat-sticker-empty-desc', '先放一张进来吧，TA 会记住它的意思。')
    );
    grid.appendChild(empty);
  } else {
    stickers.forEach((sticker) => {
      grid.appendChild(createStickerCell(sticker));
    });
  }

  wrap.appendChild(grid);
  return wrap;
}

async function refreshStickerSheet(forceRecent = false) {
  const current = stickerState.sheetEl;
  if (!current) return;

  const next = await createStickerSheet(forceRecent);
  current.dataset.manage = next.dataset.manage;
  current.replaceChildren(...Array.from(next.childNodes));
}

async function refreshStickerGrid(forceRecent = false) {
  const current = stickerState.sheetEl;
  if (!current) return;

  const old = current.querySelector('.chat-sticker-grid-wrap');
  if (!old) {
    await refreshStickerSheet(forceRecent);
    return;
  }

  const next = await createStickerGrid(forceRecent);
  old.replaceWith(next);
  current.dataset.manage = stickerState.manageMode ? 'true' : 'false';
}

// ═══════════════════════════════════════
// 【搜索功能】搜索表情包描述和名称
// ═══════════════════════════════════════

function createSearchInputWrap() {
  const wrap = el('div', 'chat-sticker-search-wrap');

  const input = document.createElement('input');
  input.className = 'chat-sticker-search-input';
  input.type = 'text';
  input.placeholder = '搜描述，比如：委屈、撒娇、生气';
  input.value = stickerState.searchValue || '';
  input.autocomplete = 'off';
  input.setAttribute('spellcheck', 'false');

  input.addEventListener('input', async () => {
    stickerState.searchValue = input.value.trim();
    await refreshStickerGrid();
  });

  wrap.appendChild(input);

  requestAnimationFrame(() => {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  return wrap;
}

// ═══════════════════════════════════════
// 【表情包数据】读取、筛选和排序
// ═══════════════════════════════════════

async function loadStickerItems(forceRecent = false) {
  const q = String(stickerState.searchValue || '').trim().toLowerCase();
  const list = await getAllDB('stickers').catch(() => []);

  let stickers = normalizeArray(list)
    .filter((item) => item?.id && (item.imageBase64 || item.image || item.dataUrl || item.description || item.name));

  if (q) {
    stickers = stickers.filter((item) => {
      return [
        item.name,
        item.description,
        item.desc,
        item.tags
      ].some((value) => String(value || '').toLowerCase().includes(q));
    });
  }

  stickers.sort((a, b) => {
    if (forceRecent || !q) {
      const au = String(a.usedAt || '');
      const bu = String(b.usedAt || '');
      if (au || bu) return bu.localeCompare(au);
    }

    return String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || ''));
  });

  stickerState.items = stickers;
  return stickers;
}

// ═══════════════════════════════════════
// 【表情包卡片】创建单个表情包按钮
// ═══════════════════════════════════════

function createStickerCell(sticker) {
  const button = el('button', 'chat-sticker-cell');
  button.type = 'button';
  button.dataset.id = sticker.id || '';

  const image = String(sticker.imageBase64 || sticker.image || sticker.dataUrl || '').trim();
  const desc = String(sticker.description || sticker.desc || sticker.name || '').trim();

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.alt = desc || '';
    button.appendChild(img);
  } else {
    button.appendChild(el('span', 'chat-sticker-cell-letter', getInitial(desc || '表情')));
  }

  const remove = el('span', 'chat-sticker-remove-mark');
  remove.appendChild(createIcon('close', 12));
  button.appendChild(remove);

  button.addEventListener('click', async () => {
    if (stickerState.manageMode) {
      await deleteSticker(sticker);
      return;
    }

    await sendSticker(sticker);
  });

  return button;
}

// ═══════════════════════════════════════
// 【发送表情包】写入聊天消息并刷新
// ═══════════════════════════════════════

async function sendSticker(sticker) {
  const state = stickerState.state;

  if (!state || !sticker?.id) return;

  if (getRelationshipLockLevel(state)) {
    hideBottomSheet();
    openRelationshipLockSheet(state, {
      onRefresh: stickerState.refresh
    });
    return;
  }

  const image = String(sticker.imageBase64 || sticker.image || sticker.dataUrl || '').trim();
  const description = String(sticker.description || sticker.desc || '').trim();
  const content = description || sticker.name || '[表情包]';

  if (!image && !description && !sticker.name) {
    showToast('这个表情包不见了');
    return;
  }

  try {
    const now = getNow();

    await setDB('stickers', {
      ...sticker,
      usedAt: now,
      updatedAt: now
    });

    hideBottomSheet();
    stickerState.sheetEl = null;

    await sendStickerMessage(state, sticker.id, {
      content,
      stickerImageBase64: image,
      stickerDescription: description,
      triggerAI: true
    });

    await refreshAfterChange();
  } catch (error) {
    console.error('[chat-thread-stickers] send sticker failed', error);
    showToast('表情包没发出去');
  }
}

async function refreshAfterChange() {
  if (typeof stickerState.refresh === 'function') {
    await stickerState.refresh();
    return;
  }

  if (typeof stickerState.state?.reloadAndRender === 'function') {
    await stickerState.state.reloadAndRender();
  }
}

// ═══════════════════════════════════════
// 【删除表情包】删除本地表情包数据
// ═══════════════════════════════════════

async function deleteSticker(sticker) {
  if (!sticker?.id) return;

  await deleteDB('stickers', sticker.id);
  showToast('已经拿掉啦');
  await refreshStickerSheet();
}

// ═══════════════════════════════════════
// 【添加入口】选择单张添加或批量添加
// ═══════════════════════════════════════

function openStickerAddChoiceModal() {
  closeStickerModal();

  const overlay = createStickerModalOverlay();
  const card = el('section', 'chat-sticker-center-card small');
  const head = createStickerModalHead('添加表情包', '可以放一张，也可以一次多选几张。');

  const single = el('button', 'chat-sticker-modal-option');
  single.type = 'button';
  single.append(createIcon('image', 18), el('span', '', '添加一张'));
  single.addEventListener('click', () => openStickerSingleAddModal());

  const batch = el('button', 'chat-sticker-modal-option');
  batch.type = 'button';
  batch.append(createIcon('add', 18), el('span', '', '批量添加'));
  batch.addEventListener('click', () => pickStickerBatchFiles());

  const cancel = el('button', 'chat-sticker-modal-btn ghost', '取消');
  cancel.type = 'button';
  cancel.addEventListener('click', closeStickerModal);

  card.append(head, single, batch, cancel);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  stickerState.modalEl = overlay;
}

// ═══════════════════════════════════════
// 【单张添加】上传一张图片并保存描述
// ═══════════════════════════════════════

function openStickerSingleAddModal() {
  closeStickerModal();

  const overlay = createStickerModalOverlay();
  const card = el('section', 'chat-sticker-center-card');
  const head = createStickerModalHead('添加表情包', '选一张图，再写一句给 TA 理解的描述。');

  const preview = el('button', 'chat-sticker-modal-preview empty');
  preview.type = 'button';
  preview.textContent = '选择图片';

  const pick = el('button', 'chat-sticker-modal-pick');
  pick.type = 'button';
  pick.append(createIcon('image', 18), el('span', '', '选择图片'));

  const textarea = document.createElement('textarea');
  textarea.className = 'chat-sticker-modal-textarea compact';
  textarea.rows = 3;
  textarea.placeholder = '比如：一只小猫委屈地看着你，好像想被哄。';
  textarea.autocomplete = 'off';
  textarea.setAttribute('spellcheck', 'false');

  let imageBase64 = '';

  const choose = () => {
    pickOneStickerImage(async (dataUrl) => {
      imageBase64 = dataUrl;
      preview.classList.remove('empty');
      preview.replaceChildren();

      const img = document.createElement('img');
      img.src = imageBase64;
      img.alt = '';
      preview.appendChild(img);
    });
  };

  preview.addEventListener('click', choose);
  pick.addEventListener('click', choose);

  const actions = el('div', 'chat-sticker-modal-actions');

  const cancel = el('button', 'chat-sticker-modal-btn ghost', '取消');
  cancel.type = 'button';
  cancel.addEventListener('click', closeStickerModal);

  const save = el('button', 'chat-sticker-modal-btn primary', '保存');
  save.type = 'button';
  save.addEventListener('click', async () => {
    const description = textarea.value.trim();

    if (!imageBase64) {
      showToast('先选一张图片');
      return;
    }

    if (!description) {
      showToast('写一句描述，TA 才能理解');
      return;
    }

    await saveStickerRecord({
      imageBase64,
      description,
      name: description.slice(0, 16)
    });

    closeStickerModal();
    showToast('表情包收好啦');
    await refreshStickerSheet();
  });

  actions.append(cancel, save);
  card.append(head, preview, pick, textarea, actions);
  overlay.appendChild(card);

  document.body.appendChild(overlay);
  stickerState.modalEl = overlay;
  requestAnimationFrame(() => textarea.focus());
}

function pickOneStickerImage(onPicked) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > MAX_STICKER_IMAGE_SIZE) {
      showToast('这张有点大，换一张小一点的吧');
      return;
    }

    const imageBase64 = await readFileAsDataURL(file);
    await onPicked?.(imageBase64, file);
  }, { once: true });

  input.click();
}

// ═══════════════════════════════════════
// 【批量添加】多选图片后逐张填写描述
// ═══════════════════════════════════════

function pickStickerBatchFiles() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;

  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);

    if (!files.length) return;

    const items = [];
    const skipped = [];

    for (const file of files) {
      if (file.size > MAX_STICKER_IMAGE_SIZE) {
        skipped.push(file.name || `第 ${skipped.length + 1} 张`);
        continue;
      }

      const imageBase64 = await readFileAsDataURL(file);
      items.push({
        imageBase64,
        description: '',
        name: file.name || ''
      });
    }

    if (skipped.length) {
      showToast(`有 ${skipped.length} 张太大，先跳过了`);
    }

    if (!items.length) {
      showToast('没有能添加的图片');
      return;
    }

    openStickerBatchDescribeModal(items, 0);
  }, { once: true });

  input.click();
}

function openStickerBatchDescribeModal(items, index = 0) {
  const list = normalizeArray(items).filter((item) => item?.imageBase64);

  if (!list.length) {
    showToast('没有可以添加的图片');
    return;
  }

  closeStickerModal();

  const current = list[index];
  const overlay = createStickerModalOverlay();
  const card = el('section', 'chat-sticker-center-card');

  const head = createStickerModalHead(
    `描述第 ${index + 1} / ${list.length} 张`,
    '写一句描述，聊天里只显示图片，TA 会读到描述。'
  );

  const preview = el('div', 'chat-sticker-modal-preview');
  const img = document.createElement('img');
  img.src = current.imageBase64;
  img.alt = '';
  preview.appendChild(img);

  const textarea = document.createElement('textarea');
  textarea.className = 'chat-sticker-modal-textarea compact';
  textarea.rows = 3;
  textarea.placeholder = '比如：一只小猫委屈地看着你，好像想被哄。';
  textarea.value = current.description || '';
  textarea.autocomplete = 'off';
  textarea.setAttribute('spellcheck', 'false');

  const actions = el('div', 'chat-sticker-modal-actions');

  const skip = el('button', 'chat-sticker-modal-btn ghost', index + 1 >= list.length ? '取消' : '跳过');
  skip.type = 'button';
  skip.addEventListener('click', () => {
    if (index + 1 >= list.length) {
      closeStickerModal();
      return;
    }

    openStickerBatchDescribeModal(list, index + 1);
  });

  const save = el('button', 'chat-sticker-modal-btn primary', index + 1 >= list.length ? '保存完成' : '保存下一张');
  save.type = 'button';
  save.addEventListener('click', async () => {
    const description = textarea.value.trim();

    if (!description) {
      showToast('写一句描述，TA 才能理解');
      return;
    }

    await saveStickerRecord({
      imageBase64: current.imageBase64,
      description,
      name: description.slice(0, 16)
    });

    if (index + 1 >= list.length) {
      closeStickerModal();
      showToast('表情包都收好啦');
      await refreshStickerSheet();
      return;
    }

    openStickerBatchDescribeModal(list, index + 1);
  });

  actions.append(skip, save);
  card.append(head, preview, textarea, actions);
  overlay.appendChild(card);

  document.body.appendChild(overlay);
  stickerState.modalEl = overlay;
  requestAnimationFrame(() => textarea.focus());
}

async function saveStickerRecord({ imageBase64, description, name }) {
  const now = getNow();
  const cleanDesc = String(description || '').trim();

  const sticker = {
    id: generateId('sticker'),
    name: String(name || cleanDesc || '表情包').slice(0, 16),
    description: cleanDesc,
    imageBase64: String(imageBase64 || '').trim(),
    createdAt: now,
    updatedAt: now
  };

  await setDB('stickers', sticker);
  return sticker;
}

// ═══════════════════════════════════════
// 【公共组件】弹窗、按钮、读取文件和 DOM
// ═══════════════════════════════════════

function createStickerModalOverlay() {
  closeStickerModal();

  const overlay = el('div', 'chat-sticker-center-overlay');
  overlay.id = STICKER_MODAL_ID;

  overlay.addEventListener('pointerdown', (event) => {
    if (event.target === overlay) {
      closeStickerModal();
    }
  });

  overlay.addEventListener('touchmove', (event) => {
    event.stopPropagation();
  }, { passive: true });

  return overlay;
}

function createStickerModalHead(title, subtitle) {
  const head = el('div', 'chat-sticker-modal-head');
  head.append(
    el('div', 'chat-sticker-modal-title', title || ''),
    el('div', 'chat-sticker-modal-subtitle', subtitle || '')
  );
  return head;
}

function toolbarButton(iconName, label) {
  const button = el('button', 'chat-sticker-tool-btn');
  button.type = 'button';
  button.setAttribute('aria-label', label || iconName);
  button.append(createIcon(iconName, 18), el('span', '', label || ''));
  return button;
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function normalizeArray(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function getInitial(name) {
  const text = String(name || '').trim();
  return text ? text.slice(0, 1).toUpperCase() : 'A';
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// ═══════════════════════════════════════
// 【样式】表情包抽屉、上传弹窗和滚动区域
// ═══════════════════════════════════════

function injectStyle() {
  if (document.getElementById(STICKER_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STICKER_STYLE_ID;
  style.textContent = `
    .chat-sticker-panel{
      min-height:min(58vh,460px);
      max-height:min(72vh,620px);
      display:flex;
      flex-direction:column;
      gap:12px;
      padding:6px 20px 20px;
      color:var(--text-primary);
      touch-action:pan-y;
    }

    .chat-sticker-toolbar{
      flex:0 0 auto;
      display:grid;
      grid-template-columns:repeat(4,minmax(0,1fr));
      gap:8px;
    }

    .chat-sticker-tool-btn{
      min-height:42px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:6px;
      border-radius:18px;
      background:var(--bg-card);
      color:var(--text-secondary);
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:12px;
      transition:all 200ms ease;
      touch-action:manipulation;
    }

    .chat-sticker-tool-btn.is-active,
    .chat-sticker-tool-btn:active{
      color:var(--accent);
      transform:scale(.96);
    }

    .chat-sticker-search-wrap{
      grid-column:1/-1;
      animation:chatStickerPanelIn 200ms ease both;
    }

    .chat-sticker-search-input{
      width:100%;
      min-height:42px;
      padding:0 13px;
      border-radius:18px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font-size:16px;
      line-height:1.5;
    }

    .chat-sticker-grid-wrap{
      flex:1 1 auto;
      min-height:0;
      overflow-y:auto;
      overflow-x:hidden;
      -webkit-overflow-scrolling:touch;
      overscroll-behavior:contain;
      touch-action:pan-y;
      animation:chatStickerPanelIn 220ms ease both;
    }

    .chat-sticker-grid{
      display:grid;
      grid-template-columns:repeat(5,minmax(0,1fr));
      gap:14px 10px;
      align-content:start;
      padding:4px 0 14px;
    }

    .chat-sticker-cell{
      position:relative;
      aspect-ratio:1;
      min-width:0;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:4px;
      border-radius:18px;
      background:transparent;
      color:var(--text-primary);
      font:inherit;
      transition:all 200ms ease;
      touch-action:manipulation;
    }

    .chat-sticker-cell:active{
      transform:scale(.92);
      background:var(--surface-muted);
    }

    .chat-sticker-cell.add{
      background:var(--bg-card);
      color:var(--accent);
      box-shadow:var(--shadow-sm);
    }

    .chat-sticker-cell img{
      width:100%;
      height:100%;
      object-fit:contain;
      display:block;
      border-radius:14px;
    }

    .chat-sticker-cell-letter{
      width:100%;
      height:100%;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      border-radius:14px;
      background:var(--bg-card);
      color:var(--text-secondary);
      box-shadow:var(--shadow-sm);
      font-size:14px;
      font-weight:600;
    }

    .chat-sticker-remove-mark{
      position:absolute;
      top:-4px;
      right:-4px;
      width:22px;
      height:22px;
      display:none;
      align-items:center;
      justify-content:center;
      border-radius:999px;
      background:var(--accent);
      color:var(--bubble-user-text);
      box-shadow:var(--shadow-sm);
      z-index:2;
    }

    .chat-sticker-panel[data-manage="true"] .chat-sticker-cell:not(.add) .chat-sticker-remove-mark{
      display:inline-flex;
    }

    .chat-sticker-panel[data-manage="true"] .chat-sticker-cell:not(.add){
      background:var(--surface-muted);
    }

    .chat-sticker-empty-inline{
      grid-column:2/-1;
      min-height:86px;
      display:flex;
      flex-direction:column;
      justify-content:center;
      padding:12px 14px;
      border-radius:20px;
      background:var(--bg-card);
      box-shadow:var(--shadow-sm);
    }

    .chat-sticker-empty-title{
      color:var(--text-primary);
      font-size:14px;
      font-weight:600;
      line-height:1.35;
    }

    .chat-sticker-empty-desc{
      margin-top:4px;
      color:var(--text-secondary);
      font-size:12px;
      line-height:1.5;
    }

    .chat-sticker-center-overlay{
      position:fixed;
      inset:0;
      z-index:2147483000;
      display:flex;
      align-items:center;
      justify-content:center;
      padding:22px;
      background:var(--bg-overlay);
      animation:chatStickerModalIn 180ms ease both;
    }

    .chat-sticker-center-card{
      width:min(100%,390px);
      max-height:min(78vh,620px);
      display:flex;
      flex-direction:column;
      gap:12px;
      overflow-y:auto;
      padding:20px;
      border-radius:28px;
      background:var(--bg-card);
      color:var(--text-primary);
      box-shadow:var(--shadow-lg);
      overscroll-behavior:contain;
    }

    .chat-sticker-center-card.small{
      width:min(100%,340px);
    }

    .chat-sticker-modal-head{
      display:flex;
      flex-direction:column;
      gap:5px;
    }

    .chat-sticker-modal-title{
      color:var(--text-primary);
      font-size:17px;
      font-weight:600;
      line-height:1.35;
    }

    .chat-sticker-modal-subtitle{
      color:var(--text-secondary);
      font-size:13px;
      line-height:1.55;
    }

    .chat-sticker-modal-preview{
      width:88px;
      height:88px;
      align-self:center;
      display:flex;
      align-items:center;
      justify-content:center;
      overflow:hidden;
      border-radius:22px;
      background:var(--surface-muted);
      color:var(--text-secondary);
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:13px;
      line-height:1.4;
      text-align:center;
    }

    .chat-sticker-modal-preview.empty{
      padding:10px;
    }

    .chat-sticker-modal-preview img{
      width:100%;
      height:100%;
      object-fit:contain;
    }

    .chat-sticker-modal-pick,
    .chat-sticker-modal-option{
      min-height:44px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:8px;
      border-radius:18px;
      background:var(--surface-muted);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:14px;
      transition:all 200ms ease;
    }

    .chat-sticker-modal-option{
      justify-content:flex-start;
      padding:0 14px;
    }

    .chat-sticker-modal-pick:active,
    .chat-sticker-modal-option:active,
    .chat-sticker-modal-btn:active{
      transform:scale(.96);
    }

    .chat-sticker-modal-textarea{
      width:100%;
      min-height:116px;
      padding:11px 13px;
      border-radius:18px;
      background:var(--surface-muted);
      color:var(--text-primary);
      box-shadow:var(--shadow-sm);
      font-size:16px;
      line-height:1.6;
      resize:none;
    }

    .chat-sticker-modal-textarea.compact{
      min-height:86px;
    }

    .chat-sticker-modal-actions{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:10px;
    }

    .chat-sticker-modal-btn{
      min-height:44px;
      border-radius:18px;
      box-shadow:var(--shadow-sm);
      font:inherit;
      font-size:14px;
      transition:all 200ms ease;
    }

    .chat-sticker-modal-btn.primary{
      background:var(--accent);
      color:var(--bubble-user-text);
    }

    .chat-sticker-modal-btn.ghost{
      background:var(--surface-muted);
      color:var(--text-secondary);
    }

    @keyframes chatStickerPanelIn{
      from{
        opacity:0;
        transform:translateY(8px);
      }

      to{
        opacity:1;
        transform:translateY(0);
      }
    }

    @keyframes chatStickerModalIn{
      from{
        opacity:0;
      }

      to{
        opacity:1;
      }
    }

    @media(max-width:430px){
      .chat-sticker-panel{
        min-height:min(62vh,500px);
        max-height:min(74vh,620px);
        padding-left:18px;
        padding-right:18px;
      }

      .chat-sticker-toolbar{
        gap:7px;
      }

      .chat-sticker-tool-btn{
        min-height:40px;
        gap:4px;
        font-size:11px;
        border-radius:16px;
      }

      .chat-sticker-grid{
        gap:12px 8px;
      }

      .chat-sticker-cell{
        border-radius:16px;
      }

      .chat-sticker-center-card{
        padding:18px;
        border-radius:26px;
      }

      .chat-sticker-modal-actions{
        grid-template-columns:1fr;
      }
    }

    @media(prefers-reduced-motion:reduce){
      .chat-sticker-tool-btn,
      .chat-sticker-cell,
      .chat-sticker-modal-pick,
      .chat-sticker-modal-option,
      .chat-sticker-modal-btn,
      .chat-sticker-search-wrap,
      .chat-sticker-grid-wrap,
      .chat-sticker-center-overlay{
        animation:none;
        transition:none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/storage.js(getAllDB,setDB,deleteDB,generateId,getNow)；../../core/ui.js(createIcon,showBottomSheet,hideBottomSheet,showToast)；./thread-actions.js(sendStickerMessage)；./thread-relationship.js(getRelationshipLockLevel,openRelationshipLockSheet)
