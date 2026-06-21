import {
  getMoments,
  saveMoment,
  deleteMoment,
  createMoment,
  getCharacters,
  getCharacter,
  getSettings,
  readLocal,
  writeLocal,
  uuid,
  nowISO
} from '../core/storage.js';

import {
  createChatCompletion
} from '../core/api.js';

import {
  h,
  icon,
  appHeader,
  createBackButton,
  iconButton,
  button,
  avatar,
  card,
  textareaField,
  inputField,
  selectField,
  createEmptyState,
  confirmDialog,
  sheet,
  toast,
  pickImage,
  pickTextFile,
  downloadText,
  copyText,
  formatDateTime
} from '../core/ui.js';

export const MOMENTS_BADGE_KEY = 'ai_phone_moments_badge_v1';
export const APP_THEME_KEY = 'ai_phone_app_theme_moments_v1';

let root = null;
let contextRef = null;
let filterCharacterId = '';

export function mount(container, context = {}) {
  root = container;
  contextRef = context;
  clearMomentsBadge();
  render();

  return () => {
    root = null;
    contextRef = null;
  };
}

export function getAppTheme() {
  return readLocal(APP_THEME_KEY, {
    name: '朋友圈主题',
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
    name: theme.name || '朋友圈主题',
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
      appId: 'moments',
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
      title: '朋友圈',
      subtitle: '生活片段与角色动态',
      left: h('div', { className: 'app-header-left' }, createBackButton()),
      right: h('div', { className: 'app-header-right' }, [
        iconButton('config', {
          title: '应用设置',
          onClick: openAppThemeSheet
        }),
        iconButton('plus', {
          title: '发布',
          onClick: openMomentEditor
        })
      ])
    }),
    h('main', { className: 'app-content' }, [
      createFilterBar(),
      h('div', { style: { height: 'var(--spacing-md)' } }),
      createMomentList()
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

function createFilterBar() {
  const characters = getCharacters();

  const field = selectField({
    label: '',
    value: filterCharacterId,
    options: [
      { value: '', label: '全部动态' },
      ...characters.map((character) => ({
        value: character.id,
        label: character.name
      }))
    ],
    onChange: (value) => {
      filterCharacterId = value;
      render();
    }
  });

  return field.wrap;
}

function createMomentList() {
  const moments = getMoments()
    .filter((moment) => {
      if (!filterCharacterId) {
        return true;
      }

      return moment.characterId === filterCharacterId;
    })
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!moments.length) {
    return createEmptyState({
      iconName: 'moments',
      title: '还没有动态',
      description: '可以手动发布，也可以让角色在聊天后自动发朋友圈。',
      action: button({
        text: '发布动态',
        className: 'primary-button',
        onClick: openMomentEditor
      })
    });
  }

  return h('div', { className: 'masonry' }, moments.map(createMomentCard));
}

function createMomentCard(moment) {
  const character = moment.characterId ? getCharacter(moment.characterId) : null;
  const name = moment.name || character?.name || '我';
  const avatarSrc = moment.avatar || character?.avatar || getSettings().personalization?.userAvatar || '';

  return h('article', { className: 'moment-card' }, [
    h('div', { className: 'moment-header' }, [
      avatar(avatarSrc, name, 'sm'),
      h('div', { className: 'list-row-main' }, [
        h('div', { className: 'list-row-title', text: name }),
        h('div', { className: 'list-row-desc', text: formatDateTime(moment.createdAt) })
      ])
    ]),
    moment.content ? h('div', { className: 'card-text', text: moment.content }) : null,
    moment.image ? h('img', { className: 'moment-image', src: moment.image, alt: '动态图片' }) : null,
    createMomentSocial(moment),
    h('div', { className: 'card-actions' }, [
      button({
        text: 'AI互动',
        className: 'secondary-button',
        onClick: () => aiInteractMoment(moment)
      }),
      button({
        text: '复制',
        className: 'secondary-button',
        onClick: () => copyText(moment.content || '')
      }),
      button({
        text: '编辑',
        className: 'secondary-button',
        onClick: () => openMomentEditor(moment)
      }),
      button({
        text: '删除',
        className: 'text-button danger',
        onClick: async () => {
          const ok = await confirmDialog({
            title: '删除动态',
            message: '确认删除这条朋友圈吗？',
            danger: true
          });

          if (ok) {
            deleteMoment(moment.id);
            toast('已删除');
            refresh();
          }
        }
      })
    ])
  ]);
}

function createMomentSocial(moment) {
  const likes = Array.isArray(moment.likes) ? moment.likes : [];
  const comments = Array.isArray(moment.comments) ? moment.comments : [];

  const children = [];

  if (likes.length) {
    children.push(
      h('div', { className: 'moment-comment', text: `${likes.join('、')} 觉得很喜欢` })
    );
  }

  if (comments.length) {
    children.push(...comments.map((comment) => {
      return h('div', { className: 'moment-comment' }, [
        h('span', { className: 'list-row-title', text: `${comment.name || 'AI'}：` }),
        h('span', { text: comment.content || '' })
      ]);
    }));
  }

  if (!children.length) {
    children.push(h('div', { className: 'card-meta', text: '还没有互动' }));
  }

  return h('div', { className: 'moment-comments' }, children);
}

function openMomentEditor(moment = null) {
  const current = moment || createMoment({
    name: '我',
    avatar: getSettings().personalization?.userAvatar || ''
  });

  let imageData = current.image || '';

  const characterField = selectField({
    label: '发布身份',
    value: current.characterId || '',
    options: [
      { value: '', label: '我' },
      ...getCharacters().map((character) => ({
        value: character.id,
        label: character.name
      }))
    ]
  });

  const contentField = textareaField({
    label: '内容',
    value: current.content || '',
    placeholder: '写点什么',
    rows: 6
  });

  const form = h('div', { className: 'form' }, [
    characterField.wrap,
    contentField.wrap,
    imageData ? h('img', { className: 'moment-image', src: imageData, alt: '已选图片' }) : null,
    button({
      text: '上传图片',
      iconName: 'image',
      className: 'secondary-button full-button',
      onClick: async () => {
        const image = await pickImage();

        if (image) {
          imageData = image;
          instance.close();
          openMomentEditor({
            ...current,
            characterId: characterField.select.value,
            content: contentField.textarea.value,
            image: imageData
          });
        }
      }
    }),
    button({
      text: '清除图片',
      className: 'secondary-button full-button',
      onClick: () => {
        imageData = '';
        toast('图片已清除，保存后生效');
      }
    })
  ]);

  const instance = sheet({
    title: moment ? '编辑动态' : '发布动态',
    content: form,
    actions: [
      button({
        text: '保存',
        className: 'primary-button',
        onClick: () => {
          const character = characterField.select.value ? getCharacter(characterField.select.value) : null;
          const settings = getSettings();

          saveMoment({
            ...current,
            characterId: character?.id || '',
            name: character?.name || '我',
            avatar: character?.avatar || settings.personalization?.userAvatar || '',
            content: contentField.textarea.value.trim(),
            image: imageData,
            createdAt: current.createdAt || nowISO()
          });

          instance.close();
          toast('已保存');
          refresh();
        }
      })
    ]
  });
}

async function aiInteractMoment(moment) {
  const characters = getCharacters();

  if (!characters.length) {
    toast('还没有角色');
    return;
  }

  const options = characters.map((character) => ({
    value: character.id,
    label: character.name
  }));

  const characterField = selectField({
    label: '选择互动角色',
    value: characters[0].id,
    options
  });

  const typeField = selectField({
    label: '互动方式',
    value: 'comment',
    options: [
      { value: 'like', label: '点赞' },
      { value: 'comment', label: '评论' }
    ]
  });

  const instance = sheet({
    title: 'AI互动',
    content: h('div', { className: 'form' }, [
      characterField.wrap,
      typeField.wrap
    ]),
    actions: [
      button({
        text: '生成互动',
        className: 'primary-button',
        onClick: async () => {
          const character = getCharacter(characterField.select.value);

          if (!character) {
            toast('找不到角色');
            return;
          }

          instance.close();

          if (typeField.select.value === 'like') {
            addLike(moment.id, character.name);
            setMomentsBadge();
            toast('已点赞');
            refresh();
            return;
          }

          try {
            toast('正在生成评论');
            const comment = await generateAIComment(moment, character);
            addComment(moment.id, {
              id: uuid(),
              characterId: character.id,
              name: character.name,
              avatar: character.avatar,
              content: comment,
              createdAt: nowISO()
            });
            setMomentsBadge();
            toast('已评论');
            refresh();
          } catch (error) {
            toast(error.message || '评论失败');
          }
        }
      })
    ]
  });
}

async function generateAIComment(moment, character) {
  const prompt = [
    `你是${character.name}。`,
    '请你给下面这条朋友圈写一句自然、亲密但不过度的评论。',
    '只输出评论内容，不要解释。',
    '',
    `朋友圈内容：${moment.content || '只有图片'}`
  ].join('\n');

  const result = await createChatCompletion({
    characterId: character.id,
    stream: false,
    messages: [
      {
        role: 'system',
        content: character.systemPrompt || `你是${character.name}。`
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  return String(result.content || '').trim() || '我看到了。';
}

function addLike(momentId, name) {
  const moment = getMoments().find((item) => item.id === momentId);

  if (!moment) {
    return;
  }

  const likes = Array.isArray(moment.likes) ? moment.likes : [];

  if (!likes.includes(name)) {
    likes.push(name);
  }

  saveMoment({
    ...moment,
    likes
  });
}

function addComment(momentId, comment) {
  const moment = getMoments().find((item) => item.id === momentId);

  if (!moment) {
    return;
  }

  saveMoment({
    ...moment,
    comments: [
      ...(Array.isArray(moment.comments) ? moment.comments : []),
      comment
    ]
  });
}

function setMomentsBadge() {
  try {
    localStorage.setItem(MOMENTS_BADGE_KEY, '1');
  } catch {}

  if (contextRef && typeof contextRef.refreshDesktop === 'function') {
    contextRef.refreshDesktop();
  }
}

function clearMomentsBadge() {
  try {
    localStorage.removeItem(MOMENTS_BADGE_KEY);
  } catch {}

  if (contextRef && typeof contextRef.refreshDesktop === 'function') {
    contextRef.refreshDesktop();
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
          downloadText('moments-theme.json', JSON.stringify(getAppTheme(), null, 2), 'application/json;charset=utf-8');
        }
      })
    ])
  ]);

  const instance = sheet({
    title: '朋友圈外观',
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
