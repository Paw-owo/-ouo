import {
  getWorldbookItems,
  saveWorldbookItem,
  deleteWorldbookItem,
  createWorldbookItem,
  getCharacters,
  readLocal,
  writeLocal
} from '../core/storage.js';

import {
  h,
  icon,
  appHeader,
  createBackButton,
  iconButton,
  button,
  card,
  createTabs,
  createEmptyState,
  inputField,
  textareaField,
  selectField,
  switchControl,
  confirmDialog,
  sheet,
  toast,
  pickImage,
  pickTextFile,
  downloadText,
  copyText,
  formatDateTime
} from '../core/ui.js';

export const APP_THEME_KEY = 'ai_phone_app_theme_worldbook_v1';

let root = null;
let contextRef = null;
let activeTab = 'background';
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

export function getAppTheme() {
  return readLocal(APP_THEME_KEY, {
    name: '世界书主题',
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
    name: theme.name || '世界书主题',
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
      appId: 'worldbook',
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

  root.replaceChildren(
    appHeader({
      title: '世界书',
      subtitle: activeTab === 'background' ? '人设背景与世界观' : '全局思维方式',
      left: h('div', { className: 'app-header-left' }, createBackButton()),
      right: h('div', { className: 'app-header-right' }, [
        iconButton('config', {
          title: '应用设置',
          onClick: openAppThemeSheet
        }),
        iconButton('plus', {
          title: '新建条目',
          onClick: () => openWorldbookEditor()
        })
      ])
    }),
    h('main', { className: 'app-content' }, [
      createSearchBox(),
      createTabs([
        { id: 'background', name: '人设背景' },
        { id: 'thinking', name: '思维方式' }
      ], activeTab, (tabId) => {
        activeTab = tabId;
        render();
      }),
      h('div', { style: { height: 'var(--spacing-md)' } }),
      createWorldbookList()
    ])
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
  }

  if (theme.radius) {
    root.style.setProperty('--radius-md', theme.radius);
    root.style.setProperty('--radius-lg', theme.radius);
  }

  if (theme.fontSize) {
    root.style.setProperty('--font-size-base', theme.fontSize);
  }
}

function createSearchBox() {
  const wrap = h('div', {
    className: 'search-box',
    style: {
      marginBottom: 'var(--spacing-md)'
    }
  });

  const input = h('input', {
    className: 'input',
    value: searchKeyword,
    placeholder: '搜索标题或内容',
    onInput: (event) => {
      searchKeyword = event.target.value;
      renderListOnly();
    }
  });

  wrap.append(icon('config'), input);
  return wrap;
}

function renderListOnly() {
  const content = root?.querySelector('.worldbook-list-wrap');

  if (!content) {
    return;
  }

  content.replaceChildren(createWorldbookListInner());
}

function createWorldbookList() {
  return h('div', { className: 'worldbook-list-wrap' }, createWorldbookListInner());
}

function createWorldbookListInner() {
  const keyword = searchKeyword.trim().toLowerCase();
  const items = getWorldbookItems()
    .filter((item) => item.type === activeTab)
    .filter((item) => {
      if (!keyword) {
        return true;
      }

      return [item.title, item.content].join('\n').toLowerCase().includes(keyword);
    })
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));

  if (!items.length) {
    return createEmptyState({
      iconName: 'worldbook',
      title: activeTab === 'background' ? '还没有背景条目' : '还没有思维方式',
      description: activeTab === 'background'
        ? '背景条目会注入到指定角色或所有角色的人设里。'
        : '思维方式会作为全局准则注入到所有角色。',
      action: button({
        text: '新建条目',
        className: 'primary-button',
        onClick: () => openWorldbookEditor()
      })
    });
  }

  return h('div', { className: 'card-list' }, items.map(createWorldbookCard));
}

function createWorldbookCard(item) {
  const characters = getCharacters();
  const boundNames = getBoundNames(item, characters);

  return h('article', { className: 'card large' }, [
    h('div', { className: 'list-row' }, [
      h('div', { className: 'empty-icon', style: { margin: '0' } }, icon('worldbook')),
      h('div', { className: 'list-row-main' }, [
        h('div', { className: 'list-row-title', text: item.title }),
        h('div', { className: 'list-row-desc', text: item.type === 'thinking' ? '全局思维方式' : boundNames })
      ]),
      h('div', { className: 'switch ' + (item.enabled !== false ? 'active' : ''), onclick: () => toggleItemEnabled(item) })
    ]),
    item.content
      ? h('div', { className: 'card-text clamp-4', text: item.content })
      : h('div', { className: 'card-meta', text: '还没有内容' }),
    h('div', {
      className: 'card-meta',
      text: `更新于 ${formatDateTime(item.updatedAt || item.createdAt)}`
    }),
    h('div', { className: 'card-actions' }, [
      button({
        text: '复制',
        className: 'secondary-button',
        onClick: () => copyText(item.content || '')
      }),
      button({
        text: '编辑',
        className: 'secondary-button',
        onClick: () => openWorldbookEditor(item)
      }),
      button({
        text: '导出',
        className: 'secondary-button',
        onClick: () => exportWorldbookItem(item)
      }),
      button({
        text: '删除',
        className: 'text-button danger',
        onClick: async () => {
          const ok = await confirmDialog({
            title: '删除世界书条目',
            message: `确认删除「${item.title}」吗？`,
            danger: true
          });

          if (ok) {
            deleteWorldbookItem(item.id);
            toast('已删除');
            refresh();
          }
        }
      })
    ])
  ]);
}

function getBoundNames(item, characters = getCharacters()) {
  if (item.type === 'thinking') {
    return '所有角色通用';
  }

  if (!item.characterIds || !item.characterIds.length) {
    return '所有角色通用';
  }

  const names = item.characterIds
    .map((id) => characters.find((character) => character.id === id)?.name)
    .filter(Boolean);

  if (!names.length) {
    return '未绑定角色';
  }

  if (names.length <= 3) {
    return `绑定：${names.join('、')}`;
  }

  return `绑定：${names.slice(0, 3).join('、')} 等 ${names.length} 个角色`;
}

function toggleItemEnabled(item) {
  saveWorldbookItem({
    ...item,
    enabled: item.enabled === false
  });

  toast(item.enabled === false ? '已启用' : '已停用');
  refresh();
}

function openWorldbookEditor(item = null) {
  const current = item
    ? { ...item }
    : createWorldbookItem({
      type: activeTab,
      title: activeTab === 'background' ? '新的背景条目' : '新的思维方式'
    });

  const characters = getCharacters();
  const selectedCharacterIds = new Set(current.characterIds || []);
  let enabled = current.enabled !== false;

  const typeField = selectField({
    label: '条目类型',
    value: current.type || activeTab,
    options: [
      { value: 'background', label: '人设背景' },
      { value: 'thinking', label: '思维方式' }
    ]
  });

  const titleField = inputField({
    label: '标题',
    value: current.title || '',
    placeholder: '条目标题'
  });

  const contentField = textareaField({
    label: '内容',
    value: current.content || '',
    placeholder: current.type === 'thinking'
      ? '写下思维逻辑、行为准则、说话风格指导'
      : '写下世界观、背景设定、关系设定',
    rows: 9
  });

  const enabledSwitch = switchControl({
    label: '启用条目',
    description: '关闭后不会注入到对话',
    checked: enabled,
    onChange: (checked) => {
      enabled = checked;
    }
  });

  const characterBindPanel = createCharacterBindPanel(characters, selectedCharacterIds);

  const typeHint = card({
    title: '注入规则',
    text: '人设背景可以绑定指定角色，也可以不选角色作为通用背景。思维方式始终对所有角色生效。',
    className: 'large'
  });

  const form = h('div', { className: 'form' }, [
    typeField.wrap,
    titleField.wrap,
    contentField.wrap,
    enabledSwitch,
    typeHint,
    createFoldPanel('绑定角色', characterBindPanel)
  ]);

  const instance = sheet({
    title: item ? '编辑世界书' : '新建世界书',
    content: form,
    actions: [
      button({
        text: '保存',
        className: 'primary-button',
        onClick: () => {
          const type = typeField.select.value;

          saveWorldbookItem({
            ...current,
            type,
            title: titleField.input.value.trim() || '未命名条目',
            content: contentField.textarea.value.trim(),
            characterIds: type === 'thinking' ? [] : Array.from(selectedCharacterIds),
            enabled
          });

          activeTab = type;
          instance.close();
          toast('已保存');
          refresh();
        }
      })
    ]
  });
}

function createCharacterBindPanel(characters, selectedCharacterIds) {
  if (!characters.length) {
    return card({
      title: '还没有角色',
      text: '不选择角色时，这条背景会对所有角色通用。',
      className: 'large'
    });
  }

  const universalSwitch = switchControl({
    label: '所有角色通用',
    description: '开启后会清空指定绑定',
    checked: selectedCharacterIds.size === 0,
    onChange: (checked) => {
      if (checked) {
        selectedCharacterIds.clear();
        toast('已设为通用，保存后生效');
      }
    }
  });

  const list = characters.map((character) => {
    return switchControl({
      label: character.name,
      description: '绑定到此角色',
      checked: selectedCharacterIds.has(character.id),
      onChange: (checked) => {
        if (checked) {
          selectedCharacterIds.add(character.id);
        } else {
          selectedCharacterIds.delete(character.id);
        }
      }
    });
  });

  return h('div', { className: 'form' }, [
    universalSwitch,
    ...list
  ]);
}

function createFoldPanel(title, content) {
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

function exportWorldbookItem(item) {
  const data = {
    type: 'ai-phone-worldbook',
    version: '1.0',
    exportedAt: new Date().toISOString(),
    item
  };

  downloadText(`${item.title || 'worldbook'}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
}

async function importWorldbookItem() {
  try {
    const text = await pickTextFile();

    if (!text) {
      return;
    }

    const parsed = JSON.parse(text);
    const item = parsed.item || parsed;

    saveWorldbookItem(createWorldbookItem({
      ...item,
      id: undefined,
      title: item.title || '导入条目',
      type: item.type === 'thinking' ? 'thinking' : 'background'
    }));

    toast('已导入');
    refresh();
  } catch (error) {
    toast(error.message || '导入失败');
  }
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
          downloadText('worldbook-theme.json', JSON.stringify(getAppTheme(), null, 2), 'application/json;charset=utf-8');
        }
      }),
      button({
        text: '导入条目',
        className: 'secondary-button',
        onClick: importWorldbookItem
      })
    ])
  ]);

  const instance = sheet({
    title: '世界书外观',
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
