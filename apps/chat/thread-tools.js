// apps/chat/thread-tools.js
// imports:
//   from '../../core/storage.js': generateId, getNow, setDB, deleteDB, getByIndexDB, compressImage
//   from '../../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon
//   from '../../core/mcp.js': getMcpServers
//   from './thread-actions.js': sendImageMessage, sendStickerMessage, sendTransferMessage

import {
  generateId,
  getNow,
  setDB,
  deleteDB,
  getByIndexDB,
  compressImage
} from '../../core/storage.js';

import {
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm,
  createIcon
} from '../../core/ui.js';

import { getMcpServers } from '../../core/mcp.js';

import {
  sendImageMessage,
  sendStickerMessage,
  sendTransferMessage
} from './thread-actions.js';

export function openToolboxSheet(ctx) {
  const sheet = el('div', 'thread-sheet toolbox-sheet');
  const head = sheetHead('小工具', '左右滑动切换工具');

  const pages = el('div', 'toolbox-grid-pages');

  const pageOne = el('div', 'toolbox-grid-page');
  pageOne.append(
    toolGridItem('image', '发图片', openImagePicker),
    toolGridItem('smile', '表情包', () => openStickerPicker(ctx)),
    toolGridItem('transfer', '转账', () => openTransferSheet(ctx)),
    toolGridItem('phone', '打电话', () => openCall(ctx)),
    toolGridItem('clear', '清空', () => clearCurrentChatWithConfirm(ctx)),
    toolGridItem('settings', '显示', () => openDisplayModeSheet(ctx)),
    toolGridItem('memory', '记忆', () => openMemoryEntry(ctx)),
    toolGridItem('mcp', '工具服务', () => openMcpConfigSheet(ctx)),
    toolGridItem('camera', '表情管理', () => openStickerManager(ctx))
  );

  const pageTwo = el('div', 'toolbox-grid-page');
  pageTwo.append(
    toolGridItem('settings', 'API / 模型', () => openApiModelSheet(ctx)),
    toolGridItem('sound', 'TTS 语音', () => openTtsVoiceSheet(ctx))
  );

  pages.append(pageOne, pageTwo);

  const hint = el('div', 'toolbox-hint', '左右滑动切换工具');

  sheet.append(head, pages, hint);
  showBottomSheet(sheet);

  async function openImagePicker() {
    hideBottomSheet();

    const file = await pickFile('image/*');
    if (!file) return;

    const imageBase64 = await compressImage(file, 1280, 0.82);
    await sendImageMessage(ctx, imageBase64);
  }
}

function toolGridItem(iconName, title, handler) {
  const item = el('button', 'toolbox-grid-item');
  item.type = 'button';

  const icon = el('span', 'toolbox-grid-icon');
  icon.appendChild(createIcon(iconName, 22));

  item.append(icon, el('span', 'toolbox-grid-title', title));

  item.addEventListener('click', () => {
    if (typeof handler !== 'function') return;
    handler();
  });

  return item;
}

function openStickerPicker(ctx) {
  hideBottomSheet();

  const sheet = el('div', 'thread-sheet sticker-sheet');
  const head = sheetHead('表情包', '描述只给 AI 理解，不会显示给你');

  const top = el('div', 'sticker-top-actions');

  const upload = button('上传表情', 'ghost', 'camera');
  upload.addEventListener('click', async () => {
    hideBottomSheet();
    await openUploadStickerSheet(ctx, () => openStickerPicker(ctx));
  });

  top.appendChild(upload);

  const search = createInput('搜描述或标签');
  search.className = 'chat-input-card';

  const grid = el('div', 'sticker-grid compact');

  const render = () => {
    const q = search.value.trim().toLowerCase();
    grid.innerHTML = '';

    const list = ctx.state.stickers.filter((item) => {
      const base = `${item.description || ''} ${ctx.normalizeArray(item.tags).join(' ')}`.toLowerCase();
      return !q || base.includes(q);
    });

    if (!list.length) {
      grid.appendChild(emptyState('还没有表情', '先上传一个小表情吧。'));
      return;
    }

    list.forEach((sticker) => {
      const cell = el('button', 'sticker-cell compact');
      cell.type = 'button';

      const img = document.createElement('img');
      img.src = sticker.image;
      img.alt = '';

      cell.appendChild(img);

      cell.addEventListener('click', async () => {
        hideBottomSheet();
        await sendStickerMessage(ctx, sticker);
      });

      grid.appendChild(cell);
    });
  };

  search.addEventListener('input', render);
  render();

  sheet.append(head, top, search, grid);
  showBottomSheet(sheet);
}

async function openUploadStickerSheet(ctx, afterDone = null) {
  const file = await pickFile('image/*');
  if (!file) return;

  const image = await compressImage(file, 512, 0.85);

  const sheet = el('div', 'thread-sheet sticker-desc-sheet');
  const head = sheetHead('表情描述', '这段描述只给 AI 理解，你这边不会显示');

  const preview = el('div', 'sticker-upload-preview');
  const img = document.createElement('img');
  img.src = image;
  img.alt = '';
  preview.appendChild(img);

  const desc = createTextarea('比如：害羞、撒娇、委屈、开心地扑过来');
  desc.className = 'chat-input-card sticker-description-input';

  const tags = createInput('标签，可选，用空格隔开');
  tags.className = 'chat-input-card';

  const save = button('保存表情', 'primary', 'check');
  save.addEventListener('click', async () => {
    const sticker = {
      id: generateId(),
      image,
      description: desc.value.trim(),
      tags: tags.value.trim().split(/\s+/).filter(Boolean),
      createdAt: getNow()
    };

    await setDB('stickers', sticker.id, sticker);
    await ctx.refreshBaseData();

    hideBottomSheet();
    showToast('表情包放好了');

    if (typeof afterDone === 'function') {
      window.setTimeout(afterDone, 180);
    }
  });

  sheet.append(head, preview, formRow('描述', desc), formRow('标签', tags), save);
  showBottomSheet(sheet);
}

function openStickerManager(ctx) {
  hideBottomSheet();

  const sheet = el('div', 'thread-sheet sticker-manager-sheet');
  const head = sheetHead('表情管理', '点开可以改描述或删除');

  const upload = button('上传新表情', 'primary', 'camera');
  upload.addEventListener('click', async () => {
    hideBottomSheet();
    await openUploadStickerSheet(ctx, () => openStickerManager(ctx));
  });

  const grid = el('div', 'sticker-grid compact');

  if (!ctx.state.stickers.length) {
    grid.appendChild(emptyState('还没有表情', '上传一个，之后每个 AI 都能用。'));
  } else {
    ctx.state.stickers.forEach((sticker) => {
      const cell = el('button', 'sticker-cell compact manage');
      cell.type = 'button';

      const img = document.createElement('img');
      img.src = sticker.image;
      img.alt = '';

      cell.appendChild(img);
      cell.addEventListener('click', () => openEditStickerSheet(ctx, sticker));

      grid.appendChild(cell);
    });
  }

  sheet.append(head, upload, grid);
  showBottomSheet(sheet);
}

function openEditStickerSheet(ctx, sticker) {
  hideBottomSheet();

  const sheet = el('div', 'thread-sheet sticker-desc-sheet');
  const head = sheetHead('编辑表情描述', '描述只给 AI 理解，不显示在聊天里');

  const preview = el('div', 'sticker-upload-preview');
  const img = document.createElement('img');
  img.src = sticker.image;
  img.alt = '';
  preview.appendChild(img);

  const desc = createTextarea('表情描述');
  desc.className = 'chat-input-card sticker-description-input';
  desc.value = sticker.description || '';

  const tags = createInput('标签，用空格隔开');
  tags.className = 'chat-input-card';
  tags.value = ctx.normalizeArray(sticker.tags).join(' ');

  const actions = el('div', 'sheet-button-row');

  const save = button('保存', 'primary', 'check');
  save.addEventListener('click', async () => {
    const next = {
      ...sticker,
      description: desc.value.trim(),
      tags: tags.value.trim().split(/\s+/).filter(Boolean),
      updatedAt: getNow()
    };

    await setDB('stickers', next.id, next);
    await ctx.refreshBaseData();

    hideBottomSheet();
    showToast('表情描述保存好了');
    window.setTimeout(() => openStickerManager(ctx), 180);
  });

  const del = button('删除', 'ghost', 'delete');
  del.addEventListener('click', async () => {
    const ok = await showConfirm('要删掉这个表情吗？');
    if (!ok) return;

    await deleteDB('stickers', sticker.id);
    await ctx.refreshBaseData();

    hideBottomSheet();
    showToast('表情删掉了');
    window.setTimeout(() => openStickerManager(ctx), 180);
  });

  actions.append(save, del);
  sheet.append(head, preview, formRow('描述', desc), formRow('标签', tags), actions);
  showBottomSheet(sheet);
}

function openTransferSheet(ctx) {
  hideBottomSheet();

  const sheet = el('div', 'thread-sheet transfer-sheet');
  const head = sheetHead('转一笔小钱', '会写进聊天记录里');

  const amount = createInput('金额');
  amount.type = 'number';
  amount.min = '1';
  amount.step = '1';
  amount.className = 'chat-input-card';

  const note = createInput('备注，可不填');
  note.className = 'chat-input-card';

  let targetSelect = null;

  if (ctx.state.currentGroup) {
    targetSelect = document.createElement('select');
    targetSelect.className = 'chat-input-card';

    ctx.getGroupMemberCharacters(ctx.state.currentGroup).forEach((character) => {
      const option = document.createElement('option');
      option.value = character.id;
      option.textContent = character.name || '群成员';
      targetSelect.appendChild(option);
    });

    sheet.append(head, formRow('收款对象', targetSelect));
  } else {
    sheet.append(head);
  }

  const submit = button('确认转账', 'primary', 'transfer');
  submit.addEventListener('click', async () => {
    const value = Math.max(0, Number(amount.value || 0));
    if (!value) {
      showToast('金额要大于 0');
      return;
    }

    hideBottomSheet();

    await sendTransferMessage(ctx, value, note.value.trim(), targetSelect?.value || '');
  });

  sheet.append(formRow('金额', amount), formRow('备注', note), submit);
  showBottomSheet(sheet);
}

function openDisplayModeSheet(ctx) {
  hideBottomSheet();

  const current = ctx.getDisplayMode();
  const sheet = el('div', 'thread-sheet display-mode-sheet');
  const head = sheetHead('显示模式', '选择聊天阅读方式');

  const bubble = choiceCard('settings', '气泡模式', '像聊天软件一样左右气泡', current === 'bubble');
  const dialog = choiceCard('settings', '对话模式', '像 AI App 一样干净阅读', current === 'dialog');

  bubble.addEventListener('click', async () => {
    ctx.saveDisplayMode('bubble');
    hideBottomSheet();
    await ctx.rerenderThread({ scroll: false });
  });

  dialog.addEventListener('click', async () => {
    ctx.saveDisplayMode('dialog');
    hideBottomSheet();
    await ctx.rerenderThread({ scroll: false });
  });

  sheet.append(head, bubble, dialog);
  showBottomSheet(sheet);
}

function openMemoryEntry(ctx) {
  hideBottomSheet();

  if (ctx.state.currentGroup) {
    showToast('群聊记忆会分别写给成员');
    return;
  }

  const characterId = ctx.state.currentCharacter?.id;
  if (!characterId) return;

  ctx.appState?.openMemory?.(characterId, { from: 'thread' });
}

async function openMcpConfigSheet(ctx) {
  hideBottomSheet();

  const targetId = ctx.getChatTargetId();
  if (!targetId) {
    showToast('还没有可配置的角色');
    return;
  }

  const config = ctx.getChatConfig(targetId);
  const servers = ctx.normalizeArray(await getMcpServers());

  const sheet = el('div', 'thread-sheet mcp-config-sheet');
  const head = sheetHead('工具服务', '让 TA 需要时调用工具');

  const enable = switchRow('启用 MCP', '开启后会先判断要不要用工具', config.mcpEnabled);
  const list = el('div', 'mcp-server-list');

  if (!servers.length) {
    list.appendChild(emptyState('还没有工具服务', '去设置里添加 MCP 服务。'));
  } else {
    servers.forEach((server) => {
      const row = switchRow(server.name || '未命名服务', server.url || '', ctx.normalizeArray(config.enabledMcpServerIds).includes(server.id));
      row.dataset.serverId = server.id;
      list.appendChild(row);
    });
  }

  const save = button('保存工具选择', 'primary', 'check');
  save.addEventListener('click', () => {
    const enabledMcpServerIds = [...list.querySelectorAll('[data-server-id]')]
      .filter((row) => getSwitchValue(row))
      .map((row) => row.dataset.serverId);

    ctx.saveChatConfig(targetId, {
      ...config,
      mcpEnabled: getSwitchValue(enable),
      enabledMcpServerIds
    });

    hideBottomSheet();
    showToast('工具服务保存好了');
  });

  sheet.append(head, enable, list, save);
  showBottomSheet(sheet);
}

function openApiModelSheet(ctx) {
  hideBottomSheet();

  const targetId = ctx.getChatTargetId();
  if (!targetId) {
    showToast('还没有可配置的角色');
    return;
  }

  const settings = ctx.getSettings();
  const config = ctx.getChatConfig(targetId);
  const endpoints = ctx.normalizeArray(settings.apiEndpoints);

  const sheet = el('div', 'thread-sheet api-model-sheet');
  const head = sheetHead('API / 模型', '给当前聊天选择中转站和模型');

  const endpointStrip = el('div', 'select-strip');
  const selectedEndpoint = config.endpointId || settings.defaultApiEndpointId || '';

  if (!endpoints.length) {
    endpointStrip.appendChild(emptyState('还没有 API 中转站', '去设置里添加接口。'));
  } else {
    endpoints.forEach((endpoint) => {
      const card = selectPill(endpoint.id, endpoint.name || endpoint.title || endpoint.url || '未命名接口', selectedEndpoint === endpoint.id);
      card.dataset.value = endpoint.id;
      endpointStrip.appendChild(card);
    });

    if (!endpointStrip.querySelector('.selected')) {
      endpointStrip.querySelector('[data-value]')?.classList.add('selected');
    }
  }

  const modelStrip = el('div', 'select-strip');
  const initialEndpointId = endpointStrip.querySelector('.selected')?.dataset.value || selectedEndpoint;
  const models = collectModels(settings, endpoints, initialEndpointId);
  const selectedModel = config.model || settings.defaultModel || '';

  renderModelStrip(modelStrip, models, selectedModel);

  endpointStrip.addEventListener('click', (event) => {
    const card = event.target.closest('[data-value]');
    if (!card) return;

    endpointStrip.querySelectorAll('[data-value]').forEach((node) => node.classList.remove('selected'));
    card.classList.add('selected');

    const nextModels = collectModels(settings, endpoints, card.dataset.value);
    renderModelStrip(modelStrip, nextModels, config.model || settings.defaultModel || '');
  });

  const save = button('保存 API / 模型', 'primary', 'check');
  save.addEventListener('click', () => {
    const endpointId = endpointStrip.querySelector('.selected')?.dataset.value || '';
    const model = modelStrip.querySelector('.selected')?.dataset.value || modelStrip.querySelector('.model-manual-input')?.value?.trim() || '';

    ctx.saveChatConfig(targetId, {
      ...config,
      endpointId,
      model
    });

    hideBottomSheet();
    showToast('API 和模型保存好了');
  });

  sheet.append(
    head,
    sectionTitle('中转站'),
    endpointStrip,
    sectionTitle('模型'),
    modelStrip,
    save
  );

  showBottomSheet(sheet);
}

function openTtsVoiceSheet(ctx) {
  hideBottomSheet();

  const targetId = ctx.getChatTargetId();
  if (!targetId) {
    showToast('还没有可配置的角色');
    return;
  }

  const settings = ctx.getSettings();
  const config = ctx.getChatConfig(targetId);
  const voices = ctx.normalizeArray(settings.ttsVoices);

  const sheet = el('div', 'thread-sheet tts-voice-sheet');
  const head = sheetHead('TTS 语音', '选择当前聊天的声音');

  const enable = switchRow('自动朗读', '回复完成后自动播放声音', config.ttsEnabled);

  const strip = el('div', 'select-strip');
  const selected = config.ttsVoiceId || '';

  if (!voices.length) {
    strip.appendChild(emptyState('还没有 TTS 语音', '去设置里添加语音配置。'));
  } else {
    voices.forEach((voice) => {
      const name = voice.name || voice.title || voice.voiceId || voice.id || '未命名语音';
      const card = selectPill(voice.id, name, selected === voice.id);
      card.dataset.value = voice.id;
      strip.appendChild(card);
    });
  }

  strip.addEventListener('click', (event) => {
    const card = event.target.closest('[data-value]');
    if (!card) return;

    strip.querySelectorAll('[data-value]').forEach((node) => node.classList.remove('selected'));
    card.classList.add('selected');
  });

  const save = button('保存 TTS 语音', 'primary', 'check');
  save.addEventListener('click', () => {
    const ttsVoiceId = strip.querySelector('.selected')?.dataset.value || '';

    ctx.saveChatConfig(targetId, {
      ...config,
      ttsEnabled: getSwitchValue(enable),
      ttsVoiceId
    });

    hideBottomSheet();
    showToast('语音保存好了');
  });

  sheet.append(head, enable, sectionTitle('声音'), strip, save);
  showBottomSheet(sheet);
}

async function clearCurrentChatWithConfirm(ctx) {
  hideBottomSheet();

  if (ctx.state.currentCharacter) {
    const character = ctx.state.currentCharacter;
    const ok = await showConfirm(`要清掉和「${character.name || 'TA'}」的聊天记录吗？角色会保留。`);
    if (!ok) return;

    const messages = await getByIndexDB('messages', 'characterId', character.id);
    for (const message of ctx.normalizeArray(messages)) {
      await deleteDB('messages', message.id);
    }

    await ctx.reloadCurrentMessages();
    await ctx.updateLatestPrivateCache(character.id);
    await ctx.markPrivateRead(character.id);

    ctx.appState?.hidePrivateThread?.(character.id);
    showToast('聊天记录清掉了');
    await ctx.appState?.navigateToList?.({ tab: 'private' });
    return;
  }

  if (ctx.state.currentGroup) {
    const group = ctx.state.currentGroup;
    const ok = await showConfirm(`要清掉「${group.name || '群聊'}」的聊天记录吗？`);
    if (!ok) return;

    const messages = await getByIndexDB('group_messages', 'groupId', group.id);
    for (const message of ctx.normalizeArray(messages)) {
      await deleteDB('group_messages', message.id);
    }

    await ctx.reloadCurrentMessages();
    await ctx.updateLatestGroupCache(group.id);
    await ctx.clearGroupUnread(group.id);

    showToast('群聊记录清掉了');
    await ctx.rerenderThread({ scroll: false });
  }

  window.refreshDesktopBadges?.();
}

async function openCall(ctx) {
  hideBottomSheet();

  const mod = await import('./thread-call.js');
  mod.openThreadCall(ctx);
}

function collectModels(settings, endpoints, endpointId) {
  const endpoint = endpoints.find((item) => item.id === endpointId);
  const models = [];

  pushModels(models, endpoint?.models);
  pushModels(models, endpoint?.modelList);
  pushModels(models, settings.models);
  pushModels(models, settings.availableModels);

  if (settings.defaultModel) models.unshift(settings.defaultModel);

  return [...new Set(models.map((item) => String(item || '').trim()).filter(Boolean))];
}

function pushModels(target, source) {
  if (!Array.isArray(source)) return;

  source.forEach((item) => {
    if (typeof item === 'string') {
      target.push(item);
      return;
    }

    if (item?.id) target.push(item.id);
    else if (item?.name) target.push(item.name);
    else if (item?.model) target.push(item.model);
  });
}

function renderModelStrip(strip, models, selectedModel) {
  strip.innerHTML = '';
  strip.onclick = null;

  if (!models.length) {
    const manual = createInput('手动输入模型名');
    manual.className = 'chat-input-card model-manual-input';

    const add = button('使用这个模型', 'ghost', 'check');
    add.addEventListener('click', () => {
      const value = manual.value.trim();
      if (!value) {
        showToast('先填一个模型名');
        return;
      }

      renderModelStrip(strip, [value], value);
    });

    strip.append(emptyState('没有模型列表', '可以手动输入模型名。'), manual, add);
    return;
  }

  models.forEach((model) => {
    const card = selectPill(model, model, selectedModel === model);
    card.dataset.value = model;
    strip.appendChild(card);
  });

  if (!strip.querySelector('.selected')) {
    strip.querySelector('[data-value]')?.classList.add('selected');
  }

  strip.onclick = (event) => {
    const card = event.target.closest('[data-value]');
    if (!card) return;

    strip.querySelectorAll('[data-value]').forEach((node) => node.classList.remove('selected'));
    card.classList.add('selected');
  };
}

function choiceCard(iconName, title, desc, selected = false) {
  const card = el('button', `choice-card ${selected ? 'selected' : ''}`);
  card.type = 'button';

  const icon = el('span', 'choice-icon');
  icon.appendChild(createIcon(iconName, 20));

  const text = el('span', 'choice-text');
  text.append(
    el('span', 'choice-title', title),
    el('span', 'choice-desc', desc)
  );

  card.append(icon, text, selected ? createIcon('check', 17) : createIcon('arrow-right', 17));
  return card;
}

function selectPill(value, title, selected = false) {
  const card = el('button', `select-pill ${selected ? 'selected' : ''}`);
  card.type = 'button';
  card.dataset.value = value || '';
  card.textContent = title || value || '未命名';
  return card;
}

function switchRow(title, desc, checked = false) {
  const row = el('button', 'chat-switch-row');
  row.type = 'button';
  row.dataset.checked = checked ? 'true' : 'false';

  const text = el('span', 'chat-switch-text');
  text.append(
    el('span', 'chat-switch-title', title),
    el('span', 'chat-switch-desc', desc || '')
  );

  const track = el('span', 'chat-switch-track');
  track.appendChild(el('span', 'chat-switch-thumb'));

  row.append(text, track);

  row.addEventListener('click', () => {
    row.dataset.checked = row.dataset.checked === 'true' ? 'false' : 'true';
  });

  return row;
}

function getSwitchValue(row) {
  return row?.dataset?.checked === 'true';
}

function sheetHead(title, subtitle) {
  const head = el('div', 'chat-sheet-head');
  head.append(
    el('div', 'chat-sheet-title', title),
    el('div', 'chat-sheet-subtitle', subtitle || '')
  );
  return head;
}

function sectionTitle(text) {
  return el('div', 'sheet-section-title', text);
}

function formRow(label, control) {
  const row = el('label', 'chat-form-row');
  row.append(el('span', 'chat-form-label', label), control);
  return row;
}

function button(text, variant = 'ghost', iconName = '') {
  const btn = el('button', variant === 'primary' ? 'chat-primary-btn' : 'chat-ghost-btn');
  btn.type = 'button';

  if (iconName) btn.appendChild(createIcon(iconName, 16));
  btn.appendChild(el('span', '', text));

  return btn;
}

function createInput(placeholder = '') {
  const node = document.createElement('input');
  node.placeholder = placeholder;
  node.autocomplete = 'off';
  return node;
}

function createTextarea(placeholder = '') {
  const node = document.createElement('textarea');
  node.placeholder = placeholder;
  node.rows = 5;
  return node;
}

function emptyState(title, desc) {
  const wrap = el('div', 'chat-empty');
  wrap.append(
    el('div', 'chat-empty-title', title),
    el('div', 'chat-empty-desc', desc)
  );
  return wrap;
}

function pickFile(accept = '') {
  return new Promise((resolve) => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = accept;

    fileInput.addEventListener('change', () => {
      resolve(fileInput.files?.[0] || null);
    }, { once: true });

    fileInput.click();
  });
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

// 改了什么：保留第二页仅两个工具，不强行补空位，逻辑不变。
// 会不会影响其他文件：不会。
// 更新记忆里该文件的导出函数：openToolboxSheet(ctx)
// 依赖：../../core/storage.js(generateId,getNow,setDB,deleteDB,getByIndexDB,compressImage)；../../core/ui.js(showToast,showBottomSheet,hideBottomSheet,showConfirm,createIcon)；../../core/mcp.js(getMcpServers)；./thread-actions.js(sendImageMessage,sendStickerMessage,sendTransferMessage)
