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

import { showToast, showBottomSheet, hideBottomSheet, showConfirm, createIcon } from '../core/ui.js';
import { fetchModels } from '../core/api.js';
import { resetSession } from '../core/mcp.js';
import { playTTS } from '../core/tts.js';

const SETTINGS_KEY = 'app_settings';
const CLOUD_KEY = 'app_cloud_server';
const ICONS_KEY = 'app_icons';
const HIDDEN_ICONS_KEY = 'app_hidden_icons';
const WALLPAPER_KEY = 'app_wallpaper';
const WALLPAPER_OPACITY_KEY = 'app_wallpaper_opacity';
const WIDGET_BACKGROUNDS_KEY = 'app_widget_backgrounds';
const DESKTOP_SCALE_KEY = 'desktop_layout_scale';
const CUSTOM_FONT_KEY = 'app_custom_font';
const CUSTOM_FONT_META_KEY = 'app_custom_font_meta';
const CUSTOM_WIDGETS_KEY = 'app_custom_widgets';

const DB_STORES = ['characters', 'messages', 'moments', 'memories', 'stickers', 'worldbook', 'inventory', 'pet', 'groups', 'group_messages', 'blobs'];

const DEFAULT_SETTINGS = {
  defaultApiEndpointId: '',
  defaultModel: '',
  ttsGlobal: { provider: 'openai', apiKey: '', endpoint: '', voice: 'alloy', model: 'tts-1', modelList: [] },
  mcpServers: [],
  bubbleMode: 'bubble',
  fontSize: 15,
  user: { name: '', avatar: '', avatarSource: '', avatarOpacity: 100 },
  widgets: { time: true, weather: true, anniversary: true },
  apiEndpoints: []
};

const DEFAULT_CLOUD = { enabled: false, endpoint: '', apiKey: '', status: 'unknown', lastTestAt: '', updatedAt: '' };

const THEME_COLOR_FIELDS = [
  ['bg-primary', '主背景'],
  ['bg-secondary', '浅背景'],
  ['bg-card', '卡片背景'],
  ['accent', '强调色'],
  ['accent-light', '浅强调'],
  ['accent-dark', '深强调'],
  ['text-primary', '主要文字'],
  ['text-secondary', '次要文字'],
  ['text-hint', '提示文字'],
  ['bubble-user-bg', '用户气泡'],
  ['bubble-user-text', '用户气泡字'],
  ['bubble-ai-bg', 'AI 气泡'],
  ['bubble-ai-text', 'AI 气泡字']
];

const APP_LIST = [
  ['chat', '消息'],
  ['moments', '朋友圈'],
  ['settings', '设置'],
  ['gallery', '相册'],
  ['characters', '角色'],
  ['worldbook', '世界书'],
  ['wallet', '钱包'],
  ['shop', '商店'],
  ['memo', '备忘录'],
  ['anniversary', '纪念日'],
  ['games', '游戏']
];

const WIDGET_BG_LIST = [
  ['app_widget_area_bg', '小组件区域'],
  ['app_widget_bg_time', '时间小卡片'],
  ['app_widget_bg_weather', '天气小卡片'],
  ['app_widget_bg_anniversary', '纪念日小卡片'],
  ['app_widget_bg_focus', '焦点小卡片']
];

let rootEl = null;
let route = 'home';
let styleEl = null;
let ttsPreview = null;
let customFontStyleEl = null;

export async function mount(containerEl) {
  rootEl = containerEl;
  injectStyle();
  await restoreCustomFont();
  render('home');
}

export function unmount() {
  stopTTS();
  if (rootEl) {
    rootEl.innerHTML = '';
    rootEl.classList.remove('settings-app-shell');
  }
  rootEl = null;
}

function render(nextRoute = route) {
  route = nextRoute;
  if (!rootEl) return;

  rootEl.innerHTML = '';
  rootEl.classList.add('has-app');
  rootEl.classList.add('settings-app-shell');

  const screen = el('section', 'settings-app app-screen');
  screen.append(renderHeader(), renderBody());
  rootEl.append(screen);
}

function renderHeader() {
  const nav = el('div', 'settings-nav nav-bar');
  const back = makeButton('settings-nav-btn', route === 'home' ? '返回桌面' : '返回设置', 'back', () => {
    if (route === 'home') closeDesktop();
    else render('home');
  });

  const text = el('div', 'settings-nav-titlebox');
  text.append(el('div', 'nav-title', getTitle(route)), el('div', 'nav-subtitle', getSubtitle(route)));
  nav.append(back, text);
  return nav;
}

function renderBody() {
  const body = el('div', 'settings-content content-area');
  const narrow = el('div', 'settings-narrow content-narrow');

  const pages = {
    home: renderHome,
    theme: renderThemePage,
    display: renderDisplayPage,
    api: renderApiPage,
    tts: renderTtsPage,
    mcp: renderMcpPage,
    cloud: renderCloudPage,
    desktop: renderDesktopPage,
    widgets: renderWidgetsPage,
    icons: renderIconsPage,
    data: renderDataPage
  };

  narrow.append((pages[route] || renderHome)());
  body.append(narrow);
  return body;
}

function renderHome() {
  const wrap = page();
  wrap.append(
    hero('设置小窝', '慢慢调成你喜欢的样子 ˶>ᗜ<˶'),
    group('常用小开关', [
      navItem('star', '外观主题', '颜色、夜间、主题文件都在这里', 'theme'),
      navItem('edit', '字体与显示', '字号、字体、聊天样子轻轻调', 'display')
    ]),
    group('模型与服务', [
      navItem('settings', 'API 小管家', '模型接口、Key、默认模型', 'api'),
      navItem('play', 'TTS 声音屋', 'AI 说话的声音住这里', 'tts'),
      navItem('settings', 'MCP 工具箱', '给 AI 接小工具用', 'mcp'),
      navItem('upload', '云服务器', '默认关闭，主动开启才使用', 'cloud')
    ]),
    group('桌面装扮', [
      navItem('image', '壁纸背景', '桌面缩放、壁纸、背景图', 'desktop'),
      navItem('copy', '小组件', '小卡片和自定义组件', 'widgets'),
      navItem('star', '应用图标', '改名、换图、隐藏都可以', 'icons')
    ]),
    group('数据小包', [
      navItem('download', '导出 / 导入', '备份、恢复、清理数据', 'data')
    ])
  );
  return wrap;
}

function renderThemePage() {
  const wrap = page();
  const theme = getCurrentTheme();

  wrap.append(card('当前主题', `${getPresetName(theme.preset)} · ${theme.mode === 'dark' ? '夜间' : '浅色'} ⌯'ᵕ'⌯`));

  const mode = card('颜色模式', '白天晚上都照顾到');
  mode.append(actionRow([
    actionBtn('star', '浅色', () => {
      setThemeMode('light');
      showToast('浅色模式换好啦');
      emitRefresh();
      render('theme');
    }),
    actionBtn('settings', '夜间', () => {
      setThemeMode('dark');
      showToast('夜间模式换好啦');
      emitRefresh();
      render('theme');
    })
  ]));
  wrap.append(mode);

  const presets = card('主题预设', '点一下就换一套小衣服');
  const grid = el('div', 'settings-grid');
  getThemePresets().forEach((preset) => {
    const btn = el('button', `settings-preset ${theme.preset === preset.id ? 'active' : ''}`);
    btn.type = 'button';
    btn.append(el('span', '', preset.name), el('small', '', preset.mode === 'dark' ? '夜间' : '浅色'));
    btn.addEventListener('click', () => {
      setPreset(preset.id);
      showToast('主题穿好啦');
      emitRefresh();
      render('theme');
    });
    grid.append(btn);
  });
  presets.append(grid);
  wrap.append(presets);

  const colors = card('自定义颜色', '背景、文字、气泡都能染色');
  const list = el('div', 'settings-list');
  THEME_COLOR_FIELDS.forEach(([key, name]) => {
    const row = el('label', 'settings-color-row');
    const input = el('input', 'settings-color');
    input.type = 'color';
    input.value = normalizeColor(theme.variables?.[key]);
    input.addEventListener('input', () => {
      applyTheme({ [key]: input.value });
      saveTheme();
      emitRefresh();
    });
    input.addEventListener('change', () => showToast('颜色存好啦'));
    row.append(el('span', '', name), input);
    list.append(row);
  });
  colors.append(list);
  wrap.append(colors);

  const files = card('主题文件', '导入导出 JSON，小主题不迷路');
  files.append(actionRow([
    actionBtn('upload', '导入主题', importThemeFile),
    actionBtn('download', '导出主题', () => {
      downloadJson(`theme-${getNow().slice(0, 10)}.json`, exportTheme());
      showToast('主题打包好啦');
    })
  ]));
  wrap.append(files);

  return wrap;
}

function renderDisplayPage() {
  const wrap = page();
  const settings = getSettings();

  const font = card('全局字号', '所有界面一起变大变小');
  font.append(rangeBlock(settings.fontSize || 15, 12, 24, 1, (value, live) => {
    applyTheme({ 'font-size-base': `${value}px` });
    if (!live) {
      const next = getSettings();
      next.fontSize = Number(value);
      saveSettings(next);
      saveTheme();
      emitRefresh();
      showToast('字号保存啦');
    }
  }));
  wrap.append(font);

  const fontFile = card('自定义字体', '上传 ttf、otf、woff、woff2');
  const meta = getData(CUSTOM_FONT_META_KEY);
  fontFile.append(el('p', 'settings-note', meta?.name ? `当前字体：${meta.name}` : '当前是默认字体'));
  fontFile.append(actionRow([
    actionBtn('upload', '上传字体', uploadCustomFont),
    actionBtn('delete', '清除字体', clearCustomFont)
  ]));
  wrap.append(fontFile);

  const bubble = card('聊天样子', '只影响消息 APP');
  const seg = el('div', 'settings-segment');
  seg.append(
    segment('气泡聊天', settings.bubbleMode !== 'dialog', () => saveBubbleMode('bubble')),
    segment('对话卡片', settings.bubbleMode === 'dialog', () => saveBubbleMode('dialog'))
  );
  bubble.append(seg);
  wrap.append(bubble);

  return wrap;
}

function renderApiPage() {
  const wrap = page();
  const settings = getSettings();

  const top = card('API 小管家', '模型、Key、接口都住这里');
  top.append(actionBtn('add', '新增 API', () => openApiEditor(null)));
  wrap.append(top);

  if (!settings.apiEndpoints.length) wrap.append(empty('还没有 API，先加一个吧 ᗜ ‸ ᗜ'));

  settings.apiEndpoints.forEach((api) => {
    const isDefault = settings.defaultApiEndpointId === api.id;
    const item = card(api.name || '未命名 API', `${api.endpoint || '未填写地址'}\n模型：${api.model || '未选择'} · Key：${api.apiKey ? '已填写' : '未填写'}${isDefault ? ' · 默认' : ''}`);
    item.append(actionRow([
      actionBtn('star', '默认', () => setDefaultApi(api.id)),
      actionBtn('refresh', '拉模型', () => loadApiModels(api.id)),
      actionBtn('check', '测试', () => testApi(api.id)),
      actionBtn('edit', '编辑', () => openApiEditor(api)),
      actionBtn('delete', '删除', () => deleteApi(api.id))
    ]));
    wrap.append(item);
  });

  return wrap;
}

function renderTtsPage() {
  const wrap = page();
  const settings = getSettings();
  const tts = settings.ttsGlobal || DEFAULT_SETTINGS.ttsGlobal;

  const status = card('声音屋状态', `${tts.provider || 'openai'} · ${tts.voice || 'alloy'} · ${tts.model || 'tts-1'}`);
  status.append(actionRow([
    actionBtn('edit', '编辑声音', openTtsEditor),
    actionBtn('refresh', '拉取模型', fetchTtsModels),
    actionBtn('play', '试听', testTts)
  ]));
  wrap.append(status);

  if (Array.isArray(tts.modelList) && tts.modelList.length) {
    const models = card('已拉到的模型', '点一个就设为当前 TTS 模型');
    const grid = el('div', 'settings-grid');
    tts.modelList.forEach((model) => {
      const btn = el('button', `settings-preset ${tts.model === model ? 'active' : ''}`, model);
      btn.type = 'button';
      btn.addEventListener('click', () => {
        const next = getSettings();
        next.ttsGlobal.model = model;
        saveSettings(next);
        showToast('声音模型选好啦');
        render('tts');
      });
      grid.append(btn);
    });
    models.append(grid);
    wrap.append(models);
  }

  return wrap;
}

function renderMcpPage() {
  const wrap = page();
  const settings = getSettings();

  const top = card('MCP 工具箱', '给 AI 接一些小工具用');
  top.append(actionBtn('add', '新增服务器', () => openMcpEditor(null)));
  wrap.append(top);

  if (!settings.mcpServers.length) wrap.append(empty('工具箱还空空的 OvO'));

  settings.mcpServers.forEach((server) => {
    const item = card(server.name || '未命名服务器', `${server.url || '未填写地址'}\n状态：${server.enabled ? '已启用' : '已停用'}`);
    item.append(actionRow([
      actionBtn(server.enabled ? 'delete' : 'play', server.enabled ? '停用' : '启用', () => toggleMcp(server.id)),
      actionBtn('edit', '编辑', () => openMcpEditor(server)),
      actionBtn('delete', '删除', () => deleteMcp(server.id))
    ]));
    wrap.append(item);
  });

  return wrap;
}

function renderCloudPage() {
  const wrap = page();
  const cloud = getCloud();

  const info = card('云服务器', '默认关闭。只有你主动填写并开启，数据才会往云朵仓库跑');
  info.append(el('p', 'settings-note', `当前：${cloud.enabled ? '已开启' : '关闭中'} · ${cloud.status === 'ok' ? '连接正常' : cloud.status === 'error' ? '连接失败' : '未测试'}`));
  wrap.append(info);

  const form = card('连接配置', '先填地址和密钥，再开启云服务');
  const endpoint = inputRow('服务器地址', cloud.endpoint || '', 'https://xxx.xxx.xxx.xxx:3000');
  const apiKey = inputRow('API 密钥', cloud.apiKey || '', '只存在本地，不会导出');

  const enabled = switchRow('启用云服务', cloud.enabled, (value, row) => {
    const next = getCloud();
    const endpointValue = endpoint.input.value.trim();
    const apiKeyValue = apiKey.input.value.trim();

    if (value && (!endpointValue || !apiKeyValue)) {
      row.dataset.value = 'false';
      row.classList.remove('on');
      showToast('先填服务器地址和密钥哦');
      return;
    }

    next.endpoint = endpointValue;
    next.apiKey = apiKeyValue;
    next.enabled = value;
    next.updatedAt = getNow();
    setData(CLOUD_KEY, next);
    showToast(value ? '云服务开启啦' : '云服务关好啦');
    render('cloud');
  });

  form.append(endpoint.wrap, apiKey.wrap, enabled);
  form.append(actionRow([
    actionBtn('check', '测试连接', async () => {
      const next = getCloud();
      next.endpoint = endpoint.input.value.trim();
      next.apiKey = apiKey.input.value.trim();

      if (!next.endpoint || !next.apiKey) {
        next.enabled = false;
        next.status = 'error';
        next.updatedAt = getNow();
        setData(CLOUD_KEY, next);
        showToast('地址和密钥都要填哦');
        render('cloud');
        return;
      }

      const ok = await testCloud(next);
      next.status = ok ? 'ok' : 'error';
      next.lastTestAt = getNow();
      next.updatedAt = getNow();
      if (!ok) next.enabled = false;
      setData(CLOUD_KEY, next);
      showToast(ok ? '连上啦，云朵小仓库在线' : '没连上，检查地址或密钥哦');
      render('cloud');
    }),
    actionBtn('download', '保存', () => {
      const next = getCloud();
      next.endpoint = endpoint.input.value.trim();
      next.apiKey = apiKey.input.value.trim();
      if (!next.endpoint || !next.apiKey) next.enabled = false;
      next.updatedAt = getNow();
      setData(CLOUD_KEY, next);
      showToast('云配置保存好啦');
      render('cloud');
    })
  ]));
  wrap.append(form);

  return wrap;
}

function renderDesktopPage() {
  const wrap = page();
  const scale = getData(DESKTOP_SCALE_KEY) || { iconScale: 1, widgetScale: 1, dockScale: 1 };

  const size = card('桌面大小', '图标、小卡片、底栏都能缩放');
  size.append(
    labelBlock('图标大小', rangeBlock(scale.iconScale || 1, 0.62, 1.28, 0.01, (value, live) => saveScale('iconScale', value, live))),
    labelBlock('小卡片大小', rangeBlock(scale.widgetScale || 1, 0.62, 1.28, 0.01, (value, live) => saveScale('widgetScale', value, live))),
    labelBlock('底栏大小', rangeBlock(scale.dockScale || 1, 0.62, 1.28, 0.01, (value, live) => saveScale('dockScale', value, live)))
  );
  wrap.append(size);

  const wallpaper = card('桌面壁纸', '上传后桌面会直接显示');
  wallpaper.append(actionRow([
    actionBtn('upload', '上传壁纸', () => uploadBlobImage(WALLPAPER_KEY, WALLPAPER_OPACITY_KEY, '壁纸换好啦')),
    actionBtn('delete', '清除壁纸', () => clearBlobImage(WALLPAPER_KEY, WALLPAPER_OPACITY_KEY))
  ]));
  wrap.append(wallpaper);

  return wrap;
}

function renderWidgetsPage() {
  const wrap = page();

  const bg = card('小卡片背景', '每张小卡片都能换背景');
  WIDGET_BG_LIST.forEach(([key, name]) => {
    bg.append(listAction('image', name, '上传或清除背景图', [
      actionBtn('upload', '上传', () => uploadWidgetBg(key)),
      actionBtn('delete', '清除', () => clearWidgetBg(key))
    ]));
  });
  wrap.append(bg);

  const custom = card('自定义小组件', '文字、形状、图片都能改');
  custom.append(actionBtn('add', '新建小组件', () => openWidgetEditor(null)));

  const widgets = getData(CUSTOM_WIDGETS_KEY) || [];
  if (!widgets.length) custom.append(el('p', 'settings-note', '还没有自定义小组件 ๑ᵒᯅᵒ๑'));

  widgets.forEach((widget) => {
    custom.append(listAction('copy', widget.name || '未命名小组件', `${widget.shape || 'square'} · ${widget.text || '无文字'}`, [
      actionBtn('edit', '编辑', () => openWidgetEditor(widget)),
      actionBtn('delete', '删除', () => deleteWidget(widget.id))
    ]));
  });

  wrap.append(custom);
  return wrap;
}

function renderIconsPage() {
  const wrap = page();
  const icons = getData(ICONS_KEY) || {};
  const hidden = new Set(getData(HIDDEN_ICONS_KEY) || []);

  const list = card('应用图标', '改名、换图、隐藏，都能用');
  APP_LIST.forEach(([id, name]) => {
    const custom = icons[id] || {};
    list.append(listAction(hidden.has(id) ? 'settings' : 'star', custom.name || name, hidden.has(id) ? '已隐藏' : custom.image ? '已换图' : '默认图标', [
      actionBtn('edit', '改名', () => renameIcon(id, name)),
      actionBtn('upload', '换图', () => uploadIcon(id)),
      actionBtn(hidden.has(id) ? 'settings' : 'delete', hidden.has(id) ? '恢复' : '隐藏', () => toggleIconHidden(id))
    ]));
  });

  wrap.append(list);
  return wrap;
}

function renderDataPage() {
  const wrap = page();

  const usage = card('存储用量', '看看小仓库有多满');
  const text = el('p', 'settings-note', '读取中...');
  usage.append(text);
  getStorageUsage().then((info) => {
    text.textContent = `${formatBytes(info.used)} / ${formatBytes(info.quota)} · ${info.percent || 0}%`;
  });
  wrap.append(usage);

  const pack = card('数据小包', '导入导出完整备份');
  pack.append(actionRow([
    actionBtn('download', '导出全部', exportAll),
    actionBtn('upload', '导入全部', importAll)
  ]));
  wrap.append(pack);

  const clean = card('轻轻清理', '危险按钮放这里，按前会问你');
  clean.append(actionRow([
    actionBtn('delete', '清聊天记忆', clearChatData),
    actionBtn('delete', '清空全部', clearAllData)
  ]));
  wrap.append(clean);

  return wrap;
}

function getSettings() {
  const saved = getData(SETTINGS_KEY) || {};
  return {
    ...DEFAULT_SETTINGS,
    ...saved,
    ttsGlobal: { ...DEFAULT_SETTINGS.ttsGlobal, ...(saved.ttsGlobal || {}) },
    user: { ...DEFAULT_SETTINGS.user, ...(saved.user || {}) },
    widgets: { ...DEFAULT_SETTINGS.widgets, ...(saved.widgets || {}) },
    mcpServers: Array.isArray(saved.mcpServers) ? saved.mcpServers : [],
    apiEndpoints: Array.isArray(saved.apiEndpoints) ? saved.apiEndpoints : []
  };
}

function saveSettings(settings) {
  setData(SETTINGS_KEY, settings);
  window.dispatchEvent(new CustomEvent('app-settings-updated'));
}

function getCloud() {
  return { ...DEFAULT_CLOUD, ...(getData(CLOUD_KEY) || {}) };
}

async function testCloud(config) {
  try {
    const base = normalizeEndpoint(config.endpoint);
    if (!base || !config.apiKey) return false;
    const res = await fetch(`${base}/api/ping`, { method: 'GET', headers: { 'x-api-key': config.apiKey }, cache: 'no-store' });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return data?.status === 'ok';
  } catch {
    return false;
  }
}

function setDefaultApi(id) {
  const settings = getSettings();
  const api = settings.apiEndpoints.find((item) => item.id === id);
  settings.defaultApiEndpointId = id;
  settings.defaultModel = api?.model || settings.defaultModel || '';
  saveSettings(settings);
  showToast('默认 API 设好啦');
  render('api');
}

async function loadApiModels(id) {
  const models = await fetchModels(id);
  if (!models.length) {
    showToast('没拉到模型');
    return;
  }

  const settings = getSettings();
  settings.apiEndpoints = settings.apiEndpoints.map((api) => api.id === id ? { ...api, modelList: models, model: api.model || models[0] } : api);

  if (settings.defaultApiEndpointId === id) {
    const api = settings.apiEndpoints.find((item) => item.id === id);
    settings.defaultModel = api?.model || models[0];
  }

  saveSettings(settings);
  showToast('模型拉好啦');
  render('api');
}

async function testApi(id) {
  const models = await fetchModels(id);
  showToast(models.length ? '连接成功啦' : '连接失败了');
}

async function deleteApi(id) {
  const ok = await showConfirm('要删除这个 API 吗？');
  if (!ok) return;

  const settings = getSettings();
  settings.apiEndpoints = settings.apiEndpoints.filter((api) => api.id !== id);
  if (settings.defaultApiEndpointId === id) {
    settings.defaultApiEndpointId = settings.apiEndpoints[0]?.id || '';
    settings.defaultModel = settings.apiEndpoints[0]?.model || '';
  }
  saveSettings(settings);
  showToast('API 删除啦');
  render('api');
}

function openApiEditor(api) {
  const current = api || { id: generateId(), name: '', endpoint: '', apiKey: '', model: '', modelList: [] };
  const sheet = sheetBox(api ? '编辑 API' : '新增 API');
  const name = inputRow('名字', current.name, '比如：主力模型');
  const endpoint = inputRow('Endpoint', current.endpoint, 'https://api.xxx.com');
  const apiKey = inputRow('API Key', current.apiKey, 'sk-...');
  const model = inputRow('模型', current.model, 'gpt-4o-mini');

  sheet.body.append(name.wrap, endpoint.wrap, apiKey.wrap, model.wrap);
  sheet.actions.append(actionBtn('check', '保存', () => {
    const settings = getSettings();
    const next = {
      id: current.id,
      name: name.input.value.trim(),
      endpoint: endpoint.input.value.trim(),
      apiKey: apiKey.input.value.trim(),
      model: model.input.value.trim(),
      modelList: current.modelList || []
    };

    settings.apiEndpoints = [...settings.apiEndpoints.filter((item) => item.id !== current.id), next];
    if (!settings.defaultApiEndpointId) settings.defaultApiEndpointId = next.id;
    if (!settings.defaultModel && next.model) settings.defaultModel = next.model;

    saveSettings(settings);
    hideBottomSheet();
    showToast('API 存好啦');
    render('api');
  }));

  showBottomSheet(sheet.root);
}

function openTtsEditor() {
  const settings = getSettings();
  const tts = settings.ttsGlobal || DEFAULT_SETTINGS.ttsGlobal;
  const sheet = sheetBox('编辑声音');
  const provider = inputRow('服务商', tts.provider || 'openai', 'openai');
  const endpoint = inputRow('Endpoint', tts.endpoint || '', 'https://api.xxx.com');
  const apiKey = inputRow('API Key', tts.apiKey || '', 'sk-...');
  const voice = inputRow('Voice', tts.voice || 'alloy', 'alloy');
  const model = inputRow('Model', tts.model || 'tts-1', 'tts-1');

  sheet.body.append(provider.wrap, endpoint.wrap, apiKey.wrap, voice.wrap, model.wrap);
  sheet.actions.append(actionBtn('check', '保存', () => {
    const next = getSettings();
    next.ttsGlobal = {
      provider: provider.input.value.trim() || 'openai',
      endpoint: endpoint.input.value.trim(),
      apiKey: apiKey.input.value.trim(),
      voice: voice.input.value.trim() || 'alloy',
      model: model.input.value.trim() || 'tts-1',
      modelList: next.ttsGlobal?.modelList || []
    };
    saveSettings(next);
    hideBottomSheet();
    showToast('声音保存啦');
    render('tts');
  }));

  showBottomSheet(sheet.root);
}

async function fetchTtsModels() {
  const settings = getSettings();
  const tts = settings.ttsGlobal || {};
  try {
    const base = normalizeEndpoint(tts.endpoint);
    if (!base) {
      showToast('先填 TTS 地址哦');
      return;
    }

    const res = await fetch(`${base}/v1/models`, { headers: tts.apiKey ? { Authorization: `Bearer ${tts.apiKey}` } : {}, cache: 'no-store' });
    if (!res.ok) throw new Error('bad');

    const data = await res.json();
    const models = (data.data || []).map((item) => item.id).filter(Boolean);
    if (!models.length) {
      showToast('没找到模型');
      return;
    }

    settings.ttsGlobal.modelList = models;
    settings.ttsGlobal.model = settings.ttsGlobal.model || models[0];
    saveSettings(settings);
    showToast('TTS 模型拉好啦');
    render('tts');
  } catch {
    showToast('TTS 模型拉取失败');
  }
}

function testTts() {
  stopTTS();
  ttsPreview = playTTS('你好呀，声音小屋已经准备好了。', getSettings().ttsGlobal);
  showToast('开始试听啦');
}

function stopTTS() {
  if (ttsPreview?.stop) ttsPreview.stop();
  ttsPreview = null;
}

function openMcpEditor(server) {
  const current = server || { id: generateId(), name: '', url: '', enabled: true };
  const sheet = sheetBox(server ? '编辑 MCP' : '新增 MCP');
  const name = inputRow('名字', current.name, '工具小助手');
  const url = inputRow('URL', current.url, 'https://xxx/mcp');
  const enabled = switchRow('启用', current.enabled, () => {});

  sheet.body.append(name.wrap, url.wrap, enabled);
  sheet.actions.append(actionBtn('check', '保存', () => {
    const settings = getSettings();
    const nextServer = { id: current.id, name: name.input.value.trim(), url: url.input.value.trim(), enabled: enabled.dataset.value === 'true' };
    settings.mcpServers = [...settings.mcpServers.filter((item) => item.id !== current.id), nextServer];
    saveSettings(settings);
    resetSession(nextServer.id);
    hideBottomSheet();
    showToast('MCP 存好啦');
    render('mcp');
  }));

  showBottomSheet(sheet.root);
}

function toggleMcp(id) {
  const settings = getSettings();
  settings.mcpServers = settings.mcpServers.map((server) => server.id === id ? { ...server, enabled: !server.enabled } : server);
  saveSettings(settings);
  resetSession(id);
  showToast('工具开关切好啦');
  render('mcp');
}

async function deleteMcp(id) {
  const ok = await showConfirm('要删除这个 MCP 吗？');
  if (!ok) return;

  const settings = getSettings();
  settings.mcpServers = settings.mcpServers.filter((server) => server.id !== id);
  saveSettings(settings);
  resetSession(id);
  showToast('MCP 删除啦');
  render('mcp');
}

function saveBubbleMode(mode) {
  const settings = getSettings();
  settings.bubbleMode = mode;
  saveSettings(settings);
  showToast('聊天样子换好啦');
  render('display');
}

function saveScale(key, value, live) {
  const scale = getData(DESKTOP_SCALE_KEY) || {};
  scale[key] = Number(value);
  setData(DESKTOP_SCALE_KEY, scale);
  emitRefresh();
  if (!live) showToast('桌面大小存好啦');
}

async function uploadBlobImage(key, opacityKey, msg) {
  const file = await pickFile('image/*');
  if (!file) return;

  const dataUrl = await readFileAsDataUrl(file);
  await setDB('blobs', key, { key, value: dataUrl, source: file.name, opacity: 100, updatedAt: getNow() });

  if (opacityKey) setData(opacityKey, 100);
  showToast(msg || '图片上传好啦');
  emitRefresh();
}

async function clearBlobImage(key, opacityKey) {
  const ok = await showConfirm('要清掉这张图吗？');
  if (!ok) return;

  await deleteDB('blobs', key);
  removeData(key);
  if (opacityKey) removeData(opacityKey);

  showToast('图片清掉啦');
  emitRefresh();
  render(route);
}

async function uploadWidgetBg(key) {
  const file = await pickFile('image/*');
  if (!file) return;

  const dataUrl = await readFileAsDataUrl(file);
  const all = getData(WIDGET_BACKGROUNDS_KEY) || {};
  all[key] = { key, value: dataUrl, source: file.name, opacity: 100, updatedAt: getNow() };

  setData(WIDGET_BACKGROUNDS_KEY, all);
  showToast('小卡片背景换好啦');
  emitRefresh();
}

async function clearWidgetBg(key) {
  const ok = await showConfirm('要清掉这个小卡片背景吗？');
  if (!ok) return;

  const all = getData(WIDGET_BACKGROUNDS_KEY) || {};
  delete all[key];

  setData(WIDGET_BACKGROUNDS_KEY, all);
  showToast('背景清掉啦');
  emitRefresh();
  render('widgets');
}

function openWidgetEditor(widget) {
  const current = widget || { id: generateId(), name: '', shape: 'square', image: '', text: '', opacity: 100, createdAt: getNow() };
  const sheet = sheetBox(widget ? '编辑小组件' : '新建小组件');
  const name = inputRow('名字', current.name, '小卡片');
  const text = inputRow('文字', current.text, '写点什么');
  const shape = selectRow('形状', current.shape || 'square', [
    ['square', '方形'],
    ['rectangle', '长方形'],
    ['wide', '宽卡片'],
    ['circle', '圆形']
  ]);

  let image = current.image || '';
  sheet.body.append(name.wrap, text.wrap, shape.wrap);
  sheet.actions.append(
    actionBtn('upload', '上传图', async () => {
      const file = await pickFile('image/*');
      if (!file) return;
      image = await readFileAsDataUrl(file);
      await setDB('blobs', `custom_widget_${current.id}`, { key: `custom_widget_${current.id}`, value: image, source: file.name, opacity: 100, updatedAt: getNow() });
      showToast('小组件图上传啦');
    }),
    actionBtn('check', '保存', () => {
      const list = getData(CUSTOM_WIDGETS_KEY) || [];
      const next = {
        id: current.id,
        name: name.input.value.trim(),
        shape: shape.input.value,
        image,
        imageSource: image ? 'upload' : '',
        text: text.input.value.trim(),
        opacity: 100,
        createdAt: current.createdAt || getNow(),
        updatedAt: getNow()
      };

      setData(CUSTOM_WIDGETS_KEY, [...list.filter((item) => item.id !== current.id), next]);
      hideBottomSheet();
      showToast('小组件保存啦');
      emitRefresh();
      render('widgets');
    })
  );

  showBottomSheet(sheet.root);
}

async function deleteWidget(id) {
  const ok = await showConfirm('要删除这个小组件吗？');
  if (!ok) return;

  setData(CUSTOM_WIDGETS_KEY, (getData(CUSTOM_WIDGETS_KEY) || []).filter((item) => item.id !== id));
  await deleteDB('blobs', `custom_widget_${id}`);

  showToast('小组件删除啦');
  emitRefresh();
  render('widgets');
}

function renameIcon(id, fallbackName) {
  const icons = getData(ICONS_KEY) || {};
  const current = icons[id] || {};
  const sheet = sheetBox('改图标名字');
  const name = inputRow('显示名字', current.name || fallbackName, fallbackName);

  sheet.body.append(name.wrap);
  sheet.actions.append(actionBtn('check', '保存', () => {
    icons[id] = { ...current, name: name.input.value.trim() || fallbackName, updatedAt: getNow() };
    setData(ICONS_KEY, icons);
    hideBottomSheet();
    showToast('名字改好啦');
    emitRefresh();
    render('icons');
  }));

  showBottomSheet(sheet.root);
}

async function uploadIcon(id) {
  const file = await pickFile('image/*');
  if (!file) return;

  const dataUrl = await readFileAsDataUrl(file);
  const icons = getData(ICONS_KEY) || {};
  const current = icons[id] || {};
  const blobKey = `app_icon_${id}`;

  await setDB('blobs', blobKey, { key: blobKey, value: dataUrl, source: file.name, opacity: 100, updatedAt: getNow() });

  icons[id] = {
    ...current,
    image: dataUrl,
    iconImage: dataUrl,
    backgroundImage: dataUrl,
    imageBase64: dataUrl,
    blobKey,
    opacity: 100,
    updatedAt: getNow()
  };

  setData(ICONS_KEY, icons);
  showToast('图标换好啦');
  emitRefresh();
  render('icons');
}

function toggleIconHidden(id) {
  const hidden = new Set(getData(HIDDEN_ICONS_KEY) || []);

  if (hidden.has(id)) {
    hidden.delete(id);
    showToast('图标回来啦');
  } else {
    hidden.add(id);
    showToast('图标藏好啦');
  }

  setData(HIDDEN_ICONS_KEY, [...hidden]);
  emitRefresh();
  render('icons');
}

async function exportAll() {
  const data = { localStorage: {}, indexedDB: {} };

  [
    SETTINGS_KEY,
    CLOUD_KEY,
    ICONS_KEY,
    HIDDEN_ICONS_KEY,
    WALLPAPER_OPACITY_KEY,
    WIDGET_BACKGROUNDS_KEY,
    DESKTOP_SCALE_KEY,
    CUSTOM_FONT_META_KEY,
    CUSTOM_WIDGETS_KEY,
    'app_theme',
    'app_theme_preset',
    'app_theme_mode'
  ].forEach((key) => {
    data.localStorage[key] = getData(key);
  });

  for (const store of DB_STORES) {
    data.indexedDB[store] = await getAllDB(store);
  }

  downloadJson(`ai-phone-backup-${getNow().slice(0, 10)}.json`, data);
  showToast('数据打包好啦');
}

async function importAll() {
  const file = await pickFile('application/json');
  if (!file) return;

  const ok = await showConfirm('导入会覆盖同名数据，要继续吗？');
  if (!ok) return;

  try {
    const data = JSON.parse(await readFileAsText(file));

    Object.entries(data.localStorage || {}).forEach(([key, value]) => setData(key, value));

    for (const store of DB_STORES) {
      if (!Array.isArray(data.indexedDB?.[store])) continue;
      await clearStoreDB(store);

      for (const item of data.indexedDB[store]) {
        await setDB(store, item.key || item.id, item);
      }
    }

    showToast('导入完成啦');
    emitRefresh();
    render('data');
  } catch {
    showToast('导入失败了');
  }
}

async function clearChatData() {
  const ok = await showConfirm('只清空聊天和记忆，可以吗？');
  if (!ok) return;

  await clearStoreDB('messages');
  await clearStoreDB('group_messages');
  await clearStoreDB('memories');
  removeData('chat_unread_counts');

  showToast('聊天记忆清好啦');
  emitRefresh();
}

async function clearAllData() {
  const ok = await showConfirm('这会清空所有数据，真的继续吗？');
  if (!ok) return;

  [
    SETTINGS_KEY,
    CLOUD_KEY,
    ICONS_KEY,
    HIDDEN_ICONS_KEY,
    WALLPAPER_KEY,
    WALLPAPER_OPACITY_KEY,
    WIDGET_BACKGROUNDS_KEY,
    DESKTOP_SCALE_KEY,
    CUSTOM_FONT_META_KEY,
    CUSTOM_WIDGETS_KEY,
    'app_theme',
    'app_theme_preset',
    'app_theme_mode'
  ].forEach(removeData);

  for (const store of DB_STORES) await clearStoreDB(store);

  showToast('都清空啦');
  emitRefresh();
  render('data');
}

async function uploadCustomFont() {
  const file = await pickFile('.ttf,.otf,.woff,.woff2');
  if (!file) return;

  const ext = file.name.split('.').pop()?.toLowerCase() || 'woff2';
  const dataUrl = await readFileAsDataUrl(file);

  await setDB('blobs', CUSTOM_FONT_KEY, { key: CUSTOM_FONT_KEY, value: dataUrl, name: file.name, type: ext, updatedAt: getNow() });
  setData(CUSTOM_FONT_META_KEY, { name: file.name, type: ext, format: ext, updatedAt: getNow() });

  injectCustomFont(dataUrl, ext);
  applyTheme({ 'font-main': '"AppCustomFont", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' });
  saveTheme();

  showToast('字体换好啦');
  emitRefresh();
  render('display');
}

async function clearCustomFont() {
  const ok = await showConfirm('要恢复默认字体吗？');
  if (!ok) return;

  await deleteDB('blobs', CUSTOM_FONT_KEY);
  removeData(CUSTOM_FONT_META_KEY);

  if (customFontStyleEl) customFontStyleEl.remove();
  customFontStyleEl = null;

  applyTheme({ 'font-main': "'PingFang SC', 'Microsoft YaHei', sans-serif" });
  saveTheme();

  showToast('字体恢复啦');
  emitRefresh();
  render('display');
}

async function restoreCustomFont() {
  const meta = getData(CUSTOM_FONT_META_KEY);
  const record = await getDB('blobs', CUSTOM_FONT_KEY);
  if (!meta || !record?.value) return;
  injectCustomFont(record.value, meta.format || 'woff2');
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

async function importThemeFile() {
  const file = await pickFile('application/json');
  if (!file) return;

  try {
    importTheme(await readFileAsText(file));
    showToast('主题导入啦');
    emitRefresh();
    render('theme');
  } catch {
    showToast('主题导入失败');
  }
}

function closeDesktop() {
  if (typeof window.closeCurrentApp === 'function') {
    window.closeCurrentApp();
  } else {
    window.dispatchEvent(new CustomEvent('app-close'));
  }
}

function getTitle(name) {
  return {
    home: '设置小窝',
    theme: '外观主题',
    display: '字体与显示',
    api: 'API 小管家',
    tts: 'TTS 声音屋',
    mcp: 'MCP 工具箱',
    cloud: '云服务器',
    desktop: '桌面装扮',
    widgets: '小组件',
    icons: '应用图标',
    data: '数据小包'
  }[name] || '设置';
}

function getSubtitle(name) {
  return {
    home: '慢慢调，不着急 OvO',
    theme: '给小手机换件衣服',
    display: '字体和聊天样子',
    api: '模型接口住这里',
    tts: '让 AI 开口说话',
    mcp: '工具小助手集合',
    cloud: '默认关闭，主动开启才使用',
    desktop: '壁纸和大小',
    widgets: '小卡片小窝',
    icons: '桌面图标换装',
    data: '备份和清理'
  }[name] || '';
}

function page() {
  return el('div', 'settings-page');
}

function hero(title, desc) {
  const node = el('div', 'settings-hero');
  node.append(el('h2', '', title), el('p', '', desc));
  return node;
}

function group(title, items) {
  const node = el('div', 'settings-group');
  node.append(el('div', 'settings-group-title', title), ...items);
  return node;
}

function navItem(icon, title, desc, nextRoute) {
  const item = el('button', 'settings-nav-item');
  item.type = 'button';

  const mark = el('span', 'settings-row-icon');
  mark.append(safeIcon(icon, 20));

  const text = el('span', 'settings-row-text');
  text.append(el('strong', '', title), el('small', '', desc));

  const arrow = el('span', 'settings-arrow');
  arrow.append(safeIcon('settings', 18));

  item.append(mark, text, arrow);
  item.addEventListener('click', () => render(nextRoute));
  return item;
}

function card(title, desc) {
  const node = el('div', 'settings-card');
  node.append(el('div', 'settings-card-title', title));
  if (desc) node.append(el('p', 'settings-card-desc', desc));
  return node;
}

function empty(text) {
  const node = el('div', 'settings-empty');
  node.textContent = text;
  return node;
}

function actionRow(buttons) {
  const row = el('div', 'settings-actions');
  buttons.forEach((btn) => row.append(btn));
  return row;
}

function actionBtn(icon, text, onClick) {
  return makeButton('settings-action-btn', text, icon, onClick);
}

function makeButton(className, text, icon, onClick) {
  const btn = el('button', className);
  btn.type = 'button';

  if (icon) btn.append(safeIcon(icon, 17));
  btn.append(el('span', '', text));

  btn.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick?.(event);
  });

  return btn;
}

function segment(text, active, onClick) {
  const btn = el('button', active ? 'active' : '');
  btn.type = 'button';
  btn.textContent = text;
  btn.addEventListener('click', onClick);
  return btn;
}

function listAction(icon, title, desc, buttons) {
  const item = el('div', 'settings-list-action');

  const mark = el('span', 'settings-row-icon');
  mark.append(safeIcon(icon, 18));

  const text = el('span', 'settings-row-text');
  text.append(el('strong', '', title), el('small', '', desc));

  const row = actionRow(buttons);
  item.append(mark, text, row);
  return item;
}

function labelBlock(label, content) {
  const box = el('div', 'settings-label-block');
  box.append(el('div', 'settings-label', label), content);
  return box;
}

function rangeBlock(value, min, max, step, onChange) {
  const row = el('div', 'settings-range-row');
  const input = el('input', 'settings-range');
  const num = el('span', 'settings-range-value', String(value));

  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);

  input.addEventListener('input', () => {
    num.textContent = step < 1 ? Number(input.value).toFixed(2) : String(input.value);
    onChange?.(input.value, true);
  });

  input.addEventListener('change', () => onChange?.(input.value, false));
  row.append(input, num);
  return row;
}

function inputRow(label, value, placeholder) {
  const wrap = el('label', 'settings-field');
  const input = el('input', 'settings-input');
  input.type = 'text';
  input.value = value || '';
  input.placeholder = placeholder || '';
  wrap.append(el('span', '', label), input);
  return { wrap, input };
}

function selectRow(label, value, options) {
  const wrap = el('label', 'settings-field');
  const input = el('select', 'settings-input');

  options.forEach(([val, text]) => {
    const option = document.createElement('option');
    option.value = val;
    option.textContent = text;
    input.append(option);
  });

  input.value = value;
  wrap.append(el('span', '', label), input);
  return { wrap, input };
}

function switchRow(label, initial, onChange) {
  const row = el('button', `settings-switch-row ${initial ? 'on' : ''}`);
  row.type = 'button';
  row.dataset.value = initial ? 'true' : 'false';
  row.append(el('span', '', label), el('i', 'settings-switch-dot'));

  row.addEventListener('click', () => {
    const next = row.dataset.value !== 'true';
    row.dataset.value = next ? 'true' : 'false';
    row.classList.toggle('on', next);
    onChange?.(next, row);
  });

  return row;
}

function sheetBox(title) {
  const root = el('div', 'settings-sheet');
  const body = el('div', 'settings-sheet-body');
  const actions = el('div', 'settings-actions');
  root.append(el('div', 'settings-sheet-title', title), body, actions);
  return { root, body, actions };
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
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeColor(value) {
  const text = String(value || '').trim();
  if (/^#[0-9a-fA-F]{3,8}$/.test(text)) return text;
  return '#ffffff';
}

function normalizeEndpoint(endpoint) {
  return String(endpoint || '').trim().replace(/\/+$/, '').replace(/\/v1\/?$/, '');
}

function getPresetName(id) {
  return getThemePresets().find((preset) => preset.id === id)?.name || id || '默认主题';
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function emitRefresh() {
  window.AppEvents?.emit?.('desktop:refresh');
  window.dispatchEvent(new CustomEvent('app-settings-updated'));
}

function safeIcon(name, size = 18) {
  try {
    const icon = createIcon(name, size);
    if (icon) return icon;
  } catch {}

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.5');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');

  const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  circle.setAttribute('cx', '12');
  circle.setAttribute('cy', '12');
  circle.setAttribute('r', '4.5');
  svg.append(circle);

  return svg;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== '') node.textContent = text;
  return node;
}

function injectStyle() {
  if (styleEl) return;

  styleEl = document.createElement('style');
  styleEl.textContent = `
    .settings-app-shell {
      position: fixed;
      inset: 0;
      z-index: 31;
      pointer-events: auto;
      overflow: hidden;
      background: var(--bg-primary);
    }

    .settings-app {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
    }

    .settings-nav {
      background: var(--surface-glass);
    }

    .settings-nav-titlebox {
      flex: 1;
      min-width: 0;
      text-align: left;
    }

    .settings-nav-btn {
      min-width: 92px;
      height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 12px;
      border-radius: 16px;
      background: var(--bg-card);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
      font-size: var(--font-size-small);
      transition: var(--motion);
    }

    .settings-content {
      height: calc(100% - 58px - env(safe-area-inset-top));
      overflow-y: auto;
      overflow-x: hidden;
      padding: 14px 20px calc(34px + env(safe-area-inset-bottom));
      -webkit-overflow-scrolling: touch;
    }

    .settings-narrow,
    .settings-page {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .settings-narrow {
      width: min(100%, 460px);
      margin: 0 auto;
    }

    .settings-hero,
    .settings-card,
    .settings-group,
    .settings-empty {
      border-radius: var(--radius-lg);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .settings-hero,
    .settings-card {
      padding: 16px;
    }

    .settings-hero h2 {
      margin: 0;
      color: var(--text-primary);
      font-size: 22px;
      font-weight: 600;
      line-height: 1.3;
    }

    .settings-hero p,
    .settings-card-desc,
    .settings-note,
    .settings-row-text small,
    .settings-empty {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      line-height: 1.55;
      white-space: pre-line;
    }

    .settings-hero p,
    .settings-card-desc,
    .settings-note {
      margin: 6px 0 0;
    }

    .settings-group {
      padding: 8px;
    }

    .settings-group-title {
      padding: 8px 10px 6px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
    }

    .settings-nav-item,
    .settings-list-action {
      width: 100%;
      min-height: 62px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px;
      border-radius: 18px;
      background: transparent;
      color: var(--text-primary);
      text-align: left;
      transition: var(--motion);
    }

    .settings-nav-item:active,
    .settings-action-btn:active,
    .settings-preset:active,
    .settings-switch-row:active,
    .settings-nav-btn:active {
      transform: scale(var(--press-scale));
    }

    .settings-row-icon {
      width: 36px;
      height: 36px;
      flex: 0 0 36px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 14px;
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .settings-row-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .settings-row-text strong,
    .settings-card-title {
      color: var(--text-primary);
      font-size: var(--font-size-base);
      font-weight: 600;
      line-height: 1.35;
    }

    .settings-card-title {
      font-size: var(--font-size-title);
    }

    .settings-arrow {
      flex: 0 0 auto;
      color: var(--text-hint);
    }

    .settings-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 12px;
    }

    .settings-action-btn,
    .settings-preset,
    .settings-color-row,
    .settings-label-block,
    .settings-field,
    .settings-switch-row {
      border-radius: 16px;
      background: var(--surface-muted);
      color: var(--text-primary);
      box-shadow: var(--shadow-sm);
    }

    .settings-action-btn {
      min-height: 38px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 12px;
      font-size: var(--font-size-small);
      transition: var(--motion);
    }

    .settings-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 12px;
    }

    .settings-preset {
      min-height: 56px;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: center;
      gap: 3px;
      padding: 10px 12px;
      text-align: left;
      transition: var(--motion);
    }

    .settings-preset.active {
      background: var(--accent-light);
      color: var(--accent-dark);
    }

    .settings-preset small {
      color: var(--text-secondary);
      font-size: 12px;
    }

    .settings-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 12px;
    }

    .settings-color-row,
    .settings-label-block,
    .settings-field,
    .settings-switch-row {
      width: 100%;
      min-height: 48px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
    }

    .settings-color {
      width: 40px;
      height: 32px;
      padding: 0;
      border-radius: 12px;
      background: transparent;
      overflow: hidden;
    }

    .settings-range-row {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .settings-range {
      flex: 1;
      min-width: 0;
      accent-color: var(--accent);
    }

    .settings-range-value {
      min-width: 42px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      text-align: right;
    }

    .settings-label-block,
    .settings-field {
      align-items: stretch;
      flex-direction: column;
      margin-top: 10px;
    }

    .settings-label,
    .settings-field span {
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      font-weight: 600;
    }

    .settings-input {
      width: 100%;
      min-height: 44px;
      padding: 10px 12px;
      border-radius: 15px;
      background: var(--bg-card);
      color: var(--text-primary);
      font-size: 16px;
    }

    .settings-segment {
      display: flex;
      gap: 6px;
      margin-top: 12px;
      padding: 5px;
      border-radius: 16px;
      background: var(--surface-muted);
    }

    .settings-segment button {
      flex: 1;
      min-height: 36px;
      border-radius: 12px;
      color: var(--text-secondary);
      font-size: var(--font-size-small);
      transition: var(--motion);
    }

    .settings-segment button.active {
      color: var(--accent-dark);
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
    }

    .settings-switch-row {
      flex-direction: row;
      font-size: var(--font-size-base);
      transition: var(--motion);
    }

    .settings-switch-dot {
      position: relative;
      width: 44px;
      height: 26px;
      flex: 0 0 44px;
      border-radius: 999px;
      background: var(--bg-secondary);
      transition: var(--motion);
    }

    .settings-switch-dot::after {
      content: "";
      position: absolute;
      top: 4px;
      left: 4px;
      width: 18px;
      height: 18px;
      border-radius: 999px;
      background: var(--bg-card);
      box-shadow: var(--shadow-sm);
      transition: var(--motion);
    }

    .settings-switch-row.on .settings-switch-dot {
      background: var(--accent);
    }

    .settings-switch-row.on .settings-switch-dot::after {
      transform: translateX(18px);
    }

    .settings-list-action {
      align-items: flex-start;
      background: var(--surface-muted);
      margin-top: 10px;
    }

    .settings-list-action .settings-actions {
      flex: 0 0 auto;
      justify-content: flex-end;
      margin-top: 0;
    }

    .settings-empty {
      padding: 24px;
      text-align: center;
    }

    .settings-sheet {
      width: min(100%, 460px);
      margin: 0 auto;
      color: var(--text-primary);
    }

    .settings-sheet-title {
      margin-bottom: 12px;
      color: var(--text-primary);
      font-size: 20px;
      font-weight: 600;
      line-height: 1.35;
    }

    .settings-sheet-body {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    @media (max-width: 430px) {
      .settings-list-action {
        flex-wrap: wrap;
      }

      .settings-list-action .settings-actions {
        width: 100%;
        padding-left: 48px;
      }
    }
  `;
  document.head.appendChild(styleEl);
}

// 依赖：../core/storage.js(getData,setData,removeData,generateId,getNow,getStorageUsage,getDB,setDB,getAllDB,deleteDB,clearStoreDB)；../core/theme.js(getThemePresets,getCurrentTheme,setPreset,setThemeMode,applyTheme,saveTheme,exportTheme,importTheme)；../core/ui.js(showToast,showBottomSheet,hideBottomSheet,showConfirm,createIcon)；../core/api.js(fetchModels)；../core/mcp.js(resetSession)；../core/tts.js(playTTS)
