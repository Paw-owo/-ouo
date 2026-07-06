// ============================================
// app-bg.js — 背景系统
// 统一管理：主题背景、桌面壁纸、锁屏壁纸、APP单独背景
// 所有背景读写通过此文件，不直接操作DOM或localStorage
// ============================================

import { get, set } from './config.js';
import { STORAGE_KEYS } from './storage-keys.js';
import events from './events.js';

// 内置默认背景
const DEFAULT_BG = {
  desktop: 'var(--bg-desktop)',
  lockscreen: 'var(--bg-lockscreen)',
  app: 'var(--bg-app)'
};

// 当前激活的背景
let _currentBg = {
  desktop: null,
  lockscreen: null,
  app: null
};

// 初始化背景系统
function initBg() {
  const sync = get('wallpaperSync');
  const desktopWallpaper = get('wallpaper');
  const lockscreenWallpaper = get('lockscreenWallpaper');

  if (sync && desktopWallpaper) {
    setDesktopBg(desktopWallpaper);
    setLockscreenBg(desktopWallpaper);
  } else {
    if (desktopWallpaper) setDesktopBg(desktopWallpaper);
    if (lockscreenWallpaper) setLockscreenBg(lockscreenWallpaper);
  }

  events.emit('bg:initialized', { current: { ..._currentBg } });
}

// 设置桌面壁纸
function setDesktopBg(source) {
  _currentBg.desktop = _normalizeBgSource(source);
  set('wallpaper', source);
  _applyBgToDOM('desktop', _currentBg.desktop);
  events.emit('bg:changed', { target: 'desktop', source: _currentBg.desktop });
}

// 设置锁屏壁纸
function setLockscreenBg(source) {
  _currentBg.lockscreen = _normalizeBgSource(source);
  set('lockscreenWallpaper', source);
  _applyBgToDOM('lockscreen', _currentBg.lockscreen);
  events.emit('bg:changed', { target: 'lockscreen', source: _currentBg.lockscreen });
}

// 设置APP单独背景
function setAppBg(appId, source) {
  if (!_currentBg.app) _currentBg.app = {};
  _currentBg.app[appId] = _normalizeBgSource(source);
  events.emit('bg:changed', { target: 'app', appId, source: _currentBg.app[appId] });
}

// 移除APP单独背景
function removeAppBg(appId) {
  if (_currentBg.app) {
    delete _currentBg.app[appId];
  }
  events.emit('bg:changed', { target: 'app', appId, source: null });
}

// 获取当前背景
function getBg(target = 'desktop') {
  if (target === 'app') {
    return _currentBg.app || {};
  }
  return _currentBg[target] || null;
}

// 获取实际渲染用的CSS背景值
function getBgStyle(target = 'desktop', appId = null) {
  let source = null;

  if (target === 'app' && appId && _currentBg.app && _currentBg.app[appId]) {
    source = _currentBg.app[appId];
  } else if (target === 'lockscreen') {
    source = _currentBg.lockscreen;
  } else {
    source = _currentBg.desktop;
  }

  return _bgSourceToCSS(source);
}

// 清除所有背景，回到主题默认
function clearAllBg() {
  _currentBg = { desktop: null, lockscreen: null, app: null };
  ['desktop', 'lockscreen'].forEach(target => {
    _applyBgToDOM(target, null);
  });
  events.emit('bg:cleared', {});
}

// 内部：规范化背景来源
function _normalizeBgSource(source) {
  if (!source) return null;
  if (source === 'theme') return 'theme';
  if (source.startsWith('http') || source.startsWith('/') || source.startsWith('data:')) {
    return source;
  }
  if (source.startsWith('#')) return source;
  if (source.startsWith('linear-gradient') || source.startsWith('radial-gradient')) {
    return source;
  }
  return source;
}

// 内部：将背景来源转为CSS background值
function _bgSourceToCSS(source) {
  if (!source) return 'var(--bg-desktop)';
  if (source === 'theme') return 'var(--bg-desktop)';
  if (source.startsWith('linear-gradient') || source.startsWith('radial-gradient')) {
    return source;
  }
  if (source.startsWith('#')) return source;
  return `url("${source}") center/cover no-repeat`;
}

// 内部：将背景应用到DOM元素
function _applyBgToDOM(target, source) {
  const selector = target === 'lockscreen' ? '#lockscreen' : '#desktop';
  const el = document.querySelector(selector);
  if (!el) return;

  const cssValue = _bgSourceToCSS(source);
  el.style.background = cssValue;
}

export {
  initBg,
  setDesktopBg,
  setLockscreenBg,
  setAppBg,
  removeAppBg,
  getBg,
  getBgStyle,
  clearAllBg
};