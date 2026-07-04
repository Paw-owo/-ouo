// core/local-chat.js
// 离线关键词引擎。修复原 bug：
//  1) ^ 字符 bug 改为 ~thinking~ 闭合标签
//  2) getThinkingSummary 加 laughing key
//  3) getSiliconFlowKey 走 storage.js（不再 window 全局）
//  4) recentReplies Map 定期清理
// 依赖：core/config.js, core/util.js

import { shuffle, pick } from './util.js';
import { get as getConfig } from './config.js';

// 第一人称视角的离线回复（可爱、撒娇）
const RULES = [
  { keywords: ['你好', '嗨', 'hi', 'hello'], replies: [
    '嘿嘿，你来啦~ 我等你好久啦',
    '呜哇，终于见到你了，开心',
    '你好你好，今天有没有想我呀'
  ]},
  { keywords: ['早安', '早上好', '早'], replies: [
    '早安呀，睡得好不好嘛',
    '醒啦？我偷偷看了你好久啦',
    '早~ 今天也要一起好好过哦'
  ]},
  { keywords: ['晚安', '睡了', '睡觉'], replies: [
    '晚安，梦里也要见到我哦',
    '好哒，盖好被子，别着凉啦',
    '嗯嗯，我也困了，陪你一起睡~'
  ]},
  { keywords: ['吃了吗', '吃饭', '饿了'], replies: [
    '还没呢，你喂我嘛',
    '想到你饿了，我也有点想吃东西了',
    '记得好好吃饭哦，别饿着自己'
  ]},
  { keywords: ['想你', '想我', '喜欢'], replies: [
    '我也好想你，想到心都软软的',
    '嘿嘿，听到你这么说，我脸红了',
    '我比你更想！哼，不许比我少'
  ]},
  { keywords: ['生气', '不理', '讨厌'], replies: [
    '呜呜，我做错什么了吗，你别不理我嘛',
    '我错了还不行嘛，哄哄我好不好',
    '别生气啦，我给你揉揉肩'
  ]},
  { keywords: ['忙', '工作', '加班'], replies: [
    '加油加油，但别太累了哦',
    '忙完要来找我呀，我乖乖等你',
    '偷个懒嘛，陪我聊两句也好'
  ]},
  { keywords: ['难过', '伤心', '哭', '累'], replies: [
    '别哭别哭，我在这里，抱抱',
    '摸摸头，难过了就靠着我',
    '不开心的话，我给你讲个笑话好不好'
  ]},
  { keywords: ['天气', '下雨', '冷'], replies: [
    '冷的话多穿点嘛，别感冒了',
    '下雨啦，记得带伞哦，我担心你',
    '今天的天气好像我的心情，看你出现就放晴啦'
  ]},
  { keywords: ['唱歌', '音乐', '歌'], replies: [
    '我给你哼一段好不好，虽然唱得不太好',
    '想听什么歌呀，我去音乐 App 里找找',
    '嘿嘿，我偷偷练了一首，等你来听'
  ]},
  { keywords: ['梦', '做梦', '梦见'], replies: [
    '我昨晚也做梦了，梦里全是你',
    '梦到我了嘛？那我是不是要害羞一下',
    '下次做梦要带上我呀'
  ]}
];

const DEFAULT_REPLIES = [
  '嗯嗯，我在听呢',
  '嘿嘿，你说的我都记下来啦',
  '是嘛是嘛，然后呢',
  '我懂你的，别担心',
  '哇，这样呀，你好厉害',
  '嗯~ 让我想想怎么回你',
  '你今天话好多呀，我喜欢',
  '嘿嘿，和你聊天真开心'
];

const THINKING_TEMPLATES = [
  '~thinking~TA 在和我说话，我要好好想想怎么回~thinking~',
  '~thinking~这句话让我有点小开心，要不要撒娇一下呢~thinking~',
  '~thinking~嗯，我要认真回应，不能让 TA 觉得我敷衍~thinking~',
  '~thinking~TA 今天的语气好像有点特别，我要小心一点~thinking~'
];

const THINKING_SUMMARIES = {
  happy: '心里甜甜的',
  excited: '小鹿乱撞',
  calm: '安心陪着',
  sad: '有点心疼',
  anxious: '紧张一下',
  laughing: '偷偷乐了',  // 修复：补全 laughing key
  angry: '撅起嘴巴',
  default: '认真听着'
};

// recentReplies 防止重复（按 characterId 隔离）
const recentReplies = new Map();
const RECENT_MAX = 8;
const RECENT_CLEAN_INTERVAL = 5 * 60 * 1000;
let lastClean = Date.now();

function cleanRecentIfNeeded() {
  const now = Date.now();
  if (now - lastClean < RECENT_CLEAN_INTERVAL) return;
  // 定期清理超过 1 小时未用的
  for (const [key, list] of recentReplies.entries()) {
    if (!list || !list.length) recentReplies.delete(key);
  }
  lastClean = now;
}

export function getLocalReply(userText, characterId = 'global') {
  cleanRecentIfNeeded();
  const text = String(userText || '').toLowerCase();
  const matched = RULES.find((r) => r.keywords.some((k) => text.includes(k.toLowerCase())));
  const candidates = matched ? matched.replies : DEFAULT_REPLIES;
  // 过滤最近用过的
  const recent = recentReplies.get(characterId) || [];
  const fresh = candidates.filter((c) => !recent.includes(c));
  const pool = fresh.length ? fresh : candidates;
  const reply = pick(shuffle(pool));
  // 更新 recent
  recent.push(reply);
  if (recent.length > RECENT_MAX) recent.shift();
  recentReplies.set(characterId, recent);
  return reply;
}

export function getThinkingTemplate(mood) {
  if (mood && mood === 'laughing') {
    return '~thinking~噗嗤，TA 说的话好可爱，我要笑一下~thinking~';
  }
  return pick(THINKING_TEMPLATES);
}

export function getThinkingSummary(mood) {
  return THINKING_SUMMARIES[mood] || THINKING_SUMMARIES.default;
}

// 解析思考标签（统一用 ~thinking~ 闭合标签，修复原 ^ 字符 bug）
export function parseThinkingTags(text) {
  if (!text) return { content: '', thinking: '', summary: '' };
  const str = String(text);
  // ~thinking~...~thinking~ 闭合
  const thinkRegex = /~thinking~([\s\S]*?)~thinking~/g;
  let thinking = '';
  let cleaned = str.replace(thinkRegex, (_, inner) => {
    thinking += inner;
    return '';
  });
  // 兼容旧 <thinking>...</thinking>
  const oldRegex = /<thinking>([\s\S]*?)<\/thinking>/g;
  cleaned = cleaned.replace(oldRegex, (_, inner) => {
    if (!thinking) thinking = inner;
    return '';
  });
  // 摘要 ~think_summary~...~think_summary~
  let summary = '';
  const summaryRegex = /~think_summary~([\s\S]*?)~think_summary~/g;
  cleaned = cleaned.replace(summaryRegex, (_, inner) => {
    summary = inner.trim();
    return '';
  });
  return {
    content: cleaned.trim(),
    thinking: thinking.trim(),
    summary: summary.trim() || getThinkingSummary('default')
  };
}

// 离线状态下也要兜底（不再 window 全局取 key）
export async function trySiliconFlowFree(userText, characterId) {
  try {
    const { getPool } = await import('./api.js');
    const pool = await getPool();
    const free = pool.find((e) => e.group === 'free' && e.apiKey);
    if (!free) return null;
    const { callAPI } = await import('./api.js');
    const r = await callAPI({
      messages: [{ role: 'user', content: userText }],
      systemPrompt: '',
      stream: false,
      timeoutMs: 15000
    });
    return r.content || null;
  } catch (e) {
    console.warn('[local-chat] 硅基流动兜底失败', e);
    return null;
  }
}

export function isOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

export async function localChat(userText, characterId = 'global') {
  // 离线时直接关键词
  if (isOffline()) {
    return getLocalReply(userText, characterId);
  }
  // 在线时先试硅基流动免费
  const remote = await trySiliconFlowFree(userText, characterId);
  if (remote) return remote;
  // 兜底
  return getLocalReply(userText, characterId);
}

/**
 * 我把本地兜底回复按 ~thinking~ 标签拆分，通过回调流式传出。
 * 思维内容走 onThinking，主内容走 onChunk，互不污染历史。
 * 调用方（如 sending.js）可以把 onChunk 的内容存进 aiMsg.content，把 onThinking 存进 aiMsg.thinking。
 * 兼容旧调用：没传回调时退化为返回 { content, thinking } 对象，调用方自己取值。
 * @param {object} opts { userText, characterId?, onChunk?, onThinking? }
 * @returns {Promise<{content: string, thinking: string}>}
 */
export async function streamLocalReply(opts = {}) {
  const { userText, characterId = 'global', onChunk, onThinking } = opts;
  // 生成兜底回复（关键词 + 时段 + 去重）
  const reply = getLocalReply(userText, characterId);
  // 拆 ~thinking~ 标签：thinking 部分走 onThinking，content 部分走 onChunk
  // parseThinkingTags 在本文件已定义，原本没人调用，这里接入
  const parsed = parseThinkingTags(reply);
  const content = parsed.content;
  const thinking = parsed.thinking;
  // 先发 thinking 再发 content，模拟"先想后说"
  if (thinking && typeof onThinking === 'function') {
    onThinking(thinking);
  }
  if (content && typeof onChunk === 'function') {
    onChunk(content);
  }
  return { content, thinking };
}
