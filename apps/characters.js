import {
  getCharacters,
  getCharacter,
  saveCharacter,
  deleteCharacter,
  createDefaultCharacter,
  getWorldbookItems,
  getSettings,
  nowISO,
  uuid,
  readLocal,
  writeLocal
} from '../core/storage.js';

import {
  getApiConfigs,
  normalizeApiConfig,
  bindCharacterApiConfig
} from '../core/api.js';

import {
  getTTSConfigs,
  normalizeTTSConfig,
  ttsConfigToCharacterConfig
} from '../core/tts.js';

import {
  replaceAllMemories,
  getMemoryStats
} from '../core/memory.js';

import {
  h,
  appHeader,
  createBackButton,
  iconButton,
  button,
  avatar,
  card,
  inputField,
  textareaField,
  selectField,
  switchControl,
  createTabs,
  createEmptyState,
  confirmDialog,
  toast,
  pickImage,
  pickTextFile,
  downloadText,
  sheet,
  copyText
} from '../core/ui.js';

export const CHARACTER_EXTRAS_KEY = 'ai_phone_character_extras_v1';
export const USER_PROFILES_KEY = 'ai_phone_user_profiles_v1';
export const APP_THEME_KEY = 'ai_phone_app_theme_characters_v1';

let root = null;
let contextRef = null;
let activeTab = 'characters';
let searchKeyword = '';

export function mount(container, context = {}) {
  root = container;
  contextRef = context;
  render();

  return () => {
    root = null;
    contextRef = null;
  };
}

export function getCharacterExtrasMap() {
  return readLocal(CHARACTER_EXTRAS_KEY, {});
}

export function setCharacterExtrasMap(map = {}) {
  writeLocal(CHARACTER_EXTRAS_KEY, map);
  window.dispatchEvent(new CustomEvent('ai-phone-character-extras-change', {
    detail: map
  }));
}

export function getCharacterExtras(characterId = '') {
  const map = getCharacterExtrasMap();

  return {
    isUserRole: false,
    userProfileScope: 'single',
    bindCharacterId: '',
    quickReplies: [],
    chatBackgroundMode: 'image',
    chatBackgroundColor: '',
    appTheme: null,
    ...(map[characterId] || {})
  };
}

export function saveCharacterExtras(characterId = '', extras = {}) {
  if (!characterId) {
    return null;
  }

  const map = getCharacterExtrasMap();

  map[characterId] = {
    ...getCharacterExtras(characterId),
    ...extras,
    quickReplies: normalizeQuickReplies(extras.quickReplies ?? getCharacterExtras(characterId).quickReplies)
  };

  setCharacterExtrasMap(map);

  return map[characterId];
}

export function deleteCharacterExtras(characterId = '') {
  const map = getCharacterExtrasMap();
  delete map[characterId];
  setCharacterExtrasMap(map);
}

export function normalizeQuickReplies(list = []) {
  return (Array.isArray(list) ? list : String(list || '').split('\n'))
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function getUserProfiles() {
  return readLocal(USER_PROFILES_KEY, []);
}

export function saveUserProfile(profile = {}) {
  const normalized = {
    id: profile.id || uuid(),
    name: profile.name || '我的角色',
    avatar: profile.avatar || '',
    description: profile.description || '',
    bindCharacterId: profile.bindCharacterId || '',
    scope: profile.scope || 'single',
    createdAt: profile.createdAt || nowISO(),
    updatedAt: nowISO()
  };

  const profiles = getUserProfiles();
  const index = profiles.findIndex((item) => item.id === normalized.id);

  if (index >= 0) {
    profiles[index] = normalized;
  } else {
    profiles.unshift(normalized);
  }

  writeLocal(USER_PROFILES_KEY, profiles);

  window.dispatchEvent(new CustomEvent('ai-phone-user-profile-change', {
    detail: profiles
  }));

  return normalized;
}

export function deleteUserProfile(profileId = '') {
  const profiles = getUserProfiles().filter((profile) => profile.id !== profileId);
  writeLocal(USER_PROFILES_KEY, profiles);

  window.dispatchEvent(new CustomEvent('ai-phone-user-profile-change', {
    detail: profiles
  }));

  return profiles;
}

export function getAppTheme() {
  return readLocal(APP_THEME_KEY, {
    name: '角色管理主题',
    version: '1.0',
    variables: {},
    backgroundImage: '',
    accent: '',
    radius: '',
    fontSize: ''
  });
}

export function saveAppTheme(theme = {}) {
  const normalized = {
    name: theme.name || '角色管理主题',
    version: theme.version || '1.0',
    variables: theme.variables || {},
    backgroundImage: theme.backgroundImage || '',
    accent: theme.accent || '',
    radius: theme.radius || '',
    fontSize: theme.fontSize || ''
  };

  writeLocal(APP_THEME_KEY, normalized);

  window.dispatchEvent(new CustomEvent('ai-phone-app-theme-change', {
    detail: {
      appId: 'characters',
      theme: normalized
    }
  }));

  return normalized;
}

function render() {
  if (!root) {
    return;
  }

  applyLocalTheme();

  const content = h('main', { className: 'app-content' }, [
    createSearchBar(),
    createTabs([
      { id: 'characters', name: 'AI角色' },
      { id: 'users', name: '我的角色' }
    ], activeTab, (tabId) => {
      activeTab = tabId;
      render();
    }),
    h('div', { className: 'card-list', style: { marginTop: 'var(--spacing-md)' } }, [
      activeTab === 'characters' ? createCharacterList() : createUserProfileList()
    ])
  ]);

  root.replaceChildren(
    appHeader({
      title: '角色管理',
      subtitle: activeTab === 'characters' ? '人设、记忆与默认配置' : '用户自己的角色',
      left: h('div', { className: 'app-header-left' }, createBackButton()),
      right: h('div', { className: 'app-header-right' }, [
        iconButton('config', {
          title: '应用设置',
          onClick: openAppThemeSheet
        }),
        iconButton('upload', {
          title: '导入角色',
          onClick: importCharacterCard
        }),
        iconButton('plus', {
          title: '新建',
          onClick: () => {
            if (activeTab === 'characters') {
              openCharacterEditor();
            } else {
              openUserProfileEditor();
            }
          }
        })
      ])
    }),
    content
  );
}

function refresh() {
  render();

  if (contextRef && typeof contextRef.refreshDesktop === 'function') {
    contextRef.refreshDesktop();
  }
}

function applyLocalTheme() {
  const theme = getAppTheme();

  if (!root) {
    return;
  }

  root.style.backgroundImage = theme.backgroundImage ? `url("${theme.backgroundImage}")` : '';
  root.style.backgroundSize = 'cover';
  root.style.backgroundPosition = 'center';

  if (theme.accent) {
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--bubble-user-bg', theme.accent);
  }

  if (theme.radius) {
    root.style.setProperty('--radius-md', theme.radius);
    root.style.setProperty('--radius-lg', theme.radius);
    root.style.setProperty('--bubble-radius', theme.radius);
  }

  if (theme.fontSize) {
    root.style.setProperty('--font-size-base', theme.fontSize);
  }
}

function createSearchBar() {
  const field = inputField({
    value: searchKeyword,
    placeholder: activeTab === 'characters' ? '搜索角色、人设、记忆' : '搜索我的角色',
    onInput: (value) => {
      searchKeyword = value;
      renderListOnly();
    }
  });

  return h('div', { className: 'form' }, field.input);
}

function renderListOnly() {
  const list = root?.querySelector('.card-list');

  if (!list) {
    return;
  }

  list.replaceChildren(activeTab === 'characters' ? createCharacterList() : createUserProfileList());
}

function createCharacterList() {
  const keyword = searchKeyword.trim().toLowerCase();
  const characters = getCharacters()
    .filter((character) => {
      if (!keyword) {
        return true;
      }

      const memories = (character.memories || []).map((memory) => memory.content).join('\n');

      return [
        character.name,
        character.systemPrompt,
        memories
      ].join('\n').toLowerCase().includes(keyword);
    });

  if (!characters.length) {
    return createEmptyState({
      iconName: 'characters',
      title: '还没有角色',
      description: '创建一个角色后，就可以在消息里开始聊天。',
      action: button({
        text: '新建角色',
        className: 'primary-button',
        onClick: () => openCharacterEditor()
      })
    });
  }

  return h('div', { className: 'card-list' }, characters.map(createCharacterCard));
}

function createCharacterCard(character) {
  const extras = getCharacterExtras(character.id);
  const stats = getMemoryStats(character.id);
  const apiName = getApiDisplayText(character);
  const ttsText = character.ttsConfig?.enabled ? `语音：${character.ttsConfig.voice || '默认'}` : '语音：未启用';

  return h('article', { className: 'card large' }, [
    h('div', { className: 'list-row' }, [
      avatar(character.avatar, character.name, 'lg'),
      h('div', { className: 'list-row-main' }, [
        h('div', { className: 'list-row-title', text: character.name }),
        h('div', { className: 'list-row-desc', text: apiName }),
        h('div', { className: 'list-row-desc', text: ttsText })
      ])
    ]),
    character.systemPrompt
      ? h('div', { className: 'card-text clamp-3', text: character.systemPrompt })
      : h('div', { className: 'card-meta', text: '还没有填写人设指令' }),
    h('div', { className: 'card-meta', text: `记忆 ${stats.total} 条 · 快捷回复 ${extras.quickReplies.length} 条` }),
    h('div', { className: 'card-actions' }, [
      button({
        text: '编辑',
        className: 'secondary-button',
        onClick: () => openCharacterEditor(character)
      }),
      button({
        text: '记忆',
        className: 'secondary-button',
        onClick: () => openMemorySheet(character)
      }),
      button({
        text: '导出',
        className: 'secondary-button',
        onClick: () => exportCharacterCard(character.id)
      }),
      button({
        text: '删除',
        className: 'text-button danger',
        onClick: async () => {
          const ok = await confirmDialog({
            title: '删除角色',
            message: `确认删除「${character.name}」吗？聊天记录也会一起删除。`,
            danger: true
          });

          if (ok) {
            deleteCharacter(character.id);
            deleteCharacterExtras(character.id);
            toast('已删除');
            refresh();
          }
        }
      })
    ])
  ]);
}

function getApiDisplayText(character) {
  const apiConfigs = getApiConfigs();
  const configId = character.apiConfig?.configId || '';
  const api = apiConfigs.find((item) => item.id === configId);
  const model = character.apiConfig?.model || api?.model || '';

  if (!api && !character.apiConfig?.endpoint) {
    return 'API：跟随全局默认';
  }

  return `API：${api?.name || character.apiConfig?.endpoint || '临时配置'}${model ? ` · ${model}` : ''}`;
}

function openCharacterEditor(character = null) {
  const current = character ? { ...character } : createDefaultCharacter({
    name: '新的角色'
  });

  const extras = getCharacterExtras(current.id);
  const apiConfigs = getApiConfigs();
  const ttsConfigs = getTTSConfigs();
  const worldbookItems = getWorldbookItems();

  let avatarData = current.avatar || '';
  let chatBackgroundData = current.chatBackground || '';
  let backgroundMode = extras.chatBackgroundMode || (current.chatBackground ? 'image' : 'none');
  let backgroundColor = extras.chatBackgroundColor || '';
  let isUserRole = Boolean(extras.isUserRole);

  const nameField = inputField({
    label: '角色名',
    value: current.name,
    placeholder: '角色名'
  });

  const promptField = textareaField({
    label: '人设与系统指令',
    value: current.systemPrompt || '',
    placeholder: '写下角色的性格、关系、说话方式和边界',
    rows: 7
  });

  const memoryCountField = inputField({
    label: '自动总结触发条数',
    value: String(current.memoryTriggerCount || 100),
    type: 'number',
    placeholder: '100'
  });

  const moodField = selectField({
    label: '心情状态',
    value: current.mood || 'neutral',
    options: [
      { value: 'neutral', label: '平静' },
      { value: 'happy', label: '开心' },
      { value: 'sad', label: '低落' },
      { value: 'angry', label: '不高兴' },
      { value: 'shy', label: '害羞' },
      { value: 'excited', label: '期待' }
    ]
  });

  const apiField = selectField({
    label: '默认API配置',
    value: current.apiConfig?.configId || '',
    options: [
      { value: '', label: '跟随全局默认' },
      ...apiConfigs.map((config) => ({ value: config.id, label: config.name }))
    ]
  });

  const modelField = inputField({
    label: '默认模型',
    value: current.apiConfig?.model || '',
    placeholder: '可留空，跟随API配置'
  });

  const ttsField = selectField({
    label: '默认TTS配置',
    value: current.ttsConfig?.configId || '',
    options: [
      { value: '', label: '不绑定' },
      ...ttsConfigs.map((config) => ({ value: config.id, label: config.name }))
    ]
  });

  let ttsEnabled = Boolean(current.ttsConfig?.enabled);

  const ttsSwitch = switchControl({
    label: '默认启用语音',
    description: '聊天里仍可单独开关',
    checked: ttsEnabled,
    onChange: (checked) => {
      ttsEnabled = checked;
    }
  });

  const backgroundModeField = selectField({
    label: '聊天背景模式',
    value: backgroundMode,
    options: [
      { value: 'none', label: '不设置，跟随主题' },
      { value: 'image', label: '本地图片' },
      { value: 'color', label: '纯色背景' }
    ],
    onChange: (value) => {
      backgroundMode = value;
    }
  });

  const backgroundColorField = inputField({
    label: '聊天背景纯色',
    value: backgroundColor,
    placeholder: '#FAFAFA'
  });

  const quickRepliesField = textareaField({
    label: '快捷回复',
    value: (extras.quickReplies || []).join('\n'),
    placeholder: '每行一句，最多8条',
    rows: 4
  });

  const worldbookSelects = worldbookItems.map((item) => {
    let checked = (current.worldbookIds || []).includes(item.id);

    return switchControl({
      label: item.title,
      description: item.type === 'thinking' ? '思维方式' : '人设背景',
      checked,
      onChange: (value) => {
        checked = value;
        item.__checked = value;
      }
    });
  });

  worldbookItems.forEach((item) => {
    item.__checked = (current.worldbookIds || []).includes(item.id);
  });

  const isUserSwitch = switchControl({
    label: '这是用户自己的角色',
    description: '可作为“我”的身份参与聊天',
    checked: isUserRole,
    onChange: (checked) => {
      isUserRole = checked;
    }
  });

  const form = h('div', { className: 'form' }, [
    h('div', { className: 'list-row' }, [
      avatar(avatarData, current.name, 'lg'),
      h('div', { className: 'list-row-main' }, [
        button({
          text: '上传头像',
          className: 'secondary-button',
          onClick: async () => {
            const image = await pickImage();

            if (image) {
              avatarData = image;
              toast('头像已选择，保存后生效');
            }
          }
        })
      ])
    ]),
    nameField.wrap,
    promptField.wrap,
    isUserSwitch,
    moodField.wrap,
    memoryCountField.wrap,
    createFoldPanel('默认API与模型', h('div', { className: 'form' }, [
      apiField.wrap,
      modelField.wrap
    ])),
    createFoldPanel('默认TTS', h('div', { className: 'form' }, [
      ttsField.wrap,
      ttsSwitch
    ])),
    createFoldPanel('聊天背景', h('div', { className: 'form' }, [
      backgroundModeField.wrap,
      button({
        text: '上传聊天背景图',
        iconName: 'image',
        className: 'secondary-button full-button',
        onClick: async () => {
          const image = await pickImage();

          if (image) {
            chatBackgroundData = image;
            backgroundMode = 'image';
            backgroundModeField.select.value = 'image';
            toast('背景图已选择，保存后生效');
          }
        }
      }),
      button({
        text: '清除背景图',
        className: 'secondary-button full-button',
        onClick: () => {
          chatBackgroundData = '';
          toast('已清除，保存后生效');
        }
      }),
      backgroundColorField.wrap
    ])),
    createFoldPanel('快捷回复', h('div', { className: 'form' }, [
      quickRepliesField.wrap,
      card({
        title: '说明',
        text: '聊天输入框上方可展开快捷回复栏，点击即可发送。',
        className: 'large'
      })
    ])),
    createFoldPanel('绑定世界书', h('div', { className: 'form' }, [
      worldbookSelects.length
        ? h('div', { className: 'form' }, worldbookSelects)
        : card({
          title: '没有世界书条目',
          text: '可以先到世界书应用里创建。',
          className: 'large'
        })
    ]))
  ]);

  const instance = sheet({
    title: character ? '编辑角色' : '新建角色',
    content: form,
    actions: [
      button({
        text: '保存',
        className: 'primary-button',
        onClick: () => {
          const selectedApi = getApiConfigs().find((config) => config.id === apiField.select.value);
          const selectedTTS = getTTSConfigs().find((config) => config.id === ttsField.select.value);
          const selectedWorldbooks = worldbookItems
            .filter((item) => item.__checked)
            .map((item) => item.id);

          const saved = saveCharacter({
            ...current,
            name: nameField.input.value.trim() || '未命名角色',
            avatar: avatarData,
            chatBackground: backgroundMode === 'image' ? chatBackgroundData : '',
            systemPrompt: promptField.textarea.value.trim(),
            memoryTriggerCount: Number(memoryCountField.input.value || 100),
            mood: moodField.select.value,
            worldbookIds: selectedWorldbooks,
            apiConfig: {
              endpoint: selectedApi?.endpoint || current.apiConfig?.endpoint || '',
              apiKey: selectedApi?.apiKey || current.apiConfig?.apiKey || '',
              model: modelField.input.value.trim() || selectedApi?.model || '',
              configId: selectedApi?.id || ''
            },
            ttsConfig: selectedTTS
              ? {
                ...ttsConfigToCharacterConfig(selectedTTS),
                configId: selectedTTS.id,
                enabled: ttsEnabled
              }
              : {
                ...current.ttsConfig,
                enabled: ttsEnabled
              }
          });

          saveCharacterExtras(saved.id, {
            ...extras,
            isUserRole,
            quickReplies: normalizeQuickReplies(quickRepliesField.textarea.value),
            chatBackgroundMode: backgroundMode,
            chatBackgroundColor: backgroundColorField.input.value.trim()
          });

          instance.close();
          toast('角色已保存');
          refresh();
        }
      })
    ]
  });
}

function createFoldPanel(title, content) {
  let open = false;
  const body = h('div', { className: 'accordion-body' });

  if (content instanceof Node) {
    body.appendChild(content);
  }

  const item = h('section', { className: 'accordion-item' });
  const header = h('button', {
    type: 'button',
    className: 'accordion-header',
    onClick: () => {
      open = !open;
      item.classList.toggle('open', open);
    }
  }, [
    h('div', { className: 'accordion-title', text: title }),
    h('div', { className: 'accordion-icon' }, iconButton('chevronDown', { className: 'icon-button' }))
  ]);

  item.append(header, body);
  return item;
}

function openMemorySheet(character) {
  const memories = character.memories || [];
  const body = h('div', { className: 'form' });

  if (!memories.length) {
    body.appendChild(card({
      title: '暂无记忆',
      text: '可以手动添加，也可以在聊天中自动生成。',
      className: 'large'
    }));
  }

  memories.forEach((memory) => {
    body.appendChild(card({
      title: sourceText(memory.source),
      text: memory.content,
      meta: new Date(memory.createdAt).toLocaleString('zh-CN'),
      actions: [
        button({
          text: '复制',
          className: 'secondary-button',
          onClick: () => copyText(memory.content)
        }),
        button({
          text: '删除',
          className: 'text-button danger',
          onClick: async () => {
            const ok = await confirmDialog({
              title: '删除记忆',
              message: '确认删除这条记忆吗？',
              danger: true
            });

            if (!ok) {
              return;
            }

            const next = getCharacter(character.id);
            next.memories = (next.memories || []).filter((item) => item.id !== memory.id);
            saveCharacter(next);
            instance.close();
            toast('已删除');
            refresh();
          }
        })
      ]
    }));
  });

  body.appendChild(button({
    text: '手动添加记忆',
    iconName: 'plus',
    className: 'primary-button full-button',
    onClick: () => openAddMemorySheet(character, instance)
  }));

  const instance = sheet({
    title: `${character.name}的记忆`,
    content: body
  });
}

function openAddMemorySheet(character, parentInstance = null) {
  const field = textareaField({
    label: '记忆内容',
    placeholder: '写下需要长期保存的信息',
    rows: 5
  });

  const instance = sheet({
    title: '添加记忆',
    content: field.wrap,
    actions: [
      button({
        text: '保存',
        className: 'primary-button',
        onClick: () => {
          const text = field.textarea.value.trim();

          if (!text) {
            toast('请填写记忆');
            return;
          }

          const next = getCharacter(character.id);
          next.memories = [
            {
              id: uuid(),
              content: text,
              source: 'manual',
              createdAt: nowISO()
            },
            ...(next.memories || [])
          ];

          saveCharacter(next);
          instance.close();

          if (parentInstance) {
            parentInstance.close();
          }

          toast('已保存记忆');
          refresh();
        }
      })
    ]
  });
}

function sourceText(source = '') {
  const map = {
    manual: '手动记忆',
    summary: '总结记忆',
    proactive: '主动记忆',
    import: '导入记忆'
  };

  return map[source] || '记忆';
}

function createUserProfileList() {
  const keyword = searchKeyword.trim().toLowerCase();
  const profiles = getUserProfiles()
    .filter((profile) => {
      if (!keyword) {
        return true;
      }

      return [profile.name, profile.description].join('\n').toLowerCase().includes(keyword);
    });

  if (!profiles.length) {
    return createEmptyState({
      iconName: 'characters',
      title: '还没有我的角色',
      description: '可以创建一个“我”的身份，绑定某个角色或对所有人设通用。',
      action: button({
        text: '新建我的角色',
        className: 'primary-button',
        onClick: () => openUserProfileEditor()
      })
    });
  }

  return h('div', { className: 'card-list' }, profiles.map((profile) => {
    const bindCharacter = profile.bindCharacterId ? getCharacter(profile.bindCharacterId) : null;

    return h('article', { className: 'card large' }, [
      h('div', { className: 'list-row' }, [
        avatar(profile.avatar, profile.name, 'lg'),
        h('div', { className: 'list-row-main' }, [
          h('div', { className: 'list-row-title', text: profile.name }),
          h('div', { className: 'list-row-desc', text: profile.scope === 'all' ? '所有人设通用' : `绑定：${bindCharacter?.name || '未绑定'}` })
        ])
      ]),
      profile.description
        ? h('div', { className: 'card-text clamp-3', text: profile.description })
        : h('div', { className: 'card-meta', text: '没有填写描述' }),
      h('div', { className: 'card-actions' }, [
        button({
          text: '编辑',
          className: 'secondary-button',
          onClick: () => openUserProfileEditor(profile)
        }),
        button({
          text: '删除',
          className: 'text-button danger',
          onClick: async () => {
            const ok = await confirmDialog({
              title: '删除我的角色',
              message: `确认删除「${profile.name}」吗？`,
              danger: true
            });

            if (ok) {
              deleteUserProfile(profile.id);
              toast('已删除');
              refresh();
            }
          }
        })
      ])
    ]);
  }));
}

function openUserProfileEditor(profile = null) {
  const current = profile || {
    id: uuid(),
    name: '我的角色',
    avatar: '',
    description: '',
    bindCharacterId: '',
    scope: 'all'
  };

  let avatarData = current.avatar || '';

  const nameField = inputField({
    label: '名称',
    value: current.name,
    placeholder: '我的角色'
  });

  const descriptionField = textareaField({
    label: '我的身份描述',
    value: current.description || '',
    placeholder: '例如：我希望以什么身份、语气、关系与AI互动',
    rows: 5
  });

  const scopeField = selectField({
    label: '使用范围',
    value: current.scope || 'all',
    options: [
      { value: 'all', label: '所有人设通用' },
      { value: 'single', label: '绑定某个人设' }
    ]
  });

  const characterField = selectField({
    label: '绑定人设',
    value: current.bindCharacterId || '',
    options: [
      { value: '', label: '不绑定' },
      ...getCharacters().map((character) => ({
        value: character.id,
        label: character.name
      }))
    ]
  });

  const form = h('div', { className: 'form' }, [
    h('div', { className: 'list-row' }, [
      avatar(avatarData, current.name, 'lg'),
      h('div', { className: 'list-row-main' }, [
        button({
          text: '上传头像',
          className: 'secondary-button',
          onClick: async () => {
            const image = await pickImage();

            if (image) {
              avatarData = image;
              toast('头像已选择，保存后生效');
            }
          }
        })
      ])
    ]),
    nameField.wrap,
    descriptionField.wrap,
    scopeField.wrap,
    characterField.wrap
  ]);

  const instance = sheet({
    title: profile ? '编辑我的角色' : '新建我的角色',
    content: form,
    actions: [
      button({
        text: '保存',
        className: 'primary-button',
        onClick: () => {
          saveUserProfile({
            ...current,
            name: nameField.input.value.trim() || '我的角色',
            avatar: avatarData,
            description: descriptionField.textarea.value.trim(),
            scope: scopeField.select.value,
            bindCharacterId: scopeField.select.value === 'single' ? characterField.select.value : ''
          });

          instance.close();
          toast('已保存');
          refresh();
        }
      })
    ]
  });
}

function exportCharacterCard(characterId) {
  const character = getCharacter(characterId);

  if (!character) {
    toast('找不到角色');
    return;
  }

  const extras = getCharacterExtras(characterId);

  const data = {
    version: '1.0',
    type: 'ai-phone-character',
    exportedAt: nowISO(),
    character,
    extras
  };

  downloadText(`${character.name || 'character'}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
}

async function importCharacterCard() {
  try {
    const text = await pickTextFile();

    if (!text) {
      return;
    }

    const parsed = JSON.parse(text);
    const imported = normalizeImportedCharacter(parsed);

    const saved = saveCharacter(imported.character);
    saveCharacterExtras(saved.id, imported.extras || {});

    toast('角色已导入');
    refresh();
  } catch (error) {
    toast(error.message || '导入失败');
  }
}

function normalizeImportedCharacter(data = {}) {
  if (data.type === 'ai-phone-character' && data.character) {
    return {
      character: createDefaultCharacter({
        ...data.character,
        id: uuid(),
        name: data.character.name ? `${data.character.name}` : '导入角色'
      }),
      extras: data.extras || {}
    };
  }

  if (data.spec === 'chara_card_v2' || data.data) {
    const cardData = data.data || {};
    const name = cardData.name || data.name || '导入角色';
    const description = cardData.description || '';
    const personality = cardData.personality || '';
    const scenario = cardData.scenario || '';
    const firstMessage = cardData.first_mes || cardData.first_message || '';

    return {
      character: createDefaultCharacter({
        name,
        avatar: data.avatar || '',
        systemPrompt: [
          description ? `角色描述：\n${description}` : '',
          personality ? `性格：\n${personality}` : '',
          scenario ? `场景：\n${scenario}` : '',
          firstMessage ? `开场白：\n${firstMessage}` : ''
        ].filter(Boolean).join('\n\n')
      }),
      extras: {
        quickReplies: []
      }
    };
  }

  if (data.name || data.description || data.personality || data.scenario || data.first_mes) {
    const name = data.name || '导入角色';
    const description = data.description || '';
    const personality = data.personality || '';
    const scenario = data.scenario || '';
    const firstMessage = data.first_mes || '';

    return {
      character: createDefaultCharacter({
        name,
        avatar: data.avatar || '',
        systemPrompt: [
          description ? `角色描述：\n${description}` : '',
          personality ? `性格：\n${personality}` : '',
          scenario ? `场景：\n${scenario}` : '',
          firstMessage ? `开场白：\n${firstMessage}` : ''
        ].filter(Boolean).join('\n\n')
      }),
      extras: {
        quickReplies: []
      }
    };
  }

  if (data.characterId && Array.isArray(data.memories)) {
    throw new Error('这是记忆导出文件，不是角色卡');
  }

  throw new Error('无法识别角色卡格式');
}

function openAppThemeSheet() {
  const current = getAppTheme();

  let backgroundImage = current.backgroundImage || '';

  const accentField = inputField({
    label: '主题色',
    value: current.accent || '',
    placeholder: '#D9A58F'
  });

  const radiusField = inputField({
    label: '圆角大小',
    value: current.radius || '',
    placeholder: '18px'
  });

  const fontSizeField = inputField({
    label: '字体大小',
    value: current.fontSize || '',
    placeholder: '15px'
  });

  const form = h('div', { className: 'form' }, [
    button({
      text: '上传应用背景图',
      iconName: 'image',
      className: 'secondary-button full-button',
      onClick: async () => {
        const image = await pickImage();

        if (image) {
          backgroundImage = image;
          toast('背景图已选择，保存后生效');
        }
      }
    }),
    button({
      text: '清除应用背景图',
      className: 'secondary-button full-button',
      onClick: () => {
        backgroundImage = '';
        toast('已清除，保存后生效');
      }
    }),
    accentField.wrap,
    radiusField.wrap,
    fontSizeField.wrap,
    h('div', { className: 'button-row wrap' }, [
      button({
        text: '导入应用主题',
        className: 'secondary-button',
        onClick: async () => {
          try {
            const text = await pickTextFile();

            if (!text) {
              return;
            }

            saveAppTheme(JSON.parse(text));
            instance.close();
            toast('应用主题已导入');
            refresh();
          } catch (error) {
            toast(error.message || '导入失败');
          }
        }
      }),
      button({
        text: '导出应用主题',
        className: 'secondary-button',
        onClick: () => {
          downloadText('characters-theme.json', JSON.stringify(getAppTheme(), null, 2), 'application/json;charset=utf-8');
        }
      })
    ])
  ]);

  const instance = sheet({
    title: '角色管理外观',
    content: form,
    actions: [
      button({
        text: '保存',
        className: 'primary-button',
        onClick: () => {
          saveAppTheme({
            ...current,
            backgroundImage,
            accent: accentField.input.value.trim(),
            radius: radiusField.input.value.trim(),
            fontSize: fontSizeField.input.value.trim()
          });

          instance.close();
          toast('已保存外观');
          refresh();
        }
      })
    ]
  });
}
