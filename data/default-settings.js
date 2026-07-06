// ============================================
// default-settings.js — 全局设置默认值
// 由 core/config.js 读取并合并用户覆盖值
// ============================================

const DEFAULT_SETTINGS = Object.freeze({
  // 外观
  theme: 'vanilla-milk',
  themeMode: 'manual', // 'manual' | 'auto'

  // 桌面
  iconSize: 'standard', // 'standard' | 'large'
  desktopLayout: 'compact', // 'compact' | 'comfortable'
  dockVisible: true,
  pageIndicator: true,
  searchEntry: 'pullDown', // 'pullDown' | 'icon'
  controlCenterEntry: 'pullDown', // 'pullDown' | 'icon'

  // 壁纸
  wallpaper: null,
  lockscreenWallpaper: null,
  wallpaperSync: true,
  lockscreenBlur: 8,
  appBg: null,
  appBgOverrides: null,

  // 锁屏
  lockEnabled: false,
  lockPassword: '0000',
  lockAvatar: null,
  lockMessage: '',
  lockShowNotifications: 'summary', // 'none' | 'source' | 'summary' | 'hide-sensitive'

  // 通知
  notificationsEnabled: true,
  bannerEnabled: true,
  notificationCenterEnabled: true,
  desktopNoticeStyle: 'breathe', // 'off' | 'ring' | 'breathe' | 'tag'
  doNotDisturb: false,
  doNotDisturbStart: '23:00',
  doNotDisturbEnd: '08:00',
  lockNotificationStyle: 'summary', // 'none' | 'source' | 'summary' | 'hide-sensitive'

  // AI
  streamEnabled: true,
  timeout: 30000,
  creativity: 'balanced', // 'stable' | 'balanced' | 'creative'

  // 感官
  sensoryEyeEnabled: true,
  sensoryEarEnabled: true,

  // TTS
  ttsMode: 'off', // 'off' | 'browser' | 'cloud'
  ttsAutoPlay: false,
  ttsRate: 'normal', // 'slow' | 'normal' | 'fast'
  ttsPitch: 'normal', // 'low' | 'normal' | 'high'

  // 思维链
  chainEnabled: true,
  chainDefaultExpanded: false,
  chainShowAppSteps: true,
  chainShowMemorySteps: true,
  chainShowToolSteps: true,
  chainShowSensorySteps: true,
  chainAutoCollapse: true,

  // 记忆
  memoryAutoExtract: true,
  memoryAiDirectEdit: true,
  memoryAutoCompress: true,
  memoryAppEvents: true,

  // 实验
  experimentalMode: false
});

export default DEFAULT_SETTINGS;