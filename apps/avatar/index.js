// apps/avatar/index.js
// 头像定制 App——软萌少女风 PWA「泡泡」。
// 我帮主人调出最喜欢的那张脸：选图、形状、边框色、大小，实时预览。
// 数据：localStorage（KEYS.avatarState），字段 {image, shape, borderColor, size}
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { KEYS } from '../../core/storage-keys.js';
import { getData, setData, compressImage } from '../../core/storage.js';
import { showToast, showConfirm, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, pickImageFile, isUsableImage, clamp } from '../../core/util.js';
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

const DEFAULT_STATE = {
  image: null,
  shape: 'circle',
  borderColor: '#F5A0B0',
  size: 1.0
};

// 预览基准尺寸（px），实际尺寸 = 基准 * size
const PREVIEW_BASE = 140;

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
    transition:width var(--motion), height var(--motion), border-radius var(--motion), border-color var(--motion);
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
  }
  .av-shape-btn:active{ transform:scale(var(--press-scale)); }
  .av-shape-btn.active{
    background:var(--accent); color:var(--bubble-user-text);
  }
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
  .av-save{ margin-top:18px; }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  // 从 localStorage 读已有状态，合并默认值
  const saved = getData(KEYS.avatarState, null) || {};
  workingState = { ...DEFAULT_STATE, ...saved };
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="av-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">头像定制</div>
      <span style="width:36px"></span>
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
          <div class="card-title">形状</div>
          <div class="av-shape-row">
            <button class="av-shape-btn ${workingState.shape === 'circle' ? 'active' : ''}" data-shape="circle">圆形</button>
            <button class="av-shape-btn ${workingState.shape === 'rounded' ? 'active' : ''}" data-shape="rounded">圆角方形</button>
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
      </div>
      <button class="btn primary block av-save" id="av-save">${createIcon('check', 18).outerHTML}保存头像</button>
    </div>
  `;
  container.querySelector('#av-back').addEventListener('click', () => bus.emit('router:home'));
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
  const radius = workingState.shape === 'circle' ? '50%' : '24%';
  previewEl.style.width = px + 'px';
  previewEl.style.height = px + 'px';
  previewEl.style.borderRadius = radius;
  previewEl.style.border = `3px solid ${workingState.borderColor}`;
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

function formatSize(v) {
  return (Math.round(v * 100) / 100).toFixed(2) + 'x';
}
