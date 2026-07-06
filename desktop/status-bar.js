// ============================================
// status-bar.js — 顶部状态胶囊
// 可爱装饰状态胶囊，不是传统手机顶部状态栏
// 图标SVG线条风，颜色全部走CSS变量
// ============================================

import events from '../core/events.js';
import { getCurrentTheme } from '../core/theme.js';

let _statusBarEl = null;

// 状态胶囊项配置
const CAPSULE_DEFS = [
  {
    id: 'theme',
    icon: 'sparkle',
    label: '',
    type: 'icon'
  },
  {
    id: 'status',
    icon: null,
    label: '元气满满',
    type: 'label'
  },
  {
    id: 'mood',
    icon: 'heart',
    label: '',
    type: 'icon'
  }
];

// SVG图标
function _getIcon(name) {
  const icons = {
    sparkle: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
              stroke-linecap="round" stroke-linejoin="round">
      <path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/>
    </svg>`,
    heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round">
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>
    </svg>`
  };
  return icons[name] || '';
}

// 创建状态栏
function _createStatusBar() {
  const el = document.createElement('div');
  el.className = 'status-bar';

  const capsules = CAPSULE_DEFS.map(def => {
    let content = '';
    if (def.type === 'icon' && def.icon) {
      content = _getIcon(def.icon);
    } else if (def.type === 'label') {
      content = `<span>${def.label}</span>`;
    }
    return `<div class="status-capsule" data-capsule="${def.id}">${content}</div>`;
  }).join('');

  el.innerHTML = capsules;
  return el;
}

// 更新状态标签
function _updateStatusLabel() {
  if (!_statusBarEl) return;
  const moods = ['元气满满', '心情好好', '今天也很棒', '暖洋洋的', '被治愈中'];
  const labelEl = _statusBarEl.querySelector('[data-capsule="status"] span');
  if (labelEl) {
    labelEl.textContent = moods[Math.floor(Math.random() * moods.length)];
  }
}

// 渲染状态栏
export function renderStatusBar(container) {
  if (_statusBarEl && _statusBarEl.parentNode) {
    _statusBarEl.parentNode.removeChild(_statusBarEl);
  }

  _statusBarEl = _createStatusBar();
  container.appendChild(_statusBarEl);

  // 初始随机心情
  _updateStatusLabel();
}

// 更新状态栏（主题切换时调用）
export function refreshStatusBar() {
  // 状态栏使用CSS变量，主题切换自动跟随，只需更新文本
  _updateStatusLabel();
}

// 监听主题变化
events.on('theme:changed', () => {
  refreshStatusBar();
});