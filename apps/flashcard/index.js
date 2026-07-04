// apps/flashcard/index.js
// 记忆卡 App——软萌少女风背词小帮手。
// 翻过来翻过去，记不住就再看一遍嘛～
// 功能：
//   1) 顶部牌组横向标签（全部 + 各牌组 + 新建牌组）
//   2) 主区域单卡显示，点击翻面（正面 / 背面，3D 翻转动画）
//   3) 翻面后「记得」/「再看看」两按钮，记得则 reviewCount+1、lastReview=now
//   4) 右上角 + 新建卡片（选牌组 + 正面 + 背面）
//   5) 卡片列表管理：查看 / 编辑 / 删除
//   6) 卡片存 IndexedDB STORES.flashcards
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, setData, setDB, deleteDB, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, formatRelative } from '../../core/util.js';
import { applyAppBg } from '../../core/app-bg.js';

let containerEl = null;

// 模块状态
let cards = [];           // 全部卡片
let currentDeck = 'all';  // 当前牌组：'all' 或牌组名
let currentIndex = 0;     // 当前卡片在过滤后列表中的下标
let showingBack = false;  // 是否显示背面

const DEFAULT_DECK = '默认';

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
  `);

  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="fc-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">记忆卡</div>
      <button id="fc-list-btn" aria-label="管理卡片">${createIcon('memo', 20).outerHTML}</button>
      <button id="fc-add-btn" aria-label="新建卡片">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="fc-body"></div>
  `;
  container.querySelector('#fc-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#fc-add-btn').addEventListener('click', () => openCardForm(null));
  container.querySelector('#fc-list-btn').addEventListener('click', openListSheet);

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
    <div class="fc-tabs" id="fc-tabs">
      <button class="fc-tab ${currentDeck === 'all' ? 'active' : ''}" data-deck="all">全部</button>
      ${decks.map((d) => `<button class="fc-tab ${currentDeck === d ? 'active' : ''}" data-deck="${escapeAttr(d)}">${escapeHTML(d)}</button>`).join('')}
      <button class="fc-tab add" id="fc-add-deck">${createIcon('plus', 16).outerHTML}牌组</button>
    </div>
    <div id="fc-main"></div>
  `;
  body.querySelectorAll('.fc-tab[data-deck]').forEach((btn) => {
    btn.addEventListener('click', () => {
      currentDeck = btn.dataset.deck;
      currentIndex = 0;
      showingBack = false;
      setCurrentDeckPref(currentDeck);
      render();
    });
  });
  body.querySelector('#fc-add-deck').addEventListener('click', openDeckForm);
  renderMain(list);
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
      <button class="btn" id="fc-again">再看看</button>
      <button class="btn primary" id="fc-know">记得</button>
    </div>
    <div class="fc-counter">${currentIndex + 1} / ${list.length} · 已复习 ${card.reviewCount || 0} 次</div>
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
  if (knowBtn) knowBtn.addEventListener('click', () => onRemember(card));
  if (againBtn) againBtn.addEventListener('click', onNext);
}

// ════════════════════════════════════════
// 复习交互
// ════════════════════════════════════════

async function onRemember(card) {
  card.reviewCount = (card.reviewCount || 0) + 1;
  card.lastReview = getNow();
  try {
    await setDB(STORES.flashcards, card.id, card);
  } catch (e) {
    console.warn('[flashcard] 更新复习失败', e);
  }
  showToast('记住啦，真棒呀', 'success', 1200);
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
          reviewCount: 0, lastReview: null
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
    item.innerHTML = `
      <div class="fc-list-item-head">
        <span class="fc-list-deck">${escapeHTML(c.deck || DEFAULT_DECK)}</span>
        <span style="font-size:var(--font-size-small);color:var(--text-hint)">${formatRelative(c.lastReview || c.updatedAt || c.createdAt)}</span>
      </div>
      <div class="fc-list-front">${escapeHTML(c.front || '')}</div>
      <div class="fc-list-back">${escapeHTML(c.back || '')}</div>
      <div class="fc-list-actions">
        <button class="btn ghost" data-act="edit">${createIcon('edit', 16).outerHTML} 编辑</button>
        <button class="btn ghost" data-act="del" style="color:#E8888C">${createIcon('trash', 16).outerHTML} 删除</button>
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
            showToast('删除失败啦', 'error');
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
