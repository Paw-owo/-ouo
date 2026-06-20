import {
  getMcpServers,
  getNowInfo
} from "./storage.js";

const DEFAULT_TIMEOUT_MS = 30000;

function normalizeString(value, fallback = "") {
  if (value === null || value === undefined) {
    return fallback;
  }

  return String(value);
}

function safeJsonParse(text, fallback = null) {
  try {
    if (!text) return fallback;
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function createAbortSignal(timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => {
    controller.abort();
  }, Math.max(1000, Number(timeoutMs) || DEFAULT_TIMEOUT_MS));

  return {
    signal: controller.signal,
    clear() {
      window.clearTimeout(timeout);
    }
  };
}

function normalizeMcpServer(server = {}) {
  return {
    id: normalizeString(server.id),
    name: normalizeString(server.name, "未命名 MCP"),
    url: normalizeString(server.url),
    description: normalizeString(server.description)
  };
}

function getMcpServerById(serverId = "") {
  const servers = getMcpServers().map(normalizeMcpServer);
  return servers.find((server) => server.id === serverId) || null;
}

function buildContextSummary(context = {}) {
  const mode = context.mode === "group" ? "group" : "single";
  const chatHistory = Array.isArray(context.chatHistory) ? context.chatHistory : [];
  const visibleHistory = chatHistory
    .filter((message) => message && !message.hidden)
    .slice(-20)
    .map((message) => {
      return {
        role: message.role || "user",
        characterId: message.characterId || "",
        characterName: message.characterName || "",
        content: normalizeString(message.content),
        createdAt: message.createdAt || ""
      };
    });

  return {
    mode,
    characterId: context.characterId || "",
    characterName: context.characterName || "",
    groupId: context.groupId || "",
    groupName: context.groupName || "",
    chatHistory: visibleHistory
  };
}

function buildMcpRequestBody({
  server,
  input = "",
  context = {}
} = {}) {
  return {
    input: normalizeString(input),
    context: buildContextSummary(context),
    server: {
      id: server.id,
      name: server.name,
      description: server.description
    },
    time: getNowInfo()
  };
}

async function readResponseBody(response) {
  const text = await response.text();
  const json = safeJsonParse(text, null);

  if (json !== null) {
    return json;
  }

  return text;
}

function extractResultText(result) {
  if (result === null || result === undefined) {
    return "";
  }

  if (typeof result === "string") {
    return result.trim();
  }

  if (typeof result === "number" || typeof result === "boolean") {
    return String(result);
  }

  if (Array.isArray(result)) {
    return result
      .map((item) => extractResultText(item))
      .filter(Boolean)
      .join("\n");
  }

  if (typeof result === "object") {
    if (typeof result.text === "string") {
      return result.text.trim();
    }

    if (typeof result.content === "string") {
      return result.content.trim();
    }

    if (Array.isArray(result.content)) {
      return extractResultText(result.content);
    }

    if (typeof result.result === "string") {
      return result.result.trim();
    }

    if (result.result) {
      return extractResultText(result.result);
    }

    if (typeof result.output === "string") {
      return result.output.trim();
    }

    if (result.output) {
      return extractResultText(result.output);
    }

    if (result.data) {
      return extractResultText(result.data);
    }

    return JSON.stringify(result, null, 2);
  }

  return String(result);
}

function buildErrorMessage(error) {
  if (!error) {
    return "未知错误";
  }

  if (error.name === "AbortError") {
    return "MCP 请求超时。请检查 Server 是否可访问。";
  }

  const message = normalizeString(error.message || error);

  if (message.toLowerCase().includes("failed to fetch")) {
    return "MCP 请求失败。常见原因：Server 地址不通，或 Server 没允许网页访问。";
  }

  return message || "未知错误";
}

export function getAvailableMcpServers() {
  return getMcpServers()
    .map(normalizeMcpServer)
    .filter((server) => server.id && server.url);
}

export function hasMcpServers() {
  return getAvailableMcpServers().length > 0;
}

export async function callMcpServer({
  serverId = "",
  input = "",
  context = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
  const server = getMcpServerById(serverId);

  if (!server) {
    throw new Error("找不到 MCP Server");
  }

  if (!server.url) {
    throw new Error("MCP Server 缺少 URL");
  }

  const timeout = createAbortSignal(timeoutMs);
  const body = buildMcpRequestBody({
    server,
    input,
    context
  });

  try {
    const response = await fetch(server.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
      signal: timeout.signal
    });

    const responseBody = await readResponseBody(response);

    if (!response.ok) {
      const message = extractResultText(responseBody) || `MCP 请求失败：${response.status}`;
      throw new Error(message);
    }

    const resultText = extractResultText(responseBody);

    return {
      ok: true,
      server,
      input: normalizeString(input),
      raw: responseBody,
      text: resultText || "MCP 已返回结果，但结果为空。",
      createdAt: getNowInfo().timestamp
    };
  } catch (error) {
    throw new Error(buildErrorMessage(error));
  } finally {
    timeout.clear();
  }
}

export function buildMcpHiddenMessage(result = {}) {
  const serverName = result.server?.name || "MCP 工具";
  const input = normalizeString(result.input);
  const text = normalizeString(result.text || extractResultText(result.raw));

  return {
    role: "user",
    content: [
      `[MCP 工具结果]`,
      `工具：${serverName}`,
      input ? `用户输入：${input}` : "",
      "",
      "工具返回：",
      text || "无结果",
      "",
      "请结合这个工具结果继续回答用户。不要编造工具没有返回的信息。"
    ].filter(Boolean).join("\n"),
    hidden: true
  };
}

export function formatMcpResultForDisplay(result = {}) {
  const serverName = result.server?.name || "MCP 工具";
  const text = normalizeString(result.text || extractResultText(result.raw));

  return [
    `工具：${serverName}`,
    "",
    text || "无结果"
  ].join("\n");
}

