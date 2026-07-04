// apps/countdown/index.js
// 倒计时 App——Phase 1 真实可用版。
// 功能：
//   1) 倒计时存 IndexedDB（STORES.countdowns），字段 id/title/date/color/repeat/createdAt
//   2) 列表按距今天数绝对值排序
//   3) 重复事件（year/month）自动计算下一次（含 2 月 29 日等边界处理）
//   4) 顶部大卡片突出最近一个倒计时
//   5) 每条显示：标题 + 日期 + "还有 X 天" / "已过 X 天" / "就是今天呀"
//   6) 右上角 + 新增（表单：标题 + 日期 input[type=date] + 颜色 + 重复 select）
//   7) 删除带 showConfirm
//   8) 第一人称软萌文案
//   9) 视觉值走 CSS 变量，马卡龙色为用户内容数据
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { STORES } from '../../core/storage-keys.js';
import { setDB, deleteDB, getAllDB, getData, setData, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { formatDate, injectStyle } from '../../core/util.js';
import { openApp } from '../../core/router.js';
import { applyAppBg } from '../../core/app-bg.js';

let containerEl = null;
// 到期检查的定时器（unmount 时清掉）
let dueCheckTimer = null;

// 5 个马卡龙色：用户给倒计时打的标签色，属于内容数据（非主题色）
const MACARON_COLORS = [
  { key: 'sakura',   hex: '#F5A0B0' },
  { key: 'lemon',    hex: '#F5D88A' },
  { key: 'matcha',   hex: '#B5D9A0' },
  { key: 'sky',      hex: '#A0C8E8' },
  { key: 'lavender', hex: '#C8A8E0' }
];
const DEFAULT_COLOR = MACARON_COLORS[0];
const REPEAT_LABELS = { none: '不重复', year: '每年', month: '每月' };

// 自定义样式（全部走 CSS 变量，马卡龙色仅作用于内容色条）
injectStyle('app-countdown-style', `
  .cd-hero{
    position:relative; overflow:hidden;
    background:linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%);
    color:var(--bubble-user-text);
    border-radius:var(--radius-card);
    padding:22px 20px 20px;
    box-shadow:var(--shadow-md);
    margin-bottom:18px;
  }
  .cd-hero-main{ position:relative; z-index:1; cursor:pointer; }
  .cd-hero-tag{
    font-size:var(--font-size-small);
    color:color-mix(in srgb, var(--bubble-user-text) 82%, transparent);
    letter-spacing:0.5px;
  }
  .cd-hero-title{
    font-size:var(--font-size-large); font-weight:600;
    margin-top:4px; line-height:1.3; word-break:break-word;
  }
  .cd-hero-days{
    font-size:48px; font-weight:700; line-height:1;
    margin-top:14px; letter-spacing:-1px;
  }
  .cd-hero-days-unit{
    font-size:var(--font-size-base); font-weight:500;
    margin-left:6px; opacity:0.92;
  }
  .cd-hero-date{
    font-size:var(--font-size-small);
    color:color-mix(in srgb, var(--bubble-user-text) 78%, transparent);
    margin-top:8px;
  }
  .cd-hero-deco{
    position:absolute; right:-24px; top:-24px;
    width:128px; height:128px; border-radius:50%;
    background:color-mix(in srgb, #fff 12%, transparent);
    pointer-events:none; z-index:0;
  }
  .cd-hero-actions{ position:absolute; right:10px; top:10px; z-index:2; }
  .cd-card{
    position:relative; background:var(--bg-card);
    border-radius:var(--radius-card);
    padding:14px 16px 14px 20px;
    box-shadow:var(--shadow-sm);
    margin-bottom:12px; overflow:hidden;
    transition:var(--motion);
  }
  .cd-card:active{ transform:scale(var(--press-scale)); }
  .cd-card-color{ position:absolute; left:0; top:0; bottom:0; width:4px; }
  .cd-card-row{ display:flex; align-items:center; gap:10px; }
  .cd-card-main{ flex:1; min-width:0; cursor:pointer; }
  .cd-card-title{
    font-size:var(--font-size-base); font-weight:600;
    color:var(--text-primary); line-height:1.3; word-break:break-word;
  }
  .cd-card-meta{
    font-size:var(--font-size-small); color:var(--text-secondary);
    margin-top:3px;
  }
  .cd-card-days-block{ flex-shrink:0; text-align:right; min-width:60px; }
  .cd-card-days{
    font-size:var(--font-size-title); font-weight:700;
    color:var(--accent); line-height:1;
  }
  .cd-card-days.today{ color:var(--accent-dark); }
  .cd-card-days.past{ color:var(--text-hint); }
  .cd-card-days-label{
    font-size:var(--font-size-small); color:var(--text-hint);
    margin-top:3px;
  }
  .cd-card-actions{ display:flex; flex-shrink:0; }
  .cd-icon-btn{
    width:30px; height:30px; border-radius:50%;
    background:transparent; color:var(--text-hint);
    display:flex; align-items:center; justify-content:center;
    transition:var(--motion);
  }
  .cd-icon-btn:active{ transform:scale(var(--press-scale)); }
  .cd-icon-btn:hover{ color:#E8888C; }
  .cd-empty-icon{ color:var(--text-hint); opacity:0.5; margin-bottom:12px; }
  .cd-form-row{ margin-bottom:14px; }
  .cd-form-label{
    font-size:var(--font-size-small); color:var(--text-secondary);
    margin-bottom:6px; display:block;
  }
  .cd-color-picker{ display:flex; gap:10px; }
  .cd-color-dot{
    width:30px; height:30px; border-radius:50%;
    cursor:pointer; border:2px solid transparent;
    transition:var(--motion);
  }
  .cd-color-dot:active{ transform:scale(var(--press-scale)); }
  .cd-color-dot.selected{
    border-color:var(--text-primary);
    box-shadow:0 0 0 2px var(--bg-card) inset;
  }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="cd-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">倒计时</div>
      <button class="app-header-gear" id="cd-settings" aria-label="倒计时设置">${createIcon('settings', 18).outerHTML}</button>
      <button class="app-add" id="cd-add" aria-label="新增倒计时">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="cd-body">
      <div id="cd-list"></div>
    </div>
  `;
  container.querySelector('#cd-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#cd-add').addEventListener('click', () => openEditor(null));
  // 齿轮跳到设置「数据与系统」分组
  container.querySelector('#cd-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'system' } }));
  await render();
  // 进入时检查一遍今天到期的倒计时，给个 toast 提醒
  checkDueCountdowns();
  // 每 10 分钟再检查一次（避免长时间挂着错过提醒）
  dueCheckTimer = setInterval(checkDueCountdowns, 10 * 60 * 1000);
  applyAppBg(container, 'countdown');
}

export function unmount() {
  containerEl = null;
  if (dueCheckTimer) { clearInterval(dueCheckTimer); dueCheckTimer = null; }
}

// ════════════════════════════════════════
// 列表渲染（hero + 其余）
// ════════════════════════════════════════

async function render() {
  const listEl = containerEl?.querySelector('#cd-list');
  if (!listEl) return;
  let countdowns = [];
  try {
    countdowns = await getAllDB(STORES.countdowns);
  } catch (e) {
    console.warn('[countdown] 读取失败', e);
    showToast('倒计时读不出来嘛，等一下再试试', 'error');
  }
  if (countdowns.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="cd-empty-icon">${createIcon('calendar', 48).outerHTML}</div>
        <div class="empty-state-text">还没有倒计时，加一个重要日子嘛</div>
      </div>
    `;
    return;
  }
  // 计算每条的下次日期 + 距今天数
  const enriched = countdowns.map((cd) => {
    const next = computeNextDate(cd);
    const days = getDaysUntil(next);
    return { cd, next, days };
  });
  // 按距今天数绝对值升序排（最近的最靠前）
  enriched.sort((a, b) => Math.abs(a.days) - Math.abs(b.days));
  const [hero, ...rest] = enriched;
  let html = renderHero(hero);
  if (rest.length > 0) html += rest.map(renderCard).join('');
  listEl.innerHTML = html;
  // 绑定事件
  enriched.forEach((en) => {
    const card = listEl.querySelector(`[data-id="${cssEscape(en.cd.id)}"]`);
    if (!card) return;
    const main = card.querySelector('.cd-card-main, .cd-hero-main');
    if (main) main.addEventListener('click', () => openEditor(en.cd));
    const delBtn = card.querySelector('.cd-del');
    if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(en.cd); });
  });
}

function renderHero(en) {
  const { cd, next, days } = en;
  const colorHex = (MACARON_COLORS.find((c) => c.key === cd.color) || DEFAULT_COLOR).hex;
  const dateText = formatDate(next, { full: true });
  let daysText, daysUnit;
  if (days === 0) { daysText = '今天'; daysUnit = ''; }
  else if (days > 0) { daysText = String(days); daysUnit = '天后'; }
  else { daysText = String(Math.abs(days)); daysUnit = '天前'; }
  const repeatLabel = REPEAT_LABELS[cd.repeat] || '';
  const trashIcon = createIcon('trash', 16).outerHTML;
  return `
    <div class="cd-hero" data-id="${escapeAttr(cd.id)}">
      <div class="cd-hero-deco" style="background:color-mix(in srgb, ${colorHex} 28%, transparent)"></div>
      <div class="cd-hero-actions">
        <button class="cd-icon-btn cd-del" aria-label="删除倒计时" style="color:color-mix(in srgb, var(--bubble-user-text) 85%, transparent)">${trashIcon}</button>
      </div>
      <div class="cd-hero-main" role="button" tabindex="0" aria-label="编辑倒计时">
        <div class="cd-hero-tag">${repeatLabel ? escapeHTML(repeatLabel) + ' · 最近的日子' : '最近的日子'}</div>
        <div class="cd-hero-title">${escapeHTML(cd.title)}</div>
        <div class="cd-hero-days">${escapeHTML(daysText)}<span class="cd-hero-days-unit">${escapeHTML(daysUnit)}</span></div>
        <div class="cd-hero-date">${escapeHTML(dateText)}</div>
      </div>
    </div>
  `;
}

function renderCard(en) {
  const { cd, next, days } = en;
  const colorHex = (MACARON_COLORS.find((c) => c.key === cd.color) || DEFAULT_COLOR).hex;
  const dateText = formatDate(next, { full: true });
  let daysText, daysLabel, daysClass;
  if (days === 0) { daysText = '今天'; daysLabel = '就是今天呀'; daysClass = 'today'; }
  else if (days > 0) { daysText = String(days); daysLabel = '天后'; daysClass = ''; }
  else { daysText = String(Math.abs(days)); daysLabel = '天前'; daysClass = 'past'; }
  const repeatLabel = REPEAT_LABELS[cd.repeat] || '';
  const trashIcon = createIcon('trash', 16).outerHTML;
  return `
    <div class="cd-card" data-id="${escapeAttr(cd.id)}">
      <div class="cd-card-color" style="background:${colorHex}"></div>
      <div class="cd-card-row">
        <div class="cd-card-main" role="button" tabindex="0" aria-label="编辑倒计时">
          <div class="cd-card-title">${escapeHTML(cd.title)}</div>
          <div class="cd-card-meta">${escapeHTML(dateText)}${repeatLabel ? ' · ' + escapeHTML(repeatLabel) : ''}</div>
        </div>
        <div class="cd-card-days-block">
          <div class="cd-card-days ${daysClass}">${escapeHTML(daysText)}</div>
          <div class="cd-card-days-label">${escapeHTML(daysLabel)}</div>
        </div>
        <div class="cd-card-actions">
          <button class="cd-icon-btn cd-del" aria-label="删除倒计时" title="删除">${trashIcon}</button>
        </div>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════
// 重复事件：计算下一次日期
//   - none：用原日期
//   - year：找下一个 (月, 日) >= 今天（含闰年 2 月 29 日跳过不存在的年份）
//   - month：找下一个 (日) >= 今天（跳过没有该日的月份，如 2 月没 30 号）
// ════════════════════════════════════════

function computeNextDate(cd) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // cd.date 是 YYYY-MM-DD
  const base = new Date(cd.date + 'T00:00:00');
  if (isNaN(base.getTime())) return today;
  if (cd.repeat === 'none') return base;
  const mo = base.getMonth();
  const dy = base.getDate();
  if (cd.repeat === 'year') {
    // 往后找 5 年，命中第一个存在且 >= 今天的
    for (let i = 0; i < 5; i++) {
      const yr = today.getFullYear() + i;
      const candidate = new Date(yr, mo, dy, 0, 0, 0, 0);
      // 验证这一天真的存在（防 2 月 29 日滚到 3 月 1 日）
      if (candidate.getMonth() === mo && candidate.getDate() === dy && candidate >= today) {
        return candidate;
      }
    }
    return base;
  }
  if (cd.repeat === 'month') {
    // 往后找 24 个月，命中第一个存在且 >= 今天的
    let yr = today.getFullYear();
    let m = today.getMonth();
    for (let i = 0; i < 24; i++) {
      const candidate = new Date(yr, m, dy, 0, 0, 0, 0);
      if (candidate.getMonth() === m && candidate.getDate() === dy && candidate >= today) {
        return candidate;
      }
      m++;
      if (m > 11) { m = 0; yr++; }
    }
    return base;
  }
  return base;
}

// 距今天数：正 = 未来还有 X 天，负 = 已过 X 天，0 = 今天
function getDaysUntil(targetDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(targetDate);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400_000);
}

// ════════════════════════════════════════
// 删除
// ════════════════════════════════════════

function confirmDelete(cd) {
  showConfirm({
    title: '删掉这个倒计时吗？',
    body: '删掉就找不回来啦，确定的话就点确认嘛',
    confirmText: '删掉吧',
    cancelText: '再想想',
    danger: true,
    onConfirm: async () => {
      try {
        await deleteDB(STORES.countdowns, cd.id);
        showToast('删掉啦', 'default', 1200);
        await render();
        bus.emit('countdown:changed', { id: cd.id, action: 'delete' });
      } catch (e) {
        console.warn('[countdown] 删除失败', e);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

// ════════════════════════════════════════
// 新增 / 编辑表单（bottomSheet）
// ════════════════════════════════════════

function openEditor(cd) {
  const editing = !!cd;
  const init = cd || { id: null, title: '', date: '', color: DEFAULT_COLOR.key, repeat: 'none' };
  const todayStr = new Date().toISOString().slice(0, 10);
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="cd-form-row">
      <label class="cd-form-label" for="cd-title">标题</label>
      <input class="input" id="cd-title" type="text" placeholder="比如：她的生日、考试日..." value="${escapeAttr(init.title)}" maxlength="40">
    </div>
    <div class="cd-form-row">
      <label class="cd-form-label" for="cd-date">日期</label>
      <input class="input" id="cd-date" type="date" value="${escapeAttr(init.date)}" min="1900-01-01" max="2999-12-31">
    </div>
    <div class="cd-form-row">
      <label class="cd-form-label">颜色标签</label>
      <div class="cd-color-picker" id="cd-colors">
        ${MACARON_COLORS.map((c) => `
          <button type="button" class="cd-color-dot ${c.key === init.color ? 'selected' : ''}" data-color="${c.key}" style="background:${c.hex}" aria-label="${c.key}"></button>
        `).join('')}
      </div>
    </div>
    <div class="cd-form-row">
      <label class="cd-form-label" for="cd-repeat">重复</label>
      <select class="input" id="cd-repeat">
        <option value="none" ${init.repeat === 'none' ? 'selected' : ''}>不重复</option>
        <option value="year" ${init.repeat === 'year' ? 'selected' : ''}>每年（生日、纪念日）</option>
        <option value="month" ${init.repeat === 'month' ? 'selected' : ''}>每月</option>
      </select>
    </div>
    <button class="btn primary block" id="cd-save">${editing ? '改好啦' : '加进去'}</button>
  `;
  const sheet = showBottomSheet({
    title: editing ? '编辑倒计时' : '加一个重要日子',
    bodyElement: body,
    dismissible: true
  });
  let chosenColor = init.color;
  body.querySelectorAll('.cd-color-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      chosenColor = dot.dataset.color;
      body.querySelectorAll('.cd-color-dot').forEach((d) => d.classList.remove('selected'));
      dot.classList.add('selected');
    });
  });
  // 新建时默认日期为今天
  const dateInput = body.querySelector('#cd-date');
  if (!dateInput.value) dateInput.value = todayStr;
  body.querySelector('#cd-save').addEventListener('click', async () => {
    const title = body.querySelector('#cd-title').value.trim();
    const date = body.querySelector('#cd-date').value;
    const repeat = body.querySelector('#cd-repeat').value;
    if (!title) { showToast('得给它起个名字嘛', 'error'); return; }
    if (!date) { showToast('选一个日期嘛', 'error'); return; }
    try {
      const id = init.id || generateId('countdown');
      const record = {
        id,
        title,
        date,
        color: chosenColor,
        repeat,
        createdAt: init.createdAt || getNow()
      };
      await setDB(STORES.countdowns, id, record);
      sheet.close();
      showToast(editing ? '改好啦，已帮你更新' : '加好啦，我会帮你盯着这个日子', 'success', 1400);
      await render();
      bus.emit('countdown:changed', { id, action: editing ? 'update' : 'add' });
    } catch (e) {
      console.warn('[countdown] 保存失败', e);
      showToast('没保存成功，再试一下嘛', 'error');
    }
  });
  // 自动聚焦标题
  setTimeout(() => { try { body.querySelector('#cd-title')?.focus(); } catch (e) {} }, 60);
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) { return escapeHTML(s); }
function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, '\\$&');
}

// ════════════════════════════════════════
// 到期通知 + 桌面 widget 数据
// ════════════════════════════════════════

// localStorage key 前缀：记录某倒计时今天已通知过，避免重复打扰
const LS_NOTIFIED_PREFIX = 'cd_notified_';

// 检查今天到期的倒计时：每个今天到期的提示一次「XXX 到啦！」
async function checkDueCountdowns() {
  try {
    const all = await getAllDB(STORES.countdowns);
    if (!Array.isArray(all) || all.length === 0) return;
    const todayStr = new Date().toISOString().slice(0, 10);
    for (const cd of all) {
      if (!cd || !cd.id) continue;
      const next = computeNextDate(cd);
      const days = getDaysUntil(next);
      if (days !== 0) continue;
      // 同一天只通知一次
      const k = LS_NOTIFIED_PREFIX + cd.id + '_' + todayStr;
      if (getData(k, false)) continue;
      setData(k, true);
      showToast(`${cd.title} 到啦！`, 'success', 2400);
      bus.emit('countdown:due', { id: cd.id, title: cd.title });
    }
  } catch (e) {
    console.warn('[countdown] 到期检查失败', e);
  }
}

/**
 * 取最近的一个倒计时（供桌面 widget 用）。
 * @returns {Promise<{title:string, days:number, date:Date}|null>}
 */
export async function getUpcomingCountdown() {
  try {
    const all = await getAllDB(STORES.countdowns);
    if (!Array.isArray(all) || all.length === 0) return null;
    const enriched = all.map((cd) => ({
      cd,
      next: computeNextDate(cd),
      days: getDaysUntil(computeNextDate(cd))
    }));
    // 按距今天数绝对值升序排（最近的最靠前）
    enriched.sort((a, b) => Math.abs(a.days) - Math.abs(b.days));
    const top = enriched[0];
    if (!top) return null;
    return {
      title: top.cd.title || '倒计时',
      days: top.days,
      date: top.next
    };
  } catch (e) {
    console.warn('[countdown] 取最近倒计时失败', e);
    return null;
  }
}
