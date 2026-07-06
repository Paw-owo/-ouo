// apps-registry.js
// 所有 App 的注册表。新增 App 只需两步：
//   1. 在 apps/<name>/ 下建 index.js（导出 mount/unmount）
//   2. 在此处加一行
// 红线：只注册真实可用的 App，不允许占位、空壳、"planned"。
// 依赖：无（loader 是动态 import，懒加载）

export const APPS = [
  // ── dock ──
  {
    id: 'settings',
    name: '设置',
    icon: 'app-settings',
    iconColor: '#7AA2D6',
    dock: true,
    page: 0,
    loader: () => import('./apps/settings/index.js')
  },

  // ── page 0 ──
  {
    id: 'calculator',
    name: '计算器',
    icon: 'app-calculator',
    iconColor: '#E8A04A',
    dock: false,
    page: 0,
    loader: () => import('./apps/calculator/index.js')
  },
  {
    id: 'memo',
    name: '备忘录',
    icon: 'app-memo',
    iconColor: '#8BADD4',
    dock: false,
    page: 0,
    loader: () => import('./apps/memo/index.js')
  },
  {
    id: 'countdown',
    name: '倒计时',
    icon: 'app-countdown',
    iconColor: '#F5A98A',
    dock: false,
    page: 0,
    loader: () => import('./apps/countdown/index.js')
  },
  {
    id: 'anniversary',
    name: '纪念日',
    icon: 'app-anniversary',
    iconColor: '#E8A0B8',
    dock: false,
    page: 0,
    loader: () => import('./apps/anniversary/index.js')
  },
  {
    id: 'mood',
    name: '心情',
    icon: 'app-mood',
    iconColor: '#C4A8D4',
    dock: false,
    page: 0,
    loader: () => import('./apps/mood/index.js')
  },
  {
    id: 'weather',
    name: '天气',
    icon: 'app-weather',
    iconColor: '#7EC4E0',
    dock: false,
    page: 0,
    loader: () => import('./apps/weather/index.js')
  },
  {
    id: 'chat',
    name: '聊天',
    icon: 'app-chat',
    iconColor: '#F5B0B8',
    dock: false,
    page: 0,
    loader: () => import('./apps/chat/index.js')
  },

  // ── page 1 ──
  {
    id: 'pomodoro',
    name: '番茄钟',
    icon: 'app-pomodoro',
    iconColor: '#E89898',
    dock: false,
    page: 1,
    loader: () => import('./apps/pomodoro/index.js')
  },
  {
    id: 'flashcard',
    name: '记忆卡',
    icon: 'app-flashcard',
    iconColor: '#A8C49A',
    dock: false,
    page: 1,
    loader: () => import('./apps/flashcard/index.js')
  },
  {
    id: 'alarm',
    name: '闹钟',
    icon: 'app-alarm',
    iconColor: '#D4B078',
    dock: false,
    page: 1,
    loader: () => import('./apps/alarm/index.js')
  },
  {
    id: 'astro',
    name: '星座',
    icon: 'app-astro',
    iconColor: '#8B9AD4',
    dock: false,
    page: 1,
    loader: () => import('./apps/astro/index.js')
  },
  {
    id: 'health',
    name: '健康',
    icon: 'app-health',
    iconColor: '#7ABE9E',
    dock: false,
    page: 1,
    loader: () => import('./apps/health/index.js')
  },
  {
    id: 'characters',
    name: '角色',
    icon: 'app-characters',
    iconColor: '#D4A4C4',
    dock: false,
    page: 1,
    loader: () => import('./apps/characters/index.js')
  },
  {
    id: 'worldbook',
    name: '世界书',
    icon: 'app-worldbook',
    iconColor: '#B89878',
    dock: false,
    page: 1,
    loader: () => import('./apps/worldbook/index.js')
  },
  {
    id: 'moments',
    name: '朋友圈',
    icon: 'app-moments',
    iconColor: '#F5A0C8',
    dock: false,
    page: 1,
    loader: () => import('./apps/moments/index.js')
  },
  {
    id: 'dream',
    name: '梦境',
    icon: 'app-dream',
    iconColor: '#9A8BD4',
    dock: false,
    page: 1,
    loader: () => import('./apps/dream/index.js')
  },
  {
    id: 'avatar',
    name: '头像',
    icon: 'app-avatar',
    iconColor: '#F5C498',
    dock: false,
    page: 1,
    loader: () => import('./apps/avatar/index.js')
  },
  {
    id: 'wallet',
    name: '钱包',
    icon: 'app-wallet',
    iconColor: '#E8B04A',
    dock: false,
    page: 1,
    loader: () => import('./apps/wallet/index.js')
  },
  {
    id: 'shop',
    name: '商店',
    icon: 'app-shop',
    iconColor: '#F088A0',
    dock: false,
    page: 1,
    loader: () => import('./apps/shop/index.js')
  },
  {
    id: 'games',
    name: '游戏',
    icon: 'app-games',
    iconColor: '#88C4D4',
    dock: false,
    page: 1,
    loader: () => import('./apps/games/index.js')
  },
  {
    id: 'music',
    name: '音乐',
    icon: 'app-music',
    iconColor: '#D49AC4',
    dock: false,
    page: 1,
    loader: () => import('./apps/music/index.js')
  },
  {
    id: 'collections',
    name: '收藏',
    icon: 'app-collections',
    iconColor: '#A8D4B0',
    dock: false,
    page: 1,
    loader: () => import('./apps/collections/index.js')
  },
  {
    id: 'grudge',
    name: '记仇本',
    icon: 'app-grudge',
    iconColor: '#C48888',
    dock: false,
    page: 1,
    loader: () => import('./apps/grudge/index.js')
  },
  {
    id: 'memory-viewer',
    name: '记忆',
    icon: 'app-memory-viewer',
    iconColor: '#88A8D4',
    dock: false,
    page: 1,
    loader: () => import('./apps/memory-viewer/index.js')
  },
  {
    id: 'inbox',
    name: '消息中心',
    icon: 'app-inbox',
    iconColor: '#7AA2D6',
    dock: true,
    page: 0,
    loader: () => import('./apps/inbox/index.js')
  }
];
