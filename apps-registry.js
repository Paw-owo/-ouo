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
    icon: 'settings',
    iconColor: '#7AA2D6',
    dock: true,
    page: 0,
    loader: () => import('./apps/settings/index.js')
  },

  // ── page 0 ──
  {
    id: 'calculator',
    name: '计算器',
    icon: 'edit',
    iconColor: '#E8A04A',
    dock: false,
    page: 0,
    loader: () => import('./apps/calculator/index.js')
  },
  {
    id: 'memo',
    name: '备忘录',
    icon: 'memo',
    iconColor: '#7AA2D6',
    dock: false,
    page: 0,
    loader: () => import('./apps/memo/index.js')
  },
  {
    id: 'countdown',
    name: '倒计时',
    icon: 'calendar',
    iconColor: '#D4A87A',
    dock: false,
    page: 0,
    loader: () => import('./apps/countdown/index.js')
  },
  {
    id: 'anniversary',
    name: '纪念日',
    icon: 'heart',
    iconColor: '#F5A0B0',
    dock: false,
    page: 0,
    loader: () => import('./apps/anniversary/index.js')
  },
  {
    id: 'mood',
    name: '心情',
    icon: 'smile',
    iconColor: '#F5D88A',
    dock: false,
    page: 0,
    loader: () => import('./apps/mood/index.js')
  },
  {
    id: 'weather',
    name: '天气',
    icon: 'weather',
    iconColor: '#7EC4E0',
    dock: false,
    page: 0,
    loader: () => import('./apps/weather/index.js')
  },
  {
    id: 'chat',
    name: '聊天',
    icon: 'chat',
    iconColor: '#F5A0B0',
    dock: false,
    page: 0,
    loader: () => import('./apps/chat/index.js')
  },

  // ── page 1 ──
  {
    id: 'pomodoro',
    name: '番茄钟',
    icon: 'bell',
    iconColor: '#E8888C',
    dock: false,
    page: 1,
    loader: () => import('./apps/pomodoro/index.js')
  },
  {
    id: 'flashcard',
    name: '记忆卡',
    icon: 'edit',
    iconColor: '#B5D9A0',
    dock: false,
    page: 1,
    loader: () => import('./apps/flashcard/index.js')
  },
  {
    id: 'alarm',
    name: '闹钟',
    icon: 'sun',
    iconColor: '#B89878',
    dock: false,
    page: 1,
    loader: () => import('./apps/alarm/index.js')
  },
  {
    id: 'astro',
    name: '星座',
    icon: 'moon',
    iconColor: '#6B7FA0',
    dock: false,
    page: 1,
    loader: () => import('./apps/astro/index.js')
  },
  {
    id: 'health',
    name: '健康',
    icon: 'star',
    iconColor: '#8FD0B9',
    dock: false,
    page: 1,
    loader: () => import('./apps/health/index.js')
  },
  {
    id: 'characters',
    name: '角色',
    icon: 'smile',
    iconColor: '#F5D88A',
    dock: false,
    page: 1,
    loader: () => import('./apps/characters/index.js')
  },
  {
    id: 'worldbook',
    name: '世界书',
    icon: 'memo',
    iconColor: '#B89878',
    dock: false,
    page: 1,
    loader: () => import('./apps/worldbook/index.js')
  },
  {
    id: 'moments',
    name: '朋友圈',
    icon: 'heart',
    iconColor: '#E8888C',
    dock: false,
    page: 1,
    loader: () => import('./apps/moments/index.js')
  },
  {
    id: 'dream',
    name: '梦境',
    icon: 'dream',
    iconColor: '#6B7FA0',
    dock: false,
    page: 1,
    loader: () => import('./apps/dream/index.js')
  },
  {
    id: 'avatar',
    name: '头像',
    icon: 'smile',
    iconColor: '#F5B88A',
    dock: false,
    page: 1,
    loader: () => import('./apps/avatar/index.js')
  },
  {
    id: 'wallet',
    name: '钱包',
    icon: 'wallet',
    iconColor: '#E8A04A',
    dock: false,
    page: 1,
    loader: () => import('./apps/wallet/index.js')
  },
  {
    id: 'shop',
    name: '商店',
    icon: 'shop',
    iconColor: '#F5A0B0',
    dock: false,
    page: 1,
    loader: () => import('./apps/shop/index.js')
  },
  {
    id: 'games',
    name: '游戏',
    icon: 'games',
    iconColor: '#8FD0B9',
    dock: false,
    page: 1,
    loader: () => import('./apps/games/index.js')
  },
  {
    id: 'music',
    name: '音乐',
    icon: 'music',
    iconColor: '#7AA2D6',
    dock: false,
    page: 1,
    loader: () => import('./apps/music/index.js')
  },
  {
    id: 'collections',
    name: '收藏',
    icon: 'star',
    iconColor: '#F5D88A',
    dock: false,
    page: 1,
    loader: () => import('./apps/collections/index.js')
  },
  {
    id: 'grudge',
    name: '记仇本',
    icon: 'bell',
    iconColor: '#E8888C',
    dock: false,
    page: 1,
    loader: () => import('./apps/grudge/index.js')
  },
  {
    id: 'memory-viewer',
    name: '记忆',
    icon: 'star',
    iconColor: '#6B7FA0',
    dock: false,
    page: 1,
    loader: () => import('./apps/memory-viewer/index.js')
  },
  {
    id: 'inbox',
    name: '消息中心',
    icon: 'bell',
    iconColor: '#7AA2D6',
    dock: true,
    page: 0,
    loader: () => import('./apps/inbox/index.js')
  }
];
