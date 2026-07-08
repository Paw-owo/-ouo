// ============================================
// settings/appearance.js — 外观与个性化页面
// 真实功能：主题色、深浅模式、壁纸、图标/字体大小
// ============================================

import { get, set } from '../../core/config.js';
import events from '../../core/events.js';
import {
  getLightThemes,
  getCurrentFamilyTheme,
  getResolvedMode,
  switchTheme,
  setThemeMode,
  applySizeSettings
} from '../../core/theme.js';
import {
  BG_TYPE,
  BG_SCOPE,
  WALLPAPER_PRESETS,
  setBackground,
  resetBackground
} from '../../core/app-bg.js';
import { ICONS, _esc } from './icons.js';

// ---- 渲染 ----
function renderAppearance() {
  return `
    ${_renderThemeSection()}
    ${_renderModeSection()}
    ${_renderDisplaySection()}
    ${_renderWallpaperSection()}
  `;
}

// 主题色方案（只展示浅色家族主题）
function _renderThemeSection() {
  const themes = getLightThemes();
  const currentFamily = getCurrentFamilyTheme();

  const chips = themes.map(t => `
    <div class="st-theme-chip${t.id === currentFamily ? ' active' : ''}" data-theme="${t.id}">
      <div class="st-theme-card" style="background:${_swatch(t.id)};"></div>
      <div class="st-theme-meta">
        <span class="st-theme-label">${t.label}</span>
        <span class="st-theme-sub">棉花糖</span>
      </div>
    </div>
  `).join('');

  return `
    <div class="st-section">
      <div class="st-section-head">
        <div class="st-section-icon">${ICONS.palette}</div>
        <span class="st-section-title">主题色方案</span>
      </div>
      <div class="st-theme-row">${chips}</div>
    </div>
  `;
}

function _swatch(id) {
  return `var(--swatch-${id}, var(--color-primary))`;
}

// 深浅模式
function _renderModeSection() {
  const mode = get('themeMode') || 'light';
  const resolved = getResolvedMode();
  const options = [
    { id: 'light', label: '浅色', icon: ICONS.sun },
    { id: 'dark', label: '深色', icon: ICONS.moon },
    { id: 'auto', label: '跟随系统', icon: ICONS.monitor }
  ];

  return `
    <div class="st-section">
      <div class="st-section-head">
        <div class="st-section-icon">${resolved === 'dark' ? ICONS.moon : ICONS.sun}</div>
        <span class="st-section-title">显示模式</span>
      </div>
      <div class="st-seg" id="st-mode-seg">
        ${options.map(o => `
          <button class="st-seg-btn${mode === o.id ? ' active' : ''}" data-mode="${o.id}">
            ${o.label}
          </button>
        `).join('')}
      </div>
      <p class="st-section-hint">当前为 ${resolved === 'dark' ? '柔和深棕灰' : '温柔浅色'}模式</p>
    </div>
  `;
}

// 显示大小
function _renderDisplaySection() {
  const iconSize = get('iconSize') || 'standard';
  const fontSize = get('fontSize') || 'normal';

  return `
    <div class="st-section">
      <div class="st-section-head">
        <div class="st-section-icon">${ICONS.type}</div>
        <span class="st-section-title">显示大小</span>
      </div>
      <div class="st-capsule-group">
        <div class="st-capsule" style="cursor:default;">
          <div class="st-capsule-icon">${ICONS.grid}</div>
          <div class="st-capsule-body">
            <span class="st-capsule-name">图标大小</span>
            <span class="st-capsule-hint">桌面与 Dock 图标缩放</span>
          </div>
        </div>
        <div class="st-seg" id="st-icon-size-seg">
          <button class="st-seg-btn${iconSize === 'standard' ? ' active' : ''}" data-size="standard">标准</button>
          <button class="st-seg-btn${iconSize === 'large' ? ' active' : ''}" data-size="large">大图标</button>
        </div>
      </div>
      <div class="st-capsule-group" style="margin-top:10px;">
        <div class="st-capsule" style="cursor:default;">
          <div class="st-capsule-icon">${ICONS.type}</div>
          <div class="st-capsule-body">
            <span class="st-capsule-name">字体大小</span>
            <span class="st-capsule-hint">全局文字缩放</span>
          </div>
        </div>
        <div class="st-seg" id="st-font-size-seg">
          <button class="st-seg-btn${fontSize === 'small' ? ' active' : ''}" data-size="small">小</button>
          <button class="st-seg-btn${fontSize === 'normal' ? ' active' : ''}" data-size="normal">标准</button>
          <button class="st-seg-btn${fontSize === 'large' ? ' active' : ''}" data-size="large">大</button>
        </div>
      </div>
    </div>
  `;
}

// 壁纸（折叠，低频）
function _renderWallpaperSection() {
  const wp = get('wallpaper') || { type: BG_TYPE.THEME_DEFAULT, value: null };
  const wpType = wp.type || BG_TYPE.THEME_DEFAULT;
  const wpValue = wp.value || '';

  const types = [
    { id: BG_TYPE.THEME_DEFAULT, label: '主题默认' },
    { id: BG_TYPE.PRESET, label: '预设' },
    { id: BG_TYPE.CUSTOM_URL, label: '图片链接' },
    { id: BG_TYPE.CUSTOM_UPLOAD, label: '本地上传' },
    { id: BG_TYPE.CUSTOM_COLOR, label: '纯色' }
  ];

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
            <span class="st-capsule-hint" id="st-wp-hint">${_wpHint(wp)}</span>
          </div>
          <div class="st-capsule-arrow">${ICONS.chevron}</div>
        </div>
        <div class="st-collapse" id="st-wp-collapse">
          <div class="st-collapse-inner">
            <div class="st-seg" id="st-wp-type-seg">
              ${types.map(t => `
                <button class="st-seg-btn${wpType === t.id ? ' active' : ''}" data-type="${t.id}">${t.label}</button>
              `).join('')}
            </div>
            ${_renderWallpaperInput(wpType, wpValue)}
          </div>
        </div>
      </div>
    </div>
  `;
}

function _wpHint(wp) {
  if (!wp || wp.type === BG_TYPE.THEME_DEFAULT) return '跟随主题默认';
  if (wp.type === BG_TYPE.PRESET) {
    const p = WALLPAPER_PRESETS.find(x => x.id === wp.value);
    return p ? p.label : '预设壁纸';
  }
  if (wp.type === BG_TYPE.CUSTOM_URL) return wp.value ? '图片链接' : '未填写链接';
  if (wp.type === BG_TYPE.CUSTOM_UPLOAD) return '本地图片';
  if (wp.type === BG_TYPE.CUSTOM_COLOR) return wp.value || '未填色值';
  return '自定义';
}

function _renderWallpaperInput(type, value) {
  const preview = _wpPreviewStyle(type, value);

  if (type === BG_TYPE.THEME_DEFAULT) {
    return `<div class="st-preview" id="st-wp-preview" style="${preview}">主题默认背景</div>`;
  }

  if (type === BG_TYPE.PRESET) {
    const cards = WALLPAPER_PRESETS.map(p => `
      <div class="st-wp-preset${value === p.id ? ' active' : ''}" data-id="${p.id}" title="${p.label}" style="background:${p.value};">
        <span class="st-wp-preset-label">${p.label}</span>
        ${value === p.id ? `<div class="st-wp-check">${ICONS.check}</div>` : ''}
      </div>
    `).join('');
    return `
      <div class="st-preview" id="st-wp-preview" style="${preview}"></div>
      <div class="st-wp-grid">${cards}</div>
    `;
  }

  if (type === BG_TYPE.CUSTOM_URL) {
    return `
      <div class="st-preview" id="st-wp-preview" style="${preview}">${value ? '' : '预览'}</div>
      <div class="st-field">
        <label class="st-field-label">图片链接</label>
        <input class="st-input" id="st-wp-url" type="text" placeholder="https://..." value="${_esc(value)}" autocomplete="off"/>
      </div>
    `;
  }

  if (type === BG_TYPE.CUSTOM_UPLOAD) {
    return `
      <div class="st-preview" id="st-wp-preview" style="${preview}">${value ? '' : '预览'}</div>
      <label class="st-btn st-btn-ghost" style="display:flex;align-items:center;justify-content:center;gap:6px;" for="st-wp-file">
        ${ICONS.upload} 选择本地图片
      </label>
      <input id="st-wp-file" type="file" accept="image/*" style="position:absolute;opacity:0;width:0;height:0;"/>
    `;
  }

  if (type === BG_TYPE.CUSTOM_COLOR) {
    return `
      <div class="st-preview" id="st-wp-preview" style="${preview}">${value ? '' : '预览'}</div>
      <div class="st-field">
        <label class="st-field-label">颜色值</label>
        <input class="st-input" id="st-wp-color" type="text" placeholder="#FFF4F5 或 rgba(...)" value="${_esc(value)}" autocomplete="off"/>
      </div>
    `;
  }

  return '';
}

function _cssUrl(value) {
  return `url('${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')`;
}

function _wpPreviewStyle(type, value) {
  if (!value && type !== BG_TYPE.THEME_DEFAULT) return '';
  if (type === BG_TYPE.PRESET) {
    const p = WALLPAPER_PRESETS.find(x => x.id === value);
    return p ? `background:${p.value};` : '';
  }
  if (type === BG_TYPE.CUSTOM_URL) return value ? `background-image:${_cssUrl(value)}; background-size:cover; background-position:center;` : '';
  if (type === BG_TYPE.CUSTOM_UPLOAD) return value ? `background-image:${_cssUrl(value)}; background-size:cover; background-position:center;` : '';
  if (type === BG_TYPE.CUSTOM_COLOR) return value ? `background:${_esc(value)};` : '';
  return '';
}

// ---- 事件绑定 ----
function bindAppearance(currentPage, root) {
  _bindThemeChips(currentPage, root);
  _bindModeSeg(currentPage, root);
  _bindDisplaySeg(currentPage);
  _bindWallpaper(currentPage);
}

function _bindThemeChips(currentPage, root) {
  currentPage.querySelectorAll('.st-theme-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const id = chip.dataset.theme;
      switchTheme(id);
      currentPage.querySelectorAll('.st-theme-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      // 同步首页入口 hint
      const themes = getLightThemes();
      const t = themes.find(x => x.id === id);
      const entryHint = root?.querySelector('#st-entry-appearance .st-capsule-hint');
      if (entryHint && t) entryHint.textContent = t.label;
    });
  });
}

function _bindModeSeg(currentPage, root) {
  const seg = currentPage.querySelector('#st-mode-seg');
  if (!seg) return;
  seg.querySelectorAll('.st-seg-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      setThemeMode(mode);
      seg.querySelectorAll('.st-seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      // 刷新“当前为”文案
      const hint = currentPage.querySelector('.st-section-hint');
      if (hint) {
        const resolved = getResolvedMode();
        hint.textContent = `当前为 ${resolved === 'dark' ? '柔和深棕灰' : '温柔浅色'}模式`;
      }
      // 主题色卡可能因深浅切换而高亮变化，重渲染主题区
      const section = currentPage.querySelector('.st-theme-row')?.closest('.st-section');
      if (section) {
        section.outerHTML = _renderThemeSection();
        _bindThemeChips(currentPage, root);
      }
    });
  });
}

function _bindDisplaySeg(currentPage) {
  const iconSeg = currentPage.querySelector('#st-icon-size-seg');
  if (iconSeg) {
    iconSeg.querySelectorAll('.st-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const size = btn.dataset.size;
        set('iconSize', size);
        applySizeSettings();
        iconSeg.querySelectorAll('.st-seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  const fontSeg = currentPage.querySelector('#st-font-size-seg');
  if (fontSeg) {
    fontSeg.querySelectorAll('.st-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const size = btn.dataset.size;
        set('fontSize', size);
        applySizeSettings();
        fontSeg.querySelectorAll('.st-seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }
}

function _bindWallpaper(currentPage) {
  const toggle = currentPage.querySelector('#st-wp-toggle');
  const collapse = currentPage.querySelector('#st-wp-collapse');
  if (toggle && collapse) {
    toggle.addEventListener('click', () => {
      const open = collapse.classList.toggle('open');
      toggle.classList.toggle('expanded', open);
    });
  }

  // 类型切换
  const typeSeg = currentPage.querySelector('#st-wp-type-seg');
  if (typeSeg) {
    typeSeg.querySelectorAll('.st-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        // 切换类型时先重置为背景默认，等待用户选择
        if (type === BG_TYPE.THEME_DEFAULT) {
          resetBackground(BG_SCOPE.DESKTOP);
        } else {
          setBackground(BG_SCOPE.DESKTOP, type, null);
        }
        _rerenderWallpaperPanel(currentPage);
      });
    });
  }

  _bindWallpaperInputs(currentPage);
}

function _debounce(fn, wait = 300) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => { fn(...args); t = null; }, wait);
  };
}

function _bindWallpaperInputs(currentPage) {
  const wp = get('wallpaper') || { type: BG_TYPE.THEME_DEFAULT, value: null };

  // 预设选择
  currentPage.querySelectorAll('.st-wp-preset').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const p = WALLPAPER_PRESETS.find(x => x.id === id);
      if (!p) return;
      setBackground(BG_SCOPE.DESKTOP, BG_TYPE.PRESET, p.id);
      _rerenderWallpaperPanel(currentPage);
    });
  });

  // URL
  const urlInput = currentPage.querySelector('#st-wp-url');
  if (urlInput) {
    const _saveUrl = () => {
      const val = urlInput.value.trim() || null;
      setBackground(BG_SCOPE.DESKTOP, BG_TYPE.CUSTOM_URL, val);
      _updateWpHint(currentPage);
    };
    const _debouncedSaveUrl = _debounce(_saveUrl, 400);
    urlInput.addEventListener('input', () => {
      const preview = currentPage.querySelector('#st-wp-preview');
      const val = urlInput.value.trim();
      if (preview) {
        preview.style.backgroundImage = val ? _cssUrl(val) : '';
        preview.style.backgroundSize = 'cover';
        preview.style.backgroundPosition = 'center';
        preview.textContent = val ? '' : '预览';
      }
      _debouncedSaveUrl();
    });
    urlInput.addEventListener('blur', _saveUrl);
  }

  // 本地上传
  const fileInput = currentPage.querySelector('#st-wp-file');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        setBackground(BG_SCOPE.DESKTOP, BG_TYPE.CUSTOM_UPLOAD, dataUrl);
        _rerenderWallpaperPanel(currentPage);
      };
      reader.readAsDataURL(file);
    });
  }

  // 纯色
  const colorInput = currentPage.querySelector('#st-wp-color');
  if (colorInput) {
    const _saveColor = () => {
      const val = colorInput.value.trim() || null;
      setBackground(BG_SCOPE.DESKTOP, BG_TYPE.CUSTOM_COLOR, val);
      _updateWpHint(currentPage);
    };
    const _debouncedSaveColor = _debounce(_saveColor, 400);
    colorInput.addEventListener('input', () => {
      const preview = currentPage.querySelector('#st-wp-preview');
      const val = colorInput.value.trim();
      if (preview) {
        preview.style.background = val || '';
        preview.textContent = val ? '' : '预览';
      }
      _debouncedSaveColor();
    });
    colorInput.addEventListener('blur', _saveColor);
  }
}

function _rerenderWallpaperPanel(currentPage) {
  const old = currentPage.querySelector('#st-wp-collapse');
  if (!old) return;
  const wasOpen = old.classList.contains('open');
  const wp = get('wallpaper') || { type: BG_TYPE.THEME_DEFAULT, value: null };
  // 重建整个壁纸区，保留展开状态
  const section = old.closest('.st-section');
  if (!section) return;
  section.outerHTML = _renderWallpaperSection();
  const newCollapse = currentPage.querySelector('#st-wp-collapse');
  if (newCollapse && wasOpen) {
    newCollapse.classList.add('open');
    currentPage.querySelector('#st-wp-toggle')?.classList.add('expanded');
  }
  _bindWallpaper(currentPage);
}

function _updateWpHint(currentPage) {
  const hint = currentPage.querySelector('#st-wp-hint');
  if (!hint) return;
  const wp = get('wallpaper') || { type: BG_TYPE.THEME_DEFAULT, value: null };
  hint.textContent = _wpHint(wp);
}

export { renderAppearance, bindAppearance };
