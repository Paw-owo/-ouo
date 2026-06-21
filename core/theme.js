/* core/theme.js - 主题系统
   1. 4套预设主题，批量写入 :root 变量并存 localStorage
   2. 导入/导出主题 JSON
   3. 实时预览（改变量立即生效，不刷新）
   4. 启动时从 localStorage 恢复上次主题
   依赖 storage.js 的 getData/setData/KEYS */

import { getData, setData, KEYS } from './storage.js';

/* ============ 主题变量白名单 ============
   只有这些变量会被主题切换/导入导出操作，与 style.css 的 :root 对齐 */
export const THEME_VARS = [
  '--bg-primary',
  '--bg-secondary',
  '--bg-card',
  '--bg-overlay',
  '--accent',
  '--accent-light',
  '--accent-dark',
  '--text-primary',
  '--text-secondary',
  '--text-hint',
  '--bubble-user-bg',
  '--bubble-user-text',
  '--bubble-ai-bg',
  '--bubble-ai-text',
  '--glass-bg',
];

/* ============ 4套预设主题 ============ */
export const PRESET_THEMES = {
  cream: {
    name: '奶油白',
    variables: {
      '--bg-primary': '#FFF8F0',
      '--bg-secondary': '#FFF4E6',
      '--bg-card': '#FFFBF5',
      '--bg-overlay': 'rgba(139, 115, 85, 0.25)',
      '--accent': '#D4A574',
      '--accent-light': '#E8C9A3',
      '--accent-dark': '#B8935F',
      '--text-primary': '#8B7355',
      '--text-secondary': '#B5A193',
      '--text-hint': '#D4C4B5',
      '--bubble-user-bg': '#E8C9A3',
      '--bubble-user-text': '#8B7355',
      '--bubble-ai-bg': '#FFFBF5',
      '--bubble-ai-text': '#8B7355',
      '--glass-bg': 'rgba(255, 251, 245, 0.85)',
    },
  },
  sakura: {
    name: '樱花粉',
    variables: {
      '--bg-primary': '#FFF5F7',
      '--bg-secondary': '#FFEBF0',
      '--bg-card': '#FFFAFB',
      '--bg-overlay': 'rgba(180, 120, 130, 0.25)',
      '--accent': '#E8A0B0',
      '--accent-light': '#F5CdD6',
      '--accent-dark': '#D4828F',
      '--text-primary': '#9A6B74',
      '--text-secondary': '#C4A0A8',
      '--text-hint': '#E0CCD0',
      '--bubble-user-bg': '#F5CDD6',
      '--bubble-user-text': '#9A6B74',
      '--bubble-ai-bg': '#FFFAFB',
      '--bubble-ai-text': '#9A6B74',
      '--glass-bg': 'rgba(255, 250, 251, 0.85)',
    },
  },
  sky: {
    name: '天空蓝',
    variables: {
      '--bg-primary': '#F2F7FB',
      '--bg-secondary': '#E8F1F8',
      '--bg-card': '#FAFCFE',
      '--bg-overlay': 'rgba(90, 120, 150, 0.25)',
      '--accent': '#8FB4D4',
      '--accent-light': '#C4DCEC',
      '--accent-dark': '#6F9CC0',
      '--text-primary': '#5A7891',
      '--text-secondary': '#94AEC2',
      '--text-hint': '#C4D4E0',
      '--bubble-user-bg': '#C4DCEC',
      '--bubble-user-text': '#5A7891',
      '--bubble-ai-bg': '#FAFCFE',
      '--bubble-ai-text': '#5A7891',
      '--glass-bg': 'rgba(250, 252, 254, 0.85)',
    },
  },
  night: {
    name: '夜间',
    variables: {
      '--bg-primary': '#2A2723',
      '--bg-secondary': '#332F2A',
      '--bg-card': '#363129',
      '--bg-overlay': 'rgba(0, 0, 0, 0.5)',
      '--accent': '#C9A57A',
      '--accent-light': '#5A4F3F',
      '--accent-dark': '#E0C098',
      '--text-primary': '#E8DECF',
      '--text-secondary': '#A89B86',
      '--text-hint': '#6B6155',
      '--bubble-user-bg': '#5A4F3F',
      '--bubble-user-text': '#E8DECF',
      '--bubble-ai-bg': '#363129',
      '--bubble-ai-text': '#E8DECF',
      '--glass-bg': 'rgba(54, 49, 41, 0.85)',
    },
  },
};

/* ============ 核心读写 ============ */

// 把一组变量写入 :root（实时预览的核心）
export function applyVariables(variables) {
  const root = document.documentElement;
  Object.entries(variables).forEach(([key, val]) => {
    if (THEME_VARS.includes(key)) {
      root.style.setProperty(key, val);
    }
  });
}

// 设置单个变量（自定义编辑实时预览）
export function setVariable(key, value) {
  if (THEME_VARS.includes(key)) {
    document.documentElement.style.setProperty(key, value);
  }
}

// 读取当前生效的某个变量值
export function getVariable(key) {
  return getComputedStyle(document.documentElement).getPropertyValue(key).trim();
}

// 读取当前所有主题变量（用于导出/自定义编辑回填）
export function getCurrentVariables() {
  const result = {};
  THEME_VARS.forEach((key) => {
    result[key] = getVariable(key);
  });
  return result;
}

/* ============ 应用预设主题 ============ */

export function applyPreset(presetKey) {
  const preset = PRESET_THEMES[presetKey];
  if (!preset) return false;
  applyVariables(preset.variables);
  saveCurrentTheme({ name: preset.name, presetKey, variables: preset.variables });
  return true;
}

/* ============ 持久化 ============ */
/* 存储结构 KEYS.THEME：
   { name, presetKey, variables: { '--xxx': 'value' } } */

export function saveCurrentTheme(theme) {
  setData(KEYS.THEME, theme);
}

export function getSavedTheme() {
  return getData(KEYS.THEME, null);
}

// 启动时调用：恢复上次主题，没有就用默认奶油白
export function initTheme() {
  const saved = getSavedTheme();
  if (saved && saved.variables) {
    applyVariables(saved.variables);
  } else {
    applyPreset('cream');
  }
}

// 保存自定义编辑后的变量（基于当前预设，覆盖部分变量）
export function saveCustomVariables(partialVars) {
  const saved = getSavedTheme() || { name: '自定义', presetKey: '', variables: getCurrentVariables() };
  const merged = { ...saved.variables, ...partialVars };
  applyVariables(merged);
  saveCurrentTheme({ name: saved.name || '自定义', presetKey: saved.presetKey || '', variables: merged });
}

/* ============ 导入 / 导出 JSON ============ */
/* 文件格式：
   { "name": "主题名", "version": "1.0", "variables": { "--bg-primary": "#FAFAFA" } } */

export function exportTheme() {
  const current = getSavedTheme();
  const variables = current && current.variables ? current.variables : getCurrentVariables();
  const name = current && current.name ? current.name : '自定义主题';
  return JSON.stringify({ name, version: '1.0', variables }, null, 2);
}

// 触发浏览器下载
export function downloadTheme() {
  const json = exportTheme();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `theme_${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// 导入主题 JSON 字符串
export function importTheme(jsonStr) {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed.variables) return false;
    // 只接受白名单内变量
    const variables = {};
    Object.entries(parsed.variables).forEach(([k, v]) => {
      if (THEME_VARS.includes(k)) variables[k] = v;
    });
    applyVariables(variables);
    saveCurrentTheme({ name: parsed.name || '导入主题', presetKey: '', variables });
    return true;
  } catch (e) {
    console.warn('主题导入失败', e);
    return false;
  }
}

// 从文件对象导入（供 input[type=file] 用）
export function importThemeFromFile(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(importTheme(reader.result));
    reader.onerror = () => resolve(false);
    reader.readAsText(file);
  });
}

/* ============ 应用级独立主题 ============
   每个应用可覆盖全局变量，只影响该应用打开时
   依赖 settings.appThemes（在 storage.js settings 结构里） */

// 把应用的主题变量临时叠加到 :root（进入应用时调用）
export function applyAppTheme(appVars) {
  if (!appVars) return;
  applyVariables(appVars);
}

// 退出应用时恢复全局主题
export function restoreGlobalTheme() {
  initTheme();
}

