// ============================================
// theme.js — 主题切换
// 从 data/theme-presets.js 取色值，写入 css/theme.css 变量槽位
// ============================================

import THEME_PRESETS from '../data/theme-presets.js';
import { get, set } from './config.js';
import { STORAGE_KEYS } from './storage-keys.js';
import events from './events.js';

let _currentTheme = null;

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

  _currentTheme = themeName;

  // 持久化
  set('theme', themeName);

  // 通知
  events.emit('theme:changed', {
    theme: themeName,
    mode: preset.mode,
    label: preset.label
  });
}

// 注入所有主题的预览代表色到 :root（一次性，不随主题切换变化）
// 用于设置页主题色卡预览圆点，色值来自 theme-presets.js 的 swatch 字段
function _injectSwatchVars() {
  const root = document.documentElement;
  for (const [id, preset] of Object.entries(THEME_PRESETS)) {
    if (preset.swatch) {
      root.style.setProperty(`--swatch-${id}`, preset.swatch);
    }
  }
}

// 初始化：注入预览色变量 + 读取存储的主题或使用默认
function initTheme() {
  _injectSwatchVars();
  const stored = get('theme');
  const themeName = stored || 'berry-cloud';
  applyTheme(themeName);
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

// 按模式筛选
function getThemesByMode(mode) {
  return Object.entries(THEME_PRESETS)
    .filter(([, val]) => val.mode === mode)
    .map(([key, val]) => ({ id: key, label: val.label, mode: val.mode }));
}

// 切换主题（按名称）
function switchTheme(themeName) {
  applyTheme(themeName);
}

// 切换日间/夜间
function toggleMode() {
  const current = getCurrentPreset();
  if (!current) return;

  const targetMode = current.mode === 'light' ? 'dark' : 'light';
  const candidates = getThemesByMode(targetMode);

  if (candidates.length > 0) {
    applyTheme(candidates[0].id);
  }
}

export {
  initTheme,
  applyTheme,
  getCurrentTheme,
  getCurrentPreset,
  getAvailableThemes,
  getThemesByMode,
  switchTheme,
  toggleMode
};