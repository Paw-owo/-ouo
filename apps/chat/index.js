// apps/chat/index.js
// 聊天 App——软萌少女风格 PWA「泡泡」。
// 和心里的那个她一直聊下去。本地预设回复池，不联网也能陪你说说话。
// 消息存 IndexedDB（STORES.messages），字段：
//   {id, characterId, role:'user'|'assistant', content, timestamp, createdAt}
// 当前角色存 localStorage（KEYS.chatCurrentCharacter），默认 'char_chuyi'（初一）。
// 依赖：core/storage.js, core/storage-keys.js, core/ui.js, core/events.js, core/util.js, core/memory.js

import { KEYS, STORES } from '../../core/storage-keys.js';
import { getData, setData, getDB, setDB, deleteDB, getAllDB, generateId, getNow } from '../../core/storage.js';
import { showToast, showConfirm, showBottomSheet, createIcon, showAlert } from '../../core/ui.js';
import bus from '../../core/events.js';
import { formatTime, formatRelative, injectStyle, clamp } from '../../core/util.js';

// ════════════════════════════════════════
// 模块状态
// ════════════════════════════════════════

let containerEl = null;
let currentCharacterId = null;
let currentCharacter = null;
let messageListEl = null;
let inputEl = null;
let sendBtnEl = null;
let isReplying = false;
let typingTimer = null;      // 流式逐字定时器，unmount 时清掉避免泄漏
let typingIndicatorEl = null;
let stopStreaming = false;   // 用户点暂停或切换角色时置 true
let lastReply = null;        // 上一条 AI 回复，用来避免连续重复

// ════════════════════════════════════════
// 本地预设回复池（不联网，关键词匹配 + 兜底随机）
// ════════════════════════════════════════

const LOCAL_REPLIES = {
  greeting: ['你回来啦~ 想你啦', '嗨嗨，等你半天了', '终于理我啦，开心'],
  sad: ['抱抱你，别难过嘛', '我在呢，慢慢说', '难过了就靠着我一会儿'],
  happy: ['看到你开心我也开心~', '哇这么棒！多说说', '嘿嘿笑一个'],
  question: ['让我想想哦...', '嗯...你觉得呢？', '这个嘛，我也不太确定，但陪你一起想'],
  default: ['嗯嗯，我在听', '然后呢？', '多说一点嘛', '我懂你的', '抱抱', '一直在这里陪你哦']
};

// 关键词分类规则
const REPLY_RULES = [
  { category: 'greeting', pattern: /你好|嗨|早|晚安|在吗/ },
  { category: 'sad',      pattern: /难过|伤心|哭|累|烦|不开心/ },
  { category: 'happy',    pattern: /开心|高兴|棒|厉害|哈哈/ },
  { category: 'question', pattern: /[?？]|怎么/ }
];

// ════════════════════════════════════════
// 样式（全部走 CSS 变量，主题变了我也跟着变）
// ════════════════════════════════════════

injectStyle('app-chat-style', `
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
  }
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
  .chat-empty{
    flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:12px; color:var(--text-hint);
  }
  .chat-empty-icon{ opacity:0.4; }
  .chat-empty-text{ font-size:var(--font-size-small); }
  .chat-input-bar{
    flex-shrink:0; display:flex; align-items:flex-end; gap:8px;
    padding:8px 12px calc(env(safe-area-inset-bottom,0px) + 8px);
    background:color-mix(in srgb,var(--bg-card) 92%,transparent);
    backdrop-filter:blur(var(--glass-blur)); -webkit-backdrop-filter:blur(var(--glass-blur));
    border-top:1px solid color-mix(in srgb,var(--text-hint) 16%,transparent);
  }
  .chat-input{
    flex:1; resize:none; border:1px solid color-mix(in srgb,var(--text-hint) 20%,transparent);
    border-radius:var(--radius-md); padding:10px 12px;
    font-size:var(--font-size-base); font-family:inherit; color:var(--text-primary);
    background:var(--bg-secondary); max-height:96px; line-height:1.4;
    transition:var(--motion);
  }
  .chat-input::placeholder{ color:var(--text-hint); }
  .chat-input:focus{ outline:none; border-color:var(--accent); background:var(--bg-card); }
  .chat-send{
    flex-shrink:0; width:38px; height:38px; border-radius:50%;
    background:var(--accent); color:var(--bubble-user-text);
    display:flex; align-items:center; justify-content:center;
    transition:var(--motion);
  }
  .chat-send:active{ transform:scale(var(--press-scale)); }
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
  .chat-char-list{ display:flex; flex-direction:column; gap:4px; }
  .chat-char-item{
    display:flex; align-items:center; gap:12px; padding:12px;
    border-radius:var(--radius-md); cursor:pointer;
    transition:var(--motion); background:transparent;
    border:1px solid transparent;
  }
  .chat-char-item:active{ transform:scale(var(--press-scale)); }
  .chat-char-item.active{
    background:color-mix(in srgb,var(--accent-light) 40%,transparent);
    border-color:color-mix(in srgb,var(--accent) 40%,transparent);
  }
  .chat-char-avatar{
    border-radius:50%; background:var(--bg-secondary);
    display:flex; align-items:center; justify-content:center;
    color:var(--text-hint); flex-shrink:0; overflow:hidden;
  }
  .chat-char-info{ flex:1; min-width:0; }
  .chat-char-name{ font-size:var(--font-size-base); font-weight:600; color:var(--text-primary); }
  .chat-char-persona{
    font-size:var(--font-size-small); color:var(--text-secondary);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis; margin-top:2px;
  }
  .chat-char-current{ color:var(--accent); display:flex; align-items:center; flex-shrink:0; }
  @media (prefers-reduced-motion:reduce){
    .chat-typing-dot, .chat-cursor{ animation-duration:0.01ms!important; }
  }
`);

// ════════════════════════════════════════
// mount / unmount
// ════════════════════════════════════════

export async function mount(container, context) {
  containerEl = container;
  currentCharacterId = getData(KEYS.chatCurrentCharacter, 'char_chuyi');
  isReplying = false;
  lastReply = null;
  stopStreaming = false;

  renderShell();

  // 缓存元素引用
  messageListEl = container.querySelector('#chat-messages');
  inputEl = container.querySelector('#chat-input');
  sendBtnEl = container.querySelector('#chat-send');

  // 绑定事件
  container.querySelector('#chat-back').addEventListener('click', () => bus.emit('router:home'));
  container.querySelector('#chat-switch').addEventListener('click', openCharacterSwitcher);
  sendBtnEl.addEventListener('click', onSendClick);
  inputEl.addEventListener('keydown', onInputKeyDown);
  inputEl.addEventListener('input', autoResizeInput);

  // 加载角色和消息
  await loadCharacter();
  updateHeader();
  await loadAndRenderMessages();
}

export function unmount() {
  // 清掉流式定时器，避免组件卸载后还在跑
  if (typingTimer) { clearTimeout(typingTimer); typingTimer = null; }
  stopStreaming = true;
  isReplying = false;
  hideTypingIndicator();
  containerEl = null;
  messageListEl = null;
  inputEl = null;
  sendBtnEl = null;
  currentCharacter = null;
}

// ════════════════════════════════════════
// 静态结构渲染
// ════════════════════════════════════════

function renderShell() {
  containerEl.innerHTML = `
    <div class="app-header">
      <button class="app-back" id="chat-back" aria-label="返回桌面">${createIcon('back', 20).outerHTML}</button>
      <div class="chat-header-info">
        <div class="chat-header-name" id="chat-header-name">...</div>
        <div class="chat-header-status">
          <span class="chat-online-dot" aria-hidden="true"></span>
          <span id="chat-header-status-text">在线</span>
        </div>
      </div>
      <button class="chat-switch" id="chat-switch" aria-label="切换角色">${createIcon('chat', 20).outerHTML}</button>
    </div>
    <div class="chat-messages" id="chat-messages"></div>
    <div class="chat-input-bar">
      <textarea class="chat-input" id="chat-input" placeholder="说点什么吧..." rows="1" enterkeyhint="send" aria-label="输入消息"></textarea>
      <button class="chat-send" id="chat-send" aria-label="发送">${createIcon('check', 20).outerHTML}</button>
    </div>
  `;
}

// ════════════════════════════════════════
// 角色加载 & header 更新
// ════════════════════════════════════════

async function loadCharacter() {
  try {
    currentCharacter = await getDB(STORES.characters, currentCharacterId);
  } catch (e) {
    console.warn('[chat] 读取角色失败', e);
    currentCharacter = null;
  }
}

function updateHeader(lastMsgTime) {
  if (!containerEl) return;
  const nameEl = containerEl.querySelector('#chat-header-name');
  if (nameEl) {
    nameEl.textContent = currentCharacter?.name || currentCharacter?.nickname || '未知';
  }
  const statusEl = containerEl.querySelector('#chat-header-status-text');
  if (statusEl) {
    statusEl.textContent = lastMsgTime ? `在线 · ${formatRelative(lastMsgTime)}` : '在线';
  }
}

// ════════════════════════════════════════
// 消息加载 & 渲染
// ════════════════════════════════════════

async function loadAndRenderMessages() {
  if (!messageListEl) return;
  let messages = [];
  try {
    const all = await getAllDB(STORES.messages);
    messages = all.filter((m) => m.characterId === currentCharacterId);
  } catch (e) {
    console.warn('[chat] 读取消息失败', e);
    showToast('消息读不出来嘛，等一下再试试', 'error');
  }
  // 按 timestamp 升序排
  messages.sort((a, b) => {
    const ta = new Date(a.timestamp || 0).getTime();
    const tb = new Date(b.timestamp || 0).getTime();
    return ta - tb;
  });

  if (messages.length === 0) {
    renderEmptyState();
    updateHeader(null);
    return;
  }

  messageListEl.innerHTML = '';
  messages.forEach((msg) => appendMessageEl(msg));
  updateHeader(messages[messages.length - 1].timestamp);
  scrollToBottom();
}

function renderEmptyState() {
  if (!messageListEl) return;
  messageListEl.innerHTML = `
    <div class="chat-empty">
      <div class="chat-empty-icon">${createIcon('chat', 48).outerHTML}</div>
      <div class="chat-empty-text">她还在等你说话呢，发一条试试嘛</div>
    </div>
  `;
}

function appendMessageEl(msg, opts = {}) {
  if (!messageListEl) return null;
  // 移除空状态
  const empty = messageListEl.querySelector('.chat-empty');
  if (empty) empty.remove();

  const el = createMessageEl(msg, opts);
  messageListEl.appendChild(el);
  return el;
}

function createMessageEl(msg, opts = {}) {
  const el = document.createElement('div');
  el.className = `chat-msg ${msg.role === 'user' ? 'user' : 'ai'}`;
  el.dataset.id = msg.id;
  const content = opts.stream ? '' : (msg.content || '');
  el.innerHTML = `
    <div class="chat-bubble">${escapeHTML(content)}</div>
    <div class="chat-time">${escapeHTML(formatTime(msg.timestamp))}</div>
  `;
  // 长按删除
  attachLongPress(el, () => confirmDeleteMessage(msg));
  return el;
}

function confirmDeleteMessage(msg) {
  showConfirm({
    title: '删掉这条消息吗？',
    body: '删掉就看不到啦，确定嘛？',
    confirmText: '删掉吧',
    cancelText: '不要',
    danger: true,
    onConfirm: async () => {
      try {
        await deleteDB(STORES.messages, msg.id);
        const el = messageListEl?.querySelector(`[data-id="${cssEscape(msg.id)}"]`);
        if (el) el.remove();
        showToast('删掉啦', 'default', 1200);
        // 如果消息全删光了，显示空状态
        if (messageListEl && !messageListEl.querySelector('.chat-msg')) {
          renderEmptyState();
          updateHeader(null);
        }
      } catch (e) {
        console.warn('[chat] 删除消息失败', e);
        showToast('没删掉，再试一下嘛', 'error');
      }
    }
  });
}

// ════════════════════════════════════════
// 发送消息 & AI 回复
// ════════════════════════════════════════

function onSendClick() {
  if (isReplying) {
    // 正在回复中，点一下停止流式
    stopStreaming = true;
  } else {
    sendMessage();
  }
}

function onInputKeyDown(e) {
  // 回车发送，Shift+回车换行；回复中不拦截（让回车自然换行）
  if (e.key === 'Enter' && !e.shiftKey && !isReplying) {
    e.preventDefault();
    sendMessage();
  }
}

async function sendMessage() {
  if (!inputEl || !messageListEl) return;
  const text = inputEl.value.trim();
  if (!text) return;

  // 清空输入框并重置高度
  inputEl.value = '';
  autoResizeInput();

  // 构造并存用户消息
  const userMsg = {
    id: generateId('msg'),
    characterId: currentCharacterId,
    role: 'user',
    content: text,
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
  updateHeader(userMsg.timestamp);
  scrollToBottom();

  // 锁定输入，显示呼吸气泡
  stopStreaming = false;
  setReplying(true);
  showTypingIndicator();
  scrollToBottom();

  // 模拟她正在想，延迟 600-1200ms
  const delay = 600 + Math.random() * 600;
  await new Promise((r) => setTimeout(r, delay));

  // 期间被中断（切换角色 / unmount）
  if (stopStreaming || !containerEl) {
    hideTypingIndicator();
    setReplying(false);
    stopStreaming = false;
    return;
  }

  // 选回复
  const category = pickReplyCategory(text);
  const reply = pickReply(category);
  hideTypingIndicator();

  // 构造 AI 消息（先建空气泡，流式填入）
  const aiMsg = {
    id: generateId('msg'),
    characterId: currentCharacterId,
    role: 'assistant',
    content: reply,
    timestamp: getNow()
  };
  const msgEl = appendMessageEl(aiMsg, { stream: true });
  const bubbleEl = msgEl.querySelector('.chat-bubble');

  // 流式逐字显示，50ms/字
  const displayedText = await streamReply(bubbleEl, reply);
  scrollToBottom();

  // 如果被提前中断且没显示任何字，移除空气泡
  if (!displayedText) {
    msgEl.remove();
    if (messageListEl && !messageListEl.querySelector('.chat-msg')) {
      renderEmptyState();
    }
    setReplying(false);
    stopStreaming = false;
    return;
  }

  // 流式完成才存 DB
  aiMsg.content = displayedText;
  try {
    await setDB(STORES.messages, aiMsg.id, aiMsg);
    updateHeader(aiMsg.timestamp);
  } catch (e) {
    console.warn('[chat] 保存AI消息失败', e);
  }

  // 写入长期记忆
  try {
    const mem = await import('../../core/memory.js');
    await mem.recordInteraction({
      characterId: currentCharacterId,
      role: 'assistant',
      source: 'chat',
      content: displayedText,
      mood: inferMood(category),
      importance: inferImportance(category),
      relatedApp: 'chat',
      timestamp: aiMsg.timestamp
    });
  } catch (e) {
    console.warn('[chat] 记忆写入失败', e);
  }

  setReplying(false);
  stopStreaming = false;
}

// 流式逐字渲染，返回最终显示的文本（可能被中断截断）
function streamReply(bubbleEl, fullText) {
  const chars = Array.from(fullText); // Array.from 正确处理 surrogate pair
  let i = 0;
  let acc = '';
  return new Promise((resolve) => {
    function tick() {
      // 被中断或组件已卸载
      if (!containerEl || stopStreaming) {
        bubbleEl.textContent = acc;
        resolve(acc);
        return;
      }
      if (i >= chars.length) {
        bubbleEl.textContent = fullText;
        resolve(fullText);
        return;
      }
      acc += chars[i];
      i++;
      bubbleEl.innerHTML = escapeHTML(acc) + '<span class="chat-cursor"></span>';
      scrollToBottom();
      typingTimer = setTimeout(tick, 50);
    }
    tick();
  });
}

function setReplying(replying) {
  isReplying = replying;
  if (sendBtnEl) {
    sendBtnEl.innerHTML = replying ? createIcon('pause', 20).outerHTML : createIcon('check', 20).outerHTML;
    sendBtnEl.setAttribute('aria-label', replying ? '停止回复' : '发送');
  }
}

// ════════════════════════════════════════
// 打字呼吸气泡
// ════════════════════════════════════════

function showTypingIndicator() {
  if (!messageListEl) return;
  hideTypingIndicator();
  typingIndicatorEl = document.createElement('div');
  typingIndicatorEl.className = 'chat-typing';
  typingIndicatorEl.setAttribute('aria-label', '她正在打字');
  typingIndicatorEl.innerHTML = `
    <div class="chat-typing-dot"></div>
    <div class="chat-typing-dot"></div>
    <div class="chat-typing-dot"></div>
  `;
  messageListEl.appendChild(typingIndicatorEl);
  scrollToBottom();
}

function hideTypingIndicator() {
  if (typingIndicatorEl && typingIndicatorEl.parentNode) {
    typingIndicatorEl.parentNode.removeChild(typingIndicatorEl);
  }
  typingIndicatorEl = null;
}

// ════════════════════════════════════════
// 角色切换
// ════════════════════════════════════════

async function openCharacterSwitcher() {
  let characters = [];
  try {
    characters = await getAllDB(STORES.characters);
  } catch (e) {
    console.warn('[chat] 读取角色列表失败', e);
    showToast('角色读不出来嘛', 'error');
    return;
  }
  if (!characters.length) {
    showAlert({ title: '还没有角色呢', body: '先去设置里创建一个角色嘛', okText: '知道啦' });
    return;
  }

  const body = document.createElement('div');
  body.className = 'chat-char-list';
  body.innerHTML = characters.map((c) => `
    <div class="chat-char-item ${c.id === currentCharacterId ? 'active' : ''}" data-id="${escapeAttr(c.id)}" role="button" tabindex="0" aria-label="切换到${escapeAttr(c.name || c.nickname || '角色')}">
      ${renderAvatar(c, 44)}
      <div class="chat-char-info">
        <div class="chat-char-name">${escapeHTML(c.name || c.nickname || '未命名')}</div>
        <div class="chat-char-persona">${escapeHTML((c.persona || '还没有人设呢').slice(0, 40))}</div>
      </div>
      ${c.id === currentCharacterId ? `<span class="chat-char-current">${createIcon('check', 16).outerHTML}</span>` : ''}
    </div>
  `).join('');

  const sheet = showBottomSheet({
    title: '切换角色',
    bodyElement: body,
    dismissible: true
  });

  body.querySelectorAll('.chat-char-item').forEach((item) => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      if (id === currentCharacterId) {
        sheet.close();
        return;
      }
      sheet.close();
      switchCharacter(id);
    });
  });
}

async function switchCharacter(id) {
  // 停掉正在进行的回复
  if (typingTimer) { clearTimeout(typingTimer); typingTimer = null; }
  stopStreaming = true;
  hideTypingIndicator();
  setReplying(false);

  currentCharacterId = id;
  setData(KEYS.chatCurrentCharacter, id);
  stopStreaming = false;
  lastReply = null;

  await loadCharacter();
  updateHeader();
  await loadAndRenderMessages();
  showToast('切换好啦', 'success', 1200);
}

function renderAvatar(char, size) {
  const av = char.avatar;
  if (av && /^(data:|https?:|blob:)/.test(av)) {
    const safe = av.replace(/'/g, "\\'");
    return `<div class="chat-char-avatar" style="width:${size}px;height:${size}px;background-image:url('${safe}');background-size:cover;background-position:center"></div>`;
  }
  return `<div class="chat-char-avatar" style="width:${size}px;height:${size}px">${createIcon('smile', Math.round(size * 0.55)).outerHTML}</div>`;
}

// ════════════════════════════════════════
// 回复选择逻辑
// ════════════════════════════════════════

function pickReplyCategory(text) {
  for (const rule of REPLY_RULES) {
    if (rule.pattern.test(text)) return rule.category;
  }
  return 'default';
}

function pickReply(category) {
  const pool = LOCAL_REPLIES[category] || LOCAL_REPLIES.default;
  let choice;
  let attempts = 0;
  // 避免连续两次相同
  do {
    choice = pool[Math.floor(Math.random() * pool.length)];
    attempts++;
  } while (lastReply === choice && pool.length > 1 && attempts < 6);
  lastReply = choice;
  return choice;
}

function inferMood(category) {
  switch (category) {
    case 'happy': return 'happy';
    case 'sad': return 'calm';
    case 'greeting': return 'happy';
    case 'question': return 'calm';
    default: return 'calm';
  }
}

function inferImportance(category) {
  switch (category) {
    case 'sad': return 7;
    case 'happy': return 6;
    case 'greeting': return 3;
    case 'question': return 5;
    default: return 4;
  }
}

// ════════════════════════════════════════
// 输入框自适应高度 & 滚动
// ════════════════════════════════════════

function autoResizeInput() {
  if (!inputEl) return;
  inputEl.style.height = 'auto';
  // 最多 4 行（约 96px）
  const h = clamp(inputEl.scrollHeight, 0, 96);
  inputEl.style.height = h + 'px';
}

function scrollToBottom() {
  if (!messageListEl) return;
  messageListEl.scrollTop = messageListEl.scrollHeight;
}

// ════════════════════════════════════════
// 长按删除
// ════════════════════════════════════════

function attachLongPress(el, handler) {
  let timer = null;
  let startX = 0;
  let startY = 0;
  const LONG_PRESS_MS = 500;
  const MOVE_THRESHOLD = 10;

  const onDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    startX = e.clientX;
    startY = e.clientY;
    timer = setTimeout(() => {
      timer = null;
      try { handler(e); } catch (err) { console.warn('[chat] longpress 失败', err); }
    }, LONG_PRESS_MS);
  };
  const onMove = (e) => {
    if (!timer) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    if (dx * dx + dy * dy > MOVE_THRESHOLD * MOVE_THRESHOLD) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const onUp = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('pointerleave', onUp);
  // 阻止系统长按菜单
  el.addEventListener('contextmenu', (e) => { if (!timer) e.preventDefault(); });
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
function cssEscape(s) {
  if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(String(s));
  return String(s).replace(/["\\]/g, '\\$&');
}
