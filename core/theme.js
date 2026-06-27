// imports:
//   from './storage.js': getData, setData

import { getData, setData } from './storage.js';

const THEME_KEY = 'app_theme';
const PRESET_KEY = 'app_theme_preset';
const MODE_KEY = 'app_theme_mode';

const DEFAULT_PRESET = 'blue';
const DEFAULT_MODE = 'light';

const FONT_FALLBACK = "'PingFang SC', 'Microsoft YaHei', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// ═══════════════════════════════════════
// 【基础变量】默认值（对应汽水蓝主题）
// ═══════════════════════════════════════

const BASE_VARIABLES = {
  'bg-primary': '#E5F3FA',
  'bg-secondary': '#DED4E6',
  'bg-card': '#FFFFFF',
  'bg-overlay': 'rgba(0, 0, 0, 0.28)',
  'surface': '#FFFFFF',
  'accent': '#FAC7DA',
  'accent-light': '#FDEEF3',
  'accent-dark': '#E8A0BC',
  'text-primary': '#4A4038',
  'text-secondary': '#908880',
  'text-hint': '#B8B0A8',
  'bubble-user-bg': '#FAC7DA',
  'bubble-user-text': '#4A4038',
  'bubble-ai-bg': '#FFFFFF',
  'bubble-ai-text': '#4A4038',
  'bubble-radius': '18px',
  'bubble-radius-tail': '4px',
  'font-main': FONT_FALLBACK,
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
  'shadow-sm': '0 1px 4px rgba(0, 0, 0, 0.05)',
  'shadow-md': '0 2px 12px rgba(0, 0, 0, 0.08)',
  'shadow-lg': '0 8px 32px rgba(0, 0, 0, 0.12)',
  'shadow': '0 2px 12px rgba(0, 0, 0, 0.08)',
  'motion': 'all 200ms ease',
  'press-scale': '0.96'
};

// ═══════════════════════════════════════
// 【阴影常量】日间 / 夜间
// ═══════════════════════════════════════

const LIGHT_SHADOWS = {
  'shadow-sm': '0 1px 4px rgba(0, 0, 0, 0.05)',
  'shadow-md': '0 2px 12px rgba(0, 0, 0, 0.08)',
  'shadow-lg': '0 8px 32px rgba(0, 0, 0, 0.12)',
  'shadow': '0 2px 12px rgba(0, 0, 0, 0.08)'
};

const DARK_SHADOWS = {
  'shadow-sm': '0 1px 4px rgba(0, 0, 0, 0.18)',
  'shadow-md': '0 2px 12px rgba(0, 0, 0, 0.24)',
  'shadow-lg': '0 8px 32px rgba(0, 0, 0, 0.36)',
  'shadow': '0 2px 12px rgba(0, 0, 0, 0.24)'
};

// ═══════════════════════════════════════
// 【主题预设】3 浅色 + 3 夜间
// ═══════════════════════════════════════

const PRESETS = {
  // ────────────────────────────────────────────
  // 汽水蓝 — 蓝底 + 粉气泡
  // ────────────────────────────────────────────
  blue: {
    id: 'blue',
    name: '汽水蓝',
    mode: 'light',
    variables: {
      'bg-primary': '#E5F3FA',
      'bg-secondary': '#DED4E6',
      'bg-card': '#FFFFFF',
      'bg-overlay': 'rgba(0, 0, 0, 0.28)',
      'surface': '#FFFFFF',
      'accent': '#FAC7DA',
      'accent-light': '#FDEEF3',
      'accent-dark': '#E8A0BC',
      'text-primary': '#4A4038',
      'text-secondary': '#908880',
      'text-hint': '#B8B0A8',
      'bubble-user-bg': '#FAC7DA',
      'bubble-user-text': '#4A4038',
      'bubble-ai-bg': '#FFFFFF',
      'bubble-ai-text': '#4A4038',
      ...LIGHT_SHADOWS
    }
  },

  // ────────────────────────────────────────────
  // 珊瑚糖 — 蓝底 + 粉底 + 米色卡片
  // ────────────────────────────────────────────
  coral: {
    id: 'coral',
    name: '珊瑚糖',
    mode: 'light',
    variables: {
      'bg-primary': '#DDE8F6',
      'bg-secondary': '#F5D7D6',
      'bg-card': '#FDF4ED',
      'bg-overlay': 'rgba(0, 0, 0, 0.28)',
      'surface': '#FDF4ED',
      'accent': '#9F8F82',
      'accent-light': '#E7E3DF',
      'accent-dark': '#786E64',
      'text-primary': '#4A4038',
      'text-secondary': '#908880',
      'text-hint': '#B8B0A8',
      'bubble-user-bg': '#9F8F82',
      'bubble-user-text': '#FFFFFF',
      'bubble-ai-bg': '#FDF4ED',
      'bubble-ai-text': '#4A4038',
      ...LIGHT_SHADOWS
    }
  },

  // ────────────────────────────────────────────
  // 香芋泥 — 淡紫底 + 紫气泡
  // ────────────────────────────────────────────
  purple: {
    id: 'purple',
    name: '香芋泥',
    mode: 'light',
    variables: {
      'bg-primary': '#EDECFA',
      'bg-secondary': '#D5CFEC',
      'bg-card': '#F8F6FB',
      'bg-overlay': 'rgba(0, 0, 0, 0.28)',
      'surface': '#F8F6FB',
      'accent': '#CAB7E3',
      'accent-light': '#F0ECF6',
      'accent-dark': '#A08EC0',
      'text-primary': '#4A4038',
      'text-secondary': '#908880',
      'text-hint': '#B8B0A8',
      'bubble-user-bg': '#CAB7E3',
      'bubble-user-text': '#4A4038',
      'bubble-ai-bg': '#F8F6FB',
      'bubble-ai-text': '#4A4038',
      ...LIGHT_SHADOWS
    }
  },

  // ────────────────────────────────────────────
  // 黑粉夜 — 暗夜 + 粉强调
  // ────────────────────────────────────────────
  'rose-noir': {
    id: 'rose-noir',
    name: '黑粉夜',
    mode: 'dark',
    variables: {
      'bg-primary': '#1E1A1C',
      'bg-secondary': '#282226',
      'bg-card': '#30282C',
      'bg-overlay': 'rgba(0, 0, 0, 0.52)',
      'surface': '#30282C',
      'accent': '#C48A9A',
      'accent-light': '#483840',
      'accent-dark': '#D8A0AE',
      'text-primary': '#E8E0E4',
      'text-secondary': '#A09098',
      'text-hint': '#706068',
      'bubble-user-bg': '#C48A9A',
      'bubble-user-text': '#1E1A1C',
      'bubble-ai-bg': '#30282C',
      'bubble-ai-text': '#E8E0E4',
      ...DARK_SHADOWS
    }
  },

  // ────────────────────────────────────────────
  // 焦糖夜 — 暖棕底 + 焦糖强调
  // ────────────────────────────────────────────
  caramel: {
    id: 'caramel',
    name: '焦糖夜',
    mode: 'dark',
    variables: {
      'bg-primary': '#22201C',
      'bg-secondary': '#2C2822',
      'bg-card': '#342E26',
      'bg-overlay': 'rgba(0, 0, 0, 0.52)',
      'surface': '#342E26',
      'accent': '#C8A882',
      'accent-light': '#443C30',
      'accent-dark': '#DCC098',
      'text-primary': '#E8E0D4',
      'text-secondary': '#A09488',
      'text-hint': '#706458',
      'bubble-user-bg': '#C8A882',
      'bubble-user-text': '#22201C',
      'bubble-ai-bg': '#342E26',
      'bubble-ai-text': '#E8E0D4',
      ...DARK_SHADOWS
    }
  },

  // ────────────────────────────────────────────
  // 铅灰夜 — 冷灰底 + 灰强调
  // ────────────────────────────────────────────
  gray: {
    id: 'gray',
    name: '铅灰夜',
    mode: 'dark',
    variables: {
      'bg-primary': '#1E1E22',
      'bg-secondary': '#26262A',
      'bg-card': '#2E2E32',
      'bg-overlay': 'rgba(0, 0, 0, 0.52)',
      'surface': '#2E2E32',
      'accent': '#989898',
      'accent-light': '#404044',
      'accent-dark': '#B0B0B0',
      'text-primary': '#E4E4E8',
      'text-secondary': '#909098',
      'text-hint': '#606064',
      'bubble-user-bg': '#989898',
      'bubble-user-text': '#1E1E22',
      'bubble-ai-bg': '#2E2E32',
      'bubble-ai-text': '#E4E4E8',
      ...DARK_SHADOWS
    }
  }
};

// ═══════════════════════════════════════
// 【旧版兼容】老主题 ID 映射到新 ID
// ═══════════════════════════════════════

const LEGACY_PRESET_ALIAS = {
  default: 'blue',
  light: 'blue',
  warm: 'coral',
  sky: 'blue',
  paper: 'blue',
  peach: 'coral',
  berry: 'coral',
  strawberry: 'coral',
  pink: 'coral',
  cream: 'coral',
  blush: 'coral',
  lavender: 'purple',
  dark: 'rose-noir',
  night: 'rose-noir',
  dusk: 'rose-noir',
  candle: 'caramel',
  milk: 'caramel',
  cocoa: 'caramel',
  'warm-gray': 'gray',
  'milk-cafe': 'caramel',
  purple: 'purple'
};

let currentTheme = null;

// ═══════════════════════════════════════
// 【主题应用】写入变量 + 更新主题对象
// ═══════════════════════════════════════

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

// ═══════════════════════════════════════
// 【导入导出】主题文件读写
// ═══════════════════════════════════════

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

  document.documentElement.setAttribute('data-theme', preset);

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
// 【预设切换】选择内置主题，清除自定义颜色
// ═══════════════════════════════════════

export function setPreset(name) {
  const presetId = normalizePresetId(name);
  const presetTheme = getPresetById(presetId);

  document.documentElement.setAttribute('data-theme', presetId);

  const next = normalizeTheme({
    preset: presetId,
    mode: presetTheme.mode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables
    },
    customVariables: {}
  });

  currentTheme = next;
  writeTheme(next);
  applyVariablesToDOM(next.variables);
  setMetaColor(next.variables['bg-primary']);
  return next;
}

// ═══════════════════════════════════════
// 【模式切换】浅色 → 汽水蓝 / 夜间 → 黑粉夜
// ═══════════════════════════════════════

export function setThemeMode(mode) {
  const safeMode = normalizeMode(mode);
  const presetId = safeMode === 'dark' ? 'rose-noir' : 'blue';
  const presetTheme = getPresetById(presetId);

  document.documentElement.setAttribute('data-theme', presetId);

  const next = normalizeTheme({
    preset: presetId,
    mode: safeMode,
    variables: {
      ...BASE_VARIABLES,
      ...presetTheme.variables
    },
    customVariables: {}
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

  document.documentElement.setAttribute('data-theme', preset);

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
// 读取当前主题
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
// meta theme-color
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
// 获取预设
// ───────────────────

function getPresetById(id) {
  return PRESETS[normalizePresetId(id)] || PRESETS[DEFAULT_PRESET];
}

// ───────────────────
// 判断是否夜间
// ───────────────────

function isPresetDark(id) {
  const preset = PRESETS[normalizePresetId(id)];
  return preset ? preset.mode === 'dark' : false;
}

// 依赖：./storage.js(getData, setData)
