// ============================================
// app-grid.js — 桌面图标网格
// 从 apps-registry + 用户布局配置生成
// 不写死APP列表，支持4列网格，图标为Stitch布料质感
// ============================================

import { APPS_REGISTRY, getDefaultDesktopApps } from '../data/apps-registry.js';
import { get } from '../core/config.js';
import events from '../core/events.js';

let _gridEl = null;
let _appIcons = new Map(); // appId → SVG图标定义

// 默认APP图标（按appId，线条风SVG）
const DEFAULT_APP_ICONS = {
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
         stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    <line x1="8" y1="9" x2="16" y2="9"/>
    <line x1="8" y1="13" x2="13" y2="13"/>
  </svg>`,

  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.7l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.7-.3 1.7 1.7 0 0 0-1 1.5v.3a2 2 0 0 1-4 0v-.3a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.7.3l-.1.1a2 2 0 0 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.7 1.7 1.7 0 0 0-1.5-1h-.3a2 2 0 0 1 0-4h.3a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.7l-.1-.1a2 2 0 0 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.7.3 1.7 1.7 0 0 0 1-1.5v-.3a2 2 0 0 1 4 0v.3a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.7-.3l.1-.1a2 2 0 0 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.7 1.7 1.7 0 0 0 1.5 1h.3a2 2 0 0 1 0 4h-.3a1.7 1.7 0 0 0-1.5 1z"/>
  </svg>`,

  moments: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
            stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="4"/>
    <circle cx="8.5" cy="8.5" r="1.5"/>
    <path d="M21 15l-5-5L5 21"/>
  </svg>`,

  wallet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
    <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
    <path d="M18 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
  </svg>`,

  shop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
         stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/>
    <line x1="3" y1="6" x2="21" y2="6"/>
    <path d="M16 10a4 4 0 0 1-8 0"/>
  </svg>`,

  memory: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
    <path d="M12 6v6l4 2"/>
  </svg>`,

  notebook: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
    <line x1="8" y1="7" x2="16" y2="7"/>
    <line x1="8" y1="11" x2="14" y2="11"/>
  </svg>`,

  anniversary: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                stroke-linecap="round" stroke-linejoin="round">
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>
  </svg>`,

  grudge: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2l3 6.5L22 9l-5 4.5 1.5 7L12 17l-6.5 3.5L7 13.5 2 9l7-1z"/>
  </svg>`,

  worldbook: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>`,

  character: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`,

  music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3"/>
    <circle cx="18" cy="16" r="3"/>
  </svg>`,

  game: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
         stroke-linecap="round" stroke-linejoin="round">
    <rect x="2" y="6" width="20" height="12" rx="4"/>
    <path d="M6 12h4M8 10v4"/>
    <path d="M15 11v.01M18 11v.01"/>
  </svg>`
};

// 获取APP图标SVG
export function getAppIcon(appId) {
  if (_appIcons.has(appId)) return _appIcons.get(appId);
  return DEFAULT_APP_ICONS[appId] || DEFAULT_APP_ICONS.chat;
}

// 注册自定义图标
export function registerAppIcon(appId, svgString) {
  _appIcons.set(appId, svgString);
}

// 获取要显示的APP列表（从注册表 + 用户布局）
function _getDisplayApps() {
  const registryApps = getDefaultDesktopApps();
  const userOrder = get('desktopIconOrder');

  let apps = [...registryApps];

  // 如果用户有自定义顺序，按顺序排列
  if (userOrder && Array.isArray(userOrder)) {
    const ordered = [];
    const remaining = new Set(apps.map(a => a.id));
    for (const id of userOrder) {
      const app = apps.find(a => a.id === id);
      if (app) {
        ordered.push(app);
        remaining.delete(id);
      }
    }
    for (const id of remaining) {
      const app = apps.find(a => a.id === id);
      if (app) ordered.push(app);
    }
    apps = ordered;
  }

  return apps;
}

// 创建单个APP图标项
function _createAppItem(app, index) {
  const icon = getAppIcon(app.id);
  const item = document.createElement('div');
  item.className = 'app-grid-item';
  item.style.animationDelay = `${index * 40}ms`;
  item.setAttribute('data-app-id', app.id);

  item.innerHTML = `
    <div class="app-icon-chassis" style="position:relative;">
      ${icon}
    </div>
    <span class="app-name">${app.name}</span>
  `;

  // 点击打开APP
  item.addEventListener('click', () => {
    events.emit('desktop:app-click', { appId: app.id, definition: app });
  });

  return item;
}

// 渲染图标网格
export function renderAppGrid(container) {
  if (_gridEl && _gridEl.parentNode) {
    _gridEl.parentNode.removeChild(_gridEl);
  }

  _gridEl = document.createElement('div');
  _gridEl.className = 'app-grid-area';

  const grid = document.createElement('div');
  grid.className = 'app-grid';

  const apps = _getDisplayApps();
  apps.forEach((app, index) => {
    grid.appendChild(_createAppItem(app, index));
  });

  _gridEl.appendChild(grid);

  // 页面指示器
  const indicator = document.createElement('div');
  indicator.className = 'page-indicator';
  const pageCount = Math.ceil(apps.length / 16);
  for (let i = 0; i < Math.min(pageCount, 5); i++) {
    const dot = document.createElement('div');
    dot.className = `page-dot${i === 0 ? ' active' : ''}`;
    indicator.appendChild(dot);
  }
  _gridEl.appendChild(indicator);

  container.appendChild(_gridEl);
}

// 更新角标（给 inbox/notifications 留接口）
export function updateAppBadge(appId, count) {
  if (!_gridEl) return;
  const item = _gridEl.querySelector(`[data-app-id="${appId}"]`);
  if (!item) return;

  const chassis = item.querySelector('.app-icon-chassis');
  if (!chassis) return;

  // 移除旧角标
  const existing = chassis.querySelector('.app-badge');
  if (existing) existing.remove();

  if (count > 0) {
    const badge = document.createElement('div');
    badge.className = 'app-badge';
    badge.textContent = count > 99 ? '99+' : String(count);
    chassis.appendChild(badge);
  }
}

// 销毁
export function destroyAppGrid() {
  if (_gridEl && _gridEl.parentNode) {
    _gridEl.parentNode.removeChild(_gridEl);
    _gridEl = null;
  }
}