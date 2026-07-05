// apps/settings/card-widget-bg.js
// Widget 皮肤管理卡。给每个桌面小组件单独配一张背景嘛，
// 我把 5 个 widget 列出来，每个都能贴链接或选图，还能调透明度。
// 存 localStorage KEYS.appWidgetBackgrounds：{ widgetId: { url, opacity } }
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/util.js, core/events.js

import { getData, setData, compressImage } from '../../core/storage.js';
import { KEYS } from '../../core/storage-keys.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import { injectStyle, pickImageFile, isUsableImage, clamp } from '../../core/util.js';
import bus from '../../core/events.js';

// 6 个预设 widget，和 desktop.js 的 WIDGET_DEFS / settings 的 WIDGET_LIST 保持一致
const WIDGETS = [
  { id: 'time', name: '时间' },
  { id: 'weather', name: '天气' },
  { id: 'anniversary', name: '纪念日' },
  { id: 'focus', name: '今日提示' },
  { id: 'countdown', name: '倒计时' },
  { id: 'vinyl', name: '黑胶' }
];

injectStyle('popo-settings-widget-bg-card', `
  .wbg-app-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid color-mix(in srgb,var(--text-hint) 12%,transparent)}
  .wbg-app-row:last-child{border-bottom:none}
  .wbg-app-name{flex:1;font-size:var(--font-size-base);color:var(--text-primary);display:flex;align-items:center;gap:6px;min-width:0}
  .wbg-app-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .wbg-app-thumb{width:36px;height:36px;border-radius:var(--radius-sm);background-size:cover;background-position:center;background-color:var(--bg-secondary);border:1px solid color-mix(in srgb,var(--text-hint) 20%,transparent);flex-shrink:0}
  .wbg-app-dot{width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0}
  .wbg-app-actions{display:flex;gap:6px;flex-shrink:0}
  .wbg-sheet-preview{width:100%;height:140px;border-radius:var(--radius-md);background-size:cover;background-position:center;background-color:var(--bg-secondary);margin-bottom:12px;border:1px solid color-mix(in srgb,var(--text-hint) 20%,transparent)}
  .wbg-sheet-row{margin-bottom:12px}
  .wbg-sheet-row-label{font-size:var(--font-size-small);color:var(--text-secondary);margin-bottom:4px;display:block}
  .wbg-sheet-range-row{display:flex;align-items:center;gap:10px}
  .wbg-sheet-range-row input[type=range]{flex:1}
  .wbg-sheet-range-val{min-width:34px;text-align:right;color:var(--text-secondary);font-size:var(--font-size-small)}
`);

function escapeAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// 读取全部 widget 背景配置
function getWidgetBgs() {
  const v = getData(KEYS.appWidgetBackgrounds, null);
  return (v && typeof v === 'object') ? v : {};
}
function saveWidgetBg(id, cfg) {
  const all = getWidgetBgs();
  all[id] = cfg;
  setData(KEYS.appWidgetBackgrounds, all);
}
function clearWidgetBg(id) {
  const all = getWidgetBgs();
  delete all[id];
  setData(KEYS.appWidgetBackgrounds, all);
}

export function renderWidgetBgCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-title">Widget 皮肤</div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:10px">给每个小部件单独配一张背景嘛</div>
    <div id="wbg-list"></div>
  `;
  const list = card.querySelector('#wbg-list');

  // 局部刷新列表
  const refreshList = () => {
    const cfgMap = getWidgetBgs();
    list.innerHTML = '';
    WIDGETS.forEach((w) => {
      const cfg = cfgMap[w.id];
      const hasBg = !!(cfg && cfg.url && isUsableImage(cfg.url));
      const row = document.createElement('div');
      row.className = 'wbg-app-row';
      row.innerHTML = `
        <div class="wbg-app-thumb"></div>
        <div class="wbg-app-name">
          ${hasBg ? '<span class="wbg-app-dot" aria-hidden="true"></span>' : ''}
          <span>${escapeAttr(w.name)}</span>
        </div>
        <div class="wbg-app-actions">
          <button class="btn" data-act="set" type="button">设置</button>
          ${hasBg ? '<button class="btn ghost" data-act="clear" type="button">清除</button>' : ''}
        </div>
      `;
      // 缩略图通过 JS 设置背景，避免 data URL 里的引号破坏 HTML 属性
      const thumb = row.querySelector('.wbg-app-thumb');
      if (hasBg) thumb.style.backgroundImage = `url("${cfg.url.replace(/"/g, '\\"')}")`;
      row.querySelector('[data-act=set]').addEventListener('click', () => {
        openWidgetBgSheet(w, cfg, refreshList);
      });
      const clearBtn = row.querySelector('[data-act=clear]');
      if (clearBtn) clearBtn.addEventListener('click', () => {
        showConfirm({
          title: '清掉这个皮肤吗？',
          body: `${w.name} 会回到默认样子`,
          confirmText: '清掉',
          cancelText: '不要',
          onConfirm: () => {
            clearWidgetBg(w.id);
            showToast(`${w.name} 皮肤清掉啦`);
            bus.emit('desktop:refresh');
            refreshList();
          }
        });
      });
      list.appendChild(row);
    });
  };

  refreshList();
  return card;
}

// 弹出设置皮肤的小面板：链接 / 选图 / 透明度 / 预览 / 保存
function openWidgetBgSheet(widget, currentCfg, onChange) {
  const cur = currentCfg || { url: '', opacity: 60 };
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="wbg-sheet-preview" id="wbg-preview"></div>
    <div class="wbg-sheet-row">
      <span class="wbg-sheet-row-label">图片链接</span>
      <input class="input" id="wbg-url" placeholder="https://..." value="${escapeAttr(cur.url || '')}">
    </div>
    <div class="wbg-sheet-row">
      <span class="wbg-sheet-row-label">或者从相册选一张</span>
      <button class="btn block" id="wbg-pick" type="button">${createIcon('camera', 18).outerHTML}选一张</button>
    </div>
    <div class="wbg-sheet-row">
      <span class="wbg-sheet-row-label">透明度（越小越淡）</span>
      <div class="wbg-sheet-range-row">
        <input type="range" id="wbg-opacity" min="0" max="100" value="${clamp(Number(cur.opacity ?? 60), 0, 100)}">
        <span class="wbg-sheet-range-val" id="wbg-opacity-val">${clamp(Number(cur.opacity ?? 60), 0, 100)}</span>
      </div>
    </div>
    <button class="btn primary block" id="wbg-save" type="button">保存</button>
  `;
  showBottomSheet({ title: `${widget.name} 皮肤`, bodyElement: body, dismissible: true });

  const preview = body.querySelector('#wbg-preview');
  const urlInput = body.querySelector('#wbg-url');
  const pickBtn = body.querySelector('#wbg-pick');
  const opacityInput = body.querySelector('#wbg-opacity');
  const opacityVal = body.querySelector('#wbg-opacity-val');
  const saveBtn = body.querySelector('#wbg-save');

  // 预览回填
  if (cur.url && isUsableImage(cur.url)) {
    preview.style.backgroundImage = `url("${cur.url.replace(/"/g, '\\"')}")`;
  }

  // 透明度小数字实时更新
  opacityInput.addEventListener('input', () => {
    opacityVal.textContent = Number(opacityInput.value);
  });

  // 链接输入即时预览
  const syncPreviewFromInput = () => {
    const v = urlInput.value.trim();
    if (v && isUsableImage(v)) {
      preview.style.backgroundImage = `url("${v.replace(/"/g, '\\"')}")`;
    } else {
      preview.style.backgroundImage = '';
    }
  };
  urlInput.addEventListener('input', syncPreviewFromInput);
  urlInput.addEventListener('change', syncPreviewFromInput);

  // 从相册选图，压缩成 data URL 塞回输入框
  pickBtn.addEventListener('click', async () => {
    try {
      const file = await pickImageFile();
      const dataUrl = await compressImage(file, { quality: 0.78 });
      urlInput.value = dataUrl;
      syncPreviewFromInput();
      showToast('图片选好啦，记得点保存哦');
    } catch (e) {
      if (e && /取消/.test(e.message || '')) return;
      showToast('图片读不出来嘛', 'error');
    }
  });

  // 保存：校验 + 写入 + 关闭面板 + 局部刷新 + 通知桌面重渲
  saveBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) { showToast('先填个链接或选张图嘛', 'error'); return; }
    if (!isUsableImage(url)) { showToast('这个图片地址用不了哦', 'error'); return; }
    const opacity = clamp(Number(opacityInput.value), 0, 100);
    saveWidgetBg(widget.id, { url, opacity });
    document.querySelector('.popo-sheet-close')?.click();
    showToast(`${widget.name} 皮肤设好啦`, 'success');
    bus.emit('desktop:refresh');
    if (typeof onChange === 'function') onChange();
  });
}
