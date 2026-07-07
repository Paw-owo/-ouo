// ============================================
// ai-client.js — AI 请求客户端
// 从 core/config.js 统一入口读取 API 配置
// 未配置时返回 fallback，不抛错不崩页面
// ============================================

import { get } from './config.js';

function getApiConfig() {
  return {
    baseUrl: (get('apiBaseUrl') || '').replace(/\/+$/, ''),
    apiKey: get('apiKey') || '',
    model: get('apiModel') || ''
  };
}

function isConfigured() {
  const cfg = getApiConfig();
  return !!(cfg.baseUrl && cfg.apiKey && cfg.model);
}

// 兼容旧浏览器：AbortSignal.timeout 降级
function _createAbortSignal(timeoutMs) {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), timeoutMs);
  return ctrl.signal;
}

async function sendChat(messages, options = {}) {
  const cfg = getApiConfig();

  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
    return {
      ok: false, fallback: true, reason: 'api_not_configured',
      content: _getFallbackMessage()
    };
  }

  const url = `${cfg.baseUrl}/v1/chat/completions`;
  const timeout = get('timeout') || 30000;
  const { temperature = 0.7, max_tokens = 2048 } = options;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model: cfg.model, messages, temperature, max_tokens, stream: false
      }),
      signal: _createAbortSignal(timeout)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.error('[AI-Client] API 请求失败:', response.status, errorText);
      return {
        ok: false, fallback: true, reason: `api_error_${response.status}`,
        content: _getFallbackMessage()
      };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    return { ok: true, fallback: false, content };
  } catch (err) {
    console.error('[AI-Client] 请求异常:', err.message);
    return {
      ok: false, fallback: true,
      reason: err.name === 'AbortError' ? 'timeout' : 'network_error',
      content: _getFallbackMessage()
    };
  }
}

function _getFallbackMessage() {
  const msgs = [
    '唔…我现在好像连不上服务器，等会儿再试试吧~',
    '哎呀，网络好像不太行，你先等等我哦。',
    '小软云这会儿有点迷糊，让我缓缓…',
    'API 还没配置好呢，去设置里填一下就好啦~',
    '连接好像断掉了，要不要去设置里检查一下 API 配置？'
  ];
  return msgs[Math.floor(Math.random() * msgs.length)];
}

export { getApiConfig, isConfigured, sendChat };