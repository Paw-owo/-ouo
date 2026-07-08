// ============================================
// storage-keys.js — 所有存储键常量，唯一来源
// 禁止在其他文件中临时起名或硬编码键名
// ============================================

const STORAGE_KEYS = Object.freeze({
  // === 主题与外观 ===
  THEME:              'theme',
  THEME_MODE:         'theme_mode',

  // === 壁纸 ===
  WALLPAPER:          'desktop_wallpaper',
  LOCKSCREEN_WALLPAPER: 'lockscreen_wallpaper',
  WALLPAPER_SYNC:     'wallpaper_sync',
  LOCKSCREEN_BLUR:    'lockscreen_blur',
  APP_BG:             'app_bg',
  APP_BG_OVERRIDES:   'app_bg_overrides',

  // === 桌面 ===
  DESKTOP_ICON_ORDER: 'desktop_icon_order',
  DOCK_ICON_ORDER:    'dock_icon_order',
  DESKTOP_FOLDERS:    'desktop_folders',
  DESKTOP_WIDGETS:    'desktop_widgets',
  ICON_SIZE_MODE:     'icon_size_mode',
  FONT_SIZE:          'font_size',
  DESKTOP_NOTICE_STYLE: 'desktop_notice_style',

  // === 锁屏 ===
  LOCK_ENABLED:       'lock_enabled',
  LOCK_PASSWORD:      'lock_password',
  LOCK_AVATAR:        'lock_avatar',
  LOCK_MESSAGE:       'lock_message',

  // === 通知 ===
  NOTIFICATIONS_ENABLED: 'notifications_enabled',
  BANNER_ENABLED:     'banner_enabled',
  NOTIFICATION_CENTER_ENABLED: 'notification_center_enabled',
  DO_NOT_DISTURB:     'do_not_disturb',
  DO_NOT_DISTURB_START: 'do_not_disturb_start',
  DO_NOT_DISTURB_END: 'do_not_disturb_end',

  // === AI ===
  STREAM_ENABLED:     'stream_enabled',
  TIMEOUT:            'api_timeout',
  CREATIVITY:         'ai_creativity',
  API_BASE_URL:       'api_base_url',
  API_KEY:            'api_key',
  API_MODEL:          'api_model',

  // === 感官 ===
  SENSORY_EYE_ENABLED: 'sensory_eye_enabled',
  SENSORY_EAR_ENABLED: 'sensory_ear_enabled',

  // === TTS ===
  TTS_MODE:           'tts_mode',
  TTS_VOICES:         'tts_voices',
  TTS_BROWSER_VOICE:  'tts_browser_voice',
  TTS_CLOUD_VOICE:    'tts_cloud_voice',
  TTS_RATE:           'tts_rate',
  TTS_PITCH:          'tts_pitch',
  TTS_AUTO_PLAY:      'tts_auto_play',

  // === 思维链 ===
  CHAIN_ENABLED:      'chain_enabled',
  CHAIN_DEFAULT_EXPANDED: 'chain_default_expanded',
  CHAIN_SHOW_APP_STEPS: 'chain_show_app_steps',
  CHAIN_SHOW_MEMORY_STEPS: 'chain_show_memory_steps',
  CHAIN_SHOW_TOOL_STEPS: 'chain_show_tool_steps',
  CHAIN_SHOW_SENSORY_STEPS: 'chain_show_sensory_steps',
  CHAIN_AUTO_COLLAPSE: 'chain_auto_collapse',

  // === 记忆 ===
  MEMORY_AUTO_EXTRACT: 'memory_auto_extract',
  MEMORY_AI_DIRECT_EDIT: 'memory_ai_direct_edit',
  MEMORY_AUTO_COMPRESS: 'memory_auto_compress',
  MEMORY_APP_EVENTS:  'memory_app_events',

  // === API ===
  API_GROUPS:         'api_groups',
  API_DEFAULT_CHAT_MODEL: 'api_default_chat_model',
  API_DEFAULT_VISION_MODEL: 'api_default_vision_model',
  API_DEFAULT_TTS_MODEL: 'api_default_tts_model',

  // === 角色 ===
  CURRENT_CHARACTER:  'current_character',

  // === 通用 ===
  EXPERIMENTAL_MODE:  'experimental_mode',
  FIRST_LAUNCH:       'first_launch'
});

// IndexedDB 库名与表名
const DB_CONFIG = Object.freeze({
  NAME: 'little_phone',
  VERSION: 1,
  STORES: {
    MESSAGES:    'messages',
    MEMORIES:    'memories',
    NOTIFICATIONS: 'notifications',
    CHARACTERS:  'characters',
    MEDIA:       'media'
  }
});

export { STORAGE_KEYS, DB_CONFIG };