import {
  STORAGE_KEYS,
  readLocal,
  writeLocal,
  updateSettings,
  clone
} from './storage.js';

export const THEME_VERSION = '1.0';

export const THEME_VARIABLES = [
  '--bg-primary',
  '--bg-secondary',
  '--bg-card',
  '--bg-soft',
  '--bg-field',
  '--bg-code',
  '--bg-overlay',
  '--accent',
  '--accent-light',
  '--accent-dark',
  '--danger',
  '--warning',
  '--text-primary',
  '--text-secondary',
  '--text-hint',
  '--text-inverse',
  '--text-code',
  '--bubble-user-bg',
  '--bubble-user-text',
  '--bubble-ai-bg',
  '--bubble-ai-text',
  '--bubble-radius',
  '--bubble-radius-tail',
  '--font-main',
  '--font-mono',
  '--font-size-mini',
  '--font-size-small',
  '--font-size-base',
  '--font-size-title',
  '--font-size-large',
  '--font-size-hero',
  '--font-weight-normal',
  '--font-weight-medium',
  '--font-weight-semibold',
  '--line-height-base',
  '--line-height-tight',
  '--spacing-xxs',
  '--spacing-xs',
  '--spacing-sm',
  '--spacing-md',
  '--spacing-lg',
  '--spacing-xl',
  '--spacing-xxl',
  '--radius-xs',
  '--radius-sm',
  '--radius-md',
  '--radius-lg',
  '--radius-xl',
  '--radius-round',
  '--shadow-xs',
  '--shadow-sm',
  '--shadow-md',
  '--shadow-lg',
  '--duration-fast',
  '--duration-normal',
  '--duration-slow',
  '--ease-default',
  '--status-height',
  '--dock-height',
  '--nav-height',
  '--input-height',
  '--desktop-indicator-height',
  '--app-icon-size',
  '--avatar-xs',
  '--avatar-sm',
  '--avatar-md',
  '--avatar-lg',
  '--avatar-xl',
  '--button-height',
  '--field-min-height',
  '--panel-max-width',
  '--z-base',
  '--z-floating',
  '--z-panel',
  '--z-modal',
  '--z-toast'
];

export const PRESET_THEMES = [
  {
    name: '奶油白',
    version: THEME_VERSION,
    variables: {
      '--bg-primary': '#FAFAFA',
      '--bg-secondary': '#F3F3F3',
      '--bg-card': '#FFFFFF',
      '--bg-soft': '#F7F1EE',
      '--bg-field': '#F5F2F0',
      '--bg-code': '#24211F',
      '--bg-overlay': 'rgba(0,0,0,0.28)',
      '--accent': '#D9A58F',
      '--accent-light': '#F6E3DA',
      '--accent-dark': '#B77F68',
      '--danger': '#D85C5C',
      '--warning': '#D69A4E',
      '--text-primary': '#1A1A1A',
      '--text-secondary': '#888888',
      '--text-hint': '#CCCCCC',
      '--text-inverse': '#FFFFFF',
      '--text-code': '#F7F1EE',
      '--bubble-user-bg': '#D9A58F',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#1A1A1A'
    }
  },
  {
    name: '樱花粉',
    version: THEME_VERSION,
    variables: {
      '--bg-primary': '#FAF7F7',
      '--bg-secondary': '#F4ECEE',
      '--bg-card': '#FFFFFF',
      '--bg-soft': '#F9EEF1',
      '--bg-field': '#F7EEF0',
      '--bg-code': '#2A2224',
      '--bg-overlay': 'rgba(0,0,0,0.28)',
      '--accent': '#FFB3C6',
      '--accent-light': '#FFE4EC',
      '--accent-dark': '#E8899A',
      '--danger': '#D85C5C',
      '--warning': '#D69A4E',
      '--text-primary': '#211A1C',
      '--text-secondary': '#927D83',
      '--text-hint': '#D4C4C8',
      '--text-inverse': '#FFFFFF',
      '--text-code': '#FFF7F8',
      '--bubble-user-bg': '#FFB3C6',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#211A1C'
    }
  },
  {
    name: '天空蓝',
    version: THEME_VERSION,
    variables: {
      '--bg-primary': '#F7F9FA',
      '--bg-secondary': '#EEF3F5',
      '--bg-card': '#FFFFFF',
      '--bg-soft': '#EEF5F7',
      '--bg-field': '#EFF4F6',
      '--bg-code': '#202527',
      '--bg-overlay': 'rgba(0,0,0,0.28)',
      '--accent': '#A9C4D2',
      '--accent-light': '#E2EEF3',
      '--accent-dark': '#7FA3B3',
      '--danger': '#D85C5C',
      '--warning': '#D69A4E',
      '--text-primary': '#182023',
      '--text-secondary': '#7D8B91',
      '--text-hint': '#C7D0D4',
      '--text-inverse': '#FFFFFF',
      '--text-code': '#F7FBFC',
      '--bubble-user-bg': '#A9C4D2',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#182023'
    }
  },
  {
    name: '夜间',
    version: THEME_VERSION,
    variables: {
      '--bg-primary': '#1D1A18',
      '--bg-secondary': '#292522',
      '--bg-card': '#25211F',
      '--bg-soft': '#2E2925',
      '--bg-field': '#302B28',
      '--bg-code': '#11100F',
      '--bg-overlay': 'rgba(0,0,0,0.44)',
      '--accent': '#C7907B',
      '--accent-light': '#3B2C27',
      '--accent-dark': '#E1AA92',
      '--danger': '#D86A61',
      '--warning': '#D0A05D',
      '--text-primary': '#F6F0EC',
      '--text-secondary': '#A89D96',
      '--text-hint': '#665D58',
      '--text-inverse': '#FFFFFF',
      '--text-code': '#F6F0EC',
      '--bubble-user-bg': '#C7907B',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#2C2825',
      '--bubble-ai-text': '#F6F0EC'
    }
  }
];

export function getThemePresets() {
  return clone(PRESET_THEMES);
}

export function getPresetTheme(name) {
  return PRESET_THEMES.find((theme) => theme.name === name) || PRESET_THEMES[0];
}

export function getRootElement() {
  return document.documentElement;
}

export function getComputedThemeVariable(name) {
  return getComputedStyle(getRootElement()).getPropertyValue(name).trim();
}

export function getThemeVariable(name) {
  const inlineValue = getRootElement().style.getPropertyValue(name).trim();

  if (inlineValue) {
    return inlineValue;
  }

  return getComputedThemeVariable(name);
}

export function getCurrentThemeVariables() {
  return THEME_VARIABLES.reduce((variables, name) => {
    const value = getThemeVariable(name);

    if (value) {
      variables[name] = value;
    }

    return variables;
  }, {});
}

export function normalizeTheme(theme = {}) {
  const variables = theme.variables && typeof theme.variables === 'object' ? theme.variables : {};

  return {
    name: theme.name || '自定义主题',
    version: theme.version || THEME_VERSION,
    variables: Object.keys(variables).reduce((result, key) => {
      if (key.startsWith('--') && variables[key] !== undefined && variables[key] !== null) {
        result[key] = String(variables[key]);
      }

      return result;
    }, {})
  };
}

export function applyThemeVariables(variables = {}) {
  const root = getRootElement();

  Object.entries(variables).forEach(([name, value]) => {
    if (name.startsWith('--') && value !== undefined && value !== null) {
      root.style.setProperty(name, String(value));
    }
  });

  window.dispatchEvent(new CustomEvent('ai-phone-theme-preview', {
    detail: getCurrentThemeVariables()
  }));
}

export function saveTheme(theme) {
  const normalized = normalizeTheme(theme);
  writeLocal(STORAGE_KEYS.theme, normalized);

  try {
    updateSettings((settings) => {
      settings.themeName = normalized.name;
      return settings;
    });
  } catch {}

  window.dispatchEvent(new CustomEvent('ai-phone-theme-change', {
    detail: clone(normalized)
  }));

  return normalized;
}

export function applyTheme(themeOrName, options = {}) {
  const shouldSave = options.save !== false;
  const source = typeof themeOrName === 'string' ? getPresetTheme(themeOrName) : themeOrName;
  const normalized = normalizeTheme(source);

  applyThemeVariables(normalized.variables);

  if (shouldSave) {
    return saveTheme({
      ...normalized,
      variables: {
        ...getCurrentThemeVariables(),
        ...normalized.variables
      }
    });
  }

  return normalized;
}

export function switchTheme(name) {
  return applyTheme(name, { save: true });
}

export function previewTheme(themeOrVariables) {
  const variables = themeOrVariables && themeOrVariables.variables ? themeOrVariables.variables : themeOrVariables;
  applyThemeVariables(variables || {});
}

export function setThemeVariable(name, value, options = {}) {
  if (!name || !name.startsWith('--')) {
    return null;
  }

  applyThemeVariables({ [name]: value });

  if (options.save !== false) {
    const current = getCurrentTheme();
    current.variables = {
      ...current.variables,
      [name]: String(value)
    };
    saveTheme(current);
    return current;
  }

  return {
    name,
    value
  };
}

export function setThemeVariables(variables = {}, options = {}) {
  applyThemeVariables(variables);

  if (options.save !== false) {
    const current = getCurrentTheme();
    current.variables = {
      ...current.variables,
      ...variables
    };
    saveTheme(current);
    return current;
  }

  return variables;
}

export function getCurrentTheme() {
  const saved = readLocal(STORAGE_KEYS.theme, null);

  if (saved && saved.variables) {
    return normalizeTheme(saved);
  }

  return normalizeTheme({
    ...getPresetTheme('奶油白'),
    variables: {
      ...getCurrentThemeVariables(),
      ...getPresetTheme('奶油白').variables
    }
  });
}

export function restoreTheme() {
  const saved = readLocal(STORAGE_KEYS.theme, null);

  if (saved && saved.variables) {
    return applyTheme(saved, { save: false });
  }

  return applyTheme('奶油白', { save: false });
}

export function initTheme() {
  return restoreTheme();
}

export function importTheme(themeJson) {
  const parsed = typeof themeJson === 'string' ? JSON.parse(themeJson) : themeJson;
  const normalized = normalizeTheme(parsed);

  if (!Object.keys(normalized.variables).length) {
    throw new Error('主题文件没有可用变量');
  }

  return applyTheme(normalized, { save: true });
}

export function exportTheme(name = '') {
  const current = getCurrentTheme();

  return JSON.stringify({
    name: name || current.name || '自定义主题',
    version: THEME_VERSION,
    variables: getCurrentThemeVariables()
  }, null, 2);
}

export function downloadTheme(filename = '') {
  const theme = JSON.parse(exportTheme());
  const blob = new Blob([JSON.stringify(theme, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename || `${theme.name || 'theme'}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function readThemeFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('没有选择主题文件'));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      try {
        resolve(importTheme(reader.result));
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(new Error('主题文件读取失败'));
    reader.readAsText(file);
  });
}

export function resetTheme(name = '奶油白') {
  return switchTheme(name);
}

export function onThemeChange(callback) {
  const handler = (event) => callback(event.detail || getCurrentTheme());
  window.addEventListener('ai-phone-theme-change', handler);

  return () => {
    window.removeEventListener('ai-phone-theme-change', handler);
  };
}

export function onThemePreview(callback) {
  const handler = (event) => callback(event.detail || getCurrentThemeVariables());
  window.addEventListener('ai-phone-theme-preview', handler);

  return () => {
    window.removeEventListener('ai-phone-theme-preview', handler);
  };
}

initTheme();
