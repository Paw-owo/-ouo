// ============================================
// app-host.js — APP加载宿主
// 监听路由事件，动态加载 APP entry 模块并挂载到 app-container
// 这是 router → UI 的桥接层，不写业务逻辑
// ============================================

import events from './events.js';
import { transitionPage, clearPage, getAppContainer } from './ui.js';

// 当前已挂载的APP清理函数（APP mount 时返回 unmount）
let _currentUnmount = null;

// 显示 APP 容器（覆盖在桌面之上）
function _showAppContainer() {
  const container = getAppContainer();
  if (container) container.classList.add('app-container-active');
}

// 隐藏 APP 容器
function _hideAppContainer() {
  const container = getAppContainer();
  if (container) container.classList.remove('app-container-active');
}

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
    // 用相对当前模块的路径，避免预览服务器根路径挂载不同导致绝对路径 404
    const entryPath = definition.entry.replace(/^\/+/, '');
    const module = await import(/* @vite-ignore */ `../${entryPath}`);
    // 兼容两种 entry 约定：mount(container) 或 init(container)
    // chat/settings 导出 default = init(container) → 返回 destroy
    const mountFn = module.default || module.mount || module.init;

    if (typeof mountFn !== 'function') {
      console.warn(`[AppHost] APP "${appId}" 的 entry 没有导出 mount/init 函数`);
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

    // 显示 APP 容器（app-surfaces.css 默认 display:none，需加 active 类）
    _showAppContainer();

    // 调用 APP 的 mount/init，拿回 unmount/destroy 清理函数
    const unmount = await mountFn(pageEl, { appId, definition });
    if (typeof unmount === 'function') {
      _currentUnmount = unmount;
    }

    events.emit('app:host:mounted', { appId });
  } catch (err) {
    console.error(`[AppHost] 加载 APP "${appId}" 失败:`, err);
    // 加载失败时显示错误页（同样需要显示容器）
    _showAppContainer();
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

// APP关闭：调用 unmount，清空并隐藏容器
function _handleAppClosed() {
  _safeUnmount();
  clearPage();
  _hideAppContainer();
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
