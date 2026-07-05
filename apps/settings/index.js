// apps/settings/index.js
// 设置 App——Phase 1 真实可用版。
// 功能：主题（6 预设 + 导入导出）/ 壁纸 / 锁屏背景 / 锁屏头像 /
//      桌面缩放（图标/Widget/Dock）/ 自定义字体 / 今日提示 /
//      隐藏图标管理 / 数据导出导入 / 关于。
// 依赖：core/theme.js, core/storage.js, core/storage-keys.js, core/util.js,
//      core/storage-manager.js, core/ui.js, core/events.js

import { getPresets, getCurrentThemeId, setTheme, exportTheme, importTheme, applyDesktopScale, applyFontFamily, getCurrentTheme, applyCustomColors, clearCustomColors, getCustomColors, getThemeVar, applyPersonalization } from '../../core/theme.js';
import { STORES, KEYS } from '../../core/storage-keys.js';
import { compressImage, fileToDataURL, getDB, setDB, deleteDB, getData, setData, removeData } from '../../core/storage.js';
import { pickImageFile, isUsableImage, cssUrl, clamp, injectStyle } from '../../core/util.js';
import { exportToFile, importFromFile } from '../../core/storage-manager.js';
import { showToast, showBottomSheet, showConfirm, createIcon, createCollapsibleCard } from '../../core/ui.js';
import bus from '../../core/events.js';
import { get as getConfig } from '../../core/config.js';
// 新增卡片的子模块：拆出来避免 index.js 超过 800 行
import { renderAICard } from './card-ai.js';
import { renderNotifyCard } from './card-notify.js';
import { renderDataMgmtCard } from './card-data.js';
import { renderAppBgCard } from './card-bg.js';
import { renderWidgetBgCard } from './card-widget-bg.js';
import { renderMCPCard } from './card-mcp.js';
import { renderTTSCard } from './card-tts.js';
import { applyAppBg } from '../../core/app-bg.js';

let containerEl = null;
// 当前激活的分组 Tab（外观 / ai / desktop / system），跨 renderSections 保留
let activeTab = 'appearance';

// ════════════════════════════════════════
// 设置页分组样式：顶部胶囊形 Tab 横向滚动 + 分组卡片容器
// ════════════════════════════════════════
injectStyle('popo-settings-sections', `
  .settings-tabs{
    display:flex; gap:8px; padding:10px 14px;
    overflow-x:auto; -webkit-overflow-scrolling:touch;
    background:var(--bg-secondary);
    border-bottom:1px solid color-mix(in srgb, var(--text-hint) 12%, transparent);
    scrollbar-width:none;
  }
  .settings-tabs::-webkit-scrollbar{ display:none; width:0; height:0; }
  .settings-tab{
    flex-shrink:0; padding:8px 18px;
    background:transparent;
    border:1px solid color-mix(in srgb, var(--text-hint) 22%, transparent);
    border-radius:999px;
    color:var(--text-secondary);
    font-size:var(--font-size-base);
    cursor:pointer;
    transition:var(--motion);
    white-space:nowrap;
  }
  .settings-tab.active{
    background:var(--accent);
    border-color:var(--accent);
    color:var(--bubble-user-text);
    box-shadow:var(--shadow-sm);
  }
  .settings-tab:active{ transform:scale(var(--press-scale)); }
  .settings-section{ display:none; }
  .settings-section.active{ display:block; }
`);

// 锁屏密码哈希（与 desktop.js 的 hashPassword 保持一致：SHA-256 + 盐）
// 避免明文存储密码，desktop.js 启动时会迁移旧明文，这里直接写哈希格式
const LOCK_SALT = 'popo-salt-2024';
async function hashPassword(pwd) {
  const data = new TextEncoder().encode(String(pwd) + LOCK_SALT);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// 解析存储的密码：支持 sha256:<长度>:<hex> / 纯 hex / 明文（兼容旧版）
function parseLockStored(raw) {
  if (raw == null) return { hash: null, plain: null, length: 4 };
  if (typeof raw === 'string') {
    const m = /^sha256:(\d+):([0-9a-f]{64})$/.exec(raw);
    if (m) return { hash: m[2], plain: null, length: Number(m[1]) || 4 };
    if (/^[0-9a-f]{64}$/.test(raw)) return { hash: raw, plain: null, length: 4 };
    return { hash: null, plain: raw, length: raw.length };
  }
  return { hash: null, plain: null, length: 4 };
}

export async function mount(container, context) {
  containerEl = container;
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="settings-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">设置</div>
      <span style="width:36px"></span>
    </div>
    <div class="settings-tabs" id="settings-tabs" role="tablist" aria-label="设置分组">
      <button class="settings-tab" data-tab="appearance" role="tab">外观</button>
      <button class="settings-tab" data-tab="ai" role="tab">AI 与陪伴</button>
      <button class="settings-tab" data-tab="desktop" role="tab">桌面与锁屏</button>
      <button class="settings-tab" data-tab="system" role="tab">数据与系统</button>
    </div>
    <div class="app-body" id="settings-body"></div>
  `;
  container.querySelector('#settings-back').addEventListener('click', () => bus.emit('router:home'));
  // 分组 Tab 切换：点击后只显示该分组的卡片
  container.querySelectorAll('.settings-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      applyActiveTab();
    });
  });
  await renderSections();
  // 支持 deepLink 跳转：从其他 App 的 header 齿轮按钮带 tab 进来直接进对应分组
  if (context?.deepLink?.tab) {
    activeTab = context.deepLink.tab;
    applyActiveTab();
  }
  applyAppBg(container, 'settings');
}

/** 应用当前 activeTab：更新 Tab 按钮高亮 + 显示对应分组卡片 */
function applyActiveTab() {
  if (!containerEl) return;
  // Tab 按钮高亮
  containerEl.querySelectorAll('.settings-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
  });
  // 分组卡片显示
  const body = containerEl.querySelector('#settings-body');
  if (body) {
    body.querySelectorAll('.settings-section').forEach((sec) => {
      sec.classList.toggle('active', sec.dataset.section === activeTab);
    });
  }
}

async function renderSections() {
  const body = containerEl.querySelector('#settings-body');
  body.innerHTML = '';

  // ── 外观：主题 / 自定义颜色 / 壁纸 / APP 背景 / 字体 / 桌面缩放 ──
  body.appendChild(wrapCard(await renderThemeCard(), 'appearance'));
  body.appendChild(wrapCard(renderCustomColorsCard(), 'appearance'));
  body.appendChild(wrapCard(renderWallpaperCard(), 'appearance'));
  // APP 背景内容多，默认折叠收纳
  body.appendChild(wrapCollapsible(await renderAppBgCard(), 'appearance'));
  body.appendChild(wrapCard(renderFontCard(), 'appearance'));
  body.appendChild(wrapCard(renderPersonalizeCard(), 'appearance'));
  body.appendChild(wrapCard(renderScaleCard(), 'appearance'));

  // ── AI 与陪伴：AI 配置 / 小工具箱 / 我的声音 / 通知 / 自定义图标 ──
  body.appendChild(wrapCard(renderAICard(), 'ai'));
  body.appendChild(wrapCard(renderMCPCard(), 'ai'));
  body.appendChild(wrapCard(renderTTSCard(), 'ai'));
  body.appendChild(wrapCard(renderNotifyCard(), 'ai'));
  // 自定义图标列表长，默认折叠收纳
  body.appendChild(wrapCollapsible(await renderIconCustomCard(), 'ai'));

  // ── 桌面与锁屏：桌面分页 / Widget 管理 / Widget 皮肤 / 隐藏图标 / 锁屏 / 今日提示 ──
  body.appendChild(wrapCard(renderPagesCard(), 'desktop'));
  body.appendChild(wrapCard(renderWidgetMgmtCard(), 'desktop'));
  // Widget 皮肤内容多，默认折叠收纳
  body.appendChild(wrapCollapsible(renderWidgetBgCard(), 'desktop'));
  // 隐藏图标默认折叠收纳
  body.appendChild(wrapCollapsible(await renderHiddenIconsCard(), 'desktop'));
  body.appendChild(wrapCard(renderLockCard(), 'desktop'));
  body.appendChild(wrapCard(renderFocusCard(), 'desktop'));

  // ── 数据与系统：数据备份 / 数据管理 / 天气 / 关于 ──
  body.appendChild(wrapCard(renderDataCard(), 'system'));
  // 数据管理有危险操作，默认折叠收纳
  body.appendChild(wrapCollapsible(renderDataMgmtCard(), 'system'));
  body.appendChild(wrapCard(renderWeatherCard(), 'system'));
  body.appendChild(wrapCard(renderAboutCard(), 'system'));

  // 应用当前激活的分组
  applyActiveTab();
}

/** 把单个卡片包进一个带 data-section 的容器里，方便分组显隐 */
function wrapCard(cardEl, section) {
  const wrap = document.createElement('div');
  wrap.className = 'settings-section';
  wrap.dataset.section = section;
  wrap.appendChild(cardEl);
  return wrap;
}

/** 把内容较多的卡片包进可折叠容器，默认收起。
 *  从卡片里抠出 .card-title 当折叠头标题，避免标题重复显示。 */
function wrapCollapsible(cardEl, section, collapsed = true) {
  const titleEl = cardEl.querySelector('.card-title');
  const title = titleEl ? titleEl.textContent.trim() : '';
  if (titleEl) titleEl.remove();
  const collapsible = createCollapsibleCard(title, cardEl, { collapsed });
  return wrapCard(collapsible, section);
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
  const lockOpacity = Number(getData(KEYS.appLockWallpaperOpacity, 100));
  card.innerHTML = `<div class="card-title">锁屏</div>
    <div class="card-row"><span class="card-row-label">锁屏背景图</span><button class="btn" id="lock-bg-pick">选一张</button></div>
    <div class="card-row"><span class="card-row-label">用链接设背景</span><button class="btn" id="lock-bg-url">贴链接</button></div>
    <div class="card-row"><span class="card-row-label">锁屏跟桌面同款</span><input type="checkbox" id="lock-use-wp" ${useWp ? 'checked' : ''}></div>
    <div class="card-row"><span class="card-row-label">背景透明度</span><input type="range" id="lock-bg-opacity" min="0" max="100" value="${lockOpacity}" style="width:140px"></div>
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
  // 锁屏壁纸透明度：0 = 完全遮住，100 = 完全显示
  card.querySelector('#lock-bg-opacity').addEventListener('change', (e) => {
    const op = clamp(Number(e.target.value), 0, 100);
    setData(KEYS.appLockWallpaperOpacity, op);
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
    body.querySelector('#pwd-ok').addEventListener('click', async () => {
      const oldP = body.querySelector('#pwd-old').value;
      const newP = body.querySelector('#pwd-new').value;
      const conP = body.querySelector('#pwd-confirm').value;
      if (!/^\d{4,8}$/.test(newP)) { showToast('新密码要 4-8 位数字', 'error'); return; }
      if (newP !== conP) { showToast('两次新密码不一样', 'error'); return; }
      // 校验旧密码：支持哈希格式和明文格式（兼容旧版与 desktop.js 迁移后的状态）
      const parsed = parseLockStored(getData(KEYS.appLockPassword, null));
      let oldMatched = false;
      if (parsed.hash) {
        const oldHash = await hashPassword(oldP);
        oldMatched = (oldHash === parsed.hash);
      } else if (parsed.plain != null) {
        oldMatched = (oldP === parsed.plain);
      }
      if (!oldMatched) { showToast('现在的密码不对哦', 'error'); return; }
      // 写入哈希格式 sha256:<长度>:<hex>，与 desktop.js 一致
      const newHash = await hashPassword(newP);
      setData(KEYS.appLockPassword, `sha256:${newP.length}:${newHash}`);
      document.querySelector('.popo-sheet-close')?.click();
      showToast('密码改好啦，下次用新密码解锁哦', 'success');
    });
  });
  return card;
}

// ════════════════════════════════════════
// 个性化：字号 / 气泡圆角 / 动效强度 / 打字速度
// ════════════════════════════════════════
function renderPersonalizeCard() {
  const card = document.createElement('div');
  card.className = 'card';
  const fontScale = Number(getData(KEYS.appFontScale, 1));
  const bubbleRadius = Number(getData(KEYS.appBubbleRadius, 1));
  const motionLevel = getData(KEYS.appMotionLevel, 'full');
  const typingSpeed = Number(getData(KEYS.appTypingSpeed, 1));
  card.innerHTML = `
    <div class="card-title">个性化</div>
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:10px;line-height:1.5">
      字号、气泡圆角、动效、打字速度，慢慢调出最舒服的样子
    </div>
    <div class="card-row">
      <span class="card-row-label">字号大小</span>
      <div style="display:flex;align-items:center;gap:8px;flex:1;max-width:180px">
        <input type="range" id="pers-font-scale" min="0.85" max="1.25" step="0.05" value="${fontScale}" style="flex:1">
        <span style="min-width:36px;text-align:right;color:var(--text-secondary);font-size:var(--font-size-small)" id="pers-font-scale-val">${fontScale.toFixed(2)}</span>
      </div>
    </div>
    <div class="card-row">
      <span class="card-row-label">气泡圆角</span>
      <div style="display:flex;align-items:center;gap:8px;flex:1;max-width:180px">
        <input type="range" id="pers-bubble-radius" min="0.5" max="1.8" step="0.1" value="${bubbleRadius}" style="flex:1">
        <span style="min-width:36px;text-align:right;color:var(--text-secondary);font-size:var(--font-size-small)" id="pers-bubble-radius-val">${bubbleRadius.toFixed(1)}</span>
      </div>
    </div>
    <div class="card-row">
      <span class="card-row-label">动效强度</span>
      <select id="pers-motion" style="padding:6px 10px;border-radius:var(--radius-sm);background:var(--bg-secondary);color:var(--text-primary)">
        <option value="full" ${motionLevel === 'full' ? 'selected' : ''}>完整（默认）</option>
        <option value="reduced" ${motionLevel === 'reduced' ? 'selected' : ''}>减弱（更安静）</option>
        <option value="none" ${motionLevel === 'none' ? 'selected' : ''}>关闭（最省电）</option>
      </select>
    </div>
    <div class="card-row">
      <span class="card-row-label">本地打字速度</span>
      <div style="display:flex;align-items:center;gap:8px;flex:1;max-width:180px">
        <input type="range" id="pers-typing" min="0.5" max="4" step="0.5" value="${typingSpeed}" style="flex:1">
        <span style="min-width:36px;text-align:right;color:var(--text-secondary);font-size:var(--font-size-small)" id="pers-typing-val">${typingSpeed.toFixed(1)}</span>
      </div>
    </div>
    <button class="btn ghost block" id="pers-reset" style="margin-top:10px">还原默认</button>
  `;

  // 字号缩放 / 气泡圆角 / 动效强度都走 theme.js 的 applyPersonalization()：
  // 它会读 localStorage 里的值并覆盖 CSS 变量，且能正确处理主题切换（清缓存重应用）。
  // 这里只负责把滑块值存起来，再调 applyPersonalization 让它生效。

  // 滑块实时回填
  const fontInput = card.querySelector('#pers-font-scale');
  const fontVal = card.querySelector('#pers-font-scale-val');
  fontInput.addEventListener('input', () => { fontVal.textContent = Number(fontInput.value).toFixed(2); });
  fontInput.addEventListener('change', () => {
    setData(KEYS.appFontScale, Number(fontInput.value));
    applyPersonalization();
  });

  const bubbleInput = card.querySelector('#pers-bubble-radius');
  const bubbleVal = card.querySelector('#pers-bubble-radius-val');
  bubbleInput.addEventListener('input', () => { bubbleVal.textContent = Number(bubbleInput.value).toFixed(1); });
  bubbleInput.addEventListener('change', () => {
    setData(KEYS.appBubbleRadius, Number(bubbleInput.value));
    applyPersonalization();
  });

  const motionSel = card.querySelector('#pers-motion');
  motionSel.addEventListener('change', () => {
    setData(KEYS.appMotionLevel, motionSel.value);
    applyPersonalization();
    showToast(motionSel.value === 'none' ? '动效关掉啦' : motionSel.value === 'reduced' ? '动效减弱啦' : '动效恢复啦', 'default', 1200);
  });

  const typingInput = card.querySelector('#pers-typing');
  const typingVal = card.querySelector('#pers-typing-val');
  typingInput.addEventListener('input', () => { typingVal.textContent = Number(typingInput.value).toFixed(1); });
  typingInput.addEventListener('change', () => {
    setData(KEYS.appTypingSpeed, Number(typingInput.value));
  });

  card.querySelector('#pers-reset').addEventListener('click', () => {
    setData(KEYS.appFontScale, 1);
    setData(KEYS.appBubbleRadius, 1);
    setData(KEYS.appMotionLevel, 'full');
    setData(KEYS.appTypingSpeed, 1);
    applyPersonalization();
    fontInput.value = '1'; fontVal.textContent = '1.00';
    bubbleInput.value = '1'; bubbleVal.textContent = '1.0';
    motionSel.value = 'full';
    typingInput.value = '1'; typingVal.textContent = '1.0';
    showToast('还原好啦', 'default', 1200);
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
  { key: '--bg-secondary', label: '次要背景' },
  { key: '--text-primary', label: '主文字' },
  { key: '--text-secondary', label: '次文字' },
  { key: '--text-hint', label: '提示文字' },
  { key: '--bubble-ai-bg', label: 'TA的气泡' },
  { key: '--bubble-ai-text', label: 'TA的气泡文字' },
  { key: '--bubble-user-bg', label: '我的气泡' },
  { key: '--bubble-user-text', label: '我的气泡文字' },
  { key: '--success', label: '成功色' },
  { key: '--warning', label: '警告色' },
  { key: '--danger', label: '危险色' }
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
