import {
  readState,
  updateState,
  createWorldbookEntry,
  createId,
  nowISO,
  downloadText,
} from "../core/storage.js";
import {
  applyAppTheme,
  getAppTheme,
  updateAppTheme,
} from "../core/theme.js";
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
  createSwitch,
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
let activeTab = "all";
let searchText = "";

export function mountApp(container, appContext = {}) {
  host = container;
  context = appContext;
  state = readState();

  applyAppTheme("worldbook", host);

  const { shell, content } = renderAppShell({
    title: "世界书",
    onBack: context.close,
    actions: [
      iconButton("palette", "外观", openThemeDrawer),
      iconButton("plus", "新增条目", () => openEntryDrawer()),
    ],
  });

  host.replaceChildren(shell);
  renderWorldbook(content);
}

export function renderApp(appContext = {}) {
  const wrapper = createElement("div");
  mountApp(wrapper, appContext);
  return wrapper;
}

function renderWorldbook(content) {
  clear(content);

  content.append(
    createTabs([
      { id: "all", label: "全部" },
      { id: "global", label: "全局" },
      { id: "character", label: "角色" },
    ], activeTab, (tab) => {
      activeTab = tab;
      rerender();
    }),
    createSearchBox("搜索世界书", (value) => {
      searchText = value;
      rerender();
    }),
  );

  const entries = filterEntries();
  const list = createElement("div", { className: "list" });

  entries.forEach((entry) => {
    list.append(listItem({
      title: entry.title,
      subtitle: entry.content || "没有内容",
      meta: entry.enabled ? "启用" : "关闭",
      onClick: () => openEntryDetail(entry),
      actions: [
        createSwitch(entry.enabled, (enabled) => {
          saveEntry({ ...entry, enabled });
          rerender();
        }),
      ],
    }));
  });

  content.append(list);

  if (!entries.length) {
    content.append(card([
      createElement("h2", { className: "section-title", text: "还没有世界书" }),
      createElement("p", { className: "muted", text: "世界书会在聊天时注入背景设定，让角色保持长期一致。" }),
      button("新增世界书", () => openEntryDrawer(), "primary"),
    ], "stack"));
  }

  content.append(createElement("div", {
    className: "status-cluster",
    children: [
      button("导入 JSON", importWorldbookFile, "secondary"),
      button("导出 JSON", exportWorldbookFile, "secondary"),
    ],
  }));
}

function filterEntries() {
  return (state.worldbook || []).filter((entry) => {
    if (activeTab === "global" && !entry.isGlobal) return false;
    if (activeTab === "character" && entry.isGlobal) return false;

    const text = `${entry.title} ${entry.content} ${entry.type}`.toLowerCase();
    return text.includes(searchText.toLowerCase());
  });
}

function openEntryDetail(entry) {
  const linkedCharacters = state.characters.filter((character) => entry.characterIds?.includes(character.id));

  openDrawer({
    title: entry.title,
    content: createElement("div", {
      className: "stack",
      children: [
        card([
          createElement("div", { className: "section-title", text: entry.title }),
          createElement("p", { text: entry.content || "没有内容" }),
          createElement("div", { className: "muted", text: `类型：${getTypeLabel(entry.type)} / ${entry.isGlobal ? "全局生效" : "指定角色"}` }),
        ], "stack"),
        linkedCharacters.length ? createElement("div", {
          className: "list",
          children: linkedCharacters.map((character) => listItem({
            avatar: character.avatar,
            title: character.name,
            subtitle: "已绑定",
          })),
        }) : createElement("p", { className: "muted", text: entry.isGlobal ? "这个条目对全部角色生效。" : "暂未绑定角色。" }),
        createElement("div", {
          className: "status-cluster",
          children: [
            button("编辑", () => {
              closeDrawer();
              openEntryDrawer(entry);
            }, "primary"),
            button("删除", async () => {
              if (await confirmAction({ title: "删除世界书", message: "确认删除这个条目吗。" })) {
                deleteEntry(entry.id);
                closeDrawer();
                rerender();
              }
            }, "text"),
          ],
        }),
      ],
    }),
  });
}

function openEntryDrawer(entry = null) {
  const current = entry || createWorldbookEntry({ title: "", content: "" });
  const characterIds = new Set(current.characterIds || []);

  const characterList = createElement("div", {
    className: "stack",
    children: state.characters.map((character) => createElement("button", {
      className: "card-button",
      on: {
        click: (event) => {
          if (characterIds.has(character.id)) characterIds.delete(character.id);
          else characterIds.add(character.id);
          event.currentTarget.querySelector(".muted").textContent = characterIds.has(character.id) ? "已绑定" : "未绑定";
        },
      },
      children: [
        createElement("span", { text: character.name }),
        createElement("span", { className: "muted", text: characterIds.has(character.id) ? "已绑定" : "未绑定" }),
      ],
    })),
  });

  const form = createElement("div", {
    className: "form-grid",
    children: [
      formField({ label: "标题", name: "title", value: current.title || "", placeholder: "例如 主世界设定" }),
      formField({
        label: "类型",
        name: "type",
        value: current.type || "background",
        options: [
          { label: "背景设定", value: "background" },
          { label: "人物关系", value: "relationship" },
          { label: "地点", value: "location" },
          { label: "规则", value: "rule" },
          { label: "其他", value: "other" },
        ],
      }),
      formField({ label: "内容", name: "content", value: current.content || "", textarea: true }),
      createElement("label", {
        className: "card-button",
        children: [
          createElement("span", { text: "全局生效" }),
          createElement("input", {
            attrs: { type: "checkbox", name: "isGlobal", checked: current.isGlobal },
            style: { width: "auto" },
          }),
        ],
      }),
      createElement("label", {
        className: "card-button",
        children: [
          createElement("span", { text: "启用条目" }),
          createElement("input", {
            attrs: { type: "checkbox", name: "enabled", checked: current.enabled !== false },
            style: { width: "auto" },
          }),
        ],
      }),
      createElement("div", {
        className: "stack",
        children: [
          createElement("div", { className: "form-label", text: "绑定角色" }),
          characterList,
        ],
      }),
    ],
  });

  openDrawer({
    title: entry ? "编辑世界书" : "新增世界书",
    content: form,
    actions: [
      button("取消", closeDrawer, "secondary"),
      button("保存", () => {
        const values = getFormValues(form);
        const nextEntry = {
          ...current,
          title: values.title.trim() || "未命名条目",
          type: values.type,
          content: values.content.trim(),
          isGlobal: form.querySelector("[name='isGlobal']").checked,
          enabled: form.querySelector("[name='enabled']").checked,
          characterIds: Array.from(characterIds),
          updatedAt: nowISO(),
        };

        saveEntry(nextEntry);
        closeDrawer();
        rerender();
      }, "primary"),
    ],
  });
}

function saveEntry(entry) {
  updateState((draft) => {
    const index = draft.worldbook.findIndex((item) => item.id === entry.id);
    if (index >= 0) draft.worldbook[index] = entry;
    else draft.worldbook.unshift(entry);
    return draft;
  });
}

function deleteEntry(entryId) {
  updateState((draft) => {
    draft.worldbook = draft.worldbook.filter((entry) => entry.id !== entryId);
    draft.characters.forEach((character) => {
      character.worldbookIds = (character.worldbookIds || []).filter((id) => id !== entryId);
    });
    return draft;
  });
}

async function importWorldbookFile() {
  const file = await pickFile({ accept: "application/json,.json", as: "file" });
  if (!file) return;

  try {
    const parsed = JSON.parse(await file.text());
    const entries = Array.isArray(parsed) ? parsed : parsed.worldbook || parsed.entries || [];

    updateState((draft) => {
      entries.forEach((entry) => {
        draft.worldbook.unshift({
          ...createWorldbookEntry(),
          ...entry,
          id: entry.id || createId("world"),
          createdAt: entry.createdAt || nowISO(),
          updatedAt: nowISO(),
        });
      });
      return draft;
    });

    toast("世界书已导入");
    rerender();
  } catch (error) {
    toast(error.message);
  }
}

function exportWorldbookFile() {
  downloadText("worldbook.json", JSON.stringify({
    version: "1.0",
    worldbook: state.worldbook,
  }, null, 2));
}

function openThemeDrawer() {
  const theme = getAppTheme("worldbook");
  openDrawer({
    title: "世界书外观",
    content: renderThemeQuickSettings("worldbook", theme, (patch) => {
      updateAppTheme("worldbook", patch);
      applyAppTheme("worldbook", host);
    }),
  });
}

function getTypeLabel(type) {
  return {
    background: "背景设定",
    relationship: "人物关系",
    location: "地点",
    rule: "规则",
    other: "其他",
  }[type] || "其他";
}

function rerender() {
  state = readState();
  mountApp(host, context);
}

/* 待后续文件对齐：chat.js 已读取 worldbook 中 enabled 且 isGlobal 或角色绑定的条目注入上下文。 */
