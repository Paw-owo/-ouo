// ============================================
// ai-client.js — API 请求层
// 只管发请求、收响应、流式推送、分组轮换、错误处理
// 不管上下文拼装（那是 ai-context.js 的事）
// ============================================

import { get } from './config.js';
import { STORAGE_KEYS } from './storage-keys.js';
import events from './events.js';
import { handleFallback } from './ai-fallback.js';

// ========== 内部状态 ==========

let _abortController = null;
let _activeGroupId = null;

// ========== 配置读取 ==========

/**
 * 读取 API 分组配置（直接读 localStorage，不走 config.js 因为它是复杂对象）
 */
function _getGroupsConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.API_GROUPS);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.groups || !Array.isArray(parsed.groups)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * 获取当前可用的 API 配置
 * 分组模式优先，简单模式兜底
 * @returns {null|{mode:'group'|'simple', baseURL, apiKey, model, group?, groups?}}
 */
function _getApiConfig() {
  const groupsConfig = _getGroupsConfig();

  if (groupsConfig && groupsConfig.groups.length > 0) {
    const enabledGroups = groupsConfig.groups.filter(g => g.enabled);
    if (enabledGroups.length === 0) {
      return _getSimpleConfig();
    }

    const activeId = groupsConfig.activeGroupId || _activeGroupId;
    let group = enabledGroups.find(g => g.id === activeId);
    if (!group) {
      enabledGroups.sort((a, b) => (b.priority || 0) - (a.priority || 0));
      group = enabledGroups[0];
    }

    _activeGroupId = group.id;

    return {
      mode: 'group',
      group,
      baseURL: group.baseURL,
      apiKey: group.apiKey,
      model: groupsConfig.defaultModel || group.models[0] || 'gpt-3.5-turbo',
      groups: groupsConfig.groups
    };
  }

  return _getSimpleConfig();
}

/**
 * 简单模式：从 config 读 apiKey / apiBaseUrl / apiModel
 */
function _getSimpleConfig() {
  const apiKey = get('apiKey');
  const apiBaseUrl = get('apiBaseUrl');
  const apiModel = get('apiModel');

  if (apiKey && apiBaseUrl) {
    return {
      mode: 'simple',
      baseURL: apiBaseUrl,
      apiKey,
      model: apiModel || 'gpt-3.5-turbo'
    };
  }

  return null;
}

// ========== URL 拼接 ==========

function _buildURL(baseURL) {
  let url = baseURL.trim().replace(/\/+$/, '');
  if (!url.includes('/v1')) {
    url += '/v1';
  }
  url += '/chat/completions';
  return url;
}

// ========== 错误分类 ==========

function _classifyError(status) {
  if (status === 429) return 'rate-limit';
  if (status >= 500) return 'server-error';
  if (status === 401 || status === 403) return 'server-error';
  if (status >= 400) return 'server-error';
  return 'server-error';
}

// ========== 分组轮换 ==========

function _getNextGroup(groups, currentId) {
  const enabled = groups.filter(g => g.enabled);
  if (enabled.length === 0) return null;

  enabled.sort((a, b) => (b.priority || 0) - (a.priority || 0));

  const currentIdx = enabled.findIndex(g => g.id === currentId);
  if (currentIdx >= 0 && currentIdx < enabled.length - 1) {
    return enabled[currentIdx + 1];
  }

  if (enabled.length === 1 && enabled[0].id === currentId) return null;
  return enabled[0];
}

// ========== 流式处理 ==========

async function _handleStream(response, onChunk) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (!trimmed.startsWith('data:')) continue;

      const dataStr = trimmed.slice(5).trim();
      if (dataStr === '[DONE]') continue;

      try {
        const data = JSON.parse(dataStr);
        const content = data?.choices?.[0]?.delta?.content;
        if (content) {
          fullText += content;
          onChunk(content);
        }
      } catch {
        // 忽略解析失败的行
      }
    }
  }

  if (buffer.trim()) {
    const trimmed = buffer.trim();
    if (trimmed.startsWith('data:')) {
      const dataStr = trimmed.slice(5).trim();
      if (dataStr !== '[DONE]') {
        try {
          const data = JSON.parse(dataStr);
          const content = data?.choices?.[0]?.delta?.content;
          if (content) {
            fullText += content;
            onChunk(content);
          }
        } catch { /* ignore */ }
      }
    }
  }

  return fullText;
}

// ========== 核心接口 ==========

/**
 * 发送聊天请求
 * @param {Array<{role:string, content:string}>} messages
 * @param {Object} [options]
 * @param {Function} [onChunk] - 流式逐字回调
 * @param {Set<string>} [_triedGroupIds] - 内部参数，本轮已尝试的分组ID集合，防无限轮换
 * @returns {Promise<{ok:boolean, content:string, reason?:string, model?:string, groupId?:string}>}
 */
async function sendChat(messages, options = {}, onChunk = null, _triedGroupIds = null) {
  const triedIds = _triedGroupIds || new Set();

  // --- 获取配置 ---
  let config;
  if (options.groupId) {
    const groupsConfig = _getGroupsConfig();
    if (groupsConfig) {
      const group = groupsConfig.groups.find(g => g.id === options.groupId && g.enabled);
      if (group) {
        config = {
          mode: 'group',
          group,
          baseURL: group.baseURL,
          apiKey: group.apiKey,
          model: groupsConfig.defaultModel || group.models[0] || 'gpt-3.5-turbo',
          groups: groupsConfig.groups
        };
        _activeGroupId = group.id;
      }
    }
  }

  if (!config) {
    config = _getApiConfig();
  }

  if (!config) {
    return {
      ok: false,
      content: handleFallback('api_not_configured'),
      reason: 'api_not_configured'
    };
  }

  // --- 合并参数 ---
  const stream = options.stream !== undefined
    ? options.stream
    : (get('streamEnabled') !== null ? get('streamEnabled') : false);
  const timeout = options.timeout || get('timeout') || 30000;
  const temperature = options.temperature !== undefined
    ? options.temperature
    : (get('creativity') !== null ? get('creativity') : 0.8);
  const model = options.model || config.model;

  const externalSignal = options.signal;
  _abortController = externalSignal ? null : new AbortController();
  const signal = externalSignal || _abortController?.signal;

  const timeoutId = setTimeout(() => {
    if (_abortController && !_abortController.signal.aborted) {
      _abortController.abort();
    }
  }, timeout);

  try {
    const url = _buildURL(config.baseURL);
    const useStream = stream && typeof onChunk === 'function';

    const body = { model, messages, temperature };
    if (useStream) body.stream = true;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify(body),
      signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorType = _classifyError(response.status);

      if (config.mode === 'group' && config.groups) {
        triedIds.add(config.group.id);
        const nextGroup = _getNextGroup(config.groups, config.group.id);

        if (nextGroup && !triedIds.has(nextGroup.id)) {
          console.warn(`[AI Client] 分组 "${config.group.id}" 失败(${response.status})，切换到 "${nextGroup.id}"`);
          _activeGroupId = nextGroup.id;
          events.emit('ai:group-switched', {
            from: config.group.id,
            to: nextGroup.id,
            reason: `HTTP ${response.status}`
          });
          return sendChat(messages, { ...options, stream: false, groupId: nextGroup.id }, null, triedIds);
        }
      }

      return {
        ok: false,
        content: handleFallback(errorType),
        reason: errorType
      };
    }

    if (useStream) {
      const fullText = await _handleStream(response, onChunk);
      return {
        ok: true,
        content: fullText,
        model,
        groupId: config.mode === 'group' ? config.group.id : null
      };
    } else {
      let data;
      try {
        data = await response.json();
      } catch {
        return {
          ok: true,
          content: '',
          model,
          groupId: config.mode === 'group' ? config.group.id : null
        };
      }

      const content = data?.choices?.[0]?.message?.content || '';
      return {
        ok: true,
        content,
        model,
        groupId: config.mode === 'group' ? config.group.id : null
      };
    }
  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      if (config.mode === 'group' && config.groups) {
        triedIds.add(config.group.id);
        const nextGroup = _getNextGroup(config.groups, config.group.id);

        if (nextGroup && !triedIds.has(nextGroup.id)) {
          console.warn(`[AI Client] 分组 "${config.group.id}" 超时，切换到 "${nextGroup.id}"`);
          _activeGroupId = nextGroup.id;
          events.emit('ai:group-switched', {
            from: config.group.id,
            to: nextGroup.id,
            reason: 'timeout'
          });
          return sendChat(messages, { ...options, stream: false, groupId: nextGroup.id }, null, triedIds);
        }
      }

      return {
        ok: false,
        content: handleFallback('timeout'),
        reason: 'timeout'
      };
    }

    // 网络错误
    if (config.mode === 'group' && config.groups) {
      triedIds.add(config.group.id);
      const nextGroup = _getNextGroup(config.groups, config.group.id);

      if (nextGroup && !triedIds.has(nextGroup.id)) {
        console.warn(`[AI Client] 分组 "${config.group.id}" 网络错误，切换到 "${nextGroup.id}"`);
        _activeGroupId = nextGroup.id;
        events.emit('ai:group-switched', {
          from: config.group.id,
          to: nextGroup.id,
          reason: 'network'
        });
        return sendChat(messages, { ...options, stream: false, groupId: nextGroup.id }, null, triedIds);
      }
    }

    return {
      ok: false,
      content: handleFallback('network', err),
      reason: 'network'
    };
  } finally {
    if (_abortController && _abortController === (externalSignal ? null : _abortController)) {
      _abortController = null;
    }
  }
}

function abortRequest() {
  if (_abortController && !_abortController.signal.aborted) {
    _abortController.abort();
    _abortController = null;
  }
}

function getActiveGroup() {
  const groupsConfig = _getGroupsConfig();
  if (!groupsConfig) return null;
  const activeId = _activeGroupId || groupsConfig.activeGroupId;
  return groupsConfig.groups.find(g => g.id === activeId) || null;
}

function switchGroup(groupId) {
  const groupsConfig = _getGroupsConfig();
  if (!groupsConfig) return false;
  const group = groupsConfig.groups.find(g => g.id === groupId && g.enabled);
  if (!group) return false;
  _activeGroupId = groupId;
  groupsConfig.activeGroupId = groupId;
  try {
    localStorage.setItem(STORAGE_KEYS.API_GROUPS, JSON.stringify(groupsConfig));
  } catch { /* ignore */ }
  events.emit('ai:group-switched', { to: groupId, reason: 'manual' });
  return true;
}

function getNextAvailableGroup() {
  const groupsConfig = _getGroupsConfig();
  if (!groupsConfig) return null;
  const currentId = _activeGroupId || groupsConfig.activeGroupId;
  return _getNextGroup(groupsConfig.groups, currentId);
}

async function testGroup(groupId) {
  const groupsConfig = _getGroupsConfig();
  if (!groupsConfig) return { ok: false, reason: 'no_config' };

  const group = groupsConfig.groups.find(g => g.id === groupId);
  if (!group) return { ok: false, reason: 'not_found' };
  if (!group.enabled) return { ok: false, reason: 'disabled' };

  const url = _buildURL(group.baseURL);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${group.apiKey}`
      },
      body: JSON.stringify({
        model: group.models[0] || 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        temperature: 0
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      return { ok: true };
    } else {
      return { ok: false, reason: `HTTP ${response.status}` };
    }
  } catch (err) {
    clearTimeout(timeoutId);
    return { ok: false, reason: err.name === 'AbortError' ? 'timeout' : 'network' };
  }
}

export {
  sendChat,
  abortRequest,
  getActiveGroup,
  switchGroup,
  getNextAvailableGroup,
  testGroup
};
