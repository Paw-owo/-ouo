// apps/collections/index.js
// 收藏夹 App——软萌少女风 PWA「泡泡」。
// 我帮主人把喜欢的东西都悄悄收起来：链接、文字、图片都行，还能用颜色分一分。
// 还有「聊天收藏」分类：从聊天里长按消息收藏的会进到这里，点一下能跳回原会话。
// 数据：
//   - 本地收藏：localStorage（KEYS.collectionsState），{items: [{id, type, title, content, color, createdAt}]}
//   - 聊天收藏：IndexedDB STORES.favorites（由 chat/message-actions.js 的 starMessage 写入）
// 红线：图标只准 SVG 线稿（createIcon），禁止任何 emoji / Unicode 符号。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js, core/router.js

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, setData, generateId, getNow, compressImage, getAllDB, deleteDB } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, pickImageFile, isUsableImage, formatRelative, debounce } from '../../core/util.js';
import { applyAppBg } from '../../core/app-bg.js';
import { openApp } from '../../core/router.js';

let containerEl = null;
let activeFilter = 'all';
let searchKeyword = '';

// 类型对应 SVG 线稿图标名（红线：禁止 emoji）
const TYPE_ICON = { link: 'edit', text: 'memo', image: 'camera', chat: 'chat' };
const TYPE_LABEL = { link: '链接', text: '文字', image: '图片', chat: '聊天' };
const FILTERS = [
  { key: 'all',   label: '全部' },
  { key: 'link',  label: '链接' },
  { key: 'text',  label: '文字' },
  { key: 'image', label: '图片' },
  { key: 'chat',  label: '聊天收藏' }
];

// 5 个马卡龙色：用户给收藏打的颜色标签，属于内容数据（非主题色）
const MACARON_COLORS = [
  { key: 'sakura',   hex: '#F5A0B0' },
  { key: 'lemon',    hex: '#F5D88A' },
  { key: 'matcha',   hex: '#B5D9A0' },
  { key: 'sky',      hex: '#A0C8E8' },
  { key: 'lavender', hex: '#C8A8E0' }
];
const DEFAULT_COLOR = MACARON_COLORS[0];

// 自定义样式（全部走 CSS 变量，主题变了我也跟着变）
injectStyle('app-collections-style', `
  .coll-toolbar{ display:flex; gap:8px; flex-wrap:wrap; margin-bottom:12px; }
  .coll-filter{
    padding:7px 14px; border-radius:999px;
    background:color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    color:var(--text-secondary);
    font-size:var(--font-size-small); font-weight:500;
    border:1px solid transparent;
    transition:var(--motion);
  }
  .coll-filter:active{ transform:scale(var(--press-scale)); }
  .coll-filter.active{
    background:color-mix(in srgb, var(--accent) 18%, transparent);
    color:var(--accent-dark);
    border-color:color-mix(in srgb, var(--accent) 50%, transparent);
  }
  .coll-search-wrap{ position:relative; margin-bottom:14px; }
  .coll-search-wrap .popo-icon{
    position:absolute; left:14px; top:50%; transform:translateY(-50%);
    color:var(--text-hint); pointer-events:none;
  }
  .coll-search{
    width:100%; padding:11px 16px 11px 42px;
    background:color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    border:1px solid color-mix(in srgb, var(--text-hint) 18%, transparent);
    border-radius:var(--radius-md);
    font-size:var(--font-size-base); color:var(--text-primary);
    transition:var(--motion);
  }
  .coll-search:focus{ border-color:var(--accent); background:var(--bg-card); outline:none; }

  .coll-card{
    position:relative; background:var(--bg-card);
    border-radius:var(--radius-card);
    padding:14px 16px 14px 20px;
    box-shadow:var(--shadow-sm);
    margin-bottom:12px; overflow:hidden;
    transition:var(--motion);
  }
  .coll-card:active{ transform:scale(var(--press-scale)); }
  .coll-card-color{ position:absolute; left:0; top:0; bottom:0; width:4px; }
  .coll-card-row{ display:flex; align-items:flex-start; gap:12px; }
  .coll-card-icon{
    width:38px; height:38px; border-radius:50%;
    background:color-mix(in srgb, var(--accent-light) 55%, transparent);
    color:var(--accent-dark);
    display:flex; align-items:center; justify-content:center;
    flex-shrink:0;
  }
  .coll-card-main{ flex:1; min-width:0; cursor:pointer; }
  .coll-card-title{
    font-size:var(--font-size-base); font-weight:600;
    color:var(--text-primary); line-height:1.4; word-break:break-word;
  }
  .coll-card-content{
    font-size:var(--font-size-small); color:var(--text-secondary);
    line-height:1.5; margin-top:4px;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
    overflow:hidden; word-break:break-all;
  }
  .coll-card-thumb{
    margin-top:8px; width:100%; max-width:160px; aspect-ratio:4/3;
    background-size:cover; background-position:center;
    background-color:var(--bg-secondary);
    border-radius:var(--radius-sm);
  }
  .coll-card-meta{
    font-size:var(--font-size-small); color:var(--text-hint);
    margin-top:8px; display:flex; align-items:center; gap:6px;
  }
  .coll-card-actions{ display:flex; align-items:center; gap:2px; flex-shrink:0; }
  .coll-icon-btn{
    width:30px; height:30px; border-radius:50%;
    background:transparent; color:var(--text-hint);
    display:flex; align-items:center; justify-content:center;
    transition:var(--motion);
  }
  .coll-icon-btn:active{ transform:scale(var(--press-scale)); }

  .coll-empty-icon{ color:var(--text-hint); opacity:0.5; margin-bottom:12px; }
  .coll-form-row{ margin-bottom:14px; }
  .coll-form-label{
    font-size:var(--font-size-small); color:var(--text-secondary);
    margin-bottom:6px; display:block;
  }
  .coll-type-picker{ display:flex; gap:8px; }
  .coll-type-btn{
    flex:1; padding:10px 8px; border-radius:var(--radius-sm);
    background:var(--bg-secondary);
    color:var(--text-secondary);
    font-size:var(--font-size-small);
    border:1px solid transparent;
    display:flex; flex-direction:column; align-items:center; gap:4px;
    transition:var(--motion);
  }
  .coll-type-btn:active{ transform:scale(var(--press-scale)); }
  .coll-type-btn.active{
    background:color-mix(in srgb, var(--accent) 18%, transparent);
    color:var(--accent-dark);
    border-color:color-mix(in srgb, var(--accent) 50%, transparent);
  }
  .coll-color-picker{ display:flex; gap:10px; }
  .coll-color-dot{
    width:30px; height:30px; border-radius:50%;
    cursor:pointer; border:2px solid transparent;
    transition:var(--motion);
  }
  .coll-color-dot:active{ transform:scale(var(--press-scale)); }
  .coll-color-dot.selected{
    border-color:var(--text-primary);
    box-shadow:0 0 0 2px var(--bg-card) inset;
  }
  .coll-image-pick{ display:flex; align-items:center; gap:10px; }
  .coll-image-thumb{
    width:72px; height:72px; border-radius:var(--radius-sm);
    background-size:cover; background-position:center;
    background-color:var(--bg-secondary);
    flex-shrink:0;
  }
  .coll-image-thumb.empty{
    display:flex; align-items:center; justify-content:center;
    color:var(--text-hint);
    border:1px dashed color-mix(in srgb, var(--text-hint) 35%, transparent);
  }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  activeFilter = 'all';
  searchKeyword = '';
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="coll-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">收藏夹</div>
      <button class="app-header-gear" id="coll-settings" aria-label="收藏夹设置">${createIcon('settings', 18).outerHTML}</button>
      <button class="app-add" id="coll-add" aria-label="新增收藏">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="coll-body">
      <div class="coll-search-wrap">
        ${createIcon('search', 18).outerHTML}
        <input class="coll-search" id="coll-search" type="search" placeholder="找找收过的小东西..." aria-label="搜索收藏">
      </div>
      <div class="coll-toolbar" id="coll-filters">
        ${FILTERS.map((f) => `
          <button class="coll-filter ${f.key === activeFilter ? 'active' : ''}" data-filter="${f.key}">${escapeHTML(f.label)}</button>
        `).join('')}
      </div>
      <div id="coll-list"></div>
    </div>
  `;
  container.querySelector('#coll-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#coll-add').addEventListener('click', () => openEditor(null));
  // 齿轮跳到设置「数据与系统」分组
  container.querySelector('#coll-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'system' } }));
  container.querySelector('#coll-filters').addEventListener('click', (e) => {
    const btn = e.target.closest('.coll-filter');
    if (!btn) return;
    activeFilter = btn.dataset.filter;
    container.querySelectorAll('.coll-filter').forEach((b) => {
      b.classList.toggle('active', b.dataset.filter === activeFilter);
    });
    render();
  });
  const onSearch = debounce((e) => {
    searchKeyword = (e.target.value || '').trim().toLowerCase();
    render();
  }, 180);
  container.querySelector('#coll-search').addEventListener('input', onSearch);
  await render();
  applyAppBg(container, 'collections');
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 数据读写
// ════════════════════════════════════════

function getAll() {
  const v = getData(KEYS.collectionsState, { items: [] });
  if (!v || !Array.isArray(v.items)) return [];
  return v.items;
}

function saveAll(items) {
  setData(KEYS.collectionsState, { items: items || [] });
}

// ════════════════════════════════════════
// 列表渲染
// ════════════════════════════════════════

async function render() {
  const listEl = containerEl?.querySelector('#coll-list');
  if (!listEl) return;

  // 本地收藏（链接/文字/图片）——打上 kind 标记，方便后面区分
  const localItems = getAll().map((it) => ({ ...it, kind: 'local' }));
  // 聊天收藏——从 IndexedDB favorites store 读
  let chatFavs = [];
  try {
    chatFavs = await getChatFavorites();
  } catch (e) {
    console.warn('[collections] 读取聊天收藏失败', e);
  }

  // 按筛选合并：all 时两边都显示，chat 只显示聊天收藏，其余只显示本地对应类型
  let items;
  if (activeFilter === 'all') {
    items = [...localItems, ...chatFavs];
  } else if (activeFilter === 'chat') {
    items = chatFavs;
  } else {
    items = localItems.filter((it) => it.type === activeFilter);
  }

  // 关键词过滤
  const kw = searchKeyword;
  if (kw) {
    items = items.filter((it) => {
      const t = (it.title || '').toLowerCase();
      const c = (it.type === 'image' ? '' : (it.content || '')).toLowerCase();
      return t.includes(kw) || c.includes(kw);
    });
  }
  // 按时间倒序
  items.sort((a, b) => {
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });

  if (items.length === 0) {
    const filtering = kw || activeFilter !== 'all';
    const emptyText = filtering
      ? (activeFilter === 'chat' ? '还没有聊天收藏呀，在聊天里长按消息就能存进来嘛' : '这里还没有东西呀，换一个看看嘛')
      : '还没有收藏，把喜欢的东西存进来嘛';
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="coll-empty-icon">${createIcon('star', 48).outerHTML}</div>
        <div class="empty-state-text">${escapeHTML(emptyText)}</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = items.map(renderCard).join('');
  items.forEach((it) => {
    const card = listEl.querySelector(`[data-id="${cssEscape(it.id)}"]`);
    if (!card) return;
    const isChat = it.kind === 'chat';
    // 点击主体：聊天收藏跳转到对应会话，本地收藏打开编辑器
    const main = card.querySelector('.coll-card-main');
    if (main) main.addEventListener('click', () => { if (isChat) jumpToChatSession(it); else openEditor(it); });
    const openBtn = card.querySelector('.coll-open');
    if (openBtn) openBtn.addEventListener('click', (e) => { e.stopPropagation(); openLink(it); });
    const jumpBtn = card.querySelector('.coll-jump');
    if (jumpBtn) jumpBtn.addEventListener('click', (e) => { e.stopPropagation(); jumpToChatSession(it); });
    const editBtn = card.querySelector('.coll-edit');
    if (editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); openEditor(it); });
    const delBtn = card.querySelector('.coll-del');
    if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); if (isChat) confirmDeleteChatFavorite(it); else confirmDelete(it); });
  });
}

function renderCard(it) {
  const isChat = it.kind === 'chat';
  const colorHex = (MACARON_COLORS.find((c) => c.key === it.color) || DEFAULT_COLOR).hex;
  const title = it.title || '（没起名字呢）';
  const time = formatRelative(it.createdAt);
  const typeIcon = createIcon(TYPE_ICON[it.type] || 'star', 18).outerHTML;
  const editIcon = createIcon('edit', 16).outerHTML;
  const trashIcon = createIcon('trash', 16).outerHTML;
  const openIcon = createIcon('next', 16).outerHTML;
  const jumpIcon = createIcon('chat', 16).outerHTML;

  let contentHTML = '';
  if (it.type === 'image') {
    if (isUsableImage(it.content)) {
      contentHTML = `<div class="coll-card-thumb" style="background-image:url('${escapeAttr(it.content)}')"></div>`;
    } else {
      contentHTML = `<div class="coll-card-content">图片不见了嘛</div>`;
    }
  } else {
    const text = it.content || '';
    contentHTML = text ? `<div class="coll-card-content">${escapeHTML(text)}</div>` : '';
  }

  const openBtn = (it.type === 'link' && it.content)
    ? `<button class="coll-icon-btn coll-open" aria-label="打开链接" title="打开链接">${openIcon}</button>`
    : '';
  // 聊天收藏：显示跳转按钮，不显示编辑按钮（聊天收藏是消息快照，不能编辑）
  const jumpBtn = isChat
    ? `<button class="coll-icon-btn coll-jump" aria-label="去聊天" title="去聊天">${jumpIcon}</button>`
    : '';
  const editBtn = isChat
    ? ''
    : `<button class="coll-icon-btn coll-edit" aria-label="编辑" title="编辑">${editIcon}</button>`;

  return `
    <div class="coll-card" data-id="${escapeAttr(it.id)}">
      <div class="coll-card-color" style="background:${colorHex}"></div>
      <div class="coll-card-row">
        <div class="coll-card-icon">${typeIcon}</div>
        <div class="coll-card-main" role="button" tabindex="0" aria-label="${isChat ? '跳转到聊天' : '编辑收藏'}">
          <div class="coll-card-title">${escapeHTML(title)}</div>
          ${contentHTML}
          <div class="coll-card-meta">
            <span>${escapeHTML(TYPE_LABEL[it.type] || '收藏')}</span>
            <span>·</span>
            <span>${escapeHTML(time)}</span>
          </div>
        </div>
        <div class="coll-card-actions">
          ${openBtn}
          ${jumpBtn}
          ${editBtn}
          <button class="coll-icon-btn coll-del" aria-label="删除" title="删除">${trashIcon}</button>
        </div>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════
// 打开链接 / 删除
// ════════════════════════════════════════

function openLink(it) {
  const url = (it.content || '').trim();
  if (!url) {
    showToast('这条没有链接呀', 'error');
    return;
  }
  let safe = url;
  if (!/^https?:\/\//i.test(safe)) safe = 'https://' + safe;
  try {
    window.open(safe, '_blank', 'noopener,noreferrer');
  } catch (e) {
    showToast('打不开这个链接嘛', 'error');
  }
}

function confirmDelete(it) {
  showConfirm({
    title: '删掉这条收藏吗？',
    body: '删掉就找不回来啦，确定的话就点确认嘛',
    confirmText: '删掉吧',
    cancelText: '再想想',
    danger: true,
    onConfirm: () => {
      const list = getAll().filter((x) => x.id !== it.id);
      saveAll(list);
      showToast('删掉啦', 'default', 1200);
      render();
    }
  });
}

// ════════════════════════════════════════
// 聊天收藏：读取 / 跳转 / 删除
// ════════════════════════════════════════

// 从 STORES.favorites 读全部聊天收藏，并批量解析角色名。
// 返回的数组每项都打上 kind:'chat'，归一化成 renderCard 能直接吃的形状。
async function getChatFavorites() {
  let raws = [];
  try {
    raws = await getAllDB(STORES.favorites);
  } catch (e) {
    return [];
  }
  if (!raws.length) return [];

  // 批量取角色名，避免 N+1
  const charCache = new Map();
  try {
    const allChars = await getAllDB(STORES.characters);
    allChars.forEach((c) => charCache.set(c.id, c));
  } catch (e) { /* 角色读不到也不阻塞 */ }

  return raws.map((f) => {
    const c = charCache.get(f.characterId);
    return {
      id: f.id,
      kind: 'chat',
      type: 'chat',
      title: c?.name || c?.nickname || '未知角色',
      content: f.type === 'image' ? '[图片]' : (f.content || ''),
      color: DEFAULT_COLOR.key,
      createdAt: f.timestamp,
      // 保留原始字段，跳转时用
      sessionId: f.sessionId,
      characterId: f.characterId,
      messageId: f.messageId
    };
  });
}

// 跳转到对应聊天会话：通过 router 的 deepLink 把 sessionId 带过去
function jumpToChatSession(it) {
  if (!it || !it.sessionId) {
    showToast('这条收藏找不到对应的聊天呀', 'error');
    return;
  }
  openApp('chat', { deepLink: { sessionId: it.sessionId } });
}

// 删除聊天收藏（从 IndexedDB favorites store 删）
function confirmDeleteChatFavorite(it) {
  showConfirm({
    title: '删掉这条收藏吗？',
    body: '删掉就找不回来啦，确定的话就点确认嘛',
    confirmText: '删掉吧',
    cancelText: '再想想',
    danger: true,
    onConfirm: async () => {
      try {
        await deleteDB(STORES.favorites, it.id);
        showToast('删掉啦', 'default', 1200);
        await render();
      } catch (e) {
        console.warn('[collections] 删除聊天收藏失败', e);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

// ════════════════════════════════════════
// 新增 / 编辑表单（bottomSheet）
// ════════════════════════════════════════

function openEditor(item) {
  const editing = !!item;
  const init = item || { id: null, type: 'link', title: '', content: '', color: DEFAULT_COLOR.key };
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="coll-form-row">
      <label class="coll-form-label">类型</label>
      <div class="coll-type-picker" id="coll-types">
        ${['link','text','image'].map((t) => `
          <button type="button" class="coll-type-btn ${t === init.type ? 'active' : ''}" data-type="${t}">
            ${createIcon(TYPE_ICON[t], 20).outerHTML}
            <span>${escapeHTML(TYPE_LABEL[t])}</span>
          </button>
        `).join('')}
      </div>
    </div>
    <div class="coll-form-row">
      <label class="coll-form-label" for="coll-title">标题</label>
      <input class="input" id="coll-title" type="text" placeholder="给这条收藏起个名字..." value="${escapeAttr(init.title || '')}" maxlength="60">
    </div>
    <div class="coll-form-row" id="coll-content-wrap"></div>
    <div class="coll-form-row">
      <label class="coll-form-label">颜色标签</label>
      <div class="coll-color-picker" id="coll-colors">
        ${MACARON_COLORS.map((c) => `
          <button type="button" class="coll-color-dot ${c.key === init.color ? 'selected' : ''}" data-color="${c.key}" style="background:${c.hex}" aria-label="${c.key}"></button>
        `).join('')}
      </div>
    </div>
    <button class="btn primary block" id="coll-save">${editing ? '改好啦' : '收起来'}</button>
  `;

  const sheet = showBottomSheet({
    title: editing ? '编辑收藏' : '加一条新收藏',
    bodyElement: body,
    dismissible: true
  });

  // 表单状态：每种类型各自留存内容，切换时不丢
  const state = {
    type: init.type,
    color: init.color,
    linkContent: init.type === 'link' ? (init.content || '') : '',
    textContent: init.type === 'text' ? (init.content || '') : '',
    imageContent: init.type === 'image' ? (init.content || '') : ''
  };

  const contentWrap = body.querySelector('#coll-content-wrap');

  function renderContentArea() {
    const t = state.type;
    if (t === 'link') {
      contentWrap.innerHTML = `
        <label class="coll-form-label" for="coll-link">链接地址</label>
        <input class="input" id="coll-link" type="text" inputmode="url" placeholder="把网址贴在这里..." value="${escapeAttr(state.linkContent)}" maxlength="500">
      `;
    } else if (t === 'text') {
      contentWrap.innerHTML = `
        <label class="coll-form-label" for="coll-text">文字内容</label>
        <textarea class="textarea" id="coll-text" placeholder="想收点什么文字都可以呀..." maxlength="2000">${escapeHTML(state.textContent)}</textarea>
      `;
    } else {
      contentWrap.innerHTML = `
        <label class="coll-form-label">图片</label>
        <div class="coll-image-pick">
          <div class="coll-image-thumb ${state.imageContent ? '' : 'empty'}" id="coll-img-thumb" ${state.imageContent ? `style="background-image:url('${escapeAttr(state.imageContent)}')"` : ''}>${state.imageContent ? '' : createIcon('camera', 22).outerHTML}</div>
          <button class="btn ghost" id="coll-img-pick" type="button">${createIcon('camera', 18).outerHTML}选图片</button>
        </div>
      `;
      const pickBtn = body.querySelector('#coll-img-pick');
      if (pickBtn) {
        pickBtn.addEventListener('click', async () => {
          try {
            const file = await pickImageFile();
            const dataURL = await compressImage(file);
            if (!dataURL) return;
            state.imageContent = dataURL;
            renderContentArea();
          } catch (e) {
            if (e && e.message && e.message.includes('取消')) return;
            console.warn('[collections] 图片选择失败', e);
            showToast('图片没选上，再试一下嘛', 'error');
          }
        });
      }
    }
  }

  function saveCurrentContent() {
    if (state.type === 'link') {
      const el = body.querySelector('#coll-link');
      if (el) state.linkContent = el.value;
    } else if (state.type === 'text') {
      const el = body.querySelector('#coll-text');
      if (el) state.textContent = el.value;
    }
  }

  // 类型切换
  const typePicker = body.querySelector('#coll-types');
  typePicker.addEventListener('click', (e) => {
    const btn = e.target.closest('.coll-type-btn');
    if (!btn) return;
    saveCurrentContent();
    state.type = btn.dataset.type;
    typePicker.querySelectorAll('.coll-type-btn').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    renderContentArea();
  });

  // 颜色选择
  let chosenColor = state.color;
  body.querySelectorAll('.coll-color-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      chosenColor = dot.dataset.color;
      body.querySelectorAll('.coll-color-dot').forEach((d) => d.classList.remove('selected'));
      dot.classList.add('selected');
    });
  });

  // 初始化内容区
  renderContentArea();

  // 保存
  body.querySelector('#coll-save').addEventListener('click', () => {
    saveCurrentContent();
    const title = body.querySelector('#coll-title').value.trim();
    let content = '';
    if (state.type === 'link') content = state.linkContent.trim();
    else if (state.type === 'text') content = state.textContent.trim();
    else content = state.imageContent;

    if (!title && !content) {
      showToast('标题和内容总得写一个嘛', 'error');
      return;
    }
    if (state.type === 'image' && !content) {
      showToast('选一张图片嘛', 'error');
      return;
    }

    const list = getAll();
    if (editing) {
      const idx = list.findIndex((x) => x.id === init.id);
      if (idx >= 0) {
        list[idx] = { ...list[idx], type: state.type, title, content, color: chosenColor };
      }
    } else {
      list.push({
        id: generateId('coll'),
        type: state.type,
        title,
        content,
        color: chosenColor,
        createdAt: getNow()
      });
    }
    saveAll(list);
    sheet.close();
    showToast(editing ? '改好啦，已帮你更新' : '收起来啦，放心交给我', 'success', 1400);
    render();
  });

  // 自动聚焦标题
  setTimeout(() => { try { body.querySelector('#coll-title')?.focus(); } catch (e) {} }, 60);
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
