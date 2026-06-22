// apps/chat/thread-call.js
// imports:
//   from '../../core/storage.js': generateId, getNow, setDB
//   from '../../core/ui.js': createIcon, showToast
//   from '../../core/tts.js': playTTS
//   from '../../core/api.js': silentRequest
//   from '../../core/memory.js': buildMemoryPrompt

import {
  generateId,
  getNow,
  setDB
} from '../../core/storage.js';

import {
  createIcon,
  showToast
} from '../../core/ui.js';

import { playTTS } from '../../core/tts.js';
import { silentRequest } from '../../core/api.js';
import { buildMemoryPrompt } from '../../core/memory.js';

let callTimer = null;
let callTts = null;

export function openThreadCall(ctx) {
  if (!ctx?.state?.currentCharacter) {
    showToast('群聊暂时不能打电话');
    return;
  }

  closeThreadCall(ctx, { silent: true });

  const character = ctx.state.currentCharacter;

  ctx.setActiveCall({
    status: 'waiting',
    startedAt: 0,
    logs: [],
    characterId: character.id
  });

  renderCallPage(ctx);
}

export function closeThreadCall(ctx, options = {}) {
  clearCallTimer();
  stopCallTts();

  const page = ctx?.state?.rootEl?.querySelector('.call-page');
  if (page) page.remove();

  ctx?.setActiveCall?.(null);

  if (!options.silent) {
    ctx?.rerenderThread?.({ scroll: true });
  }
}

function renderCallPage(ctx) {
  const rootEl = ctx.state.rootEl;
  const character = ctx.state.currentCharacter;
  const call = ctx.state.activeCall;

  if (!rootEl || !character || !call) return;

  rootEl.querySelector('.call-page')?.remove();

  const page = el('section', 'call-page show');

  if (character.chatBackground) {
    page.style.backgroundImage = `url("${character.chatBackground}")`;
    page.style.backgroundSize = 'cover';
    page.style.backgroundPosition = 'center';
    page.classList.add('has-chat-bg');
  }

  const nav = createCallNav(ctx);
  const hero = createCallHero(ctx);
  const log = createCallLog(ctx);
  const input = createCallInput(ctx);
  const controls = createCallControls(ctx);

  page.append(nav, hero, log, input, controls);
  rootEl.appendChild(page);

  scrollCallLog(page);
}

function createCallNav(ctx) {
  const character = ctx.state.currentCharacter;

  const nav = el('header', 'call-nav');

  const close = iconButton('close', '关闭电话');
  close.addEventListener('click', () => closeThreadCall(ctx));

  nav.append(
    close,
    el('div', 'call-nav-name', character.name || '通话'),
    el('span', 'call-nav-space')
  );

  return nav;
}

function createCallHero(ctx) {
  const character = ctx.state.currentCharacter;
  const call = ctx.state.activeCall;

  const hero = el('section', 'call-hero');

  hero.append(
    createAvatar(character.avatar, character.name || 'TA', 'xl'),
    el('div', 'call-name', character.name || 'TA'),
    el('div', 'call-status', getCallStatusText(call))
  );

  return hero;
}

function createCallLog(ctx) {
  const log = el('main', 'call-log');
  log.id = 'call-log';

  const call = ctx.state.activeCall;

  if (!call.logs.length) {
    log.appendChild(el('div', 'call-empty-text', '接通后，你们说的话会显示在这里。'));
    return log;
  }

  call.logs.forEach((item) => {
    const line = el('div', `call-line ${item.role === 'user' ? 'user' : 'assistant'}`);
    line.append(
      el('div', 'call-line-name', item.role === 'user' ? ctx.getCurrentUserDisplayProfile().name || '我' : ctx.getSpeakerName(item.characterId)),
      el('div', 'call-line-content', item.content || '')
    );
    log.appendChild(line);
  });

  return log;
}

function createCallInput(ctx) {
  const call = ctx.state.activeCall;
  const inputBar = el('footer', 'call-input-bar');

  const textarea = document.createElement('textarea');
  textarea.className = 'call-input';
  textarea.placeholder = call.status === 'connected' ? '在电话里说点什么' : '接听后就可以打字';
  textarea.rows = 1;
  textarea.disabled = call.status !== 'connected' || ctx.state.isSending;

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(116, textarea.scrollHeight)}px`;
  });

  textarea.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      await submitCallText(ctx, textarea);
    }
  });

  const send = iconButton('send', '发送');
  send.disabled = call.status !== 'connected' || ctx.state.isSending;
  send.addEventListener('click', () => submitCallText(ctx, textarea));

  inputBar.append(textarea, send);
  return inputBar;
}

function createCallControls(ctx) {
  const call = ctx.state.activeCall;
  const controls = el('footer', 'call-controls');

  if (call.status === 'waiting') {
    const answer = button('接听', 'primary', 'phone');
    answer.addEventListener('click', () => answerCall(ctx));

    const hang = button('挂断', 'ghost', 'close');
    hang.addEventListener('click', () => closeThreadCall(ctx));

    controls.append(answer, hang);
    return controls;
  }

  const hang = button('挂断', 'primary', 'close');
  hang.classList.add('call-hang-btn');
  hang.addEventListener('click', () => closeThreadCall(ctx));

  controls.appendChild(hang);
  return controls;
}

function answerCall(ctx) {
  const call = ctx.state.activeCall;
  if (!call) return;

  call.status = 'connecting';
  call.startedAt = 0;
  ctx.setActiveCall(call);
  renderCallPage(ctx);

  window.setTimeout(() => {
    const next = ctx.state.activeCall;
    if (!next) return;

    next.status = 'connected';
    next.startedAt = Date.now();
    ctx.setActiveCall(next);

    startCallTimer(ctx);
    renderCallPage(ctx);

    requestAnimationFrame(() => {
      ctx.state.rootEl?.querySelector('.call-input')?.focus();
    });
  }, 700);
}

async function submitCallText(ctx, textarea) {
  const text = String(textarea.value || '').trim();
  const call = ctx.state.activeCall;

  if (!text || !call || call.status !== 'connected' || ctx.state.isSending) return;

  textarea.value = '';
  textarea.style.height = 'auto';

  const character = ctx.state.currentCharacter;
  if (!character) return;

  const userMessage = createMessage({
    role: 'user',
    characterId: character.id,
    content: `[电话] ${text}`,
    type: 'text'
  });

  call.logs.push({
    id: userMessage.id,
    role: 'user',
    characterId: 'user',
    content: text,
    timestamp: userMessage.timestamp
  });

  ctx.setActiveCall(call);
  ctx.setSending(true);
  renderCallPage(ctx);

  try {
    await setDB('messages', userMessage.id, userMessage);
    ctx.updateCurrentMessage(userMessage);
    await ctx.updateLatestPrivateCache(character.id);

    const assistantMessage = await generateCallAssistantReply(ctx);

    const latestCall = ctx.state.activeCall;
    if (!latestCall || !assistantMessage) return;

    latestCall.logs.push({
      id: assistantMessage.id,
      role: 'assistant',
      characterId: assistantMessage.characterId,
      content: stripPhonePrefix(assistantMessage.content),
      timestamp: assistantMessage.timestamp || getNow()
    });

    ctx.setActiveCall(latestCall);
    await ctx.updateLatestPrivateCache(character.id);
    renderCallPage(ctx);

    playCallVoice(ctx, assistantMessage);
  } catch (error) {
    console.error('[chat/thread-call] call reply failed', error);
    showToast('电话里的回复没有接住');

    const latestCall = ctx.state.activeCall;
    if (latestCall) {
      latestCall.logs.push({
        id: generateId(),
        role: 'assistant',
        characterId: character.id,
        content: '我刚刚没听清，你再说一遍。',
        timestamp: getNow()
      });

      ctx.setActiveCall(latestCall);
      renderCallPage(ctx);
    }
  } finally {
    ctx.setSending(false);
    renderCallPage(ctx);
  }
}

async function generateCallAssistantReply(ctx) {
  const character = ctx.state.currentCharacter;
  const config = ctx.getChatConfig(character.id);

  const assistantMessage = createMessage({
    role: 'assistant',
    characterId: character.id,
    content: '',
    type: 'text'
  });

  const systemPrompt = await buildCallSystemPrompt(ctx, character, config);
  const messages = buildCallMessages(ctx);
  const endpointId = config.endpointId || resolveCharacterEndpointId(character);
  const model = config.model || resolveCharacterModel(character);

  let content = await silentRequest({
    messages,
    systemPrompt,
    endpointId,
    model
  });

  content = stripPhonePrefix(content).trim() || '我在听，你慢慢说。';

  assistantMessage.content = `[电话] ${content}`;

  await setDB('messages', assistantMessage.id, assistantMessage);
  ctx.updateCurrentMessage(assistantMessage);

  return assistantMessage;
}

async function buildCallSystemPrompt(ctx, character, config) {
  const parts = [];

  parts.push(character.systemPrompt || `你是${character.name || 'AI'}，正在和用户通电话。`);

  if (config.memoryEnabled !== false) {
    const memory = await buildMemoryPrompt(character.id).catch(() => '');
    if (memory) parts.push(memory);
  }

  const userProfile = ctx.getCurrentUserDisplayProfile();

  parts.push([
    '[电话模式]',
    `用户昵称：${userProfile.name || '用户'}。`,
    '你正在和用户打字电话：用户打字，你用自然口吻回复，回复会被 TTS 读出来。',
    '回复要像电话里说话，短一点、口语一点、有停顿感。',
    '不要写动作描写，不要写旁白，不要输出 markdown。',
    '不要说你是文字电话，也不要解释规则。',
    '只输出你要说的话。'
  ].join('\n'));

  return parts.filter(Boolean).join('\n\n');
}

function buildCallMessages(ctx) {
  return ctx.state.messages
    .filter((item) => item.role === 'user' || item.role === 'assistant')
    .slice(-18)
    .map((item) => ({
      role: item.role,
      content: stripPhonePrefix(item.content)
    }))
    .filter((item) => item.content);
}

function playCallVoice(ctx, message) {
  const text = stripPhonePrefix(message?.content);
  if (!text) return;

  const character = ctx.getCharacterById(message.characterId) || ctx.state.currentCharacter;
  const config = ctx.getChatConfig(character?.id || ctx.getChatTargetId());
  const ttsConfig = resolveTtsConfig(ctx, character, config);

  if (!ttsConfig?.enabled && !ttsConfig?.voiceId && !ttsConfig?.id) return;

  stopCallTts();

  try {
    callTts = playTTS(text, ttsConfig);
  } catch (_) {
    callTts = null;
  }
}

function resolveTtsConfig(ctx, character, config = {}) {
  const settings = ctx.getSettings();
  const voices = ctx.normalizeArray(settings.ttsVoices);

  const selectedVoice = config.ttsVoiceId
    ? voices.find((item) => item.id === config.ttsVoiceId)
    : null;

  return {
    ...(character?.ttsConfig || {}),
    ...(selectedVoice || {}),
    enabled: config.ttsEnabled || character?.ttsConfig?.enabled || selectedVoice?.enabled || false,
    voiceId: config.ttsVoiceId || selectedVoice?.voiceId || selectedVoice?.id || character?.ttsConfig?.voiceId || ''
  };
}

function startCallTimer(ctx) {
  clearCallTimer();

  callTimer = window.setInterval(() => {
    const page = ctx.state.rootEl?.querySelector('.call-page');
    const status = page?.querySelector('.call-status');
    if (!status || !ctx.state.activeCall) return;

    status.textContent = getCallStatusText(ctx.state.activeCall);
  }, 1000);
}

function clearCallTimer() {
  if (callTimer) {
    window.clearInterval(callTimer);
    callTimer = null;
  }
}

function stopCallTts() {
  if (callTts?.stop) {
    try {
      callTts.stop();
    } catch (_) {}
  }

  callTts = null;
}

function getCallStatusText(call) {
  if (!call) return '';

  if (call.status === 'waiting') return '等待接听';
  if (call.status === 'connecting') return '接通中';
  if (call.status === 'connected') return call.startedAt ? `已接听 ${formatDuration(Date.now() - call.startedAt)}` : '已接听';

  return '通话中';
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const minute = Math.floor(total / 60);
  const second = total % 60;

  return `${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
}

function scrollCallLog(page) {
  requestAnimationFrame(() => {
    const log = page?.querySelector('#call-log');
    if (!log) return;

    log.scrollTo({
      top: log.scrollHeight,
      behavior: 'smooth'
    });
  });
}

function stripPhonePrefix(text) {
  return String(text || '').replace(/^\[电话\]\s*/, '').trim();
}

function createMessage(data = {}) {
  return {
    id: data.id || generateId(),
    role: data.role || 'user',
    content: data.content || '',
    thinking: data.thinking || '',
    thinkingSummary: data.thinkingSummary || '',
    thinkingTimeMs: Number(data.thinkingTimeMs || 0),
    characterId: data.characterId || '',
    groupId: data.groupId || '',
    type: data.type || 'text',
    imageBase64: data.imageBase64 || '',
    stickerId: data.stickerId || '',
    transferAmount: Number(data.transferAmount || 0),
    transferTargetId: data.transferTargetId || '',
    timestamp: data.timestamp || getNow(),
    toolCalls: Array.isArray(data.toolCalls) ? data.toolCalls : [],
    autoVoice: Boolean(data.autoVoice),
    voiceAutoPlaying: Boolean(data.voiceAutoPlaying)
  };
}

function resolveCharacterEndpointId(character) {
  if (!character?.apiConfig || character.apiConfig.useGlobal !== false) return '';
  return character.apiConfig.endpointId || '';
}

function resolveCharacterModel(character) {
  if (!character?.apiConfig || character.apiConfig.useGlobal !== false) return '';
  return character.apiConfig.model || '';
}

function iconButton(iconName, label) {
  const btn = el('button', 'chat-icon-btn');
  btn.type = 'button';
  btn.setAttribute('aria-label', label || iconName);
  btn.appendChild(createIcon(iconName, 20));
  return btn;
}

function button(text, variant = 'ghost', iconName = '') {
  const btn = el('button', variant === 'primary' ? 'chat-primary-btn' : 'chat-ghost-btn');
  btn.type = 'button';

  if (iconName) btn.appendChild(createIcon(iconName, 16));
  btn.appendChild(el('span', '', text));

  return btn;
}

function createAvatar(src, name = '', size = 'md') {
  const avatar = el('span', `chat-avatar chat-avatar-${size}`);

  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitial(name);
  }

  return avatar;
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

// 改了什么：修复电话回复时最后一句用户消息重复进入 AI 上下文的问题。
// 会不会影响其他文件：不会。
// 更新记忆里该文件的导出函数：openThreadCall(ctx)、closeThreadCall(ctx, options)
// 依赖：../../core/storage.js(generateId,getNow,setDB)；../../core/ui.js(createIcon,showToast)；../../core/tts.js(playTTS)；../../core/api.js(silentRequest)；../../core/memory.js(buildMemoryPrompt)
