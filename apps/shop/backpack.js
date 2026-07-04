// apps/shop/backpack.js
// 商店 App 的背包与赠礼——买下来的东西都揣这儿，随时送给她。
// 数据：
//   STORES.inventory {id, itemId, name, icon, source, boughtAt, givenTo}
//   STORES.gifts     {id, characterId, itemName, itemIcon, itemId, from, note, createdAt}
// 红线：图标只走 createIcon（SVG 线稿）；视觉值走 CSS 变量；全中文注释 + 第一人称软萌文案。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/util.js, ./products.js（复用工具）

import { STORES } from '../../core/storage-keys.js';
import { getAllDB, deleteDB } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon } from '../../core/ui.js';
import { formatRelative } from '../../core/util.js';
import {
  escapeHTML,
  escapeAttr,
  cssEscape,
  charName,
  renderPickAvatar
} from './products.js';

// ════════════════════════════════════════
// 背包（bottomSheet）
// ════════════════════════════════════════

export async function openBackpack({ onGive, onDrop } = {}) {
  let items = [];
  try {
    items = await getAllDB(STORES.inventory);
  } catch (e) {
    console.warn('[shop] 读取背包失败', e);
    showToast('背包打不开嘛，等一下再试', 'error');
    return null;
  }
  items.sort((a, b) => {
    const ta = new Date(a.boughtAt || a.createdAt || 0).getTime();
    const tb = new Date(b.boughtAt || b.createdAt || 0).getTime();
    return tb - ta;
  });

  const body = document.createElement('div');
  const sheet = showBottomSheet({
    title: '我的背包',
    bodyElement: body,
    dismissible: true
  });
  renderBagBody(body, items, sheet, { onGive, onDrop });
  return sheet;
}

function renderBagBody(body, items, sheet, ctx) {
  if (!items || items.length === 0) {
    body.innerHTML = `
      <div class="empty-state" style="padding:32px 12px">
        <div class="shop-empty-icon">${createIcon('gift', 48).outerHTML}</div>
        <div class="empty-state-text">还没有买过东西呢</div>
      </div>
    `;
    return;
  }
  body.innerHTML = items.map(renderBagItem).join('');

  // 送给她：弹出角色选择，选完触发 onGive
  body.querySelectorAll('.shop-bag-btn.gift').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const it = items.find((x) => x.id === id);
      if (!it) return;
      const characters = await loadCharacters();
      openCharPicker({
        characters,
        title: `把${it.name}送给谁`,
        subtitle: '选一个小伙伴送出去',
        onPick: (c) => {
          if (typeof ctx.onGive === 'function') ctx.onGive(it, c);
          // 从内存与 DOM 移除该物品
          const idx = items.findIndex((x) => x.id === id);
          if (idx >= 0) items.splice(idx, 1);
          const row = body.querySelector(`[data-bag-id="${cssEscape(id)}"]`);
          if (row) row.remove();
          if (items.length === 0) renderBagBody(body, items, sheet, ctx);
        }
      });
    });
  });

  // 丢弃：confirm 后 deleteDB，并从 DOM 移除该行
  body.querySelectorAll('.shop-bag-btn.drop').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const it = items.find((x) => x.id === id);
      if (!it) return;
      showConfirm({
        title: '丢掉这个吗？',
        body: `丢掉${it.name}就找不回来啦`,
        confirmText: '丢掉吧',
        cancelText: '留着',
        danger: true,
        onConfirm: async () => {
          try {
            await deleteDB(STORES.inventory, id);
            const idx = items.findIndex((x) => x.id === id);
            if (idx >= 0) items.splice(idx, 1);
            const row = body.querySelector(`[data-bag-id="${cssEscape(id)}"]`);
            if (row) row.remove();
            if (items.length === 0) renderBagBody(body, items, sheet, ctx);
            showToast('丢掉啦', 'default', 1000);
          } catch (e) {
            console.warn('[shop] 丢弃失败', e);
            showToast('没丢掉，再试一下嘛', 'error');
          }
        }
      });
    });
  });
}

function renderBagItem(it) {
  const name = escapeHTML(it.name || '神秘物品');
  const icon = createIcon(it.icon || 'gift', 20).outerHTML;
  const time = escapeHTML(formatRelative(it.boughtAt || it.createdAt));
  return `
    <div class="shop-bag-item" data-bag-id="${escapeAttr(it.id)}">
      <div class="shop-bag-icon">${icon}</div>
      <div class="shop-bag-main">
        <div class="shop-bag-name">${name}</div>
        <div class="shop-bag-time">${time}</div>
      </div>
      <div class="shop-bag-actions">
        <button class="shop-bag-btn gift" data-id="${escapeAttr(it.id)}">${createIcon('heart', 14).outerHTML}送给她</button>
        <button class="shop-bag-btn drop" data-id="${escapeAttr(it.id)}" aria-label="丢弃${escapeAttr(it.name)}">${createIcon('trash', 14).outerHTML}</button>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════
// 角色选择（赠礼目标）
// ════════════════════════════════════════

async function loadCharacters() {
  try {
    const list = await getAllDB(STORES.characters);
    return Array.isArray(list) ? list : [];
  } catch (e) {
    console.warn('[shop] 读取角色失败', e);
    return [];
  }
}

export function openCharPicker({ characters = [], title = '选一个小伙伴', subtitle = '', onPick } = {}) {
  const body = document.createElement('div');
  if (characters.length === 0) {
    body.innerHTML = `
      <div class="empty-state" style="padding:24px 8px">
        <div class="shop-empty-icon">${createIcon('smile', 48).outerHTML}</div>
        <div class="empty-state-text">还没有小伙伴呢，先去角色 App 加一个吧</div>
      </div>
    `;
  } else {
    body.innerHTML = (subtitle ? `<div class="shop-pick-sub" style="margin-bottom:6px">${escapeHTML(subtitle)}</div>` : '')
      + characters.map((c) => `
        <button class="shop-pick-item" data-pick="${escapeAttr(c.id)}">
          ${renderPickAvatar(c, 40)}
          <div class="shop-pick-main">
            <div class="shop-pick-name">${escapeHTML(charName(c))}</div>
          </div>
          ${createIcon('next', 18).outerHTML}
        </button>
      `).join('');
  }
  const sheet = showBottomSheet({ title, bodyElement: body, dismissible: true });
  body.querySelectorAll('.shop-pick-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.pick;
      const c = characters.find((x) => x.id === id);
      if (!c) return;
      sheet.close();
      if (typeof onPick === 'function') onPick(c);
    });
  });
  return sheet;
}
