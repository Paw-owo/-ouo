// ============================================
// theme.js — 主题切换
// 从 data/theme-presets.js 取色值，写入 css/theme.css 变量槽位
// 支持：主题色方案（家族）+ 浅色/深色/跟随系统 模式
// ============================================

import THEME_PRESETS from '../data/theme-presets.js';
import { get, set } from './config.js';
import events from './events.js';

let _currentTheme = null;
let _modeListener = null;

// 主题家族：每个家族对应一套浅色 + 一套深色
// 切换深浅模式时保持在同一家族内
const THEME_FAMILIES = [
  { light: 'berry-cloud',      dark: 'night-black-pink' },
  { light: 'honey',            dark: 'night-honey' },
  { light: 'taro-coconut',     dark: 'night-milk-brown' },
  { light: 'coconut-americano',dark: 'night-coffee' }
];

// 获取主题所属家族
function _getFamily(themeId) {
  return THEME_FAMILIES.find(f => f.light === themeId || f.dark === themeId) || null;
}

// 获取当前系统深浅模式
function _getSystemMode() {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

// 由家族 ID 和模式得到实际主题 ID
function _resolveThemeId(familyThemeId, mode) {
  const family = _getFamily(familyThemeId);
  if (!family) return familyThemeId;
  if (mode === 'dark') return family.dark;
  return family.light;
}

// 判断一个主题 ID 是否为浅色主题
function _isLightTheme(themeId) {
  const preset = THEME_PRESETS[themeId];
  return preset ? preset.mode === 'light' : true;
}

// 应用主题：将预设色值写入 :root CSS变量
function applyTheme(themeName) {
  const preset = THEME_PRESETS[themeName];
  if (!preset) {
    console.warn(`[Theme] 主题 "${themeName}" 不存在，回退到 berry-cloud`);
    return applyTheme('berry-cloud');
  }

  const root = document.documentElement;

  for (const [varName, value] of Object.entries(preset.colors)) {
    root.style.setProperty(varName, value);
  }

  root.setAttribute('data-theme', themeName);
  root.setAttribute('data-theme-mode', preset.mode);

  // 同步字体/图标大小（设置项持久化后由这里统一生效）
  applySizeSettings();

  _currentTheme = themeName;

  // 持久化实际应用的主题
  set('theme', themeName);

  // 通知
  events.emit('theme:changed', {
    theme: themeName,
    mode: preset.mode,
    label: preset.label
  });
}

// 注入所有主题的预览代表色到 :root（一次性，不随主题切换变化）
function _injectSwatchVars() {
  const root = document.documentElement;
  for (const [id, preset] of Object.entries(THEME_PRESETS)) {
    if (preset.swatch) {
      root.style.setProperty(`--swatch-${id}`, preset.swatch);
    }
  }
}

// 根据 themeMode 把存储的家族主题解析成实际主题
function _resolveStoredTheme(storedTheme, themeMode) {
  if (!storedTheme) return 'berry-cloud';

  // 兼容旧数据：若存的是深色主题，映射回家族浅色主题
  let familyId = storedTheme;
  if (!_isLightTheme(storedTheme)) {
    const family = _getFamily(storedTheme);
    if (family) familyId = family.light;
  }

  const mode = themeMode === 'auto' ? _getSystemMode() : (themeMode || 'light');
  return _resolveThemeId(familyId, mode);
}

// 应用字体/图标大小到 :root data 属性（全局即时生效）
function applySizeSettings() {
  const root = document.documentElement;
  const fontSize = get('fontSize') || 'normal';
  const iconSize = get('iconSize') || 'standard';
  root.setAttribute('data-font-size', fontSize);
  root.setAttribute('data-icon-size', iconSize);
}

// 初始化
function initTheme() {
  _injectSwatchVars();

  const storedTheme = get('theme');
  const themeMode = get('themeMode') || 'light';
  const actualTheme = _resolveStoredTheme(storedTheme, themeMode);
  applyTheme(actualTheme);

  // 跟随系统模式时监听系统变化
  _setupModeListener(themeMode);
}

// 监听系统深浅变化
function _setupModeListener(themeMode) {
  if (_modeListener) {
    _modeListener.removeEventListener?.('change', _modeListener._handler);
    _modeListener = null;
  }

  if (themeMode !== 'auto' || !window.matchMedia) return;

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e) => {
    const current = getCurrentTheme();
    const family = _getFamily(current);
    const familyId = family ? family.light : (_isLightTheme(current) ? current : 'berry-cloud');
    const target = _resolveThemeId(familyId, e.matches ? 'dark' : 'light');
    applyTheme(target);
  };

  mq.addEventListener('change', handler);
  mq._handler = handler;
  _modeListener = mq;
}

// 获取当前主题名
function getCurrentTheme() {
  return _currentTheme;
}

// 获取当前主题预设
function getCurrentPreset() {
  return THEME_PRESETS[_currentTheme];
}

// 获取所有可用主题
function getAvailableThemes() {
  return Object.entries(THEME_PRESETS).map(([key, val]) => ({
    id: key,
    label: val.label,
    mode: val.mode
  }));
}

// 获取所有浅色主题（用于设置页色卡）
function getLightThemes() {
  return Object.entries(THEME_PRESETS)
    .filter(([, val]) => val.mode === 'light')
    .map(([key, val]) => ({ id: key, label: val.label, mode: val.mode }));
}

// 按模式筛选
function getThemesByMode(mode) {
  return Object.entries(THEME_PRESETS)
    .filter(([, val]) => val.mode === mode)
    .map(([key, val]) => ({ id: key, label: val.label, mode: val.mode }));
}

// 获取当前主题所属的家族浅色主题 ID（用于设置页高亮）
function getCurrentFamilyTheme() {
  const current = getCurrentTheme();
  const family = _getFamily(current);
  return family ? family.light : (_isLightTheme(current) ? current : 'berry-cloud');
}

// 切换主题色方案（传入家族浅色主题 ID）
function switchTheme(familyThemeId) {
  const themeMode = get('themeMode') || 'light';
  const mode = themeMode === 'auto' ? _getSystemMode() : (themeMode || 'light');
  const target = _resolveThemeId(familyThemeId, mode);
  applyTheme(target);
}

// 设置深浅模式（light / dark / auto）
function setThemeMode(mode) {
  set('themeMode', mode);
  _setupModeListener(mode);

  const current = getCurrentTheme();
  const family = _getFamily(current);
  const familyId = family ? family.light : (_isLightTheme(current) ? current : 'berry-cloud');

  let targetMode = mode;
  if (mode === 'auto') {
    targetMode = _getSystemMode();
  }

  const target = _resolveThemeId(familyId, targetMode);
  applyTheme(target);
}

// 获取当前模式（解析 auto 后的实际模式）
function getResolvedMode() {
  const themeMode = get('themeMode') || 'light';
  if (themeMode === 'auto') return _getSystemMode();
  return themeMode;
}

// 切换日间/夜间（旧 API 兼容）
function toggleMode() {
  const currentMode = getResolvedMode();
  const nextMode = currentMode === 'dark' ? 'light' : 'dark';
  setThemeMode(nextMode);
}

export {
  initTheme,
  applyTheme,
  applySizeSettings,
  getCurrentTheme,
  getCurrentPreset,
  getCurrentFamilyTheme,
  getAvailableThemes,
  getLightThemes,
  getThemesByMode,
  getResolvedMode,
  switchTheme,
  setThemeMode,
  toggleMode
};
