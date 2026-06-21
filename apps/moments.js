import {
  readState,
  updateState,
  createId,
  nowISO,
  clearUnread,
  addMomentNotification,
} from "../core/storage.js";
import {
  applyAppTheme,
  getAppTheme,
  updateAppTheme,
} from "../core/theme.js";
import {
  chatCompletion,
  buildSystemMessage,
} from "../core/api.js";
import {
  renderAppShell,
  createElement,
  clear,
  card,
  button,
  iconButton,
  listItem,
  openDrawer,
  closeDrawer,
  confirmAction,
  toast,
  formField,
  getFormValues,
  pickFile,
  renderThemeQuickSettings,
  formatTime,
} from "../core/ui.js";

let host = null;
let context = null;
let state = null;

export function mountApp(container, appContext = {}) {
  host = container;
  context = appContext;
  state = readState();

  clearUnread("moments");
  updateState((draft) => {
    draft.moments.unread = 0;
    return draft;
  });

  applyAppTheme("moments", host);

  const { shell, content } = renderAppShell({
    title: "朋友圈",
    onBack: context.close,
    actions: [
      iconButton("palette", "外观", openThemeDrawer),
      iconButton("more", "通知", openNotificationsDrawer),
      iconButton("plus", "发布", openPostDrawer),
    ],
  });

  host.replaceChildren(shell);
  renderMoments(content);
}

export function renderApp(appContext = {}) {
  const wrapper = createElement("div");
  mountApp(wrapper, appContext);
  return wrapper;
}

function renderMoments(content) {
  clear(content);

  if (!state.moments.posts.length) {
    content.append(card([
      createElement("h2", { className: "section-title", text: "还没有动态" }),
      createElement("p", { className: "muted", text: "发布一条动态，角色可以来点赞和评论。" }),
      button("写第一条动态", openPostDrawer, "primary"),
    ], "stack"));
    return;
  }

  const list = createElement("div", { className: "stack" });
  state.moments.posts.forEach((post) => {
    list.append(renderPost(post));
  });
  content.append(list);
}

function renderPost(post) {
  const profile = state.settings.userProfile || {};
  const images = post.images || [];
  const comments = post.comments || [];
  const likes = post.likes || [];

  return card([
    createElement("div", {
      className: "list-item",
      children: [
        createElement("div", {
          className: "avatar",
          children: profile.avatar
            ? [createElement("img", { attrs: { src: profile.avatar, alt: profile.nickname || "我" } })]
            : [document.createTextNode((profile.nickname || "我").slice(0, 1))],
        }),
        createElement("div", {
          className: "list-main",
          children: [
            createElement("div", { className: "list-title", text: profile.nickname || "我" }),
            createElement("div", { className: "list-subtitle", text: formatTime(post.createdAt) }),
          ],
        }),
        iconButton("more", "更多", () => openPostMoreDrawer(post)),
      ],
    }),
    createElement("p", { text: post.content }),
    images.length ? createElement("div", {
      className: "theme-preview-grid",
      children: images.map((image) => createElement("div", {
        className: "sticker-item",
        children: [createElement("img", { attrs: { src: image, alt: "" } })],
      })),
    }) : null,
    likes.length ? createElement("div", {
      className: "soft-card card-padding",
      children: [
        createElement("div", {
          className: "muted",
          text: `喜欢：${likes.map((like) => getCharacterName(like.characterId)).join("、")}`,
        }),
      ],
    }) : null,
    comments.length ? createElement("div", {
      className: "stack",
      children: comments.map((comment) => createElement("div", {
        className: "soft-card card-padding",
        children: [
          createElement("div", { className: "list-title", text: getCharacterName(comment.characterId) }),
          createElement("div", { text: comment.content }),
          createElement("div", { className: "muted", text: formatTime(comment.createdAt) }),
        ],
      })),
    }) : null,
    createElement("div", {
      className: "status-cluster",
      children: [
        button("AI 互动", () => triggerAiInteraction(post), "secondary"),
        button("评论", () => openManualCommentDrawer(post), "secondary"),
      ],
    }),
  ].filter(Boolean), "stack");
}

function openPostDrawer(post = null) {
  const current = post || {
    id: createId("moment"),
    content: "",
    images: [],
    likes: [],
    comments: [],
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  const form = createElement("div", {
    className: "form-grid",
    children: [
      formField({
        label: "动态内容",
        name: "content",
        value: current.content || "",
        textarea: true,
        placeholder: "写下此刻想说的话",
      }),
      button("添加图片", async () => {
        const image = await pickFile({ accept: "image/*" });
        if (!image) return;
        current.images.push(image);
        toast("图片已添加，保存后生效");
      }, "secondary"),
    ],
  });

  openDrawer({
    title: post ? "编辑动态" : "发布动态",
    content: form,
    actions: [
      button("取消", closeDrawer, "secondary"),
      button("保存", () => {
        const values = getFormValues(form);
        const nextPost = {
          ...current,
          content: values.content.trim(),
          updatedAt: nowISO(),
        };

        if (!nextPost.content && !nextPost.images.length) {
          toast("写点内容或添加图片");
          return;
        }

        updateState((draft) => {
          const index = draft.moments.posts.findIndex((item) => item.id === nextPost.id);
          if (index >= 0) draft.moments.posts[index] = nextPost;
          else draft.moments.posts.unshift(nextPost);
          return draft;
        });

        closeDrawer();
        rerender();
      }, "primary"),
    ],
  });
}

function openManualCommentDrawer(post) {
  const form = createElement("div", {
    className: "form-grid",
    children: [
      formField({
        label: "评论角色",
        name: "characterId",
        value: state.characters[0]?.id || "",
        options: state.characters.map((character) => ({ label: character.name, value: character.id })),
      }),
      formField({ label: "评论内容", name: "content", value: "", textarea: true }),
    ],
  });

  openDrawer({
    title: "添加评论",
    content: form,
    actions: [
      button("保存", () => {
        const values = getFormValues(form);
        if (!values.content.trim()) {
          toast("请填写评论");
          return;
        }

        updateState((draft) => {
          const target = draft.moments.posts.find((item) => item.id === post.id);
          if (target) {
            target.comments.unshift({
              id: createId("comment"),
              characterId: values.characterId,
              content: values.content.trim(),
              createdAt: nowISO(),
            });
            target.updatedAt = nowISO();
          }
          return draft;
        });

        addMomentNotification({
          type: "comment",
          postId: post.id,
          characterId: values.characterId,
          text: values.content.trim(),
        });

        closeDrawer();
        rerender();
      }, "primary"),
    ],
  });
}

async function triggerAiInteraction(post) {
  const characters = state.characters.slice(0, 3);
  if (!characters.length) {
    toast("还没有角色");
    return;
  }

  toast("角色正在看你的动态");

  for (const character of characters) {
    const shouldLike = Math.random() > 0.25;
    if (shouldLike) {
      addLike(post.id, character.id);
    }

    const comment = await generateAiComment(post, character);
    if (comment) addComment(post.id, character.id, comment);
  }

  rerender();
}

async function generateAiComment(post, character) {
  const apiConfigId = character.apiConfigId || state.apiConfigs[0]?.id || "";
  const apiModel = character.apiModel || state.apiConfigs[0]?.selectedModel || "";
  const apiConfig = state.apiConfigs.find((config) => config.id === apiConfigId) || state.apiConfigs[0];

  if (!apiConfig?.endpoint) {
    return fallbackComment(post, character);
  }

  try {
    const response = await chatCompletion({
      apiConfigId,
      model: apiModel,
      messages: [
        buildSystemMessage({ character }),
        {
          role: "user",
          content: `用户发了一条朋友圈：${post.content}\n请用${character.name}的语气写一句自然短评论，不超过35字。`,
        },
      ],
      temperature: 0.8,
    });

    return response.content.trim().slice(0, 60);
  } catch {
    return fallbackComment(post, character);
  }
}

function fallbackComment(post, character) {
  const content = post.content || "";
  if (content.includes("累")) return "你已经很努力了，先好好休息一下。";
  if (content.includes("开心")) return "看到你开心，我也觉得今天变亮了。";
  if (content.includes("想")) return "那就把想念慢慢说给我听。";
  return `${character.name}认真看完了，想多陪你一会儿。`;
}

function addLike(postId, characterId) {
  updateState((draft) => {
    const post = draft.moments.posts.find((item) => item.id === postId);
    if (!post) return draft;

    post.likes ??= [];
    if (!post.likes.some((like) => like.characterId === characterId)) {
      post.likes.unshift({
        id: createId("like"),
        characterId,
        createdAt: nowISO(),
      });
      post.updatedAt = nowISO();
    }

    return draft;
  });

  addMomentNotification({
    type: "like",
    postId,
    characterId,
    text: "赞了你的动态",
  });
}

function addComment(postId, characterId, content) {
  updateState((draft) => {
    const post = draft.moments.posts.find((item) => item.id === postId);
    if (!post) return draft;

    post.comments ??= [];
    post.comments.unshift({
      id: createId("comment"),
      characterId,
      content,
      createdAt: nowISO(),
    });
    post.updatedAt = nowISO();

    return draft;
  });

  addMomentNotification({
    type: "comment",
    postId,
    characterId,
    text: content,
  });
}

function openNotificationsDrawer() {
  state = readState();

  openDrawer({
    title: "朋友圈通知",
    content: state.moments.notifications.length
      ? createElement("div", {
        className: "list",
        children: state.moments.notifications.map((notice) => listItem({
          avatar: getCharacter(notice.characterId)?.avatar || "",
          title: getCharacterName(notice.characterId),
          subtitle: notice.text,
          meta: formatTime(notice.createdAt),
        })),
      })
      : createElement("p", { className: "muted", text: "暂时没有新通知。" }),
    actions: [
      button("清空通知", () => {
        updateState((draft) => {
          draft.moments.notifications = [];
          draft.moments.unread = 0;
          draft.unreadBadges.moments = 0;
          return draft;
        });
        closeDrawer();
        rerender();
      }, "secondary"),
    ],
  });
}

function openPostMoreDrawer(post) {
  openDrawer({
    title: "动态操作",
    content: createElement("div", {
      className: "stack",
      children: [
        button("编辑", () => {
          closeDrawer();
          openPostDrawer(post);
        }, "secondary"),
        button("删除", async () => {
          if (await confirmAction({ title: "删除动态", message: "确认删除这条动态吗。" })) {
            updateState((draft) => {
              draft.moments.posts = draft.moments.posts.filter((item) => item.id !== post.id);
              draft.moments.notifications = draft.moments.notifications.filter((item) => item.postId !== post.id);
              return draft;
            });
            closeDrawer();
            rerender();
          }
        }, "text"),
      ],
    }),
  });
}

function openThemeDrawer() {
  const theme = getAppTheme("moments");
  openDrawer({
    title: "朋友圈外观",
    content: renderThemeQuickSettings("moments", theme, (patch) => {
      updateAppTheme("moments", patch);
      applyAppTheme("moments", host);
    }),
  });
}

function getCharacter(id) {
  return state.characters.find((character) => character.id === id) || null;
}

function getCharacterName(id) {
  return getCharacter(id)?.name || "角色";
}

function rerender() {
  state = readState();
  mountApp(host, context);
}

/* 待后续文件对齐：桌面朋友圈角标由 addMomentNotification 写入 unreadBadges.moments，进入本应用清除。 */
