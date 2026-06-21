import * as Storage from '../core/storage.js';
import * as Theme from '../core/theme.js';
import * as Api from '../core/api.js';
import * as UI from '../core/ui.js';

const APP_ID = 'settings';

const DEFAULT_APPS = [
  { id: 'chat', name: '消息', module: '/apps/chat.js' },
  { id: 'moments', name: '朋友圈', module: '/apps/moments.js' },
  { id: 'characters', name: '角色管理', module: '/apps/characters.js' },
  { id: 'worldbook', name: '世界书', module: '/apps/worldbook.js' },
  { id: 'games', name: '小游戏', module: '/apps/games.js' },
  { id: 'shop', name: '商店', module: '/apps/shop.js' },
  { id: 'wallet', name: '钱包', module: '/apps/wallet.js' },
  { id: 'memo', name: '备忘录', module: '/apps/memo.js' },
  { id: 'anniversary', name: '纪念日', module: '/apps/anniversary.js' },
  { id: 'settings', name: '设置', module: '/apps/settings.js' },
];

const DEFAULT_SETTINGS = {
  apiConfigs: [],
  currentApiConfigId: '',
  ttsConfigs: [],
  currentTtsConfigId: '',
  mcpServers: [],
  personalization: {
    wallpaper: '',
    bubbleMode: 'bubble',
    fontSize: 15,
    chatBackground: '',
    widgets: {
      clock: true,
      weather: true,
      anniversary: true,
    },
    userProfile: {
      nickname: '我',
      avatar: '',
    },
    apps: {},
  },
  appThemes: {},
  stickerPacks: [],
};

const DEFAULT_APP_THEME = {
  backgroundImage: '',
  accent: '',
  radius: 18,
  fontSize: 15,
};

const PRESET_THEMES = [
  {
    id: 'cream',
    name: '奶油白',
    variables: {
      '--bg-primary': '#FAFAFA',
      '--bg-secondary': '#F3F3F3',
      '--bg-card': '#FFFFFF',
      '--accent': '#E8A0AE',
      '--accent-light': '#F8DDE4',
      '--accent-dark': '#C87986',
      '--text-primary': '#1A1A1A',
      '--text-secondary': '#888888',
      '--bubble-user-bg': '#E8A0AE',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#1A1A1A',
    },
  },
  {
    id: 'sakura',
    name: '樱花粉',
    variables: {
      '--bg-primary': '#FFF8F8',
      '--bg-secondary': '#F8ECEF',
      '--bg-card': '#FFFFFF',
      '--accent': '#E99AAA',
      '--accent-light': '#F9DCE3',
      '--accent-dark': '#C97886',
      '--text-primary': '#241B1D',
      '--text-secondary': '#8B777C',
      '--bubble-user-bg': '#E99AAA',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#241B1D',
    },
  },
  {
    id: 'sand',
    name: '暖砂',
    variables: {
      '--bg-primary': '#FBF7F0',
      '--bg-secondary': '#F1E9DD',
      '--bg-card': '#FFFFFF',
      '--accent': '#D79B72',
      '--accent-light': '#F4DDCC',
      '--accent-dark': '#B77B53',
      '--text-primary': '#211A15',
      '--text-secondary': '#8A7D72',
      '--bubble-user-bg': '#D79B72',
      '--bubble-user-text': '#FFFFFF',
      '--bubble-ai-bg': '#FFFFFF',
      '--bubble-ai-text': '#211A15',
    },
  },
  {
    id: 'night',
    name: '夜间',
    variables: {
      '--bg-primary': '#151312',
      '--bg-secondary': '#211E1C',
      '--bg-card': '#2A2522',
      '--accent': '#D19483',
      '--accent-light': '#46302B',
      '--accent-dark': '#B77766',
      '--text-primary': '#F7F1EC',
      '--text-secondary': '#B9AAA1',
      '--bubble-user-bg': '#D19483',
      '--bubble-user-text': '#211A15',
      '--bubble-ai-bg': '#2A2522',
      '--bubble-ai-text': '#F7F1EC',
    },
  },
];

let rootEl = null;
let routeBack = null;
let openSectionId = '';
let openPersonalCategory = '';
let apiDrawerOpen = false;
let editingApiId = '';
let visibleKeys = {};
let apiModelOptions = {};
let activeAppThemeId = 'chat';

function createId(prefix = 'id') {
  if (crypto && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function readStore() {
  if (typeof Storage.getState === 'function') return Storage.getState();
  if (typeof Storage.getAllData === 'function') return Storage.getAllData();
  if (typeof Storage.loadData === 'function') return Storage.loadData();
  return safeParse(localStorage.getItem('ai_phone_store'), {});
}

function writeStore(store) {
  if (typeof Storage.setState === 'function') return Storage.setState(store);
  if (typeof Storage.saveAllData === 'function') return Storage.saveAllData(store);
  if (typeof Storage.saveData === 'function') return Storage.saveData(store);
  localStorage.setItem('ai_phone_store', JSON.stringify(store));
  window.dispatchEvent(new CustomEvent('ai-phone:data-change', { detail: store }));
}

function readSettings() {
  if (typeof Storage.getSettings === 'function') {
    return mergeSettings(Storage.getSettings());
  }

  const store = readStore();
  const standalone = safeParse(localStorage.getItem('ai_phone_settings'), null);
  return mergeSettings(store.settings || standalone || {});
}

function writeSettings(settings) {
  const normalized = mergeSettings(settings);

  if (typeof Storage.saveSettings === 'function') {
    Storage.saveSettings(normalized);
  } else if (typeof Storage.setSettings === 'function') {
    Storage.setSettings(normalized);
  } else {
    const store = readStore();
    store.settings = normalized;
    writeStore(store);
    localStorage.setItem('ai_phone_settings', JSON.stringify(normalized));
  }

  window.dispatchEvent(new CustomEvent('ai-phone:settings-change', { detail: normalized }));
  window.dispatchEvent(new CustomEvent('ai-phone:personalization-change', { detail: normalized.personalization }));
}

function mergeSettings(settings) {
  const source = settings || {};
  const merged = clone(DEFAULT_SETTINGS);

  merged.apiConfigs = Array.isArray(source.apiConfigs) ? source.apiConfigs : [];
  merged.currentApiConfigId = source.currentApiConfigId || source.defaultApiConfigId || '';

  merged.ttsConfigs = Array.isArray(source.ttsConfigs) ? source.ttsConfigs : [];
  merged.currentTtsConfigId = source.currentTtsConfigId || source.defaultTtsConfigId || '';

  merged.mcpServers = Array.isArray(source.mcpServers) ? source.mcpServers : [];

  merged.personalization = {
    ...merged.personalization,
    ...(source.personalization || {}),
    widgets: {
      ...merged.personalization.widgets,
      ...((source.personalization && source.personalization.widgets) || {}),
    },
    userProfile: {
      ...merged.personalization.userProfile,
      ...((source.personalization && source.personalization.userProfile) || {}),
    },
    apps: {
      ...((source.personalization && source.personalization.apps) || {}),
    },
  };

  merged.appThemes = {
    ...(source.appThemes || {}),
  };

  merged.stickerPacks = Array.isArray(source.stickerPacks) ? source.stickerPacks : [];

  return merged;
}

function getCharacters() {
  if (typeof Storage.getCharacters === 'function') return Storage.getCharacters();
  const store = readStore();
  return Array.isArray(store.characters) ? store.characters : safeParse(localStorage.getItem('ai_phone_characters'), []);
}

function saveCharacters(characters) {
  if (typeof Storage.saveCharacters === 'function') return Storage.saveCharacters(characters);
  const store = readStore();
  store.characters = characters;
  writeStore(store);
  localStorage.setItem('ai_phone_characters', JSON.stringify(characters));
}

function setThemeVariables(variables) {
  Object.entries(variables || {}).forEach(([key, value]) => {
    if (key.startsWith('--') && value) document.documentElement.style.setProperty(key, value);
  });
}

function applyPresetTheme(theme) {
  if (Theme && typeof Theme.applyTheme === 'function') {
    Theme.applyTheme(theme.id);
  } else if (Theme && typeof Theme.setThemeVariables === 'function') {
    Theme.setThemeVariables(theme.variables);
  } else {
    setThemeVariables(theme.variables);
    localStorage.setItem('ai_phone_theme', JSON.stringify(theme));
  }
  window.dispatchEvent(new CustomEvent('ai-phone:theme-change', { detail: theme }));
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function exportFile(filename, data) {
  const blob = new Blob([typeof data === 'string' ? data : JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 300);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function maskKey(key) {
  if (!key) return '未填写';
  if (key.length <= 8) return key;
  return `${key.slice(0, 4)} ${'•'.repeat(Math.min(12, key.length - 8))} ${key.slice(-4)}`;
}

function normalizeEndpoint(endpoint) {
  return String(endpoint || '').trim().replace(/\/+$/, '');
}

function joinModelUrl(endpoint) {
  const clean = normalizeEndpoint(endpoint);
  if (!clean) return '';
  if (clean.endsWith('/v1')) return `${clean}/models`;
  if (clean.endsWith('/v1/models')) return clean;
  return `${clean}/v1/models`;
}

function toast(message) {
  if (UI && typeof UI.toast === 'function') return UI.toast(message);
  const el = document.createElement('div');
  el.className = 'settings-toast';
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('is-visible'));
  setTimeout(() => {
    el.classList.remove('is-visible');
    setTimeout(() => el.remove(), 220);
  }, 1600);
}

function svgIcon(name) {
  const icons = {
    back: '<path d="M15 18l-6-6 6-6"></path>',
    chevron: '<path d="M9 6l6 6-6 6"></path>',
    plus: '<path d="M12 5v14M5 12h14"></path>',
    edit: '<path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4z"></path><path d="M13.5 6.5l4 4"></path>',
    trash: '<path d="M6 7h12"></path><path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M8 7l1 13h6l1-13"></path><path d="M10 7V4h4v3"></path>',
    eye: '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"></path><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"></path>',
    eyeOff: '<path d="M3 3l18 18"></path><path d="M10.6 10.6A2 2 0 0 0 13.4 13.4"></path><path d="M9.1 5.4A9.7 9.7 0 0 1 12 5c6 0 9.5 7 9.5 7a16.8 16.8 0 0 1-3 4.1"></path><path d="M6.2 6.9C3.8 8.6 2.5 12 2.5 12s3.5 7 9.5 7a9.6 9.6 0 0 0 4.2-.9"></path>',
    download: '<path d="M12 4v10"></path><path d="M8 10l4 4 4-4"></path><path d="M5 20h14"></path>',
    upload: '<path d="M12 20V10"></path><path d="M8 14l4-4 4 4"></path><path d="M5 4h14"></path>',
    image: '<path d="M5 5h14v14H5z"></path><path d="M8 15l3-3 2 2 2-3 3 4"></path><path d="M9 9h.01"></path>',
    user: '<path d="M20 21a8 8 0 0 0-16 0"></path><path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"></path>',
    palette: '<path d="M12 21a9 9 0 1 1 9-9c0 1.7-1 2.5-2.5 2.5H17a2 2 0 0 0-2 2c0 .7.3 1.1.3 1.7 0 1.5-1.3 2.8-3.3 2.8z"></path><path d="M7.5 10h.01M10 7h.01M14 7h.01M16.5 10h.01"></path>',
    database: '<path d="M5 6c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3z"></path><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"></path><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"></path>',
    message: '<path d="M4 5h16v11H8l-4 4V5z"></path>',
    grid: '<path d="M4 4h6v6H4z"></path><path d="M14 4h6v6h-6z"></path><path d="M4 14h6v6H4z"></path><path d="M14 14h6v6h-6z"></path>',
    settings: '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z"></path><path d="M19.4 15a1.8 1.8 0 0 0 .3 2l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.8 1.8 0 0 0-2-.3 1.8 1.8 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.8 1.8 0 0 0-1-1.6 1.8 1.8 0 0 0-2 .3l-.1.1A2 2 0 1 1 4 16.9l.1-.1a1.8 1.8 0 0 0 .3-2 1.8 1.8 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.8 1.8 0 0 0 1.6-1 1.8 1.8 0 0 0-.3-2l-.1-.1A2 2 0 1 1 7.1 4l.1.1a1.8 1.8 0 0 0 2 .3h.1a1.8 1.8 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.8 1.8 0 0 0 1 1.6 1.8 1.8 0 0 0 2-.3l.1-.1A2 2 0 1 1 20 7.1l-.1.1a1.8 1.8 0 0 0-.3 2v.1a1.8 1.8 0 0 0 1.6 1h.1a2 2 0 1 1 0 4h-.1a1.8 1.8 0 0 0-1.8.7z"></path>',
    link: '<path d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"></path><path d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"></path>',
    close: '<path d="M6 6l12 12M18 6L6 18"></path>',
  };

  return `<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.settings}</svg>`;
}

function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);

  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key === 'class') el.className = value;
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'text') el.textContent = value;
    else if (key === 'style') Object.assign(el.style, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value);
  });

  const list = Array.isArray(children) ? children : [children];
  list.forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else el.appendChild(child);
  });

  return el;
}

function field(label, input) {
  return h('label', { class: 'settings-field' }, [
    h('span', { text: label }),
    input,
  ]);
}

function textInput(value, placeholder, onInput, options = {}) {
  return h('input', {
    class: 'settings-input',
    type: options.type || 'text',
    value: value || '',
    placeholder: placeholder || '',
    inputmode: options.inputmode || '',
    oninput: (event) => onInput(event.target.value),
  });
}

function textareaInput(value, placeholder, onInput) {
  return h('textarea', {
    class: 'settings-textarea',
    rows: '4',
    placeholder: placeholder || '',
    oninput: (event) => onInput(event.target.value),
  }, value || '');
}

function selectInput(value, options, onChange) {
  const select = h('select', {
    class: 'settings-input',
    onchange: (event) => onChange(event.target.value),
  });

  options.forEach((item) => {
    select.appendChild(h('option', {
      value: item.value,
      text: item.label,
      selected: item.value === value,
    }));
  });

  return select;
}

function primaryButton(label, onClick, attrs = {}) {
  return h('button', {
    class: `settings-button primary ${attrs.class || ''}`,
    type: 'button',
    onclick: onClick,
    html: `${attrs.icon ? svgIcon(attrs.icon) : ''}<span>${label}</span>`,
  });
}

function quietButton(label, onClick, attrs = {}) {
  return h('button', {
    class: `settings-button quiet ${attrs.class || ''}`,
    type: 'button',
    onclick: onClick,
    html: `${attrs.icon ? svgIcon(attrs.icon) : ''}<span>${label}</span>`,
  });
}

function iconButton(icon, label, onClick) {
  return h('button', {
    class: 'settings-icon-button',
    type: 'button',
    title: label,
    'aria-label': label,
    onclick: onClick,
    html: svgIcon(icon),
  });
}

function sectionCard(id, title, subtitle, icon, contentRenderer) {
  const isOpen = openSectionId === id;

  return h('section', { class: `settings-section ${isOpen ? 'is-open' : ''}` }, [
    h('button', {
      class: 'settings-section-head',
      type: 'button',
      onclick: () => {
        openSectionId = isOpen ? '' : id;
        openPersonalCategory = '';
        render();
      },
    }, [
      h('span', { class: 'settings-section-icon', html: svgIcon(icon) }),
      h('span', { class: 'settings-section-title-wrap' }, [
        h('strong', { text: title }),
        h('small', { text: subtitle }),
      ]),
      h('span', { class: 'settings-section-arrow', html: svgIcon('chevron') }),
    ]),
    isOpen ? h('div', { class: 'settings-section-body' }, contentRenderer()) : null,
  ]);
}

function renderHeader() {
  return h('header', { class: 'app-header settings-header' }, [
    quietButton('返回', () => {
      if (typeof routeBack === 'function') routeBack();
      else window.dispatchEvent(new CustomEvent('ai-phone:back-home'));
    }, { icon: 'back', class: 'settings-back-button' }),
    h('div', { class: 'settings-title-block' }, [
      h('h1', { text: '设置' }),
      h('p', { text: '整理接口、主题和个人偏好' }),
    ]),
  ]);
}

function renderApiSection() {
  const settings = readSettings();
  const configs = settings.apiConfigs || [];

  return h('div', { class: 'settings-stack' }, [
    h('div', { class: 'settings-row-between' }, [
      h('div', {}, [
        h('strong', { class: 'settings-mini-title', text: 'API配置' }),
        h('p', { class: 'settings-muted', text: '支持 OpenAI 格式端点，可为聊天实时切换模型' }),
      ]),
      primaryButton('新增', () => {
        editingApiId = '';
        apiDrawerOpen = true;
        render();
      }, { icon: 'plus' }),
    ]),
    configs.length ? h('div', { class: 'settings-card-list' }, configs.map(renderApiCard)) : h('div', { class: 'settings-empty', text: '还没有API配置，请新增一个端点' }),
  ]);
}

function renderApiCard(config) {
  const settings = readSettings();
  const isDefault = settings.currentApiConfigId === config.id;
  const keyVisible = Boolean(visibleKeys[config.id]);
  const models = apiModelOptions[config.id] || config.models || [];
  const modelOptions = [
    { value: '', label: '未选择模型' },
    ...models.map((model) => ({ value: model, label: model })),
  ];

  return h('article', { class: 'settings-api-card' }, [
    h('div', { class: 'settings-api-main' }, [
      h('div', { class: 'settings-api-topline' }, [
        h('strong', { text: config.name || '未命名配置' }),
        isDefault ? h('span', { class: 'settings-pill', text: '当前默认' }) : null,
      ]),
      h('p', { class: 'settings-muted mono', text: config.endpoint || '未填写 endpoint' }),
      h('div', { class: 'settings-key-line' }, [
        h('span', { text: keyVisible ? (config.apiKey || '未填写') : maskKey(config.apiKey) }),
        iconButton(keyVisible ? 'eyeOff' : 'eye', keyVisible ? '隐藏Key' : '显示Key', () => {
          visibleKeys[config.id] = !keyVisible;
          render();
        }),
      ]),
      h('div', { class: 'settings-inline-grid' }, [
        field('已选模型', h('div', { class: 'settings-model-combo' }, [
          selectInput(config.model || '', modelOptions, (value) => {
            updateApiConfig(config.id, { model: value });
          }),
          textInput(config.model || '', '也可以手动输入模型名', (value) => {
            updateApiConfig(config.id, { model: value });
          }),
        ])),
      ]),
    ]),
    h('div', { class: 'settings-api-actions' }, [
      quietButton('拉取模型', () => fetchModels(config), { icon: 'download' }),
      quietButton('设为默认', () => {
        const next = readSettings();
        next.currentApiConfigId = config.id;
        writeSettings(next);
        render();
      }),
      quietButton('编辑', () => {
        editingApiId = config.id;
        apiDrawerOpen = true;
        render();
      }, { icon: 'edit' }),
      quietButton('删除', () => {
        deleteApiConfig(config.id);
      }, { icon: 'trash' }),
    ]),
  ]);
}

function updateApiConfig(id, patch) {
  const settings = readSettings();
  settings.apiConfigs = settings.apiConfigs.map((item) => item.id === id ? { ...item, ...patch } : item);
  writeSettings(settings);
  render();
}

function deleteApiConfig(id) {
  const settings = readSettings();
  settings.apiConfigs = settings.apiConfigs.filter((item) => item.id !== id);
  if (settings.currentApiConfigId === id) settings.currentApiConfigId = settings.apiConfigs[0]?.id || '';
  writeSettings(settings);
  render();
}

async function fetchModels(config) {
  const endpoint = normalizeEndpoint(config.endpoint);
  const apiKey = config.apiKey || '';

  if (!endpoint) {
    toast('请先填写 endpoint');
    return;
  }

  try {
    let models = [];

    if (Api && typeof Api.fetchModels === 'function') {
      models = await Api.fetchModels({ endpoint, apiKey });
    } else {
      const response = await fetch(joinModelUrl(endpoint), {
        method: 'GET',
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          Accept: 'application/json',
        },
      });

      if (!response.ok) throw new Error('fetch models failed');

      const data = await response.json();
      models = Array.isArray(data.data) ? data.data.map((item) => item.id || item.name).filter(Boolean) : [];
    }

    apiModelOptions[config.id] = models;
    updateApiConfig(config.id, {
      models,
      model: config.model || models[0] || '',
    });
    toast(models.length ? '模型列表已更新' : '没有读取到模型，可手动输入');
  } catch {
    apiModelOptions[config.id] = [];
    render();
    toast('拉取失败，可手动输入模型名');
  }
}

function renderApiDrawer() {
  if (!apiDrawerOpen) return null;

  const settings = readSettings();
  const editing = settings.apiConfigs.find((item) => item.id === editingApiId);
  const draft = {
    id: editing?.id || createId('api'),
    name: editing?.name || '',
    endpoint: editing?.endpoint || '',
    apiKey: editing?.apiKey || '',
    model: editing?.model || '',
    models: editing?.models || [],
  };

  const drawer = h('div', { class: 'settings-drawer-mask', onclick: (event) => {
    if (event.target === drawer) {
      apiDrawerOpen = false;
      editingApiId = '';
      render();
    }
  } }, [
    h('div', { class: 'settings-drawer' }, [
      h('div', { class: 'settings-drawer-handle' }),
      h('div', { class: 'settings-row-between' }, [
        h('div', {}, [
          h('strong', { class: 'settings-drawer-title', text: editing ? '编辑API配置' : '新增API配置' }),
          h('p', { class: 'settings-muted', text: 'API Key 使用普通文本框，方便粘贴' }),
        ]),
        iconButton('close', '关闭', () => {
          apiDrawerOpen = false;
          editingApiId = '';
          render();
        }),
      ]),
      h('form', { class: 'settings-form', onsubmit: (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const item = {
          id: draft.id,
          name: String(form.get('name') || '').trim() || '默认配置',
          endpoint: normalizeEndpoint(form.get('endpoint')),
          apiKey: String(form.get('apiKey') || '').trim(),
          model: String(form.get('model') || '').trim(),
          models: draft.models || [],
        };

        const next = readSettings();
        const index = next.apiConfigs.findIndex((config) => config.id === item.id);
        if (index >= 0) next.apiConfigs[index] = item;
        else next.apiConfigs.push(item);
        if (!next.currentApiConfigId) next.currentApiConfigId = item.id;

        writeSettings(next);
        apiDrawerOpen = false;
        editingApiId = '';
        render();
      } }, [
        field('名称', h('input', { class: 'settings-input', type: 'text', name: 'name', value: draft.name, placeholder: '例如：主接口' })),
        field('Endpoint', h('input', { class: 'settings-input', type: 'text', name: 'endpoint', value: draft.endpoint, placeholder: 'https://example.com' })),
        field('API Key', h('input', { class: 'settings-input', type: 'text', name: 'apiKey', value: draft.apiKey, placeholder: '粘贴你的 Key' })),
        field('模型', h('input', { class: 'settings-input', type: 'text', name: 'model', value: draft.model, placeholder: '例如：gpt-4o-mini' })),
        h('div', { class: 'settings-drawer-actions' }, [
          quietButton('取消', () => {
            apiDrawerOpen = false;
            editingApiId = '';
            render();
          }),
          primaryButton(editing ? '保存' : '添加', null),
        ]),
      ]),
    ]),
  ]);

  return drawer;
}

function renderTtsSection() {
  const settings = readSettings();
  const configs = settings.ttsConfigs || [];

  return h('div', { class: 'settings-stack' }, [
    h('div', { class: 'settings-row-between' }, [
      h('div', {}, [
        h('strong', { class: 'settings-mini-title', text: 'TTS配置' }),
        h('p', { class: 'settings-muted', text: '聊天和通话可选择这里的语音配置' }),
      ]),
      primaryButton('新增', () => {
        const next = readSettings();
        next.ttsConfigs.push({
          id: createId('tts'),
          name: '语音配置',
          provider: 'openai',
          voice: 'nova',
          endpoint: '',
          apiKey: '',
          enabled: true,
        });
        if (!next.currentTtsConfigId) next.currentTtsConfigId = next.ttsConfigs[0].id;
        writeSettings(next);
        render();
      }, { icon: 'plus' }),
    ]),
    configs.length ? h('div', { class: 'settings-card-list' }, configs.map((config) => renderTtsCard(config))) : h('div', { class: 'settings-empty', text: '还没有语音配置' }),
  ]);
}

function renderTtsCard(config) {
  return h('article', { class: 'settings-soft-card' }, [
    field('名称', textInput(config.name, '名称', (value) => updateTtsConfig(config.id, { name: value }))),
    field('服务商', textInput(config.provider, 'openai', (value) => updateTtsConfig(config.id, { provider: value }))),
    field('声音', textInput(config.voice, 'nova', (value) => updateTtsConfig(config.id, { voice: value }))),
    field('Endpoint', textInput(config.endpoint, 'https://api.openai.com', (value) => updateTtsConfig(config.id, { endpoint: value }))),
    field('API Key', textInput(config.apiKey, '普通文本输入框', (value) => updateTtsConfig(config.id, { apiKey: value }))),
    h('div', { class: 'settings-row-between' }, [
      renderSwitch('启用', Boolean(config.enabled), (checked) => updateTtsConfig(config.id, { enabled: checked })),
      quietButton('删除', () => {
        const settings = readSettings();
        settings.ttsConfigs = settings.ttsConfigs.filter((item) => item.id !== config.id);
        if (settings.currentTtsConfigId === config.id) settings.currentTtsConfigId = settings.ttsConfigs[0]?.id || '';
        writeSettings(settings);
        render();
      }, { icon: 'trash' }),
    ]),
  ]);
}

function updateTtsConfig(id, patch) {
  const settings = readSettings();
  settings.ttsConfigs = settings.ttsConfigs.map((item) => item.id === id ? { ...item, ...patch } : item);
  writeSettings(settings);
}

function renderMcpSection() {
  const settings = readSettings();
  const servers = settings.mcpServers || [];

  return h('div', { class: 'settings-stack' }, [
    h('div', { class: 'settings-row-between' }, [
      h('div', {}, [
        h('strong', { class: 'settings-mini-title', text: 'MCP服务器' }),
        h('p', { class: 'settings-muted', text: '聊天配置面板可按对话启用工具' }),
      ]),
      primaryButton('新增', () => {
        const next = readSettings();
        next.mcpServers.push({
          id: createId('mcp'),
          name: '工具服务器',
          url: '',
          group: '默认',
          enabled: true,
          tools: [],
        });
        writeSettings(next);
        render();
      }, { icon: 'plus' }),
    ]),
    servers.length ? h('div', { class: 'settings-card-list' }, servers.map(renderMcpCard)) : h('div', { class: 'settings-empty', text: '还没有MCP服务器' }),
  ]);
}

function renderMcpCard(server) {
  return h('article', { class: 'settings-soft-card' }, [
    field('名称', textInput(server.name, '名称', (value) => updateMcpServer(server.id, { name: value }))),
    field('分组', textInput(server.group, '默认', (value) => updateMcpServer(server.id, { group: value }))),
    field('URL', textInput(server.url, 'https://example.com/mcp', (value) => updateMcpServer(server.id, { url: value }))),
    h('div', { class: 'settings-row-between' }, [
      renderSwitch('启用', Boolean(server.enabled), (checked) => updateMcpServer(server.id, { enabled: checked })),
      quietButton('删除', () => {
        const settings = readSettings();
        settings.mcpServers = settings.mcpServers.filter((item) => item.id !== server.id);
        writeSettings(settings);
        render();
      }, { icon: 'trash' }),
    ]),
  ]);
}

function updateMcpServer(id, patch) {
  const settings = readSettings();
  settings.mcpServers = settings.mcpServers.map((item) => item.id === id ? { ...item, ...patch } : item);
  writeSettings(settings);
}

function renderThemeSection() {
  return h('div', { class: 'settings-stack' }, [
    h('strong', { class: 'settings-mini-title', text: '预设主题' }),
    h('div', { class: 'settings-theme-grid' }, PRESET_THEMES.map((theme) => {
      return h('button', {
        class: 'settings-theme-card',
        type: 'button',
        onclick: () => {
          applyPresetTheme(theme);
          toast('主题已切换');
        },
      }, [
        h('span', {
          class: 'settings-theme-preview',
          style: {
            background: theme.variables['--bg-primary'],
            color: theme.variables['--accent'],
          },
        }, [
          h('i', { style: { background: theme.variables['--accent'] } }),
          h('i', { style: { background: theme.variables['--bg-secondary'] } }),
          h('i', { style: { background: theme.variables['--bg-card'] } }),
        ]),
        h('strong', { text: theme.name }),
      ]);
    })),
    h('div', { class: 'settings-actions-row' }, [
      quietButton('导出主题', () => {
        const variables = {};
        [
          '--bg-primary',
          '--bg-secondary',
          '--bg-card',
          '--accent',
          '--accent-light',
          '--accent-dark',
          '--text-primary',
          '--text-secondary',
          '--bubble-user-bg',
          '--bubble-user-text',
          '--bubble-ai-bg',
          '--bubble-ai-text',
          '--bubble-radius',
          '--font-size-base',
        ].forEach((key) => variables[key] = getCssVar(key));

        exportFile('theme.json', {
          name: '自定义主题',
          version: '1.0',
          variables,
        });
      }, { icon: 'download' }),
      h('label', { class: 'settings-button quiet' }, [
        h('span', { html: svgIcon('upload') }),
        h('span', { text: '导入主题' }),
        h('input', {
          type: 'file',
          accept: 'application/json',
          class: 'settings-hidden-input',
          onchange: async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const json = safeParse(await readFileAsText(file), null);
            if (json && json.variables) {
              setThemeVariables(json.variables);
              localStorage.setItem('ai_phone_theme', JSON.stringify(json));
              toast('主题已导入');
            } else {
              toast('主题文件无法读取');
            }
          },
        }),
      ]),
    ]),
    h('details', { class: 'settings-details' }, [
      h('summary', { text: '自定义编辑' }),
      h('div', { class: 'settings-form' }, [
        field('强调色', textInput(getCssVar('--accent'), '#E8A0AE', (value) => document.documentElement.style.setProperty('--accent', value))),
        field('气泡圆角', textInput(getCssVar('--bubble-radius'), '18px', (value) => document.documentElement.style.setProperty('--bubble-radius', value))),
        field('正文字号', textInput(getCssVar('--font-size-base'), '15px', (value) => document.documentElement.style.setProperty('--font-size-base', value))),
        field('用户气泡', textInput(getCssVar('--bubble-user-bg'), '#E8A0AE', (value) => document.documentElement.style.setProperty('--bubble-user-bg', value))),
      ]),
    ]),
  ]);
}

function renderPersonalizationSection() {
  const categories = [
    { id: 'desktop', title: '桌面', subtitle: '壁纸、图标管理、小组件开关', icon: 'grid', render: renderPersonalDesktop },
    { id: 'theme', title: '主题', subtitle: '预设主题、导入导出、自定义编辑', icon: 'palette', render: renderPersonalTheme },
    { id: 'message', title: '消息', subtitle: '气泡模式、字体大小、聊天背景', icon: 'message', render: renderPersonalMessage },
    { id: 'appIcons', title: '应用图标', subtitle: '替换图标和修改名称', icon: 'image', render: renderPersonalAppIcons },
    { id: 'profile', title: '我的资料', subtitle: '头像和昵称', icon: 'user', render: renderPersonalProfile },
    { id: 'appThemes', title: '应用外观', subtitle: '统一管理每个应用的独立自定义', icon: 'settings', render: renderPersonalAppThemes },
  ];

  return h('div', { class: 'settings-personal-list' }, categories.map((item) => renderPersonalCategory(item)));
}

function renderPersonalCategory(item) {
  const isOpen = openPersonalCategory === item.id;

  return h('article', { class: `settings-personal-card ${isOpen ? 'is-open' : ''}` }, [
    h('button', {
      class: 'settings-personal-head',
      type: 'button',
      onclick: () => {
        openPersonalCategory = isOpen ? '' : item.id;
        render();
      },
    }, [
      h('span', { class: 'settings-section-icon', html: svgIcon(item.icon) }),
      h('span', { class: 'settings-section-title-wrap' }, [
        h('strong', { text: item.title }),
        h('small', { text: item.subtitle }),
      ]),
      h('span', { class: 'settings-section-arrow', html: svgIcon('chevron') }),
    ]),
    isOpen ? h('div', { class: 'settings-personal-body' }, item.render()) : null,
  ]);
}

function updatePersonalization(patch) {
  const settings = readSettings();
  settings.personalization = {
    ...settings.personalization,
    ...patch,
  };
  writeSettings(settings);
  render();
}

function updatePersonalNested(path, value) {
  const settings = readSettings();
  let target = settings.personalization;
  path.slice(0, -1).forEach((key) => {
    target[key] = target[key] || {};
    target = target[key];
  });
  target[path[path.length - 1]] = value;
  writeSettings(settings);
  render();
}

function renderPersonalDesktop() {
  const settings = readSettings();
  const p = settings.personalization;

  return h('div', { class: 'settings-stack' }, [
    h('div', { class: 'settings-upload-card' }, [
      h('div', {}, [
        h('strong', { text: '壁纸' }),
        h('p', { class: 'settings-muted', text: p.wallpaper ? '已设置本地壁纸' : '不设置时跟随主题背景' }),
      ]),
      h('label', { class: 'settings-button quiet' }, [
        h('span', { html: svgIcon('image') }),
        h('span', { text: '上传' }),
        h('input', {
          class: 'settings-hidden-input',
          type: 'file',
          accept: 'image/*',
          onchange: async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            updatePersonalization({ wallpaper: await readFileAsDataUrl(file) });
          },
        }),
      ]),
      p.wallpaper ? quietButton('移除', () => updatePersonalization({ wallpaper: '' })) : null,
    ]),
    h('div', { class: 'settings-switch-list' }, [
      renderSwitch('时间小组件', Boolean(p.widgets.clock), (checked) => updatePersonalNested(['widgets', 'clock'], checked)),
      renderSwitch('天气小组件', Boolean(p.widgets.weather), (checked) => updatePersonalNested(['widgets', 'weather'], checked)),
      renderSwitch('纪念日小组件', Boolean(p.widgets.anniversary), (checked) => updatePersonalNested(['widgets', 'anniversary'], checked)),
    ]),
  ]);
}

function renderPersonalTheme() {
  return h('div', { class: 'settings-stack' }, [
    renderThemeSection(),
  ]);
}

function renderPersonalMessage() {
  const settings = readSettings();
  const p = settings.personalization;

  return h('div', { class: 'settings-stack' }, [
    field('气泡模式', selectInput(p.bubbleMode || 'bubble', [
      { value: 'bubble', label: '气泡模式' },
      { value: 'dialogue', label: '对话模式' },
    ], (value) => updatePersonalization({ bubbleMode: value }))),
    field('字体大小', h('input', {
      class: 'settings-input',
      type: 'range',
      min: '13',
      max: '20',
      value: String(p.fontSize || 15),
      oninput: (event) => updatePersonalization({ fontSize: Number(event.target.value) }),
    })),
    h('div', { class: 'settings-upload-card' }, [
      h('div', {}, [
        h('strong', { text: '聊天背景' }),
        h('p', { class: 'settings-muted', text: p.chatBackground ? '已设置全局聊天背景' : '不设置时跟随角色或主题' }),
      ]),
      h('label', { class: 'settings-button quiet' }, [
        h('span', { html: svgIcon('image') }),
        h('span', { text: '上传' }),
        h('input', {
          class: 'settings-hidden-input',
          type: 'file',
          accept: 'image/*',
          onchange: async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            updatePersonalization({ chatBackground: await readFileAsDataUrl(file) });
          },
        }),
      ]),
      p.chatBackground ? quietButton('移除', () => updatePersonalization({ chatBackground: '' })) : null,
    ]),
  ]);
}

function renderPersonalAppIcons() {
  const settings = readSettings();
  const appSettings = settings.personalization.apps || {};

  return h('div', { class: 'settings-card-list' }, DEFAULT_APPS.map((app) => {
    const current = appSettings[app.id] || {};

    return h('article', { class: 'settings-app-icon-card' }, [
      h('div', { class: 'settings-app-icon-preview' }, current.icon ? [
        h('img', { src: current.icon, alt: '' }),
      ] : [
        h('span', { text: (current.name || app.name).slice(0, 1) }),
      ]),
      h('div', { class: 'settings-app-icon-info' }, [
        field('名称', textInput(current.name || app.name, app.name, (value) => {
          const next = readSettings();
          next.personalization.apps[app.id] = {
            ...(next.personalization.apps[app.id] || {}),
            name: value,
          };
          writeSettings(next);
          render();
        })),
        h('div', { class: 'settings-actions-row' }, [
          h('label', { class: 'settings-button quiet' }, [
            h('span', { html: svgIcon('image') }),
            h('span', { text: '替换图标' }),
            h('input', {
              class: 'settings-hidden-input',
              type: 'file',
              accept: 'image/*',
              onchange: async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                const next = readSettings();
                next.personalization.apps[app.id] = {
                  ...(next.personalization.apps[app.id] || {}),
                  icon: await readFileAsDataUrl(file),
                };
                writeSettings(next);
                render();
              },
            }),
          ]),
          quietButton('恢复', () => {
            const next = readSettings();
            next.personalization.apps[app.id] = {};
            writeSettings(next);
            render();
          }),
        ]),
      ]),
    ]);
  }));
}

function renderPersonalProfile() {
  const settings = readSettings();
  const profile = settings.personalization.userProfile || {};

  return h('div', { class: 'settings-stack' }, [
    h('div', { class: 'settings-profile-card' }, [
      h('div', { class: 'settings-profile-avatar' }, profile.avatar ? [
        h('img', { src: profile.avatar, alt: '' }),
      ] : [
        h('span', { text: (profile.nickname || '我').slice(0, 1) }),
      ]),
      h('div', { class: 'settings-profile-info' }, [
        field('昵称', textInput(profile.nickname || '我', '我的昵称', (value) => updatePersonalNested(['userProfile', 'nickname'], value))),
        h('label', { class: 'settings-button quiet' }, [
          h('span', { html: svgIcon('image') }),
          h('span', { text: '上传头像' }),
          h('input', {
            class: 'settings-hidden-input',
            type: 'file',
            accept: 'image/*',
            onchange: async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              updatePersonalNested(['userProfile', 'avatar'], await readFileAsDataUrl(file));
            },
          }),
        ]),
      ]),
    ]),
  ]);
}

function renderPersonalAppThemes() {
  const settings = readSettings();

  return h('div', { class: 'settings-stack' }, [
    field('选择应用', selectInput(activeAppThemeId, DEFAULT_APPS.map((app) => ({ value: app.id, label: app.name })), (value) => {
      activeAppThemeId = value;
      render();
    })),
    renderAppThemeEditor(activeAppThemeId, settings.appThemes[activeAppThemeId] || clone(DEFAULT_APP_THEME)),
  ]);
}

function renderAppThemeEditor(appId, theme) {
  const app = DEFAULT_APPS.find((item) => item.id === appId) || DEFAULT_APPS[0];

  return h('article', { class: 'settings-soft-card' }, [
    h('strong', { text: `${app.name}外观` }),
    h('div', { class: 'settings-upload-card' }, [
      h('div', {}, [
        h('strong', { text: '背景图' }),
        h('p', { class: 'settings-muted', text: theme.backgroundImage ? '已设置应用背景图' : '不设置时跟随全局背景' }),
      ]),
      h('label', { class: 'settings-button quiet' }, [
        h('span', { html: svgIcon('image') }),
        h('span', { text: '上传' }),
        h('input', {
          class: 'settings-hidden-input',
          type: 'file',
          accept: 'image/*',
          onchange: async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            updateAppTheme(appId, { backgroundImage: await readFileAsDataUrl(file) });
          },
        }),
      ]),
      theme.backgroundImage ? quietButton('移除', () => updateAppTheme(appId, { backgroundImage: '' })) : null,
    ]),
    field('主题色', textInput(theme.accent || '', '例如 #D79B72', (value) => updateAppTheme(appId, { accent: value }))),
    field('圆角大小', h('input', {
      class: 'settings-input',
      type: 'range',
      min: '12',
      max: '32',
      value: String(theme.radius || 18),
      oninput: (event) => updateAppTheme(appId, { radius: Number(event.target.value) }),
    })),
    field('字体大小', h('input', {
      class: 'settings-input',
      type: 'range',
      min: '13',
      max: '20',
      value: String(theme.fontSize || 15),
      oninput: (event) => updateAppTheme(appId, { fontSize: Number(event.target.value) }),
    })),
    h('div', { class: 'settings-actions-row' }, [
      quietButton('导出', () => {
        exportFile(`${appId}-theme.json`, {
          appId,
          name: `${app.name}外观`,
          version: '1.0',
          theme: readSettings().appThemes[appId] || clone(DEFAULT_APP_THEME),
        });
      }, { icon: 'download' }),
      h('label', { class: 'settings-button quiet' }, [
        h('span', { html: svgIcon('upload') }),
        h('span', { text: '导入' }),
        h('input', {
          class: 'settings-hidden-input',
          type: 'file',
          accept: 'application/json',
          onchange: async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const json = safeParse(await readFileAsText(file), null);
            if (json && json.theme) {
              updateAppTheme(appId, json.theme);
              toast('应用外观已导入');
            } else {
              toast('文件无法读取');
            }
          },
        }),
      ]),
      quietButton('恢复默认', () => {
        const settings = readSettings();
        delete settings.appThemes[appId];
        writeSettings(settings);
        render();
      }),
    ]),
  ]);
}

function updateAppTheme(appId, patch) {
  const settings = readSettings();
  settings.appThemes[appId] = {
    ...clone(DEFAULT_APP_THEME),
    ...(settings.appThemes[appId] || {}),
    ...patch,
  };
  writeSettings(settings);
  render();
}

function renderStickerSection() {
  const settings = readSettings();
  const stickers = settings.stickerPacks || [];

  return h('div', { class: 'settings-stack' }, [
    h('div', { class: 'settings-row-between' }, [
      h('div', {}, [
        h('strong', { class: 'settings-mini-title', text: '表情包库' }),
        h('p', { class: 'settings-muted', text: '聊天工具栏可发送，AI可按描述匹配' }),
      ]),
      h('label', { class: 'settings-button primary' }, [
        h('span', { html: svgIcon('plus') }),
        h('span', { text: '上传' }),
        h('input', {
          class: 'settings-hidden-input',
          type: 'file',
          accept: 'image/*',
          onchange: async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const description = window.prompt('填写描述，方便AI按情绪匹配') || '';
            const next = readSettings();
            next.stickerPacks.push({
              id: createId('sticker'),
              image: await readFileAsDataUrl(file),
              description,
              createdAt: new Date().toISOString(),
            });
            writeSettings(next);
            render();
          },
        }),
      ]),
    ]),
    stickers.length ? h('div', { class: 'settings-sticker-grid' }, stickers.map((item) => {
      return h('article', { class: 'settings-sticker-card' }, [
        h('img', { src: item.image, alt: '' }),
        h('p', { text: item.description || '未填写描述' }),
        quietButton('删除', () => {
          const next = readSettings();
          next.stickerPacks = next.stickerPacks.filter((sticker) => sticker.id !== item.id);
          writeSettings(next);
          render();
        }, { icon: 'trash' }),
      ]);
    })) : h('div', { class: 'settings-empty', text: '还没有上传表情包' }),
  ]);
}

function renderDataSection() {
  return h('div', { class: 'settings-stack' }, [
    h('p', { class: 'settings-muted', text: '导出、导入或清空本地数据。所有内容只保存在当前浏览器。' }),
    h('div', { class: 'settings-actions-row' }, [
      primaryButton('导出全部数据', () => {
        const data = {
          store: readStore(),
          settings: readSettings(),
          characters: getCharacters(),
          exportedAt: new Date().toISOString(),
        };
        exportFile('ai-phone-data.json', data);
      }, { icon: 'download' }),
      h('label', { class: 'settings-button quiet' }, [
        h('span', { html: svgIcon('upload') }),
        h('span', { text: '导入数据' }),
        h('input', {
          class: 'settings-hidden-input',
          type: 'file',
          accept: 'application/json',
          onchange: async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            const json = safeParse(await readFileAsText(file), null);
            if (!json) {
              toast('文件无法读取');
              return;
            }
            if (json.store) writeStore(json.store);
            if (json.settings) writeSettings(json.settings);
            if (json.characters) saveCharacters(json.characters);
            toast('数据已导入');
            render();
          },
        }),
      ]),
      quietButton('清空数据', () => {
        const ok = window.confirm('确认清空本地数据吗');
        if (!ok) return;
        localStorage.clear();
        toast('已清空');
        setTimeout(() => location.reload(), 500);
      }, { icon: 'trash' }),
    ]),
  ]);
}

function renderSwitch(label, checked, onChange) {
  return h('label', { class: 'settings-switch-row' }, [
    h('span', { text: label }),
    h('span', { class: `settings-switch ${checked ? 'is-on' : ''}` }, [
      h('input', {
        type: 'checkbox',
        checked,
        onchange: (event) => onChange(event.target.checked),
      }),
      h('i'),
    ]),
  ]);
}

function injectLocalStyle() {
  if (document.getElementById('settings-local-style')) return;

  const style = document.createElement('style');
  style.id = 'settings-local-style';
  style.textContent = `
    .settings-app {
      height: 100%;
      overflow: hidden;
      background: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-main);
      display: flex;
      flex-direction: column;
    }

    .settings-header {
      flex: 0 0 auto;
      padding: 16px 20px 10px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: var(--bg-primary);
    }

    .settings-title-block h1 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      line-height: 1.3;
    }

    .settings-title-block p {
      margin: 2px 0 0;
      font-size: 13px;
      line-height: 1.5;
      color: var(--text-secondary);
    }

    .settings-content {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 10px 20px 28px;
      -webkit-overflow-scrolling: touch;
    }

    .settings-content-inner {
      display: flex;
      flex-direction: column;
      gap: 12px;
      max-width: 760px;
      margin: 0 auto;
    }

    .settings-section,
    .settings-personal-card,
    .settings-api-card,
    .settings-soft-card,
    .settings-upload-card,
    .settings-profile-card,
    .settings-app-icon-card,
    .settings-sticker-card,
    .settings-empty {
      background: var(--bg-card);
      border-radius: 20px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }

    .settings-section {
      overflow: hidden;
    }

    .settings-section-head,
    .settings-personal-head {
      width: 100%;
      padding: 18px;
      display: flex;
      align-items: center;
      gap: 12px;
      background: transparent;
      color: var(--text-primary);
      appearance: none;
      border: 0;
      text-align: left;
      font: inherit;
      cursor: pointer;
      transition: all 200ms ease;
    }

    .settings-section-head:active,
    .settings-personal-head:active,
    .settings-button:active,
    .settings-icon-button:active,
    .settings-theme-card:active {
      transform: scale(0.96);
    }

    .settings-section-icon {
      width: 24px;
      height: 24px;
      color: var(--text-primary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }

    .line-icon {
      width: 22px;
      height: 22px;
      fill: none;
      stroke: currentColor;
      stroke-width: 1.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .settings-section-title-wrap {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .settings-section-title-wrap strong,
    .settings-mini-title,
    .settings-drawer-title {
      font-size: 17px;
      font-weight: 600;
      line-height: 1.4;
      color: var(--text-primary);
    }

    .settings-section-title-wrap small,
    .settings-muted {
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .settings-section-arrow {
      transition: all 200ms ease;
      color: var(--text-secondary);
    }

    .settings-section.is-open .settings-section-arrow,
    .settings-personal-card.is-open .settings-section-arrow {
      transform: rotate(90deg);
    }

    .settings-section-body,
    .settings-personal-body {
      padding: 0 18px 18px;
      animation: settingsPanelIn 180ms ease both;
    }

    .settings-stack,
    .settings-card-list,
    .settings-personal-list,
    .settings-form {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .settings-row-between {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .settings-actions-row,
    .settings-api-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .settings-button,
    .settings-icon-button {
      appearance: none;
      border: 0;
      cursor: pointer;
      font-family: inherit;
      transition: all 200ms ease;
    }

    .settings-button {
      min-height: 38px;
      padding: 0 14px;
      border-radius: 14px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      font-size: 14px;
      line-height: 1;
      white-space: nowrap;
    }

    .settings-button.primary {
      background: var(--accent);
      color: #fff;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
    }

    .settings-button.quiet {
      background: var(--bg-secondary);
      color: var(--text-primary);
    }

    .settings-back-button {
      padding-left: 8px;
      padding-right: 12px;
    }

    .settings-icon-button {
      width: 38px;
      height: 38px;
      border-radius: 14px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
    }

    .settings-api-card,
    .settings-soft-card,
    .settings-upload-card,
    .settings-profile-card,
    .settings-app-icon-card {
      padding: 16px;
    }

    .settings-api-card {
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    .settings-api-main {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }

    .settings-api-topline {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .settings-api-topline strong {
      font-size: 16px;
      font-weight: 600;
      line-height: 1.4;
    }

    .settings-pill {
      padding: 5px 9px;
      border-radius: 999px;
      background: var(--accent-light);
      color: var(--accent-dark);
      font-size: 12px;
      line-height: 1;
      white-space: nowrap;
    }

    .settings-key-line {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.6;
      word-break: break-all;
    }

    .settings-key-line span {
      flex: 1 1 auto;
      min-width: 0;
    }

    .settings-inline-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .settings-model-combo {
      display: grid;
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .settings-field {
      display: flex;
      flex-direction: column;
      gap: 7px;
      color: var(--text-secondary);
      font-size: 13px;
      line-height: 1.5;
    }

    .settings-input,
    .settings-textarea {
      width: 100%;
      box-sizing: border-box;
      border: 0;
      outline: 0;
      border-radius: 16px;
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-family: inherit;
      font-size: 15px;
      line-height: 1.6;
      padding: 12px 14px;
      transition: all 200ms ease;
    }

    .settings-textarea {
      resize: none;
      min-height: 108px;
    }

    .settings-input:focus,
    .settings-textarea:focus {
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
      background: var(--bg-card);
    }

    .settings-input[type="range"] {
      padding: 12px 0;
      accent-color: var(--accent);
      background: transparent;
    }

    .settings-details {
      background: var(--bg-card);
      border-radius: 20px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
      padding: 14px 16px;
    }

    .settings-details summary {
      cursor: pointer;
      font-size: 15px;
      line-height: 1.6;
      color: var(--text-primary);
      list-style: none;
    }

    .settings-details summary::-webkit-details-marker {
      display: none;
    }

    .settings-theme-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .settings-theme-card {
      appearance: none;
      border: 0;
      background: var(--bg-card);
      color: var(--text-primary);
      border-radius: 20px;
      padding: 14px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
      font: inherit;
      cursor: pointer;
      text-align: left;
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: all 200ms ease;
    }

    .settings-theme-preview {
      height: 54px;
      border-radius: 16px;
      padding: 10px;
      display: flex;
      align-items: flex-end;
      gap: 6px;
      box-shadow: inset 0 0 0 999px rgba(255,255,255,0.02);
    }

    .settings-theme-preview i {
      display: block;
      width: 24px;
      height: 18px;
      border-radius: 8px;
    }

    .settings-theme-preview i:first-child {
      height: 30px;
    }

    .settings-personal-list {
      gap: 10px;
    }

    .settings-personal-card {
      overflow: hidden;
    }

    .settings-upload-card,
    .settings-profile-card,
    .settings-app-icon-card {
      display: flex;
      align-items: center;
      gap: 14px;
      justify-content: space-between;
    }

    .settings-upload-card > div:first-child,
    .settings-profile-info,
    .settings-app-icon-info {
      flex: 1 1 auto;
      min-width: 0;
    }

    .settings-switch-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .settings-switch-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      background: var(--bg-card);
      border-radius: 18px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.06);
      font-size: 15px;
      line-height: 1.6;
    }

    .settings-switch {
      width: 48px;
      height: 28px;
      border-radius: 999px;
      background: var(--bg-secondary);
      position: relative;
      transition: all 200ms ease;
      flex: 0 0 auto;
    }

    .settings-switch input {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }

    .settings-switch i {
      position: absolute;
      top: 4px;
      left: 4px;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: var(--bg-card);
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
      transition: all 200ms ease;
    }

    .settings-switch.is-on {
      background: var(--accent);
    }

    .settings-switch.is-on i {
      transform: translateX(20px);
    }

    .settings-profile-avatar,
    .settings-app-icon-preview {
      width: 58px;
      height: 58px;
      border-radius: 20px;
      background: var(--bg-secondary);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      flex: 0 0 auto;
      color: var(--text-primary);
      font-size: 20px;
      font-weight: 600;
    }

    .settings-profile-avatar {
      border-radius: 50%;
    }

    .settings-profile-avatar img,
    .settings-app-icon-preview img,
    .settings-sticker-card img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .settings-sticker-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }

    .settings-sticker-card {
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }

    .settings-sticker-card img {
      height: 120px;
      border-radius: 16px;
      background: var(--bg-secondary);
    }

    .settings-sticker-card p {
      margin: 0;
      font-size: 13px;
      line-height: 1.6;
      color: var(--text-secondary);
    }

    .settings-empty {
      padding: 18px;
      color: var(--text-secondary);
      font-size: 15px;
      line-height: 1.6;
      text-align: center;
    }

    .settings-hidden-input {
      display: none;
    }

    .mono {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      word-break: break-all;
    }

    .settings-drawer-mask {
      position: fixed;
      inset: 0;
      z-index: 90;
      background: var(--bg-overlay);
      display: flex;
      align-items: flex-end;
      justify-content: center;
      padding: 20px;
      box-sizing: border-box;
      animation: settingsFadeIn 180ms ease both;
    }

    .settings-drawer {
      width: min(720px, 100%);
      max-height: min(82vh, 720px);
      overflow-y: auto;
      background: var(--bg-card);
      color: var(--text-primary);
      border-radius: 26px 26px 20px 20px;
      padding: 10px 18px 18px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      animation: settingsDrawerIn 220ms ease both;
    }

    .settings-drawer-handle {
      width: 42px;
      height: 5px;
      border-radius: 999px;
      background: var(--bg-secondary);
      margin: 0 auto 14px;
    }

    .settings-drawer-actions {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding-top: 6px;
    }

    .settings-toast {
      position: fixed;
      left: 50%;
      bottom: 28px;
      z-index: 120;
      transform: translate(-50%, 12px);
      opacity: 0;
      background: var(--text-primary);
      color: var(--bg-card);
      padding: 10px 14px;
      border-radius: 999px;
      font-size: 13px;
      line-height: 1.4;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      transition: all 200ms ease;
      pointer-events: none;
    }

    .settings-toast.is-visible {
      opacity: 1;
      transform: translate(-50%, 0);
    }

    @keyframes settingsPanelIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    @keyframes settingsFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    @keyframes settingsDrawerIn {
      from { opacity: 0; transform: translateY(24px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;
  document.head.appendChild(style);
}

function render() {
  if (!rootEl) return;

  injectLocalStyle();

  rootEl.innerHTML = '';
  rootEl.className = 'settings-app';

  const content = h('main', { class: 'settings-content' }, [
    h('div', { class: 'settings-content-inner' }, [
      sectionCard('api', 'API配置', '端点、Key、模型拉取和默认接口', 'link', renderApiSection),
      sectionCard('personalization', '个性化', '桌面、主题、消息、应用图标和资料', 'palette', renderPersonalizationSection),
      sectionCard('tts', 'TTS配置', '语音服务、声音和朗读开关', 'message', renderTtsSection),
      sectionCard('mcp', 'MCP配置', '工具服务器和分组管理', 'settings', renderMcpSection),
      sectionCard('theme', '全局主题', '预设主题、导入导出和实时编辑', 'palette', renderThemeSection),
      sectionCard('stickers', '表情包', '上传本地图片并填写描述', 'image', renderStickerSection),
      sectionCard('data', '数据管理', '导出、导入和清空本地数据', 'database', renderDataSection),
    ]),
  ]);

  rootEl.appendChild(renderHeader());
  rootEl.appendChild(content);

  const drawer = renderApiDrawer();
  if (drawer) rootEl.appendChild(drawer);
}

export function renderSettings(container, options = {}) {
  rootEl = container;
  routeBack = options.onBack || options.back || options.navigateHome || null;
  render();
}

export function mount(container, options = {}) {
  renderSettings(container, options);
}

export function init(container, options = {}) {
  renderSettings(container, options);
}

export function unmount() {
  rootEl = null;
  routeBack = null;
}

export default {
  id: APP_ID,
  name: '设置',
  render: renderSettings,
  mount,
  init,
  unmount,
};

// 问题：如果旧版 core/storage.js 使用了完全不同的键名，本文件已做兼容兜底但可能会产生一份 ai_phone_settings 备用数据。
