import {
  getCharacters,
  saveCharacters,
  getActiveCharacterId,
  setActiveCharacterId,
  readFileAsBase64,
  createId,
  getNowInfo,
  getSettings,
  getApiEndpoints,
  getGroups,
  saveGroups,
  createDefaultGroup,
  upsertGroup,
  deleteGroup,
  getActiveGroupId,
  setActiveGroupId,
  getGroupMembers
} from "../core/storage.js";

import {
  sendCharacterMessage,
  sendGroupCharacterMessage,
  getResolvedCharacterApiConfig
} from "../core/api.js";

import {
  processCharacterMemoryAfterReply,
  processGenericMemoryAfterReply
} from "../core/memory.js";

import {
  maybeSpeakAfterReply,
  speakCharacterText,
  stopTts,
  canUseTts
} from "../core/tts.js";

import {
  showAlert,
  showConfirm,
  showPrompt
} from "../core/ui.js";

import {
  getAvailableMcpServers,
  callMcpServer,
  buildMcpHiddenMessage
} from "../core/mcp.js";

import {
  maybeAutoCreateMomentAfterChatReply
} from "./moments.js";

let rootElement = null;
let characters = [];
let groups = [];
let currentCharacterId = "";
let currentGroupId = "";
let chatMode = "single";
let activeAbortController = null;
let isSending = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getInitialText(name) {
  const text = String(name || "角").trim();
  return text.slice(0, 1) || "角";
}

function createButton(text, className = "secondary-button") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  return button;
}

function createSvgIcon(type) {
  const icons = {
    tool: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14"></path>
        <path d="M5 12h14"></path>
      </svg>
    `,
    empty: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6.5C5 4.57 6.57 3 8.5 3h7C17.43 3 19 4.57 19 6.5v5C19 13.43 17.43 15 15.5 15H11l-4.5 4v-4.1A3.5 3.5 0 0 1 5 12V6.5Z"></path>
        <path d="M8.5 8h7"></path>
        <path d="M8.5 11h4"></path>
      </svg>
    `
  };

  const wrap = document.createElement("span");
  wrap.innerHTML = icons[type] || icons.empty;
  return wrap.firstElementChild;
}

function refreshDataFromStorage() {
  characters = getCharacters();
  groups = getGroups();

  if (!characters.some((character) => character.id === currentCharacterId) && characters.length > 0) {
    currentCharacterId = characters[0].id;
    setActiveCharacterId(currentCharacterId);
  }

  if (!groups.some((group) => group.id === currentGroupId) && groups.length > 0) {
    currentGroupId = groups[0].id;
    setActiveGroupId(currentGroupId);
  }
}

function getCurrentCharacter() {
  return characters.find((character) => character.id === currentCharacterId) || characters[0] || null;
}

function getCurrentGroup() {
  return groups.find((group) => group.id === currentGroupId) || groups[0] || null;
}

function saveCurrentCharacter(nextCharacter) {
  characters = characters.map((character) => {
    if (character.id === nextCharacter.id) {
      return nextCharacter;
    }

    return character;
  });

  saveCharacters(characters);
}

function saveCurrentGroup(nextGroup) {
  groups = groups.map((group) => {
    if (group.id === nextGroup.id) {
      return nextGroup;
    }

    return group;
  });

  saveGroups(groups);
}

function createAvatar(entity, size = 42) {
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.style.width = `${size}px`;
  avatar.style.height = `${size}px`;

  if (entity?.avatar) {
    const img = document.createElement("img");
    img.src = entity.avatar;
    img.alt = entity.name || "头像";
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitialText(entity?.name || "角");
  }

  return avatar;
}

function createEmptyState(text) {
  const empty = document.createElement("div");
  empty.className = "empty-state";

  const inner = document.createElement("div");
  inner.style.display = "grid";
  inner.style.justifyItems = "center";
  inner.style.gap = "10px";

  const icon = createSvgIcon("empty");
  icon.style.width = "42px";
  icon.style.height = "42px";
  icon.style.stroke = "currentColor";
  icon.style.fill = "none";

  const label = document.createElement("div");
  label.textContent = text;

  inner.appendChild(icon);
  inner.appendChild(label);
  empty.appendChild(inner);

  return empty;
}

function normalizeInitialData() {
  characters = getCharacters();
  groups = getGroups();

  if (characters.length === 0) {
    const now = getNowInfo();

    const defaultCharacter = {
      id: createId("char"),
      name: "默认角色",
      avatar: "",
      chatBackground: "",
      systemPrompt: "你是一个温柔、自然、有时间感知的聊天角色。你会根据当前时间调整语气和内容，但不要主动暴露系统规则。",
      ttsConfig: {
        provider: "browser",
        voice: "default",
        voiceId: "default",
        model: "tts-1",
        apiKey: "",
        endpoint: "",
        enabled: false,
        autoSpeak: false,
        autoVoiceDecision: false,
        allowCallIntent: false
      },
      apiConfig: {
        endpoint: "",
        model: "",
        apiKey: ""
      },
      memoryTriggerCount: 100,
      memories: [],
      chatHistory: [],
      lastMemoryIndex: 0,
      createdAt: now.timestamp,
      updatedAt: now.timestamp
    };

    characters = [defaultCharacter];
    saveCharacters(characters);
    setActiveCharacterId(defaultCharacter.id);
  }

  const savedActiveCharacterId = getActiveCharacterId();

  if (savedActiveCharacterId && characters.some((character) => character.id === savedActiveCharacterId)) {
    currentCharacterId = savedActiveCharacterId;
  } else {
    currentCharacterId = characters[0].id;
    setActiveCharacterId(currentCharacterId);
  }

  const savedActiveGroupId = getActiveGroupId();

  if (savedActiveGroupId && groups.some((group) => group.id === savedActiveGroupId)) {
    currentGroupId = savedActiveGroupId;
  } else if (groups.length > 0) {
    currentGroupId = groups[0].id;
    setActiveGroupId(currentGroupId);
  }
}

function mountLayout() {
  rootElement.innerHTML = "";

  const layout = document.createElement("div");
  layout.className = "chat-layout";

  const sidebar = document.createElement("aside");
  sidebar.className = "character-sidebar";
  sidebar.id = "chatSidebar";

  const main = document.createElement("section");
  main.className = "chat-main";
  main.id = "chatMain";

  layout.appendChild(sidebar);
  layout.appendChild(main);
  rootElement.appendChild(layout);

  renderSidebar();
  renderChatMain();
}

function renderSidebar() {
  const sidebar = document.getElementById("chatSidebar");
  if (!sidebar) return;

  sidebar.innerHTML = "";

  const modeBox = document.createElement("div");
  modeBox.style.display = "grid";
  modeBox.style.gap = "8px";
  modeBox.style.marginBottom = "12px";

  const singleButton = createButton("单聊", chatMode === "single" ? "primary-button" : "secondary-button");
  singleButton.style.minHeight = "32px";
  singleButton.style.padding = "0 8px";

  const groupButton = createButton("群聊", chatMode === "group" ? "primary-button" : "secondary-button");
  groupButton.style.minHeight = "32px";
  groupButton.style.padding = "0 8px";

  singleButton.addEventListener("click", async () => {
    if (isSending) {
      await showAlert("当前回复还没结束，请先停止或等待完成。");
      return;
    }

    chatMode = "single";
    renderSidebar();
    renderChatMain();
  });

  groupButton.addEventListener("click", async () => {
    if (isSending) {
      await showAlert("当前回复还没结束，请先停止或等待完成。");
      return;
    }

    chatMode = "group";
    renderSidebar();
    renderChatMain();
  });

  modeBox.appendChild(singleButton);
  modeBox.appendChild(groupButton);
  sidebar.appendChild(modeBox);

  if (chatMode === "single") {
    renderSingleSidebar(sidebar);
  } else {
    renderGroupSidebar(sidebar);
  }
}

function renderSingleSidebar(sidebar) {
  characters.forEach((character) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "character-list-item";
    item.classList.toggle("active", character.id === currentCharacterId);

    const avatar = createAvatar(character, 42);

    const name = document.createElement("div");
    name.className = "character-name-small";
    name.textContent = character.name || "未命名";

    item.appendChild(avatar);
    item.appendChild(name);

    item.addEventListener("click", async () => {
      if (isSending) {
        await showAlert("当前回复还没结束，请先停止或等待完成。");
        return;
      }

      currentCharacterId = character.id;
      setActiveCharacterId(character.id);
      renderSidebar();
      renderChatMain();
    });

    sidebar.appendChild(item);
  });
}

function renderGroupSidebar(sidebar) {
  const createGroupButton = createButton("新建群", "primary-button");
  createGroupButton.style.minHeight = "32px";
  createGroupButton.style.padding = "0 8px";
  createGroupButton.style.marginBottom = "10px";
  createGroupButton.addEventListener("click", showCreateGroupPanel);
  sidebar.appendChild(createGroupButton);

  if (groups.length === 0) {
    const empty = document.createElement("div");
    empty.style.color = "var(--text-secondary)";
    empty.style.fontSize = "12px";
    empty.style.lineHeight = "1.5";
    empty.style.textAlign = "center";
    empty.textContent = "暂无群聊";
    sidebar.appendChild(empty);
    return;
  }

  groups.forEach((group) => {
    const members = getGroupMembers(group);

    const item = document.createElement("button");
    item.type = "button";
    item.className = "character-list-item";
    item.classList.toggle("active", group.id === currentGroupId);

    const avatar = createAvatar(group, 42);

    const name = document.createElement("div");
    name.className = "character-name-small";
    name.textContent = group.name || "未命名群聊";

    const count = document.createElement("div");
    count.style.fontSize = "11px";
    count.style.color = "var(--text-secondary)";
    count.textContent = `${members.length} 位`;

    item.appendChild(avatar);
    item.appendChild(name);
    item.appendChild(count);

    item.addEventListener("click", async () => {
      if (isSending) {
        await showAlert("当前回复还没结束，请先停止或等待完成。");
        return;
      }

      currentGroupId = group.id;
      setActiveGroupId(group.id);
      renderSidebar();
      renderChatMain();
    });

    sidebar.appendChild(item);
  });
}

function renderChatMain() {
  const main = document.getElementById("chatMain");
  if (!main) return;

  main.innerHTML = "";
  main.style.backgroundImage = "";

  if (chatMode === "single") {
    renderSingleChatMain(main);
  } else {
    renderGroupChatMain(main);
  }
}

function renderSingleChatMain(main) {
  const character = getCurrentCharacter();

  if (!character) {
    main.appendChild(createEmptyState("没有可聊天的角色"));
    return;
  }

  if (character.chatBackground) {
    main.style.backgroundImage = `linear-gradient(rgba(255,255,255,0.72), rgba(255,255,255,0.72)), url("${character.chatBackground}")`;
    main.style.backgroundSize = "cover";
    main.style.backgroundPosition = "center";
  }

  main.appendChild(createTopbar({
    title: character.name || "未命名角色",
    status: buildSingleStatusText(character),
    rightText: "配置",
    onRightClick: () => showApiInfoPanel(character)
  }));

  const messageList = document.createElement("div");
  messageList.className = "message-list";
  messageList.id = "messageList";
  main.appendChild(messageList);

  main.appendChild(createInputArea("输入消息", sendUserMessage));
  renderSingleMessages();
}

function renderGroupChatMain(main) {
  const group = getCurrentGroup();

  if (!group) {
    const panel = document.createElement("div");
    panel.style.padding = "16px";
    panel.appendChild(createEmptyState("还没有群聊"));

    const createGroupButton = createButton("新建群聊", "primary-button");
    createGroupButton.style.width = "100%";
    createGroupButton.addEventListener("click", showCreateGroupPanel);

    panel.appendChild(createGroupButton);
    main.appendChild(panel);
    return;
  }

  const members = getGroupMembers(group);

  main.appendChild(createTopbar({
    title: group.name || "未命名群聊",
    status: `群成员 ${members.length} 位 · 记忆 ${Array.isArray(group.memories) ? group.memories.length : 0} 条`,
    rightText: "群设置",
    onRightClick: showGroupManagePanel
  }));

  const messageList = document.createElement("div");
  messageList.className = "message-list";
  messageList.id = "messageList";
  main.appendChild(messageList);

  main.appendChild(createInputArea("在群聊中发言", sendGroupUserMessage));
  renderGroupMessages();
}

function createTopbar({ title, status, rightText, onRightClick }) {
  const topbar = document.createElement("header");
  topbar.className = "chat-topbar";

  const titleBox = document.createElement("div");
  titleBox.className = "chat-title";

  const name = document.createElement("div");
  name.className = "chat-name";
  name.textContent = title;

  const statusElement = document.createElement("div");
  statusElement.className = "chat-status";
  statusElement.id = "chatStatus";
  statusElement.textContent = status;

  titleBox.appendChild(name);
  titleBox.appendChild(statusElement);

  const rightButton = createButton(rightText, "secondary-button");
  rightButton.style.minHeight = "32px";
  rightButton.style.padding = "0 12px";
  rightButton.addEventListener("click", onRightClick);

  topbar.appendChild(titleBox);
  topbar.appendChild(rightButton);

  return topbar;
}

function createInputArea(placeholder, onSend) {
  const inputArea = document.createElement("div");
  inputArea.className = "chat-input-area";

  const toolButton = document.createElement("button");
  toolButton.type = "button";
  toolButton.className = "icon-button";
  toolButton.title = "工具栏";
  toolButton.appendChild(createSvgIcon("tool"));
  toolButton.addEventListener("click", showToolPanel);

  const textarea = document.createElement("textarea");
  textarea.className = "chat-input";
  textarea.id = "chatInput";
  textarea.placeholder = placeholder;
  textarea.rows = 1;

  const sendButton = document.createElement("button");
  sendButton.type = "button";
  sendButton.className = "primary-button";
  sendButton.id = "sendButton";
  sendButton.style.padding = "0 14px";
  sendButton.textContent = "发送";

  sendButton.addEventListener("click", () => {
    if (isSending) {
      stopCurrentResponse();
      return;
    }

    onSend();
  });

  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  });

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      if (!isSending) {
        onSend();
      }
    }
  });

  inputArea.appendChild(toolButton);
  inputArea.appendChild(textarea);
  inputArea.appendChild(sendButton);

  updateSendButton();

  return inputArea;
}

function buildSingleStatusText(character) {
  const apiConfig = getResolvedCharacterApiConfig(character);
  const now = getNowInfo();
  const memoryCount = Array.isArray(character.memories) ? character.memories.length : 0;
  const ttsText = canUseTts(character) ? "语音可用" : "语音关闭";

  if (!apiConfig.endpoint || !apiConfig.model) {
    return `未配置 API · 记忆 ${memoryCount} 条 · ${ttsText} · ${now.localTime.slice(0, 5)}`;
  }

  return `在线 · ${apiConfig.model} · 记忆 ${memoryCount} 条 · ${ttsText} · ${now.localTime.slice(0, 5)}`;
}

function renderSingleMessages() {
  const messageList = document.getElementById("messageList");
  if (!messageList) return;

  const character = getCurrentCharacter();
  const history = Array.isArray(character?.chatHistory) ? character.chatHistory : [];
  const visibleHistory = history.filter((message) => !message.hidden);

  messageList.innerHTML = "";

  if (visibleHistory.length === 0) {
    messageList.appendChild(createEmptyState("还没有消息"));
    return;
  }

  history.forEach((message, index) => {
    if (message.hidden) return;

    messageList.appendChild(createMessageElement({
      message,
      index,
      avatarEntity: character,
      speakerName: message.role === "assistant" ? character.name : "用户",
      speakerCharacter: message.role === "assistant" ? character : null,
      menuType: "single"
    }));
  });

  scrollMessagesToBottom();
}

function renderGroupMessages() {
  const messageList = document.getElementById("messageList");
  if (!messageList) return;

  const group = getCurrentGroup();
  const history = Array.isArray(group?.chatHistory) ? group.chatHistory : [];
  const visibleHistory = history.filter((message) => !message.hidden);

  messageList.innerHTML = "";

  if (visibleHistory.length === 0) {
    messageList.appendChild(createEmptyState("群聊还没有消息"));
    return;
  }

  history.forEach((message, index) => {
    if (message.hidden) return;

    const speaker = message.role === "assistant"
      ? characters.find((character) => character.id === message.characterId)
      : null;

    messageList.appendChild(createMessageElement({
      message,
      index,
      avatarEntity: speaker,
      speakerName: message.role === "assistant" ? message.characterName : "用户",
      speakerCharacter: speaker,
      menuType: "group"
    }));
  });

  scrollMessagesToBottom();
}

function createMessageElement({ message, index, avatarEntity, speakerName, speakerCharacter, menuType }) {
  const row = document.createElement("div");
  row.className = `message-row ${message.role === "assistant" ? "ai" : "user"}`;
  row.dataset.messageIndex = String(index);

  if (message.role === "assistant") {
    row.appendChild(createAvatar(avatarEntity || { name: speakerName }, 34));
  }

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (message.role === "assistant" && speakerName) {
    const speaker = document.createElement("div");
    speaker.style.fontSize = "12px";
    speaker.style.fontWeight = "700";
    speaker.style.marginBottom = "4px";
    speaker.style.opacity = "0.72";
    speaker.textContent = speakerName;
    bubble.appendChild(speaker);
  }

  if (message.role === "assistant" && message.thinking) {
    const thinkingButton = document.createElement("button");
    thinkingButton.type = "button";
    thinkingButton.className = "thinking-toggle";
    thinkingButton.textContent = "查看思维 ▶";

    const thinkingContent = document.createElement("div");
    thinkingContent.className = "thinking-content hidden";
    thinkingContent.textContent = message.thinking;

    thinkingButton.addEventListener("click", () => {
      const hidden = thinkingContent.classList.toggle("hidden");
      thinkingButton.textContent = hidden ? "查看思维 ▶" : "收起思维 ▼";
    });

    bubble.appendChild(thinkingButton);
    bubble.appendChild(thinkingContent);
  }

  if (message.image) {
    const img = document.createElement("img");
    img.src = message.image;
    img.alt = "发送的图片";
    img.style.maxWidth = "180px";
    img.style.borderRadius = "12px";
    img.style.marginBottom = message.content ? "8px" : "0";
    bubble.appendChild(img);
  }

  const content = document.createElement("div");
  content.textContent = message.content || "";
  bubble.appendChild(content);

  if (message.role === "assistant" && speakerCharacter) {
    const voiceRow = document.createElement("div");
    voiceRow.style.display = "flex";
    voiceRow.style.gap = "8px";
    voiceRow.style.marginTop = "8px";
    voiceRow.style.flexWrap = "wrap";

    const playButton = createButton("播放语音", "secondary-button");
    playButton.style.minHeight = "28px";
    playButton.style.padding = "0 10px";
    playButton.disabled = !canUseTts(speakerCharacter);
    playButton.addEventListener("click", async () => {
      try {
        await speakCharacterText(speakerCharacter, message.content || "");
      } catch (error) {
        await showAlert(`语音播放失败：${error.message || "未知错误"}`);
      }
    });

    const stopButton = createButton("停止语音", "secondary-button");
    stopButton.style.minHeight = "28px";
    stopButton.style.padding = "0 10px";
    stopButton.addEventListener("click", () => {
      stopTts();
    });

    voiceRow.appendChild(playButton);
    voiceRow.appendChild(stopButton);
    bubble.appendChild(voiceRow);
  }

  const time = document.createElement("div");
  time.style.fontSize = "11px";
  time.style.opacity = "0.62";
  time.style.marginTop = "5px";
  time.textContent = formatMessageTime(message.createdAt);
  bubble.appendChild(time);

  bubble.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showMessageMenu(event.clientX, event.clientY, index, menuType);
  });

  bubble.addEventListener("dblclick", () => {
    const rect = bubble.getBoundingClientRect();
    showMessageMenu(rect.left + 20, rect.top + 20, index, menuType);
  });

  row.appendChild(bubble);

  return row;
}

function formatMessageTime(timestamp) {
  if (!timestamp) return "";

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${hour}:${minute}`;
}

function scrollMessagesToBottom() {
  const messageList = document.getElementById("messageList");
  if (!messageList) return;

  requestAnimationFrame(() => {
    messageList.scrollTop = messageList.scrollHeight;
  });
}

function updateSendButton() {
  const sendButton = document.getElementById("sendButton");
  if (!sendButton) return;

  sendButton.textContent = isSending ? "停止" : "发送";
}

function updateStatus(text) {
  const status = document.getElementById("chatStatus");
  if (!status) return;

  status.textContent = text;
}

function closeContextMenu() {
  const oldMenu = document.getElementById("chatContextMenu");

  if (oldMenu) {
    oldMenu.remove();
  }
}

function showMessageMenu(x, y, index, menuType) {
  closeContextMenu();

  const message = menuType === "group"
    ? getCurrentGroup()?.chatHistory?.[index]
    : getCurrentCharacter()?.chatHistory?.[index];

  if (!message) return;

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.id = "chatContextMenu";

  if (message.role === "assistant") {
    menu.appendChild(createMenuButton("播放语音", () => playMessageVoice(message, menuType)));
    menu.appendChild(createMenuButton("停止语音", stopTts));
    menu.appendChild(createMenuButton("查看思维", async () => {
      await showAlert(message.thinking || "这条消息没有思维内容。");
    }));
    menu.appendChild(createMenuButton("删除", () => deleteMessage(index, menuType)));

    if (menuType === "single") {
      menu.appendChild(createMenuButton("重新生成", () => regenerateSingleFromMessage(index)));
      menu.appendChild(createMenuButton("续写", () => continueSingleFromMessage(index)));
    }
  } else {
    menu.appendChild(createMenuButton("编辑", () => editUserMessage(index, menuType)));
    menu.appendChild(createMenuButton("删除", () => deleteMessage(index, menuType)));

    if (menuType === "single") {
      menu.appendChild(createMenuButton("基于此重新回复", () => replySingleFromUserMessage(index)));
    }

    if (menuType === "group") {
      menu.appendChild(createMenuButton("让群成员回复", () => showGroupSpeakerPicker()));
    }
  }

  document.body.appendChild(menu);

  const menuRect = menu.getBoundingClientRect();
  const maxLeft = window.innerWidth - menuRect.width - 8;
  const maxTop = window.innerHeight - menuRect.height - 8;

  menu.style.left = `${Math.max(8, Math.min(x, maxLeft))}px`;
  menu.style.top = `${Math.max(8, Math.min(y, maxTop))}px`;

  window.setTimeout(() => {
    document.addEventListener("click", closeContextMenu, { once: true });
  }, 0);
}

function createMenuButton(text, onClick) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = text;

  button.addEventListener("click", () => {
    closeContextMenu();

    if (typeof onClick === "function") {
      onClick();
    }
  });

  return button;
}

async function playMessageVoice(message, menuType) {
  const character = menuType === "group"
    ? characters.find((item) => item.id === message.characterId)
    : getCurrentCharacter();

  if (!character) {
    await showAlert("找不到发言角色");
    return;
  }

  try {
    await speakCharacterText(character, message.content || "");
  } catch (error) {
    await showAlert(`语音播放失败：${error.message || "未知错误"}`);
  }
}

async function sendUserMessage() {
  const input = document.getElementById("chatInput");
  const character = getCurrentCharacter();

  if (!input || !character) return;

  const text = input.value.trim();

  if (!text) return;

  input.value = "";
  input.style.height = "auto";

  const userMessage = {
    id: createId("msg"),
    role: "user",
    content: text,
    createdAt: getNowInfo().timestamp
  };

  const nextCharacter = {
    ...character,
    chatHistory: [
      ...(Array.isArray(character.chatHistory) ? character.chatHistory : []),
      userMessage
    ],
    updatedAt: getNowInfo().timestamp
  };

  saveCurrentCharacter(nextCharacter);
  renderSingleMessages();

  await requestSingleAiReply({
    latestUserMessage: text
  });
}

async function sendGroupUserMessage() {
  const input = document.getElementById("chatInput");
  const group = getCurrentGroup();

  if (!input || !group) return;

  const text = input.value.trim();

  if (!text) return;

  input.value = "";
  input.style.height = "auto";

  const userMessage = {
    id: createId("group_msg"),
    role: "user",
    content: text,
    createdAt: getNowInfo().timestamp
  };

  const nextGroup = {
    ...group,
    chatHistory: [
      ...(Array.isArray(group.chatHistory) ? group.chatHistory : []),
      userMessage
    ],
    updatedAt: getNowInfo().timestamp
  };

  saveCurrentGroup(nextGroup);
  renderGroupMessages();

  const members = getGroupMembers(nextGroup);

  if (members.length === 0) {
    await showAlert("这个群聊还没有 AI 成员，请先在群设置里添加。");
    return;
  }

  const settings = getSettings();

  if (settings.groupChat?.defaultReplyMode === "all") {
    await requestAllGroupMembersReply(text);
  } else {
    await requestGroupAiReply(members[0].id, {
      latestUserMessage: text
    });
  }
}

async function requestSingleAiReply(options = {}) {
  if (isSending) return;

  const character = getCurrentCharacter();

  if (!character) return;

  const apiConfig = getResolvedCharacterApiConfig(character);

  if (!apiConfig.endpoint || !apiConfig.model) {
    await showAlert("缺少 API 地址或模型名。请先到设置里填写，或在角色管理里给当前角色单独填写。");
    return;
  }

  isSending = true;
  updateSendButton();
  updateStatus("正在回复...");

  activeAbortController = new AbortController();

  const aiMessage = {
    id: createId("msg"),
    role: "assistant",
    content: "",
    thinking: "",
    createdAt: getNowInfo().timestamp
  };

  let workingCharacter = getCurrentCharacter();

  workingCharacter = {
    ...workingCharacter,
    chatHistory: [
      ...(Array.isArray(workingCharacter.chatHistory) ? workingCharacter.chatHistory : []),
      aiMessage
    ],
    updatedAt: getNowInfo().timestamp
  };

  saveCurrentCharacter(workingCharacter);
  renderSingleMessages();

  let replyCompleted = false;
  let finalAiText = "";

  try {
    await sendCharacterMessage({
      character: workingCharacter,
      chatHistory: options.chatHistory || workingCharacter.chatHistory.slice(0, -1),
      onChunk(chunk, fullContent) {
        finalAiText = fullContent;
        updateLastSingleAssistantMessage({
          content: fullContent
        });
      },
      onThinking(chunk, fullThinking) {
        updateLastSingleAssistantMessage({
          thinking: fullThinking
        });
      },
      onDone(result) {
        finalAiText = result.content;
        updateLastSingleAssistantMessage({
          content: result.content,
          thinking: result.thinking
        });
        replyCompleted = true;
      },
      onError(error) {
        throw error;
      },
      signal: activeAbortController.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      updateStatus("已停止");
    } else {
      updateLastSingleAssistantMessage({
        content: `请求失败：${error.message || "未知错误"}`
      });
      updateStatus("回复失败");
    }
  } finally {
    isSending = false;
    activeAbortController = null;
    updateSendButton();

    if (replyCompleted) {
      await runSingleMemoryAfterReply();
      await handleVoiceAfterSingleReply({
        characterId: character.id,
        latestUserMessage: options.latestUserMessage || "",
        latestAiMessage: finalAiText
      });

      void handleAutoMomentAfterSingleReply({
        characterId: character.id,
        latestUserMessage: options.latestUserMessage || "",
        latestAiMessage: finalAiText
      });
    }

    refreshDataFromStorage();

    const latestCharacter = getCurrentCharacter();

    if (latestCharacter) {
      updateStatus(buildSingleStatusText(latestCharacter));
    }

    renderSidebar();
    renderSingleMessages();
  }
}

async function requestGroupAiReply(characterId, options = {}) {
  if (isSending) return;

  const group = getCurrentGroup();
  const speaker = characters.find((character) => character.id === characterId);

  if (!group || !speaker) return;

  const apiConfig = getResolvedCharacterApiConfig(speaker);

  if (!apiConfig.endpoint || !apiConfig.model) {
    await showAlert(`「${speaker.name || "该角色"}」缺少 API 地址或模型名。请先在角色管理或设置里填写。`);
    return;
  }

  isSending = true;
  updateSendButton();
  updateStatus(`${speaker.name || "群成员"} 正在回复...`);

  activeAbortController = new AbortController();

  const aiMessage = {
    id: createId("group_msg"),
    role: "assistant",
    characterId: speaker.id,
    characterName: speaker.name || "未命名角色",
    content: "",
    thinking: "",
    createdAt: getNowInfo().timestamp
  };

  let workingGroup = getCurrentGroup();

  workingGroup = {
    ...workingGroup,
    chatHistory: [
      ...(Array.isArray(workingGroup.chatHistory) ? workingGroup.chatHistory : []),
      aiMessage
    ],
    updatedAt: getNowInfo().timestamp
  };

  saveCurrentGroup(workingGroup);
  renderGroupMessages();

  let replyCompleted = false;
  let finalAiText = "";

  try {
    const groupForApi = options.chatHistory
      ? {
          ...workingGroup,
          chatHistory: options.chatHistory
        }
      : workingGroup;

    await sendGroupCharacterMessage({
      group: groupForApi,
      character: speaker,
      members: getGroupMembers(workingGroup),
      onChunk(chunk, fullContent) {
        finalAiText = fullContent;
        updateLastGroupAssistantMessage(aiMessage.id, {
          content: fullContent
        });
      },
      onThinking(chunk, fullThinking) {
        updateLastGroupAssistantMessage(aiMessage.id, {
          thinking: fullThinking
        });
      },
      onDone(result) {
        finalAiText = result.content;
        updateLastGroupAssistantMessage(aiMessage.id, {
          content: result.content,
          thinking: result.thinking
        });
        replyCompleted = true;
      },
      onError(error) {
        throw error;
      },
      signal: activeAbortController.signal
    });
  } catch (error) {
    if (error.name === "AbortError") {
      updateStatus("已停止");
    } else {
      updateLastGroupAssistantMessage(aiMessage.id, {
        content: `请求失败：${error.message || "未知错误"}`
      });
      updateStatus("回复失败");
    }
  } finally {
    isSending = false;
    activeAbortController = null;
    updateSendButton();

    if (replyCompleted) {
      await runGroupMemoryAfterReply();
      await handleVoiceAfterGroupReply({
        characterId: speaker.id,
        latestUserMessage: options.latestUserMessage || "",
        latestAiMessage: finalAiText
      });

      void handleAutoMomentAfterGroupReply({
        characterId: speaker.id,
        latestUserMessage: options.latestUserMessage || "",
        latestAiMessage: finalAiText
      });
    }

    refreshDataFromStorage();

    const latestGroup = getCurrentGroup();
    const members = latestGroup ? getGroupMembers(latestGroup) : [];

    if (latestGroup) {
      updateStatus(`群成员 ${members.length} 位 · 记忆 ${Array.isArray(latestGroup.memories) ? latestGroup.memories.length : 0} 条`);
    }

    renderSidebar();
    renderGroupMessages();
  }
}

async function handleVoiceAfterSingleReply({ characterId, latestUserMessage, latestAiMessage }) {
  const character = characters.find((item) => item.id === characterId) || getCurrentCharacter();

  if (!character || !latestAiMessage) return;

  try {
    await maybeSpeakAfterReply({
      character,
      latestUserMessage,
      latestAiMessage,
      chatHistory: character.chatHistory || [],
      scene: "single-chat"
    });
  } catch (error) {
    console.warn("TTS 自动处理失败：", error);
  }
}

async function handleVoiceAfterGroupReply({ characterId, latestUserMessage, latestAiMessage }) {
  const character = characters.find((item) => item.id === characterId);

  if (!character || !latestAiMessage) return;

  try {
    await maybeSpeakAfterReply({
      character,
      latestUserMessage,
      latestAiMessage,
      chatHistory: getCurrentGroup()?.chatHistory || [],
      scene: "group-chat"
    });
  } catch (error) {
    console.warn("群聊 TTS 自动处理失败：", error);
  }
}

async function handleAutoMomentAfterSingleReply({ characterId, latestUserMessage, latestAiMessage }) {
  try {
    const character = characters.find((item) => item.id === characterId) || getCurrentCharacter();

    await maybeAutoCreateMomentAfterChatReply({
      characterId,
      latestUserMessage,
      latestAiMessage,
      chatHistory: character?.chatHistory || [],
      scene: "single-chat"
    });
  } catch (error) {
    console.warn("自动朋友圈失败：", error);
  }
}

async function handleAutoMomentAfterGroupReply({ characterId, latestUserMessage, latestAiMessage }) {
  try {
    await maybeAutoCreateMomentAfterChatReply({
      characterId,
      latestUserMessage,
      latestAiMessage,
      chatHistory: getCurrentGroup()?.chatHistory || [],
      scene: "group-chat"
    });
  } catch (error) {
    console.warn("群聊自动朋友圈失败：", error);
  }
}

async function requestAllGroupMembersReply(latestUserMessage = "") {
  const group = getCurrentGroup();

  if (!group) return;

  const settings = getSettings();
  const members = getGroupMembers(group);
  const maxAutoReplies = Math.max(1, Number(settings.groupChat?.maxAutoReplies || 3));
  const selectedMembers = members.slice(0, maxAutoReplies);

  if (selectedMembers.length === 0) {
    await showAlert("这个群聊还没有 AI 成员。");
    return;
  }

  for (const member of selectedMembers) {
    if (isSending) break;

    await requestGroupAiReply(member.id, {
      latestUserMessage
    });
  }
}

function updateLastSingleAssistantMessage(patch) {
  const character = getCurrentCharacter();

  if (!character) return;

  const history = Array.isArray(character.chatHistory) ? [...character.chatHistory] : [];

  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (history[index].role === "assistant") {
      history[index] = {
        ...history[index],
        ...patch,
        updatedAt: getNowInfo().timestamp
      };
      break;
    }
  }

  saveCurrentCharacter({
    ...character,
    chatHistory: history,
    updatedAt: getNowInfo().timestamp
  });

  renderSingleMessages();
}

function updateLastGroupAssistantMessage(messageId, patch) {
  const group = getCurrentGroup();

  if (!group) return;

  const history = Array.isArray(group.chatHistory) ? [...group.chatHistory] : [];

  const nextHistory = history.map((message) => {
    if (message.id !== messageId) {
      return message;
    }

    return {
      ...message,
      ...patch,
      updatedAt: getNowInfo().timestamp
    };
  });

  saveCurrentGroup({
    ...group,
    chatHistory: nextHistory,
    updatedAt: getNowInfo().timestamp
  });

  renderGroupMessages();
}

async function runSingleMemoryAfterReply() {
  const character = getCurrentCharacter();

  if (!character) return;

  updateStatus("正在整理记忆...");

  try {
    await processCharacterMemoryAfterReply(character);
  } catch (error) {
    console.warn("记忆处理失败：", error);
  }
}

async function runGroupMemoryAfterReply() {
  const group = getCurrentGroup();

  if (!group) return;

  updateStatus("正在整理群聊记忆...");

  try {
    await processGenericMemoryAfterReply({
      target: group,
      character: getGroupMembers(group)[0] || null,
      saveTarget(nextGroup) {
        upsertGroup(nextGroup);
      }
    });
  } catch (error) {
    console.warn("群聊记忆处理失败：", error);
  }
}

function stopCurrentResponse() {
  if (activeAbortController) {
    activeAbortController.abort();
  }

  isSending = false;
  updateSendButton();
}

function deleteMessage(index, menuType) {
  if (menuType === "group") {
    const group = getCurrentGroup();

    if (!group) return;

    const history = Array.isArray(group.chatHistory) ? [...group.chatHistory] : [];
    history.splice(index, 1);

    saveCurrentGroup({
      ...group,
      chatHistory: history,
      updatedAt: getNowInfo().timestamp
    });

    renderGroupMessages();
    return;
  }

  const character = getCurrentCharacter();

  if (!character) return;

  const history = Array.isArray(character.chatHistory) ? [...character.chatHistory] : [];
  history.splice(index, 1);

  saveCurrentCharacter({
    ...character,
    chatHistory: history,
    updatedAt: getNowInfo().timestamp
  });

  renderSingleMessages();
}

async function editUserMessage(index, menuType) {
  if (menuType === "group") {
    const group = getCurrentGroup();

    if (!group) return;

    const history = Array.isArray(group.chatHistory) ? [...group.chatHistory] : [];
    const message = history[index];

    if (!message || message.role !== "user") return;

    const nextText = await showPrompt("编辑消息：", message.content || "");

    if (nextText === null) return;

    history[index] = {
      ...message,
      content: nextText.trim(),
      updatedAt: getNowInfo().timestamp
    };

    saveCurrentGroup({
      ...group,
      chatHistory: history,
      updatedAt: getNowInfo().timestamp
    });

    renderGroupMessages();
    return;
  }

  const character = getCurrentCharacter();

  if (!character) return;

  const history = Array.isArray(character.chatHistory) ? [...character.chatHistory] : [];
  const message = history[index];

  if (!message || message.role !== "user") return;

  const nextText = await showPrompt("编辑消息：", message.content || "");

  if (nextText === null) return;

  history[index] = {
    ...message,
    content: nextText.trim(),
    updatedAt: getNowInfo().timestamp
  };

  saveCurrentCharacter({
    ...character,
    chatHistory: history,
    updatedAt: getNowInfo().timestamp
  });

  renderSingleMessages();
}

async function replySingleFromUserMessage(index) {
  const character = getCurrentCharacter();

  if (!character) return;

  let history = Array.isArray(character.chatHistory) ? [...character.chatHistory] : [];
  history = history.slice(0, index + 1);

  saveCurrentCharacter({
    ...character,
    chatHistory: history,
    updatedAt: getNowInfo().timestamp
  });

  renderSingleMessages();

  await requestSingleAiReply({
    chatHistory: history,
    latestUserMessage: history[history.length - 1]?.content || ""
  });
}

async function regenerateSingleFromMessage(index) {
  const character = getCurrentCharacter();

  if (!character) return;

  let history = Array.isArray(character.chatHistory) ? [...character.chatHistory] : [];

  if (!history[index] || history[index].role !== "assistant") return;

  history = history.slice(0, index);

  saveCurrentCharacter({
    ...character,
    chatHistory: history,
    updatedAt: getNowInfo().timestamp
  });

  renderSingleMessages();

  await requestSingleAiReply({
    chatHistory: history,
    latestUserMessage: history[history.length - 1]?.content || ""
  });
}

async function continueSingleFromMessage(index) {
  const character = getCurrentCharacter();

  if (!character) return;

  let history = Array.isArray(character.chatHistory) ? [...character.chatHistory] : [];
  history = history.slice(0, index + 1);

  history.push({
    id: createId("msg"),
    role: "user",
    content: "请自然续写上一条回复。",
    createdAt: getNowInfo().timestamp,
    hidden: true
  });

  saveCurrentCharacter({
    ...character,
    chatHistory: history,
    updatedAt: getNowInfo().timestamp
  });

  renderSingleMessages();

  await requestSingleAiReply({
    chatHistory: history,
    latestUserMessage: "请自然续写上一条回复。"
  });
}

function showModal(titleText, bodyElement) {
  closeModal();

  const mask = document.createElement("div");
  mask.className = "modal-mask";
  mask.id = "chatModalMask";

  const panel = document.createElement("div");
  panel.className = "modal-panel";

  const titleRow = document.createElement("div");
  titleRow.style.display = "flex";
  titleRow.style.alignItems = "center";
  titleRow.style.justifyContent = "space-between";
  titleRow.style.gap = "12px";
  titleRow.style.marginBottom = "14px";

  const title = document.createElement("h3");
  title.className = "section-title";
  title.style.margin = "0";
  title.textContent = titleText;

  const closeButton = createButton("关闭", "secondary-button");
  closeButton.addEventListener("click", closeModal);

  titleRow.appendChild(title);
  titleRow.appendChild(closeButton);

  panel.appendChild(titleRow);
  panel.appendChild(bodyElement);
  mask.appendChild(panel);

  mask.addEventListener("click", (event) => {
    if (event.target === mask) {
      closeModal();
    }
  });

  document.body.appendChild(mask);
}

function closeModal() {
  const old = document.getElementById("chatModalMask");

  if (old) {
    old.remove();
  }
}

function showToolPanel() {
  if (chatMode === "group") {
    showGroupToolPanel();
  } else {
    showSingleToolPanel();
  }
}

function showSingleToolPanel() {
  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "10px";

  const uploadImageButton = createButton("发送图片", "secondary-button");
  uploadImageButton.addEventListener("click", handleSendImage);

  const stopVoiceButton = createButton("停止语音", "secondary-button");
  stopVoiceButton.addEventListener("click", stopTts);

  const clearButton = createButton("清空当前上下文", "secondary-button");
  clearButton.addEventListener("click", async () => {
    const confirmed = await showConfirm("确定清空当前角色的聊天记录吗？记忆不会删除。");

    if (!confirmed) return;

    const character = getCurrentCharacter();

    saveCurrentCharacter({
      ...character,
      chatHistory: [],
      lastMemoryIndex: 0,
      updatedAt: getNowInfo().timestamp
    });

    closeModal();
    renderSingleMessages();
  });

  const memoryButton = createButton("记忆管理", "secondary-button");
  memoryButton.addEventListener("click", showSingleMemoryPanel);

  const mcpButton = createButton("MCP 工具列表", "secondary-button");
  mcpButton.addEventListener("click", showMcpPanel);

  const apiButton = createButton("API 配置查看", "secondary-button");
  apiButton.addEventListener("click", () => {
    showApiInfoPanel(getCurrentCharacter());
  });

  body.appendChild(uploadImageButton);
  body.appendChild(stopVoiceButton);
  body.appendChild(clearButton);
  body.appendChild(memoryButton);
  body.appendChild(mcpButton);
  body.appendChild(apiButton);

  showModal("工具栏", body);
}

function showGroupToolPanel() {
  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "10px";

  const speakerButton = createButton("指定群成员回复", "secondary-button");
  speakerButton.addEventListener("click", showGroupSpeakerPicker);

  const allReplyButton = createButton("所有成员轮流回复", "secondary-button");
  allReplyButton.addEventListener("click", async () => {
    closeModal();
    await requestAllGroupMembersReply();
  });

  const stopVoiceButton = createButton("停止语音", "secondary-button");
  stopVoiceButton.addEventListener("click", stopTts);

  const manageButton = createButton("群设置 / 拉人", "secondary-button");
  manageButton.addEventListener("click", showGroupManagePanel);

  const clearButton = createButton("清空群聊上下文", "secondary-button");
  clearButton.addEventListener("click", async () => {
    const group = getCurrentGroup();

    if (!group) return;

    const confirmed = await showConfirm("确定清空这个群聊的聊天记录吗？群记忆不会删除。");

    if (!confirmed) return;

    saveCurrentGroup({
      ...group,
      chatHistory: [],
      lastMemoryIndex: 0,
      updatedAt: getNowInfo().timestamp
    });

    closeModal();
    renderGroupMessages();
  });

  const memoryButton = createButton("群聊记忆管理", "secondary-button");
  memoryButton.addEventListener("click", showGroupMemoryPanel);

  const mcpButton = createButton("MCP 工具列表", "secondary-button");
  mcpButton.addEventListener("click", showMcpPanel);

  body.appendChild(speakerButton);
  body.appendChild(allReplyButton);
  body.appendChild(stopVoiceButton);
  body.appendChild(manageButton);
  body.appendChild(clearButton);
  body.appendChild(memoryButton);
  body.appendChild(mcpButton);

  showModal("群聊工具", body);
}

async function handleSendImage() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";

  input.addEventListener("change", async () => {
    try {
      const file = input.files[0];
      const base64 = await readFileAsBase64(file, {
        imageOnly: true,
        maxSizeMB: 8
      });

      const caption = await showPrompt("给这张图片加一句说明，方便 AI 理解：", "请看这张图片。");

      if (caption === null) return;

      if (chatMode === "group") {
        const group = getCurrentGroup();

        saveCurrentGroup({
          ...group,
          chatHistory: [
            ...(Array.isArray(group.chatHistory) ? group.chatHistory : []),
            {
              id: createId("group_msg"),
              role: "user",
              content: caption.trim() || "请看这张图片。",
              image: base64,
              createdAt: getNowInfo().timestamp
            }
          ],
          updatedAt: getNowInfo().timestamp
        });

        closeModal();
        renderGroupMessages();
        showGroupSpeakerPicker();
        return;
      }

      const character = getCurrentCharacter();

      saveCurrentCharacter({
        ...character,
        chatHistory: [
          ...(Array.isArray(character.chatHistory) ? character.chatHistory : []),
          {
            id: createId("msg"),
            role: "user",
            content: caption.trim() || "请看这张图片。",
            image: base64,
            createdAt: getNowInfo().timestamp
          }
        ],
        updatedAt: getNowInfo().timestamp
      });

      closeModal();
      renderSingleMessages();

      await requestSingleAiReply({
        latestUserMessage: caption.trim() || "请看这张图片。"
      });
    } catch (error) {
      await showAlert(error.message || "图片发送失败");
    }
  });

  input.click();
}

function showCreateGroupPanel() {
  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "12px";

  const nameInput = document.createElement("input");
  nameInput.className = "text-input";
  nameInput.placeholder = "群聊名称";
  nameInput.value = "新群聊";

  const memberBox = document.createElement("div");
  memberBox.style.display = "grid";
  memberBox.style.gap = "8px";

  characters.forEach((character) => {
    const label = document.createElement("label");
    label.className = "settings-row";

    const text = document.createElement("div");
    text.innerHTML = `
      <div class="settings-row-title">${escapeHtml(character.name || "未命名角色")}</div>
      <div class="settings-row-desc">加入这个群聊</div>
    `;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = character.id;
    checkbox.checked = true;
    checkbox.style.width = "20px";
    checkbox.style.height = "20px";

    label.appendChild(text);
    label.appendChild(checkbox);
    memberBox.appendChild(label);
  });

  const saveButton = createButton("创建群聊", "primary-button");
  saveButton.addEventListener("click", async () => {
    const memberIds = Array.from(memberBox.querySelectorAll("input[type='checkbox']:checked"))
      .map((item) => item.value);

    if (memberIds.length === 0) {
      await showAlert("至少选择一个 AI 角色。");
      return;
    }

    const group = createDefaultGroup(nameInput.value.trim() || "新群聊", memberIds);

    groups.push(group);
    saveGroups(groups);

    currentGroupId = group.id;
    setActiveGroupId(group.id);
    chatMode = "group";

    closeModal();
    renderSidebar();
    renderChatMain();
  });

  body.appendChild(nameInput);
  body.appendChild(memberBox);
  body.appendChild(saveButton);

  showModal("新建群聊", body);
}

function showGroupManagePanel() {
  refreshDataFromStorage();

  const group = getCurrentGroup();

  if (!group) return;

  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "12px";

  const nameInput = document.createElement("input");
  nameInput.className = "text-input";
  nameInput.value = group.name || "";
  nameInput.placeholder = "群聊名称";

  const memberBox = document.createElement("div");
  memberBox.style.display = "grid";
  memberBox.style.gap = "8px";

  const memberIds = Array.isArray(group.memberIds) ? group.memberIds : [];

  characters.forEach((character) => {
    const label = document.createElement("label");
    label.className = "settings-row";

    const text = document.createElement("div");
    text.innerHTML = `
      <div class="settings-row-title">${escapeHtml(character.name || "未命名角色")}</div>
      <div class="settings-row-desc">群聊成员</div>
    `;

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = character.id;
    checkbox.checked = memberIds.includes(character.id);
    checkbox.style.width = "20px";
    checkbox.style.height = "20px";

    label.appendChild(text);
    label.appendChild(checkbox);
    memberBox.appendChild(label);
  });

  const saveButton = createButton("保存群设置", "primary-button");
  saveButton.addEventListener("click", async () => {
    const nextMemberIds = Array.from(memberBox.querySelectorAll("input[type='checkbox']:checked"))
      .map((item) => item.value);

    if (nextMemberIds.length === 0) {
      await showAlert("群聊至少保留一个 AI 角色。");
      return;
    }

    const nextGroup = {
      ...group,
      name: nameInput.value.trim() || "未命名群聊",
      memberIds: nextMemberIds,
      updatedAt: getNowInfo().timestamp
    };

    upsertGroup(nextGroup);
    refreshDataFromStorage();

    closeModal();
    renderSidebar();
    renderChatMain();
  });

  const deleteButton = createButton("删除群聊", "danger-button");
  deleteButton.addEventListener("click", async () => {
    const confirmed = await showConfirm(`确定删除「${group.name || "这个群聊"}」吗？聊天记录和群记忆都会删除。`);

    if (!confirmed) return;

    deleteGroup(group.id);
    refreshDataFromStorage();

    currentGroupId = groups[0]?.id || "";
    setActiveGroupId(currentGroupId);

    closeModal();
    renderSidebar();
    renderChatMain();
  });

  body.appendChild(nameInput);
  body.appendChild(memberBox);
  body.appendChild(saveButton);
  body.appendChild(deleteButton);

  showModal("群设置", body);
}

function showGroupSpeakerPicker() {
  const group = getCurrentGroup();

  if (!group) return;

  const members = getGroupMembers(group);

  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "10px";

  if (members.length === 0) {
    body.appendChild(createEmptyState("这个群聊还没有 AI 成员"));
  } else {
    members.forEach((member) => {
      const button = createButton(member.name || "未命名角色", "secondary-button");
      button.addEventListener("click", async () => {
        closeModal();
        await requestGroupAiReply(member.id);
      });

      body.appendChild(button);
    });
  }

  showModal("选择发言成员", body);
}

function showSingleMemoryPanel() {
  refreshDataFromStorage();

  const character = getCurrentCharacter();

  if (!character) return;

  showMemoryPanel({
    title: "记忆管理",
    memories: Array.isArray(character.memories) ? character.memories : [],
    onSaveMemories(nextMemories) {
      saveCurrentCharacter({
        ...character,
        memories: nextMemories,
        updatedAt: getNowInfo().timestamp
      });

      renderChatMain();
    }
  });
}

function showGroupMemoryPanel() {
  refreshDataFromStorage();

  const group = getCurrentGroup();

  if (!group) return;

  showMemoryPanel({
    title: "群聊记忆管理",
    memories: Array.isArray(group.memories) ? group.memories : [],
    onSaveMemories(nextMemories) {
      saveCurrentGroup({
        ...group,
        memories: nextMemories,
        updatedAt: getNowInfo().timestamp
      });

      renderChatMain();
    }
  });
}

function showMemoryPanel({ title, memories, onSaveMemories }) {
  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "10px";

  if (memories.length === 0) {
    body.appendChild(createEmptyState("暂无记忆"));
  } else {
    memories.forEach((memory, index) => {
      const item = document.createElement("div");
      item.className = "card";
      item.style.boxShadow = "none";
      item.style.background = "var(--bg-secondary)";

      const content = document.createElement("div");
      content.style.lineHeight = "1.6";
      content.textContent = memory.content || memory.text || "";

      const time = document.createElement("div");
      time.style.marginTop = "6px";
      time.style.color = "var(--text-secondary)";
      time.style.fontSize = "12px";
      time.textContent = memory.createdAt || "";

      const source = document.createElement("div");
      source.style.marginTop = "4px";
      source.style.color = "var(--text-secondary)";
      source.style.fontSize = "12px";
      source.textContent = `来源：${memory.source || "manual"}`;

      const deleteButton = createButton("删除", "secondary-button");
      deleteButton.style.marginTop = "8px";
      deleteButton.addEventListener("click", () => {
        const nextMemories = [...memories];
        nextMemories.splice(index, 1);
        onSaveMemories(nextMemories);
        closeModal();

        if (chatMode === "group") {
          showGroupMemoryPanel();
        } else {
          showSingleMemoryPanel();
        }
      });

      item.appendChild(content);
      item.appendChild(time);
      item.appendChild(source);
      item.appendChild(deleteButton);
      body.appendChild(item);
    });
  }

  const textarea = document.createElement("textarea");
  textarea.className = "textarea-input";
  textarea.placeholder = "手动添加一条记忆";
  textarea.style.minHeight = "80px";

  const addButton = createButton("添加记忆", "primary-button");
  addButton.addEventListener("click", async () => {
    const text = textarea.value.trim();

    if (!text) {
      await showAlert("请先输入记忆内容");
      return;
    }

    const nextMemories = [
      ...memories,
      {
        id: createId("memory"),
        content: text,
        source: "manual",
        createdAt: getNowInfo().localText
      }
    ];

    onSaveMemories(nextMemories);
    closeModal();

    if (chatMode === "group") {
      showGroupMemoryPanel();
    } else {
      showSingleMemoryPanel();
    }
  });

  body.appendChild(textarea);
  body.appendChild(addButton);

  showModal(title, body);
}

function buildMcpContext() {
  if (chatMode === "group") {
    const group = getCurrentGroup();

    return {
      mode: "group",
      groupId: group?.id || "",
      groupName: group?.name || "",
      chatHistory: Array.isArray(group?.chatHistory) ? group.chatHistory : []
    };
  }

  const character = getCurrentCharacter();

  return {
    mode: "single",
    characterId: character?.id || "",
    characterName: character?.name || "",
    chatHistory: Array.isArray(character?.chatHistory) ? character.chatHistory : []
  };
}

function makeMessageVisibleForApi(history = [], messageId = "") {
  return history.map((message) => {
    if (message.id !== messageId) {
      return message;
    }

    return {
      ...message,
      hidden: false
    };
  });
}

async function continueAiAfterMcpResult(result) {
  const hiddenMessage = {
    ...buildMcpHiddenMessage(result),
    id: createId(chatMode === "group" ? "group_msg" : "msg"),
    createdAt: getNowInfo().timestamp,
    hidden: true
  };

  if (chatMode === "group") {
    const group = getCurrentGroup();

    if (!group) return;

    const history = [
      ...(Array.isArray(group.chatHistory) ? group.chatHistory : []),
      hiddenMessage
    ];

    saveCurrentGroup({
      ...group,
      chatHistory: history,
      updatedAt: getNowInfo().timestamp
    });

    const members = getGroupMembers(group);

    if (members.length === 0) {
      await showAlert("这个群聊还没有 AI 成员。");
      return;
    }

    const apiHistory = makeMessageVisibleForApi(history, hiddenMessage.id);

    await requestGroupAiReply(members[0].id, {
      chatHistory: apiHistory,
      latestUserMessage: "MCP 工具结果"
    });

    return;
  }

  const character = getCurrentCharacter();

  if (!character) return;

  const history = [
    ...(Array.isArray(character.chatHistory) ? character.chatHistory : []),
    hiddenMessage
  ];

  saveCurrentCharacter({
    ...character,
    chatHistory: history,
    updatedAt: getNowInfo().timestamp
  });

  const apiHistory = makeMessageVisibleForApi(history, hiddenMessage.id);

  await requestSingleAiReply({
    chatHistory: apiHistory,
    latestUserMessage: "MCP 工具结果"
  });
}

function showMcpPanel() {
  const servers = getAvailableMcpServers();

  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "10px";

  if (!servers.length) {
    body.appendChild(createEmptyState("暂无可用 MCP 工具，请先在设置里添加 URL。"));
  } else {
    servers.forEach((server) => {
      const item = document.createElement("div");
      item.className = "card";

      const name = document.createElement("div");
      name.style.fontWeight = "700";
      name.textContent = server.name || "未命名 MCP";

      const url = document.createElement("div");
      url.style.color = "var(--text-secondary)";
      url.style.fontSize = "12px";
      url.style.marginTop = "4px";
      url.textContent = server.url || "";

      const desc = document.createElement("div");
      desc.style.lineHeight = "1.6";
      desc.style.marginTop = "8px";
      desc.textContent = server.description || "暂无描述";

      const runButton = createButton("调用工具", "primary-button");
      runButton.style.width = "100%";
      runButton.style.marginTop = "10px";
      runButton.addEventListener("click", () => {
        showMcpRunPanel(server);
      });

      item.appendChild(name);
      item.appendChild(url);
      item.appendChild(desc);
      item.appendChild(runButton);
      body.appendChild(item);
    });
  }

  showModal("MCP 工具列表", body);
}

function showMcpRunPanel(server) {
  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "12px";

  const desc = document.createElement("div");
  desc.className = "section-subtitle";
  desc.textContent = "输入要交给工具的参数。调用成功后，结果会作为隐藏上下文交给当前 AI 继续回答。";

  const input = document.createElement("textarea");
  input.className = "textarea-input";
  input.placeholder = "例如：查询今天的天气，或把当前聊天内容交给工具处理";
  input.style.minHeight = "110px";

  const currentInput = document.getElementById("chatInput");
  if (currentInput && currentInput.value.trim()) {
    input.value = currentInput.value.trim();
  }

  const runButton = createButton("调用并让 AI 继续回答", "primary-button");
  runButton.addEventListener("click", async () => {
    if (isSending) {
      await showAlert("当前回复还没结束，请先停止或等待完成。");
      return;
    }

    runButton.disabled = true;
    runButton.textContent = "调用中";

    try {
      const result = await callMcpServer({
        serverId: server.id,
        input: input.value.trim(),
        context: buildMcpContext()
      });

      closeModal();
      await continueAiAfterMcpResult(result);
    } catch (error) {
      await showAlert(error.message || "MCP 调用失败");
      runButton.disabled = false;
      runButton.textContent = "调用并让 AI 继续回答";
    }
  });

  body.appendChild(desc);
  body.appendChild(input);
  body.appendChild(runButton);

  showModal(`调用 ${server.name || "MCP 工具"}`, body);
}

function showApiInfoPanel(character) {
  const apiConfig = getResolvedCharacterApiConfig(character);
  const settings = getSettings();
  const endpoints = getApiEndpoints();

  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "10px";

  const info = document.createElement("div");
  info.className = "card";
  info.innerHTML = `
    <div style="font-weight:700;margin-bottom:8px;">当前使用配置</div>
    <div style="line-height:1.8;color:var(--text-secondary);font-size:13px;">
      <div>模型：${escapeHtml(apiConfig.model || "未填写")}</div>
      <div>地址：${escapeHtml(apiConfig.endpoint || "未填写")}</div>
      <div>Key：${apiConfig.apiKey ? "已填写" : "未填写"}</div>
    </div>
  `;

  const desc = document.createElement("div");
  desc.className = "card";
  desc.innerHTML = `
    <div style="font-weight:700;margin-bottom:8px;">说明</div>
    <div style="line-height:1.8;color:var(--text-secondary);font-size:13px;">
      当前角色如果单独填了 API，就用角色自己的。没填就用设置里的全局 API。<br>
      全局默认模型：${escapeHtml(settings.defaultModel || "未填写")}<br>
      已保存端点数量：${endpoints.length}
    </div>
  `;

  body.appendChild(info);
  body.appendChild(desc);

  showModal("API 配置", body);
}

export function mountApp({ root }) {
  rootElement = root;
  normalizeInitialData();
  mountLayout();
}

export default mountApp;
