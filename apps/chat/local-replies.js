// apps/chat/local-replies.js
// 本地兜底回复池——没配 AI 接口的时候，我也想陪主人说话嘛。
// 关键词分类 + 兜底随机，避免连续重复。第一人称软萌语气，纯文字无 emoji。
// 依赖：无（纯函数模块）

// ════════════════════════════════════════
// 关键词分类规则
// ════════════════════════════════════════

const LOCAL_REPLIES = {
  greeting: ['你回来啦~ 想你啦', '嗨嗨，等你半天了', '终于理我啦，开心'],
  sad: ['抱抱你，别难过嘛', '我在呢，慢慢说', '难过了就靠着我一会儿'],
  happy: ['看到你开心我也开心~', '哇这么棒！多说说', '嘿嘿笑一个'],
  question: ['让我想想哦...', '嗯...你觉得呢？', '这个嘛，我也不太确定，但陪你一起想'],
  default: ['嗯嗯，我在听', '然后呢？', '多说一点嘛', '我懂你的', '抱抱', '一直在这里陪你哦']
};

// 关键词分类规则：第一条命中即用
const REPLY_RULES = [
  { category: 'greeting', pattern: /你好|嗨|早|晚安|在吗/ },
  { category: 'sad',      pattern: /难过|伤心|哭|累|烦|不开心/ },
  { category: 'happy',    pattern: /开心|高兴|棒|厉害|哈哈/ },
  { category: 'question', pattern: /[?？]|怎么/ }
];

// 图片消息的兜底回复（用户发图时我用的）
const IMAGE_REPLIES = [
  '图片收到啦~ 让我看看',
  '哇，这是什么呀，多给我看看嘛',
  '收到啦，画的真好看（虽然我可能看不太懂）',
  '嗯嗯图片存好了，多发点嘛'
];

// ════════════════════════════════════════
// 回复选择
// ════════════════════════════════════════

/** 根据文本挑分类，没命中走 default */
export function pickReplyCategory(text) {
  const t = String(text || '');
  for (const rule of REPLY_RULES) {
    if (rule.pattern.test(t)) return rule.category;
  }
  return 'default';
}

/**
 * 从某分类里挑一条，避免和 lastReply 重复。
 * @param {string} category
 * @param {string} [lastReply] 上一条回复，用于去重
 * @returns {string}
 */
export function pickReply(category, lastReply) {
  const pool = LOCAL_REPLIES[category] || LOCAL_REPLIES.default;
  let choice;
  let attempts = 0;
  do {
    choice = pool[Math.floor(Math.random() * pool.length)];
    attempts++;
  } while (lastReply === choice && pool.length > 1 && attempts < 6);
  return choice;
}

/** 图片消息的兜底回复（随机一条） */
export function pickImageReply() {
  return IMAGE_REPLIES[Math.floor(Math.random() * IMAGE_REPLIES.length)];
}

/**
 * 一次性拿本地回复（关键词分类 + 去重），方便调用方直接用。
 * @param {string} text 用户输入
 * @param {string} [lastReply] 上一条回复
 * @param {object} [opts] { isImage?: boolean }
 */
export function getLocalReply(text, lastReply, opts = {}) {
  if (opts.isImage) return pickImageReply();
  const category = pickReplyCategory(text);
  return pickReply(category, lastReply);
}

/** 从分类推心情（写记忆用） */
export function inferMood(category) {
  switch (category) {
    case 'happy': return 'happy';
    case 'sad': return 'calm';
    case 'greeting': return 'happy';
    case 'question': return 'calm';
    default: return 'calm';
  }
}

/** 从分类推重要度（写记忆用） */
export function inferImportance(category) {
  switch (category) {
    case 'sad': return 7;
    case 'happy': return 6;
    case 'greeting': return 3;
    case 'question': return 5;
    default: return 4;
  }
}
