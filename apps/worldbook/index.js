// apps/worldbook/index.js
// 世界书 App——软萌少女风格 PWA「泡泡」。
// 我帮主人把每一段世界观都收得整整齐齐，AI 聊天时会按关键词偷偷塞进去。
// 存 IndexedDB（STORES.worldbook），字段：
//   {id, keyword, content, enabled, priority, createdAt, updatedAt}
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, deleteDB, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, debounce } from '../../core/util.js';

let containerEl = null;
let searchKeyword = '';

// 默认值
const DEFAULT_PRIORITY = 0;
const MAX_PRIORITY = 9999;

// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符
injectStyle('app-worldbook-style', `
  .wb-search-wrap { position: relative; margin-bottom: 14px; }
  .wb-search-wrap .popo-icon {
    position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
    color: var(--text-hint); pointer-events: none;
  }
  .wb-search {
    width: 100%; box-sizing: border-box;
    padding: 11px 16px 11px 42px;
    background: color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    border: 1px solid color-mix(in srgb, var(--text-hint) 18%, transparent);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base); color: var(--text-primary);
    transition: var(--motion);
  }
  .wb-search:focus { border-color: var(--accent); background: var(--bg-card); outline: none; }

  .wb-list-head {
    display: flex; align-items: center; justify-content: space-between;
    margin: 4px 2px 10px;
  }
  .wb-list-head-title {
    font-size: var(--font-size-base); font-weight: 600; color: var(--text-secondary);
  }
  .wb-list-head-count {
    font-size: var(--font-size-small); color: var(--text-hint);
  }

  .wb-card {
    background: var(--bg-card);
    border: 1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    border-radius: var(--radius-card);
    padding: 14px;
    margin-bottom: 12px;
    transition: var(--motion);
  }
  .wb-card.disabled { opacity: 0.55; }
  .wb-card-row { display: flex; align-items: flex-start; gap: 10px; }
  .wb-card-main { flex: 1; min-width: 0; cursor: pointer; }
  .wb-card-keyword-row {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px;
  }
  .wb-card-keyword {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: var(--font-size-base); font-weight: 600;
    color: var(--accent-dark);
    background: color-mix(in srgb, var(--accent-light) 55%, transparent);
    padding: 3px 10px; border-radius: 999px;
    max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .wb-card-priority {
    font-size: var(--font-size-small); color: var(--text-hint);
    flex-shrink: 0;
  }
  .wb-card-content {
    font-size: var(--font-size-small); color: var(--text-secondary);
    line-height: 1.5; margin-top: 6px;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
    overflow: hidden; word-break: break-word;
  }
  .wb-card-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
  .wb-icon-btn {
    width: 32px; height: 32px; border-radius: 50%;
    background: transparent; color: var(--text-hint);
    display: flex; align-items: center; justify-content: center;
    transition: var(--motion);
  }
  .wb-icon-btn:active { transform: scale(var(--press-scale)); }

  /* 启用开关（纯 SVG 线稿风，无 emoji） */
  .wb-toggle {
    width: 44px; height: 26px; border-radius: 999px;
    background: color-mix(in srgb, var(--text-hint) 30%, transparent);
    position: relative; cursor: pointer; transition: var(--motion);
    flex-shrink: 0; border: none; padding: 0;
  }
  .wb-toggle.on { background: var(--accent); }
  .wb-toggle-thumb {
    position: absolute; top: 3px; left: 3px;
    width: 20px; height: 20px; border-radius: 50%;
    background: #fff; box-shadow: var(--shadow-sm);
    transition: var(--motion) var(--motion-spring);
    display: flex; align-items: center; justify-content: center;
    color: var(--text-hint);
  }
  .wb-toggle.on .wb-toggle-thumb {
    left: 21px; color: var(--accent);
  }

  .wb-empty {
    display: flex; flex-direction: column; align-items: center;
    padding: 60px 24px; text-align: center; color: var(--text-hint);
  }
  .wb-empty-icon {
    color: var(--accent); opacity: 0.6; margin-bottom: 14px;
    display: flex; justify-content: center;
  }
  .wb-empty-text {
    font-size: var(--font-size-base); color: var(--text-secondary); line-height: 1.6;
  }

  .wb-form-row { margin-bottom: 12px; }
  .wb-form-label {
    font-size: var(--font-size-small); color: var(--text-secondary);
    margin-bottom: 6px; display: block;
  }
  .wb-form-hint {
    font-size: var(--font-size-small); color: var(--text-hint);
    margin-top: 4px; line-height: 1.4;
  }
  .wb-priority-row {
    display: flex; align-items: center; gap: 10px;
  }
  .wb-priority-input {
    width: 90px; flex-shrink: 0;
  }
  .wb-enable-row {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 12px; border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--bg-secondary) 50%, transparent);
  }
  .wb-enable-row label {
    flex: 1; font-size: var(--font-size-base); color: var(--text-primary); cursor: pointer;
  }
  .wb-actions-row { display: flex; gap: 8px; }
  .wb-actions-row .btn { flex: 1; justify-content: center; }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  searchKeyword = '';
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="wb-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">世界书</div>
      <button class="app-add" id="wb-add" aria-label="新增词条">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="wb-body">
      <div class="wb-search-wrap">
        ${createIcon('search', 18).outerHTML}
        <input class="wb-search" id="wb-search" type="search" placeholder="找找世界观小片段..." aria-label="搜索词条">
      </div>
      <div id="wb-list"></div>
    </div>
  `;
  container.querySelector('#wb-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#wb-add').addEventListener('click', () => openForm(null));
  // 搜索防抖
  const onSearch = debounce((e) => {
    searchKeyword = (e.target.value || '').trim().toLowerCase();
    render();
  }, 180);
  container.querySelector('#wb-search').addEventListener('input', onSearch);
  await render();
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 列表渲染
// ════════════════════════════════════════

async function render() {
  const listEl = containerEl?.querySelector('#wb-list');
  if (!listEl) return;
  let entries = [];
  try {
    entries = await getAllDB(STORES.worldbook);
  } catch (e) {
    console.warn('[worldbook] 读取词条失败', e);
    showToast('词条读不出来嘛，等一下再试试', 'error');
    return;
  }
  // 关键词过滤
  const kw = searchKeyword;
  const filtered = kw
    ? entries.filter((e) => {
        const k = (e.keyword || '').toLowerCase();
        const c = (e.content || '').toLowerCase();
        return k.includes(kw) || c.includes(kw);
      })
    : entries;
  // 按 priority 倒序（数字越大越靠前），同 priority 按 updatedAt 倒序
  filtered.sort((a, b) => {
    const pa = Number(a.priority ?? 0);
    const pb = Number(b.priority ?? 0);
    if (pa !== pb) return pb - pa;
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="wb-empty">
        <div class="wb-empty-icon">${createIcon('memo', 52).outerHTML}</div>
        <div class="wb-empty-text">${kw ? '没找到相关的词条呀，换几个字试试嘛' : '还没有词条，加一些世界观设定嘛'}</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = `
    <div class="wb-list-head">
      <span class="wb-list-head-title">全部词条</span>
      <span class="wb-list-head-count">共 ${filtered.length} 条</span>
    </div>
    ${filtered.map(renderCard).join('')}
  `;

  // 绑定事件
  filtered.forEach((e) => {
    const card = listEl.querySelector(`[data-id="${cssEscape(e.id)}"]`);
    if (!card) return;
    const main = card.querySelector('.wb-card-main');
    if (main) main.addEventListener('click', () => openForm(e));
    const toggle = card.querySelector('.wb-toggle');
    if (toggle) toggle.addEventListener('click', (ev) => { ev.stopPropagation(); toggleEnabled(e); });
    const delBtn = card.querySelector('.wb-del');
    if (delBtn) delBtn.addEventListener('click', (ev) => { ev.stopPropagation(); confirmDelete(e); });
  });
}

function renderCard(e) {
  const keyword = e.keyword || '（没填关键词）';
  const content = e.content || '（还没写内容呢）';
  const priority = Number(e.priority ?? 0);
  const enabled = e.enabled !== false; // 默认启用
  const checkIcon = createIcon('check', 12).outerHTML;
  return `
    <div class="wb-card ${enabled ? '' : 'disabled'}" data-id="${cssEscape(e.id)}">
      <div class="wb-card-row">
        <div class="wb-card-main" role="button" tabindex="0" aria-label="编辑词条">
          <div class="wb-card-keyword-row">
            <span class="wb-card-keyword">${escapeHTML(keyword)}</span>
            <span class="wb-card-priority">优先级 ${priority}</span>
          </div>
          <div class="wb-card-content">${escapeHTML(content)}</div>
        </div>
        <div class="wb-card-actions">
          <button class="wb-toggle ${enabled ? 'on' : ''}" aria-label="${enabled ? '点一下停用' : '点一下启用'}" title="${enabled ? '已启用，点一下停用' : '已停用，点一下启用'}">
            <span class="wb-toggle-thumb">${enabled ? checkIcon : ''}</span>
          </button>
          <button class="wb-icon-btn wb-del" aria-label="删除词条" title="删除">${createIcon('trash', 16).outerHTML}</button>
        </div>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════
// 启用 / 停用切换
// ════════════════════════════════════════

async function toggleEnabled(e) {
  if (!e || !e.id) return;
  const next = e.enabled === false; // 当前是 false 就翻成 true
  try {
    await setDB(STORES.worldbook, e.id, { ...e, enabled: next });
    showToast(next ? '启用啦' : '先停用啦，聊天不会带它了', 'default', 1200);
    // 通知聊天相关模块世界书有变动
    bus.emit('worldbook:change', { id: e.id, enabled: next });
    await render();
  } catch (err) {
    console.warn('[worldbook] 切换启用失败', err);
    showToast('没切换成功，再试一下嘛', 'error');
  }
}

// ════════════════════════════════════════
// 删除（带二次确认）
// ════════════════════════════════════════

function confirmDelete(e) {
  if (!e || !e.id) return;
  showConfirm({
    title: '删掉这条词条吗？',
    body: `「${e.keyword || '这个词条'}」会被我忘掉哦`,
    confirmText: '删掉吧',
    cancelText: '再想想',
    danger: true,
    onConfirm: async () => {
      try {
        await deleteDB(STORES.worldbook, e.id);
        showToast('删掉啦', 'default', 1200);
        bus.emit('worldbook:change', { id: e.id, deleted: true });
        await render();
      } catch (err) {
        console.warn('[worldbook] 删除失败', err);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

// ════════════════════════════════════════
// 新增 / 编辑表单（bottomSheet）
// ════════════════════════════════════════

function openForm(existing) {
  const editing = !!existing;
  const init = existing || {
    id: null,
    keyword: '',
    content: '',
    enabled: true,
    priority: DEFAULT_PRIORITY
  };

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="wb-form-row">
      <label class="wb-form-label" for="wb-f-keyword">关键词</label>
      <input class="input" id="wb-f-keyword" type="text" placeholder="比如：魔法学校、初依的家" value="${escapeAttr(init.keyword || '')}" maxlength="60">
      <div class="wb-form-hint">聊天里出现这个关键词时，我会把内容悄悄塞进 AI 的脑子里</div>
    </div>
    <div class="wb-form-row">
      <label class="wb-form-label" for="wb-f-content">内容</label>
      <textarea class="textarea" id="wb-f-content" placeholder="写下这段世界观设定，越详细越好呀..." maxlength="3000">${escapeHTML(init.content || '')}</textarea>
    </div>
    <div class="wb-form-row">
      <label class="wb-form-label" for="wb-f-priority">优先级（数字越大越优先）</label>
      <div class="wb-priority-row">
        <input class="input wb-priority-input" id="wb-f-priority" type="number" min="0" max="${MAX_PRIORITY}" step="1" value="${Number(init.priority ?? DEFAULT_PRIORITY)}">
        <span class="wb-form-hint">同样关键词撞车时，优先级高的先上阵</span>
      </div>
    </div>
    <div class="wb-enable-row">
      <label for="wb-f-enabled">启用这条词条</label>
      <input type="checkbox" id="wb-f-enabled" ${init.enabled !== false ? 'checked' : ''}>
    </div>
    <div class="wb-actions-row" style="margin-top:14px">
      ${editing ? '<button class="btn ghost" id="wb-f-del">删掉</button>' : ''}
      <button class="btn primary" id="wb-f-ok">${editing ? '改好啦' : '加进来'}</button>
    </div>
  `;

  const sheet = showBottomSheet({
    title: editing ? '改一下词条' : '加一个词条',
    bodyElement: body,
    dismissible: true
  });

  // 保存
  body.querySelector('#wb-f-ok').addEventListener('click', async () => {
    const keyword = body.querySelector('#wb-f-keyword').value.trim();
    const content = body.querySelector('#wb-f-content').value.trim();
    const priorityRaw = parseInt(body.querySelector('#wb-f-priority').value, 10);
    const priority = Number.isFinite(priorityRaw) ? clamp(priorityRaw, 0, MAX_PRIORITY) : DEFAULT_PRIORITY;
    const enabled = body.querySelector('#wb-f-enabled').checked;

    if (!keyword) { showToast('填个关键词嘛', 'error'); return; }
    if (!content) { showToast('写点内容嘛', 'error'); return; }

    try {
      const id = init.id || generateId('wb');
      // 编辑时保留原 createdAt
      const prev = editing ? await getDB(STORES.worldbook, init.id) : null;
      const record = {
        id,
        keyword,
        content,
        enabled,
        priority,
        createdAt: prev?.createdAt || getNow()
      };
      await setDB(STORES.worldbook, id, record);
      sheet.close();
      showToast(editing ? '改好啦，已帮你更新' : '加进来啦，世界观又丰富一点点', 'success', 1400);
      bus.emit('worldbook:change', { id, saved: true });
      await render();
    } catch (err) {
      console.warn('[worldbook] 保存失败', err);
      showToast('没保存成功，再试一下嘛', 'error');
    }
  });

  // 删除（仅编辑时）
  const delBtn = body.querySelector('#wb-f-del');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      // 关掉表单 sheet 再弹确认，避免堆叠混淆
      sheet.close();
      setTimeout(() => confirmDelete(init), 60);
    });
  }

  // 自动聚焦关键词
  setTimeout(() => { try { body.querySelector('#wb-f-keyword')?.focus(); } catch (e) {} }, 60);
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
function clamp(v, min, max) {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}
