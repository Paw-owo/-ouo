// ============================================
// settings/index.js — 设置 APP 入口
// 导出 init(container) → 渲染设置页面 → 返回 destroy
// 布局：主页 = 分组入口列表，每个入口点进去是独立子页
// 第一版真实可用入口：外观与主题 / AI与接口
// 所有开关真实接 config / theme / app-bg 出口，不造假
// 视觉：Soft Cozy Minimal — 纯色 + 小胶囊 + 折叠栏 + 果冻触感 + 滑入子页
// ============================================

import { get, set, reset, getApiGroupConfig, setApiGroupConfig } from '../../core/config.js';
import events from '../../core/events.js';
import { getAvailableThemes, switchTheme, getCurrentTheme } from '../../core/theme.js';
import { BG_TYPE, BG_SCOPE, setBackground, resetBackground } from '../../core/app-bg.js';

let _styleEl = null;
let _root = null;         // 设置主页面（入口列表）
let _currentPage = null;  // 当前打开的子页

// 线条风小图标（viewBox 24x24, stroke=currentColor）
const ICONS = {
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-4.96-4.49-9-10-9z"/></svg>',
  image: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
  plug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 2v6"/><path d="M15 2v6"/><path d="M5 8h14v3a7 7 0 0 1-14 0V8z"/><path d="M12 18v4"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/><line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/><line x1="2" y1="12" x2="4" y2="12"/><line x1="20" y1="12" x2="22" y2="12"/><line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/><line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/></svg>',
  moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
};

function _injectStyles() {
  if (_styleEl) return;
  _styleEl = document.createElement('style');
  _styleEl.id = 'settings-app-styles';
  _styleEl.textContent = `
    /* ====== 容器 ====== */
    .st-page { display: flex; flex-direction: column; height: 100%; }
    /* 返回按钮里的 SVG 不能拦截点击，否则按钮点不动 */
    .st-page .app-header-back svg { pointer-events: none; }
    .st-scroll { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; padding: 0 14px max(20px, env(safe-area-inset-bottom)); }
    .st-section { margin-bottom: 22px; }
    .st-section-head { display: flex; align-items: center; gap: 6px; padding: 0 4px 8px; }
    .st-section-icon { width: 16px; height: 16px; color: var(--text-placeholder); flex-shrink: 0; }
    .st-section-icon svg { width: 100%; height: 100%; }
    .st-section-title { font-size: 0.72rem; font-weight: 600; color: var(--text-placeholder); letter-spacing: 0.04em; }

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
    .st-capsule-hint { font-size: 0.72rem; color: var(--text-placeholder); }
    .st-capsule-arrow { width: 18px; height: 18px; color: var(--text-placeholder); flex-shrink: 0; transition: transform var(--duration-fast) var(--ease-soft); }
    .st-capsule-arrow svg { width: 100%; height: 100%; }
    .st-capsule.expanded .st-capsule-arrow { transform: rotate(90deg); }

    /* 折叠内容区 */
    .st-collapse {
      max-height: 0; overflow: hidden; opacity: 0;
      transition: max-height var(--duration-normal) var(--ease-smooth),
                  opacity var(--duration-fast) var(--ease-smooth);
    }
    .st-collapse.open { max-height: 600px; opacity: 1; }
    .st-collapse-inner { padding: 4px 4px 6px; display: flex; flex-direction: column; gap: 8px; }

    /* ====== 主题小色卡 ====== */
    .st-theme-row { display: flex; gap: 12px; overflow-x: auto; padding: 4px 0 6px; -webkit-overflow-scrolling: touch; scroll-snap-type: x mandatory; }
    .st-theme-chip {
      flex-shrink: 0; width: 88px; scroll-snap-align: start;
      display: flex; flex-direction: column; align-items: center; gap: 6px;
      padding: 8px 6px 10px; border-radius: var(--radius-lg);
      border: 1.5px solid transparent; background: transparent;
      transition: all var(--duration-fast) var(--ease-soft);
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
    .st-field { display: flex; flex-direction: column; gap: 5px; }
    .st-field-label { font-size: 0.8rem; font-weight: 600; color: var(--text-primary); }
    .st-field-hint { font-size: 0.7rem; color: var(--text-placeholder); }
    .st-preview { width: 100%; height: 64px; border-radius: var(--radius-lg); background: var(--bg-base); border: 1.5px dashed var(--border-color); display: flex; align-items: center; justify-content: center; color: var(--text-placeholder); font-size: 0.72rem; background-size: cover; background-position: center; }

    /* ====== 按钮 ====== */
    .st-btn { width: 100%; padding: 13px; min-height: 46px; border: none; border-radius: var(--radius-full); font-size: 0.92rem; font-weight: 600; font-family: var(--font-family); cursor: pointer; transition: transform var(--duration-fast) var(--ease-soft); box-shadow: var(--shadow-soft); }
    .st-btn:active { transform: scale(0.97); }
    .st-btn-primary { background: var(--color-primary); color: var(--bg-base); box-shadow: 0 4px 14px var(--color-primary-light); }
    .st-btn-ghost { background: var(--bg-surface); color: var(--text-primary); border: 1.5px solid var(--border-color); }
    .st-btn-saved { background: var(--color-success) !important; }
    .st-status { text-align: center; font-size: 0.76rem; color: var(--text-placeholder); min-height: 1.2em; transition: color var(--duration-fast) var(--ease-smooth); }
    .st-status.ok { color: var(--color-success); }
    .st-status.err { color: var(--color-error); }

    /* ====== 壁纸类型小段 ====== */
    .st-seg { display: flex; gap: 4px; background: var(--color-primary-ultralight); border-radius: var(--radius-full); padding: 4px; box-shadow: var(--shadow-neu-in); }
    .st-seg-btn { flex: 1; padding: 9px 4px; border: none; background: transparent; border-radius: var(--radius-full); font-size: 0.76rem; color: var(--color-primary-deep); cursor: pointer; font-family: var(--font-family); font-weight: 500; transition: all var(--duration-fast) var(--ease-smooth); }
    .st-seg-btn:active { transform: scale(0.96); }
    .st-seg-btn.active { background: var(--color-primary); color: var(--bg-base); box-shadow: 0 2px 8px var(--color-primary-light); font-weight: 600; }

    /* ====== 通用子页（滑入） ====== */
    .st-subpage { position: absolute; inset: 0; background: var(--bg-base); display: flex; flex-direction: column; z-index: 30; transform: translateX(100%); transition: transform var(--duration-normal) var(--ease-soft); }
    .st-subpage.entered { transform: translateX(0); }
    .st-subpage-body { flex: 1; overflow-y: auto; padding: 0 14px max(20px, env(safe-area-inset-bottom)); }
    .st-key-tag { font-size: 0.68rem; font-weight: 600; padding: 2px 10px; border-radius: var(--radius-full); background: var(--color-primary-ultralight); color: var(--color-primary-deep); }
    .st-key-tag:empty { display: none; }
    .st-key-clear { font-size: 0.68rem; color: var(--color-error); background: none; border: 1px solid var(--color-error); border-radius: var(--radius-full); padding: 2px 10px; cursor: pointer; font-family: var(--font-family); }
    .st-key-clear.on { background: var(--color-error); color: var(--bg-base); }

    @media (prefers-reduced-motion: reduce) {
      * { transition: none !important; animation: none !important; }
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

// ---- 主页入口列表 ----
function _renderEntryList() {
  // 外观入口 hint：当前主题名
  const currentThemeId = getCurrentTheme() || get('theme') || 'berry-cloud';
  const currentTheme = getAvailableThemes().find(t => t.id === currentThemeId);
  const themeHint = currentTheme ? currentTheme.label : '未选择';

  // AI入口 hint：API配置状态（从单一真实来源读）
  const apiCfg = getApiGroupConfig();
  const apiHint = apiCfg.baseURL ? `${apiCfg.baseURL}${apiCfg.model ? ' · ' + apiCfg.model : ''}` : '未配置';

  return `
    <div class="st-section">
      <div class="st-section-head">
        <div class="st-section-icon">${ICONS.palette}</div>
        <span class="st-section-title">个性化</span>
      </div>
      <div class="st-capsule-group">
        <div class="st-capsule" id="st-entry-appearance">
          <div class="st-capsule-icon">${ICONS.palette}</div>
          <div class="st-capsule-body">
            <span class="st-capsule-name">外观与主题</span>
            <span class="st-capsule-hint">${themeHint}</span>
          </div>
          <div class="st-capsule-arrow">${ICONS.chevron}</div>
        </div>
        <div class="st-capsule" id="st-entry-api">
          <div class="st-capsule-icon">${ICONS.plug}</div>
          <div class="st-capsule-body">
            <span class="st-capsule-name">AI与接口</span>
            <span class="st-capsule-hint">${apiHint}</span>
          </div>
          <div class="st-capsule-arrow">${ICONS.chevron}</div>
        </div>
      </div>
    </div>
  `;
}

// ============================================
// 通用子页机制
// ============================================
function _openSubpage(key) {
  const SUBPAGE_CONFIG = {
    appearance: {
      title: '外观与主题',
      render: () => _renderThemeSection() + _renderWallpaperSection(),
      bind: () => { _bindThemeEvents(); _bindWallpaperEvents(); }
    },
    api: {
      title: 'AI与接口',
      render: () => _renderApiContent(),
      bind: () => _bindApiEvents()
    }
  };
  const cfg = SUBPAGE_CONFIG[key];
  if (!cfg) return;

  _currentPage = document.createElement('div');
  _currentPage.className = 'app-page st-page st-subpage';
  _currentPage.innerHTML = `
    <div class="app-header">
      <button class="app-header-back" id="st-subpage-back" aria-label="返回">${ICONS.back}</button>
      <span class="app-header-title">${cfg.title}</span>
      <div class="app-header-action"></div>
    </div>
    <div class="st-subpage-body">
      ${cfg.render()}
    </div>
  `;
  _root.appendChild(_currentPage);
  // 触发滑入动画
  requestAnimationFrame(() => _currentPage.classList.add('entered'));
  // 返回按钮
  _currentPage.querySelector('#st-subpage-back').addEventListener('click', () => _closeSubpage());
  // 内容事件
  cfg.bind();
}

function _closeSubpage() {
  if (!_currentPage) return;
  _currentPage.classList.remove('entered');
  setTimeout(() => {
    if (_currentPage && _currentPage.parentNode) _currentPage.remove();
    _currentPage = null;
  }, 280);
}

// ============================================
// 主页事件
// ============================================
function _bindMainEvents() {
  // 返回
  _root.querySelector('#settings-back-btn').addEventListener('click', () => {
    events.emit('app:closed', { appId: 'settings' });
  });

  // 入口点击 → 打开子页
  _root.querySelector('#st-entry-appearance')?.addEventListener('click', () => _openSubpage('appearance'));
  _root.querySelector('#st-entry-api')?.addEventListener('click', () => _openSubpage('api'));
}

// ============================================
// 外观子页：主题 + 壁纸
// ============================================

// ---- 主题区 ----
function _renderThemeSection() {
  const themes = getAvailableThemes();
  const current = getCurrentTheme() || get('theme') || 'berry-cloud';
  const mode = get('themeMode') || 'manual';

  const chips = themes.map(t => `
    <div class="st-theme-chip${t.id === current ? ' active' : ''}" data-theme="${t.id}">
      <div class="st-theme-card" style="background:${_swatch(t.id)};"></div>
      <div class="st-theme-meta">
        <span class="st-theme-label">${t.label}</span>
        <span class="st-theme-sub">${t.mode === 'dark' ? '夜间·奶霜' : '日间·软糖'}</span>
      </div>
    </div>
  `).join('');

  return `
    <div class="st-section">
      <div class="st-section-head">
        <div class="st-section-icon">${ICONS.palette}</div>
        <span class="st-section-title">主题色</span>
      </div>
      <div class="st-theme-row">${chips}</div>
      <div class="st-capsule-group" style="margin-top:8px;">
        <div class="st-capsule" id="st-theme-mode-row">
          <div class="st-capsule-icon">${mode === 'auto' ? ICONS.sun : ICONS.moon}</div>
          <div class="st-capsule-body">
            <span class="st-capsule-name">跟随系统深浅</span>
            <span class="st-capsule-hint">${mode === 'auto' ? '已开启' : '关闭'}</span>
          </div>
          <div class="st-switch${mode === 'auto' ? ' on' : ''}" id="st-theme-mode-switch"></div>
        </div>
      </div>
    </div>
  `;
}

// 主题代表色（走 theme.js 注入的 --swatch-${id} 变量，不硬编码色值）
function _swatch(id) {
  return `var(--swatch-${id}, var(--color-primary))`;
}

// ---- 壁纸区（折叠） ----
function _renderWallpaperSection() {
  const wallpaper = get('wallpaper');
  const sync = get('wallpaperSync');
  const lsBlur = get('lockscreenBlur');
  const lockWp = get('lockscreenWallpaper');
  const deskBg = wallpaper || { type: BG_TYPE.THEME_DEFAULT, value: null };
  const deskType = deskBg.type || BG_TYPE.THEME_DEFAULT;
  const deskValue = deskBg.value || '';

  const segBtns = [
    { id: BG_TYPE.THEME_DEFAULT, label: '主题默认' },
    { id: BG_TYPE.CUSTOM_URL,    label: '图片链接' },
    { id: BG_TYPE.CUSTOM_COLOR,  label: '纯色' }
  ].map(t => `<button class="st-seg-btn${t.id === deskType ? ' active' : ''}" data-bg-type="${t.id}">${t.label}</button>`).join('');

  let inputHtml = '';
  if (deskType === BG_TYPE.CUSTOM_URL) {
    inputHtml = `
      <div class="st-field">
        <label class="st-field-label">壁纸链接</label>
        <input class="st-input" id="st-wp-url" type="text" placeholder="https://..." value="${_esc(deskValue)}" autocomplete="off"/>
        <div class="st-preview" id="st-wp-preview" style="${deskValue ? `background-image:url('${deskValue}')` : ''}">${deskValue ? '' : '预览'}</div>
      </div>`;
  } else if (deskType === BG_TYPE.CUSTOM_COLOR) {
    inputHtml = `
      <div class="st-field">
        <label class="st-field-label">纯色</label>
        <input class="st-input" id="st-wp-color" type="text" placeholder="#FFF4F5" value="${_esc(deskValue)}" autocomplete="off"/>
        <div class="st-preview" id="st-wp-preview" style="${deskValue ? `background:${deskValue}` : ''}">${deskValue ? '' : '预览'}</div>
      </div>`;
  }

  return `
    <div class="st-section">
      <div class="st-section-head">
        <div class="st-section-icon">${ICONS.image}</div>
        <span class="st-section-title">壁纸与背景</span>
      </div>
      <div class="st-capsule-group">
        <div class="st-capsule" id="st-wp-toggle">
          <div class="st-capsule-icon">${ICONS.image}</div>
          <div class="st-capsule-body">
            <span class="st-capsule-name">桌面壁纸</span>
            <span class="st-capsule-hint">${deskType === BG_TYPE.THEME_DEFAULT ? '主题默认' : (deskValue || '未设置')}</span>
          </div>
          <div class="st-capsule-arrow">${ICONS.chevron}</div>
        </div>
        <div class="st-collapse" id="st-wp-collapse">
          <div class="st-collapse-inner">
            <div class="st-seg">${segBtns}</div>
            ${inputHtml}
            <div class="st-row st-capsule" style="border-radius:var(--radius-full);">
              <div class="st-capsule-body" style="flex:1;">
                <span class="st-capsule-name" style="font-size:0.82rem;">锁屏同步桌面</span>
              </div>
              <div class="st-switch${sync ? ' on' : ''}" id="st-wp-sync"></div>
            </div>
            ${!sync ? `
              <div class="st-field">
                <label class="st-field-label">锁屏壁纸链接</label>
                <input class="st-input" id="st-wp-lock" type="text" placeholder="留空用主题默认" value="${_esc(lockWp?.value || '')}" autocomplete="off"/>
              </div>
            ` : ''}
            <div class="st-field">
              <label class="st-field-label">锁屏模糊强度</label>
              <span class="st-field-hint">0-20，越大越模糊</span>
              <input class="st-input" id="st-wp-blur" type="number" min="0" max="20" value="${lsBlur}" autocomplete="off"/>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ---- 主题事件 ----
function _bindThemeEvents() {
  // 主题色卡
  _currentPage.querySelectorAll('.st-theme-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const id = chip.dataset.theme;
      switchTheme(id);
      _currentPage.querySelectorAll('.st-theme-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      // 同步主页入口 hint
      const entryHint = _root.querySelector('#st-entry-appearance .st-capsule-hint');
      if (entryHint) {
        const t = getAvailableThemes().find(t => t.id === id);
        if (t) entryHint.textContent = t.label;
      }
    });
  });

  // 跟随系统开关
  const modeSwitch = _currentPage.querySelector('#st-theme-mode-switch');
  if (modeSwitch) {
    modeSwitch.addEventListener('click', (e) => {
      e.stopPropagation();
      const cur = get('themeMode') || 'manual';
      const next = cur === 'auto' ? 'manual' : 'auto';
      set('themeMode', next);
      modeSwitch.classList.toggle('on', next === 'auto');
      const row = _currentPage.querySelector('#st-theme-mode-row');
      const icon = row.querySelector('.st-capsule-icon');
      icon.innerHTML = next === 'auto' ? ICONS.sun : ICONS.moon;
      row.querySelector('.st-capsule-hint').textContent = next === 'auto' ? '已开启' : '关闭';
      if (next === 'auto' && window.matchMedia) {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const themes = getAvailableThemes();
        const curTheme = getCurrentTheme();
        const curPreset = themes.find(t => t.id === curTheme);
        if (curPreset) {
          const targetMode = isDark ? 'dark' : 'light';
          if (curPreset.mode !== targetMode) {
            const target = themes.find(t => t.mode === targetMode);
            if (target) {
              switchTheme(target.id);
              _currentPage.querySelectorAll('.st-theme-chip').forEach(c => c.classList.toggle('active', c.dataset.theme === target.id));
            }
          }
        }
      }
    });
  }
}

// ---- 壁纸区事件 ----
function _bindWallpaperEvents() {
  // 壁纸折叠
  const wpToggle = _currentPage.querySelector('#st-wp-toggle');
  const wpCollapse = _currentPage.querySelector('#st-wp-collapse');
  if (wpToggle && wpCollapse) {
    wpToggle.addEventListener('click', () => {
      const open = wpCollapse.classList.toggle('open');
      wpToggle.classList.toggle('expanded', open);
    });
  }

  // 类型切换
  _currentPage.querySelectorAll('.st-seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.bgType;
      _currentPage.querySelectorAll('.st-seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const urlInput = _currentPage.querySelector('#st-wp-url');
      const colorInput = _currentPage.querySelector('#st-wp-color');
      let value = null;
      if (type === BG_TYPE.CUSTOM_URL && urlInput) value = urlInput.value.trim() || null;
      if (type === BG_TYPE.CUSTOM_COLOR && colorInput) value = colorInput.value.trim() || null;
      setBackground(BG_SCOPE.DESKTOP, type, value);
      if (get('wallpaperSync')) setBackground(BG_SCOPE.LOCKSCREEN, type, value);
      _rerenderWallpaper();
    });
  });

  // URL 预览
  const urlInput = _currentPage.querySelector('#st-wp-url');
  if (urlInput) {
    urlInput.addEventListener('input', () => {
      const preview = _currentPage.querySelector('#st-wp-preview');
      const val = urlInput.value.trim();
      if (preview) {
        if (val) { preview.style.backgroundImage = `url('${val}')`; preview.textContent = ''; }
        else { preview.style.backgroundImage = ''; preview.textContent = '预览'; }
      }
    });
    urlInput.addEventListener('blur', () => {
      const val = urlInput.value.trim() || null;
      setBackground(BG_SCOPE.DESKTOP, BG_TYPE.CUSTOM_URL, val);
      if (get('wallpaperSync')) setBackground(BG_SCOPE.LOCKSCREEN, BG_TYPE.CUSTOM_URL, val);
      _updateWpHint();
    });
  }

  // 纯色
  const colorInput = _currentPage.querySelector('#st-wp-color');
  if (colorInput) {
    colorInput.addEventListener('input', () => {
      const preview = _currentPage.querySelector('#st-wp-preview');
      const val = colorInput.value.trim();
      if (preview) {
        preview.style.background = val || '';
        if (val) preview.textContent = ''; else preview.textContent = '预览';
      }
    });
    colorInput.addEventListener('blur', () => {
      const val = colorInput.value.trim() || null;
      setBackground(BG_SCOPE.DESKTOP, BG_TYPE.CUSTOM_COLOR, val);
      if (get('wallpaperSync')) setBackground(BG_SCOPE.LOCKSCREEN, BG_TYPE.CUSTOM_COLOR, val);
      _updateWpHint();
    });
  }

  // 同步开关
  const syncSwitch = _currentPage.querySelector('#st-wp-sync');
  if (syncSwitch) {
    syncSwitch.addEventListener('click', (e) => {
      e.stopPropagation();
      const next = !get('wallpaperSync');
      set('wallpaperSync', next);
      syncSwitch.classList.toggle('on', next);
      if (next) {
        const deskBg = get('wallpaper') || { type: BG_TYPE.THEME_DEFAULT, value: null };
        setBackground(BG_SCOPE.LOCKSCREEN, deskBg.type, deskBg.value);
      }
      _rerenderWallpaper();
    });
  }

  // 锁屏壁纸
  const lockInput = _currentPage.querySelector('#st-wp-lock');
  if (lockInput) {
    lockInput.addEventListener('blur', () => {
      const val = lockInput.value.trim() || null;
      if (val) setBackground(BG_SCOPE.LOCKSCREEN, BG_TYPE.CUSTOM_URL, val);
      else resetBackground(BG_SCOPE.LOCKSCREEN);
    });
  }

  // 模糊
  const blurInput = _currentPage.querySelector('#st-wp-blur');
  if (blurInput) {
    blurInput.addEventListener('blur', () => {
      let v = parseInt(blurInput.value, 10);
      if (isNaN(v)) v = 8;
      if (v < 0) v = 0;
      if (v > 20) v = 20;
      blurInput.value = v;
      set('lockscreenBlur', v);
      document.documentElement.style.setProperty('--lockscreen-blur', `${v}px`);
    });
  }
}

// 局部刷新壁纸区（保持折叠展开状态）
function _rerenderWallpaper() {
  const oldSection = Array.from(_currentPage.querySelectorAll('.st-section')).find(s => {
    const t = s.querySelector('.st-section-title');
    return t && t.textContent.includes('壁纸');
  });
  if (!oldSection) return;
  const wasOpen = oldSection.querySelector('.st-collapse')?.classList.contains('open');
  oldSection.outerHTML = _renderWallpaperSection().trim();
  const newSection = Array.from(_currentPage.querySelectorAll('.st-section')).find(s => {
    const t = s.querySelector('.st-section-title');
    return t && t.textContent.includes('壁纸');
  });
  if (newSection && wasOpen) {
    newSection.querySelector('.st-collapse').classList.add('open');
    newSection.querySelector('#st-wp-toggle').classList.add('expanded');
  }
  // 重新绑定壁纸区事件（outerHTML 替换后旧事件丢失）
  _bindWallpaperEvents();
}

function _updateWpHint() {
  const hint = _currentPage.querySelector('#st-wp-toggle .st-capsule-hint');
  if (!hint) return;
  const wp = get('wallpaper');
  if (!wp || wp.type === BG_TYPE.THEME_DEFAULT) hint.textContent = '主题默认';
  else hint.textContent = wp.value || '未设置';
}

// ============================================
// AI子页：API配置
// ============================================
function _renderApiContent() {
  // 从 api_groups 默认分组读（单一真实来源，ai-client.js 也读这里）
  const cfg = getApiGroupConfig();
  const hasKey = !!cfg.apiKey;

  return `
    <div class="st-section">
      <div class="st-section-head">
        <div class="st-section-icon">${ICONS.plug}</div>
        <span class="st-section-title">接口配置</span>
      </div>
      <div class="st-capsule-group">
        <div class="st-capsule" id="st-api-base-toggle" style="cursor:default;">
          <div class="st-capsule-icon">${ICONS.plug}</div>
          <div class="st-capsule-body" style="flex:1;">
            <span class="st-capsule-name" style="font-size:0.82rem;">API Base URL</span>
            <input class="st-input" id="st-api-url" type="text" placeholder="https://api.openai.com" value="${_esc(cfg.baseURL)}" autocomplete="off" style="margin-top:4px;"/>
          </div>
        </div>
        <div class="st-capsule" id="st-api-key-toggle" style="cursor:default;">
          <div class="st-capsule-icon">${ICONS.plug}</div>
          <div class="st-capsule-body" style="flex:1;">
            <div class="st-row" style="margin-bottom:4px;">
              <span class="st-capsule-name" style="font-size:0.82rem;">API Key</span>
              <div style="display:flex;align-items:center;gap:6px;">
                <span class="st-key-tag" id="st-key-status">${hasKey ? '已保存' : '未设置'}</span>
                ${hasKey ? '<button class="st-key-clear" id="st-key-clear-btn" type="button">清除</button>' : ''}
              </div>
            </div>
            <input class="st-input" id="st-api-key" type="password" placeholder="输入新密钥以覆盖" value="" autocomplete="off"/>
          </div>
        </div>
        <div class="st-capsule" id="st-api-model-toggle" style="cursor:default;">
          <div class="st-capsule-icon">${ICONS.plug}</div>
          <div class="st-capsule-body" style="flex:1;">
            <span class="st-capsule-name" style="font-size:0.82rem;">模型名</span>
            <input class="st-input" id="st-api-model" type="text" placeholder="gpt-4o" value="${_esc(cfg.model)}" autocomplete="off" style="margin-top:4px;"/>
          </div>
        </div>
      </div>
    </div>
    <div style="padding:4px 0 8px; display:flex; flex-direction:column; gap:8px;">
      <button class="st-btn st-btn-primary" id="st-api-save">保存配置</button>
      <button class="st-btn st-btn-ghost" id="st-api-test">测试连接</button>
      <div class="st-status" id="st-api-status"></div>
    </div>
  `;
}

function _bindApiEvents() {
  const saveBtn = _currentPage.querySelector('#st-api-save');
  const testBtn = _currentPage.querySelector('#st-api-test');
  const statusEl = _currentPage.querySelector('#st-api-status');
  const urlInput = _currentPage.querySelector('#st-api-url');
  const keyInput = _currentPage.querySelector('#st-api-key');
  const modelInput = _currentPage.querySelector('#st-api-model');
  const keyStatusEl = _currentPage.querySelector('#st-key-status');
  const clearBtn = _currentPage.querySelector('#st-key-clear-btn');

  let _clearRequested = false;

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      _clearRequested = !_clearRequested;
      if (_clearRequested) {
        clearBtn.textContent = '已标记';
        clearBtn.classList.add('on');
        keyStatusEl.textContent = '将清除';
        keyInput.value = '';
        keyInput.disabled = true;
        keyInput.placeholder = '保存后清除';
      } else {
        clearBtn.textContent = '清除';
        clearBtn.classList.remove('on');
        keyStatusEl.textContent = '已保存';
        keyInput.disabled = false;
        keyInput.placeholder = '输入新密钥以覆盖';
      }
    });
  }

  // 构造请求 URL，与 js/ai/ai-client.js 的 _buildRequestURL 完全一致
  // 确保测试连接和实际聊天用同一个 URL
  function _buildRequestURL(baseURL) {
    const base = baseURL.replace(/\/+$/, '');
    if (base.endsWith('/chat/completions') || base.endsWith('/v1/chat/completions')) {
      return base;
    }
    if (base.endsWith('/v1')) {
      return `${base}/chat/completions`;
    }
    return `${base}/v1/chat/completions`;
  }

  testBtn.addEventListener('click', async () => {
    if (testBtn.disabled) return;
    testBtn.disabled = true;
    testBtn.textContent = '测试中...';
    statusEl.textContent = '';
    statusEl.className = 'st-status';

    // 测试用当前表单值；表单空时回退到已保存配置
    const saved = getApiGroupConfig();
    const baseUrl = urlInput.value.trim() || saved.baseURL;
    const apiKey = keyInput.value.trim() || saved.apiKey;
    const model = modelInput.value.trim() || saved.model;

    if (!baseUrl || !apiKey || !model) {
      statusEl.textContent = '先填好地址、密钥和模型哦~';
      statusEl.className = 'st-status err';
      testBtn.disabled = false;
      testBtn.textContent = '测试连接';
      return;
    }

    const url = _buildRequestURL(baseUrl);

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        // max_tokens=1, temperature=0 最小化测试消耗
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'hi' }], max_tokens: 1, temperature: 0 }),
        signal: AbortSignal.timeout(10000)
      });

      if (!resp.ok) {
        // HTTP 错误：401/403 多半是密钥不对，404 多半是地址不对
        if (resp.status === 401 || resp.status === 403) {
          statusEl.textContent = '密钥好像不对呢，再检查一下~';
        } else if (resp.status === 404) {
          statusEl.textContent = '找不到这个地址，看看 URL 对不对~';
        } else {
          statusEl.textContent = '接口没有牵上小手，检查一下地址或密钥哦';
        }
        statusEl.className = 'st-status err';
      } else {
        try {
          const data = await resp.json();
          if (data.error || !data.choices?.[0]?.message) {
            statusEl.textContent = '接口没有牵上小手，检查一下地址或密钥哦';
            statusEl.className = 'st-status err';
          } else {
            statusEl.textContent = '连上啦，小手牵好了~';
            statusEl.className = 'st-status ok';
          }
        } catch {
          statusEl.textContent = '接口没有牵上小手，检查一下地址或密钥哦';
          statusEl.className = 'st-status err';
        }
      }
    } catch (err) {
      // 网络错误 / 超时 / CORS
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        statusEl.textContent = '接口等太久了，可能地址不通~';
      } else {
        statusEl.textContent = '网络连不上，看看地址对不对~';
      }
      statusEl.className = 'st-status err';
      // 不打印密钥，只打印错误类型用于排查
      console.error('[Settings] 测试连接失败:', err.name || err.message);
    }

    testBtn.disabled = false;
    testBtn.textContent = '测试连接';
  });

  saveBtn.addEventListener('click', () => {
    const baseUrl = urlInput.value.trim();
    const keyInputValue = keyInput.value.trim();
    const model = modelInput.value.trim();

    const saved = getApiGroupConfig();
    let apiKey;
    if (keyInputValue) apiKey = keyInputValue;
    else if (_clearRequested) apiKey = '';
    else apiKey = saved.apiKey;

    try {
      // 走统一出口，同步写入 api_groups 默认分组 + 简单键 + default_chat_model
      setApiGroupConfig({ baseURL: baseUrl, apiKey, model });
      _clearRequested = false;

      if (keyStatusEl) {
        keyStatusEl.textContent = apiKey ? '已保存' : '未设置';
      }
      if (clearBtn) {
        clearBtn.textContent = '清除';
        clearBtn.classList.remove('on');
        keyInput.disabled = false;
        keyInput.placeholder = '输入新密钥以覆盖';
      }

      events.emit('settings.changed', { key: 'api', values: { apiBaseUrl: baseUrl, apiModel: model } });
      events.emit('api.changed', { baseUrl, model });

      saveBtn.textContent = '已保存';
      saveBtn.classList.add('saved');
      statusEl.textContent = apiKey ? '配置已保存~' : '已保存（密钥已清除）';
      statusEl.className = 'st-status ok';
      if (!apiKey && clearBtn) clearBtn.style.display = 'none';

      // 同步主页入口 hint
      const mainHint = _root.querySelector('#st-entry-api .st-capsule-hint');
      if (mainHint) mainHint.textContent = baseUrl ? `${baseUrl}${model ? ' · ' + model : ''}` : '未配置';

      setTimeout(() => { saveBtn.textContent = '保存配置'; saveBtn.classList.remove('saved'); }, 1800);
    } catch (err) {
      statusEl.textContent = '保存失败了，再试一次~';
      statusEl.className = 'st-status err';
      console.error('[Settings] 保存失败:', err);
    }
  });
}

// ============================================
// 工具
// ============================================
function _esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
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
