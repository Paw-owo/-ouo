// ============================================
// app-loader.js — APP 动态加载器
// 监听 app:opened 事件，动态导入 APP 入口脚本
// APP 入口脚本导出 init(container) → 返回 destroy 函数
// ============================================

import events from './events.js';
import { getAppById } from '../data/apps-registry.js';
import { getAppContainer } from './ui.js';

const _loadedApps = new Map();
let _currentDestroy = null;

events.on('app:opened', (payload) => {
  const appId = payload.data?.appId || payload.appId;
  if (!appId) return;
  loadApp(appId);
});

events.on('app:closed', () => {
  destroyCurrentApp();
});

async function loadApp(appId) {
  destroyCurrentApp();

  const container = getAppContainer();
  if (!container) return;

  container.innerHTML = '';
  container.classList.add('app-container-active');

  const appDef = getAppById(appId);
  if (!appDef || !appDef.entry) {
    _showError(container, 'APP 未注册');
    return;
  }

  try {
    let module;
    if (_loadedApps.has(appId)) {
      module = _loadedApps.get(appId);
    } else {
      module = await import(`../${appDef.entry}`);
      _loadedApps.set(appId, module);
    }

    if (typeof module.init !== 'function') {
      _showError(container, 'APP 缺少 init 函数');
      return;
    }

    const result = module.init(container);
    if (typeof result === 'function') {
      _currentDestroy = result;
    } else if (result && typeof result.destroy === 'function') {
      _currentDestroy = () => result.destroy();
    }
  } catch (err) {
    console.error(`[AppLoader] 加载 "${appId}" 失败:`, err);
    _showError(container, 'APP 加载失败');
  }
}

function destroyCurrentApp() {
  if (_currentDestroy) {
    try { _currentDestroy(); } catch (err) {
      console.error('[AppLoader] 销毁出错:', err);
    }
    _currentDestroy = null;
  }
  const container = getAppContainer();
  if (container) {
    container.innerHTML = '';
    container.classList.remove('app-container-active');
  }
}

function _showError(container, message) {
  container.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);font-size:1rem;">${message}</div>`;
}

function initAppLoader() {}

export { initAppLoader, loadApp, destroyCurrentApp };