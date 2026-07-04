// core/ai-client.js
// 兼容入口——我把真正的实现挪到了 js/ai/ai-client.js（按 AI 规范重构）。
// 现有 import 'core/ai-client.js' 的代码不需要改，全部从这里 re-export。
// 新代码请直接 import 'js/ai/ai-client.js'。
// 依赖：../js/ai/ai-client.js

export {
  getAIConfig,
  saveAIConfig,
  isAIConfigured,
  buildMessages,
  streamChat,
  chatOnce,
  getFallbackReply,
  randomFallback
} from '../js/ai/ai-client.js';
