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
// 【基础变量】默认值
// ═══════════════════════════════════════

const BASE_VARIABLES = {
  'bg-primary': '#E2E6EC',
  'bg-secondary': '#D8DCE4',
  'bg-card': '#F4F5F8',
  'bg-overlay': 'rgba(0, 0, 0, 0.28)',
  'surface': '#F4F5F8',
  'accent': '#6888A8',
  'accent-light': '#C8D4E0',
  'accent-dark': '#4C6C88',
  'text-primary': '#1C1C1E',
  'text-secondary': '#8A8A8E',
  'text-hint': '#C4C4C8',
  'bubble-user-bg': '#6888A8',
  'bubble-user-text': '#FFFFFF',
  'bubble-ai-bg': '#F4F5F8',
  'bubble-ai-text': '#1C1C1E',
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
  // ────────────────────────────
  // 蓝灰：冷灰蓝背景 + 钢蓝强调
  // ────────────────────────────
  blue: {
    id: 'blue',
    name: '蓝灰',
    mode: 'light',
    variables: {
      'bg-primary': '#E2E6EC',
      'bg-secondary': '#D8DCE4',
      'bg-card': '#F4F5F8',
      'bg-overlay': 'rgba(0, 0, 0, 0.28)',
      'surface': '#F4F5F8',
      'accent': '#6888A8',
      'accent-light': '#C8D4E0',
      'accent-dark': '#4C6C88',
      'text-primary': '#1C1C1E',
      'text-secondary': '#8A8A8E',
      'text-hint': '#C4C4C8',
      'bubble-user-bg': '#6888A8',
      'bubble-user-text': '#FFFFFF',
      'bubble-ai-bg': '#F4F5F8',
      'bubble-ai-text': '#1C1C1E',
      ...LIGHT_SHADOWS
    }
  },

  // ────────────────────────────
  // 奶粉：暖粉背景 + 玫瑰强调
  // ────────────────────────────
  pink: {
    id: 'pink',
    name: '奶粉',
    mode: 'light',
    variables: {
      'bg-primary': '#F0E0E4',
      'bg-secondary': '#E8D4DA',
      'bg-card': '#FDF6F8',
      'bg-overlay': 'rgba(0, 0, 0, 0.28)',
      'surface': '#FDF6F8',
      'accent': '#D48A9A',
      'accent-light': '#F2D0DA',
      'accent-dark': '#B86E80',
      'text-primary': '#1C1C1E',
      'text-secondary': '#8A8A8E',
      'text-hint': '#C4C4C8',
      'bubble-user-bg': '#D48A9A',
      'bubble-user-text': '#FFFFFF',
      'bubble-ai-bg': '#FDF6F8',
      'bubble-ai-text': '#1C1C1E',
      ...LIGHT_SHADOWS
    }
  },

  // ────────────────────────────
  // 奶黄：暖黄背景 + 琥珀强调
  // ────────────────────────────
  cream: {
    id: 'cream',
    name: '奶黄',
    mode: 'light',
    variables: {
      'bg-primary': '#EFE7D8',
      'bg-secondary': '#E8DED0',
      'bg-card': '#FDFAF4',
      'bg-overlay': 'rgba(0, 0, 0, 0.28)',
      'surface': '#FDFAF4',
      'accent': '#C89848',
      'accent-light': '#F0DDB8',
      'accent-dark': '#A87830',
      'text-primary': '#1C1C1E',
      'text-secondary': '#8A8A8E',
      'text-hint': '#C4C4C8',
      'bubble-user-bg': '#C89848',
      'bubble-user-text': '#FFFFFF',
      'bubble-ai-bg': '#FDFAF4',
      'bubble-ai-text': '#1C1C1E',
      ...LIGHT_SHADOWS
    }
  },

  // ────────────────────────────
  // 奶咖夜（不变）
  // ────────────────────────────
  'milk-cafe': {
    id: 'milk-cafe',
    name: '奶咖夜',
    mode: 'dark',
    variables: {
      'bg-primary': '#2A2420',
      'bg-secondary': '#352F2A',
      'bg-card': '#3C352F',
      'bg-overlay': 'rgba(0, 0, 0, 0.52)',
      'surface': '#3C352F',
      'accent': '#C8A882',
      'accent-light': '#4A4038',
      'accent-dark': '#D8BC96',
      'text-primary': '#F0E8DC',
      'text-secondary': '#A89888',
      'text-hint': '#786858',
      'bubble-user-bg': '#C8A882',
      'bubble-user-text': '#2A2420',
      'bubble-ai-bg': '#3C352F',
      'bubble-ai-text': '#F0E8DC',
      ...DARK_SHADOWS
    }
  },

  // ────────────────────────────
  // 石墨夜：冷灰底 + 铜金点缀
  // ────────────────────────────
  'warm-gray': {
    id: 'warm-gray',
    name: '石墨夜',
    mode: 'dark',
    variables: {
      'bg-primary': '#1E2024',
      'bg-secondary': '#282A30',
      'bg-card': '#303238',
      'bg-overlay': 'rgba(0, 0, 0, 0.52)',
      'surface': '#303238',
      'accent': '#BC9860',
      'accent-light': '#3C3834',
      'accent-dark': '#D0AE78',
      'text-primary': '#E4E2DE',
      'text-secondary': '#908C88',
      'text-hint': '#605C58',
      'bubble-user-bg': '#BC9860',
      'bubble-user-text': '#1E2024',
      'bubble-ai-bg': '#303238',
      'bubble-ai-text': '#E4E2DE',
      ...DARK_SHADOWS
    }
  },

  // ────────────────────────────
  // 黑粉（不变）
  // ────────────────────────────
  'rose-noir': {
    id: 'rose-noir',
    name: '黑粉',
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
      'text-primary': '#F0E4E8',
      'text-secondary': '#A89098',
      'text-hint': '#706068',
      'bubble-user-bg': '#C48A9A',
      'bubble-user-text': '#1E1A1C',
      'bubble-ai-bg': '#30282C',
      'bubble-ai-text': '#F0E4E8',
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
  warm: 'cream',
  sky: 'blue',
  paper: 'blue',
  peach: 'pink',
  berry: 'pink',
  strawberry: 'pink',
  dark: 'milk-cafe',
  night: 'milk-cafe',
  dusk: 'warm-gray',
  candle: 'milk-cafe',
  milk: 'milk-cafe',
  cocoa: 'milk-cafe',
  purple: 'blue'
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
// 【模式切换】浅色 → 蓝灰 / 夜间 → 奶咖夜
// ═══════════════════════════════════════

export function setThemeMode(mode) {
  const safeMode = normalizeMode(mode);
  const presetId = safeMode === 'dark' ? 'milk-cafe' : 'blue';
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
