import {
  readState,
  saveMcpServer,
  deleteMcpServer,
  createMcpServer,
} from "./storage.js";
import { buildMcpToolPrompt } from "./api.js";

export const MCP_DEFAULT_GROUP = "默认分组";

export function getMcpServers() {
  return readState().mcpServers || [];
}

export function getEnabledMcpServers() {
  return getMcpServers().filter((server) => server.enabled);
}

export function getMcpServer(id) {
  return getMcpServers().find((server) => server.id === id) || null;
}

export function getMcpServersByGroup(servers = getMcpServers()) {
  return servers.reduce((groups, server) => {
    const group = server.group || MCP_DEFAULT_GROUP;
    groups[group] ??= [];
    groups[group].push(server);
    return groups;
  }, {});
}

export function upsertMcpServer(server) {
  return saveMcpServer({
    ...createMcpServer(),
    ...server,
    group: server.group || MCP_DEFAULT_GROUP,
  });
}

export function removeMcpServer(id) {
  return deleteMcpServer(id);
}

export function toggleMcpServer(id, enabled) {
  const server = getMcpServer(id);
  if (!server) throw new Error("MCP 服务不存在");

  return upsertMcpServer({
    ...server,
    enabled: Boolean(enabled),
  });
}

export async function refreshMcpTools(serverId) {
  const server = getMcpServer(serverId);
  if (!server) throw new Error("MCP 服务不存在");
  if (!server.url) throw new Error("请先填写 MCP 服务地址");

  const tools = await fetchMcpTools(server);
  upsertMcpServer({
    ...server,
    tools,
    updatedAt: new Date().toISOString(),
  });

  return tools;
}

export async function fetchMcpTools(server) {
  const response = await fetch(normalizeMcpUrl(server.url, "/tools"), {
    method: "GET",
    headers: createMcpHeaders(server),
  });

  if (!response.ok) {
    throw new Error(await readMcpError(response, "MCP 工具拉取失败"));
  }

  const data = await response.json();
  return normalizeMcpTools(data);
}

export function normalizeMcpTools(data) {
  const source = Array.isArray(data)
    ? data
    : Array.isArray(data?.tools)
      ? data.tools
      : Array.isArray(data?.data)
        ? data.data
        : [];

  return source.map((tool) => {
    if (typeof tool === "string") {
      return {
        id: tool,
        name: tool,
        description: "",
        inputSchema: {},
      };
    }

    return {
      id: tool.id || tool.name || crypto.randomUUID(),
      name: tool.name || tool.id || "tool",
      description: tool.description || "",
      inputSchema: tool.inputSchema || tool.input_schema || tool.parameters || {},
    };
  });
}

export async function callMcpTool(serverId, toolName, input = {}) {
  const server = getMcpServer(serverId);
  if (!server) throw new Error("MCP 服务不存在");
  if (!server.url) throw new Error("请先填写 MCP 服务地址");

  const response = await fetch(normalizeMcpUrl(server.url, "/call"), {
    method: "POST",
    headers: createMcpHeaders(server),
    body: JSON.stringify({
      tool: toolName,
      name: toolName,
      input,
      arguments: input,
    }),
  });

  if (!response.ok) {
    throw new Error(await readMcpError(response, "MCP 工具调用失败"));
  }

  return response.json();
}

export function resolveSelectedMcpServers(chatConfig = {}) {
  if (!chatConfig.mcpEnabled) return [];

  const selectedIds = new Set(chatConfig.mcpServerIds || []);
  return getEnabledMcpServers().filter((server) => selectedIds.has(server.id));
}

export function buildSelectedMcpPrompt(chatConfig = {}) {
  return buildMcpToolPrompt(resolveSelectedMcpServers(chatConfig));
}

export function buildMcpToolsForOpenAI(chatConfig = {}) {
  return resolveSelectedMcpServers(chatConfig).flatMap((server) => {
    return (server.tools || []).map((tool) => ({
      type: "function",
      function: {
        name: makeOpenAIToolName(server.id, tool.name),
        description: `${server.name}：${tool.description || tool.name}`,
        parameters: tool.inputSchema || {
          type: "object",
          properties: {},
        },
      },
    }));
  });
}

export async function handleMcpToolCalls(toolCalls = [], chatConfig = {}) {
  const selectedServers = resolveSelectedMcpServers(chatConfig);
  const results = [];

  for (const call of toolCalls) {
    const functionName = call.function?.name || call.name || "";
    const matched = parseOpenAIToolName(functionName, selectedServers);
    if (!matched) continue;

    const argsText = call.function?.arguments || call.arguments || "{}";
    const args = safeJsonParse(argsText) || {};

    try {
      const output = await callMcpTool(matched.server.id, matched.tool.name, args);
      results.push({
        toolCallId: call.id || "",
        serverId: matched.server.id,
        serverName: matched.server.name,
        toolName: matched.tool.name,
        output,
        ok: true,
      });
    } catch (error) {
      results.push({
        toolCallId: call.id || "",
        serverId: matched.server.id,
        serverName: matched.server.name,
        toolName: matched.tool.name,
        output: { error: error.message },
        ok: false,
      });
    }
  }

  return results;
}

export function makeOpenAIToolName(serverId, toolName) {
  const safeServer = String(serverId).replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 24);
  const safeTool = String(toolName).replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 36);
  return `mcp_${safeServer}_${safeTool}`;
}

export function parseOpenAIToolName(functionName, servers = getEnabledMcpServers()) {
  if (!functionName.startsWith("mcp_")) return null;

  for (const server of servers) {
    const serverPrefix = `mcp_${String(server.id).replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 24)}_`;
    if (!functionName.startsWith(serverPrefix)) continue;

    const rawTool = functionName.slice(serverPrefix.length);
    const tool = (server.tools || []).find((item) => {
      const safeTool = String(item.name).replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 36);
      return safeTool === rawTool;
    });

    if (tool) return { server, tool };
  }

  return null;
}

export function normalizeMcpUrl(url = "", path = "") {
  const clean = String(url || "").trim().replace(/\/+$/, "");
  if (!clean) throw new Error("MCP 地址为空");

  if (!path) return clean;
  if (clean.endsWith(path)) return clean;

  return `${clean}${path.startsWith("/") ? path : `/${path}`}`;
}

export function createMcpHeaders(server = {}) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (server.apiKey) headers.Authorization = `Bearer ${server.apiKey}`;
  if (server.headers && typeof server.headers === "object") {
    Object.assign(headers, server.headers);
  }

  return headers;
}

export async function readMcpError(response, fallback) {
  try {
    const data = await response.json();
    return data?.error?.message || data?.message || `${fallback}：${response.status}`;
  } catch {
    return `${fallback}：${response.status}`;
  }
}

export function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/* 待后续文件对齐：settings.js 管理 mcpServers，chat.js 用 buildSelectedMcpPrompt/buildMcpToolsForOpenAI/handleMcpToolCalls。 */
