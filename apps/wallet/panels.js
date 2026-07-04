// apps/wallet/panels.js
// 钱包 App 的渲染层 + 共用小工具——我都收在这啦。
// 包含：常量、HTML 转义、金额格式化、角色头像、Hero / 角色面板 / 筛选条 / 交易列表 的 HTML 拼装。
// 红线：图标只走 createIcon（SVG 线稿）；视觉值走 CSS 变量；全中文注释 + 第一人称软萌文案。
// 依赖：core/ui.js, core/util.js

import { createIcon } from '../../core/ui.js';
import { formatRelative, isUsableImage } from '../../core/util.js';

// ════════════════════════════════════════
// 常量
// ════════════════════════════════════════

// 手动记一笔时可选的分类（转账走单独的「转账」分类，不在这里选）
export const CATEGORIES = ['餐饮', '交通', '购物', '工资', '红包', '其他'];
// 首次进入赠送的零花钱
export const INITIAL_BALANCE = 1000;
export const INITIAL_NOTE = '初次见面的零花钱';
// 每个 AI 角色首次显示时赠送的零花钱
export const INITIAL_CHAR_BALANCE = 5000;

// ════════════════════════════════════════
// 共用小工具
// ════════════════════════════════════════

export function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
export function escapeAttr(s) { return escapeHTML(s); }

export function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, '\\$&');
}

// 金额格式化：保留两位小数 + 千分位 + 负号
export function formatMoney(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  const s = abs.toFixed(2);
  const [int, dec] = s.split('.');
  const withSep = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${withSep}.${dec}`;
}

// 角色显示名（昵称优先，其次名字，兜底「她」）
export function charName(char) {
  if (!char) return '她';
  return char.nickname || char.name || '她';
}

// 角色头像 HTML（有图走图，没图走 smile 线稿图标，绝不用 emoji）
export function renderCharAvatar(char, size = 42) {
  if (char && isUsableImage(char.avatar)) {
    return `<div class="wallet-char-avatar" style="background-image:url('${escapeAttr(char.avatar)}')"></div>`;
  }
  return `<div class="wallet-char-avatar">${createIcon('smile', Math.round(size * 0.55)).outerHTML}</div>`;
}

// 角色选择列表里的小头像（同上风格，更小一点）
export function renderPickAvatar(char, size = 40) {
  if (char && isUsableImage(char.avatar)) {
    return `<div class="wallet-pick-avatar" style="background-image:url('${escapeAttr(char.avatar)}')"></div>`;
  }
  return `<div class="wallet-pick-avatar">${createIcon('smile', Math.round(size * 0.55)).outerHTML}</div>`;
}

// 本月收支统计（按 type 累加，转账交易也属于 income/expense，会自动算进去）
export function monthStats(transactions) {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  let income = 0, expense = 0;
  transactions.forEach((t) => {
    const d = new Date(t.createdAt);
    if (Number.isNaN(d.getTime())) return;
    if (d.getFullYear() === y && d.getMonth() === m) {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') income += amt;
      else expense += amt;
    }
  });
  return { income, expense };
}

// ════════════════════════════════════════
// Hero（顶部大卡片：用户余额 + 编辑 + 本月收支）
// ════════════════════════════════════════

export function renderHero(state, stats) {
  const neg = Number(state.globalBalance) < 0;
  return `
    <div class="wallet-hero">
      <div class="wallet-hero-label">小金库余额</div>
      <div class="wallet-hero-row">
        <div class="wallet-hero-balance ${neg ? 'neg' : ''}">${formatMoney(state.globalBalance)}</div>
        <button class="wallet-hero-edit" id="wallet-edit-balance" aria-label="改一下余额" title="改一下余额">${createIcon('edit', 16).outerHTML}</button>
      </div>
      <div class="wallet-hero-stats">
        <div class="wallet-stat">
          <div class="wallet-stat-label">本月收入</div>
          <div class="wallet-stat-value income">+${formatMoney(stats.income)}</div>
        </div>
        <div class="wallet-stat">
          <div class="wallet-stat-label">本月支出</div>
          <div class="wallet-stat-value expense">-${formatMoney(stats.expense)}</div>
        </div>
      </div>
    </div>
  `;
}

// ════════════════════════════════════════
// 她的零钱包（角色独立余额面板）
// ════════════════════════════════════════

export function renderCharPanel(characters, state) {
  if (!characters || characters.length === 0) {
    return `
      <div class="wallet-section-title">${createIcon('heart', 16).outerHTML}她的零钱包</div>
      <div class="wallet-char-empty">还没有小伙伴呢，去角色 App 里加一个吧</div>
    `;
  }
  const cards = characters.map((c) => {
    const bal = Number(state.characters?.[c.id]) || 0;
    return `
      <div class="wallet-char" data-char-id="${escapeAttr(c.id)}">
        ${renderCharAvatar(c, 42)}
        <div class="wallet-char-main">
          <div class="wallet-char-name">${escapeHTML(charName(c))}</div>
          <div class="wallet-char-balance">零花钱 <b>${formatMoney(bal)}</b></div>
        </div>
        <button class="wallet-char-transfer" data-transfer="${escapeAttr(c.id)}">${createIcon('gift', 14).outerHTML}转账</button>
      </div>
    `;
  }).join('');
  return `
    <div class="wallet-section-title">${createIcon('heart', 16).outerHTML}她的零钱包</div>
    ${cards}
  `;
}

// ════════════════════════════════════════
// 筛选条（全部 / 收入 / 支出 + 按角色）
// ════════════════════════════════════════

export function renderFilters(filter, characters) {
  const base = [
    { id: 'all', label: '全部' },
    { id: 'income', label: '收入' },
    { id: 'expense', label: '支出' }
  ];
  const baseHTML = base.map((f) => `
    <button class="wallet-filter ${filter === f.id ? 'active' : ''}" data-filter="${escapeAttr(f.id)}">${escapeHTML(f.label)}</button>
  `).join('');
  if (!characters || characters.length === 0) {
    return `<div class="wallet-filters">${baseHTML}</div>`;
  }
  const sep = `<div class="wallet-filter-sep" aria-hidden="true"></div>`;
  const charChips = characters.map((c) => `
    <button class="wallet-filter char ${filter === 'char:' + c.id ? 'active' : ''}" data-filter="char:${escapeAttr(c.id)}">${escapeHTML(charName(c))}</button>
  `).join('');
  return `<div class="wallet-filters">${baseHTML}${sep}${charChips}</div>`;
}

// ════════════════════════════════════════
// 交易列表
// ════════════════════════════════════════

export function renderTxList(txs, charMap) {
  if (!txs || txs.length === 0) {
    return `
      <div class="empty-state">
        <div class="wallet-empty-icon">${createIcon('wallet', 48).outerHTML}</div>
        <div class="empty-state-text">还没有收支记录，记一笔嘛</div>
      </div>
    `;
  }
  return txs.map((t) => renderTxCard(t, charMap)).join('');
}

export function renderTxCard(t, charMap) {
  const type = t.type === 'expense' ? 'expense' : 'income';
  // 转账交易用单独的图标色调，普通收支用 plus / minus
  const isTransfer = !!t.characterId && t.fromUser !== undefined;
  const iconName = type === 'income' ? 'plus' : 'minus';
  const iconCls = isTransfer ? 'transfer' : type;
  const icon = createIcon(iconName, 18).outerHTML;
  const sign = type === 'income' ? '+' : '-';
  const amt = formatMoney(Number(t.amount) || 0);
  // 备注：转账默认文案，普通交易默认文案
  const note = t.note
    ? escapeHTML(t.note)
    : (isTransfer
      ? (t.fromUser ? '转给她' : '她转给我')
      : (type === 'income' ? '收到一笔' : '花掉一笔'));
  const category = escapeHTML(t.category || '其他');
  const time = escapeHTML(formatRelative(t.createdAt));
  // 涉及的角色名（若有）
  const char = t.characterId && charMap ? charMap.get(t.characterId) : null;
  const charLabel = char ? escapeHTML(charName(char)) : '';
  const trash = createIcon('trash', 16).outerHTML;
  const metaParts = [`<span>${category}</span>`];
  if (charLabel) metaParts.push(`<span>${charLabel}</span>`);
  metaParts.push(`<span>${time}</span>`);
  return `
    <div class="wallet-tx" data-id="${escapeAttr(t.id)}">
      <div class="wallet-tx-icon ${iconCls}">${icon}</div>
      <div class="wallet-tx-main">
        <div class="wallet-tx-note">${note}</div>
        <div class="wallet-tx-meta">${metaParts.join('')}</div>
      </div>
      <div class="wallet-tx-amount ${type}">${sign}${amt}</div>
      <button class="wallet-tx-del" data-del="${escapeAttr(t.id)}" aria-label="删除这笔记录" title="删除">${trash}</button>
    </div>
  `;
}

// 给交易列表绑定删除按钮（点击触发 onDelete）
export function bindTxEvents(listEl, txs, onDelete) {
  if (!listEl) return;
  listEl.querySelectorAll('.wallet-tx-del').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.del;
      if (id) onDelete(id);
    });
  });
}
