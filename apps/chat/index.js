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
import { renderChatDetailView, flushDraft, stopChatTTS, refreshAvatar } from './detail-view.js';
import { cancelStreaming } from './sending.js';
import { cleanupExtras } from './extras.js';

// re-export 给 message-actions.js / session-list.js 等子文件用（保持原 import 路径不变）
export { applySessionWallpaper } from './wallpaper.js';
export { setQuoteToInput } from './detail-view.js';
// 增强模块：转发 / 已读回执 / 表情面板 / 语音 / 页内搜索 / 引用定位
export { openForwardSheet, markUserMessagesRead, scrollToMessageAndHighlight } from './extras.js';

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
  /* 草稿预览：[草稿] 前缀用 accent 色，正文用 hint 色 */
  .chat-list-draft-tag{ color:var(--accent); font-weight:600; margin-right:4px; }
  .chat-list-draft-text{ color:var(--text-hint); }
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

  /* 气泡模式消息——chat-msg-row 包含 头像+主区，仿微信/QQ 气泡布局 */
  .chat-msg-row{
    display:flex; flex-direction:row; align-items:flex-start;
    gap:8px; max-width:100%; margin-bottom:2px;
  }
  .chat-msg-row.user{ flex-direction:row-reverse; align-self:flex-end; }
  .chat-msg-row.ai{ align-self:flex-start; }
  /* 头像 */
  .chat-avatar{
    width:36px; height:36px; border-radius:50%; flex-shrink:0; overflow:hidden;
    background:color-mix(in srgb, var(--accent-light) 50%, transparent);
    display:flex; align-items:center; justify-content:center; color:var(--accent-dark);
    box-shadow:var(--shadow-sm);
  }
  .chat-avatar-img{ width:100%; height:100%; background-size:cover; background-position:center; }
  .chat-avatar-fallback{ display:flex; align-items:center; justify-content:center; color:var(--accent-dark); }
  /* 主区：昵称 + 气泡 + meta（状态/时间） */
  .chat-msg-main{
    display:flex; flex-direction:column; max-width:70%; min-width:0;
  }
  .chat-msg-row.user .chat-msg-main{ align-items:flex-end; }
  .chat-msg-row.ai .chat-msg-main{ align-items:flex-start; }
  .chat-nickname{
    font-size:var(--font-size-small); color:var(--text-hint);
    margin:0 4px 2px; line-height:1.2;
  }
  /* 气泡 */
  .chat-bubble{
    padding:10px 14px; border-radius:var(--bubble-radius);
    font-size:var(--font-size-base); line-height:1.5;
    word-break:break-word;
    position:relative;
    /* 取消 pre-wrap，让 markdown 控制换行；纯文本仍可换行 */
    white-space:normal;
  }
  .chat-msg-row.user .chat-bubble{
    background:var(--bubble-user-bg); color:var(--bubble-user-text);
    border-bottom-right-radius:var(--bubble-radius-tail);
  }
  .chat-msg-row.ai .chat-bubble{
    background:var(--bubble-ai-bg); color:var(--bubble-ai-text);
    border-bottom-left-radius:var(--bubble-radius-tail);
    box-shadow:var(--shadow-sm);
  }
  /* 气泡尾巴：AI 左下角小三角 */
  .chat-msg-row.ai .chat-bubble::before{
    content:''; position:absolute; left:-6px; bottom:6px;
    width:0; height:0; border-style:solid; border-width:6px 6px 6px 0;
    border-color:transparent var(--bubble-ai-bg) transparent transparent;
    pointer-events:none;
  }
  /* 用户右下角小三角 */
  .chat-msg-row.user .chat-bubble::after{
    content:''; position:absolute; right:-6px; bottom:6px;
    width:0; height:0; border-style:solid; border-width:6px 0 6px 6px;
    border-color:transparent transparent transparent var(--bubble-user-bg);
    pointer-events:none;
  }
  /* meta 区：状态图标 + 时间 */
  .chat-meta{
    display:flex; align-items:center; gap:4px;
    margin-top:3px; padding:0 4px;
    min-height:14px;
  }
  .chat-time{ font-size:var(--font-size-small); color:var(--text-hint); }
  .chat-image{
    max-width:200px; max-height:240px; border-radius:var(--radius-md);
    display:block; cursor:pointer; box-shadow:var(--shadow-sm);
  }

  /* 消息状态图标 */
  .chat-status-sending{
    display:inline-block; width:12px; height:12px;
    border:1.5px solid var(--text-hint); border-top-color:transparent;
    border-radius:50%;
    animation:chatStatusSpin 0.8s linear infinite;
  }
  @keyframes chatStatusSpin{ to{ transform:rotate(360deg); } }
  .chat-status-sent{ color:var(--text-hint); display:inline-flex; }
  .chat-status-failed{
    color:var(--danger); display:inline-flex; cursor:pointer;
    padding:2px; border-radius:50%;
    transition:var(--motion);
  }
  .chat-status-failed:active{ transform:scale(var(--press-scale)); background:color-mix(in srgb, var(--danger) 18%, transparent); }

  /* 撤回消息占位 */
  .chat-recalled-hint{
    align-self:center; text-align:center;
    font-size:var(--font-size-small); color:var(--text-hint);
    background:color-mix(in srgb, var(--text-hint) 12%, transparent);
    padding:4px 12px; border-radius:var(--radius-md);
    margin:6px auto;
  }

  /* 时间分组分隔条 */
  .chat-time-divider{
    align-self:center; text-align:center;
    font-size:var(--font-size-small); color:var(--text-hint);
    background:color-mix(in srgb, var(--text-hint) 14%, transparent);
    padding:3px 12px; border-radius:999px;
    margin:8px auto 4px;
  }

  /* ── Markdown 样式 ── */
  .chat-bubble .md-p{ margin:0 0 6px; }
  .chat-bubble .md-p:last-child{ margin-bottom:0; }
  .chat-bubble .md-h{ font-weight:600; margin:6px 0 4px; line-height:1.3; }
  .chat-bubble .md-h1{ font-size:1.2em; }
  .chat-bubble .md-h2{ font-size:1.12em; }
  .chat-bubble .md-h3{ font-size:1.06em; }
  .chat-bubble .md-h4,
  .chat-bubble .md-h5,
  .chat-bubble .md-h6{ font-size:1em; }
  .chat-bubble .md-pre{
    background:color-mix(in srgb, var(--text-primary) 8%, transparent);
    border:1px solid color-mix(in srgb, var(--text-hint) 18%, transparent);
    border-radius:var(--radius-sm);
    padding:10px 12px; margin:6px 0;
    overflow-x:auto; -webkit-overflow-scrolling:touch;
    font-family:var(--font-mono, ui-monospace, 'SF Mono', Menlo, Consolas, monospace);
    font-size:0.92em; line-height:1.5;
  }
  .chat-bubble .md-code-block{
    font-family:var(--font-mono, ui-monospace, 'SF Mono', Menlo, Consolas, monospace);
    white-space:pre; color:var(--text-primary); background:transparent;
    padding:0;
  }
  .chat-bubble .md-code{
    font-family:var(--font-mono, ui-monospace, 'SF Mono', Menlo, Consolas, monospace);
    background:color-mix(in srgb, var(--text-primary) 12%, transparent);
    padding:1px 5px; border-radius:4px;
    font-size:0.9em;
  }
  .chat-msg-row.user .chat-bubble .md-code{
    background:color-mix(in srgb, var(--text-primary) 18%, transparent);
  }
  .chat-bubble .md-link{
    color:var(--accent); text-decoration:underline;
    word-break:break-all;
  }
  .chat-bubble .md-ul,
  .chat-bubble .md-ol{
    margin:4px 0; padding-left:22px;
  }
  .chat-bubble .md-ul{ list-style:disc; }
  .chat-bubble .md-ol{ list-style:decimal; }
  .chat-bubble .md-li{ margin:2px 0; }
  .chat-bubble .md-quote{
    border-left:3px solid var(--accent);
    background:color-mix(in srgb, var(--text-hint) 12%, transparent);
    padding:4px 10px; margin:4px 0; border-radius:0 var(--radius-sm) var(--radius-sm) 0;
    color:var(--text-secondary);
  }
  .chat-bubble .md-img{
    max-width:100%; max-height:240px; border-radius:var(--radius-sm);
    display:block; margin:4px 0; box-shadow:var(--shadow-sm);
  }
  /* 纯文本气泡仍需保留换行：当气泡内是裸文本时换行 */
  .chat-bubble:not(:has(.md-p)):not(:has(.md-pre)){ white-space:pre-wrap; }

  /* 图片预览升级：双击放大 / 拖动 / 保存 */
  .chat-img-stage{
    width:100%; display:flex; justify-content:center; align-items:center;
    overflow:hidden; touch-action:none; max-height:60vh;
  }
  .chat-img-preview{
    max-width:100%; max-height:60vh; border-radius:var(--radius-md);
    transform-origin:center center;
    transition:transform var(--motion);
    user-select:none; -webkit-user-drag:none;
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

  /* 对话模式（Kelivo 风格富文本卡片流） */
  .chat-msg-row.dialog{ max-width:100%; align-self:stretch; flex-direction:column; align-items:stretch; gap:6px; padding:2px 4px; }
  .chat-msg-row.dialog.user{ align-items:flex-start; }
  /* 卡片内的 .chat-bubble 保持透明（背景由卡片提供），关掉气泡尾巴 */
  .chat-msg-row.dialog .chat-bubble{ background:transparent; color:var(--text-primary); box-shadow:none; padding:0; border-radius:0; max-width:none; }
  .chat-msg-row.dialog .chat-bubble::before,
  .chat-msg-row.dialog .chat-bubble::after{ display:none; }
  .chat-msg-row.dialog .chat-avatar,
  .chat-msg-row.dialog .chat-meta{ display:none; }

  /* AI 消息卡片 */
  .chat-dialog-card{
    background:var(--bg-card);
    border-radius:var(--radius-card);
    padding:14px 16px;
    margin-bottom:12px;
    box-shadow:var(--shadow-sm);
    max-width:100%;
  }
  .chat-dialog-card-header{
    display:flex; align-items:center; gap:8px;
    margin-bottom:8px;
  }
  .chat-dialog-card-avatar{
    width:28px; height:28px; border-radius:50%; flex-shrink:0;
    overflow:hidden;
    background:color-mix(in srgb, var(--accent-light) 50%, transparent);
    display:flex; align-items:center; justify-content:center;
    color:var(--accent-dark);
  }
  .chat-dialog-card-name{
    font-size:var(--font-size-small); font-weight:600;
    color:var(--accent-dark);
  }
  .chat-dialog-card-time{
    margin-left:auto;
    font-size:var(--font-size-caption); color:var(--text-hint);
  }
  .chat-dialog-card-body{
    font-size:var(--font-size-base); color:var(--text-primary);
    line-height:1.6;
  }

  /* 用户消息：与 AI 卡片对称 —— 内容 + 时间 + 名字 + 头像(右) */
  .chat-dialog-user{
    display:flex; flex-direction:column; align-items:flex-end; gap:4px;
    padding:8px 14px;
    margin-bottom:8px;
    max-width:100%;
  }
  .chat-dialog-user .chat-bubble{
    background:var(--bubble-user-bg); color:var(--bubble-user-text);
    padding:10px 14px; border-radius:var(--bubble-radius);
    border-bottom-right-radius:var(--bubble-radius-tail);
    box-shadow:var(--shadow-sm);
    max-width:100%;
  }
  .chat-dialog-user-meta{
    display:flex; align-items:center; gap:6px;
    font-size:var(--font-size-caption); color:var(--text-hint);
  }
  .chat-dialog-user-name{
    font-size:var(--font-size-small); font-weight:600;
    color:var(--text-secondary);
  }
  .chat-dialog-user-avatar{
    width:28px; height:28px;
  }

  /* dialog 模式下打字呼吸气泡也走卡片背景，与 AI 消息卡片一致 */
  .chat-typing.chat-typing-dialog{
    background:var(--bg-card);
    border-radius:var(--radius-card);
    border-bottom-left-radius:var(--radius-card);
    padding:14px 16px;
  }

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
  .chat-action-item.danger{ color:var(--danger); }
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
// 增强样式：状态指示器 / 引用卡片 / 表情面板 / 语音 / 搜索栏 / 网格菜单 / 转发 / 音频消息
// 对齐微信/QQ/Kelivo 体验，全部走 CSS 变量，动效 cubic-bezier(0.34, 1.56, 0.64, 1)
// ════════════════════════════════════════
injectStyle('app-chat-enhance-style', `
  /* ── 消息状态指示器增强：sending/sent/delivered/read/failed ── */
  .chat-status-sent,
  .chat-status-delivered,
  .chat-status-read{
    display:inline-flex; align-items:center; gap:1px;
    color:var(--text-hint); line-height:1;
  }
  /* 已读用主题色，让"她看到啦"更醒目 */
  .chat-status-read{ color:var(--accent); }
  .chat-status-delivered .popo-icon-svg,
  .chat-status-read .popo-icon-svg{ stroke-width:2; }
  /* 双勾第二个图标微微偏左，叠出双勾效果 */
  .chat-status-delivered .popo-icon:last-child,
  .chat-status-read .popo-icon:last-child{ margin-left:-6px; }
  .chat-status-sending{
    display:inline-block; width:12px; height:12px;
    border:1.5px solid var(--text-hint); border-top-color:transparent;
    border-radius:50%;
    animation:chatStatusSpin 0.8s linear infinite;
  }
  .chat-status-failed{
    color:var(--danger); display:inline-flex; cursor:pointer;
    padding:2px; border-radius:50%;
    transition:var(--motion);
  }
  .chat-status-failed:active{ transform:scale(var(--press-scale)); background:color-mix(in srgb, var(--danger) 18%, transparent); }

  /* ── 引用卡片：可点击样式 + 发送者名 + 内容预览 ── */
  .chat-quote-clickable{
    cursor:pointer; transition:var(--motion);
    display:flex; flex-direction:column; gap:2px;
    padding:6px 10px; margin-bottom:6px;
    border-left:3px solid var(--accent);
    background:color-mix(in srgb, var(--accent-light) 50%, transparent);
    border-radius:0 var(--radius-sm) var(--radius-sm) 0;
  }
  .chat-quote-clickable:active{ transform:scale(var(--press-scale)); }
  .chat-quote-sender{
    font-size:var(--font-size-caption); color:var(--accent-dark);
    font-weight:600; line-height:1.2;
  }
  .chat-quote-preview-text{
    font-size:var(--font-size-small); color:var(--text-secondary);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    line-height:1.3;
  }
  /* 旧版纯文本引用（无 quoteId）保留原样式 */
  .chat-bubble > .chat-quote:not(.chat-quote-clickable){
    font-size:var(--font-size-small); color:var(--text-secondary);
    background:color-mix(in srgb, var(--text-hint) 12%, transparent);
    border-left:2px solid var(--accent);
    padding:4px 8px; margin-bottom:6px; border-radius:var(--radius-sm);
    white-space:pre-wrap; word-break:break-word;
  }

  /* ── 引用消息定位闪烁动画 ── */
  .chat-msg-row.highlight-flash{
    animation:chatHighlightFlash 1.6s ease-out;
    border-radius:var(--radius-md);
  }
  @keyframes chatHighlightFlash{
    0%{ background:color-mix(in srgb, var(--accent) 35%, transparent); }
    30%{ background:color-mix(in srgb, var(--accent) 18%, transparent); }
    50%{ background:color-mix(in srgb, var(--accent) 28%, transparent); }
    70%{ background:color-mix(in srgb, var(--accent) 12%, transparent); }
    100%{ background:transparent; }
  }

  /* ── 输入区按钮通用样式（+ / 表情 / 语音 / 发送）── */
  .chat-input-row .chat-plus,
  .chat-input-row .chat-emoji-btn,
  .chat-input-row .chat-voice-btn,
  .chat-input-row .chat-send{
    flex-shrink:0; width:36px; height:36px; border-radius:50%;
    display:flex; align-items:center; justify-content:center;
    transition:var(--motion); cursor:pointer; border:none;
  }
  .chat-emoji-btn, .chat-voice-btn{
    background:color-mix(in srgb, var(--bg-secondary) 70%, transparent);
    color:var(--text-secondary);
  }
  .chat-emoji-btn:active, .chat-voice-btn:active{ transform:scale(var(--press-scale)); }
  .chat-emoji-btn.active{
    background:color-mix(in srgb, var(--accent-light) 70%, transparent);
    color:var(--accent-dark);
  }
  .chat-voice-btn.active{
    background:color-mix(in srgb, var(--accent-light) 70%, transparent);
    color:var(--accent-dark);
  }
  /* 发送按钮：有内容时变主题色，空内容时弱化 */
  .chat-send{
    background:color-mix(in srgb, var(--accent) 50%, transparent);
    color:var(--bubble-user-text);
  }
  .chat-send.active{
    background:var(--accent);
    box-shadow:var(--shadow-sm);
  }
  .chat-send:active{ transform:scale(var(--press-scale)); }
  .chat-send.replying{
    background:color-mix(in srgb, var(--danger) 70%, transparent);
  }

  /* ── 按住说话按钮（语音模式时替代 textarea）── */
  .chat-voice-hold{
    flex:1; height:38px; border:none; cursor:pointer;
    background:color-mix(in srgb, var(--bg-secondary) 80%, transparent);
    color:var(--text-secondary);
    border-radius:var(--radius-md);
    font-size:var(--font-size-base); font-family:inherit;
    transition:var(--motion);
    user-select:none; -webkit-user-select:none;
  }
  .chat-voice-hold:active{
    transform:scale(var(--press-scale));
    background:color-mix(in srgb, var(--accent-light) 70%, transparent);
    color:var(--accent-dark);
  }

  /* ── 表情面板 ── */
  .chat-emoji-panel{
    max-height:0; overflow:hidden;
    background:color-mix(in srgb, var(--bg-card) 96%, transparent);
    backdrop-filter:blur(var(--glass-blur));
    -webkit-backdrop-filter:blur(var(--glass-blur));
    border-top:1px solid color-mix(in srgb, var(--text-hint) 16%, transparent);
    transition:max-height var(--motion);
    display:flex; flex-direction:column;
  }
  .chat-emoji-panel.show{ max-height:260px; }
  .chat-emoji-tabs{
    display:flex; gap:4px; padding:8px 12px 4px;
    overflow-x:auto; -webkit-overflow-scrolling:touch;
    border-bottom:1px solid color-mix(in srgb, var(--text-hint) 12%, transparent);
    flex-shrink:0;
  }
  .chat-emoji-tab{
    flex-shrink:0; padding:6px 12px; border:none; cursor:pointer;
    background:transparent; color:var(--text-secondary);
    border-radius:999px; font-size:var(--font-size-small); font-family:inherit;
    transition:var(--motion);
  }
  .chat-emoji-tab:active{ transform:scale(var(--press-scale)); }
  .chat-emoji-tab.active{
    background:color-mix(in srgb, var(--accent-light) 70%, transparent);
    color:var(--accent-dark); font-weight:600;
  }
  .chat-emoji-grid{
    flex:1; overflow-y:auto; -webkit-overflow-scrolling:touch;
    padding:8px 10px 12px;
    display:grid;
    grid-template-columns:repeat(8, 1fr);
    gap:2px;
  }
  .chat-emoji-item{
    aspect-ratio:1; display:flex; align-items:center; justify-content:center;
    border:none; cursor:pointer; background:transparent;
    font-size:22px; line-height:1;
    border-radius:var(--radius-sm);
    transition:var(--motion);
    padding:0;
  }
  .chat-emoji-item:active{ transform:scale(var(--press-scale)); background:color-mix(in srgb, var(--accent-light) 50%, transparent); }
  .chat-emoji-item.picked{ background:color-mix(in srgb, var(--accent) 30%, transparent); }

  /* ── 语音录制遮罩 ── */
  .chat-voice-overlay{
    position:fixed; inset:0; z-index:9100;
    background:color-mix(in srgb, var(--bg-overlay) 70%, transparent);
    backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
    display:flex; align-items:center; justify-content:center;
    opacity:0; transition:opacity var(--motion);
    pointer-events:none;
  }
  .chat-voice-overlay.show{ opacity:1; pointer-events:auto; }
  .chat-voice-overlay-card{
    display:flex; flex-direction:column; align-items:center; gap:14px;
    padding:24px 32px;
    background:color-mix(in srgb, var(--bg-card) 96%, transparent);
    border-radius:var(--radius-card);
    box-shadow:var(--shadow-lg);
  }
  .chat-voice-overlay-icon{
    width:80px; height:80px; border-radius:50%;
    background:color-mix(in srgb, var(--accent-light) 70%, transparent);
    color:var(--accent-dark);
    display:flex; align-items:center; justify-content:center;
    animation:chatVoicePulse 1.2s ease-in-out infinite;
  }
  @keyframes chatVoicePulse{
    0%,100%{ transform:scale(1); box-shadow:var(--shadow-sm); }
    50%{ transform:scale(1.06); box-shadow:var(--shadow-md); }
  }
  .chat-voice-overlay.cancelling .chat-voice-overlay-icon{
    background:color-mix(in srgb, var(--danger) 30%, transparent);
    color:var(--danger);
    animation:none;
  }
  .chat-voice-timer{
    font-size:var(--font-size-title); font-weight:600; color:var(--text-primary);
    font-variant-numeric:tabular-nums;
  }
  .chat-voice-hint{
    font-size:var(--font-size-small); color:var(--text-secondary);
  }
  .chat-voice-overlay.cancelling .chat-voice-hint{ color:var(--danger); }

  /* ── 页内搜索栏（详情页顶部，可折叠）── */
  .chat-search-bar{
    flex-shrink:0; display:flex; align-items:center; gap:6px;
    padding:6px 12px;
    background:color-mix(in srgb, var(--bg-card) 92%, transparent);
    backdrop-filter:blur(var(--glass-blur)); -webkit-backdrop-filter:blur(var(--glass-blur));
    border-bottom:1px solid color-mix(in srgb, var(--text-hint) 16%, transparent);
    max-height:0; overflow:hidden; opacity:0;
    transition:max-height var(--motion), opacity var(--motion), padding var(--motion);
    padding-top:0; padding-bottom:0;
  }
  .chat-search-bar.show{
    max-height:56px; opacity:1; padding-top:6px; padding-bottom:6px;
  }
  .chat-search-input{
    flex:1; min-width:0; padding:8px 12px;
    background:var(--bg-secondary);
    border:1px solid color-mix(in srgb, var(--text-hint) 18%, transparent);
    border-radius:var(--radius-md);
    font-size:var(--font-size-base); color:var(--text-primary); font-family:inherit;
    transition:var(--motion);
  }
  .chat-search-input:focus{ outline:none; border-color:var(--accent); background:var(--bg-card); }
  .chat-search-nav{
    display:flex; align-items:center; gap:2px; flex-shrink:0;
  }
  .chat-search-nav button{
    width:30px; height:30px; border-radius:50%; border:none; cursor:pointer;
    background:transparent; color:var(--text-secondary);
    display:flex; align-items:center; justify-content:center;
    transition:var(--motion);
  }
  .chat-search-nav button:active{ transform:scale(var(--press-scale)); background:color-mix(in srgb, var(--accent-light) 50%, transparent); }
  .chat-search-count{
    font-size:var(--font-size-small); color:var(--text-hint);
    min-width:42px; text-align:center; flex-shrink:0;
    font-variant-numeric:tabular-nums;
  }
  /* 搜索高亮 mark */
  .chat-bubble mark.chat-search-mark{
    background:color-mix(in srgb, var(--accent) 50%, transparent);
    color:inherit; border-radius:3px; padding:0 2px;
  }
  .chat-msg-row.search-current .chat-bubble{
    box-shadow:0 0 0 2px color-mix(in srgb, var(--accent) 60%, transparent);
    border-radius:var(--radius-md);
  }

  /* ── 音频消息渲染 ── */
  .chat-audio{
    display:flex; align-items:center; gap:10px;
    min-width:160px; padding:4px 0;
  }
  .chat-audio-play{
    flex-shrink:0; width:36px; height:36px; border-radius:50%;
    border:none; cursor:pointer;
    background:color-mix(in srgb, var(--accent) 25%, transparent);
    color:var(--accent-dark);
    display:flex; align-items:center; justify-content:center;
    transition:var(--motion);
  }
  .chat-audio-play:active{ transform:scale(var(--press-scale)); }
  .chat-msg-row.user .chat-audio-play{
    background:color-mix(in srgb, var(--bubble-user-text) 25%, transparent);
    color:var(--bubble-user-text);
  }
  .chat-audio-wave{
    flex:1; height:20px; display:flex; align-items:center; gap:2px;
  }
  .chat-audio-wave span{
    flex:1; background:currentColor; opacity:0.5;
    border-radius:1px; min-width:2px;
  }
  .chat-audio-duration{
    font-size:var(--font-size-small); color:currentColor; opacity:0.7;
    flex-shrink:0; font-variant-numeric:tabular-nums;
  }

  /* ── 转发消息标识 ── */
  .chat-forwarded-tag{
    display:inline-flex; align-items:center; gap:3px;
    font-size:var(--font-size-caption); color:var(--text-hint);
    margin-bottom:4px; padding:0 4px;
  }

  /* ── 转发会话选择列表 ── */
  .chat-forward-list{ display:flex; flex-direction:column; gap:6px; }
  .chat-forward-item{
    display:flex; align-items:center; gap:12px; padding:12px;
    border-radius:var(--radius-md); cursor:pointer;
    transition:var(--motion); background:transparent;
    border:1px solid transparent;
  }
  .chat-forward-item:active{ transform:scale(var(--press-scale)); background:color-mix(in srgb, var(--accent-light) 30%, transparent); }
  .chat-forward-avatar{
    width:44px; height:44px; border-radius:50%; flex-shrink:0;
    background-size:cover; background-position:center;
    background:color-mix(in srgb, var(--accent-light) 50%, transparent);
    display:flex; align-items:center; justify-content:center;
    color:var(--accent-dark); overflow:hidden;
  }
  .chat-forward-avatar-fallback{ display:flex; align-items:center; justify-content:center; }
  .chat-forward-info{ flex:1; min-width:0; }
  .chat-forward-title{
    font-size:var(--font-size-base); font-weight:600; color:var(--text-primary);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
  }
  .chat-forward-preview{
    font-size:var(--font-size-small); color:var(--text-hint);
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    margin-top:2px;
  }

  /* ── 网格操作菜单（消息长按 / + 菜单，圆形按钮 + 文字）── */
  .chat-action-grid{
    display:grid; grid-template-columns:repeat(4, 1fr);
    gap:10px 6px; padding:4px 0;
  }
  .chat-action-grid-item{
    display:flex; flex-direction:column; align-items:center; gap:6px;
    padding:10px 4px; border:none; cursor:pointer;
    background:transparent; color:var(--text-primary);
    border-radius:var(--radius-md);
    transition:var(--motion); font-family:inherit;
  }
  .chat-action-grid-item:active{ transform:scale(var(--press-scale)); background:color-mix(in srgb, var(--accent-light) 35%, transparent); }
  .chat-action-grid-item.danger{ color:var(--danger); }
  .chat-action-grid-icon{
    width:48px; height:48px; border-radius:50%;
    background:color-mix(in srgb, var(--bg-secondary) 80%, transparent);
    display:flex; align-items:center; justify-content:center;
    transition:var(--motion);
  }
  .chat-action-grid-item.danger .chat-action-grid-icon{
    background:color-mix(in srgb, var(--danger) 18%, transparent);
  }
  .chat-action-grid-item:active .chat-action-grid-icon{
    background:color-mix(in srgb, var(--accent-light) 70%, transparent);
  }
  .chat-action-grid-item.danger:active .chat-action-grid-icon{
    background:color-mix(in srgb, var(--danger) 30%, transparent);
  }
  .chat-action-grid-label{
    font-size:var(--font-size-small); color:var(--text-secondary);
    text-align:center; line-height:1.2;
  }
  .chat-action-grid-item.danger .chat-action-grid-label{ color:var(--danger); }
  /* 禁用态：待接入的入口先灰掉，但保留可点击查看提示 */
  .chat-action-grid-item.disabled{ opacity:0.45; cursor:not-allowed; }
  .chat-action-grid-item.disabled:active{ transform:none; background:transparent; }
  .chat-action-grid-item.disabled .chat-action-grid-icon{
    background:color-mix(in srgb, var(--text-hint) 18%, transparent);
    color:var(--text-hint);
  }
  .chat-action-grid-item.disabled .chat-action-grid-label{ color:var(--text-hint); }

  /* ── 详情页头部：搜索按钮 ── */
  .chat-header-search{
    flex-shrink:0; width:36px; height:36px; border-radius:50%;
    border:none; cursor:pointer;
    background:transparent; color:var(--text-secondary);
    display:flex; align-items:center; justify-content:center;
    transition:var(--motion);
  }
  .chat-header-search:active{ transform:scale(var(--press-scale)); background:color-mix(in srgb, var(--accent-light) 40%, transparent); }

  /* ── + 菜单分类（图片/拍照/文件/位置/名片）── */
  .chat-plus-menu .chat-action-grid-icon{ background:color-mix(in srgb, var(--accent-light) 50%, transparent); color:var(--accent-dark); }

  @media (prefers-reduced-motion:reduce){
    .chat-voice-overlay-icon, .chat-emoji-panel, .chat-search-bar, .chat-msg-row.highlight-flash{
      animation-duration:0.01ms!important; transition-duration:0.01ms!important;
    }
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
  // 群聊消息也要触发列表刷新（群消息在另一个 store，单独的事件）
  bus.on('chat:group-ai-message', onMsgReceived);
  state.busListeners.push(['chat:group-ai-message', onMsgReceived]);
  bus.on('chat:group-user-message', onMsgReceived);
  state.busListeners.push(['chat:group-user-message', onMsgReceived]);
  // 群成员变动 / 会话字段更新也要刷新列表（群名改了、加人了等）
  const onSessionUpdated = () => {
    if (state.view === 'list') renderSessionListItems(state.lastSearchKeyword);
  };
  bus.on('chat:session-updated', onSessionUpdated);
  state.busListeners.push(['chat:session-updated', onSessionUpdated]);
  bus.on('chat:group-members-changed', onSessionUpdated);
  state.busListeners.push(['chat:group-members-changed', onSessionUpdated]);

  // 监听角色资料更新（avatar APP 换头像 / characters APP 改名改人设 / 导入角色卡都会 emit）
  // 在详情页时重新读 DB 拿最新角色，刷新 header 名字 + AI 头像 + 对话卡片名字
  const onCharacterUpdated = async () => {
    if (state.view !== 'chat') return;
    if (!state.currentCharacterId) return;
    try {
      const fresh = await getDB(STORES.characters, state.currentCharacterId);
      if (fresh) {
        state.currentCharacter = fresh;
        refreshAvatar();
      }
    } catch (e) {
      console.warn('[chat] 刷新角色资料失败', e);
    }
  };
  bus.on('character:updated', onCharacterUpdated);
  state.busListeners.push(['character:updated', onCharacterUpdated]);

  // 旧数据迁移：把没有 sessionId 的消息归到按角色生成的会话里
  await maybeMigrateLegacyMessages();

  await render();
  applyAppBg(container, 'chat');

  // 支持 deepLink 跳转：从其他 App（如收藏夹）带着 sessionId 跳进来，直接进对应会话
  if (context?.deepLink?.sessionId) {
    try { await enterChat(context.deepLink.sessionId); } catch (e) {
      console.warn('[chat] deepLink 跳转失败', e);
    }
  }
}

export function unmount() {
  // 清掉流式定时器 + abort，避免组件卸载后还在跑
  if (state.typingTimer) { clearTimeout(state.typingTimer); state.typingTimer = null; }
  cancelStreaming();
  // 停掉正在念的 TTS，避免离开后还在念
  try { stopChatTTS(); } catch (e) {}
  // 落盘草稿
  try { if (state.saveDraftDebounced) state.saveDraftDebounced.cancel?.(); } catch (e) {}
  flushDraft();
  // 收起增强模块的临时状态（表情面板 / 语音模式 / 搜索高亮 / document 监听）
  try { cleanupExtras(); } catch (e) {}

  // 解绑 bus
  state.busListeners.forEach(([name, fn]) => bus.off(name, fn));
  state.busListeners = [];

  // 移除消息列表的 scroll 监听（detail-view.js 在 renderChatDetailView 里绑的，引用存在 state 上）
  if (state.messageListEl && state._onMessagesScroll) {
    try { state.messageListEl.removeEventListener('scroll', state._onMessagesScroll); } catch (e) {}
    state._onMessagesScroll = null;
  }

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
  } else if (state.view === 'group') {
    // 群聊视图：动态 import 避免循环依赖
    try {
      const { renderGroupDetailView } = await import('./group/group-detail-view.js');
      await renderGroupDetailView();
    } catch (e) {
      console.warn('[chat] 群聊视图加载失败', e);
      showToast('群聊页打不开呢', 'error');
      state.view = 'list';
      await render();
    }
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

  state.view = session.isGroup ? 'group' : 'chat';
  state.currentSessionId = sessionId;
  state.currentSession = session;
  state.currentCharacterId = session.characterId;
  setData(KEYS.chatCurrentCharacter, session.characterId);

  // 进入即清未读
  if ((session.unread || 0) > 0) {
    try { await setDB(STORES.chatSessions, sessionId, { ...session, unread: 0 }); } catch (e) {}
  }

  // 缓存角色（群聊无单一角色，留 null）
  state.currentCharacter = null;
  if (!session.isGroup && session.characterId) {
    try { state.currentCharacter = await getDB(STORES.characters, session.characterId); } catch (e) {}
  }

  await render();
}

/** 返回会话列表 */
export async function backToSessionList() {
  // 落盘草稿
  await flushDraft();
  // 不取消进行中的流式——让 AI 在后台跑完，消息中心也能收到
  // 但 TTS 要停掉，避免回到列表还在念
  try { stopChatTTS(); } catch (e) {}
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
