// apps/calculator/index.js
// 计算器 App——支持科学计算的完整表达式版。
// 对齐：Soulver（自然语言计算器，但 Phase 1 先做基础四则运算 + 科学函数）。
// 功能：
//   1) 4x5 键盘：数字 / 四则运算 / 等于 / 清空 / 正负 / 百分比 / 小数点
//   2) 科学面板：sin/cos/tan/log/ln/√/x²/π/e/( )，横向滚动一行
//   3) 完整表达式解析器（tokenize + shunting-yard + 后缀求值），支持运算符优先级、括号嵌套、函数调用
//   4) 历史记录持久化到 localStorage，最多 50 条
//   5) 可爱第一人称文案
//   6) 全部视觉值走 CSS 变量（已用 .calc-* 类）
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js

import { KEYS } from '../../core/storage-keys.js';
import { getData, setData } from '../../core/storage.js';
import { showToast, createIcon, showBottomSheet, showConfirm } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle } from '../../core/util.js';
import { openApp } from '../../core/router.js';
import { applyAppBg } from '../../core/app-bg.js';

let containerEl = null;
let ctxRef = null;
let keydownListener = null;
// 科学计算面板是否展开
let sciPanelOpen = false;

// 科学计算键样式（横向滚动一行小按钮）
injectStyle('app-calculator-sci-style', `
  .calc-sci-keys{
    display:flex; gap:6px; overflow-x:auto; padding:6px 2px 8px;
    scrollbar-width:none; -webkit-overflow-scrolling:touch;
  }
  .calc-sci-keys::-webkit-scrollbar{ display:none; }
  .calc-sci-key{
    flex-shrink:0; min-width:44px; padding:8px 10px;
    border-radius:var(--radius-md);
    background:color-mix(in srgb, var(--accent-light) 30%, transparent);
    color:var(--accent-dark); font-size:var(--font-size-small);
    border:none; cursor:pointer; transition:var(--motion);
  }
  .calc-sci-key:active{ transform:scale(var(--press-scale)); }
  .calc-fx-toggle{
    background:transparent; color:var(--text-secondary);
    border:none; cursor:pointer; padding:6px 8px;
    border-radius:var(--radius-sm); transition:var(--motion);
    font-size:var(--font-size-small);
  }
  .calc-fx-toggle.active{
    background:var(--accent-light); color:var(--accent-dark); font-weight:600;
  }
`);

// 计算器状态
//   display: 当前显示的表达式字符串（用户正在输入，例如 "1+2×3" 或 "sin(0)"）
//   justEvaluated: 刚刚按完 = 后，下次按数字 / 函数会清空 display 重新开始
let state = { display: '0', justEvaluated: false };

const MAX_HISTORY = 50;

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  ctxRef = context;
  state = { display: '0', justEvaluated: false };

  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="calc-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="app-header-title">计算器</div>
      <button class="calc-fx-toggle" id="calc-fx-toggle" aria-label="科学计算" title="科学计算">fx</button>
      <button class="app-header-gear" id="calc-settings" aria-label="计算器设置">${createIcon('settings', 18).outerHTML}</button>
      <button class="app-history" id="calc-history-btn" aria-label="看看历史记录">${createIcon('calendar', 20).outerHTML}</button>
    </div>
    <div class="app-body" id="calc-body">
      <div class="calc-display" id="calc-display" aria-live="polite">0</div>
      <div class="calc-sci-keys" id="calc-sci-keys" style="display:none"></div>
      <div class="calc-keys" id="calc-keys"></div>
    </div>
  `;

  container.querySelector('#calc-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#calc-history-btn').addEventListener('click', openHistorySheet);
  // 齿轮跳到设置「数据与系统」分组
  container.querySelector('#calc-settings').addEventListener('click', () => openApp('settings', { deepLink: { tab: 'system' } }));
  // 科学面板展开 / 收起
  container.querySelector('#calc-fx-toggle').addEventListener('click', toggleSciPanel);

  renderKeys();
  renderSciKeys();
  updateDisplay();

  // 键盘可达（桌面调试也舒服）
  keydownListener = (e) => handleKeydown(e);
  window.addEventListener('keydown', keydownListener);
  applyAppBg(container, 'calculator');
}

export function unmount() {
  if (keydownListener) {
    window.removeEventListener('keydown', keydownListener);
    keydownListener = null;
  }
  containerEl = null;
  ctxRef = null;
  sciPanelOpen = false;
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

// 科学计算键（横向滚动一行）：sin/cos/tan/log/ln/√/x²/π/e/( )
// 三角函数用弧度制（与 JS Math 一致）
//   const 用 symbol 字段：按键时把符号追加进 display（π / e），
//   求值时由 tokenizer 翻译成 Math.PI / Math.E
const SCI_KEYS = [
  { label: 'sin', action: 'sci', fn: 'sin' },
  { label: 'cos', action: 'sci', fn: 'cos' },
  { label: 'tan', action: 'sci', fn: 'tan' },
  { label: 'log', action: 'sci', fn: 'log' },
  { label: 'ln',  action: 'sci', fn: 'ln' },
  { label: '√',   action: 'sci', fn: 'sqrt' },
  { label: 'x²',  action: 'sci', fn: 'square' },
  { label: 'π',   action: 'const', symbol: 'π' },
  { label: 'e',   action: 'const', symbol: 'e' },
  { label: '(',   action: 'paren', ch: '(' },
  { label: ')',   action: 'paren', ch: ')' }
];

function renderSciKeys() {
  const wrap = containerEl.querySelector('#calc-sci-keys');
  if (!wrap) return;
  wrap.innerHTML = '';
  SCI_KEYS.forEach((k) => {
    const btn = document.createElement('button');
    btn.className = 'calc-sci-key';
    btn.textContent = k.label;
    btn.setAttribute('aria-label', k.label);
    btn.addEventListener('click', () => onSciKey(k));
    wrap.appendChild(btn);
  });
}

// 展开 / 收起科学面板
function toggleSciPanel() {
  sciPanelOpen = !sciPanelOpen;
  const panel = containerEl?.querySelector('#calc-sci-keys');
  const toggle = containerEl?.querySelector('#calc-fx-toggle');
  if (panel) panel.style.display = sciPanelOpen ? 'flex' : 'none';
  if (toggle) toggle.classList.toggle('active', sciPanelOpen);
}

// 科学键处理：把按键内容追加进 display 字符串，由 evaluateExpression 统一求值
//   sin/cos/tan/log/ln/√：追加 fn( ，等用户继续输入参数 + )
//   x²：后缀操作符，直接追加 ²（平方前一个数）
//   π/e：追加常量符号
//   ( )：直接追加括号
function onSciKey(k) {
  // 刚算完 / display 还是初始 0：从新表达式开始（替换而非追加）
  const startFresh = state.justEvaluated || state.display === '0' || state.display === '';

  if (k.action === 'sci') {
    if (k.fn === 'square') {
      // x² 是后缀：display 是 0/空时没东西可平方，忽略
      if (state.display === '0' || state.display === '') { updateDisplay(); return; }
      if (state.justEvaluated) state.justEvaluated = false;
      state.display += '²';
    } else {
      // 函数：追加 fn( ；刚算完就替换
      state.display = startFresh ? (k.fn + '(') : (state.display + k.fn + '(');
      state.justEvaluated = false;
    }
  } else if (k.action === 'const') {
    // 常量：追加符号 π / e；刚算完就替换
    state.display = startFresh ? k.symbol : (state.display + k.symbol);
    state.justEvaluated = false;
  } else if (k.action === 'paren') {
    if (k.ch === '(') {
      state.display = startFresh ? '(' : (state.display + '(');
    } else {
      // ) 不能开头
      if (startFresh) { updateDisplay(); return; }
      state.display += ')';
    }
    state.justEvaluated = false;
  }
  updateDisplay();
}

// ══════════════════════════════════════════════════════════════
// 表达式构建 + 求值
// 用户按键时把按键值追加到 display 字符串，等号时调用 evaluateExpression(display)
// 支持运算符优先级（× ÷ 优先于 + −）、括号嵌套、函数调用、常量、百分号、正负号
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

// 判断字符是否是运算符（含 unicode 减号）
function isOperatorChar(c) {
  return c === '+' || c === '-' || c === '−' || c === '×' || c === '÷';
}

function inputDigit(d) {
  if (state.justEvaluated) {
    // 刚算完，按数字开始新表达式
    state.display = (d === '.') ? '0.' : d;
    state.justEvaluated = false;
    return;
  }
  if (d === '.') {
    // 找到最后一个数字，看是否已经有小数点
    const m = state.display.match(/(\d+(\.\d*)?|\.\d*)$/);
    if (m && m[0].includes('.')) return; // 最后一个数字已有小数点，忽略
    // 最后一个字符不是数字：补 0. 开头
    const last = state.display.slice(-1);
    if (!/\d/.test(last)) state.display += '0.';
    else state.display += '.';
    return;
  }
  // 普通数字：开头是 0 就替换
  if (state.display === '0') {
    state.display = d;
  } else {
    state.display += d;
  }
}

function inputOperator(op) {
  if (state.justEvaluated) state.justEvaluated = false;
  const last = state.display.slice(-1);
  // 末尾已经是运算符：替换掉
  if (isOperatorChar(last)) {
    state.display = state.display.slice(0, -1) + op;
    return;
  }
  // 开头或左括号后只允许 + / − 作为正负号
  if (state.display === '0' || state.display === '' || last === '(') {
    if (op === '−' || op === '+') {
      // 替换掉初始的 0
      if (state.display === '0') state.display = op;
      else state.display += op;
    }
    // × ÷ 不能开头，忽略
    return;
  }
  state.display += op;
}

function inputEquals() {
  if (!state.display || state.display === '0') return;
  const expr = state.display;
  const result = evaluateExpression(expr);
  if (result === null || !Number.isFinite(result)) {
    showToast('算不出来呢，再检查一下嘛', 'error', 1600);
    return;
  }
  appendHistory({ expr, result });
  state.display = formatNumber(result);
  state.justEvaluated = true;
}

function inputClear() {
  state = { display: '0', justEvaluated: false };
  showToast('清空啦，重新开始算吧', 'default', 1200);
}

// 正负号切换：切换最后一个数字的符号
function inputNegate() {
  if (state.display === '0' || state.display === '') return;
  const m = state.display.match(/(-?\d*\.?\d+)$/);
  if (!m) return;
  const num = m[1];
  const newNum = num.startsWith('-') ? num.slice(1) : '-' + num;
  state.display = state.display.slice(0, -num.length) + newNum;
  state.justEvaluated = false;
}

// 百分号：作为后缀操作符追加，求值时把前一个数除以 100
function inputPercent() {
  if (state.justEvaluated) state.justEvaluated = false;
  // display 是初始 0 时按 % 没意义，但也不报错
  state.display += '%';
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

function updateDisplay() {
  const el = containerEl.querySelector('#calc-display');
  if (!el) return;
  el.textContent = state.display;
}

// ══════════════════════════════════════════════════════════════
// 表达式解析器：tokenize + shunting-yard + 后缀求值
// 不用 eval，安全可控。支持：
//   运算符优先级：× ÷ 优先于 + −
//   括号嵌套：(1+2)×3
//   函数：sin/cos/tan/log/ln/sqrt（接收一个参数）
//   常量：π = Math.PI, e = Math.E
//   后缀操作符：² 平方、% 百分比
//   正负号：-5、+3、2×-3
//   隐式乘法：2π、2(3+4)、(1+2)(3+4)
// ══════════════════════════════════════════════════════════════

// 运算符优先级（数字越大越高）
const OP_PREC = { '+': 1, '-': 1, '*': 2, '/': 2 };

// 把字符串拆成 token：num / op / func / const / paren / postfix / unary
function tokenize(expr) {
  const tokens = [];
  let i = 0;
  const opMap = { '+': '+', '-': '-', '−': '-', '×': '*', '÷': '/' };
  while (i < expr.length) {
    const c = expr[i];
    // 空白
    if (/\s/.test(c)) { i++; continue; }
    // 数字（含小数点）
    if (/[0-9.]/.test(c)) {
      let num = '';
      let dotCount = 0;
      while (i < expr.length && /[0-9.]/.test(expr[i])) {
        if (expr[i] === '.') dotCount++;
        if (dotCount > 1) break; // 第二个小数点，留给下一个 token
        num += expr[i];
        i++;
      }
      const val = parseFloat(num);
      if (!Number.isFinite(val)) throw new Error('数字格式不对：' + num);
      tokens.push({ type: 'num', val });
      continue;
    }
    // 函数名 / 常量名（英文字母）
    if (/[a-zA-Z]/.test(c)) {
      let name = '';
      while (i < expr.length && /[a-zA-Z]/.test(expr[i])) {
        name += expr[i];
        i++;
      }
      if (name === 'e') {
        tokens.push({ type: 'const', val: Math.E });
      } else if (['sin', 'cos', 'tan', 'log', 'ln', 'sqrt'].includes(name)) {
        tokens.push({ type: 'func', name });
      } else {
        throw new Error('不认识的符号：' + name);
      }
      continue;
    }
    // π 常量（单字符，不在 [a-z] 范围内）
    if (c === 'π') {
      tokens.push({ type: 'const', val: Math.PI });
      i++;
      continue;
    }
    // ² 后缀平方
    if (c === '²') {
      tokens.push({ type: 'postfix', name: 'square' });
      i++;
      continue;
    }
    // % 后缀百分比
    if (c === '%') {
      tokens.push({ type: 'postfix', name: 'percent' });
      i++;
      continue;
    }
    // 运算符 + - × ÷ −
    if (c in opMap) {
      tokens.push({ type: 'op', val: opMap[c] });
      i++;
      continue;
    }
    // 括号
    if (c === '(' || c === ')') {
      tokens.push({ type: 'paren', val: c });
      i++;
      continue;
    }
    throw new Error('不认识的字符：' + c);
  }
  return tokens;
}

// 隐式乘法：在 num/const/) / 后缀 和 num/const/func/( 之间插入 *
function insertImplicitMul(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (i > 0) {
      const prev = tokens[i - 1];
      const prevEndsValue =
        prev.type === 'num' || prev.type === 'const' ||
        (prev.type === 'paren' && prev.val === ')') ||
        prev.type === 'postfix';
      const curStartsValue =
        t.type === 'num' || t.type === 'const' ||
        t.type === 'func' ||
        (t.type === 'paren' && t.val === '(');
      if (prevEndsValue && curStartsValue) {
        out.push({ type: 'op', val: '*' });
      }
    }
    out.push(t);
  }
  return out;
}

// 中缀转后缀（shunting-yard）
// 一元正负号：在表达式开头、运算符后、左括号后出现时，作为 unary 处理（优先级最高）
function shuntingYard(tokens) {
  const output = [];
  const opStack = [];
  const isUnaryContext = (prev) =>
    prev === null ||
    prev.type === 'op' ||
    prev.type === 'unary' ||
    (prev.type === 'paren' && prev.val === '(');

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : null;

    if (t.type === 'num' || t.type === 'const') {
      output.push(t);
    } else if (t.type === 'func') {
      opStack.push(t);
    } else if (t.type === 'postfix') {
      // 后缀操作符直接进输出（优先级最高）
      output.push(t);
    } else if (t.type === 'op') {
      // 一元 + / - 检测
      if ((t.val === '+' || t.val === '-') && isUnaryContext(prev)) {
        opStack.push({ type: 'unary', val: t.val });
      } else {
        // 弹出栈顶优先级 >= 当前的运算符（左结合）
        while (opStack.length > 0) {
          const top = opStack[opStack.length - 1];
          if (top.type === 'func' || top.type === 'unary') {
            output.push(opStack.pop());
          } else if (top.type === 'op' && (OP_PREC[top.val] || 0) >= (OP_PREC[t.val] || 0)) {
            output.push(opStack.pop());
          } else {
            break;
          }
        }
        opStack.push(t);
      }
    } else if (t.type === 'paren') {
      if (t.val === '(') {
        opStack.push(t);
      } else {
        // 右括号：弹到左括号为止
        while (opStack.length > 0 && opStack[opStack.length - 1].type !== 'paren') {
          output.push(opStack.pop());
        }
        if (opStack.length === 0) throw new Error('括号没配对呀');
        opStack.pop(); // 弹出左括号
        // 如果栈顶是函数，弹出到输出
        if (opStack.length > 0 && opStack[opStack.length - 1].type === 'func') {
          output.push(opStack.pop());
        }
      }
    }
  }
  // 弹完剩下的
  while (opStack.length > 0) {
    const top = opStack.pop();
    if (top.type === 'paren') throw new Error('括号没配对呀');
    output.push(top);
  }
  return output;
}

// 后缀表达式求值
function evalPostfix(postfix) {
  const stack = [];
  for (const t of postfix) {
    if (t.type === 'num' || t.type === 'const') {
      stack.push(t.val);
    } else if (t.type === 'postfix') {
      if (stack.length < 1) throw new Error('表达式不完整呀');
      const x = stack.pop();
      let r;
      if (t.name === 'square') r = x * x;
      else if (t.name === 'percent') r = x / 100;
      else throw new Error('不认识的后缀操作符');
      stack.push(r);
    } else if (t.type === 'unary') {
      if (stack.length < 1) throw new Error('表达式不完整呀');
      const x = stack.pop();
      stack.push(t.val === '-' ? -x : +x);
    } else if (t.type === 'op') {
      if (stack.length < 2) throw new Error('表达式不完整呀');
      const b = stack.pop();
      const a = stack.pop();
      let r;
      switch (t.val) {
        case '+': r = a + b; break;
        case '-': r = a - b; break;
        case '*': r = a * b; break;
        case '/':
          if (b === 0) throw new Error('零不能做除数呀');
          r = a / b; break;
        default: throw new Error('不认识的运算符');
      }
      stack.push(r);
    } else if (t.type === 'func') {
      if (stack.length < 1) throw new Error('表达式不完整呀');
      const x = stack.pop();
      let r;
      switch (t.name) {
        case 'sin': r = Math.sin(x); break;
        case 'cos': r = Math.cos(x); break;
        case 'tan': r = Math.tan(x); break;
        case 'log':
          if (x <= 0) throw new Error('log 要正数才行哦');
          r = Math.log10(x); break;
        case 'ln':
          if (x <= 0) throw new Error('ln 要正数才行哦');
          r = Math.log(x); break;
        case 'sqrt':
          if (x < 0) throw new Error('负数开不出来呀');
          r = Math.sqrt(x); break;
        default: throw new Error('不认识的函数');
      }
      stack.push(r);
    }
  }
  if (stack.length !== 1) throw new Error('表达式不完整呀');
  return stack[0];
}

// 主入口：接收字符串表达式，返回计算结果（出错返回 null）
function evaluateExpression(expr) {
  try {
    if (!expr || typeof expr !== 'string') return null;
    const cleaned = expr.trim();
    if (!cleaned) return null;
    let tokens = tokenize(cleaned);
    if (tokens.length === 0) return null;
    tokens = insertImplicitMul(tokens);
    const postfix = shuntingYard(tokens);
    const result = evalPostfix(postfix);
    return Number.isFinite(result) ? result : null;
  } catch (e) {
    console.warn('[calculator] 表达式求值失败', expr, e);
    return null;
  }
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

function getHistory() {
  const arr = getData(KEYS.calculatorHistory, []);
  return Array.isArray(arr) ? arr : [];
}

function appendHistory(entry) {
  const hist = getHistory();
  hist.unshift({
    id: `calc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    expr: entry.expr,
    result: formatNumber(entry.result),
    timestamp: new Date().toISOString()
  });
  while (hist.length > MAX_HISTORY) hist.pop();
  setData(KEYS.calculatorHistory, hist);
}

async function openHistorySheet() {
  const hist = getHistory();
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
    clearBtn.addEventListener('click', () => {
      showConfirm({
        title: '真的要清掉吗？',
        body: '这些记录会全部不见啦，确定的话就点确认嘛',
        confirmText: '嗯，清掉吧',
        cancelText: '再想想',
        onConfirm: () => {
          setData(KEYS.calculatorHistory, []);
          showToast('历史清空啦', 'default', 1200);
          const closeBtn = document.querySelector('.popo-sheet-close');
          if (closeBtn) closeBtn.click();
        }
      });
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
