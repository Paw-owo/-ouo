// imports:
//   from './storage.js': getData, setData

import { getData, setData } from './storage.js';

const THEME_KEY = 'app_theme';
const PRESET_KEY = 'app_theme_preset';
const MODE_KEY = 'app_theme_mode';

const DEFAULT_PRESET = 'cream';
const DEFAULT_MODE = 'light';

const FONT_FALLBACK = "'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const BASE_VARIABLES = {
  'bg-primary': '#FAF8F5',
  'bg-secondary': '#F3EEE8',
  'bg-card': '#FFFDF9',
  'bg-overlay': 'rgba(42, 32, 26, 0.28)',
  'surface': '#FFFDF9',
  'surface-glass': 'color-mix(in srgb, var(--bg-card) 86%, transparent)',
  'surface-muted': 'color-mix(in srgb, var(--bg-secondary) 76%, var(--bg-card))',

  'accent': '#D98B73',
  'accent-light': '#F8DED3',
  'accent-dark': '#A85F4B',

  'text-primary': '#2F2925',
  'text-secondary': '#746760',
  'text-hint': '#A99D96',

  'bubble-user-bg': '#D98B73',
  'bubble-user-text': '#FFFDF9',
  'bubble-ai-bg': '#FFFDF9',
  'bubble-ai-text': '#2F2925',

  'bubble-radius': '20px',
  'bubble-radius-tail': '8px',

  'font-main': FONT_FALLBACK,
  'font-size-base': '15px',
  'font-size-small': '13px',
  'font-size-title': '17px',

  'spacing-xs': '6px',
  'spacing-sm': '10px',
  'spacing-md': '16px',
  'spacing-lg': '22px',

  'radius-sm': '16px',
  'radius-md': '20px',
  'radius-lg': '26px',

  'shadow-sm': '0 2px 12px rgba(62, 47, 38, 0.06)',
  'shadow-md': '0 8px 28px rgba(62, 47, 38, 0.09)',
  'shadow-lg': '0 16px 46px rgba(62, 47, 38, 0.12)',
  'shadow': '0 8px 28px rgba(62, 47, 38, 0.09)',

  'motion': 'all 200ms ease',
  'press-scale': '0.96'
};

const PRESETS = {
  cream: {
    id: 'cream',
    name: '奶油小窝',
    mode: 'light',
    variables: {
      'bg-primary': '#FAF8F5',
      'bg-secondary': '#F3EEE8',
      'bg-card': '#FFFDF9',
      'bg-overlay': 'rgba(42, 32, 26, 0.28)',
      'surface': '#FFFDF9',
      'accent': '#D98B73',
      'accent-light': '#F8DED3',
      'accent-dark': '#A85F4B',
      'text-primary': '#2F2925',
      'text-secondary': '#746760',
      'text-hint': '#A99D96',
      'bubble-user-bg': '#D98B73',
      'bubble-user-text': '#FFFDF9',
      'bubble-ai-bg': '#FFFDF9',
      'bubble-ai-text': '#2F2925',
      'shadow-sm': '0 2px 12px rgba(62, 47, 38, 0.06)',
      'shadow-md': '0 8px 28px rgba(62, 47, 38, 0.09)',
      'shadow-lg': '0 16px 46px rgba(62, 47, 38, 0.12)',
      'shadow': '0 8px 28px rgba(62, 47, 38, 0.09)'
    }
  },

  peach: {
    id: 'peach',
    name: '蜜桃便签',
    mode: 'light',
    variables: {
      'bg-primary': '#FCF5F1',
      'bg-secondary': '#F6E8E0',
      'bg-card': '#FFF9F5',
      'bg-overlay': 'rgba(46, 31, 26, 0.28)',
      'surface': '#FFF9F5',
      'accent': '#D77C67',
      'accent-light': '#F8D8CE',
      'accent-dark': '#9C5546',
      'text-primary': '#302522',
      'text-secondary': '#76605A',
      'text-hint': '#AA9891',
      'bubble-user-bg': '#D77C67',
      'bubble-user-text': '#FFF9F5',
      'bubble-ai-bg': '#FFF9F5',
      'bubble-ai-text': '#302522',
      'shadow-sm': '0 2px 12px rgba(70, 42, 34, 0.06)',
      'shadow-md': '0 8px 28px rgba(70, 42, 34, 0.09)',
      'shadow-lg': '0 16px 46px rgba(70, 42, 34, 0.12)',
      'shadow': '0 8px 28px rgba(70, 42, 34, 0.09)'
    }
  },

  berry: {
    id: 'berry',
    name: '莓果奶冻',
    mode: 'light',
    variables: {
      'bg-primary': '#FBF5F7',
      'bg-secondary': '#F3E6EA',
      'bg-card': '#FFF9FB',
      'bg-overlay': 'rgba(45, 28, 34, 0.28)',
      'surface': '#FFF9FB',
      'accent': '#C97983',
      'accent-light': '#F3D7DD',
      'accent-dark': '#96515D',
      'text-primary': '#302528',
      'text-secondary': '#746268',
      'text-hint': '#A99AA0',
      'bubble-user-bg': '#C97983',
      'bubble-user-text': '#FFF9FB',
      'bubble-ai-bg': '#FFF9FB',
      'bubble-ai-text': '#302528',
      'shadow-sm': '0 2px 12px rgba(66, 38, 47, 0.06)',
      'shadow-md': '0 8px 28px rgba(66, 38, 47, 0.09)',
      'shadow-lg': '0 16px 46px rgba(66, 38, 47, 0.12)',
      'shadow': '0 8px 28px rgba(66, 38, 47, 0.09)'
    }
  },

  cocoa: {
    id: 'cocoa',
    name: '可可夜灯',
    mode: 'dark',
    variables: {
      'bg-primary': '#211B18',
      'bg-secondary': '#2C2420',
      'bg-card': '#342B26',
      'bg-overlay': 'rgba(10, 7, 5, 0.50)',
      'surface': '#342B26',
      'accent': '#D09078',
      'accent-light': '#4B342D',
      'accent-dark': '#F0C1AE',
      'text-primary': '#F8EEE8',
      'text-secondary': '#CDBBB2',
      'text-hint': '#9E8D85',
      'bubble-user-bg': '#D09078',
      'bubble-user-text': '#211B18',
      'bubble-ai-bg': '#342B26',
      'bubble-ai-text': '#F8EEE8',
      'shadow-sm': '0 2px 12px rgba(10, 7, 5, 0.22)',
      'shadow-md': '0 8px 28px rgba(10, 7, 5, 0.30)',
      'shadow-lg': '0 16px 46px rgba(10, 7, 5, 0.38)',
      'shadow': '0 8px 28px rgba(10, 7, 5, 0.30)'
    }
  },

  dusk: {
    id: 'dusk',
    name: '暖灰晚安',
    mode: 'dark',
    variables: {
      'bg-primary': '#23201E',
      'bg-secondary': '#2D2926',
      'bg-card': '#36312D',
      'bg-overlay': 'rgba(9, 7, 6, 0.50)',
      'surface': '#36312D',
      'accent': '#C48773',
      'accent-light': '#4A342C',
      'accent-dark': '#F0BDA7',
      'text-primary': '#F7F0EA',
      'text-secondary': '#C9BBB2',
      'text-hint': '#9D918B',
      'bubble-user-bg': '#C48773',
      'bubble-user-text': '#23201E',
      'bubble-ai-bg': '#36312D',
      'bubble-ai-text': '#F7F0EA',
      'shadow-sm': '0 2px 12px rgba(8, 6, 5, 0.22)',
      'shadow-md': '0 8px 28px rgba(8, 6, 5, 0.30)',
      'shadow-lg': '0 16px 46px rgba(8, 6, 5, 0.38)',
      'shadow': '0 8px 28px rgba(8, 6, 5, 0.30)'
    }
  },

  paper: {
    id: 'paper',
    name: '软纸便签',
    mode: 'light',
    variables: {
      'bg-primary': '#FBF7EF',
      'bg-secondary': '#F0E8DC',
      'bg-card': '#FFFDF8',
      'bg-overlay': 'rgba(43, 34, 25, 0.28)',
      'surface': '#FFFDF8',
      'accent': '#C98C62',
      'accent-light': '#F1DDC8',
      'accent-dark': '#8E6242',
      'text-primary': '#2D2822',
      'text-secondary': '#71675C',
      'text-hint': '#A69B8F',
      'bubble-user-bg': '#C98C62',
      'bubble-user-text': '#FFFDF8',
      'bubble-ai-bg': '#FFFDF8',
      'bubble-ai-text': '#2D2822',
      'shadow-sm': '0 2px 12px rgba(62, 48, 32, 0.06)',
      'shadow-md': '0 8px 28px rgba(62, 48, 32, 0.09)',
      'shadow-lg': '0 16px 46px rgba(62, 48, 32, 0.12)',
      'shadow': '0 8px 28px rgba(62, 48, 32, 0.09)'
    }
  }
};

const LEGACY_PRESET_ALIAS = {
  default: 'cream',
  light: 'cream',
  warm: 'cream',
  pink: 'berry',
  sky: 'cream',
  dark: 'cocoa',
  night: 'cocoa'
};

let currentTheme = null;

export function applyTheme(variables = {}) {
  const safeVariables = normalizeVariables(variables);
  const root = document.documentElement;

  Object.entries(safeVariables).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    root.style.setProperty(`--${key}`, String(value));
  });

  const base = readCurrentTheme();
  const mergedCustom = {
    ...(base.customVariables || {}),
    ...safeVariables
  };

  currentTheme = normalizeTheme({
    ...base,
    variables: {
      ...(base.variables || {}),
      ...safeVariables
    },
    customVariables: mergedCustom
  });

  setMetaColor(currentTheme.variables['bg-primary']);
  return currentTheme;
}

export function exportTheme() {
  const theme = getCurrentTheme();
  return {
    preset: theme.preset,
    mode: theme.mode,
    variables: { ...theme.variables },
    customVariables: { ...theme.customVariables }
  };
}

export function importTheme(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  const imported = data && typeof data === 'object' ? data : {};

  const preset = normalizePresetId(imported.preset || getData(PRESET_KEY) || DEFAULT_PRESET);
  const presetTheme = getPresetById(preset);
  const mode = normalizeMode(imported.mode || presetTheme.mode || DEFAULT_MODE);

  const next = normalizeTheme({
    preset,
    mode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables,
      ...normalizeVariables(imported.variables || {}),
      ...normalizeVariables(imported.customVariables || {})
    },
    customVariables: {
      ...normalizeVariables(imported.customVariables || {})
    }
  });

  currentTheme = next;
  writeTheme(next);
  applyVariablesToDOM(next.variables);
  setMetaColor(next.variables['bg-primary']);
  return next;
}
// ═══════════════════════════════════════
// 【预设切换】选择内置主题预设
// ═══════════════════════════════════════

export function setPreset(name) {
  const presetId = normalizePresetId(name);
  const presetTheme = getPresetById(presetId);
  const base = readCurrentTheme();

  const next = normalizeTheme({
    preset: presetId,
    mode: presetTheme.mode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables,
      ...(base.customVariables || {})
    },
    customVariables: { ...(base.customVariables || {}) }
  });

  currentTheme = next;
  writeTheme(next);
  applyVariablesToDOM(next.variables);
  setMetaColor(next.variables['bg-primary']);
  return next;
}

// ═══════════════════════════════════════
// 【模式切换】浅色 / 夜间
// ═══════════════════════════════════════

export function setThemeMode(mode) {
  const safeMode = normalizeMode(mode);
  const base = readCurrentTheme();

  let presetId = base.preset || DEFAULT_PRESET;

  if (safeMode === 'dark' && !isPresetDark(presetId)) {
    presetId = 'cocoa';
  } else if (safeMode === 'light' && isPresetDark(presetId)) {
    presetId = 'cream';
  }

  const presetTheme = getPresetById(presetId);

  const next = normalizeTheme({
    preset: presetId,
    mode: safeMode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables,
      ...(base.customVariables || {})
    },
    customVariables: { ...(base.customVariables || {}) }
  });

  currentTheme = next;
  writeTheme(next);
  applyVariablesToDOM(next.variables);
  setMetaColor(next.variables['bg-primary']);
  return next;
}

// ═══════════════════════════════════════
// 【保存 / 加载】持久化到 localStorage
// ═══════════════════════════════════════

export function saveTheme() {
  const theme = getCurrentTheme();
  writeTheme(theme);
  return theme;
}

export function loadTheme() {
  const saved = getData(THEME_KEY);
  const preset = normalizePresetId(getData(PRESET_KEY) || saved?.preset || DEFAULT_PRESET);
  const presetTheme = getPresetById(preset);
  const mode = normalizeMode(getData(MODE_KEY) || saved?.mode || presetTheme.mode || DEFAULT_MODE);

  const savedVars = normalizeVariables(saved?.variables || {});
  const savedCustom = normalizeVariables(saved?.customVariables || {});

  const next = normalizeTheme({
    preset,
    mode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables,
      ...savedVars,
      ...savedCustom
    },
    customVariables: { ...savedCustom }
  });

  currentTheme = next;
  applyVariablesToDOM(next.variables);
  setMetaColor(next.variables['bg-primary']);
  return next;
}

// ═══════════════════════════════════════
// 【查询】获取预设列表 / 当前主题
// ═══════════════════════════════════════

export function getThemePresets() {
  return Object.values(PRESETS).map((preset) => ({
    id: preset.id,
    name: preset.name,
    mode: preset.mode
  }));
}

export function getCurrentTheme() {
  if (currentTheme) return { ...currentTheme };
  return readCurrentTheme();
}

// ═══════════════════════════════════════
// 【内部工具】读写、归一化、DOM操作
// ═══════════════════════════════════════

// ───────────────────
// 读取当前主题（内存 + localStorage 合并）
// ───────────────────

function readCurrentTheme() {
  if (currentTheme) return { ...currentTheme };

  const saved = getData(THEME_KEY);
  const preset = normalizePresetId(getData(PRESET_KEY) || saved?.preset || DEFAULT_PRESET);
  const presetTheme = getPresetById(preset);
  const mode = normalizeMode(getData(MODE_KEY) || saved?.mode || presetTheme.mode || DEFAULT_MODE);

  return normalizeTheme({
    preset,
    mode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables,
      ...normalizeVariables(saved?.variables || {}),
      ...normalizeVariables(saved?.customVariables || {})
    },
    customVariables: normalizeVariables(saved?.customVariables || {})
  });
}

// ───────────────────
// 写入 localStorage
// ───────────────────

function writeTheme(theme) {
  setData(THEME_KEY, {
    preset: theme.preset,
    mode: theme.mode,
    variables: { ...theme.variables },
    customVariables: { ...theme.customVariables }
  });

  setData(PRESET_KEY, theme.preset);
  setData(MODE_KEY, theme.mode);
}

// ───────────────────
// 变量写入 :root
// ───────────────────

function applyVariablesToDOM(variables) {
  const root = document.documentElement;

  Object.entries(variables).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    root.style.setProperty(`--${key}`, String(value));
  });
}

// ───────────────────
// meta theme-color 同步
// ───────────────────

function setMetaColor(color) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && color) meta.setAttribute('content', String(color));
}

// ───────────────────
// 归一化主题对象
// ───────────────────

function normalizeTheme(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};

  return {
    preset: normalizePresetId(obj.preset || DEFAULT_PRESET),
    mode: normalizeMode(obj.mode || DEFAULT_MODE),
    variables: {
      ...BASE_VARIABLES,
      ...normalizeVariables(obj.variables || {})
    },
    customVariables: normalizeVariables(obj.customVariables || {})
  };
}

// ───────────────────
// 归一化变量字典
// ───────────────────

function normalizeVariables(vars) {
  if (!vars || typeof vars !== 'object') return {};

  const result = {};

  Object.entries(vars).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    const cleanKey = String(key).replace(/^--/, '');
    if (!cleanKey) return;
    result[cleanKey] = String(value);
  });

  return result;
}

// ───────────────────
// 预设 ID 归一化（兼容旧别名）
// ───────────────────

function normalizePresetId(id) {
  const cleanId = String(id || '').trim().toLowerCase();
  if (PRESETS[cleanId]) return cleanId;
  if (LEGACY_PRESET_ALIAS[cleanId]) return LEGACY_PRESET_ALIAS[cleanId];
  return DEFAULT_PRESET;
}

// ───────────────────
// 模式归一化
// ───────────────────

function normalizeMode(mode) {
  const clean = String(mode || '').trim().toLowerCase();
  return clean === 'dark' ? 'dark' : 'light';
}

// ───────────────────
// 根据 ID 获取预设
// ───────────────────

function getPresetById(id) {
  return PRESETS[normalizePresetId(id)] || PRESETS[DEFAULT_PRESET];
}

// ───────────────────
// 判断预设是否为夜间
// ───────────────────

function isPresetDark(id) {
  const preset = PRESETS[normalizePresetId(id)];
  return preset ? preset.mode === 'dark' : false;
}

// 依赖：./storage.js(getData,setData)
