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

import {
  startCallSession
} from "./call.js";

let rootElement = null;
let openAppCallback = null;
let characters = [];
let groups = [];
let currentCharacterId = "";
let currentGroupId = "";
let activeConversation = null;
let activeAbortController = null;
let isSending = false;
let expandedToolPanel = "";
let lastView = "list";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createButton(text, className = "secondary-button") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  return button;
}

function getInitialText(name) {
  const text = String(name || "角").trim();
  return text.slice(0, 1) || "角";
}

function createSvgIcon(type) {
  const icons = {
    plus: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14"></path>
        <path d="M5 12h14"></path>
      </svg>
    `,
    back: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15 6 9 12l6 6"></path>
      </svg>
    `,
    phone: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.2 4.5 10 8.7 8.4 10a11.5 11.5 0 0 0 5.6 5.6l1.3-1.6 4.2 1.8c.5.2.8.8.6 1.3l-.9 2.4c-.2.5-.7.8-1.2.8C10.2 20.3 3.7 13.8 3.7 6c0-.5.3-1 .8-1.2l2.4-.9c.5-.2 1.1.1 1.3.6Z"></path>
      </svg>
    `,
    send: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 19V5"></path>
        <path d="M6 11 12 5l6 6"></path>
      </svg>
    `,
    stop: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="7" y="7" width="10" height="10" rx="2"></rect>
      </svg>
    `,
    image: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="2"></rect>
        <path d="M8 13l2.2-2.2a1 1 0 0 1 1.4 0L15 14.2"></path>
        <path d="M14 13l1.2-1.2a1 1 0 0 1 1.4 0L20 15.2"></path>
        <circle cx="8.5" cy="8.5" r="1"></circle>
      </svg>
    `,
    mcp: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 8h10"></path>
        <path d="M7 12h10"></path>
        <path d="M7 16h6"></path>
        <rect x="4" y="4" width="16" height="16" rx="4"></rect>
      </svg>
    `,
    memory: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 18h6"></path>
        <path d="M10 22h4"></path>
        <path d="M8.5 14.5a6 6 0 1 1 7 0c-.9.7-1.5 1.6-1.5 2.5h-4c0-.9-.6-1.8-1.5-2.5Z"></path>
      </svg>
    `,
    trash: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h16"></path>
        <path d="M10 11v6"></path>
        <path d="M14 11v6"></path>
        <path d="M6 7l1 14h10l1-14"></path>
        <path d="M9 7V4h6v3"></path>
      </svg>
    `,
    speaker: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 10v4h4l5 4V6l-5 4H4Z"></path>
        <path d="M17 9.5a4 4 0 0 1 0 5"></path>
        <path d="M19.5 7a7.5 7.5 0 0 1 0 10"></path>
      </svg>
    `,
    copy: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="8" y="8" width="11" height="11" rx="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"></path>
      </svg>
    `,
    refresh: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"></path>
        <path d="M4 4v4h4"></path>
        <path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"></path>
        <path d="M20 20v-4h-4"></path>
      </svg>
    `,
    edit: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20h4l11-11a2.8 2.8 0 0 0-4-4L4 16v4Z"></path>
        <path d="M13.5 6.5l4 4"></path>
      </svg>
    `,
    more: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h.01"></path>
        <path d="M12 12h.01"></path>
        <path d="M19 12h.01"></path>
      </svg>
    `,
    file: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3h7l4 4v14H7V3Z"></path>
        <path d="M14 3v5h5"></path>
      </svg>
    `,
    face: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="8"></circle>
        <path d="M9 10h.01"></path>
        <path d="M15 10h.01"></path>
        <path d="M9 15c1.5 1 4.5 1 6 0"></path>
      </svg>
    `,
    group: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="9" cy="8" r="3"></circle>
        <path d="M3.5 19c.7-3.2 2.5-5 5.5-5s4.8 1.8 5.5 5"></path>
        <circle cx="17" cy="10" r="2.5"></circle>
        <path d="M15.5 14.5c2.5.2 4.2 1.7 5 4.5"></path>
      </svg>
    `,
    user: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="4"></circle>
        <path d="M5 20c.8-4 3.3-6 7-6s6.2 2 7 6"></path>
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

function createIconButton(type, title, className = "chat-icon-button") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = title || "";
  button.appendChild(createSvgIcon(type));
  return button;
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

function getActiveCharacter() {
  if (!activeConversation || activeConversation.type !== "single") {
    return null;
  }

  return characters.find((character) => character.id === activeConversation.id) || null;
}

function getActiveGroup() {
  if (!activeConversation || activeConversation.type !== "group") {
    return null;
  }

  return groups.find((group) => group.id === activeConversation.id) || null;
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

function getEntityLastMessage(history = []) {
  const visible = (Array.isArray(history) ? history : []).filter((message) => message && !message.hidden);

  if (visible.length === 0) {
    return null;
  }

  return visible[visible.length - 1];
}

function formatConversationPreview(message) {
  if (!message) return "还没有消息";

  if (message.image) {
    return message.content ? `[图片] ${message.content}` : "[图片]";
  }

  if (message.role === "assistant" && message.characterName) {
    return `${message.characterName}：${message.content || ""}`;
  }

  if (message.role === "assistant") {
    return message.content || "";
  }

  return message.content || "";
}

function formatShortTime(timestamp) {
  if (!timestamp) return "";

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60 * 1000) return "刚刚";
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}分钟前`;

  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  return `${date.getMonth() + 1}-${date.getDate()}`;
}

function formatFullTime(timestamp) {
  if (!timestamp) return "";

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function buildConversationList() {
  const items = [];

  characters.forEach((character) => {
    const lastMessage = getEntityLastMessage(character.chatHistory);

    items.push({
      type: "single",
      id: character.id,
      name: character.name || "未命名角色",
      avatar: character.avatar || "",
      entity: character,
      preview: formatConversationPreview(lastMessage),
      time: lastMessage?.createdAt || character.updatedAt || character.createdAt || "",
      badge: canUseTts(character) ? "语音" : ""
    });
  });

  groups.forEach((group) => {
    const members = getGroupMembers(group);
    const lastMessage = getEntityLastMessage(group.chatHistory);

    items.push({
      type: "group",
      id: group.id,
      name: group.name || "未命名群聊",
      avatar: group.avatar || "",
      entity: {
        name: group.name || "群聊",
        avatar: group.avatar || ""
      },
      preview: formatConversationPreview(lastMessage),
      time: lastMessage?.createdAt || group.updatedAt || group.createdAt || "",
      badge: `${members.length}人`
    });
  });

  return items.sort((a, b) => {
    const aTime = new Date(a.time || 0).getTime();
    const bTime = new Date(b.time || 0).getTime();

    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
  });
}

function mountShell() {
  if (!rootElement) return;

  rootElement.innerHTML = "";

  const shell = document.createElement("div");
  shell.className = "chat-shell";
  shell.id = "chatShell";

  rootElement.appendChild(shell);

  if (lastView === "detail" && activeConversation) {
    renderChatDetail();
  } else {
    renderConversationList();
  }
}

function renderConversationList() {
  lastView = "list";
  expandedToolPanel = "";
  refreshDataFromStorage();

  const shell = document.getElementById("chatShell") || rootElement;
  if (!shell) return;

  shell.innerHTML = "";

  const page = document.createElement("section");
  page.className = "conversation-page";

  const header = document.createElement("header");
  header.className = "conversation-header";

  const titleBox = document.createElement("div");

  const title = document.createElement("h1");
  title.className = "conversation-title";
  title.textContent = "消息";

  const subtitle = document.createElement("div");
  subtitle.className = "conversation-subtitle";
  subtitle.textContent = "单聊和群聊都会显示在这里";

  titleBox.appendChild(title);
  titleBox.appendChild(subtitle);

  const plusButton = createIconButton("plus", "新建", "conversation-plus-button");
  plusButton.addEventListener("click", showCreateMenu);

  header.appendChild(titleBox);
  header.appendChild(plusButton);

  const list = document.createElement("div");
  list.className = "conversation-list";

  const conversations = buildConversationList();

  if (conversations.length === 0) {
    list.appendChild(createEmptyState("还没有会话"));
  } else {
    conversations.forEach((conversation) => {
      list.appendChild(createConversationItem(conversation));
    });
  }

  page.appendChild(header);
  page.appendChild(list);
  shell.appendChild(page);
}

function createConversationItem(conversation) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "conversation-item";

  const avatarEntity = {
    name: conversation.name,
    avatar: conversation.avatar
  };

  const avatar = createAvatar(avatarEntity, 54);

  const main = document.createElement("div");
  main.className = "conversation-main";

  const nameRow = document.createElement("div");
  nameRow.className = "conversation-name-row";

  const name = document.createElement("div");
  name.className = "conversation-name";
  name.textContent = conversation.name;

  nameRow.appendChild(name);

  if (conversation.badge) {
    const badge = document.createElement("span");
    badge.className = "conversation-badge";
    badge.textContent = conversation.badge;
    nameRow.appendChild(badge);
  }

  const preview = document.createElement("div");
  preview.className = "conversation-preview";
  preview.textContent = conversation.preview || "还没有消息";

  main.appendChild(nameRow);
  main.appendChild(preview);

  const time = document.createElement("div");
  time.className = "conversation-time";
  time.textContent = formatShortTime(conversation.time);

  button.appendChild(avatar);
  button.appendChild(main);
  button.appendChild(time);

  button.addEventListener("click", () => {
    openConversation(conversation.type, conversation.id);
  });

  return button;
}

function showCreateMenu() {
  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "10px";

  const groupButton = createButton("新建群聊", "primary-button");
  groupButton.addEventListener("click", () => {
    showCreateGroupPanel();
  });

  const characterButton = createButton("新建人设", "secondary-button");
  characterButton.addEventListener("click", () => {
    closeModal();

    if (typeof openAppCallback === "function") {
      openAppCallback("characters");
      return;
    }

    if (window.AIPhoneDesktop?.openApp) {
      window.AIPhoneDesktop.openApp("characters");
    }
  });

  body.appendChild(groupButton);
  body.appendChild(characterButton);

  showModal("新建", body);
}

function openConversation(type, id) {
  activeConversation = {
    type,
    id
  };

  if (type === "single") {
    currentCharacterId = id;
    setActiveCharacterId(id);
  }

  if (type === "group") {
    currentGroupId = id;
    setActiveGroupId(id);
  }

  renderChatDetail();
}

function renderChatDetail() {
  lastView = "detail";
  refreshDataFromStorage();

  const shell = document.getElementById("chatShell") || rootElement;
  if (!shell || !activeConversation) return;

  const entity = activeConversation.type === "group" ? getActiveGroup() : getActiveCharacter();

  if (!entity) {
    activeConversation = null;
    renderConversationList();
    return;
  }

  shell.innerHTML = "";

  const screen = document.createElement("section");
  screen.className = "kelivo-chat";

  if (activeConversation.type === "single" && entity.chatBackground) {
    screen.style.backgroundImage = `url("${entity.chatBackground}")`;
  }

  screen.appendChild(createChatHeader(entity));
  screen.appendChild(createMessageList(entity));
  screen.appendChild(createComposer());

  shell.appendChild(screen);

  updateSendButton();
  scrollMessagesToBottom();
}

function createChatHeader(entity) {
  const header = document.createElement("header");
  header.className = "kelivo-header";

  const backButton = createIconButton("back", "返回消息列表", "kelivo-back-button");
  backButton.addEventListener("click", () => {
    activeConversation = null;
    renderConversationList();
  });

  const avatar = createAvatar(entity, 44);

  const titleBox = document.createElement("div");
  titleBox.className = "kelivo-title-box";

  const title = document.createElement("div");
  title.className = "kelivo-title";
  title.textContent = entity.name || "未命名";

  const status = document.createElement("div");
  status.className = "kelivo-status";
  status.id = "chatStatus";
  status.textContent = getHeaderStatusText(entity);

  titleBox.appendChild(title);
  titleBox.appendChild(status);

  const actions = document.createElement("div");
  actions.className = "kelivo-header-actions";

  if (activeConversation.type === "single") {
    const phoneButton = createIconButton("phone", "语音通话", "kelivo-header-action");
    phoneButton.addEventListener("click", () => {
      startCallSession({
        characterId: entity.id
      });
    });
    actions.appendChild(phoneButton);
  }

  const moreButton = createIconButton("more", "更多", "kelivo-header-action");
  moreButton.addEventListener("click", showHeaderMorePanel);
  actions.appendChild(moreButton);

  header.appendChild(backButton);
  header.appendChild(avatar);
  header.appendChild(titleBox);
  header.appendChild(actions);

  return header;
}

function getHeaderStatusText(entity) {
  if (activeConversation?.type === "group") {
    const members = getGroupMembers(entity);
    return `群成员 ${members.length} 位 · 记忆 ${Array.isArray(entity.memories) ? entity.memories.length : 0} 条`;
  }

  const apiConfig = getResolvedCharacterApiConfig(entity);
  const memoryCount = Array.isArray(entity.memories) ? entity.memories.length : 0;
  const ttsText = canUseTts(entity) ? "语音可用" : "语音关闭";

  if (!apiConfig.endpoint || !apiConfig.model) {
    return `未配置 API · 记忆 ${memoryCount} 条 · ${ttsText}`;
  }

  return `${apiConfig.model} · 记忆 ${memoryCount} 条 · ${ttsText}`;
}

function createMessageList(entity) {
  const list = document.createElement("div");
  list.className = "kelivo-message-list";
  list.id = "messageList";

  const history = activeConversation.type === "group"
    ? Array.isArray(entity.chatHistory) ? entity.chatHistory : []
    : Array.isArray(entity.chatHistory) ? entity.chatHistory : [];

  const visibleHistory = history.filter((message) => !message.hidden);

  if (visibleHistory.length === 0) {
    list.appendChild(createEmptyState("还没有消息"));
    return list;
  }

  history.forEach((message, index) => {
    if (message.hidden) return;

    const speaker = getMessageSpeaker(message, entity);

    list.appendChild(createMessageElement({
      message,
      index,
      speaker
    }));
  });

  return list;
}

function getMessageSpeaker(message, entity) {
  if (message.role === "user") {
    return {
      name: "用户",
      avatar: localStorage.getItem("ai_phone_user_avatar") || ""
    };
  }

  if (activeConversation.type === "group") {
    const character = characters.find((item) => item.id === message.characterId);

    return {
      ...(character || {}),
      name: message.characterName || character?.name || "AI"
    };
  }

  return entity;
}

function createMessageElement({ message, index, speaker }) {
  const row = document.createElement("article");
  row.className = `kelivo-message ${message.role === "assistant" ? "ai" : "user"}`;
  row.dataset.messageIndex = String(index);

  const meta = document.createElement("div");
  meta.className = "kelivo-message-meta";

  meta.appendChild(createAvatar(speaker, 36));

  const nameTime = document.createElement("div");
  nameTime.className = "kelivo-message-name-time";

  const name = document.createElement("div");
  name.className = "kelivo-message-name";
  name.textContent = speaker.name || (message.role === "assistant" ? "AI" : "用户");

  const time = document.createElement("div");
  time.className = "kelivo-message-time";
  time.textContent = formatFullTime(message.createdAt);

  nameTime.appendChild(name);
  nameTime.appendChild(time);
  meta.appendChild(nameTime);

  const bubble = document.createElement("div");
  bubble.className = "kelivo-bubble";

  if (message.role === "assistant" && message.thinking) {
    const thinkingButton = document.createElement("button");
    thinkingButton.type = "button";
    thinkingButton.className = "kelivo-thinking-toggle";
    thinkingButton.innerHTML = `<span>深度思考</span><span>展开</span>`;

    const thinkingContent = document.createElement("div");
    thinkingContent.className = "kelivo-thinking-content hidden";
    thinkingContent.textContent = message.thinking;

    thinkingButton.addEventListener("click", () => {
      const hidden = thinkingContent.classList.toggle("hidden");
      thinkingButton.innerHTML = hidden
        ? `<span>深度思考</span><span>展开</span>`
        : `<span>深度思考</span><span>收起</span>`;
    });

    bubble.appendChild(thinkingButton);
    bubble.appendChild(thinkingContent);
  }

  if (message.image) {
    const img = document.createElement("img");
    img.src = message.image;
    img.alt = "发送的图片";
    bubble.appendChild(img);
  }

  const content = document.createElement("div");
  content.textContent = message.content || "";
  bubble.appendChild(content);

  row.appendChild(meta);
  row.appendChild(bubble);
  row.appendChild(createMessageActions(message, index));

  bubble.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    showMessageMenu(event.clientX, event.clientY, index);
  });

  bubble.addEventListener("dblclick", () => {
    const rect = bubble.getBoundingClientRect();
    showMessageMenu(rect.left + 20, rect.top + 20, index);
  });

  return row;
}

function createMessageActions(message, index) {
  const actions = document.createElement("div");
  actions.className = "kelivo-message-actions";

  const copyButton = createIconButton("copy", "复制", "chat-message-action");
  copyButton.addEventListener("click", () => {
    copyText(message.content || "");
  });

  actions.appendChild(copyButton);

  if (message.role === "assistant") {
    const voiceButton = createIconButton("speaker", "播放语音", "chat-message-action");
    voiceButton.addEventListener("click", () => {
      playMessageVoice(message);
    });

    const regenButton = createIconButton("refresh", "重新生成", "chat-message-action");
    regenButton.addEventListener("click", () => {
      regenerateAssistantMessage(index);
    });

    const moreButton = createIconButton("more", "更多", "chat-message-action");
    moreButton.addEventListener("click", (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      showMessageMenu(rect.left, rect.top, index);
    });

    actions.appendChild(voiceButton);
    actions.appendChild(regenButton);
    actions.appendChild(moreButton);
  } else {
    const editButton = createIconButton("edit", "编辑", "chat-message-action");
    editButton.addEventListener("click", () => {
      editUserMessage(index);
    });

    const moreButton = createIconButton("more", "更多", "chat-message-action");
    moreButton.addEventListener("click", (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      showMessageMenu(rect.left, rect.top, index);
    });

    actions.appendChild(editButton);
    actions.appendChild(moreButton);
  }

  return actions;
}

function createComposer() {
  const composer = document.createElement("footer");
  composer.className = "kelivo-composer";

  if (expandedToolPanel) {
    composer.appendChild(createToolPanel(expandedToolPanel));
  }

  const inputCard = document.createElement("div");
  inputCard.className = "kelivo-input-card";

  const textarea = document.createElement("textarea");
  textarea.className = "kelivo-input";
  textarea.id = "chatInput";
  textarea.placeholder = "输入消息与 AI 聊天";
  textarea.rows = 1;

  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 110)}px`;
    updateSendButton();
  });

  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      if (!isSending) {
        sendActiveUserMessage();
      }
    }
  });

  const toolRow = document.createElement("div");
  toolRow.className = "kelivo-tool-row";

  const plusButton = createToolRowButton("plus", "更多", "main");
  const imageButton = createToolRowButton("image", "图片", "image");
  const faceButton = createToolRowButton("face", "表情包", "face");
  const phoneButton = createToolRowButton("phone", "打电话", "phone");
  const mcpButton = createToolRowButton("mcp", "MCP", "mcp");
  const memoryButton = createToolRowButton("memory", "记忆", "memory");

  const sendButton = createIconButton(isSending ? "stop" : "send", isSending ? "停止" : "发送", "kelivo-send-button");
  sendButton.id = "sendButton";
  sendButton.addEventListener("click", () => {
    if (isSending) {
      stopCurrentResponse();
      return;
    }

    sendActiveUserMessage();
  });

  toolRow.appendChild(plusButton);
  toolRow.appendChild(imageButton);
  toolRow.appendChild(faceButton);
  toolRow.appendChild(phoneButton);
  toolRow.appendChild(mcpButton);
  toolRow.appendChild(memoryButton);
  toolRow.appendChild(sendButton);

  inputCard.appendChild(textarea);
  inputCard.appendChild(toolRow);

  composer.appendChild(inputCard);

  return composer;
}

function createToolRowButton(icon, title, panelName) {
  const button = createIconButton(icon, title, "kelivo-tool-button");
  button.classList.toggle("active", expandedToolPanel === panelName);
  button.addEventListener("click", () => {
    expandedToolPanel = expandedToolPanel === panelName ? "" : panelName;
    renderChatDetail();
  });
  return button;
}

function createToolPanel(panelName) {
  const panel = document.createElement("div");
  panel.className = "kelivo-tool-panel";

  const title = document.createElement("div");
  title.className = "kelivo-tool-panel-title";
  title.textContent = getToolPanelTitle(panelName);

  const grid = document.createElement("div");
  grid.className = "kelivo-tool-grid";

  getToolItems(panelName).forEach((item) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "kelivo-tool-card";
    card.appendChild(createSvgIcon(item.icon));

    const label = document.createElement("span");
    label.textContent = item.label;
    card.appendChild(label);

    card.addEventListener("click", item.action);
    grid.appendChild(card);
  });

  panel.appendChild(title);
  panel.appendChild(grid);

  return panel;
}

function getToolPanelTitle(panelName) {
  const map = {
    main: "更多功能",
    image: "图片",
    face: "表情包",
    phone: "语音通话",
    mcp: "MCP 工具",
    memory: "记忆与上下文"
  };

  return map[panelName] || "工具";
}

function getToolItems(panelName) {
  if (panelName === "image") {
    return [
      {
        icon: "image",
        label: "发送图片",
        action: handleSendImage
      },
      {
        icon: "file",
        label: "发文件",
        action: () => showAlert("文件发送还没接入。纯静态网页可先用图片发送。")
      }
    ];
  }

  if (panelName === "face") {
    return [
      {
        icon: "face",
        label: "表情包",
        action: () => showAlert("表情包系统还没接入。后续可做本地表情包库。")
      }
    ];
  }

  if (panelName === "phone") {
    return [
      {
        icon: "phone",
        label: "语音通话",
        action: startActiveCall
      },
      {
        icon: "speaker",
        label: "停止语音",
        action: stopTts
      }
    ];
  }

  if (panelName === "mcp") {
    return [
      {
        icon: "mcp",
        label: "调用 MCP",
        action: showMcpPanel
      }
    ];
  }

  if (panelName === "memory") {
    return [
      {
        icon: "memory",
        label: "记忆管理",
        action: showActiveMemoryPanel
      },
      {
        icon: "trash",
        label: "清空上下文",
        action: clearActiveContext
      },
      {
        icon: "speaker",
        label: "停止语音",
        action: stopTts
      }
    ];
  }

  return [
    {
      icon: "image",
      label: "图片",
      action: handleSendImage
    },
    {
      icon: "face",
      label: "表情包",
      action: () => showAlert("表情包系统还没接入。")
    },
    {
      icon: "phone",
      label: "打电话",
      action: startActiveCall
    },
    {
      icon: "file",
      label: "文件",
      action: () => showAlert("文件发送还没接入。")
    },
    {
      icon: "mcp",
      label: "MCP",
      action: showMcpPanel
    },
    {
      icon: "memory",
      label: "记忆",
      action: showActiveMemoryPanel
    },
    {
      icon: "trash",
      label: "清空",
      action: clearActiveContext
    },
    {
      icon: "speaker",
      label: "停止语音",
      action: stopTts
    }
  ];
}

function updateSendButton() {
  const sendButton = document.getElementById("sendButton");
  const input = document.getElementById("chatInput");

  if (!sendButton) return;

  sendButton.innerHTML = "";
  sendButton.appendChild(createSvgIcon(isSending ? "stop" : "send"));
  sendButton.classList.toggle("stop", isSending);
  sendButton.classList.toggle("ready", Boolean(input?.value.trim()) || isSending);
}

function updateStatus(text) {
  const status = document.getElementById("chatStatus");

  if (status) {
    status.textContent = text;
  }
}

function scrollMessagesToBottom() {
  const messageList = document.getElementById("messageList");

  if (!messageList) return;

  requestAnimationFrame(() => {
    messageList.scrollTop = messageList.scrollHeight;
  });
}

function getActiveHistory() {
  if (!activeConversation) return [];

  if (activeConversation.type === "group") {
    return Array.isArray(getActiveGroup()?.chatHistory) ? getActiveGroup().chatHistory : [];
  }

  return Array.isArray(getActiveCharacter()?.chatHistory) ? getActiveCharacter().chatHistory : [];
}

async function sendActiveUserMessage() {
  if (!activeConversation || isSending) return;

  const input = document.getElementById("chatInput");

  if (!input) return;

  const text = input.value.trim();

  if (!text) return;

  input.value = "";
  input.style.height = "auto";
  expandedToolPanel = "";

  if (activeConversation.type === "group") {
    await sendGroupUserMessage(text);
  } else {
    await sendSingleUserMessage(text);
  }
}

async function sendSingleUserMessage(text) {
  const character = getActiveCharacter();

  if (!character) return;

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
  renderChatDetail();

  await requestSingleAiReply({
    characterId: character.id,
    latestUserMessage: text
  });
}

async function sendGroupUserMessage(text) {
  const group = getActiveGroup();

  if (!group) return;

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
  renderChatDetail();

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

  const character = characters.find((item) => item.id === (options.characterId || activeConversation?.id)) || getActiveCharacter();

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

  let workingCharacter = characters.find((item) => item.id === character.id) || character;

  workingCharacter = {
    ...workingCharacter,
    chatHistory: [
      ...(Array.isArray(workingCharacter.chatHistory) ? workingCharacter.chatHistory : []),
      aiMessage
    ],
    updatedAt: getNowInfo().timestamp
  };

  saveCurrentCharacter(workingCharacter);
  renderChatDetail();

  let replyCompleted = false;
  let finalAiText = "";

  try {
    await sendCharacterMessage({
      character: workingCharacter,
      chatHistory: options.chatHistory || workingCharacter.chatHistory.slice(0, -1),
      onChunk(chunk, fullContent) {
        finalAiText = fullContent;
        updateLastSingleAssistantMessage(character.id, {
          content: fullContent
        });
      },
      onThinking(chunk, fullThinking) {
        updateLastSingleAssistantMessage(character.id, {
          thinking: fullThinking
        });
      },
      onDone(result) {
        finalAiText = result.content;
        updateLastSingleAssistantMessage(character.id, {
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
      updateLastSingleAssistantMessage(character.id, {
        content: `请求失败：${error.message || "未知错误"}`
      });
      updateStatus("回复失败");
    }
  } finally {
    isSending = false;
    activeAbortController = null;
    updateSendButton();

    if (replyCompleted) {
      await runSingleMemoryAfterReply(character.id);
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

    const latestCharacter = characters.find((item) => item.id === character.id);

    if (latestCharacter && activeConversation?.type === "single" && activeConversation.id === latestCharacter.id) {
      updateStatus(getHeaderStatusText(latestCharacter));
    }

    renderChatDetail();
  }
}

async function requestGroupAiReply(characterId, options = {}) {
  if (isSending) return;

  const group = getActiveGroup() || getCurrentGroup();
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

  let workingGroup = groups.find((item) => item.id === group.id) || group;

  workingGroup = {
    ...workingGroup,
    chatHistory: [
      ...(Array.isArray(workingGroup.chatHistory) ? workingGroup.chatHistory : []),
      aiMessage
    ],
    updatedAt: getNowInfo().timestamp
  };

  saveCurrentGroup(workingGroup);
  renderChatDetail();

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
        updateLastGroupAssistantMessage(group.id, aiMessage.id, {
          content: fullContent
        });
      },
      onThinking(chunk, fullThinking) {
        updateLastGroupAssistantMessage(group.id, aiMessage.id, {
          thinking: fullThinking
        });
      },
      onDone(result) {
        finalAiText = result.content;
        updateLastGroupAssistantMessage(group.id, aiMessage.id, {
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
      updateLastGroupAssistantMessage(group.id, aiMessage.id, {
        content: `请求失败：${error.message || "未知错误"}`
      });
      updateStatus("回复失败");
    }
  } finally {
    isSending = false;
    activeAbortController = null;
    updateSendButton();

    if (replyCompleted) {
      await runGroupMemoryAfterReply(group.id);
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

    const latestGroup = groups.find((item) => item.id === group.id);

    if (latestGroup && activeConversation?.type === "group" && activeConversation.id === latestGroup.id) {
      updateStatus(getHeaderStatusText(latestGroup));
    }

    renderChatDetail();
  }
}

function updateLastSingleAssistantMessage(characterId, patch) {
  const character = characters.find((item) => item.id === characterId);

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

  renderChatDetail();
}

function updateLastGroupAssistantMessage(groupId, messageId, patch) {
  const group = groups.find((item) => item.id === groupId);

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

  renderChatDetail();
}

async function runSingleMemoryAfterReply(characterId) {
  const character = characters.find((item) => item.id === characterId);

  if (!character) return;

  updateStatus("正在整理记忆...");

  try {
    await processCharacterMemoryAfterReply(character);
  } catch (error) {
    console.warn("记忆处理失败：", error);
  }
}

async function runGroupMemoryAfterReply(groupId) {
  const group = groups.find((item) => item.id === groupId);

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

async function handleVoiceAfterSingleReply({ characterId, latestUserMessage, latestAiMessage }) {
  const character = characters.find((item) => item.id === characterId);

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
      chatHistory: getActiveGroup()?.chatHistory || [],
      scene: "group-chat"
    });
  } catch (error) {
    console.warn("群聊 TTS 自动处理失败：", error);
  }
}

async function handleAutoMomentAfterSingleReply({ characterId, latestUserMessage, latestAiMessage }) {
  try {
    const character = characters.find((item) => item.id === characterId);

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
      chatHistory: getActiveGroup()?.chatHistory || [],
      scene: "group-chat"
    });
  } catch (error) {
    console.warn("群聊自动朋友圈失败：", error);
  }
}

async function requestAllGroupMembersReply(latestUserMessage = "") {
  const group = getActiveGroup();

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

function stopCurrentResponse() {
  if (activeAbortController) {
    activeAbortController.abort();
  }

  isSending = false;
  updateSendButton();
}

function getMessageByIndex(index) {
  const history = getActiveHistory();
  return history[index] || null;
}

function deleteMessage(index) {
  if (!activeConversation) return;

  if (activeConversation.type === "group") {
    const group = getActiveGroup();

    if (!group) return;

    const history = Array.isArray(group.chatHistory) ? [...group.chatHistory] : [];
    history.splice(index, 1);

    saveCurrentGroup({
      ...group,
      chatHistory: history,
      updatedAt: getNowInfo().timestamp
    });

    renderChatDetail();
    return;
  }

  const character = getActiveCharacter();

  if (!character) return;

  const history = Array.isArray(character.chatHistory) ? [...character.chatHistory] : [];
  history.splice(index, 1);

  saveCurrentCharacter({
    ...character,
    chatHistory: history,
    updatedAt: getNowInfo().timestamp
  });

  renderChatDetail();
}

async function editUserMessage(index) {
  const message = getMessageByIndex(index);

  if (!message || message.role !== "user") return;

  const nextText = await showPrompt("编辑消息：", message.content || "");

  if (nextText === null) return;

  if (activeConversation.type === "group") {
    const group = getActiveGroup();
    const history = Array.isArray(group.chatHistory) ? [...group.chatHistory] : [];

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

    renderChatDetail();
    return;
  }

  const character = getActiveCharacter();
  const history = Array.isArray(character.chatHistory) ? [...character.chatHistory] : [];

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

  renderChatDetail();
}

async function regenerateAssistantMessage(index) {
  const message = getMessageByIndex(index);

  if (!message || message.role !== "assistant") return;

  if (activeConversation.type === "group") {
    const group = getActiveGroup();

    if (!group) return;

    let history = Array.isArray(group.chatHistory) ? [...group.chatHistory] : [];
    const speakerId = message.characterId;

    history = history.slice(0, index);

    saveCurrentGroup({
      ...group,
      chatHistory: history,
      updatedAt: getNowInfo().timestamp
    });

    renderChatDetail();

    await requestGroupAiReply(speakerId, {
      chatHistory: history,
      latestUserMessage: history[history.length - 1]?.content || ""
    });

    return;
  }

  await regenerateSingleFromMessage(index);
}

async function regenerateSingleFromMessage(index) {
  const character = getActiveCharacter();

  if (!character) return;

  let history = Array.isArray(character.chatHistory) ? [...character.chatHistory] : [];

  if (!history[index] || history[index].role !== "assistant") return;

  history = history.slice(0, index);

  saveCurrentCharacter({
    ...character,
    chatHistory: history,
    updatedAt: getNowInfo().timestamp
  });

  renderChatDetail();

  await requestSingleAiReply({
    characterId: character.id,
    chatHistory: history,
    latestUserMessage: history[history.length - 1]?.content || ""
  });
}

async function continueSingleFromMessage(index) {
  const character = getActiveCharacter();

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

  renderChatDetail();

  await requestSingleAiReply({
    characterId: character.id,
    chatHistory: history,
    latestUserMessage: "请自然续写上一条回复。"
  });
}

async function replySingleFromUserMessage(index) {
  const character = getActiveCharacter();

  if (!character) return;

  let history = Array.isArray(character.chatHistory) ? [...character.chatHistory] : [];
  history = history.slice(0, index + 1);

  saveCurrentCharacter({
    ...character,
    chatHistory: history,
    updatedAt: getNowInfo().timestamp
  });

  renderChatDetail();

  await requestSingleAiReply({
    characterId: character.id,
    chatHistory: history,
    latestUserMessage: history[history.length - 1]?.content || ""
  });
}

async function playMessageVoice(message) {
  let character = null;

  if (activeConversation?.type === "group") {
    character = characters.find((item) => item.id === message.characterId);
  } else {
    character = getActiveCharacter();
  }

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

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text || "");
    await showAlert("已复制");
  } catch {
    await showAlert("复制失败，请手动选择文字复制。");
  }
}

function closeContextMenu() {
  const oldMenu = document.getElementById("chatContextMenu");

  if (oldMenu) {
    oldMenu.remove();
  }
}

function showMessageMenu(x, y, index) {
  closeContextMenu();

  const message = getMessageByIndex(index);

  if (!message) return;

  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.id = "chatContextMenu";

  menu.appendChild(createMenuButton("复制", () => copyText(message.content || "")));

  if (message.role === "assistant") {
    menu.appendChild(createMenuButton("播放语音", () => playMessageVoice(message)));
    menu.appendChild(createMenuButton("停止语音", stopTts));
    menu.appendChild(createMenuButton("查看思维", async () => {
      await showAlert(message.thinking || "这条消息没有思维内容。");
    }));
    menu.appendChild(createMenuButton("重新生成", () => regenerateAssistantMessage(index)));

    if (activeConversation?.type === "single") {
      menu.appendChild(createMenuButton("续写", () => continueSingleFromMessage(index)));
    }

    menu.appendChild(createMenuButton("删除", () => deleteMessage(index)));
  } else {
    menu.appendChild(createMenuButton("编辑", () => editUserMessage(index)));
    menu.appendChild(createMenuButton("删除", () => deleteMessage(index)));

    if (activeConversation?.type === "single") {
      menu.appendChild(createMenuButton("基于此重新回复", () => replySingleFromUserMessage(index)));
    }

    if (activeConversation?.type === "group") {
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

      if (activeConversation?.type === "group") {
        const group = getActiveGroup();

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

        expandedToolPanel = "";
        renderChatDetail();
        showGroupSpeakerPicker();
        return;
      }

      const character = getActiveCharacter();

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

      expandedToolPanel = "";
      renderChatDetail();

      await requestSingleAiReply({
        characterId: character.id,
        latestUserMessage: caption.trim() || "请看这张图片。"
      });
    } catch (error) {
      await showAlert(error.message || "图片发送失败");
    }
  });

  input.click();
}

function startActiveCall() {
  if (activeConversation?.type !== "single") {
    showAlert("群聊暂时不能直接通话。请进入单个角色会话后打电话。");
    return;
  }

  const character = getActiveCharacter();

  if (!character) {
    showAlert("找不到通话角色");
    return;
  }

  startCallSession({
    characterId: character.id
  });
}

async function clearActiveContext() {
  if (!activeConversation) return;

  if (activeConversation.type === "group") {
    const group = getActiveGroup();

    if (!group) return;

    const confirmed = await showConfirm("确定清空这个群聊的聊天记录吗？群记忆不会删除。");

    if (!confirmed) return;

    saveCurrentGroup({
      ...group,
      chatHistory: [],
      lastMemoryIndex: 0,
      updatedAt: getNowInfo().timestamp
    });

    expandedToolPanel = "";
    renderChatDetail();
    return;
  }

  const character = getActiveCharacter();

  if (!character) return;

  const confirmed = await showConfirm("确定清空当前角色的聊天记录吗？记忆不会删除。");

  if (!confirmed) return;

  saveCurrentCharacter({
    ...character,
    chatHistory: [],
    lastMemoryIndex: 0,
    updatedAt: getNowInfo().timestamp
  });

  expandedToolPanel = "";
  renderChatDetail();
}

function showActiveMemoryPanel() {
  if (activeConversation?.type === "group") {
    showGroupMemoryPanel();
  } else {
    showSingleMemoryPanel();
  }
}

function showSingleMemoryPanel() {
  refreshDataFromStorage();

  const character = getActiveCharacter();

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

      renderChatDetail();
    }
  });
}

function showGroupMemoryPanel() {
  refreshDataFromStorage();

  const group = getActiveGroup();

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

      renderChatDetail();
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
        showActiveMemoryPanel();
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
    showActiveMemoryPanel();
  });

  body.appendChild(textarea);
  body.appendChild(addButton);

  showModal(title, body);
}

function showHeaderMorePanel() {
  if (activeConversation?.type === "group") {
    showGroupManagePanel();
    return;
  }

  showApiInfoPanel(getActiveCharacter());
}

function showCreateGroupPanel() {
  closeModal();
  refreshDataFromStorage();

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

    closeModal();
    openConversation("group", group.id);
  });

  body.appendChild(nameInput);
  body.appendChild(memberBox);
  body.appendChild(saveButton);

  showModal("新建群聊", body);
}

function showGroupManagePanel() {
  refreshDataFromStorage();

  const group = getActiveGroup() || getCurrentGroup();

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
    renderChatDetail();
  });

  const deleteButton = createButton("删除群聊", "danger-button");
  deleteButton.addEventListener("click", async () => {
    const confirmed = await showConfirm(`确定删除「${group.name || "这个群聊"}」吗？聊天记录和群记忆都会删除。`);

    if (!confirmed) return;

    deleteGroup(group.id);
    refreshDataFromStorage();

    activeConversation = null;
    closeModal();
    renderConversationList();
  });

  body.appendChild(nameInput);
  body.appendChild(memberBox);
  body.appendChild(saveButton);
  body.appendChild(deleteButton);

  showModal("群设置", body);
}

function showGroupSpeakerPicker() {
  const group = getActiveGroup();

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

function buildMcpContext() {
  if (activeConversation?.type === "group") {
    const group = getActiveGroup();

    return {
      mode: "group",
      groupId: group?.id || "",
      groupName: group?.name || "",
      chatHistory: Array.isArray(group?.chatHistory) ? group.chatHistory : []
    };
  }

  const character = getActiveCharacter();

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
    id: createId(activeConversation?.type === "group" ? "group_msg" : "msg"),
    createdAt: getNowInfo().timestamp,
    hidden: true
  };

  if (activeConversation?.type === "group") {
    const group = getActiveGroup();

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

  const character = getActiveCharacter();

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
    characterId: character.id,
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
      expandedToolPanel = "";
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
  if (!character) return;

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

export function mountApp({ root, openApp } = {}) {
  rootElement = root;
  openAppCallback = openApp || null;
  normalizeInitialData();
  activeConversation = null;
  lastView = "list";
  expandedToolPanel = "";
  mountShell();
}

export default mountApp;
