// apps/memory-viewer/index.js
// 记忆系统 App——软萌少女风格 PWA「泡泡」。
// 我帮主人看见她都记住了哪些事，还能手动加一些新的回忆。
// 数据：IndexedDB（STORES.memories），由 core/memory.js 管理，这里只读 + 编辑。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js, core/app-bg.js, core/memory.js
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符；视觉值走 CSS 变量。

import { KEYS } from '../../core/storage-keys.js';
import { getData, getAllDB } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { formatRelative, injectStyle, clamp, debounce, downloadBlob } from '../../core/util.js';
import { openApp } from '../../core/router.js';
import { applyAppBg } from '../../core/app-bg.js';
import { getMemories, updateMemory, deleteMemory, clearMemories, recordInteraction } from '../../core/memory.js';

// ════════════════════════════════════════
// 模块状态
// ════════════════════════════════════════

let containerEl = null;
let currentCharacterId = null;
let currentCharacterName = '';
let filterType = 'all';       // 'all' | fact | preference | event | relationship | summary ...
let searchKeyword = '';

// 类型映射（source 值 -> 中文软萌标签）。
// 数据字段值不改，只改 UI 显示标签，保持数据兼容。
const LABEL_MAP = {
  fact: '知道的事',
  preference: '喜欢讨厌',
  event: '发生过的事',
  relationship: '我们的关系',
  summary: '聊天总结',
  manual: '自己加的',
  chat: '聊天记的',
  gift: '收到礼物',
  transfer: '钱包往来',
  mood: '心情记录',
  game: '玩游戏',
  music: '听歌',
  auto_extract: '自己记住的'
};
// 兼容旧引用（renderCard 里用到的 typeLabel 兜底）
const TYPE_LABELS = LABEL_MAP;
// 手动新增记忆时可选的类型（少了 chat / transfer 这种由其他 App 自动写的）
const TYPE_OPTIONS = [
  { value: 'fact', label: '知道的事' },
  { value: 'preference', label: '喜欢讨厌' },
  { value: 'event', label: '发生过的事' },
  { value: 'relationship', label: '我们的关系' },
  { value: 'summary', label: '聊天总结' }
];
const FILTER_CHIPS = [
  { value: 'all', label: '全部' },
  { value: 'fact', label: '知道的事' },
  { value: 'preference', label: '喜欢讨厌' },
  { value: 'event', label: '发生过的事' },
  { value: 'relationship', label: '我们的关系' },
  { value: 'summary', label: '聊天总结' },
  { value: 'chat', label: '聊天记的' },
  { value: 'gift', label: '收到礼物' },
  { value: 'transfer', label: '钱包往来' },
  { value: 'mood', label: '心情记录' },
  { value: 'game', label: '玩游戏' },
  { value: 'music', label: '听歌' },
  { value: 'auto_extract', label: '自己记住的' }
];

// ════════════════════════════════════════
// 样式（全部走 CSS 变量）
// ════════════════════════════════════════

injectStyle('app-memory-viewer-style', `
  .mem-char-bar {
    display: flex; align-items: center; gap: 8px;
    margin-bottom: 12px; flex-wrap: wrap;
  }
  .mem-char-pick {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 14px; border-radius: 999px;
    background: color-mix(in srgb, var(--accent) 12%, var(--bg-card));
    color: var(--accent-dark); font-weight: 600;
    font-size: var(--font-size-base); transition: var(--motion);
    border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  }
  .mem-char-pick:active { transform: scale(var(--press-scale)); }
  .mem-char-pick .popo-icon-svg { width: 16px; height: 16px; }
  .mem-tool-btns { display: flex; gap: 4px; margin-left: auto; }
  .mem-tool-btn {
    width: 32px; height: 32px; border-radius: 50%;
    background: color-mix(in srgb, var(--bg-secondary) 60%, transparent);
    color: var(--text-secondary);
    display: flex; align-items: center; justify-content: center;
    transition: var(--motion);
  }
  .mem-tool-btn:active { transform: scale(var(--press-scale)); }
  .mem-tool-btn.danger { color: var(--danger); }
  .mem-chip-row {
    display: flex; gap: 8px; overflow-x: auto;
    scrollbar-width: none; padding: 2px 0 10px;
  }
  .mem-chip-row::-webkit-scrollbar { display: none; }
  .mem-chip {
    flex-shrink: 0; padding: 6px 14px; border-radius: 999px;
    background: color-mix(in srgb, var(--bg-secondary) 60%, transparent);
    color: var(--text-secondary); font-size: var(--font-size-small);
    border: 1px solid transparent; transition: var(--motion);
    white-space: nowrap;
  }
  .mem-chip:active { transform: scale(var(--press-scale)); }
  .mem-chip.active {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent-dark); border-color: var(--accent); font-weight: 600;
  }
  .mem-search-wrap { position: relative; margin-bottom: 14px; }
  .mem-search-wrap .popo-icon {
    position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
    color: var(--text-hint); pointer-events: none;
  }
  .mem-search {
    width: 100%; padding: 11px 16px 11px 42px;
    background: color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    border: 1px solid color-mix(in srgb, var(--text-hint) 18%, transparent);
    border-radius: var(--radius-md);
    font-size: var(--font-size-base); color: var(--text-primary);
    transition: var(--motion);
  }
  .mem-search:focus { border-color: var(--accent); background: var(--bg-card); outline: none; }
  .mem-card {
    background: var(--bg-card); border-radius: var(--radius-card);
    padding: 14px 16px; box-shadow: var(--shadow-sm);
    margin-bottom: 12px; transition: var(--motion);
    border: 1px solid color-mix(in srgb, var(--text-hint) 10%, transparent);
  }
  .mem-card:active { transform: scale(var(--press-scale)); }
  .mem-card-row { display: flex; align-items: flex-start; gap: 10px; }
  .mem-card-main { flex: 1; min-width: 0; cursor: pointer; }
  .mem-card-content {
    font-size: var(--font-size-base); color: var(--text-primary);
    line-height: 1.55; word-break: break-word; white-space: pre-wrap;
    display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .mem-card-meta {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin-top: 8px; font-size: var(--font-size-small); color: var(--text-hint);
  }
  .mem-type-badge {
    padding: 2px 8px; border-radius: 999px;
    background: color-mix(in srgb, var(--accent-light) 40%, transparent);
    color: var(--accent-dark);
  }
  .mem-stars { display: inline-flex; gap: 1px; align-items: center; }
  .mem-star { display: inline-flex; }
  .mem-star .popo-icon-svg { width: 13px; height: 13px; }
  .mem-star.filled .popo-icon-svg { fill: var(--accent); stroke: var(--accent); }
  .mem-star.empty .popo-icon-svg { fill: none; stroke: var(--text-hint); opacity: 0.35; }
  .mem-card-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
  .mem-icon-btn {
    width: 30px; height: 30px; border-radius: 50%;
    background: transparent; color: var(--text-hint);
    display: flex; align-items: center; justify-content: center;
    transition: var(--motion);
  }
  .mem-icon-btn:active { transform: scale(var(--press-scale)); }
  .mem-empty-icon { color: var(--text-hint); opacity: 0.5; margin-bottom: 12px; }
  .mem-form-row { margin-bottom: 14px; }
  .mem-form-label {
    font-size: var(--font-size-small); color: var(--text-secondary);
    margin-bottom: 6px; display: block;
  }
  .mem-importance-row { display: flex; align-items: center; gap: 12px; }
  .mem-importance-slider {
    flex: 1; -webkit-appearance: none; appearance: none;
    height: 6px; border-radius: 3px;
    background: color-mix(in srgb, var(--text-hint) 20%, transparent);
    outline: none;
  }
  .mem-importance-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 20px; height: 20px; border-radius: 50%;
    background: var(--accent); cursor: pointer; box-shadow: var(--shadow-sm);
  }
  .mem-importance-slider::-moz-range-thumb {
    width: 20px; height: 20px; border-radius: 50%;
    background: var(--accent); cursor: pointer; border: none;
  }
  .mem-importance-value {
    font-size: var(--font-size-base); font-weight: 600;
    color: var(--accent-dark); min-width: 28px; text-align: center;
  }
  .mem-pick-list { display: flex; flex-direction: column; gap: 8px; }
  .mem-pick-item {
    display: flex; align-items: center; gap: 10px;
    padding: 12px 14px; border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--bg-secondary) 50%, transparent);
    color: var(--text-primary); transition: var(--motion);
    border: 1px solid transparent;
  }
  .mem-pick-item:active { transform: scale(var(--press-scale)); }
  .mem-pick-item.active {
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border-color: var(--accent);
  }
  .mem-pick-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    background: color-mix(in srgb, var(--accent-light) 50%, transparent);
    color: var(--accent-dark);
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .mem-pick-name { flex: 1; min-width: 0; font-weight: 500; }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  // 默认当前聊天角色
  currentCharacterId = getData(KEYS.chatCurrentCharacter, 'char_chuyi');
  filterType = 'all';
  searchKeyword = '';
  // 读角色名
  await loadCharacterName();
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="mem-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">她记得的事</div>
      <button class="app-header-gear" id="mem-settings" aria-label="记忆设置">${createIcon('settings', 18).outerHTML}</button>
      <button class="app-add" id="mem-add" aria-label="新增记忆">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="mem-body">
      <div class="mem-char-bar">
        <button class="mem-char-pick" id="mem-char-pick">
          <span id="mem-char-name">${escapeHTML(currentCharacterName || '她')}</span>
          ${createIcon('edit', 16).outerHTML}
        </button>
        <div class="mem-tool-btns">
          <button class="mem-tool-btn" id="mem-export" aria-label="导出" title="导出">${createIcon('download', 18).outerHTML}</button>
          <button class="mem-tool-btn" id="mem-import" aria-label="导入" title="导入">${createIcon('upload', 18).outerHTML}</button>
          <button class="mem-tool-btn danger" id="mem-clear" aria-label="清空" title="清空">${createIcon('trash', 18).outerHTML}</button>
        </div>
      </div>
      <div class="mem-chip-row" id="mem-type-chips"></div>
      <div class="mem-search-wrap">
        ${createIcon('search', 18).outerHTML}
        <input class="mem-search" id="mem-search" type="search" placeholder="搜搜她记得的事..." aria-label="搜索记忆">
      </div>
      <div id="mem-list"></div>
    </div>
  `;
  container.querySelector('#mem-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#mem-add').addEventListener('click', () => openEditor(null));
  // 齿轮跳到设置「AI 与陪伴」分组
  container.querySelector('#mem-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'ai' } }));
  container.querySelector('#mem-char-pick').addEventListener('click', () => openCharacterPicker());
  container.querySelector('#mem-export').addEventListener('click', () => exportMemories());
  container.querySelector('#mem-import').addEventListener('click', () => importMemories());
  container.querySelector('#mem-clear').addEventListener('click', () => confirmClearAll());
  // 搜索防抖
  const onSearch = debounce((e) => {
    searchKeyword = (e.target.value || '').trim().toLowerCase();
    render();
  }, 200);
  container.querySelector('#mem-search').addEventListener('input', onSearch);
  await render();
  applyAppBg(container, 'memory-viewer');
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 角色加载
// ════════════════════════════════════════

async function loadCharacterName() {
  try {
    const { getDB } = await import('../../core/storage.js');
    const char = await getDB('characters', currentCharacterId);
    currentCharacterName = char?.nickname || char?.name || '她';
  } catch (e) {
    currentCharacterName = '她';
  }
  // 同步 header 显示
  const nameEl = containerEl?.querySelector('#mem-char-name');
  if (nameEl) nameEl.textContent = currentCharacterName;
}

// ════════════════════════════════════════
// 列表渲染
// ════════════════════════════════════════

async function render() {
  const bodyEl = containerEl?.querySelector('#mem-body');
  if (!bodyEl) return;
  // 类型筛选条
  renderTypeChips(bodyEl);
  const listEl = bodyEl.querySelector('#mem-list');
  if (!listEl) return;
  // 读记忆
  const filter = {};
  if (filterType !== 'all') filter.source = filterType;
  let memories = [];
  try {
    memories = await getMemories(currentCharacterId, filter);
  } catch (e) {
    console.warn('[memory-viewer] 读取失败', e);
    showToast('记忆读不出来嘛，等一下再试试', 'error');
  }
  // 关键词过滤（getMemories 不支持关键词，这里手动过滤）
  const kw = searchKeyword;
  const filtered = kw
    ? memories.filter((m) => (m.content || '').toLowerCase().includes(kw))
    : memories;
  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="mem-empty-icon">${createIcon('star', 48).outerHTML}</div>
        <div class="empty-state-text">${kw || filterType !== 'all' ? '没找到相关的记忆呀，换一下筛选试试嘛' : '还没有记忆，和她聊聊天或者手动加一些嘛'}</div>
      </div>
    `;
    return;
  }
  listEl.innerHTML = filtered.map(renderCard).join('');
  // 绑定事件
  filtered.forEach((m) => {
    const card = listEl.querySelector(`[data-id="${cssEscape(m.id)}"]`);
    if (!card) return;
    const main = card.querySelector('.mem-card-main');
    if (main) main.addEventListener('click', () => openEditor(m));
    const delBtn = card.querySelector('.mem-del');
    if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(m); });
  });
}

function renderTypeChips(bodyEl) {
  const chipRow = bodyEl.querySelector('#mem-type-chips');
  if (!chipRow) return;
  chipRow.innerHTML = FILTER_CHIPS.map((c) => `
    <button class="mem-chip ${filterType === c.value ? 'active' : ''}" data-type="${c.value}">${escapeHTML(c.label)}</button>
  `).join('');
  chipRow.querySelectorAll('.mem-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterType = btn.dataset.type;
      render();
    });
  });
}

function renderCard(m) {
  const content = m.content || '';
  const typeLabel = TYPE_LABELS[m.source] || m.source || '其他';
  const stars = renderStars(m.importance);
  const time = formatRelative(m.timestamp || m.createdAt);
  const sourceApp = m.relatedApp ? `<span>${escapeHTML(m.relatedApp)}</span>` : '';
  const trashIcon = createIcon('trash', 16).outerHTML;
  return `
    <div class="mem-card" data-id="${escapeAttr(m.id)}">
      <div class="mem-card-row">
        <div class="mem-card-main" role="button" tabindex="0" aria-label="编辑记忆">
          <div class="mem-card-content">${escapeHTML(content)}</div>
          <div class="mem-card-meta">
            <span class="mem-type-badge">${escapeHTML(typeLabel)}</span>
            <span class="mem-stars">${stars}</span>
            <span>${escapeHTML(time)}</span>
            ${sourceApp}
          </div>
        </div>
        <div class="mem-card-actions">
          <button class="mem-icon-btn mem-del" aria-label="删除" title="删除">${trashIcon}</button>
        </div>
      </div>
    </div>
  `;
}

function renderStars(importance) {
  const n = clamp(Math.round((Number(importance) || 5) / 2), 1, 5);
  let html = '';
  for (let i = 1; i <= 5; i++) {
    const filled = i <= n;
    html += `<span class="mem-star ${filled ? 'filled' : 'empty'}">${createIcon('star', 13).outerHTML}</span>`;
  }
  return html;
}

// ════════════════════════════════════════
// 角色选择
// ════════════════════════════════════════

async function openCharacterPicker() {
  let characters = [];
  try {
    characters = await getAllDB('characters');
  } catch (e) {
    characters = [];
  }
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="mem-pick-list">
      ${characters.map((c) => `
        <button class="mem-pick-item ${c.id === currentCharacterId ? 'active' : ''}" data-id="${escapeAttr(c.id)}">
          <span class="mem-pick-avatar">${createIcon('smile', 20).outerHTML}</span>
          <span class="mem-pick-name">${escapeHTML(c.nickname || c.name || '她')}</span>
          ${c.id === currentCharacterId ? createIcon('check', 18).outerHTML : ''}
        </button>
      `).join('')}
    </div>
  `;
  const sheet = showBottomSheet({
    title: '选一个她',
    bodyElement: body,
    dismissible: true
  });
  body.querySelectorAll('.mem-pick-item').forEach((btn) => {
    btn.addEventListener('click', async () => {
      currentCharacterId = btn.dataset.id;
      await loadCharacterName();
      sheet.close();
      filterType = 'all';
      searchKeyword = '';
      const searchEl = containerEl?.querySelector('#mem-search');
      if (searchEl) searchEl.value = '';
      await render();
    });
  });
}

// ════════════════════════════════════════
// 新增 / 编辑表单
// ════════════════════════════════════════

function openEditor(memory) {
  const editing = !!memory;
  const init = memory || { id: null, source: 'fact', content: '', importance: 5 };
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="mem-form-row">
      <label class="mem-form-label" for="mem-type-select">类型</label>
      <select class="select" id="mem-type-select">
        ${TYPE_OPTIONS.map((t) => `<option value="${t.value}" ${t.value === init.source ? 'selected' : ''}>${escapeHTML(t.label)}</option>`).join('')}
      </select>
    </div>
    <div class="mem-form-row">
      <label class="mem-form-label" for="mem-content-input">内容</label>
      <textarea class="textarea" id="mem-content-input" placeholder="想让她记住什么事..." maxlength="2000">${escapeHTML(init.content)}</textarea>
    </div>
    <div class="mem-form-row">
      <label class="mem-form-label">重要度（1-10）</label>
      <div class="mem-importance-row">
        <input type="range" class="mem-importance-slider" id="mem-importance-input" min="1" max="10" step="1" value="${Number(init.importance) || 5}">
        <span class="mem-importance-value" id="mem-importance-value">${Number(init.importance) || 5}</span>
      </div>
    </div>
    <button class="btn primary block" id="mem-save">${editing ? '改好啦' : '记下来'}</button>
  `;
  const sheet = showBottomSheet({
    title: editing ? '编辑记忆' : '加一条新记忆',
    bodyElement: body,
    dismissible: true
  });
  // 重要度实时显示
  const impInput = body.querySelector('#mem-importance-input');
  const impValue = body.querySelector('#mem-importance-value');
  impInput.addEventListener('input', () => {
    impValue.textContent = impInput.value;
  });
  // 保存
  body.querySelector('#mem-save').addEventListener('click', async () => {
    const source = body.querySelector('#mem-type-select').value;
    const content = body.querySelector('#mem-content-input').value.trim();
    const importance = clamp(Number(impInput.value) || 5, 1, 10);
    if (!content) {
      showToast('总得写点什么嘛', 'error');
      return;
    }
    try {
      if (editing) {
        await updateMemory(init.id, { source, content, importance });
      } else {
        // 新增用 recordInteraction，source 取所选类型让筛选生效
        await recordInteraction({
          characterId: currentCharacterId,
          source,
          content,
          importance,
          relatedApp: 'memory-viewer'
        });
      }
      sheet.close();
      showToast(editing ? '改好啦' : '记下来啦', 'success', 1400);
      await render();
    } catch (e) {
      console.warn('[memory-viewer] 保存失败', e);
      showToast('没保存成功，再试一下嘛', 'error');
    }
  });
  setTimeout(() => { try { body.querySelector('#mem-content-input')?.focus(); } catch (e) {} }, 60);
}

// ════════════════════════════════════════
// 删除 / 清空
// ════════════════════════════════════════

function confirmDelete(m) {
  showConfirm({
    title: '删掉这条记忆吗？',
    body: '删掉她就忘掉这件事啦，确定吗',
    confirmText: '删掉吧',
    cancelText: '留着',
    danger: true,
    onConfirm: async () => {
      try {
        await deleteMemory(m.id);
        showToast('删掉啦', 'default', 1200);
        await render();
      } catch (e) {
        console.warn('[memory-viewer] 删除失败', e);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

function confirmClearAll() {
  showConfirm({
    title: `清空${currentCharacterName}的全部记忆吗？`,
    body: '清掉她就什么都不记得啦，真的要这样做吗',
    confirmText: '全部清掉',
    cancelText: '再想想',
    danger: true,
    onConfirm: async () => {
      try {
        await clearMemories(currentCharacterId);
        showToast('都清掉啦', 'default', 1200);
        await render();
      } catch (e) {
        console.warn('[memory-viewer] 清空失败', e);
        showToast('没清掉，再试一下嘛', 'error');
      }
    }
  });
}

// ════════════════════════════════════════
// 导出 / 导入
// ════════════════════════════════════════

async function exportMemories() {
  try {
    const list = await getMemories(currentCharacterId, {});
    if (list.length === 0) {
      showToast('还没有记忆可以导出', 'default');
      return;
    }
    const json = JSON.stringify({
      characterId: currentCharacterId,
      characterName: currentCharacterName,
      memories: list,
      exportedAt: new Date().toISOString()
    }, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(blob, `memories_${currentCharacterId}_${date}.json`);
    showToast(`导出了 ${list.length} 条记忆`, 'success', 1400);
  } catch (e) {
    console.warn('[memory-viewer] 导出失败', e);
    showToast('导出失败了，再试一下嘛', 'error');
  }
}

function importMemories() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.opacity = '0';
  document.body.appendChild(input);
  let done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    input.remove();
  };
  input.addEventListener('change', async () => {
    const file = input.files && input.files[0];
    cleanup();
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const entries = Array.isArray(data) ? data : (data.memories || data.entries || []);
      if (!Array.isArray(entries) || entries.length === 0) {
        showToast('文件里没找到记忆呀', 'error');
        return;
      }
      let count = 0;
      for (const entry of entries) {
        if (!entry?.content) continue;
        await recordInteraction({
          characterId: currentCharacterId,
          source: entry.source || 'manual',
          content: String(entry.content),
          importance: entry.importance || 5,
          relatedApp: entry.relatedApp || 'memory-viewer',
          mood: entry.mood || null
        });
        count++;
      }
      showToast(`导入了 ${count} 条记忆`, 'success', 1400);
      await render();
    } catch (e) {
      console.warn('[memory-viewer] 导入失败', e);
      showToast('文件读不出来，确认是 JSON 格式嘛', 'error');
    }
  });
  input.addEventListener('blur', () => {
    setTimeout(() => { if (!done) cleanup(); }, 400);
  });
  input.click();
}

// ════════════════════════════════════════
// 工具函数
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
