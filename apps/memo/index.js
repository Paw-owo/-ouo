// apps/memo/index.js
// 备忘录 App——Phase 1 真实可用版。
// 功能：
//   1) 笔记存 IndexedDB（STORES.notes），字段 id/title/content/pinned/color/createdAt/updatedAt
//   2) 列表按 pinned(置顶) + updatedAt 倒序排
//   3) 顶部搜索框（按标题/内容过滤，防抖）
//   4) 右上角 + 新增 / 点击条目编辑（bottomSheet 表单：标题 + 内容 + 5 个马卡龙色）
//   5) 条目右侧小垃圾桶删除（带 showConfirm）
//   6) 图钉（用 star 图标代替，图标库无 pin）切换置顶
//   7) 卡片左侧 4px 色条标识笔记颜色
//   8) 第一人称软萌文案
//   9) 视觉值走 CSS 变量，马卡龙色为用户内容数据
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, deleteDB, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { formatRelative, debounce, injectStyle } from '../../core/util.js';

let containerEl = null;
let searchKeyword = '';

// 5 个马卡龙色：用户给笔记打的颜色标签，属于内容数据（非主题色）
const MACARON_COLORS = [
  { key: 'sakura',   hex: '#F5A0B0' },
  { key: 'lemon',    hex: '#F5D88A' },
  { key: 'matcha',   hex: '#B5D9A0' },
  { key: 'sky',      hex: '#A0C8E8' },
  { key: 'lavender', hex: '#C8A8E0' }
];
const DEFAULT_COLOR = MACARON_COLORS[0];

// 自定义样式（全部走 CSS 变量，马卡龙色仅作用于内容色条）
injectStyle('app-memo-style', `
  .memo-search-wrap{ position:relative; margin-bottom:14px; }
  .memo-search-wrap .popo-icon{
    position:absolute; left:14px; top:50%; transform:translateY(-50%);
    color:var(--text-hint); pointer-events:none;
  }
  .memo-search{
    width:100%; padding:11px 16px 11px 42px;
    background:color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    border:1px solid color-mix(in srgb, var(--text-hint) 18%, transparent);
    border-radius:var(--radius-md);
    font-size:var(--font-size-base); color:var(--text-primary);
    transition:var(--motion);
  }
  .memo-search:focus{ border-color:var(--accent); background:var(--bg-card); outline:none; }
  .memo-card{
    position:relative; background:var(--bg-card);
    border-radius:var(--radius-card);
    padding:14px 16px 14px 20px;
    box-shadow:var(--shadow-sm);
    margin-bottom:12px; overflow:hidden;
    transition:var(--motion);
  }
  .memo-card:active{ transform:scale(var(--press-scale)); }
  .memo-card-color{ position:absolute; left:0; top:0; bottom:0; width:4px; }
  .memo-card-row{ display:flex; align-items:flex-start; gap:8px; }
  .memo-card-main{ flex:1; min-width:0; cursor:pointer; }
  .memo-card-title{
    font-size:var(--font-size-base); font-weight:600;
    color:var(--text-primary); line-height:1.4; word-break:break-word;
  }
  .memo-card-content{
    font-size:var(--font-size-small); color:var(--text-secondary);
    line-height:1.5; margin-top:4px;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
    overflow:hidden; word-break:break-word;
  }
  .memo-card-meta{
    font-size:var(--font-size-small); color:var(--text-hint);
    margin-top:8px; display:flex; align-items:center; gap:6px;
  }
  .memo-card-actions{ display:flex; align-items:center; gap:2px; flex-shrink:0; }
  .memo-icon-btn{
    width:30px; height:30px; border-radius:50%;
    background:transparent; color:var(--text-hint);
    display:flex; align-items:center; justify-content:center;
    transition:var(--motion);
  }
  .memo-icon-btn:active{ transform:scale(var(--press-scale)); }
  .memo-icon-btn.pinned{ color:var(--accent); }
  .memo-pin-badge{
    display:inline-flex; align-items:center; gap:3px;
    font-size:var(--font-size-small); color:var(--accent);
  }
  .memo-empty-icon{ color:var(--text-hint); opacity:0.5; margin-bottom:12px; }
  .memo-form-row{ margin-bottom:14px; }
  .memo-form-label{
    font-size:var(--font-size-small); color:var(--text-secondary);
    margin-bottom:6px; display:block;
  }
  .memo-color-picker{ display:flex; gap:10px; }
  .memo-color-dot{
    width:30px; height:30px; border-radius:50%;
    cursor:pointer; border:2px solid transparent;
    transition:var(--motion);
  }
  .memo-color-dot:active{ transform:scale(var(--press-scale)); }
  .memo-color-dot.selected{
    border-color:var(--text-primary);
    box-shadow:0 0 0 2px var(--bg-card) inset;
  }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  searchKeyword = '';
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="memo-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">备忘录</div>
      <button class="app-add" id="memo-add" aria-label="新增笔记">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="memo-body">
      <div class="memo-search-wrap">
        ${createIcon('search', 18).outerHTML}
        <input class="memo-search" id="memo-search" type="search" placeholder="找找记过的小事..." aria-label="搜索笔记">
      </div>
      <div id="memo-list"></div>
    </div>
  `;
  container.querySelector('#memo-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#memo-add').addEventListener('click', () => openEditor(null));
  // 搜索防抖
  const onSearch = debounce((e) => {
    searchKeyword = (e.target.value || '').trim().toLowerCase();
    render();
  }, 180);
  container.querySelector('#memo-search').addEventListener('input', onSearch);
  await render();
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 列表渲染
// ════════════════════════════════════════

async function render() {
  const listEl = containerEl?.querySelector('#memo-list');
  if (!listEl) return;
  let notes = [];
  try {
    notes = await getAllDB(STORES.notes);
  } catch (e) {
    console.warn('[memo] 读取笔记失败', e);
    showToast('笔记读不出来嘛，等一下再试试', 'error');
  }
  // 关键词过滤
  const kw = searchKeyword;
  const filtered = kw
    ? notes.filter((n) => {
        const t = (n.title || '').toLowerCase();
        const c = (n.content || '').toLowerCase();
        return t.includes(kw) || c.includes(kw);
      })
    : notes;
  // 排序：置顶优先，然后 updatedAt 倒序
  filtered.sort((a, b) => {
    const pa = a.pinned ? 1 : 0;
    const pb = b.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });
  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="memo-empty-icon">${createIcon('memo', 48).outerHTML}</div>
        <div class="empty-state-text">${kw ? '没找到相关的笔记呀，换几个字试试嘛' : '还没有笔记，点右上角写一条嘛，我帮你记着呢'}</div>
      </div>
    `;
    return;
  }
  listEl.innerHTML = filtered.map(renderNoteCard).join('');
  // 绑定每条的事件
  filtered.forEach((n) => {
    const card = listEl.querySelector(`[data-id="${cssEscape(n.id)}"]`);
    if (!card) return;
    const main = card.querySelector('.memo-card-main');
    if (main) main.addEventListener('click', () => openEditor(n));
    const pinBtn = card.querySelector('.memo-pin');
    if (pinBtn) pinBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePin(n); });
    const delBtn = card.querySelector('.memo-del');
    if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(n); });
  });
}

function renderNoteCard(n) {
  const colorHex = (MACARON_COLORS.find((c) => c.key === n.color) || DEFAULT_COLOR).hex;
  const title = n.title || '（没起标题呢）';
  const content = n.content || '';
  const time = formatRelative(n.updatedAt || n.createdAt);
  const pinIcon = createIcon('star', 16).outerHTML;
  const trashIcon = createIcon('trash', 16).outerHTML;
  return `
    <div class="memo-card" data-id="${escapeAttr(n.id)}">
      <div class="memo-card-color" style="background:${colorHex}"></div>
      <div class="memo-card-row">
        <div class="memo-card-main" role="button" tabindex="0" aria-label="编辑笔记">
          <div class="memo-card-title">${escapeHTML(title)}</div>
          ${content ? `<div class="memo-card-content">${escapeHTML(content)}</div>` : ''}
          <div class="memo-card-meta">
            ${n.pinned ? `<span class="memo-pin-badge">${pinIcon}置顶</span>` : ''}
            <span>${escapeHTML(time)}</span>
          </div>
        </div>
        <div class="memo-card-actions">
          <button class="memo-icon-btn memo-pin ${n.pinned ? 'pinned' : ''}" aria-label="${n.pinned ? '取消置顶' : '置顶'}" title="${n.pinned ? '取消置顶' : '置顶'}">${pinIcon}</button>
          <button class="memo-icon-btn memo-del" aria-label="删除笔记" title="删除">${trashIcon}</button>
        </div>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════
// 置顶 / 删除
// ════════════════════════════════════════

async function togglePin(n) {
  try {
    await setDB(STORES.notes, n.id, { ...n, pinned: !n.pinned });
    showToast(n.pinned ? '取消置顶啦' : '置顶好啦，重要的事放最上面', 'success', 1200);
    await render();
  } catch (e) {
    console.warn('[memo] 切换置顶失败', e);
    showToast('没切换成功，再试一下嘛', 'error');
  }
}

function confirmDelete(n) {
  showConfirm({
    title: '删掉这条笔记吗？',
    body: '删掉就找不回来啦，确定的话就点确认嘛',
    confirmText: '删掉吧',
    cancelText: '再想想',
    danger: true,
    onConfirm: async () => {
      try {
        await deleteDB(STORES.notes, n.id);
        showToast('删掉啦', 'default', 1200);
        await render();
      } catch (e) {
        console.warn('[memo] 删除失败', e);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

// ════════════════════════════════════════
// 新增 / 编辑表单（bottomSheet）
// ════════════════════════════════════════

function openEditor(note) {
  const editing = !!note;
  const init = note || { id: null, title: '', content: '', pinned: false, color: DEFAULT_COLOR.key };
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="memo-form-row">
      <label class="memo-form-label" for="memo-title">标题</label>
      <input class="input" id="memo-title" type="text" placeholder="给这条笔记起个名字..." value="${escapeAttr(init.title)}" maxlength="60">
    </div>
    <div class="memo-form-row">
      <label class="memo-form-label" for="memo-content">内容</label>
      <textarea class="textarea" id="memo-content" placeholder="想记点什么都可以告诉我呀..." maxlength="2000">${escapeHTML(init.content)}</textarea>
    </div>
    <div class="memo-form-row">
      <label class="memo-form-label">颜色标签</label>
      <div class="memo-color-picker" id="memo-colors">
        ${MACARON_COLORS.map((c) => `
          <button type="button" class="memo-color-dot ${c.key === init.color ? 'selected' : ''}" data-color="${c.key}" style="background:${c.hex}" aria-label="${c.key}"></button>
        `).join('')}
      </div>
    </div>
    <button class="btn primary block" id="memo-save">${editing ? '改好啦' : '记下来'}</button>
  `;
  const sheet = showBottomSheet({
    title: editing ? '编辑笔记' : '写一条新笔记',
    bodyElement: body,
    dismissible: true
  });
  let chosenColor = init.color;
  body.querySelectorAll('.memo-color-dot').forEach((dot) => {
    dot.addEventListener('click', () => {
      chosenColor = dot.dataset.color;
      body.querySelectorAll('.memo-color-dot').forEach((d) => d.classList.remove('selected'));
      dot.classList.add('selected');
    });
  });
  body.querySelector('#memo-save').addEventListener('click', async () => {
    const title = body.querySelector('#memo-title').value.trim();
    const content = body.querySelector('#memo-content').value.trim();
    if (!title && !content) {
      showToast('标题和内容总得写一个嘛', 'error');
      return;
    }
    try {
      const id = init.id || generateId('note');
      // 编辑时保留原 createdAt
      const existing = editing ? await getDB(STORES.notes, init.id) : null;
      const record = {
        id,
        title,
        content,
        pinned: init.pinned || false,
        color: chosenColor,
        createdAt: existing?.createdAt || getNow()
      };
      await setDB(STORES.notes, id, record);
      sheet.close();
      showToast(editing ? '改好啦，已帮你更新' : '记下来啦，放心交给我', 'success', 1400);
      await render();
    } catch (e) {
      console.warn('[memo] 保存失败', e);
      showToast('没保存成功，再试一下嘛', 'error');
    }
  });
  // 自动聚焦标题
  setTimeout(() => { try { body.querySelector('#memo-title')?.focus(); } catch (e) {} }, 60);
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
