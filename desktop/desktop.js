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
import { renderAppGrid, destroyAppGrid, updateAppBadge } from './app-grid.js';
import { renderDock, destroyDock, setDockActive, clearDockActive } from './dock.js';
import { isLocked } from '../core/lock.js';
import { openApp, closeApp, getCurrentAppId } from '../core/router.js';
import { initBackgrounds } from '../core/app-bg.js';
import { getCurrentTheme } from '../core/theme.js';
import events from '../core/events.js';

let _desktopEl = null;
let _desktopContentEl = null;
let _initialized = false;

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

  // 桌面内容区
  _desktopContentEl = document.createElement('div');
  _desktopContentEl.className = 'desktop-content';
  desktop.appendChild(_desktopContentEl);

  // 渲染各模块
  renderStatusBar(desktop);
  renderWidgets(_desktopContentEl);
  renderAppGrid(_desktopContentEl);
  renderDock(_desktopContentEl);

  // 显示桌面
  desktop.classList.remove('desktop-hidden');
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
  _initialized = false;
}

export { initDesktop, destroyDesktop };