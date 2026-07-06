// ============================================
// ui.js — 公用UI组件行为与结构
// 负责：toast、全局加载态、页面过渡管理
// 不负责业务逻辑，只负责通用UI行为
// ============================================

import events from './events.js';

// ========== Toast ==========

let _toastTimer = null;
let _toastElement = null;

function showToast(message, options = {}) {
  const {
    duration = 2000,
    type = 'info',
    position = 'bottom'
  } = options;

  // 移除旧toast
  dismissToast();

  const el = document.createElement('div');
  el.className = `toast toast-${type} toast-${position}`;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.textContent = message;

  // 插入到body
  document.body.appendChild(el);
  _toastElement = el;

  // 触发入场动画
  requestAnimationFrame(() => {
    el.classList.add('toast-visible');
  });

  // 自动消失
  _toastTimer = setTimeout(() => {
    dismissToast();
  }, duration);

  return el;
}

function dismissToast() {
  if (_toastTimer) {
    clearTimeout(_toastTimer);
    _toastTimer = null;
  }

  if (_toastElement) {
    _toastElement.classList.remove('toast-visible');
    _toastElement.classList.add('toast-hiding');

    const el = _toastElement;
    el.addEventListener('transitionend', () => {
      if (el.parentNode) {
        el.parentNode.removeChild(el);
      }
    }, { once: true });

    _toastElement = null;
  }
}

// ========== 全局加载态 ==========

let _loadingElement = null;
let _loadingCount = 0;

function showLoading(message = '') {
  _loadingCount++;

  if (_loadingElement) {
    if (message) {
      const textEl = _loadingElement.querySelector('.loading-text');
      if (textEl) textEl.textContent = message;
    }
    return;
  }

  const el = document.createElement('div');
  el.className = 'global-loading';
  el.setAttribute('role', 'alert');
  el.setAttribute('aria-busy', 'true');
  el.innerHTML = `
    <div class="loading-spinner"></div>
    ${message ? `<span class="loading-text">${message}</span>` : ''}
  `;

  document.body.appendChild(el);
  _loadingElement = el;

  requestAnimationFrame(() => {
    el.classList.add('global-loading-visible');
  });
}

function hideLoading() {
  _loadingCount = Math.max(0, _loadingCount - 1);

  if (_loadingCount > 0) return;
  if (!_loadingElement) return;

  _loadingElement.classList.remove('global-loading-visible');
  _loadingElement.classList.add('global-loading-hiding');

  const el = _loadingElement;
  el.addEventListener('transitionend', () => {
    if (el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }, { once: true });

  _loadingElement = null;
}

// 判断是否正在加载
function isLoading() {
  return _loadingCount > 0;
}

// ========== 页面过渡 ==========

// 页面切换动画时长（ms）
const PAGE_TRANSITION_DURATION = 300;

// 获取当前页面容器
function getAppContainer() {
  return document.getElementById('app-container');
}

// 创建APP页面容器（如果不存在）
function ensureAppContainer() {
  let container = getAppContainer();
  if (!container) {
    container = document.createElement('div');
    container.id = 'app-container';
    container.className = 'app-container';
    document.body.appendChild(container);
  }
  return container;
}

// 平滑切换页面内容
function transitionPage(renderFn) {
  const container = ensureAppContainer();
  const oldContent = container.firstElementChild;

  return new Promise((resolve) => {
    const done = () => {
      if (oldContent && oldContent.parentNode) {
        oldContent.parentNode.removeChild(oldContent);
      }
      resolve();
    };

    if (oldContent) {
      oldContent.classList.add('page-exit');

      // 创建新内容
      const newContent = renderFn();
      newContent.classList.add('page-enter');
      container.appendChild(newContent);

      // 等待退出动画完成
      const onTransitionEnd = () => {
        oldContent.removeEventListener('transitionend', onTransitionEnd);
        newContent.classList.remove('page-enter');
        newContent.classList.add('page-active');
        done();
      };

      oldContent.addEventListener('transitionend', onTransitionEnd, { once: true });

      // 兜底：超时强制完成
      setTimeout(() => {
        if (oldContent.parentNode) {
          oldContent.removeEventListener('transitionend', onTransitionEnd);
          done();
        }
      }, PAGE_TRANSITION_DURATION + 50);
    } else {
      const newContent = renderFn();
      newContent.classList.add('page-active');
      container.appendChild(newContent);
      done();
    }
  });
}

// 清空页面内容
function clearPage() {
  const container = getAppContainer();
  if (container) {
    container.innerHTML = '';
  }
}

// ========== 振动反馈（有设备支持时） ==========

function vibrate(pattern = 10) {
  if (navigator.vibrate) {
    navigator.vibrate(pattern);
  }
}

// ========== 初始化 ==========

function initUI() {
  ensureAppContainer();
}

export {
  showToast,
  dismissToast,
  showLoading,
  hideLoading,
  isLoading,
  ensureAppContainer,
  getAppContainer,
  transitionPage,
  clearPage,
  vibrate,
  initUI,
  PAGE_TRANSITION_DURATION
};