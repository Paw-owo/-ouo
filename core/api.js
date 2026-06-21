import {
  readState,
  updateState,
  getApiConfig,
  getCharacter,
  getConversation,
  createChatConfig,
} from "./storage.js";

export const OPENAI_CHAT_PATH = "/v1/chat/completions";
export const OPENAI_MODELS_PATH = "/v1/models";

const activeControllers = new Map();

export function normalizeEndpoint(endpoint = "") {
  return String(endpoint || "").trim().replace(/\/+$/, "");
}

export function buildApiUrl(endpoint, path) {
  const base = normalizeEndpoint(endpoint);
  if (!base) throw new Error("请先填写 API endpoint");
  if (base.endsWith("/v1") && path.startsWith("/v1/")) {
    return `${base}${path.slice(3)}`;
  }
  return `${base}${path}`;
}

export function createAuthHeaders(apiConfig = {}) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (apiConfig.key) {
    headers.Authorization = `Bearer ${apiConfig.key}`;
  }

  return headers;
}

export function getDefaultApiConfig() {
  const state = readState();
  return state.apiConfigs[0] || null;
}

export function resolveApiConfig(apiConfigId = "") {
  return getApiConfig(apiConfigId) || getDefaultApiConfig();
}

export function resolveModel(apiConfig, preferredModel = "") {
  return preferredModel || apiConfig?.selectedModel || apiConfig?.models?.[0] || "";
}

export function resolveChatApiOptions({ characterId = "", conversationType = "single", conversationId = "", overrides = {} } = {}) {
  const state = readState();
  const character = characterId ? getCharacter(characterId) : null;
  const conversation = conversationId ? getConversation(conversationType, conversationId) : null;
  const chatConfig = {
    ...createChatConfig(),
    ...(conversation?.chatConfig || {}),
    apiConfigId: conversation?.chatConfig?.apiConfigId || character?.apiConfigId || "",
    apiModel: conversation?.chatConfig?.apiModel || character?.apiModel || "",
    ...overrides,
  };

  const apiConfig =
    state.apiConfigs.find((config) => config.id === chatConfig.apiConfigId) ||
    state.apiConfigs.find((config) => config.id === character?.apiConfigId) ||
    state.apiConfigs[0];

  return {
    apiConfig,
    model: resolveModel(apiConfig, chatConfig.apiModel),
    chatConfig,
    character,
    conversation,
  };
}

export async function fetchModels(apiConfigOrId) {
  const apiConfig = typeof apiConfigOrId === "string" ? resolveApiConfig(apiConfigOrId) : apiConfigOrId;
  if (!apiConfig) throw new Error("没有可用的 API 配置");

  const response = await fetch(buildApiUrl(apiConfig.endpoint, OPENAI_MODELS_PATH), {
    method: "GET",
    headers: createAuthHeaders(apiConfig),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "模型拉取失败"));
  }

  const data = await response.json();
  const models = normalizeModels(data);

  updateState((state) => {
    const target = state.apiConfigs.find((config) => config.id === apiConfig.id);
    if (target) {
      target.models = models;
      target.selectedModel = target.selectedModel || models[0] || "";
      target.updatedAt = new Date().toISOString();
    }
    return state;
  });

  return models;
}

export function normalizeModels(data) {
  if (Array.isArray(data)) {
    return data.map((item) => (typeof item === "string" ? item : item?.id)).filter(Boolean);
  }

  if (Array.isArray(data?.data)) {
    return data.data.map((item) => item?.id || item?.name).filter(Boolean);
  }

  if (Array.isArray(data?.models)) {
    return data.models.map((item) => (typeof item === "string" ? item : item?.id || item?.name)).filter(Boolean);
  }

  return [];
}

export async function chatCompletion({
  apiConfigId = "",
  model = "",
  messages = [],
  temperature = 0.8,
  maxTokens,
  tools,
  signal,
  extra = {},
} = {}) {
  const apiConfig = resolveApiConfig(apiConfigId);
  if (!apiConfig) throw new Error("没有可用的 API 配置");

  const payload = cleanPayload({
    model: resolveModel(apiConfig, model),
    messages,
    temperature,
    max_tokens: maxTokens,
    tools,
    stream: false,
    ...extra,
  });

  const response = await fetch(buildApiUrl(apiConfig.endpoint, OPENAI_CHAT_PATH), {
    method: "POST",
    headers: createAuthHeaders(apiConfig),
    body: JSON.stringify(payload),
    signal,
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "AI 回复失败"));
  }

  const data = await response.json();
  return normalizeChatResponse(data);
}

export async function streamChatCompletion({
  apiConfigId = "",
  model = "",
  messages = [],
  temperature = 0.8,
  maxTokens,
  tools,
  signal,
  conversationKey = "",
  onStart,
  onDelta,
  onThinking,
  onToolCall,
  onDone,
  onError,
  extra = {},
} = {}) {
  const apiConfig = resolveApiConfig(apiConfigId);
  if (!apiConfig) throw new Error("没有可用的 API 配置");

  const controller = new AbortController();
  const linkedSignal = signal || controller.signal;
  const key = conversationKey || `${apiConfig.id}_${Date.now()}`;
  activeControllers.set(key, controller);

  const payload = cleanPayload({
    model: resolveModel(apiConfig, model),
    messages,
    temperature,
    max_tokens: maxTokens,
    tools,
    stream: true,
    ...extra,
  });

  try {
    onStart?.();

    const response = await fetch(buildApiUrl(apiConfig.endpoint, OPENAI_CHAT_PATH), {
      method: "POST",
      headers: createAuthHeaders(apiConfig),
      body: JSON.stringify(payload),
      signal: linkedSignal,
    });

    if (!response.ok) {
      throw new Error(await readErrorMessage(response, "AI 流式回复失败"));
    }

    if (!response.body) {
      const fallback = await response.json();
      const normalized = normalizeChatResponse(fallback);
      onDelta?.(normalized.content);
      onDone?.(normalized);
      return normalized;
    }

    const result = await readSseStream(response.body, {
      onDelta,
      onThinking,
      onToolCall,
      signal: linkedSignal,
    });

    onDone?.(result);
    return result;
  } catch (error) {
    if (error.name !== "AbortError") onError?.(error);
    throw error;
  } finally {
    activeControllers.delete(key);
  }
}

export function abortStream(conversationKey) {
  const controller = activeControllers.get(conversationKey);
  if (controller) {
    controller.abort();
    activeControllers.delete(conversationKey);
    return true;
  }
  return false;
}

export function abortAllStreams() {
  activeControllers.forEach((controller) => controller.abort());
  activeControllers.clear();
}

export async function readSseStream(body, handlers = {}) {
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let content = "";
  let thinking = "";
  let rawContent = "";
  const toolCalls = [];

  while (true) {
    if (handlers.signal?.aborted) throw new DOMException("请求已取消", "AbortError");

    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      const lines = chunk.split("\n").map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;

        const dataText = line.slice(5).trim();
        if (!dataText || dataText === "[DONE]") continue;

        const parsed = safeJsonParse(dataText);
        if (!parsed) continue;

        rawContent += dataText + "\n";
        const delta = parsed.choices?.[0]?.delta || parsed.choices?.[0]?.message || {};
        const textDelta = delta.content || "";
        const thinkingDelta = delta.thinking || delta.reasoning_content || "";

        if (textDelta) {
          content += textDelta;
          handlers.onDelta?.(textDelta, parsed);
        }

        if (thinkingDelta) {
          thinking += thinkingDelta;
          handlers.onThinking?.(thinkingDelta, parsed);
        }

        if (delta.tool_calls) {
          toolCalls.push(...delta.tool_calls);
          handlers.onToolCall?.(delta.tool_calls, parsed);
        }
      }
    }
  }

  return {
    content: stripThinkingTags(content).content,
    thinking: thinking || stripThinkingTags(content).thinking,
    rawContent,
    toolCalls,
  };
}

export function normalizeChatResponse(data) {
  const message = data?.choices?.[0]?.message || data?.choices?.[0]?.delta || {};
  const content = message.content || data?.content || "";
  const extracted = stripThinkingTags(content);

  return {
    id: data?.id || "",
    content: extracted.content,
    thinking: message.thinking || message.reasoning_content || extracted.thinking || "",
    rawContent: content,
    toolCalls: message.tool_calls || [],
    usage: data?.usage || null,
    model: data?.model || "",
  };
}

export function stripThinkingTags(content = "") {
  const source = String(content || "");
  const match = source.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  if (!match) return { content: source, thinking: "" };

  return {
    thinking: match[1].trim(),
    content: source.replace(match[0], "").trim(),
  };
}

export function buildSystemMessage({ character, userPersona, memories = [], worldbookEntries = [], inventoryEffects = [], extraPrompt = "" } = {}) {
  const blocks = [
    character?.systemPrompt,
    character?.description ? `角色描述：${character.description}` : "",
    character?.personality ? `性格：${character.personality}` : "",
    character?.scenario ? `场景：${character.scenario}` : "",
    userPersona?.systemPrompt || userPersona?.description ? `用户人设：${userPersona.systemPrompt || userPersona.description}` : "",
    worldbookEntries.length ? `世界书：\n${worldbookEntries.map((entry) => entry.content).join("\n\n")}` : "",
    inventoryEffects.length ? `近期礼物和道具影响：\n${inventoryEffects.join("\n")}` : "",
    memories.length ? `长期记忆：\n${memories.map((memory) => `- ${memory.content || memory}`).join("\n")}` : "",
    extraPrompt,
  ].filter(Boolean);

  return {
    role: "system",
    content: blocks.join("\n\n"),
  };
}

export function buildChatMessages({
  character,
  userPersona,
  memories = [],
  worldbookEntries = [],
  inventoryEffects = [],
  history = [],
  userMessage = "",
  extraPrompt = "",
  maxHistory = 30,
} = {}) {
  const messages = [
    buildSystemMessage({
      character,
      userPersona,
      memories,
      worldbookEntries,
      inventoryEffects,
      extraPrompt,
    }),
  ];

  const historyMessages = history
    .slice(-maxHistory)
    .filter((message) => message?.content || message?.rawContent)
    .map((message) => ({
      role: message.role === "assistant" || message.role === "ai" ? "assistant" : "user",
      content: message.content || message.rawContent || "",
    }));

  messages.push(...historyMessages);

  if (userMessage) {
    messages.push({
      role: "user",
      content: userMessage,
    });
  }

  return messages;
}

export function estimateTokenCount(text = "") {
  const source = String(text || "");
  const chineseChars = (source.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherWords = source.replace(/[\u4e00-\u9fa5]/g, " ").trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(chineseChars * 1.2 + otherWords * 1.6);
}

export function buildMcpToolPrompt(selectedServers = []) {
  if (!selectedServers.length) return "";
  return [
    "可用 MCP 工具：",
    ...selectedServers.map((server) => {
      const tools = (server.tools || []).map((tool) => tool.name || tool.id || tool).join("、");
      return `- ${server.name}${tools ? `：${tools}` : ""}`;
    }),
    "只有在用户明确需要时才使用这些工具。",
  ].join("\n");
}

async function readErrorMessage(response, fallback) {
  const contentType = response.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const data = await response.json();
      return data?.error?.message || data?.message || `${fallback}：${response.status}`;
    }

    const text = await response.text();
    return text || `${fallback}：${response.status}`;
  } catch {
    return `${fallback}：${response.status}`;
  }
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* 待后续文件对齐：settings.js 的拉取模型调用 fetchModels，chat.js 的流式回复调用 streamChatCompletion。 */
