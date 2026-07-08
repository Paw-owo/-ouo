// ============================================
// config.js — 设置统一出口
// 默认值来自 data/default-settings.js
// 合并用户覆盖值，界面层/业务层禁止直接读 localStorage
// ============================================

import DEFAULT_SETTINGS from '../data/default-settings.js';
import { getSetting, setSetting } from './storage.js';
import { STORAGE_KEYS } from './storage-keys.js';

// 键名到 storage key 的映射
const KEY_TO_STORAGE = {
  theme:                STORAGE_KEYS.THEME,
  themeMode:            STORAGE_KEYS.THEME_MODE,
  iconSize:             STORAGE_KEYS.ICON_SIZE_MODE,
  fontSize:             STORAGE_KEYS.FONT_SIZE,
  desktopLayout:        'desktop_layout',
  dockVisible:          'dock_visible',
  pageIndicator:        'page_indicator',
  searchEntry:          'search_entry',
  controlCenterEntry:   'control_center_entry',
  wallpaper:            STORAGE_KEYS.WALLPAPER,
  lockscreenWallpaper:  STORAGE_KEYS.LOCKSCREEN_WALLPAPER,
  wallpaperSync:        STORAGE_KEYS.WALLPAPER_SYNC,
  lockscreenBlur:       STORAGE_KEYS.LOCKSCREEN_BLUR,
  appBg:                STORAGE_KEYS.APP_BG,
  appBgOverrides:       STORAGE_KEYS.APP_BG_OVERRIDES,
  lockEnabled:          STORAGE_KEYS.LOCK_ENABLED,
  lockPassword:         STORAGE_KEYS.LOCK_PASSWORD,
  lockAvatar:           STORAGE_KEYS.LOCK_AVATAR,
  lockMessage:          STORAGE_KEYS.LOCK_MESSAGE,
  lockShowNotifications:'lock_show_notifications',
  notificationsEnabled: STORAGE_KEYS.NOTIFICATIONS_ENABLED,
  bannerEnabled:        STORAGE_KEYS.BANNER_ENABLED,
  notificationCenterEnabled: STORAGE_KEYS.NOTIFICATION_CENTER_ENABLED,
  desktopNoticeStyle:   STORAGE_KEYS.DESKTOP_NOTICE_STYLE,
  doNotDisturb:         STORAGE_KEYS.DO_NOT_DISTURB,
  doNotDisturbStart:    STORAGE_KEYS.DO_NOT_DISTURB_START,
  doNotDisturbEnd:      STORAGE_KEYS.DO_NOT_DISTURB_END,
  lockNotificationStyle:'lock_notification_style',
  streamEnabled:        STORAGE_KEYS.STREAM_ENABLED,
  timeout:              STORAGE_KEYS.TIMEOUT,
  creativity:           STORAGE_KEYS.CREATIVITY,
  apiBaseUrl:           STORAGE_KEYS.API_BASE_URL,
  apiKey:               STORAGE_KEYS.API_KEY,
  apiModel:             STORAGE_KEYS.API_MODEL,
  sensoryEyeEnabled:    STORAGE_KEYS.SENSORY_EYE_ENABLED,
  sensoryEarEnabled:    STORAGE_KEYS.SENSORY_EAR_ENABLED,
  ttsMode:              STORAGE_KEYS.TTS_MODE,
  ttsAutoPlay:          STORAGE_KEYS.TTS_AUTO_PLAY,
  ttsRate:              STORAGE_KEYS.TTS_RATE,
  ttsPitch:             STORAGE_KEYS.TTS_PITCH,
  chainEnabled:         STORAGE_KEYS.CHAIN_ENABLED,
  chainDefaultExpanded: STORAGE_KEYS.CHAIN_DEFAULT_EXPANDED,
  chainShowAppSteps:    STORAGE_KEYS.CHAIN_SHOW_APP_STEPS,
  chainShowMemorySteps: STORAGE_KEYS.CHAIN_SHOW_MEMORY_STEPS,
  chainShowToolSteps:   STORAGE_KEYS.CHAIN_SHOW_TOOL_STEPS,
  chainShowSensorySteps:STORAGE_KEYS.CHAIN_SHOW_SENSORY_STEPS,
  chainAutoCollapse:    STORAGE_KEYS.CHAIN_AUTO_COLLAPSE,
  memoryAutoExtract:    STORAGE_KEYS.MEMORY_AUTO_EXTRACT,
  memoryAiDirectEdit:   STORAGE_KEYS.MEMORY_AI_DIRECT_EDIT,
  memoryAutoCompress:   STORAGE_KEYS.MEMORY_AUTO_COMPRESS,
  memoryAppEvents:      STORAGE_KEYS.MEMORY_APP_EVENTS,
  experimentalMode:     STORAGE_KEYS.EXPERIMENTAL_MODE
};

// 获取单个设置（默认值 + 用户覆盖值）
function get(key) {
  const storageKey = KEY_TO_STORAGE[key];
  const defaultValue = DEFAULT_SETTINGS[key];

  if (storageKey) {
    const userValue = getSetting(storageKey);
    if (userValue !== null && userValue !== undefined) {
      return userValue;
    }
  }

  return defaultValue !== undefined ? defaultValue : null;
}

// 设置单个配置
function set(key, value) {
  const storageKey = KEY_TO_STORAGE[key];
  if (storageKey) {
    setSetting(storageKey, value);
  }
}

// 获取全部配置（合并后的完整对象）
function getAll() {
  const result = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    result[key] = get(key);
  }
  return result;
}

// 重置为默认值
function reset(key) {
  const storageKey = KEY_TO_STORAGE[key];
  if (storageKey) {
    localStorage.removeItem(storageKey);
  }
}

// 重置全部
function resetAll() {
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    reset(key);
  }
}

// ============================================
// API 分组专用出口（单一真实来源 = api_groups）
// ai-client.js 只读 STORAGE_KEYS.API_GROUPS，所以 settings 保存时必须同步写入这里
// 简单键 apiBaseUrl/apiKey/apiModel 只作为 UI 层便捷字段和兼容老数据
// ============================================

// 读取默认分组的 API 配置 { baseURL, apiKey, model }
// 优先从 api_groups 默认分组读；如果没有分组，回退到简单键
// 注意：storage.js 的 getSetting 会自动 JSON.parse，所以这里直接拿到对象/原始值
function getApiGroupConfig() {
  const groups = getSetting(STORAGE_KEYS.API_GROUPS);

  if (groups) {
    let activeGroup = null;
    const g = typeof groups === 'string' ? (() => { try { return JSON.parse(groups); } catch { return null; } })() : groups;
    if (Array.isArray(g)) {
      if (g.length > 0) {
        activeGroup = g.find(x => x.active) || g.find(x => x.id === 'default') || g[0];
      }
    } else if (g && typeof g === 'object') {
      const entries = Object.values(g);
      if (entries.length > 0) {
        activeGroup = entries.find(x => x.active) || entries.find(x => x.id === 'default') || entries[0];
      }
    }
    if (activeGroup && activeGroup.baseURL) {
      const defaultModel = getSetting(STORAGE_KEYS.API_DEFAULT_CHAT_MODEL);
      return {
        baseURL: activeGroup.baseURL,
        apiKey: activeGroup.apiKey || '',
        model: defaultModel || activeGroup.model || ''
      };
    }
  }

  // 回退到简单键（兼容老数据或未初始化分组）
  return {
    baseURL: getSetting(STORAGE_KEYS.API_BASE_URL) || '',
    apiKey: getSetting(STORAGE_KEYS.API_KEY) || '',
    model: getSetting(STORAGE_KEYS.API_MODEL) || getSetting(STORAGE_KEYS.API_DEFAULT_CHAT_MODEL) || ''
  };
}

// 保存 API 配置到默认分组（同步更新 api_groups + 简单键 + default_chat_model）
// 写入结构：[{ id, name, baseURL, apiKey, model, active }]
// 注意：storage.js 的 setSetting 会自动 JSON.stringify，这里直接传对象/原始值
function setApiGroupConfig({ baseURL, apiKey, model }) {
  // 1. 同步简单键（兼容老数据，UI 层便捷读取）
  setSetting(STORAGE_KEYS.API_BASE_URL, baseURL);
  setSetting(STORAGE_KEYS.API_KEY, apiKey);
  setSetting(STORAGE_KEYS.API_MODEL, model);
  setSetting(STORAGE_KEYS.API_DEFAULT_CHAT_MODEL, model);

  // 2. 写入 api_groups 默认分组（ai-client.js 的单一真实来源）
  const raw = getSetting(STORAGE_KEYS.API_GROUPS);
  let groups = [];
  if (raw) {
    const parsed = typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : raw;
    if (Array.isArray(parsed)) groups = parsed;
  }

  const idx = groups.findIndex(g => g.id === 'default');
  const newGroup = {
    id: 'default',
    name: '默认',
    baseURL: baseURL,
    apiKey: apiKey,
    model: model,
    active: true
  };
  if (idx >= 0) {
    groups[idx] = newGroup;
  } else {
    groups.unshift(newGroup);
  }
  // 确保只有一个 active
  groups.forEach((g, i) => { if (i !== (idx >= 0 ? idx : 0)) g.active = false; });

  setSetting(STORAGE_KEYS.API_GROUPS, groups);
}

export { get, set, getAll, reset, resetAll, getApiGroupConfig, setApiGroupConfig };