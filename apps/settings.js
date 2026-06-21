// apps/settings.js
// imports:
//   from '../core/storage.js': getData, setData, removeData, generateId, getNow, compressImage, getStorageUsage, getDB, setDB, getAllDB, deleteDB, clearStoreDB
//   from '../core/theme.js': applyTheme, exportTheme, importTheme, setPreset, saveTheme
//   from '../core/ui.js': showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon
//   from '../core/api.js': fetchModels
//   from '../core/mcp.js': resetSession
//   from '../core/tts.js': playTTS

import {
  getData,
  setData,
  removeData,
  generateId,
  getNow,
  compressImage,
  getStorageUsage,
  getDB,
  setDB,
  getAllDB,
  deleteDB,
  clearStoreDB
} from '../core/storage.js';

import {
  applyTheme,
  exportTheme,
  importTheme,
  setPreset,
  saveTheme
} from '../core/theme.js';

import {
  showToast,
  showBottomSheet,
  hideBottomSheet,
  showConfirm,
  createIcon
} from '../core/ui.js';

import { fetchModels } from '../core/api.js';
import { resetSession } from '../core/mcp.js';
import { playTTS } from '../core/tts.js';

const SETTINGS_KEY = 'app_settings';
const ICONS_KEY = 'app_icons';
const HIDDEN_ICONS_KEY = 'app_hidden_icons';
const WALLPAPER_KEY = 'app_wallpaper';

const DB_STORES = [
  'characters',
  'messages',
  'moments',
  'memories',
  'stickers',
  'worldbook',
  'inventory',
  'pet',
  'groups',
  'group_messages',
  'blobs'
];

const LOCAL_KEYS = [
  'app_settings',
  'app_theme',
  'app_icons',
  'app_icon_positions',
  'app_user',
  'chat_unread_counts',
  'weather_cache',
  'app_install_tip_closed',
  'app_onboarding_done',
  'app_first_open_seed',
  'app_hidden_icons'
];

const DESKTOP_APPS = [
  { id: 'chat', name: '聊天', icon: 'heart' },
  { id: 'moments', name: '朋友圈', icon: 'camera' },
  { id: 'settings', name: '设置', icon: 'settings' },
  { id: 'gallery', name: '相册', icon: 'image' },
  { id: 'characters', name: '角色', icon: 'smile' },
  { id: 'worldbook', name: '世界书', icon: 'memory' },
  { id: 'wallet', name: '钱包', icon: 'transfer' },
  { id: 'shop', name: '商店', icon: 'star' },
  { id: 'memo', name: '备忘录', icon: 'edit' },
  { id: 'anniversary', name: '纪念日', icon: 'check' },
  { id: 'games', name: '游戏', icon: 'play' }
];

const DEFAULT_SETTINGS = {
  defaultApiEndpointId: '',
  defaultModel: '',
  ttsGlobal: {
    provider: 'openai',
    apiKey: '',
    endpoint: '',
    voice: 'alloy'
  },
  mcpServers: [],
  bubbleMode: 'bubble',
  fontSize: 15,
  user: {
    name: '',
    avatar: ''
  },
  widgets: {
    time: true,
    weather: true,
    anniversary: true
  },
  apiEndpoints: []
};

let rootEl = null;
let mountedContainer = null;
let activeSection = 'api';
let currentTtsTest = null;
let workingTask = '';

export async function mount(containerEl) {
  mountedContainer = containerEl;
  injectSettingsStyle();

  rootEl = document.createElement('section');
  rootEl.className = 'app-screen settings-app';

  containerEl.innerHTML = '';
  containerEl.appendChild(rootEl);

  render();
}

export function unmount() {
  if (currentTtsTest) {
    currentTtsTest.stop();
    currentTtsTest = null;
  }

  hideBottomSheet();

  if (rootEl) {
    rootEl.remove();
    rootEl = null;
  }

  if (mountedContainer) {
    mountedContainer.innerHTML = '';
    mountedContainer = null;
  }

  workingTask = '';
}

function render() {
  if (!rootEl) return;

  const settings = getSettings();

  rootEl.innerHTML = '';

  const nav = document.createElement('div');
  nav.className = 'nav-bar';

  const backButton = iconButton('back', '返回');
  backButton.addEventListener('click', () => {
    window.closeCurrentApp?.();
  });

  const titleWrap = document.createElement('div');
  titleWrap.className = 'settings-nav-title';

  const title = document.createElement('div');
  title.className = 'nav-title';
  title.textContent = '设置';

  const subtitle = document.createElement('div');
  subtitle.className = 'nav-subtitle';
  subtitle.textContent = '所有配置只保存在当前浏览器';

  titleWrap.append(title, subtitle);
  nav.append(backButton, titleWrap);

  const content = document.createElement('div');
  content.className = 'content-area';

  const wrap = document.createElement('div');
  wrap.className = 'content-narrow settings-stack';

  wrap.append(
    createSection('api', 'API 配置', getApiMeta(settings), renderApiSection(settings)),
    createSection('tts', 'TTS 配置', getTtsMeta(settings), renderTtsSection(settings)),
    createSection('mcp', 'MCP 配置', getMcpMeta(settings), renderMcpSection(settings)),
    createSection('theme', '主题', '预设、导入导出与气泡外观', renderThemeSection()),
    createSection('personal', '个性化', '桌面、消息、图标和我的资料', renderPersonalSection(settings)),
    createSection('data', '数据管理', '导出、导入、清理与存储用量', renderDataSection())
  );

  content.appendChild(wrap);
  rootEl.append(nav, content);
}

function createSection(id, titleText, metaText, bodyEl) {
  const card = document.createElement('section');
  card.className = 'section-card';

  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'section-header';

  const textWrap = document.createElement('div');
  textWrap.className = 'settings-section-text';

  const title = document.createElement('div');
  title.className = 'section-title';
  title.textContent = titleText;

  const meta = document.createElement('div');
  meta.className = 'section-meta';
  meta.textContent = metaText;

  const arrow = document.createElement('span');
  arrow.className = 'settings-arrow';
  arrow.appendChild(createIcon(activeSection === id ? 'arrow-down' : 'arrow-right', 20));

  textWrap.append(title, meta);
  header.append(textWrap, arrow);

  const content = document.createElement('div');
  content.className = 'section-content';
  content.classList.toggle('open', activeSection === id);

  const body = document.createElement('div');
  body.className = 'section-body';
  body.appendChild(bodyEl);

  content.appendChild(body);

  header.addEventListener('click', () => {
    activeSection = activeSection === id ? '' : id;
    render();
  });

  card.append(header, content);
  return card;
}

function renderApiSection(settings) {
  const box = document.createElement('div');
  box.className = 'settings-panel';

  const helper = createSoftNote('API 需要兼容 OpenAI 格式，地址通常类似 https://api.openai.com。');

  const actions = document.createElement('div');
  actions.className = 'settings-actions';

  const addButton = button('新增端点', 'primary', 'add');
  addButton.addEventListener('click', () => openApiSheet());

  actions.appendChild(addButton);

  const list = document.createElement('div');
  list.className = 'settings-list';

  if (!settings.apiEndpoints.length) {
    list.appendChild(emptyState('还没有 API 端点', '先新增一个接口，聊天和记忆总结才可以工作。'));
  } else {
    settings.apiEndpoints.forEach((endpoint) => {
      list.appendChild(createApiEndpointCard(endpoint, settings));
    });
  }

  box.append(helper, actions, list);
  return box;
}

function createApiEndpointCard(endpoint, settings) {
  const card = document.createElement('article');
  card.className = 'settings-item';

  const top = document.createElement('div');
  top.className = 'settings-item-top';

  const left = document.createElement('div');
  left.className = 'settings-item-main';

  const name = document.createElement('div');
  name.className = 'settings-item-title';
  name.textContent = endpoint.name || '未命名端点';

  const meta = document.createElement('div');
  meta.className = 'settings-item-meta';
  meta.textContent = endpoint.endpoint || '未填写地址';

  left.append(name, meta);

  const mark = document.createElement('button');
  mark.type = 'button';
  mark.className = settings.defaultApiEndpointId === endpoint.id ? 'btn-primary subtle' : 'btn-ghost';
  mark.textContent = settings.defaultApiEndpointId === endpoint.id ? '默认' : '设为默认';
  mark.addEventListener('click', () => {
    const next = getSettings();
    next.defaultApiEndpointId = endpoint.id;
    next.defaultModel = endpoint.model || next.defaultModel || '';
    saveSettings(next);
    showToast('已设为默认端点');
    render();
  });

  top.append(left, mark);

  const keyRow = createSecretRow(endpoint.apiKey || '未填写 Key');

  const model = document.createElement('div');
  model.className = 'settings-item-meta';
  model.textContent = `模型：${endpoint.model || '未选择'}`;

  const controls = document.createElement('div');
  controls.className = 'settings-controls';

  const modelsButton = button('拉取模型', 'ghost', 'refresh');
  modelsButton.addEventListener('click', async () => {
    await withWorking(`models:${endpoint.id}`, modelsButton, async () => {
      showToast('正在拉取模型');
      const models = await fetchModels(endpoint.id);

      if (!models.length) {
        showToast('没有拉取到模型');
        return;
      }

      const next = getSettings();
      const item = next.apiEndpoints.find((one) => one.id === endpoint.id);

      if (item) {
        item.modelList = models;
        item.model = item.model || models[0];

        if (next.defaultApiEndpointId === endpoint.id) {
          next.defaultModel = item.model;
        }

        saveSettings(next);
      }

      showToast(`已拉取 ${models.length} 个模型`);
      render();
    });
  });

  const testButton = button('测试连接', 'ghost', 'check');
  testButton.addEventListener('click', async () => {
    await withWorking(`test:${endpoint.id}`, testButton, async () => {
      showToast('正在测试连接');
      const models = await fetchModels(endpoint.id);
      showToast(models.length ? '连接正常' : '连接失败或无模型');
    });
  });

  const editButton = iconButton('edit', '编辑');
  editButton.addEventListener('click', () => openApiSheet(endpoint));

  const deleteButton = iconButton('delete', '删除');
  deleteButton.addEventListener('click', async () => {
    const ok = await showConfirm('确定删除这个 API 端点吗？');
    if (!ok) return;

    const next = getSettings();
    next.apiEndpoints = next.apiEndpoints.filter((item) => item.id !== endpoint.id);

    if (next.defaultApiEndpointId === endpoint.id) {
      next.defaultApiEndpointId = next.apiEndpoints[0]?.id || '';
      next.defaultModel = next.apiEndpoints[0]?.model || '';
    }

    saveSettings(next);
    showToast('已删除');
    render();
  });

  controls.append(modelsButton, testButton, editButton, deleteButton);

  if (Array.isArray(endpoint.modelList) && endpoint.modelList.length) {
    const select = document.createElement('select');
    select.className = 'input-card';

    endpoint.modelList.forEach((modelId) => {
      const option = document.createElement('option');
      option.value = modelId;
      option.textContent = modelId;
      option.selected = endpoint.model === modelId;
      select.appendChild(option);
    });

    select.addEventListener('change', () => {
      const next = getSettings();
      const item = next.apiEndpoints.find((one) => one.id === endpoint.id);

      if (item) {
        item.model = select.value;

        if (next.defaultApiEndpointId === endpoint.id) {
          next.defaultModel = select.value;
        }

        saveSettings(next);
        showToast('模型已切换');
        render();
      }
    });

    card.append(top, keyRow, model, select, controls);
    return card;
  }

  card.append(top, keyRow, model, controls);
  return card;
}

function openApiSheet(endpoint = null) {
  const isEdit = Boolean(endpoint);
  const form = sheetBase(isEdit ? '编辑 API 端点' : '新增 API 端点', '接口地址会自动兼容末尾带 /v1 的写法。');

  const nameInput = input('名称', endpoint?.name || '');
  const endpointInput = input('接口地址，如 https://api.openai.com', endpoint?.endpoint || '');
  const keyInput = input('API Key', endpoint?.apiKey || '');
  const modelInput = input('模型名', endpoint?.model || '');

  const keySecret = createSecretInput(keyInput);

  form.body.append(
    field('名称', nameInput),
    field('Endpoint', endpointInput),
    field('API Key', keySecret),
    field('模型', modelInput)
  );

  const testButton = button('测试连接', 'ghost', 'check');
  testButton.addEventListener('click', async () => {
    const tempId = endpoint?.id || generateId();
    const next = getSettings();
    const tempEndpoint = {
      id: tempId,
      name: nameInput.value.trim() || '临时端点',
      endpoint: endpointInput.value.trim(),
      apiKey: keyInput.value.trim(),
      model: modelInput.value.trim(),
      modelList: endpoint?.modelList || []
    };

    if (!tempEndpoint.endpoint) {
      showToast('请先填写接口地址');
      return;
    }

    const oldEndpoints = next.apiEndpoints.slice();
    const exists = next.apiEndpoints.some((item) => item.id === tempId);

    if (exists) {
      next.apiEndpoints = next.apiEndpoints.map((item) => item.id === tempId ? tempEndpoint : item);
    } else {
      next.apiEndpoints.push(tempEndpoint);
    }

    saveSettings(next);

    await withWorking(`sheet-test:${tempId}`, testButton, async () => {
      const models = await fetchModels(tempId);
      showToast(models.length ? '连接正常' : '连接失败或无模型');
    });

    const after = getSettings();
    after.apiEndpoints = oldEndpoints;
    saveSettings(after);
  });

  const saveButton = button('保存', 'primary', 'check');
  saveButton.addEventListener('click', () => {
    const next = getSettings();
    const value = {
      id: endpoint?.id || generateId(),
      name: nameInput.value.trim() || '默认端点',
      endpoint: endpointInput.value.trim(),
      apiKey: keyInput.value.trim(),
      model: modelInput.value.trim(),
      modelList: endpoint?.modelList || []
    };

    if (!value.endpoint) {
      showToast('请填写接口地址');
      return;
    }

    if (isEdit) {
      next.apiEndpoints = next.apiEndpoints.map((item) => item.id === endpoint.id ? value : item);
    } else {
      next.apiEndpoints.push(value);
    }

    if (!next.defaultApiEndpointId) {
      next.defaultApiEndpointId = value.id;
      next.defaultModel = value.model;
    }

    if (next.defaultApiEndpointId === value.id) {
      next.defaultModel = value.model || next.defaultModel;
    }

    saveSettings(next);
    hideBottomSheet();
    showToast('已保存');
    render();
  });

  form.actions.append(testButton, saveButton);
  showBottomSheet(form.el);
}

function renderTtsSection(settings) {
  const box = document.createElement('div');
  box.className = 'settings-panel';

  const helper = createSoftNote('TTS 使用 OpenAI 兼容的 /v1/audio/speech。播放失败时通常是 Key、地址或浏览器自动播放限制导致。');

  const provider = createSegmented(
    [
      { value: 'openai', label: 'OpenAI' },
      { value: 'custom', label: '自定义' }
    ],
    settings.ttsGlobal.provider || 'openai',
    (value) => {
      const next = getSettings();
      next.ttsGlobal.provider = value;
      saveSettings(next);
      render();
    }
  );

  const key = input('TTS API Key', settings.ttsGlobal.apiKey || '');
  const keySecret = createSecretInput(key);

  const endpoint = input('TTS 服务地址', settings.ttsGlobal.endpoint || '');
  const voice = input('测试音色，默认 alloy', settings.ttsGlobal.voice || 'alloy');

  key.addEventListener('change', () => updateTts({ apiKey: key.value.trim() }));
  endpoint.addEventListener('change', () => updateTts({ endpoint: endpoint.value.trim() }));
  voice.addEventListener('change', () => updateTts({ voice: voice.value.trim() || 'alloy' }));

  const testButton = button('测试播放', 'primary', 'play');
  testButton.addEventListener('click', () => {
    if (currentTtsTest) {
      currentTtsTest.stop();
      currentTtsTest = null;
      showToast('已停止上一段试听');
      return;
    }

    const next = getSettings();

    currentTtsTest = playTTS('这是一段测试语音。如果你听到了，说明语音配置可以使用。', {
      enabled: true,
      provider: next.ttsGlobal.provider,
      apiKey: next.ttsGlobal.apiKey,
      endpoint: next.ttsGlobal.endpoint,
      voice: next.ttsGlobal.voice || 'alloy'
    });

    window.setTimeout(() => {
      currentTtsTest = null;
    }, 1200);
  });

  box.append(
    helper,
    formCard([
      customRow('服务商', provider),
      field('API Key', keySecret),
      field('Endpoint', endpoint),
      field('Voice', voice)
    ]),
    testButton
  );

  return box;
}

function updateTts(partial) {
  const next = getSettings();
  next.ttsGlobal = {
    ...next.ttsGlobal,
    ...partial
  };
  saveSettings(next);
}

function renderMcpSection(settings) {
  const box = document.createElement('div');
  box.className = 'settings-panel';

  const helper = createSoftNote('MCP 服务器必须允许浏览器跨域访问，否则静态页面无法连接。');

  const addButton = button('新增 MCP 服务器', 'primary', 'add');
  addButton.addEventListener('click', () => openMcpSheet());

  const list = document.createElement('div');
  list.className = 'settings-list';

  if (!settings.mcpServers.length) {
    list.appendChild(emptyState('还没有 MCP 服务器', '添加后可在聊天里调用工具。'));
  } else {
    settings.mcpServers.forEach((server) => {
      list.appendChild(createMcpCard(server));
    });
  }

  box.append(helper, addButton, list);
  return box;
}

function createMcpCard(server) {
  const card = document.createElement('article');
  card.className = 'settings-item';

  const top = document.createElement('div');
  top.className = 'settings-item-top';

  const left = document.createElement('div');
  left.className = 'settings-item-main';

  const title = document.createElement('div');
  title.className = 'settings-item-title';
  title.textContent = server.name || 'MCP 服务器';

  const meta = document.createElement('div');
  meta.className = 'settings-item-meta';
  meta.textContent = server.url || '未填写地址';

  left.append(title, meta);

  const sw = switchButton(Boolean(server.enabled), (active) => {
    const next = getSettings();
    const item = next.mcpServers.find((one) => one.id === server.id);

    if (item) {
      item.enabled = active;
    }

    saveSettings(next);
    resetSession(server.id);
    showToast(active ? 'MCP 已启用' : 'MCP 已停用');
    render();
  });

  top.append(left, sw);

  const controls = document.createElement('div');
  controls.className = 'settings-controls';

  const editButton = button('编辑', 'ghost', 'edit');
  editButton.addEventListener('click', () => openMcpSheet(server));

  const deleteButton = button('删除', 'ghost', 'delete');
  deleteButton.addEventListener('click', async () => {
    const ok = await showConfirm('确定删除这个 MCP 服务器吗？');
    if (!ok) return;

    const next = getSettings();
    next.mcpServers = next.mcpServers.filter((item) => item.id !== server.id);
    saveSettings(next);
    resetSession(server.id);
    showToast('已删除');
    render();
  });

  controls.append(editButton, deleteButton);
  card.append(top, controls);
  return card;
}

function openMcpSheet(server = null) {
  const form = sheetBase(server ? '编辑 MCP 服务器' : '新增 MCP 服务器');

  const nameInput = input('名称', server?.name || '');
  const urlInput = input('服务器 URL', server?.url || '');
  const enabled = switchButton(server?.enabled !== false, () => {});

  form.body.append(
    field('名称', nameInput),
    field('URL', urlInput),
    customRow('启用', enabled)
  );

  const saveButton = button('保存', 'primary', 'check');
  saveButton.addEventListener('click', () => {
    const next = getSettings();
    const value = {
      id: server?.id || generateId(),
      name: nameInput.value.trim() || 'MCP 服务器',
      url: urlInput.value.trim(),
      enabled: enabled.classList.contains('active')
    };

    if (!value.url) {
      showToast('请填写服务器 URL');
      return;
    }

    if (server) {
      next.mcpServers = next.mcpServers.map((item) => item.id === server.id ? value : item);
    } else {
      next.mcpServers.push(value);
    }

    saveSettings(next);
    resetSession(value.id);
    hideBottomSheet();
    showToast('已保存');
    render();
  });

  form.actions.appendChild(saveButton);
  showBottomSheet(form.el);
}

function renderThemeSection() {
  const box = document.createElement('div');
  box.className = 'settings-panel';

  const presets = document.createElement('div');
  presets.className = 'theme-grid';

  [
    { id: 'cream', name: '奶油白', desc: '温柔浅色' },
    { id: 'sakura', name: '樱花粉', desc: '柔和粉调' },
    { id: 'sky', name: '暖紫灰', desc: '清爽冷调' },
    { id: 'dark', name: '夜间', desc: '暗色模式' }
  ].forEach((preset) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `theme-card theme-${preset.id}`;

    const title = document.createElement('span');
    title.className = 'theme-card-title';
    title.textContent = preset.name;

    const desc = document.createElement('span');
    desc.className = 'theme-card-desc';
    desc.textContent = preset.desc;

    item.append(title, desc);

    item.addEventListener('click', () => {
      setPreset(preset.id);
      emitDesktopRefresh();
      showToast('主题已切换');
      render();
    });

    presets.appendChild(item);
  });

  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.className = 'hidden';

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      importTheme(text);
      emitDesktopRefresh();
      showToast('主题已导入');
      render();
    } catch (_) {
      showToast('主题导入失败');
    } finally {
      importInput.value = '';
    }
  });

  const importButton = button('导入主题', 'ghost', 'upload');
  importButton.addEventListener('click', () => importInput.click());

  const exportButton = button('导出主题', 'ghost', 'download');
  exportButton.addEventListener('click', () => {
    downloadJson('theme.json', exportTheme());
  });

  const current = exportTheme();

  const accent = input('', current.accent || '', 'color');
  const userBubble = input('', current['bubble-user-bg'] || '', 'color');
  const aiBubble = input('', current['bubble-ai-bg'] || '', 'color');
  const radius = input('', parseInt(current['bubble-radius'] || '18', 10), 'range');
  radius.min = '12';
  radius.max = '30';

  const radiusValue = document.createElement('span');
  radiusValue.className = 'range-value';
  radiusValue.textContent = `${radius.value}px`;

  accent.addEventListener('input', () => applyAndSaveTheme({ accent: accent.value, 'bubble-user-bg': accent.value }));
  userBubble.addEventListener('input', () => applyAndSaveTheme({ 'bubble-user-bg': userBubble.value }));
  aiBubble.addEventListener('input', () => applyAndSaveTheme({ 'bubble-ai-bg': aiBubble.value }));
  radius.addEventListener('input', () => {
    radiusValue.textContent = `${radius.value}px`;
    applyAndSaveTheme({ 'bubble-radius': `${radius.value}px` });
  });

  const preview = document.createElement('div');
  preview.className = 'theme-preview';

  const aiBubblePreview = document.createElement('div');
  aiBubblePreview.className = 'theme-preview-bubble ai';
  aiBubblePreview.textContent = '这是 AI 的回复预览';

  const userBubblePreview = document.createElement('div');
  userBubblePreview.className = 'theme-preview-bubble user';
  userBubblePreview.textContent = '这是你的消息预览';

  preview.append(aiBubblePreview, userBubblePreview);

  const custom = document.createElement('details');
  custom.className = 'settings-details';

  const summary = document.createElement('summary');
  summary.textContent = '自定义外观';

  const customBody = formCard([
    field('强调色', accent),
    field('用户气泡', userBubble),
    field('AI 气泡', aiBubble),
    field('气泡圆角', wrapInline(radius, radiusValue))
  ]);

  custom.append(summary, customBody, preview);

  const actions = document.createElement('div');
  actions.className = 'settings-actions';
  actions.append(importButton, exportButton, importInput);

  box.append(presets, actions, custom);
  return box;
}

function applyAndSaveTheme(vars) {
  applyTheme(vars);
  saveTheme();
  emitDesktopRefresh();
}

function renderPersonalSection(settings) {
  const box = document.createElement('div');
  box.className = 'settings-panel';

  box.append(
    createDesktopPersonal(settings),
    createMessagePersonal(settings),
    createIconPersonal(),
    createProfilePersonal(settings)
  );

  return box;
}

function createDesktopPersonal(settings) {
  const details = detailsBlock('桌面');

  const wallpaperInput = document.createElement('input');
  wallpaperInput.type = 'file';
  wallpaperInput.accept = 'image/*';
  wallpaperInput.className = 'hidden';

  const uploadWallpaper = button('上传壁纸', 'ghost', 'upload');
  uploadWallpaper.addEventListener('click', () => wallpaperInput.click());

  const preview = document.createElement('div');
  preview.className = 'wallpaper-preview';
  loadWallpaperPreview(preview);

  wallpaperInput.addEventListener('change', async () => {
    const file = wallpaperInput.files?.[0];
    if (!file) return;

    await withWorking('wallpaper', uploadWallpaper, async () => {
      try {
        const base64 = await compressImage(file, 1920, 0.82);

        await setDB('blobs', WALLPAPER_KEY, {
          key: WALLPAPER_KEY,
          value: base64,
          updatedAt: getNow()
        });

        removeData(WALLPAPER_KEY);
        emitDesktopRefresh();
        showToast('壁纸已更新');
        render();
      } catch (_) {
        showToast('壁纸处理失败');
      } finally {
        wallpaperInput.value = '';
      }
    });
  });

  const clearWallpaper = button('清除壁纸', 'ghost', 'clear');
  clearWallpaper.addEventListener('click', async () => {
    await deleteDB('blobs', WALLPAPER_KEY);
    removeData(WALLPAPER_KEY);
    emitDesktopRefresh();
    showToast('壁纸已清除');
    render();
  });

  const timeSwitch = switchButton(settings.widgets.time !== false, (active) => updateWidget('time', active));
  const weatherSwitch = switchButton(settings.widgets.weather !== false, (active) => updateWidget('weather', active));
  const anniversarySwitch = switchButton(settings.widgets.anniversary !== false, (active) => updateWidget('anniversary', active));

  details.append(
    preview,
    formCard([
      customRow('壁纸', wrapActions(uploadWallpaper, clearWallpaper, wallpaperInput)),
      customRow('时间组件', timeSwitch),
      customRow('天气组件', weatherSwitch),
      customRow('纪念日组件', anniversarySwitch)
    ])
  );

  return details;
}

async function loadWallpaperPreview(previewEl) {
  try {
    const record = await getDB('blobs', WALLPAPER_KEY);
    const image = record?.value || record?.data || '';

    if (image) {
      previewEl.style.backgroundImage = `url("${image}")`;
      previewEl.textContent = '';
      return;
    }
  } catch (_) {
    previewEl.textContent = '暂无壁纸';
  }

  previewEl.textContent = '暂无壁纸';
}

function updateWidget(key, value) {
  const next = getSettings();
  next.widgets[key] = value;
  saveSettings(next);
  emitDesktopRefresh();
}

function createMessagePersonal(settings) {
  const details = detailsBlock('消息');

  const mode = createSegmented(
    [
      { value: 'bubble', label: '气泡' },
      { value: 'dialog', label: '对话' }
    ],
    settings.bubbleMode || 'bubble',
    (value) => {
      const next = getSettings();
      next.bubbleMode = value;
      saveSettings(next);
      showToast('消息样式已保存');
      render();
    }
  );

  const font = input('', settings.fontSize || 15, 'range');
  font.min = '13';
  font.max = '20';

  const fontValue = document.createElement('span');
  fontValue.className = 'range-value';
  fontValue.textContent = `${settings.fontSize || 15}px`;

  font.addEventListener('input', () => {
    const next = getSettings();
    next.fontSize = Number(font.value) || 15;
    fontValue.textContent = `${next.fontSize}px`;
    saveSettings(next);
    applyTheme({ 'font-size-base': `${next.fontSize}px` });
    saveTheme();
  });

  details.append(
    formCard([
      customRow('气泡模式', mode),
      field('字体大小', wrapInline(font, fontValue))
    ])
  );

  return details;
}

function createIconPersonal() {
  const details = detailsBlock('应用图标');

  const icons = getData(ICONS_KEY) || {};
  const hidden = getHiddenIcons();

  const list = document.createElement('div');
  list.className = 'settings-list';

  DESKTOP_APPS.forEach((app) => {
    const row = document.createElement('div');
    row.className = 'icon-editor-row';

    const art = document.createElement('div');
    art.className = 'settings-icon-preview';

    if (icons[app.id]?.image) {
      const img = document.createElement('img');
      img.src = icons[app.id].image;
      img.alt = '';
      art.appendChild(img);
    } else {
      art.appendChild(createIcon(app.icon, 22));
    }

    const nameInput = input('应用名', icons[app.id]?.name || app.name);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.className = 'hidden';

    const imageButton = iconButton('camera', '上传图标');
    imageButton.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      await withWorking(`icon:${app.id}`, imageButton, async () => {
        try {
          const image = await compressImage(file, 200, 0.82);
          const nextIcons = getData(ICONS_KEY) || {};
          nextIcons[app.id] = {
            ...(nextIcons[app.id] || {}),
            name: nameInput.value.trim() || app.name,
            image
          };
          setData(ICONS_KEY, nextIcons);
          emitDesktopRefresh();
          showToast('图标已更新');
          render();
        } catch (_) {
          showToast('图标处理失败');
        } finally {
          fileInput.value = '';
        }
      });
    });

    nameInput.addEventListener('change', () => {
      const nextIcons = getData(ICONS_KEY) || {};
      nextIcons[app.id] = {
        ...(nextIcons[app.id] || {}),
        name: nameInput.value.trim() || app.name
      };
      setData(ICONS_KEY, nextIcons);
      emitDesktopRefresh();
      showToast('名称已保存');
    });

    const visibleSwitch = switchButton(!hidden.includes(app.id), (active) => {
      const nextHidden = getHiddenIcons().filter((id) => id !== app.id);
      if (!active) nextHidden.push(app.id);
      setData(HIDDEN_ICONS_KEY, [...new Set(nextHidden)]);
      emitDesktopRefresh();
      showToast(active ? '图标已显示' : '图标已隐藏');
      render();
    });

    row.append(art, nameInput, imageButton, visibleSwitch, fileInput);
    list.appendChild(row);
  });

  details.appendChild(list);
  return details;
}

function createProfilePersonal(settings) {
  const details = detailsBlock('我的资料');

  const avatar = document.createElement('button');
  avatar.type = 'button';
  avatar.className = 'profile-avatar';

  if (settings.user.avatar) {
    const img = document.createElement('img');
    img.src = settings.user.avatar;
    img.alt = '';
    avatar.appendChild(img);
  } else {
    avatar.appendChild(createIcon('smile', 26));
  }

  const avatarInput = document.createElement('input');
  avatarInput.type = 'file';
  avatarInput.accept = 'image/*';
  avatarInput.className = 'hidden';

  avatar.addEventListener('click', () => avatarInput.click());

  avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;

    await withWorking('avatar', avatar, async () => {
      try {
        const image = await compressImage(file, 200, 0.82);
        const next = getSettings();
        next.user.avatar = image;
        saveSettings(next);
        showToast('头像已更新');
        render();
      } catch (_) {
        showToast('头像处理失败');
      } finally {
        avatarInput.value = '';
      }
    });
  });

  const name = input('昵称', settings.user.name || '');
  name.addEventListener('change', () => {
    const next = getSettings();
    next.user.name = name.value.trim();
    saveSettings(next);
    showToast('资料已保存');
  });

  details.append(
    formCard([
      customRow('头像', wrapActions(avatar, avatarInput)),
      field('昵称', name)
    ])
  );

  return details;
}

function renderDataSection() {
  const box = document.createElement('div');
  box.className = 'settings-panel';

  const usageCard = document.createElement('div');
  usageCard.className = 'settings-item';
  usageCard.innerHTML = `
    <div class="settings-item-title">存储用量</div>
    <div class="settings-item-meta">正在读取</div>
    <div class="usage-track"><span style="width:0%"></span></div>
  `;

  getStorageUsage().then((usage) => {
    const meta = usageCard.querySelector('.settings-item-meta');
    const bar = usageCard.querySelector('.usage-track span');

    if (!meta || !bar) return;

    meta.textContent = `${formatBytes(usage.used)} / ${formatBytes(usage.quota)} · ${usage.percent || 0}%`;
    bar.style.width = `${usage.percent || 0}%`;
  });

  const storesCard = document.createElement('div');
  storesCard.className = 'settings-item';
  storesCard.innerHTML = `
    <div class="settings-item-title">数据分布</div>
    <div class="settings-item-meta">正在统计各模块数据量</div>
  `;

  loadStoreStats(storesCard);

  const exportButton = button('导出全部数据', 'primary', 'download');
  exportButton.addEventListener('click', exportAllData);

  const importInput = document.createElement('input');
  importInput.type = 'file';
  importInput.accept = 'application/json';
  importInput.className = 'hidden';

  importInput.addEventListener('change', async () => {
    const file = importInput.files?.[0];
    if (!file) return;

    try {
      const first = await showConfirm('导入会覆盖同名配置，并写入备份文件里的数据。是否继续？');
      if (!first) return;

      const second = await showConfirm('请再次确认：导入前建议先导出当前数据备份。');
      if (!second) return;

      const text = await file.text();

      await withWorking('import-data', null, async () => {
        await importAllData(JSON.parse(text));
      });

      showToast('导入完成');
      emitDesktopRefresh();
      render();
    } catch (_) {
      showToast('导入失败，请检查文件');
    } finally {
      importInput.value = '';
    }
  });

  const importButton = button('导入数据', 'ghost', 'upload');
  importButton.addEventListener('click', () => importInput.click());

  const clearChats = button('清理聊天和记忆', 'ghost', 'clear');
  clearChats.addEventListener('click', async () => {
    const ok = await showConfirm('确定清空聊天记录和自动记忆吗？角色配置会保留。');
    if (!ok) return;

    await clearStoreDB('messages');
    await clearStoreDB('group_messages');
    await clearStoreDB('memories');
    setData('chat_unread_counts', {});
    emitDesktopRefresh();
    showToast('聊天和记忆已清理');
    render();
  });

  const clearAll = button('清空所有数据', 'ghost', 'delete');
  clearAll.addEventListener('click', async () => {
    const first = await showConfirm('确定清空所有数据吗？这个操作不能恢复。');
    if (!first) return;

    const second = await showConfirm('请再次确认：所有角色、聊天、图片和设置都会清空。');
    if (!second) return;

    for (const store of DB_STORES) {
      await clearStoreDB(store);
    }

    LOCAL_KEYS.forEach(removeData);
    saveSettings(DEFAULT_SETTINGS);
    emitDesktopRefresh();
    showToast('已清空');
    render();
  });

  box.append(
    usageCard,
    storesCard,
    wrapActions(exportButton, importButton),
    wrapActions(clearChats, clearAll, importInput)
  );

  return box;
}

async function loadStoreStats(card) {
  const meta = card.querySelector('.settings-item-meta');
  if (!meta) return;

  const counts = [];

  for (const store of DB_STORES) {
    const list = await getAllDB(store);
    if (list.length) {
      counts.push(`${store} ${list.length}`);
    }
  }

  meta.textContent = counts.length ? counts.join(' · ') : '还没有 IndexedDB 数据';
}

async function exportAllData() {
  await withWorking('export-data', null, async () => {
    const data = {
      exportedAt: getNow(),
      localStorage: {},
      indexedDB: {}
    };

    LOCAL_KEYS.forEach((key) => {
      const value = getData(key);
      if (value !== null) {
        data.localStorage[key] = value;
      }
    });

    for (const store of DB_STORES) {
      data.indexedDB[store] = await getAllDB(store);
    }

    downloadJson(`ai-phone-backup-${Date.now()}.json`, data);
    showToast('导出完成');
  });
}

async function importAllData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('invalid data');
  }

  if (data.localStorage && typeof data.localStorage === 'object') {
    Object.entries(data.localStorage).forEach(([key, value]) => {
      setData(key, value);
    });
  }

  if (data.indexedDB && typeof data.indexedDB === 'object') {
    for (const store of DB_STORES) {
      const records = Array.isArray(data.indexedDB[store]) ? data.indexedDB[store] : [];

      for (const record of records) {
        const key = store === 'blobs' ? record.key : record.id;

        if (key) {
          await setDB(store, key, record);
        }
      }
    }
  }
}

function getSettings() {
  const saved = getData(SETTINGS_KEY) || {};

  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    ttsGlobal: {
      ...DEFAULT_SETTINGS.ttsGlobal,
      ...(saved.ttsGlobal || {})
    },
    user: {
      ...DEFAULT_SETTINGS.user,
      ...(saved.user || {})
    },
    widgets: {
      ...DEFAULT_SETTINGS.widgets,
      ...(saved.widgets || {})
    },
    mcpServers: Array.isArray(saved.mcpServers) ? saved.mcpServers : [],
    apiEndpoints: Array.isArray(saved.apiEndpoints) ? saved.apiEndpoints : []
  };
}

function saveSettings(settings) {
  setData(SETTINGS_KEY, settings);
}

function getHiddenIcons() {
  const hidden = getData(HIDDEN_ICONS_KEY);
  return Array.isArray(hidden) ? hidden : [];
}

function getApiMeta(settings) {
  if (!settings.apiEndpoints.length) return '未配置';
  const current = settings.apiEndpoints.find((item) => item.id === settings.defaultApiEndpointId) || settings.apiEndpoints[0];
  return current?.name || '已配置';
}

function getTtsMeta(settings) {
  return settings.ttsGlobal.endpoint ? '已填写服务地址' : '未配置';
}

function getMcpMeta(settings) {
  const count = settings.mcpServers.filter((item) => item.enabled).length;
  return count ? `${count} 个已启用` : '未启用';
}

function sheetBase(titleText, descText = '') {
  const el = document.createElement('div');

  const title = document.createElement('div');
  title.className = 'sheet-title';
  title.textContent = titleText;

  el.appendChild(title);

  if (descText) {
    const desc = document.createElement('div');
    desc.className = 'sheet-description';
    desc.textContent = descText;
    el.appendChild(desc);
  }

  const body = document.createElement('div');
  body.className = 'settings-sheet-body';

  const actions = document.createElement('div');
  actions.className = 'settings-actions sheet-actions';

  el.append(body, actions);
  return { el, body, actions };
}

function input(placeholder, value = '', type = 'text') {
  const el = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  el.className = type === 'textarea' ? 'textarea-card' : 'input-card';

  if (type !== 'textarea') {
    el.type = type;
  }

  el.placeholder = placeholder || '';
  el.value = value ?? '';

  return el;
}

function field(labelText, control) {
  const wrap = document.createElement('label');
  wrap.className = 'settings-field';

  const label = document.createElement('span');
  label.className = 'field-label';
  label.textContent = labelText;

  wrap.append(label, control);
  return wrap;
}

function customRow(labelText, control) {
  const row = document.createElement('div');
  row.className = 'form-row';

  const label = document.createElement('div');
  label.className = 'form-label';
  label.textContent = labelText;

  const box = document.createElement('div');
  box.className = 'form-control';
  box.appendChild(control);

  row.append(label, box);
  return row;
}

function formCard(children) {
  const card = document.createElement('div');
  card.className = 'form-card';
  children.forEach((child) => card.appendChild(child));
  return card;
}

function detailsBlock(title) {
  const details = document.createElement('details');
  details.className = 'settings-details';

  const summary = document.createElement('summary');
  summary.textContent = title;

  details.appendChild(summary);
  return details;
}

function button(text, variant = 'ghost', iconName = '') {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = variant === 'primary' ? 'btn-primary' : 'btn-ghost';

  if (iconName) {
    el.appendChild(createIcon(iconName, 18));
  }

  const span = document.createElement('span');
  span.textContent = text;
  el.appendChild(span);

  return el;
}

function iconButton(iconName, label) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'icon-button';
  el.setAttribute('aria-label', label);
  el.appendChild(createIcon(iconName, 22));
  return el;
}

function switchButton(active, onChange) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'switch';
  el.classList.toggle('active', Boolean(active));
  el.setAttribute('aria-label', '开关');

  el.addEventListener('click', () => {
    el.classList.toggle('active');
    onChange?.(el.classList.contains('active'));
  });

  return el;
}

function createSegmented(options, value, onChange) {
  const wrap = document.createElement('div');
  wrap.className = 'segmented';

  options.forEach((option) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.textContent = option.label;
    item.classList.toggle('active', option.value === value);
    item.addEventListener('click', () => onChange(option.value));
    wrap.appendChild(item);
  });

  return wrap;
}

function createSecretRow(secret) {
  const row = document.createElement('div');
  row.className = 'settings-key-row';

  const text = document.createElement('span');
  text.textContent = maskKey(secret);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'btn-ghost';
  toggle.appendChild(createIcon('eye', 18));

  let visible = false;

  toggle.addEventListener('click', () => {
    visible = !visible;
    text.textContent = visible ? secret || '未填写 Key' : maskKey(secret);
    toggle.innerHTML = '';
    toggle.appendChild(createIcon(visible ? 'eye-off' : 'eye', 18));
  });

  row.append(text, toggle);
  return row;
}

function createSecretInput(inputEl) {
  const wrap = document.createElement('div');
  wrap.className = 'secret-input';

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'icon-button';
  toggle.setAttribute('aria-label', '显示隐藏');
  toggle.appendChild(createIcon('eye', 20));

  let visible = true;

  toggle.addEventListener('click', () => {
    visible = !visible;
    inputEl.classList.toggle('secret-masked', !visible);
    toggle.innerHTML = '';
    toggle.appendChild(createIcon(visible ? 'eye' : 'eye-off', 20));
  });

  wrap.append(inputEl, toggle);
  return wrap;
}

function wrapActions(...items) {
  const wrap = document.createElement('div');
  wrap.className = 'settings-actions';
  items.forEach((item) => {
    if (item) wrap.appendChild(item);
  });
  return wrap;
}

function wrapInline(...items) {
  const wrap = document.createElement('div');
  wrap.className = 'inline-control';
  items.forEach((item) => wrap.appendChild(item));
  return wrap;
}

function createSoftNote(text) {
  const note = document.createElement('div');
  note.className = 'soft-note';
  note.textContent = text;
  return note;
}

function emptyState(titleText, text) {
  const el = document.createElement('div');
  el.className = 'empty-state';

  const title = document.createElement('div');
  title.className = 'empty-state-title';
  title.textContent = titleText;

  const desc = document.createElement('div');
  desc.className = 'empty-state-text';
  desc.textContent = text;

  el.append(title, desc);
  return el;
}

function maskKey(key) {
  if (!key || key === '未填写 Key') return '未填写 Key';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 4)}••••••••${key.slice(-4)}`;
}

function emitDesktopRefresh() {
  window.AppEvents?.emit?.('desktop:refresh');
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

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

async function withWorking(taskId, buttonEl, fn) {
  if (workingTask) {
    showToast('请等当前操作完成');
    return;
  }

  workingTask = taskId || 'working';

  if (buttonEl) {
    buttonEl.disabled = true;
    buttonEl.classList.add('is-loading');
  }

  try {
    await fn();
  } finally {
    workingTask = '';

    if (buttonEl) {
      buttonEl.disabled = false;
      buttonEl.classList.remove('is-loading');
    }
  }
}

function injectSettingsStyle() {
  if (document.getElementById('settings-style')) return;

  const style = document.createElement('style');
  style.id = 'settings-style';
  style.textContent = `
    .settings-app {
      color: var(--text-primary);
    }

    .settings-nav-title {
      flex: 1;
      min-width: 0;
    }

    .settings-stack {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
      padding-bottom: var(--spacing-lg);
    }

    .settings-section-text {
      min-width: 0;
      text-align: left;
    }

    .settings-panel {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .settings-list {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-md);
    }

    .settings-item {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .settings-item-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-md);
    }

    .settings-item-main {
      flex: 1;
      min-width: 0;
    }

    .settings-item-title {
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      line-height: 1.35;
    }

    .settings-item-meta {
      margin-top: 2px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.5;
      word-break: break-word;
    }

    .settings-key-row {
      min-height: 42px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--spacing-sm);
      padding: 0 12px;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
    }

    .settings-controls,
    .settings-actions {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--spacing-sm);
    }

    .settings-field {
      display: block;
      margin-bottom: var(--spacing-md);
    }

    .settings-field:last-child {
      margin-bottom: 0;
    }

    .settings-sheet-body {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
    }

    .sheet-actions {
      margin-top: var(--spacing-lg);
      justify-content: flex-end;
    }

    .settings-arrow {
      flex: 0 0 auto;
      color: var(--text-secondary);
    }

    .soft-note {
      padding: 12px 14px;
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .theme-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--spacing-sm);
    }

    .theme-card {
      min-height: 86px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      gap: 4px;
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      text-align: left;
      overflow: hidden;
      position: relative;
    }

    .theme-card::before {
      content: "";
      position: absolute;
      top: 14px;
      left: 14px;
      width: 30px;
      height: 30px;
      border-radius: 14px;
      background: var(--accent-light);
    }

    .theme-card-title {
      position: relative;
      z-index: 1;
      font-weight: 600;
      line-height: 1.35;
    }

    .theme-card-desc {
      position: relative;
      z-index: 1;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.35;
    }

    .theme-preview {
      display: flex;
      flex-direction: column;
      gap: var(--spacing-sm);
      margin-top: var(--spacing-md);
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--surface-muted);
    }

    .theme-preview-bubble {
      max-width: 78%;
      padding: 10px 13px;
      border-radius: var(--bubble-radius);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
      line-height: 1.6;
    }

    .theme-preview-bubble.ai {
      align-self: flex-start;
      background: var(--bubble-ai-bg);
      color: var(--bubble-ai-text);
    }

    .theme-preview-bubble.user {
      align-self: flex-end;
      background: var(--bubble-user-bg);
      color: var(--bubble-user-text);
    }

    .settings-details {
      padding: var(--spacing-md);
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .settings-details + .settings-details {
      margin-top: var(--spacing-sm);
    }

    .settings-details summary {
      cursor: pointer;
      color: var(--text-primary);
      font-size: var(--font-size-title);
      font-weight: 600;
      list-style: none;
    }

    .settings-details summary::-webkit-details-marker {
      display: none;
    }

    .settings-details > *:not(summary) {
      margin-top: var(--spacing-md);
    }

    .icon-editor-row {
      display: grid;
      grid-template-columns: 46px minmax(0, 1fr) 40px 46px;
      align-items: center;
      gap: var(--spacing-sm);
      padding: var(--spacing-sm);
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .settings-icon-preview,
    .profile-avatar {
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--surface-muted);
      color: var(--accent-dark);
      overflow: hidden;
    }

    .settings-icon-preview {
      width: 46px;
      height: 46px;
      border-radius: 16px;
    }

    .settings-icon-preview img,
    .profile-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .profile-avatar {
      width: 72px;
      height: 72px;
      margin-left: auto;
      border-radius: 50%;
      box-shadow: var(--shadow-sm);
    }

    .wallpaper-preview {
      min-height: 116px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: var(--spacing-md);
      border-radius: var(--radius-lg);
      background-color: var(--surface-muted);
      background-size: cover;
      background-position: center;
      color: var(--text-secondary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
    }

    .usage-track {
      height: 8px;
      margin-top: var(--spacing-sm);
      overflow: hidden;
      border-radius: 999px;
      background: var(--surface-muted);
    }

    .usage-track span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--accent);
      transition: var(--motion);
    }

    .secret-input {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 40px;
      align-items: center;
      gap: var(--spacing-sm);
    }

    .secret-masked {
      -webkit-text-security: disc;
    }

    .inline-control {
      display: flex;
      align-items: center;
      gap: var(--spacing-sm);
      width: 100%;
    }

    .inline-control input {
      flex: 1;
    }

    .range-value {
      min-width: 42px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      text-align: right;
    }

    .settings-app button:disabled {
      opacity: 0.58;
      pointer-events: none;
    }

    .settings-app .is-loading {
      opacity: 0.72;
    }

    .settings-app input[type="range"] {
      accent-color: var(--accent);
    }

    .settings-app input[type="color"] {
      width: 52px;
      height: 36px;
      padding: 0;
      border-radius: var(--radius-md);
      background: var(--surface-muted);
    }

    @media (max-width: 420px) {
      .theme-grid {
        grid-template-columns: 1fr;
      }

      .icon-editor-row {
        grid-template-columns: 42px minmax(0, 1fr) 38px;
      }

      .icon-editor-row .switch {
        grid-column: 2 / 4;
        justify-self: end;
      }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../core/storage.js 的 getData/setData/removeData/generateId/getNow/compressImage/getStorageUsage/getDB/setDB/getAllDB/deleteDB/clearStoreDB；../core/theme.js 的 applyTheme/exportTheme/importTheme/setPreset/saveTheme；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon；../core/api.js 的 fetchModels；../core/mcp.js 的 resetSession；../core/tts.js 的 playTTS
