// core/storage-keys.js
// 集中注册所有 localStorage key 与 IndexedDB store name，禁止散落字符串。
// 依赖：无

export const STORES = Object.freeze({
  characters: 'characters',
  memories: 'memories',
  messages: 'messages',
  groupMessages: 'group_messages',
  moments: 'moments',
  dreams: 'dreams',
  punishments: 'punishments',
  grudges: 'grudges',
  relationshipLocks: 'relationship_locks',
  worldbook: 'worldbook',
  stickers: 'stickers',
  songs: 'songs',
  playlists: 'playlists',
  inventory: 'inventory',
  anniversaries: 'anniversaries',
  gifts: 'gifts',
  tarotGame: 'tarot_game',
  truthGame: 'truth_game',
  drawGuess: 'draw_guess',
  liarsTavern: 'liars_tavern',
  apiPool: 'api_pool',
  blobs: 'blobs',
  mcpSessions: 'mcp_sessions',
  moodEntries: 'mood_entries',
  healthEntries: 'health_entries',
  photoAlbums: 'photo_albums',
  countdowns: 'countdowns',
  flashcards: 'flashcards',
  alarms: 'alarms',
  notes: 'notes',
  pomodoroStats: 'pomodoro_stats',
  chatSessions: 'chat_sessions',
  favorites: 'favorites',
  inbox: 'inbox',
  affections: 'affections'
});

export const KEYS = Object.freeze({
  // 全局元数据
  appSettings: 'app_settings',
  appConfig: 'app_config',          // config.js 用户覆盖（魔法数字），独立于 app_settings 避免互踩
  appIcons: 'app_icons',
  appWidgetPositions: 'app_widget_positions',
  appDockOrder: 'app_dock_order',
  appDockOverrides: 'app_dock_overrides',
  appDesktopPages: 'app_desktop_pages',
  appWallpaper: 'app_wallpaper',
  appLockWallpaper: 'app_lock_wallpaper',
  appLockAvatar: 'app_lock_avatar',
  appLockPassword: 'app_lock_password',
  appTheme: 'app_theme',
  appCustomTheme: 'app_custom_theme',
  appCustomColors: 'app_custom_colors',
  appFontFamily: 'app_font_family',
  appCustomFontBlob: 'app_custom_font_blob',
  appFontScale: 'app_font_scale',          // 全局字号缩放（0.85 ~ 1.25）
  appBubbleRadius: 'app_bubble_radius',    // 气泡圆角倍率（0.5 ~ 1.8）
  appMotionLevel: 'app_motion_level',      // 动效强度：'full' | 'reduced' | 'none'
  appTypingSpeed: 'app_typing_speed',      // 本地兜底打字速度（字/帧，0.5 ~ 4）
  appDesktopScale: 'app_desktop_scale',
  appWidgetScale: 'app_widget_widget_scale',
  appDockScale: 'app_dock_scale',
  appFirstRun: 'app_first_run',
  appSchemaVersion: 'app_schema_version',
  appLastOpenedApp: 'app_last_opened_app',
  appInstallPrompted: 'app_install_prompted',
  appLockUnlocked: 'app_lock_unlocked',
  appIconOrder: (page) => `app_icon_order_${page}`,
  appHiddenIcons: 'app_hidden_icons',

  // 聊天相关
  chatCurrentCharacter: 'chat_current_character',
  chatQuickReplies: (characterId) => `chat_${characterId}_quick_replies`,
  chatMoods: (characterId) => `chat_${characterId}_moods`,
  chatChain: (characterId) => `chat_${characterId}_chain`,
  chatWallpaper: (characterId) => `chat_${characterId}_wallpaper`,
  chatWallpaperOpacity: (characterId) => `chat_${characterId}_wallpaper_opacity`,
  chatStickerPack: (characterId) => `chat_${characterId}_sticker_pack`,
  chatConfig: (characterId) => `chat_${characterId}_config`,
  chatUnreadCount: 'chat_unread_count',

  // 群聊（必须用 groupId，避免与单聊冲突）
  groupConfig: (groupId) => `chat_group_${groupId}_config`,
  groupQuickReplies: (groupId) => `chat_group_${groupId}_quick_replies`,

  // 各 App 状态
  walletState: 'wallet_state',
  shopState: 'shop_state',
  momentsReadUpTo: 'moments_read_up_to',
  galleryFilter: 'gallery_filter',
  gamesProgress: 'games_progress',
  dreamLastSeen: 'dream_last_seen',
  weatherCache: 'weather_cache',
  weatherCity: 'weather_city',
  pomodoroState: 'pomodoro_state',
  flashcardState: 'flashcard_state',
  alarmState: 'alarm_state',
  countdownState: 'countdown_state',
  moodState: 'mood_state',
  healthState: 'health_state',
  photosState: 'photos_state',
  avatarState: 'avatar_state',
  collectionsState: 'collections_state',
  widgetStoreState: 'widget_store_state',
  astroState: 'astro_state',
  calculatorHistory: 'calculator_history',
  appFocusWidget: 'app_focus_widget',
  appBadges: 'app_badges',
  momentsUnreadCount: 'moments_unread_count',
  appAnniversaries: 'app_anniversaries',
  appVinylSongs: 'app_vinyl_songs',
  appLockUseWallpaper: 'app_lock_use_wallpaper',
  // 锁屏壁纸透明度（0-100，100 = 完全显示）
  appLockWallpaperOpacity: 'app_lock_wallpaper_opacity',
  // Widget 自定义壁纸：{ widgetId: { url, opacity } }
  appWidgetBackgrounds: 'app_widget_backgrounds',

  // 音乐 App：最近播放列表（最多 20 首，存 [{id, ts}]）
  musicRecentPlays: 'music_recent_plays',

  // 防打扰与主动消息
  aiProactiveBudget: 'ai_proactive_budget',
  aiLastProactive: 'ai_last_proactive',
  aiNightSilent: 'ai_night_silent',

  // 角色好感度缓存（IndexedDB STORES.affections 是真源，localStorage 用来快速读）
  characterAffection: (characterId) => `character_${characterId}_affection`,

  // 调试
  eventsHistory: 'events_history',

  // 第 0 步新增：AI / 消息中心 / APP 背景 / 系统
  aiConfig: 'ai_config',
  // MCP 内置本地工具开关：{ calc: true, date: false, ... }
  mcpBuiltinEnabled: 'mcp_builtin_enabled',
  appAppBackgrounds: 'app_app_backgrounds',
  inboxMessages: 'inbox_messages',
  systemName: 'system_name',
  chatMode: 'chat_mode',           // 'bubble' | 'dialog'
  notifySettings: 'notify_settings',
  // TTS 配置：provider / voice / apiKey / model / voice_settings 等
  ttsConfig: 'tts_config'
});

export const SCHEMA_VERSION = 3;
