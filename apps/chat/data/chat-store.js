// ============================================
// chat-store.js — 消息APP会话数据层
// 管理会话列表（localStorage）和消息读写（IndexedDB 透传 storage.js）
// 单一真实来源：会话元数据只存这里，不散写到别处
// ============================================

import { getSetting, setSetting } from '../../core/storage.js';
import { STORAGE_KEYS } from '../../core/storage-keys.js';
import { getMessages, saveMessage, deleteMessages, getCurrentCharacter } from '../../core/storage.js';

// ========== 会话默认设置 ==========

function _defaultConversationSettings() {
  return {
    model: '',                    // 空字符串 = 跟随全局默认
    mode: 'bubble',              // 'bubble' | 'conversation'
    ttsEnabled: false,
    ttsVoice: '',
    contextWindow: 16,           // 2/4/8/16/32
    temperature: 0.7,            // 0.0~2.0
    cotEnabled: false,           // 思维链开关
    showTokenUsage: false,
    showContextRange: false,
    githubRepo: '',
    githubBranch: 'main'
  };
}

// ========== 会话 CRUD ==========

// 获取全部会话列表（已排序：置顶在前，然后按更新时间倒序）
function getConversations() {
  const list = getSetting(STORAGE_KEYS.CHAT_CONVERSATIONS) || [];
  return list.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });
}

// 获取单个会话
function getConversation(id) {
  const list = getSetting(STORAGE_KEYS.CHAT_CONVERSATIONS) || [];
  return list.find(c => c.id === id) || null;
}

// 创建会话
function createConversation(data) {
  const list = getSetting(STORAGE_KEYS.CHAT_CONVERSATIONS) || [];
  const now = Date.now();
  const conv = {
    id: data.id || _genId(),
    characterId: data.characterId || getCurrentCharacter() || 'default',
    type: data.type || 'single',           // 'single' | 'group'
    title: data.title || '新对话',
    avatar: data.avatar || '',
    members: data.members || [],
    lastMessage: null,                     // { content, timestamp, role }
    unreadCount: 0,
    pinned: false,
    muted: false,
    draft: '',
    settings: Object.assign(_defaultConversationSettings(), data.settings || {}),
    githubConfig: null,                    // { repo, branch, pat } — PAT 只存本地
    createdAt: now,
    updatedAt: now
  };
  list.push(conv);
  setSetting(STORAGE_KEYS.CHAT_CONVERSATIONS, list);
  return conv;
}

// 更新会话（部分更新）
function updateConversation(id, patch) {
  const list = getSetting(STORAGE_KEYS.CHAT_CONVERSATIONS) || [];
  const idx = list.findIndex(c => c.id === id);
  if (idx === -1) return null;
  list[idx] = Object.assign(list[idx], patch, { updatedAt: Date.now() });
  setSetting(STORAGE_KEYS.CHAT_CONVERSATIONS, list);
  return list[idx];
}

// 删除会话（同时删除其消息）
async function deleteConversation(id) {
  const list = getSetting(STORAGE_KEYS.CHAT_CONVERSATIONS) || [];
  const filtered = list.filter(c => c.id !== id);
  setSetting(STORAGE_KEYS.CHAT_CONVERSATIONS, filtered);
  // 删除该会话的消息
  const conv = list.find(c => c.id === id);
  if (conv) {
    await deleteMessages(conv.characterId, id);
  }
}

// 更新会话的最后消息和未读数
function touchConversation(id, lastMessage, incrementUnread = false) {
  const list = getSetting(STORAGE_KEYS.CHAT_CONVERSATIONS) || [];
  const idx = list.findIndex(c => c.id === id);
  if (idx === -1) return;
  list[idx].lastMessage = lastMessage;
  list[idx].updatedAt = Date.now();
  if (incrementUnread) {
    list[idx].unreadCount = (list[idx].unreadCount || 0) + 1;
  }
  setSetting(STORAGE_KEYS.CHAT_CONVERSATIONS, list);
}

// 标记已读
function markRead(id) {
  updateConversation(id, { unreadCount: 0 });
}

// 置顶/取消置顶
function togglePin(id) {
  const conv = getConversation(id);
  if (!conv) return;
  updateConversation(id, { pinned: !conv.pinned });
}

// 保存草稿
function saveDraft(id, text) {
  updateConversation(id, { draft: text });
}

// ========== 消息操作（透传 storage.js） ==========

async function loadMessages(conversationId, characterId) {
  const cid = characterId || getConversation(conversationId)?.characterId || 'default';
  return getMessages(cid, conversationId);
}

async function appendMessage(message) {
  await saveMessage(message);
  // 更新会话最后消息
  touchConversation(message.conversationId, {
    content: message.content,
    timestamp: message.timestamp,
    role: message.role
  }, message.role === 'ai');
}

// 清空某会话的全部消息（不删除会话本身）
async function clearMessages(conversationId) {
  const conv = getConversation(conversationId);
  const cid = conv?.characterId || 'default';
  await deleteMessages(cid, conversationId);
  // 清空最后消息与未读
  updateConversation(conversationId, { lastMessage: null, unreadCount: 0 });
}

// ========== GitHub 配置 ==========

function getGithubConfig(conversationId) {
  const conv = getConversation(conversationId);
  return conv?.githubConfig || null;
}

function setGithubConfig(conversationId, config) {
  // PAT 只存本地，不上传
  updateConversation(conversationId, { githubConfig: config });
}

// ========== Slash 指令 ==========

function getSlashCommands() {
  const custom = getSetting(STORAGE_KEYS.CHAT_SLASH_COMMANDS) || [];
  const builtin = [
    { cmd: '/clear', desc: '清空上下文' },
    { cmd: '/retry', desc: '重新生成上一条AI回复' },
    { cmd: '/export', desc: '导出当前对话为 Markdown' },
    { cmd: '/github pr', desc: '查看当前仓库 PR 列表' },
    { cmd: '/github merge', desc: '合并指定 PR（输入PR号）' },
    { cmd: '/github push', desc: '触发 AI 推送到 GitHub' },
    { cmd: '/temp 0.7', desc: '快速设置温度' },
    { cmd: '/model', desc: '快速切换模型' }
  ];
  return [...builtin, ...custom];
}

function addSlashCommand(cmd, desc) {
  const custom = getSetting(STORAGE_KEYS.CHAT_SLASH_COMMANDS) || [];
  custom.push({ cmd, desc });
  setSetting(STORAGE_KEYS.CHAT_SLASH_COMMANDS, custom);
}

// ========== 工具函数 ==========

function _genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return 'conv-' + crypto.randomUUID();
  }
  return 'conv-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}

// 时间戳格式化（SKILL.md 规范）
function formatTime(timestamp) {
  const now = new Date();
  const date = new Date(timestamp);
  const diff = now - timestamp;
  const oneDay = 86400000;
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - oneDay;
  const weekStart = todayStart - 6 * oneDay;
  const yearStart = new Date(now.getFullYear(), 0, 1).getTime();

  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  const weekDay = weekdays[date.getDay()];

  if (timestamp >= todayStart) {
    return `${hh}:${mm}`;
  } else if (timestamp >= yesterdayStart) {
    return `昨天 ${hh}:${mm}`;
  } else if (timestamp >= weekStart) {
    return `周${weekDay} ${hh}:${mm}`;
  } else if (timestamp >= yearStart) {
    return `${month}月${day}日`;
  } else {
    return `${date.getFullYear()}年${month}月${day}日`;
  }
}

export {
  getConversations,
  getConversation,
  createConversation,
  updateConversation,
  deleteConversation,
  touchConversation,
  markRead,
  togglePin,
  saveDraft,
  loadMessages,
  appendMessage,
  clearMessages,
  getGithubConfig,
  setGithubConfig,
  getSlashCommands,
  addSlashCommand,
  formatTime,
  _defaultConversationSettings
};
