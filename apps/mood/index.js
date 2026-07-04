// apps/mood/index.js
// 心情日记 App——软萌少女风格 PWA「泡泡」。
// 每一天的心情都值得被看见。我帮主人把今天的感觉记下来，回头看也会很温柔。
// 存 IndexedDB（STORES.moodEntries），字段：
//   {id, date(YYYY-MM-DD), score(1-5), icon, note, createdAt, updatedAt}
//   一天一条：用日期做 id，再写会覆盖旧的那条（保留原 createdAt）。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { STORES, KEYS } from '../../core/storage-keys.js';
import { getDB, setDB, deleteDB, getAllDB, getNow, getData, setData } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle } from '../../core/util.js';
import { openApp } from '../../core/router.js';
import { applyAppBg } from '../../core/app-bg.js';
import { recordInteraction } from '../../core/memory.js';

let containerEl = null;
// 月历视图当前展示的年/月（0-based month），翻页时更新；进 App 时默认当月
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();

// 五档心情，从难过得想抱抱到开心得想转圈圈
// key 用于写入记忆的 mood 字段（与 core/memory.js 的 moodLabel 表对齐）
const MOODS = [
  { score: 1, icon: 'moon',  label: '难过',   key: 'sad' },     // 月亮：暗淡
  { score: 2, icon: 'dream', label: '低落',   key: 'anxious' }, // 云：阴沉
  { score: 3, icon: 'smile', label: '平静',   key: 'calm' },    // 微笑
  { score: 4, icon: 'heart', label: '开心',   key: 'happy' },   // 爱心
  { score: 5, icon: 'star',  label: '超开心', key: 'excited' }  // 星星
];

// 把心情图标渲染成 SVG 线稿
function moodIcon(name, size) {
  return createIcon(name, size).outerHTML;
}

const HAPPY_THRESHOLD = 4; // 4 分及以上算开心

// 注入样式（基于 CSS 变量，主题变了我也跟着变）
injectStyle('app-mood-style', `
  .mood-today {
    position: relative;
    overflow: hidden;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
    color: var(--bubble-user-text);
    border-radius: var(--radius-card);
    padding: 20px 18px;
    margin-bottom: 16px;
    box-shadow: var(--shadow-md);
  }
  .mood-today-bubble {
    position: absolute;
    border-radius: 50%;
    background: rgba(255,255,255,.16);
    pointer-events: none;
  }
  .mood-today-bubble.b1 { width: 80px; height: 80px; right: -22px; top: -24px; }
  .mood-today-bubble.b2 { width: 40px; height: 40px; right: 30px; bottom: -18px; background: rgba(255,255,255,.10); }
  .mood-today-title {
    font-size: var(--font-size-base);
    font-weight: 600;
    margin-bottom: 12px;
    opacity: .95;
  }
  .mood-emoji-row {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 12px;
  }
  .mood-emoji-btn {
    flex: 1;
    aspect-ratio: 1;
    border-radius: var(--radius-md);
    border: 2px solid transparent;
    background: rgba(255,255,255,.18);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: var(--motion);
    color: inherit;
  }
  .mood-emoji-btn:active { transform: scale(var(--press-scale)); }
  .mood-emoji-btn.active {
    border-color: rgba(255,255,255,.85);
    background: rgba(255,255,255,.30);
    transform: translateY(-2px);
  }
  .mood-today-note {
    width: 100%;
    box-sizing: border-box;
    border-radius: var(--radius-sm);
    background: rgba(255,255,255,.20);
    border: 1px solid rgba(255,255,255,.18);
    color: var(--bubble-user-text);
    padding: 10px 12px;
    font-size: var(--font-size-base);
    font-family: inherit;
    min-height: 64px;
    resize: vertical;
    margin-bottom: 10px;
  }
  .mood-today-note::placeholder { color: color-mix(in srgb, var(--bubble-user-text) 70%, transparent); }
  .mood-today-note:focus { outline: none; background: rgba(255,255,255,.28); }
  .mood-today-save {
    width: 100%;
    justify-content: center;
    background: rgba(255,255,255,.92);
    color: var(--accent-dark);
    font-weight: 600;
    padding: 11px;
    border-radius: var(--radius-sm);
    border: 0;
    cursor: pointer;
    font-size: var(--font-size-base);
    transition: var(--motion);
  }
  .mood-today-save:active { transform: scale(var(--press-scale)); }

  .mood-stats {
    display: flex;
    gap: 10px;
    margin-bottom: 16px;
  }
  .mood-stat {
    flex: 1;
    background: var(--bg-card);
    border: 1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    border-radius: var(--radius-md);
    padding: 12px 10px;
    text-align: center;
  }
  .mood-stat-value {
    font-size: var(--font-size-title);
    font-weight: 700;
    color: var(--accent-dark);
    line-height: 1.1;
  }
  .mood-stat-label {
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    margin-top: 4px;
  }

  .mood-list-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin: 4px 2px 10px;
  }
  .mood-list-head-title {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--text-secondary);
  }
  .mood-list-head-count {
    font-size: var(--font-size-small);
    color: var(--text-hint);
  }

  .mood-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    text-align: left;
    background: var(--bg-card);
    border: 1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    margin-bottom: 10px;
    cursor: pointer;
    transition: var(--motion);
  }
  .mood-item:active { transform: scale(var(--press-scale)); }
  .mood-item-emoji {
    color: var(--accent-dark);
    line-height: 1;
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: color-mix(in srgb, var(--accent-light) 50%, transparent);
    border-radius: 50%;
  }
  .mood-item-main { flex: 1; min-width: 0; }
  .mood-item-date {
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--text-primary);
  }
  .mood-item-note {
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mood-item-label {
    font-size: var(--font-size-small);
    color: var(--text-hint);
    flex-shrink: 0;
  }

  .mood-empty {
    text-align: center;
    padding: 40px 20px;
    color: var(--text-hint);
  }
  .mood-empty-emoji {
    color: var(--accent);
    display: flex;
    justify-content: center;
    margin-bottom: 8px;
    opacity: .8;
  }
  .mood-empty-text {
    font-size: var(--font-size-base);
    color: var(--text-secondary);
    line-height: 1.6;
  }

  // 历史编辑弹层里的 emoji 行（浅色卡片背景，需要单独配色）
  .mood-edit-emoji-row {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    margin-bottom: 10px;
  }
  .mood-edit-emoji-btn {
    flex: 1;
    aspect-ratio: 1;
    border-radius: var(--radius-md);
    border: 2px solid transparent;
    background: var(--bg-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: var(--motion);
    color: var(--text-primary);
  }
  .mood-edit-emoji-btn:active { transform: scale(var(--press-scale)); }
  .mood-edit-emoji-btn.active {
    border-color: var(--accent);
    background: color-mix(in srgb, var(--accent-light) 60%, transparent);
  }
  .mood-edit-meta {
    font-size: var(--font-size-small);
    color: var(--text-secondary);
    margin-bottom: 8px;
  }
  .mood-edit-actions { display: flex; gap: 8px; margin-top: 10px; }
  .mood-edit-actions .btn.primary { flex: 1; justify-content: center; }

  /* 趋势图 + 月历区块共用外壳 */
  .mood-section{
    background:var(--bg-card);
    border:1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    border-radius:var(--radius-card);
    padding:14px 16px;
    margin-bottom:16px;
    box-shadow:var(--shadow-sm);
  }
  .mood-section-title{
    display:flex; align-items:center; gap:6px;
    font-size:var(--font-size-base); font-weight:600;
    color:var(--text-secondary); margin-bottom:12px;
  }
  .mood-section-title .popo-icon{ color:var(--accent-dark); }

  /* 本周心情趋势图：7 根柱子横向铺开 */
  .mood-trend-chart{
    display:flex; align-items:flex-end; justify-content:space-between;
    gap:6px; height:110px;
  }
  .mood-trend-col{
    flex:1; display:flex; flex-direction:column;
    align-items:center; gap:6px; height:100%;
  }
  .mood-trend-bar-wrap{
    flex:1; width:100%;
    display:flex; align-items:flex-end; justify-content:center;
  }
  .mood-trend-bar{
    width:70%; max-width:22px; min-height:4px;
    border-radius:6px 6px 2px 2px;
    transition:height var(--motion) var(--motion-spring);
  }
  .mood-trend-bar.empty{
    height:4px !important;
    background:color-mix(in srgb, var(--text-hint) 28%, transparent) !important;
  }
  .mood-trend-label{
    font-size:var(--font-size-small); color:var(--text-hint); line-height:1;
  }

  /* 月历视图 */
  .mood-cal-head{
    display:flex; align-items:center; justify-content:space-between;
    margin-bottom:10px;
  }
  .mood-cal-title{
    font-size:var(--font-size-base); font-weight:600; color:var(--text-primary);
  }
  .mood-cal-nav{
    width:32px; height:32px; border-radius:50%;
    background:color-mix(in srgb, var(--accent-light) 40%, transparent);
    color:var(--accent-dark); border:none;
    display:flex; align-items:center; justify-content:center;
    cursor:pointer; transition:var(--motion);
  }
  .mood-cal-nav:active{ transform:scale(var(--press-scale)); }
  .mood-cal-weekhead{
    display:grid; grid-template-columns:repeat(7,1fr); margin-bottom:6px;
  }
  .mood-cal-weekhead span{
    text-align:center; font-size:var(--font-size-small); color:var(--text-hint);
  }
  .mood-cal-grid{
    display:grid; grid-template-columns:repeat(7,1fr); gap:4px;
  }
  .mood-cal-cell{
    aspect-ratio:1; border-radius:var(--radius-sm);
    background:color-mix(in srgb, var(--bg-secondary) 60%, transparent);
    border:1px solid transparent;
    display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:3px;
    cursor:pointer; transition:var(--motion); padding:0;
  }
  .mood-cal-cell.empty{ background:transparent; cursor:default; }
  .mood-cal-cell:disabled{ cursor:default; }
  .mood-cal-cell.has-entry:active{ transform:scale(var(--press-scale)); }
  .mood-cal-cell.today{ border-color:var(--accent); }
  .mood-cal-cell.has-entry{
    background:color-mix(in srgb, var(--accent-light) 35%, transparent);
  }
  .mood-cal-day{
    font-size:var(--font-size-small); color:var(--text-secondary); line-height:1;
  }
  .mood-cal-cell.has-entry .mood-cal-day{
    color:var(--accent-dark); font-weight:600;
  }
  .mood-cal-dot{ width:6px; height:6px; border-radius:50%; }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="mood-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">心情日记</div>
      <button class="app-header-gear" id="mood-settings" aria-label="心情设置">${createIcon('settings', 18).outerHTML}</button>
      <button class="mood-add" id="mood-add" aria-label="记一下今天的心情">${createIcon('edit', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="mood-body"></div>
  `;
  container.querySelector('#mood-back').addEventListener('click', () => bus.emit('router:home'));
  // 齿轮跳到设置「AI 与陪伴」分组
  container.querySelector('#mood-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'ai' } }));
  // 顶部加号按钮：滚到顶部并聚焦今天的输入框（今天的心情卡片本身就是新增入口）
  container.querySelector('#mood-add').addEventListener('click', () => {
    const note = containerEl.querySelector('#mood-today-note');
    if (note) {
      note.scrollIntoView({ behavior: 'smooth', block: 'center' });
      note.focus();
    }
  });
  await render();
  applyAppBg(container, 'mood');
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function prettyDate(s) {
  if (!s) return '';
  const parts = String(s).split('-');
  if (parts.length !== 3) return s;
  return `${parts[0]}年${parts[1]}月${parts[2]}日`;
}

function moodFor(score) {
  return MOODS.find((m) => m.score === score) || MOODS[2];
}

// 把「今天的心情」同步缓存到 localStorage（KEYS.moodState），
// 让 ai-client.buildMessages 能同步读到主人当前心情，注入 AI 上下文
// 只缓存今天的心情；非今天的写入不更新缓存
function cacheTodayMood(entry) {
  if (!entry || entry.date !== todayStr()) return;
  try {
    setData(KEYS.moodState, {
      date: entry.date,
      score: entry.score,
      key: moodFor(entry.score).key,
      label: moodFor(entry.score).label,
      note: entry.note || '',
      savedAt: Date.now()
    });
  } catch (e) {
    console.warn('[mood] 缓存心情失败', e);
  }
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ════════════════════════════════════════
// 渲染
// ════════════════════════════════════════

async function render() {
  if (!containerEl) return;
  const body = containerEl.querySelector('#mood-body');
  if (!body) return;

  const all = await getAllDB(STORES.moodEntries);
  // 按日期倒序（字符串比较 YYYY-MM-DD 等价于日期比较）
  const sorted = all.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const today = todayStr();
  const todayEntry = sorted.find((x) => x.date === today);

  const stats = computeStats(sorted, today);

  body.innerHTML = `
    ${renderToday(todayEntry)}
    ${renderStats(stats)}
    ${renderTrendChart(sorted)}
    ${renderCalendar(sorted)}
    <div class="mood-list-head">
      <span class="mood-list-head-title">历史心情</span>
      <span class="mood-list-head-count">共 ${sorted.length} 条</span>
    </div>
    <div id="mood-list"></div>
  `;

  // 今天的卡片交互
  wireTodayCard(body, todayEntry);

  // 月历翻页 + 点击日期查看详情
  const prevBtn = body.querySelector('#mood-cal-prev');
  const nextBtn = body.querySelector('#mood-cal-next');
  if (prevBtn) prevBtn.addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    render();
  });
  if (nextBtn) nextBtn.addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    render();
  });
  body.querySelectorAll('.mood-cal-cell.has-entry').forEach((cell) => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      const target = sorted.find((x) => x.date === date);
      if (target) openHistoryForm(target);
    });
  });

  // 历史列表
  const listEl = body.querySelector('#mood-list');
  // 今天的已经在顶部展示，列表里就不重复
  const history = sorted.filter((x) => x.date !== today);
  if (history.length === 0) {
    listEl.innerHTML = `
      <div class="mood-empty">
        <div class="mood-empty-emoji">${moodIcon('memo', 44)}</div>
        <div class="mood-empty-text">${sorted.length === 0 ? '今天还没记心情呢，告诉我你现在感觉怎么样嘛' : '今天记下第一条后，明天这里就会出现历史啦'}</div>
      </div>
    `;
  } else {
    listEl.innerHTML = history.map(renderItem).join('');
    listEl.querySelectorAll('.mood-item').forEach((el) => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        const target = sorted.find((x) => x.id === id);
        if (target) openHistoryForm(target);
      });
    });
  }
}

function renderToday(entry) {
  return `
    <div class="mood-today" id="mood-today-card">
      <span class="mood-today-bubble b1"></span>
      <span class="mood-today-bubble b2"></span>
      <div class="mood-today-title">今天的心情</div>
      <div class="mood-emoji-row" id="mood-emoji-row">
        ${MOODS.map((m) => `<button type="button" class="mood-emoji-btn ${entry && entry.score === m.score ? 'active' : ''}" data-score="${m.score}" aria-label="${m.label}">${moodIcon(m.icon, 24)}</button>`).join('')}
      </div>
      <textarea class="mood-today-note" id="mood-today-note" placeholder="想说说今天发生的事吗..." maxlength="500">${escapeHTML(entry ? entry.note : '')}</textarea>
      <button class="mood-today-save" id="mood-today-save">${entry ? '改一下' : '记下来'}</button>
    </div>
  `;
}

function wireTodayCard(body, entry) {
  const card = body.querySelector('#mood-today-card');
  if (!card) return;
  let picked = entry ? entry.score : 3; // 默认平静
  const row = card.querySelector('#mood-emoji-row');
  row.addEventListener('click', (e) => {
    const btn = e.target.closest('.mood-emoji-btn');
    if (!btn) return;
    picked = Number(btn.dataset.score);
    row.querySelectorAll('.mood-emoji-btn').forEach((b) => b.classList.toggle('active', b === btn));
  });
  card.querySelector('#mood-today-save').addEventListener('click', async () => {
    const note = card.querySelector('#mood-today-note').value.trim();
    const today = todayStr();
    const mood = moodFor(picked);
    // 一天一条：用日期做 id；存在就保留原 createdAt，否则新建
    const prev = await getDB(STORES.moodEntries, today);
    const record = {
      id: today,
      date: today,
      score: mood.score,
      icon: mood.icon,
      note,
      createdAt: (prev && prev.createdAt) || getNow()
    };
    await setDB(STORES.moodEntries, today, record);
    showToast(prev ? '改好啦，今天的心情我收着了' : '记下来啦，今天也要好好抱抱自己', 'success');
    bus.emit('mood:saved', { date: today, score: mood.score });
    // 同步缓存到 localStorage，让 AI 上下文能读到当前心情
    cacheTodayMood(record);
    // 写入长期记忆，让 AI 知道主人今天心情怎么样
    try {
      await recordInteraction({
        characterId: 'global',
        role: 'user',
        source: 'mood',
        content: `今天心情：${mood.label}${note ? `，${note}` : ''}`,
        mood: mood.key,
        importance: 4,
        relatedApp: 'mood'
      });
    } catch (e) {
      console.warn('[mood] 记忆写入失败', e);
    }
    render();
  });
}

function renderStats(stats) {
  return `
    <div class="mood-stats">
      <div class="mood-stat">
        <div class="mood-stat-value">${stats.happyWeek}</div>
        <div class="mood-stat-label">本周开心天数</div>
      </div>
      <div class="mood-stat">
        <div class="mood-stat-value">${stats.streak}</div>
        <div class="mood-stat-label">连续记录天数</div>
      </div>
    </div>
  `;
}

function renderItem(entry) {
  const mood = moodFor(entry.score);
  const isToday = entry.date === todayStr();
  return `
    <button class="mood-item" data-id="${entry.id}">
      <div class="mood-item-emoji">${moodIcon(entry.icon || mood.icon, 22)}</div>
      <div class="mood-item-main">
        <div class="mood-item-date">${prettyDate(entry.date)}${isToday ? ' · 今天' : ''}</div>
        <div class="mood-item-note">${entry.note ? escapeHTML(entry.note) : '没有写文字'}</div>
      </div>
      <div class="mood-item-label">${mood.label}</div>
    </button>
  `;
}

// ════════════════════════════════════════
// 统计
// ════════════════════════════════════════

/**
 * 本周开心天数：过去 7 天（含今天）里有记录且 score >= 4 的天数。
 * 连续记录天数：从今天往前数，连续有记录的天数；今天没记就从昨天起算；
 *   昨天也没记就直接为 0。
 */
function computeStats(sorted, today) {
  const byDate = new Map();
  sorted.forEach((e) => byDate.set(e.date, e));
  return {
    happyWeek: countHappyInLastDays(byDate, today, 7),
    streak: computeStreak(byDate, today)
  };
}

function countHappyInLastDays(byDate, todayStr, days) {
  const today = new Date(todayStr.replace(/-/g, '/'));
  let count = 0;
  for (let i = 0; i < days; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const entry = byDate.get(dateKey(d));
    if (entry && entry.score >= HAPPY_THRESHOLD) count++;
  }
  return count;
}

function computeStreak(byDate, todayStr) {
  const today = new Date(todayStr.replace(/-/g, '/'));
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  if (!byDate.has(dateKey(cursor))) {
    // 今天还没记，从昨天起算；昨天也没有就直接 0
    cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    if (!byDate.has(dateKey(cursor))) return 0;
  }
  let streak = 0;
  while (byDate.has(dateKey(cursor))) {
    streak++;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return streak;
}

// ════════════════════════════════════════
// 历史条目编辑 / 删除
// ════════════════════════════════════════

function openHistoryForm(entry) {
  const mood = moodFor(entry.score);
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="mood-edit-meta">${prettyDate(entry.date)} · 心情：${moodIcon(mood.icon, 18)} ${mood.label}</div>
    <div class="mood-edit-emoji-row" id="mood-edit-row">
      ${MOODS.map((m) => `<button type="button" class="mood-edit-emoji-btn ${entry.score === m.score ? 'active' : ''}" data-score="${m.score}" aria-label="${m.label}">${moodIcon(m.icon, 24)}</button>`).join('')}
    </div>
    <textarea class="textarea" id="mood-edit-note" placeholder="想说点什么..." maxlength="500">${escapeHTML(entry.note || '')}</textarea>
    <div class="mood-edit-actions">
      <button class="btn ghost" id="mood-edit-del">删掉</button>
      <button class="btn primary" id="mood-edit-ok">改好啦</button>
    </div>
  `;

  const sheet = showBottomSheet({
    title: '改一下这条心情',
    bodyElement: body,
    dismissible: true
  });

  let picked = entry.score;
  const row = body.querySelector('#mood-edit-row');
  row.addEventListener('click', (e) => {
    const btn = e.target.closest('.mood-edit-emoji-btn');
    if (!btn) return;
    picked = Number(btn.dataset.score);
    row.querySelectorAll('.mood-edit-emoji-btn').forEach((b) => b.classList.toggle('active', b === btn));
  });

  body.querySelector('#mood-edit-ok').addEventListener('click', async () => {
    const note = body.querySelector('#mood-edit-note').value.trim();
    const m = moodFor(picked);
    const prev = await getDB(STORES.moodEntries, entry.id);
    const record = {
      id: entry.id,
      date: entry.date,
      score: m.score,
      icon: m.icon,
      note,
      createdAt: (prev && prev.createdAt) || entry.createdAt || getNow()
    };
    await setDB(STORES.moodEntries, entry.id, record);
    sheet.close();
    showToast('改好啦', 'success');
    // 如果改的是今天的心情，同步更新缓存
    cacheTodayMood(record);
    // 写入长期记忆，让 AI 同步主人的心情变化
    try {
      await recordInteraction({
        characterId: 'global',
        role: 'user',
        source: 'mood',
        content: `改了${prettyDate(entry.date)}的心情：${m.label}${note ? `，${note}` : ''}`,
        mood: m.key,
        importance: 4,
        relatedApp: 'mood'
      });
    } catch (e) {
      console.warn('[mood] 记忆写入失败', e);
    }
    render();
  });

  body.querySelector('#mood-edit-del').addEventListener('click', () => {
    showConfirm({
      title: '删掉这条心情吗？',
      body: `${prettyDate(entry.date)} 的记录会不见哦`,
      confirmText: '删掉吧',
      cancelText: '再想想',
      danger: true,
      onConfirm: async () => {
        await deleteDB(STORES.moodEntries, entry.id);
        // 如果删的是今天的心情，清掉缓存，AI 上下文不再读到旧心情
        if (entry.date === todayStr()) {
          try { setData(KEYS.moodState, null); } catch (e) {}
        }
        sheet.close();
        showToast('删掉啦', 'default');
        render();
      }
    });
  });
}

// ════════════════════════════════════════
// 本周心情趋势图 + 月历视图
// ════════════════════════════════════════

// 心情分数对应颜色（走 CSS 变量，主题变了也跟着变）
// 1 难过红，2 低落暖橙，3 平静灰蓝，4 开心accent，5 超开心accent-dark
function moodColor(score) {
  switch (score) {
    case 1: return 'var(--danger)';
    case 2: return 'color-mix(in srgb, var(--danger) 55%, #F5B86A 45%)';
    case 3: return 'color-mix(in srgb, var(--text-hint) 55%, var(--accent) 45%)';
    case 4: return 'var(--accent)';
    case 5: return 'var(--accent-dark)';
    default: return 'var(--text-hint)';
  }
}

// 本周 7 天心情趋势柱状图（含今天，往前数 6 天）
// 柱子高度按 score 映射到 12~100%，没记录的那天画个矮灰兜底
function renderTrendChart(sorted) {
  const byDate = new Map();
  sorted.forEach((e) => byDate.set(e.date, e));
  const today = new Date();
  const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];
  const cols = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    const key = dateKey(d);
    const entry = byDate.get(key);
    const score = entry ? entry.score : 0;
    const height = score === 0 ? 0 : Math.max(12, (score / 5) * 100);
    const cls = score === 0 ? 'mood-trend-bar empty' : 'mood-trend-bar';
    const bg = score === 0 ? '' : `background:${moodColor(score)}`;
    const tip = score === 0 ? '没记' : moodFor(score).label;
    cols.push(`
      <div class="mood-trend-col" title="${tip}">
        <div class="mood-trend-bar-wrap">
          <div class="${cls}" style="height:${height}%;${bg}"></div>
        </div>
        <div class="mood-trend-label">${weekdayNames[d.getDay()]}</div>
      </div>
    `);
  }
  return `
    <div class="mood-section">
      <div class="mood-section-title">${createIcon('smile', 18).outerHTML}本周心情</div>
      <div class="mood-trend-chart">${cols.join('')}</div>
    </div>
  `;
}

// 月历视图：当月每一天一格，有记录的格子里画一个小色点，点一下打开详情
function renderCalendar(sorted) {
  const byDate = new Map();
  sorted.forEach((e) => byDate.set(e.date, e));
  const today = todayStr();
  const firstDay = new Date(calYear, calMonth, 1);
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const startWeekday = firstDay.getDay(); // 周日 = 0
  const weekdayHeads = ['日', '一', '二', '三', '四', '五', '六'];

  const cells = [];
  // 月首前面的空白格，让 1 号对齐到正确的星期列
  for (let i = 0; i < startWeekday; i++) {
    cells.push('<div class="mood-cal-cell empty"></div>');
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const entry = byDate.get(key);
    const isToday = key === today;
    const cls = ['mood-cal-cell'];
    if (isToday) cls.push('today');
    if (entry) cls.push('has-entry');
    const dot = entry
      ? `<span class="mood-cal-dot" style="background:${moodColor(entry.score)}"></span>`
      : '';
    cells.push(`
      <button class="${cls.join(' ')}" data-date="${entry ? key : ''}" ${entry ? '' : 'disabled'}>
        <span class="mood-cal-day">${d}</span>
        ${dot}
      </button>
    `);
  }

  return `
    <div class="mood-section">
      <div class="mood-cal-head">
        <button class="mood-cal-nav" id="mood-cal-prev" aria-label="上个月">${createIcon('back', 16).outerHTML}</button>
        <div class="mood-cal-title">${calYear}年${calMonth + 1}月</div>
        <button class="mood-cal-nav" id="mood-cal-next" aria-label="下个月">${createIcon('next', 16).outerHTML}</button>
      </div>
      <div class="mood-cal-weekhead">
        ${weekdayHeads.map((w) => `<span>${w}</span>`).join('')}
      </div>
      <div class="mood-cal-grid">${cells.join('')}</div>
    </div>
  `;
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
