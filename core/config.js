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
  desktopLayout:        'desktop_layout',
  dockVisible:          'dock_visible',
  pageIndicator:        'page_indicator',
  searchEntry:          'search_entry',
  controlCenterEntry:   'control_center_entry',
  wallpaper:            STORAGE_KEYS.WALLPAPER,
  lockscreenWallpaper:  STORAGE_KEYS.LOCKSCREEN_WALLPAPER,
  wallpaperSync:        STORAGE_KEYS.WALLPAPER_SYNC,
  lockscreenBlur:       STORAGE_KEYS.LOCKSCREEN_BLUR,
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

export { get, set, getAll, reset, resetAll };