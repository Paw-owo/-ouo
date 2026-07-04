// apps/avatar/index.js
// 头像定制 App——软萌少女风 PWA「泡泡」。
// 我帮主人调出最喜欢的那张脸：选图、形状、边框色、大小、滤镜，实时预览。
// 还能存成图片放到相册里，或者下载到本地哦。
// 数据：localStorage（KEYS.avatarState），字段 {image, shape, borderColor, size, filter}
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, setData, compressImage, setDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, pickImageFile, isUsableImage, clamp } from '../../core/util.js';
import { openApp } from '../../core/router.js';
import { applyAppBg } from '../../core/app-bg.js';

let containerEl = null;
// 编辑中的状态（实时预览用，保存才写库）
let workingState = null;

// 6 个马卡龙色：边框色选择（用户内容数据，非主题色）
const BORDER_COLORS = [
  { key: '樱花粉', hex: '#F5A0B0' },
  { key: '天空蓝', hex: '#7EC4E0' },
  { key: '焦糖棕', hex: '#D4A87A' },
  { key: '抹茶绿', hex: '#B5D9A0' },
  { key: '柠檬黄', hex: '#F5D88A' },
  { key: '蜜桃橙', hex: '#F5B88A' }
];

// 6 种滤镜：原图 / 暖阳 / 清凉 / 黑白 / 复古 / 亮白（css 值与产品要求对齐）
const FILTERS = [
  { key: 'none',     label: '原图', css: 'none' },
  { key: 'warm',     label: '暖阳', css: 'sepia(0.3) saturate(1.4)' },
  { key: 'cool',     label: '清凉', css: 'hue-rotate(180deg) saturate(0.8) brightness(1.1)' },
  { key: 'mono',     label: '黑白', css: 'grayscale(1) contrast(1.1)' },
  { key: 'vintage',  label: '复古', css: 'sepia(0.5) contrast(1.2) brightness(0.9)' },
  { key: 'bright',   label: '亮白', css: 'brightness(1.3) contrast(1.1) saturate(1.2)' }
];

const DEFAULT_STATE = {
  image: null,
  shape: 'circle',
  borderColor: '#F5A0B0',
  size: 1.0,
  filter: 'none'
};

// 预览基准尺寸（px），实际尺寸 = 基准 * size
const PREVIEW_BASE = 140;
// 输出图片尺寸（保存为图片时用，正方形）
const OUTPUT_SIZE = 512;

injectStyle('app-avatar-style', `
  .av-preview-wrap{
    display:flex; flex-direction:column; align-items:center;
    padding:26px 16px 22px; margin-bottom:18px;
    background:color-mix(in srgb, var(--accent-light) 22%, transparent);
    border-radius:var(--radius-card);
  }
  .av-preview{
    display:flex; align-items:center; justify-content:center;
    background-color:var(--bg-secondary);
    background-size:cover; background-position:center;
    color:var(--text-hint);
    box-shadow:var(--shadow-md);
    transition:width var(--motion), height var(--motion), border-radius var(--motion), border-color var(--motion), filter var(--motion);
  }
  .av-preview-hint{
    margin-top:14px; font-size:var(--font-size-small);
    color:var(--text-secondary); text-align:center;
  }
  .av-cards .card{ margin-bottom:14px; padding:16px; }
  .av-upload-row{ display:flex; gap:10px; flex-wrap:wrap; }
  .av-clear{ color:#E8888C; }
  .av-shape-row{ display:flex; gap:10px; }
  .av-shape-btn{
    flex:1; padding:10px; border-radius:var(--radius-md);
    background:color-mix(in srgb, var(--bg-secondary) 60%, transparent);
    color:var(--text-primary); font-size:var(--font-size-base);
    transition:var(--motion);
    display:flex; flex-direction:column; align-items:center; gap:4px;
    border:none; cursor:pointer;
  }
  .av-shape-btn:active{ transform:scale(var(--press-scale)); }
  .av-shape-btn.active{
    background:var(--accent); color:var(--bubble-user-text);
  }
  .av-shape-icon{
    width:24px; height:24px; border:2px solid currentColor;
  }
  .av-shape-icon.circle{ border-radius:50%; }
  .av-shape-icon.rounded{ border-radius:6px; }
  .av-shape-icon.square{ border-radius:0; }
  .av-color-row{ display:flex; gap:10px; flex-wrap:wrap; }
  .av-color-dot{
    width:34px; height:34px; border-radius:50%;
    cursor:pointer; border:2px solid transparent;
    transition:var(--motion);
  }
  .av-color-dot:active{ transform:scale(var(--press-scale)); }
  .av-color-dot.selected{
    border-color:var(--text-primary);
    box-shadow:0 0 0 2px var(--bg-card) inset;
  }
  .av-size-row{ display:flex; align-items:center; gap:12px; }
  .av-slider{
    flex:1; -webkit-appearance:auto; appearance:auto;
    height:4px; border-radius:2px;
    background:color-mix(in srgb, var(--text-hint) 30%, transparent);
  }
  .av-slider::-webkit-slider-thumb{
    -webkit-appearance:none; appearance:none;
    width:20px; height:20px; border-radius:50%;
    background:var(--accent); cursor:pointer;
    box-shadow:var(--shadow-sm);
  }
  .av-slider::-moz-range-thumb{
    width:20px; height:20px; border-radius:50%;
    background:var(--accent); cursor:pointer; border:none;
  }
  .av-size-val{
    font-size:var(--font-size-small); color:var(--text-secondary);
    min-width:46px; text-align:right;
  }
  .av-filter-row{ display:flex; gap:10px; overflow-x:auto; padding-bottom:6px; scrollbar-width:none; -webkit-overflow-scrolling:touch; }
  .av-filter-row::-webkit-scrollbar{ display:none; }
  .av-filter-btn{
    flex-shrink:0; padding:9px 14px; border-radius:999px;
    background:color-mix(in srgb, var(--bg-secondary) 60%, transparent);
    color:var(--text-primary); font-size:var(--font-size-small);
    border:1px solid transparent; cursor:pointer;
    transition:var(--motion);
    display:inline-flex; align-items:center; gap:5px;
  }
  .av-filter-btn:active{ transform:scale(var(--press-scale)); }
  .av-filter-btn.active{
    border-color:var(--accent);
    background:color-mix(in srgb, var(--accent-light) 35%, transparent);
    color:var(--accent-dark);
  }
  .av-save-row{ display:flex; gap:10px; margin-top:18px; }
  .av-save-row .btn{ flex:1; justify-content:center; }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  // 从 localStorage 读已有状态，合并默认值
  const saved = getData(KEYS.avatarState, null) || {};
  workingState = { ...DEFAULT_STATE, ...saved };
  // 兼容老数据：默认 filter='none'
  if (!workingState.filter) workingState.filter = 'none';
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="av-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">头像定制</div>
      <button class="app-header-gear" id="av-settings" aria-label="头像设置">${createIcon('settings', 18).outerHTML}</button>
    </div>
    <div class="app-body" id="av-body">
      <div class="av-preview-wrap">
        <div class="av-preview" id="av-preview"></div>
        <div class="av-preview-hint" id="av-hint"></div>
      </div>
      <div class="av-cards">
        <div class="card">
          <div class="card-title">头像图片</div>
          <div class="av-upload-row">
            <button class="btn ghost" id="av-upload">${createIcon('upload', 18).outerHTML}选一张</button>
            <button class="btn ghost av-clear" id="av-clear">${createIcon('trash', 18).outerHTML}清除头像</button>
          </div>
        </div>
        <div class="card">
          <div class="card-title">换个形状</div>
          <div class="av-shape-row">
            <button class="av-shape-btn ${workingState.shape === 'circle' ? 'active' : ''}" data-shape="circle">
              <span class="av-shape-icon circle"></span>
              <span>圆形</span>
            </button>
            <button class="av-shape-btn ${workingState.shape === 'rounded' ? 'active' : ''}" data-shape="rounded">
              <span class="av-shape-icon rounded"></span>
              <span>圆角方形</span>
            </button>
            <button class="av-shape-btn ${workingState.shape === 'square' ? 'active' : ''}" data-shape="square">
              <span class="av-shape-icon square"></span>
              <span>方形</span>
            </button>
          </div>
        </div>
        <div class="card">
          <div class="card-title">边框颜色</div>
          <div class="av-color-row" id="av-colors">
            ${BORDER_COLORS.map((c) => `
              <button class="av-color-dot ${c.hex === workingState.borderColor ? 'selected' : ''}" data-hex="${c.hex}" style="background:${c.hex}" aria-label="${c.key}"></button>
            `).join('')}
          </div>
        </div>
        <div class="card">
          <div class="card-title">大小</div>
          <div class="av-size-row">
            <input type="range" class="av-slider" id="av-size" min="0.8" max="1.2" step="0.01" value="${workingState.size}">
            <span class="av-size-val" id="av-size-val">${formatSize(workingState.size)}</span>
          </div>
        </div>
        <div class="card">
          <div class="card-title">给头像加个滤镜吧</div>
          <div class="av-filter-row" id="av-filters">
            ${FILTERS.map((f) => `
              <button class="av-filter-btn ${f.key === workingState.filter ? 'active' : ''}" data-filter="${f.key}">${escapeHTML(f.label)}</button>
            `).join('')}
          </div>
        </div>
      </div>
      <div class="av-save-row">
        <button class="btn primary" id="av-save">${createIcon('check', 18).outerHTML}保存头像</button>
        <button class="btn ghost" id="av-export">${createIcon('download', 18).outerHTML}存成图片</button>
      </div>
    </div>
  `;
  container.querySelector('#av-back').addEventListener('click', () => bus.emit('router:home'));
  // 齿轮跳到设置「外观」分组
  container.querySelector('#av-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'appearance' } }));
  bindControls();
  renderPreview();
  applyAppBg(container, 'avatar');
}

export function unmount() {
  containerEl = null;
  workingState = null;
}

// ════════════════════════════════════════
// 控件绑定
// ════════════════════════════════════════

function bindControls() {
  // 上传头像
  containerEl.querySelector('#av-upload').addEventListener('click', async () => {
    try {
      const file = await pickImageFile();
      const dataURL = await compressImage(file);
      if (!dataURL) return;
      workingState.image = dataURL;
      renderPreview();
      showToast('选好啦，看看效果', 'success', 1200);
    } catch (e) {
      if (e && e.message && e.message.includes('取消')) return;
      console.warn('[avatar] 图片选择失败', e);
      showToast('图片没选上，再试一下嘛', 'error');
    }
  });
  // 清除头像
  containerEl.querySelector('#av-clear').addEventListener('click', () => {
    if (!workingState.image) {
      showToast('还没设头像呢', 'default', 1200);
      return;
    }
    showConfirm({
      title: '清掉头像吗？',
      body: '清掉后预览会回到默认图标，记得点保存才会生效',
      confirmText: '清掉吧',
      cancelText: '留着',
      danger: true,
      onConfirm: () => {
        workingState.image = null;
        renderPreview();
        showToast('清掉啦，记得保存', 'default', 1400);
      }
    });
  });
  // 形状切换
  containerEl.querySelectorAll('.av-shape-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      workingState.shape = btn.dataset.shape;
      containerEl.querySelectorAll('.av-shape-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderPreview();
    });
  });
  // 边框色选择
  containerEl.querySelectorAll('.av-color-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      workingState.borderColor = dot.dataset.hex;
      containerEl.querySelectorAll('.av-color-dot').forEach((d) => d.classList.remove('selected'));
      dot.classList.add('selected');
      renderPreview();
    });
  });
  // 滤镜选择
  containerEl.querySelectorAll('.av-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      workingState.filter = btn.dataset.filter;
      containerEl.querySelectorAll('.av-filter-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      renderPreview();
    });
  });
  // 大小滑块
  const slider = containerEl.querySelector('#av-size');
  const sizeVal = containerEl.querySelector('#av-size-val');
  slider.addEventListener('input', () => {
    const v = clamp(parseFloat(slider.value) || 1, 0.8, 1.2);
    workingState.size = v;
    sizeVal.textContent = formatSize(v);
    renderPreview();
  });
  // 保存
  containerEl.querySelector('#av-save').addEventListener('click', () => {
    setData(KEYS.avatarState, workingState);
    showToast('头像换好啦', 'success', 1400);
    bus.emit('avatar:updated', { state: workingState });
  });
  // 存成图片（打开 sheet 选「存到相册」/「下载到本地」）
  containerEl.querySelector('#av-export').addEventListener('click', () => openExportSheet());
}

// ════════════════════════════════════════
// 实时预览
// ════════════════════════════════════════

function renderPreview() {
  const previewEl = containerEl?.querySelector('#av-preview');
  const hintEl = containerEl?.querySelector('#av-hint');
  if (!previewEl || !workingState) return;
  const size = clamp(workingState.size || 1, 0.8, 1.2);
  const px = Math.round(PREVIEW_BASE * size);
  const radius = shapeRadius(workingState.shape);
  previewEl.style.width = px + 'px';
  previewEl.style.height = px + 'px';
  previewEl.style.borderRadius = radius;
  previewEl.style.border = `3px solid ${workingState.borderColor}`;
  previewEl.style.filter = filterCSS(workingState.filter);
  if (isUsableImage(workingState.image)) {
    previewEl.style.backgroundImage = `url("${workingState.image}")`;
    previewEl.innerHTML = '';
    if (hintEl) hintEl.textContent = '看着真不错呀';
  } else {
    previewEl.style.backgroundImage = '';
    previewEl.innerHTML = createIcon('smile', 80).outerHTML;
    if (hintEl) hintEl.textContent = '选一张喜欢的图片当头像嘛';
  }
}

function shapeRadius(shape) {
  if (shape === 'circle') return '50%';
  if (shape === 'rounded') return '24%';
  return '0';
}

function filterCSS(filterKey) {
  const f = FILTERS.find((x) => x.key === filterKey);
  return f ? f.css : 'none';
}

function formatSize(v) {
  return (Math.round(v * 100) / 100).toFixed(2) + 'x';
}

// ════════════════════════════════════════
// 存成图片：用 canvas toBlob，可选存到相册或下载到本地
// ════════════════════════════════════════

function openExportSheet() {
  if (!isUsableImage(workingState?.image)) {
    showToast('先选一张图片呀', 'error');
    return;
  }
  const body = document.createElement('div');
  body.innerHTML = `
    <div style="font-size:var(--font-size-base);color:var(--text-primary);line-height:1.6;margin-bottom:14px">
      换个感觉，把当前预览存下来吧。会按当前形状、边框、滤镜导出一张 ${OUTPUT_SIZE}x${OUTPUT_SIZE} 的小图。
    </div>
    <div style="display:flex;flex-direction:column;gap:10px">
      <button class="btn primary block" id="av-to-album">${createIcon('camera', 18).outerHTML}存到相册</button>
      <button class="btn ghost block" id="av-to-download">${createIcon('download', 18).outerHTML}下载到本地</button>
    </div>
  `;
  const sheet = showBottomSheet({ title: '存起来', bodyElement: body, dismissible: true });
  body.querySelector('#av-to-album').addEventListener('click', async () => {
    try {
      const blob = await renderAvatarToBlob();
      if (!blob) { showToast('生成失败啦，再试一下嘛', 'error'); return; }
      const dataURL = await blobToDataURL(blob);
      const id = generateId('avatar');
      await setDB(STORES.photoAlbums, id, {
        id,
        image: dataURL,
        type: 'avatar',
        shape: workingState.shape,
        filter: workingState.filter,
        createdAt: getNow()
      });
      sheet.close();
      showToast('存到相册啦，去相册看看嘛', 'success', 1500);
    } catch (e) {
      console.warn('[avatar] 存到相册失败', e);
      showToast('没存上，再试一下嘛', 'error');
    }
  });
  body.querySelector('#av-to-download').addEventListener('click', async () => {
    try {
      const blob = await renderAvatarToBlob();
      if (!blob) { showToast('生成失败啦，再试一下嘛', 'error'); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `popo_avatar_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // 释放对象 URL（稍微等一下，避免还没开始下载）
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      sheet.close();
      showToast('下载开始啦，去下载里看看', 'success', 1500);
    } catch (e) {
      console.warn('[avatar] 下载失败', e);
      showToast('下载失败，再试一下嘛', 'error');
    }
  });
}

// 用 canvas 把当前预览画成一张 PNG blob
// canvas filter 兼容性还不错，主流浏览器都支持 ctx.filter
async function renderAvatarToBlob() {
  if (!isUsableImage(workingState?.image)) return null;
  const size = OUTPUT_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  // 加载图片
  const img = await loadImage(workingState.image);
  // 应用滤镜（canvas filter）
  ctx.filter = filterCSS(workingState.filter) || 'none';
  // 先把整张图画上去，再按形状裁剪
  // 用 clip 实现形状裁剪
  ctx.save();
  applyShapeClip(ctx, workingState.shape, size);
  // 居中覆盖绘制
  drawImageCover(ctx, img, 0, 0, size, size);
  ctx.restore();
  // 重置 filter，画边框（边框不被滤镜影响）
  ctx.filter = 'none';
  drawBorder(ctx, workingState.shape, workingState.borderColor, size);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

function applyShapeClip(ctx, shape, size) {
  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  } else if (shape === 'rounded') {
    const r = size * 0.24;
    roundedRect(ctx, 0, 0, size, size, r);
  } else {
    ctx.rect(0, 0, size, size);
  }
  ctx.closePath();
  ctx.clip();
}

function drawBorder(ctx, shape, color, size) {
  if (!color) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(4, Math.round(size * 0.018));
  ctx.beginPath();
  if (shape === 'circle') {
    const r = size / 2 - ctx.lineWidth / 2;
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  } else if (shape === 'rounded') {
    const r = size * 0.24;
    roundedRect(ctx, ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth, r - ctx.lineWidth / 2);
  } else {
    ctx.rect(ctx.lineWidth / 2, ctx.lineWidth / 2, size - ctx.lineWidth, size - ctx.lineWidth);
  }
  ctx.closePath();
  ctx.stroke();
}

function roundedRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
}

// 居中覆盖绘制（类似 background-size: cover）
function drawImageCover(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (!iw || !ih) { ctx.drawImage(img, x, y, w, h); return; }
  const ratio = Math.max(w / iw, h / ih);
  const dw = iw * ratio;
  const dh = ih * ratio;
  const dx = x + (w - dw) / 2;
  const dy = y + (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('图片加载不出来嘛'));
    img.src = src;
  });
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('读取失败'));
    reader.readAsDataURL(blob);
  });
}

// ════════════════════════════════════════
// 小工具
// ════════════════════════════════════════

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
