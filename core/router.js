// ============================================
// router.js — APP路由
// 管理APP页面切换，不负责UI渲染，只负责状态和事件
// ============================================

import { APPS_REGISTRY, getAppById } from '../data/apps-registry.js';
import events from './events.js';

// 当前打开的APP
let _currentApp = null;
// 路由历史栈
let _history = [];
const MAX_HISTORY = 20;
// 桌面是否是当前活动页面
let _isDesktop = true;

// 打开APP
function openApp(appId, params = {}) {
  const app = getAppById(appId);
  if (!app) {
    console.warn(`[Router] APP "${appId}" 不存在`);
    return false;
  }

  const previous = _currentApp;

  _currentApp = {
    id: appId,
    name: app.name,
    entry: app.entry,
    params,
    openedAt: Date.now()
  };

  _isDesktop = false;

  _history.push({ appId, params, timestamp: Date.now() });
  if (_history.length > MAX_HISTORY) {
    _history = _history.slice(-MAX_HISTORY);
  }

  events.emit('router:changed', {
    action: 'open',
    current: appId,
    previous: previous ? previous.id : null,
    params
  });

  return true;
}

// 关闭当前APP，回到桌面
function closeApp() {
  if (_isDesktop) return;

  const closed = _currentApp;
  _currentApp = null;
  _isDesktop = true;

  events.emit('router:changed', {
    action: 'close',
    current: null,
    previous: closed ? closed.id : null
  });
}

// 切换到另一个APP
function switchApp(appId, params = {}) {
  const previous = _currentApp ? _currentApp.id : null;
  const success = openApp(appId, params);
  if (success) {
    events.emit('router:switched', {
      from: previous,
      to: appId,
      params
    });
  }
  return success;
}

// 获取当前APP信息
function getCurrentApp() {
  return _currentApp;
}

// 获取当前APP ID
function getCurrentAppId() {
  return _currentApp ? _currentApp.id : null;
}

// 是否在桌面
function isDesktop() {
  return _isDesktop;
}

// 获取路由历史
function getHistory() {
  return [..._history];
}

// 获取所有可用APP
function getAvailableApps() {
  return APPS_REGISTRY;
}

// 获取Dock上的APP
function getDockApps() {
  return APPS_REGISTRY.filter(app => app.desktop && app.desktop.dock);
}

// 获取桌面上的APP
function getDesktopApps() {
  return APPS_REGISTRY.filter(app => app.desktop && app.desktop.show);
}

// 返回上一页（历史栈）
function goBack() {
  if (_history.length <= 1) {
    closeApp();
    return;
  }

  _history.pop();
  const prev = _history[_history.length - 1];
  if (prev) {
    openApp(prev.appId, prev.params);
  }
}

// 清空历史
function clearHistory() {
  _history = [];
}

export {
  openApp,
  closeApp,
  switchApp,
  getCurrentApp,
  getCurrentAppId,
  isDesktop,
  getHistory,
  getAvailableApps,
  getDockApps,
  getDesktopApps,
  goBack,
  clearHistory
};