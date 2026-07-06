// ============================================
// dock.js — 底部Dock栏
// 读取dock配置，不写死图标，默认不显示名字
// 软萌毛玻璃风格，点击打开APP
// ============================================

import { getDefaultDockApps } from '../data/apps-registry.js';
import { get } from '../core/config.js';
import { getAppIcon } from './app-grid.js';
import events from '../core/events.js';

let _dockEl = null;

// 获取dock显示的APP列表
function _getDockApps() {
  const defaultDock = getDefaultDockApps();
  const userOrder = get('dockIconOrder');

  let apps = [...defaultDock];

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

// 创建单个dock项
function _createDockItem(app) {
  const icon = getAppIcon(app.id);
  const item = document.createElement('div');
  item.className = 'dock-item';
  item.setAttribute('data-app-id', app.id);

  item.innerHTML = `
    <div class="dock-icon-chassis">
      ${icon}
    </div>
    <div class="dock-indicator"></div>
  `;

  item.addEventListener('click', () => {
    events.emit('desktop:app-click', { appId: app.id, definition: app });
  });

  return item;
}

// 渲染Dock
export function renderDock(container) {
  if (_dockEl && _dockEl.parentNode) {
    _dockEl.parentNode.removeChild(_dockEl);
  }

  _dockEl = document.createElement('div');
  _dockEl.className = 'dock-area';

  const bar = document.createElement('div');
  bar.className = 'dock-bar';

  const apps = _getDockApps();
  apps.forEach(app => {
    bar.appendChild(_createDockItem(app));
  });

  _dockEl.appendChild(bar);
  container.appendChild(_dockEl);
}

// 设置Dock项激活状态
export function setDockActive(appId) {
  if (!_dockEl) return;
  const items = _dockEl.querySelectorAll('.dock-item');
  items.forEach(item => {
    if (item.dataset.appId === appId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// 清除Dock激活状态
export function clearDockActive() {
  if (!_dockEl) return;
  const items = _dockEl.querySelectorAll('.dock-item');
  items.forEach(item => item.classList.remove('active'));
}

// 销毁
export function destroyDock() {
  if (_dockEl && _dockEl.parentNode) {
    _dockEl.parentNode.removeChild(_dockEl);
    _dockEl = null;
  }
}