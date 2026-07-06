// ============================================
// app-host.js — APP加载宿主
// 监听路由事件，动态加载 APP entry 模块并挂载到 app-container
// 这是 router → UI 的桥接层，不写业务逻辑
// ============================================

import events from './events.js';
import { transitionPage, clearPage } from './ui.js';

// 当前已挂载的APP清理函数（APP mount 时返回 unmount）
let _currentUnmount = null;

// 初始化：监听路由事件
function initAppHost() {
  events.on('app:opened', _handleAppOpened);
  events.on('app:closed', _handleAppClosed);
}

// APP打开：动态加载 entry 模块，调用 mount(container)
async function _handleAppOpened(payload) {
  // events.js 把 emit 的 data 包在 { event, data, ... } 里
  const { appId, definition } = payload?.data || payload || {};
  if (!definition || !definition.entry) {
    console.warn(`[AppHost] APP "${appId}" 没有 entry 字段`);
    return;
  }

  // 清理上一个APP
  _safeUnmount();

  try {
    // 动态导入 APP entry（路径如 'apps/chat/index.js'）
    const module = await import(/* @vite-ignore */ `/${definition.entry}`);
    const mountFn = module.default || module.mount;

    if (typeof mountFn !== 'function') {
      console.warn(`[AppHost] APP "${appId}" 的 entry 没有导出 mount 函数`);
      return;
    }

    // 用 transitionPage 切换页面
    let pageEl = null;
    await transitionPage(() => {
      pageEl = document.createElement('div');
      pageEl.className = 'app-page';
      pageEl.dataset.appId = appId;
      return pageEl;
    });

    // 调用 APP 的 mount，拿回 unmount 清理函数
    const unmount = await mountFn(pageEl, { appId, definition });
    if (typeof unmount === 'function') {
      _currentUnmount = unmount;
    }

    events.emit('app:host:mounted', { appId });
  } catch (err) {
    console.error(`[AppHost] 加载 APP "${appId}" 失败:`, err);
    // 加载失败时显示错误页
    transitionPage(() => {
      const errEl = document.createElement('div');
      errEl.className = 'app-page';
      errEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-text">这个APP打不开……<br>${err?.message || '未知错误'}</div>
        </div>
      `;
      return errEl;
    });
  }
}

// APP关闭：调用 unmount，清空容器
function _handleAppClosed() {
  _safeUnmount();
  clearPage();
}

function _safeUnmount() {
  if (typeof _currentUnmount === 'function') {
    try {
      _currentUnmount();
    } catch (err) {
      console.warn('[AppHost] APP unmount 出错:', err);
    }
    _currentUnmount = null;
  }
}

export { initAppHost };
