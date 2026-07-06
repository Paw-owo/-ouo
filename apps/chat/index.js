// ============================================
// chat/index.js — 聊天APP入口
// 提供基础骨架：顶栏、消息列表、输入区
// 最小流程：输入消息 → 调用 AI 底层 sendChat → 显示回复/兜底
// 不做会话列表、引用回复、长按菜单、语音图片等
// ============================================

import { sendChat } from '../../js/ai/ai-client.js';
import { getCurrentCharacter } from '../../core/storage.js';
import { goBack } from '../../core/router.js';
import events from '../../core/events.js';
import { showToast } from '../../core/ui.js';

// 加载聊天专属样式（仅加载一次）
let _cssLoaded = false;
function _ensureCSS() {
  if (_cssLoaded) return;
  _cssLoaded = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/apps/chat/css/chat.css';
  document.head.appendChild(link);
}

// 消息列表（内存态，本轮不持久化）
let _messages = [];

// 是否正在等待AI回复
let _isSending = false;

// 当前 AbortController（用于用户主动取消）
let _abortController = null;

// 当前APP实例的appId（由 app-host 传入，不写死）
let _appId = 'chat';

// mount: 由 app-host 调用，container 是 .app-page 元素
function mount(container, { appId, definition } = {}) {
  _ensureCSS();
  _appId = appId || 'chat';

  // 渲染骨架
  container.innerHTML = _buildSkeleton(definition?.name || '聊天');

  // 缓存DOM
  const msgList = container.querySelector('.chat-msg-list');
  const input = container.querySelector('.chat-input');
  const sendBtn = container.querySelector('.chat-send-btn');
  const backBtn = container.querySelector('.app-header-back');

  // 初始空状态
  _renderEmptyState(msgList);

  // 绑定事件
  const onSend = () => _handleSend(msgList, input, sendBtn);
  const onInput = () => _updateSendBtnState(input, sendBtn);
  const onKeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };
  const onBack = () => goBack();

  sendBtn.addEventListener('click', onSend);
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKeydown);
  backBtn.addEventListener('click', onBack);

  // 返回 unmount 清理函数
  return function unmount() {
    if (_abortController) {
      _abortController.abort();
      _abortController = null;
    }
    sendBtn.removeEventListener('click', onSend);
    input.removeEventListener('input', onInput);
    input.removeEventListener('keydown', onKeydown);
    backBtn.removeEventListener('click', onBack);
    _messages = [];
    _isSending = false;
  };
}

// 构建页面骨架
function _buildSkeleton(title) {
  return `
    <header class="app-header">
      <button class="app-header-back" aria-label="返回">
        ${_BACK_ICON}
      </button>
      <span class="app-header-title">${title}</span>
      <span class="app-header-action"></span>
    </header>
    <main class="app-body chat-msg-list no-padding"></main>
    <footer class="chat-input-bar">
      <textarea class="chat-input" placeholder="说点什么……" rows="1"></textarea>
      <button class="chat-send-btn" disabled aria-label="发送">
        ${_SEND_ICON}
      </button>
    </footer>
  `;
}

// 发送消息主流程
async function _handleSend(msgList, input, sendBtn) {
  const text = (input.value || '').trim();
  if (!text || _isSending) return;

  // 1. 显示用户消息
  _messages.push({ role: 'user', content: text });
  _appendMessage(msgList, 'user', text);

  // 2. 清空输入、禁用按钮
  input.value = '';
  input.style.height = '';
  _setSending(sendBtn, true);

  // 3. 显示"正在想"占位
  const thinkingEl = _appendThinking(msgList);

  // 4. 调用AI底层
  _abortController = new AbortController();
  const characterId = getCurrentCharacter();

  try {
    const history = _messages
      .filter(m => m !== _messages[_messages.length - 1]) // 排除刚加的
      .slice(-10)
      .map(m => ({ role: m.role, content: m.content }));

    const result = await sendChat({
      userMessage: text,
      history,
      characterId,
      appId: _appId,
      signal: _abortController.signal,
      onChunk: (chunk) => {
        _updateStreaming(thinkingEl, chunk);
      }
    });

    // 5. 移除占位，显示最终回复
    thinkingEl.remove();

    const displayText = result.text || '……';
    _messages.push({ role: 'assistant', content: displayText });
    _appendMessage(msgList, 'assistant', displayText);

    // 如果走了兜底，提示一下
    if (result.degraded) {
      showToast('回复走了兜底', { type: 'info', duration: 1500 });
    }

    // 发出消息发送事件（供其他模块监听）
    events.emit('message.sent', {
      appId: _appId,
      role: 'assistant',
      content: displayText,
      degraded: result.degraded
    });

  } catch (err) {
    thinkingEl.remove();
    // 兜底：sendChat 内部已处理常规失败并返回 degraded 回复，
    // 这里只在 sendChat 自身异常时兜底，保持第一人称口吻
    const errMsg = '我这边卡了一下，没接住你的消息。';
    _appendMessage(msgList, 'assistant', errMsg);
    console.warn('[Chat] 发送失败:', err);
  } finally {
    _abortController = null;
    _setSending(sendBtn, false);
    _updateSendBtnState(input, sendBtn);
  }
}

// ========== 渲染辅助 ==========

function _appendMessage(list, role, content) {
  const el = document.createElement('div');
  el.className = `chat-msg chat-msg-${role}`;
  el.innerHTML = `
    <div class="chat-bubble">${_escapeHtml(content)}</div>
  `;
  list.appendChild(el);
  _scrollToBottom(list);
}

function _appendThinking(list) {
  const el = document.createElement('div');
  el.className = 'chat-msg chat-msg-assistant chat-msg-thinking';
  el.innerHTML = `
    <div class="chat-bubble chat-bubble-thinking">
      <span class="chat-dot"></span>
      <span class="chat-dot"></span>
      <span class="chat-dot"></span>
    </div>
  `;
  list.appendChild(el);
  _scrollToBottom(list);
  return el;
}

function _updateStreaming(thinkingEl, chunk) {
  if (!thinkingEl) return;
  // 把占位换成流式文本
  if (thinkingEl.classList.contains('chat-msg-thinking')) {
    thinkingEl.classList.remove('chat-msg-thinking');
    thinkingEl.querySelector('.chat-bubble').className = 'chat-bubble chat-bubble-streaming';
    thinkingEl.querySelector('.chat-bubble').textContent = chunk;
  } else {
    thinkingEl.querySelector('.chat-bubble').textContent += chunk;
  }
}

function _renderEmptyState(list) {
  const el = document.createElement('div');
  el.className = 'chat-empty';
  el.innerHTML = `
    <div class="chat-empty-icon">${_CHAT_ICON}</div>
    <div class="chat-empty-text">和我说说话吧</div>
  `;
  list.appendChild(el);
}

function _setSending(sendBtn, sending) {
  _isSending = sending;
  sendBtn.classList.toggle('sending', sending);
  sendBtn.disabled = sending;
}

function _updateSendBtnState(input, sendBtn) {
  const has = !!(input.value || '').trim();
  sendBtn.disabled = !has || _isSending;
  // 自适应高度
  input.style.height = 'auto';
  input.style.height = Math.min(input.scrollHeight, 100) + 'px';
}

function _scrollToBottom(list) {
  requestAnimationFrame(() => {
    list.scrollTop = list.scrollHeight;
  });
}

function _escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ========== 图标 ==========

const _BACK_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>`;

const _SEND_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg>`;

const _CHAT_ICON = `<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`;

export default mount;
