// apps/characters/index.js
// 角色管理 App——软萌少女风格 PWA「泡泡」。
// 我帮主人把每一个想聊的「她」都悄悄收好，想找谁说话点一下就好啦。
// 存 IndexedDB（STORES.characters），字段：
//   {id, name, nickname, persona, greeting, avatar(dataURL), temperature(0-1), createdAt, updatedAt}
// 当前聊天角色存 localStorage（KEYS.chatCurrentCharacter），默认 'char_chuyi'。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, setData, getDB, setDB, deleteDB, getAllDB, generateId, getNow, compressImage } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, showAlert, createIcon } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, pickImageFile, isUsableImage, cssUrl, clamp } from '../../core/util.js';

let containerEl = null;

// 默认当前角色（没存过时回退到初依）
const DEFAULT_CHARACTER_ID = 'char_chuyi';
// 默认温度
const DEFAULT_TEMPERATURE = 0.7;

// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符
injectStyle('app-characters-style', `
  .char-list-head {
    display: flex; align-items: center; justify-content: space-between;
    margin: 4px 2px 10px;
  }
  .char-list-head-title {
    font-size: var(--font-size-base); font-weight: 600; color: var(--text-secondary);
  }
  .char-list-head-count {
    font-size: var(--font-size-small); color: var(--text-hint);
  }

  .char-card {
    display: flex; align-items: center; gap: 12px; width: 100%; text-align: left;
    background: var(--bg-card);
    border: 1px solid color-mix(in srgb, var(--text-hint) 14%, transparent);
    border-radius: var(--radius-card);
    padding: 14px;
    margin-bottom: 12px;
    cursor: pointer; transition: var(--motion);
    position: relative;
  }
  .char-card:active { transform: scale(var(--press-scale)); }
  .char-card.active {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-light) 50%, transparent);
  }
  .char-avatar {
    width: 56px; height: 56px; border-radius: 50%;
    flex-shrink: 0; background: color-mix(in srgb, var(--accent-light) 50%, transparent);
    background-size: cover; background-position: center;
    display: flex; align-items: center; justify-content: center;
    color: var(--accent-dark); overflow: hidden;
    box-shadow: var(--shadow-sm);
  }
  .char-main { flex: 1; min-width: 0; }
  .char-name-row { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .char-name {
    font-size: var(--font-size-base); font-weight: 600; color: var(--text-primary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 60%;
  }
  .char-nickname {
    font-size: var(--font-size-small); color: var(--text-secondary);
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .char-persona {
    font-size: var(--font-size-small); color: var(--text-secondary);
    margin-top: 4px; line-height: 1.5;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
    overflow: hidden; word-break: break-word;
  }
  .char-current-badge {
    display: inline-flex; align-items: center; gap: 4px;
    font-size: var(--font-size-small); font-weight: 600;
    color: var(--bubble-user-text);
    background: var(--accent);
    padding: 3px 10px; border-radius: 999px;
    flex-shrink: 0;
  }
  .char-actions { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
  .char-icon-btn {
    width: 32px; height: 32px; border-radius: 50%;
    background: transparent; color: var(--text-hint);
    display: flex; align-items: center; justify-content: center;
    transition: var(--motion);
  }
  .char-icon-btn:active { transform: scale(var(--press-scale)); }

  .char-empty {
    display: flex; flex-direction: column; align-items: center;
    padding: 60px 24px; text-align: center; color: var(--text-hint);
  }
  .char-empty-icon {
    color: var(--accent); opacity: 0.6; margin-bottom: 14px;
    display: flex; justify-content: center;
  }
  .char-empty-text {
    font-size: var(--font-size-base); color: var(--text-secondary); line-height: 1.6;
  }

  .char-form-row { margin-bottom: 12px; }
  .char-form-label {
    font-size: var(--font-size-small); color: var(--text-secondary);
    margin-bottom: 6px; display: block;
  }
  .char-avatar-picker {
    display: flex; align-items: center; gap: 12px;
    padding: 10px; border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--bg-secondary) 50%, transparent);
    cursor: pointer; transition: var(--motion);
  }
  .char-avatar-picker:active { transform: scale(var(--press-scale)); }
  .char-avatar-preview {
    width: 64px; height: 64px; border-radius: 50%;
    background: color-mix(in srgb, var(--accent-light) 50%, transparent);
    background-size: cover; background-position: center;
    display: flex; align-items: center; justify-content: center;
    color: var(--accent-dark); flex-shrink: 0; overflow: hidden;
    box-shadow: var(--shadow-sm);
  }
  .char-avatar-hint {
    flex: 1; font-size: var(--font-size-small); color: var(--text-secondary); line-height: 1.5;
  }
  .char-temp-row {
    display: flex; align-items: center; gap: 12px;
  }
  .char-temp-slider {
    flex: 1; -webkit-appearance: none; appearance: none;
    height: 6px; border-radius: 3px;
    background: color-mix(in srgb, var(--text-hint) 24%, transparent);
    outline: none;
  }
  .char-temp-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--accent); cursor: pointer;
    box-shadow: var(--shadow-sm); border: none;
  }
  .char-temp-slider::-moz-range-thumb {
    width: 22px; height: 22px; border-radius: 50%;
    background: var(--accent); cursor: pointer; border: none;
  }
  .char-temp-value {
    min-width: 42px; text-align: right;
    font-size: var(--font-size-base); font-weight: 600; color: var(--accent-dark);
  }
  .char-actions-row { display: flex; gap: 8px; }
  .char-actions-row .btn { flex: 1; justify-content: center; }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="char-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">角色管理</div>
      <button class="app-add" id="char-add" aria-label="新增角色">${createIcon('plus', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="char-body"></div>
  `;
  container.querySelector('#char-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#char-add').addEventListener('click', () => openForm(null));
  await render();
}

export function unmount() {
  containerEl = null;
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
  bus.emit('character:switch', { characterId: id });
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
    // 点击卡片整体 -> 切换为当前聊天角色
    card.addEventListener('click', () => switchCharacter(c));
    // 编辑按钮（点了一下不要触发整体切换）
    const editBtn = card.querySelector('.char-edit');
    if (editBtn) editBtn.addEventListener('click', (e) => { e.stopPropagation(); openForm(c); });
    // 删除按钮
    const delBtn = card.querySelector('.char-del');
    if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); confirmDelete(c); });
  });
}

function renderCard(c, isCurrent) {
  const avatarStyle = isUsableImage(c.avatar) ? `style="background-image:${cssUrl(c.avatar)}"` : '';
  const avatarInner = avatarStyle ? '' : createIcon('smile', 28).outerHTML;
  const nickname = c.nickname ? `<span class="char-nickname">${escapeHTML(c.nickname)}</span>` : '';
  const persona = c.persona ? escapeHTML(truncate(c.persona, 50)) : '（还没写过人设呢）';
  const badge = isCurrent
    ? `<span class="char-current-badge">${createIcon('check', 14).outerHTML}当前聊天</span>`
    : '';
  return `
    <div class="char-card ${isCurrent ? 'active' : ''}" data-id="${cssEscape(c.id)}" role="button" tabindex="0" aria-label="切换到 ${escapeAttr(c.name || '角色')}">
      <div class="char-avatar" ${avatarStyle}>${avatarInner}</div>
      <div class="char-main">
        <div class="char-name-row">
          <span class="char-name">${escapeHTML(c.name || '（没起名字）')}</span>
          ${nickname}
        </div>
        <div class="char-persona">${persona}</div>
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
  render();
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
    body: `「${c.name || '这个角色'}」会被我忘掉哦`,
    confirmText: '删掉吧',
    cancelText: '再想想',
    danger: true,
    onConfirm: async () => {
      try {
        await deleteDB(STORES.characters, c.id);
        showToast('删掉啦', 'default', 1200);
        await render();
      } catch (e) {
        console.warn('[characters] 删除失败', e);
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
    name: '',
    nickname: '',
    persona: '',
    greeting: '',
    avatar: '',
    temperature: DEFAULT_TEMPERATURE
  };

  // 表单里临时持有的头像 dataURL（点了上传才赋值）
  let avatarData = init.avatar || '';

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="char-form-row">
      <div class="char-avatar-picker" id="char-avatar-picker" role="button" tabindex="0" aria-label="选择头像">
        <div class="char-avatar-preview" id="char-avatar-preview">${
          isUsableImage(avatarData) ? '' : createIcon('smile', 28).outerHTML
        }</div>
        <div class="char-avatar-hint">点这里换张小头像呀<br>支持 JPG / PNG，会自动压缩</div>
      </div>
    </div>
    <div class="char-form-row">
      <label class="char-form-label" for="char-f-name">名字</label>
      <input class="input" id="char-f-name" type="text" placeholder="比如：初依" value="${escapeAttr(init.name || '')}" maxlength="40">
    </div>
    <div class="char-form-row">
      <label class="char-form-label" for="char-f-nickname">昵称（可以不写）</label>
      <input class="input" id="char-f-nickname" type="text" placeholder="比如：小初" value="${escapeAttr(init.nickname || '')}" maxlength="40">
    </div>
    <div class="char-form-row">
      <label class="char-form-label" for="char-f-persona">人设</label>
      <textarea class="textarea" id="char-f-persona" placeholder="TA 是怎样一个人呀，性格、身份、口头禅都可以告诉我..." maxlength="2000">${escapeHTML(init.persona || '')}</textarea>
    </div>
    <div class="char-form-row">
      <label class="char-form-label" for="char-f-greeting">问候语</label>
      <textarea class="textarea" id="char-f-greeting" placeholder="TA 一开口会说什么呢..." maxlength="500">${escapeHTML(init.greeting || '')}</textarea>
    </div>
    <div class="char-form-row">
      <label class="char-form-label">温度（越高越调皮，越低越乖巧）</label>
      <div class="char-temp-row">
        <input type="range" class="char-temp-slider" id="char-f-temp" min="0" max="1" step="0.05" value="${Number(init.temperature ?? DEFAULT_TEMPERATURE)}">
        <span class="char-temp-value" id="char-f-temp-v">${Number(init.temperature ?? DEFAULT_TEMPERATURE).toFixed(2)}</span>
      </div>
    </div>
    <div class="char-actions-row">
      ${editing ? '<button class="btn ghost" id="char-f-del">删掉</button>' : ''}
      <button class="btn primary" id="char-f-ok">${editing ? '改好啦' : '加进来'}</button>
    </div>
  `;

  const sheet = showBottomSheet({
    title: editing ? '改一下角色' : '加一个角色',
    bodyElement: body,
    dismissible: true
  });

  // 头像预览更新
  const previewEl = body.querySelector('#char-avatar-preview');
  const refreshPreview = () => {
    if (isUsableImage(avatarData)) {
      previewEl.style.backgroundImage = cssUrl(avatarData);
      previewEl.innerHTML = '';
    } else {
      previewEl.style.backgroundImage = '';
      previewEl.innerHTML = createIcon('smile', 28).outerHTML;
    }
  };
  refreshPreview();

  // 点击选图
  const picker = body.querySelector('#char-avatar-picker');
  picker.addEventListener('click', async () => {
    try {
      const file = await pickImageFile('image/*');
      showToast('正在处理小头像...', 'default', 1200);
      const dataURL = await compressImage(file);
      if (!dataURL) {
        showToast('图片没读出来嘛', 'error');
        return;
      }
      avatarData = dataURL;
      refreshPreview();
      showToast('选好啦', 'success', 1000);
    } catch (e) {
      // 用户取消时静默
      if (e && /取消/.test(e.message || '')) return;
      console.warn('[characters] 选图失败', e);
      showToast('没选成功，再试一下嘛', 'error');
    }
  });

  // 温度滑块联动数值
  const tempSlider = body.querySelector('#char-f-temp');
  const tempValue = body.querySelector('#char-f-temp-v');
  tempSlider.addEventListener('input', () => {
    const v = clamp(parseFloat(tempSlider.value) || 0, 0, 1);
    tempValue.textContent = v.toFixed(2);
  });

  // 保存
  body.querySelector('#char-f-ok').addEventListener('click', async () => {
    const name = body.querySelector('#char-f-name').value.trim();
    const nickname = body.querySelector('#char-f-nickname').value.trim();
    const persona = body.querySelector('#char-f-persona').value.trim();
    const greeting = body.querySelector('#char-f-greeting').value.trim();
    const temperature = clamp(parseFloat(tempSlider.value) || DEFAULT_TEMPERATURE, 0, 1);

    if (!name) { showToast('起个名字嘛', 'error'); return; }

    try {
      const id = init.id || generateId('char');
      // 编辑时保留原 createdAt，并合并已有字段
      const existing = editing ? await getDB(STORES.characters, init.id) : null;
      const record = {
        id,
        name,
        nickname,
        persona,
        greeting,
        avatar: avatarData || '',
        temperature,
        createdAt: existing?.createdAt || getNow()
      };
      await setDB(STORES.characters, id, record);
      sheet.close();
      showToast(editing ? '改好啦，已帮你更新' : '加进来啦，想找 TA 聊天点一下就好', 'success', 1400);
      await render();
    } catch (e) {
      console.warn('[characters] 保存失败', e);
      showToast('没保存成功，再试一下嘛', 'error');
    }
  });

  // 删除（仅编辑时）
  const delBtn = body.querySelector('#char-f-del');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      // 关掉表单 sheet 再弹确认，避免堆叠混淆
      sheet.close();
      // 等 sheet 关掉再走删除确认
      setTimeout(() => confirmDelete(init), 60);
    });
  }

  // 自动聚焦名字
  setTimeout(() => { try { body.querySelector('#char-f-name')?.focus(); } catch (e) {} }, 60);
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
function truncate(s, n) {
  const str = String(s ?? '');
  if (str.length <= n) return str;
  return str.slice(0, n) + '…';
}
