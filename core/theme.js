// core/theme.js
// 主题系统：6 套预设 + 自定义颜色 + 导入导出。
// 修复原 bug：
//  1) getCurrentTheme 深拷贝（避免污染预设）
//  2) importTheme 的 JSON.parse 加 try-catch
//  3) 派发 theme:changed 事件
// 依赖：core/storage-keys.js, core/events.js, core/storage.js

import { KEYS } from './storage-keys.js';
import { getData, setData } from './storage.js';
import bus from './events.js';

const CUSTOM_COLORS_KEY = KEYS.appCustomColors;

const PRESETS = {
  sky: {
    id: 'sky', name: '天空蓝', mode: 'light',
    vars: {
      '--bg-primary': '#F2F6FB',
      '--bg-secondary': '#E4ECF5',
      '--bg-card': '#FFFFFF',
      '--bg-overlay': 'rgba(0,0,0,0.28)',
      '--accent': '#7AA2D6',
      '--accent-light': '#DAE5F5',
      '--accent-dark': '#5B84BC',
      '--text-primary': '#1C1C1E',
      '--text-secondary': '#8A8A8E',
      '--text-hint': '#C4C4C8',
      '--bubble-user-bg': '#7AA2D6',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#1C1C1E',
      '--shadow-glow': '0 0 16px rgba(122,162,214,0.45)'
    }
  },
  sakura: {
    id: 'sakura', name: '樱花粉', mode: 'light',
    vars: {
      '--bg-primary': '#FDF5F7',
      '--bg-secondary': '#F8E6EC',
      '--bg-card': '#FFFFFF',
      '--bg-overlay': 'rgba(0,0,0,0.24)',
      '--accent': '#E2A0B4',
      '--accent-light': '#F8DEE8',
      '--accent-dark': '#C88898',
      '--text-primary': '#2A1C22',
      '--text-secondary': '#9A8088',
      '--text-hint': '#C4B0B6',
      '--bubble-user-bg': '#E2A0B4',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#2A1C22',
      '--shadow-glow': '0 0 16px rgba(226,160,180,0.45)'
    }
  },
  lavender: {
    id: 'lavender', name: '奶咖棕', mode: 'light',
    vars: {
      '--bg-primary': '#F7F2EC',
      '--bg-secondary': '#EDE3D6',
      '--bg-card': '#FFFFFF',
      '--bg-overlay': 'rgba(0,0,0,0.26)',
      '--accent': '#C9A47C',
      '--accent-light': '#EAD9C2',
      '--accent-dark': '#A8825A',
      '--text-primary': '#2A2218',
      '--text-secondary': '#8A7C68',
      '--text-hint': '#C4B8A4',
      '--bubble-user-bg': '#C9A47C',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#2A2218',
      '--shadow-glow': '0 0 16px rgba(201,164,124,0.45)'
    }
  },
  skyDark: {
    id: 'skyDark', name: '深夜蓝', mode: 'dark',
    vars: {
      '--bg-primary': '#0F1622',
      '--bg-secondary': '#1A2230',
      '--bg-card': '#222B3A',
      '--bg-overlay': 'rgba(0,0,0,0.55)',
      '--accent': '#8FB8E8',
      '--accent-light': '#2A3A52',
      '--accent-dark': '#6A95C8',
      '--text-primary': '#E8ECF2',
      '--text-secondary': '#9AA4B0',
      '--text-hint': '#5C6674',
      '--bubble-user-bg': '#5B84BC',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#2A3544',
      '--bubble-ai-text': '#E8ECF2',
      '--shadow-glow': '0 0 16px rgba(143,184,232,0.45)'
    }
  },
  sakuraDark: {
    id: 'sakuraDark', name: '夜樱粉', mode: 'dark',
    vars: {
      '--bg-primary': '#1F161A',
      '--bg-secondary': '#2A1F24',
      '--bg-card': '#33262C',
      '--bg-overlay': 'rgba(0,0,0,0.55)',
      '--accent': '#E2A0B4',
      '--accent-light': '#3A2630',
      '--accent-dark': '#C88898',
      '--text-primary': '#F2E0E6',
      '--text-secondary': '#A89098',
      '--text-hint': '#6C5A60',
      '--bubble-user-bg': '#C88898',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#33262C',
      '--bubble-ai-text': '#F2E0E6',
      '--shadow-glow': '0 0 16px rgba(226,160,180,0.45)'
    }
  },
  lavenderDark: {
    id: 'lavenderDark', name: '夜咖棕', mode: 'dark',
    vars: {
      '--bg-primary': '#1F1812',
      '--bg-secondary': '#2A2118',
      '--bg-card': '#332820',
      '--bg-overlay': 'rgba(0,0,0,0.55)',
      '--accent': '#D4B088',
      '--accent-light': '#3A2E22',
      '--accent-dark': '#A8825A',
      '--text-primary': '#F2E6D8',
      '--text-secondary': '#B0A088',
      '--text-hint': '#6C5E48',
      '--bubble-user-bg': '#A8825A',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#332820',
      '--bubble-ai-text': '#F2E6D8',
      '--shadow-glow': '0 0 16px rgba(212,176,136,0.45)'
    }
  }
};

// 全局共享变量（与主题无关，固定结构）
const SHARED_VARS = {
  '--font-main': "'PingFang SC', 'Microsoft YaHei', sans-serif",
  '--font-size-base': '15px',
  '--font-size-small': '13px',
  '--font-size-title': '17px',
  '--font-size-large': '20px',
  '--font-size-huge': '28px',
  '--spacing-xs': '4px',
  '--spacing-sm': '8px',
  '--spacing-md': '16px',
  '--spacing-lg': '24px',
  '--spacing-xl': '32px',
  '--radius-sm': '8px',
  '--radius-md': '16px',
  '--radius-lg': '24px',
  '--radius-icon': '14px',
  '--radius-card': '20px',
  '--radius-sheet': '24px',
  '--radius-dock': '28px',
  '--bubble-radius': '18px',
  '--bubble-radius-tail': '4px',
  '--shadow-sm': '0 1px 3px rgba(0,0,0,0.05)',
  '--shadow-md': '0 2px 10px rgba(0,0,0,0.08)',
  '--shadow-lg': '0 6px 24px rgba(0,0,0,0.12)',
  '--glass-blur': '14px',
  '--glass-blur-strong': '20px',
  '--wallpaper-soft': '0.10',
  '--press-scale': '0.96',
  '--motion': 'all 200ms ease',
  '--motion-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  '--motion-fast': 'all 120ms ease',
  '--icon-size': '60px',
  '--dock-base': '84px',
  '--status-bar-base': '44px',
  '--widget-scale': '1'
};

export function getPresets() {
  // 深拷贝避免污染
  return JSON.parse(JSON.stringify(PRESETS));
}

export function getPreset(id) {
  if (!PRESETS[id]) return null;
  // 深拷贝避免污染
  return JSON.parse(JSON.stringify(PRESETS[id]));
}

export function getCurrentThemeId() {
  return getData(KEYS.appTheme, 'sky');
}

export function getCurrentTheme() {
  const id = getCurrentThemeId();
  const preset = getPreset(id);
  if (preset) return preset;
  // 自定义主题
  const custom = getData(KEYS.appCustomTheme, null);
  if (custom && custom.id === id) return JSON.parse(JSON.stringify(custom));
  return getPreset('sky');
}

export function applyTheme(theme) {
  const root = document.documentElement;
  // 先清掉旧主题变量
  const allKeys = new Set([
    ...Object.keys(SHARED_VARS),
    ...Object.keys(PRESETS.sky.vars)
  ]);
  allKeys.forEach((k) => root.style.removeProperty(k));
  // 写入共享变量
  for (const [k, v] of Object.entries(SHARED_VARS)) root.style.setProperty(k, v);
  // 写入主题变量
  if (theme && theme.vars) {
    for (const [k, v] of Object.entries(theme.vars)) root.style.setProperty(k, v);
  }
  // data-mode 用于深色选择器
  if (theme && theme.mode) root.setAttribute('data-theme-mode', theme.mode);
  // theme-color meta
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && theme.vars && theme.vars['--bg-primary']) {
    meta.setAttribute('content', theme.vars['--bg-primary']);
  }
}

export function setTheme(id) {
  const preset = getPreset(id);
  if (!preset) {
    // 可能是自定义
    const custom = getData(KEYS.appCustomTheme, null);
    if (!custom || custom.id !== id) return false;
    setData(KEYS.appTheme, id);
    applyTheme(custom);
    bus.emit('theme:changed', { id, theme: custom });
    return true;
  }
  setData(KEYS.appTheme, id);
  applyTheme(preset);
  bus.emit('theme:changed', { id, theme: preset });
  return true;
}

export function saveCustomTheme(theme) {
  if (!theme || !theme.id) throw new Error('自定义主题缺少 id 嘛');
  setData(KEYS.appCustomTheme, theme);
  return true;
}

export function exportTheme(themeId) {
  const t = themeId ? getPreset(themeId) || getData(KEYS.appCustomTheme, null) : getCurrentTheme();
  if (!t) throw new Error('主题不存在嘛');
  return JSON.stringify(t, null, 2);
}

export function importTheme(jsonText) {
  // 修复：JSON.parse 加 try-catch
  let theme;
  try {
    theme = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
  } catch (e) {
    throw new Error('主题文件读不出来嘛');
  }
  if (!theme || !theme.id || !theme.vars) throw new Error('主题格式不对嘛');
  saveCustomTheme(theme);
  return theme;
}

export function loadTheme() {
  // 系统暗色偏好
  const savedId = getCurrentThemeId();
  if (savedId && savedId !== 'auto') {
    applyTheme(getCurrentTheme());
    return;
  }
  // auto 模式：跟随系统
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(getPreset(prefersDark ? 'skyDark' : 'sky'));
}

export function followSystemDark() {
  if (!window.matchMedia) return;
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  const handler = (e) => {
    if (getCurrentThemeId() === 'auto') {
      applyTheme(getPreset(e.matches ? 'skyDark' : 'sky'));
    }
  };
  if (mq.addEventListener) mq.addEventListener('change', handler);
  else if (mq.addListener) mq.addListener(handler);
}

// 系统字体应用
export function applyFontFamily(fontFamily, blobUrl) {
  if (blobUrl) {
    const existing = document.getElementById('custom-font-face');
    if (existing) existing.remove();
    const style = document.createElement('style');
    style.id = 'custom-font-face';
    style.textContent = `@font-face { font-family: 'PopoCustom'; src: url('${blobUrl}'); }`;
    document.head.appendChild(style);
    document.documentElement.style.setProperty('--font-main', "'PopoCustom', 'PingFang SC', 'Microsoft YaHei', sans-serif");
  } else if (fontFamily) {
    document.documentElement.style.setProperty('--font-main', fontFamily);
  }
}

// 桌面缩放变量应用
export function applyDesktopScale(iconScale, widgetScale, dockScale) {
  const root = document.documentElement;
  if (iconScale !== undefined) {
    const size = 60 * iconScale;
    root.style.setProperty('--icon-size', `${size}px`);
  }
  if (widgetScale !== undefined) root.style.setProperty('--widget-scale', String(widgetScale));
  if (dockScale !== undefined) root.style.setProperty('--dock-base', `${84 * dockScale}px`);
  root.style.setProperty('--desktop-icon-scale', String(iconScale ?? 1));
  root.style.setProperty('--desktop-widget-scale', String(widgetScale ?? 1));
  root.style.setProperty('--desktop-dock-scale', String(dockScale ?? 1));
}

export function listThemes() {
  const presets = Object.values(getPresets()).map((t) => ({ id: t.id, name: t.name, mode: t.mode }));
  const custom = getData(KEYS.appCustomTheme, null);
  if (custom) presets.push({ id: custom.id, name: custom.name || '自定义', mode: custom.mode || 'light' });
  return presets;
}

// ════════════════════════════════════════
// 运行时自定义颜色（基于当前主题覆盖单个 CSS 变量）
// ════════════════════════════════════════

export function getCustomColors() {
  return getData(CUSTOM_COLORS_KEY, {});
}

/**
 * 应用一组颜色覆盖到根元素，并持久化。
 * @param {Record<string,string>} colors  例：{ '--accent': '#FF0000' }
 */
export function applyCustomColors(colors) {
  const root = document.documentElement;
  const cleaned = {};
  for (const [k, v] of Object.entries(colors || {})) {
    if (typeof k === 'string' && k.startsWith('--') && typeof v === 'string' && v) {
      root.style.setProperty(k, v);
      cleaned[k] = v;
    }
  }
  setData(CUSTOM_COLORS_KEY, cleaned);
  bus.emit('theme:changed', { id: getCurrentThemeId(), custom: cleaned });
  return cleaned;
}

export function clearCustomColors() {
  const root = document.documentElement;
  const saved = getData(CUSTOM_COLORS_KEY, {});
  Object.keys(saved).forEach((k) => root.style.removeProperty(k));
  setData(CUSTOM_COLORS_KEY, {});
  // 重新应用当前主题，恢复 preset 原值
  applyTheme(getCurrentTheme());
  bus.emit('theme:changed', { id: getCurrentThemeId() });
}

/** 启动时恢复自定义颜色覆盖 */
export function restoreCustomColors() {
  const saved = getData(CUSTOM_COLORS_KEY, {});
  const root = document.documentElement;
  for (const [k, v] of Object.entries(saved)) {
    root.style.setProperty(k, v);
  }
}

/** 取某个主题某变量的当前值（用于颜色拾取器回填） */
export function getThemeVar(themeId, varName) {
  const t = getPreset(themeId) || getData(KEYS.appCustomTheme, null);
  if (t && t.vars && t.vars[varName]) return t.vars[varName];
  // 落到当前实际计算值
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}
