// apps/weather/index.js
// 天气 App——软萌少女风 PWA「泡泡」。
// 功能：
//   1) 城市存 localStorage（KEYS.weatherCity），用户可输入切换
//   2) 优先联网 open-meteo 免费无 key API（地理编码 + 天气查询）
//   3) 联网失败/超时(5s) -> 本地模拟（按城市名 hash 生成固定天气，同城市同结果）
//   4) 30 分钟缓存（KEYS.weatherCache），缓存内直接复用
//   5) 顶部大卡片：城市 + 天气图标 + 温度(大字) + 描述 + 贴心建议
//   6) 7 日预报（daily API：最高/最低温 + 天气码 + 降水概率）
//   7) 空气质量 AQI（open-meteo 免费版不带，按天气类型本地推断）
//   8) 生活指数：紫外线 / 穿衣 / 运动 / 洗车
//   9) 天气预警：高温 / 寒潮 / 暴雨醒目提示
//   10) 刷新 / 换城市按钮 + 空状态文案
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { KEYS } from '../../core/storage-keys.js';
import { getData, setData } from '../../core/storage.js';
import { showToast, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle } from '../../core/util.js';
import { openApp } from '../../core/router.js';
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
  /* 7 日预报 */
  .weather-forecast{ display:flex; flex-direction:column; gap:0 }
  .weather-forecast-title{ font-size:var(--font-size-small); color:var(--text-secondary); margin-bottom:8px; display:flex; align-items:center; gap:6px }
  .weather-forecast-title .popo-icon-svg{ color:var(--accent) }
  .weather-forecast-row{ display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid color-mix(in srgb,var(--text-hint) 12%,transparent) }
  .weather-forecast-row:last-child{ border-bottom:0 }
  .weather-forecast-day{ width:48px; font-size:var(--font-size-small); color:var(--text-primary); font-weight:500 }
  .weather-forecast-icon{ width:26px; display:flex; justify-content:center; color:var(--accent) }
  .weather-forecast-temps{ flex:1; display:flex; align-items:center; gap:8px; font-size:var(--font-size-small); color:var(--text-secondary); min-width:0 }
  .weather-forecast-max{ color:var(--text-primary); font-weight:500 }
  .weather-forecast-bar{ flex:1; min-width:30px; height:4px; border-radius:2px; background:color-mix(in srgb,var(--text-hint) 22%,transparent); position:relative; overflow:hidden }
  .weather-forecast-bar-fill{ position:absolute; top:0; bottom:0; background:linear-gradient(90deg,var(--success),var(--warning),var(--danger)); border-radius:2px }
  .weather-forecast-pop{ width:38px; text-align:right; font-size:11px; color:var(--text-hint) }
  /* AQI 空气质量 */
  .weather-aqi{ display:flex; align-items:center; gap:12px; padding:12px 14px; background:color-mix(in srgb,var(--accent-light) 22%,transparent); border-radius:var(--radius-md) }
  .weather-aqi-badge{ min-width:46px; text-align:center; padding:6px 10px; border-radius:var(--radius-sm); color:#fff; font-weight:600; font-size:var(--font-size-base) }
  .weather-aqi-text{ flex:1; min-width:0 }
  .weather-aqi-label{ font-size:var(--font-size-small); color:var(--text-secondary) }
  .weather-aqi-desc{ font-size:var(--font-size-small); color:var(--text-hint); margin-top:2px; line-height:1.4 }
  /* 生活指数 */
  .weather-indices{ display:grid; grid-template-columns:1fr 1fr; gap:10px }
  .weather-index{ padding:12px; background:color-mix(in srgb,var(--accent-light) 18%,transparent); border-radius:var(--radius-md) }
  .weather-index-head{ display:flex; align-items:center; gap:6px; margin-bottom:6px }
  .weather-index-head .popo-icon-svg{ color:var(--accent) }
  .weather-index-name{ font-size:var(--font-size-small); color:var(--text-secondary) }
  .weather-index-value{ font-size:var(--font-size-base); color:var(--text-primary); font-weight:500; margin-bottom:2px }
  .weather-index-tip{ font-size:11px; color:var(--text-hint); line-height:1.4 }
  /* 天气预警 */
  .weather-warning{ display:flex; gap:10px; padding:12px 14px; border-radius:var(--radius-md); background:color-mix(in srgb,var(--warning) 18%,transparent); border:1px solid color-mix(in srgb,var(--warning) 45%,transparent) }
  .weather-warning.danger{ background:color-mix(in srgb,var(--danger) 18%,transparent); border-color:color-mix(in srgb,var(--danger) 45%,transparent) }
  .weather-warning.cold{ background:color-mix(in srgb,#5BA3F0 18%,transparent); border-color:color-mix(in srgb,#5BA3F0 45%,transparent) }
  .weather-warning-icon{ flex-shrink:0; color:var(--warning) }
  .weather-warning.danger .weather-warning-icon{ color:var(--danger) }
  .weather-warning.cold .weather-warning-icon{ color:#5BA3F0 }
  .weather-warning-body{ flex:1; min-width:0 }
  .weather-warning-title{ font-size:var(--font-size-base); color:var(--text-primary); font-weight:600; margin-bottom:2px }
  .weather-warning-text{ font-size:var(--font-size-small); color:var(--text-secondary); line-height:1.5 }
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
      <button class="app-header-gear" id="weather-settings" aria-label="天气设置">${createIcon('settings', 18).outerHTML}</button>
    </div>
    <div class="app-body" id="weather-body"></div>
  `;
  container.querySelector('#weather-back').addEventListener('click', () => bus.emit('router:home'));
  // 齿轮跳到设置「数据与系统」分组
  container.querySelector('#weather-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'system' } }));
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
    ${renderWarningCard()}
    ${renderForecastCard()}
    ${renderAqiCard()}
    ${renderIndicesCard()}
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

  // 2. 天气查询：current + daily(7 日) + uv_index_max + 降水概率
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,uv_index_max,precipitation_probability_max&forecast_days=7&timezone=auto`;
  const wResp = await fetchWithTimeout(weatherUrl, 5000);
  if (!wResp.ok) throw new Error('天气请求失败');
  const w = await wResp.json();
  if (!w.current) throw new Error('天气数据为空');

  const daily = w.daily || {};
  // open-meteo 免费版不带 AQI，按当前天气码本地推断（保证有值兜底）
  const aqi = aqiInfo(w.current.weather_code);
  // 今日紫外线取 daily.uv_index_max[0]（今日最大值）
  const uvIndex = (daily.uv_index_max && daily.uv_index_max.length > 0)
    ? daily.uv_index_max[0]
    : null;

  return {
    temperature_2m: w.current.temperature_2m,
    weather_code: w.current.weather_code,
    name: name || city,
    daily: {
      time: daily.time || [],
      weather_code: daily.weather_code || [],
      temperature_2m_max: daily.temperature_2m_max || [],
      temperature_2m_min: daily.temperature_2m_min || [],
      uv_index_max: daily.uv_index_max || [],
      precipitation_probability_max: daily.precipitation_probability_max || []
    },
    uvIndex,
    aqi
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
  // 模拟 7 日预报（围绕今日温度小幅波动，同城市同结果）
  const today = new Date();
  const time = [], wcode = [], tmax = [], tmin = [], uv = [], pop = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    time.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    // 后续日子从 codes 里取，保证同城市同结果
    const ci = (h + i * 7) % codes.length;
    wcode.push(codes[ci]);
    const drift = ((h + i * 13) % 11) - 5;
    tmax.push(tempC + 4 + drift);
    tmin.push(tempC - 4 + drift);
    uv.push(((h + i * 3) % 11) * 0.8); // 0 ~ 8
    pop.push((i === 0 && code >= 51 && code <= 67) ? 80 : ((h + i * 5) % 100));
  }
  return {
    temperature_2m: tempC,
    weather_code: code,
    name: city,
    daily: {
      time,
      weather_code: wcode,
      temperature_2m_max: tmax,
      temperature_2m_min: tmin,
      uv_index_max: uv,
      precipitation_probability_max: pop
    },
    uvIndex: uv[0] != null ? uv[0] : null,
    aqi: aqiInfo(code)
  };
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
// 7 日预报 / AQI / 生活指数 / 天气预警 渲染
// ════════════════════════════════════════

// 7 日预报卡片（最高/最低温 + 天气图标 + 降水概率）
function renderForecastCard() {
  const { data } = state;
  if (!data || !data.daily) return '';
  const d = data.daily;
  const len = d.time ? d.time.length : 0;
  if (len === 0) return '';
  // 算这一周的温度范围，用于柱条比例
  let minT = Infinity, maxT = -Infinity;
  for (let i = 0; i < len; i++) {
    const lo = d.temperature_2m_min[i];
    const hi = d.temperature_2m_max[i];
    if (typeof lo === 'number' && isFinite(lo) && lo < minT) minT = lo;
    if (typeof hi === 'number' && isFinite(hi) && hi > maxT) maxT = hi;
  }
  if (!isFinite(minT) || !isFinite(maxT)) { minT = 0; maxT = 30; }
  if (maxT - minT < 1) maxT = minT + 1;
  const span = maxT - minT;
  const rows = [];
  for (let i = 0; i < len; i++) {
    const t = d.time[i];
    const code = d.weather_code[i];
    const lo = d.temperature_2m_min[i];
    const hi = d.temperature_2m_max[i];
    const pop = d.precipitation_probability_max ? d.precipitation_probability_max[i] : null;
    const info = weatherCodeInfo(code, false); // 预报用日间图标
    // 日期标签：今天 / 明天 / 周几
    const dateObj = parseLocalDate(t);
    const isToday = isSameDay(dateObj, new Date());
    const isTomorrow = isSameDay(dateObj, new Date(Date.now() + 86400000));
    const dayLabel = isToday ? '今天' : (isTomorrow ? '明天' : weekdayLabel(dateObj));
    const loC = typeof lo === 'number' ? lo : minT;
    const hiC = typeof hi === 'number' ? hi : maxT;
    const left = ((loC - minT) / span) * 100;
    const width = ((hiC - loC) / span) * 100;
    rows.push(`
      <div class="weather-forecast-row">
        <div class="weather-forecast-day">${escapeHtml(dayLabel)}</div>
        <div class="weather-forecast-icon">${createIcon(info.icon, 22).outerHTML}</div>
        <div class="weather-forecast-temps">
          <span class="weather-forecast-max">${Math.round(hiC)}°</span>
          <div class="weather-forecast-bar">
            <div class="weather-forecast-bar-fill" style="left:${left}%;width:${Math.max(8, width)}%"></div>
          </div>
          <span>${Math.round(loC)}°</span>
        </div>
        <div class="weather-forecast-pop">${(pop != null && pop > 0) ? (pop + '%') : ''}</div>
      </div>
    `);
  }
  return `
    <div class="card" style="margin-top:12px">
      <div class="weather-forecast-title">${createIcon('calendar', 14).outerHTML} 未来一周天气</div>
      <div class="weather-forecast">${rows.join('')}</div>
    </div>
  `;
}

// AQI 卡片（空气质量 + 贴心描述）
function renderAqiCard() {
  const { data } = state;
  if (!data || !data.aqi) return '';
  const a = data.aqi;
  return `
    <div class="card" style="margin-top:12px">
      <div class="weather-forecast-title">${createIcon('memo', 14).outerHTML} 空气质量</div>
      <div class="weather-aqi">
        <div class="weather-aqi-badge" style="background:${escapeAttr(a.color)}">${a.value}</div>
        <div class="weather-aqi-text">
          <div class="weather-aqi-label">${escapeHtml(a.label)}</div>
          <div class="weather-aqi-desc">${escapeHtml(a.desc)}</div>
        </div>
      </div>
    </div>
  `;
}

// 生活指数卡片：紫外线 / 穿衣 / 运动 / 洗车
function renderIndicesCard() {
  const { data } = state;
  if (!data) return '';
  const temp = data.temperature_2m;
  const code = data.weather_code;
  const uv = data.uvIndex;
  const items = [
    uvIndexInfo(uv),
    clothingIndex(temp, code),
    exerciseIndex(code, temp),
    carWashIndex(code)
  ];
  return `
    <div class="card" style="margin-top:12px">
      <div class="weather-forecast-title">${createIcon('heart', 14).outerHTML} 生活小贴士</div>
      <div class="weather-indices">
        ${items.map((it) => `
          <div class="weather-index">
            <div class="weather-index-head">
              ${createIcon(it.icon, 16).outerHTML}
              <span class="weather-index-name">${escapeHtml(it.name)}</span>
            </div>
            <div class="weather-index-value">${escapeHtml(it.value)}</div>
            <div class="weather-index-tip">${escapeHtml(it.tip)}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// 天气预警卡片：高温 / 寒潮 / 暴雨（同时命中多条就叠着显示）
function renderWarningCard() {
  const { data } = state;
  if (!data) return '';
  const warns = weatherWarnings(data);
  if (warns.length === 0) return '';
  return warns.map((w) => `
    <div class="weather-warning ${escapeAttr(w.level || '')}">
      <div class="weather-warning-icon">${createIcon('bell', 22).outerHTML}</div>
      <div class="weather-warning-body">
        <div class="weather-warning-title">${escapeHtml(w.title)}</div>
        <div class="weather-warning-text">${escapeHtml(w.text)}</div>
      </div>
    </div>
  `).join('');
}

// ════════════════════════════════════════
// 指数 & 预警 计算函数
// ════════════════════════════════════════

// AQI 信息（open-meteo 免费版不带，按当前天气码本地推断）
// 返回 { value, label, desc, color }
function aqiInfo(code) {
  // 雾天空气差；雨/雪/雷雨把空气洗净 -> AQI 优；阴天略差
  if (code === 45 || code === 48) return { value: 145, label: '轻度污染', desc: '雾天空气不太流通，敏感的朋友少出门', color: 'var(--warning)' };
  if (code === 3) return { value: 95, label: '良', desc: '空气一般般，可以正常活动', color: 'var(--success)' };
  if (code >= 51 && code <= 67) return { value: 42, label: '优', desc: '雨水把空气洗干净啦', color: 'var(--success)' };
  if (code >= 71 && code <= 77) return { value: 38, label: '优', desc: '雪花把空气洗净啦', color: 'var(--success)' };
  if (code >= 95 && code <= 99) return { value: 50, label: '优', desc: '雷雨过后空气清新', color: 'var(--success)' };
  if (code === 0) return { value: 58, label: '良', desc: '晴天空气不错，适合出门', color: 'var(--success)' };
  return { value: 72, label: '良', desc: '空气还可以，放心活动', color: 'var(--success)' };
}

// 紫外线指数：返回 { name, icon, value, tip }
function uvIndexInfo(uv) {
  const v = (typeof uv === 'number' && isFinite(uv)) ? uv : 3;
  let level, tip;
  if (v < 3) { level = '较弱'; tip = '紫外线很温柔，不用特意防晒'; }
  else if (v < 6) { level = '中等'; tip = '紫外线有点强哦，出门涂点防晒'; }
  else if (v < 8) { level = '强'; tip = '紫外线偏强，记得戴帽子涂防晒'; }
  else if (v < 11) { level = '很强'; tip = '紫外线太强啦，尽量别久晒'; }
  else { level = '爆表'; tip = '紫外线爆表，能不出门就不出门'; }
  return { name: '紫外线', icon: 'sun', value: level, tip };
}

// 穿衣指数：根据温度 + 天气码推断
function clothingIndex(tempC, code) {
  let level, tip;
  if (typeof tempC !== 'number' || !isFinite(tempC)) {
    level = '适中'; tip = '按平时穿就好啦';
  } else if (tempC <= 0) {
    level = '严寒'; tip = '穿最厚的羽绒服，别冻着';
  } else if (tempC <= 8) {
    level = '寒冷'; tip = '棉衣厚外套加围巾，暖暖的';
  } else if (tempC <= 15) {
    level = '偏冷'; tip = '风衣或厚外套，加件薄毛衣';
  } else if (tempC <= 22) {
    level = '舒适'; tip = '长袖单衣就刚好';
  } else if (tempC <= 28) {
    level = '偏热'; tip = '短袖短裤，轻装上阵';
  } else {
    level = '炎热'; tip = '穿最凉爽的，注意防暑';
  }
  // 雨雪天额外提醒带伞
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    tip += '，出门带伞';
  }
  return { name: '穿衣', icon: 'memo', value: level, tip };
}

// 运动指数：根据天气码 + 温度推断
function exerciseIndex(code, tempC) {
  if (typeof tempC === 'number' && isFinite(tempC)) {
    if (tempC <= 0) return { name: '运动', icon: 'play', value: '不宜', tip: '太冷啦，在家动一动就好' };
    if (tempC >= 33) return { name: '运动', icon: 'play', value: '不宜', tip: '太热啦，等傍晚再运动' };
  }
  if (code >= 95 && code <= 99) return { name: '运动', icon: 'play', value: '不宜', tip: '打雷啦，别在户外运动' };
  if (code >= 61 && code <= 67) return { name: '运动', icon: 'play', value: '不宜', tip: '下雨呢，等雨停再说' };
  if (code >= 71 && code <= 77) return { name: '运动', icon: 'play', value: '小心', tip: '下雪天路滑，运动要小心' };
  if (code === 45 || code === 48) return { name: '运动', icon: 'play', value: '不宜', tip: '雾天空气差，先别户外运动' };
  if (code === 0) return { name: '运动', icon: 'play', value: '适宜', tip: '今天适合运动，出门跑跑嘛' };
  return { name: '运动', icon: 'play', value: '较适宜', tip: '天气还行，可以适度运动' };
}

// 洗车指数：根据天气码推断
function carWashIndex(code) {
  if (code >= 61 && code <= 67) return { name: '洗车', icon: 'weather', value: '不宜', tip: '下雨天别洗车啦，白洗' };
  if (code >= 71 && code <= 77) return { name: '洗车', icon: 'weather', value: '不宜', tip: '下雪天别洗车，会冻上' };
  if (code >= 80 && code <= 82) return { name: '洗车', icon: 'weather', value: '不宜', tip: '阵雨说来就来，先别洗' };
  if (code >= 95 && code <= 99) return { name: '洗车', icon: 'weather', value: '不宜', tip: '雷雨天别洗车' };
  if (code === 45 || code === 48) return { name: '洗车', icon: 'weather', value: '较不宜', tip: '雾天潮湿，洗了也不容易干' };
  if (code === 0) return { name: '洗车', icon: 'weather', value: '适宜', tip: '晴天洗车最好啦，干得快' };
  return { name: '洗车', icon: 'weather', value: '较适宜', tip: '天气还行，可以洗车' };
}

// 天气预警：高温 / 寒潮 / 暴雨（返回数组，每项 { level, title, text }）
function weatherWarnings(data) {
  const warns = [];
  const temp = data.temperature_2m;
  const code = data.weather_code;
  const daily = data.daily;
  // 高温预警：当前 ≥ 35°C
  if (typeof temp === 'number' && temp >= 35) {
    warns.push({ level: 'danger', title: '高温预警', text: '今天太热啦，尽量待在凉快的地方，多喝水别中暑' });
  }
  // 寒潮预警：当前 ≤ 0°C
  if (typeof temp === 'number' && temp <= 0) {
    warns.push({ level: 'cold', title: '寒潮预警', text: '今天好冷呀，穿厚点，手脚别冻着' });
  }
  // 降水预警：当前强降水 或 明天降水概率 ≥ 80%
  const heavyRain = (code >= 80 && code <= 82) || (code >= 95 && code <= 99);
  let tomorrowPop = -1;
  if (daily && daily.precipitation_probability_max && daily.precipitation_probability_max.length >= 2) {
    tomorrowPop = daily.precipitation_probability_max[1];
  }
  if (heavyRain || tomorrowPop >= 80) {
    warns.push({ level: '', title: '降水预警', text: '出门记得带伞嘛，别淋湿了' });
  }
  return warns;
}

// ════════════════════════════════════════
// 日期工具
// ════════════════════════════════════════

// 把 YYYY-MM-DD 解析成本地日期（避免 UTC 偏移到前一天）
function parseLocalDate(t) {
  if (!t) return new Date(NaN);
  const m = String(t).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return new Date(t);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function weekdayLabel(date) {
  const names = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return names[date.getDay()];
}

function isSameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
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
