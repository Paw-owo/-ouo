// core/theme.js
// 主题系统：6 套预设 + 自定义颜色 + 导入导出。
// 风格：Soft Cozy Minimal（温柔软萌极简风）—— 柔和低饱和、同色系阴影、软萌圆角、呼吸感动效。
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
      '--bg-primary': '#F8FAFD',
      '--bg-secondary': '#EAF1F8',
      '--bg-card': '#FCFDFE',
      '--bg-overlay': 'rgba(42,48,64,0.30)',
      '--accent': '#A8CCE8',
      '--accent-light': '#DCEAF4',
      '--accent-dark': '#7EB0D0',
      '--text-primary': '#2A3040',
      '--text-secondary': '#6A7A8C',
      '--text-hint': '#A8B8C8',
      '--bubble-user-bg': '#A8CCE8',
      '--bubble-user-text': '#FFFCFB',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#2A3040',
      '--shadow-glow': '0 0 20px color-mix(in srgb, var(--accent) 40%, transparent)',
      // 语义色（低饱和柔和版本）
      '--success': '#6BC4A6',
      '--warning': '#F0CB5E',
      '--info': '#8AAAD8',
      '--danger': '#EC9094',
      '--success-light': 'rgba(107,196,166,0.12)',
      '--warning-light': 'rgba(240,203,94,0.12)',
      '--danger-light': 'rgba(236,144,148,0.12)',
      // 锁屏等壁纸上的文字色
      '--text-on-wallpaper': '#fff'
    }
  },
  sakura: {
    id: 'sakura', name: '草莓牛奶', mode: 'light',
    vars: {
      '--bg-primary': '#FFF8F6',
      '--bg-secondary': '#FBEEE8',
      '--bg-card': '#FFFCFB',
      '--bg-overlay': 'rgba(61,43,46,0.28)',
      '--accent': '#F0A5B5',
      '--accent-light': '#FADDE4',
      '--accent-dark': '#E092A4',
      '--text-primary': '#3D2B2E',
      '--text-secondary': '#8E707A',
      '--text-hint': '#D0B8BE',
      '--bubble-user-bg': '#F0A5B5',
      '--bubble-user-text': '#FFFCFB',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#3D2B2E',
      '--shadow-glow': '0 0 20px color-mix(in srgb, var(--accent) 40%, transparent)',
      // 语义色（低饱和柔和版本）
      '--success': '#6BC4A6',
      '--warning': '#F0CB5E',
      '--info': '#8AAAD8',
      '--danger': '#EC9094',
      '--success-light': 'rgba(107,196,166,0.12)',
      '--warning-light': 'rgba(240,203,94,0.12)',
      '--danger-light': 'rgba(236,144,148,0.12)',
      // 锁屏等壁纸上的文字色
      '--text-on-wallpaper': '#fff'
    }
  },
  lavender: {
    id: 'lavender', name: '焦糖拿铁', mode: 'light',
    vars: {
      '--bg-primary': '#FAF8F5',
      '--bg-secondary': '#F2EDE4',
      '--bg-card': '#FCFAF8',
      '--bg-overlay': 'rgba(61,53,48,0.30)',
      '--accent': '#D8BCA0',
      '--accent-light': '#EEDDC8',
      '--accent-dark': '#C09A78',
      '--text-primary': '#3D3530',
      '--text-secondary': '#8A7C68',
      '--text-hint': '#C8B8A0',
      '--bubble-user-bg': '#D8BCA0',
      '--bubble-user-text': '#FFFCFB',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#3D3530',
      '--shadow-glow': '0 0 20px color-mix(in srgb, var(--accent) 40%, transparent)',
      // 语义色（低饱和柔和版本）
      '--success': '#6BC4A6',
      '--warning': '#F0CB5E',
      '--info': '#8AAAD8',
      '--danger': '#EC9094',
      '--success-light': 'rgba(107,196,166,0.12)',
      '--warning-light': 'rgba(240,203,94,0.12)',
      '--danger-light': 'rgba(236,144,148,0.12)',
      // 锁屏等壁纸上的文字色
      '--text-on-wallpaper': '#fff'
    }
  },
  skyDark: {
    id: 'skyDark', name: '夜海蓝', mode: 'dark',
    vars: {
      '--bg-primary': '#1A1E26',
      '--bg-secondary': '#222834',
      '--bg-card': '#232834',
      '--bg-overlay': 'rgba(10,14,20,0.55)',
      '--accent': '#9CD6EC',
      '--accent-light': '#2E3848',
      '--accent-dark': '#7AB8D0',
      '--text-primary': '#E8E4E8',
      '--text-secondary': '#A0B0BC',
      '--text-hint': '#6A7888',
      '--bubble-user-bg': '#7AB8D0',
      '--bubble-user-text': '#F5F0F5',
      '--bubble-ai-bg': '#2E3848',
      '--bubble-ai-text': '#E8E4E8',
      '--shadow-glow': '0 0 20px color-mix(in srgb, var(--accent) 40%, transparent)',
      // 暗色主题阴影：用深色系而非浅色 accent，确保卡片有层次感
      '--shadow-sm': '0 2px 12px color-mix(in srgb, black 20%, transparent)',
      '--shadow-md': '0 4px 16px color-mix(in srgb, black 25%, transparent)',
      '--shadow-lg': '0 8px 28px color-mix(in srgb, black 30%, transparent)',
      '--shadow-soft': '0 2px 12px color-mix(in srgb, black 22%, transparent)',
      '--shadow-card': '0 4px 20px color-mix(in srgb, black 28%, transparent)',
      '--shadow-float': '0 8px 32px color-mix(in srgb, black 32%, transparent)',
      '--shadow-neu-out': '0 4px 12px color-mix(in srgb, black 22%, transparent), 0 -2px 8px color-mix(in srgb, black 10%, transparent)',
      // 语义色（暗色提亮 +10% lightness）
      '--success': '#7FC8B3',
      '--warning': '#F8D277',
      '--info': '#A1BDE2',
      '--danger': '#F0B2B5',
      '--success-light': 'rgba(127,200,179,0.20)',
      '--warning-light': 'rgba(248,210,119,0.20)',
      '--danger-light': 'rgba(240,178,181,0.20)',
      // 锁屏等壁纸上的文字色
      '--text-on-wallpaper': 'rgba(255,255,255,0.92)'
    }
  },
  sakuraDark: {
    id: 'sakuraDark', name: '夜莓粉', mode: 'dark',
    vars: {
      '--bg-primary': '#221A20',
      '--bg-secondary': '#2C2228',
      '--bg-card': '#2C2320',
      '--bg-overlay': 'rgba(10,8,10,0.55)',
      '--accent': '#F5B5C2',
      '--accent-light': 'rgba(245,165,176,0.18)',
      '--accent-dark': '#E07C90',
      '--text-primary': '#F0E4E8',
      '--text-secondary': '#B8A0A8',
      '--text-hint': '#7A626A',
      '--bubble-user-bg': '#E07C90',
      '--bubble-user-text': '#F5F0F5',
      '--bubble-ai-bg': '#3A2C32',
      '--bubble-ai-text': '#F0E4E8',
      '--shadow-glow': '0 0 20px color-mix(in srgb, var(--accent) 40%, transparent)',
      // 暗色主题阴影：用深色系而非浅色 accent，确保卡片有层次感
      '--shadow-sm': '0 2px 12px color-mix(in srgb, black 20%, transparent)',
      '--shadow-md': '0 4px 16px color-mix(in srgb, black 25%, transparent)',
      '--shadow-lg': '0 8px 28px color-mix(in srgb, black 30%, transparent)',
      '--shadow-soft': '0 2px 12px color-mix(in srgb, black 22%, transparent)',
      '--shadow-card': '0 4px 20px color-mix(in srgb, black 28%, transparent)',
      '--shadow-float': '0 8px 32px color-mix(in srgb, black 32%, transparent)',
      '--shadow-neu-out': '0 4px 12px color-mix(in srgb, black 22%, transparent), 0 -2px 8px color-mix(in srgb, black 10%, transparent)',
      // 语义色（暗色提亮 +10% lightness）
      '--success': '#7FC8B3',
      '--warning': '#F8D277',
      '--info': '#A1BDE2',
      '--danger': '#F0B2B5',
      '--success-light': 'rgba(127,200,179,0.20)',
      '--warning-light': 'rgba(248,210,119,0.20)',
      '--danger-light': 'rgba(240,178,181,0.20)',
      // 锁屏等壁纸上的文字色
      '--text-on-wallpaper': 'rgba(255,255,255,0.92)'
    }
  },
  lavenderDark: {
    id: 'lavenderDark', name: '夜焦糖', mode: 'dark',
    vars: {
      '--bg-primary': '#221C14',
      '--bg-secondary': '#2A2218',
      '--bg-card': '#2C2418',
      '--bg-overlay': 'rgba(10,8,6,0.55)',
      '--accent': '#E0B888',
      '--accent-light': '#382C20',
      '--accent-dark': '#B88E58',
      '--text-primary': '#ECE4D4',
      '--text-secondary': '#B8A888',
      '--text-hint': '#806E50',
      '--bubble-user-bg': '#B88E58',
      '--bubble-user-text': '#F5F0F5',
      '--bubble-ai-bg': '#3A2E20',
      '--bubble-ai-text': '#ECE4D4',
      '--shadow-glow': '0 0 20px color-mix(in srgb, var(--accent) 40%, transparent)',
      // 暗色主题阴影：用深色系而非浅色 accent，确保卡片有层次感
      '--shadow-sm': '0 2px 12px color-mix(in srgb, black 20%, transparent)',
      '--shadow-md': '0 4px 16px color-mix(in srgb, black 25%, transparent)',
      '--shadow-lg': '0 8px 28px color-mix(in srgb, black 30%, transparent)',
      '--shadow-soft': '0 2px 12px color-mix(in srgb, black 22%, transparent)',
      '--shadow-card': '0 4px 20px color-mix(in srgb, black 28%, transparent)',
      '--shadow-float': '0 8px 32px color-mix(in srgb, black 32%, transparent)',
      '--shadow-neu-out': '0 4px 12px color-mix(in srgb, black 22%, transparent), 0 -2px 8px color-mix(in srgb, black 10%, transparent)',
      // 语义色（暗色提亮 +10% lightness）
      '--success': '#7FC8B3',
      '--warning': '#F8D277',
      '--info': '#A1BDE2',
      '--danger': '#F0B2B5',
      '--success-light': 'rgba(127,200,179,0.20)',
      '--warning-light': 'rgba(248,210,119,0.20)',
      '--danger-light': 'rgba(240,178,181,0.20)',
      // 锁屏等壁纸上的文字色
      '--text-on-wallpaper': 'rgba(255,255,255,0.92)'
    }
  }
};

// 全局共享变量（与主题无关，固定结构）
// 阴影均使用 color-mix(in srgb, var(--accent) X%, transparent)，自动跟随各主题主色系，
// 杜绝纯灰 rgba(0,0,0,x) 阴影；动效统一使用 spring 缓动 cubic-bezier(0.34, 1.56, 0.64, 1)。
const SHARED_VARS = {
  '--font-main': "'HarmonyOS Sans SC', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif",
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
  '--radius-sm': '10px',
  '--radius-md': '16px',
  '--radius-lg': '20px',
  '--radius-xl': '28px',
  '--radius-full': '999px',
  '--radius-icon': '18px',
  '--radius-card': '24px',
  '--radius-sheet': '28px',
  '--radius-dock': '32px',
  '--bubble-radius': '20px',
  '--bubble-radius-tail': '6px',
  // 同色系柔和阴影（替代原 rgba(0,0,0,x) 灰色阴影）
  '--shadow-sm': '0 2px 12px color-mix(in srgb, var(--accent) 6%, transparent)',
  '--shadow-md': '0 4px 16px color-mix(in srgb, var(--accent) 8%, transparent)',
  '--shadow-lg': '0 8px 28px color-mix(in srgb, var(--accent) 12%, transparent)',
  // 新增：层次化同色系阴影
  '--shadow-soft': '0 2px 12px color-mix(in srgb, var(--accent) 8%, transparent)',
  '--shadow-card': '0 4px 20px color-mix(in srgb, var(--accent) 10%, transparent)',
  '--shadow-float': '0 8px 32px color-mix(in srgb, var(--accent) 14%, transparent)',
  // neumorphism 凸起阴影（亮面 + 暗面双向）；凹入阴影 --shadow-neu-in 已废弃移除（全代码库无引用）
  '--shadow-neu-out': '0 4px 12px color-mix(in srgb, var(--accent) 8%, transparent), 0 -2px 8px color-mix(in srgb, var(--accent) 4%, transparent)',
  '--glass-blur': '14px',
  '--glass-blur-strong': '20px',
  '--wallpaper-soft': '0.10',
  '--press-scale': '0.97',
  // 修复性能反模式：避免 transition: all，显式列出常用属性；
  // 全部使用 spring 缓动 + 0.25s（200-300ms 区间），禁止 linear / ease。
  '--motion': 'transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)',
  '--motion-spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  '--motion-fast': '120ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  '--motion-slow': '400ms cubic-bezier(0.34, 1.56, 0.64, 1)',
  // 字号补充
  '--font-size-display': '28px',
  '--font-size-caption': '11px',
  // 层级体系
  '--z-base': '1',
  '--z-dock': '50',
  '--z-sheet': '200',
  '--z-lock': '9999',
  '--z-boot': '10000',
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
    document.documentElement.style.setProperty('--font-main', "'PopoCustom', 'HarmonyOS Sans SC', 'PingFang SC', 'Noto Sans SC', system-ui, sans-serif");
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
