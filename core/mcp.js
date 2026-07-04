// core/mcp.js
// MCP (Model Context Protocol) 客户端。JSON-RPC 2.0 over SSE/HTTP。
// 修复原 bug：
//  1) ensureSession 失败明确报错
//  2) sessions Map 有 LRU/TTL 清理
//  3) extractTextFromContent 支持 image/resource
//  4) 超时分级（init 5s / list 10s / call 60s）
// 依赖：core/config.js, core/util.js, core/storage.js

import { STORES } from './storage-keys.js';
import { getData, setData, getDB, setDB } from './storage.js';

const TIMEOUTS = Object.freeze({
  init: 5_000,
  list: 10_000,
  call: 60_000
});

const SESSION_TTL = 30 * 60 * 1000; // 30 分钟
const SESSION_MAX = 16;

const sessions = new Map(); // serverId -> { id, lastUsed, server }

// ════════════════════════════════════════
// 服务器配置
// ════════════════════════════════════════

export async function getServers() {
  const list = getData('mcp_servers', []);
  // 从 IDB 兜底
  if (!list.length) {
    try {
      const all = await getDB(STORES.mcpSessions, 'servers');
      return all && all.servers ? all.servers : [];
    } catch (e) {
      return [];
    }
  }
  return list;
}

export async function saveServer(server) {
  if (!server || !server.id) throw new Error('服务器缺少 id 嘛');
  const list = await getServers();
  const idx = list.findIndex((s) => s.id === server.id);
  if (idx >= 0) list[idx] = { ...list[idx], ...server };
  else list.push(server);
  setData('mcp_servers', list);
  await setDB(STORES.mcpSessions, 'servers', { id: 'servers', servers: list });
  // 失效 session
  sessions.delete(server.id);
  return server;
}

export async function deleteServer(serverId) {
  const list = await getServers();
  const filtered = list.filter((s) => s.id !== serverId);
  setData('mcp_servers', filtered);
  await setDB(STORES.mcpSessions, 'servers', { id: 'servers', servers: filtered });
  sessions.delete(serverId);
}

// ════════════════════════════════════════
// Session 管理（LRU + TTL）
// ════════════════════════════════════════

function cleanSessions() {
  const now = Date.now();
  // TTL 清理
  for (const [id, entry] of sessions.entries()) {
    if (now - entry.lastUsed > SESSION_TTL) sessions.delete(id);
  }
  // LRU 清理
  if (sessions.size > SESSION_MAX) {
    const sorted = Array.from(sessions.entries()).sort((a, b) => a[1].lastUsed - b[1].lastUsed);
    while (sessions.size > SESSION_MAX && sorted.length) {
      const [id] = sorted.shift();
      sessions.delete(id);
    }
  }
}

async function ensureSession(serverId) {
  cleanSessions();
  const existing = sessions.get(serverId);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing;
  }
  // 修复：ensureSession 失败明确报错
  const servers = await getServers();
  const server = servers.find((s) => s.id === serverId);
  if (!server) throw new Error(`找不到 MCP 服务器：${serverId}`);

  const entry = {
    id: serverId,
    server,
    lastUsed: Date.now(),
    initialized: false,
    tools: [],
    resources: []
  };
  sessions.set(serverId, entry);

  // 初始化（5s 超时）
  try {
    await sendRequest(server, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'popo', version: '1.0.0' }
    }, TIMEOUTS.init);
    entry.initialized = true;
    // 拉取工具列表
    try {
      const listResult = await sendRequest(server, 'tools/list', {}, TIMEOUTS.list);
      entry.tools = (listResult && listResult.tools) || [];
    } catch (e) {
      console.warn('[mcp] tools/list 失败', e);
    }
    // 拉取资源列表
    try {
      const resResult = await sendRequest(server, 'resources/list', {}, TIMEOUTS.list);
      entry.resources = (resResult && resResult.resources) || [];
    } catch (e) {
      console.warn('[mcp] resources/list 失败', e);
    }
  } catch (e) {
    sessions.delete(serverId);
    throw new Error(`MCP 初始化失败：${e.message || e}`);
  }
  return entry;
}

// ════════════════════════════════════════
// JSON-RPC 2.0
// ════════════════════════════════════════

let nextRequestId = 1;

async function sendRequest(server, method, params, timeoutMs) {
  const id = nextRequestId++;
  const payload = { jsonrpc: '2.0', id, method, params: params || {} };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(server.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(server.apiKey ? { Authorization: `Bearer ${server.apiKey}` } : {})
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) {
      const err = new Error(data.error.message || 'MCP 错误');
      err.code = data.error.code;
      throw err;
    }
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

// ════════════════════════════════════════
// 公共 API
// ════════════════════════════════════════

export async function listTools(serverId) {
  const session = await ensureSession(serverId);
  return session.tools;
}

export async function listResources(serverId) {
  const session = await ensureSession(serverId);
  return session.resources;
}

export async function callTool(serverId, toolName, args = {}) {
  const session = await ensureSession(serverId);
  const result = await sendRequest(session.server, 'tools/call', {
    name: toolName,
    arguments: args
  }, TIMEOUTS.call);
  return result;
}

export async function readResource(serverId, resourceUri) {
  const session = await ensureSession(serverId);
  const result = await sendRequest(session.server, 'resources/read', {
    uri: resourceUri
  }, TIMEOUTS.call);
  return result;
}

// 修复：extractTextFromContent 支持 image/resource
export function extractTextFromContent(content) {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === 'string') return item;
      if (!item || typeof item !== 'object') return '';
      switch (item.type) {
        case 'text': return item.text || '';
        case 'image':
          // 图片：返回占位描述，AI 上下文里说明
          return `[图片：${item.mimeType || '未知类型'}]`;
        case 'resource':
          // 资源：返回 URI
          return `[资源：${item.resource?.uri || item.uri || ''}]`;
        default: return '';
      }
    }).join('');
  }
  if (content.text) return content.text;
  return '';
}

// 测试服务器连接
export async function testServer(serverId) {
  try {
    const session = await ensureSession(serverId);
    return { ok: true, tools: session.tools.length, resources: session.resources.length };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function clearSessions() {
  sessions.clear();
}

export { TIMEOUTS as MCP_TIMEOUTS };
