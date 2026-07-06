// ============================================
// ai-memory.js — AI记忆接口层
// 在 storage-manager 的记忆API上包一层AI专用逻辑：
//   - 强制角色隔离（绝不允许无characterId操作）
//   - 按相关性检索记忆供上下文使用
//   - 写记忆时走事件中心通知
//   - 记忆自动提取只做接口预留，不做假实现
// ============================================

import {
  getMemories,
  saveMemory,
  deleteMemory,
  clearMemories,
  getCurrentCharacter
} from '../../core/storage.js';
import { get } from '../../core/config.js';
import { emitMemoryWritten } from './ai-events.js';

// 记忆类型常量，和存储层对齐
export const MEMORY_TYPE = Object.freeze({
  FACT:       'fact',        // 事实：用户告诉我的客观信息
  PREFERENCE: 'preference',  // 偏好：用户喜欢/不喜欢什么
  RELATION:   'relation',    // 关系：用户和别人的关系
  EVENT:      'event',       // 事件：发生过的重要事
  HABIT:      'habit',       // 习惯：用户的行为习惯
  EMOTION:    'emotion'      // 情绪：用户的情绪倾向
});

// ========== 读取 ==========

// 获取当前角色的全部记忆
// 没有characterId时拒绝操作，防止串角色
async function getAllMemories(characterId) {
  _enforceCharacterId(characterId);
  return getMemories(characterId);
}

// 按类型获取记忆
async function getMemoriesByType(characterId, type) {
  _enforceCharacterId(characterId);
  return getMemories(characterId, type);
}

// 按相关性检索记忆（供ai-context.js调用）
// 本版只做关键词匹配 + 时间排序，真正的语义检索留到后续接入embedding
async function getRelevantMemories(characterId, query, limit = 10) {
  _enforceCharacterId(characterId);

  const all = await getMemories(characterId);
  if (!all || all.length === 0) return [];

  const keywords = _extractKeywords(query);
  if (keywords.length === 0) {
    // 没有关键词时返回最近的记忆
    return all.slice(0, limit);
  }

  // 简单关键词评分
  const scored = all.map(mem => {
    const text = `${mem.content || ''} ${mem.summary || ''}`.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) score += 1;
    }
    // 近期记忆加分
    const ageHours = (Date.now() - (mem.timestamp || 0)) / 3600000;
    if (ageHours < 24) score += 0.5;
    else if (ageHours < 168) score += 0.2;

    return { memory: mem, score };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.memory);
}

// ========== 写入 ==========

// AI主动写一条记忆
// 必须带characterId，content不能为空
// 写完后通过事件中心通知
async function addMemory(characterId, { type, content, summary, source = 'ai', importance = 0 }) {
  _enforceCharacterId(characterId);

  if (!content || !content.trim()) {
    console.warn('[AI-Memory] 拒绝写入空记忆');
    return null;
  }

  const memory = {
    id: _genId(),
    characterId,
    type: type || MEMORY_TYPE.FACT,
    content: content.trim(),
    summary: summary || content.slice(0, 40),
    source,
    importance,
    timestamp: Date.now(),
    pinned: false,
    version: 1
  };

  await saveMemory(memory);
  emitMemoryWritten(memory);

  return memory;
}

// 更新已有记忆
async function updateMemory(characterId, memoryId, updates) {
  _enforceCharacterId(characterId);

  const all = await getMemories(characterId);
  const existing = all.find(m => m.id === memoryId);
  if (!existing) {
    console.warn(`[AI-Memory] 记忆 ${memoryId} 不存在`);
    return null;
  }

  const updated = {
    ...existing,
    ...updates,
    id: existing.id,        // id不可改
    characterId,            // characterId不可改
    updatedAt: Date.now(),
    version: (existing.version || 1) + 1
  };

  await saveMemory(updated);
  emitMemoryWritten(updated);

  return updated;
}

// 删除记忆
async function removeMemory(characterId, memoryId) {
  _enforceCharacterId(characterId);

  const all = await getMemories(characterId);
  const existing = all.find(m => m.id === memoryId);
  if (!existing) return false;

  await deleteMemory(memoryId);
  return true;
}

// 清空当前角色全部记忆
async function clearAllMemories(characterId) {
  _enforceCharacterId(characterId);
  await clearMemories(characterId);
}

// ========== 预留接口（本轮不做真实实现） ==========

// 从一段对话中提取记忆
// 本轮只做接口，不实现真实提取逻辑
// 返回 null，后续接入embedding/LLM判断后补全
async function extractFromConversation(characterId, messages) {
  _enforceCharacterId(characterId);

  // 检查是否开启了自动提取
  const autoExtract = get('memoryAutoExtract');
  if (!autoExtract) return null;

  // TODO: 后续接入真正的提取逻辑
  // 本轮只返回null，不假装提取成功
  return null;
}

// 记忆压缩：把旧记忆合并摘要
// 本轮只做接口预留
async function compressMemories(characterId, options = {}) {
  _enforceCharacterId(characterId);

  const autoCompress = get('memoryAutoCompress');
  if (!autoCompress) return null;

  // TODO: 后续接入压缩逻辑
  return null;
}

// ========== 内部工具 ==========

function _enforceCharacterId(characterId) {
  if (!characterId) {
    const current = getCurrentCharacter();
    if (!current) {
      throw new Error('[AI-Memory] 操作记忆必须指定角色（characterId），当前无活跃角色');
    }
  }
}

function _extractKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  // 简单分词：按标点和空格切，过滤掉太短的
  const words = text
    .toLowerCase()
    .split(/[\s,，。.！!？?、；;：:（）()【】\[\]"""''']+/)
    .filter(w => w.length >= 2);
  return [...new Set(words)];
}

function _genId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export {
  getAllMemories,
  getMemoriesByType,
  getRelevantMemories,
  addMemory,
  updateMemory,
  removeMemory,
  clearAllMemories,
  extractFromConversation,
  compressMemories
};
