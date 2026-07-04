// core/inbox.js
// 消息中心数据层。聚合各 App 事件成"消息卡片"，供消息中心 App 展示，
// 并提供 getRecentEventsPrompt() 给 AI 聊天注入最近事件上下文。
// 职责：
//   1) 监听关键 App 事件，自动生成结构化消息（存 localStorage）
//   2) 提供消息列表 / 标记已读 / 清空
//   3) 从 events history 读最近事件，生成 AI 上下文文本
// 依赖：core/storage-keys.js, core/storage.js, core/events.js
// 红线：不硬编码事件名到 App，统一在这里维护映射。

import { KEYS } from './storage-keys.js';
import { getData, setData, generateId, getNow } from './storage.js';
import bus from './events.js';

const INBOX_MAX = 100;

// 事件 -> 消息卡片生成器映射
// 每个生成器返回 { app, title, body, type } 或 null（不生成消息）
const EVENT_HANDLERS = {
  'chat:message-received': (p) => ({
    app: 'chat', type: 'message',
    title: p?.characterName ? `${p.characterName} 发来消息` : '新消息',
    body: p?.preview || ''
  }),
  'moments:new': (p) => ({
    app: 'moments', type: 'social',
    title: p?.author ? `${p.author} 发了新动态` : '朋友圈新动态',
    body: p?.preview || ''
  }),
  'moments:commented': (p) => ({
    app: 'moments', type: 'social',
    title: `${p?.commentBy || '有人'} 评论了你的动态`,
    body: p?.text || ''
  }),
  'moments:liked': (p) => ({
    app: 'moments', type: 'social',
    title: `${p?.likedBy || '有人'} 赞了你的动态`,
    body: p?.preview || ''
  }),
  'wallet:changed': (p) => ({
    app: 'wallet', type: 'finance',
    title: p?.delta > 0 ? '收到一笔转账' : '钱包有变动',
    body: p?.note ? `备注：${p.note}` : ''
  }),
  'shop:gift-sent': (p) => ({
    app: 'shop', type: 'gift',
    title: p?.giftName ? `送出了 ${p.giftName}` : '送出礼物',
    body: p?.to ? `给 ${p.to}` : ''
  }),
  'shop:gift-received': (p) => ({
    app: 'shop', type: 'gift',
    title: p?.giftName ? `收到 ${p.giftName}` : '收到礼物',
    body: p?.from ? `来自 ${p.from}` : ''
  }),
  'grudge:written': (p) => ({
    app: 'grudge', type: 'mood',
    title: '她有点生气啦',
    body: p?.reason || ''
  }),
  'grudge:forgiven': (p) => ({
    app: 'grudge', type: 'mood',
    title: '她原谅你啦',
    body: p?.note || '哄好啦'
  }),
  'memo:reminder': (p) => ({
    app: 'memo', type: 'reminder',
    title: '备忘录提醒',
    body: p?.title || ''
  }),
  'anniversary:reminder': (p) => ({
    app: 'anniversary', type: 'reminder',
    title: '纪念日快到啦',
    body: p?.title || ''
  }),
  'games:result': (p) => ({
    app: 'games', type: 'game',
    title: `游戏结束：${p?.game || ''}`,
    body: p?.result || ''
  }),
  'music:shared': (p) => ({
    app: 'music', type: 'music',
    title: '把正在听的歌分享到了朋友圈',
    body: p?.title ? `${p.title} - ${p.artist || ''}` : ''
  }),
  'memory:written': (p) => ({
    app: 'memory', type: 'memory',
    title: '记下了新的事',
    body: p?.memory?.content?.slice(0, 60) || ''
  })
};

let initialized = false;

/** 初始化事件监听（只跑一次） */
export function initInbox() {
  if (initialized) return;
  initialized = true;
  Object.keys(EVENT_HANDLERS).forEach((name) => {
    bus.on(name, (payload) => {
      try {
        const handler = EVENT_HANDLERS[name];
        const card = handler(payload);
        if (card) pushInbox(card);
      } catch (e) {
        console.warn('[inbox] 事件处理失败', name, e);
      }
    });
  });
  // 预加载记仇本监听器：让聊天里的伤人/道歉关键词即使没打开过记仇本 App 也能触发自动记仇/原谅。
  // 动态 import 不形成静态依赖，加载失败不影响消息中心。
  import('../apps/grudge/index.js').catch((e) => {
    console.warn('[inbox] 预加载记仇本监听失败', e);
  });
}

// ════════════════════════════════════════
// 消息存储
// ════════════════════════════════════════

export function getInboxMessages() {
  const list = getData(KEYS.inboxMessages, []);
  return Array.isArray(list) ? list : [];
}

export function pushInbox(item) {
  if (!item || !item.title) return;
  const list = getInboxMessages();
  const msg = {
    id: generateId('inbox'),
    app: item.app || 'system',
    type: item.type || 'default',
    title: String(item.title).slice(0, 100),
    body: String(item.body || '').slice(0, 200),
    read: false,
    t: Date.now(),
    createdAt: getNow()
  };
  list.unshift(msg);
  if (list.length > INBOX_MAX) list.length = INBOX_MAX;
  setData(KEYS.inboxMessages, list);
  bus.emit('inbox:new', { message: msg });
  return msg;
}

export function markInboxRead(id) {
  const list = getInboxMessages();
  const idx = list.findIndex((m) => m.id === id);
  if (idx === -1) return false;
  list[idx].read = true;
  setData(KEYS.inboxMessages, list);
  bus.emit('inbox:updated', { id });
  return true;
}

export function markAllInboxRead() {
  const list = getInboxMessages();
  list.forEach((m) => { m.read = true; });
  setData(KEYS.inboxMessages, list);
  bus.emit('inbox:updated', {});
}

export function deleteInboxMessage(id) {
  const list = getInboxMessages().filter((m) => m.id !== id);
  setData(KEYS.inboxMessages, list);
  bus.emit('inbox:updated', { id, deleted: true });
}

export function clearInbox() {
  setData(KEYS.inboxMessages, []);
  bus.emit('inbox:updated', { cleared: true });
}

export function getUnreadCount() {
  return getInboxMessages().filter((m) => !m.read).length;
}

// ════════════════════════════════════════
// AI 上下文：最近事件文本
// ════════════════════════════════════════

const EVENT_LABELS = {
  'chat:message-received': '聊天',
  'moments:new': '朋友圈发动态',
  'moments:commented': '朋友圈被评论',
  'moments:liked': '朋友圈被点赞',
  'wallet:changed': '钱包变动',
  'shop:gift-sent': '送出礼物',
  'shop:gift-received': '收到礼物',
  'grudge:written': '她记仇了',
  'grudge:forgiven': '她原谅了',
  'memo:reminder': '备忘录提醒',
  'anniversary:reminder': '纪念日提醒',
  'games:result': '游戏结束',
  'music:shared': '分享歌曲',
  'memory:written': '记住新的事'
};

/**
 * 生成最近事件文本，注入 AI 上下文。
 * @param {number} limit 默认 8 条
 */
export function getRecentEventsPrompt(limit = 8) {
  const history = bus.getHistory();
  if (!history || !history.length) return '';
  // 倒序取最近 limit 条，过滤掉系统事件
  const recent = history
    .slice(-limit * 2)
    .reverse()
    .filter((h) => EVENT_LABELS[h.name])
    .slice(0, limit);
  if (!recent.length) return '';
  const now = Date.now();
  const lines = recent.map((h) => {
    const label = EVENT_LABELS[h.name] || h.name;
    const ageMin = Math.floor((now - h.t) / 60000);
    const timeStr = ageMin < 1 ? '刚刚' : ageMin < 60 ? `${ageMin}分钟前` : `${Math.floor(ageMin / 60)}小时前`;
    const detail = h.payload?.preview || h.payload?.note || h.payload?.title || h.payload?.reason || '';
    const tail = detail ? `：${String(detail).slice(0, 40)}` : '';
    return `- ${timeStr} ${label}${tail}`;
  });
  return lines.join('\n');
}
