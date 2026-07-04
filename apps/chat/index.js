// apps/chat/index.js
// 聊天 App 入口——state 单例、CSS 注入、mount/unmount、视图调度、bus 监听。
// 详情页渲染在 detail-view.js，发送/AI 回复在 sending.js，壁纸在 wallpaper.js。
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符；视觉值走 CSS 变量；全中文注释。

import { KEYS, STORES } from '../../core/storage-keys.js';
import { setData, getDB, setDB, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast } from '../../core/ui.js';
import bus from '../../core/events.js';
import { injectStyle, debounce } from '../../core/util.js';
import { applyAppBg } from '../../core/app-bg.js';
import { renderSessionListPage, renderSessionListItems } from './session-list.js';
import { renderChatDetailView, flushDraft } from './detail-view.js';
import { cancelStreaming } from './sending.js';

// re-export 给 message-actions.js / session-list.js 等子文件用（保持原 import 路径不变）
export { applySessionWallpaper } from './wallpaper.js';
export { setQuoteToInput } from './detail-view.js';

// ════════════════════════════════════════
// 模块状态（单例，子模块通过 getState 读取）
// ════════════════════════════════════════

const state = {
  containerEl: null,
  view: 'list',              // 'list' | 'chat'
  currentSessionId: null,
  currentSession: null,      // 缓存的 session 对象
  currentCharacterId: null,
  currentCharacter: null,    // 缓存的 character 对象
  messageListEl: null,
  inputEl: null,
  sendBtnEl: null,
  isReplying: false,
  typingTimer: null,         // 本地流式定时器，unmount 时清掉
  typingIndicatorEl: null,
  abortController: null,     // AI 流式请求的 abort
  streamCancelled: false,    // 本地流式取消标志
  lastReply: null,           // 上一条本地兜底回复，去重用
  lastSearchKeyword: '',     // 列表搜索关键字（跨视图保留）
  localModeHintedSessions: new Set(),  // 已提示过本地模式的 session id
  pendingQuote: null,        // 待发送的引用文本
  saveDraftDebounced: null,  // 草稿防抖函数（mount 时创建）
  busListeners: []           // unmount 时统一解绑
};

export function getState() { return state; }

// ════════════════════════════════════════
// 样式（全部走 CSS 变量，主题变了我也跟着变）
// ════════════════════════════════════════

injectStyle('app-chat-style', `
  .chat-list-body{ flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:12px 14px 24px; }

  /* 搜索框 */
  .chat-search-wrap{ position:relative; margin-bottom:12px; }
  .chat-search-wrap .popo-icon{
    position:absolute; left:14px; top:50%; transform:translateY(-50%);
    color:var(--text-hint); pointer-events:none;
  }
  .chat-search{
    width:100%; padding:11px 16px 11px 42px;
    background:color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    border:1px solid color-mix(in srgb, var(--text-hint) 18%, transparent);
    border-radius:var(--radius-md);
    font-size:var(--font-size-base); color:var(--text-primary);
    transition:var(--motion);
  }
  .chat-search:focus{ border-color:var(--accent); background:var(--bg-card); outline:none; }

  /* 会话列表项 */
  .chat-list-item{
    display:flex; align-items:center; gap:12px; width:100%; text-align:left;
    background:var(--bg-card); border-radius:var(--radius-card);
    padding:12px 14px; margin-bottom:10px; cursor:pointer;
    box-shadow:var(--shadow-sm); transition:var(--motion); position:relative;
    border:1px solid transparent;
  }
  .chat-list-item:active{ transform:scale(var(--press-scale)); }
  .chat-list-avatar{
    width:48px; height:48px; border-radius:50%; flex-shrink:0; overflow:hidden;
    background:color-mix(in srgb, var(--accent-light) 50%, transparent);
    display:flex; align-items:center; justify-content:center; color:var(--accent-dark);
    box-shadow:var(--shadow-sm);
  }
  .chat-list-avatar-img{ width:100%; height:100%; background-size:cover; background-position:center; }
  .chat-list-avatar-fallback{ display:flex; align-items:center; justify-content:center; color:var(--accent-dark); }
  .chat-list-main{ flex:1; min-width:0; }
  .chat-list-row1{ display:flex; align-items:center; gap:6px; }
  .chat-list-title{
    font-size:var(--font-size-base); font-weight:600; color:var(--text-primary);
    flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .chat-list-time{ font-size:var(--font-size-small); color:var(--text-hint); flex-shrink:0; }
  .chat-list-row2{ display:flex; align-items:center; gap:8px; margin-top:4px; }
  .chat-list-preview{
    flex:1; min-width:0; font-size:var(--font-size-small); color:var(--text-secondary);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .chat-pin-mark{ color:var(--accent); flex-shrink:0; display:inline-flex; }
  .chat-mute-mark{ color:var(--text-hint); flex-shrink:0; display:inline-flex; }
  .chat-unread-badge{
    flex-shrink:0; min-width:18px; height:18px; padding:0 5px; border-radius:9px;
    background:var(--accent); color:var(--bubble-user-text);
    font-size:11px; font-weight:600; line-height:18px; text-align:center;
    box-shadow:var(--shadow-sm);
  }
  .chat-unread-badge.muted{ background:var(--text-hint); }

  /* 空状态 */
  .chat-empty-list{
    display:flex; flex-direction:column; align-items:center; justify-content:center;
    padding:64px 24px; gap:14px; color:var(--text-hint); text-align:center;
  }
  .chat-empty-list-icon{ opacity:0.5; }
  .chat-empty-list-text{ font-size:var(--font-size-small); }

  /* 聊天详情页 */
  .chat-header-info{ flex:1; min-width:0; display:flex; flex-direction:column; justify-content:center; }
  .chat-header-name{
    font-size:var(--font-size-base); font-weight:600; color:var(--text-primary);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
  }
  .chat-header-status{
    font-size:var(--font-size-small); color:var(--text-secondary);
    display:flex; align-items:center; gap:4px;
  }
  .chat-online-dot{ width:6px; height:6px; border-radius:50%; background:var(--accent); flex-shrink:0; }
  .chat-messages{
    flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch;
    padding:16px 12px; display:flex; flex-direction:column; gap:10px;
    position:relative;
  }
  .chat-messages::before{
    content:''; position:absolute; inset:0; z-index:0; pointer-events:none;
    background-image:var(--chat-wp-image, none);
    background-size:cover; background-position:center;
    opacity:var(--chat-wp-opacity, 0);
  }
  .chat-messages > *{ position:relative; z-index:1; }

  /* 气泡模式消息 */
  .chat-msg{ display:flex; flex-direction:column; max-width:80%; }
  .chat-msg.user{ align-self:flex-end; align-items:flex-end; }
  .chat-msg.ai{ align-self:flex-start; align-items:flex-start; }
  .chat-bubble{
    padding:10px 14px; border-radius:var(--bubble-radius);
    font-size:var(--font-size-base); line-height:1.5;
    word-break:break-word; white-space:pre-wrap;
  }
  .chat-msg.user .chat-bubble{
    background:var(--bubble-user-bg); color:var(--bubble-user-text);
    border-bottom-right-radius:var(--bubble-radius-tail);
  }
  .chat-msg.ai .chat-bubble{
    background:var(--bubble-ai-bg); color:var(--bubble-ai-text);
    border-bottom-left-radius:var(--bubble-radius-tail);
    box-shadow:var(--shadow-sm);
  }
  .chat-time{ font-size:var(--font-size-small); color:var(--text-hint); margin-top:4px; padding:0 4px; }
  .chat-image{
    max-width:200px; max-height:240px; border-radius:var(--radius-md);
    display:block; cursor:pointer; box-shadow:var(--shadow-sm);
  }
  .chat-quote{
    font-size:var(--font-size-small); color:var(--text-secondary);
    background:color-mix(in srgb, var(--text-hint) 12%, transparent);
    border-left:2px solid var(--accent);
    padding:4px 8px; margin-bottom:6px; border-radius:var(--radius-sm);
    white-space:pre-wrap; word-break:break-word;
  }
  .chat-local-hint{
    font-size:var(--font-size-small); color:var(--text-hint);
    margin-bottom:4px; padding:0 4px;
  }
  .chat-retry-btn{
    display:inline-flex; align-items:center; gap:4px;
    padding:6px 12px; border-radius:999px;
    background:color-mix(in srgb, var(--accent-light) 60%, transparent);
    color:var(--accent-dark); font-size:var(--font-size-small);
    transition:var(--motion);
  }
  .chat-retry-btn:active{ transform:scale(var(--press-scale)); }

  /* 对话模式（剧本式） */
  .chat-msg.dialog{ max-width:100%; align-self:stretch; flex-direction:row; align-items:baseline; gap:6px; padding:2px 4px; }
  .chat-msg.dialog .chat-bubble{ background:transparent; color:var(--text-primary); box-shadow:none; padding:0; border-radius:0; }
  .chat-msg.dialog.user{ align-self:stretch; align-items:baseline; }
  .chat-msg.dialog .chat-dialog-name{ font-weight:600; color:var(--accent-dark); flex-shrink:0; }
  .chat-msg.dialog .chat-time{ margin-top:0; margin-left:auto; padding-left:8px; }

  /* 空消息状态 */
  .chat-empty{
    flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:12px; color:var(--text-hint);
  }
  .chat-empty-icon{ opacity:0.4; }
  .chat-empty-text{ font-size:var(--font-size-small); }

  /* 输入区 */
  .chat-input-bar{
    flex-shrink:0; background:color-mix(in srgb,var(--bg-card) 92%,transparent);
    backdrop-filter:blur(var(--glass-blur)); -webkit-backdrop-filter:blur(var(--glass-blur));
    border-top:1px solid color-mix(in srgb,var(--text-hint) 16%,transparent);
    padding-bottom:calc(env(safe-area-inset-bottom,0px) + 0px);
  }
  .chat-quote-preview{
    display:flex; align-items:center; gap:8px;
    padding:8px 12px; background:color-mix(in srgb, var(--accent-light) 40%, transparent);
    border-bottom:1px solid color-mix(in srgb, var(--text-hint) 16%, transparent);
  }
  .chat-quote-preview-text{
    flex:1; min-width:0; font-size:var(--font-size-small); color:var(--text-secondary);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .chat-quote-preview-close{
    flex-shrink:0; width:24px; height:24px; border-radius:50%;
    background:transparent; color:var(--text-hint);
    display:flex; align-items:center; justify-content:center;
  }
  .chat-input-row{
    display:flex; align-items:flex-end; gap:8px;
    padding:8px 12px calc(env(safe-area-inset-bottom,0px) + 8px);
  }
  .chat-plus, .chat-send, .chat-more{
    flex-shrink:0; width:38px; height:38px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    transition:var(--motion);
  }
  .chat-plus{
    background:color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    color:var(--text-secondary);
  }
  .chat-plus:active{ transform:scale(var(--press-scale)); }
  .chat-send{
    background:var(--accent); color:var(--bubble-user-text);
  }
  .chat-send:active{ transform:scale(var(--press-scale)); }
  .chat-more{
    background:color-mix(in srgb,var(--accent-light) 50%,transparent);
    color:var(--accent-dark);
  }
  .chat-more:active{ transform:scale(var(--press-scale)); }
  .chat-input{
    flex:1; resize:none; border:1px solid color-mix(in srgb,var(--text-hint) 20%,transparent);
    border-radius:var(--radius-md); padding:10px 12px;
    font-size:var(--font-size-base); font-family:inherit; color:var(--text-primary);
    background:var(--bg-secondary); max-height:96px; line-height:1.4;
    transition:var(--motion);
  }
  .chat-input::placeholder{ color:var(--text-hint); }
  .chat-input:focus{ outline:none; border-color:var(--accent); background:var(--bg-card); }

  /* 打字呼吸气泡 */
  .chat-typing{
    align-self:flex-start; display:flex; align-items:center; gap:4px;
    padding:14px 18px; background:var(--bubble-ai-bg);
    border-radius:var(--bubble-radius); border-bottom-left-radius:var(--bubble-radius-tail);
    box-shadow:var(--shadow-sm);
  }
  .chat-typing-dot{
    width:7px; height:7px; border-radius:50%; background:var(--text-hint);
    animation:chatTypingBreathe 1.2s ease-in-out infinite;
  }
  .chat-typing-dot:nth-child(2){ animation-delay:0.2s; }
  .chat-typing-dot:nth-child(3){ animation-delay:0.4s; }
  @keyframes chatTypingBreathe{
    0%,60%,100%{ opacity:0.3; transform:scale(0.7); }
    30%{ opacity:1; transform:scale(1); }
  }
  .chat-cursor{
    display:inline-block; width:2px; height:1em; background:currentColor;
    margin-left:1px; vertical-align:text-bottom;
    animation:chatCursorBlink 1s step-end infinite; opacity:0.6;
  }
  @keyframes chatCursorBlink{ 50%{ opacity:0; } }

  /* 操作菜单（bottomSheet 内容） */
  .chat-action-list{ display:flex; flex-direction:column; gap:4px; }
  .chat-action-item{
    display:flex; align-items:center; gap:12px; padding:14px 12px;
    border-radius:var(--radius-md); cursor:pointer;
    transition:var(--motion); background:transparent; color:var(--text-primary);
    border:1px solid transparent; width:100%; text-align:left;
    font-size:var(--font-size-base); font-family:inherit;
  }
  .chat-action-item:active{ transform:scale(var(--press-scale)); background:color-mix(in srgb, var(--accent-light) 30%, transparent); }
  .chat-action-item.danger{ color:#E8888C; }
  .chat-action-item .popo-icon{ color:inherit; flex-shrink:0; }

  /* 角色选择列表 */
  .chat-char-list{ display:flex; flex-direction:column; gap:4px; }
  .chat-char-item{
    display:flex; align-items:center; gap:12px; padding:12px;
    border-radius:var(--radius-md); cursor:pointer;
    transition:var(--motion); background:transparent;
    border:1px solid transparent;
  }
  .chat-char-item:active{ transform:scale(var(--press-scale)); }
  .chat-char-avatar{
    border-radius:50%; background:color-mix(in srgb, var(--accent-light) 50%, transparent);
    display:flex; align-items:center; justify-content:center;
    color:var(--accent-dark); flex-shrink:0; overflow:hidden;
  }
  .chat-char-info{ flex:1; min-width:0; }
  .chat-char-name{ font-size:var(--font-size-base); font-weight:600; color:var(--text-primary); }
  .chat-char-persona{
    font-size:var(--font-size-small); color:var(--text-secondary);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;
  }
  .chat-char-exists{ color:var(--text-hint); display:flex; align-items:center; flex-shrink:0; }

  /* 背景设置表单 */
  .chat-wallpaper-form{ display:flex; flex-direction:column; gap:14px; }
  .chat-form-row{ display:flex; flex-direction:column; gap:6px; }
  .chat-form-label{ font-size:var(--font-size-small); color:var(--text-secondary); }
  .chat-wp-preview{
    width:100%; height:120px; border-radius:var(--radius-md);
    background-size:cover; background-position:center;
    border:1px solid color-mix(in srgb, var(--text-hint) 20%, transparent);
  }
  .chat-wallpaper-actions{ display:flex; gap:10px; margin-top:4px; }
  .chat-wallpaper-actions .btn{ flex:1; justify-content:center; }

  @media (prefers-reduced-motion:reduce){
    .chat-typing-dot, .chat-cursor{ animation-duration:0.01ms!important; }
  }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  state.containerEl = container;
  state.view = 'list';
  state.currentSessionId = null;
  state.currentSession = null;
  state.currentCharacter = null;
  state.isReplying = false;
  state.streamCancelled = false;
  state.lastReply = null;
  state.pendingQuote = null;
  state.localModeHintedSessions = new Set();
  state.lastSearchKeyword = '';

  // 草稿防抖（800ms 写入 DB）
  state.saveDraftDebounced = debounce(() => { flushDraft(); }, 800);

  // 监听消息中心事件：在列表页时自动刷新（AI 在后台回复完时列表能更新）
  const onMsgReceived = () => {
    if (state.view === 'list') renderSessionListItems(state.lastSearchKeyword);
  };
  bus.on('chat:message-received', onMsgReceived);
  state.busListeners.push(['chat:message-received', onMsgReceived]);

  // 旧数据迁移：把没有 sessionId 的消息归到按角色生成的会话里
  await maybeMigrateLegacyMessages();

  await render();
  applyAppBg(container, 'chat');
}

export function unmount() {
  // 清掉流式定时器 + abort，避免组件卸载后还在跑
  if (state.typingTimer) { clearTimeout(state.typingTimer); state.typingTimer = null; }
  cancelStreaming();
  // 落盘草稿
  try { if (state.saveDraftDebounced) state.saveDraftDebounced.cancel?.(); } catch (e) {}
  flushDraft();

  // 解绑 bus
  state.busListeners.forEach(([name, fn]) => bus.off(name, fn));
  state.busListeners = [];

  state.containerEl = null;
  state.messageListEl = null;
  state.inputEl = null;
  state.sendBtnEl = null;
  state.currentSession = null;
  state.currentCharacter = null;
  state.typingIndicatorEl = null;
}

// ════════════════════════════════════════
// 旧数据迁移：首次升级到会话版时，给每个有消息的角色建一个会话
// ════════════════════════════════════════

async function maybeMigrateLegacyMessages() {
  let sessions = [];
  try { sessions = await getAllDB(STORES.chatSessions); } catch (e) { return; }
  if (sessions.length > 0) return; // 已经有会话了，不迁移

  let messages = [];
  try { messages = await getAllDB(STORES.messages); } catch (e) { return; }
  if (!messages.length) return;

  // 按 characterId 分组
  const byChar = new Map();
  for (const m of messages) {
    const cid = m.characterId || 'unknown';
    if (!byChar.has(cid)) byChar.set(cid, []);
    byChar.get(cid).push(m);
  }

  // 每个角色建一个会话，把消息归进去
  for (const [cid, msgs] of byChar) {
    let char = null;
    try { char = await getDB(STORES.characters, cid); } catch (e) {}
    const sessionId = generateId('sess');
    const sorted = msgs.slice().sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt));
    const lastMsg = sorted[sorted.length - 1];
    const now = getNow();
    const session = {
      id: sessionId,
      characterId: cid,
      title: char?.name || char?.nickname || '聊天',
      pinned: false,
      muted: false,
      draft: '',
      unread: 0,
      wallpaper: null,
      lastMessage: (lastMsg?.content || '').slice(0, 60),
      lastAt: lastMsg?.timestamp || lastMsg?.createdAt || now
    };
    try { await setDB(STORES.chatSessions, sessionId, session); } catch (e) {}
    // 给旧消息补 sessionId + type
    for (const m of sorted) {
      if (!m.sessionId || !m.type) {
        try {
          await setDB(STORES.messages, m.id, { ...m, sessionId: m.sessionId || sessionId, type: m.type || 'text' });
        } catch (e) {}
      }
    }
  }
}

// ════════════════════════════════════════
// 视图调度
// ════════════════════════════════════════

export async function render() {
  if (!state.containerEl) return;
  if (state.view === 'list') {
    await renderSessionListPage(state.lastSearchKeyword);
  } else if (state.view === 'chat') {
    await renderChatDetailView();
  }
}

/** 进入某个会话的聊天详情 */
export async function enterChat(sessionId) {
  if (!sessionId) return;
  // 先落盘当前草稿（如果在别的会话里）
  await flushDraft();
  // 切会话前先停掉旧会话的流式（避免两段对话交叉）
  if (state.typingTimer) { clearTimeout(state.typingTimer); state.typingTimer = null; }
  cancelStreaming();
  state.streamCancelled = false;

  // 读会话
  let session = null;
  try { session = await getDB(STORES.chatSessions, sessionId); } catch (e) {}
  if (!session) {
    showToast('会话不见了，可能被删掉了', 'error');
    state.view = 'list';
    await render();
    return;
  }

  state.view = 'chat';
  state.currentSessionId = sessionId;
  state.currentSession = session;
  state.currentCharacterId = session.characterId;
  setData(KEYS.chatCurrentCharacter, session.characterId);

  // 进入即清未读
  if ((session.unread || 0) > 0) {
    try { await setDB(STORES.chatSessions, sessionId, { ...session, unread: 0 }); } catch (e) {}
  }

  // 缓存角色
  state.currentCharacter = null;
  try { state.currentCharacter = await getDB(STORES.characters, session.characterId); } catch (e) {}

  await render();
}

/** 返回会话列表 */
export async function backToSessionList() {
  // 落盘草稿
  await flushDraft();
  // 不取消进行中的流式——让 AI 在后台跑完，消息中心也能收到
  state.view = 'list';
  state.currentSessionId = null;
  state.currentSession = null;
  state.currentCharacter = null;
  state.pendingQuote = null;
  await render();
}

/** 刷新会话列表项（操作后调用） */
export async function refreshSessionList() {
  if (state.view === 'list') {
    await renderSessionListItems(state.lastSearchKeyword);
  }
}
