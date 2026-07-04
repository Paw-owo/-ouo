// apps/settings/card-bg.js
// APP 背景管理卡。给每个小应用单独配一张背景嘛，
// 我把所有 App 列出来，每个都能贴链接或选图，还能调透明度。
// 依赖：core/storage.js, core/ui.js, core/util.js, core/app-bg.js, core/events.js

import { compressImage } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet } from '../../core/ui.js';
import { injectStyle, pickImageFile, isUsableImage, clamp } from '../../core/util.js';
import { listAppBgs, saveAppBg, clearAppBg } from '../../core/app-bg.js';
import bus from '../../core/events.js';

injectStyle('popo-settings-bg-card', `
  .bg-app-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid color-mix(in srgb,var(--text-hint) 12%,transparent)}
  .bg-app-row:last-child{border-bottom:none}
  .bg-app-name{flex:1;font-size:var(--font-size-base);color:var(--text-primary);display:flex;align-items:center;gap:6px;min-width:0}
  .bg-app-name span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bg-app-thumb{width:36px;height:36px;border-radius:var(--radius-sm);background-size:cover;background-position:center;background-color:var(--bg-secondary);border:1px solid color-mix(in srgb,var(--text-hint) 20%,transparent);flex-shrink:0}
  .bg-app-dot{width:8px;height:8px;border-radius:50%;background:var(--accent);flex-shrink:0}
  .bg-app-actions{display:flex;gap:6px;flex-shrink:0}
  .bg-sheet-preview{width:100%;height:140px;border-radius:var(--radius-md);background-size:cover;background-position:center;background-color:var(--bg-secondary);margin-bottom:12px;border:1px solid color-mix(in srgb,var(--text-hint) 20%,transparent)}
  .bg-sheet-row{margin-bottom:12px}
  .bg-sheet-row-label{font-size:var(--font-size-small);color:var(--text-secondary);margin-bottom:4px;display:block}
  .bg-sheet-range-row{display:flex;align-items:center;gap:10px}
  .bg-sheet-range-row input[type=range]{flex:1}
  .bg-sheet-range-val{min-width:34px;text-align:right;color:var(--text-secondary);font-size:var(--font-size-small)}
`);

// 从 apps-registry 动态读取 App 列表（settings 自身不列，避免给背景设个背景）
async function loadAppList() {
  try {
    const reg = await import('../../apps-registry.js');
    if (reg && Array.isArray(reg.APPS)) {
      const out = reg.APPS
        .filter((a) => a && a.id && a.id !== 'settings')
        .map((a) => ({ id: a.id, name: a.name || a.id }));
      out.sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'));
      return out;
    }
  } catch (e) {
    console.warn('[card-bg] 读取注册表失败', e);
  }
  return [];
}

function escapeAttr(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

export async function renderAppBgCard() {
  const apps = await loadAppList();
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `
    <div class="card-title">APP 背景</div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:10px">给每个小应用单独配背景嘛</div>
    <div id="bg-app-list"></div>
  `;
  const list = card.querySelector('#bg-app-list');

  // 局部刷新列表，不用整张卡重渲
  const refreshList = () => {
    const configured = listAppBgs();
    const cfgMap = {};
    configured.forEach((c) => { cfgMap[c.appId] = c; });
    list.innerHTML = '';
    apps.forEach((app) => {
      const cfg = cfgMap[app.id];
      const hasBg = !!(cfg && cfg.url && isUsableImage(cfg.url));
      const row = document.createElement('div');
      row.className = 'bg-app-row';
      row.innerHTML = `
        <div class="bg-app-thumb"></div>
        <div class="bg-app-name">
          ${hasBg ? '<span class="bg-app-dot" aria-hidden="true"></span>' : ''}
          <span>${escapeAttr(app.name)}</span>
        </div>
        <div class="bg-app-actions">
          <button class="btn" data-act="set" type="button">设置</button>
          ${hasBg ? '<button class="btn ghost" data-act="clear" type="button">清除</button>' : ''}
        </div>
      `;
      // 缩略图通过 JS 设置背景，避免 data URL 里的引号破坏 HTML 属性
      const thumb = row.querySelector('.bg-app-thumb');
      if (hasBg) thumb.style.backgroundImage = `url("${cfg.url.replace(/"/g, '\\"')}")`;
      row.querySelector('[data-act=set]').addEventListener('click', () => {
        openBgSheet(app, cfg, refreshList);
      });
      const clearBtn = row.querySelector('[data-act=clear]');
      if (clearBtn) clearBtn.addEventListener('click', () => {
        showConfirm({
          title: '清掉这个背景吗？',
          body: `${app.name} 会回到默认样子`,
          confirmText: '清掉',
          cancelText: '不要',
          onConfirm: () => {
            clearAppBg(app.id);
            showToast(`${app.name} 背景清掉啦`);
            bus.emit('app-bg:changed', { appId: app.id });
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

// 弹出设置背景的小面板：链接 / 选图 / 透明度 / 预览 / 保存
function openBgSheet(app, currentCfg, onChange) {
  const cur = currentCfg || { url: '', opacity: 60 };
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="bg-sheet-preview" id="bg-preview"></div>
    <div class="bg-sheet-row">
      <span class="bg-sheet-row-label">图片链接</span>
      <input class="input" id="bg-url" placeholder="https://..." value="${escapeAttr(cur.url || '')}">
    </div>
    <div class="bg-sheet-row">
      <span class="bg-sheet-row-label">或者从相册选一张</span>
      <button class="btn block" id="bg-pick" type="button">选一张</button>
    </div>
    <div class="bg-sheet-row">
      <span class="bg-sheet-row-label">透明度（越小越淡）</span>
      <div class="bg-sheet-range-row">
        <input type="range" id="bg-opacity" min="0" max="100" value="${clamp(Number(cur.opacity ?? 60), 0, 100)}">
        <span class="bg-sheet-range-val" id="bg-opacity-val">${clamp(Number(cur.opacity ?? 60), 0, 100)}</span>
      </div>
    </div>
    <button class="btn primary block" id="bg-save" type="button">保存</button>
  `;
  showBottomSheet({ title: `${app.name} 背景`, bodyElement: body, dismissible: true });

  const preview = body.querySelector('#bg-preview');
  const urlInput = body.querySelector('#bg-url');
  const pickBtn = body.querySelector('#bg-pick');
  const opacityInput = body.querySelector('#bg-opacity');
  const opacityVal = body.querySelector('#bg-opacity-val');
  const saveBtn = body.querySelector('#bg-save');

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

  // 保存：校验 + 写入 + 关闭面板 + 局部刷新
  saveBtn.addEventListener('click', () => {
    const url = urlInput.value.trim();
    if (!url) { showToast('先填个链接或选张图嘛', 'error'); return; }
    if (!isUsableImage(url)) { showToast('这个图片地址用不了哦', 'error'); return; }
    const opacity = clamp(Number(opacityInput.value), 0, 100);
    saveAppBg(app.id, { url, opacity });
    document.querySelector('.popo-sheet-close')?.click();
    showToast(`${app.name} 背景设好啦`, 'success');
    bus.emit('app-bg:changed', { appId: app.id });
    if (typeof onChange === 'function') onChange();
  });
}
