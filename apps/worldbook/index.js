// apps/worldbook/index.js
// 世界书 App——软萌少女风格 PWA「泡泡」。
// 我帮主人把每一段世界观都收得整整齐齐，AI 聊天时会按触发词偷偷塞进去。
// 存 IndexedDB（STORES.worldbook），字段：
//   {id, keyword, content, enabled, priority,
//    triggers[], characterIds[], category, note, triggerCount,
//    createdAt, updatedAt}
// 暴露 matchWorldbook(text, characterId) 给聊天 App 调用（见 ./match.js）。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js, core/app-bg.js,
//       ./shared.js, ./form.js, ./match.js, ./io.js

import { STORES } from '../../core/storage-keys.js';
import { deleteDB, setDB, getAllDB } from '../../core/storage.js';
import { showToast, showConfirm, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { applyAppBg } from '../../core/app-bg.js';
import { debounce } from '../../core/util.js';
import {
  CATEGORY_ALL,
  escapeHTML, escapeAttr, cssEscape,
  renderCharAvatarHTML
} from './shared.js';
import { openForm } from './form.js';
import { openTestTrigger } from './match.js';
// matchWorldbook 也从这里再导出一次，方便 chat 懒加载 import { matchWorldbook } from 'apps/worldbook/index.js'
export { matchWorldbook, incrementTriggerCount } from './match.js';
import { exportWorldbook, importWorldbook } from './io.js';

let containerEl = null;
let searchKeyword = '';
let activeCategory = CATEGORY_ALL;
// 角色缓存：{id -> character}，给卡片关联角色标签用
let charCache = new Map();

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  searchKeyword = '';
  activeCategory = CATEGORY_ALL;
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="wb-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">世界书</div>
      <button class="app-test" id="wb-test" aria-label="测试触发" title="测试触发">${createIcon('search', 20).outerHTML}</button>
      <button class="app-import" id="wb-import" aria-label="导入" title="导入">${createIcon('upload', 20).outerHTML}</button>
      <button class="app-export" id="wb-export" aria-label="导出" title="导出">${createIcon('download', 20).outerHTML}</button>
      <button class="app-add" id="wb-add" aria-label="新增词条" title="新增">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="wb-body">
      <div class="wb-search-wrap">
        ${createIcon('search', 18).outerHTML}
        <input class="wb-search" id="wb-search" type="search" placeholder="找找世界观小片段..." aria-label="搜索词条">
      </div>
      <div class="wb-category-bar" id="wb-category-bar"></div>
      <div id="wb-list"></div>
    </div>
  `;
  container.querySelector('#wb-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#wb-add').addEventListener('click', () => openForm(null, onSaved, onDelete));
  container.querySelector('#wb-test').addEventListener('click', () => openTestTrigger());
  container.querySelector('#wb-export').addEventListener('click', () => exportWorldbook().then(() => render()));
  container.querySelector('#wb-import').addEventListener('click', () => triggerImport());
  // 搜索防抖
  const onSearch = debounce((e) => {
    searchKeyword = (e.target.value || '').trim().toLowerCase();
    renderList();
  }, 180);
  container.querySelector('#wb-search').addEventListener('input', onSearch);
  applyAppBg(container, 'worldbook');
  await render();
}

export function unmount() {
  containerEl = null;
  charCache = new Map();
}

// ════════════════════════════════════════
// 总渲染：刷新角色缓存 + 分类条 + 列表
// ════════════════════════════════════════

async function render() {
  await refreshCharCache();
  await renderCategoryBar();
  await renderList();
}

// 刷新角色缓存，给卡片关联角色标签用
async function refreshCharCache() {
  charCache = new Map();
  try {
    const chars = await getAllDB(STORES.characters);
    if (Array.isArray(chars)) {
      chars.forEach((c) => { if (c && c.id) charCache.set(c.id, c); });
    }
  } catch (e) {
    console.warn('[worldbook] 读取角色缓存失败', e);
  }
}

// ════════════════════════════════════════
// 分类标签条
// ════════════════════════════════════════

async function renderCategoryBar() {
  const barEl = containerEl?.querySelector('#wb-category-bar');
  if (!barEl) return;
  let entries = [];
  try {
    entries = await getAllDB(STORES.worldbook);
  } catch (e) {
    barEl.innerHTML = '';
    return;
  }
  // 收集所有非空分类
  const cats = new Set();
  entries.forEach((e) => {
    const c = String(e.category || '').trim();
    if (c) cats.add(c);
  });
  const catList = Array.from(cats).sort((a, b) => a.localeCompare(b, 'zh'));

  if (catList.length === 0) {
    barEl.innerHTML = '';
    return;
  }

  const items = [{ key: CATEGORY_ALL, label: '全部' }, ...catList.map((c) => ({ key: c, label: c }))];
  barEl.innerHTML = items.map((it) => `
    <button class="wb-category ${it.key === activeCategory ? 'active' : ''}" data-cat="${escapeAttr(it.key)}" type="button">${escapeHTML(it.label)}</button>
  `).join('');

  barEl.querySelectorAll('.wb-category').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset.cat || CATEGORY_ALL;
      renderCategoryBar();
      renderList();
    });
  });
}

// ════════════════════════════════════════
// 列表渲染
// ════════════════════════════════════════

async function renderList() {
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

  // 关键词搜索
  const kw = searchKeyword;
  let filtered = kw
    ? entries.filter((e) => {
        const k = (e.keyword || '').toLowerCase();
        const c = (e.content || '').toLowerCase();
        const t = (Array.isArray(e.triggers) ? e.triggers.join(' ') : '').toLowerCase();
        const cat = (e.category || '').toLowerCase();
        const note = (e.note || '').toLowerCase();
        return k.includes(kw) || c.includes(kw) || t.includes(kw) || cat.includes(kw) || note.includes(kw);
      })
    : entries.slice();

  // 分类过滤
  if (activeCategory !== CATEGORY_ALL) {
    filtered = filtered.filter((e) => String(e.category || '').trim() === activeCategory);
  }

  // 按 priority 倒序，同 priority 按 updatedAt 倒序
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
        <div class="wb-empty-text">${kw || activeCategory !== CATEGORY_ALL ? '没找到相关的词条呀，换几个字试试嘛' : '还没有词条，加一些世界观设定嘛'}</div>
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
    if (main) main.addEventListener('click', () => openForm(e, onSaved, onDelete));
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
  const category = String(e.category || '').trim();
  const triggers = Array.isArray(e.triggers) ? e.triggers : [];
  const triggerCount = Number(e.triggerCount ?? 0) || 0;
  const characterIds = Array.isArray(e.characterIds) ? e.characterIds : [];

  // 分类标签
  const categoryHTML = category
    ? `<span class="wb-card-category">${escapeHTML(category)}</span>`
    : '';
  // 触发次数
  const triggerCountHTML = triggerCount > 0
    ? `<span class="wb-card-trigger-count">${createIcon('bell', 12).outerHTML}${triggerCount}</span>`
    : '';
  // 触发词标签（除了 keyword 之外的）
  const extraTriggers = triggers.filter((t) => t !== keyword);
  const triggersHTML = extraTriggers.length
    ? `<div class="wb-card-triggers">${extraTriggers.slice(0, 6).map((t) => `<span class="wb-card-trigger-tag">${escapeHTML(t)}</span>`).join('')}</div>`
    : '';
  // 关联角色
  const charsHTML = renderCardChars(characterIds);

  return `
    <div class="wb-card ${enabled ? '' : 'disabled'}" data-id="${cssEscape(e.id)}">
      <div class="wb-card-row">
        <div class="wb-card-main" role="button" tabindex="0" aria-label="编辑词条">
          <div class="wb-card-keyword-row">
            <span class="wb-card-keyword">${escapeHTML(keyword)}</span>
            ${categoryHTML}
            ${triggerCountHTML}
            <span class="wb-card-priority">优先级 ${priority}</span>
          </div>
          <div class="wb-card-content">${escapeHTML(content)}</div>
          ${triggersHTML}
          ${charsHTML}
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

// 渲染卡片底部关联角色标签
function renderCardChars(characterIds) {
  if (!Array.isArray(characterIds) || !characterIds.length) {
    // 全局生效
    return `<div class="wb-card-chars"><span class="wb-card-chars-label">关联：</span><span class="wb-card-char-global">全局生效</span></div>`;
  }
  const chips = characterIds.slice(0, 4).map((id) => {
    const c = charCache.get(id);
    const name = c ? (c.name || '（没起名字）') : '（角色已删除）';
    return `<span class="wb-card-char-chip">${renderCharAvatarHTML(c)}${escapeHTML(name)}</span>`;
  }).join('');
  const more = characterIds.length > 4 ? `<span class="wb-card-chars-label">+${characterIds.length - 4}</span>` : '';
  return `<div class="wb-card-chars"><span class="wb-card-chars-label">关联：</span>${chips}${more}</div>`;
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
    bus.emit('worldbook:changed', { id: e.id, enabled: next });
    await renderList();
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
        bus.emit('worldbook:changed', { id: e.id, deleted: true });
        await render();
      } catch (err) {
        console.warn('[worldbook] 删除失败', err);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

// ════════════════════════════════════════
// 导入词条
// ════════════════════════════════════════

function triggerImport() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.style.position = 'fixed';
  input.style.left = '-9999px';
  input.style.top = '-9999px';
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
    await importWorldbook(file, async () => { await render(); });
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!done && (!input.files || !input.files.length)) cleanup();
    }, 400);
  });
  input.click();
}

// ════════════════════════════════════════
// 表单回调
// ════════════════════════════════════════

async function onSaved() {
  await render();
}

function onDelete(entry) {
  confirmDelete(entry);
}
