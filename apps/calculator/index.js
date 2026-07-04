// apps/calculator/index.js
// 计算器 App——Phase 1 真实可用版。
// 对齐：Soulver（自然语言计算器，但 Phase 1 先做基础四则运算）。
// 功能：
//   1) 4x5 键盘：数字 / 四则运算 / 等于 / 清空 / 正负 / 百分比 / 小数点
//   2) 安全求值（无 eval，手写状态机）
//   3) 历史记录持久化到 localStorage，最多 50 条
//   4) 可爱第一人称文案
//   5) 全部视觉值走 CSS 变量（已用 .calc-* 类）
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js

import { KEYS } from '../../core/storage-keys.js';
import { getData, setData } from '../../core/storage.js';
import { showToast, createIcon, showBottomSheet } from '../../core/ui.js';
import bus from '../../core/events.js';

let containerEl = null;
let ctxRef = null;
let keydownListener = null;

// 计算器状态机
//   display: 当前显示的字符串（用户正在输入）
//   accumulator: 上一步累积的数值（按下运算符时把 display 转成数存起来）
//   operator: 待执行的运算符 (+ - × ÷)
//   justEvaluated: 刚刚按完 = 后，下次按数字会清空 display
let state = { display: '0', accumulator: null, operator: null, justEvaluated: false };

const MAX_HISTORY = 50;

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  ctxRef = context;
  state = { display: '0', accumulator: null, operator: null, justEvaluated: false };

  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="calc-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">计算器</div>
      <button class="app-history" id="calc-history-btn" aria-label="看看历史记录">${createIcon('calendar', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="calc-body">
      <div class="calc-display" id="calc-display" aria-live="polite">0</div>
      <div class="calc-keys" id="calc-keys"></div>
    </div>
  `;

  container.querySelector('#calc-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#calc-history-btn').addEventListener('click', openHistorySheet);

  renderKeys();
  updateDisplay();

  // 键盘可达（桌面调试也舒服）
  keydownListener = (e) => handleKeydown(e);
  window.addEventListener('keydown', keydownListener);
}

export function unmount() {
  if (keydownListener) {
    window.removeEventListener('keydown', keydownListener);
    keydownListener = null;
  }
  containerEl = null;
  ctxRef = null;
}

// ════════════════════════════════════════
// 键盘渲染
// ════════════════════════════════════════

const KEY_LAYOUT = [
  { label: 'C',   type: 'fn', action: 'clear' },
  { label: '±',    type: 'fn', action: 'negate' },
  { label: '%',    type: 'fn', action: 'percent' },
  { label: '÷',    type: 'op', action: 'op', op: '÷' },
  { label: '7',    type: 'num', val: '7' },
  { label: '8',    type: 'num', val: '8' },
  { label: '9',    type: 'num', val: '9' },
  { label: '×',    type: 'op', action: 'op', op: '×' },
  { label: '4',    type: 'num', val: '4' },
  { label: '5',    type: 'num', val: '5' },
  { label: '6',    type: 'num', val: '6' },
  { label: '−',    type: 'op', action: 'op', op: '−' },
  { label: '1',    type: 'num', val: '1' },
  { label: '2',    type: 'num', val: '2' },
  { label: '3',    type: 'num', val: '3' },
  { label: '+',    type: 'op', action: 'op', op: '+' },
  { label: '0',    type: 'num', val: '0', wide: true },
  { label: '.',    type: 'num', val: '.' },
  { label: '=',    type: 'eq', action: 'equals' }
];

function renderKeys() {
  const wrap = containerEl.querySelector('#calc-keys');
  wrap.innerHTML = '';
  KEY_LAYOUT.forEach((k) => {
    const btn = document.createElement('button');
    btn.className = `calc-key ${k.type}`;
    btn.textContent = k.label;
    btn.setAttribute('aria-label', k.label);
    if (k.wide) {
      btn.style.gridColumn = 'span 2';
    }
    btn.addEventListener('click', () => onKey(k));
    wrap.appendChild(btn);
  });
}

// ══════════════════════════════════════════════════════════════
// 状态机逻辑
// 不用 eval，手写四则运算状态机。支持链式输入（按 1 + 2 + 3 = 6）。
// ══════════════════════════════════════════════════════════════

function onKey(k) {
  if (k.type === 'num') inputDigit(k.val);
  else if (k.action === 'op') inputOperator(k.op);
  else if (k.action === 'equals') inputEquals();
  else if (k.action === 'clear') inputClear();
  else if (k.action === 'negate') inputNegate();
  else if (k.action === 'percent') inputPercent();
  updateDisplay();
}

function inputDigit(d) {
  // 刚按完 = 或刚按完运算符，新数字要重置 display
  if (state.justEvaluated) {
    state.display = (d === '.') ? '0.' : d;
    state.justEvaluated = false;
    return;
  }
  if (state.display === '0' && d !== '.') {
    state.display = d;
  } else if (d === '.') {
    if (!state.display.includes('.')) state.display += '.';
  } else {
    // 防止输入过长
    if (state.display.replace('-', '').replace('.', '').length < 14) {
      state.display += d;
    }
  }
}

function inputOperator(op) {
  const cur = parseNumber(state.display);
  if (state.accumulator === null) {
    // 第一次按运算符
    state.accumulator = cur;
  } else if (state.operator && !state.justEvaluated) {
    // 链式：先算出之前的
    const result = compute(state.accumulator, cur, state.operator);
    if (result === null) return; // 除零已经被 toast 过
    state.accumulator = result;
  }
  state.operator = op;
  state.justEvaluated = true; // 下一个数字会重置 display
}

function inputEquals() {
  if (state.operator === null || state.accumulator === null) return;
  const cur = parseNumber(state.display);
  const expr = `${formatNumber(state.accumulator)} ${state.operator} ${formatNumber(cur)}`;
  const result = compute(state.accumulator, cur, state.operator);
  if (result === null) return;
  appendHistory({ expr, result });
  state.display = formatNumber(result);
  state.accumulator = null;
  state.operator = null;
  state.justEvaluated = true;
}

function inputClear() {
  state = { display: '0', accumulator: null, operator: null, justEvaluated: false };
  showToast('清空啦，重新开始算吧', 'default', 1200);
}

function inputNegate() {
  if (state.display === '0') return;
  if (state.display.startsWith('-')) state.display = state.display.slice(1);
  else state.display = '-' + state.display;
}

function inputPercent() {
  const cur = parseNumber(state.display);
  const result = cur / 100;
  state.display = formatNumber(result);
  state.justEvaluated = true;
}

function parseNumber(s) {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(n) {
  if (!Number.isFinite(n)) return '0';
  // 避免浮点尾巴（0.1 + 0.2 = 0.30000000000000004）
  const rounded = Math.round(n * 1e10) / 1e10;
  // 太大用指数
  if (Math.abs(rounded) >= 1e14) return rounded.toExponential(6);
  let s = String(rounded);
  // 限制显示长度
  if (s.replace('-', '').replace('.', '').length > 14) {
    s = rounded.toPrecision(12).replace(/\.?0+$/, '');
  }
  return s;
}

function compute(a, b, op) {
  let r;
  switch (op) {
    case '+': r = a + b; break;
    case '−': r = a - b; break;
    case '×': r = a * b; break;
    case '÷':
      if (b === 0) {
        showToast('哎呀，零不能做除数呀', 'error', 1600);
        return null;
      }
      r = a / b; break;
    default: return null;
  }
  if (!Number.isFinite(r)) {
    showToast('算不出来啦，这个数字好奇怪', 'error', 1600);
    return null;
  }
  return r;
}

function updateDisplay() {
  const el = containerEl.querySelector('#calc-display');
  if (!el) return;
  el.textContent = state.display;
}

// ════════════════════════════════════════
// 键盘事件
// ════════════════════════════════════════

function handleKeydown(e) {
  const k = e.key;
  if (/^[0-9]$/.test(k)) { inputDigit(k); updateDisplay(); e.preventDefault(); return; }
  if (k === '.') { inputDigit('.'); updateDisplay(); e.preventDefault(); return; }
  if (k === '+' || k === '-') { inputOperator(k === '-' ? '−' : '+'); updateDisplay(); e.preventDefault(); return; }
  if (k === '*') { inputOperator('×'); updateDisplay(); e.preventDefault(); return; }
  if (k === '/') { inputOperator('÷'); updateDisplay(); e.preventDefault(); return; }
  if (k === 'Enter' || k === '=') { inputEquals(); updateDisplay(); e.preventDefault(); return; }
  if (k === 'Escape' || k === 'c' || k === 'C') { inputClear(); updateDisplay(); e.preventDefault(); return; }
  if (k === 'Backspace') {
    if (state.justEvaluated) { inputClear(); }
    else if (state.display.length > 1) {
      state.display = state.display.slice(0, -1);
      if (state.display === '-' || state.display === '') state.display = '0';
    } else {
      state.display = '0';
    }
    updateDisplay();
    e.preventDefault();
  }
}

// ════════════════════════════════════════
// 历史记录
// ════════════════════════════════════════

async function getHistory() {
  const arr = await getData(KEYS.calculatorHistory, []);
  return Array.isArray(arr) ? arr : [];
}

async function appendHistory(entry) {
  const hist = await getHistory();
  hist.unshift({
    id: `calc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    expr: entry.expr,
    result: formatNumber(entry.result),
    timestamp: new Date().toISOString()
  });
  while (hist.length > MAX_HISTORY) hist.pop();
  await setData(KEYS.calculatorHistory, hist);
}

async function openHistorySheet() {
  const hist = await getHistory();
  const body = document.createElement('div');
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.gap = '8px';

  if (hist.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.textContent = '还没有算过什么呢，按几个数字试试吧';
    body.appendChild(empty);
  } else {
    hist.forEach((h) => {
      const row = document.createElement('button');
      row.className = 'card';
      row.style.textAlign = 'left';
      row.style.width = '100%';
      row.style.marginBottom = '8px';
      row.innerHTML = `
        <div style="font-size:var(--font-size-small);color:var(--text-secondary)">${escapeHTML(h.expr)}</div>
        <div style="font-size:var(--font-size-title);color:var(--text-primary);font-weight:600;margin-top:4px">= ${escapeHTML(h.result)}</div>
      `;
      row.addEventListener('click', () => {
        state.display = String(h.result);
        state.justEvaluated = true;
        state.accumulator = null;
        state.operator = null;
        updateDisplay();
        showToast('拿过来接着算啦', 'default', 1200);
        // 关掉 sheet
        const closeBtn = document.querySelector('.popo-sheet-close');
        if (closeBtn) closeBtn.click();
      });
      body.appendChild(row);
    });

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn danger';
    clearBtn.textContent = '把历史记录都清掉';
    clearBtn.style.marginTop = '12px';
    clearBtn.addEventListener('click', async () => {
      const ok = await ctxRef.showConfirm({
        title: '真的要清掉吗？',
        body: '这些记录会全部不见啦，确定的话就点确认嘛',
        okText: '嗯，清掉吧',
        cancelText: '再想想'
      });
      if (ok) {
        await setData(KEYS.calculatorHistory, []);
        showToast('历史清空啦', 'default', 1200);
        const closeBtn = document.querySelector('.popo-sheet-close');
        if (closeBtn) closeBtn.click();
      }
    });
    body.appendChild(clearBtn);
  }

  // 借桌面 UI 的 sheet
  showBottomSheet({
    title: '历史记录',
    bodyElement: body,
    dismissible: true
  });
}

function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
