// desktop.js
// 桌面壳逻辑：启动 / 锁屏 / 桌面渲染 / 5 个预设 widget /
// 图标拖拽（长按编辑 + 网格重排 + 删除）/ Dock 重排 / 壁纸 / 徽章。
// 所有视觉值走 CSS 变量（style.css + theme.js），所有魔法数字走 config.js。
// 依赖：core/* + apps-registry.js

import { initDB, ensureDefaultSettings, getData, setData, getDB } from './core/storage.js';
import { STORES, KEYS } from './core/storage-keys.js';
import { loadTheme, applyFontFamily, applyDesktopScale, restoreCustomColors, applyPersonalization, clearPersonalizeCache } from './core/theme.js';
import { createIcon, showToast, showConfirm, showBottomSheet } from './core/ui.js';
import { clamp, debounce, throttle, cssUrl, isUsableImage, injectStyle } from './core/util.js';
import { get as getConfig } from './core/config.js';
import bus from './core/events.js';
import { openApp, goHome } from './core/router.js';
import { seedDefaultCharacter, getDefaultCharacter } from './core/seed.js';
import { initInbox } from './core/inbox.js';
import { DEFAULT_LOCK_PASSWORD, LOCK_MAX_FAILS, LOCK_LOCKOUT_MS, hashPassword, parseLockStored, formatLockStored } from './core/lock.js';
// 注意：不静态 import apps/countdown，避免桌面壳与 App 强耦合。
// 倒计时 widget 用动态 import 懒加载 getUpcomingCountdown（与 registry loader 同模式）。

// ════════════════════════════════════════
// DOM 引用
// ════════════════════════════════════════
const $ = (id) => document.getElementById(id);
const bootEl = $('boot-screen');
const lockScreenEl = $('lock-screen');
const lockAvatarEl = $('lock-avatar');
const lockTitleEl = $('lock-title');
const lockHintEl = $('lock-hint');
const lockDotsEl = $('lock-dots');
const lockErrorEl = $('lock-error');
const lockPadEl = $('lock-keypad');
const desktopEl = $('desktop');
const pagesEl = $('desktop-pages');
const dockEl = $('dock');
const pageDotsEl = $('page-dots');
const statusCapsuleEl = $('status-capsule');

// ════════════════════════════════════════
// 状态
// ════════════════════════════════════════
let currentPage = 0;
let editing = false;
let justDragged = false; // 拖拽刚结束标记，防止后续 click 误触退出编辑态
let lockInput = '';
let clockTimer = null;
let weatherTimer = null;
let countdownTimer = null;
let currentCharacter = null;

// 锁屏密码安全常量从 core/lock.js 统一导入（DEFAULT_LOCK_PASSWORD /
// LOCK_MAX_FAILS / LOCK_LOCKOUT_MS / hashPassword / parseLockStored / formatLockStored）
let lockFailCount = 0;
let lockLockoutUntil = 0;
let lockLockoutTicker = null;

// 锁屏失败锁定状态持久化（刷新不绕过）。存 KEYS.appLockFailState: { count, until }
function loadLockFailState() {
  const v = getData(KEYS.appLockFailState, null);
  if (!v || typeof v !== 'object') return { count: 0, until: 0 };
  return { count: Number(v.count) || 0, until: Number(v.until) || 0 };
}
function saveLockFailState() {
  setData(KEYS.appLockFailState, { count: lockFailCount, until: lockLockoutUntil });
}
// 启动时恢复锁定状态：仍在锁定期内则继续倒计时
function restoreLockFailState() {
  const s = loadLockFailState();
  lockFailCount = s.count;
  lockLockoutUntil = s.until;
  if (isLockLockedOut()) {
    if (lockLockoutTicker) clearInterval(lockLockoutTicker);
    lockLockoutTicker = setInterval(updateLockCountdown, 500);
    updateLockCountdown();
  }
}

// 状态栏图标（8 个，纯装饰 + 时间）
const STATUS_ICONS = ['heart', 'sun', 'weather', 'music', 'star', 'calendar', 'moon', 'bell'];

// 5 个预设 widget 定义
const WIDGET_DEFS = [
  { id: 'time', type: 'time', shape: 'wide', page: 0 },
  { id: 'weather', type: 'weather', shape: 'square', page: 0 },
  { id: 'anniversary', type: 'anniversary', shape: 'square', page: 0 },
  { id: 'focus', type: 'focus', shape: 'wide', page: 0 },
  { id: 'countdown', type: 'countdown', shape: 'square', page: 1 },
  { id: 'vinyl', type: 'vinyl', shape: 'wide', page: 1 }
];

// 用户布局覆盖：{ widgetId: { page, hidden, order } }
function getWidgetLayout() {
  const v = getData(KEYS.appWidgetPositions, null);
  return (v && typeof v === 'object') ? v : {};
}
function saveWidgetLayout(layout) { setData(KEYS.appWidgetPositions, layout || {}); }
function getActiveWidgets() {
  const layout = getWidgetLayout();
  return WIDGET_DEFS
    .map((w) => {
      const o = layout[w.id];
      if (o && o.hidden) return null;
      return { ...w, page: o?.page ?? w.page, order: o?.order ?? 999 };
    })
    .filter(Boolean)
    .sort((a, b) => (a.order - b.order) || (a.page - b.page));
}

// ════════════════════════════════════════
// 编辑模式样式注入（jitter 抖动 / 拖拽 ghost 浮起 / 落点占位符 / 编辑提示条）
// 所有颜色走 CSS 变量，动效 cubic-bezier(0.34, 1.56, 0.64, 1)
// ════════════════════════════════════════
injectStyle('desktop-editing-styles', `
/* 编辑模式抖动：所有图标 + widget 轻微旋转 + 缩放呼吸（iOS 风格 jitter） */
@keyframes popoJitter {
  0%, 100% { transform: rotate(-1.4deg) scale(0.96); }
  25% { transform: rotate(1.6deg) scale(0.965); }
  50% { transform: rotate(-1.1deg) scale(0.96); }
  75% { transform: rotate(1.4deg) scale(0.965); }
}
.desktop.editing-mode .desktop-icon,
.desktop.editing-mode .dock-icon,
.desktop.editing-mode .widget {
  animation: popoJitter 0.5s ease-in-out infinite;
  animation-delay: calc(var(--jit, 0) * -0.06s);
  cursor: grab;
}
/* 编辑态下取消图标 img 自身的 wiggle，避免与父级 jitter 叠加 */
.desktop.editing-mode .desktop-icon.editing .desktop-icon-img { animation: none; }
/* 编辑态下取消时间 widget 的常驻浮动，交给 jitter 统一 */
.desktop.editing-mode .widget-time { animation: none; }

/* 拖拽 ghost：浮起 + 阴影 + 轻微旋转 + 半透明，用 transform 定位避免重排 */
.drag-ghost {
  position: fixed !important;
  left: 0; top: 0;
  margin: 0 !important;
  z-index: 9999;
  pointer-events: none;
  opacity: 0.92;
  will-change: transform;
  transition: none !important;
  box-shadow: var(--shadow-lg);
}
.drag-ghost.icon-ghost { transform-origin: center; }

/* 落点占位符：虚线圆角框，主题色 */
.drop-placeholder {
  width: var(--icon-size);
  height: calc(var(--icon-size) + 22px);
  border: 2px dashed var(--accent);
  border-radius: var(--radius-icon);
  background: color-mix(in srgb, var(--accent-light) 40%, transparent);
  pointer-events: none;
  animation: softPulse 1.4s ease-in-out infinite;
  justify-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
}
.drop-placeholder.widget-placeholder {
  width: 100%;
  height: 80px;
  border-radius: var(--radius-card);
}

/* 编辑态顶部提示条 */
.editing-banner {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 52px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 8px 7px 16px;
  border-radius: var(--radius-full);
  background: color-mix(in srgb, var(--bg-card) 92%, transparent);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  box-shadow: var(--shadow-md);
  border: 1px solid color-mix(in srgb, var(--accent-light) 60%, transparent);
  color: var(--text-primary);
  font-size: var(--font-size-small);
  white-space: nowrap;
  animation: bannerIn 280ms cubic-bezier(0.34, 1.56, 0.64, 1);
}
.editing-banner-text { line-height: 1.2; }
.editing-banner-close {
  width: 24px; height: 24px;
  border-radius: 50%;
  background: var(--accent);
  color: var(--bubble-user-text);
  display: flex; align-items: center; justify-content: center;
  box-shadow: var(--shadow-sm);
  transition: var(--motion);
  flex-shrink: 0;
}
.editing-banner-close:active { transform: scale(var(--press-scale)); }
.editing-banner-close svg { width: 14px; height: 14px; }
@keyframes bannerIn {
  from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}
`);

// ════════════════════════════════════════
// 图标分页覆盖：registry 冻结，用 localStorage 覆盖 app.page 实现跨页拖拽
// key 存 KEYS.appIconPageOverrides（已注册到 storage-keys.js 集中管理）
// ════════════════════════════════════════
function getIconPageOverrides() {
  const v = getData(KEYS.appIconPageOverrides, null);
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}
function saveIconPageOverrides(map) { setData(KEYS.appIconPageOverrides, map || {}); }
function getAppPage(app) {
  const overrides = getIconPageOverrides();
  if (Object.prototype.hasOwnProperty.call(overrides, app.id)) {
    return Number(overrides[app.id]) || 0;
  }
  return Number(app.page || 0);
}

// ════════════════════════════════════════
// 启动
// ════════════════════════════════════════
async function boot() {
  try {
    await initDB();
    ensureDefaultSettings();
    loadTheme();
    restoreCustomColors();
    applyPersonalization(); // 应用保存的字号缩放/气泡圆角/动效强度覆盖
    applyDesktopScaleFromConfig();
    await applyCustomFont();
    await seedDefaultCharacter();
    currentCharacter = await getDefaultCharacter();
    await ensureLockPasswordHashed(); // 密码哈希迁移（明文 -> 哈希）
    restoreLockFailState();           // 恢复锁屏失败锁定状态（刷新不绕过）
    renderLockDots();
    rebuildDesktopPages();
    await renderAll();
    bindEvents();
    initWidgets();
    await applyAllImages();
    refreshLockScreen();
    refreshBadges();
    subscribeBus();
    initInbox();
    setupPwaInstallPrompt();
  } catch (e) {
    console.error('[boot]', e);
    showToast('哎呀，启动出了点问题', 'error');
  } finally {
    // 等 renderAll 真正完成后再隐藏 boot 屏，避免慢设备白屏
    requestAnimationFrame(() => {
      bootEl.classList.add('hide');
      setTimeout(() => bootEl.remove(), 280);
    });
  }
}

function applyDesktopScaleFromConfig() {
  const iconScale = Number(getData(KEYS.appDesktopScale, 1)) || 1;
  const widgetScale = Number(getData(KEYS.appWidgetScale, 1)) || 1;
  const dockScale = Number(getData(KEYS.appDockScale, 1)) || 1;
  applyDesktopScale(iconScale, widgetScale, dockScale);
}

async function applyCustomFont() {
  try {
    const record = await getDB(STORES.blobs, KEYS.appCustomFontBlob);
    const dataUrl = record?.value || record?.source || record?.data || '';
    const family = getData(KEYS.appFontFamily, '');
    if (dataUrl) applyFontFamily(family || "'PopoCustom'", dataUrl);
    else if (family) applyFontFamily(family);
  } catch (e) {
    console.warn('[boot] 自定义字体应用失败', e);
  }
}

// ════════════════════════════════════════
// 渲染
// ════════════════════════════════════════
async function renderAll() {
  renderStatusBar();
  await renderDock();          // 修复：原版未 await，图标自定义图片应用竞态
  await renderWidgets();
  await renderIconGrids();     // 修复：原版未 await，跨页图标顺序应用竞态
  updateEditingClass();
  updatePageDots();
}

function renderStatusBar() {
  statusCapsuleEl.innerHTML = '';
  STATUS_ICONS.forEach((name, i) => {
    const wrap = document.createElement('span');
    wrap.className = 'status-bar-icon';
    wrap.setAttribute('aria-label', name);
    wrap.appendChild(createIcon(name, 18));
    wrap.addEventListener('click', () => onStatusBarIconClick(name));
    // 第 4 个位置后面插时间
    statusCapsuleEl.appendChild(wrap);
    if (i === 3) {
      const t = document.createElement('span');
      t.className = 'status-bar-time';
      t.id = 'status-time';
      statusCapsuleEl.appendChild(t);
    }
  });
  updateStatusTime();
}

// 状态栏图标点击：跳转对应 App 或给提示
const STATUS_ICON_TARGET = {
  heart: 'moments', sun: 'weather', weather: 'weather', music: 'music',
  star: 'collections', calendar: 'memo', moon: 'dream', bell: 'moments'
};
function onStatusBarIconClick(name) {
  const target = STATUS_ICON_TARGET[name];
  if (!target) { showToast('这个还没准备好哦'); return; }
  const reg = getRegistrySync();
  const exists = reg?.APPS.some((a) => a.id === target);
  if (exists) openApp(target);
  else showToast('对应的小应用还在路上～', 'default', 1600);
}

function updateStatusTime() {
  const el = $('status-time');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

async function getRegistry() {
  try {
    const mod = await import('./apps-registry.js');
    registryCache = mod; // 缓存，供同步路径使用
    return mod;
  }
  catch (e) { console.warn('[desktop] 注册表加载失败', e); return { APPS: [] }; }
}

let registryCache = null;
function getRegistrySync() {
  return registryCache || { APPS: [] };
}

// Dock 归属覆盖：用户在 Dock / 桌面间移动图标后，覆盖 registry 的 dock 字段（不修改冻结的 registry）
function getDockOverrides() {
  const v = getData(KEYS.appDockOverrides, null);
  return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {};
}
function saveDockOverrides(map) { setData(KEYS.appDockOverrides, map || {}); }
function isDockApp(app) {
  const overrides = getDockOverrides();
  if (Object.prototype.hasOwnProperty.call(overrides, app.id)) return !!overrides[app.id];
  return !!app.dock;
}

function getDockOrder(reg) {
  const r = reg || getRegistrySync();
  const dockIds = r.APPS.filter((a) => isDockApp(a)).map((a) => a.id);
  const saved = getData(KEYS.appDockOrder, null);
  const ordered = Array.isArray(saved) ? saved.filter((id) => dockIds.includes(id)) : [];
  const missing = dockIds.filter((id) => !ordered.includes(id));
  return [...ordered, ...missing];
}

function getHiddenIcons() { return getData(KEYS.appHiddenIcons, []); }
function saveHiddenIcons(arr) { setData(KEYS.appHiddenIcons, [...new Set(arr)]); }

async function renderDock() {
  const reg = await getRegistry();
  dockEl.innerHTML = '';
  let order = getDockOrder(reg);
  const maxDock = getConfig('ui.dockMax', 4);
  // 超员保护：若 dock 数量超过上限（老用户叠加旧 override / registry 扩容），
  // 把尾部多出的 app 退回桌面网格，避免 dock 挤爆。
  if (order.length > maxDock) {
    const overflow = order.slice(maxDock);
    const overrides = getDockOverrides();
    overflow.forEach((id) => { overrides[id] = false; });
    saveDockOverrides(overrides);
    order = order.slice(0, maxDock);
    // 退回桌面的 app 默认放 page 0
    const pageOv = getIconPageOverrides();
    overflow.forEach((id) => { if (pageOv[id] === undefined) pageOv[id] = 0; });
    saveIconPageOverrides(pageOv);
    try { renderIconGrids(); } catch (e) {}
  }
  order.forEach((appId) => {
    const app = reg.APPS.find((a) => a.id === appId && isDockApp(a));
    if (app) dockEl.appendChild(createDockIcon(app));
  });
}

function createDockIcon(app) {
  const el = document.createElement('button');
  el.className = 'dock-icon';
  el.type = 'button';
  el.dataset.appId = app.id;
  el.setAttribute('aria-label', app.name);
  const img = document.createElement('span');
  img.className = 'desktop-icon-img';
  // 底色由 CSS 统一柔和磨砂底控制（accent-light 系，同色系软萌），
  // 不再用 registry.iconColor 硬色覆盖——避免 20+ 图标 20+ 种颜色花花绿绿。
  // iconColor 字段保留在 registry 不动，不破坏数据。
  img.appendChild(createIcon(app.icon, 26));
  const label = document.createElement('span');
  label.className = 'dock-icon-label';
  label.textContent = app.name;
  el.append(img, label);
  el.addEventListener('click', () => { if (!editing) openApp(app.id); });
  el.addEventListener('pointerdown', (e) => handleIconPointerDown(e, el));
  return el;
}

async function renderWidgets() {
  document.querySelectorAll('[data-widget-area]').forEach((area) => area.innerHTML = '');
  for (const w of getActiveWidgets()) {
    const area = document.querySelector(`[data-widget-area="${w.page}"]`);
    if (!area) continue;
    const el = await createWidget(w);
    area.appendChild(el);
    el.addEventListener('pointerdown', (e) => handleWidgetPointerDown(e, el, w));
  }
}

async function createWidget(w) {
  const el = document.createElement('section');
  el.className = `widget widget-${w.type}` + (w.shape === 'wide' ? ' wide' : '');
  el.dataset.widgetId = w.id;
  el.setAttribute('aria-label', w.type);

  if (w.type === 'time') {
    el.innerHTML = `<div><div class="widget-title">现在</div><div class="widget-value" id="w-time">--:--</div><div class="widget-sub" id="w-date">正在准备桌面</div></div>`;
  } else if (w.type === 'weather') {
    el.innerHTML = `<div class="widget-title">天气</div><div class="widget-value" id="w-weather">看看外面天气如何</div>`;
  } else if (w.type === 'anniversary') {
    el.innerHTML = `<div class="widget-title">纪念日</div><div class="widget-value" id="w-anniversary">还没有纪念日呢</div>`;
    // 修复：原版未判断 editing，编辑态下点 widget 会误触弹出添加纪念日面板。补 !editing 判断。
    el.addEventListener('click', () => { if (!editing) addAnniversaryPrompt(); });
  } else if (w.type === 'focus') {
    const focus = getData(KEYS.appFocusWidget, { title: '今天也要好好休息', text: '打开设置，看看我能帮你做什么' });
    el.innerHTML = `<div class="widget-title">今日提示</div><div class="widget-value" id="w-focus-title">${escapeHtml(focus.title || '今天也要好好休息')}</div><div class="widget-sub" id="w-focus-text">${escapeHtml(focus.text || '')}</div>`;
  } else if (w.type === 'countdown') {
    el.innerHTML = `<div class="widget-title">最近的日子</div><div class="widget-value" id="w-countdown-title">还没有倒计时呢</div><div class="widget-sub" id="w-countdown-days">加一个重要日子嘛</div>`;
    el.addEventListener('click', () => { if (!editing) openApp('countdown'); });
  } else if (w.type === 'vinyl') {
    el.innerHTML = `
      <div class="widget-vinyl">
        <div class="widget-vinyl-disc" id="w-vinyl-disc"></div>
        <div class="widget-vinyl-info">
          <div class="widget-vinyl-title" id="w-vinyl-title">还没有歌曲呢</div>
          <div class="widget-vinyl-artist" id="w-vinyl-artist">点这里挑一首本地歌</div>
          <div class="widget-vinyl-controls">
            <button type="button" id="w-vinyl-prev" aria-label="上一首">${createIcon('prev', 14).outerHTML}</button>
            <button type="button" id="w-vinyl-play" aria-label="播放">${createIcon('play', 14).outerHTML}</button>
            <button type="button" id="w-vinyl-next" aria-label="下一首">${createIcon('next', 14).outerHTML}</button>
          </div>
        </div>
      </div>`;
    el.querySelector('#w-vinyl-disc').addEventListener('click', (e) => { e.stopPropagation(); pickLocalSong(); });
    el.querySelector('#w-vinyl-title').addEventListener('click', (e) => { e.stopPropagation(); pickLocalSong(); });
    el.querySelector('#w-vinyl-play').addEventListener('click', (e) => { e.stopPropagation(); toggleVinylPlay(); });
    el.querySelector('#w-vinyl-prev').addEventListener('click', (e) => { e.stopPropagation(); playVinylAt(vinylIndex - 1); });
    el.querySelector('#w-vinyl-next').addEventListener('click', (e) => { e.stopPropagation(); playVinylAt(vinylIndex + 1); });
  }
  // 应用 Widget 自定义皮肤（背景图 + 透明度，存 localStorage KEYS.appWidgetBackgrounds）
  const widgetBgs = getData(KEYS.appWidgetBackgrounds, {});
  const wbg = widgetBgs[w.id];
  if (wbg && wbg.url && isUsableImage(wbg.url)) {
    el.classList.add('has-bg');
    el.style.setProperty('--widget-bg-url', cssUrl(wbg.url));
    el.style.setProperty('--widget-bg-opacity', String(clamp(Number(wbg.opacity ?? 60), 0, 100) / 100));
  }
  // 编辑态删除角标
  const del = document.createElement('span');
  del.className = 'widget-del';
  del.appendChild(createIcon('close', 12));
  del.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!editing) return;
    showConfirm({
      title: '把这个 widget 藏起来吗？', body: '藏起来后可以在设置里找回哦',
      confirmText: '藏起来', cancelText: '不要',
      onConfirm: () => { setWidgetHidden(w.id, true); renderWidgets().then(() => { updateClock(); updateWeather(); updateAnniversaryWidget(); updateCountdownWidget(); updateVinylWidget(); }); showToast('藏好啦'); }
    });
  });
  el.appendChild(del);
  return el;
}

async function renderIconGrids() {
  const reg = await getRegistry();
  const hidden = getHiddenIcons();
  document.querySelectorAll('[data-icon-grid]').forEach((g) => g.innerHTML = '');
  const apps = reg.APPS.filter((a) => !isDockApp(a) && !hidden.includes(a.id));
  // 按页面分组，按保存的顺序渲染（未在保存顺序中的 app 追加到末尾，按注册顺序）
  // 使用 getAppPage 读取分页覆盖（支持跨页拖拽后持久化）
  const byPage = {};
  apps.forEach((app) => {
    const p = String(getAppPage(app));
    (byPage[p] = byPage[p] || []).push(app);
  });
  Object.keys(byPage).forEach((page) => {
    const grid = document.querySelector(`[data-icon-grid="${page}"]`);
    if (!grid) return;
    const saved = getData(KEYS.appIconOrder(page), []);
    let ordered;
    if (Array.isArray(saved) && saved.length) {
      const map = {};
      byPage[page].forEach((a) => { map[a.id] = a; });
      ordered = [];
      saved.forEach((id) => { if (map[id]) { ordered.push(map[id]); delete map[id]; } });
      byPage[page].forEach((a) => { if (map[a.id]) ordered.push(a); });
    } else {
      ordered = byPage[page];
    }
    ordered.forEach((app) => grid.appendChild(createDesktopIcon(app)));
  });
}

function createDesktopIcon(app) {
  const el = document.createElement('button');
  el.className = 'desktop-icon';
  el.type = 'button';
  el.dataset.appId = app.id;
  el.setAttribute('aria-label', app.name);

  const img = document.createElement('span');
  img.className = 'desktop-icon-img';
  // 底色由 CSS 统一柔和磨砂底控制（accent-light 系，同色系软萌），
  // 不再用 registry.iconColor 硬色覆盖——避免 20+ 图标 20+ 种颜色花花绿绿。
  // iconColor 字段保留在 registry 不动，不破坏数据。
  img.appendChild(createIcon(app.icon, 30));

  const label = document.createElement('span');
  label.className = 'desktop-icon-label';
  label.textContent = app.name;

  const del = document.createElement('span');
  del.className = 'icon-delete';
  del.appendChild(createIcon('close', 12));

  const badge = document.createElement('span');
  badge.className = 'icon-badge';
  badge.dataset.badge = app.id;
  badge.style.display = 'none';

  el.append(img, label, del, badge);

  del.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (!editing) return;
    hideIcon(app.id);
  });
  el.addEventListener('click', () => { if (!editing) openApp(app.id); });
  el.addEventListener('pointerdown', (e) => handleIconPointerDown(e, el));
  return el;
}

function hideIcon(appId) {
  showConfirm({
    title: '真的要藏起来吗？',
    body: '藏起来后可以在设置里找回哦',
    confirmText: '藏起来',
    cancelText: '不要',
    onConfirm: () => {
      const hidden = getHiddenIcons();
      hidden.push(appId);
      saveHiddenIcons(hidden);
      renderIconGrids();
      showToast('藏好啦，去设置里找找');
    }
  });
}

// ════════════════════════════════════════
// 图标拖拽（长按进入编辑态，桌面网格/dock 之间互相拖拽重排）
// 编辑模式下支持：自由落点预览 / 跨页拖拽 / 同页交换 / Dock↔桌面互移
// ════════════════════════════════════════
function handleIconPointerDown(event, element) {
  if (event.button !== undefined && event.button !== 0) return;
  const pressMs = getConfig('ui.iconEditPressMs', 620);
  const startX = event.clientX, startY = event.clientY;
  let pressTimer = setTimeout(() => {
    // 修复：原版编辑态下长按另一个图标会重复弹 toast。只在首次进入编辑态时提示。
    if (!moved) { const wasEditing = editing; enterEditingMode(); if (!wasEditing) showToast('长按拖动可以调整位置哦'); }
  }, pressMs);
  let moved = false;
  let dragGhost = null;
  let originGrid = null;
  let ghostOffsetX = 0, ghostOffsetY = 0;
  const isDockIcon = element.classList.contains('dock-icon');

  const onMove = (e) => {
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    if (!moved) {
      moved = true;
      clearTimeout(pressTimer);
      enterEditingMode();
      originGrid = element.parentElement;
      // 拖拽 ghost：clone 元素，浮起 + 阴影 + 旋转 + 半透明
      const rect = element.getBoundingClientRect();
      ghostOffsetX = rect.width / 2;
      ghostOffsetY = rect.height / 2;
      dragGhost = element.cloneNode(true);
      dragGhost.classList.add('drag-ghost', 'icon-ghost');
      dragGhost.style.position = 'fixed';
      dragGhost.style.left = '0px';
      dragGhost.style.top = '0px';
      document.body.appendChild(dragGhost);
      // 原元素半透明 + 关闭指针事件（让 elementFromPoint 跳过它）
      element.style.opacity = '0.25';
      element.style.pointerEvents = 'none';
      startEdgeAutoFlip();
    }
    e.preventDefault();
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    // 用 transform 移动 ghost，避免重排（scale 1.08 + 旋转 -2deg 浮起效果）
    if (dragGhost) {
      dragGhost.style.transform = `translate3d(${e.clientX - ghostOffsetX}px, ${e.clientY - ghostOffsetY}px, 0) scale(1.08) rotate(-2deg)`;
    }
    // 更新落点预览（高亮目标图标或显示占位符）
    updateIconDropPreview(e.clientX, e.clientY, element, originGrid, isDockIcon);
  };

  const onUp = (e) => {
    clearTimeout(pressTimer);
    stopEdgeAutoFlip();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    clearDropPreview();
    if (dragGhost) dragGhost.remove();
    element.style.opacity = '';
    element.style.pointerEvents = '';
    if (!moved) return;
    // 标记刚拖拽完，防止后续 click 误触退出编辑态
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 120);
    // 落点判定
    handleIconDrop(e.clientX, e.clientY, element, originGrid, isDockIcon);
  };

  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });
}

// 落点预览：高亮目标图标（交换/重排）或在空网格显示占位符
function updateIconDropPreview(x, y, dragEl, originGrid, isDockIcon) {
  clearDropPreview();
  const overEl = document.elementFromPoint(x, y);
  if (!overEl) return;
  const sel = isDockIcon ? '.dock-icon[data-app-id]' : '.desktop-icon[data-app-id]';
  const target = overEl.closest(sel);
  if (target && target !== dragEl) {
    // 高亮目标图标（同页交换 / 跨页交换 / Dock↔桌面）
    target.classList.add('drop-target');
    return;
  }
  // 空白网格区域：显示占位符（仅桌面图标拖到桌面网格时）
  if (!isDockIcon) {
    const grid = overEl.closest('[data-icon-grid]');
    if (grid && grid !== originGrid) {
      showDropPlaceholderInGrid(grid);
    }
  }
}

// 落点处理：交换 / 跨页移动 / Dock↔桌面互移
function handleIconDrop(x, y, dragEl, originGrid, isDockIcon) {
  const overEl = document.elementFromPoint(x, y);
  if (!overEl) return;
  // 修复：原版 sel 根据"被拖元素"类型选，导致跨类型目标永远匹配不到（Dock→桌面 / 桌面→Dock 两个分支是死代码）。
  // 改成同时匹配 dock-icon 和 desktop-icon，让四个分支都能正常进入。
  const target = overEl.closest('.dock-icon[data-app-id], .desktop-icon[data-app-id]');

  if (target && target !== dragEl) {
    // 落在另一个图标上：交换
    if (target.parentElement === originGrid) {
      // 同 grid 内交换（dock 内互换 / 桌面同页互换）
      swapIconsInGrid(originGrid, dragEl, target);
      if (isDockIcon) saveDockOrder(originGrid); else saveIconOrder(originGrid);
      showToast('位置换好啦', 'success');
    } else if (!isDockIcon && target.classList.contains('desktop-icon')) {
      // 桌面图标拖到桌面图标上（跨页交换）
      const targetGrid = target.parentElement;
      swapIconsCrossGrid(dragEl, target);
      saveIconOrder(originGrid);
      saveIconOrder(targetGrid);
      showToast('换好啦', 'success');
    } else if (isDockIcon && target.classList.contains('desktop-icon')) {
      // Dock 图标拖到桌面图标上：移到该页桌面
      moveToDesktop(dragEl, target.parentElement);
    } else if (!isDockIcon && target.classList.contains('dock-icon')) {
      // 桌面图标拖到 Dock 图标上：移到 Dock
      moveToDock(dragEl);
    }
    return;
  }

  // 落在空白区域
  const overDock = overEl.closest('.dock');
  const overGrid = overEl.closest('[data-icon-grid]');
  if (isDockIcon && overGrid && overGrid !== originGrid) {
    // Dock → 桌面（指定页）
    moveToDesktop(dragEl, overGrid);
  } else if (!isDockIcon && overDock) {
    // 桌面 → Dock
    moveToDock(dragEl);
  } else if (!isDockIcon && overGrid && overGrid !== originGrid) {
    // 跨页移动到另一页桌面
    moveIconToPage(dragEl, overGrid);
  }
}

// 同 grid 内交换两个图标位置
function swapIconsInGrid(grid, elA, elB) {
  const aNext = elA.nextSibling;
  const bNext = elB.nextSibling;
  if (aNext === elB) {
    grid.insertBefore(elB, elA);
  } else if (bNext === elA) {
    grid.insertBefore(elA, elB);
  } else {
    grid.insertBefore(elB, aNext);
    grid.insertBefore(elA, bNext);
  }
}

// 跨 grid 交换两个图标位置（同时更新 page 覆盖）
function swapIconsCrossGrid(elA, elB) {
  const gridA = elA.parentElement;
  const gridB = elB.parentElement;
  const pageA = Number(gridA.dataset.iconGrid) || 0;
  const pageB = Number(gridB.dataset.iconGrid) || 0;
  const appA = elA.dataset.appId;
  const appB = elB.dataset.appId;
  // 更新 page 覆盖
  const overrides = getIconPageOverrides();
  overrides[appA] = pageB;
  overrides[appB] = pageA;
  saveIconPageOverrides(overrides);
  // 交换 DOM
  const aNext = elA.nextSibling;
  const bNext = elB.nextSibling;
  gridA.insertBefore(elB, aNext);
  gridB.insertBefore(elA, bNext);
}

// 跨页移动图标到目标页（追加到末尾）
function moveIconToPage(iconEl, targetGrid) {
  const appId = iconEl.dataset.appId;
  const originGrid = iconEl.parentElement;
  const targetPage = Number(targetGrid.dataset.iconGrid) || 0;
  // 更新 page 覆盖
  const overrides = getIconPageOverrides();
  overrides[appId] = targetPage;
  saveIconPageOverrides(overrides);
  // 移动 DOM
  targetGrid.appendChild(iconEl);
  // 保存两页的顺序
  if (originGrid) saveIconOrder(originGrid);
  saveIconOrder(targetGrid);
  showToast('移到第 ' + (targetPage + 1) + ' 页啦', 'success');
}

function moveToDesktop(dockEl, grid) {
  const appId = dockEl.dataset.appId;
  // 标记为桌面 app（覆盖 registry 的 dock 字段，不修改 registry 本身）
  const overrides = getDockOverrides();
  overrides[appId] = false;
  saveDockOverrides(overrides);
  // 设置 page 覆盖为目标页（支持 Dock 移到指定桌面页）
  const pageOverrides = getIconPageOverrides();
  pageOverrides[appId] = Number(grid.dataset.iconGrid) || 0;
  saveIconPageOverrides(pageOverrides);
  // 从 dock 顺序移除
  const dockOrder = getDockOrder().filter((id) => id !== appId);
  saveDockOrderArr(dockOrder);
  // 加入桌面网格（插入到末尾）
  const reg = getRegistrySync();
  const app = reg?.APPS.find((a) => a.id === appId);
  if (app) {
    const newIcon = createDesktopIcon(app);
    grid.appendChild(newIcon);
    saveIconOrder(grid);
  }
  dockEl.remove();
  showToast('移到桌面啦', 'success');
}

function moveToDock(desktopIconEl) {
  const appId = desktopIconEl.dataset.appId;
  const reg = getRegistrySync();
  const app = reg?.APPS.find((a) => a.id === appId);
  if (!app) return;
  const maxDock = getConfig('ui.dockMax', 4);
  let dockOrder = getDockOrder();
  const originGrid = desktopIconEl.parentElement;
  const targetPage = originGrid ? Number(originGrid.dataset.iconGrid) || 0 : 0;

  // Dock 已满：挤出最旧的（dock 顺序第一个）到拖入图标的原桌面位置
  // desktop skill 要求 Dock 固定 4 位，满了挤出而非拒绝
  if (dockOrder.length >= maxDock) {
    const kickedId = dockOrder[0];
    const kickedApp = reg?.APPS.find((a) => a.id === kickedId);
    if (kickedApp) {
      const dockOverrides = getDockOverrides();
      dockOverrides[kickedId] = false;
      saveDockOverrides(dockOverrides);
      const pageOverrides = getIconPageOverrides();
      pageOverrides[kickedId] = targetPage;
      saveIconPageOverrides(pageOverrides);
      const newDesktopIcon = createDesktopIcon(kickedApp);
      if (originGrid) originGrid.appendChild(newDesktopIcon);
      const kickedDockEl = dockEl.querySelector(`.dock-icon[data-app-id="${kickedId}"]`);
      if (kickedDockEl) kickedDockEl.remove();
      dockOrder = dockOrder.filter((id) => id !== kickedId);
      saveDockOrderArr(dockOrder);
      showToast(`${kickedApp.name} 让了位置到桌面`, 'default');
    }
  }

  // 标记为 dock app（覆盖 registry 的 dock 字段，不修改 registry 本身）
  const overrides = getDockOverrides();
  overrides[appId] = true;
  saveDockOverrides(overrides);
  // 清除 page 覆盖（图标离开桌面进 dock，回到 registry 默认 page）
  const pageOverrides = getIconPageOverrides();
  delete pageOverrides[appId];
  saveIconPageOverrides(pageOverrides);
  // 从桌面移除拖入的图标，统一保存网格顺序（含被挤出图标）
  desktopIconEl.remove();
  if (originGrid) saveIconOrder(originGrid);
  // 加入 dock
  const newIcon = createDockIcon(app);
  dockEl.appendChild(newIcon);
  dockOrder.push(appId);
  saveDockOrderArr(dockOrder);
  showToast('放到 Dock 啦', 'success');
}

function saveIconOrder(grid) {
  const ids = [...grid.querySelectorAll('.desktop-icon[data-app-id]')].map((n) => n.dataset.appId);
  setData(KEYS.appIconOrder(grid.dataset.iconGrid || '0'), ids);
}

function saveDockOrderArr(arr) {
  setData(KEYS.appDockOrder, arr);
}
// 参数名用 dockRoot 避免遮蔽全局 dockEl（行 33）
function saveDockOrder(dockRoot) {
  const ids = [...dockRoot.querySelectorAll('.dock-icon[data-app-id]')].map((n) => n.dataset.appId);
  saveDockOrderArr(ids);
}

// ════════════════════════════════════════
// Widget 拖拽（长按进入编辑态，同页内换位，跨页移动）
// 编辑模式下支持：transform 浮起 / 落点预览 / 边缘翻页 / 交换
// ════════════════════════════════════════
function handleWidgetPointerDown(event, element, widget) {
  if (event.button !== undefined && event.button !== 0) return;
  const pressMs = getConfig('ui.iconEditPressMs', 620);
  const startX = event.clientX, startY = event.clientY;
  let pressTimer = setTimeout(() => {
    // 修复：同上，编辑态下长按另一个 widget 不重复弹 toast。
    if (!moved) { const wasEditing = editing; enterEditingMode(); if (!wasEditing) showToast('拖动可以换位置，松开试试'); }
  }, pressMs);
  let moved = false;
  let dragGhost = null;
  let ghostOffsetX = 0, ghostOffsetY = 0;

  const onMove = (e) => {
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    if (!moved) {
      moved = true;
      clearTimeout(pressTimer);
      enterEditingMode();
      // 拖拽 ghost：clone 元素，浮起 + 阴影 + 旋转 + 半透明
      const rect = element.getBoundingClientRect();
      ghostOffsetX = rect.width / 2;
      ghostOffsetY = rect.height / 2;
      dragGhost = element.cloneNode(true);
      dragGhost.classList.add('drag-ghost');
      dragGhost.style.position = 'fixed';
      dragGhost.style.left = '0px';
      dragGhost.style.top = '0px';
      dragGhost.style.width = rect.width + 'px';
      document.body.appendChild(dragGhost);
      // 原元素半透明 + 关闭指针事件
      element.style.opacity = '0.25';
      element.style.pointerEvents = 'none';
      startEdgeAutoFlip();
    }
    e.preventDefault();
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    // 用 transform 移动 ghost，避免重排（scale 1.08 + 旋转 -2deg 浮起效果）
    if (dragGhost) {
      dragGhost.style.transform = `translate3d(${e.clientX - ghostOffsetX}px, ${e.clientY - ghostOffsetY}px, 0) scale(1.08) rotate(-2deg)`;
    }
    // 更新落点预览（高亮目标 widget 或显示占位符）
    updateWidgetDropPreview(e.clientX, e.clientY, element);
  };

  const onUp = (e) => {
    clearTimeout(pressTimer);
    stopEdgeAutoFlip();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    clearDropPreview();
    if (dragGhost) dragGhost.remove();
    element.style.opacity = '';
    element.style.pointerEvents = '';
    if (!moved) return;
    // 标记刚拖拽完，防止后续 click 误触退出编辑态
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 120);
    // 落点判定
    handleWidgetDrop(e.clientX, e.clientY, element, widget);
  };

  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });
}

// Widget 落点预览：高亮目标 widget 或在空白 widget 区显示占位符
function updateWidgetDropPreview(x, y, dragEl) {
  clearDropPreview();
  const overEl = document.elementFromPoint(x, y);
  if (!overEl) return;
  const target = overEl.closest('.widget[data-widget-id]');
  if (target && target !== dragEl) {
    target.classList.add('drop-target');
    return;
  }
  // 空白 widget 区：显示占位符（提示可移动到该页）
  const area = overEl.closest('[data-widget-area]');
  if (area && area !== dragEl.parentElement) {
    showDropPlaceholderInWidgetArea(area);
  }
}

// Widget 落点处理：交换 / 跨页移动
function handleWidgetDrop(x, y, dragEl, widget) {
  const overEl = document.elementFromPoint(x, y);
  if (!overEl) return;
  const target = overEl.closest('.widget[data-widget-id]');
  const targetArea = overEl.closest('[data-widget-area]');
  if (target && target !== dragEl) {
    // 同页换位：交换 order
    const targetId = target.dataset.widgetId;
    swapWidgetOrder(widget.id, targetId);
    renderWidgets().then(() => { updateClock(); updateWeather(); updateAnniversaryWidget(); updateCountdownWidget(); updateVinylWidget(); });
    showToast('位置换好啦', 'success');
  } else if (targetArea) {
    // 跨页移动
    const newPage = Number(targetArea.dataset.widgetArea);
    if (!Number.isNaN(newPage) && newPage !== widget.page) {
      moveWidgetToPage(widget.id, newPage);
      renderWidgets().then(() => { updateClock(); updateWeather(); updateAnniversaryWidget(); updateCountdownWidget(); updateVinylWidget(); });
      showToast('移到第 ' + (newPage + 1) + ' 页啦', 'success');
    }
  }
}

function swapWidgetOrder(idA, idB) {
  const layout = getWidgetLayout();
  const a = layout[idA] || { order: 999 };
  const b = layout[idB] || { order: 999 };
  layout[idA] = { ...a, order: b.order };
  layout[idB] = { ...b, order: a.order };
  saveWidgetLayout(layout);
}

function moveWidgetToPage(widgetId, page) {
  const layout = getWidgetLayout();
  layout[widgetId] = { ...(layout[widgetId] || {}), page };
  saveWidgetLayout(layout);
}

function setWidgetHidden(widgetId, hidden) {
  const layout = getWidgetLayout();
  layout[widgetId] = { ...(layout[widgetId] || {}), hidden: !!hidden };
  saveWidgetLayout(layout);
}

function updateEditingClass() {
  // 切换桌面容器的编辑态 class（驱动 jitter 抖动 + cursor）
  desktopEl.classList.toggle('editing-mode', editing);
  // 切换各元素的 .editing class（驱动删除角标显示等已有样式）
  document.querySelectorAll('.desktop-icon').forEach((el) => el.classList.toggle('editing', editing));
  document.querySelectorAll('.widget').forEach((el) => el.classList.toggle('editing', editing));
  // 设置抖动错开延迟（iOS 风格 stagger，避免所有图标同步抖动）
  let idx = 0;
  document.querySelectorAll('.desktop-icon, .dock-icon, .widget').forEach((el) => {
    el.style.setProperty('--jit', String(idx % 10));
    idx++;
  });
  // 编辑态提示条
  if (editing) showEditingBanner();
  else hideEditingBanner();
}

// 进入编辑态（统一入口，避免散落的 editing = true 赋值）
function enterEditingMode() {
  if (editing) return;
  editing = true;
  updateEditingClass();
}

// 退出编辑态（统一入口，清理 ghost / 占位符 / 提示条）
function exitEditingMode() {
  if (!editing) return;
  editing = false;
  clearDropPreview();
  hideEditingBanner();
  updateEditingClass();
}

// ════════════════════════════════════════
// 编辑态顶部提示条
// ════════════════════════════════════════
let editingBannerEl = null;
function showEditingBanner() {
  if (editingBannerEl) return;
  editingBannerEl = document.createElement('div');
  editingBannerEl.className = 'editing-banner';
  const text = document.createElement('span');
  text.className = 'editing-banner-text';
  text.textContent = '长按拖动图标和小组件，点 × 完成';
  const close = document.createElement('button');
  close.className = 'editing-banner-close';
  close.type = 'button';
  close.setAttribute('aria-label', '完成编辑');
  close.appendChild(createIcon('close', 14));
  close.addEventListener('click', exitEditingMode);
  editingBannerEl.append(text, close);
  desktopEl.appendChild(editingBannerEl);
}
function hideEditingBanner() {
  if (editingBannerEl) {
    editingBannerEl.remove();
    editingBannerEl = null;
  }
}

// ════════════════════════════════════════
// 拖拽时边缘自动翻页（指针靠近左右边缘时滚动 pagesEl）
// ════════════════════════════════════════
let lastPointerX = 0;
let lastPointerY = 0;
let edgeFlipTimer = null;
function startEdgeAutoFlip() {
  stopEdgeAutoFlip();
  edgeFlipTimer = setInterval(() => {
    if (!pagesEl) return;
    const rect = pagesEl.getBoundingClientRect();
    const threshold = 56;
    const step = 12;
    if (lastPointerX > 0 && lastPointerX < rect.left + threshold) {
      pagesEl.scrollBy({ left: -step, behavior: 'auto' });
    } else if (lastPointerX > rect.right - threshold && lastPointerX < rect.right + threshold) {
      pagesEl.scrollBy({ left: step, behavior: 'auto' });
    }
  }, 16);
}
function stopEdgeAutoFlip() {
  if (edgeFlipTimer) { clearInterval(edgeFlipTimer); edgeFlipTimer = null; }
}

// ════════════════════════════════════════
// 落点占位符（虚线圆角框，主题色，提示可放置位置）
// ════════════════════════════════════════
let dropPlaceholderEl = null;
function showDropPlaceholderInGrid(grid) {
  ensureDropPlaceholder();
  dropPlaceholderEl.classList.remove('widget-placeholder');
  grid.appendChild(dropPlaceholderEl);
}
function showDropPlaceholderInWidgetArea(area) {
  ensureDropPlaceholder();
  dropPlaceholderEl.classList.add('widget-placeholder');
  area.appendChild(dropPlaceholderEl);
}
function ensureDropPlaceholder() {
  if (!dropPlaceholderEl) {
    dropPlaceholderEl = document.createElement('div');
    dropPlaceholderEl.className = 'drop-placeholder';
  }
  // 如果已在别处，先移除再追加到新位置
  if (dropPlaceholderEl.parentElement) {
    dropPlaceholderEl.parentElement.removeChild(dropPlaceholderEl);
  }
}
function clearDropPreview() {
  document.querySelectorAll('.drop-target').forEach((n) => n.classList.remove('drop-target'));
  if (dropPlaceholderEl && dropPlaceholderEl.parentElement) {
    dropPlaceholderEl.parentElement.removeChild(dropPlaceholderEl);
  }
}

// ════════════════════════════════════════
// 页面指示 & 事件
// ════════════════════════════════════════
function updatePageDots() {
  [...pageDotsEl.children].forEach((dot, i) => dot.classList.toggle('active', i === currentPage));
}

function bindEvents() {
  // 滚动指示点：用 throttle 实时更新（替代 debounce 延迟）
  pagesEl.addEventListener('scroll', throttle(() => {
    currentPage = Math.round(pagesEl.scrollLeft / (pagesEl.clientWidth || 1));
    updatePageDots();
  }, 60), { passive: true });

  // 点击 page-dots 跳页
  pageDotsEl.addEventListener('click', (e) => {
    const dot = e.target.closest('.page-dot');
    if (!dot) return;
    const idx = [...pageDotsEl.children].indexOf(dot);
    const target = pagesEl.children[idx];
    if (target) pagesEl.scrollTo({ left: target.offsetLeft, behavior: 'smooth' });
  });

  // 点空白退出编辑态
  desktopEl.addEventListener('click', (e) => {
    if (justDragged) return; // 拖拽刚结束，忽略本次 click
    if (!editing) return;
    if (e.target.closest('.desktop-icon, .widget, .dock, .status-bar, .page-dots, .editing-banner')) return;
    exitEditingMode();
  });

  // 阻止浏览器原生右键菜单 / 长按菜单（复制/粘贴/分享等）。
  // 不阻止的话，长按图标进编辑模式时浏览器会先弹原生菜单，干扰拖拽体验。
  // 桌面是触控/长按交互场景，不需要原生右键菜单。
  desktopEl.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.desktop-icon, .widget, .dock-icon, .editing-banner, .status-bar, .page-dots')) {
      e.preventDefault();
    }
  });

  // 窗口尺寸变化重排
  // 修复：原版 rebuildDesktopPages 会清空 pagesEl.innerHTML，丢失 scrollLeft 且 currentPage 不重置（回到第 0 页）。
  // 改成重建后恢复 currentPage 的 scrollLeft。
  window.addEventListener('resize', debounce(async () => {
    const pageBefore = currentPage;
    rebuildDesktopPages();
    await renderAll();
    await applyAllImages();
    // 恢复到 resize 前的页
    const restored = pagesEl.children[pageBefore];
    if (restored) pagesEl.scrollTo({ left: restored.offsetLeft, behavior: 'auto' });
  }, 260));

  // 锁屏键盘
  lockPadEl.addEventListener('click', onLockKeyClick);

  // 存储/事件同步（多 tab 同步场景）
  // 修复：原版任意 storage 变化都触发 applyAllImages + refreshBadges，过宽且频繁重绘。
  // 只在桌面相关 key 变化时刷新。
  const _desktopStorageKeys = new Set([
    KEYS.appWallpaper, KEYS.appLockWallpaper, KEYS.appLockAvatar, KEYS.appLockPassword,
    KEYS.appTheme, KEYS.appCustomColors, KEYS.appFontFamily, KEYS.appCustomFontBlob,
    KEYS.appFontScale, KEYS.appBubbleRadius, KEYS.appMotionLevel,
    KEYS.appDesktopScale, KEYS.appWidgetScale, KEYS.appDockScale,
    KEYS.appDesktopPages, KEYS.appDockOrder, KEYS.appDockOverrides,
    KEYS.appIconPageOverrides,                  // 补：跨页拖拽覆盖跨 tab 同步
    KEYS.appWidgetPositions, KEYS.appHiddenIcons, KEYS.appWidgetBackgrounds,
    KEYS.appBadges, KEYS.appLockUnlocked, KEYS.appIcons,
    KEYS.notifySettings,                        // 补：通知设置跨 tab 同步
    KEYS.desktopNoticeStyle,                    // 补：提示风格跨 tab 同步
    KEYS.appLockFailState                       // 补：锁屏失败锁定状态跨 tab 同步
  ]);
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    // appIconOrder_<page> 是函数式 key，用前缀匹配
    const isIconOrder = e.key.startsWith('app_icon_order_');
    if (!_desktopStorageKeys.has(e.key) && !isIconOrder) return;
    // 修复：原版只 applyAllImages + refreshBadges，图标/dock 顺序变了不重渲染 → 补 renderIconGrids + renderDock。
    try { applyAllImages(); renderIconGrids(); renderDock(); refreshBadges(); } catch (err) { /* 静默 */ }
  });
}

// hashPassword / parseLockStored 从 core/lock.js 统一导入，避免与 settings 重复实现

function getLockPasswordLength() {
  return parseLockStored(getData(KEYS.appLockPassword, null)).length;
}

// 启动时迁移：把明文密码哈希后存储（默认 '0326' 也会被哈希）
async function ensureLockPasswordHashed() {
  const parsed = parseLockStored(getData(KEYS.appLockPassword, null));
  if (parsed.hash) return;
  const plain = parsed.plain != null ? parsed.plain : DEFAULT_LOCK_PASSWORD;
  const hash = await hashPassword(plain);
  setData(KEYS.appLockPassword, formatLockStored(hash, plain.length));
}

async function isLockPasswordDefault() {
  const parsed = parseLockStored(getData(KEYS.appLockPassword, null));
  if (parsed.hash) {
    const defaultHash = await hashPassword(DEFAULT_LOCK_PASSWORD);
    return parsed.hash === defaultHash;
  }
  return parsed.plain === DEFAULT_LOCK_PASSWORD;
}

function isLockLockedOut() { return Date.now() < lockLockoutUntil; }

function startLockLockout() {
  lockLockoutUntil = Date.now() + LOCK_LOCKOUT_MS;
  lockFailCount = 0;
  lockInput = '';
  renderLockDots();
  if (lockLockoutTicker) clearInterval(lockLockoutTicker);
  lockLockoutTicker = setInterval(updateLockCountdown, 500);
  updateLockCountdown();
  saveLockFailState();               // 持久化：进入锁定期
}

function updateLockCountdown() {
  const remainMs = lockLockoutUntil - Date.now();
  if (remainMs > 0) {
    const remain = Math.ceil(remainMs / 1000);
    lockErrorEl.textContent = `输入错误太多啦，${remain} 秒后再试嘛`;
    lockPadEl.style.pointerEvents = 'none';
    lockPadEl.style.opacity = '0.5';
  } else {
    if (lockLockoutTicker) { clearInterval(lockLockoutTicker); lockLockoutTicker = null; }
    lockLockoutUntil = 0;
    saveLockFailState();             // 持久化：锁定期结束，清空 until
    lockErrorEl.textContent = '';
    lockPadEl.style.pointerEvents = '';
    lockPadEl.style.opacity = '';
  }
}

async function onLockKeyClick(e) {
  if (isLockLockedOut()) return; // 锁定中禁止输入
  const key = e.target.closest('[data-key]')?.dataset.key;
  if (!key) return;
  if (key === 'clear') { lockInput = ''; lockErrorEl.textContent = ''; renderLockDots(); return; }
  if (key === 'delete') { lockInput = lockInput.slice(0, -1); lockErrorEl.textContent = ''; renderLockDots(); return; }
  const need = getLockPasswordLength();
  if (lockInput.length >= need) return;
  lockInput += key;
  lockErrorEl.textContent = '';
  renderLockDots();
  if (lockInput.length === need) setTimeout(checkLockPassword, 120);
}

function renderLockDots() {
  const need = getLockPasswordLength();
  // 动态生成 dot，数量跟随密码长度
  if (lockDotsEl.children.length !== need) {
    lockDotsEl.innerHTML = '';
    for (let i = 0; i < need; i++) {
      const s = document.createElement('span');
      s.className = 'lock-dot';
      lockDotsEl.appendChild(s);
    }
  }
  [...lockDotsEl.children].forEach((dot, i) => dot.classList.toggle('filled', i < lockInput.length));
}

async function checkLockPassword() {
  if (isLockLockedOut()) return;
  const parsed = parseLockStored(getData(KEYS.appLockPassword, null));
  let matched = false;
  if (parsed.hash) {
    const inputHash = await hashPassword(lockInput);
    matched = (inputHash === parsed.hash);
  } else if (parsed.plain != null) {
    // 兼容旧版明文存储（设置 App 刚改完未迁移）
    matched = (lockInput === parsed.plain);
  }
  if (matched) {
    lockFailCount = 0;
    saveLockFailState();               // 持久化：解锁成功，清空失败计数
    setData(KEYS.appLockUnlocked, true);
    lockScreenEl.classList.add('unlocked');
    setTimeout(() => lockScreenEl.classList.add('hidden'), 320);
    showToast('解锁啦，见到你真好', 'success');
    return;
  }
  lockInput = '';
  lockFailCount += 1;
  saveLockFailState();                 // 持久化：失败计数累加
  if (lockFailCount >= LOCK_MAX_FAILS) {
    startLockLockout();
    return;
  }
  lockErrorEl.textContent = '嘿嘿，不对哦';
  [...lockDotsEl.children].forEach((dot) => dot.classList.add('shake'));
  setTimeout(() => [...lockDotsEl.children].forEach((dot) => dot.classList.remove('shake')), 320);
  renderLockDots();
}

async function refreshLockScreen() {
  // 已解锁就不显示
  const unlocked = getData(KEYS.appLockUnlocked, false);
  if (unlocked) {
    lockScreenEl.classList.add('unlocked', 'hidden');
  } else {
    lockScreenEl.classList.remove('unlocked', 'hidden');
  }
  // 显示角色名 / 默认密码提示
  const isDefault = await isLockPasswordDefault();
  if (isDefault) {
    lockTitleEl.textContent = `嘘，输入密码`;
    lockHintEl.textContent = '密码还是默认的哦，去设置里换一个更安全';
  } else if (currentCharacter?.name) {
    lockTitleEl.textContent = `嘘，输入密码`;
    lockHintEl.textContent = `${currentCharacter.name} 在等你解锁哦`;
  }
  // 锁屏头像
  const avatarRec = await getDB(STORES.blobs, KEYS.appLockAvatar);
  const avatarUrl = avatarRec?.value || avatarRec?.source || avatarRec?.data || '';
  if (isUsableImage(avatarUrl)) {
    lockAvatarEl.style.backgroundImage = `url("${cssUrl(avatarUrl)}")`;
    lockAvatarEl.style.backgroundSize = 'cover';
    lockAvatarEl.style.backgroundPosition = 'center';
    lockAvatarEl.innerHTML = '';
  } else if (currentCharacter?.avatar && isUsableImage(currentCharacter.avatar)) {
    lockAvatarEl.style.backgroundImage = `url("${cssUrl(currentCharacter.avatar)}")`;
    lockAvatarEl.style.backgroundSize = 'cover';
    lockAvatarEl.innerHTML = '';
  } else {
    lockAvatarEl.style.backgroundImage = '';
    lockAvatarEl.innerHTML = '';
    lockAvatarEl.appendChild(createIcon('smile', 40));
  }
}

// ════════════════════════════════════════
// Widget 更新
// ════════════════════════════════════════
function initWidgets() {
  updateClock();
  clearInterval(clockTimer);
  clockTimer = setInterval(updateClock, 1000);
  updateWeather();
  clearInterval(weatherTimer);
  weatherTimer = setInterval(updateWeather, 30 * 60 * 1000);
  updateAnniversaryWidget();
  updateCountdownWidget();
  updateVinylWidget();
  // vinyl widget 由音频事件驱动（play/pause/timeupdate），不再每秒 setInterval 轮询
  // 倒计时 widget 每分钟刷一次，避免跨日时数字不准
  clearInterval(countdownTimer);
  countdownTimer = setInterval(updateCountdownWidget, 60 * 1000);
}

function updateClock() {
  updateStatusTime();
  const now = new Date();
  const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
  const date = now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' });
  const t = $('w-time'); if (t) t.textContent = time;
  const d = $('w-date'); if (d) d.textContent = date;
}

async function updateWeather() {
  const el = $('w-weather');
  if (!el) return;
  const city = getData(KEYS.weatherCity, '');
  const cacheKey = city ? `${KEYS.weatherCache}_${city}` : KEYS.weatherCache;
  const cached = getData(cacheKey, null);
  const now = Date.now();
  if (cached?.text && now - Number(cached.updatedAt || 0) < 30 * 60 * 1000) {
    el.textContent = cached.text; return;
  }
  try {
    const url = city ? `https://wttr.in/${encodeURIComponent(city)}?format=j1` : 'https://wttr.in/?format=j1';
    const resp = await fetch(url, { cache: 'no-store' });
    const data = await resp.json();
    const cur = data?.current_condition?.[0] || {};
    const area = data?.nearest_area?.[0]?.areaName?.[0]?.value || (city || '');
    const temp = cur.temp_C ? `${cur.temp_C}℃` : '';
    const desc = cur.lang_zh?.[0]?.value || cur.weatherDesc?.[0]?.value || '';
    const text = [area, temp, desc].filter(Boolean).join(' · ') || '天气躲起来了';
    el.textContent = text;
    setData(cacheKey, { text, updatedAt: now });
  } catch (e) {
    console.warn('[weather]', e);
    el.textContent = cached?.text || '天气躲起来了';
  }
}

function updateAnniversaryWidget() {
  const el = $('w-anniversary');
  if (!el) return;
  const list = getAllAnniversaries();
  if (!list.length) { el.textContent = '还没有纪念日呢'; return; }
  const today = startOfDay(new Date());
  const next = list.map((item) => {
    const d = parseDate(item.date || item.day || item.targetDate);
    if (!d) return null;
    let target = new Date(today.getFullYear(), d.getMonth(), d.getDate());
    if (target < today) target = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate());
    return { ...item, days: Math.round((target - today) / 86400000) };
  }).filter(Boolean).sort((a, b) => a.days - b.days)[0];
  if (!next) { el.textContent = '还没有纪念日呢'; return; }
  const name = next.title || next.name || '纪念日';
  el.textContent = next.days === 0 ? `${name} 就是今天` : `${name} 还有 ${next.days} 天`;
}

// 倒计时 widget：取最近一个倒计时，显示标题 + 剩余天数
async function updateCountdownWidget() {
  const titleEl = $('w-countdown-title');
  const daysEl = $('w-countdown-days');
  if (!titleEl && !daysEl) return;
  try {
    // 动态 import 懒加载 countdown App，避免桌面壳静态依赖 App（与 registry loader 同模式）
    const { getUpcomingCountdown } = await import('./apps/countdown/index.js');
    const up = await getUpcomingCountdown();
    if (!up) {
      if (titleEl) titleEl.textContent = '还没有倒计时呢';
      if (daysEl) daysEl.textContent = '加一个重要日子嘛';
      return;
    }
    if (titleEl) titleEl.textContent = up.title;
    if (daysEl) {
      if (up.days === 0) daysEl.textContent = '就是今天呀';
      else if (up.days > 0) daysEl.textContent = `还有 ${up.days} 天`;
      else daysEl.textContent = `已过 ${Math.abs(up.days)} 天`;
    }
  } catch (e) {
    console.warn('[countdown widget]', e);
  }
}

function getAllAnniversaries() {
  const v = getData(KEYS.appAnniversaries, null);
  return Array.isArray(v) ? v : [];
}
function saveAnniversaries(list) { setData(KEYS.appAnniversaries, list || []); }

function addAnniversaryPrompt() {
  const body = document.createElement('div');
  body.innerHTML = `<input class="input" id="ann-name" placeholder="纪念日名字（如 生日）" style="width:100%;margin-bottom:8px">
    <input type="date" id="ann-date" style="width:100%;margin-bottom:8px;padding:8px;border-radius:var(--radius-sm);background:var(--bg-secondary);color:var(--text-primary)">
    <div style="display:flex;gap:8px;margin-bottom:10px">
      ${getAnniversaryListHtml()}
    </div>
    <button class="btn primary block" id="ann-ok">加上</button>`;
  showBottomSheet({ title: '纪念日', bodyElement: body, dismissible: true });
  refreshAnniversaryList(body);
  body.querySelector('#ann-ok').addEventListener('click', () => {
    const name = body.querySelector('#ann-name').value.trim();
    const date = body.querySelector('#ann-date').value;
    if (!name) { showToast('起个名字嘛', 'error'); return; }
    if (!date) { showToast('选个日期嘛', 'error'); return; }
    const list = getAllAnniversaries();
    list.push({ id: `ann_${Date.now()}`, title: name, date });
    saveAnniversaries(list);
    document.querySelector('.popo-sheet-close')?.click();
    updateAnniversaryWidget();
    showToast('纪念日记好啦', 'success');
  });
}

function getAnniversaryListHtml() {
  const list = getAllAnniversaries();
  if (!list.length) return '<div style="font-size:var(--font-size-small);color:var(--text-hint);flex:1">还没有纪念日</div>';
  return '<div style="flex:1;max-height:160px;overflow-y:auto">' + list.map((a) =>
    `<div class="card-row" data-ann-id="${a.id}"><span class="card-row-label">${escapeHtml(a.title)} · ${a.date}</span><button class="btn ghost" data-ann-del>删</button></div>`
  ).join('') + '</div>';
}

function refreshAnniversaryList(container) {
  const wrap = container.querySelector('[style*="flex:1"]');
  if (!wrap) return;
  wrap.innerHTML = getAllAnniversaries().length ? getAllAnniversaries().map((a) =>
    `<div class="card-row" data-ann-id="${a.id}"><span class="card-row-label">${escapeHtml(a.title)} · ${a.date}</span><button class="btn ghost" data-ann-del>删</button></div>`
  ).join('') : '<div style="font-size:var(--font-size-small);color:var(--text-hint)">还没有纪念日</div>';
  wrap.querySelectorAll('[data-ann-del]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.closest('[data-ann-id]').dataset.annId;
      const list = getAllAnniversaries().filter((a) => a.id !== id);
      saveAnniversaries(list);
      refreshAnniversaryList(container);
      updateAnniversaryWidget();
    });
  });
}
function parseDate(v) { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function updateVinylWidget() {
  const disc = $('w-vinyl-disc');
  const title = $('w-vinyl-title');
  const artist = $('w-vinyl-artist');
  const playBtn = $('w-vinyl-play');
  const isPlaying = !!vinylAudio && !vinylAudio.paused;
  const song = getVinylCurrent();
  if (disc) disc.classList.toggle('playing', isPlaying);
  if (title) title.textContent = song?.title || '还没有歌曲呢';
  if (artist) artist.textContent = song ? (song.artist || '本地歌曲') : '点这里挑一首本地歌';
  if (playBtn) {
    playBtn.innerHTML = '';
    playBtn.appendChild(createIcon(isPlaying ? 'pause' : 'play', 14));
  }
}

// ════════════════════════════════════════
// 本地音乐最小播放器（黑胶 widget）
// ════════════════════════════════════════
let vinylAudio = null;
let vinylIndex = -1;
// 会话内带 url 的歌曲列表（blob URL 不持久化，刷新后失效）
const vinylSession = [];
function getVinylSongs() { const v = getData(KEYS.appVinylSongs, []); return Array.isArray(v) ? v : []; }
function getVinylCurrent() { return vinylIndex >= 0 ? vinylSession[vinylIndex] : null; }

async function pickLocalSong() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  await new Promise((res) => { input.onchange = () => res(); input.click(); });
  const file = input.files?.[0];
  input.remove();
  if (!file) return;
  const url = URL.createObjectURL(file);
  const song = { id: `vinyl_${Date.now()}`, title: file.name.replace(/\.[^.]+$/, ''), artist: '本地', url, size: file.size, addedAt: new Date().toISOString() };
  // 会话列表存带 url 的完整对象，用于切歌
  vinylSession.push(song);
  // 持久化只存元数据（blob URL 刷新后失效）
  const persistList = getVinylSongs().concat([{ id: song.id, title: song.title, artist: song.artist, addedAt: song.addedAt }]);
  setData(KEYS.appVinylSongs, persistList);
  playVinylSong(song);
  showToast('挑好啦，正在播放', 'success');
}

// 懒创建 vinylAudio 并绑定事件（play/pause/timeupdate 驱动 widget 更新，替代每秒轮询）
function ensureVinylAudio() {
  if (vinylAudio) return;
  vinylAudio = new Audio();
  vinylAudio.addEventListener('ended', () => playVinylAt(vinylIndex + 1));
  vinylAudio.addEventListener('play', updateVinylWidget);
  vinylAudio.addEventListener('pause', updateVinylWidget);
  vinylAudio.addEventListener('timeupdate', updateVinylWidget);
}

function playVinylSong(song) {
  if (!song || !song.url) { showToast('这首歌的链接失效啦，重新挑一首嘛', 'error'); return; }
  ensureVinylAudio();
  // 释放旧的 blob URL（仅当它不再被会话列表引用时，避免破坏切歌）
  const oldSrc = vinylAudio.src;
  if (oldSrc && oldSrc !== song.url && /^blob:/i.test(oldSrc) && !vinylSession.some((s) => s.url === oldSrc)) {
    URL.revokeObjectURL(oldSrc);
  }
  vinylAudio.src = song.url;
  vinylAudio.play().catch(() => showToast('播放不出来嘛，换个格式试试', 'error'));
  // 在会话列表里定位索引
  vinylIndex = vinylSession.findIndex((s) => s.id === song.id);
  updateVinylWidget();
}

// 卸载时释放所有 blob URL，避免内存泄漏
function revokeAllVinylBlobs() {
  vinylSession.forEach((s) => {
    if (s.url && /^blob:/i.test(s.url)) {
      try { URL.revokeObjectURL(s.url); } catch (e) {}
    }
  });
}
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('beforeunload', revokeAllVinylBlobs);
}

function playVinylAt(idx) {
  if (!vinylSession.length) { pickLocalSong(); return; }
  // 循环切歌：超出范围回到首/尾
  if (idx < 0) idx = vinylSession.length - 1;
  if (idx >= vinylSession.length) idx = 0;
  playVinylSong(vinylSession[idx]);
}

function toggleVinylPlay() {
  if (!vinylAudio) { pickLocalSong(); return; }
  if (vinylAudio.paused) vinylAudio.play().catch(() => {});
  else vinylAudio.pause();
  updateVinylWidget();
}

// ════════════════════════════════════════
// 图片应用（壁纸 / 锁屏背景 / 锁屏头像 / 图标）
// ════════════════════════════════════════
async function applyAllImages() {
  await Promise.all([
    applyWallpaper(),
    applyLockBackground(),
    refreshLockScreen(),
    applyIconImages()
  ]);
}

async function applyWallpaper() {
  const rec = await getDB(STORES.blobs, KEYS.appWallpaper);
  const url = rec?.value || rec?.source || rec?.data || '';
  // 用户语义：opacity 100 = 完全显示壁纸，0 = 完全遮住壁纸
  // --wallpaper-soft 是遮罩层不透明度：1 = 全遮，0 = 全显
  // 转换：maskOpacity = (100 - userOpacity) / 100
  const userOpacity = Number(rec?.opacity ?? 100);
  const maskOpacity = Math.max(0, Math.min(1, (100 - userOpacity) / 100));
  if (isUsableImage(url)) {
    desktopEl.style.backgroundImage = `url("${cssUrl(url)}")`;
    desktopEl.style.backgroundSize = 'cover';
    desktopEl.style.backgroundPosition = 'center';
    document.documentElement.style.setProperty('--wallpaper-soft', String(maskOpacity));
  } else {
    desktopEl.style.backgroundImage = '';
    document.documentElement.style.setProperty('--wallpaper-soft', '0.10');
  }
}

async function applyLockBackground() {
  const useWallpaper = getData(KEYS.appLockUseWallpaper, false);
  let url = '';
  if (useWallpaper) {
    const wp = await getDB(STORES.blobs, KEYS.appWallpaper);
    url = wp?.value || wp?.source || wp?.data || '';
  } else {
    const rec = await getDB(STORES.blobs, KEYS.appLockWallpaper);
    url = rec?.value || rec?.source || rec?.data || '';
  }
  // 锁屏壁纸透明度（0-100，100 = 完全显示）。遮罩层不透明度 = (100 - 透明度) / 100
  const userOpacity = Number(getData(KEYS.appLockWallpaperOpacity, 100));
  const maskOpacity = Math.max(0, Math.min(1, (100 - userOpacity) / 100));
  // 主题兑底最小遮罩 0.22：保证壁纸存在时主题氛围（accent 渐变 + bg-primary 兜底）始终透出来，
  // 避免用户透明度=100 时壁纸完全盖掉主题色；切主题时遮罩层也会立即反映新主题色。
  const themeMask = Math.max(maskOpacity, 0.22);
  lockScreenEl.style.setProperty('--lock-bg-mask', String(themeMask));
  // 壁纸实际可见时才启用反白模式；被遮罩完全盖住时跟随主题色
  const hasWallpaper = isUsableImage(url) && maskOpacity < 0.55;
  lockScreenEl.classList.toggle('has-wallpaper', hasWallpaper);
  if (isUsableImage(url)) {
    lockScreenEl.style.backgroundImage = `url("${cssUrl(url)}")`;
    lockScreenEl.style.backgroundSize = 'cover';
    lockScreenEl.style.backgroundPosition = 'center';
  } else {
    lockScreenEl.style.backgroundImage = '';
  }
}

async function applyIconImages() {
  const reg = await getRegistry();
  await Promise.all(reg.APPS.map(async (app) => {
    const iconEl = document.querySelector(`.desktop-icon[data-app-id="${app.id}"] .desktop-icon-img, .dock-icon[data-app-id="${app.id}"] .desktop-icon-img`);
    if (!iconEl) return;
    const rec = await getDB(STORES.blobs, `app_icon_${app.id}`);
    const url = rec?.value || rec?.source || rec?.data || '';
    if (isUsableImage(url)) {
      iconEl.innerHTML = '';
      iconEl.style.backgroundImage = `url("${cssUrl(url)}")`;
      iconEl.style.backgroundSize = 'cover';
      iconEl.style.backgroundPosition = 'center';
    } else {
      iconEl.style.backgroundImage = '';
      if (!iconEl.querySelector('svg')) {
        iconEl.innerHTML = '';
        iconEl.appendChild(createIcon(app.icon, 26));
      }
    }
  }));
}

// ════════════════════════════════════════
// 徽章
// ════════════════════════════════════════
function refreshBadges() {
  // desktop skill 铁律：禁红底数字角标，改温柔提示 4 档（ring/breathe/tag/none）
  // 旧数据兼容：desktopNoticeStyle 未设时回退看 notifySettings.badge（false→none）
  let style = getData(KEYS.desktopNoticeStyle, null);
  if (!style) {
    const cfg = getData(KEYS.notifySettings, null);
    style = (cfg && cfg.badge === false) ? 'none' : 'ring';
  }
  const map = getBadgeMap();
  document.querySelectorAll('[data-badge]').forEach((el) => {
    const count = Number(map[el.dataset.badge] || 0);
    el.classList.remove('style-ring', 'style-breathe', 'style-tag');
    if (count <= 0 || style === 'none') {
      el.style.display = 'none';
      el.textContent = '';
      return;
    }
    el.style.display = '';
    el.classList.add(`style-${style}`);
    el.textContent = style === 'tag' ? '新' : '';
  });
}

function getBadgeMap() {
  const map = {};
  const direct = getData(KEYS.appBadges, null);
  if (direct && typeof direct === 'object') Object.assign(map, direct);
  const chatUnread = getData(KEYS.chatUnreadCount, 0);
  if (Number(chatUnread) > 0) map.chat = Number(chatUnread);
  const momentsUnread = getData(KEYS.momentsUnreadCount, 0);
  if (Number(momentsUnread) > 0) map.moments = Number(momentsUnread);
  return map;
}

// ════════════════════════════════════════
// 横幅通知（消息中心新消息时顶部弹横幅，遵循免打扰 + 总开关）
// ════════════════════════════════════════
injectStyle('desktop-notice-styles', `
.notice-banner {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + var(--status-bar-base) + 8px);
  left: 50%;
  transform: translateX(-50%) translateY(-12px);
  z-index: 60;
  display: flex; align-items: center; gap: 10px;
  min-width: 260px; max-width: calc(100vw - 32px);
  padding: 10px 12px;
  border-radius: var(--radius-card);
  background: color-mix(in srgb, var(--bg-card) 92%, transparent);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  box-shadow: var(--shadow-md);
  border: 1px solid color-mix(in srgb, var(--accent-light) 60%, transparent);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.notice-banner.show {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}
.notice-banner-icon {
  flex-shrink: 0; width: 32px; height: 32px; border-radius: 50%;
  background: color-mix(in srgb, var(--accent-light) 55%, transparent);
  color: var(--accent-dark);
  display: flex; align-items: center; justify-content: center;
}
.notice-banner-icon .popo-icon-svg { width: 18px; height: 18px; }
.notice-banner-main { flex: 1; min-width: 0; }
.notice-banner-title {
  font-size: var(--font-size-small); font-weight: 600;
  color: var(--text-primary); line-height: 1.3;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.notice-banner-body {
  font-size: var(--font-size-caption); color: var(--text-secondary);
  line-height: 1.4; margin-top: 2px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.notice-banner-close {
  flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%;
  background: transparent; color: var(--text-hint);
  display: flex; align-items: center; justify-content: center;
  transition: var(--motion);
}
.notice-banner-close:active { transform: scale(var(--press-scale)); }
.notice-banner-close .popo-icon-svg { width: 12px; height: 12px; }
`);

let noticeBannerEl = null;
let noticeBannerTimer = null;

// 从 registry 取 app 图标和名字（图标提示/横幅用），找不到给兜底
function getAppInfo(appId) {
  const reg = getRegistrySync();
  const app = reg?.APPS.find((a) => a.id === appId);
  return app || { id: appId, name: '消息', icon: 'bell' };
}

// 通知总开关 + 免打扰时段 + 分APP开关检查（读 KEYS.notifySettings）
function shouldShowNotice(appId) {
  const cfg = getData(KEYS.notifySettings, null);
  if (cfg && cfg.global === false) return false;
  // 分APP开关：没存过默认开，存了 false 才关
  if (appId && cfg && cfg.perApp && cfg.perApp[appId] === false) return false;
  if (cfg && cfg.quietHours && cfg.quietHours.start && cfg.quietHours.end) {
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = String(cfg.quietHours.start).split(':').map(Number);
    const [eh, em] = String(cfg.quietHours.end).split(':').map(Number);
    const start = (sh || 0) * 60 + (sm || 0);
    const end = (eh || 0) * 60 + (em || 0);
    if (start <= end) {
      if (cur >= start && cur < end) return false;
    } else {
      // 跨夜（如 23:00-07:30）
      if (cur >= start || cur < end) return false;
    }
  }
  return true;
}

function ensureNoticeBanner() {
  if (noticeBannerEl) return;
  noticeBannerEl = document.createElement('div');
  noticeBannerEl.className = 'notice-banner';
  const icon = document.createElement('div');
  icon.className = 'notice-banner-icon';
  const main = document.createElement('div');
  main.className = 'notice-banner-main';
  const title = document.createElement('div');
  title.className = 'notice-banner-title';
  const body = document.createElement('div');
  body.className = 'notice-banner-body';
  main.append(title, body);
  const close = document.createElement('button');
  close.className = 'notice-banner-close';
  close.type = 'button';
  close.setAttribute('aria-label', '关闭');
  close.appendChild(createIcon('close', 12));
  close.addEventListener('click', (e) => { e.stopPropagation(); hideNoticeBanner(); });
  noticeBannerEl.append(icon, main, close);
  // 点横幅主体跳到消息中心
  noticeBannerEl.addEventListener('click', () => {
    hideNoticeBanner();
    openApp('inbox');
  });
  desktopEl.appendChild(noticeBannerEl);
}

function showNoticeBanner(msg) {
  if (!msg || !msg.title) return;
  if (!shouldShowNotice(msg.app)) return;
  ensureNoticeBanner();
  const app = getAppInfo(msg.app);
  const iconEl = noticeBannerEl.querySelector('.notice-banner-icon');
  iconEl.innerHTML = '';
  iconEl.appendChild(createIcon(app.icon || 'bell', 18));
  noticeBannerEl.querySelector('.notice-banner-title').textContent = msg.title;
  noticeBannerEl.querySelector('.notice-banner-body').textContent = msg.body || '';
  noticeBannerEl.classList.add('show');
  if (noticeBannerTimer) clearTimeout(noticeBannerTimer);
  noticeBannerTimer = setTimeout(hideNoticeBanner, 3800);
}

function hideNoticeBanner() {
  if (!noticeBannerEl) return;
  noticeBannerEl.classList.remove('show');
}

// ════════════════════════════════════════
// 事件总线订阅
// ════════════════════════════════════════
function subscribeBus() {
  // 修复：desktop:refresh 是 async 且无锁，短时间内多次 emit 会并发 renderAll 互相覆盖 DOM。
  // 用 _refreshing 标志去重：进行中的 refresh 不重复触发，改为标记 _refreshPending 待完成后补一次。
  let _refreshing = false;
  let _refreshPending = false;
  const doRefresh = async () => {
    if (_refreshing) { _refreshPending = true; return; }
    _refreshing = true;
    try {
      loadTheme();
      restoreCustomColors();
      applyPersonalization();
      applyDesktopScaleFromConfig();
      await applyCustomFont();
      await renderAll();
      await applyAllImages();
      refreshBadges();
    } catch (e) {
      console.warn('[desktop] refresh 失败', e);
    } finally {
      _refreshing = false;
      if (_refreshPending) { _refreshPending = false; doRefresh(); }
    }
  };
  bus.on('desktop:refresh', doRefresh);
  bus.on('desktop:refresh-badges', refreshBadges);
  bus.on('theme:changed', async () => {
    // theme.js 的 applyTheme 会先 removeProperty 所有变量再重设，
    // 我们叠在上面的个性化覆盖（字号/圆角/动效）被一起清掉了。
    // 必须清掉原值缓存（新主题的原值可能不同）再重新应用。
    clearPersonalizeCache();
    applyPersonalization();
    // 修复：壁纸遮罩色（.desktop::after 用 --wallpaper-soft）依赖主题变量，
    // 切主题后遮罩色可能仍为旧值。补刷一次壁纸让遮罩跟随主题。
    // 原版 applyWallpaper 是 async 但未 await，try-catch 捕获不到异步抛错 → 改 await。
    try { await applyWallpaper(); } catch (e) { /* 静默 */ }
    // 修复：锁屏背景遮罩与主题氛围同样依赖主题变量，切主题后需补刷。
    try { await applyLockBackground(); } catch (e) { /* 静默 */ }
  });
  bus.on('character:updated', async () => {
    try { currentCharacter = await getDefaultCharacter(); } catch (e) { /* 静默 */ }
    refreshLockScreen();
  });
  // 头像定制后刷新锁屏头像（character.avatar 已被 avatar App 同步更新）
  bus.on('avatar:updated', async () => {
    try { currentCharacter = await getDefaultCharacter(); } catch (e) { /* 静默 */ }
    refreshLockScreen();
  });
  // 删死订阅：app:installed 全代码库无人 emit
  bus.on('router:closed', refreshBadges);
  bus.on('router:home', goHome);
  bus.on('weather:refresh', () => { updateWeather(); });
  // 倒计时到期 / 增删改后刷新桌面 widget
  bus.on('countdown:due', () => { updateCountdownWidget(); });
  bus.on('countdown:changed', () => { updateCountdownWidget(); });
  // 修复：anniversary App 在增删改纪念日时 emit anniversary:changed，desktop 未订阅 → widget 不刷新。
  // 补订后用户在 anniversary App 改了纪念日，回桌面 widget 立刻更新。
  bus.on('anniversary:changed', () => { updateAnniversaryWidget(); });
  // 通知设置变更：重算徽章（角标开关/分APP开关/免打扰变了都要重算）
  bus.on('notify:settings-changed', () => { refreshBadges(); });
  // 消息中心：新消息 → 横幅通知 + 图标提示；状态变更 → 重算徽章
  bus.on('inbox:new', (payload) => {
    refreshBadges();
    showNoticeBanner(payload?.message);
  });
  bus.on('inbox:updated', () => { refreshBadges(); });
}

// ════════════════════════════════════════
// PWA 安装提示
// ════════════════════════════════════════
function setupPwaInstallPrompt() {
  window.popoInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.popoInstallPrompt = e;
    if (!getData(KEYS.appInstallPrompted, false)) {
      showToast('可以把泡泡装到桌面啦，去设置里看看', 'default', 3000);
      setData(KEYS.appInstallPrompted, true);
    }
  });
  window.addEventListener('appinstalled', () => {
    window.popoInstallPrompt = null;
    showToast('装好啦，以后能直接从桌面打开我啦', 'success');
  });
}

// ════════════════════════════════════════
// 桌面分页增删
// ════════════════════════════════════════
function getDesktopPageCount() {
  const n = Number(getData(KEYS.appDesktopPages, 2));
  if (!Number.isFinite(n) || n < 1) return 1;
  if (n > 6) return 6;
  return n;
}
async function setDesktopPageCount(n) {
  const oldCount = getDesktopPageCount();
  const clamped = Math.max(1, Math.min(6, Math.floor(Number(n) || 2)));
  setData(KEYS.appDesktopPages, clamped);
  // 修复：减页后 currentPage 可能越界（如 currentPage=3 设为 2 页），
  // updatePageDots 的高亮 i===currentPage 永远不匹配 → 无 active dot，
  // 且 pagesEl.children[currentPage] 为 undefined。必须夹紧。
  if (currentPage > clamped - 1) currentPage = clamped - 1;
  // 修复：减页时，原本放在被删页上的图标会"丢失"（getAppPage 返回的页号 >= clamped，
  // renderIconGrids 过滤掉，但图标没进 appHiddenIcons → 用户在设置里看不到也无法找回）。
  // 把这些图标自动加入 appHiddenIcons，用户能在"隐藏的图标"里恢复。
  if (clamped < oldCount) {
    try {
      const reg = await getRegistry();
      const overrides = getIconPageOverrides();
      const hidden = getData(KEYS.appHiddenIcons, []);
      const hiddenSet = new Set(hidden);
      let added = 0;
      for (const app of (reg.APPS || [])) {
        if (hiddenSet.has(app.id)) continue;
        const page = getAppPage(app.id);
        if (page >= clamped) {
          hiddenSet.add(app.id);
          added++;
          // 同时把它的 page 覆盖改成 0，恢复时能立刻看到
          overrides[app.id] = 0;
        }
      }
      if (added > 0) {
        setData(KEYS.appHiddenIcons, Array.from(hiddenSet));
        saveIconPageOverrides(overrides);
        showToast(`${added} 个图标因减页被收起啦，去设置里能恢复`, 'default', 2400);
      }
    } catch (e) {
      console.warn('[desktop] 减页回收图标失败', e);
    }
  }
  rebuildDesktopPages();
  renderAll();
}
function rebuildDesktopPages() {
  const count = getDesktopPageCount();
  pagesEl.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const page = document.createElement('section');
    page.className = 'desktop-page';
    page.dataset.page = String(i);
    page.innerHTML = `<div class="widget-area" data-widget-area="${i}"></div>
      <div class="icon-grid" data-icon-grid="${i}"></div>`;
    pagesEl.appendChild(page);
  }
  // 重建 page dots
  pageDotsEl.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('span');
    dot.className = 'page-dot';
    pageDotsEl.appendChild(dot);
  }
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 暴露给设置 App 用（图片写入后触发刷新）
// 修复：加 try-catch，避免 settings 调用处无保护导致 unhandledrejection
window.popoRefreshDesktop = async () => {
  try {
    rebuildDesktopPages();
    await renderAll();
    await applyAllImages();
    refreshBadges();
  } catch (e) {
    console.warn('[desktop] popoRefreshDesktop 失败', e);
  }
};
window.popoRefreshLock = async () => {
  try { await applyLockBackground(); } catch (e) { /* 静默 */ }
  refreshLockScreen();
};
window.popoGetPageCount = getDesktopPageCount;
window.popoSetPageCount = setDesktopPageCount;
// 删除 window.popoLock：全代码库无调用方的死接口。未来需要手动锁屏时再补。

// 启动
boot();
