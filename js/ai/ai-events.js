// ============================================
// ai-events.js — AI层事件流定义
// 所有AI相关事件统一从这里发出，禁止散写事件名
// 基于 core/events.js，只加常量和发送辅助
// ============================================

import events from '../../core/events.js';

// AI事件类型常量，外部监听只认这些名字
export const AI_EVENTS = Object.freeze({
  // 请求生命周期
  REQUEST_STARTED:   'ai:request-started',
  RESPONSE_CHUNK:    'ai:response-chunk',
  RESPONSE_COMPLETE:  'ai:response-complete',
  ERROR:              'ai:error',
  FALLBACK_USED:      'ai:fallback-used',

  // 记忆联动
  MEMORY_ACCESSED:    'ai:memory-accessed',
  MEMORY_WRITTEN:     'ai:memory-written',

  // 上下文变化
  CONTEXT_ASSEMBLED:  'ai:context-assembled'
});

// 发送请求开始事件
// 返回事件payload，调用方可拿 requestId 关联后续
function emitRequestStarted({ characterId, conversationId, appId } = {}) {
  const requestId = _genId();
  const payload = {
    requestId,
    characterId: characterId || null,
    conversationId: conversationId || null,
    appId: appId || null,
    timestamp: Date.now()
  };
  events.emit(AI_EVENTS.REQUEST_STARTED, payload);
  return payload;
}

// 发送流式分片（流式输出时逐块发）
function emitResponseChunk(requestId, chunk) {
  events.emit(AI_EVENTS.RESPONSE_CHUNK, {
    requestId,
    chunk,
    timestamp: Date.now()
  });
}

// 发送请求完成（fullText 是完整回复）
function emitResponseComplete(requestId, fullText, meta = {}) {
  events.emit(AI_EVENTS.RESPONSE_COMPLETE, {
    requestId,
    text: fullText,
    ...meta,
    timestamp: Date.now()
  });
}

// 发送错误
function emitError(requestId, error) {
  events.emit(AI_EVENTS.ERROR, {
    requestId,
    errorType: _classifyError(error),
    message: error?.message || String(error),
    timestamp: Date.now()
  });
}

// 发送兜底已使用
function emitFallbackUsed(requestId, fallbackInfo) {
  events.emit(AI_EVENTS.FALLBACK_USED, {
    requestId,
    ...fallbackInfo,
    timestamp: Date.now()
  });
}

// 发送记忆写入完成（供记忆APP/通知中心监听）
function emitMemoryWritten(memory) {
  events.emit(AI_EVENTS.MEMORY_WRITTEN, {
    memory,
    timestamp: Date.now()
  });
}

// 发送上下文组装完成（供思维链展示监听）
function emitContextAssembled(context) {
  events.emit(AI_EVENTS.CONTEXT_ASSEMBLED, {
    context,
    timestamp: Date.now()
  });
}

// ========== 内部工具 ==========

function _genId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// 把错误归类成有限几种类型，fallback 层按类型决定兜底策略
// 导出给 ai-client.js 共用，避免两处各写一份导致不一致
function classifyError(error) {
  if (!error) return 'unknown';
  const msg = (error.message || '').toLowerCase();
  if (error.name === 'AbortError' || msg.includes('timeout') || msg.includes('abort')) return 'timeout';
  if (msg.includes('network') || msg.includes('failed to fetch') || msg.includes('connection')) return 'network';
  if (error.status === 401 || error.status === 403 || msg.includes('unauthorized') || msg.includes('api key')) return 'auth';
  if (error.status === 429 || msg.includes('rate') || msg.includes('quota')) return 'rate_limit';
  if (error.status >= 500) return 'server';
  return 'unknown';
}

export {
  classifyError,
  emitRequestStarted,
  emitResponseChunk,
  emitResponseComplete,
  emitError,
  emitFallbackUsed,
  emitMemoryWritten,
  emitContextAssembled
};
