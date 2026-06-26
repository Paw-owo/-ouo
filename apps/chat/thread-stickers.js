// apps/chat/thread-stickers.js
// imports:
//   from '../../core/storage.js': getDB, getAllDB, setDB, deleteDB, generateId, getNow
//   from '../../core/ui.js': showToast, showBottomSheet, hideBottomSheet
//   from './thread-actions.js': sendStickerMessage

import { getAllDB, setDB, deleteDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showBottomSheet, hideBottomSheet } from '../../core/ui.js';
import { sendStickerMessage } from './thread-actions.js';

const MAX_STICKER_SIZE = 280 * 1024; // 280KB 原始文件上限

let activeState = null;
let activeOptions = null;

// ═══════════════════════════════════════
// 【公开接口】打开和关闭表情包抽屉
// ═══════════════════════════════════════

export function openStickerSheet(state, options = {}) {
  activeState = state;
  activeOptions = options;
  showPickerSheet();
}

export function closeStickerSheet() {
  hideBottomSheet();
  activeState = null;
  activeOptions = null;
}

// ═══════════════════════════════════════
// 【选择抽屉】表情包网格 + 底部上传按钮
// ═══════════════════════════════════════

async function showPickerSheet() {
  const state = activeState;
  if (!state) return;

  const stickers = await loadStickers();
  const sheet = el('div', 'sticker-sheet');

  // 标题栏
  const head = el('div', 'sticker-sheet-head');
  head.append(
    el('div', 'sticker-sheet-title', '表情包'),
    el('div', 'sticker-sheet-count', `${stickers.length} 个`)
  );

  // 网格区域
  const grid = el('div', 'sticker-sheet-grid');

  if (!stickers.length) {
    grid.classList.add('is-empty');
    grid.append(
      el('div', 'sticker-empty-icon'),
      el('div', 'sticker-empty-text', '还没有表情包'),
      el('div', 'sticker-empty-hint', '点下面按钮上传一个吧')
    );
  } else {
    stickers.forEach((sticker) => {
      grid.appendChild(createStickerCard(sticker));
    });
  }

  // 底部上传按钮
  const footer = el('div', 'sticker-sheet-footer');
  const uploadBtn = el('button', 'sticker-upload-btn', '上传新表情包');
  uploadBtn.type = 'button';
  uploadBtn.addEventListener('click', () => showUploadSheet());

  footer.append(uploadBtn);
  sheet.append(head, grid, footer);
  showBottomSheet(sheet);
}

// ───────────────────
// 单个表情包卡片
// ───────────────────

function createStickerCard(sticker) {
  const card = el('div', 'sticker-card');

  const img = document.createElement('img');
  img.src = sticker.imageBase64 || '';
  img.alt = sticker.description || '';
  img.className = 'sticker-card-img';
  img.loading = 'lazy';

  img.addEventListener('error', () => {
    img.style.display = 'none';
    card.classList.add('is-broken');
  });

  // 点击发送
  card.addEventListener('click', async () => {
    if (!activeState) return;
    hideBottomSheet();
    await sendStickerMessage(activeState, sticker.id);
    activeOptions?.onRefresh?.();
  });

  // 删除按钮
  const delBtn = el('button', 'sticker-card-del');
  delBtn.type = 'button';
  delBtn.setAttribute('aria-label', '删除');
  delBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12"/><path d="M18 6L6 18"/></svg>`;

  delBtn.addEventListener('click', async (event) => {
    event.stopPropagation();
    await deleteDB('stickers', sticker.id);
    showToast('表情包删掉啦');
    await showPickerSheet();
  });

  card.append(img, delBtn);
  return card;
}

// ═══════════════════════════════════════
// 【上传抽屉】选择图片 + 描述 + 保存
// ═══════════════════════════════════════

function showUploadSheet() {
  const sheet = el('div', 'sticker-upload-sheet');

  const head = el('div', 'sticker-upload-head');
  const backBtn = el('button', 'sticker-upload-back', '返回');
  backBtn.type = 'button';
  backBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="m15 18-6-6 6-6"/></svg> 返回`;
  backBtn.addEventListener('click', () => showPickerSheet());

  head.append(backBtn, el('div', 'sticker-upload-title', '上传表情包'));

  // 预览区
  const preview = el('div', 'sticker-upload-preview');
  const previewImg = document.createElement('img');
  previewImg.alt = '';
  previewImg.style.display = 'none';
  preview.appendChild(previewImg);

  const pickBtn = el('button', 'sticker-upload-pick', '选择图片');
  pickBtn.type = 'button';
  pickBtn.addEventListener('click', () => openFilePicker(previewImg));

  // 描述输入
  const descInput = document.createElement('input');
  descInput.type = 'text';
  descInput.className = 'sticker-upload-desc';
  descInput.placeholder = '描述一下这个表情包，AI 会看懂它';
  descInput.maxLength = 120;
  descInput.autocomplete = 'off';

  // 保存按钮
  const saveBtn = el('button', 'sticker-upload-save', '保存');
  saveBtn.type = 'button';
  saveBtn.disabled = true;

  let pendingBase64 = '';

  saveBtn.addEventListener('click', async () => {
    if (!pendingBase64) {
      showToast('先选一张图片');
      return;
    }

    const description = descInput.value.trim();
    const now = getNow();

    await setDB('stickers', {
      id: generateId('sticker'),
      imageBase64: pendingBase64,
      description: description || '',
      name: description || '表情包',
      createdAt: now,
      updatedAt: now
    });

    showToast('表情包上传好啦');
    await showPickerSheet();
  });

  sheet.append(head, pickBtn, preview, descInput, saveBtn);
  showBottomSheet(sheet);
}

// ───────────────────
// 文件选择器 → 读取 base64
// ───────────────────

function openFilePicker(previewImg) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/gif,image/webp';

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > MAX_STICKER_SIZE) {
      showToast('图片太大了，请换一张小一点的');
      return;
    }

    const base64 = await fileToBase64(file);

    previewImg.src = base64;
    previewImg.style.display = 'block';

    // 找到 sheet 里的保存按钮并启用
    const sheet = previewImg.closest('.sticker-upload-sheet');
    if (sheet) {
      const saveBtn = sheet.querySelector('.sticker-upload-save');
      if (saveBtn) saveBtn.disabled = false;
    }

    // 存到闭包外的变量供保存按钮读取
    const pickBtn = sheet?.querySelector('.sticker-upload-pick');
    if (pickBtn) {
      pickBtn.textContent = '换一张';
      pickBtn._pendingBase64 = base64;
    }

    // 把 base64 存到 sheet dataset 中
    if (sheet) sheet.dataset.pendingBase64 = base64;
  });

  // 重写保存按钮点击逻辑——从 sheet dataset 读取
  const sheet = previewImg.closest('.sticker-upload-sheet');
  if (sheet) {
    const saveBtn = sheet.querySelector('.sticker-upload-save');
    if (saveBtn) {
      const origClick = saveBtn.onclick;
      saveBtn.onclick = null;

      saveBtn.addEventListener('click', async () => {
        const base64 = sheet.dataset.pendingBase64 || '';
        if (!base64) {
          showToast('先选一张图片');
          return;
        }

        const descInput = sheet.querySelector('.sticker-upload-desc');
        const description = descInput?.value?.trim?.() || '';
        const now = getNow();

        await setDB('stickers', {
          id: generateId('sticker'),
          imageBase64: base64,
          description: description || '',
          name: description || '表情包',
          createdAt: now,
          updatedAt: now
        });

        showToast('表情包上传好啦');
        await showPickerSheet();
      }, { once: false });
    }
  }

  input.click();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

// ═══════════════════════════════════════
// 【数据加载】读取表情包列表
// ═══════════════════════════════════════

async function loadStickers() {
  const list = await getAllDB('stickers').catch(() => []);
  return (Array.isArray(list) ? list.filter(Boolean) : [])
    .sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')));
}

// ═══════════════════════════════════════
// 【样式注入】首次调用自动注入
// ═══════════════════════════════════════

let styleInjected = false;

function ensureStyle() {
  if (styleInjected) return;
  styleInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    .sticker-sheet {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-height: 260px;
    }

    .sticker-sheet-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 10px;
    }

    .sticker-sheet-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .sticker-sheet-count {
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.35;
    }

    .sticker-sheet-grid {
      flex: 1;
      min-height: 180px;
      max-height: min(52vh, 380px);
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
      align-content: start;
      padding: 2px 0;
      -webkit-overflow-scrolling: touch;
    }

    .sticker-sheet-grid.is-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 200px;
      color: var(--text-hint);
      text-align: center;
    }

    .sticker-empty-text {
      font-size: var(--font-size-base);
      font-weight: 500;
      color: var(--text-secondary);
    }

    .sticker-empty-hint {
      font-size: 13px;
      color: var(--text-hint);
    }

    .sticker-card {
      position: relative;
      aspect-ratio: 1 / 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 18px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      overflow: hidden;
      cursor: pointer;
      transition: all 200ms ease;
      -webkit-tap-highlight-color: transparent;
    }

    .sticker-card:active {
      transform: scale(0.95);
    }

    .sticker-card.is-broken {
      background: var(--surface-muted);
    }

    .sticker-card.is-broken::after {
      content: '坏掉了';
      color: var(--text-hint);
      font-size: 12px;
    }

    .sticker-card-img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      border-radius: 18px;
    }

    .sticker-card-del {
      position: absolute;
      top: 5px;
      right: 5px;
      width: 22px;
      height: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-hint);
      box-shadow: var(--shadow-sm);
      opacity: 0;
      transition: all 200ms ease;
      padding: 0;
    }

    .sticker-card:hover .sticker-card-del,
    .sticker-card:active .sticker-card-del {
      opacity: 1;
    }

    .sticker-card-del:active {
      transform: scale(0.9);
      color: var(--accent);
    }

    .sticker-sheet-footer {
      display: flex;
      justify-content: center;
      padding-top: 2px;
    }

    .sticker-upload-btn {
      min-height: 40px;
      padding: 0 20px;
      border-radius: 18px;
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      transition: all 200ms ease;
    }

    .sticker-upload-btn:active {
      transform: scale(0.96);
    }

    .sticker-upload-sheet {
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-height: 200px;
    }

    .sticker-upload-head {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .sticker-upload-back {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: transparent;
      color: var(--accent);
      font: inherit;
      font-size: 14px;
      font-weight: 500;
      padding: 0;
      transition: all 200ms ease;
    }

    .sticker-upload-back:active {
      opacity: 0.7;
    }

    .sticker-upload-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .sticker-upload-pick {
      min-height: 42px;
      border-radius: 16px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 14px;
      transition: all 200ms ease;
    }

    .sticker-upload-pick:active {
      transform: scale(0.97);
    }

    .sticker-upload-preview {
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .sticker-upload-preview img {
      max-width: 120px;
      max-height: 120px;
      border-radius: 16px;
      box-shadow: var(--shadow-sm);
      object-fit: contain;
    }

    .sticker-upload-desc {
      width: 100%;
      min-height: 40px;
      padding: 8px 12px;
      border-radius: 14px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 14px;
      line-height: 1.5;
    }

    .sticker-upload-desc::placeholder {
      color: var(--text-hint);
    }

    .sticker-upload-save {
      min-height: 42px;
      border-radius: 16px;
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 14px;
      font-weight: 600;
      transition: all 200ms ease;
    }

    .sticker-upload-save:disabled {
      opacity: 0.4;
    }

    .sticker-upload-save:active:not(:disabled) {
      transform: scale(0.96);
    }

    @media (max-width: 520px) {
      .sticker-sheet-grid {
        max-height: min(44vh, 320px);
        gap: 8px;
      }

      .sticker-upload-preview img {
        max-width: 100px;
        max-height: 100px;
      }
    }
  `;

  document.head.appendChild(style);
}

// ═══════════════════════════════════════
// 【DOM工具】简单元素创建
// ═══════════════════════════════════════

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;

  if (tag === 'button') {
    node.type = 'button';
    node.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    node.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
    node.addEventListener('click', (e) => e.stopPropagation());
  }

  return node;
}

// 首次加载注入样式
ensureStyle();

// 依赖：../../core/storage.js(getAllDB,setDB,deleteDB,generateId,getNow)；../../core/ui.js(showToast,showBottomSheet,hideBottomSheet)；./thread-actions.js(sendStickerMessage)
