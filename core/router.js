// ============================================
// router.js — APP路由
// 管理当前打开的APP、导航、返回
// 不负责UI渲染，只负责状态和事件
// ============================================

import events from './events.js';
import { getAppById } from '../data/apps-registry.js';

// 路由状态
let _currentApp = null;
let _history = [];
let _maxHistory = 50;
let _isTransitioning = false;

// 获取当前APP信息
function getCurrentApp() {
  return _currentApp;
}

// 获取当前APP ID
function getCurrentAppId() {
  return _currentApp ? _currentApp.id : null;
}

// 获取路由历史
function getHistory() {
  return [..._history];
}

// 是否可以返回
function canGoBack() {
  return _history.length > 0;
}

// 是否正在切换
function isTransitioning() {
  return _isTransitioning;
}

// 打开APP
function openApp(appId, options = {}) {
  const { params = {}, replace = false } = options;

  const appDef = getAppById(appId);
  if (!appDef) {
    console.warn(`[Router] APP "${appId}" 不存在`);
    return false;
  }

  if (_isTransitioning) return false;

  _isTransitioning = true;

  const previousApp = _currentApp;

  // 记录历史
  if (_currentApp && !replace) {
    _history.push({
      appId: _currentApp.id,
      params: _currentApp.params || {}
    });
    if (_history.length > _maxHistory) {
      _history = _history.slice(-_maxHistory);
    }
  }

  _currentApp = {
    id: appId,
    definition: appDef,
    params,
    openedAt: Date.now()
  };

  events.emit('route:changed', {
    action: 'open',
    appId,
    previousAppId: previousApp ? previousApp.id : null,
    params,
    replace
  });

  events.emit('app:opened', {
    appId,
    definition: appDef,
    params
  });

  // 延迟重置过渡状态，防止快速切换
  setTimeout(() => {
    _isTransitioning = false;
  }, 300);

  return true;
}

// 关闭当前APP（返回桌面）
function closeApp() {
  if (!_currentApp) return false;
  if (_isTransitioning) return false;

  _isTransitioning = true;

  const closingApp = _currentApp;

  _currentApp = null;

  events.emit('route:changed', {
    action: 'close',
    appId: closingApp.id,
    previousAppId: closingApp.id
  });

  events.emit('app:closed', {
    appId: closingApp.id
  });

  setTimeout(() => {
    _isTransitioning = false;
  }, 300);

  return true;
}

// 返回上一个APP或桌面
function goBack() {
  if (!canGoBack()) {
    return closeApp();
  }

  if (_isTransitioning) return false;

  _isTransitioning = true;

  const previous = _history.pop();
  const previousApp = _currentApp ? _currentApp.id : null;

  // 打开上一个APP
  const appDef = getAppById(previous.appId);
  if (!appDef) {
    _isTransitioning = false;
    return closeApp();
  }

  _currentApp = {
    id: previous.appId,
    definition: appDef,
    params: previous.params || {},
    openedAt: Date.now()
  };

  events.emit('route:changed', {
    action: 'back',
    appId: previous.appId,
    previousAppId: previousApp
  });

  events.emit('app:opened', {
    appId: previous.appId,
    definition: appDef,
    params: previous.params
  });

  setTimeout(() => {
    _isTransitioning = false;
  }, 300);

  return true;
}

// 切换到APP（替换当前）
function switchTo(appId, params = {}) {
  return openApp(appId, { params, replace: true });
}

// 清空历史
function clearHistory() {
  _history = [];
}

// 重置路由状态
function reset() {
  _currentApp = null;
  _history = [];
  _isTransitioning = false;
}

// 监听外部关闭（如APP内返回按钮）
events.on('app:closed', () => {
  _currentApp = null;
  _isTransitioning = false;
});

export {
  getCurrentApp,
  getCurrentAppId,
  getHistory,
  canGoBack,
  isTransitioning,
  openApp,
  closeApp,
  goBack,
  switchTo,
  clearHistory,
  reset
};