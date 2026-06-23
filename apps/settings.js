// imports:
//   from '../core/storage.js': getData, setData, removeData, generateId, getNow, getStorageUsage, getDB, setDB, getAllDB, deleteDB, clearStoreDB
//   from '../core/theme.js': getThemePresets, getCurrentTheme, setPreset, setThemeMode, applyTheme, saveTheme, exportTheme, importTheme
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
  clearStoreDB
} from '../core/storage.js';

import {
  getThemePresets,
  getCurrentTheme,
  setPreset,
  setThemeMode,
  applyTheme,
  saveTheme,
  exportTheme,
  importTheme
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
const WIDGET_BACKGROUNDS_KEY = 'app_widget_backgrounds';
const DESKTOP_SCALE_KEY = 'desktop_layout_scale';
const CUSTOM_FONT_KEY = 'app_custom_font';
const CUSTOM_FONT_META_KEY = 'app_custom_font_meta';
const NETWORK_PROXY_KEY = 'app_network_proxy';
const CUSTOM_WIDGETS_KEY = 'app_custom_widgets';
const WIDGET_POSITIONS_KEY = 'app_widget_positions';

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
  'app_theme_preset',
  'app_theme_mode',
  'app_icons',
  'app_icon_positions',
  'app_user',
  'chat_unread_counts',
  'weather_cache',
  'app_install_tip_closed',
  'app_onboarding_done',
  'app_first_open_seed',
  'app_hidden_icons',
  'app_wallpaper',
  'app_wallpaper_opacity',
  'app_widget_backgrounds',
  'desktop_layout_scale',
  'app_custom_font_meta',
  'app_network_proxy',
  'app_custom_widgets',
  'app_widget_positions'
];

const DESKTOP_APPS = [
  { id: 'chat', name: '消息' },
  { id: 'moments', name: '朋友圈' },
  { id: 'settings', name: '设置' },
  { id: 'gallery', name: '相册' },
  { id: 'characters', name: '角色' },
  { id: 'worldbook', name: '世界书' },
  { id: 'wallet', name: '钱包' },
  { id: 'shop', name: '商店' },
  { id: 'memo', name: '备忘录' },
  { id: 'anniversary', name: '纪念日' },
  { id: 'games', name: '游戏' }
];

const WIDGET_BG_TARGETS = [
  { key: 'app_widget_area_bg', name: '小组件区域' },
  { key: 'app_widget_bg_time', name: '时间小卡片' },
  { key: 'app_widget_bg_weather', name: '天气小卡片' },
  { key: 'app_widget_bg_anniversary', name: '纪念日小卡片' },
  { key: 'app_widget_bg_focus', name: '焦点小卡片' }
];

const APP_BACKGROUND_TARGETS = [
  { key: 'app_bg_settings', name: '设置背景' },
  { key: 'app_bg_chat', name: '消息背景' },
  { key: 'app_bg_characters', name: '角色背景' },
  { key: 'app_bg_moments', name: '朋友圈背景' },
  { key: 'app_bg_worldbook', name: '世界书背景' },
  { key: 'app_bg_wallet', name: '钱包背景' },
  { key: 'app_bg_shop', name: '商店背景' },
  { key: 'app_bg_memo', name: '备忘录背景' },
  { key: 'app_bg_anniversary', name: '纪念日背景' },
  { key: 'app_bg_games', name: '游戏背景' }
];

const THEME_COLOR_FIELDS = [
  { key: 'bg-primary', name: '主背景' },
  { key: 'bg-secondary', name: '浅背景' },
  { key: 'bg-card', name: '卡片背景' },
  { key: 'accent', name: '强调色' },
  { key: 'accent-light', name: '浅强调' },
  { key: 'accent-dark', name: '深强调' },
  { key: 'text-primary', name: '主要文字' },
  { key: 'text-secondary', name: '次要文字' },
  { key: 'text-hint', name: '提示文字' },
  { key: 'bubble-user-bg', name: '用户气泡' },
  { key: 'bubble-user-text', name: '用户气泡字' },
  { key: 'bubble-ai-bg', name: 'AI 气泡' },
  { key: 'bubble-ai-text', name: 'AI 气泡字' }
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

let rootEl = null;
let currentPreviewAudio = null;
let settingsStyleEl = null;
let customFontStyleEl = null;
let renderId = 0;

export async function mount(containerEl) {
  rootEl = containerEl;
  renderId += 1;
  const token = renderId;

  injectSettingsStyle();
  await restoreCustomFont();

  if (token !== renderId || !rootEl) return;

  rootEl.innerHTML = '';
  rootEl.appendChild(renderSettingsApp());
  syncFontSizeToTheme();
}

export function unmount() {
  renderId += 1;
  stopPreviewAudio();

  if (rootEl) {
    rootEl.innerHTML = '';
  }

  rootEl = null;
}

function renderSettingsApp() {
  const screen = createEl('div', 'settings-app app-screen');

  const nav = createEl('div', 'settings-nav nav-bar');
  const titleBox = createEl('div', 'settings-nav-text');
  titleBox.append(
    createEl('div', 'nav-title', '设置'),
    createEl('div', 'nav-subtitle', '把小手机调成你喜欢的样子')
  );
  nav.append(titleBox);

  const content = createEl('div', 'settings-content content-area');
  const narrow = createEl('div', 'settings-narrow content-narrow');

  narrow.append(
    renderAppearanceSection(),
    renderDisplaySection(),
    renderDesktopSection(),
    renderWidgetSection(),
    renderIconSection(),
    renderServiceSection(),
    renderDataSection(),
    renderAboutSection()
  );

  content.append(narrow);
  screen.append(nav, content);
  return screen;
}

function renderAppearanceSection() {
  const section = createSection('外观主题', '颜色、夜间模式、主题文件');
  const body = section.querySelector('.settings-section-body');
  const theme = getCurrentTheme();
  const presetName = getPresetName(theme.preset);

  body.append(createMiniCard('当前主题', `${presetName} · ${theme.mode === 'dark' ? '夜间' : '浅色'}`));

  const modeCard = createMiniCard('颜色模式', '浅色和夜间可以随时切换');
  const modeActions = createEl('div', 'settings-action-row');
  modeActions.append(
    createSmallButton('star', '浅色', () => {
      setThemeMode('light');
      showToast('浅色模式换好啦');
      rerender();
      emitDesktopRefresh();
    }),
    createSmallButton('eye', '夜间', () => {
      setThemeMode('dark');
      showToast('夜间模式换好啦');
      rerender();
      emitDesktopRefresh();
    })
  );
  modeCard.append(modeActions);
  body.append(modeCard);

  const presetCard = createMiniCard('主题预设', '点一下就换一套感觉');
  const presetGrid = createEl('div', 'settings-preset-grid');
  getThemePresets().forEach((preset) => {
    const btn = createEl('button', `settings-preset-btn ${theme.preset === preset.id ? 'active' : ''}`);
    btn.type = 'button';
    btn.append(
      createEl('span', 'settings-preset-title', preset.name),
      createEl('span', 'settings-preset-note', preset.mode === 'dark' ? '夜间' : '浅色')
    );
    btn.addEventListener('click', () => {
      setPreset(preset.id);
      showToast('主题换好啦');
      rerender();
      emitDesktopRefresh();
    });
    presetGrid.append(btn);
  });
  presetCard.append(presetGrid);
  body.append(presetCard);

  const colorCard = createMiniCard('自定义颜色', '文字、背景、气泡都能自己调');
  const colorGrid = createEl('div', 'settings-color-grid');
  THEME_COLOR_FIELDS.forEach((field) => {
    const row = createEl('label', 'settings-color-row');
    const input = createEl('input', 'settings-color-input');
    input.type = 'color';
    input.value = normalizeColor(theme.variables?.[field.key]);
    input.addEventListener('input', () => {
      applyTheme({ [field.key]: input.value });
      saveTheme();
      emitDesktopRefresh();
    });
    input.addEventListener('change', () => showToast('颜色存好啦'));
    row.append(createEl('span', 'settings-color-name', field.name), input);
    colorGrid.append(row);
  });
  colorCard.append(colorGrid);
  body.append(colorCard);

  const fileCard = createMiniCard('主题文件', '导出备份，也可以导入别人做好的主题');
  const fileActions = createEl('div', 'settings-action-row');
  fileActions.append(
    createSmallButton('upload', '导入主题', importThemeFile),
    createSmallButton('download', '导出主题', () => {
      downloadJson(`theme-${getNow().slice(0, 10)}.json`, exportTheme());
      showToast('主题文件已导出');
    })
  );
  fileCard.append(fileActions);
  body.append(fileCard);

  return section;
}

function renderDisplaySection() {
  const section = createSection('字体与显示', '字号、字体、聊天样子');
  const body = section.querySelector('.settings-section-body');
  const settings = getSettings();

  const fontSizeCard = createMiniCard('全局字号', '所有页面一起变大或变小');
  const fontRow = createEl('div', 'settings-range-row');
  const range = createEl('input', 'settings-range');
  const value = createEl('span', 'settings-range-value', String(settings.fontSize || 15));
  range.type = 'range';
  range.min = '12';
  range.max = '24';
  range.step = '1';
  range.value = String(settings.fontSize || 15);
  range.addEventListener('input', () => {
    value.textContent = range.value;
    applyTheme({ 'font-size-base': `${range.value}px` });
  });
  range.addEventListener('change', () => {
    const next = getSettings();
    next.fontSize = Number(range.value);
    saveSettings(next);
    saveTheme();
    showToast('字号调好啦');
    emitDesktopRefresh();
  });
  fontRow.append(range, value);
  fontSizeCard.append(fontRow);
  body.append(fontSizeCard);

  const fontFileCard = createMiniCard('自定义字体', '支持 ttf、otf、woff、woff2');
  const fontMeta = getData(CUSTOM_FONT_META_KEY);
  fontFileCard.append(createEl('div', 'settings-soft-text', fontMeta?.name ? `当前字体：${fontMeta.name}` : '当前使用默认字体'));
  const fontActions = createEl('div', 'settings-action-row');
  fontActions.append(
    createSmallButton('upload', '上传字体', uploadCustomFont),
    createSmallButton('delete', '清除字体', clearCustomFont)
  );
  fontFileCard.append(fontActions);
  body.append(fontFileCard);

  const bubbleCard = createMiniCard('聊天样子', '只影响消息 APP 的展示');
  const bubbleActions = createEl('div', 'settings-segment');
  bubbleActions.append(
    createSegmentButton('气泡聊天', settings.bubbleMode !== 'dialog', () => setBubbleMode('bubble')),
    createSegmentButton('对话卡片', settings.bubbleMode === 'dialog', () => setBubbleMode('dialog'))
  );
  bubbleCard.append(bubbleActions);
  body.append(bubbleCard);

  return section;
}

function renderDesktopSection() {
  const section = createSection('桌面与背景', '壁纸、桌面大小、APP 背景');
  const body = section.querySelector('.settings-section-body');

  const scale = getData(DESKTOP_SCALE_KEY) || {
    iconScale: 1,
    widgetScale: 0.92,
    dockScale: 1
  };

  const scaleCard = createMiniCard('桌面大小', '小卡片默认做窄一点，看着更轻');
  scaleCard.append(
    createScaleControl('图标大小', 'iconScale', scale),
    createScaleControl('小卡片大小', 'widgetScale', scale),
    createScaleControl('底栏大小', 'dockScale', scale)
  );
  body.append(scaleCard);

  const wallpaperCard = createMiniCard('桌面壁纸', '图片和透明度都能调');
  const wallpaperActions = createEl('div', 'settings-action-row');
  wallpaperActions.append(
    createSmallButton('upload', '上传壁纸', () => uploadImageToBlob({
      key: WALLPAPER_KEY,
      opacityKey: WALLPAPER_OPACITY_KEY,
      toast: '壁纸换好啦'
    })),
    createSmallButton('delete', '清除壁纸', async () => {
      const ok = await showConfirm('要清除桌面壁纸吗？');
      if (!ok) return;
      await deleteDB('blobs', WALLPAPER_KEY);
      removeData(WALLPAPER_KEY);
      removeData(WALLPAPER_OPACITY_KEY);
      showToast('壁纸清掉啦');
      emitDesktopRefresh();
    })
  );
  wallpaperCard.append(
    wallpaperActions,
    createOpacityControl(WALLPAPER_OPACITY_KEY, 100, async (opacity) => {
      setData(WALLPAPER_OPACITY_KEY, opacity);
      await patchBlobOpacity(WALLPAPER_KEY, opacity);
      showToast('透明度存好啦');
      emitDesktopRefresh();
    })
  );
  body.append(wallpaperCard);

  const appBgCard = createMiniCard('APP 背景', '先把入口放好，后面 APP 读它就能换背景');
  APP_BACKGROUND_TARGETS.forEach((target) => {
    appBgCard.append(createBackgroundRow(target.key, target.name, 'blobs'));
  });
  body.append(appBgCard);

  return section;
}

function renderWidgetSection() {
  const section = createSection('小组件', '小卡片背景、自定义小组件');
  const body = section.querySelector('.settings-section-body');

  const bgCard = createMiniCard('小卡片背景', '每张小卡片都能单独换背景和透明度');
  WIDGET_BG_TARGETS.forEach((target) => {
    bgCard.append(createBackgroundRow(target.key, target.name, 'config'));
  });
  body.append(bgCard);

  const widgetCard = createMiniCard('自定义小组件', '名字、形状、文字、图片都能改');
  const widgets = getData(CUSTOM_WIDGETS_KEY) || [];
  const list = createEl('div', 'settings-compact-list');

  if (!widgets.length) {
    list.append(createEl('div', 'settings-empty-line', '还没有自定义小组件'));
  }

  widgets.forEach((widget) => {
    const item = createListItem(widget.name || '未命名小组件', `${shapeName(widget.shape)} · ${widget.text || '无文字'} · ${widget.opacity ?? 92}%`);
    item.append(
      createSmallButton('edit', '编辑', () => openWidgetEditor(widget)),
      createSmallButton('delete', '删除', () => deleteWidget(widget.id))
    );
    list.append(item);
  });

  widgetCard.append(list, createSmallButton('add', '新建小组件', () => openWidgetEditor(null)));
  body.append(widgetCard);

  return section;
}

function renderIconSection() {
  const section = createSection('应用图标', '改名字、换图片、隐藏图标');
  const body = section.querySelector('.settings-section-body');

  const card = createMiniCard('桌面图标', '每个 APP 都可以单独定制，图片会同步备份到数据库');
  const icons = getData(ICONS_KEY) || {};
  const hidden = new Set(getData(HIDDEN_ICONS_KEY) || []);
  const list = createEl('div', 'settings-compact-list');

  DESKTOP_APPS.forEach((app) => {
    const custom = icons[app.id] || {};
    const image = resolveImageSource(custom);
    const item = createListItem(custom.name || app.name, hidden.has(app.id) ? '已隐藏' : image ? '已换图' : '默认图标');

    const preview = createEl('div', 'settings-icon-preview');
    if (image) {
      preview.style.backgroundImage = `url("${image}")`;
    } else {
      preview.append(createIcon(app.id === 'settings' ? 'settings' : 'star', 18));
    }

    item.prepend(preview);
    item.append(
      createSmallButton('edit', '编辑', () => openIconEditor(app)),
      createSmallButton('upload', '换图', () => uploadAppIcon(app.id)),
      createSmallButton(hidden.has(app.id) ? 'eye' : 'eye-off', hidden.has(app.id) ? '恢复' : '隐藏', () => toggleHiddenIcon(app.id))
    );
    list.append(item);
  });

  card.append(list);
  body.append(card);

  return section;
}

function renderServiceSection() {
  const section = createSection('模型与服务', 'API、声音、小助手、代理');
  const body = section.querySelector('.settings-section-body');
  const settings = getSettings();

  const apiCard = createMiniCard('模型小管家', 'OpenAI 兼容接口');
  const apiList = createEl('div', 'settings-compact-list');

  if (!settings.apiEndpoints.length) {
    apiList.append(createEl('div', 'settings-empty-line', '还没有 API 端点'));
  }

  settings.apiEndpoints.forEach((endpoint) => {
    const item = createListItem(endpoint.name || '未命名端点', endpoint.model || endpoint.endpoint || '未选择模型');
    item.append(
      createSmallButton('refresh', '模型', () => refreshModels(endpoint.id)),
      createSmallButton('check', '测试', () => testApiEndpoint(endpoint.id)),
      createSmallButton('star', '默认', () => setDefaultEndpoint(endpoint.id)),
      createSmallButton('edit', '编辑', () => openApiEditor(endpoint)),
      createSmallButton('delete', '删除', () => deleteEndpoint(endpoint.id))
    );
    apiList.append(item);
  });

  apiCard.append(apiList, createSmallButton('add', '新增端点', () => openApiEditor(null)));
  body.append(apiCard);

  const ttsCard = createMiniCard('声音小开关', 'AI 朗读用这里的配置');
  const tts = settings.ttsGlobal || {};
  ttsCard.append(
    createEl('div', 'settings-soft-text', `${tts.provider || 'openai'} · ${tts.voice || 'alloy'} · ${tts.model || 'tts-1'}`),
    createEl('div', 'settings-action-row')
  );
  ttsCard.querySelector('.settings-action-row').append(
    createSmallButton('refresh', '拉取模型', fetchTTSModels),
    createSmallButton('edit', '编辑声音', openTtsEditor),
    createSmallButton('play', '试听', testTTS)
  );
  body.append(ttsCard);

  const mcpCard = createMiniCard('工具小助手', 'MCP 服务器');
  const mcpList = createEl('div', 'settings-compact-list');

  if (!settings.mcpServers.length) {
    mcpList.append(createEl('div', 'settings-empty-line', '还没有 MCP 服务器'));
  }

  settings.mcpServers.forEach((server) => {
    const item = createListItem(server.name || '未命名服务器', server.enabled ? '已启用' : '已停用');
    item.append(
      createSmallButton(server.enabled ? 'stop' : 'play', server.enabled ? '停用' : '启用', () => toggleMcpServer(server.id)),
      createSmallButton('edit', '编辑', () => openMcpEditor(server)),
      createSmallButton('delete', '删除', () => deleteMcpServer(server.id))
    );
    mcpList.append(item);
  });

  mcpCard.append(mcpList, createSmallButton('add', '新增服务器', () => openMcpEditor(null)));
  body.append(mcpCard);

  const proxyCard = createMiniCard('网络代理', '静态网页不能接管系统代理，只保存参数');
  const proxy = getData(NETWORK_PROXY_KEY) || {};
  proxyCard.append(
    createEl('div', 'settings-soft-text', proxy.enabled ? `${proxy.type || 'HTTPS'} · ${proxy.host || '未填地址'}` : '未启用'),
    createSmallButton('settings', '编辑代理', openProxyEditor)
  );
  body.append(proxyCard);

  return section;
}

function renderDataSection() {
  const section = createSection('数据设置', '导入导出、存储、清理');
  const body = section.querySelector('.settings-section-body');

  const usageCard = createMiniCard('存储用量', '本地数据都在你浏览器里');
  const usageText = createEl('div', 'settings-soft-text', '正在读取…');
  const usageBar = createEl('div', 'settings-usage-bar');
  const usageFill = createEl('div', 'settings-usage-fill');
  usageBar.append(usageFill);
  usageCard.append(usageBar, usageText);
  body.append(usageCard);

  getStorageUsage().then((usage) => {
    usageText.textContent = `${formatBytes(usage.used)} / ${formatBytes(usage.quota)} · ${usage.percent || 0}%`;
    usageFill.style.width = `${usage.percent || 0}%`;
  });

  const countCard = createMiniCard('数据库统计', '看看各类数据有多少');
  const countList = createEl('div', 'settings-count-grid');
  DB_STORES.forEach(async (store) => {
    const item = createEl('div', 'settings-count-item');
    item.append(createEl('span', '', store), createEl('strong', '', '…'));
    countList.append(item);
    const all = await getAllDB(store);
    item.querySelector('strong').textContent = String(all.length);
  });
  countCard.append(countList);
  body.append(countCard);

  const packCard = createMiniCard('把小手机打包', '导出和导入完整备份');
  const packActions = createEl('div', 'settings-action-row');
  packActions.append(
    createSmallButton('download', '导出全部', exportAllData),
    createSmallButton('upload', '导入全部', importAllData)
  );
  packCard.append(packActions);
  body.append(packCard);

  const cleanCard = createMiniCard('轻轻清理', '保留设置，只清理内容');
  const cleanActions = createEl('div', 'settings-action-row');
  cleanActions.append(
    createSmallButton('clear', '清聊天记忆', clearChatData),
    createSmallButton('delete', '清空全部', clearAllData)
  );
  cleanCard.append(cleanActions);
  body.append(cleanCard);

  return section;
}

function renderAboutSection() {
  const section = createSection('关于', '版本和说明');
  const body = section.querySelector('.settings-section-body');

  body.append(
    createMiniCard('当前版本', 'AI 小手机 · 静态版'),
    createMiniCard('存储说明', '配置存在 localStorage，大图和聊天数据存在 IndexedDB')
  );

  return section;
}

function createSection(title, desc) {
  const section = createEl('section', 'settings-section section-card');
  const head = createEl('button', 'settings-section-head section-header');
  head.type = 'button';

  const text = createEl('div', 'settings-section-head-text');
  text.append(createEl('div', 'section-title', title), createEl('div', 'section-meta', desc));

  const arrow = createEl('span', 'settings-section-arrow');
  arrow.append(createIcon('arrow-down', 18));
  head.append(text, arrow);

  const content = createEl('div', 'settings-section-content section-content');
  const body = createEl('div', 'settings-section-body section-body');
  content.append(body);

  head.addEventListener('click', () => {
    const open = !content.classList.contains('open');
    content.classList.toggle('open', open);
    head.classList.toggle('open', open);
  });

  section.append(head, content);
  return section;
}

function createMiniCard(title, desc) {
  const card = createEl('div', 'settings-mini-card');
  card.append(createEl('div', 'settings-mini-title', title));
  if (desc) card.append(createEl('div', 'settings-mini-desc', desc));
  return card;
}

function createListItem(title, desc) {
  const item = createEl('div', 'settings-list-item');
  const text = createEl('div', 'settings-list-text');
  text.append(createEl('div', 'settings-list-title', title), createEl('div', 'settings-list-desc', desc || ''));
  item.append(text);
  return item;
}

function createSmallButton(icon, text, onClick) {
  const btn = createEl('button', 'settings-small-btn');
  btn.type = 'button';
  btn.append(createIcon(icon, 16), createEl('span', '', text));
  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick?.();
  });
  return btn;
}

function createSegmentButton(text, active, onClick) {
  const btn = createEl('button', active ? 'active' : '');
  btn.type = 'button';
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

function createScaleControl(label, key, scale) {
  const wrap = createEl('div', 'settings-control-row');
  const text = createEl('span', 'settings-control-label', label);
  const rangeWrap = createEl('div', 'settings-range-row');
  const range = createEl('input', 'settings-range');
  const value = createEl('span', 'settings-range-value', Number(scale[key] || 1).toFixed(2));

  range.type = 'range';
  range.min = '0.62';
  range.max = '1.28';
  range.step = '0.01';
  range.value = String(scale[key] || 1);

  range.addEventListener('input', () => {
    value.textContent = Number(range.value).toFixed(2);
  });

  range.addEventListener('change', () => {
    const next = getData(DESKTOP_SCALE_KEY) || {};
    next[key] = Number(range.value);
    setData(DESKTOP_SCALE_KEY, next);
    showToast('桌面大小存好啦');
    emitDesktopRefresh();
  });

  rangeWrap.append(range, value);
  wrap.append(text, rangeWrap);
  return wrap;
}

function createOpacityControl(key, fallback, onChange) {
  const wrap = createEl('div', 'settings-control-row');
  const label = createEl('span', 'settings-control-label', '透明度');
  const row = createEl('div', 'settings-range-row');
  const range = createEl('input', 'settings-range');
  const value = createEl('span', 'settings-range-value', String(getData(key) ?? fallback));

  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.step = '1';
  range.value = String(getData(key) ?? fallback);

  range.addEventListener('input', () => {
    value.textContent = range.value;
  });

  range.addEventListener('change', () => onChange?.(Number(range.value)));

  row.append(range, value);
  wrap.append(label, row);
  return wrap;
}

function createBackgroundRow(key, name, storageType) {
  const row = createEl('div', 'settings-bg-row');
  const text = createEl('div', 'settings-bg-text');
  text.append(createEl('div', 'settings-list-title', name), createEl('div', 'settings-list-desc', '上传、透明度、清除'));

  const actions = createEl('div', 'settings-bg-actions');
  actions.append(
    createSmallButton('upload', '上传', () => uploadBackground(key, storageType)),
    createSmallButton('delete', '清除', () => clearBackground(key, storageType))
  );

  const opacity = createBackgroundOpacityControl(key, storageType);

  row.append(text, opacity, actions);
  return row;
}

function createBackgroundOpacityControl(key, storageType) {
  const wrap = createEl('div', 'settings-bg-opacity');
  const range = createEl('input', 'settings-range');
  const value = createEl('span', 'settings-range-value', String(getBackgroundOpacity(key, storageType)));

  range.type = 'range';
  range.min = '0';
  range.max = '100';
  range.step = '1';
  range.value = String(getBackgroundOpacity(key, storageType));

  range.addEventListener('input', () => {
    value.textContent = range.value;
  });

  range.addEventListener('change', async () => {
    const nextOpacity = Number(range.value);

    if (storageType === 'blobs') {
      await patchBlobOpacity(key, nextOpacity);
    } else {
      const all = getData(WIDGET_BACKGROUNDS_KEY) || {};
      all[key] = {
        ...(all[key] || { key, value: '', source: '' }),
        opacity: nextOpacity,
        updatedAt: getNow()
      };
      setData(WIDGET_BACKGROUNDS_KEY, all);
    }

    showToast('透明度存好啦');
    emitDesktopRefresh();
  });

  wrap.append(range, value);
  return wrap;
}

function getBackgroundOpacity(key, storageType) {
  if (storageType === 'config') {
    const all = getData(WIDGET_BACKGROUNDS_KEY) || {};
    return Number(all[key]?.opacity ?? 100);
  }

  return 100;
}

async function openApiEditor(endpoint) {
  const current = endpoint || {
    id: generateId(),
    name: '',
    endpoint: '',
    apiKey: '',
    model: '',
    modelList: []
  };

  const sheet = createSheet('模型端点');
  const name = createInput('名称', current.name);
  const url = createInput('Endpoint', current.endpoint);
  const key = createInput('API Key', current.apiKey);
  const model = createInput('模型', current.model);

  sheet.body.append(name.wrap, url.wrap, key.wrap, model.wrap);
  sheet.actions.append(
    createSmallButton('check', '保存', () => {
      const settings = getSettings();
      const nextEndpoint = {
        id: current.id,
        name: name.input.value.trim(),
        endpoint: url.input.value.trim(),
        apiKey: key.input.value.trim(),
        model: model.input.value.trim(),
        modelList: Array.isArray(current.modelList) ? current.modelList : []
      };

      settings.apiEndpoints = [
        ...settings.apiEndpoints.filter((item) => item.id !== current.id),
        nextEndpoint
      ];

      if (!settings.defaultApiEndpointId) settings.defaultApiEndpointId = nextEndpoint.id;
      if (!settings.defaultModel && nextEndpoint.model) settings.defaultModel = nextEndpoint.model;

      saveSettings(settings);
      hideBottomSheet();
      showToast('端点保存好啦');
      rerender();
    })
  );

  showBottomSheet(sheet.root);
}

function openTtsEditor() {
  const settings = getSettings();
  const tts = settings.ttsGlobal || {};
  const sheet = createSheet('声音设置');

  const provider = createSelect('服务商', tts.provider || 'openai', [
    { value: 'openai', label: 'openai' },
    { value: 'custom', label: 'custom' }
  ]);
  const endpoint = createInput('Endpoint', tts.endpoint || '');
  const apiKey = createInput('API Key', tts.apiKey || '');
  const voice = createInput('Voice', tts.voice || 'alloy');
  const model = createInput('Model', tts.model || 'tts-1');

  sheet.body.append(provider.wrap, endpoint.wrap, apiKey.wrap, voice.wrap, model.wrap);
  sheet.actions.append(
    createSmallButton('refresh', '拉取模型', async () => {
      const list = await fetchTTSModelsFromConfig({
        endpoint: endpoint.input.value.trim(),
        apiKey: apiKey.input.value.trim()
      });

      if (!list.length) return;

      model.input.value = list[0];
      showToast('TTS 模型拉好啦');
    }),
    createSmallButton('check', '保存', () => {
      const next = getSettings();
      next.ttsGlobal = {
        provider: provider.input.value,
        endpoint: endpoint.input.value.trim(),
        apiKey: apiKey.input.value.trim(),
        voice: voice.input.value.trim() || 'alloy',
        model: model.input.value.trim() || 'tts-1',
        modelList: next.ttsGlobal?.modelList || []
      };
      saveSettings(next);
      hideBottomSheet();
      showToast('声音保存好啦');
      rerender();
    })
  );

  showBottomSheet(sheet.root);
}

function openMcpEditor(server) {
  const current = server || {
    id: generateId(),
    name: '',
    url: '',
    enabled: true
  };

  const sheet = createSheet('工具小助手');
  const name = createInput('名称', current.name);
  const url = createInput('URL', current.url);
  const enabled = createSelect('启用', current.enabled ? 'true' : 'false', [
    { value: 'true', label: '启用' },
    { value: 'false', label: '停用' }
  ]);

  sheet.body.append(name.wrap, url.wrap, enabled.wrap);
  sheet.actions.append(
    createSmallButton('check', '保存', () => {
      const settings = getSettings();
      const nextServer = {
        id: current.id,
        name: name.input.value.trim(),
        url: url.input.value.trim(),
        enabled: enabled.input.value === 'true'
      };
      settings.mcpServers = [
        ...settings.mcpServers.filter((item) => item.id !== current.id),
        nextServer
      ];
      saveSettings(settings);
      resetSession(nextServer.id);
      hideBottomSheet();
      showToast('小助手保存好啦');
      rerender();
    })
  );

  showBottomSheet(sheet.root);
}

function openProxyEditor() {
  const proxy = getData(NETWORK_PROXY_KEY) || {
    enabled: false,
    type: 'HTTPS',
    host: '',
    port: '',
    username: '',
    password: '',
    bypass: '',
    testUrl: ''
  };

  const sheet = createSheet('网络代理');
  const enabled = createSelect('启用', proxy.enabled ? 'true' : 'false', [
    { value: 'true', label: '启用' },
    { value: 'false', label: '停用' }
  ]);
  const type = createSelect('类型', proxy.type || 'HTTPS', [
    { value: 'HTTPS', label: 'HTTPS' },
    { value: 'HTTP', label: 'HTTP' },
    { value: 'SOCKS5', label: 'SOCKS5' }
  ]);
  const host = createInput('Host', proxy.host || '');
  const port = createInput('Port', proxy.port || '');
  const username = createInput('用户名', proxy.username || '');
  const password = createInput('密码', proxy.password || '');
  const bypass = createInput('绕过地址', proxy.bypass || '');
  const testUrl = createInput('测试地址', proxy.testUrl || '');

  sheet.body.append(enabled.wrap, type.wrap, host.wrap, port.wrap, username.wrap, password.wrap, bypass.wrap, testUrl.wrap);
  sheet.actions.append(
    createSmallButton('refresh', '测试', async () => {
      try {
        await fetch(testUrl.input.value.trim(), { mode: 'cors' });
        showToast('测试地址可以访问');
      } catch {
        showToast('测试地址访问失败');
      }
    }),
    createSmallButton('check', '保存', () => {
      setData(NETWORK_PROXY_KEY, {
        enabled: enabled.input.value === 'true',
        type: type.input.value,
        host: host.input.value.trim(),
        port: port.input.value.trim(),
        username: username.input.value.trim(),
        password: password.input.value.trim(),
        bypass: bypass.input.value.trim(),
        testUrl: testUrl.input.value.trim(),
        updatedAt: getNow()
      });
      hideBottomSheet();
      showToast('代理配置保存好啦');
      rerender();
    })
  );

  showBottomSheet(sheet.root);
}

function openWidgetEditor(widget) {
  const current = widget || {
    id: generateId(),
    name: '',
    shape: 'rectangle',
    image: '',
    imageSource: '',
    text: '',
    opacity: 92,
    createdAt: getNow()
  };

  const sheet = createSheet('自定义小组件');
  const name = createInput('名字', current.name);
  const text = createInput('显示文字', current.text);
  const shape = createSelect('形状', current.shape || 'rectangle', [
    { value: 'circle', label: '圆形' },
    { value: 'square', label: '方形' },
    { value: 'rectangle', label: '长方形' }
  ]);

  const opacityWrap = createEl('div', 'settings-field');
  const opacityLabel = createEl('label', 'settings-field-label', '透明度');
  const opacity = createEl('input', 'settings-range');
  opacity.type = 'range';
  opacity.min = '0';
  opacity.max = '100';
  opacity.value = String(current.opacity ?? 92);
  opacityWrap.append(opacityLabel, opacity);

  let imageValue = current.image || '';
  let imageSource = current.imageSource || '';

  sheet.body.append(name.wrap, text.wrap, shape.wrap, opacityWrap);
  sheet.actions.append(
    createSmallButton('upload', '上传背景', async () => {
      const file = await pickFile('image/*');
      if (!file) return;
      imageValue = await readFileAsDataUrl(file);
      imageSource = file.name || 'upload';
      await setDB('blobs', `custom_widget_${current.id}`, {
        key: `custom_widget_${current.id}`,
        value: imageValue,
        source: imageSource,
        opacity: Number(opacity.value),
        updatedAt: getNow()
      });
      showToast('背景图已上传');
    }),
    createSmallButton('delete', '清图', async () => {
      imageValue = '';
      imageSource = '';
      await deleteDB('blobs', `custom_widget_${current.id}`);
      showToast('背景图已清掉');
    }),
    createSmallButton('check', '保存', () => {
      const list = getData(CUSTOM_WIDGETS_KEY) || [];
      const nextWidget = {
        id: current.id,
        name: name.input.value.trim(),
        shape: shape.input.value,
        image: imageValue,
        imageSource,
        text: text.input.value.trim(),
        opacity: Number(opacity.value),
        createdAt: current.createdAt || getNow(),
        updatedAt: getNow()
      };
      setData(CUSTOM_WIDGETS_KEY, [
        ...list.filter((item) => item.id !== current.id),
        nextWidget
      ]);
      hideBottomSheet();
      showToast('小组件保存好啦');
      emitDesktopRefresh();
      rerender();
    })
  );

  showBottomSheet(sheet.root);
}

function openIconEditor(app) {
  const icons = getData(ICONS_KEY) || {};
  const current = icons[app.id] || {};
  const sheet = createSheet('编辑图标');

  const name = createInput('显示名字', current.name || app.name);
  const opacityWrap = createEl('div', 'settings-field');
  const opacityLabel = createEl('label', 'settings-field-label', '透明度');
  const opacity = createEl('input', 'settings-range');
  opacity.type = 'range';
  opacity.min = '0';
  opacity.max = '100';
  opacity.value = String(current.opacity ?? 100);
  opacityWrap.append(opacityLabel, opacity);

  sheet.body.append(name.wrap, opacityWrap);
  sheet.actions.append(
    createSmallButton('upload', '换图片', () => uploadAppIcon(app.id)),
    createSmallButton('check', '保存', () => {
      saveIcon(app.id, {
        ...current,
        name: name.input.value.trim() || app.name,
        opacity: Number(opacity.value)
      });
      hideBottomSheet();
      showToast('图标保存好啦');
      emitDesktopRefresh();
      rerender();
    })
  );

  showBottomSheet(sheet.root);
}

function createSheet(title) {
  const root = createEl('div', 'settings-sheet');
  const head = createEl('div', 'settings-sheet-title', title);
  const body = createEl('div', 'settings-sheet-body');
  const actions = createEl('div', 'settings-sheet-actions');
  root.append(head, body, actions);
  return { root, body, actions };
}

function createInput(label, value) {
  const wrap = createEl('div', 'settings-field');
  const labelEl = createEl('label', 'settings-field-label', label);
  const input = createEl('input', 'settings-input');
  input.type = 'text';
  input.value = value || '';
  wrap.append(labelEl, input);
  return { wrap, input };
}

function createSelect(label, value, options) {
  const wrap = createEl('div', 'settings-field');
  const labelEl = createEl('label', 'settings-field-label', label);
  const input = createEl('select', 'settings-input');
  options.forEach((option) => {
    const item = document.createElement('option');
    item.value = option.value;
    item.textContent = option.label;
    input.appendChild(item);
  });
  input.value = value;
  wrap.append(labelEl, input);
  return { wrap, input };
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
    apiEndpoints: Array.isArray(saved.apiEndpoints) ? saved.apiEndpoints : [],
    mcpServers: Array.isArray(saved.mcpServers) ? saved.mcpServers : []
  };
}

function saveSettings(settings) {
  setData(SETTINGS_KEY, settings);
  return settings;
}

function syncFontSizeToTheme() {
  const settings = getSettings();
  applyTheme({ 'font-size-base': `${settings.fontSize || 15}px` });
  saveTheme();
}

function setBubbleMode(mode) {
  const settings = getSettings();
  settings.bubbleMode = mode === 'dialog' ? 'dialog' : 'bubble';
  saveSettings(settings);
  showToast('聊天样子换好啦');
  emitDesktopRefresh();
  rerender();
}

async function refreshModels(endpointId) {
  const models = await fetchModels(endpointId);
  if (!models.length) return;

  const settings = getSettings();
  settings.apiEndpoints = settings.apiEndpoints.map((endpoint) => {
    if (endpoint.id !== endpointId) return endpoint;
    return {
      ...endpoint,
      modelList: models,
      model: endpoint.model || models[0]
    };
  });

  const target = settings.apiEndpoints.find((endpoint) => endpoint.id === endpointId);
  if (settings.defaultApiEndpointId === endpointId && target?.model) {
    settings.defaultModel = target.model;
  }

  saveSettings(settings);
  showToast('模型列表拉好啦');
  rerender();
}

async function testApiEndpoint(endpointId) {
  const models = await fetchModels(endpointId);
  if (models.length) {
    showToast('连接成功');
  } else {
    showToast('连接失败，请检查配置');
  }
}

function setDefaultEndpoint(endpointId) {
  const settings = getSettings();
  const endpoint = settings.apiEndpoints.find((item) => item.id === endpointId);
  settings.defaultApiEndpointId = endpointId;
  settings.defaultModel = endpoint?.model || settings.defaultModel || '';
  saveSettings(settings);
  showToast('默认模型已设好');
  rerender();
}

async function deleteEndpoint(endpointId) {
  const ok = await showConfirm('要删除这个端点吗？');
  if (!ok) return;

  const settings = getSettings();
  settings.apiEndpoints = settings.apiEndpoints.filter((item) => item.id !== endpointId);

  if (settings.defaultApiEndpointId === endpointId) {
    settings.defaultApiEndpointId = settings.apiEndpoints[0]?.id || '';
    settings.defaultModel = settings.apiEndpoints[0]?.model || '';
  }

  saveSettings(settings);
  showToast('端点删除啦');
  rerender();
}

async function fetchTTSModels() {
  const settings = getSettings();
  const models = await fetchTTSModelsFromConfig(settings.ttsGlobal || {});
  if (!models.length) return;

  settings.ttsGlobal.modelList = models;
  settings.ttsGlobal.model = settings.ttsGlobal.model || models[0];
  saveSettings(settings);
  showToast('TTS 模型拉好啦');
  rerender();
}

async function fetchTTSModelsFromConfig(config) {
  try {
    const endpoint = normalizeEndpoint(config.endpoint || '');
    if (!endpoint) {
      showToast('请先填写 TTS 地址');
      return [];
    }

    const response = await fetch(`${endpoint}/v1/models`, {
      headers: config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}
    });

    if (!response.ok) {
      showToast('TTS 模型拉取失败');
      return [];
    }

    const data = await response.json();
    return (data.data || []).map((item) => item.id).filter(Boolean);
  } catch {
    showToast('TTS 模型拉取失败');
    return [];
  }
}

function testTTS() {
  stopPreviewAudio();
  currentPreviewAudio = playTTS('你好呀，声音设置可以用啦。', getSettings().ttsGlobal);
  showToast('开始试听');
}

function stopPreviewAudio() {
  if (currentPreviewAudio?.stop) currentPreviewAudio.stop();
  currentPreviewAudio = null;
}

function toggleMcpServer(serverId) {
  const settings = getSettings();
  settings.mcpServers = settings.mcpServers.map((server) => {
    if (server.id !== serverId) return server;
    return {
      ...server,
      enabled: !server.enabled
    };
  });
  saveSettings(settings);
  resetSession(serverId);
  showToast('小助手状态已切好');
  rerender();
}

async function deleteMcpServer(serverId) {
  const ok = await showConfirm('要删除这个 MCP 服务器吗？');
  if (!ok) return;

  const settings = getSettings();
  settings.mcpServers = settings.mcpServers.filter((server) => server.id !== serverId);
  saveSettings(settings);
  resetSession(serverId);
  showToast('服务器删除啦');
  rerender();
}

async function importThemeFile() {
  const file = await pickFile('application/json');
  if (!file) return;

  try {
    const text = await readFileAsText(file);
    importTheme(text);
    showToast('主题导入成功');
    emitDesktopRefresh();
    rerender();
  } catch {
    showToast('主题导入失败');
  }
}

async function uploadCustomFont() {
  const file = await pickFile('.ttf,.otf,.woff,.woff2');
  if (!file) return;

  const allow = ['ttf', 'otf', 'woff', 'woff2'];
  const ext = file.name.split('.').pop()?.toLowerCase();

  if (!allow.includes(ext)) {
    showToast('字体格式不支持');
    return;
  }

  const dataUrl = await readFileAsDataUrl(file);
  await setDB('blobs', CUSTOM_FONT_KEY, {
    key: CUSTOM_FONT_KEY,
    value: dataUrl,
    name: file.name,
    type: file.type || ext,
    updatedAt: getNow()
  });

  setData(CUSTOM_FONT_META_KEY, {
    name: file.name,
    type: file.type || ext,
    format: ext,
    updatedAt: getNow()
  });

  injectCustomFont(dataUrl, ext);
  applyTheme({
    'font-main': '"AppCustomFont", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  });
  saveTheme();
  showToast('字体换好啦');
  emitDesktopRefresh();
  rerender();
}

async function clearCustomFont() {
  const ok = await showConfirm('要恢复默认字体吗？');
  if (!ok) return;

  await deleteDB('blobs', CUSTOM_FONT_KEY);
  removeData(CUSTOM_FONT_META_KEY);

  if (customFontStyleEl) {
    customFontStyleEl.remove();
    customFontStyleEl = null;
  }

  applyTheme({
    'font-main': "'PingFang SC', 'Microsoft YaHei', sans-serif"
  });
  saveTheme();
  showToast('字体已恢复');
  emitDesktopRefresh();
  rerender();
}

async function restoreCustomFont() {
  const meta = getData(CUSTOM_FONT_META_KEY);
  if (!meta) return;

  const record = await getDB('blobs', CUSTOM_FONT_KEY);
  if (!record?.value) return;

  injectCustomFont(record.value, meta.format || 'woff2');
  applyTheme({
    'font-main': '"AppCustomFont", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  });
}

function injectCustomFont(dataUrl, format) {
  if (customFontStyleEl) customFontStyleEl.remove();

  customFontStyleEl = document.createElement('style');
  customFontStyleEl.textContent = `
    @font-face {
      font-family: "AppCustomFont";
      src: url("${dataUrl}") format("${format}");
      font-display: swap;
    }
  `;
  document.head.appendChild(customFontStyleEl);
}

async function uploadImageToBlob({ key, opacityKey, toast }) {
  const file = await pickFile('image/*');
  if (!file) return;

  const dataUrl = await readFileAsDataUrl(file);
  const opacity = Number(getData(opacityKey) ?? 100);

  await setDB('blobs', key, {
    key,
    value: dataUrl,
    source: file.name || 'upload',
    opacity,
    updatedAt: getNow()
  });

  setData(opacityKey, opacity);
  showToast(toast || '图片保存好啦');
  emitDesktopRefresh();
}

async function uploadBackground(key, storageType) {
  const file = await pickFile('image/*');
  if (!file) return;

  const dataUrl = await readFileAsDataUrl(file);

  if (storageType === 'blobs') {
    await setDB('blobs', key, {
      key,
      value: dataUrl,
      source: file.name || 'upload',
      opacity: 100,
      updatedAt: getNow()
    });
  } else {
    const all = getData(WIDGET_BACKGROUNDS_KEY) || {};
    all[key] = {
      key,
      value: dataUrl,
      source: file.name || 'upload',
      opacity: Number(all[key]?.opacity ?? 100),
      updatedAt: getNow()
    };
    setData(WIDGET_BACKGROUNDS_KEY, all);
  }

  showToast('背景保存好啦');
  emitDesktopRefresh();
  rerender();
}

async function clearBackground(key, storageType) {
  const ok = await showConfirm('要清掉这个背景吗？');
  if (!ok) return;

  if (storageType === 'blobs') {
    await deleteDB('blobs', key);
  } else {
    const all = getData(WIDGET_BACKGROUNDS_KEY) || {};
    delete all[key];
    setData(WIDGET_BACKGROUNDS_KEY, all);
  }

  showToast('背景清掉啦');
  emitDesktopRefresh();
  rerender();
}

async function patchBlobOpacity(key, opacity) {
  const record = await getDB('blobs', key);
  if (!record) return;

  await setDB('blobs', key, {
    ...record,
    opacity,
    updatedAt: getNow()
  });
}

async function uploadAppIcon(appId) {
  const file = await pickFile('image/*');
  if (!file) return;

  const dataUrl = await readFileAsDataUrl(file);
  const current = (getData(ICONS_KEY) || {})[appId] || {};
  const blobKey = `app_icon_${appId}`;

  await setDB('blobs', blobKey, {
    key: blobKey,
    value: dataUrl,
    source: file.name || 'upload',
    opacity: Number(current.opacity ?? 100),
    updatedAt: getNow()
  });

  saveIcon(appId, {
    ...current,
    image: dataUrl,
    iconImage: dataUrl,
    backgroundImage: dataUrl,
    imageBase64: dataUrl,
    imageSource: file.name || 'upload',
    blobKey,
    opacity: Number(current.opacity ?? 100)
  });

  showToast('图标换好啦');
  emitDesktopRefresh();
  rerender();
}

function saveIcon(appId, record) {
  const icons = getData(ICONS_KEY) || {};
  const image = resolveImageSource(record);

  icons[appId] = {
    name: record.name || '',
    image,
    iconImage: image,
    backgroundImage: image,
    imageBase64: image,
    imageSource: record.imageSource || record.source || '',
    blobKey: record.blobKey || `app_icon_${appId}`,
    opacity: Number(record.opacity ?? 100),
    updatedAt: getNow()
  };

  setData(ICONS_KEY, icons);
}

function toggleHiddenIcon(appId) {
  const hidden = new Set(getData(HIDDEN_ICONS_KEY) || []);
  if (hidden.has(appId)) {
    hidden.delete(appId);
    showToast('图标恢复啦');
  } else {
    hidden.add(appId);
    showToast('图标藏起来啦');
  }
  setData(HIDDEN_ICONS_KEY, [...hidden]);
  emitDesktopRefresh();
  rerender();
}

async function deleteWidget(widgetId) {
  const ok = await showConfirm('要删除这个小组件吗？');
  if (!ok) return;

  const widgets = getData(CUSTOM_WIDGETS_KEY) || [];
  setData(CUSTOM_WIDGETS_KEY, widgets.filter((widget) => widget.id !== widgetId));

  const positions = getData(WIDGET_POSITIONS_KEY) || {};
  delete positions[`custom_${widgetId}`];
  setData(WIDGET_POSITIONS_KEY, positions);

  await deleteDB('blobs', `custom_widget_${widgetId}`);

  showToast('小组件删除啦');
  emitDesktopRefresh();
  rerender();
}

async function exportAllData() {
  const data = {
    localStorage: {},
    indexedDB: {}
  };

  LOCAL_KEYS.forEach((key) => {
    data.localStorage[key] = getData(key);
  });

  for (const store of DB_STORES) {
    data.indexedDB[store] = await getAllDB(store);
  }

  downloadJson(`ai-phone-backup-${getNow().slice(0, 10)}.json`, data);
  showToast('备份导出啦');
}

async function importAllData() {
  const file = await pickFile('application/json');
  if (!file) return;

  const ok = await showConfirm('导入会覆盖同名数据，要继续吗？');
  if (!ok) return;

  try {
    const text = await readFileAsText(file);
    const data = JSON.parse(text);

    Object.entries(data.localStorage || data || {}).forEach(([key, value]) => {
      if (!key.startsWith('indexedDB')) setData(key, value);
    });

    if (data.indexedDB) {
      for (const store of DB_STORES) {
        if (!Array.isArray(data.indexedDB[store])) continue;
        await clearStoreDB(store);
        for (const item of data.indexedDB[store]) {
          await setDB(store, item.key || item.id, item);
        }
      }
    }

    showToast('数据导入完成');
    emitDesktopRefresh();
    rerender();
  } catch {
    showToast('导入失败');
  }
}

async function clearChatData() {
  const ok = await showConfirm('只清空聊天和记忆，角色会保留，可以吗？');
  if (!ok) return;

  await clearStoreDB('messages');
  await clearStoreDB('group_messages');
  await clearStoreDB('memories');
  removeData('chat_unread_counts');

  showToast('聊天和记忆清好啦');
  emitDesktopRefresh();
}

async function clearAllData() {
  const ok = await showConfirm('这会清空所有数据，真的继续吗？');
  if (!ok) return;

  LOCAL_KEYS.forEach(removeData);

  for (const store of DB_STORES) {
    await clearStoreDB(store);
  }

  showToast('所有数据已清空');
  emitDesktopRefresh();
  rerender();
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] || null), { once: true });
    input.click();
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
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
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resolveImageSource(custom) {
  if (!custom) return '';
  if (typeof custom === 'string') return custom;

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
    const value = custom[key];
    if (typeof value === 'string' && value) return value;
    if (value && typeof value === 'object') {
      const nested = resolveImageSource(value);
      if (nested) return nested;
    }
  }

  return '';
}

function getPresetName(presetId) {
  const preset = getThemePresets().find((item) => item.id === presetId);
  return preset?.name || presetId || '默认主题';
}

function normalizeColor(value) {
  const text = String(value || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text;
  if (/^#[0-9a-fA-F]{3}$/.test(text)) return text;
  return getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim() || '#ffffff';
}

function shapeName(shape) {
  if (shape === 'circle') return '圆形';
  if (shape === 'square') return '方形';
  return '长方形';
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function normalizeEndpoint(endpoint) {
  return String(endpoint || '').trim().replace(/\/+$/, '').replace(/\/v1\/?$/, '');
}

function emitDesktopRefresh() {
  window.AppEvents?.emit?.('desktop:refresh');
}

function rerender() {
  if (!rootEl) return;
  mount(rootEl);
}

function createEl(tagName, className = '', textContent = '') {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (textContent !== '') node.textContent = textContent;
  return node;
}

function injectSettingsStyle() {
  if (settingsStyleEl) return;

  settingsStyleEl = document.createElement('style');
  settingsStyleEl.dataset.settingsStyle = 'true';
  settingsStyleEl.textContent = `
    .settings-app { background: var(--bg-primary); color: var(--text-primary); }
    .settings-nav { background: var(--surface-glass); }
    .settings-nav-text { min-width: 0; flex: 1; }
    .settings-content { padding-left: 20px; padding-right: 20px; background: transparent; }
    .settings-narrow { max-width: 430px; display: flex; flex-direction: column; gap: 14px; padding-bottom: 32px; margin: 0 auto; }
    .settings-section { overflow: hidden; background: var(--bg-card); border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); }
    .settings-section-head { min-height: 64px; padding: 0 18px; background: transparent; }
    .settings-section-head-text { min-width: 0; text-align: left; }
    .settings-section-arrow { flex: 0 0 auto; color: var(--text-secondary); transition: var(--motion); }
    .settings-section-head.open .settings-section-arrow { transform: rotate(180deg); }
    .settings-section-content.open { max-height: 78vh; overflow-y: auto; }
    .settings-section-body { display: flex; flex-direction: column; gap: 12px; padding: 0 12px 14px; }
    .settings-mini-card { width: 100%; padding: 14px; border-radius: var(--radius-md); background: var(--surface-muted); color: var(--text-primary); box-shadow: none; }
    .settings-mini-title { font-size: var(--font-size-title); font-weight: 600; line-height: 1.35; color: var(--text-primary); }
    .settings-mini-desc, .settings-soft-text, .settings-list-desc, .settings-empty-line { margin-top: 3px; color: var(--text-secondary); font-size: var(--font-size-small); line-height: 1.55; }
    .settings-action-row, .settings-sheet-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
    .settings-small-btn { min-height: 36px; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 11px; border-radius: 14px; background: var(--bg-card); color: var(--text-primary); box-shadow: var(--shadow-sm); font-size: var(--font-size-small); transition: var(--motion); }
    .settings-small-btn:active { transform: scale(var(--press-scale)); }
    .settings-preset-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
    .settings-preset-btn { min-height: 58px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 3px; padding: 10px 12px; border-radius: 16px; background: var(--bg-card); color: var(--text-primary); box-shadow: var(--shadow-sm); text-align: left; transition: var(--motion); }
    .settings-preset-btn.active { background: var(--accent-light); color: var(--accent-dark); }
    .settings-preset-title { font-size: var(--font-size-small); font-weight: 600; line-height: 1.35; }
    .settings-preset-note { color: var(--text-secondary); font-size: 12px; line-height: 1.35; }
    .settings-color-grid { display: grid; grid-template-columns: 1fr; gap: 8px; margin-top: 12px; }
    .settings-color-row, .settings-control-row, .settings-bg-row { min-height: 46px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border-radius: 14px; background: var(--bg-card); box-shadow: var(--shadow-sm); }
    .settings-color-name, .settings-control-label, .settings-list-title { min-width: 0; color: var(--text-primary); font-size: var(--font-size-small); font-weight: 600; line-height: 1.4; }
    .settings-color-input { width: 38px; height: 30px; flex: 0 0 38px; padding: 0; border-radius: 12px; background: transparent; overflow: hidden; }
    .settings-range-row { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; }
    .settings-range { flex: 1; min-width: 0; accent-color: var(--accent); }
    .settings-range-value { min-width: 34px; color: var(--text-secondary); font-size: var(--font-size-small); text-align: right; }
    .settings-segment { display: flex; gap: 6px; margin-top: 12px; padding: 5px; border-radius: 16px; background: var(--bg-card); box-shadow: var(--shadow-sm); }
    .settings-segment button { flex: 1; min-height: 34px; border-radius: 12px; color: var(--text-secondary); font-size: var(--font-size-small); transition: var(--motion); }
    .settings-segment button.active { background: var(--accent-light); color: var(--accent-dark); }
    .settings-compact-list { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
    .settings-list-item { min-height: 54px; display: flex; align-items: center; gap: 8px; padding: 9px; border-radius: 16px; background: var(--bg-card); box-shadow: var(--shadow-sm); }
    .settings-list-text { flex: 1; min-width: 0; }
    .settings-list-title, .settings-list-desc { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .settings-icon-preview { width: 34px; height: 34px; flex: 0 0 34px; display: flex; align-items: center; justify-content: center; border-radius: 12px; background: var(--surface-muted); color: var(--text-secondary); background-size: cover; background-position: center; }
    .settings-bg-row { align-items: flex-start; margin-top: 8px; }
    .settings-bg-text { flex: 1; min-width: 0; }
    .settings-bg-actions { flex: 0 0 auto; display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
    .settings-bg-opacity { width: 92px; flex: 0 0 92px; display: flex; align-items: center; gap: 6px; }
    .settings-bg-opacity .settings-range-value { min-width: 24px; }
    .settings-count-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
    .settings-count-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 38px; padding: 8px 10px; border-radius: 14px; background: var(--bg-card); box-shadow: var(--shadow-sm); color: var(--text-secondary); font-size: 12px; }
    .settings-count-item strong { color: var(--text-primary); font-weight: 600; }
    .settings-usage-bar { height: 8px; margin-top: 12px; overflow: hidden; border-radius: 999px; background: var(--bg-secondary); }
    .settings-usage-fill { width: 0; height: 100%; border-radius: inherit; background: var(--accent); transition: var(--motion); }
    .settings-sheet { width: min(100%, 430px); margin: 0 auto; color: var(--text-primary); }
    .settings-sheet-title { margin: 0 0 14px; color: var(--text-primary); font-size: 20px; font-weight: 600; line-height: 1.35; }
    .settings-sheet-body { display: flex; flex-direction: column; gap: 10px; }
    .settings-field { display: flex; flex-direction: column; gap: 7px; }
    .settings-field-label { color: var(--text-secondary); font-size: var(--font-size-small); line-height: 1.4; }
    .settings-input { width: 100%; min-height: 44px; padding: 10px 12px; border-radius: 16px; background: var(--surface-muted); color: var(--text-primary); font-size: 16px; }
    .settings-input::placeholder { color: var(--text-hint); }
    @media (min-width: 720px) { .settings-narrow { max-width: 460px; } }
  `;
  document.head.appendChild(settingsStyleEl);
}

// 依赖：../core/storage.js(getData,setData,removeData,generateId,getNow,getStorageUsage,getDB,setDB,getAllDB,deleteDB,clearStoreDB)；../core/theme.js(getThemePresets,getCurrentTheme,setPreset,setThemeMode,applyTheme,saveTheme,exportTheme,importTheme)；../core/ui.js(showToast,showBottomSheet,hideBottomSheet,showConfirm,createIcon)；../core/api.js(fetchModels)；../core/mcp.js(resetSession)；../core/tts.js(playTTS)
