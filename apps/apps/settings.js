import {
  createId,
  getSettings,
  saveSettings,
  getApiEndpoints,
  saveApiEndpoints,
  getMcpServers,
  saveMcpServers,
  getAllAppData,
  importAllAppData,
  clearAllAppData,
  downloadJsonFile,
  readJsonFile,
  getStorageUsage,
  normalizeTtsConfig
} from "../core/storage.js";

import {
  testApiConnection
} from "../core/api.js";

import {
  getThemeList,
  applyTheme,
  getCurrentThemeId,
  buildThemeEditorData,
  saveCustomTheme,
  resetCustomTheme
} from "../core/theme.js";

import {
  showAlert,
  showConfirm
} from "../core/ui.js";

let rootElement = null;

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

function createInput(value = "", placeholder = "", type = "text") {
  const input = document.createElement("input");
  input.className = "text-input";
  input.type = type;
  input.value = value || "";
  input.placeholder = placeholder || "";
  return input;
}

function createTextarea(value = "", placeholder = "") {
  const textarea = document.createElement("textarea");
  textarea.className = "textarea-input";
  textarea.value = value || "";
  textarea.placeholder = placeholder || "";
  return textarea;
}

function createSelect(options = [], value = "") {
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

function createGroup(titleText, subtitleText = "") {
  const group = document.createElement("section");
  group.className = "settings-group";

  const title = document.createElement("h3");
  title.className = "section-title";
  title.textContent = titleText;

  group.appendChild(title);

  if (subtitleText) {
    const subtitle = document.createElement("p");
    subtitle.className = "section-subtitle";
    subtitle.textContent = subtitleText;
    group.appendChild(subtitle);
  }

  return group;
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

function createRow(titleText, descText, rightElement) {
  const row = document.createElement("div");
  row.className = "settings-row";

  const text = document.createElement("div");

  const title = document.createElement("div");
  title.className = "settings-row-title";
  title.textContent = titleText;

  text.appendChild(title);

  if (descText) {
    const desc = document.createElement("div");
    desc.className = "settings-row-desc";
    desc.textContent = descText;
    text.appendChild(desc);
  }

  row.appendChild(text);
  row.appendChild(rightElement);

  return row;
}

function render() {
  rootElement.innerHTML = "";

  const page = document.createElement("div");
  page.style.paddingBottom = "20px";

  const header = document.createElement("div");
  header.style.marginBottom = "14px";

  const title = document.createElement("h2");
  title.className = "section-title";
  title.textContent = "设置";

  const subtitle = document.createElement("p");
  subtitle.className = "section-subtitle";
  subtitle.textContent = "配置 API、语音、记忆、群聊、MCP、主题和数据备份。";

  header.appendChild(title);
  header.appendChild(subtitle);

  page.appendChild(header);
  page.appendChild(renderApiSettings());
  page.appendChild(renderTtsSettings());
  page.appendChild(renderMemorySettings());
  page.appendChild(renderMcpSettings());
  page.appendChild(renderThemeSettings());
  page.appendChild(renderDataSettings());

  rootElement.appendChild(page);
}

function renderApiSettings() {
  const settings = getSettings();
  const endpoints = getApiEndpoints();

  const group = createGroup("API 配置", "支持添加多个 OpenAI 兼容接口。角色没有单独配置时，会使用这里的全局配置。");

  const defaultOptions = [
    {
      value: "",
      label: "不选择"
    },
    ...endpoints.map((endpoint) => ({
      value: endpoint.id,
      label: endpoint.name || endpoint.endpoint || "未命名端点"
    }))
  ];

  const defaultSelect = createSelect(defaultOptions, settings.defaultApiEndpointId || "");
  defaultSelect.addEventListener("change", () => {
    saveSettings({
      defaultApiEndpointId: defaultSelect.value
    });
  });

  const defaultModelInput = createInput(settings.defaultModel || "", "例如：gpt-4o-mini");
  defaultModelInput.addEventListener("change", () => {
    saveSettings({
      defaultModel: defaultModelInput.value.trim()
    });
  });

  group.appendChild(createFormGroup("默认 API 端点", defaultSelect));
  group.appendChild(createFormGroup("全局默认模型", defaultModelInput));

  const list = document.createElement("div");
  list.style.display = "grid";
  list.style.gap = "10px";
  list.style.marginTop = "12px";

  if (endpoints.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.style.minHeight = "80px";
    empty.textContent = "还没有 API 端点";
    list.appendChild(empty);
  } else {
    endpoints.forEach((endpoint) => {
      list.appendChild(createEndpointCard(endpoint));
    });
  }

  const addButton = createButton("添加 API 端点", "primary-button");
  addButton.style.marginTop = "12px";
  addButton.style.width = "100%";
  addButton.addEventListener("click", () => {
    showEndpointEditor();
  });

  group.appendChild(list);
  group.appendChild(addButton);

  return group;
}

function createEndpointCard(endpoint) {
  const card = document.createElement("div");
  card.className = "card";
  card.style.boxShadow = "none";
  card.style.background = "var(--bg-secondary)";
  card.style.display = "grid";
  card.style.gap = "8px";

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.textContent = endpoint.name || "未命名端点";

  const info = document.createElement("div");
  info.style.fontSize = "12px";
  info.style.color = "var(--text-secondary)";
  info.style.lineHeight = "1.7";
  info.innerHTML = `
    <div>地址：${escapeHtml(endpoint.endpoint || "未填写")}</div>
    <div>模型：${escapeHtml(endpoint.model || "未填写")}</div>
    <div>Key：${endpoint.apiKey ? "已填写" : "未填写"}</div>
  `;

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";
  actions.style.flexWrap = "wrap";

  const editButton = createButton("编辑", "secondary-button");
  editButton.addEventListener("click", () => {
    showEndpointEditor(endpoint);
  });

  const testButton = createButton("测试", "secondary-button");
  testButton.addEventListener("click", async () => {
    testButton.disabled = true;
    testButton.textContent = "测试中";

    try {
      const result = await testApiConnection({
        endpoint: endpoint.endpoint,
        apiKey: endpoint.apiKey,
        model: endpoint.model || getSettings().defaultModel
      });

      await showAlert(result || "连接成功");
    } catch (error) {
      await showAlert(`连接失败：${error.message || "未知错误"}`);
    } finally {
      testButton.disabled = false;
      testButton.textContent = "测试";
    }
  });

  const deleteButton = createButton("删除", "danger-button");
  deleteButton.addEventListener("click", async () => {
    const confirmed = await showConfirm(`确定删除「${endpoint.name || "这个端点"}」吗？`, {
      title: "删除 API 端点",
      okText: "删除",
      cancelText: "取消",
      danger: true
    });

    if (!confirmed) return;

    const endpoints = getApiEndpoints().filter((item) => item.id !== endpoint.id);
    saveApiEndpoints(endpoints);

    const settings = getSettings();

    if (settings.defaultApiEndpointId === endpoint.id) {
      saveSettings({
        defaultApiEndpointId: ""
      });
    }

    render();
  });

  actions.appendChild(editButton);
  actions.appendChild(testButton);
  actions.appendChild(deleteButton);

  card.appendChild(title);
  card.appendChild(info);
  card.appendChild(actions);

  return card;
}

function showEndpointEditor(endpoint = null) {
  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "12px";

  const nameInput = createInput(endpoint?.name || "", "例如：我的中转站");
  const endpointInput = createInput(endpoint?.endpoint || "", "例如：https://api.example.com");
  const apiKeyInput = createInput(endpoint?.apiKey || "", "API Key", "password");
  const modelInput = createInput(endpoint?.model || "", "可选：这个端点默认模型");

  const saveButton = createButton("保存", "primary-button");
  saveButton.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const url = endpointInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    const model = modelInput.value.trim();

    if (!name) {
      await showAlert("请填写名称");
      return;
    }

    if (!url) {
      await showAlert("请填写 API 地址");
      return;
    }

    const endpoints = getApiEndpoints();
    const nextEndpoint = {
      id: endpoint?.id || createId("endpoint"),
      name,
      endpoint: url,
      apiKey,
      model
    };

    const index = endpoints.findIndex((item) => item.id === nextEndpoint.id);

    if (index >= 0) {
      endpoints[index] = nextEndpoint;
    } else {
      endpoints.push(nextEndpoint);
    }

    saveApiEndpoints(endpoints);

    const settings = getSettings();

    if (!settings.defaultApiEndpointId) {
      saveSettings({
        defaultApiEndpointId: nextEndpoint.id
      });
    }

    closeModal();
    render();
  });

  body.appendChild(createFormGroup("名称", nameInput));
  body.appendChild(createFormGroup("API 地址", endpointInput, "可以填根地址，也可以填完整 /v1/chat/completions 地址。"));
  body.appendChild(createFormGroup("API Key", apiKeyInput));
  body.appendChild(createFormGroup("默认模型", modelInput));
  body.appendChild(saveButton);

  showModal(endpoint ? "编辑 API 端点" : "添加 API 端点", body);
}

function renderTtsSettings() {
  const settings = getSettings();
  const tts = normalizeTtsConfig(settings.globalTts || {});

  const group = createGroup("全局语音与电话", "角色没有单独配置时，会使用这里的语音配置。角色单独配置优先。");

  const providerSelect = createSelect(
    [
      { value: "browser", label: "浏览器内置朗读" },
      { value: "openai", label: "OpenAI TTS" },
      { value: "azure", label: "Azure TTS" },
      { value: "custom", label: "自定义 TTS" }
    ],
    tts.provider || "browser"
  );

  const voiceInput = createInput(tts.voice || "", "声音名，例如 nova");
  const voiceIdInput = createInput(tts.voiceId || "", "语音 ID，例如 nova 或浏览器 voiceURI");
  const modelInput = createInput(tts.model || "tts-1", "语音模型，例如 tts-1");
  const endpointInput = createInput(tts.endpoint || "", "TTS 地址");
  const apiKeyInput = createInput(tts.apiKey || "", "TTS Key", "password");

  const enabledInput = createCheckbox(tts.enabled || false);
  const autoSpeakInput = createCheckbox(tts.autoSpeak || false);
  const autoVoiceDecisionInput = createCheckbox(tts.autoVoiceDecision || false);
  const allowCallInput = createCheckbox(tts.allowCallIntent || false);

  const saveButton = createButton("保存全局语音配置", "primary-button");
  saveButton.style.width = "100%";
  saveButton.addEventListener("click", async () => {
    saveSettings({
      globalTts: normalizeTtsConfig({
        provider: providerSelect.value,
        voice: voiceInput.value.trim(),
        voiceId: voiceIdInput.value.trim(),
        model: modelInput.value.trim(),
        endpoint: endpointInput.value.trim(),
        apiKey: apiKeyInput.value.trim(),
        enabled: enabledInput.checked,
        autoSpeak: autoSpeakInput.checked,
        autoVoiceDecision: autoVoiceDecisionInput.checked,
        allowCallIntent: allowCallInput.checked
      })
    });

    await showAlert("已保存");
    render();
  });

  group.appendChild(createRow("启用全局语音", "角色没有单独配置时使用这里。", enabledInput));
  group.appendChild(createRow("每次回复自动朗读", "打开后，AI 每条回复都会直接播放语音。", autoSpeakInput));
  group.appendChild(createRow("让 AI 自己判断是否发语音", "AI 会根据语境决定是否语音回复。", autoVoiceDecisionInput));
  group.appendChild(createRow("允许 AI 主动打电话", "AI 判断需要通话时会打开电话界面。", allowCallInput));
  group.appendChild(createFormGroup("服务商", providerSelect));
  group.appendChild(createFormGroup("声音名 voice", voiceInput));
  group.appendChild(createFormGroup("语音 ID voiceId", voiceIdInput, "OpenAI 可填 nova；浏览器语音可填 voiceURI；自定义服务按你的接口填写。"));
  group.appendChild(createFormGroup("语音模型 model", modelInput, "OpenAI 默认 tts-1。自定义接口可填自己的模型名。"));
  group.appendChild(createFormGroup("TTS 地址", endpointInput));
  group.appendChild(createFormGroup("TTS Key", apiKeyInput));
  group.appendChild(saveButton);

  return group;
}

function renderMemorySettings() {
  const settings = getSettings();

  const group = createGroup("记忆与群聊", "控制自动记忆、时间感知和群聊自动回复。");

  const memoryCountInput = createInput(settings.memoryTriggerCount || 100, "默认 100", "number");
  memoryCountInput.min = "1";

  const autoMemoryInput = createCheckbox(settings.autoMemoryEnabled !== false);
  const activeMemoryInput = createCheckbox(settings.activeMemoryEnabled !== false);
  const timeInput = createCheckbox(settings.aiTimeAwarenessEnabled !== false);
  const autoMomentInput = createCheckbox(settings.autoMomentEnabled !== false);

  const groupModeSelect = createSelect(
    [
      { value: "one", label: "默认一个成员回复" },
      { value: "all", label: "允许所有成员轮流回复" }
    ],
    settings.groupChat.defaultReplyMode || "one"
  );

  const maxAutoRepliesInput = createInput(settings.groupChat.maxAutoReplies || 3, "最多自动回复人数", "number");
  maxAutoRepliesInput.min = "1";

  const saveButton = createButton("保存记忆设置", "primary-button");
  saveButton.style.width = "100%";
  saveButton.addEventListener("click", async () => {
    saveSettings({
      memoryTriggerCount: Math.max(1, Number(memoryCountInput.value || 100)),
      autoMemoryEnabled: autoMemoryInput.checked,
      activeMemoryEnabled: activeMemoryInput.checked,
      aiTimeAwarenessEnabled: timeInput.checked,
      autoMomentEnabled: autoMomentInput.checked,
      groupChat: {
        defaultReplyMode: groupModeSelect.value,
        maxAutoReplies: Math.max(1, Number(maxAutoRepliesInput.value || 3))
      }
    });

    await showAlert("已保存");
    render();
  });

  group.appendChild(createFormGroup("自动总结触发条数", memoryCountInput, "聊天达到多少条后自动总结成长期记忆。"));
  group.appendChild(createRow("启用自动记忆", "关闭后不会自动写入长期记忆。", autoMemoryInput));
  group.appendChild(createRow("启用主动记忆", "每次回复后判断是否有值得记住的内容。", activeMemoryInput));
  group.appendChild(createRow("AI 时间感知", "让 AI 知道当前日期、时间和星期。", timeInput));
  group.appendChild(createRow("AI 自动朋友圈", "后续自动朋友圈逻辑会读取这个开关。", autoMomentInput));
  group.appendChild(createFormGroup("群聊默认回复模式", groupModeSelect));
  group.appendChild(createFormGroup("群聊最多自动回复人数", maxAutoRepliesInput));
  group.appendChild(saveButton);

  return group;
}

function renderMcpSettings() {
  const servers = getMcpServers();

  const group = createGroup("MCP 工具配置", "添加 MCP Server 后，消息应用的工具栏会展示这些工具。真正调用工具后续单独接。");

  const list = document.createElement("div");
  list.style.display = "grid";
  list.style.gap = "10px";

  if (servers.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.style.minHeight = "80px";
    empty.textContent = "还没有 MCP Server";
    list.appendChild(empty);
  } else {
    servers.forEach((server) => {
      list.appendChild(createMcpCard(server));
    });
  }

  const addButton = createButton("添加 MCP Server", "primary-button");
  addButton.style.width = "100%";
  addButton.style.marginTop = "12px";
  addButton.addEventListener("click", () => {
    showMcpEditor();
  });

  group.appendChild(list);
  group.appendChild(addButton);

  return group;
}

function createMcpCard(server) {
  const card = document.createElement("div");
  card.className = "card";
  card.style.boxShadow = "none";
  card.style.background = "var(--bg-secondary)";
  card.style.display = "grid";
  card.style.gap = "8px";

  const title = document.createElement("div");
  title.style.fontWeight = "700";
  title.textContent = server.name || "未命名 MCP";

  const info = document.createElement("div");
  info.style.fontSize = "12px";
  info.style.color = "var(--text-secondary)";
  info.style.lineHeight = "1.7";
  info.innerHTML = `
    <div>地址：${escapeHtml(server.url || "未填写")}</div>
    <div>描述：${escapeHtml(server.description || "无")}</div>
  `;

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.gap = "8px";

  const editButton = createButton("编辑", "secondary-button");
  editButton.addEventListener("click", () => {
    showMcpEditor(server);
  });

  const deleteButton = createButton("删除", "danger-button");
  deleteButton.addEventListener("click", async () => {
    const confirmed = await showConfirm(`确定删除「${server.name || "这个 MCP"}」吗？`, {
      title: "删除 MCP Server",
      okText: "删除",
      cancelText: "取消",
      danger: true
    });

    if (!confirmed) return;

    const nextServers = getMcpServers().filter((item) => item.id !== server.id);
    saveMcpServers(nextServers);
    render();
  });

  actions.appendChild(editButton);
  actions.appendChild(deleteButton);

  card.appendChild(title);
  card.appendChild(info);
  card.appendChild(actions);

  return card;
}

function showMcpEditor(server = null) {
  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "12px";

  const nameInput = createInput(server?.name || "", "工具名称");
  const urlInput = createInput(server?.url || "", "Server URL");
  const descInput = createTextarea(server?.description || "", "描述这个工具能做什么");

  const saveButton = createButton("保存", "primary-button");
  saveButton.addEventListener("click", async () => {
    const name = nameInput.value.trim();
    const url = urlInput.value.trim();

    if (!name) {
      await showAlert("请填写名称");
      return;
    }

    if (!url) {
      await showAlert("请填写 URL");
      return;
    }

    const servers = getMcpServers();
    const nextServer = {
      id: server?.id || createId("mcp"),
      name,
      url,
      description: descInput.value.trim()
    };

    const index = servers.findIndex((item) => item.id === nextServer.id);

    if (index >= 0) {
      servers[index] = nextServer;
    } else {
      servers.push(nextServer);
    }

    saveMcpServers(servers);
    closeModal();
    render();
  });

  body.appendChild(createFormGroup("名称", nameInput));
  body.appendChild(createFormGroup("URL", urlInput));
  body.appendChild(createFormGroup("描述", descInput));
  body.appendChild(saveButton);

  showModal(server ? "编辑 MCP Server" : "添加 MCP Server", body);
}

function renderThemeSettings() {
  const group = createGroup("主题设置", "切换预设主题，或直接修改主题变量。");

  const themeList = getThemeList();
  const activeThemeId = getCurrentThemeId();

  const previewList = document.createElement("div");
  previewList.className = "theme-preview-list";

  themeList.forEach((theme) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "theme-preview";
    button.classList.toggle("active", theme.id === activeThemeId);
    button.dataset.themeId = theme.id;

    const name = document.createElement("div");
    name.className = "theme-preview-name";
    name.textContent = theme.name;

    const desc = document.createElement("div");
    desc.className = "settings-row-desc";
    desc.textContent = theme.description;

    const colors = document.createElement("div");
    colors.className = "theme-preview-colors";

    ["--bg-primary", "--bg-secondary", "--accent", "--bubble-user-bg"].forEach((key) => {
      const dot = document.createElement("span");
      dot.className = "theme-color-dot";
      dot.style.background = theme.variables[key];
      colors.appendChild(dot);
    });

    button.appendChild(name);
    button.appendChild(desc);
    button.appendChild(colors);

    button.addEventListener("click", () => {
      applyTheme(theme.id);
      render();
    });

    previewList.appendChild(button);
  });

  const customButton = createButton("编辑自定义主题", "secondary-button");
  customButton.style.width = "100%";
  customButton.style.marginTop = "12px";
  customButton.addEventListener("click", showThemeEditor);

  const resetButton = createButton("恢复奶油白主题", "secondary-button");
  resetButton.style.width = "100%";
  resetButton.style.marginTop = "8px";
  resetButton.addEventListener("click", () => {
    resetCustomTheme();
    render();
  });

  group.appendChild(previewList);
  group.appendChild(customButton);
  group.appendChild(resetButton);

  return group;
}

function showThemeEditor() {
  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "10px";

  const rows = buildThemeEditorData();
  const inputs = {};

  rows.forEach((row) => {
    const input = createInput(row.value, row.name);
    inputs[row.name] = input;
    body.appendChild(createFormGroup(`${row.label} ${row.name}`, input));
  });

  const applyButton = createButton("应用自定义主题", "primary-button");
  applyButton.addEventListener("click", () => {
    const variables = {};

    Object.entries(inputs).forEach(([name, input]) => {
      variables[name] = input.value.trim();
    });

    saveCustomTheme(variables);
    closeModal();
    render();
  });

  body.appendChild(applyButton);

  showModal("自定义主题", body);
}

function renderDataSettings() {
  const usage = getStorageUsage();

  const group = createGroup("数据管理", "导出、导入或清空本地数据。数据只保存在当前浏览器。");

  const usageCard = document.createElement("div");
  usageCard.className = "card";
  usageCard.style.boxShadow = "none";
  usageCard.style.background = "var(--bg-secondary)";
  usageCard.style.marginBottom = "12px";
  usageCard.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px;">本地数据占用</div>
    <div style="color:var(--text-secondary);font-size:13px;">${escapeHtml(usage.totalText)}</div>
  `;

  const exportButton = createButton("导出全部数据", "primary-button");
  exportButton.style.width = "100%";
  exportButton.addEventListener("click", () => {
    const data = getAllAppData();
    downloadJsonFile(`ai-phone-backup-${Date.now()}.json`, data);
  });

  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importInput.className = "hidden";

  const importButton = createButton("导入 JSON 数据", "secondary-button");
  importButton.style.width = "100%";
  importButton.style.marginTop = "8px";
  importButton.addEventListener("click", () => {
    importInput.value = "";
    importInput.click();
  });

  importInput.addEventListener("change", async () => {
    try {
      const file = importInput.files[0];
      const data = await readJsonFile(file);

      const confirmed = await showConfirm("导入会覆盖或新增同名数据。是否继续？", {
        title: "导入数据",
        okText: "导入",
        cancelText: "取消"
      });

      if (!confirmed) return;

      importAllAppData(data, {
        clearBeforeImport: false
      });

      await showAlert("导入完成，请刷新页面。");
    } catch (error) {
      await showAlert(error.message || "导入失败");
    }
  });

  const clearButton = createButton("清空所有数据", "danger-button");
  clearButton.style.width = "100%";
  clearButton.style.marginTop = "8px";
  clearButton.addEventListener("click", async () => {
    const first = await showConfirm("确定清空所有数据吗？角色、聊天、记忆、设置都会删除。", {
      title: "清空所有数据",
      okText: "继续",
      cancelText: "取消",
      danger: true
    });

    if (!first) return;

    const second = await showConfirm("再次确认：这个操作不能撤销。", {
      title: "最终确认",
      okText: "清空",
      cancelText: "取消",
      danger: true
    });

    if (!second) return;

    const count = clearAllAppData();
    await showAlert(`已清空 ${count} 项数据，请刷新页面。`);
  });

  group.appendChild(usageCard);
  group.appendChild(exportButton);
  group.appendChild(importButton);
  group.appendChild(importInput);
  group.appendChild(clearButton);

  return group;
}

function showModal(titleText, bodyElement) {
  closeModal();

  const mask = document.createElement("div");
  mask.className = "modal-mask";
  mask.id = "settingsModalMask";

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
  const old = document.getElementById("settingsModalMask");

  if (old) {
    old.remove();
  }
}

export function mountApp({ root }) {
  rootElement = root;
  render();
}

export default mountApp;
