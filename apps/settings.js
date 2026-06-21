import {
  getSettings,
  updateSettings,
  getApps,
  updateApp,
  exportAllData,
  importAllData,
  clearAllData,
  resetData,
  readLocal,
  writeLocal,
  uuid
} from '../core/storage.js';

import {
  getThemePresets,
  switchTheme,
  importTheme,
  downloadTheme,
  setThemeVariable,
  getCurrentThemeVariables
} from '../core/theme.js';

import {
  getApiConfigs,
  saveApiConfig,
  deleteApiConfig,
  setDefaultApiConfig,
  fetchAndSaveModels,
  fetchModels,
  testApiConfig,
  normalizeApiConfig
} from '../core/api.js';

import {
  getTTSConfigs,
  saveTTSConfig,
  deleteTTSConfig,
  getDefaultTTSConfigId,
  setDefaultTTSConfigId,
  waitForBrowserVoices,
  speakText,
  normalizeTTSConfig
} from '../core/tts.js';

import {
  getMCPServers,
  saveMCPServer,
  deleteMCPServer,
  fetchMCPTools,
  normalizeMCPServer
} from '../core/mcp.js';

import {
  h,
  icon,
  appHeader,
  createBackButton,
  createAccordionItem,
  inputField,
  textareaField,
  selectField,
  switchControl,
  button,
  iconButton,
  card,
  toast,
  confirmDialog,
  pickImage,
  pickTextFile,
  downloadText,
  fileToBase64
} from '../core/ui.js';

const PROFILE_KEY = 'ai_phone_user_profile_v1';
const MESSAGE_THEME_KEY = 'ai_phone_message_theme_v1';
const STICKER_LIBRARY_KEY = 'ai_phone_sticker_library_v1';

let root = null;
let contextRef = null;
let openedPersonalizationCategory = '';
const visibleApiKeys = new Set();

export function mount(container, context = {}) {
  root = container;
  contextRef = context;
  render();

  return () => {
    root = null;
    contextRef = null;
    openedPersonalizationCategory = '';
  };
}

function render() {
  if (!root) {
    return;
  }

  root.replaceChildren(
    appHeader({
      title: '设置',
      subtitle: '分区默认收起',
      left: h('div', { className: 'app-header-left' }, createBackButton()),
      right: h('div', { className: 'app-header-right' })
    }),
    h('main', { className: 'app-content' }, [
      h('div', { className: 'accordion' }, [
        createAPISection().item,
        createTTSSection().item,
        createMCPSection().item,
        createPersonalizationSection().item,
        createDataSection().item
      ])
    ])
  );
}

function refresh() {
  render();

  if (contextRef && typeof contextRef.refreshDesktop === 'function') {
    contextRef.refreshDesktop();
  }
}

function refreshDesktopOnly() {
  if (contextRef && typeof contextRef.refreshDesktop === 'function') {
    contextRef.refreshDesktop();
  }
}

function createAPISection() {
  const body = h('div', { className: 'form' });
  const settings = getSettings();
  const configs = getApiConfigs();

  body.append(
    card({
      title: 'API配置',
      text: '可以添加多个OpenAI兼容端点。模型可自动拉取，也可手动输入。',
      className: 'large'
    }),
    button({
      text: '新增API配置',
      iconName: 'plus',
      className: 'primary-button full-button',
      onClick: () => openAPIEditor()
    })
  );

  if (!configs.length) {
    body.appendChild(card({
      title: '还没有API配置',
      text: '添加后聊天里可以按对话实时切换API和模型。',
      className: 'large'
    }));
  }

  configs.forEach((config) => {
    body.appendChild(createAPIConfigCard(config, settings.defaultApiConfigId === config.id));
  });

  return createAccordionItem({
    title: 'API配置',
    content: body,
    open: false
  });
}

function createAPIConfigCard(config, isDefault) {
  const keyVisible = visibleApiKeys.has(config.id);
  const keyText = config.apiKey
    ? keyVisible
      ? config.apiKey
      : maskKey(config.apiKey)
    : '未填写';
  const modelText = config.model || config.models?.[0] || '未选择';

  return h('article', { className: 'card large' }, [
    h('div', { className: 'card-title', text: config.name || 'API配置' }),
    h('div', { className: 'card-text', text: `Endpoint：${config.endpoint || '未填写'}\nKey：${keyText}\n已选模型：${modelText}` }),
    h('div', { className: 'card-meta', text: config.models?.length ? `模型列表 ${config.models.length} 个` : '未拉取模型，可手动输入' }),
    h('div', { className: 'card-actions' }, [
      button({
        text: keyVisible ? '隐藏Key' : '显示Key',
        className: 'secondary-button',
        onClick: () => {
          if (keyVisible) {
            visibleApiKeys.delete(config.id);
          } else {
            visibleApiKeys.add(config.id);
          }
          refresh();
        }
      }),
      button({
        text: isDefault ? '默认使用' : '设为默认',
        className: isDefault ? 'secondary-button' : 'primary-button',
        onClick: () => {
          setDefaultApiConfig(config.id);
          toast('已设置默认API');
          refresh();
        }
      }),
      button({
        text: '拉取模型',
        className: 'secondary-button',
        onClick: async () => {
          try {
            toast('正在拉取模型');
            const models = await fetchAndSaveModels(config.id);
            toast(models.length ? '模型已更新' : '没有获取到模型');
            refresh();
          } catch (error) {
            toast(error.message || '拉取失败，可手动输入模型');
          }
        }
      }),
      button({
        text: '编辑',
        className: 'secondary-button',
        onClick: () => openAPIEditor(config)
      }),
      button({
        text: '删除',
        className: 'text-button danger',
        onClick: async () => {
          const ok = await confirmDialog({
            title: '删除API配置',
            message: `确认删除「${config.name}」吗？`,
            danger: true
          });

          if (ok) {
            deleteApiConfig(config.id);
            toast('已删除');
            refresh();
          }
        }
      })
    ])
  ]);
}

function maskKey(key = '') {
  if (!key) {
    return '';
  }

  if (key.length <= 10) {
    return '已填写';
  }

  return `${key.slice(0, 4)}${'•'.repeat(8)}${key.slice(-4)}`;
}

function openAPIEditor(config = null) {
  const current = normalizeApiConfig(config || {
    name: '新的API配置'
  });

  let modelList = Array.isArray(current.models) ? current.models.slice() : [];

  const nameField = inputField({
    label: '名称',
    value: current.name,
    placeholder: '例如：主力模型'
  });

  const endpointField = inputField({
    label: 'Endpoint',
    value: current.endpoint,
    placeholder: 'https://api.example.com'
  });

  const keyField = inputField({
    label: 'API Key',
    value: current.apiKey,
    placeholder: 'sk-...',
    type: 'text'
  });

  const modelInputField = inputField({
    label: '手动输入模型',
    value: current.model,
    placeholder: '例如：gpt-4o-mini',
    type: 'text'
  });

  const modelSelectWrap = h('div', { className: 'form-section' });
  const modelSelectLabel = h('span', { className: 'form-label', text: '已拉取模型' });
  const modelSelect = h('select', {
    className: 'select',
    value: current.model || '',
    onChange: () => {
      modelInputField.input.value = modelSelect.value;
    }
  });

  function renderModelOptions() {
    modelSelect.replaceChildren(
      h('option', { value: '', text: '不选择，手动输入' }),
      ...modelList.map((model) => h('option', {
        value: model,
        text: model
      }))
    );

    modelSelect.value = modelList.includes(modelInputField.input.value)
      ? modelInputField.input.value
      : '';
  }

  renderModelOptions();
  modelSelectWrap.append(modelSelectLabel, modelSelect);

  const modelsTextarea = textareaField({
    label: '模型列表',
    value: modelList.join('\n'),
    placeholder: '也可以每行手动填一个模型名',
    rows: 4
  });

  const fetchButton = button({
    text: '拉取模型',
    iconName: 'refresh',
    className: 'secondary-button full-button',
    onClick: async () => {
      try {
        toast('正在拉取模型');
        const models = await fetchModels({
          ...current,
          endpoint: endpointField.input.value.trim(),
          apiKey: keyField.input.value.trim()
        });

        modelList = models;
        modelsTextarea.textarea.value = models.join('\n');
        renderModelOptions();

        if (models.length && !modelInputField.input.value.trim()) {
          modelInputField.input.value = models[0];
          modelSelect.value = models[0];
        }

        toast(models.length ? '模型已拉取' : '没有获取到模型');
      } catch (error) {
        toast(error.message || '拉取失败，可手动输入模型');
      }
    }
  });

  modelsTextarea.textarea.addEventListener('input', () => {
    modelList = modelsTextarea.textarea.value
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean);
    renderModelOptions();
  });

  const testButton = button({
    text: '测试连接',
    className: 'secondary-button full-button',
    onClick: async () => {
      try {
        await testApiConfig({
          ...current,
          endpoint: endpointField.input.value.trim(),
          apiKey: keyField.input.value.trim(),
          model: modelInputField.input.value.trim()
        });
        toast('连接成功');
      } catch (error) {
        toast(error.message || '测试失败');
      }
    }
  });

  const form = h('div', { className: 'form' }, [
    nameField.wrap,
    endpointField.wrap,
    keyField.wrap,
    modelSelectWrap,
    modelInputField.wrap,
    fetchButton,
    modelsTextarea.wrap,
    testButton
  ]);

  const instance = sheet({
    title: config ? '编辑API配置' : '新增API配置',
    content: form,
    actions: [
      button({
        text: '保存',
        className: 'primary-button',
        onClick: () => {
          const models = modelsTextarea.textarea.value
            .split('\n')
            .map((item) => item.trim())
            .filter(Boolean);

          saveApiConfig({
            ...current,
            name: nameField.input.value.trim() || 'API配置',
            endpoint: endpointField.input.value.trim(),
            apiKey: keyField.input.value.trim(),
            model: modelInputField.input.value.trim() || modelSelect.value || models[0] || '',
            models
          });

          instance.close();
          toast('已保存');
          refresh();
        }
      })
    ]
  });
}

function createTTSSection() {
  const body = h('div', { className: 'form' });
  const configs = getTTSConfigs();
  const defaultId = getDefaultTTSConfigId();

  body.append(
    card({
      title: 'TTS配置',
      text: '聊天里可以按对话单独选择语音配置。',
      className: 'large'
    }),
    button({
      text: '新增TTS配置',
      iconName: 'plus',
      className: 'primary-button full-button',
      onClick: () => openTTSEditor()
    })
  );

  if (!configs.length) {
    body.appendChild(card({
      title: '还没有TTS配置',
      text: '可以添加OpenAI语音接口，或使用浏览器语音。',
      className: 'large'
    }));
  }

  configs.forEach((config) => {
    body.appendChild(createTTSConfigCard(config, config.id === defaultId));
  });

  return createAccordionItem({
    title: 'TTS配置',
    content: body,
    open: false
  });
}

function createTTSConfigCard(config, isDefault) {
  return card({
    title: config.name,
    text: `服务商：${config.provider}\n声音：${config.voice || '默认'}\n端点：${config.endpoint || '浏览器语音'}`,
    meta: config.enabled ? '已启用' : '未启用',
    actions: [
      button({
        text: isDefault ? '默认使用' : '设为默认',
        className: isDefault ? 'secondary-button' : 'primary-button',
        onClick: () => {
          setDefaultTTSConfigId(config.id);
          toast('已设置默认语音');
          refresh();
        }
      }),
      button({
        text: '试听',
        className: 'secondary-button',
        onClick: async () => {
          try {
            await speakText('这是一段语音试听。', {
              ...config,
              enabled: true,
              force: true
            });
          } catch (error) {
            toast(error.message || '试听失败');
          }
        }
      }),
      button({
        text: '编辑',
        className: 'secondary-button',
        onClick: () => openTTSEditor(config)
      }),
      button({
        text: '删除',
        className: 'text-button danger',
        onClick: async () => {
          const ok = await confirmDialog({
            title: '删除TTS配置',
            message: `确认删除「${config.name}」吗？`,
            danger: true
          });

          if (ok) {
            deleteTTSConfig(config.id);
            toast('已删除');
            refresh();
          }
        }
      })
    ],
    className: 'large'
  });
}

function openTTSEditor(config = null) {
  const current = normalizeTTSConfig(config || {
    provider: 'browser',
    name: '新的语音配置'
  });

  const nameField = inputField({
    label: '名称',
    value: current.name,
    placeholder: '例如：温柔女声'
  });

  const providerField = selectField({
    label: '服务商',
    value: current.provider,
    options: [
      { value: 'browser', label: '浏览器语音' },
      { value: 'openai', label: 'OpenAI兼容语音' },
      { value: 'custom', label: '自定义接口' }
    ]
  });

  const endpointField = inputField({
    label: 'Endpoint',
    value: current.endpoint,
    placeholder: 'https://api.example.com'
  });

  const keyField = inputField({
    label: 'Key',
    value: current.apiKey,
    placeholder: '可留空',
    type: 'text'
  });

  const modelField = inputField({
    label: '模型',
    value: current.model,
    placeholder: 'tts-1'
  });

  const voiceField = inputField({
    label: '声音',
    value: current.voice,
    placeholder: 'nova'
  });

  let enabled = current.enabled;

  const enabledSwitch = switchControl({
    label: '默认启用',
    description: '聊天里仍然可以单独开关',
    checked: current.enabled,
    onChange: (checked) => {
      enabled = checked;
    }
  });

  const form = h('div', { className: 'form' }, [
    nameField.wrap,
    providerField.wrap,
    endpointField.wrap,
    keyField.wrap,
    modelField.wrap,
    voiceField.wrap,
    enabledSwitch,
    button({
      text: '查看浏览器声音',
      className: 'secondary-button full-button',
      onClick: async () => {
        const voices = await waitForBrowserVoices();
        toast(voices.length ? `找到 ${voices.length} 个声音` : '没有找到浏览器声音');
      }
    })
  ]);

  const instance = sheet({
    title: 'TTS配置',
    content: form,
    actions: [
      button({
        text: '保存',
        className: 'primary-button',
        onClick: () => {
          saveTTSConfig({
            ...current,
            name: nameField.input.value.trim() || '语音配置',
            provider: providerField.select.value,
            endpoint: endpointField.input.value.trim(),
            apiKey: keyField.input.value.trim(),
            model: modelField.input.value.trim() || 'tts-1',
            voice: voiceField.input.value.trim() || 'nova',
            enabled
          });

          instance.close();
          toast('已保存');
          refresh();
        }
      })
    ]
  });
}

function createMCPSection() {
  const body = h('div', { className: 'form' });
  const servers = getMCPServers();

  body.append(
    card({
      title: 'MCP配置',
      text: '聊天配置抽屉里可以为每个对话单独启用MCP服务器。',
      className: 'large'
    }),
    button({
      text: '新增MCP服务器',
      iconName: 'plus',
      className: 'primary-button full-button',
      onClick: () => openMCPEditor()
    })
  );

  if (!servers.length) {
    body.appendChild(card({
      title: '还没有MCP服务器',
      text: '添加后可在聊天里按对话选择启用。',
      className: 'large'
    }));
  }

  servers.forEach((server) => {
    body.appendChild(createMCPServerCard(server));
  });

  return createAccordionItem({
    title: 'MCP配置',
    content: body,
    open: false
  });
}

function createMCPServerCard(server) {
  return card({
    title: server.name,
    text: `分组：${server.group || '默认分组'}\n地址：${server.url || '未填写'}\n工具：${server.tools?.length || 0} 个`,
    meta: server.enabled ? '已启用' : '未启用',
    actions: [
      button({
        text: '拉取工具',
        className: 'secondary-button',
        onClick: async () => {
          try {
            toast('正在拉取工具');
            const tools = await fetchMCPTools(server.id);
            toast(tools.length ? '工具已更新' : '没有获取到工具');
            refresh();
          } catch (error) {
            toast(error.message || '拉取失败');
          }
        }
      }),
      button({
        text: '编辑',
        className: 'secondary-button',
        onClick: () => openMCPEditor(server)
      }),
      button({
        text: '删除',
        className: 'text-button danger',
        onClick: async () => {
          const ok = await confirmDialog({
            title: '删除MCP服务器',
            message: `确认删除「${server.name}」吗？`,
            danger: true
          });

          if (ok) {
            deleteMCPServer(server.id);
            toast('已删除');
            refresh();
          }
        }
      })
    ],
    className: 'large'
  });
}

function openMCPEditor(server = null) {
  const current = normalizeMCPServer(server || {
    name: '新的MCP服务器'
  });

  let enabled = current.enabled;

  const nameField = inputField({
    label: '名称',
    value: current.name,
    placeholder: '例如：本地工具'
  });

  const groupField = inputField({
    label: '分组',
    value: current.group,
    placeholder: '默认分组'
  });

  const urlField = inputField({
    label: 'URL',
    value: current.url,
    placeholder: 'https://example.com/mcp'
  });

  const headersField = textareaField({
    label: '请求头 JSON',
    value: JSON.stringify(current.headers || {}, null, 2),
    placeholder: '{ }',
    rows: 4
  });

  const enabledSwitch = switchControl({
    label: '启用服务器',
    description: '关闭后聊天中不会显示',
    checked: current.enabled,
    onChange: (checked) => {
      enabled = checked;
    }
  });

  const form = h('div', { className: 'form' }, [
    nameField.wrap,
    groupField.wrap,
    urlField.wrap,
    headersField.wrap,
    enabledSwitch
  ]);

  const instance = sheet({
    title: 'MCP服务器',
    content: form,
    actions: [
      button({
        text: '保存',
        className: 'primary-button',
        onClick: () => {
          let headers = {};

          try {
            headers = JSON.parse(headersField.textarea.value || '{}');
          } catch {
            toast('请求头JSON格式不正确');
            return;
          }

          saveMCPServer({
            ...current,
            name: nameField.input.value.trim() || 'MCP服务器',
            group: groupField.input.value.trim() || '默认分组',
            url: urlField.input.value.trim(),
            headers,
            enabled
          });

          instance.close();
          toast('已保存');
          refresh();
        }
      })
    ]
  });
}

function createPersonalizationSection() {
  const body = h('div', { className: 'form' });
  const detail = h('div', { className: 'form' });

  const categories = [
    { id: 'desktop', title: '桌面', desc: '壁纸、图标位置、小组件开关', render: renderDesktopPersonalization },
    { id: 'theme', title: '主题', desc: '预设主题、导入导出、自定义编辑', render: renderThemePersonalization },
    { id: 'message', title: '消息', desc: '气泡模式、字体大小、聊天背景、表情包', render: renderMessagePersonalization },
    { id: 'icons', title: '应用图标', desc: '替换图标、改名、Dock显示', render: renderIconPersonalization },
    { id: 'profile', title: '我的资料', desc: '用户头像、昵称', render: renderProfilePersonalization }
  ];

  function repaintDetail() {
    detail.replaceChildren();

    const category = categories.find((item) => item.id === openedPersonalizationCategory);

    if (category) {
      detail.appendChild(category.render());
    }
  }

  categories.forEach((category) => {
    body.appendChild(
      h('button', {
        type: 'button',
        className: 'action-item',
        onClick: () => {
          openedPersonalizationCategory = openedPersonalizationCategory === category.id ? '' : category.id;
          repaintDetail();
          Array.from(body.querySelectorAll('[data-personal-category]')).forEach((node) => {
            node.dataset.open = node.dataset.personalCategory === openedPersonalizationCategory ? '1' : '0';
            node.querySelector('.accordion-icon').style.transform = node.dataset.open === '1' ? 'rotate(180deg)' : 'rotate(0)';
          });
        },
        dataset: {
          personalCategory: category.id,
          open: openedPersonalizationCategory === category.id ? '1' : '0'
        }
      }, [
        h('div', { className: 'list-row-main' }, [
          h('div', { className: 'list-row-title', text: category.title }),
          h('div', { className: 'list-row-desc', text: category.desc })
        ]),
        h('div', {
          className: 'accordion-icon',
          style: {
            transform: openedPersonalizationCategory === category.id ? 'rotate(180deg)' : 'rotate(0)'
          }
        }, icon('chevronDown'))
      ])
    );
  });

  repaintDetail();
  body.appendChild(detail);

  return createAccordionItem({
    title: '个性化',
    content: body,
    open: false
  });
}

function renderDesktopPersonalization() {
  const settings = getSettings();
  const widgets = settings.personalization?.widgets || {};

  return h('div', { className: 'form' }, [
    card({
      title: '桌面',
      text: '这里管理桌面壁纸、图标位置和小组件。',
      className: 'large'
    }),
    button({
      text: '更换桌面壁纸',
      iconName: 'image',
      className: 'secondary-button full-button',
      onClick: async () => {
        const image = await pickImage();

        if (!image) {
          return;
        }

        updateSettings((next) => {
          next.personalization.wallpaper = image;
          return next;
        });

        toast('壁纸已更新');
        refreshDesktopOnly();
      }
    }),
    button({
      text: '清除桌面壁纸',
      className: 'secondary-button full-button',
      onClick: () => {
        updateSettings((next) => {
          next.personalization.wallpaper = '';
          return next;
        });

        toast('已清除壁纸');
        refreshDesktopOnly();
      }
    }),
    createFold('小组件开关', h('div', { className: 'form' }, [
      switchControl({
        label: '时间小组件',
        checked: widgets.time !== false,
        onChange: (checked) => updateWidgetSetting('time', checked)
      }),
      switchControl({
        label: '天气小组件',
        checked: widgets.weather !== false,
        onChange: (checked) => updateWidgetSetting('weather', checked)
      }),
      switchControl({
        label: '纪念日倒计时',
        checked: widgets.anniversary !== false,
        onChange: (checked) => updateWidgetSetting('anniversary', checked)
      })
    ]), true),
    createWeatherPanel(),
    createPositionManagerPanel()
  ]);
}

function renderThemePersonalization() {
  const presets = getThemePresets();

  return h('div', { className: 'form' }, [
    card({
      title: '主题',
      text: '主题会影响整个系统，也可以在每个应用内单独覆盖。',
      className: 'large'
    }),
    createFold('预设主题', h('div', { className: 'card-list' }, presets.map((theme) => {
      const variables = theme.variables || {};

      return h('button', {
        type: 'button',
        className: 'theme-card',
        onClick: () => {
          switchTheme(theme.name);
          toast(`已切换到${theme.name}`);
          refreshDesktopOnly();
        }
      }, [
        h('div', { className: 'theme-swatches' }, [
          h('span', { className: 'theme-swatch', style: { background: variables['--bg-primary'] || '#FAFAFA' } }),
          h('span', { className: 'theme-swatch', style: { background: variables['--bg-card'] || '#FFFFFF' } }),
          h('span', { className: 'theme-swatch', style: { background: variables['--accent'] || '#D9A58F' } })
        ]),
        h('div', { className: 'card-title', text: theme.name }),
        h('div', { className: 'card-meta', text: '点击立即应用' })
      ]);
    })), true),
    createFold('导入导出', h('div', { className: 'button-row wrap' }, [
      button({
        text: '导入主题',
        iconName: 'upload',
        className: 'secondary-button',
        onClick: async () => {
          try {
            const text = await pickTextFile();

            if (!text) {
              return;
            }

            importTheme(text);
            toast('主题已导入');
            refreshDesktopOnly();
          } catch (error) {
            toast(error.message || '导入失败');
          }
        }
      }),
      button({
        text: '导出主题',
        iconName: 'download',
        className: 'secondary-button',
        onClick: () => downloadTheme()
      })
    ])),
    createThemeCustomPanel()
  ]);
}

function renderMessagePersonalization() {
  const settings = getSettings();
  const messageTheme = getMessageTheme();

  const bubbleModeField = selectField({
    label: '气泡模式',
    value: settings.personalization?.bubbleMode || 'bubble',
    options: [
      { value: 'bubble', label: '气泡模式' },
      { value: 'dialog', label: '对话模式' }
    ],
    onChange: (value) => {
      updateSettings((next) => {
        next.personalization.bubbleMode = value;
        return next;
      });

      toast('聊天模式已更新');
    }
  });

  const fontSizeField = inputField({
    label: '消息字体大小',
    value: messageTheme.fontSize || '',
    placeholder: '15px'
  });

  const backgroundColorField = inputField({
    label: '默认聊天背景色',
    value: messageTheme.backgroundColor || '',
    placeholder: '#FAFAFA'
  });

  return h('div', { className: 'form' }, [
    card({
      title: '消息',
      text: '这里设置全局消息表现。单个角色仍可在角色管理里设置独立聊天背景。',
      className: 'large'
    }),
    createFold('气泡模式', h('div', { className: 'form' }, [
      bubbleModeField.wrap
    ]), true),
    createFold('字体大小', h('div', { className: 'form' }, [
      fontSizeField.wrap,
      button({
        text: '保存字体大小',
        className: 'primary-button full-button',
        onClick: () => {
          saveMessageTheme({
            ...getMessageTheme(),
            fontSize: fontSizeField.input.value.trim()
          });
          toast('已保存');
        }
      })
    ])),
    createFold('聊天背景', h('div', { className: 'form' }, [
      backgroundColorField.wrap,
      button({
        text: '上传默认聊天背景',
        iconName: 'image',
        className: 'secondary-button full-button',
        onClick: async () => {
          const image = await pickImage();

          if (!image) {
            return;
          }

          saveMessageTheme({
            ...getMessageTheme(),
            backgroundImage: image
          });

          toast('已保存背景图');
        }
      }),
      button({
        text: '清除默认聊天背景',
        className: 'secondary-button full-button',
        onClick: () => {
          saveMessageTheme({
            ...getMessageTheme(),
            backgroundImage: '',
            backgroundColor: ''
          });

          toast('已清除');
        }
      }),
      button({
        text: '保存背景色',
        className: 'primary-button full-button',
        onClick: () => {
          saveMessageTheme({
            ...getMessageTheme(),
            backgroundColor: backgroundColorField.input.value.trim()
          });

          toast('已保存');
        }
      })
    ])),
    createFold('表情包库', renderStickerLibrary())
  ]);
}

function renderIconPersonalization() {
  return h('div', { className: 'form' }, [
    card({
      title: '应用图标',
      text: '可以替换每个应用的图标、显示名称和Dock状态。',
      className: 'large'
    }),
    createIconManagerPanel()
  ]);
}

function renderProfilePersonalization() {
  const profile = getUserProfile();

  const nicknameField = inputField({
    label: '昵称',
    value: profile.nickname || '',
    placeholder: '我的昵称'
  });

  return h('div', { className: 'form' }, [
    card({
      title: '我的资料',
      text: '聊天中用户头像会使用这里的头像。',
      className: 'large'
    }),
    nicknameField.wrap,
    button({
      text: '保存昵称',
      className: 'primary-button full-button',
      onClick: () => {
        saveUserProfile({
          ...getUserProfile(),
          nickname: nicknameField.input.value.trim()
        });

        toast('昵称已保存');
      }
    }),
    button({
      text: '更换用户头像',
      iconName: 'image',
      className: 'secondary-button full-button',
      onClick: async () => {
        const image = await pickImage();

        if (!image) {
          return;
        }

        updateSettings((next) => {
          next.personalization.userAvatar = image;
          return next;
        });

        saveUserProfile({
          ...getUserProfile(),
          avatar: image
        });

        toast('头像已更新');
        refreshDesktopOnly();
      }
    }),
    button({
      text: '清除用户头像',
      className: 'secondary-button full-button',
      onClick: () => {
        updateSettings((next) => {
          next.personalization.userAvatar = '';
          return next;
        });

        saveUserProfile({
          ...getUserProfile(),
          avatar: ''
        });

        toast('头像已清除');
        refreshDesktopOnly();
      }
    })
  ]);
}

function createFold(title, content, open = false) {
  const item = h('section', { className: ['accordion-item', open ? 'open' : ''].join(' ') });
  const body = h('div', { className: 'accordion-body' });

  if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    body.append(...content);
  }

  const header = h('button', {
    type: 'button',
    className: 'accordion-header',
    onClick: () => item.classList.toggle('open')
  }, [
    h('div', { className: 'accordion-title', text: title }),
    h('div', { className: 'accordion-icon' }, icon('chevronDown'))
  ]);

  item.append(header, body);
  return item;
}

function createThemeCustomPanel() {
  const current = getCurrentThemeVariables();

  const accentField = inputField({
    label: '强调色',
    value: current['--accent'] || '',
    placeholder: '#D9A58F'
  });

  const bubbleUserField = inputField({
    label: '用户气泡色',
    value: current['--bubble-user-bg'] || '',
    placeholder: '#D9A58F'
  });

  const bubbleAIField = inputField({
    label: 'AI气泡色',
    value: current['--bubble-ai-bg'] || '',
    placeholder: '#FFFFFF'
  });

  const radiusField = inputField({
    label: '圆角',
    value: current['--bubble-radius'] || '',
    placeholder: '18px'
  });

  const fontField = inputField({
    label: '字体',
    value: current['--font-main'] || '',
    placeholder: 'PingFang SC'
  });

  const fields = [
    ['--accent', accentField],
    ['--bubble-user-bg', bubbleUserField],
    ['--bubble-ai-bg', bubbleAIField],
    ['--bubble-radius', radiusField],
    ['--font-main', fontField]
  ];

  fields.forEach(([name, field]) => {
    field.input.addEventListener('input', () => {
      setThemeVariable(name, field.input.value, { save: false });
    });
  });

  return createFold('自定义编辑', h('div', { className: 'form' }, [
    accentField.wrap,
    bubbleUserField.wrap,
    bubbleAIField.wrap,
    radiusField.wrap,
    fontField.wrap,
    button({
      text: '保存自定义主题',
      className: 'primary-button full-button',
      onClick: () => {
        fields.forEach(([name, field]) => {
          if (field.input.value.trim()) {
            setThemeVariable(name, field.input.value.trim());
          }
        });

        toast('已保存主题');
      }
    })
  ]));
}

function updateWidgetSetting(key, checked) {
  updateSettings((settings) => {
    settings.personalization.widgets[key] = checked;
    return settings;
  });

  toast('已更新');
  refreshDesktopOnly();
}

function createWeatherPanel() {
  const weather = getSettings().personalization?.weather || {};

  const cityField = inputField({
    label: '城市',
    value: weather.city || '',
    placeholder: '例如：北京'
  });

  const latitudeField = inputField({
    label: '纬度',
    value: weather.latitude || '',
    placeholder: '可留空'
  });

  const longitudeField = inputField({
    label: '经度',
    value: weather.longitude || '',
    placeholder: '可留空'
  });

  return createFold('天气位置', h('div', { className: 'form' }, [
    cityField.wrap,
    latitudeField.wrap,
    longitudeField.wrap,
    button({
      text: '保存天气位置',
      className: 'primary-button full-button',
      onClick: () => {
        updateSettings((settings) => {
          settings.personalization.weather = {
            city: cityField.input.value.trim(),
            latitude: latitudeField.input.value.trim(),
            longitude: longitudeField.input.value.trim()
          };
          return settings;
        });

        toast('已保存');
        refreshDesktopOnly();
      }
    })
  ]));
}

function createPositionManagerPanel() {
  const apps = getApps();

  return createFold('图标位置管理', h('div', { className: 'card-list' }, apps.map((app) => {
    return card({
      title: app.customName || app.name,
      text: Number(app.page || 0) === 0 ? '当前在第一页' : '当前在第二页',
      actions: [
        button({
          text: '第一页',
          className: Number(app.page || 0) === 0 ? 'primary-button' : 'secondary-button',
          onClick: () => moveAppPage(app.id, 0)
        }),
        button({
          text: '第二页',
          className: Number(app.page || 0) === 1 ? 'primary-button' : 'secondary-button',
          onClick: () => moveAppPage(app.id, 1)
        }),
        button({
          text: app.dock ? '移出Dock' : '加入Dock',
          className: 'secondary-button',
          onClick: () => {
            updateApp(app.id, { dock: !app.dock });
            toast('已更新Dock');
            refreshDesktopOnly();
          }
        })
      ]
    });
  })));
}

function createIconManagerPanel() {
  const apps = getApps();

  return h('div', { className: 'card-list' }, apps.map((app) => {
    return card({
      title: app.customName || app.name,
      text: app.name,
      actions: [
        button({
          text: '改名',
          className: 'secondary-button',
          onClick: () => openAppNameEditor(app)
        }),
        button({
          text: '换图标',
          className: 'secondary-button',
          onClick: async () => {
            const image = await pickImage();

            if (!image) {
              return;
            }

            updateApp(app.id, { icon: image });
            toast('图标已更新');
            refreshDesktopOnly();
          }
        }),
        button({
          text: '清除图标',
          className: 'text-button',
          onClick: () => {
            updateApp(app.id, { icon: '' });
            toast('已清除');
            refreshDesktopOnly();
          }
        })
      ]
    });
  }));
}

function openAppNameEditor(app) {
  const nameField = inputField({
    label: '应用名称',
    value: app.customName || app.name,
    placeholder: app.name
  });

  const instance = sheet({
    title: '修改应用名称',
    content: nameField.wrap,
    actions: [
      button({
        text: '保存',
        className: 'primary-button',
        onClick: () => {
          updateApp(app.id, {
            customName: nameField.input.value.trim() || app.name
          });

          instance.close();
          toast('已保存');
          refreshDesktopOnly();
        }
      })
    ]
  });
}

function moveAppPage(appId, page) {
  const apps = getApps();
  const maxOrder = apps
    .filter((app) => Number(app.page || 0) === page)
    .reduce((max, app) => Math.max(max, Number(app.order || 0)), -1);

  updateApp(appId, {
    page,
    order: maxOrder + 1
  });

  toast('位置已更新');
  refreshDesktopOnly();
}

function getUserProfile() {
  return readLocal(PROFILE_KEY, {
    nickname: '',
    avatar: ''
  });
}

function saveUserProfile(profile = {}) {
  writeLocal(PROFILE_KEY, {
    nickname: profile.nickname || '',
    avatar: profile.avatar || ''
  });
}

function getMessageTheme() {
  return readLocal(MESSAGE_THEME_KEY, {
    fontSize: '',
    backgroundImage: '',
    backgroundColor: ''
  });
}

function saveMessageTheme(theme = {}) {
  writeLocal(MESSAGE_THEME_KEY, {
    fontSize: theme.fontSize || '',
    backgroundImage: theme.backgroundImage || '',
    backgroundColor: theme.backgroundColor || ''
  });
}

function getStickerLibrary() {
  return readLocal(STICKER_LIBRARY_KEY, []);
}

function saveStickerLibrary(stickers = []) {
  writeLocal(STICKER_LIBRARY_KEY, stickers);
  window.dispatchEvent(new CustomEvent('ai-phone-sticker-library-change', {
    detail: stickers
  }));
}

function renderStickerLibrary() {
  const stickers = getStickerLibrary();
  const list = h('div', { className: 'form' });

  list.appendChild(button({
    text: '上传表情包',
    iconName: 'image',
    className: 'primary-button full-button',
    onClick: openStickerEditor
  }));

  if (!stickers.length) {
    list.appendChild(card({
      title: '还没有表情包',
      text: '上传图片并填写描述后，聊天工具栏里会显示。',
      className: 'large'
    }));
  }

  stickers.forEach((sticker) => {
    list.appendChild(h('article', { className: 'card large' }, [
      h('div', { className: 'list-row' }, [
        h('div', { className: 'sticker-item', style: { width: '72px', height: '72px' } }, [
          h('img', { src: sticker.image, alt: sticker.description || '表情包' })
        ]),
        h('div', { className: 'list-row-main' }, [
          h('div', { className: 'list-row-title', text: sticker.description || '未描述' }),
          h('div', { className: 'list-row-desc', text: sticker.autoDescription ? '视觉模型生成描述' : '手动描述' })
        ])
      ]),
      h('div', { className: 'card-actions' }, [
        button({
          text: '编辑',
          className: 'secondary-button',
          onClick: () => openStickerEditor(sticker)
        }),
        button({
          text: '删除',
          className: 'text-button danger',
          onClick: async () => {
            const ok = await confirmDialog({
              title: '删除表情包',
              message: '确认删除这张表情包吗？',
              danger: true
            });

            if (ok) {
              saveStickerLibrary(getStickerLibrary().filter((item) => item.id !== sticker.id));
              toast('已删除');
              refresh();
            }
          }
        })
      ])
    ]));
  });

  return list;
}

async function openStickerEditor(sticker = null) {
  let imageData = sticker?.image || '';

  const descField = inputField({
    label: '描述',
    value: sticker?.description || '',
    placeholder: '例如：开心大笑'
  });

  const form = h('div', { className: 'form' }, [
    imageData ? h('div', { className: 'sticker-item', style: { width: '120px', height: '120px' } }, [
      h('img', { src: imageData, alt: '表情包' })
    ]) : card({
      title: '未选择图片',
      text: '请选择一张本地图片。',
      className: 'large'
    }),
    button({
      text: '选择图片',
      iconName: 'image',
      className: 'secondary-button full-button',
      onClick: async () => {
        const image = await pickImage();

        if (image) {
          imageData = image;
          toast('图片已选择，保存后生效');
        }
      }
    }),
    descField.wrap,
    card({
      title: '自动识别说明',
      text: '视觉模型自动识别会在后续聊天模块调用支持图片的模型；这里也可以先手动填写描述。',
      className: 'large'
    })
  ]);

  const instance = sheet({
    title: sticker ? '编辑表情包' : '新增表情包',
    content: form,
    actions: [
      button({
        text: '保存',
        className: 'primary-button',
        onClick: () => {
          if (!imageData) {
            toast('请先选择图片');
            return;
          }

          const stickers = getStickerLibrary();
          const next = {
            id: sticker?.id || uuid(),
            image: imageData,
            description: descField.input.value.trim() || '未描述',
            autoDescription: Boolean(sticker?.autoDescription),
            createdAt: sticker?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          const index = stickers.findIndex((item) => item.id === next.id);

          if (index >= 0) {
            stickers[index] = next;
          } else {
            stickers.unshift(next);
          }

          saveStickerLibrary(stickers);
          instance.close();
          toast('已保存表情包');
          refresh();
        }
      })
    ]
  });
}

function createDataSection() {
  const body = h('div', { className: 'form' }, [
    button({
      text: '导出全部数据',
      iconName: 'download',
      className: 'secondary-button full-button',
      onClick: () => {
        downloadText('ai-phone-data.json', exportAllData(), 'application/json;charset=utf-8');
      }
    }),
    button({
      text: '导入数据',
      iconName: 'upload',
      className: 'secondary-button full-button',
      onClick: async () => {
        try {
          const text = await pickTextFile();

          if (!text) {
            return;
          }

          importAllData(text);
          toast('数据已导入');
          refresh();
        } catch (error) {
          toast(error.message || '导入失败');
        }
      }
    }),
    button({
      text: '清空所有数据',
      className: 'danger-button full-button',
      onClick: async () => {
        const ok = await confirmDialog({
          title: '清空所有数据',
          message: '此操作会清除本机保存的全部数据，确认继续吗？',
          danger: true
        });

        if (ok) {
          clearAllData();
          toast('已清空');
          refresh();
        }
      }
    }),
    button({
      text: '恢复默认数据',
      className: 'secondary-button full-button',
      onClick: async () => {
        const ok = await confirmDialog({
          title: '恢复默认数据',
          message: '会重置当前应用数据，确认继续吗？'
        });

        if (ok) {
          resetData();
          toast('已恢复默认');
          refresh();
        }
      }
    })
  ]);

  return createAccordionItem({
    title: '数据管理',
    content: body,
    open: false
  });
}
