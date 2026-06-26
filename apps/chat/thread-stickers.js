// apps/chat/thread-stickers.js
// imports:
//   from '../../core/storage.js': getData, setData, getAllDB, setDB, deleteDB, generateId, getNow
//   from '../../core/ui.js': showToast, showBottomSheet, hideBottomSheet
//   from './thread-actions.js': sendStickerMessage

import { getData, setData, getAllDB, setDB, deleteDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showBottomSheet, hideBottomSheet } from '../../core/ui.js';
import { sendStickerMessage } from './thread-actions.js';

// ═══════════════════════════════════════
// 【常量】
// ═══════════════════════════════════════

const MAX_FILE_SIZE = 280 * 1024;
const RECENT_KEY = 'sticker_recent_ids';
const MAX_RECENT = 30;
const STYLE_ID = 'thread-stickers-style';

// ═══════════════════════════════════════
// 【内部状态】
// ═══════════════════════════════════════

let activeState = null;
let activeOptions = null;
let currentTab = 'all';
let deleteMode = false;
let selectedIds = new Set();
let allStickers = [];

// ═══════════════════════════════════════
// 【公开接口】打开和关闭
// ═══════════════════════════════════════

export function openStickerSheet(state, options = {}) {
  activeState = state;
  activeOptions = options;
  currentTab = 'all';
  deleteMode = false;
  selectedIds = new Set();
  renderPicker(true);
}

export function closeStickerSheet() {
  hideBottomSheet();
  resetState();
}

function resetState() {
  activeState = null;
  activeOptions = null;
  currentTab = 'all';
  deleteMode = false;
  selectedIds = new Set();
  allStickers = [];
}

// ═══════════════════════════════════════
// 【主渲染】构建整个抽屉
// ═══════════════════════════════════════

async function renderPicker(isNew = false) {
  ensureStyle();
  allStickers = await loadStickers();

  if (!isNew) {
    syncTabButtons();
    const area = document.querySelector('.ss-grid-area');
    if (area) renderGridContent(area);
    renderDeleteBar();
    return;
  }

  const sheet = el('div', 'ss-sheet');

  sheet.appendChild(createSearchBar());
  sheet.appendChild(createActionBar());
  sheet.appendChild(createGridArea());
  showBottomSheet(sheet);

  renderDeleteBar();
}

// ═══════════════════════════════════════
// 【搜索栏】
// ═══════════════════════════════════════

function createSearchBar() {
  const wrap = el('div', 'ss-search');
  wrap.appendChild(createSearchIcon());

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'ss-search-input';
  input.placeholder = '搜索表情包';
  input.autocomplete = 'off';
  input.spellcheck = false;

  input.addEventListener('input', () => {
    const area = document.querySelector('.ss-grid-area');
    if (area) renderGridContent(area);
  });

  wrap.appendChild(input);
  return wrap;
}

function createSearchIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '15');
  svg.setAttribute('height', '15');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  c.setAttribute('cx', '11');
  c.setAttribute('cy', '11');
  c.setAttribute('r', '6');

  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M15.5 15.5L20 20');

  svg.append(c, p);
  return svg;
}

// ═══════════════════════════════════════
// 【操作栏】最近 / 删除 / 批量添加
// ═══════════════════════════════════════

function createActionBar() {
  const bar = el('div', 'ss-action-bar');

  const recentBtn = el('button', `ss-tab-btn ${currentTab === 'recent' ? 'is-active' : ''}`, '最近');
  recentBtn.type = 'button';
  recentBtn.addEventListener('click', () => {
    currentTab = currentTab === 'recent' ? 'all' : 'recent';
    deleteMode = false;
    selectedIds = new Set();
    renderPicker(false);
  });

  const deleteBtn = el('button', `ss-tab-btn ${deleteMode ? 'is-active' : ''}`, '删除');
  deleteBtn.type = 'button';
  deleteBtn.addEventListener('click', () => {
    currentTab = 'all';
    deleteMode = !deleteMode;
    selectedIds = new Set();
    renderPicker(false);
  });

  const bulkBtn = el('button', 'ss-tab-btn', '批量添加');
  bulkBtn.type = 'button';
  bulkBtn.addEventListener('click', () => openBulkPicker());

  bar.append(recentBtn, deleteBtn, bulkBtn);
  return bar;
}

function syncTabButtons() {
  const btns = document.querySelectorAll('.ss-sheet .ss-tab-btn');
  if (btns[0]) btns[0].classList.toggle('is-active', currentTab === 'recent');
  if (btns[1]) btns[1].classList.toggle('is-active', deleteMode);
}

// ═══════════════════════════════════════
// 【网格区域】5列 + 首格+号 + 上下滑动
// ═══════════════════════════════════════

function createGridArea() {
  const area = el('div', 'ss-grid-area');
  area.id = 'ss-grid-area';
  renderGridContent(area);
  return area;
}

function renderGridContent(area) {
  if (!area) return;
  area.replaceChildren();

  const filtered = getFilteredStickers();

  if (!allStickers.length) {
    area.appendChild(createEmptyState());
    return;
  }

  area.appendChild(createAddCell());

  filtered.forEach((sticker) => {
    area.appendChild(createStickerCell(sticker));
  });

  if (!filtered.length && allStickers.length) {
    const hint = el('div', 'ss-grid-hint', '没有找到匹配的表情包');
    area.appendChild(hint);
  }
}

// ───────────────────
// +号添加格
// ───────────────────

function createAddCell() {
  const cell = el('button', 'ss-cell ss-cell-add');
  cell.type = 'button';
  cell.setAttribute('aria-label', '添加表情包');

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '22');
  icon.setAttribute('height', '22');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.5');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  icon.setAttribute('aria-hidden', 'true');

  const p1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p1.setAttribute('d', 'M12 5v14');
  const p2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p2.setAttribute('d', 'M5 12h14');
  icon.append(p1, p2);

  cell.appendChild(icon);

  cell.addEventListener('click', (event) => {
    event.stopPropagation();
    openSinglePicker();
  });

  return cell;
}

// ───────────────────
// 单个表情包格
// ───────────────────

function createStickerCell(sticker) {
  const cell = el('div', 'ss-cell');

  const img = document.createElement('img');
  img.src = sticker.imageBase64 || '';
  img.alt = sticker.description || '';
  img.className = 'ss-cell-img';
  img.loading = 'lazy';
  img.addEventListener('error', () => {
    img.style.display = 'none';
    cell.classList.add('is-broken');
  });
  cell.appendChild(img);

  if (deleteMode) {
    cell.classList.add('is-deletable');
    const isChecked = selectedIds.has(sticker.id);
    if (isChecked) cell.classList.add('is-selected');

    const check = el('div', `ss-cell-check ${isChecked ? 'is-checked' : ''}`);
    check.appendChild(createCheckIcon());
    cell.appendChild(check);

    cell.appendChild(el('div', 'ss-cell-overlay'));

    cell.addEventListener('click', (event) => {
      event.stopPropagation();
      if (selectedIds.has(sticker.id)) {
        selectedIds.delete(sticker.id);
      } else {
        selectedIds.add(sticker.id);
      }
      renderPicker(false);
    });
  } else {
    cell.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!activeState) return;

      trackRecent(sticker.id);
      hideBottomSheet();
      await sendStickerMessage(activeState, sticker.id);
      activeOptions?.onRefresh?.();
      resetState();
    });
  }

  return cell;
}

function createCheckIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '12');
  svg.setAttribute('height', '12');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'M5 12.5l4 4L19 6.5');
  svg.appendChild(p);
  return svg;
}

// ───────────────────
// 空状态
// ───────────────────

function createEmptyState() {
  const wrap = el('div', 'ss-empty');
  wrap.append(
    el('div', 'ss-empty-title', '还没有表情包'),
    el('div', 'ss-empty-hint', '点上面 + 号上传一个吧')
  );
  return wrap;
}

// ═══════════════════════════════════════
// 【删除底栏】显示已选数量和删除按钮
// ═══════════════════════════════════════

function renderDeleteBar() {
  const sheet = document.querySelector('.ss-sheet');
  if (!sheet) return;

  const old = sheet.querySelector('.ss-delete-bar');
  if (old) old.remove();

  if (!deleteMode) return;

  const bar = el('div', 'ss-delete-bar');
  const count = selectedIds.size;

  const delBtn = el('button', `ss-delete-btn ${count ? '' : 'is-disabled'}`, `删除${count ? ` (${count})` : ''}`);
  delBtn.type = 'button';
  delBtn.disabled = !count;

  delBtn.addEventListener('click', async () => {
    if (!selectedIds.size) return;

    const ok = await showConfirm(`确定删除 ${selectedIds.size} 个表情包？`);
    if (!ok) return;

    for (const id of selectedIds) {
      await deleteDB('stickers', id).catch(() => {});
    }

    const recent = getRecentIds().filter((id) => !selectedIds.has(id));
    setData(RECENT_KEY, recent);

    showToast(`删掉 ${selectedIds.size} 个表情包`);
    selectedIds = new Set();
    allStickers = await loadStickers();
    renderPicker(true);
  });

  bar.appendChild(delBtn);
  sheet.appendChild(bar);
}

// ═══════════════════════════════════════
// 【单张上传】选图 → 描述 → 保存
// ═══════════════════════════════════════

function openSinglePicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif,image/webp';

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      showToast('图片太大了，请换一张小一点的');
      return;
    }

    try {
      const base64 = await readFileAsBase64(file);
      showUploadSheet(base64);
    } catch (_) {
      showToast('图片读取失败，换一张试试');
    }
  });

  input.click();
}

function showUploadSheet(base64) {
  const sheet = el('div', 'ss-upload-sheet');

  const head = el('div', 'ss-upload-head');

  const backBtn = el('button', 'ss-upload-back');
  backBtn.type = 'button';
  backBtn.appendChild(createBackIcon());
  backBtn.addEventListener('click', () => renderPicker(true));

  head.append(backBtn, el('div', 'ss-upload-title', '添加表情包'));
  sheet.appendChild(head);

  const preview = el('div', 'ss-upload-preview');
  const img = document.createElement('img');
  img.src = base64;
  img.alt = '';
  preview.appendChild(img);
  sheet.appendChild(preview);

  const desc = document.createElement('input');
  desc.type = 'text';
  desc.className = 'ss-upload-desc';
  desc.placeholder = '描述一下，AI 会看懂它';
  desc.maxLength = 120;
  desc.autocomplete = 'off';
  sheet.appendChild(desc);

  const saveBtn = el('button', 'ss-upload-save', '保存');
  saveBtn.type = 'button';
  saveBtn.addEventListener('click', async () => {
    const now = getNow();
    await setDB('stickers', {
      id: generateId('sticker'),
      imageBase64: base64,
      description: desc.value.trim() || '',
      name: desc.value.trim() || '表情包',
      createdAt: now,
      updatedAt: now
    });

    showToast('表情包上传好啦');
    allStickers = await loadStickers();
    renderPicker(true);
  });

  sheet.appendChild(saveBtn);
  showBottomSheet(sheet);
  requestAnimationFrame(() => desc.focus());
}

function createBackIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '16');
  svg.setAttribute('height', '16');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');

  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', 'm15 18-6-6 6-6');
  svg.appendChild(p);
  return svg;
}

// ═══════════════════════════════════════
// 【批量上传】多选图片一次性保存
// ═══════════════════════════════════════

function openBulkPicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif,image/webp';
  input.multiple = true;

  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;

    const valid = files.filter((f) => f.size <= MAX_FILE_SIZE);
    if (valid.length < files.length) {
      showToast(`${files.length - valid.length} 张图片太大，已跳过`);
    }
    if (!valid.length) return;

    showToast(`正在保存 ${valid.length} 张...`);

    let saved = 0;
    for (const file of valid) {
      try {
        const base64 = await readFileAsBase64(file);
        const now = getNow();
        await setDB('stickers', {
          id: generateId('sticker'),
          imageBase64: base64,
          description: '',
          name: file.name || '表情包',
          createdAt: now,
          updatedAt: now
        });
        saved++;
      } catch (_) {
        // 跳过失败的
      }
    }

    showToast(`保存了 ${saved} 个表情包`);
    allStickers = await loadStickers();
    renderPicker(true);
  });

  input.click();
}

// ═══════════════════════════════════════
// 【最近记录】
// ═══════════════════════════════════════

function getRecentIds() {
  const raw = getData(RECENT_KEY);
  return Array.isArray(raw) ? raw : [];
}

function trackRecent(stickerId) {
  if (!stickerId) return;
  const recent = getRecentIds().filter((id) => id !== stickerId);
  recent.unshift(stickerId);
  setData(RECENT_KEY, recent.slice(0, MAX_RECENT));
}

// ═══════════════════════════════════════
// 【筛选】搜索词 + 最近tab
// ═══════════════════════════════════════

function getFilteredStickers() {
  let list = [...allStickers];

  if (currentTab === 'recent') {
    const recentIds = getRecentIds();
    const map = new Map(list.map((s) => [s.id, s]));
    list = recentIds.map((id) => map.get(id)).filter(Boolean);
  }

  const input = document.querySelector('.ss-sheet .ss-search-input');
  const query = (input?.value || '').trim().toLowerCase();

  if (query) {
    list = list.filter((s) => {
      const text = String(s.description || s.name || '').toLowerCase();
      return text.includes(query);
    });
  }

  return list;
}

// ═══════════════════════════════════════
// 【数据】加载全部表情包
// ═══════════════════════════════════════

async function loadStickers() {
  const list = await getAllDB('stickers').catch(() => []);
  return (Array.isArray(list) ? list.filter(Boolean) : [])
    .sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')));
}

// ═══════════════════════════════════════
// 【文件读取】File → base64
// ═══════════════════════════════════════

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取失败'));
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════
// 【确认弹窗】删除前二次确认
// ═══════════════════════════════════════

function showConfirm(message) {
  return new Promise((resolve) => {
    const backdrop = el('div', 'ss-confirm-backdrop');

    const card = el('div', 'ss-confirm-card');
    card.append(el('div', 'ss-confirm-text', message));

    const actions = el('div', 'ss-confirm-actions');

    const cancel = el('button', 'ss-confirm-cancel', '取消');
    cancel.type = 'button';
    cancel.addEventListener('click', () => {
      backdrop.classList.remove('is-open');
      setTimeout(() => backdrop.remove(), 200);
      resolve(false);
    });

    const ok = el('button', 'ss-confirm-ok', '确定删除');
    ok.type = 'button';
    ok.addEventListener('click', () => {
      backdrop.classList.remove('is-open');
      setTimeout(() => backdrop.remove(), 200);
      resolve(true);
    });

    actions.append(cancel, ok);
    card.appendChild(actions);
    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    requestAnimationFrame(() => backdrop.classList.add('is-open'));
  });
}

// ═══════════════════════════════════════
// 【样式】微信风格表情包抽屉
// ═══════════════════════════════════════

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* ── 主容器 ── */

    .ss-sheet {
      display: flex;
      flex-direction: column;
      gap: 10px;
      height: min(56vh, 420px);
    }

    /* ── 搜索栏 ── */

    .ss-search {
      display: grid;
      grid-template-columns: auto 1fr;
      align-items: center;
      gap: 8px;
      height: 38px;
      padding: 0 12px;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-hint);
      flex-shrink: 0;
    }

    .ss-search-input {
      width: 100%;
      height: 100%;
      border: none;
      background: transparent;
      color: var(--text-primary);
      font: inherit;
      font-size: 14px;
      line-height: 1;
      padding: 0;
      outline: none;
    }

    .ss-search-input::placeholder {
      color: var(--text-hint);
    }

    /* ── 操作栏 ── */

    .ss-action-bar {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }

    .ss-tab-btn {
      height: 30px;
      padding: 0 12px;
      border-radius: var(--radius-full);
      background: var(--surface-muted);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 12px;
      font-weight: 500;
      transition: all 180ms ease;
      white-space: nowrap;
      flex-shrink: 0;
      -webkit-tap-highlight-color: transparent;
    }

    .ss-tab-btn:active {
      transform: scale(0.96);
    }

    .ss-tab-btn.is-active {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    /* ── 网格区域（5列，上下滑动） ── */

    .ss-grid-area {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      overflow-x: hidden;
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 6px;
      align-content: start;
      padding: 2px 0;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }

    /* ── 单个格子 ── */

    .ss-cell {
      aspect-ratio: 1 / 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-md);
      background: var(--bg-surface);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
      cursor: pointer;
      transition: all 160ms ease;
      position: relative;
      -webkit-tap-highlight-color: transparent;
    }

    .ss-cell:active {
      transform: scale(0.93);
    }

    .ss-cell-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: var(--radius-md);
      pointer-events: none;
    }

    .ss-cell.is-broken {
      background: var(--surface-muted);
    }

    .ss-cell.is-broken::after {
      content: '损坏';
      font-size: 10px;
      color: var(--text-hint);
    }

    /* ── + 号添加格（柔和实底） ── */

    .ss-cell-add {
      background: var(--surface-muted);
      box-shadow: none;
      opacity: 0.6;
      transition: all 160ms ease;
    }

    .ss-cell-add:active {
      opacity: 0.85;
      transform: scale(0.93);
    }

    .ss-cell-add svg {
      color: var(--text-secondary);
      pointer-events: none;
    }

    /* ── 删除模式 ── */

    .ss-cell.is-deletable {
      cursor: pointer;
    }

    .ss-cell-overlay {
      position: absolute;
      inset: 0;
      border-radius: var(--radius-md);
      background: transparent;
      pointer-events: none;
      transition: background 160ms ease;
    }

    .ss-cell.is-selected .ss-cell-overlay {
      background: color-mix(in srgb, var(--accent) 12%, transparent);
    }

    .ss-cell-check {
      position: absolute;
      top: 4px;
      left: 4px;
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      color: var(--text-hint);
      z-index: 2;
      opacity: 0.55;
      transition: all 160ms ease;
    }

    .ss-cell-check.is-checked {
      background: var(--accent);
      color: var(--bubble-user-text);
      opacity: 1;
    }

    /* ── 删除底栏 ── */

    .ss-delete-bar {
      display: flex;
      justify-content: center;
      padding-top: 2px;
      flex-shrink: 0;
    }

    .ss-delete-btn {
      min-height: 36px;
      padding: 0 24px;
      border-radius: var(--radius-full);
      background: var(--danger, #e8453c);
      color: #fff;
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      transition: all 160ms ease;
    }

    .ss-delete-btn:active {
      transform: scale(0.96);
    }

    .ss-delete-btn.is-disabled {
      opacity: 0.35;
    }

    /* ── 空状态 ── */

    .ss-empty {
      grid-column: 1 / -1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 40px 0;
    }

    .ss-empty-title {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-secondary);
    }

    .ss-empty-hint {
      font-size: 12px;
      color: var(--text-hint);
    }

    .ss-grid-hint {
      grid-column: 1 / -1;
      text-align: center;
      padding: 32px 0;
      color: var(--text-hint);
      font-size: 13px;
    }

    /* ── 上传页（预览放大、不裁剪） ── */

    .ss-upload-sheet {
      display: flex;
      flex-direction: column;
      gap: 14px;
      min-height: 200px;
    }

    .ss-upload-head {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .ss-upload-back {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-primary);
      padding: 0;
      transition: all 160ms ease;
      flex-shrink: 0;
    }

    .ss-upload-back:active {
      transform: scale(0.92);
    }

    .ss-upload-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .ss-upload-preview {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 8px 0;
    }

    .ss-upload-preview img {
      max-width: 180px;
      max-height: 180px;
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow-card);
      object-fit: contain;
    }

    .ss-upload-desc {
      width: 100%;
      height: 40px;
      padding: 0 12px;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-primary);
      font: inherit;
      font-size: 14px;
      line-height: 40px;
      outline: none;
    }

    .ss-upload-desc::placeholder {
      color: var(--text-hint);
    }

    .ss-upload-save {
      min-height: 40px;
      border-radius: var(--radius-lg);
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      transition: all 160ms ease;
    }

    .ss-upload-save:active {
      transform: scale(0.96);
    }

    /* ── 确认弹窗 ── */

    .ss-confirm-backdrop {
      position: fixed;
      inset: 0;
      z-index: 10030;
      display: flex;
      align-items: center;
      justify-content: center;
      background: color-mix(in srgb, var(--bg-primary) 60%, transparent);
      backdrop-filter: blur(6px);
      opacity: 0;
      pointer-events: none;
      transition: opacity 200ms ease;
      padding: 24px;
    }

    .ss-confirm-backdrop.is-open {
      opacity: 1;
      pointer-events: auto;
    }

    .ss-confirm-card {
      width: min(280px, calc(100vw - 48px));
      padding: 22px 20px 18px;
      border-radius: var(--radius-xl);
      background: var(--bg-card);
      box-shadow: var(--shadow-float);
      transform: scale(0.95) translateY(8px);
      transition: transform 200ms ease;
    }

    .ss-confirm-backdrop.is-open .ss-confirm-card {
      transform: scale(1) translateY(0);
    }

    .ss-confirm-text {
      color: var(--text-primary);
      font-size: 15px;
      line-height: 1.6;
      text-align: center;
      margin-bottom: 20px;
    }

    .ss-confirm-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .ss-confirm-cancel,
    .ss-confirm-ok {
      min-height: 38px;
      border-radius: var(--radius-full);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      transition: all 160ms ease;
    }

    .ss-confirm-cancel {
      background: var(--surface-muted);
      color: var(--text-secondary);
    }

    .ss-confirm-ok {
      background: var(--danger, #e8453c);
      color: #fff;
    }

    .ss-confirm-cancel:active,
    .ss-confirm-ok:active {
      transform: scale(0.96);
    }

    /* ── 响应式 ── */

    @media (max-width: 380px) {
      .ss-grid-area {
        gap: 5px;
      }

      .ss-tab-btn {
        height: 28px;
        padding: 0 10px;
        font-size: 11px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .ss-cell,
      .ss-tab-btn,
      .ss-delete-btn,
      .ss-upload-back,
      .ss-upload-save,
      .ss-confirm-backdrop,
      .ss-confirm-card,
      .ss-confirm-cancel,
      .ss-confirm-ok {
        transition: none;
      }
    }
  `;

  document.head.appendChild(style);
}

// ═══════════════════════════════════════
// 【DOM工具】
// ═══════════════════════════════════════

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// 依赖：../../core/storage.js(getData,setData,getAllDB,setDB,deleteDB,generateId,getNow)；../../core/ui.js(showToast,showBottomSheet,hideBottomSheet)；./thread-actions.js(sendStickerMessage)
