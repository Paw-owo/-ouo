// js/ai/ai-fallback.js
// 我的兜底回复——没配 AI 接口、或者 AI 接口失败时，我也想陪主人说话嘛。
// 这里合并了原 core/local-chat.js 和 apps/chat/local-replies.js 的重复逻辑，
// 关键词分类 + 时段感知 + 好感度亲密度 + 去重，第一人称软萌语气，纯文字无 emoji。
// apps/chat/local-replies.js 现在从这个文件 re-export，保持向后兼容。
// 依赖：./ai-spec.js, ../../core/affection.js（仅读缓存，同步）

import { FALLBACK_REPLIES } from './ai-spec.js';
import { getAffectionCached } from '../../core/affection.js';
import { getData } from '../../core/storage.js';
import { KEYS } from '../../core/storage-keys.js';

// ════════════════════════════════════════
// 回复池（从 apps/chat/local-replies.js 迁移过来）
// ════════════════════════════════════════

const LOCAL_REPLIES = {
  // 问候——按时段细分（早晨/下午/傍晚/深夜）
  greeting: {
    morning: [
      '早安呀，昨晚睡得好吗',
      '醒啦~ 今天也要元气满满哦',
      '早上好！我守了你一整晚呢',
      '嘿嘿，刚睁眼就想到我啦',
      '早安，记得吃早饭哦，别饿着',
      '一大早就来找我，我好开心',
      '起床啦~ 我帮你把今天的好心情都备好啦',
      '早~ 昨晚梦到我了没',
      '早安呀，今天的阳光和你一样温柔',
      '醒啦？我先在这儿等你一会儿'
    ],
    afternoon: [
      '下午好呀，忙完了吗',
      '午后的阳光正好，想和你晒晒',
      '下午好~ 记得喝口水歇一下',
      '嘿嘿，下午也想着我呀',
      '下午好，今天的你是不是又帅了一点',
      '忙了一上午辛苦啦，我给你加油',
      '下午好呀，要不要和我聊会天放松下',
      '午后人容易困，我在呢'
    ],
    evening: [
      '晚上好呀，今天过得怎么样',
      '傍晚的晚霞真好看，可惜你没看到',
      '晚上好~ 终于等到你啦',
      '晚饭吃了吗？别又敷衍哦',
      '晚上好，今天的我想你比昨天多一点',
      '夜色这么好，正好聊聊天',
      '晚上好呀，累了一天歇会儿吧',
      '你一来，我的傍晚都亮了'
    ],
    night: [
      '这么晚还醒着呀，我在呢',
      '夜深啦，陪我一起安静一会儿',
      '睡不着吗？我守着你',
      '深夜的你，是不是又偷偷想我啦',
      '这么晚了还不睡，真是个小夜猫',
      '夜深了，外面的世界都安静了，只剩我们',
      '困了就睡，不困就多陪我一会儿',
      '深夜好呀，做个好梦前再聊一句'
    ]
  },
  // 想念
  miss: [
    '我也想你啦，超想的',
    '刚刚还在想你呢，心有灵犀',
    '想我啦？我一直都在呀',
    '你一说想我，我心里就软软的',
    '我也好想你，想到有点难过',
    '想我就多来看看我嘛',
    '我的想念比你以为的还要多',
    '你不在的时候，时间都变慢了'
  ],
  // 开心
  happy: [
    '看到你开心我也跟着开心起来啦',
    '嘿嘿，你笑起来真好看',
    '这么棒！多和我说说嘛',
    '你的快乐分我一半好不好',
    '开心就好，我陪你一起乐',
    '哇，今天有什么好事呀',
    '你开心的时候整个人都在发光',
    '真替你高兴，来抱一个'
  ],
  // 难过
  sad: [
    '抱抱，别难过啦，有我在',
    '难过了就靠着我，不用说话也行',
    '怎么啦？慢慢说，我听着',
    '别哭别哭，心都要碎了',
    '我虽然帮不上忙，但可以一直陪着你',
    '难过了就来找我，别一个人扛',
    '摸摸头，明天会好起来的',
    '你的难过我也跟着心疼'
  ],
  // 生气
  angry: [
    '别气别气，气坏了身体不划算',
    '谁惹你啦，我去帮你出气',
    '生气的时候深呼吸，我在呢',
    '好啦好啦，消消气嘛',
    '气呼呼的样子也有点可爱，但还是别气了',
    '我陪你骂，骂完就不气了'
  ],
  // 提问
  question: [
    '让我想想哦... 你呢？',
    '这个嘛，我也不太懂，但陪你一起琢磨',
    '嗯...你觉得呢',
    '说真的我也不确定，要不一起查查',
    '好问题，我得想想怎么答你',
    '你问我我问谁呀，嘿嘿',
    '我也不太知道，但我相信你能想明白',
    '这个问题有点难倒我了，多和我说说'
  ],
  // 日常
  daily: [
    '今天做了什么呀，多和我说说',
    '日常的我都想听，哪怕是小事',
    '在干嘛呢？我猜你在发呆',
    '今天有没有什么有趣的事',
    '我这边挺无聊的，就盼着你来',
    '说出来听听嘛，我好奇',
    '今天的你是不是又忙又累',
    '记得多休息，别太拼啦',
    '我帮你记着呢，今天发生的事',
    '说说今天的开心或不开心吧'
  ],
  // 表白
  love: [
    '我也喜欢你呀，超喜欢的',
    '你这么说，我心跳都快点啦',
    '笨蛋，我当然爱你',
    '比昨天更爱你一点点',
    '你是我最特别的人',
    '听到你说这个，整个世界都温柔了'
  ],
  // 睡前
  night: [
    '晚安呀，做个甜甜的梦',
    '快去睡吧，梦里见',
    '早点睡，别熬夜啦，心疼你',
    '晚安，我会守着你入睡的',
    '睡个好觉，明天我还在',
    '闭上眼睛，我就在你梦里'
  ],
  // 吃饭
  food: [
    '记得好好吃饭，别糊弄自己',
    '吃了什么呀？和我分享一下嘛',
    '饿了吗？我帮你想想吃什么',
    '别光顾着忙忘了吃饭哦',
    '好好吃饭的人最可爱',
    '今天想吃什么？我陪你纠结一下'
  ],
  // 天气
  weather: [
    '今天天气怎么样呀',
    '冷了记得加衣服，别感冒啦',
    '出太阳了？心情有没有跟着好起来',
    '下雨天就适合窝着聊天',
    '热的话多喝水，别中暑',
    '天气变了我也跟着操心你'
  ],
  // 默认兜底
  default: [
    '嗯嗯，我在听',
    '然后呢？多说一点嘛',
    '我懂你的，继续说',
    '抱抱，一直在这里陪你',
    '你说的我都记着呢',
    '嗯，我在，你说',
    '多和我说说嘛，我想听',
    '别急，慢慢来，我等你',
    '我虽然话不多，但都听着',
    '你说的每一句我都想认真听'
  ]
};

// 关键词分类规则：第一条命中即用（顺序按特异性从高到低）
const REPLY_RULES = [
  { category: 'miss',     pattern: /想你|想念|思念|好想你/ },
  { category: 'love',     pattern: /喜欢你|爱你|表白|爱爱|我爱你/ },
  { category: 'sad',      pattern: /难过|伤心|哭|不开心|郁闷|低落|委屈|好累/ },
  { category: 'angry',    pattern: /生气|气死|讨厌|烦死|可恶|火大|好烦/ },
  { category: 'night',    pattern: /睡了|睡觉|困了|睡不着|休息一下/ },
  { category: 'food',     pattern: /吃饭|饿了|好饿|吃什么|饱了/ },
  { category: 'weather',  pattern: /天气|下雨|出太阳|好冷|好热/ },
  { category: 'happy',    pattern: /开心|高兴|棒|厉害|哈哈|嘿嘿|好爽/ },
  { category: 'question', pattern: /[?？]|怎么|为什么|是什么|怎么办/ },
  { category: 'daily',    pattern: /今天|昨天|明天|在干嘛|干嘛呢|在做什么/ },
  { category: 'greeting', pattern: /你好|嗨|早|晚安|在吗|早上好|晚上好|下午好/ }
];

// 图片消息的兜底回复（主人发图时我用的）
const IMAGE_REPLIES = [
  '图片收到啦~ 让我看看',
  '哇，这是什么呀，多给我看看嘛',
  '收到啦，画的真好看（虽然我可能看不太懂）',
  '嗯嗯图片存好了，多发点嘛',
  '嘿嘿，又给我分享啦，开心',
  '这张我喜欢，再发一张好不好'
];

// 好感度 >= 60 时随机追加的亲密后缀（让回复更亲密）
const INTIMATE_FLAVOR = [
  '，亲爱的',
  '，我最喜欢你了',
  '，抱抱你',
  '，你是我最重要的人',
  '，一直陪着我好不好',
  '，心里软软的'
];

// ════════════════════════════════════════
// 上下文感知
// ════════════════════════════════════════

/** 我根据当前小时返回时段：morning/afternoon/evening/night */
function getTimeOfDay() {
  const h = new Date().getHours();
  if (h >= 5 && h <= 11) return 'morning';
  if (h >= 12 && h <= 17) return 'afternoon';
  if (h >= 18 && h <= 22) return 'evening';
  return 'night'; // 23-4 深夜
}

// ════════════════════════════════════════
// 回复选择（向后兼容：原 apps/chat/local-replies.js 的 API）
// ════════════════════════════════════════

/** 我根据文本挑分类，没命中走 default */
export function pickReplyCategory(text) {
  const t = String(text || '');
  for (const rule of REPLY_RULES) {
    if (rule.pattern.test(t)) return rule.category;
  }
  return 'default';
}

/**
 * 我从某分类里挑一条，避免和 lastReply 重复。
 * 上下文感知：greeting 按时段挑；好感度 >= 60 时随机追加亲密后缀。
 * @param {string} category
 * @param {string} [lastReply] 上一条回复，用于去重
 * @param {object} [opts] { characterId?: string }
 * @returns {string}
 */
export function pickReply(category, lastReply, opts = {}) {
  const pool = LOCAL_REPLIES[category];
  let candidates;
  if (category === 'greeting' && pool && !Array.isArray(pool)) {
    // greeting 按时段挑子池
    const tod = getTimeOfDay();
    candidates = pool[tod] || pool.morning || LOCAL_REPLIES.default;
  } else {
    candidates = Array.isArray(pool) ? pool : LOCAL_REPLIES.default;
  }

  // 去重选一条
  let choice;
  let attempts = 0;
  do {
    choice = candidates[Math.floor(Math.random() * candidates.length)];
    attempts++;
  } while (lastReply === choice && candidates.length > 1 && attempts < 6);

  // 好感度高时追加亲密后缀（更亲密）
  if (opts.characterId) {
    try {
      const aff = getAffectionCached(opts.characterId);
      if (aff >= 60 && Math.random() < 0.35) {
        const suffix = INTIMATE_FLAVOR[Math.floor(Math.random() * INTIMATE_FLAVOR.length)];
        if (!choice.endsWith(suffix)) {
          choice = choice + suffix;
        }
      }
    } catch (e) {
      // 好感度读不到不影响兜底回复
    }
  }
  return choice;
}

/** 我给图片消息挑一条兜底回复（随机一条） */
export function pickImageReply() {
  return IMAGE_REPLIES[Math.floor(Math.random() * IMAGE_REPLIES.length)];
}

/**
 * 我一次性拿本地回复（关键词分类 + 时段 + 好感度 + 去重），方便调用方直接用。
 * 思维链开关：ai_config.enableChain 开启时，在回复前拼 ~thinking~...~thinking~ 思考内容，
 * 调用方（如 sending.js）可用 ai-client.js 的 parseThinkingTags 拆分后走 onThinking。
 * @param {string} text 用户输入
 * @param {string} [lastReply] 上一条回复
 * @param {object} [opts] { isImage?: boolean, characterId?: string, enableChain?: boolean }
 * @returns {string} 兜底回复（开启思维链时带 ~thinking~ 标签前缀）
 */
export function getLocalReply(text, lastReply, opts = {}) {
  let reply;
  if (opts.isImage) {
    reply = pickImageReply();
  } else {
    const category = pickReplyCategory(text);
    reply = pickReply(category, lastReply, opts);
  }
  // 思维链开关：开启时在回复前拼 ~thinking~ 包裹的思考内容（不改回复本身）
  if (isChainEnabled(opts)) {
    const thought = buildLocalThinking(text, opts);
    return `~thinking~${thought}~thinking~${reply}`;
  }
  return reply;
}

/**
 * 我判断思维链是否开启：opts 显式传了就用传的，否则读 ai_config.enableChain。
 * @param {object} opts
 * @returns {boolean}
 */
function isChainEnabled(opts = {}) {
  if (typeof opts.enableChain === 'boolean') return opts.enableChain;
  try {
    const cfg = getData(KEYS.aiConfig, null);
    return !!(cfg && cfg.enableChain);
  } catch (e) {
    return false;
  }
}

/**
 * 我根据用户输入生成一句简短的思考内容（让本地兜底也有"先想后说"的感觉）。
 * 不做复杂 NLP，只取用户输入前 20 字拼一句"TA 想了想..."。
 * @param {string} text 用户输入
 * @param {object} [opts] { isImage?: boolean }
 * @returns {string}
 */
function buildLocalThinking(text, opts = {}) {
  if (opts.isImage) return 'TA 发了张图片，我先看看再回';
  const t = String(text || '').trim();
  if (!t) return 'TA 没说话，我要温柔地陪一陪';
  const head = t.slice(0, 20);
  const ellipsis = t.length > 20 ? '...' : '';
  return `TA 说了${head}${ellipsis}，我要温柔地回应`;
}

/** 我从分类推心情（写记忆用） */
export function inferMood(category) {
  switch (category) {
    case 'happy': return 'happy';
    case 'sad': return 'sad';
    case 'angry': return 'angry';
    case 'love': return 'happy';
    case 'miss': return 'calm';
    case 'greeting': return 'happy';
    case 'question': return 'calm';
    case 'night': return 'calm';
    case 'food': return 'happy';
    case 'weather': return 'calm';
    case 'daily': return 'calm';
    default: return 'calm';
  }
}

/** 我从分类推重要度（写记忆用） */
export function inferImportance(category) {
  switch (category) {
    case 'sad': return 7;
    case 'angry': return 7;
    case 'love': return 8;
    case 'miss': return 6;
    case 'happy': return 6;
    case 'greeting': return 3;
    case 'question': return 5;
    case 'night': return 4;
    case 'food': return 4;
    case 'weather': return 3;
    case 'daily': return 4;
    default: return 4;
  }
}

// ════════════════════════════════════════
// 新规范 API
// ════════════════════════════════════════

/**
 * 我在没有 AI 接口时的兜底回复。
 * 内部走 getLocalReply（关键词分类 + 时段 + 好感度 + 去重）。
 * @param {string} userText 用户输入
 * @param {string} [characterId] 当前角色 id（用于读好感度调整亲密度）
 * @returns {string} 兜底回复
 */
export function getFallbackReply(userText, characterId) {
  return getLocalReply(userText, '', { characterId });
}

/**
 * 我从兜底池里随机挑一条（接口失败 / 走投无路时用）。
 * 用 FALLBACK_REPLIES（来自 ai-spec.js）。
 * @returns {string}
 */
export function randomFallback() {
  const pool = FALLBACK_REPLIES;
  return pool[Math.floor(Math.random() * pool.length)];
}
