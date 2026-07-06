// ============================================
// lockscreen.js — 锁屏层
// 展示时间、日期、锁屏信息、密码输入
// 调用 core/lock.js，不自己另搞一套锁屏状态
// ============================================

import { isLocked, verifyPassword, getLockConfig, unlock } from '../core/lock.js';
import events from '../core/events.js';

let _lsEl = null;
let _passwordInput = '';
let _timeTimer = null;
let _shakeTimer = null;

// 获取时间字符串
function _getTimeStr() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

// 获取日期字符串
function _getDateStr() {
  const now = new Date();
  const weekDays = ['日', '一', '二', '三', '四', '五', '六'];
  const y = now.getFullYear();
  const mo = now.getMonth() + 1;
  const d = now.getDate();
  const w = weekDays[now.getDay()];
  return `${y}年${mo}月${d}日 星期${w}`;
}

// 创建锁屏DOM
function _createLockScreen() {
  const config = getLockConfig();

  const el = document.createElement('div');
  el.id = 'lockscreen';
  el.innerHTML = `
    <div class="lockscreen-content">
      <div class="lockscreen-time">${_getTimeStr()}</div>
      <div class="lockscreen-date">${_getDateStr()}</div>

      ${config.avatar ? `
        <div class="lockscreen-avatar">
          <img src="${config.avatar}" alt="avatar" style="width:100%;height:100%;object-fit:cover;">
        </div>
      ` : `
        <div class="lockscreen-avatar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="8" r="4"/>
            <path d="M4 20c0-4 4-7 8-7s8 3 8 7"/>
          </svg>
        </div>
      `}

      ${config.message ? `<div class="lockscreen-message">${config.message}</div>` : ''}

      ${config.hasPassword ? `
        <div class="lockscreen-password-area">
          <div class="lockscreen-password-dots">
            <div class="lockscreen-password-dot" data-dot="0"></div>
            <div class="lockscreen-password-dot" data-dot="1"></div>
            <div class="lockscreen-password-dot" data-dot="2"></div>
            <div class="lockscreen-password-dot" data-dot="3"></div>
          </div>
          <div class="lockscreen-hint">输入密码</div>
          <div class="lockscreen-numpad">
            <button class="lockscreen-numkey" data-key="1">1</button>
            <button class="lockscreen-numkey" data-key="2">2</button>
            <button class="lockscreen-numkey" data-key="3">3</button>
            <button class="lockscreen-numkey" data-key="4">4</button>
            <button class="lockscreen-numkey" data-key="5">5</button>
            <button class="lockscreen-numkey" data-key="6">6</button>
            <button class="lockscreen-numkey" data-key="7">7</button>
            <button class="lockscreen-numkey" data-key="8">8</button>
            <button class="lockscreen-numkey" data-key="9">9</button>
            <div class="lockscreen-numkey placeholder"></div>
            <button class="lockscreen-numkey" data-key="0">0</button>
            <button class="lockscreen-numkey delete-key" data-key="delete">删除</button>
          </div>
        </div>
      ` : `
        <div class="lockscreen-password-area">
          <div class="lockscreen-hint" style="margin-top:16px;">轻触屏幕唤醒</div>
        </div>
      `}
    </div>
  `;

  return el;
}

// 更新密码点显示
function _updateDots() {
  if (!_lsEl) return;
  const dots = _lsEl.querySelectorAll('.lockscreen-password-dot');
  dots.forEach((dot, i) => {
    if (i < _passwordInput.length) {
      dot.classList.add('filled');
      dot.classList.remove('error');
    } else {
      dot.classList.remove('filled', 'error');
    }
  });
}

// 显示错误动画
function _showError() {
  if (!_lsEl) return;
  const dots = _lsEl.querySelectorAll('.lockscreen-password-dot');
  dots.forEach(d => d.classList.add('error'));
  const hint = _lsEl.querySelector('.lockscreen-hint');
  if (hint) {
    hint.textContent = '密码不太对，再试试看~';
    hint.classList.add('error');
  }

  if (_shakeTimer) clearTimeout(_shakeTimer);
  _shakeTimer = setTimeout(() => {
    dots.forEach(d => d.classList.remove('error', 'filled'));
    if (hint) {
      hint.textContent = '输入密码';
      hint.classList.remove('error');
    }
  }, 800);
}

// 显示锁定提示
function _showLockedOut(remainingMs) {
  if (!_lsEl) return;
  const hint = _lsEl.querySelector('.lockscreen-hint');
  if (hint) {
    const sec = Math.ceil(remainingMs / 1000);
    hint.textContent = `稍等一下，${sec}秒后再试哦`;
    hint.classList.add('error');
  }
  // 禁用键盘
  const keys = _lsEl.querySelectorAll('.lockscreen-numkey');
  keys.forEach(k => { k.style.pointerEvents = 'none'; k.style.opacity = '0.4'; });
  setTimeout(() => {
    keys.forEach(k => { k.style.pointerEvents = ''; k.style.opacity = ''; });
    if (hint) {
      hint.textContent = '输入密码';
      hint.classList.remove('error');
    }
  }, remainingMs + 100);
}

// 处理密码输入
function _handleKeyPress(key) {
  if (key === 'delete') {
    _passwordInput = _passwordInput.slice(0, -1);
    _updateDots();
    return;
  }

  if (_passwordInput.length >= 4) return;

  _passwordInput += key;
  _updateDots();

  if (_passwordInput.length === 4) {
    const result = verifyPassword(_passwordInput);

    if (result.success) {
      // 解锁成功，隐藏锁屏
      hideLockScreen();
      events.emit('lockscreen:unlocked', {});
    } else if (result.reason === 'locked_out') {
      _showLockedOut(result.remainingMs);
      _passwordInput = '';
      _updateDots();
    } else {
      _showError();
      _passwordInput = '';
      setTimeout(() => _updateDots(), 800);
    }
  }
}

// 绑定事件
function _bindEvents() {
  if (!_lsEl) return;
  const config = getLockConfig();

  // 密码键盘
  _lsEl.querySelectorAll('.lockscreen-numkey').forEach(btn => {
    btn.addEventListener('click', () => {
      _handleKeyPress(btn.dataset.key);
    });
  });

  // 无密码时点击屏幕解锁
  if (!config.hasPassword) {
    _lsEl.addEventListener('click', (e) => {
      if (e.target.closest('.lockscreen-numkey')) return;
      hideLockScreen();
      events.emit('lockscreen:unlocked', {});
    });
  }
}

// 更新时钟
function _startClock() {
  if (_timeTimer) clearInterval(_timeTimer);
  _timeTimer = setInterval(() => {
    if (!_lsEl) return;
    const timeEl = _lsEl.querySelector('.lockscreen-time');
    const dateEl = _lsEl.querySelector('.lockscreen-date');
    if (timeEl) timeEl.textContent = _getTimeStr();
    if (dateEl) dateEl.textContent = _getDateStr();
  }, 10000);
}

// 显示锁屏
export function showLockScreen() {
  if (!isLocked()) return;

  const frame = document.getElementById('phone-frame');
  if (!frame) return;

  // 移除旧锁屏
  const existing = frame.querySelector('#lockscreen');
  if (existing) existing.remove();

  _lsEl = _createLockScreen();
  _passwordInput = '';
  frame.appendChild(_lsEl);

  _bindEvents();
  _startClock();
}

// 隐藏锁屏
export function hideLockScreen() {
  if (!_lsEl) return;

  _lsEl.classList.add('lockscreen-hidden');

  _lsEl.addEventListener('transitionend', () => {
    if (_lsEl && _lsEl.parentNode) {
      _lsEl.parentNode.removeChild(_lsEl);
    }
    _lsEl = null;
    if (_timeTimer) {
      clearInterval(_timeTimer);
      _timeTimer = null;
    }
  }, { once: true });

  // 兜底
  setTimeout(() => {
    if (_lsEl && _lsEl.parentNode) {
      _lsEl.parentNode.removeChild(_lsEl);
      _lsEl = null;
      if (_timeTimer) {
        clearInterval(_timeTimer);
        _timeTimer = null;
      }
    }
  }, 400);
}

// 监听锁屏事件
events.on('lock:locked', () => {
  showLockScreen();
});

events.on('lock:unlocked', () => {
  hideLockScreen();
});