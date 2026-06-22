// apps/anniversary.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow
//   from '../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon

import {
  getData, setData, generateId, getNow
} from '../core/storage.js';

import {
  showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon
} from '../core/ui.js';

const KEY = 'anniversaries';
const STYLE_ID = 'anniversary-styles';

const MARKERS = [
  { id: 'heart', name: '小心意' },
  { id: 'rabbit', name: '小兔子' },
  { id: 'star', name: '小星星' },
  { id: 'flower', name: '小花' },
  { id: 'moon', name: '月亮' },
  { id: 'cake', name: '蛋糕' }
];

let container = null;
let viewDate = new Date();
let todayCache = '';
let midnightTimer = null;
let visibilityHandler = null;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ann-screen {
      position: fixed;
      inset: 0;
      z-index: 10;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .ann-nav {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 100;
      height: calc(56px + env(safe-area-inset-top));
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      padding: env(safe-area-inset-top) 20px 0;
      background: var(--surface-glass);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
    }

    .ann-nav-title {
      flex: 1;
      min-width: 0;
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ann-body {
      flex: 1;
      overflow-x: hidden;
      overflow-y: auto;
      padding: calc(56px + env(safe-area-inset-top) + 18px) 20px calc(88px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling: touch;
    }

    .ann-hero {
      padding: 22px;
      border-radius: 28px;
      background: var(--bg-card);
      box-shadow: var(--shadow-md);
    }

    .ann-hero-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-md);
    }

    .ann-hero-title {
      color: var(--text-primary);
      font-size: 24px;
      font-weight: 600;
      line-height: 1.25;
      letter-spacing: -0.02em;
    }

    .ann-hero-text {
      margin-top: 8px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .ann-mark {
      width: 48px;
      height: 48px;
      flex: 0 0 48px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 18px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .ann-calendar {
      margin-top: var(--spacing-md);
      padding: var(--spacing-md);
      border-radius: 28px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .ann-calendar-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-md);
    }

    .ann-month-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .ann-month-actions {
      display: flex;
      align-items: center;
      gap: var(--spacing-xs);
    }

    .ann-week-row,
    .ann-date-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 6px;
    }

    .ann-week {
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1;
    }

    .ann-day {
      min-height: 52px;
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 3px;
      border-radius: 16px;
      color: var(--text-primary);
      background: transparent;
      transition: var(--motion);
    }

    .ann-day:active {
      transform: scale(0.96);
    }

    .ann-day.muted {
      color: var(--text-hint);
    }

    .ann-day.today {
      background: var(--accent-light);
      color: var(--accent-dark);
      font-weight: 600;
    }

    .ann-day.has-mark {
      background: var(--surface-muted);
    }

    .ann-day.today.has-mark {
      background: var(--accent-light);
    }

    .ann-day-num {
      font-size: 13px;
      line-height: 1;
    }

    .ann-day-marker {
      width: 16px;
      height: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--accent-dark);
    }

    .ann-dot-row {
      min-height: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
    }

    .ann-dot {
      width: 5px;
      height: 5px;
      border-radius: 999px;
      background: var(--accent);
    }

    .ann-dot.ai {
      background: var(--accent-dark);
    }

    .ann-section {
      margin-top: 24px;
    }

    .ann-section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-sm);
      padding: 0 2px;
    }

    .ann-section-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .ann-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .ann-card {
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
      cursor: pointer;
    }

    .ann-card:active {
      transform: scale(0.98);
    }

    .ann-card-top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--spacing-md);
    }

    .ann-card-main {
      flex: 1;
      min-width: 0;
    }

    .ann-card-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }

    .ann-card-marker {
      width: 22px;
      height: 22px;
      flex: 0 0 22px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 9px;
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .ann-card-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .ann-card-date {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    .ann-card-days {
      flex: 0 0 auto;
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--accent-light);
      color: var(--accent-dark);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.2;
    }

    .ann-card-note {
      margin-top: 10px;
      color: var(--text-secondary);
      font-size: var(--font-size-base);
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .ann-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 12px;
    }

    .ann-tag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 500;
      line-height: 1.4;
    }

    .ann-tag.ai {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .ann-actions {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      margin-top: 14px;
    }

    .ann-action-btn {
      min-height: 32px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 6px 12px;
      border-radius: 12px;
      color: var(--text-secondary);
      background: var(--surface-muted);
      font-size: var(--font-size-small);
      font-weight: 500;
      transition: var(--motion);
    }

    .ann-action-btn:active {
      transform: scale(0.96);
    }

    .ann-action-btn.danger {
      color: var(--accent-dark);
    }

    .ann-empty {
      min-height: 220px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-lg);
      border-radius: 24px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      color: var(--text-secondary);
      text-align: center;
    }

    .ann-empty-icon {
      width: 58px;
      height: 58px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 22px;
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .ann-empty-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .ann-empty-text {
      max-width: 260px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .ann-sheet-title {
      margin-bottom: var(--spacing-md);
      color: var(--text-primary);
      font-size: 20px;
      font-weight: 600;
      line-height: 1.35;
      letter-spacing: -0.01em;
    }

    .ann-field {
      margin-bottom: var(--spacing-md);
    }

    .ann-field-label {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: var(--spacing-sm);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 500;
      line-height: 1.4;
    }

    .ann-field-label svg {
      width: 15px;
      height: 15px;
      color: var(--accent);
    }

    .ann-input,
    .ann-textarea {
      width: 100%;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-primary);
      font-size: var(--font-size-base);
    }

    .ann-input {
      min-height: 46px;
      padding: 10px var(--spacing-md);
    }

    .ann-textarea {
      min-height: 120px;
      padding: 12px var(--spacing-md);
      line-height: 1.6;
    }

    .ann-input::placeholder,
    .ann-textarea::placeholder {
      color: var(--text-hint);
    }

    .ann-marker-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--spacing-sm);
    }

    .ann-marker-btn {
      min-height: 58px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 500;
      transition: var(--motion);
    }

    .ann-marker-btn.active {
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .ann-marker-btn:active {
      transform: scale(0.96);
    }

    .ann-marker-btn svg {
      width: 22px;
      height: 22px;
    }

    .ann-switch-row {
      min-height: 52px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-md);
      margin-bottom: var(--spacing-md);
    }

    .ann-switch-title {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 500;
    }

    .ann-switch-sub {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    .ann-sheet-actions {
      display: flex;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-lg);
    }

    .ann-sheet-actions button {
      flex: 1;
    }
  `;

  document.head.appendChild(style);
}

function readList() {
  const list = getData(KEY);
  if (!Array.isArray(list)) return [];

  return list
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      id: item.id || generateId(),
      name: item.name || '未命名',
      date: normalizeDateString(item.date),
      note: item.note || '',
      aiReminder: item.aiReminder !== false,
      source: item.source === 'ai' ? 'ai' : 'user',
      characterId: item.characterId || '',
      createdBy: item.createdBy || (item.source === 'ai' ? 'AI' : '我'),
      marker: getValidMarker(item.marker),
      createdAt: item.createdAt || getNow(),
      updatedAt: item.updatedAt || item.createdAt || getNow()
    }))
    .filter((item) => item.date);
}

function saveList(list) {
  setData(KEY, Array.isArray(list) ? list : []);
}

function getValidMarker(marker) {
  return MARKERS.some((item) => item.id === marker) ? marker : 'heart';
}

function normalizeDateString(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return text.slice(0, 10);
  return toDateStringLocal(date);
}

function getTodayString() {
  return toDateStringLocal(new Date());
}

function toDateStringLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getMonthDay(dateString) {
  return String(dateString || '').slice(5, 10);
}

function dateForYear(dateString, year) {
  const monthDay = getMonthDay(dateString);
  if (!monthDay) return '';
  return `${year}-${monthDay}`;
}

function getNextOccurrence(dateString) {
  const today = new Date(`${getTodayString()}T00:00:00`);
  const thisYear = today.getFullYear();

  let candidateString = dateForYear(dateString, thisYear);
  let candidate = new Date(`${candidateString}T00:00:00`);

  if (candidate.getTime() < today.getTime()) {
    candidateString = dateForYear(dateString, thisYear + 1);
    candidate = new Date(`${candidateString}T00:00:00`);
  }

  return {
    date: candidateString,
    days: Math.ceil((candidate.getTime() - today.getTime()) / 86400000)
  };
}

function getDaysDiff(dateString) {
  return getNextOccurrence(dateString).days;
}

function getDayText(days) {
  if (days === 0) return '今天';
  if (days > 0) return `还有 ${days} 天`;
  return `已过 ${Math.abs(days)} 天`;
}

function getMonthTitle(date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long'
  }).format(date);
}

export async function mount(containerEl) {
  injectStyles();
  container = containerEl;
  viewDate = new Date();
  todayCache = getTodayString();

  const screen = document.createElement('section');
  screen.className = 'ann-screen';

  const nav = document.createElement('div');
  nav.className = 'ann-nav';

  const backButton = document.createElement('button');
  backButton.className = 'icon-button';
  backButton.type = 'button';
  backButton.setAttribute('aria-label', '返回');
  backButton.appendChild(createIcon('back', 22));
  backButton.addEventListener('click', () => window.closeCurrentApp?.());

  const title = document.createElement('div');
  title.className = 'ann-nav-title';
  title.textContent = '纪念日';

  const addButton = document.createElement('button');
  addButton.className = 'icon-button soft';
  addButton.type = 'button';
  addButton.setAttribute('aria-label', '新建');
  addButton.appendChild(createIcon('add', 22));
  addButton.addEventListener('click', () => openEditor(null));

  const body = document.createElement('div');
  body.className = 'ann-body';

  nav.append(backButton, title, addButton);
  screen.append(nav, body);

  container.innerHTML = '';
  container.appendChild(screen);

  bindDateRefresh();
  render();
}

export function unmount() {
  if (midnightTimer) {
    window.clearInterval(midnightTimer);
    midnightTimer = null;
  }

  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }

  if (container) {
    container.innerHTML = '';
    container = null;
  }
}

export async function getNextAnniversary() {
  const list = readList();
  if (!list.length) return null;

  const upcoming = list
    .map((item) => {
      const next = getNextOccurrence(item.date);
      return {
        ...item,
        days: next.days,
        nextDate: next.date
      };
    })
    .sort((a, b) => a.days - b.days)[0];

  if (!upcoming) return null;

  return {
    name: upcoming.name,
    days: upcoming.days,
    date: upcoming.nextDate,
    originalDate: upcoming.date,
    note: upcoming.note || ''
  };
}

export async function checkTodayAnniversaries() {
  const todayMonthDay = getMonthDay(getTodayString());

  return readList()
    .filter((item) => getMonthDay(item.date) === todayMonthDay && item.aiReminder !== false)
    .map((item) => ({
      id: item.id,
      name: item.name,
      date: item.date,
      note: item.note || '',
      source: item.source || 'user',
      characterId: item.characterId || '',
      createdBy: item.createdBy || '',
      marker: item.marker || 'heart'
    }));
}

export async function addAnniversaryMark({
  name,
  date,
  note = '',
  aiReminder = true,
  source = 'ai',
  characterId = '',
  createdBy = 'AI',
  marker = 'heart'
} = {}) {
  const cleanName = String(name || '').trim();
  const cleanDate = normalizeDateString(date);
  const cleanNote = String(note || '').trim();
  const cleanMarker = getValidMarker(marker);

  if (!cleanName || !cleanDate) return null;

  const list = readList();
  const exists = list.find((item) =>
    item.name === cleanName &&
    getMonthDay(item.date) === getMonthDay(cleanDate) &&
    item.characterId === characterId
  );

  if (exists) {
    const updated = {
      ...exists,
      date: cleanDate,
      note: cleanNote || exists.note,
      aiReminder,
      source: source === 'ai' ? 'ai' : 'user',
      characterId,
      createdBy,
      marker: cleanMarker,
      updatedAt: getNow()
    };

    saveList(list.map((item) => item.id === exists.id ? updated : item));
    return updated;
  }

  const item = {
    id: generateId(),
    name: cleanName,
    date: cleanDate,
    note: cleanNote,
    aiReminder,
    source: source === 'ai' ? 'ai' : 'user',
    characterId,
    createdBy,
    marker: cleanMarker,
    createdAt: getNow(),
    updatedAt: getNow()
  };

  saveList([item, ...list]);
  return item;
}

function bindDateRefresh() {
  if (midnightTimer) window.clearInterval(midnightTimer);
  if (visibilityHandler) document.removeEventListener('visibilitychange', visibilityHandler);

  midnightTimer = window.setInterval(() => {
    const today = getTodayString();
    if (today !== todayCache) {
      todayCache = today;
      viewDate = new Date();
      render();
    }
  }, 60 * 1000);

  visibilityHandler = () => {
    if (document.hidden) return;
    const today = getTodayString();
    if (today !== todayCache) {
      todayCache = today;
      viewDate = new Date();
    }
    render();
  };

  document.addEventListener('visibilitychange', visibilityHandler);
}

function render() {
  const body = container?.querySelector('.ann-body');
  if (!body) return;

  const list = readList();

  body.innerHTML = '';
  body.appendChild(createHero(list));
  body.appendChild(createCalendar(list));
  body.appendChild(createListSection(list));
}

function createHero(list) {
  const hero = document.createElement('section');
  hero.className = 'ann-hero';

  const top = document.createElement('div');
  top.className = 'ann-hero-top';

  const main = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'ann-hero-title';
  title.textContent = '把重要日子圈起来';

  const text = document.createElement('div');
  text.className = 'ann-hero-text';
  text.textContent = list.length
    ? `已经收好 ${list.length} 个小标记`
    : '生日、约定、第一次见面，都可以放在这里。AI 也能帮你悄悄记下重要日子。';

  const mark = document.createElement('div');
  mark.className = 'ann-mark';
  mark.appendChild(createCalendarSvg());

  main.append(title, text);
  top.append(main, mark);
  hero.appendChild(top);

  return hero;
}

function createCalendar(list) {
  const box = document.createElement('section');
  box.className = 'ann-calendar';

  const head = document.createElement('div');
  head.className = 'ann-calendar-head';

  const title = document.createElement('div');
  title.className = 'ann-month-title';
  title.textContent = getMonthTitle(viewDate);

  const actions = document.createElement('div');
  actions.className = 'ann-month-actions';

  const prev = document.createElement('button');
  prev.className = 'icon-button soft';
  prev.type = 'button';
  prev.appendChild(createIcon('back', 18));
  prev.addEventListener('click', () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
    render();
  });

  const next = document.createElement('button');
  next.className = 'icon-button soft';
  next.type = 'button';
  next.appendChild(createIcon('arrow-right', 18));
  next.addEventListener('click', () => {
    viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1);
    render();
  });

  actions.append(prev, next);
  head.append(title, actions);

  const week = document.createElement('div');
  week.className = 'ann-week-row';

  ['一', '二', '三', '四', '五', '六', '日'].forEach((label) => {
    const item = document.createElement('div');
    item.className = 'ann-week';
    item.textContent = label;
    week.appendChild(item);
  });

  const grid = document.createElement('div');
  grid.className = 'ann-date-grid';

  getCalendarDays(viewDate).forEach((date) => {
    grid.appendChild(createDayCell(date, list));
  });

  box.append(head, week, grid);
  return box;
}

function getCalendarDays(date) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const first = new Date(year, month, 1);
  const firstDay = first.getDay() || 7;
  const start = new Date(year, month, 2 - firstDay);

  const days = [];
  for (let i = 0; i < 42; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function createDayCell(date, list) {
  const dateString = toDateStringLocal(date);
  const monthNow = viewDate.getMonth();
  const marks = list.filter((item) => getMonthDay(item.date) === getMonthDay(dateString));
  const today = dateString === getTodayString();

  const button = document.createElement('button');
  button.className = `ann-day ${date.getMonth() !== monthNow ? 'muted' : ''} ${today ? 'today' : ''} ${marks.length ? 'has-mark' : ''}`;
  button.type = 'button';

  const num = document.createElement('div');
  num.className = 'ann-day-num';
  num.textContent = String(date.getDate());

  const markerWrap = document.createElement('div');
  markerWrap.className = 'ann-day-marker';
  if (marks[0]) markerWrap.appendChild(createMarkerSvg(marks[0].marker || 'heart', 16));

  const dots = document.createElement('div');
  dots.className = 'ann-dot-row';

  marks.slice(0, 3).forEach((item) => {
    const dot = document.createElement('span');
    dot.className = `ann-dot ${item.source === 'ai' ? 'ai' : ''}`;
    dots.appendChild(dot);
  });

  button.append(num, markerWrap, dots);

  button.addEventListener('click', () => {
    const existing = marks[0] || null;
    openEditor(existing, dateString);
  });

  return button;
}

function createListSection(list) {
  const section = document.createElement('section');
  section.className = 'ann-section';

  const head = document.createElement('div');
  head.className = 'ann-section-head';

  const title = document.createElement('div');
  title.className = 'ann-section-title';
  title.textContent = '记录';

  head.appendChild(title);
  section.appendChild(head);

  if (!list.length) {
    section.appendChild(createEmptyState());
    return section;
  }

  const wrap = document.createElement('div');
  wrap.className = 'ann-list';

  list
    .map((item) => {
      const next = getNextOccurrence(item.date);
      return {
        ...item,
        days: next.days,
        nextDate: next.date
      };
    })
    .sort((a, b) => a.days - b.days)
    .forEach((item) => {
      wrap.appendChild(createCard(item));
    });

  section.appendChild(wrap);
  return section;
}

function createCard(item) {
  const card = document.createElement('article');
  card.className = 'ann-card';
  card.setAttribute('role', 'button');
  card.tabIndex = 0;

  const top = document.createElement('div');
  top.className = 'ann-card-top';

  const main = document.createElement('div');
  main.className = 'ann-card-main';

  const titleRow = document.createElement('div');
  titleRow.className = 'ann-card-title-row';

  const marker = document.createElement('div');
  marker.className = 'ann-card-marker';
  marker.appendChild(createMarkerSvg(item.marker || 'heart', 18));

  const title = document.createElement('div');
  title.className = 'ann-card-title';
  title.textContent = item.name;

  titleRow.append(marker, title);

  const date = document.createElement('div');
  date.className = 'ann-card-date';
  date.textContent = `${item.nextDate} · 原始日期 ${item.date}`;

  main.append(titleRow, date);

  const days = document.createElement('div');
  days.className = 'ann-card-days';
  days.textContent = getDayText(item.days);

  top.append(main, days);

  const note = document.createElement('div');
  note.className = 'ann-card-note';
  note.textContent = item.note || '没有备注';

  const tags = document.createElement('div');
  tags.className = 'ann-tags';

  const sourceTag = document.createElement('span');
  sourceTag.className = `ann-tag ${item.source === 'ai' ? 'ai' : ''}`;
  sourceTag.textContent = item.source === 'ai'
    ? `${item.createdBy || 'AI'} 记下的`
    : '我记下的';

  const remindTag = document.createElement('span');
  remindTag.className = 'ann-tag';
  remindTag.textContent = item.aiReminder !== false ? 'AI 可提醒' : '仅自己看';

  tags.append(sourceTag, remindTag);

  const actions = document.createElement('div');
  actions.className = 'ann-actions';

  const editButton = document.createElement('button');
  editButton.className = 'ann-action-btn';
  editButton.type = 'button';
  editButton.append(createIcon('edit', 14), document.createTextNode('编辑'));
  editButton.addEventListener('click', (event) => {
    event.stopPropagation();
    openEditor(item);
  });

  const deleteButton = document.createElement('button');
  deleteButton.className = 'ann-action-btn danger';
  deleteButton.type = 'button';
  deleteButton.append(createIcon('delete', 14), document.createTextNode('删除'));
  deleteButton.addEventListener('click', async (event) => {
    event.stopPropagation();
    await deleteItem(item);
  });

  actions.append(editButton, deleteButton);
  card.append(top, note, tags, actions);

  card.addEventListener('click', () => openEditor(item));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openEditor(item);
    }
  });

  return card;
}

function createEmptyState() {
  const empty = document.createElement('div');
  empty.className = 'ann-empty';

  const icon = document.createElement('div');
  icon.className = 'ann-empty-icon';
  icon.appendChild(createMarkerSvg('rabbit', 26));

  const title = document.createElement('div');
  title.className = 'ann-empty-title';
  title.textContent = '还没有标记';

  const text = document.createElement('div');
  text.className = 'ann-empty-text';
  text.textContent = '点右上角新建，或者在日历里点一天。';

  empty.append(icon, title, text);
  return empty;
}

function openEditor(item, presetDate = '') {
  const isEdit = Boolean(item);
  let selectedMarker = getValidMarker(item?.marker || 'heart');

  const sheet = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'ann-sheet-title';
  title.textContent = isEdit ? '编辑小标记' : '新建小标记';

  const nameField = createInputField('名称', '比如：我的生日', item?.name || '');
  const dateField = createInputField('日期', '', item?.date || presetDate || getTodayString(), 'date');
  const noteField = createTextareaField('备注', '写一句简单的小备注', item?.note || '');
  const markerField = createMarkerField(selectedMarker, (marker) => {
    selectedMarker = marker;
  });

  const switchRow = createSwitchRow(item?.aiReminder !== false);

  const actions = document.createElement('div');
  actions.className = 'ann-sheet-actions';

  const cancelButton = document.createElement('button');
  cancelButton.className = 'btn-ghost';
  cancelButton.type = 'button';
  cancelButton.textContent = '取消';
  cancelButton.addEventListener('click', hideBottomSheet);

  const saveButton = document.createElement('button');
  saveButton.className = 'btn-primary';
  saveButton.type = 'button';
  saveButton.textContent = isEdit ? '保存' : '记下来';
  saveButton.addEventListener('click', () => {
    const name = nameField.querySelector('input').value.trim();
    const date = normalizeDateString(dateField.querySelector('input').value);
    const note = noteField.querySelector('textarea').value.trim();
    const aiReminder = switchRow.querySelector('.switch').classList.contains('active');

    if (!name) {
      showToast('还没写名称');
      return;
    }

    if (!date) {
      showToast('还没选日期');
      return;
    }

    const list = readList();
    const now = getNow();

    if (isEdit) {
      saveList(list.map((record) => record.id === item.id ? {
        ...record,
        name,
        date,
        note,
        aiReminder,
        marker: selectedMarker,
        updatedAt: now
      } : record));
    } else {
      saveList([{
        id: generateId(),
        name,
        date,
        note,
        aiReminder,
        source: 'user',
        characterId: '',
        createdBy: '我',
        marker: selectedMarker,
        createdAt: now,
        updatedAt: now
      }, ...list]);
    }

    hideBottomSheet();
    showToast('已记下');
    render();
  });

  actions.append(cancelButton, saveButton);
  sheet.append(title, nameField, dateField, markerField, noteField, switchRow, actions);

  showBottomSheet(sheet);
}

function createMarkerField(activeMarker, onChange) {
  const field = document.createElement('div');
  field.className = 'ann-field';

  const label = document.createElement('div');
  label.className = 'ann-field-label';
  label.append(createIcon('star', 15), document.createTextNode('小标记'));

  const grid = document.createElement('div');
  grid.className = 'ann-marker-grid';

  MARKERS.forEach((marker) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `ann-marker-btn ${marker.id === activeMarker ? 'active' : ''}`;
    button.dataset.marker = marker.id;
    button.append(createMarkerSvg(marker.id, 22), document.createTextNode(marker.name));
    button.addEventListener('click', () => {
      grid.querySelectorAll('.ann-marker-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.marker === marker.id);
      });
      onChange(marker.id);
    });
    grid.appendChild(button);
  });

  field.append(label, grid);
  return field;
}

function createInputField(labelText, placeholder, value, type = 'text') {
  const field = document.createElement('div');
  field.className = 'ann-field';

  const label = document.createElement('div');
  label.className = 'ann-field-label';
  label.append(createIcon(type === 'date' ? 'check' : 'edit', 15), document.createTextNode(labelText));

  const input = document.createElement('input');
  input.className = 'ann-input';
  input.type = type;
  input.placeholder = placeholder;
  input.value = value;

  field.append(label, input);
  return field;
}

function createTextareaField(labelText, placeholder, value) {
  const field = document.createElement('div');
  field.className = 'ann-field';

  const label = document.createElement('div');
  label.className = 'ann-field-label';
  label.append(createIcon('memory', 15), document.createTextNode(labelText));

  const textarea = document.createElement('textarea');
  textarea.className = 'ann-textarea';
  textarea.placeholder = placeholder;
  textarea.value = value;

  field.append(label, textarea);
  return field;
}

function createSwitchRow(active) {
  const row = document.createElement('div');
  row.className = 'ann-switch-row';

  const text = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'ann-switch-title';
  title.textContent = '让 AI 也看见';

  const sub = document.createElement('div');
  sub.className = 'ann-switch-sub';
  sub.textContent = '聊天时 AI 可以在合适时提起';

  text.append(title, sub);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = `switch ${active ? 'active' : ''}`;
  toggle.addEventListener('click', () => toggle.classList.toggle('active'));

  row.append(text, toggle);
  return row;
}

async function deleteItem(item) {
  const ok = await showConfirm(`确定删除「${item.name}」吗？`);
  if (!ok) return;

  saveList(readList().filter((record) => record.id !== item.id));
  showToast('已删除');
  render();
}

function createMarkerSvg(type, size = 24) {
  const svg = createSvgBase(size);

  if (type === 'rabbit') {
    svg.append(
      svgPath('M8.5 9c-2-4-1.2-7 .8-7 1.7 0 2.6 2.5 3 5'),
      svgPath('M15.5 9c2-4 1.2-7-.8-7-1.7 0-2.6 2.5-3 5'),
      svgPath('M5.5 14.5a6.5 6.5 0 0 1 13 0v1.5a6.5 6.5 0 0 1-13 0v-1.5z'),
      svgPath('M9.2 14h.1'),
      svgPath('M14.8 14h.1'),
      svgPath('M11 16.6c.6.4 1.4.4 2 0')
    );
    return svg;
  }

  if (type === 'star') {
    svg.append(svgPath('M12 4.5l2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7L12 4.5z'));
    return svg;
  }

  if (type === 'flower') {
    svg.append(
      svgPath('M12 13v7'),
      svgPath('M12 13c-5-1.2-5-7 0-6 5-1 5 4.8 0 6z'),
      svgPath('M12 13c-4 3-8 0-5-4'),
      svgPath('M12 13c4 3 8 0 5-4'),
      svgPath('M12 17c-3 0-4.5 2.5-4.5 2.5'),
      svgPath('M12 18c3 0 4.5 2.5 4.5 2.5')
    );
    return svg;
  }

  if (type === 'moon') {
    svg.append(svgPath('M17.5 18.5A8 8 0 0 1 11 5.2 8.2 8.2 0 1 0 19 16.8c-.4.7-.9 1.2-1.5 1.7z'));
    return svg;
  }

  if (type === 'cake') {
    svg.append(
      svgPath('M6 12h12v7a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-7z'),
      svgPath('M7.5 9h9A1.5 1.5 0 0 1 18 10.5V12H6v-1.5A1.5 1.5 0 0 1 7.5 9z'),
      svgPath('M9 9V6'),
      svgPath('M12 9V6'),
      svgPath('M15 9V6')
    );
    return svg;
  }

  svg.append(svgPath('M12 19s-7-4.4-7-9.4A3.7 3.7 0 0 1 8.8 6c1.3 0 2.5.7 3.2 1.8A3.8 3.8 0 0 1 15.2 6 3.7 3.7 0 0 1 19 9.6C19 14.6 12 19 12 19z'));
  return svg;
}

function createCalendarSvg() {
  const svg = createSvgBase(28);

  const fill = svgPath('M6 7h16v15H6V7z');
  fill.setAttribute('fill', 'var(--bg-card)');
  fill.setAttribute('opacity', '0.55');

  svg.append(
    fill,
    svgPath('M6 7h16v15H6V7z'),
    svgPath('M9 4v5'),
    svgPath('M19 4v5'),
    svgPath('M6 12h16'),
    svgPath('M10 16h.1'),
    svgPath('M14 16h.1'),
    svgPath('M18 16h.1'),
    svgPath('M10 20h.1'),
    svgPath('M14 20h.1')
  );

  return svg;
}

function createSvgBase(size) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  return svg;
}

function svgPath(d) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  return path;
}

// 依赖：../core/storage.js 的 getData/setData/generateId/getNow；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon
