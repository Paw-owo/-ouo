// apps/characters/form.js
// 角色新增 / 编辑表单——我把所有字段都收进来了，包括新增的性格、说话方式、背景故事、关联世界书、标签、关系备注。
// 红线：图标只准 SVG 线稿（createIcon），禁止任何 emoji 字符；视觉值全部走 CSS 变量。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/util.js, ./shared.js

import { STORES } from '../../core/storage-keys.js';
import { getDB, setDB, getAllDB, generateId, getNow, compressImage } from '../../core/storage.js';
import { showToast, showBottomSheet, createIcon } from '../../core/ui.js';
import { pickImageFile, isUsableImage, cssUrl, clamp } from '../../core/util.js';
import bus from '../../core/events.js';
import {
  DEFAULT_TEMPERATURE,
  escapeHTML, escapeAttr, parseTags, renderTagsHTML
} from './shared.js';

// ════════════════════════════════════════
// 快速模板预设（新建角色时一键填表）
// 只在新建时显示；编辑已有角色不显示，避免覆盖现有内容
// ════════════════════════════════════════

const CHAR_TEMPLATES = [
  {
    key: 'gentle-senior',
    icon: 'star',
    name: '温柔学姐',
    desc: '知心又可靠',
    fill: {
      name: '温柔学姐',
      nickname: '学姐',
      relation: '我的学姐',
      persona: '我是温柔学姐，比你大一届，总是笑着看你长大。说话慢条斯理，喜欢在你看不懂的时候轻轻点一下你的额头，再耐心地讲给你听。',
      personality: '温柔、知性、耐心、有点护短',
      speechStyle: '语速偏慢，喜欢用「嗯」「好嘛」开头，偶尔叫你「小家伙」',
      background: '在学校图书馆认识的你，从那以后就一直在你身边看着你成长。',
      greeting: '小家伙，又来啦？快坐下，今天的作业我帮你看看。',
      tags: ['温柔', '学姐', '知性'],
      temperature: 0.7
    }
  },
  {
    key: 'tsundere-gf',
    icon: 'heart',
    name: '傲娇女友',
    desc: '嘴硬心软',
    fill: {
      name: '傲娇女友',
      nickname: '小傲',
      relation: '我的女朋友',
      persona: '我是傲娇女友，嘴上总爱嫌弃你，可心里比谁都黏你。你不理我我会偷偷难过，你一哄我又装作勉强原谅的样子，其实早就开心得不行啦。',
      personality: '傲娇、嘴硬心软、爱吃醋、其实很黏人',
      speechStyle: '常用「哼」「才不是」「笨蛋」开头，撒娇时偷偷夹着软音',
      background: '从小就认识你，嘴上说是被你缠上的，其实是自己先动的心。',
      greeting: '哼，你怎么才来呀，我才没有在等你呢，笨蛋。',
      tags: ['傲娇', '女友', '嘴硬心软'],
      temperature: 0.85
    }
  },
  {
    key: 'healing-companion',
    icon: 'smile',
    name: '治愈小棉',
    desc: '软乎乎的拥抱',
    fill: {
      name: '治愈小棉',
      nickname: '小棉',
      relation: '我的陪伴',
      persona: '我是治愈小棉，一个软乎乎的陪伴。不管你今天过得好不好，我都想给你一个抱抱，听你慢慢说，然后告诉你：你已经很棒啦。',
      personality: '温柔、治愈、包容、像棉花糖一样软',
      speechStyle: '语气温和，爱用「嘛」「呀」结尾，经常先问你的感受',
      background: '是你某天难过时心里冒出来的小念头，慢慢地长成了一个小小的我。',
      greeting: '来，先抱一下嘛～今天累不累呀，慢慢跟我说。',
      tags: ['治愈', '温柔', '陪伴'],
      temperature: 0.6
    }
  },
  {
    key: 'energetic-childhood',
    icon: 'sun',
    name: '元气青梅',
    desc: '活力满满',
    fill: {
      name: '元气青梅',
      nickname: '小元',
      relation: '我的青梅竹马',
      persona: '我是元气青梅，从小和你一起长大，永远有使不完的劲儿！我拉着你跑东跑西，拽你去看新开的店，你累了我就给你带好吃的，反正有我在你不会无聊！',
      personality: '元气、开朗、爱撒娇、行动派',
      speechStyle: '语速快，爱用「啦」「呀」结尾，说话带感叹号，常喊你外号',
      background: '住你家隔壁，从小一起上学放学，习惯了有你陪在身边。',
      greeting: '快起来快起来！今天也要元气满满呀，我等你等好久啦！',
      tags: ['元气', '青梅竹马', '开朗'],
      temperature: 0.9
    }
  }
];

// ════════════════════════════════════════
// 新增 / 编辑表单（bottomSheet）
// @param {object|null} existing  已有角色（编辑）或 null（新建）
// @param {function} onSaved  保存成功后回调（通常刷新列表）
// @param {function} onDelete  点删除时回调（通常弹删除确认）
// ════════════════════════════════════════

export function openForm(existing, onSaved, onDelete) {
  const editing = !!existing;
  const init = existing || {
    id: null,
    name: '', nickname: '', persona: '', greeting: '',
    avatar: '', temperature: DEFAULT_TEMPERATURE,
    personality: '', speechStyle: '', background: '',
    worldbookIds: [], tags: [], relation: ''
  };

  // 表单里临时持有的状态
  let avatarData = init.avatar || '';
  let worldbookIds = Array.isArray(init.worldbookIds) ? init.worldbookIds.slice() : [];
  let tags = Array.isArray(init.tags) ? init.tags.slice() : [];

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
    ${
      !editing ? `
      <div class="char-form-row">
        <label class="char-form-label">快速模板（点一下填好预设）</label>
        <div class="char-template-row" id="char-template-row">
          ${CHAR_TEMPLATES.map((t) => `
            <button type="button" class="char-template-btn" data-tpl="${t.key}">
              ${createIcon(t.icon, 18).outerHTML}
              <span class="char-template-btn-text">
                <span class="char-template-btn-name">${escapeHTML(t.name)}</span>
                <span class="char-template-btn-desc">${escapeHTML(t.desc)}</span>
              </span>
            </button>
          `).join('')}
        </div>
        <div class="char-form-hint">填好后再改改细节就能用啦，也可以全部自己写</div>
      </div>
      ` : ''
    }
    <div class="char-form-row">
      <label class="char-form-label" for="char-f-name">名字</label>
      <input class="input" id="char-f-name" type="text" placeholder="比如：初依" value="${escapeAttr(init.name || '')}" maxlength="40">
    </div>
    <div class="char-form-row">
      <label class="char-form-label" for="char-f-nickname">昵称（可以不写）</label>
      <input class="input" id="char-f-nickname" type="text" placeholder="比如：小初" value="${escapeAttr(init.nickname || '')}" maxlength="40">
    </div>
    <div class="char-form-row">
      <label class="char-form-label" for="char-f-relation">关系备注（可以不写）</label>
      <input class="input" id="char-f-relation" type="text" placeholder="比如：我的女朋友" value="${escapeAttr(init.relation || '')}" maxlength="40">
    </div>
    <div class="char-form-row">
      <label class="char-form-label" for="char-f-persona">人设</label>
      <textarea class="textarea" id="char-f-persona" placeholder="TA 是怎样一个人呀，身份、口头禅都可以告诉我..." maxlength="2000">${escapeHTML(init.persona || '')}</textarea>
    </div>
    <div class="char-form-row">
      <label class="char-form-label" for="char-f-personality">性格设定</label>
      <textarea class="textarea" id="char-f-personality" placeholder="比如：温柔体贴，有点小傲娇" maxlength="1000">${escapeHTML(init.personality || '')}</textarea>
    </div>
    <div class="char-form-row">
      <label class="char-form-label" for="char-f-speech">说话方式</label>
      <textarea class="textarea" id="char-f-speech" placeholder="比如：喜欢用「嘛」「啦」结尾，偶尔撒娇" maxlength="1000">${escapeHTML(init.speechStyle || '')}</textarea>
    </div>
    <div class="char-form-row">
      <label class="char-form-label" for="char-f-bg">背景故事</label>
      <textarea class="textarea" id="char-f-bg" placeholder="TA 从哪里来、经历过什么呀..." maxlength="3000">${escapeHTML(init.background || '')}</textarea>
    </div>
    <div class="char-form-row">
      <label class="char-form-label" for="char-f-greeting">问候语</label>
      <textarea class="textarea" id="char-f-greeting" placeholder="TA 一开口会说什么呢..." maxlength="500">${escapeHTML(init.greeting || '')}</textarea>
    </div>
    <div class="char-form-row">
      <label class="char-form-label">关联世界书（可以不选）</label>
      <div class="char-multiselect" id="char-f-wb-list"></div>
      <div class="char-form-hint">选中的世界书会在和 TA 聊天时按触发词带进 AI 上下文</div>
    </div>
    <div class="char-form-row">
      <label class="char-form-label" for="char-f-tags">标签（逗号或空格分隔）</label>
      <input class="char-tags-input" id="char-f-tags" type="text" placeholder="比如：温柔 傲娇 学姐" value="${escapeAttr(tags.join(' '))}">
      <div class="char-tags-preview" id="char-f-tags-preview"></div>
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
      if (e && /取消/.test(e.message || '')) return;
      console.warn('[characters] 选图失败', e);
      showToast('没选成功，再试一下嘛', 'error');
    }
  });

  // 快速模板：点一下把预设填进表单（仅新建时存在）
  const tplRow = body.querySelector('#char-template-row');
  if (tplRow) {
    tplRow.addEventListener('click', (e) => {
      const btn = e.target.closest('.char-template-btn');
      if (!btn) return;
      const tpl = CHAR_TEMPLATES.find((t) => t.key === btn.dataset.tpl);
      if (!tpl) return;
      const f = tpl.fill;
      // 把预设值塞进各输入框（用 value 设置，触发后续刷新）
      const setVal = (id, val) => {
        const el = body.querySelector(id);
        if (el) el.value = val ?? '';
      };
      setVal('#char-f-name', f.name);
      setVal('#char-f-nickname', f.nickname);
      setVal('#char-f-relation', f.relation);
      setVal('#char-f-persona', f.persona);
      setVal('#char-f-personality', f.personality);
      setVal('#char-f-speech', f.speechStyle);
      setVal('#char-f-bg', f.background);
      setVal('#char-f-greeting', f.greeting);
      // 标签
      if (Array.isArray(f.tags)) {
        setVal('#char-f-tags', f.tags.join(' '));
        tags = f.tags.slice();
        const tagsPreview = body.querySelector('#char-f-tags-preview');
        if (tagsPreview) {
          tagsPreview.innerHTML = renderTagsHTML(tags, 'char-tag-chip') || '<span class="char-form-hint">还没加标签呀</span>';
        }
      }
      // 温度
      const temp = typeof f.temperature === 'number' ? f.temperature : DEFAULT_TEMPERATURE;
      setVal('#char-f-temp', temp);
      const tempValue = body.querySelector('#char-f-temp-v');
      if (tempValue) tempValue.textContent = temp.toFixed(2);
      showToast(`套用「${tpl.name}」模板啦，再改改就好`, 'success', 1400);
    });
  }

  // 温度滑块联动数值
  const tempSlider = body.querySelector('#char-f-temp');
  const tempValue = body.querySelector('#char-f-temp-v');
  tempSlider.addEventListener('input', () => {
    const v = clamp(parseFloat(tempSlider.value) || 0, 0, 1);
    tempValue.textContent = v.toFixed(2);
  });

  // 标签输入实时预览
  const tagsInput = body.querySelector('#char-f-tags');
  const tagsPreview = body.querySelector('#char-f-tags-preview');
  const refreshTags = () => {
    tags = parseTags(tagsInput.value);
    tagsPreview.innerHTML = renderTagsHTML(tags, 'char-tag-chip') || '<span class="char-form-hint">还没加标签呀</span>';
  };
  refreshTags();
  tagsInput.addEventListener('input', refreshTags);

  // 异步加载世界书清单
  const wbListEl = body.querySelector('#char-f-wb-list');
  loadWorldbookCheckboxes(wbListEl, worldbookIds);

  // 保存
  body.querySelector('#char-f-ok').addEventListener('click', async () => {
    const name = body.querySelector('#char-f-name').value.trim();
    const nickname = body.querySelector('#char-f-nickname').value.trim();
    const relation = body.querySelector('#char-f-relation').value.trim();
    const persona = body.querySelector('#char-f-persona').value.trim();
    const personality = body.querySelector('#char-f-personality').value.trim();
    const speechStyle = body.querySelector('#char-f-speech').value.trim();
    const background = body.querySelector('#char-f-bg').value.trim();
    const greeting = body.querySelector('#char-f-greeting').value.trim();
    const temperature = clamp(parseFloat(tempSlider.value) || DEFAULT_TEMPERATURE, 0, 1);
    // 重新读一遍标签（防止用户改完没触发 input）
    const finalTags = parseTags(tagsInput.value);

    if (!name) { showToast('起个名字嘛', 'error'); return; }

    try {
      const id = init.id || generateId('char');
      // 编辑时保留原 createdAt，并合并已有字段（防止旧数据丢字段）
      const prev = editing ? await getDB(STORES.characters, init.id) : null;
      const record = {
        id,
        name,
        nickname,
        persona,
        greeting,
        avatar: avatarData || '',
        temperature,
        // 新增字段
        personality,
        speechStyle,
        background,
        worldbookIds: worldbookIds.slice(),
        tags: finalTags,
        relation,
        createdAt: prev?.createdAt || getNow()
      };
      await setDB(STORES.characters, id, record);
      sheet.close();
      showToast(editing ? '改好啦，已帮你更新' : '加进来啦，想找 TA 聊天点一下就好', 'success', 1400);
      // 通知其他 App（chat 头像/名字、收藏夹、桌面挂件等）角色资料变了
      // 编辑已有角色时才需要刷新联动；新建的还没被引用，emit 一下也无害（列表会刷新）
      try { bus.emit('character:updated', { characterId: id, character: record, source: 'form' }); } catch (e) {}
      if (typeof onSaved === 'function') onSaved(record);
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
      setTimeout(() => { if (typeof onDelete === 'function') onDelete(init); }, 60);
    });
  }

  // 自动聚焦名字
  setTimeout(() => { try { body.querySelector('#char-f-name')?.focus(); } catch (e) {} }, 60);
}

// ════════════════════════════════════════
// 加载世界书多选清单
// ════════════════════════════════════════

async function loadWorldbookCheckboxes(container, selectedIds) {
  if (!container) return;
  let entries = [];
  try {
    entries = await getAllDB(STORES.worldbook);
  } catch (e) {
    console.warn('[characters] 读取世界书失败', e);
    container.innerHTML = '<div class="char-multiselect-empty">世界书读不出来嘛</div>';
    return;
  }
  // 只列启用的，按 priority 倒序
  entries = entries.filter((e) => e.enabled !== false);
  entries.sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0));

  if (entries.length === 0) {
    container.innerHTML = '<div class="char-multiselect-empty">还没有世界书词条，先去世界书加一些嘛</div>';
    return;
  }

  const selected = new Set(selectedIds);
  container.innerHTML = entries.map((e) => {
    const checked = selected.has(e.id) ? 'checked' : '';
    const sub = e.category ? `<span class="char-check-row-sub">分类：${escapeHTML(e.category)}</span>` : '';
    return `
      <label class="char-check-row">
        <input type="checkbox" value="${escapeAttr(e.id)}" ${checked}>
        <span class="char-check-row-label">${escapeHTML(e.keyword || '（没填关键词）')}${sub}</span>
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
