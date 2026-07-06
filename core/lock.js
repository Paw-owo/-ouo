// ============================================
// lock.js — 锁屏状态管理
// 管理锁屏状态、密码验证、自动锁屏倒计时
// 不负责UI渲染，只负责状态和事件
// ============================================

import { get, set } from './config.js';
import events from './events.js';
import { STORAGE_KEYS } from './storage-keys.js';

// 锁屏状态
let _locked = true;
let _autoLockTimer = null;
let _autoLockDelay = 0;
let _failedAttempts = 0;
let _lockUntil = 0;

// 获取锁屏状态
function isLocked() {
  return _locked;
}

// 获取锁屏设置
function getLockConfig() {
  return {
    enabled: get('lockEnabled'),
    hasPassword: !!get('lockPassword'),
    avatar: get('lockAvatar') || null,
    message: get('lockMessage') || null,
    showNotifications: get('lockShowNotifications')
  };
}

// 验证密码
function verifyPassword(input) {
  if (_lockUntil > Date.now()) {
    return { success: false, reason: 'locked_out', remainingMs: _lockUntil - Date.now() };
  }

  const stored = get('lockPassword');
  if (!stored) {
    unlock();
    return { success: true };
  }

  if (input === stored) {
    _failedAttempts = 0;
    unlock();
    return { success: true };
  }

  _failedAttempts++;

  // 5次失败后锁定30秒
  if (_failedAttempts >= 5) {
    _lockUntil = Date.now() + 30000;
    events.emit('lock:locked_out', {
      failedAttempts: _failedAttempts,
      lockUntil: _lockUntil
    });
    return { success: false, reason: 'locked_out', remainingMs: 30000 };
  }

  events.emit('lock:auth_failed', {
    failedAttempts: _failedAttempts,
    remaining: 5 - _failedAttempts
  });

  return { success: false, reason: 'wrong_password', remaining: 5 - _failedAttempts };
}

// 设置密码
function setPassword(password) {
  set('lockPassword', password || '');
  events.emit('lock:password_changed', {
    hasPassword: !!password
  });
}

// 设置锁屏头像
function setAvatar(avatarUrl) {
  set('lockAvatar', avatarUrl || '');
}

// 设置锁屏消息
function setMessage(message) {
  set('lockMessage', message || '');
}

// 解锁
function unlock() {
  _locked = false;
  _clearAutoLock();
  events.emit('lock:unlocked', {});
}

// 锁定
function lock() {
  if (_locked) return;
  _locked = true;
  _clearAutoLock();
  events.emit('lock:locked', {});
}

// 切换锁屏
function toggleLock() {
  if (_locked) {
    unlock();
  } else {
    lock();
  }
}

// 启用/禁用锁屏
function setLockEnabled(enabled) {
  set('lockEnabled', enabled);
  if (!enabled && _locked) {
    unlock();
  }
}

// 自动锁屏倒计时
function startAutoLock(delayMs) {
  _clearAutoLock();
  _autoLockDelay = delayMs;

  _autoLockTimer = setTimeout(() => {
    if (!_locked) {
      lock();
    }
  }, delayMs);
}

function resetAutoLock() {
  if (_autoLockDelay > 0 && !_locked) {
    startAutoLock(_autoLockDelay);
  }
}

function _clearAutoLock() {
  if (_autoLockTimer) {
    clearTimeout(_autoLockTimer);
    _autoLockTimer = null;
  }
}

// 初始化锁屏
function initLock() {
  const lockEnabled = get('lockEnabled');
  const hasPassword = !!get('lockPassword');

  if (!lockEnabled) {
    _locked = false;
  } else if (hasPassword) {
    _locked = true;
  } else {
    _locked = false;
  }

  // 监听用户活动，重置自动锁屏
  if (typeof document !== 'undefined') {
    ['mousedown', 'keydown', 'touchstart', 'scroll'].forEach(eventName => {
      document.addEventListener(eventName, () => {
        if (!_locked) resetAutoLock();
      }, { passive: true });
    });
  }
}

export {
  isLocked,
  getLockConfig,
  verifyPassword,
  setPassword,
  setAvatar,
  setMessage,
  lock,
  unlock,
  toggleLock,
  setLockEnabled,
  startAutoLock,
  resetAutoLock,
  initLock
};