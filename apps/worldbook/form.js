// apps/worldbook/form.js
// 世界书新增 / 编辑表单——我把触发词、关联角色、分类、备注都收进来了。
// 红线：图标只准 SVG 线稿（createIcon），禁止任何 emoji 字符；视觉值全部走 CSS 变量。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/util.js, ./shared.js

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showBottomSheet } from '../../core/ui.js';
import {
  DEFAULT_PRIORITY, MAX_PRIORITY,
  escapeHTML, escapeAttr, clamp, parseList
} from './shared.js';

// ════════════════════════════════════════
// 新增 / 编辑表单（bottomSheet）
// @param {object|null} existing  已有词条（编辑）或 null（新建）
// @param {function} onSaved  保存成功后回调
// @param {function} onDelete  点删除时回调
// ════════════════════════════════════════

export function openForm(existing, onSaved, onDelete) {
  const editing = !!existing;
  const init = existing || {
    id: null,
    keyword: '', content: '', enabled: true, priority: DEFAULT_PRIORITY,
    triggers: [], characterIds: [], category: '', note: '', triggerCount: 0
  };

  // 临时持有的关联角色 id 列表
  let characterIds = Array.isArray(init.characterIds) ? init.characterIds.slice() : [];

  const body = document.createElement('div');
  body.innerHTML = `
    <div class="wb-form-row">
      <label class="wb-form-label" for="wb-f-keyword">关键词</label>
      <input class="input" id="wb-f-keyword" type="text" placeholder="比如：魔法学校、初依的家" value="${escapeAttr(init.keyword || '')}" maxlength="60">
      <div class="wb-form-hint">聊天里出现这个关键词时，我会把内容悄悄塞进 AI 的脑子里</div>
    </div>
    <div class="wb-form-row">
      <label class="wb-form-label" for="wb-f-triggers">触发词（逗号或空格分隔，可以不填）</label>
      <input class="input" id="wb-f-triggers" type="text" placeholder="比如：学校 魔法 法学院" value="${escapeAttr((init.triggers || []).join(' '))}">
      <div class="wb-form-hint">比关键词更宽泛，多个触发词里任何一个命中都会带进上下文</div>
    </div>
    <div class="wb-form-row">
      <label class="wb-form-label" for="wb-f-category">分类（可以不填）</label>
      <input class="input" id="wb-f-category" type="text" placeholder="比如：世界观、人物、地点" value="${escapeAttr(init.category || '')}" maxlength="20">
      <div class="wb-form-hint">填了之后列表顶部会按分类分组，方便找</div>
    </div>
    <div class="wb-form-row">
      <label class="wb-form-label" for="wb-f-content">内容</label>
      <textarea class="textarea" id="wb-f-content" placeholder="写下这段世界观设定，越详细越好呀..." maxlength="3000">${escapeHTML(init.content || '')}</textarea>
    </div>
    <div class="wb-form-row">
      <label class="wb-form-label">关联角色（可以不选，不选=全局生效）</label>
      <div class="wb-multiselect" id="wb-f-char-list"></div>
      <div class="wb-form-hint">选了角色后，这条只在和 TA 聊天时才会触发</div>
    </div>
    <div class="wb-form-row">
      <label class="wb-form-label" for="wb-f-note">备注（可以不填）</label>
      <textarea class="textarea" id="wb-f-note" placeholder="给自己看的备忘，比如「这段设定参考了某本书」" maxlength="500">${escapeHTML(init.note || '')}</textarea>
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

  // 异步加载关联角色清单
  const charListEl = body.querySelector('#wb-f-char-list');
  loadCharacterCheckboxes(charListEl, characterIds);

  // 保存
  body.querySelector('#wb-f-ok').addEventListener('click', async () => {
    const keyword = body.querySelector('#wb-f-keyword').value.trim();
    const triggersRaw = body.querySelector('#wb-f-triggers').value;
    const category = body.querySelector('#wb-f-category').value.trim();
    const content = body.querySelector('#wb-f-content').value.trim();
    const note = body.querySelector('#wb-f-note').value.trim();
    const priorityRaw = parseInt(body.querySelector('#wb-f-priority').value, 10);
    const priority = Number.isFinite(priorityRaw) ? clamp(priorityRaw, 0, MAX_PRIORITY) : DEFAULT_PRIORITY;
    const enabled = body.querySelector('#wb-f-enabled').checked;
    const triggers = parseList(triggersRaw);

    if (!keyword) { showToast('填个关键词嘛', 'error'); return; }
    if (!content) { showToast('写点内容嘛', 'error'); return; }

    try {
      const id = init.id || generateId('wb');
      // 编辑时保留原 createdAt 和 triggerCount
      const prev = editing ? await getDB(STORES.worldbook, init.id) : null;
      const record = {
        id,
        keyword,
        content,
        enabled,
        priority,
        // 新增字段
        triggers,
        characterIds: characterIds.slice(),
        category,
        note,
        triggerCount: Number(prev?.triggerCount ?? 0),
        createdAt: prev?.createdAt || getNow()
      };
      await setDB(STORES.worldbook, id, record);
      sheet.close();
      showToast(editing ? '改好啦，已帮你更新' : '加进来啦，世界观又丰富一点点', 'success', 1400);
      if (typeof onSaved === 'function') onSaved(record);
    } catch (err) {
      console.warn('[worldbook] 保存失败', err);
      showToast('没保存成功，再试一下嘛', 'error');
    }
  });

  // 删除（仅编辑时）
  const delBtn = body.querySelector('#wb-f-del');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      sheet.close();
      setTimeout(() => { if (typeof onDelete === 'function') onDelete(init); }, 60);
    });
  }

  // 自动聚焦关键词
  setTimeout(() => { try { body.querySelector('#wb-f-keyword')?.focus(); } catch (e) {} }, 60);
}

// ════════════════════════════════════════
// 加载关联角色多选清单
// ════════════════════════════════════════

async function loadCharacterCheckboxes(container, selectedIds) {
  if (!container) return;
  let chars = [];
  try {
    chars = await getAllDB(STORES.characters);
  } catch (e) {
    console.warn('[worldbook] 读取角色失败', e);
    container.innerHTML = '<div class="wb-multiselect-empty">角色读不出来嘛</div>';
    return;
  }
  // 按名字排序
  chars.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh'));

  if (chars.length === 0) {
    container.innerHTML = '<div class="wb-multiselect-empty">还没有角色，去角色管理加一些嘛</div>';
    return;
  }

  const selected = new Set(selectedIds);
  container.innerHTML = chars.map((c) => {
    const checked = selected.has(c.id) ? 'checked' : '';
    const sub = c.nickname ? `<span class="wb-form-hint">（${escapeHTML(c.nickname)}）</span>` : '';
    return `
      <label class="wb-check-row">
        <input type="checkbox" value="${escapeAttr(c.id)}" ${checked}>
        <span class="wb-check-row-label">${escapeHTML(c.name || '（没起名字）')} ${sub}</span>
      </label>
    `;
  }).join('');

  // 绑定变化
  container.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const id = cb.value;
      const idx = selectedIds.indexOf(id);
      if (cb.checked && idx === -1) selectedIds.push(id);
      if (!cb.checked && idx !== -1) selectedIds.splice(idx, 1);
    });
  });
}
