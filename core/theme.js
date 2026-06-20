const THEME_STORAGE_KEY = "ai_phone_theme";
const CUSTOM_THEME_STORAGE_KEY = "ai_phone_custom_theme";

export const THEME_VARIABLES = [
  "--bg-primary",
  "--bg-secondary",
  "--bg-card",
  "--accent",
  "--accent-light",
  "--text-primary",
  "--text-secondary",
  "--bubble-user-bg",
  "--bubble-user-text",
  "--bubble-ai-bg",
  "--bubble-ai-text",
  "--border-radius-bubble",
  "--border-radius-card",
  "--font-main",
  "--shadow"
];

export const THEMES = {
  cream: {
    name: "奶油白",
    description: "米白背景，柔和灰边框，淡橙强调",
    variables: {
      "--bg-primary": "#FAF7F0",
      "--bg-secondary": "#F0E7DA",
      "--bg-card": "#FFFFFF",
      "--accent": "#F2A65A",
      "--accent-light": "#FFE2BD",
      "--text-primary": "#222222",
      "--text-secondary": "#888888",
      "--bubble-user-bg": "#F2A65A",
      "--bubble-user-text": "#FFFFFF",
      "--bubble-ai-bg": "#FFFFFF",
      "--bubble-ai-text": "#222222",
      "--border-radius-bubble": "18px",
      "--border-radius-card": "16px",
      "--font-main": "'PingFang SC', 'Microsoft YaHei', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      "--shadow": "0 2px 12px rgba(0, 0, 0, 0.08)"
    }
  },

  sakura: {
    name: "樱花粉",
    description: "粉白背景，玫瑰粉强调，气泡粉系",
    variables: {
      "--bg-primary": "#FFF5F8",
      "--bg-secondary": "#FFE7EF",
      "--bg-card": "#FFFFFF",
      "--accent": "#FF8FB1",
      "--accent-light": "#FFD6E4",
      "--text-primary": "#2A2025",
      "--text-secondary": "#9A7B86",
      "--bubble-user-bg": "#FF8FB1",
      "--bubble-user-text": "#FFFFFF",
      "--bubble-ai-bg": "#FFFFFF",
      "--bubble-ai-text": "#2A2025",
      "--border-radius-bubble": "20px",
      "--border-radius-card": "18px",
      "--font-main": "'PingFang SC', 'Microsoft YaHei', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      "--shadow": "0 2px 14px rgba(255, 143, 177, 0.18)"
    }
  },

  sky: {
    name: "天空蓝",
    description: "浅蓝背景，深蓝强调，清爽感",
    variables: {
      "--bg-primary": "#F2FAFF",
      "--bg-secondary": "#DDF0FF",
      "--bg-card": "#FFFFFF",
      "--accent": "#5AA9E6",
      "--accent-light": "#CDEBFF",
      "--text-primary": "#182433",
      "--text-secondary": "#6F8294",
      "--bubble-user-bg": "#5AA9E6",
      "--bubble-user-text": "#FFFFFF",
      "--bubble-ai-bg": "#FFFFFF",
      "--bubble-ai-text": "#182433",
      "--border-radius-bubble": "18px",
      "--border-radius-card": "16px",
      "--font-main": "'PingFang SC', 'Microsoft YaHei', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      "--shadow": "0 2px 12px rgba(90, 169, 230, 0.16)"
    }
  },

  night: {
    name: "夜间模式",
    description: "深灰黑背景，浅色文字，低对比护眼",
    variables: {
      "--bg-primary": "#15161A",
      "--bg-secondary": "#20222A",
      "--bg-card": "#262933",
      "--accent": "#8B9CFF",
      "--accent-light": "#353A66",
      "--text-primary": "#F1F1F3",
      "--text-secondary": "#A4A7B2",
      "--bubble-user-bg": "#8B9CFF",
      "--bubble-user-text": "#FFFFFF",
      "--bubble-ai-bg": "#2F323D",
      "--bubble-ai-text": "#F1F1F3",
      "--border-radius-bubble": "18px",
      "--border-radius-card": "16px",
      "--font-main": "'PingFang SC', 'Microsoft YaHei', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      "--shadow": "0 2px 14px rgba(0, 0, 0, 0.32)"
    }
  }
};

function safeJsonParse(value, fallback) {
  try {
    if (!value) return fallback;
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function getRoot() {
  return document.documentElement;
}

function setCssVariable(name, value) {
  if (!name || typeof name !== "string") return;
  if (value === undefined || value === null) return;
  getRoot().style.setProperty(name, String(value));
}

export function applyThemeVariables(variables = {}) {
  Object.entries(variables).forEach(([name, value]) => {
    setCssVariable(name, value);
  });
}

export function getTheme(themeId) {
  return THEMES[themeId] || THEMES.cream;
}

export function getThemeList() {
  return Object.entries(THEMES).map(([id, theme]) => ({
    id,
    name: theme.name,
    description: theme.description,
    variables: { ...theme.variables }
  }));
}

export function applyTheme(themeId = "cream", options = {}) {
  const theme = getTheme(themeId);
  applyThemeVariables(theme.variables);

  if (options.save !== false) {
    localStorage.setItem(THEME_STORAGE_KEY, themeId);
  }

  return {
    id: themeId,
    ...theme,
    variables: { ...theme.variables }
  };
}

export function getCurrentThemeId() {
  return localStorage.getItem(THEME_STORAGE_KEY) || "cream";
}

export function initTheme() {
  const savedThemeId = getCurrentThemeId();

  if (savedThemeId === "custom") {
    const customTheme = getCustomTheme();

    if (customTheme && Object.keys(customTheme).length > 0) {
      applyThemeVariables(customTheme);
      localStorage.setItem(THEME_STORAGE_KEY, "custom");
      return {
        id: "custom",
        name: "自定义主题",
        description: "用户手动设置的主题",
        variables: customTheme
      };
    }

    return applyTheme("cream");
  }

  return applyTheme(savedThemeId, { save: false });
}

export function saveCustomTheme(variables = {}) {
  const cleanedVariables = {};

  THEME_VARIABLES.forEach((name) => {
    if (Object.prototype.hasOwnProperty.call(variables, name)) {
      cleanedVariables[name] = String(variables[name]);
    }
  });

  localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(cleanedVariables));
  localStorage.setItem(THEME_STORAGE_KEY, "custom");
  applyThemeVariables(cleanedVariables);

  return cleanedVariables;
}

export function getCustomTheme() {
  return safeJsonParse(localStorage.getItem(CUSTOM_THEME_STORAGE_KEY), {});
}

export function resetCustomTheme() {
  localStorage.removeItem(CUSTOM_THEME_STORAGE_KEY);
  return applyTheme("cream");
}

export function getActiveThemeVariables() {
  const computedStyle = getComputedStyle(getRoot());
  const result = {};

  THEME_VARIABLES.forEach((name) => {
    result[name] = computedStyle.getPropertyValue(name).trim();
  });

  return result;
}

export function updateThemeVariable(name, value, options = {}) {
  if (!THEME_VARIABLES.includes(name)) {
    throw new Error(`不允许修改未知主题变量：${name}`);
  }

  setCssVariable(name, value);

  if (options.save !== false) {
    const currentCustomTheme = getCustomTheme();
    currentCustomTheme[name] = String(value);
    saveCustomTheme(currentCustomTheme);
  }

  return {
    name,
    value: String(value)
  };
}

export function buildThemeEditorData() {
  const activeVariables = getActiveThemeVariables();

  return THEME_VARIABLES.map((name) => ({
    name,
    value: activeVariables[name] || "",
    label: getThemeVariableLabel(name)
  }));
}

export function getThemeVariableLabel(name) {
  const labels = {
    "--bg-primary": "主背景色",
    "--bg-secondary": "次背景色",
    "--bg-card": "卡片背景色",
    "--accent": "强调色",
    "--accent-light": "浅强调色",
    "--text-primary": "主文字色",
    "--text-secondary": "次文字色",
    "--bubble-user-bg": "用户气泡背景",
    "--bubble-user-text": "用户气泡文字",
    "--bubble-ai-bg": "AI 气泡背景",
    "--bubble-ai-text": "AI 气泡文字",
    "--border-radius-bubble": "聊天气泡圆角",
    "--border-radius-card": "卡片圆角",
    "--font-main": "主字体",
    "--shadow": "阴影"
  };

  return labels[name] || name;
}

export function createThemePreviewElement(themeId, onSelect) {
  const theme = getTheme(themeId);
  const button = document.createElement("button");
  const activeThemeId = getCurrentThemeId();

  button.type = "button";
  button.className = "theme-preview";
  button.dataset.themeId = themeId;

  if (activeThemeId === themeId) {
    button.classList.add("active");
  }

  const name = document.createElement("div");
  name.className = "theme-preview-name";
  name.textContent = theme.name;

  const description = document.createElement("div");
  description.className = "settings-row-desc";
  description.textContent = theme.description;

  const colors = document.createElement("div");
  colors.className = "theme-preview-colors";

  const colorKeys = [
    "--bg-primary",
    "--bg-secondary",
    "--accent",
    "--bubble-user-bg"
  ];

  colorKeys.forEach((key) => {
    const dot = document.createElement("span");
    dot.className = "theme-color-dot";
    dot.style.background = theme.variables[key];
    colors.appendChild(dot);
  });

  button.appendChild(name);
  button.appendChild(description);
  button.appendChild(colors);

  button.addEventListener("click", () => {
    applyTheme(themeId);

    document.querySelectorAll(".theme-preview.active").forEach((element) => {
      element.classList.remove("active");
    });

    button.classList.add("active");

    if (typeof onSelect === "function") {
      onSelect(themeId, theme);
    }
  });

  return button;
}

export function renderThemePreviewList(container, onSelect) {
  if (!container) return;

  container.innerHTML = "";
  container.classList.add("theme-preview-list");

  Object.keys(THEMES).forEach((themeId) => {
    container.appendChild(createThemePreviewElement(themeId, onSelect));
  });
}

export function exportThemeData() {
  return {
    currentThemeId: getCurrentThemeId(),
    customTheme: getCustomTheme()
  };
}

export function importThemeData(data = {}) {
  if (data.customTheme && typeof data.customTheme === "object") {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(data.customTheme));
  }

  if (data.currentThemeId) {
    if (data.currentThemeId === "custom") {
      const customTheme = getCustomTheme();
      applyThemeVariables(customTheme);
      localStorage.setItem(THEME_STORAGE_KEY, "custom");
      return;
    }

    applyTheme(data.currentThemeId);
  }
}

if (typeof window !== "undefined") {
  window.AIPhoneTheme = {
    THEMES,
    THEME_VARIABLES,
    initTheme,
    applyTheme,
    getTheme,
    getThemeList,
    getCurrentThemeId,
    saveCustomTheme,
    getCustomTheme,
    resetCustomTheme,
    getActiveThemeVariables,
    updateThemeVariable,
    buildThemeEditorData,
    renderThemePreviewList,
    exportThemeData,
    importThemeData
  };

  document.addEventListener("DOMContentLoaded", () => {
    initTheme();
  });
}
