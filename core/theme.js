// core/theme.js
// imports: getData, setData from './storage.js'

import { getData, setData } from './storage.js';

const THEME_KEY = 'app_theme';

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

const BASE_THEME = {
  'bg-primary': '#FAF8F5',
  'bg-secondary': '#F0EDE8',
  'bg-card': '#FFFFFF',
  'bg-overlay': 'rgba(0,0,0,0.28)',
  'accent': '#D4956A',
  'accent-light': '#F5E6D8',
  'accent-dark': '#B8784F',
  'text-primary': '#1A1A1A',
  'text-secondary': '#888888',
  'text-hint': '#CCCCCC',
  'bubble-user-bg': '#D4956A',
  'bubble-user-text': '#FFFFFF',
  'bubble-ai-bg': '#FFFFFF',
  'bubble-ai-text': '#1A1A1A',
  'bubble-radius': '18px',
  'bubble-radius-tail': '4px',
  'font-main': "'PingFang SC', 'Microsoft YaHei', sans-serif",
  'font-size-base': '15px',
  'font-size-small': '13px',
  'font-size-title': '17px',
  'spacing-xs': '4px',
  'spacing-sm': '8px',
  'spacing-md': '16px',
  'spacing-lg': '24px',
  'radius-sm': '8px',
  'radius-md': '16px',
  'radius-lg': '24px',
  'shadow-sm': '0 1px 4px rgba(0,0,0,0.05)',
  'shadow-md': '0 2px 12px rgba(0,0,0,0.08)',
  'shadow-lg': '0 8px 32px rgba(0,0,0,0.12)'
};

const PRESET_THEMES = {
  cream: {
    ...BASE_THEME,
    'bg-primary': '#FAF8F5',
    'bg-secondary': '#F0EDE8',
    'bg-card': '#FFFFFF',
    'accent': '#D4956A',
    'accent-light': '#F5E6D8',
    'accent-dark': '#B8784F',
    'bubble-user-bg': '#D4956A'
  },
  sakura: {
    ...BASE_THEME,
    'bg-primary': '#FFF5F7',
    'bg-secondary': '#F4E8EC',
    'bg-card': '#FFFFFF',
    'accent': '#E8899A',
    'accent-light': '#F9E1E7',
    'accent-dark': '#C96D80',
    'bubble-user-bg': '#E8899A'
  },
  sky: {
    ...BASE_THEME,
    'bg-primary': '#F4F2FA',
    'bg-secondary': '#E9E5F3',
    'bg-card': '#FFFFFF',
    'accent': '#9B7DE8',
    'accent-light': '#EEE8FB',
    'accent-dark': '#7E62C6',
    'bubble-user-bg': '#9B7DE8'
  },
  dark: {
    ...BASE_THEME,
    'bg-primary': '#1A1A1A',
    'bg-secondary': '#2A2A2A',
    'bg-card': '#252525',
    'bg-overlay': 'rgba(0,0,0,0.42)',
    'accent': '#9B7DE8',
    'accent-light': '#332B45',
    'accent-dark': '#B69CF3',
    'text-primary': '#EFEFEF',
    'text-secondary': '#A5A5A5',
    'text-hint': '#666666',
    'bubble-user-bg': '#9B7DE8',
    'bubble-user-text': '#FFFFFF',
    'bubble-ai-bg': '#252525',
    'bubble-ai-text': '#EFEFEF',
    'shadow-sm': '0 1px 4px rgba(0,0,0,0.18)',
    'shadow-md': '0 2px 12px rgba(0,0,0,0.24)',
    'shadow-lg': '0 8px 32px rgba(0,0,0,0.32)'
  }
};

let currentTheme = { ...PRESET_THEMES.cream };

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

function writeThemeToRoot(theme) {
  const root = document.documentElement;

  Object.entries(theme).forEach(([key, value]) => {
    root.style.setProperty(`--${key}`, value);
  });
}

export function applyTheme(variables) {
  const nextTheme = {
    ...currentTheme,
    ...normalizeThemeVariables(variables)
  };

  currentTheme = nextTheme;
  writeThemeToRoot(currentTheme);

  return { ...currentTheme };
}

export function exportTheme() {
  return { ...currentTheme };
}

export function importTheme(json) {
  try {
    const parsedTheme = typeof json === 'string' ? JSON.parse(json) : json;
    const normalizedTheme = normalizeThemeVariables(parsedTheme);

    if (!Object.keys(normalizedTheme).length) {
      throw new Error('主题文件为空');
    }

    applyTheme(normalizedTheme);
    saveTheme();

    return { ...currentTheme };
  } catch (error) {
    throw new Error('主题导入失败');
  }
}

export function setPreset(name) {
  const preset = PRESET_THEMES[name];

  if (!preset) {
    throw new Error(`主题不存在：${name}`);
  }

  applyTheme(preset);
  saveTheme();

  return { ...currentTheme };
}

export function saveTheme() {
  return setData(THEME_KEY, currentTheme);
}

export function loadTheme() {
  const savedTheme = getData(THEME_KEY);
  const theme = savedTheme && typeof savedTheme === 'object' ? savedTheme : PRESET_THEMES.cream;

  applyTheme(theme);

  return { ...currentTheme };
}

// depends: ./storage.js getData / setData
