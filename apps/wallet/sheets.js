// apps/wallet/sheets.js
// 钱包 App 的弹层表单——我都收在这啦。
// 包含：记一笔（手动收支）、转账（我和她之间）、改余额、角色选择列表。
// 红线：图标只走 createIcon（SVG 线稿）；视觉值走 CSS 变量；全中文注释 + 第一人称软萌文案。
// 依赖：core/ui.js, core/util.js, ./panels.js（复用工具与常量）

import { showToast, showConfirm, showBottomSheet, showAlert, createIcon } from '../../core/ui.js';
import {
  CATEGORIES,
  escapeHTML,
  escapeAttr,
  formatMoney,
  charName,
  renderPickAvatar
} from './panels.js';

// ════════════════════════════════════════
// 记一笔（手动收支，不涉及角色）
// ════════════════════════════════════════

export function openEditor({ prefill = null, onSave } = {}) {
  const init = prefill || { type: 'expense', amount: '', category: CATEGORIES[0], note: '' };
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="wallet-form-row">
      <label class="wallet-form-label">类型</label>
      <div class="wallet-type-toggle">
        <button type="button" class="wallet-type-btn income ${init.type === 'income' ? 'active' : ''}" data-type="income">${createIcon('plus', 16).outerHTML}收入</button>
        <button type="button" class="wallet-type-btn expense ${init.type === 'expense' ? 'active' : ''}" data-type="expense">${createIcon('minus', 16).outerHTML}支出</button>
      </div>
    </div>
    <div class="wallet-form-row">
      <label class="wallet-form-label" for="wallet-amount">金额</label>
      <input class="input" id="wallet-amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="花掉或收到多少呀" value="${escapeAttr(String(init.amount))}">
    </div>
    <div class="wallet-form-row">
      <label class="wallet-form-label" for="wallet-category">分类</label>
      <select class="select" id="wallet-category">
        ${CATEGORIES.map((c) => `<option value="${escapeAttr(c)}" ${c === init.category ? 'selected' : ''}>${escapeHTML(c)}</option>`).join('')}
      </select>
    </div>
    <div class="wallet-form-row">
      <label class="wallet-form-label" for="wallet-note">备注</label>
      <textarea class="textarea" id="wallet-note" placeholder="想记点什么都可以写呀..." maxlength="200">${escapeHTML(init.note || '')}</textarea>
    </div>
    <button class="btn primary block" id="wallet-save">记下来</button>
  `;
  const sheet = showBottomSheet({
    title: '记一笔新的收支',
    bodyElement: body,
    dismissible: true
  });
  let chosenType = init.type === 'income' ? 'income' : 'expense';
  body.querySelectorAll('.wallet-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      chosenType = btn.dataset.type;
      body.querySelectorAll('.wallet-type-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
  body.querySelector('#wallet-save').addEventListener('click', () => {
    const amountRaw = body.querySelector('#wallet-amount').value.trim();
    const amount = parseFloat(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('金额得是个正数嘛', 'error');
      return;
    }
    const category = body.querySelector('#wallet-category').value || '其他';
    const note = body.querySelector('#wallet-note').value.trim();
    sheet.close();
    if (typeof onSave === 'function') {
      onSave({
        type: chosenType,
        amount: Math.round(amount * 100) / 100,
        category,
        note
      });
    }
  });
  setTimeout(() => { try { body.querySelector('#wallet-amount')?.focus(); } catch (e) {} }, 60);
  return sheet;
}

// ════════════════════════════════════════
// 转账（我转给她 / 她转给我）
// ════════════════════════════════════════

export function openTransfer({ character, userBalance, charBalance, onConfirm } = {}) {
  const name = charName(character);
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="wallet-form-row">
      <label class="wallet-form-label">方向</label>
      <div class="wallet-type-toggle">
        <button type="button" class="wallet-type-btn expense active" data-dir="out">${createIcon('gift', 16).outerHTML}我转给她</button>
        <button type="button" class="wallet-type-btn income" data-dir="in">${createIcon('download', 16).outerHTML}她转给我</button>
      </div>
    </div>
    <div class="wallet-form-row">
      <label class="wallet-form-label" for="wallet-tx-amount">金额</label>
      <input class="input" id="wallet-tx-amount" type="number" inputmode="decimal" min="0" step="0.01" placeholder="转多少呀" value="">
    </div>
    <div class="wallet-form-row">
      <label class="wallet-form-label" for="wallet-tx-note">备注（可选）</label>
      <input class="input" id="wallet-tx-note" type="text" maxlength="60" placeholder="想跟她说点什么..." value="">
    </div>
    <div class="wallet-transfer-preview" id="wallet-tx-preview"></div>
    <button class="btn primary block" id="wallet-tx-save">转账给她</button>
  `;
  const sheet = showBottomSheet({
    title: `给${name}转账`,
    bodyElement: body,
    dismissible: true
  });

  // 默认我转给她（out）
  let dir = 'out';
  const amountInput = body.querySelector('#wallet-tx-amount');
  const noteInput = body.querySelector('#wallet-tx-note');
  const previewEl = body.querySelector('#wallet-tx-preview');
  const saveBtn = body.querySelector('#wallet-tx-save');

  function refreshPreview() {
    const raw = amountInput.value.trim();
    const amt = parseFloat(raw);
    const valid = Number.isFinite(amt) && amt > 0;
    const a = valid ? amt : 0;
    if (dir === 'out') {
      const newUser = Number(userBalance) - a;
      const newChar = Number(charBalance) + a;
      previewEl.innerHTML = valid
        ? `我的余额 <b>${formatMoney(userBalance)}</b> 变成 <b>${formatMoney(newUser)}</b><br>${escapeHTML(name)}的零花钱 <b>${formatMoney(charBalance)}</b> 变成 <b>${formatMoney(newChar)}</b>`
        : `我的余额 <b>${formatMoney(userBalance)}</b>，${escapeHTML(name)}的零花钱 <b>${formatMoney(charBalance)}</b>`;
      saveBtn.textContent = `转给${name}`;
    } else {
      const newUser = Number(userBalance) + a;
      const newChar = Number(charBalance) - a;
      previewEl.innerHTML = valid
        ? `${escapeHTML(name)}的零花钱 <b>${formatMoney(charBalance)}</b> 变成 <b>${formatMoney(newChar)}</b><br>我的余额 <b>${formatMoney(userBalance)}</b> 变成 <b>${formatMoney(newUser)}</b>`
        : `${escapeHTML(name)}的零花钱 <b>${formatMoney(charBalance)}</b>，我的余额 <b>${formatMoney(userBalance)}</b>`;
      saveBtn.textContent = `${name}转给我`;
    }
  }

  body.querySelectorAll('.wallet-type-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      dir = btn.dataset.dir;
      body.querySelectorAll('.wallet-type-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      refreshPreview();
    });
  });
  amountInput.addEventListener('input', refreshPreview);
  refreshPreview();

  saveBtn.addEventListener('click', () => {
    const amountRaw = amountInput.value.trim();
    const amount = parseFloat(amountRaw);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast('金额得是个正数嘛', 'error');
      return;
    }
    const fromUser = dir === 'out';
    // 余额不足提示
    if (fromUser && amount > Number(userBalance)) {
      showAlert({ title: '余额不够嘛', body: '小金库里没那么多啦，先记一笔收入吧', okText: '知道啦' });
      return;
    }
    if (!fromUser && amount > Number(charBalance)) {
      showAlert({ title: '余额不够嘛', body: `${name}的零花钱没那么多啦`, okText: '知道啦' });
      return;
    }
    const note = noteInput.value.trim();
    sheet.close();
    if (typeof onConfirm === 'function') {
      onConfirm({ amount: Math.round(amount * 100) / 100, note, fromUser });
    }
  });
  setTimeout(() => { try { amountInput?.focus(); } catch (e) {} }, 60);
  return sheet;
}

// ════════════════════════════════════════
// 改余额（直接覆盖 globalBalance）
// ════════════════════════════════════════

export function openEditBalance({ current, onConfirm } = {}) {
  const body = document.createElement('div');
  body.innerHTML = `
    <div class="wallet-form-row">
      <label class="wallet-form-label" for="wallet-bal-input">新的余额</label>
      <input class="input" id="wallet-bal-input" type="number" inputmode="decimal" step="0.01" placeholder="填一个数字呀" value="${escapeAttr(String(current ?? ''))}">
    </div>
    <div class="wallet-transfer-preview">直接改小金库的数字，想调成多少都行～</div>
    <button class="btn primary block" id="wallet-bal-save">保存</button>
  `;
  const sheet = showBottomSheet({
    title: '改一下余额',
    bodyElement: body,
    dismissible: true
  });
  const input = body.querySelector('#wallet-bal-input');
  body.querySelector('#wallet-bal-save').addEventListener('click', () => {
    const raw = input.value.trim();
    const val = parseFloat(raw);
    if (!Number.isFinite(val)) {
      showToast('得填一个数字嘛', 'error');
      return;
    }
    sheet.close();
    if (typeof onConfirm === 'function') {
      onConfirm(Math.round(val * 100) / 100);
    }
  });
  setTimeout(() => { try { input?.focus(); } catch (e) {} }, 60);
  return sheet;
}

// ════════════════════════════════════════
// 通用角色选择列表（用于「她转给我」时选谁转过来，预留扩展）
// ════════════════════════════════════════

export function openCharPicker({ characters = [], title = '选一个小伙伴', subtitle = '', onPick } = {}) {
  const body = document.createElement('div');
  if (characters.length === 0) {
    body.innerHTML = `
      <div class="empty-state" style="padding:24px 8px">
        <div class="wallet-empty-icon">${createIcon('smile', 48).outerHTML}</div>
        <div class="empty-state-text">还没有小伙伴呢</div>
      </div>
    `;
  } else {
    body.innerHTML = (subtitle ? `<div class="wallet-pick-sub" style="margin-bottom:6px">${escapeHTML(subtitle)}</div>` : '')
      + characters.map((c) => `
        <button class="wallet-pick-item" data-pick="${escapeAttr(c.id)}">
          ${renderPickAvatar(c, 40)}
          <div class="wallet-pick-main">
            <div class="wallet-pick-name">${escapeHTML(charName(c))}</div>
          </div>
          ${createIcon('next', 18).outerHTML}
        </button>
      `).join('');
  }
  const sheet = showBottomSheet({ title, bodyElement: body, dismissible: true });
  body.querySelectorAll('.wallet-pick-item').forEach((btn) => {
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

// 复用：删除交易的二次确认
export function confirmDeleteTx(onConfirm) {
  showConfirm({
    title: '删掉这笔记录吗？',
    body: '删掉后余额会重新算哦，确定就点确认嘛',
    confirmText: '删掉吧',
    cancelText: '再想想',
    danger: true,
    onConfirm
  });
}
