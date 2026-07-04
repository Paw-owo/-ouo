// apps/characters/index.js
// 角色管理 App——软萌少女风格 PWA「泡泡」。
// 我帮主人把每一个想聊的「她」都悄悄收好，点一下卡片就能看到 TA 的全部资料。
// 存 IndexedDB（STORES.characters），字段：
//   {id, name, nickname, persona, greeting, avatar(dataURL), temperature(0-1),
//    personality, speechStyle, background, worldbookIds[], tags[], relation,
//    createdAt, updatedAt}
// 当前聊天角色存 localStorage（KEYS.chatCurrentCharacter），默认 'char_chuyi'。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js, core/app-bg.js,
//       ./shared.js, ./form.js, ./detail.js, ./io.js

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, setData, deleteDB, getAllDB } from '../../core/storage.js';
import { showToast, showConfirm, showAlert, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { applyAppBg } from '../../core/app-bg.js';
import {
  DEFAULT_CHARACTER_ID,
  escapeHTML, escapeAttr, cssEscape, truncate,
  renderAvatarHTML, renderTagsHTML
} from './shared.js';
import { openForm } from './form.js';
import { openDetail } from './detail.js';
import { importCharacter } from './io.js';

let containerEl = null;
// 当前是否在详情页（用于返回时刷新列表）
let detailCharacterId = null;

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  detailCharacterId = null;
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="char-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">角色管理</div>
      <button class="app-import" id="char-import" aria-label="导入角色卡" title="导入">${createIcon('upload', 20).outerHTML}</button>
      <button class="app-add" id="char-add" aria-label="新增角色" title="新增">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="char-body"></div>
  `;
  container.querySelector('#char-back').addEventListener('click', () => {
    if (detailCharacterId) {
      // 在详情页时返回到列表
      detailCharacterId = null;
      render();
    } else {
      bus.emit('router:home');
    }
  });
  container.querySelector('#char-add').addEventListener('click', () => openForm(null, onSaved, onDelete));
  container.querySelector('#char-import').addEventListener('click', () => triggerImport());
  applyAppBg(container, 'characters');
  await render();
}

export function unmount() {
  containerEl = null;
  detailCharacterId = null;
}

// ════════════════════════════════════════
// 当前角色读写
// ════════════════════════════════════════

function getCurrentCharacterId() {
  const v = getData(KEYS.chatCurrentCharacter, null);
  if (typeof v === 'string' && v) return v;
  // 没存过的话给个默认值，写回去避免下次又来一遍
  setData(KEYS.chatCurrentCharacter, DEFAULT_CHARACTER_ID);
  return DEFAULT_CHARACTER_ID;
}

function setCurrentCharacterId(id) {
  setData(KEYS.chatCurrentCharacter, id);
  // 通知聊天相关模块该换角色啦
  bus.emit('character:switched', { characterId: id });
}

// ════════════════════════════════════════
// 列表渲染
// ════════════════════════════════════════

async function render() {
  const body = containerEl?.querySelector('#char-body');
  if (!body) return;
  let list = [];
  try {
    list = await getAllDB(STORES.characters);
  } catch (e) {
    console.warn('[characters] 读取角色失败', e);
    showToast('角色读不出来嘛，等一下再试试', 'error');
    return;
  }
  // 按 updatedAt 倒序，最近改过的在最前
  list.sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return tb - ta;
  });

  if (list.length === 0) {
    body.innerHTML = `
      <div class="char-empty">
        <div class="char-empty-icon">${createIcon('smile', 52).outerHTML}</div>
        <div class="char-empty-text">还没有角色，加一个嘛</div>
      </div>
    `;
    return;
  }

  const currentId = getCurrentCharacterId();

  body.innerHTML = `
    <div class="char-list-head">
      <span class="char-list-head-title">全部角色</span>
      <span class="char-list-head-count">共 ${list.length} 个</span>
    </div>
    ${list.map((c) => renderCard(c, c.id === currentId)).join('')}
  `;

  // 绑定每条事件
  list.forEach((c) => {
    const card = body.querySelector(`[data-id="${cssEscape(c.id)}"]`);
    if (!card) return;
    // 点击卡片整体 -> 进入详情页（不再直接切换）
    card.addEventListener('click', () => openDetailPage(c));
    // 编辑按钮（点了一下不要触发整体跳转）
    const editBtn = card.querySelector('.char-edit');
    if (editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); openForm(c, onSaved, onDelete); });
    // 删除按钮
    const delBtn = card.querySelector('.char-del');
    if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(c); });
  });
}

function renderCard(c, isCurrent) {
  const avatarHTML = renderAvatarHTML(c, 56);
  const nickname = c.nickname ? `<span class="char-nickname">${escapeHTML(c.nickname)}</span>` : '';
  const persona = c.persona ? escapeHTML(truncate(c.persona, 50)) : '（还没写过人设呢）';
  const tagsHTML = renderTagsHTML(c.tags);
  const badge = isCurrent
    ? `<span class="char-current-badge">${createIcon('check', 14).outerHTML}当前聊天</span>`
    : '';
  return `
    <div class="char-card ${isCurrent ? 'active' : ''}" data-id="${cssEscape(c.id)}" role="button" tabindex="0" aria-label="查看 ${escapeAttr(c.name || '角色')}">
      ${avatarHTML}
      <div class="char-main">
        <div class="char-name-row">
          <span class="char-name">${escapeHTML(c.name || '（没起名字）')}</span>
          ${nickname}
        </div>
        <div class="char-persona">${persona}</div>
        ${tagsHTML ? `<div class="char-tags-row">${tagsHTML}</div>` : ''}
      </div>
      <div class="char-actions">
        ${badge}
        <button class="char-icon-btn char-edit" aria-label="编辑角色" title="编辑">${createIcon('edit', 16).outerHTML}</button>
        <button class="char-icon-btn char-del" aria-label="删除角色" title="删除">${createIcon('trash', 16).outerHTML}</button>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════
// 详情页入口
// ════════════════════════════════════════

async function openDetailPage(character) {
  if (!character || !character.id || !containerEl) return;
  detailCharacterId = character.id;
  // 滚到顶部
  const body = containerEl.querySelector('#char-body');
  if (body) body.scrollTop = 0;
  await openDetail(containerEl, character, {
    onBack: () => { detailCharacterId = null; render(); },
    onEdit: (c) => openForm(c, onSaved, onDelete),
    onDelete: (c) => confirmDelete(c),
    onSetCurrent: (c) => switchCharacter(c),
    currentId: getCurrentCharacterId()
  });
}

// ════════════════════════════════════════
// 切换当前角色
// ════════════════════════════════════════

function switchCharacter(c) {
  if (!c || !c.id) return;
  const currentId = getCurrentCharacterId();
  if (c.id === currentId) {
    showToast('已经在和 TA 聊啦', 'default', 1200);
    return;
  }
  setCurrentCharacterId(c.id);
  showToast(`切换到 ${c.name || 'TA'} 啦`, 'success', 1400);
  // 切换后刷新详情页（按钮高亮要变）
  openDetailPage(c);
}

// ════════════════════════════════════════
// 删除（带二次确认，且不能删当前聊天角色）
// ════════════════════════════════════════

function confirmDelete(c) {
  if (!c || !c.id) return;
  const currentId = getCurrentCharacterId();
  if (c.id === currentId) {
    // 红线：不能删当前聊天角色
    showAlert({
      title: '删不掉呀',
      body: '先切换到别的角色再删嘛',
      okText: '知道啦'
    });
    return;
  }
  showConfirm({
    title: '真的要删掉吗？',
    body: `删掉「${c.name || '这个角色'}」就再也找不回来啦，确定吗？`,
    confirmText: '删掉吧',
    cancelText: '再想想',
    danger: true,
    onConfirm: async () => {
      try {
        await deleteDB(STORES.characters, c.id);
        showToast('删掉啦', 'default', 1200);
        detailCharacterId = null;
        await render();
      } catch (e) {
        console.warn('[characters] 删除失败', e);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

// ════════════════════════════════════════
// 导入角色卡
// ════════════════════════════════════════

function triggerImport() {
  // 复用 pickImageFile 的文件选择逻辑，但 accept 用 json
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
    await importCharacter(file, async () => { await render(); });
  });
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (!done && (!input.files || !input.files.length)) cleanup();
    }, 400);
  });
  input.click();
}

// ════════════════════════════════════════
// 表单 / 详情 回调
// ════════════════════════════════════════

async function onSaved(record) {
  // 如果正在详情页查看的就是这个角色，刷新详情页；否则刷新列表
  if (detailCharacterId && record && record.id === detailCharacterId) {
    const fresh = await getFresh(record.id);
    if (fresh) await openDetailPage(fresh);
  } else {
    await render();
  }
}

function onDelete(character) {
  confirmDelete(character);
}

async function getFresh(id) {
  try {
    const { getDB } = await import('../../core/storage.js');
    return await getDB(STORES.characters, id);
  } catch (e) {
    return null;
  }
}
