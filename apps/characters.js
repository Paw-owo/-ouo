import {
  createDefaultCharacter,
  createId,
  getCharacters,
  saveCharacters,
  upsertCharacter,
  deleteCharacter,
  setActiveCharacterId,
  getActiveCharacterId,
  readFileAsBase64,
  getNowInfo,
  normalizeTtsConfig,
  normalizeApiConfig
} from "../core/storage.js";

import {
  showAlert,
  showConfirm
} from "../core/ui.js";

let rootElement = null;
let editingCharacterId = "";
let draftCharacter = null;

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
  const wrap = document.createElement("span");

  const svgs = {
    user: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="4"></circle>
        <path d="M5 20c.9-4 3.4-6 7-6s6.1 2 7 6"></path>
      </svg>
    `,
    image: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="2"></rect>
        <path d="M8 13l2.2-2.2a1 1 0 0 1 1.4 0L15 14.2"></path>
        <path d="M14 13l1.2-1.2a1 1 0 0 1 1.4 0L20 15.2"></path>
        <circle cx="8.5" cy="8.5" r="1"></circle>
      </svg>
    `
  };

  wrap.innerHTML = svgs[type] || svgs.user;

  const svg = wrap.firstElementChild;
  svg.style.width = "34px";
  svg.style.height = "34px";
  svg.style.stroke = "currentColor";
  svg.style.fill = "none";

  return svg;
}

function createAvatarElement(character, size = 62) {
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.style.width = `${size}px`;
  avatar.style.height = `${size}px`;

  if (character.avatar) {
    const img = document.createElement("img");
    img.src = character.avatar;
    img.alt = character.name || "角色头像";
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitialText(character.name);
  }

  return avatar;
}

function clearRoot() {
  if (rootElement) {
    rootElement.innerHTML = "";
  }
}

function createFormGroup(labelText, inputElement, descText = "") {
  const group = document.createElement("label");
  group.className = "form-group";

  const label = document.createElement("span");
  label.className = "form-label";
  label.textContent = labelText;

  group.appendChild(label);
  group.appendChild(inputElement);

  if (descText) {
    const desc = document.createElement("span");
    desc.className = "settings-row-desc";
    desc.textContent = descText;
    group.appendChild(desc);
  }

  return group;
}

function createTextInput(value = "", placeholder = "") {
  const input = document.createElement("input");
  input.className = "text-input";
  input.type = "text";
  input.value = value || "";
  input.placeholder = placeholder;
  return input;
}

function createPasswordInput(value = "", placeholder = "") {
  const input = document.createElement("input");
  input.className = "text-input";
  input.type = "password";
  input.value = value || "";
  input.placeholder = placeholder;
  return input;
}

function createNumberInput(value = 100, min = 1) {
  const input = document.createElement("input");
  input.className = "text-input";
  input.type = "number";
  input.min = String(min);
  input.step = "1";
  input.value = String(value || 100);
  return input;
}

function createTextarea(value = "", placeholder = "") {
  const textarea = document.createElement("textarea");
  textarea.className = "textarea-input";
  textarea.value = value || "";
  textarea.placeholder = placeholder;
  return textarea;
}

function createSelect(options, value = "") {
  const select = document.createElement("select");
  select.className = "select-input";

  options.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.value;
    option.textContent = item.label;

    if (item.value === value) {
      option.selected = true;
    }

    select.appendChild(option);
  });

  return select;
}

function createCheckbox(checked = false) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(checked);
  input.style.width = "20px";
  input.style.height = "20px";
  return input;
}

function createRow(titleText, descText, rightElement) {
  const row = document.createElement("div");
  row.className = "settings-row";

  const text = document.createElement("div");

  const title = document.createElement("div");
  title.className = "settings-row-title";
  title.textContent = titleText;

  const desc = document.createElement("div");
  desc.className = "settings-row-desc";
  desc.textContent = descText;

  text.appendChild(title);
  text.appendChild(desc);

  row.appendChild(text);
  row.appendChild(rightElement);

  return row;
}

function createImageUploadBox({ title, imageValue, fallbackType, onChange, onClear }) {
  const box = document.createElement("div");
  box.className = "card";
  box.style.display = "grid";
  box.style.gap = "12px";
  box.style.boxShadow = "none";
  box.style.background = "var(--bg-secondary)";

  const head = document.createElement("div");
  head.style.display = "flex";
  head.style.alignItems = "center";
  head.style.justifyContent = "space-between";
  head.style.gap = "12px";

  const label = document.createElement("div");
  label.style.fontWeight = "700";
  label.textContent = title;

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";
  actions.style.flexWrap = "wrap";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.className = "hidden";

  const uploadButton = createButton("上传", "secondary-button");
  uploadButton.addEventListener("click", () => {
    fileInput.value = "";
    fileInput.click();
  });

  const clearButton = createButton("清除", "secondary-button");
  clearButton.disabled = !imageValue;
  clearButton.addEventListener("click", () => {
    onClear();
  });

  fileInput.addEventListener("change", async () => {
    try {
      const file = fileInput.files[0];
      const base64 = await readFileAsBase64(file, {
        imageOnly: true,
        maxSizeMB: 8
      });

      onChange(base64);
    } catch (error) {
      await showAlert(error.message || "图片读取失败");
    }
  });

  actions.appendChild(uploadButton);
  actions.appendChild(clearButton);
  actions.appendChild(fileInput);

  head.appendChild(label);
  head.appendChild(actions);

  const preview = document.createElement("div");
  preview.style.width = fallbackType === "avatar" ? "74px" : "100%";
  preview.style.height = fallbackType === "avatar" ? "74px" : "120px";
  preview.style.borderRadius = fallbackType === "avatar" ? "50%" : "16px";
  preview.style.overflow = "hidden";
  preview.style.background = "var(--bg-card)";
  preview.style.display = "grid";
  preview.style.placeItems = "center";
  preview.style.color = "var(--text-secondary)";

  if (imageValue) {
    const img = document.createElement("img");
    img.src = imageValue;
    img.alt = title;
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "cover";
    preview.appendChild(img);
  } else {
    preview.appendChild(createSvgIcon(fallbackType === "avatar" ? "user" : "image"));
  }

  box.appendChild(head);
  box.appendChild(preview);

  return box;
}

function renderList() {
  clearRoot();

  editingCharacterId = "";
  draftCharacter = null;

  const characters = getCharacters();
  const activeCharacterId = getActiveCharacterId();

  const page = document.createElement("div");

  const top = document.createElement("div");
  top.style.display = "flex";
  top.style.alignItems = "center";
  top.style.justifyContent = "space-between";
  top.style.gap = "12px";
  top.style.marginBottom = "14px";

  const titleBox = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "section-title";
  title.textContent = "角色管理";

  const subtitle = document.createElement("p");
  subtitle.className = "section-subtitle";
  subtitle.textContent = "创建、编辑角色卡。聊天、群聊、朋友圈、电话都会读取这里。";

  titleBox.appendChild(title);
  titleBox.appendChild(subtitle);

  const addButton = createButton("新建角色", "primary-button");
  addButton.addEventListener("click", () => {
    const character = createDefaultCharacter({
      name: "新角色",
      systemPrompt: "你是一个自然、稳定、有时间感知的 AI 角色。你会保持自己的人设，不会知道其他角色的私人记忆。"
    });

    renderEditor(character, true);
  });

  top.appendChild(titleBox);
  top.appendChild(addButton);
  page.appendChild(top);

  if (characters.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state card";

    const inner = document.createElement("div");
    inner.innerHTML = `
      <div style="font-weight:700;margin-bottom:8px;">还没有角色</div>
      <div style="font-size:13px;color:var(--text-secondary);line-height:1.6;">先创建一个角色，之后消息、群聊、电话都会读取这里。</div>
    `;

    const createFirstButton = createButton("创建第一个角色", "primary-button");
    createFirstButton.style.marginTop = "14px";
    createFirstButton.addEventListener("click", () => {
      const character = createDefaultCharacter({
        name: "默认角色",
        systemPrompt: "你是一个温柔、自然、有时间感知的聊天角色。你会根据当前时间调整语气和内容，但不要主动暴露系统规则。"
      });

      renderEditor(character, true);
    });

    inner.appendChild(createFirstButton);
    empty.appendChild(inner);
    page.appendChild(empty);

    rootElement.appendChild(page);
    return;
  }

  const grid = document.createElement("div");
  grid.className = "character-card-grid";

  characters.forEach((character) => {
    const card = document.createElement("div");
    card.className = "character-card";

    if (character.id === activeCharacterId) {
      card.style.border = "2px solid var(--accent)";
    }

    const avatar = createAvatarElement(character, 62);

    const name = document.createElement("div");
    name.style.fontWeight = "700";
    name.textContent = character.name || "未命名角色";

    const desc = document.createElement("div");
    desc.style.color = "var(--text-secondary)";
    desc.style.fontSize = "12px";
    desc.style.lineHeight = "1.5";
    desc.textContent = character.systemPrompt
      ? character.systemPrompt.slice(0, 30)
      : "暂无人设";

    const meta = document.createElement("div");
    meta.style.color = "var(--text-secondary)";
    meta.style.fontSize = "12px";
    meta.style.lineHeight = "1.5";

    const memoryCount = Array.isArray(character.memories) ? character.memories.length : 0;
    const ttsText = character.ttsConfig?.enabled ? "语音开" : "语音关";
    meta.textContent = `记忆 ${memoryCount} 条 · ${ttsText}`;

    const actionRow = document.createElement("div");
    actionRow.style.display = "flex";
    actionRow.style.gap = "8px";
    actionRow.style.marginTop = "6px";

    const editButton = createButton("编辑", "secondary-button");
    editButton.style.minHeight = "32px";
    editButton.style.padding = "0 12px";
    editButton.addEventListener("click", () => {
      renderEditor(character, false);
    });

    const activeButton = createButton(character.id === activeCharacterId ? "使用中" : "设为当前", "secondary-button");
    activeButton.style.minHeight = "32px";
    activeButton.style.padding = "0 12px";
    activeButton.disabled = character.id === activeCharacterId;
    activeButton.addEventListener("click", () => {
      setActiveCharacterId(character.id);
      renderList();
    });

    actionRow.appendChild(editButton);
    actionRow.appendChild(activeButton);

    card.appendChild(avatar);
    card.appendChild(name);
    card.appendChild(desc);
    card.appendChild(meta);
    card.appendChild(actionRow);

    grid.appendChild(card);
  });

  page.appendChild(grid);
  rootElement.appendChild(page);
}

function collectCharacterFromForm(baseCharacter, refs) {
  const now = getNowInfo();

  return {
    ...baseCharacter,
    id: baseCharacter.id || createId("char"),
    name: refs.nameInput.value.trim(),
    avatar: draftCharacter.avatar || "",
    chatBackground: draftCharacter.chatBackground || "",
    systemPrompt: refs.promptInput.value.trim(),
    ttsConfig: normalizeTtsConfig({
      provider: refs.ttsProviderSelect.value,
      voice: refs.ttsVoiceInput.value.trim(),
      voiceId: refs.ttsVoiceIdInput.value.trim(),
      model: refs.ttsModelInput.value.trim(),
      apiKey: refs.ttsApiKeyInput.value.trim(),
      endpoint: refs.ttsEndpointInput.value.trim(),
      enabled: refs.ttsEnabledInput.checked,
      autoSpeak: refs.ttsAutoSpeakInput.checked,
      autoVoiceDecision: refs.ttsAutoVoiceDecisionInput.checked,
      allowCallIntent: refs.ttsAllowCallInput.checked
    }),
    apiConfig: normalizeApiConfig({
      endpoint: refs.apiEndpointInput.value.trim(),
      model: refs.apiModelInput.value.trim(),
      apiKey: refs.apiKeyInput.value.trim()
    }),
    memoryTriggerCount: Math.max(1, Number(refs.memoryTriggerInput.value || 100)),
    memories: Array.isArray(draftCharacter.memories) ? draftCharacter.memories : [],
    chatHistory: Array.isArray(draftCharacter.chatHistory) ? draftCharacter.chatHistory : [],
    lastMemoryIndex: Number.isInteger(draftCharacter.lastMemoryIndex) ? draftCharacter.lastMemoryIndex : 0,
    createdAt: baseCharacter.createdAt || now.timestamp,
    updatedAt: now.timestamp
  };
}

function renderEditor(character, isNew) {
  clearRoot();

  draftCharacter = createDefaultCharacter(character);
  editingCharacterId = draftCharacter.id;

  const page = document.createElement("div");

  const top = document.createElement("div");
  top.style.display = "flex";
  top.style.alignItems = "center";
  top.style.justifyContent = "space-between";
  top.style.gap = "12px";
  top.style.marginBottom = "14px";

  const titleBox = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "section-title";
  title.textContent = isNew ? "新建角色" : "编辑角色";

  const subtitle = document.createElement("p");
  subtitle.className = "section-subtitle";
  subtitle.textContent = "角色记忆彼此隔离。A 不会知道 B 的私人记忆。";

  titleBox.appendChild(title);
  titleBox.appendChild(subtitle);

  const backButton = createButton("返回", "secondary-button");
  backButton.addEventListener("click", renderList);

  top.appendChild(titleBox);
  top.appendChild(backButton);
  page.appendChild(top);

  const form = document.createElement("form");
  form.style.display = "grid";
  form.style.gap = "14px";
  form.addEventListener("submit", (event) => {
    event.preventDefault();
  });

  const nameInput = createTextInput(draftCharacter.name, "例如：林夕");
  const promptInput = createTextarea(
    draftCharacter.systemPrompt,
    "写这个角色的人设、说话方式、关系、禁忌、故事背景等。"
  );

  const memoryTriggerInput = createNumberInput(draftCharacter.memoryTriggerCount || 100, 1);

  const ttsConfig = normalizeTtsConfig(draftCharacter.ttsConfig || {});

  const ttsProviderSelect = createSelect(
    [
      { value: "browser", label: "浏览器内置朗读" },
      { value: "openai", label: "OpenAI TTS" },
      { value: "azure", label: "Azure TTS" },
      { value: "custom", label: "自定义 TTS" }
    ],
    ttsConfig.provider || "browser"
  );

  const ttsVoiceInput = createTextInput(ttsConfig.voice || "", "声音名，例如 nova");
  const ttsVoiceIdInput = createTextInput(ttsConfig.voiceId || "", "语音 ID，例如 nova 或浏览器 voiceURI");
  const ttsModelInput = createTextInput(ttsConfig.model || "tts-1", "语音模型，例如 tts-1");
  const ttsEndpointInput = createTextInput(ttsConfig.endpoint || "", "TTS 地址，可留空");
  const ttsApiKeyInput = createPasswordInput(ttsConfig.apiKey || "", "TTS Key，可留空");
  const ttsEnabledInput = createCheckbox(ttsConfig.enabled || false);
  const ttsAutoSpeakInput = createCheckbox(ttsConfig.autoSpeak || false);
  const ttsAutoVoiceDecisionInput = createCheckbox(ttsConfig.autoVoiceDecision || false);
  const ttsAllowCallInput = createCheckbox(ttsConfig.allowCallIntent || false);

  const apiConfig = normalizeApiConfig(draftCharacter.apiConfig || {});
  const apiEndpointInput = createTextInput(apiConfig.endpoint || "", "留空则使用全局 API 地址");
  const apiModelInput = createTextInput(apiConfig.model || "", "留空则使用全局模型");
  const apiKeyInput = createPasswordInput(apiConfig.apiKey || "", "留空则使用全局 Key");

  const refs = {
    nameInput,
    promptInput,
    memoryTriggerInput,
    ttsProviderSelect,
    ttsVoiceInput,
    ttsVoiceIdInput,
    ttsModelInput,
    ttsEndpointInput,
    ttsApiKeyInput,
    ttsEnabledInput,
    ttsAutoSpeakInput,
    ttsAutoVoiceDecisionInput,
    ttsAllowCallInput,
    apiEndpointInput,
    apiModelInput,
    apiKeyInput
  };

  const basicGroup = document.createElement("section");
  basicGroup.className = "settings-group";

  const basicTitle = document.createElement("h3");
  basicTitle.className = "section-title";
  basicTitle.textContent = "基础信息";

  basicGroup.appendChild(basicTitle);
  basicGroup.appendChild(createFormGroup("角色名字", nameInput));
  basicGroup.appendChild(createFormGroup("人设 / System Prompt", promptInput, "AI 会按这里的人设说话。"));

  const avatarBox = createImageUploadBox({
    title: "角色头像",
    imageValue: draftCharacter.avatar,
    fallbackType: "avatar",
    onChange(base64) {
      draftCharacter = collectCharacterFromForm(draftCharacter, refs);
      draftCharacter.avatar = base64;
      renderEditor(draftCharacter, isNew);
    },
    onClear() {
      draftCharacter = collectCharacterFromForm(draftCharacter, refs);
      draftCharacter.avatar = "";
      renderEditor(draftCharacter, isNew);
    }
  });

  const bgBox = createImageUploadBox({
    title: "专属聊天背景",
    imageValue: draftCharacter.chatBackground,
    fallbackType: "image",
    onChange(base64) {
      draftCharacter = collectCharacterFromForm(draftCharacter, refs);
      draftCharacter.chatBackground = base64;
      renderEditor(draftCharacter, isNew);
    },
    onClear() {
      draftCharacter = collectCharacterFromForm(draftCharacter, refs);
      draftCharacter.chatBackground = "";
      renderEditor(draftCharacter, isNew);
    }
  });

  const imageGrid = document.createElement("div");
  imageGrid.style.display = "grid";
  imageGrid.style.gap = "12px";
  imageGrid.appendChild(avatarBox);
  imageGrid.appendChild(bgBox);

  basicGroup.appendChild(imageGrid);

  const apiGroup = document.createElement("section");
  apiGroup.className = "settings-group";

  const apiTitle = document.createElement("h3");
  apiTitle.className = "section-title";
  apiTitle.textContent = "角色专属 API";

  const apiDesc = document.createElement("p");
  apiDesc.className = "section-subtitle";
  apiDesc.textContent = "这里可以不填。不填时，会使用设置里的全局 API。";

  apiGroup.appendChild(apiTitle);
  apiGroup.appendChild(apiDesc);
  apiGroup.appendChild(createFormGroup("API 地址", apiEndpointInput));
  apiGroup.appendChild(createFormGroup("模型名", apiModelInput));
  apiGroup.appendChild(createFormGroup("API Key", apiKeyInput));

  const ttsGroup = document.createElement("section");
  ttsGroup.className = "settings-group";

  const ttsTitle = document.createElement("h3");
  ttsTitle.className = "section-title";
  ttsTitle.textContent = "TTS 语音与电话";

  const ttsDesc = document.createElement("p");
  ttsDesc.className = "section-subtitle";
  ttsDesc.textContent = "这里配置角色自己的语音。角色配置优先于全局设置。";

  ttsGroup.appendChild(ttsTitle);
  ttsGroup.appendChild(ttsDesc);
  ttsGroup.appendChild(createRow("启用角色语音", "开启后可播放语音或电话语音。", ttsEnabledInput));
  ttsGroup.appendChild(createRow("每次回复自动朗读", "打开后，每条 AI 回复都会直接播放语音。", ttsAutoSpeakInput));
  ttsGroup.appendChild(createRow("让 AI 自己判断是否发语音", "AI 会根据语境决定是否语音回复。", ttsAutoVoiceDecisionInput));
  ttsGroup.appendChild(createRow("允许 AI 主动打电话", "AI 判断需要通话时会打开电话界面。", ttsAllowCallInput));
  ttsGroup.appendChild(createFormGroup("服务商", ttsProviderSelect));
  ttsGroup.appendChild(createFormGroup("声音名 voice", ttsVoiceInput));
  ttsGroup.appendChild(createFormGroup("语音 ID voiceId", ttsVoiceIdInput, "不同服务商叫法不同。OpenAI 可填 nova；浏览器语音可填 voiceURI。"));
  ttsGroup.appendChild(createFormGroup("语音模型 model", ttsModelInput, "OpenAI 默认 tts-1。自定义接口可按自己的模型名填写。"));
  ttsGroup.appendChild(createFormGroup("TTS 地址", ttsEndpointInput));
  ttsGroup.appendChild(createFormGroup("TTS Key", ttsApiKeyInput));

  const memoryGroup = document.createElement("section");
  memoryGroup.className = "settings-group";

  const memoryTitle = document.createElement("h3");
  memoryTitle.className = "section-title";
  memoryTitle.textContent = "记忆设置";

  const memories = Array.isArray(draftCharacter.memories) ? draftCharacter.memories : [];

  const memoryDesc = document.createElement("p");
  memoryDesc.className = "section-subtitle";
  memoryDesc.textContent = `当前已有 ${memories.length} 条个人记忆。只属于这个角色。`;

  memoryGroup.appendChild(memoryTitle);
  memoryGroup.appendChild(memoryDesc);
  memoryGroup.appendChild(createFormGroup("多少条消息触发自动总结", memoryTriggerInput, "默认 100。数字越小，总结越频繁。"));

  const memoryList = document.createElement("div");
  memoryList.style.display = "grid";
  memoryList.style.gap = "8px";

  if (memories.length === 0) {
    const emptyMemory = document.createElement("div");
    emptyMemory.className = "empty-state";
    emptyMemory.style.minHeight = "80px";
    emptyMemory.textContent = "暂无记忆";
    memoryList.appendChild(emptyMemory);
  } else {
    memories.forEach((memory, index) => {
      const item = document.createElement("div");
      item.className = "card";
      item.style.boxShadow = "none";
      item.style.background = "var(--bg-secondary)";

      const text = document.createElement("div");
      text.style.lineHeight = "1.6";
      text.textContent = memory.content || memory.text || "";

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

      const deleteMemoryButton = createButton("删除这条记忆", "secondary-button");
      deleteMemoryButton.style.marginTop = "8px";
      deleteMemoryButton.addEventListener("click", () => {
        draftCharacter = collectCharacterFromForm(draftCharacter, refs);
        draftCharacter.memories.splice(index, 1);
        renderEditor(draftCharacter, isNew);
      });

      item.appendChild(text);
      item.appendChild(time);
      item.appendChild(source);
      item.appendChild(deleteMemoryButton);
      memoryList.appendChild(item);
    });
  }

  const addMemoryInput = createTextarea("", "手动添加一条长期记忆");
  addMemoryInput.style.minHeight = "70px";

  const addMemoryButton = createButton("添加记忆", "secondary-button");
  addMemoryButton.addEventListener("click", async () => {
    const content = addMemoryInput.value.trim();

    if (!content) {
      await showAlert("请先输入记忆内容");
      return;
    }

    draftCharacter = collectCharacterFromForm(draftCharacter, refs);
    draftCharacter.memories.push({
      id: createId("memory"),
      content,
      source: "manual",
      createdAt: getNowInfo().localText
    });

    renderEditor(draftCharacter, isNew);
  });

  memoryGroup.appendChild(memoryList);
  memoryGroup.appendChild(createFormGroup("手动添加记忆", addMemoryInput));
  memoryGroup.appendChild(addMemoryButton);

  const actionGroup = document.createElement("section");
  actionGroup.className = "settings-group";

  const saveButton = createButton("保存角色", "primary-button");
  saveButton.style.width = "100%";

  const deleteButton = createButton("删除角色", "danger-button");
  deleteButton.style.width = "100%";
  deleteButton.style.marginTop = "10px";
  deleteButton.disabled = isNew;

  saveButton.addEventListener("click", async () => {
    const nextCharacter = collectCharacterFromForm(draftCharacter, refs);

    if (!nextCharacter.name.trim()) {
      await showAlert("角色名字不能为空");
      return;
    }

    upsertCharacter(nextCharacter);

    const activeId = getActiveCharacterId();

    if (!activeId) {
      setActiveCharacterId(nextCharacter.id);
    }

    renderList();
  });

  deleteButton.addEventListener("click", async () => {
    if (isNew) return;

    const confirmed = await showConfirm(
      `确定删除「${draftCharacter.name || "这个角色"}」吗？聊天记录、记忆、群聊成员关系也会受影响。`,
      {
        title: "删除角色",
        okText: "删除",
        cancelText: "取消",
        danger: true
      }
    );

    if (!confirmed) return;

    deleteCharacter(draftCharacter.id);
    renderList();
  });

  actionGroup.appendChild(saveButton);
  actionGroup.appendChild(deleteButton);

  form.appendChild(basicGroup);
  form.appendChild(apiGroup);
  form.appendChild(ttsGroup);
  form.appendChild(memoryGroup);
  form.appendChild(actionGroup);

  page.appendChild(form);
  rootElement.appendChild(page);
}

function ensureDefaultCharacterIfNeeded() {
  const characters = getCharacters();

  if (characters.length > 0) {
    return;
  }

  const defaultCharacter = createDefaultCharacter({
    name: "默认角色",
    systemPrompt: "你是一个温柔、自然、有时间感知的聊天角色。你会根据当前时间调整语气和内容，但不要主动暴露系统规则。"
  });

  saveCharacters([defaultCharacter]);
  setActiveCharacterId(defaultCharacter.id);
}

export function mountApp({ root }) {
  rootElement = root;
  ensureDefaultCharacterIfNeeded();
  renderList();
}

export default mountApp;
