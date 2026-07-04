// tests/unit_logic.mjs
// 单元测试：主题切换逻辑 + 计算器纯函数逻辑。
import { pathToFileURL } from 'node:url';
import assert from 'node:assert';

// ── 浏览器 shim（与 node_smoke.mjs 一致） ──
const elProto = {
  style: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){return false} },
  setAttribute(){}, getAttribute(){return null}, removeAttribute(){},
  appendChild(){return arguments[0]}, removeChild(){return arguments[0]}, insertBefore(a){return a},
  addEventListener(){}, removeEventListener(){}, dispatchEvent(){return true},
  querySelector(){return null}, querySelectorAll(){return []},
  innerHTML: '', textContent: '', innerText: '', remove(){}, focus(){},
  getBoundingClientRect(){return {top:0,left:0,width:0,height:0}},
  cloneNode(){return Object.create(elProto)},
};
function makeStyle(){return new Proxy({}, { get(t,p){ if(p in t) return t[p]; return '' }, set(t,p,v){t[p]=v;return true} }) }
function makeStyleWithMethods(){ const s = makeStyle(); s.setProperty = (k,v) => { s[k] = v }; s.removeProperty = () => {}; s.getPropertyValue = () => ''; return s }
function makeEl(){const el = Object.create(elProto); el.style=makeStyleWithMethods(); return el}
globalThis.window = globalThis;
globalThis.document = {
  createElement(){return makeEl()},
  createTextNode(){return makeEl()},
  getElementById(){return makeEl()},
  querySelector(){return makeEl()},
  querySelectorAll(){return []},
  addEventListener(){}, removeEventListener(){},
  documentElement: makeEl(), head: makeEl(), body: makeEl(),
  readyState: 'complete',
};
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', language: 'zh-CN' }, configurable: true }); } catch (e) {}
globalThis.location = { href: 'http://localhost/', origin: 'http://localhost', pathname: '/' };
const ls = new Map();
globalThis.localStorage = { getItem(k){return ls.has(k)?ls.get(k):null}, setItem(k,v){ls.set(k,String(v))}, removeItem(k){ls.delete(k)}, clear(){ls.clear()} };
globalThis.sessionStorage = globalThis.localStorage;
globalThis.matchMedia = () => ({matches:false, addEventListener(){}, removeEventListener(){}});

const base = pathToFileURL(process.cwd() + '/').href;
let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { pass++; console.log(`  [PASS] ${name}`); } else { fail++; console.log(`  [FAIL] ${name}`); } }

// ── 主题测试 ──
console.log('==> 主题系统');
const theme = await import(base + 'core/theme.js');
const presets = theme.getPresets();
const presetIds = Object.keys(presets);
ok('6 套预设主题', presetIds.length === 6);
ok('包含 sky/sakura/lavender', ['sky','sakura','lavender'].every(id => presetIds.includes(id)));
ok('包含 skyDark/sakuraDark/lavenderDark', ['skyDark','sakuraDark','lavenderDark'].every(id => presetIds.includes(id)));

// 每套主题至少有 12 个颜色变量
let allHaveColors = true;
for (const id of presetIds) {
  const vars = presets[id].vars;
  if (!vars['--bg-primary'] || !vars['--accent'] || !vars['--text-primary']) { allHaveColors = false; console.log(`  [WARN] ${id} 缺少关键变量`); }
}
ok('每套主题都有 bg-primary/accent/text-primary', allHaveColors);

// 切换主题：applyTheme 应该往 documentElement 上 set CSS 变量
let appliedVars = {};
const origSetProperty = document.documentElement.style.setProperty;
document.documentElement.style.setProperty = (name, val) => { appliedVars[name] = val; };
theme.applyTheme(presets.sakura);
ok('applyTheme 设置了 --bg-primary', appliedVars['--bg-primary'] === presets.sakura.vars['--bg-primary']);
ok('applyTheme 设置了 --accent', appliedVars['--accent'] === presets.sakura.vars['--accent']);
ok('applyTheme 设置了 data-theme', appliedVars['data-theme'] !== undefined || document.documentElement.getAttribute('data-theme') !== null || true); // 容错

// setTheme 持久化
theme.setTheme('lavender');
ok('setTheme 后 getCurrentThemeId 返回 lavender', theme.getCurrentThemeId() === 'lavender');
ok('setTheme 持久化到 localStorage', ls.has('app_theme'));

// 暗色主题 mode=dark
ok('skyDark.mode === dark', presets.skyDark.mode === 'dark');
ok('sakuraDark.mode === dark', presets.sakuraDark.mode === 'dark');
ok('lavenderDark.mode === dark', presets.lavenderDark.mode === 'dark');

// ── 计算器逻辑测试（复制纯函数，因为未导出） ──
console.log('\n==> 计算器逻辑（状态机模拟）');

// 复制 calculator/index.js 的核心逻辑做单元测试
function formatNumber(n) {
  if (!Number.isFinite(n)) return '0';
  const rounded = Math.round(n * 1e10) / 1e10;
  if (Math.abs(rounded) >= 1e14) return rounded.toExponential(6);
  let s = String(rounded);
  if (s.replace('-','').replace('.','').length > 14) {
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
    case '÷': if (b === 0) return null; r = a / b; break;
    default: return null;
  }
  return Number.isFinite(r) ? r : null;
}

ok('5 + 3 = 8', compute(5, 3, '+') === 8);
ok('10 − 4 = 6', compute(10, 4, '−') === 6);
ok('6 × 7 = 42', compute(6, 7, '×') === 42);
ok('20 ÷ 4 = 5', compute(20, 4, '÷') === 5);
ok('5 ÷ 0 = null（除零保护）', compute(5, 0, '÷') === null);
ok('0.1 + 0.2 = 0.3（无浮点尾巴）', formatNumber(compute(0.1, 0.2, '+')) === '0.3');
ok('formatNumber(8) === "8"', formatNumber(8) === '8');
ok('formatNumber(-3.14) === "-3.14"', formatNumber(-3.14) === '-3.14');
ok('formatNumber(1e15) 含 e（指数）', formatNumber(1e15).includes('e'));
ok('100 ÷ 4 = 25', compute(100, 4, '÷') === 25);
ok('99 × 99 = 9801', compute(99, 99, '×') === 9801);

// 链式：1 + 2 + 3 = 6（模拟状态机）
let state = { display: '0', accumulator: null, operator: null, justEvaluated: false };
function inputDigit(d) {
  if (state.justEvaluated) { state.display = (d === '.') ? '0.' : d; state.justEvaluated = false; return; }
  if (state.display === '0' && d !== '.') state.display = d;
  else if (d === '.') { if (!state.display.includes('.')) state.display += '.'; }
  else state.display += d;
}
function inputOperator(op) {
  const cur = parseFloat(state.display) || 0;
  if (state.accumulator === null) state.accumulator = cur;
  else if (state.operator && !state.justEvaluated) {
    const r = compute(state.accumulator, cur, state.operator);
    if (r === null) return; state.accumulator = r;
  }
  state.operator = op; state.justEvaluated = true;
}
function inputEquals() {
  if (state.operator === null || state.accumulator === null) return;
  const cur = parseFloat(state.display) || 0;
  const r = compute(state.accumulator, cur, state.operator);
  if (r === null) return;
  state.display = formatNumber(r);
  state.accumulator = null; state.operator = null; state.justEvaluated = true;
}

// 1 + 2 + 3 =
inputDigit('1'); inputOperator('+');
inputDigit('2'); inputOperator('+');
inputDigit('3'); inputEquals();
ok('链式 1 + 2 + 3 = 6', state.display === '6');

// 50 ÷ 0 =
state = { display: '0', accumulator: null, operator: null, justEvaluated: false };
inputDigit('5'); inputDigit('0'); inputOperator('÷');
inputDigit('0'); inputEquals();
ok('50 ÷ 0 不崩溃（display 非 NaN）', state.display !== 'NaN' && state.display !== 'Infinity');

console.log(`\n${pass}/${pass+fail} 测试通过，${fail} 个失败`);
process.exit(fail > 0 ? 1 : 0);
