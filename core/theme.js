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
    id: 'sky', name: '海盐蓝', mode: 'light',
    vars: {
      '--bg-primary': '#EEF6FB',
      '--bg-secondary': '#DDEDF6',
      '--bg-card': '#FFFFFF',
      '--bg-overlay': 'rgba(0,0,0,0.24)',
      '--accent': '#7EC4E0',
      '--accent-light': '#CFE9F2',
      '--accent-dark': '#5AA6C6',
      '--text-primary': '#2A3A44',
      '--text-secondary': '#7A8E9A',
      '--text-hint': '#B8C8D0',
      '--bubble-user-bg': '#7EC4E0',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#2A3A44',
      '--shadow-glow': '0 0 20px rgba(126,196,224,0.40)'
    }
  },
  sakura: {
    id: 'sakura', name: '草莓牛奶', mode: 'light',
    vars: {
      '--bg-primary': '#FDEEF1',
      '--bg-secondary': '#F8DEE5',
      '--bg-card': '#FFFFFF',
      '--bg-overlay': 'rgba(0,0,0,0.22)',
      '--accent': '#F5A0B0',
      '--accent-light': '#FBDFE6',
      '--accent-dark': '#E07C90',
      '--text-primary': '#3A2630',
      '--text-secondary': '#9A8088',
      '--text-hint': '#D0B8BE',
      '--bubble-user-bg': '#F5A0B0',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#3A2630',
      '--shadow-glow': '0 0 20px rgba(245,160,176,0.40)'
    }
  },
  lavender: {
    id: 'lavender', name: '焦糖拿铁', mode: 'light',
    vars: {
      '--bg-primary': '#F7F0E6',
      '--bg-secondary': '#EDE0CC',
      '--bg-card': '#FFFFFF',
      '--bg-overlay': 'rgba(0,0,0,0.24)',
      '--accent': '#D4A87A',
      '--accent-light': '#EEDCC2',
      '--accent-dark': '#B08658',
      '--text-primary': '#3A2A1A',
      '--text-secondary': '#8A7C68',
      '--text-hint': '#C8B8A0',
      '--bubble-user-bg': '#D4A87A',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#3A2A1A',
      '--shadow-glow': '0 0 20px rgba(212,168,122,0.40)'
    }
  },
  skyDark: {
    id: 'skyDark', name: '夜海蓝', mode: 'dark',
    vars: {
      '--bg-primary': '#15212C',
      '--bg-secondary': '#1E2D3C',
      '--bg-card': '#243648',
      '--bg-overlay': 'rgba(0,0,0,0.55)',
      '--accent': '#8FD0E8',
      '--accent-light': '#2A4050',
      '--accent-dark': '#6AAEC8',
      '--text-primary': '#E8F0F6',
      '--text-secondary': '#9AB0BC',
      '--text-hint': '#5C7080',
      '--bubble-user-bg': '#6AAEC8',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#2A3C4E',
      '--bubble-ai-text': '#E8F0F6',
      '--shadow-glow': '0 0 20px rgba(143,208,232,0.40)'
    }
  },
  sakuraDark: {
    id: 'sakuraDark', name: '夜莓粉', mode: 'dark',
    vars: {
      '--bg-primary': '#231820',
      '--bg-secondary': '#2E2028',
      '--bg-card': '#3A2832',
      '--bg-overlay': 'rgba(0,0,0,0.55)',
      '--accent': '#F5A0B0',
      '--accent-light': '#3A2832',
      '--accent-dark': '#E07C90',
      '--text-primary': '#F6E4EA',
      '--text-secondary': '#B098A0',
      '--text-hint': '#6C5860',
      '--bubble-user-bg': '#E07C90',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#3A2832',
      '--bubble-ai-text': '#F6E4EA',
      '--shadow-glow': '0 0 20px rgba(245,160,176,0.40)'
    }
  },
  lavenderDark: {
    id: 'lavenderDark', name: '夜焦糖', mode: 'dark',
    vars: {
      '--bg-primary': '#22180E',
      '--bg-secondary': '#2C2018',
      '--bg-card': '#382A1E',
      '--bg-overlay': 'rgba(0,0,0,0.55)',
      '--accent': '#E0B888',
      '--accent-light': '#3A2C20',
      '--accent-dark': '#B88E58',
      '--text-primary': '#F4E8D8',
      '--text-secondary': '#B8A488',
      '--text-hint': '#706048',
      '--bubble-user-bg': '#B88E58',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#382A1E',
      '--bubble-ai-text': '#F4E8D8',
      '--shadow-glow': '0 0 20px rgba(224,184,136,0.40)'
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
  '--spacing-xs': '6px',
  '--spacing-sm': '10px',
  '--spacing-md': '18px',
  '--spacing-lg': '26px',
  '--spacing-xl': '36px',
  '--radius-sm': '12px',
  '--radius-md': '18px',
  '--radius-lg': '26px',
  '--radius-icon': '18px',
  '--radius-card': '24px',
  '--radius-sheet': '28px',
  '--radius-dock': '32px',
  '--bubble-radius': '20px',
  '--bubble-radius-tail': '6px',
  '--shadow-sm': '0 2px 8px rgba(0,0,0,0.04)',
  '--shadow-md': '0 4px 16px rgba(0,0,0,0.06)',
  '--shadow-lg': '0 8px 28px rgba(0,0,0,0.10)',
  '--glass-blur': '14px',
  '--glass-blur-strong': '20px',
  '--wallpaper-soft': '0.10',
  '--press-scale': '0.94',
  '--motion': 'all 220ms ease',
  '--motion-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  '--motion-fast': 'all 140ms ease',
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
  return getData(KEYS.appTheme, 'lavender');
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
    restoreCustomColors(); // 切主题后重应用自定义颜色覆盖
    bus.emit('theme:changed', { id, theme: custom });
    return true;
  }
  setData(KEYS.appTheme, id);
  applyTheme(preset);
  restoreCustomColors(); // 切主题后重应用自定义颜色覆盖
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
