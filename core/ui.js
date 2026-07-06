// ============================================
// ui.js — 公用UI组件// ============================================
// ui.js — 公用UI组件行为与// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

impo// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// =================================// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } =// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textConten// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toas// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { onc// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {})// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    on// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  cons// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label',// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' &&// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close =// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (resul// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel'// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => clos// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function show// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confi// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      on// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// =// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title =// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.class// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label',// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle">// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (conten// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content))// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        cons// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        const div = document.createElement('div');
        div.textContent = item;
        body.appendChild(div);// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        const div = document.createElement('div');
        div.textContent = item;
        body.appendChild(div);
      } else if (item instanceof Node) {
        body.appendChild(item);
      }
    });// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        const div = document.createElement('div');
        div.textContent = item;
        body.appendChild(div);
      } else if (item instanceof Node) {
        body.appendChild(item);
      }
    });
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const close =// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        const div = document.createElement('div');
        div.textContent = item;
        body.appendChild(div);
      } else if (item instanceof Node) {
        body.appendChild(item);
      }
    });
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const close = () => {
    sheet.classList.remove('ui-bottom-sheet--visible');
    sh// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        const div = document.createElement('div');
        div.textContent = item;
        body.appendChild(div);
      } else if (item instanceof Node) {
        body.appendChild(item);
      }
    });
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const close = () => {
    sheet.classList.remove('ui-bottom-sheet--visible');
    sheet.addEventListener('transitionend', () => {
      _removeOverlay(overlay);
      if (// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        const div = document.createElement('div');
        div.textContent = item;
        body.appendChild(div);
      } else if (item instanceof Node) {
        body.appendChild(item);
      }
    });
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const close = () => {
    sheet.classList.remove('ui-bottom-sheet--visible');
    sheet.addEventListener('transitionend', () => {
      _removeOverlay(overlay);
      if (onClose) onClose();
    }, { once: true });
  };

  overlay.addEventListener('// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        const div = document.createElement('div');
        div.textContent = item;
        body.appendChild(div);
      } else if (item instanceof Node) {
        body.appendChild(item);
      }
    });
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const close = () => {
    sheet.classList.remove('ui-bottom-sheet--visible');
    sheet.addEventListener('transitionend', () => {
      _removeOverlay(overlay);
      if (onClose) onClose();
    }, { once: true });
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        const div = document.createElement('div');
        div.textContent = item;
        body.appendChild(div);
      } else if (item instanceof Node) {
        body.appendChild(item);
      }
    });
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const close = () => {
    sheet.classList.remove('ui-bottom-sheet--visible');
    sheet.addEventListener('transitionend', () => {
      _removeOverlay(overlay);
      if (onClose) onClose();
    }, { once: true });
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  _trapFocus(sheet);
  requestAnimationFrame(() => {
    overlay.classList.add('ui// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        const div = document.createElement('div');
        div.textContent = item;
        body.appendChild(div);
      } else if (item instanceof Node) {
        body.appendChild(item);
      }
    });
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const close = () => {
    sheet.classList.remove('ui-bottom-sheet--visible');
    sheet.addEventListener('transitionend', () => {
      _removeOverlay(overlay);
      if (onClose) onClose();
    }, { once: true });
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  _trapFocus(sheet);
  requestAnimationFrame(() => {
    overlay.classList.add('ui-overlay--visible');
    sheet.classList.add('ui-bottom-sheet--visible');
  });// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        const div = document.createElement('div');
        div.textContent = item;
        body.appendChild(div);
      } else if (item instanceof Node) {
        body.appendChild(item);
      }
    });
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const close = () => {
    sheet.classList.remove('ui-bottom-sheet--visible');
    sheet.addEventListener('transitionend', () => {
      _removeOverlay(overlay);
      if (onClose) onClose();
    }, { once: true });
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  _trapFocus(sheet);
  requestAnimationFrame(() => {
    overlay.classList.add('ui-overlay--visible');
    sheet.classList.add('ui-bottom-sheet--visible');
  });

  return { close, sheet, overlay };
}

// ============================================
// 内部// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        const div = document.createElement('div');
        div.textContent = item;
        body.appendChild(div);
      } else if (item instanceof Node) {
        body.appendChild(item);
      }
    });
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const close = () => {
    sheet.classList.remove('ui-bottom-sheet--visible');
    sheet.addEventListener('transitionend', () => {
      _removeOverlay(overlay);
      if (onClose) onClose();
    }, { once: true });
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  _trapFocus(sheet);
  requestAnimationFrame(() => {
    overlay.classList.add('ui-overlay--visible');
    sheet.classList.add('ui-bottom-sheet--visible');
  });

  return { close, sheet, overlay };
}

// ============================================
// 内部：创建覆盖层
// ============================================
function _createOverlay(type) {
  cons// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        const div = document.createElement('div');
        div.textContent = item;
        body.appendChild(div);
      } else if (item instanceof Node) {
        body.appendChild(item);
      }
    });
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const close = () => {
    sheet.classList.remove('ui-bottom-sheet--visible');
    sheet.addEventListener('transitionend', () => {
      _removeOverlay(overlay);
      if (onClose) onClose();
    }, { once: true });
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  _trapFocus(sheet);
  requestAnimationFrame(() => {
    overlay.classList.add('ui-overlay--visible');
    sheet.classList.add('ui-bottom-sheet--visible');
  });

  return { close, sheet, overlay };
}

// ============================================
// 内部：创建覆盖层
// ============================================
function _createOverlay(type) {
  const overlay = document.createElement('div');
  overlay.className = `ui-overlay ui-overlay// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        const div = document.createElement('div');
        div.textContent = item;
        body.appendChild(div);
      } else if (item instanceof Node) {
        body.appendChild(item);
      }
    });
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const close = () => {
    sheet.classList.remove('ui-bottom-sheet--visible');
    sheet.addEventListener('transitionend', () => {
      _removeOverlay(overlay);
      if (onClose) onClose();
    }, { once: true });
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  _trapFocus(sheet);
  requestAnimationFrame(() => {
    overlay.classList.add('ui-overlay--visible');
    sheet.classList.add('ui-bottom-sheet--visible');
  });

  return { close, sheet, overlay };
}

// ============================================
// 内部：创建覆盖层
// ============================================
function _createOverlay(type) {
  const overlay = document.createElement('div');
  overlay.className = `ui-overlay ui-overlay--${type}`;
  overlay.setAttribute('aria-hidden', 'true');
  _activeOv// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        const div = document.createElement('div');
        div.textContent = item;
        body.appendChild(div);
      } else if (item instanceof Node) {
        body.appendChild(item);
      }
    });
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const close = () => {
    sheet.classList.remove('ui-bottom-sheet--visible');
    sheet.addEventListener('transitionend', () => {
      _removeOverlay(overlay);
      if (onClose) onClose();
    }, { once: true });
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  _trapFocus(sheet);
  requestAnimationFrame(() => {
    overlay.classList.add('ui-overlay--visible');
    sheet.classList.add('ui-bottom-sheet--visible');
  });

  return { close, sheet, overlay };
}

// ============================================
// 内部：创建覆盖层
// ============================================
function _createOverlay(type) {
  const overlay = document.createElement('div');
  overlay.className = `ui-overlay ui-overlay--${type}`;
  overlay.setAttribute('aria-hidden', 'true');
  _activeOverlays.push(overlay);
  document.body.style.overflow = 'hidden';
  return overlay;
}

// 内部：移除覆盖层
function _removeOverlay(overlay// ============================================
// ui.js — 公用UI组件行为与结构
// 提供弹窗、底部弹出、toast、确认框等通用UI组件
// 所有组件读写颜色走CSS变量，不硬编码
// ============================================

import events from './events.js';

// 活跃的覆盖层列表
let _activeOverlays = [];
// 焦点陷阱元素
let _focusTrapEl = null;

// ============================================
// Toast 轻提示
// ============================================
function showToast(message, options = {}) {
  const { duration = 2000, type = 'info' } = options;

  const toast = document.createElement('div');
  toast.className = `ui-toast ui-toast--${type}`;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  toast.textContent = message;

  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('ui-toast--visible');
  });

  setTimeout(() => {
    toast.classList.remove('ui-toast--visible');
    toast.addEventListener('transitionend', () => {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, { once: true });
  }, duration);

  return toast;
}

// ============================================
// Modal 弹窗
// ============================================
function showModal(options = {}) {
  const {
    title = '',
    content = '',
    confirmText = '确定',
    cancelText = '取消',
    showCancel = true,
    onConfirm,
    onCancel,
    onClose,
    closable = true
  } = options;

  const overlay = _createOverlay('modal');
  const modal = document.createElement('div');
  modal.className = 'ui-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', title || '弹窗');

  modal.innerHTML = `
    <div class="ui-modal__header">
      <h2 class="ui-modal__title">${_escapeHtml(title)}</h2>
      ${closable ? '<button class="ui-modal__close icon-btn" aria-label="关闭">&times;</button>' : ''}
    </div>
    <div class="ui-modal__body">${typeof content === 'string' ? _escapeHtml(content) : ''}</div>
    <div class="ui-modal__footer">
      ${showCancel ? `<button class="ui-modal__btn ui-modal__btn--cancel btn-secondary">${_escapeHtml(cancelText)}</button>` : ''}
      <button class="ui-modal__btn ui-modal__btn--confirm btn-primary">${_escapeHtml(confirmText)}</button>
    </div>
  `;

  if (typeof content !== 'string' && content instanceof Node) {
    modal.querySelector('.ui-modal__body').appendChild(content);
  }

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const close = (result) => {
    _removeOverlay(overlay);
    if (result === 'confirm' && onConfirm) onConfirm();
    if (result === 'cancel' && onCancel) onCancel();
    if (onClose) onClose(result);
  };

  modal.querySelector('.ui-modal__btn--confirm').addEventListener('click', () => close('confirm'));
  if (showCancel) {
    modal.querySelector('.ui-modal__btn--cancel').addEventListener('click', () => close('cancel'));
  }
  if (closable) {
    modal.querySelector('.ui-modal__close').addEventListener('click', () => close('close'));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close('close');
    });
  }

  _trapFocus(modal);
  requestAnimationFrame(() => overlay.classList.add('ui-overlay--visible'));

  return { close: () => close('close'), modal, overlay };
}

// ============================================
// Confirm 确认框
// ============================================
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    showModal({
      title: options.title || '确认',
      content: message,
      confirmText: options.confirmText || '确定',
      cancelText: options.cancelText || '取消',
      showCancel: true,
      onConfirm: () => resolve(true),
      onCancel: () => resolve(false),
      onClose: () => resolve(false)
    });
  });
}

// ============================================
// Bottom Sheet 底部弹出
// ============================================
function showBottomSheet(options = {}) {
  const {
    title = '',
    content = '',
    onClose
  } = options;

  const overlay = _createOverlay('bottom-sheet');
  const sheet = document.createElement('div');
  sheet.className = 'ui-bottom-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title || '菜单');

  sheet.innerHTML = `
    <div class="ui-bottom-sheet__handle"></div>
    ${title ? `<div class="ui-bottom-sheet__header"><h3 class="ui-bottom-sheet__title">${_escapeHtml(title)}</h3></div>` : ''}
    <div class="ui-bottom-sheet__body"></div>
  `;

  const body = sheet.querySelector('.ui-bottom-sheet__body');
  if (typeof content === 'string') {
    body.innerHTML = content;
  } else if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    content.forEach(item => {
      if (typeof item === 'string') {
        const div = document.createElement('div');
        div.textContent = item;
        body.appendChild(div);
      } else if (item instanceof Node) {
        body.appendChild(item);
      }
    });
  }

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  const close = () => {
    sheet.classList.remove('ui-bottom-sheet--visible');
    sheet.addEventListener('transitionend', () => {
      _removeOverlay(overlay);
      if (onClose) onClose();
    }, { once: true });
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  _trapFocus(sheet);
  requestAnimationFrame(() => {
    overlay.classList.add('ui-overlay--visible');
    sheet.classList.add('ui-bottom-sheet--visible');
  });

  return { close, sheet, overlay };
}

// ============================================
// 内部：创建覆盖层
// ============================================
function _createOverlay(type) {
  const overlay = document.createElement('div');
  overlay.className = `ui-overlay ui-overlay--${type}`;
  overlay.setAttribute('aria-hidden', 'true');
  _activeOverlays.push(overlay);
  document.body.style.overflow = 'hidden';
  return overlay;
}

// 内部：移除覆盖层
function _removeOverlay(overlay) {
  overlay.classList.remove('ui-overlay--visible');
  overlay.addEventListener('transitionend