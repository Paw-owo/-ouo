// apps/weather/index.js
// 天气 App——软萌少女风 PWA「泡泡」。
// 功能：
//   1) 城市存 localStorage（KEYS.weatherCity），用户可输入切换
//   2) 优先联网 open-meteo 免费无 key API（地理编码 + 天气查询）
//   3) 联网失败/超时(5s) -> 本地模拟（按城市名 hash 生成固定天气，同城市同结果）
//   4) 30 分钟缓存（KEYS.weatherCache），缓存内直接复用
//   5) 顶部大卡片：城市 + 天气图标 + 温度(大字) + 描述 + 贴心建议
//   6) 刷新 / 换城市按钮
//   7) 空状态文案
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { KEYS } from '../../core/storage-keys.js';
import { getData, setData } from '../../core/storage.js';
import { showToast, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle } from '../../core/util.js';
import { applyAppBg } from '../../core/app-bg.js';

let containerEl = null;

// 我的状态：城市、天气数据、是否加载中、是否离线模拟
let state = {
  city: '',
  data: null,       // { temperature_2m, weather_code, name }
  isLoading: false,
  isOffline: false
};

// ════════════════════════════════════════
// 样式（自定义部分，全走 CSS 变量）
// ════════════════════════════════════════

injectStyle('app-weather-style', `
  .weather-card{ text-align:center; padding:32px 20px 24px; }
  .weather-city{ font-size:var(--font-size-base); color:var(--text-secondary); margin-bottom:14px; letter-spacing:0.3px }
  .weather-icon{ display:flex; justify-content:center; color:var(--accent); margin-bottom:6px }
  .weather-temp{ font-size:64px; font-weight:700; color:var(--text-primary); line-height:1.1; margin-bottom:2px }
  .weather-desc{ font-size:var(--font-size-title); color:var(--text-primary); margin-bottom:14px; font-weight:500 }
  .weather-advice{ font-size:var(--font-size-base); color:var(--text-primary); background:color-mix(in srgb,var(--accent-light) 35%,transparent); padding:8px 16px; border-radius:999px; display:inline-block; max-width:90% }
  .weather-offline{ font-size:var(--font-size-small); color:var(--text-hint); margin-top:14px }
  .weather-actions{ display:flex; gap:10px; margin-bottom:18px }
  .weather-actions .btn{ flex:1; justify-content:center }
  .weather-loading{ text-align:center; padding:40px 20px; color:var(--text-hint); font-size:var(--font-size-small) }
  .weather-loading-dots{ display:flex; justify-content:center; gap:6px; margin-bottom:12px }
  .weather-loading-dot{ width:8px; height:8px; border-radius:50%; background:var(--accent); animation:weatherPulse 1s ease-in-out infinite }
  .weather-loading-dot:nth-child(2){ animation-delay:.2s }
  .weather-loading-dot:nth-child(3){ animation-delay:.4s }
  @keyframes weatherPulse{ 0%,80%,100%{ transform:scale(.6); opacity:.4 } 40%{ transform:scale(1); opacity:1 } }
  .weather-foot{ font-size:var(--font-size-small); color:var(--text-hint); text-align:center; padding:0 20px 24px; line-height:1.6 }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="weather-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">天气</div>
      <span style="width:36px"></span>
    </div>
    <div class="app-body" id="weather-body"></div>
  `;
  container.querySelector('#weather-back').addEventListener('click', () => bus.emit('router:home'));
  await render();
  applyAppBg(container, 'weather');
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 主渲染
// ════════════════════════════════════════

async function render() {
  const body = containerEl.querySelector('#weather-body');
  if (!body) return;

  state.city = String(getData(KEYS.weatherCity, '') || '').trim();

  // 还没设城市 -> 空状态
  if (!state.city) {
    body.innerHTML = `
      <div class="card">
        <div class="empty-state">
          <div class="empty-state-icon">${createIcon('weather', 48).outerHTML}</div>
          <div class="empty-state-text">告诉我你在哪个城市嘛，我帮你看看天气</div>
        </div>
        <button class="btn primary block" id="weather-set-city" style="margin-top:16px">${createIcon('edit', 18).outerHTML} 设置城市</button>
      </div>
    `;
    const setBtn = body.querySelector('#weather-set-city');
    if (setBtn) setBtn.addEventListener('click', openCitySheet);
    return;
  }

  // 有城市 -> 主界面骨架
  body.innerHTML = `
    <div id="weather-card-wrap"></div>
    <div class="weather-actions">
      <button class="btn primary" id="weather-refresh">${createIcon('weather', 18).outerHTML} 刷新看看</button>
      <button class="btn ghost" id="weather-change">${createIcon('edit', 18).outerHTML} 换个城市</button>
    </div>
    <div class="weather-foot">数据来自 open-meteo，每 30 分钟更新一次。没网的时候我会偷偷猜一个嘛。</div>
  `;
  const refreshBtn = body.querySelector('#weather-refresh');
  const changeBtn = body.querySelector('#weather-change');
  if (refreshBtn) refreshBtn.addEventListener('click', () => loadWeather());
  if (changeBtn) changeBtn.addEventListener('click', openCitySheet);

  // 先用缓存渲染（30 分钟内有效）
  const cached = getData(KEYS.weatherCache, null);
  if (cached && cached.city === state.city && isCacheValid(cached)) {
    state.data = cached.data;
    state.isOffline = !!cached.isOffline;
    renderWeatherCard();
  } else {
    await loadWeather();
  }
}

function renderWeatherCard() {
  const wrap = containerEl.querySelector('#weather-card-wrap');
  if (!wrap) return;

  // 加载中或还没数据
  if (state.isLoading || !state.data) {
    wrap.innerHTML = `
      <div class="card weather-card">
        <div class="weather-city">${escapeHtml(state.city)}</div>
        <div class="weather-loading">
          <div class="weather-loading-dots">
            <span class="weather-loading-dot"></span>
            <span class="weather-loading-dot"></span>
            <span class="weather-loading-dot"></span>
          </div>
          <div>我看看天气哦，等一下嘛...</div>
        </div>
      </div>
    `;
    return;
  }

  const { temperature_2m: temp, weather_code: code, name } = state.data;
  const night = isNightTime();
  const info = weatherCodeInfo(code, night);
  const advice = weatherAdvice(code, temp);
  const displayName = name && name !== state.city
    ? `${escapeHtml(state.city)} · ${escapeHtml(name)}`
    : escapeHtml(state.city);

  wrap.innerHTML = `
    <div class="card weather-card">
      <div class="weather-city">${displayName}</div>
      <div class="weather-icon">${createIcon(info.icon, 64).outerHTML}</div>
      <div class="weather-temp">${Math.round(temp)}°</div>
      <div class="weather-desc">${escapeHtml(info.text)}</div>
      <div class="weather-advice">${escapeHtml(advice)}</div>
      ${state.isOffline ? '<div class="weather-offline">（没网的时候我猜的，仅供参考啦）</div>' : ''}
    </div>
  `;
}

// ════════════════════════════════════════
// 加载天气（联网优先，失败走本地模拟）
// ════════════════════════════════════════

async function loadWeather() {
  if (!containerEl) return;
  const city = state.city; // 捕获当前城市，防止切换后串台
  state.isLoading = true;
  renderWeatherCard();

  let data;
  let isOffline = false;

  try {
    data = await fetchWeatherData(city);
  } catch (e) {
    // 联网失败/超时/找不到城市 -> 本地模拟
    data = simulateWeather(city);
    isOffline = true;
    showToast('没网也能看，我先猜一个嘛', 'default', 2200);
  }

  // 城市已切换或已卸载，丢弃这次结果
  if (!containerEl || state.city !== city) {
    state.isLoading = false;
    return;
  }

  state.data = data;
  state.isOffline = isOffline;
  state.isLoading = false;

  // 写缓存
  setData(KEYS.weatherCache, {
    city,
    data,
    fetchedAt: new Date().toISOString(),
    isOffline
  });

  renderWeatherCard();
}

async function fetchWeatherData(city) {
  // 1. 地理编码：城市名 -> 经纬度
  const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh`;
  const geoResp = await fetchWithTimeout(geoUrl, 5000);
  if (!geoResp.ok) throw new Error('地理编码请求失败');
  const geo = await geoResp.json();
  if (!geo.results || !geo.results.length) throw new Error('找不到这个城市');
  const { latitude, longitude, name } = geo.results[0];

  // 2. 天气查询
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`;
  const wResp = await fetchWithTimeout(weatherUrl, 5000);
  if (!wResp.ok) throw new Error('天气请求失败');
  const w = await wResp.json();
  if (!w.current) throw new Error('天气数据为空');

  return {
    temperature_2m: w.current.temperature_2m,
    weather_code: w.current.weather_code,
    name: name || city
  };
}

function fetchWithTimeout(url, ms) {
  // 不支持 AbortController 就裸 fetch（极少见）
  if (typeof AbortController === 'undefined') {
    return fetch(url);
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal }).finally(() => clearTimeout(timer));
}

// ════════════════════════════════════════
// 本地模拟（同城市同结果）
// ════════════════════════════════════════

function hashCity(city) {
  let h = 0;
  for (let i = 0; i < city.length; i++) {
    h = ((h << 5) - h + city.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function simulateWeather(city) {
  const h = hashCity(city);
  // 温度 -5 ~ 30
  const tempC = (h % 36) - 5;
  // 天气码，晴天多一点更讨喜
  const codes = [0, 0, 0, 0, 1, 2, 2, 3, 45, 51, 61, 61, 71, 80, 95];
  const code = codes[h % codes.length];
  return { temperature_2m: tempC, weather_code: code, name: city };
}

// ════════════════════════════════════════
// 天气码 -> 中文 + 图标 + 建议
// ════════════════════════════════════════

function weatherCodeInfo(code, isNight) {
  if (code === 0) return { text: '晴', icon: isNight ? 'moon' : 'sun' };
  if (code === 1) return { text: '少云', icon: isNight ? 'moon' : 'sun' };
  if (code === 2) return { text: '多云', icon: 'weather' };
  if (code === 3) return { text: '阴', icon: 'weather' };
  if (code === 45 || code === 48) return { text: '雾', icon: 'weather' };
  if (code >= 51 && code <= 57) return { text: '毛毛雨', icon: 'weather' };
  if (code >= 61 && code <= 65) return { text: '小雨', icon: 'weather' };
  if (code === 66 || code === 67) return { text: '冻雨', icon: 'weather' };
  if (code >= 71 && code <= 77) return { text: '雪', icon: 'weather' };
  if (code >= 80 && code <= 82) return { text: '阵雨', icon: 'weather' };
  if (code === 85 || code === 86) return { text: '阵雪', icon: 'weather' };
  if (code >= 95 && code <= 99) return { text: '雷雨', icon: 'weather' };
  return { text: '未知', icon: 'weather' };
}

function weatherAdvice(code, tempC) {
  // 温度极端时优先提醒
  if (typeof tempC === 'number' && Number.isFinite(tempC)) {
    if (tempC <= 5) return '穿厚点，别冻着啦';
    if (tempC >= 32) return '太热啦，多喝水别中暑';
  }
  if (code === 0) return '出门记得防晒哦';
  if (code >= 1 && code <= 3) return '天气不错，出去走走嘛';
  if (code === 45 || code === 48) return '雾蒙蒙的，注意安全呀';
  if (code >= 51 && code <= 67) return '带把伞嘛，别淋湿了';
  if (code >= 71 && code <= 77) return '下雪啦，路上慢点走';
  if (code >= 80 && code <= 82) return '阵雨说来就来，带把伞';
  if (code >= 85 && code <= 86) return '阵雪啦，注意保暖';
  if (code >= 95 && code <= 99) return '打雷啦，尽量别出门';
  return '今天也要好好照顾自己呀';
}

// ════════════════════════════════════════
// 缓存 & 时间
// ════════════════════════════════════════

function isCacheValid(cached) {
  if (!cached || !cached.fetchedAt) return false;
  const age = Date.now() - new Date(cached.fetchedAt).getTime();
  return age < 30 * 60 * 1000; // 30 分钟
}

function isNightTime() {
  const h = new Date().getHours();
  return h >= 18 || h < 6;
}

// ════════════════════════════════════════
// 城市选择 sheet
// ════════════════════════════════════════

function openCitySheet() {
  const city = String(getData(KEYS.weatherCity, '') || '');
  const body = document.createElement('div');
  body.innerHTML = `
    <input class="input" id="weather-city-input" value="${escapeAttr(city)}" placeholder="如 北京 / Beijing / Tokyo" style="width:100%;margin-bottom:10px">
    <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:12px">输入城市名，我去帮你查天气。中英文都可以哦</div>
    <button class="btn primary block" id="weather-city-ok">就用这个</button>
  `;
  const sheet = showBottomSheet({
    title: '设置城市', bodyElement: body, dismissible: true
  });
  const input = body.querySelector('#weather-city-input');
  if (input && typeof input.focus === 'function') {
    try { input.focus(); } catch (e) {}
  }

  const submit = async () => {
    const val = String(input.value || '').trim();
    if (!val) { showToast('城市不能为空哦', 'error'); return; }
    if (val === state.city) { if (sheet) sheet.close(); return; }
    setData(KEYS.weatherCity, val);
    if (sheet) sheet.close();
    showToast('城市设好啦，我看看天气', 'success', 1400);
    await render();
  };

  const okBtn = body.querySelector('#weather-city-ok');
  if (okBtn) okBtn.addEventListener('click', submit);
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
  }
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }
