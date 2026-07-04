// apps/settings/index.js
// 设置 App——Phase 1 真实可用版。
// 功能：主题（6 预设 + 导入导出）/ 壁纸 / 锁屏背景 / 锁屏头像 /
//      桌面缩放（图标/Widget/Dock）/ 自定义字体 / 今日提示 /
//      隐藏图标管理 / 数据导出导入 / 关于。
// 依赖：core/theme.js, core/storage.js, core/storage-keys.js, core/util.js,
//      core/storage-manager.js, core/ui.js, core/events.js

import { getPresets, getCurrentThemeId, setTheme, exportTheme, importTheme, applyDesktopScale, applyFontFamily, getCurrentTheme } from '../../core/theme.js';
import { STORES, KEYS } from '../../core/storage-keys.js';
import { compressImage, fileToDataURL, getDB, setDB, deleteDB, getData, setData, removeData } from '../../core/storage.js';
import { pickImageFile, isUsableImage, cssUrl, clamp } from '../../core/util.js';
import { exportToFile, importFromFile } from '../../core/storage-manager.js';
import { showToast, showBottomSheet, showConfirm, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { get as getConfig } from '../../core/config.js';

let containerEl = null;

export async function mount(container, context) {
  containerEl = container;
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="settings-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">设置</div>
      <span style="width:36px"></span>
    </div>
    <div class="app-body" id="settings-body"></div>
  `;
  container.querySelector('#settings-back').addEventListener('click', () => bus.emit('router:home'));
  await renderSections();
}

async function renderSections() {
  const body = containerEl.querySelector('#settings-body');
  body.innerHTML = '';
  body.appendChild(await renderThemeCard());
  body.appendChild(renderWallpaperCard());
  body.appendChild(renderLockCard());
  body.appendChild(renderScaleCard());
  body.appendChild(renderFontCard());
  body.appendChild(renderFocusCard());
  body.appendChild(await renderHiddenIconsCard());
  body.appendChild(renderDataCard());
  body.appendChild(renderAboutCard());
}

// ════════════════════════════════════════
// 主题
// ════════════════════════════════════════
async function renderThemeCard() {
  const presets = getPresets();
  const currentId = getCurrentThemeId();
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="card-title">主题</div><div class="theme-grid" id="theme-grid"></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn ghost" id="theme-export" style="flex:1">导出主题</button>
      <button class="btn ghost" id="theme-import" style="flex:1">导入主题</button>
    </div>`;
  const grid = card.querySelector('#theme-grid');
  Object.values(presets).forEach((t) => {
    const c = document.createElement('div');
    c.className = 'theme-card' + (t.id === currentId ? ' active' : '');
    c.innerHTML = `<div class="theme-card-swatch">
        <span style="background:${t.vars['--bg-primary']}"></span>
        <span style="background:${t.vars['--accent']}"></span>
        <span style="background:${t.vars['--accent-light']}"></span>
      </div>
      <div class="theme-card-name">${t.name}</div>`;
    c.addEventListener('click', () => {
      setTheme(t.id);
      bus.emit('theme:changed', { id: t.id });
      renderSections();
      showToast(`换成 ${t.name} 啦`, 'success');
    });
    grid.appendChild(c);
  });
  card.querySelector('#theme-export').addEventListener('click', () => {
    try {
      const json = exportTheme(getCurrentThemeId());
      downloadText(`popo-theme-${getCurrentThemeId()}.json`, json);
      showToast('主题导出好啦');
    } catch (e) { showToast('导出失败：' + e.message, 'error'); }
  });
  card.querySelector('#theme-import').addEventListener('click', async () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const f = input.files[0]; document.body.removeChild(input);
      if (!f) return;
      try {
        const text = await f.text();
        const t = importTheme(text);
        setTheme(t.id);
        bus.emit('theme:changed', { id: t.id });
        renderSections();
        showToast('主题导入成功啦', 'success');
      } catch (e) { showToast('导入失败：' + e.message, 'error'); }
    });
    input.click();
  });
  return card;
}

// ════════════════════════════════════════
// 壁纸
// ════════════════════════════════════════
function renderWallpaperCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="card-title">桌面壁纸</div>
    <div class="card-row"><span class="card-row-label">换一张壁纸</span><button class="btn primary" id="wp-pick">选一张</button></div>
    <div class="card-row"><span class="card-row-label">壁纸透明度</span><input type="range" id="wp-opacity" min="0" max="100" value="100" style="width:140px"></div>
    <div class="card-row"><span class="card-row-label">不要壁纸了</span><button class="btn ghost" id="wp-clear">清掉</button></div>`;
  card.querySelector('#wp-pick').addEventListener('click', async () => {
    try {
      const file = await pickImageFile();
      const maxSize = getConfig('image.maxSizeMB', 5) * 1024 * 1024;
      if (file.size > maxSize) { showToast(`图片太大啦，别超过 ${getConfig('image.maxSizeMB', 5)}MB 嘛`, 'error'); return; }
      const compressed = await compressImage(file, { quality: getConfig('image.compressionQuality', 0.78) });
      await setDB(STORES.blobs, KEYS.appWallpaper, { value: compressed, opacity: 100, updatedAt: new Date().toISOString() });
      await refreshDesktop();
      showToast('壁纸换好啦', 'success');
    } catch (e) { console.warn('[settings] 壁纸', e); showToast('图片读不出来嘛', 'error'); }
  });
  card.querySelector('#wp-clear').addEventListener('click', () => {
    showConfirm({ title: '真的要清掉壁纸吗？', body: '清掉后会回到默认背景', confirmText: '清掉', cancelText: '不要', onConfirm: async () => {
      await deleteDB(STORES.blobs, KEYS.appWallpaper);
      await refreshDesktop();
      showToast('壁纸清掉啦');
    }});
  });
  card.querySelector('#wp-opacity').addEventListener('change', async (e) => {
    const opacity = Number(e.target.value);
    const rec = await getDB(STORES.blobs, KEYS.appWallpaper);
    if (rec) { await setDB(STORES.blobs, KEYS.appWallpaper, { ...rec, opacity }); await refreshDesktop(); }
  });
  return card;
}

// ════════════════════════════════════════
// 锁屏背景 + 头像
// ════════════════════════════════════════
function renderLockCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="card-title">锁屏</div>
    <div class="card-row"><span class="card-row-label">锁屏背景图</span><button class="btn" id="lock-bg-pick">选一张</button></div>
    <div class="card-row"><span class="card-row-label">锁屏头像</span><button class="btn" id="lock-avatar-pick">选一张</button></div>
    <div class="card-row"><span class="card-row-label">锁屏密码</span><span class="card-row-value" id="lock-pwd-display">****</span></div>`;
  card.querySelector('#lock-bg-pick').addEventListener('click', async () => {
    try {
      const file = await pickImageFile();
      const dataUrl = await compressImage(file, { quality: getConfig('image.compressionQuality', 0.78) });
      await setDB(STORES.blobs, KEYS.appLockWallpaper, { value: dataUrl, updatedAt: new Date().toISOString() });
      if (window.popoRefreshLock) await window.popoRefreshLock();
      await refreshDesktop();
      showToast('锁屏背景换好啦', 'success');
    } catch (e) { showToast('图片读不出来嘛', 'error'); }
  });
  card.querySelector('#lock-avatar-pick').addEventListener('click', async () => {
    try {
      const file = await pickImageFile();
      const dataUrl = await compressImage(file, { quality: getConfig('image.compressionQuality', 0.78) });
      await setDB(STORES.blobs, KEYS.appLockAvatar, { value: dataUrl, updatedAt: new Date().toISOString() });
      if (window.popoRefreshLock) await window.popoRefreshLock();
      showToast('锁屏头像换好啦', 'success');
    } catch (e) { showToast('图片读不出来嘛', 'error'); }
  });
  return card;
}

// ════════════════════════════════════════
// 桌面缩放
// ════════════════════════════════════════
function renderScaleCard() {
  const card = document.createElement('div');
  const iconScale = Number(getData(KEYS.appDesktopScale, 1));
  const widgetScale = Number(getData(KEYS.appWidgetScale, 1));
  const dockScale = Number(getData(KEYS.appDockScale, 1));
  const min = getConfig('desktop.scaleMin', 0.62);
  const max = getConfig('desktop.scaleMax', 1.28);
  card.className = 'card';
  card.innerHTML = `<div class="card-title">桌面缩放</div>
    <div class="card-row"><span class="card-row-label">图标大小</span><input type="range" id="scale-icon" min="${min}" max="${max}" step="0.02" value="${iconScale}" style="width:140px"></div>
    <div class="card-row"><span class="card-row-label">Widget 大小</span><input type="range" id="scale-widget" min="${min}" max="${max}" step="0.02" value="${widgetScale}" style="width:140px"></div>
    <div class="card-row"><span class="card-row-label">Dock 大小</span><input type="range" id="scale-dock" min="${min}" max="${max}" step="0.02" value="${dockScale}" style="width:140px"></div>`;
  const apply = (key, val) => {
    setData(key, val);
    applyDesktopScale(
      Number(getData(KEYS.appDesktopScale, 1)),
      Number(getData(KEYS.appWidgetScale, 1)),
      Number(getData(KEYS.appDockScale, 1))
    );
  };
  card.querySelector('#scale-icon').addEventListener('change', (e) => apply(KEYS.appDesktopScale, Number(e.target.value)));
  card.querySelector('#scale-widget').addEventListener('change', (e) => apply(KEYS.appWidgetScale, Number(e.target.value)));
  card.querySelector('#scale-dock').addEventListener('change', (e) => apply(KEYS.appDockScale, Number(e.target.value)));
  return card;
}

// ════════════════════════════════════════
// 自定义字体
// ════════════════════════════════════════
function renderFontCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="card-title">字体</div>
    <div class="card-row"><span class="card-row-label">上传字体（ttf/woff/woff2/otf）</span><button class="btn" id="font-pick">选一个</button></div>
    <div class="card-row"><span class="card-row-label">用回默认字体</span><button class="btn ghost" id="font-clear">清掉</button></div>`;
  card.querySelector('#font-pick').addEventListener('click', async () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.ttf,.woff,.woff2,.otf,font/*';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const f = input.files[0]; document.body.removeChild(input);
      if (!f) return;
      try {
        const dataUrl = await fileToDataURL(f);
        await setDB(STORES.blobs, KEYS.appCustomFontBlob, { value: dataUrl, name: f.name, type: f.type, updatedAt: new Date().toISOString() });
        setData(KEYS.appFontFamily, "'PopoCustom'");
        applyFontFamily("'PopoCustom'", dataUrl);
        showToast('字体换好啦', 'success');
      } catch (e) { showToast('字体读不出来嘛', 'error'); }
    });
    input.click();
  });
  card.querySelector('#font-clear').addEventListener('click', async () => {
    await deleteDB(STORES.blobs, KEYS.appCustomFontBlob);
    removeData(KEYS.appFontFamily);
    applyFontFamily('');
    showToast('字体清掉啦');
  });
  return card;
}

// ════════════════════════════════════════
// 今日提示 widget 文案
// ════════════════════════════════════════
function renderFocusCard() {
  const card = document.createElement('div');
  const focus = getData(KEYS.appFocusWidget, { title: '今天也要好好休息', text: '打开设置，看看我能帮你做什么' });
  card.className = 'card';
  card.innerHTML = `<div class="card-title">今日提示 Widget</div>
    <input class="input" id="focus-title" placeholder="标题" value="${escapeAttr(focus.title || '')}" style="margin-bottom:8px">
    <textarea class="textarea" id="focus-text" placeholder="想说点什么...">${escapeHtml(focus.text || '')}</textarea>
    <button class="btn primary block" id="focus-save" style="margin-top:10px">记下来</button>`;
  card.querySelector('#focus-save').addEventListener('click', async () => {
    const title = card.querySelector('#focus-title').value.trim() || '今天也要好好休息';
    const text = card.querySelector('#focus-text').value.trim();
    setData(KEYS.appFocusWidget, { title, text });
    await refreshDesktop();
    showToast('好啦，记下来啦', 'success');
  });
  return card;
}

// ════════════════════════════════════════
// 隐藏图标管理
// ════════════════════════════════════════
async function renderHiddenIconsCard() {
  const reg = await import('../../apps-registry.js');
  const hidden = getData(KEYS.appHiddenIcons, []);
  const card = document.createElement('div');
  card.className = 'card';
  if (!hidden.length) {
    card.innerHTML = `<div class="card-title">隐藏的图标</div><div class="empty-state"><div class="empty-state-text">没有藏起来的图标哦</div></div>`;
    return card;
  }
  card.innerHTML = `<div class="card-title">隐藏的图标</div>`;
  hidden.forEach((appId) => {
    const app = reg.APPS.find((a) => a.id === appId);
    if (!app) return;
    const row = document.createElement('div');
    row.className = 'card-row';
    row.innerHTML = `<span class="card-row-label">${app.name}</span><button class="btn ghost">放回去</button>`;
    row.querySelector('button').addEventListener('click', () => {
      const next = hidden.filter((id) => id !== appId);
      setData(KEYS.appHiddenIcons, next);
      refreshDesktop();
      renderSections();
      showToast(`${app.name} 放回去啦`);
    });
    card.appendChild(row);
  });
  return card;
}

// ════════════════════════════════════════
// 数据导出 / 导入
// ════════════════════════════════════════
function renderDataCard() {
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="card-title">数据备份</div>
    <div class="card-row"><span class="card-row-label">导出全部数据</span><button class="btn" id="data-export">导出</button></div>
    <div class="card-row"><span class="card-row-label">导入备份</span><button class="btn" id="data-import">导入</button></div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-top:8px;line-height:1.5">数据只存在这台设备上，导出后请妥善保管哦</div>`;
  card.querySelector('#data-export').addEventListener('click', async () => {
    try {
      await exportToFile();
      showToast('数据导出好啦', 'success');
    } catch (e) { showToast('导出失败：' + e.message, 'error'); }
  });
  card.querySelector('#data-import').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json,application/json';
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', async () => {
      const f = input.files[0]; document.body.removeChild(input);
      if (!f) return;
      showConfirm({ title: '确定导入吗？', body: '导入会覆盖现在的数据哦', confirmText: '导入', cancelText: '不要', onConfirm: async () => {
        try {
          await importFromFile(f);
          showToast('数据导入好啦，刷新一下', 'success');
          setTimeout(() => location.reload(), 800);
        } catch (e) { showToast('导入失败：' + e.message, 'error'); }
      }});
    });
    input.click();
  });
  return card;
}

// ════════════════════════════════════════
// 关于
// ════════════════════════════════════════
function renderAboutCard() {
  const card = document.createElement('div');
  const theme = getCurrentTheme();
  card.className = 'card';
  card.innerHTML = `<div class="card-title">关于泡泡</div>
    <div class="card-row"><span class="card-row-label">版本</span><span class="card-row-value">v1.0.0</span></div>
    <div class="card-row"><span class="card-row-label">当前主题</span><span class="card-row-value">${theme?.name || '默认'}</span></div>
    <div class="card-row"><span class="card-row-label">数据存储</span><span class="card-row-value">本地优先</span></div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-top:12px;line-height:1.6">泡泡是一个温柔的 AI 聊天伴侣桌面系统。她有情绪、有记忆，会撒娇、会闹别扭。所有数据都安安静静待在你的设备上，不会偷偷跑出去。</div>`;
  return card;
}

// ════════════════════════════════════════
// 工具 & unmount
// ════════════════════════════════════════
async function refreshDesktop() {
  if (window.popoRefreshDesktop) await window.popoRefreshDesktop();
  bus.emit('desktop:refresh');
}
function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

export function unmount() {
  containerEl = null;
}
