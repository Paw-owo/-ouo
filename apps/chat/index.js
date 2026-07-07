// ============================================
// chat/index.js — 聊天 APP 入口
// 导出 init(container) → 渲染聊天界面 → 返回 destroy
// 最小可用：用户发一句 → AI 回一句
// ============================================

import { sendChat } from '../../core/ai-client.js';
import events from '../../core/events.js';

let _styleEl = null;

function _injectStyles() {
  if (_styleEl) return;
  _styleEl = document.createElement('style');
  _styleEl.id = 'chat-app-styles';
  _styleEl.textContent = `
    .chat-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; -webkit-overflow-scrolling: touch; }
    .chat-msg { max-width: 80%; padding: 10px 14px; border-radius: var(--radius-lg); font-size: 0.9rem; line-height: 1.5; word-break: break-word; animation: msgIn 0.25s var(--ease-soft) both; }
    .chat-msg.user { align-self: flex-end; background: linear-gradient(135deg, var(--color-primary), var(--color-primary-deep)); color: #fff; border-bottom-right-radius: var(--radius-sm); }
    .chat-msg.ai { align-self: flex-start; background: var(--bg-surface); color: var(--text-primary); border: 1px solid var(--border-color); border-bottom-left-radius: var(--radius-sm); }
    .chat-msg.ai.fallback { opacity: 0.75; font-style: italic; }
    .chat-msg.system { align-self: center; background: transparent; color: var(--text-placeholder); font-size: 0.8rem; max-width: 100%; text-align: center; padding: 6px 12px; }
    .chat-typing { align-self: flex-start; padding: 10px 14px; }
    .chat-typing-dots { display: flex; gap: 4px; }
    .chat-typing-dots span { width: 7px; height: 7px; border-radius: 50%; background: var(--text-placeholder); animation: dotBounce 1.4s infinite both; }
    .chat-typing-dots span:nth-child(2) { animation-delay: 0.2s; }
    .chat-typing-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes msgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes dotBounce { 0%,80%,100% { transform: scale(0.6); } 40% { transform: scale(1); } }
    .chat-footer { display: flex; align-items: center; gap: 8px; padding: 10px 12px; padding-bottom: max(10px, env(safe-area-inset-bottom)); background: var(--bg-glass); backdrop-filter: var(--backdrop-blur); -webkit-backdrop-filter: var(--backdrop-blur); border-top: 1px solid var(--border-color); z-index: 20; }
    .chat-input { flex: 1; padding: 10px 14px; background: var(--bg-base); border: 1.5px solid var(--border-color); border-radius: var(--radius-full); font-size: 0.9rem; font-family: var(--font-family); color: var(--text-primary); outline: none; transition: border-color var(--duration-fast) var(--ease-smooth); min-height: 40px; resize: none; }
    .chat-input:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-ultralight); }
    .chat-input::placeholder { color: var(--text-placeholder); }
    .chat-send-btn { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; min-width: 40px; border-radius: 50%; background: linear-gradient(135deg, var(--color-primary), var(--color-primary-deep)); color: #fff; border: none; cursor: pointer; transition: all var(--duration-fast) var(--ease-soft); box-shadow: 0 2px 8px var(--color-primary-light); }
    .chat-send-btn:active { transform: scale(0.93); }
    .chat-send-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .chat-empty { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-placeholder); gap: 8px; padding: 24px; text-align: center; }
    .chat-empty svg { width: 48px; height: 48px; opacity: 0.35; }
    .chat-empty-text { font-size: 0.9rem; }
  `;
  document.head.appendChild(_styleEl);
}

function _render(container) {
  const page = document.createElement('div');
  page.className = 'app-page';
  page.innerHTML = `
    <div class="app-header">
      <button class="app-header-back" id="chat-back-btn" aria-label="返回">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="22" height="22"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <span class="app-header-title">聊天</span>
      <div class="app-header-action"></div>
    </div>
    <div class="chat-messages" id="chat-messages">
      <div class="chat-empty" id="chat-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="chat-empty-text">说点什么吧~</span>
      </div>
    </div>
    <div class="chat-footer">
      <input class="chat-input" id="chat-input" type="text" placeholder="输入消息..." autocomplete="off"/>
      <button class="chat-send-btn" id="chat-send-btn" aria-label="发送">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      </button>
    </div>
  `;
  container.appendChild(page);
  _bindEvents(page);
}

function _bindEvents(page) {
  const backBtn = page.querySelector('#chat-back-btn');
  const sendBtn = page.querySelector('#chat-send-btn');
  const inputEl = page.querySelector('#chat-input');
  const messagesEl = page.querySelector('#chat-messages');
  const emptyEl = page.querySelector('#chat-empty');

  let _sending = false;

  backBtn.addEventListener('click', () => {
    events.emit('app:closed', { appId: 'chat' });
  });

  function _hideEmpty() {
    if (emptyEl) emptyEl.style.display = 'none';
  }

  function _addMessage(role, text, extraClass) {
    _hideEmpty();
    const div = document.createElement('div');
    div.className = `chat-msg ${role}${extraClass ? ' ' + extraClass : ''}`;
    div.textContent = text;
    messagesEl.appendChild(div);
    _scrollToBottom();
    return div;
  }

  function _addTyping() {
    _hideEmpty();
    const div = document.createElement('div');
    div.className = 'chat-typing';
    div.id = 'chat-typing';
    div.innerHTML = '<div class="chat-typing-dots"><span></span><span></span><span></span></div>';
    messagesEl.appendChild(div);
    _scrollToBottom();
    return div;
  }

  function _removeTyping() {
    const el = document.getElementById('chat-typing');
    if (el) el.remove();
  }

  function _scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  async function _doSend() {
    if (_sending) return;
    const text = inputEl.value.trim();
    if (!text) return;

    _sending = true;
    sendBtn.disabled = true;
    inputEl.disabled = true;
    inputEl.value = '';

    // 显示用户消息
    _addMessage('user', text);

    // 显示 typing 动画
    _addTyping();

    try {
      const result = await sendChat([{ role: 'user', content: text }]);
      _removeTyping();

      if (result.ok && result.content && result.content.trim()) {
        _addMessage('ai', result.content);
      } else if (result.ok) {
        // 响应结构异常（choices/message 缺失导致空内容）
        _addMessage('ai', '唔…收到的回复好像不太对，再试一次吧~', 'fallback');
      } else {
        // 根据 reason 给出更具体的提示
        let hint;
        if (result.reason === 'api_not_configured') {
          hint = '还没配置 API 呢，去设置里填一下就好啦~';
        } else {
          hint = result.content; // 使用 ai-client 的 fallback 消息
        }
        _addMessage('ai', hint, 'fallback');
      }
    } catch (err) {
      _removeTyping();
      console.error('[Chat] 发送异常:', err.message);
      _addMessage('ai', '唔…出了点小问题，再试一次吧~', 'fallback');
    }

    _sending = false;
    sendBtn.disabled = false;
    inputEl.disabled = false;
    inputEl.focus();
  }

  sendBtn.addEventListener('click', _doSend);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      _doSend();
    }
  });
}

function _destroy() {
  if (_styleEl) { _styleEl.remove(); _styleEl = null; }
  const el = document.getElementById('chat-app-styles');
  if (el) el.remove();
}

function init(container) {
  _injectStyles();
  _render(container);
  return _destroy;
}

export { init };