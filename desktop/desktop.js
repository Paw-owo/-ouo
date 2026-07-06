// ============================================
// desktop.js — 桌面壳总装
// 负责把状态区、小组件、图标网格、dock、锁屏切换串起来
// 不把所有子模块逻辑重新堆回这里
// 与 core/router、core/app-bg、core/theme、core/inbox 正常接上
// ============================================

import { startBoot } from './boot.js';
import { showLockScreen, hideLockScreen } from './lockscreen.js';
import { renderStatusBar, refreshStatusBar } from './status-bar.js';
import { renderWidgets, destroyWidgets } from './widgets.js';
import {
  renderAppGridPage,
  destroyAppGrid,
  updateAppBadge,
  getDisplayApps,
  setAppGridTrack
} from './app-grid.js';
import { renderDock, destroyDock, setDockActive, clearDockActive } from './dock.js';
import { isLocked } from '../core/lock.js';
import { openApp, closeApp, getCurrentAppId } from '../core/router.js';
import { initBackgrounds } from '../core/app-bg.js';
import { getCurrentTheme } from '../core/theme.js';
import events from '../core/events.js';

let _desktopEl = null;
let _desktopContentEl = null;
let _pagesTrackEl = null; // 横向页面轨道
let _indicatorEl = null; // 页面指示器
let _scrollSyncBound = false;
let _initialized = false;

// 每页APP图标数量（4列 × 3行，与移动端单屏可视范围匹配）
const APPS_PER_PAGE = 12;

// 获取桌面容器
function _getDesktopEl() {
  if (_desktopEl) return _desktopEl;
  _desktopEl = document.getElementById('desktop');
  return _desktopEl;
}

// 获取桌面内容区
function _getDesktopContent() {
  if (_desktopContentEl) return _desktopContentEl;
  const desktop = _getDesktopEl();
  if (!desktop) return null;
  _desktopContentEl = desktop.querySelector('.desktop-content');
  if (!_desktopContentEl) {
    _desktopContentEl = document.createElement('div');
    _desktopContentEl.className = 'desktop-content';
    desktop.appendChild(_desktopContentEl);
  }
  return _desktopContentEl;
}

// 渲染桌面UI
function _renderDesktop() {
  const desktop = _getDesktopEl();
  if (!desktop) return;

  // 清空桌面
  desktop.innerHTML = '';

  // 渲染顶部状态栏（先于内容区插入，保持在桌面顶部）
  renderStatusBar(desktop);

  // 桌面内容区：横向分页容器
  _desktopContentEl = document.createElement('div');
  _desktopContentEl.className = 'desktop-content';
  desktop.appendChild(_desktopContentEl);

  // 页面轨道：横向排列，scroll-snap 翻页
  _pagesTrackEl = document.createElement('div');
  _pagesTrackEl.className = 'desktop-pages-track';
  _desktopContentEl.appendChild(_pagesTrackEl);

  // 构建分页
  _buildPages();

  // 页面指示器（固定在轨道下方，跟随当前页）
  _indicatorEl = document.createElement('div');
  _indicatorEl.className = 'page-indicator';
  _desktopContentEl.appendChild(_indicatorEl);
  _syncIndicator();

  // 绑定滚动同步
  _bindScrollSync();

  // Dock（保持固定在桌面底部，不参与横向分页）
  renderDock(_desktopContentEl);

  // 显示桌面
  desktop.classList.remove('desktop-hidden');
}

// 构建横向分页：第一页含小组件 + 第一批图标，其余页含后续图标切片
function _buildPages() {
  if (!_pagesTrackEl) return;

  const apps = getDisplayApps();
  const pageCount = Math.max(1, Math.ceil(apps.length / APPS_PER_PAGE));

  for (let i = 0; i < pageCount; i++) {
    const page = document.createElement('div');
    page.className = 'desktop-page';
    page.dataset.pageIndex = String(i);
    _pagesTrackEl.appendChild(page);

    // 第一页放小组件
    if (i === 0) {
      renderWidgets(page);
    }

    // 该页的图标网格区
    const gridArea = document.createElement('div');
    gridArea.className = 'app-grid-area';
    page.appendChild(gridArea);

    const slice = apps.slice(i * APPS_PER_PAGE, (i + 1) * APPS_PER_PAGE);
    renderAppGridPage(gridArea, slice, i * APPS_PER_PAGE);
  }

  // 记录轨道引用，便于 updateAppBadge 跨页查找
  setAppGridTrack(_pagesTrackEl);
}

// 绑定滚动同步：更新指示器当前页
function _bindScrollSync() {
  if (!_pagesTrackEl || _scrollSyncBound) return;
  _scrollSyncBound = true;

  let rafId = 0;
  _pagesTrackEl.addEventListener('scroll', () => {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = 0;
      _syncIndicator();
    });
  }, { passive: true });
}

// 同步指示器：根据当前滚动位置计算页码并高亮
function _syncIndicator() {
  if (!_indicatorEl || !_pagesTrackEl) return;

  const pages = _pagesTrackEl.querySelectorAll('.desktop-page');
  const pageCount = pages.length;
  if (pageCount === 0) return;

  const pageWidth = _pagesTrackEl.clientWidth || pages[0].clientWidth;
  const current = pageWidth > 0
    ? Math.round(_pagesTrackEl.scrollLeft / pageWidth)
    : 0;
  const clamped = Math.max(0, Math.min(current, pageCount - 1));

  // 重建指示点（页数变化时也要同步）
  if (_indicatorEl.childElementCount !== pageCount) {
    _indicatorEl.innerHTML = '';
    for (let i = 0; i < pageCount; i++) {
      const dot = document.createElement('div');
      dot.className = 'page-dot';
      dot.dataset.pageIndex = String(i);
      dot.addEventListener('click', () => _goToPage(i));
      _indicatorEl.appendChild(dot);
    }
  }

  _indicatorEl.querySelectorAll('.page-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === clamped);
  });
}

// 跳转到指定页
function _goToPage(index) {
  if (!_pagesTrackEl) return;
  const pageWidth = _pagesTrackEl.clientWidth;
  _pagesTrackEl.scrollTo({ left: index * pageWidth, behavior: 'smooth' });
}

// 隐藏桌面
function _hideDesktop() {
  const desktop = _getDesktopEl();
  if (desktop) {
    desktop.classList.add('desktop-hidden');
  }
}

// 显示桌面
function _showDesktop() {
  const desktop = _getDesktopEl();
  if (desktop) {
    desktop.classList.remove('desktop-hidden');
  }
}

// 处理APP打开
function _handleAppOpen(event) {
  const { appId } = event;
  if (!appId) return;

  // 打开APP路由
  const success = openApp(appId);
  if (success) {
    setDockActive(appId);
    // 桌面隐藏（APP全屏覆盖）
    _hideDesktop();
  }
}

// 处理APP关闭
function _handleAppClose() {
  closeApp();
  clearDockActive();
  _showDesktop();
}

// 处理锁屏解锁
function _handleUnlock() {
  hideLockScreen();
  _showDesktop();
  _renderDesktop();
}

// 处理锁屏上锁
function _handleLock() {
  showLockScreen();
  _hideDesktop();
}

// 绑定事件
function _bindEvents() {
  // APP点击
  events.on('desktop:app-click', _handleAppOpen);

  // 路由变化
  events.on('app:closed', () => {
    clearDockActive();
    _showDesktop();
  });

  // 锁屏事件
  events.on('lock:locked', _handleLock);
  events.on('lock:unlocked', _handleUnlock);
  events.on('lockscreen:unlocked', _handleUnlock);

  // 主题切换
  events.on('theme:changed', () => {
    refreshStatusBar();
  });

  // 通知角标更新（预留接口）
  events.on('notification:dispatched', (payload) => {
    if (payload && payload.appId) {
      // 后续 inbox 接入后更新角标
      // updateAppBadge(payload.appId, count);
    }
  });
}

// 初始化桌面
async function initDesktop() {
  if (_initialized) return;
  _initialized = true;

  // 确保桌面容器存在
  const desktop = _getDesktopEl();
  if (!desktop) {
    console.warn('[Desktop] 桌面容器 #desktop 不存在');
    return;
  }

  // 绑定事件
  _bindEvents();

  // 启动流程
  const locked = await startBoot();

  if (locked) {
    // 显示锁屏
    showLockScreen();
    _hideDesktop();
  } else {
    // 直接进入桌面
    _renderDesktop();
  }
}

// 销毁桌面
function destroyDesktop() {
  destroyWidgets();
  destroyAppGrid();
  destroyDock();

  if (_desktopEl) {
    _desktopEl.innerHTML = '';
  }
  _desktopContentEl = null;
  _pagesTrackEl = null;
  _indicatorEl = null;
  _scrollSyncBound = false;
  _initialized = false;
}

export { initDesktop, destroyDesktop };