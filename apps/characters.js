import {
  readState,
  updateState,
  createCharacter,
  saveCharacter,
  deleteCharacter,
  ensureSingleConversation,
  exportCharacter,
  importCharacter,
  downloadText,
} from "../core/storage.js";
import {
  applyAppTheme,
  getAppTheme,
  updateAppTheme,
} from "../core/theme.js";
import {
  addCharacterMemory,
  updateCharacterMemory,
  deleteCharacterMemory,
  exportCharacterMemories,
  importCharacterMemories,
  getMemoryStats,
} from "../core/memory.js";
import {
  renderAppShell,
  createElement,
  clear,
  card,
  button,
  iconButton,
  listItem,
  createSearchBox,
  createTabs,
  createAccordion,
  openDrawer,
  closeDrawer,
  confirmAction,
  toast,
  formField,
  getFormValues,
  pickFile,
  renderThemeQuickSettings,
} from "../core/ui.js";

let host = null;
let context = null;
let state = null;
let activeTab = "list";
let searchText = "";
let selectedCharacterId = "";

export function mountApp(container, appContext = {}) {
  host = container;
  context = appContext;
  state = readState();

  applyAppTheme("characters", host);

  const { shell, content } = renderAppShell({
    title: "角色管理",
    onBack: context.close,
    actions: [
      iconButton("palette", "外观", openThemeDrawer),
      iconButton("plus", "新增角色", () => openCharacterEditor()),
    ],
  });

  host.replaceChildren(shell);
  renderCharacters(content);
}

export function renderApp(appContext = {}) {
  const wrapper = createElement("div");
  mountApp(wrapper, appContext);
  return wrapper;
}

function renderCharacters(content) {
  clear(content);

  content.append(
    createTabs([
      { id: "list", label: "角色" },
      { id: "persona", label: "我的人设" },
    ], activeTab, (tab) => {
      activeTab = tab;
      rerender();
    }),
  );

  if (activeTab === "list") {
    renderCharacterList(content);
  } else {
    renderPersonaList(content);
  }
}

function renderCharacterList(content) {
  const filtered = state.characters.filter((character) => {
    const text = `${character.name} ${character.description} ${character.personality}`.toLowerCase();
    return text.includes(searchText.toLowerCase());
  });

  content.append(createSearchBox("搜索角色", (value) => {
    searchText = value;
    rerender();
  }));

  const list = createElement("div", { className: "list" });
  filtered.forEach((character) => {
    const conversation = state.conversations.single[character.id];
    list.append(listItem({
      avatar: character.avatar,
      title: character.name,
      subtitle: character.description || character.personality || "还没有角色描述",
      meta: conversation?.lastMessageAt ? "已对话" : "未开始",
      onClick: () => openCharacterDetail(character.id),
    }));
  });

  content.append(list);

  if (!filtered.length) {
    content.append(card([
      createElement("h2", { className: "section-title", text: "还没有角色" }),
      createElement("p", { className: "muted", text: "新增角色后，就可以绑定 API、TTS、世界书和独立聊天背景。" }),
      button("创建第一个角色", () => openCharacterEditor(), "primary"),
    ], "stack"));
  }

  content.append(createElement("div", {
    className: "status-cluster",
    children: [
      button("导入角色 JSON", async () => {
        const file = await pickFile({ accept: "application/json,.json", as: "file" });
        if (!file) return;
        try {
          const character = importCharacter(await file.text());
          ensureSingleConversation(character.id);
          toast("角色已导入");
          rerender();
        } catch (error) {
          toast(error.message);
        }
      }, "secondary"),
    ],
  }));
}

function openCharacterDetail(characterId) {
  selectedCharacterId = characterId;
  const character = state.characters.find((item) => item.id === characterId);
  if (!character) return;

  const stats = getMemoryStats(character.id);

  openDrawer({
    title: character.name,
    content: createElement("div", {
      className: "stack",
      children: [
        createElement("div", {
          className: "list-item",
          children: [
            createElement("div", {
              className: "avatar",
              children: character.avatar
                ? [createElement("img", { attrs: { src: character.avatar, alt: character.name } })]
                : [document.createTextNode(character.name.slice(0, 1))],
            }),
            createElement("div", {
              className: "list-main",
              children: [
                createElement("div", { className: "list-title", text: character.name }),
                createElement("div", { className: "list-subtitle", text: character.description || "没有描述" }),
              ],
            }),
            createElement("div", { className: "list-meta", text: character.mood || "neutral" }),
          ],
        }),
        createAccordion([
          {
            id: "base",
            title: "基础资料",
            render: () => renderCharacterInfo(character),
          },
          {
            id: "chat",
            title: "聊天设置",
            render: () => renderCharacterChatSettings(character),
          },
          {
            id: "memory",
            title: `记忆 ${stats.count}`,
            render: () => renderCharacterMemory(character),
          },
          {
            id: "data",
            title: "导入导出",
            render: () => renderCharacterData(character),
          },
        ], "base"),
        createElement("div", {
          className: "status-cluster",
          children: [
            button("开始聊天", () => {
              ensureSingleConversation(character.id);
              closeDrawer();
              window.dispatchEvent(new CustomEvent("app:open", { detail: { appId: "chat" } }));
              sessionStorage.setItem("open_chat_character_id", character.id);
            }, "primary"),
            button("编辑", () => {
              closeDrawer();
              openCharacterEditor(character);
            }, "secondary"),
          ],
        }),
      ],
    }),
  });
}

function renderCharacterInfo(character) {
  return createElement("div", {
    className: "stack",
    children: [
      createElement("p", { className: "muted", text: character.description || "没有角色描述" }),
      character.personality ? createElement("p", { className: "muted", text: `性格：${character.personality}` }) : null,
      character.scenario ? createElement("p", { className: "muted", text: `场景：${character.scenario}` }) : null,
      character.firstMessage ? createElement("p", { className: "muted", text: `开场白：${character.firstMessage}` }) : null,
    ].filter(Boolean),
  });
}

function renderCharacterChatSettings(character) {
  const apiOptions = [
    { label: "跟随默认", value: "" },
    ...state.apiConfigs.map((config) => ({ label: config.name, value: config.id })),
  ];

  const ttsOptions = [
    { label: "跟随默认", value: "" },
    ...state.ttsConfigs.map((config) => ({ label: config.name, value: config.id })),
  ];

  const worldbookOptions = state.worldbook.map((entry) => ({
    label: entry.title,
    value: entry.id,
  }));

  const form = createElement("div", {
    className: "form-grid",
    children: [
      formField({
        label: "默认 API",
        name: "apiConfigId",
        value: character.apiConfigId || "",
        options: apiOptions,
      }),
      formField({
        label: "默认模型",
        name: "apiModel",
        value: character.apiModel || "",
        placeholder: "留空跟随接口",
      }),
      formField({
        label: "默认 TTS",
        name: "ttsConfigId",
        value: character.ttsConfigId || "",
        options: ttsOptions,
      }),
      formField({
        label: "记忆触发消息数",
        name: "memoryTriggerCount",
        value: character.memoryTriggerCount || 100,
        type: "number",
      }),
      formField({
        label: "快捷回复，换行分隔，最多 8 条",
        name: "quickReplies",
        value: (character.quickReplies || []).join("\n"),
        textarea: true,
      }),
    ],
  });

  if (worldbookOptions.length) {
    form.append(createElement("div", {
      className: "stack",
      children: [
        createElement("div", { className: "form-label", text: "绑定世界书" }),
        ...worldbookOptions.map((option) => {
          const enabled = character.worldbookIds?.includes(option.value);
          return createElement("button", {
            className: "card-button",
            children: [
              createElement("span", { text: option.label }),
              createElement("span", { className: "muted", text: enabled ? "已绑定" : "未绑定" }),
            ],
            on: {
              click: () => {
                const worldbookIds = new Set(character.worldbookIds || []);
                if (worldbookIds.has(option.value)) worldbookIds.delete(option.value);
                else worldbookIds.add(option.value);
                saveCharacter({ ...character, worldbookIds: Array.from(worldbookIds) });
                rerender();
                closeDrawer();
                openCharacterDetail(character.id);
              },
            },
          });
        }),
      ],
    }));
  }

  form.addEventListener("change", () => saveCharacterChatSettings(character, form));

  return form;
}

function saveCharacterChatSettings(character, form) {
  const values = getFormValues(form);
  saveCharacter({
    ...character,
    apiConfigId: values.apiConfigId,
    apiModel: values.apiModel,
    ttsConfigId: values.ttsConfigId,
    memoryTriggerCount: Number(values.memoryTriggerCount) || 100,
    quickReplies: values.quickReplies
      .split("\n")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 8),
  });
  state = readState();
}

function renderCharacterMemory(character) {
  const memories = character.memories || [];

  return createElement("div", {
    className: "stack",
    children: [
      button("新增记忆", () => openMemoryDrawer(character), "secondary"),
      memories.length
        ? createElement("div", {
          className: "list",
          children: memories.map((memory) => createElement("button", {
            className: "card-button",
            on: { click: () => openMemoryDrawer(character, memory) },
            children: [
              createElement("span", { text: memory.content }),
              createElement("span", { className: "muted", text: `重要度 ${memory.importance || 3}` }),
            ],
          })),
        })
        : createElement("p", { className: "muted", text: "还没有长期记忆。" }),
    ],
  });
}

function openMemoryDrawer(character, memory = null) {
  const form = createElement("div", {
    className: "form-grid",
    children: [
      formField({ label: "记忆内容", name: "content", value: memory?.content || "", textarea: true }),
      formField({ label: "标签，逗号分隔", name: "tags", value: (memory?.tags || []).join(",") }),
      formField({ label: "重要度 1-5", name: "importance", value: memory?.importance || 3, type: "number" }),
    ],
  });

  openDrawer({
    title: memory ? "编辑记忆" : "新增记忆",
    content: form,
    actions: [
      memory ? button("删除", () => {
        deleteCharacterMemory(character.id, memory.id);
        closeDrawer();
        rerender();
      }, "text") : null,
      button("保存", () => {
        const values = getFormValues(form);
        const patch = {
          content: values.content.trim(),
          tags: values.tags.split(",").map((item) => item.trim()).filter(Boolean),
          importance: Number(values.importance) || 3,
        };

        if (memory) updateCharacterMemory(character.id, memory.id, patch);
        else addCharacterMemory(character.id, patch);

        closeDrawer();
        rerender();
      }, "primary"),
    ].filter(Boolean),
  });
}

function renderCharacterData(character) {
  return createElement("div", {
    className: "stack",
    children: [
      button("导出角色 JSON", () => {
        downloadText(`${character.name || "character"}.json`, exportCharacter(character.id));
      }, "secondary"),
      button("导出记忆 JSON", () => {
        downloadText(`${character.name || "character"}-memories.json`, exportCharacterMemories(character.id));
      }, "secondary"),
      button("导入记忆 JSON", async () => {
        const file = await pickFile({ accept: "application/json,.json", as: "file" });
        if (!file) return;
        importCharacterMemories(character.id, await file.text(), "merge");
        toast("记忆已导入");
        rerender();
      }, "secondary"),
      button("删除角色", async () => {
        if (await confirmAction({ title: "删除角色", message: "删除角色会同时移除单聊记录。" })) {
          deleteCharacter(character.id);
          closeDrawer();
          rerender();
        }
      }, "text"),
    ],
  });
}

function openCharacterEditor(character = null) {
  const current = character || createCharacter();
  const form = createElement("div", {
    className: "form-grid",
    children: [
      createElement("div", {
        className: "list-item",
        children: [
          createElement("div", {
            className: "avatar",
            children: current.avatar
              ? [createElement("img", { attrs: { src: current.avatar, alt: current.name } })]
              : [document.createTextNode((current.name || "新").slice(0, 1))],
          }),
          createElement("div", {
            className: "list-main",
            children: [
              createElement("div", { className: "list-title", text: current.name || "新角色" }),
              createElement("div", { className: "list-subtitle", text: "头像、提示词和聊天背景都可以单独设置" }),
            ],
          }),
          button("头像", async () => {
            const image = await pickFile({ accept: "image/*" });
            current.avatar = image;
            closeDrawer();
            openCharacterEditor(current);
          }, "secondary"),
        ],
      }),
      formField({ label: "名称", name: "name", value: current.name || "" }),
      formField({ label: "描述", name: "description", value: current.description || "", textarea: true }),
      formField({ label: "性格", name: "personality", value: current.personality || "", textarea: true }),
      formField({ label: "场景", name: "scenario", value: current.scenario || "", textarea: true }),
      formField({ label: "开场白", name: "firstMessage", value: current.firstMessage || "", textarea: true }),
      formField({ label: "系统提示词", name: "systemPrompt", value: current.systemPrompt || "", textarea: true }),
      formField({
        label: "聊天背景模式",
        name: "chatBackgroundMode",
        value: current.chatBackgroundMode || "theme",
        options: [
          { label: "跟随主题", value: "theme" },
          { label: "纯色", value: "color" },
          { label: "本地图", value: "image" },
        ],
      }),
      formField({ label: "聊天背景颜色", name: "chatBackgroundColor", value: current.chatBackgroundColor || "", type: "color" }),
      button("选择聊天背景图", async () => {
        const image = await pickFile({ accept: "image/*" });
        current.chatBackground = image;
        toast("背景图已选择，保存后生效");
      }, "secondary"),
    ],
  });

  openDrawer({
    title: character ? "编辑角色" : "新增角色",
    content: form,
    actions: [
      button("取消", closeDrawer, "secondary"),
      button("保存", () => {
        const values = getFormValues(form);
        const nextCharacter = {
          ...current,
          ...values,
          name: values.name.trim() || "未命名角色",
        };
        saveCharacter(nextCharacter);
        ensureSingleConversation(nextCharacter.id);
        closeDrawer();
        rerender();
      }, "primary"),
    ],
  });
}

function renderPersonaList(content) {
  const root = createElement("div", { className: "stack" });

  root.append(button("新增我的人设", () => openPersonaDrawer(), "primary"));

  state.userPersonas.forEach((persona) => {
    root.append(listItem({
      avatar: persona.avatar,
      title: persona.name,
      subtitle: persona.description || persona.systemPrompt || "没有描述",
      meta: persona.scope === "all" ? "全局" : "指定角色",
      onClick: () => openPersonaDrawer(persona),
    }));
  });

  content.append(root);
}

function openPersonaDrawer(persona = null) {
  const current = persona || {
    id: crypto.randomUUID(),
    name: "",
    avatar: "",
    description: "",
    systemPrompt: "",
    scope: "all",
    characterIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const form = createElement("div", {
    className: "form-grid",
    children: [
      formField({ label: "名称", name: "name", value: current.name || "" }),
      formField({ label: "描述", name: "description", value: current.description || "", textarea: true }),
      formField({ label: "给 AI 的人设提示", name: "systemPrompt", value: current.systemPrompt || "", textarea: true }),
      formField({
        label: "作用范围",
        name: "scope",
        value: current.scope || "all",
        options: [
          { label: "全部角色", value: "all" },
          { label: "指定角色", value: "selected" },
        ],
      }),
      button("更换头像", async () => {
        current.avatar = await pickFile({ accept: "image/*" });
        toast("头像已选择，保存后生效");
      }, "secondary"),
    ],
  });

  openDrawer({
    title: persona ? "编辑我的人设" : "新增我的人设",
    content: form,
    actions: [
      persona ? button("删除", async () => {
        if (await confirmAction({ title: "删除人设", message: "确认删除这个人设吗。" })) {
          updateState((draft) => {
            draft.userPersonas = draft.userPersonas.filter((item) => item.id !== current.id);
            return draft;
          });
          closeDrawer();
          rerender();
        }
      }, "text") : null,
      button("保存", () => {
        const values = getFormValues(form);
        updateState((draft) => {
          const next = {
            ...current,
            ...values,
            name: values.name.trim() || "我的人设",
            updatedAt: new Date().toISOString(),
          };
          const index = draft.userPersonas.findIndex((item) => item.id === next.id);
          if (index >= 0) draft.userPersonas[index] = next;
          else draft.userPersonas.unshift(next);
          return draft;
        });
        closeDrawer();
        rerender();
      }, "primary"),
    ].filter(Boolean),
  });
}

function openThemeDrawer() {
  const theme = getAppTheme("characters");
  openDrawer({
    title: "角色管理外观",
    content: renderThemeQuickSettings("characters", theme, (patch) => {
      updateAppTheme("characters", patch);
      applyAppTheme("characters", host);
    }),
  });
}

function rerender() {
  state = readState();
  mountApp(host, context);
}
