// ============================================
// chat-view.js — 聊天界面（完整版 Step 2）
// 双模式 / 气泡规则 / AI操作行 / 工具箱12格 / 流式输出 / 滚动辅助 / 历史分页
// 所有样式走 chat.css 的 CSS 类，不写 inline 色值
// ============================================

import { ICONS } from '../icons/chat-icons.js';
import {
  getConversation, loadMessages, appendMessage, saveDraft,
  updateConversation, deleteConversation, _defaultConversationSettings, formatTime,
  getSlashCommands, getConversations, clearMessages,
  getGithubConfig, setGithubConfig
} from '../data/chat-store.js';
import { renderMarkdown } from '../utils/chat-markdown.js';
import { sendChat } from '../../../js/ai/ai-client.js';
import { getCurrentCharacter, getCharacter, getSetting } from '../../../core/storage.js';
import { STORAGE_KEYS } from '../../../core/storage-keys.js';
import events from '../../../core/events.js';

// ========== 状态 ==========

let _container = null;
let _pageEl = null;
let _messagesEl = null;
let _inputEl = null;
let _sendBtn = null;
let _plusBtn = null;

let _convId = null;
let _conv = null;
let _messages = [];        // 已渲染的消息
let _allMessages = [];     // 全部历史消息（分页用）

let _sending = false;
let _abortController = null;

let _onBack = null;
let _highlightMsgId = null;

let _mode = 'bubble';       // 'bubble' | 'conversation'
let _toolboxOpen = false;
let _toolboxPanel = null;

const _PAGE_SIZE = 50;  // SKILL 5.13: 每次加载50条
let _renderedCount = 0;

let _scrollBottomBtn = null;
let _newMsgBadge = null;
let _typingEl = null;
let _currentAiDiv = null;
let _currentAiMsg = null;
let _isNearBottom = true;
let _unreadNewCount = 0;
let _scrollLoading = false;

// 长按菜单
let _longPressTimer = null;
let _longPressTarget = null;
const _LONG_PRESS_DELAY = 300;
const _RECALL_WINDOW = 60 * 1000;  // 撤回时间窗口 60s

// 工具箱12格配置
const TOOLBOX_ITEMS = [
  { id: 'mcp',     label: 'MCP',    icon: 'mcp' },
  { id: 'emoji',   label: '表情',   icon: 'emoji' },
  { id: 'image',   label: '图片',   icon: 'image' },
  { id: 'file',    label: '文件',   icon: 'file' },
  { id: 'voice',   label: '语音',   icon: 'mic' },
  { id: 'context', label: '上下文', icon: 'context' },
  { id: 'temp',    label: '温度',   icon: 'temp' },
  { id: 'clear',   label: '清空',   icon: 'clear' },
  { id: 'slash',   label: '指令',   icon: 'slash' },
  { id: 'github',  label: 'GitHub', icon: 'github' },
  { id: 'cot',     label: '思维链', icon: 'brain' },
  { id: 'model',   label: '模型',   icon: 'model' }
];

// ========== 渲染入口 ==========

function render(container, convId, callbacks = {}) {
  _container = container;
  _convId = convId;
  _onBack = callbacks.onBack;
  _highlightMsgId = callbacks.highlightMsgId || null;
  _conv = getConversation(convId);
  _mode = _conv?.settings?.mode || 'bubble';

  _pageEl = document.createElement('div');
  _pageEl.className = 'chat-view-page';
  _pageEl.innerHTML = _buildHTML();

  container.appendChild(_pageEl);
  _messagesEl = _pageEl.querySelector('#chat-messages');
  _inputEl = _pageEl.querySelector('#chat-input');
  _sendBtn = _pageEl.querySelector('#chat-send-btn');
  _plusBtn = _pageEl.querySelector('#chat-plus-btn');
  _scrollBottomBtn = _pageEl.querySelector('#chat-scroll-bottom');
  _newMsgBadge = _pageEl.querySelector('#chat-new-msg-badge');

  _bindEvents();
  _loadHistory();

  return { destroy };
}

function _buildHTML() {
  const title = _escapeHtml(_conv?.title || '对话');
  const modeIcon = _mode === 'conversation' ? 'bubble' : 'edit';
  return `
    <div class="app-header chat-header">
      <button class="app-header-back" id="chat-back-btn" aria-label="返回">${ICONS.back(22)}</button>
      <span class="app-header-title">${title}</span>
      <button class="app-header-action" id="chat-mode-btn" aria-label="切换模式">${ICONS[modeIcon](20)}</button>
      <button class="app-header-action" id="chat-more-btn" aria-label="设置">${ICONS.more(20)}</button>
    </div>
    <div class="chat-messages-area" id="chat-messages">
      <div class="chat-load-more" id="chat-load-more" hidden></div>
      <div class="chat-empty-hint" id="chat-empty-hint">
        <span class="chat-empty-hint-text">说点什么吧~</span>
      </div>
    </div>
    <button class="chat-scroll-bottom-btn" id="chat-scroll-bottom" aria-label="回到底部" hidden>${ICONS.arrowDown(20)}</button>
    <span class="chat-new-msg-badge" id="chat-new-msg-badge" hidden>0</span>
    <div class="chat-footer-bar">
      <button class="chat-tool-trigger" id="chat-plus-btn" aria-label="工具箱">${ICONS.plus(22)}</button>
      <textarea class="chat-input" id="chat-input" placeholder="输入消息..." rows="1" autocomplete="off"></textarea>
      <button class="chat-send-btn" id="chat-send-btn" aria-label="发送">${ICONS.send(18)}</button>
    </div>
    <div class="chat-toolbox-overlay" id="chat-toolbox-overlay" hidden></div>
    <div class="chat-toolbox" id="chat-toolbox" hidden>
      <div class="chat-toolbox-grid" id="chat-toolbox-grid">
        ${TOOLBOX_ITEMS.map(item => `
          <button class="chat-tool-item" data-tool="${item.id}">
            <span class="chat-tool-icon">${ICONS[item.icon](24)}</span>
            <span class="chat-tool-label">${item.label}</span>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

// ========== 事件绑定 ==========

function _bindEvents() {
  // 返回
  _pageEl.querySelector('#chat-back-btn').addEventListener('click', () => {
    const text = _inputEl.value.trim();
    saveDraft(_convId, text);
    if (_onBack) _onBack();
  });

  // 模式切换
  _pageEl.querySelector('#chat-mode-btn').addEventListener('click', () => {
    _switchMode(_mode === 'bubble' ? 'conversation' : 'bubble');
  });

  // 更多（设置）— 打开聊天设置抽屉（o3o skill 第十一节）
  _pageEl.querySelector('#chat-more-btn').addEventListener('click', () => {
    _showSettingsDrawer();
  });

  // 发送
  _sendBtn.addEventListener('click', () => {
    if (_sending) {
      _stopStreaming();
    } else {
      _doSend();
    }
  });

  // 输入框
  _inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      _doSend();
    }
  });
  _inputEl.addEventListener('input', _autoResize);

  // 工具箱触发
  _plusBtn.addEventListener('click', () => {
    _toggleToolbox();
  });

  // 工具箱遮罩
  _pageEl.querySelector('#chat-toolbox-overlay').addEventListener('click', () => {
    _closeToolbox();
  });

  // 工具箱项点击
  _pageEl.querySelector('#chat-toolbox-grid').addEventListener('click', (e) => {
    const item = e.target.closest('.chat-tool-item');
    if (!item) return;
    const tool = item.dataset.tool;
    _closeToolbox();
    _handleTool(tool);
  });

  // 滚动监听
  _messagesEl.addEventListener('scroll', _onScroll);

  // 回到底部
  _scrollBottomBtn.addEventListener('click', () => {
    _scrollToBottom(true);
  });

  // 事件中心
  events.on('message.sent', _onExternalMessage);
  events.on('message.received', _onExternalMessage);

  // AI 操作行事件委托
  _bindActionEvents();
}

// ========== 历史加载（分页） ==========

async function _loadHistory() {
  try {
    const stored = await loadMessages(_convId, _conv?.characterId);
    if (!stored || stored.length === 0) {
      _removeEmptyHint();
      return;
    }
    _allMessages = stored;
    // 初始渲染最后 PAGE_SIZE 条
    const startIdx = Math.max(0, stored.length - _PAGE_SIZE);
    _renderedCount = stored.length - startIdx;
    const initial = stored.slice(startIdx);
    _removeEmptyHint();
    for (let i = 0; i < initial.length; i++) {
      const prev = i > 0 ? initial[i - 1] : null;
      _renderMessage(initial[i], prev, false);
    }
    _messages = initial.slice();
    _scrollToBottom(false);

    // 高亮指定消息
    if (_highlightMsgId) {
      const el = _messagesEl.querySelector(`[data-msg-id="${_highlightMsgId}"]`);
      if (el) {
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        el.classList.add('chat-msg-highlight');
        setTimeout(() => el.classList.remove('chat-msg-highlight'), 2000);
      }
    }

    // 如果还有更多历史，显示加载更多提示
    if (startIdx > 0) {
      _showLoadMoreHint();
    }
  } catch (err) {
    console.error('[Chat] 加载历史失败:', err.message);
  }
}

function _removeEmptyHint() {
  _pageEl.querySelector('#chat-empty-hint')?.remove();
}

function _showLoadMoreHint() {
  const hint = _pageEl.querySelector('#chat-load-more');
  if (hint) {
    hint.hidden = false;
    hint.innerHTML = '<span class="chat-load-more-text">向上滚动加载更多</span>';
  }
}

async function _loadMoreHistory() {
  if (_scrollLoading || _renderedCount >= _allMessages.length) return;
  _scrollLoading = true;
  const loadMoreEl = _pageEl.querySelector('#chat-load-more');
  if (loadMoreEl) {
    loadMoreEl.hidden = false;
    loadMoreEl.innerHTML = '<span class="chat-load-more-spinner"></span><span class="chat-load-more-text">加载中...</span>';
  }

  // 记录滚动位置
  const prevScrollHeight = _messagesEl.scrollHeight;
  const prevScrollTop = _messagesEl.scrollTop;

  const nextStart = Math.max(0, _allMessages.length - _renderedCount - _PAGE_SIZE);
  const nextCount = _allMessages.length - _renderedCount - nextStart;
  const older = _allMessages.slice(nextStart, nextStart + nextCount);

  // 在顶部插入
  const firstChild = _messagesEl.querySelector('.chat-msg-row');
  for (let i = older.length - 1; i >= 0; i--) {
    const prev = i > 0 ? older[i - 1] : null;
    const fragment = _buildMessageRow(older[i], prev);
    if (firstChild) {
      _messagesEl.insertBefore(fragment, firstChild);
    } else {
      _messagesEl.insertBefore(fragment, _messagesEl.firstChild);
    }
  }
  _renderedCount += nextCount;
  _messages = [...older, ..._messages];

  // 恢复滚动位置
  _messagesEl.scrollTop = prevScrollTop + (_messagesEl.scrollHeight - prevScrollHeight);

  if (_renderedCount >= _allMessages.length) {
    if (loadMoreEl) {
      loadMoreEl.innerHTML = '<span class="chat-load-more-text">已加载全部消息</span>';
    }
  } else {
    if (loadMoreEl) loadMoreEl.innerHTML = '<span class="chat-load-more-text">向上滚动加载更多</span>';
  }
  _scrollLoading = false;
}

// ========== 消息渲染 ==========

function _renderMessage(msg, prevMsg, autoScroll = true) {
  _removeEmptyHint();
  const fragment = _buildMessageRow(msg, prevMsg);
  const row = fragment.querySelector('.chat-msg-row');
  _messagesEl.appendChild(fragment);
  if (autoScroll) _scrollToBottom(true);
  return row;
}

function _buildMessageRow(msg, prevMsg) {
  const fragment = document.createDocumentFragment();

  // 时间分隔线
  if (_shouldShowTimeSeparator(msg, prevMsg)) {
    const sep = document.createElement('div');
    sep.className = 'chat-time-separator';
    sep.textContent = formatTime(msg.timestamp);
    fragment.appendChild(sep);
  }

  const row = document.createElement('div');
  row.className = 'chat-msg-row';
  row.dataset.msgId = msg.id;
  row.dataset.role = msg.role;

  // 上下文范围可视化（SKILL 10.2）
  const settings = _conv?.settings || _defaultConversationSettings();
  if (settings.showContextRange) {
    if (_isInContext(msg)) {
      row.classList.add('chat-msg-in-context');
    } else {
      row.classList.add('chat-msg-out-context');
    }
  }

  // 对话模式渲染
  if (_mode === 'conversation') {
    row.classList.add('chat-msg-row-conversation');
    row.innerHTML = _buildConversationHTML(msg);
  } else {
    // 气泡模式渲染
    row.classList.add('chat-msg-row-bubble');
    const isContinuation = _isContinuation(msg, prevMsg);
    row.innerHTML = _buildBubbleHTML(msg, isContinuation);
    if (isContinuation) {
      row.classList.add('chat-msg-continuation');
    }
  }

  fragment.appendChild(row);
  return fragment;
}

function _buildBubbleHTML(msg, isContinuation) {
  const isUser = msg.role === 'user';
  const bubbleClass = isUser ? 'chat-bubble chat-bubble-user' : 'chat-bubble chat-bubble-ai';

  // 内容渲染（content 已剥离思维块）
  const contentHTML = _renderContent(msg);

  // 思维链卡片（AI消息，开关开启时）
  let cotHTML = '';
  if (!isUser) {
    const cot = _getCoTForMessage(msg);
    if (cot) cotHTML = _renderCoTCard(cot);
  }

  // 引用回复块
  let replyHTML = '';
  if (msg.replyTo) {
    replyHTML = `
      <div class="chat-reply-quote" data-reply-to="${_escapeAttr(msg.replyTo.id || '')}">
        <div class="chat-reply-name">${_escapeHtml(msg.replyTo.name || '')}</div>
        <div class="chat-reply-content">${_escapeHtml(msg.replyTo.content || '')}</div>
      </div>
    `;
  }

  // AI 操作行
  let actionsHTML = '';
  if (!isUser && msg.content) {
    actionsHTML = `
      <div class="chat-msg-actions">
        <button class="chat-action-btn" data-action="refresh" aria-label="重新生成">${ICONS.refresh(16)}</button>
        <button class="chat-action-btn" data-action="tts" aria-label="朗读">${ICONS.volume(16)}</button>
        <button class="chat-action-btn" data-action="copy" aria-label="复制">${ICONS.copy(16)}</button>
        <button class="chat-action-btn" data-action="more" aria-label="更多">${ICONS.more(16)}</button>
      </div>
    `;
  }

  // Token 用量显示（SKILL 10.1）
  let tokenHTML = '';
  if (!isUser && msg.usage) {
    const settings = _conv?.settings || _defaultConversationSettings();
    if (settings.showTokenUsage) {
      tokenHTML = `<div class="chat-token-usage">in: ${msg.usage.prompt || 0} / out: ${msg.usage.completion || 0} tokens</div>`;
    }
  }

  // 版本历史指示器（SKILL 10.4）
  let versionHTML = '';
  if (!isUser && msg.versions && msg.versions.length > 0) {
    const total = msg.versions.length + 1;
    const current = msg._currentVersion != null ? msg._currentVersion + 1 : total;
    versionHTML = `
      <div class="chat-version-indicator">
        <button class="chat-version-btn" data-action="version-prev" data-msg-id="${msg.id}" aria-label="上一版本">${ICONS.chevronRight ? ICONS.chevronRight(12) : '‹'}</button>
        <span class="chat-version-text">${current} / ${total}</span>
        <button class="chat-version-btn" data-action="version-next" data-msg-id="${msg.id}" aria-label="下一版本">${ICONS.chevronRight(12)}</button>
      </div>
    `;
  }

  // 错误标记
  let errorHTML = '';
  if (msg.type === 'error') {
    errorHTML = `<span class="chat-error-icon" data-action="toggle-error">${ICONS.alert(14)}</span>`;
  }

  return `
    <div class="${bubbleClass}" style="position:relative">
      ${replyHTML}
      ${cotHTML}
      <div class="chat-bubble-content">${contentHTML}</div>
      ${errorHTML}
      <div class="chat-error-detail" data-error-detail>${_escapeHtml(msg.errorDetail || '发生了未知错误')}<button class="chat-error-retry" data-action="retry">${ICONS.refresh(12)} 重试</button></div>
      ${versionHTML}
      ${actionsHTML}
      ${tokenHTML}
    </div>
  `;
}

// 统一内容渲染：根据消息类型返回 HTML
function _renderContent(msg) {
  const type = msg.type || 'text';
  switch (type) {
    case 'markdown':
    case 'text':
      // AI 消息用 Markdown 渲染，用户消息纯文本转义
      if (msg.role === 'ai' && msg.content) {
        return renderMarkdown(msg.content);
      }
      return _escapeHtml(msg.content || '');
    case 'voice':
      return _renderVoiceBubble(msg);
    case 'image':
      return _renderImageBubble(msg);
    case 'video':
      return _renderVideoBubble(msg);
    case 'file':
      return _renderFileBubble(msg);
    case 'error':
      return _escapeHtml(msg.content || '出了点小问题');
    default:
      return _escapeHtml(msg.content || '');
  }
}

function _renderVoiceBubble(msg) {
  const duration = msg.duration || 0;
  const mm = Math.floor(duration / 60);
  const ss = String(duration % 60).padStart(2, '0');
  const bars = Array.from({ length: 20 }, (_, i) => {
    const h = 6 + Math.abs(Math.sin(i * 0.8)) * 18;
    return `<span class="chat-voice-bar" style="height:${h}px"></span>`;
  }).join('');
  return `
    <div class="chat-voice-bubble">
      <button class="chat-voice-play" data-action="play-voice">${ICONS.play(20)}</button>
      <div class="chat-voice-waveform">${bars}</div>
      <div class="chat-voice-info">
        <span class="chat-voice-duration">${mm}:${ss}</span>
      </div>
    </div>
  `;
}

function _renderImageBubble(msg) {
  const src = msg.mediaUrl || msg.content || '';
  return `<div class="chat-image-bubble" data-action="preview-image"><img src="${_escapeAttr(src)}" alt="图片" loading="lazy"/></div>`;
}

function _renderVideoBubble(msg) {
  const thumb = msg.thumbnail || msg.mediaUrl || '';
  const duration = msg.duration || 0;
  const mm = Math.floor(duration / 60);
  const ss = String(duration % 60).padStart(2, '0');
  return `
    <div class="chat-video-bubble" data-action="play-video">
      ${thumb ? `<img src="${_escapeAttr(thumb)}" alt="视频"/>` : ''}
      <div class="chat-video-play">${ICONS.play(24)}</div>
      ${duration ? `<span class="chat-video-duration">${mm}:${ss}</span>` : ''}
    </div>
  `;
}

function _renderFileBubble(msg) {
  const name = msg.fileName || msg.content || '文件';
  const size = msg.fileSize ? _formatFileSize(msg.fileSize) : '';
  const ext = (name.split('.').pop() || '').toLowerCase();
  let iconKey = 'file';
  if (['pdf'].includes(ext)) iconKey = 'pdf';
  else if (['doc', 'docx'].includes(ext)) iconKey = 'doc';
  return `
    <div class="chat-file-bubble">
      <div class="chat-file-icon">${ICONS[iconKey](24)}</div>
      <div class="chat-file-info">
        <div class="chat-file-name">${_escapeHtml(name)}</div>
        ${size ? `<div class="chat-file-size">${size}</div>` : ''}
      </div>
      <button class="chat-file-action" data-action="download-file">${ICONS.export(20)}</button>
    </div>
  `;
}

function _formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function _buildConversationHTML(msg) {
  const isUser = msg.role === 'user';
  const name = isUser ? '我' : (_conv?.title || 'AI');
  const contentHTML = _renderContent(msg);

  // 思维链卡片（对话模式展开面积更大，默认仍折叠）
  let cotHTML = '';
  if (!isUser) {
    const cot = _getCoTForMessage(msg);
    if (cot) cotHTML = _renderCoTCard(cot);
  }

  let actionsHTML = '';
  if (!isUser && msg.content) {
    actionsHTML = `
      <div class="chat-msg-actions">
        <button class="chat-action-btn" data-action="refresh" aria-label="重新生成">${ICONS.refresh(16)}</button>
        <button class="chat-action-btn" data-action="tts" aria-label="朗读">${ICONS.volume(16)}</button>
        <button class="chat-action-btn" data-action="copy" aria-label="复制">${ICONS.copy(16)}</button>
        <button class="chat-action-btn" data-action="more" aria-label="更多">${ICONS.more(16)}</button>
      </div>
    `;
  }

  // Token 用量显示（SKILL 10.1）
  let tokenHTML = '';
  if (!isUser && msg.usage) {
    const settings = _conv?.settings || _defaultConversationSettings();
    if (settings.showTokenUsage) {
      tokenHTML = `<div class="chat-token-usage">in: ${msg.usage.prompt || 0} / out: ${msg.usage.completion || 0} tokens</div>`;
    }
  }

  // 版本历史指示器（SKILL 10.4）
  let versionHTML = '';
  if (!isUser && msg.versions && msg.versions.length > 0) {
    const total = msg.versions.length + 1;
    const current = msg._currentVersion != null ? msg._currentVersion + 1 : total;
    versionHTML = `
      <div class="chat-version-indicator">
        <button class="chat-version-btn" data-action="version-prev" data-msg-id="${msg.id}" aria-label="上一版本">${ICONS.chevronRight(12)}</button>
        <span class="chat-version-text">${current} / ${total}</span>
        <button class="chat-version-btn" data-action="version-next" data-msg-id="${msg.id}" aria-label="下一版本">${ICONS.chevronRight(12)}</button>
      </div>
    `;
  }

  return `
    <div class="chat-conv-header">
      <span class="chat-conv-name">${_escapeHtml(name)}</span>
    </div>
    ${cotHTML}
    <div class="chat-conv-content">${contentHTML}</div>
    ${versionHTML}
    ${actionsHTML}
    ${tokenHTML}
  `;
}

// 时间分隔判断：首条或间隔超过5分钟
function _shouldShowTimeSeparator(msg, prevMsg) {
  if (!prevMsg) return true;
  const gap = msg.timestamp - prevMsg.timestamp;
  return gap > 5 * 60 * 1000;
}

// 连续消息判断：同角色且间隔小于2分钟
function _isContinuation(msg, prevMsg) {
  if (!prevMsg || prevMsg.role !== msg.role) return false;
  const gap = msg.timestamp - prevMsg.timestamp;
  return gap < 2 * 60 * 1000;
}

// ========== 思维链 (CoT) ==========
// chain-of-thought skill：总结卡 + 步骤卡，默认收起，步骤来自真实工作
// 跨APP接口只做展示。CoT 来源：msg.cot（结构化，AI上下文层填充）或从思维文本解析

// 思维块识别模式（覆盖常见模型的思考标记）
const _COT_PATTERNS = [
  { re: /<think>([\s\S]*?)<\/think>/i, grp: 1 },
  { re: /<reasoning>([\s\S]*?)<\/reasoning>/i, grp: 1 },
  { re: /<thinking>([\s\S]*?)<\/thinking>/i, grp: 1 },
  { re: /```thinking\n([\s\S]*?)\n```/i, grp: 1 }
];

// 是否展示思维链（chain-of-thought skill：全局总开关 + 对象级开关）
function _shouldShowCoT() {
  // 全局总开关关闭 → 永不显示（AI 照常工作）
  if (getSetting(STORAGE_KEYS.CHAIN_ENABLED) === false) return false;
  // 对象级开关（工具箱/设置抽屉 toggle）
  return _conv?.settings?.cotEnabled === true;
}

// APP 联动关键词 → 步骤（chain-of-thought skill：可进链子的功能范围）
const _COT_APP_KEYWORDS = [
  { app: 'memory',       kw: ['记忆', '回忆', '之前聊过', '之前说过'], title: '我翻了翻之前的记忆', desc: '在找之前有没有相关内容' },
  { app: 'notification', kw: ['通知', '提醒'], title: '我看了一下通知', desc: '在确认有没有需要提醒的事' },
  { app: 'anniversary',  kw: ['纪念日', '生日', '重要日期', '特殊日子'], title: '我去看了一眼纪念日', desc: '在确认今天是不是特别的日子' },
  { app: 'wallet',       kw: ['钱包', '余额', '消费'], title: '我看了下钱包信息', desc: '在参考消费相关信息' },
  { app: 'shop',         kw: ['商店', '商品', '购买记录'], title: '我看了下商店记录', desc: '在参考商品信息' },
  { app: 'moments',      kw: ['朋友圈', '动态'], title: '我翻了翻朋友圈', desc: '在参考最近动态' },
  { app: 'grudge',       kw: ['记仇', '不开心记录', '情绪事件'], title: '我翻了记仇本', desc: '在参考情绪记录' },
  { app: 'worldbook',    kw: ['世界书', '世界设定'], title: '我补充了世界设定', desc: '在参考世界书上下文' },
  { app: 'character',    kw: ['角色设定', '人设', '角色资料'], title: '我看了下角色设定', desc: '在参考当前角色资料' },
  { app: 'settings',     kw: ['设置', '开关', '主题'], title: '我检查了下设置', desc: '在确认相关开关状态' },
  { app: 'image',        kw: ['看图', '看了图片', '图片分析', '图片里'], title: '我看了看你发来的图片', desc: '在参考图片里能确认的内容' },
  { app: 'voice',        kw: ['听语音', '听了一下语音', '语音内容', '语音里'], title: '我听了一下语音', desc: '在整理语音里表达的内容' },
  { app: 'search',       kw: ['搜索了', '查了一下', '搜索结果'], title: '我搜索了一下信息', desc: '在整理搜索到的结果' },
  { app: 'tool',         kw: ['调用工具', '工具调用', '调用了'], title: '我用了下工具', desc: '在处理这一步需要的能力' }
];

// 从 AI 文本中提取思维块，返回 { cot, cleanContent } 或 null
function _extractCoTFromContent(content) {
  if (!content || typeof content !== 'string') return null;
  let thinkingText = '';
  let cleanContent = content;

  for (const p of _COT_PATTERNS) {
    const m = content.match(p.re);
    if (m && m[p.grp]) {
      thinkingText = m[p.grp].trim();
      cleanContent = content.replace(m[0], '').trim();
      break;
    }
  }

  if (!thinkingText) return null;
  return { cot: _buildCoTFromThinking(thinkingText), cleanContent };
}

// 从思维文本解析步骤（基于真实出现的关键词，不伪造）
function _buildCoTFromThinking(text) {
  const steps = [];

  // 1. 理解意图（真实工作流第一步）
  steps.push({
    title: '我理解了一下你在问什么',
    desc: '在确认你的意图',
    status: 'done'
  });

  // 2. 检测 APP 联动（仅当思维文本中真实提及，不伪造）
  const showAppSteps = getSetting(STORAGE_KEYS.CHAIN_SHOW_APP_STEPS) !== false;
  const showMemorySteps = getSetting(STORAGE_KEYS.CHAIN_SHOW_MEMORY_STEPS) !== false;
  const showToolSteps = getSetting(STORAGE_KEYS.CHAIN_SHOW_TOOL_STEPS) !== false;
  const showSensorySteps = getSetting(STORAGE_KEYS.CHAIN_SHOW_SENSORY_STEPS) !== false;

  if (showAppSteps) {
    for (const k of _COT_APP_KEYWORDS) {
      if (k.app === 'memory' && !showMemorySteps) continue;
      if ((k.app === 'image' || k.app === 'voice') && !showSensorySteps) continue;
      if (k.app === 'tool' && !showToolSteps) continue;
      if (k.kw.some(kw => text.includes(kw))) {
        steps.push({ title: k.title, desc: k.desc, status: 'done', app: k.app });
      }
    }
  }

  // 3. 组织回复（真实工作流最后一步）
  steps.push({
    title: '我把信息整理成回复',
    desc: '在组织要发给你的话',
    status: 'done'
  });

  const refCount = steps.length - 2;
  const summaryDesc = refCount > 0
    ? '用了' + steps.length + '步，参考了' + refCount + '个信息源'
    : '用了' + steps.length + '步整理了回复';

  return {
    summary: '我想了一下',
    summaryDesc,
    status: 'done',
    steps
  };
}

// 渲染思维链卡片 HTML
function _renderCoTCard(cot) {
  if (!cot || !cot.steps || cot.steps.length === 0) return '';

  // 过长链子折叠（chain-of-thought skill：默认显示前几步 + 还有X步）
  const autoCollapse = getSetting(STORAGE_KEYS.CHAIN_AUTO_COLLAPSE) !== false;
  const COLLAPSE_THRESHOLD = 5;
  const showAll = !autoCollapse || cot.steps.length <= COLLAPSE_THRESHOLD;
  const visibleSteps = showAll ? cot.steps : cot.steps.slice(0, COLLAPSE_THRESHOLD);
  const hiddenCount = cot.steps.length - visibleSteps.length;
  const defaultExpanded = getSetting(STORAGE_KEYS.CHAIN_DEFAULT_EXPANDED) === true;

  const statusLabel = {
    running: '进行中', done: '已完成', failed: '失败', skipped: '已跳过', closed: '已关闭'
  }[cot.status] || '已完成';

  const stepsHTML = visibleSteps.map(step => {
    const dotClass = step.status ? 'chat-cot-step-dot ' + step.status : 'chat-cot-step-dot';
    const appTag = step.app ? '<span class="chat-cot-step-app">' + _escapeHtml(step.app) + '</span>' : '';
    const detailHTML = step.detail ? '<div class="chat-cot-step-detail">' + _escapeHtml(step.detail) + '</div>' : '';
    return '<div class="chat-cot-step" data-cot-step>' +
      '<span class="' + dotClass + '"></span>' +
      '<div class="chat-cot-step-content">' +
      '<div class="chat-cot-step-title">' + _escapeHtml(step.title) + '</div>' +
      '<div class="chat-cot-step-desc">' + _escapeHtml(step.desc || '') + '</div>' +
      detailHTML +
      '</div>' + appTag + '</div>';
  }).join('');

  const moreHTML = hiddenCount > 0
    ? '<div class="chat-cot-more" data-cot-more>还有 ' + hiddenCount + ' 步，点击展开</div>'
    : '';

  return '<div class="chat-cot-card' + (defaultExpanded ? ' expanded' : '') + '" data-cot-card>' +
    '<div class="chat-cot-header" data-cot-toggle>' +
    '<span class="chat-cot-icon">' + ICONS.thinking(16) + '</span>' +
    '<span class="chat-cot-title">' + _escapeHtml(cot.summary || '我想了一下') + '</span>' +
    '<span class="chat-cot-summary">' + _escapeHtml(cot.summaryDesc || '') + '</span>' +
    '<span class="chat-cot-status ' + (cot.status || 'done') + '">' + statusLabel + '</span>' +
    '<span class="chat-cot-count">' + cot.steps.length + '步</span>' +
    '<span class="chat-cot-toggle">' + ICONS.chevronRight(14) + '</span>' +
    '</div>' +
    '<div class="chat-cot-body"><div class="chat-cot-steps">' + stepsHTML + moreHTML + '</div></div>' +
    '</div>';
}

// 取某消息要展示的 CoT（优先 msg.cot，否则从 _rawContent 解析）
function _getCoTForMessage(msg) {
  if (msg.role !== 'ai') return null;
  if (!_shouldShowCoT()) return null;
  if (msg.cot && msg.cot.steps && msg.cot.steps.length) return msg.cot;
  if (msg._rawContent) {
    const extracted = _extractCoTFromContent(msg._rawContent);
    if (extracted) return extracted.cot;
  }
  return null;
}

// ========== 流式输出 ==========

function _renderAITyping() {
  _removeEmptyHint();
  const div = document.createElement('div');
  div.className = 'chat-msg-row chat-msg-row-bubble';
  div.dataset.role = 'ai';
  div.id = 'chat-typing-row';
  div.innerHTML = `
    <div class="chat-bubble chat-bubble-ai chat-bubble-typing">
      <div class="chat-typing-icons">
        <span class="chat-typing-dot">${ICONS.star2(14)}</span>
        <span class="chat-typing-dot">${ICONS.heart(14)}</span>
        <span class="chat-typing-dot">${ICONS.bubble(14)}</span>
      </div>
    </div>
  `;
  _messagesEl.appendChild(div);
  _typingEl = div;
  _scrollToBottom(true);
}

function _replaceTypingWithBubble(aiMsg) {
  if (_typingEl) {
    _typingEl.remove();
    _typingEl = null;
  }
  _currentAiMsg = aiMsg;
  _currentAiDiv = _renderMessage(aiMsg, _messages[_messages.length - 1], true);
}

function _updateStreamingContent(chunk) {
  if (!_currentAiMsg || !_currentAiDiv) return;
  _currentAiMsg.content += chunk;
  const contentEl = _currentAiDiv.querySelector('.chat-bubble-content');
  if (contentEl) {
    contentEl.textContent = _currentAiMsg.content;
    // 打字光标
    contentEl.classList.add('chat-typing-cursor');
  }
  _scrollToBottom(true);
}

function _finishStreaming() {
  if (_currentAiDiv && _currentAiMsg) {
    // 保存原始内容（含思维块），便于设置变化后重新解析
    _currentAiMsg._rawContent = _currentAiMsg.content;

    // 提取思维链：从 content 剥离思维块，保证正文与思维链不混排（SKILL 5.3）
    if (_currentAiMsg.content && _shouldShowCoT() && !_currentAiMsg.cot) {
      const extracted = _extractCoTFromContent(_currentAiMsg.content);
      if (extracted) {
        _currentAiMsg.cot = extracted.cot;
        _currentAiMsg.content = extracted.cleanContent;
      }
    }

    const contentEl = _currentAiDiv.querySelector('.chat-bubble-content');
    if (contentEl) {
      contentEl.classList.remove('chat-typing-cursor');
      // 流式结束后用 Markdown 重新渲染（已是剥离思维块的正文）
      if (_currentAiMsg.content) {
        contentEl.innerHTML = renderMarkdown(_currentAiMsg.content);
      }
    }

    // 思维链卡片插入（内容之前）
    if (_currentAiMsg.cot && _shouldShowCoT()) {
      const bubble = _currentAiDiv.querySelector('.chat-bubble');
      if (bubble && !bubble.querySelector('[data-cot-card]')) {
        const cotHTML = _renderCoTCard(_currentAiMsg.cot);
        if (cotHTML) {
          const contentNode = bubble.querySelector('.chat-bubble-content');
          if (contentNode) {
            contentNode.insertAdjacentHTML('beforebegin', cotHTML);
          }
        }
      }
    }

    // 补充AI操作行
    if (!_currentAiDiv.querySelector('.chat-msg-actions') && _currentAiMsg.content) {
      const bubble = _currentAiDiv.querySelector('.chat-bubble');
      if (bubble) {
        bubble.insertAdjacentHTML('beforeend', `
          <div class="chat-msg-actions">
            <button class="chat-action-btn" data-action="refresh" aria-label="重新生成">${ICONS.refresh(16)}</button>
            <button class="chat-action-btn" data-action="tts" aria-label="朗读">${ICONS.volume(16)}</button>
            <button class="chat-action-btn" data-action="copy" aria-label="复制">${ICONS.copy(16)}</button>
            <button class="chat-action-btn" data-action="more" aria-label="更多">${ICONS.more(16)}</button>
          </div>
        `);
      }
    }
  }
  _currentAiMsg = null;
  _currentAiDiv = null;
}

function _stopStreaming() {
  if (_abortController) {
    _abortController.abort();
    _abortController = null;
  }
}

// ========== 发送 ==========

function _genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'msg-' + crypto.randomUUID();
  }
  return 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

async function _doSend(existingUserMsg = null) {
  if (_sending) return;

  let text, characterId, userMsg;

  if (existingUserMsg) {
    // 重新生成模式：不创建新用户消息
    text = existingUserMsg.content;
    characterId = existingUserMsg.characterId || _conv?.characterId || getCurrentCharacter() || 'default';
    userMsg = existingUserMsg;
  } else {
    text = _inputEl.value.trim();
    if (!text) return;
    _sending = true;
    _setSendingState(true);
    _inputEl.value = '';
    _autoResize();

    characterId = _conv?.characterId || getCurrentCharacter() || 'default';

    userMsg = {
      id: _genId(),
      characterId,
      conversationId: _convId,
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    _messages.push(userMsg);
    const prevMsg = _messages.length > 1 ? _messages[_messages.length - 2] : null;
    _renderMessage(userMsg, prevMsg, true);
    await appendMessage(userMsg);
    events.emit('message.sent', { conversationId: _convId, message: userMsg });
  }

  if (!_sending) { _sending = true; _setSendingState(true); }

  // AI 回复
  const aiMsg = {
    id: _genId(),
    characterId,
    conversationId: _convId,
    role: 'ai',
    content: '',
    timestamp: Date.now()
  };
  // 继承版本历史（重新生成时）
  if (existingUserMsg?._regenVersions) {
    aiMsg.versions = existingUserMsg._regenVersions;
    delete existingUserMsg._regenVersions;
  }

  _renderAITyping();
  _abortController = new AbortController();

  try {
    const history = _messages
      .filter(m => m.role === 'user' || m.role === 'ai')
      .map(m => ({ role: m.role === 'ai' ? 'assistant' : 'user', content: m.content }));

    const result = await sendChat({
      appId: 'chat',
      characterId,
      conversationId: _convId,
      userMessage: text,
      history,
      signal: _abortController.signal,
      onChunk: (chunk) => {
        if (!_currentAiDiv) {
          _replaceTypingWithBubble(aiMsg);
        }
        _updateStreamingContent(chunk);
      }
    });

    _abortController = null;

    // 流式过程中可能没收到 chunk（非流式模式）
    if (!_currentAiDiv) {
      aiMsg.content = result.text || '';
      _replaceTypingWithBubble(aiMsg);
    } else {
      aiMsg.content = result.text || _currentAiMsg.content;
      const contentEl = _currentAiDiv.querySelector('.chat-bubble-content');
      if (contentEl) contentEl.textContent = aiMsg.content;
    }

    if (!aiMsg.content.trim()) {
      aiMsg.content = '唔…收到的回复好像不太对，再试一次吧~';
      const contentEl = _currentAiDiv?.querySelector('.chat-bubble-content');
      if (contentEl) contentEl.textContent = aiMsg.content;
    }

    // 存储 Token 用量（SKILL 10.1）
    if (result.usage) {
      aiMsg.usage = {
        prompt: result.usage.prompt_tokens,
        completion: result.usage.completion_tokens
      };
    }

    _finishStreaming();
    _messages.push(aiMsg);
    await appendMessage(aiMsg);
    events.emit('message.received', { conversationId: _convId, message: aiMsg });
  } catch (err) {
    _abortController = null;
    const isAborted = err?.name === 'AbortError' || err?.message?.includes('abort');
    const hasPartial = _currentAiMsg?.content?.trim();

    if (isAborted && hasPartial) {
      // 用户主动停止，保留已生成内容
      aiMsg.content = _currentAiMsg.content;
      _finishStreaming();
      _messages.push(aiMsg);
      await appendMessage(aiMsg);
      events.emit('message.received', { conversationId: _convId, message: aiMsg });
    } else if (isAborted && _currentAiDiv) {
      // 用户停止但无内容，移除空消息
      _currentAiDiv.remove();
      _currentAiDiv = null;
      _currentAiMsg = null;
      if (_typingEl) { _typingEl.remove(); _typingEl = null; }
    } else {
      // 真实错误
      if (_typingEl) { _typingEl.remove(); _typingEl = null; }
      if (_currentAiDiv) { _currentAiDiv.remove(); _currentAiDiv = null; _currentAiMsg = null; }
      console.error('[Chat] 发送异常:', err.message);
      aiMsg.content = '唔…出了点小问题，再试一次吧~';
      _renderMessage(aiMsg, _messages[_messages.length - 1], true);
      _finishStreaming();
      _messages.push(aiMsg);
      await appendMessage(aiMsg);
      events.emit('message.received', { conversationId: _convId, message: aiMsg });
    }
  }

  _sending = false;
  _setSendingState(false);
  _inputEl.focus();
}

function _setSendingState(sending) {
  if (sending) {
    _sendBtn.classList.add('chat-send-btn-stop');
    _sendBtn.innerHTML = ICONS.stop(18);
    _sendBtn.setAttribute('aria-label', '停止');
  } else {
    _sendBtn.classList.remove('chat-send-btn-stop');
    _sendBtn.innerHTML = ICONS.send(18);
    _sendBtn.setAttribute('aria-label', '发送');
  }
}

// ========== AI 操作行 ==========

function _bindActionEvents() {
  // 点击事件委托
  _messagesEl.addEventListener('click', (e) => {
    // 思维链交互（优先处理，避免冒泡到气泡）
    const cotToggle = e.target.closest('[data-cot-toggle]');
    if (cotToggle) {
      const card = cotToggle.closest('[data-cot-card]');
      if (card) card.classList.toggle('expanded');
      return;
    }
    const cotStep = e.target.closest('[data-cot-step]');
    if (cotStep) {
      // 仅当步骤有详情时才展开
      if (cotStep.querySelector('.chat-cot-step-detail')) {
        cotStep.classList.toggle('expanded');
      }
      return;
    }
    const cotMore = e.target.closest('[data-cot-more]');
    if (cotMore) {
      // 展开全部步骤：用完整步骤列表替换折叠视图
      const card = cotMore.closest('[data-cot-card]');
      if (card) {
        card.classList.add('expanded');
        const msgRow = card.closest('.chat-msg-row');
        const msg = _messages.find(m => m.id === msgRow?.dataset.msgId);
        const stepsEl = card.querySelector('.chat-cot-steps');
        if (msg?.cot && stepsEl) {
          const fullHTML = msg.cot.steps.map(step => {
            const dotClass = step.status ? 'chat-cot-step-dot ' + step.status : 'chat-cot-step-dot';
            const appTag = step.app ? '<span class="chat-cot-step-app">' + _escapeHtml(step.app) + '</span>' : '';
            const detailHTML = step.detail ? '<div class="chat-cot-step-detail">' + _escapeHtml(step.detail) + '</div>' : '';
            return '<div class="chat-cot-step" data-cot-step>' +
              '<span class="' + dotClass + '"></span>' +
              '<div class="chat-cot-step-content">' +
              '<div class="chat-cot-step-title">' + _escapeHtml(step.title) + '</div>' +
              '<div class="chat-cot-step-desc">' + _escapeHtml(step.desc || '') + '</div>' +
              detailHTML + '</div>' + appTag + '</div>';
          }).join('');
          stepsEl.innerHTML = fullHTML;
        }
      }
      return;
    }
    // 操作行按钮
    const btn = e.target.closest('.chat-action-btn');
    if (btn) {
      e.stopPropagation();
      const action = btn.dataset.action;
      const row = btn.closest('.chat-msg-row');
      if (!row) return;
      const msgId = row.dataset.msgId;
      _handleAIAction(action, msgId);
      return;
    }
    // 代码复制按钮
    const copyCodeBtn = e.target.closest('.md-code-copy');
    if (copyCodeBtn) {
      const codeBlock = copyCodeBtn.closest('.md-code-block');
      const codeEl = codeBlock?.querySelector('.md-code-body');
      if (codeEl) {
        _copyToClipboard(codeEl.textContent);
        copyCodeBtn.textContent = '已复制';
        setTimeout(() => { copyCodeBtn.textContent = '复制'; }, 1500);
      }
      return;
    }
    // 链接点击 → 应用内 WebView
    const link = e.target.closest('.md-link');
    if (link) {
      e.preventDefault();
      const url = link.dataset.url;
      if (url) {
        events.emit('chat:webview:open', { url, conversationId: _convId });
        _showToast('在应用内打开链接');
      }
      return;
    }
    // 图片预览
    const imageBubble = e.target.closest('[data-action="preview-image"]');
    if (imageBubble) {
      const img = imageBubble.querySelector('img');
      if (img) _showImagePreview(img.src);
      return;
    }
    // 视频播放
    const videoBubble = e.target.closest('[data-action="play-video"]');
    if (videoBubble) {
      _showToast('视频播放功能完善中');
      return;
    }
    // 语音播放
    const voiceBtn = e.target.closest('[data-action="play-voice"]');
    if (voiceBtn) {
      _handleVoicePlay(voiceBtn);
      return;
    }
    // 文件下载
    const fileBtn = e.target.closest('[data-action="download-file"]');
    if (fileBtn) {
      _showToast('文件下载功能完善中');
      return;
    }
    // 错误详情切换
    const errorToggle = e.target.closest('[data-action="toggle-error"]');
    if (errorToggle) {
      const detail = errorToggle.parentElement.querySelector('[data-error-detail]');
      if (detail) detail.classList.toggle('show');
      return;
    }
    // 重试按钮
    const retryBtn = e.target.closest('[data-action="retry"]');
    if (retryBtn) {
      const row = retryBtn.closest('.chat-msg-row');
      if (row) {
        const msg = _messages.find(m => m.id === row.dataset.msgId);
        if (msg) _regenerateMessage(msg);
      }
      return;
    }
    // 引用回复点击
    const replyQuote = e.target.closest('.chat-reply-quote');
    if (replyQuote) {
      const targetId = replyQuote.dataset.replyTo;
      if (targetId) {
        const el = _messagesEl.querySelector(`[data-msg-id="${targetId}"]`);
        if (el) {
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          el.classList.add('chat-msg-highlight');
          setTimeout(() => el.classList.remove('chat-msg-highlight'), 2000);
        }
      }
      return;
    }
  });

  // 长按气泡菜单
  _messagesEl.addEventListener('touchstart', _onLongPressStart, { passive: false });
  _messagesEl.addEventListener('touchend', _onLongPressEnd);
  _messagesEl.addEventListener('touchmove', _onLongPressEnd);
  _messagesEl.addEventListener('mousedown', _onLongPressStart);
  _messagesEl.addEventListener('mouseup', _onLongPressEnd);
  _messagesEl.addEventListener('mouseleave', _onLongPressEnd);
}

// 长按事件
function _onLongPressStart(e) {
  const row = e.target.closest('.chat-msg-row');
  if (!row) return;
  _longPressTarget = row;
  _longPressTimer = setTimeout(() => {
    const msgId = row.dataset.msgId;
    const msg = _messages.find(m => m.id === msgId);
    if (msg) _showLongPressMenu(msg);
  }, _LONG_PRESS_DELAY);
}

function _onLongPressEnd() {
  if (_longPressTimer) {
    clearTimeout(_longPressTimer);
    _longPressTimer = null;
  }
}

function _handleVoicePlay(btn) {
  const isPlaying = btn.classList.contains('playing');
  if (isPlaying) {
    btn.classList.remove('playing');
    btn.innerHTML = ICONS.play(20);
    events.emit('tts:stop', {});
  } else {
    btn.classList.add('playing');
    btn.innerHTML = ICONS.pause(20);
    const row = btn.closest('.chat-msg-row');
    const msg = _messages.find(m => m.id === row?.dataset.msgId);
    if (msg) {
      events.emit('tts:request', { text: '', audioUrl: msg.mediaUrl, conversationId: _convId });
    }
  }
}

function _showImagePreview(src) {
  const overlay = document.createElement('div');
  overlay.className = 'chat-image-preview-overlay';
  overlay.innerHTML = `<img src="${_escapeAttr(src)}" alt="预览"/>`;
  overlay.addEventListener('click', () => overlay.remove());
  document.body.appendChild(overlay);
}

function _handleAIAction(action, msgId) {
  const msg = _messages.find(m => m.id === msgId);
  if (!msg) return;
  switch (action) {
    case 'copy':
      _copyToClipboard(msg.content);
      _showToast('已复制');
      break;
    case 'tts':
      _handleTTS(msg);
      break;
    case 'refresh':
      _regenerateMessage(msg);
      break;
    case 'more':
      _showMoreActions(msg);
      break;
  }
}

function _copyToClipboard(text) {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).catch(() => {});
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove();
  }
}

// TTS — 预留：调用全局TTS系统（Step 3/4 完善具体实现）
function _handleTTS(msg) {
  // 预留路由：通过事件通知 TTS 系统
  events.emit('tts:request', { text: msg.content, conversationId: _convId });
  _showToast('开始朗读');
}

// 重新生成 — 截断该消息之后的所有消息，重新请求AI
function _regenerateMessage(msg) {
  const idx = _messages.findIndex(m => m.id === msg.id);
  if (idx === -1) return;
  // 找到对应的用户消息
  const userIdx = idx - 1;
  if (userIdx < 0 || _messages[userIdx].role !== 'user') return;
  const userMsg = _messages[userIdx];

  // 保存当前版本到版本历史（SKILL 10.4）
  if (!msg.versions) msg.versions = [];
  msg.versions.push({
    content: msg.content,
    cot: msg.cot ? JSON.parse(JSON.stringify(msg.cot)) : null,
    _rawContent: msg._rawContent,
    usage: msg.usage,
    timestamp: msg.timestamp
  });

  // 移除该AI消息及之后的所有消息UI
  for (let i = _messages.length - 1; i >= idx; i--) {
    const el = _messagesEl.querySelector(`[data-msg-id="${_messages[i].id}"]`);
    if (el) el.remove();
  }
  _messages = _messages.slice(0, idx);

  // 传递版本历史给新的 AI 消息
  userMsg._regenVersions = msg.versions;

  // 重新请求AI回复（不创建新用户消息）
  _doSend(userMsg);
}

// 切换版本（SKILL 10.4：左右箭头切换历史版本）
function _switchVersion(msgId, direction) {
  const msg = _messages.find(m => m.id === msgId);
  if (!msg || !msg.versions || msg.versions.length === 0) return;

  const totalVersions = msg.versions.length + 1; // 含当前版本
  if (!msg._currentVersion) msg._currentVersion = totalVersions - 1; // 当前是最新版本

  const newIdx = msg._currentVersion + direction;
  if (newIdx < 0 || newIdx >= totalVersions) return;

  // 保存当前内容到当前版本位置
  if (msg._currentVersion < msg.versions.length) {
    msg.versions[msg._currentVersion] = {
      content: msg.content,
      cot: msg.cot ? JSON.parse(JSON.stringify(msg.cot)) : null,
      _rawContent: msg._rawContent,
      usage: msg.usage,
      timestamp: msg.timestamp
    };
  }

  msg._currentVersion = newIdx;

  // 切换到选定版本
  if (newIdx < msg.versions.length) {
    const v = msg.versions[newIdx];
    msg.content = v.content;
    msg.cot = v.cot;
    msg._rawContent = v._rawContent;
    msg.usage = v.usage;
  }

  // 重新渲染该消息
  const el = _messagesEl.querySelector(`[data-msg-id="${msgId}"]`);
  if (el) {
    const prevMsg = _messages[_messages.findIndex(m => m.id === msgId) - 1] || null;
    const fragment = _buildMessageRow(msg, prevMsg);
    el.replaceWith(fragment);
  }
}

// 更多操作 → 打开长按菜单
function _showMoreActions(msg) {
  _showLongPressMenu(msg);
}

// ========== 长按气泡菜单 ==========

function _showLongPressMenu(msg) {
  const isUser = msg.role === 'user';
  // 撤回是否可用（60秒内）
  const canRecall = isUser && msg.timestamp && (Date.now() - msg.timestamp < _RECALL_WINDOW);

  let items = [];
  if (!isUser) {
    // AI 消息 9 项
    items = [
      { icon: 'refresh', label: '重新生成', action: 'regenerate' },
      { icon: 'copy', label: '复制文本', action: 'copy-text' },
      { icon: 'copyText', label: '复制MD', action: 'copy-md' },
      { icon: 'reply', label: '引用回复', action: 'reply' },
      { icon: 'forward', label: '转发', action: 'forward' },
      { icon: 'volume', label: '朗读', action: 'tts' },
      { icon: 'star', label: '收藏', action: 'star' },
      { icon: 'export', label: '导出', action: 'export' },
      { icon: 'trash', label: '删除', action: 'delete', danger: true }
    ];
  } else {
    // 用户消息 4 项
    items = [
      { icon: 'edit', label: '编辑', action: 'edit' },
      { icon: 'refresh', label: '重发', action: 'resend' },
      { icon: 'undo', label: '撤回', action: 'recall', danger: true, disabled: !canRecall },
      { icon: 'forward', label: '转发', action: 'forward' }
    ];
  }

  const itemsHTML = items.map(item => `
    <button class="chat-action-sheet-item ${item.danger ? 'danger' : ''} ${item.disabled ? 'disabled' : ''}"
            data-action="${item.action}" data-msg-id="${msg.id}">
      <span class="chat-action-sheet-icon">${ICONS[item.icon](24)}</span>
      <span class="chat-action-sheet-label">${item.label}</span>
    </button>
  `).join('');

  const overlay = document.createElement('div');
  overlay.className = 'chat-bottom-sheet-overlay';
  overlay.innerHTML = `
    <div class="chat-action-sheet">
      <div class="chat-action-sheet-grid">${itemsHTML}</div>
      <div class="chat-action-sheet-divider"></div>
      <div class="chat-action-sheet-cancel">取消</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const sheet = overlay.querySelector('.chat-action-sheet');

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { close(); return; }
    const cancelBtn = e.target.closest('.chat-action-sheet-cancel');
    if (cancelBtn) { close(); return; }
    const itemBtn = e.target.closest('.chat-action-sheet-item');
    if (itemBtn && !itemBtn.classList.contains('disabled')) {
      const action = itemBtn.dataset.action;
      const msgId = itemBtn.dataset.msgId;
      close();
      _handleLongPressAction(action, msgId);
    }
  });
}

function _handleLongPressAction(action, msgId) {
  const msg = _messages.find(m => m.id === msgId);
  if (!msg) return;
  switch (action) {
    case 'regenerate':
      _regenerateMessage(msg);
      break;
    case 'copy-text':
      _copyToClipboard(msg.content);
      _showToast('已复制纯文本');
      break;
    case 'copy-md':
      _copyToClipboard(msg.content);
      _showToast('已复制 Markdown');
      break;
    case 'reply':
      _startReply(msg);
      break;
    case 'forward':
      _startForward(msg);
      break;
    case 'tts':
      _handleTTS(msg);
      break;
    case 'star':
      events.emit('chat:star', { message: msg, conversationId: _convId });
      _showToast('已加入收藏');
      break;
    case 'export':
      _exportMessage(msg);
      break;
    case 'delete':
      _confirmDeleteMessage(msg);
      break;
    case 'edit':
      _editMessage(msg);
      break;
    case 'resend':
      _resendMessage(msg);
      break;
    case 'recall':
      _recallMessage(msg);
      break;
  }
}

// 引用回复
let _replyTo = null;
function _startReply(msg) {
  _replyTo = {
    id: msg.id,
    name: msg.role === 'user' ? '我' : (_conv?.title || 'AI'),
    content: (msg.content || '').slice(0, 100)
  };
  _showReplyHint();
  _inputEl.focus();
}

function _showReplyHint() {
  let hint = _pageEl.querySelector('#chat-reply-hint');
  if (!hint) {
    hint = document.createElement('div');
    hint.id = 'chat-reply-hint';
    hint.className = 'chat-reply-hint';
    _pageEl.querySelector('.chat-footer-bar').insertAdjacentElement('beforebegin', hint);
  }
  if (_replyTo) {
    hint.innerHTML = `
      <div class="chat-reply-hint-content">
        <span class="chat-reply-hint-name">${_escapeHtml(_replyTo.name)}</span>
        <span class="chat-reply-hint-text">${_escapeHtml(_replyTo.content)}</span>
      </div>
      <button class="chat-reply-hint-close" id="chat-reply-cancel">${ICONS.close(16)}</button>
    `;
    hint.style.display = 'flex';
    hint.querySelector('#chat-reply-cancel').addEventListener('click', () => {
      _replyTo = null;
      hint.style.display = 'none';
    });
  } else {
    hint.style.display = 'none';
  }
}

// 编辑消息（截断重生成）
function _editMessage(msg) {
  // 二次确认
  _showConfirmDialog('编辑消息', '从此处重新生成，此后的消息将删除，确认？', () => {
    const idx = _messages.findIndex(m => m.id === msg.id);
    if (idx === -1) return;
    // 删除该消息之后的所有消息
    for (let i = _messages.length - 1; i > idx; i--) {
      const el = _messagesEl.querySelector(`[data-msg-id="${_messages[i].id}"]`);
      if (el) el.remove();
    }
    _messages = _messages.slice(0, idx);
    // 回填输入框
    _inputEl.value = msg.content || '';
    _autoResize();
    _inputEl.focus();
  });
}

// 重发
function _resendMessage(msg) {
  const text = msg.content || '';
  if (!text) return;
  // 删除原消息
  const idx = _messages.findIndex(m => m.id === msg.id);
  if (idx !== -1) {
    const el = _messagesEl.querySelector(`[data-msg-id="${msg.id}"]`);
    if (el) el.remove();
    _messages.splice(idx, 1);
  }
  _inputEl.value = text;
  _doSend();
}

// 撤回
function _recallMessage(msg) {
  if (Date.now() - msg.timestamp > _RECALL_WINDOW) {
    _showToast('已超过撤回时间');
    return;
  }
  const idx = _messages.findIndex(m => m.id === msg.id);
  if (idx === -1) return;
  // 替换为撤回提示
  const el = _messagesEl.querySelector(`[data-msg-id="${msg.id}"]`);
  if (el) {
    el.innerHTML = '<div class="chat-recalled-hint">消息已撤回</div>';
  }
  msg.recalled = true;
  _messages[idx] = msg;
  _showToast('已撤回');
}

// 导出消息
function _exportMessage(msg) {
  const text = `# ${msg.role === 'ai' ? 'AI' : '我'}\n\n${msg.content || ''}`;
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `message-${msg.id}.md`;
  a.click();
  URL.revokeObjectURL(url);
  _showToast('已导出');
}

// 确认删除消息
function _confirmDeleteMessage(msg) {
  _showConfirmDialog('删除消息', '确定要删除这条消息吗？', () => {
    const idx = _messages.findIndex(m => m.id === msg.id);
    if (idx === -1) return;
    const el = _messagesEl.querySelector(`[data-msg-id="${msg.id}"]`);
    if (el) el.remove();
    _messages.splice(idx, 1);
    _showToast('已删除');
  });
}

// 通用确认弹窗
function _showConfirmDialog(title, desc, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'chat-confirm-overlay';
  overlay.innerHTML = `
    <div class="chat-confirm-dialog">
      <div class="chat-confirm-title">${_escapeHtml(title)}</div>
      <div class="chat-confirm-desc">${_escapeHtml(desc)}</div>
      <div class="chat-confirm-actions">
        <button class="chat-confirm-btn cancel" data-action="cancel">取消</button>
        <button class="chat-confirm-btn confirm" data-action="confirm">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => overlay.remove());
  overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
    overlay.remove();
    if (onConfirm) onConfirm();
  });
}

// ========== 转发流程 ==========

function _startForward(msg) {
  const convs = getConversations().filter(c => c.id !== _convId);
  const overlay = document.createElement('div');
  overlay.className = 'chat-bottom-sheet-overlay';
  overlay.innerHTML = `
    <div class="chat-action-sheet" style="max-height:70dvh;">
      <div style="padding:14px 16px;font-size:0.95rem;font-weight:var(--font-weight-bold);color:var(--text-primary);border-bottom:1px solid var(--border-soft);">
        转发给...
      </div>
      <div class="chat-forward-list">
        ${convs.length === 0 ? '<div style="padding:24px;text-align:center;color:var(--text-placeholder);">没有其他对话</div>' : ''}
        ${convs.map(c => `
          <div class="chat-forward-item" data-conv-id="${c.id}">
            <div class="chat-forward-avatar">${_escapeHtml((c.title || '?')[0])}</div>
            <span class="chat-forward-name">${_escapeHtml(c.title || '未命名')}</span>
          </div>
        `).join('')}
      </div>
      <div class="chat-action-sheet-divider"></div>
      <div class="chat-action-sheet-cancel">取消</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.closest('.chat-action-sheet-cancel')) {
      close();
      return;
    }
    const item = e.target.closest('.chat-forward-item');
    if (item) {
      const targetId = item.dataset.convId;
      const targetConv = convs.find(c => c.id === targetId);
      close();
      _confirmForward(msg, targetConv);
    }
  });
}

function _confirmForward(msg, targetConv) {
  _showConfirmDialog('转发消息', `转发给「${targetConv.title}」？`, async () => {
    // 创建转发消息
    const fwdMsg = {
      id: _genId(),
      characterId: targetConv.characterId || 'default',
      conversationId: targetConv.id,
      role: msg.role,
      content: msg.content || '',
      type: msg.type || 'text',
      forwarded: true,
      forwardedFrom: _conv?.title || '',
      timestamp: Date.now()
    };
    await appendMessage(fwdMsg);
    events.emit('message.sent', { conversationId: targetConv.id, message: fwdMsg });
    _showToast('已转发');
  });
}

// ========== 聊天设置抽屉（三点菜单） ==========

function _showSettingsDrawer() {
  const settings = Object.assign(_defaultConversationSettings(), _conv?.settings || {});
  const globalCotOn = getSetting(STORAGE_KEYS.CHAIN_ENABLED) !== false;
  const githubCfg = getGithubConfig(_convId);
  const repoDisplay = githubCfg?.repo || '未关联';
  const branchDisplay = githubCfg?.branch || 'main';

  // 获取可用 TTS 音色列表
  const ttsVoices = _getTtsVoiceList();
  const currentVoiceName = settings.ttsVoice
    ? (ttsVoices.find(v => v.id === settings.ttsVoice)?.name || settings.ttsVoice)
    : '跟随默认';

  const modelDisplay = settings.model
    ? _getModelName(settings.model)
    : '跟随默认';

  const overlay = document.createElement('div');
  overlay.className = 'chat-bottom-sheet-overlay';
  overlay.innerHTML = `
    <div class="chat-bottom-sheet chat-settings-drawer" style="max-height:85dvh;">
      <div class="chat-settings-drawer-header">
        <span class="chat-settings-drawer-title">聊天设置</span>
        <button class="chat-settings-drawer-close" aria-label="关闭" data-action="close">${ICONS.close(20)}</button>
      </div>
      <div class="chat-settings-drawer-body">

        <!-- 对话信息 -->
        <div class="chat-settings-section">
          <div class="chat-settings-section-title">对话信息</div>
          <div class="chat-settings-row">
            <span class="chat-settings-label">标题</span>
            <input class="chat-settings-input chat-settings-title-input" id="set-title" value="${_escapeAttr(_conv?.title || '')}" placeholder="输入对话标题" />
          </div>
          <div class="chat-settings-row">
            <span class="chat-settings-label">AI 名称</span>
            <span class="chat-settings-value" id="set-ai-name">加载中…</span>
          </div>
          <div class="chat-settings-row">
            <span class="chat-settings-label">人设来源</span>
            <span class="chat-settings-value" id="set-char-source">—</span>
          </div>
        </div>

        <!-- AI 设置 -->
        <div class="chat-settings-section">
          <div class="chat-settings-section-title">AI 设置</div>
          <div class="chat-settings-row" data-action="select-model">
            <span class="chat-settings-label">模型</span>
            <span class="chat-settings-value">${_escapeHtml(modelDisplay)} ${ICONS.chevronRight(16)}</span>
          </div>
          <div class="chat-settings-row" data-action="select-context">
            <span class="chat-settings-label">上下文窗口</span>
            <span class="chat-settings-value">${settings.contextWindow} 条 ${ICONS.chevronRight(16)}</span>
          </div>
          <div class="chat-settings-row" data-action="select-temp">
            <span class="chat-settings-label">温度</span>
            <span class="chat-settings-value">${settings.temperature.toFixed(1)} ${ICONS.chevronRight(16)}</span>
          </div>
          <div class="chat-settings-row">
            <span class="chat-settings-label">思维链</span>
            ${globalCotOn
              ? `<div class="chat-toggle ${settings.cotEnabled ? 'on' : ''}" data-action="toggle-cot"><div class="chat-toggle-knob"></div></div>`
              : `<span class="chat-settings-value" style="font-size:0.75rem;">需先在全局设置中开启</span>`
            }
          </div>
        </div>

        <!-- 语音朗读 -->
        <div class="chat-settings-section">
          <div class="chat-settings-section-title">语音朗读</div>
          <div class="chat-settings-row">
            <span class="chat-settings-label">TTS 朗读</span>
            <div class="chat-toggle ${settings.ttsEnabled ? 'on' : ''}" data-action="toggle-tts"><div class="chat-toggle-knob"></div></div>
          </div>
          <div class="chat-settings-row ${settings.ttsEnabled ? '' : 'chat-settings-row-disabled'}" data-action="select-voice">
            <span class="chat-settings-label">音色</span>
            <span class="chat-settings-value">${_escapeHtml(currentVoiceName)} ${ICONS.chevronRight(16)}</span>
          </div>
        </div>

        <!-- 显示 -->
        <div class="chat-settings-section">
          <div class="chat-settings-section-title">显示</div>
          <div class="chat-settings-row">
            <span class="chat-settings-label">模式</span>
            <div class="chat-segmented" data-action="select-mode">
              <div class="chat-segmented-item ${settings.mode === 'bubble' ? 'active' : ''}" data-mode="bubble">气泡</div>
              <div class="chat-segmented-item ${settings.mode === 'conversation' ? 'active' : ''}" data-mode="conversation">对话</div>
            </div>
          </div>
          <div class="chat-settings-row">
            <span class="chat-settings-label">Token 用量</span>
            <div class="chat-toggle ${settings.showTokenUsage ? 'on' : ''}" data-action="toggle-token"><div class="chat-toggle-knob"></div></div>
          </div>
          <div class="chat-settings-row">
            <span class="chat-settings-label">上下文范围</span>
            <div class="chat-toggle ${settings.showContextRange ? 'on' : ''}" data-action="toggle-range"><div class="chat-toggle-knob"></div></div>
          </div>
        </div>

        <!-- GitHub -->
        <div class="chat-settings-section">
          <div class="chat-settings-section-title">GitHub</div>
          <div class="chat-settings-row" data-action="github-config">
            <span class="chat-settings-label">关联仓库</span>
            <span class="chat-settings-value">${_escapeHtml(repoDisplay)} ${ICONS.chevronRight(16)}</span>
          </div>
          ${githubCfg?.repo ? `
            <div class="chat-settings-row">
              <span class="chat-settings-label">默认分支</span>
              <span class="chat-settings-value">${_escapeHtml(branchDisplay)}</span>
            </div>
          ` : ''}
        </div>

        <!-- 数据管理 -->
        <div class="chat-settings-section">
          <div class="chat-settings-section-title">数据管理</div>
          <div class="chat-settings-row" data-action="clear-messages">
            <span class="chat-settings-label" style="color:var(--text-danger);">清空当前对话</span>
            <span class="chat-settings-value danger">${ICONS.trash(16)}</span>
          </div>
          <div class="chat-settings-row" data-action="export-conversation">
            <span class="chat-settings-label">导出整段对话</span>
            <span class="chat-settings-value">${ICONS.export(16)}</span>
          </div>
        </div>

      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // 异步加载角色信息
  _loadCharacterInfo();

  // 关闭逻辑
  const close = () => {
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { close(); return; }
    const action = e.target.closest('[data-action]');
    if (!action) return;
    const act = action.dataset.action;
    if (act === 'close') { close(); return; }

    switch (act) {
      case 'toggle-cot': {
        const newVal = !settings.cotEnabled;
        _updateConvSettings({ cotEnabled: newVal });
        settings.cotEnabled = newVal;
        action.classList.toggle('on', newVal);
        _toggleCotInternal(newVal);
        break;
      }
      case 'toggle-tts': {
        const newVal = !settings.ttsEnabled;
        _updateConvSettings({ ttsEnabled: newVal });
        settings.ttsEnabled = newVal;
        action.classList.toggle('on', newVal);
        // 依赖联动：关闭 TTS 后音色行置灰
        const voiceRow = overlay.querySelector('[data-action="select-voice"]');
        if (voiceRow) voiceRow.classList.toggle('chat-settings-row-disabled', !newVal);
        break;
      }
      case 'toggle-token': {
        const newVal = !settings.showTokenUsage;
        _updateConvSettings({ showTokenUsage: newVal });
        settings.showTokenUsage = newVal;
        action.classList.toggle('on', newVal);
        _rerenderAll();
        break;
      }
      case 'toggle-range': {
        const newVal = !settings.showContextRange;
        _updateConvSettings({ showContextRange: newVal });
        settings.showContextRange = newVal;
        action.classList.toggle('on', newVal);
        _rerenderAll();
        break;
      }
      case 'select-model': {
        close();
        _showModelPanel();
        break;
      }
      case 'select-context': {
        close();
        _showContextPanel();
        break;
      }
      case 'select-temp': {
        close();
        _showTempPanel();
        break;
      }
      case 'select-voice': {
        if (!settings.ttsEnabled) break;
        _showVoicePanel(settings, ttsVoices);
        break;
      }
      case 'select-mode': {
        break; // 由子元素处理
      }
      case 'github-config': {
        close();
        _showGithubConfigPanel();
        break;
      }
      case 'clear-messages': {
        _showConfirmDialog('清空当前对话', '将删除本对话的所有消息，此操作不可撤销。', async () => {
          await clearMessages(_convId);
          _messages = [];
          _allMessages = [];
          _renderedCount = 0;
          _rerenderAll();
          _showToast('已清空');
          close();
        });
        break;
      }
      case 'export-conversation': {
        _exportConversation();
        break;
      }
    }
  });

  // 模式分段控制器
  const modeSeg = overlay.querySelector('[data-action="select-mode"]');
  if (modeSeg) {
    modeSeg.addEventListener('click', (e) => {
      const item = e.target.closest('.chat-segmented-item');
      if (!item) return;
      const mode = item.dataset.mode;
      if (mode === settings.mode) return;
      settings.mode = mode;
      overlay.querySelectorAll('.chat-segmented-item').forEach(el => {
        el.classList.toggle('active', el.dataset.mode === mode);
      });
      _switchMode(mode);
    });
  }

  // 标题编辑
  const titleInput = overlay.querySelector('#set-title');
  if (titleInput) {
    titleInput.addEventListener('change', () => {
      const val = titleInput.value.trim();
      if (val && val !== _conv?.title) {
        _conv = updateConversation(_convId, { title: val });
        // 更新顶栏标题
        const titleEl = _pageEl.querySelector('.app-header-title');
        if (titleEl) titleEl.textContent = val;
      }
    });
  }
}

// 思维链开关内部逻辑（供设置抽屉复用）
function _toggleCotInternal(newVal) {
  _showToast(newVal ? '思维链已开启' : '思维链已关闭');
  _updateToolboxStates();
  if (newVal) {
    for (const m of _messages) {
      if (m.role === 'ai' && !m.cot && m._rawContent) {
        const extracted = _extractCoTFromContent(m._rawContent);
        if (extracted) {
          m.cot = extracted.cot;
          m.content = extracted.cleanContent;
        }
      } else if (m.role === 'ai' && !m.cot && m.content) {
        const extracted = _extractCoTFromContent(m.content);
        if (extracted) {
          m._rawContent = m.content;
          m.cot = extracted.cot;
          m.content = extracted.cleanContent;
        }
      }
    }
  }
  _rerenderAll();
}

// 异步加载角色名称和人设来源
async function _loadCharacterInfo() {
  const nameEl = document.querySelector('#set-ai-name');
  const srcEl = document.querySelector('#set-char-source');
  if (!nameEl) return;
  try {
    const charId = _conv?.characterId || getCurrentCharacter() || 'default';
    const char = await getCharacter(charId);
    if (char) {
      nameEl.textContent = char.name || '未命名角色';
      if (srcEl) srcEl.textContent = char.source || '本地人设';
    } else {
      nameEl.textContent = '默认助手';
      if (srcEl) srcEl.textContent = '系统默认';
    }
  } catch {
    nameEl.textContent = '默认助手';
    if (srcEl) srcEl.textContent = '系统默认';
  }
}

// 获取模型显示名
function _getModelName(modelId) {
  const groups = getSetting(STORAGE_KEYS.API_GROUPS);
  if (Array.isArray(groups)) {
    for (const g of groups) {
      if (g?.models) {
        const m = g.models.find(mo => (mo.id || mo.name) === modelId);
        if (m) return m.name || m.id || modelId;
      }
    }
  }
  return modelId;
}

// 获取 TTS 音色列表
function _getTtsVoiceList() {
  const voices = getSetting(STORAGE_KEYS.TTS_VOICES);
  if (Array.isArray(voices) && voices.length > 0) return voices;
  // 浏览器原生语音兜底
  if (typeof speechSynthesis !== 'undefined' && speechSynthesis.getVoices) {
    const browserVoices = speechSynthesis.getVoices();
    if (browserVoices.length > 0) {
      return browserVoices.map(v => ({ id: v.voiceURI || v.name, name: v.name }));
    }
  }
  return [];
}

// 音色选择面板
function _showVoicePanel(settings, voices) {
  const globalVoice = getSetting(STORAGE_KEYS.TTS_BROWSER_VOICE) || getSetting(STORAGE_KEYS.TTS_CLOUD_VOICE);
  _showFloatPanel('选择音色', `
    <div class="chat-option-list">
      <button class="chat-option-item ${!settings.ttsVoice ? 'chat-option-active' : ''}" data-value="">
        <span>跟随默认${globalVoice ? `（${_escapeHtml(globalVoice)}）` : ''}</span>
        ${!settings.ttsVoice ? ICONS.check(16) : ''}
      </button>
      ${voices.map(v => `
        <button class="chat-option-item ${settings.ttsVoice === v.id ? 'chat-option-active' : ''}" data-value="${_escapeAttr(v.id)}">
          <span>${_escapeHtml(v.name)}</span>
          ${settings.ttsVoice === v.id ? ICONS.check(16) : ''}
        </button>
      `).join('')}
    </div>
    ${voices.length === 0 ? '<p class="chat-panel-hint">未检测到可用音色，请在设置中配置 TTS</p>' : ''}
  `, (panel) => {
    panel.querySelector('.chat-option-list').addEventListener('click', (e) => {
      const item = e.target.closest('.chat-option-item');
      if (!item) return;
      const val = item.dataset.value;
      _updateConvSettings({ ttsVoice: val });
      _closeFloatPanel();
      _showToast(val ? '音色已选择' : '已跟随默认音色');
    });
  });
}

// GitHub 配置面板
function _showGithubConfigPanel() {
  const cfg = getGithubConfig(_convId) || { repo: '', branch: 'main', pat: '' };
  const overlay = document.createElement('div');
  overlay.className = 'chat-bottom-sheet-overlay';
  overlay.innerHTML = `
    <div class="chat-bottom-sheet chat-settings-drawer" style="max-height:85dvh;">
      <div class="chat-settings-drawer-header">
        <span class="chat-settings-drawer-title">GitHub 关联</span>
        <button class="chat-settings-drawer-close" aria-label="关闭" data-action="close">${ICONS.close(20)}</button>
      </div>
      <div class="chat-settings-drawer-body">
        <div class="chat-settings-section">
          <div class="chat-settings-section-title">仓库配置</div>
          <div class="chat-settings-row">
            <span class="chat-settings-label">仓库地址</span>
            <input class="chat-settings-input" id="gh-repo" value="${_escapeAttr(cfg.repo || '')}" placeholder="owner/repo" />
          </div>
          <div class="chat-settings-row">
            <span class="chat-settings-label">默认分支</span>
            <input class="chat-settings-input" id="gh-branch" value="${_escapeAttr(cfg.branch || 'main')}" placeholder="main" />
          </div>
          <div class="chat-settings-row">
            <span class="chat-settings-label">PAT</span>
            <input class="chat-settings-input" id="gh-pat" type="password" value="${_escapeAttr(cfg.pat || '')}" placeholder="Personal Access Token" />
          </div>
          <p class="chat-github-pat-hint">PAT 仅存储在本地，不会上传到任何服务器</p>
        </div>
        <div class="chat-settings-section">
          <div class="chat-settings-row" data-action="save-gh">
            <span class="chat-settings-label" style="color:var(--color-primary);font-weight:var(--font-weight-bold);">保存配置</span>
            <span class="chat-settings-value">${ICONS.check(16)}</span>
          </div>
          ${cfg.repo ? `
            <div class="chat-settings-row" data-action="clear-gh">
              <span class="chat-settings-label" style="color:var(--text-danger);">解除关联</span>
              <span class="chat-settings-value danger">${ICONS.trash(16)}</span>
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const close = () => {
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 200);
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) { close(); return; }
    const action = e.target.closest('[data-action]');
    if (!action) return;
    const act = action.dataset.action;
    if (act === 'close') { close(); return; }
    if (act === 'save-gh') {
      const repo = overlay.querySelector('#gh-repo').value.trim();
      const branch = overlay.querySelector('#gh-branch').value.trim() || 'main';
      const pat = overlay.querySelector('#gh-pat').value.trim();
      if (!repo) {
        _showToast('请输入仓库地址');
        return;
      }
      setGithubConfig(_convId, { repo, branch, pat });
      _showToast('GitHub 配置已保存');
      close();
    }
    if (act === 'clear-gh') {
      _showConfirmDialog('解除 GitHub 关联', '将清除当前对话的 GitHub 配置（含 PAT）。', () => {
        setGithubConfig(_convId, null);
        _showToast('已解除关联');
        close();
      });
    }
  });
}

// 导出对话为 Markdown
function _exportConversation() {
  if (!_allMessages || _allMessages.length === 0) {
    _showToast('当前对话没有消息');
    return;
  }
  const title = _conv?.title || '对话';
  let md = `# ${title}\n\n`;
  md += `> 导出时间：${new Date().toLocaleString('zh-CN')}\n\n`;
  md += `---\n\n`;

  for (const msg of _allMessages) {
    const time = new Date(msg.timestamp).toLocaleString('zh-CN');
    const role = msg.role === 'ai' ? 'AI' : (msg.role === 'user' ? '我' : msg.role);
    md += `### ${role} · ${time}\n\n`;
    if (msg.content) md += `${msg.content}\n\n`;
    if (msg.cot?.steps?.length) {
      md += `<details><summary>思维链（${msg.cot.steps.length} 步）</summary>\n\n`;
      for (const step of msg.cot.steps) {
        md += `- ${step.title}`;
        if (step.desc) md += ` — ${step.desc}`;
        md += `\n`;
      }
      md += `\n</details>\n\n`;
    }
    md += `---\n\n`;
  }

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}_${Date.now()}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  _showToast('已导出 Markdown');
}

// ========== 工具箱 ==========

function _toggleToolbox() {
  if (_toolboxOpen) {
    _closeToolbox();
  } else {
    _openToolbox();
  }
}

function _openToolbox() {
  _toolboxOpen = true;
  const toolbox = _pageEl.querySelector('#chat-toolbox');
  const overlay = _pageEl.querySelector('#chat-toolbox-overlay');
  if (toolbox) toolbox.hidden = false;
  if (overlay) overlay.hidden = false;
  // 更新思维链开关状态
  _updateToolboxStates();
}

function _closeToolbox() {
  _toolboxOpen = false;
  const toolbox = _pageEl.querySelector('#chat-toolbox');
  const overlay = _pageEl.querySelector('#chat-toolbox-overlay');
  if (toolbox) toolbox.hidden = true;
  if (overlay) overlay.hidden = true;
}

function _updateToolboxStates() {
  const settings = _conv?.settings || _defaultConversationSettings();
  const cotItem = _pageEl.querySelector('[data-tool="cot"]');
  if (cotItem) {
    cotItem.classList.toggle('chat-tool-active', !!settings.cotEnabled);
  }
}

function _handleTool(tool) {
  const settings = _conv?.settings || _defaultConversationSettings();
  switch (tool) {
    case 'emoji':
      _showEmojiPanel();
      break;
    case 'image':
      _pickFile('image');
      break;
    case 'file':
      _pickFile('file');
      break;
    case 'voice':
      _showToast('长按按钮录音（语音功能完善中）');
      // 预留路由：Step 3 实现语音录制
      events.emit('chat:voice:start', { conversationId: _convId });
      break;
    case 'context':
      _showContextPanel();
      break;
    case 'temp':
      _showTempPanel();
      break;
    case 'clear':
      _confirmClear();
      break;
    case 'slash':
      _showSlashPanel();
      break;
    case 'github':
      // 预留路由：Step 4 实现 GitHub 面板
      events.emit('chat:github:open', { conversationId: _convId });
      _showToast('GitHub面板打开中...');
      break;
    case 'cot':
      _toggleCot();
      break;
    case 'model':
      _showModelPanel();
      break;
    case 'mcp':
      // 预留路由：MCP 工具调用
      events.emit('chat:mcp:open', { conversationId: _convId });
      _showToast('MCP工具面板打开中...');
      break;
  }
}

// Emoji 面板
function _showEmojiPanel() {
  const emojis = ['😀','😄','😊','🥰','😍','🤗','🤔','😴','🥺','😢','😡','🤯','😎','🥳','😇','🤭','😂','🤣','😅','😭','😴','🤤','💤','🌟','✨','💫','🌸','🌺','🍀','🌈','☀️','🌙','🍦','🍰','🍓','🧋','☕','🍵','💝','💖','💞','💌','🎉','🎈','🎁','🎵','🎶'];
  _showFloatPanel('表情', `
    <div class="chat-emoji-grid">
      ${emojis.map(e => `<button class="chat-emoji-item">${e}</button>`).join('')}
    </div>
  `, (panel) => {
    panel.querySelector('.chat-emoji-grid').addEventListener('click', (e) => {
      const item = e.target.closest('.chat-emoji-item');
      if (!item) return;
      _inputEl.value += item.textContent;
      _autoResize();
      _inputEl.focus();
    });
  });
}

// 文件选择
function _pickFile(type) {
  const input = document.createElement('input');
  input.type = 'file';
  if (type === 'image') {
    input.accept = 'image/*';
  } else {
    input.accept = '*/*';
  }
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    // 插入文件名到输入框（Step 3 实现文件消息类型渲染）
    _inputEl.value += `[${type === 'image' ? '图片' : '文件'}: ${file.name}]`;
    _autoResize();
    _inputEl.focus();
  });
  input.click();
}

// 上下文窗口面板
function _showContextPanel() {
  const settings = _conv?.settings || _defaultConversationSettings();
  const options = [2, 4, 8, 16, 32];
  _showFloatPanel('上下文范围', `
    <div class="chat-option-list">
      ${options.map(n => `
        <button class="chat-option-item ${settings.contextWindow === n ? 'chat-option-active' : ''}" data-value="${n}">
          <span>最近 ${n} 条</span>
          ${settings.contextWindow === n ? ICONS.check(16) : ''}
        </button>
      `).join('')}
    </div>
    <p class="chat-panel-hint">控制AI能参考的对话轮数</p>
  `, (panel) => {
    panel.querySelector('.chat-option-list').addEventListener('click', (e) => {
      const item = e.target.closest('.chat-option-item');
      if (!item) return;
      const val = parseInt(item.dataset.value);
      _updateConvSettings({ contextWindow: val });
      _closeFloatPanel();
      _showToast(`上下文范围：${val} 条`);
    });
  });
}

// 温度面板
function _showTempPanel() {
  const settings = _conv?.settings || _defaultConversationSettings();
  _showFloatPanel('温度', `
    <div class="chat-temp-panel">
      <input type="range" class="chat-temp-slider" id="chat-temp-slider" min="0" max="2" step="0.1" value="${settings.temperature}"/>
      <div class="chat-temp-value" id="chat-temp-value">${settings.temperature.toFixed(1)}</div>
      <div class="chat-temp-labels">
        <span>严谨</span><span>平衡</span><span>发散</span>
      </div>
    </div>
  `, (panel) => {
    const slider = panel.querySelector('#chat-temp-slider');
    const valEl = panel.querySelector('#chat-temp-value');
    let debounceTimer = null;
    slider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      valEl.textContent = val.toFixed(1);
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        _updateConvSettings({ temperature: val });
      }, 300);
    });
  });
}

// 清空确认
function _confirmClear() {
  const overlay = document.createElement('div');
  overlay.className = 'chat-confirm-overlay';
  overlay.innerHTML = `
    <div class="chat-confirm-dialog">
      <div class="chat-confirm-title">清空上下文</div>
      <div class="chat-confirm-desc">这将重置AI的上下文记忆，但不会删除已有消息记录。确定继续吗？</div>
      <div class="chat-confirm-actions">
        <button class="chat-confirm-btn cancel" data-action="cancel">取消</button>
        <button class="chat-confirm-btn confirm" data-action="confirm">确定</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => overlay.remove());
  overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
    overlay.remove();
    // 重置上下文：发出事件，AI上下文系统监听
    events.emit('chat:context:clear', { conversationId: _convId });
    _showToast('上下文已重置');
  });
}

// Slash 指令面板
function _showSlashPanel() {
  import('../data/chat-store.js').then(({ getSlashCommands }) => {
    const cmds = getSlashCommands();
    _showFloatPanel('快捷指令', `
      <div class="chat-slash-list">
        ${cmds.map(c => `
          <button class="chat-slash-item" data-cmd="${_escapeAttr(c.cmd)}">
            <span class="chat-slash-cmd">${_escapeHtml(c.cmd)}</span>
            <span class="chat-slash-desc">${_escapeHtml(c.desc)}</span>
          </button>
        `).join('')}
      </div>
    `, (panel) => {
      panel.querySelector('.chat-slash-list').addEventListener('click', (e) => {
        const item = e.target.closest('.chat-slash-item');
        if (!item) return;
        _inputEl.value = item.dataset.cmd + ' ';
        _autoResize();
        _inputEl.focus();
        _closeFloatPanel();
      });
    });
  });
}

// 思维链开关
function _toggleCot() {
  const settings = _conv?.settings || _defaultConversationSettings();
  const newVal = !settings.cotEnabled;
  _updateConvSettings({ cotEnabled: newVal });
  _toggleCotInternal(newVal);
}

// 模型选择面板
function _showModelPanel() {
  const settings = _conv?.settings || _defaultConversationSettings();
  const groups = getSetting(STORAGE_KEYS.API_GROUPS);
  let models = [];
  if (Array.isArray(groups)) {
    const active = groups.find(g => g.active) || groups[0];
    if (active?.models) models = active.models;
  }
  const defaultModel = getSetting(STORAGE_KEYS.API_DEFAULT_CHAT_MODEL);

  _showFloatPanel('选择模型', `
    <div class="chat-option-list">
      <button class="chat-option-item ${!settings.model ? 'chat-option-active' : ''}" data-value="">
        <span>跟随默认${defaultModel ? `（${_escapeHtml(defaultModel)}）` : ''}</span>
        ${!settings.model ? ICONS.check(16) : ''}
      </button>
      ${models.map(m => `
        <button class="chat-option-item ${settings.model === m.id ? 'chat-option-active' : ''}" data-value="${_escapeAttr(m.id || m.name || '')}">
          <span>${_escapeHtml(m.name || m.id || '')}</span>
          ${settings.model === (m.id || m.name) ? ICONS.check(16) : ''}
        </button>
      `).join('')}
    </div>
    ${models.length === 0 ? '<p class="chat-panel-hint">未检测到已配置模型，请在设置中配置API</p>' : ''}
  `, (panel) => {
    panel.querySelector('.chat-option-list').addEventListener('click', (e) => {
      const item = e.target.closest('.chat-option-item');
      if (!item) return;
      const val = item.dataset.value;
      _updateConvSettings({ model: val });
      _closeFloatPanel();
      _showToast(val ? `模型已切换` : '已跟随默认模型');
    });
  });
}

// 更新会话设置
function _updateConvSettings(patch) {
  const settings = Object.assign(_defaultConversationSettings(), _conv?.settings || {}, patch);
  _conv = updateConversation(_convId, { settings });
}

// ========== 浮动面板通用 ==========

let _floatPanel = null;

function _showFloatPanel(title, contentHTML, afterMount) {
  _closeFloatPanel();
  const overlay = document.createElement('div');
  overlay.className = 'chat-float-overlay';
  overlay.innerHTML = `
    <div class="chat-float-panel">
      <div class="chat-float-header">
        <span class="chat-float-title">${_escapeHtml(title)}</span>
        <button class="chat-float-close" aria-label="关闭">${ICONS.close(18)}</button>
      </div>
      <div class="chat-float-body">${contentHTML}</div>
    </div>
  `;
  document.body.appendChild(overlay);
  _floatPanel = overlay;

  overlay.querySelector('.chat-float-close').addEventListener('click', _closeFloatPanel);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) _closeFloatPanel();
  });

  if (afterMount) afterMount(overlay.querySelector('.chat-float-body'));
}

function _closeFloatPanel() {
  if (_floatPanel) {
    _floatPanel.remove();
    _floatPanel = null;
  }
}

// ========== 模式切换 ==========

function _switchMode(mode) {
  _mode = mode;
  _updateConvSettings({ mode });
  // 更新按钮图标
  const btn = _pageEl.querySelector('#chat-mode-btn');
  if (btn) btn.innerHTML = mode === 'conversation' ? ICONS.bubble(20) : ICONS.edit(20);
  // 重新渲染所有消息
  _rerenderAll();
  _showToast(mode === 'conversation' ? '已切换到对话模式' : '已切换到气泡模式');
}

function _rerenderAll() {
  // 清空消息区（保留 load-more hint）
  const hint = _pageEl.querySelector('#chat-load-more');
  const empty = _pageEl.querySelector('#chat-empty-hint');
  _messagesEl.innerHTML = '';
  if (hint) _messagesEl.appendChild(hint);
  if (_allMessages.length === 0 && empty) {
    _messagesEl.appendChild(empty);
    return;
  }
  // 重新渲染
  const visible = _allMessages.slice(_allMessages.length - _renderedCount);
  for (let i = 0; i < visible.length; i++) {
    const prev = i > 0 ? visible[i - 1] : null;
    const fragment = _buildMessageRow(visible[i], prev);
    _messagesEl.appendChild(fragment);
  }
  _scrollToBottom(false);
}

// ========== 滚动辅助 ==========

function _scrollToBottom(smooth) {
  requestAnimationFrame(() => {
    _messagesEl.scrollTo({
      top: _messagesEl.scrollHeight,
      behavior: smooth ? 'smooth' : 'auto'
    });
    _isNearBottom = true;
    _unreadNewCount = 0;
    if (_scrollBottomBtn) _scrollBottomBtn.hidden = true;
    if (_newMsgBadge) _newMsgBadge.hidden = true;
  });
}

function _onScroll() {
  // 顶部加载更多
  if (_messagesEl.scrollTop < 50 && _renderedCount < _allMessages.length) {
    _loadMoreHistory();
  }
  // 底部检测
  const distFromBottom = _messagesEl.scrollHeight - _messagesEl.scrollTop - _messagesEl.clientHeight;
  const wasNearBottom = _isNearBottom;
  _isNearBottom = distFromBottom < 80;

  if (_isNearBottom) {
    if (_scrollBottomBtn) _scrollBottomBtn.hidden = true;
    if (_newMsgBadge) _newMsgBadge.hidden = true;
    _unreadNewCount = 0;
  } else {
    if (_scrollBottomBtn) _scrollBottomBtn.hidden = false;
    if (_unreadNewCount > 0 && _newMsgBadge) {
      _newMsgBadge.hidden = false;
      _newMsgBadge.textContent = _unreadNewCount > 99 ? '99+' : _unreadNewCount;
    }
  }
}

function _onExternalMessage(payload) {
  const data = payload?.data?.data || payload?.data || payload;
  if (data?.conversationId !== _convId) return;
  // 如果不在底部，增加未读计数
  if (!_isNearBottom && data?.message?.role === 'ai') {
    _unreadNewCount++;
    if (_newMsgBadge) {
      _newMsgBadge.hidden = false;
      _newMsgBadge.textContent = _unreadNewCount > 99 ? '99+' : _unreadNewCount;
    }
  }
}

// ========== 输入框 ==========

function _autoResize() {
  _inputEl.style.height = 'auto';
  _inputEl.style.height = Math.min(_inputEl.scrollHeight, 100) + 'px';
}

// ========== Toast ==========

function _showToast(text) {
  const existing = document.querySelector('.chat-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.className = 'chat-toast';
  toast.innerHTML = `<span>${_escapeHtml(text)}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 150);
  }, 2000);
}

// ========== 工具 ==========

function _escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function _escapeAttr(text) {
  if (!text) return '';
  return String(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ========== 销毁 ==========

function destroy() {
  if (_abortController) {
    _abortController.abort();
    _abortController = null;
  }
  _closeFloatPanel();
  _closeToolbox();
  events.off('message.sent', _onExternalMessage);
  events.off('message.received', _onExternalMessage);
  _container = null;
  _pageEl = null;
  _messagesEl = null;
  _inputEl = null;
  _sendBtn = null;
  _messages = [];
  _allMessages = [];
  _conv = null;
}

export { render, destroy };
export default { render, destroy };
