// apps/chat/thread-call.js
// imports:
//   from '../../core/storage.js': generateId, getNow, setDB, getByIndexDB
//   from '../../core/ui.js': createIcon, showToast
//   from '../../core/api.js': silentRequest
//   from '../../core/tts.js': playTTS, stopAll

import {
  generateId,
  getNow,
  setDB,
  getByIndexDB
} from '../../core/storage.js';

import { createIcon, showToast } from '../../core/ui.js';
import { silentRequest } from '../../core/api.js';
import { playTTS, stopAll } from '../../core/tts.js';

const CALL_STYLE_ID = 'chat-thread-call-style';

const callState = {
  rootEl: null,
  hostEl: null,
  threadState: null,
  close: null,
  onReject: null,
  mounted: false,
  incoming: false,
  accepted: false,
  character: null,
  characterId: '',
  callLogs: [],
  startedAt: 0,
  timer: null,
  seconds: 0,
  isSending: false,
  isEnding: false
};

export async function mountThreadCall(containerEl, options = {}) {
  callState.rootEl = containerEl;
  callState.threadState = options.state || null;
  callState.close = typeof options.close === 'function' ? options.close : null;
  callState.onReject = typeof options.onReject === 'function' ? options.onReject : null;
  callState.incoming = Boolean(options.incoming);
  callState.accepted = !callState.incoming;
  callState.character = callState.threadState?.character || null;
  callState.characterId = callState.character?.id || callState.threadState?.characterId || '';
  callState.callLogs = [];
  callState.startedAt = Date.now();
  callState.seconds = 0;
  callState.isSending = false;
  callState.isEnding = false;
  callState.mounted = true;

  injectStyle();
  renderCall();

  if (!callState.incoming) {
    startTimer();
    speakOpening();
  }
}

export function unmountThreadCall() {
  callState.mounted = false;
  stopTimer();
  stopAll();

  if (callState.hostEl) {
    callState.hostEl.remove();
  }

  callState.rootEl = null;
  callState.hostEl = null;
  callState.threadState = null;
  callState.close = null;
  callState.onReject = null;
  callState.incoming = false;
  callState.accepted = false;
  callState.character = null;
  callState.characterId = '';
  callState.callLogs = [];
  callState.startedAt = 0;
  callState.seconds = 0;
  callState.isSending = false;
  callState.isEnding = false;
}

function renderCall() {
  if (!callState.mounted) return;

  if (callState.hostEl) {
    callState.hostEl.remove();
  }

  const host = el('section', `chat-call-screen ${callState.accepted ? 'accepted' : 'incoming'}`);
  callState.hostEl = host;

  const top = el('header', 'chat-call-top');
  top.append(
    el('div', 'chat-call-status', callState.accepted ? '通话中' : '来电'),
    el('div', 'chat-call-time', callState.accepted ? formatDuration(callState.seconds) : '等待接听')
  );

  const center = el('main', 'chat-call-center');
  center.append(
    createCallAvatar(),
    el('div', 'chat-call-name', getCharacterName()),
    el('div', 'chat-call-subtitle', getCallSubtitle())
  );

  if (callState.accepted) {
    center.appendChild(createCallLogList());
  } else {
    center.appendChild(createIncomingHint());
  }

  host.append(top, center);

  if (callState.accepted) {
    host.append(createCallInput(), createCallControls());
  } else {
    host.append(createIncomingControls());
  }

  document.body.appendChild(host);
}

function createCallAvatar() {
  const avatar = el('div', 'chat-call-avatar');
  const src = callState.character?.avatar || '';

  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitial(getCharacterName());
  }

  return avatar;
}

function createIncomingHint() {
  const wrap = el('section', 'chat-call-incoming-hint');
  wrap.append(
    el('div', 'chat-call-incoming-title', `${getCharacterName()} 想和你通话`),
    el('div', 'chat-call-incoming-desc', '你可以接起来，也可以先拒绝。')
  );
  return wrap;
}

function createCallLogList() {
  const wrap = el('section', 'chat-call-log');

  const latest = callState.callLogs.slice(-4);

  if (!latest.length) {
    wrap.appendChild(el('div', 'chat-call-empty', '电话接通了，先轻轻说一句吧。'));
    return wrap;
  }

  latest.forEach((item) => {
    const row = el('article', `chat-call-line role-${item.role}`);
    row.append(
      el('div', 'chat-call-line-author', item.role === 'user' ? '我' : getCharacterName()),
      el('div', 'chat-call-line-text', item.content)
    );
    wrap.appendChild(row);
  });

  return wrap;
}

function createCallInput() {
  const form = el('form', 'chat-call-input-wrap');

  const textarea = document.createElement('textarea');
  textarea.className = 'chat-call-input';
  textarea.rows = 1;
  textarea.placeholder = '和 TA 说话';
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocorrect', 'off');
  textarea.setAttribute('spellcheck', 'false');
  textarea.setAttribute('enterkeyhint', 'send');

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(120, textarea.scrollHeight)}px`;
  });

  textarea.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      await sendCallText(textarea);
    }
  });

  const send = el('button', 'chat-call-send');
  send.type = 'submit';
  send.append(createIcon('send', 16), el('span', '', '发送'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    await sendCallText(textarea);
  });

  form.append(textarea, send);
  return form;
}

function createIncomingControls() {
  const controls = el('footer', 'chat-call-controls incoming');

  const reject = controlButton('x', '拒绝');
  reject.classList.add('ghost');
  reject.addEventListener('click', () => rejectIncomingCall());

  const accept = controlButton('phone', '接听');
  accept.classList.add('primary');
  accept.addEventListener('click', () => acceptIncomingCall());

  controls.append(reject, accept);
  return controls;
}

function createCallControls() {
  const controls = el('footer', 'chat-call-controls');

  const mute = controlButton('volume', '停止朗读');
  mute.addEventListener('click', () => {
    stopAll();
    showToast('已停止朗读');
  });

  const end = controlButton('phone', '挂断');
  end.classList.add('danger');
  end.addEventListener('click', () => endCall());

  controls.append(mute, end);
  return controls;
}

function controlButton(iconName, text) {
  const button = el('button', 'chat-call-control');
  button.type = 'button';
  button.append(createIcon(iconName, 18), el('span', '', text));
  return button;
}

function acceptIncomingCall() {
  if (!callState.mounted || callState.accepted) return;

  callState.accepted = true;
  callState.startedAt = Date.now();
  callState.seconds = 0;

  renderCall();
  startTimer();
  speakOpening();
}

function rejectIncomingCall() {
  stopAll();

  if (typeof callState.onReject === 'function') {
    callState.onReject({
      characterId: callState.characterId,
      character: callState.character
    });
  }

  if (typeof callState.close === 'function') {
    callState.close();
  } else {
    unmountThreadCall();
  }
}

function speakOpening() {
  const content = callState.incoming ? `你接起来了，我在。` : `电话接通了，我在。`;
  addCallLog('assistant', content);
  renderCall();
  speakText(content);
}

async function sendCallText(textarea) {
  const content = String(textarea.value || '').trim();

  if (!content || callState.isSending || callState.isEnding || !callState.accepted) return;

  callState.isSending = true;
  textarea.value = '';
  textarea.style.height = 'auto';

  addCallLog('user', content);
  renderCall();

  try {
    const reply = await requestCallReply();
    if (reply) {
      addCallLog('assistant', reply);
      renderCall();
      speakText(reply);
    }
  } finally {
    callState.isSending = false;
  }
}

async function requestCallReply() {
  const messages = buildCallMessages();

  const content = await silentRequest({
    messages,
    temperature: 0.85
  });

  const text = String(content || '').trim();

  if (!text) {
    showToast('TA 刚刚没听清');
    return '';
  }

  return cleanReply(text);
}

function buildCallMessages() {
  const system = [
    `你正在和用户通电话。`,
    `你扮演：${getCharacterName()}`,
    callState.character?.persona ? `人设：${callState.character.persona}` : '',
    callState.character?.description ? `简介：${callState.character.description}` : '',
    callState.character?.style ? `说话风格：${callState.character.style}` : '',
    `要求：像真实电话一样简短自然，不要长篇，不要说系统设定。`
  ].filter(Boolean).join('\n');

  return [
    {
      role: 'system',
      content: system
    },
    ...callState.callLogs.slice(-12).map((item) => ({
      role: item.role === 'assistant' ? 'assistant' : 'user',
      content: item.content
    }))
  ];
}

async function endCall() {
  if (callState.isEnding) return;

  callState.isEnding = true;
  stopAll();

  try {
    await writeCallMemory();
  } finally {
    stopTimer();

    if (typeof callState.close === 'function') {
      callState.close();
    } else {
      unmountThreadCall();
    }
  }
}

async function writeCallMemory() {
  if (!callState.characterId || callState.callLogs.length < 2) return null;

  const summary = await summarizeCall();
  const content = summary || fallbackSummary();

  if (!content) return null;

  const exists = await getByIndexDB('memories', 'characterId', callState.characterId).catch(() => []);
  const duplicated = exists.some((item) => similarText(item.content, content));

  if (duplicated) return null;

  const now = getNow();
  const memory = {
    id: generateId('memory'),
    characterId: callState.characterId,
    content,
    source: 'summary',
    createdAt: now,
    updatedAt: now
  };

  await setDB('memories', memory);
  showToast('这通电话已经记好啦');
  return memory;
}

async function summarizeCall() {
  const transcript = callState.callLogs
    .map((item) => `${item.role === 'user' ? '用户' : getCharacterName()}：${item.content}`)
    .join('\n');

  const content = await silentRequest({
    messages: [
      {
        role: 'system',
        content: '请把这通电话总结成一条长期记忆，最多80字，只写事实和情绪，不要写“总结如下”。'
      },
      {
        role: 'user',
        content: transcript
      }
    ],
    temperature: 0.4
  });

  return String(content || '').trim();
}

function fallbackSummary() {
  const userTexts = callState.callLogs
    .filter((item) => item.role === 'user')
    .map((item) => item.content)
    .join('；');

  if (!userTexts.trim()) return '';

  return `用户和${getCharacterName()}通了一次电话，聊到：${trimText(userTexts, 68)}`;
}

function addCallLog(role, content) {
  callState.callLogs.push({
    id: generateId('call'),
    role,
    content: String(content || '').trim(),
    timestamp: getNow()
  });
}

function speakText(text) {
  const content = String(text || '').trim();
  if (!content) return;

  playTTS(content).catch(() => {
    // TTS 失败不影响通话文字
  });
}

function startTimer() {
  stopTimer();

  callState.timer = window.setInterval(() => {
    callState.seconds = Math.floor((Date.now() - callState.startedAt) / 1000);

    const timeEl = callState.hostEl?.querySelector('.chat-call-time');
    if (timeEl) {
      timeEl.textContent = formatDuration(callState.seconds);
    }
  }, 1000);
}

function stopTimer() {
  if (callState.timer) {
    window.clearInterval(callState.timer);
    callState.timer = null;
  }
}

function getCharacterName() {
  return callState.character?.name || 'TA';
}

function getCallSubtitle() {
  if (!callState.accepted) return '正在等你回应';
  if (callState.isSending) return '正在听你说';
  return '声音轻轻在线';
}

function cleanReply(text) {
  return String(text || '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .trim();
}

function formatDuration(seconds) {
  const value = Math.max(0, Number(seconds || 0));
  const minute = Math.floor(value / 60);
  const second = value % 60;

  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function similarText(a, b) {
  const left = String(a || '').replace(/\s+/g, '');
  const right = String(b || '').replace(/\s+/g, '');

  if (!left || !right) return false;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;

  return left.slice(0, 24) === right.slice(0, 24);
}

function trimText(text, max) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function getInitial(name) {
  const text = String(name || '').trim();
  return text ? text.slice(0, 1).toUpperCase() : 'A';
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function injectStyle() {
  if (document.getElementById(CALL_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = CALL_STYLE_ID;
  style.textContent = `
    .chat-call-screen {
      position: fixed;
      inset: 0;
      z-index: 999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: calc(18px + env(safe-area-inset-top)) 20px calc(18px + env(safe-area-inset-bottom));
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .chat-call-top {
      flex: 0 0 auto;
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 42px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    .chat-call-center {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 28px 0 12px;
    }

    .chat-call-avatar {
      width: 104px;
      height: 104px;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 36px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-md);
      font-size: 32px;
      font-weight: 600;
    }

    .chat-call-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .chat-call-name {
      margin-top: 18px;
      color: var(--text-primary);
      font-size: 22px;
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-call-subtitle {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.5;
    }

    .chat-call-incoming-hint {
      width: 100%;
      max-width: 320px;
      margin-top: 30px;
      padding: 18px;
      border-radius: 24px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      text-align: center;
    }

    .chat-call-incoming-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.45;
    }

    .chat-call-incoming-desc {
      margin-top: 6px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .chat-call-log {
      width: 100%;
      max-width: 560px;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 24px;
      padding: 0 0 8px;
      -webkit-overflow-scrolling: touch;
    }

    .chat-call-empty {
      margin: auto;
      max-width: 260px;
      color: var(--text-secondary);
      font-size: var(--font-size-base);
      line-height: 1.6;
      text-align: center;
    }

    .chat-call-line {
      max-width: 82%;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px 14px;
      border-radius: 20px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      animation: chatCallIn 200ms ease both;
    }

    .chat-call-line.role-user {
      align-self: flex-end;
      background: var(--bubble-user-bg);
      color: var(--bubble-user-text);
    }

    .chat-call-line.role-assistant {
      align-self: flex-start;
      color: var(--text-primary);
    }

    .chat-call-line-author {
      opacity: 0.72;
      font-size: 12px;
      line-height: 1.35;
    }

    .chat-call-line-text {
      font-size: var(--font-size-base);
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .chat-call-input-wrap {
      flex: 0 0 auto;
      width: 100%;
      max-width: 640px;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: end;
      gap: 10px;
      margin: 0 auto 12px;
    }

    .chat-call-input {
      width: 100%;
      min-height: 44px;
      max-height: 120px;
      resize: none;
      padding: 10px 14px;
      border-radius: 18px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: 16px;
      line-height: 1.6;
      -webkit-appearance: none;
      appearance: none;
    }

    .chat-call-input::placeholder {
      color: var(--text-hint);
    }

    .chat-call-send {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 14px;
      border-radius: 18px;
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 14px;
      transition: all 200ms ease;
    }

    .chat-call-controls {
      flex: 0 0 auto;
      display: flex;
      justify-content: center;
      gap: 12px;
    }

    .chat-call-control {
      min-width: 108px;
      min-height: 46px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 0 16px;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 14px;
      transition: all 200ms ease;
    }

    .chat-call-control.primary,
    .chat-call-control.danger {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-call-control.ghost {
      background: var(--bg-card);
      color: var(--text-secondary);
    }

    .chat-call-send:active,
    .chat-call-control:active {
      transform: scale(0.96);
    }

    @keyframes chatCallIn {
      from {
        opacity: 0;
        transform: translateY(6px) scale(0.99);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .chat-call-line {
        animation: none;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../../core/storage.js(generateId,getNow,setDB,getByIndexDB)；../../core/ui.js(createIcon,showToast)；../../core/api.js(silentRequest)；../../core/tts.js(playTTS,stopAll)
