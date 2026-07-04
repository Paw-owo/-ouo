// desktop.js
// 桌面壳逻辑：启动 / 锁屏 / 桌面渲染 / 5 个预设 widget /
// 图标拖拽（长按编辑 + 网格重排 + 删除）/ Dock 重排 / 壁纸 / 徽章。
// 所有视觉值走 CSS 变量（style.css + theme.js），所有魔法数字走 config.js。
// 依赖：core/* + apps-registry.js

import { initDB, ensureDefaultSettings, getData, setData, removeData, getDB, setDB, deleteDB, getAllDB, generateId, getNow, compressImage } from './core/storage.js';
import { STORES, KEYS } from './core/storage-keys.js';
import { loadTheme, applyTheme, getCurrentTheme, setTheme, applyFontFamily, applyDesktopScale, getPresets } from './core/theme.js';
import { createIcon, showToast, showConfirm, showBottomSheet, hideBottomSheet } from './core/ui.js';
import { pickImageFile, clamp, debounce, cssUrl, isUsableImage } from './core/util.js';
import { get as getConfig } from './core/config.js';
import bus from './core/events.js';
import { openApp, goHome } from './core/router.js';
import { seedDefaultCharacter, getDefaultCharacter } from './core/seed.js';

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
let lockInput = '';
let clockTimer = null;
let weatherTimer = null;
let vinylTimer = null;
let currentCharacter = null;

// 状态栏图标（8 个，纯装饰 + 时间）
const STATUS_ICONS = ['heart', 'sun', 'weather', 'music', 'star', 'calendar', 'moon', 'bell'];

// 5 个预设 widget 定义
const WIDGETS = [
  { id: 'time', type: 'time', shape: 'wide', page: 0 },
  { id: 'weather', type: 'weather', shape: 'square', page: 0 },
  { id: 'anniversary', type: 'anniversary', shape: 'square', page: 0 },
  { id: 'focus', type: 'focus', shape: 'wide', page: 0 },
  { id: 'vinyl', type: 'vinyl', shape: 'wide', page: 1 }
];

// ════════════════════════════════════════
// 启动
// ════════════════════════════════════════
async function boot() {
  try {
    await initDB();
    ensureDefaultSettings();
    loadTheme();
    applyDesktopScaleFromConfig();
    await applyCustomFont();
    await seedDefaultCharacter();
    currentCharacter = await getDefaultCharacter();
    await renderAll();
    bindEvents();
    initWidgets();
    await applyAllImages();
    refreshLockScreen();
    refreshBadges();
    subscribeBus();
  } catch (e) {
    console.error('[boot]', e);
    showToast('哎呀，启动出了点问题', 'error');
  } finally {
    setTimeout(() => {
      bootEl.classList.add('hide');
      setTimeout(() => bootEl.remove(), 280);
    }, 260);
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
  renderDock();
  await renderWidgets();
  renderIconGrids();
  updateEditingClass();
  updatePageDots();
}

function renderStatusBar() {
  statusCapsuleEl.innerHTML = '';
  STATUS_ICONS.forEach((name, i) => {
    const wrap = document.createElement('span');
    wrap.className = 'status-bar-icon';
    wrap.appendChild(createIcon(name, 18));
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

function updateStatusTime() {
  const el = $('status-time');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

async function getRegistry() {
  try { return await import('./apps-registry.js'); }
  catch (e) { console.warn('[desktop] 注册表加载失败', e); return { APPS: [] }; }
}

function getDockOrder(reg) {
  const dockIds = reg.APPS.filter((a) => a.dock).map((a) => a.id);
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
  getDockOrder(reg).forEach((appId) => {
    const app = reg.APPS.find((a) => a.id === appId && a.dock);
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
  img.appendChild(createIcon(app.icon, 26));
  const label = document.createElement('span');
  label.className = 'dock-icon-label';
  label.textContent = app.name;
  el.append(img, label);
  el.addEventListener('click', () => { if (!editing) openApp(app.id); });
  return el;
}

async function renderWidgets() {
  document.querySelectorAll('[data-widget-area]').forEach((area) => area.innerHTML = '');
  for (const w of WIDGETS) {
    const area = document.querySelector(`[data-widget-area="${w.page}"]`);
    if (!area) continue;
    const el = await createWidget(w);
    area.appendChild(el);
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
  } else if (w.type === 'focus') {
    const focus = getData(KEYS.appFocusWidget, { title: '今天也要好好休息', text: '打开设置，看看我能帮你做什么' });
    el.innerHTML = `<div class="widget-title">今日提示</div><div class="widget-value" id="w-focus-title">${escapeHtml(focus.title || '今天也要好好休息')}</div><div class="widget-sub" id="w-focus-text">${escapeHtml(focus.text || '')}</div>`;
  } else if (w.type === 'vinyl') {
    el.innerHTML = `
      <div class="widget-vinyl">
        <div class="widget-vinyl-disc" id="w-vinyl-disc"></div>
        <div class="widget-vinyl-info">
          <div class="widget-vinyl-title" id="w-vinyl-title">还没有歌曲呢</div>
          <div class="widget-vinyl-artist" id="w-vinyl-artist">去音乐里挑一首吧</div>
          <div class="widget-vinyl-controls">
            <button type="button" id="w-vinyl-prev" aria-label="上一首">${createIcon('prev', 14).outerHTML}</button>
            <button type="button" id="w-vinyl-play" aria-label="播放">${createIcon('play', 14).outerHTML}</button>
            <button type="button" id="w-vinyl-next" aria-label="下一首">${createIcon('next', 14).outerHTML}</button>
          </div>
        </div>
      </div>`;
    el.querySelector('#w-vinyl-play').addEventListener('click', (e) => { e.stopPropagation(); window.musicPlayer?.togglePlay?.(); });
    el.querySelector('#w-vinyl-prev').addEventListener('click', (e) => { e.stopPropagation(); window.musicPlayer?.playPrevious?.(); });
    el.querySelector('#w-vinyl-next').addEventListener('click', (e) => { e.stopPropagation(); window.musicPlayer?.playNext?.(); });
  }
  return el;
}

async function renderIconGrids() {
  const reg = await getRegistry();
  const hidden = getHiddenIcons();
  document.querySelectorAll('[data-icon-grid]').forEach((g) => g.innerHTML = '');
  const apps = reg.APPS.filter((a) => !a.dock && !hidden.includes(a.id));
  apps.forEach((app) => {
    const grid = document.querySelector(`[data-icon-grid="${app.page || 0}"]`);
    if (grid) grid.appendChild(createDesktopIcon(app));
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
// 图标拖拽（长按进入编辑态，网格内重排）
// ════════════════════════════════════════
function handleIconPointerDown(event, element) {
  if (event.button !== undefined && event.button !== 0) return;
  const pressMs = getConfig('ui.iconEditPressMs', 620);
  const startX = event.clientX, startY = event.clientY;
  let pressTimer = setTimeout(() => {
    if (!moved) { editing = true; updateEditingClass(); showToast('长按拖动可以调整位置哦'); }
  }, pressMs);
  let moved = false;
  let dragGhost = null;
  let originGrid = null;

  const onMove = (e) => {
    const dx = e.clientX - startX, dy = e.clientY - startY;
    if (!moved && Math.hypot(dx, dy) < 4) return;
    if (!moved) {
      moved = true;
      clearTimeout(pressTimer);
      editing = true; updateEditingClass();
      originGrid = element.parentElement;
      dragGhost = element.cloneNode(true);
      dragGhost.style.position = 'fixed';
      dragGhost.style.zIndex = '999';
      dragGhost.style.pointerEvents = 'none';
      dragGhost.style.opacity = '0.85';
      dragGhost.style.transform = 'scale(1.08)';
      document.body.appendChild(dragGhost);
      element.style.opacity = '0.3';
    }
    e.preventDefault();
    if (dragGhost) {
      dragGhost.style.left = (e.clientX - 30) + 'px';
      dragGhost.style.top = (e.clientY - 30) + 'px';
    }
    // 高亮目标位置
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.desktop-icon[data-app-id]');
    document.querySelectorAll('.desktop-icon.drop-target').forEach((n) => n.classList.remove('drop-target'));
    if (target && target !== element && target.parentElement === originGrid) {
      target.classList.add('drop-target');
    }
  };

  const onUp = (e) => {
    clearTimeout(pressTimer);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    document.querySelectorAll('.desktop-icon.drop-target').forEach((n) => n.classList.remove('drop-target'));
    if (dragGhost) dragGhost.remove();
    element.style.opacity = '';
    if (!moved) return;
    const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.desktop-icon[data-app-id]');
    if (target && target !== element && target.parentElement === originGrid) {
      // 在 target 前插入
      originGrid.insertBefore(element, target);
      saveIconOrder(originGrid);
      showToast('好啦，位置记下来啦', 'success');
    }
    setTimeout(() => { /* 保持编辑态，用户可继续调整或点空白退出 */ }, 60);
  };

  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });
}

function saveIconOrder(grid) {
  const ids = [...grid.querySelectorAll('.desktop-icon[data-app-id]')].map((n) => n.dataset.appId);
  setData(KEYS.appIconOrder(grid.dataset.iconGrid || '0'), ids);
}

function updateEditingClass() {
  document.querySelectorAll('.desktop-icon').forEach((el) => el.classList.toggle('editing', editing));
}

// ════════════════════════════════════════
// 页面指示 & 事件
// ════════════════════════════════════════
function updatePageDots() {
  [...pageDotsEl.children].forEach((dot, i) => dot.classList.toggle('active', i === currentPage));
}

function bindEvents() {
  pagesEl.addEventListener('scroll', debounce(() => {
    currentPage = Math.round(pagesEl.scrollLeft / (pagesEl.clientWidth || 1));
    updatePageDots();
  }, 80), { passive: true });

  // 点空白退出编辑态
  desktopEl.addEventListener('click', (e) => {
    if (!editing) return;
    if (e.target.closest('.desktop-icon, .widget, .dock, .status-bar, .page-dots')) return;
    editing = false; updateEditingClass();
  });

  // 窗口尺寸变化重排
  window.addEventListener('resize', debounce(async () => { await renderAll(); await applyAllImages(); }, 260));

  // 锁屏键盘
  lockPadEl.addEventListener('click', onLockKeyClick);

  // 存储/事件同步
  window.addEventListener('storage', () => { applyAllImages(); refreshBadges(); });
}

function onLockKeyClick(e) {
  const key = e.target.closest('[data-key]')?.dataset.key;
  if (!key) return;
  if (key === 'clear') { lockInput = ''; lockErrorEl.textContent = ''; renderLockDots(); return; }
  if (key === 'delete') { lockInput = lockInput.slice(0, -1); lockErrorEl.textContent = ''; renderLockDots(); return; }
  const pwd = getData(KEYS.appLockPassword, '0326');
  if (lockInput.length >= String(pwd).length) return;
  lockInput += key;
  lockErrorEl.textContent = '';
  renderLockDots();
  if (lockInput.length === String(pwd).length) setTimeout(checkLockPassword, 120);
}

function renderLockDots() {
  const pwd = getData(KEYS.appLockPassword, '0326');
  [...lockDotsEl.children].forEach((dot, i) => dot.classList.toggle('filled', i < lockInput.length));
  void pwd;
}

function checkLockPassword() {
  const pwd = getData(KEYS.appLockPassword, '0326');
  if (lockInput === String(pwd)) {
    setData(KEYS.appLockUnlocked, true);
    lockScreenEl.classList.add('unlocked');
    setTimeout(() => lockScreenEl.classList.add('hidden'), 360);
    showToast('解锁啦，见到你真好', 'success');
    return;
  }
  lockInput = '';
  lockErrorEl.textContent = '嘿嘿，不对哦';
  [...lockDotsEl.children].forEach((dot) => dot.classList.add('shake'));
  setTimeout(() => [...lockDotsEl.children].forEach((dot) => dot.classList.remove('shake')), 360);
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
  // 显示角色名
  if (currentCharacter?.name) {
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
  updateVinylWidget();
  clearInterval(vinylTimer);
  vinylTimer = setInterval(updateVinylWidget, 1000);
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
  const cached = getData(KEYS.weatherCache, null);
  const now = Date.now();
  if (cached?.text && now - Number(cached.updatedAt || 0) < 30 * 60 * 1000) {
    el.textContent = cached.text; return;
  }
  try {
    const resp = await fetch('https://wttr.in/?format=j1', { cache: 'no-store' });
    const data = await resp.json();
    const cur = data?.current_condition?.[0] || {};
    const area = data?.nearest_area?.[0]?.areaName?.[0]?.value || '';
    const temp = cur.temp_C ? `${cur.temp_C}℃` : '';
    const desc = cur.lang_zh?.[0]?.value || cur.weatherDesc?.[0]?.value || '';
    const text = [area, temp, desc].filter(Boolean).join(' · ') || '天气躲起来了';
    el.textContent = text;
    setData(KEYS.weatherCache, { text, updatedAt: now });
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

function getAllAnniversaries() {
  for (const k of ['anniversaries', 'app_anniversaries']) {
    const v = getData(k, null);
    if (Array.isArray(v)) return v;
  }
  return [];
}
function parseDate(v) { if (!v) return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; }
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function updateVinylWidget() {
  const disc = $('w-vinyl-disc');
  const title = $('w-vinyl-title');
  const artist = $('w-vinyl-artist');
  const playBtn = $('w-vinyl-play');
  const player = window.musicPlayer;
  const isPlaying = player?.isPlaying?.() || false;
  const song = player?.getCurrentSong?.() || null;
  if (disc) disc.classList.toggle('playing', isPlaying);
  if (title) title.textContent = song?.title || '还没有歌曲呢';
  if (artist) artist.textContent = song ? (song.artist || '未知艺术家') : '去音乐里挑一首吧';
  if (playBtn) {
    playBtn.innerHTML = '';
    playBtn.appendChild(createIcon(isPlaying ? 'pause' : 'play', 14));
  }
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
  bus.emit('desktop:images-applied');
}

async function applyWallpaper() {
  const rec = await getDB(STORES.blobs, KEYS.appWallpaper);
  const url = rec?.value || rec?.source || rec?.data || '';
  const opacity = Number(rec?.opacity ?? 100) / 100;
  if (isUsableImage(url)) {
    desktopEl.style.backgroundImage = `url("${cssUrl(url)}")`;
    desktopEl.style.backgroundSize = 'cover';
    desktopEl.style.backgroundPosition = 'center';
    document.documentElement.style.setProperty('--wallpaper-soft', String(opacity));
  } else {
    desktopEl.style.backgroundImage = '';
    document.documentElement.style.setProperty('--wallpaper-soft', '0.10');
  }
}

async function applyLockBackground() {
  const rec = await getDB(STORES.blobs, KEYS.appLockWallpaper);
  const url = rec?.value || rec?.source || rec?.data || '';
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
  const map = getBadgeMap();
  document.querySelectorAll('[data-badge]').forEach((el) => {
    const count = Number(map[el.dataset.badge] || 0);
    if (count > 0) {
      el.textContent = count > 99 ? '99+' : String(count);
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
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
// 事件总线订阅
// ════════════════════════════════════════
function subscribeBus() {
  bus.on('desktop:refresh', async () => {
    loadTheme();
    applyDesktopScaleFromConfig();
    await applyCustomFont();
    await renderAll();
    await applyAllImages();
    refreshBadges();
  });
  bus.on('desktop:refresh-badges', refreshBadges);
  bus.on('theme:changed', () => { /* theme.js 已应用变量，无需额外动作 */ });
  bus.on('character:updated', async () => {
    currentCharacter = await getDefaultCharacter();
    refreshLockScreen();
  });
  bus.on('app:installed', async () => { await renderAll(); await applyAllImages(); });
  bus.on('router:closed', refreshBadges);
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════
function escapeHtml(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// 暴露给设置 App 用（图片写入后触发刷新）
window.popoRefreshDesktop = async () => { await renderAll(); await applyAllImages(); refreshBadges(); };
window.popoRefreshLock = refreshLockScreen;
window.popoLock = () => { setData(KEYS.appLockUnlocked, false); lockScreenEl.classList.remove('unlocked', 'hidden'); lockInput = ''; lockErrorEl.textContent = ''; renderLockDots(); };

// 启动
boot();
