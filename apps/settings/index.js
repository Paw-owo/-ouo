// apps/settings/index.js
// 设置 App——Phase 1 真实可用版。
// 功能：主题（6 预设 + 导入导出）/ 壁纸 / 锁屏背景 / 锁屏头像 /
//      桌面缩放（图标/Widget/Dock）/ 自定义字体 / 今日提示 /
//      隐藏图标管理 / 数据导出导入 / 关于。
// 依赖：core/theme.js, core/storage.js, core/storage-keys.js, core/util.js,
//      core/storage-manager.js, core/ui.js, core/events.js

import { getPresets, getCurrentThemeId, setTheme, exportTheme, importTheme, applyDesktopScale, applyFontFamily, getCurrentTheme, applyCustomColors, clearCustomColors, getCustomColors, getThemeVar } from '../../core/theme.js';
import { STORES, KEYS } from '../../core/storage-keys.js';
import { compressImage, fileToDataURL, getDB, setDB, deleteDB, getData, setData, removeData } from '../../core/storage.js';
import { pickImageFile, isUsableImage, cssUrl, clamp } from '../../core/util.js';
import { exportToFile, importFromFile } from '../../core/storage-manager.js';
import { showToast, showBottomSheet, showConfirm, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { get as getConfig } from '../../core/config.js';
// 新增卡片的子模块：拆出来避免 index.js 超过 800 行
import { renderAICard } from './card-ai.js';
import { renderNotifyCard } from './card-notify.js';
import { renderDataMgmtCard } from './card-data.js';
import { renderAppBgCard } from './card-bg.js';

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
  body.appendChild(renderCustomColorsCard());
  body.appendChild(renderAICard());
  body.appendChild(renderNotifyCard());
  body.appendChild(renderWallpaperCard());
  body.appendChild(await renderAppBgCard());
  body.appendChild(renderLockCard());
  body.appendChild(renderScaleCard());
  body.appendChild(renderPagesCard());
  body.appendChild(renderFontCard());
  body.appendChild(renderIconCustomCard());
  body.appendChild(renderFocusCard());
  body.appendChild(renderWeatherCard());
  body.appendChild(renderWidgetMgmtCard());
  body.appendChild(await renderHiddenIconsCard());
  body.appendChild(renderDataCard());
  body.appendChild(renderDataMgmtCard());
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
    <div class="card-row"><span class="card-row-label">从相册选一张</span><button class="btn primary" id="wp-pick">选一张</button></div>
    <div class="card-row"><span class="card-row-label">用链接地址</span><button class="btn" id="wp-url">贴链接</button></div>
    <div class="card-row"><span class="card-row-label">壁纸透明度</span><input type="range" id="wp-opacity" min="0" max="100" value="100" style="width:140px"></div>
    <div class="card-row"><span class="card-row-label">不要壁纸了</span><button class="btn ghost" id="wp-clear">清掉</button></div>`;
  // 回填透明度
  getDB(STORES.blobs, KEYS.appWallpaper).then((rec) => {
    if (rec && typeof rec.opacity === 'number') {
      const slider = card.querySelector('#wp-opacity');
      if (slider) slider.value = String(rec.opacity);
    }
  });
  card.querySelector('#wp-pick').addEventListener('click', async () => {
    try {
      const file = await pickImageFile();
      const maxSize = getConfig('image.maxSizeMB', 5) * 1024 * 1024;
      if (file.size > maxSize) { showToast(`图片太大啦，别超过 ${getConfig('image.maxSizeMB', 5)}MB 嘛`, 'error'); return; }
      const compressed = await compressImage(file, { quality: getConfig('image.compressionQuality', 0.78) });
      const prev = await getDB(STORES.blobs, KEYS.appWallpaper);
      await setDB(STORES.blobs, KEYS.appWallpaper, { value: compressed, opacity: prev?.opacity ?? 100, updatedAt: new Date().toISOString() });
      await refreshDesktop();
      showToast('壁纸换好啦', 'success');
    } catch (e) { console.warn('[settings] 壁纸', e); showToast('图片读不出来嘛', 'error'); }
  });
  card.querySelector('#wp-url').addEventListener('click', () => {
    const body = document.createElement('div');
    body.innerHTML = `<input class="input" id="wp-url-input" placeholder="https://..." style="width:100%;margin-bottom:10px">
      <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:10px">支持 jpg/png/webp，跨域图片可能显示不出来哦</div>
      <button class="btn primary block" id="wp-url-ok">用这张</button>`;
    showBottomSheet({
      title: '贴个图片链接', bodyElement: body, dismissible: true
    });
    const input = body.querySelector('#wp-url-input');
    input.focus();
    body.querySelector('#wp-url-ok').addEventListener('click', async () => {
      const url = input.value.trim();
      if (!/^https?:\/\//i.test(url)) { showToast('链接要 http 或 https 开头哦', 'error'); return; }
      const prev = await getDB(STORES.blobs, KEYS.appWallpaper);
      await setDB(STORES.blobs, KEYS.appWallpaper, { value: url, opacity: prev?.opacity ?? 100, updatedAt: new Date().toISOString() });
      document.querySelector('.popo-sheet-close')?.click();
      await refreshDesktop();
      showToast('壁纸设好啦', 'success');
    });
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
  const useWp = getData(KEYS.appLockUseWallpaper, false);
  card.innerHTML = `<div class="card-title">锁屏</div>
    <div class="card-row"><span class="card-row-label">锁屏背景图</span><button class="btn" id="lock-bg-pick">选一张</button></div>
    <div class="card-row"><span class="card-row-label">用链接设背景</span><button class="btn" id="lock-bg-url">贴链接</button></div>
    <div class="card-row"><span class="card-row-label">锁屏跟桌面同款</span><input type="checkbox" id="lock-use-wp" ${useWp ? 'checked' : ''}></div>
    <div class="card-row"><span class="card-row-label">锁屏头像</span><button class="btn" id="lock-avatar-pick">选一张</button></div>
    <div class="card-row"><span class="card-row-label">锁屏密码</span><button class="btn ghost" id="lock-pwd-change">改密码</button></div>`;
  card.querySelector('#lock-bg-pick').addEventListener('click', async () => {
    try {
      const file = await pickImageFile();
      const dataUrl = await compressImage(file, { quality: getConfig('image.compressionQuality', 0.78) });
      await setDB(STORES.blobs, KEYS.appLockWallpaper, { value: dataUrl, updatedAt: new Date().toISOString() });
      if (window.popoRefreshLock) await window.popoRefreshLock();
      showToast('锁屏背景换好啦', 'success');
    } catch (e) { showToast('图片读不出来嘛', 'error'); }
  });
  card.querySelector('#lock-bg-url').addEventListener('click', () => {
    const body = document.createElement('div');
    body.innerHTML = `<input class="input" id="lock-url-input" placeholder="https://..." style="width:100%;margin-bottom:10px">
      <button class="btn primary block" id="lock-url-ok">用这张</button>`;
    showBottomSheet({ title: '锁屏背景链接', bodyElement: body, dismissible: true });
    body.querySelector('#lock-url-input').focus();
    body.querySelector('#lock-url-ok').addEventListener('click', async () => {
      const url = body.querySelector('#lock-url-input').value.trim();
      if (!/^https?:\/\//i.test(url)) { showToast('链接要 http 或 https 开头哦', 'error'); return; }
      await setDB(STORES.blobs, KEYS.appLockWallpaper, { value: url, updatedAt: new Date().toISOString() });
      document.querySelector('.popo-sheet-close')?.click();
      if (window.popoRefreshLock) await window.popoRefreshLock();
      showToast('锁屏背景设好啦', 'success');
    });
  });
  card.querySelector('#lock-use-wp').addEventListener('change', (e) => {
    setData(KEYS.appLockUseWallpaper, e.target.checked);
    if (window.popoRefreshLock) window.popoRefreshLock();
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
  card.querySelector('#lock-pwd-change').addEventListener('click', () => {
    const body = document.createElement('div');
    body.innerHTML = `<input class="input" id="pwd-old" type="password" placeholder="现在的密码" style="width:100%;margin-bottom:8px">
      <input class="input" id="pwd-new" type="password" placeholder="新密码（4-8 位数字）" style="width:100%;margin-bottom:8px">
      <input class="input" id="pwd-confirm" type="password" placeholder="再输一次新密码" style="width:100%;margin-bottom:10px">
      <button class="btn primary block" id="pwd-ok">改掉</button>`;
    showBottomSheet({ title: '改锁屏密码', bodyElement: body, dismissible: true });
    body.querySelector('#pwd-ok').addEventListener('click', () => {
      const oldP = body.querySelector('#pwd-old').value;
      const newP = body.querySelector('#pwd-new').value;
      const conP = body.querySelector('#pwd-confirm').value;
      const cur = String(getData(KEYS.appLockPassword, '0326'));
      if (oldP !== cur) { showToast('现在的密码不对哦', 'error'); return; }
      if (!/^\d{4,8}$/.test(newP)) { showToast('新密码要 4-8 位数字', 'error'); return; }
      if (newP !== conP) { showToast('两次新密码不一样', 'error'); return; }
      setData(KEYS.appLockPassword, newP);
      document.querySelector('.popo-sheet-close')?.click();
      showToast('密码改好啦，下次用新密码解锁哦', 'success');
    });
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
// 桌面分页
// ════════════════════════════════════════
function renderPagesCard() {
  const card = document.createElement('div');
  const count = (window.popoGetPageCount ? window.popoGetPageCount() : 2);
  card.className = 'card';
  card.innerHTML = `<div class="card-title">桌面分页</div>
    <div class="card-row"><span class="card-row-label">桌面页数（1-6）</span>
      <div style="display:flex;align-items:center;gap:6px">
        <button class="btn" id="page-minus">−</button>
        <span class="card-row-value" id="page-count" style="min-width:24px;text-align:center">${count}</span>
        <button class="btn" id="page-plus">+</button>
      </div>
    </div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-top:6px">页数变少时，多出来的图标会藏起来，去「隐藏图标」里找回</div>`;
  card.querySelector('#page-minus').addEventListener('click', () => {
    const cur = window.popoGetPageCount ? window.popoGetPageCount() : 2;
    if (cur <= 1) { showToast('至少要留 1 页嘛'); return; }
    if (window.popoSetPageCount) window.popoSetPageCount(cur - 1);
    card.querySelector('#page-count').textContent = String(window.popoGetPageCount());
  });
  card.querySelector('#page-plus').addEventListener('click', () => {
    const cur = window.popoGetPageCount ? window.popoGetPageCount() : 2;
    if (cur >= 6) { showToast('最多 6 页啦'); return; }
    if (window.popoSetPageCount) window.popoSetPageCount(cur + 1);
    card.querySelector('#page-count').textContent = String(window.popoGetPageCount());
  });
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
// 自定义颜色（在当前主题基础上覆盖单个 CSS 变量）
// ════════════════════════════════════════
const COLOR_VARS = [
  { key: '--accent', label: '主题色' },
  { key: '--accent-light', label: '主题浅色' },
  { key: '--accent-dark', label: '主题深色' },
  { key: '--bg-primary', label: '背景色' },
  { key: '--bg-card', label: '卡片背景' },
  { key: '--text-primary', label: '主文字色' },
  { key: '--text-secondary', label: '次文字色' },
  { key: '--bubble-user-bg', label: '我的气泡' }
];

function renderCustomColorsCard() {
  const card = document.createElement('div');
  card.className = 'card';
  const currentId = getCurrentThemeId();
  const saved = getCustomColors();
  card.innerHTML = `<div class="card-title">自定义颜色</div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:10px">在「${getCurrentTheme()?.name || '当前主题」'}基础上覆盖，想还原就点清空</div>
    <div class="color-grid" id="color-grid"></div>
    <button class="btn ghost block" id="color-clear" style="margin-top:10px">还原成主题原色</button>`;
  const grid = card.querySelector('#color-grid');
  COLOR_VARS.forEach((c) => {
    const curVal = saved[c.key] || getThemeVar(currentId, c.key) || '#7AA2D6';
    const row = document.createElement('div');
    row.className = 'card-row';
    row.innerHTML = `<span class="card-row-label">${c.label}</span>
      <input type="color" data-var="${c.key}" value="${normalizeHex(curVal)}" style="width:42px;height:28px;border-radius:8px;cursor:pointer">`;
    const input = row.querySelector('input');
    input.addEventListener('change', () => {
      const all = getCustomColors();
      all[c.key] = input.value;
      applyCustomColors(all);
      showToast(`${c.label} 改好啦`, 'default', 1200);
    });
    grid.appendChild(row);
  });
  card.querySelector('#color-clear').addEventListener('click', () => {
    clearCustomColors();
    grid.querySelectorAll('input[type=color]').forEach((inp) => {
      const v = getThemeVar(currentId, inp.dataset.var) || '#7AA2D6';
      inp.value = normalizeHex(v);
    });
    showToast('还原成主题原色啦');
  });
  return card;
}

function normalizeHex(v) {
  if (!v) return '#7AA2D6';
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) return '#' + v.slice(1).split('').map((c) => c + c).join('');
  return '#7AA2D6';
}

// ════════════════════════════════════════
// 自定义 App 图标
// ════════════════════════════════════════
async function renderIconCustomCard() {
  const reg = await import('../../apps-registry.js');
  const card = document.createElement('div');
  card.className = 'card';
  card.innerHTML = `<div class="card-title">自定义图标</div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:10px">给每个 App 换一张自己的图标</div>
    <div id="icon-list"></div>`;
  const list = card.querySelector('#icon-list');
  for (const app of reg.APPS) {
    const rec = await getDB(STORES.blobs, `app_icon_${app.id}`);
    const hasCustom = !!(rec && (rec.value || rec.source || rec.data));
    const row = document.createElement('div');
    row.className = 'card-row';
    row.innerHTML = `<span class="card-row-label">${app.name}</span>
      <button class="btn" data-act="pick">换图标</button>
      ${hasCustom ? '<button class="btn ghost" data-act="reset" style="margin-left:6px">还原</button>' : ''}`;
    row.querySelector('[data-act=pick]').addEventListener('click', async () => {
      try {
        const file = await pickImageFile();
        const dataUrl = await compressImage(file, { quality: getConfig('image.compressionQuality', 0.78) });
        await setDB(STORES.blobs, `app_icon_${app.id}`, { value: dataUrl, updatedAt: new Date().toISOString() });
        await refreshDesktop();
        showToast(`${app.name} 图标换好啦`, 'success');
        renderSections();
      } catch (e) { showToast('图片读不出来嘛', 'error'); }
    });
    const resetBtn = row.querySelector('[data-act=reset]');
    if (resetBtn) resetBtn.addEventListener('click', async () => {
      await deleteDB(STORES.blobs, `app_icon_${app.id}`);
      await refreshDesktop();
      showToast(`${app.name} 图标还原啦`);
      renderSections();
    });
    list.appendChild(row);
  }
  return card;
}

// ════════════════════════════════════════
// 天气
// ════════════════════════════════════════
function renderWeatherCard() {
  const card = document.createElement('div');
  const city = getData(KEYS.weatherCity, '');
  card.className = 'card';
  card.innerHTML = `<div class="card-title">天气</div>
    <div class="card-row"><span class="card-row-label">城市（留空跟随定位）</span><input class="input" id="weather-city" value="${escapeAttr(city)}" placeholder="如 Beijing" style="width:140px"></div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-top:6px">改完回到桌面等几秒就能看到新天气</div>`;
  card.querySelector('#weather-city').addEventListener('change', (e) => {
    setData(KEYS.weatherCity, e.target.value.trim());
    showToast('城市记好啦');
    bus.emit('weather:refresh');
  });
  return card;
}

// ════════════════════════════════════════
// 今日提示 widget 文案
// ════════════════════════════════════════

// ════════════════════════════════════════
// Widget 管理（显示/隐藏 + 选页）
// ════════════════════════════════════════
const WIDGET_LIST = [
  { id: 'time', name: '时间' },
  { id: 'weather', name: '天气' },
  { id: 'anniversary', name: '纪念日' },
  { id: 'focus', name: '今日提示' },
  { id: 'vinyl', name: '黑胶' }
];
function renderWidgetMgmtCard() {
  const card = document.createElement('div');
  card.className = 'card';
  const layout = getData(KEYS.appWidgetPositions, {});
  card.innerHTML = `<div class="card-title">Widget 管理</div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:10px">勾选显示，选页放在第几屏</div>
    <div id="widget-list"></div>`;
  const list = card.querySelector('#widget-list');
  WIDGET_LIST.forEach((w) => {
    const cfg = layout[w.id] || {};
    const hidden = !!cfg.hidden;
    const page = cfg.page ?? (w.id === 'vinyl' ? 1 : 0);
    const row = document.createElement('div');
    row.className = 'card-row';
    row.innerHTML = `<span class="card-row-label">${w.name}</span>
      <input type="checkbox" data-act="show" ${hidden ? '' : 'checked'} style="margin-right:8px">
      <select data-act="page" style="padding:4px 8px;border-radius:var(--radius-sm);background:var(--bg-secondary);color:var(--text-primary)">
        <option value="0" ${page === 0 ? 'selected' : ''}>第 1 页</option>
        <option value="1" ${page === 1 ? 'selected' : ''}>第 2 页</option>
      </select>`;
    row.querySelector('[data-act=show]').addEventListener('change', (e) => {
      const cur = getData(KEYS.appWidgetPositions, {});
      cur[w.id] = { ...(cur[w.id] || {}), hidden: !e.target.checked };
      setData(KEYS.appWidgetPositions, cur);
      bus.emit('desktop:refresh');
      showToast(hidden ? '显示啦' : '藏好啦');
    });
    row.querySelector('[data-act=page]').addEventListener('change', (e) => {
      const cur = getData(KEYS.appWidgetPositions, {});
      cur[w.id] = { ...(cur[w.id] || {}), page: Number(e.target.value) };
      setData(KEYS.appWidgetPositions, cur);
      bus.emit('desktop:refresh');
    });
    list.appendChild(row);
  });
  return card;
}

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
  const systemName = getData(KEYS.systemName, '泡泡');
  card.className = 'card';
  const installable = !!window.popoInstallPrompt;
  card.innerHTML = `<div class="card-title">关于泡泡</div>
    <div class="card-row"><span class="card-row-label">系统名字</span><input class="input" id="about-sysname" value="${escapeAttr(systemName)}" placeholder="泡泡" style="width:130px"></div>
    <div class="card-row"><span class="card-row-label">版本</span><span class="card-row-value">v1.0.0</span></div>
    <div class="card-row"><span class="card-row-label">当前主题</span><span class="card-row-value">${theme?.name || '默认'}</span></div>
    <div class="card-row"><span class="card-row-label">数据存储</span><span class="card-row-value">本地优先</span></div>
    <div class="card-row" id="pwa-install-row" style="${installable ? '' : 'display:none'}"><span class="card-row-label">装到桌面</span><button class="btn primary" id="pwa-install">安装</button></div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-top:12px;line-height:1.6">泡泡是一个温柔的 AI 聊天伴侣桌面系统。她有情绪、有记忆，会撒娇、会闹别扭。所有数据都安安静静待在你的设备上，不会偷偷跑出去。</div>`;
  // 系统名字改了就存起来，并广播一个事件让其他 App 跟着换
  card.querySelector('#about-sysname').addEventListener('change', (e) => {
    const name = e.target.value.trim() || '泡泡';
    setData(KEYS.systemName, name);
    e.target.value = name;
    showToast('名字换好啦，刷新生效');
    bus.emit('system:name-changed', { name });
  });
  const installBtn = card.querySelector('#pwa-install');
  if (installBtn) installBtn.addEventListener('click', async () => {
    const ev = window.popoInstallPrompt;
    if (!ev) { showToast('当前浏览器不支持安装哦', 'error'); return; }
    ev.prompt();
    try { await ev.userChoice; } catch (e) {}
    window.popoInstallPrompt = null;
    card.querySelector('#pwa-install-row').style.display = 'none';
  });
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
