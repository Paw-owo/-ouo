# APP 联动统一中枢改造计划

> **For agentic workers:** 本项目是纯浏览器 Vanilla JS 单页应用，无测试框架。每个任务的"验证"步骤采用浏览器手动 smoke test + 代码级 grep 检查代替 TDD。每个 Phase 结束做一次浏览器整体回归。

**Goal:** 新建 `core/app-bus.js` 作为统一中枢，让全部 APP（含 5 个孤岛）通过统一入口互相联动：统一事件契约、统一记忆写入、统一带参 `openApp`、chat 暴露对外 API。

**Architecture:** 三层中枢——(1) APP 注册表：每个 APP 在 mount 时注册对外 API，其他 APP 通过 `appBus.getAPI(appId)` 拿到强类型契约而不是动态 import；(2) 事件总线：保留现有 `window.AppEvents` 但新增命名约定 `domain:action`，并把现有死事件接上监听者；(3) 统一记忆写入：废除 chat 版 `recordExternalInteraction`，全部走 `core/memory.js` 的实现，保留 source/keywords/importance 字段。

**Tech Stack:** Vanilla JS (ES Modules)、IndexedDB（通过 `core/storage.js`）、CustomEvent。

---

## File Structure

### 新建文件
- `core/app-bus.js` — 统一中枢：APP 注册表 + 事件总线包装 + 带参 openApp + 统一 recordExternalInteraction 入口

### 修改文件
- `index.html` — 启动时初始化 appBus；`openApp` 改造支持 options；`createAppContext` 注入 `appBus` 和 `openApp`
- `apps/chat.js` — 导出 `getAppApi()`（含 `openPrivateThread`/`openGroupThread`/`sendMessage`/`refreshThread`/`getApi`）；mount 时注册到 appBus；删除本地 `recordExternalInteraction`，改为转发到 `core/memory.js`；监听 `characters:updated`/`grudge:punishment`/`wallet-transfer-created`/`shop-gift-created`
- `apps/chat/list.js` — 暴露 `refreshList()` 给 chat.js 注册到 appBus；监听 `characters:updated` 自动刷新
- `apps/chat/thread.js` — 暴露 `openPrivateThread(characterId)` / `openGroupThread(groupId)` / `refreshCurrentThread()` / `sendUserMessage(text, extra)` 给 chat.js 注册
- `apps/wallet.js` — `recordWalletMemory` 改调 `appBus.recordExternalInteraction`；转账事件改发 `appBus.emit('wallet:transfer', ...)`；新增"在 chat 里查看"按钮调 `appBus.openApp('chat', {route:...})`
- `apps/shop.js` — 同上，礼物事件改发 `appBus.emit('shop:gift', ...)`
- `apps/moments.js` — `recordToChat` 改调 `appBus.recordExternalInteraction`；事件统一到 `appBus.emit('moments:interaction', ...)`
- `apps/games/tarot.js`、`apps/games/truth.js`、`apps/games/draw-guess.js`、`apps/games/liars-tavern.js` — 改 `import { recordExternalInteraction } from '../../core/app-bus.js'`（app-bus 转发到 core/memory.js，保持向后兼容）
- `apps/gallery.js` — mount 时订阅 `appBus.on('grudge:punishment')` 自动刷新列表
- `apps/memo.js` — 备忘录创建/编辑时，若用户勾选"同步给 TA 记得"，调 `appBus.recordExternalInteraction` 写入指定角色的记忆
- `apps/anniversary.js` — 启动一个轻量定时器，到纪念日当天首次解锁时调 `appBus.openApp('chat', {route:{name:'thread',params:{...}}})` 触发 AI 主动问候；写入纪念日记忆
- `apps/worldbook.js` — mount 时调 `appBus.registerAPI('worldbook', {getEntries, getEntry})`；编辑/删除时 `appBus.emit('worldbook:updated', ...)`
- `apps/dream.js` — 梦境记录保存时调 `appBus.recordExternalInteraction` 写入角色记忆
- `apps/characters.js` — 编辑后改发 `appBus.emit('characters:updated', {characterId})`（保留原有 dispatchEvent 兼容）
- `apps/chat/thread-ai.js` — AI 回复构建时，通过 `appBus.getAPI('worldbook')` 拉取世界观条目注入 prompt（可选注入，受 character 配置控制）

---

## Phase 1：搭建中枢（core/app-bus.js + index.html 接线）

### Task 1.1：创建 core/app-bus.js 骨架

**Files:**
- Create: `core/app-bus.js`

- [ ] **Step 1：写文件骨架，包含 registerAPI/getAPI/unregisterAPI、emit/on/off、openApp、recordExternalInteraction 转发**

```js
// core/app-bus.js
// imports:
//   from './memory.js': recordExternalInteraction as memoryRecordExternalInteraction
//   from './storage.js': getData, setData

import { recordExternalInteraction as memoryRecordExternalInteraction } from './memory.js';
import { getData, setData } from './storage.js';

// ═══════════════════════════════════════
// 【APP 注册表】每个 APP mount 时注册对外 API
// ═══════════════════════════════════════

const registry = new Map();

export function registerAPI(appId, api) {
  const id = String(appId || '').trim();
  if (!id || !api || typeof api !== 'object') return () => {};
  registry.set(id, api);
  return () => {
    if (registry.get(id) === api) registry.delete(id);
  };
}

export function getAPI(appId) {
  return registry.get(String(appId || '').trim()) || null;
}

export function hasAPI(appId) {
  return registry.has(String(appId || '').trim());
}

// ═══════════════════════════════════════
// 【事件总线】包装 window.AppEvents，加命名约定和离线事件日志
// ═══════════════════════════════════════

const EVENT_LOG_KEY = 'app_bus_event_log';
const EVENT_LOG_LIMIT = 50;

export function emit(event, data) {
  const name = String(event || '').trim();
  if (!name) return;
  logEvent(name, data);
  if (typeof window !== 'undefined' && window.AppEvents) {
    window.AppEvents.emit(name, data);
  } else {
    window.dispatchEvent(new CustomEvent(name, { detail: data }));
  }
}

export function on(event, fn) {
  const name = String(event || '').trim();
  if (!name || typeof fn !== 'function') return () => {};
  if (typeof window !== 'undefined' && window.AppEvents) {
    return window.AppEvents.on(name, fn);
  }
  const handler = (e) => fn(e.detail);
  window.addEventListener(name, handler);
  return () => window.removeEventListener(name, handler);
}

export function once(event, fn) {
  const off = on(event, (data) => {
    off();
    fn(data);
  });
  return off;
}

function logEvent(name, data) {
  try {
    const log = getData(EVENT_LOG_KEY) || [];
    log.push({ name, data: safeForLog(data), at: Date.now() });
    while (log.length > EVENT_LOG_LIMIT) log.shift();
    setData(EVENT_LOG_KEY, log);
  } catch (_) {}
}

function safeForLog(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return String(value);
  }
}

export function getEventLog() {
  return getData(EVENT_LOG_KEY) || [];
}

// ═══════════════════════════════════════
// 【带参 openApp】委托 window.openApp，但支持 options
// ═══════════════════════════════════════

export async function openApp(appId, options = {}) {
  if (typeof window === 'undefined') return;
  if (typeof window.openApp !== 'function') return;
  // window.openApp 由 index.html 改造后接受第二参数 options
  await window.openApp(appId, options);
}

// ═══════════════════════════════════════
// 【统一记忆写入】全部走 core/memory.js，保留 source/keywords/importance
// ═══════════════════════════════════════

export async function recordExternalInteraction(payload = {}) {
  // 兼容旧 chat 版的 (input, legacyInteraction) 双参数签名
  if (arguments.length >= 2 && typeof payload !== 'object') {
    payload = {
      characterId: payload,
      role: arguments[1]?.role || 'assistant',
      content: arguments[1]?.content || arguments[1]?.text || arguments[1]?.note || '',
      source: arguments[1]?.source || 'external'
    };
  }

  const characterId = String(payload.characterId || '').trim();
  const content = String(payload.content || payload.text || payload.note || '').trim();
  if (!characterId || !content) return null;

  return await memoryRecordExternalInteraction({
    characterId,
    character: payload.character || null,
    userProfile: payload.userProfile || {},
    role: payload.role === 'user' ? 'user' : 'assistant',
    content,
    source: payload.source || 'external',
    mood: payload.mood || '',
    importance: Number(payload.importance) || 3,
    callName: payload.callName || ''
  });
}

// ═══════════════════════════════════════
// 【工具】批量订阅，返回统一 off
// ═══════════════════════════════════════

export function subscribe(handlers = {}) {
  const offs = [];
  for (const [event, fn] of Object.entries(handlers)) {
    if (typeof fn === 'function') offs.push(on(event, fn));
  }
  return () => offs.forEach((off) => { try { off(); } catch (_) {} });
}
```

- [ ] **Step 2：在浏览器 console 验证模块能加载**

打开 `index.html`，在 DevTools Console 执行：
```js
import('./core/app-bus.js').then(m => console.log(Object.keys(m)));
```
Expected：输出包含 `registerAPI`、`getAPI`、`emit`、`on`、`openApp`、`recordExternalInteraction`、`subscribe`。

- [ ] **Step 3：Commit**

```bash
git add core/app-bus.js
git commit -m "feat(app-bus): 新增统一中枢模块（注册表+事件+带参openApp+统一记忆写入）"
```

---

### Task 1.2：index.html 接入 appBus，改造 openApp 支持参数

**Files:**
- Modify: `index.html`（重点改 `boot()`、`openApp()`、`createAppContext()` 三处）

- [ ] **Step 1：在 boot() 里 import 并初始化 appBus**

在 `index.html` 第 1167 行附近的 import 块加一行：

```js
import { registerAPI, getAPI, emit as busEmit, on as busOn, openApp as busOpenApp, recordExternalInteraction as busRecordExternalInteraction, subscribe as busSubscribe } from './core/app-bus.js';
```

在 `boot()` 函数末尾（`updateLockState()` 之后）加：

```js
window.AppBus = { registerAPI, getAPI, emit: busEmit, on: busOn, once: (e, f) => { let off = busOn(e, (d) => { off(); f(d); }); return off; }, openApp: busOpenApp, recordExternalInteraction: busRecordExternalInteraction, subscribe: busSubscribe };
```

- [ ] **Step 2：改造 openApp 接受 options，并把 options 透传给目标 APP 的 mount**

把 `index.html:2139` 的 `async function openApp(appId)` 改为 `async function openApp(appId, options = {})`。把 `const context = createAppContext(app);` 那行改为 `const context = createAppContext(app, options);`，并把 mount 调用从 `await module.mount(appLayerEl, context);` 改为 `await module.mount(appLayerEl, { ...context, ...options });`（其他 render/open/default 同理）。

具体改动点（基于 `index.html:2139-2160`）：

```js
async function openApp(appId, options = {}) {
  const app = APPS.find((item) => item.id === appId);
  if (!app) return;
  editing = false;
  updateEditingClass();
  if (!app.ready || !app.module) { openPlaceholderApp(app); return; }
  try {
    closeCurrentApp({ silent: true });
    appLayerEl.classList.add('has-app');
    appLayerEl.innerHTML = '';
    const module = await import(app.module);
    currentAppModule = module;
    currentAppId = app.id;
    const context = createAppContext(app, options);
    const mountOptions = { ...context, ...options };
    if (typeof module.mount === 'function') { await module.mount(appLayerEl, mountOptions); }
    else if (typeof module.render === 'function') { await module.render(appLayerEl, mountOptions); }
    else if (typeof module.open === 'function') { await module.open(appLayerEl, mountOptions); }
    else if (typeof module.default === 'function') { await module.default(appLayerEl, mountOptions); }
    else { openPlaceholderApp(app); }
    await applyAllImages();
  } catch (error) { console.error(error); openPlaceholderApp(app, '哎呀，出了点小问题'); }
}
```

- [ ] **Step 3：改造 createAppContext 注入 appBus 和 openApp**

把 `index.html:2162-2164` 的 `createAppContext` 改为：

```js
function createAppContext(app, options = {}) {
  return {
    app, appId: app.id, appLayer: appLayerEl,
    closeApp: closeCurrentApp, closeCurrentApp,
    showToast, createIcon,
    getData, setData, removeData, getDB, setDB, deleteDB, getAllDB, generateId, getNow,
    images: window.AppImages,
    refreshDesktop, refreshBadges, refreshDesktopImages: applyAllImages,
    emit: window.AppEvents.emit, on: window.AppEvents.on,
    appBus: window.AppBus,
    openApp: window.AppBus.openApp,
    options
  };
}
```

- [ ] **Step 4：浏览器验证**

打开 `index.html`，桌面正常显示。点开任意 APP 能正常进入。在 console 执行：
```js
window.AppBus.registerAPI('test', { hello: () => 'hi' });
window.AppBus.getAPI('test').hello();
```
Expected：返回 `'hi'`。再执行：
```js
window.AppBus.emit('test:event', { a: 1 });
window.AppBus.getEventLog().slice(-3);
```
Expected：能看到 `test:event` 记录。

- [ ] **Step 5：Commit**

```bash
git add index.html
git commit -m "feat(host): 接入 appBus，openApp 支持带参，context 注入 appBus/openApp"
```

---

## Phase 2：chat 暴露对外 API + 移除重复的 recordExternalInteraction

### Task 2.1：apps/chat.js 导出 getAppApi 并注册到 appBus

**Files:**
- Modify: `apps/chat.js`
- Modify: `apps/chat/list.js`（暴露 `refreshList`）
- Modify: `apps/chat/thread.js`（暴露 `openPrivateThread`/`openGroupThread`/`refreshCurrentThread`/`sendUserMessage`）

- [ ] **Step 1：在 apps/chat/list.js 暴露 refreshList**

先 `Read` `apps/chat/list.js` 找到 `mountChatList` 函数签名和模块级状态变量位置（约在第 20-80 行）。在文件末尾导出：

```js
export function refreshList() {
  if (!listRootEl || !mounted) return;
  // 重新渲染当前 tab 的会话列表，不重置 tab
  renderList();
}
```

注意：`listRootEl`/`mounted`/`renderList` 是 list.js 的内部变量/函数，需要根据实际命名调整。如果 `renderList` 不存在，调用 mount 时实际刷新用的内部函数；若无法直接调用，则降级为 `window.AppEvents.emit('chat:refresh-list')`，并在 list.js 的 mount 里监听该事件做刷新。

- [ ] **Step 2：在 apps/chat/thread.js 暴露 openPrivateThread/openGroupThread/refreshCurrentThread/sendUserMessage**

`Read` `apps/chat/thread.js` 找到 `mountChatThread`、`unmountChatThread` 以及内部 `state` 变量。在文件末尾导出：

```js
export async function openPrivateThread(characterId) {
  // 仅在 thread 已 mount 时有效；否则调用方应通过 appBus.openApp('chat', {route:...})
  if (!threadState || !mounted) return false;
  return await switchThread({ mode: 'private', characterId: String(characterId || ''), groupId: '' });
}

export async function openGroupThread(groupId) {
  if (!threadState || !mounted) return false;
  return await switchThread({ mode: 'group', characterId: '', groupId: String(groupId || '') });
}

export function refreshCurrentThread() {
  if (!threadState || !mounted) return;
  // 触发当前 thread 的重新渲染（具体函数名按 thread.js 实际改）
  renderThread();
}

export async function sendUserMessage(text, extra = {}) {
  if (!threadState || !mounted) return null;
  const { sendThreadMessage } = await import('./thread-actions.js');
  return await sendThreadMessage(threadState, text, extra);
}
```

注意：`switchThread`/`renderThread`/`threadState` 的真实名称要 `Read` thread.js 后确认；如果 thread.js 没有这些函数，则改实现路径：让 chat.js 的 `appState.openPrivateThread` 等（已存在，见 `apps/chat.js:122-150`）作为底层实现，thread.js 的导出只是转发到 chat.js 的 appState。但 appState 是 chat.js 内部变量，最干净的做法是把 chat.js 的 appState 改为模块级导出。

**最终采用方案**（避免双向依赖）：在 `apps/chat.js` 把 `appState` 改为 `export const appState = {...}`，并在 `mount()` 末尾调用 `window.AppBus?.registerAPI('chat', getAppApi())`。

- [ ] **Step 3：在 apps/chat.js 导出 getAppApi 并在 mount 时注册**

修改 `apps/chat.js`：

把 `const appState = { ... }`（约 103-189 行）改为 `export const appState = { ... }`。

在文件末尾新增：

```js
export function getAppApi() {
  return {
    appState,
    async openPrivateThread(characterId) {
      // 如果 chat 未 mount，先 openApp，再通过 route 进入
      if (!mounted) {
        await window.AppBus.openApp('chat', { route: { name: 'thread', params: { mode: 'private', characterId: String(characterId || ''), groupId: '' } } });
        return;
      }
      await appState.openPrivateThread(characterId);
    },
    async openGroupThread(groupId) {
      if (!mounted) {
        await window.AppBus.openApp('chat', { route: { name: 'thread', params: { mode: 'group', characterId: '', groupId: String(groupId || '') } } });
        return;
      }
      await appState.openGroupThread(groupId);
    },
    async sendMessage(characterId, text, extra = {}) {
      // 确保 thread 已切到目标 characterId，再发送
      await this.openPrivateThread(characterId);
      // 等 thread mount 完成后调 thread.js 的 sendUserMessage
      const threadModule = await import('./chat/thread.js');
      return await threadModule.sendUserMessage(text, extra);
    },
    async refreshList() {
      const listModule = await import('./chat/list.js');
      listModule.refreshList?.();
    },
    async refreshCurrentThread() {
      const threadModule = await import('./chat/thread.js');
      threadModule.refreshCurrentThread?.();
    },
    // 统一记忆写入入口（转发到 core/memory.js）
    async recordExternalInteraction(payload) {
      return await window.AppBus.recordExternalInteraction(payload);
    },
    // 路由跳转（给 anniversary 等用）
    async navigateToRoute(route) {
      if (!mounted) return;
      await navigateTo(route);
    }
  };
}
```

在 `mount()` 函数末尾（`await renderRoute();` 之后）加：

```js
window.AppBus?.registerAPI('chat', getAppApi());
```

在 `unmount()` 函数开头加：

```js
window.AppBus?.registerAPI('chat', getAppApi()); // 重置为占位 API
```

注意：unmount 时 chat 不应注销 API，因为其他 APP 可能还想调 `openPrivateThread`（它会自动 openApp）。所以保留注册即可。

- [ ] **Step 4：删除 apps/chat.js 里的本地 recordExternalInteraction，改为转发**

把 `apps/chat.js:65-101` 的 `export async function recordExternalInteraction` 改为：

```js
export async function recordExternalInteraction(input = {}, legacyInteraction = {}) {
  // 统一走 core/memory.js（通过 appBus 转发），保留 source/keywords/importance
  const payload = normalizeExternalInteraction(input, legacyInteraction);
  return await window.AppBus.recordExternalInteraction(payload);
}
```

注意：`normalizeExternalInteraction`（311-327 行）保留不动，但它返回 `{characterId, role, content, source}`，与 appBus 期望的 payload 兼容。

同时把 `appState.recordExternalInteraction`（182-184 行）的实现也改为转发：

```js
async recordExternalInteraction(input = {}, legacyInteraction = {}) {
  return await recordExternalInteraction(input, legacyInteraction);
}
```

（这行其实没变化，因为外层 `recordExternalInteraction` 已经被改转发了。）

可以删除 `summarizeExternalMemory`/`createFallbackExternalMemory`/`isDuplicateMemory`/`createMemoryFingerprint`（329-389 行）这些 chat 版独有的辅助函数，因为它们不再被调用。删除前先 grep 确认无其他引用。

- [ ] **Step 5：让 chat 监听 characters:updated 自动刷新列表**

在 `apps/chat.js` 的 `mount()` 末尾加：

```js
unsubscribeCharsUpdated = window.AppBus?.on('characters:updated', async () => {
  if (currentRoute.name === 'list') {
    await renderRoute();
  }
});
```

在文件顶部 `let activeView = '';` 附近加 `let unsubscribeCharsUpdated = null;`。

在 `unmount()` 里加：

```js
if (unsubscribeCharsUpdated) { try { unsubscribeCharsUpdated(); } catch (_) {} unsubscribeCharsUpdated = null; }
```

- [ ] **Step 6：让 chat 监听 wallet/shop 事件，发出 toast 提示（不自动跳转，避免打扰）**

在 `mount()` 末尾加：

```js
unsubscribeWalletTransfer = window.AppBus?.on('wallet:transfer', ({ characterId, direction, amount } = {}) => {
  if (currentRoute.name !== 'thread' || currentRoute.params?.characterId !== characterId) {
    showToast(`${direction === 'in' ? '收到' : '发出'}一笔转账 ¥${amount}`);
  }
});
unsubscribeShopGift = window.AppBus?.on('shop:gift', ({ characterId, direction, itemName } = {}) => {
  if (currentRoute.name !== 'thread' || currentRoute.params?.characterId !== characterId) {
    showToast(`${direction === 'in' ? '收到' : '送出'}礼物：${itemName}`);
  }
});
```

在文件顶部加 `let unsubscribeWalletTransfer = null; let unsubscribeShopGift = null;`，在 `unmount()` 里同样清理。

- [ ] **Step 7：浏览器验证**

打开 index.html，进入 chat APP。在 console 执行：
```js
window.AppBus.getAPI('chat').appState;
window.AppBus.getAPI('chat').openPrivateThread('某个真实characterId');
```
Expected：chat 自动切到该角色的会话；如果 chat 没开，自动 openApp 并进入会话。

执行：
```js
window.AppBus.emit('characters:updated', {});
```
Expected：如果当前在 chat list 视图，列表刷新。

执行：
```js
window.AppBus.emit('wallet:transfer', { characterId: '某id', direction: 'in', amount: 100 });
```
Expected：弹出 toast "收到一笔转账 ¥100"。

- [ ] **Step 8：Commit**

```bash
git add apps/chat.js apps/chat/list.js apps/chat/thread.js
git commit -m "feat(chat): 暴露 getAppApi 并注册到 appBus，监听 characters/wallet/shop 事件，记忆写入转发到 core/memory.js"
```

---

## Phase 3：迁移现有调用方到统一 recordExternalInteraction

### Task 3.1：apps/wallet.js 改用 appBus.recordExternalInteraction + 统一事件名

**Files:**
- Modify: `apps/wallet.js`

- [ ] **Step 1：把 recordWalletMemory 改为转发到 appBus**

`Read` `apps/wallet.js:2249-2276` 的 `recordWalletMemory` 函数。改为：

```js
async function recordWalletMemory({ characterId, role, content, source }) {
  if (!characterId || !content) return null;
  try {
    return await window.AppBus.recordExternalInteraction({
      characterId, role, content, source, importance: 3
    });
  } catch (_) {
    return null;
  }
}
```

可以删除原来对 `./chat.js` 的动态 import 调用（保留 import 不删也行，但应确保不再被调用）。

- [ ] **Step 2：把转账事件的 dispatchEvent 改为 appBus.emit（保留 dispatchEvent 兼容旧监听者）**

`Read` `apps/wallet.js:1135` 和 `:1201` 附近。改为同时发两个事件：

```js
// 原：window.dispatchEvent(new CustomEvent('wallet-transfer-created', { detail: {...} }));
const payload = { characterId, direction: 'out', amount: value, note: cleanNote, transferId };
window.dispatchEvent(new CustomEvent('wallet-transfer-created', { detail: payload }));
window.AppBus?.emit('wallet:transfer', payload);
```

AI 转给用户的转账（1194 行附近）同理，`direction: 'in'`。

- [ ] **Step 3：在转账详情卡片加"在 chat 里查看"按钮**

找到转账列表的渲染函数（grep `renderTransferList` 或类似）。在每条转账卡片上加一个按钮：

```js
const viewInChatBtn = document.createElement('button');
viewInChatBtn.className = 'wallet-view-chat-btn';
viewInChatBtn.textContent = '在聊天里看';
viewInChatBtn.addEventListener('click', () => {
  if (transfer.characterId) {
    window.AppBus.openApp('chat', { route: { name: 'thread', params: { mode: 'private', characterId: transfer.characterId, groupId: '' } } });
  }
});
```

注意：按钮样式可复用 wallet 现有按钮 class，避免新增 CSS。

- [ ] **Step 4：浏览器验证**

打开 wallet，做一笔转账。进入 chat 该角色会话，检查 `memories` store（在 IndexedDB 里）能看到带 `source: '钱包转账'`、`keywords`、`importance` 的记忆。在转账列表点"在聊天里看"，能跳到该角色会话。

- [ ] **Step 5：Commit**

```bash
git add apps/wallet.js
git commit -m "refactor(wallet): 记忆写入走 appBus，转账事件改发 wallet:transfer，新增跳转 chat 按钮"
```

---

### Task 3.2：apps/shop.js 同步迁移

**Files:**
- Modify: `apps/shop.js`

- [ ] **Step 1：把 recordGiftMemory 改为转发**

`Read` `apps/shop.js:1608-1635`。改为：

```js
async function recordGiftMemory({ characterId, role, content, source }) {
  if (!characterId || !content) return null;
  try {
    return await window.AppBus.recordExternalInteraction({
      characterId, role, content, source, importance: 3
    });
  } catch (_) {
    return null;
  }
}
```

- [ ] **Step 2：礼物事件改发 appBus.emit('shop:gift', ...)**

`Read` `apps/shop.js:1520, 1575`。改为同时发旧事件和 `shop:gift`：

```js
const payload = { characterId, direction: 'in', itemName, itemId, note };
window.dispatchEvent(new CustomEvent('shop-gift-created', { detail: payload }));
window.AppBus?.emit('shop:gift', payload);
```

用户送 AI 礼物（1568 行附近）`direction: 'out'`。

- [ ] **Step 3：浏览器验证 + Commit**

```bash
git add apps/shop.js
git commit -m "refactor(shop): 记忆写入走 appBus，礼物事件改发 shop:gift"
```

---

### Task 3.3：apps/moments.js 同步迁移

**Files:**
- Modify: `apps/moments.js`

- [ ] **Step 1：把 recordToChat 改为转发**

`Read` `apps/moments.js:579-588`。改为：

```js
async function recordToChat(payload) {
  if (!payload?.characterId || !payload?.content) return null;
  try {
    return await window.AppBus.recordExternalInteraction({
      characterId: payload.characterId,
      role: payload.role || 'user',
      content: payload.content,
      source: payload.source || '朋友圈',
      importance: 3
    });
  } catch (_) {
    return null;
  }
}
```

- [ ] **Step 2：把 moments 的 badge emit 保留，但补发 moments:interaction 事件**

`Read` `apps/moments.js:106, 134, 460, 515`。在每次 emit `badge:moments` 的位置同时 emit `moments:interaction`：

```js
window.AppBus?.emit('moments:interaction', { type: 'like', characterId: post.authorId, postId: post.id });
```

类型按上下文：`like`/`comment`/`reply`/`ai-interaction`。

- [ ] **Step 3：浏览器验证 + Commit**

```bash
git add apps/moments.js
git commit -m "refactor(moments): 记忆写入走 appBus，补发 moments:interaction 事件"
```

---

### Task 3.4：apps/games/* 改 import 路径

**Files:**
- Modify: `apps/games/tarot.js`
- Modify: `apps/games/truth.js`
- Modify: `apps/games/draw-guess.js`
- Modify: `apps/games/liars-tavern.js`

- [ ] **Step 1：把每个文件的 import 从 '../../core/memory.js' 改为 '../../core/app-bus.js'**

每个文件顶部第 27-32 行附近：

```js
// 原：import { recordExternalInteraction } from '../../core/memory.js';
import { recordExternalInteraction } from '../../core/app-bus.js';
```

调用点不变（`recordExternalInteraction({ characterId, role, content, source, ... })`），因为 app-bus 的签名兼容。

- [ ] **Step 2：浏览器验证每个游戏能正常结算并写记忆**

依次打开塔罗、真心话、你画我猜、骗子酒馆，玩一局。在 IndexedDB `memories` store 里确认有 `source: 'tarot_game'`/`'truth_game'`/`'draw_guess_game'`/`'liars_tavern'` 的记忆，且字段完整（含 keywords、importance）。

- [ ] **Step 3：Commit**

```bash
git add apps/games/tarot.js apps/games/truth.js apps/games/draw-guess.js apps/games/liars-tavern.js
git commit -m "refactor(games): 记忆写入改走 app-bus 统一入口"
```

---

## Phase 4：接通死事件（让现有 emit 真的有监听者）

### Task 4.1：apps/gallery.js 监听 grudge:punishment 自动刷新

**Files:**
- Modify: `apps/gallery.js`

- [ ] **Step 1：在 mount 时订阅 grudge:punishment**

`Read` `apps/gallery.js` 顶部 import 和 `mount` 函数。在 mount 末尾加：

```js
unsubscribeGrudgePunishment = window.AppBus?.on('grudge:punishment', () => {
  // chat 里发生惩罚事件，刷新记仇本列表
  refreshGrudges();
});
```

在文件顶部加 `let unsubscribeGrudgePunishment = null;`。在 `unmount()` 里清理。

`refreshGrudges` 是 gallery 已有的内部刷新函数（grep 确认；若名字不同按实际改）。

- [ ] **Step 2：浏览器验证**

打开 chat 的某个角色会话，触发一个惩罚事件（具体怎么触发要 `Read` `apps/chat/thread-ai.js:2069` 附近的逻辑）。同时打开 gallery APP，确认列表自动刷新（不需要手动点刷新按钮）。

- [ ] **Step 3：Commit**

```bash
git add apps/gallery.js
git commit -m "feat(gallery): 监听 grudge:punishment 事件自动刷新列表"
```

---

### Task 4.2：apps/characters.js 改发 appBus 事件

**Files:**
- Modify: `apps/characters.js`

- [ ] **Step 1：在 emit desktop:refresh 之外，补发 characters:updated**

`Read` `apps/characters.js:1854-1859`。改为：

```js
window.AppBus?.emit('characters:updated', { characterId });
window.dispatchEvent(new CustomEvent('characters:updated', { detail: { characterId } }));
window.dispatchEvent(new CustomEvent('chat:refresh', { detail: { characterId } }));
window.AppBus?.emit('chat:refresh', { characterId });
window.dispatchEvent(new CustomEvent('desktop:refresh'));
window.refreshDesktopBadges?.();
```

（保留旧的 dispatchEvent 兼容。）

- [ ] **Step 2：浏览器验证**

打开 characters APP，编辑一个角色。切到 chat APP，确认 chat list 自动刷新（如果 chat 已开），或下次打开 chat 时看到最新角色。

- [ ] **Step 3：Commit**

```bash
git add apps/characters.js
git commit -m "feat(characters): 同时通过 appBus 发 characters:updated，chat 可监听"
```

---

## Phase 5：深度联动 5 个孤岛 APP

### Task 5.1：apps/gallery.js — 增加惩罚事件回写记忆 + 双向跳转

**Files:**
- Modify: `apps/gallery.js`

- [ ] **Step 1：在 gallery 添加新记仇条目时，可选同步给 chat 记忆**

`Read` gallery 的"新增记仇"函数。在保存按钮的 click handler 里，加一个"让 TA 也记得这件事"的复选框 + 角色选择器（复用 characters store）。保存时：

```js
if (syncToChat && selectedCharacterId) {
  await window.AppBus.recordExternalInteraction({
    characterId: selectedCharacterId,
    role: 'assistant',
    content: `我记了一笔仇：${grudge.title}。${grudge.note || ''}`,
    source: '记仇本',
    importance: 4
  });
}
```

- [ ] **Step 2：在每条记仇卡片上加"在 chat 里看"按钮**

```js
viewInChatBtn.addEventListener('click', () => {
  if (grudge.characterId) {
    window.AppBus.openApp('chat', { route: { name: 'thread', params: { mode: 'private', characterId: grudge.characterId, groupId: '' } } });
  }
});
```

- [ ] **Step 3：浏览器验证 + Commit**

```bash
git add apps/gallery.js
git commit -m "feat(gallery): 新增记仇可同步角色记忆，卡片支持跳转 chat"
```

---

### Task 5.2：apps/memo.js — 备忘录同步角色记忆

**Files:**
- Modify: `apps/memo.js`

- [ ] **Step 1：在 memo 编辑表单加"同步给 TA"复选框 + 角色选择器**

`Read` `apps/memo.js` 的编辑表单渲染函数（grep `editMemo` 或 `openEditor`）。在表单底部加：

```html
<label class="memo-sync-chat">
  <input type="checkbox" id="memo-sync-chat-toggle"> 让 TA 也记得这件事
  <select id="memo-sync-character" disabled>
    <!-- 动态填充 characters -->
  </select>
</label>
```

复选框 change 时启用/禁用 select。select 的 options 从 `getAllDB('characters')` 拉取。

- [ ] **Step 2：保存时调 appBus.recordExternalInteraction**

```js
if (syncEnabled && selectedCharacterId) {
  await window.AppBus.recordExternalInteraction({
    characterId: selectedCharacterId,
    role: 'assistant',
    content: `我在备忘录里记下了：${memo.title || ''}。${memo.content || ''}`.trim(),
    source: '备忘录',
    importance: memo.category === 'todo' ? 4 : 3
  });
}
```

- [ ] **Step 3：浏览器验证 + Commit**

```bash
git add apps/memo.js
git commit -m "feat(memo): 备忘录可选同步角色记忆"
```

---

### Task 5.3：apps/anniversary.js — 纪念日触发 chat 主动问候

**Files:**
- Modify: `apps/anniversary.js`

- [ ] **Step 1：在 mount 时启动一个轻量定时器，每小时检查一次是否有今天到的纪念日**

`Read` `apps/anniversary.js` 的 mount 函数。在末尾加：

```js
anniversaryTimer = window.setInterval(checkAnniversaryGreetings, 60 * 60 * 1000);
checkAnniversaryGreetings(); // 启动时立即检查一次当天
```

文件顶部加 `let anniversaryTimer = null; let greetedKeys = new Set(getData('app_anniversary_greeted') || []);`。unmount 时 `clearInterval(anniversaryTimer)`。

- [ ] **Step 2：实现 checkAnniversaryGreetings**

```js
async function checkAnniversaryGreetings() {
  const list = getAnniversaries();
  if (!list.length) return;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()+1}-${today.getDate()}`;
  for (const item of list) {
    const date = parseDate(item.date);
    if (!date) continue;
    const isToday = date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
    if (!isToday) continue;
    const greetKey = `${item.id}_${todayKey}`;
    if (greetedKeys.has(greetKey)) continue;
    greetedKeys.add(greetKey);
    setData('app_anniversary_greeted', [...greetedKeys]);
    // 写入角色记忆
    if (item.characterId) {
      await window.AppBus.recordExternalInteraction({
        characterId: item.characterId,
        role: 'assistant',
        content: `今天是${item.title || '纪念日'}。${item.note || ''}`,
        source: '纪念日',
        importance: 5
      });
    }
    // 弹 toast 提醒用户
    showToast(`今天是 ${item.title || '纪念日'}，要不要去聊聊？`);
  }
}
```

注意：不自动 openApp（避免打扰），只 toast + 写记忆。用户点 toast 或自己去 chat。

- [ ] **Step 3：在每条纪念日条目卡片上加"去聊聊"按钮**

```js
chatBtn.addEventListener('click', () => {
  if (item.characterId) {
    window.AppBus.openApp('chat', { route: { name: 'thread', params: { mode: 'private', characterId: item.characterId, groupId: '' } } });
  } else {
    window.AppBus.openApp('chat');
  }
});
```

- [ ] **Step 4：浏览器验证 + Commit**

```bash
git add apps/anniversary.js
git commit -m "feat(anniversary): 纪念日当天写角色记忆并提醒，卡片支持跳转 chat"
```

---

### Task 5.4：apps/worldbook.js — 暴露 API 给 chat 注入世界观

**Files:**
- Modify: `apps/worldbook.js`
- Modify: `apps/chat/thread-ai.js`

- [ ] **Step 1：在 worldbook mount 时注册 API**

`Read` `apps/worldbook.js` 的 mount 函数。在末尾加：

```js
window.AppBus?.registerAPI('worldbook', {
  getEntries(characterId = '') {
    // 返回该角色绑定的世界观条目；若 characterId 为空返回全局条目
    return getEntriesForCharacter(characterId);
  },
  getEntry(id) {
    return getEntryById(id);
  },
  getAll() {
    return getAllEntries();
  }
});
```

`getEntriesForCharacter`/`getEntryById`/`getAllEntries` 是 worldbook 内部函数，按实际命名调整（若不存在则新建，从 storage 读 `worldbook` store）。

- [ ] **Step 2：编辑/删除条目时发 worldbook:updated 事件**

在保存/删除按钮 handler 里加：

```js
window.AppBus?.emit('worldbook:updated', { characterId, entryId });
```

- [ ] **Step 3：在 chat 的 thread-ai.js 构建 prompt 时，注入 worldbook**

`Read` `apps/chat/thread-ai.js` 找到 prompt 构建函数（grep `buildSystemPrompt` 或 `systemMessages`）。在角色相关上下文里加：

```js
const worldbookApi = window.AppBus?.getAPI('worldbook');
if (worldbookApi) {
  const entries = worldbookApi.getEntries(state.characterId);
  if (entries && entries.length) {
    const worldbookText = entries.map(e => `- ${e.title}：${e.content}`).join('\n');
    // 加到 system prompt 里
    systemPrompt += `\n\n【世界观参考】\n${worldbookText}`;
  }
}
```

注意：要受 character 配置控制（如果 character 有 `worldbookEnabled` 字段才注入；否则所有角色都会被注入可能影响性能）。如果没有该字段，则只在 entries 非空时注入，且每条不超过 200 字。

- [ ] **Step 4：浏览器验证 + Commit**

打开 worldbook，新增一条"世界观：主角怕黑"。打开 chat 该角色会话，发消息，确认 AI 回复时考虑了"怕黑"这一设定。

```bash
git add apps/worldbook.js apps/chat/thread-ai.js
git commit -m "feat(worldbook): 暴露 getEntries API，chat 构建 prompt 时注入世界观"
```

---

### Task 5.5：apps/dream.js — 梦境写入角色记忆

**Files:**
- Modify: `apps/dream.js`

- [ ] **Step 1：在梦境记录保存时调 appBus.recordExternalInteraction**

`Read` `apps/dream.js` 找到梦境保存函数（grep `saveDream` 或 `createDream`）。在保存成功后：

```js
if (dream.characterId) {
  await window.AppBus.recordExternalInteraction({
    characterId: dream.characterId,
    role: 'assistant',
    content: `我做了一个梦：${dream.title || ''}。${dream.content || ''}`.trim(),
    source: '梦境',
    importance: 3,
    mood: dream.mood || ''
  });
}
```

- [ ] **Step 2：在梦境卡片加"和 TA 聊聊这个梦"按钮**

```js
chatBtn.addEventListener('click', () => {
  if (dream.characterId) {
    window.AppBus.openApp('chat', { route: { name: 'thread', params: { mode: 'private', characterId: dream.characterId, groupId: '' } } });
  }
});
```

- [ ] **Step 3：浏览器验证 + Commit**

```bash
git add apps/dream.js
git commit -m "feat(dream): 梦境保存写入角色记忆，卡片支持跳转 chat"
```

---

### Task 5.6：apps/music.js — 共享播放状态（轻度联动）

**Files:**
- Modify: `apps/music.js`

- [ ] **Step 1：music 启动时注册 API 暴露当前歌曲**

`Read` `apps/music.js` 的 mount 函数。在末尾加：

```js
window.AppBus?.registerAPI('music', {
  getCurrentSong() { return currentSong; },
  isPlaying() { return isPlaying; },
  async playSong(song) { /* 复用现有播放逻辑 */ },
  togglePlay() { /* ... */ }
});
```

注意：music 已经通过 `window.musicPlayer`（见 `index.html:1725-1745`）暴露了部分能力。这里只是注册到 appBus 让其他 APP 通过统一通道访问。如果 `window.musicPlayer` 已经够用，此 Task 可简化为只在 appBus 注册一个引用：

```js
window.AppBus?.registerAPI('music', window.musicPlayer || {});
```

- [ ] **Step 2：浏览器验证 + Commit**

```bash
git add apps/music.js
git commit -m "feat(music): 注册到 appBus 暴露播放 API"
```

---

## Phase 6：整体回归 + 文档

### Task 6.1：浏览器整体回归测试

- [ ] **Step 1：依次打开每个 APP 确认无报错**

chat、moments、settings、gallery、characters、worldbook、wallet、shop、memo、anniversary、games、music、dream。打开 DevTools Console 确认无新增 error。

- [ ] **Step 2：跨 APP 联动 e2e 验证**

1. 在 wallet 给角色 A 转账 → 进入 chat A 会话 → 看到转账记忆 + 收到 toast
2. 在 shop 给角色 A 送礼物 → 进入 chat A 会话 → 看到礼物记忆
3. 在 moments 给角色 A 的朋友圈点赞 → chat A 记忆里有
4. 玩一局塔罗 → chat 选定读牌角色记忆里有塔罗结果
5. 在 gallery 新增记仇（同步给 A）→ chat A 记忆里有
6. 在 memo 新建备忘录（同步给 A）→ chat A 记忆里有
7. 在 anniversary 加一个今天到的纪念日（绑定 A）→ 等定时器触发 → toast + chat A 记忆里有
8. 在 worldbook 加一条 A 的世界观 → chat A 会话里发消息 → AI 回复体现该设定
9. 在 dream 记录一个梦（绑定 A）→ chat A 记忆里有
10. 在 characters 编辑 A 的名字 → 切到 chat list → 列表刷新显示新名字
11. 在 chat 里触发惩罚事件 → 切到 gallery → 列表自动刷新

每一步都在 IndexedDB `memories` store 里确认记忆字段完整（含 source/keywords/importance）。

- [ ] **Step 3：检查事件日志**

在 console 执行 `window.AppBus.getEventLog()`，确认所有事件都被记录，没有死事件。

- [ ] **Step 4：Commit**

```bash
git add -A
git commit -m "test: 完成 APP 联动整体回归"
```

（此 commit 仅在发现并修复回归 bug 时产生；如无改动可跳过。）

---

### Task 6.2：在 README 加联动契约说明

**Files:**
- Modify: `README.md`

- [ ] **Step 1：把 README 从一行情话扩充为包含联动契约的文档**

在原有内容下追加：

```markdown
# 小手机 APP 联动契约

## 统一中枢
- `core/app-bus.js` 是所有 APP 互相联动的入口
- 通过 `window.AppBus` 全局访问，或在 APP 的 mount options 里拿到 `appBus`/`openApp`

## 注册对外 API
每个 APP 在 `mount()` 末尾注册：
\`\`\`js
window.AppBus.registerAPI('myapp', { foo() {...}, bar() {...} });
\`\`\`
其他 APP 调用：
\`\`\`js
const api = window.AppBus.getAPI('myapp');
if (api) api.foo();
\`\`\`

## 事件契约
事件名采用 `domain:action` 命名：
- `characters:updated` — 角色信息变更
- `chat:refresh` — chat 需要刷新
- `wallet:transfer` — 钱包转账
- `shop:gift` — 商店礼物
- `moments:interaction` — 朋友圈互动
- `grudge:punishment` — 记仇本惩罚
- `worldbook:updated` — 世界观变更

监听：
\`\`\`js
const off = window.AppBus.on('characters:updated', (data) => {...});
// unmount 时 off();
\`\`\`

## 跨 APP 跳转（带参）
\`\`\`js
await window.AppBus.openApp('chat', {
  route: { name: 'thread', params: { mode: 'private', characterId: 'xxx', groupId: '' } }
});
\`\`\`

## 写入角色记忆（统一入口）
\`\`\`js
await window.AppBus.recordExternalInteraction({
  characterId: 'xxx',
  role: 'user' | 'assistant',
  content: '...',
  source: '我的小APP',
  importance: 1-5,
  mood: '开心'
});
\`\`\`
所有写入都走 `core/memory.js`，保留 source/keywords/importance/mood，自动去重。

## 各 APP 已注册的 API
- `chat`: openPrivateThread / openGroupThread / sendMessage / refreshList / refreshCurrentThread
- `worldbook`: getEntries / getEntry / getAll
- `music`: getCurrentSong / isPlaying / playSong / togglePlay
- 其他 APP 待补
```

- [ ] **Step 2：Commit**

```bash
git add README.md
git commit -m "docs: 补充 APP 联动契约说明"
```

---

## Self-Review

**Spec coverage:**
- ✅ 统一中枢（core/app-bus.js）— Task 1.1
- ✅ 统一事件契约 — Phase 4 + 各 Task 的 emit 改造
- ✅ 统一记忆写入（合并两套 recordExternalInteraction）— Task 2.1 Step 4 + Phase 3 全部
- ✅ createAppContext 加 openApp 和带参 — Task 1.2 Step 3
- ✅ chat 暴露 openPrivateThread 等入口 — Task 2.1
- ✅ 5 个孤岛 APP 深度联动 — Task 5.1（gallery）、5.2（memo）、5.3（anniversary）、5.4（worldbook）、5.5（dream）
- ✅ 死事件接上监听者 — Task 4.1（grudge）、4.2（characters:updated）、2.1 Step 6（wallet/shop 事件被 chat 听到）

**Placeholder scan:** 无 TBD/TODO，所有代码块都给出完整内容。少数地方写了"按实际命名调整"，因为没读完每个 APP 全文，需要执行者 `Read` 确认内部函数名——这是必要的，避免计划写错函数名。

**Type consistency:** `recordExternalInteraction` 在所有调用点签名统一为 `{characterId, role, content, source, importance?, mood?, character?, userProfile?, callName?}`。`openApp(appId, options)` 在 host 和 appBus 一致。`getAPI(appId)` 返回值统一为 object 或 null。

**风险点：**
1. Task 2.1 Step 2 涉及 thread.js 内部状态变量名，需要执行者实际 Read 确认；若 thread.js 没有 `switchThread`/`renderThread` 等函数，则要降级为"通过 appBus.openApp('chat', {route:...}) 让 chat 重新 mount 进入目标会话"，但这样会丢当前会话状态。建议执行时优先确认 thread.js 已有的切换函数。
2. Task 5.4 worldbook 注入 prompt 可能增加 token 消耗，应受配置控制。
3. Phase 3 改造涉及多处 `import('./chat.js')`，删除前要 grep 确认无遗漏。
4. 整个改造跨 12+ 文件，建议每个 Phase 结束做一次浏览器整体回归，避免后期排查困难。
