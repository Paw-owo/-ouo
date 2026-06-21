import {
  readState,
  updateState,
  getCharacter,
  ensureSingleConversation,
  saveConversation,
  appendMessage,
  updateConversationConfig,
  createMessage,
  createChatConfig,
  searchAllMessages,
  downloadText,
  clearUnread,
} from "../core/storage.js";
import {
  resolveChatApiOptions,
  streamChatCompletion,
  abortStream,
  estimateTokenCount,
} from "../core/api.js";
import {
  buildMessagesWithMemory,
  rememberFromConversation,
  summarizeCharacterIfNeeded,
} from "../core/memory.js";
import {
  applyAppTheme,
  getAppTheme,
  updateAppTheme,
} from "../core/theme.js";
import {
  buildSelectedMcpPrompt,
  buildMcpToolsForOpenAI,
  handleMcpToolCalls,
} from "../core/mcp.js";
import {
  speakText,
  stopSpeaking,
  autoSpeakIfEnabled,
  bindHoldToRecord,
  createVoiceWaveElement,
} from "../core/tts.js";
import {
  renderAppShell,
  createElement,
  clear,
  card,
  button,
  iconButton,
  listItem,
  createSearchBox,
  openDrawer,
  closeDrawer,
  openModal,
  closeModal,
  toast,
  formField,
  getFormValues,
  pickFile,
  renderThemeQuickSettings,
  formatTime,
  formatOnlineStatus,
  ICONS,
} from "../core/ui.js";

let host = null;
let context = null;
let state = null;
let activeConversation = null;
let activeConversationType = "single";
let activeConversationId = "";
let searchText = "";
let messageDraft = "";
let stopRecordingBinder = null;
let currentStreamKey = "";

export function mountApp(container, appContext = {}) {
  host = container;
  context = appContext;
  state = readState();

  clearUnread("chat");
  applyAppTheme("chat", host);

  const targetCharacterId = sessionStorage.getItem("open_chat_character_id");
  if (targetCharacterId) {
    sessionStorage.removeItem("open_chat_character_id");
    openConversation("single", targetCharacterId);
    return;
  }

  if (activeConversationId) {
    openConversation(activeConversationType, activeConversationId);
    return;
  }

  renderChatList();
}

export function renderApp(appContext = {}) {
  const wrapper = createElement("div");
  mountApp(wrapper, appContext);
  return wrapper;
}

function renderChatList() {
  state = readState();
  activeConversation = null;

  const { shell, content } = renderAppShell({
    title: "消息",
    onBack: context.close,
    actions: [
      iconButton("palette", "外观", openThemeDrawer),
      iconButton("plus", "新建群聊", openGroupDrawer),
    ],
  });

  host.replaceChildren(shell);

  content.append(createSearchBox("搜索角色或聊天记录", (value) => {
    searchText = value;
    renderChatList();
  }));

  if (searchText.trim()) {
    renderSearchResults(content);
  } else {
    renderConversationList(content);
  }
}

function renderConversationList(content) {
  const list = createElement("div", { className: "list" });
  const conversations = collectConversations();

  conversations.forEach(({ conversation, character }) => {
    list.append(listItem({
      avatar: character?.avatar || "",
      title: conversation.title || character?.name || "对话",
      subtitle: getConversationPreview(conversation),
      meta: formatOnlineStatus(conversation.lastMessageAt),
      onClick: () => openConversation(conversation.type, conversation.type === "group" ? conversation.id : conversation.characterIds[0]),
      actions: conversation.unread
        ? [createElement("span", { className: "badge", text: String(conversation.unread) })]
        : [],
    }));
  });

  content.append(list);

  if (!conversations.length) {
    content.append(card([
      createElement("h2", { className: "section-title", text: "还没有对话" }),
      createElement("p", { className: "muted", text: "先去角色管理创建角色，再回到这里开始聊天。" }),
      button("打开角色管理", () => window.dispatchEvent(new CustomEvent("app:open", { detail: { appId: "characters" } })), "primary"),
    ], "stack"));
  }
}

function renderSearchResults(content) {
  const characterMatches = state.characters.filter((character) => {
    return `${character.name} ${character.description} ${character.personality}`
      .toLowerCase()
      .includes(searchText.toLowerCase());
  });

  const messageMatches = searchAllMessages(searchText);

  if (characterMatches.length) {
    content.append(createElement("h2", { className: "section-title", text: "角色" }));
    const characterList = createElement("div", { className: "list" });
    characterMatches.forEach((character) => {
      characterList.append(listItem({
        avatar: character.avatar,
        title: character.name,
        subtitle: character.description || "打开对话",
        onClick: () => openConversation("single", character.id),
      }));
    });
    content.append(characterList);
  }

  if (messageMatches.length) {
    content.append(createElement("h2", { className: "section-title", text: "聊天记录" }));
    const messageList = createElement("div", { className: "list" });
    messageMatches.forEach((result) => {
      messageList.append(listItem({
        title: result.characterName,
        subtitle: result.snippet,
        meta: formatTime(result.createdAt),
        onClick: () => openConversation(result.conversationType, result.conversationType === "group" ? result.conversationId : result.characterId),
      }));
    });
    content.append(messageList);
  }

  if (!characterMatches.length && !messageMatches.length) {
    content.append(card([
      createElement("p", { className: "muted", text: "没有搜到相关内容。" }),
    ]));
  }
}

function collectConversations() {
  const singles = Object.values(state.conversations.single || {}).map((conversation) => ({
    conversation,
    character: state.characters.find((character) => character.id === conversation.characterIds[0]),
  }));

  const groups = Object.values(state.conversations.groups || {}).map((conversation) => ({
    conversation,
    character: null,
  }));

  return [...singles, ...groups].sort((a, b) => {
    return new Date(b.conversation.lastMessageAt || b.conversation.updatedAt || 0)
      - new Date(a.conversation.lastMessageAt || a.conversation.updatedAt || 0);
  });
}

function openConversation(type, id) {
  state = readState();
  activeConversationType = type;
  activeConversationId = id;

  if (type === "single") {
    ensureSingleConversation(id);
    state = readState();
    activeConversation = state.conversations.single[id];
  } else {
    activeConversation = state.conversations.groups[id];
  }

  if (!activeConversation) {
    renderChatList();
    return;
  }

  updateState((draft) => {
    const target = type === "group" ? draft.conversations.groups[id] : draft.conversations.single[id];
    if (target) target.unread = 0;
    draft.unreadBadges.chat = 0;
    return draft;
  });

  renderConversation();
}

function renderConversation() {
  state = readState();
  activeConversation = activeConversationType === "group"
    ? state.conversations.groups[activeConversationId]
    : state.conversations.single[activeConversationId];

  const character = getActiveCharacter();
  applyCharacterChatBackground(character);

  host.replaceChildren(createElement("div", {
    className: `chat-layout ${state.settings.chatBubbleMode === "dialogue" ? "chat-dialogue" : ""}`,
    children: [
      renderChatTop(character),
      renderMessageArea(),
      renderChatInput(),
    ],
  }));

  bindRecorder();
  scrollToBottom(false);
}

function renderChatTop(character) {
  return createElement("header", {
    className: "chat-top",
    children: [
      iconButton("back", "返回", () => {
        activeConversationId = "";
        stopSpeaking();
        abortCurrentStream();
        renderChatList();
      }),
      createElement("button", {
        className: "chat-title",
        on: { click: openConversationConfigDrawer },
        children: [
          createElement("span", { className: "chat-name", text: activeConversation.title || character?.name || "对话" }),
          createElement("span", { className: "chat-status", text: formatOnlineStatus(activeConversation.lastMessageAt) }),
        ],
      }),
      iconButton("more", "更多", openMoreDrawer),
    ],
  });
}

function renderMessageArea() {
  const area = createElement("main", { className: "message-area", attrs: { id: "messageArea" } });

  if (!activeConversation.messages.length) {
    const character = getActiveCharacter();
    const firstMessage = character?.firstMessage || "我在这里。";
    area.append(createElement("div", {
      className: "message-row ai",
      children: [
        renderMessageAvatar(character),
        createElement("div", {
          className: "message-stack",
          children: [
            createElement("div", { className: "message-sender", text: character?.name || "AI" }),
            createElement("div", { className: "message-bubble", text: firstMessage }),
          ],
        }),
      ],
    }));
    return area;
  }

  activeConversation.messages.forEach((message) => {
    area.append(renderMessage(message));
  });

  return area;
}

function renderMessage(message) {
  const isUser = message.role === "user";
  const character = isUser ? null : findMessageCharacter(message);
  const bubbleChildren = [];

  if (message.thinking) {
    bubbleChildren.push(createElement("div", {
      className: "thinking-block",
      children: [
        createElement("div", { className: "thinking-head", text: "思考" }),
        createElement("div", { className: "thinking-content", text: message.thinking }),
      ],
    }));
  }

  if (message.voice) {
    bubbleChildren.push(createElement("div", {
      className: "status-cluster",
      children: [
        createVoiceWaveElement(),
        createElement("span", { text: message.voice.text || "语音消息" }),
      ],
    }));
  } else {
    bubbleChildren.push(createElement("span", { text: message.content || "" }));
  }

  if (message.stickerId) {
    const sticker = state.stickers.find((item) => item.id === message.stickerId);
    if (sticker) {
      bubbleChildren.push(createElement("div", {
        className: "sticker-item",
        children: [createElement("img", { attrs: { src: sticker.image, alt: sticker.description || "" } })],
      }));
    }
  }

  if (state.settings.showTokenCount || activeConversation.chatConfig?.showTokenCount) {
    bubbleChildren.push(createElement("div", {
      className: "muted",
      text: `${message.tokenCount || estimateTokenCount(message.content || "")} tokens`,
    }));
  }

  return createElement("div", {
    className: `message-row ${isUser ? "user" : "ai"}`,
    dataset: { messageId: message.id },
    children: [
      !isUser ? renderMessageAvatar(character) : null,
      createElement("div", {
        className: "message-stack",
        children: [
          !isUser ? createElement("div", { className: "message-sender", text: character?.name || "AI" }) : null,
          createElement("div", { className: "message-bubble", children: bubbleChildren }),
          !isUser ? createElement("div", {
            className: "status-cluster",
            children: [
              button("朗读", () => speakText(message.content, { characterId: character?.id || "" }), "text"),
              button("停止", stopSpeaking, "text"),
            ],
          }) : null,
        ].filter(Boolean),
      }),
      isUser ? renderUserAvatar() : null,
    ].filter(Boolean),
  });
}

function renderMessageAvatar(character) {
  return createElement("div", {
    className: "message-avatar",
    children: character?.avatar
      ? [createElement("img", { attrs: { src: character.avatar, alt: character.name } })]
      : [createElement("div")],
  });
}

function renderUserAvatar() {
  const profile = state.settings.userProfile || {};
  return createElement("div", {
    className: "message-avatar",
    children: profile.avatar
      ? [createElement("img", { attrs: { src: profile.avatar, alt: profile.nickname || "我" } })]
      : [createElement("div")],
  });
}

function renderChatInput() {
  const character = getActiveCharacter();
  const quickReplies = character?.quickReplies || [];
  const bar = createElement("footer", {
    className: "chat-input-bar",
    children: [
      createElement("div", {
        className: `quick-replies ${quickReplies.length ? "open" : ""}`,
        children: quickReplies.map((text) => createElement("button", {
          className: "quick-reply",
          text,
          on: { click: () => sendText(text) },
        })),
      }),
      createElement("div", {
        className: "chat-input-row",
        children: [
          iconButton("plus", "工具", openToolDrawer),
          createElement("textarea", {
            className: "chat-input",
            attrs: { id: "chatInput", placeholder: "输入消息", rows: "1" },
            text: messageDraft,
            on: {
              input: (event) => {
                messageDraft = event.target.value;
                autoResizeInput(event.target);
              },
              keydown: (event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendText(event.target.value);
                }
              },
            },
          }),
          createElement("button", {
            className: "send-button",
            text: "发送",
            on: {
              click: () => {
                const input = document.getElementById("chatInput");
                sendText(input?.value || messageDraft);
              },
            },
          }),
        ],
      }),
    ],
  });

  return bar;
}

function autoResizeInput(input) {
  input.style.height = "auto";
  input.style.height = `${Math.min(132, input.scrollHeight)}px`;
}

function bindRecorder() {
  stopRecordingBinder?.();
  const plusButton = host.querySelector(".chat-input-row .icon-button");
  if (!plusButton) return;

  let recordButton = null;
  stopRecordingBinder = () => {};

  window.chatRecordBinder = (buttonNode) => {
    recordButton = buttonNode;
    stopRecordingBinder = bindHoldToRecord(recordButton, {
      onStart: () => toast("正在听你说话"),
      onInterim: (text) => {
        const input = document.getElementById("chatInput");
        if (input) input.value = text;
      },
      onEnd: (text) => {
        if (text.trim()) sendVoiceText(text.trim());
      },
      onError: (error) => toast(error.message),
    });
  };
}

async function sendText(text) {
  const content = String(text || "").trim();
  if (!content || !activeConversation) return;

  messageDraft = "";
  const input = document.getElementById("chatInput");
  if (input) input.value = "";

  const userMessage = createMessage({
    role: "user",
    content,
    tokenCount: estimateTokenCount(content),
  });

  appendMessage(activeConversationType, activeConversationId, userMessage);
  state = readState();
  activeConversation = getCurrentConversation();

  renderConversation();
  await requestAiReply(content);
}

async function sendVoiceText(text) {
  const message = createMessage({
    role: "user",
    content: text,
    voice: { text, duration: 0 },
    tokenCount: estimateTokenCount(text),
  });

  appendMessage(activeConversationType, activeConversationId, message);
  state = readState();
  activeConversation = getCurrentConversation();
  renderConversation();
  await requestAiReply(text);
}

async function requestAiReply(userText) {
  const character = getActiveCharacter();
  if (!character) {
    toast("请先选择角色");
    return;
  }

  const options = resolveChatApiOptions({
    characterId: character.id,
    conversationType: activeConversationType,
    conversationId: activeConversationId,
  });

  if (!options.apiConfig?.endpoint) {
    toast("请先在设置里填写 API endpoint");
    return;
  }

  const userPersona = resolveUserPersona(character);
  const worldbookEntries = resolveWorldbookEntries(character);
  const mcpPrompt = buildSelectedMcpPrompt(activeConversation.chatConfig);
  const messages = buildMessagesWithMemory({
    character,
    userPersona,
    worldbookEntries,
    inventoryEffects: resolveInventoryEffects(),
    history: activeConversation.messages,
    userMessage: userText,
    extraPrompt: mcpPrompt,
  });

  const assistantMessage = createMessage({
    role: "assistant",
    characterId: character.id,
    name: character.name,
    avatar: character.avatar,
    content: "",
    status: "streaming",
  });

  appendMessage(activeConversationType, activeConversationId, assistantMessage);
  state = readState();
  activeConversation = getCurrentConversation();
  renderConversation();

  currentStreamKey = `${activeConversation.type}_${activeConversation.id}`;

  try {
    const result = await streamChatCompletion({
      apiConfigId: options.apiConfig.id,
      model: options.model,
      messages,
      conversationKey: currentStreamKey,
      tools: buildMcpToolsForOpenAI(activeConversation.chatConfig),
      onDelta: (delta) => updateStreamingMessage(assistantMessage.id, { appendContent: delta }),
      onThinking: (delta) => updateStreamingMessage(assistantMessage.id, { appendThinking: delta }),
      onToolCall: async (toolCalls) => {
        const toolResults = await handleMcpToolCalls(toolCalls, activeConversation.chatConfig);
        if (toolResults.length) {
          updateStreamingMessage(assistantMessage.id, {
            appendContent: `\n${toolResults.map((item) => item.ok ? "工具已完成" : item.output.error).join("\n")}`,
          });
        }
      },
    });

    finishAssistantMessage(assistantMessage.id, {
      content: result.content,
      thinking: result.thinking,
      rawContent: result.rawContent,
      tokenCount: estimateTokenCount(result.content || ""),
      status: "done",
    });

    await autoSpeakIfEnabled(result.content, {
      characterId: character.id,
      ttsConfigId: activeConversation.chatConfig?.ttsConfigId || character.ttsConfigId || "",
    });

    const latest = getCurrentConversation().messages.slice(-8);
    rememberFromConversation({
      characterId: character.id,
      latestMessages: latest,
      apiConfigId: options.apiConfig.id,
      apiModel: options.model,
    });

    summarizeCharacterIfNeeded({
      characterId: character.id,
      apiConfigId: options.apiConfig.id,
      apiModel: options.model,
    });
  } catch (error) {
    finishAssistantMessage(assistantMessage.id, {
      content: error.name === "AbortError" ? "回复已停止。" : error.message,
      status: "error",
    });
  } finally {
    currentStreamKey = "";
  }
}

function updateStreamingMessage(messageId, patch) {
  const conversation = getCurrentConversation();
  if (!conversation) return;

  const messages = conversation.messages.map((message) => {
    if (message.id !== messageId) return message;
    return {
      ...message,
      content: patch.appendContent ? `${message.content || ""}${patch.appendContent}` : message.content,
      thinking: patch.appendThinking ? `${message.thinking || ""}${patch.appendThinking}` : message.thinking,
      updatedAt: new Date().toISOString(),
    };
  });

  saveConversation({ ...conversation, messages });
  state = readState();
  activeConversation = getCurrentConversation();

  const row = host.querySelector(`[data-message-id="${messageId}"] .message-bubble`);
  if (row) {
    row.textContent = messages.find((message) => message.id === messageId)?.content || "";
  } else {
    renderConversation();
  }

  scrollToBottom(true);
}

function finishAssistantMessage(messageId, patch) {
  const conversation = getCurrentConversation();
  if (!conversation) return;

  const messages = conversation.messages.map((message) => {
    if (message.id !== messageId) return message;
    return {
      ...message,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
  });

  saveConversation({
    ...conversation,
    messages,
    lastMessageAt: new Date().toISOString(),
  });

  state = readState();
  activeConversation = getCurrentConversation();
  renderConversation();
}

function openConversationConfigDrawer() {
  state = readState();
  activeConversation = getCurrentConversation();

  const config = {
    ...createChatConfig(),
    ...(activeConversation.chatConfig || {}),
  };

  const apiOptions = [
    { label: "默认接口", value: "" },
    ...state.apiConfigs.map((item) => ({ label: item.name, value: item.id })),
  ];

  const activeApi = state.apiConfigs.find((item) => item.id === config.apiConfigId) || state.apiConfigs[0];
  const modelOptions = [
    { label: "跟随接口默认", value: "" },
    ...(activeApi?.models || []).map((model) => ({ label: model, value: model })),
  ];

  const ttsOptions = [
    { label: "不启用", value: "" },
    ...state.ttsConfigs.map((item) => ({ label: item.name, value: item.id })),
  ];

  const form = createElement("div", {
    className: "form-grid",
    children: [
      formField({ label: "API 配置", name: "apiConfigId", value: config.apiConfigId || "", options: apiOptions }),
      formField({ label: "模型", name: "apiModel", value: config.apiModel || "", options: modelOptions }),
      formField({ label: "TTS 配置", name: "ttsConfigId", value: config.ttsConfigId || "", options: ttsOptions }),
      createToggleRow("流式回复", config.stream, "stream"),
      createToggleRow("启用长期记忆", config.memoryEnabled, "memoryEnabled"),
      createToggleRow("启用 MCP", config.mcpEnabled, "mcpEnabled"),
      createToggleRow("显示 token 数", config.showTokenCount, "showTokenCount"),
      renderMcpSelector(config),
    ],
  });

  openDrawer({
    title: "对话配置",
    content: form,
    actions: [
      button("保存", () => {
        const values = getFormValues(form);
        const checkboxes = getCheckboxValues(form);
        updateConversationConfig(activeConversationType, activeConversationId, {
          ...config,
          apiConfigId: values.apiConfigId,
          apiModel: values.apiModel,
          ttsConfigId: values.ttsConfigId,
          stream: checkboxes.stream,
          memoryEnabled: checkboxes.memoryEnabled,
          mcpEnabled: checkboxes.mcpEnabled,
          showTokenCount: checkboxes.showTokenCount,
          mcpServerIds: getSelectedMcpIds(form),
        });
        closeDrawer();
        renderConversation();
      }, "primary"),
    ],
  });
}

function createToggleRow(label, checked, name) {
  return createElement("label", {
    className: "card-button",
    children: [
      createElement("span", { text: label }),
      createElement("input", {
        attrs: { type: "checkbox", name, checked },
        style: { width: "auto" },
      }),
    ],
  });
}

function renderMcpSelector(config) {
  if (!state.mcpServers.length) {
    return createElement("p", { className: "muted", text: "还没有 MCP 服务，可在设置中新增。" });
  }

  return createElement("div", {
    className: "stack",
    children: [
      createElement("div", { className: "form-label", text: "可用 MCP 服务" }),
      ...state.mcpServers.map((server) => createElement("label", {
        className: "card-button",
        children: [
          createElement("span", { text: server.name }),
          createElement("input", {
            attrs: {
              type: "checkbox",
              name: "mcpServerId",
              value: server.id,
              checked: config.mcpServerIds?.includes(server.id),
            },
            style: { width: "auto" },
          }),
        ],
      })),
    ],
  });
}

function openToolDrawer() {
  const recordButton = button("按住录音", () => {}, "secondary");
  setTimeout(() => window.chatRecordBinder?.(recordButton), 0);

  openDrawer({
    title: "工具",
    content: createElement("div", {
      className: "tool-grid",
      children: [
        createToolItem("mic", "录音", () => {}, recordButton),
        createToolItem("image", "图片", sendImageMessage),
        createToolItem("palette", "表情包", openStickerDrawer),
        createToolItem("phone", "语音播放", () => {
          const last = [...activeConversation.messages].reverse().find((message) => message.role !== "user" && message.content);
          if (last) speakText(last.content, { characterId: getActiveCharacter()?.id || "" });
        }),
      ],
    }),
  });
}

function createToolItem(iconName, label, onClick, customButton = null) {
  if (customButton) {
    customButton.className = "tool-item";
    customButton.replaceChildren(
      createElement("span", { className: "tool-icon", html: ICONS[iconName] }),
      createElement("span", { text: label }),
    );
    return customButton;
  }

  return createElement("button", {
    className: "tool-item",
    on: { click: onClick },
    children: [
      createElement("span", { className: "tool-icon", html: ICONS[iconName] }),
      createElement("span", { text: label }),
    ],
  });
}

async function sendImageMessage() {
  const image = await pickFile({ accept: "image/*" });
  if (!image) return;

  const message = createMessage({
    role: "user",
    content: "发送了一张图片",
    attachments: [{ type: "image", url: image }],
  });

  appendMessage(activeConversationType, activeConversationId, message);
  closeDrawer();
  renderConversation();
}

function openStickerDrawer() {
  openDrawer({
    title: "表情包",
    content: createElement("div", {
      className: "sticker-grid",
      children: state.stickers.map((sticker) => createElement("button", {
        className: "sticker-item",
        on: {
          click: () => {
            appendMessage(activeConversationType, activeConversationId, createMessage({
              role: "user",
              content: sticker.description || "发送了表情包",
              stickerId: sticker.id,
            }));
            closeDrawer();
            renderConversation();
          },
        },
        children: [createElement("img", { attrs: { src: sticker.image, alt: sticker.description || "" } })],
      })),
    }),
  });
}

function openMoreDrawer() {
  openDrawer({
    title: "更多",
    content: createElement("div", {
      className: "stack",
      children: [
        button("导出 TXT", exportChatTxt, "secondary"),
        button("导出 JSON", exportChatJson, "secondary"),
        button("清空聊天记录", async () => {
          if (await confirmAction({ title: "清空聊天记录", message: "确认清空当前对话吗。" })) {
            saveConversation({ ...activeConversation, messages: [], lastMessageAt: "" });
            closeDrawer();
            renderConversation();
          }
        }, "text"),
        button("停止回复", abortCurrentStream, "secondary"),
      ],
    }),
  });
}

function openGroupDrawer() {
  const selected = new Set();
  const content = createElement("div", {
    className: "stack",
    children: state.characters.map((character) => createElement("button", {
      className: "card-button",
      on: {
        click: (event) => {
          if (selected.has(character.id)) selected.delete(character.id);
          else selected.add(character.id);
          event.currentTarget.querySelector(".muted").textContent = selected.has(character.id) ? "已选择" : "未选择";
        },
      },
      children: [
        createElement("span", { text: character.name }),
        createElement("span", { className: "muted", text: "未选择" }),
      ],
    })),
  });

  openModal({
    title: "新建群聊",
    content,
    actions: [
      button("取消", closeModal, "secondary"),
      button("创建", () => {
        if (!selected.size) {
          toast("请选择角色");
          return;
        }

        const ids = Array.from(selected);
        const title = ids.map((id) => state.characters.find((item) => item.id === id)?.name).filter(Boolean).join("、");
        let groupId = "";

        updateState((draft) => {
          groupId = crypto.randomUUID();
          draft.conversations.groups[groupId] = {
            id: groupId,
            type: "group",
            characterIds: ids,
            title,
            chatConfig: createChatConfig(),
            messages: [],
            unread: 0,
            lastMessageAt: "",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          return draft;
        });

        closeModal();
        openConversation("group", groupId);
      }, "primary"),
    ],
  });
}

function openThemeDrawer() {
  const theme = getAppTheme("chat");
  openDrawer({
    title: "聊天外观",
    content: renderThemeQuickSettings("chat", theme, (patch) => {
      updateAppTheme("chat", patch);
      applyAppTheme("chat", host);
    }),
  });
}

function applyCharacterChatBackground(character) {
  if (!character) return applyAppTheme("chat", host);

  applyAppTheme("chat", host);

  if (character.chatBackgroundMode === "image" && character.chatBackground) {
    host.style.setProperty("--app-bg-image", `url("${character.chatBackground}")`);
  }

  if (character.chatBackgroundMode === "color" && character.chatBackgroundColor) {
    host.style.setProperty("--bg-primary", character.chatBackgroundColor);
  }
}

function exportChatTxt() {
  const text = activeConversation.messages.map((message) => {
    const name = message.role === "user"
      ? state.settings.userProfile?.nickname || "我"
      : message.name || findMessageCharacter(message)?.name || "AI";
    return `${name} ${formatTime(message.createdAt)}\n${message.content || ""}`;
  }).join("\n\n");

  downloadText(`${activeConversation.title || "chat"}.txt`, text, "text/plain");
}

function exportChatJson() {
  downloadText(`${activeConversation.title || "chat"}.json`, JSON.stringify(activeConversation, null, 2));
}

function getActiveCharacter() {
  if (!activeConversation) return null;
  if (activeConversation.type === "group") {
    return state.characters.find((character) => activeConversation.characterIds.includes(character.id)) || null;
  }
  return state.characters.find((character) => character.id === activeConversation.characterIds[0]) || null;
}

function findMessageCharacter(message) {
  if (message.characterId) {
    return state.characters.find((character) => character.id === message.characterId) || null;
  }
  return getActiveCharacter();
}

function getCurrentConversation() {
  const nextState = readState();
  return activeConversationType === "group"
    ? nextState.conversations.groups[activeConversationId]
    : nextState.conversations.single[activeConversationId];
}

function resolveUserPersona(character) {
  const profilePersonaId = state.settings.userProfile?.personaId;
  if (profilePersonaId) return state.userPersonas.find((persona) => persona.id === profilePersonaId) || null;

  return state.userPersonas.find((persona) => {
    if (persona.scope === "all") return true;
    return persona.characterIds?.includes(character.id);
  }) || null;
}

function resolveWorldbookEntries(character) {
  const ids = new Set(character.worldbookIds || []);
  return state.worldbook.filter((entry) => entry.enabled && (entry.isGlobal || ids.has(entry.id)));
}

function resolveInventoryEffects() {
  return (state.shop.inventory || [])
    .slice(0, 8)
    .map((item) => item.effectPrompt)
    .filter(Boolean);
}

function getConversationPreview(conversation) {
  const last = conversation.messages?.at(-1);
  if (!last) return "还没有消息";
  return last.content || last.rawContent || "新消息";
}

function getCheckboxValues(form) {
  return Array.from(form.querySelectorAll("input[type='checkbox']")).reduce((values, input) => {
    if (input.name !== "mcpServerId") values[input.name] = input.checked;
    return values;
  }, {});
}

function getSelectedMcpIds(form) {
  return Array.from(form.querySelectorAll("input[name='mcpServerId']:checked")).map((input) => input.value);
}

function scrollToBottom(smooth = true) {
  requestAnimationFrame(() => {
    const area = document.getElementById("messageArea");
    if (!area) return;
    area.scrollTo({
      top: area.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  });
}

function abortCurrentStream() {
  if (currentStreamKey) {
    abortStream(currentStreamKey);
    currentStreamKey = "";
    toast("已停止回复");
  }
}
