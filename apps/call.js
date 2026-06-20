import {
  getCharacters,
  getCharacterById,
  createId,
  getNowInfo,
  readFileAsBase64,
  getCallBackground,
  setCallBackground,
  clearCallBackground
} from "../core/storage.js";

import {
  sendCharacterMessage,
  getResolvedCharacterApiConfig
} from "../core/api.js";

import {
  speakCharacterText,
  stopTts,
  canUseTts
} from "../core/tts.js";

import {
  rememberCharacterInteraction
} from "../core/memory.js";

import {
  showAlert,
  showConfirm
} from "../core/ui.js";

let rootElement = null;
let activeCall = null;
let activeAbortController = null;
let isCalling = false;

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

function createAvatar(character, size = 64) {
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.style.width = `${size}px`;
  avatar.style.height = `${size}px`;

  if (character?.avatar) {
    const img = document.createElement("img");
    img.src = character.avatar;
    img.alt = character.name || "角色头像";
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitialText(character?.name || "角");
  }

  return avatar;
}

function createSvgIcon(type) {
  const icons = {
    phone: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.2 4.5 10 8.7 8.4 10a11.5 11.5 0 0 0 5.6 5.6l1.3-1.6 4.2 1.8c.5.2.8.8.6 1.3l-.9 2.4c-.2.5-.7.8-1.2.8C10.2 20.3 3.7 13.8 3.7 6c0-.5.3-1 .8-1.2l2.4-.9c.5-.2 1.1.1 1.3.6Z"></path>
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

function createEmptyState(text) {
  const empty = document.createElement("div");
  empty.className = "empty-state";

  const inner = document.createElement("div");
  inner.style.display = "grid";
  inner.style.justifyItems = "center";
  inner.style.gap = "10px";

  const icon = createSvgIcon("phone");
  icon.style.width = "46px";
  icon.style.height = "46px";
  icon.style.stroke = "currentColor";
  icon.style.fill = "none";

  const label = document.createElement("div");
  label.textContent = text;

  inner.appendChild(icon);
  inner.appendChild(label);
  empty.appendChild(inner);

  return empty;
}

function renderContactList() {
  if (!rootElement) return;

  rootElement.innerHTML = "";

  const page = document.createElement("div");
  page.style.display = "grid";
  page.style.gap = "14px";

  const header = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "section-title";
  title.textContent = "电话";

  const subtitle = document.createElement("p");
  subtitle.className = "section-subtitle";
  subtitle.textContent = "选择一个 AI 角色通话。你打字，AI 用语音说话，同时显示文字。";

  header.appendChild(title);
  header.appendChild(subtitle);
  page.appendChild(header);

  const characters = getCharacters();

  if (characters.length === 0) {
    page.appendChild(createEmptyState("还没有角色"));
    rootElement.appendChild(page);
    return;
  }

  const list = document.createElement("div");
  list.style.display = "grid";
  list.style.gap = "10px";

  characters.forEach((character) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "card";
    card.style.display = "grid";
    card.style.gridTemplateColumns = "52px 1fr auto";
    card.style.alignItems = "center";
    card.style.gap = "12px";
    card.style.textAlign = "left";
    card.style.color = "var(--text-primary)";
    card.style.background = "var(--bg-card)";

    const avatar = createAvatar(character, 52);

    const text = document.createElement("div");

    const name = document.createElement("div");
    name.style.fontWeight = "700";
    name.textContent = character.name || "未命名角色";

    const desc = document.createElement("div");
    desc.style.fontSize = "12px";
    desc.style.color = "var(--text-secondary)";
    desc.style.marginTop = "4px";
    desc.textContent = canUseTts(character) ? "语音可用" : "语音未配置";

    const callText = document.createElement("div");
    callText.style.color = "var(--accent)";
    callText.style.fontWeight = "700";
    callText.textContent = "呼叫";

    text.appendChild(name);
    text.appendChild(desc);

    card.appendChild(avatar);
    card.appendChild(text);
    card.appendChild(callText);

    card.addEventListener("click", () => {
      startCallSession({
        characterId: character.id
      });
    });

    list.appendChild(card);
  });

  page.appendChild(list);
  rootElement.appendChild(page);
}

function applyCallBackground(body, characterId) {
  const background = getCallBackground(characterId);

  body.style.backgroundColor = "var(--bg-primary)";
  body.style.backgroundSize = "cover";
  body.style.backgroundPosition = "center";
  body.style.backgroundRepeat = "no-repeat";

  if (background) {
    body.style.backgroundImage = `url("${background}")`;
  } else {
    body.style.backgroundImage = "";
  }
}

function buildCallOverlay(character) {
  closeCallOverlay();

  const overlay = document.createElement("section");
  overlay.className = "app-window";
  overlay.id = "callOverlay";
  overlay.style.zIndex = "160";
  overlay.style.background = "var(--bg-primary)";
  overlay.style.color = "var(--text-primary)";

  const header = document.createElement("header");
  header.className = "app-header";

  const closeButton = createButton("‹", "icon-button");
  closeButton.title = "结束通话";
  closeButton.addEventListener("click", endCall);

  const title = document.createElement("h1");
  title.className = "app-title";
  title.textContent = "通话中";

  const headerActions = document.createElement("div");
  headerActions.style.display = "flex";
  headerActions.style.gap = "6px";
  headerActions.style.justifyContent = "flex-end";

  const bgButton = createButton("背景", "secondary-button");
  bgButton.style.minHeight = "32px";
  bgButton.style.padding = "0 9px";
  bgButton.addEventListener("click", () => {
    showBackgroundPanel(character.id);
  });

  const stopButton = createButton("静音", "secondary-button");
  stopButton.style.minHeight = "32px";
  stopButton.style.padding = "0 9px";
  stopButton.addEventListener("click", stopTts);

  headerActions.appendChild(bgButton);
  headerActions.appendChild(stopButton);

  header.appendChild(closeButton);
  header.appendChild(title);
  header.appendChild(headerActions);

  const body = document.createElement("div");
  body.className = "app-body";
  body.id = "callBody";
  body.style.display = "grid";
  body.style.gridTemplateRows = "auto 1fr auto";
  body.style.gap = "12px";
  body.style.padding = "14px";
  body.style.position = "relative";

  applyCallBackground(body, character.id);

  const profile = document.createElement("div");
  profile.className = "soft-card";
  profile.style.display = "grid";
  profile.style.justifyItems = "center";
  profile.style.gap = "10px";
  profile.style.padding = "16px";

  const avatar = createAvatar(character, 78);

  const name = document.createElement("div");
  name.style.fontWeight = "700";
  name.style.fontSize = "18px";
  name.textContent = character.name || "未命名角色";

  const status = document.createElement("div");
  status.id = "callStatus";
  status.style.color = "var(--text-secondary)";
  status.style.fontSize = "13px";
  status.textContent = canUseTts(character) ? "已接通 · AI 会语音回复" : "已接通 · 语音未配置，仅显示文字";

  profile.appendChild(avatar);
  profile.appendChild(name);
  profile.appendChild(status);

  const transcript = document.createElement("div");
  transcript.id = "callTranscript";
  transcript.className = "soft-card";
  transcript.style.overflowY = "auto";
  transcript.style.display = "flex";
  transcript.style.flexDirection = "column";
  transcript.style.gap = "10px";
  transcript.style.minHeight = "0";
  transcript.style.padding = "12px";

  const inputArea = document.createElement("div");
  inputArea.className = "chat-input-area";
  inputArea.style.gridTemplateColumns = "1fr 58px";
  inputArea.style.borderRadius = "22px";
  inputArea.style.border = "1px solid rgba(255,255,255,0.35)";
  inputArea.style.boxShadow = "var(--shadow)";

  const input = document.createElement("textarea");
  input.id = "callInput";
  input.className = "chat-input";
  input.placeholder = "打字说话";
  input.rows = 1;

  const sendButton = createButton("发送", "primary-button");
  sendButton.id = "callSendButton";
  sendButton.style.padding = "0 14px";
  sendButton.addEventListener("click", sendCallUserMessage);

  input.addEventListener("input", () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();

      if (!isCalling) {
        sendCallUserMessage();
      }
    }
  });

  inputArea.appendChild(input);
  inputArea.appendChild(sendButton);

  body.appendChild(profile);
  body.appendChild(transcript);
  body.appendChild(inputArea);

  overlay.appendChild(header);
  overlay.appendChild(body);
  document.body.appendChild(overlay);
}

function closeCallOverlay() {
  const old = document.getElementById("callOverlay");

  if (old) {
    old.remove();
  }
}

function updateCallStatus(text) {
  const status = document.getElementById("callStatus");

  if (status) {
    status.textContent = text;
  }
}

function updateCallSendButton() {
  const button = document.getElementById("callSendButton");

  if (!button) return;

  button.textContent = isCalling ? "等待" : "发送";
  button.disabled = isCalling;
}

function renderTranscript() {
  const transcript = document.getElementById("callTranscript");

  if (!transcript || !activeCall) return;

  transcript.innerHTML = "";

  if (activeCall.messages.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.style.minHeight = "120px";
    empty.textContent = "通话已接通";
    transcript.appendChild(empty);
    return;
  }

  activeCall.messages.forEach((message) => {
    transcript.appendChild(createCallMessageBubble(message));
  });

  requestAnimationFrame(() => {
    transcript.scrollTop = transcript.scrollHeight;
  });
}

function createCallMessageBubble(message) {
  const row = document.createElement("div");
  row.className = `message-row ${message.role === "assistant" ? "ai" : "user"}`;

  if (message.role === "assistant") {
    row.appendChild(createAvatar(activeCall.character, 32));
  }

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";

  if (message.role === "assistant") {
    const speaker = document.createElement("div");
    speaker.style.fontSize = "12px";
    speaker.style.fontWeight = "700";
    speaker.style.marginBottom = "4px";
    speaker.style.opacity = "0.72";
    speaker.textContent = activeCall.character.name || "AI";
    bubble.appendChild(speaker);
  }

  const content = document.createElement("div");
  content.textContent = message.content || "";
  bubble.appendChild(content);

  const time = document.createElement("div");
  time.style.fontSize = "11px";
  time.style.opacity = "0.62";
  time.style.marginTop = "5px";
  time.textContent = formatTime(message.createdAt);
  bubble.appendChild(time);

  if (message.role === "assistant") {
    const voiceRow = document.createElement("div");
    voiceRow.style.display = "flex";
    voiceRow.style.gap = "8px";
    voiceRow.style.marginTop = "8px";

    const playButton = createButton("重播语音", "secondary-button");
    playButton.style.minHeight = "28px";
    playButton.style.padding = "0 10px";
    playButton.disabled = !canUseTts(activeCall.character);
    playButton.addEventListener("click", async () => {
      try {
        await speakCharacterText(activeCall.character, message.content || "");
      } catch (error) {
        await showAlert(`语音播放失败：${error.message || "未知错误"}`);
      }
    });

    const stopButton = createButton("停止", "secondary-button");
    stopButton.style.minHeight = "28px";
    stopButton.style.padding = "0 10px";
    stopButton.addEventListener("click", stopTts);

    voiceRow.appendChild(playButton);
    voiceRow.appendChild(stopButton);
    bubble.appendChild(voiceRow);
  }

  row.appendChild(bubble);

  return row;
}

function formatTime(timestamp) {
  if (!timestamp) return "";

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${hour}:${minute}`;
}

function getCallHistoryForApi() {
  if (!activeCall) return [];

  const baseHistory = Array.isArray(activeCall.character.chatHistory)
    ? activeCall.character.chatHistory.slice(-20)
    : [];

  return [
    ...baseHistory,
    ...activeCall.messages
  ];
}

async function sendCallUserMessage() {
  if (!activeCall || isCalling) return;

  const input = document.getElementById("callInput");

  if (!input) return;

  const text = input.value.trim();

  if (!text) return;

  input.value = "";
  input.style.height = "auto";

  const userMessage = {
    id: createId("call_msg"),
    role: "user",
    content: text,
    createdAt: getNowInfo().timestamp
  };

  activeCall.messages.push(userMessage);
  renderTranscript();

  await requestCallAiReply(text);
}

async function requestCallAiReply(latestUserMessage = "") {
  if (!activeCall || isCalling) return;

  const character = activeCall.character;
  const apiConfig = getResolvedCharacterApiConfig(character);

  if (!apiConfig.endpoint || !apiConfig.model) {
    await showAlert("缺少 API 地址或模型名。请先到设置里填写，或在角色管理里给当前角色单独填写。");
    return;
  }

  isCalling = true;
  updateCallSendButton();
  updateCallStatus(`${character.name || "AI"} 正在说话...`);

  activeAbortController = new AbortController();

  const aiMessage = {
    id: createId("call_msg"),
    role: "assistant",
    content: "",
    thinking: "",
    createdAt: getNowInfo().timestamp
  };

  activeCall.messages.push(aiMessage);
  renderTranscript();

  let finalText = "";

  try {
    await sendCharacterMessage({
      character,
      chatHistory: getCallHistoryForApi().slice(0, -1),
      onChunk(chunk, fullContent) {
        finalText = fullContent;
        aiMessage.content = fullContent;
        renderTranscript();
      },
      onThinking(chunk, fullThinking) {
        aiMessage.thinking = fullThinking;
      },
      onDone(result) {
        finalText = result.content || finalText;
        aiMessage.content = finalText;
        aiMessage.thinking = result.thinking || "";
        renderTranscript();
      },
      onError(error) {
        throw error;
      },
      signal: activeAbortController.signal
    });

    await rememberCharacterInteraction({
      character,
      messages: [
        {
          role: "user",
          content: latestUserMessage
        },
        {
          role: "assistant",
          characterName: character.name,
          content: finalText
        }
      ],
      source: "call",
      sourceName: "电话通话"
    });

    if (finalText && canUseTts(character)) {
      updateCallStatus(`${character.name || "AI"} 正在语音播放...`);

      try {
        await speakCharacterText(character, finalText);
      } catch (error) {
        console.warn("电话语音播放失败：", error);
      }
    }
  } catch (error) {
    if (error.name === "AbortError") {
      aiMessage.content = "通话回复已停止。";
      updateCallStatus("已停止");
    } else {
      aiMessage.content = `通话失败：${error.message || "未知错误"}`;
      updateCallStatus("通话失败");
    }

    renderTranscript();
  } finally {
    isCalling = false;
    activeAbortController = null;
    updateCallSendButton();
    updateCallStatus("通话中");
  }
}

function showBackgroundPanel(characterId) {
  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "12px";

  const desc = document.createElement("p");
  desc.className = "section-subtitle";
  desc.textContent = "电话背景会按角色单独保存，只存在当前浏览器。";

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.className = "hidden";

  const uploadButton = createButton("上传背景", "primary-button");
  uploadButton.addEventListener("click", () => {
    input.value = "";
    input.click();
  });

  input.addEventListener("change", async () => {
    try {
      const file = input.files[0];
      const base64 = await readFileAsBase64(file, {
        imageOnly: true,
        maxSizeMB: 8
      });

      setCallBackground(characterId, base64);

      const callBody = document.getElementById("callBody");

      if (callBody) {
        applyCallBackground(callBody, characterId);
      }

      closeCallModal();
    } catch (error) {
      await showAlert(error.message || "背景设置失败");
    }
  });

  const clearButton = createButton("清除背景", "secondary-button");
  clearButton.addEventListener("click", () => {
    clearCallBackground(characterId);

    const callBody = document.getElementById("callBody");

    if (callBody) {
      applyCallBackground(callBody, characterId);
    }

    closeCallModal();
  });

  body.appendChild(desc);
  body.appendChild(uploadButton);
  body.appendChild(clearButton);
  body.appendChild(input);

  showCallModal("电话背景", body);
}

function showCallModal(titleText, bodyElement) {
  closeCallModal();

  const mask = document.createElement("div");
  mask.className = "modal-mask";
  mask.id = "callModalMask";
  mask.style.zIndex = "220";

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
  closeButton.addEventListener("click", closeCallModal);

  titleRow.appendChild(title);
  titleRow.appendChild(closeButton);

  panel.appendChild(titleRow);
  panel.appendChild(bodyElement);
  mask.appendChild(panel);

  mask.addEventListener("click", (event) => {
    if (event.target === mask) {
      closeCallModal();
    }
  });

  document.body.appendChild(mask);
}

function closeCallModal() {
  const old = document.getElementById("callModalMask");

  if (old) {
    old.remove();
  }
}

function endCall() {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }

  stopTts();

  isCalling = false;
  activeCall = null;

  closeCallModal();
  closeCallOverlay();

  if (rootElement) {
    renderContactList();
  }
}

export function startCallSession({
  characterId,
  openingText = "",
  autoSpeakOpening = true
} = {}) {
  const character = getCharacterById(characterId);

  if (!character) {
    void showAlert("找不到通话角色");
    return null;
  }

  activeCall = {
    id: createId("call"),
    character,
    startedAt: getNowInfo().timestamp,
    messages: []
  };

  buildCallOverlay(character);
  renderTranscript();

  if (openingText) {
    const openingMessage = {
      id: createId("call_msg"),
      role: "assistant",
      content: openingText,
      thinking: "",
      createdAt: getNowInfo().timestamp
    };

    activeCall.messages.push(openingMessage);
    renderTranscript();

    if (autoSpeakOpening && canUseTts(character)) {
      speakCharacterText(character, openingText).catch((error) => {
        console.warn("开场语音播放失败：", error);
      });
    }
  }

  return activeCall;
}

export function mountApp({ root }) {
  rootElement = root;
  renderContactList();
}

export default mountApp;
