// ============================================
// app-bg.js — 背景系统
// 统一管理：桌面壁纸、锁屏壁纸、APP单独背景
// 背景来源：主题默认渐变 / 用户自定义URL / 纯色
// 所有读写走 config 统一出口，不直接裸读 localStorage
// ============================================

import { get, set, reset } from './config.js';
import events from './events.js';
import { getCurrentPreset } from './theme.js';

// 背景类型
const BG_TYPE = Object.freeze({
  THEME_DEFAULT: 'theme_default',
  CUSTOM_URL:    'custom_url',
  CUSTOM_COLOR:  'custom_color',
  CUSTOM_GRADIENT: 'custom_gradient'
});

// 背景作用域
const BG_SCOPE = Object.freeze({
  DESKTOP:    'desktop',
  LOCKSCREEN: 'lockscreen',
  APP:        'app'
});

// config key 到作用域的映射
const _SCOPE_TO_CONFIG_KEY = {
  [BG_SCOPE.DESKTOP]:    'wallpaper',
  [BG_SCOPE.LOCKSCREEN]: 'lockscreenWallpaper',
  [BG_SCOPE.APP]:        'appBg'
};

// 当前激活的背景状态
let _currentBackgrounds = {
  [BG_SCOPE.DESKTOP]:    { type: BG_TYPE.THEME_DEFAULT, value: null },
  [BG_SCOPE.LOCKSCREEN]: { type: BG_TYPE.THEME_DEFAULT, value: null },
  [BG_SCOPE.APP]:        { type: BG_TYPE.THEME_DEFAULT, value: null }
};

// APP级背景覆盖（按appId）
let _appBgOverrides = new Map();

// 从主题预设获取默认背景色
function _getThemeDefaultBg() {
  const preset = getCurrentPreset();
  if (preset && preset.colors) {
    return preset.colors['--bg-primary'] || preset.colors['--bg-deep'] || '#f5f0e8';
  }
  return '#f5f0e8';
}

// 计算CSS背景值
function _computeBgValue(type, value) {
  switch (type) {
    case BG_TYPE.THEME_DEFAULT:
      return _getThemeDefaultBg();
    case BG_TYPE.CUSTOM_URL:
      return `url("${value}") center / cover no-repeat`;
    case BG_TYPE.CUSTOM_COLOR:
      return value;
    case BG_TYPE.CUSTOM_GRADIENT:
      return value;
    default:
      return _getThemeDefaultBg();
  }
}

// 获取指定作用域的背景信息
function getBackground(scope) {
  return { ..._currentBackgrounds[scope] };
}

// 获取CSS可直接使用的背景值
function getBackgroundCSS(scope) {
  const bg = _currentBackgrounds[scope];
  return _computeBgValue(bg.type, bg.value);
}

// 获取当前打开的APP的背景（带APP级覆盖检查）
function getAppBackground(appId) {
  if (appId && _appBgOverrides.has(appId)) {
    return _appBgOverrides.get(appId);
  }
  return getBackground(BG_SCOPE.APP);
}

function getAppBackgroundCSS(appId) {
  const bg = getAppBackground(appId);
  return _computeBgValue(bg.type, bg.value);
}

// 设置背景（通过 config 持久化）
function setBackground(scope, type, value, options = {}) {
  const { appId, persist = true } = options;

  const bg = { type, value: value || null };

  if (appId) {
    _appBgOverrides.set(appId, bg);
    if (persist) {
      _saveAppBgOverrides();
    }
  } else {
    _currentBackgrounds[scope] = bg;
    if (persist) {
      const configKey = _SCOPE_TO_CONFIG_KEY[scope];
      if (configKey) set(configKey, bg);
    }
  }

  _applyBgToDOM(scope, appId);

  events.emit('bg:changed', {
    scope,
    appId: appId || null,
    type,
    value
  });
}

// 重置为默认
function resetBackground(scope, appId) {
  if (appId) {
    _appBgOverrides.delete(appId);
    _saveAppBgOverrides();
  } else {
    _currentBackgrounds[scope] = { type: BG_TYPE.THEME_DEFAULT, value: null };
    const configKey = _SCOPE_TO_CONFIG_KEY[scope];
    if (configKey) reset(configKey);
  }

  _applyBgToDOM(scope, appId);

  events.emit('bg:changed', {
    scope,
    appId: appId || null,
    type: BG_TYPE.THEME_DEFAULT,
    value: null
  });
}

// 将背景应用到DOM
function _applyBgToDOM(scope, appId) {
  let cssValue;
  if (appId) {
    cssValue = getAppBackgroundCSS(appId);
  } else {
    cssValue = getBackgroundCSS(scope);
  }

  const root = document.documentElement;

  switch (scope) {
    case BG_SCOPE.DESKTOP:
      root.style.setProperty('--bg-desktop', cssValue);
      break;
    case BG_SCOPE.LOCKSCREEN:
      root.style.setProperty('--bg-lockscreen', cssValue);
      break;
    case BG_SCOPE.APP:
      if (appId) {
        root.style.setProperty(`--bg-app-${appId}`, cssValue);
      } else {
        root.style.setProperty('--bg-app', cssValue);
      }
      break;
  }
}

// APP级背景覆盖写入 config（整体读写 map）
function _saveAppBgOverrides() {
  const map = {};
  for (const [appId, bg] of _appBgOverrides) {
    map[appId] = bg;
  }
  set('appBgOverrides', map);
}

// 初始化：从 config 恢复所有背景状态
function initBackgrounds() {
  // 桌面壁纸
  const wallpaper = get('wallpaper');
  if (wallpaper) {
    _currentBackgrounds[BG_SCOPE.DESKTOP] = wallpaper;
  }

  // 锁屏壁纸
  const lsWallpaper = get('lockscreenWallpaper');
  if (lsWallpaper) {
    _currentBackgrounds[BG_SCOPE.LOCKSCREEN] = lsWallpaper;
  }

  // 锁屏壁纸同步桌面
  const sync = get('wallpaperSync');
  if (sync) {
    _currentBackgrounds[BG_SCOPE.LOCKSCREEN] = { ..._currentBackgrounds[BG_SCOPE.DESKTOP] };
  }

  // APP默认背景
  const appBg = get('appBg');
  if (appBg) {
    _currentBackgrounds[BG_SCOPE.APP] = appBg;
  }

  // APP级覆盖
  const overrides = get('appBgOverrides');
  if (overrides) {
    for (const [appId, bg] of Object.entries(overrides)) {
      _appBgOverrides.set(appId, bg);
    }
  }

  // 应用所有背景到DOM
  _applyBgToDOM(BG_SCOPE.DESKTOP);
  _applyBgToDOM(BG_SCOPE.LOCKSCREEN);
  _applyBgToDOM(BG_SCOPE.APP);
}

// 监听主题变化，自动更新默认背景
events.on('theme:changed', () => {
  for (const scope of Object.values(BG_SCOPE)) {
    if (_currentBackgrounds[scope].type === BG_TYPE.THEME_DEFAULT) {
      _applyBgToDOM(scope);
    }
  }
  for (const [appId, bg] of _appBgOverrides) {
    if (bg.type === BG_TYPE.THEME_DEFAULT) {
      _applyBgToDOM(BG_SCOPE.APP, appId);
    }
  }
});

export {
  BG_TYPE,
  BG_SCOPE,
  initBackgrounds,
  getBackground,
  getBackgroundCSS,
  getAppBackground,
  getAppBackgroundCSS,
  setBackground,
  resetBackground
};