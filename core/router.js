// core/router.js
// 跨 App 跳转协议。openApp(appId, {deepLink}) 支持 deeplink 跳转。
// 每个 App 的 mount 必须支持读 context.deepLink。
// 依赖：apps-registry.js（懒加载，避免循环），core/ui.js，core/events.js

import { showToast } from './ui.js';
import bus from './events.js';

let currentApp = null;
let currentContainer = null;
let registry = null;

async function getRegistry() {
  if (!registry) {
    try {
      registry = await import('../apps-registry.js');
    } catch (e) {
      console.warn('[router] 注册表加载失败', e);
      registry = null;
    }
  }
  return registry;
}

export function getCurrentApp() {
  return currentApp;
}

export async function openApp(appId, params = {}) {
  if (!appId) return;
  const reg = await getRegistry();
  if (!reg || !reg.APPS) {
    showToast('注册表还没准备好，稍等一下下嘛');
    return;
  }
  const def = reg.APPS.find((a) => a.id === appId);
  if (!def) {
    showToast('这个 App 还没安装好呢');
    return;
  }

  // 先卸载当前
  await closeCurrent();

  const container = document.getElementById('app-root') || createAppRoot();
  currentContainer = container;

  try {
    const context = await buildContext(def, params);
    const mod = await def.loader();
    if (typeof mod.mount !== 'function') {
      showToast('这个 App 有点害羞，还没准备好');
      return;
    }
    await mod.mount(container, context);
    currentApp = { id: appId, def, module: mod, params };
    container.classList.add('app-open');
    bus.emit('router:opened', { appId, params });
    try { localStorage.setItem('app_last_opened_app', appId); } catch (e) {}
  } catch (e) {
    console.warn('[router] 打开失败', appId, e);
    showToast('哎呀，打开出了点问题');
  }
}

export async function closeCurrent() {
  if (!currentApp) return;
  try {
    if (typeof currentApp.module.unmount === 'function') {
      await currentApp.module.unmount();
    }
  } catch (e) {
    console.warn('[router] unmount 失败', currentApp.id, e);
  }
  if (currentContainer) {
    currentContainer.classList.remove('app-open');
    currentContainer.innerHTML = '';
  }
  const closed = currentApp.id;
  currentApp = null;
  currentContainer = null;
  bus.emit('router:closed', { appId: closed });
}

export async function goHome() {
  await closeCurrent();
  bus.emit('router:home', {});
}

function createAppRoot() {
  let el = document.getElementById('app-root');
  if (!el) {
    el = document.createElement('div');
    el.id = 'app-root';
    el.className = 'app-root';
    document.body.appendChild(el);
  }
  return el;
}

async function buildContext(def, params) {
  // 共享给所有 App 的工具集
  const storage = await import('./storage.js');
  const ui = await import('./ui.js');
  const ctx = {
    appId: def.id,
    deepLink: params.deepLink || null,
    params,
    getData: storage.getData,
    setData: storage.setData,
    removeData: storage.removeData,
    getDB: storage.getDB,
    setDB: storage.setDB,
    deleteDB: storage.deleteDB,
    getAllDB: storage.getAllDB,
    getByIndexDB: storage.getByIndexDB,
    generateId: storage.generateId,
    getNow: storage.getNow,
    compressImage: storage.compressImage,
    showToast: ui.showToast,
    showBottomSheet: ui.showBottomSheet,
    hideBottomSheet: ui.hideBottomSheet,
    showConfirm: ui.showConfirm,
    showAlert: ui.showAlert,
    createIcon: ui.createIcon,
    refreshDesktop: () => bus.emit('desktop:refresh'),
    refreshBadges: () => bus.emit('desktop:refresh-badges'),
    bus,
    openApp,
    recordInteraction: async (entry) => {
      const mem = await import('./memory.js');
      return mem.recordInteraction(entry);
    },
    emit: bus.emit,
    on: bus.on
  };
  return ctx;
}

export default { openApp, closeCurrent, goHome, getCurrentApp };
