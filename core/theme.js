// core/theme.js
// imports:
//   from './storage.js': getData, setData

import { getData, setData } from './storage.js';

const THEME_KEY = 'app_theme';
const THEME_PRESET_KEY = 'app_theme_preset';
const THEME_MODE_KEY = 'app_theme_mode';

const THEME_VARIABLE_KEYS = [
  'bg-primary',
  'bg-secondary',
  'bg-card',
  'bg-overlay',
  'accent',
  'accent-light',
  'accent-dark',
  'text-primary',
  'text-secondary',
  'text-hint',
  'bubble-user-bg',
  'bubble-user-text',
  'bubble-ai-bg',
  'bubble-ai-text',
  'bubble-radius',
  'bubble-radius-tail',
  'font-main',
  'font-size-base',
  'font-size-small',
  'font-size-title',
  'spacing-xs',
  'spacing-sm',
  'spacing-md',
  'spacing-lg',
  'radius-sm',
  'radius-md',
  'radius-lg',
  'shadow-sm',
  'shadow-md',
  'shadow-lg'
];

const PRESET_THEMES = {
  cream: {
    id: 'cream',
    mode: 'light',
    name: '奶油浅色',
    'bg-primary': '#FFF7F4',
    'bg-secondary': '#F3EAE6',
    'bg-card': '#FFFDFB',
    'bg-overlay': 'rgba(92, 64, 51, 0.22)',
    'accent': '#F4A7B9',
    'accent-light': '#F9E1E6',
    'accent-dark': '#D9829C',
    'text-primary': '#5C4033',
    'text-secondary': '#8A7065',
    'text-hint': '#B79D93',
    'bubble-user-bg': '#F4A7B9',
    'bubble-user-text': '#FFF9F7',
    'bubble-ai-bg': '#FFF9F9',
    'bubble-ai-text': '#5C4033',
    'bubble-radius': '18px',
    'bubble-radius-tail': '5px',
    'font-main': "'Nunito', 'Quicksand', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    'font-size-base': '15px',
    'font-size-small': '13px',
    'font-size-title': '17px',
    'spacing-xs': '4px',
    'spacing-sm': '8px',
    'spacing-md': '16px',
    'spacing-lg': '24px',
    'radius-sm': '8px',
    'radius-md': '16px',
    'radius-lg': '20px',
    'shadow-sm': '0 2px 12px rgba(244, 167, 185, 0.12)',
    'shadow-md': '0 4px 18px rgba(244, 167, 185, 0.16)',
    'shadow-lg': '0 10px 30px rgba(244, 167, 185, 0.18)'
  },

  sakura: {
    id: 'sakura',
    mode: 'light',
    name: '樱花浅色',
    'bg-primary': '#FFF5F8',
    'bg-secondary': '#F7E8EC',
    'bg-card': '#FFFDFD',
    'bg-overlay': 'rgba(92, 64, 51, 0.22)',
    'accent': '#F09AAF',
    'accent-light': '#FBE3EA',
    'accent-dark': '#D77791',
    'text-primary': '#5C4033',
    'text-secondary': '#8C7167',
    'text-hint': '#BCA49A',
    'bubble-user-bg': '#F09AAF',
    'bubble-user-text': '#FFF9F7',
    'bubble-ai-bg': '#FFF7F9',
    'bubble-ai-text': '#5C4033',
    'bubble-radius': '18px',
    'bubble-radius-tail': '5px',
    'font-main': "'Nunito', 'Quicksand', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    'font-size-base': '15px',
    'font-size-small': '13px',
    'font-size-title': '17px',
    'spacing-xs': '4px',
    'spacing-sm': '8px',
    'spacing-md': '16px',
    'spacing-lg': '24px',
    'radius-sm': '8px',
    'radius-md': '16px',
    'radius-lg': '20px',
    'shadow-sm': '0 2px 12px rgba(240, 154, 175, 0.12)',
    'shadow-md': '0 4px 18px rgba(240, 154, 175, 0.16)',
    'shadow-lg': '0 10px 30px rgba(240, 154, 175, 0.18)'
  },

  caramel: {
    id: 'caramel',
    mode: 'light',
    name: '焦糖浅色',
    'bg-primary': '#FFF6EF',
    'bg-secondary': '#F1E5DA',
    'bg-card': '#FFFCF9',
    'bg-overlay': 'rgba(92, 64, 51, 0.24)',
    'accent': '#E7A56D',
    'accent-light': '#F6E4D3',
    'accent-dark': '#C8844E',
    'text-primary': '#5C4033',
    'text-secondary': '#90786D',
    'text-hint': '#C0AEA4',
    'bubble-user-bg': '#E7A56D',
    'bubble-user-text': '#FFF9F4',
    'bubble-ai-bg': '#FFF8F1',
    'bubble-ai-text': '#5C4033',
    'bubble-radius': '18px',
    'bubble-radius-tail': '5px',
    'font-main': "'Nunito', 'Quicksand', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    'font-size-base': '15px',
    'font-size-small': '13px',
    'font-size-title': '17px',
    'spacing-xs': '4px',
    'spacing-sm': '8px',
    'spacing-md': '16px',
    'spacing-lg': '24px',
    'radius-sm': '8px',
    'radius-md': '16px',
    'radius-lg': '20px',
    'shadow-sm': '0 2px 12px rgba(231, 165, 109, 0.12)',
    'shadow-md': '0 4px 18px rgba(231, 165, 109, 0.16)',
    'shadow-lg': '0 10px 30px rgba(231, 165, 109, 0.18)'
  },

  lavender: {
    id: 'lavender',
    mode: 'light',
    name: '薰衣草浅色',
    'bg-primary': '#F9F5FF',
    'bg-secondary': '#EEE7F8',
    'bg-card': '#FFFDFE',
    'bg-overlay': 'rgba(74, 60, 83, 0.22)',
    'accent': '#B79AE8',
    'accent-light': '#EFE6FA',
    'accent-dark': '#9676D0',
    'text-primary': '#55465E',
    'text-secondary': '#83738C',
    'text-hint': '#B4A6BC',
    'bubble-user-bg': '#B79AE8',
    'bubble-user-text': '#FFFAFF',
    'bubble-ai-bg': '#FFFAFF',
    'bubble-ai-text': '#55465E',
    'bubble-radius': '18px',
    'bubble-radius-tail': '5px',
    'font-main': "'Nunito', 'Quicksand', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    'font-size-base': '15px',
    'font-size-small': '13px',
    'font-size-title': '17px',
    'spacing-xs': '4px',
    'spacing-sm': '8px',
    'spacing-md': '16px',
    'spacing-lg': '24px',
    'radius-sm': '8px',
    'radius-md': '16px',
    'radius-lg': '20px',
    'shadow-sm': '0 2px 12px rgba(183, 154, 232, 0.12)',
    'shadow-md': '0 4px 18px rgba(183, 154, 232, 0.16)',
    'shadow-lg': '0 10px 30px rgba(183, 154, 232, 0.18)'
  },

  night: {
    id: 'night',
    mode: 'dark',
    name: '奶咖夜间',
    'bg-primary': '#231B1A',
    'bg-secondary': '#312725',
    'bg-card': '#2A221F',
    'bg-overlay': 'rgba(24, 18, 17, 0.54)',
    'accent': '#F0A8B7',
    'accent-light': '#433033',
    'accent-dark': '#FFD0D9',
    'text-primary': '#F4E8E2',
    'text-secondary': '#C9B6AE',
    'text-hint': '#8F7C74',
    'bubble-user-bg': '#F0A8B7',
    'bubble-user-text': '#2A1F1F',
    'bubble-ai-bg': '#2E2522',
    'bubble-ai-text': '#F4E8E2',
    'bubble-radius': '18px',
    'bubble-radius-tail': '5px',
    'font-main': "'Nunito', 'Quicksand', 'PingFang SC', 'Microsoft YaHei', sans-serif",
    'font-size-base': '15px',
    'font-size-small': '13px',
    'font-size-title': '17px',
    'spacing-xs': '4px',
    'spacing-sm': '8px',
    'spacing-md': '16px',
    'spacing-lg': '24px',
    'radius-sm': '8px',
    'radius-md': '16px',
    'radius-lg': '20px',
    'shadow-sm': '0 2px 12px rgba(240, 168, 183, 0.10)',
    'shadow-md': '0 4px 18px rgba(240, 168, 183, 0.13)',
    'shadow-lg': '0 10px 30px rgba(240, 168, 183, 0.15)'
  }
};

PRESET_THEMES.dark = {
  ...PRESET_THEMES.night,
  id: 'dark',
  name: '夜间模式'
};

PRESET_THEMES.sky = {
  ...PRESET_THEMES.lavender,
  id: 'sky',
  name: '浅紫云朵'
};

const MODE_DEFAULT_PRESET = {
  light: 'cream',
  dark: 'night'
};

let currentPreset = 'cream';
let currentMode = 'light';
let customVariables = {};
let currentTheme = composeTheme(currentPreset, customVariables);

function normalizeThemeVariables(variables) {
  if (!variables || typeof variables !== 'object' || Array.isArray(variables)) {
    return {};
  }

  return THEME_VARIABLE_KEYS.reduce((theme, key) => {
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      theme[key] = String(variables[key]);
    }

    return theme;
  }, {});
}

function getPresetByName(name) {
  return PRESET_THEMES[String(name || '').trim()] || null;
}

function getPresetTheme(name) {
  const preset = getPresetByName(name) || PRESET_THEMES.cream;
  return normalizeThemeVariables(preset);
}

function getDefaultPresetForMode(mode) {
  return mode === 'dark' ? MODE_DEFAULT_PRESET.dark : MODE_DEFAULT_PRESET.light;
}

function composeTheme(presetName, custom = {}) {
  return {
    ...getPresetTheme(presetName),
    ...normalizeThemeVariables(custom)
  };
}

function writeThemeToRoot(theme) {
  const root = document.documentElement;

  THEME_VARIABLE_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(theme, key)) {
      root.style.setProperty(`--${key}`, theme[key]);
    }
  });

  root.dataset.themePreset = String(currentPreset || '');
  root.dataset.themeMode = String(currentMode || '');
}

function persistThemeMeta() {
  setData(THEME_PRESET_KEY, currentPreset);
  setData(THEME_MODE_KEY, currentMode);
}

function commitTheme({ preset = currentPreset, mode = currentMode, custom = customVariables, shouldSave = false } = {}) {
  const safePreset = getPresetByName(preset) ? preset : getDefaultPresetForMode(mode);
  const safeMode = mode === 'dark' ? 'dark' : 'light';

  currentPreset = safePreset;
  currentMode = safeMode;
  customVariables = normalizeThemeVariables(custom);
  currentTheme = composeTheme(currentPreset, customVariables);

  writeThemeToRoot(currentTheme);

  if (shouldSave) {
    saveTheme();
    persistThemeMeta();
  }

  return exportTheme();
}

export function applyTheme(variables = {}) {
  customVariables = {
    ...customVariables,
    ...normalizeThemeVariables(variables)
  };

  return commitTheme({
    preset: currentPreset,
    mode: currentMode,
    custom: customVariables,
    shouldSave: false
  }).variables;
}

export function exportTheme() {
  return {
    preset: currentPreset,
    mode: currentMode,
    variables: { ...currentTheme },
    customVariables: { ...customVariables }
  };
}

export function importTheme(json) {
  try {
    const parsedTheme = typeof json === 'string' ? JSON.parse(json) : json;

    if (!parsedTheme || typeof parsedTheme !== 'object') {
      throw new Error('主题文件为空');
    }

    const preset = getPresetByName(parsedTheme.preset) ? String(parsedTheme.preset) : 'cream';
    const presetMode = getPresetByName(preset)?.mode || 'light';
    const mode = parsedTheme.mode === 'dark' ? 'dark' : presetMode;

    const importedCustom = Object.prototype.hasOwnProperty.call(parsedTheme, 'customVariables')
      ? normalizeThemeVariables(parsedTheme.customVariables)
      : normalizeThemeVariables(parsedTheme.variables || parsedTheme);

    if (!Object.keys(importedCustom).length && !Object.keys(normalizeThemeVariables(parsedTheme.variables || parsedTheme)).length) {
      throw new Error('主题文件为空');
    }

    return commitTheme({
      preset,
      mode,
      custom: importedCustom,
      shouldSave: true
    });
  } catch (error) {
    throw new Error('主题导入失败');
  }
}

export function setPreset(name) {
  const preset = getPresetByName(name);

  if (!preset) {
    throw new Error(`主题不存在：${name}`);
  }

  return commitTheme({
    preset: preset.id,
    mode: preset.mode || 'light',
    custom: {},
    shouldSave: true
  });
}

export function setThemeMode(mode) {
  const nextMode = mode === 'dark' ? 'dark' : 'light';
  const nextPreset = getDefaultPresetForMode(nextMode);

  return commitTheme({
    preset: nextPreset,
    mode: nextMode,
    custom: customVariables,
    shouldSave: true
  });
}

export function saveTheme() {
  return setData(THEME_KEY, {
    preset: currentPreset,
    mode: currentMode,
    variables: { ...currentTheme },
    customVariables: { ...customVariables }
  });
}

export function loadTheme() {
  const savedTheme = getData(THEME_KEY);
  const savedPreset = getData(THEME_PRESET_KEY);
  const savedMode = getData(THEME_MODE_KEY);

  let presetName = 'cream';

  if (getPresetByName(savedTheme?.preset)) {
    presetName = savedTheme.preset;
  } else if (getPresetByName(savedPreset)) {
    presetName = savedPreset;
  }

  let modeName = getPresetByName(presetName)?.mode || 'light';

  if (savedTheme?.mode === 'dark' || savedMode === 'dark') {
    modeName = 'dark';
  } else if (savedTheme?.mode === 'light' || savedMode === 'light') {
    modeName = 'light';
  }

  if (getPresetByName(presetName)?.mode !== modeName) {
    presetName = getDefaultPresetForMode(modeName);
  }

  const savedCustom = Object.prototype.hasOwnProperty.call(savedTheme || {}, 'customVariables')
    ? normalizeThemeVariables(savedTheme.customVariables)
    : {};

  return commitTheme({
    preset: presetName,
    mode: modeName,
    custom: savedCustom,
    shouldSave: true
  });
}

export function getThemePresets() {
  const hiddenAliasIds = new Set(['dark', 'sky']);

  return Object.values(PRESET_THEMES)
    .filter((preset) => !hiddenAliasIds.has(preset.id))
    .map((preset) => ({
      id: preset.id,
      name: preset.name,
      mode: preset.mode
    }));
}

export function getCurrentTheme() {
  return exportTheme();
}

// 改了什么：浅色/夜间切换会保留 customVariables；切换预设会重置自定义变量；保留 dark/sky 旧调用兼容。
// 会不会影响其他文件：会，apps/settings.js 后面需要用 getThemePresets/setPreset/setThemeMode 接入主题入口。
// 更新记忆里该文件的导出函数：applyTheme/exportTheme/importTheme/setPreset/setThemeMode/saveTheme/loadTheme/getThemePresets/getCurrentTheme
// depends: ./storage.js getData / setData
