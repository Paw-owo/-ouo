import {
  getData,
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
  uuid,
  clone
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
  fetchModels,
  fetchAndSaveModels,
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
  fileToBase64,
  createFileInput,
  sheet
} from '../core/ui.js';

export const STICKER_LIBRARY_KEY = 'ai_phone_sticker_library_v1';
export const APP_THEME_SUMMARY_KEY = 'ai_phone_app_theme_summary_v1';

let root = null;
let contextRef = null;
let visibleApiKeys = new Set();
let openPersonalCategory = '';
let apiEditorModels = [];

export function mount(container, context = {}) {
  root = container;
  contextRef = context;
  render();

  return () => {
    root = null;
    contextRef = null;
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
        createSection('API配置', createAPISection()),
        createSection('TTS配置', createTTSSection()),
        createSection('MCP配置', createMCPSection()),
        createSection('个性化', createPersonalizationSection()),
        createSection('数据管理', createDataSection())
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

function createSection(title, content, open = false) {
  const item = h('section', { className: ['accordion-item', open ? 'open' : ''].join(' ') });
  const body = h('div', { className: 'accordion-body' });

  if (content instanceof Node) {
    body.appendChild(content);
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

function createAPISection() {
  const body = h('div', { className: 'form' });
  const settings = getSettings();
  const configs = getApiConfigs();

  body.append(
    card({
      title: 'OpenAI兼容接口',
      text: '可保存多个端点。每个端点都能拉取模型，也可以手动输入模型名。',
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
      text: '新增后，聊天里可以按对话实时切换端点和模型。',
      className: 'large'
    }));
  }

  configs.forEach((config) => {
    body.appendChild(createAPIConfigCard(config, settings.defaultApiConfigId === config.id));
  });

  return body;
}

function createAPIConfigCard(config, isDefault) {
  const keyVisible = visibleApiKeys.has(config.id);
  const keyText = config.apiKey
    ? keyVisible
      ? config.apiKey
      : maskKey(config.apiKey)
    : '未填写Key';

  return h('article', { className: 'card large' }, [
    h('div', { className: 'card-title', text: config.name || 'API配置' }),
    h('div', { className: 'card-text', text: config.endpoint || '未填写endpoint' }),
    h('div', { className: 'card-meta', text: `Key：${keyText}` }),
    h('div', { className: 'card-meta', text: `已选模型：${config.model || '未选择'}` }),
    config.models?.length
      ? h('div', { className: 'card-meta', text: `已拉取模型：${config.models.length} 个` })
      : h('div', { className: 'card-meta', text: '可点击拉取模型，失败也可手动填写' }),
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
            toast(models.length ? '模型已更新' : '未获取到模型，可手动填写');
            refresh();
          } catch (error) {
            toast('拉取失败，可手动填写模型');
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
            visibleApiKeys.delete(config.id);
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

  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function openAPIEditor(config = null) {
  const current = normalizeApiConfig(config || {
    name: '新的API配置'
  });

  apiEditorModels = Array.isArray(current.models) ? [...current.models] : [];

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
  const renderModelSelect = () => {
    modelSelectWrap.replaceChildren();

    if (!apiEditorModels.length) {
      modelSelectWrap.appendChild(h('div', { className: 'form-hint', text: '还没有模型列表。可以点击拉取模型，或直接手动输入。' }));
      return;
    }

    const modelField = selectField({
      label: '从已拉取模型中选择',
      value: modelInputField.input.value || current.model || apiEditorModels[0],
      options: apiEditorModels.map((model) => ({
        value: model,
        label: model
      })),
      onChange: (value) => {
        modelInputField.input.value = value;
      }
    });

    modelSelectWrap.appendChild(modelField.wrap);
  };

  renderModelSelect();

  const fetchButton = button({
    text: '拉取模型',
    className: 'secondary-button full-button',
    onClick: async () => {
      try {
        toast('正在拉取模型');
        apiEditorModels = await fetchModels({
          ...current,
          endpoint: endpointField.input.value.trim(),
          apiKey: keyField.input.value.trim()
        });

        if (apiEditorModels.length) {
          modelInputField.input.value = modelInputField.input.value || apiEditorModels[0];
        }

        renderModelSelect();
        toast(apiEditorModels.length ? '模型已拉取' : '没有获取到模型，可手动输入');
      } catch {
        toast('拉取失败，可手动输入模型名');
      }
    }
  });

  const form = h('div', { className: 'form' }, [
    nameField.wrap,
    endpointField.wrap,
    keyField.wrap,
    fetchButton,
    modelSelectWrap,
    modelInputField.wrap,
    card({
      title: '说明',
      text: 'API Key使用普通文本框，方便粘贴。模型拉取失败也不影响手动输入。',
      className: 'large'
    })
  ]);

  const instance = sheet({
    title: config ? '编辑API配置' : '新增API配置',
    content: form,
    actions: [
      button({
        text: '保存',
        className: 'primary-button',
        onClick: () => {
          saveApiConfig({
            ...current,
            name: nameField.input.value.trim() || 'API配置',
            endpoint: endpointField.input.value.trim(),
            apiKey: keyField.input.value.trim(),
            model: modelInputField.input.value.trim(),
            models: apiEditorModels
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
      title: '语音服务',
      text: '聊天里可为每个对话单独选择TTS配置。',
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
      text: '可使用浏览器语音，也可添加OpenAI兼容语音接口。',
      className: 'large'
    }));
  }

  configs.forEach((config) => {
    body.appendChild(createTTSConfigCard(config, config.id === defaultId));
  });

  return body;
}

function createTTSConfigCard(config, isDefault) {
  return card({
    title: config.name,
    text: `服务商：${config.provider}\n声音：${config.voice || '默认'}\n端点：${config.endpoint || '浏览器语音'}`,
    meta: config.enabled ? '默认启用' : '默认关闭',
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

  let enabled = current.enabled;

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
    placeholder: 'https://api.example.com',
    type: 'text'
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
    placeholder: 'tts-1',
    type: 'text'
  });

  const voiceField = inputField({
    label: '声音',
    value: current.voice,
    placeholder: 'nova',
    type: 'text'
  });

  const enabledSwitch = switchControl({
    label: '默认启用',
    description: '聊天里仍然可以单独开关',
    checked: enabled,
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
    title: config ? '编辑TTS配置' : '新增TTS配置',
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
      title: 'MCP工具',
      text: '聊天配置抽屉里可为每个对话单独选择MCP服务器。',
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
      text: '添加后可在聊天中启用工具。',
      className: 'large'
    }));
  }

  servers.forEach((server) => {
    body.appendChild(createMCPServerCard(server));
  });

  return body;
}

function createMCPServerCard(server) {
  return card({
    title: server.name,
    text: `分组：${server.group || '默认分组'}\n地址：${server.url || '未填写'}\n工具：${server.tools?.length || 0} 个`,
    meta: server.enabled ? '已启用' : '已关闭',
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
    checked: enabled,
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
    title: server ? '编辑MCP服务器' : '新增MCP服务器',
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
  return h('div', { className: 'form' }, [
    createPersonalCategory('desktop', '桌面', '壁纸、图标位置、小组件开关', createDesktopPersonalPanel()),
    createPersonalCategory('theme', '主题', '预设主题、导入导出、自定义编辑', createThemePersonalPanel()),
    createPersonalCategory('message', '消息', '气泡模式、字体大小、聊天背景、表情包', createMessagePersonalPanel()),
    createPersonalCategory('icons', '应用图标', '替换图标、改名、Dock显示', createAppIconPanel()),
    createPersonalCategory('profile', '我的资料', '用户头像、昵称', createProfilePanel())
  ]);
}

function createPersonalCategory(id, title, desc, content) {
  const open = openPersonalCategory === id;
  const item = h('section', { className: ['accordion-item', open ? 'open' : ''].join(' ') });

  const header = h('button', {
    type: 'button',
    className: 'accordion-header',
    onClick: () => {
      openPersonalCategory = open ? '' : id;
      refresh();
    }
  }, [
    h('div', { className: 'list-row-main' }, [
      h('div', { className: 'accordion-title', text: title }),
      h('div', { className: 'list-row-desc', text: desc })
    ]),
    h('div', { className: 'accordion-icon' }, icon('chevronDown'))
  ]);

  const body = h('div', { className: 'accordion-body' }, content);

  item.append(header, body);
  return item;
}

function createDesktopPersonalPanel() {
  const settings = getSettings();
  const widgets = settings.personalization?.widgets || {};

  return h('div', { className: 'form' }, [
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
        refresh();
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
        refresh();
      }
    }),
    createSubFold('小组件开关', h('div', { className: 'form' }, [
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
    ])),
    createSubFold('天气位置', createWeatherPanel(settings.personalization?.weather || {})),
    createSubFold('图标位置管理', createPositionPanel())
  ]);
}

function createThemePersonalPanel() {
  return h('div', { className: 'form' }, [
    createPresetThemePanel(),
    h('div', { className: 'button-row wrap' }, [
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
            refresh();
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
    ]),
    createSubFold('自定义编辑', createThemeCustomPanel())
  ]);
}

function createPresetThemePanel() {
  const presets = getThemePresets();

  return h('div', { className: 'card-list' }, presets.map((theme) => {
    const variables = theme.variables || {};

    return h('button', {
      type: 'button',
      className: 'theme-card',
      onClick: () => {
        switchTheme(theme.name);
        toast(`已切换到${theme.name}`);
        refresh();
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
  }));
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
    label: '气泡圆角',
    value: current['--bubble-radius'] || '',
    placeholder: '18px'
  });

  const fields = [
    ['--accent', accentField],
    ['--bubble-user-bg', bubbleUserField],
    ['--bubble-ai-bg', bubbleAIField],
    ['--bubble-radius', radiusField]
  ];

  fields.forEach(([name, field]) => {
    field.input.addEventListener('input', () => {
      setThemeVariable(name, field.input.value, { save: false });
    });
  });

  return h('div', { className: 'form' }, [
    accentField.wrap,
    bubbleUserField.wrap,
    bubbleAIField.wrap,
    radiusField.wrap,
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
  ]);
}

function createMessagePersonalPanel() {
  const settings = getSettings();
  const personalization = settings.personalization || {};

  const bubbleModeField = selectField({
    label: '气泡模式',
    value: personalization.bubbleMode || 'bubble',
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
    label: '聊天字体大小',
    value: personalization.chatFontSize || '',
    placeholder: '15px'
  });

  const chatBgColorField = inputField({
    label: '默认聊天背景色',
    value: personalization.chatBackgroundColor || '',
    placeholder: '#FAFAFA'
  });

  return h('div', { className: 'form' }, [
    bubbleModeField.wrap,
    fontSizeField.wrap,
    chatBgColorField.wrap,
    button({
      text: '保存消息外观',
      className: 'primary-button full-button',
      onClick: () => {
        updateSettings((next) => {
          next.personalization.chatFontSize = fontSizeField.input.value.trim();
          next.personalization.chatBackgroundColor = chatBgColorField.input.value.trim();
          return next;
        });

        toast('已保存');
        refresh();
      }
    }),
    createSubFold('表情包库', createStickerLibraryPanel())
  ]);
}

function createStickerLibraryPanel() {
  const stickers = getStickerLibrary();
  const list = h('div', { className: 'form' }, [
    button({
      text: '上传表情包',
      iconName: 'image',
      className: 'primary-button full-button',
      onClick: openStickerEditor
    })
  ]);

  if (!stickers.length) {
    list.appendChild(card({
      title: '还没有表情包',
      text: '上传图片并填写描述后，聊天工具栏会显示。',
      className: 'large'
    }));
    return list;
  }

  list.appendChild(h('div', { className: 'sticker-grid' }, stickers.map((sticker) => {
    return h('div', {}, [
      h('button', {
        type: 'button',
        className: 'sticker-item',
        onClick: () => openStickerEditor(sticker)
      }, h('img', { src: sticker.image, alt: sticker.description || '表情包' })),
      h('div', { className: 'sticker-desc truncate', text: sticker.description || '未填写描述' })
    ]);
  })));

  return list;
}

function openStickerEditor(sticker = null) {
  const current = sticker || {
    id: uuid(),
    image: '',
    description: '',
    createdAt: new Date().toISOString()
  };

  let imageData = current.image || '';

  const descField = inputField({
    label: '描述',
    value: current.description || '',
    placeholder: '例如：开心大笑',
    type: 'text'
  });

  const form = h('div', { className: 'form' }, [
    imageData ? h('div', { className: 'sticker-item' }, h('img', { src: imageData, alt: '表情包' })) : card({
      title: '未选择图片',
      text: '先上传本地图片。',
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
          instance.close();
          openStickerEditor({
            ...current,
            image: imageData,
            description: descField.input.value
          });
        }
      }
    }),
    descField.wrap,
    button({
      text: '视觉模型自动识别',
      className: 'secondary-button full-button',
      onClick: () => {
        toast('请先手动填写描述，视觉识别会在后续API格式升级后启用');
      }
    })
  ]);

  const instance = sheet({
    title: sticker ? '编辑表情包' : '新增表情包',
    content: form,
    actions: [
      sticker ? button({
        text: '删除',
        className: 'danger-button',
        onClick: async () => {
          const ok = await confirmDialog({
            title: '删除表情包',
            message: '确认删除这张表情包吗？',
            danger: true
          });

          if (ok) {
            deleteSticker(sticker.id);
            instance.close();
            toast('已删除');
            refresh();
          }
        }
      }) : null,
      button({
        text: '保存',
        className: 'primary-button',
        onClick: () => {
          if (!imageData) {
            toast('请先选择图片');
            return;
          }

          saveSticker({
            ...current,
            image: imageData,
            description: descField.input.value.trim()
          });

          instance.close();
          toast('已保存');
          refresh();
        }
      })
    ].filter(Boolean)
  });
}

function getStickerLibrary() {
  return readLocal(STICKER_LIBRARY_KEY, []);
}

function saveSticker(sticker) {
  const stickers = getStickerLibrary();
  const normalized = {
    id: sticker.id || uuid(),
    image: sticker.image || '',
    description: sticker.description || '',
    createdAt: sticker.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  const index = stickers.findIndex((item) => item.id === normalized.id);

  if (index >= 0) {
    stickers[index] = normalized;
  } else {
    stickers.unshift(normalized);
  }

  writeLocal(STICKER_LIBRARY_KEY, stickers);
  return normalized;
}

function deleteSticker(stickerId) {
  const stickers = getStickerLibrary().filter((item) => item.id !== stickerId);
  writeLocal(STICKER_LIBRARY_KEY, stickers);
  return stickers;
}

function createAppIconPanel() {
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
            refresh();
          }
        }),
        button({
          text: '清除图标',
          className: 'text-button',
          onClick: () => {
            updateApp(app.id, { icon: '' });
            toast('已清除');
            refresh();
          }
        }),
        button({
          text: app.dock ? '移出Dock' : '加入Dock',
          className: 'secondary-button',
          onClick: () => {
            updateApp(app.id, { dock: !app.dock });
            toast('Dock已更新');
            refresh();
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
          refresh();
        }
      })
    ]
  });
}

function createProfilePanel() {
  const settings = getSettings();
  const personalization = settings.personalization || {};

  const nicknameField = inputField({
    label: '昵称',
    value: personalization.nickname || '',
    placeholder: '我',
    type: 'text'
  });

  return h('div', { className: 'form' }, [
    personalization.userAvatar
      ? h('div', { className: 'avatar lg' }, h('img', { src: personalization.userAvatar, alt: '用户头像' }))
      : card({
        title: '还没有头像',
        text: '上传后聊天里会显示你的头像。',
        className: 'large'
      }),
    nicknameField.wrap,
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

        toast('头像已更新');
        refresh();
      }
    }),
    button({
      text: '保存资料',
      className: 'primary-button full-button',
      onClick: () => {
        updateSettings((next) => {
          next.personalization.nickname = nicknameField.input.value.trim();
          return next;
        });

        toast('已保存');
        refresh();
      }
    })
  ]);
}

function createWeatherPanel(weather = {}) {
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

  return h('div', { className: 'form' }, [
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
        refresh();
      }
    })
  ]);
}

function createPositionPanel() {
  const apps = getApps();

  return h('div', { className: 'card-list' }, apps.map((app) => {
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
        })
      ]
    });
  }));
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
  refresh();
}

function updateWidgetSetting(key, checked) {
  updateSettings((settings) => {
    settings.personalization.widgets[key] = checked;
    return settings;
  });

  refresh();
}

function createSubFold(title, content) {
  const item = h('section', { className: 'accordion-item' });
  const body = h('div', { className: 'accordion-body' });

  if (content instanceof Node) {
    body.appendChild(content);
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

function createDataSection() {
  return h('div', { className: 'form' }, [
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
}
