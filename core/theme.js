import {
  DEFAULT_THEME_VARIABLES,
  readState,
  writeState,
  updateState,
  saveAppTheme,
  downloadText,
} from "./storage.js";

export const THEME_STORAGE_VERSION = "1.0";

export const THEME_VARIABLE_KEYS = Object.keys(DEFAULT_THEME_VARIABLES);

export const PRESET_THEMES = [
  {
    id: "cream",
    name: "奶油白",
    version: THEME_STORAGE_VERSION,
    variables: {
      ...DEFAULT_THEME_VARIABLES,
      "--bg-primary": "#fbf7f0",
      "--bg-secondary": "#f4eee4",
      "--bg-card": "rgba(255,255,255,0.78)",
      "--bg-soft": "rgba(255,248,238,0.72)",
      "--bg-glass": "rgba(255,255,255,0.54)",
      "--accent": "#d99a86",
      "--accent-light": "#f6ddd3",
      "--accent-dark": "#b97866",
      "--text-primary": "#2b2520",
      "--text-secondary": "#7f746a",
      "--text-hint": "#bdb3a9",
      "--bubble-user-bg": "#d99a86",
      "--bubble-ai-bg": "rgba(255,255,255,0.82)",
    },
  },
  {
    id: "sakura",
    name: "樱花粉",
    version: THEME_STORAGE_VERSION,
    variables: {
      ...DEFAULT_THEME_VARIABLES,
      "--bg-primary": "#fff6f4",
      "--bg-secondary": "#f8ebe8",
      "--bg-card": "rgba(255,255,255,0.8)",
      "--bg-soft": "rgba(255,241,238,0.74)",
      "--bg-glass": "rgba(255,255,255,0.56)",
      "--accent": "#d98f8b",
      "--accent-light": "#f8d9d6",
      "--accent-dark": "#b86f6b",
      "--text-primary": "#302321",
      "--text-secondary": "#846f6b",
      "--text-hint": "#c5aaa5",
      "--bubble-user-bg": "#d98f8b",
      "--bubble-ai-bg": "rgba(255,255,255,0.84)",
    },
  },
  {
    id: "sky",
    name: "天空蓝",
    version: THEME_STORAGE_VERSION,
    variables: {
      ...DEFAULT_THEME_VARIABLES,
      "--bg-primary": "#f6f8f6",
      "--bg-secondary": "#ecefeb",
      "--bg-card": "rgba(255,255,255,0.8)",
      "--bg-soft": "rgba(246,248,246,0.74)",
      "--bg-glass": "rgba(255,255,255,0.56)",
      "--accent": "#c59b7d",
      "--accent-light": "#efded0",
      "--accent-dark": "#9f7659",
      "--text-primary": "#252925",
      "--text-secondary": "#72796f",
      "--text-hint": "#b5bbb1",
      "--bubble-user-bg": "#c59b7d",
      "--bubble-ai-bg": "rgba(255,255,255,0.84)",
    },
  },
  {
    id: "night",
    name: "夜间",
    version: THEME_STORAGE_VERSION,
    variables: {
      ...DEFAULT_THEME_VARIABLES,
      "--bg-primary": "#191613",
      "--bg-secondary": "#211d19",
      "--bg-card": "rgba(43,38,33,0.82)",
      "--bg-soft": "rgba(49,43,38,0.72)",
      "--bg-overlay": "rgba(0,0,0,0.44)",
      "--bg-glass": "rgba(43,38,33,0.56)",
      "--accent": "#d59b88",
      "--accent-light": "#4a342e",
      "--accent-dark": "#efc2b5",
      "--text-primary": "#f7eee5",
      "--text-secondary": "#b9aaa0",
      "--text-hint": "#7f7168",
      "--text-inverse": "#fffdf9",
      "--bubble-user-bg": "#d59b88",
      "--bubble-user-text": "#fffdf9",
      "--bubble-ai-bg": "rgba(48,42,37,0.86)",
      "--bubble-ai-text": "#f7eee5",
    },
  },
];

const themeListeners = new Set();

export function initTheme() {
  const state = readState();
  const theme = state.theme?.variables ? state.theme : PRESET_THEMES[0];
  applyThemeVariables(theme.variables);
  setDocumentTheme(state.settings?.activeThemeId || theme.id || "cream");
  return theme;
}

export function getPresetThemes() {
  return PRESET_THEMES.map((theme) => ({
    ...theme,
    variables: { ...theme.variables },
  }));
}

export function getCurrentTheme() {
  const state = readState();
  return {
    name: state.theme?.name || "奶油白",
    version: state.theme?.version || THEME_STORAGE_VERSION,
    variables: {
      ...DEFAULT_THEME_VARIABLES,
      ...(state.theme?.variables || {}),
    },
  };
}

export function setPresetTheme(themeId) {
  const preset = PRESET_THEMES.find((theme) => theme.id === themeId) || PRESET_THEMES[0];
  const theme = {
    name: preset.name,
    version: THEME_STORAGE_VERSION,
    variables: { ...preset.variables },
  };

  updateState((state) => {
    state.settings.activeThemeId = preset.id;
    state.theme = theme;
    return state;
  });

  setDocumentTheme(preset.id);
  applyThemeVariables(theme.variables);
  notifyThemeChange(theme);
  return theme;
}

export function previewThemeVariables(variables = {}) {
  const current = getCurrentTheme();
  const nextVariables = sanitizeThemeVariables({
    ...current.variables,
    ...variables,
  });
  applyThemeVariables(nextVariables);
  notifyThemeChange({
    ...current,
    variables: nextVariables,
    preview: true,
  });
  return nextVariables;
}

export function saveThemeVariables(variables = {}, name = "自定义主题") {
  const current = getCurrentTheme();
  const theme = {
    name,
    version: THEME_STORAGE_VERSION,
    variables: sanitizeThemeVariables({
      ...current.variables,
      ...variables,
    }),
  };

  updateState((state) => {
    state.settings.activeThemeId = "custom";
    state.theme = theme;
    return state;
  });

  setDocumentTheme("custom");
  applyThemeVariables(theme.variables);
  notifyThemeChange(theme);
  return theme;
}

export function setThemeVariable(key, value) {
  if (!THEME_VARIABLE_KEYS.includes(key)) return getCurrentTheme();
  return saveThemeVariables({ [key]: value }, getCurrentTheme().name || "自定义主题");
}

export function importTheme(jsonText) {
  const parsed = JSON.parse(jsonText);
  const theme = normalizeTheme(parsed);
  updateState((state) => {
    state.settings.activeThemeId = "imported";
    state.theme = theme;
    return state;
  });

  setDocumentTheme("imported");
  applyThemeVariables(theme.variables);
  notifyThemeChange(theme);
  return theme;
}

export function exportTheme(filename = "theme.json") {
  const theme = getCurrentTheme();
  downloadText(filename, JSON.stringify(theme, null, 2));
  return theme;
}

export function getThemeExportObject() {
  return getCurrentTheme();
}

export function normalizeTheme(theme) {
  const variables = sanitizeThemeVariables(theme?.variables || theme || {});
  return {
    name: theme?.name || "导入主题",
    version: theme?.version || THEME_STORAGE_VERSION,
    variables: {
      ...DEFAULT_THEME_VARIABLES,
      ...variables,
    },
  };
}

export function applyThemeVariables(variables = {}) {
  const root = document.documentElement;
  const sanitized = sanitizeThemeVariables(variables);

  Object.entries(sanitized).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });

  return sanitized;
}

export function sanitizeThemeVariables(variables = {}) {
  return Object.entries(variables).reduce((output, [key, value]) => {
    if (THEME_VARIABLE_KEYS.includes(key) && typeof value === "string") {
      output[key] = value.trim();
    }
    return output;
  }, {});
}

export function setDocumentTheme(themeId) {
  document.documentElement.dataset.theme = themeId === "night" ? "night" : "light";
  document.documentElement.dataset.themeId = themeId;
}

export function subscribeTheme(listener) {
  themeListeners.add(listener);
  return () => themeListeners.delete(listener);
}

function notifyThemeChange(theme) {
  themeListeners.forEach((listener) => listener({ ...theme, variables: { ...theme.variables } }));
}

export function getAppTheme(appId) {
  const state = readState();
  return {
    appId,
    backgroundImage: "",
    accent: "",
    radius: 24,
    fontSize: 15,
    variables: {},
    ...(state.appThemes?.[appId] || {}),
  };
}

export function applyAppTheme(appId, target = document.documentElement) {
  const appTheme = getAppTheme(appId);
  const styleTarget = target instanceof HTMLElement ? target : document.documentElement;

  styleTarget.style.setProperty("--app-bg-image", appTheme.backgroundImage ? `url("${appTheme.backgroundImage}")` : "none");
  styleTarget.style.setProperty("--app-accent", appTheme.accent || "var(--accent)");
  styleTarget.style.setProperty("--app-radius", `${Number(appTheme.radius) || 24}px`);
  styleTarget.style.setProperty("--app-font-size", `${Number(appTheme.fontSize) || 15}px`);

  Object.entries(appTheme.variables || {}).forEach(([key, value]) => {
    if (typeof value === "string") styleTarget.style.setProperty(key, value);
  });

  return appTheme;
}

export function clearAppTheme(target = document.documentElement) {
  const styleTarget = target instanceof HTMLElement ? target : document.documentElement;
  styleTarget.style.setProperty("--app-bg-image", "none");
  styleTarget.style.setProperty("--app-accent", "var(--accent)");
  styleTarget.style.setProperty("--app-radius", "var(--radius-lg)");
  styleTarget.style.setProperty("--app-font-size", "var(--font-size-base)");
}

export function updateAppTheme(appId, patch) {
  const current = getAppTheme(appId);
  const next = {
    ...current,
    ...patch,
    variables: {
      ...(current.variables || {}),
      ...(patch.variables || {}),
    },
  };

  saveAppTheme(appId, next);
  return next;
}

export function setAppThemeValue(appId, key, value) {
  if (["backgroundImage", "accent", "radius", "fontSize"].includes(key)) {
    return updateAppTheme(appId, { [key]: value });
  }

  return updateAppTheme(appId, {
    variables: {
      [key]: value,
    },
  });
}

export function importAppTheme(appId, jsonText) {
  const parsed = JSON.parse(jsonText);
  const theme = {
    appId,
    backgroundImage: parsed.backgroundImage || "",
    accent: parsed.accent || "",
    radius: Number(parsed.radius) || 24,
    fontSize: Number(parsed.fontSize) || 15,
    variables: sanitizeThemeVariables(parsed.variables || {}),
  };

  saveAppTheme(appId, theme);
  return theme;
}

export function exportAppTheme(appId, filename = `${appId}-theme.json`) {
  const theme = getAppTheme(appId);
  const output = {
    name: `${appId} 应用主题`,
    version: THEME_STORAGE_VERSION,
    appId,
    backgroundImage: theme.backgroundImage,
    accent: theme.accent,
    radius: theme.radius,
    fontSize: theme.fontSize,
    variables: theme.variables || {},
  };

  downloadText(filename, JSON.stringify(output, null, 2));
  return output;
}

export function getReadableThemeSummary(theme = getCurrentTheme()) {
  return {
    name: theme.name,
    accent: theme.variables["--accent"],
    background: theme.variables["--bg-primary"],
    text: theme.variables["--text-primary"],
    card: theme.variables["--bg-card"],
  };
}

export function restoreThemeFromStorage() {
  return initTheme();
}

export function resetThemeToDefault() {
  return setPresetTheme("cream");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initTheme, { once: true });
} else {
  initTheme();
}

/* 待后续文件对齐：settings.js 使用 PRESET_THEMES、setPresetTheme、importTheme、exportTheme、updateAppTheme。 */
