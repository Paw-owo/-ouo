// apps/flashcard/index.js
// 记忆卡 App——软萌少女风背词小帮手。
// 翻过来翻过去，记不住就再看一遍嘛～
// 功能：
//   1) 顶部牌组横向标签（全部 + 各牌组 + 新建牌组，长按牌组可删除）
//   2) 主区域单卡显示，点击翻面（正面 / 背面，3D 翻转动画）
//   3) 翻面后「再看看」/「记得」/「很简单」三按钮，走 SM-2 简化版间隔重复
//   4) 顶部统计卡：今日待复习 / 已学完 / 学习中 / 未开始
//   5) 右上角 + 新建卡片（选牌组 + 正面 + 背面）
//   6) 卡片列表管理：查看 / 编辑 / 删除
//   7) 卡片存 IndexedDB STORES.flashcards
//      字段：{id, deck, front, back, createdAt, updatedAt,
//             reviewCount, lastReview,
//             interval, ease, reps, nextReview}  <- 后四个是 SM-2 字段
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, setData, setDB, deleteDB, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, formatRelative, formatDate } from '../../core/util.js';
import { openApp } from '../../core/router.js';
import { applyAppBg } from '../../core/app-bg.js';

let containerEl = null;

// 模块状态
let cards = [];           // 全部卡片
let currentDeck = 'all';  // 当前牌组：'all' 或牌组名
let currentIndex = 0;     // 当前卡片在过滤后列表中的下标
let showingBack = false;  // 是否显示背面

const DEFAULT_DECK = '默认';

// ════════════════════════════════════════
// SM-2 简化版间隔重复算法
//   字段：reps 连续答对次数 / ease 难度系数 / interval 下次间隔天数 / nextReview 下次复习时间
//   质量分 q：0=完全忘记 ... 5=完美记住
//   「再看看」= q=2（忘了，重置 reps）「记得」= q=4 「很简单」= q=5
// ════════════════════════════════════════

const DEFAULT_EASE = 2.5;
const MIN_EASE = 1.3;

function srsDefaults() {
  return { reps: 0, ease: DEFAULT_EASE, interval: 0, nextReview: null };
}

// 计算一次复习后的新 SRS 状态
function srsReview(card, q) {
  if (q < 3) {
    // 忘了：reps 清零，间隔回到 1 天
    card.reps = 0;
    card.interval = 1;
  } else {
    // 记得：按 SM-2 推进
    card.reps += 1;
    if (card.reps === 1) card.interval = 1;
    else if (card.reps === 2) card.interval = 6;
    else card.interval = Math.round((card.interval || 1) * card.ease);
    // 更新 ease（SM-2 公式简化版）
    card.ease = Math.max(MIN_EASE, card.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  }
  // 下次复习时间：今天 + interval 天
  const next = new Date();
  next.setHours(0, 0, 0, 0);
  next.setDate(next.getDate() + card.interval);
  card.nextReview = next.toISOString();
  card.reviewCount = (card.reviewCount || 0) + 1;
  card.lastReview = getNow();
}

// 判断卡片今天是否到期（该复习了）
function isDue(card, now = new Date()) {
  if (!card.nextReview) return true; // 新卡，永远到期
  const next = new Date(card.nextReview);
  // 用日期比较（去掉时分秒）
  const a = new Date(next); a.setHours(0, 0, 0, 0);
  const b = new Date(now); b.setHours(0, 0, 0, 0);
  return a.getTime() <= b.getTime();
}

// 判断卡片状态：已学完(reps>=3) / 学习中(reps 1-2) / 未开始(reps==0)
function cardStatus(card) {
  const r = card.reps || 0;
  if (r >= 3) return 'learned';
  if (r >= 1) return 'learning';
  return 'new';
}

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container) {
  containerEl = container;
  injectStyle('app-flashcard-style', `
    .fc-tabs { display: flex; gap: 8px; overflow-x: auto; padding: 4px 2px 12px; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
    .fc-tabs::-webkit-scrollbar { display: none; }
    .fc-tab { padding: 8px 16px; border-radius: 999px; background: color-mix(in srgb, var(--bg-secondary) 70%, transparent); color: var(--text-secondary); white-space: nowrap; font-size: var(--font-size-small); border: none; transition: var(--motion); flex-shrink: 0; cursor: pointer; }
    .fc-tab.active { background: var(--accent); color: var(--bubble-user-text); font-weight: 600; }
    .fc-tab.add { background: color-mix(in srgb, var(--accent-light) 70%, transparent); color: var(--accent-dark); display: inline-flex; align-items: center; gap: 4px; }
    .fc-tab:active { transform: scale(var(--press-scale)); }
    .fc-card { perspective: 1200px; margin-bottom: 14px; }
    .fc-card-inner { position: relative; width: 100%; min-height: 280px; transform-style: preserve-3d; transition: transform 0.5s var(--motion-spring); cursor: pointer; }
    .fc-card-inner.flipped { transform: rotateY(180deg); }
    .fc-face { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px 28px; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: var(--radius-card); background: var(--bg-card); box-shadow: var(--shadow-sm); text-align: center; overflow-y: auto; }
    .fc-back { transform: rotateY(180deg); background: color-mix(in srgb, var(--accent-light) 40%, var(--bg-card)); }
    .fc-face-tag { font-size: var(--font-size-small); color: var(--text-hint); margin-bottom: 12px; letter-spacing: 1px; }
    .fc-face-text { font-size: var(--font-size-large); color: var(--text-primary); line-height: 1.6; word-break: break-word; }
    .fc-face-hint { font-size: var(--font-size-small); color: var(--text-hint); margin-top: 16px; }
    .fc-actions { display: flex; gap: 12px; margin-bottom: 8px; }
    .fc-actions .btn { flex: 1; justify-content: center; }
    .fc-counter { font-size: var(--font-size-small); color: var(--text-hint); text-align: center; }
    .fc-list-item { padding: 14px 16px; border-radius: var(--radius-md); background: color-mix(in srgb, var(--bg-secondary) 50%, transparent); margin-bottom: 10px; }
    .fc-list-item-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; }
    .fc-list-deck { font-size: var(--font-size-small); color: var(--accent-dark); background: color-mix(in srgb, var(--accent-light) 60%, transparent); padding: 2px 10px; border-radius: 999px; }
    .fc-list-front { font-size: var(--font-size-base); color: var(--text-primary); font-weight: 500; margin-bottom: 4px; word-break: break-word; }
    .fc-list-back { font-size: var(--font-size-small); color: var(--text-secondary); word-break: break-word; }
    .fc-list-actions { display: flex; gap: 8px; margin-top: 10px; }
    .fc-list-actions .btn { padding: 6px 12px; font-size: var(--font-size-small); }
    .fc-form-row { margin-bottom: 12px; }
    .fc-form-label { font-size: var(--font-size-small); color: var(--text-secondary); margin-bottom: 6px; display: block; }
    /* 统计卡 */
    .fc-stats{
      background:linear-gradient(135deg,var(--accent) 0%,var(--accent-dark) 100%);
      color:var(--bubble-user-text);
      border-radius:var(--radius-card);
      padding:16px 18px;margin-bottom:14px;
      box-shadow:var(--shadow-md);
    }
    .fc-stats-top{display:flex;align-items:center;gap:8px;margin-bottom:12px}
    .fc-stats-icon{display:flex;color:var(--bubble-user-text)}
    .fc-stats-title{font-size:var(--font-size-base);font-weight:600;flex:1}
    .fc-stats-due{
      font-size:24px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;
    }
    .fc-stats-due-label{font-size:var(--font-size-small);opacity:.85}
    .fc-stats-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
    .fc-stats-cell{
      background:color-mix(in srgb, var(--bubble-user-text) 18%, transparent);
      border-radius:var(--radius-md);padding:8px 4px;text-align:center;
    }
    .fc-stats-cell-val{font-size:var(--font-size-large);font-weight:700;line-height:1.2;font-variant-numeric:tabular-nums}
    .fc-stats-cell-label{font-size:var(--font-size-small);opacity:.8}
    /* 卡片状态标签 */
    .fc-status-tag{
      display:inline-block;font-size:var(--font-size-small);
      padding:1px 8px;border-radius:999px;margin-left:6px;
    }
    .fc-status-tag.new{background:color-mix(in srgb,var(--text-hint) 18%,transparent);color:var(--text-secondary)}
    .fc-status-tag.learning{background:color-mix(in srgb,var(--accent-light) 60%,transparent);color:var(--accent-dark)}
    .fc-status-tag.learned{background:color-mix(in srgb,var(--success) 40%,transparent);color:var(--text-primary)}
    /* 复习按钮组 */
    .fc-actions .btn.due{background:color-mix(in srgb,var(--accent-light) 60%,transparent);color:var(--accent-dark)}
    .fc-actions .btn.easy{background:color-mix(in srgb,var(--success) 50%,transparent);color:var(--text-primary)}
    /* 牌组删除提示 */
    .fc-tab .popo-icon{display:inline-flex}
  `);

  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="fc-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">记忆卡</div>
      <button class="app-header-gear" id="fc-settings" aria-label="记忆卡设置">${createIcon('settings', 18).outerHTML}</button>
      <button id="fc-list-btn" aria-label="管理卡片">${createIcon('memo', 20).outerHTML}</button>
      <button id="fc-add-btn" aria-label="新建卡片">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="fc-body"></div>
  `;
  container.querySelector('#fc-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#fc-add-btn').addEventListener('click', () => openCardForm(null));
  container.querySelector('#fc-list-btn').addEventListener('click', openListSheet);
  // 齿轮跳到设置「数据与系统」分组
  container.querySelector('#fc-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'system' } }));

  // 恢复上次牌组选择
  const pref = getData(KEYS.flashcardState, null);
  if (pref && pref.currentDeck) currentDeck = pref.currentDeck;
  await loadCards();
  await render();
  applyAppBg(container, 'flashcard');
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 数据
// ════════════════════════════════════════

async function loadCards() {
  try {
    cards = await getAllDB(STORES.flashcards);
  } catch (e) {
    console.warn('[flashcard] 读取卡片失败', e);
    cards = [];
  }
  cards.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
}

// 所有牌组名（存储的 + 卡片里出现的，去重）
function getDecks() {
  const set = new Set();
  const pref = getData(KEYS.flashcardState, null);
  if (pref && Array.isArray(pref.decks)) pref.decks.forEach((d) => set.add(d));
  cards.forEach((c) => { if (c.deck) set.add(c.deck); });
  if (set.size === 0) set.add(DEFAULT_DECK);
  return Array.from(set);
}

function saveDecksPref(decks) {
  const pref = getData(KEYS.flashcardState, {}) || {};
  pref.decks = decks;
  setData(KEYS.flashcardState, pref);
}

function setCurrentDeckPref(deck) {
  const pref = getData(KEYS.flashcardState, {}) || {};
  pref.currentDeck = deck;
  setData(KEYS.flashcardState, pref);
}

function filteredCards() {
  if (currentDeck === 'all') return cards;
  return cards.filter((c) => c.deck === currentDeck);
}

// ════════════════════════════════════════
// 渲染
// ════════════════════════════════════════

async function render() {
  const body = containerEl.querySelector('#fc-body');
  const decks = getDecks();
  const list = filteredCards();
  // 下标越界兜底
  if (currentIndex >= list.length) currentIndex = 0;
  if (currentIndex < 0) currentIndex = 0;

  body.innerHTML = `
    <div id="fc-stats-mount"></div>
    <div class="fc-tabs" id="fc-tabs">
      <button class="fc-tab ${currentDeck === 'all' ? 'active' : ''}" data-deck="all">全部</button>
      ${decks.map((d) => `<button class="fc-tab ${currentDeck === d ? 'active' : ''}" data-deck="${escapeAttr(d)}">${escapeHTML(d)}</button>`).join('')}
      <button class="fc-tab add" id="fc-add-deck">${createIcon('plus', 16).outerHTML}牌组</button>
    </div>
    <div id="fc-main"></div>
  `;
  // 渲染顶部统计卡
  renderStats(body.querySelector('#fc-stats-mount'), list);
  body.querySelectorAll('.fc-tab[data-deck]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentDeck = btn.dataset.deck;
      currentIndex = 0;
      showingBack = false;
      setCurrentDeckPref(currentDeck);
      render();
    });
    // 长按牌组（非「全部」）-> 删除牌组
    if (btn.dataset.deck && btn.dataset.deck !== 'all') {
      attachLongPress(btn, () => confirmDeleteDeck(btn.dataset.deck));
    }
  });
  body.querySelector('#fc-add-deck').addEventListener('click', openDeckForm);
  renderMain(list);
}

// 渲染顶部统计卡：今日待复习 + 已学完 / 学习中 / 未开始
function renderStats(mountEl, list) {
  if (!mountEl) return;
  const now = new Date();
  const dueCount = list.filter((c) => isDue(c, now)).length;
  const learned = list.filter((c) => cardStatus(c) === 'learned').length;
  const learning = list.filter((c) => cardStatus(c) === 'learning').length;
  const fresh = list.filter((c) => cardStatus(c) === 'new').length;
  mountEl.innerHTML = `
    <div class="fc-stats">
      <div class="fc-stats-top">
        <div class="fc-stats-icon">${createIcon('memo', 18).outerHTML}</div>
        <div class="fc-stats-title">今日待复习</div>
        <div class="fc-stats-due">${dueCount}</div>
        <div class="fc-stats-due-label">张</div>
      </div>
      <div class="fc-stats-grid">
        <div class="fc-stats-cell">
          <div class="fc-stats-cell-val">${learned}</div>
          <div class="fc-stats-cell-label">已学完</div>
        </div>
        <div class="fc-stats-cell">
          <div class="fc-stats-cell-val">${learning}</div>
          <div class="fc-stats-cell-label">学习中</div>
        </div>
        <div class="fc-stats-cell">
          <div class="fc-stats-cell-val">${fresh}</div>
          <div class="fc-stats-cell-label">未开始</div>
        </div>
      </div>
    </div>
  `;
}

// 长按检测（touchstart / mousedown 启动 600ms 计时器，提前松手就取消）
function attachLongPress(el, onLongPress) {
  let timer = null;
  const start = () => {
    timer = setTimeout(() => {
      timer = null;
      if (typeof onLongPress === 'function') onLongPress();
    }, 600);
  };
  const cancel = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };
  el.addEventListener('touchstart', start, { passive: true });
  el.addEventListener('touchend', cancel);
  el.addEventListener('touchmove', cancel);
  el.addEventListener('touchcancel', cancel);
  el.addEventListener('mousedown', start);
  el.addEventListener('mouseup', cancel);
  el.addEventListener('mouseleave', cancel);
}

// 确认删除牌组（连同牌组内卡片一起删）
function confirmDeleteDeck(deckName) {
  const count = cards.filter((c) => c.deck === deckName).length;
  showConfirm({
    title: `删掉「${deckName}」牌组吗？`,
    body: count > 0 ? `牌组里有 ${count} 张卡片，会一起删掉哦` : '这个牌组是空的，删掉就好啦',
    confirmText: '删掉',
    cancelText: '不要',
    danger: true,
    onConfirm: async () => {
      try {
        // 删牌组内所有卡片
        const inDeck = cards.filter((c) => c.deck === deckName);
        for (const c of inDeck) {
          await deleteDB(STORES.flashcards, c.id);
        }
        // 从牌组偏好里移除
        const decks = getDecks().filter((d) => d !== deckName);
        saveDecksPref(decks);
        // 当前正看的就是被删的牌组，退回全部
        if (currentDeck === deckName) currentDeck = 'all';
        currentIndex = 0;
        showingBack = false;
        await loadCards();
        await render();
        showToast('牌组删掉啦', 'default', 1200);
      } catch (e) {
        console.warn('[flashcard] 删除牌组失败', e);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

function renderMain(list) {
  const main = containerEl.querySelector('#fc-main');
  if (!list.length) {
    main.innerHTML = `
      <div class="card empty-state">
        <div class="empty-state-icon">${createIcon('memo', 48).outerHTML}</div>
        <div class="empty-state-text">还没有卡片，加一些要记的嘛</div>
      </div>
    `;
    return;
  }
  const card = list[currentIndex];
  if (!card) { currentIndex = 0; return renderMain(list); }
  const status = cardStatus(card);
  const statusLabel = status === 'learned' ? '已学完' : (status === 'learning' ? '学习中' : '未开始');
  const intervalLabel = card.interval ? `${card.interval} 天后再见` : '新卡片，第一次见';
  main.innerHTML = `
    <div class="fc-card">
      <div class="fc-card-inner ${showingBack ? 'flipped' : ''}" id="fc-inner">
        <div class="fc-face fc-front">
          <div class="fc-face-tag">正面</div>
          <div class="fc-face-text">${escapeHTML(card.front || '')}</div>
          <div class="fc-face-hint">点我翻面嘛</div>
        </div>
        <div class="fc-face fc-back">
          <div class="fc-face-tag">背面</div>
          <div class="fc-face-text">${escapeHTML(card.back || '')}</div>
          <div class="fc-face-hint">翻过来看看背面嘛～</div>
        </div>
      </div>
    </div>
    <div class="fc-actions" id="fc-actions" style="${showingBack ? '' : 'display:none'}">
      <button class="btn due" id="fc-again">${createIcon('back', 16).outerHTML}再看看</button>
      <button class="btn primary" id="fc-know">${createIcon('check', 16).outerHTML}记得</button>
      <button class="btn easy" id="fc-easy">${createIcon('star', 16).outerHTML}很简单</button>
    </div>
    <div class="fc-counter">
      ${currentIndex + 1} / ${list.length} · 已复习 ${card.reviewCount || 0} 次
      <span class="fc-status-tag ${status}">${statusLabel}</span>
      · ${intervalLabel}
    </div>
  `;
  // 翻面：只切 class，让 CSS 动画跑起来（不重渲染）
  const inner = main.querySelector('#fc-inner');
  inner.addEventListener('click', () => {
    showingBack = !showingBack;
    inner.classList.toggle('flipped', showingBack);
    const actions = main.querySelector('#fc-actions');
    if (actions) actions.style.display = showingBack ? '' : 'none';
  });
  const knowBtn = main.querySelector('#fc-know');
  const againBtn = main.querySelector('#fc-again');
  const easyBtn = main.querySelector('#fc-easy');
  if (knowBtn) knowBtn.addEventListener('click', () => onReview(card, 4));
  if (againBtn) againBtn.addEventListener('click', () => onReview(card, 2));
  if (easyBtn) easyBtn.addEventListener('click', () => onReview(card, 5));
}

// ════════════════════════════════════════
// 复习交互（SM-2）
//   quality: 2=再看看（忘了） / 4=记得 / 5=很简单
// ════════════════════════════════════════

async function onReview(card, quality) {
  // 应用 SM-2 算法更新卡片状态
  srsReview(card, quality);
  try {
    await setDB(STORES.flashcards, card.id, card);
  } catch (e) {
    console.warn('[flashcard] 更新复习失败', e);
  }
  // 软萌反馈
  if (quality >= 5) showToast('太棒啦，记得牢牢的', 'success', 1200);
  else if (quality >= 3) showToast('记住啦，真棒呀', 'success', 1200);
  else showToast('没关系，多看几遍就记住啦', 'default', 1200);
  // 刷新统计卡 + 下一张
  const body = containerEl.querySelector('#fc-body');
  if (body) {
    const statsMount = body.querySelector('#fc-stats-mount');
    if (statsMount) renderStats(statsMount, filteredCards());
  }
  onNext();
}

function onNext() {
  const list = filteredCards();
  if (!list.length) { render(); return; }
  currentIndex = (currentIndex + 1) % list.length;
  showingBack = false;
  renderMain(list);
}

// ════════════════════════════════════════
// 新建 / 编辑卡片表单
// ════════════════════════════════════════

function openCardForm(editCard) {
  const decks = getDecks();
  const isEdit = !!editCard;
  const card = editCard || {
    deck: (currentDeck !== 'all' ? currentDeck : (decks[0] || DEFAULT_DECK)),
    front: '',
    back: ''
  };
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="fc-form-row">
      <label class="fc-form-label">选个牌组</label>
      <select class="select" id="fc-form-deck">
        ${decks.map((d) => `<option value="${escapeAttr(d)}" ${d === card.deck ? 'selected' : ''}>${escapeHTML(d)}</option>`).join('')}
      </select>
    </div>
    <div class="fc-form-row">
      <label class="fc-form-label">正面（问题）</label>
      <textarea class="textarea" id="fc-form-front" placeholder="写要记的嘛...">${escapeHTML(card.front || '')}</textarea>
    </div>
    <div class="fc-form-row">
      <label class="fc-form-label">背面（答案）</label>
      <textarea class="textarea" id="fc-form-back" placeholder="写答案嘛...">${escapeHTML(card.back || '')}</textarea>
    </div>
    <button class="btn primary block" id="fc-form-save">${isEdit ? '保存修改' : '加进去'}</button>
  `;
  const { close } = showBottomSheet({ title: isEdit ? '编辑卡片' : '新建卡片', bodyElement: body, dismissible: true });
  body.querySelector('#fc-form-save').addEventListener('click', async () => {
    const deck = body.querySelector('#fc-form-deck').value.trim() || DEFAULT_DECK;
    const front = body.querySelector('#fc-form-front').value.trim();
    const back = body.querySelector('#fc-form-back').value.trim();
    if (!front) { showToast('正面要写点东西呀', 'error'); return; }
    if (!back) { showToast('背面也写点嘛', 'error'); return; }
    try {
      if (isEdit) {
        editCard.deck = deck;
        editCard.front = front;
        editCard.back = back;
        await setDB(STORES.flashcards, editCard.id, editCard);
        showToast('改好啦', 'success', 1200);
      } else {
        const id = generateId('fc');
        const now = getNow();
        await setDB(STORES.flashcards, id, {
          id, deck, front, back,
          createdAt: now, updatedAt: now,
          reviewCount: 0, lastReview: null,
          // SM-2 字段
          reps: 0, ease: DEFAULT_EASE, interval: 0, nextReview: null
        });
        showToast('加好啦，加油记呀', 'success', 1200);
      }
      close();
      await loadCards();
      await render();
    } catch (e) {
      console.warn('[flashcard] 保存失败', e);
      showToast('保存失败啦，再试一下嘛', 'error');
    }
  });
}

// ════════════════════════════════════════
// 新建牌组
// ════════════════════════════════════════

function openDeckForm() {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="fc-form-row">
      <label class="fc-form-label">牌组名字</label>
      <input class="input" id="fc-deck-name" placeholder="比如：英语单词" maxlength="20">
    </div>
    <button class="btn primary block" id="fc-deck-save">建好啦</button>
  `;
  const { close } = showBottomSheet({ title: '新建牌组', bodyElement: body, dismissible: true });
  const input = body.querySelector('#fc-deck-name');
  input.focus();
  body.querySelector('#fc-deck-save').addEventListener('click', () => {
    const name = input.value.trim();
    if (!name) { showToast('写个名字呀', 'error'); return; }
    const decks = getDecks();
    if (decks.includes(name)) { showToast('已经有这个牌组啦', 'error'); return; }
    decks.push(name);
    saveDecksPref(decks);
    currentDeck = name;
    setCurrentDeckPref(currentDeck);
    currentIndex = 0;
    showingBack = false;
    close();
    showToast('牌组建好啦，加些卡片进来嘛', 'success', 1400);
    render();
  });
}

// ════════════════════════════════════════
// 卡片列表管理（查看 / 编辑 / 删除）
// ════════════════════════════════════════

function openListSheet() {
  const body = document.createElement('div');
  const sheet = showBottomSheet({ title: '卡片管理', bodyElement: body, dismissible: true });
  const refresh = () => populateListBody(body, sheet, refresh);
  populateListBody(body, sheet, refresh);
}

function populateListBody(body, sheet, refresh) {
  body.innerHTML = '';
  if (!cards.length) {
    body.innerHTML = `<div class="empty-state"><div class="empty-state-text">还没有卡片呢</div></div>`;
    return;
  }
  const list = currentDeck === 'all' ? cards : cards.filter((c) => c.deck === currentDeck);
  const head = document.createElement('div');
  head.style.cssText = 'font-size:var(--font-size-small);color:var(--text-hint);margin-bottom:10px';
  head.textContent = `${list.length} 张卡片`;
  body.appendChild(head);
  if (!list.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `<div class="empty-state-text">这个牌组还没有卡片</div>`;
    body.appendChild(empty);
    return;
  }
  list.forEach((c) => {
    const item = document.createElement('div');
    item.className = 'fc-list-item';
    const st = cardStatus(c);
    const stLabel = st === 'learned' ? '已学完' : (st === 'learning' ? '学习中' : '未开始');
    const nextLabel = c.nextReview ? `下次复习 ${formatDate(c.nextReview, { withWeek: false })}` : '还没开始复习';
    item.innerHTML = `
      <div class="fc-list-item-head">
        <span class="fc-list-deck">${escapeHTML(c.deck || DEFAULT_DECK)}</span>
        <span class="fc-status-tag ${st}">${stLabel}</span>
        <span style="font-size:var(--font-size-small);color:var(--text-hint);margin-left:auto">${formatRelative(c.lastReview || c.updatedAt || c.createdAt)}</span>
      </div>
      <div class="fc-list-front">${escapeHTML(c.front || '')}</div>
      <div class="fc-list-back">${escapeHTML(c.back || '')}</div>
      <div style="font-size:var(--font-size-small);color:var(--text-hint);margin-top:4px">${escapeHTML(nextLabel)}</div>
      <div class="fc-list-actions">
        <button class="btn ghost" data-act="edit">${createIcon('edit', 16).outerHTML} 编辑</button>
        <button class="btn ghost" data-act="del" style="color:var(--danger)">${createIcon('trash', 16).outerHTML} 删除</button>
      </div>
    `;
    item.querySelector('[data-act=edit]').addEventListener('click', () => {
      // 关掉列表 sheet，再打开编辑表单
      sheet.close();
      setTimeout(() => openCardForm(c), 80);
    });
    item.querySelector('[data-act=del]').addEventListener('click', () => {
      showConfirm({
        title: '删掉这张卡片吗？',
        body: '删掉就找不回来啦',
        confirmText: '删掉',
        cancelText: '不要',
        danger: true,
        onConfirm: async () => {
          try {
            await deleteDB(STORES.flashcards, c.id);
            showToast('删掉啦', 'default', 1200);
            await loadCards();
            await render();
            refresh(); // 原地刷新列表
          } catch (e) {
            console.warn('[flashcard] 删除失败', e);
            showToast('没删掉，再试一下嘛', 'error');
          }
        }
      });
    });
    body.appendChild(item);
  });
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

function escapeHTML(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) { return escapeHTML(s); }
