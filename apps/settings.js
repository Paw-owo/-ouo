import {
  getData,
  getSettings,
  updateSettings,
  getApps,
  updateApp,
  setApps,
  exportAllData,
  importAllData,
  clearAllData,
  resetData,
  clone
} from '../core/storage.js';

import {
  getThemePresets,
  switchTheme,
  importTheme,
  exportTheme,
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
  createFileInput,
  fileToBase64
} from '../core/ui.js';

let root = null;
let contextRef = null;

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
      subtitle: '所有选项默认收起',
      left: h('div', { className: 'app-header-left' }, createBackButton()),
      right: h('div', { className: 'app-header-right' })
    }),
    h('main', { className: 'app-content' }, [
      h('div', { className: 'accordion' }, [
        createAPISection().item,
        createTTSSection().item,
        createMCPSection().item,
        createThemeSection().item,
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

function createAPISection() {
  const body = h('div', { className: 'form' });
  const settings = getSettings();
  const configs = getApiConfigs();

  body.append(
    card({
      title: 'API配置说明',
      text: '可以添加多个OpenAI兼容端点。每个配置可拉取模型，也可以手动输入模型名。',
      className: 'large'
    })
  );

  body.appendChild(
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
      text: '添加后聊天应用即可选择端点和模型。',
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
  const modelText = config.model || config.models?.[0] || '未设置模型';
  const actions = [
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
          toast(error.message || '拉取失败');
        }
      }
    }),
    button({
      text: '测试',
      className: 'secondary-button',
      onClick: async () => {
        try {
          toast('正在测试连接');
          await testApiConfig(config, config.model || config.models?.[0] || '');
          toast('连接成功');
        } catch (error) {
          toast(error.message || '测试失败');
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
  ];

  return card({
    title: config.name,
    text: `${config.endpoint || '未填写端点'}\n模型：${modelText}`,
    meta: config.models?.length ? `已保存 ${config.models.length} 个模型` : '可手动输入模型名',
    actions,
    className: 'large'
  });
}

function openAPIEditor(config = null) {
  const current = normalizeApiConfig(config || {
    name: '新的API配置'
  });

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
    label: 'Key',
    value: current.apiKey,
    placeholder: 'sk-...',
    type: 'password'
  });

  const modelField = inputField({
    label: '默认模型',
    value: current.model,
    placeholder: '例如：gpt-4o-mini'
  });

  const modelsField = textareaField({
    label: '模型列表',
    value: (current.models || []).join('\n'),
    placeholder: '每行一个模型名',
    rows: 4
  });

  const form = h('div', { className: 'form' }, [
    nameField.wrap,
    endpointField.wrap,
    keyField.wrap,
    modelField.wrap,
    modelsField.wrap
  ]);

  const saveButton = button({
    text: '保存',
    className: 'primary-button',
    onClick: () => {
      saveApiConfig({
        ...current,
        name: nameField.input.value.trim() || 'API配置',
        endpoint: endpointField.input.value.trim(),
        apiKey: keyField.input.value.trim(),
        model: modelField.input.value.trim(),
        models: modelsField.textarea.value
          .split('\n')
          .map((item) => item.trim())
          .filter(Boolean)
      });

      instance.close();
      toast('已保存');
      refresh();
    }
  });

  const instance = createBottomSheet('API配置', form, [saveButton]);
}

function createTTSSection() {
  const body = h('div', { className: 'form' });
  const configs = getTTSConfigs();
  const defaultId = getDefaultTTSConfigId();

  body.append(
    card({
      title: '语音配置说明',
      text: '聊天里可为每个对话单独选择语音配置。没有接口时可使用浏览器语音。',
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
    type: 'password'
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

  const enabledSwitch = switchControl({
    label: '默认启用',
    description: '聊天里仍然可以单独开关',
    checked: current.enabled
  });

  let enabled = current.enabled;

  enabledSwitch.querySelector('.switch').addEventListener('click', () => {
    enabled = enabledSwitch.querySelector('.switch').classList.contains('active');
  });

  const browserVoicesButton = button({
    text: '查看浏览器声音',
    className: 'secondary-button full-button',
    onClick: async () => {
      const voices = await waitForBrowserVoices();
      toast(voices.length ? `找到 ${voices.length} 个声音` : '没有找到浏览器声音');
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
    browserVoicesButton
  ]);

  const saveButton = button({
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
  });

  const instance = createBottomSheet('TTS配置', form, [saveButton]);
}

function createMCPSection() {
  const body = h('div', { className: 'form' });
  const servers = getMCPServers();

  body.append(
    card({
      title: 'MCP配置说明',
      text: '聊天配置抽屉里可选择当前对话启用哪些MCP服务器和工具。',
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

  let enabled = current.enabled;

  const enabledSwitch = switchControl({
    label: '启用服务器',
    description: '关闭后聊天中不会显示',
    checked: current.enabled
  });

  enabledSwitch.querySelector('.switch').addEventListener('click', () => {
    enabled = enabledSwitch.querySelector('.switch').classList.contains('active');
  });

  const form = h('div', { className: 'form' }, [
    nameField.wrap,
    groupField.wrap,
    urlField.wrap,
    headersField.wrap,
    enabledSwitch
  ]);

  const saveButton = button({
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
  });

  const instance = createBottomSheet('MCP服务器', form, [saveButton]);
}

function createThemeSection() {
  const body = h('div', { className: 'form' });
  const presets = getThemePresets();

  body.appendChild(
    h('div', { className: 'card-list' }, presets.map((theme) => {
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
    }))
  );

  body.append(
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
    ])
  );

  body.appendChild(createThemeCustomPanel());

  return createAccordionItem({
    title: '主题',
    content: body,
    open: false
  });
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

  const saveButton = button({
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
  });

  return createAccordionItem({
    title: '自定义编辑',
    content: h('div', { className: 'form' }, [
      accentField.wrap,
      bubbleUserField.wrap,
      bubbleAIField.wrap,
      radiusField.wrap,
      fontField.wrap,
      saveButton
    ]),
    open: false
  }).item;
}

function createPersonalizationSection() {
  const body = h('div', { className: 'form' });
  const settings = getSettings();
  const personalization = settings.personalization || {};
  const widgets = personalization.widgets || {};

  body.append(
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
    })
  );

  body.appendChild(createBubbleModePanel(personalization.bubbleMode));
  body.appendChild(createWidgetPanel(widgets));
  body.appendChild(createWeatherPanel(personalization.weather || {}));
  body.appendChild(createIconManagerPanel());
  body.appendChild(createPositionManagerPanel());

  return createAccordionItem({
    title: '个性化',
    content: body,
    open: false
  });
}

function createBubbleModePanel(currentMode = 'bubble') {
  const select = selectField({
    label: '聊天显示模式',
    value: currentMode,
    options: [
      { value: 'bubble', label: '气泡模式' },
      { value: 'dialog', label: '对话模式' }
    ],
    onChange: (value) => {
      updateSettings((settings) => {
        settings.personalization.bubbleMode = value;
        return settings;
      });

      toast('聊天模式已更新');
    }
  });

  return createAccordionItem({
    title: '气泡模式',
    content: h('div', { className: 'form' }, select.wrap),
    open: false
  }).item;
}

function createWidgetPanel(widgets = {}) {
  const timeSwitch = switchControl({
    label: '时间小组件',
    checked: widgets.time !== false,
    onChange: (checked) => updateWidgetSetting('time', checked)
  });

  const weatherSwitch = switchControl({
    label: '天气小组件',
    checked: widgets.weather !== false,
    onChange: (checked) => updateWidgetSetting('weather', checked)
  });

  const anniversarySwitch = switchControl({
    label: '纪念日倒计时',
    checked: widgets.anniversary !== false,
    onChange: (checked) => updateWidgetSetting('anniversary', checked)
  });

  return createAccordionItem({
    title: '桌面小组件',
    content: h('div', { className: 'form' }, [
      timeSwitch,
      weatherSwitch,
      anniversarySwitch
    ]),
    open: false
  }).item;
}

function updateWidgetSetting(key, checked) {
  updateSettings((settings) => {
    settings.personalization.widgets[key] = checked;
    return settings;
  });

  refresh();
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

  return createAccordionItem({
    title: '天气位置',
    content: h('div', { className: 'form' }, [
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
    ]),
    open: false
  }).item;
}

function createIconManagerPanel() {
  const apps = getApps();

  const list = h('div', { className: 'card-list' }, apps.map((app) => {
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
        })
      ]
    });
  }));

  return createAccordionItem({
    title: '应用图标管理',
    content: list,
    open: false
  }).item;
}

function openAppNameEditor(app) {
  const nameField = inputField({
    label: '应用名称',
    value: app.customName || app.name,
    placeholder: app.name
  });

  const instance = createBottomSheet('修改应用名称', nameField.wrap, [
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
  ]);
}

function createPositionManagerPanel() {
  const apps = getApps();

  const pageOne = h('div', { className: 'card-list' });
  const pageTwo = h('div', { className: 'card-list' });

  apps.forEach((app) => {
    const row = card({
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
            refresh();
          }
        })
      ]
    });

    if (Number(app.page || 0) === 0) {
      pageOne.appendChild(row);
    } else {
      pageTwo.appendChild(row);
    }
  });

  return createAccordionItem({
    title: '图标位置管理',
    content: h('div', { className: 'form' }, [
      card({ title: '第一页', text: '桌面第一页应用', className: 'large' }),
      pageOne,
      card({ title: '第二页', text: '桌面第二页应用', className: 'large' }),
      pageTwo
    ]),
    open: false
  }).item;
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

function createBottomSheet(title, content, actions = []) {
  const layer = h('div', { className: 'sheet-layer' });
  const panel = h('div', { className: 'sheet' });
  const body = h('div', { className: 'scrollable' });

  if (content instanceof Node) {
    body.appendChild(content);
  } else if (Array.isArray(content)) {
    body.append(...content);
  } else if (content) {
    body.textContent = String(content);
  }

  panel.append(
    h('div', { className: 'sheet-handle' }),
    h('div', { className: 'sheet-title', text: title }),
    body
  );

  if (actions.length) {
    panel.appendChild(h('div', { className: 'card-actions' }, [
      button({
        text: '取消',
        className: 'secondary-button',
        onClick: () => instance.close()
      }),
      ...actions
    ]));
  }

  layer.appendChild(panel);
  document.body.appendChild(layer);

  const instance = {
    layer,
    panel,
    close() {
      layer.classList.remove('active');
      window.setTimeout(() => layer.remove(), 220);
    }
  };

  layer.addEventListener('click', (event) => {
    if (event.target === layer) {
      instance.close();
    }
  });

  requestAnimationFrame(() => {
    layer.classList.add('active');
  });

  return instance;
}
