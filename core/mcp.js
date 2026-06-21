import {
  getSettings,
  updateSettings,
  readLocal,
  writeLocal,
  uuid,
  clone
} from './storage.js';

export const MCP_RUNTIME_KEY = 'ai_phone_mcp_runtime_v1';
export const MCP_TOOL_CACHE_KEY = 'ai_phone_mcp_tool_cache_v1';

export const MCP_METHODS = {
  initialize: 'initialize',
  listTools: 'tools/list',
  callTool: 'tools/call'
};

export function normalizeMCPServer(server = {}) {
  return {
    id: server.id || uuid(),
    name: server.name || 'MCP服务器',
    url: server.url || server.endpoint || '',
    group: server.group || '默认分组',
    enabled: server.enabled !== false,
    headers: server.headers && typeof server.headers === 'object' ? server.headers : {},
    tools: Array.isArray(server.tools) ? server.tools.map(normalizeMCPTool) : [],
    createdAt: server.createdAt || new Date().toISOString(),
    updatedAt: server.updatedAt || new Date().toISOString()
  };
}

export function normalizeMCPTool(tool = {}) {
  const inputSchema = tool.inputSchema || tool.input_schema || tool.parameters || {
    type: 'object',
    properties: {}
  };

  return {
    name: tool.name || '',
    title: tool.title || tool.name || '',
    description: tool.description || '',
    inputSchema,
    enabled: tool.enabled !== false
  };
}

export function getMCPServers() {
  const settings = getSettings();
  return Array.isArray(settings.mcpServers)
    ? settings.mcpServers.map(normalizeMCPServer)
    : [];
}

export function getMCPServer(serverId = '') {
  if (!serverId) {
    return null;
  }

  return getMCPServers().find((server) => server.id === serverId) || null;
}

export function saveMCPServer(server = {}) {
  const normalized = normalizeMCPServer({
    ...server,
    updatedAt: new Date().toISOString()
  });

  updateSettings((settings) => {
    const servers = Array.isArray(settings.mcpServers)
      ? settings.mcpServers.map(normalizeMCPServer)
      : [];

    const index = servers.findIndex((item) => item.id === normalized.id);

    if (index >= 0) {
      servers[index] = normalized;
    } else {
      servers.unshift(normalized);
    }

    settings.mcpServers = servers;
    return settings;
  });

  window.dispatchEvent(new CustomEvent('ai-phone-mcp-server-change', {
    detail: getMCPServers()
  }));

  return normalized;
}

export function deleteMCPServer(serverId = '') {
  updateSettings((settings) => {
    settings.mcpServers = (Array.isArray(settings.mcpServers) ? settings.mcpServers : [])
      .filter((server) => server.id !== serverId);

    return settings;
  });

  clearMCPToolCache(serverId);

  window.dispatchEvent(new CustomEvent('ai-phone-mcp-server-change', {
    detail: getMCPServers()
  }));

  return getMCPServers();
}

export function setMCPServerEnabled(serverId = '', enabled = true) {
  const server = getMCPServer(serverId);

  if (!server) {
    return null;
  }

  return saveMCPServer({
    ...server,
    enabled: Boolean(enabled)
  });
}

export function groupMCPServers(servers = getMCPServers()) {
  return servers.reduce((groups, server) => {
    const group = server.group || '默认分组';

    if (!groups[group]) {
      groups[group] = [];
    }

    groups[group].push(server);
    return groups;
  }, {});
}

export function normalizeMCPUrl(url = '') {
  return String(url || '').trim().replace(/\/+$/, '');
}

export function getMCPHeaders(server = {}) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(server.headers || {})
  };
}

export async function callMCP(serverOrId, method = '', params = {}, options = {}) {
  const server = typeof serverOrId === 'string'
    ? getMCPServer(serverOrId)
    : normalizeMCPServer(serverOrId);

  if (!server) {
    throw new Error('找不到MCP服务器');
  }

  const url = normalizeMCPUrl(server.url);

  if (!url) {
    throw new Error('请先填写MCP服务器地址');
  }

  const body = {
    jsonrpc: '2.0',
    id: options.id || uuid(),
    method,
    params: params || {}
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: getMCPHeaders(server),
    body: JSON.stringify(body),
    signal: options.signal
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `MCP请求失败：${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error.message || 'MCP工具调用失败');
  }

  return data.result ?? data;
}

export async function initializeMCPServer(serverOrId, options = {}) {
  const server = typeof serverOrId === 'string'
    ? getMCPServer(serverOrId)
    : normalizeMCPServer(serverOrId);

  if (!server) {
    throw new Error('找不到MCP服务器');
  }

  return callMCP(server, MCP_METHODS.initialize, {
    protocolVersion: options.protocolVersion || '2024-11-05',
    capabilities: options.capabilities || {},
    clientInfo: {
      name: 'AI Phone Desktop',
      version: '1.0.0'
    }
  }, options);
}

export async function fetchMCPTools(serverOrId, options = {}) {
  const server = typeof serverOrId === 'string'
    ? getMCPServer(serverOrId)
    : normalizeMCPServer(serverOrId);

  if (!server) {
    throw new Error('找不到MCP服务器');
  }

  try {
    if (options.initialize !== false) {
      await initializeMCPServer(server, options).catch(() => null);
    }

    const result = await callMCP(server, MCP_METHODS.listTools, {}, options);
    const tools = extractMCPTools(result);

    saveMCPServer({
      ...server,
      tools
    });

    setMCPToolCache(server.id, tools);

    return tools;
  } catch (error) {
    const cached = getMCPToolCache(server.id);

    if (cached.length) {
      return cached;
    }

    throw error;
  }
}

export function extractMCPTools(result = {}) {
  const tools = Array.isArray(result)
    ? result
    : Array.isArray(result.tools)
      ? result.tools
      : Array.isArray(result.data)
        ? result.data
        : [];

  return tools
    .map(normalizeMCPTool)
    .filter((tool) => tool.name);
}

export async function refreshAllMCPTools(options = {}) {
  const servers = getMCPServers().filter((server) => server.enabled);
  const result = {};

  for (const server of servers) {
    try {
      result[server.id] = await fetchMCPTools(server, options);
    } catch {
      result[server.id] = [];
    }
  }

  return result;
}

export function getMCPToolCacheMap() {
  return readLocal(MCP_TOOL_CACHE_KEY, {});
}

export function setMCPToolCacheMap(map = {}) {
  writeLocal(MCP_TOOL_CACHE_KEY, map);
}

export function getMCPToolCache(serverId = '') {
  const map = getMCPToolCacheMap();
  return Array.isArray(map[serverId])
    ? map[serverId].map(normalizeMCPTool)
    : [];
}

export function setMCPToolCache(serverId = '', tools = []) {
  if (!serverId) {
    return [];
  }

  const map = getMCPToolCacheMap();
  map[serverId] = tools.map(normalizeMCPTool);
  setMCPToolCacheMap(map);

  return map[serverId];
}

export function clearMCPToolCache(serverId = '') {
  if (!serverId) {
    setMCPToolCacheMap({});
    return {};
  }

  const map = getMCPToolCacheMap();
  delete map[serverId];
  setMCPToolCacheMap(map);

  return map;
}

export function getAvailableMCPTools(serverId = '') {
  const server = getMCPServer(serverId);

  if (!server) {
    return [];
  }

  const serverTools = Array.isArray(server.tools) ? server.tools.map(normalizeMCPTool) : [];
  const cachedTools = getMCPToolCache(serverId);
  const tools = serverTools.length ? serverTools : cachedTools;

  return tools.filter((tool) => tool.enabled !== false);
}

export function getAllAvailableMCPTools(serverIds = []) {
  const ids = Array.isArray(serverIds) && serverIds.length
    ? serverIds
    : getMCPServers().filter((server) => server.enabled).map((server) => server.id);

  return ids.flatMap((serverId) => {
    const server = getMCPServer(serverId);

    if (!server || server.enabled === false) {
      return [];
    }

    return getAvailableMCPTools(serverId).map((tool) => ({
      ...tool,
      serverId: server.id,
      serverName: server.name,
      serverGroup: server.group || '默认分组'
    }));
  });
}

export function getRuntimeMCPMap() {
  try {
    return JSON.parse(sessionStorage.getItem(MCP_RUNTIME_KEY) || '{}');
  } catch {
    return {};
  }
}

export function setRuntimeMCPMap(map = {}) {
  try {
    sessionStorage.setItem(MCP_RUNTIME_KEY, JSON.stringify(map));
  } catch {}
}

export function getRuntimeMCP(conversationId = '') {
  if (!conversationId) {
    return null;
  }

  return getRuntimeMCPMap()[conversationId] || null;
}

export function setRuntimeMCP(conversationId = '', state = {}) {
  if (!conversationId) {
    return null;
  }

  const map = getRuntimeMCPMap();

  map[conversationId] = {
    enabled: Boolean(state.enabled),
    serverIds: Array.isArray(state.serverIds) ? state.serverIds : [],
    toolNames: Array.isArray(state.toolNames) ? state.toolNames : []
  };

  setRuntimeMCPMap(map);

  window.dispatchEvent(new CustomEvent('ai-phone-mcp-runtime-change', {
    detail: {
      conversationId,
      mcpState: map[conversationId]
    }
  }));

  return map[conversationId];
}

export function clearRuntimeMCP(conversationId = '') {
  const map = getRuntimeMCPMap();
  delete map[conversationId];
  setRuntimeMCPMap(map);
}

export function resolveMCPState(conversationId = '', fallback = {}) {
  const runtime = getRuntimeMCP(conversationId);

  return {
    enabled: Boolean(runtime?.enabled ?? fallback.enabled ?? false),
    serverIds: Array.isArray(runtime?.serverIds)
      ? runtime.serverIds
      : Array.isArray(fallback.serverIds)
        ? fallback.serverIds
        : [],
    toolNames: Array.isArray(runtime?.toolNames)
      ? runtime.toolNames
      : Array.isArray(fallback.toolNames)
        ? fallback.toolNames
        : []
  };
}

export function sanitizeToolName(name = '') {
  return String(name || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
}

export function createOpenAIToolName(serverId = '', toolName = '') {
  return sanitizeToolName(`mcp_${serverId}_${toolName}`);
}

export function parseOpenAIToolName(openAIToolName = '') {
  const name = String(openAIToolName || '');

  if (!name.startsWith('mcp_')) {
    return null;
  }

  const servers = getMCPServers();

  for (const server of servers) {
    const prefix = sanitizeToolName(`mcp_${server.id}_`);

    if (name.startsWith(prefix)) {
      return {
        serverId: server.id,
        toolName: name.slice(prefix.length)
      };
    }
  }

  return null;
}

export function toOpenAITool(tool = {}) {
  const openAIName = createOpenAIToolName(tool.serverId, tool.name);

  return {
    type: 'function',
    function: {
      name: openAIName,
      description: tool.description || tool.title || tool.name,
      parameters: tool.inputSchema || {
        type: 'object',
        properties: {}
      }
    },
    mcp: {
      serverId: tool.serverId,
      serverName: tool.serverName,
      originalName: tool.name
    }
  };
}

export function getSelectedMCPTools(conversationId = '', fallback = {}) {
  const state = resolveMCPState(conversationId, fallback);

  if (!state.enabled) {
    return [];
  }

  const tools = getAllAvailableMCPTools(state.serverIds);

  if (!state.toolNames.length) {
    return tools;
  }

  return tools.filter((tool) => {
    const openAIName = createOpenAIToolName(tool.serverId, tool.name);
    return state.toolNames.includes(tool.name) || state.toolNames.includes(openAIName);
  });
}

export function getOpenAIToolsForConversation(conversationId = '', fallback = {}) {
  return getSelectedMCPTools(conversationId, fallback).map(toOpenAITool);
}

export function buildMCPToolPrompt(conversationId = '', fallback = {}) {
  const tools = getSelectedMCPTools(conversationId, fallback);

  if (!tools.length) {
    return '';
  }

  const text = tools
    .map((tool) => `- ${tool.serverName} / ${tool.title || tool.name}：${tool.description || '可调用工具'}`)
    .join('\n');

  return `当前对话可用的MCP工具如下，只有在确实需要时才调用：\n${text}`;
}

export async function callMCPTool(serverId = '', toolName = '', args = {}, options = {}) {
  const server = getMCPServer(serverId);

  if (!server) {
    throw new Error('找不到MCP服务器');
  }

  const tools = getAvailableMCPTools(serverId);
  const tool = tools.find((item) => {
    return item.name === toolName || sanitizeToolName(item.name) === sanitizeToolName(toolName);
  });

  if (!tool) {
    throw new Error('找不到MCP工具');
  }

  return callMCP(server, MCP_METHODS.callTool, {
    name: tool.name,
    arguments: args || {}
  }, options);
}

export async function callOpenAITool(toolCall = {}, options = {}) {
  const functionName = toolCall.function?.name || toolCall.name || '';
  const parsed = parseOpenAIToolName(functionName);

  if (!parsed) {
    throw new Error('不是MCP工具调用');
  }

  let args = {};

  try {
    args = typeof toolCall.function?.arguments === 'string'
      ? JSON.parse(toolCall.function.arguments || '{}')
      : toolCall.function?.arguments || toolCall.arguments || {};
  } catch {
    args = {};
  }

  const result = await callMCPTool(parsed.serverId, parsed.toolName, args, options);

  return {
    tool_call_id: toolCall.id || '',
    role: 'tool',
    name: functionName,
    content: typeof result === 'string' ? result : JSON.stringify(result)
  };
}

export async function runMCPToolCalls(toolCalls = [], options = {}) {
  const calls = Array.isArray(toolCalls) ? toolCalls : [];
  const results = [];

  for (const toolCall of calls) {
    try {
      results.push(await callOpenAITool(toolCall, options));
    } catch (error) {
      results.push({
        tool_call_id: toolCall.id || '',
        role: 'tool',
        name: toolCall.function?.name || toolCall.name || '',
        content: JSON.stringify({
          error: error.message || '工具调用失败'
        })
      });
    }
  }

  return results;
}

export function createMCPConversationConfig(data = {}) {
  return {
    enabled: Boolean(data.enabled),
    serverIds: Array.isArray(data.serverIds) ? data.serverIds : [],
    toolNames: Array.isArray(data.toolNames) ? data.toolNames : []
  };
}

export function saveMCPConversationConfig(conversationId = '', config = {}) {
  return setRuntimeMCP(conversationId, createMCPConversationConfig(config));
}

export function getMCPConversationConfig(conversationId = '') {
  return resolveMCPState(conversationId);
}

export function groupToolsByServer(tools = []) {
  return tools.reduce((groups, tool) => {
    const groupName = tool.serverGroup || '默认分组';
    const serverName = tool.serverName || 'MCP服务器';
    const key = `${groupName} / ${serverName}`;

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(tool);
    return groups;
  }, {});
}

export function onMCPServerChange(callback) {
  const handler = (event) => callback(event.detail || getMCPServers());
  window.addEventListener('ai-phone-mcp-server-change', handler);

  return () => {
    window.removeEventListener('ai-phone-mcp-server-change', handler);
  };
}

export function onMCPRuntimeChange(callback) {
  const handler = (event) => callback(event.detail);
  window.addEventListener('ai-phone-mcp-runtime-change', handler);

  return () => {
    window.removeEventListener('ai-phone-mcp-runtime-change', handler);
  };
}
