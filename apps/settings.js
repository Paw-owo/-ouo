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
  'blobs',
  'grudges',
  'punishments',
  'relationship_locks',
  'albums',
  'memories_album'
];

const CHAT_LOCAL_KEYS = [
  'chat_unread_counts',
  'chat_hidden_private_threads',
  'chat_last_route',
  'chat_draft_map',
  'chat_active_thread_id'
];

const DEFAULT_SETTINGS = {
  defaultApiEndpointId: '',
  defaultModel: '',
  ttsGlobal: { provider: 'openai', apiKey: '', endpoint: '', voice: 'alloy', model: 'tts-1', modelList: [] },
  mcpServers: [],
  bubbleMode: 'bubble',
  fontSize: 15,
  user: { name: '', avatar: '', avatarSource: '', avatarOpacity: 100 },
  widgets: { time: true, weather: true, anniversary: true, focus: true },
  chatSettings: {
    autoPlayTTS: false,
    showThinking: true,
    showToolCalls: true,
    stickerPanelLarge: true,
    proactiveMode1Enabled: false,
    proactiveMode2Enabled: false
  },
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
  ['gallery', '回忆馆'],
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

const DESKTOP_WIDGET_LIST = [
  ['time', '时间小卡片', '显示日期、时间这些桌面信息'],
  ['weather', '天气小卡片', '显示天气和温度'],
  ['anniversary', '纪念日小卡片', '显示最近的重要日子'],
  ['focus', '焦点小卡片', '显示桌面上的小提醒']
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
  applyGlobalFontSize(getSettings().fontSize || 15, false);
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
    chat: renderChatPage,
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
      navItem('edit', '字体与显示', '字号、字体、聊天样子轻轻调', 'display'),
      navItem('message', '聊天设置', '语音、思考卡片、主动消息这些小习惯', 'chat')
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

  const font = card('全局字号', '拖一下，整个小手机都会一起变大变小');
  font.append(rangeBlock(settings.fontSize || 15, 12, 24, 1, (value, live) => {
    applyGlobalFontSize(value, true);
    if (!live) {
      const next = getSettings();
      next.fontSize = Number(value);
      saveSettings(next);
      saveTheme();
      emitRefresh();
      showToast('字号保存啦，全局都跟着变啦');
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

function renderChatPage() {
  const wrap = page();
  const settings = getSettings();
  const chat = { ...DEFAULT_SETTINGS.chatSettings, ...(settings.chatSettings || {}) };

  const voice = card('语音小习惯', 'AI 回复后要不要自动念出来');
  voice.append(switchRow('AI 回复自动播放语音', chat.autoPlayTTS, (value) => saveChatSetting('autoPlayTTS', value, '语音习惯保存啦')));
  wrap.append(voice);

  const thinking = card('思考小卡片', '不想看思考和工具过程，也可以先收起来');
  thinking.append(
    switchRow('显示思考卡片', chat.showThinking, (value) => saveChatSetting('showThinking', value, '思考卡片设置好啦')),
    switchRow('显示工具过程', chat.showToolCalls, (value) => saveChatSetting('showToolCalls', value, '工具过程设置好啦'))
  );
  wrap.append(thinking);

  const sticker = card('表情包面板', '表情多的时候，用大一点会更好点');
  sticker.append(switchRow('使用大表情包面板', chat.stickerPanelLarge, (value) => saveChatSetting('stickerPanelLarge', value, '表情包面板设置好啦')));
  wrap.append(sticker);

  const proactive = card('主动消息', '只保存总开关，聊天里的角色配置还会继续听自己的');
  proactive.append(
    switchRow('离线久未回复提醒', chat.proactiveMode1Enabled, (value) => saveChatSetting('proactiveMode1Enabled', value, '主动消息开关保存啦')),
    switchRow('在线停留主动开口', chat.proactiveMode2Enabled, (value) => saveChatSetting('proactiveMode2Enabled', value, '在线主动开口保存啦'))
  );
  wrap.append(proactive);

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

    if (Array.isArray(api.modelList) && api.modelList.length) {
      item.append(modelPicker({
        models: api.modelList,
        current: api.model,
        emptyText: '',
        onSelect: (model) => selectApiModel(api.id, model)
      }));
    }

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

  if (Array.isArray(tts.modelList) && tts.modelList.length) {
    status.append(modelPicker({
      models: tts.modelList,
      current: tts.model,
      emptyText: '',
      onSelect: selectTtsModel
    }));
  }

  wrap.append(status);
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
        next.status = 'error';
        next.lastTestAt = getNow();
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
      setData(CLOUD_KEY, next);
      showToast(ok ? '连上啦，云朵小仓库在线' : '没连上，但不会偷偷关掉你的开关');
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
  const wallpaperOpacity = Number(getData(WALLPAPER_OPACITY_KEY) ?? 100);

  const size = card('桌面大小', '图标、小卡片、底栏都能缩放');
  size.append(
    labelBlock('图标大小', rangeBlock(scale.iconScale || 1, 0.62, 1.28, 0.01, (value, live) => saveScale('iconScale', value, live))),
    labelBlock('小卡片大小', rangeBlock(scale.widgetScale || 1, 0.62, 1.28, 0.01, (value, live) => saveScale('widgetScale', value, live))),
    labelBlock('底栏大小', rangeBlock(scale.dockScale || 1, 0.62, 1.28, 0.01, (value, live) => saveScale('dockScale', value, live)))
  );
  wrap.append(size);

  const wallpaper = card('桌面壁纸', '上传后桌面会直接显示，还能轻轻调透明度');
  const preview = imagePreview('', '当前壁纸', 'image');
  preview.dataset.previewKey = WALLPAPER_KEY;
  wallpaper.append(preview);
  fillBlobPreview(preview, WALLPAPER_KEY);
  wallpaper.append(labelBlock('壁纸透明度', rangeBlock(wallpaperOpacity, 0, 100, 1, (value, live) => saveWallpaperOpacity(value, live))));
  wallpaper.append(actionRow([
    actionBtn('upload', '上传壁纸', () => uploadBlobImage(WALLPAPER_KEY, WALLPAPER_OPACITY_KEY, '壁纸换好啦')),
    actionBtn('delete', '清除壁纸', () => clearBlobImage(WALLPAPER_KEY, WALLPAPER_OPACITY_KEY))
  ]));
  wrap.append(wallpaper);

  return wrap;
}

function renderWidgetsPage() {
  const wrap = page();
  const settings = getSettings();
  const backgrounds = getData(WIDGET_BACKGROUNDS_KEY) || {};

  const desktopWidgets = card('桌面小组件', '不想看到哪张小卡片，就先把它移走');
  DESKTOP_WIDGET_LIST.forEach(([key, name, desc]) => {
    const enabled = settings.widgets?.[key] !== false;
    desktopWidgets.append(listAction(enabled ? 'copy' : 'delete', name, enabled ? desc : '已经从桌面移除', [
      actionBtn(enabled ? 'delete' : 'add', enabled ? '移除' : '恢复', () => toggleDesktopWidget(key, !enabled))
    ]));
  });
  wrap.append(desktopWidgets);

  const bg = card('小卡片背景', '每张小卡片都能换背景，也能调透明度');
  WIDGET_BG_LIST.forEach(([key, name]) => {
    const record = backgrounds[key] || {};
    const preview = imagePreview(record.value || '', name, 'image');
    const box = el('div', 'settings-widget-bg-item');
    box.append(listAction('image', name, record.value ? `透明度：${Number(record.opacity ?? 100)}%` : '还没换背景', [
      actionBtn('upload', '上传', () => uploadWidgetBg(key)),
      actionBtn('delete', '清除', () => clearWidgetBg(key))
    ], preview));

    if (record.value) {
      box.append(labelBlock('透明度', rangeBlock(Number(record.opacity ?? 100), 0, 100, 1, (value, live) => saveWidgetBgOpacity(key, value, live))));
    }

    bg.append(box);
  });
  wrap.append(bg);

  const custom = card('自定义小组件', '文字、形状、图片、透明度都能改');
  custom.append(actionBtn('add', '新建小组件', () => openWidgetEditor(null)));

  const widgets = getData(CUSTOM_WIDGETS_KEY) || [];
  if (!widgets.length) custom.append(el('p', 'settings-note', '还没有自定义小组件 ๑ᵒᯅᵒ๑'));

  widgets.forEach((widget) => {
    const box = el('div', 'settings-widget-bg-item');
    box.append(listAction('copy', widget.name || '未命名小组件', `${widget.shape || 'square'} · ${widget.text || '无文字'} · 透明度：${Number(widget.opacity ?? 100)}%`, [
      actionBtn('edit', '编辑', () => openWidgetEditor(widget)),
      actionBtn('delete', '删除', () => deleteWidget(widget.id))
    ], imagePreview(widget.image || '', widget.name || '小组件', 'copy')));
    box.append(labelBlock('透明度', rangeBlock(Number(widget.opacity ?? 100), 0, 100, 1, (value, live) => saveCustomWidgetOpacity(widget.id, value, live))));
    custom.append(box);
  });

  wrap.append(custom);
  return wrap;
}

function renderIconsPage() {
  const wrap = page();
  const icons = getData(ICONS_KEY) || {};
  const hidden = new Set(getData(HIDDEN_ICONS_KEY) || []);

  const list = card('应用图标', '改名、换图、隐藏、透明度，都能用');
  APP_LIST.forEach(([id, name]) => {
    const custom = icons[id] || {};
    const image = getRecordImage(custom);
    const opacity = Number(custom.opacity ?? 100);
    const box = el('div', 'settings-widget-bg-item');

    box.append(listAction(hidden.has(id) ? 'settings' : 'star', custom.name || name, hidden.has(id) ? '已隐藏' : image ? `已换图 · 透明度：${opacity}%` : '默认图标', [
      actionBtn('edit', '改名', () => renameIcon(id, name)),
      actionBtn('upload', '换图', () => uploadIcon(id)),
      actionBtn(hidden.has(id) ? 'settings' : 'delete', hidden.has(id) ? '恢复' : '隐藏', () => toggleIconHidden(id))
    ], imagePreview(image, custom.name || name, hidden.has(id) ? 'settings' : 'star')));

    if (image) {
      box.append(labelBlock('图标透明度', rangeBlock(opacity, 0, 100, 1, (value, live) => saveIconOpacity(id, value, live))));
    }

    list.append(box);
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
    actionBtn('delete', '清私聊', clearPrivateMessages),
    actionBtn('delete', '清群聊', clearGroupMessages),
    actionBtn('delete', '清记忆', clearMemoriesOnly),
    actionBtn('delete', '清表情包', clearStickersOnly),
    actionBtn('delete', '清图片装扮', clearVisualData),
    actionBtn('delete', '清游戏关系', clearGameRelations),
    actionBtn('delete', '清聊天全部', clearChatData),
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
    chatSettings: { ...DEFAULT_SETTINGS.chatSettings, ...(saved.chatSettings || {}) },
    mcpServers: Array.isArray(saved.mcpServers) ? saved.mcpServers : [],
    apiEndpoints: Array.isArray(saved.apiEndpoints) ? saved.apiEndpoints : []
  };
}

function saveSettings(settings) {
  setData(SETTINGS_KEY, settings);
  window.dispatchEvent(new CustomEvent('app-settings-updated'));
}

function saveChatSetting(key, value, message) {
  const settings = getSettings();
  settings.chatSettings = { ...DEFAULT_SETTINGS.chatSettings, ...(settings.chatSettings || {}), [key]: value };
  saveSettings(settings);
  emitRefresh();
  showToast(message || '聊天设置保存啦');
  render('chat');
}

function toggleDesktopWidget(key, enabled) {
  const settings = getSettings();
  settings.widgets = { ...DEFAULT_SETTINGS.widgets, ...(settings.widgets || {}), [key]: enabled };
  saveSettings(settings);
  emitRefresh();
  showToast(enabled ? '小组件回到桌面啦' : '小组件已经从桌面移走啦');
  render('widgets');
}

function applyGlobalFontSize(value, save = true) {
  const base = Math.max(12, Math.min(24, Number(value) || 15));
  const small = Math.max(10, Math.round(base * 0.86));
  const title = Math.max(15, Math.round(base * 1.14));

  applyTheme({
    'font-size-base': `${base}px`,
    'font-size-small': `${small}px`,
    'font-size-title': `${title}px`
  });

  document.documentElement.style.setProperty('--font-size-base', `${base}px`);
  document.documentElement.style.setProperty('--font-size-small', `${small}px`);
  document.documentElement.style.setProperty('--font-size-title', `${title}px`);

  if (save) saveTheme();
}

function normalizeOpacityValue(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
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

function selectApiModel(id, model) {
  const settings = getSettings();
  settings.apiEndpoints = settings.apiEndpoints.map((api) => api.id === id ? { ...api, model } : api);

  if (settings.defaultApiEndpointId === id) {
    settings.defaultModel = model;
  }

  saveSettings(settings);
  showToast(`模型抱好啦：${model}`);
  render('api');
}

async function loadApiModels(id) {
  const models = await fetchModels(id);
  if (!models.length) {
    showToast('没拉到模型');
    return;
  }

  const settings = getSettings();
  settings.apiEndpoints = settings.apiEndpoints.map((api) => api.id === id ? { ...api, modelList: models } : api);

  saveSettings(settings);
  showToast(`拉到 ${models.length} 个模型啦，自己挑一个吧`);
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
  let draftModelList = Array.isArray(current.modelList) ? [...current.modelList] : [];

  const sheet = sheetBox(api ? '编辑 API' : '新增 API');
  const name = inputRow('名字', current.name, '比如：主力模型');
  const endpoint = inputRow('Endpoint', current.endpoint, 'https://api.xxx.com');
  const apiKey = inputRow('API Key', current.apiKey, 'sk-...');
  const model = inputRow('当前模型', current.model, '先拉取模型，再点选');

  const modelArea = el('div', 'settings-editor-model-area');

  function renderEditorModels() {
    modelArea.innerHTML = '';
    modelArea.append(modelPicker({
      models: draftModelList,
      current: model.input.value.trim(),
      emptyText: '还没有模型，点下面“拉取模型”就会出现啦',
      onSelect: (value) => {
        model.input.value = value;
        renderEditorModels();
        showToast(`已选择：${value}`);
      }
    }));
  }

  renderEditorModels();
  sheet.body.append(name.wrap, endpoint.wrap, apiKey.wrap, model.wrap, modelArea);

  sheet.actions.append(
    actionBtn('refresh', '拉取模型', async () => {
      const base = normalizeEndpoint(endpoint.input.value);
      const key = apiKey.input.value.trim();

      if (!base) {
        showToast('先填 Endpoint 哦');
        return;
      }

      try {
        const res = await fetch(`${base}/v1/models`, {
          method: 'GET',
          headers: key ? { Authorization: `Bearer ${key}` } : {},
          cache: 'no-store'
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);

        const data = await res.json().catch(() => null);
        const models = (data?.data || [])
          .map((item) => typeof item === 'string' ? item : item?.id)
          .filter(Boolean);

        if (!models.length) {
          showToast('没有找到可选模型');
          return;
        }

        draftModelList = [...new Set(models)];
        renderEditorModels();
        showToast(`拉到 ${draftModelList.length} 个模型啦，自己挑一个`);
      } catch {
        showToast('模型拉取失败，检查 Endpoint 或 Key');
      }
    }),
    actionBtn('check', '保存', () => {
      const settings = getSettings();
      const next = {
        id: current.id,
        name: name.input.value.trim(),
        endpoint: endpoint.input.value.trim(),
        apiKey: apiKey.input.value.trim(),
        model: model.input.value.trim(),
        modelList: draftModelList
      };

      settings.apiEndpoints = [...settings.apiEndpoints.filter((item) => item.id !== current.id), next];
      if (!settings.defaultApiEndpointId) settings.defaultApiEndpointId = next.id;
      if (!settings.defaultModel && next.model) settings.defaultModel = next.model;

      saveSettings(settings);
      hideBottomSheet();
      showToast('API 存好啦');
      render('api');
    })
  );

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

  if (Array.isArray(tts.modelList) && tts.modelList.length) {
    sheet.body.append(modelPicker({
      models: tts.modelList,
      current: tts.model,
      onSelect: (value) => {
        model.input.value = value;
        showToast(`声音模型先抱住：${value}`);
      }
    }));
  }

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

function selectTtsModel(model) {
  const settings = getSettings();
  settings.ttsGlobal.model = model;
  saveSettings(settings);
  showToast(`声音模型选好啦：${model}`);
  render('tts');
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
    saveSettings(settings);
    showToast(`TTS 拉到 ${models.length} 个声音模型啦，自己挑一个`);
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

async function saveWallpaperOpacity(value, live) {
  const opacity = normalizeOpacityValue(value);
  setData(WALLPAPER_OPACITY_KEY, opacity);

  const record = await getDB('blobs', WALLPAPER_KEY);
  if (record) {
    await setDB('blobs', WALLPAPER_KEY, { ...record, opacity, updatedAt: getNow() });
  }

  emitRefresh();
  if (!live) showToast('壁纸透明度存好啦');
}

function saveWidgetBgOpacity(key, value, live) {
  const opacity = normalizeOpacityValue(value);
  const all = getData(WIDGET_BACKGROUNDS_KEY) || {};
  if (!all[key]) return;

  all[key] = { ...all[key], opacity, updatedAt: getNow() };
  setData(WIDGET_BACKGROUNDS_KEY, all);
  emitRefresh();
  if (!live) showToast('小卡片透明度存好啦');
}

function saveCustomWidgetOpacity(id, value, live) {
  const opacity = normalizeOpacityValue(value);
  const list = getData(CUSTOM_WIDGETS_KEY) || [];
  const next = list.map((item) => item.id === id ? { ...item, opacity, updatedAt: getNow() } : item);
  setData(CUSTOM_WIDGETS_KEY, next);
  emitRefresh();
  if (!live) showToast('小组件透明度存好啦');
}

async function saveIconOpacity(id, value, live) {
  const opacity = normalizeOpacityValue(value);
  const icons = getData(ICONS_KEY) || {};
  const current = icons[id] || {};

  icons[id] = { ...current, opacity, updatedAt: getNow() };
  setData(ICONS_KEY, icons);

  if (current.blobKey) {
    const record = await getDB('blobs', current.blobKey);
    if (record) await setDB('blobs', current.blobKey, { ...record, opacity, updatedAt: getNow() });
  }

  emitRefresh();
  if (!live) showToast('图标透明度存好啦');
}

async function uploadBlobImage(key, opacityKey, msg) {
  const file = await pickFile('image/*');
  if (!file) return;

  const dataUrl = await readFileAsDataUrl(file);
  const opacity = Number(getData(opacityKey) ?? 100);
  await setDB('blobs', key, { key, value: dataUrl, source: file.name, opacity, updatedAt: getNow() });

  if (opacityKey) setData(opacityKey, opacity);
  showToast(msg || '图片上传好啦');
  emitRefresh();
  render(route);
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
  const old = all[key] || {};
  all[key] = { key, value: dataUrl, source: file.name, opacity: Number(old.opacity ?? 100), updatedAt: getNow() };

  setData(WIDGET_BACKGROUNDS_KEY, all);
  showToast('小卡片背景换好啦');
  emitRefresh();
  render('widgets');
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
  const opacity = rangeBlock(Number(current.opacity ?? 100), 0, 100, 1, () => {});

  let image = current.image || '';
  sheet.body.append(name.wrap, text.wrap, shape.wrap, labelBlock('透明度', opacity));
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
      const range = opacity.querySelector('input');
      const next = {
        id: current.id,
        name: name.input.value.trim(),
        shape: shape.input.value,
        image,
        imageSource: image ? 'upload' : '',
        text: text.input.value.trim(),
        opacity: normalizeOpacityValue(range?.value ?? current.opacity ?? 100),
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
  const opacity = Number(current.opacity ?? 100);

  await setDB('blobs', blobKey, { key: blobKey, value: dataUrl, source: file.name, opacity, updatedAt: getNow() });

  icons[id] = {
    ...current,
    image: dataUrl,
    iconImage: dataUrl,
    backgroundImage: dataUrl,
    imageBase64: dataUrl,
    blobKey,
    opacity,
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
    'app_theme_mode',
    ...CHAT_LOCAL_KEYS
  ].forEach((key) => {
    data.localStorage[key] = getData(key);
  });

  for (const store of DB_STORES) {
    try {
      data.indexedDB[store] = await getAllDB(store);
    } catch {
      data.indexedDB[store] = [];
    }
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
      try {
        await clearStoreDB(store);
        for (const item of data.indexedDB[store]) await setDB(store, item.key || item.id, item);
      } catch {}
    }

    showToast('导入完成啦');
    emitRefresh();
    render('data');
  } catch {
    showToast('导入失败了');
  }
}

async function clearPrivateMessages() {
  const ok = await showConfirm('只清空私聊记录，可以吗？');
  if (!ok) return;

  await clearStoreDB('messages');
  removeData('chat_unread_counts');
  removeData('chat_hidden_private_threads');
  showToast('私聊清好啦');
  emitRefresh();
}

async function clearGroupMessages() {
  const ok = await showConfirm('只清空群聊记录，可以吗？');
  if (!ok) return;

  await clearStoreDB('group_messages');
  showToast('群聊清好啦');
  emitRefresh();
}

async function clearMemoriesOnly() {
  const ok = await showConfirm('只清空记忆，可以吗？');
  if (!ok) return;

  await clearStoreDB('memories');
  showToast('记忆清好啦');
  emitRefresh();
}

async function clearStickersOnly() {
  const ok = await showConfirm('只清空表情包，可以吗？');
  if (!ok) return;

  await clearStoreDB('stickers');
  showToast('表情包清好啦');
  emitRefresh();
}

async function clearVisualData() {
  const ok = await showConfirm('要清掉壁纸、图标、小组件图片这些装扮吗？字体不会被清掉。');
  if (!ok) return;

  removeData(ICONS_KEY);
  removeData(WALLPAPER_OPACITY_KEY);
  removeData(WIDGET_BACKGROUNDS_KEY);
  removeData(CUSTOM_WIDGETS_KEY);

  const blobs = await getAllDB('blobs').catch(() => []);
  for (const item of blobs) {
    const key = item?.key || item?.id || '';
    if (
      key === WALLPAPER_KEY ||
      key.startsWith('app_icon_') ||
      key.startsWith('custom_widget_') ||
      key.startsWith('app_bg_') ||
      key.includes('_bg_')
    ) {
      await deleteDB('blobs', key);
    }
  }

  showToast('图片装扮清好啦');
  emitRefresh();
  render('data');
}

async function clearGameRelations() {
  const ok = await showConfirm('要清掉记仇、惩罚、关系锁这些游戏关系吗？');
  if (!ok) return;

  for (const store of ['grudges', 'punishments', 'relationship_locks']) {
    try {
      await clearStoreDB(store);
    } catch {}
  }

  showToast('游戏关系清好啦');
  emitRefresh();
}

async function clearChatData() {
  const ok = await showConfirm('清空聊天、群聊、记忆和聊天状态，可以吗？');
  if (!ok) return;

  await clearStoreDB('messages');
  await clearStoreDB('group_messages');
  await clearStoreDB('memories');
  CHAT_LOCAL_KEYS.forEach(removeData);

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
    'app_theme_mode',
    ...CHAT_LOCAL_KEYS
  ].forEach(removeData);

  for (const store of DB_STORES) {
    try {
      await clearStoreDB(store);
    } catch {}
  }

  showToast('都清空啦');
  emitRefresh();
  render('data');
}
