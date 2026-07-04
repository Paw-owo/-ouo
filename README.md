可以多喜欢我一点吗૮₍♡>𖥦<₎ა

# APP 联动契约

所有 APP 通过 `core/app-bus.js` 这个统一中枢互相联动。每个 APP 在 `mount()` 时通过 `window.AppBus.registerAPI(appId, api)` 暴露自己的能力，其他 APP 通过 `window.AppBus.getAPI(appId)` 调用，或通过 `window.AppBus.on(eventName, handler)` 订阅事件。

## 核心 API

| 方法 | 说明 |
| --- | --- |
| `registerAPI(appId, api)` | 注册本 APP 对外暴露的能力 |
| `getAPI(appId)` | 取得某个 APP 暴露的 API |
| `hasAPI(appId)` | 判断某个 APP 是否已注册 API |
| `on(eventName, handler)` | 订阅事件，返回 unsubscribe 函数 |
| `once(eventName, handler)` | 订阅一次 |
| `emit(eventName, data)` | 发出事件 |
| `openApp(appId, options)` | 打开 APP，`options.route` 可带路由参数 |
| `recordExternalInteraction(payload)` | 统一写入角色记忆入口，字段：`characterId`/`role`/`content`/`source`/`importance`/`mood` |

## 已注册的 APP API

| appId | 主要能力 |
| --- | --- |
| `chat` | `openPrivateThread(characterId)`、`openGroupThread(groupId)`、`sendMessage(characterId, text, extra)`、`recordExternalInteraction(payload)`、`refreshList()`、`refreshCurrentThread()`、`navigateToRoute(route)` |
| `worldbook` | `getEntries()`、`getEntry(id)`、`getAll()`、`getVisual(entryId)`、`getWorldbookForCharacter(characterId)` |
| `music` | `isPlaying()`、`getCurrentSong()`、`togglePlay()`、`playNext()`、`playPrevious()`、`playSong(songId)`、`getSongs()`、`getPlaylists()` |

## 约定事件

| 事件名 | 触发方 | 载荷 |
| --- | --- | --- |
| `characters:updated` | characters | `{}` |
| `wallet:transfer` | wallet | `{ characterId, amount, direction, ... }` |
| `shop:gift` | shop | `{ characterId, itemName, direction, ... }` |
| `moments:interaction` | moments | `{ type, characterId, ... }` |
| `grudge:punishment` | chat (AI 触发) | `{ characterId, ... }` |
| `worldbook:updated` | worldbook | `{ entryId, saved?, deleted? }` |
| `dream:created` | dream | `{ dreamId, characterId, mood }` |
| `music:play` | 任意 APP | `{ songId? }` |

## 跳转 chat 的统一方式

任何 APP 想跳到某个角色的私聊：

```js
window.AppBus.openApp('chat', {
  route: { name: 'thread', params: { mode: 'private', characterId, groupId: '' } }
});
```

## 写入角色记忆的统一方式

任何 APP 想给某个角色追加一条记忆（会出现在 chat 的 memory prompt 里）：

```js
await window.AppBus.recordExternalInteraction({
  characterId,
  role: 'assistant', // 或 'user'
  content: '...',
  source: 'APP 名称',
  importance: 3, // 1-5
  mood: '' // 可选
});
```

> 新增 APP 时，在 `mount()` 里调用 `registerAPI` 暴露能力、在关键状态变更处 `emit` 事件、通过 `recordExternalInteraction` 写记忆、通过 `openApp('chat', ...)` 跳转，即可融入联动。
