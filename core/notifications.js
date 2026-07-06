// ============================================
// notifications.js — 通知判断层
// 负责：总开关判断 → 分APP开关 → 免打扰 → 去重合并 → 分发
// 不负责UI渲染，只负责判断和写入通知记录
// ============================================

import events from './events.js';
import { getSetting } from './storage.js';
import { saveNotification, getNotifications } from './storage.js';
import { STORAGE_KEYS } from './storage-keys.js';

// 通知事件类型前缀
const NOTIFY_EVENT_PREFIX = 'notify:';

// 判断总开关
function _isMasterEnabled() {
  return getSetting(STORAGE_KEYS.NOTIFICATIONS_ENABLED) !== false;
}

// 判断分APP开关
function _isAppEnabled(appId) {
  return getSetting(`notify_app_${appId}`) !== false;
}

// 判断免打扰
function _isDNDActive() {
  const dnd = getSetting(STORAGE_KEYS.DO_NOT_DISTURB);
  if (!dnd) return false;

  const start = getSetting(STORAGE_KEYS.DO_NOT_DISTURB_START) || '23:00';
  const end = getSetting(STORAGE_KEYS.DO_NOT_DISTURB_END) || '08:00';

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  if (startMin <= endMin) {
    return nowMinutes >= startMin && nowMinutes < endMin;
  } else {
    return nowMinutes >= startMin || nowMinutes < endMin;
  }
}

// 去重合并：同类通知短时间内合并
async function _deduplicate(notification) {
  const recent = await getNotifications(notification.appId);
  const recentMatch = recent.find(n => {
    if (n.type !== notification.type) return false;
    if (n.data && notification.data && n.data.id === notification.data.id) return true;
    if (n.content === notification.content) return true;
    return false;
  });

  if (recentMatch && Date.now() - recentMatch.timestamp < 60000) {
    recentMatch.timestamp = Date.now();
    recentMatch.read = false;
    return { merged: true, existing: recentMatch };
  }

  return { merged: false };
}

// 判断横幅是否开启
function _isBannerEnabled() {
  return getSetting(STORAGE_KEYS.BANNER_ENABLED) !== false;
}

// 判断通知中心是否开启
function _isCenterEnabled() {
  return getSetting(STORAGE_KEYS.NOTIFICATION_CENTER_ENABLED) !== false;
}

// 判断桌面提示样式
function _getDesktopStyle() {
  return getSetting(STORAGE_KEYS.DESKTOP_NOTICE_STYLE) || 'breathe';
}

// 主入口：处理APP事件并决定是否生成通知
events.on('*', async (payload) => {
  const { event, data } = payload;

  // 只处理通知类事件
  if (!event.startsWith(NOTIFY_EVENT_PREFIX)) return;

  const appEvent = event.slice(NOTIFY_EVENT_PREFIX.length);
  const appId = data.appId || data.source;

  if (!appId) return;

  // 1. 总开关
  if (!_isMasterEnabled()) return;

  // 2. 分APP开关
  if (!_isAppEnabled(appId)) return;

  // 3. 免打扰
  const isDND = _isDNDActive();

  // 构建通知对象
  const notification = {
    id: data.id || payload.id,
    appId,
    type: appEvent,
    title: data.title || '',
    content: data.content || '',
    timestamp: Date.now(),
    read: false,
    data: data.data || {}
  };

  // 4. 去重合并
  const { merged, existing } = await _deduplicate(notification);
  if (merged) {
    await saveNotification(existing);
    return;
  }

  // 5. 写入通知记录
  await saveNotification(notification);

  // 6. 分发
  const result = {
    notification,
    center: _isCenterEnabled(),
    banner: !isDND && _isBannerEnabled(),
    desktop: _getDesktopStyle(),
    dnd: isDND
  };

  // 发回事件中心，让UI层监听
  events.emit('notification:dispatched', result);
});

// 工具函数：APP发送通知
function sendNotification(appId, type, options = {}) {
  return events.emit(`${NOTIFY_EVENT_PREFIX}${type}`, {
    appId,
    source: appId,
    title: options.title || '',
    content: options.content || '',
    data: options.data || {},
    id: options.id || `${appId}-${type}-${Date.now()}`
  });
}

// 查询通知配置
function getNotifyConfig(appId) {
  return {
    master: _isMasterEnabled(),
    app: _isAppEnabled(appId),
    dnd: _isDNDActive(),
    banner: _isBannerEnabled(),
    center: _isCenterEnabled(),
    desktop: _getDesktopStyle()
  };
}

export { sendNotification, getNotifyConfig };