import {
  getData,
  getSettings,
  getCharacters,
  getCharacter,
  saveCharacter,
  getGroups,
  saveGroup,
  deleteGroup,
  createGroup,
  createMessage,
  getWallet,
  setWallet,
  addWalletRecord,
  nowISO,
  uuid,
  readLocal,
  writeLocal
} from '../core/storage.js';

import {
  createChatCompletion,
  getApiConfigs,
  resolveApiConfig,
  setRuntimeApi
} from '../core/api.js';

import {
  buildMessagesWithMemory,
  buildSystemPrompt,
  runMemoryCycle
} from '../core/memory.js';

import {
  getTTSConfigs,
  speakText,
  stopSpeech,
  setRuntimeTTS,
  getRuntimeTTS,
  createHoldToRecordHandlers,
  createWaveformElement,
  isSpeechRecognitionSupported
} from '../core/tts.js';

import {
  getMCPServers,
  groupMCPServers,
  getOpenAIToolsForConversation,
  buildMCPToolPrompt,
  setRuntimeMCP,
  getRuntimeMCP
} from '../core/mcp.js';

import {
  h,
  icon,
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
  createMessageBubble,
  createTransferCard,
  createToolItem,
  actionSheet,
  sheet,
  confirmDialog,
  toast,
  pickImage,
  pickTextFile,
  downloadText,
  copyText,
  autoGrowTextarea,
  formatTime,
  formatDateTime,
  renderMessageContent,
  longPress
} from '../core/ui.js';

const CHAT_CONFIG_KEY = 'ai_phone_chat_conversation_configs_v1';
const CHARACTER_EXTRAS_KEY = 'ai_phone_character_extras_v1';
const STICKER_LIBRARY_KEY = 'ai_phone_sticker_library_v1';
const CHAT_UNREAD_KEY = 'ai_phone_chat_unread_v1';
const MOMENTS_BADGE_KEY = 'ai_phone_moments_badge_v1';

let root = null;
let contextRef = null;
let screen = 'list';
let activeTab = 'private';
let activeConversation = null;
let activeGroup = null;
let searchKeyword = '';
let toolDrawerOpen = false;
let quickReplyOpen = false;
let abortController = null;
let recordingCleanup = null;

export function mount(container, context = {}) {
  root = container;
  contextRef = context;
  clearChatUnread();
  renderList();

  return () => {
    stopSpeech();
    if (abortController) {
      abortController.abort();
    }
    if (recordingCleanup) {
      recordingCleanup();
    }
    root = null;
    contextRef = null;
  };
}

function refreshDesktop() {
  if (contextRef && typeof contextRef.refreshDesktop === 'function') {
    contextRef.refreshDesktop();
  }
}

function renderList() {
  screen = 'list';
  activeConversation = null;
  activeGroup = null;
  toolDrawerOpen = false;
  quickReplyOpen = false;

  if (!root) {
    return;
  }

  root.className = 'app-view active';
  root.style.backgroundImage = '';
  root.style.removeProperty('--accent');
  root.replaceChildren(
    appHeader({
      title: '消息',
      subtitle: activeTab === 'private' ? '私聊' : '群聊',
      left: h('div', { className: 'app-header-left' }, createBackButton()),
      right: h('div', { className: 'app-header-right' }, [
        activeTab === 'group'
          ? iconButton('plus', {
            title: '新建群聊',
            onClick: openGroupEditor
          })
          : null
      ])
    }),
    h('main', { className: 'app-content' }, [
      createSearchArea(),
      createTabs([
        { id: 'private', name: '私聊' },
        { id: 'group', name: '群聊' }
      ], activeTab, (tabId) => {
        activeTab = tabId;
        searchKeyword = '';
        renderList();
      }),
      h('div', { style: { height: 'var(--spacing-md)' } }),
      searchKeyword.trim() ? createSearchResults() : activeTab === 'private' ? createPrivateList() : createGroupList()
    ])
  );
}

function createSearchArea() {
  const wrap = h('div', { className: 'search-box', style: { marginBottom: 'var(--spacing-md)' } });
  const input = h('input', {
    className: 'input',
    value: searchKeyword,
    placeholder: '搜索所有聊天记录',
    onInput: (event) => {
      searchKeyword = event.target.value;
      renderList();
    }
  });

  wrap.append(icon('config'), input);
  return wrap;
}

function createSearchResults() {
  const keyword = searchKeyword.trim().toLowerCase();
  const results = [];

  getCharacters().forEach((character) => {
    (character.chatHistory || []).forEach((message) => {
      const content = getMessagePlainText(message);

      if (content.toLowerCase().includes(keyword)) {
        results.push({
          type: 'private',
          id: character.id,
          name: character.name,
          avatar: character.avatar,
          message,
          snippet: createSnippet(content, keyword)
        });
      }
    });
  });

  getGroups().forEach((group) => {
    (group.chatHistory || []).forEach((message) => {
      const content = getMessagePlainText(message);

      if (content.toLowerCase().includes(keyword)) {
        results.push({
          type: 'group',
          id: group.id,
          name: group.name,
          avatar: group.avatar,
          message,
          snippet: createSnippet(content, keyword)
        });
      }
    });
  });

  if (!results.length) {
    return createEmptyState({
      iconName: 'chat',
      title: '没有找到匹配消息',
      description: '换个关键词试试'
    });
  }

  return h('div', { className: 'chat-search-results' }, results.slice(0, 80).map((result) => {
    return h('button', {
      type: 'button',
      className: 'search-result-card',
      onClick: () => {
        if (result.type === 'private') {
          openPrivateChat(result.id);
        } else {
          openGroupChat(result.id);
        }
      }
    }, [
      h('div', { className: 'search-result-source', text: `${result.name} · ${formatDateTime(result.message.createdAt)}` }),
      h('div', { className: 'search-result-snippet', text: result.snippet })
    ]);
  }));
}

function createSnippet(text, keyword) {
  const source = String(text || '');
  const lower = source.toLowerCase();
  const index = lower.indexOf(keyword);

  if (index < 0) {
    return source.slice(0, 80);
  }

  const start = Math.max(0, index - 24);
  const end = Math.min(source.length, index + keyword.length + 42);

  return `${start > 0 ? '...' : ''}${source.slice(start, end)}${end < source.length ? '...' : ''}`;
}

function createPrivateList() {
  const characters = getCharacters();

  if (!characters.length) {
    return createEmptyState({
      iconName: 'characters',
      title: '还没有角色',
      description: '先去角色管理创建一个角色'
    });
  }

  return h('div', { className: 'chat-list' }, characters.map((character) => {
    const last = getLastMessage(character.chatHistory || []);
    const preview = last ? getMessagePlainText(last) : '还没有聊天记录';
    const unread = getUnreadCount(`private:${character.id}`);

    return h('button', {
      type: 'button',
      className: 'chat-row',
      onClick: () => openPrivateChat(character.id)
    }, [
      h('div', { style: { position: 'relative' } }, [
        avatar(character.avatar, character.name),
        unread ? h('span', { className: 'unread-badge', text: unread > 99 ? '99+' : String(unread) }) : null
      ]),
      h('div', { className: 'chat-row-main' }, [
        h('div', { className: 'chat-row-top' }, [
          h('div', { className: 'chat-row-name truncate', text: character.name }),
          h('div', { className: 'chat-row-time', text: last ? formatTime(last.createdAt) : '' })
        ]),
        h('div', { className: 'chat-row-preview truncate', text: preview }),
        h('div', { className: 'online-status', text: getOnlineStatus(last?.createdAt) })
      ])
    ]);
  }));
}

function createGroupList() {
  const groups = getGroups();

  if (!groups.length) {
    return createEmptyState({
      iconName: 'chat',
      title: '还没有群聊',
      description: '创建群聊后，多个AI角色可以一起回复',
      action: button({
        text: '新建群聊',
        className: 'primary-button',
        onClick: openGroupEditor
      })
    });
  }

  return h('div', { className: 'chat-list' }, groups.map((group) => {
    const last = getLastMessage(group.chatHistory || []);
    const preview = last ? getMessagePlainText(last) : '还没有聊天记录';
    const unread = getUnreadCount(`group:${group.id}`);

    return h('button', {
      type: 'button',
      className: 'chat-row',
      onClick: () => openGroupChat(group.id)
    }, [
      h('div', { style: { position: 'relative' } }, [
        avatar(group.avatar, group.name),
        unread ? h('span', { className: 'unread-badge', text: unread > 99 ? '99+' : String(unread) }) : null
      ]),
      h('div', { className: 'chat-row-main' }, [
        h('div', { className: 'chat-row-top' }, [
          h('div', { className: 'chat-row-name truncate', text: group.name }),
          h('div', { className: 'chat-row-time', text: last ? formatTime(last.createdAt) : '' })
        ]),
        h('div', { className: 'chat-row-preview truncate', text: preview }),
        h('div', { className: 'online-status', text: getOnlineStatus(last?.createdAt) })
      ])
    ]);
  }));
}

function openPrivateChat(characterId) {
  const character = getCharacter(characterId);

  if (!character) {
    toast('找不到角色');
    return;
  }

  activeConversation = character;
  activeGroup = null;
  screen = 'private';
  clearUnread(`private:${characterId}`);
  applyConversationRuntime();
  renderChat();
}

function openGroupChat(groupId) {
  const group = getGroups().find((item) => item.id === groupId);

  if (!group) {
    toast('找不到群聊');
    return;
  }

  activeGroup = group;
  activeConversation = null;
  screen = 'group';
  clearUnread(`group:${groupId}`);
  applyConversationRuntime();
  renderChat();
}

function renderChat() {
  if (!root) {
    return;
  }

  const title = screen === 'group' ? activeGroup.name : activeConversation.name;
  const avatarSrc = screen === 'group' ? activeGroup.avatar : activeConversation.avatar;
  const messages = getCurrentMessages();
  const config = getConversationConfig(getConversationKey());
  const background = getChatBackground();

  root.className = 'app-view active chat-view';
  root.replaceChildren(
    h('div', {
      className: 'chat-background-layer',
      style: background
    }),
    appHeader({
      title,
      subtitle: screen === 'group' ? '群聊配置' : getOnlineStatus(getLastMessage(messages)?.createdAt),
      left: h('div', { className: 'app-header-left' }, createBackButton(renderList)),
      right: h('div', { className: 'app-header-right' }, [
        iconButton('phone', {
          title: '打电话',
          onClick: openCallScreen
        }),
        iconButton('more', {
          title: '更多',
          onClick: openMoreMenu
        })
      ])
    }),
    createClickableTitleLayer(title, avatarSrc),
    createMessagesArea(messages),
    createQuickReplyBar(),
    createToolDrawer(),
    createInputBar()
  );

  scrollToBottom();
  bindMessageLongPress();
}

function createClickableTitleLayer(title, avatarSrc) {
  const layer = h('button', {
    type: 'button',
    title: '对话配置',
    style: {
      position: 'fixed',
      top: '0',
      left: '64px',
      right: '112px',
      height: 'var(--nav-height)',
      zIndex: 'calc(var(--z-floating) + 1)'
    },
    onClick: openConversationConfig
  });

  return layer;
}

function createMessagesArea(messages) {
  const settings = getSettings();
  const mode = settings.personalization?.bubbleMode || 'bubble';
  const area = h('main', {
    className: ['chat-messages', mode === 'dialog' ? 'dialog-mode' : ''].join(' ')
  });

  if (!messages.length) {
    area.appendChild(createEmptyState({
      iconName: 'chat',
      title: '开始聊天',
      description: '默认界面只保留消息区和输入框，点加号展开工具'
    }));
    return area;
  }

  messages.forEach((message) => {
    area.appendChild(renderMessage(message, mode));
  });

  return area;
}

function renderMessage(message, mode = 'bubble') {
  const role = message.role === 'user' ? 'user' : 'assistant';
  const speaker = getMessageSpeaker(message);
  const actions = [];

  if (role === 'assistant') {
    actions.push(
      button({
        text: '播放',
        className: 'text-button',
        onClick: () => speakMessage(message)
      })
    );
  }

  const bubble = createMessageBubble({
    role,
    name: speaker.name,
    avatarSrc: speaker.avatar,
    content: message.type === 'transfer' ? '' : message.type === 'voice' ? '语音消息' : message.content || '',
    thinking: message.thinking || '',
    mode,
    actions
  });

  bubble.message.dataset.messageId = message.id;

  if (message.type === 'transfer') {
    bubble.bubble.replaceChildren(createTransferCard(message.amount, message.content || '转账'));
  }

  if (message.type === 'image' && message.image) {
    bubble.bubble.replaceChildren(
      message.content ? h('div', { text: message.content }) : null,
      h('img', { className: 'message-image', src: message.image, alt: '图片' })
    );
  }

  if (message.type === 'sticker' && message.image) {
    bubble.bubble.replaceChildren(
      h('img', { className: 'message-sticker', src: message.image, alt: message.content || '表情包' }),
      message.content ? h('div', { className: 'card-meta', text: message.content }) : null
    );
  }

  if (message.type === 'voice') {
    bubble.bubble.replaceChildren(
      h('div', { className: 'message-voice' }, [
        createWaveformElement(12),
        h('span', { text: message.content || '语音已转文字' })
      ])
    );
  }

  return bubble.message;
}

function createQuickReplyBar() {
  const replies = screen === 'private'
    ? getCharacterExtras(activeConversation.id).quickReplies || []
    : [];

  const bar = h('div', { className: ['quick-reply-bar', quickReplyOpen ? 'active' : ''].join(' ') });

  replies.slice(0, 8).forEach((text) => {
    bar.appendChild(h('button', {
      type: 'button',
      className: 'quick-reply-chip truncate',
      text,
      onClick: () => sendUserText(text)
    }));
  });

  if (!replies.length) {
    bar.appendChild(h('button', {
      type: 'button',
      className: 'quick-reply-chip',
      text: '角色管理里可设置快捷回复',
      onClick: () => {}
    }));
  }

  return bar;
}

function createToolDrawer() {
  const drawer = h('div', { className: ['chat-tool-drawer', toolDrawerOpen ? 'active' : ''].join(' ') });

  drawer.appendChild(h('div', { className: 'tool-grid' }, [
    createToolItem({
      iconName: 'mic',
      text: '语音消息',
      onClick: () => toast('请长按输入栏旁的录音按钮')
    }),
    createToolItem({
      iconName: 'phone',
      text: '打电话',
      onClick: openCallScreen
    }),
    createToolItem({
      iconName: 'image',
      text: '发图片',
      onClick: sendImageMessage
    }),
    createToolItem({
      iconName: 'moments',
      text: '表情包',
      onClick: openStickerPanel
    }),
    createToolItem({
      iconName: 'tool',
      text: 'MCP工具',
      onClick: openConversationConfig
    }),
    createToolItem({
      iconName: 'memory',
      text: '记忆管理',
      onClick: openMemoryPanel
    }),
    createToolItem({
      iconName: 'config',
      text: '配置切换',
      onClick: openConversationConfig
    }),
    createToolItem({
      iconName: 'trash',
      text: '清空上下文',
      onClick: clearCurrentHistory
    }),
    createToolItem({
      iconName: 'transfer',
      text: '转账',
      onClick: openTransferPanel
    })
  ]));

  return drawer;
}

function createInputBar() {
  const textarea = h('textarea', {
    className: 'chat-textarea',
    rows: 1,
    placeholder: '输入消息',
    onInput: (event) => autoGrowTextarea(event.target, 6),
    onKeydown: (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        const value = textarea.value.trim();

        if (value) {
          textarea.value = '';
          autoGrowTextarea(textarea, 6);
          sendUserText(value);
        }
      }
    }
  });

  const recordButton = iconButton('mic', {
    className: 'icon-button soft',
    title: '按住录音'
  });

  if (isSpeechRecognitionSupported()) {
    const handlers = createHoldToRecordHandlers({
      onStart: () => {
        stopSpeech();
        showRecordingPanel();
      },
      onResult: (text) => {
        updateRecordingText(text);
      },
      onEnd: (text) => {
        hideRecordingPanel();

        if (text.trim()) {
          sendVoiceMessage(text.trim());
        } else {
          toast('没有识别到文字');
        }
      },
      onError: () => {
        hideRecordingPanel();
        toast('语音识别失败');
      }
    });

    recordingCleanup = handlers.bind(recordButton);
  } else {
    recordButton.addEventListener('click', () => toast('当前浏览器不支持语音识别'));
  }

  return h('footer', { className: 'chat-input-bar' }, [
    iconButton('plus', {
      className: ['icon-button', toolDrawerOpen ? 'accent' : 'soft'].join(' '),
      title: '工具',
      onClick: () => {
        toolDrawerOpen = !toolDrawerOpen;
        renderChat();
      }
    }),
    iconButton('config', {
      className: ['icon-button', quickReplyOpen ? 'accent' : 'soft'].join(' '),
      title: '快捷回复',
      onClick: () => {
        quickReplyOpen = !quickReplyOpen;
        renderChat();
      }
    }),
    recordButton,
    textarea,
    iconButton('send', {
      className: 'icon-button accent',
      title: '发送',
      onClick: () => {
        const value = textarea.value.trim();

        if (!value) {
          return;
        }

        textarea.value = '';
        autoGrowTextarea(textarea, 6);
        sendUserText(value);
      }
    })
  ]);
}

function showRecordingPanel() {
  const old = document.querySelector('.recording-panel');

  if (old) {
    old.remove();
  }

  const panel = h('div', {
    className: 'recording-panel',
    style: {
      position: 'fixed',
      left: 'var(--spacing-md)',
      right: 'var(--spacing-md)',
      bottom: 'calc(var(--input-height) + var(--spacing-md))',
      zIndex: 'var(--z-toast)'
    }
  }, [
    h('div', { className: 'recording-dot' }),
    createWaveformElement(18),
    h('div', { className: 'recording-text truncate', text: '正在聆听，松开发送' })
  ]);

  document.body.appendChild(panel);
}

function updateRecordingText(text = '') {
  const node = document.querySelector('.recording-text');

  if (node) {
    node.textContent = text || '正在聆听，松开发送';
  }
}

function hideRecordingPanel() {
  document.querySelector('.recording-panel')?.remove();
}

function bindMessageLongPress() {
  document.querySelectorAll('.message').forEach((messageEl) => {
    longPress(messageEl, () => {
      const messageId = messageEl.dataset.messageId;
      const message = getCurrentMessages().find((item) => item.id === messageId);

      if (message) {
        openMessageActions(message);
      }
    });
  });
}

function openMessageActions(message) {
  const isUser = message.role === 'user';

  actionSheet({
    title: '消息操作',
    actions: [
      !isUser ? {
        text: '重新生成',
        iconName: 'refresh',
        onClick: () => regenerateFromMessage(message)
      } : null,
      !isUser ? {
        text: '续写',
        iconName: 'edit',
        onClick: () => continueAssistantMessage()
      } : null,
      isUser ? {
        text: '编辑后重发',
        iconName: 'edit',
        onClick: () => editUserMessage(message)
      } : null,
      {
        text: '复制',
        iconName: 'copy',
        onClick: () => copyText(getMessagePlainText(message))
      },
      {
        text: '查看原始内容',
        iconName: 'memo',
        onClick: () => showRawMessage(message)
      },
      {
        text: '删除',
        iconName: 'trash',
        danger: true,
        onClick: () => deleteMessage(message.id)
      }
    ].filter(Boolean)
  });
}

function openMoreMenu() {
  actionSheet({
    title: '更多',
    actions: [
      {
        text: '导出聊天记录 TXT',
        iconName: 'download',
        onClick: () => exportCurrentChat('txt')
      },
      {
        text: '导出聊天记录 JSON',
        iconName: 'download',
        onClick: () => exportCurrentChat('json')
      },
      {
        text: '对话配置',
        iconName: 'config',
        onClick: openConversationConfig
      },
      {
        text: '清空上下文',
        iconName: 'trash',
        danger: true,
        onClick: clearCurrentHistory
      }
    ]
  });
}

function openConversationConfig() {
  const conversationKey = getConversationKey();
  const config = getConversationConfig(conversationKey);
  const apiConfigs = getApiConfigs();
  const ttsConfigs = getTTSConfigs();
  const mcpServers = getMCPServers();
  const groupedServers = groupMCPServers(mcpServers);

  let stream = config.stream !== false;
  let memoryInjection = config.memoryInjection !== false;
  let autoMoments = Boolean(config.autoMoments);
  let ttsEnabled = Boolean(config.tts?.enabled);
  let mcpEnabled = Boolean(config.mcp?.enabled);
  let selectedMCPServers = new Set(config.mcp?.serverIds || []);

  const apiField = selectField({
    label: 'API端点',
    value: config.api?.configId || '',
    options: [
      { value: '', label: '自动选择' },
      ...apiConfigs.map((item) => ({ value: item.id, label: item.name }))
    ]
  });

  const modelField = inputField({
    label: '模型',
    value: config.api?.model || '',
    placeholder: '可手动输入模型名'
  });

  const streamSwitch = switchControl({
    label: '流式输出',
    checked: stream,
    onChange: (checked) => {
      stream = checked;
    }
  });

  const memorySwitch = switchControl({
    label: '记忆注入',
    checked: memoryInjection,
    onChange: (checked) => {
      memoryInjection = checked;
    }
  });

  const momentsSwitch = switchControl({
    label: '自动发朋友圈',
    checked: autoMoments,
    onChange: (checked) => {
      autoMoments = checked;
    }
  });

  const ttsSwitch = switchControl({
    label: '启用语音',
    checked: ttsEnabled,
    onChange: (checked) => {
      ttsEnabled = checked;
    }
  });

  const ttsField = selectField({
    label: 'TTS配置',
    value: config.tts?.configId || '',
    options: [
      { value: '', label: '自动选择' },
      ...ttsConfigs.map((item) => ({ value: item.id, label: item.name }))
    ]
  });

  const mcpSwitch = switchControl({
    label: '启用MCP',
    description: '只注入当前对话选中的服务器工具',
    checked: mcpEnabled,
    onChange: (checked) => {
      mcpEnabled = checked;
    }
  });

  const mcpBlocks = Object.entries(groupedServers).map(([groupName, servers]) => {
    return h('div', { className: 'form' }, [
      h('div', { className: 'form-label', text: groupName }),
      ...servers.map((server) => {
        return switchControl({
          label: server.name,
          description: `${server.tools?.length || 0} 个工具`,
          checked: selectedMCPServers.has(server.id),
          onChange: (checked) => {
            if (checked) {
              selectedMCPServers.add(server.id);
            } else {
              selectedMCPServers.delete(server.id);
            }
          }
        });
      })
    ]);
  });

  const form = h('div', { className: 'form' }, [
    card({
      title: '对话配置',
      text: '这些配置只保存到当前对话或当前群聊，切换后立即生效。',
      className: 'large'
    }),
    createFold('API与模型', h('div', { className: 'form' }, [
      apiField.wrap,
      modelField.wrap,
      streamSwitch,
      memorySwitch,
      momentsSwitch
    ]), true),
    createFold('TTS语音', h('div', { className: 'form' }, [
      ttsSwitch,
      ttsField.wrap
    ])),
    createFold('MCP工具', h('div', { className: 'form' }, [
      mcpSwitch,
      mcpBlocks.length ? h('div', { className: 'form' }, mcpBlocks) : card({
        title: '没有MCP服务器',
        text: '可在设置里添加MCP服务器。',
        className: 'large'
      })
    ]))
  ]);

  const instance = sheet({
    title: '当前对话配置',
    content: form,
    actions: [
      button({
        text: '保存',
        className: 'primary-button',
        onClick: () => {
          const apiBase = apiConfigs.find((item) => item.id === apiField.select.value);
          const nextConfig = {
            ...config,
            stream,
            memoryInjection,
            autoMoments,
            api: {
              configId: apiField.select.value,
              endpoint: apiBase?.endpoint || '',
              apiKey: apiBase?.apiKey || '',
              model: modelField.input.value.trim() || apiBase?.model || ''
            },
            tts: {
              enabled: ttsEnabled,
              configId: ttsField.select.value
            },
            mcp: {
              enabled: mcpEnabled,
              serverIds: Array.from(selectedMCPServers),
              toolNames: []
            }
          };

          saveConversationConfig(conversationKey, nextConfig);
          setRuntimeApi(conversationKey, nextConfig.api);
          setRuntimeTTS(conversationKey, nextConfig.tts);
          setRuntimeMCP(conversationKey, nextConfig.mcp);
          instance.close();
          toast('配置已生效');
        }
      })
    ]
  });
}

function createFold(title, content, open = false) {
  const item = h('section', { className: ['accordion-item', open ? 'open' : ''].join(' ') });
  const body = h('div', { className: 'accordion-body' }, content);
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

function openMemoryPanel() {
  if (screen !== 'private') {
    toast('群聊暂不支持单独记忆管理');
    return;
  }

  const character = getCharacter(activeConversation.id);

  if (!character) {
    return;
  }

  const body = h('div', { className: 'form' });

  if (!(character.memories || []).length) {
    body.appendChild(card({
      title: '暂无记忆',
      text: '聊天后可自动生成，也可以在角色管理里手动添加。',
      className: 'large'
    }));
  }

  (character.memories || []).forEach((memory) => {
    body.appendChild(card({
      title: memory.source || 'memory',
      text: memory.content,
      meta: formatDateTime(memory.createdAt),
      actions: [
        button({
          text: '复制',
          className: 'secondary-button',
          onClick: () => copyText(memory.content)
        })
      ]
    }));
  });

  sheet({
    title: '记忆管理',
    content: body
  });
}

async function openTransferPanel() {
  if (screen !== 'private') {
    toast('群聊暂不支持转账');
    return;
  }

  const amountField = inputField({
    label: '金额',
    type: 'number',
    placeholder: '0.00'
  });

  const instance = sheet({
    title: '转账',
    content: h('div', { className: 'form' }, [
      amountField.wrap,
      card({
        title: '说明',
        text: '转账会从钱包余额扣除，并作为上下文发送给AI。',
        className: 'large'
      })
    ]),
    actions: [
      button({
        text: '确认转账',
        className: 'primary-button',
        onClick: () => {
          const amount = Number(amountField.input.value || 0);
          const wallet = getWallet();

          if (amount <= 0) {
            toast('请输入有效金额');
            return;
          }

          if (wallet.balance < amount) {
            toast('余额不足');
            return;
          }

          wallet.balance -= amount;
          setWallet(wallet);
          addWalletRecord({
            type: 'transfer',
            title: `转账给${activeConversation.name}`,
            amount: -amount,
            targetCharacterId: activeConversation.id
          });

          instance.close();
          appendCurrentMessage({
            role: 'user',
            type: 'transfer',
            content: `我给你转账 ${amount.toFixed(2)}`,
            amount
          });

          renderChat();
          requestAIReply(`用户刚刚给你转账 ${amount.toFixed(2)}，请自然回应。`);
        }
      })
    ]
  });
}

async function sendImageMessage() {
  const image = await pickImage();

  if (!image) {
    return;
  }

  appendCurrentMessage({
    role: 'user',
    type: 'image',
    content: '发送了一张图片',
    image
  });

  renderChat();
  requestAIReply('用户发送了一张图片，请自然回应。');
}

function openStickerPanel() {
  const stickers = getStickerLibrary();
  const body = h('div', { className: 'form' });

  if (!stickers.length) {
    body.appendChild(card({
      title: '还没有表情包',
      text: '可在设置里上传表情包并填写描述。',
      className: 'large'
    }));
  } else {
    body.appendChild(h('div', { className: 'sticker-grid' }, stickers.map((sticker) => {
      return h('button', {
        type: 'button',
        className: 'sticker-item',
        onClick: () => {
          instance.close();
          sendStickerMessage(sticker);
        }
      }, [
        h('img', { src: sticker.image, alt: sticker.description || '表情包' })
      ]);
    })));
  }

  const instance = sheet({
    title: '表情包',
    content: body
  });
}

function sendStickerMessage(sticker) {
  appendCurrentMessage({
    role: 'user',
    type: 'sticker',
    content: sticker.description || '表情包',
    image: sticker.image
  });

  renderChat();
  requestAIReply(`用户发送了一个表情包，描述：${sticker.description || '未描述'}。请自然回应。`);
}

async function sendUserText(text) {
  appendCurrentMessage({
    role: 'user',
    type: 'text',
    content: text
  });

  renderChat();
  await requestAIReply();
}

async function sendVoiceMessage(text) {
  appendCurrentMessage({
    role: 'user',
    type: 'voice',
    content: text
  });

  renderChat();
  await requestAIReply(`用户刚才用语音说：${text}`);
}

async function requestAIReply(extraPrompt = '') {
  if (abortController) {
    abortController.abort();
  }

  abortController = new AbortController();

  if (screen === 'group') {
    await requestGroupReplies(extraPrompt);
    return;
  }

  await requestPrivateReply(extraPrompt);
}

async function requestPrivateReply(extraPrompt = '') {
  const character = getCharacter(activeConversation.id);

  if (!character) {
    return;
  }

  const conversationKey = getConversationKey();
  const config = getConversationConfig(conversationKey);
  const history = character.chatHistory || [];
  const aiMessage = createLocalMessage({
    role: 'assistant',
    name: character.name,
    avatar: character.avatar,
    characterId: character.id,
    content: '',
    thinking: ''
  });

  appendCurrentMessage(aiMessage, false);
  renderChat();

  try {
    const mcpPrompt = config.mcp?.enabled ? buildMCPToolPrompt(conversationKey, config.mcp) : '';
    const messages = buildMessagesWithMemory(character.id, history.slice(-30), {
      includeMemory: config.memoryInjection !== false,
      extraPrompt: [extraPrompt, mcpPrompt].filter(Boolean).join('\n\n')
    });

    const result = await createChatCompletion({
      conversationId: conversationKey,
      characterId: character.id,
      configId: config.api?.configId || character.apiConfig?.configId || '',
      model: config.api?.model || character.apiConfig?.model || '',
      stream: config.stream !== false,
      messages,
      tools: config.mcp?.enabled ? getOpenAIToolsForConversation(conversationKey, config.mcp) : undefined,
      signal: abortController.signal,
      onDelta: (delta, fullText) => {
        updateMessage(aiMessage.id, {
          content: fullText
        });
        patchStreamingMessage(aiMessage.id, fullText);
      },
      onThinking: (delta, fullThinking) => {
        updateMessage(aiMessage.id, {
          thinking: fullThinking
        });
      }
    });

    const sticker = pickStickerForText(result.content || '');

    updateMessage(aiMessage.id, {
      content: result.content || '',
      thinking: result.thinking || '',
      raw: result.raw || '',
      sticker: sticker?.image || '',
      stickerDescription: sticker?.description || ''
    });

    renderChat();

    if (config.tts?.enabled) {
      speakMessage({
        content: result.content
      });
    }

    runMemoryCycle(character.id, {
      proactive: true,
      summary: true,
      model: config.api?.model,
      endpoint: config.api?.endpoint,
      apiKey: config.api?.apiKey
    }).catch(() => {});

    if (config.autoMoments) {
      maybeCreateMomentBadge();
    }
  } catch (error) {
    updateMessage(aiMessage.id, {
      content: error.message || '回复失败'
    });
    renderChat();
  }
}

async function requestGroupReplies(extraPrompt = '') {
  const group = getGroups().find((item) => item.id === activeGroup.id);

  if (!group) {
    return;
  }

  const members = group.characterIds
    .map((id) => getCharacter(id))
    .filter(Boolean);

  if (!members.length) {
    toast('群聊还没有角色');
    return;
  }

  for (const character of members) {
    const aiMessage = createLocalMessage({
      role: 'assistant',
      name: character.name,
      avatar: character.avatar,
      characterId: character.id,
      groupId: group.id,
      content: ''
    });

    appendCurrentMessage(aiMessage, false);
    renderChat();

    const conversationKey = getConversationKey();
    const config = getConversationConfig(conversationKey);
    const groupHistory = getCurrentMessages();

    try {
      const systemPrompt = buildSystemPrompt(character.id, {
        includeMemory: config.memoryInjection !== false,
        extraPrompt: [
          `你正在群聊「${group.name}」中，其他AI也会参与。你可以自然提到其他人的名字，但不要替他们说话。`,
          extraPrompt
        ].filter(Boolean).join('\n\n')
      });

      const messages = [
        { role: 'system', content: systemPrompt },
        ...groupHistory.slice(-28).map((message) => ({
          role: message.role === 'user' ? 'user' : 'assistant',
          content: `${message.name || (message.role === 'user' ? '用户' : 'AI')}：${getMessagePlainText(message)}`
        }))
      ];

      const result = await createChatCompletion({
        conversationId,
        characterId: character.id,
        configId: config.api?.configId || character.apiConfig?.configId || '',
        model: config.api?.model || character.apiConfig?.model || '',
        stream: config.stream !== false,
        messages,
        signal: abortController.signal,
        onDelta: (delta, fullText) => {
          updateMessage(aiMessage.id, { content: fullText });
          patchStreamingMessage(aiMessage.id, fullText);
        }
      });

      updateMessage(aiMessage.id, {
        content: result.content || '',
        thinking: result.thinking || '',
        raw: result.raw || ''
      });
    } catch (error) {
      updateMessage(aiMessage.id, {
        content: error.message || '回复失败'
      });
    }

    renderChat();
  }
}

function patchStreamingMessage(messageId, text) {
  const messageEl = document.querySelector(`[data-message-id="${messageId}"] .message-bubble`);

  if (messageEl) {
    messageEl.replaceChildren(renderMessageContent(text));
    scrollToBottom();
  }
}

function speakMessage(message) {
  const config = getConversationConfig(getConversationKey());

  speakText(message.content || '', {
    conversationId: getConversationKey(),
    configId: config.tts?.configId || '',
    enabled: true,
    force: true
  }).catch((error) => toast(error.message || '播放失败'));
}

function regenerateFromMessage(message) {
  deleteMessage(message.id, false);
  requestAIReply('请重新生成上一条回复。');
}

function continueAssistantMessage() {
  requestAIReply('请续写上一条回复。');
}

function editUserMessage(message) {
  const field = textareaField({
    label: '编辑消息',
    value: message.content || '',
    rows: 5
  });

  const instance = sheet({
    title: '编辑后重发',
    content: field.wrap,
    actions: [
      button({
        text: '发送',
        className: 'primary-button',
        onClick: () => {
          updateMessage(message.id, {
            content: field.textarea.value.trim()
          });
          instance.close();
          renderChat();
          requestAIReply('用户编辑了上一条消息，请重新回复。');
        }
      })
    ]
  });
}

function showRawMessage(message) {
  sheet({
    title: '原始内容',
    content: h('div', { className: 'form' }, [
      textareaField({
        value: JSON.stringify(message, null, 2),
        rows: 12
      }).wrap
    ])
  });
}

function deleteMessage(messageId, rerender = true) {
  if (screen === 'private') {
    const character = getCharacter(activeConversation.id);
    character.chatHistory = (character.chatHistory || []).filter((message) => message.id !== messageId);
    saveCharacter(character);
    activeConversation = character;
  } else {
    const group = getGroups().find((item) => item.id === activeGroup.id);
    group.chatHistory = (group.chatHistory || []).filter((message) => message.id !== messageId);
    saveGroup(group);
    activeGroup = group;
  }

  if (rerender) {
    renderChat();
  }
}

async function clearCurrentHistory() {
  const ok = await confirmDialog({
    title: '清空上下文',
    message: '确认清空当前聊天记录吗？',
    danger: true
  });

  if (!ok) {
    return;
  }

  if (screen === 'private') {
    const character = getCharacter(activeConversation.id);
    character.chatHistory = [];
    saveCharacter(character);
    activeConversation = character;
  } else {
    const group = getGroups().find((item) => item.id === activeGroup.id);
    group.chatHistory = [];
    saveGroup(group);
    activeGroup = group;
  }

  toast('已清空');
  renderChat();
}

function exportCurrentChat(type = 'txt') {
  const title = screen === 'group' ? activeGroup.name : activeConversation.name;
  const messages = getCurrentMessages();

  if (type === 'json') {
    downloadText(`${title}-聊天记录.json`, JSON.stringify(messages, null, 2), 'application/json;charset=utf-8');
    return;
  }

  const text = messages.map((message) => {
    const speaker = getMessageSpeaker(message);
    return `[${formatDateTime(message.createdAt)}] ${speaker.name}：${getMessagePlainText(message)}`;
  }).join('\n\n');

  downloadText(`${title}-聊天记录.txt`, text, 'text/plain;charset=utf-8');
}

function openGroupEditor(group = null) {
  const current = group || createGroup({
    name: '新的群聊'
  });

  const characters = getCharacters();
  const selected = new Set(current.characterIds || []);

  const nameField = inputField({
    label: '群聊名称',
    value: current.name,
    placeholder: '新的群聊'
  });

  const list = h('div', { className: 'form' }, characters.map((character) => {
    return switchControl({
      label: character.name,
      description: '加入群聊',
      checked: selected.has(character.id),
      onChange: (checked) => {
        if (checked) {
          selected.add(character.id);
        } else {
          selected.delete(character.id);
        }
      }
    });
  }));

  const instance = sheet({
    title: group ? '编辑群聊' : '新建群聊',
    content: h('div', { className: 'form' }, [
      nameField.wrap,
      list
    ]),
    actions: [
      button({
        text: '保存',
        className: 'primary-button',
        onClick: () => {
          saveGroup({
            ...current,
            name: nameField.input.value.trim() || '新的群聊',
            characterIds: Array.from(selected)
          });

          instance.close();
          toast('群聊已保存');
          renderList();
        }
      })
    ]
  });
}

function openCallScreen() {
  if (screen !== 'private') {
    toast('群聊暂不支持通话');
    return;
  }

  const character = activeConversation;
  let seconds = 0;
  let speaking = false;

  const timeNode = h('div', { className: 'call-time', text: '00:00' });
  const avatarWrap = h('div', { className: 'call-avatar-wrap' }, avatar(character.avatar, character.name, 'xl'));
  const timer = window.setInterval(() => {
    seconds += 1;
    timeNode.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }, 1000);

  const call = h('div', { className: 'call-screen' }, [
    h('div'),
    h('div', { className: 'call-main' }, [
      avatarWrap,
      h('div', { className: 'call-name', text: character.name }),
      timeNode,
      h('div', { className: 'card-meta', text: '按住下方按钮说话，AI会用语音回复' })
    ]),
    h('div', { className: 'call-actions' }, [
      iconButton('mic', {
        className: 'icon-button soft',
        title: '按住说话'
      }),
      h('button', {
        type: 'button',
        className: 'hangup-button',
        onClick: () => {
          window.clearInterval(timer);
          stopSpeech();
          call.remove();
        }
      }, icon('phone'))
    ])
  ]);

  const micButton = call.querySelector('.icon-button.soft');

  if (isSpeechRecognitionSupported()) {
    const handlers = createHoldToRecordHandlers({
      onStart: () => stopSpeech(),
      onEnd: async (text) => {
        if (!text.trim()) {
          return;
        }

        appendCurrentMessage({
          role: 'user',
          type: 'voice',
          content: text.trim()
        });

        await requestAIReply(`通话中，用户说：${text.trim()}`);

        const last = getLastMessage(getCurrentMessages());

        if (last?.role === 'assistant') {
          avatarWrap.classList.add('speaking');
          await speakMessage(last);
          avatarWrap.classList.remove('speaking');
        }
      }
    });

    handlers.bind(micButton);
  }

  document.body.appendChild(call);
}

function getCurrentMessages() {
  if (screen === 'private') {
    const character = getCharacter(activeConversation.id);
    return character?.chatHistory || [];
  }

  const group = getGroups().find((item) => item.id === activeGroup.id);
  return group?.chatHistory || [];
}

function appendCurrentMessage(message, normalize = true) {
  const saved = normalize ? createLocalMessage(message) : message;

  if (screen === 'private') {
    const character = getCharacter(activeConversation.id);
    character.chatHistory = [...(character.chatHistory || []), saved];
    saveCharacter(character);
    activeConversation = character;
  } else {
    const group = getGroups().find((item) => item.id === activeGroup.id);
    group.chatHistory = [...(group.chatHistory || []), saved];
    group.updatedAt = nowISO();
    saveGroup(group);
    activeGroup = group;
  }

  return saved;
}

function updateMessage(messageId, patch = {}) {
  if (screen === 'private') {
    const character = getCharacter(activeConversation.id);
    character.chatHistory = (character.chatHistory || []).map((message) => {
      return message.id === messageId ? { ...message, ...patch } : message;
    });
    saveCharacter(character);
    activeConversation = character;
  } else {
    const group = getGroups().find((item) => item.id === activeGroup.id);
    group.chatHistory = (group.chatHistory || []).map((message) => {
      return message.id === messageId ? { ...message, ...patch } : message;
    });
    saveGroup(group);
    activeGroup = group;
  }
}

function createLocalMessage(data = {}) {
  return {
    id: data.id || uuid(),
    role: data.role || 'user',
    type: data.type || 'text',
    content: data.content || '',
    name: data.name || (data.role === 'user' ? '我' : ''),
    avatar: data.avatar || '',
    characterId: data.characterId || '',
    groupId: data.groupId || '',
    thinking: data.thinking || '',
    raw: data.raw || '',
    amount: Number(data.amount || 0),
    image: data.image || '',
    sticker: data.sticker || '',
    stickerDescription: data.stickerDescription || '',
    createdAt: data.createdAt || nowISO()
  };
}

function getMessageSpeaker(message) {
  if (message.role === 'user') {
    const settings = getSettings();
    return {
      name: message.name || '我',
      avatar: settings.personalization?.userAvatar || message.avatar || ''
    };
  }

  if (message.characterId) {
    const character = getCharacter(message.characterId);

    if (character) {
      return {
        name: message.name || character.name,
        avatar: message.avatar || character.avatar
      };
    }
  }

  return {
    name: message.name || (screen === 'private' ? activeConversation?.name : 'AI'),
    avatar: message.avatar || (screen === 'private' ? activeConversation?.avatar : '')
  };
}

function getMessagePlainText(message) {
  if (!message) {
    return '';
  }

  if (message.type === 'transfer') {
    return message.content || `转账 ${Number(message.amount || 0).toFixed(2)}`;
  }

  if (message.type === 'sticker') {
    return message.content || message.stickerDescription || '表情包';
  }

  if (message.type === 'image') {
    return message.content || '图片';
  }

  if (message.type === 'voice') {
    return message.content || '语音消息';
  }

  return message.content || '';
}

function getLastMessage(messages = []) {
  return messages.length ? messages[messages.length - 1] : null;
}

function formatTime(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  });
}

function getOnlineStatus(value) {
  if (!value) {
    return '尚未聊天';
  }

  const date = new Date(value);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) {
    return '刚刚活跃';
  }

  if (minutes < 60) {
    return `${minutes}分钟前`;
  }

  if (date.toDateString() === now.toDateString()) {
    return '今天在线';
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === yesterday.toDateString()) {
    return '昨天在线';
  }

  return `${date.getMonth() + 1}月${date.getDate()}日在线`;
}

function getConversationKey() {
  if (screen === 'private' && activeConversation) {
    return `private:${activeConversation.id}`;
  }

  if (screen === 'group' && activeGroup) {
    return `group:${activeGroup.id}`;
  }

  return '';
}

function getAllConversationConfigs() {
  return readLocal(CHAT_CONFIG_KEY, {});
}

function setAllConversationConfigs(map) {
  writeLocal(CHAT_CONFIG_KEY, map);
}

function getConversationConfig(key) {
  const settings = getSettings();
  const map = getAllConversationConfigs();
  const stored = map[key] || {};
  const runtimeTTS = getRuntimeTTS(key);
  const runtimeMCP = getRuntimeMCP(key);

  return {
    stream: stored.stream ?? settings.chat?.stream ?? true,
    memoryInjection: stored.memoryInjection ?? settings.chat?.memoryInjection ?? true,
    autoMoments: stored.autoMoments ?? settings.chat?.autoMoments ?? false,
    api: stored.api || {},
    tts: runtimeTTS || stored.tts || {
      enabled: settings.chat?.autoTTS || false,
      configId: ''
    },
    mcp: runtimeMCP || stored.mcp || {
      enabled: false,
      serverIds: [],
      toolNames: []
    }
  };
}

function saveConversationConfig(key, config) {
  const map = getAllConversationConfigs();
  map[key] = config;
  setAllConversationConfigs(map);
}

function applyConversationRuntime() {
  const key = getConversationKey();
  const config = getConversationConfig(key);

  if (config.api) {
    setRuntimeApi(key, config.api);
  }

  if (config.tts) {
    setRuntimeTTS(key, config.tts);
  }

  if (config.mcp) {
    setRuntimeMCP(key, config.mcp);
  }
}

function getCharacterExtrasMap() {
  return readLocal(CHARACTER_EXTRAS_KEY, {});
}

function getCharacterExtras(characterId = '') {
  const map = getCharacterExtrasMap();

  return {
    quickReplies: [],
    chatBackgroundMode: 'image',
    chatBackgroundColor: '',
    ...(map[characterId] || {})
  };
}

function getChatBackground() {
  if (screen !== 'private') {
    return {};
  }

  const character = getCharacter(activeConversation.id);
  const extras = getCharacterExtras(character.id);

  if (extras.chatBackgroundMode === 'color' && extras.chatBackgroundColor) {
    return {
      backgroundColor: extras.chatBackgroundColor,
      backgroundImage: ''
    };
  }

  if (extras.chatBackgroundMode === 'image' && character.chatBackground) {
    return {
      backgroundImage: `url("${character.chatBackground}")`
    };
  }

  return {};
}

function getStickerLibrary() {
  return readLocal(STICKER_LIBRARY_KEY, []);
}

function pickStickerForText(text = '') {
  const stickers = getStickerLibrary();

  if (!stickers.length) {
    return null;
  }

  const source = String(text || '').toLowerCase();
  const scored = stickers.map((sticker) => {
    const desc = String(sticker.description || '').toLowerCase();
    let score = 0;

    desc.split(/\s+|，|。|、|；|,|\.|;/).filter(Boolean).forEach((word) => {
      if (source.includes(word)) {
        score += word.length;
      }
    });

    if (/开心|高兴|笑|喜欢|好/.test(source) && /开心|笑|喜欢/.test(desc)) {
      score += 6;
    }

    if (/难过|伤心|哭|失落/.test(source) && /难过|哭|伤心/.test(desc)) {
      score += 6;
    }

    if (/害羞|脸红|不好意思/.test(source) && /害羞|脸红/.test(desc)) {
      score += 6;
    }

    return {
      sticker,
      score
    };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.score > 0 ? scored[0].sticker : null;
}

function maybeCreateMomentBadge() {
  try {
    localStorage.setItem(MOMENTS_BADGE_KEY, '1');
  } catch {}

  refreshDesktop();
}

function getUnreadMap() {
  return readLocal(CHAT_UNREAD_KEY, {});
}

function setUnreadMap(map) {
  writeLocal(CHAT_UNREAD_KEY, map);
}

function getUnreadCount(key) {
  return Number(getUnreadMap()[key] || 0);
}

function clearUnread(key) {
  const map = getUnreadMap();
  delete map[key];
  setUnreadMap(map);
  refreshDesktop();
}

function clearChatUnread() {
  setUnreadMap({});
  refreshDesktop();
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    const area = document.querySelector('.chat-messages');

    if (area) {
      area.scrollTop = area.scrollHeight;
    }
  });
}
