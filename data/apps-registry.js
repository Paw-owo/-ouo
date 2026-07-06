// ============================================
// apps-registry.js — APP静态注册信息，唯一来源
// 字段：id、name、icon、entry、category、events、aiSpec、desktop(默认桌面/Dock标记)
// 用户态布局（顺序/可见性/Dock）走存储层，不写回这里
// ============================================

const APPS_REGISTRY = Object.freeze([
  {
    id: 'chat',
    name: '聊天',
    icon: 'chat',
    entry: 'apps/chat/index.js',
    category: 'social',
    events: ['message.received', 'message.sent', 'conversation.switched'],
    aiSpec: 'apps/chat/ai-spec.js',
    desktop: { show: true, dock: true }
  },
  {
    id: 'settings',
    name: '设置',
    icon: 'settings',
    entry: 'apps/settings/index.js',
    category: 'system',
    events: ['settings.changed', 'theme.changed', 'api.changed'],
    aiSpec: null,
    desktop: { show: true, dock: false }
  },
  {
    id: 'moments',
    name: '朋友圈',
    icon: 'moments',
    entry: 'apps/moments/index.js',
    category: 'social',
    events: ['moment.posted', 'moment.liked', 'moment.commented'],
    aiSpec: 'apps/moments/ai-spec.js',
    desktop: { show: true, dock: false }
  },
  {
    id: 'wallet',
    name: '钱包',
    icon: 'wallet',
    entry: 'apps/wallet/index.js',
    category: 'finance',
    events: ['wallet.balance_changed', 'wallet.transaction'],
    aiSpec: 'apps/wallet/ai-spec.js',
    desktop: { show: true, dock: false }
  },
  {
    id: 'shop',
    name: '商店',
    icon: 'shop',
    entry: 'apps/shop/index.js',
    category: 'finance',
    events: ['shop.purchased', 'shop.browsed'],
    aiSpec: 'apps/shop/ai-spec.js',
    desktop: { show: true, dock: false }
  },
  {
    id: 'memory',
    name: '记忆',
    icon: 'memory',
    entry: 'apps/memory/index.js',
    category: 'system',
    events: ['memory.added', 'memory.updated', 'memory.deleted', 'memory.compressed'],
    aiSpec: 'apps/memory/ai-spec.js',
    desktop: { show: true, dock: false }
  },
  {
    id: 'notebook',
    name: '备忘录',
    icon: 'notebook',
    entry: 'apps/notebook/index.js',
    category: 'tool',
    events: ['note.created', 'note.edited', 'note.deleted'],
    aiSpec: 'apps/notebook/ai-spec.js',
    desktop: { show: true, dock: false }
  },
  {
    id: 'anniversary',
    name: '纪念日',
    icon: 'anniversary',
    entry: 'apps/anniversary/index.js',
    category: 'tool',
    events: ['anniversary.added', 'anniversary.upcoming', 'anniversary.today'],
    aiSpec: 'apps/anniversary/ai-spec.js',
    desktop: { show: true, dock: false }
  },
  {
    id: 'grudge',
    name: '记仇本',
    icon: 'grudge',
    entry: 'apps/grudge/index.js',
    category: 'social',
    events: ['grudge.added', 'grudge.resolved'],
    aiSpec: 'apps/grudge/ai-spec.js',
    desktop: { show: true, dock: false }
  },
  {
    id: 'worldbook',
    name: '世界书',
    icon: 'worldbook',
    entry: 'apps/worldbook/index.js',
    category: 'system',
    events: ['worldbook.added', 'worldbook.updated'],
    aiSpec: 'apps/worldbook/ai-spec.js',
    desktop: { show: true, dock: false }
  },
  {
    id: 'character',
    name: '角色',
    icon: 'character',
    entry: 'apps/character/index.js',
    category: 'system',
    events: ['character.switched', 'character.updated'],
    aiSpec: 'apps/character/ai-spec.js',
    desktop: { show: true, dock: false }
  },
  {
    id: 'music',
    name: '音乐',
    icon: 'music',
    entry: 'apps/music/index.js',
    category: 'entertainment',
    events: ['music.played', 'music.liked'],
    aiSpec: 'apps/music/ai-spec.js',
    desktop: { show: true, dock: false }
  },
  {
    id: 'game',
    name: '游戏',
    icon: 'game',
    entry: 'apps/game/index.js',
    category: 'entertainment',
    events: ['game.played', 'game.score'],
    aiSpec: null,
    desktop: { show: true, dock: false }
  }
]);

// 快捷查询
function getAppById(id) {
  return APPS_REGISTRY.find(app => app.id === id);
}

function getAppsByCategory(category) {
  return APPS_REGISTRY.filter(app => app.category === category);
}

function getDefaultDesktopApps() {
  return APPS_REGISTRY.filter(app => app.desktop && app.desktop.show);
}

function getDefaultDockApps() {
  return APPS_REGISTRY.filter(app => app.desktop && app.desktop.dock);
}

export { APPS_REGISTRY, getAppById, getAppsByCategory, getDefaultDesktopApps, getDefaultDockApps };