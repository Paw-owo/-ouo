// apps/chat/index.js
// 聊天 App——软萌少女风格 PWA「泡泡」完整版。
// 我把每个和她聊过的小角落都收在会话列表里，点一下就能继续聊下去。
// 支持：会话列表/搜索/置顶/免打扰、气泡/对话双模式、文字+图片消息、
//   AI 流式回复（含本地兜底+失败重试+取消）、长按消息操作、聊天背景、导出/清空记录。
// 存储：STORES.chatSessions（会话）+ STORES.messages（消息）。
// 红线：图标只准 SVG 线稿，禁止任何 emoji 字符；视觉值走 CSS 变量；全中文注释。

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, setData, getDB, setDB, deleteDB, getAllDB, generateId, getNow, compressImage } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon, showAlert } from '../../core/ui.js';
import bus from '../../core/events.js';
import { formatTime, formatRelative, injectStyle, clamp, debounce, isUsableImage, cssUrl, pickImageFile } from '../../core/util.js';
import { streamChat, buildMessages, isAIConfigured } from '../../core/ai-client.js';
import { buildMemoryPrompt, recordInteraction } from '../../core/memory.js';
import { getRecentEventsPrompt } from '../../core/inbox.js';
import { applyAppBg } from '../../core/app-bg.js';
import { renderSessionListPage, renderSessionListItems } from './session-list.js';
import { openMessageActionSheet, openChatMoreMenu } from './message-actions.js';
import { getLocalReply, pickReplyCategory, inferMood, inferImportance } from './local-replies.js';

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

// ════════════════════════════════════════
// 聊天详情页渲染
// ════════════════════════════════════════

async function renderChatDetailView() {
  const container = state.containerEl;
  const session = state.currentSession;
  if (!container || !session) {
    state.view = 'list';
    await render();
    return;
  }

  const mode = getData(KEYS.chatMode, 'bubble');
  const charName = state.currentCharacter?.name || state.currentCharacter?.nickname || session.title || '聊天';

  container.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="chat-back" aria-label="返回会话列表">${createIcon('back', 20).outerHTML}</button>
      <div class="chat-header-info">
        <div class="chat-header-name" id="chat-header-name">${escapeHTML(charName)}</div>
        <div class="chat-header-status">
          <span class="chat-online-dot" aria-hidden="true"></span>
          <span id="chat-header-status-text">在线</span>
        </div>
      </div>
      <button class="chat-more" id="chat-more" aria-label="聊天设置">${createIcon('more', 20).outerHTML}</button>
    </div>
    <div class="chat-messages" id="chat-messages" data-mode="${escapeAttr(mode)}"></div>
    <div class="chat-input-bar">
      <div class="chat-quote-preview" id="chat-quote-preview" style="display:none">
        <div class="chat-quote-preview-text" id="chat-quote-preview-text"></div>
        <button class="chat-quote-preview-close" id="chat-quote-close" aria-label="取消引用">${createIcon('close', 16).outerHTML}</button>
      </div>
      <div class="chat-input-row">
        <button class="chat-plus" id="chat-plus" aria-label="发送图片">${createIcon('plus', 20).outerHTML}</button>
        <textarea class="chat-input" id="chat-input" placeholder="说点什么吧..." rows="1" enterkeyhint="send" aria-label="输入消息"></textarea>
        <button class="chat-send" id="chat-send" aria-label="发送">${createIcon('check', 20).outerHTML}</button>
      </div>
    </div>
  `;

  // 缓存元素引用
  state.messageListEl = container.querySelector('#chat-messages');
  state.inputEl = container.querySelector('#chat-input');
  state.sendBtnEl = container.querySelector('#chat-send');

  // 绑定事件
  container.querySelector('#chat-back').addEventListener('click', backToSessionList);
  container.querySelector('#chat-more').addEventListener('click', openChatMoreMenu);
  container.querySelector('#chat-plus').addEventListener('click', openInputPlusMenu);
  state.sendBtnEl.addEventListener('click', onSendClick);
  state.inputEl.addEventListener('keydown', onInputKeyDown);
  state.inputEl.addEventListener('input', onInputChanged);
  container.querySelector('#chat-quote-close').addEventListener('click', () => clearQuote());

  // 应用壁纸
  applySessionWallpaper();

  // 恢复草稿 + 引用
  if (session.draft) state.inputEl.value = session.draft;
  if (state.pendingQuote) showQuotePreview(state.pendingQuote);
  autoResizeInput();

  // 加载消息
  await loadAndRenderMessages();
}

async function loadAndRenderMessages() {
  if (!state.messageListEl) return;
  const session = state.currentSession;
  if (!session) return;

  let messages = [];
  try {
    const all = await getAllDB(STORES.messages);
    messages = all.filter((m) => m.sessionId === session.id || (!m.sessionId && m.characterId === session.characterId));
  } catch (e) {
    console.warn('[chat] 读取消息失败', e);
    showToast('消息读不出来嘛，等一下再试试', 'error');
  }
  messages.sort((a, b) => {
    const ta = new Date(a.timestamp || a.createdAt || 0).getTime();
    const tb = new Date(b.timestamp || b.createdAt || 0).getTime();
    return ta - tb;
  });

  state.messageListEl.innerHTML = '';
  if (messages.length === 0) {
    renderEmptyState();
    updateChatHeader(null);
    return;
  }
  messages.forEach((msg) => appendMessageEl(msg));
  updateChatHeader(messages[messages.length - 1].timestamp || messages[messages.length - 1].createdAt);
  scrollToBottom();
}

function renderEmptyState() {
  if (!state.messageListEl) return;
  const charName = state.currentCharacter?.name || state.currentCharacter?.nickname || '她';
  state.messageListEl.innerHTML = `
    <div class="chat-empty">
      <div class="chat-empty-icon">${createIcon('chat', 48).outerHTML}</div>
      <div class="chat-empty-text">${escapeHTML(charName)}还在等你说话呢，发一条试试嘛</div>
    </div>
  `;
}

function updateChatHeader(lastMsgTime) {
  if (!state.containerEl) return;
  const statusEl = state.containerEl.querySelector('#chat-header-status-text');
  if (statusEl) {
    statusEl.textContent = lastMsgTime ? `在线 · ${formatRelative(lastMsgTime)}` : '在线';
  }
}

// ════════════════════════════════════════
// 消息渲染
// ════════════════════════════════════════

function appendMessageEl(msg, opts = {}) {
  if (!state.messageListEl) return null;
  const empty = state.messageListEl.querySelector('.chat-empty');
  if (empty) empty.remove();
  const el = createMessageEl(msg, opts);
  state.messageListEl.appendChild(el);
  return el;
}

function createMessageEl(msg, opts = {}) {
  const mode = getData(KEYS.chatMode, 'bubble');
  const isUser = msg.role === 'user';
  const isImage = msg.type === 'image';
  const el = document.createElement('div');

  if (mode === 'dialog') {
    // 对话模式：剧本式，每行"我：xxx" / "角色名：xxx"
    el.className = `chat-msg dialog ${isUser ? 'user' : 'ai'}`;
    el.dataset.id = msg.id;
    const name = isUser ? '我' : (state.currentCharacter?.name || state.currentCharacter?.nickname || '她');
    let inner;
    if (isImage) {
      const safeUrl = String(msg.mediaUrl || '').replace(/"/g, '&quot;');
      inner = `<img class="chat-image" src="${safeUrl}" alt="图片" loading="lazy">`;
    } else {
      inner = opts.stream ? '' : escapeHTML(msg.content || '');
    }
    el.innerHTML = `
      <span class="chat-dialog-name">${escapeHTML(name)}：</span>
      <span class="chat-bubble">${inner}</span>
      <span class="chat-time">${escapeHTML(formatTime(msg.timestamp || msg.createdAt))}</span>
    `;
    // 长按操作
    attachLongPress(el, () => openMessageActionSheet(msg));
    return el;
  }

  // 气泡模式（默认）
  el.className = `chat-msg ${isUser ? 'user' : 'ai'}`;
  el.dataset.id = msg.id;
  const content = opts.stream ? '' : (msg.content || '');
  let bubbleInner = '';
  if (msg.quote) {
    bubbleInner += `<div class="chat-quote">引用：${escapeHTML(msg.quote)}</div>`;
  }
  if (isImage) {
    const safeUrl = String(msg.mediaUrl || '').replace(/"/g, '&quot;');
    bubbleInner += `<img class="chat-image" src="${safeUrl}" alt="图片" loading="lazy">`;
    if (content) bubbleInner += escapeHTML(content);
  } else {
    bubbleInner += escapeHTML(content);
  }
  el.innerHTML = `
    <div class="chat-bubble">${bubbleInner}</div>
    <div class="chat-time">${escapeHTML(formatTime(msg.timestamp || msg.createdAt))}</div>
  `;
  // 图片点击查看大图（用 alert 简化）
  if (isImage) {
    const img = el.querySelector('.chat-image');
    if (img) img.addEventListener('click', () => openImagePreview(msg.mediaUrl));
  }
  // 长按操作
  attachLongPress(el, () => openMessageActionSheet(msg));
  return el;
}

function openImagePreview(url) {
  if (!url) return;
  const body = document.createElement('div');
  body.style.cssText = 'display:flex;justify-content:center;padding:8px';
  body.innerHTML = `<img src="${escapeAttr(url)}" alt="图片" style="max-width:100%;max-height:60vh;border-radius:var(--radius-md);">`;
  showBottomSheet({ title: '查看图片', bodyElement: body, dismissible: true });
}

// ════════════════════════════════════════
// 输入区：自适应高度 / 草稿 / 引用
// ════════════════════════════════════════

function onInputChanged() {
  autoResizeInput();
  // 草稿防抖保存
  if (state.saveDraftDebounced) state.saveDraftDebounced();
}

function autoResizeInput() {
  if (!state.inputEl) return;
  state.inputEl.style.height = 'auto';
  const h = clamp(state.inputEl.scrollHeight, 0, 96);
  state.inputEl.style.height = h + 'px';
}

function onInputKeyDown(e) {
  // 回车发送，Shift+回车换行；回复中不拦截
  if (e.key === 'Enter' && !e.shiftKey && !state.isReplying) {
    e.preventDefault();
    sendMessage();
  }
}

async function flushDraft() {
  if (!state.inputEl || !state.currentSession) return;
  const draft = state.inputEl.value || '';
  const session = state.currentSession;
  if ((session.draft || '') === draft) return;
  try {
    const cur = await getDB(STORES.chatSessions, session.id) || session;
    await setDB(STORES.chatSessions, session.id, { ...cur, draft });
    state.currentSession = { ...cur, draft };
  } catch (e) {
    console.warn('[chat] 草稿保存失败', e);
  }
}

/** 设置引用：在输入框上方显示引用预览，下一条消息会带上 quote 字段 */
export function setQuoteToInput(text) {
  state.pendingQuote = String(text || '').slice(0, 80);
  showQuotePreview(state.pendingQuote);
  try { state.inputEl?.focus(); } catch (e) {}
}

function showQuotePreview(text) {
  const previewEl = state.containerEl?.querySelector('#chat-quote-preview');
  const textEl = state.containerEl?.querySelector('#chat-quote-preview-text');
  if (previewEl && textEl) {
    textEl.textContent = `引用：${text}`;
    previewEl.style.display = 'flex';
  }
}

function clearQuote() {
  state.pendingQuote = null;
  const previewEl = state.containerEl?.querySelector('#chat-quote-preview');
  if (previewEl) previewEl.style.display = 'none';
}

// ════════════════════════════════════════
// 发送按钮 / + 菜单
// ════════════════════════════════════════

function onSendClick() {
  if (state.isReplying) {
    // 回复中点一下 = 取消
    cancelStreaming();
  } else {
    sendMessage();
  }
}

function openInputPlusMenu() {
  const body = document.createElement('div');
  body.className = 'chat-action-list';
  body.innerHTML = `
    <button class="chat-action-item" data-key="image" role="menuitem">
      ${createIcon('camera', 20).outerHTML}
      <span>发图片</span>
    </button>
  `;
  const sheet = showBottomSheet({ title: '选择发送内容', bodyElement: body, dismissible: true });
  body.querySelector('[data-key="image"]').addEventListener('click', () => {
    sheet.close();
    sendImageMessage();
  });
}

// ════════════════════════════════════════
// 发送消息（文字）
// ════════════════════════════════════════

async function sendMessage() {
  if (!state.inputEl || !state.messageListEl) return;
  if (state.isReplying) return;
  const text = state.inputEl.value.trim();
  if (!text) return;

  // 取出引用（发送后清空）
  const quote = state.pendingQuote || null;
  clearQuote();

  // 清空输入框并重置高度
  state.inputEl.value = '';
  autoResizeInput();
  // 落盘空草稿（覆盖旧草稿）
  if (state.saveDraftDebounced) state.saveDraftDebounced.cancel?.();
  await flushDraft();

  const session = state.currentSession;
  if (!session) return;

  const userMsg = {
    id: generateId('msg'),
    sessionId: session.id,
    characterId: session.characterId,
    role: 'user',
    content: text,
    type: 'text',
    quote,
    timestamp: getNow()
  };
  try {
    await setDB(STORES.messages, userMsg.id, userMsg);
  } catch (e) {
    console.warn('[chat] 保存用户消息失败', e);
    showToast('消息没发出去，再试一下嘛', 'error');
    return;
  }

  // 渲染用户消息
  appendMessageEl(userMsg);
  updateChatHeader(userMsg.timestamp);
  scrollToBottom();

  // 更新会话 lastMessage/lastAt
  await bumpSession(session, text.slice(0, 60), userMsg.timestamp);

  // 通知其他 App：用户发消息了
  bus.emit('chat:user-message', {
    characterId: session.characterId,
    sessionId: session.id,
    preview: text.slice(0, 60)
  });

  // 触发 AI 回复
  await triggerAIReply(userMsg);
}

// ════════════════════════════════════════
// 发送图片消息
// ════════════════════════════════════════

async function sendImageMessage() {
  if (state.isReplying) {
    showToast('等她回完再发图片嘛', 'default', 1400);
    return;
  }
  const session = state.currentSession;
  if (!session) return;

  let file;
  try {
    file = await pickImageFile('image/*');
  } catch (e) {
    // 用户取消，不报错
    return;
  }
  let dataURL = '';
  try {
    dataURL = await compressImage(file, { quality: 0.78, maxWidth: 1280, maxHeight: 1280 });
  } catch (e) {
    console.warn('[chat] 图片压缩失败', e);
    showToast('图片处理不出来嘛', 'error');
    return;
  }
  if (!dataURL) return;

  const userMsg = {
    id: generateId('msg'),
    sessionId: session.id,
    characterId: session.characterId,
    role: 'user',
    content: '[图片]',
    type: 'image',
    mediaUrl: dataURL,
    timestamp: getNow()
  };
  try {
    await setDB(STORES.messages, userMsg.id, userMsg);
  } catch (e) {
    console.warn('[chat] 保存图片消息失败', e);
    showToast('图片没发出去，再试一下嘛', 'error');
    return;
  }

  appendMessageEl(userMsg);
  updateChatHeader(userMsg.timestamp);
  scrollToBottom();
  await bumpSession(session, '[图片]', userMsg.timestamp);
  bus.emit('chat:user-message', {
    characterId: session.characterId,
    sessionId: session.id,
    preview: '[图片]'
  });

  await triggerAIReply(userMsg);
}

// ════════════════════════════════════════
// AI 回复（核心）
// ════════════════════════════════════════

async function triggerAIReply(userMsg) {
  const session = state.currentSession;
  // 兼容：若用户切走了会话，仍用闭包里的 session 继续
  const sess = session || null;
  if (!sess) return;

  setReplying(true);
  state.streamCancelled = false;
  showTypingIndicator();
  scrollToBottom();

  // 读角色
  let character = state.currentCharacter;
  if (!character || character.id !== sess.characterId) {
    try { character = await getDB(STORES.characters, sess.characterId); } catch (e) {}
    if (state.currentSessionId === sess.id) state.currentCharacter = character;
  }

  // 历史消息（最近 20 条）
  let history = [];
  try {
    const all = await getAllDB(STORES.messages);
    history = all
      .filter((m) => m.sessionId === sess.id || (!m.sessionId && m.characterId === sess.characterId))
      .sort((a, b) => new Date(a.timestamp || a.createdAt) - new Date(b.timestamp || b.createdAt))
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content || '' }));
  } catch (e) {}

  // 记忆 + 最近事件
  let memoryPrompt = '';
  try { memoryPrompt = await buildMemoryPrompt(sess.characterId, { limit: 20 }); } catch (e) {}
  let recentEvents = '';
  try { recentEvents = getRecentEventsPrompt(8); } catch (e) {}

  const messages = buildMessages({
    character,
    history,
    userText: userMsg.type === 'image' ? '（用户发了一张图片）' : userMsg.content,
    memoryPrompt,
    recentEvents
  });

  // 隐藏呼吸气泡，建空气泡
  hideTypingIndicator();
  const aiMsg = {
    id: generateId('msg'),
    sessionId: sess.id,
    characterId: sess.characterId,
    role: 'assistant',
    content: '',
    type: 'text',
    timestamp: getNow()
  };
  const msgEl = appendMessageEl(aiMsg, { stream: true });
  const bubbleEl = msgEl.querySelector('.chat-bubble');

  // 本地模式提示：每个会话首次只提示一次
  if (!isAIConfigured() && !state.localModeHintedSessions.has(sess.id)) {
    state.localModeHintedSessions.add(sess.id);
    const hint = document.createElement('div');
    hint.className = 'chat-local-hint';
    hint.textContent = '（本地模式，配置 AI 接口后回复更自然）';
    if (msgEl.firstChild) msgEl.insertBefore(hint, msgEl.firstChild);
    else msgEl.appendChild(hint);
  }

  let accText = '';

  // ── 走 AI 流式 ──
  if (isAIConfigured()) {
    const result = await runAIStream(bubbleEl, messages, sess, () => accText, (t) => { accText = t; });
    if (result.ok) {
      await finishAIMessage(sess, character, aiMsg, msgEl, bubbleEl, accText, userMsg);
      return;
    }
    if (result.reason === 'not_configured') {
      // 配置中途被改了，走本地兜底
    } else if (result.reason === 'cancelled') {
      // 用户取消，保留已流式部分（若有）
      await finishAIMessage(sess, character, aiMsg, msgEl, bubbleEl, accText, userMsg);
      return;
    } else {
      // fetch_failed 且用户没点重试（关掉了），保留空气泡或移除
      if (!accText && msgEl.isConnected) {
        msgEl.remove();
      } else {
        await finishAIMessage(sess, character, aiMsg, msgEl, bubbleEl, accText, userMsg);
      }
      setReplying(false);
      return;
    }
  }

  // ── 本地兜底 ──
  const replyText = getLocalReply(userMsg.content, state.lastReply, { isImage: userMsg.type === 'image' });
  state.lastReply = replyText;
  accText = await streamLocalReply(bubbleEl, replyText);
  await finishAIMessage(sess, character, aiMsg, msgEl, bubbleEl, accText, userMsg);
}

/**
 * 跑一次 AI 流式请求。失败时在气泡里显示重试按钮，等用户决定。
 * @returns {Promise<{ok:boolean, reason?:string}>}
 */
async function runAIStream(bubbleEl, messages, sess, getAcc, setAcc) {
  while (true) {
    state.abortController = new AbortController();
    let acc = '';
    setAcc('');
    if (bubbleEl.isConnected) {
      bubbleEl.innerHTML = '<span class="chat-cursor"></span>';
    }
    const result = await streamChat({
      messages,
      onToken: (delta) => {
        acc += delta;
        setAcc(acc);
        if (bubbleEl.isConnected) {
          bubbleEl.innerHTML = escapeHTML(acc) + '<span class="chat-cursor"></span>';
          scrollToBottom();
        }
      },
      signal: state.abortController.signal
    });
    state.abortController = null;

    if (result.ok) {
      // 流式期间被取消（abort）但 ok=true 的情况，acc 可能不完整，仍按已完成处理
      return { ok: true };
    }
    if (result.reason === 'not_configured') {
      return { ok: false, reason: 'not_configured' };
    }
    if (state.streamCancelled) {
      return { ok: false, reason: 'cancelled' };
    }
    if (result.reason === 'fetch_failed') {
      // 免打扰会话不弹 toast
      if (!sess.muted) showToast('AI 暂时联系不上，等会再试嘛', 'error');
      // 在气泡里显示重试按钮，等用户决定
      const choice = await showRetryAndWait(bubbleEl);
      if (choice === 'retry') continue; // 再来一次
      return { ok: false, reason: 'cancelled' };
    }
    // 未知原因
    return { ok: false, reason: 'unknown' };
  }
}

/** 在空气泡里显示重试按钮，返回 Promise<'retry'|'dismiss'> */
function showRetryAndWait(bubbleEl) {
  return new Promise((resolve) => {
    if (!bubbleEl.isConnected) { resolve('dismiss'); return; }
    bubbleEl.innerHTML = `<button class="chat-retry-btn" type="button">${createIcon('back', 16).outerHTML}<span>重新联系</span></button>`;
    const btn = bubbleEl.querySelector('.chat-retry-btn');
    if (!btn) { resolve('dismiss'); return; }
    let done = false;
    const finish = (v) => { if (done) return; done = true; resolve(v); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); finish('retry'); });
    // 气泡被移除时也视为放弃
    const observer = new MutationObserver(() => {
      if (!bubbleEl.isConnected) { observer.disconnect(); finish('dismiss'); }
    });
    observer.observe(bubbleEl.parentNode || document.body, { childList: true });
  });
}

/** 本地兜底流式显示，返回最终显示的文本（可能被取消截断） */
function streamLocalReply(bubbleEl, fullText) {
  const chars = Array.from(fullText); // Array.from 正确处理 surrogate pair
  let i = 0;
  let acc = '';
  return new Promise((resolve) => {
    function tick() {
      // 被取消 / 组件已卸载 -> 直接结束
      if (state.streamCancelled || !state.containerEl) {
        if (bubbleEl.isConnected) bubbleEl.textContent = acc;
        resolve(acc);
        return;
      }
      if (i >= chars.length) {
        if (bubbleEl.isConnected) bubbleEl.textContent = fullText;
        resolve(fullText);
        return;
      }
      acc += chars[i];
      i++;
      if (bubbleEl.isConnected) {
        bubbleEl.innerHTML = escapeHTML(acc) + '<span class="chat-cursor"></span>';
        scrollToBottom();
      }
      state.typingTimer = setTimeout(tick, 50);
    }
    tick();
  });
}

/** AI 回复完成：保存、更新会话、emit 事件、写记忆 */
async function finishAIMessage(sess, character, aiMsg, msgEl, bubbleEl, finalText, userMsg) {
  // 没有任何文本（被取消且没流到字）-> 移除空气泡
  if (!finalText || !finalText.trim()) {
    if (msgEl.isConnected) msgEl.remove();
    setReplying(false);
    state.streamCancelled = false;
    return;
  }
  // 去掉光标，固定文本
  if (bubbleEl.isConnected) {
    bubbleEl.textContent = finalText;
  }
  aiMsg.content = finalText;
  try { await setDB(STORES.messages, aiMsg.id, aiMsg); } catch (e) {
    console.warn('[chat] 保存 AI 消息失败', e);
  }

  // 更新会话 lastMessage/lastAt + 未读（用户在当前会话则不增未读）
  const inThisChat = state.view === 'chat' && state.currentSessionId === sess.id;
  await bumpSession(sess, finalText.slice(0, 60), aiMsg.timestamp, inThisChat ? 0 : 1);
  if (inThisChat) updateChatHeader(aiMsg.timestamp);

  // 通知消息中心
  bus.emit('chat:message-received', {
    characterId: sess.characterId,
    characterName: character?.name || character?.nickname || '',
    preview: finalText.slice(0, 60),
    sessionId: sess.id
  });

  // 写长期记忆（来源 chat）
  try {
    const category = pickReplyCategory(userMsg.content || '');
    await recordInteraction({
      characterId: sess.characterId,
      role: 'assistant',
      source: 'chat',
      content: finalText,
      mood: inferMood(category),
      importance: inferImportance(category),
      relatedApp: 'chat',
      timestamp: aiMsg.timestamp
    });
  } catch (e) {
    console.warn('[chat] 记忆写入失败', e);
  }

  setReplying(false);
  state.streamCancelled = false;
}

/** 更新会话 lastMessage/lastAt，可选未读计数 */
async function bumpSession(sess, preview, timestamp, addUnread = 0) {
  try {
    const cur = await getDB(STORES.chatSessions, sess.id) || sess;
    const nextUnread = addUnread > 0 ? (cur.unread || 0) + addUnread : (state.view === 'chat' && state.currentSessionId === sess.id ? 0 : (cur.unread || 0));
    await setDB(STORES.chatSessions, sess.id, {
      ...cur,
      lastMessage: preview,
      lastAt: timestamp,
      unread: nextUnread
    });
    if (state.currentSessionId === sess.id) {
      state.currentSession = { ...cur, lastMessage: preview, lastAt: timestamp, unread: nextUnread };
    }
  } catch (e) {
    console.warn('[chat] 更新会话失败', e);
  }
}

// ════════════════════════════════════════
// 取消 / 打字呼吸气泡 / 发送按钮态
// ════════════════════════════════════════

function cancelStreaming() {
  state.streamCancelled = true;
  if (state.abortController) {
    try { state.abortController.abort(); } catch (e) {}
    state.abortController = null;
  }
}

function setReplying(replying) {
  state.isReplying = replying;
  if (state.sendBtnEl) {
    state.sendBtnEl.innerHTML = replying ? createIcon('pause', 20).outerHTML : createIcon('check', 20).outerHTML;
    state.sendBtnEl.setAttribute('aria-label', replying ? '停止回复' : '发送');
  }
}

function showTypingIndicator() {
  if (!state.messageListEl) return;
  hideTypingIndicator();
  state.typingIndicatorEl = document.createElement('div');
  state.typingIndicatorEl.className = 'chat-typing';
  state.typingIndicatorEl.setAttribute('aria-label', '她正在打字');
  state.typingIndicatorEl.innerHTML = `
    <div class="chat-typing-dot"></div>
    <div class="chat-typing-dot"></div>
    <div class="chat-typing-dot"></div>
  `;
  state.messageListEl.appendChild(state.typingIndicatorEl);
  scrollToBottom();
}

function hideTypingIndicator() {
  if (state.typingIndicatorEl && state.typingIndicatorEl.parentNode) {
    state.typingIndicatorEl.parentNode.removeChild(state.typingIndicatorEl);
  }
  state.typingIndicatorEl = null;
}

function scrollToBottom() {
  if (!state.messageListEl) return;
  // rAF 确保渲染完再滚
  requestAnimationFrame(() => {
    if (state.messageListEl) state.messageListEl.scrollTop = state.messageListEl.scrollHeight;
  });
}

// ════════════════════════════════════════
// 聊天背景（应用到当前 messageListEl）
// ════════════════════════════════════════

export function applySessionWallpaper() {
  if (!state.messageListEl) return;
  const wp = state.currentSession?.wallpaper;
  if (wp && wp.url && isUsableImage(wp.url)) {
    state.messageListEl.style.setProperty('--chat-wp-image', cssUrl(wp.url));
    state.messageListEl.style.setProperty('--chat-wp-opacity', String(clamp(Number(wp.opacity ?? 60), 0, 100) / 100));
  } else {
    state.messageListEl.style.removeProperty('--chat-wp-image');
    state.messageListEl.style.removeProperty('--chat-wp-opacity');
  }
}

// ════════════════════════════════════════
// 长按（消息用）
// ════════════════════════════════════════

function attachLongPress(el, handler) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  let moved = false;
  const LONG_PRESS_MS = 500;
  const MOVE_THRESHOLD = 10;

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    timer = setTimeout(() => {
      timer = null;
      // 长按触发后阻止 click
      moved = true;
      try { handler(e); } catch (err) { console.warn('[chat] longpress 失败', err); }
    }, LONG_PRESS_MS);
  };
  const onMove = (e) => {
    if (!timer) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
      moved = true;
      clearTimeout(timer);
      timer = null;
    }
  };
  const onUp = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };
  const onClickCapture = (e) => {
    if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; }
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('pointerleave', onUp);
  el.addEventListener('contextmenu', (e) => { if (!timer) e.preventDefault(); });
  el.addEventListener('click', onClickCapture, true);
}

// ════════════════════════════════════════
// 工具
// ════════════════════════════════════════

function escapeHTML(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) { return escapeHTML(s); }
