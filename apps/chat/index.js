// ============================================
// chat/index.js — 消息APP 入口
// 路由：会话列表页 ↔ 聊天界面
// init(container) → 渲染列表页 → 用户点击会话 → 进入聊天界面
// ============================================

// 动态加载CSS（按需注入，避免污染全局）
function _injectCSS() {
  if (document.getElementById('chat-app-css')) return;
  const link = document.createElement('link');
  link.id = 'chat-app-css';
  link.rel = 'stylesheet';
  link.href = 'apps/chat/css/chat.css';
  document.head.appendChild(link);
}

let _container = null;
let _listView = null;
let _chatView = null;
let _currentView = null;

function init(container) {
  _container = container;
  _injectCSS();

  // 动态导入列表页模块
  import('./ui/conversation-list.js').then(({ default: listModule }) => {
    _listView = listModule;
    _showListView();
  }).catch(err => {
    console.error('[Chat] 列表页加载失败:', err);
    container.innerHTML = '<div class="chat-list-empty"><span class="chat-list-empty-text">加载失败，请重试</span></div>';
  });

  return destroy;
}

function _showListView() {
  if (_chatView) {
    _chatView.destroy?.();
    _chatView = null;
  }
  _currentView = 'list';
  _container.innerHTML = '';
  _listView.render(_container, {
    onSelectConversation: (convId, msgId) => {
      _showChatView(convId, msgId);
    }
  });
}

function _showChatView(convId, msgId) {
  _currentView = 'chat';
  if (_listView) {
    _listView.destroy?.();
  }
  _container.innerHTML = '';

  // 动态加载聊天界面模块（Step 2 将实现完整聊天界面）
  import('./ui/chat-view.js').then(({ default: chatModule }) => {
    _chatView = chatModule;
    _chatView.render(_container, convId, {
      onBack: () => _showListView(),
      highlightMsgId: msgId
    });
  }).catch(err => {
    console.error('[Chat] 聊天界面加载失败:', err);
    // 降级：返回列表页
    _showListView();
  });
}

function destroy() {
  if (_listView) { _listView.destroy?.(); _listView = null; }
  if (_chatView) { _chatView.destroy?.(); _chatView = null; }
  if (_container) _container.innerHTML = '';
  _currentView = null;
}

export { init, destroy };
export default { init, destroy };
