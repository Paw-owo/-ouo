// tests/node_smoke.mjs
// Node 端模块加载冒烟测试：shim 浏览器全局，逐个 import 所有 core + app 模块，
// 捕获顶层错误与 import/export 不匹配。不需要真实浏览器。
// 用法：node tests/node_smoke.mjs

import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';

// ── 浏览器全局 shim ──────────────────────────────
const elProto = {
  style: {}, classList: { add(){}, remove(){}, toggle(){}, contains(){return false} },
  setAttribute(){}, getAttribute(){return null}, removeAttribute(){},
  appendChild(){return arguments[0]}, removeChild(){return arguments[0]},
  insertBefore(a){return a}, replaceChild(a){return a},
  addEventListener(){}, removeEventListener(){}, dispatchEvent(){return true},
  querySelector(){return makeEl()}, querySelectorAll(){return []},
  innerHTML: '', textContent: '', innerText: '',
  set textContentSetter(v){}, get boundingClientRect(){return {top:0,left:0,width:0,height:0}},
  getBoundingClientRect(){return {top:0,left:0,width:0,height:0}},
  cloneNode(){return makeEl()}, focus(){}, blur(){}, click(){}, remove(){},
  closest(){return null}, matches(){return false}, contains(){return false},
};
function makeEl(){const el = Object.create(elProto); el.children=[]; el.childNodes=[]; el.style={}; return el}

globalThis.window = globalThis;
globalThis.document = {
  createElement(){return makeEl()},
  createTextNode(){return makeEl()},
  getElementById(){return makeEl()},
  getElementsByTagName(){return []},
  querySelector(){return makeEl()},
  querySelectorAll(){return []},
  addEventListener(){}, removeEventListener(){},
  documentElement: makeEl(), head: makeEl(), body: makeEl(),
  readyState: 'complete', cookie: '',
};
try { Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node-smoke', language: 'zh-CN', onLine: true }, configurable: true }); } catch (e) {}
globalThis.location = { href: 'http://localhost/', origin: 'http://localhost', pathname: '/', hostname: 'localhost' };
globalThis.localStorage = {
  _s: new Map(),
  getItem(k){return this._s.has(k)?this._s.get(k):null},
  setItem(k,v){this._s.set(k,String(v))},
  removeItem(k){this._s.delete(k)},
  clear(){this._s.clear()},
  get length(){return this._s.size},
  key(i){return Array.from(this._s.keys())[i]},
};
globalThis.sessionStorage = globalThis.localStorage;
globalThis.requestAnimationFrame = (cb) => setTimeout(()=>cb(Date.now()), 0);
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
globalThis.matchMedia = () => ({matches:false, addListener(){}, removeListener(){}, addEventListener(){}, removeEventListener(){}});

// indexedDB shim: 最小桩，让 ensureDB 不在 import 阶段炸
globalThis.indexedDB = {
  open(){const req={onupgradeneeded:null,onsuccess:null,onerror:null,onblocked:null,result:null};setTimeout(()=>{if(req.onerror)req.onerror({target:req})},0);return req}
};
globalThis.IDBKeyRange = function(){};

// VisualViewport
globalThis.visualViewport = { addEventListener(){}, removeEventListener(){}, width:390, height:844 };

// crypto (Node 24 已有 crypto，无需 shim；仅兜底 randomUUID)
if (!globalThis.crypto?.randomUUID) {
  try { Object.defineProperty(globalThis, 'crypto', { value: { randomUUID(){return 'uuid-'+Math.random().toString(36).slice(2)} }, configurable: true }); } catch (e) {}
}

// ── 测试 ──────────────────────────────────────
const base = pathToFileURL(process.cwd() + '/').href;
const modules = [
  'core/storage-keys.js',
  'core/config.js',
  'core/util.js',
  'core/events.js',
  'core/storage.js',
  'core/storage-manager.js',
  'core/theme.js',
  'core/ui.js',
  'core/memory.js',
  'core/router.js',
  'core/seed.js',
  'core/api.js',
  'core/mcp.js',
  'core/tts.js',
  'apps-registry.js',
  'apps/settings/index.js',
  'apps/calculator/index.js',
  'desktop.js',
];

let pass = 0, fail = 0;
for (const m of modules) {
  const path = base + m;
  if (!existsSync(new URL(path))) {
    console.log(`[MISS] ${m} —— 文件不存在`);
    fail++;
    continue;
  }
  try {
    const mod = await import(path);
    const exports = Object.keys(mod);
    console.log(`[ OK ] ${m} —— exports: ${exports.slice(0,6).join(', ')}${exports.length>6?', ...':''}`);
    pass++;
  } catch (e) {
    console.log(`[FAIL] ${m} —— ${e.message}`);
    console.log(`       ${e.stack?.split('\n').slice(1,3).join('\n       ')}`);
    fail++;
  }
}

console.log(`\n${pass}/${pass+fail} 模块加载通过，${fail} 个失败`);
process.exit(fail > 0 ? 1 : 0);
