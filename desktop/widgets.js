// ============================================
// widgets.js — 桌面小组件
// 时间组件、天气占位、今日提示、黑胶/音乐小组件
// 组件配置不写死到 desktop.js，留扩展口
// ============================================

import events from '../core/events.js';

let _widgetsEl = null;
let _timeTimer = null;
let _vinylPlaying = false;

// 小组件配置（可扩展）
const WIDGET_CONFIG = [
  { id: 'time',    row: 0, col: 0, span: 1, enabled: true },
  { id: 'weather', row: 0, col: 1, span: 1, enabled: true },
  { id: 'tip',     row: 1, col: 0, span: 2, enabled: true },
  { id: 'vinyl',   row: 2, col: 0, span: 2, enabled: true }
];

// 天气数据（后续可替换为真实数据）
const WEATHER_MOCK = {
  temp: '26°',
  desc: '微风轻拂',
  icon: 'sunny'
};

// 今日提示池
const TIPS = [
  '你笑起来真好看',
  '今天也要记得喝水哦',
  '做一件让心情变好的小事',
  '你值得被温柔对待',
  '偶尔放空也没关系',
  '今天会有好事发生',
  '每一朵云都有自己的形状',
  '你比昨天更可爱了一点'
];

// SVG图标
function _getWeatherIcon(type) {
  const icons = {
    sunny: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
            stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="5"/>
      <line x1="12" y1="1" x2="12" y2="3"/>
      <line x1="12" y1="21" x2="12" y2="23"/>
      <line x1="4.2" y1="4.2" x2="5.6" y2="5.6"/>
      <line x1="18.4" y1="18.4" x2="19.8" y2="19.8"/>
      <line x1="1" y1="12" x2="3" y2="12"/>
      <line x1="21" y1="12" x2="23" y2="12"/>
      <line x1="4.2" y1="19.8" x2="5.6" y2="18.4"/>
      <line x1="18.4" y1="5.6" x2="19.8" y2="4.2"/>
    </svg>`,
    cloudy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
             stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 10h-1.3A5 5 0 0 0 7 10H6a4 4 0 0 0 0 8h12a4 4 0 0 0 0-8z"/>
    </svg>`
  };
  return icons[type] || icons.sunny;
}

function _getTipIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 2l2.5 7.5L22 9l-5.5 2L18 19l-6-3.5L6 19l1.5-7.5L2 9l7.5-.5z"/>
  </svg>`;
}

function _getVinylIcon() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3"/>
    <circle cx="18" cy="16" r="3"/>
  </svg>`;
}

// 时间获取
function _getTimeStr() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function _getDateStr() {
  const now = new Date();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const mo = now.getMonth() + 1;
  const d = now.getDate();
  const w = weekDays[now.getDay()];
  return `${mo}月${d}日 星期${w}`;
}

// 创建时间组件（内容层，不包 widget-card 外壳）
function _renderTimeWidget() {
  return `
    <div class="time-display">${_getTimeStr()}</div>
    <div class="date-display">${_getDateStr()}</div>
  `;
}

// 创建天气组件（内容层，不包 widget-card 外壳）
function _renderWeatherWidget() {
  return `
    <div class="weather-icon">${_getWeatherIcon(WEATHER_MOCK.icon)}</div>
    <div class="weather-info">
      <div class="weather-temp">${WEATHER_MOCK.temp}</div>
      <div class="weather-desc">${WEATHER_MOCK.desc}</div>
    </div>
  `;
}

// 创建今日提示（内容层，不包 widget-card 外壳）
function _renderTipWidget() {
  const tip = TIPS[Math.floor(Math.random() * TIPS.length)];
  return `
    <div class="tip-icon">${_getTipIcon()}</div>
    <div class="tip-text">${tip}</div>
  `;
}

// 创建黑胶组件（内容层，不包 widget-card 外壳）
function _renderVinylWidget() {
  return `
    <div class="vinyl-disc${_vinylPlaying ? ' playing' : ''}">
      ${_getVinylIcon()}
      <div class="disc-hole"></div>
    </div>
    <div class="vinyl-info">
      <div class="vinyl-title">正在播放</div>
      <div class="vinyl-artist">轻音乐</div>
    </div>
  `;
}

// 构建布局
function _buildWidgetsHTML() {
  const enabled = WIDGET_CONFIG.filter(w => w.enabled);

  // 按行分组
  const rows = {};
  for (const w of enabled) {
    if (!rows[w.row]) rows[w.row] = [];
    rows[w.row].push(w);
  }

  let html = '';
  for (const rowIdx of Object.keys(rows).sort((a, b) => a - b)) {
    const rowWidgets = rows[rowIdx].sort((a, b) => a.col - b.col);
    const isFullWidth = rowWidgets.length === 1 && rowWidgets[0].span === 2;

    if (isFullWidth) {
      html += `<div class="widget-card full-width widget-${rowWidgets[0].id}" data-widget="${rowWidgets[0].id}">`;
      html += _getWidgetContent(rowWidgets[0].id);
      html += '</div>';
    } else {
      html += '<div class="widget-row">';
      for (const w of rowWidgets) {
        html += `<div class="widget-card widget-${w.id}" data-widget="${w.id}">`;
        html += _getWidgetContent(w.id);
        html += '</div>';
      }
      html += '</div>';
    }
  }

  return html;
}

function _getWidgetContent(id) {
  switch (id) {
    case 'time':    return _renderTimeWidget();
    case 'weather': return _renderWeatherWidget();
    case 'tip':     return _renderTipWidget();
    case 'vinyl':   return _renderVinylWidget();
    default:        return '';
  }
}

// 渲染小组件
export function renderWidgets(container) {
  if (_widgetsEl && _widgetsEl.parentNode) {
    _widgetsEl.parentNode.removeChild(_widgetsEl);
  }

  _widgetsEl = document.createElement('div');
  _widgetsEl.className = 'widgets-area';
  _widgetsEl.innerHTML = _buildWidgetsHTML();
  container.appendChild(_widgetsEl);

  // 绑定交互
  _bindWidgetEvents();
  _startTimeUpdater();
}

// 绑定小组件交互
function _bindWidgetEvents() {
  if (!_widgetsEl) return;

  const vinylCard = _widgetsEl.querySelector('[data-widget="vinyl"]');
  if (vinylCard) {
    vinylCard.addEventListener('click', () => {
      _vinylPlaying = !_vinylPlaying;
      const disc = vinylCard.querySelector('.vinyl-disc');
      if (disc) {
        if (_vinylPlaying) {
          disc.classList.add('playing');
        } else {
          disc.classList.remove('playing');
        }
      }
    });
  }
}

// 更新时间
function _startTimeUpdater() {
  if (_timeTimer) clearInterval(_timeTimer);
  _timeTimer = setInterval(() => {
    if (!_widgetsEl) return;
    const timeDisplay = _widgetsEl.querySelector('.time-display');
    const dateDisplay = _widgetsEl.querySelector('.date-display');
    if (timeDisplay) timeDisplay.textContent = _getTimeStr();
    if (dateDisplay) dateDisplay.textContent = _getDateStr();
  }, 30000);
}

// 销毁
export function destroyWidgets() {
  if (_timeTimer) {
    clearInterval(_timeTimer);
    _timeTimer = null;
  }
  if (_widgetsEl && _widgetsEl.parentNode) {
    _widgetsEl.parentNode.removeChild(_widgetsEl);
    _widgetsEl = null;
  }
}

// 获取小组件配置（供设置页读取）
export function getWidgetConfig() {
  return [...WIDGET_CONFIG];
}

// 更新小组件配置
export function updateWidgetConfig(newConfig) {
  for (const item of newConfig) {
    const existing = WIDGET_CONFIG.find(w => w.id === item.id);
    if (existing) {
      Object.assign(existing, item);
    }
  }
}

// 主题切换时刷新
events.on('theme:changed', () => {
  if (_widgetsEl && _widgetsEl.parentNode) {
    const container = _widgetsEl.parentNode;
    renderWidgets(container);
  }
});