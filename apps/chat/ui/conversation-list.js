// ============================================
// conversation-list.js — 会话列表页
// 渲染搜索栏 + 会话列表 + 空状态 + 长按菜单 + 搜索模式
// ============================================

import { ICONS } from '../icons/chat-icons.js';
import {
  getConversations, getConversation, createConversation,
  updateConversation, deleteConversation, loadMessages,
  togglePin, markRead, saveDraft, formatTime
} from '../data/chat-store.js';
import { saveMessage } from '../../../core/storage.js';
import events from '../../../core/events.js';

// ========== 状态 ==========

let _container = null;
let _pageEl = null;
let _searchMode = false;
let _searchKeyword = '';
let _longPressTimer = null;
let _currentLongPressConv = null;
let _undoTimer = null;
let _undoData = null;

// 回调：用户点击会话 → 进入聊天界面
let _onSelectConversation = null;

// ========== 渲染入口 ==========

function render(container, callbacks = {}) {
  _container = container;
  _onSelectConversation = callbacks.onSelectConversation;

  _pageEl = document.createElement('div');
  _pageEl.className = 'chat-list-page';
  _pageEl.innerHTML = _buildHTML();

  container.appendChild(_pageEl);
  _bindEvents();

  // 监听消息事件，更新列表
  events.on('message.sent', _onMessageUpdate);
  events.on('message.received', _onMessageUpdate);
  events.on('conversation.switched', _onConversationSwitched);
}

function _buildHTML() {
  const conversations = getConversations();
  return `
    <div class="chat-search-bar">
      <div class="chat-search-input-wrap">
        ${ICONS.search(18)}
        <input class="chat-search-input" id="chat-search-input" type="text" placeholder="搜索对话..." autocomplete="off"/>
      </div>
      <button class="chat-new-btn" id="chat-new-btn" aria-label="新建对话">
        ${ICONS.edit(18)}
      </button>
    </div>
    <div class="chat-list" id="chat-list-container">
      ${_renderList(conversations)}
    </div>
  `;
}

function _renderList(conversations) {
  if (!conversations || conversations.length === 0) {
    return `
      <div class="chat-list-empty">
        ${ICONS.empty(64)}
        <span class="chat-list-empty-text">还没有对话，点击右上角开始吧</span>
      </div>
    `;
  }

  return conversations.map(conv => _renderItem(conv)).join('');
}

function _renderItem(conv) {
  const time = conv.lastMessage ? formatTime(conv.lastMessage.timestamp) : '';
  let preview = '';
  let previewClass = '';

  if (conv.draft) {
    preview = `[草稿] ${conv.draft}`;
    previewClass = 'draft';
  } else if (conv.lastMessage) {
    preview = conv.lastMessage.content || '';
    // 截断
    if (preview.length > 50) preview = preview.substring(0, 50) + '...';
  }

  const badge = conv.unreadCount > 0
    ? `<span class="chat-list-badge">${conv.unreadCount > 99 ? '99+' : conv.unreadCount}</span>`
    : '';

  const avatarContent = conv.avatar
    ? `<img src="${_escapeAttr(conv.avatar)}" alt="${_escapeAttr(conv.title)}"/>`
    : _escapeHtml(conv.title.charAt(0) || '?');

  return `
    <div class="chat-list-item${conv.pinned ? ' pinned' : ''}" data-id="${conv.id}">
      <div class="chat-list-avatar">${avatarContent}</div>
      <div class="chat-list-content">
        <div class="chat-list-top">
          <span class="chat-list-name">${_escapeHtml(conv.title)}</span>
          <span class="chat-list-time">${time}</span>
        </div>
        <div class="chat-list-bottom">
          <span class="chat-list-preview ${previewClass}">${_escapeHtml(preview)}</span>
          ${badge}
        </div>
      </div>
    </div>
  `;
}

// ========== 事件绑定 ==========

function _bindEvents() {
  const searchInput = _pageEl.querySelector('#chat-search-input');
  const newBtn = _pageEl.querySelector('#chat-new-btn');
  const listContainer = _pageEl.querySelector('#chat-list-container');

// 搜索输入
  searchInput.addEventListener('input', (e) => {
    const value = e.target.value.trim();
    if (value) {
      _enterSearchMode(value);
    } else {
      _exitSearchMode();
    }
  });

  searchInput.addEventListener('focus', () => {
    if (searchInput.value.trim()) {
      _enterSearchMode(searchInput.value.trim());
    }
  });

  // 新建对话
  newBtn.addEventListener('click', () => {
    _onNewConversation();
  });

  // 列表项点击 + 长按
  listContainer.addEventListener('click', (e) => {
    const item = e.target.closest('.chat-list-item');
    if (!item) return;
    if (_searchMode) {
      // 搜索结果点击
      const resultItem = e.target.closest('.chat-search-result-item');
      if (resultItem) {
        const convId = resultItem.dataset.convId;
        const msgId = resultItem.dataset.msgId;
        _exitSearchMode();
        _openConversation(convId, msgId);
      }
      return;
    }
    const id = item.dataset.id;
    if (id) _openConversation(id);
  });

  // 长按
  listContainer.addEventListener('touchstart', _onTouchStart, { passive: true });
  listContainer.addEventListener('touchend', _onTouchEnd);
  listContainer.addEventListener('touchmove', _onTouchMove);
  listContainer.addEventListener('mousedown', _onMouseDown);
  listContainer.addEventListener('mouseup', _onMouseUp);
  listContainer.addEventListener('mouseleave', _onMouseUp);
}

// ========== 长按处理 ==========

function _onTouchStart(e) {
  const item = e.target.closest('.chat-list-item');
  if (!item || _searchMode) return;
  const id = item.dataset.id;
  _longPressTimer = setTimeout(() => {
    _showLongPressMenu(id);
    if (navigator.vibrate) navigator.vibrate(10);
  }, 300);
}

function _onTouchEnd() {
  if (_longPressTimer) {
    clearTimeout(_longPressTimer);
    _longPressTimer = null;
  }
}

function _onTouchMove() {
  if (_longPressTimer) {
    clearTimeout(_longPressTimer);
    _longPressTimer = null;
  }
}

function _onMouseDown(e) {
  const item = e.target.closest('.chat-list-item');
  if (!item || _searchMode) return;
  const id = item.dataset.id;
  _longPressTimer = setTimeout(() => {
    _showLongPressMenu(id);
  }, 500);
}

function _onMouseUp() {
  if (_longPressTimer) {
    clearTimeout(_longPressTimer);
    _longPressTimer = null;
  }
}

// ========== 长按菜单 ==========

function _showLongPressMenu(convId) {
  const conv = getConversation(convId);
  if (!conv) return;
  _currentLongPressConv = conv;

  const overlay = document.createElement('div');
  overlay.className = 'chat-bottom-sheet-overlay';
  overlay.id = 'chat-longpress-overlay';

  const sheet = document.createElement('div');
  sheet.className = 'chat-bottom-sheet';

  const isPinned = conv.pinned;
  const hasUnread = conv.unreadCount > 0;

  sheet.innerHTML = `
    <div class="chat-sheet-item" data-action="pin">
      ${ICONS.pin(20)}
      <span>${isPinned ? '取消置顶' : '置顶'}</span>
    </div>
    <div class="chat-sheet-divider"></div>
    <div class="chat-sheet-item" data-action="read">
      ${hasUnread ? ICONS.markRead(20) : ICONS.markUnread(20)}
      <span>${hasUnread ? '标为已读' : '标为未读'}</span>
    </div>
    <div class="chat-sheet-divider"></div>
    <div class="chat-sheet-item danger" data-action="delete">
      ${ICONS.trash(20)}
      <span>删除</span>
    </div>
  `;

  overlay.appendChild(sheet);
  document.body.appendChild(overlay);

  // 绑定菜单项
  sheet.querySelectorAll('.chat-sheet-item').forEach(item => {
    item.addEventListener('click', () => {
      const action = item.dataset.action;
      _handleLongPressAction(action);
      _closeLongPressMenu();
    });
  });

  // 点击遮罩关闭
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) _closeLongPressMenu();
  });
}

function _closeLongPressMenu() {
  const overlay = document.getElementById('chat-longpress-overlay');
  if (overlay) {
    overlay.style.animation = 'fadeIn var(--duration-fast) var(--ease-out) reverse both';
    setTimeout(() => overlay.remove(), 150);
  }
  _currentLongPressConv = null;
}

function _handleLongPressAction(action) {
  const conv = _currentLongPressConv;
  if (!conv) return;

  switch (action) {
    case 'pin':
      togglePin(conv.id);
      _refreshList();
      break;
    case 'read':
      if (conv.unreadCount > 0) {
        markRead(conv.id);
      } else {
        updateConversation(conv.id, { unreadCount: 1 });
      }
      _refreshList();
      break;
    case 'delete':
      _showDeleteConfirm(conv);
      break;
  }
}

// ========== 删除确认 + 撤销 ==========

function _showDeleteConfirm(conv) {
  const overlay = document.createElement('div');
  overlay.className = 'chat-confirm-overlay';
  overlay.id = 'chat-delete-confirm';

  overlay.innerHTML = `
    <div class="chat-confirm-dialog">
      <div class="chat-confirm-title">删除对话</div>
      <div class="chat-confirm-desc">确定要删除与"${_escapeHtml(conv.title)}"的对话吗？删除后可以在3秒内撤销。</div>
      <div class="chat-confirm-actions">
        <button class="chat-confirm-btn cancel" data-action="cancel">取消</button>
        <button class="chat-confirm-btn danger" data-action="confirm">删除</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => {
    overlay.remove();
  });

  overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => {
    overlay.remove();
    _doDelete(conv);
  });
}

async function _doDelete(conv) {
  // 保存撤销数据
  _undoData = {
    conv: { ...conv },
    messages: []
  };
  try {
    _undoData.messages = await loadMessages(conv.id);
  } catch (e) {
    // 消息加载失败不阻塞删除
  }

  await deleteConversation(conv.id);
  _refreshList();
  _showToast(`已删除"${conv.title}"`, '撤销', () => {
    _undoDelete();
  });
}

function _undoDelete() {
  if (!_undoData) return;
  clearTimeout(_undoTimer);
  // 重新创建会话
  const conv = createConversation({
    id: _undoData.conv.id,
    characterId: _undoData.conv.characterId,
    type: _undoData.conv.type,
    title: _undoData.conv.title,
    avatar: _undoData.conv.avatar,
    members: _undoData.conv.members,
    settings: _undoData.conv.settings
  });
  // 恢复消息
  if (_undoData.messages && _undoData.messages.length > 0) {
    _undoData.messages.forEach(m => {
      saveMessage(m).catch(() => {});
    });
    updateConversation(conv.id, { lastMessage: _undoData.conv.lastMessage });
  }
  _undoData = null;
  _refreshList();
  _showToast('已恢复');
}

// ========== 搜索 ==========

let _searchToken = 0; // 防止旧搜索覆盖新输入

async function _enterSearchMode(keyword) {
  _searchMode = true;
  _searchKeyword = keyword;
  const myToken = ++_searchToken;
  _renderSearchLoading();
  const results = await _searchConversations(keyword);
  if (_searchToken !== myToken) return; // 已有新输入，丢弃旧结果
  _renderSearchResults(results);
}

function _exitSearchMode() {
  _searchMode = false;
  _searchKeyword = '';
  _searchToken++;
  _refreshList();
}

async function _searchConversations(keyword) {
  const conversations = getConversations();
  const lower = keyword.toLowerCase();
  const groups = [];

  for (const conv of conversations) {
    const nameMatch = conv.title.toLowerCase().includes(lower);
    const group = {
      conversation: conv,
      nameMatch,
      messages: []
    };

    // 搜索会话名
    if (nameMatch) {
      groups.push(group);
      continue;
    }

    // 搜索消息内容
    try {
      const messages = await loadMessages(conv.id, conv.characterId);
      if (messages && messages.length > 0) {
        const matched = messages.filter(m =>
          m.content && m.content.toLowerCase().includes(lower)
        );
        if (matched.length > 0) {
          group.messages = matched.slice(0, 3); // 每会话最多3条
          groups.push(group);
        }
      }
    } catch (e) {
      // 单会话搜索失败不阻塞
    }
  }

  return groups;
}

function _renderSearchLoading() {
  const container = _pageEl.querySelector('#chat-list-container');
  if (!container) return;
  container.innerHTML = `
    <div class="chat-search-empty">
      <div class="chat-search-loading">搜索中...</div>
    </div>
  `;
}

function _renderSearchResults(groups) {
  const container = _pageEl.querySelector('#chat-list-container');
  if (!container) return;

  if (groups.length === 0) {
    container.innerHTML = `
      <div class="chat-search-empty">
        ${ICONS.search(48)}
        <span class="chat-search-empty-text">没有找到相关消息</span>
      </div>
    `;
    return;
  }

  let html = '<div class="chat-search-results">';
  for (const group of groups) {
    const conv = group.conversation;
    const hasMsgs = group.messages.length > 0;
    html += `
      <div class="chat-search-group">
        <div class="chat-search-group-header">${_highlightKeyword(conv.title, _searchKeyword)}</div>
        ${hasMsgs ? group.messages.map(msg => `
          <div class="chat-search-result-item" data-conv-id="${conv.id}" data-msg-id="${msg.id}">
            <div class="chat-search-result-name">${_highlightKeyword(conv.title, _searchKeyword)}</div>
            <div class="chat-search-result-snippet">${_highlightKeyword(_snippet(msg.content, _searchKeyword, 80), _searchKeyword)}</div>
          </div>
        `).join('') : `
          <div class="chat-search-result-item" data-conv-id="${conv.id}">
            <div class="chat-search-result-name">${_highlightKeyword(conv.title, _searchKeyword)}</div>
            <div class="chat-search-result-snippet">点击进入对话</div>
          </div>
        `}
        ${hasMsgs ? '<div class="chat-search-more">查看全部结果</div>' : ''}
      </div>
    `;
  }
  html += '</div>';
  container.innerHTML = html;
}

// 截取关键词周围的文本
function _snippet(content, keyword, maxLen) {
  if (!content) return '';
  const text = String(content);
  const lower = text.toLowerCase();
  const idx = lower.indexOf(keyword.toLowerCase());
  if (idx === -1) return text.substring(0, maxLen) + (text.length > maxLen ? '...' : '');
  const start = Math.max(0, idx - Math.floor((maxLen - keyword.length) / 2));
  const end = Math.min(text.length, start + maxLen);
  let snippet = text.substring(start, end);
  if (start > 0) snippet = '...' + snippet;
  if (end < text.length) snippet = snippet + '...';
  return snippet;
}

function _highlightKeyword(text, keyword) {
  if (!keyword) return _escapeHtml(text);
  const escaped = _escapeHtml(text);
  const reg = new RegExp(`(${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escaped.replace(reg, '<span class="chat-search-highlight">$1</span>');
}

// ========== 新建对话 ==========

function _onNewConversation() {
  // 预留：跳转人设选择APP
  // 目前创建一个默认对话
  const conv = createConversation({
    title: '新对话',
    characterId: 'default'
  });
  _refreshList();
  _openConversation(conv.id);
  events.emit('conversation.created', { conversationId: conv.id });
}

// ========== 打开会话 ==========

function _openConversation(convId, msgId) {
  markRead(convId);
  _refreshList();
  if (_onSelectConversation) {
    _onSelectConversation(convId, msgId);
  }
}

// ========== Toast ==========

function _showToast(text, actionText, actionCallback) {
  const existing = document.querySelector('.chat-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'chat-toast';
  toast.innerHTML = `<span>${_escapeHtml(text)}</span>`;

  if (actionText) {
    const action = document.createElement('span');
    action.className = 'chat-toast-action';
    action.textContent = actionText;
    action.addEventListener('click', () => {
      if (actionCallback) actionCallback();
      _hideToast(toast);
    });
    toast.appendChild(action);
  }

  document.body.appendChild(toast);

  if (actionText) {
    _undoTimer = setTimeout(() => {
      _hideToast(toast);
      _undoData = null;
    }, 3000);
  } else {
    setTimeout(() => _hideToast(toast), 2000);
  }
}

function _hideToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('fade-out');
  setTimeout(() => toast.remove(), 150);
}

// ========== 刷新 ==========

function _refreshList() {
  if (!_pageEl || _searchMode) return;
  const container = _pageEl.querySelector('#chat-list-container');
  if (!container) return;
  container.innerHTML = _renderList(getConversations());
}

// ========== 事件回调 ==========

function _onMessageUpdate(payload) {
  _refreshList();
}

function _onConversationSwitched(payload) {
  _refreshList();
}

// ========== 工具函数 ==========

function _escapeHtml(text) {
  if (!text) return '';
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
  events.off('message.sent', _onMessageUpdate);
  events.off('message.received', _onMessageUpdate);
  events.off('conversation.switched', _onConversationSwitched);
  clearTimeout(_longPressTimer);
  clearTimeout(_undoTimer);
}

export { render, destroy, _refreshList };
export default { render, destroy };
