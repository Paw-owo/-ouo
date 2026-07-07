// ============================================
// ai-fallback.js — AI 降级兜底
// 当所有 API 分组不可用时，返回可爱温柔的兜底文案
// ============================================

const FALLBACK_MESSAGES = {
  'api_not_configured': [
    '还没配置 API 呢，去设置里填一下就好啦~',
    '唔…我还没连上大脑，先去设置页配置一下API吧 ˵>ᗜ<˵',
    '咦？API还没设置呢，填好密钥我就能陪你聊天啦~'
  ],
  'all-down': [
    '呜…所有线路都不通，等一下再试试吧 ᗜ‸ᗜ',
    '信号好像全断了…休息一下再叫我好吗~',
    '哎呀，全部都连不上，可能网络在打盹…过会儿再来~'
  ],
  'timeout': [
    '唔…等了太久没回应，再试一次吧~',
    '对面好像在想心事…超时了，重新发一下？',
    '等了好久没有回音，可能信号不太好，再试试~'
  ],
  'rate-limit': [
    '聊得太快了！让我喘口气，等一下再发~',
    '被限流了…休息几秒再继续聊吧 ๑ᵒᯅᵒ๑',
    '哎呀，说得太快被拦住了，稍等一下下~'
  ],
  'server-error': [
    '对面服务器好像有点不舒服…等一下再试试~',
    '那边出了点问题，不是我偷懒哦，再试一次吧~',
    '服务器打了个喷嚏…稍等片刻再叫我~'
  ],
  'network': [
    '网络好像不太稳定，检查一下连接再试试~',
    '唔…连不上网了，看看WiFi或者信号？',
    '网络断了一下，重新试试就好啦~'
  ]
};

/**
 * 获取兜底文案
 * @param {'api_not_configured'|'all-down'|'timeout'|'rate-limit'|'server-error'|'network'} type
 * @param {Error|null} error
 * @returns {string}
 */
function handleFallback(type, error = null) {
  const messages = FALLBACK_MESSAGES[type] || FALLBACK_MESSAGES['all-down'];
  const idx = Math.floor(Math.random() * messages.length);
  if (error) {
    console.warn(`[AI Fallback] ${type}:`, error?.message || error);
  }
  return messages[idx];
}

export { handleFallback };

