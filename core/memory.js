// core/memory.js
// AI 长期记忆系统（统一记忆入口）。所有 App 写记忆必须走 recordInteraction。
// 修复原 bug：
//  1) 用 IndexedDB 索引去重
//  2) replaceRelativeDateText 只替换元数据不替换正文
//  3) buildMemoryPrompt 内存缓存 + 批量写
//  4) 按相关度截断
//  5) 失败返回空不污染数据
//  6) 用 Date 对象比较时间戳
//  7) 批量操作用单一事务
// 依赖：core/storage.js, core/storage-keys.js, core/config.js, core/util.js

import { STORES } from './storage-keys.js';
import { getDB, setDB, deleteDB, getAllDB, getByIndexDB, runTransaction, generateId, getNow } from './storage.js';
import { get as getConfig } from './config.js';
import bus from './events.js';

const promptCache = new Map(); // characterId -> { ts, prompt }
const CACHE_TTL = 30_000;

// ════════════════════════════════════════
// 统一记忆写入入口
// ════════════════════════════════════════

/**
 * 统一记忆写入。所有 App 必须走这个，禁止自己 try/catch 静默吞错。
 * 记忆隔离：每条记忆有 scope 字段（'character' | 'group' | 'global'），
 *   - scope='character'：characterId 必填，只对该角色可见，不污染其他角色
 *   - scope='group'：groupId 必填，只对该群聊可见
 *   - scope='global'：全局共享，留作未来「跨角色通用常识」
 * 读取（getMemories / buildMemoryPrompt）按 scope+ownerId 严格过滤，A 角色的记忆绝不会出现在 B 角色的对话里。
 * @param {object} entry
 *   { characterId?, groupId?, scope?, role, source, content, mood, importance, relatedApp, relatedId, timestamp }
 */
export async function recordInteraction(entry) {
  if (!entry || !entry.content) {
    console.warn('[memory] 记忆写入被拒绝：缺少 content');
    return null;
  }
  try {
    const now = getNow();
    // 解析 scope + ownerId：优先 entry.scope；不传时按 characterId / groupId 自动推断
    const scope = entry.scope || (entry.groupId ? 'group' : (entry.characterId ? 'character' : 'global'));
    if (scope === 'character' && !entry.characterId) {
      console.warn('[memory] scope=character 但缺 characterId，拒绝写入');
      return null;
    }
    if (scope === 'group' && !entry.groupId) {
      console.warn('[memory] scope=group 但缺 groupId，拒绝写入');
      return null;
    }
    const record = {
      id: entry.id || generateId('mem'),
      // 兼容旧字段：characterId 仍保留，但读取时按 scope 区分
      characterId: entry.characterId || 'global',
      groupId: entry.groupId || null,
      scope,                                  // 'character' | 'group' | 'global'
      ownerId: scope === 'group' ? entry.groupId
        : (scope === 'character' ? entry.characterId : 'global'),
      role: entry.role || 'assistant',
      source: entry.source || 'manual',
      content: String(entry.content).slice(0, 2000),
      mood: entry.mood || null,
      importance: clampImportance(entry.importance ?? 5),
      relatedApp: entry.relatedApp || null,
      relatedId: entry.relatedId || null,
      timestamp: entry.timestamp || now,
      createdAt: entry.createdAt || now,
      updatedAt: now,
      lastUsedAt: now,
      usedCount: 0
    };
    // 去重：同 scope + 同 ownerId + 同 source + 内容前 40 字相同 -> 视为同一条，更新
    const existing = await findDuplicate(record);
    let saved;
    if (existing) {
      saved = await setDB(STORES.memories, existing.id, {
        ...existing,
        content: record.content,
        mood: record.mood || existing.mood,
        importance: Math.max(existing.importance, record.importance),
        updatedAt: now,
        lastUsedAt: now,
        usedCount: (existing.usedCount || 0) + 1
      });
    } else {
      saved = await setDB(STORES.memories, record.id, record);
    }
    // 失效缓存（按 scope:ownerId 维度）
    promptCache.delete(cacheKeyOf(record));
    promptCache.delete(record.characterId); // 兼容旧缓存键
    // 通知可视化记忆卡片
    bus.emit('memory:written', { memory: saved, characterId: record.characterId, scope: record.scope, ownerId: record.ownerId });
    return saved;
  } catch (e) {
    // 失败返回空不污染数据
    console.warn('[memory] 记忆写入失败', e);
    return null;
  }
}

/** 计算缓存键：scope:ownerId 维度，避免不同角色记忆互相命中缓存 */
function cacheKeyOf(record) {
  return `${record.scope || 'character'}:${record.ownerId || 'global'}`;
}

async function findDuplicate(record) {
  try {
    // 严格按 scope + ownerId 过滤，避免不同角色/群聊的同内容记忆被误判为重复
    const all = await getByIndexDB(STORES.memories, 'characterId', record.characterId);
    const prefix = record.content.slice(0, 40);
    return all.find((m) =>
      (m.scope || 'character') === record.scope &&
      (m.ownerId || m.characterId) === record.ownerId &&
      m.source === record.source &&
      m.content.slice(0, 40) === prefix
    ) || null;
  } catch (e) {
    return null;
  }
}

function clampImportance(v) {
  const n = Number(v);
  if (isNaN(n)) return 5;
  if (n < 1) return 1;
  if (n > 10) return 10;
  return Math.round(n);
}

// ════════════════════════════════════════
// 读取
// ════════════════════════════════════════

export async function getMemories(characterId, filter = {}) {
  try {
    let list = await getByIndexDB(STORES.memories, 'characterId', characterId);
    // 记忆隔离过滤：只返回属于该 characterId 的 character-scope 记忆 + global 记忆
    // 旧数据没有 scope 字段 -> 兼容视为 'character'（不丢历史记忆）
    list = list.filter((m) => {
      const s = m.scope || 'character';
      if (s === 'global') return true; // 全局共享记忆所有角色可见
      if (s === 'character') {
        const owner = m.ownerId || m.characterId;
        return owner === characterId;
      }
      // group scope 的记忆不在单聊里出现（避免群聊隐私泄漏到私聊）
      return false;
    });
    if (filter.source) list = list.filter((m) => m.source === filter.source);
    if (filter.mood) list = list.filter((m) => m.mood === filter.mood);
    if (filter.relatedApp) list = list.filter((m) => m.relatedApp === filter.relatedApp);
    if (filter.timeRange) {
      const { start, end } = filter.timeRange;
      const s = start instanceof Date ? start : new Date(start);
      const e = end instanceof Date ? end : new Date(end);
      // 用 Date 对象比较时间戳（修复原 bug）
      list = list.filter((m) => {
        const t = new Date(m.timestamp);
        if (isNaN(t.getTime())) return false;
        return (!s || t >= s) && (!e || t <= e);
      });
    }
    // 按 importance desc + timestamp desc 排序
    list.sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
    return list;
  } catch (e) {
    console.warn('[memory] 读取失败', e);
    return [];
  }
}

/**
 * 读取群聊的记忆（只返回该群 scope=group 的记忆 + global 记忆）。
 * 群聊记忆不泄漏到私聊，私聊记忆也不污染群聊。
 * @param {string} groupId
 * @param {object} filter 同 getMemories
 */
export async function getGroupMemories(groupId, filter = {}) {
  if (!groupId) return [];
  try {
    const all = await getAllDB(STORES.memories);
    let list = all.filter((m) => {
      const s = m.scope || 'character';
      if (s === 'global') return true;
      if (s === 'group') {
        const owner = m.ownerId || m.groupId;
        return owner === groupId;
      }
      return false; // 私聊记忆不进群聊
    });
    if (filter.source) list = list.filter((m) => m.source === filter.source);
    if (filter.mood) list = list.filter((m) => m.mood === filter.mood);
    if (filter.relatedApp) list = list.filter((m) => m.relatedApp === filter.relatedApp);
    list.sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
    return list;
  } catch (e) {
    console.warn('[memory] 群聊记忆读取失败', e);
    return [];
  }
}

export async function getMemory(id) {
  try { return await getDB(STORES.memories, id); }
  catch (e) { console.warn('[memory] 读取单条失败', e); return null; }
}

export async function updateMemory(id, patch) {
  try {
    const cur = await getDB(STORES.memories, id);
    if (!cur) return null;
    const updated = { ...cur, ...patch, updatedAt: getNow() };
    const saved = await setDB(STORES.memories, id, updated);
    promptCache.delete(cur.characterId);
    if (cur.scope && cur.ownerId) promptCache.delete(`${cur.scope}:${cur.ownerId}`);
    if (cur.scope === 'group' && cur.groupId) promptCache.delete(`group:${cur.groupId}:${JSON.stringify({})}`);
    bus.emit('memory:updated', { memory: saved });
    return saved;
  } catch (e) {
    console.warn('[memory] 更新失败', e);
    return null;
  }
}

export async function deleteMemory(id) {
  try {
    const cur = await getDB(STORES.memories, id);
    const ok = await deleteDB(STORES.memories, id);
    if (cur) {
      promptCache.delete(cur.characterId);
      if (cur.scope && cur.ownerId) promptCache.delete(`${cur.scope}:${cur.ownerId}`);
    }
    bus.emit('memory:deleted', { id, memory: cur });
    return ok;
  } catch (e) {
    console.warn('[memory] 删除失败', e);
    return false;
  }
}

export async function touchMemory(id) {
  try {
    const cur = await getDB(STORES.memories, id);
    if (!cur) return;
    await setDB(STORES.memories, id, {
      ...cur,
      lastUsedAt: getNow(),
      usedCount: (cur.usedCount || 0) + 1
    });
  } catch (e) {
    console.warn('[memory] touch 失败', e);
  }
}

// ════════════════════════════════════════
// AI 读取记忆的统一入口
// ════════════════════════════════════════

/**
 * 构建 AI 的记忆 prompt。支持 context 过滤。
 * @param {string} characterId
 * @param {object} context { source, timeRange, mood, relatedApp, keyword, limit }
 */
export async function buildMemoryPrompt(characterId, context = {}) {
  // 内存缓存
  const cacheKey = `${characterId}:${JSON.stringify(context)}`;
  const cached = promptCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.prompt;

  try {
    let list = await getMemories(characterId, context);
    // 关键词过滤
    if (context.keyword) {
      const kw = String(context.keyword).toLowerCase();
      list = list.filter((m) => m.content.toLowerCase().includes(kw));
    }
    const limit = context.limit || getConfig('ai.contextMessageLimit', 20);
    // 按相关度截断：importance + 近期性
    const now = Date.now();
    const scored = list.map((m) => {
      const ageDays = (now - new Date(m.timestamp).getTime()) / 86400_000;
      const recencyScore = Math.max(0, 1 - ageDays / 30);
      const importanceScore = (m.importance || 5) / 10;
      const useScore = Math.min(1, (m.usedCount || 0) / 5);
      return { m, score: importanceScore * 0.5 + recencyScore * 0.4 + useScore * 0.1 };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit).map((s) => s.m);

    if (!top.length) {
      const prompt = '';
      promptCache.set(cacheKey, { ts: Date.now(), prompt });
      return prompt;
    }

    // 第一人称视角组装
    const lines = top.map((m) => {
      const time = new Date(m.timestamp);
      const timeStr = isNaN(time.getTime()) ? '' : `${time.getMonth() + 1}月${time.getDate()}日`;
      const moodTag = m.mood ? `[心情:${moodLabel(m.mood)}]` : '';
      return `- (${timeStr}${moodTag}) ${m.content}`;
    });
    const prompt = `这是我记得的事：\n${lines.join('\n')}`;
    promptCache.set(cacheKey, { ts: Date.now(), prompt });
    return prompt;
  } catch (e) {
    // 失败返回空不污染数据
    console.warn('[memory] buildMemoryPrompt 失败', e);
    return '';
  }
}

function moodLabel(m) {
  const map = { happy: '开心', sad: '难过', angry: '生气', calm: '平静', excited: '兴奋', anxious: '焦虑' };
  return map[m] || m;
}

/**
 * 构建群聊的记忆 prompt（只取该群 scope=group 的记忆 + global 记忆）。
 * 与 buildMemoryPrompt 对称，但走 getGroupMemories，确保群聊记忆与私聊记忆互不污染。
 * @param {string} groupId
 * @param {object} context
 */
export async function buildGroupMemoryPrompt(groupId, context = {}) {
  if (!groupId) return '';
  const cacheKey = `group:${groupId}:${JSON.stringify(context)}`;
  const cached = promptCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.prompt;
  try {
    let list = await getGroupMemories(groupId, context);
    if (context.keyword) {
      const kw = String(context.keyword).toLowerCase();
      list = list.filter((m) => m.content.toLowerCase().includes(kw));
    }
    const limit = context.limit || getConfig('ai.contextMessageLimit', 20);
    const now = Date.now();
    const scored = list.map((m) => {
      const ageDays = (now - new Date(m.timestamp).getTime()) / 86400_000;
      const recencyScore = Math.max(0, 1 - ageDays / 30);
      const importanceScore = (m.importance || 5) / 10;
      const useScore = Math.min(1, (m.usedCount || 0) / 5);
      return { m, score: importanceScore * 0.5 + recencyScore * 0.4 + useScore * 0.1 };
    });
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit).map((s) => s.m);
    if (!top.length) {
      promptCache.set(cacheKey, { ts: Date.now(), prompt: '' });
      return '';
    }
    const lines = top.map((m) => {
      const time = new Date(m.timestamp);
      const timeStr = isNaN(time.getTime()) ? '' : `${time.getMonth() + 1}月${time.getDate()}日`;
      const moodTag = m.mood ? `[心情:${moodLabel(m.mood)}]` : '';
      return `- (${timeStr}${moodTag}) ${m.content}`;
    });
    const prompt = `这是群里发生过的事：\n${lines.join('\n')}`;
    promptCache.set(cacheKey, { ts: Date.now(), prompt });
    return prompt;
  } catch (e) {
    console.warn('[memory] buildGroupMemoryPrompt 失败', e);
    return '';
  }
}

// ════════════════════════════════════════
// 相对日期文本替换（只替换元数据，不改正文）
// ════════════════════════════════════════

export function replaceRelativeDateText(meta) {
  if (!meta || !meta.timestamp) return meta;
  try {
    const d = new Date(meta.timestamp);
    if (isNaN(d.getTime())) return meta;
    const now = new Date();
    const diffDays = Math.floor((now.setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86400_000);
    // 只动 meta.relativeLabel，不动 meta.content
    let label = '';
    if (diffDays === 0) label = '今天';
    else if (diffDays === 1) label = '昨天';
    else if (diffDays === 2) label = '前天';
    else if (diffDays < 7) label = `${diffDays}天前`;
    else label = `${d.getMonth() + 1}月${d.getDate()}日`;
    return { ...meta, relativeLabel: label };
  } catch (e) {
    return meta;
  }
}

// ════════════════════════════════════════
// 批量操作（单一事务）
// ════════════════════════════════════════

export async function bulkWrite(entries) {
  if (!Array.isArray(entries) || !entries.length) return 0;
  let count = 0;
  try {
    await runTransaction(STORES.memories, 'readwrite', ([store]) => {
      return new Promise((resolve, reject) => {
        let pending = entries.length;
        if (pending === 0) { resolve(); return; }
        entries.forEach((entry) => {
          const record = {
            ...entry,
            id: entry.id || generateId('mem'),
            createdAt: entry.createdAt || getNow(),
            updatedAt: getNow(),
            timestamp: entry.timestamp || getNow()
          };
          const req = store.put(record);
          req.onsuccess = () => { count++; pending--; if (pending === 0) resolve(); };
          req.onerror = () => { pending--; if (pending === 0) resolve(); };
        });
      });
    });
    promptCache.clear();
  } catch (e) {
    console.warn('[memory] 批量写入失败', e);
  }
  return count;
}

export async function getAllMemoriesRaw() {
  try { return await getAllDB(STORES.memories); }
  catch (e) { console.warn('[memory] 全量读取失败', e); return []; }
}

export async function clearMemories(characterId) {
  try {
    if (characterId) {
      const list = await getByIndexDB(STORES.memories, 'characterId', characterId);
      await runTransaction(STORES.memories, 'readwrite', ([store]) => {
        return new Promise((resolve) => {
          let pending = list.length;
          if (pending === 0) { resolve(); return; }
          list.forEach((m) => {
            const req = store.delete(m.id);
            req.onsuccess = () => { pending--; if (pending === 0) resolve(); };
            req.onerror = () => { pending--; if (pending === 0) resolve(); };
          });
        });
      });
      promptCache.delete(characterId);
    } else {
      const { clearStoreDB } = await import('./storage.js');
      await clearStoreDB(STORES.memories);
      promptCache.clear();
    }
    bus.emit('memory:cleared', { characterId });
    return true;
  } catch (e) {
    console.warn('[memory] 清空失败', e);
    return false;
  }
}

export function invalidateCache(characterId) {
  if (characterId) promptCache.delete(characterId);
  else promptCache.clear();
}

/**
 * 清空指定群聊的所有 group-scope 记忆（不动 global 记忆，也不动私聊记忆）。
 * @param {string} groupId
 */
export async function clearGroupMemories(groupId) {
  if (!groupId) return false;
  try {
    const all = await getAllDB(STORES.memories);
    const toDelete = all.filter((m) => {
      const s = m.scope || 'character';
      if (s !== 'group') return false;
      const owner = m.ownerId || m.groupId;
      return owner === groupId;
    });
    await runTransaction(STORES.memories, 'readwrite', ([store]) => {
      return new Promise((resolve) => {
        let pending = toDelete.length;
        if (pending === 0) { resolve(); return; }
        toDelete.forEach((m) => {
          const req = store.delete(m.id);
          req.onsuccess = () => { pending--; if (pending === 0) resolve(); };
          req.onerror = () => { pending--; if (pending === 0) resolve(); };
        });
      });
    });
    // 清群聊相关缓存
    for (const k of promptCache.keys()) {
      if (k.startsWith(`group:${groupId}:`)) promptCache.delete(k);
    }
    bus.emit('memory:cleared', { groupId, scope: 'group' });
    return true;
  } catch (e) {
    console.warn('[memory] 清空群聊记忆失败', e);
    return false;
  }
}
