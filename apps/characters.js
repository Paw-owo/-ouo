// apps/characters.js
// imports:
//   from '../core/storage.js': getData, setData, generateId, getNow, getAllDB, getDB, setDB, deleteDB, getByIndexDB, compressImage
//   from '../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, showAlert, createIcon

import {
  getData,
  setData,
  generateId,
  getNow,
  getAllDB,
  getDB,
  setDB,
  deleteDB,
  getByIndexDB,
  compressImage
} from '../core/storage.js';

import {
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm,
  showAlert,
  createIcon
} from '../core/ui.js';

const DEFAULT_CHARACTER = {
  id: '',
  name: '',
  avatar: '',
  chatBackground: {
    type: 'none',
    value: ''
  },
  systemPrompt: '',
  quickReplies: [],
  stickerIds: [],
  worldbookIds: [],
  ttsConfig: {
    enabled: false,
    provider: 'openai',
    voice: 'alloy',
    apiKey: '',
    endpoint: '',
    model: 'tts-1'
  },
  apiConfig: {
    useGlobal: true,
    endpointId: '',
    model: ''
  },
  memoryTriggerCount: 100,
  mood: 'neutral',
  createdAt: ''
};

const MOODS = [
  { value: 'happy', label: '开心' },
  { value: 'neutral', label: '平静' },
  { value: 'sad', label: '低落' },
  { value: 'excited', label: '兴奋' }
];

let rootEl = null;
let mountedContainer = null;
let characters = [];
let worldbookEntries = [];
let stickers = [];
let activeCharacterId = '';
let longPressTimer = null;
let injectedStyle = false;

export async function mount(containerEl) {
  mountedContainer = containerEl;
  injectStyle();

  rootEl = document.createElement('section');
  rootEl.className = 'app-screen characters-app';

  mountedContainer.innerHTML = '';
  mountedContainer.appendChild(rootEl);

  await loadData();
  renderList();
}

export function unmount() {
  hideBottomSheet();
  clearLongPress();

  if (rootEl) {
    rootEl.remove();
    rootEl = null;
  }

  if (mountedContainer) {
    mountedContainer.innerHTML = '';
    mountedContainer = null;
  }

  characters = [];
  worldbookEntries = [];
  stickers = [];
  activeCharacterId = '';
}

async function loadData() {
  characters = normalizeCharacterList(await getAllDB('characters'));
  worldbookEntries = normalizeArray(await getAllDB('worldbook'));
  stickers = normalizeArray(await getAllDB('stickers'));
}

function renderList() {
  if (!rootEl) return;

  rootEl.innerHTML = '';

  const nav = el('div', 'nav-bar');
  const backButton = iconButton('back', '返回');
  backButton.addEventListener('click', () => window.closeCurrentApp?.());

  const titleWrap = el('div', 'characters-nav-title');
  titleWrap.append(
    el('div', 'nav-title', '角色'),
    el('div', 'nav-subtitle', characters.length ? `${characters.length} 个角色` : '创建你的第一个 AI 角色')
  );

  const importButton = iconButton('upload', '导入角色');
  importButton.addEventListener('click', openImportSheet);

  nav.append(backButton, titleWrap, importButton);

  const content = el('div', 'content-area');
  const wrap = el('div', 'content-narrow characters-wrap');

  if (!characters.length) {
    wrap.appendChild(renderEmptyState());
  } else {
    const grid = el('div', 'character-grid');

    characters
      .slice()
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
      .forEach((character) => {
        grid.appendChild(createCharacterCard(character));
      });

    wrap.appendChild(grid);
  }

  const addButton = el('button', 'character-add-button');
  addButton.type = 'button';
  addButton.setAttribute('aria-label', '新建角色');
  addButton.appendChild(createIcon('add', 26));
  addButton.addEventListener('click', () => openEditor());

  content.appendChild(wrap);
  rootEl.append(nav, content, addButton);
}

function renderEmptyState() {
  const box = el('div', 'character-empty');
  const mark = el('div', 'character-empty-mark');
  mark.appendChild(createIcon('smile', 32));

  box.append(
    mark,
    el('div', 'character-empty-title', '还没有角色'),
    el('div', 'character-empty-text', '先创建一个角色，写下名字、人设和聊天偏好。之后聊天、记忆和朋友圈都会围绕角色展开。')
  );

  const createButton = button('新建角色', 'primary', 'add');
  createButton.addEventListener('click', () => openEditor());

  box.appendChild(createButton);
  return box;
}

function createCharacterCard(character) {
  const card = el('article', 'character-card');
  card.tabIndex = 0;

  const avatar = el('div', 'character-avatar');
  if (character.avatar) {
    const img = document.createElement('img');
    img.src = character.avatar;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.appendChild(createIcon('smile', 30));
  }

  const info = el('div', 'character-info');
  const title = el('div', 'character-name', character.name || '未命名角色');
  const prompt = el('div', 'character-prompt', getPromptPreview(character));
  const meta = el('div', 'character-meta', `${getMoodLabel(character.mood)} · ${character.memoryTriggerCount || 100} 条触发记忆`);

  info.append(title, prompt, meta);

  const arrow = el('div', 'character-arrow');
  arrow.appendChild(createIcon('arrow-right', 20));

  card.append(avatar, info, arrow);

  card.addEventListener('click', () => openEditor(character.id));
  card.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') openEditor(character.id);
  });

  card.addEventListener('pointerdown', () => {
    clearLongPress();
    longPressTimer = window.setTimeout(() => openCharacterActions(character), 520);
  });

  card.addEventListener('pointerup', clearLongPress);
  card.addEventListener('pointercancel', clearLongPress);
  card.addEventListener('pointerleave', clearLongPress);

  return card;
}

function openCharacterActions(character) {
  clearLongPress();

  const sheet = sheetBase(character.name || '角色操作', '可以导出备份，或删除这个角色。');

  const editButton = button('编辑角色', 'ghost', 'edit');
  editButton.addEventListener('click', () => {
    hideBottomSheet();
    openEditor(character.id);
  });

  const exportButton = button('导出角色', 'ghost', 'download');
  exportButton.addEventListener('click', async () => {
    await exportCharacter(character.id);
    hideBottomSheet();
  });

  const deleteButton = button('删除角色', 'ghost', 'delete');
  deleteButton.addEventListener('click', async () => {
    hideBottomSheet();
    await deleteCharacter(character.id);
  });

  sheet.actions.append(editButton, exportButton, deleteButton);
  showBottomSheet(sheet.el);
}

async function openEditor(characterId = '') {
  activeCharacterId = characterId;
  await loadData();

  const existing = characterId ? characters.find((item) => item.id === characterId) : null;
  const draft = cloneCharacter(existing || createEmptyCharacter());

  const sheet = document.createElement('div');
  sheet.className = 'character-editor';

  const title = el('div', 'sheet-title', existing ? '编辑角色' : '新建角色');
  const desc = el('div', 'sheet-description', '只需要先填名字和人设，其他配置可以以后慢慢补。');

  const core = el('div', 'character-editor-core');
  const avatarInput = fileInput('image/*');
  const avatarButton = el('button', 'editor-avatar');
  avatarButton.type = 'button';

  renderAvatarButton(avatarButton, draft.avatar);
  avatarButton.addEventListener('click', () => avatarInput.click());

  avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;

    try {
      draft.avatar = await compressImage(file, 200, 0.86);
      renderAvatarButton(avatarButton, draft.avatar);
      showToast('头像已选择');
    } catch (_) {
      showToast('头像处理失败');
    } finally {
      avatarInput.value = '';
    }
  });

  const nameInput = input('角色名字', draft.name);
  const promptInput = textarea('写下角色的人设、说话方式、关系背景', draft.systemPrompt);

  core.append(
    customRow('头像', wrapActions(avatarButton, avatarInput)),
    field('名字', nameInput),
    field('人设', promptInput)
  );

  const sections = el('div', 'character-editor-sections');

  sections.append(
    detailsBlock('聊天背景', renderBackgroundEditor(draft)),
    detailsBlock('快捷回复', renderQuickRepliesEditor(draft)),
    detailsBlock('TTS 配置', renderTtsEditor(draft)),
    detailsBlock('API 配置', renderApiEditor(draft)),
    detailsBlock('记忆设置', await renderMemoryEditor(draft)),
    detailsBlock('世界书绑定', renderWorldbookBinder(draft)),
    detailsBlock('表情包绑定', renderStickerBinder(draft)),
    detailsBlock('导入导出', renderImportExportTools(draft))
  );

  const actions = el('div', 'settings-actions sheet-actions');
  const cancelButton = button('取消', 'ghost', 'close');
  const saveButton = button('保存', 'primary', 'check');

  cancelButton.addEventListener('click', hideBottomSheet);

  saveButton.addEventListener('click', async () => {
    draft.name = nameInput.value.trim();
    draft.systemPrompt = promptInput.value.trim();

    if (!draft.name) {
      showToast('请填写角色名字');
      return;
    }

    await saveCharacter(draft);
    hideBottomSheet();
  });

  actions.append(cancelButton, saveButton);
  sheet.append(title, desc, core, sections, actions);

  showBottomSheet(sheet);
}

function renderAvatarButton(buttonEl, avatar) {
  buttonEl.innerHTML = '';

  if (avatar) {
    const img = document.createElement('img');
    img.src = avatar;
    img.alt = '';
    buttonEl.appendChild(img);
    return;
  }

  buttonEl.appendChild(createIcon('camera', 26));
}

function renderBackgroundEditor(draft) {
  const box = el('div', 'character-editor-panel');

  const mode = createSegmented(
    [
      { value: 'none', label: '无' },
      { value: 'color', label: '纯色' },
      { value: 'image', label: '图片' }
    ],
    draft.chatBackground.type || 'none',
    (value) => {
      draft.chatBackground.type = value;
      if (value === 'none') draft.chatBackground.value = '';
      renderPanelAgain(box, () => renderBackgroundEditor(draft));
    }
  );

  box.appendChild(customRow('类型', mode));

  if (draft.chatBackground.type === 'color') {
    const color = input('', draft.chatBackground.value || '#FAF8F5', 'color');
    color.addEventListener('input', () => {
      draft.chatBackground.value = color.value;
    });
    box.appendChild(field('背景颜色', color));
  }

  if (draft.chatBackground.type === 'image') {
    const preview = el('div', 'background-preview', draft.chatBackground.value ? '' : '暂无背景');
    if (draft.chatBackground.value) {
      preview.style.backgroundImage = `url("${draft.chatBackground.value}")`;
    }

    const imageInput = fileInput('image/*');
    const uploadButton = button('上传聊天背景', 'ghost', 'upload');
    uploadButton.addEventListener('click', () => imageInput.click());

    imageInput.addEventListener('change', async () => {
      const file = imageInput.files?.[0];
      if (!file) return;

      try {
        draft.chatBackground.value = await compressImage(file, 1200, 0.86);
        showToast('背景已选择');
        renderPanelAgain(box, () => renderBackgroundEditor(draft));
      } catch (_) {
        showToast('背景处理失败');
      } finally {
        imageInput.value = '';
      }
    });

    const clearButton = button('清除图片', 'ghost', 'clear');
    clearButton.addEventListener('click', () => {
      draft.chatBackground.value = '';
      renderPanelAgain(box, () => renderBackgroundEditor(draft));
    });

    box.append(preview, wrapActions(uploadButton, clearButton, imageInput));
  }

  return box;
}

function renderQuickRepliesEditor(draft) {
  const box = el('div', 'character-editor-panel');
  const list = el('div', 'quick-reply-list');

  function refresh() {
    list.innerHTML = '';

    draft.quickReplies.slice(0, 8).forEach((reply, index) => {
      const row = el('div', 'quick-reply-row');
      const replyInput = input('快捷回复', reply);
      const del = iconButton('delete', '删除');

      replyInput.addEventListener('change', () => {
        draft.quickReplies[index] = replyInput.value.trim();
      });

      del.addEventListener('click', () => {
        draft.quickReplies.splice(index, 1);
        refresh();
      });

      row.append(replyInput, del);
      list.appendChild(row);
    });
  }

  const addButton = button('添加快捷回复', 'ghost', 'add');
  addButton.addEventListener('click', () => {
    if (draft.quickReplies.length >= 8) {
      showToast('最多 8 条快捷回复');
      return;
    }

    draft.quickReplies.push('');
    refresh();
  });

  refresh();
  box.append(list, addButton);
  return box;
}

function renderTtsEditor(draft) {
  const box = el('div', 'character-editor-panel');

  const enabled = switchButton(Boolean(draft.ttsConfig.enabled), (active) => {
    draft.ttsConfig.enabled = active;
  });

  const provider = createSegmented(
    [
      { value: 'openai', label: 'OpenAI' },
      { value: 'custom', label: '自定义' }
    ],
    draft.ttsConfig.provider || 'openai',
    (value) => {
      draft.ttsConfig.provider = value;
    }
  );

  const voice = input('音色，如 alloy', draft.ttsConfig.voice || 'alloy');
  const endpoint = input('TTS Endpoint，不填则用全局', draft.ttsConfig.endpoint || '');
  const key = input('TTS API Key，不填则用全局', draft.ttsConfig.apiKey || '');
  const model = input('TTS 模型，不填默认 tts-1', draft.ttsConfig.model || 'tts-1');

  voice.addEventListener('change', () => draft.ttsConfig.voice = voice.value.trim() || 'alloy');
  endpoint.addEventListener('change', () => draft.ttsConfig.endpoint = endpoint.value.trim());
  key.addEventListener('change', () => draft.ttsConfig.apiKey = key.value.trim());
  model.addEventListener('change', () => draft.ttsConfig.model = model.value.trim() || 'tts-1');

  box.append(
    customRow('启用', enabled),
    customRow('服务商', provider),
    field('Voice', voice),
    field('Endpoint', endpoint),
    field('API Key', key),
    field('模型', model)
  );

  return box;
}

function renderApiEditor(draft) {
  const box = el('div', 'character-editor-panel');
  const settings = getSettings();
  const endpoints = Array.isArray(settings.apiEndpoints) ? settings.apiEndpoints : [];

  const useGlobal = switchButton(draft.apiConfig.useGlobal !== false, (active) => {
    draft.apiConfig.useGlobal = active;
    renderPanelAgain(box, () => renderApiEditor(draft));
  });

  box.appendChild(customRow('使用全局配置', useGlobal));

  if (draft.apiConfig.useGlobal === false) {
    const endpointSelect = document.createElement('select');
    endpointSelect.className = 'input-card';

    const emptyOption = document.createElement('option');
    emptyOption.value = '';
    emptyOption.textContent = endpoints.length ? '选择 API 端点' : '设置里还没有端点';
    endpointSelect.appendChild(emptyOption);

    endpoints.forEach((endpoint) => {
      const option = document.createElement('option');
      option.value = endpoint.id;
      option.textContent = endpoint.name || endpoint.endpoint || '未命名端点';
      option.selected = draft.apiConfig.endpointId === endpoint.id;
      endpointSelect.appendChild(option);
    });

    endpointSelect.addEventListener('change', () => {
      draft.apiConfig.endpointId = endpointSelect.value;
      const current = endpoints.find((item) => item.id === endpointSelect.value);
      if (current && !draft.apiConfig.model) {
        draft.apiConfig.model = current.model || '';
      }
    });

    const modelInput = input('模型名，可覆盖端点默认模型', draft.apiConfig.model || '');
    modelInput.addEventListener('change', () => {
      draft.apiConfig.model = modelInput.value.trim();
    });

    box.append(
      field('API 端点', endpointSelect),
      field('模型', modelInput)
    );
  }

  return box;
}

async function renderMemoryEditor(draft) {
  const box = el('div', 'character-editor-panel');

  const trigger = input('默认 100', draft.memoryTriggerCount || 100, 'number');
  trigger.min = '10';
  trigger.max = '1000';

  trigger.addEventListener('change', () => {
    draft.memoryTriggerCount = Math.max(10, Number(trigger.value) || 100);
  });

  const moodSelect = document.createElement('select');
  moodSelect.className = 'input-card';

  MOODS.forEach((mood) => {
    const option = document.createElement('option');
    option.value = mood.value;
    option.textContent = mood.label;
    option.selected = mood.value === draft.mood;
    moodSelect.appendChild(option);
  });

  moodSelect.addEventListener('change', () => {
    draft.mood = moodSelect.value;
  });

  box.append(
    field('记忆触发条数', trigger),
    field('当前心情', moodSelect)
  );

  if (draft.id) {
    const memoryBox = el('div', 'memory-manager');
    await renderMemoryList(memoryBox, draft.id);
    box.appendChild(memoryBox);
  } else {
    box.appendChild(createSoftNote('保存角色后，可以在这里管理手动记忆。'));
  }

  return box;
}

async function renderMemoryList(container, characterId) {
  container.innerHTML = '';

  const memories = (await getByIndexDB('memories', 'characterId', characterId))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const addWrap = el('div', 'memory-add');
  const addInput = textarea('添加一条手动记忆', '');
  const addButton = button('添加记忆', 'ghost', 'add');

  addButton.addEventListener('click', async () => {
    const content = addInput.value.trim();

    if (!content) {
      showToast('请填写记忆内容');
      return;
    }

    await setDB('memories', generateId(), {
      id: generateId(),
      characterId,
      content,
      source: 'manual',
      createdAt: getNow()
    });

    addInput.value = '';
    showToast('记忆已添加');
    await renderMemoryList(container, characterId);
  });

  addWrap.append(addInput, addButton);
  container.appendChild(addWrap);

  if (!memories.length) {
    container.appendChild(createSoftNote('暂无记忆。聊天后会自动总结，也可以手动添加。'));
    return;
  }

  const list = el('div', 'memory-list');

  memories.forEach((memory) => {
    const item = el('div', 'memory-item');
    const main = el('div', 'memory-main');

    main.append(
      el('div', 'memory-content', memory.content || ''),
      el('div', 'memory-meta', `${getMemorySourceLabel(memory.source)} · ${formatTime(memory.createdAt)}`)
    );

    const del = iconButton('delete', '删除记忆');
    del.addEventListener('click', async () => {
      const ok = await showConfirm('确定删除这条记忆吗？');
      if (!ok) return;

      await deleteDB('memories', memory.id);
      showToast('记忆已删除');
      await renderMemoryList(container, characterId);
    });

    item.append(main, del);
    list.appendChild(item);
  });

  container.appendChild(list);
}

function renderWorldbookBinder(draft) {
  const box = el('div', 'character-editor-panel');

  if (!worldbookEntries.length) {
    box.appendChild(createSoftNote('还没有世界书条目。之后在世界书应用里创建后，可回到这里绑定。'));
    return box;
  }

  const list = el('div', 'binder-list');

  worldbookEntries
    .filter((entry) => entry && entry.enabled !== false)
    .forEach((entry) => {
      const row = checkboxRow(
        `${entry.type || 'A'} · ${entry.title || '未命名条目'}`,
        draft.worldbookIds.includes(entry.id),
        (checked) => {
          draft.worldbookIds = toggleId(draft.worldbookIds, entry.id, checked);
        }
      );

      list.appendChild(row);
    });

  box.appendChild(list);
  return box;
}

function renderStickerBinder(draft) {
  const box = el('div', 'character-editor-panel');

  if (!stickers.length) {
    box.appendChild(createSoftNote('还没有表情包。之后在聊天或设置里添加后，可回到这里绑定。'));
    return box;
  }

  const list = el('div', 'sticker-bind-list');

  stickers.forEach((sticker) => {
    const row = checkboxRow(
      sticker.description || sticker.tags?.join('、') || '未描述表情',
      draft.stickerIds.includes(sticker.id),
      (checked) => {
        draft.stickerIds = toggleId(draft.stickerIds, sticker.id, checked);
      }
    );

    if (sticker.image) {
      const img = document.createElement('img');
      img.src = sticker.image;
      img.alt = '';
      img.className = 'sticker-thumb';
      row.prepend(img);
    }

    list.appendChild(row);
  });

  box.appendChild(list);
  return box;
}

function renderImportExportTools(draft) {
  const box = el('div', 'character-editor-panel');

  const exportButton = button('导出当前角色', 'ghost', 'download');
  exportButton.disabled = !draft.id;
  exportButton.addEventListener('click', () => exportCharacter(draft.id));

  const importButton = button('从 JSON 覆盖当前表单', 'ghost', 'upload');
  const importInput = fileInput('application/json');

  importButton.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      const imported = normalizeImportedCharacter(data, draft.id || generateId());

      Object.assign(draft, {
        ...draft,
        ...imported,
        id: draft.id || imported.id || generateId(),
        createdAt: draft.createdAt || imported.createdAt || getNow()
      });

      hideBottomSheet();
      showToast('已读取导入内容，请检查后保存');
      window.setTimeout(() => openEditorWithDraft(draft), 160);
    } catch (_) {
      showToast('导入失败，请检查 JSON');
    } finally {
      importInput.value = '';
    }
  });

  box.append(
    createSoftNote('导入覆盖的是当前编辑表单，确认无误后还需要点击底部保存。'),
    wrapActions(exportButton, importButton, importInput)
  );

  return box;
}

function openEditorWithDraft(draft) {
  const savedId = draft.id;
  const existingIndex = characters.findIndex((item) => item.id === savedId);

  if (existingIndex >= 0) {
    characters[existingIndex] = draft;
  } else {
    characters.push(draft);
  }

  openEditor(savedId);
}

async function openImportSheet() {
  const sheet = sheetBase('导入角色', '支持本项目导出的角色 JSON，也支持基础 SillyTavern 卡片字段。');

  const inputEl = fileInput('application/json');
  const pickButton = button('选择 JSON 文件', 'primary', 'upload');

  pickButton.addEventListener('click', () => inputEl.click());

  inputEl.addEventListener('change', async () => {
    const file = inputEl.files?.[0];
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      const character = normalizeImportedCharacter(data, generateId());

      await setDB('characters', character.id, character);
      hideBottomSheet();
      await loadData();
      renderList();
      showToast('角色已导入');
    } catch (_) {
      showToast('导入失败，请检查文件');
    } finally {
      inputEl.value = '';
    }
  });

  sheet.body.append(
    createSoftNote('如果导入的是 SillyTavern 格式，会自动把 name、description、personality、scenario、first_mes 合并成人设。'),
    inputEl
  );
  sheet.actions.appendChild(pickButton);

  showBottomSheet(sheet.el);
}

async function saveCharacter(character) {
  const normalized = normalizeCharacter(character);

  await setDB('characters', normalized.id, normalized);
  await loadData();
  renderList();

  window.AppEvents?.emit?.('desktop:refresh');
  showToast('角色已保存');
}

async function deleteCharacter(characterId) {
  const character = await getDB('characters', characterId);
  if (!character) return;

  const ok = await showConfirm(`确定删除「${character.name || '这个角色'}」吗？聊天记录不会在这里自动删除。`);
  if (!ok) return;

  await deleteDB('characters', characterId);
  await loadData();
  renderList();

  window.AppEvents?.emit?.('desktop:refresh');
  showToast('角色已删除');
}

async function exportCharacter(characterId) {
  const character = await getDB('characters', characterId);
  if (!character) {
    showToast('角色不存在');
    return;
  }

  const memories = await getByIndexDB('memories', 'characterId', characterId);

  downloadJson(`${character.name || 'character'}.json`, {
    type: 'ai-phone-character',
    exportedAt: getNow(),
    character,
    memories
  });

  showToast('角色已导出');
}

function normalizeImportedCharacter(data, fallbackId) {
  const source = data?.character && typeof data.character === 'object' ? data.character : data;

  if (!source || typeof source !== 'object') {
    throw new Error('invalid character');
  }

  const isSillyTavern = source.name && (
    source.description ||
    source.personality ||
    source.scenario ||
    source.first_mes ||
    source.mes_example
  );

  if (isSillyTavern && !source.systemPrompt) {
    const promptParts = [
      source.description ? `[角色描述]\n${source.description}` : '',
      source.personality ? `[性格]\n${source.personality}` : '',
      source.scenario ? `[场景]\n${source.scenario}` : '',
      source.first_mes ? `[开场白]\n${source.first_mes}` : '',
      source.mes_example ? `[示例对话]\n${source.mes_example}` : ''
    ].filter(Boolean);

    return normalizeCharacter({
      ...DEFAULT_CHARACTER,
      id: fallbackId,
      name: source.name || '导入角色',
      avatar: source.avatar || source.avatarBase64 || '',
      systemPrompt: promptParts.join('\n\n'),
      createdAt: getNow()
    });
  }

  return normalizeCharacter({
    ...source,
    id: source.id || fallbackId,
    createdAt: source.createdAt || getNow()
  });
}

function createEmptyCharacter() {
  return normalizeCharacter({
    ...DEFAULT_CHARACTER,
    id: generateId(),
    createdAt: getNow()
  });
}

function normalizeCharacter(character) {
  const raw = character && typeof character === 'object' ? character : {};

  return {
    id: raw.id || generateId(),
    name: String(raw.name || '').trim(),
    avatar: typeof raw.avatar === 'string' ? raw.avatar : '',
    chatBackground: {
      type: ['none', 'color', 'image'].includes(raw.chatBackground?.type) ? raw.chatBackground.type : 'none',
      value: typeof raw.chatBackground?.value === 'string' ? raw.chatBackground.value : ''
    },
    systemPrompt: typeof raw.systemPrompt === 'string' ? raw.systemPrompt : '',
    quickReplies: normalizeArray(raw.quickReplies).map(String).map((item) => item.trim()).filter(Boolean).slice(0, 8),
    stickerIds: normalizeArray(raw.stickerIds).map(String),
    worldbookIds: normalizeArray(raw.worldbookIds).map(String),
    ttsConfig: {
      enabled: Boolean(raw.ttsConfig?.enabled),
      provider: raw.ttsConfig?.provider || 'openai',
      voice: raw.ttsConfig?.voice || 'alloy',
      apiKey: raw.ttsConfig?.apiKey || '',
      endpoint: raw.ttsConfig?.endpoint || '',
      model: raw.ttsConfig?.model || 'tts-1'
    },
    apiConfig: {
      useGlobal: raw.apiConfig?.useGlobal !== false,
      endpointId: raw.apiConfig?.endpointId || '',
      model: raw.apiConfig?.model || ''
    },
    memoryTriggerCount: Math.max(10, Number(raw.memoryTriggerCount) || 100),
    mood: ['happy', 'neutral', 'sad', 'excited'].includes(raw.mood) ? raw.mood : 'neutral',
    createdAt: raw.createdAt || getNow()
  };
}

function normalizeCharacterList(list) {
  return normalizeArray(list).map(normalizeCharacter);
}

function getSettings() {
  const saved = getData('app_settings') || {};

  return {
    defaultApiEndpointId: saved.defaultApiEndpointId || '',
    defaultModel: saved.defaultModel || '',
    apiEndpoints: Array.isArray(saved.apiEndpoints) ? saved.apiEndpoints : []
  };
}

function getPromptPreview(character) {
  const text = String(character.systemPrompt || '').trim();
  if (!text) return '还没有填写人设';
  return text.length > 58 ? `${text.slice(0, 58)}…` : text;
}

function getMoodLabel(value) {
  return MOODS.find((item) => item.value === value)?.label || '平静';
}

function getMemorySourceLabel(value) {
  if (value === 'auto') return '自动';
  if (value === 'summary') return '总结';
  return '手动';
}

function toggleId(list, id, checked) {
  const next = new Set(normalizeArray(list).map(String));

  if (checked) {
    next.add(id);
  } else {
    next.delete(id);
  }

  return [...next];
}

function cloneCharacter(character) {
  return JSON.parse(JSON.stringify(normalizeCharacter(character)));
}

function normalizeArray(value) {
  return Array.isArray(value) ? value : [];
}

function clearLongPress() {
  if (longPressTimer) {
    window.clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function sheetBase(titleText, descText = '') {
  const box = el('div');
  box.appendChild(el('div', 'sheet-title', titleText));

  if (descText) {
    box.appendChild(el('div', 'sheet-description', descText));
  }

  const body = el('div', 'settings-sheet-body');
  const actions = el('div', 'settings-actions sheet-actions');

  box.append(body, actions);

  return { el: box, body, actions };
}

function detailsBlock(title, contentEl) {
  const details = document.createElement('details');
  details.className = 'character-details';

  const summary = document.createElement('summary');
  summary.textContent = title;

  details.append(summary, contentEl);
  return details;
}

function renderPanelAgain(container, factory) {
  const next = factory();
  container.replaceWith(next);
}

function field(labelText, control) {
  const wrap = el('label', 'settings-field');
  wrap.append(el('span', 'field-label', labelText), control);
  return wrap;
}

function customRow(labelText, control) {
  const row = el('div', 'form-row');
  const label = el('div', 'form-label', labelText);
  const box = el('div', 'form-control');

  box.appendChild(control);
  row.append(label, box);

  return row;
}

function input(placeholder, value = '', type = 'text') {
  const item = document.createElement('input');
  item.className = 'input-card';
  item.type = type;
  item.placeholder = placeholder || '';
  item.value = value ?? '';
  return item;
}

function textarea(placeholder, value = '') {
  const item = document.createElement('textarea');
  item.className = 'textarea-card';
  item.placeholder = placeholder || '';
  item.value = value ?? '';
  return item;
}

function fileInput(accept) {
  const item = document.createElement('input');
  item.type = 'file';
  item.accept = accept;
  item.className = 'hidden';
  return item;
}

function button(text, variant = 'ghost', iconName = '') {
  const item = el('button', variant === 'primary' ? 'btn-primary' : 'btn-ghost');
  item.type = 'button';

  if (iconName) item.appendChild(createIcon(iconName, 18));

  item.appendChild(el('span', '', text));
  return item;
}

function iconButton(iconName, label) {
  const item = el('button', 'icon-button');
  item.type = 'button';
  item.setAttribute('aria-label', label);
  item.appendChild(createIcon(iconName, 22));
  return item;
}

function switchButton(active, onChange) {
  const item = el('button', 'switch');
  item.type = 'button';
  item.classList.toggle('active', Boolean(active));
  item.setAttribute('aria-label', '开关');

  item.addEventListener('click', () => {
    item.classList.toggle('active');
    onChange?.(item.classList.contains('active'));
  });

  return item;
}

function createSegmented(options, value, onChange) {
  const wrap = el('div', 'segmented');

  options.forEach((option) => {
    const item = el('button', '', option.label);
    item.type = 'button';
    item.classList.toggle('active', option.value === value);
    item.addEventListener('click', () => onChange(option.value));
    wrap.appendChild(item);
  });

  return wrap;
}

function checkboxRow(label, checked, onChange) {
  const row = el('button', 'checkbox-row');
  row.type = 'button';
  row.classList.toggle('active', checked);

  const text = el('span', '', label);
  const mark = el('span', 'checkbox-mark');

  if (checked) mark.appendChild(createIcon('check', 16));

  row.append(text, mark);

  row.addEventListener('click', () => {
    const next = !row.classList.contains('active');
    row.classList.toggle('active', next);
    mark.innerHTML = '';
    if (next) mark.appendChild(createIcon('check', 16));
    onChange?.(next);
  });

  return row;
}

function wrapActions(...items) {
  const wrap = el('div', 'settings-actions');
  items.filter(Boolean).forEach((item) => wrap.appendChild(item));
  return wrap;
}

function createSoftNote(text) {
  return el('div', 'soft-note', text);
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

function formatTime(value) {
  if (!value) return '未知时间';

  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(value));
  } catch (_) {
    return '未知时间';
  }
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);

  if (className) {
    node.className = className;
  }

  if (text !== undefined && text !== null && text !== '') {
    node.textContent = String(text);
  }

  return node;
}

function injectStyle() {
  if (injectedStyle || document.getElementById('characters-style')) return;

  injectedStyle = true;

  const style = document.createElement('style');
  style.id = 'characters-style';
  style.textContent = `
    .characters-app {
      color: var(--text-primary);
    }

    .characters-nav-title {
      flex: 1;
      min-width: 0;
    }

    .characters-wrap {
      padding-bottom: calc(92px + env(safe-area-inset-bottom));
    }

    .character-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--spacing-md);
    }

    .character-card {
      min-height: 108px;
      display: grid;
      grid-template-columns: 68px minmax(0, 1fr) 28px;
      align-items: center;
      gap: var(--spacing-md);
      padding: var(--spacing-md);
      border-radius: 28px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
    }

    .character-card:active {
      transform: scale(var(--press-scale));
    }

    .character-avatar,
    .editor-avatar {
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: var(--surface-muted);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .character-avatar {
      width: 68px;
      height: 68px;
      border-radius: 26px;
    }

    .character-avatar img,
    .editor-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .character-info {
      min-width: 0;
    }

    .character-name {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .character-prompt {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.55;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
    }

    .character-meta {
      margin-top: 6px;
      color: var(--text-hint);
      font-size: 12px;
      line-height: 1.35;
    }

    .character-arrow {
      color: var(--text-secondary);
    }

    .character-add-button {
      position: fixed;
      right: 22px;
      bottom: calc(26px + env(safe-area-inset-bottom));
      z-index: 110;
      width: 58px;
      height: 58px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 22px;
      background: var(--accent);
      color: var(--bubble-user-text);
      box-shadow: var(--shadow-lg);
      transition: var(--motion);
    }

    .character-add-button:active {
      transform: scale(var(--press-scale));
    }

    .character-empty {
      min-height: calc(100vh - 220px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--spacing-md);
      text-align: center;
    }

    .character-empty-mark {
      width: 72px;
      height: 72px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 28px;
      background: var(--accent-light);
      color: var(--accent-dark);
      box-shadow: var(--shadow-sm);
    }

    .character-empty-title {
      color: var(--text-primary);
      font-size: 22px;
      font-weight: 600;
      line-height: 1.35;
    }

    .character-empty-text {
      max-width: 320px;
      color: var(--text-secondary);
      font-size: var(--font-size-base);
      line-height: 1.7;
    }

    .character-editor {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .character-editor-core,
    .character-editor-panel {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .editor-avatar {
      width: 78px;
      height: 78px;
      margin-left: auto;
      border-radius: 50%;
    }

    .character-editor-sections {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .character-details {
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .character-details summary {
      cursor: pointer;
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
      list-style: none;
    }

    .character-details summary::-webkit-details-marker {
      display: none;
    }

    .character-details > *:not(summary) {
      margin-top: var(--spacing-md);
    }

    .background-preview {
      min-height: 120px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-lg);
      background-color: var(--surface-muted);
      background-size: cover;
      background-position: center;
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
    }

    .quick-reply-list,
    .memory-list,
    .binder-list,
    .sticker-bind-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .quick-reply-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 40px;
      gap: var(--spacing-sm);
      align-items: center;
    }

    .memory-add {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .memory-item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 40px;
      gap: var(--spacing-sm);
      align-items: center;
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
    }

    .memory-main {
      min-width: 0;
    }

    .memory-content {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      line-height: 1.6;
      word-break: break-word;
    }

    .memory-meta {
      margin-top: 4px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.4;
    }

    .checkbox-row {
      min-height: 48px;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 28px;
      align-items: center;
      gap: var(--spacing-sm);
      width: 100%;
      padding: 10px 12px;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-secondary);
      text-align: left;
    }

    .checkbox-row.active {
      color: var(--text-primary);
      background: var(--accent-light);
    }

    .checkbox-mark {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 10px;
      color: var(--accent-dark);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .sticker-bind-list .checkbox-row {
      grid-template-columns: 44px minmax(0, 1fr) 28px;
    }

    .sticker-thumb {
      width: 44px;
      height: 44px;
      object-fit: cover;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
    }

    .settings-sheet-body {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .settings-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }

    .sheet-actions {
      justify-content: flex-end;
      margin-top: var(--spacing-sm);
    }

    .soft-note {
      padding: 12px 14px;
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    @media (min-width: 680px) {
      .character-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../core/storage.js 的 getData/setData/generateId/getNow/getAllDB/getDB/setDB/deleteDB/getByIndexDB/compressImage；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/showAlert/createIcon
