import {
  getSettings,
  getApiEndpoints,
  getNowInfo,
  getGroupMembers
} from "./storage.js";

function normalizeEndpoint(endpoint) {
  const value = String(endpoint || "").trim();

  if (!value) {
    return "";
  }

  if (value.endsWith("/v1/chat/completions")) {
    return value;
  }

  if (value.endsWith("/chat/completions")) {
    return value;
  }

  const cleanValue = value.replace(/\/+$/, "");

  if (cleanValue.endsWith("/v1")) {
    return `${cleanValue}/chat/completions`;
  }

  return `${cleanValue}/v1/chat/completions`;
}

function safeJsonParse(text, fallback = null) {
  try {
    if (!text) return fallback;
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function getDefaultApiConfig() {
  const settings = getSettings();
  const endpoints = getApiEndpoints();
  const selectedEndpoint = endpoints.find((item) => item.id === settings.defaultApiEndpointId) || endpoints[0] || null;

  return {
    endpoint: selectedEndpoint?.endpoint || "",
    apiKey: selectedEndpoint?.apiKey || "",
    model: settings.defaultModel || selectedEndpoint?.model || "",
    endpointName: selectedEndpoint?.name || ""
  };
}

function mergeApiConfig(config = {}) {
  const defaultConfig = getDefaultApiConfig();

  return {
    endpoint: config.endpoint || defaultConfig.endpoint,
    apiKey: config.apiKey || defaultConfig.apiKey,
    model: config.model || defaultConfig.model,
    endpointName: config.endpointName || defaultConfig.endpointName
  };
}

function buildTimeAwarenessText() {
  const settings = getSettings();

  if (settings.aiTimeAwarenessEnabled === false) {
    return "";
  }

  const now = getNowInfo();

  return [
    "[当前真实时间]",
    `现在是：${now.localText}`,
    `日期：${now.localDate}`,
    `时间：${now.localTime}`,
    `星期：${now.week}`,
    "请自然理解当前时间。可以根据早晚、日期、星期调整语气和内容，但不要主动说你被系统注入了时间。"
  ].join("\n");
}

function getMemoryText(memory) {
  if (typeof memory === "string") {
    return memory.trim();
  }

  return String(memory?.content || memory?.text || "").trim();
}

function buildMemoryListText(title, memories = []) {
  if (!Array.isArray(memories) || memories.length === 0) {
    return "";
  }

  const lines = memories
    .map(getMemoryText)
    .filter(Boolean)
    .map((text) => `- ${text}`);

  if (lines.length === 0) {
    return "";
  }

  return `[${title}]\n${lines.join("\n")}`;
}

export function buildSystemPrompt(systemPrompt = "", extraText = "") {
  const parts = [];

  const cleanSystemPrompt = String(systemPrompt || "").trim();
  const cleanTimeText = buildTimeAwarenessText();
  const cleanExtraText = String(extraText || "").trim();

  if (cleanSystemPrompt) {
    parts.push(cleanSystemPrompt);
  }

  if (cleanTimeText) {
    parts.push(cleanTimeText);
  }

  if (cleanExtraText) {
    parts.push(cleanExtraText);
  }

  return parts.join("\n\n");
}

export function normalizeMessages({ messages = [], systemPrompt = "", extraSystemText = "" } = {}) {
  const result = [];
  const finalSystemPrompt = buildSystemPrompt(systemPrompt, extraSystemText);

  if (finalSystemPrompt) {
    result.push({
      role: "system",
      content: finalSystemPrompt
    });
  }

  messages.forEach((message) => {
    if (!message || typeof message !== "object") return;

    const role = message.role === "assistant" || message.role === "system" || message.role === "user"
      ? message.role
      : "user";

    const content = String(message.content || "");

    if (!content.trim()) return;

    result.push({
      role,
      content
    });
  });

  return result;
}

export function extractThinkingFromText(text = "") {
  const rawText = String(text || "");
  const thinkingMatches = [...rawText.matchAll(/<thinking>([\s\S]*?)<\/thinking>/gi)];
  const thinkMatches = [...rawText.matchAll(/<think>([\s\S]*?)<\/think>/gi)];

  const thinkingParts = [];

  thinkingMatches.forEach((match) => {
    if (match[1]) {
      thinkingParts.push(match[1].trim());
    }
  });

  thinkMatches.forEach((match) => {
    if (match[1]) {
      thinkingParts.push(match[1].trim());
    }
  });

  const content = rawText
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();

  return {
    content,
    thinking: thinkingParts.join("\n\n").trim()
  };
}

export function extractThinkingFromResponse(data) {
  if (!data || typeof data !== "object") {
    return {
      content: "",
      thinking: ""
    };
  }

  const choice = Array.isArray(data.choices) ? data.choices[0] : null;
  const message = choice?.message || {};
  const directThinking = message.thinking || message.reasoning_content || choice?.thinking || "";
  const rawContent = message.content || data.content || "";

  const extracted = extractThinkingFromText(rawContent);

  return {
    content: extracted.content,
    thinking: String(directThinking || extracted.thinking || "").trim()
  };
}

function extractDeltaFromStreamData(data) {
  if (!data || typeof data !== "object") {
    return {
      content: "",
      thinking: "",
      done: false
    };
  }

  const choice = Array.isArray(data.choices) ? data.choices[0] : null;

  if (!choice) {
    return {
      content: "",
      thinking: "",
      done: false
    };
  }

  const delta = choice.delta || {};
  const message = choice.message || {};

  return {
    content: delta.content || message.content || "",
    thinking: delta.thinking || delta.reasoning_content || message.thinking || message.reasoning_content || "",
    done: Boolean(choice.finish_reason)
  };
}

function createHeaders(apiKey = "", extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...extraHeaders
  };

  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
  }

  return headers;
}

async function readErrorMessage(response) {
  try {
    const text = await response.text();
    const data = safeJsonParse(text, null);

    if (data?.error?.message) {
      return data.error.message;
    }

    if (data?.message) {
      return data.message;
    }

    return text || `请求失败：${response.status}`;
  } catch {
    return `请求失败：${response.status}`;
  }
}

function assertApiConfig(config) {
  if (!config.endpoint) {
    throw new Error("缺少 API 地址。请先在设置里填写 API 地址。");
  }

  if (!config.model) {
    throw new Error("缺少模型名。请先在设置里填写模型名。");
  }
}

async function requestNonStream({
  messages,
  systemPrompt,
  extraSystemText,
  model,
  endpoint,
  apiKey,
  temperature = 0.8,
  maxTokens,
  signal
}) {
  const config = mergeApiConfig({
    endpoint,
    apiKey,
    model
  });

  assertApiConfig(config);

  const finalMessages = normalizeMessages({
    messages,
    systemPrompt,
    extraSystemText
  });

  const body = {
    model: config.model,
    messages: finalMessages,
    temperature,
    stream: false
  };

  if (maxTokens) {
    body.max_tokens = maxTokens;
  }

  const response = await fetch(normalizeEndpoint(config.endpoint), {
    method: "POST",
    headers: createHeaders(config.apiKey),
    body: JSON.stringify(body),
    signal
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message);
  }

  const data = await response.json();
  return extractThinkingFromResponse(data);
}

async function requestStream({
  messages,
  systemPrompt,
  extraSystemText,
  model,
  endpoint,
  apiKey,
  temperature = 0.8,
  maxTokens,
  onChunk,
  onThinking,
  onDone,
  signal
}) {
  const config = mergeApiConfig({
    endpoint,
    apiKey,
    model
  });

  assertApiConfig(config);

  const finalMessages = normalizeMessages({
    messages,
    systemPrompt,
    extraSystemText
  });

  const body = {
    model: config.model,
    messages: finalMessages,
    temperature,
    stream: true
  };

  if (maxTokens) {
    body.max_tokens = maxTokens;
  }

  const response = await fetch(normalizeEndpoint(config.endpoint), {
    method: "POST",
    headers: createHeaders(config.apiKey),
    body: JSON.stringify(body),
    signal
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(message);
  }

  if (!response.body) {
    throw new Error("当前浏览器不支持流式读取");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";
  let fullContent = "";
  let fullThinking = "";
  let finished = false;

  while (!finished) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const rawLine of lines) {
      const line = rawLine.trim();

      if (!line) continue;
      if (!line.startsWith("data:")) continue;

      const dataText = line.slice(5).trim();

      if (dataText === "[DONE]") {
        finished = true;
        break;
      }

      const data = safeJsonParse(dataText, null);

      if (!data) continue;

      const delta = extractDeltaFromStreamData(data);

      if (delta.thinking) {
        fullThinking += delta.thinking;

        if (typeof onThinking === "function") {
          onThinking(delta.thinking, fullThinking);
        }
      }

      if (delta.content) {
        fullContent += delta.content;

        if (typeof onChunk === "function") {
          onChunk(delta.content, fullContent);
        }
      }

      if (delta.done) {
        finished = true;
        break;
      }
    }
  }

  const extracted = extractThinkingFromText(fullContent);

  const result = {
    content: extracted.content,
    thinking: String(fullThinking || extracted.thinking || "").trim()
  };

  if (typeof onDone === "function") {
    onDone(result);
  }

  return result;
}

export async function sendMessage({
  messages = [],
  systemPrompt = "",
  extraSystemText = "",
  model = "",
  endpoint = "",
  apiKey = "",
  temperature = 0.8,
  maxTokens,
  stream = true,
  onChunk,
  onThinking,
  onDone,
  onError,
  signal
} = {}) {
  try {
    if (stream) {
      return await requestStream({
        messages,
        systemPrompt,
        extraSystemText,
        model,
        endpoint,
        apiKey,
        temperature,
        maxTokens,
        onChunk,
        onThinking,
        onDone,
        signal
      });
    }

    const result = await requestNonStream({
      messages,
      systemPrompt,
      extraSystemText,
      model,
      endpoint,
      apiKey,
      temperature,
      maxTokens,
      signal
    });

    if (typeof onChunk === "function") {
      onChunk(result.content, result.content);
    }

    if (typeof onThinking === "function" && result.thinking) {
      onThinking(result.thinking, result.thinking);
    }

    if (typeof onDone === "function") {
      onDone(result);
    }

    return result;
  } catch (error) {
    if (typeof onError === "function") {
      onError(error);
    }

    throw error;
  }
}

export async function silentRequest({
  prompt = "",
  messages = [],
  systemPrompt = "",
  extraSystemText = "",
  model = "",
  endpoint = "",
  apiKey = "",
  temperature = 0.3,
  maxTokens,
  signal
} = {}) {
  const finalMessages = Array.isArray(messages) && messages.length > 0
    ? messages
    : [
        {
          role: "user",
          content: String(prompt || "")
        }
      ];

  const result = await requestNonStream({
    messages: finalMessages,
    systemPrompt,
    extraSystemText,
    model,
    endpoint,
    apiKey,
    temperature,
    maxTokens,
    signal
  });

  return result.content;
}

export async function silentJsonRequest({
  prompt = "",
  messages = [],
  systemPrompt = "",
  extraSystemText = "",
  model = "",
  endpoint = "",
  apiKey = "",
  temperature = 0.2,
  maxTokens,
  signal,
  fallback = null
} = {}) {
  const text = await silentRequest({
    prompt,
    messages,
    systemPrompt,
    extraSystemText,
    model,
    endpoint,
    apiKey,
    temperature,
    maxTokens,
    signal
  });

  const directJson = safeJsonParse(text, null);

  if (directJson !== null) {
    return directJson;
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);

  if (jsonMatch) {
    const matchedJson = safeJsonParse(jsonMatch[0], null);

    if (matchedJson !== null) {
      return matchedJson;
    }
  }

  return fallback;
}

export function buildMemorySystemText(memories = []) {
  return buildMemoryListText("以下是你关于用户的长期记忆", memories);
}

export function buildChatMessagesFromHistory(chatHistory = []) {
  if (!Array.isArray(chatHistory)) {
    return [];
  }

  return chatHistory
    .filter((item) => item && typeof item === "object" && !item.hidden)
    .map((item) => {
      const role = item.role === "assistant" || item.role === "user" || item.role === "system"
        ? item.role
        : item.sender === "ai"
          ? "assistant"
          : "user";

      return {
        role,
        content: String(item.content || "")
      };
    })
    .filter((item) => item.content.trim());
}

export function getResolvedCharacterApiConfig(character = {}) {
  const globalConfig = getDefaultApiConfig();
  const characterApi = character.apiConfig || {};

  return {
    endpoint: characterApi.endpoint || globalConfig.endpoint,
    apiKey: characterApi.apiKey || globalConfig.apiKey,
    model: characterApi.model || globalConfig.model
  };
}

export function buildCharacterSystemPrompt(character = {}) {
  const memoryText = buildMemorySystemText(character.memories || []);
  return buildSystemPrompt(character.systemPrompt || "", memoryText);
}

export async function sendCharacterMessage({
  character,
  chatHistory = [],
  userMessage = "",
  onChunk,
  onThinking,
  onDone,
  onError,
  signal
} = {}) {
  if (!character) {
    throw new Error("缺少角色");
  }

  const apiConfig = getResolvedCharacterApiConfig(character);
  const messages = buildChatMessagesFromHistory(chatHistory);

  if (userMessage) {
    messages.push({
      role: "user",
      content: userMessage
    });
  }

  return sendMessage({
    messages,
    systemPrompt: character.systemPrompt || "",
    extraSystemText: buildMemorySystemText(character.memories || []),
    endpoint: apiConfig.endpoint,
    apiKey: apiConfig.apiKey,
    model: apiConfig.model,
    stream: true,
    onChunk,
    onThinking,
    onDone,
    onError,
    signal
  });
}

function buildGroupPublicMemoryText(group = {}) {
  return buildMemoryListText("以下是这个群聊的公共长期记忆", group.memories || []);
}

function buildGroupMembersPublicText(members = []) {
  const lines = members
    .map((member) => `- ${member.name || "未命名角色"}`)
    .filter(Boolean);

  if (lines.length === 0) {
    return "[群成员]\n暂无群成员";
  }

  return `[群成员]\n${lines.join("\n")}`;
}

function buildSpeakerPrivateMemoryText(speakerCharacter = {}) {
  return buildMemoryListText(
    `以下是${speakerCharacter.name || "当前角色"}自己的长期记忆`,
    speakerCharacter.memories || []
  );
}

function buildGroupInfoText(group = {}, members = []) {
  return [
    "[群聊信息]",
    `群聊名称：${group.name || "未命名群聊"}`,
    "",
    buildGroupMembersPublicText(members)
  ].join("\n");
}

export function buildGroupChatMessages(group = {}, speakerCharacter = {}, members = []) {
  const history = Array.isArray(group.chatHistory) ? group.chatHistory : [];

  return history
    .filter((message) => message && !message.hidden)
    .map((message) => {
      if (message.role === "assistant" && message.characterId === speakerCharacter.id) {
        return {
          role: "assistant",
          content: String(message.content || "")
        };
      }

      const speakerName = message.role === "user"
        ? "用户"
        : message.characterName || members.find((member) => member.id === message.characterId)?.name || "某位群成员";

      return {
        role: "user",
        content: `${speakerName}：${String(message.content || "")}`
      };
    })
    .filter((message) => message.content.trim());
}

export function buildGroupSpeakerSystemPrompt(group = {}, speakerCharacter = {}, members = []) {
  const otherMembers = members.filter((member) => member.id !== speakerCharacter.id);

  const baseCharacterPrompt = String(speakerCharacter.systemPrompt || "").trim();
  const groupInfoText = buildGroupInfoText(group, members);
  const groupPublicMemoryText = buildGroupPublicMemoryText(group);
  const speakerPrivateMemoryText = buildSpeakerPrivateMemoryText(speakerCharacter);

  const ruleText = [
    "[群聊发言规则]",
    `你现在在一个多人群聊里。你要扮演的角色是：${speakerCharacter.name || "未命名角色"}。`,
    "你只能代表自己发言，不要替用户说话，不要替其他 AI 角色说话。",
    "你可以看到群聊公共记忆，也可以使用你自己的长期记忆。",
    "你不能知道其他角色的个人记忆、私聊内容、隐藏想法或未公开信息。",
    "如果其他角色没有在当前群聊中公开说过某件事，你就当作不知道。",
    "你的回复应该像群聊消息一样自然，不要每次都长篇大论。",
    "可以回应用户，也可以回应其他群成员。",
    "",
    "[其他群成员]",
    otherMembers.length > 0
      ? otherMembers.map((member) => `- ${member.name || "未命名角色"}`).join("\n")
      : "暂无其他群成员"
  ].join("\n");

  return [
    baseCharacterPrompt,
    groupInfoText,
    groupPublicMemoryText,
    speakerPrivateMemoryText,
    ruleText
  ].filter(Boolean).join("\n\n");
}

export async function sendGroupCharacterMessage({
  group,
  character,
  members = null,
  onChunk,
  onThinking,
  onDone,
  onError,
  signal
} = {}) {
  if (!group) {
    throw new Error("缺少群聊");
  }

  if (!character) {
    throw new Error("缺少发言角色");
  }

  const finalMembers = Array.isArray(members) ? members : getGroupMembers(group);
  const apiConfig = getResolvedCharacterApiConfig(character);
  const messages = buildGroupChatMessages(group, character, finalMembers);
  const systemPrompt = buildGroupSpeakerSystemPrompt(group, character, finalMembers);

  return sendMessage({
    messages,
    systemPrompt,
    endpoint: apiConfig.endpoint,
    apiKey: apiConfig.apiKey,
    model: apiConfig.model,
    stream: true,
    onChunk,
    onThinking,
    onDone,
    onError,
    signal
  });
}

export async function testApiConnection({
  endpoint = "",
  apiKey = "",
  model = ""
} = {}) {
  const result = await sendMessage({
    messages: [
      {
        role: "user",
        content: "请只回复：连接成功"
      }
    ],
    systemPrompt: "你正在进行 API 连接测试。",
    endpoint,
    apiKey,
    model,
    stream: false,
    temperature: 0
  });

  return result.content;
}
