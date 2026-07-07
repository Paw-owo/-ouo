// ============================================
// ai-fallback.js — AI请求失败兜底层
// 当 ai-client 请求失败时，按错误类型给出降级回复
// 不假装请求成功，不伪造AI回复，只做诚实的兜底
// ============================================

// 兜底策略：按错误类型返回不同回复
// 返回 { text, reason, retryable, degraded }
function getFallbackResponse(errorType, options = {}) {
  const { userMessage = '' } = options;

  switch (errorType) {
    case 'timeout':
      return {
        text: '我刚刚走神了，没反应过来……你再说一遍好不好？',
        reason: '请求超时',
        retryable: true,
        degraded: true
      };

    case 'network':
      return {
        text: '我好像连不上网了，消息发不出去。你看看网络是不是断了？',
        reason: '网络连接失败',
        retryable: true,
        degraded: true
      };

    case 'auth':
      return {
        text: '我的接口钥匙好像不对，没法好好说话。去设置里看看API配置好不好？',
        reason: 'API密钥无效',
        retryable: false,
        degraded: true
      };

    case 'rate_limit':
      return {
        text: '我说太多啦，被限制住了。等一下再聊好不好？',
        reason: '请求频率超限',
        retryable: true,
        degraded: true
      };

    case 'server':
      return {
        text: '对面服务好像出了点问题，不是你的错。等会儿再试试？',
        reason: '服务端错误',
        retryable: true,
        degraded: true
      };

    case 'no_config':
      return {
        text: '我还没配好接口，现在说不了话。去设置里填一下API信息好不好？',
        reason: '未配置API',
        retryable: false,
        degraded: true
      };

    default:
      return {
        text: '我这边出了点小问题，暂时没法好好回复你。',
        reason: '未知错误',
        retryable: true,
        degraded: true
      };
  }
}

// 判断是否值得重试
function shouldRetry(errorType, attemptCount, maxAttempts = 2) {
  if (attemptCount >= maxAttempts) return false;

  const retryableTypes = ['timeout', 'network', 'server', 'rate_limit'];
  return retryableTypes.includes(errorType);
}

// 计算重试延迟（毫秒），指数退避
function getRetryDelay(attemptCount) {
  const base = 1000; // 1秒
  const max = 8000;  // 最多8秒
  const delay = base * Math.pow(2, attemptCount - 1);
  return Math.min(delay, max);
}

export {
  getFallbackResponse,
  shouldRetry,
  getRetryDelay
};
