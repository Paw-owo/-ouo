// ============================================
// events.js — 事件中心（pub/sub）
// APP间唯一通信通道，禁止APP直接互调
// ============================================

class EventBus {
  constructor() {
    this._listeners = new Map();
    this._history = [];
    this._historyLimit = 200;
  }

  // 订阅事件
  on(event, callback, priority = 0) {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, []);
    }
    const entry = { callback, priority };
    const list = this._listeners.get(event);
    list.push(entry);
    list.sort((a, b) => b.priority - a.priority);
    return () => this.off(event, callback);
  }

  // 取消订阅
  off(event, callback) {
    if (!this._listeners.has(event)) return;
    const list = this._listeners.get(event);
    const idx = list.findIndex(e => e.callback === callback);
    if (idx !== -1) list.splice(idx, 1);
  }

  // 单次订阅
  once(event, callback) {
    const wrapper = (data) => {
      this.off(event, wrapper);
      callback(data);
    };
    this.on(event, wrapper);
  }

  // 发布事件
  emit(event, data = {}) {
    const payload = {
      event,
      data,
      timestamp: Date.now(),
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`
    };

    // 存储历史
    this._history.push(payload);
    if (this._history.length > this._historyLimit) {
      this._history = this._history.slice(-this._historyLimit);
    }

    // 通知订阅者
    if (this._listeners.has(event)) {
      const callbacks = [...this._listeners.get(event)];
      for (const { callback } of callbacks) {
        try {
          callback(payload);
        } catch (err) {
          console.error(`[EventBus] Error in listener for "${event}":`, err);
        }
      }
    }

    // 通配符监听
    if (this._listeners.has('*')) {
      const callbacks = [...this._listeners.get('*')];
      for (const { callback } of callbacks) {
        try {
          callback(payload);
        } catch (err) {
          console.error(`[EventBus] Error in wildcard listener:`, err);
        }
      }
    }

    return payload;
  }

  // 获取历史事件
  getHistory(filter = null) {
    if (!filter) return [...this._history];
    return this._history.filter(filter);
  }

  // 清空历史
  clearHistory() {
    this._history = [];
  }

  // 销毁所有监听
  destroy() {
    this._listeners.clear();
    this._history = [];
  }
}

const events = new EventBus();
export default events;