// ============================================
// inbox.js — 消息/事件汇聚数据层
// 用户可见事件入口 + AI可读事件入口
// 不是通知中心UI，是数据层
// ============================================

import events from './events.js';
import { getNotifications, saveNotification, markNotificationRead } from './storage.js';

// inbox 事件记录缓存
let _inboxEntries = [];
const MAX_INBOX = 500;

// 监听通知分发事件，写入inbox
events.on('notification:dispatched', (payload) => {
  _addToInbox({
    type: 'notification',
    source: 'notification',
    appId: payload.notification.appId,
    title: payload.notification.title,
    content: payload.notification.content,
    timestamp: payload.notification.timestamp,
    id: payload.notification.id,
    data: payload.notification.data
  });
});

// 监听通用APP事件，写入inbox
events.on('*', (payload) => {
  const { event, data } = payload;

  // 跳过内部事件和通知类事件（通知类已在上面处理）
  if (event.startsWith('notify:') || event.startsWith('notification:') || event.startsWith('inbox:')) return;
  if (event === '*') return;

  _addToInbox({
    type: 'event',
    source: 'app',
    event,
    appId: data.appId || data.source || 'system',
    title: data.title || '',
    content: data.content || '',
    timestamp: payload.timestamp,
    id: payload.id,
    data: data.data || data
  });
});

function _addToInbox(entry) {
  _inboxEntries.push(entry);
  if (_inboxEntries.length > MAX_INBOX) {
    _inboxEntries = _inboxEntries.slice(-MAX_INBOX);
  }
  events.emit('inbox:updated', { entry });
}

// 获取inbox条目
function getInboxEntries(options = {}) {
  const { limit = 50, offset = 0, source, appId, type } = options;

  let filtered = [..._inboxEntries];

  if (source) filtered = filtered.filter(e => e.source === source);
  if (appId) filtered = filtered.filter(e => e.appId === appId);
  if (type) filtered = filtered.filter(e => e.type === type);

  filtered.sort((a, b) => b.timestamp - a.timestamp);

  return filtered.slice(offset, offset + limit);
}

// 获取AI可读的近期事件（用于 ai-context.js）
function getAIReadableEvents(options = {}) {
  const { limit = 20, since } = options;

  let entries = [..._inboxEntries];

  if (since) {
    entries = entries.filter(e => e.timestamp >= since);
  }

  entries.sort((a, b) => b.timestamp - a.timestamp);

  return entries.slice(0, limit).map(e => ({
    id: e.id,
    appId: e.appId,
    type: e.type,
    event: e.event,
    title: e.title,
    content: e.content,
    timestamp: e.timestamp,
    summary: e.title || e.content || `${e.appId}: ${e.event || ''}`
  }));
}

// 获取用户可见的通知列表（从持久化存储读取）
async function getUserNotifications(options = {}) {
  const { limit = 50, appId } = options;
  const notifications = await getNotifications(appId);
  return notifications.slice(0, limit);
}

// 标记通知已读
async function markAsRead(notificationId) {
  await markNotificationRead(notificationId);
  // 同步更新inbox缓存
  const entry = _inboxEntries.find(e => e.id === notificationId);
  if (entry) entry.read = true;
}

// 获取未读数量
async function getUnreadCount() {
  const notifications = await getNotifications();
  return notifications.filter(n => !n.read).length;
}

// 清空inbox缓存
function clearInbox() {
  _inboxEntries = [];
  events.emit('inbox:cleared', {});
}

// 手动添加inbox条目（用于系统级消息）
function addInboxEntry(entry) {
  _addToInbox({
    type: entry.type || 'system',
    source: entry.source || 'system',
    appId: entry.appId || 'system',
    title: entry.title || '',
    content: entry.content || '',
    timestamp: Date.now(),
    id: entry.id || crypto.randomUUID(),
    data: entry.data || {}
  });
}

export {
  getInboxEntries,
  getAIReadableEvents,
  getUserNotifications,
  markAsRead,
  getUnreadCount,
  clearInbox,
  addInboxEntry
};