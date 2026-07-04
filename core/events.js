// core/events.js
// 统一事件总线。所有跨 App 通信必须走这个 bus，禁止 window.dispatchEvent 与 bus 并存。
// 依赖：core/util.js（cleanForDB），可选 core/memory.js（懒加载避免循环）

import { cleanForDB } from './util.js';

const listeners = new Map();
const history = [];
const HISTORY_MAX = 200;

let memoryModule = null;
async function getMemory() {
  if (!memoryModule) {
    try {
      memoryModule = await import('./memory.js');
    } catch (e) {
      console.warn('[events] memory 模块加载失败，记忆写入将被跳过', e);
      memoryModule = null;
    }
  }
  return memoryModule;
}

export function on(eventName, handler, opts = {}) {
  if (typeof eventName !== 'string' || typeof handler !== 'function') return () => {};
  if (!listeners.has(eventName)) listeners.set(eventName, new Set());
  const entry = { handler, ...opts };
  listeners.get(eventName).add(entry);
  return () => off(eventName, handler);
}

export function once(eventName, handler) {
  const dispose = on(eventName, async (...args) => {
    dispose();
    try { await handler(...args); } catch (e) { console.warn('[events] once 失败', eventName, e); }
  });
  return dispose;
}

export function off(eventName, handler) {
  const set = listeners.get(eventName);
  if (!set) return;
  if (!handler) { listeners.delete(eventName); return; }
  for (const entry of set) {
    if (entry.handler === handler) { set.delete(entry); break; }
  }
  if (!set.size) listeners.delete(eventName);
}

export function offAll() {
  listeners.clear();
}

/**
 * 派发事件。
 * @param {string} eventName 小写+冒号分隔，前缀是 App 名（如 'shop:gift-sent'）
 * @param {object} payload
 * @param {object} opts { recordMemory?: boolean, memory?: {characterId, source, content, mood, importance} }
 */
export async function emit(eventName, payload = {}, opts = {}) {
  if (typeof eventName !== 'string') return;

  // 调试历史
  try {
    history.push({ name: eventName, payload: cleanForDB(payload), t: Date.now() });
    if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);
    const arr = history.slice(-50);
    try { localStorage.setItem('events_history', JSON.stringify(arr)); } catch (e) {}
  } catch (e) {
    console.warn('[events] history 写入失败', e);
  }

  // 自动写记忆
  if (opts.recordMemory && opts.memory) {
    try {
      const mem = await getMemory();
      if (mem && typeof mem.recordInteraction === 'function') {
        await mem.recordInteraction({
          source: opts.memory.source || 'manual',
          characterId: opts.memory.characterId || 'global',
          role: 'assistant',
          content: opts.memory.content,
          mood: opts.memory.mood,
          importance: opts.memory.importance || 5,
          relatedApp: eventName.split(':')[0],
          relatedId: opts.memory.relatedId,
          timestamp: new Date().toISOString()
        });
      }
    } catch (e) {
      console.warn('[events] 自动记忆失败', eventName, e);
    }
  }

  // 通知监听者（容错：单个失败不影响其他）
  const set = listeners.get(eventName);
  if (!set || !set.size) return;
  const entries = Array.from(set);
  await Promise.all(entries.map(async (entry) => {
    try {
      await entry.handler(payload, opts);
    } catch (e) {
      console.warn(`[events] 监听者失败 ${eventName}`, e);
    }
  }));
}

export function getHistory() {
  return history.slice();
}

export function listenerCount(eventName) {
  const set = listeners.get(eventName);
  return set ? set.size : 0;
}

// 单例全局 bus
const bus = { on, once, off, offAll, emit, getHistory, listenerCount };
export default bus;
