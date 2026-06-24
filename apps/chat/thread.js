// apps/chat/thread.js
// imports:
//   from '../../core/storage.js': getData, setData, getDB, setDB, getAllDB, getByIndexDB, generateId, getNow
//   from '../../core/ui.js': createIcon, showToast, showBottomSheet, hideBottomSheet
//   from '../../core/tts.js': stopAll
// dynamic imports:
//   from './thread-render.js': renderThreadMessages
//   from './thread-actions.js': sendThreadMessage, sendImageMessage, sendStickerMessage, sendTransferMessage, sendCardMessage, sendDiceMessage, sendRpsMessage
//   from './thread-call.js': mountThreadCall, unmountThreadCall
//   from './thread-ai.js': checkThreadProactiveMessages

import {
  getData,
  setData,
  getDB,
  setDB,
  getAllDB,
  getByIndexDB,
  generateId,
  getNow
} from '../../core/storage.js';

import { createIcon, showToast, showBottomSheet, hideBottomSheet } from '../../core/ui.js';
import { stopAll } from '../../core/tts.js';

const THREAD_STYLE_ID = 'chat-thread-style';
const PAGE_SIZE = 50;
const COMPACT_CONTEXT_COUNT = 12;
const TOOL_PAGE_SIZE = 6;
const MAX_TEXT_FILE_SIZE = 900 * 1024;
const MAX_IMAGE_FILE_SIZE = 4 * 1024 * 1024;
const FILE_CHUNK_SIZE = 12000;
const PROACTIVE_CHECK_INTERVAL = 60 * 1000;

const DEFAULT_CHAT_CONFIG = {
  proactiveMode1Enabled: false,
  proactiveMode1Minutes: 30,
  proactiveMode2Enabled: false,
  proactiveMode2MinMinutes: 5,
  proactiveMode2MaxMinutes: 10,
  proactiveChance: 0.35,
  proactiveLastSentAt: null,
  proactiveAwaitingUserReply: false,
  proactiveNextCheckAt: null,
  readAt: null
};

const QUICK_REPLIES = [
  '我在听，你慢慢说。',
  '这句话我想认真回你。',
  '抱一下，先别急。',
  '那你现在最想让我怎么陪你？',
  '我有点想你了。'
];

const MOODS = [
  '今天有点累，想被轻轻陪着。',
  '今天心情不错，想分享一点小事。',
  '今天有点低落，希望你温柔一点。',
  '现在有点想撒娇。',
  '现在想安静待一会儿。'
];

const state = {
  rootEl: null,
  appState: null,
  mounted: false,
  mode: 'private',
  characterId: '',
  groupId: '',
  character: null,
  group: null,
  messages: [],
  groupMessages: [],
  visibleCount: PAGE_SIZE,
  quotedMessageId: '',
  editingMessageId: '',
  isSending: false,
  activeTtsMessageId: '',
  activeTts: false,
  displayMode: 'bubble',
  inputValue: '',
  searchValue: '',
  searchOpen: false,
  callMode: false,
  toolPage: 0,
  toolSheetEl: null,
  toolSwipeStartX: 0,
  toolSwipeStartY: 0,
  proactiveTimer: null,
  proactiveChecking: false,
  relationshipLock: null,
  relationshipPunishment: null,
  keyboardOpen: false,
  keyboardOffset: 0,
  keyboardViewportHandler: null
};

let renderThreadMessagesFn = null;
let sendThreadMessageFn = null;
let sendImageMessageFn = null;
let sendStickerMessageFn = null;
let sendTransferMessageFn = null;
let sendCardMessageFn = null;
let sendDiceMessageFn = null;
let sendRpsMessageFn = null;
let mountThreadCallFn = null;
let unmountThreadCallFn = null;
let checkThreadProactiveMessagesFn = null;

export async function mountChatThread(containerEl, options = {}) {
  state.rootEl = containerEl;
  state.appState = options.appState || null;
  state.mounted = true;
  state.mode = options.mode === 'group' ? 'group' : 'private';
  state.characterId = String(options.characterId || '').trim();
  state.groupId = String(options.groupId || '').trim();
  state.visibleCount = PAGE_SIZE;
  state.quotedMessageId = '';
  state.editingMessageId = '';
  state.inputValue = '';
  state.searchValue = '';
  state.searchOpen = false;
  state.callMode = false;
  state.toolPage = 0;
  state.toolSheetEl = null;
  state.toolSwipeStartX = 0;
  state.toolSwipeStartY = 0;
  state.displayMode = resolveDisplayMode();
  state.proactiveChecking = false;
  state.relationshipLock = null;
  state.relationshipPunishment = null;
  state.keyboardOpen = false;
  state.keyboardOffset = 0;

  injectStyle();
  setupKeyboardViewport();
  await loadThreadData();
  await loadOptionalModules();
  render();
  startProactiveChecks();
}

export function unmountChatThread() {
  state.mounted = false;
  stopAll();
  stopProactiveChecks();
  cleanupKeyboardViewport();

  if (typeof unmountThreadCallFn === 'function') {
    unmountThreadCallFn();
  }

  if (state.rootEl) {
    state.rootEl.replaceChildren();
  }

  state.rootEl = null;
  state.appState = null;
  state.character = null;
  state.group = null;
  state.messages = [];
  state.groupMessages = [];
  state.quotedMessageId = '';
  state.editingMessageId = '';
  state.inputValue = '';
  state.searchValue = '';
  state.searchOpen = false;
  state.activeTtsMessageId = '';
  state.activeTts = false;
  state.callMode = false;
  state.toolPage = 0;
  state.toolSheetEl = null;
  state.toolSwipeStartX = 0;
  state.toolSwipeStartY = 0;
  state.proactiveChecking = false;
  state.relationshipLock = null;
  state.relationshipPunishment = null;
  state.keyboardOpen = false;
  state.keyboardOffset = 0;
}

async function loadOptionalModules() {
  if (!renderThreadMessagesFn) {
    const mod = await import('./thread-render.js').catch(() => null);
    renderThreadMessagesFn = mod?.renderThreadMessages || null;
  }

  if (
    !sendThreadMessageFn ||
    !sendImageMessageFn ||
    !sendStickerMessageFn ||
    !sendTransferMessageFn ||
    !sendCardMessageFn ||
    !sendDiceMessageFn ||
    !sendRpsMessageFn
  ) {
    const mod = await import('./thread-actions.js').catch(() => null);
    sendThreadMessageFn = mod?.sendThreadMessage || null;
    sendImageMessageFn = mod?.sendImageMessage || null;
    sendStickerMessageFn = mod?.sendStickerMessage || null;
    sendTransferMessageFn = mod?.sendTransferMessage || null;
    sendCardMessageFn = mod?.sendCardMessage || null;
    sendDiceMessageFn = mod?.sendDiceMessage || null;
    sendRpsMessageFn = mod?.sendRpsMessage || null;
  }

  if (!mountThreadCallFn || !unmountThreadCallFn) {
    const mod = await import('./thread-call.js').catch(() => null);
    mountThreadCallFn = mod?.mountThreadCall || null;
    unmountThreadCallFn = mod?.unmountThreadCall || null;
  }

  if (!checkThreadProactiveMessagesFn) {
    const mod = await import('./thread-ai.js').catch(() => null);
    checkThreadProactiveMessagesFn = mod?.checkThreadProactiveMessages || null;
  }
}

async function loadThreadData() {
  state.displayMode = resolveDisplayMode();

  if (state.mode === 'group') {
    state.group = state.groupId ? await getDB('groups', state.groupId).catch(() => null) : null;
    state.groupMessages = normalizeArray(await getByIndexDB('group_messages', 'groupId', state.groupId).catch(() => []))
      .filter((item) => item?.id)
      .sort(sortByTimestamp);
    state.messages = [];
    state.relationshipLock = null;
    state.relationshipPunishment = null;
    return;
  }

  state.character = state.characterId ? await getDB('characters', state.characterId).catch(() => null) : null;
  state.messages = normalizeArray(await getByIndexDB('messages', 'characterId', state.characterId).catch(() => []))
    .filter((item) => item?.id)
    .sort(sortByTimestamp);
  state.groupMessages = [];
  await loadRelationshipState();
}

async function loadRelationshipState() {
  if (!state.characterId) {
    state.relationshipLock = null;
    state.relationshipPunishment = null;
    return;
  }

  const locks = normalizeArray(await getByIndexDB('relationship_locks', 'characterId', state.characterId).catch(() => []))
    .filter((item) => item?.status === 'active')
    .sort(sortByUpdatedAtDesc);

  const now = Date.now();
  let activeLock = null;

  for (const lock of locks) {
    const endsAt = new Date(lock.endsAt || 0).getTime();

    if (endsAt && endsAt <= now) {
      await setDB('relationship_locks', {
        ...lock,
        status: 'expired',
        updatedAt: getNow()
      });
      continue;
    }

    activeLock = lock;
    break;
  }

  state.relationshipLock = activeLock;

  if (activeLock?.punishmentId) {
    state.relationshipPunishment = await getDB('punishments', activeLock.punishmentId).catch(() => null);
  } else {
    state.relationshipPunishment = null;
  }
}

function render() {
  if (!state.rootEl || !state.mounted) return;

  const page = el('section', `chat-page chat-thread-page mode-${state.displayMode}`);
  page.dataset.locked = getRelationshipLockLevel() ? 'true' : 'false';
  page.dataset.keyboard = state.keyboardOpen ? 'true' : 'false';
  page.style.setProperty('--chat-keyboard-offset', `${state.keyboardOffset}px`);
  page.append(createHeader());

  if (state.searchOpen) {
    page.append(createSearchCard());
  }

  page.append(createMessageArea(), createInputBar());
  state.rootEl.replaceChildren(page);

  if (typeof renderThreadMessagesFn === 'function') {
    renderThreadMessagesFn(state, page);
  } else {
    renderFallbackMessages(page);
  }
}

function setupKeyboardViewport() {
  cleanupKeyboardViewport();

  state.keyboardViewportHandler = () => updateKeyboardViewport();

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', state.keyboardViewportHandler);
    window.visualViewport.addEventListener('scroll', state.keyboardViewportHandler);
  }

  window.addEventListener('resize', state.keyboardViewportHandler);
  updateKeyboardViewport();
}

function cleanupKeyboardViewport() {
  if (state.keyboardViewportHandler) {
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', state.keyboardViewportHandler);
      window.visualViewport.removeEventListener('scroll', state.keyboardViewportHandler);
    }

    window.removeEventListener('resize', state.keyboardViewportHandler);
    state.keyboardViewportHandler = null;
  }

  state.keyboardOffset = 0;
  state.keyboardOpen = false;
  document.documentElement.style.removeProperty('--chat-keyboard-offset');
}

function updateKeyboardViewport() {
  if (!state.mounted) return;

  const viewport = window.visualViewport;
  const layoutHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const visualHeight = viewport?.height || layoutHeight;
  const visualTop = viewport?.offsetTop || 0;
  const rawOffset = Math.max(0, layoutHeight - visualHeight - visualTop);
  const nextOffset = rawOffset > 80 ? Math.round(rawOffset) : 0;
  const nextOpen = nextOffset > 0 || isInputFocused();

  state.keyboardOffset = nextOffset;
  state.keyboardOpen = nextOpen;

  document.documentElement.style.setProperty('--chat-keyboard-offset', `${nextOffset}px`);

  const page = state.rootEl?.querySelector?.('.chat-thread-page');
  if (page) {
    page.dataset.keyboard = nextOpen ? 'true' : 'false';
    page.style.setProperty('--chat-keyboard-offset', `${nextOffset}px`);
  }
}

function handleComposerFocus() {
  state.keyboardOpen = true;
  window.setTimeout(updateKeyboardViewport, 40);
  window.setTimeout(updateKeyboardViewport, 260);
}

function handleComposerBlur() {
  window.setTimeout(() => {
    state.keyboardOpen = isInputFocused();
    if (!state.keyboardOpen) state.keyboardOffset = 0;
    updateKeyboardViewport();
  }, 80);
}

function isInputFocused() {
  const active = document.activeElement;
  return (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement
  );
}

function startProactiveChecks() {
  stopProactiveChecks();
  if (state.mode === 'group') return;
  if (isStrictLocked()) return;

  window.setTimeout(() => runProactiveCheck(), 500);

  state.proactiveTimer = window.setInterval(() => {
    runProactiveCheck();
  }, PROACTIVE_CHECK_INTERVAL);

  document.addEventListener('visibilitychange', handleProactiveVisibility);
  window.addEventListener('focus', handleProactiveVisibility);
}

function stopProactiveChecks() {
  if (state.proactiveTimer) {
    window.clearInterval(state.proactiveTimer);
    state.proactiveTimer = null;
  }

  document.removeEventListener('visibilitychange', handleProactiveVisibility);
  window.removeEventListener('focus', handleProactiveVisibility);
}

function handleProactiveVisibility() {
  if (!state.mounted || state.mode === 'group') return;
  runProactiveCheck();
}

async function runProactiveCheck() {
  if (!state.mounted || state.mode === 'group') return;
  if (isStrictLocked()) return;
  if (state.callMode || state.isSending || state.proactiveChecking) return;
  if (typeof checkThreadProactiveMessagesFn !== 'function') return;

  state.proactiveChecking = true;

  try {
    const message = await checkThreadProactiveMessagesFn(state, { incrementUnread: false });
    if (message) await reloadAndRender();
  } catch (error) {
    console.warn('proactive check failed', error);
  } finally {
    state.proactiveChecking = false;
  }
}

function createHeader() {
  const header = el('header', 'chat-thread-header');

  const back = iconButton('back', '返回');
  back.classList.add('chat-thread-back-btn');
  back.addEventListener('click', () => {
    stopAll();
    state.appState?.goList?.({ tab: state.mode === 'group' ? 'group' : 'private' });
  });

  const titleWrap = el('button', 'chat-thread-title-wrap');
  titleWrap.type = 'button';

  const titleText = el('div', 'chat-thread-title-text');
  titleText.append(
    el('div', 'chat-thread-name', getTargetName()),
    el('div', 'chat-thread-status', getStatusText())
  );

  titleWrap.append(createAvatar(getTargetAvatar(), getTargetName()), titleText);

  const actions = el('div', 'chat-thread-header-actions');

  const searchBtn = iconButton('search', state.searchOpen ? '收起搜索' : '搜索消息');
  searchBtn.classList.toggle('is-active', state.searchOpen);
  searchBtn.addEventListener('click', () => {
    state.searchOpen = !state.searchOpen;
    if (!state.searchOpen) state.searchValue = '';
    render();
  });

  if (state.mode !== 'group') {
    const memoryBtn = iconButton('memory', '记忆');
    memoryBtn.addEventListener('click', () => {
      state.appState?.openMemory?.(state.characterId, { fromRoute: state.appState?.getRoute?.() });
    });
    actions.append(memoryBtn);
  }

  const more = iconButton('more', '更多');
  more.addEventListener('click', () => openThreadSheet());

  actions.append(searchBtn, more);
  header.append(back, titleWrap, actions);
  return header;
}

function createSearchCard() {
  const wrap = el('section', 'chat-thread-search-card');

  const input = document.createElement('input');
  input.className = 'chat-input-card chat-thread-search';
  input.type = 'text';
  input.autocomplete = 'off';
  input.placeholder = '搜聊天内容';
  input.value = state.searchValue || '';

  input.addEventListener('input', () => {
    state.searchValue = input.value.trim();
    render();
  });

  input.addEventListener('focus', handleComposerFocus);
  input.addEventListener('blur', handleComposerBlur);

  const close = iconButton('close', '关闭搜索');
  close.addEventListener('click', () => {
    state.searchOpen = false;
    state.searchValue = '';
    blurActiveInput();
    render();
  });

  wrap.append(input, close);

  requestAnimationFrame(() => input.focus());
  return wrap;
}

function createMessageArea() {
  const area = el('main', 'chat-thread-area');
  const list = el('div', 'chat-thread-list');
  list.id = 'chat-thread-list';

  area.addEventListener('pointerdown', handleBlankAreaPointerDown);

  const allMessages = getAllCurrentMessages();
  const messages = getVisibleMessages();
  const hiddenCount = Math.max(0, allMessages.length - messages.length);

  if (hiddenCount > 0 && !state.searchValue) {
    list.appendChild(createLoadMoreButton(hiddenCount));
  }

  if (!messages.length) {
    list.appendChild(createEmptyThread());
  } else {
    messages.forEach((message) => {
      const row = el('div', 'chat-thread-row-wrap');
      row.dataset.messageId = message.id;
      row.appendChild(el('div', 'chat-thread-row-host'));
      list.appendChild(row);
    });
  }

  area.append(list);
  return area;
}

function handleBlankAreaPointerDown(event) {
  const target = event.target;

  if (!(target instanceof Element)) return;

  if (
    target.closest('button, input, textarea, select, a, [role="button"], .chat-thread-row-wrap, .chat-thread-input-bar, .bottom-sheet, .sheet-overlay')
  ) {
    return;
  }

  blurActiveInput();
}

function blurActiveInput() {
  const active = document.activeElement;

  if (
    active instanceof HTMLInputElement ||
    active instanceof HTMLTextAreaElement ||
    active instanceof HTMLSelectElement
  ) {
    active.blur();
  }
}

function createLoadMoreButton(hiddenCount) {
  const wrap = el('div', 'chat-load-more-wrap');
  const button = el('button', 'chat-load-more-btn');
  button.type = 'button';
  button.textContent = `还有 ${hiddenCount} 条旧消息，点一下慢慢看`;
  button.addEventListener('click', () => {
    state.visibleCount = Math.min(getAllCurrentMessages().length, state.visibleCount + PAGE_SIZE);
    render();
  });
  wrap.appendChild(button);
  return wrap;
}

function createInputBar() {
  const bar = el('footer', 'chat-thread-input-bar');

  if (getRelationshipLockLevel()) {
    bar.classList.add('is-relationship-locked');
    bar.appendChild(createRelationshipLockBar());
    return bar;
  }

  const add = iconButton('add', '工具');
  add.classList.add('chat-thread-tool-entry');
  add.addEventListener('click', () => openToolSheet());

  const textarea = document.createElement('textarea');
  textarea.className = 'chat-input-card chat-thread-input';
  textarea.placeholder = '慢慢说';
  textarea.rows = 1;
  textarea.value = state.inputValue || '';
  textarea.setAttribute('autocapitalize', 'off');
  textarea.setAttribute('autocomplete', 'off');
  textarea.setAttribute('autocorrect', 'off');
  textarea.setAttribute('spellcheck', 'false');
  textarea.setAttribute('enterkeyhint', 'send');

  textarea.addEventListener('input', () => {
    state.inputValue = textarea.value;
    autoResize(textarea);
  });

  textarea.addEventListener('focus', handleComposerFocus);
  textarea.addEventListener('blur', handleComposerBlur);

  textarea.addEventListener('keydown', async (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      await handleSend(textarea);
    }
  });

  const sticker = iconButton('smile', '表情包');
  sticker.classList.add('chat-thread-sticker-entry');
  sticker.addEventListener('click', () => openStickerSheet());

  const send = el('button', 'chat-primary-btn chat-thread-send');
  send.type = 'button';
  send.append(createIcon('send', 16));
  send.setAttribute('aria-label', '发送');
  send.addEventListener('click', () => handleSend(textarea));

  bar.append(add, textarea, sticker, send);

  requestAnimationFrame(() => autoResize(textarea));
  return bar;
}

function createRelationshipLockBar() {
  const lock = state.relationshipLock || {};
  const wrap = el('section', 'chat-relationship-lock-bar');

  const icon = el('span', 'chat-relationship-lock-icon');
  icon.appendChild(createIcon(lock.type === 'soft_block' ? 'ban' : 'lock', 18));

  const text = el('span', 'chat-relationship-lock-text');
  text.append(
    el('span', 'chat-relationship-lock-title', lock.title || 'TA 现在有点不想说话'),
    el('span', 'chat-relationship-lock-desc', getRelationshipLockText(lock))
  );

  const action = el('button', 'chat-relationship-lock-action');
  action.type = 'button';
  action.textContent = '看一下';
  action.addEventListener('click', openRelationshipLockSheet);

  wrap.append(icon, text, action);
  return wrap;
}

function getRelationshipLockLevel() {
  const lock = state.relationshipLock;
  if (!lock || lock.status !== 'active') return '';
  return String(lock.type || '');
}

function isStrictLocked() {
  return ['cooldown', 'soft_block', 'ultimatum'].includes(getRelationshipLockLevel());
}

function getRelationshipLockText(lock = state.relationshipLock) {
  if (!lock) return '';

  const left = getLockLeftText(lock);
  const base = lock.reason || state.relationshipPunishment?.description || '先给 TA 一点时间。';

  if (left) return `${base} ${left}`;
  return base;
}

function getLockLeftText(lock) {
  const endsAt = new Date(lock?.endsAt || 0).getTime();
  if (!endsAt) return '';

  const diff = Math.max(0, endsAt - Date.now());
  if (!diff) return '已经可以刷新看看啦。';

  const minutes = Math.ceil(diff / 60000);
  return `大约还要 ${minutes} 分钟。`;
}

function openRelationshipLockSheet() {
  const lock = state.relationshipLock || {};
  const punishment = state.relationshipPunishment || {};

  const sheet = el('div', 'chat-lock-sheet');
  const head = createMiniHead(lock.title || 'TA 正在闹别扭', '这不是永久拉黑，只是 TA 现在还没完全消气。');

  const card = el('section', 'chat-lock-card');
  card.append(
    el('div', 'chat-lock-card-title', punishment.title || lock.title || '需要一点哄哄'),
    el('div', 'chat-lock-card-desc', punishment.description || lock.reason || '等一小会儿，或者认真想想怎么哄 TA。'),
    el('div', 'chat-lock-card-time', getLockLeftText(lock) || '现在可以继续试试。')
  );

  const actions = el('div', 'chat-mini-actions');

  const close = el('button', 'chat-mini-btn ghost', '先等等');
  close.type = 'button';
  close.addEventListener('click', () => hideBottomSheet());

  const refresh = el('button', 'chat-mini-btn primary', '刷新状态');
  refresh.type = 'button';
  refresh.addEventListener('click', async () => {
    hideBottomSheet();
    await reloadAndRender();
  });

  actions.append(close, refresh);
  sheet.append(head, card, actions);
  showBottomSheet(sheet);
}

async function handleSend(textarea) {
  const text = String(textarea.value || '').trim();
  if (!text || state.isSending) return;

  if (getRelationshipLockLevel()) {
    openRelationshipLockSheet();
    return;
  }

  if (typeof sendThreadMessageFn !== 'function') {
    showToast('发送模块还没接上');
    return;
  }

  state.isSending = true;

  try {
    await sendThreadMessageFn(state, text);
    blurActiveInput();
  } finally {
    state.isSending = false;
  }

  textarea.value = '';
  state.inputValue = '';
  autoResize(textarea);
  await reloadAndRender();
}

async function sendPresetText(text, extra = {}) {
  const content = String(text || '').trim();
  if (!content || state.isSending) return;

  if (getRelationshipLockLevel()) {
    hideBottomSheet();
    openRelationshipLockSheet();
    return;
  }

  if (typeof sendThreadMessageFn !== 'function') {
    showToast('发送模块还没接上');
    return;
  }

  hideBottomSheet();
  state.isSending = true;

  try {
    await sendThreadMessageFn(state, content, extra);
    blurActiveInput();
  } finally {
    state.isSending = false;
  }

  await reloadAndRender();
}

async function sendSticker(sticker) {
  if (!sticker || state.isSending) return;

  if (getRelationshipLockLevel()) {
    hideBottomSheet();
    openRelationshipLockSheet();
    return;
  }

  if (typeof sendStickerMessageFn !== 'function') {
    showToast('表情包发送还没接上');
    return;
  }

  hideBottomSheet();
  state.isSending = true;

  try {
    await sendStickerMessageFn(state, sticker.id, {
      content: sticker.description || sticker.name || '[表情包]',
      stickerImageBase64: sticker.imageBase64 || sticker.image || sticker.dataUrl || '',
      stickerDescription: sticker.description || sticker.desc || ''
    });
    blurActiveInput();
  } finally {
    state.isSending = false;
  }

  await reloadAndRender();
}

async function handleDice() {
  if (state.isSending) return;

  if (getRelationshipLockLevel()) {
    hideBottomSheet();
    openRelationshipLockSheet();
    return;
  }

  if (typeof sendDiceMessageFn !== 'function') {
    showToast('骰子还没接上');
    return;
  }

  hideBottomSheet();
  state.isSending = true;

  try {
    const task = sendDiceMessageFn(state, { sides: 6 });
    blurActiveInput();
    await wait(60);
    await loadThreadData();
    render();
    await task;
  } finally {
    state.isSending = false;
  }

  await reloadAndRender();
}

async function handleRps() {
  if (state.isSending) return;

  if (getRelationshipLockLevel()) {
    hideBottomSheet();
    openRelationshipLockSheet();
    return;
  }

  if (typeof sendRpsMessageFn !== 'function') {
    showToast('石头剪刀布还没接上');
    return;
  }

  hideBottomSheet();
  state.isSending = true;

  try {
    const task = sendRpsMessageFn(state);
    blurActiveInput();
    await wait(60);
    await loadThreadData();
    render();
    await task;
  } finally {
    state.isSending = false;
  }

  await reloadAndRender();
}

async function handleTransfer(amount, note) {
  if (state.isSending) return;

  if (getRelationshipLockLevel()) {
    hideBottomSheet();
    openRelationshipLockSheet();
    return;
  }

  if (typeof sendTransferMessageFn !== 'function') {
    showToast('转账模块还没接上');
    return;
  }

  const value = Number(amount || 0);
  if (!Number.isFinite(value) || value <= 0) {
    showToast('金额要大于 0');
    return;
  }

  hideBottomSheet();
  state.isSending = true;

  try {
    await sendTransferMessageFn(state, value, String(note || '').trim());
    blurActiveInput();
  } finally {
    state.isSending = false;
  }

  await reloadAndRender();
}

async function handleUploadFile() {
  blurActiveInput();

  if (getRelationshipLockLevel()) {
    hideBottomSheet();
    openRelationshipLockSheet();
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = [
    'image/*',
    'text/*',
    '.txt',
    '.md',
    '.json',
    '.js',
    '.css',
    '.html',
    '.htm',
    '.csv',
    '.xml',
    '.yaml',
    '.yml'
  ].join(',');

  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    await processUploadFile(file);
  }, { once: true });

  input.click();
}

async function processUploadFile(file) {
  if (state.isSending) return;

  if (getRelationshipLockLevel()) {
    hideBottomSheet();
    openRelationshipLockSheet();
    return;
  }

  if (file.type.startsWith('image/')) {
    await sendUploadedImage(file);
    return;
  }

  if (!isReadableTextFile(file)) {
    showToast('这个格式先不支持');
    return;
  }

  if (file.size > MAX_TEXT_FILE_SIZE) {
    showToast('文件太大啦，先控制在 900KB 内');
    return;
  }

  await sendUploadedTextFile(file);
}

async function sendUploadedImage(file) {
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    showToast('图片有点大，先换一张小一点的');
    return;
  }

  if (typeof sendImageMessageFn !== 'function') {
    showToast('图片发送还没接上');
    return;
  }

  hideBottomSheet();
  state.isSending = true;

  try {
    const dataUrl = await readFileAsDataURL(file);
    await sendImageMessageFn(state, dataUrl, file.name ? `图片：${file.name}` : '[图片]');
    blurActiveInput();
  } finally {
    state.isSending = false;
  }

  await reloadAndRender();
}

async function sendUploadedTextFile(file) {
  if (typeof sendThreadMessageFn !== 'function') {
    showToast('发送模块还没接上');
    return;
  }

  hideBottomSheet();
  state.isSending = true;

  try {
    const text = await readFileAsText(file);
    const clean = String(text || '').trim();

    if (!clean) {
      await sendThreadMessageFn(state, `我上传了文件：${file.name || '未命名文件'}，但里面没有读到内容。`);
      blurActiveInput();
      return;
    }

    const chunks = splitFileText(clean, FILE_CHUNK_SIZE);
    const lang = inferCodeLang(file.name);

    if (chunks.length <= 1) {
      await sendThreadMessageFn(state, buildFileMessage(file, clean, lang));
      blurActiveInput();
      return;
    }

    showToast(`文件会分成 ${chunks.length} 段，最后再让 TA 回复`);

    for (let index = 0; index < chunks.length; index += 1) {
      const isLast = index === chunks.length - 1;
      const content = buildFileChunkMessage(file, chunks[index], lang, index + 1, chunks.length);
      await sendThreadMessageFn(state, content, { triggerAI: isLast });
      await loadThreadData();
      render();
      await wait(80);
    }

    blurActiveInput();
  } finally {
    state.isSending = false;
  }

  await reloadAndRender();
}
function buildFileMessage(file, text, lang) {
  const name = String(file.name || '未命名文件').trim();
  const clean = String(text || '').trim();

  if (lang) {
    return `我上传了文件：${name}\n\n\`\`\`${lang}\n${clean}\n\`\`\``;
  }

  return `我上传了文件：${name}\n\n${clean}`;
}

function buildFileChunkMessage(file, text, lang, index, total) {
  const name = String(file.name || '未命名文件').trim();
  const title = `我上传了文件：${name}\n这是第 ${index} / ${total} 段。${index === total ? '文件发完了，请你现在再一起阅读和回复。' : '先不要回复，等我把文件发完。'}`;

  if (lang) {
    return `${title}\n\n\`\`\`${lang}\n${String(text || '').trim()}\n\`\`\``;
  }

  return `${title}\n\n${String(text || '').trim()}`;
}

function splitFileText(text, size) {
  const source = String(text || '');
  const chunks = [];
  let start = 0;

  while (start < source.length) {
    let end = Math.min(start + size, source.length);

    if (end < source.length) {
      const softBreak = Math.max(
        source.lastIndexOf('\n\n', end),
        source.lastIndexOf('\n', end),
        source.lastIndexOf('。', end),
        source.lastIndexOf('.', end)
      );

      if (softBreak > start + Math.floor(size * 0.55)) {
        end = softBreak + 1;
      }
    }

    chunks.push(source.slice(start, end).trim());
    start = end;
  }

  return chunks.filter(Boolean);
}

function isReadableTextFile(file) {
  const name = String(file.name || '').toLowerCase();
  if (file.type.startsWith('text/')) return true;

  return ['.txt', '.md', '.json', '.js', '.css', '.html', '.htm', '.csv', '.xml', '.yaml', '.yml']
    .some((ext) => name.endsWith(ext));
}

function inferCodeLang(name) {
  const value = String(name || '').toLowerCase();

  if (value.endsWith('.html') || value.endsWith('.htm')) return 'html';
  if (value.endsWith('.css')) return 'css';
  if (value.endsWith('.js')) return 'js';
  if (value.endsWith('.json')) return 'json';
  if (value.endsWith('.md')) return 'md';
  if (value.endsWith('.csv')) return 'csv';
  if (value.endsWith('.xml')) return 'xml';
  if (value.endsWith('.yaml') || value.endsWith('.yml')) return 'yaml';

  return '';
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

async function reloadAndRender() {
  await loadThreadData();
  render();
}

function renderFallbackMessages(page) {
  const list = page.querySelector('#chat-thread-list');
  if (!list) return;

  const messages = getVisibleMessages();
  if (!messages.length) return;

  list.replaceChildren();

  messages.forEach((message) => {
    const row = el('article', `chat-thread-fallback-message role-${message.role || 'assistant'}`);
    row.append(
      el('div', 'chat-thread-fallback-author', getMessageAuthorName(message)),
      el('div', 'chat-thread-fallback-content', getMessageText(message))
    );
    list.appendChild(row);
  });
}

function createEmptyThread() {
  const empty = el('section', 'chat-empty');
  empty.append(
    el('div', 'chat-empty-title', '还没开始说话'),
    el('div', 'chat-empty-desc', '先发一句，TA 就会接住。')
  );
  return empty;
}

function createAvatar(src, name = '') {
  const avatar = el('span', 'chat-thread-avatar');

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

function getTargetAvatar() {
  return state.mode === 'group' ? state.group?.avatar || '' : state.character?.avatar || '';
}

function getTargetName() {
  return state.mode === 'group' ? state.group?.name || '群聊' : state.character?.name || '聊天';
}

function getMessageAuthorName(message) {
  if (message.role === 'user') {
    const user = getUserProfile();
    return user.name || '我';
  }

  if (state.mode === 'group') {
    return message.characterName || 'TA';
  }

  return state.character?.name || 'TA';
}

function getMessageText(message) {
  if (message.type === 'image') return '[图片]';
  if (message.type === 'sticker') return `[表情包] ${message.stickerDescription || message.content || ''}`.trim();
  if (message.type === 'transfer') return `[转账 ${Number(message.transferAmount || 0)}]`;
  if (['gift', 'shop_item', 'shop-item', 'purchase', 'item'].includes(String(message.type || ''))) {
    return `[小卡片] ${message.itemName || message.title || message.name || message.content || ''}`.trim();
  }
  if (message.type === 'voice') return '[语音]';
  if (message.type === 'dice') return `[骰子 ${Number(message.diceValue || 0) || ''}]`;
  if (message.type === 'rps') return `[石头剪刀布 ${getRpsLabel(message.rpsChoice)}]`;

  return String(message.content || '').trim() || '[消息]';
}

function getUserProfile() {
  const settings = getData('app_settings') || {};
  const appUser = getData('app_user') || {};
  const profiles = getData('user_profiles') || [];
  const activeId = getData('active_user_profile_id') || settings.activeUserProfileId || '';

  if (Array.isArray(profiles) && profiles.length) {
    const active = profiles.find((item) => item.id === activeId) || profiles.find((item) => item.isDefault) || profiles[0];
    return {
      ...appUser,
      ...active
    };
  }

  const user = settings.user || appUser || {};
  return user && typeof user === 'object' ? user : {};
}

function getStatusText() {
  if (state.mode === 'group') {
    const count = normalizeArray(state.group?.memberIds).length;
    return `${count} 个成员`;
  }

  if (state.relationshipLock) {
    if (state.relationshipLock.type === 'soft_block') return 'TA 暂时躲起来了';
    if (state.relationshipLock.type === 'cooldown') return 'TA 现在有点冷';
    if (state.relationshipLock.type === 'ultimatum') return '等你认真解释';
    return 'TA 还在闹别扭';
  }

  const last = state.messages[state.messages.length - 1];
  if (!last) return '还没有聊天记录';

  const time = new Date(last.timestamp || 0).getTime();
  if (!time) return '在线';

  const diff = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;

  if (diff < minute) return '刚刚在线';
  if (diff < hour) return `${Math.floor(diff / minute)}分钟前`;
  if (diff < 24 * hour) return `${Math.floor(diff / hour)}小时前`;

  return '今天来过';
}

function getAllCurrentMessages() {
  return state.mode === 'group' ? state.groupMessages : state.messages;
}

function getVisibleMessages() {
  const list = getAllCurrentMessages();
  const q = String(state.searchValue || '').trim().toLowerCase();
  const visible = list.slice(Math.max(0, list.length - state.visibleCount));

  if (!q) return visible;

  return visible.filter((message) => {
    return [
      message.content,
      message.stickerDescription,
      message.quoteText,
      message.thinkingSummary,
      message.itemName,
      message.itemDesc,
      message.title,
      message.description
    ].some((item) => String(item || '').toLowerCase().includes(q));
  });
}

function resolveDisplayMode() {
  const settings = getData('app_settings') || {};
  return settings.bubbleMode === 'dialog' ? 'dialog' : 'bubble';
}

function openThreadSheet() {
  const sheet = el('div', 'chat-thread-sheet');
  const content = el('div', 'chat-thread-sheet-content');

  const locked = Boolean(getRelationshipLockLevel());

  const quickReplyBtn = el('button', 'chat-thread-sheet-item');
  quickReplyBtn.type = 'button';
  quickReplyBtn.textContent = '快捷回复';
  quickReplyBtn.disabled = locked;
  quickReplyBtn.addEventListener('click', () => locked ? openRelationshipLockSheet() : openQuickReplySheet());

  const callBtn = el('button', 'chat-thread-sheet-item');
  callBtn.type = 'button';
  callBtn.textContent = '电话';
  callBtn.disabled = locked;
  callBtn.addEventListener('click', () => locked ? openRelationshipLockSheet() : openCallFromTool());

  const configBtn = el('button', 'chat-thread-sheet-item');
  configBtn.type = 'button';
  configBtn.textContent = '配置';
  configBtn.addEventListener('click', () => openConfigSheet());

  const clearBtn = el('button', 'chat-thread-sheet-item');
  clearBtn.type = 'button';
  clearBtn.textContent = '清上下文';
  clearBtn.addEventListener('click', () => openClearContextSheet());

  content.append(quickReplyBtn, callBtn, configBtn, clearBtn);

  if (locked) {
    const lockBtn = el('button', 'chat-thread-sheet-item chat-thread-sheet-wide');
    lockBtn.type = 'button';
    lockBtn.textContent = '看看 TA 为什么闹别扭';
    lockBtn.addEventListener('click', openRelationshipLockSheet);
    content.append(lockBtn);
  }

  sheet.append(content);
  showBottomSheet(sheet);
}

function openQuickReplySheet() {
  if (getRelationshipLockLevel()) {
    hideBottomSheet();
    openRelationshipLockSheet();
    return;
  }

  const sheet = el('div', 'chat-mini-sheet');
  const head = createMiniHead('挑一句轻轻发出去', '点一下就会直接发送。');
  const list = el('div', 'chat-choice-list');

  QUICK_REPLIES.forEach((text) => {
    const button = el('button', 'chat-choice-item', text);
    button.type = 'button';
    button.addEventListener('click', () => sendPresetText(text));
    list.appendChild(button);
  });

  sheet.append(head, list);
  showBottomSheet(sheet);
}

function openVoiceTextSheet() {
  if (getRelationshipLockLevel()) {
    hideBottomSheet();
    openRelationshipLockSheet();
    return;
  }

  const sheet = el('div', 'chat-mini-sheet');
  const head = createMiniHead('文字版语音', '静态网页不能录音，这里会发一条语音文字。');
  const field = createTextAreaField('想说的话', '比如：这句想当作语音发给你');

  const actions = createSheetActions('取消', '发送语音文字', () => {
    const text = field.input.value.trim();
    if (!text) {
      showToast('先写一点内容');
      return;
    }
    sendPresetText(text, { type: 'voice' });
  });

  sheet.append(head, field.wrap, actions);
  showBottomSheet(sheet);
  requestAnimationFrame(() => field.input.focus());
}

async function openStickerSheet() {
  if (getRelationshipLockLevel()) {
    hideBottomSheet();
    openRelationshipLockSheet();
    return;
  }

  const sheet = el('div', 'chat-sticker-sheet');
  const head = el('div', 'chat-sticker-head');

  const title = el('div', 'chat-sticker-title', '表情包');
  const subtitle = el('div', 'chat-sticker-subtitle', '图片会小小地发送，描述会给 TA 理解。');

  const upload = el('button', 'chat-sticker-upload-btn');
  upload.type = 'button';
  upload.append(createInlineIcon('upload'), el('span', '', '上传'));
  upload.addEventListener('click', () => openStickerUploadSheet());

  head.append(el('div', '', ''), upload);
  head.firstChild.append(title, subtitle);

  const stickers = await loadStickers();
  const grid = el('div', 'chat-sticker-icon-grid');

  if (!stickers.length) {
    const empty = el('section', 'chat-sticker-empty');
    empty.append(
      el('div', 'chat-sticker-empty-title', '还没有表情包'),
      el('div', 'chat-sticker-empty-desc', '先上传一张，再写一句给 TA 理解的描述。')
    );
    grid.appendChild(empty);
  } else {
    stickers.forEach((sticker) => {
      grid.appendChild(createStickerIconButton(sticker));
    });
  }

  sheet.append(head, grid);
  showBottomSheet(sheet);
}

async function loadStickers() {
  const list = await getAllDB('stickers').catch(() => []);
  return normalizeArray(list)
    .filter((item) => item?.id && (item.imageBase64 || item.image || item.dataUrl || item.description || item.name))
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}

function createStickerIconButton(sticker) {
  const button = el('button', 'chat-sticker-icon-btn');
  button.type = 'button';

  const image = String(sticker.imageBase64 || sticker.image || sticker.dataUrl || '').trim();
  const desc = String(sticker.description || sticker.desc || sticker.name || '').trim();

  const icon = el('span', 'chat-sticker-icon-img-wrap');

  if (image) {
    const img = document.createElement('img');
    img.src = image;
    img.alt = '';
    icon.appendChild(img);
  } else {
    icon.textContent = getInitial(desc || '表情');
  }

  button.append(icon, el('span', 'chat-sticker-icon-name', desc || '表情包'));
  button.addEventListener('click', () => sendSticker(sticker));

  return button;
}

function openStickerUploadSheet() {
  if (getRelationshipLockLevel()) {
    hideBottomSheet();
    openRelationshipLockSheet();
    return;
  }

  const sheet = el('div', 'chat-sticker-upload-sheet');
  const head = createMiniHead('上传表情包', '选一张图片，再写一句描述给 TA 理解。');

  const preview = el('div', 'chat-sticker-upload-preview');
  preview.textContent = '还没选择图片';

  const pick = el('button', 'chat-mini-btn ghost', '选择图片');
  pick.type = 'button';

  const field = createTextAreaField('描述', '比如：一只小猫委屈地看着你，好像想被哄。');
  let imageBase64 = '';

  pick.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;

      if (file.size > MAX_IMAGE_FILE_SIZE) {
        showToast('图片有点大，先换一张小一点的');
        return;
      }

      imageBase64 = await readFileAsDataURL(file);
      preview.replaceChildren();

      const img = document.createElement('img');
      img.src = imageBase64;
      img.alt = '';
      preview.appendChild(img);
    }, { once: true });

    input.click();
  });

  const actions = createSheetActions('取消', '保存', async () => {
    const description = field.input.value.trim();

    if (!imageBase64) {
      showToast('先选一张图片');
      return;
    }

    if (!description) {
      showToast('写一句描述，TA 才能理解');
      return;
    }

    const now = getNow();
    const sticker = {
      id: generateId('sticker'),
      name: description.slice(0, 16),
      description,
      imageBase64,
      createdAt: now,
      updatedAt: now
    };

    await setDB('stickers', sticker);
    hideBottomSheet();
    showToast('表情包收好啦');
    await openStickerSheet();
  });

  sheet.append(head, preview, pick, field.wrap, actions);
  showBottomSheet(sheet);
}

function openMoodSheet() {
  if (getRelationshipLockLevel()) {
    hideBottomSheet();
    openRelationshipLockSheet();
    return;
  }

  const sheet = el('div', 'chat-mini-sheet');
  const head = createMiniHead('记录一下现在的心情', '会发进当前聊天，让 TA 顺着你的状态回应。');
  const list = el('div', 'chat-choice-list');

  MOODS.forEach((text) => {
    const button = el('button', 'chat-choice-item', text);
    button.type = 'button';
    button.addEventListener('click', () => sendPresetText(`[心情] ${text}`));
    list.appendChild(button);
  });

  const custom = createTextAreaField('自己写', '我现在的心情是……');
  const actions = createSheetActions('收起', '发送心情', () => {
    const text = custom.input.value.trim();
    if (!text) {
      showToast('先写一点心情');
      return;
    }
    sendPresetText(`[心情] ${text}`);
  });

  sheet.append(head, list, custom.wrap, actions);
  showBottomSheet(sheet);
}

function openRelaySheet() {
  if (getRelationshipLockLevel()) {
    hideBottomSheet();
    openRelationshipLockSheet();
    return;
  }

  const sheet = el('div', 'chat-mini-sheet');
  const head = createMiniHead('接龙玩法', '你起一个头，让 TA 接下去。');
  const field = createTextAreaField('接龙开头', '比如：从前有一只很会撒娇的小猫……');

  const actions = createSheetActions('取消', '开始接龙', () => {
    const text = field.input.value.trim();
    if (!text) {
      showToast('先写一个开头');
      return;
    }
    sendPresetText(`[接龙] 请从这句后面自然接下去：${text}`);
  });

  sheet.append(head, field.wrap, actions);
  showBottomSheet(sheet);
  requestAnimationFrame(() => field.input.focus());
}

function openMcpSheet() {
  if (getRelationshipLockLevel()) {
    hideBottomSheet();
    openRelationshipLockSheet();
    return;
  }

  const sheet = el('div', 'chat-mini-sheet');
  const head = createMiniHead('MCP 工具请求', '先把你的工具需求发给 TA，后续 AI 核心会继续接真实工具调用。');
  const field = createTextAreaField('想调用什么', '比如：帮我查一下今天适合做什么');

  const actions = createSheetActions('取消', '发送请求', () => {
    const text = field.input.value.trim();
    if (!text) {
      showToast('先写一下需求');
      return;
    }
    sendPresetText(`[MCP工具请求] ${text}`);
  });

  sheet.append(head, field.wrap, actions);
  showBottomSheet(sheet);
  requestAnimationFrame(() => field.input.focus());
}

function openClearContextSheet() {
  const total = getAllCurrentMessages().length;

  const sheet = el('div', 'chat-clear-sheet');
  const head = el('div', 'chat-clear-head');
  head.append(
    el('div', 'chat-clear-title', '轻轻清一下上下文'),
    el('div', 'chat-clear-subtitle', '不会删除聊天记录，只是让 TA 接下来先看最近的内容。旧消息还在，可以随时加载回来。')
  );

  const info = el('div', 'chat-clear-card');
  info.append(
    el('div', 'chat-clear-card-title', '清完以后'),
    el('div', 'chat-clear-card-desc', `当前 ${total} 条消息里，会先保留最近 ${Math.min(total, COMPACT_CONTEXT_COUNT)} 条给 AI 参考。`)
  );

  const actions = el('div', 'chat-clear-actions');

  const cancel = el('button', 'chat-clear-btn ghost', '先不清');
  cancel.type = 'button';
  cancel.addEventListener('click', () => hideBottomSheet());

  const confirm = el('button', 'chat-clear-btn primary', '清一下');
  confirm.type = 'button';
  confirm.addEventListener('click', () => {
    state.visibleCount = COMPACT_CONTEXT_COUNT;
    hideBottomSheet();
    render();
    showToast('上下文变轻啦');
  });

  actions.append(cancel, confirm);
  sheet.append(head, info, actions);
  showBottomSheet(sheet);
}

function openTransferSheet() {
  if (getRelationshipLockLevel()) {
    hideBottomSheet();
    openRelationshipLockSheet();
    return;
  }

  const sheet = el('div', 'chat-transfer-sheet');

  const head = el('div', 'chat-transfer-head');
  head.append(
    el('div', 'chat-transfer-title', '送一点小心意'),
    el('div', 'chat-transfer-subtitle', '填个金额和备注，TA 会看到这条转账消息。')
  );

  const form = el('div', 'chat-transfer-form');

  const amountLabel = el('label', 'chat-transfer-field');
  amountLabel.appendChild(el('span', 'chat-transfer-label', '金额'));

  const amount = document.createElement('input');
  amount.className = 'chat-transfer-input amount';
  amount.type = 'number';
  amount.min = '0.01';
  amount.step = '0.01';
  amount.placeholder = '0.00';
  amount.inputMode = 'decimal';
  amount.autocomplete = 'off';

  amount.addEventListener('focus', handleComposerFocus);
  amount.addEventListener('blur', handleComposerBlur);

  amountLabel.appendChild(amount);

  const noteLabel = el('label', 'chat-transfer-field');
  noteLabel.appendChild(el('span', 'chat-transfer-label', '备注'));

  const note = document.createElement('input');
  note.className = 'chat-transfer-input';
  note.type = 'text';
  note.maxLength = 40;
  note.placeholder = '比如：买杯热饮';
  note.autocomplete = 'off';

  note.addEventListener('focus', handleComposerFocus);
  note.addEventListener('blur', handleComposerBlur);

  noteLabel.appendChild(note);
  form.append(amountLabel, noteLabel);

  const actions = el('div', 'chat-transfer-actions');

  const cancel = el('button', 'chat-transfer-btn ghost', '取消');
  cancel.type = 'button';
  cancel.addEventListener('click', () => hideBottomSheet());

  const submit = el('button', 'chat-transfer-btn primary', '发送转账');
  submit.type = 'button';
  submit.addEventListener('click', () => {
    handleTransfer(amount.value, note.value);
  });

  actions.append(cancel, submit);
  sheet.append(head, form, actions);
  showBottomSheet(sheet);

  requestAnimationFrame(() => amount.focus());
}

function openConfigSheet() {
  if (state.mode === 'group') {
    showToast('群聊配置晚点再接');
    return;
  }

  const config = getChatConfig();

  const sheet = el('div', 'chat-config-sheet');
  const head = el('div', 'chat-config-head');
  head.append(
    el('div', 'chat-config-title', '聊天小开关'),
    el('div', 'chat-config-subtitle', 'TA 想你时，可以轻轻主动找你。')
  );

  const form = el('div', 'chat-config-list');

  form.append(
    createSwitchRow({
      title: '离线一会儿主动问候',
      desc: '你发完消息后，过一段时间没继续聊，TA 只会主动发一次。',
      checked: Boolean(config.proactiveMode1Enabled),
      onChange: (checked) => updateChatConfig({ proactiveMode1Enabled: checked })
    }),
    createNumberRow({
      title: '离线等待时间',
      desc: '默认 30 分钟。',
      value: config.proactiveMode1Minutes,
      min: 1,
      max: 240,
      suffix: '分钟',
      onChange: (value) => updateChatConfig({ proactiveMode1Minutes: value })
    }),
    createSwitchRow({
      title: '在线停留主动开口',
      desc: '你停在聊天里没说话时，TA 偶尔会自然接一句。',
      checked: Boolean(config.proactiveMode2Enabled),
      onChange: (checked) => updateChatConfig({ proactiveMode2Enabled: checked })
    }),
    createRangePairRow({
      title: '在线触发范围',
      desc: '到时间后会按概率触发。',
      minValue: config.proactiveMode2MinMinutes,
      maxValue: config.proactiveMode2MaxMinutes,
      min: 1,
      max: 240,
      suffix: '分钟',
      onChange: (minValue, maxValue) => updateChatConfig({
        proactiveMode2MinMinutes: minValue,
        proactiveMode2MaxMinutes: Math.max(minValue, maxValue)
      })
    }),
    createChanceRow({
      title: '主动概率',
      desc: '越高越容易主动开口。',
      value: config.proactiveChance,
      onChange: (value) => updateChatConfig({ proactiveChance: value })
    })
  );

  const actions = el('div', 'chat-config-actions');

  const close = el('button', 'chat-config-btn ghost', '收起');
  close.type = 'button';
  close.addEventListener('click', () => hideBottomSheet());

  const check = el('button', 'chat-config-btn primary', '现在检查一次');
  check.type = 'button';
  check.addEventListener('click', async () => {
    hideBottomSheet();
    await runProactiveCheck();
    showToast('检查过啦');
  });

  actions.append(close, check);
  sheet.append(head, form, actions);
  showBottomSheet(sheet);
}

function createSwitchRow({ title, desc, checked, onChange }) {
  const row = el('label', 'chat-config-row switch');

  const text = el('span', 'chat-config-row-text');
  text.append(
    el('span', 'chat-config-row-title', title),
    el('span', 'chat-config-row-desc', desc)
  );

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = Boolean(checked);
  input.addEventListener('change', () => onChange(Boolean(input.checked)));

  const control = el('span', 'chat-config-switch');
  control.appendChild(input);
  control.appendChild(el('span', 'chat-config-switch-ui'));

  row.append(text, control);
  return row;
}

function createNumberRow({ title, desc, value, min, max, suffix, onChange }) {
  const row = el('div', 'chat-config-row');

  const text = el('span', 'chat-config-row-text');
  text.append(
    el('span', 'chat-config-row-title', title),
    el('span', 'chat-config-row-desc', desc)
  );

  const wrap = el('span', 'chat-config-number-wrap');

  const input = document.createElement('input');
  input.className = 'chat-config-number';
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.value = String(clampNumber(value, min, max));
  input.addEventListener('focus', handleComposerFocus);
  input.addEventListener('blur', handleComposerBlur);
  input.addEventListener('change', () => {
    const next = clampNumber(input.value, min, max);
    input.value = String(next);
    onChange(next);
  });

  wrap.append(input, el('span', 'chat-config-suffix', suffix));
  row.append(text, wrap);
  return row;
}

function createRangePairRow({ title, desc, minValue, maxValue, min, max, suffix, onChange }) {
  const row = el('div', 'chat-config-row stacked');

  const text = el('span', 'chat-config-row-text');
  text.append(
    el('span', 'chat-config-row-title', title),
    el('span', 'chat-config-row-desc', desc)
  );

  const controls = el('span', 'chat-config-range-pair');

  const inputMin = document.createElement('input');
  inputMin.className = 'chat-config-number';
  inputMin.type = 'number';
  inputMin.min = String(min);
  inputMin.max = String(max);
  inputMin.value = String(clampNumber(minValue, min, max));

  const inputMax = document.createElement('input');
  inputMax.className = 'chat-config-number';
  inputMax.type = 'number';
  inputMax.min = String(min);
  inputMax.max = String(max);
  inputMax.value = String(Math.max(Number(inputMin.value), clampNumber(maxValue, min, max)));

  inputMin.addEventListener('focus', handleComposerFocus);
  inputMin.addEventListener('blur', handleComposerBlur);
  inputMax.addEventListener('focus', handleComposerFocus);
  inputMax.addEventListener('blur', handleComposerBlur);

  const commit = () => {
    const left = clampNumber(inputMin.value, min, max);
    const right = Math.max(left, clampNumber(inputMax.value, min, max));
    inputMin.value = String(left);
    inputMax.value = String(right);
    onChange(left, right);
  };

  inputMin.addEventListener('change', commit);
  inputMax.addEventListener('change', commit);

  controls.append(
    inputMin,
    el('span', 'chat-config-range-sep', '到'),
    inputMax,
    el('span', 'chat-config-suffix', suffix)
  );

  row.append(text, controls);
  return row;
}

function createChanceRow({ title, desc, value, onChange }) {
  const row = el('div', 'chat-config-row stacked');

  const text = el('span', 'chat-config-row-text');
  text.append(
    el('span', 'chat-config-row-title', title),
    el('span', 'chat-config-row-desc', desc)
  );

  const controls = el('span', 'chat-config-slider-wrap');

  const label = el('span', 'chat-config-slider-label', `${Math.round(clampChance(value) * 100)}%`);

  const input = document.createElement('input');
  input.className = 'chat-config-slider';
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.step = '5';
  input.value = String(Math.round(clampChance(value) * 100));

  input.addEventListener('input', () => {
    label.textContent = `${input.value}%`;
  });

  input.addEventListener('change', () => {
    const next = clampChance(Number(input.value) / 100);
    label.textContent = `${Math.round(next * 100)}%`;
    onChange(next);
  });

  controls.append(input, label);
  row.append(text, controls);
  return row;
}

function createMiniHead(title, subtitle) {
  const head = el('div', 'chat-mini-head');
  head.append(
    el('div', 'chat-mini-title', title),
    el('div', 'chat-mini-subtitle', subtitle)
  );
  return head;
}

function createTextAreaField(labelText, placeholder) {
  const wrap = el('label', 'chat-mini-field');
  wrap.appendChild(el('span', 'chat-mini-label', labelText));

  const input = document.createElement('textarea');
  input.className = 'chat-mini-textarea';
  input.rows = 4;
  input.placeholder = placeholder || '';
  input.setAttribute('autocomplete', 'off');
  input.setAttribute('spellcheck', 'false');
  input.addEventListener('focus', handleComposerFocus);
  input.addEventListener('blur', handleComposerBlur);

  wrap.appendChild(input);
  return { wrap, input };
}

function createSheetActions(cancelText, submitText, onSubmit) {
  const actions = el('div', 'chat-mini-actions');

  const cancel = el('button', 'chat-mini-btn ghost', cancelText);
  cancel.type = 'button';
  cancel.addEventListener('click', () => hideBottomSheet());

  const submit = el('button', 'chat-mini-btn primary', submitText);
  submit.type = 'button';
  submit.addEventListener('click', onSubmit);

  actions.append(cancel, submit);
  return actions;
}

function getChatConfig() {
  if (!state.characterId) return { ...DEFAULT_CHAT_CONFIG };

  const stored = getData(getChatConfigKey()) || {};

  return {
    ...DEFAULT_CHAT_CONFIG,
    ...stored,
    proactiveMode1Minutes: clampNumber(stored.proactiveMode1Minutes || DEFAULT_CHAT_CONFIG.proactiveMode1Minutes, 1, 240),
    proactiveMode2MinMinutes: clampNumber(stored.proactiveMode2MinMinutes || DEFAULT_CHAT_CONFIG.proactiveMode2MinMinutes, 1, 240),
    proactiveMode2MaxMinutes: clampNumber(stored.proactiveMode2MaxMinutes || DEFAULT_CHAT_CONFIG.proactiveMode2MaxMinutes, 1, 240),
    proactiveChance: clampChance(stored.proactiveChance ?? DEFAULT_CHAT_CONFIG.proactiveChance)
  };
}

function updateChatConfig(patch) {
  if (!state.characterId) return;

  const current = getChatConfig();
  const next = { ...current, ...patch };

  if (Number(next.proactiveMode2MaxMinutes) < Number(next.proactiveMode2MinMinutes)) {
    next.proactiveMode2MaxMinutes = next.proactiveMode2MinMinutes;
  }

  setData(getChatConfigKey(), next);
  showToast('保存好啦');
}

function getChatConfigKey() {
  return `chat_${state.characterId}_config`;
}

function openToolSheet() {
  if (getRelationshipLockLevel()) {
    openRelationshipLockSheet();
    return;
  }

  state.toolPage = 0;
  state.toolSheetEl = createToolSheetShell();
  updateToolSheetPage();
  showBottomSheet(state.toolSheetEl);
}

function createToolSheetShell() {
  const sheet = el('div', 'chat-thread-tool-sheet');

  const header = el('div', 'chat-thread-tool-head');
  header.append(
    el('div', 'chat-thread-tool-title', '小工具箱'),
    el('div', 'chat-thread-tool-subtitle')
  );

  const viewport = el('div', 'chat-thread-tool-viewport');
  const grid = el('div', 'chat-thread-tool-grid');
  grid.dataset.page = '0';
  viewport.appendChild(grid);

  viewport.addEventListener('touchstart', handleToolSwipeStart, { passive: true });
  viewport.addEventListener('touchend', handleToolSwipeEnd, { passive: true });
  viewport.addEventListener('pointerdown', handleToolPointerStart);
  viewport.addEventListener('pointerup', handleToolPointerEnd);

  const dots = el('div', 'chat-thread-tool-dots');

  sheet.append(header, viewport, dots);
  return sheet;
}

function updateToolSheetPage() {
  const sheet = state.toolSheetEl;
  if (!sheet) return;

  const tools = getThreadTools();
  const pages = chunkArray(tools, TOOL_PAGE_SIZE);
  const pageCount = Math.max(1, pages.length);
  state.toolPage = Math.max(0, Math.min(state.toolPage, pageCount - 1));

  const subtitle = sheet.querySelector('.chat-thread-tool-subtitle');
  if (subtitle) {
    subtitle.textContent = `${state.toolPage + 1} / ${pageCount}`;
  }

  const grid = sheet.querySelector('.chat-thread-tool-grid');
  if (grid) {
    grid.dataset.page = String(state.toolPage);
    grid.replaceChildren();

    pages[state.toolPage].forEach((tool, index) => {
      const button = toolButton(tool);
      button.style.setProperty('--tool-delay', `${index * 18}ms`);
      grid.appendChild(button);
    });
  }

  const dots = sheet.querySelector('.chat-thread-tool-dots');
  if (dots) {
    dots.replaceChildren();

    for (let index = 0; index < pageCount; index += 1) {
      const dot = el('button', 'chat-thread-tool-dot');
      dot.type = 'button';
      dot.dataset.active = index === state.toolPage ? 'true' : 'false';
      dot.setAttribute('aria-label', `第 ${index + 1} 页`);
      dot.addEventListener('click', () => {
        state.toolPage = index;
        updateToolSheetPage();
      });
      dots.appendChild(dot);
    }
  }
}

function handleToolSwipeStart(event) {
  const touch = event.touches?.[0];
  if (!touch) return;

  state.toolSwipeStartX = touch.clientX;
  state.toolSwipeStartY = touch.clientY;
}

function handleToolSwipeEnd(event) {
  const touch = event.changedTouches?.[0];
  if (!touch) return;
  commitToolSwipe(touch.clientX, touch.clientY);
}

function handleToolPointerStart(event) {
  state.toolSwipeStartX = event.clientX;
  state.toolSwipeStartY = event.clientY;
}

function handleToolPointerEnd(event) {
  commitToolSwipe(event.clientX, event.clientY);
}

function commitToolSwipe(endX, endY) {
  const startX = Number(state.toolSwipeStartX || 0);
  const startY = Number(state.toolSwipeStartY || 0);
  const dx = Number(endX || 0) - startX;
  const dy = Number(endY || 0) - startY;

  state.toolSwipeStartX = 0;
  state.toolSwipeStartY = 0;

  if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy) * 1.1) return;

  const tools = getThreadTools();
  const pageCount = Math.max(1, chunkArray(tools, TOOL_PAGE_SIZE).length);
  const nextPage = dx < 0
    ? Math.min(pageCount - 1, state.toolPage + 1)
    : Math.max(0, state.toolPage - 1);

  if (nextPage === state.toolPage) return;

  const grid = state.toolSheetEl?.querySelector('.chat-thread-tool-grid');
  if (grid) {
    grid.dataset.direction = dx < 0 ? 'next' : 'prev';
  }

  state.toolPage = nextPage;
  updateToolSheetPage();
}

function getThreadTools() {
  const locked = Boolean(getRelationshipLockLevel());

  const tools = [
    {
      id: 'voice',
      text: '语音消息',
      icon: 'mic',
      hint: locked ? '闹别扭中' : '文字版',
      action: () => locked ? openRelationshipLockSheet() : openVoiceTextSheet()
    },
    {
      id: 'call',
      text: '打电话',
      icon: 'phone',
      hint: state.mode === 'group' ? '暂不支持' : locked ? '先等等' : '通话',
      action: () => locked ? openRelationshipLockSheet() : openCallFromTool()
    },
    {
      id: 'upload',
      text: '上传文件',
      icon: 'upload',
      hint: locked ? '先等等' : '分段发送',
      action: () => locked ? openRelationshipLockSheet() : handleUploadFile()
    },
    {
      id: 'image',
      text: '发图片',
      icon: 'image',
      hint: locked ? '先等等' : '用上传',
      action: () => locked ? openRelationshipLockSheet() : handleUploadFile()
    },
    {
      id: 'dice',
      text: '骰子',
      icon: 'dice',
      hint: locked ? '先等等' : '随机摇',
      action: () => locked ? openRelationshipLockSheet() : handleDice()
    },
    {
      id: 'rps',
      text: '猜拳',
      icon: 'rps',
      hint: locked ? '先等等' : '随机出',
      action: () => locked ? openRelationshipLockSheet() : handleRps()
    },
    {
      id: 'mcp',
      text: 'MCP',
      icon: 'mcp',
      hint: locked ? '先等等' : '工具请求',
      action: () => locked ? openRelationshipLockSheet() : openMcpSheet()
    },
    {
      id: 'settings',
      text: '配置',
      icon: 'settings',
      hint: '主动消息',
      action: () => {
        hideBottomSheet();
        openConfigSheet();
      }
    },
    {
      id: 'clear',
      text: '清上下文',
      icon: 'clear',
      hint: '不删记录',
      action: () => {
        hideBottomSheet();
        openClearContextSheet();
      }
    },
    {
      id: 'transfer',
      text: '转账',
      icon: 'transfer',
      hint: locked ? '先等等' : '小心意',
      action: () => {
        hideBottomSheet();
        locked ? openRelationshipLockSheet() : openTransferSheet();
      }
    },
    {
      id: 'quote-play',
      text: '接龙',
      icon: 'continue',
      hint: locked ? '先等等' : '一起编',
      action: () => locked ? openRelationshipLockSheet() : openRelaySheet()
    },
    {
      id: 'mood',
      text: '心情',
      icon: 'thought',
      hint: locked ? '先等等' : '记录',
      action: () => locked ? openRelationshipLockSheet() : openMoodSheet()
    },
    {
      id: 'quick',
      text: '快捷回复',
      icon: 'continue',
      hint: locked ? '先等等' : '轻轻回',
      action: () => locked ? openRelationshipLockSheet() : openQuickReplySheet()
    }
  ];

  if (state.mode !== 'group') {
    tools.splice(7, 0, {
      id: 'memory',
      text: '记忆',
      icon: 'memory',
      hint: '小本本',
      action: () => {
        hideBottomSheet();
        state.appState?.openMemory?.(state.characterId, { fromRoute: state.appState?.getRoute?.() });
      }
    });
  }

  return tools;
}
async function openCallFromTool() {
  if (state.mode === 'group') {
    showToast('群聊电话晚点再做');
    return;
  }

  if (getRelationshipLockLevel()) {
    hideBottomSheet();
    openRelationshipLockSheet();
    return;
  }

  hideBottomSheet();

  if (typeof mountThreadCallFn !== 'function') {
    showToast('电话模块还没接上');
    return;
  }

  state.callMode = true;
  await mountThreadCallFn(state.rootEl, { state, close: closeCallMode });
}

function toolButton(tool) {
  const button = el('button', `chat-thread-tool-card tool-${tool.id}`);
  button.type = 'button';

  const iconWrap = el('span', 'chat-thread-tool-icon');
  iconWrap.appendChild(createToolIcon(tool.icon));

  button.append(
    iconWrap,
    el('span', 'chat-thread-tool-name', tool.text),
    el('span', 'chat-thread-tool-hint', tool.hint || '')
  );

  button.addEventListener('click', () => {
    if (typeof tool.action === 'function') tool.action();
  });

  return button;
}

function createToolIcon(iconName) {
  if (['dice', 'rps', 'next', 'continue', 'thought', 'upload'].includes(iconName)) {
    return createInlineIcon(iconName);
  }

  return createIcon(iconName, 18);
}

function createInlineIcon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const path = (d) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    node.setAttribute('d', d);
    svg.appendChild(node);
  };

  const circle = (cx, cy, r) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    node.setAttribute('cx', cx);
    node.setAttribute('cy', cy);
    node.setAttribute('r', r);
    svg.appendChild(node);
  };

  const rect = (x, y, w, h, rx) => {
    const node = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    node.setAttribute('x', x);
    node.setAttribute('y', y);
    node.setAttribute('width', w);
    node.setAttribute('height', h);
    node.setAttribute('rx', rx);
    svg.appendChild(node);
  };

  if (name === 'dice') {
    rect('5', '5', '14', '14', '4');
    circle('9', '9', '0.8');
    circle('15', '15', '0.8');
    circle('15', '9', '0.8');
    circle('9', '15', '0.8');
  } else if (name === 'rps') {
    path('M7 11c0-2 1.3-3.5 3-3.5h3.5c2 0 3.5 1.5 3.5 3.5v2.5c0 2.8-2.2 5-5 5s-5-2.2-5-5V11Z');
    path('M6 6l12 12');
    path('M18 6 6 18');
  } else if (name === 'next') {
    path('M9 6l6 6-6 6');
  } else if (name === 'continue') {
    path('M5 12h12');
    path('m13 8 4 4-4 4');
  } else if (name === 'thought') {
    path('M7.5 16.5h9');
    path('M9 20h6');
    path('M8 13.5c-1.4-1.1-2.2-2.8-2.2-4.6A6.2 6.2 0 0 1 12 2.8a6.2 6.2 0 0 1 6.2 6.1c0 1.8-.8 3.5-2.2 4.6-.7.5-1 1.2-1 2H9c0-.8-.3-1.5-1-2Z');
  } else if (name === 'upload') {
    path('M12 15V4');
    path('m8 8 4-4 4 4');
    path('M5 16v3a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3');
  }

  return svg;
}

function closeCallMode() {
  state.callMode = false;

  if (typeof unmountThreadCallFn === 'function') {
    unmountThreadCallFn();
  }

  hideBottomSheet();
  render();
}

function keepComposerVisible() {
  updateKeyboardViewport();
}

function autoResize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.min(132, textarea.scrollHeight)}px`;
}

function getRpsLabel(choice) {
  if (choice === 'rock') return '石头';
  if (choice === 'paper') return '布';
  if (choice === 'scissors') return '剪刀';
  return '未知';
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function chunkArray(list, size) {
  const result = [];

  for (let index = 0; index < list.length; index += size) {
    result.push(list.slice(index, index + size));
  }

  return result.length ? result : [[]];
}

function sortByTimestamp(a, b) {
  return String(a?.timestamp || '').localeCompare(String(b?.timestamp || ''));
}

function sortByUpdatedAtDesc(a, b) {
  return String(b?.updatedAt || b?.createdAt || '').localeCompare(String(a?.updatedAt || a?.createdAt || ''));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function getInitial(name) {
  const text = String(name || '').trim();
  return text ? text.slice(0, 1).toUpperCase() : 'A';
}

function iconButton(iconName, label) {
  const button = el('button', 'chat-icon-btn');
  button.type = 'button';
  button.setAttribute('aria-label', label || iconName);
  button.appendChild(createIcon(iconName, 18));
  return button;
}

function clampNumber(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function clampChance(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function injectStyle() {
  if (document.getElementById(THREAD_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = THREAD_STYLE_ID;
  style.textContent = `
    .chat-thread-page {
      --chat-keyboard-offset: 0px;
      gap: 0;
      height: calc(100dvh - var(--chat-keyboard-offset, 0px));
      max-height: calc(100dvh - var(--chat-keyboard-offset, 0px));
      overflow: hidden;
      transition: all 200ms ease;
    }

    .chat-thread-page[data-keyboard="true"] {
      height: calc(100dvh - var(--chat-keyboard-offset, 0px));
      max-height: calc(100dvh - var(--chat-keyboard-offset, 0px));
    }

    .chat-thread-header {
      flex: 0 0 auto;
      min-height: 62px;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      padding: 12px 20px 8px;
      background: color-mix(in srgb, var(--bg-primary) 88%, transparent);
      backdrop-filter: blur(18px);
      z-index: 3;
    }

    .chat-thread-page[data-keyboard="true"] .chat-thread-header {
      min-height: 52px;
      padding-top: 8px;
    }

    .chat-thread-back-btn { justify-self: start; }

    .chat-thread-title-wrap {
      min-width: 0;
      display: inline-flex;
      align-items: center;
      justify-self: start;
      gap: 10px;
      padding: 0;
      background: transparent;
      color: inherit;
      text-align: left;
    }

    .chat-thread-avatar {
      width: 38px;
      height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 999px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      font-size: 14px;
      font-weight: 600;
    }

    .chat-thread-page[data-keyboard="true"] .chat-thread-avatar {
      width: 32px;
      height: 32px;
    }

    .chat-thread-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .chat-thread-title-text {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .chat-thread-name {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-thread-status {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.35;
    }

    .chat-thread-header-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    .chat-thread-header-actions .is-active {
      color: var(--accent);
      background: var(--accent-light);
    }

    .chat-thread-search-card {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      padding: 0 20px 12px;
      animation: chatSearchIn 200ms ease both;
      z-index: 2;
    }

    .chat-thread-search { width: 100%; }

    .chat-thread-area {
      flex: 1 1 auto;
      min-height: 0;
      overflow: hidden;
      padding: 0 20px 12px;
    }

    .chat-thread-page[data-keyboard="true"] .chat-thread-area {
      padding-bottom: 8px;
    }

    .chat-thread-list {
      height: 100%;
      max-height: 100%;
      overflow-y: auto;
      overflow-x: hidden;
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding-bottom: 18px;
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }

    .chat-load-more-wrap {
      display: flex;
      justify-content: center;
      padding: 4px 0 8px;
    }

    .chat-load-more-btn {
      min-height: 34px;
      padding: 0 14px;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 12px;
      transition: all 200ms ease;
    }

    .chat-load-more-btn:active { transform: scale(0.96); }

    .chat-thread-row-wrap {
      display: block;
      min-height: 8px;
    }

    .chat-thread-fallback-message {
      max-width: 82%;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 12px 14px;
      border-radius: 20px;
      background: var(--bubble-ai-bg);
      color: var(--bubble-ai-text);
      box-shadow: var(--shadow-sm);
    }

    .chat-thread-fallback-message.role-user {
      align-self: flex-end;
      background: var(--bubble-user-bg);
      color: var(--bubble-user-text);
    }

    .chat-thread-fallback-author {
      font-size: 12px;
      line-height: 1.35;
      opacity: 0.72;
    }

    .chat-thread-fallback-content {
      font-size: var(--font-size-base);
      line-height: 1.6;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .chat-thread-input-bar {
      flex: 0 0 auto;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto auto;
      align-items: end;
      gap: 8px;
      padding: 12px 20px calc(14px + env(safe-area-inset-bottom));
      background: color-mix(in srgb, var(--bg-primary) 90%, transparent);
      backdrop-filter: blur(18px);
      z-index: 3;
      transform: translateZ(0);
    }

    .chat-thread-page[data-keyboard="true"] .chat-thread-input-bar {
      padding-top: 8px;
      padding-bottom: 10px;
      background: color-mix(in srgb, var(--bg-primary) 94%, transparent);
    }

    .chat-thread-input-bar.is-relationship-locked {
      display: block;
    }

    .chat-relationship-lock-bar {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      gap: 10px;
      padding: 12px;
      border-radius: 20px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      animation: chatSearchIn 200ms ease both;
    }

    .chat-relationship-lock-icon {
      width: 38px;
      height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      background: var(--surface-muted);
      color: var(--accent);
      box-shadow: var(--shadow-sm);
    }

    .chat-relationship-lock-text {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .chat-relationship-lock-title {
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .chat-relationship-lock-desc {
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.45;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .chat-relationship-lock-action {
      min-height: 34px;
      padding: 0 12px;
      border-radius: 999px;
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 12px;
      transition: all 200ms ease;
    }

    .chat-relationship-lock-action:active { transform: scale(0.96); }

    .chat-thread-page[data-locked="true"] .chat-thread-title-wrap {
      opacity: 0.92;
    }

    .chat-lock-sheet {
      padding: 6px 20px 20px;
    }

    .chat-lock-card {
      padding: 14px;
      border-radius: 20px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .chat-lock-card-title {
      color: var(--text-primary);
      font-size: 15px;
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-lock-card-desc {
      margin-top: 6px;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.6;
    }

    .chat-lock-card-time {
      margin-top: 10px;
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.45;
    }

    .chat-thread-input {
      min-height: 44px;
      resize: none;
      font-size: 16px;
      line-height: 1.6;
      -webkit-appearance: none;
      appearance: none;
      -webkit-text-size-adjust: 100%;
      touch-action: manipulation;
    }

    .chat-thread-input:focus { font-size: 16px; }

    .chat-thread-send,
    .chat-thread-tool-entry,
    .chat-thread-sticker-entry {
      width: 44px;
      height: 44px;
      min-width: 44px;
      padding: 0;
      white-space: nowrap;
    }

    .chat-thread-sticker-entry {
      color: var(--accent);
      background: var(--bg-card);
    }

    .chat-thread-sheet,
    .chat-thread-tool-sheet,
    .chat-config-sheet,
    .chat-transfer-sheet,
    .chat-clear-sheet,
    .chat-mini-sheet,
    .chat-sticker-sheet,
    .chat-sticker-upload-sheet {
      padding: 6px 20px 20px;
    }

    .chat-thread-sheet-content {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }

    .chat-thread-sheet-wide {
      grid-column: 1 / -1;
    }

    .chat-thread-sheet-item {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      border-radius: 18px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 14px;
      transition: all 200ms ease;
    }

    .chat-thread-sheet-item:disabled {
      opacity: 0.58;
    }

    .chat-thread-sheet-item:active { transform: scale(0.96); }

    .chat-thread-tool-head,
    .chat-sticker-head {
      display: flex;
      align-items: end;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 14px;
    }

    .chat-thread-tool-title,
    .chat-sticker-title,
    .chat-config-title,
    .chat-transfer-title,
    .chat-clear-title,
    .chat-mini-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-thread-tool-subtitle,
    .chat-sticker-subtitle,
    .chat-config-subtitle,
    .chat-transfer-subtitle,
    .chat-clear-subtitle,
    .chat-mini-subtitle {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.5;
    }

    .chat-thread-tool-viewport {
      overflow: hidden;
      touch-action: pan-y;
    }

    .chat-thread-tool-grid {
      min-height: 154px;
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      grid-auto-rows: 72px;
      gap: 8px;
      align-content: start;
      animation: chatToolGridIn 220ms ease both;
    }

    .chat-thread-tool-grid[data-direction="next"] {
      animation-name: chatToolGridNext;
    }

    .chat-thread-tool-grid[data-direction="prev"] {
      animation-name: chatToolGridPrev;
    }

    .chat-thread-tool-card {
      height: 72px;
      min-height: 72px;
      display: grid;
      grid-template-rows: 30px auto;
      align-items: center;
      justify-items: center;
      gap: 5px;
      padding: 8px 6px 7px;
      border-radius: 20px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      transition: all 200ms ease;
      animation: chatToolCardIn 220ms ease both;
      animation-delay: var(--tool-delay, 0ms);
    }

    .chat-thread-tool-card:active { transform: scale(0.96); }

    .chat-thread-tool-icon {
      width: 30px;
      height: 30px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 13px;
      color: var(--accent);
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
    }

    .chat-thread-tool-name {
      max-width: 100%;
      color: var(--text-primary);
      font-size: 12px;
      font-weight: 600;
      line-height: 1.25;
      text-align: center;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .chat-thread-tool-hint { display: none; }

    .chat-thread-tool-dots {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      margin-top: 14px;
    }

    .chat-thread-tool-dot {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: var(--text-hint);
      opacity: 0.35;
      transition: all 200ms ease;
    }

    .chat-thread-tool-dot[data-active="true"] {
      width: 18px;
      opacity: 1;
      background: var(--accent);
    }

    .chat-sticker-upload-btn {
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 12px;
      border-radius: 999px;
      background: var(--bg-card);
      color: var(--accent);
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 13px;
      transition: all 200ms ease;
    }

    .chat-sticker-upload-btn:active { transform: scale(0.96); }

    .chat-sticker-icon-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      max-height: min(48vh, 360px);
      overflow-y: auto;
      padding: 2px 0 4px;
      -webkit-overflow-scrolling: touch;
      animation: chatStickerIn 220ms ease both;
    }

    .chat-sticker-icon-btn {
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 7px;
      padding: 8px 4px;
      border-radius: 18px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font: inherit;
      transition: all 200ms ease;
    }

    .chat-sticker-icon-btn:active { transform: scale(0.96); }

    .chat-sticker-icon-img-wrap {
      width: 42px;
      height: 42px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 14px;
      background: var(--surface-muted);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: 13px;
      font-weight: 600;
    }

    .chat-sticker-icon-img-wrap img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .chat-sticker-icon-name {
      width: 100%;
      color: var(--text-secondary);
      font-size: 11px;
      line-height: 1.25;
      text-align: center;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .chat-sticker-empty {
      grid-column: 1 / -1;
      padding: 18px;
      border-radius: 20px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .chat-sticker-empty-title {
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-sticker-empty-desc {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.5;
    }

    .chat-sticker-upload-preview {
      width: 76px;
      height: 76px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 14px;
      overflow: hidden;
      border-radius: 20px;
      background: var(--bg-card);
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: 12px;
      line-height: 1.4;
      text-align: center;
    }

    .chat-sticker-upload-preview img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    .chat-config-head,
    .chat-transfer-head,
    .chat-clear-head,
    .chat-mini-head { margin-bottom: 16px; }

    .chat-config-list,
    .chat-transfer-form,
    .chat-choice-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .chat-clear-card,
    .chat-choice-item,
    .chat-mini-field {
      padding: 14px;
      border-radius: 18px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .chat-choice-item {
      color: var(--text-primary);
      text-align: left;
      font: inherit;
      font-size: 14px;
      line-height: 1.5;
      transition: all 200ms ease;
    }

    .chat-choice-item:active { transform: scale(0.98); }

    .chat-clear-card-title {
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-clear-card-desc {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.5;
    }

    .chat-config-row,
    .chat-transfer-field {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 14px;
      align-items: center;
      padding: 14px;
      border-radius: 18px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .chat-config-row.stacked {
      grid-template-columns: 1fr;
      align-items: stretch;
    }

    .chat-config-row-text {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
    }

    .chat-config-row-title,
    .chat-transfer-label,
    .chat-mini-label {
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 600;
      line-height: 1.35;
    }

    .chat-config-row-desc {
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.45;
    }

    .chat-config-switch {
      position: relative;
      display: inline-flex;
      width: 46px;
      height: 28px;
      flex: 0 0 auto;
    }

    .chat-config-switch input {
      position: absolute;
      inset: 0;
      opacity: 0;
      margin: 0;
    }

    .chat-config-switch-ui {
      width: 46px;
      height: 28px;
      border-radius: 999px;
      background: var(--surface-muted);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .chat-config-switch-ui::after {
      content: "";
      position: absolute;
      top: 4px;
      left: 4px;
      width: 20px;
      height: 20px;
      border-radius: 999px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: all 200ms ease;
    }

    .chat-config-switch input:checked + .chat-config-switch-ui { background: var(--accent); }
    .chat-config-switch input:checked + .chat-config-switch-ui::after { transform: translateX(18px); }

    .chat-config-number-wrap,
    .chat-config-range-pair,
    .chat-config-slider-wrap {
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .chat-config-number,
    .chat-transfer-input,
    .chat-mini-textarea {
      padding: 0 10px;
      border-radius: 14px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: 16px;
    }

    .chat-config-number,
    .chat-transfer-input { height: 38px; }

    .chat-config-number {
      width: 70px;
      text-align: center;
    }

    .chat-transfer-input {
      width: min(180px, 42vw);
      text-align: right;
    }

    .chat-transfer-input.amount { font-weight: 600; }

    .chat-mini-textarea {
      width: 100%;
      min-height: 96px;
      margin-top: 10px;
      padding: 10px 12px;
      resize: none;
      line-height: 1.6;
    }

    .chat-config-suffix,
    .chat-config-range-sep,
    .chat-config-slider-label {
      color: var(--text-secondary);
      font-size: 12px;
      line-height: 1.35;
      white-space: nowrap;
    }

    .chat-config-slider {
      width: 100%;
      accent-color: var(--accent);
    }

    .chat-config-slider-wrap {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr auto;
    }

    .chat-config-actions,
    .chat-transfer-actions,
    .chat-clear-actions,
    .chat-mini-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-top: 14px;
    }

    .chat-config-btn,
    .chat-transfer-btn,
    .chat-clear-btn,
    .chat-mini-btn {
      min-height: 44px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      box-shadow: var(--shadow-sm);
      font: inherit;
      font-size: 14px;
      transition: all 200ms ease;
    }

    .chat-config-btn:active,
    .chat-transfer-btn:active,
    .chat-clear-btn:active,
    .chat-mini-btn:active { transform: scale(0.96); }

    .chat-config-btn.primary,
    .chat-transfer-btn.primary,
    .chat-clear-btn.primary,
    .chat-mini-btn.primary {
      background: var(--accent);
      color: var(--bubble-user-text);
    }

    .chat-config-btn.ghost,
    .chat-transfer-btn.ghost,
    .chat-clear-btn.ghost,
    .chat-mini-btn.ghost {
      background: var(--bg-card);
      color: var(--text-secondary);
    }

    @keyframes chatSearchIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes chatToolGridIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes chatToolGridNext {
      from { opacity: 0; transform: translateX(14px); }
      to { opacity: 1; transform: translateX(0); }
    }

    @keyframes chatToolGridPrev {
      from { opacity: 0; transform: translateX(-14px); }
      to { opacity: 1; transform: translateX(0); }
    }

    @keyframes chatToolCardIn {
      from { opacity: 0; transform: translateY(7px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes chatStickerIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @media (max-width: 680px) {
      .chat-thread-header,
      .chat-thread-search-card,
      .chat-thread-area,
      .chat-thread-input-bar {
        padding-left: 20px;
        padding-right: 20px;
      }

      .chat-thread-sheet-content { grid-template-columns: 1fr; }
    }

    @media (max-width: 430px) {
      .chat-thread-title-wrap { gap: 8px; }

      .chat-thread-avatar {
        width: 34px;
        height: 34px;
      }

      .chat-thread-page[data-keyboard="true"] .chat-thread-avatar {
        width: 30px;
        height: 30px;
      }

      .chat-thread-status {
        max-width: 128px;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
      }

      .chat-relationship-lock-bar {
        grid-template-columns: auto minmax(0, 1fr);
      }

      .chat-relationship-lock-action {
        grid-column: 1 / -1;
        width: 100%;
      }

      .chat-thread-tool-grid {
        min-height: 144px;
        grid-auto-rows: 68px;
        gap: 8px;
      }

      .chat-thread-tool-card {
        height: 68px;
        min-height: 68px;
        border-radius: 18px;
      }

      .chat-thread-tool-icon {
        width: 28px;
        height: 28px;
        border-radius: 12px;
      }

      .chat-thread-tool-name { font-size: 11px; }

      .chat-sticker-icon-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 10px;
      }

      .chat-sticker-icon-img-wrap {
        width: 40px;
        height: 40px;
        border-radius: 13px;
      }

      .chat-config-row,
      .chat-transfer-field { grid-template-columns: 1fr; }

      .chat-transfer-input {
        width: 100%;
        text-align: left;
      }

      .chat-config-actions,
      .chat-transfer-actions,
      .chat-clear-actions,
      .chat-mini-actions { grid-template-columns: 1fr; }
    }

    @media (prefers-reduced-motion: reduce) {
      .chat-thread-page,
      .chat-thread-search-card,
      .chat-thread-tool-grid,
      .chat-thread-tool-card,
      .chat-sticker-icon-grid { animation: none; transition: none; }
    }
  `;

  document.head.appendChild(style);
}

// 改了什么：修 iOS 键盘顶起后聊天页巨大空白和按钮点不到；移除 scrollIntoView 顶页面，改用 visualViewport 键盘高度适配。
// 会不会影响其他文件：不会，导出函数不变。
// 更新记忆里该文件的导出函数：无变化。
// 依赖：../../core/storage.js(getData,setData,getDB,setDB,getAllDB,getByIndexDB,generateId,getNow)；../../core/ui.js(createIcon,showToast,showBottomSheet,hideBottomSheet)；../../core/tts.js(stopAll)；./thread-render.js(renderThreadMessages)；./thread-actions.js(sendThreadMessage,sendImageMessage,sendStickerMessage,sendTransferMessage,sendCardMessage,sendDiceMessage,sendRpsMessage)；./thread-call.js(mountThreadCall,unmountThreadCall)；./thread-ai.js(checkThreadProactiveMessages)
