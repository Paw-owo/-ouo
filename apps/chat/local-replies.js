// apps/chat/local-replies.js
// 兼容入口——我把本地兜底回复池挪到了 js/ai/ai-fallback.js（按 AI 规范统一管理）。
// 现有 import './local-replies.js' 的代码不需要改，全部从这里 re-export。
// 新代码请直接 import 'js/ai/ai-fallback.js'。
// 依赖：../../js/ai/ai-fallback.js

export {
  pickReplyCategory,
  pickReply,
  pickImageReply,
  getLocalReply,
  inferMood,
  inferImportance,
  getFallbackReply,
  randomFallback
} from '../../js/ai/ai-fallback.js';
