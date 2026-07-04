// apps/grudge/index.js
// 记仇本 App——软萌少女风格 PWA「泡泡」。
// 我帮主人把惹她生气的小事都悄悄记下来，等她气消了再一条条哄好。
// 数据：IndexedDB（STORES.grudges）
//   字段 {id, characterId, reason, source, forgiven, level(1-5), note, createdAt, updatedAt}
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js, core/app-bg.js
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符；视觉值走 CSS 变量。

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, getDB, setDB, deleteDB, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { formatRelative, injectStyle, clamp } from '../../core/util.js';
import { openApp } from '../../core/router.js';
import { applyAppBg } from '../../core/app-bg.js';

// ════════════════════════════════════════
// 模块状态
// ════════════════════════════════════════

let containerEl = null;
let filterCharacter = 'all';   // 'all' 或某个 characterId
let filterTime = 'all';        // 'all' | 'today' | 'week' | 'month'

// 来源映射（source 值 -> 中文标签）
const SOURCE_LABELS = { chat: '聊天', moments: '朋友圈', game: '游戏' };
const SOURCE_OPTIONS = [
  { value: 'chat', label: '聊天' },
  { value: 'moments', label: '朋友圈' },
  { value: 'game', label: '游戏' }
];

// 等级描述（1-5 对应从小情绪到气炸了）
const LEVEL_LABELS = ['', '有点小情绪', '不太开心', '生气啦', '好生气', '气炸了'];

// 聊天里自动检测的关键词
const HURT_KEYWORDS = ['分手', '讨厌你', '烦死', '滚', '不想理你', '不喜欢你', '别烦我'];
const APOLOGY_KEYWORDS = ['对不起', '抱歉', '我错了', '别生气', '原谅我', '是我不好'];

// bus 监听只注册一次（模块是单例，但加个标记更稳妥）
let listenerRegistered = false;

// ════════════════════════════════════════
// 样式（全部走 CSS 变量，#E8888C 与 .btn.danger 一致的红粉警示色）
// ════════════════════════════════════════

injectStyle('app-grudge-style', `
  .grudge-filters { margin-bottom: 14px; }
  .grudge-chip-row {
    display: flex; gap: 8px; overflow-x: auto;
    scrollbar-width: none; padding: 2px 0 8px;
  }
  .grudge-chip-row::-webkit-scrollbar { display: none; }
  .grudge-chip-row + .grudge-chip-row { padding-top: 0; }
  .grudge-chip {
    flex-shrink: 0; padding: 6px 14px; border-radius: 999px;
    background: color-mix(in srgb, var(--bg-secondary) 60%, transparent);
    color: var(--text-secondary); font-size: var(--font-size-small);
    border: 1px solid transparent; transition: var(--motion);
    white-space: nowrap;
  }
  .grudge-chip:active { transform: scale(var(--press-scale)); }
  .grudge-chip.active {
    background: color-mix(in srgb, var(--accent) 15%, transparent);
    color: var(--accent-dark); border-color: var(--accent);
    font-weight: 600;
  }
  .grudge-card {
    background: var(--bg-card); border-radius: var(--radius-card);
    padding: 14px 16px; box-shadow: var(--shadow-sm);
    margin-bottom: 12px; transition: var(--motion);
    border: 1px solid color-mix(in srgb, var(--text-hint) 10%, transparent);
  }
  .grudge-card:active { transform: scale(var(--press-scale)); }
  .grudge-card.forgiven { opacity: 0.6; }
  .grudge-card-row { display: flex; align-items: flex-start; gap: 10px; }
  .grudge-card-main { flex: 1; min-width: 0; cursor: pointer; }
  .grudge-hearts { display: inline-flex; gap: 2px; align-items: center; margin-bottom: 6px; }
  .grudge-heart { display: inline-flex; }
  .grudge-heart .popo-icon-svg { width: 14px; height: 14px; }
  .grudge-heart.filled .popo-icon-svg { fill: #E8888C; stroke: #E8888C; }
  .grudge-heart.empty .popo-icon-svg { fill: none; stroke: var(--text-hint); opacity: 0.35; }
  .grudge-reason {
    font-size: var(--font-size-base); color: var(--text-primary);
    line-height: 1.5; word-break: break-word;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .grudge-meta {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    margin-top: 6px; font-size: var(--font-size-small); color: var(--text-hint);
  }
  .grudge-source-badge {
    padding: 2px 8px; border-radius: 999px;
    background: color-mix(in srgb, var(--accent-light) 40%, transparent);
    color: var(--accent-dark);
  }
  .grudge-status { display: inline-flex; align-items: center; gap: 3px; color: var(--accent); }
  .grudge-status .popo-icon-svg { width: 13px; height: 13px; }
  .grudge-card-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
  .grudge-icon-btn {
    width: 30px; height: 30px; border-radius: 50%;
    background: transparent; color: var(--text-hint);
    display: flex; align-items: center; justify-content: center;
    transition: var(--motion);
  }
  .grudge-icon-btn:active { transform: scale(var(--press-scale)); }
  .grudge-icon-btn.forgive { color: var(--accent); }
  .grudge-empty-icon { color: var(--text-hint); opacity: 0.5; margin-bottom: 12px; }
  .grudge-form-row { margin-bottom: 14px; }
  .grudge-form-label {
    font-size: var(--font-size-small); color: var(--text-secondary);
    margin-bottom: 6px; display: block;
  }
  .grudge-level-row { display: flex; align-items: center; gap: 12px; }
  .grudge-level-slider {
    flex: 1; -webkit-appearance: none; appearance: none;
    height: 6px; border-radius: 3px;
    background: color-mix(in srgb, var(--text-hint) 20%, transparent);
    outline: none;
  }
  .grudge-level-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 20px; height: 20px; border-radius: 50%;
    background: var(--accent); cursor: pointer; box-shadow: var(--shadow-sm);
  }
  .grudge-level-slider::-moz-range-thumb {
    width: 20px; height: 20px; border-radius: 50%;
    background: var(--accent); cursor: pointer; border: none;
  }
  .grudge-level-preview { display: inline-flex; gap: 2px; }
  .grudge-level-preview .grudge-heart .popo-icon-svg { width: 16px; height: 16px; }
  .grudge-level-label { font-size: var(--font-size-small); color: var(--accent-dark); min-width: 60px; }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  filterCharacter = 'all';
  filterTime = 'all';
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="grudge-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">记仇小本本</div>
      <button class="app-header-gear" id="grudge-settings" aria-label="记仇本设置">${createIcon('settings', 18).outerHTML}</button>
      <button class="app-add" id="grudge-add" aria-label="新增记仇">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="grudge-body">
      <div class="grudge-filters">
        <div class="grudge-chip-row" id="grudge-char-chips"></div>
        <div class="grudge-chip-row" id="grudge-time-chips"></div>
      </div>
      <div id="grudge-list"></div>
    </div>
  `;
  container.querySelector('#grudge-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#grudge-add').addEventListener('click', () => openEditor(null));
  // 齿轮跳到设置「AI 与陪伴」分组
  container.querySelector('#grudge-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'ai' } }));
  await render();
  applyAppBg(container, 'grudge');
}

export function unmount() {
  containerEl = null;
}

// ════════════════════════════════════════
// 列表渲染
// ════════════════════════════════════════

async function render() {
  const bodyEl = containerEl?.querySelector('#grudge-body');
  if (!bodyEl) return;
  // 渲染筛选条
  await renderCharChips(bodyEl);
  renderTimeChips(bodyEl);
  // 读数据
  const listEl = bodyEl.querySelector('#grudge-list');
  if (!listEl) return;
  let grudges = [];
  try {
    grudges = await getAllDB(STORES.grudges);
  } catch (e) {
    console.warn('[grudge] 读取失败', e);
    showToast('小本本读不出来嘛，等一下再试试', 'error');
  }
  if (!Array.isArray(grudges)) grudges = [];
  // 角色筛选
  const filtered = grudges.filter((g) => {
    if (filterCharacter !== 'all' && g.characterId !== filterCharacter) return false;
    if (filterTime !== 'all') {
      const start = getTimeRangeStart(filterTime);
      const t = new Date(g.createdAt || 0).getTime();
      if (t < start) return false;
    }
    return true;
  });
  // 排序：未原谅的排前面，然后 createdAt 倒序
  filtered.sort((a, b) => {
    const fa = a.forgiven ? 1 : 0;
    const fb = b.forgiven ? 1 : 0;
    if (fa !== fb) return fa - fb;
    const ta = new Date(a.createdAt || 0).getTime();
    const tb = new Date(b.createdAt || 0).getTime();
    return tb - ta;
  });
  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="grudge-empty-icon">${createIcon('heart', 48).outerHTML}</div>
        <div class="empty-state-text">她还没生过气呢，要好好对她嘛</div>
      </div>
    `;
    return;
  }
  listEl.innerHTML = filtered.map(renderCard).join('');
  // 绑定每条事件
  filtered.forEach((g) => {
    const card = listEl.querySelector(`[data-id="${cssEscape(g.id)}"]`);
    if (!card) return;
    const main = card.querySelector('.grudge-card-main');
    if (main) main.addEventListener('click', () => openEditor(g));
    const forgiveBtn = card.querySelector('.grudge-forgive');
    if (forgiveBtn) forgiveBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleForgive(g); });
    const delBtn = card.querySelector('.grudge-del');
    if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(g); });
  });
}

async function renderCharChips(bodyEl) {
  const chipRow = bodyEl.querySelector('#grudge-char-chips');
  if (!chipRow) return;
  let characters = [];
  try {
    characters = await getAllDB(STORES.characters);
  } catch (e) {
    characters = [];
  }
  const currentId = getData(KEYS.chatCurrentCharacter, 'char_chuyi');
  // 全部 + 各角色（按当前角色优先排序）
  characters.sort((a, b) => {
    if (a.id === currentId) return -1;
    if (b.id === currentId) return 1;
    return 0;
  });
  const chips = [{ id: 'all', name: '全部' }, ...characters.map((c) => ({ id: c.id, name: c.nickname || c.name || '她' }))];
  chipRow.innerHTML = chips.map((c) => `
    <button class="grudge-chip ${filterCharacter === c.id ? 'active' : ''}" data-char="${escapeAttr(c.id)}">${escapeHTML(c.name)}</button>
  `).join('');
  chipRow.querySelectorAll('.grudge-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterCharacter = btn.dataset.char;
      render();
    });
  });
}

function renderTimeChips(bodyEl) {
  const chipRow = bodyEl.querySelector('#grudge-time-chips');
  if (!chipRow) return;
  const chips = [
    { id: 'all', label: '全部' },
    { id: 'today', label: '今天' },
    { id: 'week', label: '本周' },
    { id: 'month', label: '本月' }
  ];
  chipRow.innerHTML = chips.map((c) => `
    <button class="grudge-chip ${filterTime === c.id ? 'active' : ''}" data-time="${c.id}">${escapeHTML(c.label)}</button>
  `).join('');
  chipRow.querySelectorAll('.grudge-chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterTime = btn.dataset.time;
      render();
    });
  });
}

function renderCard(g) {
  const level = clamp(Number(g.level) || 1, 1, 5);
  const hearts = renderHearts(level, 14);
  const sourceLabel = SOURCE_LABELS[g.source] || '其他';
  const time = formatRelative(g.createdAt);
  const forgiven = !!g.forgiven;
  const forgiveIcon = createIcon(forgiven ? 'heart' : 'smile', 16).outerHTML;
  const editIcon = createIcon('edit', 16).outerHTML;
  const trashIcon = createIcon('trash', 16).outerHTML;
  const checkIcon = createIcon('check', 13).outerHTML;
  return `
    <div class="grudge-card ${forgiven ? 'forgiven' : ''}" data-id="${escapeAttr(g.id)}">
      <div class="grudge-card-row">
        <div class="grudge-card-main" role="button" tabindex="0" aria-label="编辑这条记仇">
          <div class="grudge-hearts">${hearts}</div>
          <div class="grudge-reason">${escapeHTML(g.reason || '没写为什么就生气了')}</div>
          <div class="grudge-meta">
            <span class="grudge-source-badge">${escapeHTML(sourceLabel)}</span>
            <span>${escapeHTML(time)}</span>
            ${forgiven ? `<span class="grudge-status">${checkIcon}已哄好</span>` : ''}
          </div>
        </div>
        <div class="grudge-card-actions">
          <button class="grudge-icon-btn forgive" aria-label="${forgiven ? '取消原谅' : '标记原谅'}" title="${forgiven ? '取消原谅' : '标记原谅'}">${forgiveIcon}</button>
          <button class="grudge-icon-btn grudge-edit" aria-label="编辑" title="编辑">${editIcon}</button>
          <button class="grudge-icon-btn grudge-del" aria-label="删除" title="删除">${trashIcon}</button>
        </div>
      </div>
    </div>
  `;
}

function renderHearts(level, size) {
  const max = 5;
  let html = '';
  for (let i = 1; i <= max; i++) {
    const filled = i <= level;
    html += `<span class="grudge-heart ${filled ? 'filled' : 'empty'}">${createIcon('heart', size).outerHTML}</span>`;
  }
  return html;
}

// ════════════════════════════════════════
// 原谅 / 删除
// ════════════════════════════════════════

async function toggleForgive(g) {
  try {
    const newForgiven = !g.forgiven;
    await setDB(STORES.grudges, g.id, { ...g, forgiven: newForgiven, updatedAt: getNow() });
    if (newForgiven) {
      showToast('哄好啦', 'success', 1200);
      bus.emit('grudge:forgiven', { characterId: g.characterId, note: g.note || g.reason || '' });
    } else {
      showToast('又生气啦', 'default', 1200);
    }
    await render();
  } catch (e) {
    console.warn('[grudge] 切换原谅失败', e);
    showToast('没切换成功，再试一下嘛', 'error');
  }
}

function confirmDelete(g) {
  showConfirm({
    title: '删掉这条记仇吗？',
    body: '删掉就找不回来啦，确定的话就点确认嘛',
    confirmText: '删掉吧',
    cancelText: '留着',
    danger: true,
    onConfirm: async () => {
      try {
        await deleteDB(STORES.grudges, g.id);
        showToast('删掉啦', 'default', 1200);
        await render();
      } catch (e) {
        console.warn('[grudge] 删除失败', e);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

// ════════════════════════════════════════
// 新增 / 编辑表单（bottomSheet）
// ════════════════════════════════════════

async function openEditor(grudge) {
  const editing = !!grudge;
  const init = grudge || { id: null, characterId: null, reason: '', source: 'chat', level: 3, note: '' };
  // 读角色列表
  let characters = [];
  try {
    characters = await getAllDB(STORES.characters);
  } catch (e) {
    characters = [];
  }
  const currentId = getData(KEYS.chatCurrentCharacter, 'char_chuyi');
  const selectedCharId = init.characterId || currentId;
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="grudge-form-row">
      <label class="grudge-form-label" for="grudge-char">选角色</label>
      <select class="select" id="grudge-char">
        ${characters.map((c) => `<option value="${escapeAttr(c.id)}" ${c.id === selectedCharId ? 'selected' : ''}>${escapeHTML(c.nickname || c.name || '她')}</option>`).join('')}
      </select>
    </div>
    <div class="grudge-form-row">
      <label class="grudge-form-label" for="grudge-reason-input">为什么生气</label>
      <textarea class="textarea" id="grudge-reason-input" placeholder="她因为什么不开心了呢..." maxlength="500">${escapeHTML(init.reason)}</textarea>
    </div>
    <div class="grudge-form-row">
      <label class="grudge-form-label" for="grudge-source-select">来源</label>
      <select class="select" id="grudge-source-select">
        ${SOURCE_OPTIONS.map((s) => `<option value="${s.value}" ${s.value === init.source ? 'selected' : ''}>${escapeHTML(s.label)}</option>`).join('')}
      </select>
    </div>
    <div class="grudge-form-row">
      <label class="grudge-form-label">情绪等级</label>
      <div class="grudge-level-row">
        <input type="range" class="grudge-level-slider" id="grudge-level-input" min="1" max="5" step="1" value="${Number(init.level) || 3}">
        <span class="grudge-level-preview" id="grudge-level-preview"></span>
        <span class="grudge-level-label" id="grudge-level-label"></span>
      </div>
    </div>
    <div class="grudge-form-row">
      <label class="grudge-form-label" for="grudge-note">备注（可选）</label>
      <textarea class="textarea" id="grudge-note" placeholder="补充点细节，哄她的时候好参考..." maxlength="500">${escapeHTML(init.note || '')}</textarea>
    </div>
    <button class="btn primary block" id="grudge-save">${editing ? '改好啦' : '记下来'}</button>
  `;
  const sheet = showBottomSheet({
    title: editing ? '编辑记仇' : '记一笔新的仇',
    bodyElement: body,
    dismissible: true
  });
  // 等级滑块实时预览
  const levelInput = body.querySelector('#grudge-level-input');
  const previewEl = body.querySelector('#grudge-level-preview');
  const labelEl = body.querySelector('#grudge-level-label');
  const updateLevelPreview = () => {
    const lv = clamp(Number(levelInput.value) || 3, 1, 5);
    previewEl.innerHTML = renderHearts(lv, 16);
    labelEl.textContent = LEVEL_LABELS[lv] || '';
  };
  levelInput.addEventListener('input', updateLevelPreview);
  updateLevelPreview();
  // 保存
  body.querySelector('#grudge-save').addEventListener('click', async () => {
    const characterId = body.querySelector('#grudge-char').value;
    const reason = body.querySelector('#grudge-reason-input').value.trim();
    const source = body.querySelector('#grudge-source-select').value;
    const level = clamp(Number(levelInput.value) || 3, 1, 5);
    const note = body.querySelector('#grudge-note').value.trim();
    if (!reason) {
      showToast('总得写一下为什么生气嘛', 'error');
      return;
    }
    try {
      const id = init.id || generateId('grudge');
      const existing = editing ? await getDB(STORES.grudges, init.id) : null;
      const record = {
        id,
        characterId,
        reason,
        source,
        forgiven: existing?.forgiven || false,
        level,
        note,
        createdAt: existing?.createdAt || getNow()
      };
      await setDB(STORES.grudges, id, record);
      sheet.close();
      showToast(editing ? '改好啦' : '记下来啦，等她气消', 'success', 1400);
      await render();
    } catch (e) {
      console.warn('[grudge] 保存失败', e);
      showToast('没保存成功，再试一下嘛', 'error');
    }
  });
  setTimeout(() => { try { body.querySelector('#grudge-reason-input')?.focus(); } catch (e) {} }, 60);
}

// ════════════════════════════════════════
// AI 调用入口（供 chat App 检测到伤人话时调用）
// ════════════════════════════════════════

export async function addGrudgeFromAI({ characterId, reason, source, level }) {
  if (!characterId || !reason) return null;
  try {
    const id = generateId('grudge');
    const record = {
      id,
      characterId,
      reason: String(reason).slice(0, 500),
      source: source || 'chat',
      forgiven: false,
      level: clamp(Number(level) || 3, 1, 5),
      note: '',
      createdAt: getNow()
    };
    await setDB(STORES.grudges, id, record);
    // 通知消息中心
    bus.emit('grudge:written', { characterId, reason: record.reason });
    return record;
  } catch (e) {
    console.warn('[grudge] AI 写入失败', e);
    return null;
  }
}

// 原谅该角色最近一条未原谅的记仇（供道歉关键词触发）
// 我把它 export 出来，让 AI 模块（js/ai/ai-emotion.js）检测到道歉时也能调用
export async function forgiveLatestForCharacter(characterId) {
  if (!characterId) return false;
  try {
    const all = await getAllDB(STORES.grudges);
    const unforgiven = all
      .filter((g) => g.characterId === characterId && !g.forgiven)
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    if (unforgiven.length === 0) return false;
    const target = unforgiven[0];
    await setDB(STORES.grudges, target.id, { ...target, forgiven: true, updatedAt: getNow() });
    bus.emit('grudge:forgiven', { characterId, note: target.note || target.reason || '' });
    return true;
  } catch (e) {
    console.warn('[grudge] 自动原谅失败', e);
    return false;
  }
}

// ════════════════════════════════════════
// 聊天关键词检测（bus.on，模块加载时注册一次）
// 只检测一次，避免同一条消息重复写入。
// ════════════════════════════════════════

function registerChatListener() {
  if (listenerRegistered) return;
  listenerRegistered = true;
  bus.on('chat:user-message', async (payload) => {
    try {
      const content = String(payload?.content || payload?.text || payload?.message || '');
      const characterId = payload?.characterId || getData(KEYS.chatCurrentCharacter, 'char_chuyi');
      if (!content) return;
      // 先检测道歉（优先哄好），再检测伤人
      const isApology = APOLOGY_KEYWORDS.some((kw) => content.includes(kw));
      const isHurt = HURT_KEYWORDS.some((kw) => content.includes(kw));
      if (isApology) {
        const ok = await forgiveLatestForCharacter(characterId);
        if (ok) showToast('她原谅你啦', 'success', 1400);
      }
      if (isHurt && !isApology) {
        // 只写一条，避免重复
        await addGrudgeFromAI({
          characterId,
          reason: content.slice(0, 200),
          source: 'chat',
          level: 4
        });
      }
    } catch (e) {
      console.warn('[grudge] 聊天关键词检测失败', e);
    }
  });
}

// 模块加载时注册监听（只跑一次）
registerChatListener();

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

// 时间筛选起点（返回时间戳）
function getTimeRangeStart(range) {
  const now = new Date();
  if (range === 'today') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  }
  if (range === 'week') {
    // 本周：往前推 7 天
    return now.getTime() - 7 * 86400_000;
  }
  if (range === 'month') {
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }
  return 0;
}
