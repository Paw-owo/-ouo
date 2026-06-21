import {
  APP_DEFINITIONS,
  readState,
  updateState,
  resetState,
  exportAllData,
  importAllData,
  createApiConfig,
  saveApiConfig,
  deleteApiConfig,
  createTtsConfig,
  saveTtsConfig,
  deleteTtsConfig,
  createMcpServer,
  createSticker,
  fileToBase64,
  downloadText,
} from "../core/storage.js";
import {
  PRESET_THEMES,
  setPresetTheme,
  exportTheme,
  importTheme,
  getAppTheme,
  updateAppTheme,
  importAppTheme,
  exportAppTheme,
} from "../core/theme.js";
import { fetchModels } from "../core/api.js";
import {
  renderAppShell,
  createElement,
  clear,
  card,
  button,
  iconButton,
  createAccordion,
  createSwitch,
  openDrawer,
  closeDrawer,
  confirmAction,
  toast,
  formField,
  getFormValues,
  pickFile,
  importJsonFile,
  renderThemeQuickSettings,
  ICONS,
} from "../core/ui.js";
import {
  upsertMcpServer,
  removeMcpServer,
  refreshMcpTools,
} from "../core/mcp.js";

let host = null;
let context = null;
let state = null;

export function mountApp(container, appContext = {}) {
  host = container;
  context = appContext;
  state = readState();

  const { shell, content } = renderAppShell({
    title: "设置",
    onBack: context.close,
    actions: [
      iconButton("palette", "应用外观", () => openAppThemeDrawer()),
    ],
  });

  host.replaceChildren(shell);
  renderSettings(content);
}

export function renderApp(appContext = {}) {
  const wrapper = createElement("div");
  mountApp(wrapper, appContext);
  return wrapper;
}

function renderSettings(content) {
  clear(content);

  content.append(
    createAccordion([
      {
        id: "api",
        title: "API 配置",
        render: renderApiSection,
      },
      {
        id: "tts",
        title: "TTS 配置",
        render: renderTtsSection,
      },
      {
        id: "mcp",
        title: "MCP 配置",
        render: renderMcpSection,
      },
      {
        id: "personalization",
        title: "个性化",
        render: renderPersonalizationSection,
      },
      {
        id: "stickers",
        title: "表情包库",
        render: renderStickersSection,
      },
      {
        id: "data",
        title: "数据管理",
        render: renderDataSection,
      },
    ]),
  );
}

function rerender() {
  state = readState();
  mountApp(host, context);
}

function renderApiSection() {
  const root = createElement("div", { className: "stack" });

  root.append(button("新增 API 配置", () => openApiDrawer(), "primary"));

  state.apiConfigs.forEach((config) => {
    const keyText = config.keyVisible ? (config.key || "未填写") : maskKey(config.key);
    root.append(card([
      createElement("div", {
        className: "stack",
        children: [
          createElement("div", {
            className: "list-main",
            children: [
              createElement("div", { className: "list-title", text: config.name || "未命名接口" }),
              createElement("div", { className: "list-subtitle", text: config.endpoint || "未填写 endpoint" }),
            ],
          }),
          createElement("div", { className: "muted", text: `Key：${keyText}` }),
          createElement("div", { className: "muted", text: `模型：${config.selectedModel || "未选择"}` }),
          config.models?.length
            ? createElement("select", {
              children: config.models.map((model) => createElement("option", {
                text: model,
                attrs: { value: model, selected: model === config.selectedModel },
              })),
              on: {
                change: (event) => {
                  saveApiConfig({ ...config, selectedModel: event.target.value });
                  rerender();
                },
              },
            })
            : formField({
              label: "手动模型名",
              name: "selectedModel",
              value: config.selectedModel || "",
              placeholder: "例如 gpt-4o-mini",
            }),
          createElement("div", {
            className: "status-cluster",
            children: [
              button(config.keyVisible ? "隐藏 Key" : "显示 Key", () => {
                saveApiConfig({ ...config, keyVisible: !config.keyVisible });
                rerender();
              }, "secondary"),
              button("拉取模型", async () => {
                try {
                  toast("正在拉取模型");
                  await fetchModels(config);
                  toast("模型已更新");
                  rerender();
                } catch (error) {
                  toast(error.message);
                }
              }, "secondary"),
              button("编辑", () => openApiDrawer(config), "secondary"),
              button("删除", async () => {
                if (await confirmAction({ title: "删除 API 配置", message: "删除后使用它的对话需要重新选择接口。" })) {
                  deleteApiConfig(config.id);
                  rerender();
                }
              }, "text"),
            ],
          }),
        ],
      }),
    ]));
  });

  root.addEventListener("change", (event) => {
    const cardNode = event.target.closest(".card");
    const index = Array.from(root.querySelectorAll(".card")).indexOf(cardNode);
    const config = state.apiConfigs[index];
    if (!config || event.target.name !== "selectedModel") return;
    saveApiConfig({ ...config, selectedModel: event.target.value });
    state = readState();
  });

  return root;
}

function openApiDrawer(config = null) {
  const current = config || createApiConfig({ name: "" });
  const form = createElement("div", {
    className: "form-grid",
    children: [
      formField({ label: "名称", name: "name", value: current.name || "", placeholder: "例如 OpenAI" }),
      formField({ label: "Endpoint", name: "endpoint", value: current.endpoint || "", placeholder: "https://api.openai.com" }),
      formField({ label: "API Key", name: "key", value: current.key || "", type: "text", placeholder: "sk-..." }),
      formField({ label: "模型名", name: "selectedModel", value: current.selectedModel || "", placeholder: "可手动填写" }),
    ],
  });

  openDrawer({
    title: config ? "编辑 API 配置" : "新增 API 配置",
    content: form,
    actions: [
      button("取消", closeDrawer, "secondary"),
      button("保存", () => {
        const values = getFormValues(form);
        saveApiConfig({
          ...current,
          ...values,
          endpoint: values.endpoint.trim().replace(/\/+$/, ""),
        });
        closeDrawer();
        rerender();
      }, "primary"),
    ],
  });
}

function renderTtsSection() {
  const root = createElement("div", { className: "stack" });
  root.append(button("新增 TTS 配置", () => openTtsDrawer(), "primary"));

  state.ttsConfigs.forEach((config) => {
    root.append(card([
      createElement("div", {
        className: "stack",
        children: [
          createElement("div", { className: "list-title", text: config.name || "未命名语音" }),
          createElement("div", { className: "muted", text: `${config.provider || "openai"} / ${config.voice || "nova"}` }),
          createElement("div", { className: "muted", text: config.endpoint || "浏览器或默认接口" }),
          createElement("div", {
            className: "status-cluster",
            children: [
              createSwitch(config.enabled, (enabled) => {
                saveTtsConfig({ ...config, enabled });
                rerender();
              }),
              button("编辑", () => openTtsDrawer(config), "secondary"),
              button("删除", async () => {
                if (await confirmAction({ title: "删除 TTS 配置", message: "确认删除这个语音配置吗。" })) {
                  deleteTtsConfig(config.id);
                  rerender();
                }
              }, "text"),
            ],
          }),
        ],
      }),
    ]));
  });

  return root;
}

function openTtsDrawer(config = null) {
  const current = config || createTtsConfig({ name: "" });
  const form = createElement("div", {
    className: "form-grid",
    children: [
      formField({ label: "名称", name: "name", value: current.name || "" }),
      formField({
        label: "服务商",
        name: "provider",
        value: current.provider || "openai",
        options: [
          { label: "浏览器语音", value: "browser" },
          { label: "OpenAI 语音", value: "openai" },
          { label: "自定义接口", value: "custom" },
        ],
      }),
      formField({ label: "Endpoint", name: "endpoint", value: current.endpoint || "" }),
      formField({ label: "API Key", name: "apiKey", value: current.apiKey || "", type: "text" }),
      formField({ label: "模型", name: "model", value: current.model || "tts-1" }),
      formField({ label: "音色", name: "voice", value: current.voice || "nova" }),
    ],
  });

  openDrawer({
    title: config ? "编辑 TTS 配置" : "新增 TTS 配置",
    content: form,
    actions: [
      button("取消", closeDrawer, "secondary"),
      button("保存", () => {
        saveTtsConfig({ ...current, ...getFormValues(form) });
        closeDrawer();
        rerender();
      }, "primary"),
    ],
  });
}

function renderMcpSection() {
  const root = createElement("div", { className: "stack" });
  root.append(button("新增 MCP 服务", () => openMcpDrawer(), "primary"));

  state.mcpServers.forEach((server) => {
    root.append(card([
      createElement("div", {
        className: "stack",
        children: [
          createElement("div", { className: "list-title", text: server.name || "未命名 MCP" }),
          createElement("div", { className: "muted", text: `${server.group || "默认分组"} / ${server.url || "未填写地址"}` }),
          createElement("div", { className: "muted", text: `工具：${server.tools?.length || 0} 个` }),
          createElement("div", {
            className: "status-cluster",
            children: [
              createSwitch(server.enabled, (enabled) => {
                upsertMcpServer({ ...server, enabled });
                rerender();
              }),
              button("拉取工具", async () => {
                try {
                  toast("正在拉取工具");
                  await refreshMcpTools(server.id);
                  toast("工具已更新");
                  rerender();
                } catch (error) {
                  toast(error.message);
                }
              }, "secondary"),
              button("编辑", () => openMcpDrawer(server), "secondary"),
              button("删除", async () => {
                if (await confirmAction({ title: "删除 MCP 服务", message: "确认删除这个 MCP 服务吗。" })) {
                  removeMcpServer(server.id);
                  rerender();
                }
              }, "text"),
            ],
          }),
        ],
      }),
    ]));
  });

  return root;
}

function openMcpDrawer(server = null) {
  const current = server || createMcpServer({ name: "" });
  const form = createElement("div", {
    className: "form-grid",
    children: [
      formField({ label: "名称", name: "name", value: current.name || "" }),
      formField({ label: "分组", name: "group", value: current.group || "默认分组" }),
      formField({ label: "URL", name: "url", value: current.url || "" }),
      formField({ label: "API Key", name: "apiKey", value: current.apiKey || "", type: "text" }),
    ],
  });

  openDrawer({
    title: server ? "编辑 MCP 服务" : "新增 MCP 服务",
    content: form,
    actions: [
      button("取消", closeDrawer, "secondary"),
      button("保存", () => {
        upsertMcpServer({ ...current, ...getFormValues(form) });
        closeDrawer();
        rerender();
      }, "primary"),
    ],
  });
}

function renderPersonalizationSection() {
  return createAccordion([
    {
      id: "desktop",
      title: "桌面",
      render: renderDesktopPersonalization,
    },
    {
      id: "theme",
      title: "主题",
      render: renderThemePersonalization,
    },
    {
      id: "message",
      title: "消息",
      render: renderMessagePersonalization,
    },
    {
      id: "icons",
      title: "应用图标",
      render: renderAppIconPersonalization,
    },
    {
      id: "profile",
      title: "我的资料",
      render: renderProfilePersonalization,
    },
    {
      id: "apps",
      title: "应用外观",
      render: renderAppThemeSummary,
    },
  ], state.settings.personalizationOpenKey || "");
}

function renderDesktopPersonalization() {
  const root = createElement("div", { className: "stack" });

  root.append(
    button("更换桌面壁纸", async () => {
      const image = await pickFile({ accept: "image/*" });
      updateState((draft) => {
        draft.desktop.wallpaper = image;
        return draft;
      });
      rerender();
    }, "secondary"),
    formField({ label: "天气城市", name: "weatherCity", value: state.desktop.weatherCity || "温州" }),
  );

  const cityInput = root.querySelector("[name='weatherCity']");
  cityInput.addEventListener("change", () => {
    updateState((draft) => {
      draft.desktop.weatherCity = cityInput.value.trim() || "温州";
      return draft;
    });
  });

  Object.entries(state.desktop.widgets).forEach(([key, widget]) => {
    root.append(createElement("div", {
      className: "card-button",
      children: [
        createElement("span", { text: widget.name }),
        createSwitch(widget.enabled, (enabled) => {
          updateState((draft) => {
            draft.desktop.widgets[key].enabled = enabled;
            return draft;
          });
          rerender();
        }),
      ],
    }));
  });

  return root;
}

function renderThemePersonalization() {
  const root = createElement("div", { className: "stack" });

  root.append(createElement("div", {
    className: "theme-preview-grid",
    children: PRESET_THEMES.map((theme) => createElement("button", {
      className: "theme-preview",
      on: {
        click: () => {
          setPresetTheme(theme.id);
          rerender();
          toast("主题已切换");
        },
      },
      children: [
        createElement("div", {
          className: "color-dot",
          style: { background: theme.variables["--accent"] },
        }),
        createElement("div", { className: "list-title", text: theme.name }),
        createElement("div", { className: "muted", text: theme.variables["--bg-primary"] }),
      ],
    })),
  }));

  root.append(createElement("div", {
    className: "status-cluster",
    children: [
      button("导入主题", async () => {
        const file = await pickFile({ accept: "application/json,.json", as: "file" });
        if (!file) return;
        importTheme(await file.text());
        rerender();
      }, "secondary"),
      button("导出主题", () => exportTheme("global-theme.json"), "secondary"),
    ],
  }));

  return root;
}

function renderMessagePersonalization() {
  const root = createElement("div", { className: "stack" });

  root.append(createElement("div", {
    className: "card-button",
    children: [
      createElement("span", { text: "气泡模式" }),
      createElement("select", {
        children: [
          createElement("option", { text: "气泡模式", attrs: { value: "bubble", selected: state.settings.chatBubbleMode === "bubble" } }),
          createElement("option", { text: "对话模式", attrs: { value: "dialogue", selected: state.settings.chatBubbleMode === "dialogue" } }),
        ],
        on: {
          change: (event) => {
            updateState((draft) => {
              draft.settings.chatBubbleMode = event.target.value;
              return draft;
            });
          },
        },
      }),
    ],
  }));

  root.append(createElement("div", {
    className: "card-button",
    children: [
      createElement("span", { text: "显示 token 数" }),
      createSwitch(state.settings.showTokenCount, (enabled) => {
        updateState((draft) => {
          draft.settings.showTokenCount = enabled;
          return draft;
        });
      }),
    ],
  }));

  return root;
}

function renderAppIconPersonalization() {
  const root = createElement("div", { className: "stack" });
  APP_DEFINITIONS.forEach((app) => {
    const custom = state.desktop.customApps?.[app.id] || {};
    root.append(card([
      createElement("div", {
        className: "stack",
        children: [
          createElement("div", { className: "list-title", text: custom.name || app.name }),
          createElement("div", {
            className: "status-cluster",
            children: [
              button("改名", () => openRenameAppDrawer(app), "secondary"),
              button("换图标", async () => {
                const image = await pickFile({ accept: "image/*" });
                updateState((draft) => {
                  draft.desktop.customApps ??= {};
                  draft.desktop.customApps[app.id] ??= {};
                  draft.desktop.customApps[app.id].icon = image;
                  return draft;
                });
                rerender();
              }, "secondary"),
            ],
          }),
        ],
      }),
    ]));
  });
  return root;
}

function openRenameAppDrawer(app) {
  const custom = state.desktop.customApps?.[app.id] || {};
  const form = createElement("div", {
    className: "form-grid",
    children: [
      formField({ label: "应用名称", name: "name", value: custom.name || app.name }),
    ],
  });

  openDrawer({
    title: "修改应用名称",
    content: form,
    actions: [
      button("取消", closeDrawer, "secondary"),
      button("保存", () => {
        const values = getFormValues(form);
        updateState((draft) => {
          draft.desktop.customApps ??= {};
          draft.desktop.customApps[app.id] ??= {};
          draft.desktop.customApps[app.id].name = values.name.trim() || app.name;
          return draft;
        });
        closeDrawer();
        rerender();
      }, "primary"),
    ],
  });
}

function renderProfilePersonalization() {
  const profile = state.settings.userProfile;
  const root = createElement("div", {
    className: "stack",
    children: [
      formField({ label: "昵称", name: "nickname", value: profile.nickname || "我" }),
      button("更换头像", async () => {
        const image = await pickFile({ accept: "image/*" });
        updateState((draft) => {
          draft.settings.userProfile.avatar = image;
          return draft;
        });
        rerender();
      }, "secondary"),
    ],
  });

  root.querySelector("[name='nickname']").addEventListener("change", (event) => {
    updateState((draft) => {
      draft.settings.userProfile.nickname = event.target.value.trim() || "我";
      return draft;
    });
  });

  return root;
}

function renderAppThemeSummary() {
  const root = createElement("div", { className: "stack" });

  APP_DEFINITIONS.forEach((app) => {
    const theme = getAppTheme(app.id);
    root.append(createElement("button", {
      className: "card-button",
      on: { click: () => openAppThemeDrawer(app.id) },
      children: [
        createElement("span", { text: app.name }),
        createElement("span", { className: "muted", text: theme.accent || "跟随全局" }),
      ],
    }));
  });

  return root;
}

function openAppThemeDrawer(appId = "settings") {
  const theme = getAppTheme(appId);
  openDrawer({
    title: "应用外观",
    content: renderThemeQuickSettings(appId, theme, (patch) => {
      if (patch.name || patch.version || patch.appId) {
        updateAppTheme(appId, {
          backgroundImage: patch.backgroundImage || "",
          accent: patch.accent || "",
          radius: patch.radius || 24,
          fontSize: patch.fontSize || 15,
          variables: patch.variables || {},
        });
      } else {
        updateAppTheme(appId, patch);
      }
      state = readState();
    }),
    actions: [
      button("导入", async () => {
        const file = await pickFile({ accept: "application/json,.json", as: "file" });
        if (!file) return;
        importAppTheme(appId, await file.text());
        closeDrawer();
        rerender();
      }, "secondary"),
      button("导出", () => exportAppTheme(appId), "secondary"),
    ],
  });
}

function renderStickersSection() {
  const root = createElement("div", { className: "stack" });

  root.append(button("上传表情包", async () => {
    const image = await pickFile({ accept: "image/*" });
    if (!image) return;
    openStickerDrawer(image);
  }, "primary"));

  root.append(createElement("div", {
    className: "sticker-grid",
    children: state.stickers.map((sticker) => createElement("button", {
      className: "sticker-item",
      on: { click: () => openStickerDrawer(sticker.image, sticker) },
      children: [createElement("img", { attrs: { src: sticker.image, alt: sticker.description || "表情包" } })],
    })),
  }));

  return root;
}

function openStickerDrawer(image, sticker = null) {
  const form = createElement("div", {
    className: "form-grid",
    children: [
      createElement("div", {
        className: "sticker-item",
        children: [createElement("img", { attrs: { src: image, alt: "" } })],
      }),
      formField({ label: "描述", name: "description", value: sticker?.description || "", placeholder: "例如 开心大笑" }),
    ],
  });

  openDrawer({
    title: sticker ? "编辑表情包" : "新增表情包",
    content: form,
    actions: [
      sticker ? button("删除", () => {
        updateState((draft) => {
          draft.stickers = draft.stickers.filter((item) => item.id !== sticker.id);
          return draft;
        });
        closeDrawer();
        rerender();
      }, "text") : null,
      button("保存", () => {
        const values = getFormValues(form);
        updateState((draft) => {
          if (sticker) {
            const target = draft.stickers.find((item) => item.id === sticker.id);
            if (target) target.description = values.description;
          } else {
            draft.stickers.unshift(createSticker({ image, description: values.description }));
          }
          return draft;
        });
        closeDrawer();
        rerender();
      }, "primary"),
    ].filter(Boolean),
  });
}

function renderDataSection() {
  return createElement("div", {
    className: "stack",
    children: [
      button("导出全部数据", () => {
        downloadText("ai-phone-data.json", exportAllData());
      }, "secondary"),
      button("导入数据", async () => {
        const file = await pickFile({ accept: "application/json,.json", as: "file" });
        if (!file) return;
        importAllData(await file.text());
        rerender();
      }, "secondary"),
      button("清空所有数据", async () => {
        if (await confirmAction({ title: "清空所有数据", message: "这会清空本地保存的全部内容。" })) {
          resetState();
          rerender();
        }
      }, "text"),
    ],
  });
}

function maskKey(key = "") {
  if (!key) return "未填写";
  if (key.length <= 8) return "已填写";
  return `${key.slice(0, 4)}••••${key.slice(-4)}`;
}
