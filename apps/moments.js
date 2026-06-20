import {
  getCharacters,
  getMoments,
  saveMoments,
  addMoment,
  createId,
  getNowInfo,
  readFileAsBase64,
  getCharacterById,
  getSettings
} from "../core/storage.js";

import {
  silentJsonRequest,
  getResolvedCharacterApiConfig
} from "../core/api.js";

import {
  rememberCharacterInteraction
} from "../core/memory.js";

import {
  showAlert,
  showConfirm
} from "../core/ui.js";

let rootElement = null;
let moments = [];
let characters = [];
let selectedImages = [];
let isProcessing = false;

const AUTO_MOMENT_PROBABILITY = 0.32;
const AUTO_INTERACT_PROBABILITY = 0.55;
const AUTO_COMMENT_PROBABILITY = 0.45;
const RECENT_AUTO_POST_LIMIT_MS = 10 * 60 * 1000;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getInitialText(name) {
  const text = String(name || "用").trim();
  return text.slice(0, 1) || "用";
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
    image: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="2"></rect>
        <path d="M8 13l2.2-2.2a1 1 0 0 1 1.4 0L15 14.2"></path>
        <path d="M14 13l1.2-1.2a1 1 0 0 1 1.4 0L20 15.2"></path>
        <circle cx="8.5" cy="8.5" r="1"></circle>
      </svg>
    `,
    empty: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 5h12v14H6z"></path>
        <path d="M9 9h6"></path>
        <path d="M9 13h4"></path>
      </svg>
    `
  };

  const wrap = document.createElement("span");
  wrap.innerHTML = icons[type] || icons.empty;
  return wrap.firstElementChild;
}

function refreshData() {
  moments = getMoments();
  characters = getCharacters();
}

function getCharacterName(characterId) {
  if (characterId === "user") return "用户";

  const character = characters.find((item) => item.id === characterId);
  return character?.name || "未知角色";
}

function getAuthorAvatarData(authorId) {
  if (authorId === "user") {
    return {
      name: "用户",
      avatar: localStorage.getItem("ai_phone_user_avatar") || ""
    };
  }

  const character = characters.find((item) => item.id === authorId);

  return {
    name: character?.name || "未知角色",
    avatar: character?.avatar || ""
  };
}

function createAvatar(authorId, size = 42) {
  const author = getAuthorAvatarData(authorId);

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.style.width = `${size}px`;
  avatar.style.height = `${size}px`;

  if (author.avatar) {
    const img = document.createElement("img");
    img.src = author.avatar;
    img.alt = author.name;
    avatar.appendChild(img);
  } else {
    avatar.textContent = getInitialText(author.name);
  }

  return avatar;
}

function mountHeader(container) {
  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "12px";
  header.style.marginBottom = "14px";

  const titleBox = document.createElement("div");

  const title = document.createElement("h2");
  title.className = "section-title";
  title.textContent = "朋友圈";

  const subtitle = document.createElement("p");
  subtitle.className = "section-subtitle";
  subtitle.textContent = "用户和 AI 角色的动态、评论、点赞都会保存在本地。";

  titleBox.appendChild(title);
  titleBox.appendChild(subtitle);

  const publishButton = createButton("发布", "primary-button");
  publishButton.addEventListener("click", showPublishModal);

  header.appendChild(titleBox);
  header.appendChild(publishButton);

  container.appendChild(header);
}

function render() {
  refreshData();

  if (!rootElement) return;

  rootElement.innerHTML = "";

  const page = document.createElement("div");
  page.style.paddingBottom = "18px";

  mountHeader(page);
  renderComposer(page);
  renderFeed(page);

  rootElement.appendChild(page);
}

function renderComposer(container) {
  const card = document.createElement("div");
  card.className = "card";
  card.style.marginBottom = "14px";
  card.style.display = "grid";
  card.style.gap = "10px";

  const textarea = document.createElement("textarea");
  textarea.className = "textarea-input";
  textarea.placeholder = "写一条动态";
  textarea.style.minHeight = "78px";

  const preview = document.createElement("div");
  preview.id = "momentImagePreview";
  preview.className = "moment-images";
  preview.style.display = "none";

  const actionRow = document.createElement("div");
  actionRow.style.display = "flex";
  actionRow.style.alignItems = "center";
  actionRow.style.justifyContent = "space-between";
  actionRow.style.gap = "8px";

  const leftActions = document.createElement("div");
  leftActions.style.display = "flex";
  leftActions.style.gap = "8px";

  const imageInput = document.createElement("input");
  imageInput.type = "file";
  imageInput.accept = "image/*";
  imageInput.multiple = true;
  imageInput.className = "hidden";

  const imageButton = createButton("加图片", "secondary-button");
  imageButton.addEventListener("click", () => {
    imageInput.value = "";
    imageInput.click();
  });

  imageInput.addEventListener("change", async () => {
    try {
      const files = Array.from(imageInput.files || []).slice(0, 9);

      for (const file of files) {
        const base64 = await readFileAsBase64(file, {
          imageOnly: true,
          maxSizeMB: 8
        });

        selectedImages.push(base64);
      }

      selectedImages = selectedImages.slice(0, 9);
      renderSelectedImages(preview);
    } catch (error) {
      await showAlert(error.message || "图片读取失败");
    }
  });

  const aiPostButton = createButton("AI 动态", "secondary-button");
  aiPostButton.addEventListener("click", showAiPostPicker);

  leftActions.appendChild(imageButton);
  leftActions.appendChild(aiPostButton);
  leftActions.appendChild(imageInput);

  const sendButton = createButton("发布", "primary-button");
  sendButton.addEventListener("click", async () => {
    const content = textarea.value.trim();

    if (!content && selectedImages.length === 0) {
      await showAlert("请输入内容或添加图片");
      return;
    }

    const moment = addMoment({
      authorId: "user",
      authorName: "用户",
      authorAvatar: localStorage.getItem("ai_phone_user_avatar") || "",
      content,
      images: selectedImages,
      likes: [],
      comments: [],
      createdAt: getNowInfo().timestamp
    });

    textarea.value = "";
    selectedImages = [];
    render();

    void maybeAiInteractWithMoment(moment, {
      source: "user-post"
    }).catch((error) => {
      console.warn("朋友圈自动互动失败：", error);
    });
  });

  actionRow.appendChild(leftActions);
  actionRow.appendChild(sendButton);

  card.appendChild(textarea);
  card.appendChild(preview);
  card.appendChild(actionRow);

  container.appendChild(card);
}

function renderSelectedImages(preview) {
  preview.innerHTML = "";

  if (selectedImages.length === 0) {
    preview.style.display = "none";
    return;
  }

  preview.style.display = "grid";

  selectedImages.forEach((image, index) => {
    const wrap = document.createElement("div");
    wrap.style.position = "relative";

    const img = document.createElement("img");
    img.src = image;
    img.alt = "待发布图片";

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.style.position = "absolute";
    removeButton.style.right = "4px";
    removeButton.style.top = "4px";
    removeButton.style.width = "24px";
    removeButton.style.height = "24px";
    removeButton.style.borderRadius = "50%";
    removeButton.style.background = "rgba(0,0,0,0.52)";
    removeButton.style.color = "#fff";
    removeButton.style.padding = "0";
    removeButton.addEventListener("click", () => {
      selectedImages.splice(index, 1);
      renderSelectedImages(preview);
    });

    wrap.appendChild(img);
    wrap.appendChild(removeButton);
    preview.appendChild(wrap);
  });
}

function renderFeed(container) {
  const feed = document.createElement("div");
  feed.className = "moment-feed";

  if (moments.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state card";

    const inner = document.createElement("div");
    inner.style.display = "grid";
    inner.style.justifyItems = "center";
    inner.style.gap = "10px";

    const icon = createSvgIcon("empty");
    icon.style.width = "42px";
    icon.style.height = "42px";
    icon.style.stroke = "currentColor";
    icon.style.fill = "none";

    const text = document.createElement("div");
    text.textContent = "还没有动态";

    inner.appendChild(icon);
    inner.appendChild(text);
    empty.appendChild(inner);
    feed.appendChild(empty);
  } else {
    moments.forEach((moment) => {
      feed.appendChild(createMomentCard(moment));
    });
  }

  container.appendChild(feed);
}

function createMomentCard(moment) {
  const card = document.createElement("article");
  card.className = "moment-card";

  const avatar = createAvatar(moment.authorId, 42);

  const body = document.createElement("div");

  const name = document.createElement("div");
  name.className = "moment-name";
  name.textContent = moment.authorName || getCharacterName(moment.authorId);

  const content = document.createElement("div");
  content.className = "moment-content";
  content.textContent = moment.content || "";

  body.appendChild(name);

  if (moment.content) {
    body.appendChild(content);
  }

  if (Array.isArray(moment.images) && moment.images.length > 0) {
    const images = document.createElement("div");
    images.className = "moment-images";

    moment.images.forEach((image) => {
      const img = document.createElement("img");
      img.src = image;
      img.alt = "动态图片";
      images.appendChild(img);
    });

    body.appendChild(images);
  }

  const footer = document.createElement("div");
  footer.className = "moment-footer";

  const time = document.createElement("span");
  time.textContent = formatTime(moment.createdAt);

  const likeButton = document.createElement("button");
  likeButton.type = "button";
  likeButton.style.background = "transparent";
  likeButton.style.color = "var(--text-secondary)";
  likeButton.style.padding = "0";
  likeButton.textContent = `点赞 ${Array.isArray(moment.likes) ? moment.likes.length : 0}`;
  likeButton.addEventListener("click", () => {
    toggleUserLike(moment.id);
  });

  const commentButton = document.createElement("button");
  commentButton.type = "button";
  commentButton.style.background = "transparent";
  commentButton.style.color = "var(--text-secondary)";
  commentButton.style.padding = "0";
  commentButton.textContent = `评论 ${Array.isArray(moment.comments) ? moment.comments.length : 0}`;
  commentButton.addEventListener("click", () => {
    showCommentModal(moment.id);
  });

  const aiButton = document.createElement("button");
  aiButton.type = "button";
  aiButton.style.background = "transparent";
  aiButton.style.color = "var(--text-secondary)";
  aiButton.style.padding = "0";
  aiButton.textContent = "AI 互动";
  aiButton.addEventListener("click", () => {
    showAiCommentPicker(moment.id);
  });

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.style.background = "transparent";
  deleteButton.style.color = "var(--text-secondary)";
  deleteButton.style.padding = "0";
  deleteButton.textContent = "删除";
  deleteButton.addEventListener("click", () => {
    deleteMoment(moment.id);
  });

  footer.appendChild(time);
  footer.appendChild(likeButton);
  footer.appendChild(commentButton);
  footer.appendChild(aiButton);

  if (moment.authorId === "user") {
    footer.appendChild(deleteButton);
  }

  body.appendChild(footer);

  if (Array.isArray(moment.likes) && moment.likes.length > 0) {
    const likes = document.createElement("div");
    likes.style.marginTop = "8px";
    likes.style.padding = "8px";
    likes.style.borderRadius = "10px";
    likes.style.background = "var(--bg-secondary)";
    likes.style.color = "var(--text-secondary)";
    likes.style.fontSize = "12px";
    likes.textContent = `点赞：${moment.likes.map((like) => like.name || getCharacterName(like.id)).join("、")}`;
    body.appendChild(likes);
  }

  if (Array.isArray(moment.comments) && moment.comments.length > 0) {
    const comments = document.createElement("div");
    comments.style.marginTop = "8px";
    comments.style.padding = "8px";
    comments.style.borderRadius = "10px";
    comments.style.background = "var(--bg-secondary)";
    comments.style.display = "grid";
    comments.style.gap = "6px";

    moment.comments.forEach((comment) => {
      const item = document.createElement("div");
      item.style.fontSize = "13px";
      item.style.lineHeight = "1.5";

      const author = document.createElement("span");
      author.style.fontWeight = "700";
      author.textContent = `${comment.authorName || getCharacterName(comment.authorId)}：`;

      const text = document.createElement("span");
      text.textContent = comment.content || "";

      item.appendChild(author);
      item.appendChild(text);
      comments.appendChild(item);
    });

    body.appendChild(comments);
  }

  card.appendChild(avatar);
  card.appendChild(body);

  return card;
}

function formatTime(timestamp) {
  if (!timestamp) return "";

  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60 * 1000) {
    return "刚刚";
  }

  if (diff < 60 * 60 * 1000) {
    return `${Math.floor(diff / 60000)}分钟前`;
  }

  if (diff < 24 * 60 * 60 * 1000) {
    return `${Math.floor(diff / 3600000)}小时前`;
  }

  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${month}-${day} ${hour}:${minute}`;
}

function updateMoment(momentId, updater) {
  const nextMoments = getMoments().map((moment) => {
    if (moment.id !== momentId) {
      return moment;
    }

    return updater(moment);
  });

  saveMoments(nextMoments);
  refreshData();
}

function toggleUserLike(momentId) {
  updateMoment(momentId, (moment) => {
    const likes = Array.isArray(moment.likes) ? [...moment.likes] : [];
    const exists = likes.some((like) => like.id === "user");

    return {
      ...moment,
      likes: exists
        ? likes.filter((like) => like.id !== "user")
        : [
            ...likes,
            {
              id: "user",
              name: "用户",
              createdAt: getNowInfo().timestamp
            }
          ]
    };
  });

  render();
}

async function deleteMoment(momentId) {
  const confirmed = await showConfirm("确定删除这条动态吗？", {
    title: "删除动态",
    okText: "删除",
    cancelText: "取消",
    danger: true
  });

  if (!confirmed) return;

  const nextMoments = getMoments().filter((moment) => moment.id !== momentId);
  saveMoments(nextMoments);
  render();
}

function showPublishModal() {
  selectedImages = [];
  render();
}

function showCommentModal(momentId) {
  const moment = getMoments().find((item) => item.id === momentId);

  if (!moment) return;

  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "12px";

  const textarea = document.createElement("textarea");
  textarea.className = "textarea-input";
  textarea.placeholder = "写评论";
  textarea.style.minHeight = "80px";

  const sendButton = createButton("发布评论", "primary-button");
  sendButton.addEventListener("click", async () => {
    const content = textarea.value.trim();

    if (!content) {
      await showAlert("请输入评论内容");
      return;
    }

    const comment = {
      id: createId("comment"),
      authorId: "user",
      authorName: "用户",
      content,
      createdAt: getNowInfo().timestamp
    };

    updateMoment(momentId, (oldMoment) => {
      const comments = Array.isArray(oldMoment.comments) ? oldMoment.comments : [];

      return {
        ...oldMoment,
        comments: [
          ...comments,
          comment
        ]
      };
    });

    closeModal();
    render();

    void maybeAuthorReplyToUserComment(momentId, comment).catch((error) => {
      console.warn("朋友圈作者回复失败：", error);
    });
  });

  const aiReplyButton = createButton("让 AI 回复评论", "secondary-button");
  aiReplyButton.addEventListener("click", () => {
    closeModal();
    showAiCommentPicker(momentId);
  });

  body.appendChild(textarea);
  body.appendChild(sendButton);
  body.appendChild(aiReplyButton);

  showModal("评论", body);
}

function showAiPostPicker() {
  refreshData();

  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "10px";

  if (characters.length === 0) {
    body.appendChild(createEmptyState("还没有 AI 角色"));
  } else {
    characters.forEach((character) => {
      const button = createButton(character.name || "未命名角色", "secondary-button");
      button.addEventListener("click", async () => {
        closeModal();
        await createAiMoment(character.id, {
          manual: true
        });
      });

      body.appendChild(button);
    });
  }

  showModal("选择发动态的 AI", body);
}

function showAiCommentPicker(momentId) {
  refreshData();

  const body = document.createElement("div");
  body.style.display = "grid";
  body.style.gap = "10px";

  if (characters.length === 0) {
    body.appendChild(createEmptyState("还没有 AI 角色"));
  } else {
    characters.forEach((character) => {
      const button = createButton(character.name || "未命名角色", "secondary-button");
      button.addEventListener("click", async () => {
        closeModal();
        await createAiComment(momentId, character.id, {
          manual: true
        });
      });

      body.appendChild(button);
    });
  }

  showModal("选择评论的 AI", body);
}

function formatChatHistoryForPrompt(chatHistory = []) {
  return (Array.isArray(chatHistory) ? chatHistory : [])
    .filter((message) => message && !message.hidden)
    .slice(-12)
    .map((message) => {
      const name = message.role === "assistant"
        ? message.characterName || "AI"
        : "用户";

      return `${name}：${String(message.content || "").trim()}`;
    })
    .filter((line) => line.trim())
    .join("\n");
}

function hasRecentMomentByCharacter(characterId) {
  const now = Date.now();

  return getMoments().some((moment) => {
    if (moment.authorId !== characterId) return false;

    const time = new Date(moment.createdAt || "").getTime();

    if (!Number.isFinite(time)) return false;

    return now - time < RECENT_AUTO_POST_LIMIT_MS;
  });
}

async function createAiMoment(characterId, options = {}) {
  if (isProcessing && !options.silent) return null;

  const character = getCharacterById(characterId);

  if (!character) return null;

  const apiConfig = getResolvedCharacterApiConfig(character);

  if (!apiConfig.endpoint || !apiConfig.model) {
    if (!options.silent) {
      await showAlert(`「${character.name || "该角色"}」缺少 API 地址或模型名。`);
    }

    return null;
  }

  isProcessing = true;

  try {
    const result = await silentJsonRequest({
      systemPrompt: [
        character.systemPrompt || "",
        "你正在以这个角色身份写一条朋友圈动态。",
        "动态要自然，像生活分享，不要像机器人公告。",
        "不要使用表情符号。",
        "只返回 JSON。"
      ].join("\n\n"),
      prompt: [
        `当前时间：${getNowInfo().localText}`,
        options.prompt || "请生成一条这个角色现在可能会发的朋友圈。",
        "如果你觉得没必要发，返回：",
        "{\"post\": null}",
        "如果要发，返回：",
        "{\"post\": \"动态内容\", \"mood\": \"心情关键词\"}"
      ].join("\n"),
      endpoint: apiConfig.endpoint,
      apiKey: apiConfig.apiKey,
      model: apiConfig.model,
      temperature: options.temperature ?? 0.8,
      fallback: {
        post: null
      }
    });

    const post = String(result?.post || "").trim();

    if (!post) {
      if (!options.silent) {
        await showAlert("这个角色暂时没有想发的动态。");
      }

      return null;
    }

    const moment = addMoment({
      authorId: character.id,
      authorName: character.name || "未命名角色",
      authorAvatar: character.avatar || "",
      content: post,
      images: [],
      likes: [],
      comments: [],
      mood: result?.mood || "",
      createdAt: getNowInfo().timestamp
    });

    render();

    await rememberCharacterInteraction({
      character,
      messages: [
        {
          role: "assistant",
          characterName: character.name,
          content: `在朋友圈发布动态：${post}`
        }
      ],
      source: options.source || "moments-post",
      sourceName: options.sourceName || "朋友圈动态"
    });

    if (options.autoInteract !== false) {
      void maybeAiInteractWithMoment(moment, {
        source: "ai-post"
      }).catch((error) => {
        console.warn("AI 动态自动互动失败：", error);
      });
    }

    return moment;
  } catch (error) {
    if (!options.silent) {
      await showAlert(`AI 动态生成失败：${error.message || "未知错误"}`);
    } else {
      console.warn("AI 动态生成失败：", error);
    }

    return null;
  } finally {
    isProcessing = false;
  }
}

async function createAiComment(momentId, characterId, options = {}) {
  if (isProcessing && !options.silent) return null;

  const moment = getMoments().find((item) => item.id === momentId);
  const character = getCharacterById(characterId);

  if (!moment || !character) return null;

  if (moment.authorId === character.id && options.skipSelf !== false) {
    return null;
  }

  const apiConfig = getResolvedCharacterApiConfig(character);

  if (!apiConfig.endpoint || !apiConfig.model) {
    if (!options.silent) {
      await showAlert(`「${character.name || "该角色"}」缺少 API 地址或模型名。`);
    }

    return null;
  }

  isProcessing = true;

  try {
    const commentsText = Array.isArray(moment.comments)
      ? moment.comments.map((comment) => `${comment.authorName || getCharacterName(comment.authorId)}：${comment.content}`).join("\n")
      : "";

    const result = await silentJsonRequest({
      systemPrompt: [
        character.systemPrompt || "",
        "你正在以这个角色身份回复朋友圈评论。",
        "回复要自然，像真实社交软件里的评论。",
        "不要替别人说话。",
        "不要使用表情符号。",
        "只返回 JSON。"
      ].join("\n\n"),
      prompt: [
        `当前时间：${getNowInfo().localText}`,
        `动态作者：${moment.authorName || getCharacterName(moment.authorId)}`,
        `动态内容：${moment.content || "无文字内容"}`,
        "",
        commentsText ? `已有评论：\n${commentsText}` : "暂无评论。",
        "",
        options.prompt || "请生成一条你的评论。",
        "如果你不想评论，返回：",
        "{\"comment\": null}",
        "如果要评论，返回：",
        "{\"comment\": \"评论内容\"}"
      ].join("\n"),
      endpoint: apiConfig.endpoint,
      apiKey: apiConfig.apiKey,
      model: apiConfig.model,
      temperature: options.temperature ?? 0.7,
      fallback: {
        comment: null
      }
    });

    const commentText = String(result?.comment || "").trim();

    if (!commentText) {
      if (!options.silent) {
        await showAlert("这个角色暂时没有想评论的内容。");
      }

      return null;
    }

    const comment = {
      id: createId("comment"),
      authorId: character.id,
      authorName: character.name || "未命名角色",
      content: commentText,
      createdAt: getNowInfo().timestamp
    };

    updateMoment(momentId, (oldMoment) => {
      const comments = Array.isArray(oldMoment.comments) ? oldMoment.comments : [];

      return {
        ...oldMoment,
        comments: [
          ...comments,
          comment
        ]
      };
    });

    render();

    await rememberCharacterInteraction({
      character,
      messages: [
        {
          role: "user",
          content: `朋友圈动态：${moment.content || ""}`
        },
        {
          role: "assistant",
          characterName: character.name,
          content: `评论：${commentText}`
        }
      ],
      source: options.source || "moments-comment",
      sourceName: options.sourceName || "朋友圈评论"
    });

    return comment;
  } catch (error) {
    if (!options.silent) {
      await showAlert(`AI 评论失败：${error.message || "未知错误"}`);
    } else {
      console.warn("AI 评论失败：", error);
    }

    return null;
  } finally {
    isProcessing = false;
  }
}

async function maybeAuthorReplyToUserComment(momentId, userComment) {
  const settings = getSettings();

  if (settings.autoMomentEnabled === false) return;

  const moment = getMoments().find((item) => item.id === momentId);

  if (!moment || moment.authorId === "user") return;

  const character = getCharacterById(moment.authorId);

  if (!character) return;

  if (Math.random() > 0.75) return;

  await createAiComment(momentId, character.id, {
    silent: true,
    skipSelf: false,
    source: "moments-user-comment",
    sourceName: "朋友圈用户评论",
    prompt: `用户刚刚评论了你的朋友圈：${userComment.content}。请以你的身份自然回复。`
  });

  await rememberCharacterInteraction({
    character,
    messages: [
      {
        role: "user",
        content: `用户在朋友圈评论了我：${userComment.content}`
      }
    ],
    source: "moments-user-comment",
    sourceName: "朋友圈用户评论"
  });
}

async function maybeAiInteractWithMoment(moment, options = {}) {
  const settings = getSettings();

  if (settings.autoMomentEnabled === false) return;
  if (!moment) return;

  refreshData();

  const candidates = characters
    .filter((character) => character.id !== moment.authorId)
    .sort(() => Math.random() - 0.5)
    .slice(0, 2);

  for (const character of candidates) {
    if (Math.random() > AUTO_INTERACT_PROBABILITY) {
      continue;
    }

    if (Math.random() > AUTO_COMMENT_PROBABILITY) {
      updateMoment(moment.id, (oldMoment) => {
        const likes = Array.isArray(oldMoment.likes) ? oldMoment.likes : [];
        const exists = likes.some((like) => like.id === character.id);

        if (exists) return oldMoment;

        return {
          ...oldMoment,
          likes: [
            ...likes,
            {
              id: character.id,
              name: character.name || "未命名角色",
              createdAt: getNowInfo().timestamp
            }
          ]
        };
      });
    } else {
      await createAiComment(moment.id, character.id, {
        silent: true,
        source: "moments-auto-comment",
        sourceName: "朋友圈自动评论",
        prompt: [
          "请判断你是否想评论这条朋友圈。",
          "如果这条动态与你无关，或你没有自然想说的话，可以返回 null。",
          "如果评论，请短一点，像真实社交软件里的回复。"
        ].join("\n")
      });
    }
  }

  if (rootElement) {
    render();
  }
}

export async function maybeAutoCreateMomentAfterChatReply({
  characterId = "",
  latestUserMessage = "",
  latestAiMessage = "",
  chatHistory = [],
  scene = "chat"
} = {}) {
  const settings = getSettings();

  if (settings.autoMomentEnabled === false) {
    return {
      created: false,
      reason: "disabled"
    };
  }

  if (!characterId || !latestAiMessage) {
    return {
      created: false,
      reason: "missing-data"
    };
  }

  if (Math.random() > AUTO_MOMENT_PROBABILITY) {
    return {
      created: false,
      reason: "probability"
    };
  }

  if (hasRecentMomentByCharacter(characterId)) {
    return {
      created: false,
      reason: "recent-post"
    };
  }

  const character = getCharacterById(characterId);

  if (!character) {
    return {
      created: false,
      reason: "missing-character"
    };
  }

  const apiConfig = getResolvedCharacterApiConfig(character);

  if (!apiConfig.endpoint || !apiConfig.model) {
    return {
      created: false,
      reason: "missing-api"
    };
  }

  const chatText = formatChatHistoryForPrompt(chatHistory);

  const moment = await createAiMoment(character.id, {
    silent: true,
    autoInteract: true,
    source: "moments-auto-post",
    sourceName: "聊天后自动朋友圈",
    temperature: 0.75,
    prompt: [
      `触发场景：${scene}`,
      `刚才用户说：${latestUserMessage || "无"}`,
      `你刚才回复：${latestAiMessage}`,
      "",
      chatText ? `最近聊天：\n${chatText}` : "",
      "",
      "请判断你作为这个角色，现在是否真的有想发朋友圈的心情或想法。",
      "不要每次都发。只有当内容自然、像生活分享、适合发动态时才发。",
      "不要复述聊天全文，不要像公告。",
      "不要使用表情符号。"
    ].join("\n")
  });

  return {
    created: Boolean(moment),
    moment
  };
}

function showModal(titleText, bodyElement) {
  closeModal();

  const mask = document.createElement("div");
  mask.className = "modal-mask";
  mask.id = "momentsModalMask";

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
  const old = document.getElementById("momentsModalMask");

  if (old) {
    old.remove();
  }
}

export function mountApp({ root }) {
  rootElement = root;
  selectedImages = [];
  render();
}

export default mountApp;
