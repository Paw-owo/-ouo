// ============================================
// lock.js — 锁屏状态管理
// 管理锁屏的启用/禁用、锁定/解锁状态、密码验证
// 不负责UI渲染，只负责状态和事件
// ============================================

import { get, set } from './config.js';
import { STORAGE_KEYS } from './storage-keys.js';
import events from './events.js';

let _locked = false;
let _lockEnabled = false;
let _unlockAttempts = 0;
const MAX_ATTEMPTS = 5;
let _lockoutUntil = null;

// 初始化锁屏
function initLock() {
  _lockEnabled = get('lockEnabled') || false;

  if (_lockEnabled) {
    _locked = true;
  }

  events.emit('lock:initialized', {
    enabled: _lockEnabled,
    locked: _locked
  });
}

// 启用锁屏
function enableLock(password) {
  if (!password || password.length < 4) {
    return { success: false, reason: '密码至少4位' };
  }

  set('lockEnabled', true);
  set('lockPassword', password);
  _lockEnabled = true;
  _locked = true;

  events.emit('lock:enabled', {});
  events.emit('lock:locked', { reason: 'enabled' });

  return { success: true };
}

// 禁用锁屏
function disableLock() {
  set('lockEnabled', false);
  set('lockPassword', null);
  _lockEnabled = false;
  _locked = false;
  _unlockAttempts = 0;
  _lockoutUntil = null;

  events.emit('lock:disabled', {});
  events.emit('lock:unlocked', { reason: 'disabled' });

  return { success: true };
}

// 锁定屏幕
function lock() {
  if (!_lockEnabled) return;
  if (_locked) return;

  _locked = true;
  events.emit('lock:locked', { reason: 'manual' });
}

// 解锁屏幕
function unlock(password) {
  if (!_lockEnabled) return { success: true };
  if (!_locked) return { success: true };

  // 检查是否被锁定
  if (_lockoutUntil && Date.now() < _lockoutUntil) {
    const remaining = Math.ceil((_lockoutUntil - Date.now()) / 1000);
    return { success: false, reason: 'lockout', remaining };
  }

  const storedPassword = get('lockPassword');

  if (!storedPassword) {
    // 没设密码，直接解锁
    _locked = false;
    _unlockAttempts = 0;
    events.emit('lock:unlocked', { reason: 'no_password' });
    return { success: true };
  }

  if (password === storedPassword) {
    _locked = false;
    _unlockAttempts = 0;
    _lockoutUntil = null;
    events.emit('lock:unlocked', { reason: 'password' });
    return { success: true };
  }

  _unlockAttempts++;

  if (_unlockAttempts >= MAX_ATTEMPTS) {
    _lockoutUntil = Date.now() + 60000;
    events.emit('lock:lockout', { duration: 60 });
    return { success: false, reason: 'lockout', remaining: 60 };
  }

  events.emit('lock:failed', { attempts: _unlockAttempts, remaining: MAX_ATTEMPTS - _unlockAttempts });
  return { success: false, reason: 'wrong_password', attempts: _unlockAttempts, remaining: MAX_ATTEMPTS - _unlockAttempts };
}

// 是否锁屏中
function isLocked() {
  return _locked;
}

// 是否启用锁屏
function isLockEnabled() {
  return _lockEnabled;
}

// 获取锁屏配置
function getLockConfig() {
  return {
    enabled: _lockEnabled,
    locked: _locked,
    avatar: get('lockAvatar') || null,
    message: get('lockMessage') || '',
    blur: get('lockscreenBlur') || false,
    showNotifications: get('lockShowNotifications') || false
  };
}

// 更新锁屏消息
function setLockMessage(message) {
  set('lockMessage', message);
  events.emit('lock:config_changed', { key: 'message', value: message });
}

// 更新锁屏头像
function setLockAvatar(avatar) {
  set('lockAvatar', avatar);
  events.emit('lock:config_changed', { key: 'avatar', value: avatar });
}

// 剩余锁定时间（秒）
function getLockoutRemaining() {
  if (!_lockoutUntil) return 0;
  const remaining = Math.ceil((_lockoutUntil - Date.now()) / 1000);
  return Math.max(0, remaining);
}

export {
  initLock,
  enableLock,
  disableLock,
  lock,
  unlock,
  isLocked,
  isLockEnabled,
  getLockConfig,
  setLockMessage,
  setLockAvatar,
  getLockoutRemaining
};