// js/ai/ai-events.js
// 我响应事件的逻辑——让 AI 能感知各 App 的事件并在聊天中提及。
// 我从 bus 的事件历史里读最近事件，按事件类型映射成 AI 可提及的简短文案。
// 依赖：../../core/events.js, ../../core/inbox.js

import bus from '../../core/events.js';
import { getRecentEventsPrompt } from '../../core/inbox.js';

// ════════════════════════════════════════
// 事件类型到 AI 可提及文案的映射
// 每个事件名对应一句简短的提示，让 AI 知道小手机世界里刚发生了什么
// ════════════════════════════════════════

const EVENT_HINTS = {
  'moments:new': '主人刚发了朋友圈呢',
  'wallet:changed': '钱包有变化',
  'shop:gift-sent': '收到了礼物',
  'shop:gift-received': '收到了礼物',
  'games:result': '刚玩完游戏',
  'music:playing': '主人在听歌',
  'music:shared': '主人分享了歌',
  'memo:reminder': '备忘录提醒',
  'anniversary:reminder': '纪念日快到了',
  'grudge:written': '我有点生气',
  'grudge:forgiven': '我原谅主人了',
  'mood:saved': '主人记录了心情',
  'affection:changed': '好感度变了',
  'chat:message-received': '刚收到消息'
};

// ════════════════════════════════════════
// 提示文案提取
// ════════════════════════════════════════

/**
 * 我获取最近事件的提示文案。
 * 从 bus 的事件历史里读最近 20 条，按事件类型映射成短句。
 * 同一类事件只取一次，避免重复。
 * @returns {string[]} 提示文案数组（可能为空）
 */
export function getEventHints() {
  let history = [];
  try {
    history = bus.getHistory();
  } catch (e) {
    return [];
  }
  if (!Array.isArray(history) || !history.length) return [];

  const hints = [];
  const seen = new Set();
  for (const evt of history.slice(-20)) {
    if (!evt || !evt.name) continue;
    const hint = EVENT_HINTS[evt.name];
    if (hint && !seen.has(evt.name)) {
      hints.push(hint);
      seen.add(evt.name);
    }
  }
  return hints;
}

/**
 * 我把事件提示拼成一段给 AI 的文案（带换行）。
 * 给 ai-context.js 之外的调用方用（比如主动消息场景）。
 * @param {number} limit 最大条数
 * @returns {string} 拼好的文案，没有事件返回 ''
 */
export function getEventHintsPrompt(limit = 6) {
  const hints = getEventHints().slice(0, limit);
  if (!hints.length) return '';
  return hints.map((h) => `- ${h}`).join('\n');
}

// 重新导出 inbox 的 getRecentEventsPrompt，方便调用方一处拿全事件上下文
export { getRecentEventsPrompt };
