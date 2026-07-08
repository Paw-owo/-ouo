// ============================================
// settings/index.js — 设置 APP 入口
// 导出 init(container) → 渲染设置页面 → 返回 destroy
// 布局：主页 = 分组入口列表，子页 = 独立页面滑入
// 真实功能：外观与个性化、AI 与接口、关于与实验功能
// 其余分组显示可爱空状态
// ============================================

import { get, set, getApiGroupConfig } from '../../core/config.js';
import events from '../../core/events.js';
import { getLightThemes, getCurrentFamilyTheme, getResolvedMode } from '../../core/theme.js';
import { ICONS, _esc } from './icons.js';
import { renderAppearance, bindAppearance } from './appearance.js';
import { renderAI, bindAI } from './ai.js';

let _styleEl = null;
let _root = null;
let _currentPage = null;

const SYSTEM_NAME = '小手机';
const SYSTEM_VERSION = '1.0.0 预览版';

const GROUPS = [
  { key: 'appearance', label: '外观与个性化', icon: 'palette', real: true },
  { key: 'desktop', label: '桌面与锁屏', icon: 'monitor', real: false },
  { key: 'notifications', label: '通知', icon: 'bell', real: false },
  { key: 'ai', label: 'AI 与接口', icon: 'plug', real: true },
  { key: 'sensory', label: '感官功能', icon: 'eye', real: false },
  { key: 'tts', label: '语音与朗读', icon: 'volume', real: false },
  { key: 'data', label: '数据管理', icon: 'database', real: false },
  { key: 'about', label: '关于与实验功能', icon: 'info', real: true }
];

function _injectStyles() {
  if (_styleEl) return;
  _styleEl = document.createElement('style');
  _styleEl.id = 'settings-app-styles';
  _styleEl.textContent = `
    /* ====== 容器 ====== */
    .st-page { display: flex; flex-direction: column; height: 100%; }
    .st-page .app-header-back svg { pointer-events: none; }
    .st-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0 14px max(20px, env(safe-area-inset-bottom)); }
    .st-section { margin-bottom: 22px; }
    .st-section-head { display: flex; align-items: center; gap: 6px; padding: 0 4px 8px; }
    .st-section-icon { width: 16px; height: 16px; color: var(--text-placeholder); flex-shrink: 0; }
    .st-section-icon svg { width: 100%; height: 100%; }
    .st-section-title { font-size: 0.72rem; font-weight: 600; color: var(--text-placeholder); letter-spacing: 0.04em; }
    .st-section-hint { font-size: 0.72rem; color: var(--text-secondary); margin: 8px 4px 0; line-height: 1.4; }

    /* ====== 胶囊列表组 ====== */
    .st-capsule-group { display: flex; flex-direction: column; gap: 8px; }
    .st-capsule {
      display: flex; align-items: center; gap: 12px;
      background: var(--bg-surface);
      border: 1px solid var(--border-color);
      border-radius: var(--radius-full);
      padding: 12px 16px;
      box-shadow: var(--shadow-soft);
      transition: transform var(--duration-fast) var(--ease-soft),
                  box-shadow var(--duration-fast) var(--ease-smooth);
      cursor: pointer; user-select: none;
    }
    .st-capsule:active { transform: scale(0.97); box-shadow: var(--shadow-neu-in); }
    .st-capsule-icon {
      width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
      background: var(--color-primary-ultralight);
      color: var(--color-primary-deep);
      display: flex; align-items: center; justify-content: center;
      box-shadow: var(--shadow-soft);
    }
    .st-capsule-icon svg { width: 18px; height: 18px; }
    .st-capsule-body { flex: 1; display: flex; flex-direction: column; gap: 1px; min-width: 0; }
    .st-capsule-name { font-size: 0.88rem; font-weight: 600; color: var(--text-primary); }
    .st-capsule-hint { font-size: 0.72rem; color: var(--text-placeholder); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .st-capsule-arrow { width: 18px; height: 18px; color: var(--text-placeholder); flex-shrink: 0; transition: transform var(--duration-fast) var(--ease-soft); }
    .st-capsule-arrow svg { width: 100%; height: 100%; }
    .st-capsule.expanded .st-capsule-arrow { transform: rotate(90deg); }

    /* 折叠内容区 */
    .st-collapse {
      max-height: 0; overflow: hidden; opacity: 0;
      transition: max-height var(--duration-normal) var(--ease-smooth),
                  opacity var(--duration-fast) var(--ease-smooth);
    }
    .st-collapse.open { max-height: 800px; opacity: 1; }
    .st-collapse-inner { padding: 4px 4px 6px; display: flex; flex-direction: column; gap: 10px; }

    /* ====== 主题小色卡 ====== */
    .st-theme-row { display: flex; gap: 12px; overflow-x: auto; padding: 4px 0 6px; -webkit-overflow-scrolling: touch; scroll-snap-type: x mandatory; }
    .st-theme-chip {
      flex-shrink: 0; width: 88px; scroll-snap-align: start;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 8px 6px 10px; border-radius: var(--radius-lg);
      border: 1.5px solid transparent; background: transparent;
      transition: all var(--duration-fast) var(--ease-soft);
      cursor: pointer;
    }
    .st-theme-chip:active { transform: scale(0.94); }
    .st-theme-chip.active { border-color: var(--color-primary); background: var(--color-primary-ultralight); }
    .st-theme-card {
      width: 72px; height: 56px; border-radius: var(--radius-md);
      border: 2px solid var(--bg-base);
      box-shadow: var(--shadow-soft);
    }
    .st-theme-meta { display: flex; flex-direction: column; align-items: center; gap: 1px; }
    .st-theme-label { font-size: 0.72rem; font-weight: 600; color: var(--text-secondary); text-align: center; line-height: 1.1; max-width: 76px; }
    .st-theme-chip.active .st-theme-label { color: var(--text-primary); }
    .st-theme-sub { font-size: 0.6rem; color: var(--text-placeholder); letter-spacing: 0.04em; }
    .st-theme-chip.active .st-theme-sub { color: var(--color-primary-deep); }

    /* ====== 开关 ====== */
    .st-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .st-switch { position: relative; width: 42px; height: 24px; background: var(--border-color); border-radius: var(--radius-full); flex-shrink: 0; cursor: pointer; transition: background var(--duration-fast) var(--ease-smooth); }
    .st-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; background: var(--bg-base); border-radius: 50%; box-shadow: var(--shadow-soft); transition: transform var(--duration-fast) var(--ease-soft); }
    .st-switch.on { background: var(--color-primary); }
    .st-switch.on::after { transform: translateX(18px); }

    /* ====== 输入 ====== */
    .st-input {
      width: 100%; box-sizing: border-box;
      padding: 11px 14px; background: var(--bg-base);
      border: 1.5px solid var(--border-color); border-radius: var(--radius-full);
      font-size: 0.88rem; font-family: var(--font-family); color: var(--text-primary);
      transition: border-color var(--duration-fast) var(--ease-smooth), box-shadow var(--duration-fast) var(--ease-smooth);
      min-height: 44px;
    }
    .st-input:focus { outline: none; border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-ultralight); }
    .st-input::placeholder { color: var(--text-placeholder); }
    .st-input-masked { -webkit-text-security: disc; text-security: disc; }
    .st-field { display: flex; flex-direction: column; gap: 5px; }
    .st-field-label { font-size: 0.8rem; font-weight: 600; color: var(--text-primary); }
    .st-field-hint { font-size: 0.7rem; color: var(--text-placeholder); }
    .st-preview { width: 100%; height: 120px; border-radius: var(--radius-lg); background: var(--bg-base); border: 1.5px dashed var(--border-color); display: flex; align-items: center; justify-content: center; color: var(--text-placeholder); font-size: 0.72rem; background-size: cover; background-position: center; transition: all var(--duration-fast) var(--ease-smooth); }

    /* ====== 按钮 ====== */
    .st-btn { width: 100%; padding: 13px; min-height: 46px; border: none; border-radius: var(--radius-full); font-size: 0.92rem; font-weight: 600; font-family: var(--font-family); cursor: pointer; transition: transform var(--duration-fast) var(--ease-soft); box-shadow: var(--shadow-soft); }
    .st-btn:active { transform: scale(0.97); }
    .st-btn-primary { background: var(--color-primary); color: var(--bg-base); box-shadow: 0 4px 14px var(--color-primary-light); }
    .st-btn-ghost { background: var(--bg-surface); color: var(--text-primary); border: 1.5px solid var(--border-color); }
    .st-btn.saved { background: var(--color-success) !important; }
    .st-status { text-align: center; font-size: 0.76rem; color: var(--text-placeholder); min-height: 1.2em; transition: color var(--duration-fast) var(--ease-smooth); }
    .st-status.ok { color: var(--color-success); }
    .st-status.err { color: var(--color-error); }

    /* 模型列表 */
    .st-model-list { margin-top: 8px; display: flex; flex-wrap: wrap; gap: 8px; max-height: 140px; overflow-y: auto; padding: 8px; background: var(--bg-base); border: 1px solid var(--border-color); border-radius: var(--radius-lg); }
    .st-model-chip { padding: 6px 12px; border-radius: var(--radius-full); background: var(--color-primary-ultralight); color: var(--color-primary-deep); font-size: 0.76rem; font-weight: 500; cursor: pointer; transition: transform var(--duration-fast) var(--ease-soft), background var(--duration-fast) var(--ease-smooth); border: 1px solid transparent; }
    .st-model-chip:hover { background: var(--color-primary-light); }
    .st-model-chip:active { transform: scale(0.94); }
    .st-model-chip.selected { background: var(--color-primary); color: var(--bg-base); border-color: var(--color-primary); }
    .st-model-empty { width: 100%; text-align: center; font-size: 0.72rem; color: var(--text-placeholder); padding: 8px; }

    /* ====== 分段选择 ====== */
    .st-seg { display: flex; gap: 4px; background: var(--color-primary-ultralight); border-radius: var(--radius-full); padding: 4px; box-shadow: var(--shadow-neu-in); }
    .st-seg-btn { flex: 1; padding: 9px 4px; border: none; background: transparent; border-radius: var(--radius-full); font-size: 0.76rem; color: var(--text-secondary); cursor: pointer; font-family: var(--font-family); font-weight: 500; transition: all var(--duration-fast) var(--ease-smooth); }
    .st-seg-btn:active { transform: scale(0.96); }
    .st-seg-btn.active { background: var(--color-primary); color: var(--bg-base); box-shadow: 0 2px 8px var(--color-primary-light); font-weight: 600; }

    /* ====== 通用子页（滑入） ====== */
    .st-subpage { position: absolute; inset: 0; background: var(--bg-base); display: flex; flex-direction: column; z-index: 30; transform: translateX(100%); transition: transform var(--duration-normal) var(--ease-soft); }
    .st-subpage.entered { transform: translateX(0); }
    .st-subpage-body { flex: 1; overflow-y: auto; padding: 0 14px max(20px, env(safe-area-inset-bottom)); }

    /* ====== 壁纸预设网格 ====== */
    .st-wp-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .st-wp-preset { position: relative; aspect-ratio: 1 / 1; border-radius: var(--radius-md); border: 2px solid transparent; cursor: pointer; transition: transform var(--duration-fast) var(--ease-soft), border-color var(--duration-fast) var(--ease-smooth); display: flex; align-items: flex-end; justify-content: flex-start; padding: 6px; overflow: hidden; box-shadow: var(--shadow-soft); }
    .st-wp-preset:active { transform: scale(0.95); }
    .st-wp-preset.active { border-color: var(--color-primary); }
    .st-wp-preset-label { font-size: 0.62rem; font-weight: 600; color: var(--text-primary); background: var(--bg-glass); padding: 2px 6px; border-radius: var(--radius-full); backdrop-filter: var(--backdrop-blur); line-height: 1.2; }
    .st-wp-check { position: absolute; top: 4px; right: 4px; width: 18px; height: 18px; background: var(--color-primary); color: var(--bg-base); border-radius: 50%; display: flex; align-items: center; justify-content: center; }
    .st-wp-check svg { width: 11px; height: 11px; }

    /* ====== 标签/钥匙状态 ====== */
    .st-key-tag { font-size: 0.68rem; font-weight: 600; padding: 2px 10px; border-radius: var(--radius-full); background: var(--color-primary-ultralight); color: var(--color-primary-deep); }
    .st-key-tag:empty { display: none; }
    .st-key-clear { font-size: 0.68rem; color: var(--color-error); background: none; border: 1px solid var(--color-error); border-radius: var(--radius-full); padding: 2px 10px; cursor: pointer; font-family: var(--font-family); }
    .st-key-clear.on { background: var(--color-error); color: var(--bg-base); }

    /* ====== 空状态 ====== */
    .st-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 64px 24px; text-align: center; color: var(--text-placeholder); gap: 14px; }
    .st-empty svg { width: 56px; height: 56px; opacity: 0.45; color: var(--text-placeholder); }
    .st-empty-title { font-size: 1rem; font-weight: 600; color: var(--text-secondary); }
    .st-empty-desc { font-size: 0.78rem; line-height: 1.5; max-width: 240px; }

    /* ====== 关于页 ====== */
    .st-about-card { background: var(--bg-surface); border: 1px solid var(--border-color); border-radius: var(--radius-xl); padding: 22px 18px; text-align: center; box-shadow: var(--shadow-card); }
    .st-about-logo { width: 64px; height: 64px; margin: 0 auto 14px; border-radius: var(--radius-xl); background: var(--color-primary-ultralight); color: var(--color-primary-deep); display: flex; align-items: center; justify-content: center; box-shadow: var(--shadow-soft); }
    .st-about-logo svg { width: 32px; height: 32px; }
    .st-about-name { font-size: 1.1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 4px; }
    .st-about-version { font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 16px; }
    .st-about-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border-color); font-size: 0.82rem; }
    .st-about-row:last-child { border-bottom: none; }
    .st-about-label { color: var(--text-secondary); }
    .st-about-value { font-weight: 600; color: var(--text-primary); }

    @media (prefers-reduced-motion: reduce) {
      .st-page * { transition: none !important; animation: none !important; }
    }
  `;
  document.head.appendChild(_styleEl);
}

// ============================================
// 主页面渲染（入口列表）
// ============================================
function _render(container) {
  _root = document.createElement('div');
  _root.className = 'app-page st-page';
  _root.innerHTML = `
    <div class="app-header">
      <button class="app-header-back" id="settings-back-btn" aria-label="返回">${ICONS.back}</button>
      <span class="app-header-title">设置</span>
      <div class="app-header-action"></div>
    </div>
    <div class="st-scroll">
      ${_renderEntryList()}
    </div>
  `;
  container.appendChild(_root);
  _bindMainEvents();
}

function _renderEntryList() {
  return GROUPS.map(g => _renderEntry(g)).join('');
}

function _renderEntry(g) {
  const hint = _entryHint(g.key);
  return `
    <div class="st-section">
      <div class="st-capsule" id="st-entry-${g.key}" data-key="${g.key}">
        <div class="st-capsule-icon">${ICONS[g.icon]}</div>
        <div class="st-capsule-body">
          <span class="st-capsule-name">${g.label}</span>
          <span class="st-capsule-hint">${_esc(hint)}</span>
        </div>
        <div class="st-capsule-arrow">${ICONS.chevron}</div>
      </div>
    </div>
  `;
}

function _entryHint(key) {
  switch (key) {
    case 'appearance': {
      const family = getCurrentFamilyTheme();
      const t = getLightThemes().find(x => x.id === family);
      return t ? t.label : '未选择';
    }
    case 'desktop': {
      const iconSize = get('iconSize') || 'standard';
      return iconSize === 'large' ? '大图标模式' : '标准图标';
    }
    case 'notifications': {
      const style = get('desktopNoticeStyle') || 'breathe';
      const map = { off: '桌面提示已关', ring: '小圆环', breathe: '轻呼吸', tag: '新标签' };
      return map[style] || style;
    }
    case 'ai': {
      const cfg = getApiGroupConfig();
      return cfg.baseURL ? `${cfg.baseURL}${cfg.model ? ' · ' + cfg.model : ''}` : '未配置';
    }
    case 'sensory': {
      const eye = get('sensoryEyeEnabled');
      const ear = get('sensoryEarEnabled');
      return `眼睛${eye ? '开' : '关'} · 耳朵${ear ? '开' : '关'}`;
    }
    case 'tts': {
      const mode = get('ttsMode') || 'off';
      const map = { off: '关闭', browser: '浏览器语音', cloud: '云端语音' };
      return map[mode] || mode;
    }
    case 'data':
      return '导入 / 导出 / 清理';
    case 'about':
      return `${SYSTEM_NAME} ${SYSTEM_VERSION}`;
    default:
      return '';
  }
}

// ============================================
// 通用子页机制
// ============================================
function _openSubpage(key) {
  const cfg = GROUPS.find(g => g.key === key);
  if (!cfg) return;

  _currentPage = document.createElement('div');
  _currentPage.className = 'app-page st-page st-subpage';
  _currentPage.innerHTML = `
    <div class="app-header">
      <button class="app-header-back" id="st-subpage-back" aria-label="返回">${ICONS.back}</button>
      <span class="app-header-title">${cfg.label}</span>
      <div class="app-header-action"></div>
    </div>
    <div class="st-subpage-body">
      ${_renderSubpageContent(key)}
    </div>
  `;
  _root.appendChild(_currentPage);
  requestAnimationFrame(() => _currentPage.classList.add('entered'));
  _currentPage.querySelector('#st-subpage-back').addEventListener('click', () => _closeSubpage());
  _bindSubpageContent(key);
}

function _closeSubpage() {
  if (!_currentPage) return;
  _currentPage.classList.remove('entered');
  setTimeout(() => {
    if (_currentPage && _currentPage.parentNode) _currentPage.remove();
    _currentPage = null;
  }, 300);
}

function _renderSubpageContent(key) {
  switch (key) {
    case 'appearance':
      return renderAppearance();
    case 'ai':
      return renderAI();
    case 'about':
      return _renderAbout();
    default:
      return _renderEmptyState();
  }
}

function _bindSubpageContent(key) {
  switch (key) {
    case 'appearance':
      bindAppearance(_currentPage, _root);
      break;
    case 'ai':
      bindAI(_currentPage, _root);
      break;
    case 'about':
      _bindAbout(_currentPage);
      break;
  }
}

function _bindAbout(currentPage) {
  const capsule = currentPage.querySelector('#st-experimental-capsule');
  const switchEl = currentPage.querySelector('#st-experimental-switch');
  if (!capsule || !switchEl) return;

  function _toggle() {
    const next = !switchEl.classList.contains('on');
    set('experimentalMode', next);
    switchEl.classList.toggle('on', next);
    events.emit('settings.changed', { key: 'experimentalMode', value: next });
  }

  capsule.addEventListener('click', (e) => {
    if (e.target.closest('#st-experimental-switch')) return;
    _toggle();
  });
  switchEl.addEventListener('click', (e) => {
    e.stopPropagation();
    _toggle();
  });
}

function _renderEmptyState() {
  return `
    <div class="st-empty">
      <div>${ICONS.sparkles}</div>
      <div class="st-empty-title">功能开发中~</div>
      <div class="st-empty-desc">这一部分还在温柔地长大，等它准备好就来陪你玩啦</div>
    </div>
  `;
}

function _renderAbout() {
  const family = getCurrentFamilyTheme();
  const theme = getLightThemes().find(x => x.id === family);
  const mode = getResolvedMode();
  return `
    <div class="st-section">
      <div class="st-about-card">
        <div class="st-about-logo">${ICONS.info}</div>
        <div class="st-about-name">${SYSTEM_NAME}</div>
        <div class="st-about-version">${SYSTEM_VERSION}</div>
        <div class="st-about-row">
          <span class="st-about-label">系统名</span>
          <span class="st-about-value">${SYSTEM_NAME}</span>
        </div>
        <div class="st-about-row">
          <span class="st-about-label">版本号</span>
          <span class="st-about-value">${SYSTEM_VERSION}</span>
        </div>
        <div class="st-about-row">
          <span class="st-about-label">当前主题</span>
          <span class="st-about-value">${theme ? theme.label : '默认'}</span>
        </div>
        <div class="st-about-row">
          <span class="st-about-label">显示模式</span>
          <span class="st-about-value">${mode === 'dark' ? '柔和深棕灰' : '温柔浅色'}</span>
        </div>
      </div>
    </div>
    <div class="st-section">
      <div class="st-section-head">
        <div class="st-section-icon">${ICONS.sparkles}</div>
        <span class="st-section-title">实验功能</span>
      </div>
      <div class="st-capsule-group">
        <div class="st-capsule" id="st-experimental-capsule">
          <div class="st-capsule-icon">${ICONS.sparkles}</div>
          <div class="st-capsule-body">
            <span class="st-capsule-name">实验模式</span>
            <span class="st-capsule-hint">开启后可能会遇到一些不稳定的小脾气</span>
          </div>
          <div class="st-switch${get('experimentalMode') ? ' on' : ''}" id="st-experimental-switch"></div>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// 主页事件
// ============================================
function _bindMainEvents() {
  _root.querySelector('#settings-back-btn').addEventListener('click', () => {
    events.emit('app:closed', { appId: 'settings' });
  });

  _root.querySelectorAll('[id^="st-entry-"]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.key;
      if (key) _openSubpage(key);
    });
  });
}

function _destroy() {
  if (_styleEl) { _styleEl.remove(); _styleEl = null; }
  const el = document.getElementById('settings-app-styles');
  if (el) el.remove();
  _root = null;
  _currentPage = null;
}

function init(container) {
  _injectStyles();
  _render(container);
  return _destroy;
}

export { init };
export default init;
