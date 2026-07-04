// apps/worldbook/match.js
// 世界书触发匹配——我暴露 matchWorldbook 给聊天 App 调用，
// 还做了一个测试触发的 bottomSheet，让主人随便输一句话就能看到会命中哪些词条。
// 红线：图标只准 SVG 线稿（createIcon），禁止任何 emoji 字符；视觉值全部走 CSS 变量。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, ./shared.js

import { STORES } from '../../core/storage-keys.js';
import { getAllDB } from '../../core/storage.js';
import { showToast, showBottomSheet, createIcon } from '../../core/ui.js';
import { escapeHTML } from './shared.js';

// ════════════════════════════════════════
// matchWorldbook —— 聊天 App 调用的触发匹配入口
// @param {string} text  用户输入的文本
// @param {string} characterId  当前聊天角色 id（用于过滤关联角色）
// @returns {Promise<Array>}  命中的词条数组（按 priority 倒序）
//   匹配逻辑：text includes 任何 trigger 或 keyword => 命中
//   过滤条件：enabled !== false，且（characterIds 为空=全局，或包含当前 characterId）
// ════════════════════════════════════════

export async function matchWorldbook(text, characterId) {
  if (!text || typeof text !== 'string') return [];
  let entries = [];
  try {
    entries = await getAllDB(STORES.worldbook);
  } catch (e) {
    console.warn('[worldbook] 读取词条失败', e);
    return [];
  }
  if (!Array.isArray(entries) || !entries.length) return [];

  const lower = text.toLowerCase();
  const hits = entries.filter((e) => {
    // 必须启用
    if (e.enabled === false) return false;
    // 关联角色过滤：characterIds 为空 = 全局生效；非空则必须包含当前角色
    if (Array.isArray(e.characterIds) && e.characterIds.length > 0) {
      if (!characterId || !e.characterIds.includes(characterId)) return false;
    }
    // 触发词匹配：triggers 或 keyword 任一命中
    const triggers = Array.isArray(e.triggers) ? e.triggers : [];
    const keyword = e.keyword || '';
    const allTokens = [...triggers];
    if (keyword) allTokens.push(keyword);
    return allTokens.some((tok) => {
      const t = String(tok || '').toLowerCase();
      return t && lower.includes(t);
    });
  });

  // 按 priority 倒序，同 priority 按 triggerCount 倒序
  hits.sort((a, b) => {
    const pa = Number(a.priority ?? 0);
    const pb = Number(b.priority ?? 0);
    if (pa !== pb) return pb - pa;
    return Number(b.triggerCount ?? 0) - Number(a.triggerCount ?? 0);
  });

  return hits;
}

// ════════════════════════════════════════
// 增加触发次数（聊天真实命中时调用，测试触发不调）
// @param {string} id  词条 id
// ════════════════════════════════════════

export async function incrementTriggerCount(id) {
  if (!id) return;
  try {
    const { getDB, setDB } = await import('../../core/storage.js');
    const cur = await getDB(STORES.worldbook, id);
    if (!cur) return;
    await setDB(STORES.worldbook, id, {
      ...cur,
      triggerCount: Number(cur.triggerCount ?? 0) + 1
    });
  } catch (e) {
    console.warn('[worldbook] 触发次数+1 失败', e);
  }
}

// ════════════════════════════════════════
// 测试触发 bottomSheet
// 输入一句话 -> 模拟匹配 -> 显示命中条目
// 注意：测试时只展示，不会真的给 triggerCount+1（避免污染统计）
// ════════════════════════════════════════

export function openTestTrigger() {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="wb-form-row">
      <label class="wb-form-label" for="wb-test-char">模拟哪个角色在聊</label>
      <select class="input" id="wb-test-char">
        <option value="">全局（所有角色）</option>
      </select>
      <div class="wb-form-hint">选了角色后，只匹配「全局」和「关联该角色」的词条</div>
    </div>
    <div class="wb-form-row">
      <label class="wb-form-label" for="wb-test-input">随便输一句话试试</label>
      <textarea class="textarea" id="wb-test-input" placeholder="比如：今天我去魔法学校上课啦" maxlength="500"></textarea>
      <div class="wb-form-hint">我会模拟聊天时的触发逻辑，看看会命中哪些词条</div>
    </div>
    <button class="btn primary" id="wb-test-run" style="width:100%;justify-content:center">测一下</button>
    <div class="wb-test-result" id="wb-test-result"></div>
  `;

  const sheet = showBottomSheet({
    title: '测试触发',
    bodyElement: body,
    dismissible: true
  });

  const charSelect = body.querySelector('#wb-test-char');
  const inputEl = body.querySelector('#wb-test-input');
  const resultEl = body.querySelector('#wb-test-result');
  const runBtn = body.querySelector('#wb-test-run');

  // 异步加载角色清单填进下拉框
  loadCharacterOptions(charSelect);

  runBtn.addEventListener('click', async () => {
    const text = inputEl.value.trim();
    if (!text) {
      showToast('输点字嘛', 'error');
      return;
    }
    runBtn.textContent = '正在测...';
    runBtn.disabled = true;
    try {
      // 带上选中的角色 id（空字符串 = 全局，等同 null）
      const characterId = charSelect.value || null;
      const hits = await matchWorldbook(text, characterId);
      resultEl.innerHTML = renderTestResult(hits);
    } catch (e) {
      console.warn('[worldbook] 测试触发失败', e);
      showToast('没测出来，再试一下嘛', 'error');
    } finally {
      runBtn.textContent = '测一下';
      runBtn.disabled = false;
    }
  });

  // 回车也能触发
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runBtn.click();
    }
  });

  setTimeout(() => { try { inputEl?.focus(); } catch (e) {} }, 60);
}

// 把所有角色填进下拉框（失败就只保留「全局」选项）
async function loadCharacterOptions(selectEl) {
  if (!selectEl) return;
  let chars = [];
  try {
    chars = await getAllDB(STORES.characters);
  } catch (e) {
    console.warn('[worldbook] 读取角色失败', e);
    return;
  }
  if (!Array.isArray(chars) || chars.length === 0) return;
  // 按昵称/名字排序，方便找
  chars.sort((a, b) => {
    const na = a.nickname || a.name || '';
    const nb = b.nickname || b.name || '';
    return na.localeCompare(nb, 'zh');
  });
  const frag = document.createDocumentFragment();
  chars.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.nickname || c.name || '未命名';
    frag.appendChild(opt);
  });
  selectEl.appendChild(frag);
}

function renderTestResult(hits) {
  if (!Array.isArray(hits) || !hits.length) {
    return `
      <div class="wb-test-result-title">命中的词条</div>
      <div class="wb-test-empty">一个都没命中呀，换句话试试嘛</div>
    `;
  }
  return `
    <div class="wb-test-result-title">命中 ${hits.length} 条</div>
    ${hits.map((e) => `
      <div class="wb-test-hit">
        <div class="wb-test-hit-keyword">${escapeHTML(e.keyword || '（没填关键词）')}</div>
        <div class="wb-test-hit-content">${escapeHTML(e.content || '')}</div>
      </div>
    `).join('')}
  `;
}
