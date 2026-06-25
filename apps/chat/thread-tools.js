// apps/chat/thread-tools.js
// imports:
//   from '../../core/storage.js': getData, setData, getByIndexDB
//   from '../../core/ui.js': createIcon, showToast, showBottomSheet, hideBottomSheet
//   from './thread-call.js': mountThreadCall, unmountThreadCall
//   from './thread-actions.js': sendThreadMessage, sendImageMessage, sendDiceMessage, sendRpsMessage, sendTransferMessage
//   from './thread-render.js': renderThreadMessages
//   from './thread-settings.js': mountThreadSettings

import { getData, setData, getByIndexDB } from '../../core/storage.js';
import { createIcon, showToast, showBottomSheet, hideBottomSheet } from '../../core/ui.js';

import { mountThreadCall, unmountThreadCall } from './thread-call.js';

import {
  sendThreadMessage,
  sendImageMessage,
  sendDiceMessage,
  sendRpsMessage,
  sendTransferMessage
} from './thread-actions.js';

import { renderThreadMessages } from './thread-render.js';
import { mountThreadSettings } from './thread-settings.js';

const TOOL_STYLE_ID = 'chat-thread-tools-style';
const TOOL_PAGE_SIZE = 6;
const COMPACT_CONTEXT_COUNT = 12;
const MAX_TEXT_FILE_SIZE = 900 * 1024;
const MAX_IMAGE_FILE_SIZE = 4 * 1024 * 1024;
const FILE_CHUNK_SIZE = 12000;

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

// ═══════════════════════════════════════
// 【工具入口】打开工具抽屉并初始化分页
// ═══════════════════════════════════════

export function openToolSheet(state) {
  injectStyle();

  if (isLocked(state)) {
    openLockSheet(state);
    return;
  }

  state.toolPage = 0;
  state.toolItemsCache = getThreadTools(state);
  state.toolPagesCache = chunkArray(state.toolItemsCache, TOOL_PAGE_SIZE);
  state.toolSheetEl = createToolSheetShell(state);

  updateToolSheetPage(state);
  showBottomSheet(state.toolSheetEl);
}

export function refreshToolSheet(state) {
  if (!state?.toolSheetEl) return;
  updateToolSheetPage(state);
}

// ═══════════════════════════════════════
// 【工具抽屉】工具宫格、翻页和滑动
// ═══════════════════════════════════════

function createToolSheetShell(state) {
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

  viewport.addEventListener('pointerdown', (event) => handleToolPointerStart(state, event));
  viewport.addEventListener('pointerup', (event) => handleToolPointerEnd(state, event));
  viewport.addEventListener('pointercancel', () => resetToolSwipeStart(state));

  const dots = el('div', 'chat-thread-tool-dots');

  sheet.append(header, viewport, dots);
  return sheet;
}

function updateToolSheetPage(state) {
  const sheet = state.toolSheetEl;
  if (!sheet) return;

  const tools = state.toolItemsCache?.length ? state.toolItemsCache : getThreadTools(state);
  const pages = state.toolPagesCache?.length ? state.toolPagesCache : chunkArray(tools, TOOL_PAGE_SIZE);
  const pageCount = Math.max(1, pages.length);

  state.toolPage = Math.max(0, Math.min(Number(state.toolPage || 0), pageCount - 1));

  const subtitle = sheet.querySelector('.chat-thread-tool-subtitle');
  if (subtitle) subtitle.textContent = `${state.toolPage + 1} / ${pageCount}`;

  const grid = sheet.querySelector('.chat-thread-tool-grid');
  if (grid) {
    grid.dataset.page = String(state.toolPage);
    grid.replaceChildren();

    (pages[state.toolPage] || []).forEach((tool, index) => {
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
        updateToolSheetPage(state);
      });
      dots.appendChild(dot);
    }
  }
}

function handleToolPointerStart(state, event) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  state.toolSwipeStartX = event.clientX;
  state.toolSwipeStartY = event.clientY;
}

function handleToolPointerEnd(state, event) {
  const startX = Number(state.toolSwipeStartX || 0);
  const startY = Number(state.toolSwipeStartY || 0);
  if (!startX && !startY) return;

  const dx = Number(event.clientX || 0) - startX;
  const dy = Number(event.clientY || 0) - startY;

  resetToolSwipeStart(state);

  if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy) * 1.1) return;

  const pages = state.toolPagesCache?.length ? state.toolPagesCache : chunkArray(getThreadTools(state), TOOL_PAGE_SIZE);
  const pageCount = Math.max(1, pages.length);
  const nextPage = dx < 0
    ? Math.min(pageCount - 1, state.toolPage + 1)
    : Math.max(0, state.toolPage - 1);

  if (nextPage === state.toolPage) return;

  const grid = state.toolSheetEl?.querySelector('.chat-thread-tool-grid');
  if (grid) grid.dataset.direction = dx < 0 ? 'next' : 'prev';

  state.toolPage = nextPage;
  updateToolSheetPage(state);
}

function resetToolSwipeStart(state) {
  state.toolSwipeStartX = 0;
  state.toolSwipeStartY = 0;
}

// ═══════════════════════════════════════
// 【工具列表】生成所有工具按钮
// ═══════════════════════════════════════

function getThreadTools(state) {
  const locked = isLocked(state);
  const isGroup = state.mode === 'group';

  const tools = [
    {
      id: 'voice',
      text: '语音消息',
      icon: 'mic',
      hint: locked ? '先等等' : '文字版',
      action: () => locked ? openLockSheet(state) : openVoiceTextSheet(state)
    },
    {
      id: 'call',
      text: '打电话',
      icon: 'phone',
      hint: isGroup ? '暂不支持' : locked ? '先等等' : '通话',
      action: () => {
        if (locked) return openLockSheet(state);
        if (isGroup) return showToast('群聊电话晚点再做');
        openCallFromTool(state);
      }
    },
    {
      id: 'upload',
      text: '上传文件',
      icon: 'upload',
      hint: locked ? '先等等' : '分段发送',
      action: () => locked ? openLockSheet(state) : handleUploadFile(state)
    },
    {
      id: 'image',
      text: '发图片',
      icon: 'image',
      hint: locked ? '先等等' : '选图片',
      action: () => locked ? openLockSheet(state) : handleUploadFile(state, true)
    },
    {
      id: 'dice',
      text: '骰子',
      icon: 'dice',
      hint: locked ? '先等等' : '随机摇',
      action: () => locked ? openLockSheet(state) : handleDice(state)
    },
    {
      id: 'rps',
      text: '猜拳',
      icon: 'rps',
      hint: locked ? '先等等' : '随机出',
      action: () => locked ? openLockSheet(state) : handleRps(state)
    },
    {
      id: 'memory',
      text: '记忆',
      icon: 'memory',
      hint: '小本本',
      action: () => {
        hideBottomSheet();
        state.appState?.openMemory?.(state.characterId, { fromRoute: state.appState?.getRoute?.() });
      }
    },
    {
      id: 'mcp',
      text: 'MCP',
      icon: 'mcp',
      hint: locked ? '先等等' : '服务器',
      action: () => locked ? openLockSheet(state) : openMcpSheet()
    },
    {
      id: 'settings',
      text: '设置',
      icon: 'settings',
      hint: '聊天细节',
      action: () => openThreadSettings(state)
    },
    {
      id: 'clear',
      text: '清上下文',
      icon: 'clear',
      hint: '不删记录',
      action: () => openClearContextSheet(state)
    },
    {
      id: 'transfer',
      text: '转账',
      icon: 'transfer',
      hint: locked ? '先等等' : '小心意',
      action: () => locked ? openLockSheet(state) : openTransferSheet(state)
    },
    {
      id: 'relay',
      text: '接龙',
      icon: 'continue',
      hint: locked ? '先等等' : '一起编',
      action: () => locked ? openLockSheet(state) : openRelaySheet(state)
    },
    {
      id: 'mood',
      text: '心情',
      icon: 'thought',
      hint: locked ? '先等等' : '记录',
      action: () => locked ? openLockSheet(state) : openMoodSheet(state)
    },
    {
      id: 'quick',
      text: '快捷回复',
      icon: 'continue',
      hint: locked ? '先等等' : '轻轻回',
      action: () => locked ? openLockSheet(state) : openQuickReplySheet(state)
    }
  ];

  if (isGroup) {
    return tools.filter((tool) => tool.id !== 'memory' && tool.id !== 'call' && tool.id !== 'transfer');
  }

  return tools;
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
  if (['dice', 'rps', 'continue', 'thought', 'upload', 'image', 'mcp', 'clear', 'transfer', 'settings', 'memory', 'mic', 'phone'].includes(iconName)) {
    return createInlineIcon(iconName);
  }

  return createIcon(iconName, 18);
}

// ═══════════════════════════════════════
// 【发送类工具】语音文字、骰子、猜拳、快捷回复
// ═══════════════════════════════════════

function openVoiceTextSheet(state) {
  const sheet = el('div', 'chat-mini-sheet');
  const head = createMiniHead('文字版语音', '写一句话，会作为语音消息发给 TA。');
  const field = createTextareaField('想说的话', '比如：这句想当作语音发给你');

  const actions = createSheetActions('取消', '发送语音文字', () => {
    const text = field.input.value.trim();
    if (!text) {
      showToast('先写一点内容');
      return;
    }
    sendPresetText(state, text, { type: 'voice' });
  });

  sheet.append(head, field.wrap, actions);
  showBottomSheet(sheet);
  requestAnimationFrame(() => field.input.focus());
}

async function handleDice(state) {
  hideBottomSheet();

  try {
    state.isSending = true;
    await sendDiceMessage(state, { sides: 6 });
    await reloadThread(state);
  } finally {
    state.isSending = false;
  }
}

async function handleRps(state) {
  hideBottomSheet();

  try {
    state.isSending = true;
    await sendRpsMessage(state);
    await reloadThread(state);
  } finally {
    state.isSending = false;
  }
}

function openQuickReplySheet(state) {
  const sheet = el('div', 'chat-mini-sheet');
  const head = createMiniHead('挑一句轻轻发出去', '点一下就会直接发送。');
  const list = el('div', 'chat-choice-list');

  QUICK_REPLIES.forEach((text) => {
    const button = el('button', 'chat-choice-item', text);
    button.type = 'button';
    button.addEventListener('click', () => sendPresetText(state, text));
    list.appendChild(button);
  });

  sheet.append(head, list);
  showBottomSheet(sheet);
}

function openMoodSheet(state) {
  const sheet = el('div', 'chat-mini-sheet');
  const head = createMiniHead('记录一下现在的心情', '会发进当前聊天，让 TA 顺着你的状态回应。');
  const list = el('div', 'chat-choice-list');

  MOODS.forEach((text) => {
    const button = el('button', 'chat-choice-item', text);
    button.type = 'button';
    button.addEventListener('click', () => sendPresetText(state, `[心情] ${text}`));
    list.appendChild(button);
  });

  const custom = createTextareaField('自己写', '我现在的心情是……');
  const actions = createSheetActions('收起', '发送心情', () => {
    const text = custom.input.value.trim();
    if (!text) {
      showToast('先写一点心情');
      return;
    }
    sendPresetText(state, `[心情] ${text}`);
  });

  sheet.append(head, list, custom.wrap, actions);
  showBottomSheet(sheet);
}

function openRelaySheet(state) {
  const sheet = el('div', 'chat-mini-sheet');
  const head = createMiniHead('接龙玩法', '你起一个头，让 TA 接下去。');
  const field = createTextareaField('接龙开头', '比如：从前有一只很会撒娇的小猫……');

  const actions = createSheetActions('取消', '开始接龙', () => {
    const text = field.input.value.trim();
    if (!text) {
      showToast('先写一个开头');
      return;
    }
    sendPresetText(state, `[接龙] 请从这句后面自然接下去：${text}`);
  });

  sheet.append(head, field.wrap, actions);
  showBottomSheet(sheet);
  requestAnimationFrame(() => field.input.focus());
}

async function sendPresetText(state, text, extra = {}) {
  const content = String(text || '').trim();
  if (!content || state.isSending) return;

  hideBottomSheet();
  state.isSending = true;

  try {
    await sendThreadMessage(state, content, extra);
    await reloadThread(state);
  } finally {
    state.isSending = false;
  }
}

// ═══════════════════════════════════════
// 【文件工具】图片和文本文件上传发送
// ═══════════════════════════════════════

function handleUploadFile(state, imageOnly = false) {
  blurActiveInput();

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = imageOnly
    ? 'image/*'
    : [
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
    await processUploadFile(state, file, imageOnly);
  }, { once: true });

  hideBottomSheet();
  input.click();
}

async function processUploadFile(state, file, imageOnly = false) {
  if (state.isSending) return;

  if (file.type.startsWith('image/')) {
    await sendUploadedImage(state, file);
    return;
  }

  if (imageOnly) {
    showToast('这次只能选图片');
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

  await sendUploadedTextFile(state, file);
}

async function sendUploadedImage(state, file) {
  if (file.size > MAX_IMAGE_FILE_SIZE) {
    showToast('图片有点大，先换一张小一点的');
    return;
  }

  state.isSending = true;

  try {
    const dataUrl = await readFileAsDataURL(file);
    await sendImageMessage(state, dataUrl, file.name ? `图片：${file.name}` : '[图片]');
    await reloadThread(state);
  } finally {
    state.isSending = false;
  }
}

async function sendUploadedTextFile(state, file) {
  state.isSending = true;

  try {
    const text = await readFileAsText(file);
    const clean = String(text || '').trim();

    if (!clean) {
      await sendThreadMessage(state, `我上传了文件：${file.name || '未命名文件'}，但里面没有读到内容。`);
      await reloadThread(state);
      return;
    }

    const chunks = splitFileText(clean, FILE_CHUNK_SIZE);
    const lang = inferCodeLang(file.name);

    if (chunks.length <= 1) {
      await sendThreadMessage(state, buildFileMessage(file, clean, lang));
      await reloadThread(state);
      return;
    }

    showToast(`文件会分成 ${chunks.length} 段，最后再让 TA 回复`);

    for (let index = 0; index < chunks.length; index += 1) {
      const isLast = index === chunks.length - 1;
      const content = buildFileChunkMessage(file, chunks[index], lang, index + 1, chunks.length);
      await sendThreadMessage(state, content, { triggerAI: isLast });
      await reloadThread(state);
    }
  } finally {
    state.isSending = false;
  }
}
// ═══════════════════════════════════════
// 【更多工具】电话、设置、转账、上下文、MCP
// ═══════════════════════════════════════

async function openCallFromTool(state) {
  hideBottomSheet();

  if (typeof mountThreadCall !== 'function') {
    showToast('电话模块还没接上');
    return;
  }

  state.callMode = true;

  await mountThreadCall(state.rootEl, {
    state,
    close: () => {
      state.callMode = false;
      if (typeof unmountThreadCall === 'function') {
        unmountThreadCall();
      }
      state.reloadAndRender?.();
    }
  });
}

function openThreadSettings(state) {
  hideBottomSheet();

  if (typeof state.appState?.openThreadSettings === 'function') {
    state.appState.openThreadSettings(state.characterId, {
      fromRoute: state.appState?.getRoute?.()
    });
    return;
  }

  if (!state.rootEl) {
    showToast('设置页还没接上');
    return;
  }

  mountThreadSettings(state.rootEl, {
    characterId: state.characterId,
    appState: state.appState
  });
}

function openClearContextSheet(state) {
  const total = getAllCurrentMessages(state).length;
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
    reloadThread(state);
    showToast('上下文变轻啦');
  });

  actions.append(cancel, confirm);
  sheet.append(head, info, actions);
  showBottomSheet(sheet);
}

function openTransferSheet(state) {
  const sheet = el('div', 'chat-transfer-sheet');
  const head = el('div', 'chat-transfer-head');

  head.append(
    el('div', 'chat-transfer-title', '送一点小心意'),
    el('div', 'chat-transfer-subtitle', '填个金额和备注，TA 会看到这条转账消息。')
  );

  const form = el('div', 'chat-transfer-form');

  const amountField = createInputField('金额', '0.00', 'number');
  amountField.input.min = '0.01';
  amountField.input.step = '0.01';
  amountField.input.inputMode = 'decimal';

  const noteField = createInputField('备注', '比如：买杯热饮', 'text');
  noteField.input.maxLength = 40;

  form.append(amountField.wrap, noteField.wrap);

  const actions = el('div', 'chat-transfer-actions');

  const cancel = el('button', 'chat-transfer-btn ghost', '取消');
  cancel.type = 'button';
  cancel.addEventListener('click', () => hideBottomSheet());

  const submit = el('button', 'chat-transfer-btn primary', '发送转账');
  submit.type = 'button';
  submit.addEventListener('click', async () => {
    const value = Number(amountField.input.value || 0);
    if (!Number.isFinite(value) || value <= 0) {
      showToast('金额要大于 0');
      return;
    }

    hideBottomSheet();
    state.isSending = true;

    try {
      await sendTransferMessage(state, value, noteField.input.value.trim());
      await reloadThread(state);
    } finally {
      state.isSending = false;
    }
  });

  actions.append(cancel, submit);
  sheet.append(head, form, actions);
  showBottomSheet(sheet);
  requestAnimationFrame(() => amountField.input.focus());
}

function openMcpSheet() {
  const settings = getData('app_settings') || {};
  const originalServers = normalizeArray(settings.mcpServers || settings.mcp_servers);
  const draftServers = originalServers
    .map((server, index) => ({
      ...server,
      _index: index,
      id: server?.id || `mcp_${index}`,
      name: String(server?.name || server?.url || `MCP ${index + 1}`).trim(),
      url: String(server?.url || '').trim(),
      enabled: Boolean(server?.enabled)
    }))
    .filter((server) => server && (server.id || server.name || server.url));

  const sheet = el('div', 'chat-mcp-server-sheet');

  const grabber = el('div', 'chat-mcp-grabber');
  const head = el('header', 'chat-mcp-head');

  const close = el('button', 'chat-mcp-head-btn');
  close.type = 'button';
  close.setAttribute('aria-label', '关闭');
  close.appendChild(createInlineIcon('x-small'));
  close.addEventListener('click', () => hideBottomSheet());

  const title = el('div', 'chat-mcp-title', 'MCP服务器');

  const save = el('button', 'chat-mcp-head-btn');
  save.type = 'button';
  save.setAttribute('aria-label', '保存');
  save.appendChild(createInlineIcon('check'));
  save.addEventListener('click', () => {
    const nextServers = originalServers.map((server, index) => {
      const draft = draftServers.find((item) => item._index === index);
      if (!draft) return server;

      return {
        ...server,
        id: draft.id || server?.id || `mcp_${index}`,
        name: draft.name || server?.name || '',
        url: draft.url || server?.url || '',
        enabled: Boolean(draft.enabled)
      };
    });

    setData('app_settings', {
      ...settings,
      mcpServers: nextServers
    });

    hideBottomSheet();
    showToast('MCP 开关保存好啦');
  });

  head.append(close, title, save);

  const list = el('section', 'chat-mcp-list');

  if (!draftServers.length) {
    const empty = el('section', 'chat-mcp-empty');
    empty.append(
      el('div', 'chat-mcp-empty-title', '还没有 MCP 服务器'),
      el('div', 'chat-mcp-empty-desc', '先去设置里填好服务器，这里就能开关啦。')
    );
    list.appendChild(empty);
  } else {
    draftServers.forEach((server) => {
      list.appendChild(createMcpServerRow(server));
    });
  }

  sheet.append(grabber, head, list);
  showBottomSheet(sheet);
}

function createMcpServerRow(server) {
  const row = el('button', 'chat-mcp-row');
  row.type = 'button';
  row.dataset.enabled = server.enabled ? 'true' : 'false';

  const icon = el('span', 'chat-mcp-row-icon');
  icon.appendChild(createInlineIcon('hammer'));

  const name = el('span', 'chat-mcp-row-name', server.name || 'MCP');
  const count = el('span', 'chat-mcp-tool-count', getMcpToolCountText(server));

  const toggle = el('span', 'chat-mcp-toggle');
  toggle.appendChild(el('span', 'chat-mcp-toggle-dot'));

  row.append(icon, name, count, toggle);

  row.addEventListener('click', () => {
    server.enabled = !server.enabled;
    row.dataset.enabled = server.enabled ? 'true' : 'false';
  });

  return row;
}

function getMcpToolCountText(server) {
  const tools = normalizeArray(server.tools);
  const toolList = tools.length ? tools : normalizeArray(server.toolList);
  const total = Number(
    server.toolCount ||
    server.toolsCount ||
    server.totalTools ||
    toolList.length ||
    0
  );

  const enabledTools = normalizeArray(server.enabledTools);
  const active = Number(
    server.enabledToolCount ||
    server.activeToolCount ||
    enabledTools.length ||
    total ||
    0
  );

  return `工具: ${active}/${total}`;
}

// ═══════════════════════════════════════
// 【关系锁兜底】当前文件内置锁定提示，后续可拆到 relationship 文件
// ═══════════════════════════════════════

function isLocked(state) {
  return Boolean(getRelationshipLockLevel(state));
}

function getRelationshipLockLevel(state) {
  const lock = state?.relationshipLock;
  if (!lock || lock.status !== 'active') return '';
  return String(lock.type || '');
}

function openLockSheet(state) {
  const lock = state?.relationshipLock || {};
  const sheet = el('div', 'chat-lock-sheet');
  const head = createMiniHead(lock.title || 'TA 正在闹别扭', '这不是永久拉黑，只是 TA 现在还没完全消气。');

  const card = el('section', 'chat-lock-card');
  card.append(
    el('div', 'chat-lock-card-title', lock.title || '需要一点哄哄'),
    el('div', 'chat-lock-card-desc', lock.reason || '等一小会儿，或者认真想想怎么哄 TA。'),
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
    await state.reloadAndRender?.();
  });

  actions.append(close, refresh);
  sheet.append(head, card, actions);
  showBottomSheet(sheet);
}

function getLockLeftText(lock) {
  const endsAt = new Date(lock?.endsAt || 0).getTime();
  if (!endsAt) return '';

  const diff = Math.max(0, endsAt - Date.now());
  if (!diff) return '已经可以刷新看看啦。';

  const minutes = Math.ceil(diff / 60000);
  return `大约还要 ${minutes} 分钟。`;
}

// ═══════════════════════════════════════
// 【通用表单】底部抽屉里的输入、按钮和标题
// ═══════════════════════════════════════

function createMiniHead(title, subtitle) {
  const head = el('div', 'chat-mini-head');
  head.append(
    el('div', 'chat-mini-title', title || ''),
    el('div', 'chat-mini-subtitle', subtitle || '')
  );
  return head;
}

function createTextareaField(label, placeholder) {
  const wrap = el('label', 'chat-mini-field');
  const input = document.createElement('textarea');
  input.className = 'chat-mini-textarea';
  input.rows = 4;
  input.placeholder = placeholder || '';
  input.autocomplete = 'off';

  wrap.append(
    el('span', 'chat-mini-label', label || ''),
    input
  );

  return { wrap, input };
}

function createInputField(label, placeholder, type = 'text') {
  const wrap = el('label', 'chat-transfer-field');
  const input = document.createElement('input');
  input.className = 'chat-transfer-input';
  input.type = type;
  input.placeholder = placeholder || '';
  input.autocomplete = 'off';

  wrap.append(
    el('span', 'chat-transfer-label', label || ''),
    input
  );

  return { wrap, input };
}

function createSheetActions(cancelText, confirmText, onConfirm) {
  const actions = el('div', 'chat-mini-actions');

  const cancel = el('button', 'chat-mini-btn ghost', cancelText || '取消');
  cancel.type = 'button';
  cancel.addEventListener('click', () => hideBottomSheet());

  const confirm = el('button', 'chat-mini-btn primary', confirmText || '确定');
  confirm.type = 'button';
  confirm.addEventListener('click', onConfirm);

  actions.append(cancel, confirm);
  return actions;
}

// ═══════════════════════════════════════
// 【数据刷新】重载当前消息并刷新列表
// ═══════════════════════════════════════

async function reloadThread(state) {
  if (typeof state.reloadAndRender === 'function') {
    await state.reloadAndRender();
    return;
  }

  await loadCurrentMessages(state);

  const page = state.rootEl?.querySelector?.('.chat-thread-page') || state.rootEl;
  if (page) renderThreadMessages(state, page);
}

async function loadCurrentMessages(state) {
  if (!state) return;

  if (state.mode === 'group') {
    state.groupMessages = normalizeArray(await getByIndexDB('group_messages', 'groupId', state.groupId).catch(() => []))
      .filter((item) => item?.id)
      .sort(sortByTimestamp);
    return;
  }

  state.messages = normalizeArray(await getByIndexDB('messages', 'characterId', state.characterId).catch(() => []))
    .filter((item) => item?.id)
    .sort(sortByTimestamp);
}

function getAllCurrentMessages(state) {
  return state.mode === 'group' ? normalizeArray(state.groupMessages) : normalizeArray(state.messages);
}

// ═══════════════════════════════════════
// 【文件处理】读取、分段和语言识别
// ═══════════════════════════════════════

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

// ═══════════════════════════════════════
// 【基础工具】数组、排序、失焦和分页
// ═══════════════════════════════════════

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

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

// ═══════════════════════════════════════
// 【SVG图标】工具抽屉里使用的线条图标
// ═══════════════════════════════════════

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

  const rect = (x, y, w, h, rx = 2) => {
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
  } else if (name === 'image') {
    rect('4', '5', '16', '14', '4');
    circle('9', '10', '1.4');
    path('M7 17l4-4 3 3 2-2 3 3');
  } else if (name === 'memory') {
    rect('6', '5', '12', '14', '3');
    path('M9 9h6');
    path('M9 12h6');
    path('M9 15h4');
  } else if (name === 'mic') {
    path('M12 4a3 3 0 0 0-3 3v5a3 3 0 1 0 6 0V7a3 3 0 0 0-3-3Z');
    path('M6 11a6 6 0 0 0 12 0');
    path('M12 17v3');
  } else if (name === 'phone') {
    path('M7 5h3l2 5-2 2a11 11 0 0 0 4 4l2-2 5 2v3a2 2 0 0 1-2 2C10.4 21 3 13.6 3 4a2 2 0 0 1 2-2h2');
  } else if (name === 'transfer') {
    path('M4 7h14');
    path('M10 3l4 4-4 4');
    path('M20 17H6');
    path('M14 13l-4 4 4 4');
  } else if (name === 'clear') {
    path('M5 7h14');
    path('M8 7l1-2h6l1 2');
    path('M9 11v6');
    path('M15 11v6');
    path('M7 7l1 12h8l1-12');
  } else if (name === 'settings') {
    circle('12', '12', '3.2');
    path('M19.4 13.5a7.8 7.8 0 0 0 .1-3l2-1.1-2-3.5-2.2.7a8 8 0 0 0-2.6-1.5l-.3-2.2h-4l-.3 2.2a8 8 0 0 0-2.6 1.5l-2.2-.7-2 3.5 2 1.1a7.8 7.8 0 0 0 0 3l-2 1.1 2 3.5 2.2-.7a8 8 0 0 0 2.6 1.5l.3 2.2h4l.3-2.2a8 8 0 0 0 2.6-1.5l2.2.7 2-3.5-2-1.1Z');
  } else if (name === 'mcp' || name === 'hammer') {
    path('M13.5 5.5l5 5');
    path('M14.5 4.5l1-1a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8l-1 1');
    path('M3.5 20.5l8.5-8.5');
    path('M10 9l5 5');
    path('M8.5 10.5l5 5');
  } else if (name === 'x-small') {
    path('M7 7l10 10');
    path('M17 7 7 17');
  } else if (name === 'check') {
    path('M5 12.5l4.2 4.2L19 7');
  } else {
    circle('12', '12', '8');
  }

  return svg;
}

// ═══════════════════════════════════════
// 【样式】工具抽屉和相关底部面板样式
// ═══════════════════════════════════════

function injectStyle() {
  if (document.getElementById(TOOL_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = TOOL_STYLE_ID;
  style.textContent = `
    .chat-thread-tool-sheet,.chat-mini-sheet,.chat-transfer-sheet,.chat-clear-sheet,.chat-lock-sheet{padding:6px 20px 20px}
    .chat-thread-tool-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:14px}
    .chat-thread-tool-title,.chat-mini-title,.chat-transfer-title,.chat-clear-title{color:var(--text-primary);font-size:var(--font-size-title);font-weight:600;line-height:1.35}
    .chat-thread-tool-subtitle,.chat-mini-subtitle,.chat-transfer-subtitle,.chat-clear-subtitle{margin-top:4px;color:var(--text-secondary);font-size:var(--font-size-small);line-height:1.5}
    .chat-thread-tool-viewport{overflow:hidden;touch-action:pan-y}
    .chat-thread-tool-grid{min-height:154px;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:72px;gap:8px;align-content:start;animation:chatToolGridIn 220ms ease both}
    .chat-thread-tool-card{height:72px;min-height:72px;display:grid;grid-template-rows:30px auto;align-items:center;justify-items:center;gap:5px;padding:8px 6px 7px;border-radius:20px;background:var(--bg-card);color:var(--text-primary);box-shadow:var(--shadow-sm);font:inherit;transition:all 200ms ease;animation:chatToolCardIn 220ms ease both;animation-delay:var(--tool-delay,0ms)}
    .chat-thread-tool-card:active,.chat-choice-item:active,.chat-mini-btn:active,.chat-transfer-btn:active,.chat-clear-btn:active{transform:scale(.96)}
    .chat-thread-tool-icon{width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;border-radius:13px;color:var(--accent);background:var(--surface-muted);box-shadow:var(--shadow-sm)}
    .chat-thread-tool-name{max-width:100%;color:var(--text-primary);font-size:12px;font-weight:600;line-height:1.25;text-align:center;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .chat-thread-tool-hint{display:block;color:var(--text-hint);font-size:10px;line-height:1.2;text-align:center;opacity:.72;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .chat-thread-tool-dots{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:14px}
    .chat-thread-tool-dot{width:7px;height:7px;border-radius:999px;background:var(--text-hint);opacity:.35;transition:all 200ms ease}
    .chat-thread-tool-dot[data-active="true"]{width:18px;opacity:1;background:var(--accent)}
    .chat-mini-head,.chat-transfer-head,.chat-clear-head{margin-bottom:16px}
    .chat-choice-list,.chat-transfer-form{display:flex;flex-direction:column;gap:10px}
    .chat-choice-item,.chat-mini-field,.chat-clear-card,.chat-lock-card{padding:14px;border-radius:18px;background:var(--bg-card);box-shadow:var(--shadow-sm)}
    .chat-choice-item{color:var(--text-primary);text-align:left;font:inherit;font-size:14px;line-height:1.5;transition:all 200ms ease}
    .chat-mini-label,.chat-transfer-label,.chat-clear-card-title,.chat-lock-card-title{color:var(--text-primary);font-size:14px;font-weight:600;line-height:1.35}
    .chat-clear-card-desc,.chat-lock-card-desc{margin-top:6px;color:var(--text-secondary);font-size:13px;line-height:1.6}
    .chat-lock-card-time{margin-top:10px;color:var(--text-hint);font-size:12px;line-height:1.45}
    .chat-mini-textarea{width:100%;min-height:96px;margin-top:10px;padding:10px 12px;resize:none;border-radius:14px;background:var(--surface-muted);color:var(--text-primary);box-shadow:var(--shadow-sm);font-size:16px;line-height:1.6}
    .chat-transfer-field{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;padding:14px;border-radius:18px;background:var(--bg-card);box-shadow:var(--shadow-sm)}
    .chat-transfer-input{width:min(180px,42vw);height:38px;padding:0 10px;border-radius:14px;background:var(--surface-muted);color:var(--text-primary);box-shadow:var(--shadow-sm);font-size:16px;text-align:right}
    .chat-mini-actions,.chat-transfer-actions,.chat-clear-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
    .chat-mini-btn,.chat-transfer-btn,.chat-clear-btn{min-height:44px;display:inline-flex;align-items:center;justify-content:center;border-radius:16px;box-shadow:var(--shadow-sm);font:inherit;font-size:14px;transition:all 200ms ease}
    .chat-mini-btn.primary,.chat-transfer-btn.primary,.chat-clear-btn.primary{background:var(--accent);color:var(--bubble-user-text)}
    .chat-mini-btn.ghost,.chat-transfer-btn.ghost,.chat-clear-btn.ghost{background:var(--bg-card);color:var(--text-secondary)}
    .chat-mcp-server-sheet{min-height:min(72vh,620px);padding:18px 20px 24px;background:var(--bg-primary);color:var(--text-primary)}
    .chat-mcp-grabber{width:120px;height:10px;margin:0 auto 22px;border-radius:999px;background:var(--surface-muted)}
    .chat-mcp-head{display:grid;grid-template-columns:48px minmax(0,1fr) 48px;align-items:center;gap:12px;margin-bottom:28px}
    .chat-mcp-head-btn{width:48px;height:48px;display:inline-flex;align-items:center;justify-content:center;border-radius:18px;background:transparent;color:var(--text-primary);transition:all 200ms ease}
    .chat-mcp-title{color:var(--text-primary);font-size:24px;font-weight:700;line-height:1.25;text-align:center}
    .chat-mcp-list{display:flex;flex-direction:column;gap:34px}
    .chat-mcp-row{min-height:76px;display:grid;grid-template-columns:46px minmax(0,1fr) auto 64px;align-items:center;gap:14px;padding:0;background:transparent;color:var(--text-primary);font:inherit;text-align:left;transition:all 200ms ease}
    .chat-mcp-row:active{transform:scale(.98)}
    .chat-mcp-row-icon{width:46px;height:46px;display:inline-flex;align-items:center;justify-content:center;color:var(--accent)}
    .chat-mcp-row-name{min-width:0;color:var(--text-primary);font-size:22px;font-weight:700;line-height:1.35;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .chat-mcp-tool-count{min-height:34px;display:inline-flex;align-items:center;justify-content:center;padding:0 14px;border-radius:999px;background:var(--bg-card);color:var(--accent);box-shadow:var(--shadow-sm);font-size:16px;font-weight:700;line-height:1;white-space:nowrap}
    .chat-mcp-toggle{position:relative;width:64px;height:38px;display:inline-flex;align-items:center;padding:4px;border-radius:999px;background:var(--surface-muted);box-shadow:var(--shadow-sm);transition:all 200ms ease}
    .chat-mcp-toggle-dot{width:30px;height:30px;border-radius:999px;background:var(--bg-card);box-shadow:var(--shadow-sm);transition:all 200ms ease}
    .chat-mcp-row[data-enabled="true"] .chat-mcp-toggle{background:var(--accent)}
    .chat-mcp-row[data-enabled="true"] .chat-mcp-toggle-dot{transform:translateX(26px)}
    .chat-mcp-empty{margin-top:24px;padding:18px;border-radius:22px;background:var(--bg-card);box-shadow:var(--shadow-sm)}
    .chat-mcp-empty-title{color:var(--text-primary);font-size:16px;font-weight:600;line-height:1.35}
    .chat-mcp-empty-desc{margin-top:6px;color:var(--text-secondary);font-size:13px;line-height:1.6}
    @keyframes chatToolGridIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
    @keyframes chatToolCardIn{from{opacity:0;transform:translateY(7px) scale(.98)}to{opacity:1;transform:translateY(0) scale(1)}}
    @media(max-width:430px){.chat-thread-tool-grid{min-height:144px;grid-auto-rows:68px}.chat-thread-tool-card{height:68px;min-height:68px;border-radius:18px}.chat-transfer-field{grid-template-columns:1fr}.chat-transfer-input{width:100%;text-align:left}.chat-mini-actions,.chat-transfer-actions,.chat-clear-actions{grid-template-columns:1fr}}
  `;

  document.head.appendChild(style);
}

// ═══════════════════════════════════════
// 【DOM工具】创建节点
// ═══════════════════════════════════════

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// 依赖：../../core/storage.js(getData,setData,getByIndexDB)；../../core/ui.js(createIcon,showToast,showBottomSheet,hideBottomSheet)；./thread-call.js(mountThreadCall,unmountThreadCall)；./thread-actions.js(sendThreadMessage,sendImageMessage,sendDiceMessage,sendRpsMessage,sendTransferMessage)；./thread-render.js(renderThreadMessages)；./thread-settings.js(mountThreadSettings)
