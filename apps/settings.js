// apps/settings.js
// imports:
//   from '../core/storage.js': getData, setData, removeData, generateId, getNow, getStorageUsage, getDB, setDB, getAllDB, deleteDB, clearStoreDB, compressImage
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
  getStorageUsage,
  getDB,
  setDB,
  getAllDB,
  deleteDB,
  clearStoreDB,
  compressImage
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
const WALLPAPER_OPACITY_KEY = 'app_wallpaper_opacity';
const WIDGET_AREA_BG_KEY = 'app_widget_area_bg';
const WIDGET_BACKGROUNDS_KEY = 'app_widget_backgrounds';
const DESKTOP_SCALE_KEY = 'desktop_layout_scale';
const CUSTOM_FONT_KEY = 'app_custom_font';
const CUSTOM_FONT_META_KEY = 'app_custom_font_meta';
const CUSTOM_FONT_STYLE_ID = 'app-custom-font-style';
const CUSTOM_FONT_FAMILY = '"AppCustomFont", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const DEFAULT_FONT_FAMILY = '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const NETWORK_PROXY_KEY = 'app_network_proxy';
const CUSTOM_WIDGETS_KEY = 'app_custom_widgets';

const WIDGETS = [
  { id: 'time', name: '时间小卡片' },
  { id: 'weather', name: '天气小卡片' },
  { id: 'anniversary', name: '纪念日小卡片' },
  { id: 'focus', name: '焦点提示小卡片' }
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
  'app_hidden_icons',
  'app_wallpaper_opacity',
  'app_widget_backgrounds',
  'desktop_layout_scale',
  'app_custom_font_meta',
  'app_network_proxy',
  'app_custom_widgets'
];

const DEFAULT_SETTINGS = {
  defaultApiEndpointId: '',
  defaultModel: '',
  ttsGlobal: {
    provider: 'openai',
    apiKey: '',
    endpoint: '',
    voice: 'alloy',
    model: 'tts-1',
    modelList: []
  },
  mcpServers: [],
  bubbleMode: 'bubble',
  fontSize: 15,
  user: {
    name: '',
    avatar: '',
    avatarSource: '',
    avatarOpacity: 100
  },
  widgets: {
    time: true,
    weather: true,
    anniversary: true
  },
  apiEndpoints: []
};

const DEFAULT_NETWORK_PROXY = {
  enabled: false,
  type: 'HTTPS',
  host: '',
  port: '',
  username: '',
  password: '',
  bypass: 'localhost,127.0.0.1,192.168.0.0/16,*.local',
  testUrl: 'https://www.google.com',
  updatedAt: ''
};

let rootEl = null;
let mountedContainer = null;
let currentTtsTest = null;
let workingTask = '';

export async function mount(containerEl) {
  mountedContainer = containerEl;
  injectSettingsStyle();
  await applyCustomFontFromStorage();

  rootEl = el('section', 'app-screen settings-app');
  mountedContainer.innerHTML = '';
  mountedContainer.appendChild(rootEl);

  render();
}

export function unmount() {
  if (currentTtsTest) {
    currentTtsTest.stop();
    currentTtsTest = null;
  }

  hideBottomSheet();

  if (rootEl) rootEl.remove();
  if (mountedContainer) mountedContainer.innerHTML = '';

  rootEl = null;
  mountedContainer = null;
  workingTask = '';
}

function render() {
  if (!rootEl) return;

  const settings = getSettings();

  rootEl.innerHTML = '';

  const nav = el('div', 'nav-bar');
  const backButton = iconButton('back', '返回');
  backButton.addEventListener('click', () => window.closeCurrentApp?.());

  const titleWrap = el('div', 'settings-nav-title');
  titleWrap.append(
    el('div', 'nav-title', '设置'),
    el('div', 'nav-subtitle', '把小手机调成顺手的样子')
  );

  nav.append(backButton, titleWrap);

  const content = el('div', 'content-area');
  content.appendChild(renderSettingsHome(settings));

  rootEl.append(nav, content);
}

function renderSettingsHome(settings) {
  const home = el('div', 'content-narrow settings-home');

  home.append(
    createSettingsGroup('使用设置', [
      rowConfig('star', '颜色模式', getThemeLabel(), () => openSettingsPanel('颜色模式', renderThemeSection(), '换颜色、字色和聊天气泡。')),
      rowConfig('edit', '字体与显示', `${settings.fontSize || 15}px`, () => openSettingsPanel('字体与显示', renderFontDisplaySection(getSettings()), '把字字调到眼睛最舒服。')),
      rowConfig('settings', '偏好设置', settings.bubbleMode === 'dialog' ? '对话卡片' : '气泡聊天', () => openSettingsPanel('偏好设置', createMessagePersonal(settings), '把聊天样子换成你喜欢的。'))
    ]),
    createSettingsGroup('模型与服务', [
      rowConfig('heart', '模型小管家', getModelMeta(settings), () => openSettingsPanel('模型小管家', renderApiSection(getSettings()), '管理端点、拉取模型、设置默认模型。')),
      rowConfig('play', '声音小开关', settings.ttsGlobal.model || 'tts-1', () => openSettingsPanel('声音小开关', renderTtsSection(getSettings()), '配置朗读服务，试试 TA 的声音。')),
      rowConfig('mcp', '工具小助手', getMcpMeta(settings), () => openSettingsPanel('工具小助手', renderMcpSection(getSettings()), '管理聊天里可以调用的小工具。')),
      rowConfig('mcp', '网络代理', getNetworkProxyMeta(), () => openSettingsPanel('网络代理', renderNetworkProxySection(), '这里只保存代理配置，不接管系统代理。'))
    ]),
    createSettingsGroup('桌面与外观', [
      rowConfig('expand', '桌面大小', getScaleMeta(), () => openSettingsPanel('桌面大小', renderDesktopLayoutSection(), '图标、小卡片和 Dock 都能调。')),
      rowConfig('image', '桌面壁纸', '图片与透明度', () => openSettingsPanel('桌面壁纸', renderDesktopWallpaperSection(getSettings()), '给桌面换一张喜欢的图。')),
      rowConfig('expand', '小卡片背景', '区域与单项', () => openSettingsPanel('小卡片背景', renderWidgetBackgroundSection(), '小卡片也可以拥有自己的背景。')),
      rowConfig('star', '自定义小组件', `${getCustomWidgets().length} 个`, () => openSettingsPanel('自定义小组件', renderCustomWidgetSection(), '自己捏小卡片，形状、图片、文字都能换。')),
      rowConfig('smile', '应用图标', getHiddenIcons().length ? `${getHiddenIcons().length} 个隐藏` : '全部显示', () => openSettingsPanel('应用图标', createIconPersonal(), '改名字、换图标、调透明度，也可以恢复隐藏图标。'))
    ]),
    createSettingsGroup('数据设置', [
      rowConfig('download', '把小手机打包', '导入导出', () => openSettingsPanel('把小手机打包', renderDataSection(), '把重要数据好好备份起来。')),
      rowConfig('memory', '聊天记录存储', '本地浏览器', () => openSettingsPanel('聊天记录存储', renderDataSection(), '看看数据都放在哪里。')),
      rowConfig('clear', '轻轻清理', '谨慎操作', () => openSettingsPanel('轻轻清理', renderDataSection(), '把不需要的东西收拾干净。'))
    ]),
    createSettingsGroup('关于', [
      rowConfig('memory', '当前版本', '静态版', () => showToast('当前是静态小手机')),
      rowConfig('download', '存储说明', '本地保存', () => showToast('配置存 localStorage，大数据存 IndexedDB'))
    ])
  );

  return home;
}

function rowConfig(icon, title, value, action) {
  return { icon, title, value, action };
}

function createSettingsGroup(title, rows) {
  const group = el('section', 'settings-group');
  group.appendChild(el('div', 'settings-group-title', title));

  const card = el('div', 'settings-list-card');
  rows.forEach((row) => card.appendChild(createSettingsRow(row)));

  group.appendChild(card);
  return group;
}

function createSettingsRow({ icon, title, value = '', meta = '', action }) {
  const row = el('button', 'settings-row');
  row.type = 'button';

  const iconBox = el('span', 'settings-row-icon');
  iconBox.appendChild(createIcon(icon, 24));

  const main = el('span', 'settings-row-main');
  main.appendChild(el('span', 'settings-row-title', title));
  if (meta) main.appendChild(el('span', 'settings-row-meta', meta));

  const right = el('span', 'settings-row-right');
  if (value) right.appendChild(el('span', 'settings-row-value', value));

  const arrow = el('span', 'settings-row-arrow');
  arrow.appendChild(createIcon('arrow-right', 18));
  right.appendChild(arrow);

  row.append(iconBox, main, right);
  row.addEventListener('click', action);

  return row;
}

function openSettingsPanel(title, bodyEl, desc = '') {
  const box = el('div', 'settings-panel-sheet');
  box.appendChild(el('div', 'sheet-title', title));

  if (desc) box.appendChild(el('div', 'sheet-description', desc));

  const body = el('div', 'settings-panel-sheet-body');
  body.appendChild(bodyEl);
  box.appendChild(body);

  showBottomSheet(box);
}

function reopenPanel(title, bodyEl, desc = '') {
  hideBottomSheet();
  window.setTimeout(() => openSettingsPanel(title, bodyEl, desc), 180);
}

function renderThemeSection() {
  const box = el('div', 'settings-panel');
  const presets = el('div', 'theme-grid');

  [
    { id: 'cream', name: '奶油白', desc: '温柔浅色' },
    { id: 'sakura', name: '樱花粉', desc: '柔和粉调' },
    { id: 'sky', name: '暖紫灰', desc: '清爽冷调' },
    { id: 'dark', name: '夜间', desc: '暗色模式' }
  ].forEach((preset) => {
    const item = el('button', `theme-card theme-${preset.id}`);
    item.type = 'button';
    item.append(el('span', 'theme-card-title', preset.name), el('span', 'theme-card-desc', preset.desc));
    item.addEventListener('click', () => {
      setPreset(preset.id);
      emitDesktopRefresh();
      showToast('主题换好啦');
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
      importTheme(await file.text());
      emitDesktopRefresh();
      showToast('主题导入好啦');
      render();
    } catch (_) {
      showToast('主题导入失败啦');
    } finally {
      importInput.value = '';
    }
  });

  const importButton = button('导入主题', 'ghost', 'upload');
  importButton.addEventListener('click', () => importInput.click());

  const exportButton = button('导出主题', 'ghost', 'download');
  exportButton.addEventListener('click', () => downloadJson('theme.json', exportTheme()));

  const current = exportTheme();
  const accent = input('', current.accent || '', 'color');
  const textPrimary = input('', current['text-primary'] || '', 'color');
  const textSecondary = input('', current['text-secondary'] || '', 'color');
  const textHint = input('', current['text-hint'] || '', 'color');
  const userBubble = input('', current['bubble-user-bg'] || '', 'color');
  const aiBubble = input('', current['bubble-ai-bg'] || '', 'color');
  const radius = input('', parseInt(current['bubble-radius'] || '18', 10), 'range');
  radius.min = '12';
  radius.max = '30';

  const radiusValue = el('span', 'range-value', `${radius.value}px`);

  accent.addEventListener('input', () => applyAndSaveTheme({ accent: accent.value, 'bubble-user-bg': accent.value }));
  textPrimary.addEventListener('input', () => applyAndSaveTheme({ 'text-primary': textPrimary.value }));
  textSecondary.addEventListener('input', () => applyAndSaveTheme({ 'text-secondary': textSecondary.value }));
  textHint.addEventListener('input', () => applyAndSaveTheme({ 'text-hint': textHint.value }));
  userBubble.addEventListener('input', () => applyAndSaveTheme({ 'bubble-user-bg': userBubble.value }));
  aiBubble.addEventListener('input', () => applyAndSaveTheme({ 'bubble-ai-bg': aiBubble.value }));
  radius.addEventListener('input', () => {
    radiusValue.textContent = `${radius.value}px`;
    applyAndSaveTheme({ 'bubble-radius': `${radius.value}px` });
  });

  const preview = el('div', 'theme-preview');
  preview.append(
    el('div', 'theme-preview-bubble ai', '这是 TA 的回复预览'),
    el('div', 'theme-preview-bubble user', '这是你的消息预览')
  );

  box.append(
    presets,
    wrapActions(importButton, exportButton, importInput),
    formCard([
      field('强调色', accent),
      field('主要文字', textPrimary),
      field('次要文字', textSecondary),
      field('提示文字', textHint),
      field('用户气泡', userBubble),
      field('AI 气泡', aiBubble),
      field('气泡圆角', wrapInline(radius, radiusValue))
    ]),
    preview
  );

  return box;
}

function applyAndSaveTheme(vars) {
  applyTheme(vars);
  saveTheme();
  emitDesktopRefresh();
}

function renderFontDisplaySection(settings) {
  const box = el('div', 'settings-panel');

  const font = input('', settings.fontSize || 15, 'range');
  font.min = '12';
  font.max = '24';

  const fontValue = el('span', 'range-value', `${settings.fontSize || 15}px`);

  font.addEventListener('input', () => {
    const next = getSettings();
    next.fontSize = Number(font.value) || 15;
    fontValue.textContent = `${next.fontSize}px`;
    saveSettings(next);
    applyTheme({ 'font-size-base': `${next.fontSize}px` });
    saveTheme();
    emitDesktopRefresh();
  });

  const fontInput = document.createElement('input');
  fontInput.type = 'file';
  fontInput.accept = 'font/ttf,font/otf,font/woff,font/woff2,.ttf,.otf,.woff,.woff2';
  fontInput.className = 'hidden';

  const meta = getCustomFontMeta();
  const preview = el('div', 'font-preview-card');
  preview.append(
    el('div', 'settings-item-title', meta?.name || '还没有换字体'),
    el('div', 'font-preview-text', '今天也要软乎乎地聊天')
  );

  const uploadButton = button('上传字体', 'ghost', 'upload');
  uploadButton.addEventListener('click', () => fontInput.click());

  fontInput.addEventListener('change', async () => {
    const file = fontInput.files?.[0];
    if (!file) return;

    await withWorking('custom-font', uploadButton, async () => {
      try {
        await saveCustomFont(file);
        showToast('字体换好啦');
        reopenPanel('字体与显示', renderFontDisplaySection(getSettings()), '把字字调到眼睛最舒服。');
      } catch (_) {
        showToast('字体好像没换成功');
      } finally {
        fontInput.value = '';
      }
    });
  });

  const clearButton = button('清除字体', 'ghost', 'clear');
  clearButton.addEventListener('click', async () => {
    await clearCustomFont();
    showToast('已经换回默认字体啦');
    reopenPanel('字体与显示', renderFontDisplaySection(getSettings()), '把字字调到眼睛最舒服。');
  });

  box.append(
    formCard([field('字字大小', wrapInline(font, fontValue))]),
    createSoftNote('调到眼睛最舒服就好。'),
    preview,
    formCard([customRow('字体文件', wrapActions(uploadButton, clearButton, fontInput))])
  );

  return box;
}

function createMessagePersonal(settings) {
  const box = el('div', 'settings-panel');

  const mode = createSegmented(
    [
      { value: 'bubble', label: '气泡聊天' },
      { value: 'dialog', label: '对话卡片' }
    ],
    settings.bubbleMode || 'bubble',
    (value) => {
      const next = getSettings();
      next.bubbleMode = value;
      saveSettings(next);
      emitDesktopRefresh();
      showToast('聊天样子换好啦');
      render();
    }
  );

  box.appendChild(formCard([customRow('对话模式', mode)]));
  return box;
}
function renderApiSection(settings) {
  const box = el('div', 'settings-panel');
  const addButton = button('新增端点', 'primary', 'add');
  const list = el('div', 'settings-list');

  addButton.addEventListener('click', () => openApiSheet());

  if (!settings.apiEndpoints.length) {
    list.appendChild(emptyState('还没有 API 端点', '新增端点时可以先拉取模型，再从列表里选择。'));
  } else {
    settings.apiEndpoints.forEach((endpoint) => list.appendChild(createApiEndpointCard(endpoint, settings)));
  }

  box.append(
    createSoftNote('支持 OpenAI 兼容接口。Endpoint 填根地址即可，例如 https://api.openai.com。'),
    wrapActions(addButton),
    list
  );

  return box;
}

function createApiEndpointCard(endpoint, settings) {
  const card = el('article', 'settings-item');
  const top = el('div', 'settings-item-top');
  const main = el('div', 'settings-item-main');

  main.append(
    el('div', 'settings-item-title', endpoint.name || '未命名端点'),
    el('div', 'settings-item-meta', endpoint.endpoint || '未填写地址')
  );

  const defaultButton = el(
    'button',
    settings.defaultApiEndpointId === endpoint.id ? 'btn-primary subtle' : 'btn-ghost',
    settings.defaultApiEndpointId === endpoint.id ? '默认' : '设为默认'
  );
  defaultButton.type = 'button';
  defaultButton.addEventListener('click', () => {
    const next = getSettings();
    next.defaultApiEndpointId = endpoint.id;
    next.defaultModel = endpoint.model || '';
    saveSettings(next);
    showToast('默认模型放好啦');
    render();
  });

  top.append(main, defaultButton);

  const pullButton = button('拉取模型', 'ghost', 'refresh');
  pullButton.addEventListener('click', async () => {
    await withWorking(`models:${endpoint.id}`, pullButton, async () => {
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
      }

      saveSettings(next);
      showToast(`拉到 ${models.length} 个模型啦`);
      reopenPanel('模型小管家', renderApiSection(getSettings()), '管理端点、拉取模型、设置默认模型。');
    });
  });

  const testButton = button('测试连接', 'ghost', 'check');
  testButton.addEventListener('click', async () => {
    await withWorking(`test:${endpoint.id}`, testButton, async () => {
      const models = await fetchModels(endpoint.id);
      showToast(models.length ? '连接正常啦' : '连接好像没通');
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
    showToast('已经删掉啦');
    render();
    reopenPanel('模型小管家', renderApiSection(getSettings()), '管理端点、拉取模型、设置默认模型。');
  });

  card.append(top, createSecretRow(endpoint.apiKey || ''), el('div', 'settings-item-meta', `模型：${endpoint.model || '未选择'}`));

  if (endpoint.modelList?.length) {
    const select = document.createElement('select');
    select.className = 'input-card';
    renderModelPicker(select, endpoint.modelList, endpoint.model);

    select.addEventListener('change', () => {
      const next = getSettings();
      const item = next.apiEndpoints.find((one) => one.id === endpoint.id);

      if (item) {
        item.model = select.value;
        if (next.defaultApiEndpointId === endpoint.id) next.defaultModel = select.value;
        saveSettings(next);
      }

      showToast('模型换好啦');
    });

    card.appendChild(select);
  }

  card.appendChild(wrapActions(pullButton, testButton, editButton, deleteButton));
  return card;
}

function openApiSheet(endpoint = null) {
  const isEdit = Boolean(endpoint);
  const form = sheetBase(isEdit ? '编辑 API 端点' : '新增 API 端点', '填写地址和 Key 后，点击拉取模型即可选择模型。');

  const nameInput = input('名称', endpoint?.name || '');
  const endpointInput = input('接口地址，如 https://api.openai.com', endpoint?.endpoint || '');
  const keyInput = input('API Key', endpoint?.apiKey || '');
  const modelInput = input('模型名', endpoint?.model || '');

  const modelList = Array.isArray(endpoint?.modelList) ? [...endpoint.modelList] : [];
  const modelPicker = document.createElement('select');
  modelPicker.className = 'input-card';
  renderModelPicker(modelPicker, modelList, endpoint?.model || '');
  modelPicker.addEventListener('change', () => modelInput.value = modelPicker.value);

  form.body.append(
    field('名称', nameInput),
    field('Endpoint', endpointInput),
    field('API Key', createSecretInput(keyInput)),
    field('模型名', modelInput),
    field('模型列表', modelPicker)
  );

  const pullButton = button('拉取模型', 'ghost', 'refresh');
  pullButton.addEventListener('click', async () => {
    await pullModelsForSheet({ endpoint, endpointInput, keyInput, modelInput, modelList, modelPicker, buttonEl: pullButton });
  });

  const testButton = button('测试连接', 'ghost', 'check');
  testButton.addEventListener('click', async () => {
    await testEndpointForSheet({ endpoint, endpointInput, keyInput, modelInput, buttonEl: testButton });
  });

  const saveButton = button('保存', 'primary', 'check');
  saveButton.addEventListener('click', () => {
    const next = getSettings();
    const value = {
      id: endpoint?.id || generateId(),
      name: nameInput.value.trim() || '默认端点',
      endpoint: endpointInput.value.trim(),
      apiKey: keyInput.value.trim(),
      model: modelInput.value.trim() || modelPicker.value || '',
      modelList: [...modelList]
    };

    if (!value.endpoint) {
      showToast('先填一下地址呀');
      return;
    }

    next.apiEndpoints = isEdit
      ? next.apiEndpoints.map((item) => item.id === endpoint.id ? value : item)
      : [...next.apiEndpoints, value];

    if (!next.defaultApiEndpointId) {
      next.defaultApiEndpointId = value.id;
      next.defaultModel = value.model;
    }

    if (next.defaultApiEndpointId === value.id) {
      next.defaultModel = value.model || next.defaultModel;
    }

    saveSettings(next);
    hideBottomSheet();
    showToast('保存好啦');
    render();
  });

  form.actions.append(pullButton, testButton, saveButton);
  showBottomSheet(form.el);
}

async function pullModelsForSheet({ endpoint, endpointInput, keyInput, modelInput, modelList, modelPicker, buttonEl }) {
  const tempId = endpoint?.id || `temp-${generateId()}`;
  const oldSettings = getSettings();
  const oldEndpoints = oldSettings.apiEndpoints.slice();

  if (!endpointInput.value.trim()) {
    showToast('先填一下地址呀');
    return;
  }

  oldSettings.apiEndpoints = [
    ...oldSettings.apiEndpoints.filter((item) => item.id !== tempId),
    {
      id: tempId,
      name: '临时端点',
      endpoint: endpointInput.value.trim(),
      apiKey: keyInput.value.trim(),
      model: modelInput.value.trim(),
      modelList: []
    }
  ];

  saveSettings(oldSettings);

  await withWorking(`sheet-models:${tempId}`, buttonEl, async () => {
    const models = await fetchModels(tempId);

    if (!models.length) {
      showToast('没有拉取到模型');
      return;
    }

    modelList.splice(0, modelList.length, ...models);
    renderModelPicker(modelPicker, modelList, modelInput.value || models[0]);
    modelInput.value = modelPicker.value;
    showToast(`拉到 ${models.length} 个模型啦`);
  });

  const restored = getSettings();
  restored.apiEndpoints = oldEndpoints;
  saveSettings(restored);
}

async function testEndpointForSheet({ endpoint, endpointInput, keyInput, modelInput, buttonEl }) {
  const tempId = endpoint?.id || `temp-${generateId()}`;
  const oldSettings = getSettings();
  const oldEndpoints = oldSettings.apiEndpoints.slice();

  if (!endpointInput.value.trim()) {
    showToast('先填一下地址呀');
    return;
  }

  oldSettings.apiEndpoints = [
    ...oldSettings.apiEndpoints.filter((item) => item.id !== tempId),
    {
      id: tempId,
      name: '临时端点',
      endpoint: endpointInput.value.trim(),
      apiKey: keyInput.value.trim(),
      model: modelInput.value.trim(),
      modelList: []
    }
  ];

  saveSettings(oldSettings);

  await withWorking(`sheet-test:${tempId}`, buttonEl, async () => {
    const models = await fetchModels(tempId);
    showToast(models.length ? '连接正常啦' : '连接好像没通');
  });

  const restored = getSettings();
  restored.apiEndpoints = oldEndpoints;
  saveSettings(restored);
}

function renderTtsSection(settings) {
  const box = el('div', 'settings-panel');

  const provider = createSegmented(
    [
      { value: 'openai', label: 'OpenAI' },
      { value: 'custom', label: '自定义' }
    ],
    settings.ttsGlobal.provider || 'openai',
    (value) => updateTts({ provider: value })
  );

  const keyInput = input('TTS API Key', settings.ttsGlobal.apiKey || '');
  const endpointInput = input('TTS 服务地址', settings.ttsGlobal.endpoint || '');
  const voiceInput = input('音色，默认 alloy', settings.ttsGlobal.voice || 'alloy');
  const modelInput = input('TTS 模型，默认 tts-1', settings.ttsGlobal.model || 'tts-1');

  const modelPicker = document.createElement('select');
  modelPicker.className = 'input-card';
  renderModelPicker(modelPicker, settings.ttsGlobal.modelList || [], settings.ttsGlobal.model || 'tts-1');

  keyInput.addEventListener('change', () => updateTts({ apiKey: keyInput.value.trim() }));
  endpointInput.addEventListener('change', () => updateTts({ endpoint: endpointInput.value.trim() }));
  voiceInput.addEventListener('change', () => updateTts({ voice: voiceInput.value.trim() || 'alloy' }));
  modelInput.addEventListener('change', () => updateTts({ model: modelInput.value.trim() || 'tts-1' }));
  modelPicker.addEventListener('change', () => {
    modelInput.value = modelPicker.value;
    updateTts({ model: modelPicker.value });
  });

  const pullButton = button('拉取 TTS 模型', 'ghost', 'refresh');
  pullButton.addEventListener('click', async () => {
    await withWorking('tts-models', pullButton, async () => {
      if (!endpointInput.value.trim()) {
        showToast('先填一下 TTS 地址呀');
        return;
      }

      const tempId = `tts-temp-${generateId()}`;
      const settingsNow = getSettings();

      settingsNow.apiEndpoints.push({
        id: tempId,
        name: 'TTS 临时端点',
        endpoint: endpointInput.value.trim(),
        apiKey: keyInput.value.trim(),
        model: modelInput.value.trim() || 'tts-1',
        modelList: []
      });

      saveSettings(settingsNow);

      const models = await fetchModels(tempId);
      const after = getSettings();
      after.apiEndpoints = after.apiEndpoints.filter((item) => item.id !== tempId);

      if (!models.length) {
        saveSettings(after);
        showToast('没有拉取到模型');
        return;
      }

      after.ttsGlobal = {
        ...after.ttsGlobal,
        apiKey: keyInput.value.trim(),
        endpoint: endpointInput.value.trim(),
        voice: voiceInput.value.trim() || 'alloy',
        model: models.includes(modelInput.value.trim()) ? modelInput.value.trim() : models[0],
        modelList: models
      };

      saveSettings(after);
      renderModelPicker(modelPicker, models, after.ttsGlobal.model);
      modelInput.value = after.ttsGlobal.model;
      showToast(`拉到 ${models.length} 个模型啦`);
    });
  });

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
      voice: next.ttsGlobal.voice || 'alloy',
      model: next.ttsGlobal.model || 'tts-1'
    });

    window.setTimeout(() => {
      currentTtsTest = null;
    }, 1200);
  });

  box.append(
    createSoftNote('TTS 模型会保存到 ttsGlobal.model。core/tts.js 读取后就会真正生效。'),
    formCard([
      customRow('服务商', provider),
      field('API Key', createSecretInput(keyInput)),
      field('Endpoint', endpointInput),
      field('Voice', voiceInput),
      field('模型名', modelInput),
      field('模型列表', modelPicker)
    ]),
    wrapActions(pullButton, testButton)
  );

  return box;
}

function updateTts(partial) {
  const next = getSettings();
  next.ttsGlobal = { ...next.ttsGlobal, ...partial };
  saveSettings(next);
}

function renderMcpSection(settings) {
  const box = el('div', 'settings-panel');
  const addButton = button('新增 MCP 服务器', 'primary', 'add');
  const list = el('div', 'settings-list');

  addButton.addEventListener('click', () => openMcpSheet());

  if (!settings.mcpServers.length) {
    list.appendChild(emptyState('还没有 MCP 服务器', '添加后可在聊天里调用工具。'));
  } else {
    settings.mcpServers.forEach((server) => list.appendChild(createMcpCard(server)));
  }

  box.append(createSoftNote('MCP 服务器必须支持浏览器 CORS。'), addButton, list);
  return box;
}

function createMcpCard(server) {
  const card = el('article', 'settings-item');
  const top = el('div', 'settings-item-top');
  const main = el('div', 'settings-item-main');

  main.append(
    el('div', 'settings-item-title', server.name || 'MCP 服务器'),
    el('div', 'settings-item-meta', server.url || '未填写地址')
  );

  const enabledSwitch = switchButton(Boolean(server.enabled), (active) => {
    const next = getSettings();
    const item = next.mcpServers.find((one) => one.id === server.id);
    if (item) item.enabled = active;

    saveSettings(next);
    resetSession(server.id);
    showToast(active ? 'MCP 已启用' : 'MCP 已停用');
    reopenPanel('工具小助手', renderMcpSection(getSettings()), '管理聊天里可以调用的小工具。');
  });

  top.append(main, enabledSwitch);

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
    showToast('已经删掉啦');
    reopenPanel('工具小助手', renderMcpSection(getSettings()), '管理聊天里可以调用的小工具。');
  });

  card.append(top, wrapActions(editButton, deleteButton));
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
      showToast('先填一下服务器地址呀');
      return;
    }

    next.mcpServers = server
      ? next.mcpServers.map((item) => item.id === server.id ? value : item)
      : [...next.mcpServers, value];

    saveSettings(next);
    resetSession(value.id);
    hideBottomSheet();
    showToast('保存好啦');
    render();
  });

  form.actions.appendChild(saveButton);
  showBottomSheet(form.el);
}

function renderNetworkProxySection() {
  const proxy = getNetworkProxy();
  const box = el('div', 'settings-panel');

  const enabledSwitch = switchButton(proxy.enabled === true, (active) => {
    const next = getNetworkProxy();
    next.enabled = active;
    next.updatedAt = getNow();
    saveNetworkProxy(next);
  });

  const typeSelect = document.createElement('select');
  typeSelect.className = 'input-card';
  ['HTTPS', 'HTTP', 'SOCKS5'].forEach((type) => {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    option.selected = proxy.type === type;
    typeSelect.appendChild(option);
  });

  const hostInput = input('127.0.0.1', proxy.host || '');
  const portInput = input('8080', proxy.port || '', 'number');
  const usernameInput = input('可选', proxy.username || '');
  const passwordInput = input('可选', proxy.password || '');
  const bypassInput = input('localhost,127.0.0.1,192.168.0.0/16,*.local', proxy.bypass || '');
  const testUrlInput = input('https://www.google.com', proxy.testUrl || 'https://www.google.com');

  const saveButton = button('保存代理配置', 'primary', 'check');
  saveButton.addEventListener('click', () => {
    saveNetworkProxy({
      enabled: enabledSwitch.classList.contains('active'),
      type: typeSelect.value || 'HTTPS',
      host: hostInput.value.trim(),
      port: portInput.value.trim(),
      username: usernameInput.value.trim(),
      password: passwordInput.value,
      bypass: bypassInput.value.trim(),
      testUrl: testUrlInput.value.trim() || 'https://www.google.com',
      updatedAt: getNow()
    });

    showToast('代理配置收好啦');
    emitDesktopRefresh();
  });

  const testButton = button('测试', 'ghost', 'refresh');
  testButton.addEventListener('click', async () => {
    const url = testUrlInput.value.trim() || 'https://www.google.com';

    await withWorking('proxy-test', testButton, async () => {
      try {
        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), 8000);

        await fetch(url, {
          method: 'GET',
          mode: 'no-cors',
          cache: 'no-store',
          signal: controller.signal
        });

        window.clearTimeout(timer);
        showToast('测试请求已发出');
      } catch (_) {
        showToast('测试请求失败');
      }
    });
  });

  box.append(
    createSoftNote('静态网页不能真正改系统代理；这里用于保存代理参数，后续可给支持代理的供应商或工具读取。'),
    formCard([
      customRow('启动代理', enabledSwitch),
      field('代理类型', typeSelect),
      field('服务器地址', hostInput),
      field('端口', portInput),
      field('用户名', usernameInput),
      field('密码', createSecretInput(passwordInput)),
      field('代理绕过', bypassInput)
    ]),
    el('div', 'settings-group-title', '连接测试'),
    formCard([
      field('测试地址', testUrlInput),
      customRow('操作', wrapActions(testButton, saveButton))
    ])
  );

  return box;
}

function getNetworkProxy() {
  const saved = getData(NETWORK_PROXY_KEY);
  return {
    ...DEFAULT_NETWORK_PROXY,
    ...(saved && typeof saved === 'object' ? saved : {})
  };
}

function saveNetworkProxy(proxy) {
  setData(NETWORK_PROXY_KEY, {
    ...DEFAULT_NETWORK_PROXY,
    ...proxy,
    enabled: Boolean(proxy.enabled),
    type: ['HTTPS', 'HTTP', 'SOCKS5'].includes(proxy.type) ? proxy.type : 'HTTPS',
    updatedAt: proxy.updatedAt || getNow()
  });
}

function getNetworkProxyMeta() {
  const proxy = getNetworkProxy();
  if (!proxy.enabled) return '未启用';
  const host = proxy.host ? `${proxy.host}${proxy.port ? `:${proxy.port}` : ''}` : '未填写';
  return `${proxy.type || 'HTTPS'} · ${host}`;
}
function renderDesktopLayoutSection() {
  const scale = getDesktopScale();
  const box = el('div', 'settings-panel');

  box.appendChild(formCard([
    field('桌面图标大小', createScaleRange(scale.iconScale, (value) => saveDesktopScale({ iconScale: value }))),
    field('小组件大小', createScaleRange(scale.widgetScale, (value) => saveDesktopScale({ widgetScale: value }))),
    field('Dock 大小', createScaleRange(scale.dockScale, (value) => saveDesktopScale({ dockScale: value })))
  ]));

  box.appendChild(createSoftNote('安卓看起来太大时，可以把它们稍微调小一点点。'));
  return box;
}

function createScaleRange(value, onInput) {
  const range = input('', value, 'range');
  range.min = '0.62';
  range.max = '1.28';
  range.step = '0.01';

  const valueEl = el('span', 'range-value', `${Math.round(value * 100)}%`);

  range.addEventListener('input', () => {
    const next = normalizeScale(range.value);
    valueEl.textContent = `${Math.round(next * 100)}%`;
    onInput(next);
  });

  return wrapInline(range, valueEl);
}

function getDesktopScale() {
  const saved = getData(DESKTOP_SCALE_KEY) || {};

  return {
    iconScale: normalizeScale(saved.iconScale, 1),
    widgetScale: normalizeScale(saved.widgetScale, 1),
    dockScale: normalizeScale(saved.dockScale, 1)
  };
}

function saveDesktopScale(patch) {
  const current = getDesktopScale();
  setData(DESKTOP_SCALE_KEY, { ...current, ...patch });
  emitDesktopRefresh();
}

function normalizeScale(value, fallback = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0.62, Math.min(1.28, number));
}

function renderDesktopWallpaperSection(settings) {
  const box = el('div', 'settings-panel');

  box.append(
    createImageSettingBlock({
      title: '桌面壁纸',
      blobKey: WALLPAPER_KEY,
      opacityKey: WALLPAPER_OPACITY_KEY,
      maxSize: 1920,
      minOpacity: 15,
      onSaved: emitDesktopRefresh
    }),
    formCard([
      customRow('时间组件', switchButton(settings.widgets.time !== false, (active) => updateWidget('time', active))),
      customRow('天气组件', switchButton(settings.widgets.weather !== false, (active) => updateWidget('weather', active))),
      customRow('纪念日组件', switchButton(settings.widgets.anniversary !== false, (active) => updateWidget('anniversary', active)))
    ])
  );

  return box;
}

function renderWidgetBackgroundSection() {
  const box = el('div', 'settings-panel');

  box.appendChild(createImageSettingBlock({
    title: '小组件区域背景',
    blobKey: WIDGET_AREA_BG_KEY,
    metaKey: WIDGET_BACKGROUNDS_KEY,
    metaId: 'area',
    maxSize: 1400,
    minOpacity: 15,
    onSaved: emitDesktopRefresh
  }));

  WIDGETS.forEach((widget) => {
    box.appendChild(createImageSettingBlock({
      title: widget.name,
      blobKey: `app_widget_bg_${widget.id}`,
      metaKey: WIDGET_BACKGROUNDS_KEY,
      metaId: widget.id,
      maxSize: 900,
      minOpacity: 15,
      onSaved: emitDesktopRefresh
    }));
  });

  return box;
}

function createImageSettingBlock({ title, blobKey, opacityKey = '', metaKey = '', metaId = '', maxSize = 1000, minOpacity = 15, onSaved }) {
  const block = el('div', 'image-setting-block');
  const preview = el('div', 'wallpaper-preview', '暂无图片');

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.className = 'hidden';

  const opacity = input('', getSavedOpacity({ opacityKey, metaKey, metaId }), 'range');
  opacity.min = String(minOpacity);
  opacity.max = '100';

  const opacityValue = el('span', 'range-value', `${opacity.value}%`);

  loadImagePreview(preview, blobKey);

  const uploadButton = button('上传图片', 'ghost', 'upload');
  uploadButton.addEventListener('click', () => fileInput.click());

  const clearButton = button('清除', 'ghost', 'clear');
  clearButton.addEventListener('click', async () => {
    await deleteDB('blobs', blobKey);

    if (opacityKey) removeData(opacityKey);
    if (metaKey && metaId) updateWidgetBgMeta(metaId, { image: '', source: '', opacity: Number(opacity.value) });

    preview.style.backgroundImage = '';
    preview.textContent = '暂无图片';

    onSaved?.();
    showToast('已经清掉啦');
  });

  opacity.addEventListener('input', () => {
    opacityValue.textContent = `${opacity.value}%`;
  });

  opacity.addEventListener('change', async () => {
    await updateBlobOpacity(blobKey, Number(opacity.value));

    if (opacityKey) setData(opacityKey, Number(opacity.value));
    if (metaKey && metaId) updateWidgetBgMeta(metaId, { opacity: Number(opacity.value) });

    const record = await getDB('blobs', blobKey);
    const image = record?.value || '';

    if (image) {
      preview.style.backgroundImage = `url("${image}")`;
      preview.textContent = '';
    }

    onSaved?.();
    showToast('透明度存好啦');
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;

    await withWorking(`image:${blobKey}`, uploadButton, async () => {
      try {
        const source = await imageFileToDataUrl(file, maxSize, 0.9);
        const value = await applyImageOpacity(source, Number(opacity.value) / 100);

        await setDB('blobs', blobKey, {
          key: blobKey,
          value,
          source,
          opacity: Number(opacity.value),
          updatedAt: getNow()
        });

        if (opacityKey) setData(opacityKey, Number(opacity.value));
        if (metaKey && metaId) updateWidgetBgMeta(metaId, { image: '', source: '', opacity: Number(opacity.value) });

        preview.style.backgroundImage = `url("${value}")`;
        preview.textContent = '';

        onSaved?.();
        showToast('图片放好啦');
      } catch (_) {
        showToast('图片好像没放成功');
      } finally {
        fileInput.value = '';
      }
    });
  });

  block.append(
    el('div', 'image-setting-title', title),
    preview,
    formCard([
      customRow('图片', wrapActions(uploadButton, clearButton, fileInput)),
      field('透明度', wrapInline(opacity, opacityValue))
    ])
  );

  return block;
}

function renderCustomWidgetSection() {
  const box = el('div', 'settings-panel');
  const addButton = button('新增小组件', 'primary', 'add');
  const list = el('div', 'settings-list');

  addButton.addEventListener('click', () => openCustomWidgetSheet());

  const widgets = getCustomWidgets();

  if (!widgets.length) {
    list.appendChild(emptyState('还没有自定义小组件', '可以自己做一个圆形、方形或长方形小卡片。'));
  } else {
    widgets.forEach((widget) => list.appendChild(createCustomWidgetCard(widget)));
  }

  box.append(createSoftNote('自定义小组件会出现在桌面，可以自由拖动位置。'), wrapActions(addButton), list);
  return box;
}

function createCustomWidgetCard(widget) {
  const card = el('article', 'settings-item');
  const top = el('div', 'settings-item-top');
  const main = el('div', 'settings-item-main');

  main.append(
    el('div', 'settings-item-title', widget.name || '自定义小组件'),
    el('div', 'settings-item-meta', `${getShapeLabel(widget.shape)} · ${widget.text || '无文字'}`)
  );

  const preview = el('div', `custom-widget-mini ${widget.shape}`);
  preview.style.opacity = String(Math.max(0.2, Math.min(1, Number(widget.opacity || 100) / 100)));

  if (widget.image) {
    preview.style.backgroundImage = `url("${widget.image}")`;
  } else {
    preview.appendChild(createIcon('star', 18));
  }

  top.append(main, preview);

  const edit = button('编辑', 'ghost', 'edit');
  edit.addEventListener('click', () => openCustomWidgetSheet(widget));

  const del = button('删除', 'ghost', 'delete');
  del.addEventListener('click', async () => {
    const ok = await showConfirm('确定删除这个小组件吗？');
    if (!ok) return;

    const next = getCustomWidgets().filter((item) => item.id !== widget.id);
    setData(CUSTOM_WIDGETS_KEY, next);

    const positions = getData('app_widget_positions') || {};
    delete positions[`custom_${widget.id}`];
    setData('app_widget_positions', positions);

    emitDesktopRefresh();
    showToast('小组件删掉啦');
    reopenPanel('自定义小组件', renderCustomWidgetSection(), '自己捏小卡片，形状、图片、文字都能换。');
  });

  card.append(top, wrapActions(edit, del));
  return card;
}

function openCustomWidgetSheet(widget = null) {
  const isEdit = Boolean(widget);
  const form = sheetBase(isEdit ? '编辑小组件' : '新增小组件', '形状、背景图、名字和文字都可以自己换。');

  const nameInput = input('名字', widget?.name || '');
  const textInput = input('显示文字', widget?.text || '');
  const shape = createSegmented(
    [
      { value: 'circle', label: '圆形' },
      { value: 'square', label: '方形' },
      { value: 'rectangle', label: '长方形' }
    ],
    widget?.shape || 'square',
    () => {}
  );

  const imageInput = document.createElement('input');
  imageInput.type = 'file';
  imageInput.accept = 'image/*';
  imageInput.className = 'hidden';

  let image = widget?.image || '';

  const preview = el('div', `custom-widget-preview ${widget?.shape || 'square'}`);
  if (image) {
    preview.style.backgroundImage = `url("${image}")`;
  } else {
    preview.appendChild(createIcon('star', 24));
  }

  shape.querySelectorAll('button').forEach((buttonEl) => {
    buttonEl.addEventListener('click', () => {
      const nextShape = buttonEl.dataset.value || 'square';
      preview.className = `custom-widget-preview ${nextShape}`;
    });
  });

  const opacity = input('', widget?.opacity ?? 100, 'range');
  opacity.min = '20';
  opacity.max = '100';
  const opacityValue = el('span', 'range-value', `${opacity.value}%`);

  opacity.addEventListener('input', () => {
    opacityValue.textContent = `${opacity.value}%`;
    preview.style.opacity = String(Math.max(0.2, Math.min(1, Number(opacity.value) / 100)));
  });

  const uploadButton = button('上传背景', 'ghost', 'upload');
  uploadButton.addEventListener('click', () => imageInput.click());

  imageInput.addEventListener('change', async () => {
    const file = imageInput.files?.[0];
    if (!file) return;

    try {
      const source = await imageFileToDataUrl(file, 800, 0.9);
      image = await applyImageOpacity(source, Number(opacity.value) / 100);
      preview.innerHTML = '';
      preview.style.backgroundImage = `url("${image}")`;
      showToast('背景图放好啦');
    } catch (_) {
      showToast('背景图没放成功');
    } finally {
      imageInput.value = '';
    }
  });

  const clearButton = button('清除背景', 'ghost', 'clear');
  clearButton.addEventListener('click', () => {
    image = '';
    preview.style.backgroundImage = '';
    preview.innerHTML = '';
    preview.appendChild(createIcon('star', 24));
  });

  const save = button('保存小组件', 'primary', 'check');
  save.addEventListener('click', () => {
    const selectedShape = getSelectedSegmentValue(shape) || widget?.shape || 'square';
    const now = getNow();
    const value = {
      id: widget?.id || generateId(),
      name: nameInput.value.trim() || '自定义小组件',
      shape: selectedShape,
      image,
      text: textInput.value.trim(),
      opacity: Math.max(20, Math.min(100, Number(opacity.value) || 100)),
      createdAt: widget?.createdAt || now,
      updatedAt: now
    };

    const widgets = getCustomWidgets();
    const next = isEdit
      ? widgets.map((item) => item.id === widget.id ? value : item)
      : [...widgets, value];

    setData(CUSTOM_WIDGETS_KEY, next);
    emitDesktopRefresh();
    hideBottomSheet();
    showToast('小组件保存好啦');
    window.setTimeout(() => openSettingsPanel('自定义小组件', renderCustomWidgetSection(), '自己捏小卡片，形状、图片、文字都能换。'), 180);
  });

  form.body.append(
    preview,
    field('名字', nameInput),
    field('显示文字', textInput),
    customRow('形状', shape),
    field('透明度', wrapInline(opacity, opacityValue)),
    customRow('背景图', wrapActions(uploadButton, clearButton, imageInput))
  );

  form.actions.appendChild(save);
  showBottomSheet(form.el);
}

function getCustomWidgets() {
  const widgets = getData(CUSTOM_WIDGETS_KEY);
  return Array.isArray(widgets) ? widgets.map(normalizeCustomWidget).filter((item) => item.id) : [];
}

function normalizeCustomWidget(widget) {
  const raw = widget && typeof widget === 'object' ? widget : {};

  return {
    id: String(raw.id || '').trim(),
    name: String(raw.name || '').trim(),
    shape: ['circle', 'square', 'rectangle'].includes(raw.shape) ? raw.shape : 'square',
    image: typeof raw.image === 'string' ? raw.image : '',
    text: typeof raw.text === 'string' ? raw.text : '',
    opacity: Math.max(20, Math.min(100, Number(raw.opacity) || 100)),
    createdAt: raw.createdAt || '',
    updatedAt: raw.updatedAt || ''
  };
}

function getShapeLabel(shape) {
  if (shape === 'circle') return '圆形';
  if (shape === 'rectangle') return '长方形';
  return '方形';
}

function getSelectedSegmentValue(segmentedEl) {
  return segmentedEl.querySelector('.segmented-option.active')?.dataset.value || '';
}

function createIconPersonal() {
  const box = el('div', 'settings-panel');

  box.appendChild(createHiddenIconsRestoreBlock());

  const rawIcons = getData(ICONS_KEY) || {};
  const icons = normalizeAllIconRecords(rawIcons);
  const hidden = getHiddenIcons();
  const list = el('div', 'settings-list');

  DESKTOP_APPS.forEach((app) => {
    const iconData = icons[app.id] || {};
    const iconImage = getIconImageValue(iconData);
    const wrap = el('div', 'icon-editor-wrap');
    const row = el('div', 'icon-editor-row');
    const art = el('div', 'settings-icon-preview');

    if (iconImage) {
      const img = document.createElement('img');
      img.src = iconImage;
      img.alt = '';
      img.style.opacity = String(getIconOpacityValue(iconData));
      art.appendChild(img);
    } else {
      art.appendChild(createIcon(app.icon, 22));
    }

    const nameInput = input('应用名', iconData.name || app.name);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.className = 'hidden';

    const uploadButton = iconButton('camera', '上传图标');
    uploadButton.addEventListener('click', () => fileInput.click());

    const clearButton = button('清除', 'ghost', 'clear');
    clearButton.addEventListener('click', async () => {
      const nextIcons = normalizeAllIconRecords(getData(ICONS_KEY) || {});
      delete nextIcons[app.id];
      setData(ICONS_KEY, nextIcons);
      emitDesktopRefresh();
      render();
      showToast('图标恢复默认啦');
    });

    const visibleSwitch = switchButton(!hidden.includes(app.id), (active) => {
      const nextHidden = getHiddenIcons().filter((id) => id !== app.id);
      if (!active) nextHidden.push(app.id);
      setData(HIDDEN_ICONS_KEY, [...new Set(nextHidden)]);
      emitDesktopRefresh();
      showToast(active ? '图标回来啦' : '图标先藏起来啦');
      render();
    });

    const opacity = input('', iconData.opacity ?? 100, 'range');
    opacity.min = '20';
    opacity.max = '100';

    const opacityValue = el('span', 'range-value', `${opacity.value}%`);

    opacity.addEventListener('input', () => {
      opacityValue.textContent = `${opacity.value}%`;
      const img = art.querySelector('img');
      if (img) img.style.opacity = String(Math.max(0.2, Math.min(1, Number(opacity.value) / 100)));
    });

    opacity.addEventListener('change', () => {
      updateIconOpacity(app, nameInput.value, Number(opacity.value));
      emitDesktopRefresh();
      showToast('透明度存好啦');
    });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;

      await withWorking(`icon:${app.id}`, uploadButton, async () => {
        try {
          const source = await compressIconImage(file, 260, 0.88);
          const nextIcons = normalizeAllIconRecords(getData(ICONS_KEY) || {});

          nextIcons[app.id] = normalizeIconRecord({
            name: nameInput.value.trim() || app.name,
            image: source,
            opacity: Number(opacity.value),
            updatedAt: getNow()
          });

          setData(ICONS_KEY, nextIcons);

          art.innerHTML = '';
          const img = document.createElement('img');
          img.src = source;
          img.alt = '';
          img.style.opacity = String(getIconOpacityValue(nextIcons[app.id]));
          art.appendChild(img);

          emitDesktopRefresh();
          showToast('图标换好啦');
        } catch (_) {
          showToast('图标好像没换成功');
        } finally {
          fileInput.value = '';
        }
      });
    });

    nameInput.addEventListener('change', () => {
      const nextIcons = normalizeAllIconRecords(getData(ICONS_KEY) || {});
      nextIcons[app.id] = normalizeIconRecord({
        ...(nextIcons[app.id] || {}),
        name: nameInput.value.trim() || app.name
      });
      setData(ICONS_KEY, nextIcons);
      emitDesktopRefresh();
      showToast('名字存好啦');
    });

    row.append(art, nameInput, uploadButton, clearButton, visibleSwitch, fileInput);

    const opacityRow = el('div', 'icon-opacity-row');
    opacityRow.append(el('span', '', '透明度'), opacity, opacityValue);

    wrap.append(row, opacityRow);
    list.appendChild(wrap);
  });

  box.appendChild(list);
  return box;
}

function compressIconImage(file, maxSize = 260, quality = 0.88) {
  if (typeof compressImage === 'function') {
    return compressImage(file, maxSize, quality);
  }

  return imageFileToDataUrl(file, maxSize, quality);
}

function normalizeAllIconRecords(rawIcons) {
  const next = {};

  if (!rawIcons || typeof rawIcons !== 'object') return next;

  Object.entries(rawIcons).forEach(([appId, record]) => {
    next[appId] = normalizeIconRecord(record);
  });

  setData(ICONS_KEY, next);
  return next;
}

function getIconOpacityValue(iconData) {
  const raw = Number(iconData?.opacity);
  if (!Number.isFinite(raw)) return 1;
  return Math.max(0.2, Math.min(1, raw > 1 ? raw / 100 : raw));
}

function getIconImageValue(iconData) {
  if (!iconData) return '';

  if (typeof iconData === 'string') return iconData;

  if (typeof iconData !== 'object') return '';

  const keys = [
    'image',
    'iconImage',
    'backgroundImage',
    'imageBase64',
    'imageSource',
    'source',
    'value',
    'data',
    'src',
    'url',
    'base64',
    'file'
  ];

  for (const key of keys) {
    const value = iconData[key];

    if (typeof value === 'string' && value.trim()) return value;

    if (value && typeof value === 'object') {
      const nested = value.value || value.src || value.url || value.base64 || value.data || value.image || value.imageBase64;
      if (typeof nested === 'string' && nested.trim()) return nested;
    }
  }

  return '';
}

function normalizeIconRecord(record) {
  const raw = record && typeof record === 'object' ? record : {};
  const image = getIconImageValue(raw);

  return {
    name: raw.name || '',
    image,
    opacity: Math.max(20, Math.min(100, Number(raw.opacity) || 100)),
    updatedAt: raw.updatedAt || getNow()
  };
}

function createHiddenIconsRestoreBlock() {
  const hidden = getHiddenIcons();
  const box = el('div', 'restore-card');

  if (!hidden.length) {
    box.appendChild(createSoftNote('没有隐藏的桌面图标。'));
    return box;
  }

  box.appendChild(el('div', 'settings-item-title', '恢复隐藏图标'));

  hidden.forEach((appId) => {
    const app = DESKTOP_APPS.find((item) => item.id === appId);
    if (!app) return;

    const row = el('div', 'restore-row');
    const left = el('div', 'restore-name');
    left.appendChild(createIcon(app.icon, 18));
    left.appendChild(el('span', '', app.name));

    const restoreButton = button('恢复', 'ghost', 'refresh');
    restoreButton.addEventListener('click', () => {
      const nextHidden = getHiddenIcons().filter((id) => id !== appId);
      setData(HIDDEN_ICONS_KEY, nextHidden);
      emitDesktopRefresh();
      showToast('图标回来啦');
      reopenPanel('应用图标', createIconPersonal(), '改名字、换图标、调透明度，也可以恢复隐藏图标。');
      render();
    });

    row.append(left, restoreButton);
    box.appendChild(row);
  });

  return box;
}

function updateIconOpacity(app, name, opacity) {
  const nextIcons = normalizeAllIconRecords(getData(ICONS_KEY) || {});
  const current = nextIcons[app.id] || {};

  nextIcons[app.id] = normalizeIconRecord({
    ...current,
    name: name.trim() || app.name,
    opacity,
    updatedAt: getNow()
  });

  setData(ICONS_KEY, nextIcons);
}
function createProfilePersonal(settings) {
  const box = el('div', 'settings-panel');
  const avatar = el('button', 'profile-avatar');
  avatar.type = 'button';

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

  const opacity = input('', settings.user.avatarOpacity ?? 100, 'range');
  opacity.min = '20';
  opacity.max = '100';

  const opacityValue = el('span', 'range-value', `${opacity.value}%`);

  opacity.addEventListener('input', () => {
    opacityValue.textContent = `${opacity.value}%`;
  });

  opacity.addEventListener('change', async () => {
    const next = getSettings();
    const source = next.user.avatarSource || next.user.avatar;

    if (!source) {
      next.user.avatarOpacity = Number(opacity.value);
      saveSettings(next);
      showToast('透明度存好啦');
      return;
    }

    next.user.avatar = await applyImageOpacity(source, Number(opacity.value) / 100);
    next.user.avatarSource = source;
    next.user.avatarOpacity = Number(opacity.value);
    saveSettings(next);

    avatar.innerHTML = '';
    const img = document.createElement('img');
    img.src = next.user.avatar;
    img.alt = '';
    avatar.appendChild(img);

    showToast('头像透明度存好啦');
  });

  avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files?.[0];
    if (!file) return;

    await withWorking('avatar', avatar, async () => {
      try {
        const source = await imageFileToDataUrl(file, 200, 0.9);
        const image = await applyImageOpacity(source, Number(opacity.value) / 100);
        const next = getSettings();

        next.user.avatar = image;
        next.user.avatarSource = source;
        next.user.avatarOpacity = Number(opacity.value);

        saveSettings(next);

        avatar.innerHTML = '';
        const img = document.createElement('img');
        img.src = image;
        img.alt = '';
        avatar.appendChild(img);

        showToast('头像换好啦');
      } catch (_) {
        showToast('头像好像没换成功');
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
    showToast('资料存好啦');
  });

  box.appendChild(formCard([
    customRow('头像', wrapActions(avatar, avatarInput)),
    field('头像透明度', wrapInline(opacity, opacityValue)),
    field('昵称', name)
  ]));

  return box;
}

function renderDataSection() {
  const box = el('div', 'settings-panel');

  const usageCard = el('div', 'settings-item');
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

  const storesCard = el('div', 'settings-item');
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

      await withWorking('import-data', null, async () => {
        await importAllData(JSON.parse(await file.text()));
      });

      showToast('导入好啦');
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
    showToast('已经收拾干净啦');
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
    showToast('已经收拾干净啦');
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
    if (list.length) counts.push(`${store} ${list.length}`);
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
      if (value !== null) data.localStorage[key] = value;
    });

    for (const store of DB_STORES) {
      data.indexedDB[store] = await getAllDB(store);
    }

    downloadJson(`ai-phone-backup-${Date.now()}.json`, data);
    showToast('导出好啦');
  });
}

async function importAllData(data) {
  if (!data || typeof data !== 'object') throw new Error('invalid data');

  if (data.localStorage && typeof data.localStorage === 'object') {
    Object.entries(data.localStorage).forEach(([key, value]) => setData(key, value));
  }

  if (data.indexedDB && typeof data.indexedDB === 'object') {
    for (const store of DB_STORES) {
      const records = Array.isArray(data.indexedDB[store]) ? data.indexedDB[store] : [];

      for (const record of records) {
        const key = store === 'blobs' ? record.key : record.id;
        if (key) await setDB(store, key, record);
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

function getSavedOpacity({ opacityKey, metaKey, metaId }) {
  if (opacityKey) return getData(opacityKey) ?? 100;

  if (metaKey && metaId) {
    const meta = getData(metaKey) || {};
    return meta[metaId]?.opacity ?? 100;
  }

  return 100;
}

function updateWidgetBgMeta(id, patch) {
  const meta = getData(WIDGET_BACKGROUNDS_KEY) || {};
  meta[id] = { ...(meta[id] || {}), ...patch };
  setData(WIDGET_BACKGROUNDS_KEY, meta);
}

async function loadImagePreview(previewEl, blobKey) {
  try {
    const record = await getDB('blobs', blobKey);
    const image = record?.value || record?.data || '';

    if (image) {
      previewEl.style.backgroundImage = `url("${image}")`;
      previewEl.textContent = '';
    }
  } catch (_) {
    previewEl.textContent = '暂无图片';
  }
}

async function updateBlobOpacity(blobKey, opacity) {
  const record = await getDB('blobs', blobKey);
  const source = record?.source || record?.value || record?.data || '';

  if (!source) return;

  const value = await applyImageOpacity(source, opacity / 100);

  await setDB('blobs', blobKey, {
    ...record,
    key: blobKey,
    value,
    source,
    opacity,
    updatedAt: getNow()
  });
}

function updateWidget(key, value) {
  const next = getSettings();
  next.widgets[key] = value;
  saveSettings(next);
  emitDesktopRefresh();
}

function getMcpMeta(settings) {
  const count = settings.mcpServers.filter((item) => item.enabled).length;
  return count ? `${count} 个已启用` : '未启用';
}

function getModelMeta(settings) {
  if (!settings.apiEndpoints.length) return '未配置';
  if (settings.defaultModel) return settings.defaultModel;
  return `${settings.apiEndpoints.length} 个端点`;
}

function getThemeLabel() {
  const current = exportTheme();
  const bg = String(current['bg-primary'] || '').toLowerCase();
  return bg.includes('1a1a1a') ? '深色' : '浅色';
}

function getScaleMeta() {
  const scale = getDesktopScale();
  return `${Math.round(scale.iconScale * 100)}%`;
}

function sheetBase(titleText, descText = '') {
  const box = el('div');
  box.appendChild(el('div', 'sheet-title', titleText));

  if (descText) box.appendChild(el('div', 'sheet-description', descText));

  const body = el('div', 'settings-sheet-body');
  const actions = el('div', 'settings-actions sheet-actions');

  box.append(body, actions);

  return { el: box, body, actions };
}

function input(placeholder, value = '', type = 'text') {
  const item = document.createElement(type === 'textarea' ? 'textarea' : 'input');
  item.className = type === 'textarea' ? 'textarea-card' : 'input-card';

  if (type !== 'textarea') item.type = type;

  item.placeholder = placeholder || '';
  item.value = value ?? '';

  return item;
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

function formCard(children) {
  const card = el('div', 'form-card');
  children.forEach((child) => card.appendChild(child));
  return card;
}

function button(text, variant = 'ghost', iconName = '') {
  const item = el('button', variant === 'primary' ? 'btn-primary' : 'btn-ghost');
  item.type = 'button';

  if (iconName) item.appendChild(createIcon(iconName, 18));
  if (text) item.appendChild(el('span', '', text));

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
    item.dataset.value = option.value;
    item.classList.toggle('active', option.value === value);
    item.classList.add('segmented-option');

    item.addEventListener('pointerdown', () => item.classList.add('is-pressed'));
    item.addEventListener('pointerup', () => item.classList.remove('is-pressed'));
    item.addEventListener('pointerleave', () => item.classList.remove('is-pressed'));
    item.addEventListener('pointercancel', () => item.classList.remove('is-pressed'));

    item.addEventListener('click', () => {
      wrap.querySelectorAll('.segmented-option').forEach((node) => node.classList.remove('active'));
      item.classList.add('active');
      onChange(option.value);
    });

    wrap.appendChild(item);
  });

  return wrap;
}

function createSecretRow(secret) {
  const row = el('div', 'settings-key-row');
  const text = el('span', '', secret ? maskKey(secret) : '未填写 Key');
  const toggle = button('', 'ghost', 'eye');

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
  const wrap = el('div', 'secret-input');
  const toggle = iconButton('eye', '显示隐藏');

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

function renderModelPicker(selectEl, models, selected) {
  selectEl.innerHTML = '';

  const list = Array.isArray(models) ? models.filter(Boolean) : [];

  if (!list.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = '先拉取模型';
    selectEl.appendChild(option);
    return;
  }

  const finalList = selected && !list.includes(selected) ? [selected, ...list] : list;

  finalList.forEach((modelId) => {
    const option = document.createElement('option');
    option.value = modelId;
    option.textContent = modelId;
    option.selected = selected === modelId;
    selectEl.appendChild(option);
  });
}

function wrapActions(...items) {
  const wrap = el('div', 'settings-actions');
  items.filter(Boolean).forEach((item) => wrap.appendChild(item));
  return wrap;
}

function wrapInline(...items) {
  const wrap = el('div', 'inline-control');
  items.forEach((item) => wrap.appendChild(item));
  return wrap;
}

function createSoftNote(text) {
  return el('div', 'soft-note', text);
}

function emptyState(titleText, text) {
  const box = el('div', 'empty-state');
  box.append(el('div', 'empty-state-title', titleText), el('div', 'empty-state-text', text));
  return box;
}

function maskKey(key) {
  if (!key) return '未填写 Key';
  if (key.length <= 8) return '********';
  return `${key.slice(0, 4)}********${key.slice(-4)}`;
}

function emitDesktopRefresh() {
  window.AppEvents?.emit?.('desktop:refresh');
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
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

function imageFileToDataUrl(file, maxSize = 800, quality = 0.88) {
  return new Promise((resolve, reject) => {
    try {
      if (!file || !file.type || !file.type.startsWith('image/')) {
        reject(new Error('请选择图片文件'));
        return;
      }

      const reader = new FileReader();

      reader.onload = () => {
        const image = new Image();

        image.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));

          canvas.width = width;
          canvas.height = height;

          const context = canvas.getContext('2d');
          context.clearRect(0, 0, width, height);
          context.drawImage(image, 0, 0, width, height);

          resolve(canvas.toDataURL('image/png', quality));
        };

        image.onerror = () => reject(new Error('图片读取失败'));
        image.src = reader.result;
      };

      reader.onerror = () => reject(new Error('图片读取失败'));
      reader.readAsDataURL(file);
    } catch (error) {
      reject(error);
    }
  });
}

function applyImageOpacity(dataUrl, opacity = 1) {
  return new Promise((resolve, reject) => {
    try {
      const image = new Image();

      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, image.width);
        canvas.height = Math.max(1, image.height);

        const context = canvas.getContext('2d');
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.globalAlpha = Math.max(0, Math.min(1, Number(opacity) || 1));
        context.drawImage(image, 0, 0);

        resolve(canvas.toDataURL('image/png'));
      };

      image.onerror = () => reject(new Error('图片透明度处理失败'));
      image.src = dataUrl;
    } catch (error) {
      reject(error);
    }
  });
}

function fontFileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const name = String(file?.name || '').toLowerCase();
    const type = String(file?.type || '').toLowerCase();
    const ok = type.includes('font') || name.endsWith('.ttf') || name.endsWith('.otf') || name.endsWith('.woff') || name.endsWith('.woff2');

    if (!ok) {
      reject(new Error('invalid font'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('read font failed'));
    reader.readAsDataURL(file);
  });
}

async function applyCustomFontFromStorage() {
  try {
    const record = await getDB('blobs', CUSTOM_FONT_KEY);
    const dataUrl = record?.value || '';
    const meta = getCustomFontMeta();

    if (!dataUrl) return false;

    injectCustomFont(dataUrl, record?.type || meta?.type || '', record?.name || meta?.name || '');
    applyTheme({ 'font-main': CUSTOM_FONT_FAMILY });
    return true;
  } catch (_) {
    return false;
  }
}

function injectCustomFont(dataUrl, type = '', name = '') {
  document.getElementById(CUSTOM_FONT_STYLE_ID)?.remove();

  const style = document.createElement('style');
  style.id = CUSTOM_FONT_STYLE_ID;
  style.textContent = `
    @font-face {
      font-family: "AppCustomFont";
      src: url("${dataUrl}") format("${getFontFormat(type, name)}");
      font-display: swap;
    }
  `;

  document.head.appendChild(style);
  document.documentElement.style.setProperty('--font-main', CUSTOM_FONT_FAMILY);
}

function getFontFormat(type, name = '') {
  const normalizedType = String(type || '').toLowerCase();
  const normalizedName = String(name || '').toLowerCase();

  if (normalizedType.includes('woff2') || normalizedName.endsWith('.woff2')) return 'woff2';
  if (normalizedType.includes('woff') || normalizedName.endsWith('.woff')) return 'woff';
  if (normalizedType.includes('otf') || normalizedName.endsWith('.otf')) return 'opentype';
  return 'truetype';
}

async function saveCustomFont(file) {
  const dataUrl = await fontFileToDataUrl(file);
  const meta = {
    name: file.name || '自定义字体',
    type: file.type || '',
    updatedAt: getNow()
  };

  await setDB('blobs', CUSTOM_FONT_KEY, {
    key: CUSTOM_FONT_KEY,
    value: dataUrl,
    name: meta.name,
    type: meta.type,
    updatedAt: meta.updatedAt
  });

  setData(CUSTOM_FONT_META_KEY, meta);
  injectCustomFont(dataUrl, meta.type, meta.name);
  applyTheme({ 'font-main': CUSTOM_FONT_FAMILY });
  saveTheme();
  emitDesktopRefresh();
}

async function clearCustomFont() {
  await deleteDB('blobs', CUSTOM_FONT_KEY);
  removeData(CUSTOM_FONT_META_KEY);
  document.getElementById(CUSTOM_FONT_STYLE_ID)?.remove();
  document.documentElement.style.setProperty('--font-main', DEFAULT_FONT_FAMILY);
  applyTheme({ 'font-main': DEFAULT_FONT_FAMILY });
  saveTheme();
  emitDesktopRefresh();
}

function getCustomFontMeta() {
  const meta = getData(CUSTOM_FONT_META_KEY);
  return meta && typeof meta === 'object' ? meta : null;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);

  if (className) node.className = className;
  if (text !== undefined && text !== null && text !== '') node.textContent = String(text);

  return node;
}

function injectSettingsStyle() {
  if (document.getElementById('settings-style')) return;

  const style = document.createElement('style');
  style.id = 'settings-style';
  style.textContent = `
    .settings-app { color: var(--text-primary); }
    .settings-app .content-area { padding-bottom: calc(40px + env(safe-area-inset-bottom)); }
    .settings-nav-title { flex: 1; min-width: 0; }
    .settings-home { display: flex; flex-direction: column; gap: 26px; padding-bottom: var(--spacing-lg); }
    .settings-group { display: flex; flex-direction: column; gap: 10px; }
    .settings-group-title { padding: 0 14px; color: var(--text-secondary); font-size: 16px; font-weight: 600; line-height: 1.4; }
    .settings-list-card { overflow: hidden; border-radius: 28px; background: var(--bg-card); box-shadow: var(--shadow-sm); }
    .settings-row { width: 100%; min-height: 72px; display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 0 18px; color: var(--text-primary); background: transparent; text-align: left; transition: all 200ms ease; }
    .settings-row:active { transform: scale(0.98); }
    .settings-row + .settings-row { box-shadow: inset 0 1px 0 color-mix(in srgb, var(--bg-secondary) 55%, transparent); }
    .settings-row-icon { width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 18px; color: var(--text-primary); background: var(--surface-muted); flex: 0 0 auto; }
    .settings-row-main { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
    .settings-row-title { color: var(--text-primary); font-size: 17px; font-weight: 600; line-height: 1.35; }
    .settings-row-meta { color: var(--text-secondary); font-size: var(--font-size-small); line-height: 1.35; }
    .settings-row-right { display: flex; align-items: center; gap: 8px; min-width: 0; color: var(--text-secondary); font-size: var(--font-size-small); font-weight: 500; }
    .settings-row-value { max-width: 128px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .settings-row-arrow { color: var(--text-primary); opacity: 0.72; }
    .settings-panel-sheet,.settings-panel-sheet-body,.settings-panel,.settings-list { display: flex; flex-direction: column; gap: var(--spacing-md); }
    .settings-item,.restore-card,.image-setting-block,.font-preview-card { display: flex; flex-direction: column; gap: var(--spacing-sm); padding: var(--spacing-md); border-radius: var(--radius-lg); background: var(--bg-card); box-shadow: var(--shadow-sm); }
    .settings-item-top { display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-md); }
    .settings-item-main { flex: 1; min-width: 0; }
    .settings-item-title,.image-setting-title { color: var(--text-primary); font-size: var(--font-size-title); font-weight: 600; line-height: 1.35; }
    .settings-item-meta,.font-preview-text { margin-top: 2px; color: var(--text-secondary); font-size: var(--font-size-small); line-height: 1.5; word-break: break-word; }
    .settings-key-row { min-height: 42px; display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-sm); padding: 0 12px; border-radius: var(--radius-md); background: var(--surface-muted); color: var(--text-secondary); font-size: var(--font-size-small); }
    .settings-actions { display: flex; align-items: center; flex-wrap: wrap; gap: var(--spacing-sm); }
    .settings-field { display: block; margin-bottom: var(--spacing-md); }
    .settings-field:last-child { margin-bottom: 0; }
    .settings-sheet-body { display: flex; flex-direction: column; gap: var(--spacing-sm); }
    .sheet-actions { margin-top: var(--spacing-lg); justify-content: flex-end; }
    .soft-note { padding: 12px 14px; border-radius: var(--radius-lg); background: var(--surface-muted); color: var(--text-secondary); font-size: var(--font-size-small); line-height: 1.6; }
    .theme-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--spacing-sm); }
    .theme-card { min-height: 86px; display: flex; flex-direction: column; justify-content: flex-end; gap: 4px; padding: var(--spacing-md); border-radius: var(--radius-lg); background: var(--surface-muted); color: var(--text-primary); box-shadow: var(--shadow-sm); text-align: left; overflow: hidden; position: relative; }
    .theme-card::before { content: ""; position: absolute; top: 14px; left: 14px; width: 30px; height: 30px; border-radius: 14px; background: var(--accent-light); }
    .theme-card-title,.theme-card-desc { position: relative; z-index: 1; }
    .theme-card-title { font-weight: 600; line-height: 1.35; }
    .theme-card-desc { color: var(--text-secondary); font-size: var(--font-size-small); line-height: 1.35; }
    .theme-preview { display: flex; flex-direction: column; gap: var(--spacing-sm); padding: var(--spacing-md); border-radius: var(--radius-lg); background: var(--surface-muted); }
    .theme-preview-bubble { max-width: 78%; padding: 10px 13px; border-radius: var(--bubble-radius); box-shadow: var(--shadow-sm); font-size: var(--font-size-small); line-height: 1.6; }
    .theme-preview-bubble.ai { align-self: flex-start; background: var(--bubble-ai-bg); color: var(--bubble-ai-text); }
    .theme-preview-bubble.user { align-self: flex-end; background: var(--bubble-user-bg); color: var(--bubble-user-text); }
    .image-setting-block + .image-setting-block { margin-top: var(--spacing-md); }
    .icon-editor-wrap { display: flex; flex-direction: column; gap: var(--spacing-sm); padding: var(--spacing-sm); border-radius: var(--radius-lg); background: var(--bg-card); box-shadow: var(--shadow-sm); }
    .icon-editor-row { display: grid; grid-template-columns: 46px minmax(0, 1fr) 40px 46px; align-items: center; gap: var(--spacing-sm); }
    .icon-opacity-row { display: grid; grid-template-columns: auto minmax(0, 1fr) 44px; align-items: center; gap: var(--spacing-sm); color: var(--text-secondary); font-size: var(--font-size-small); }
    .settings-icon-preview,.profile-avatar { display: flex; align-items: center; justify-content: center; background: var(--surface-muted); color: var(--accent-dark); overflow: hidden; }
    .settings-icon-preview { width: 46px; height: 46px; border-radius: 16px; }
    .settings-icon-preview img,.profile-avatar img { width: 100%; height: 100%; object-fit: cover; }
    .profile-avatar { width: 72px; height: 72px; margin-left: auto; border-radius: 50%; box-shadow: var(--shadow-sm); }
    .wallpaper-preview { min-height: 116px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-lg); background-color: var(--surface-muted); background-size: cover; background-position: center; color: var(--text-secondary); box-shadow: var(--shadow-sm); font-size: var(--font-size-small); }
    .custom-widget-preview { width: 128px; height: 128px; display: flex; align-items: center; justify-content: center; margin: 0 auto; border-radius: 24px; background: var(--surface-muted); background-size: cover; background-position: center; color: var(--accent-dark); box-shadow: var(--shadow-sm); }
    .custom-widget-preview.circle,.custom-widget-mini.circle { border-radius: 999px; }
    .custom-widget-preview.rectangle { width: 190px; height: 104px; }
    .custom-widget-mini { width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; border-radius: 16px; background: var(--surface-muted); background-size: cover; background-position: center; color: var(--accent-dark); box-shadow: var(--shadow-sm); flex: 0 0 auto; }
    .custom-widget-mini.rectangle { width: 68px; height: 42px; }
    .restore-row { min-height: 44px; display: flex; align-items: center; justify-content: space-between; gap: var(--spacing-md); padding: 4px 0; }
    .restore-name { display: flex; align-items: center; gap: var(--spacing-sm); color: var(--text-primary); font-size: var(--font-size-base); }
    .usage-track { height: 8px; margin-top: var(--spacing-sm); overflow: hidden; border-radius: 999px; background: var(--surface-muted); }
    .usage-track span { display: block; height: 100%; border-radius: inherit; background: var(--accent); transition: var(--motion); }
    .secret-input { display: grid; grid-template-columns: minmax(0, 1fr) 40px; align-items: center; gap: var(--spacing-sm); }
    .secret-masked { -webkit-text-security: disc; }
    .inline-control { display: flex; align-items: center; gap: var(--spacing-sm); width: 100%; }
    .inline-control input,.inline-control select { flex: 1; }
    .range-value { min-width: 42px; color: var(--text-secondary); font-size: var(--font-size-small); text-align: right; }
    .settings-app button:disabled { opacity: 0.58; pointer-events: none; }
    .settings-app .is-loading { opacity: 0.72; }
    .settings-app input[type="range"] { accent-color: var(--accent); }
    .settings-app input[type="color"] { width: 52px; height: 36px; padding: 0; border-radius: var(--radius-md); background: var(--surface-muted); }
    .settings-app .segmented { display: inline-flex; gap: 8px; padding: 4px; border-radius: 999px; background: var(--surface-muted); box-shadow: var(--shadow-sm); }
    .settings-app .segmented .segmented-option { transition: all 160ms ease; }
    .settings-app .segmented .segmented-option.is-pressed,.settings-app .segmented .segmented-option:active { transform: scale(0.96); }
    @media (max-width: 420px) {
      .settings-row { grid-template-columns: 42px minmax(0, 1fr) auto; padding: 0 14px; }
      .settings-row-value { max-width: 92px; }
      .theme-grid { grid-template-columns: 1fr; }
      .icon-editor-row { grid-template-columns: 42px minmax(0, 1fr) 38px; }
      .icon-editor-row .switch { grid-column: 2 / 4; justify-self: end; }
    }
  `;

  document.head.appendChild(style);
}

// 依赖：../core/storage.js 的 getData/setData/removeData/generateId/getNow/getStorageUsage/getDB/setDB/getAllDB/deleteDB/clearStoreDB；../core/theme.js 的 applyTheme/exportTheme/importTheme/setPreset/saveTheme；../core/ui.js 的 showToast/showBottomSheet/hideBottomSheet/showConfirm/createIcon；../core/api.js 的 fetchModels；../core/mcp.js 的 resetSession；../core/tts.js 的 playTTS
