// apps/characters/detail.js
// 角色详情页——我把 TA 的大头像、人设、性格、说话方式、背景故事都摆出来，
// 下面还接了独立数据面板：记忆 / 聊天记录 / 钱包 / 朋友圈 / 记仇，点一下就能跳过去看。
// 红线：图标只准 SVG 线稿（createIcon），禁止任何 emoji 字符；视觉值全部走 CSS 变量。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/util.js, core/memory.js,
//       core/router.js, ./shared.js, ./io.js

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, getAllDB } from '../../core/storage.js';
import { showToast, createIcon } from '../../core/ui.js';
import { clamp, isUsableImage, cssUrl } from '../../core/util.js';
import { getMemories } from '../../core/memory.js';
import { openApp } from '../../core/router.js';
import { exportCharacter } from './io.js';
import {
  escapeHTML, truncate, renderTagsHTML
} from './shared.js';

// 渲染详情页大头像（带默认图标兜底）
function renderBigAvatar(character) {
  const av = character && character.avatar;
  if (isUsableImage(av)) {
    return `<div class="char-detail-avatar-big" style="background-image:${cssUrl(av)}"></div>`;
  }
  return `<div class="char-detail-avatar-big">${createIcon('smile', 48).outerHTML}</div>`;
}

// ════════════════════════════════════════
// 打开详情页（替换 body 内容）
// @param {HTMLElement} container  App 容器（含 header + body）
// @param {object} character  角色记录
// @param {function} onBack  返回列表的回调
// @param {function} onEdit  点编辑的回调（传 character）
// @param {function} onDelete  点删除的回调（传 character）
// @param {function} onSetCurrent  点设为当前的回调（传 character）
// @param {string} currentId  当前聊天角色 id（用于高亮）
// ════════════════════════════════════════

export async function openDetail(container, character, hooks) {
  const { onBack, onEdit, onDelete, onSetCurrent, currentId } = hooks || {};
  const body = container.querySelector('#char-body');
  if (!body || !character) return;

  const isCurrent = character.id === currentId;
  const temp = clamp(Number(character.temperature ?? 0.7), 0, 1);

  body.innerHTML = `
    <div class="char-detail-top">
      <button class="btn ghost icon-only" id="char-dt-back" aria-label="返回列表">${createIcon('back', 18).outerHTML}</button>
      <button class="btn ${isCurrent ? 'primary' : 'ghost'}" id="char-dt-current">${isCurrent ? '当前聊天中' : '设为当前聊天'}</button>
      <button class="btn ghost icon-only" id="char-dt-export" aria-label="导出角色卡" title="导出">${createIcon('download', 18).outerHTML}</button>
      <button class="btn ghost icon-only" id="char-dt-edit" aria-label="编辑">${createIcon('edit', 18).outerHTML}</button>
      <button class="btn ghost icon-only" id="char-dt-del" aria-label="删除">${createIcon('trash', 18).outerHTML}</button>
    </div>
    <div class="char-detail-hero">
      ${renderBigAvatar(character)}
      <div class="char-detail-name">${escapeHTML(character.name || '（没起名字）')}</div>
      ${character.nickname ? `<div class="char-detail-nickname">${escapeHTML(character.nickname)}</div>` : ''}
      ${character.relation ? `<div class="char-detail-relation">${createIcon('heart', 14).outerHTML}${escapeHTML(character.relation)}</div>` : ''}
      ${renderTagsHTML(character.tags, 'char-tag-mini') ? `<div class="char-detail-tags">${renderTagsHTML(character.tags, 'char-tag-mini')}</div>` : ''}
    </div>
    ${renderSection('人设', character.persona, 'memo')}
    ${renderSection('性格设定', character.personality, 'smile')}
    ${renderSection('说话方式', character.speechStyle, 'chat')}
    ${renderSection('背景故事', character.background, 'memo')}
    ${renderSection('问候语', character.greeting, 'chat')}
    <div class="char-detail-section">
      <div class="char-detail-section-title">${createIcon('settings', 18).outerHTML}温度</div>
      <div class="char-detail-temp-row">
        <div class="char-detail-temp-bar"><div class="char-detail-temp-fill" style="width:${Math.round(temp * 100)}%"></div></div>
        <span class="char-detail-temp-v">${temp.toFixed(2)}</span>
      </div>
    </div>
    <div class="char-detail-section">
      <div class="char-detail-section-title">${createIcon('memo', 18).outerHTML}TA 的相关数据</div>
      <div class="char-data-grid" id="char-dt-data"></div>
    </div>
  `;

  // 顶部按钮
  body.querySelector('#char-dt-back').addEventListener('click', () => { if (typeof onBack === 'function') onBack(); });
  body.querySelector('#char-dt-current').addEventListener('click', () => {
    if (isCurrent) { showToast('已经在和 TA 聊啦', 'default', 1200); return; }
    if (typeof onSetCurrent === 'function') onSetCurrent(character);
  });
  body.querySelector('#char-dt-export').addEventListener('click', () => exportCharacter(character));
  body.querySelector('#char-dt-edit').addEventListener('click', () => { if (typeof onEdit === 'function') onEdit(character); });
  body.querySelector('#char-dt-del').addEventListener('click', () => {
    // 不能删当前角色
    if (isCurrent) {
      showToast('先切换到别的角色再删嘛', 'error', 1600);
      return;
    }
    if (typeof onDelete === 'function') onDelete(character);
  });

  // 异步加载独立数据面板
  const dataEl = body.querySelector('#char-dt-data');
  await renderDataPanels(dataEl, character);
}

// ════════════════════════════════════════
// 渲染单个信息区块
// ════════════════════════════════════════

function renderSection(title, content, iconName) {
  const has = content && String(content).trim();
  return `
    <div class="char-detail-section">
      <div class="char-detail-section-title">${createIcon(iconName, 18).outerHTML}${escapeHTML(title)}</div>
      <div class="char-detail-section-content">${has ? escapeHTML(content) : '<span class="char-detail-section-empty">还没写呀</span>'}</div>
    </div>
  `;
}

// ════════════════════════════════════════
// 独立数据面板：记忆 / 聊天记录 / 钱包 / 朋友圈 / 记仇
// ════════════════════════════════════════

async function renderDataPanels(container, character) {
  if (!container) return;
  // 并行拉取所有数据，失败就给空
  const [memories, messages, moments, grudges] = await Promise.all([
    fetchMemories(character.id),
    fetchMessages(character.id),
    fetchMoments(character.name),
    fetchGrudges(character.id)
  ]);
  const walletBalance = fetchWalletBalance(character.id);

  // 收集每张卡片的数据 + 跳转回调，按顺序绑定
  const cards = [
    {
      html: renderDataCardHTML({
        iconName: 'memo', title: 'TA 的记忆',
        count: memories.length,
        sub: memories[0] ? truncate(memories[0].content, 40) : '还没有记忆呀',
        previewList: memories.slice(0, 5).map((m) => truncate(m.content, 50))
      }),
      onClick: () => openApp('memory-viewer', { deepLink: { characterId: character.id } })
    },
    {
      html: renderDataCardHTML({
        iconName: 'chat', title: 'TA 的聊天记录',
        count: messages.length,
        sub: messages[0] ? truncate(messages[0].content, 40) : '还没聊过呀',
        previewList: messages.slice(0, 5).map((m) => `${m.role === 'user' ? '我' : 'TA'}：${truncate(m.content, 40)}`)
      }),
      onClick: () => openApp('chat', { deepLink: { characterId: character.id } })
    },
    {
      html: renderDataCardHTML({
        iconName: 'wallet', title: 'TA 的钱包',
        countText: `${walletBalance} 金币`,
        sub: '点进去看看 TA 的收支明细'
      }),
      onClick: () => openApp('wallet', { deepLink: { characterId: character.id } })
    },
    {
      html: renderDataCardHTML({
        iconName: 'smile', title: 'TA 的朋友圈',
        count: moments.length,
        sub: moments[0] ? truncate(moments[0].content, 40) : 'TA 还没发过动态呀',
        previewList: moments.slice(0, 3).map((m) => truncate(m.content, 50))
      }),
      onClick: () => openApp('moments')
    },
    {
      html: renderDataCardHTML({
        iconName: 'heart', title: 'TA 的记仇',
        countText: `${grudges.unforgiven} 条没原谅`,
        sub: grudges.unforgiven > 0 ? '快去哄哄 TA 嘛' : 'TA 现在没在生气啦'
      }),
      onClick: () => openApp('grudge', { deepLink: { characterId: character.id } })
    }
  ];

  container.innerHTML = cards.map((c) => c.html).join('');
  // 按顺序绑定跳转
  const cardEls = container.querySelectorAll('.char-data-card');
  cardEls.forEach((el, i) => {
    const handler = cards[i] && cards[i].onClick;
    if (typeof handler === 'function') {
      el.addEventListener('click', handler);
    }
  });
}

function renderDataCardHTML({ iconName, title, count, countText, sub, previewList }) {
  const countHTML = countText
    ? `<span class="char-data-card-count">${escapeHTML(countText)}</span>`
    : (typeof count === 'number' ? `<span class="char-data-card-count">${count} 条</span>` : '');
  const previewHTML = (Array.isArray(previewList) && previewList.length)
    ? `<div class="char-data-preview-list">${previewList.map((p) => `<div class="char-data-preview-item">${escapeHTML(p)}</div>`).join('')}</div>`
    : '';
  return `
    <button class="char-data-card" type="button">
      <div class="char-data-card-icon">${createIcon(iconName, 20).outerHTML}</div>
      <div class="char-data-card-main">
        <div class="char-data-card-title">${escapeHTML(title)}</div>
        <div class="char-data-card-sub">${escapeHTML(sub || '')}</div>
        ${previewHTML}
      </div>
      ${countHTML}
      <div class="char-data-card-arrow">${createIcon('next', 18).outerHTML}</div>
    </button>
  `;
}

// ════════════════════════════════════════
// 数据抓取（每个都容错，失败返回空）
// ════════════════════════════════════════

async function fetchMemories(characterId) {
  try {
    const list = await getMemories(characterId);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn('[characters] 读取记忆失败', e);
    return [];
  }
}

async function fetchMessages(characterId) {
  try {
    const all = await getAllDB(STORES.messages);
    if (!Array.isArray(all)) return [];
    const filtered = all.filter((m) => m.characterId === characterId);
    // 按 createdAt 倒序
    filtered.sort((a, b) => {
      const ta = new Date(a.createdAt || a.timestamp || 0).getTime();
      const tb = new Date(b.createdAt || b.timestamp || 0).getTime();
      return tb - ta;
    });
    return filtered;
  } catch (e) {
    console.warn('[characters] 读取消息失败', e);
    return [];
  }
}

async function fetchMoments(characterName) {
  if (!characterName) return [];
  try {
    const all = await getAllDB(STORES.moments);
    if (!Array.isArray(all)) return [];
    const filtered = all.filter((m) => m.author === characterName);
    filtered.sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    });
    return filtered;
  } catch (e) {
    console.warn('[characters] 读取朋友圈失败', e);
    return [];
  }
}

async function fetchGrudges(characterId) {
  try {
    const all = await getAllDB(STORES.grudges);
    if (!Array.isArray(all)) return { all: [], unforgiven: 0 };
    const filtered = all.filter((g) => g.characterId === characterId);
    const unforgiven = filtered.filter((g) => !g.forgiven).length;
    return { all: filtered, unforgiven };
  } catch (e) {
    console.warn('[characters] 读取记仇失败', e);
    return { all: [], unforgiven: 0 };
  }
}

// 钱包余额：兼容 wallet 增强后的角色独立余额字段
// walletState 结构可能为 {balance, transactions, characterBalances:{[id]:number}}
// 没有角色独立余额时回退到全局余额
function fetchWalletBalance(characterId) {
  try {
    const s = getData(KEYS.walletState, null);
    if (!s || typeof s !== 'object') return 0;
    if (s.characterBalances && Object.prototype.hasOwnProperty.call(s.characterBalances, characterId)) {
      return Number(s.characterBalances[characterId]) || 0;
    }
    return Number(s.balance) || 0;
  } catch (e) {
    return 0;
  }
}
