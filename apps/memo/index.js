// apps/memo/index.js
// 备忘录 App——软萌少女风格 PWA「泡泡」。
// 我帮主人把每一件小事都记成一张小便签，重要的事会顶到最上面，
// 到了该提醒的时间我会轻轻告诉她。
// 存 IndexedDB（STORES.notes），字段：
//   id / title / content / category / pinned / done / color / remindAt / reminded / createdAt / updatedAt
// 功能：
//   1) 列表按 pinned(置顶) + done(未完成在前) + updatedAt 倒序排
//   2) 顶部分类筛选标签：全部 + 各分类（动态收集）
//   3) 顶部搜索框（按标题/内容/分类过滤，防抖）
//   4) 右上角 + 新增 / 点击条目编辑（bottomSheet 表单）
//   5) 条目右侧：完成切换 / 置顶 / 删除（带 showConfirm）
//   6) 5 个马卡龙色便签纸样式（圆角 + 微旋转 + 阴影 + 背景色）
//   7) 提醒时间（remindAt）：mount 时检查过期未提醒的，逐个 bus.emit + showToast
//   8) 事件注入：memo:changed / memo:toggled / memo:reminder
//   9) 第一人称软萌文案；视觉值走 CSS 变量，马卡龙色为用户内容数据
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js, core/app-bg.js

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, deleteDB, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { formatRelative, debounce, injectStyle } from '../../core/util.js';
import { applyAppBg } from '../../core/app-bg.js';

let containerEl = null;
let searchKeyword = '';
let activeCategory = 'all'; // 当前选中的分类筛选，'all' 表示全部

// 5 个马卡龙色：用户给笔记打的颜色标签，属于内容数据（非主题色）
const MACARON_COLORS = [
  { key: 'sakura',  hex: '#F5A0B0', name: '樱花粉' },
  { key: 'sky',     hex: '#7EC4E0', name: '天空蓝' },
  { key: 'caramel', hex: '#D4A87A', name: '焦糖棕' },
  { key: 'matcha',  hex: '#B5D9A0', name: '抹茶绿' },
  { key: 'lemon',   hex: '#F5D88A', name: '柠檬黄' }
];
const DEFAULT_COLOR = MACARON_COLORS[0];

// 旧数据里可能存在已退役的颜色 key（如 lavender / 旧 sky），找不到就回退默认色
function colorOf(key) {
  return MACARON_COLORS.find((c) => c.key === key) || DEFAULT_COLOR;
}

// 自定义样式（全部走 CSS 变量，马卡龙色仅作用于便签背景与色条）
injectStyle('app-memo-style', `
  .memo-toolbar{ display:flex; flex-direction:column; gap:10px; margin-bottom:14px; }
  .memo-search-wrap{ position:relative; }
  .memo-search-wrap .popo-icon{
    position:absolute; left:14px; top:50%; transform:translateY(-50%);
    color:var(--text-hint); pointer-events:none;
  }
  .memo-search{
    width:100%; box-sizing:border-box; padding:11px 16px 11px 42px;
    background:color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    border:1px solid color-mix(in srgb, var(--text-hint) 18%, transparent);
    border-radius:var(--radius-md);
    font-size:var(--font-size-base); color:var(--text-primary);
    transition:var(--motion);
  }
  .memo-search:focus{ border-color:var(--accent); background:var(--bg-card); outline:none; }

  .memo-cats{
    display:flex; gap:8px; overflow-x:auto; padding:2px 0 4px;
    -webkit-overflow-scrolling:touch; scrollbar-width:none;
  }
  .memo-cats::-webkit-scrollbar{ display:none; }
  .memo-cat{
    flex-shrink:0; padding:6px 14px; border-radius:999px;
    background:color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    color:var(--text-secondary); font-size:var(--font-size-small);
    border:1px solid transparent; cursor:pointer; transition:var(--motion);
    white-space:nowrap;
  }
  .memo-cat:active{ transform:scale(var(--press-scale)); }
  .memo-cat.active{
    background:var(--accent); color:var(--bubble-user-text);
    border-color:var(--accent);
  }

  .memo-card{
    position:relative; border-radius:var(--radius-card);
    padding:14px 16px 14px 20px; margin-bottom:12px; overflow:hidden;
    box-shadow:var(--shadow-sm); transition:var(--motion);
    border:1px solid color-mix(in srgb, var(--text-hint) 12%, transparent);
  }
  .memo-card:active{ transform:scale(var(--press-scale)); }
  .memo-card-color{ position:absolute; left:0; top:0; bottom:0; width:4px; }
  .memo-card-row{ display:flex; align-items:flex-start; gap:8px; }
  .memo-card-main{ flex:1; min-width:0; cursor:pointer; }
  .memo-card-title{
    font-size:var(--font-size-base); font-weight:600;
    color:var(--text-primary); line-height:1.4; word-break:break-word;
  }
  .memo-card.done .memo-card-title{
    text-decoration:line-through; color:var(--text-hint);
  }
  .memo-card-content{
    font-size:var(--font-size-small); color:var(--text-secondary);
    line-height:1.5; margin-top:4px;
    display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;
    overflow:hidden; word-break:break-word;
  }
  .memo-card-meta{
    font-size:var(--font-size-small); color:var(--text-hint);
    margin-top:8px; display:flex; align-items:center; gap:6px; flex-wrap:wrap;
  }
  .memo-card-meta .chip{
    display:inline-flex; align-items:center; gap:3px;
    padding:2px 8px; border-radius:999px;
    background:color-mix(in srgb, var(--bg-secondary) 60%, transparent);
  }
  .memo-card-meta .chip.pin{ color:var(--accent); }
  .memo-card-meta .chip.cat{ color:var(--text-secondary); }
  .memo-card-meta .chip.remind{ color:var(--accent-dark); }
  .memo-card-meta .chip.remind.overdue{ color:#E8888C; }
  .memo-card-actions{ display:flex; align-items:center; gap:2px; flex-shrink:0; }
  .memo-icon-btn{
    width:30px; height:30px; border-radius:50%;
    background:transparent; color:var(--text-hint);
    display:flex; align-items:center; justify-content:center;
    transition:var(--motion); cursor:pointer; border:none;
  }
  .memo-icon-btn:active{ transform:scale(var(--press-scale)); }
  .memo-icon-btn.pinned{ color:var(--accent); }
  .memo-icon-btn.done.checked{
    background:var(--accent); color:var(--bubble-user-text);
  }
  .memo-empty-icon{ color:var(--text-hint); opacity:0.5; margin-bottom:12px; }
  .memo-form-row{ margin-bottom:14px; }
  .memo-form-label{
    font-size:var(--font-size-small); color:var(--text-secondary);
    margin-bottom:6px; display:block;
  }
  .memo-color-picker{ display:flex; gap:10px; flex-wrap:wrap; }
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
  .memo-remind-row{ display:flex; gap:8px; align-items:center; }
  .memo-remind-row input{ flex:1; }
  .memo-remind-clear{
    padding:8px 12px; border-radius:var(--radius-sm);
    background:var(--bg-secondary); color:var(--text-secondary);
    font-size:var(--font-size-small); border:none; cursor:pointer;
  }
  .memo-toggle-row{
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 14px; border-radius:var(--radius-md);
    background:color-mix(in srgb, var(--bg-secondary) 60%, transparent);
    border:1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
  }
  .memo-toggle-label{
    font-size:var(--font-size-base); color:var(--text-primary);
    display:flex; align-items:center; gap:8px;
  }
  .memo-toggle-label .popo-icon{ color:var(--accent); }
  .memo-toggle-hint{
    font-size:var(--font-size-small); color:var(--text-hint); margin-top:2px;
  }
  .memo-toggle{
    position:relative; width:44px; height:26px; flex-shrink:0;
    background:color-mix(in srgb, var(--text-hint) 35%, transparent);
    border-radius:999px; cursor:pointer; transition:var(--motion);
    border:none; padding:0;
  }
  .memo-toggle::after{
    content:''; position:absolute; left:3px; top:3px;
    width:20px; height:20px; border-radius:50%;
    background:var(--bg-card); box-shadow:var(--shadow-sm);
    transition:var(--motion);
  }
  .memo-toggle.on{ background:var(--accent); }
  .memo-toggle.on::after{ left:21px; }
`);

// ========================================
// mount / unmount
// ========================================

export async function mount(container, context) {
  containerEl = container;
  searchKeyword = '';
  activeCategory = 'all';
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="memo-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">备忘录</div>
      <button class="app-add" id="memo-add" aria-label="新增笔记">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="memo-body">
      <div class="memo-toolbar">
        <div class="memo-search-wrap">
          ${createIcon('search', 18).outerHTML}
          <input class="memo-search" id="memo-search" type="search" placeholder="找找记过的小事..." aria-label="搜索笔记">
        </div>
        <div class="memo-cats" id="memo-cats"></div>
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
  // mount 末尾：应用背景 + 检查过期提醒
  applyAppBg(container, 'memo');
  await checkOverdueReminders();
}

export function unmount() {
  containerEl = null;
}

// ========================================
// 列表渲染
// ========================================

async function render() {
  const listEl = containerEl?.querySelector('#memo-list');
  const catsEl = containerEl?.querySelector('#memo-cats');
  if (!listEl) return;
  let notes = [];
  try {
    notes = await getAllDB(STORES.notes);
  } catch (e) {
    console.warn('[memo] 读取笔记失败', e);
    showToast('笔记读不出来嘛，等一下再试试', 'error');
  }
  // 收集所有分类（去重排序），用于顶部筛选标签
  const catSet = new Set();
  notes.forEach((n) => { if (n.category) catSet.add(n.category); });
  const cats = Array.from(catSet).sort();
  if (catsEl) {
    const allCats = [{ key: 'all', label: '全部' }, ...cats.map((c) => ({ key: c, label: c }))];
    catsEl.innerHTML = allCats.map((c) => `
      <button class="memo-cat ${activeCategory === c.key ? 'active' : ''}" data-cat="${escapeAttr(c.key)}">${escapeHTML(c.label)}</button>
    `).join('');
    catsEl.querySelectorAll('.memo-cat').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeCategory = btn.dataset.cat;
        render();
      });
    });
  }
  // 关键词 + 分类过滤
  const kw = searchKeyword;
  let filtered = notes;
  if (activeCategory !== 'all') {
    filtered = filtered.filter((n) => n.category === activeCategory);
  }
  if (kw) {
    filtered = filtered.filter((n) => {
      const t = (n.title || '').toLowerCase();
      const c = (n.content || '').toLowerCase();
      const cat = (n.category || '').toLowerCase();
      return t.includes(kw) || c.includes(kw) || cat.includes(kw);
    });
  }
  // 排序：置顶优先 -> 未完成在前 -> updatedAt 倒序
  filtered.sort((a, b) => {
    const pa = a.pinned ? 1 : 0;
    const pb = b.pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const da = a.done ? 1 : 0;
    const db = b.done ? 1 : 0;
    if (da !== db) return da - db;
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });
  if (filtered.length === 0) {
    const emptyMsg = (kw || activeCategory !== 'all')
      ? '没找到相关的笔记呀，换几个字试试嘛'
      : '还没有笔记，点右上角写一条嘛，我帮你记着呢';
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="memo-empty-icon">${createIcon('memo', 48).outerHTML}</div>
        <div class="empty-state-text">${emptyMsg}</div>
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
    const doneBtn = card.querySelector('.memo-done');
    if (doneBtn) doneBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleDone(n); });
    const pinBtn = card.querySelector('.memo-pin');
    if (pinBtn) pinBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePin(n); });
    const delBtn = card.querySelector('.memo-del');
    if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(n); });
  });
}

function renderNoteCard(n) {
  const color = colorOf(n.color);
  const colorHex = color.hex;
  const title = n.title || '（没起标题呢）';
  const content = n.content || '';
  const time = formatRelative(n.updatedAt || n.createdAt);
  const checkIcon = createIcon('check', 16).outerHTML;
  const pinIcon = createIcon('star', 16).outerHTML;
  const trashIcon = createIcon('trash', 16).outerHTML;
  const bellIcon = createIcon('bell', 14).outerHTML;
  // 微旋转：根据 id 哈希算 -1.2~1.2 度，做出便签纸随手贴的感觉
  const tilt = ((hashStr(n.id) % 5) - 2) * 0.6;
  // 便签背景：马卡龙色 + 半透明叠加在卡片底色上，保证文字可读
  const bg = `background:color-mix(in srgb, ${colorHex} 28%, var(--bg-card));`;
  // 提醒小标签
  let remindChip = '';
  if (n.remindAt) {
    const r = new Date(n.remindAt);
    if (!Number.isNaN(r.getTime())) {
      const overdue = !n.done && r.getTime() < Date.now();
      remindChip = `<span class="chip remind ${overdue ? 'overdue' : ''}">${bellIcon}${escapeHTML(formatRelative(r))}</span>`;
    }
  }
  return `
    <div class="memo-card ${n.done ? 'done' : ''}" data-id="${escapeAttr(n.id)}" style="${bg} transform:rotate(${tilt}deg);">
      <div class="memo-card-color" style="background:${colorHex}"></div>
      <div class="memo-card-row">
        <div class="memo-card-main" role="button" tabindex="0" aria-label="编辑笔记">
          <div class="memo-card-title">${escapeHTML(title)}</div>
          ${content ? `<div class="memo-card-content">${escapeHTML(content)}</div>` : ''}
          <div class="memo-card-meta">
            ${n.pinned ? `<span class="chip pin">${pinIcon}置顶</span>` : ''}
            ${n.category ? `<span class="chip cat">${escapeHTML(n.category)}</span>` : ''}
            ${remindChip}
            <span>${escapeHTML(time)}</span>
          </div>
        </div>
        <div class="memo-card-actions">
          <button class="memo-icon-btn memo-done ${n.done ? 'checked' : ''}" aria-label="${n.done ? '标记未完成' : '标记完成'}" title="${n.done ? '标记未完成' : '标记完成'}">${checkIcon}</button>
          <button class="memo-icon-btn memo-pin ${n.pinned ? 'pinned' : ''}" aria-label="${n.pinned ? '取消置顶' : '置顶'}" title="${n.pinned ? '取消置顶' : '置顶'}">${pinIcon}</button>
          <button class="memo-icon-btn memo-del" aria-label="删除笔记" title="删除">${trashIcon}</button>
        </div>
      </div>
    </div>
  `;
}

// ========================================
// 完成 / 置顶 / 删除
// ========================================

async function toggleDone(n) {
  try {
    const next = !n.done;
    await setDB(STORES.notes, n.id, { ...n, done: next });
    bus.emit('memo:toggled', { id: n.id, done: next });
    showToast(next ? '完成啦，给自己一个小奖励嘛' : '又拿回来接着做嘛', 'success', 1200);
    await render();
  } catch (e) {
    console.warn('[memo] 切换完成失败', e);
    showToast('没切换成功，再试一下嘛', 'error');
  }
}

async function togglePin(n) {
  try {
    await setDB(STORES.notes, n.id, { ...n, pinned: !n.pinned });
    bus.emit('memo:changed', { id: n.id, action: 'pin' });
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
        bus.emit('memo:changed', { id: n.id, action: 'delete' });
        showToast('删掉啦', 'default', 1200);
        await render();
      } catch (e) {
        console.warn('[memo] 删除失败', e);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

// ========================================
// 新增 / 编辑表单（bottomSheet）
// ========================================

function openEditor(note) {
  const editing = !!note;
  const init = note || {
    id: null, title: '', content: '', category: '',
    pinned: false, done: false, color: DEFAULT_COLOR.key, remindAt: ''
  };
  // datetime-local 输入框需要 yyyy-MM-ddTHH:mm 本地格式
  const remindLocal = toLocalDateTimeInput(init.remindAt);
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
      <label class="memo-form-label" for="memo-category">分类（比如：工作 / 生活 / 想法）</label>
      <input class="input" id="memo-category" type="text" placeholder="给笔记归个类..." value="${escapeAttr(init.category || '')}" maxlength="20">
    </div>
    <div class="memo-form-row">
      <label class="memo-form-label">颜色标签</label>
      <div class="memo-color-picker" id="memo-colors">
        ${MACARON_COLORS.map((c) => `
          <button type="button" class="memo-color-dot ${c.key === init.color ? 'selected' : ''}" data-color="${c.key}" style="background:${c.hex}" aria-label="${c.name}" title="${c.name}"></button>
        `).join('')}
      </div>
    </div>
    <div class="memo-form-row">
      <div class="memo-toggle-row">
        <div>
          <div class="memo-toggle-label">${createIcon('star', 18).outerHTML}置顶这条笔记</div>
          <div class="memo-toggle-hint">置顶后会排在最前面，重要的事一眼就看到</div>
        </div>
        <button type="button" class="memo-toggle ${init.pinned ? 'on' : ''}" id="memo-pinned" aria-pressed="${init.pinned ? 'true' : 'false'}" aria-label="置顶开关"></button>
      </div>
    </div>
    <div class="memo-form-row">
      <label class="memo-form-label" for="memo-remind">提醒时间（可以不设）</label>
      <div class="memo-remind-row">
        <input class="input" id="memo-remind" type="datetime-local" value="${escapeAttr(remindLocal)}">
        ${init.remindAt ? '<button type="button" class="memo-remind-clear" id="memo-remind-clear">清掉提醒</button>' : ''}
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
  // 置顶开关：点击切换 on/off，同步 aria-pressed
  let chosenPinned = !!init.pinned;
  const pinToggle = body.querySelector('#memo-pinned');
  if (pinToggle) {
    pinToggle.addEventListener('click', () => {
      chosenPinned = !chosenPinned;
      pinToggle.classList.toggle('on', chosenPinned);
      pinToggle.setAttribute('aria-pressed', chosenPinned ? 'true' : 'false');
    });
  }
  const clearBtn = body.querySelector('#memo-remind-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      body.querySelector('#memo-remind').value = '';
      showToast('提醒清掉啦', 'default', 1000);
    });
  }
  body.querySelector('#memo-save').addEventListener('click', async () => {
    const title = body.querySelector('#memo-title').value.trim();
    const content = body.querySelector('#memo-content').value.trim();
    const category = body.querySelector('#memo-category').value.trim();
    const remindRaw = body.querySelector('#memo-remind').value;
    if (!title && !content) {
      showToast('标题和内容总得写一个嘛', 'error');
      return;
    }
    try {
      const id = init.id || generateId('note');
      const existing = editing ? await getDB(STORES.notes, init.id) : null;
      // 提醒时间转 ISO；改了提醒时间就重置 reminded，让它能重新触发
      let remindAt = '';
      let reminded = existing?.reminded || false;
      if (remindRaw) {
        remindAt = new Date(remindRaw).toISOString();
        if (!existing || existing.remindAt !== remindAt) {
          reminded = false;
        }
      } else {
        reminded = false;
      }
      const record = {
        id,
        title,
        content,
        category,
        pinned: chosenPinned,
        done: init.done || false,
        color: chosenColor,
        remindAt,
        reminded,
        createdAt: existing?.createdAt || getNow()
      };
      await setDB(STORES.notes, id, record);
      bus.emit('memo:changed', { id, action: editing ? 'edit' : 'add' });
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

// ========================================
// 过期提醒检查（mount 时跑一次）
// ========================================

async function checkOverdueReminders() {
  try {
    const notes = await getAllDB(STORES.notes);
    const now = Date.now();
    for (const n of notes) {
      // 只处理：有提醒时间 + 未完成 + 未提醒过 + 已过期
      if (!n.remindAt || n.done || n.reminded) continue;
      const t = new Date(n.remindAt).getTime();
      if (Number.isNaN(t) || t >= now) continue;
      try {
        await setDB(STORES.notes, n.id, { ...n, reminded: true });
        bus.emit('memo:reminder', { id: n.id, title: n.title || '（没起标题呢）' });
        showToast('备忘录提醒：' + (n.title || '有条笔记该看看啦'), 'success', 2600);
      } catch (e) {
        console.warn('[memo] 触发提醒失败', n.id, e);
      }
    }
  } catch (e) {
    console.warn('[memo] 检查过期提醒失败', e);
  }
}

// ========================================
// 工具
// ========================================

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

// 把字符串哈希成整数（用于便签微旋转角度）
function hashStr(s) {
  let h = 0;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ISO 时间戳转 datetime-local 输入框需要的 yyyy-MM-ddTHH:mm 本地格式
function toLocalDateTimeInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
