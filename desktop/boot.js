// ============================================
// boot.js — 启动/加载页
// 启动动画 → 根据 lock 状态决定进入锁屏或桌面
// ============================================

import { isLocked } from '../core/lock.js';
import events from '../core/events.js';

// 启动文案池
const BOOT_MESSAGES = [
  '小手机正在醒来…',
  '今天也请多关照呀',
  '正在整理桌面…',
  '给你准备好啦',
  '早安，今天也要开心哦',
  '正在充电元气中…',
  '今天的阳光真温柔',
  '等你好久啦',
  '泡杯茶，马上就好',
  '正在系好小蝴蝶结…'
];

let _bootEl = null;
let _textEl = null;
let _resolved = false;

// 创建启动页DOM
function _createBootScreen() {
  const el = document.createElement('div');
  el.className = 'boot-screen';
  el.innerHTML = `
    <div class="boot-icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
           stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M8 14s1.5 2 4 2 4-2 4-2"/>
        <line x1="9" y1="9" x2="9.01" y2="9"/>
        <line x1="15" y1="9" x2="15.01" y2="9"/>
      </svg>
    </div>
    <div class="boot-text"></div>
    <div class="boot-dots">
      <div class="boot-dot"></div>
      <div class="boot-dot"></div>
      <div class="boot-dot"></div>
    </div>
  `;
  return el;
}

// 轮换文案
function _cycleMessages(textEl) {
  let idx = 0;
  const pick = () => {
    textEl.textContent = BOOT_MESSAGES[idx % BOOT_MESSAGES.length];
    idx++;
  };
  pick();
  return setInterval(pick, 1200);
}

// 启动流程
export function startBoot() {
  return new Promise((resolve) => {
    if (_resolved) {
      resolve(isLocked());
      return;
    }

    const frame = document.getElementById('phone-frame');
    if (!frame) {
      _resolved = true;
      resolve(isLocked());
      return;
    }

    _bootEl = _createBootScreen();
    _textEl = _bootEl.querySelector('.boot-text');
    frame.appendChild(_bootEl);

    const timer = _cycleMessages(_textEl);

    // 启动时长：至少1.5秒，模拟加载感
    setTimeout(() => {
      clearInterval(timer);
      _bootEl.classList.add('boot-hiding');

      _bootEl.addEventListener('transitionend', () => {
        if (_bootEl && _bootEl.parentNode) {
          _bootEl.parentNode.removeChild(_bootEl);
        }
        _bootEl = null;
        _textEl = null;
        _resolved = true;

        const locked = isLocked();
        events.emit('boot:complete', { locked });
        resolve(locked);
      }, { once: true });

      // 兜底超时
      setTimeout(() => {
        if (_bootEl && _bootEl.parentNode) {
          _bootEl.parentNode.removeChild(_bootEl);
          _bootEl = null;
          _textEl = null;
          if (!_resolved) {
            _resolved = true;
            const locked = isLocked();
            events.emit('boot:complete', { locked });
            resolve(locked);
          }
        }
      }, 400);
    }, 1800);
  });
}